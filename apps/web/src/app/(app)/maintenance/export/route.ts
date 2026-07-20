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
import { canExportMaintenance } from "@/server/services/exportAuthorization";
import { buildMaintenanceExportRows } from "@/server/services/maintenance";

export const dynamic = "force-dynamic";

function getFilterParams(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const q = searchParams.get("q") ?? undefined;
  const requestedAt = getStrictDateSearchParam(
    searchParams,
    "requestedAt",
    "MAINTENANCE_REQUESTED_AT_FILTER_INVALID"
  );
  const status = searchParams.get("status") ?? undefined;
  const priority = searchParams.get("priority") ?? undefined;
  return {
    ...(q ? { q } : {}),
    ...(requestedAt ? { requestedAt } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {})
  };
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportMaintenance(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "maintenance-sla-downtime",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "maintenance-sla-downtime",
      eventType: "report.export_started"
    });
    const rows = await buildMaintenanceExportRows(session, getFilterParams(request));
    await logOperationalExportAudit({
      session,
      reportId: "maintenance-sla-downtime",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "maintenance-sla-downtime.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "maintenance-sla-downtime"
      })
    });
  } catch (error) {
    await logOperationalExportAudit({
      session,
      reportId: "maintenance-sla-downtime",
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
