import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import { canExportProjects } from "@/server/services/exportAuthorization";
import {
  buildProjectHealthExportRows,
  logProjectExportAudit
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
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    return csvExportResponse(await buildProjectHealthExportRows(session), "project-health.csv");
  } catch (error) {
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
