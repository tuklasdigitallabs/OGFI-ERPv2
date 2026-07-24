import { getSessionContext } from "@/server/services/context";
import { csvExportBody, csvExportResponse, csvSha256 } from "@/server/services/csv";
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
import { canExportReleaseReadiness } from "@/server/services/exportAuthorization";
import { getReportExportPolicy } from "@/server/services/policySettings";
import { parseDateOnlyUtc } from "@/server/services/projectDates";
import {
  assertCanManageReleaseReadiness,
  buildReleaseReadinessExportRows
} from "@/server/services/releaseReadiness";

export const dynamic = "force-dynamic";

const csvFilename = "release-readiness-register.csv";
const checksumFilename = `${csvFilename}.sha256`;

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportReleaseReadiness(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "release-readiness",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }
  try {
    await assertCanManageReleaseReadiness(session);
  } catch {
    await logOperationalExportAudit({
      session,
      reportId: "release-readiness",
      eventType: "report.export_denied",
      reasonCode: "SCOPE_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  try {
    const url = new URL(request.url);
    const generatedAt = parseGeneratedAt(url.searchParams.get("generatedAt"));
    const format = url.searchParams.get("format") ?? "csv";
    const exportPolicy = await getReportExportPolicy(session);
    const fromValue = url.searchParams.get("from");
    const toValue = url.searchParams.get("to");
    if (!fromValue || !toValue) throw new Error("REPORT_EXPORT_DATE_RANGE_REQUIRED");
    const from = parseDateOnlyUtc(fromValue);
    const to = parseDateOnlyUtc(toValue);
    if (!from || !to || to < from) throw new Error("REPORT_EXPORT_DATE_RANGE_INVALID");
    const spanDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (spanDays > exportPolicy.maxDateSpanDays) throw new Error("REPORT_EXPORT_DATE_RANGE_TOO_LARGE");
    await logOperationalExportAudit({
      session,
      reportId: "release-readiness",
      eventType: "report.export_started"
    });
    const rows = await buildReleaseReadinessExportRows(session, { from, to, maxRows: exportPolicy.maxRows });
    await logOperationalExportAudit({
      session,
      reportId: "release-readiness",
      eventType: "report.export_completed",
      rowCount: rows.length
    });

    const metadata = await buildReportCsvMetadata({
      session,
      reportId: "release-readiness",
      extra: [["Scope", "Company release readiness"]]
    });
    const exportOptions = {
      generatedAt,
      metadata
    };

    if (format === "sha256") {
      const body = csvExportBody(rows, csvFilename, exportOptions);
      return new Response(`${csvSha256(body)}  ${csvFilename}\n`, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename=${checksumFilename}`,
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    return csvExportResponse(rows, csvFilename, {
      ...exportOptions,
      checksumHeader: true,
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "release-readiness",
      error
    });
    const response = exportErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

function parseGeneratedAt(value: string | null) {
  if (!value) {
    return new Date();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}
