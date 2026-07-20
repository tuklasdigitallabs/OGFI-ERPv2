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
import { canExportBranchOperations } from "@/server/services/exportAuthorization";
import { buildBranchOperationsExportRows } from "@/server/services/branchOperations";

export const dynamic = "force-dynamic";

function getFilterParams(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const q = searchParams.get("q") ?? undefined;
  const shift = searchParams.get("shift") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const businessDate = getStrictDateSearchParam(
    searchParams,
    "businessDate",
    "BRANCH_OPERATIONS_BUSINESS_DATE_INVALID"
  );
  return {
    ...(q ? { q } : {}),
    ...(shift ? { shift } : {}),
    ...(status ? { status } : {}),
    ...(businessDate ? { businessDate } : {})
  };
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportBranchOperations(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "branch-checklist-compliance",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    await logOperationalExportAudit({
      session,
      reportId: "branch-checklist-compliance",
      eventType: "report.export_started"
    });
    const rows = await buildBranchOperationsExportRows(
      session,
      getFilterParams(request)
    );
    await logOperationalExportAudit({
      session,
      reportId: "branch-checklist-compliance",
      eventType: "report.export_completed",
      rowCount: Math.max(0, rows.length - 1)
    });

    return csvExportResponse(rows, "branch-checklist-compliance.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "branch-checklist-compliance"
      })
    });
  } catch (error) {
    await logOperationalExportAudit({
      session,
      reportId: "branch-checklist-compliance",
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
