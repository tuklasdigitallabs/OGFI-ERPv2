import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  listCatalog: vi.fn(),
}));

vi.mock("@/server/services/context", () => ({
  getSessionContext: mocks.getSessionContext,
}));
vi.mock("@/server/services/items", () => ({
  listItemMasterOptionCatalog: mocks.listCatalog,
}));
describe("item option catalog route admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionContext.mockResolvedValue({ tenant: { id: "tenant" } });
    mocks.listCatalog.mockResolvedValue({
      options: [], page: 1, pageSize: 25, total: 0, hasMore: false,
    });
  });

  it("returns a bounded retry hint when authorized catalog work is saturated", async () => {
    const { ItemOptionCatalogRateLimitedError } = await import(
      "@/server/services/itemOptionCatalogAdmission"
    );
    mocks.listCatalog.mockRejectedValue(new ItemOptionCatalogRateLimitedError(3));
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/items/option-catalog?kind=item"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ code: "OPTION_LOOKUP_RATE_LIMITED" });
    expect(mocks.getSessionContext).toHaveBeenCalledOnce();
    expect(mocks.listCatalog).toHaveBeenCalledOnce();
  }, 15_000);

  it("does not delegate unauthenticated traffic to catalog admission or work", async () => {
    mocks.getSessionContext.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/items/option-catalog?kind=item"));
    expect(response.status).toBe(401);
    expect(mocks.listCatalog).not.toHaveBeenCalled();
  });

  it("rejects ambiguous query cardinality and records a fixed outcome", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/items/option-catalog?kind=item&kind=uom",
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "OPTION_INPUT_INVALID" });
    expect(mocks.listCatalog).not.toHaveBeenCalled();
  });

  it("delegates bounded valid input and releases the permit", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/items/option-catalog?kind=category&query=food&page=1&pageSize=25",
    ));
    expect(response.status).toBe(200);
    expect(mocks.listCatalog).toHaveBeenCalledWith(expect.anything(), {
      kind: "category", query: "food", selectedIds: [], page: 1, pageSize: 25,
    });
  });
});
