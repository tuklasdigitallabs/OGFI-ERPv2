import { prisma } from "@ogfi/database";
import type { SessionContext } from "./context";

export type ExportAuditEventType =
  | "report.export_denied"
  | "report.export_started"
  | "report.export_completed";

export async function logOperationalExportAudit(input: {
  session: SessionContext;
  reportId: string;
  eventType: ExportAuditEventType;
  rowCount?: number;
  reasonCode?: string;
}) {
  await prisma.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: input.eventType,
      entityType: "Company",
      entityId: input.session.context.companyId,
      metadata: {
        reportId: input.reportId,
        rowCount: input.rowCount ?? null,
        reasonCode: input.reasonCode ?? null,
        locationId: input.session.context.locationId,
        source: "operational-report-export"
      }
    }
  });
}
