import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOperationalDashboardModel } from "./dashboard";
import type { SessionContext } from "./context";

const dashboardPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/dashboard/page.tsx"),
  "utf8"
);

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
    const dashboard = buildOperationalDashboardModel(
      { ...session, permissionCodes: ["inventory.stock_count.review"] },
      {
      purchaseRequests: [
        { id: "pr-1", publicReference: "PR-001", status: "PENDING_APPROVAL" },
        { id: "pr-2", publicReference: "PR-002", status: "APPROVED" },
        { id: "pr-3", publicReference: "PR-003", status: "CANCELLED" }
      ] as never
      }
    );

    expect(dashboard.scope.locationName).toBe("Selected Branch");
    expect(dashboard.cards.map((card) => card.id)).toEqual([
      "open-purchase-requests"
    ]);
    expect(dashboard.cards[0]).toMatchObject({
      label: "Open PRs",
      value: 2,
      href: "/purchase-requests?dashboard=purchase-request-open-v1",
      tone: "warning"
    });
  });

  it("does not render Count Variance data for a non-reviewer even if a source is supplied", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      stockCountDashboard: {
        varianceCount: 2,
        taskCandidates: [{
          id: "count-1",
          publicReference: "SC-001",
          status: "SUBMITTED",
          inventoryLocationName: "Branch Stock",
          varianceLineCount: 2,
          createdAt: "2026-07-20T00:00:00.000Z"
        }]
      }
    });

    expect(dashboard.cards.some((card) => card.id === "count-variance")).toBe(false);
    expect(dashboard.exceptionQueue.some((item) => item.id === "count-count-1")).toBe(false);
  });

  it("links Transfer Follow-up to its closed server-owned profile", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      transfers: [
        { id: "transfer-1", publicReference: "TR-001", status: "REQUESTED" },
      ] as never,
    });

    expect(dashboard.cards).toContainEqual(
      expect.objectContaining({
        id: "transfer-follow-up",
        href: "/transfers?dashboard=transfer-follow-up-v1",
      }),
    );
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
        tone: "warning",
        nextAction: "Review assigned approval",
        nextActor: "Branch User"
      }
    ]);
  });

  it("exposes a bounded, deterministically ordered approval queue contract", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      approvals: [
        "AP-006",
        "AP-005",
        "AP-004",
        "AP-003",
        "AP-002",
        "AP-001"
      ].map((publicReference, index) => ({
        approvalInstanceId: `approval-${index + 1}`,
        documentType: "PurchaseRequest",
        documentId: `pr-${index + 1}`,
        publicReference,
        requesterName: "Requester",
        locationName: "Selected Branch",
        requiredDate: index === 0 ? "2020-01-01" : "2099-01-01",
        status: "PENDING_APPROVAL",
        currentStepOrder: 1,
        lineDescription: "Rice"
      }))
    });

    expect(dashboard.approvalQueue).toHaveLength(5);
    expect(dashboard.approvalQueueContract).toMatchObject({
      totalCount: 6,
      displayedCount: 5,
      displayLimit: 5
    });
    expect(
      dashboard.approvalQueueContract.items.map((item) => item.reference)
    ).toEqual(["AP-006", "AP-001", "AP-002", "AP-003", "AP-004"]);
    expect(dashboard.approvalQueueContract.items[0]).toMatchObject({
      priority: "HIGH",
      severityLabel: "No severity reported",
      locationName: "Selected Branch",
      ageLabel: "Overdue since 2020-01-01",
      ownerLabel: "Branch User",
      href: "/approvals/approval-1"
    });
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
      ["open-purchase-orders", 1, "/purchase-orders?dashboard=po-open-v1"],
      ["receiving-variance", 1, "/receiving"],
      ["ledger-reconciliation", 1, "/inventory"]
    ]);
    expect(dashboard.exceptionQueue.map((item) => item.href)).toEqual([
      "/purchase-orders/po-1",
      "/receiving/grn-1",
      "/inventory"
    ]);
  });

  it("blocks reconciliation-dependent dashboard values when the trust gate requires blocking", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      dashboardTrustGate: {
        key: "reporting.dashboard.unreconciled_mode",
        mode: "block",
        label: "Block metric until reconciled",
        isOverridden: true,
        sourceDecisionId: "DEC-0036"
      },
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

    expect(dashboard.trustGate).toMatchObject({
      mode: "block",
      label: "Block metric until reconciled",
      isOverridden: true
    });
    expect(dashboard.cards.map((card) => card.id)).not.toContain(
      "ledger-reconciliation"
    );
    expect(dashboard.exceptionQueue.map((item) => item.label)).not.toContain(
      "Ledger variance"
    );
    expect(dashboard.sourceHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ledger-reconciliation-blocked",
          displayValue: "Blocked by trust gate",
          href: "/inventory",
          tone: "warning"
        })
      ])
    );
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
    const dashboard = buildOperationalDashboardModel(
      { ...session, permissionCodes: ["inventory.stock_count.review"] },
      {
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
      }
    );

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

  it("surfaces Phase 2 restaurant operations from source dashboards", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      foodCostAnalysis: {
        businessDate: "2026-07-03",
        locationName: "Selected Branch",
        salesImportBatches: 1,
        quantitySold: 120,
        netSalesAmount: 54000,
        theoreticalCost: 16200,
        theoreticalFoodCostPercent: 30,
        actualCost: null,
        varianceAmount: null,
        variancePercent: null,
        actualMovementCount: 0,
        actualCostSource: "No scoped actual ledger movements found",
        statusCounts: {
          WITHIN_TARGET: 0,
          ABOVE_TARGET: 1,
          MISSING_COST: 0,
          AWAITING_ACTUALS: 1
        },
        actualConsumptionRows: [],
        rows: [
          {
            menuItemId: "menu-1",
            menuItemName: "Karubi Set",
            recipeName: "Karubi Set Recipe",
            quantitySold: 120,
            netSalesAmount: 54000,
            theoreticalCost: 16200,
            theoreticalFoodCostPercent: 30,
            targetFoodCostPercent: 28,
            actualCost: null,
            varianceAmount: null,
            variancePercent: null,
            status: "ABOVE_TARGET"
          },
          {
            menuItemId: "menu-2",
            menuItemName: "Chicken Set",
            recipeName: "Chicken Set Recipe",
            quantitySold: 80,
            netSalesAmount: 32000,
            theoreticalCost: 9000,
            theoreticalFoodCostPercent: 28.12,
            targetFoodCostPercent: null,
            actualCost: null,
            varianceAmount: null,
            variancePercent: null,
            status: "AWAITING_ACTUALS"
          }
        ]
      },
      branchOperations: {
        locationName: "Selected Branch",
        businessDate: "2026-07-03",
        totalChecklists: 2,
        completedChecklists: 1,
        openExceptions: 1,
        criticalExceptions: 1,
        statusCounts: {
          DRAFT: 0,
          IN_PROGRESS: 0,
          EXCEPTION_OPEN: 0,
          MANAGER_REVIEW: 0,
          SUBMITTED: 1,
          RETURNED: 0,
          REVIEWED: 0,
          CLOSED: 0
        },
        severityCounts: {
          CRITICAL: 1,
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0,
          NORMAL: 0
        },
        averageCompletionPercent: 87.5,
        checklists: [
          {
            id: "checklist-1",
            checklistName: "Opening Checklist",
            locationName: "Selected Branch",
            businessDate: "2026-07-03",
            shiftType: "OPENING",
            status: "SUBMITTED",
            openedByName: "Branch Opener",
            submittedByName: "Shift Lead",
            reviewedByName: null,
            reviewedAt: null,
            exceptionCount: 1,
            completionPercent: 87.5,
            lines: [
              {
                id: "line-1",
                lineNo: 1,
                area: "Dining",
                checkName: "Floor ready",
                expectedResult: "Clean",
                result: "EXCEPTION",
                severity: "CRITICAL",
                evidenceReference: null,
                notes: null
              }
            ]
          }
        ]
      },
      foodSafety: {
        locationName: "Selected Branch",
        businessDate: "2026-07-03",
        totalLogs: 1,
        reviewedLogs: 0,
        totalReadings: 4,
        exceptionCount: 1,
        criticalExceptions: 0,
        statusCounts: {
          DRAFT: 0,
          IN_PROGRESS: 0,
          SUBMITTED: 1,
          RETURNED: 0,
          REVIEWED: 0,
          CLOSED: 0,
          EXCEPTION_OPEN: 0,
          EXCEPTION_REVIEW: 0
        },
        severityCounts: {
          CRITICAL: 0,
          HIGH: 1,
          MEDIUM: 0,
          LOW: 0,
          NORMAL: 0
        },
        logs: [
          {
            id: "safety-1",
            title: "Opening Temperature Log",
            locationName: "Selected Branch",
            businessDate: "2026-07-03",
            logType: "TEMPERATURE",
            status: "SUBMITTED",
            recordedByName: "Food Safety Clerk",
            reviewedByName: null,
            reviewedAt: null,
            exceptionCount: 1,
            readings: []
          }
        ]
      },
      incidents: {
        locationName: "Selected Branch",
        totalIncidents: 1,
        openIncidents: 1,
        criticalIncidents: 1,
        overdueIncidents: 0,
        statusCounts: {
          OPEN: 1,
          IN_PROGRESS: 0,
          PENDING_REVIEW: 0,
          RESOLVED: 0,
          CANCELLED: 0
        },
        severityCounts: {
          CRITICAL: 1,
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0
        },
        incidents: [
          {
            id: "incident-1",
            incidentNumber: "INC-001",
            incidentDate: "2026-07-03",
            category: "SERVICE",
            severity: "CRITICAL",
            status: "OPEN",
            title: "Guest complaint escalation",
            summary: "Escalated issue",
            locationName: "Selected Branch",
            reportedByName: "Service Lead",
            ownerName: "Operations Manager",
            sourceRecordType: null,
            sourceRecordId: null,
            correctiveAction: null,
            evidenceReference: null,
            dueAt: null,
            resolvedAt: null
          }
        ]
      },
      maintenance: {
        locationName: "Selected Branch",
        totalTickets: 1,
        openTickets: 1,
        criticalTickets: 0,
        overdueTickets: 0,
        downtimeMinutes: 45,
        statusCounts: {
          OPEN: 1,
          IN_PROGRESS: 0,
          PENDING_VENDOR: 0,
          COMPLETED: 0,
          CANCELLED: 0
        },
        priorityCounts: {
          CRITICAL: 1,
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0
        },
        tickets: [
          {
            id: "ticket-1",
            ticketNumber: "MT-001",
            requestedAt: "2026-07-03",
            category: "EQUIPMENT",
            assetName: "Grill table 4",
            assetArea: "Dining",
            priority: "HIGH",
            status: "OPEN",
            title: "Ignition issue",
            description: "Pilot not lighting",
            locationName: "Selected Branch",
            reportedByName: "Branch Manager",
            ownerName: "Maintenance Lead",
            sourceIncidentId: null,
            downtimeMinutes: 45,
            targetDueAt: null,
            completedAt: null,
            correctiveAction: null,
            evidenceReference: null
          }
        ]
      }
    });

    expect(
      dashboard.cards.map((card) => [card.id, card.value, card.href])
    ).toEqual([
      ["food-cost-exceptions", 1, "/recipes/analysis"],
      ["branch-checklist-exceptions", 1, "/branch-operations"],
      ["branch-checklist-reviews", 1, "/branch-operations"],
      ["food-safety-exceptions", 1, "/food-safety"],
      ["food-safety-reviews", 1, "/food-safety"],
      ["open-operational-incidents", 1, "/incidents"],
      ["maintenance-follow-up", 1, "/maintenance"]
    ]);
    expect(dashboard.metrics.map((metric) => metric.id)).toContain(
      "restaurant-net-sales"
    );
    expect(dashboard.metrics.map((metric) => metric.id)).toEqual(
      expect.arrayContaining([
        "food-cost-above-target",
        "food-cost-missing-cost",
        "food-cost-awaiting-actuals",
        "branch-critical-exception-count",
        "branch-manager-review-count",
        "branch-reviewed-count",
        "food-safety-critical-count",
        "food-safety-exception-review-count",
        "food-safety-reviewed-count"
      ])
    );
    expect(dashboard.metrics.map((metric) => metric.id)).toEqual(
      expect.arrayContaining([
        "incident-critical-count",
        "incident-pending-review-count",
        "incident-overdue-count",
        "maintenance-critical-count",
        "maintenance-vendor-count",
        "maintenance-overdue-count"
      ])
    );
    expect(
      dashboard.metrics
        .filter((metric) =>
          [
            "food-cost-above-target",
            "food-cost-missing-cost",
            "food-cost-awaiting-actuals"
          ].includes(metric.id)
        )
        .map((metric) => [metric.id, metric.displayValue])
    ).toEqual([
      ["food-cost-above-target", "1"],
      ["food-cost-missing-cost", "0"],
      ["food-cost-awaiting-actuals", "1"]
    ]);
    expect(
      dashboard.exceptionQueue.map((item) => [item.label, item.href])
    ).toEqual([
      ["Actual ledger pending", "/recipes/analysis"],
      ["Food cost follow-up", "/recipes/analysis"],
      ["Checklist review", "/branch-operations/checklist-1"],
      ["Checklist exception", "/branch-operations/checklist-1"],
      ["Food safety review", "/food-safety/safety-1"],
      ["Food safety exception", "/food-safety/safety-1"],
      ["Incident follow-up", "/incidents/incident-1"],
      ["Maintenance follow-up", "/maintenance/ticket-1"]
    ]);
    expect(
      dashboard.exceptionQueue.map((item) => [item.label, item.nextAction])
    ).toEqual([
      ["Actual ledger pending", "Review actual ledger evidence"],
      ["Food cost follow-up", "Review recipe cost and sales evidence"],
      ["Checklist review", "Review checklist"],
      ["Checklist exception", "Investigate checklist exception"],
      ["Food safety review", "Review food-safety log"],
      ["Food safety exception", "Acknowledge food-safety deviation"],
      ["Incident follow-up", "Assign or resolve incident"],
      ["Maintenance follow-up", "Update or complete ticket"]
    ]);
    expect(dashboard.sourceHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "dashboard-trust-gate",
          displayValue: "Show warning and source link"
        })
      ])
    );
    expect(dashboard.sourceHealth.find((metric) => metric.id === "sales-source")).toMatchObject({
      id: "sales-source",
      displayValue: "Import source live",
      href: "/recipes/analysis"
    });
  });

  it("keeps incident and maintenance report shortcuts routed to their own sources", () => {
    expect(dashboardPageSource).toContain("Incident Corrective Actions");
    expect(dashboardPageSource).toContain('href: "/incidents"');
    expect(dashboardPageSource).toContain("Maintenance SLA and Downtime");
    expect(dashboardPageSource).toContain('href: "/maintenance"');
    expect(dashboardPageSource).toContain("item.nextAction ?? actionLabel");
    expect(dashboardPageSource).toContain("Assigned to: {item.nextActor}");
    expect(dashboardPageSource).not.toContain("Incidents and Maintenance");
  });

  it("uses an explicit Approval Inbox state instead of a misleading empty approval preview", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      approvalPreviewUnavailable: true,
    });

    expect(dashboard.approvalQueue).toEqual([]);
    expect(dashboard.approvalQueueContract).toMatchObject({
      availability: "UNAVAILABLE",
      totalCount: 0,
      displayedCount: 0,
      unavailableDetail: expect.stringContaining("Approval Inbox"),
    });
    const dashboardServiceSource = readFileSync(
      path.resolve(__dirname, "dashboard.ts"),
      "utf8",
    );
    expect(dashboardServiceSource).not.toContain("listPendingApprovals");
    expect(dashboardPageSource).toContain("Approval preview is temporarily unavailable");
    expect(dashboardPageSource).toContain("Open Approval Inbox");
  });

  it("uses the bounded Branch Operations read instead of the full checklist workspace read", () => {
    const dashboardServiceSource = readFileSync(
      path.resolve(__dirname, "dashboard.ts"),
      "utf8",
    );

    expect(dashboardServiceSource).toContain("getBranchOperationsDashboardRead(session)");
    expect(dashboardServiceSource).not.toContain("getBranchOperationsDashboard(session)");
  });

  it("reports each unavailable dashboard source without exposing an internal failure", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      unavailableSources: [
        { id: "receiving", label: "Receiving", href: "/receiving" },
      ],
    });

    expect(dashboard.sourceHealth).toContainEqual(
      expect.objectContaining({
        id: "dashboard-source-unavailable-receiving",
        label: "Receiving summary",
        displayValue: "Unavailable",
        href: "/receiving",
      }),
    );
    expect(dashboard.sourceHealth.find((metric) => metric.id === "dashboard-source-unavailable-receiving")?.detail)
      .not.toContain("Error");
  });
});
