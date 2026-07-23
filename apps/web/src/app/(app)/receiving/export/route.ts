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
  if (query && query.trim().length > 120) {
    return exportErrorResponse(
      new Error("RECEIVING_DASHBOARD_PROFILE_SEARCH_TOO_LONG")
    )!;
  }
  const auditMetadata = profile
    ? { dashboardProfile: profile, searchQuery: query?.trim() || null }
    : undefined;

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
      query
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
                  ["Search", query?.trim() || "All follow-up records"]
                ]
              }
            : {})
        })
      }
    );
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "receiving-reports",
      error,
      ...(auditMetadata ? { metadata: auditMetadata } : {})
    });
    throw error;
  }
}
