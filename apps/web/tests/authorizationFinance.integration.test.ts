import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { SessionContext } from "../src/server/services/context";
import type { createDraftBudget as createDraftBudgetType } from "../src/server/services/budgetControl";
import type { createDraftCashAdvanceRequest as createDraftCashAdvanceRequestType } from "../src/server/services/cashAdvances";
import type { createDraftExpenseRequest as createDraftExpenseRequestType } from "../src/server/services/expenseRequests";
import type { startPeriodCloseRun as startPeriodCloseRunType } from "../src/server/services/financePeriodClose";
import type { createPettyCashFund as createPettyCashFundType } from "../src/server/services/pettyCash";
import {
  authenticationSessionTokenHash,
  clearAuthenticatedRequest,
  configureAuthenticatedRequest,
} from "./authenticatedRequestHarness";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(
  process.env,
);
if (!process.env.DATABASE_URL) {
  throw new Error("AUTHORIZATION_FINANCE_DATABASE_REQUIRED");
}

describe("finance authorization boundaries against PostgreSQL", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    adjacentCompanyId: randomUUID(),
    brandId: randomUUID(),
    locationId: randomUUID(),
    adjacentLocationId: randomUUID(),
    adjacentDepartmentId: randomUUID(),
    userId: randomUUID(),
    projectOwnerUserId: randomUUID(),
    roleId: randomUUID(),
    roleAssignmentId: randomUUID(),
    locationScopeId: randomUUID(),
    adjacentFiscalYearId: randomUUID(),
    adjacentPeriodId: randomUUID(),
    fiscalYearId: randomUUID(),
    accountingPeriodId: randomUUID(),
    accountClassId: randomUUID(),
    accountId: randomUUID(),
    adjacentProjectId: randomUUID(),
    selfBudgetId: randomUUID(),
    selfExpenseRequestId: randomUUID(),
    selfCashAdvanceId: randomUUID(),
    selfPettyCashFundId: randomUUID(),
    selfPettyCashRequestId: randomUUID(),
    authSessionId: randomUUID(),
    evidenceAttachmentId: randomUUID(),
    controlledEvidenceAttachmentId: randomUUID(),
  };
  const authSessionToken = `finance-authz-session-${randomUUID()}`;
  const permissionCodes = [
    "finance.view",
    "finance.configure",
    "finance.ledger.view",
    "finance.payables.view",
    "finance.ap_invoice.create",
    "finance.ap_invoice.submit",
    "finance.ap_invoice.match",
    "finance.ap_invoice.review_exception",
    "finance.ap_invoice.cancel",
    "finance.supplier_credit.create",
    "finance.supplier_credit.submit",
    "finance.supplier_credit.cancel",
    "finance.payment_request.create",
    "finance.payment_request.approve",
    "finance.payment.release",
    "finance.disbursement.create",
    "finance.disbursement.approve",
    "finance.cash_deposit.create",
    "finance.reconciliation.view",
    "finance.reconciliation.match",
    "finance.expense_request.create",
    "finance.expense_request.view",
    "finance.expense_request.submit",
    "finance.expense_request.approve",
    "finance.expense_request.complete",
    "finance.cash_advance.create",
    "finance.cash_advance.view",
    "finance.cash_advance.submit",
    "finance.cash_advance.approve",
    "finance.cash_advance.liquidate",
    "finance.cash_advance.review_liquidation",
    "finance.petty_cash.create",
    "finance.petty_cash.view",
    "finance.petty_cash.submit",
    "finance.petty_cash.approve",
    "finance.petty_cash.replenish",
    "finance.petty_cash.liquidate",
    "finance.petty_cash.review_liquidation",
    "finance.budget.manage",
    "finance.budget.view",
    "finance.budget.approve",
    "finance.budget.commitment.review",
    "finance.period_close.manage",
    "finance.journal.create",
    "finance.journal.submit",
    "finance.journal.approve",
    "finance.journal.post",
    "finance.journal.reverse",
    "projects.project.view",
  ] as const;

  let prisma: PrismaClient;
  let createDraftBudget: typeof createDraftBudgetType;
  let createDraftCashAdvanceRequest: typeof createDraftCashAdvanceRequestType;
  let createDraftExpenseRequest: typeof createDraftExpenseRequestType;
  let startPeriodCloseRun: typeof startPeriodCloseRunType;
  let createPettyCashFund: typeof createPettyCashFundType;
  let finance: typeof import("../src/server/services/finance");
  let financePeriodClose: typeof import("../src/server/services/financePeriodClose");
  let budgetControl: typeof import("../src/server/services/budgetControl");
  let cashAdvances: typeof import("../src/server/services/cashAdvances");
  let expenseRequests: typeof import("../src/server/services/expenseRequests");
  let pettyCash: typeof import("../src/server/services/pettyCash");
  let attachments: typeof import("../src/server/services/attachments");
  let exportAudit: typeof import("../src/server/services/exportAudit");
  const createdPermissionIds: string[] = [];

  const session = (): SessionContext => ({
    user: {
      id: ids.userId,
      email: `finance-authz-${suffix}@example.test`,
      displayName: `Finance Authorization ${suffix}`,
      role: "Finance authorization fixture",
    },
    context: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      companyName: `Finance Authorization Company ${suffix}`,
      brandId: ids.brandId,
      brandName: `Finance Authorization Brand ${suffix}`,
      locationId: ids.locationId,
      locationName: `Finance Authorization Location ${suffix}`,
      locationType: "BRANCH",
    },
    authorizedLocations: [
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        companyName: `Finance Authorization Company ${suffix}`,
        brandId: ids.brandId,
        brandName: `Finance Authorization Brand ${suffix}`,
        locationId: ids.locationId,
        locationName: `Finance Authorization Location ${suffix}`,
        locationType: "BRANCH",
        scopeAssignmentId: ids.locationScopeId,
        accessLevel: "MANAGE",
      },
    ],
    // This intentionally models a stale browser/session claim. The services must
    // still resolve the active database grants before every protected operation.
    permissionCodes: [...permissionCodes],
  });

  async function mutationSnapshot() {
    const tenantWhere = { tenantId: ids.tenantId };
    const companyWhere = { companyId: ids.companyId };
    const [
      expenseRequests,
      cashAdvances,
      pettyCashFunds,
      pettyCashLedgerEntries,
      budgets,
      budgetRevisions,
      budgetCommitments,
      financeCloseRuns,
      fiscalYears,
      accountingPeriods,
      financeJournals,
      apInvoices,
      supplierCreditNotes,
      paymentRequests,
      paymentReleases,
      branchCashDeposits,
      auditEvents,
      notifications,
    ] = await Promise.all([
      prisma.expenseRequest.count({ where: tenantWhere }),
      prisma.cashAdvanceRequest.count({ where: tenantWhere }),
      prisma.pettyCashFund.count({ where: tenantWhere }),
      prisma.pettyCashLedgerEntry.count({ where: tenantWhere }),
      prisma.budget.count({ where: tenantWhere }),
      prisma.budgetRevision.count({ where: tenantWhere }),
      prisma.budgetCommitment.count({ where: tenantWhere }),
      prisma.financeCloseRun.count({ where: tenantWhere }),
      prisma.fiscalYear.count({ where: tenantWhere }),
      prisma.accountingPeriod.count({ where: tenantWhere }),
      prisma.financeJournal.count({ where: tenantWhere }),
      prisma.apInvoice.count({ where: tenantWhere }),
      prisma.supplierCreditNote.count({ where: tenantWhere }),
      prisma.paymentRequest.count({ where: tenantWhere }),
      prisma.paymentRelease.count({ where: tenantWhere }),
      prisma.branchCashDeposit.count({ where: tenantWhere }),
      prisma.auditEvent.count({ where: tenantWhere }),
      prisma.notification.count({ where: companyWhere }),
    ]);
    return {
      expenseRequests,
      cashAdvances,
      pettyCashFunds,
      pettyCashLedgerEntries,
      budgets,
      budgetRevisions,
      budgetCommitments,
      financeCloseRuns,
      fiscalYears,
      accountingPeriods,
      financeJournals,
      apInvoices,
      supplierCreditNotes,
      paymentRequests,
      paymentReleases,
      branchCashDeposits,
      auditEvents,
      notifications,
    };
  }

  async function grantFinancePermissions() {
    for (const code of permissionCodes) {
      let permission = await prisma.permission.findUnique({ where: { code } });
      if (!permission) {
        permission = await prisma.permission.create({
          data: {
            code,
            module: "finance",
            action: code.split(".").at(-1) ?? "manage",
          },
        });
        createdPermissionIds.push(permission.id);
      }
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: ids.roleId,
            permissionId: permission.id,
          },
        },
        create: { roleId: ids.roleId, permissionId: permission.id },
        update: {},
      });
    }
  }

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    ({ createDraftBudget } =
      await import("../src/server/services/budgetControl"));
    ({ createDraftCashAdvanceRequest } =
      await import("../src/server/services/cashAdvances"));
    ({ createDraftExpenseRequest } =
      await import("../src/server/services/expenseRequests"));
    ({ startPeriodCloseRun } =
      await import("../src/server/services/financePeriodClose"));
    finance = await import("../src/server/services/finance");
    financePeriodClose =
      await import("../src/server/services/financePeriodClose");
    budgetControl = await import("../src/server/services/budgetControl");
    cashAdvances = await import("../src/server/services/cashAdvances");
    expenseRequests = await import("../src/server/services/expenseRequests");
    pettyCash = await import("../src/server/services/pettyCash");
    attachments = await import("../src/server/services/attachments");
    exportAudit = await import("../src/server/services/exportAudit");
    ({ createPettyCashFund } =
      await import("../src/server/services/pettyCash"));

    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }

    await prisma.tenant.create({
      data: {
        id: ids.tenantId,
        name: `Finance Authorization Tenant ${suffix}`,
        loginCode: `finance-authz-${suffix}`,
      },
    });
    await prisma.company.createMany({
      data: [
        {
          id: ids.companyId,
          tenantId: ids.tenantId,
          code: `FIN-AUTH-${suffix}`,
          legalName: `Finance Authorization Company ${suffix}`,
          currencyCode: "PHP",
        },
        {
          id: ids.adjacentCompanyId,
          tenantId: ids.tenantId,
          code: `FIN-AUTH-ADJ-${suffix}`,
          legalName: `Adjacent Finance Authorization Company ${suffix}`,
          currencyCode: "PHP",
        },
      ],
    });
    await prisma.brand.create({
      data: {
        id: ids.brandId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        code: `FIN-AUTH-${suffix}`,
        name: `Finance Authorization Brand ${suffix}`,
      },
    });
    await prisma.location.createMany({
      data: [
        {
          id: ids.locationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          brandId: ids.brandId,
          locationType: "BRANCH",
          code: `FIN-AUTH-${suffix}`,
          name: `Finance Authorization Location ${suffix}`,
        },
        {
          id: ids.adjacentLocationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          brandId: ids.brandId,
          locationType: "BRANCH",
          code: `FIN-AUTH-ADJ-${suffix}`,
          name: `Adjacent Finance Authorization Location ${suffix}`,
        },
      ],
    });
    await prisma.department.create({
      data: {
        id: ids.adjacentDepartmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        code: `FIN-AUTH-ADJ-${suffix}`,
        name: `Adjacent Finance Authorization Department ${suffix}`,
      },
    });
    await prisma.user.create({
      data: {
        id: ids.userId,
        tenantId: ids.tenantId,
        email: `finance-authz-${suffix}@example.test`,
        displayName: `Finance Authorization ${suffix}`,
      },
    });
    await prisma.user.create({
      data: {
        id: ids.projectOwnerUserId,
        tenantId: ids.tenantId,
        email: `finance-project-owner-${suffix}@example.test`,
        displayName: `Finance Project Owner ${suffix}`,
      },
    });
    await prisma.role.create({
      data: {
        id: ids.roleId,
        tenantId: ids.tenantId,
        code: `FINANCE_AUTHORIZATION_${suffix}`,
        name: `Finance Authorization ${suffix}`,
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        id: ids.roleAssignmentId,
        userId: ids.userId,
        roleId: ids.roleId,
      },
    });
    await prisma.userScopeAssignment.create({
      data: {
        id: ids.locationScopeId,
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "MANAGE",
      },
    });
    await prisma.fiscalYear.create({
      data: {
        id: ids.fiscalYearId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        code: `FY-${suffix}`,
        name: `Finance Authorization FY ${suffix}`,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        status: "OPEN",
      },
    });
    await prisma.accountingPeriod.create({
      data: {
        id: ids.accountingPeriodId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        fiscalYearId: ids.fiscalYearId,
        periodNumber: 1,
        code: `P01-${suffix}`,
        name: `Finance Authorization Period ${suffix}`,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        status: "OPEN",
      },
    });
    await prisma.financeAccountClass.create({
      data: {
        id: ids.accountClassId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        code: `AUTH-${suffix}`,
        name: `Finance Authorization Account Class ${suffix}`,
        normalBalance: "DEBIT",
        statementSection: "BALANCE_SHEET",
      },
    });
    await prisma.chartOfAccount.create({
      data: {
        id: ids.accountId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountClassId: ids.accountClassId,
        code: `AUTH-${suffix}`,
        name: `Finance Authorization Account ${suffix}`,
        normalBalance: "DEBIT",
        postingAllowed: true,
      },
    });
    await prisma.project.create({
      data: {
        id: ids.adjacentProjectId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        code: `AUTH-PROJECT-${suffix}`,
        name: `Adjacent Finance Authorization Project ${suffix}`,
        projectType: "IMPLEMENTATION",
        locationId: ids.adjacentLocationId,
        sponsorUserId: ids.projectOwnerUserId,
        managerUserId: ids.projectOwnerUserId,
        createdByUserId: ids.userId,
        updatedByUserId: ids.userId,
      },
    });
    await prisma.budget.create({
      data: {
        id: ids.selfBudgetId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `SELF-BUDGET-${suffix}`,
        fiscalYearId: ids.fiscalYearId,
        name: `Self approval budget ${suffix}`,
        status: "UNDER_REVIEW",
        brandId: ids.brandId,
        locationId: ids.locationId,
        ownerUserId: ids.userId,
        createdByUserId: ids.userId,
        submittedByUserId: ids.userId,
        submittedAt: new Date("2026-07-21T00:00:00.000Z"),
      },
    });
    await prisma.expenseRequest.create({
      data: {
        id: ids.selfExpenseRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `SELF-EXP-${suffix}`,
        status: "AWAITING_APPROVAL",
        requestDate: new Date("2026-07-21T00:00:00.000Z"),
        title: `Self approval expense ${suffix}`,
        requestReason: "Authorization self-approval fixture",
        categoryCode: "OPERATIONS",
        locationId: ids.locationId,
        requestedByUserId: ids.userId,
        submittedByUserId: ids.userId,
        submittedAt: new Date("2026-07-21T00:00:00.000Z"),
      },
    });
    await prisma.cashAdvanceRequest.create({
      data: {
        id: ids.selfCashAdvanceId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `SELF-CA-${suffix}`,
        requestedAmountPhp: 100,
        status: "AWAITING_APPROVAL",
        requestDate: new Date("2026-07-21T00:00:00.000Z"),
        title: `Self approval cash advance ${suffix}`,
        purpose: "Authorization self-approval fixture",
        categoryCode: "OPERATIONS",
        locationId: ids.locationId,
        requestedByUserId: ids.userId,
        submittedByUserId: ids.userId,
        submittedAt: new Date("2026-07-21T00:00:00.000Z"),
      },
    });
    await prisma.pettyCashFund.create({
      data: {
        id: ids.selfPettyCashFundId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `SELF-PCF-${suffix}`,
        code: `SELF-PCF-${suffix}`,
        name: `Self approval petty cash fund ${suffix}`,
        status: "ACTIVE",
        activatedAt: new Date("2026-07-21T00:00:00.000Z"),
        locationId: ids.locationId,
        custodianUserId: ids.userId,
        createdByUserId: ids.userId,
      },
    });
    await prisma.pettyCashRequest.create({
      data: {
        id: ids.selfPettyCashRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        pettyCashFundId: ids.selfPettyCashFundId,
        publicReference: `SELF-PCR-${suffix}`,
        requestType: "DISBURSEMENT",
        status: "AWAITING_APPROVAL",
        requestedAmountPhp: 100,
        purpose: "Authorization self-approval fixture",
        justification: "Authorization self-approval fixture",
        requestedByUserId: ids.userId,
        submittedByUserId: ids.userId,
        submittedAt: new Date("2026-07-21T00:00:00.000Z"),
        locationId: ids.locationId,
      },
    });
    await prisma.authSession.create({
      data: {
        id: ids.authSessionId,
        tenantId: ids.tenantId,
        userId: ids.userId,
        tokenHash: authenticationSessionTokenHash(authSessionToken),
        status: "ACTIVE",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 2 * 60 * 60_000),
      },
    });
    configureAuthenticatedRequest({
      sessionToken: authSessionToken,
      selectedLocationId: ids.locationId,
    });
  });

  afterAll(async () => {
    clearAuthenticatedRequest();
    if (prisma) await prisma.$disconnect();
  });

  it("FIN-AUTHZ-PERM-001 rejects stale client permission claims before finance mutation", async () => {
    const activeSession = session();
    const before = await mutationSnapshot();
    const deniedCalls: Array<() => Promise<unknown>> = [
      () =>
        createDraftExpenseRequest(
          activeSession,
          {} as Parameters<typeof createDraftExpenseRequest>[1],
        ),
      () =>
        createDraftCashAdvanceRequest(
          activeSession,
          {} as Parameters<typeof createDraftCashAdvanceRequest>[1],
        ),
      () =>
        createPettyCashFund(
          activeSession,
          {} as Parameters<typeof createPettyCashFund>[1],
        ),
      () =>
        createDraftBudget(
          activeSession,
          {} as Parameters<typeof createDraftBudget>[1],
        ),
      () =>
        startPeriodCloseRun(
          activeSession,
          {} as Parameters<typeof startPeriodCloseRun>[1],
        ),
      () =>
        finance.createFiscalYearWithMonthlyPeriods(
          activeSession,
          {} as Parameters<
            typeof finance.createFiscalYearWithMonthlyPeriods
          >[1],
        ),
      () => finance.buildFinanceFoundationExportRows(activeSession),
      () => finance.buildBankCashExportRows(activeSession),
      () => financePeriodClose.buildPeriodCloseExportRows(activeSession),
      () => budgetControl.getBudgetControlDashboard(activeSession),
      () => cashAdvances.getCashAdvanceDashboard(activeSession),
      () => expenseRequests.getExpenseRequestDashboard(activeSession),
      () => finance.getFinanceFoundationDashboard(activeSession),
      () => pettyCash.getPettyCashDashboard(activeSession),
      () => budgetControl.approveBudget(activeSession, {} as never),
      () => budgetControl.approveBudgetRevision(activeSession, {} as never),
      () => budgetControl.archiveBudget(activeSession, {} as never),
      () => budgetControl.cancelBudget(activeSession, {} as never),
      () => budgetControl.cancelBudgetRevision(activeSession, {} as never),
      () => budgetControl.closeBudget(activeSession, {} as never),
      () => budgetControl.createDraftBudgetRevision(activeSession, {} as never),
      () => budgetControl.rejectBudget(activeSession, {} as never),
      () => budgetControl.rejectBudgetRevision(activeSession, {} as never),
      () =>
        budgetControl.reverseBudgetCommitmentFromSourceEvent(
          activeSession,
          {} as never,
        ),
      () => budgetControl.submitBudgetForReview(activeSession, {} as never),
      () =>
        budgetControl.submitBudgetRevisionForReview(activeSession, {} as never),
      () =>
        cashAdvances.approveCashAdvanceLiquidation(activeSession, {} as never),
      () => cashAdvances.approveCashAdvanceRequest(activeSession, {} as never),
      () =>
        cashAdvances.cancelCashAdvanceLiquidation(activeSession, {} as never),
      () => cashAdvances.cancelCashAdvanceRequest(activeSession, {} as never),
      () =>
        cashAdvances.closeCashAdvanceLiquidation(activeSession, {} as never),
      () => cashAdvances.closeCashAdvanceRequest(activeSession, {} as never),
      () =>
        cashAdvances.createCashAdvanceDisbursementHandoff(
          activeSession,
          {} as never,
        ),
      () => cashAdvances.issueCashAdvanceOffline(activeSession, {} as never),
      () =>
        cashAdvances.rejectCashAdvanceLiquidation(activeSession, {} as never),
      () => cashAdvances.rejectCashAdvanceRequest(activeSession, {} as never),
      () =>
        cashAdvances.reverseCashAdvanceLiquidation(activeSession, {} as never),
      () =>
        cashAdvances.submitCashAdvanceForApproval(activeSession, {} as never),
      () =>
        cashAdvances.submitCashAdvanceLiquidation(activeSession, {} as never),
      () =>
        cashAdvances.voidCashAdvanceOfflineIssue(activeSession, {} as never),
      () => expenseRequests.approveExpenseRequest(activeSession, {} as never),
      () => expenseRequests.cancelExpenseRequest(activeSession, {} as never),
      () => expenseRequests.completeExpenseRequest(activeSession, {} as never),
      () =>
        expenseRequests.createExpenseRequestApInvoiceDraft(
          activeSession,
          {} as never,
        ),
      () => expenseRequests.rejectExpenseRequest(activeSession, {} as never),
      () =>
        expenseRequests.submitExpenseRequestForApproval(
          activeSession,
          {} as never,
        ),
      () => pettyCash.approvePettyCashLiquidation(activeSession, {} as never),
      () => pettyCash.approvePettyCashRequest(activeSession, {} as never),
      () => pettyCash.cancelPettyCashLiquidation(activeSession, {} as never),
      () => pettyCash.cancelPettyCashRequest(activeSession, {} as never),
      () => pettyCash.closePettyCashLiquidation(activeSession, {} as never),
      () => pettyCash.closePettyCashRequest(activeSession, {} as never),
      () =>
        pettyCash.createPettyCashDisbursementHandoff(
          activeSession,
          {} as never,
        ),
      () => pettyCash.createPettyCashRequest(activeSession, {} as never),
      () => pettyCash.rejectPettyCashLiquidation(activeSession, {} as never),
      () => pettyCash.rejectPettyCashRequest(activeSession, {} as never),
      () => pettyCash.reversePettyCashLiquidation(activeSession, {} as never),
      () => pettyCash.submitPettyCashLiquidation(activeSession, {} as never),
      () => pettyCash.submitPettyCashRequest(activeSession, {} as never),
      () => pettyCash.voidPettyCashFulfillment(activeSession, {} as never),
      () => financePeriodClose.cancelPeriodCloseRun(activeSession, {} as never),
      () =>
        financePeriodClose.completePeriodCloseRun(activeSession, {} as never),
      () => budgetControl.activateBudget(activeSession, {} as never),
      () => budgetControl.returnBudgetForRevision(activeSession, {} as never),
      () => budgetControl.startBudgetReview(activeSession, {} as never),
      () => budgetControl.startBudgetRevisionReview(activeSession, {} as never),
      () =>
        budgetControl.upsertBudgetCommitmentFromSourceEvent(
          activeSession,
          {} as never,
        ),
      () =>
        cashAdvances.markCashAdvanceLiquidationClosureReady(
          activeSession,
          {} as never,
        ),
      () =>
        cashAdvances.returnCashAdvanceForRevision(activeSession, {} as never),
      () =>
        cashAdvances.returnCashAdvanceLiquidationForRevision(
          activeSession,
          {} as never,
        ),
      () =>
        expenseRequests.markExpenseRequestPaymentHandoffReady(
          activeSession,
          {} as never,
        ),
      () =>
        expenseRequests.returnExpenseRequestForRevision(
          activeSession,
          {} as never,
        ),
      () => pettyCash.activatePettyCashFund(activeSession, {} as never),
      () =>
        pettyCash.fulfillPettyCashRequestOffline(activeSession, {} as never),
      () =>
        pettyCash.returnPettyCashLiquidationForRevision(
          activeSession,
          {} as never,
        ),
      () =>
        pettyCash.returnPettyCashRequestForRevision(activeSession, {} as never),
      () =>
        financePeriodClose.acknowledgePeriodCloseException(
          activeSession,
          {} as never,
        ),
      () =>
        financePeriodClose.calculatePeriodCloseReadiness(
          activeSession,
          {} as never,
        ),
      () =>
        financePeriodClose.lockAccountingPeriodFromCloseRun(
          activeSession,
          {} as never,
        ),
      () =>
        financePeriodClose.recordPeriodCloseChecklistResult(
          activeSession,
          {} as never,
        ),
      () =>
        financePeriodClose.reopenAccountingPeriodFromCloseRun(
          activeSession,
          {} as never,
        ),
      () =>
        financePeriodClose.requestPeriodCloseSensitiveActionApproval(
          activeSession,
          {} as never,
        ),
      () =>
        financePeriodClose.resolvePeriodCloseException(
          activeSession,
          {} as never,
        ),
      () =>
        financePeriodClose.waivePeriodCloseChecklistItem(
          activeSession,
          {} as never,
        ),
      () =>
        financePeriodClose.waivePeriodCloseException(
          activeSession,
          {} as never,
        ),
      () => finance.openFiscalYear(activeSession, {} as never),
      () => finance.openAccountingPeriod(activeSession, {} as never),
    ];

    for (const deniedCall of deniedCalls) {
      await expect(deniedCall()).rejects.toThrow("PERMISSION_DENIED");
    }
    expect(await mutationSnapshot()).toEqual(before);
  });

  it("FIN-AUTHZ-COOKIE-PERM-001 executes cookie-authenticated finance boundaries and denies revoked permissions", async () => {
    const before = await mutationSnapshot();
    const cookieFinanceCalls: Array<() => Promise<unknown>> = [
      () => finance.createApInvoiceDraft({} as never),
      () => finance.submitApInvoiceForMatch({} as never),
      () => finance.cancelApInvoice({} as never),
      () => finance.createSupplierCreditNoteDraft({} as never),
      () => finance.submitSupplierCreditNoteForApplication({} as never),
      () => finance.cancelSupplierCreditNote({} as never),
      () => finance.createPaymentRequestDraft({} as never),
      () => finance.submitPaymentRequest({} as never),
      () => finance.approvePaymentRequest({} as never),
      () => finance.rejectPaymentRequest({} as never),
      () => finance.cancelPaymentRequest({} as never),
      () => finance.createBranchCashDepositDeclaration({} as never),
      () => finance.createPaymentReleaseDraft({} as never),
      () => finance.cancelPaymentRelease({} as never),
      () => finance.createManualJournalDraft({} as never),
      () => finance.submitManualJournal({} as never),
      () => finance.approveManualJournal({} as never),
      () => finance.postApprovedManualJournal({} as never),
      () => finance.reversePostedFinanceJournal({} as never),
      () => finance.evaluateApInvoiceMatch({} as never),
      () => finance.executePaymentRelease({} as never),
      () => finance.handoffPaymentReleaseToReconciliation({} as never),
      () => finance.holdPaymentRelease({} as never),
      () => finance.markPaymentReleaseExecutionFailed({} as never),
      () => finance.matchBranchCashDepositToBankReconciliation({} as never),
      () => finance.matchPaymentReleaseToBankReconciliation({} as never),
      () => finance.recordPaymentReleaseReconciliationOutcome({} as never),
      () => finance.requestPaymentReleaseReversal({} as never),
      () => finance.resumePaymentReleaseFromHold({} as never),
      () => financePeriodClose.approveFinanceCloseRunApproval(new FormData()),
      () => financePeriodClose.rejectFinanceCloseRunApproval(new FormData()),
    ];

    for (const cookieFinanceCall of cookieFinanceCalls) {
      await expect(cookieFinanceCall()).rejects.toThrow("PERMISSION_DENIED");
    }
    expect(await mutationSnapshot()).toEqual(before);
  });

  it("FIN-AUTHZ-EVIDENCE-BOUNDARY-001 executes finance evidence boundaries with live denial and denial-only audit effects", async () => {
    const sourceRecordId = randomUUID();
    await prisma.attachment.create({
      data: {
        id: ids.evidenceAttachmentId,
        tenantId: ids.tenantId,
        storageProvider: "local-private",
        objectKey: `controlled-evidence/${ids.tenantId}/${ids.evidenceAttachmentId}/finance-denial.txt`,
        originalFilename: "finance-denial.txt",
        mimeType: "text/plain",
        sizeBytes: 0,
        checksum:
          "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        uploadedByUserId: ids.userId,
      },
    });
    await prisma.controlledEvidenceAttachment.create({
      data: {
        id: ids.controlledEvidenceAttachmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        sourceType: "EXPENSE_REQUEST",
        sourceRecordId,
        sourceKey: `${sourceRecordId}:HEADER`,
        attachmentId: ids.evidenceAttachmentId,
        createdByUserId: ids.userId,
      },
    });
    const before = await mutationSnapshot();
    const input = {
      sourceType: "EXPENSE_REQUEST" as const,
      sourceRecordId,
      requiredPermissionCode: "finance.expense_request.create",
    };
    const evidenceCalls: Array<() => Promise<unknown>> = [
      () => attachments.listControlledEvidenceAttachments(input),
      () => attachments.linkControlledEvidenceAttachment({ ...input } as never),
      () =>
        attachments.createControlledEvidenceAttachmentMetadataLink({
          ...input,
        } as never),
      () =>
        attachments.createControlledEvidenceAttachmentUploadLink({
          ...input,
        } as never),
    ];
    for (const evidenceCall of evidenceCalls) {
      await expect(evidenceCall()).rejects.toThrow("PERMISSION_DENIED");
    }
    await expect(
      attachments.archiveControlledEvidenceAttachment({
        controlledEvidenceAttachmentId: ids.controlledEvidenceAttachmentId,
        archiveReason: "Live finance permission denial verification",
        requiredPermissionCode: input.requiredPermissionCode,
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE");
    await expect(
      attachments.downloadControlledEvidenceAttachment({
        controlledEvidenceAttachmentId: randomUUID(),
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_ATTACHMENT_LINK_NOT_FOUND");

    const after = await mutationSnapshot();
    expect(after.auditEvents).toBe(
      before.auditEvents + evidenceCalls.length + 2,
    );
    expect({ ...after, auditEvents: before.auditEvents }).toEqual(before);
    expect(
      await prisma.controlledEvidenceAttachment.findUniqueOrThrow({
        where: { id: ids.controlledEvidenceAttachmentId },
      }),
    ).toMatchObject({ status: "ACTIVE", archivedAt: null });
  });

  it("FIN-AUTHZ-EXPORT-AUDIT-001 binds export audit mutation to a guarded finance export caller", async () => {
    await grantFinancePermissions();
    const activeSession = session();
    const before = await mutationSnapshot();
    const rows = await finance.buildFinanceFoundationExportRows(activeSession);
    await exportAudit.logOperationalExportAudit({
      session: activeSession,
      reportId: `finance-authorization-${suffix}`,
      eventType: "report.export_started",
      rowCount: rows.length,
    });
    const after = await mutationSnapshot();
    expect(after.auditEvents).toBe(before.auditEvents + 1);
    expect({ ...after, auditEvents: before.auditEvents }).toEqual(before);
  });

  it("FIN-AUTHZ-TOCTOU-001 serializes budget and journal creation against concurrent authority revocation", async () => {
    await grantFinancePermissions();
    const activeSession = session();
    const requestDate = new Date("2026-07-21T00:00:00.000Z");
    const before = await mutationSnapshot();

    let releaseScopeRevocation!: () => void;
    let scopeRevocationLocked!: () => void;
    const scopeRevocationReady = new Promise<void>((resolve) => {
      scopeRevocationLocked = resolve;
    });
    const scopeRevocationGate = new Promise<void>((resolve) => {
      releaseScopeRevocation = resolve;
    });
    const revokeScope = prisma.$transaction(async (tx) => {
      await tx.userScopeAssignment.update({
        where: { id: ids.locationScopeId },
        data: { status: "INACTIVE" },
      });
      scopeRevocationLocked();
      await scopeRevocationGate;
    });
    await scopeRevocationReady;
    const budgetCreate = createDraftBudget(activeSession, {
      name: `Concurrent revoked budget ${suffix}`,
      fiscalYearId: ids.fiscalYearId,
      locationId: ids.locationId,
      periodStart: requestDate,
      periodEnd: requestDate,
      accountId: ids.accountId,
      lineCode: "TOCTOU-BUDGET",
      lineName: "Concurrent revoked budget line",
      amountPhp: 100,
      reason: "Concurrent authorization revocation verification",
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseScopeRevocation();
    await revokeScope;
    await expect(budgetCreate).rejects.toThrow("SCOPE_DENIED");
    await prisma.userScopeAssignment.update({
      where: { id: ids.locationScopeId },
      data: { status: "ACTIVE" },
    });

    let releaseRoleRevocation!: () => void;
    let roleRevocationLocked!: () => void;
    const roleRevocationReady = new Promise<void>((resolve) => {
      roleRevocationLocked = resolve;
    });
    const roleRevocationGate = new Promise<void>((resolve) => {
      releaseRoleRevocation = resolve;
    });
    const revokeRole = prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.update({
        where: { id: ids.roleAssignmentId },
        data: { status: "INACTIVE" },
      });
      roleRevocationLocked();
      await roleRevocationGate;
    });
    await roleRevocationReady;
    const journalCreate = finance.createManualJournalDraft({
      accountingPeriodId: ids.accountingPeriodId,
      journalDate: requestDate,
      description: "Concurrent revoked journal",
      businessJustification: "Concurrent authorization revocation verification",
      lines: [
        {
          accountId: ids.accountId,
          amountSide: "DEBIT",
          amountPhp: 100,
          lineDescription: "Concurrent revoked debit",
        },
        {
          accountId: ids.accountId,
          amountSide: "CREDIT",
          amountPhp: 100,
          lineDescription: "Concurrent revoked credit",
        },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseRoleRevocation();
    await revokeRole;
    await expect(journalCreate).rejects.toThrow("PERMISSION_DENIED");
    await prisma.userRoleAssignment.update({
      where: { id: ids.roleAssignmentId },
      data: { status: "ACTIVE" },
    });

    expect(await mutationSnapshot()).toEqual(before);
  });

  it("FIN-AUTHZ-PARTIAL-DOWNGRADE-001 rejects stale elevated cancellation claims while retaining base permissions", async () => {
    await grantFinancePermissions();
    const staleSession = session();
    const otherUserId = ids.projectOwnerUserId;
    const supplierId = randomUUID();
    const expenseRequestId = randomUUID();
    const cashAdvanceRequestId = randomUUID();
    const cashAdvanceLiquidationId = randomUUID();
    const pettyCashRequestId = randomUUID();
    const pettyCashLiquidationId = randomUUID();
    const paymentRequestId = randomUUID();
    const date = new Date("2026-07-21T00:00:00.000Z");
    await prisma.supplier.create({
      data: {
        id: supplierId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        supplierCode: `FIN-PARTIAL-${suffix}`,
        legalName: `Finance Partial Downgrade ${suffix}`,
      },
    });
    await prisma.expenseRequest.create({
      data: {
        id: expenseRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `FIN-PARTIAL-EXP-${suffix}`,
        status: "DRAFT",
        requestDate: date,
        title: "Partial downgrade expense",
        requestReason: "Authorization partial-downgrade fixture",
        categoryCode: "OPERATIONS",
        locationId: ids.locationId,
        requestedByUserId: otherUserId,
      },
    });
    await prisma.cashAdvanceRequest.create({
      data: {
        id: cashAdvanceRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `FIN-PARTIAL-CA-${suffix}`,
        requestedAmountPhp: 100,
        status: "DRAFT",
        requestDate: date,
        title: "Partial downgrade cash advance",
        purpose: "Authorization partial-downgrade fixture",
        categoryCode: "OPERATIONS",
        locationId: ids.locationId,
        requestedByUserId: otherUserId,
      },
    });
    await prisma.cashAdvanceLiquidation.create({
      data: {
        id: cashAdvanceLiquidationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.locationId,
        cashAdvanceRequestId,
        publicReference: `FIN-PARTIAL-CAL-${suffix}`,
        status: "DRAFT",
        submittedByUserId: otherUserId,
      },
    });
    await prisma.pettyCashRequest.create({
      data: {
        id: pettyCashRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        pettyCashFundId: ids.selfPettyCashFundId,
        publicReference: `FIN-PARTIAL-PCR-${suffix}`,
        requestType: "DISBURSEMENT",
        status: "DRAFT",
        requestedAmountPhp: 100,
        purpose: "Partial downgrade petty cash",
        justification: "Authorization partial-downgrade fixture",
        requestedByUserId: otherUserId,
        locationId: ids.locationId,
      },
    });
    await prisma.pettyCashLiquidation.create({
      data: {
        id: pettyCashLiquidationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        pettyCashFundId: ids.selfPettyCashFundId,
        publicReference: `FIN-PARTIAL-PCL-${suffix}`,
        cycleStart: date,
        cycleEnd: date,
        status: "DRAFT",
        submittedByUserId: otherUserId,
        locationId: ids.locationId,
      },
    });
    await prisma.paymentRequest.create({
      data: {
        id: paymentRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.locationId,
        supplierId,
        publicReference: `FIN-PARTIAL-PAY-${suffix}`,
        totalRequestedAmount: 100,
        status: "DRAFT",
        requestedByUserId: otherUserId,
        requestReason: "Authorization partial-downgrade fixture",
      },
    });

    const elevatedCodes = [
      "finance.expense_request.approve",
      "finance.cash_advance.approve",
      "finance.cash_advance.review_liquidation",
      "finance.petty_cash.approve",
      "finance.petty_cash.review_liquidation",
      "finance.payment_request.approve",
    ] as const;
    const elevatedPermissions = await prisma.permission.findMany({
      where: { code: { in: [...elevatedCodes] } },
      select: { id: true, code: true },
    });
    const permissionIdByCode = new Map(
      elevatedPermissions.map((permission) => [permission.code, permission.id]),
    );
    const denyWhileRevoked = async (
      permissionCode: (typeof elevatedCodes)[number],
      expectedError: string,
      call: () => Promise<unknown>,
    ) => {
      const permissionId = permissionIdByCode.get(permissionCode);
      if (!permissionId) throw new Error("FINANCE_PERMISSION_FIXTURE_MISSING");
      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: { roleId: ids.roleId, permissionId },
        },
      });
      try {
        await expect(call()).rejects.toThrow(expectedError);
      } finally {
        await prisma.rolePermission.create({
          data: { roleId: ids.roleId, permissionId },
        });
      }
    };
    const auditBefore = await prisma.auditEvent.count({
      where: { tenantId: ids.tenantId },
    });
    try {
      await denyWhileRevoked(
        "finance.expense_request.approve",
        "EXPENSE_REQUEST_CANCEL_PERMISSION_DENIED",
        () =>
          expenseRequests.cancelExpenseRequest(staleSession, {
            expenseRequestId,
            reason: "Revoked elevated permission must deny cancellation.",
          }),
      );
      await denyWhileRevoked(
        "finance.cash_advance.approve",
        "CASH_ADVANCE_CANCEL_PERMISSION_DENIED",
        () =>
          cashAdvances.cancelCashAdvanceRequest(staleSession, {
            cashAdvanceRequestId,
            reason: "Revoked elevated permission must deny cancellation.",
          }),
      );
      await denyWhileRevoked(
        "finance.cash_advance.review_liquidation",
        "CASH_ADVANCE_LIQUIDATION_CANCEL_PERMISSION_DENIED",
        () =>
          cashAdvances.cancelCashAdvanceLiquidation(staleSession, {
            liquidationId: cashAdvanceLiquidationId,
            reason: "Revoked elevated permission must deny cancellation.",
          }),
      );
      await denyWhileRevoked(
        "finance.petty_cash.approve",
        "PETTY_CASH_REQUEST_CANCEL_PERMISSION_DENIED",
        () =>
          pettyCash.cancelPettyCashRequest(staleSession, {
            pettyCashRequestId,
            reason: "Revoked elevated permission must deny cancellation.",
          }),
      );
      await denyWhileRevoked(
        "finance.petty_cash.review_liquidation",
        "PETTY_CASH_LIQUIDATION_CANCEL_PERMISSION_DENIED",
        () =>
          pettyCash.cancelPettyCashLiquidation(staleSession, {
            liquidationId: pettyCashLiquidationId,
            reason: "Revoked elevated permission must deny cancellation.",
          }),
      );
      await denyWhileRevoked(
        "finance.payment_request.approve",
        "PAYMENT_REQUEST_CANCEL_PERMISSION_DENIED",
        () =>
          finance.cancelPaymentRequest({
            paymentRequestId,
            reason: "Revoked elevated permission must deny cancellation.",
          }),
      );

      const [
        expense,
        cashAdvance,
        cashLiquidation,
        pettyRequest,
        pettyLiquidation,
        payment,
      ] = await Promise.all([
        prisma.expenseRequest.findUniqueOrThrow({
          where: { id: expenseRequestId },
        }),
        prisma.cashAdvanceRequest.findUniqueOrThrow({
          where: { id: cashAdvanceRequestId },
        }),
        prisma.cashAdvanceLiquidation.findUniqueOrThrow({
          where: { id: cashAdvanceLiquidationId },
        }),
        prisma.pettyCashRequest.findUniqueOrThrow({
          where: { id: pettyCashRequestId },
        }),
        prisma.pettyCashLiquidation.findUniqueOrThrow({
          where: { id: pettyCashLiquidationId },
        }),
        prisma.paymentRequest.findUniqueOrThrow({
          where: { id: paymentRequestId },
        }),
      ]);
      expect([
        expense.status,
        cashAdvance.status,
        cashLiquidation.status,
        pettyRequest.status,
        pettyLiquidation.status,
        payment.status,
      ]).toEqual(["DRAFT", "DRAFT", "DRAFT", "DRAFT", "DRAFT", "DRAFT"]);
      expect(
        await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
      ).toBe(auditBefore);
    } finally {
      await prisma.paymentRequest.deleteMany({
        where: { id: paymentRequestId },
      });
      await prisma.pettyCashLiquidation.deleteMany({
        where: { id: pettyCashLiquidationId },
      });
      await prisma.pettyCashRequest.deleteMany({
        where: { id: pettyCashRequestId },
      });
      await prisma.cashAdvanceLiquidation.deleteMany({
        where: { id: cashAdvanceLiquidationId },
      });
      await prisma.cashAdvanceRequest.deleteMany({
        where: { id: cashAdvanceRequestId },
      });
      await prisma.expenseRequest.deleteMany({
        where: { id: expenseRequestId },
      });
      await prisma.supplier.deleteMany({ where: { id: supplierId } });
    }
  });

  it("FIN-AUTHZ-SCOPE-001 denies adjacent location, department, and project finance writes without money, workflow, or audit effects", async () => {
    await grantFinancePermissions();
    const activeSession = session();
    const requestDate = new Date("2026-07-21T00:00:00.000Z");
    const before = await mutationSnapshot();
    const scopeDeniedCalls: Array<() => Promise<unknown>> = [
      () =>
        createDraftExpenseRequest(activeSession, {
          title: "Denied adjacent expense",
          requestReason: "Authorization boundary verification",
          urgency: "NORMAL",
          requestDate,
          locationId: ids.adjacentLocationId,
          categoryCode: "OPERATIONS",
          lineDescription: "Denied line",
          lineDate: requestDate,
          requestedAmountPhp: 100,
        }),
      () =>
        createPettyCashFund(activeSession, {
          code: `DENIED-${suffix}`,
          name: "Denied adjacent fund",
          locationId: ids.adjacentLocationId,
          custodianUserId: ids.userId,
          openingBalancePhp: 0,
          targetBalancePhp: 1000,
          lowBalanceAlertPhp: 100,
          evidenceReference: "AUTHORIZATION-TEST-EVIDENCE",
        }),
      () =>
        createDraftBudget(activeSession, {
          name: "Denied adjacent budget",
          fiscalYearId: randomUUID(),
          locationId: ids.adjacentLocationId,
          periodStart: requestDate,
          periodEnd: requestDate,
          accountId: randomUUID(),
          lineCode: "DENIED",
          lineName: "Denied line",
          amountPhp: 100,
          reason: "Authorization boundary verification",
        }),
      () =>
        createDraftBudget(activeSession, {
          name: "Denied adjacent department budget",
          fiscalYearId: randomUUID(),
          locationId: ids.locationId,
          departmentId: ids.adjacentDepartmentId,
          periodStart: requestDate,
          periodEnd: requestDate,
          accountId: randomUUID(),
          lineCode: "DENIED-DEPT",
          lineName: "Denied department line",
          amountPhp: 100,
          reason: "Authorization boundary verification",
        }),
      () =>
        createDraftCashAdvanceRequest(
          {
            ...activeSession,
            context: {
              ...activeSession.context,
              locationId: ids.adjacentLocationId,
              locationName: "Adjacent Finance Authorization Location",
            },
          },
          {
            title: "Denied adjacent cash advance",
            purpose: "Authorization boundary verification",
            categoryCode: "OPERATIONS",
            requestedAmountPhp: 100,
            requestDate,
          },
        ),
      () =>
        finance.createManualJournalDraft({
          accountingPeriodId: ids.accountingPeriodId,
          journalDate: requestDate,
          description: "Denied adjacent project journal",
          businessJustification: "Authorization boundary verification",
          lines: [
            {
              accountId: ids.accountId,
              amountSide: "DEBIT",
              amountPhp: 100,
              lineDescription: "Denied debit",
              projectId: ids.adjacentProjectId,
            },
            {
              accountId: ids.accountId,
              amountSide: "CREDIT",
              amountPhp: 100,
              lineDescription: "Denied credit",
              projectId: ids.adjacentProjectId,
            },
          ],
        }),
    ];

    for (const scopeDeniedCall of scopeDeniedCalls) {
      await expect(scopeDeniedCall()).rejects.toThrow("SCOPE_DENIED");
    }
    expect(await mutationSnapshot()).toEqual(before);
  });

  it("FIN-AUTHZ-RECORD-001 executes every finance lifecycle boundary with a foreign record id and no mutation", async () => {
    await grantFinancePermissions();
    const activeSession = session();
    const foreignId = randomUUID();
    const action = {
      budgetId: foreignId,
      budgetRevisionId: foreignId,
      cashAdvanceRequestId: foreignId,
      liquidationId: foreignId,
      expenseRequestId: foreignId,
      pettyCashFundId: foreignId,
      pettyCashRequestId: foreignId,
      financeCloseRunId: foreignId,
      apInvoiceId: foreignId,
      supplierCreditNoteId: foreignId,
      paymentRequestId: foreignId,
      paymentReleaseId: foreignId,
      journalId: foreignId,
      reason: "Authorization foreign-record verification",
      evidenceReference: "AUTHORIZATION-EVIDENCE",
      idempotencyKey: `foreign-${suffix}`,
      amountPhp: 100,
      approvedAmountPhp: 100,
      amountReturnedPhp: 0,
      shortageAmountPhp: 0,
      overageAmountPhp: 0,
      lines: [],
    };
    const calls: Array<() => Promise<unknown>> = [
      () => budgetControl.approveBudget(activeSession, action),
      () => budgetControl.approveBudgetRevision(activeSession, action),
      () => budgetControl.archiveBudget(activeSession, action),
      () => budgetControl.cancelBudget(activeSession, action),
      () => budgetControl.cancelBudgetRevision(activeSession, action),
      () => budgetControl.closeBudget(activeSession, action),
      () =>
        budgetControl.createDraftBudgetRevision(activeSession, action as never),
      () => budgetControl.rejectBudget(activeSession, action),
      () => budgetControl.rejectBudgetRevision(activeSession, action),
      () => budgetControl.submitBudgetForReview(activeSession, action),
      () => budgetControl.submitBudgetRevisionForReview(activeSession, action),
      () =>
        budgetControl.reverseBudgetCommitmentFromSourceEvent(activeSession, {
          sourceType: "EXPENSE_REQUEST",
          sourceId: foreignId,
          sourceEventKey: `source-${suffix}`,
          reversalEventKey: `reversal-${suffix}`,
          reason: action.reason,
        }),
      () =>
        prisma.$transaction((tx) =>
          budgetControl
            .reverseBudgetCommitmentFromApprovedSourceEvent(tx, activeSession, {
              sourceType: "EXPENSE_REQUEST",
              sourceId: foreignId,
              sourceEventKey: `internal-source-${suffix}`,
              reversalEventKey: `internal-reversal-${suffix}`,
              reason: action.reason,
            })
            .then((result) => {
              if (result !== null) {
                throw new Error("INTERNAL_REVERSAL_EXPECTED_NULL");
              }
              throw new Error("EXPECTED_INTERNAL_PRECONDITION_NOOP");
            }),
        ),
      () => cashAdvances.approveCashAdvanceLiquidation(activeSession, action),
      () => cashAdvances.approveCashAdvanceRequest(activeSession, action),
      () => cashAdvances.cancelCashAdvanceLiquidation(activeSession, action),
      () => cashAdvances.cancelCashAdvanceRequest(activeSession, action),
      () => cashAdvances.closeCashAdvanceLiquidation(activeSession, action),
      () => cashAdvances.closeCashAdvanceRequest(activeSession, action),
      () =>
        cashAdvances.createCashAdvanceDisbursementHandoff(
          activeSession,
          action,
        ),
      () => cashAdvances.issueCashAdvanceOffline(activeSession, action),
      () => cashAdvances.rejectCashAdvanceLiquidation(activeSession, action),
      () => cashAdvances.rejectCashAdvanceRequest(activeSession, action),
      () => cashAdvances.reverseCashAdvanceLiquidation(activeSession, action),
      () => cashAdvances.submitCashAdvanceForApproval(activeSession, action),
      () =>
        cashAdvances.submitCashAdvanceLiquidation(activeSession, {
          ...action,
          evidenceReference: action.evidenceReference,
          lines: [],
        }),
      () => cashAdvances.voidCashAdvanceOfflineIssue(activeSession, action),
      () => expenseRequests.approveExpenseRequest(activeSession, action),
      () => expenseRequests.cancelExpenseRequest(activeSession, action),
      () => expenseRequests.completeExpenseRequest(activeSession, action),
      () =>
        expenseRequests.createExpenseRequestApInvoiceDraft(
          activeSession,
          action,
        ),
      () => expenseRequests.rejectExpenseRequest(activeSession, action),
      () =>
        expenseRequests.submitExpenseRequestForApproval(activeSession, action),
      () => pettyCash.approvePettyCashLiquidation(activeSession, action),
      () => pettyCash.approvePettyCashRequest(activeSession, action),
      () => pettyCash.cancelPettyCashLiquidation(activeSession, action),
      () => pettyCash.cancelPettyCashRequest(activeSession, action),
      () => pettyCash.closePettyCashLiquidation(activeSession, action),
      () => pettyCash.closePettyCashRequest(activeSession, action),
      () => pettyCash.createPettyCashDisbursementHandoff(activeSession, action),
      () => pettyCash.createPettyCashRequest(activeSession, action as never),
      () => pettyCash.rejectPettyCashLiquidation(activeSession, action),
      () => pettyCash.rejectPettyCashRequest(activeSession, action),
      () => pettyCash.reversePettyCashLiquidation(activeSession, action),
      () =>
        pettyCash.submitPettyCashLiquidation(activeSession, action as never),
      () => pettyCash.submitPettyCashRequest(activeSession, action),
      () => pettyCash.voidPettyCashFulfillment(activeSession, action),
      () => financePeriodClose.cancelPeriodCloseRun(activeSession, action),
      () => financePeriodClose.completePeriodCloseRun(activeSession, action),
      () => finance.cancelApInvoice(action as never),
      () => finance.cancelPaymentRelease(action as never),
      () => finance.cancelPaymentRequest(action as never),
      () => finance.cancelSupplierCreditNote(action as never),
      () => finance.submitApInvoiceForMatch(action as never),
      () => finance.submitManualJournal(action as never),
      () => finance.approveManualJournal(action as never),
      () => finance.postApprovedManualJournal(action as never),
      () => finance.reversePostedFinanceJournal(action as never),
      () => finance.submitPaymentRequest(action as never),
      () => finance.approvePaymentRequest(action as never),
      () => finance.rejectPaymentRequest(action as never),
      () => finance.submitSupplierCreditNoteForApplication(action as never),
      () => budgetControl.activateBudget(activeSession, action),
      () => budgetControl.returnBudgetForRevision(activeSession, action),
      () => budgetControl.startBudgetReview(activeSession, action),
      () => budgetControl.startBudgetRevisionReview(activeSession, action),
      () =>
        budgetControl.upsertBudgetCommitmentFromSourceEvent(activeSession, {
          budgetLineId: foreignId,
          sourceType: "EXPENSE_REQUEST",
          sourceId: foreignId,
          sourceEventKey: `upsert-source-${suffix}`,
          sourceEventAt: new Date("2026-07-21T00:00:00.000Z"),
          sourceReference: `FOREIGN-${suffix}`,
          sourceSummary: "Authorization foreign-record verification",
          committedAmountPhp: 100,
        }),
      () =>
        cashAdvances.markCashAdvanceLiquidationClosureReady(
          activeSession,
          action,
        ),
      () => cashAdvances.returnCashAdvanceForRevision(activeSession, action),
      () =>
        cashAdvances.returnCashAdvanceLiquidationForRevision(
          activeSession,
          action,
        ),
      () =>
        expenseRequests.markExpenseRequestPaymentHandoffReady(
          activeSession,
          action,
        ),
      () =>
        expenseRequests.returnExpenseRequestForRevision(activeSession, action),
      () => pettyCash.activatePettyCashFund(activeSession, action),
      () => pettyCash.fulfillPettyCashRequestOffline(activeSession, action),
      () =>
        pettyCash.returnPettyCashLiquidationForRevision(activeSession, action),
      () => pettyCash.returnPettyCashRequestForRevision(activeSession, action),
      () =>
        financePeriodClose.acknowledgePeriodCloseException(activeSession, {
          ...action,
          exceptionId: foreignId,
        } as never),
      () =>
        financePeriodClose.calculatePeriodCloseReadiness(activeSession, action),
      () =>
        financePeriodClose.lockAccountingPeriodFromCloseRun(
          activeSession,
          action,
        ),
      () =>
        financePeriodClose.recordPeriodCloseChecklistResult(activeSession, {
          ...action,
          checklistItemId: foreignId,
          status: "PASS",
        } as never),
      () =>
        financePeriodClose.reopenAccountingPeriodFromCloseRun(
          activeSession,
          action,
        ),
      () =>
        financePeriodClose.requestPeriodCloseSensitiveActionApproval(
          activeSession,
          { ...action, approvalAction: "LOCK_PERIOD" } as never,
        ),
      () =>
        financePeriodClose.resolvePeriodCloseException(activeSession, {
          ...action,
          exceptionId: foreignId,
        } as never),
      () =>
        financePeriodClose.waivePeriodCloseChecklistItem(activeSession, {
          ...action,
          checklistItemId: foreignId,
        } as never),
      () =>
        financePeriodClose.waivePeriodCloseException(activeSession, {
          ...action,
          exceptionId: foreignId,
        } as never),
      () =>
        finance.openFiscalYear(activeSession, {
          fiscalYearId: foreignId,
          reason: action.reason,
        }),
      () =>
        finance.openAccountingPeriod(activeSession, {
          accountingPeriodId: foreignId,
          reason: action.reason,
        }),
      () => finance.evaluateApInvoiceMatch(action as never),
      () => finance.executePaymentRelease(action as never),
      () => finance.handoffPaymentReleaseToReconciliation(action as never),
      () => finance.holdPaymentRelease(action as never),
      () => finance.markPaymentReleaseExecutionFailed(action as never),
      () => finance.matchBranchCashDepositToBankReconciliation(action as never),
      () => finance.matchPaymentReleaseToBankReconciliation(action as never),
      () => finance.recordPaymentReleaseReconciliationOutcome(action as never),
      () => finance.requestPaymentReleaseReversal(action as never),
      () => finance.resumePaymentReleaseFromHold(action as never),
    ];
    const before = await mutationSnapshot();
    for (const call of calls) {
      await expect(call()).rejects.toBeInstanceOf(Error);
    }
    const approveForm = new FormData();
    approveForm.set("approvalInstanceId", foreignId);
    await expect(
      financePeriodClose.approveFinanceCloseRunApproval(approveForm),
    ).rejects.toBeInstanceOf(Error);
    const rejectForm = new FormData();
    rejectForm.set("approvalInstanceId", foreignId);
    rejectForm.set("remarks", "Authorization foreign-record verification");
    await expect(
      financePeriodClose.rejectFinanceCloseRunApproval(rejectForm),
    ).rejects.toBeInstanceOf(Error);
    expect(await mutationSnapshot()).toEqual(before);
  });

  it("FIN-AUTHZ-SOD-001 blocks self-approval across budget, expense, cash advance, and petty cash domains", async () => {
    await grantFinancePermissions();
    const activeSession = session();
    const before = await mutationSnapshot();
    await expect(
      budgetControl.approveBudget(activeSession, {
        budgetId: ids.selfBudgetId,
        reason: "Authorization self-approval verification",
      }),
    ).rejects.toThrow("BUDGET_SELF_APPROVAL_BLOCKED");
    await expect(
      expenseRequests.approveExpenseRequest(activeSession, {
        expenseRequestId: ids.selfExpenseRequestId,
      }),
    ).rejects.toThrow("EXPENSE_REQUEST_SELF_APPROVAL_BLOCKED");
    await expect(
      cashAdvances.approveCashAdvanceRequest(activeSession, {
        cashAdvanceRequestId: ids.selfCashAdvanceId,
      }),
    ).rejects.toThrow("CASH_ADVANCE_SELF_APPROVAL_BLOCKED");
    await expect(
      pettyCash.approvePettyCashRequest(activeSession, {
        pettyCashRequestId: ids.selfPettyCashRequestId,
      }),
    ).rejects.toThrow("PETTY_CASH_REQUEST_SELF_APPROVAL_BLOCKED");
    expect(await mutationSnapshot()).toEqual(before);
  });

  it("FIN-AUTHZ-STATE-001 rejects invalid finance lifecycle and accounting-period states without side effects", async () => {
    await grantFinancePermissions();
    const activeSession = session();
    const before = await mutationSnapshot();
    await Promise.all([
      prisma.budget.update({
        where: { id: ids.selfBudgetId },
        data: { status: "DRAFT" },
      }),
      prisma.expenseRequest.update({
        where: { id: ids.selfExpenseRequestId },
        data: { status: "DRAFT", submittedAt: null, submittedByUserId: null },
      }),
      prisma.cashAdvanceRequest.update({
        where: { id: ids.selfCashAdvanceId },
        data: { status: "DRAFT", submittedAt: null, submittedByUserId: null },
      }),
      prisma.pettyCashRequest.update({
        where: { id: ids.selfPettyCashRequestId },
        data: { status: "DRAFT", submittedAt: null, submittedByUserId: null },
      }),
      prisma.accountingPeriod.update({
        where: { id: ids.accountingPeriodId },
        data: { status: "FUTURE" },
      }),
    ]);

    await expect(
      budgetControl.approveBudget(activeSession, {
        budgetId: ids.selfBudgetId,
      }),
    ).rejects.toThrow("BUDGET_INVALID_STATUS_TRANSITION");
    await expect(
      expenseRequests.approveExpenseRequest(activeSession, {
        expenseRequestId: ids.selfExpenseRequestId,
      }),
    ).rejects.toThrow("EXPENSE_REQUEST_INVALID_STATUS_TRANSITION");
    await expect(
      cashAdvances.approveCashAdvanceRequest(activeSession, {
        cashAdvanceRequestId: ids.selfCashAdvanceId,
      }),
    ).rejects.toThrow("CASH_ADVANCE_INVALID_STATUS_TRANSITION");
    await expect(
      pettyCash.approvePettyCashRequest(activeSession, {
        pettyCashRequestId: ids.selfPettyCashRequestId,
      }),
    ).rejects.toThrow("PETTY_CASH_REQUEST_INVALID_STATUS_TRANSITION");
    await expect(
      startPeriodCloseRun(activeSession, {
        accountingPeriodId: ids.accountingPeriodId,
        reason: "Authorization invalid period verification",
      }),
    ).rejects.toThrow("PERIOD_CLOSE_ACCOUNTING_PERIOD_NOT_OPEN");

    await Promise.all([
      prisma.budget.update({
        where: { id: ids.selfBudgetId },
        data: { status: "UNDER_REVIEW" },
      }),
      prisma.expenseRequest.update({
        where: { id: ids.selfExpenseRequestId },
        data: {
          status: "AWAITING_APPROVAL",
          submittedAt: new Date("2026-07-21T00:00:00.000Z"),
          submittedByUserId: ids.userId,
        },
      }),
      prisma.cashAdvanceRequest.update({
        where: { id: ids.selfCashAdvanceId },
        data: {
          status: "AWAITING_APPROVAL",
          submittedAt: new Date("2026-07-21T00:00:00.000Z"),
          submittedByUserId: ids.userId,
        },
      }),
      prisma.pettyCashRequest.update({
        where: { id: ids.selfPettyCashRequestId },
        data: {
          status: "AWAITING_APPROVAL",
          submittedAt: new Date("2026-07-21T00:00:00.000Z"),
          submittedByUserId: ids.userId,
        },
      }),
      prisma.accountingPeriod.update({
        where: { id: ids.accountingPeriodId },
        data: { status: "OPEN" },
      }),
    ]);
    expect(await mutationSnapshot()).toEqual(before);
  });

  it("FIN-AUTHZ-COMPANY-001 rejects an adjacent-company accounting period before close workflow mutation", async () => {
    await grantFinancePermissions();
    await prisma.fiscalYear.create({
      data: {
        id: ids.adjacentFiscalYearId,
        tenantId: ids.tenantId,
        companyId: ids.adjacentCompanyId,
        code: `ADJ-FY-${suffix}`,
        name: `Adjacent FY ${suffix}`,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        status: "OPEN",
      },
    });
    await prisma.accountingPeriod.create({
      data: {
        id: ids.adjacentPeriodId,
        tenantId: ids.tenantId,
        companyId: ids.adjacentCompanyId,
        fiscalYearId: ids.adjacentFiscalYearId,
        periodNumber: 1,
        code: `ADJ-P01-${suffix}`,
        name: `Adjacent Period ${suffix}`,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-01-31T00:00:00.000Z"),
        status: "OPEN",
      },
    });
    const before = await mutationSnapshot();

    await expect(
      startPeriodCloseRun(session(), {
        accountingPeriodId: ids.adjacentPeriodId,
        runType: "READINESS",
        reason: "Authorization boundary verification",
      }),
    ).rejects.toThrow("PERIOD_CLOSE_ACCOUNTING_PERIOD_NOT_OPEN");

    expect(await mutationSnapshot()).toEqual(before);
  });
});
