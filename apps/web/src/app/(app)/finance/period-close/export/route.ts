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
import { buildPeriodCloseExportRows } from "@/server/services/financePeriodClose";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportFinance(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "phase-3-period-close",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "phase-3-period-close",
      eventType: "report.export_started"
    });
    const rows = await buildPeriodCloseExportRows(session);
    await logOperationalExportAudit({
      session,
      reportId: "phase-3-period-close",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "phase-3-period-close.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "phase-3-period-close"
      }),
      checksumHeader: true
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "phase-3-period-close",
      error
    });
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
