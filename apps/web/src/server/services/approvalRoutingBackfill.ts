import { createHash, randomUUID } from "node:crypto";
import { prisma, type TransactionClient } from "@ogfi/database";
import {
  APPROVAL_DECISION_CAPABILITY_HASH,
  APPROVAL_DECISION_CAPABILITY_VERSION,
} from "./approvalDecisionCapabilities";
import {
  APPROVAL_ROUTING_MAPPING_HASH,
  APPROVAL_ROUTING_MAPPING_VERSION,
  approvalRoutingDigest,
  getApprovalRoutingPolicy,
  isSupportedApprovalDocumentType,
  type SupportedApprovalDocumentType,
} from "./approvalRoutingRegistry";
import {
  APPROVAL_ROUTING_SCHEMA_VERSION,
  findAnyEligibleApprovalActorForStep,
  type ApprovalRoutingScopeTargetInput,
} from "./approvalRouting";

export const APPROVAL_ROUTING_BACKFILL_MAX_BATCH_SIZE = 100;
export const APPROVAL_ROUTING_BACKFILL_MAX_SECONDS = 50;
export const APPROVAL_ROUTING_BACKFILL_DEFAULT_LEASE_SECONDS = 90;

export const approvalRoutingBackfillMachineOutcomes = [
  "CONTINUE",
  "BLOCKED",
  "RETRYABLE",
  "INCOMPATIBLE",
  "BARRIER_REQUIRED",
  "DRAIN_CLEAN",
  "STOPPED",
] as const;

export type ApprovalRoutingBackfillMachineOutcome =
  (typeof approvalRoutingBackfillMachineOutcomes)[number];

export const approvalRoutingBackfillBlockerCodes = [
  "UNSUPPORTED_PROJECT_REQUIREMENT",
  "UNSUPPORTED_DOCUMENT_TYPE",
  "CURRENT_STEP_ORDER_MISSING",
  "ZERO_STEPS",
  "MULTIPLE_PENDING_STEPS",
  "CURRENT_PENDING_STEP_MISMATCH",
  "ORPHAN_STEP_STRUCTURE",
  "ASSIGNMENT_XOR_INVALID",
  "DELEGATED_STEP_UNSUPPORTED",
  "SOURCE_NOT_FOUND",
  "SOURCE_SCOPE_MISMATCH",
  "SOURCE_STATUS_INVALID",
  "SOURCE_LOCATION_REQUIRED",
  "SOURCE_ACTOR_REQUIRED",
  "SOURCE_APPROVAL_INTENT_REQUIRED",
  "ROUTING_DESCRIPTOR_DRIFT",
  "BACKFILL_AUDIT_MISSING",
  "BACKFILL_AUDIT_DRIFT",
  "CURRENT_ELIGIBLE_ACTOR_MISSING",
  "ROLE_NOTIFICATION_PRESENT",
] as const;

export type ApprovalRoutingBackfillBlockerCode =
  (typeof approvalRoutingBackfillBlockerCodes)[number];

export type ApprovalRoutingBackfillBlocker = {
  approvalInstanceId: string;
  documentType: string;
  code: ApprovalRoutingBackfillBlockerCode;
};

export type ApprovalRoutingBackfillResult = {
  mode: "DRY_RUN" | "APPLY";
  scanned: number;
  eligible: number;
  applied: number;
  alreadyCurrent: number;
  terminal: number;
  blockers: ApprovalRoutingBackfillBlocker[];
  blockerCounts: Partial<Record<ApprovalRoutingBackfillBlockerCode, number>>;
  hasMore: boolean;
  mappingVersion: string;
  mappingHash: string;
  capabilityVersion: string;
  capabilityHash: string;
  outcome: ApprovalRoutingBackfillMachineOutcome;
  runId: string | null;
  passNo: number;
  batchSequence: number | null;
  receiptHash: string | null;
  continuation: ApprovalRoutingDryRunContinuation | null;
  reasonCode: string | null;
};

export type ApprovalRoutingDryRunContinuation = {
  scopeDigest: string;
  passNo: number;
  cursorCreatedAt: string | null;
  cursorId: string | null;
};

type BackfillContract = {
  releaseIdentity: string;
  expectedRoutingSchemaVersion: number;
  expectedMappingVersion: string;
  expectedMappingHash: string;
  expectedCapabilityVersion: string;
  expectedCapabilityHash: string;
};

export type BackfillOptions = {
  apply?: boolean;
  operation?: "START" | "RESUME" | "STOP";
  batchSize?: number;
  maxSeconds?: number;
  tenantId?: string;
  companyId?: string;
  runId?: string;
  requestId?: string;
  idempotencyKey?: string;
  leaseOwner?: string;
  operatorIdentity?: string;
  authorizationReference?: string;
  leaseSeconds?: number;
  contract?: BackfillContract;
  continuation?: ApprovalRoutingDryRunContinuation;
};

type BackfillAuditBinding = {
  runId: string;
  capabilityVersion: string;
  capabilityHash: string;
};

type LockedInstance = {
  id: string;
  tenantId: string;
  companyId: string;
  documentType: string;
  documentId: string;
  status: string;
  currentStepOrder: number | null;
  createdAt: Date;
};

type LockedStep = {
  id: string;
  stepOrder: number;
  assignedUserId: string | null;
  assignedRoleId: string | null;
  delegatedFromUserId: string | null;
  status: string;
  actedAt: Date | null;
  activatedAt: Date | null;
  dueAt: Date | null;
  requiredPermissionId: string | null;
  routingSchemaVersion: number;
  scopeGroupMatchMode: string | null;
};

type ProhibitedActor = { userId: string; reasonCode: string };
type SourceSnapshot = {
  tenantId: string;
  companyId: string;
  status: string;
  dueAt: Date | null;
  transitionAt: Date | null;
  scopeTargetMatchMode: "ANY" | "ALL";
  scopeTargets: ApprovalRoutingScopeTargetInput[];
  prohibitedActors: ProhibitedActor[];
};

type ExpectedDescriptor = SourceSnapshot & {
  requiredPermissionId: string;
  requiredPermissionCode: string;
  sourceDigest: string;
};

class BackfillBlocker extends Error {
  constructor(readonly code: ApprovalRoutingBackfillBlockerCode) {
    super(code);
  }
}

function block(code: ApprovalRoutingBackfillBlockerCode): never {
  throw new BackfillBlocker(code);
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sourceSnapshotDigest(
  instance: Pick<LockedInstance, "documentType" | "documentId">,
  source: SourceSnapshot,
) {
  return approvalRoutingDigest({
    documentType: instance.documentType,
    documentId: instance.documentId,
    tenantId: source.tenantId,
    companyId: source.companyId,
    status: source.status,
    dueAt: source.dueAt,
    transitionAt: source.transitionAt,
    scopeTargetMatchMode: source.scopeTargetMatchMode,
    scopeTargets: source.scopeTargets,
    prohibitedActors: source.prohibitedActors,
  });
}

function uniqueActors(
  entries: ReadonlyArray<readonly [string | null | undefined, string]>,
): ProhibitedActor[] {
  return [...new Map(
    entries
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0]))
      .map(([userId, reasonCode]) => [userId, { userId, reasonCode }]),
  ).values()].sort((left, right) => left.userId.localeCompare(right.userId));
}

function locationScope(companyId: string, locationId: string | null | undefined) {
  if (!locationId) block("SOURCE_LOCATION_REQUIRED");
  return [{ scopeType: "LOCATION" as const, companyId, locationId }];
}

function sourceSnapshot(input: Omit<SourceSnapshot, "scopeTargetMatchMode"> & {
  scopeTargetMatchMode?: "ANY" | "ALL";
}): SourceSnapshot {
  return {
    ...input,
    scopeTargetMatchMode: input.scopeTargetMatchMode ?? "ANY",
    scopeTargets: [...input.scopeTargets].sort((left, right) =>
      `${left.scopeType}:${left.locationId ?? ""}:${left.brandId ?? ""}`.localeCompare(
        `${right.scopeType}:${right.locationId ?? ""}:${right.brandId ?? ""}`,
      ),
    ),
    prohibitedActors: [...input.prohibitedActors].sort((left, right) =>
      left.userId.localeCompare(right.userId),
    ),
  };
}

async function lockMainSource(
  tx: TransactionClient,
  documentType: SupportedApprovalDocumentType,
  documentId: string,
) {
  const tableByType: Record<SupportedApprovalDocumentType, string> = {
    PurchaseRequest: "PurchaseRequest", QuotationRecommendation: "QuotationRecommendation",
    PurchaseOrder: "PurchaseOrder", PurchaseOrderBalanceClosure: "PurchaseOrderBalanceClosure",
    PurchaseOrderAmendment: "PurchaseOrderAmendment", WastageReport: "WastageReport",
    InventoryTransfer: "InventoryTransfer", StockCountAttemptReview: "StockCountAttempt",
    StockAdjustment: "StockAdjustment", FinanceCloseRun: "FinanceCloseRun",
    BudgetRevision: "BudgetRevision", ExpenseRequest: "ExpenseRequest",
    CashAdvanceRequest: "CashAdvanceRequest", PettyCashRequest: "PettyCashRequest",
    PaymentRequest: "PaymentRequest", PaymentRelease: "PaymentRelease",
    EmployeeLeaveRequest: "EmployeeLeaveRequest", EmployeeOvertimeRecord: "EmployeeOvertimeRecord",
    WorkforceSchedule: "WorkforceSchedule", AttendanceImportBatch: "AttendanceImportBatch",
  };
  const table = tableByType[documentType];
  // The table name comes only from the closed registry above; the identifier is
  // bound separately. This lock precedes every source read in the transaction.
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "${table}" WHERE id = $1::uuid FOR SHARE`,
    documentId,
  );
  if (rows.length !== 1) block("SOURCE_NOT_FOUND");
}

function parseFinanceCloseRequester(configSnapshot: unknown) {
  if (!configSnapshot || typeof configSnapshot !== "object" || Array.isArray(configSnapshot)) {
    return null;
  }
  const pending = (configSnapshot as Record<string, unknown>).pendingSensitiveApproval;
  if (!pending || typeof pending !== "object" || Array.isArray(pending)) return null;
  const userId = (pending as Record<string, unknown>).requestedByUserId;
  return typeof userId === "string" ? userId : null;
}

async function loadSourceSnapshot(
  tx: TransactionClient,
  instance: LockedInstance,
  documentType: SupportedApprovalDocumentType,
  lockSource = true,
): Promise<SourceSnapshot> {
  if (lockSource) await lockMainSource(tx, documentType, instance.documentId);
  switch (documentType) {
    case "PurchaseRequest": {
      const row = await tx.purchaseRequest.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.requiredDate, transitionAt: null, scopeTargets: locationScope(row.companyId, row.requestLocationId), prohibitedActors: uniqueActors([[row.requesterUserId, "REQUESTER"]]) });
    }
    case "QuotationRecommendation": {
      const row = await tx.quotationRecommendation.findUnique({ where: { id: instance.documentId }, include: { quotationRequest: { include: { purchaseRequest: true } } } });
      if (!row) block("SOURCE_NOT_FOUND");
      const request = row.quotationRequest.purchaseRequest;
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: request.requiredDate, transitionAt: row.submittedAt, scopeTargets: locationScope(row.companyId, request.requestLocationId), prohibitedActors: uniqueActors([[row.preparedByUserId, "PREPARER"], [request.requesterUserId, "REQUESTER"]]) });
    }
    case "PurchaseOrder": {
      const row = await tx.purchaseOrder.findUnique({ where: { id: instance.documentId }, include: { purchaseRequest: true, quotationRecommendation: true } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.expectedDeliveryDate, transitionAt: null, scopeTargets: locationScope(row.companyId, row.deliveryLocationId), prohibitedActors: uniqueActors([[row.createdByUserId, "CREATOR"], [row.purchaseRequest.requesterUserId, "REQUESTER"], [row.quotationRecommendation.preparedByUserId, "PREPARER"]]) });
    }
    case "PurchaseOrderBalanceClosure":
    case "PurchaseOrderAmendment": {
      const delegate = documentType === "PurchaseOrderBalanceClosure" ? tx.purchaseOrderBalanceClosure : tx.purchaseOrderAmendment;
      const row = await (delegate as typeof tx.purchaseOrderBalanceClosure).findUnique({ where: { id: instance.documentId }, include: { purchaseOrder: { include: { purchaseRequest: true, quotationRecommendation: true } } } });
      if (!row) block("SOURCE_NOT_FOUND");
      const order = row.purchaseOrder;
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: order.expectedDeliveryDate, transitionAt: row.requestedAt, scopeTargets: locationScope(row.companyId, order.deliveryLocationId), prohibitedActors: uniqueActors([[row.requestedByUserId, "REQUESTER"], [order.createdByUserId, "CREATOR"], [order.purchaseRequest.requesterUserId, "REQUESTER"], [order.quotationRecommendation.preparedByUserId, "PREPARER"]]) });
    }
    case "WastageReport": {
      const row = await tx.wastageReport.findUnique({ where: { id: instance.documentId }, include: { inventoryLocation: true } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: null, transitionAt: row.submittedAt, scopeTargets: locationScope(row.companyId, row.inventoryLocation.locationId), prohibitedActors: uniqueActors([[row.reportedByUserId, "REPORTER"]]) });
    }
    case "StockAdjustment": {
      const row = await tx.stockAdjustment.findUnique({ where: { id: instance.documentId }, include: { inventoryLocation: true } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: null, transitionAt: row.submittedAt, scopeTargets: locationScope(row.companyId, row.inventoryLocation.locationId), prohibitedActors: uniqueActors([[row.requestedByUserId, "REQUESTER"]]) });
    }
    case "InventoryTransfer": {
      const row = await tx.inventoryTransfer.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({
        tenantId: row.tenantId,
        companyId: row.companyId,
        status: row.status,
        dueAt: row.requiredByDate,
        transitionAt: row.submittedAt,
        scopeTargetMatchMode: "ALL",
        scopeTargets: [row.sourceLocationId, row.destinationLocationId].sort().map((locationId) => ({ scopeType: "LOCATION", companyId: row.companyId, locationId })),
        prohibitedActors: uniqueActors([[row.requestedByUserId, "REQUESTER"]]),
      });
    }
    case "StockCountAttemptReview": {
      const row = await tx.stockCountAttempt.findUnique({
        where: { id: instance.documentId },
        include: {
          inventoryLocation: true,
          stockCountSession: {
            include: { attempts: { include: { lines: { select: { countedByUserId: true } } } } },
          },
        },
      });
      if (!row || row.stockCountSession.currentAttemptId !== row.id) block("SOURCE_NOT_FOUND");
      const session = row.stockCountSession;
      return sourceSnapshot({
        tenantId: row.tenantId,
        companyId: row.companyId,
        status: row.status,
        dueAt: null,
        transitionAt: row.submittedAt,
        scopeTargets: locationScope(row.companyId, row.inventoryLocation.locationId),
        prohibitedActors: uniqueActors([
          [row.createdByUserId, "CREATOR"],
          [row.assignedToUserId, "ASSIGNED_COUNTER"],
          [session.createdByUserId, "SESSION_CREATOR"],
          [session.assignedToUserId, "SESSION_ASSIGNED_COUNTER"],
          ...session.attempts.flatMap((attempt) => attempt.lines.map((line) => [line.countedByUserId, "COUNTER"] as const)),
        ]),
      });
    }
    case "FinanceCloseRun": {
      const row = await tx.financeCloseRun.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      const requester = parseFinanceCloseRequester(row.configSnapshot);
      if (!requester) block("SOURCE_ACTOR_REQUIRED");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: null, transitionAt: row.createdAt, scopeTargets: [{ scopeType: "COMPANY", companyId: row.companyId }], prohibitedActors: uniqueActors([[row.initiatedByUserId, "INITIATOR"], [requester, "REQUESTER"]]) });
    }
    case "BudgetRevision": {
      const row = await tx.budgetRevision.findUnique({ where: { id: instance.documentId }, include: { budget: { include: { lines: true } } } });
      if (!row) block("SOURCE_NOT_FOUND");
      const locationIds = [...new Set([row.budget.locationId, ...row.budget.lines.map((line) => line.locationId)].filter((id): id is string => Boolean(id)))].sort();
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.effectiveFrom, transitionAt: row.requestedAt, scopeTargetMatchMode: locationIds.length ? "ALL" : "ANY", scopeTargets: locationIds.length ? locationIds.map((locationId) => ({ scopeType: "LOCATION", companyId: row.companyId, locationId })) : [{ scopeType: "COMPANY", companyId: row.companyId }], prohibitedActors: uniqueActors([[row.requestedByUserId, "REQUESTER"]]) });
    }
    case "ExpenseRequest": {
      const row = await tx.expenseRequest.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.requiredByDate, transitionAt: row.submittedAt, scopeTargets: locationScope(row.companyId, row.locationId), prohibitedActors: uniqueActors([[row.requestedByUserId, "REQUESTER"]]) });
    }
    case "CashAdvanceRequest": {
      const row = await tx.cashAdvanceRequest.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.dueDate, transitionAt: row.submittedAt, scopeTargets: locationScope(row.companyId, row.locationId), prohibitedActors: uniqueActors([[row.beneficiaryUserId, "BENEFICIARY"], [row.requestedByUserId, "REQUESTER"]]) });
    }
    case "PettyCashRequest": {
      const row = await tx.pettyCashRequest.findUnique({ where: { id: instance.documentId }, include: { fund: true } });
      if (!row) block("SOURCE_NOT_FOUND");
      if (
        row.approvalInstanceId !== instance.id ||
        row.currentProposedAmountPhp === null ||
        row.approvalProposalVersion < 1
      ) {
        block("SOURCE_APPROVAL_INTENT_REQUIRED");
      }
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.dueBy, transitionAt: row.submittedAt, scopeTargets: locationScope(row.companyId, row.fund.locationId), prohibitedActors: uniqueActors([[row.requestedByUserId, "REQUESTER"]]) });
    }
    case "PaymentRequest": {
      const row = await tx.paymentRequest.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: null, transitionAt: row.submittedAt, scopeTargets: locationScope(row.companyId, row.locationId), prohibitedActors: uniqueActors([[row.requestedByUserId, "REQUESTER"]]) });
    }
    case "PaymentRelease": {
      const row = await tx.paymentRelease.findUnique({ where: { id: instance.documentId }, include: { paymentRequest: true } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.scheduledAt, transitionAt: row.createdAt, scopeTargets: locationScope(row.companyId, row.locationId), prohibitedActors: uniqueActors([[row.paymentRequest.approvedByUserId, "PRIOR_APPROVER"], [row.paymentRequest.requestedByUserId, "REQUESTER"], [row.createdByUserId, "PREPARER"]]) });
    }
    case "EmployeeLeaveRequest": {
      const row = await tx.employeeLeaveRequest.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.startDate, transitionAt: row.submittedAt, scopeTargets: locationScope(row.companyId, row.locationId), prohibitedActors: uniqueActors([[row.requestedByUserId, "REQUESTER"]]) });
    }
    case "EmployeeOvertimeRecord": {
      const row = await tx.employeeOvertimeRecord.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.workedStartAt, transitionAt: null, scopeTargets: locationScope(row.companyId, row.locationId), prohibitedActors: uniqueActors([[row.requestedByUserId, "REQUESTER"]]) });
    }
    case "WorkforceSchedule": {
      const row = await tx.workforceSchedule.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: row.scheduleDate, transitionAt: row.submittedAt, scopeTargets: locationScope(row.companyId, row.locationId), prohibitedActors: uniqueActors([[row.createdByUserId, "CREATOR"], [row.submittedByUserId, "SUBMITTER"]]) });
    }
    case "AttendanceImportBatch": {
      const row = await tx.attendanceImportBatch.findUnique({ where: { id: instance.documentId } });
      if (!row) block("SOURCE_NOT_FOUND");
      if (!row.reviewedByUserId) block("SOURCE_ACTOR_REQUIRED");
      return sourceSnapshot({ tenantId: row.tenantId, companyId: row.companyId, status: row.status, dueAt: null, transitionAt: row.reviewedAt, scopeTargets: locationScope(row.companyId, row.locationId), prohibitedActors: uniqueActors([[row.createdByUserId, "CREATOR"], [row.reviewedByUserId, "REVIEWER"]]) });
    }
  }
}

export type ApprovalRoutingStructureMode =
  | "ACTIONABLE"
  | "BUDGET_REVISION_PRE_REVIEW";

type ApprovalRoutingStructureStep = Pick<
  LockedStep,
  | "stepOrder"
  | "assignedUserId"
  | "assignedRoleId"
  | "delegatedFromUserId"
  | "status"
  | "actedAt"
  | "activatedAt"
  | "dueAt"
> & { routingSchemaVersion?: number };

export function validateApprovalRoutingStructure<
  TStep extends ApprovalRoutingStructureStep,
>(input: {
  documentType: string;
  sourceStatus: string;
  currentStepOrder: number | null;
  steps: TStep[];
}) {
  const instance = input;
  const steps = input.steps;
  if (instance.currentStepOrder === null) block("CURRENT_STEP_ORDER_MISSING");
  if (steps.length === 0) block("ZERO_STEPS");
  if (steps.some((step) => Boolean(step.assignedUserId) === Boolean(step.assignedRoleId))) block("ASSIGNMENT_XOR_INVALID");
  if (steps.some((step) => step.delegatedFromUserId !== null)) block("DELEGATED_STEP_UNSUPPORTED");
  const mode: ApprovalRoutingStructureMode =
    instance.documentType === "BudgetRevision" &&
    instance.sourceStatus === "SUBMITTED"
      ? "BUDGET_REVISION_PRE_REVIEW"
      : "ACTIONABLE";
  const pending = steps.filter((step) => step.status === "PENDING");
  if (mode === "BUDGET_REVISION_PRE_REVIEW") {
    if (pending.length !== 0) block("MULTIPLE_PENDING_STEPS");
    const current = steps.find(
      (step) => step.stepOrder === instance.currentStepOrder,
    );
    if (!current) block("CURRENT_PENDING_STEP_MISMATCH");
    const firstStepOrder = Math.min(...steps.map((step) => step.stepOrder));
    if (
      instance.currentStepOrder !== firstStepOrder ||
      steps.some(
        (step) =>
          step.status !== "WAITING" ||
          step.actedAt !== null ||
          step.activatedAt !== null ||
          step.dueAt !== null,
      )
    ) {
      block("ORPHAN_STEP_STRUCTURE");
    }
    return { current, mode };
  }
  if (pending.length !== 1) block("MULTIPLE_PENDING_STEPS");
  if (pending[0]?.stepOrder !== instance.currentStepOrder) block("CURRENT_PENDING_STEP_MISMATCH");
  const legal = steps.every((step) =>
    step.stepOrder < instance.currentStepOrder!
      ? ["APPROVED", "SKIPPED"].includes(step.status)
      : step.stepOrder === instance.currentStepOrder
        ? step.status === "PENDING"
        : step.status === "WAITING",
  );
  if (!legal) block("ORPHAN_STEP_STRUCTURE");
  if (
    steps.some(
      (step) =>
        (step.routingSchemaVersion ?? APPROVAL_ROUTING_SCHEMA_VERSION) ===
          APPROVAL_ROUTING_SCHEMA_VERSION &&
        ((step.status === "PENDING" && step.activatedAt === null) ||
          (step.status === "WAITING" && step.activatedAt !== null)),
    )
  ) {
    block("ROUTING_DESCRIPTOR_DRIFT");
  }
  return { current: pending[0]!, mode };
}

export function validateApprovalRoutingActivationAuditState(input: {
  mode: ApprovalRoutingStructureMode;
  activationAuditPresent: boolean;
}) {
  if (
    input.mode === "BUDGET_REVISION_PRE_REVIEW" &&
    input.activationAuditPresent
  ) {
    block("ROUTING_DESCRIPTOR_DRIFT");
  }
}

async function expectedDescriptor(
  tx: TransactionClient,
  instance: LockedInstance,
  lockSource = true,
): Promise<ExpectedDescriptor> {
  if (instance.documentType === "PROJECT_REQUIREMENT") block("UNSUPPORTED_PROJECT_REQUIREMENT");
  if (!isSupportedApprovalDocumentType(instance.documentType)) block("UNSUPPORTED_DOCUMENT_TYPE");
  const policy = getApprovalRoutingPolicy(instance.documentType);
  const source = await loadSourceSnapshot(tx, instance, instance.documentType, lockSource);
  if (source.tenantId !== instance.tenantId || source.companyId !== instance.companyId) block("SOURCE_SCOPE_MISMATCH");
  if (!policy.allowedSourceStatuses.includes(source.status)) block("SOURCE_STATUS_INVALID");
  const permission = await tx.permission.findFirst({ where: { code: policy.requiredPermissionCode, OR: [{ tenantId: null }, { tenantId: instance.tenantId }] }, select: { id: true } });
  if (!permission) block("SOURCE_NOT_FOUND");
  const sourceDigest = sourceSnapshotDigest(instance, source);
  return { ...source, requiredPermissionId: permission.id, requiredPermissionCode: policy.requiredPermissionCode, sourceDigest };
}

function sameDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

function expectedStepDueAt(input: {
  instance: LockedInstance;
  step: LockedStep;
  expected: ExpectedDescriptor;
  mode: ApprovalRoutingStructureMode;
}) {
  if (input.mode === "BUDGET_REVISION_PRE_REVIEW") return null;
  if (input.instance.documentType !== "BudgetRevision") {
    return input.expected.dueAt;
  }
  return input.step.stepOrder <= input.instance.currentStepOrder!
    ? input.expected.dueAt
    : null;
}

async function verifyStepDescriptor(tx: TransactionClient, input: {
  instance: LockedInstance;
  step: LockedStep;
  expected: ExpectedDescriptor;
  mode: ApprovalRoutingStructureMode;
}) {
  const { step, expected } = input;
  const dueAt = expectedStepDueAt(input);
  if (step.routingSchemaVersion !== APPROVAL_ROUTING_SCHEMA_VERSION || step.requiredPermissionId !== expected.requiredPermissionId || step.scopeGroupMatchMode !== "ALL" || !sameDate(step.dueAt, dueAt) || (step.status === "WAITING" && step.activatedAt !== null) || (step.status === "PENDING" && step.activatedAt === null)) block("ROUTING_DESCRIPTOR_DRIFT");
  const groups = await tx.approvalInstanceStepScopeGroup.findMany({ where: { approvalInstanceStepId: step.id }, include: { targets: true }, orderBy: { groupOrder: "asc" } });
  const actualTargets = groups[0]?.targets.map((target) => ({ scopeType: target.scopeType, companyId: target.companyId, brandId: target.brandId, locationId: target.locationId })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))) ?? [];
  const expectedTargets = expected.scopeTargets.map((target) => ({ scopeType: target.scopeType, companyId: target.companyId, brandId: target.brandId ?? null, locationId: target.locationId ?? null })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (groups.length !== 1 || groups[0]?.groupOrder !== 1 || groups[0]?.targetMatchMode !== expected.scopeTargetMatchMode || approvalRoutingDigest(actualTargets) !== approvalRoutingDigest(expectedTargets)) block("ROUTING_DESCRIPTOR_DRIFT");
  const actors = await tx.approvalInstanceStepProhibitedActor.findMany({ where: { approvalInstanceStepId: step.id }, select: { userId: true, reasonCode: true }, orderBy: { userId: "asc" } });
  if (approvalRoutingDigest(actors) !== approvalRoutingDigest(expected.prohibitedActors)) block("ROUTING_DESCRIPTOR_DRIFT");
}

function activationProvenance(instance: LockedInstance, steps: LockedStep[], current: LockedStep, source: SourceSnapshot) {
  const priorEvidence = steps.filter((step) => step.stepOrder < current.stepOrder && step.actedAt).sort((left, right) => right.stepOrder - left.stepOrder)[0]?.actedAt;
  if (priorEvidence) return { activatedAt: priorEvidence, provenance: "PREVIOUS_STEP_ACTED_AT", confidence: "HIGH" } as const;
  if (source.transitionAt) return { activatedAt: source.transitionAt, provenance: "AUTHORITATIVE_SOURCE_TRANSITION", confidence: "HIGH" } as const;
  return { activatedAt: instance.createdAt, provenance: "INSTANCE_CREATED_AT_FALLBACK", confidence: "LOW" } as const;
}

async function findAnyEligibleActorForExpectedDescriptor(
  tx: TransactionClient,
  input: {
    instance: LockedInstance;
    step: LockedStep;
    expected: ExpectedDescriptor;
  },
) {
  const targets = JSON.stringify(input.expected.scopeTargets.map((target) => ({
    scopeType: target.scopeType,
    companyId: target.companyId,
    brandId: target.brandId ?? null,
    locationId: target.locationId ?? null,
  })));
  const prohibited = input.expected.prohibitedActors.map((actor) => actor.userId);
  const rows = await tx.$queryRawUnsafe<Array<{ userId: string }>>(
    `WITH target AS (
       SELECT *
         FROM jsonb_to_recordset($7::jsonb) AS value(
           "scopeType" text,
           "companyId" uuid,
           "brandId" uuid,
           "locationId" uuid
         )
     )
     SELECT actor.id AS "userId"
       FROM "User" actor
      WHERE actor."tenantId" = $1::uuid
        AND actor.status = 'ACTIVE'::"RecordStatus"
        AND NOT (actor.id = ANY($6::uuid[]))
        AND (
          ($3::uuid IS NOT NULL AND actor.id = $3::uuid AND EXISTS (
            SELECT 1
              FROM "UserRoleAssignment" assignment
              JOIN "Role" role ON role.id = assignment."roleId"
              JOIN "RolePermission" grant_row ON grant_row."roleId" = role.id
              JOIN "Permission" permission ON permission.id = grant_row."permissionId"
             WHERE assignment."userId" = actor.id
               AND assignment.status = 'ACTIVE'::"RecordStatus"
               AND assignment."startsAt" <= CURRENT_TIMESTAMP
               AND (assignment."endsAt" IS NULL OR assignment."endsAt" > CURRENT_TIMESTAMP)
               AND role.status = 'ACTIVE'::"RecordStatus"
               AND (role."tenantId" IS NULL OR role."tenantId" = $1::uuid)
               AND permission.code = $5
               AND (permission."tenantId" IS NULL OR permission."tenantId" = $1::uuid)
          ))
          OR ($3::uuid IS NULL AND $4::uuid IS NOT NULL AND EXISTS (
            SELECT 1
              FROM "UserRoleAssignment" assignment
              JOIN "Role" role ON role.id = assignment."roleId"
              JOIN "RolePermission" grant_row ON grant_row."roleId" = role.id
              JOIN "Permission" permission ON permission.id = grant_row."permissionId"
             WHERE assignment."userId" = actor.id
               AND assignment."roleId" = $4::uuid
               AND assignment.status = 'ACTIVE'::"RecordStatus"
               AND assignment."startsAt" <= CURRENT_TIMESTAMP
               AND (assignment."endsAt" IS NULL OR assignment."endsAt" > CURRENT_TIMESTAMP)
               AND role.status = 'ACTIVE'::"RecordStatus"
               AND (role."tenantId" IS NULL OR role."tenantId" = $1::uuid)
               AND permission.code = $5
               AND (permission."tenantId" IS NULL OR permission."tenantId" = $1::uuid)
          ))
        )
        AND NOT EXISTS (
          SELECT 1 FROM target
           WHERE NOT EXISTS (
             SELECT 1 FROM "Company" company
              WHERE company.id = target."companyId"
                AND company."tenantId" = $1::uuid
                AND company.id = $2::uuid
                AND company.status = 'ACTIVE'::"RecordStatus"
           )
              OR (target."brandId" IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "Brand" brand
                 WHERE brand.id = target."brandId"
                   AND brand."companyId" = $2::uuid
                   AND brand.status = 'ACTIVE'::"RecordStatus"
              ))
              OR (target."locationId" IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "Location" location
                 WHERE location.id = target."locationId"
                   AND location."companyId" = $2::uuid
                   AND location.status = 'ACTIVE'::"RecordStatus"
              ))
        )
        AND CASE $8
          WHEN 'ANY' THEN EXISTS (
            SELECT 1 FROM target
             WHERE EXISTS (
               SELECT 1 FROM "UserScopeAssignment" scope_assignment
                WHERE scope_assignment."userId" = actor.id
                  AND scope_assignment.status = 'ACTIVE'::"RecordStatus"
                  AND scope_assignment."startsAt" <= CURRENT_TIMESTAMP
                  AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > CURRENT_TIMESTAMP)
                  AND scope_assignment."accessLevel" IN ('APPROVE'::"AccessLevel", 'MANAGE'::"AccessLevel")
                  AND ((scope_assignment."scopeType" = 'COMPANY'::"ScopeType" AND scope_assignment."scopeId" = target."companyId")
                    OR (target."brandId" IS NOT NULL AND scope_assignment."scopeType" = 'BRAND'::"ScopeType" AND scope_assignment."scopeId" = target."brandId")
                    OR (target."locationId" IS NOT NULL AND scope_assignment."scopeType" = 'LOCATION'::"ScopeType" AND scope_assignment."scopeId" = target."locationId"))
             )
          )
          WHEN 'ALL' THEN NOT EXISTS (
            SELECT 1 FROM target
             WHERE NOT EXISTS (
               SELECT 1 FROM "UserScopeAssignment" scope_assignment
                WHERE scope_assignment."userId" = actor.id
                  AND scope_assignment.status = 'ACTIVE'::"RecordStatus"
                  AND scope_assignment."startsAt" <= CURRENT_TIMESTAMP
                  AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > CURRENT_TIMESTAMP)
                  AND scope_assignment."accessLevel" IN ('APPROVE'::"AccessLevel", 'MANAGE'::"AccessLevel")
                  AND ((scope_assignment."scopeType" = 'COMPANY'::"ScopeType" AND scope_assignment."scopeId" = target."companyId")
                    OR (target."brandId" IS NOT NULL AND scope_assignment."scopeType" = 'BRAND'::"ScopeType" AND scope_assignment."scopeId" = target."brandId")
                    OR (target."locationId" IS NOT NULL AND scope_assignment."scopeType" = 'LOCATION'::"ScopeType" AND scope_assignment."scopeId" = target."locationId"))
             )
          )
          ELSE false
        END
      ORDER BY actor.id
      LIMIT 1`,
    input.instance.tenantId,
    input.instance.companyId,
    input.step.assignedUserId,
    input.step.assignedRoleId,
    input.expected.requiredPermissionCode,
    prohibited,
    targets,
    input.expected.scopeTargetMatchMode,
  );
  return rows[0] ?? null;
}

async function inspectOrApplyInstance(
  tx: TransactionClient,
  instanceId: string,
  apply: boolean,
  auditBinding?: BackfillAuditBinding,
) {
  const instance = apply
    ? (await tx.$queryRaw<LockedInstance[]>`SELECT id, "tenantId", "companyId", "documentType", "documentId", status::text, "currentStepOrder", "createdAt" FROM "ApprovalInstance" WHERE id = ${instanceId}::uuid FOR UPDATE`)[0]
    : await tx.approvalInstance.findUnique({
        where: { id: instanceId },
        select: {
          id: true,
          tenantId: true,
          companyId: true,
          documentType: true,
          documentId: true,
          status: true,
          currentStepOrder: true,
          createdAt: true,
        },
      });
  if (!instance || instance.status !== "PENDING") return { state: "TERMINAL" as const };
  const steps = apply
    ? await tx.$queryRaw<LockedStep[]>`SELECT id, "stepOrder", "assignedUserId", "assignedRoleId", "delegatedFromUserId", status::text, "actedAt", "activatedAt", "dueAt", "requiredPermissionId", "routingSchemaVersion", "scopeGroupMatchMode"::text FROM "ApprovalInstanceStep" WHERE "approvalInstanceId" = ${instance.id}::uuid ORDER BY "stepOrder" FOR UPDATE`
    : (await tx.approvalInstanceStep.findMany({
        where: { approvalInstanceId: instance.id },
        select: {
          id: true,
          stepOrder: true,
          assignedUserId: true,
          assignedRoleId: true,
          delegatedFromUserId: true,
          status: true,
          actedAt: true,
          activatedAt: true,
          dueAt: true,
          requiredPermissionId: true,
          routingSchemaVersion: true,
          scopeGroupMatchMode: true,
        },
        orderBy: { stepOrder: "asc" },
      })) as LockedStep[];
  const expected = await expectedDescriptor(tx, instance, !apply ? false : true);
  const { current, mode } = validateApprovalRoutingStructure({
    documentType: instance.documentType,
    sourceStatus: expected.status,
    currentStepOrder: instance.currentStepOrder,
    steps,
  });
  const activationAudits = await tx.auditEvent.findMany({
    where: {
      tenantId: instance.tenantId,
      entityType: "ApprovalInstanceStep",
      entityId:
        mode === "BUDGET_REVISION_PRE_REVIEW"
          ? { in: steps.map((step) => step.id) }
          : current.id,
      eventType: "approval.step_activated",
    },
    orderBy: { occurredAt: "asc" },
    take: 2,
    select: {
      occurredAt: true,
      beforeData: true,
      afterData: true,
      metadata: true,
    },
  });
  const existingActivation = activationAudits[0] ?? null;
  validateApprovalRoutingActivationAuditState({
    mode,
    activationAuditPresent: Boolean(existingActivation),
  });
  const derived = mode === "ACTIONABLE"
    ? existingActivation
      ? { activatedAt: existingActivation.occurredAt, provenance: "EXISTING_ACTIVATION_AUDIT", confidence: "HIGH" as const }
      : activationProvenance(instance, steps, current, expected)
    : null;
  const allCurrent = steps.every((step) => step.routingSchemaVersion === APPROVAL_ROUTING_SCHEMA_VERSION);
  if (allCurrent) {
    for (const step of steps) {
      await verifyStepDescriptor(tx, { instance, step, expected, mode });
    }
  } else if (steps.some((step) => step.routingSchemaVersion !== 0)) {
    block("ROUTING_DESCRIPTOR_DRIFT");
  } else if (!apply && mode === "ACTIONABLE") {
    const eligible = await findAnyEligibleActorForExpectedDescriptor(tx, {
      instance,
      step: current,
      expected,
    });
    if (!eligible) block("CURRENT_ELIGIBLE_ACTOR_MISSING");
  } else if (apply) {
    if (!auditBinding) throw new Error("APPROVAL_ROUTING_BACKFILL_AUDIT_BINDING_REQUIRED");
    const priorBackfillAuditCount = await tx.auditEvent.count({
      where: {
        tenantId: instance.tenantId,
        entityType: "ApprovalInstance",
        entityId: instance.id,
        eventType: "approval.step_routing_backfilled",
      },
    });
    if (priorBackfillAuditCount !== 0) block("BACKFILL_AUDIT_DRIFT");
    const existingChildren = await Promise.all(steps.map(async (step) => ({
      groups: await tx.approvalInstanceStepScopeGroup.count({ where: { approvalInstanceStepId: step.id } }),
      actors: await tx.approvalInstanceStepProhibitedActor.count({ where: { approvalInstanceStepId: step.id } }),
    })));
    if (existingChildren.some((children) => children.groups !== 0 || children.actors !== 0)) {
      block("ROUTING_DESCRIPTOR_DRIFT");
    }
    for (const step of steps) {
      await tx.approvalInstanceStepScopeGroup.create({ data: { approvalInstanceStepId: step.id, groupOrder: 1, targetMatchMode: expected.scopeTargetMatchMode, targets: { create: expected.scopeTargets.map((target) => ({ scopeType: target.scopeType, companyId: target.companyId, brandId: target.brandId ?? null, locationId: target.locationId ?? null })) } } });
      if (expected.prohibitedActors.length) await tx.approvalInstanceStepProhibitedActor.createMany({ data: expected.prohibitedActors.map((actor) => ({ approvalInstanceStepId: step.id, ...actor })) });
      const updated = await tx.approvalInstanceStep.updateMany({ where: { id: step.id, routingSchemaVersion: 0, status: step.status as never }, data: { requiredPermissionId: expected.requiredPermissionId, routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION, scopeGroupMatchMode: "ALL", activatedAt: step.status === "PENDING" ? derived!.activatedAt : null, dueAt: expectedStepDueAt({ instance, step, expected, mode }) } });
      if (updated.count !== 1) throw new Error("APPROVAL_ROUTING_BACKFILL_CAS_FAILED");
    }
    if (mode === "ACTIONABLE") {
      const eligible = await findAnyEligibleApprovalActorForStep(tx, {
        tenantId: instance.tenantId,
        companyId: instance.companyId,
        approvalInstanceStepId: current.id,
      });
      if (!eligible) block("CURRENT_ELIGIBLE_ACTOR_MISSING");
    }
    await tx.auditEvent.create({ data: { tenantId: instance.tenantId, companyId: instance.companyId, actorUserId: null, eventType: "approval.step_routing_backfilled", entityType: "ApprovalInstance", entityId: instance.id, occurredAt: new Date(), afterData: { routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION }, metadata: { source: "approval-routing-backfill-job", mappingVersion: APPROVAL_ROUTING_MAPPING_VERSION, mappingHash: APPROVAL_ROUTING_MAPPING_HASH, capabilityVersion: auditBinding.capabilityVersion, capabilityHash: auditBinding.capabilityHash, backfillRunId: auditBinding.runId, sourceDigest: expected.sourceDigest, currentStepId: current.id, lifecycleMode: mode, ...(derived ? { derivedActivatedAt: derived.activatedAt.toISOString(), activatedAtProvenance: derived.provenance, activatedAtConfidence: derived.confidence } : {}) } } });
  }
  if (allCurrent) {
    const backfillAudit = await tx.auditEvent.findMany({ where: { tenantId: instance.tenantId, entityType: "ApprovalInstance", entityId: instance.id, eventType: "approval.step_routing_backfilled" }, select: { metadata: true } });
    if (backfillAudit.length > 1) block("BACKFILL_AUDIT_DRIFT");
    if (backfillAudit.length === 1) {
      const metadata = backfillAudit[0]?.metadata as Record<string, unknown> | null;
      const activationMetadata = jsonRecord(existingActivation?.metadata);
      const activationBefore = jsonRecord(existingActivation?.beforeData);
      const activationAfter = jsonRecord(existingActivation?.afterData);
      const predecessorDigest = sourceSnapshotDigest(instance, {
        tenantId: expected.tenantId,
        companyId: expected.companyId,
        status: "SUBMITTED",
        dueAt: expected.dueAt,
        transitionAt: expected.transitionAt,
        scopeTargetMatchMode: expected.scopeTargetMatchMode,
        scopeTargets: expected.scopeTargets,
        prohibitedActors: expected.prohibitedActors,
      });
      const authorizedBudgetReviewPromotion =
        instance.documentType === "BudgetRevision" &&
        expected.status === "UNDER_REVIEW" &&
        metadata?.lifecycleMode === "BUDGET_REVISION_PRE_REVIEW" &&
        metadata?.currentStepId === current.id &&
        metadata?.sourceDigest === predecessorDigest &&
        mode === "ACTIONABLE" &&
        activationAudits.length === 1 &&
        existingActivation !== null &&
        current.activatedAt?.getTime() === existingActivation.occurredAt.getTime() &&
        activationBefore?.status === "WAITING" &&
        activationBefore?.activatedAt === null &&
        activationAfter?.status === "PENDING" &&
        activationAfter?.activatedAt === existingActivation.occurredAt.toISOString() &&
        activationMetadata?.source === "budget_revision.commitment_fit_review" &&
        activationMetadata?.approvalInstanceId === instance.id &&
        activationMetadata?.approvalInstanceStepId === current.id &&
        activationMetadata?.budgetRevisionId === instance.documentId &&
        activationMetadata?.stepOrder === current.stepOrder &&
        activationMetadata?.fromStatus === "WAITING" &&
        activationMetadata?.routingSchemaVersion === APPROVAL_ROUTING_SCHEMA_VERSION;
      const hasDurableBinding =
        metadata?.capabilityVersion !== undefined ||
        metadata?.capabilityHash !== undefined ||
        metadata?.backfillRunId !== undefined;
      if (hasDurableBinding) {
        if (
          metadata?.capabilityVersion !== APPROVAL_DECISION_CAPABILITY_VERSION ||
          metadata?.capabilityHash !== APPROVAL_DECISION_CAPABILITY_HASH ||
          typeof metadata?.backfillRunId !== "string" ||
          metadata.backfillRunId.length === 0
        ) {
          block("BACKFILL_AUDIT_DRIFT");
        }
        const boundRuns = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id
             FROM "ApprovalRoutingBackfillRun"
            WHERE id = $1::uuid
              AND "tenantId" = $2::uuid
              AND "companyId" = $3::uuid
              AND "routingSchemaVersion" = $4
              AND "routingMappingVersion" = $5
              AND "routingMappingHash" = $6
              AND "capabilityVersion" = $7
              AND "capabilityHash" = $8`,
          metadata.backfillRunId,
          instance.tenantId,
          instance.companyId,
          APPROVAL_ROUTING_SCHEMA_VERSION,
          APPROVAL_ROUTING_MAPPING_VERSION,
          APPROVAL_ROUTING_MAPPING_HASH,
          APPROVAL_DECISION_CAPABILITY_VERSION,
          APPROVAL_DECISION_CAPABILITY_HASH,
        );
        if (boundRuns.length !== 1) block("BACKFILL_AUDIT_DRIFT");
      }
      if (
        metadata?.mappingVersion !== APPROVAL_ROUTING_MAPPING_VERSION ||
        metadata?.mappingHash !== APPROVAL_ROUTING_MAPPING_HASH ||
        (metadata?.sourceDigest !== expected.sourceDigest &&
          !authorizedBudgetReviewPromotion)
      ) {
        block("BACKFILL_AUDIT_DRIFT");
      }
    } else if (mode === "ACTIONABLE" && !existingActivation) block("BACKFILL_AUDIT_MISSING");
  }
  if (allCurrent && mode === "ACTIONABLE") {
    const eligible = await findAnyEligibleApprovalActorForStep(tx, {
      tenantId: instance.tenantId,
      companyId: instance.companyId,
      approvalInstanceStepId: current.id,
    });
    if (!eligible) block("CURRENT_ELIGIBLE_ACTOR_MISSING");
  }
  if (current.assignedRoleId) {
    const roleNotifications = await tx.notification.count({
      where: {
        tenantId: instance.tenantId,
        companyId: instance.companyId,
        recipientBasis: "assigned_role",
        metadata: { path: ["approvalInstanceId"], equals: instance.id },
      },
    });
    if (roleNotifications > 0) block("ROLE_NOTIFICATION_PRESENT");
  }
  return { state: allCurrent ? "CURRENT" as const : apply ? "APPLIED" as const : "ELIGIBLE" as const, instance, current };
}

function boundedInteger(value: number | undefined, fallback: number, max: number, code: string) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1 || result > max) {
    throw new BackfillIncompatible(code);
  }
  return result;
}

export async function scanApprovalRoutingKeysetPages<T extends { id: string }>(input: {
  batchSize: number;
  deadlineMs: number;
  loadPage: (afterId: string | undefined, batchSize: number) => Promise<T[]>;
  visit: (row: T) => Promise<void>;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  let afterId: string | undefined;
  let scanned = 0;
  while (now() < input.deadlineMs) {
    const rows = await input.loadPage(afterId, input.batchSize);
    if (rows.length === 0) return { scanned, hasMore: false, lastId: afterId ?? null };
    for (const row of rows) {
      if (now() >= input.deadlineMs) {
        return { scanned, hasMore: true, lastId: afterId ?? null };
      }
      await input.visit(row);
      afterId = row.id;
      scanned += 1;
    }
    if (rows.length < input.batchSize) {
      return { scanned, hasMore: false, lastId: afterId ?? null };
    }
  }
  return { scanned, hasMore: true, lastId: afterId ?? null };
}

type DurableRunRow = {
  id: string;
  tenantId: string;
  companyId: string;
  status: string;
  routingSchemaVersion: number;
  routingMappingVersion: string;
  routingMappingHash: string;
  capabilityVersion: string;
  capabilityHash: string;
  releaseIdentity: string;
  startRequestId: string;
  idempotencyKey: string;
  requestHash: string;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  fencingToken: bigint;
  currentPass: number;
  lastCursorCreatedAt: Date | null;
  lastCursorId: string | null;
  nextBatchSequence: number;
  previousReceiptHash: string | null;
};

type CandidateRow = {
  id: string;
  documentType: string;
  createdAt: Date;
};

type DurableBatchRow = {
  id: string;
  requestId: string;
  passNo: number;
  batchSequence: number;
  scannedCount: bigint;
  eligibleCount: bigint;
  appliedCount: bigint;
  alreadyCurrentCount: bigint;
  terminalCount: bigint;
  blockerCount: bigint;
  hasMore: boolean;
  outcome: string;
  receiptHash: string;
};

class BackfillIncompatible extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class BackfillRetryable extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function requireNonEmpty(value: string | undefined, code: string, maximum = 128) {
  if (!value || value.trim() !== value || value.length > maximum) {
    throw new BackfillIncompatible(code);
  }
  return value;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string | undefined, code: string) {
  const result = requireNonEmpty(value, code, 36);
  if (!UUID_PATTERN.test(result)) {
    throw new BackfillIncompatible(code);
  }
  return result;
}

function scopeDigest(tenantId: string | null, companyId: string | null) {
  return approvalRoutingDigest({
    domain: "ogfi:approval-routing-backfill:dry-run:v1",
    tenantId,
    companyId,
    routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION,
    mappingVersion: APPROVAL_ROUTING_MAPPING_VERSION,
    mappingHash: APPROVAL_ROUTING_MAPPING_HASH,
    capabilityVersion: APPROVAL_DECISION_CAPABILITY_VERSION,
    capabilityHash: APPROVAL_DECISION_CAPABILITY_HASH,
  });
}

function validateRuntimeContract(contract: BackfillContract | undefined) {
  if (!contract) throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_CONTRACT_REQUIRED");
  requireNonEmpty(contract.releaseIdentity, "APPROVAL_ROUTING_BACKFILL_RELEASE_IDENTITY_REQUIRED", 128);
  if (
    contract.expectedRoutingSchemaVersion !== APPROVAL_ROUTING_SCHEMA_VERSION ||
    contract.expectedMappingVersion !== APPROVAL_ROUTING_MAPPING_VERSION ||
    contract.expectedMappingHash !== APPROVAL_ROUTING_MAPPING_HASH ||
    contract.expectedCapabilityVersion !== APPROVAL_DECISION_CAPABILITY_VERSION ||
    contract.expectedCapabilityHash !== APPROVAL_DECISION_CAPABILITY_HASH
  ) {
    throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_CONTRACT_MISMATCH");
  }
  return contract;
}

function validateStopContract(contract: BackfillContract | undefined) {
  if (!contract) throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_CONTRACT_REQUIRED");
  requireNonEmpty(contract.releaseIdentity, "APPROVAL_ROUTING_BACKFILL_RELEASE_IDENTITY_REQUIRED", 128);
  requireNonEmpty(contract.expectedMappingVersion, "APPROVAL_ROUTING_BACKFILL_MAPPING_VERSION_REQUIRED", 64);
  requireNonEmpty(contract.expectedCapabilityVersion, "APPROVAL_ROUTING_BACKFILL_CAPABILITY_VERSION_REQUIRED", 64);
  if (
    !Number.isInteger(contract.expectedRoutingSchemaVersion) ||
    contract.expectedRoutingSchemaVersion < 1 ||
    !/^[0-9a-f]{64}$/.test(contract.expectedMappingHash) ||
    !/^[0-9a-f]{64}$/.test(contract.expectedCapabilityHash)
  ) {
    throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_CONTRACT_INVALID");
  }
  return contract;
}

function runRequestHash(input: {
  runId: string;
  tenantId: string;
  companyId: string;
  startRequestId: string;
  idempotencyKey: string;
  operatorIdentity: string;
  authorizationReference: string;
  contract: BackfillContract;
}) {
  return approvalRoutingDigest({
    domain: "ogfi:approval-routing-backfill:start:v1",
    ...input,
  });
}

function receiptHash(input: Record<string, unknown>) {
  return createHash("sha256")
    .update(JSON.stringify({ domain: "ogfi:approval-routing-backfill:batch:v1", ...input }))
    .digest("hex");
}

function baseResult(mode: "DRY_RUN" | "APPLY"): ApprovalRoutingBackfillResult {
  return {
    mode,
    scanned: 0,
    eligible: 0,
    applied: 0,
    alreadyCurrent: 0,
    terminal: 0,
    blockers: [],
    blockerCounts: {},
    hasMore: false,
    mappingVersion: APPROVAL_ROUTING_MAPPING_VERSION,
    mappingHash: APPROVAL_ROUTING_MAPPING_HASH,
    capabilityVersion: APPROVAL_DECISION_CAPABILITY_VERSION,
    capabilityHash: APPROVAL_DECISION_CAPABILITY_HASH,
    outcome: "CONTINUE",
    runId: null,
    passNo: 1,
    batchSequence: null,
    receiptHash: null,
    continuation: null,
    reasonCode: null,
  };
}

function classifyRetryable(error: unknown) {
  const record = jsonRecord(error);
  const code = typeof record?.code === "string" ? record.code : null;
  const meta = jsonRecord(record?.meta);
  const databaseCode = typeof meta?.code === "string" ? meta.code : null;
  return (
    code === "P2034" ||
    code === "P1001" ||
    code === "P1002" ||
    code === "P1017" ||
    code === "P2024" ||
    databaseCode === "40001" ||
    databaseCode === "40P01" ||
    databaseCode === "55P03" ||
    databaseCode === "08000" ||
    databaseCode === "08003" ||
    databaseCode === "08006"
  );
}

function incompatibleResult(runId: string | null, reasonCode: string, passNo = 1) {
  return {
    ...baseResult("APPLY"),
    outcome: "INCOMPATIBLE" as const,
    runId,
    passNo,
    reasonCode,
  };
}

function retryableResult(runId: string | null, reasonCode: string, passNo = 1) {
  return {
    ...baseResult("APPLY"),
    outcome: "RETRYABLE" as const,
    runId,
    passNo,
    reasonCode,
  };
}

async function runReadOnlyApprovalRoutingBackfill(
  options: BackfillOptions,
  batchSize: number,
): Promise<ApprovalRoutingBackfillResult> {
  if (!options.tenantId || !options.companyId) {
    return {
      ...incompatibleResult(null, "APPROVAL_ROUTING_BACKFILL_SCOPE_PAIR_REQUIRED"),
      mode: "DRY_RUN",
    };
  }
  if (
    (options.tenantId && !UUID_PATTERN.test(options.tenantId)) ||
    (options.companyId && !UUID_PATTERN.test(options.companyId)) ||
    (options.continuation?.cursorId && !UUID_PATTERN.test(options.continuation.cursorId))
  ) {
    return { ...incompatibleResult(null, "APPROVAL_ROUTING_BACKFILL_SCOPE_INVALID"), mode: "DRY_RUN" };
  }
  const digest = scopeDigest(options.tenantId, options.companyId);
  const continuation = options.continuation;
  if (
    continuation &&
    (continuation.scopeDigest !== digest ||
      ![1, 2].includes(continuation.passNo) ||
      Boolean(continuation.cursorCreatedAt) !== Boolean(continuation.cursorId))
  ) {
    return { ...incompatibleResult(null, "APPROVAL_ROUTING_BACKFILL_CONTINUATION_MISMATCH"), mode: "DRY_RUN" };
  }
  const cursorCreatedAt = continuation?.cursorCreatedAt
    ? new Date(continuation.cursorCreatedAt)
    : null;
  if (cursorCreatedAt && Number.isNaN(cursorCreatedAt.getTime())) {
    return { ...incompatibleResult(null, "APPROVAL_ROUTING_BACKFILL_CURSOR_INVALID"), mode: "DRY_RUN" };
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    const rows = await tx.$queryRawUnsafe<CandidateRow[]>(
      `SELECT id, "documentType", "createdAt"
         FROM "ApprovalInstance"
        WHERE status = 'PENDING'::"ApprovalStatus"
          AND "tenantId" = $1::uuid
          AND "companyId" = $2::uuid
          AND ($3::timestamp IS NULL OR ("createdAt", id) > ($3::timestamp, $4::uuid))
        ORDER BY "createdAt" ASC, id ASC
        LIMIT $5`,
      options.tenantId,
      options.companyId,
      cursorCreatedAt,
      continuation?.cursorId ?? null,
      batchSize + 1,
    );
    const page = rows.slice(0, batchSize);
    const result = baseResult("DRY_RUN");
    result.passNo = continuation?.passNo ?? 1;
    for (const row of page) {
      try {
        const inspected = await inspectOrApplyInstance(tx, row.id, false);
        result.scanned += 1;
        if (inspected.state === "CURRENT") result.alreadyCurrent += 1;
        else if (inspected.state === "ELIGIBLE") result.eligible += 1;
        else if (inspected.state === "TERMINAL") result.terminal += 1;
      } catch (error) {
        if (!(error instanceof BackfillBlocker)) throw error;
        result.scanned += 1;
        result.blockers.push({ approvalInstanceId: row.id, documentType: row.documentType, code: error.code });
        result.blockerCounts[error.code] = (result.blockerCounts[error.code] ?? 0) + 1;
      }
    }
    const last = page.at(-1);
    result.hasMore = rows.length > batchSize;
    result.outcome = result.blockers.length > 0 ? "BLOCKED" : "CONTINUE";
    result.continuation = result.hasMore && last
      ? {
          scopeDigest: digest,
          passNo: result.passNo,
          cursorCreatedAt: last.createdAt.toISOString(),
          cursorId: last.id,
        }
      : null;
    return result;
  }, { isolationLevel: "Serializable", timeout: 55_000 });
}

function assertRunContract(run: DurableRunRow, input: {
  tenantId: string;
  companyId: string;
  contract: BackfillContract;
}) {
  if (
    run.tenantId !== input.tenantId ||
    run.companyId !== input.companyId ||
    run.routingSchemaVersion !== input.contract.expectedRoutingSchemaVersion ||
    run.routingMappingVersion !== input.contract.expectedMappingVersion ||
    run.routingMappingHash !== input.contract.expectedMappingHash ||
    run.capabilityVersion !== input.contract.expectedCapabilityVersion ||
    run.capabilityHash !== input.contract.expectedCapabilityHash ||
    run.releaseIdentity !== input.contract.releaseIdentity
  ) {
    throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_RUN_CONTRACT_MISMATCH");
  }
}

async function acquireScopedAdvisoryLock(
  tx: TransactionClient,
  tenantId: string,
  companyId: string,
) {
  const rows = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
    "SELECT pg_try_advisory_xact_lock(hashtextextended('ogfi:approval-routing-backfill:' || $1::text || ':' || $2::text, 0)) AS acquired",
    tenantId,
    companyId,
  );
  if (!rows[0]?.acquired) throw new BackfillRetryable("APPROVAL_ROUTING_BACKFILL_LEASE_CONTENDED");
}

async function loadReplayBatch(
  tx: TransactionClient,
  runId: string,
  requestId: string,
) {
  return (await tx.$queryRawUnsafe<DurableBatchRow[]>(
    `SELECT id, "requestId", "passNo", "batchSequence", "scannedCount", "eligibleCount",
            "appliedCount", "alreadyCurrentCount", "terminalCount", "blockerCount",
            "hasMore", outcome, "receiptHash"
       FROM "ApprovalRoutingBackfillBatch"
      WHERE "runId" = $1::uuid AND "requestId" = $2`,
    runId,
    requestId,
  ))[0] ?? null;
}

async function replayResult(
  tx: TransactionClient,
  run: DurableRunRow,
  batch: DurableBatchRow,
): Promise<ApprovalRoutingBackfillResult> {
  const blockers = await tx.$queryRawUnsafe<ApprovalRoutingBackfillBlocker[]>(
    `SELECT "approvalInstanceId", "documentFamily" AS "documentType", "blockerCode" AS code
       FROM "ApprovalRoutingBackfillBlockerObservation"
      WHERE "batchId" = $1::uuid
      ORDER BY "approvalInstanceId", "blockerCode"`,
    batch.id,
  );
  const result = baseResult("APPLY");
  result.runId = run.id;
  result.passNo = batch.passNo;
  result.batchSequence = batch.batchSequence;
  result.scanned = Number(batch.scannedCount);
  result.eligible = Number(batch.eligibleCount);
  result.applied = Number(batch.appliedCount);
  result.alreadyCurrent = Number(batch.alreadyCurrentCount);
  result.terminal = Number(batch.terminalCount);
  result.blockers = blockers;
  for (const blocker of blockers) {
    result.blockerCounts[blocker.code] = (result.blockerCounts[blocker.code] ?? 0) + 1;
  }
  result.hasMore = batch.hasMore;
  result.outcome = batch.outcome as "CONTINUE" | "BLOCKED" | "BARRIER_REQUIRED";
  result.receiptHash = batch.receiptHash;
  return result;
}

async function processDurablePage(input: {
  tx: TransactionClient;
  run: DurableRunRow;
  requestId: string;
  leaseOwner: string;
  operatorIdentity: string;
  authorizationReference: string;
  leaseSeconds: number;
  batchSize: number;
  deadlineMs: number;
}): Promise<ApprovalRoutingBackfillResult> {
  const { tx, run } = input;
  const candidates = await tx.$queryRawUnsafe<CandidateRow[]>(
    `SELECT id, "documentType", "createdAt"
       FROM "ApprovalInstance"
      WHERE "tenantId" = $1::uuid
        AND "companyId" = $2::uuid
        AND status = 'PENDING'::"ApprovalStatus"
        AND ($3::timestamp IS NULL OR ("createdAt", id) > ($3::timestamp, $4::uuid))
      ORDER BY "createdAt" ASC, id ASC
      LIMIT $5
      FOR UPDATE`,
    run.tenantId,
    run.companyId,
    run.lastCursorCreatedAt,
    run.lastCursorId,
    input.batchSize + 1,
  );
  const page = candidates.slice(0, input.batchSize);
  const hasNextInPass = candidates.length > input.batchSize;
  const blockers: ApprovalRoutingBackfillBlocker[] = [];
  let eligible = 0;
  let applied = 0;
  let alreadyCurrent = 0;
  let terminal = 0;

  for (const row of page) {
    if (Date.now() >= input.deadlineMs) {
      throw new BackfillRetryable("APPROVAL_ROUTING_BACKFILL_PAGE_DEADLINE");
    }
    await tx.$executeRawUnsafe("SAVEPOINT approval_routing_backfill_instance");
    try {
      const inspected = await inspectOrApplyInstance(tx, row.id, true, {
        runId: run.id,
        capabilityVersion: run.capabilityVersion,
        capabilityHash: run.capabilityHash,
      });
      if (inspected.state === "CURRENT") alreadyCurrent += 1;
      else if (inspected.state === "APPLIED") {
        eligible += 1;
        applied += 1;
      } else if (inspected.state === "TERMINAL") terminal += 1;
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT approval_routing_backfill_instance");
    } catch (error) {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT approval_routing_backfill_instance");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT approval_routing_backfill_instance");
      if (!(error instanceof BackfillBlocker)) throw error;
      blockers.push({ approvalInstanceId: row.id, documentType: row.documentType, code: error.code });
    }
  }

  const last = page.at(-1);
  const batchId = randomUUID();
  const passComplete = !hasNextInPass;
  const observedRows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count
       FROM "ApprovalRoutingBackfillBlockerObservation"
      WHERE "runId" = $1::uuid AND "passNo" = $2`,
    run.id,
    run.currentPass,
  );
  const unresolved = Number(observedRows[0]?.count ?? 0n) + blockers.length;
  const advancePass = passComplete && (run.currentPass === 1 || unresolved > 0);
  const nextPass = advancePass ? run.currentPass + 1 : run.currentPass;
  const nextCursorCreatedAt = advancePass ? null : last?.createdAt ?? run.lastCursorCreatedAt;
  const nextCursorId = advancePass ? null : last?.id ?? run.lastCursorId;
  const hasMore = hasNextInPass || advancePass;
  const outcome: "CONTINUE" | "BLOCKED" | "BARRIER_REQUIRED" =
    unresolved > 0 ? "BLOCKED" : hasMore ? "CONTINUE" : "BARRIER_REQUIRED";
  const nextStatus = outcome === "BLOCKED"
    ? "BLOCKED"
    : outcome === "BARRIER_REQUIRED"
      ? "BARRIER_REQUIRED"
      : "ACTIVE";
  const receipt = receiptHash({
    runId: run.id,
    requestId: input.requestId,
    operatorIdentity: input.operatorIdentity,
    authorizationReference: input.authorizationReference,
    tenantId: run.tenantId,
    companyId: run.companyId,
    releaseIdentity: run.releaseIdentity,
    routingSchemaVersion: run.routingSchemaVersion,
    routingMappingVersion: run.routingMappingVersion,
    routingMappingHash: run.routingMappingHash,
    capabilityVersion: run.capabilityVersion,
    capabilityHash: run.capabilityHash,
    fencingToken: run.fencingToken.toString(),
    passNo: run.currentPass,
    batchSequence: run.nextBatchSequence,
    cursorFromCreatedAt: run.lastCursorCreatedAt?.toISOString() ?? null,
    cursorFromId: run.lastCursorId,
    cursorToCreatedAt: last?.createdAt.toISOString() ?? run.lastCursorCreatedAt?.toISOString() ?? null,
    cursorToId: last?.id ?? run.lastCursorId,
    scanned: page.length,
    eligible,
    applied,
    alreadyCurrent,
    terminal,
    blockers: blockers.map((row) => [row.approvalInstanceId, row.documentType, row.code]).sort(),
    hasMore,
    outcome,
    previousReceiptHash: run.previousReceiptHash,
  });

  await tx.$executeRawUnsafe(
    `INSERT INTO "ApprovalRoutingBackfillBatch"
       (id, "tenantId", "companyId", "runId", "requestId", "fencingToken", "passNo", "batchSequence",
        "cursorFromCreatedAt", "cursorFromId", "cursorToCreatedAt", "cursorToId",
        "scannedCount", "eligibleCount", "appliedCount", "alreadyCurrentCount", "terminalCount", "blockerCount",
        "hasMore", outcome, "previousReceiptHash", "receiptHash", "committedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8,
             $9::timestamp, $10::uuid, $11::timestamp, $12::uuid,
             $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, clock_timestamp())`,
    batchId, run.tenantId, run.companyId, run.id, input.requestId, run.fencingToken,
    run.currentPass, run.nextBatchSequence, run.lastCursorCreatedAt, run.lastCursorId,
    last?.createdAt ?? run.lastCursorCreatedAt, last?.id ?? run.lastCursorId,
    page.length, eligible, applied, alreadyCurrent, terminal, blockers.length,
    hasMore, outcome, run.previousReceiptHash, receipt,
  );

  for (const blocker of blockers) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "ApprovalRoutingBackfillBlockerObservation"
         (id, "tenantId", "companyId", "runId", "batchId", "passNo", "approvalInstanceId", "documentFamily", "blockerCode", "observedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::uuid, $8, $9, clock_timestamp())
       ON CONFLICT ("runId", "passNo", "approvalInstanceId", "blockerCode") DO NOTHING`,
      randomUUID(), run.tenantId, run.companyId, run.id, batchId, run.currentPass,
      blocker.approvalInstanceId, blocker.documentType, blocker.code,
    );
  }

  const updated = await tx.$executeRawUnsafe(
    `UPDATE "ApprovalRoutingBackfillRun"
        SET status = $1,
            "currentPass" = $2,
            "lastCursorCreatedAt" = $3::timestamp,
            "lastCursorId" = $4::uuid,
            "nextBatchSequence" = "nextBatchSequence" + 1,
            "previousReceiptHash" = $5,
            "scannedCount" = "scannedCount" + $6,
            "eligibleCount" = "eligibleCount" + $7,
            "appliedCount" = "appliedCount" + $8,
            "alreadyCurrentCount" = "alreadyCurrentCount" + $9,
            "terminalCount" = "terminalCount" + $10,
            "blockerCount" = "blockerCount" + $11,
            "leaseExpiresAt" = clock_timestamp() + ($12 * INTERVAL '1 second'),
            "updatedAt" = clock_timestamp()
      WHERE id = $13::uuid
        AND "tenantId" = $14::uuid
        AND "companyId" = $15::uuid
        AND "leaseOwner" = $16
        AND "fencingToken" = $17
        AND "leaseExpiresAt" > clock_timestamp()`,
    nextStatus, nextPass, nextCursorCreatedAt, nextCursorId, receipt,
    page.length, eligible, applied, alreadyCurrent, terminal, blockers.length,
    input.leaseSeconds, run.id, run.tenantId, run.companyId, input.leaseOwner,
    run.fencingToken,
  );
  if (updated !== 1) throw new BackfillRetryable("APPROVAL_ROUTING_BACKFILL_FENCE_LOST");

  const result = baseResult("APPLY");
  result.runId = run.id;
  result.passNo = run.currentPass;
  result.batchSequence = run.nextBatchSequence;
  result.scanned = page.length;
  result.eligible = eligible;
  result.applied = applied;
  result.alreadyCurrent = alreadyCurrent;
  result.terminal = terminal;
  result.blockers = blockers;
  for (const blocker of blockers) {
    result.blockerCounts[blocker.code] = (result.blockerCounts[blocker.code] ?? 0) + 1;
  }
  result.hasMore = hasMore;
  result.outcome = outcome;
  result.receiptHash = receipt;
  return result;
}

async function runDurableApprovalRoutingBackfill(
  options: BackfillOptions,
  batchSize: number,
  maxSeconds: number,
  leaseSeconds: number,
): Promise<ApprovalRoutingBackfillResult> {
  const tenantId = requireUuid(options.tenantId, "APPROVAL_ROUTING_BACKFILL_TENANT_REQUIRED");
  const companyId = requireUuid(options.companyId, "APPROVAL_ROUTING_BACKFILL_COMPANY_REQUIRED");
  const operation = options.operation;
  if (process.env.APPROVAL_ROUTING_V1_ENABLED === "true") {
    throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_REQUIRES_ROUTING_DISABLED");
  }
  if (operation !== "START" && operation !== "RESUME" && operation !== "STOP") {
    throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_OPERATION_REQUIRED");
  }
  const runId = requireUuid(options.runId, "APPROVAL_ROUTING_BACKFILL_RUN_ID_REQUIRED");
  const requestId = requireNonEmpty(options.requestId, "APPROVAL_ROUTING_BACKFILL_REQUEST_ID_REQUIRED");
  const leaseOwner = requireNonEmpty(options.leaseOwner, "APPROVAL_ROUTING_BACKFILL_LEASE_OWNER_REQUIRED");
  const operatorIdentity = requireNonEmpty(options.operatorIdentity, "APPROVAL_ROUTING_BACKFILL_OPERATOR_IDENTITY_REQUIRED");
  const authorizationReference = requireNonEmpty(options.authorizationReference, "APPROVAL_ROUTING_BACKFILL_AUTHORIZATION_REFERENCE_REQUIRED");
  const contract = operation === "STOP"
    ? validateStopContract(options.contract)
    : validateRuntimeContract(options.contract);
  const idempotencyKey = operation === "START"
    ? requireNonEmpty(options.idempotencyKey, "APPROVAL_ROUTING_BACKFILL_IDEMPOTENCY_KEY_REQUIRED")
    : options.idempotencyKey;
  const deadlineMs = Date.now() + maxSeconds * 1000;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    await acquireScopedAdvisoryLock(tx, tenantId, companyId);
    let run: DurableRunRow | null = null;
    if (operation === "START") {
      const scopedCompany = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT company.id
           FROM "Company" company
           JOIN "Tenant" tenant ON tenant.id = company."tenantId"
          WHERE company.id = $1::uuid
            AND company."tenantId" = $2::uuid
          LIMIT 1`,
        companyId,
        tenantId,
      );
      if (scopedCompany.length !== 1) {
        throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_SCOPE_NOT_FOUND");
      }
    }
    if (operation === "STOP") {
      const rows = await tx.$queryRawUnsafe<DurableRunRow[]>(
        `SELECT * FROM "ApprovalRoutingBackfillRun"
          WHERE id = $1::uuid AND "tenantId" = $2::uuid AND "companyId" = $3::uuid
          FOR UPDATE`,
        runId, tenantId, companyId,
      );
      run = rows[0] ?? null;
      if (!run) throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_RUN_NOT_FOUND");
      assertRunContract(run, { tenantId, companyId, contract });
      if (run.status === "STOPPED") {
        return {
          ...baseResult("APPLY"),
          runId: run.id,
          passNo: run.currentPass,
          outcome: "STOPPED",
          reasonCode: "APPROVAL_ROUTING_BACKFILL_RUN_STOPPED",
        };
      }
      if (run.status === "COMPLETED") {
        throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_RUN_NOT_STOPPABLE");
      }
      const acquired = await tx.$queryRawUnsafe<DurableRunRow[]>(
        `UPDATE "ApprovalRoutingBackfillRun"
            SET "leaseOwner" = $1,
                "leaseExpiresAt" = clock_timestamp() + ($2 * INTERVAL '1 second'),
                "fencingToken" = "fencingToken" + 1,
                "updatedAt" = clock_timestamp()
          WHERE id = $3::uuid
            AND "tenantId" = $4::uuid
            AND "companyId" = $5::uuid
            AND ("leaseOwner" = $1 OR "leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= clock_timestamp())
          RETURNING *`,
        leaseOwner, leaseSeconds, runId, tenantId, companyId,
      );
      const fenced = acquired[0];
      if (!fenced) throw new BackfillRetryable("APPROVAL_ROUTING_BACKFILL_LEASE_CONTENDED");
      const stopAudit = await tx.auditEvent.create({
        data: {
          tenantId,
          companyId,
          actorUserId: null,
          eventType: "approval.routing_backfill_stopped",
          entityType: "ApprovalRoutingBackfillRun",
          entityId: run.id,
          requestId,
          beforeData: { status: run.status },
          afterData: { status: "STOPPED" },
          metadata: {
            source: "approval-routing-backfill-job",
            requestId,
            leaseOwner,
            operatorIdentity,
            authorizationReference,
            fencingToken: fenced.fencingToken.toString(),
            releaseIdentity: run.releaseIdentity,
          },
        },
        select: { id: true, occurredAt: true },
      });
      const stopped = await tx.$executeRawUnsafe(
        `UPDATE "ApprovalRoutingBackfillRun"
            SET status = 'STOPPED',
                "stoppedAt" = (
                  SELECT audit."occurredAt" AT TIME ZONE 'UTC'
                    FROM "AuditEvent" audit
                   WHERE audit.id = $6::uuid
                     AND audit."tenantId" = $2::uuid
                ),
                "stopAuditEventId" = $6::uuid,
                "leaseOwner" = NULL,
                "leaseExpiresAt" = NULL,
                "updatedAt" = clock_timestamp()
          WHERE id = $1::uuid
            AND "tenantId" = $2::uuid
            AND "companyId" = $3::uuid
            AND "leaseOwner" = $4
            AND "fencingToken" = $5
            AND "leaseExpiresAt" > clock_timestamp()`,
        run.id, tenantId, companyId, leaseOwner, fenced.fencingToken, stopAudit.id,
      );
      if (stopped !== 1) throw new BackfillRetryable("APPROVAL_ROUTING_BACKFILL_FENCE_LOST");
      return {
        ...baseResult("APPLY"),
        runId: run.id,
        passNo: run.currentPass,
        outcome: "STOPPED",
        reasonCode: "APPROVAL_ROUTING_BACKFILL_RUN_STOPPED",
      };
    } else if (operation === "START") {
      const hash = runRequestHash({ runId, tenantId, companyId, startRequestId: requestId, idempotencyKey: idempotencyKey!, operatorIdentity, authorizationReference, contract });
      const replay = (await tx.$queryRawUnsafe<DurableRunRow[]>(
        `SELECT * FROM "ApprovalRoutingBackfillRun"
          WHERE "tenantId" = $1::uuid AND "companyId" = $2::uuid
            AND ("startRequestId" = $3 OR "idempotencyKey" = $4)
          FOR UPDATE`,
        tenantId, companyId, requestId, idempotencyKey,
      ))[0] ?? null;
      if (replay) {
        assertRunContract(replay, { tenantId, companyId, contract });
        if (replay.id !== runId || replay.requestHash !== hash || replay.startRequestId !== requestId || replay.idempotencyKey !== idempotencyKey) {
          throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_START_REPLAY_MISMATCH");
        }
        const batch = await loadReplayBatch(tx, replay.id, requestId);
        if (!batch) throw new BackfillRetryable("APPROVAL_ROUTING_BACKFILL_START_REPLAY_INCOMPLETE");
        return replayResult(tx, replay, batch);
      }
      const active = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "ApprovalRoutingBackfillRun"
          WHERE "tenantId" = $1::uuid AND "companyId" = $2::uuid
            AND status IN ('ACTIVE', 'BLOCKED', 'BARRIER_REQUIRED')
          FOR UPDATE`,
        tenantId, companyId,
      );
      if (active.length > 0) throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_ACTIVE_RUN_EXISTS");
      const rows = await tx.$queryRawUnsafe<DurableRunRow[]>(
        `INSERT INTO "ApprovalRoutingBackfillRun"
          (id, "tenantId", "companyId", mode, status, "routingSchemaVersion", "routingMappingVersion",
           "routingMappingHash", "capabilityVersion", "capabilityHash", "releaseIdentity", "startRequestId",
           "idempotencyKey", "requestHash", "leaseOwner", "leaseExpiresAt", "fencingToken", "startedAt", "createdAt", "updatedAt")
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'APPLY', 'ACTIVE', $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, clock_timestamp() + ($14 * INTERVAL '1 second'), 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        runId, tenantId, companyId, contract.expectedRoutingSchemaVersion,
        contract.expectedMappingVersion, contract.expectedMappingHash,
        contract.expectedCapabilityVersion, contract.expectedCapabilityHash,
        contract.releaseIdentity, requestId, idempotencyKey, hash, leaseOwner, leaseSeconds,
      );
      run = rows[0] ?? null;
    } else {
      const rows = await tx.$queryRawUnsafe<DurableRunRow[]>(
        `SELECT * FROM "ApprovalRoutingBackfillRun"
          WHERE id = $1::uuid AND "tenantId" = $2::uuid AND "companyId" = $3::uuid
          FOR UPDATE`,
        runId, tenantId, companyId,
      );
      run = rows[0] ?? null;
      if (!run) throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_RUN_NOT_FOUND");
      assertRunContract(run, { tenantId, companyId, contract });
      const replay = await loadReplayBatch(tx, run.id, requestId);
      if (replay) return replayResult(tx, run, replay);
      if (!['ACTIVE', 'BLOCKED'].includes(run.status)) {
        throw new BackfillIncompatible("APPROVAL_ROUTING_BACKFILL_RUN_NOT_RESUMABLE");
      }
      const acquired = await tx.$queryRawUnsafe<DurableRunRow[]>(
        `UPDATE "ApprovalRoutingBackfillRun"
            SET "leaseOwner" = $1,
                "leaseExpiresAt" = clock_timestamp() + ($2 * INTERVAL '1 second'),
                "fencingToken" = "fencingToken" + 1,
                "updatedAt" = clock_timestamp()
          WHERE id = $3::uuid
            AND "tenantId" = $4::uuid
            AND "companyId" = $5::uuid
            AND ("leaseOwner" = $1 OR "leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= clock_timestamp())
          RETURNING *`,
        leaseOwner, leaseSeconds, runId, tenantId, companyId,
      );
      if (!acquired[0]) throw new BackfillRetryable("APPROVAL_ROUTING_BACKFILL_LEASE_CONTENDED");
      run = acquired[0];
    }
    if (!run) throw new Error("APPROVAL_ROUTING_BACKFILL_RUN_CREATE_FAILED");
    assertRunContract(run, { tenantId, companyId, contract });
    return processDurablePage({ tx, run, requestId, leaseOwner, operatorIdentity, authorizationReference, leaseSeconds, batchSize, deadlineMs });
  }, {
    isolationLevel: "Serializable",
    timeout: (maxSeconds + 5) * 1000,
  });
}

export async function runApprovalRoutingBackfill(
  options: BackfillOptions = {},
): Promise<ApprovalRoutingBackfillResult> {
  const apply = options.apply === true;
  try {
    const batchSize = boundedInteger(options.batchSize, 50, APPROVAL_ROUTING_BACKFILL_MAX_BATCH_SIZE, "APPROVAL_ROUTING_BACKFILL_BATCH_SIZE_INVALID");
    const maxSeconds = boundedInteger(options.maxSeconds, 40, APPROVAL_ROUTING_BACKFILL_MAX_SECONDS, "APPROVAL_ROUTING_BACKFILL_MAX_SECONDS_INVALID");
    const leaseSeconds = boundedInteger(options.leaseSeconds, APPROVAL_ROUTING_BACKFILL_DEFAULT_LEASE_SECONDS, 600, "APPROVAL_ROUTING_BACKFILL_LEASE_SECONDS_INVALID");
    if (!apply) return await runReadOnlyApprovalRoutingBackfill(options, batchSize);
    return await runDurableApprovalRoutingBackfill(options, batchSize, maxSeconds, leaseSeconds);
  } catch (error) {
    if (error instanceof BackfillIncompatible) {
      return {
        ...incompatibleResult(options.runId ?? null, error.code),
        mode: apply ? "APPLY" : "DRY_RUN",
      };
    }
    if (error instanceof BackfillRetryable) {
      return {
        ...retryableResult(options.runId ?? null, error.code),
        mode: apply ? "APPLY" : "DRY_RUN",
      };
    }
    if (classifyRetryable(error)) {
      return {
        ...retryableResult(
          options.runId ?? null,
          "APPROVAL_ROUTING_BACKFILL_DATABASE_RETRYABLE",
        ),
        mode: apply ? "APPLY" : "DRY_RUN",
      };
    }
    throw error;
  }
}

export async function inspectApprovalRoutingReadiness(input: { tenantId: string; companyId: string; batchSize?: number }) {
  const result = await runApprovalRoutingBackfill({ tenantId: input.tenantId, companyId: input.companyId, batchSize: input.batchSize ?? APPROVAL_ROUTING_BACKFILL_MAX_BATCH_SIZE, apply: false, maxSeconds: APPROVAL_ROUTING_BACKFILL_MAX_SECONDS });
  if (result.hasMore) throw new Error("APPROVAL_ROUTING_READINESS_SCAN_INCOMPLETE");
  if (result.blockers.length > 0) result.outcome = "BLOCKED";
  return {
    ...result,
    ready:
      result.blockers.length === 0 &&
      result.eligible === 0 &&
      !result.hasMore,
  };
}
