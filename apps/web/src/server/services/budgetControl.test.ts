import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBudgetLineRows,
  buildBudgetSourceAllocationReadinessRows,
  evaluateBudgetThreshold,
  resolveBudgetSourceAllocation,
} from "./budgetControl";

const budgetServiceSource = readFileSync(
  path.resolve(__dirname, "budgetControl.ts"),
  "utf8",
);
const budgetPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/finance/budget-control/page.tsx"),
  "utf8",
);

describe("budget control foundation", () => {
  it("calculates remaining budget from revised budget, commitments, and posted actuals", () => {
    const rows = buildBudgetLineRows({
      lines: [
        {
          id: "line-1",
          code: "FOOD-COST",
          name: "Food cost purchases",
          status: "ACTIVE",
          periodStart: new Date("2026-07-01T00:00:00.000Z"),
          periodEnd: new Date("2026-07-31T23:59:59.000Z"),
          revisedAmountPhp: 1000,
          warningThresholdPct: 80,
          hardBlockPct: 95,
          accountId: "food-cost-account",
          locationId: "location-1",
          budget: {
            id: "budget-1",
            publicReference: "BUD-001",
            name: "July operating budget",
          },
          account: {
            name: "Food Cost",
          },
          location: {
            name: "Yakiniku Like SM North Edsa",
          },
          commitments: [
            {
              status: "APPROVED",
              committedAmountPhp: 250,
              consumedAmountPhp: 0,
              releasedAmountPhp: 0,
            },
            {
              status: "REVERSED",
              committedAmountPhp: 100,
              consumedAmountPhp: 0,
              releasedAmountPhp: 0,
            },
          ],
        },
      ],
      actuals: [
        {
          accountId: "food-cost-account",
          locationId: "location-1",
          amountPhp: 300,
          journal: {
            journalDate: new Date("2026-07-06T00:00:00.000Z"),
            status: "POSTED",
          },
        },
        {
          accountId: "food-cost-account",
          locationId: "location-1",
          amountPhp: 999,
          journal: {
            journalDate: new Date("2026-07-06T00:00:00.000Z"),
            status: "DRAFT",
          },
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.committedAmountPhp).toBe(250);
    expect(rows[0]?.actualAmountPhp).toBe(300);
    expect(rows[0]?.remainingAmountPhp).toBe(450);
    expect(rows[0]?.utilizationPct).toBe(55);
    expect(rows[0]?.thresholdState).toBe("WITHIN_BUDGET");
    expect(rows[0]?.warningThresholdPct).toBe(80);
    expect(rows[0]?.hardBlockPct).toBe(95);
  });

  it("classifies warning and hard-block budget thresholds before source hooks write commitments", () => {
    const warning = evaluateBudgetThreshold({
      revisedAmountPhp: 1000,
      committedAmountPhp: 700,
      actualAmountPhp: 0,
      proposedAmountPhp: 150,
      warningThresholdPct: 80,
      hardBlockPct: 95,
    });
    expect(warning.state).toBe("WARNING");
    expect(warning.requiresReview).toBe(true);
    expect(warning.requiresApprovedOverride).toBe(false);

    const hardBlock = evaluateBudgetThreshold({
      revisedAmountPhp: 1000,
      committedAmountPhp: 900,
      actualAmountPhp: 0,
      proposedAmountPhp: 60,
      warningThresholdPct: 80,
      hardBlockPct: 95,
    });
    expect(hardBlock.state).toBe("HARD_BLOCK");
    expect(hardBlock.requiresApprovedOverride).toBe(true);
    expect(hardBlock.remainingAfterProposedPhp).toBe(40);
  });

  it("resolves source-line budget allocations across PR, PO, and AP without mutating source records", () => {
    const purchaseRequestAllocation = resolveBudgetSourceAllocation({
      sourceType: "PURCHASE_REQUEST",
      sourceId: "pr-1",
      sourceLineId: "pr-line-1",
      directBudgetLineId: "budget-line-food",
      sourceReference: "PR-001",
      sourceSummary: "Beef short plate request",
    });
    expect(purchaseRequestAllocation).toMatchObject({
      budgetLineId: "budget-line-food",
      allocationSource: "DIRECT",
      commitmentReadiness: "READY_FOR_COMMITMENT",
      noSourceMutation: true,
      hardBlockDeferred: true,
    });

    const purchaseOrderAllocation = resolveBudgetSourceAllocation({
      sourceType: "PURCHASE_ORDER_LINE",
      sourceId: "po-1",
      sourceLineId: "po-line-1",
      inheritedBudgetLineId: purchaseRequestAllocation.budgetLineId,
      sourceReference: "PO-001",
      sourceSummary: "Beef short plate order",
    });
    expect(purchaseOrderAllocation).toMatchObject({
      budgetLineId: "budget-line-food",
      allocationSource: "INHERITED",
      commitmentReadiness: "READY_FOR_COMMITMENT",
    });

    const apAllocation = resolveBudgetSourceAllocation({
      sourceType: "AP_INVOICE",
      sourceId: "ap-1",
      sourceLineId: "ap-line-1",
      inheritedBudgetLineId: purchaseOrderAllocation.budgetLineId,
      sourceReference: "AP-001",
      sourceSummary: "Supplier invoice for beef short plate",
    });
    expect(apAllocation).toMatchObject({
      budgetLineId: "budget-line-food",
      allocationSource: "INHERITED",
      commitmentReadiness: "READY_FOR_COMMITMENT",
    });

    expect(
      resolveBudgetSourceAllocation({
        sourceType: "PURCHASE_REQUEST",
        sourceId: "pr-2",
        sourceLineId: "pr-line-2",
        sourceReference: "PR-002",
        sourceSummary: "Unallocated emergency supply",
      }),
    ).toMatchObject({
      budgetLineId: null,
      allocationSource: "UNALLOCATED",
      commitmentReadiness: "NEEDS_BUDGET_LINE_ALLOCATION",
      noSourceMutation: true,
      hardBlockDeferred: true,
    });
  });

  it("summarizes source allocation readiness for backfill and UAT rollout", () => {
    const rows = buildBudgetSourceAllocationReadinessRows([
      {
        sourceType: "PURCHASE_REQUEST",
        label: "Purchase requests",
        allocatedLineCount: 8,
        unallocatedLineCount: 2,
      },
      {
        sourceType: "PURCHASE_ORDER",
        label: "Purchase orders",
        allocatedLineCount: 5,
        unallocatedLineCount: 0,
      },
      {
        sourceType: "AP_INVOICE",
        label: "AP invoices",
        allocatedLineCount: 0,
        unallocatedLineCount: 0,
      },
    ]);

    expect(rows[0]).toMatchObject({
      sourceType: "PURCHASE_REQUEST",
      totalLineCount: 10,
      allocationPct: 80,
      readiness: "NEEDS_BACKFILL",
      tone: "warning",
    });
    expect(rows[1]).toMatchObject({
      readiness: "READY_FOR_WARNING_PROJECTION",
      tone: "success",
    });
    expect(rows[2]).toMatchObject({
      readiness: "NO_SOURCE_LINES",
      tone: "neutral",
    });
  });

  it("keeps budget controls scoped and source-record safe", () => {
    expect(budgetServiceSource).toContain("requirePermission");
    expect(budgetServiceSource).toContain("authorizedLocationIds");
    expect(budgetServiceSource).toContain('status: "POSTED"');
    expect(budgetPageSource).toContain("does not approve POs");
    expect(budgetPageSource).toContain("change source-record status");
    expect(budgetPageSource).toContain("line.warningThresholdPct");
    expect(budgetServiceSource).toContain(
      "upsertBudgetCommitmentFromSourceEvent",
    );
    expect(budgetServiceSource).toContain(
      "reverseBudgetCommitmentFromSourceEvent",
    );
    expect(budgetServiceSource).toContain("resolveBudgetSourceAllocation");
    expect(budgetServiceSource).toContain("READY_FOR_COMMITMENT");
    expect(budgetServiceSource).toContain("NEEDS_BUDGET_LINE_ALLOCATION");
    expect(budgetServiceSource).toContain(
      "BUDGET_HARD_BLOCK_OVERRIDE_REQUIRED",
    );
    expect(budgetServiceSource).toContain(
      "BUDGET_OVERRIDE_SELF_APPROVAL_BLOCKED",
    );
    expect(budgetServiceSource).toContain(
      "budget_commitment_only_no_source_mutation",
    );
    expect(budgetServiceSource).toContain(
      "budget_reversal_only_no_source_mutation",
    );
    expect(budgetServiceSource).toContain("submitBudgetForReview");
    expect(budgetServiceSource).toContain("startBudgetReview");
    expect(budgetServiceSource).toContain("approveBudget");
    expect(budgetServiceSource).toContain("returnBudgetForRevision");
    expect(budgetServiceSource).toContain("rejectBudget");
    expect(budgetServiceSource).toContain("activateBudget");
    expect(budgetServiceSource).toContain("closeBudget");
    expect(budgetServiceSource).toContain("cancelBudget");
    expect(budgetServiceSource).toContain("archiveBudget");
    expect(budgetServiceSource).toContain("createDraftBudget");
    expect(budgetServiceSource).toContain("createDraftBudgetRevision");
    expect(budgetServiceSource).toContain("BUDGET_CREATION_REASON_REQUIRED");
    expect(budgetServiceSource).toContain("BUDGET_REVISION_REASON_REQUIRED");
    expect(budgetServiceSource).toContain("BUDGET_REVISION_AMOUNT_UNCHANGED");
    expect(budgetServiceSource).toContain(
      "budget_revision_request_only_no_budget_mutation",
    );
    expect(budgetServiceSource).toContain("budget.revision_drafted");
    expect(budgetServiceSource).toContain("BudgetRevisionWorkflowRow");
    expect(budgetServiceSource).toContain("submitBudgetRevisionForReview");
    expect(budgetServiceSource).toContain("findBudgetRevisionApprovalRule");
    expect(budgetServiceSource).toContain('documentType: "BudgetRevision"');
    expect(budgetServiceSource).toContain("approvalInstance.create");
    expect(budgetServiceSource).toContain("APPROVE_BUDGET_REVISION");
    expect(budgetServiceSource).toContain("configureApprovalStepRouting");
    expect(budgetServiceSource).not.toContain(
      "resolveScopedNotificationRecipients",
    );
    expect(budgetServiceSource).toContain(
      "BUDGET_REVISION_APPROVAL_RULE_NOT_CONFIGURED",
    );
    expect(budgetServiceSource).toContain("startBudgetRevisionReview");
    expect(budgetServiceSource).toContain("approveBudgetRevision");
    expect(budgetServiceSource).toContain("rejectBudgetRevision");
    expect(budgetServiceSource).toContain("cancelBudgetRevision");
    expect(budgetServiceSource).toContain(
      "BUDGET_REVISION_SELF_APPROVAL_BLOCKED",
    );
    expect(budgetServiceSource).toContain(
      "BUDGET_REVISION_REJECTION_REASON_REQUIRED",
    );
    expect(budgetServiceSource).toContain("approvedRequestOnly");
    expect(budgetServiceSource).toContain("lineMutationDeferred");
    expect(budgetServiceSource).toContain("BUDGET_LOCATION_REQUIRED");
    expect(budgetServiceSource).toContain("BUDGET_ACCOUNT_NOT_POSTABLE");
    expect(budgetServiceSource).toContain("BUDGET_PERIOD_OUTSIDE_FISCAL_YEAR");
    expect(budgetServiceSource).toContain("budget.created");
    expect(budgetServiceSource).toContain("phase3_create_only");
    expect(budgetServiceSource).toContain("nextBudgetReference");
    expect(budgetServiceSource).toContain("BUDGET_SELF_APPROVAL_BLOCKED");
    expect(budgetServiceSource).toContain("BUDGET_RETURN_REASON_REQUIRED");
    expect(budgetServiceSource).toContain("BUDGET_REJECTION_REASON_REQUIRED");
    expect(budgetServiceSource).toContain(
      "BUDGET_CANCELLATION_REASON_REQUIRED",
    );
    expect(budgetServiceSource).toContain(
      "BUDGET_OPEN_COMMITMENTS_BLOCK_CLOSE",
    );
    expect(budgetServiceSource).toContain("budget.approved");
    expect(budgetServiceSource).toContain("BudgetWorkflowRow");
    expect(budgetServiceSource).toContain("resolveBudgetAllowedActions");
    expect(budgetPageSource).toContain("runBudgetLifecycleAction");
    expect(budgetPageSource).toContain("runBudgetDraftAction");
    expect(budgetPageSource).toContain("runBudgetRevisionDraftAction");
    expect(budgetPageSource).toContain("runBudgetRevisionLifecycleAction");
    expect(budgetPageSource).toContain("Create Draft Budget");
    expect(budgetPageSource).toContain("Create Draft Budget Revision");
    expect(budgetPageSource).toContain("Create Draft Revision");
    expect(budgetPageSource).toContain("Budget Revision Requests");
    expect(budgetPageSource).toContain("Approve Request");
    expect(budgetPageSource).toContain('name="fiscalYearId"');
    expect(budgetPageSource).toContain('name="accountId"');
    expect(budgetPageSource).toContain('name="budgetLineId"');
    expect(budgetPageSource).toContain('name="proposedAmountPhp"');
    expect(budgetPageSource).toContain('name="warningThresholdPct"');
    expect(budgetPageSource).toContain("Budget Workflow Actions");
    expect(budgetPageSource).toContain("Source Allocation Readiness");
    expect(budgetPageSource).toContain("dashboard.sourceAllocationReadiness");
    expect(budgetPageSource).toContain("Budget source-hook policy");
    expect(budgetPageSource).toContain("dashboard.sourceHookPolicy");
    expect(budgetServiceSource).toContain("getBudgetSourceHookPolicy");
    expect(budgetServiceSource).toContain("sourceHookPolicy.policy.rolloutMode");
    expect(budgetServiceSource).toContain("hardBlockEnabled");
    expect(budgetServiceSource).toContain("uatRequiredBeforeHardBlock");
    expect(budgetServiceSource).toContain(
      "buildBudgetSourceAllocationReadinessRows",
    );
    expect(budgetServiceSource).toContain("purchaseRequestLine.count");
    expect(budgetServiceSource).toContain("purchaseOrderLine.count");
    expect(budgetServiceSource).toContain("apInvoiceLine.count");
    expect(budgetPageSource).toContain("budget.allowedActions");
    expect(budgetServiceSource).toContain("noSourceMutation");
    expect(budgetServiceSource).toContain("noPaymentMutation");
    expect(budgetServiceSource).toContain("noJournalPosting");
    expect(budgetServiceSource).not.toContain("purchaseOrder.update");
    expect(budgetServiceSource).not.toContain("purchaseRequest.update");
    expect(budgetServiceSource).not.toContain("apInvoice.update");
    expect(budgetServiceSource).not.toContain("paymentRelease.update");
    expect(budgetServiceSource).not.toContain("financeJournal.create");
  });

  it("supports warning-mode source projections from controlled workflow transitions", () => {
    expect(budgetServiceSource).toContain(
      "projectBudgetCommitmentFromApprovedSourceEvent",
    );
    expect(budgetServiceSource).toContain(
      "reverseBudgetCommitmentFromApprovedSourceEvent",
    );
    expect(budgetServiceSource).toContain('"EXPENSE_REQUEST"');
    expect(budgetServiceSource).toContain(
      "budget.commitment_source_projection_created",
    );
    expect(budgetServiceSource).toContain(
      "budget.commitment_source_projection_updated",
    );
    expect(budgetServiceSource).toContain(
      'projectionMode: "warning_first"',
    );
    expect(budgetServiceSource).toContain("hardBlockDeferred: true");
    expect(budgetServiceSource).toContain("warningFirst: true");
    expect(budgetServiceSource).toContain("noSourceMutation: true");
    expect(budgetServiceSource).toContain(
      "budget.commitment_source_projection_reversed",
    );
    expect(budgetServiceSource).toContain(
      'projectionMode: "source_transition_reversal"',
    );
    expect(budgetServiceSource).toContain(
      "budget_commitment_only_no_source_mutation",
    );
  });
});
