import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

function serviceSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

function exportedFunction(source: string, functionName: string) {
  const start = source.indexOf(`export async function ${functionName}`);
  expect(start, `${functionName} exists`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

const cases = [
  {
    fileName: "budgetControl.ts",
    functionName: "submitBudgetRevisionForReview",
    permission: "permissions.financeBudgetApprove",
    transition: "tx.budgetRevision.update",
    dueAt: "revision.effectiveFrom ?? null",
    source: 'source: "budget_revision.submit"'
  },
  {
    fileName: "expenseRequests.ts",
    functionName: "submitExpenseRequestForApproval",
    permission: "permissions.financeExpenseRequestApprove",
    transition: "tx.expenseRequest.update",
    dueAt: "request.requiredByDate ?? null",
    source: 'source: "expense_request.submit"'
  },
  {
    fileName: "cashAdvances.ts",
    functionName: "submitCashAdvanceForApproval",
    permission: "permissions.financeCashAdvanceApprove",
    transition: "tx.cashAdvanceRequest.update",
    dueAt: "request.dueDate ?? null",
    source: 'source: "cash_advance.submit"'
  },
  {
    fileName: "pettyCash.ts",
    functionName: "submitPettyCashRequest",
    permission: "permissions.financePettyCashApprove",
    transition: "tx.pettyCashRequest.update",
    dueAt: "request.dueBy ?? null",
    source: 'source: "petty_cash_request.submit"'
  },
  {
    fileName: "finance.ts",
    functionName: "submitPaymentRequest",
    permission: "permissions.financePaymentRequestApprove",
    transition: "tx.paymentRequest.update",
    dueAt: "dueAt: null",
    source: 'source: "payment_request.submit"'
  },
  {
    fileName: "finance.ts",
    functionName: "createPaymentReleaseDraft",
    permission: "permissions.financePaymentRelease",
    transition: "tx.paymentRelease.create",
    dueAt: "input.scheduledAt ?? null",
    source: 'source: "payment_release.submit"'
  },
  {
    fileName: "financePeriodClose.ts",
    functionName: "requestPeriodCloseSensitiveActionApproval",
    permission: "permissions.financePeriodCloseManage",
    transition: "tx.financeCloseRun.update",
    dueAt: "dueAt: null",
    source: 'source: "finance_close.sensitive_action_request"'
  }
] as const;

describe("finance approval routing creation contracts", () => {
  for (const contract of cases) {
    test(`${contract.functionName} configures every step before source activation`, () => {
      const source = exportedFunction(
        serviceSource(contract.fileName),
        contract.functionName
      );
      const configureAt = source.indexOf("configureApprovalStepRouting(tx");
      const eligibilityAt = source.indexOf("assertAnyEligibleApprovalActorForStep(tx");
      const transitionAt = source.indexOf(contract.transition);

      expect(source).toContain("approvalInstanceStepId: randomUUID()");
      expect(source).toContain("create: routedSteps.map");
      expect(source).toContain("id: step.approvalInstanceStepId");
      expect(source).toContain("for (const step of routedSteps)");
      expect(source).toContain(contract.permission);
      expect(source).toContain(contract.dueAt);
      expect(source).toContain(contract.source);
      expect(source).toContain("actorUserId: session.user.id");
      expect(configureAt).toBeGreaterThanOrEqual(0);
      expect(eligibilityAt).toBeGreaterThan(configureAt);
      expect(transitionAt).toBeGreaterThan(eligibilityAt);
    });
  }

  test("budget routing requires every distinct location or company scope", () => {
    const source = exportedFunction(
      serviceSource("budgetControl.ts"),
      "submitBudgetRevisionForReview"
    );
    expect(source).toContain("new Set([");
    expect(source).toContain('targetMatchMode: locationIds.length > 0 ? "ALL" : "ANY"');
    expect(source).toContain('scopeType: "LOCATION" as const');
    expect(source).toContain('scopeType: "COMPANY" as const');
  });

  test("cash advance and payment release preserve extended segregation", () => {
    const cash = exportedFunction(
      serviceSource("cashAdvances.ts"),
      "submitCashAdvanceForApproval"
    );
    const release = exportedFunction(
      serviceSource("finance.ts"),
      "createPaymentReleaseDraft"
    );
    expect(cash).toContain("request.beneficiaryUserId");
    expect(cash).toContain('reasonCode: "BENEFICIARY"');
    expect(release).toContain("request.approvedByUserId");
    expect(release).toContain('reasonCode: "PRIOR_APPROVER"');
    expect(release).toContain('reasonCode: "PREPARER"');
  });

  test("initial notifications are direct-user only and close advance is centralized", () => {
    for (const fileName of [
      "budgetControl.ts",
      "cashAdvances.ts",
      "expenseRequests.ts",
      "pettyCash.ts",
      "finance.ts"
    ]) {
      const source = serviceSource(fileName);
      expect(source).not.toContain("resolveScopedNotificationRecipients");
    }
    const close = exportedFunction(
      serviceSource("financePeriodClose.ts"),
      "approveFinanceCloseRunApproval"
    );
    expect(close).toContain("activateApprovalStepWithEligibility(tx");
    expect(close).not.toContain('data: { status: "PENDING" }');
    expect(close).toContain('source: "finance_close.approval_step_advance"');
  });
});
