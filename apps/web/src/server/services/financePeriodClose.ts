import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import type { Prisma, TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import type { CsvRow } from "./csv";
import { getFinancePeriodClosePolicy } from "./policySettings";
import {
  activateApprovalStepWithEligibility,
  assertAnyEligibleApprovalActorForStep,
  configureApprovalStepRouting,
  normalizedApprovalRoutingEnabled,
  prepareNormalizedApprovalDecisionPreflight,
  type NormalizedApprovalDecisionPreflight
} from "./approvalRouting";
import { getApprovalRoutingPolicy } from "./approvalRoutingRegistry";
import { skipFutureApprovalStepsForTerminalDecision } from "./approvalTerminal";
import { terminatePendingApprovalForCancellation } from "./approvalCancellation";
import {
  recordApprovalOutcomeNotification,
  recordApprovalStepReadyNotification
} from "./notifications";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "destructive";

export type PeriodCloseMetric = {
  id: string;
  label: string;
  displayValue: string;
  detail: string;
  tone: BadgeTone;
};

export type PeriodCloseChecklistRow = {
  id: string;
  checklistType: string;
  label: string;
  sequence: number;
  isRequired: boolean;
  status: string;
  ownerName: string | null;
  completedByName: string | null;
  reviewedByName: string | null;
  dueAt: string | null;
  completedAt: string | null;
  evidenceReference: string | null;
  resultSummary: string | null;
  exceptionReason: string | null;
};

export type PeriodCloseExceptionRow = {
  id: string;
  exceptionType: string;
  severity: string;
  state: string;
  title: string;
  description: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  assignedToName: string | null;
  raisedByName: string;
  dueAt: string | null;
  resolvedAt: string | null;
  evidenceReference: string | null;
};

export type PeriodCloseRunRow = {
  id: string;
  publicReference: string;
  runType: string;
  status: string;
  periodCode: string;
  periodName: string;
  periodStatus: string;
  periodStartDate: string;
  periodEndDate: string;
  initiatedByName: string;
  sourceWindowStartAt: string | null;
  sourceWindowEndAt: string | null;
  evidenceReference: string | null;
  requiredCheckCount: number;
  passedCheckCount: number;
  failedCheckCount: number;
  pendingCheckCount: number;
  blockerExceptionCount: number;
  openExceptionCount: number;
  readinessPercent: number;
  checklistItems: PeriodCloseChecklistRow[];
  exceptions: PeriodCloseExceptionRow[];
};

export type PeriodClosePeriodOption = {
  id: string;
  code: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
};

export type PeriodCloseDashboard = {
  generatedAt: string;
  permissions: {
    canManagePeriodClose: boolean;
  };
  periodOptions: PeriodClosePeriodOption[];
  metrics: PeriodCloseMetric[];
  runs: PeriodCloseRunRow[];
  guardrails: Array<{
    label: string;
    detail: string;
    tone: BadgeTone;
  }>;
};

export type PeriodCloseActionInput = {
  financeCloseRunId: string;
  reason?: string;
  evidenceReference?: string;
  idempotencyKey?: string;
};

export type StartPeriodCloseRunInput = {
  accountingPeriodId: string;
  runType?: "READINESS" | "MONTH_END" | "LOCK_CANDIDATE";
  sourceWindowStartAt?: Date | null;
  sourceWindowEndAt?: Date | null;
  reason: string;
  evidenceReference?: string | undefined;
  notes?: string | undefined;
  idempotencyKey?: string | undefined;
};

export type PeriodCloseSensitiveApprovalAction = "LOCK_PERIOD" | "REOPEN_PERIOD";

export type PeriodCloseSensitiveApprovalInput = PeriodCloseActionInput & {
  approvalAction: PeriodCloseSensitiveApprovalAction;
};

export type PeriodCloseChecklistActionInput = PeriodCloseActionInput & {
  checklistItemId: string;
  status?: "PASS" | "FAIL" | "NOT_APPLICABLE";
  resultSummary?: string;
};

export type PeriodCloseExceptionActionInput = PeriodCloseActionInput & {
  exceptionId: string;
};

function number(value: number) {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 0
  }).format(value);
}

function decimalToNumber(value: { toNumber?: () => number; toString: () => string } | number) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value.toString());
}

const openExceptionStates = new Set(["OPEN", "ACKNOWLEDGED"]);
const passingCheckStatuses = new Set(["PASS", "NOT_APPLICABLE", "WAIVED"]);
const mutableRunStatuses = new Set([
  "OPEN",
  "VALIDATING",
  "BLOCKED",
  "READY_FOR_REVIEW",
  "READY_TO_CLOSE"
]);

function requireCloseReason(value: string | undefined, errorCode: string) {
  if (!value?.trim()) {
    throw new Error(errorCode);
  }
  return value.trim();
}

function requireCloseEvidence(value: string | undefined, errorCode: string) {
  if (!value?.trim()) {
    throw new Error(errorCode);
  }
  return value.trim();
}

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function assertDate(value: Date, errorCode: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(errorCode);
  }
}

function assertRunMutable(status: string) {
  if (!mutableRunStatuses.has(status)) {
    throw new Error("PERIOD_CLOSE_RUN_NOT_MUTABLE");
  }
}

const periodCloseApprovalDecisionSchema = z.object({
  approvalInstanceId: z.string().uuid(),
  remarks: z.string().trim().optional()
});

const periodCloseApprovalRemarksRequiredSchema =
  periodCloseApprovalDecisionSchema.extend({
    remarks: z.string().trim().min(1, "Remarks are required")
  });

function asConfigObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function readPendingCloseApprovalAction(configSnapshot: unknown): {
  approvalAction: PeriodCloseSensitiveApprovalAction;
  reason: string | null;
  evidenceReference: string | null;
  requestedByUserId: string | null;
} {
  const config = asConfigObject(configSnapshot);
  const pending = asConfigObject(config.pendingSensitiveApproval);
  const approvalAction = pending.approvalAction;
  if (approvalAction !== "LOCK_PERIOD" && approvalAction !== "REOPEN_PERIOD") {
    throw new Error("PERIOD_CLOSE_APPROVAL_ACTION_NOT_FOUND");
  }
  return {
    approvalAction,
    reason:
      typeof pending.reason === "string" && pending.reason.trim()
        ? pending.reason.trim()
        : null,
    evidenceReference:
      typeof pending.evidenceReference === "string" &&
      pending.evidenceReference.trim()
        ? pending.evidenceReference.trim()
        : null,
    requestedByUserId:
      typeof pending.requestedByUserId === "string"
        ? pending.requestedByUserId
        : null
  };
}

function withPendingCloseApproval(
  configSnapshot: unknown,
  input: {
    approvalAction: PeriodCloseSensitiveApprovalAction;
    reason: string;
    evidenceReference: string;
    requestedByUserId: string;
    requestedAt: Date;
  }
) {
  return {
    ...asConfigObject(configSnapshot),
    pendingSensitiveApproval: {
      approvalAction: input.approvalAction,
      reason: input.reason,
      evidenceReference: input.evidenceReference,
      requestedByUserId: input.requestedByUserId,
      requestedAt: input.requestedAt.toISOString()
    }
  } as Prisma.InputJsonValue;
}

function withoutPendingCloseApproval(configSnapshot: unknown) {
  const config = asConfigObject(configSnapshot);
  delete config.pendingSensitiveApproval;
  return config as Prisma.InputJsonValue;
}

async function findFinanceCloseRunApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "FinanceCloseRun",
      isActive: true
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  });
}

async function getActiveFinanceCloseApprovalRoleIds(session: SessionContext) {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      role: { tenantId: session.context.tenantId }
    },
    select: { roleId: true }
  });
  return assignments.map((assignment) => assignment.roleId);
}

function assertSensitiveApprovalActionAllowed(
  run: Awaited<ReturnType<typeof getScopedCloseRunOrThrow>>,
  approvalAction: PeriodCloseSensitiveApprovalAction
) {
  if (approvalAction === "LOCK_PERIOD") {
    if (run.status !== "CLOSED") {
      throw new Error("PERIOD_CLOSE_RUN_NOT_COMPLETED");
    }
    if (run.accountingPeriod.status !== "SOFT_CLOSED") {
      throw new Error("ACCOUNTING_PERIOD_NOT_SOFT_CLOSED");
    }
    if (!summarizeReadiness(run).ready) {
      throw new Error("PERIOD_CLOSE_NOT_READY_TO_LOCK");
    }
    return;
  }

  if (run.status !== "CLOSED") {
    throw new Error("PERIOD_CLOSE_RUN_NOT_COMPLETED");
  }
  if (!["SOFT_CLOSED", "LOCKED"].includes(run.accountingPeriod.status)) {
    throw new Error("ACCOUNTING_PERIOD_NOT_REOPENABLE");
  }
}

async function getScopedCloseRunOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  financeCloseRunId: string
) {
  const run = await tx.financeCloseRun.findFirst({
    where: {
      id: financeCloseRunId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      accountingPeriod: true,
      checklistItems: true,
      exceptions: true
    }
  });
  if (!run) {
    throw new Error("PERIOD_CLOSE_RUN_NOT_FOUND");
  }
  return run;
}

async function writeCloseAudit(
  tx: TransactionClient,
  input: {
    session: SessionContext;
    entityType:
      | "FinanceCloseRun"
      | "FinanceCloseChecklistItem"
      | "FinanceCloseException"
      | "AccountingPeriod";
    entityId: string;
    eventType: string;
    beforeStatus: string;
    afterStatus: string;
    reason?: string | null;
    evidenceReference?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await tx.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeData: { status: input.beforeStatus },
      afterData: {
        status: input.afterStatus,
        reason: input.reason ?? null,
        evidenceReference: input.evidenceReference ?? null
      },
      metadata: {
        noAccountingPeriodMutation: true,
        noApMutation: true,
        noPaymentReleaseMutation: true,
        noBankReconciliationMutation: true,
        noJournalPosting: true,
        ...(input.metadata ?? {})
      }
    }
  });
}

async function nextFinanceCloseRunReference(
  tx: TransactionClient,
  companyId: string,
  periodCode: string,
  runType: string
) {
  const normalizedPeriodCode = periodCode.replace(/[^A-Z0-9]/gi, "");
  const prefix = `FCR-${normalizedPeriodCode}-${runType}`;
  const count = await tx.financeCloseRun.count({
    where: {
      companyId,
      publicReference: { startsWith: prefix }
    }
  });
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

const defaultCloseChecklistTemplates = [
  {
    checklistType: "BRANCH_DEPOSITS",
    label: "Branch deposits reviewed",
    sequence: 1
  },
  {
    checklistType: "BANK_RECONCILIATION",
    label: "Bank reconciliation reviewed",
    sequence: 2
  },
  {
    checklistType: "AP_EXCEPTIONS",
    label: "AP invoices and supplier exceptions reviewed",
    sequence: 3
  },
  {
    checklistType: "PAYMENT_RELEASES",
    label: "Payment release cut-off reviewed",
    sequence: 4
  },
  {
    checklistType: "PETTY_CASH",
    label: "Petty cash liquidation and custody reviewed",
    sequence: 5
  },
  {
    checklistType: "CASH_ADVANCES",
    label: "Cash advances and liquidations reviewed",
    sequence: 6
  },
  {
    checklistType: "INVENTORY_CUTOFF",
    label: "Inventory cut-off and valuation support reviewed",
    sequence: 7
  },
  {
    checklistType: "MANUAL_JOURNALS",
    label: "Manual journal drafts reviewed",
    sequence: 8
  },
  {
    checklistType: "TRIAL_BALANCE",
    label: "Trial balance reviewed",
    sequence: 9
  },
  {
    checklistType: "WORKFORCE_REVIEW",
    label: "Workforce accrual and payroll support reviewed",
    sequence: 10
  },
  {
    checklistType: "MANAGEMENT_SIGNOFF",
    label: "Management sign-off evidence reviewed",
    sequence: 11
  }
] as const;

function summarizeReadiness(run: Awaited<ReturnType<typeof getScopedCloseRunOrThrow>>) {
  const requiredChecks = run.checklistItems.filter((item) => item.isRequired);
  const failedRequiredChecks = requiredChecks.filter((item) => item.status === "FAIL");
  const pendingRequiredChecks = requiredChecks.filter(
    (item) => item.status === "PENDING"
  );
  const passedRequiredChecks = requiredChecks.filter((item) =>
    passingCheckStatuses.has(item.status)
  );
  const openExceptions = run.exceptions.filter((exception) =>
    openExceptionStates.has(exception.state)
  );
  const blockerExceptions = openExceptions.filter(
    (exception) => exception.severity === "BLOCKER"
  );
  const ready =
    requiredChecks.length > 0 &&
    passedRequiredChecks.length === requiredChecks.length &&
    failedRequiredChecks.length === 0 &&
    pendingRequiredChecks.length === 0 &&
    blockerExceptions.length === 0;
  return {
    ready,
    requiredCheckCount: requiredChecks.length,
    passedRequiredCheckCount: passedRequiredChecks.length,
    failedRequiredCheckCount: failedRequiredChecks.length,
    pendingRequiredCheckCount: pendingRequiredChecks.length,
    openExceptionCount: openExceptions.length,
    blockerExceptionCount: blockerExceptions.length
  };
}

async function syncBankStatementCloseExceptions(
  tx: TransactionClient,
  session: SessionContext,
  run: Awaited<ReturnType<typeof getScopedCloseRunOrThrow>>
) {
  const statementLines = await tx.bankStatementLine.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionDate: {
        gte: run.accountingPeriod.startDate,
        lte: run.accountingPeriod.endDate
      },
      status: {
        in: ["UNMATCHED", "PARTIALLY_MATCHED", "EXCEPTION", "ON_HOLD"]
      },
      bankAccount: {
        OR: [{ locationId: null }, { locationId: session.context.locationId }]
      }
    },
    include: {
      bankAccount: true,
      statement: true
    },
    orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    take: 100
  });

  let createdCount = 0;
  for (const line of statementLines) {
    const netAmount = Math.abs(decimalToNumber(line.netAmount));
    const matchedAmount = Math.abs(decimalToNumber(line.matchedAmount));
    if (netAmount <= matchedAmount + 0.009) {
      continue;
    }
    const existingOpenException = await tx.financeCloseException.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        accountingPeriodId: run.accountingPeriodId,
        sourceEntityType: "BANK_STATEMENT_LINE",
        sourceEntityId: line.id,
        state: {
          in: ["OPEN", "ACKNOWLEDGED"]
        }
      },
      select: { id: true }
    });
    if (existingOpenException) {
      continue;
    }
    await tx.financeCloseException.create({
      data: {
        tenantId: run.tenantId,
        companyId: run.companyId,
        accountingPeriodId: run.accountingPeriodId,
        financeCloseRunId: run.id,
        exceptionType: "UNMATCHED_BANK_LINE",
        severity: "BLOCKER",
        state: "OPEN",
        title: "Unmatched bank statement line",
        description: `${line.bankAccount.bankName} ${line.bankReference} has ${netAmount - matchedAmount} PHP unmatched before period close.`,
        sourceEntityType: "BANK_STATEMENT_LINE",
        sourceEntityId: line.id,
        sourceSnapshot: {
          bankAccountId: line.bankAccountId,
          bankName: line.bankAccount.bankName,
          statementId: line.bankStatementId,
          statementReference: line.statement.publicReference,
          bankReference: line.bankReference,
          description: line.description,
          transactionDate: line.transactionDate.toISOString(),
          status: line.status,
          netAmount,
          matchedAmount,
          unmatchedAmount: netAmount - matchedAmount
        },
        raisedByUserId: session.user.id,
        dueAt: run.accountingPeriod.endDate,
        evidenceReference: run.evidenceReference
      }
    });
    createdCount += 1;
  }

  if (createdCount > 0) {
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseRun",
      entityId: run.id,
      eventType: "finance_close.bank_statement_exceptions_synced",
      beforeStatus: run.status,
      afterStatus: run.status,
      reason: "Close readiness synced unmatched bank statement lines.",
      evidenceReference: run.evidenceReference,
      metadata: {
        createdCount,
        sourceEntityType: "BANK_STATEMENT_LINE",
        noAccountingPeriodMutation: true,
        noApMutation: true,
        noPaymentReleaseMutation: true,
        noBankReconciliationMutation: true,
        noJournalPosting: true
      }
    });
  }

  return createdCount;
}

export function buildPeriodCloseRunRows(
  runs: Array<{
    id: string;
    publicReference: string;
    runType: string;
    status: string;
    sourceWindowStartAt: Date | null;
    sourceWindowEndAt: Date | null;
    evidenceReference: string | null;
    initiatedBy: { displayName: string };
    accountingPeriod: {
      code: string;
      name: string;
      status: string;
      startDate: Date;
      endDate: Date;
    };
    checklistItems: Array<{
      id: string;
      checklistType: string;
      label: string;
      sequence: number;
      isRequired: boolean;
      status: string;
      dueAt: Date | null;
      completedAt: Date | null;
      evidenceReference: string | null;
      resultSummary: string | null;
      exceptionReason: string | null;
      owner: { displayName: string } | null;
      completedBy: { displayName: string } | null;
      reviewedBy: { displayName: string } | null;
    }>;
    exceptions: Array<{
      id: string;
      exceptionType: string;
      severity: string;
      state: string;
      title: string;
      description: string;
      sourceEntityType: string | null;
      sourceEntityId: string | null;
      dueAt: Date | null;
      resolvedAt: Date | null;
      evidenceReference: string | null;
      raisedBy: { displayName: string };
      assignedTo: { displayName: string } | null;
    }>;
  }>
) {
  return runs.map((run) => {
    const requiredChecks = run.checklistItems.filter((item) => item.isRequired);
    const passedRequiredChecks = requiredChecks.filter((item) =>
      passingCheckStatuses.has(item.status)
    );
    const failedChecks = run.checklistItems.filter((item) => item.status === "FAIL");
    const pendingChecks = run.checklistItems.filter(
      (item) => item.status === "PENDING"
    );
    const openExceptions = run.exceptions.filter((exception) =>
      openExceptionStates.has(exception.state)
    );
    const blockerExceptions = openExceptions.filter(
      (exception) => exception.severity === "BLOCKER"
    );

    return {
      id: run.id,
      publicReference: run.publicReference,
      runType: run.runType,
      status: run.status,
      periodCode: run.accountingPeriod.code,
      periodName: run.accountingPeriod.name,
      periodStatus: run.accountingPeriod.status,
      periodStartDate: run.accountingPeriod.startDate.toISOString(),
      periodEndDate: run.accountingPeriod.endDate.toISOString(),
      initiatedByName: run.initiatedBy.displayName,
      sourceWindowStartAt: run.sourceWindowStartAt?.toISOString() ?? null,
      sourceWindowEndAt: run.sourceWindowEndAt?.toISOString() ?? null,
      evidenceReference: run.evidenceReference,
      requiredCheckCount: requiredChecks.length,
      passedCheckCount: passedRequiredChecks.length,
      failedCheckCount: failedChecks.length,
      pendingCheckCount: pendingChecks.length,
      blockerExceptionCount: blockerExceptions.length,
      openExceptionCount: openExceptions.length,
      readinessPercent:
        requiredChecks.length === 0
          ? 0
          : Math.round((passedRequiredChecks.length / requiredChecks.length) * 100),
      checklistItems: run.checklistItems
        .slice()
        .sort((left, right) => left.sequence - right.sequence)
        .map((item) => ({
          id: item.id,
          checklistType: item.checklistType,
          label: item.label,
          sequence: item.sequence,
          isRequired: item.isRequired,
          status: item.status,
          ownerName: item.owner?.displayName ?? null,
          completedByName: item.completedBy?.displayName ?? null,
          reviewedByName: item.reviewedBy?.displayName ?? null,
          dueAt: item.dueAt?.toISOString() ?? null,
          completedAt: item.completedAt?.toISOString() ?? null,
          evidenceReference: item.evidenceReference,
          resultSummary: item.resultSummary,
          exceptionReason: item.exceptionReason
        })),
      exceptions: run.exceptions.map((exception) => ({
        id: exception.id,
        exceptionType: exception.exceptionType,
        severity: exception.severity,
        state: exception.state,
        title: exception.title,
        description: exception.description,
        sourceEntityType: exception.sourceEntityType,
        sourceEntityId: exception.sourceEntityId,
        assignedToName: exception.assignedTo?.displayName ?? null,
        raisedByName: exception.raisedBy.displayName,
        dueAt: exception.dueAt?.toISOString() ?? null,
        resolvedAt: exception.resolvedAt?.toISOString() ?? null,
        evidenceReference: exception.evidenceReference
      }))
    } satisfies PeriodCloseRunRow;
  });
}

export function buildPeriodCloseDashboard(
  session: SessionContext,
  runs: Parameters<typeof buildPeriodCloseRunRows>[0],
  periodOptions: PeriodClosePeriodOption[] = []
): PeriodCloseDashboard {
  const runRows = buildPeriodCloseRunRows(runs);
  const openRuns = runRows.filter((run) =>
    ["OPEN", "VALIDATING", "BLOCKED", "READY_FOR_REVIEW", "READY_TO_CLOSE"].includes(
      run.status
    )
  );
  const blockerExceptions = runRows.reduce(
    (sum, run) => sum + run.blockerExceptionCount,
    0
  );
  const pendingRequiredChecks = runRows.reduce(
    (sum, run) => sum + run.pendingCheckCount,
    0
  );
  const readyRuns = runRows.filter(
    (run) =>
      run.readinessPercent === 100 &&
      run.blockerExceptionCount === 0 &&
      run.failedCheckCount === 0
  );

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canManagePeriodClose: session.permissionCodes.includes(
        permissions.financePeriodCloseManage
      )
    },
    periodOptions,
    metrics: [
      {
        id: "open-close-runs",
        label: "Open close runs",
        displayValue: number(openRuns.length),
        detail: "Readiness runs currently tracking close evidence and blockers.",
        tone: openRuns.length > 0 ? "info" : "neutral"
      },
      {
        id: "blocker-exceptions",
        label: "Blocker exceptions",
        displayValue: number(blockerExceptions),
        detail: "Open blocker exceptions that prevent a clean close recommendation.",
        tone: blockerExceptions > 0 ? "warning" : "success"
      },
      {
        id: "pending-checks",
        label: "Pending checks",
        displayValue: number(pendingRequiredChecks),
        detail: "Required checklist items awaiting evidence, review, or waiver.",
        tone: pendingRequiredChecks > 0 ? "warning" : "success"
      },
      {
        id: "ready-runs",
        label: "Ready runs",
        displayValue: number(readyRuns.length),
        detail: "Runs with all required checks satisfied and no open blockers.",
        tone: readyRuns.length > 0 ? "success" : "neutral"
      }
    ],
    runs: runRows,
    guardrails: [
      {
        label: "Readiness only",
        detail:
          "This workspace records close evidence, checks, attempts, and exceptions without locking periods or posting journals.",
        tone: "info"
      },
      {
        label: "Source records stay authoritative",
        detail:
          "AP, payment, bank, inventory, cash advance, petty cash, and workforce records are read as evidence; close records do not mutate them.",
        tone: "success"
      },
      {
        label: "Blockers remain visible",
        detail:
          "A close run can show readiness, blockers, and waivers so finance leadership can review before any future hard-close workflow.",
        tone: "warning"
      }
    ]
  };
}

export async function buildPeriodCloseExportRows(
  session: SessionContext
): Promise<CsvRow[]> {
  const dashboard = await getPeriodCloseDashboard(session);
  const rows: CsvRow[] = [
    [
      "Section",
      "Reference",
      "Subject",
      "Status",
      "Period",
      "Date",
      "Detail",
      "Scope"
    ]
  ];

  for (const metric of dashboard.metrics) {
    rows.push([
      "Metric",
      metric.id,
      metric.label,
      metric.tone,
      "",
      dashboard.generatedAt,
      metric.detail,
      session.context.companyName
    ]);
  }

  for (const run of dashboard.runs) {
    rows.push([
      "Close Run",
      run.publicReference,
      run.runType,
      run.status,
      `${run.periodCode} / ${run.periodStatus}`,
      run.sourceWindowEndAt ?? run.periodEndDate,
      `${run.readinessPercent}% ready; ${run.passedCheckCount}/${run.requiredCheckCount} checks passed; ${run.blockerExceptionCount} blocker(s); evidence ${run.evidenceReference ?? "none"}`,
      session.context.companyName
    ]);

    for (const item of run.checklistItems) {
      rows.push([
        "Checklist",
        item.id,
        item.label,
        item.status,
        run.periodCode,
        item.completedAt ?? item.dueAt ?? "",
        `${item.checklistType}; required ${item.isRequired ? "yes" : "no"}; owner ${item.ownerName ?? "unassigned"}; evidence ${item.evidenceReference ?? "none"}; result ${item.resultSummary ?? "none"}`,
        session.context.companyName
      ]);
    }

    for (const exception of run.exceptions) {
      rows.push([
        "Exception",
        exception.id,
        exception.title,
        exception.state,
        run.periodCode,
        exception.resolvedAt ?? exception.dueAt ?? "",
        `${exception.exceptionType}; severity ${exception.severity}; source ${exception.sourceEntityType ?? "none"}:${exception.sourceEntityId ?? "none"}; assigned ${exception.assignedToName ?? "unassigned"}; evidence ${exception.evidenceReference ?? "none"}`,
        session.context.companyName
      ]);
    }
  }

  return rows;
}

export async function startPeriodCloseRun(
  session: SessionContext,
  input: StartPeriodCloseRunInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);

  const accountingPeriodId = cleanText(input.accountingPeriodId);
  const runType = input.runType ?? "READINESS";
  const reason = requireCloseReason(
    input.reason,
    "PERIOD_CLOSE_START_REASON_REQUIRED"
  );
  const evidenceReference = cleanText(input.evidenceReference) || null;
  const notes = cleanText(input.notes) || null;
  const idempotencyKey = cleanText(input.idempotencyKey) || null;
  if (!["READINESS", "MONTH_END", "LOCK_CANDIDATE"].includes(runType)) {
    throw new Error("PERIOD_CLOSE_RUN_TYPE_INVALID");
  }
  if (!accountingPeriodId) {
    throw new Error("PERIOD_CLOSE_ACCOUNTING_PERIOD_REQUIRED");
  }
  if (input.sourceWindowStartAt) {
    assertDate(
      input.sourceWindowStartAt,
      "PERIOD_CLOSE_SOURCE_WINDOW_START_INVALID"
    );
  }
  if (input.sourceWindowEndAt) {
    assertDate(input.sourceWindowEndAt, "PERIOD_CLOSE_SOURCE_WINDOW_END_INVALID");
  }
  if (
    input.sourceWindowStartAt &&
    input.sourceWindowEndAt &&
    input.sourceWindowEndAt < input.sourceWindowStartAt
  ) {
    throw new Error("PERIOD_CLOSE_SOURCE_WINDOW_INVALID");
  }

  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.financeCloseRun.findUnique({
        where: {
          tenantId_companyId_idempotencyKey: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            idempotencyKey
          }
        },
        include: { accountingPeriod: true, checklistItems: true, exceptions: true }
      });
      if (existing) {
        return existing;
      }
    }

    const period = await tx.accountingPeriod.findFirst({
      where: {
        id: accountingPeriodId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["OPEN", "REOPENED"] }
      }
    });
    if (!period) {
      throw new Error("PERIOD_CLOSE_ACCOUNTING_PERIOD_NOT_OPEN");
    }

    const duplicateRun = await tx.financeCloseRun.findUnique({
      where: {
        tenantId_companyId_accountingPeriodId_runType: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          accountingPeriodId: period.id,
          runType
        }
      }
    });
    if (duplicateRun) {
      throw new Error("PERIOD_CLOSE_RUN_ALREADY_EXISTS");
    }

    const publicReference = await nextFinanceCloseRunReference(
      tx,
      session.context.companyId,
      period.code,
      runType
    );
    const sourceWindowStartAt = input.sourceWindowStartAt ?? period.startDate;
    const sourceWindowEndAt = input.sourceWindowEndAt ?? period.endDate;
    const run = await tx.financeCloseRun.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        accountingPeriodId: period.id,
        publicReference,
        runType,
        status: "OPEN",
        sourceWindowStartAt,
        sourceWindowEndAt,
        initiatedByUserId: session.user.id,
        reason,
        evidenceReference,
        notes,
        configSnapshot: {
          phase: "phase3_period_close_readiness",
          sourceWindow: {
            startAt: sourceWindowStartAt.toISOString(),
            endAt: sourceWindowEndAt.toISOString()
          },
          defaultChecklistTypes: defaultCloseChecklistTemplates.map(
            (template) => template.checklistType
          ),
          noAccountingPeriodMutation: true,
          noApMutation: true,
          noPaymentReleaseMutation: true,
          noBankReconciliationMutation: true,
          noJournalPosting: true
        },
        idempotencyKey
      }
    });

    await tx.financeCloseChecklistItem.createMany({
      data: defaultCloseChecklistTemplates.map((template) => ({
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: template.checklistType,
        label: template.label,
        sequence: template.sequence,
        isRequired: true,
        status: "PENDING",
        ownerUserId: session.user.id,
        dueAt: period.endDate,
        evidenceReference
      }))
    });

    await tx.financeCloseAttempt.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        action: "SUBMIT_FOR_REVIEW",
        result: "SUCCEEDED",
        idempotencyKey: idempotencyKey
          ? `${idempotencyKey}:start`
          : `close:${run.id}:start`,
        attemptedByUserId: session.user.id,
        notes: reason
      }
    });

    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseRun",
      entityId: run.id,
      eventType: "finance_close.run_started",
      beforeStatus: "NONE",
      afterStatus: run.status,
      reason,
      evidenceReference,
      metadata: {
        publicReference,
        accountingPeriodId: period.id,
        accountingPeriodCode: period.code,
        runType,
        checklistCount: defaultCloseChecklistTemplates.length,
        noAccountingPeriodMutation: true,
        noApMutation: true,
        noPaymentReleaseMutation: true,
        noBankReconciliationMutation: true,
        noJournalPosting: true,
        idempotencyKey
      }
    });

    return run;
  });
}

export async function recordPeriodCloseChecklistResult(
  session: SessionContext,
  input: PeriodCloseChecklistActionInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);
  const status = input.status ?? "PASS";
  if (!["PASS", "FAIL", "NOT_APPLICABLE"].includes(status)) {
    throw new Error("PERIOD_CLOSE_CHECKLIST_STATUS_INVALID");
  }
  const evidenceReference = requireCloseEvidence(
    input.evidenceReference,
    "PERIOD_CLOSE_CHECKLIST_EVIDENCE_REQUIRED"
  );
  const reason =
    status === "FAIL"
      ? requireCloseReason(input.reason, "PERIOD_CLOSE_CHECKLIST_FAIL_REASON_REQUIRED")
      : input.reason?.trim() ?? null;

  return prisma.$transaction(async (tx) => {
    const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
    assertRunMutable(run.status);
    const item = run.checklistItems.find(
      (check) => check.id === input.checklistItemId
    );
    if (!item) {
      throw new Error("PERIOD_CLOSE_CHECKLIST_ITEM_NOT_FOUND");
    }
    const updated = await tx.financeCloseChecklistItem.update({
      where: { id: item.id },
      data: {
        status,
        completedByUserId: session.user.id,
        completedAt: new Date(),
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        resultSummary: input.resultSummary?.trim() ?? reason ?? "Checklist recorded.",
        exceptionReason: status === "FAIL" ? reason : null,
        evidenceReference
      }
    });
    await tx.financeCloseAttempt.create({
      data: {
        tenantId: run.tenantId,
        companyId: run.companyId,
        accountingPeriodId: run.accountingPeriodId,
        financeCloseRunId: run.id,
        action: "COMPLETE_CHECK",
        result: "SUCCEEDED",
        idempotencyKey:
          input.idempotencyKey ?? `close:${run.id}:check:${item.id}:${Date.now()}`,
        attemptedByUserId: session.user.id,
        notes: reason ?? input.resultSummary?.trim() ?? null
      }
    });
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseChecklistItem",
      entityId: item.id,
      eventType: "finance_close.checklist_recorded",
      beforeStatus: item.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        financeCloseRunId: run.id,
        checklistType: item.checklistType,
        noSourceMutation: true
      }
    });
    return updated;
  });
}

export async function waivePeriodCloseChecklistItem(
  session: SessionContext,
  input: PeriodCloseChecklistActionInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);
  const reason = requireCloseReason(
    input.reason,
    "PERIOD_CLOSE_CHECKLIST_WAIVER_REASON_REQUIRED"
  );
  const evidenceReference = requireCloseEvidence(
    input.evidenceReference,
    "PERIOD_CLOSE_CHECKLIST_WAIVER_EVIDENCE_REQUIRED"
  );

  return prisma.$transaction(async (tx) => {
    const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
    assertRunMutable(run.status);
    const item = run.checklistItems.find(
      (check) => check.id === input.checklistItemId
    );
    if (!item) {
      throw new Error("PERIOD_CLOSE_CHECKLIST_ITEM_NOT_FOUND");
    }
    const updated = await tx.financeCloseChecklistItem.update({
      where: { id: item.id },
      data: {
        status: "WAIVED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        resultSummary: input.resultSummary?.trim() ?? "Checklist waived.",
        exceptionReason: reason,
        evidenceReference
      }
    });
    await tx.financeCloseAttempt.create({
      data: {
        tenantId: run.tenantId,
        companyId: run.companyId,
        accountingPeriodId: run.accountingPeriodId,
        financeCloseRunId: run.id,
        action: "WAIVE_CHECK",
        result: "SUCCEEDED",
        idempotencyKey:
          input.idempotencyKey ?? `close:${run.id}:waive:${item.id}:${Date.now()}`,
        attemptedByUserId: session.user.id,
        notes: reason
      }
    });
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseChecklistItem",
      entityId: item.id,
      eventType: "finance_close.checklist_waived",
      beforeStatus: item.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        financeCloseRunId: run.id,
        checklistType: item.checklistType,
        waiverOnlyNoSourceMutation: true
      }
    });
    return updated;
  });
}

export async function acknowledgePeriodCloseException(
  session: SessionContext,
  input: PeriodCloseExceptionActionInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);
  const reason = requireCloseReason(
    input.reason,
    "PERIOD_CLOSE_EXCEPTION_ACK_REASON_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
    assertRunMutable(run.status);
    const exception = run.exceptions.find((item) => item.id === input.exceptionId);
    if (!exception) {
      throw new Error("PERIOD_CLOSE_EXCEPTION_NOT_FOUND");
    }
    if (exception.state !== "OPEN") {
      throw new Error("PERIOD_CLOSE_EXCEPTION_ACK_INVALID_STATE");
    }
    const updated = await tx.financeCloseException.update({
      where: { id: exception.id },
      data: {
        state: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        resolutionReason: reason,
        evidenceReference: input.evidenceReference?.trim() ?? exception.evidenceReference
      }
    });
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseException",
      entityId: exception.id,
      eventType: "finance_close.exception_acknowledged",
      beforeStatus: exception.state,
      afterStatus: updated.state,
      reason,
      evidenceReference: updated.evidenceReference,
      metadata: {
        financeCloseRunId: run.id,
        severity: exception.severity
      }
    });
    return updated;
  });
}

export async function resolvePeriodCloseException(
  session: SessionContext,
  input: PeriodCloseExceptionActionInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);
  const reason = requireCloseReason(
    input.reason,
    "PERIOD_CLOSE_EXCEPTION_RESOLUTION_REASON_REQUIRED"
  );
  const evidenceReference = requireCloseEvidence(
    input.evidenceReference,
    "PERIOD_CLOSE_EXCEPTION_RESOLUTION_EVIDENCE_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
    assertRunMutable(run.status);
    const exception = run.exceptions.find((item) => item.id === input.exceptionId);
    if (!exception) {
      throw new Error("PERIOD_CLOSE_EXCEPTION_NOT_FOUND");
    }
    if (!["OPEN", "ACKNOWLEDGED"].includes(exception.state)) {
      throw new Error("PERIOD_CLOSE_EXCEPTION_RESOLUTION_INVALID_STATE");
    }
    const updated = await tx.financeCloseException.update({
      where: { id: exception.id },
      data: {
        state: "RESOLVED",
        resolvedByUserId: session.user.id,
        resolvedAt: new Date(),
        resolutionReason: reason,
        evidenceReference
      }
    });
    await tx.financeCloseAttempt.create({
      data: {
        tenantId: run.tenantId,
        companyId: run.companyId,
        accountingPeriodId: run.accountingPeriodId,
        financeCloseRunId: run.id,
        action: "RESOLVE_EXCEPTION",
        result: "SUCCEEDED",
        idempotencyKey:
          input.idempotencyKey ??
          `close:${run.id}:resolve:${exception.id}:${Date.now()}`,
        attemptedByUserId: session.user.id,
        notes: reason
      }
    });
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseException",
      entityId: exception.id,
      eventType: "finance_close.exception_resolved",
      beforeStatus: exception.state,
      afterStatus: updated.state,
      reason,
      evidenceReference,
      metadata: {
        financeCloseRunId: run.id,
        severity: exception.severity,
        noSourceMutation: true
      }
    });
    return updated;
  });
}

export async function waivePeriodCloseException(
  session: SessionContext,
  input: PeriodCloseExceptionActionInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);
  const reason = requireCloseReason(
    input.reason,
    "PERIOD_CLOSE_EXCEPTION_WAIVER_REASON_REQUIRED"
  );
  const evidenceReference = requireCloseEvidence(
    input.evidenceReference,
    "PERIOD_CLOSE_EXCEPTION_WAIVER_EVIDENCE_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
    assertRunMutable(run.status);
    const exception = run.exceptions.find((item) => item.id === input.exceptionId);
    if (!exception) {
      throw new Error("PERIOD_CLOSE_EXCEPTION_NOT_FOUND");
    }
    if (!["OPEN", "ACKNOWLEDGED"].includes(exception.state)) {
      throw new Error("PERIOD_CLOSE_EXCEPTION_WAIVER_INVALID_STATE");
    }
    const updated = await tx.financeCloseException.update({
      where: { id: exception.id },
      data: {
        state: "WAIVED",
        waivedAt: new Date(),
        resolvedByUserId: session.user.id,
        resolutionReason: reason,
        evidenceReference
      }
    });
    await tx.financeCloseAttempt.create({
      data: {
        tenantId: run.tenantId,
        companyId: run.companyId,
        accountingPeriodId: run.accountingPeriodId,
        financeCloseRunId: run.id,
        action: "RESOLVE_EXCEPTION",
        result: "SUCCEEDED",
        idempotencyKey:
          input.idempotencyKey ?? `close:${run.id}:waive-ex:${exception.id}:${Date.now()}`,
        attemptedByUserId: session.user.id,
        notes: reason
      }
    });
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseException",
      entityId: exception.id,
      eventType: "finance_close.exception_waived",
      beforeStatus: exception.state,
      afterStatus: updated.state,
      reason,
      evidenceReference,
      metadata: {
        financeCloseRunId: run.id,
        severity: exception.severity,
        waiverOnlyNoSourceMutation: true
      }
    });
    return updated;
  });
}

export async function calculatePeriodCloseReadiness(
  session: SessionContext,
  input: PeriodCloseActionInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);
  const idempotencyKey =
    input.idempotencyKey ?? `close:${input.financeCloseRunId}:readiness:${Date.now()}`;
  return prisma.$transaction(async (tx) => {
    const existingAttempt = await tx.financeCloseAttempt.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey
      },
      include: { financeCloseRun: true }
    });
    if (existingAttempt) {
      return existingAttempt.financeCloseRun;
    }
    const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
    assertRunMutable(run.status);
    const syncedBankExceptionCount = await syncBankStatementCloseExceptions(
      tx,
      session,
      run
    );
    const syncedRun = await getScopedCloseRunOrThrow(
      tx,
      session,
      input.financeCloseRunId
    );
    const readiness = summarizeReadiness(syncedRun);
    const nextStatus = readiness.ready
      ? "READY_TO_CLOSE"
      : readiness.blockerExceptionCount > 0 || readiness.failedRequiredCheckCount > 0
        ? "BLOCKED"
        : "READY_FOR_REVIEW";
    const updated = await tx.financeCloseRun.update({
      where: { id: run.id },
      data: {
        status: nextStatus,
        readyAt: nextStatus === "READY_TO_CLOSE" ? new Date() : run.readyAt,
        evidenceReference: input.evidenceReference?.trim() ?? run.evidenceReference,
        reason: input.reason?.trim() ?? run.reason,
        version: { increment: 1 }
      }
    });
    await tx.financeCloseAttempt.create({
      data: {
        tenantId: run.tenantId,
        companyId: run.companyId,
        accountingPeriodId: run.accountingPeriodId,
        financeCloseRunId: run.id,
        action: nextStatus === "READY_TO_CLOSE" ? "MARK_READY" : "SUBMIT_FOR_REVIEW",
        result: readiness.ready ? "SUCCEEDED" : "FAILED",
        idempotencyKey,
        attemptedByUserId: session.user.id,
        failureCode: readiness.ready ? null : "PERIOD_CLOSE_NOT_READY",
        failureContext: {
          ...readiness,
          syncedBankExceptionCount
        },
        notes: input.reason?.trim() ?? null
      }
    });
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseRun",
      entityId: run.id,
      eventType: "finance_close.readiness_calculated",
      beforeStatus: run.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: updated.evidenceReference,
      metadata: {
        readiness,
        syncedBankExceptionCount,
        noAccountingPeriodMutation: true
      }
    });
    return updated;
  });
}

export async function completePeriodCloseRun(
  session: SessionContext,
  input: PeriodCloseActionInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);
  const reason = requireCloseReason(
    input.reason,
    "PERIOD_CLOSE_COMPLETION_REASON_REQUIRED"
  );
  const evidenceReference = requireCloseEvidence(
    input.evidenceReference,
    "PERIOD_CLOSE_COMPLETION_EVIDENCE_REQUIRED"
  );
  const idempotencyKey =
    input.idempotencyKey ?? `close:${input.financeCloseRunId}:complete:${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    const existingAttempt = await tx.financeCloseAttempt.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey
      },
      include: { financeCloseRun: true }
    });
    if (existingAttempt) {
      return existingAttempt.financeCloseRun;
    }

    const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
    assertRunMutable(run.status);
    if (run.status !== "READY_TO_CLOSE") {
      throw new Error("PERIOD_CLOSE_RUN_MUST_BE_READY");
    }
    const readiness = summarizeReadiness(run);
    if (!readiness.ready) {
      throw new Error("PERIOD_CLOSE_NOT_READY_TO_COMPLETE");
    }
    if (!["OPEN", "REOPENED"].includes(run.accountingPeriod.status)) {
      throw new Error("ACCOUNTING_PERIOD_NOT_CLOSEABLE");
    }

    const closedAt = new Date();
    const updated = await tx.financeCloseRun.update({
      where: { id: run.id },
      data: {
        status: "CLOSED",
        closedAt,
        reason,
        evidenceReference,
        version: { increment: 1 }
      }
    });
    const periodSoftClose = await tx.accountingPeriod.updateMany({
      where: {
        id: run.accountingPeriodId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: {
          in: ["OPEN", "REOPENED"]
        }
      },
      data: {
        status: "SOFT_CLOSED",
        softClosedAt: closedAt,
        closeEvidenceReference: evidenceReference
      }
    });
    if (periodSoftClose.count !== 1) {
      throw new Error("ACCOUNTING_PERIOD_CLOSE_STATE_CONFLICT");
    }
    await tx.financeCloseAttempt.create({
      data: {
        tenantId: run.tenantId,
        companyId: run.companyId,
        accountingPeriodId: run.accountingPeriodId,
        financeCloseRunId: run.id,
        action: "MARK_READY",
        result: "SUCCEEDED",
        idempotencyKey,
        attemptedByUserId: session.user.id,
        notes: reason,
        failureContext: {
          closePacketCompleted: true,
          accountingPeriodSoftClosed: true
        }
      }
    });
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseRun",
      entityId: run.id,
      eventType: "finance_close.close_packet_completed",
      beforeStatus: run.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        readiness,
        closePacketCompleted: true,
        accountingPeriodSoftClosed: true,
        accountingPeriodId: run.accountingPeriodId,
        noAccountingPeriodMutation: false
      }
    });
    await writeCloseAudit(tx, {
      session,
      entityType: "AccountingPeriod",
      entityId: run.accountingPeriodId,
      eventType: "finance_close.accounting_period_soft_closed",
      beforeStatus: run.accountingPeriod.status,
      afterStatus: "SOFT_CLOSED",
      reason,
      evidenceReference,
      metadata: {
        financeCloseRunId: run.id,
        readiness,
        noAccountingPeriodMutation: false,
        noApMutation: true,
        noPaymentReleaseMutation: true,
        noBankReconciliationMutation: true,
        noJournalPosting: true
      }
    });
    return updated;
  });
}

export async function requestPeriodCloseSensitiveActionApproval(
  session: SessionContext,
  input: PeriodCloseSensitiveApprovalInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);
  const reason = requireCloseReason(
    input.reason,
    "PERIOD_CLOSE_APPROVAL_REASON_REQUIRED"
  );
  const evidenceReference = requireCloseEvidence(
    input.evidenceReference,
    "PERIOD_CLOSE_APPROVAL_EVIDENCE_REQUIRED"
  );

  return prisma.$transaction(async (tx) => {
    const lockedRuns = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT run.id
        FROM "FinanceCloseRun" run
       WHERE run.id = ${input.financeCloseRunId}::uuid
         AND run."tenantId" = ${session.context.tenantId}::uuid
         AND run."companyId" = ${session.context.companyId}::uuid
       FOR UPDATE OF run
    `;
    if (lockedRuns.length !== 1) throw new Error("PERIOD_CLOSE_RUN_NOT_FOUND");
    const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
    assertSensitiveApprovalActionAllowed(run, input.approvalAction);

    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "FinanceCloseRun",
        documentId: run.id,
        status: "PENDING"
      }
    });
    if (existingApproval) {
      throw new Error("PERIOD_CLOSE_APPROVAL_ALREADY_PENDING");
    }

    const approvalRule = await findFinanceCloseRunApprovalRule(tx, session);
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("PERIOD_CLOSE_APPROVAL_RULE_NOT_CONFIGURED");
    }
    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("PERIOD_CLOSE_APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }

    const requestedAt = new Date();
    const routedSteps = approvalRule.steps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
    }));
    const firstRoutedStep = routedSteps[0];
    if (!firstRoutedStep) {
      throw new Error("PERIOD_CLOSE_APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }
    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "FinanceCloseRun",
        documentId: run.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: routedSteps.map((step) => ({
            id: step.approvalInstanceStepId,
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: step.activationStatus
          }))
        }
      }
    });
    const prohibitedActors = Array.from(new Map([
      [run.initiatedByUserId, {
        userId: run.initiatedByUserId,
        reasonCode: "INITIATOR"
      }],
      [session.user.id, {
        userId: session.user.id,
        reasonCode: "REQUESTER"
      }]
    ]).values());
    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        routingPolicy: getApprovalRoutingPolicy("FinanceCloseRun"),
        requiredPermissionCode: permissions.financePeriodCloseManage,
        dueAt: null,
        activationAudit: {
          actorUserId: session.user.id,
          source: "finance_close.sensitive_action_request"
        },
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          targets: [{
            scopeType: "COMPANY",
            companyId: session.context.companyId
          }]
        }],
        prohibitedActors
      });
    }
    await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId
    });

    const updated = await tx.financeCloseRun.update({
      where: { id: run.id },
      data: {
        reason,
        evidenceReference,
        configSnapshot: withPendingCloseApproval(run.configSnapshot, {
          approvalAction: input.approvalAction,
          reason,
          evidenceReference,
          requestedByUserId: session.user.id,
          requestedAt
        }),
        version: { increment: 1 }
      }
    });

    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseRun",
      entityId: run.id,
      eventType: "finance_close.sensitive_action_approval_requested",
      beforeStatus: run.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalAction: input.approvalAction,
        noAccountingPeriodMutation: true,
        noJournalPosting: true
      }
    });

    return updated;
  });
}

async function lockAccountingPeriodFromCloseRunTx(
  tx: TransactionClient,
  session: SessionContext,
  input: PeriodCloseActionInput & {
    reason: string;
    evidenceReference: string;
    approvalInstanceId?: string;
  }
) {
  const idempotencyKey =
    input.idempotencyKey ?? `close:${input.financeCloseRunId}:lock:${Date.now()}`;
  const existingAttempt = await tx.financeCloseAttempt.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      idempotencyKey
    },
    include: { financeCloseRun: true }
  });
  if (existingAttempt) {
    return existingAttempt.financeCloseRun;
  }

  const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
  assertSensitiveApprovalActionAllowed(run, "LOCK_PERIOD");
  const readiness = summarizeReadiness(run);

  const lockedAt = new Date();
  const periodLock = await tx.accountingPeriod.updateMany({
    where: {
      id: run.accountingPeriodId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "SOFT_CLOSED"
    },
    data: {
      status: "LOCKED",
      lockedAt,
      closeEvidenceReference: input.evidenceReference
    }
  });
  if (periodLock.count !== 1) {
    throw new Error("ACCOUNTING_PERIOD_LOCK_STATE_CONFLICT");
  }

  await tx.financeCloseRun.update({
    where: { id: run.id },
    data: {
      reason: input.reason,
      evidenceReference: input.evidenceReference,
      configSnapshot: withoutPendingCloseApproval(run.configSnapshot),
      version: { increment: 1 }
    }
  });
  await tx.financeCloseAttempt.create({
    data: {
      tenantId: run.tenantId,
      companyId: run.companyId,
      accountingPeriodId: run.accountingPeriodId,
      financeCloseRunId: run.id,
      action: "MARK_READY",
      result: "SUCCEEDED",
      idempotencyKey,
      attemptedByUserId: session.user.id,
      notes: input.reason,
      failureContext: {
        accountingPeriodLocked: true,
        lockedAt,
        approvalInstanceId: input.approvalInstanceId ?? null
      }
    }
  });
  await writeCloseAudit(tx, {
    session,
    entityType: "AccountingPeriod",
    entityId: run.accountingPeriodId,
    eventType: "finance_close.accounting_period_locked",
    beforeStatus: run.accountingPeriod.status,
    afterStatus: "LOCKED",
    reason: input.reason,
    evidenceReference: input.evidenceReference,
    metadata: {
      financeCloseRunId: run.id,
      approvalInstanceId: input.approvalInstanceId ?? null,
      readiness,
      lockedAt,
      noAccountingPeriodMutation: false,
      noApMutation: true,
      noPaymentReleaseMutation: true,
      noBankReconciliationMutation: true,
      noJournalPosting: true
    }
  });

  return tx.financeCloseRun.findUniqueOrThrow({
    where: { id: run.id }
  });
}

export async function lockAccountingPeriodFromCloseRun(
  session: SessionContext,
  input: PeriodCloseActionInput
) {
  return requestPeriodCloseSensitiveActionApproval(session, {
    ...input,
    approvalAction: "LOCK_PERIOD"
  });
}

async function reopenAccountingPeriodFromCloseRunTx(
  tx: TransactionClient,
  session: SessionContext,
  input: PeriodCloseActionInput & {
    reason: string;
    evidenceReference: string;
    approvalInstanceId?: string;
  }
) {
  const policy = await getFinancePeriodClosePolicy(session);
  const idempotencyKey =
    input.idempotencyKey ?? `close:${input.financeCloseRunId}:reopen:${Date.now()}`;
  const existingAttempt = await tx.financeCloseAttempt.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      idempotencyKey
    },
    include: { financeCloseRun: true }
  });
  if (existingAttempt) {
    return existingAttempt.financeCloseRun;
  }

  const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
  assertSensitiveApprovalActionAllowed(run, "REOPEN_PERIOD");

  const reopenedAt = new Date();
  const reopenedUntil = new Date(
    reopenedAt.getTime() + policy.reopenWindowHours * 60 * 60 * 1000
  );
  const periodReopen = await tx.accountingPeriod.updateMany({
    where: {
      id: run.accountingPeriodId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: {
        in: ["SOFT_CLOSED", "LOCKED"]
      }
    },
    data: {
      status: "REOPENED",
      reopenedAt,
      reopenedUntil,
      closeEvidenceReference: input.evidenceReference
    }
  });
  if (periodReopen.count !== 1) {
    throw new Error("ACCOUNTING_PERIOD_REOPEN_STATE_CONFLICT");
  }

  const resetChecklist = await tx.financeCloseChecklistItem.updateMany({
    where: {
      tenantId: run.tenantId,
      companyId: run.companyId,
      financeCloseRunId: run.id,
      isRequired: true,
      checklistType: {
        in: ["BANK_RECONCILIATION", "MANAGEMENT_SIGNOFF"]
      }
    },
    data: {
      status: "PENDING",
      completedByUserId: null,
      completedAt: null,
      reviewedByUserId: null,
      reviewedAt: null,
      resultSummary: "Post-reopen review required before re-close.",
      exceptionReason: input.reason,
      evidenceReference: null
    }
  });
  const updatedRun = await tx.financeCloseRun.update({
    where: { id: run.id },
    data: {
      status: "VALIDATING",
      readyAt: null,
      closedAt: null,
      reason: input.reason,
      evidenceReference: input.evidenceReference,
      configSnapshot: withoutPendingCloseApproval(run.configSnapshot),
      version: { increment: 1 }
    }
  });

  await tx.financeCloseAttempt.create({
    data: {
      tenantId: run.tenantId,
      companyId: run.companyId,
      accountingPeriodId: run.accountingPeriodId,
      financeCloseRunId: run.id,
      action: "REOPEN_PERIOD",
      result: "SUCCEEDED",
      idempotencyKey,
      attemptedByUserId: session.user.id,
      notes: input.reason,
      failureContext: {
        accountingPeriodReopened: true,
        previousPeriodStatus: run.accountingPeriod.status,
        reopenWindowHours: policy.reopenWindowHours,
        reopenedAt,
        reopenedUntil,
        resetChecklistCount: resetChecklist.count,
        approvalInstanceId: input.approvalInstanceId ?? null
      }
    }
  });
  await writeCloseAudit(tx, {
    session,
    entityType: "AccountingPeriod",
    entityId: run.accountingPeriodId,
    eventType: "finance_close.accounting_period_reopened",
    beforeStatus: run.accountingPeriod.status,
    afterStatus: "REOPENED",
    reason: input.reason,
    evidenceReference: input.evidenceReference,
    metadata: {
      financeCloseRunId: run.id,
      approvalInstanceId: input.approvalInstanceId ?? null,
      reopenWindowHours: policy.reopenWindowHours,
      reopenedAt,
      reopenedUntil,
      resetChecklistCount: resetChecklist.count,
      noAccountingPeriodMutation: false,
      noApMutation: true,
      noPaymentReleaseMutation: true,
      noBankReconciliationMutation: true,
      noJournalPosting: true
    }
  });
  await writeCloseAudit(tx, {
    session,
    entityType: "FinanceCloseRun",
    entityId: run.id,
    eventType: "finance_close.close_run_reopened_for_validation",
    beforeStatus: run.status,
    afterStatus: updatedRun.status,
    reason: input.reason,
    evidenceReference: input.evidenceReference,
    metadata: {
      accountingPeriodId: run.accountingPeriodId,
      approvalInstanceId: input.approvalInstanceId ?? null,
      previousPeriodStatus: run.accountingPeriod.status,
      reopenWindowHours: policy.reopenWindowHours,
      postReopenReviewRequired: true,
      resetChecklistCount: resetChecklist.count,
      noSourceMutation: true
    }
  });

  return updatedRun;
}

export async function reopenAccountingPeriodFromCloseRun(
  session: SessionContext,
  input: PeriodCloseActionInput
) {
  return requestPeriodCloseSensitiveActionApproval(session, {
    ...input,
    approvalAction: "REOPEN_PERIOD"
  });
}

async function findActionableFinanceCloseRunApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveFinanceCloseApprovalRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "FinanceCloseRun",
      status: "PENDING"
    },
    include: {
      steps: {
        where: { status: "PENDING" },
        take: 1
      }
    }
  });

  const step = approval?.steps[0];
  if (!approval || !step) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  const isAssignedUser = step.assignedUserId === session.user.id;
  const isAssignedRole = step.assignedRoleId
    ? roleIds.includes(step.assignedRoleId)
    : false;
  if (!isAssignedUser && !isAssignedRole) {
    throw new Error("APPROVAL_ASSIGNMENT_DENIED");
  }

  const run = await prisma.financeCloseRun.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      accountingPeriod: true,
      checklistItems: true,
      exceptions: true
    }
  });
  if (!run) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  const pendingAction = readPendingCloseApprovalAction(run.configSnapshot);
  if (
    run.initiatedByUserId === session.user.id ||
    pendingAction.requestedByUserId === session.user.id
  ) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, run, pendingAction };
}

async function prepareFinanceCloseApprovalDecision(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    approvalInstanceId: string;
    currentStepId: string;
    currentStepOrder: number;
    includeNextStep: boolean;
  }
) {
  if (!normalizedApprovalRoutingEnabled()) return null;
  return prepareNormalizedApprovalDecisionPreflight(tx, session, input);
}

async function lockAndRevalidateFinanceCloseApprovalSource(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    financeCloseRunId: string;
    expectedVersion: number;
    expectedApprovalAction: PeriodCloseSensitiveApprovalAction;
    expectedRequestedByUserId: string | null;
  }
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT run.id
      FROM "FinanceCloseRun" run
     WHERE run.id = ${input.financeCloseRunId}::uuid
       AND run."tenantId" = ${session.context.tenantId}::uuid
       AND run."companyId" = ${session.context.companyId}::uuid
     FOR UPDATE OF run
  `;
  if (locked.length !== 1) throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");

  const run = await tx.financeCloseRun.findUnique({
    where: { id: input.financeCloseRunId },
    select: {
      version: true,
      initiatedByUserId: true,
      configSnapshot: true
    }
  });
  if (!run || run.version !== input.expectedVersion) {
    throw new Error("APPROVAL_SOURCE_STATE_CHANGED");
  }
  const pendingAction = readPendingCloseApprovalAction(run.configSnapshot);
  if (
    pendingAction.approvalAction !== input.expectedApprovalAction ||
    pendingAction.requestedByUserId !== input.expectedRequestedByUserId
  ) {
    throw new Error("APPROVAL_SOURCE_STATE_CHANGED");
  }
  if (
    run.initiatedByUserId === session.user.id ||
    pendingAction.requestedByUserId === session.user.id
  ) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }
}

async function resolveFinanceCloseNextApprovalStep(
  tx: TransactionClient,
  input: {
    approvalInstanceId: string;
    currentStepOrder: number;
    normalizedPreflight: NormalizedApprovalDecisionPreflight | null;
  }
) {
  if (input.normalizedPreflight) return input.normalizedPreflight.nextStep;
  return tx.approvalInstanceStep.findFirst({
    where: {
      approvalInstanceId: input.approvalInstanceId,
      stepOrder: { gt: input.currentStepOrder },
      status: "WAITING"
    },
    orderBy: { stepOrder: "asc" }
  });
}

async function decideFinanceCloseApprovalStep(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    approvalInstanceId: string;
    currentStepId: string;
    currentStepOrder: number;
    status: "APPROVED" | "REJECTED";
    remarks?: string;
  }
) {
  const updated = await tx.approvalInstanceStep.updateMany({
    where: {
      id: input.currentStepId,
      approvalInstanceId: input.approvalInstanceId,
      stepOrder: input.currentStepOrder,
      status: "PENDING",
      approvalInstance: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING",
        currentStepOrder: input.currentStepOrder
      }
    },
    data: {
      status: input.status,
      actedAt: new Date(),
      actedByUserId: session.user.id,
      ...(input.remarks ? { remarks: input.remarks } : {})
    }
  });
  if (updated.count !== 1) throw new Error("APPROVAL_NOT_ACTIONABLE");
}

async function transitionFinanceCloseApprovalInstance(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    approvalInstanceId: string;
    currentStepOrder: number;
    status?: "APPROVED" | "REJECTED";
    nextStepOrder: number | null;
  }
) {
  const updated = await tx.approvalInstance.updateMany({
    where: {
      id: input.approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING",
      currentStepOrder: input.currentStepOrder
    },
    data: {
      ...(input.status ? { status: input.status } : {}),
      currentStepOrder: input.nextStepOrder
    }
  });
  if (updated.count !== 1) throw new Error("APPROVAL_NOT_ACTIONABLE");
}

export async function approveFinanceCloseRunApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePeriodCloseManage);
  const values = periodCloseApprovalDecisionSchema.parse(
    Object.fromEntries(formData)
  );
  const { approval, step, run, pendingAction } =
    await findActionableFinanceCloseRunApproval(
      session,
      values.approvalInstanceId
    );
  const reason = pendingAction.reason ?? run.reason;
  const evidenceReference =
    pendingAction.evidenceReference ?? run.evidenceReference;
  if (!reason) {
    throw new Error("PERIOD_CLOSE_APPROVAL_REASON_REQUIRED");
  }
  if (!evidenceReference) {
    throw new Error("PERIOD_CLOSE_APPROVAL_EVIDENCE_REQUIRED");
  }

  await prisma.$transaction(async (tx) => {
    const normalizedPreflight = await prepareFinanceCloseApprovalDecision(
      tx,
      session,
      {
        approvalInstanceId: approval.id,
        currentStepId: step.id,
        currentStepOrder: step.stepOrder,
        includeNextStep: true
      }
    );
    await lockAndRevalidateFinanceCloseApprovalSource(tx, session, {
      financeCloseRunId: run.id,
      expectedVersion: run.version,
      expectedApprovalAction: pendingAction.approvalAction,
      expectedRequestedByUserId: pendingAction.requestedByUserId
    });
    await decideFinanceCloseApprovalStep(tx, session, {
      approvalInstanceId: approval.id,
      currentStepId: step.id,
      currentStepOrder: step.stepOrder,
      status: "APPROVED",
      ...(values.remarks ? { remarks: values.remarks } : {})
    });

    const nextStep = await resolveFinanceCloseNextApprovalStep(tx, {
      approvalInstanceId: approval.id,
      currentStepOrder: step.stepOrder,
      normalizedPreflight
    });

    if (nextStep) {
      await activateApprovalStepWithEligibility(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        approvalInstanceStepId: nextStep.id,
        activationAudit: {
          actorUserId: session.user.id,
          source: "finance_close.approval_step_advance"
        }
      });
      await transitionFinanceCloseApprovalInstance(tx, session, {
        approvalInstanceId: approval.id,
        currentStepOrder: step.stepOrder,
        nextStepOrder: nextStep.stepOrder
      });
      if (normalizedPreflight?.directRecipientUserId) {
        await recordApprovalStepReadyNotification(tx, {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: null,
          approvalInstanceId: approval.id,
          approvalInstanceStepId: nextStep.id,
          stepOrder: nextStep.stepOrder,
          recipientUserId: normalizedPreflight.directRecipientUserId,
          publicReference: run.publicReference,
          locationName: session.context.companyName,
          entityLabel: "Finance close run",
          entityType: "FinanceCloseRun",
          entityId: run.id
        });
      }
      await writeCloseAudit(tx, {
        session,
        entityType: "FinanceCloseRun",
        entityId: run.id,
        eventType: "finance_close.sensitive_action_approval_step_approved",
        beforeStatus: run.status,
        afterStatus: run.status,
        reason,
        evidenceReference,
        metadata: {
          approvalInstanceId: approval.id,
          approvalAction: pendingAction.approvalAction,
          approvedStepOrder: step.stepOrder,
          nextStepOrder: nextStep.stepOrder,
          remarks: values.remarks ?? null,
          noAccountingPeriodMutation: true,
          noJournalPosting: true
        }
      });
      return;
    }

    await transitionFinanceCloseApprovalInstance(tx, session, {
      approvalInstanceId: approval.id,
      currentStepOrder: step.stepOrder,
      status: "APPROVED",
      nextStepOrder: null
    });

    await recordApprovalOutcomeNotification(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: null,
      approvalInstanceId: approval.id,
      recipientUserIds: [
        run.initiatedByUserId,
        pendingAction.requestedByUserId
      ].filter((userId): userId is string => Boolean(userId)),
      publicReference: run.publicReference,
      locationName: session.context.companyName,
      entityLabel: "Finance close run",
      entityType: "FinanceCloseRun",
      entityId: run.id,
      outcome: "APPROVED"
    });

    if (pendingAction.approvalAction === "LOCK_PERIOD") {
      await lockAccountingPeriodFromCloseRunTx(tx, session, {
        financeCloseRunId: run.id,
        reason,
        evidenceReference,
        approvalInstanceId: approval.id,
        idempotencyKey: `close:${run.id}:approved-lock:${approval.id}`
      });
    } else {
      await reopenAccountingPeriodFromCloseRunTx(tx, session, {
        financeCloseRunId: run.id,
        reason,
        evidenceReference,
        approvalInstanceId: approval.id,
        idempotencyKey: `close:${run.id}:approved-reopen:${approval.id}`
      });
    }

    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseRun",
      entityId: run.id,
      eventType: "finance_close.sensitive_action_approved",
      beforeStatus: run.status,
      afterStatus:
        pendingAction.approvalAction === "REOPEN_PERIOD"
          ? "VALIDATING"
          : run.status,
      reason,
      evidenceReference,
      metadata: {
        approvalInstanceId: approval.id,
        approvalAction: pendingAction.approvalAction,
        remarks: values.remarks ?? null,
        noSelfApproval: true
      }
    });
  });
}

export async function rejectFinanceCloseRunApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePeriodCloseManage);
  const values = periodCloseApprovalRemarksRequiredSchema.parse(
    Object.fromEntries(formData)
  );
  const { approval, step, run, pendingAction } =
    await findActionableFinanceCloseRunApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    await prepareFinanceCloseApprovalDecision(tx, session, {
      approvalInstanceId: approval.id,
      currentStepId: step.id,
      currentStepOrder: step.stepOrder,
      includeNextStep: false
    });
    await lockAndRevalidateFinanceCloseApprovalSource(tx, session, {
      financeCloseRunId: run.id,
      expectedVersion: run.version,
      expectedApprovalAction: pendingAction.approvalAction,
      expectedRequestedByUserId: pendingAction.requestedByUserId
    });
    await decideFinanceCloseApprovalStep(tx, session, {
      approvalInstanceId: approval.id,
      currentStepId: step.id,
      currentStepOrder: step.stepOrder,
      status: "REJECTED",
      ...(values.remarks ? { remarks: values.remarks } : {})
    });
    await skipFutureApprovalStepsForTerminalDecision(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceId: approval.id,
      currentStepOrder: step.stepOrder
    });
    await transitionFinanceCloseApprovalInstance(tx, session, {
      approvalInstanceId: approval.id,
      currentStepOrder: step.stepOrder,
      status: "REJECTED",
      nextStepOrder: null
    });
    await recordApprovalOutcomeNotification(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: null,
      approvalInstanceId: approval.id,
      recipientUserIds: [
        run.initiatedByUserId,
        pendingAction.requestedByUserId
      ].filter((userId): userId is string => Boolean(userId)),
      publicReference: run.publicReference,
      locationName: session.context.companyName,
      entityLabel: "Finance close run",
      entityType: "FinanceCloseRun",
      entityId: run.id,
      outcome: "REJECTED"
    });
    const sourceUpdate = await tx.financeCloseRun.updateMany({
      where: {
        id: run.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        version: run.version
      },
      data: {
        configSnapshot: withoutPendingCloseApproval(run.configSnapshot),
        version: { increment: 1 }
      }
    });
    if (sourceUpdate.count !== 1) {
      throw new Error("APPROVAL_SOURCE_STATE_CHANGED");
    }
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseRun",
      entityId: run.id,
      eventType: "finance_close.sensitive_action_rejected",
      beforeStatus: run.status,
      afterStatus: run.status,
      reason: values.remarks,
      evidenceReference: run.evidenceReference,
      metadata: {
        approvalInstanceId: approval.id,
        approvalAction: pendingAction.approvalAction,
        noAccountingPeriodMutation: true,
        noJournalPosting: true
      }
    });
  });
}

export async function cancelPeriodCloseRun(
  session: SessionContext,
  input: PeriodCloseActionInput
) {
  await requirePermission(session, permissions.financePeriodCloseManage);
  const reason = requireCloseReason(
    input.reason,
    "PERIOD_CLOSE_CANCELLATION_REASON_REQUIRED"
  );
  const evidenceReference = requireCloseEvidence(
    input.evidenceReference,
    "PERIOD_CLOSE_CANCELLATION_EVIDENCE_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const run = await getScopedCloseRunOrThrow(tx, session, input.financeCloseRunId);
    assertRunMutable(run.status);
    const approvalTermination = await terminatePendingApprovalForCancellation(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "FinanceCloseRun",
      documentId: run.id,
      policy: "APPROVAL_OPTIONAL"
    });
    const sourceUpdate = await tx.financeCloseRun.updateMany({
      where: { id: run.id, tenantId: session.context.tenantId, companyId: session.context.companyId, status: run.status, version: run.version },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        reason,
        evidenceReference,
        version: { increment: 1 }
      }
    });
    if (sourceUpdate.count !== 1) throw new Error("PERIOD_CLOSE_CANCELLATION_CONFLICT");
    const updated = await tx.financeCloseRun.findFirstOrThrow({
      where: {
        id: run.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      }
    });
    await tx.financeCloseAttempt.create({
      data: {
        tenantId: run.tenantId,
        companyId: run.companyId,
        accountingPeriodId: run.accountingPeriodId,
        financeCloseRunId: run.id,
        action: "CANCEL_RUN",
        result: "SUCCEEDED",
        idempotencyKey:
          input.idempotencyKey ?? `close:${run.id}:cancel:${Date.now()}`,
        attemptedByUserId: session.user.id,
        notes: reason
      }
    });
    await writeCloseAudit(tx, {
      session,
      entityType: "FinanceCloseRun",
      entityId: run.id,
      eventType: "finance_close.cancelled",
      beforeStatus: run.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        approvalTerminationMode: approvalTermination.mode,
        approvalInstanceId: approvalTermination.approvalInstanceId
      }
    });
    return updated;
  });
}

export async function getPeriodCloseDashboard(
  session: SessionContext
): Promise<PeriodCloseDashboard> {
  await requirePermission(session, permissions.financePeriodCloseManage);

  const [runs, periods] = await Promise.all([
    prisma.financeCloseRun.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      include: {
        accountingPeriod: true,
        initiatedBy: true,
        checklistItems: {
          include: {
            owner: true,
            completedBy: true,
            reviewedBy: true
          },
          orderBy: {
            sequence: "asc"
          }
        },
        exceptions: {
          include: {
            raisedBy: true,
            assignedTo: true
          },
          orderBy: [{ severity: "asc" }, { dueAt: "asc" }]
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    }),
    prisma.accountingPeriod.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["OPEN", "REOPENED"] }
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true
      },
      orderBy: [{ startDate: "desc" }],
      take: 24
    })
  ]);

  return buildPeriodCloseDashboard(
    session,
    runs,
    periods.map((period) => ({
      id: period.id,
      code: period.code,
      name: period.name,
      status: period.status,
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString()
    }))
  );
}
