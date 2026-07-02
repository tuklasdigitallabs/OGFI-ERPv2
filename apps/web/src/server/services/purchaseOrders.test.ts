import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertApprovedQuotationRecommendationForPo,
  assertPurchaseOrderCanBeApproved,
  assertPurchaseOrderCanBeCancelled,
  assertPurchaseOrderCanBeIssued,
  assertPurchaseOrderCanRequestAmendment,
  assertPurchaseOrderCanRequestBalanceClosure,
  assertPurchaseOrderCanBeResent,
  assertPurchaseOrderCanRenderSupplierCopy,
  assertPurchaseOrderCanSubmitForApproval,
  assertPurchaseOrderIssueMethodAllowed,
  assertSupplierNoticeEvidence,
  buildPurchaseOrderAmendmentLineSnapshot,
  buildPurchaseOrderAmendmentProposal,
  buildPurchaseOrderClosureLineSnapshot,
  buildPurchaseOrderLineSnapshots,
  calculatePurchaseOrderTotals,
  classifyPurchaseOrderDeliveryAging,
  normalizePurchaseOrderFilters,
  parsePurchaseOrderAmendmentLines,
  summarizePurchaseOrderFulfillment
} from "./purchaseOrders";
import { canReadPurchaseOrders } from "./authorization";

describe("purchase order lifecycle rules", () => {
  test("app shell navigation uses the shared PO read helper", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../components/AppShell.tsx"),
      "utf8"
    );

    expect(source).toContain("canReadPurchaseOrders");
    expect(source).toContain("@/server/services/authorization");
    expect(source).toContain(
      "const canViewPurchaseOrders = canReadPurchaseOrders(session.permissionCodes);"
    );
    expect(source).not.toContain(
      "session.permissionCodes.includes(permissions.purchaseOrderCancel);"
    );
  });

  test("PO detail receiving link uses the shared receiving access helper", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-orders/[id]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("canUseReceiving");
    expect(source).toContain("@/server/services/authorization");
    expect(source).toContain(
      "const canAccessReceiving = canUseReceiving(session.permissionCodes);"
    );
    expect(source).toContain("canAccessReceiving ? (");
    expect(source).not.toContain(
      "session.permissionCodes.includes(permissions.receivingPost);"
    );
  });

  test("PO detail source links use target module access helpers", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-orders/[id]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("canUsePurchaseRequests");
    expect(source).toContain(
      "const canAccessPurchaseRequests = canUsePurchaseRequests(session.permissionCodes);"
    );
    expect(source).toContain("{canAccessPurchaseRequests ? (");
    expect(source).toContain("View Source PR");
    expect(source).toContain("{canAccessReceiving ? (");
    expect(source).toContain("View Receipt");
  });

  test("allows PO action permissions to read scoped purchase orders", () => {
    expect(canReadPurchaseOrders(["purchasing.purchase_order.view"])).toBe(true);
    expect(canReadPurchaseOrders(["purchasing.purchase_order.create"])).toBe(true);
    expect(canReadPurchaseOrders(["purchasing.purchase_order.submit"])).toBe(true);
    expect(canReadPurchaseOrders(["purchasing.purchase_order.issue"])).toBe(true);
    expect(canReadPurchaseOrders(["purchasing.purchase_order.cancel"])).toBe(true);
    expect(canReadPurchaseOrders(["purchasing.purchase_order.close_remaining"])).toBe(
      true
    );
    expect(canReadPurchaseOrders(["purchasing.purchase_order.amend"])).toBe(true);
    expect(canReadPurchaseOrders(["inventory.receiving.view"])).toBe(false);
  });

  test("requires an approved quotation recommendation before PO creation", () => {
    expect(() => assertApprovedQuotationRecommendationForPo("APPROVED")).not.toThrow();
    expect(() =>
      assertApprovedQuotationRecommendationForPo("PENDING_APPROVAL")
    ).toThrow("QUOTATION_RECOMMENDATION_NOT_APPROVED_FOR_PO");
  });

  test("PO creation metadata reflects the active PO lifecycle", () => {
    const source = readFileSync(path.resolve(__dirname, "purchaseOrders.ts"), "utf8");

    expect(source).toContain("lifecycleEnabled: true");
    expect(source).toContain("supplierCommitmentRequiresIssue: true");
    expect(source).not.toContain("foundationOnly: true");
    expect(source).not.toContain("noSupplierCommitment: true");
  });

  test("PO list page presents the active lifecycle rather than foundation copy", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-orders/page.tsx"),
      "utf8"
    );

    expect(source).toContain(
      "Approved supplier commitments, receiving status, and closure controls"
    );
    expect(source).toContain("<Badge tone=\"info\">Lifecycle</Badge>");
    expect(source).not.toContain("Scoped PO foundation");
    expect(source).not.toContain("<Badge tone=\"info\">Foundation</Badge>");
  });

  test("requires draft status before PO approval submission", () => {
    expect(() => assertPurchaseOrderCanSubmitForApproval("DRAFT")).not.toThrow();
    expect(() => assertPurchaseOrderCanSubmitForApproval("APPROVED")).toThrow(
      "PURCHASE_ORDER_NOT_DRAFT_FOR_APPROVAL"
    );
  });

  test("requires pending approval status before PO approval action", () => {
    expect(() => assertPurchaseOrderCanBeApproved("PENDING_APPROVAL")).not.toThrow();
    expect(() => assertPurchaseOrderCanBeApproved("DRAFT")).toThrow(
      "PURCHASE_ORDER_NOT_PENDING_APPROVAL"
    );
  });

  test("requires approved status before PO issue", () => {
    expect(() => assertPurchaseOrderCanBeIssued("APPROVED")).not.toThrow();
    expect(() => assertPurchaseOrderCanBeIssued("DRAFT")).toThrow(
      "PURCHASE_ORDER_NOT_APPROVED_FOR_ISSUE"
    );
    expect(() => assertPurchaseOrderCanBeIssued("CANCELLED")).toThrow(
      "PURCHASE_ORDER_NOT_APPROVED_FOR_ISSUE"
    );
  });

  test("requires issued status before PO re-send", () => {
    expect(() => assertPurchaseOrderCanBeResent("ISSUED")).not.toThrow();
    expect(() => assertPurchaseOrderCanBeResent("APPROVED")).toThrow(
      "PURCHASE_ORDER_NOT_ISSUED_FOR_RESEND"
    );
  });

  test("allows only configured supplier issue methods", () => {
    for (const method of [
      "Email",
      "Printed copy",
      "Supplier portal",
      "Manual handoff"
    ]) {
      expect(() => assertPurchaseOrderIssueMethodAllowed(method)).not.toThrow();
    }

    expect(() => assertPurchaseOrderIssueMethodAllowed("Text message")).toThrow(
      "PURCHASE_ORDER_ISSUE_METHOD_NOT_ALLOWED"
    );
  });

  test("allows supplier copy only after PO approval and through receiving closure", () => {
    for (const status of [
      "APPROVED",
      "ISSUED",
      "PARTIALLY_RECEIVED",
      "FULLY_RECEIVED",
      "CLOSED"
    ]) {
      expect(() => assertPurchaseOrderCanRenderSupplierCopy(status)).not.toThrow();
    }

    for (const status of ["DRAFT", "PENDING_APPROVAL", "CANCELLED"]) {
      expect(() => assertPurchaseOrderCanRenderSupplierCopy(status)).toThrow(
        "PURCHASE_ORDER_SUPPLIER_COPY_NOT_AVAILABLE"
      );
    }
  });

  test("allows only pre-receiving PO statuses to be cancelled", () => {
    for (const status of ["DRAFT", "APPROVED", "ISSUED"]) {
      expect(() =>
        assertPurchaseOrderCanBeCancelled({
          status,
          receivedQty: 0,
          receiptCount: 0
        })
      ).not.toThrow();
    }

    for (const status of [
      "PENDING_APPROVAL",
      "PARTIALLY_RECEIVED",
      "FULLY_RECEIVED",
      "CANCELLED"
    ]) {
      expect(() =>
        assertPurchaseOrderCanBeCancelled({
          status,
          receivedQty: 0,
          receiptCount: 0
        })
      ).toThrow("PURCHASE_ORDER_NOT_CANCELLABLE");
    }
  });

  test("blocks PO cancellation after received quantities or receipt records exist", () => {
    expect(() =>
      assertPurchaseOrderCanBeCancelled({
        status: "ISSUED",
        receivedQty: 1,
        receiptCount: 0
      })
    ).toThrow("PURCHASE_ORDER_RECEIVED_QUANTITY_BLOCKS_CANCELLATION");

    expect(() =>
      assertPurchaseOrderCanBeCancelled({
        status: "ISSUED",
        receivedQty: 0,
        receiptCount: 1
      })
    ).toThrow("PURCHASE_ORDER_RECEIVING_REPORT_BLOCKS_CANCELLATION");
  });

  test("requires supplier notice evidence before PO balance closure request", () => {
    expect(() => assertSupplierNoticeEvidence("EMAIL-123", null)).not.toThrow();
    expect(() => assertSupplierNoticeEvidence(null, "Supplier unavailable")).not.toThrow();
    expect(() => assertSupplierNoticeEvidence(null, null)).toThrow(
      "PURCHASE_ORDER_CLOSURE_SUPPLIER_NOTICE_REQUIRED"
    );
  });

  test("allows remaining balance closure only for partially received POs with no draft receiving or pending closure", () => {
    expect(() =>
      assertPurchaseOrderCanRequestBalanceClosure({
        status: "PARTIALLY_RECEIVED",
        outstandingQty: 2,
        draftReceiptCount: 0,
        pendingClosureCount: 0
      })
    ).not.toThrow();

    expect(() =>
      assertPurchaseOrderCanRequestBalanceClosure({
        status: "ISSUED",
        outstandingQty: 2,
        draftReceiptCount: 0,
        pendingClosureCount: 0
      })
    ).toThrow("PURCHASE_ORDER_NOT_PARTIALLY_RECEIVED_FOR_CLOSURE");
    expect(() =>
      assertPurchaseOrderCanRequestBalanceClosure({
        status: "PARTIALLY_RECEIVED",
        outstandingQty: 0,
        draftReceiptCount: 0,
        pendingClosureCount: 0
      })
    ).toThrow("PURCHASE_ORDER_NO_REMAINING_BALANCE_TO_CLOSE");
    expect(() =>
      assertPurchaseOrderCanRequestBalanceClosure({
        status: "PARTIALLY_RECEIVED",
        outstandingQty: 2,
        draftReceiptCount: 1,
        pendingClosureCount: 0
      })
    ).toThrow("PURCHASE_ORDER_OPEN_RECEIPT_BLOCKS_CLOSURE");
    expect(() =>
      assertPurchaseOrderCanRequestBalanceClosure({
        status: "PARTIALLY_RECEIVED",
        outstandingQty: 2,
        draftReceiptCount: 0,
        pendingClosureCount: 1
      })
    ).toThrow("PURCHASE_ORDER_CLOSURE_ALREADY_PENDING");
  });

  test("allows amendment only for issued unreceived POs without active closure or amendment", () => {
    expect(() =>
      assertPurchaseOrderCanRequestAmendment({
        status: "ISSUED",
        receivedQty: 0,
        receiptCount: 0,
        pendingClosureCount: 0,
        pendingAmendmentCount: 0
      })
    ).not.toThrow();
    expect(() =>
      assertPurchaseOrderCanRequestAmendment({
        status: "APPROVED",
        receivedQty: 0,
        receiptCount: 0,
        pendingClosureCount: 0,
        pendingAmendmentCount: 0
      })
    ).toThrow("PURCHASE_ORDER_NOT_ISSUED_FOR_AMENDMENT");
    expect(() =>
      assertPurchaseOrderCanRequestAmendment({
        status: "ISSUED",
        receivedQty: 1,
        receiptCount: 0,
        pendingClosureCount: 0,
        pendingAmendmentCount: 0
      })
    ).toThrow("PURCHASE_ORDER_RECEIVED_QUANTITY_BLOCKS_AMENDMENT");
    expect(() =>
      assertPurchaseOrderCanRequestAmendment({
        status: "ISSUED",
        receivedQty: 0,
        receiptCount: 1,
        pendingClosureCount: 0,
        pendingAmendmentCount: 0
      })
    ).toThrow("PURCHASE_ORDER_RECEIVING_REPORT_BLOCKS_AMENDMENT");
    expect(() =>
      assertPurchaseOrderCanRequestAmendment({
        status: "ISSUED",
        receivedQty: 0,
        receiptCount: 0,
        pendingClosureCount: 1,
        pendingAmendmentCount: 0
      })
    ).toThrow("PURCHASE_ORDER_CLOSURE_BLOCKS_AMENDMENT");
    expect(() =>
      assertPurchaseOrderCanRequestAmendment({
        status: "ISSUED",
        receivedQty: 0,
        receiptCount: 0,
        pendingClosureCount: 0,
        pendingAmendmentCount: 1
      })
    ).toThrow("PURCHASE_ORDER_AMENDMENT_ALREADY_PENDING");
  });

  test("builds a bounded amendment proposal without trusting submitted totals", () => {
    const currentLines = [
      {
        id: "00000000-0000-4000-8000-000000000101",
        lineNumber: 1,
        description: "Chicken thigh",
        orderedQty: "10",
        receivedQty: "0",
        cancelledQty: "0",
        unitPrice: "100",
        taxAmount: "0",
        discountAmount: "0",
        lineTotal: "1000",
        notes: "Original",
        uom: { uomCode: "KG" }
      }
    ];

    expect(buildPurchaseOrderAmendmentLineSnapshot(currentLines)).toEqual([
      expect.objectContaining({
        orderedQty: 10,
        unitPrice: 100,
        lineTotal: 1000
      })
    ]);
    expect(
      buildPurchaseOrderAmendmentProposal({
        currentLines,
        proposedLines: [
          {
            purchaseOrderLineId: "00000000-0000-4000-8000-000000000101",
            orderedQty: 12,
            unitPrice: 110,
            notes: "Supplier confirmed increase"
          }
        ],
        expectedDeliveryDate: "2026-07-15"
      })
    ).toEqual(
      expect.objectContaining({
        expectedDeliveryDate: "2026-07-15",
        totals: expect.objectContaining({
          subtotalAmount: 1320,
          totalAmount: 1320
        }),
        lines: [
          expect.objectContaining({
            orderedQty: 12,
            unitPrice: 110,
            lineTotal: 1320
          })
        ]
      })
    );
  });

  test("rejects amendment proposals that add, remove, duplicate, or touch active lines", () => {
    const currentLines = [
      {
        id: "00000000-0000-4000-8000-000000000101",
        lineNumber: 1,
        description: "Chicken thigh",
        orderedQty: "10",
        receivedQty: "0",
        cancelledQty: "0",
        unitPrice: "100",
        taxAmount: "0",
        discountAmount: "0",
        lineTotal: "1000",
        notes: null,
        uom: { uomCode: "KG" }
      }
    ];

    expect(() =>
      buildPurchaseOrderAmendmentProposal({
        currentLines,
        proposedLines: [],
        expectedDeliveryDate: "2026-07-15"
      })
    ).toThrow("PURCHASE_ORDER_AMENDMENT_LINE_SET_MISMATCH");
    expect(() =>
      buildPurchaseOrderAmendmentProposal({
        currentLines: [{ ...currentLines[0]!, receivedQty: "1" }],
        proposedLines: [
          {
            purchaseOrderLineId: "00000000-0000-4000-8000-000000000101",
            orderedQty: 12,
            unitPrice: 110,
            notes: null
          }
        ],
        expectedDeliveryDate: "2026-07-15"
      })
    ).toThrow("PURCHASE_ORDER_LINE_ACTIVITY_BLOCKS_AMENDMENT");
  });

  test("parses amendment line JSON from the server action boundary", () => {
    expect(
      parsePurchaseOrderAmendmentLines(
        JSON.stringify([
          {
            purchaseOrderLineId: "00000000-0000-4000-8000-000000000101",
            orderedQty: "3",
            unitPrice: "25.5",
            notes: " Confirmed "
          }
        ])
      )
    ).toEqual([
      {
        purchaseOrderLineId: "00000000-0000-4000-8000-000000000101",
        orderedQty: 3,
        unitPrice: 25.5,
        notes: "Confirmed"
      }
    ]);
    expect(() => parsePurchaseOrderAmendmentLines("not-json")).toThrow(
      "PURCHASE_ORDER_AMENDMENT_LINES_INVALID"
    );
  });

  test("PO amendment workflow has permission, migration, approval, and UI hooks", () => {
    const authorizationSource = readFileSync(
      path.resolve(__dirname, "authorization.ts"),
      "utf8"
    );
    const approvalSource = readFileSync(
      path.resolve(__dirname, "approvals.ts"),
      "utf8"
    );
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-orders/[id]/page.tsx"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260701090000_purchase_order_amendments/migration.sql"
      ),
      "utf8"
    );

    expect(authorizationSource).toContain("purchasing.purchase_order.amend");
    expect(approvalSource).toContain("PurchaseOrderAmendment");
    expect(approvalSource).toContain("purchase_order.amendment_approved");
    expect(pageSource).toContain("requestPurchaseOrderAmendment");
    expect(pageSource).toContain("Receiving is paused");
    expect(migrationSource).toContain("CREATE TABLE \"PurchaseOrderAmendment\"");
    expect(migrationSource).toContain("PurchaseOrderAmendment");
  });

  test("builds balance closure snapshots from outstanding PO quantities only", () => {
    expect(
      buildPurchaseOrderClosureLineSnapshot([
        {
          id: "po-line-1",
          lineNumber: 1,
          description: "Chicken thigh",
          orderedQty: "10",
          receivedQty: "6",
          cancelledQty: "1",
          unitPrice: "100",
          lineTotal: "1000",
          uom: { uomCode: "KG" }
        },
        {
          id: "po-line-2",
          lineNumber: 2,
          description: "Closed line",
          orderedQty: "4",
          receivedQty: "4",
          cancelledQty: "0",
          unitPrice: "20",
          lineTotal: "80",
          uom: { uomCode: "EA" }
        }
      ])
    ).toEqual([
      expect.objectContaining({
        purchaseOrderLineId: "po-line-1",
        remainingQty: 3,
        closedValue: 300,
        uomCode: "KG"
      })
    ]);

    expect(() =>
      buildPurchaseOrderClosureLineSnapshot([
        {
          id: "po-line-1",
          lineNumber: 1,
          description: "Done",
          orderedQty: "1",
          receivedQty: "1",
          cancelledQty: "0",
          unitPrice: "100",
          lineTotal: "100",
          uom: { uomCode: "KG" }
        }
      ])
    ).toThrow("PURCHASE_ORDER_NO_REMAINING_BALANCE_TO_CLOSE");
  });

  test("normalizes scoped PO list filters", () => {
    expect(
      normalizePurchaseOrderFilters({
        query: "  PO-2026  ",
        status: "PARTIALLY_RECEIVED",
        expectedFrom: "2026-06-01",
        expectedTo: "2026-06-30",
        minAmount: "100.50",
        maxAmount: "500",
        approver: "  Purchasing Manager "
      })
    ).toEqual({
      query: "PO-2026",
      status: "PARTIALLY_RECEIVED",
      expectedFrom: "2026-06-01",
      expectedTo: "2026-06-30",
      minAmount: "100.5",
      maxAmount: "500",
      approver: "Purchasing Manager"
    });

    expect(
      normalizePurchaseOrderFilters({
        query: "   ",
        status: "SENT",
        expectedFrom: "",
        expectedTo: "",
        minAmount: "-1",
        maxAmount: "not-a-number",
        approver: " "
      })
    ).toEqual({
      query: undefined,
      status: undefined,
      expectedFrom: undefined,
      expectedTo: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      approver: undefined
    });
  });

  test("builds immutable PO line snapshots from selected supplier quote lines", () => {
    const lines = buildPurchaseOrderLineSnapshots([
      {
        id: "quote-line-1",
        sourcePrLineId: "pr-line-1",
        itemId: "item-1",
        quantity: "3",
        uomId: "uom-1",
        unitPrice: "120.5",
        lineTotal: "361.5",
        availabilityStatus: "AVAILABLE",
        leadTimeDays: 2,
        notes: null,
        sourcePrLine: {
          lineNumber: 7,
          description: "Chicken thigh",
          purpose: "Branch replenishment",
          notes: "Keep chilled"
        },
        item: { itemName: "Chicken Thigh" },
        uom: { uomCode: "KG" }
      }
    ]);

    expect(lines).toEqual([
      expect.objectContaining({
        sourceSupplierQuoteLineId: "quote-line-1",
        sourcePrLineId: "pr-line-1",
        itemId: "item-1",
        lineNumber: 7,
        description: "Chicken Thigh",
        orderedQty: 3,
        unitPrice: 120.5,
        lineTotal: 361.5,
        uomCode: "KG"
      })
    ]);
  });

  test("calculates totals from server-side line snapshots", () => {
    expect(
      calculatePurchaseOrderTotals([
        { lineTotal: 100, taxAmount: 12, discountAmount: 5 },
        { lineTotal: 50, taxAmount: 6, discountAmount: 0 }
      ])
    ).toEqual({
      subtotalAmount: 150,
      taxAmount: 18,
      discountAmount: 5,
      totalAmount: 163
    });
  });

  test("summarizes PO fulfillment quantities and values for reporting", () => {
    expect(
      summarizePurchaseOrderFulfillment([
        {
          orderedQty: "10",
          receivedQty: "6",
          cancelledQty: "3",
          unitPrice: "100"
        },
        {
          orderedQty: "4",
          receivedQty: "4",
          cancelledQty: "0",
          unitPrice: "25"
        }
      ])
    ).toEqual({
      orderedQty: 14,
      receivedQty: 10,
      cancelledQty: 3,
      openQty: 1,
      receivedValue: 700,
      cancelledValue: 300,
      openValue: 100
    });
  });

  test("classifies delivery aging only for issued and partially received POs", () => {
    expect(
      classifyPurchaseOrderDeliveryAging({
        status: "ISSUED",
        expectedDeliveryDate: "2026-06-29",
        today: "2026-06-29"
      })
    ).toEqual({ deliveryAgingStatus: "DUE_TODAY", daysOverdue: 0 });
    expect(
      classifyPurchaseOrderDeliveryAging({
        status: "PARTIALLY_RECEIVED",
        expectedDeliveryDate: "2026-06-27",
        today: "2026-06-29"
      })
    ).toEqual({ deliveryAgingStatus: "OVERDUE", daysOverdue: 2 });
    expect(
      classifyPurchaseOrderDeliveryAging({
        status: "ISSUED",
        expectedDeliveryDate: "2026-07-01",
        today: "2026-06-29"
      })
    ).toEqual({ deliveryAgingStatus: "UPCOMING", daysOverdue: 0 });
    expect(
      classifyPurchaseOrderDeliveryAging({
        status: "CLOSED",
        expectedDeliveryDate: "2026-06-27",
        today: "2026-06-29"
      })
    ).toEqual({ deliveryAgingStatus: "NOT_APPLICABLE", daysOverdue: 0 });
  });

  test("blocks empty or invalid quote-line snapshots", () => {
    expect(() => buildPurchaseOrderLineSnapshots([])).toThrow(
      "SUPPLIER_QUOTE_LINE_NOT_FOUND"
    );
    expect(() =>
      buildPurchaseOrderLineSnapshots([
        {
          id: "quote-line-1",
          sourcePrLineId: null,
          itemId: null,
          quantity: "0",
          uomId: "uom-1",
          unitPrice: "10",
          lineTotal: "0",
          availabilityStatus: "AVAILABLE",
          leadTimeDays: null,
          notes: null
        }
      ])
    ).toThrow("PURCHASE_ORDER_LINE_QUANTITY_INVALID");
  });
});
