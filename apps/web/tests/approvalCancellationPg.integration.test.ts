import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { permissions } from "../src/server/services/authorization";
import { configureApprovalStepRouting } from "../src/server/services/approvalRouting";
import { approvalRoutingPolicies } from "../src/server/services/approvalRoutingRegistry";
import { cancelBudgetRevision } from "../src/server/services/budgetControl";
import { cancelCashAdvanceRequest } from "../src/server/services/cashAdvances";
import type { SessionContext } from "../src/server/services/context";
import { cancelExpenseRequest } from "../src/server/services/expenseRequests";
import { cancelPeriodCloseRun } from "../src/server/services/financePeriodClose";
import { cancelPaymentRelease, cancelPaymentRequest } from "../src/server/services/finance";
import { cancelPettyCashRequest } from "../src/server/services/pettyCash";
import {
  cancelLeaveRequest,
  cancelOvertimeRecord,
  cancelWorkforceSchedule,
  voidAttendanceImportBatch,
} from "../src/server/services/workforce";
import {
  createSpecializedParitySource,
  type ApprovalDecisionPgFixture,
  type ApprovalDecisionPgSourceContext,
} from "./helpers/approvalDecisionPgFixtures";

const contextMock = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));
vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<typeof import("../src/server/services/context")>(
    "../src/server/services/context",
  );
  return { ...actual, requireSessionContext: contextMock.requireSessionContext };
});

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";
const cancellationReason = "PostgreSQL cancellation integrity evidence";
const evidenceReference = "fixture://approval-cancellation/evidence";

type Family =
  | "BudgetRevision"
  | "ExpenseRequest"
  | "CashAdvanceRequest"
  | "PettyCashRequest"
  | "PaymentRequest"
  | "PaymentRelease"
  | "FinanceCloseRun"
  | "EmployeeLeaveRequest"
  | "EmployeeOvertimeRecord"
  | "WorkforceSchedule"
  | "AttendanceImportBatch";

type Case = {
  family: Family;
  permissionCode: string;
  finalStatus: "CANCELLED" | "VOIDED";
  eventType: string;
  entityType: string;
  metadataModeKey: "approvalTerminationMode" | "approvalCancellationMode";
};

const cases = [
  { family: "BudgetRevision", permissionCode: permissions.financeBudgetManage, finalStatus: "CANCELLED", eventType: "budget.revision_cancelled", entityType: "Budget", metadataModeKey: "approvalTerminationMode" },
  { family: "ExpenseRequest", permissionCode: permissions.financeExpenseRequestCreate, finalStatus: "CANCELLED", eventType: "expense_request.cancelled", entityType: "ExpenseRequest", metadataModeKey: "approvalTerminationMode" },
  { family: "CashAdvanceRequest", permissionCode: permissions.financeCashAdvanceSubmit, finalStatus: "CANCELLED", eventType: "cash_advance.cancelled", entityType: "CashAdvanceRequest", metadataModeKey: "approvalTerminationMode" },
  { family: "PettyCashRequest", permissionCode: permissions.financePettyCashSubmit, finalStatus: "CANCELLED", eventType: "petty_cash.request_cancelled", entityType: "PettyCashRequest", metadataModeKey: "approvalTerminationMode" },
  { family: "PaymentRequest", permissionCode: permissions.financePaymentRequestCreate, finalStatus: "CANCELLED", eventType: "payment_request.cancelled", entityType: "PaymentRequest", metadataModeKey: "approvalTerminationMode" },
  { family: "PaymentRelease", permissionCode: permissions.financePaymentRelease, finalStatus: "CANCELLED", eventType: "payment_release.cancelled", entityType: "PaymentRelease", metadataModeKey: "approvalTerminationMode" },
  { family: "FinanceCloseRun", permissionCode: permissions.financePeriodCloseManage, finalStatus: "CANCELLED", eventType: "finance_close.cancelled", entityType: "FinanceCloseRun", metadataModeKey: "approvalTerminationMode" },
  { family: "EmployeeLeaveRequest", permissionCode: permissions.workforceManage, finalStatus: "CANCELLED", eventType: "workforce.leave_cancelled", entityType: "EmployeeLeaveRequest", metadataModeKey: "approvalCancellationMode" },
  { family: "EmployeeOvertimeRecord", permissionCode: permissions.workforceManage, finalStatus: "CANCELLED", eventType: "workforce.overtime_cancelled", entityType: "EmployeeOvertimeRecord", metadataModeKey: "approvalCancellationMode" },
  { family: "WorkforceSchedule", permissionCode: permissions.workforceScheduleManage, finalStatus: "CANCELLED", eventType: "workforce.schedule_cancelled", entityType: "WorkforceSchedule", metadataModeKey: "approvalCancellationMode" },
  { family: "AttendanceImportBatch", permissionCode: permissions.workforceAttendanceImportManage, finalStatus: "VOIDED", eventType: "workforce.attendance_import_voided", entityType: "AttendanceImportBatch", metadataModeKey: "approvalCancellationMode" },
] as const satisfies readonly Case[];

const approvalPermissionByFamily = {
  BudgetRevision: permissions.financeBudgetApprove,
  ExpenseRequest: permissions.financeExpenseRequestApprove,
  CashAdvanceRequest: permissions.financeCashAdvanceApprove,
  PettyCashRequest: permissions.financePettyCashApprove,
  PaymentRequest: permissions.financePaymentRequestApprove,
  PaymentRelease: permissions.financePaymentRelease,
  FinanceCloseRun: permissions.financePeriodCloseManage,
  EmployeeLeaveRequest: permissions.workforceLeaveApprove,
  EmployeeOvertimeRecord: permissions.workforceOvertimeApprove,
  WorkforceSchedule: permissions.workforceScheduleManage,
  AttendanceImportBatch: permissions.workforceAttendanceImportManage,
} as const satisfies Record<Family, string>;

async function createFinanceDependencies(context: ApprovalDecisionPgSourceContext) {
  const fiscalYear = await prisma.fiscalYear.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      code: `FY-${context.suffix}`,
      name: `Cancellation FY ${context.suffix}`,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.000Z"),
    },
  });
  const period = await prisma.accountingPeriod.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      fiscalYearId: fiscalYear.id,
      periodNumber: 7,
      code: `P07-${context.suffix}`,
      name: "July 2026",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-31T23:59:59.000Z"),
    },
  });
  return { fiscalYear, period };
}

async function createSource(family: Family, context: ApprovalDecisionPgSourceContext) {
  if (["ExpenseRequest", "CashAdvanceRequest", "EmployeeLeaveRequest", "EmployeeOvertimeRecord", "WorkforceSchedule", "AttendanceImportBatch"].includes(family)) {
    return createSpecializedParitySource(family as Parameters<typeof createSpecializedParitySource>[0], context);
  }
  if (family === "BudgetRevision") {
    const { fiscalYear } = await createFinanceDependencies(context);
    const budget = await prisma.budget.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        publicReference: `B-CANCEL-${context.suffix}`,
        fiscalYearId: fiscalYear.id,
        name: "Cancellation budget",
        locationId: context.locationId,
        createdByUserId: context.requesterUserId,
      },
    });
    const revision = await prisma.budgetRevision.create({
      data: {
        budgetId: budget.id,
        tenantId: context.tenantId,
        companyId: context.companyId,
        revisionNumber: 1,
        status: "SUBMITTED",
        reason: "Cancellation fixture",
        requestedByUserId: context.requesterUserId,
        originalSnapshot: {},
        proposedSnapshot: {},
      },
    });
    return { id: revision.id, relatedEntityIds: [budget.id] };
  }
  if (family === "PettyCashRequest") {
    const fund = await prisma.pettyCashFund.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        publicReference: `PCF-CANCEL-${context.suffix}`,
        code: `PCF-${context.suffix}`,
        name: "Cancellation fund",
        locationId: context.locationId,
        custodianUserId: context.requesterUserId,
        createdByUserId: context.requesterUserId,
      },
    });
    return prisma.pettyCashRequest.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        pettyCashFundId: fund.id,
        publicReference: `PCR-CANCEL-${context.suffix}`,
        requestType: "DISBURSEMENT",
        status: "AWAITING_APPROVAL",
        requestedAmountPhp: 100,
        purpose: "Cancellation fixture",
        justification: "Cancellation fixture",
        locationId: context.locationId,
        requestedByUserId: context.requesterUserId,
        submittedByUserId: context.requesterUserId,
        submittedAt: new Date(),
      },
      select: { id: true },
    });
  }
  if (family === "FinanceCloseRun") {
    const { period } = await createFinanceDependencies(context);
    return prisma.financeCloseRun.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        accountingPeriodId: period.id,
        publicReference: `FCR-CANCEL-${context.suffix}`,
        status: "OPEN",
        initiatedByUserId: context.requesterUserId,
      },
      select: { id: true },
    });
  }
  const supplier = await prisma.supplier.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      supplierCode: `SUP-${context.suffix}`,
      legalName: "Cancellation supplier",
    },
  });
  const paymentRequest = await prisma.paymentRequest.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      locationId: context.locationId,
      supplierId: supplier.id,
      publicReference: `PAY-CANCEL-${context.suffix}`,
      totalRequestedAmount: 100,
      status: family === "PaymentRequest" ? "AWAITING_APPROVAL" : "APPROVED",
      requestedByUserId: context.requesterUserId,
      approvedByUserId: family === "PaymentRelease" ? context.requesterUserId : null,
      approvedAt: family === "PaymentRelease" ? new Date() : null,
      submittedAt: new Date(),
      requestReason: "Cancellation fixture",
    },
  });
  if (family === "PaymentRequest") return { id: paymentRequest.id };
  const accountClass = await prisma.financeAccountClass.create({
    data: { tenantId: context.tenantId, companyId: context.companyId, code: `AC-${context.suffix}`, name: "Assets", normalBalance: "DEBIT", statementSection: "BALANCE_SHEET" },
  });
  const ledger = await prisma.chartOfAccount.create({
    data: { tenantId: context.tenantId, companyId: context.companyId, accountClassId: accountClass.id, code: `GL-${context.suffix}`, name: "Bank", normalBalance: "DEBIT", postingAllowed: true },
  });
  const bank = await prisma.bankAccount.create({
    data: { tenantId: context.tenantId, companyId: context.companyId, locationId: context.locationId, ledgerAccountId: ledger.id, publicReference: `BANK-${context.suffix}`, bankName: "Cancellation Bank", maskedAccountNumber: "****0052", accountType: "CHECKING", createdByUserId: context.requesterUserId },
  });
  return prisma.paymentRelease.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      locationId: context.locationId,
      supplierId: supplier.id,
      paymentRequestId: paymentRequest.id,
      bankAccountId: bank.id,
      publicReference: `REL-CANCEL-${context.suffix}`,
      status: "READY_FOR_RELEASE",
      totalRequestedAmount: 100,
      releaseAmount: 100,
      sourceEventKey: `release-cancel-${context.suffix}`,
      reason: "Cancellation fixture",
      evidenceReference,
      createdByUserId: context.requesterUserId,
    },
    select: { id: true },
  });
}

async function grantCancellationAuthority(
  fixture: ApprovalDecisionPgFixture,
  permissionCode: string,
  useSecondApprover = false,
) {
  const userId = useSecondApprover ? fixture.approverUserIds[1] : fixture.requesterUserId;
  const permission = await prisma.permission.findUniqueOrThrow({ where: { code: permissionCode }, select: { id: true } });
  const role = await prisma.role.create({
    data: {
      tenantId: fixture.tenantId,
      code: `CANCEL_${fixture.tenantId.slice(0, 8)}`,
      name: "Cancellation actor",
      permissions: { create: { permissionId: permission.id } },
    },
  });
  await prisma.userRoleAssignment.create({ data: { userId, roleId: role.id, startsAt: new Date(Date.now() - 60_000) } });
  const locationScope = await prisma.userScopeAssignment.create({
    data: { userId, scopeType: "LOCATION", scopeId: fixture.locationId, accessLevel: "MANAGE", startsAt: new Date(Date.now() - 60_000) },
  });
  await prisma.userScopeAssignment.create({
    data: { userId, scopeType: "COMPANY", scopeId: fixture.companyId, accessLevel: "MANAGE", startsAt: new Date(Date.now() - 60_000) },
  });
  return {
    user: { id: userId, email: `${userId}@test.invalid`, displayName: "Cancellation actor", role: "Manager" },
    context: {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      companyName: "Cancellation company",
      brandId: fixture.brandId,
      brandName: "Cancellation brand",
      locationId: fixture.locationId,
      locationName: "Cancellation location",
      locationType: "BRANCH",
    },
    authorizedLocations: [{
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      companyName: "Cancellation company",
      brandId: fixture.brandId,
      brandName: "Cancellation brand",
      locationId: fixture.locationId,
      locationName: "Cancellation location",
      locationType: "BRANCH",
      scopeAssignmentId: locationScope.id,
      accessLevel: "MANAGE",
    }],
    permissionCodes: [permissionCode],
  } satisfies SessionContext;
}

async function createFixture(item: Case) {
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    brandId: randomUUID(),
    locationId: randomUUID(),
    requesterUserId: randomUUID(),
    approverOneId: randomUUID(),
    approverTwoId: randomUUID(),
    roleId: randomUUID(),
    ruleId: randomUUID(),
    approvalId: randomUUID(),
    stepOneId: randomUUID(),
    stepTwoId: randomUUID(),
  };
  const suffix = ids.tenantId.slice(0, 8);
  const approvalPermission = await prisma.permission.findUniqueOrThrow({
    where: { code: approvalPermissionByFamily[item.family] },
    select: { id: true },
  });
  await prisma.tenant.create({ data: { id: ids.tenantId, name: `Cancellation ${suffix}`, loginCode: `cancel-${suffix}` } });
  await prisma.company.create({ data: { id: ids.companyId, tenantId: ids.tenantId, code: `CAN-${suffix}`, legalName: `Cancellation ${suffix}`, currencyCode: "PHP" } });
  await prisma.brand.create({ data: { id: ids.brandId, tenantId: ids.tenantId, companyId: ids.companyId, code: `CAN-${suffix}`, name: `Cancellation ${suffix}` } });
  await prisma.location.create({ data: { id: ids.locationId, tenantId: ids.tenantId, companyId: ids.companyId, brandId: ids.brandId, locationType: "BRANCH", code: `CAN-${suffix}`, name: `Cancellation ${suffix}` } });
  await prisma.user.createMany({
    data: [
      { id: ids.requesterUserId, tenantId: ids.tenantId, email: `requester-${suffix}@test.invalid`, displayName: "Cancellation requester" },
      { id: ids.approverOneId, tenantId: ids.tenantId, email: `approver-one-${suffix}@test.invalid`, displayName: "Cancellation approver one" },
      { id: ids.approverTwoId, tenantId: ids.tenantId, email: `approver-two-${suffix}@test.invalid`, displayName: "Cancellation approver two" },
    ],
  });
  await prisma.role.create({
    data: { id: ids.roleId, tenantId: ids.tenantId, code: `APPROVE_${suffix}`, name: "Cancellation approvers", permissions: { create: { permissionId: approvalPermission.id } } },
  });
  await prisma.userRoleAssignment.createMany({
    data: [ids.approverOneId, ids.approverTwoId].map((userId) => ({ userId, roleId: ids.roleId, startsAt: new Date(Date.now() - 60_000) })),
  });
  const approverScopes = await Promise.all(
    [ids.approverOneId, ids.approverTwoId].map((userId) => prisma.userScopeAssignment.create({
      data: { userId, scopeType: "LOCATION", scopeId: ids.locationId, accessLevel: "APPROVE", startsAt: new Date(Date.now() - 60_000) },
      select: { id: true },
    })),
  );
  const sourceContext = {
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    brandId: ids.brandId,
    locationId: ids.locationId,
    requesterUserId: ids.requesterUserId,
    suffix,
  };
  const createdSource = await createSource(item.family, sourceContext);
  const sourceId = typeof createdSource === "string" ? createdSource : createdSource.id;
  const relatedEntityIds = typeof createdSource === "string" ? [] : (createdSource.relatedEntityIds ?? []);
  await prisma.approvalRule.create({ data: { id: ids.ruleId, tenantId: ids.tenantId, companyId: ids.companyId, transactionType: `CANCEL_${item.family}_${suffix}`, priority: 1 } });
  await prisma.approvalInstance.create({
    data: {
      id: ids.approvalId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      documentType: item.family,
      documentId: sourceId,
      approvalRuleId: ids.ruleId,
      status: "PENDING",
      currentStepOrder: 1,
      steps: { create: [
        { id: ids.stepOneId, stepOrder: 1, assignedRoleId: ids.roleId, status: "PENDING" },
        { id: ids.stepTwoId, stepOrder: 2, assignedRoleId: ids.roleId, status: "WAITING" },
      ] },
    },
  });
  const scopeTargets = item.family === "FinanceCloseRun"
    ? [{ scopeType: "COMPANY" as const, companyId: ids.companyId }]
    : [{ scopeType: "LOCATION" as const, companyId: ids.companyId, locationId: ids.locationId }];
  const dueAt = new Date(Date.now() + 86_400_000);
  for (const [index, stepId] of [ids.stepOneId, ids.stepTwoId].entries()) {
    await prisma.$transaction((tx) => configureApprovalStepRouting(tx, {
      approvalInstanceStepId: stepId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      routingPolicy: approvalRoutingPolicies[item.family],
      requiredPermissionCode: approvalPermissionByFamily[item.family],
      activatedAt: index === 0 ? new Date() : null,
      dueAt,
      activationAudit: index === 0 ? { actorUserId: null, source: "approval-cancellation-postgresql-fixture" } : undefined,
      scopeGroups: [{ groupOrder: 1, targetMatchMode: "ANY", targets: scopeTargets }],
      prohibitedActors: [
        { userId: ids.requesterUserId, reasonCode: "REQUESTER" },
        ...(index === 1 ? [{ userId: ids.approverOneId, reasonCode: "PRIOR_APPROVER" }] : []),
      ],
    }));
  }
  const sessionFor = (step: 1 | 2): SessionContext => {
    const userId = step === 1 ? ids.approverOneId : ids.approverTwoId;
    return {
      user: { id: userId, email: `approver-${step}-${suffix}@test.invalid`, displayName: `Approver ${step}`, role: "Approver" },
      context: { tenantId: ids.tenantId, companyId: ids.companyId, companyName: `Cancellation ${suffix}`, brandId: ids.brandId, brandName: `Cancellation ${suffix}`, locationId: ids.locationId, locationName: `Cancellation ${suffix}`, locationType: "BRANCH" },
      authorizedLocations: [{
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        companyName: `Cancellation ${suffix}`,
        brandId: ids.brandId,
        brandName: `Cancellation ${suffix}`,
        locationId: ids.locationId,
        locationName: `Cancellation ${suffix}`,
        locationType: "BRANCH",
        scopeAssignmentId: approverScopes[step - 1]!.id,
        accessLevel: "APPROVE",
      }],
      permissionCodes: [approvalPermissionByFamily[item.family]],
    };
  };
  const fixture: ApprovalDecisionPgFixture = {
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    brandId: ids.brandId,
    locationId: ids.locationId,
    requesterUserId: ids.requesterUserId,
    approverUserIds: [ids.approverOneId, ids.approverTwoId],
    approvalInstanceId: ids.approvalId,
    sourceId,
    relatedEntityIds,
    stepIds: [ids.stepOneId, ids.stepTwoId],
    sessionFor,
  };
  const session = await grantCancellationAuthority(
    fixture,
    item.permissionCode,
    item.family === "PaymentRelease",
  );
  return { fixture, session };
}

async function executeCancellation(item: Case, fixture: ApprovalDecisionPgFixture, session: SessionContext) {
  const common = { reason: cancellationReason, evidenceReference };
  switch (item.family) {
    case "BudgetRevision": return cancelBudgetRevision(session, { budgetRevisionId: fixture.sourceId, ...common });
    case "ExpenseRequest": return cancelExpenseRequest(session, { expenseRequestId: fixture.sourceId, ...common });
    case "CashAdvanceRequest": return cancelCashAdvanceRequest(session, { cashAdvanceRequestId: fixture.sourceId, ...common });
    case "PettyCashRequest": return cancelPettyCashRequest(session, { pettyCashRequestId: fixture.sourceId, ...common });
    case "PaymentRequest":
      contextMock.requireSessionContext.mockResolvedValueOnce(session);
      return cancelPaymentRequest({ paymentRequestId: fixture.sourceId, reason: cancellationReason });
    case "PaymentRelease":
      contextMock.requireSessionContext.mockResolvedValueOnce(session);
      return cancelPaymentRelease({ paymentReleaseId: fixture.sourceId, ...common });
    case "FinanceCloseRun": return cancelPeriodCloseRun(session, { financeCloseRunId: fixture.sourceId, ...common });
    case "EmployeeLeaveRequest": return cancelLeaveRequest(session, { leaveRequestId: fixture.sourceId, ...common });
    case "EmployeeOvertimeRecord": return cancelOvertimeRecord(session, { overtimeRecordId: fixture.sourceId, ...common });
    case "WorkforceSchedule": return cancelWorkforceSchedule(session, { scheduleId: fixture.sourceId, ...common });
    case "AttendanceImportBatch": return voidAttendanceImportBatch(session, { batchId: fixture.sourceId, ...common });
  }
}

async function sourceStatus(family: Family, id: string) {
  switch (family) {
    case "BudgetRevision": return (await prisma.budgetRevision.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "ExpenseRequest": return (await prisma.expenseRequest.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "CashAdvanceRequest": return (await prisma.cashAdvanceRequest.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "PettyCashRequest": return (await prisma.pettyCashRequest.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "PaymentRequest": return (await prisma.paymentRequest.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "PaymentRelease": return (await prisma.paymentRelease.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "FinanceCloseRun": return (await prisma.financeCloseRun.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "EmployeeLeaveRequest": return (await prisma.employeeLeaveRequest.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "EmployeeOvertimeRecord": return (await prisma.employeeOvertimeRecord.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "WorkforceSchedule": return (await prisma.workforceSchedule.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    case "AttendanceImportBatch": return (await prisma.attendanceImportBatch.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForBlockedPid(blockerPid: number, excludedPids: number[] = []) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ pid: number }>>`
      SELECT activity.pid
        FROM pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND activity.pid <> pg_backend_pid()
         AND ${blockerPid}::int = ANY(pg_blocking_pids(activity.pid))
       ORDER BY activity.pid ASC
    `;
    const blocked = rows.find(({ pid }) => !excludedPids.includes(pid));
    if (blocked) return blocked.pid;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`POSTGRES_BLOCKED_PID_NOT_OBSERVED:${blockerPid}`);
}

describe.skipIf(!runPg).sequential("public approval cancellation PostgreSQL matrix", () => {
  let previousRoutingFlag: string | undefined;

  beforeAll(() => {
    previousRoutingFlag = process.env.APPROVAL_ROUTING_V1_ENABLED;
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true";
  });

  afterAll(async () => {
    if (previousRoutingFlag === undefined) delete process.env.APPROVAL_ROUTING_V1_ENABLED;
    else process.env.APPROVAL_ROUTING_V1_ENABLED = previousRoutingFlag;
    await prisma.$disconnect();
  });

  async function assertCancellationCase(item: Case) {
    const { fixture, session } = await createFixture(item);
    const result = await executeCancellation(item, fixture, session);
    expect(result.status).toBe(item.finalStatus);
    expect(await sourceStatus(item.family, fixture.sourceId)).toBe(item.finalStatus);

    const [instance, steps, audits, outcomeNotifications] = await Promise.all([
      prisma.approvalInstance.findUniqueOrThrow({ where: { id: fixture.approvalInstanceId }, select: { status: true, currentStepOrder: true } }),
      prisma.approvalInstanceStep.findMany({ where: { approvalInstanceId: fixture.approvalInstanceId }, orderBy: { stepOrder: "asc" }, select: { status: true } }),
      prisma.auditEvent.findMany({ where: { tenantId: fixture.tenantId, entityType: item.entityType, entityId: item.family === "BudgetRevision" ? fixture.relatedEntityIds[0] : fixture.sourceId, eventType: item.eventType }, select: { actorUserId: true, beforeData: true, afterData: true, metadata: true } }),
      prisma.notification.findMany({ where: { tenantId: fixture.tenantId, entityId: fixture.sourceId, notificationType: { startsWith: "APPROVAL_OUTCOME_" } } }),
    ]);
    expect(instance).toEqual({ status: "CANCELLED", currentStepOrder: null });
    expect(steps).toEqual([{ status: "SKIPPED" }, { status: "SKIPPED" }]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: session.user.id,
      beforeData: { status: expect.any(String) },
      afterData: { status: item.finalStatus },
      metadata: {
        [item.metadataModeKey]: "CANCELLED",
        approvalInstanceId: fixture.approvalInstanceId,
      },
    });
    expect(outcomeNotifications).toEqual([]);
  }

  test.each(cases.filter(({ family }) => family !== "BudgetRevision"))(
    "$family atomically cancels its source and pending approval",
    assertCancellationCase,
    10_000,
  );

  test(
    "BudgetRevision atomically cancels its source and pending approval",
    () => assertCancellationCase(cases.find(({ family }) => family === "BudgetRevision")!),
    10_000,
  );

  test("a retry cannot create a second cancellation audit or outcome notification", async () => {
    const item = cases.find(({ family }) => family === "BudgetRevision")!;
    const { fixture, session } = await createFixture(item);
    await executeCancellation(item, fixture, session);
    await expect(executeCancellation(item, fixture, session)).resolves.toMatchObject({ status: "CANCELLED" });
    expect(await prisma.auditEvent.count({ where: { tenantId: fixture.tenantId, eventType: item.eventType, entityId: fixture.relatedEntityIds[0] } })).toBe(1);
    expect(await prisma.notification.count({ where: { tenantId: fixture.tenantId, entityId: fixture.sourceId, notificationType: { startsWith: "APPROVAL_OUTCOME_" } } })).toBe(0);
  });

  test("FIN-AUTHZ-CANCELLATION-001 an actor from another tenant cannot cancel or terminate the approval", async () => {
    const item = cases.find(({ family }) => family === "ExpenseRequest")!;
    const { fixture, session } = await createFixture(item);
    const invalidSession: SessionContext = {
      ...session,
      context: { ...session.context, tenantId: randomUUID(), companyId: randomUUID() },
    };
    await expect(executeCancellation(item, fixture, invalidSession)).rejects.toThrow();
    expect(await sourceStatus(item.family, fixture.sourceId)).toBe("AWAITING_APPROVAL");
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: fixture.approvalInstanceId }, select: { status: true } })).toEqual({ status: "PENDING" });
    expect(await prisma.auditEvent.count({ where: { tenantId: fixture.tenantId, entityId: fixture.sourceId, eventType: item.eventType } })).toBe(0);
  });

  test("FIN-AUTHZ-CANCELLATION-RACE-001 ExpenseRequest final approval versus cancellation has one deterministic winner", async () => {
    const item = cases.find(({ family }) => family === "ExpenseRequest")!;
    const { fixture, session: cancellationSession } = await createFixture(item);
    const { executeCanonicalApprovalDecision } = await import("../src/server/services/approvals");
    const approvalCommand = {
      family: "ExpenseRequest" as const,
      decision: "APPROVE" as const,
      approvalInstanceId: fixture.approvalInstanceId,
      evidenceReference,
    };
    contextMock.requireSessionContext.mockReset();
    contextMock.requireSessionContext.mockResolvedValue(fixture.sessionFor(1));
    await executeCanonicalApprovalDecision(approvalCommand);

    const sourceLocked = deferred();
    const releaseSource = deferred();
    let blockerPid = 0;
    const blocker = prisma.$transaction(async (tx) => {
      [{ pid: blockerPid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`
        SELECT request.id
          FROM "ExpenseRequest" request
         WHERE request.id = ${fixture.sourceId}::uuid
         FOR UPDATE
      `;
      sourceLocked.resolve();
      await releaseSource.promise;
    });
    await sourceLocked.promise;

    contextMock.requireSessionContext.mockReset();
    contextMock.requireSessionContext.mockResolvedValue(fixture.sessionFor(2));
    const finalApproval = executeCanonicalApprovalDecision(approvalCommand);
    let cancellation: ReturnType<typeof executeCancellation> | undefined;
    try {
      const approvingPid = await waitForBlockedPid(blockerPid);
      cancellation = executeCancellation(item, fixture, cancellationSession);
      await waitForBlockedPid(approvingPid, [blockerPid]);
    } finally {
      releaseSource.resolve();
    }
    expect(cancellation).toBeDefined();

    const [approvalResult, cancellationResult, blockerResult] = await Promise.allSettled([
      finalApproval,
      cancellation!,
      blocker,
    ]);
    expect(approvalResult.status).toBe("fulfilled");
    expect(cancellationResult.status).toBe("rejected");
    expect(blockerResult.status).toBe("fulfilled");
    expect(await sourceStatus(item.family, fixture.sourceId)).toBe("APPROVED");
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: fixture.approvalInstanceId }, select: { status: true, currentStepOrder: true } })).toEqual({ status: "APPROVED", currentStepOrder: null });
    expect(await prisma.auditEvent.count({ where: { tenantId: fixture.tenantId, entityId: fixture.sourceId, eventType: "expense_request.approved" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { tenantId: fixture.tenantId, entityId: fixture.sourceId, eventType: item.eventType } })).toBe(0);
    expect(await prisma.notification.count({ where: { tenantId: fixture.tenantId, entityId: fixture.sourceId, notificationType: "APPROVAL_OUTCOME_APPROVED" } })).toBe(1);
  }, 8_000);
});
