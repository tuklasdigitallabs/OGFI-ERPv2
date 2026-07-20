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
import { canExportFinance } from "@/server/services/exportAuthorization";
import { buildFinanceFoundationExportRows } from "@/server/services/finance";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportFinance(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "phase-3-finance-control-center",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "phase-3-finance-control-center",
      eventType: "report.export_started"
    });
    const rows = await buildFinanceFoundationExportRows(session);
    await logOperationalExportAudit({
      session,
      reportId: "phase-3-finance-control-center",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "phase-3-finance-control-center.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "phase-3-finance-control-center"
      }),
      checksumHeader: true
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "phase-3-finance-control-center",
      error
    });
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
