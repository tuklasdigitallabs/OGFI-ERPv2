import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import { canExportProjects } from "@/server/services/exportAuthorization";
import {
  buildProjectLinkedRecordFollowUpExportRows,
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
      reportId: "project-linked-record-follow-up",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    return csvExportResponse(
      await buildProjectLinkedRecordFollowUpExportRows(session),
      "project-linked-record-follow-up.csv"
    );
  } catch (error) {
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
