import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  canExport: vi.fn(),
  list: vi.fn(),
  audit: vi.fn(),
  auditFailure: vi.fn(),
  buildMetadata: vi.fn(),
  exportPolicy: vi.fn(),
  csv: vi.fn()
}));

vi.mock("@/server/services/context", () => ({ getSessionContext: mocks.session }));
vi.mock("@/server/services/exportAuthorization", () => ({
  canExportInventoryLedgerVariance: mocks.canExport
}));
vi.mock("@/server/services/inventory", () => ({
  listInventoryLedgerVarianceExportRows: mocks.list,
  maxInventorySearchLength: 120,
  resolveInventoryDashboardProfile: (value?: string) =>
    value === "ledger-variance-v1" ? value : null
}));
vi.mock("@/server/services/exportAudit", () => ({
  buildReportCsvMetadata: mocks.buildMetadata,
  logOperationalExportAudit: mocks.audit,
  logOperationalExportFailure: mocks.auditFailure
}));
vi.mock("@/server/services/policySettings", () => ({
  getReportExportPolicy: mocks.exportPolicy
}));
vi.mock("@/server/services/csv", () => ({
  csvExportResponse: mocks.csv
}));
vi.mock("@/server/services/exportErrors", () => ({
  exportAuthRequiredResponse: () => new Response("auth", { status: 401 }),
  exportPermissionDeniedResponse: () => new Response("denied", { status: 403 }),
  exportErrorResponse: (error: unknown) => {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return new Response(JSON.stringify({ error: code }), {
      status: code === "REPORT_EXPORT_ROW_LIMIT_EXCEEDED" ? 413 : 400,
      headers: { "content-type": "application/json" }
    });
  }
}));

import { GET } from "./route";

const session = {
  user: { id: "user-1" },
  context: {
    tenantId: "tenant-1",
    companyId: "company-1",
    companyName: "OGFI",
    locationId: "location-1",
    locationName: "Branch",
    locationType: "BRANCH"
  }
};

describe("ledger variance export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue(session);
    mocks.canExport.mockReturnValue(true);
    mocks.exportPolicy.mockResolvedValue({ maxRows: 100 });
    mocks.list.mockResolvedValue({
      rows: [{ itemCode: "RICE", varianceQuantity: 1 }],
      totalItems: 1,
      query: null,
      generatedAt: "2026-07-31T00:00:00.000Z"
    });
    mocks.buildMetadata.mockResolvedValue([]);
    mocks.csv.mockImplementation((_rows, filename) => new Response(filename));
  });

  test("passes the configured cap and records only aggregate search state", async () => {
    const response = await GET(new Request(
      "https://erp.test/inventory/reconciliation/export?dashboard=ledger-variance-v1&q=rice"
    ));

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(session, {
      query: "rice",
      maxRows: 100
    });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("rice");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "report.export_started",
      metadata: {
        dashboardProfile: "ledger-variance-v1",
        searchApplied: true,
        maxRows: 100
      }
    }));
  });

  test("returns 413 and records failure without a completed event when capped", async () => {
    mocks.list.mockRejectedValueOnce(new Error("REPORT_EXPORT_ROW_LIMIT_EXCEEDED"));

    const response = await GET(new Request(
      "https://erp.test/inventory/reconciliation/export?dashboard=ledger-variance-v1"
    ));

    expect(response.status).toBe(413);
    expect(mocks.auditFailure).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        dashboardProfile: "ledger-variance-v1",
        searchApplied: false,
        maxRows: 100
      }
    }));
    expect(mocks.audit.mock.calls.some(([input]) => input.eventType === "report.export_completed")).toBe(false);
    expect(mocks.csv).not.toHaveBeenCalled();
  });
});
