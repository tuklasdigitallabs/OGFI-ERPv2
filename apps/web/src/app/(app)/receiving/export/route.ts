import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit,
  logOperationalExportFailure
} from "@/server/services/exportAudit";
import { canExportReceivingReports } from "@/server/services/exportAuthorization";
import { buildReceivingReportExportRows } from "@/server/services/receiving";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportReceivingReports(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "receiving-reports",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "receiving-reports",
      eventType: "report.export_started"
    });
    const rows = await buildReceivingReportExportRows(session);
    await logOperationalExportAudit({
      session,
      reportId: "receiving-reports",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "receiving-reports.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "receiving-reports"
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "receiving-reports",
      error
    });
    throw error;
  }
}
