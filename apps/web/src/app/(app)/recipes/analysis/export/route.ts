import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  getExportFailureReasonCode,
  getStrictDateSearchParam,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit
} from "@/server/services/exportAudit";
import { canExportFoodCostAnalysis } from "@/server/services/exportAuthorization";
import { buildFoodCostAnalysisExportRows } from "@/server/services/recipes";

export const dynamic = "force-dynamic";

function getFilterParams(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const q = searchParams.get("q") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const actualQ = searchParams.get("actualQ") ?? undefined;
  const movementType = searchParams.get("movementType") ?? undefined;
  const businessDate = getStrictDateSearchParam(
    searchParams,
    "businessDate",
    "FOOD_COST_BUSINESS_DATE_INVALID"
  );
  return {
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(actualQ ? { actualQ } : {}),
    ...(movementType ? { movementType } : {}),
    ...(businessDate ? { businessDate } : {})
  };
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportFoodCostAnalysis(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "food-cost-analysis",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "food-cost-analysis",
      eventType: "report.export_started"
    });
    const rows = await buildFoodCostAnalysisExportRows(
      session,
      getFilterParams(request)
    );
    await logOperationalExportAudit({
      session,
      reportId: "food-cost-analysis",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "food-cost-analysis.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "food-cost-analysis"
      })
    });
  } catch (error) {
    await logOperationalExportAudit({
      session,
      reportId: "food-cost-analysis",
      eventType: "report.export_failed",
      reasonCode: getExportFailureReasonCode(error)
    });
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
