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
  buildProjectTaskRegisterExportRows,
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
      reportId: "project-task-register",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    return csvExportResponse(
      await buildProjectTaskRegisterExportRows(session),
      "project-task-register.csv",
      {
        metadata: await buildReportCsvMetadata({
          session,
          reportId: "project-task-register"
        })
      }
    );
  } catch (error) {
    await logProjectExportFailure({
      session,
      reportId: "project-task-register",
      error
    });
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
