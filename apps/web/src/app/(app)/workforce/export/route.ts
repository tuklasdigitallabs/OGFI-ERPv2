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
import { canExportWorkforce } from "@/server/services/exportAuthorization";
import { buildWorkforceOperationsExportRows } from "@/server/services/workforce";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportWorkforce(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "phase-3-workforce-operations",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "phase-3-workforce-operations",
      eventType: "report.export_started"
    });
    const rows = await buildWorkforceOperationsExportRows(session);
    await logOperationalExportAudit({
      session,
      reportId: "phase-3-workforce-operations",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "phase-3-workforce-operations.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "phase-3-workforce-operations"
      }),
      checksumHeader: true
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "phase-3-workforce-operations",
      error
    });
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
