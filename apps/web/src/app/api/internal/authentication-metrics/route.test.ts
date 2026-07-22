import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readMetrics = vi.fn();
vi.mock("../../../../server/services/authenticationRuntimeMetrics", () => ({
  constantTimeTokenMatches: (actual: string | null, expected: string) => actual === expected,
  readAuthenticationRuntimeMetrics: readMetrics,
}));

describe("internal authentication metrics route", () => {
  beforeEach(() => {
    readMetrics.mockReset();
    process.env.AUTH_HEALTH_METRICS_TOKEN = "test-health-token-that-is-at-least-32-bytes";
  });

  it("fails closed without disclosing the token or internal metrics", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/internal/authentication-metrics"));
    const body = await response.text();
    expect(response.status).toBe(404);
    expect(body).toContain("AUTH_RUNTIME_METRICS_DENIED");
    expect(body).not.toContain(process.env.AUTH_HEALTH_METRICS_TOKEN!);
    expect(readMetrics).not.toHaveBeenCalled();
  });

  it("returns only the bounded aggregate payload for the exact token", async () => {
    readMetrics.mockResolvedValue({
      argon2: { capacity: 2, active: 0, maximumActive: 2, rejected: 1, completed: 4, totalDurationMs: 80, maximumDurationMs: 25 },
      caddyRejectedDelta: 3,
    });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/internal/authentication-metrics", {
      headers: { authorization: `Bearer ${process.env.AUTH_HEALTH_METRICS_TOKEN}` },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ caddyRejectedDelta: 3 }));
  });
});
