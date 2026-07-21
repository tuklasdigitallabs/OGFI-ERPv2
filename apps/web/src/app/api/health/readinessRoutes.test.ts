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
    process.env.APP_ENV = "development";
    process.env.EVIDENCE_STORAGE_PROVIDER = "local-private";
    process.env.EVIDENCE_LOCAL_STORAGE_ROOT = ".local/test-evidence";
    process.env.EVIDENCE_LOCAL_SCAN_MODE = "explicit-test-clean";
    process.env.EVIDENCE_READINESS_LIVE_CHECK = "false";
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
        evidenceProviderConfigured: true,
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
        evidenceConfiguration: "ok",
        evidenceProviderClass: "local-development-storage",
        evidenceProductionSafe: false,
        objectStorage: "ok",
        malwareScan: "ok",
        liveProviderChecks: "not_checked",
      },
      issueCodes: [],
    });
  });

  test("returns degraded readiness when required config is missing", async () => {
    delete process.env.EVIDENCE_STORAGE_PROVIDER;
    queryRawMock.mockResolvedValueOnce([{ "?column?": 1 }]);
    const { GET } = await import("../readiness/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.evidenceConfiguration).toBe("degraded");
    expect(body.issueCodes).toContain("EVIDENCE_STORAGE_PROVIDER_INVALID");
  });

  test("returns user-safe readiness failure when database is unavailable", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("connection refused"));
    const { GET } = await import("../readiness/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      service: "web",
      checks: {
        database: "unavailable",
        evidenceConfiguration: "ok",
      },
    });
  });

  test("fails closed in production without revealing storage identifiers", async () => {
    process.env.APP_ENV = "production";
    process.env.EVIDENCE_STORAGE_PROVIDER = "local-private";
    queryRawMock.mockResolvedValueOnce([{ "?column?": 1 }]);
    const { GET } = await import("../readiness/route");

    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.issueCodes).toContain(
      "EVIDENCE_STORAGE_PROVIDER_HOSTED_INVALID",
    );
    expect(serialized).not.toContain(process.env.EVIDENCE_LOCAL_STORAGE_ROOT);
  });

  test("top-level readiness route reuses the API readiness handler and dynamic mode", async () => {
    const api = await import("../readiness/route");
    const topLevel = await import("../../readiness/route");

    expect(topLevel.GET).toBe(api.GET);
    expect(topLevel.dynamic).toBe("force-dynamic");
  });
});
