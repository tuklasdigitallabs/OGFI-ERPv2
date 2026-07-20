import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  getExportFailureReasonCode,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit
} from "@/server/services/exportAudit";
import { canExportRecipeCosting } from "@/server/services/exportAuthorization";
import { buildRecipeCostingExportRows } from "@/server/services/recipes";

export const dynamic = "force-dynamic";

function getFilterParams(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const q = searchParams.get("q") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  return {
    ...(q ? { q } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {})
  };
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportRecipeCosting(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "recipe-costing",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "recipe-costing",
      eventType: "report.export_started"
    });
    const rows = await buildRecipeCostingExportRows(session, getFilterParams(request));
    await logOperationalExportAudit({
      session,
      reportId: "recipe-costing",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "recipe-costing.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "recipe-costing"
      })
    });
  } catch (error) {
    await logOperationalExportAudit({
      session,
      reportId: "recipe-costing",
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
