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
import { canExportStockCounts } from "@/server/services/exportAuthorization";
import { buildStockCountExportRows } from "@/server/services/stockCounts";
import { getReportExportPolicy } from "@/server/services/policySettings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportStockCounts(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "stock-count-variance",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }
  const exportPolicy = await getReportExportPolicy(session);
  const auditMetadata = { maxRows: exportPolicy.maxRows };

  try {
    await logOperationalExportAudit({
      session,
      reportId: "stock-count-variance",
      eventType: "report.export_started",
      metadata: auditMetadata
    });
    const rows = await buildStockCountExportRows(session, {
      maxRows: exportPolicy.maxRows
    });
    await logOperationalExportAudit({
      session,
      reportId: "stock-count-variance",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1),
      metadata: auditMetadata
    });
    return csvExportResponse(rows, "stock-counts.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "stock-count-variance",
        extra: [["Maximum Rows", exportPolicy.maxRows]]
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "stock-count-variance",
      error,
      metadata: auditMetadata
    });
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
