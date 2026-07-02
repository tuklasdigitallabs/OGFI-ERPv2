import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("approval access wiring", () => {
  test("keeps approval read surfaces gated by approval permissions", () => {
    const serviceSource = readFileSync(
      path.resolve(__dirname, "approvals.ts"),
      "utf8",
    );
    const listPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/page.tsx"),
      "utf8",
    );
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8",
    );

    expect(serviceSource).toContain("canUseApprovals(session.permissionCodes)");
    expect(listPageSource).toContain(
      "canUseApprovals(session.permissionCodes)",
    );
    expect(detailPageSource).toContain(
      "canUseApprovals(session.permissionCodes)",
    );
  });

  test("keeps sign-in account based and routed by resolved permissions", () => {
    const signInSource = readFileSync(
      path.resolve(__dirname, "../../app/(auth)/sign-in/page.tsx"),
      "utf8",
    );

    expect(signInSource).toContain("await getConfiguredContext(email)");
    expect(signInSource).toContain(
      "getDefaultAppRoute(session.permissionCodes)",
    );
    expect(signInSource).not.toContain("Sign in as Requester");
    expect(signInSource).not.toContain("Sign in as Approver");
    expect(signInSource).not.toContain("Sign in as Admin");
  });

  test("stock adjustment approval advances multi-step rules before final approval", () => {
    const serviceSource = readFileSync(
      path.resolve(__dirname, "approvals.ts"),
      "utf8",
    );

    expect(serviceSource).toContain("approveStockAdjustment");
    expect(serviceSource).toContain(
      "const nextStep = await tx.approvalInstanceStep.findFirst",
    );
    expect(serviceSource).toContain('status: "WAITING"');
    expect(serviceSource).toContain('data: { status: "PENDING" }');
    expect(serviceSource).toContain(
      'eventType: "stock_adjustment.approval_step_approved"',
    );
    expect(serviceSource).toContain('eventType: "stock_adjustment.approved"');
  });

  test("quotation recommendations use the approval engine before PO creation", () => {
    const approvalSource = readFileSync(
      path.resolve(__dirname, "approvals.ts"),
      "utf8",
    );
    const quoteSource = readFileSync(
      path.resolve(__dirname, "quotes.ts"),
      "utf8",
    );
    const purchaseOrderSource = readFileSync(
      path.resolve(__dirname, "purchaseOrders.ts"),
      "utf8",
    );

    expect(quoteSource).toContain('transactionType: "QuotationRecommendation"');
    expect(quoteSource).toContain('documentType: "QuotationRecommendation"');
    expect(approvalSource).toContain("approveQuotationRecommendation");
    expect(approvalSource).toContain(
      'eventType: "quotation_recommendation.approved"',
    );
    expect(approvalSource).toContain(
      "closeQuotationRecommendationWithDecision",
    );
    expect(approvalSource).toContain('"quotation_recommendation.returned"');
    expect(approvalSource).toContain('"quotation_recommendation.rejected"');
    expect(purchaseOrderSource).toContain(
      "assertApprovedQuotationRecommendationForPo(recommendation.status)",
    );
  });
});
