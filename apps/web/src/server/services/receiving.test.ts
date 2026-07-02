import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertGoodsReceiptCanBePosted,
  assertGoodsReceiptCanBeReversed,
  assertPurchaseOrderCanBeReceived,
  calculatePurchaseOrderReceivingStatus,
  validateReceivingQuantities
} from "./receiving";

describe("receiving foundation rules", () => {
  test("service read gate allows every receiving action permission", () => {
    const source = readFileSync(path.resolve(__dirname, "receiving.ts"), "utf8");

    expect(source).toContain("canUseReceiving(session.permissionCodes)");
    expect(source).toContain("receivingReverse");
  });

  test("receiving detail PO link uses the shared purchase-order read helper", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/[id]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("canReadPurchaseOrders");
    expect(source).toContain(
      "const canAccessPurchaseOrders = canReadPurchaseOrders(session.permissionCodes);"
    );
    expect(source).toContain("{canAccessPurchaseOrders ? (");
    expect(source).toContain("View Purchase Order");
  });

  test("allows receiving only from issued or partially received POs", () => {
    expect(() => assertPurchaseOrderCanBeReceived("ISSUED")).not.toThrow();
    expect(() => assertPurchaseOrderCanBeReceived("PARTIALLY_RECEIVED")).not.toThrow();
    expect(() => assertPurchaseOrderCanBeReceived("APPROVED")).toThrow(
      "PURCHASE_ORDER_NOT_ISSUED_FOR_RECEIVING"
    );
    expect(() => assertPurchaseOrderCanBeReceived("CANCELLED")).toThrow(
      "PURCHASE_ORDER_NOT_ISSUED_FOR_RECEIVING"
    );
    expect(() => assertPurchaseOrderCanBeReceived("CLOSED")).toThrow(
      "PURCHASE_ORDER_NOT_ISSUED_FOR_RECEIVING"
    );
  });

  test("posts draft receipts only", () => {
    expect(() => assertGoodsReceiptCanBePosted("DRAFT")).not.toThrow();
    expect(() => assertGoodsReceiptCanBePosted("POSTED")).toThrow(
      "GOODS_RECEIPT_NOT_DRAFT_FOR_POSTING"
    );
  });

  test("reverses only posted unreversed receipts", () => {
    expect(() => assertGoodsReceiptCanBeReversed("POSTED", null)).not.toThrow();
    expect(() =>
      assertGoodsReceiptCanBeReversed("POSTED_WITH_DISCREPANCY", null)
    ).not.toThrow();
    expect(() => assertGoodsReceiptCanBeReversed("DRAFT", null)).toThrow(
      "GOODS_RECEIPT_NOT_POSTED_FOR_REVERSAL"
    );
    expect(() => assertGoodsReceiptCanBeReversed("REVERSED", new Date())).toThrow(
      "GOODS_RECEIPT_ALREADY_REVERSED"
    );
  });

  test("recalculates Purchase Order receiving status from restored quantities", () => {
    expect(
      calculatePurchaseOrderReceivingStatus([
        { orderedQty: 10, receivedQty: 0, cancelledQty: 0 }
      ])
    ).toBe("ISSUED");
    expect(
      calculatePurchaseOrderReceivingStatus([
        { orderedQty: 10, receivedQty: 5, cancelledQty: 0 }
      ])
    ).toBe("PARTIALLY_RECEIVED");
    expect(
      calculatePurchaseOrderReceivingStatus([
        { orderedQty: 10, receivedQty: 7, cancelledQty: 3 }
      ])
    ).toBe("FULLY_RECEIVED");
  });

  test("validates accepted, rejected, damaged, and short quantities", () => {
    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 10,
        acceptedQty: 8,
        rejectedQty: 2,
        damagedQty: 0,
        shortQty: 0,
        discrepancyReason: "Two packs rejected",
        evidenceReference: "photo-001"
      })
    ).not.toThrow();

    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 10,
        acceptedQty: 9,
        rejectedQty: 2,
        damagedQty: 0,
        shortQty: 0
      })
    ).toThrow("RECEIVING_LINE_OUTCOME_EXCEEDS_DELIVERED");

    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 8,
        acceptedQty: 8,
        rejectedQty: 0,
        damagedQty: 0,
        shortQty: 2
      })
    ).toThrow("RECEIVING_DISCREPANCY_REASON_REQUIRED");

    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 8,
        acceptedQty: 8,
        rejectedQty: 0,
        damagedQty: 0,
        shortQty: 2,
        discrepancyReason: "Supplier delivered short"
      })
    ).toThrow("RECEIVING_DISCREPANCY_EVIDENCE_REQUIRED");

    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 11,
        acceptedQty: 11,
        rejectedQty: 0,
        damagedQty: 0,
        shortQty: 0,
        outstandingQty: 10
      })
    ).toThrow("RECEIVING_LINE_EXCEEDS_OUTSTANDING");
  });

  test("receipt reversal is a permissioned, source-linked ledger action", () => {
    const source = readFileSync(path.resolve(__dirname, "receiving.ts"), "utf8");
    const detailPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/[id]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("reverseGoodsReceipt");
    expect(source).toContain("permissions.receivingReverse");
    expect(source).toContain("GOODS_RECEIPT_SELF_REVERSAL_NOT_ALLOWED");
    expect(source).toContain('movementType: "REVERSAL"');
    expect(source).toContain('sourceEventKey: `reversed:${line.id}`');
    expect(source).toContain("reversalOfMovementId: original.id");
    expect(source).toContain('status: { in: ["DRAFT", "POSTING", "REVERSING"] }');
    expect(source).toContain('eventType: "goods_receipt.reversed"');
    expect(detailPage).toContain("Reverse Receipt");
    expect(detailPage).toContain("reverseGoodsReceipt");
  });

  test("receipt reversal migration hardens status and movement links", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260630233000_goods_receipt_reversal/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain('"reversedByUserId" UUID');
    expect(migration).toContain('"reversedAt" TIMESTAMP(3)');
    expect(migration).toContain('"reversalReason" TEXT');
    expect(migration).toContain("'REVERSING'");
    expect(migration).toContain("'REVERSED'");
    expect(migration).toContain('"GoodsReceipt_reversed_fields_check"');
    expect(migration).toContain('"GoodsReceiptLine_postedMovementId_key"');
    expect(migration).toContain('"GoodsReceiptLine_postedMovementId_fkey"');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
  });

  test("receiving discrepancy evidence is stored and shown for damaged rejected or short lines", () => {
    const service = readFileSync(path.resolve(__dirname, "receiving.ts"), "utf8");
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/page.tsx"),
      "utf8"
    );
    const detailPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/[id]/page.tsx"),
      "utf8"
    );
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260701073000_goods_receipt_discrepancy_evidence/migration.sql"
      ),
      "utf8"
    );

    expect(service).toContain("RECEIVING_DISCREPANCY_EVIDENCE_REQUIRED");
    expect(service).toContain("evidenceReference");
    expect(page).toContain("Discrepancy evidence reference");
    expect(detailPage).toContain("Evidence:");
    expect(migration).toContain('ADD COLUMN "evidenceReference" TEXT');
  });

  test("receiving export includes line-level discrepancy evidence references", () => {
    const service = readFileSync(path.resolve(__dirname, "receiving.ts"), "utf8");
    const route = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/export/route.ts"),
      "utf8"
    );

    expect(service).toContain("buildReceivingReportExportRows");
    expect(service).toContain("Evidence Reference");
    expect(service).toContain("Discrepancy Reason");
    expect(service).toContain("Posted Movement");
    expect(route).toContain("buildReceivingReportExportRows(session)");
    expect(route).not.toContain("postInventoryMovementInTransaction");
    expect(route).not.toContain("goodsReceipt.update");
  });
});
