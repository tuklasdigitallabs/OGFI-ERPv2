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
import { canExportExpansion } from "@/server/services/exportAuthorization";
import { canViewExpansionFinancialEstimates } from "@/server/services/authorization";
import { buildExpansionPortfolioExportRows } from "@/server/services/expansionProjects";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportExpansion(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "phase-4-expansion-portfolio",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    const financialEstimatesIncluded = canViewExpansionFinancialEstimates(
      session.permissionCodes
    );
    await logOperationalExportAudit({
      session,
      reportId: "phase-4-expansion-portfolio",
      eventType: "report.export_started"
    });
    const rows = await buildExpansionPortfolioExportRows(session);
    await logOperationalExportAudit({
      session,
      reportId: "phase-4-expansion-portfolio",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "phase-4-expansion-portfolio.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "phase-4-expansion-portfolio",
        extra: [
          [
            "Financial estimate fields",
            financialEstimatesIncluded ? "Authorized view" : "Masked"
          ],
          [
            "Source Boundary",
            "Read-only expansion coordination export; does not approve, post, pay, receive, or mutate source records."
          ]
        ]
      }),
      checksumHeader: true
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "phase-4-expansion-portfolio",
      error
    });
    const errorResponse = exportErrorResponse(error);
    if (errorResponse) {
      return errorResponse;
    }
    throw error;
  }
}
