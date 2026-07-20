import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "./context";

const mockServices = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  csvExportResponse: vi.fn(
    (rows: unknown[], filename: string) =>
      new Response(JSON.stringify({ filename, rows }), {
        headers: { "Content-Type": "application/json" }
      })
  ),
  buildReportCsvMetadata: vi.fn(),
  logOperationalExportAudit: vi.fn(),
  canExportRecipeCosting: vi.fn(),
  canExportFoodCostAnalysis: vi.fn(),
  canExportBranchOperations: vi.fn(),
  canExportFoodSafety: vi.fn(),
  canExportIncidents: vi.fn(),
  canExportMaintenance: vi.fn(),
  buildRecipeCostingExportRows: vi.fn(),
  buildRecipeRevisionWorkbookRows: vi.fn(),
  buildFoodCostAnalysisExportRows: vi.fn(),
  buildBranchOperationsExportRows: vi.fn(),
  buildFoodSafetyExportRows: vi.fn(),
  buildIncidentExportRows: vi.fn(),
  buildMaintenanceExportRows: vi.fn()
}));

const reportMetadata = [["Report metadata", "Test"]];

vi.mock("@/server/services/context", () => ({
  getSessionContext: mockServices.getSessionContext
}));

vi.mock("@/server/services/csv", () => ({
  csvExportResponse: mockServices.csvExportResponse
}));

vi.mock("@/server/services/exportAudit", () => ({
  buildReportCsvMetadata: mockServices.buildReportCsvMetadata,
  logOperationalExportAudit: mockServices.logOperationalExportAudit
}));

vi.mock("@/server/services/exportErrors", () => {
  const validationErrorCodes = new Set([
    "BRANCH_OPERATIONS_BUSINESS_DATE_INVALID",
    "FOOD_COST_BUSINESS_DATE_INVALID",
    "FOOD_SAFETY_BUSINESS_DATE_INVALID",
    "INCIDENT_FILTER_DATE_INVALID",
    "MAINTENANCE_REQUESTED_AT_FILTER_INVALID"
  ]);
  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

  function jsonError(error: string, status: number) {
    return Response.json({ error }, { status });
  }

  return {
    exportAuthRequiredResponse: () => jsonError("AUTH_REQUIRED", 401),
    exportPermissionDeniedResponse: () => jsonError("PERMISSION_DENIED", 403),
    exportErrorResponse: (error: unknown) => {
      if (error instanceof Error && validationErrorCodes.has(error.message)) {
        return jsonError(error.message, 400);
      }
      return null;
    },
    getExportFailureReasonCode: (error: unknown) =>
      error instanceof Error ? error.message : "EXPORT_FAILED",
    getStrictDateSearchParam: (
      searchParams: URLSearchParams,
      key: string,
      errorCode: string
    ) => {
      const value = searchParams.get(key) ?? undefined;
      if (!value) {
        return undefined;
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      const isValid =
        dateOnlyPattern.test(value) &&
        !Number.isNaN(date.getTime()) &&
        date.toISOString().startsWith(value);
      if (!isValid) {
        throw new Error(errorCode);
      }
      return value;
    }
  };
});

vi.mock("@/server/services/exportAuthorization", () => ({
  canExportRecipeCosting: mockServices.canExportRecipeCosting,
  canExportFoodCostAnalysis: mockServices.canExportFoodCostAnalysis,
  canExportBranchOperations: mockServices.canExportBranchOperations,
  canExportFoodSafety: mockServices.canExportFoodSafety,
  canExportIncidents: mockServices.canExportIncidents,
  canExportMaintenance: mockServices.canExportMaintenance
}));

vi.mock("@/server/services/recipes", () => ({
  buildRecipeCostingExportRows: mockServices.buildRecipeCostingExportRows,
  buildRecipeRevisionWorkbookRows: mockServices.buildRecipeRevisionWorkbookRows,
  buildFoodCostAnalysisExportRows: mockServices.buildFoodCostAnalysisExportRows
}));

vi.mock("@/server/services/branchOperations", () => ({
  buildBranchOperationsExportRows: mockServices.buildBranchOperationsExportRows
}));

vi.mock("@/server/services/foodSafety", () => ({
  buildFoodSafetyExportRows: mockServices.buildFoodSafetyExportRows
}));

vi.mock("@/server/services/incidents", () => ({
  buildIncidentExportRows: mockServices.buildIncidentExportRows
}));

vi.mock("@/server/services/maintenance", () => ({
  buildMaintenanceExportRows: mockServices.buildMaintenanceExportRows
}));

import { GET as recipeCostingExportGET } from "../../app/(app)/recipes/export/route";
import { GET as recipeRevisionWorkbookGET } from "../../app/(app)/recipes/[id]/revision-template/route";
import { GET as foodCostAnalysisExportGET } from "../../app/(app)/recipes/analysis/export/route";
import { GET as branchOperationsExportGET } from "../../app/(app)/branch-operations/export/route";
import { GET as foodSafetyExportGET } from "../../app/(app)/food-safety/export/route";
import { GET as incidentsExportGET } from "../../app/(app)/incidents/export/route";
import { GET as maintenanceExportGET } from "../../app/(app)/maintenance/export/route";

const session: SessionContext = {
  user: {
    id: "user-1",
    email: "admin@ogfi.example",
    displayName: "ERP Administrator",
    role: "ERP Administrator"
  },
  context: {
    tenantId: "tenant-1",
    companyId: "company-1",
    companyName: "One Gourmet Foods Inc.",
    brandId: "brand-1",
    brandName: "Yakiniku Like",
    locationId: "location-1",
    locationName: "SM North Edsa",
    locationType: "BRANCH"
  },
  authorizedLocations: [],
  permissionCodes: []
};

const exportRows = [
  ["Header"],
  ["Row 1"],
  ["Row 2"]
];

const routeCases = [
  {
    name: "recipe costing",
    GET: recipeCostingExportGET,
    builder: mockServices.buildRecipeCostingExportRows,
    permission: mockServices.canExportRecipeCosting,
    reportId: "recipe-costing",
    url: "/recipes/export?q=beef&type=STANDARD&status=APPROVED&foo=ignored",
    expectedFilter: {
      q: "beef",
      type: "STANDARD",
      status: "APPROVED"
    },
    filename: "recipe-costing.csv"
  },
  {
    name: "food-cost analysis",
    GET: foodCostAnalysisExportGET,
    builder: mockServices.buildFoodCostAnalysisExportRows,
    permission: mockServices.canExportFoodCostAnalysis,
    reportId: "food-cost-analysis",
    url:
      "/recipes/analysis/export?q=beef&businessDate=2026-07-01&status=POSTED&actualQ=variance&movementType=RECEIPT&foo=ignored",
    expectedFilter: {
      q: "beef",
      status: "POSTED",
      actualQ: "variance",
      movementType: "RECEIPT",
      businessDate: "2026-07-01"
    },
    filename: "food-cost-analysis.csv"
  },
  {
    name: "branch operations",
    GET: branchOperationsExportGET,
    builder: mockServices.buildBranchOperationsExportRows,
    permission: mockServices.canExportBranchOperations,
    reportId: "branch-checklist-compliance",
    url:
      "/branch-operations/export?q=opening&businessDate=2026-07-01&shift=OPENING&status=SUBMITTED&foo=ignored",
    expectedFilter: {
      q: "opening",
      shift: "OPENING",
      status: "SUBMITTED",
      businessDate: "2026-07-01"
    },
    filename: "branch-checklist-compliance.csv"
  },
  {
    name: "food safety",
    GET: foodSafetyExportGET,
    builder: mockServices.buildFoodSafetyExportRows,
    permission: mockServices.canExportFoodSafety,
    reportId: "food-safety-exceptions",
    url:
      "/food-safety/export?q=chiller&type=TEMPERATURE&status=EXCEPTION_OPEN&businessDate=2026-07-01&foo=ignored",
    expectedFilter: {
      q: "chiller",
      type: "TEMPERATURE",
      status: "EXCEPTION_OPEN",
      businessDate: "2026-07-01"
    },
    filename: "food-safety-exceptions.csv"
  },
  {
    name: "incidents",
    GET: incidentsExportGET,
    builder: mockServices.buildIncidentExportRows,
    permission: mockServices.canExportIncidents,
    reportId: "incident-corrective-actions",
    url:
      "/incidents/export?q=guest&incidentDate=2026-07-01&status=OPEN&severity=HIGH&foo=ignored",
    expectedFilter: {
      q: "guest",
      incidentDate: "2026-07-01",
      status: "OPEN",
      severity: "HIGH"
    },
    filename: "incident-corrective-actions.csv"
  },
  {
    name: "maintenance",
    GET: maintenanceExportGET,
    builder: mockServices.buildMaintenanceExportRows,
    permission: mockServices.canExportMaintenance,
    reportId: "maintenance-sla-downtime",
    url:
      "/maintenance/export?q=grill&requestedAt=2026-07-01&status=PENDING_VENDOR&priority=HIGH&foo=ignored",
    expectedFilter: {
      q: "grill",
      requestedAt: "2026-07-01",
      status: "PENDING_VENDOR",
      priority: "HIGH"
    },
    filename: "maintenance-sla-downtime.csv"
  }
] as const;

const dateValidationCases = [
  {
    name: "food-cost analysis",
    GET: foodCostAnalysisExportGET,
    builder: mockServices.buildFoodCostAnalysisExportRows,
    reportId: "food-cost-analysis",
    url: "/recipes/analysis/export?businessDate=2026-02-31",
    errorCode: "FOOD_COST_BUSINESS_DATE_INVALID"
  },
  {
    name: "branch operations",
    GET: branchOperationsExportGET,
    builder: mockServices.buildBranchOperationsExportRows,
    reportId: "branch-checklist-compliance",
    url: "/branch-operations/export?businessDate=bad-date",
    errorCode: "BRANCH_OPERATIONS_BUSINESS_DATE_INVALID"
  },
  {
    name: "food safety",
    GET: foodSafetyExportGET,
    builder: mockServices.buildFoodSafetyExportRows,
    reportId: "food-safety-exceptions",
    url: "/food-safety/export?businessDate=2026-13-01",
    errorCode: "FOOD_SAFETY_BUSINESS_DATE_INVALID"
  },
  {
    name: "incidents",
    GET: incidentsExportGET,
    builder: mockServices.buildIncidentExportRows,
    reportId: "incident-corrective-actions",
    url: "/incidents/export?incidentDate=2026-00-01",
    errorCode: "INCIDENT_FILTER_DATE_INVALID"
  },
  {
    name: "maintenance",
    GET: maintenanceExportGET,
    builder: mockServices.buildMaintenanceExportRows,
    reportId: "maintenance-sla-downtime",
    url: "/maintenance/export?requestedAt=2026-04-31",
    errorCode: "MAINTENANCE_REQUESTED_AT_FILTER_INVALID"
  }
] as const;

function request(path: string) {
  return new Request(`http://localhost${path}`);
}

describe("Phase 2 export route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices.getSessionContext.mockResolvedValue(session);
    for (const routeCase of routeCases) {
      routeCase.permission.mockReturnValue(true);
      routeCase.builder.mockResolvedValue(exportRows);
    }
    mockServices.canExportRecipeCosting.mockReturnValue(true);
    mockServices.buildRecipeRevisionWorkbookRows.mockResolvedValue(exportRows);
    mockServices.buildReportCsvMetadata.mockResolvedValue(reportMetadata);
  });

  it.each(routeCases)(
    "maps scoped query filters and audits successful $name exports",
    async ({ GET, builder, expectedFilter, filename, reportId, url }) => {
      const response = await GET(request(url));

      expect(response.status).toBe(200);
      expect(builder).toHaveBeenCalledTimes(1);
      expect(builder).toHaveBeenCalledWith(session, expectedFilter);
      expect(builder.mock.calls[0]?.[1]).not.toHaveProperty("foo");
      expect(mockServices.csvExportResponse).toHaveBeenCalledWith(
        exportRows,
        filename,
        expect.objectContaining({ metadata: reportMetadata })
      );
      expect(mockServices.logOperationalExportAudit).toHaveBeenNthCalledWith(1, {
        session,
        reportId,
        eventType: "report.export_started"
      });
      expect(mockServices.logOperationalExportAudit).toHaveBeenNthCalledWith(2, {
        session,
        reportId,
        eventType: "report.export_completed",
        rowCount: 2
      });
    }
  );

  it.each(dateValidationCases)(
    "rejects invalid $name date filters before building rows",
    async ({ GET, builder, errorCode, reportId, url }) => {
      const response = await GET(request(url));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: errorCode });
      expect(builder).not.toHaveBeenCalled();
      expect(mockServices.logOperationalExportAudit).toHaveBeenNthCalledWith(1, {
        session,
        reportId,
        eventType: "report.export_started"
      });
      expect(mockServices.logOperationalExportAudit).toHaveBeenNthCalledWith(2, {
        session,
        reportId,
        eventType: "report.export_failed",
        reasonCode: errorCode
      });
    }
  );

  it.each(routeCases)(
    "requires an authenticated session before exporting $name",
    async ({ GET, builder, url }) => {
      mockServices.getSessionContext.mockResolvedValueOnce(null);

      const response = await GET(request(url));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
      expect(builder).not.toHaveBeenCalled();
      expect(mockServices.logOperationalExportAudit).not.toHaveBeenCalled();
    }
  );

  it.each(routeCases)(
    "logs and denies unauthorized $name exports before building rows",
    async ({ GET, builder, permission, reportId, url }) => {
      permission.mockReturnValueOnce(false);

      const response = await GET(request(url));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "PERMISSION_DENIED"
      });
      expect(builder).not.toHaveBeenCalled();
      expect(mockServices.logOperationalExportAudit).toHaveBeenCalledOnce();
      expect(mockServices.logOperationalExportAudit).toHaveBeenCalledWith({
        session,
        reportId,
        eventType: "report.export_denied",
        reasonCode: "PERMISSION_DENIED"
      });
    }
  );

  it("does not leak filters or mutate shared objects across repeated requests", async () => {
    const routeCase = routeCases[2];

    await routeCase.GET(request(routeCase.url));
    await routeCase.GET(request(routeCase.url));

    expect(routeCase.builder).toHaveBeenCalledTimes(2);
    expect(routeCase.builder.mock.calls[0]?.[1]).toEqual(
      routeCase.expectedFilter
    );
    expect(routeCase.builder.mock.calls[1]?.[1]).toEqual(
      routeCase.expectedFilter
    );
    expect(routeCase.builder.mock.calls[0]?.[1]).not.toBe(
      routeCase.builder.mock.calls[1]?.[1]
    );
  });

  it("exports recipe revision workbooks with source recipe context and audit history", async () => {
    const response = await recipeRevisionWorkbookGET(request("/recipes/recipe-1/revision-template"), {
      params: Promise.resolve({ id: "recipe-1" })
    });

    expect(response.status).toBe(200);
    expect(mockServices.buildRecipeRevisionWorkbookRows).toHaveBeenCalledOnce();
    expect(mockServices.buildRecipeRevisionWorkbookRows).toHaveBeenCalledWith(
      session,
      "recipe-1"
    );
    expect(mockServices.csvExportResponse).toHaveBeenCalledWith(
      exportRows,
      "recipe-revision-workbook.csv",
      expect.objectContaining({ metadata: reportMetadata })
    );
    expect(mockServices.logOperationalExportAudit).toHaveBeenNthCalledWith(1, {
      session,
      reportId: "recipe-revision-workbook",
      eventType: "report.export_started"
    });
    expect(mockServices.logOperationalExportAudit).toHaveBeenNthCalledWith(2, {
      session,
      reportId: "recipe-revision-workbook",
      eventType: "report.export_completed",
      rowCount: 2
    });
  });

  it("requires recipe export permission before building revision workbooks", async () => {
    mockServices.canExportRecipeCosting.mockReturnValueOnce(false);

    const response = await recipeRevisionWorkbookGET(request("/recipes/recipe-1/revision-template"), {
      params: Promise.resolve({ id: "recipe-1" })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "PERMISSION_DENIED"
    });
    expect(mockServices.buildRecipeRevisionWorkbookRows).not.toHaveBeenCalled();
    expect(mockServices.logOperationalExportAudit).toHaveBeenCalledOnce();
    expect(mockServices.logOperationalExportAudit).toHaveBeenCalledWith({
      session,
      reportId: "recipe-revision-workbook",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
  });
});
