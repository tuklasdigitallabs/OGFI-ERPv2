import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  canExport: vi.fn(),
  listOrdinary: vi.fn(),
  listProfile: vi.fn(),
  audit: vi.fn(),
  auditFailure: vi.fn(),
  buildMetadata: vi.fn(),
  exportPolicy: vi.fn(),
  csv: vi.fn()
}));

vi.mock("@/server/services/context", () => ({ getSessionContext: mocks.session }));
vi.mock("@/server/services/exportAuthorization", () => ({
  canExportInventoryBalances: mocks.canExport
}));
vi.mock("@/server/services/exportAudit", () => ({
  logOperationalExportAudit: mocks.audit,
  logOperationalExportFailure: mocks.auditFailure,
  buildReportCsvMetadata: mocks.buildMetadata
}));
vi.mock("@/server/services/policySettings", () => ({
  getReportExportPolicy: mocks.exportPolicy
}));
vi.mock("@/server/services/csv", () => ({
  csvExportResponse: mocks.csv
}));
vi.mock("@/server/services/inventory", () => ({
  listInventoryBalances: mocks.listOrdinary,
  listInventoryPositiveStockProfileExportRows: mocks.listProfile,
  resolveInventoryBalanceDashboardRequest: (
    profileValue: string | string[] | undefined,
    queryValue: string | string[] | undefined
  ) => {
    if (typeof profileValue !== "string" || profileValue !== "positive-stock-v1") {
      return { profile: null, query: "", error: "PROFILE_INVALID" };
    }
    if (Array.isArray(queryValue) || (queryValue?.trim().length ?? 0) > 120) {
      return { profile: profileValue, query: "", error: "SEARCH_INVALID" };
    }
    return { profile: profileValue, query: queryValue?.trim() ?? "", error: null };
  }
}));

import { GET } from "./route";

const session = {
  user: { id: "user-1" },
  context: { companyId: "company-1", locationId: "location-1" }
};

describe("positive-stock profile export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue(session);
    mocks.canExport.mockReturnValue(true);
    mocks.exportPolicy.mockResolvedValue({ maxRows: 100 });
    mocks.listProfile.mockResolvedValue([]);
    mocks.buildMetadata.mockResolvedValue([]);
    mocks.csv.mockImplementation((_rows, filename) => new Response(filename));
  });

  test("rejects duplicate and widening profile parameters before balance reads", async () => {
    const duplicate = await GET(new Request(
      "https://erp.test/inventory/export?dashboard=positive-stock-v1&q=rice&q=oil"
    ));
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toEqual({
      error: "INVENTORY_BALANCE_DASHBOARD_PROFILE_SEARCH_INVALID"
    });

    const override = await GET(new Request(
      "https://erp.test/inventory/export?dashboard=positive-stock-v1&tab=all"
    ));
    expect(override.status).toBe(400);
    expect(mocks.listProfile).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  test("returns the safe capped-export error and records aggregate-only audit metadata", async () => {
    mocks.listProfile.mockRejectedValueOnce(
      new Error("REPORT_EXPORT_ROW_LIMIT_EXCEEDED")
    );
    const response = await GET(new Request(
      "https://erp.test/inventory/export?dashboard=positive-stock-v1&q=secret-search"
    ));

    expect(response.status).toBe(413);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "report.export_started",
      metadata: {
        dashboardProfile: "positive-stock-v1",
        maxRows: 100
      }
    }));
    expect(mocks.auditFailure).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        dashboardProfile: "positive-stock-v1",
        maxRows: 100
      }
    }));
    expect(JSON.stringify([
      ...mocks.audit.mock.calls,
      ...mocks.auditFailure.mock.calls
    ])).not.toContain("secret-search");
  });

  test("audits completed row count without recording search text", async () => {
    mocks.listProfile.mockResolvedValueOnce([{ itemName: "Rice" }]);
    const response = await GET(new Request(
      "https://erp.test/inventory/export?dashboard=positive-stock-v1&q=rice"
    ));

    expect(response.status).toBe(200);
    expect(mocks.listProfile).toHaveBeenCalledWith(session, {
      profile: "positive-stock-v1",
      query: "rice",
      maxRows: 100
    });
    expect(mocks.audit).toHaveBeenLastCalledWith(expect.objectContaining({
      eventType: "report.export_completed",
      rowCount: 1,
      metadata: {
        dashboardProfile: "positive-stock-v1",
        maxRows: 100
      }
    }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("rice");
  });
});
