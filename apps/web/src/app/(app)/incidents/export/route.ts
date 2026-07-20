import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  getExportFailureReasonCode,
  getStrictDateSearchParam,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit
} from "@/server/services/exportAudit";
import { canExportIncidents } from "@/server/services/exportAuthorization";
import { buildIncidentExportRows } from "@/server/services/incidents";

export const dynamic = "force-dynamic";

function getFilterParams(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const q = searchParams.get("q") ?? undefined;
  const incidentDate = getStrictDateSearchParam(
    searchParams,
    "incidentDate",
    "INCIDENT_FILTER_DATE_INVALID"
  );
  const status = searchParams.get("status") ?? undefined;
  const severity = searchParams.get("severity") ?? undefined;
  return {
    ...(q ? { q } : {}),
    ...(incidentDate ? { incidentDate } : {}),
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {})
  };
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportIncidents(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "incident-corrective-actions",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "incident-corrective-actions",
      eventType: "report.export_started"
    });
    const rows = await buildIncidentExportRows(session, getFilterParams(request));
    await logOperationalExportAudit({
      session,
      reportId: "incident-corrective-actions",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "incident-corrective-actions.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "incident-corrective-actions"
      })
    });
  } catch (error) {
    await logOperationalExportAudit({
      session,
      reportId: "incident-corrective-actions",
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
