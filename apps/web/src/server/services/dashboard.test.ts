import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOperationalDashboardModel,
  DashboardSourceAdmissionController,
  dashboardRuntimeTestSupport,
  dashboardDueState,
  dashboardOperationalDate,
  getDashboardSourceDeadlineMs,
  getDashboardSourceMaxInFlight,
  getOperationalDashboardSourceDescriptors,
  type DashboardTelemetryEvent,
  type DashboardSourceDescriptor
} from "./dashboard";
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

const warnTrustGate = {
  key: "reporting.dashboard.unreconciled_mode",
  mode: "warn_and_link" as const,
  label: "Show warning and source link",
  isOverridden: false,
  sourceDecisionId: "DEC-0036"
};

const silentTelemetry = () => undefined;
const {
  collectDashboardSources,
  emitDashboardAssemblyTelemetry
} = dashboardRuntimeTestSupport;

describe("operational dashboard model", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("validates the bounded deployment deadline", () => {
    expect(getDashboardSourceDeadlineMs({})).toBe(2_500);
    expect(getDashboardSourceDeadlineMs({ DASHBOARD_SOURCE_DEADLINE_MS: "3000" }))
      .toBe(3_000);
    expect(() =>
      getDashboardSourceDeadlineMs({ DASHBOARD_SOURCE_DEADLINE_MS: "3001" })
    ).toThrow("DASHBOARD_SOURCE_DEADLINE_MS_INVALID");
    expect(() =>
      getDashboardSourceDeadlineMs({ DASHBOARD_SOURCE_DEADLINE_MS: "invalid" })
    ).toThrow("DASHBOARD_SOURCE_DEADLINE_MS_INVALID");
    expect(getDashboardSourceMaxInFlight({})).toBe(32);
    expect(getDashboardSourceMaxInFlight({ DASHBOARD_SOURCE_MAX_IN_FLIGHT: "64" }))
      .toBe(64);
    expect(() =>
      getDashboardSourceMaxInFlight({ DASHBOARD_SOURCE_MAX_IN_FLIGHT: "65" })
    ).toThrow("DASHBOARD_SOURCE_MAX_IN_FLIGHT_INVALID");
  });

  it("omits unauthorized source descriptors and keeps authorized reads lazy", () => {
    const descriptors = getOperationalDashboardSourceDescriptors(session);

    expect(descriptors.map((descriptor) => descriptor.id)).toEqual(["trust-gate"]);
    expect(descriptors[0]?.read).toEqual(expect.any(Function));
  });

  it("closes a never-settling source at its deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T00:00:00.000Z"));
    const read = vi.fn(() => new Promise<never>(() => undefined));
    const descriptor: DashboardSourceDescriptor = {
      id: "receiving",
      label: "Receiving Follow-up",
      href: "/receiving",
      read
    };

    const pending = collectDashboardSources([descriptor], 2_500, {
      admissionController: new DashboardSourceAdmissionController(1),
      telemetry: silentTelemetry
    });
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_500);

    await expect(pending).resolves.toMatchObject({
      sourceObservations: [{
        id: "receiving",
        availability: "UNAVAILABLE",
        checkedAt: "2026-07-23T00:00:02.500Z"
      }],
      unavailableSources: [{ id: "receiving", label: "Receiving Follow-up" }]
    });
    expect(read).toHaveBeenCalledOnce();
  });

  it("does not let a late fulfillment mutate the settled response", async () => {
    vi.useFakeTimers();
    let resolveRead: ((value: { patch: { approvalPreviewUnavailable: boolean } }) => void) |
      undefined;
    const read = vi.fn(() => new Promise<{ patch: { approvalPreviewUnavailable: boolean } }>(
      (resolve) => { resolveRead = resolve; }
    ));
    const pending = collectDashboardSources([{
      id: "approvals",
      label: "Approvals",
      href: "/approvals",
      read
    }], 100, {
      admissionController: new DashboardSourceAdmissionController(1),
      telemetry: silentTelemetry
    });
    await vi.advanceTimersByTimeAsync(100);
    const settled = await pending;

    resolveRead?.({ patch: { approvalPreviewUnavailable: true } });
    await Promise.resolve();

    expect(settled.approvalPreviewUnavailable).toBeUndefined();
    expect(settled.sourceObservations).toEqual([
      expect.objectContaining({ id: "approvals", availability: "UNAVAILABLE" })
    ]);
  });

  it("distinguishes successful zero data from unavailable and limits dataAsOf provenance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T01:00:00.000Z"));
    const source = await collectDashboardSources([
      {
        id: "inventory-balances",
        label: "Inventory balances",
        href: "/inventory",
        read: async () => ({
          patch: {
            inventoryBalanceDashboard: {
              totalRows: 0,
              positiveRows: 0,
              zeroRows: 0,
              lotExpiryTrackedRows: 0,
              recentlyUpdatedRows: 0
            }
          },
          dataAsOf: "2026-07-22T23:00:00.000Z"
        })
      },
      {
        id: "inventory-reconciliation",
        label: "Ledger reconciliation",
        href: "/inventory/reconciliation",
        read: async () => ({
          patch: {},
          dataAsOf: "2026-07-22T23:30:00.000Z"
        })
      },
      {
        id: "receiving",
        label: "Receiving",
        href: "/receiving",
        read: async () => { throw new Error("database password must stay private"); }
      }
    ], 2_500, {
      admissionController: new DashboardSourceAdmissionController(3),
      telemetry: silentTelemetry
    });

    expect(source.sourceObservations).toEqual([
      {
        id: "inventory-balances",
        label: "Inventory balances",
        href: "/inventory",
        availability: "AVAILABLE",
        checkedAt: "2026-07-23T01:00:00.000Z"
      },
      {
        id: "inventory-reconciliation",
        label: "Ledger reconciliation",
        href: "/inventory/reconciliation",
        availability: "AVAILABLE",
        checkedAt: "2026-07-23T01:00:00.000Z",
        dataAsOf: "2026-07-22T23:30:00.000Z"
      },
      {
        id: "receiving",
        label: "Receiving",
        href: "/receiving",
        availability: "UNAVAILABLE",
        checkedAt: "2026-07-23T01:00:00.000Z"
      }
    ]);
    expect(JSON.stringify(source)).not.toContain("database password");
    const dashboard = buildOperationalDashboardModel(session, source);
    expect(dashboard.metrics).toContainEqual(
      expect.objectContaining({ id: "stocked-items", displayValue: "0" })
    );
    expect(dashboard.sourceObservations[0]).toMatchObject({
      id: "inventory-balances",
      availability: "AVAILABLE"
    });
  });

  it("bounds timed-out underlying work until it actually settles", async () => {
    vi.useFakeTimers();
    const admissionController = new DashboardSourceAdmissionController(2);
    const events: DashboardTelemetryEvent[] = [];
    const resolvers: Array<(value: { patch: Record<string, never> }) => void> = [];
    const read = vi.fn(
      () => new Promise<{ patch: Record<string, never> }>((resolve) => {
        resolvers.push(resolve);
      })
    );
    const descriptors: DashboardSourceDescriptor[] = [
      { id: "receiving", label: "Receiving", href: "/receiving", read },
      { id: "transfers", label: "Transfers", href: "/transfers", read },
      { id: "maintenance", label: "Maintenance", href: "/maintenance", read }
    ];

    const first = collectDashboardSources(descriptors, 100, {
      admissionController,
      telemetry: (event) => events.push(event)
    });
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2);
    expect(admissionController.inFlight).toBe(2);
    await vi.advanceTimersByTimeAsync(100);
    await first;
    expect(admissionController.inFlight).toBe(2);
    expect(events.filter((event) => event.event === "dashboard_source_read"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ outcome: "SATURATED", sourceId: "maintenance" }),
        expect.objectContaining({ outcome: "TIMEOUT", sourceId: "receiving" }),
        expect.objectContaining({ outcome: "TIMEOUT", sourceId: "transfers" })
      ]));

    await collectDashboardSources([descriptors[0]!], 100, {
      admissionController,
      telemetry: (event) => events.push(event)
    });
    expect(read).toHaveBeenCalledTimes(2);

    resolvers.forEach((resolve) => resolve({ patch: {} }));
    await Promise.resolve();
    await Promise.resolve();
    expect(admissionController.inFlight).toBe(0);
    expect(events.filter(
      (event) => event.event === "dashboard_source_read" &&
        event.outcome === "LATE_COMPLETION"
    )).toHaveLength(2);

    await collectDashboardSources([{
      id: "maintenance",
      label: "Maintenance",
      href: "/maintenance",
      read: async () => ({ patch: {} })
    }], 100, { admissionController, telemetry: silentTelemetry });
    expect(admissionController.inFlight).toBe(0);
  });

  it("emits closed exception and assembly telemetry without internal errors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T03:00:00.000Z"));
    const events: DashboardTelemetryEvent[] = [];
    await collectDashboardSources([{
      id: "receiving",
      label: "Receiving",
      href: "/receiving",
      read: async () => { throw new Error("postgres://secret@internal"); }
    }], 100, {
      admissionController: new DashboardSourceAdmissionController(1),
      telemetry: (event) => events.push(event)
    });
    const dashboard = buildOperationalDashboardModel(session, {
      sourceObservations: [{
        id: "receiving",
        label: "Receiving",
        href: "/receiving",
        availability: "UNAVAILABLE",
        checkedAt: "2026-07-23T03:00:00.000Z"
      }]
    });
    vi.setSystemTime(new Date("2026-07-23T03:00:00.025Z"));
    emitDashboardAssemblyTelemetry(
      new Date("2026-07-23T03:00:00.000Z").getTime(),
      dashboard,
      (event) => events.push(event)
    );

    expect(events).toEqual([
      expect.objectContaining({
        event: "dashboard_source_read",
        outcome: "EXCEPTION",
        sourceId: "receiving"
      }),
      expect.objectContaining({
        event: "dashboard_assembly",
        outcome: "PARTIAL",
        durationMs: 25,
        attemptedSourceCount: 1,
        unavailableSourceCount: 1
      })
    ]);
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  it("reports the feature-disabled approval descriptor as unavailable", async () => {
    const descriptor = getOperationalDashboardSourceDescriptors({
      ...session,
      permissionCodes: ["purchasing.purchase_request.approve"]
    }).find((candidate) => candidate.id === "approvals");
    expect(descriptor).toBeDefined();

    const source = await collectDashboardSources([descriptor!], 100, {
      admissionController: new DashboardSourceAdmissionController(1),
      telemetry: silentTelemetry
    });
    expect(source.sourceObservations).toEqual([
      expect.objectContaining({
        id: "approvals",
        availability: "UNAVAILABLE"
      })
    ]);
    expect(buildOperationalDashboardModel(session, source).approvalQueueContract)
      .toMatchObject({ availability: "UNAVAILABLE", totalCount: null });
  });
  it("uses the Manila operating date for dashboard timing", () => {
    expect(dashboardOperationalDate("2026-07-22T17:00:00.000Z")).toBe(
      "2026-07-23"
    );
    expect(
      dashboardDueState(
        "2026-07-22T17:00:00.000Z",
        false,
        new Date("2026-07-22T16:30:00.000Z")
      )
    ).toBe(1);
  });

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

  it("labels and links Receiving Follow-up to its closed server-owned profile", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      receivingDashboard: {
        followUpCount: 2,
        taskCandidates: [{
          id: "receipt-1",
          publicReference: "RR-001",
          status: "POSTED_WITH_DISCREPANCY",
          supplierName: "Demo Supplier",
          purchaseOrderReference: "PO-001",
          receivedAt: "2026-07-20T00:00:00.000Z",
          discrepancyFlag: false,
          inclusionReason: "Discrepancy recorded"
        }]
      }
    });

    expect(dashboard.cards).toContainEqual(
      expect.objectContaining({
        id: "receiving-follow-up",
        label: "Receiving Follow-up",
        href: "/receiving?dashboard=receiving-follow-up-v1",
        description: "Draft, posting, or discrepancy follow-up",
        value: 2
      })
    );
    expect(dashboard.exceptionQueue).toContainEqual(
      expect.objectContaining({
        label: "Receiving follow-up",
        detail: "Discrepancy recorded / Demo Supplier / PO-001",
        href: "/receiving/receipt-1"
      })
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
      dashboardTrustGate: warnTrustGate,
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
        varianceCount: 1,
        generatedAt: "2026-07-23T00:00:00.000Z",
        candidates: [
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
            status: "VARIANCE",
            traceHref: "/inventory/ledger?inventoryLocationId=loc-1&itemId=item-1&lotKey=none"
          }
        ]
      }
    });

    expect(
      dashboard.cards.map((card) => [card.id, card.value, card.href])
    ).toEqual([
      ["open-purchase-orders", 1, "/purchase-orders?dashboard=po-open-v1"],
      [
        "receiving-follow-up",
        1,
        "/receiving?dashboard=receiving-follow-up-v1"
      ],
      [
        "ledger-reconciliation",
        1,
        "/inventory/reconciliation?dashboard=ledger-variance-v1"
      ]
    ]);
    expect(dashboard.exceptionQueue.map((item) => item.href)).toEqual([
      "/purchase-orders/po-1",
      "/receiving/grn-1",
      "/inventory/reconciliation?dashboard=ledger-variance-v1&q=RICE"
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
        varianceCount: 1,
        generatedAt: "2026-07-23T00:00:00.000Z",
        candidates: [
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
            status: "VARIANCE",
            traceHref: "/inventory/ledger?inventoryLocationId=loc-1&itemId=item-1&lotKey=none"
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
          href: "/inventory/reconciliation?dashboard=ledger-variance-v1",
          tone: "warning"
        })
      ])
    );
  });

  it("fails closed when trust-gate policy is unavailable", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      reconciliation: {
        varianceCount: 1,
        generatedAt: "2026-07-23T00:00:00.000Z",
        candidates: [{
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
          status: "VARIANCE",
          traceHref: "/inventory/ledger"
        }]
      },
      sourceObservations: [{
        id: "trust-gate",
        label: "Dashboard trust status",
        href: "/inventory",
        availability: "UNAVAILABLE",
        checkedAt: "2026-07-23T00:00:00.000Z"
      }]
    });

    expect(dashboard.trustGate).toMatchObject({
      availability: "UNAVAILABLE",
      mode: "block",
      label: expect.stringContaining("Unavailable")
    });
    expect(dashboard.cards.map((card) => card.id)).not.toContain(
      "ledger-reconciliation"
    );
    expect(dashboard.exceptionQueue.map((item) => item.label)).not.toContain(
      "Ledger variance"
    );
    expect(dashboard.sourceHealth).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "dashboard-trust-gate",
        displayValue: "Unavailable",
        tone: "warning"
      })
    ]));
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
      dashboardTrustGate: warnTrustGate,
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
        varianceCount: 1,
        generatedAt: "2026-07-23T00:00:00.000Z",
        candidates: [
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
            status: "VARIANCE",
            traceHref: "/inventory/ledger?inventoryLocationId=loc-1&itemId=item-1&lotKey=none"
          }
        ]
      }
      }
    );

    expect(dashboard.cards.map((card) => card.id)).toEqual([
      "pending-approvals",
      "open-purchase-requests",
      "open-purchase-orders",
      "receiving-follow-up",
      "transfer-follow-up",
      "count-variance",
      "wastage-exceptions",
      "adjustment-exceptions",
      "ledger-reconciliation"
    ]);
    expect(
      dashboard.exceptionQueue.map((item) => [item.label, item.href])
    ).toEqual([
      ["Receiving follow-up", "/receiving/grn-1"],
      ["Transfer follow-up", "/transfers/transfer-1"],
      ["Count variance", "/counts/count-1"],
      ["Wastage follow-up", "/wastage/waste-1"],
      ["Adjustment follow-up", "/adjustments/adjustment-1"],
      [
        "Ledger variance",
        "/inventory/reconciliation?dashboard=ledger-variance-v1&q=TOMATO"
      ]
    ]);
  });

  it("surfaces Phase 2 restaurant operations from source dashboards", () => {
    const dashboard = buildOperationalDashboardModel(session, {
      dashboardTrustGate: warnTrustGate,
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
            hasReporter: true,
            reportedByCurrentUser: false,
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
      ["branch-checklist-exceptions", 1, "/branch-operations"],
      ["branch-checklist-reviews", 1, "/branch-operations"],
      ["food-safety-exceptions", 1, "/food-safety"],
      ["food-safety-reviews", 1, "/food-safety"],
      ["open-operational-incidents", 1, "/incidents"],
      ["maintenance-follow-up", 1, "/maintenance"]
    ]);
    expect(dashboard.metrics.map((metric) => metric.id)).toEqual(
      expect.arrayContaining([
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
      dashboard.exceptionQueue.map((item) => [item.label, item.href])
    ).toEqual([
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
  });

  it("does not collect or materialize the retired Food Cost dashboard source", () => {
    const dashboardServiceSource = readFileSync(
      path.resolve(__dirname, "dashboard.ts"),
      "utf8"
    );
    const dashboard = buildOperationalDashboardModel(
      { ...session, permissionCodes: ["restaurant.recipe.view"] },
      {
        foodCostAnalysis: {
          locationName: "Selected Branch",
          salesImportBatches: 1,
          rows: [{ menuItemId: "menu-1", status: "ABOVE_TARGET" }]
        }
      } as never
    );
    const serializedDashboard = JSON.stringify(dashboard);

    expect(dashboardServiceSource).not.toContain("getFoodCostAnalysisDashboard");
    expect(dashboardServiceSource).not.toContain("canUseRecipesAndCosting");
    expect(dashboardServiceSource).not.toContain("foodCostAnalysis");
    expect(dashboardServiceSource).not.toContain("food-cost-analysis");
    expect(serializedDashboard).not.toContain("food-cost");
    expect(serializedDashboard).not.toContain("restaurant-net-sales");
    expect(serializedDashboard).not.toContain("sales-source");
    expect(serializedDashboard).not.toContain("/recipes/analysis");
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
      totalCount: null,
      displayedCount: 0,
      completeness: "PARTIAL",
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

  it("uses the bounded Food Safety read instead of the full log workspace read", () => {
    const dashboardServiceSource = readFileSync(
      path.resolve(__dirname, "dashboard.ts"),
      "utf8",
    );

    expect(dashboardServiceSource).toContain("getFoodSafetyDashboardRead(session)");
    expect(dashboardServiceSource).not.toContain("getFoodSafetyDashboard(session)");
  });

  it("uses the bounded Incident read instead of the full incident workspace read", () => {
    const dashboardServiceSource = readFileSync(
      path.resolve(__dirname, "dashboard.ts"),
      "utf8",
    );

    expect(dashboardServiceSource).toContain("getIncidentDashboardRead(session)");
    expect(dashboardServiceSource).not.toContain("getIncidentDashboard(session)");
  });

  it("uses the bounded Maintenance read instead of the full ticket workspace read", () => {
    const dashboardServiceSource = readFileSync(
      path.resolve(__dirname, "dashboard.ts"),
      "utf8",
    );

    expect(dashboardServiceSource).toContain("getMaintenanceDashboardRead(session)");
    expect(dashboardServiceSource).not.toContain("getMaintenanceDashboard(session)");
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

  it("withholds composite totals and reports contributor provenance when a source is unavailable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T02:00:00.000Z"));
    const dashboard = buildOperationalDashboardModel(session, {
      purchaseOrders: [{
        id: "po-1",
        publicReference: "PO-001",
        supplierName: "Supplier",
        status: "ISSUED",
        deliveryAgingStatus: "OVERDUE",
        daysOverdue: 1
      }] as never,
      sourceObservations: [
        {
          id: "purchase-orders",
          label: "Purchase Orders",
          href: "/purchase-orders",
          availability: "AVAILABLE",
          checkedAt: "2026-07-23T01:59:59.000Z"
        },
        {
          id: "receiving",
          label: "Receiving",
          href: "/receiving",
          availability: "UNAVAILABLE",
          checkedAt: "2026-07-23T02:00:00.000Z"
        }
      ]
    });

    expect(dashboard.exceptionQueueContract).toMatchObject({
      totalCount: null,
      displayedCount: 1,
      completeness: "PARTIAL",
      contributors: [
        { sourceId: "purchase-orders", availability: "AVAILABLE", itemCount: 1 },
        { sourceId: "receiving", availability: "UNAVAILABLE", itemCount: null }
      ]
    });
    expect(dashboard.assembledAt).toBe("2026-07-23T02:00:00.000Z");
    expect(dashboard.generatedAt).toBe(dashboard.assembledAt);
  });
});
