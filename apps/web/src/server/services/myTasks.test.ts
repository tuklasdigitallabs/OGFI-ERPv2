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
  adjustments: vi.fn()
}));

vi.mock("./transfers", () => ({ listTransferMyTaskPage: mocks.transfers }));
vi.mock("./wastage", () => ({ listWastageMyTaskPage: mocks.wastage }));
vi.mock("./stockAdjustments", () => ({
  listStockAdjustmentMyTaskPage: mocks.adjustments
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
      createdAt: "2026-07-20T00:00:00.000Z",
      sourceType: "TRANSFER",
      recordId: "t1"
    });
    expect(decodeMyTasksCursor(session as never, cursor)).toMatchObject({ recordId: "t1" });
    expect(() => decodeMyTasksCursor(session as never, `${cursor}x`)).toThrow("MY_TASK_CURSOR_INVALID");
    expect(() => decodeMyTasksCursor({ ...session, user: { ...session.user, id: "other" } } as never, cursor)).toThrow("MY_TASK_CURSOR_INVALID");
  });

  test("withholds a total instead of treating a failed source as empty", async () => {
    mocks.wastage.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(getMyTasksPage(session as never)).resolves.toMatchObject({
      totalCount: null,
      isComplete: false,
      unavailableSources: [{ type: "WASTAGE", label: "Wastage" }]
    });
  });
});
