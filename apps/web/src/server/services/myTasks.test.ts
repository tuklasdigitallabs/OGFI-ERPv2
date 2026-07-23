import { beforeEach, describe, expect, test, vi } from "vitest";
import { permissions } from "./authorization";
import {
  decodeMyTasksCursor,
  encodeMyTasksCursor,
  getMyTasksPage
} from "./myTasks";

const mocks = vi.hoisted(() => ({
  transfers: vi.fn(),
  wastage: vi.fn(),
  adjustments: vi.fn(),
  purchaseRequests: vi.fn(),
  purchaseOrders: vi.fn(),
  branchOperations: vi.fn(),
  foodSafety: vi.fn(),
  incidents: vi.fn()
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

  test("withholds a total instead of treating a failed source as empty", async () => {
    mocks.wastage.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(getMyTasksPage(session as never)).resolves.toMatchObject({
      totalCount: null,
      isComplete: false,
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
});
