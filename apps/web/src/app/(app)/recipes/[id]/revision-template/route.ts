import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  exportPermissionDeniedResponse,
  getExportFailureReasonCode
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit
} from "@/server/services/exportAudit";
import { canExportRecipeCosting } from "@/server/services/exportAuthorization";
import { buildRecipeRevisionWorkbookRows } from "@/server/services/recipes";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportRecipeCosting(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "recipe-revision-workbook",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  const { id } = await params;
  try {
    await logOperationalExportAudit({
      session,
      reportId: "recipe-revision-workbook",
      eventType: "report.export_started"
    });
    const rows = await buildRecipeRevisionWorkbookRows(session, id);
    await logOperationalExportAudit({
      session,
      reportId: "recipe-revision-workbook",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "recipe-revision-workbook.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "recipe-revision-workbook",
        extra: [
          ["Recipe ID", id],
          ["Boundary", "Planning export only; apply changes through Create Revision Draft"]
        ]
      })
    });
  } catch (error) {
    await logOperationalExportAudit({
      session,
      reportId: "recipe-revision-workbook",
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
