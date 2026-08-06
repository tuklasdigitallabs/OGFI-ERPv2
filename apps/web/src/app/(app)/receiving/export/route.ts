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
import { canExportReceivingReports } from "@/server/services/exportAuthorization";
import {
  buildReceivingReportExportRows,
  resolveReceivingDashboardProfile
} from "@/server/services/receiving";
import { getReportExportPolicy } from "@/server/services/policySettings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportReceivingReports(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "receiving-reports",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  const searchParams = new URL(request.url).searchParams;
  const profileParam = searchParams.get("dashboard") ?? undefined;
  const profile = resolveReceivingDashboardProfile(profileParam);
  if (profileParam && !profile) {
    return exportErrorResponse(
      new Error("RECEIVING_DASHBOARD_PROFILE_UNSUPPORTED")
    )!;
  }
  const query = profile ? searchParams.get("q") ?? undefined : undefined;
  const ordinaryQuery = profile ? undefined : searchParams.get("q") ?? undefined;
  const status = profile ? undefined : searchParams.get("status") ?? undefined;
  const receivedFrom = profile ? undefined : searchParams.get("receivedFrom") ?? undefined;
  const receivedTo = profile ? undefined : searchParams.get("receivedTo") ?? undefined;
  const supplierId = profile ? undefined : searchParams.get("supplierId") ?? undefined;
  const purchaseOrderId = profile ? undefined : searchParams.get("purchaseOrderId") ?? undefined;
  const receivedByUserId = profile ? undefined : searchParams.get("receivedByUserId") ?? undefined;
  const tabParam = searchParams.get("tab") ?? "all";
  const tab = ["all", "draft", "posted", "discrepancies"].includes(tabParam)
    ? (tabParam as "all" | "draft" | "posted" | "discrepancies")
    : "all";
  if (query && query.trim().length > 120) {
    return exportErrorResponse(
      new Error("RECEIVING_DASHBOARD_PROFILE_SEARCH_TOO_LONG")
    )!;
  }
  const exportPolicy = await getReportExportPolicy(session);
  const auditMetadata = {
    maxRows: exportPolicy.maxRows,
    ...(profile
      ? { dashboardProfile: profile, searchApplied: Boolean(query?.trim()) }
      : {
          tab,
          searchApplied: Boolean(ordinaryQuery?.trim()),
          statusFilterApplied: Boolean(status),
          dateRangeApplied: Boolean(receivedFrom || receivedTo),
          supplierFilterApplied: Boolean(supplierId),
          purchaseOrderFilterApplied: Boolean(purchaseOrderId),
          receiverFilterApplied: Boolean(receivedByUserId)
        })
  };

  try {
    await logOperationalExportAudit({
      session,
      reportId: "receiving-reports",
      eventType: "report.export_started",
      ...(auditMetadata ? { metadata: auditMetadata } : {})
    });
    const rows = await buildReceivingReportExportRows(
      session,
      profile ?? undefined,
      profile ? query : ordinaryQuery,
      profile ? "all" : tab,
      profile ? {} : { ...(status ? { status } : {}), ...(receivedFrom ? { receivedFrom } : {}), ...(receivedTo ? { receivedTo } : {}), ...(supplierId ? { supplierId } : {}), ...(purchaseOrderId ? { purchaseOrderId } : {}), ...(receivedByUserId ? { receivedByUserId } : {}) },
      { maxRows: exportPolicy.maxRows }
    );
    await logOperationalExportAudit({
      session,
      reportId: "receiving-reports",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1),
      ...(auditMetadata ? { metadata: auditMetadata } : {})
    });

    return csvExportResponse(
      rows,
      profile ? "receiving-follow-up.csv" : "receiving-reports.csv",
      {
        metadata: await buildReportCsvMetadata({
          session,
          reportId: "receiving-reports",
          ...(profile
            ? {
                extra: [
                  ["Dashboard Profile", profile],
                  ["Search", query?.trim() || "All follow-up records"],
                  ["Maximum Rows", exportPolicy.maxRows]
                ]
              }
            : { extra: [["Maximum Rows", exportPolicy.maxRows]] })
        })
      }
    );
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "receiving-reports",
      error,
      metadata: auditMetadata
    });
    const response = exportErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
