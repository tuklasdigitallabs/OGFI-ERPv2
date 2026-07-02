import { beforeEach, describe, expect, test, vi } from "vitest";

const queryRawMock = vi.fn();

vi.mock("@ogfi/database", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

describe("health and readiness routes", () => {
  beforeEach(() => {
    queryRawMock.mockReset();
    process.env.DATABASE_URL = "postgresql://test";
    process.env.S3_ENDPOINT = "http://storage.local";
    delete process.env.ERROR_MONITORING_DSN;
  });

  test("returns safe API health details without requiring queue services", async () => {
    const { GET } = await import("./route");

    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      service: "web",
      releaseScope: "phase-i-phase-1-5-no-queueing",
      checks: {
        app: "ok",
        databaseUrlConfigured: true,
        storageEndpointConfigured: true,
        errorMonitoringConfigured: false,
      },
    });
    expect(body.checks).not.toHaveProperty("redisUrlConfigured");
  });

  test("top-level health route reuses the API health handler", async () => {
    const api = await import("./route");
    const topLevel = await import("../../health/route");

    expect(topLevel.GET).toBe(api.GET);
  });

  test("returns readiness ok when required config and database are available", async () => {
    queryRawMock.mockResolvedValueOnce([{ "?column?": 1 }]);
    const { GET } = await import("../readiness/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      status: "ok",
      service: "web",
      releaseScope: "phase-i-phase-1-5-no-queueing",
      checks: {
        database: "ok",
        requiredConfig: "ok",
        missingConfig: [],
      },
    });
  });

  test("returns degraded readiness when required config is missing", async () => {
    delete process.env.S3_ENDPOINT;
    queryRawMock.mockResolvedValueOnce([{ "?column?": 1 }]);
    const { GET } = await import("../readiness/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.requiredConfig).toBe("missing");
    expect(body.checks.missingConfig).toContain("S3_ENDPOINT");
  });

  test("returns user-safe readiness failure when database is unavailable", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("connection refused"));
    const { GET } = await import("../readiness/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: "error",
      service: "web",
      checks: {
        database: "unavailable",
        requiredConfig: "ok",
      },
    });
  });

  test("top-level readiness route reuses the API readiness handler and dynamic mode", async () => {
    const api = await import("../readiness/route");
    const topLevel = await import("../../readiness/route");

    expect(topLevel.GET).toBe(api.GET);
    expect(topLevel.dynamic).toBe("force-dynamic");
  });
});
