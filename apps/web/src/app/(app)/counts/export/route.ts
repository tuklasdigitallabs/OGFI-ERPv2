import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit,
  logOperationalExportFailure
} from "@/server/services/exportAudit";
import { canExportStockCounts } from "@/server/services/exportAuthorization";
import { buildStockCountExportRows } from "@/server/services/stockCounts";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportStockCounts(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "stock-count-variance",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "stock-count-variance",
      eventType: "report.export_started"
    });
    const rows = await buildStockCountExportRows(session);
    await logOperationalExportAudit({
      session,
      reportId: "stock-count-variance",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });
    return csvExportResponse(rows, "stock-counts.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "stock-count-variance"
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "stock-count-variance",
      error
    });
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
