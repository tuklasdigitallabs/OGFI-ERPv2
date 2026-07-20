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
import { canExportCoreAdminAudit } from "@/server/services/exportAuthorization";
import {
  listCoreAdminAuditEvents,
  type CoreAdminAuditEventFilters
} from "@/server/services/coreAdmin";

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

  const url = new URL(request.url);
  const filters: CoreAdminAuditEventFilters = {};
  const query = url.searchParams.get("q");
  const eventType = url.searchParams.get("eventType");
  const entityType = url.searchParams.get("entityType");
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
    await logOperationalExportAudit({
      session,
      reportId: "audit-trail",
      eventType: "report.export_started"
    });
    const events = await listCoreAdminAuditEvents(session, filters);
    const rows = [
      [
        "Audit ID",
        "Event Type",
        "Entity Type",
        "Entity ID",
        "Actor",
        "Actor Email",
        "Company",
        "Occurred At",
        "Request ID",
        "IP Address"
      ],
      ...events.map((event) => [
        event.id,
        event.eventType,
        event.entityType,
        event.entityId,
        event.actorName,
        event.actorEmail,
        event.companyName,
        event.occurredAt,
        event.requestId,
        event.ipAddress
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
    throw error;
  }
}
