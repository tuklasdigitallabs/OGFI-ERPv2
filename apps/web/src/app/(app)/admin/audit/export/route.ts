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
import { canExportCoreAdminAudit } from "@/server/services/exportAuthorization";
import {
  listCoreAdminAuditEvents,
  assertCanManageCompanyScope,
  type CoreAdminAuditEventFilters
} from "@/server/services/coreAdmin";
import { getReportExportPolicy } from "@/server/services/policySettings";
import { parseDateOnlyUtc } from "@/server/services/projectDates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportCoreAdminAudit(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "audit-trail",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }
  try {
    await assertCanManageCompanyScope(session, session.context.companyId);
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_SCOPE_DENIED") {
      return exportPermissionDeniedResponse();
    }
    throw error;
  }

  const url = new URL(request.url);
  const filters: CoreAdminAuditEventFilters = {};
  const query = url.searchParams.get("q");
  const eventType = url.searchParams.get("eventType");
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if (entityId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entityId)) {
    return new Response("Invalid entity ID filter", { status: 400 });
  }
  const actor = url.searchParams.get("actor");
  const requestId = url.searchParams.get("requestId");
  const occurredFrom = url.searchParams.get("occurredFrom");
  const occurredTo = url.searchParams.get("occurredTo");
  if (query) {
    filters.query = query;
  }
  if (eventType) {
    filters.eventType = eventType;
  }
  if (entityType) {
    filters.entityType = entityType;
  }
  if (entityId) {
    filters.entityId = entityId;
  }
  if (actor) {
    filters.actor = actor;
  }
  if (requestId) {
    filters.requestId = requestId;
  }
  if (occurredFrom) {
    filters.occurredFrom = occurredFrom;
  }
  if (occurredTo) {
    filters.occurredTo = occurredTo;
  }

  try {
    const exportPolicy = await getReportExportPolicy(session);
    const exportCutoff = new Date();
    const validDate = (value: string | null) =>
      value ? parseDateOnlyUtc(value) : null;
    const from = validDate(occurredFrom);
    const to = validDate(occurredTo);
    if (!occurredFrom || !occurredTo) {
      throw new Error("REPORT_EXPORT_DATE_RANGE_REQUIRED");
    }
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      throw new Error("REPORT_EXPORT_DATE_RANGE_INVALID");
    }
    const spanDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (spanDays > exportPolicy.maxDateSpanDays) {
      throw new Error("REPORT_EXPORT_DATE_RANGE_TOO_LARGE");
    }
    filters.occurredBefore = exportCutoff.toISOString();
    await logOperationalExportAudit({
      session,
      reportId: "audit-trail",
      eventType: "report.export_started",
      skipScopeFilterRequirement: true,
      metadata: { maxRows: exportPolicy.maxRows, maxDateSpanDays: exportPolicy.maxDateSpanDays }
    });
    const events = await listCoreAdminAuditEvents(session, filters, {
      maxRows: exportPolicy.maxRows,
    });
    const rows = [
      [
        "Audit ID",
        "Event Type",
        "Entity Type",
        "Entity ID",
        "Actor",
        "Company",
        "Occurred At",
        "Request ID"
      ],
      ...events.map((event) => [
        event.id,
        event.eventType,
        event.entityType,
        event.entityId,
        event.actorName,
        event.companyName,
        event.occurredAt,
        event.requestId
      ])
    ];

    await logOperationalExportAudit({
      session,
      reportId: "audit-trail",
      eventType: "report.export_completed",
      rowCount: events.length
    });

    return csvExportResponse(rows, "audit-events.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "audit-trail"
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "audit-trail",
      error
    });
    const response = exportErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
