import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  isTrustedMutationOrigin: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/services/authentication", () => ({
  isTrustedMutationOrigin: mocks.isTrustedMutationOrigin,
}));

describe("short mutation response adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTrustedMutationOrigin.mockReturnValue(true);
  });

  it("rejects an untrusted origin before reading or delegating the mutation", async () => {
    mocks.isTrustedMutationOrigin.mockReturnValue(false);
    const mutate = vi.fn();
    const { shortMutationResponse } = await import("./shortMutationRoute");

    const response = await shortMutationResponse(
      new NextRequest("http://localhost/api/test", { method: "POST", headers: { origin: "https://attacker.example" } }),
      { mutate, successCode: "CORE_ADMIN_COMPANY_CREATED" },
    );

    expect(response.status).toBe(403);
    expect(mutate).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ status: "error", feedback: { code: "ORIGIN_DENIED" } });
  });

  it("returns only the mapped success feedback after a trusted mutation and revalidates its register", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    const { shortMutationResponse } = await import("./shortMutationRoute");
    const body = new FormData();
    body.set("reason", "Test controlled update");

    const response = await shortMutationResponse(
      new NextRequest("http://localhost/api/test", { method: "POST", headers: { origin: "http://localhost" }, body }),
      { mutate, successCode: "CORE_ADMIN_COMPANY_CREATED", revalidate: "/admin" },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mutate).toHaveBeenCalledWith(expect.any(FormData));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(await response.json()).toMatchObject({ status: "success", feedback: { code: "CORE_ADMIN_COMPANY_CREATED", tone: "success" } });
  });

  it("maps a service failure to safe feedback without revalidating", async () => {
    const mutate = vi.fn().mockRejectedValue(new Error("DUPLICATE_ITEM_CATEGORY_CODE"));
    const { shortMutationResponse } = await import("./shortMutationRoute");

    const response = await shortMutationResponse(
      new NextRequest("http://localhost/api/test", { method: "POST", headers: { origin: "http://localhost" }, body: new FormData() }),
      { mutate, successCode: "ITEM_CATEGORY_CREATED", revalidate: "/items" },
    );

    expect(response.status).toBe(400);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ status: "error", feedback: { code: "DUPLICATE_ITEM_CATEGORY_CODE" } });
  });
});
