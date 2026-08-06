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
import { canExportStockAdjustments } from "@/server/services/exportAuthorization";
import { getReportExportPolicy } from "@/server/services/policySettings";
import {
  listStockAdjustments,
  resolveStockAdjustmentDashboardProfile
} from "@/server/services/stockAdjustments";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

  const profileParam = new URL(request.url).searchParams.get("dashboard") ?? undefined;
  const profile = resolveStockAdjustmentDashboardProfile(profileParam);
  if (profileParam && !profile) {
    return exportErrorResponse(
      new Error("STOCK_ADJUSTMENT_DASHBOARD_PROFILE_UNSUPPORTED")
    )!;
  }
  const exportPolicy = await getReportExportPolicy(session);
  const auditMetadata = {
    maxRows: exportPolicy.maxRows,
    profileApplied: Boolean(profile)
  };

  try {
    await logOperationalExportAudit({
      session,
      reportId: "stock-adjustment-report",
      eventType: "report.export_started",
      metadata: auditMetadata
    });
    const adjustments = await listStockAdjustments(session, profile ?? undefined, {
      maxRows: exportPolicy.maxRows
    });
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
      rowCount: adjustments.length,
      metadata: auditMetadata
    });

    return csvExportResponse(
      rows,
      profile ? "stock-adjustment-exceptions.csv" : "stock-adjustments.csv",
      {
        metadata: await buildReportCsvMetadata({
          session,
          reportId: "stock-adjustment-report",
          extra: [["Maximum Rows", exportPolicy.maxRows]]
        })
      }
    );
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "stock-adjustment-report",
      error,
      metadata: auditMetadata
    });
    const response = exportErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
