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
import { canExportInventoryTransfers } from "@/server/services/exportAuthorization";
import {
  buildInventoryTransferExportRows,
  resolveTransferDashboardProfile
} from "@/server/services/transfers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportInventoryTransfers(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "transfer-status",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  const profileParam = new URL(request.url).searchParams.get("dashboard") ?? undefined;
  const profile = resolveTransferDashboardProfile(profileParam);
  if (profileParam && !profile) {
    return new Response("Unsupported transfer dashboard profile.", { status: 400 });
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "transfer-status",
      eventType: "report.export_started"
    });
    const rows = await buildInventoryTransferExportRows(session, profile ?? undefined);
    await logOperationalExportAudit({
      session,
      reportId: "transfer-status",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, profile ? "transfer-follow-up.csv" : "inventory-transfers.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "transfer-status"
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "transfer-status",
      error
    });
    throw error;
  }
}
