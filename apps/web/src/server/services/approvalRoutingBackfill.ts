import { prisma, type TransactionClient } from "@ogfi/database";
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
  "ROUTING_DESCRIPTOR_DRIFT",
  "BACKFILL_AUDIT_MISSING",
  "BACKFILL_AUDIT_DRIFT",
  "CURRENT_ELIGIBLE_ACTOR_MISSING",
  "ROLE_NOTIFICATION_PRESENT",
  "BACKFILL_TRANSACTION_FAILED",
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
  blockers: ApprovalRoutingBackfillBlocker[];
  blockerCounts: Partial<Record<ApprovalRoutingBackfillBlockerCode, number>>;
  hasMore: boolean;
  mappingVersion: string;
  mappingHash: string;
};

type BackfillOptions = {
  apply?: boolean;
  batchSize?: number;
  maxSeconds?: number;
  tenantId?: string;
  companyId?: string;
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

class BackfillDryRunRollback extends Error {
  constructor() {
    super("APPROVAL_ROUTING_BACKFILL_DRY_RUN_ROLLBACK");
  }
}

function block(code: ApprovalRoutingBackfillBlockerCode): never {
  throw new BackfillBlocker(code);
}

function uniqueActors(
  entries: Array<[string | null | undefined, string]>,
): ProhibitedActor[] {
  return [...new Map(
    entries
      .filter((entry): entry is [string, string] => Boolean(entry[0]))
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
): Promise<SourceSnapshot> {
  await lockMainSource(tx, documentType, instance.documentId);
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

function validateStructure(instance: LockedInstance, steps: LockedStep[]) {
  if (instance.currentStepOrder === null) block("CURRENT_STEP_ORDER_MISSING");
  if (steps.length === 0) block("ZERO_STEPS");
  if (steps.some((step) => Boolean(step.assignedUserId) === Boolean(step.assignedRoleId))) block("ASSIGNMENT_XOR_INVALID");
  if (steps.some((step) => step.delegatedFromUserId !== null)) block("DELEGATED_STEP_UNSUPPORTED");
  const pending = steps.filter((step) => step.status === "PENDING");
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
  return pending[0]!;
}

async function expectedDescriptor(
  tx: TransactionClient,
  instance: LockedInstance,
): Promise<ExpectedDescriptor> {
  if (instance.documentType === "PROJECT_REQUIREMENT") block("UNSUPPORTED_PROJECT_REQUIREMENT");
  if (!isSupportedApprovalDocumentType(instance.documentType)) block("UNSUPPORTED_DOCUMENT_TYPE");
  const policy = getApprovalRoutingPolicy(instance.documentType);
  const source = await loadSourceSnapshot(tx, instance, instance.documentType);
  if (source.tenantId !== instance.tenantId || source.companyId !== instance.companyId) block("SOURCE_SCOPE_MISMATCH");
  if (!policy.allowedSourceStatuses.includes(source.status)) block("SOURCE_STATUS_INVALID");
  const permission = await tx.permission.findFirst({ where: { code: policy.requiredPermissionCode, OR: [{ tenantId: null }, { tenantId: instance.tenantId }] }, select: { id: true } });
  if (!permission) block("SOURCE_NOT_FOUND");
  const sourceDigest = approvalRoutingDigest({ documentType: instance.documentType, documentId: instance.documentId, ...source });
  return { ...source, requiredPermissionId: permission.id, requiredPermissionCode: policy.requiredPermissionCode, sourceDigest };
}

function sameDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

async function verifyStepDescriptor(tx: TransactionClient, step: LockedStep, expected: ExpectedDescriptor) {
  if (step.routingSchemaVersion !== APPROVAL_ROUTING_SCHEMA_VERSION || step.requiredPermissionId !== expected.requiredPermissionId || step.scopeGroupMatchMode !== "ALL" || !sameDate(step.dueAt, expected.dueAt) || (step.status === "WAITING" && step.activatedAt !== null) || (step.status === "PENDING" && step.activatedAt === null)) block("ROUTING_DESCRIPTOR_DRIFT");
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

async function inspectOrApplyInstance(tx: TransactionClient, instanceId: string, apply: boolean) {
  const instances = await tx.$queryRaw<LockedInstance[]>`SELECT id, "tenantId", "companyId", "documentType", "documentId", status::text, "currentStepOrder", "createdAt" FROM "ApprovalInstance" WHERE id = ${instanceId}::uuid FOR UPDATE`;
  const instance = instances[0];
  if (!instance || instance.status !== "PENDING") return { state: "TERMINAL" as const };
  const steps = await tx.$queryRaw<LockedStep[]>`SELECT id, "stepOrder", "assignedUserId", "assignedRoleId", "delegatedFromUserId", status::text, "actedAt", "activatedAt", "dueAt", "requiredPermissionId", "routingSchemaVersion", "scopeGroupMatchMode"::text FROM "ApprovalInstanceStep" WHERE "approvalInstanceId" = ${instance.id}::uuid ORDER BY "stepOrder" FOR UPDATE`;
  const current = validateStructure(instance, steps);
  const expected = await expectedDescriptor(tx, instance);
  const existingActivation = await tx.auditEvent.findFirst({ where: { tenantId: instance.tenantId, entityType: "ApprovalInstanceStep", entityId: current.id, eventType: "approval.step_activated" }, orderBy: { occurredAt: "asc" }, select: { occurredAt: true } });
  const derived = existingActivation ? { activatedAt: existingActivation.occurredAt, provenance: "EXISTING_ACTIVATION_AUDIT", confidence: "HIGH" as const } : activationProvenance(instance, steps, current, expected);
  const allCurrent = steps.every((step) => step.routingSchemaVersion === APPROVAL_ROUTING_SCHEMA_VERSION);
  if (allCurrent) {
    for (const step of steps) await verifyStepDescriptor(tx, step, expected);
  } else if (steps.some((step) => step.routingSchemaVersion !== 0)) {
    block("ROUTING_DESCRIPTOR_DRIFT");
  } else if (apply) {
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
      const updated = await tx.approvalInstanceStep.updateMany({ where: { id: step.id, routingSchemaVersion: 0, status: step.status as never }, data: { requiredPermissionId: expected.requiredPermissionId, routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION, scopeGroupMatchMode: "ALL", activatedAt: step.status === "PENDING" ? derived.activatedAt : null, dueAt: expected.dueAt } });
      if (updated.count !== 1) throw new Error("APPROVAL_ROUTING_BACKFILL_CAS_FAILED");
    }
    const eligible = await findAnyEligibleApprovalActorForStep(tx, {
      tenantId: instance.tenantId,
      companyId: instance.companyId,
      approvalInstanceStepId: current.id,
    });
    if (!eligible) block("CURRENT_ELIGIBLE_ACTOR_MISSING");
    await tx.auditEvent.create({ data: { tenantId: instance.tenantId, companyId: instance.companyId, actorUserId: null, eventType: "approval.step_routing_backfilled", entityType: "ApprovalInstance", entityId: instance.id, occurredAt: new Date(), afterData: { routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION }, metadata: { source: "approval-routing-backfill-job", mappingVersion: APPROVAL_ROUTING_MAPPING_VERSION, mappingHash: APPROVAL_ROUTING_MAPPING_HASH, sourceDigest: expected.sourceDigest, currentStepId: current.id, derivedActivatedAt: derived.activatedAt.toISOString(), activatedAtProvenance: derived.provenance, activatedAtConfidence: derived.confidence } } });
  }
  if (allCurrent) {
    const backfillAudit = await tx.auditEvent.findMany({ where: { tenantId: instance.tenantId, entityType: "ApprovalInstance", entityId: instance.id, eventType: "approval.step_routing_backfilled" }, select: { metadata: true } });
    if (backfillAudit.length > 1) block("BACKFILL_AUDIT_DRIFT");
    if (backfillAudit.length === 1) {
      const metadata = backfillAudit[0]?.metadata as Record<string, unknown> | null;
      if (metadata?.mappingVersion !== APPROVAL_ROUTING_MAPPING_VERSION || metadata?.mappingHash !== APPROVAL_ROUTING_MAPPING_HASH || metadata?.sourceDigest !== expected.sourceDigest) block("BACKFILL_AUDIT_DRIFT");
    } else if (!existingActivation) block("BACKFILL_AUDIT_MISSING");
  }
  return { state: allCurrent ? "CURRENT" as const : apply ? "APPLIED" as const : "ELIGIBLE" as const, instance, current };
}

function boundedInteger(value: number | undefined, fallback: number, max: number, code: string) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1 || result > max) throw new Error(code);
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

export async function runApprovalRoutingBackfill(options: BackfillOptions = {}): Promise<ApprovalRoutingBackfillResult> {
  const apply = options.apply === true;
  const batchSize = boundedInteger(options.batchSize, 50, APPROVAL_ROUTING_BACKFILL_MAX_BATCH_SIZE, "APPROVAL_ROUTING_BACKFILL_BATCH_SIZE_INVALID");
  const maxSeconds = boundedInteger(options.maxSeconds, 40, APPROVAL_ROUTING_BACKFILL_MAX_SECONDS, "APPROVAL_ROUTING_BACKFILL_MAX_SECONDS_INVALID");
  const result: ApprovalRoutingBackfillResult = { mode: apply ? "APPLY" : "DRY_RUN", scanned: 0, eligible: 0, applied: 0, alreadyCurrent: 0, blockers: [], blockerCounts: {}, hasMore: false, mappingVersion: APPROVAL_ROUTING_MAPPING_VERSION, mappingHash: APPROVAL_ROUTING_MAPPING_HASH };
  return prisma.$transaction(async (coordinator) => {
    const lock = await coordinator.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('ogfi:approval-routing-backfill')) AS acquired`;
    if (!lock[0]?.acquired) throw new Error("APPROVAL_ROUTING_BACKFILL_ALREADY_RUNNING");
    const deadline = Date.now() + maxSeconds * 1000;
    const scan = await scanApprovalRoutingKeysetPages({
      batchSize,
      deadlineMs: deadline,
      loadPage: (afterId) => coordinator.approvalInstance.findMany({
        where: {
          status: "PENDING",
          ...(afterId ? { id: { gt: afterId } } : {}),
          ...(options.tenantId ? { tenantId: options.tenantId } : {}),
          ...(options.companyId ? { companyId: options.companyId } : {}),
        },
        select: { id: true, documentType: true },
        orderBy: { id: "asc" },
        take: batchSize,
      }),
      visit: async (row) => {
        try {
          let outcome;
          try {
            outcome = await prisma.$transaction(
              async (tx) => {
                // Dry-run executes the exact write-path validation, including
                // live actor eligibility, then aborts before commit. This keeps
                // its blocker report equivalent to apply without persisting
                // routing children or synthetic audit evidence.
                const inspected = await inspectOrApplyInstance(tx, row.id, true);
                if (!apply && inspected.state === "APPLIED") {
                  throw new BackfillDryRunRollback();
                }
                return inspected;
              },
              { isolationLevel: "Serializable" },
            );
          } catch (error) {
            if (!(error instanceof BackfillDryRunRollback)) throw error;
            outcome = { state: "ELIGIBLE" as const };
          }
          if (outcome.state === "CURRENT") result.alreadyCurrent += 1;
          else if (outcome.state === "APPLIED") { result.eligible += 1; result.applied += 1; }
          else if (outcome.state === "ELIGIBLE") result.eligible += 1;
        } catch (error) {
          const code = error instanceof BackfillBlocker ? error.code : "BACKFILL_TRANSACTION_FAILED";
          result.blockers.push({ approvalInstanceId: row.id, documentType: row.documentType, code });
          result.blockerCounts[code] = (result.blockerCounts[code] ?? 0) + 1;
        }
      },
    });
    result.scanned = scan.scanned;
    result.hasMore = scan.hasMore;
    return result;
  }, { timeout: (maxSeconds + 5) * 1000 });
}

export async function inspectApprovalRoutingReadiness(input: { tenantId: string; companyId: string; batchSize?: number }) {
  const result = await runApprovalRoutingBackfill({ tenantId: input.tenantId, companyId: input.companyId, batchSize: input.batchSize ?? APPROVAL_ROUTING_BACKFILL_MAX_BATCH_SIZE, apply: false, maxSeconds: APPROVAL_ROUTING_BACKFILL_MAX_SECONDS });
  if (result.hasMore) throw new Error("APPROVAL_ROUTING_READINESS_SCAN_INCOMPLETE");
  for (const row of await prisma.approvalInstance.findMany({ where: { tenantId: input.tenantId, companyId: input.companyId, status: "PENDING" }, select: { id: true, currentStepOrder: true, steps: { where: { status: "PENDING" }, select: { id: true, assignedRoleId: true } } } })) {
    const step = row.steps.length === 1 ? row.steps[0] : null;
    if (!step) continue;
    const eligible = await prisma.$transaction((tx) => findAnyEligibleApprovalActorForStep(tx, { tenantId: input.tenantId, companyId: input.companyId, approvalInstanceStepId: step.id }));
    if (!eligible) {
      result.blockers.push({ approvalInstanceId: row.id, documentType: "", code: "CURRENT_ELIGIBLE_ACTOR_MISSING" });
      result.blockerCounts.CURRENT_ELIGIBLE_ACTOR_MISSING = (result.blockerCounts.CURRENT_ELIGIBLE_ACTOR_MISSING ?? 0) + 1;
    }
    if (step.assignedRoleId) {
      const roleNotifications = await prisma.notification.count({ where: { tenantId: input.tenantId, companyId: input.companyId, recipientBasis: "assigned_role", metadata: { path: ["approvalInstanceId"], equals: row.id } } });
      if (roleNotifications > 0) {
        result.blockers.push({ approvalInstanceId: row.id, documentType: "", code: "ROLE_NOTIFICATION_PRESENT" });
        result.blockerCounts.ROLE_NOTIFICATION_PRESENT = (result.blockerCounts.ROLE_NOTIFICATION_PRESENT ?? 0) + 1;
      }
    }
  }
  return {
    ...result,
    ready:
      result.blockers.length === 0 &&
      result.eligible === 0 &&
      !result.hasMore,
  };
}
