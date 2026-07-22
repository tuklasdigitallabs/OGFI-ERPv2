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
import { canExportWastageReports } from "@/server/services/exportAuthorization";
import {
  listWastageReports,
  resolveWastageDashboardProfile
} from "@/server/services/wastage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportWastageReports(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "wastage-report",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  const profileParam = new URL(request.url).searchParams.get("dashboard") ?? undefined;
  const profile = resolveWastageDashboardProfile(profileParam);
  if (profileParam && !profile) {
    return new Response("Unsupported wastage dashboard profile.", { status: 400 });
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "wastage-report",
      eventType: "report.export_started"
    });
    const reports = await listWastageReports(session, profile ?? undefined);
    const rows = [
      [
        "Wastage Number",
        "Status",
        "Type",
        "Reason",
        "Inventory Location",
        "Reported By",
        "Reviewed By",
        "Line Count",
        "Quantity",
        "Estimated Cost",
        "Policy Flags",
        "Evidence Required",
        "Evidence Satisfied",
        "Created At",
        "Submitted At",
        "Reviewed At",
        "Posted At",
        "Reversed At",
        "Cancelled At",
        "Inventory Posting"
      ],
      ...reports.map((report) => [
        report.publicReference,
        report.status,
        report.wastageType,
        report.reasonCode,
        report.inventoryLocationName,
        report.reportedByName,
        report.reviewedByName,
        report.lineCount,
        report.totalQuantity,
        report.totalEstimatedCost.toFixed(2),
        report.policyFlagLabels.join("; "),
        report.evidenceRequired ? "Yes" : "No",
        report.evidenceSatisfied ? "Yes" : "No",
        report.createdAt,
        report.submittedAt,
        report.reviewedAt,
        report.postedAt,
        report.reversedAt,
        report.cancelledAt,
        report.status === "REVERSED"
          ? "Reversed"
          : report.status === "POSTED"
            ? "Posted"
            : "Not posted"
      ])
    ];

    await logOperationalExportAudit({
      session,
      reportId: "wastage-report",
      eventType: "report.export_completed",
      rowCount: reports.length
    });

    return csvExportResponse(rows, profile ? "wastage-exceptions.csv" : "wastage-reports.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "wastage-report"
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "wastage-report",
      error
    });
    throw error;
  }
}
