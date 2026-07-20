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
import { canExportStockAdjustments } from "@/server/services/exportAuthorization";
import { listStockAdjustments } from "@/server/services/stockAdjustments";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportStockAdjustments(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "stock-adjustment-report",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "stock-adjustment-report",
      eventType: "report.export_started"
    });
    const adjustments = await listStockAdjustments(session);
    const rows = [
      [
        "Reference",
        "Status",
        "Type",
        "Inventory Location",
        "Reason",
        "Requested By",
        "Line Count",
        "Quantity Delta",
        "Estimated Value Impact",
        "Created At",
        "Submitted At",
        "Posted At",
        "Posted By",
        "Reversed At",
        "Reversed By",
        "Cancelled At"
      ],
      ...adjustments.map((adjustment) => [
        adjustment.publicReference,
        adjustment.status,
        adjustment.adjustmentType,
        adjustment.inventoryLocationName,
        adjustment.reasonCode,
        adjustment.requestedByName,
        adjustment.lineCount,
        adjustment.totalQuantityDelta,
        adjustment.totalEstimatedValueImpact,
        adjustment.createdAt,
        adjustment.submittedAt ?? "",
        adjustment.postedAt ?? "",
        adjustment.postedByName ?? "",
        adjustment.reversedAt ?? "",
        adjustment.reversedByName ?? "",
        adjustment.cancelledAt ?? ""
      ])
    ];

    await logOperationalExportAudit({
      session,
      reportId: "stock-adjustment-report",
      eventType: "report.export_completed",
      rowCount: adjustments.length
    });

    return csvExportResponse(rows, "stock-adjustments.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "stock-adjustment-report"
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "stock-adjustment-report",
      error
    });
    throw error;
  }
}
