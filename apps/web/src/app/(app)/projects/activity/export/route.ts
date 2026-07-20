import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import { buildReportCsvMetadata } from "@/server/services/exportAudit";
import { canExportProjects } from "@/server/services/exportAuthorization";
import {
  buildProjectActivityLogExportRows,
  logProjectExportAudit,
  logProjectExportFailure
} from "@/server/services/projectReports";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportProjects(session)) {
    await logProjectExportAudit({
      session,
      eventType: "project_report.export_denied",
      reportId: "project-activity-log",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    return csvExportResponse(
      await buildProjectActivityLogExportRows(session),
      "project-activity-log.csv",
      {
        metadata: await buildReportCsvMetadata({
          session,
          reportId: "project-activity-log"
        })
      }
    );
  } catch (error) {
    await logProjectExportFailure({
      session,
      reportId: "project-activity-log",
      error
    });
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
