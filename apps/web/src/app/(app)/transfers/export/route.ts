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
import { buildInventoryTransferExportRows } from "@/server/services/transfers";

export const dynamic = "force-dynamic";

export async function GET() {
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

  try {
    await logOperationalExportAudit({
      session,
      reportId: "transfer-status",
      eventType: "report.export_started"
    });
    const rows = await buildInventoryTransferExportRows(session);
    await logOperationalExportAudit({
      session,
      reportId: "transfer-status",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "inventory-transfers.csv", {
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
