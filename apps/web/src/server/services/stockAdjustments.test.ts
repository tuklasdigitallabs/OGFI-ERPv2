import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertStockAdjustmentCanCancel,
  assertStockAdjustmentCanPost,
  assertStockAdjustmentCanReverse,
  assertStockAdjustmentCanSubmit,
  assertStockAdjustmentQuantity,
  assertOpeningBalanceIsPostable,
  calculateAdjustmentDelta
} from "./stockAdjustments";

describe("stock adjustment controlled workflow rules", () => {
  test("stock adjustment pages explain approval, posting, and reversal controls", () => {
    const listPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/adjustments/page.tsx"),
      "utf8"
    );
    const detailPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/adjustments/[id]/page.tsx"),
      "utf8"
    );

    expect(listPage).toContain("Approve, post, and reverse controlled stock correction and opening-balance requests");
    expect(listPage).toContain("OPENING_BALANCE_IN ledger movements");
    expect(detailPage).toContain(
      "Approval does not change stock. Only the separate Post Adjustment action"
    );
    expect(detailPage).toContain("through reversal");
    expect(listPage).not.toContain("This foundation records");
    expect(detailPage).not.toContain("in this foundation");
  });

  test("stock adjustment audit metadata reflects controlled approval and posting", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");

    expect(source).toContain("approvalAndPostingRequired: true");
    expect(source).toContain("nonPostingApproval: true");
    expect(source).toContain("StockCountVarianceAdjustment");
    expect(source).toContain("approvalRuleTransactionType: transactionType");
    expect(source).not.toContain("nonPostingFoundation: true");
  });

  test("stock adjustment approval submission emits scoped in-app approval notification", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");

    expect(source).toContain("resolveScopedNotificationRecipients");
    expect(source).toContain("recordWorkflowNotifications");
    expect(source).toContain('notificationType: "APPROVE_STOCK_ADJUSTMENT"');
    expect(source).toContain("locationId: adjustment.inventoryLocation.locationId");
    expect(source).toContain("sourceEventKey: auditEvent.id");
    expect(source).toContain('recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role"');
    expect(source).toContain("deepLink: `/approvals/${approval.id}`");
    expect(source).toContain('source: "stock-adjustment-approval-submission"');
  });

  test("service and approval wiring expose controlled stock-adjustment actions", () => {
    const service = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");
    const approvals = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const authorization = readFileSync(path.resolve(__dirname, "authorization.ts"), "utf8");

    expect(service).toContain("canUseStockAdjustments(session.permissionCodes)");
    expect(authorization).toContain('stockAdjustmentApprove: "inventory.stock_adjustment.approve"');
    expect(authorization).toContain('stockAdjustmentPost: "inventory.stock_adjustment.post"');
    expect(authorization).toContain('stockAdjustmentReverse: "inventory.stock_adjustment.reverse"');
    expect(approvals).toContain('documentType: "StockAdjustment"');
    expect(approvals).toContain("approveStockAdjustment");
  });

  test("requires nonzero quantity deltas", () => {
    expect(() => assertStockAdjustmentQuantity(1)).not.toThrow();
    expect(() => assertStockAdjustmentQuantity(-1)).not.toThrow();
    expect(() => assertStockAdjustmentQuantity(0)).toThrow(
      "STOCK_ADJUSTMENT_QUANTITY_INVALID"
    );
  });

  test("maps increase and decrease to signed base quantity deltas", () => {
    expect(calculateAdjustmentDelta("INCREASE", 2.5)).toBe(2.5);
    expect(calculateAdjustmentDelta("DECREASE", 2.5)).toBe(-2.5);
    expect(calculateAdjustmentDelta("OPENING_BALANCE", 2.5)).toBe(2.5);
    expect(() => calculateAdjustmentDelta("INCREASE", 0)).toThrow(
      "STOCK_ADJUSTMENT_QUANTITY_INVALID"
    );
  });

  test("opening balances require cutover evidence and zero existing stock", () => {
    expect(() =>
      assertOpeningBalanceIsPostable({
        adjustmentType: "OPENING_BALANCE",
        evidenceReference: "SIGNED-COUNT-001",
        systemQuantityBaseUom: 0
      })
    ).not.toThrow();
    expect(() =>
      assertOpeningBalanceIsPostable({
        adjustmentType: "OPENING_BALANCE",
        evidenceReference: "",
        evidenceRequired: true,
        systemQuantityBaseUom: 0
      })
    ).toThrow("OPENING_BALANCE_EVIDENCE_REQUIRED");
    expect(() =>
      assertOpeningBalanceIsPostable({
        adjustmentType: "OPENING_BALANCE",
        evidenceReference: "",
        evidenceRequired: false,
        systemQuantityBaseUom: 0
      })
    ).not.toThrow();
    expect(() =>
      assertOpeningBalanceIsPostable({
        adjustmentType: "OPENING_BALANCE",
        evidenceReference: "SIGNED-COUNT-001",
        systemQuantityBaseUom: 1
      })
    ).toThrow("OPENING_BALANCE_EXISTING_STOCK_ACTIVITY");
  });

  test("opening balance evidence enforcement reads the configurable DEC-0036 policy", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");
    const policySource = readFileSync(
      path.resolve(__dirname, "policySettings.ts"),
      "utf8"
    );

    expect(source).toContain("getInventoryAdjustmentPolicy");
    expect(source).toContain("openingBalanceEvidenceRequired");
    expect(policySource).toContain("inventory.adjustment.opening_balance_evidence_required");
  });

  test("submits draft, submitted, or returned adjustments into approval", () => {
    expect(() => assertStockAdjustmentCanSubmit("DRAFT")).not.toThrow();
    expect(() => assertStockAdjustmentCanSubmit("SUBMITTED")).not.toThrow();
    expect(() => assertStockAdjustmentCanSubmit("RETURNED")).not.toThrow();
    expect(() => assertStockAdjustmentCanSubmit("PENDING_APPROVAL")).toThrow(
      "STOCK_ADJUSTMENT_NOT_OPEN_FOR_SUBMIT"
    );
    expect(() => assertStockAdjustmentCanSubmit("CANCELLED")).toThrow(
      "STOCK_ADJUSTMENT_NOT_OPEN_FOR_SUBMIT"
    );
  });

  test("cancels only pre-approved adjustments", () => {
    expect(() => assertStockAdjustmentCanCancel("DRAFT")).not.toThrow();
    expect(() => assertStockAdjustmentCanCancel("SUBMITTED")).not.toThrow();
    expect(() => assertStockAdjustmentCanCancel("PENDING_APPROVAL")).not.toThrow();
    expect(() => assertStockAdjustmentCanCancel("RETURNED")).not.toThrow();
    expect(() => assertStockAdjustmentCanCancel("CANCELLED")).toThrow(
      "STOCK_ADJUSTMENT_NOT_CANCELLABLE"
    );
    expect(() => assertStockAdjustmentCanCancel("POSTED")).toThrow(
      "STOCK_ADJUSTMENT_NOT_CANCELLABLE"
    );
  });

  test("cancel action claims every state the UI exposes as cancellable", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");

    expect(source).toContain(
      'status: { in: ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "RETURNED"] }'
    );
    expect(source).toContain('status: { in: ["PENDING", "WAITING"] }');
  });

  test("posts only approved unposted adjustments", () => {
    expect(() => assertStockAdjustmentCanPost("APPROVED", null)).not.toThrow();
    expect(() => assertStockAdjustmentCanPost("APPROVED", undefined)).not.toThrow();
    expect(() => assertStockAdjustmentCanPost("PENDING_APPROVAL", null)).toThrow(
      "STOCK_ADJUSTMENT_NOT_APPROVED_FOR_POSTING"
    );
    expect(() => assertStockAdjustmentCanPost("APPROVED", new Date())).toThrow(
      "STOCK_ADJUSTMENT_ALREADY_POSTED"
    );
  });

  test("reverses only posted unreversed adjustments", () => {
    expect(() => assertStockAdjustmentCanReverse("POSTED", null)).not.toThrow();
    expect(() => assertStockAdjustmentCanReverse("APPROVED", null)).toThrow(
      "STOCK_ADJUSTMENT_NOT_POSTED_FOR_REVERSAL"
    );
    expect(() => assertStockAdjustmentCanReverse("POSTED", new Date())).toThrow(
      "STOCK_ADJUSTMENT_ALREADY_REVERSED"
    );
  });

  test("posting and reversal are source-linked ledger actions", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");

    expect(source).toContain('movementType: "REVERSAL"');
    expect(source).toContain('"OPENING_BALANCE_IN"');
    expect(source).toContain('quantityDeltaBaseUom > 0');
    expect(source).toContain("sourceEventKey: `stock_adjustment_line:${line.id}:post`");
    expect(source).toContain("sourceEventKey: `stock_adjustment_line:${line.id}:reverse`");
    expect(source).toContain("reversalOfMovementId: original.id");
  });

  test("migration accepts controlled approval, posting, and reversal statuses", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260630220000_stock_adjustment_posting_reversal/migration.sql"
      ),
      "utf8"
    );

    for (const status of [
      "PENDING_APPROVAL",
      "APPROVED",
      "POSTING",
      "POSTED",
      "REVERSING",
      "REVERSED",
      "RETURNED",
      "REJECTED"
    ]) {
      expect(migration).toContain(`'${status}'`);
    }
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "StockAdjustment_status_check"');
    expect(migration).toContain('"StockAdjustment_posted_fields_check"');
    expect(migration).toContain('"StockAdjustment_reversed_fields_check"');
  });
});
