import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertTransferReceiptQuantities,
  calculateTransferReceiptStatus,
  assertPositiveTransferQuantity,
  assertTransferCanCancel,
  assertTransferCanDispatch,
  assertTransferCanReceive,
  assertTransferCanSettleDiscrepancy,
  assertTransferReceiptCanReverse,
  assertTransferCanSubmit,
  assertTransferLocationsDistinct
} from "./transfers";

describe("inventory transfer foundation rules", () => {
  test("read gate allows every transfer action permission", () => {
    const source = readFileSync(path.resolve(__dirname, "transfers.ts"), "utf8");

    expect(source).toContain("canUseTransfers(session.permissionCodes)");
  });

  test("requires distinct source and destination locations", () => {
    expect(() => assertTransferLocationsDistinct("source", "destination")).not.toThrow();
    expect(() => assertTransferLocationsDistinct("same", "same")).toThrow(
      "TRANSFER_SOURCE_DESTINATION_MUST_DIFFER"
    );
  });

  test("requires positive transfer quantities", () => {
    expect(() => assertPositiveTransferQuantity(1)).not.toThrow();
    expect(() => assertPositiveTransferQuantity(0)).toThrow(
      "TRANSFER_QUANTITY_INVALID"
    );
    expect(() => assertPositiveTransferQuantity(Number.NaN)).toThrow(
      "TRANSFER_QUANTITY_INVALID"
    );
  });

  test("submits draft transfers only", () => {
    expect(() => assertTransferCanSubmit("DRAFT")).not.toThrow();
    expect(() => assertTransferCanSubmit("REQUESTED")).toThrow(
      "TRANSFER_NOT_DRAFT_FOR_SUBMIT"
    );
  });

  test("cancels only draft or requested transfers", () => {
    expect(() => assertTransferCanCancel("DRAFT")).not.toThrow();
    expect(() => assertTransferCanCancel("REQUESTED")).not.toThrow();
    expect(() => assertTransferCanCancel("CANCELLED")).toThrow(
      "TRANSFER_NOT_CANCELLABLE"
    );
  });

  test("dispatches requested transfers only", () => {
    expect(() => assertTransferCanDispatch("REQUESTED")).not.toThrow();
    expect(() => assertTransferCanDispatch("DRAFT")).toThrow(
      "TRANSFER_NOT_REQUESTED_FOR_DISPATCH"
    );
  });

  test("receives dispatched, partial, or disputed transfers", () => {
    expect(() => assertTransferCanReceive("DISPATCHED")).not.toThrow();
    expect(() => assertTransferCanReceive("PARTIALLY_RECEIVED")).not.toThrow();
    expect(() => assertTransferCanReceive("DISPUTED")).not.toThrow();
    expect(() => assertTransferCanReceive("REQUESTED")).toThrow(
      "TRANSFER_NOT_DISPATCHED_FOR_RECEIPT"
    );
  });

  test("reverses posted unreversed receipt events only", () => {
    expect(() => assertTransferReceiptCanReverse("POSTED", null)).not.toThrow();
    expect(() => assertTransferReceiptCanReverse("POSTED", undefined)).not.toThrow();
    expect(() => assertTransferReceiptCanReverse("REVERSED", new Date())).toThrow(
      "TRANSFER_RECEIPT_ALREADY_REVERSED"
    );
    expect(() => assertTransferReceiptCanReverse("POSTING", null)).toThrow(
      "TRANSFER_RECEIPT_NOT_POSTED_FOR_REVERSAL"
    );
  });

  test("settles disputed transfer discrepancies only with segregation controls", () => {
    const base = {
      status: "DISPUTED",
      hasDiscrepancy: true,
      actorUserId: "manager",
      requestedByUserId: "requester",
      dispatchedByUserId: "dispatcher",
      activeReceiptReceiverUserIds: ["receiver"]
    };

    expect(() => assertTransferCanSettleDiscrepancy(base)).not.toThrow();
    expect(() =>
      assertTransferCanSettleDiscrepancy({ ...base, status: "RECEIVED" })
    ).toThrow("TRANSFER_DISCREPANCY_NOT_SETTLEABLE");
    expect(() =>
      assertTransferCanSettleDiscrepancy({ ...base, hasDiscrepancy: false })
    ).toThrow("TRANSFER_DISCREPANCY_NOT_FOUND");
    expect(() =>
      assertTransferCanSettleDiscrepancy({ ...base, actorUserId: "requester" })
    ).toThrow("TRANSFER_DISCREPANCY_SELF_SETTLEMENT_NOT_ALLOWED");
    expect(() =>
      assertTransferCanSettleDiscrepancy({ ...base, actorUserId: "dispatcher" })
    ).toThrow("TRANSFER_DISCREPANCY_DISPATCHER_SETTLEMENT_NOT_ALLOWED");
    expect(() =>
      assertTransferCanSettleDiscrepancy({ ...base, actorUserId: "receiver" })
    ).toThrow("TRANSFER_DISCREPANCY_RECEIVER_SETTLEMENT_NOT_ALLOWED");
  });

  test("validates transfer receipt quantities and discrepancy support", () => {
    expect(() =>
      assertTransferReceiptQuantities({
        acceptedQty: 5,
        rejectedQty: 0,
        damagedQty: 0,
        discrepancyQty: 0,
        remainingQty: 10
      })
    ).not.toThrow();
    expect(() =>
      assertTransferReceiptQuantities({
        acceptedQty: 8,
        rejectedQty: 3,
        damagedQty: 0,
        discrepancyQty: 0,
        remainingQty: 10,
        discrepancyReason: "Supplier packed short",
        evidenceReference: "TR-EVID-001"
      })
    ).toThrow("TRANSFER_RECEIPT_EXCEEDS_DISPATCHED");
    expect(() =>
      assertTransferReceiptQuantities({
        acceptedQty: 5,
        rejectedQty: 1,
        damagedQty: 0,
        discrepancyQty: 0,
        remainingQty: 10
      })
    ).toThrow("TRANSFER_RECEIPT_DISCREPANCY_REASON_REQUIRED");
    expect(() =>
      assertTransferReceiptQuantities({
        acceptedQty: 5,
        rejectedQty: 1,
        damagedQty: 0,
        discrepancyQty: 0,
        remainingQty: 10,
        discrepancyReason: "Supplier packed short"
      })
    ).toThrow("TRANSFER_RECEIPT_DISCREPANCY_EVIDENCE_REQUIRED");
    expect(() =>
      assertTransferReceiptQuantities({
        acceptedQty: 5,
        rejectedQty: 1,
        damagedQty: 0,
        discrepancyQty: 0,
        remainingQty: 10,
        discrepancyReason: "Supplier packed short",
        evidenceReference: "TR-EVID-001"
      })
    ).not.toThrow();
  });

  test("calculates transfer receipt status from line rollups", () => {
    expect(
      calculateTransferReceiptStatus([
        {
          dispatchedQty: 10,
          receivedQty: 0,
          rejectedQty: 0,
          damagedQty: 0,
          discrepancyQty: 0
        }
      ])
    ).toBe("DISPATCHED");
    expect(
      calculateTransferReceiptStatus([
        {
          dispatchedQty: 10,
          receivedQty: 5,
          rejectedQty: 0,
          damagedQty: 0,
          discrepancyQty: 0
        }
      ])
    ).toBe("PARTIALLY_RECEIVED");
    expect(
      calculateTransferReceiptStatus([
        {
          dispatchedQty: 10,
          receivedQty: 10,
          rejectedQty: 0,
          damagedQty: 0,
          discrepancyQty: 0
        }
      ])
    ).toBe("RECEIVED");
    expect(
      calculateTransferReceiptStatus([
        {
          dispatchedQty: 10,
          receivedQty: 8,
          rejectedQty: 0,
          damagedQty: 1,
          discrepancyQty: 1
        }
      ])
    ).toBe("DISPUTED");
  });

  test("migration adds receipt-event tables and transfer statuses", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260630234500_transfer_receipt_events/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain('CREATE TABLE "InventoryTransferReceipt"');
    expect(migration).toContain('CREATE TABLE "InventoryTransferReceiptLine"');
    expect(migration).toContain("PARTIALLY_RECEIVED");
    expect(migration).toContain("DISPUTED");
    expect(migration).toContain('"postedMovementId"');
  });

  test("transfer receipt reversal uses dedicated permission and linked movement reversal", () => {
    const service = readFileSync(path.resolve(__dirname, "transfers.ts"), "utf8");
    const authorization = readFileSync(
      path.resolve(__dirname, "authorization.ts"),
      "utf8"
    );

    expect(authorization).toContain(
      'transferReceiptReverse: "inventory.transfer.receipt.reverse"'
    );
    expect(service).toContain("reverseInventoryTransferReceipt");
    expect(service).toContain("TRANSFER_RECEIPT_SELF_REVERSAL_NOT_ALLOWED");
    expect(service).toContain("TRANSFER_RECEIPT_DISPATCHER_REVERSAL_NOT_ALLOWED");
    expect(service).toContain('movementType: "REVERSAL"');
    expect(service).toContain("reversalOfMovementId: original.id");
    expect(service).toContain("sourceEventKey: `receipt:${line.id}:reverse`");
    expect(service).toContain("TRANSFER_RECEIPT_REVERSAL_ROLLUP_INVALID");
  });

  test("transfer discrepancy settlement is permissioned, audited, and non-posting", () => {
    const service = readFileSync(path.resolve(__dirname, "transfers.ts"), "utf8");
    const authorization = readFileSync(
      path.resolve(__dirname, "authorization.ts"),
      "utf8"
    );
    const detailPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/transfers/[id]/page.tsx"),
      "utf8"
    );
    const seed = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/src/seed.ts"),
      "utf8"
    );
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260701080000_transfer_discrepancy_settlement_permission/migration.sql"
      ),
      "utf8"
    );

    expect(authorization).toContain(
      'transferDiscrepancySettle: "inventory.transfer.discrepancy.settle"'
    );
    expect(seed).toContain("inventory.transfer.discrepancy.settle");
    expect(migration).toContain("inventory.transfer.discrepancy.settle");
    expect(migration).toContain("CONFIGURED_ADMIN");
    expect(migration).toContain("CONFIGURED_APPROVER");
    expect(service).toContain("settleInventoryTransferDiscrepancy");
    expect(service).toContain("permissions.transferDiscrepancySettle");
    expect(service).toContain('status: "DISCREPANCY_SETTLED"');
    expect(service).toContain('eventType: "inventory_transfer.discrepancy_settled"');
    expect(service).toContain("nonPostingSettlement: true");
    expect(service).toContain("TRANSFER_DISCREPANCY_SELF_SETTLEMENT_NOT_ALLOWED");
    expect(service).toContain("TRANSFER_DISCREPANCY_RECEIVER_SETTLEMENT_NOT_ALLOWED");
    expect(service).not.toContain('reasonCode: "TRANSFER_DISCREPANCY_SETTLEMENT"');
    expect(detailPage).toContain("settleInventoryTransferDiscrepancy");
    expect(detailPage).toContain("Settle Transfer Discrepancy");
    expect(detailPage).toContain("Original dispatch and receipt movements remain unchanged");
  });

  test("settled transfer discrepancies do not reopen destination receipt", () => {
    expect(() => assertTransferCanReceive("DISCREPANCY_SETTLED")).toThrow(
      "TRANSFER_NOT_DISPATCHED_FOR_RECEIPT"
    );
  });

  test("transfer export includes receipt-event line detail without mutating transfers", () => {
    const service = readFileSync(path.resolve(__dirname, "transfers.ts"), "utf8");
    const route = readFileSync(
      path.resolve(__dirname, "../../app/(app)/transfers/export/route.ts"),
      "utf8"
    );

    expect(service).toContain("buildInventoryTransferExportRows");
    expect(service).toContain("Receipt Status");
    expect(service).toContain("Accepted Qty");
    expect(service).toContain("Rejected Qty");
    expect(service).toContain("Damaged Qty");
    expect(service).toContain("Discrepancy Qty");
    expect(service).toContain("Settlement Status");
    expect(service).toContain("Settlement Type");
    expect(service).toContain("Settlement Evidence Reference");
    expect(service).toContain("Settlement Reason");
    expect(service).toContain("settlementMetadataValue");
    expect(service).toContain('eventType: "inventory_transfer.discrepancy_settled"');
    expect(service).toContain("Evidence Reference");
    expect(route).toContain("buildInventoryTransferExportRows(session)");
    expect(route).not.toContain("postInventoryMovementInTransaction");
    expect(route).not.toContain("inventoryTransfer.update");
  });
});
