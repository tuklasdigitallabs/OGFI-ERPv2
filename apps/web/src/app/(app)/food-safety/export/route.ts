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
import { canExportFoodSafety } from "@/server/services/exportAuthorization";
import { buildFoodSafetyExportRows } from "@/server/services/foodSafety";

export const dynamic = "force-dynamic";

function getFilterParams(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const q = searchParams.get("q") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const businessDate = getStrictDateSearchParam(
    searchParams,
    "businessDate",
    "FOOD_SAFETY_BUSINESS_DATE_INVALID"
  );
  return {
    ...(q ? { q } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(businessDate ? { businessDate } : {})
  };
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportFoodSafety(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "food-safety-exceptions",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "food-safety-exceptions",
      eventType: "report.export_started"
    });
    const rows = await buildFoodSafetyExportRows(session, getFilterParams(request));
    await logOperationalExportAudit({
      session,
      reportId: "food-safety-exceptions",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "food-safety-exceptions.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "food-safety-exceptions"
      })
    });
  } catch (error) {
    await logOperationalExportAudit({
      session,
      reportId: "food-safety-exceptions",
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
