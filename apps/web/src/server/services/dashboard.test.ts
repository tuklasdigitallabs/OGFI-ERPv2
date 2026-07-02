import { describe, expect, it } from "vitest";
import { buildOperationalDashboardModel } from "./dashboard";
import type { SessionContext } from "./context";

const session: SessionContext = {
  user: {
    id: "user-1",
    email: "branch@example.test",
    displayName: "Branch User",
    role: "Branch Manager"
  },
  context: {
    tenantId: "tenant-1",
    companyId: "company-1",
    companyName: "OGFI",
    brandId: "brand-1",
    brandName: "Demo Brand",
    locationId: "location-1",
    locationName: "Selected Branch",
    locationType: "BRANCH"
  },
  authorizedLocations: [],
  permissionCodes: []
};

describe("operational dashboard model", () => {
  it("only renders widgets for supplied authorized source records", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      purchaseRequests: [
        { id: "pr-1", publicReference: "PR-001", status: "PENDING_APPROVAL" },
        { id: "pr-2", publicReference: "PR-002", status: "APPROVED" },
        { id: "pr-3", publicReference: "PR-003", status: "CANCELLED" }
      ] as never
    });

    expect(dashboard.scope.locationName).toBe("Selected Branch");
    expect(dashboard.cards.map((card) => card.id)).toEqual([
      "open-purchase-requests"
    ]);
    expect(dashboard.cards[0]).toMatchObject({
      label: "Open PRs",
      value: 2,
      href: "/purchase-requests",
      tone: "warning"
    });
  });

  it("uses the filtered approval queue instead of raw approval counts", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      approvals: [
        {
          approvalInstanceId: "approval-1",
          documentType: "PurchaseRequest",
          documentId: "pr-1",
          publicReference: "PR-001",
          requesterName: "Requester",
          locationName: "Selected Branch",
          requiredDate: "2026-06-30",
          status: "PENDING_APPROVAL",
          currentStepOrder: 1,
          lineDescription: "Rice"
        }
      ]
    });

    expect(dashboard.cards[0]).toMatchObject({
      id: "pending-approvals",
      value: 1,
      href: "/approvals"
    });
    expect(dashboard.approvalQueue).toEqual([
      {
        id: "approval-1",
        label: "PurchaseRequest",
        reference: "PR-001",
        detail: "Requester / Selected Branch",
        status: "PENDING_APPROVAL",
        href: "/approvals/approval-1",
        tone: "warning"
      }
    ]);
  });

  it("surfaces source-linked exceptions without creating dashboard state", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      purchaseOrders: [
        {
          id: "po-1",
          publicReference: "PO-001",
          supplierName: "Demo Supplier",
          status: "ISSUED",
          deliveryAgingStatus: "OVERDUE",
          daysOverdue: 2
        }
      ] as never,
      goodsReceipts: [
        {
          id: "grn-1",
          publicReference: "GRN-001",
          purchaseOrderReference: "PO-001",
          supplierName: "Demo Supplier",
          status: "POSTED_WITH_DISCREPANCY",
          discrepancyFlag: true
        }
      ] as never,
      reconciliation: {
        totalRows: 3,
        matchedRows: 2,
        varianceRows: 1,
        rows: [
          {
            key: "loc-1|item-1|none",
            inventoryLocationName: "Branch Stock",
            locationName: "Selected Branch",
            itemCode: "RICE",
            itemName: "Rice",
            lotNumber: null,
            expiryDate: null,
            baseUomCode: "KG",
            balanceQuantity: 5,
            ledgerQuantity: 4,
            varianceQuantity: 1,
            status: "VARIANCE"
          }
        ]
      }
    });

    expect(
      dashboard.cards.map((card) => [card.id, card.value, card.href])
    ).toEqual([
      ["open-purchase-orders", 1, "/purchase-orders"],
      ["receiving-variance", 1, "/receiving"],
      ["ledger-reconciliation", 1, "/inventory"]
    ]);
    expect(dashboard.exceptionQueue.map((item) => item.href)).toEqual([
      "/purchase-orders/po-1",
      "/receiving/grn-1",
      "/inventory"
    ]);
  });

  it("includes implemented follow-up records for PO amendments, wastage, and adjustments", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      purchaseOrders: [
        {
          id: "po-2",
          publicReference: "PO-002",
          supplierName: "Demo Supplier",
          status: "AMENDMENT_PENDING",
          deliveryAgingStatus: "NOT_APPLICABLE",
          daysOverdue: 0
        }
      ] as never,
      wastageReports: [
        {
          id: "waste-1",
          publicReference: "WR-001",
          status: "PENDING_APPROVAL",
          inventoryLocationName: "Branch Stock",
          evidenceRequired: true,
          evidenceSatisfied: false,
          lineCount: 1
        }
      ] as never,
      stockAdjustments: [
        {
          id: "adjustment-1",
          publicReference: "SA-001",
          status: "APPROVED",
          inventoryLocationName: "Branch Stock",
          adjustmentType: "DECREASE",
          lineCount: 2
        }
      ] as never
    });

    expect(dashboard.cards.map((card) => [card.id, card.value])).toEqual([
      ["open-purchase-orders", 1],
      ["wastage-exceptions", 1],
      ["adjustment-exceptions", 1]
    ]);
    expect(dashboard.exceptionQueue).toEqual([
      expect.objectContaining({
        id: "wastage-waste-1",
        label: "Wastage evidence",
        href: "/wastage/waste-1"
      }),
      expect.objectContaining({
        id: "adjustment-adjustment-1",
        label: "Adjustment follow-up",
        href: "/adjustments/adjustment-1"
      })
    ]);
  });

  it("covers every Phase 1 operational visibility lane without replacing source records", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      approvals: [
        {
          approvalInstanceId: "approval-1",
          documentType: "PurchaseRequest",
          documentId: "pr-1",
          publicReference: "PR-001",
          requesterName: "Requester",
          locationName: "Selected Branch",
          requiredDate: "2026-06-30",
          status: "PENDING_APPROVAL",
          currentStepOrder: 1,
          lineDescription: "Rice"
        }
      ],
      purchaseRequests: [
        { id: "pr-1", publicReference: "PR-001", status: "PENDING_APPROVAL" }
      ] as never,
      purchaseOrders: [
        {
          id: "po-1",
          publicReference: "PO-001",
          supplierName: "Demo Supplier",
          status: "ISSUED",
          deliveryAgingStatus: "NOT_APPLICABLE",
          daysOverdue: 0
        }
      ] as never,
      goodsReceipts: [
        {
          id: "grn-1",
          publicReference: "GRN-001",
          purchaseOrderReference: "PO-001",
          supplierName: "Demo Supplier",
          status: "POSTED_WITH_DISCREPANCY",
          discrepancyFlag: true
        }
      ] as never,
      transfers: [
        {
          id: "transfer-1",
          publicReference: "TR-001",
          status: "DISPUTED",
          sourceLocationName: "Main Warehouse",
          destinationLocationName: "Selected Branch"
        }
      ] as never,
      stockCounts: [
        {
          id: "count-1",
          publicReference: "SC-001",
          status: "REVIEWED",
          inventoryLocationName: "Branch Stock",
          varianceCount: 2
        }
      ] as never,
      wastageReports: [
        {
          id: "waste-1",
          publicReference: "WR-001",
          status: "APPROVED",
          inventoryLocationName: "Branch Stock",
          evidenceRequired: false,
          evidenceSatisfied: true,
          lineCount: 1
        }
      ] as never,
      stockAdjustments: [
        {
          id: "adjustment-1",
          publicReference: "SA-001",
          status: "RETURNED",
          inventoryLocationName: "Branch Stock",
          adjustmentType: "INCREASE",
          lineCount: 1
        }
      ] as never,
      reconciliation: {
        totalRows: 1,
        matchedRows: 0,
        varianceRows: 1,
        rows: [
          {
            key: "loc-1|item-1|none",
            inventoryLocationName: "Branch Stock",
            locationName: "Selected Branch",
            itemCode: "TOMATO",
            itemName: "Tomato",
            lotNumber: null,
            expiryDate: null,
            baseUomCode: "KG",
            balanceQuantity: 12,
            ledgerQuantity: 11,
            varianceQuantity: 1,
            status: "VARIANCE"
          }
        ]
      }
    });

    expect(dashboard.cards.map((card) => card.id)).toEqual([
      "pending-approvals",
      "open-purchase-requests",
      "open-purchase-orders",
      "receiving-variance",
      "transfer-follow-up",
      "count-variance",
      "wastage-exceptions",
      "adjustment-exceptions",
      "ledger-reconciliation"
    ]);
    expect(
      dashboard.exceptionQueue.map((item) => [item.label, item.href])
    ).toEqual([
      ["Receiving discrepancy", "/receiving/grn-1"],
      ["Transfer follow-up", "/transfers/transfer-1"],
      ["Count variance", "/counts/count-1"],
      ["Wastage follow-up", "/wastage/waste-1"],
      ["Adjustment follow-up", "/adjustments/adjustment-1"],
      ["Ledger variance", "/inventory"]
    ]);
  });
});
