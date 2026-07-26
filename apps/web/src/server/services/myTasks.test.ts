import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { permissions } from "./authorization";
import {
  decodeMyTasksCursor,
  encodeMyTasksCursor,
  getMyTasksSourceDeadlineMs,
  getMyTasksSourceMaxInFlight,
  getMyTasksPage,
  myTasksRegistryVersion,
  MyTasksSourceAdmissionController,
  type MyTasksTelemetryEvent,
  myTasksRuntimeTestSupport
} from "./myTasks";

const mocks = vi.hoisted(() => ({
  transfers: vi.fn(),
  wastage: vi.fn(),
  adjustments: vi.fn(),
  purchaseRequests: vi.fn(),
  purchaseOrders: vi.fn(),
  branchOperations: vi.fn(),
  foodSafety: vi.fn(),
  incidents: vi.fn(),
  maintenance: vi.fn(),
  stockCounts: vi.fn()
}));

vi.mock("./transfers", () => ({ listTransferMyTaskPage: mocks.transfers }));
vi.mock("./wastage", () => ({ listWastageMyTaskPage: mocks.wastage }));
vi.mock("./stockAdjustments", () => ({
  listStockAdjustmentMyTaskPage: mocks.adjustments
}));
vi.mock("./purchaseRequests", () => ({
  listPurchaseRequestMyTaskPage: mocks.purchaseRequests
}));
vi.mock("./purchaseOrders", () => ({
  listPurchaseOrderMyTaskPage: mocks.purchaseOrders
}));
vi.mock("./branchOperations", () => ({
  listBranchOperationMyTaskPage: mocks.branchOperations
}));
vi.mock("./foodSafety", () => ({ listFoodSafetyMyTaskPage: mocks.foodSafety }));
vi.mock("./incidents", () => ({ listIncidentMyTaskPage: mocks.incidents }));
vi.mock("./maintenance", () => ({
  listMaintenanceMyTaskPage: mocks.maintenance
}));
vi.mock("./stockCounts", () => ({
  listStockCountMyTaskPage: mocks.stockCounts
}));

const session = {
  user: { id: "user-1", email: "user@example.test", displayName: "User", role: "Operator" },
  context: {
    tenantId: "tenant-1",
    companyId: "company-1",
    companyName: "OGFI",
    brandId: "brand-1",
    brandName: "Brand",
    locationId: "location-1",
    locationName: "Branch",
    locationType: "BRANCH" as const
  },
  authorizedLocations: [],
  permissionCodes: [
    permissions.transferDispatch,
    permissions.wastageReview,
    permissions.stockAdjustmentPost
  ]
};

describe("My Tasks queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transfers.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "transfer-t1", recordId: "t1", publicReference: "TR-1", status: "REQUESTED", actionLabel: "Dispatch transfer", sourceLocationName: "Main", destinationLocationName: "Branch", createdAt: "2026-07-20T00:00:00.000Z" }]
    });
    mocks.wastage.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "wastage-w1", recordId: "w1", publicReference: "WST-1", status: "SUBMITTED", actionLabel: "Review wastage report", inventoryLocationName: "Branch", createdAt: "2026-07-20T00:00:00.000Z" }]
    });
    mocks.adjustments.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "stock-adjustment-a1", recordId: "a1", publicReference: "ADJ-1", adjustmentType: "COUNT_VARIANCE", actionLabel: "Post stock adjustment", inventoryLocationName: "Branch", createdAt: "2026-07-21T00:00:00.000Z" }]
    });
    mocks.purchaseRequests.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "purchase-request-pr1", recordId: "pr1", publicReference: "PR-1", status: "DRAFT", actionLabel: "Submit purchase request", requestLocationName: "Branch", requiredDate: "2026-07-25", createdAt: "2026-07-19T00:00:00.000Z" }]
    });
    mocks.purchaseOrders.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "purchase-order-po1", recordId: "po1", publicReference: "PO-1", status: "APPROVED", actionLabel: "Send PO to supplier", supplierName: "Supplier", deliveryLocationName: "Branch", createdAt: "2026-07-19T00:00:00.000Z" }]
    });
    mocks.branchOperations.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "branch-operation-bo1", recordId: "bo1", publicReference: "Opening Readiness", status: "SUBMITTED", actionLabel: "Review branch checklist", locationName: "Branch", businessDate: "2026-07-23", shiftType: "OPENING", createdAt: "2026-07-22T00:00:00.000Z" }]
    });
    mocks.foodSafety.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "food-safety-fs1", recordId: "fs1", publicReference: "Opening Temperature Log", status: "SUBMITTED", actionLabel: "Review food-safety log", locationName: "Branch", businessDate: "2026-07-23", logType: "TEMPERATURE", createdAt: "2026-07-22T01:00:00.000Z" }]
    });
    mocks.incidents.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "incident-i1", recordId: "i1", publicReference: "INC-1", status: "OPEN", severity: "CRITICAL", priority: "CRITICAL", dueAt: "2026-07-23T00:00:00.000Z", actionLabel: "Resolve incident", createdAt: "2026-07-22T02:00:00.000Z" }]
    });
    mocks.maintenance.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "maintenance-m1", recordId: "m1", publicReference: "MT-1", status: "IN_PROGRESS", priority: "HIGH", dueAt: "2026-07-24T00:00:00.000Z", actionLabel: "Complete maintenance ticket", createdAt: "2026-07-22T03:00:00.000Z" }]
    });
    mocks.stockCounts.mockResolvedValue({
      totalCount: 1,
      nextCursor: null,
      items: [{ taskId: "stock-count-sc1", recordId: "sc1", publicReference: "SC-1", status: "IN_PROGRESS", actionLabel: "Submit stock count", createdAt: "2026-07-22T04:00:00.000Z" }]
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("validates bounded source deployment configuration", () => {
    expect(getMyTasksSourceDeadlineMs({})).toBe(2_500);
    expect(getMyTasksSourceDeadlineMs({ MY_TASKS_SOURCE_DEADLINE_MS: "3000" }))
      .toBe(3_000);
    expect(() =>
      getMyTasksSourceDeadlineMs({ MY_TASKS_SOURCE_DEADLINE_MS: "3001" })
    ).toThrow("MY_TASKS_SOURCE_DEADLINE_MS_INVALID");
    expect(() =>
      getMyTasksSourceDeadlineMs({ MY_TASKS_SOURCE_DEADLINE_MS: "invalid" })
    ).toThrow("MY_TASKS_SOURCE_DEADLINE_MS_INVALID");
    expect(getMyTasksSourceMaxInFlight({})).toBe(32);
    expect(getMyTasksSourceMaxInFlight({ MY_TASKS_SOURCE_MAX_IN_FLIGHT: "64" }))
      .toBe(64);
    expect(() =>
      getMyTasksSourceMaxInFlight({ MY_TASKS_SOURCE_MAX_IN_FLIGHT: "65" })
    ).toThrow("MY_TASKS_SOURCE_MAX_IN_FLIGHT_INVALID");
    expect(() => new MyTasksSourceAdmissionController(0))
      .toThrow("MY_TASKS_SOURCE_MAX_IN_FLIGHT_INVALID");
  });

  test("returns a named partial page when one source never settles", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T00:00:00.000Z"));
    mocks.wastage.mockImplementationOnce(() => new Promise<never>(() => undefined));
    const events: MyTasksTelemetryEvent[] = [];
    const pending = myTasksRuntimeTestSupport.getMyTasksPageWithRuntime(
      session as never,
      { pageSize: 2 },
      {
        deadlineMs: 100,
        admissionController: new MyTasksSourceAdmissionController(3),
        telemetry: (event) => events.push(event)
      }
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ sourceType: "TRANSFER" }),
        expect.objectContaining({ sourceType: "STOCK_ADJUSTMENT" })
      ]),
      totalCount: null,
      nextCursor: null,
      isComplete: false,
      unavailableSources: [{ type: "WASTAGE", label: "Wastage" }]
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "my_tasks_source_read",
        outcome: "TIMEOUT",
        sourceType: "WASTAGE"
      }),
      expect.objectContaining({
        event: "my_tasks_assembly",
        outcome: "PARTIAL",
        attemptedSourceCount: 3,
        unavailableSourceCount: 1
      })
    ]));
  });

  test("retains timed-out capacity until late fulfillment and rejects saturated reads", async () => {
    vi.useFakeTimers();
    let resolveTransfer: (() => void) | undefined;
    mocks.transfers.mockImplementationOnce(() => new Promise((resolve) => {
      resolveTransfer = () => resolve({ totalCount: 0, nextCursor: null, items: [] });
    }));
    const admissionController = new MyTasksSourceAdmissionController(1);
    const events: MyTasksTelemetryEvent[] = [];
    const first = myTasksRuntimeTestSupport.getMyTasksPageWithRuntime(
      session as never,
      { module: "TRANSFER" },
      { deadlineMs: 100, admissionController, telemetry: (event) => events.push(event) }
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    await first;
    expect(admissionController.inFlight).toBe(1);

    const saturated = await myTasksRuntimeTestSupport.getMyTasksPageWithRuntime(
      session as never,
      { module: "WASTAGE" },
      { deadlineMs: 100, admissionController, telemetry: (event) => events.push(event) }
    );
    expect(saturated).toMatchObject({
      totalCount: null,
      nextCursor: null,
      isComplete: false,
      unavailableSources: [{ type: "WASTAGE" }]
    });
    expect(mocks.wastage).not.toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({
      event: "my_tasks_source_read",
      outcome: "SATURATED",
      sourceType: "WASTAGE"
    }));

    expect(resolveTransfer).toEqual(expect.any(Function));
    resolveTransfer!();
    await vi.advanceTimersByTimeAsync(0);
    expect(admissionController.inFlight).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({
      event: "my_tasks_source_read",
      outcome: "LATE_COMPLETION",
      sourceType: "TRANSFER"
    }));
  });

  test("observes late rejection without leaking errors or changing the partial page", async () => {
    vi.useFakeTimers();
    let rejectWastage: ((error: Error) => void) | undefined;
    mocks.wastage.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectWastage = reject;
    }));
    const admissionController = new MyTasksSourceAdmissionController(1);
    const events: MyTasksTelemetryEvent[] = [];
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const pending = myTasksRuntimeTestSupport.getMyTasksPageWithRuntime(
        { ...session, permissionCodes: [permissions.wastageReview] } as never,
        { module: "WASTAGE" },
        { deadlineMs: 100, admissionController, telemetry: (event) => events.push(event) }
      );
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(100);
      const page = await pending;
      expect(page).toMatchObject({
        items: [],
        totalCount: null,
        nextCursor: null,
        isComplete: false
      });

      expect(rejectWastage).toEqual(expect.any(Function));
      rejectWastage!(new Error("postgres://secret@internal"));
      await vi.advanceTimersByTimeAsync(0);
      expect(admissionController.inFlight).toBe(0);
      expect(unhandled).not.toHaveBeenCalled();
      expect(events).toContainEqual(expect.objectContaining({
        event: "my_tasks_source_read",
        outcome: "LATE_COMPLETION",
        sourceType: "WASTAGE"
      }));
      expect(JSON.stringify(events)).not.toContain("secret");
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  test("emits redacted exception and assembly telemetry for only the selected module", async () => {
    const events: MyTasksTelemetryEvent[] = [];
    const admissionController = new MyTasksSourceAdmissionController(1);
    mocks.wastage.mockRejectedValueOnce(new Error("database password must stay private"));

    await expect(myTasksRuntimeTestSupport.getMyTasksPageWithRuntime(
      session as never,
      { module: "WASTAGE" },
      {
        deadlineMs: 100,
        admissionController,
        telemetry: (event) => events.push(event)
      }
    )).resolves.toMatchObject({ isComplete: false, totalCount: null, nextCursor: null });

    expect(mocks.transfers).not.toHaveBeenCalled();
    expect(mocks.adjustments).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        event: "my_tasks_source_read",
        outcome: "EXCEPTION",
        sourceType: "WASTAGE"
      }),
      expect.objectContaining({
        event: "my_tasks_assembly",
        outcome: "PARTIAL",
        attemptedSourceCount: 1,
        unavailableSourceCount: 1
      })
    ]);
    expect(JSON.stringify(events)).not.toContain("password");
    expect(JSON.stringify(events)).not.toContain(session.user.email);
    expect(admissionController.inFlight).toBe(0);
  });

  test("merges enrolled sources in the shared stable order", async () => {
    await expect(getMyTasksPage(session as never, { pageSize: 2 })).resolves.toMatchObject({
      totalCount: 3,
      isComplete: true,
      items: [
        { taskId: "transfer-t1", sourceType: "TRANSFER" },
        { taskId: "wastage-w1", sourceType: "WASTAGE" }
      ]
    });
    const page = await getMyTasksPage(session as never, { pageSize: 2 });
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(mocks.transfers).toHaveBeenLastCalledWith(session, expect.objectContaining({ take: 2 }));
  });

  test("binds a cursor to its current user scope and rejects tampering", () => {
    expect(myTasksRegistryVersion).toBe("my-tasks-registry-v6");
    const cursor = encodeMyTasksCursor(session as never, {
      priority: "HIGH",
      dueAt: null,
      createdAt: "2026-07-20T00:00:00.000Z",
      sourceType: "TRANSFER",
      recordId: "t1"
    });
    expect(decodeMyTasksCursor(session as never, cursor)).toMatchObject({ recordId: "t1" });
    expect(() => decodeMyTasksCursor(session as never, `${cursor}x`)).toThrow("MY_TASK_CURSOR_INVALID");
    expect(() => decodeMyTasksCursor({ ...session, user: { ...session.user, id: "other" } } as never, cursor)).toThrow("MY_TASK_CURSOR_INVALID");
    const legacyCursor = encodeMyTasksCursor(session as never, {
      createdAt: "2026-07-20T00:00:00.000Z",
      sourceType: "TRANSFER",
      recordId: "t1"
    });
    expect(() => decodeMyTasksCursor(session as never, legacyCursor)).toThrow("MY_TASK_CURSOR_INVALID");
  });

  test("filters by an enrolled module server-side and binds the module to the cursor", async () => {
    const page = await getMyTasksPage(session as never, {
      module: "TRANSFER",
      pageSize: 1
    });
    expect(page.enrolledSources).toEqual([{ type: "TRANSFER", label: "Transfers" }]);
    expect(page.items).toEqual([
      expect.objectContaining({ sourceType: "TRANSFER", taskId: "transfer-t1" })
    ]);
    expect(mocks.wastage).not.toHaveBeenCalled();
    expect(page.nextCursor).toBeNull();

    const cursor = encodeMyTasksCursor(session as never, {
      priority: "HIGH",
      dueAt: null,
      createdAt: "2026-07-20T00:00:00.000Z",
      sourceType: "TRANSFER",
      recordId: "t1"
    }, "TRANSFER");
    expect(() => decodeMyTasksCursor(session as never, cursor, "WASTAGE" as never)).toThrow(
      "MY_TASK_CURSOR_INVALID"
    );
  });

  test("rejects a module that is not enrolled by the current permission set", async () => {
    await expect(
      getMyTasksPage({ ...session, permissionCodes: [permissions.purchaseRequestSubmit] } as never, {
        module: "TRANSFER"
      })
    ).rejects.toThrow("MY_TASK_FILTER_INVALID");
  });

  test("propagates canonical priority and source-qualified status to the selected adapter", async () => {
    await getMyTasksPage(
      { ...session, permissionCodes: [permissions.wastageReview] } as never,
      { module: "WASTAGE", priority: "HIGH", status: "SUBMITTED" }
    );
    expect(mocks.wastage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filter: { priority: "HIGH", status: "SUBMITTED" } })
    );
  });

  test("rejects status without a selected module", async () => {
    await expect(getMyTasksPage(session as never, { status: "DRAFT" })).rejects.toThrow("MY_TASK_FILTER_INVALID");
  });

  test("normalizes native due buckets and excludes fixed no-due sources", async () => {
    const empty = await getMyTasksPage(session as never, {
      module: "TRANSFER",
      due: "OVERDUE"
    });
    expect(empty).toMatchObject({ items: [], totalCount: 0, isComplete: true });
    expect(mocks.transfers).not.toHaveBeenCalled();

    await getMyTasksPage(
      { ...session, permissionCodes: [permissions.incidentResolve] } as never,
      { module: "INCIDENT", due: "TODAY" }
    );
    expect(mocks.incidents).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filter: expect.objectContaining({ due: { kind: "TODAY", from: expect.any(String), to: expect.any(String) } }) })
    );
  });

  test("withholds a total instead of treating a failed source as empty", async () => {
    mocks.wastage.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(getMyTasksPage(session as never)).resolves.toMatchObject({
      totalCount: null,
      isComplete: false,
      nextCursor: null,
      unavailableSources: [{ type: "WASTAGE", label: "Wastage" }]
    });
  });

  test("enrolls the requester-owned Purchase Request source contract", async () => {
    await expect(
      getMyTasksPage(
        { ...session, permissionCodes: [permissions.purchaseRequestSubmit] } as never
      )
    ).resolves.toMatchObject({
      totalCount: 1,
      enrolledSources: [{ type: "PURCHASE_REQUEST", label: "Purchase requests" }],
      items: [{ taskId: "purchase-request-pr1", sourceType: "PURCHASE_REQUEST" }]
    });
  });

  test("enrolls only the explicit Purchase Order submit or issue controls", async () => {
    await expect(
      getMyTasksPage(
        { ...session, permissionCodes: [permissions.purchaseOrderIssue] } as never
      )
    ).resolves.toMatchObject({
      totalCount: 1,
      enrolledSources: [{ type: "PURCHASE_ORDER", label: "Purchase orders" }],
      items: [{ taskId: "purchase-order-po1", sourceType: "PURCHASE_ORDER" }]
    });
  });

  test("enrolls Branch Operations only for its current review or correction controls", async () => {
    await expect(
      getMyTasksPage(
        { ...session, permissionCodes: [permissions.branchOperationsReview] } as never
      )
    ).resolves.toMatchObject({
      totalCount: 1,
      enrolledSources: [{ type: "BRANCH_OPERATION", label: "Branch operations" }],
      items: [{ taskId: "branch-operation-bo1", sourceType: "BRANCH_OPERATION" }]
    });
    expect(mocks.branchOperations).toHaveBeenCalled();
  });

  test("enrolls Food Safety only for its current review or correction controls", async () => {
    await expect(
      getMyTasksPage({ ...session, permissionCodes: [permissions.foodSafetyReview] } as never)
    ).resolves.toMatchObject({
      totalCount: 1,
      enrolledSources: [{ type: "FOOD_SAFETY", label: "Food safety" }],
      items: [{ taskId: "food-safety-fs1", sourceType: "FOOD_SAFETY" }]
    });
  });

  test("enrolls and prioritizes scoped incident resolution work", async () => {
    await expect(
      getMyTasksPage({ ...session, permissionCodes: [permissions.incidentResolve] } as never)
    ).resolves.toMatchObject({
      totalCount: 1,
      enrolledSources: [{ type: "INCIDENT", label: "Incidents" }],
      items: [{ taskId: "incident-i1", sourceType: "INCIDENT", priority: "CRITICAL" }]
    });
  });

  test("enrolls scoped maintenance completion work only for completion authority", async () => {
    await expect(
      getMyTasksPage({ ...session, permissionCodes: [permissions.maintenanceComplete] } as never)
    ).resolves.toMatchObject({
      totalCount: 1,
      enrolledSources: [{ type: "MAINTENANCE", label: "Maintenance" }],
      items: [{
        taskId: "maintenance-m1",
        sourceType: "MAINTENANCE",
        priority: "HIGH",
        sourceLabel: "Maintenance ticket",
        href: "/maintenance/m1"
      }]
    });
    expect(mocks.maintenance).toHaveBeenCalled();
  });

  test("enrolls assigned Stock Count work only for entry or submit authority", async () => {
    await expect(
      getMyTasksPage({
        ...session,
        permissionCodes: [permissions.stockCountSubmit]
      } as never)
    ).resolves.toMatchObject({
      totalCount: 1,
      enrolledSources: [{ type: "STOCK_COUNT", label: "Stock counts" }],
      items: [{
        taskId: "stock-count-sc1",
        sourceType: "STOCK_COUNT",
        priority: "HIGH",
        dueAt: null,
        sourceLabel: "Stock count",
        href: "/counts/sc1"
      }]
    });
    expect(mocks.stockCounts).toHaveBeenCalled();
  });
});
