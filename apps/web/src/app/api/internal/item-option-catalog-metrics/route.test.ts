import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readMetrics = vi.fn();
vi.mock("../../../../server/services/authenticationRuntimeMetrics", () => ({
  constantTimeTokenMatches: (actual: string | null, expected: string) => actual === expected,
}));
vi.mock("../../../../server/services/itemOptionCatalogRuntimeMetrics", () => ({
  readItemOptionCatalogRuntimeMetrics: readMetrics,
}));

describe("internal item option catalog metrics route", () => {
  beforeEach(() => {
    readMetrics.mockReset();
    process.env.AUTH_HEALTH_METRICS_TOKEN = "test-health-token-that-is-at-least-32-bytes";
  });

  it("AUTHZ-ITEM-OPTION-RUNTIME-METRICS-TOKEN-DENIAL-NO-DISCLOSURE-OR-MUTATION", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/internal/item-option-catalog-metrics"));
    const body = await response.text();
    expect(response.status).toBe(404);
    expect(body).toContain("ITEM_OPTION_RUNTIME_METRICS_DENIED");
    expect(body).not.toContain(process.env.AUTH_HEALTH_METRICS_TOKEN!);
    expect(readMetrics).not.toHaveBeenCalled();
  });

  it("returns only the aggregate payload for the exact token", async () => {
    readMetrics.mockResolvedValue({
      edge: { globalRejectedDelta: 0, sourceRejectedDelta: 1 },
      application: { capacity: 8, active: 0 },
    });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/internal/item-option-catalog-metrics", {
      headers: { authorization: `Bearer ${process.env.AUTH_HEALTH_METRICS_TOKEN}` },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      edge: { globalRejectedDelta: 0, sourceRejectedDelta: 1 },
    }));
  });
});
