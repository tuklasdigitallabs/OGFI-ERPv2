import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import type { TransactionClient } from "@ogfi/database";
import {
  canUseFinance,
  permissions,
  requirePermission,
} from "./authorization";
import type { SessionContext } from "./context";
import {
  recordWorkflowNotifications,
} from "./notifications";
import {
  assertAnyEligibleApprovalActorForStep,
  configureApprovalStepRouting,
} from "./approvalRouting";
import { getApprovalRoutingPolicy } from "./approvalRoutingRegistry";
import { getBudgetSourceHookPolicy } from "./policySettings";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "destructive";

type DecimalLike = {
  toNumber?: () => number;
  toString: () => string;
};

type BudgetSourceEventType =
  | "PURCHASE_REQUEST"
  | "PURCHASE_ORDER"
  | "PURCHASE_ORDER_LINE"
  | "GOODS_RECEIPT"
  | "INVENTORY_TRANSFER"
  | "EXPENSE_REQUEST"
  | "AP_INVOICE"
  | "PAYMENT_REQUEST"
  | "MANUAL";

type BudgetThresholdState = "WITHIN_BUDGET" | "WARNING" | "HARD_BLOCK";

export type BudgetControlMetric = {
  id: string;
  label: string;
  displayValue: string;
  detail: string;
  tone: BadgeTone;
};

export type BudgetControlLineRow = {
  id: string;
  budgetId: string;
  budgetReference: string;
  budgetName: string;
  lineCode: string;
  lineName: string;
  accountName: string;
  locationName: string;
  departmentName: string;
  periodLabel: string;
  status: string;
  revisedAmountPhp: number;
  committedAmountPhp: number;
  actualAmountPhp: number;
  remainingAmountPhp: number;
  utilizationPct: number;
  thresholdState: BudgetThresholdState;
  warningThresholdPct: number;
  hardBlockPct: number | null;
  tone: BadgeTone;
};

export type BudgetCommitmentRow = {
  id: string;
  sourceType: string;
  sourceReference: string;
  sourceEventAt: string;
  lineName: string;
  status: string;
  committedAmountPhp: number;
  consumedAmountPhp: number;
  sourceSummary: string;
};

export type BudgetSourceAllocationReadinessRow = {
  sourceType: "PURCHASE_REQUEST" | "PURCHASE_ORDER" | "AP_INVOICE";
  label: string;
  allocatedLineCount: number;
  unallocatedLineCount: number;
  totalLineCount: number;
  allocationPct: number;
  readiness:
    | "READY_FOR_WARNING_PROJECTION"
    | "NEEDS_BACKFILL"
    | "NO_SOURCE_LINES";
  detail: string;
  tone: BadgeTone;
};

export type BudgetWorkflowRow = {
  id: string;
  publicReference: string;
  name: string;
  status: string;
  ownerName: string;
  submittedByName: string | null;
  approvedByName: string | null;
  lineCount: number;
  totalRevisedAmountPhp: number;
  allowedActions: Array<
    | "submit"
    | "start_review"
    | "approve"
    | "return"
    | "reject"
    | "activate"
    | "close"
    | "cancel"
    | "archive"
  >;
};

export type BudgetRevisionWorkflowRow = {
  id: string;
  budgetId: string;
  budgetReference: string;
  budgetName: string;
  revisionNumber: number;
  revisionType: string;
  status: string;
  reason: string;
  requestedByName: string;
  reviewedByName: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  originalAmountPhp: number | null;
  proposedAmountPhp: number | null;
  amountDeltaPhp: number | null;
  allowedActions: Array<
    "submit" | "start_review" | "approve" | "reject" | "cancel"
  >;
};

export type BudgetDraftOption = {
  id: string;
  label: string;
  detail: string;
};

export type BudgetRevisionLineOption = BudgetDraftOption & {
  budgetId: string;
  currentAmountPhp: number;
};

export type BudgetControlDashboard = {
  generatedAt: string;
  scope: {
    companyName: string;
    brandName: string;
    locationName: string;
  };
  permissions: {
    canManageBudget: boolean;
    canApproveBudget: boolean;
    canReviewCommitments: boolean;
  };
  budgetDraftOptions: {
    fiscalYears: BudgetDraftOption[];
    accounts: BudgetDraftOption[];
    locations: BudgetDraftOption[];
    departments: BudgetDraftOption[];
    revisionLines: BudgetRevisionLineOption[];
  };
  metrics: BudgetControlMetric[];
  lines: BudgetControlLineRow[];
  budgets: BudgetWorkflowRow[];
  revisions: BudgetRevisionWorkflowRow[];
  commitments: BudgetCommitmentRow[];
  sourceAllocationReadiness: BudgetSourceAllocationReadinessRow[];
  sourceHookPolicy: {
    key: string;
    rolloutMode: string;
    commitmentProjectionEnabled: boolean;
    hardBlockEnabled: boolean;
    exceptionOverrideRequired: boolean;
    formalBackfillRequiredBeforeHardBlock: boolean;
    uatRequiredBeforeHardBlock: boolean;
    sourceDecisionId: string;
    isOverridden: boolean;
    decisionBasis: string;
  };
  guardrails: Array<{
    label: string;
    detail: string;
    tone: BadgeTone;
  }>;
};

export type BudgetThresholdEvaluation = {
  state: BudgetThresholdState;
  utilizationPct: number;
  usedAmountPhp: number;
  remainingAmountPhp: number;
  remainingAfterProposedPhp: number;
  warningThresholdPct: number;
  hardBlockPct: number | null;
  requiresReview: boolean;
  requiresApprovedOverride: boolean;
};

export type BudgetSourceCommitmentInput = {
  budgetLineId: string;
  sourceType: BudgetSourceEventType;
  sourceId: string;
  sourceLineId?: string | null;
  sourceEventKey: string;
  sourceEventAt: Date;
  sourceReference: string;
  committedAmountPhp: number;
  sourceSummary: string;
  status?: "PENDING" | "APPROVED";
  overrideApproval?: {
    reason: string;
    evidenceReference: string;
    approvedByUserId: string;
  };
};

export type BudgetSourceCommitmentResult = {
  commitmentId: string;
  status: string;
  threshold: BudgetThresholdEvaluation;
  created: boolean;
};

export type BudgetSourceCommitmentReversalInput = {
  sourceType: BudgetSourceEventType;
  sourceId: string;
  sourceEventKey: string;
  reversalEventKey: string;
  reason: string;
};

export type BudgetSourceAllocationInput = {
  sourceType: BudgetSourceEventType;
  sourceId: string;
  sourceLineId?: string | null;
  directBudgetLineId?: string | null;
  inheritedBudgetLineId?: string | null;
  sourceReference: string;
  sourceSummary: string;
};

export type BudgetSourceAllocationResult = {
  sourceType: BudgetSourceEventType;
  sourceId: string;
  sourceLineId: string | null;
  sourceReference: string;
  sourceSummary: string;
  budgetLineId: string | null;
  allocationSource: "DIRECT" | "INHERITED" | "UNALLOCATED";
  commitmentReadiness: "READY_FOR_COMMITMENT" | "NEEDS_BUDGET_LINE_ALLOCATION";
  noSourceMutation: true;
  hardBlockDeferred: true;
};

export type BudgetLifecycleActionInput = {
  budgetId: string;
  reason?: string;
  evidenceReference?: string;
  idempotencyKey?: string;
};

export type BudgetRevisionLifecycleActionInput = {
  budgetRevisionId: string;
  reason?: string;
  evidenceReference?: string;
  idempotencyKey?: string;
};

export type CreateDraftBudgetInput = {
  name: string;
  description?: string | undefined;
  budgetType?: string | undefined;
  fiscalYearId: string;
  locationId: string;
  departmentId?: string | null | undefined;
  periodStart: Date;
  periodEnd: Date;
  accountId: string;
  lineCode: string;
  lineName: string;
  lineDescription?: string | undefined;
  amountPhp: number;
  warningThresholdPct?: number | undefined;
  hardBlockPct?: number | null;
  reason: string;
  evidenceReference?: string | undefined;
  publicReference?: string | undefined;
  idempotencyKey?: string | undefined;
};

export type CreateDraftBudgetRevisionInput = {
  budgetLineId: string;
  proposedAmountPhp: number;
  revisionType?: "AMENDMENT" | "REBASE" | "REALLOCATION";
  effectiveFrom?: Date | undefined;
  effectiveTo?: Date | undefined;
  reason: string;
  evidenceReference?: string | undefined;
  idempotencyKey?: string | undefined;
};

type BudgetLifecycleTransition =
  | "submit"
  | "start_review"
  | "approve"
  | "return"
  | "reject"
  | "activate"
  | "close"
  | "cancel"
  | "archive";

type BudgetRevisionLifecycleTransition =
  | "submit"
  | "start_review"
  | "approve"
  | "reject"
  | "cancel";

function decimalToNumber(value: DecimalLike | number | null | undefined) {
  if (value == null) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value.toString());
}

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(value);
}

function resolveUtilizationTone(percentage: number): BadgeTone {
  if (percentage >= 100) {
    return "destructive";
  }
  if (percentage >= 80) {
    return "warning";
  }
  if (percentage > 0) {
    return "info";
  }
  return "neutral";
}

function authorizedLocationIds(session: SessionContext) {
  return session.authorizedLocations.map((location) => location.locationId);
}

function assertReason(value: string | undefined, errorCode: string) {
  if (!value?.trim()) {
    throw new Error(errorCode);
  }
}

function assertValidDate(value: Date, errorCode: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(errorCode);
  }
}

function cleanText(value: string | undefined | null) {
  return value?.trim() ?? "";
}

function assertPositiveAmount(value: number, errorCode: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(errorCode);
  }
}

function normalizeThresholdPct(
  value: number | null | undefined,
  fallback: number,
  errorCode: string,
) {
  if (value == null || Number.isNaN(value)) {
    return fallback;
  }
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    throw new Error(errorCode);
  }
  return value;
}

function nextBudgetReference(input: {
  fiscalYearCode: string;
  idempotencyKey?: string | undefined;
  name: string;
  lineCode: string;
  locationId: string;
  departmentId?: string | undefined;
}) {
  const hash = createHash("sha256")
    .update(
      [
        input.fiscalYearCode,
        input.idempotencyKey ?? input.name,
        input.lineCode,
        input.locationId,
        input.departmentId ?? "no-department",
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  return `BUD-${input.fiscalYearCode}-${hash}`;
}

function assertBudgetTransition(input: {
  transition: BudgetLifecycleTransition;
  status: string;
}) {
  const allowed: Record<BudgetLifecycleTransition, string[]> = {
    submit: ["DRAFT", "RETURNED"],
    start_review: ["SUBMITTED"],
    approve: ["UNDER_REVIEW"],
    return: ["UNDER_REVIEW"],
    reject: ["UNDER_REVIEW"],
    activate: ["APPROVED"],
    close: ["ACTIVE", "PARTIALLY_RELEASED"],
    cancel: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"],
    archive: ["CLOSED", "CANCELLED"],
  };

  if (!allowed[input.transition].includes(input.status)) {
    throw new Error("BUDGET_INVALID_STATUS_TRANSITION");
  }
}

function assertBudgetRevisionTransition(input: {
  transition: BudgetRevisionLifecycleTransition;
  status: string;
}) {
  const allowed: Record<BudgetRevisionLifecycleTransition, string[]> = {
    submit: ["DRAFT"],
    start_review: ["SUBMITTED"],
    approve: ["UNDER_REVIEW"],
    reject: ["UNDER_REVIEW"],
    cancel: ["DRAFT", "SUBMITTED", "UNDER_REVIEW"],
  };

  if (!allowed[input.transition].includes(input.status)) {
    throw new Error("BUDGET_REVISION_INVALID_STATUS_TRANSITION");
  }
}

async function findBudgetRevisionApprovalRule(
  tx: TransactionClient,
  session: SessionContext,
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "BudgetRevision",
      isActive: true,
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" },
      },
    },
    orderBy: { priority: "asc" },
  });
}

function budgetApprovalLocationId(budget: {
  locationId: string | null;
  lines: Array<{
    locationId: string | null;
  }>;
}) {
  return (
    budget.locationId ??
    budget.lines.find((line) => line.locationId)?.locationId ??
    null
  );
}

function assertBudgetScope(input: {
  session: SessionContext;
  budget: {
    locationId: string | null;
    lines: Array<{
      locationId: string | null;
    }>;
  };
}) {
  const scopedLocationIds = new Set(
    [
      input.budget.locationId,
      ...input.budget.lines.map((line) => line.locationId),
    ].filter(Boolean) as string[],
  );
  if (scopedLocationIds.size === 0) {
    return;
  }
  const allowedLocationIds = new Set(authorizedLocationIds(input.session));
  for (const locationId of scopedLocationIds) {
    if (!allowedLocationIds.has(locationId)) {
      throw new Error("SCOPE_DENIED");
    }
  }
}

async function requireBudgetPermissionInTransaction(
  tx: TransactionClient,
  session: SessionContext,
) {
  const grants = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT ura.id
    FROM "UserRoleAssignment" AS ura
    INNER JOIN "Role" AS role ON role.id = ura."roleId"
    INNER JOIN "RolePermission" AS rp ON rp."roleId" = role.id
    INNER JOIN "Permission" AS permission ON permission.id = rp."permissionId"
    WHERE ura."userId" = ${session.user.id}::uuid
      AND ura.status::text = 'ACTIVE'
      AND ura."startsAt" <= NOW()
      AND (ura."endsAt" IS NULL OR ura."endsAt" > NOW())
      AND role.status::text = 'ACTIVE'
      AND (role."tenantId" = ${session.context.tenantId}::uuid OR role."tenantId" IS NULL)
      AND permission.code = ${permissions.financeBudgetManage}
      AND (permission."tenantId" = ${session.context.tenantId}::uuid OR permission."tenantId" IS NULL)
    FOR UPDATE OF ura, role, rp, permission
  `;
  if (grants.length === 0) {
    throw new Error("PERMISSION_DENIED");
  }
}

async function requireBudgetScopeInTransaction(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    scopeType: "LOCATION" | "DEPARTMENT";
    scopeId: string;
    allowCompanyManage?: boolean;
  },
) {
  const assignments = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT usa.id
    FROM "UserScopeAssignment" AS usa
    WHERE usa."userId" = ${session.user.id}::uuid
      AND usa.status::text = 'ACTIVE'
      AND usa."startsAt" <= NOW()
      AND (usa."endsAt" IS NULL OR usa."endsAt" > NOW())
      AND (
        (usa."scopeType"::text = ${input.scopeType} AND usa."scopeId" = ${input.scopeId}::uuid)
        OR (
          ${input.allowCompanyManage === true}
          AND usa."scopeType"::text = 'COMPANY'
          AND usa."scopeId" = ${session.context.companyId}::uuid
          AND usa."accessLevel"::text = 'MANAGE'
        )
      )
    FOR UPDATE OF usa
  `;
  if (assignments.length === 0) {
    throw new Error("SCOPE_DENIED");
  }
}

async function getScopedBudgetOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  budgetId: string,
) {
  const budget = await tx.budget.findFirst({
    where: {
      id: budgetId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      lines: {
        select: {
          id: true,
          locationId: true,
          revisedAmountPhp: true,
          status: true,
        },
      },
      commitments: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!budget) {
    throw new Error("BUDGET_NOT_FOUND");
  }
  assertBudgetScope({ session, budget });
  return budget;
}

async function getScopedBudgetRevisionOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  budgetRevisionId: string,
) {
  const revision = await tx.budgetRevision.findFirst({
    where: {
      id: budgetRevisionId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      budget: {
        include: {
          lines: {
            select: {
              id: true,
              locationId: true,
              revisedAmountPhp: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!revision) {
    throw new Error("BUDGET_REVISION_NOT_FOUND");
  }
  assertBudgetScope({ session, budget: revision.budget });
  return revision;
}

async function writeBudgetAudit(
  tx: TransactionClient,
  input: {
    session: SessionContext;
    budgetId: string;
    eventType: string;
    beforeStatus: string;
    afterStatus: string;
    reason?: string | null;
    evidenceReference?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  return tx.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: input.eventType,
      entityType: "Budget",
      entityId: input.budgetId,
      beforeData: {
        status: input.beforeStatus,
      },
      afterData: {
        status: input.afterStatus,
      },
      metadata: {
        reason: input.reason ?? null,
        evidenceReference: input.evidenceReference ?? null,
        noSourceMutation: true,
        noPaymentMutation: true,
        noJournalPosting: true,
        ...(input.metadata ?? {}),
      },
    },
  });
}

function assertBudgetHasValidLines(input: {
  lines: Array<{
    revisedAmountPhp: DecimalLike | number;
  }>;
}) {
  if (input.lines.length === 0) {
    throw new Error("BUDGET_LINES_REQUIRED");
  }
  const totalRevisedAmount = input.lines.reduce(
    (sum, line) => sum + decimalToNumber(line.revisedAmountPhp),
    0,
  );
  if (totalRevisedAmount <= 0) {
    throw new Error("BUDGET_POSITIVE_AMOUNT_REQUIRED");
  }
}

function resolveBudgetAllowedActions(input: {
  status: string;
  permissions: {
    canManageBudget: boolean;
    canApproveBudget: boolean;
    canReviewCommitments: boolean;
  };
}): BudgetWorkflowRow["allowedActions"] {
  const actions: BudgetWorkflowRow["allowedActions"] = [];
  if (
    input.permissions.canManageBudget &&
    ["DRAFT", "RETURNED"].includes(input.status)
  ) {
    actions.push("submit");
  }
  if (input.permissions.canReviewCommitments && input.status === "SUBMITTED") {
    actions.push("start_review");
  }
  if (input.permissions.canApproveBudget && input.status === "UNDER_REVIEW") {
    actions.push("approve", "return", "reject");
  }
  if (input.permissions.canApproveBudget && input.status === "APPROVED") {
    actions.push("activate");
  }
  if (
    input.permissions.canApproveBudget &&
    ["ACTIVE", "PARTIALLY_RELEASED"].includes(input.status)
  ) {
    actions.push("close");
  }
  if (
    input.permissions.canManageBudget &&
    ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(input.status)
  ) {
    actions.push("cancel");
  }
  if (
    input.permissions.canManageBudget &&
    ["CLOSED", "CANCELLED"].includes(input.status)
  ) {
    actions.push("archive");
  }
  return actions;
}

function resolveBudgetRevisionAllowedActions(input: {
  status: string;
  permissions: {
    canManageBudget: boolean;
    canApproveBudget: boolean;
    canReviewCommitments: boolean;
  };
}): BudgetRevisionWorkflowRow["allowedActions"] {
  const actions: BudgetRevisionWorkflowRow["allowedActions"] = [];
  if (input.permissions.canManageBudget && input.status === "DRAFT") {
    actions.push("submit");
  }
  if (input.permissions.canReviewCommitments && input.status === "SUBMITTED") {
    actions.push("start_review");
  }
  if (input.permissions.canApproveBudget && input.status === "UNDER_REVIEW") {
    actions.push("approve", "reject");
  }
  if (
    input.permissions.canManageBudget &&
    ["DRAFT", "SUBMITTED", "UNDER_REVIEW"].includes(input.status)
  ) {
    actions.push("cancel");
  }
  return actions;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function snapshotNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function evaluateBudgetThreshold(input: {
  revisedAmountPhp: DecimalLike | number;
  committedAmountPhp: DecimalLike | number;
  actualAmountPhp: DecimalLike | number;
  proposedAmountPhp?: DecimalLike | number;
  warningThresholdPct?: DecimalLike | number | null;
  hardBlockPct?: DecimalLike | number | null;
}): BudgetThresholdEvaluation {
  const revisedAmount = decimalToNumber(input.revisedAmountPhp);
  const committedAmount = decimalToNumber(input.committedAmountPhp);
  const actualAmount = decimalToNumber(input.actualAmountPhp);
  const proposedAmount = decimalToNumber(input.proposedAmountPhp ?? 0);
  const usedAmount = committedAmount + actualAmount + proposedAmount;
  const warningThreshold = decimalToNumber(input.warningThresholdPct ?? 80);
  const hardBlock =
    input.hardBlockPct == null ? null : decimalToNumber(input.hardBlockPct);
  const utilizationPct =
    revisedAmount > 0
      ? Math.round((usedAmount / revisedAmount) * 1000) / 10
      : 0;

  const state: BudgetThresholdState =
    proposedAmount > 0 && revisedAmount <= 0
      ? "HARD_BLOCK"
      : hardBlock != null && utilizationPct >= hardBlock
        ? "HARD_BLOCK"
        : utilizationPct >= warningThreshold
          ? "WARNING"
          : "WITHIN_BUDGET";

  return {
    state,
    utilizationPct,
    usedAmountPhp: usedAmount,
    remainingAmountPhp: revisedAmount - committedAmount - actualAmount,
    remainingAfterProposedPhp: revisedAmount - usedAmount,
    warningThresholdPct: warningThreshold,
    hardBlockPct: hardBlock,
    requiresReview: state === "WARNING" || state === "HARD_BLOCK",
    requiresApprovedOverride: state === "HARD_BLOCK",
  };
}

export function buildBudgetLineRows(input: {
  lines: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    revisedAmountPhp: DecimalLike | number;
    warningThresholdPct?: DecimalLike | number | null;
    hardBlockPct?: DecimalLike | number | null;
    accountId: string | null;
    locationId: string | null;
    departmentId?: string | null;
    budget: {
      id: string;
      publicReference: string;
      name: string;
    };
    account: {
      name: string;
    } | null;
    location: {
      name: string;
    } | null;
    department?: {
      name: string;
    } | null;
    commitments: Array<{
      status: string;
      committedAmountPhp: DecimalLike | number;
      consumedAmountPhp: DecimalLike | number;
      releasedAmountPhp: DecimalLike | number;
    }>;
  }>;
  actuals: Array<{
    accountId: string;
    locationId: string | null;
    departmentId?: string | null;
    amountPhp: DecimalLike | number;
    journal: {
      journalDate: Date;
      status: string;
    };
  }>;
}) {
  return input.lines.map((line) => {
    const revisedAmount = decimalToNumber(line.revisedAmountPhp);
    const warningThresholdPct = decimalToNumber(
      "warningThresholdPct" in line ? line.warningThresholdPct : 80,
    );
    const hardBlockPct =
      "hardBlockPct" in line && line.hardBlockPct != null
        ? decimalToNumber(line.hardBlockPct)
        : null;
    const committedAmount = line.commitments
      .filter((commitment) =>
        ["PENDING", "APPROVED", "CONSUMED"].includes(commitment.status),
      )
      .reduce(
        (sum, commitment) =>
          sum + decimalToNumber(commitment.committedAmountPhp),
        0,
      );
    const actualAmount = input.actuals
      .filter((actual) => {
        if (actual.journal.status !== "POSTED") {
          return false;
        }
        if (actual.accountId !== line.accountId) {
          return false;
        }
        if (line.locationId && actual.locationId !== line.locationId) {
          return false;
        }
        if (line.departmentId && actual.departmentId !== line.departmentId) {
          return false;
        }
        return (
          actual.journal.journalDate >= line.periodStart &&
          actual.journal.journalDate <= line.periodEnd
        );
      })
      .reduce((sum, actual) => sum + decimalToNumber(actual.amountPhp), 0);
    const usedAmount = committedAmount + actualAmount;
    const threshold = evaluateBudgetThreshold({
      revisedAmountPhp: revisedAmount,
      committedAmountPhp: committedAmount,
      actualAmountPhp: actualAmount,
      warningThresholdPct,
      hardBlockPct,
    });

    return {
      id: line.id,
      budgetId: line.budget.id,
      budgetReference: line.budget.publicReference,
      budgetName: line.budget.name,
      lineCode: line.code,
      lineName: line.name,
      accountName: line.account?.name ?? "Unmapped account",
      locationName: line.location?.name ?? "Company-wide",
      departmentName: line.department?.name ?? "No department",
      periodLabel: `${formatDate(line.periodStart)} - ${formatDate(line.periodEnd)}`,
      status: line.status,
      revisedAmountPhp: revisedAmount,
      committedAmountPhp: committedAmount,
      actualAmountPhp: actualAmount,
      remainingAmountPhp: revisedAmount - usedAmount,
      utilizationPct: threshold.utilizationPct,
      thresholdState: threshold.state,
      warningThresholdPct,
      hardBlockPct,
      tone:
        threshold.state === "HARD_BLOCK"
          ? "destructive"
          : resolveUtilizationTone(threshold.utilizationPct),
    };
  });
}

export function buildBudgetSourceAllocationReadinessRows(
  rows: Array<{
    sourceType: BudgetSourceAllocationReadinessRow["sourceType"];
    label: string;
    allocatedLineCount: number;
    unallocatedLineCount: number;
  }>,
): BudgetSourceAllocationReadinessRow[] {
  return rows.map((row) => {
    const totalLineCount = row.allocatedLineCount + row.unallocatedLineCount;
    const allocationPct =
      totalLineCount > 0
        ? Math.round((row.allocatedLineCount / totalLineCount) * 1000) / 10
        : 0;
    const readiness =
      totalLineCount === 0
        ? "NO_SOURCE_LINES"
        : row.unallocatedLineCount > 0
          ? "NEEDS_BACKFILL"
          : "READY_FOR_WARNING_PROJECTION";
    return {
      sourceType: row.sourceType,
      label: row.label,
      allocatedLineCount: row.allocatedLineCount,
      unallocatedLineCount: row.unallocatedLineCount,
      totalLineCount,
      allocationPct,
      readiness,
      detail:
        readiness === "NO_SOURCE_LINES"
          ? "No scoped source lines are available for this source type yet."
          : readiness === "NEEDS_BACKFILL"
            ? "Some source lines still need budget-line allocation before hard-block rollout."
            : "All scoped source lines have budget-line allocation for warning-mode projection.",
      tone:
        readiness === "READY_FOR_WARNING_PROJECTION"
          ? "success"
          : readiness === "NEEDS_BACKFILL"
            ? "warning"
            : "neutral",
    };
  });
}

export function resolveBudgetSourceAllocation(
  input: BudgetSourceAllocationInput,
): BudgetSourceAllocationResult {
  const directBudgetLineId = cleanText(input.directBudgetLineId) || null;
  const inheritedBudgetLineId = cleanText(input.inheritedBudgetLineId) || null;
  const budgetLineId = directBudgetLineId ?? inheritedBudgetLineId;
  return {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceLineId: cleanText(input.sourceLineId) || null,
    sourceReference: input.sourceReference,
    sourceSummary: input.sourceSummary,
    budgetLineId,
    allocationSource: directBudgetLineId
      ? "DIRECT"
      : inheritedBudgetLineId
        ? "INHERITED"
        : "UNALLOCATED",
    commitmentReadiness: budgetLineId
      ? "READY_FOR_COMMITMENT"
      : "NEEDS_BUDGET_LINE_ALLOCATION",
    noSourceMutation: true,
    hardBlockDeferred: true,
  };
}

async function getPostedActualAmountForLine(input: {
  budgetLine: {
    tenantId: string;
    companyId: string;
    accountId: string | null;
    locationId: string | null;
    periodStart: Date;
    periodEnd: Date;
  };
}) {
  if (!input.budgetLine.accountId) {
    return 0;
  }

  const actuals = await prisma.financeJournalLine.findMany({
    where: {
      tenantId: input.budgetLine.tenantId,
      companyId: input.budgetLine.companyId,
      accountId: input.budgetLine.accountId,
      ...(input.budgetLine.locationId
        ? { locationId: input.budgetLine.locationId }
        : {}),
      journal: {
        status: "POSTED",
        journalDate: {
          gte: input.budgetLine.periodStart,
          lte: input.budgetLine.periodEnd,
        },
      },
    },
    select: {
      amountPhp: true,
    },
  });

  return actuals.reduce(
    (sum, actual) => sum + decimalToNumber(actual.amountPhp),
    0,
  );
}

function assertCanUseBudgetLine(input: {
  session: SessionContext;
  budgetLine: {
    locationId: string | null;
  };
}) {
  if (!input.budgetLine.locationId) {
    return;
  }
  const authorizedLocationIds = input.session.authorizedLocations.map(
    (location) => location.locationId,
  );
  if (!authorizedLocationIds.includes(input.budgetLine.locationId)) {
    throw new Error("SCOPE_DENIED");
  }
}

export async function upsertBudgetCommitmentFromSourceEvent(
  session: SessionContext,
  input: BudgetSourceCommitmentInput,
): Promise<BudgetSourceCommitmentResult> {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetCommitmentReview);
  if (input.committedAmountPhp <= 0) {
    throw new Error("BUDGET_COMMITMENT_AMOUNT_REQUIRED");
  }

  const budgetLine = await prisma.budgetLine.findFirst({
    where: {
      id: input.budgetLineId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
    },
    include: {
      budget: true,
      commitments: {
        where: {
          status: { in: ["PENDING", "APPROVED", "CONSUMED"] },
          NOT: {
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            sourceEventKey: input.sourceEventKey,
          },
        },
        select: {
          committedAmountPhp: true,
          consumedAmountPhp: true,
          releasedAmountPhp: true,
          status: true,
        },
      },
    },
  });

  if (
    !budgetLine ||
    budgetLine.budget.companyId !== session.context.companyId
  ) {
    throw new Error("BUDGET_LINE_NOT_FOUND");
  }
  assertCanUseBudgetLine({ session, budgetLine });

  const committedAmount = budgetLine.commitments.reduce(
    (sum, commitment) => sum + decimalToNumber(commitment.committedAmountPhp),
    0,
  );
  const actualAmount = await getPostedActualAmountForLine({ budgetLine });
  const threshold = evaluateBudgetThreshold({
    revisedAmountPhp: budgetLine.revisedAmountPhp,
    committedAmountPhp: committedAmount,
    actualAmountPhp: actualAmount,
    proposedAmountPhp: input.committedAmountPhp,
    warningThresholdPct: budgetLine.warningThresholdPct,
    hardBlockPct: budgetLine.hardBlockPct,
  });

  if (threshold.requiresApprovedOverride && !input.overrideApproval) {
    throw new Error("BUDGET_HARD_BLOCK_OVERRIDE_REQUIRED");
  }
  if (threshold.requiresApprovedOverride) {
    if (!input.overrideApproval?.reason.trim()) {
      throw new Error("BUDGET_OVERRIDE_REASON_REQUIRED");
    }
    if (!input.overrideApproval.evidenceReference.trim()) {
      throw new Error("BUDGET_OVERRIDE_EVIDENCE_REQUIRED");
    }
    if (input.overrideApproval.approvedByUserId === session.user.id) {
      throw new Error("BUDGET_OVERRIDE_SELF_APPROVAL_BLOCKED");
    }
  }

  const sourceSnapshot = {
    summary: input.sourceSummary,
    threshold,
    overrideApproval: input.overrideApproval ?? null,
    boundary: "budget_commitment_only_no_source_mutation",
  };
  const approvedByUserId =
    input.status === "APPROVED"
      ? session.user.id
      : (input.overrideApproval?.approvedByUserId ?? null);
  const approvedAt =
    input.status === "APPROVED" || input.overrideApproval ? new Date() : null;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.budgetCommitment.findUnique({
      where: {
        companyId_sourceType_sourceId_sourceEventKey: {
          companyId: session.context.companyId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceEventKey: input.sourceEventKey,
        },
      },
      select: {
        id: true,
      },
    });

    const commitment = await tx.budgetCommitment.upsert({
      where: {
        companyId_sourceType_sourceId_sourceEventKey: {
          companyId: session.context.companyId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceEventKey: input.sourceEventKey,
        },
      },
      create: {
        budgetId: budgetLine.budgetId,
        budgetLineId: budgetLine.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceLineId: input.sourceLineId ?? null,
        sourceEventKey: input.sourceEventKey,
        sourceEventAt: input.sourceEventAt,
        sourceReference: input.sourceReference,
        sourceSnapshot,
        status: input.status ?? "PENDING",
        committedAmountPhp: input.committedAmountPhp,
        requestedByUserId: session.user.id,
        approvedByUserId,
        requestedAt: new Date(),
        approvedAt,
      },
      update: {
        budgetId: budgetLine.budgetId,
        budgetLineId: budgetLine.id,
        sourceLineId: input.sourceLineId ?? null,
        sourceEventAt: input.sourceEventAt,
        sourceReference: input.sourceReference,
        sourceSnapshot,
        status: input.status ?? "PENDING",
        committedAmountPhp: input.committedAmountPhp,
        requestedByUserId: session.user.id,
        approvedByUserId,
        requestedAt: new Date(),
        approvedAt,
      },
      select: {
        id: true,
        status: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: existing
          ? "budget.commitment_updated"
          : "budget.commitment_created",
        entityType: "BudgetCommitment",
        entityId: commitment.id,
        afterData: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceReference: input.sourceReference,
          committedAmountPhp: input.committedAmountPhp,
          status: commitment.status,
        },
        metadata: {
          budgetLineId: budgetLine.id,
          budgetId: budgetLine.budgetId,
          thresholdState: threshold.state,
          requiresApprovedOverride: threshold.requiresApprovedOverride,
          noSourceMutation: true,
        },
      },
    });

    return {
      commitmentId: commitment.id,
      status: commitment.status,
      threshold,
      created: !existing,
    };
  });
}

export async function projectBudgetCommitmentFromApprovedSourceEvent(
  tx: TransactionClient,
  session: SessionContext,
  input: BudgetSourceCommitmentInput,
): Promise<BudgetSourceCommitmentResult> {
  if (input.committedAmountPhp <= 0) {
    throw new Error("BUDGET_COMMITMENT_AMOUNT_REQUIRED");
  }

  const budgetLine = await tx.budgetLine.findFirst({
    where: {
      id: input.budgetLineId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
    },
    include: {
      budget: true,
      commitments: {
        where: {
          status: { in: ["PENDING", "APPROVED", "CONSUMED"] },
          NOT: {
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            sourceEventKey: input.sourceEventKey,
          },
        },
        select: {
          committedAmountPhp: true,
          consumedAmountPhp: true,
          releasedAmountPhp: true,
          status: true,
        },
      },
    },
  });

  if (
    !budgetLine ||
    budgetLine.budget.companyId !== session.context.companyId
  ) {
    throw new Error("BUDGET_LINE_NOT_FOUND");
  }
  assertCanUseBudgetLine({ session, budgetLine });

  const committedAmount = budgetLine.commitments.reduce(
    (sum, commitment) => sum + decimalToNumber(commitment.committedAmountPhp),
    0,
  );
  const actualAmount = await getPostedActualAmountForLine({ budgetLine });
  const threshold = evaluateBudgetThreshold({
    revisedAmountPhp: budgetLine.revisedAmountPhp,
    committedAmountPhp: committedAmount,
    actualAmountPhp: actualAmount,
    proposedAmountPhp: input.committedAmountPhp,
    warningThresholdPct: budgetLine.warningThresholdPct,
    hardBlockPct: budgetLine.hardBlockPct,
  });
  const status = input.status ?? "PENDING";
  const sourceSnapshot = {
    summary: input.sourceSummary,
    threshold,
    boundary: "budget_commitment_only_no_source_mutation",
    projectionMode: "warning_first",
    hardBlockDeferred: true,
  };

  const existing = await tx.budgetCommitment.findUnique({
    where: {
      companyId_sourceType_sourceId_sourceEventKey: {
        companyId: session.context.companyId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceEventKey: input.sourceEventKey,
      },
    },
    select: {
      id: true,
    },
  });

  const commitment = await tx.budgetCommitment.upsert({
    where: {
      companyId_sourceType_sourceId_sourceEventKey: {
        companyId: session.context.companyId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceEventKey: input.sourceEventKey,
      },
    },
    create: {
      budgetId: budgetLine.budgetId,
      budgetLineId: budgetLine.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceLineId: input.sourceLineId ?? null,
      sourceEventKey: input.sourceEventKey,
      sourceEventAt: input.sourceEventAt,
      sourceReference: input.sourceReference,
      sourceSnapshot,
      status,
      committedAmountPhp: input.committedAmountPhp,
      requestedByUserId: session.user.id,
      requestedAt: new Date(),
    },
    update: {
      budgetId: budgetLine.budgetId,
      budgetLineId: budgetLine.id,
      sourceLineId: input.sourceLineId ?? null,
      sourceEventAt: input.sourceEventAt,
      sourceReference: input.sourceReference,
      sourceSnapshot,
      status,
      committedAmountPhp: input.committedAmountPhp,
      requestedByUserId: session.user.id,
      requestedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
    },
  });

  await tx.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: existing
        ? "budget.commitment_source_projection_updated"
        : "budget.commitment_source_projection_created",
      entityType: "BudgetCommitment",
      entityId: commitment.id,
      afterData: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceReference: input.sourceReference,
        committedAmountPhp: input.committedAmountPhp,
        status: commitment.status,
      },
      metadata: {
        budgetLineId: budgetLine.id,
        budgetId: budgetLine.budgetId,
        thresholdState: threshold.state,
        requiresReview: threshold.requiresReview,
        requiresApprovedOverride: threshold.requiresApprovedOverride,
        warningFirst: true,
        hardBlockDeferred: true,
        noSourceMutation: true,
      },
    },
  });

  return {
    commitmentId: commitment.id,
    status: commitment.status,
    threshold,
    created: !existing,
  };
}

export async function reverseBudgetCommitmentFromApprovedSourceEvent(
  tx: TransactionClient,
  session: SessionContext,
  input: BudgetSourceCommitmentReversalInput,
) {
  if (!input.reason.trim()) {
    throw new Error("BUDGET_COMMITMENT_REVERSAL_REASON_REQUIRED");
  }

  const original = await tx.budgetCommitment.findUnique({
    where: {
      companyId_sourceType_sourceId_sourceEventKey: {
        companyId: session.context.companyId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceEventKey: input.sourceEventKey,
      },
    },
    include: {
      budgetLine: true,
    },
  });

  if (!original) {
    return null;
  }
  if (original.tenantId !== session.context.tenantId) {
    throw new Error("BUDGET_COMMITMENT_NOT_FOUND");
  }
  assertCanUseBudgetLine({ session, budgetLine: original.budgetLine });

  const existingReversal = await tx.budgetCommitment.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      reversalOfCommitmentId: original.id,
      sourceEventKey: input.reversalEventKey,
    },
    select: {
      id: true,
      status: true,
    },
  });
  if (existingReversal) {
    return existingReversal;
  }

  const reversedAt = new Date();
  await tx.budgetCommitment.update({
    where: { id: original.id },
    data: {
      status: "REVERSED",
      reversedByUserId: session.user.id,
      reversedAt,
      reversalReason: input.reason,
    },
  });

  const reversal = await tx.budgetCommitment.create({
    data: {
      budgetId: original.budgetId,
      budgetLineId: original.budgetLineId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      sourceLineId: `reversal:${input.reversalEventKey}`,
      sourceEventKey: input.reversalEventKey,
      sourceEventAt: reversedAt,
      sourceReference: `${original.sourceReference} reversal`,
      sourceSnapshot: {
        summary: input.reason,
        reversalOfCommitmentId: original.id,
        boundary: "budget_reversal_only_no_source_mutation",
        projectionMode: "source_transition_reversal",
      },
      status: "REVERSED",
      committedAmountPhp: original.committedAmountPhp,
      consumedAmountPhp: 0,
      releasedAmountPhp: 0,
      requestedByUserId: session.user.id,
      reversedByUserId: session.user.id,
      reversedAt,
      reversalReason: input.reason,
      reversalOfCommitmentId: original.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  await tx.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: "budget.commitment_source_projection_reversed",
      entityType: "BudgetCommitment",
      entityId: original.id,
      beforeData: {
        status: original.status,
      },
      afterData: {
        status: "REVERSED",
        reversalCommitmentId: reversal.id,
      },
      metadata: {
        reason: input.reason,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceEventKey: input.sourceEventKey,
        reversalEventKey: input.reversalEventKey,
        noSourceMutation: true,
        sourceTransitionReversal: true,
      },
    },
  });

  return reversal;
}

export async function reverseBudgetCommitmentFromSourceEvent(
  session: SessionContext,
  input: BudgetSourceCommitmentReversalInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetCommitmentReview);
  if (!input.reason.trim()) {
    throw new Error("BUDGET_COMMITMENT_REVERSAL_REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const original = await tx.budgetCommitment.findUnique({
      where: {
        companyId_sourceType_sourceId_sourceEventKey: {
          companyId: session.context.companyId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceEventKey: input.sourceEventKey,
        },
      },
      include: {
        budgetLine: true,
      },
    });

    if (!original || original.tenantId !== session.context.tenantId) {
      throw new Error("BUDGET_COMMITMENT_NOT_FOUND");
    }
    assertCanUseBudgetLine({ session, budgetLine: original.budgetLine });

    const existingReversal = await tx.budgetCommitment.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        reversalOfCommitmentId: original.id,
        sourceEventKey: input.reversalEventKey,
      },
      select: {
        id: true,
        status: true,
      },
    });
    if (existingReversal) {
      return existingReversal;
    }

    await tx.budgetCommitment.update({
      where: { id: original.id },
      data: {
        status: "REVERSED",
        reversedByUserId: session.user.id,
        reversedAt: new Date(),
        reversalReason: input.reason,
      },
    });

    const reversal = await tx.budgetCommitment.create({
      data: {
        budgetId: original.budgetId,
        budgetLineId: original.budgetLineId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceType: original.sourceType,
        sourceId: original.sourceId,
        sourceLineId: `reversal:${input.reversalEventKey}`,
        sourceEventKey: input.reversalEventKey,
        sourceEventAt: new Date(),
        sourceReference: `${original.sourceReference} reversal`,
        sourceSnapshot: {
          summary: input.reason,
          reversalOfCommitmentId: original.id,
          boundary: "budget_reversal_only_no_source_mutation",
        },
        status: "REVERSED",
        committedAmountPhp: original.committedAmountPhp,
        consumedAmountPhp: 0,
        releasedAmountPhp: 0,
        requestedByUserId: session.user.id,
        reversedByUserId: session.user.id,
        reversedAt: new Date(),
        reversalReason: input.reason,
        reversalOfCommitmentId: original.id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "budget.commitment_reversed",
        entityType: "BudgetCommitment",
        entityId: original.id,
        beforeData: {
          status: original.status,
        },
        afterData: {
          status: "REVERSED",
          reversalCommitmentId: reversal.id,
        },
        metadata: {
          reason: input.reason,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceEventKey: input.sourceEventKey,
          reversalEventKey: input.reversalEventKey,
          noSourceMutation: true,
        },
      },
    });

    return reversal;
  });
}

export async function createDraftBudget(
  session: SessionContext,
  input: CreateDraftBudgetInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetManage);

  const name = cleanText(input.name);
  const description = cleanText(input.description) || null;
  const budgetType = cleanText(input.budgetType) || "OPERATING";
  const locationId = cleanText(input.locationId);
  const departmentId = cleanText(input.departmentId) || null;
  const accountId = cleanText(input.accountId);
  const lineCode = cleanText(input.lineCode).toUpperCase();
  const lineName = cleanText(input.lineName);
  const lineDescription = cleanText(input.lineDescription) || null;
  const reason = cleanText(input.reason);
  const evidenceReference = cleanText(input.evidenceReference) || null;
  const amountPhp = Number(input.amountPhp);
  const warningThresholdPct = normalizeThresholdPct(
    input.warningThresholdPct,
    80,
    "BUDGET_WARNING_THRESHOLD_INVALID",
  );
  const hardBlockPct =
    input.hardBlockPct == null || Number.isNaN(input.hardBlockPct)
      ? null
      : normalizeThresholdPct(
          input.hardBlockPct,
          100,
          "BUDGET_HARD_BLOCK_THRESHOLD_INVALID",
        );

  if (!name) {
    throw new Error("BUDGET_NAME_REQUIRED");
  }
  if (!locationId) {
    throw new Error("BUDGET_LOCATION_REQUIRED");
  }
  if (!accountId) {
    throw new Error("BUDGET_ACCOUNT_REQUIRED");
  }
  if (!lineCode || !lineName) {
    throw new Error("BUDGET_LINE_REQUIRED");
  }
  assertReason(reason, "BUDGET_CREATION_REASON_REQUIRED");
  assertPositiveAmount(amountPhp, "BUDGET_POSITIVE_AMOUNT_REQUIRED");
  assertValidDate(input.periodStart, "BUDGET_PERIOD_START_INVALID");
  assertValidDate(input.periodEnd, "BUDGET_PERIOD_END_INVALID");
  if (input.periodEnd < input.periodStart) {
    throw new Error("BUDGET_PERIOD_INVALID");
  }
  if (hardBlockPct != null && hardBlockPct < warningThresholdPct) {
    throw new Error("BUDGET_HARD_BLOCK_BELOW_WARNING");
  }

  return prisma.$transaction(async (tx) => {
    await requireBudgetPermissionInTransaction(tx, session);
    await requireBudgetScopeInTransaction(tx, session, {
      scopeType: "LOCATION",
      scopeId: locationId,
    });
    if (departmentId) {
      await requireBudgetScopeInTransaction(tx, session, {
        scopeType: "DEPARTMENT",
        scopeId: departmentId,
        allowCompanyManage: true,
      });
    }

    const [location, department, account, fiscalYear] = await Promise.all([
      tx.location.findFirst({
        where: {
          id: locationId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE",
        },
        select: { id: true, brandId: true, name: true },
      }),
      departmentId
        ? tx.department.findFirst({
            where: {
              id: departmentId,
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              status: "ACTIVE",
            },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve(null),
      tx.chartOfAccount.findFirst({
        where: {
          id: accountId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE",
          postingAllowed: true,
          isHeader: false,
        },
        select: { id: true, code: true, name: true },
      }),
      tx.fiscalYear.findFirst({
        where: {
          id: input.fiscalYearId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: { in: ["DRAFT", "OPEN"] },
        },
        select: { id: true, code: true, startDate: true, endDate: true },
      }),
    ]);

    if (!location) {
      throw new Error("BUDGET_LOCATION_NOT_FOUND");
    }
    if (departmentId && !department) {
      throw new Error("BUDGET_DEPARTMENT_NOT_FOUND");
    }
    if (!account) {
      throw new Error("BUDGET_ACCOUNT_NOT_POSTABLE");
    }
    if (!fiscalYear) {
      throw new Error("BUDGET_FISCAL_YEAR_REQUIRED");
    }
    if (
      input.periodStart < fiscalYear.startDate ||
      input.periodEnd > fiscalYear.endDate
    ) {
      throw new Error("BUDGET_PERIOD_OUTSIDE_FISCAL_YEAR");
    }

    const accountingPeriod = await tx.accountingPeriod.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        fiscalYearId: fiscalYear.id,
        startDate: { lte: input.periodStart },
        endDate: { gte: input.periodEnd },
      },
      select: { id: true, code: true },
    });

    const publicReference =
      cleanText(input.publicReference) ||
      nextBudgetReference({
        fiscalYearCode: fiscalYear.code,
        idempotencyKey: input.idempotencyKey,
        name,
        lineCode,
        locationId,
        departmentId: departmentId ?? "no-department",
      });

    const existing = await tx.budget.findUnique({
      where: {
        companyId_publicReference: {
          companyId: session.context.companyId,
          publicReference,
        },
      },
      include: { lines: { select: { id: true, locationId: true } } },
    });
    if (existing) {
      if (
        existing.createdByUserId === session.user.id &&
        existing.status === "DRAFT"
      ) {
        assertBudgetScope({ session, budget: existing });
        return existing;
      }
      throw new Error("BUDGET_REFERENCE_ALREADY_EXISTS");
    }

    const budget = await tx.budget.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        publicReference,
        fiscalYearId: fiscalYear.id,
        name,
        description,
        budgetType,
        status: "DRAFT",
        currencyCode: "PHP",
        brandId: location.brandId ?? null,
        locationId: location.id,
        departmentId: department?.id ?? null,
        ownerUserId: session.user.id,
        createdByUserId: session.user.id,
        totalOriginalAmount: amountPhp,
        totalRevisedAmount: amountPhp,
        policyConfiguration: {
          phase: "phase3_create_only",
          currencyCode: "PHP",
          thresholdPolicy: "warning_first",
          warningThresholdPct,
          hardBlockPct,
          locationName: location.name,
          departmentCode: department?.code ?? null,
          departmentName: department?.name ?? null,
          accountCode: account.code,
          noSourceMutation: true,
          noPaymentMutation: true,
          noJournalPosting: true,
        },
        lines: {
          create: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            accountingPeriodId: accountingPeriod?.id ?? null,
            accountId: account.id,
            lineNumber: 1,
            code: lineCode,
            name: lineName,
            description: lineDescription,
            brandId: location.brandId ?? null,
            locationId: location.id,
            departmentId: department?.id ?? null,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            originalAmountPhp: amountPhp,
            revisedAmountPhp: amountPhp,
            reservedAmountPhp: 0,
            warningThresholdPct,
            hardBlockPct,
            status: "DRAFT",
          },
        },
      },
      include: { lines: { select: { id: true, locationId: true } } },
    });

    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.created",
      beforeStatus: "NONE",
      afterStatus: budget.status,
      reason,
      evidenceReference,
      metadata: {
        phase: "phase3_create_only",
        idempotencyKey: input.idempotencyKey ?? null,
        publicReference,
        fiscalYearCode: fiscalYear.code,
        accountingPeriodCode: accountingPeriod?.code ?? null,
        locationName: location.name,
        departmentId: department?.id ?? null,
        departmentCode: department?.code ?? null,
        departmentName: department?.name ?? null,
        accountCode: account.code,
        lineCount: 1,
        totalOriginalAmountPhp: amountPhp,
        totalRevisedAmountPhp: amountPhp,
      },
    });

    return budget;
  });
}

export async function createDraftBudgetRevision(
  session: SessionContext,
  input: CreateDraftBudgetRevisionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetManage);

  const revisionType = input.revisionType ?? "AMENDMENT";
  if (!["AMENDMENT", "REBASE", "REALLOCATION"].includes(revisionType)) {
    throw new Error("BUDGET_REVISION_TYPE_INVALID");
  }
  const reason = cleanText(input.reason);
  const evidenceReference = cleanText(input.evidenceReference) || null;
  const proposedAmountPhp = Number(input.proposedAmountPhp);
  assertReason(reason, "BUDGET_REVISION_REASON_REQUIRED");
  assertPositiveAmount(proposedAmountPhp, "BUDGET_REVISION_AMOUNT_REQUIRED");
  if (input.effectiveFrom) {
    assertValidDate(
      input.effectiveFrom,
      "BUDGET_REVISION_EFFECTIVE_FROM_INVALID",
    );
  }
  if (input.effectiveTo) {
    assertValidDate(input.effectiveTo, "BUDGET_REVISION_EFFECTIVE_TO_INVALID");
  }
  if (
    input.effectiveFrom &&
    input.effectiveTo &&
    input.effectiveTo < input.effectiveFrom
  ) {
    throw new Error("BUDGET_REVISION_EFFECTIVE_RANGE_INVALID");
  }

  return prisma.$transaction(async (tx) => {
    const budgetLine = await tx.budgetLine.findFirst({
      where: {
        id: input.budgetLineId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["DRAFT", "ACTIVE"] },
        budget: {
          status: { in: ["APPROVED", "ACTIVE", "PARTIALLY_RELEASED"] },
        },
      },
      include: {
        account: { select: { code: true, name: true } },
        location: { select: { name: true } },
        budget: {
          include: {
            lines: {
              select: {
                id: true,
                locationId: true,
              },
            },
          },
        },
        commitments: {
          where: {
            status: { in: ["PENDING", "APPROVED", "CONSUMED"] },
          },
          select: {
            committedAmountPhp: true,
            consumedAmountPhp: true,
            releasedAmountPhp: true,
            status: true,
          },
        },
      },
    });

    if (!budgetLine) {
      throw new Error("BUDGET_REVISION_LINE_NOT_FOUND");
    }
    assertBudgetScope({ session, budget: budgetLine.budget });
    assertCanUseBudgetLine({ session, budgetLine });

    const currentAmountPhp = decimalToNumber(budgetLine.revisedAmountPhp);
    if (proposedAmountPhp === currentAmountPhp) {
      throw new Error("BUDGET_REVISION_AMOUNT_UNCHANGED");
    }
    const totalRevisedAmountPhp = decimalToNumber(
      budgetLine.budget.totalRevisedAmount,
    );
    const proposedTotalAmountPhp =
      totalRevisedAmountPhp - currentAmountPhp + proposedAmountPhp;
    if (proposedTotalAmountPhp <= 0) {
      throw new Error("BUDGET_REVISION_TOTAL_INVALID");
    }

    const revisionNumber =
      (
        await tx.budgetRevision.aggregate({
          where: {
            budgetId: budgetLine.budgetId,
          },
          _max: {
            revisionNumber: true,
          },
        })
      )._max.revisionNumber ?? 0;

    const originalSnapshot = {
      budgetId: budgetLine.budgetId,
      budgetReference: budgetLine.budget.publicReference,
      budgetStatus: budgetLine.budget.status,
      budgetLineId: budgetLine.id,
      lineCode: budgetLine.code,
      lineName: budgetLine.name,
      accountCode: budgetLine.account?.code ?? null,
      accountName: budgetLine.account?.name ?? null,
      locationName: budgetLine.location?.name ?? "Company-wide",
      currentAmountPhp,
      totalRevisedAmountPhp,
      commitmentCount: budgetLine.commitments.length,
    };
    const proposedSnapshot = {
      ...originalSnapshot,
      proposedAmountPhp,
      proposedTotalAmountPhp,
      amountDeltaPhp: proposedAmountPhp - currentAmountPhp,
      evidenceReference,
      idempotencyKey: input.idempotencyKey ?? null,
      boundary: "budget_revision_request_only_no_budget_mutation",
      noSourceMutation: true,
      noPaymentMutation: true,
      noJournalPosting: true,
    };

    const revision = await tx.budgetRevision.create({
      data: {
        budgetId: budgetLine.budgetId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        revisionNumber: revisionNumber + 1,
        revisionType,
        status: "DRAFT",
        reason,
        requestedByUserId: session.user.id,
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveTo: input.effectiveTo ?? null,
        originalSnapshot,
        proposedSnapshot,
      },
    });

    await writeBudgetAudit(tx, {
      session,
      budgetId: budgetLine.budgetId,
      eventType: "budget.revision_drafted",
      beforeStatus: budgetLine.budget.status,
      afterStatus: budgetLine.budget.status,
      reason,
      evidenceReference,
      metadata: {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        revisionType,
        budgetLineId: budgetLine.id,
        currentAmountPhp,
        proposedAmountPhp,
        idempotencyKey: input.idempotencyKey ?? null,
        budgetMutationDeferred: true,
        lineMutationDeferred: true,
      },
    });

    return revision;
  });
}

export async function submitBudgetRevisionForReview(
  session: SessionContext,
  input: BudgetRevisionLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetManage);
  return prisma.$transaction(async (tx) => {
    const revision = await getScopedBudgetRevisionOrThrow(
      tx,
      session,
      input.budgetRevisionId,
    );
    if (revision.status === "SUBMITTED") {
      return revision;
    }
    assertBudgetRevisionTransition({
      transition: "submit",
      status: revision.status,
    });
    const approvalRule = await findBudgetRevisionApprovalRule(tx, session);
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("BUDGET_REVISION_APPROVAL_RULE_NOT_CONFIGURED");
    }
    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("BUDGET_REVISION_APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }
    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "BudgetRevision",
        documentId: revision.id,
        status: "PENDING",
      },
    });
    if (existingApproval) {
      throw new Error("BUDGET_REVISION_ALREADY_SUBMITTED");
    }
    const routedSteps = approvalRule.steps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const,
    }));
    const firstRoutedStep = routedSteps[0];
    if (!firstRoutedStep) {
      throw new Error("BUDGET_REVISION_APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }
    const locationIds = [...new Set([
      revision.budget.locationId,
      ...revision.budget.lines.map((line) => line.locationId),
    ].filter((locationId): locationId is string => Boolean(locationId)))].sort();
    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "BudgetRevision",
        documentId: revision.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: routedSteps.map((step) => ({
            id: step.approvalInstanceStepId,
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: step.activationStatus,
          })),
        },
      },
    });
    const prohibitedActors = [{
      userId: revision.requestedByUserId,
      reasonCode: "REQUESTER",
    }];
    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        routingPolicy: getApprovalRoutingPolicy("BudgetRevision"),
        requiredPermissionCode: permissions.financeBudgetApprove,
        dueAt: revision.effectiveFrom ?? null,
        activationAudit: {
          actorUserId: session.user.id,
          source: "budget_revision.submit",
        },
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: locationIds.length > 0 ? "ALL" : "ANY",
          targets: locationIds.length > 0
            ? locationIds.map((locationId) => ({
                scopeType: "LOCATION" as const,
                companyId: session.context.companyId,
                locationId,
              }))
            : [{
                scopeType: "COMPANY" as const,
                companyId: session.context.companyId,
              }],
        }],
        prohibitedActors,
      });
    }
    await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId,
    });
    const updated = await tx.budgetRevision.update({
      where: { id: revision.id },
      data: { status: "SUBMITTED" },
    });
    const auditEvent = await writeBudgetAudit(tx, {
      session,
      budgetId: revision.budgetId,
      eventType: "budget.revision_submitted",
      beforeStatus: revision.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? revision.reason,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        approvalInstanceId: approvalInstance.id,
        approvalRuleId: approvalRule.id,
        idempotencyKey: input.idempotencyKey ?? null,
        budgetMutationDeferred: true,
        lineMutationDeferred: true,
      },
    });
    const locationId = budgetApprovalLocationId(revision.budget);
    if (firstStep.userId) await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId,
      recipientUserIds: [firstStep.userId],
      notificationType: "APPROVE_BUDGET_REVISION",
      priority: "NORMAL",
      title: `Approve Budget Revision ${revision.budget.publicReference} R${revision.revisionNumber}`,
      body: `${session.user.displayName} submitted a budget revision for ${revision.budget.name}.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "BudgetRevision",
      entityId: revision.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        budgetId: revision.budgetId,
        budgetReference: revision.budget.publicReference,
        revisionNumber: revision.revisionNumber,
        budgetMutationDeferred: true,
        lineMutationDeferred: true,
      },
    });
    return updated;
  });
}

export async function startBudgetRevisionReview(
  session: SessionContext,
  input: BudgetRevisionLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetCommitmentReview);
  return prisma.$transaction(async (tx) => {
    const revision = await getScopedBudgetRevisionOrThrow(
      tx,
      session,
      input.budgetRevisionId,
    );
    if (revision.status === "UNDER_REVIEW") {
      return revision;
    }
    assertBudgetRevisionTransition({
      transition: "start_review",
      status: revision.status,
    });
    const updated = await tx.budgetRevision.update({
      where: { id: revision.id },
      data: { status: "UNDER_REVIEW" },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: revision.budgetId,
      eventType: "budget.revision_review_started",
      beforeStatus: revision.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        reviewedForCommitmentFit: true,
        budgetMutationDeferred: true,
        lineMutationDeferred: true,
      },
    });
    return updated;
  });
}

export async function approveBudgetRevision(
  session: SessionContext,
  input: BudgetRevisionLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetApprove);
  return prisma.$transaction(async (tx) => {
    const revision = await getScopedBudgetRevisionOrThrow(
      tx,
      session,
      input.budgetRevisionId,
    );
    if (revision.status === "APPROVED") {
      return revision;
    }
    assertBudgetRevisionTransition({
      transition: "approve",
      status: revision.status,
    });
    if (revision.requestedByUserId === session.user.id) {
      throw new Error("BUDGET_REVISION_SELF_APPROVAL_BLOCKED");
    }
    const approvedSnapshot = {
      ...jsonRecord(revision.proposedSnapshot),
      approvedByUserId: session.user.id,
      approvedAt: new Date().toISOString(),
      budgetMutationDeferred: true,
      lineMutationDeferred: true,
      noSourceMutation: true,
      noPaymentMutation: true,
      noJournalPosting: true,
    };
    const updated = await tx.budgetRevision.update({
      where: { id: revision.id },
      data: {
        status: "APPROVED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        approvedSnapshot,
      },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: revision.budgetId,
      eventType: "budget.revision_approved",
      beforeStatus: revision.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? revision.reason,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        noSelfApproval: true,
        approvedRequestOnly: true,
        budgetMutationDeferred: true,
        lineMutationDeferred: true,
      },
    });
    return updated;
  });
}

export async function rejectBudgetRevision(
  session: SessionContext,
  input: BudgetRevisionLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetApprove);
  assertReason(input.reason, "BUDGET_REVISION_REJECTION_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const revision = await getScopedBudgetRevisionOrThrow(
      tx,
      session,
      input.budgetRevisionId,
    );
    if (revision.status === "REJECTED") {
      return revision;
    }
    assertBudgetRevisionTransition({
      transition: "reject",
      status: revision.status,
    });
    const updated = await tx.budgetRevision.update({
      where: { id: revision.id },
      data: {
        status: "REJECTED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
      },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: revision.budgetId,
      eventType: "budget.revision_rejected",
      beforeStatus: revision.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        budgetMutationDeferred: true,
        lineMutationDeferred: true,
      },
    });
    return updated;
  });
}

export async function cancelBudgetRevision(
  session: SessionContext,
  input: BudgetRevisionLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetManage);
  assertReason(input.reason, "BUDGET_REVISION_CANCELLATION_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const revision = await getScopedBudgetRevisionOrThrow(
      tx,
      session,
      input.budgetRevisionId,
    );
    if (revision.status === "CANCELLED") {
      return revision;
    }
    assertBudgetRevisionTransition({
      transition: "cancel",
      status: revision.status,
    });
    const updated = await tx.budgetRevision.update({
      where: { id: revision.id },
      data: { status: "CANCELLED" },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: revision.budgetId,
      eventType: "budget.revision_cancelled",
      beforeStatus: revision.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        budgetMutationDeferred: true,
        lineMutationDeferred: true,
      },
    });
    return updated;
  });
}

export async function submitBudgetForReview(
  session: SessionContext,
  input: BudgetLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetManage);
  return prisma.$transaction(async (tx) => {
    const budget = await getScopedBudgetOrThrow(tx, session, input.budgetId);
    if (budget.status === "SUBMITTED") {
      return budget;
    }
    assertBudgetTransition({ transition: "submit", status: budget.status });
    assertBudgetHasValidLines({ lines: budget.lines });

    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "SUBMITTED",
        submittedByUserId: session.user.id,
        submittedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.submitted",
      beforeStatus: budget.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        lineCount: budget.lines.length,
      },
    });
    return updated;
  });
}

export async function startBudgetReview(
  session: SessionContext,
  input: BudgetLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetCommitmentReview);
  return prisma.$transaction(async (tx) => {
    const budget = await getScopedBudgetOrThrow(tx, session, input.budgetId);
    if (budget.status === "UNDER_REVIEW") {
      return budget;
    }
    assertBudgetTransition({
      transition: "start_review",
      status: budget.status,
    });

    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "UNDER_REVIEW",
        version: { increment: 1 },
      },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.review_started",
      beforeStatus: budget.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        reviewedForCommitmentFit: true,
      },
    });
    return updated;
  });
}

export async function approveBudget(
  session: SessionContext,
  input: BudgetLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetApprove);
  return prisma.$transaction(async (tx) => {
    const budget = await getScopedBudgetOrThrow(tx, session, input.budgetId);
    if (budget.status === "APPROVED") {
      return budget;
    }
    assertBudgetTransition({ transition: "approve", status: budget.status });
    if (
      budget.createdByUserId === session.user.id ||
      budget.submittedByUserId === session.user.id
    ) {
      throw new Error("BUDGET_SELF_APPROVAL_BLOCKED");
    }

    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.approved",
      beforeStatus: budget.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        noSelfApproval: true,
      },
    });
    return updated;
  });
}

export async function returnBudgetForRevision(
  session: SessionContext,
  input: BudgetLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetApprove);
  assertReason(input.reason, "BUDGET_RETURN_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const budget = await getScopedBudgetOrThrow(tx, session, input.budgetId);
    if (budget.status === "RETURNED") {
      return budget;
    }
    assertBudgetTransition({ transition: "return", status: budget.status });

    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "RETURNED",
        version: { increment: 1 },
      },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.returned",
      beforeStatus: budget.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return updated;
  });
}

export async function rejectBudget(
  session: SessionContext,
  input: BudgetLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetApprove);
  assertReason(input.reason, "BUDGET_REJECTION_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const budget = await getScopedBudgetOrThrow(tx, session, input.budgetId);
    if (budget.status === "REJECTED") {
      return budget;
    }
    assertBudgetTransition({ transition: "reject", status: budget.status });

    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "REJECTED",
        version: { increment: 1 },
      },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.rejected",
      beforeStatus: budget.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return updated;
  });
}

export async function activateBudget(
  session: SessionContext,
  input: BudgetLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetApprove);
  return prisma.$transaction(async (tx) => {
    const budget = await getScopedBudgetOrThrow(tx, session, input.budgetId);
    if (budget.status === "ACTIVE") {
      return budget;
    }
    assertBudgetTransition({ transition: "activate", status: budget.status });

    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await tx.budgetLine.updateMany({
      where: {
        budgetId: budget.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["DRAFT", "SUSPENDED"] },
      },
      data: { status: "ACTIVE" },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.activated",
      beforeStatus: budget.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        budgetLinesActivated: true,
      },
    });
    return updated;
  });
}

export async function closeBudget(
  session: SessionContext,
  input: BudgetLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetApprove);
  assertReason(input.reason, "BUDGET_CLOSE_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const budget = await getScopedBudgetOrThrow(tx, session, input.budgetId);
    if (budget.status === "CLOSED") {
      return budget;
    }
    assertBudgetTransition({ transition: "close", status: budget.status });
    const openCommitments = budget.commitments.filter((commitment) =>
      ["PENDING", "APPROVED"].includes(commitment.status),
    );
    if (openCommitments.length > 0) {
      throw new Error("BUDGET_OPEN_COMMITMENTS_BLOCK_CLOSE");
    }

    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await tx.budgetLine.updateMany({
      where: {
        budgetId: budget.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
      data: { status: "CLOSED" },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.closed",
      beforeStatus: budget.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        openCommitmentCount: openCommitments.length,
      },
    });
    return updated;
  });
}

export async function cancelBudget(
  session: SessionContext,
  input: BudgetLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetManage);
  assertReason(input.reason, "BUDGET_CANCELLATION_REASON_REQUIRED");
  const reason = input.reason!.trim();
  return prisma.$transaction(async (tx) => {
    const budget = await getScopedBudgetOrThrow(tx, session, input.budgetId);
    if (budget.status === "CANCELLED") {
      return budget;
    }
    assertBudgetTransition({ transition: "cancel", status: budget.status });

    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "CANCELLED",
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
        cancellationReason: reason,
        version: { increment: 1 },
      },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.cancelled",
      beforeStatus: budget.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return updated;
  });
}

export async function archiveBudget(
  session: SessionContext,
  input: BudgetLifecycleActionInput,
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetManage);
  assertReason(input.reason, "BUDGET_ARCHIVE_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const budget = await getScopedBudgetOrThrow(tx, session, input.budgetId);
    if (budget.status === "ARCHIVED") {
      return budget;
    }
    assertBudgetTransition({ transition: "archive", status: budget.status });

    const updated = await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: "ARCHIVED",
        version: { increment: 1 },
      },
    });
    await tx.budgetLine.updateMany({
      where: {
        budgetId: budget.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { not: "ARCHIVED" },
      },
      data: { status: "ARCHIVED" },
    });
    await writeBudgetAudit(tx, {
      session,
      budgetId: budget.id,
      eventType: "budget.archived",
      beforeStatus: budget.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: input.evidenceReference?.trim() ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return updated;
  });
}

export async function getBudgetControlDashboard(
  session: SessionContext,
): Promise<BudgetControlDashboard> {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  await requirePermission(session, permissions.financeBudgetView);

  const authorizedLocationIds = session.authorizedLocations.map(
    (location) => location.locationId,
  );

  const lines = await prisma.budgetLine.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      budget: {
        status: { in: ["APPROVED", "ACTIVE", "PARTIALLY_RELEASED"] },
      },
      OR: [{ locationId: null }, { locationId: { in: authorizedLocationIds } }],
    },
    include: {
      budget: {
        select: {
          id: true,
          publicReference: true,
          name: true,
        },
      },
      account: {
        select: {
          name: true,
        },
      },
      location: {
        select: {
          name: true,
        },
      },
      department: {
        select: {
          name: true,
        },
      },
      commitments: {
        select: {
          status: true,
          committedAmountPhp: true,
          consumedAmountPhp: true,
          releasedAmountPhp: true,
        },
      },
    },
    orderBy: [{ budget: { publicReference: "asc" } }, { lineNumber: "asc" }],
    take: 50,
  });

  const accountIds = Array.from(
    new Set(lines.map((line) => line.accountId).filter(Boolean)),
  ) as string[];
  const earliestPeriod = lines.reduce<Date | null>(
    (earliest, line) =>
      earliest == null || line.periodStart < earliest
        ? line.periodStart
        : earliest,
    null,
  );
  const latestPeriod = lines.reduce<Date | null>(
    (latest, line) =>
      latest == null || line.periodEnd > latest ? line.periodEnd : latest,
    null,
  );

  const actuals =
    accountIds.length > 0 && earliestPeriod && latestPeriod
      ? await prisma.financeJournalLine.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            accountId: { in: accountIds },
            OR: [
              { locationId: null },
              { locationId: { in: authorizedLocationIds } },
            ],
            journal: {
              status: "POSTED",
              journalDate: {
                gte: earliestPeriod,
                lte: latestPeriod,
              },
            },
          },
          select: {
            accountId: true,
            locationId: true,
            departmentId: true,
            amountPhp: true,
            journal: {
              select: {
                journalDate: true,
                status: true,
              },
            },
          },
        })
      : [];

  const lineRows = buildBudgetLineRows({ lines, actuals });

  const canManageBudget = session.permissionCodes.includes(
    permissions.financeBudgetManage,
  );
  const canApproveBudget = session.permissionCodes.includes(
    permissions.financeBudgetApprove,
  );
  const canReviewCommitments = session.permissionCodes.includes(
    permissions.financeBudgetCommitmentReview,
  );
  const workflowPermissions = {
    canManageBudget,
    canApproveBudget,
    canReviewCommitments,
  };

  const budgets = await prisma.budget.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      OR: [
        { locationId: null },
        { locationId: { in: authorizedLocationIds } },
        {
          lines: {
            some: {
              OR: [
                { locationId: null },
                { locationId: { in: authorizedLocationIds } },
              ],
            },
          },
        },
      ],
    },
    include: {
      owner: { select: { displayName: true } },
      submittedBy: { select: { displayName: true } },
      approvedBy: { select: { displayName: true } },
      lines: { select: { id: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { publicReference: "asc" }],
    take: 20,
  });

  const revisions = await prisma.budgetRevision.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      budget: {
        OR: [
          { locationId: null },
          { locationId: { in: authorizedLocationIds } },
          {
            lines: {
              some: {
                OR: [
                  { locationId: null },
                  { locationId: { in: authorizedLocationIds } },
                ],
              },
            },
          },
        ],
      },
    },
    include: {
      budget: {
        select: {
          id: true,
          publicReference: true,
          name: true,
        },
      },
      requestedBy: { select: { displayName: true } },
      reviewedBy: { select: { displayName: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { revisionNumber: "desc" }],
    take: 20,
  });

  const commitments = await prisma.budgetCommitment.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      budgetLine: {
        OR: [
          { locationId: null },
          { locationId: { in: authorizedLocationIds } },
        ],
      },
    },
    include: {
      budgetLine: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { sourceEventAt: "desc" },
    take: 10,
  });

  const [
    purchaseRequestAllocatedCount,
    purchaseRequestUnallocatedCount,
    purchaseOrderAllocatedCount,
    purchaseOrderUnallocatedCount,
    apInvoiceAllocatedCount,
    apInvoiceUnallocatedCount,
    fiscalYears,
    postingAccounts,
    departments,
  ] = await Promise.all([
    prisma.purchaseRequestLine.count({
      where: {
        budgetLineId: { not: null },
        purchaseRequest: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          requestLocationId: { in: authorizedLocationIds },
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
      },
    }),
    prisma.purchaseRequestLine.count({
      where: {
        budgetLineId: null,
        purchaseRequest: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          requestLocationId: { in: authorizedLocationIds },
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
      },
    }),
    prisma.purchaseOrderLine.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        budgetLineId: { not: null },
        purchaseOrder: {
          deliveryLocationId: { in: authorizedLocationIds },
          status: { notIn: ["CANCELLED"] },
        },
      },
    }),
    prisma.purchaseOrderLine.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        budgetLineId: null,
        purchaseOrder: {
          deliveryLocationId: { in: authorizedLocationIds },
          status: { notIn: ["CANCELLED"] },
        },
      },
    }),
    prisma.apInvoiceLine.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        budgetLineId: { not: null },
        apInvoice: {
          OR: [
            { locationId: null },
            { locationId: { in: authorizedLocationIds } },
          ],
          status: { notIn: ["CANCELLED", "REVERSED"] },
        },
      },
    }),
    prisma.apInvoiceLine.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        budgetLineId: null,
        apInvoice: {
          OR: [
            { locationId: null },
            { locationId: { in: authorizedLocationIds } },
          ],
          status: { notIn: ["CANCELLED", "REVERSED"] },
        },
      },
    }),
    prisma.fiscalYear.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["DRAFT", "OPEN"] },
      },
      select: {
        id: true,
        code: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
      },
      orderBy: [{ isDefault: "desc" }, { startDate: "desc" }],
      take: 12,
    }),
    prisma.chartOfAccount.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        postingAllowed: true,
        isHeader: false,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: [{ code: "asc" }],
      take: 100,
    }),
    prisma.department.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: [{ name: "asc" }],
      take: 100,
    }),
  ]);
  const sourceAllocationReadiness = buildBudgetSourceAllocationReadinessRows([
    {
      sourceType: "PURCHASE_REQUEST",
      label: "Purchase requests",
      allocatedLineCount: purchaseRequestAllocatedCount,
      unallocatedLineCount: purchaseRequestUnallocatedCount,
    },
    {
      sourceType: "PURCHASE_ORDER",
      label: "Purchase orders",
      allocatedLineCount: purchaseOrderAllocatedCount,
      unallocatedLineCount: purchaseOrderUnallocatedCount,
    },
    {
      sourceType: "AP_INVOICE",
      label: "AP invoices",
      allocatedLineCount: apInvoiceAllocatedCount,
      unallocatedLineCount: apInvoiceUnallocatedCount,
    },
  ]);
  const sourceHookPolicy = await getBudgetSourceHookPolicy(session);

  const totalBudget = lineRows.reduce(
    (sum, line) => sum + line.revisedAmountPhp,
    0,
  );
  const totalCommitted = lineRows.reduce(
    (sum, line) => sum + line.committedAmountPhp,
    0,
  );
  const totalActual = lineRows.reduce(
    (sum, line) => sum + line.actualAmountPhp,
    0,
  );
  const overBudgetCount = lineRows.filter(
    (line) => line.remainingAmountPhp < 0,
  ).length;
  const nearingLimitCount = lineRows.filter(
    (line) => line.utilizationPct >= 80 && line.utilizationPct < 100,
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      companyName: session.context.companyName,
      brandName: session.context.brandName,
      locationName: session.context.locationName,
    },
    permissions: {
      canManageBudget,
      canApproveBudget,
      canReviewCommitments,
    },
    budgetDraftOptions: {
      fiscalYears: fiscalYears.map((year) => ({
        id: year.id,
        label: `${year.code} / ${year.name}`,
        detail: `${formatDate(year.startDate)} to ${formatDate(year.endDate)} / ${year.status}`,
      })),
      accounts: postingAccounts.map((account) => ({
        id: account.id,
        label: `${account.code} / ${account.name}`,
        detail: "Posting account",
      })),
      locations: session.authorizedLocations.map((location) => ({
        id: location.locationId,
        label: location.locationName,
        detail: `${location.companyName} / ${location.brandName || "Company-wide"} / ${location.locationType}`,
      })),
      departments: departments.map((department) => ({
        id: department.id,
        label: `${department.code} / ${department.name}`,
        detail: "Department budget owner",
      })),
      revisionLines: lineRows.map((line) => ({
        id: line.id,
        budgetId: line.budgetId,
        label: `${line.budgetReference} / ${line.lineCode}`,
        detail: `${line.lineName} / ${line.departmentName} / ${line.locationName} / ${money(line.revisedAmountPhp)}`,
        currentAmountPhp: line.revisedAmountPhp,
      })),
    },
    metrics: [
      {
        id: "approved-budget",
        label: "Approved budget",
        displayValue: money(totalBudget),
        detail: "Approved or active scoped budget lines visible to this user.",
        tone: totalBudget > 0 ? "info" : "neutral",
      },
      {
        id: "open-commitments",
        label: "Open commitments",
        displayValue: money(totalCommitted),
        detail:
          "Reserved source-linked obligations. Commitments do not post journals.",
        tone: totalCommitted > 0 ? "warning" : "neutral",
      },
      {
        id: "posted-actuals",
        label: "Posted actuals",
        displayValue: money(totalActual),
        detail: "Actuals are read from posted finance journal lines only.",
        tone: totalActual > 0 ? "success" : "neutral",
      },
      {
        id: "budget-exceptions",
        label: "Exception lines",
        displayValue: number(overBudgetCount + nearingLimitCount),
        detail: `${overBudgetCount} over budget and ${nearingLimitCount} nearing threshold.`,
        tone:
          overBudgetCount > 0
            ? "destructive"
            : nearingLimitCount > 0
              ? "warning"
              : "success",
      },
    ],
    budgets: budgets.map((budget) => ({
      id: budget.id,
      publicReference: budget.publicReference,
      name: budget.name,
      status: budget.status,
      ownerName: budget.owner?.displayName ?? "Unassigned owner",
      submittedByName: budget.submittedBy?.displayName ?? null,
      approvedByName: budget.approvedBy?.displayName ?? null,
      lineCount: budget.lines.length,
      totalRevisedAmountPhp: decimalToNumber(budget.totalRevisedAmount),
      allowedActions: resolveBudgetAllowedActions({
        status: budget.status,
        permissions: workflowPermissions,
      }),
    })),
    revisions: revisions.map((revision) => {
      const originalSnapshot = jsonRecord(revision.originalSnapshot);
      const proposedSnapshot = jsonRecord(revision.proposedSnapshot);
      return {
        id: revision.id,
        budgetId: revision.budgetId,
        budgetReference: revision.budget.publicReference,
        budgetName: revision.budget.name,
        revisionNumber: revision.revisionNumber,
        revisionType: revision.revisionType,
        status: revision.status,
        reason: revision.reason,
        requestedByName: revision.requestedBy.displayName,
        reviewedByName: revision.reviewedBy?.displayName ?? null,
        requestedAt: revision.requestedAt.toISOString(),
        reviewedAt: revision.reviewedAt?.toISOString() ?? null,
        originalAmountPhp: snapshotNumber(originalSnapshot.currentAmountPhp),
        proposedAmountPhp: snapshotNumber(proposedSnapshot.proposedAmountPhp),
        amountDeltaPhp: snapshotNumber(proposedSnapshot.amountDeltaPhp),
        allowedActions: resolveBudgetRevisionAllowedActions({
          status: revision.status,
          permissions: workflowPermissions,
        }),
      } satisfies BudgetRevisionWorkflowRow;
    }),
    lines: lineRows,
    commitments: commitments.map((commitment) => ({
      id: commitment.id,
      sourceType: commitment.sourceType,
      sourceReference: commitment.sourceReference,
      sourceEventAt: commitment.sourceEventAt.toISOString(),
      lineName: commitment.budgetLine.name,
      status: commitment.status,
      committedAmountPhp: decimalToNumber(commitment.committedAmountPhp),
      consumedAmountPhp: decimalToNumber(commitment.consumedAmountPhp),
      sourceSummary:
        typeof commitment.sourceSnapshot === "object" &&
        commitment.sourceSnapshot !== null &&
        "summary" in commitment.sourceSnapshot
          ? String(commitment.sourceSnapshot.summary)
          : "Source-linked commitment",
    })),
    sourceAllocationReadiness,
    sourceHookPolicy: {
      key: sourceHookPolicy.key,
      rolloutMode: sourceHookPolicy.policy.rolloutMode,
      commitmentProjectionEnabled:
        sourceHookPolicy.policy.commitmentProjectionEnabled,
      hardBlockEnabled: sourceHookPolicy.policy.hardBlockEnabled,
      exceptionOverrideRequired:
        sourceHookPolicy.policy.exceptionOverrideRequired,
      formalBackfillRequiredBeforeHardBlock:
        sourceHookPolicy.policy.formalBackfillRequiredBeforeHardBlock,
      uatRequiredBeforeHardBlock:
        sourceHookPolicy.policy.uatRequiredBeforeHardBlock,
      sourceDecisionId: sourceHookPolicy.sourceDecisionId,
      isOverridden: sourceHookPolicy.isOverridden,
      decisionBasis: sourceHookPolicy.policy.decisionBasis,
    },
    guardrails: [
      {
        label: "Budget control does not replace accounting",
        detail:
          "Budget actuals are derived from posted journal lines. This workspace does not create, post, reverse, or edit journals.",
        tone: "success",
      },
      {
        label: "Commitments are source-linked",
        detail:
          "Commitment rows store source type, source ID, event key, amount, and a limited summary. They do not mutate PR, PO, receiving, AP, payment, or inventory records.",
        tone: "success",
      },
      {
        label: "Threshold policy is warning-first",
        detail: sourceHookPolicy.policy.decisionBasis,
        tone: "info",
      },
    ],
  };
}
