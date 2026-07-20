import { prisma } from "@ogfi/database";
import type { SessionContext } from "./context";
import type { CsvRow } from "./csv";
import { getExportFailureReasonCode } from "./exportErrors";
import { getReportExportPolicy } from "./policySettings";

export type ExportAuditEventType =
  | "report.export_denied"
  | "report.export_started"
  | "report.export_completed"
  | "report.export_failed";

function hasSelectedScopeContext(session: SessionContext) {
  return Boolean(
    session.context.companyId &&
      session.context.companyName &&
      session.context.locationId &&
      session.context.locationName &&
      session.context.locationType
  );
}

export async function assertReportExportScopeFilters(session: SessionContext) {
  const exportPolicy = await getReportExportPolicy(session);
  if (exportPolicy.requireScopeFilters && !hasSelectedScopeContext(session)) {
    throw new Error("REPORT_EXPORT_SCOPE_FILTER_REQUIRED");
  }
  return exportPolicy;
}

export async function logOperationalExportAudit(input: {
  session: SessionContext;
  reportId: string;
  eventType: ExportAuditEventType;
  rowCount?: number;
  reasonCode?: string;
  metadata?: Record<string, unknown>;
}) {
  const exportPolicy =
    input.eventType === "report.export_started"
      ? await assertReportExportScopeFilters(input.session)
      : await getReportExportPolicy(input.session);
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
        companyId: input.session.context.companyId,
        companyName: input.session.context.companyName,
        brandId: input.session.context.brandId,
        brandName: input.session.context.brandName,
        locationId: input.session.context.locationId,
        locationName: input.session.context.locationName,
        locationType: input.session.context.locationType,
        requireScopeFilters: exportPolicy.requireScopeFilters,
        trustGateMode: exportPolicy.trustGate.mode,
        trustGateLabel: exportPolicy.trustGate.label,
        trustGateSourceDecisionId: exportPolicy.trustGate.sourceDecisionId,
        trustGateIsOverridden: exportPolicy.trustGate.isOverridden,
        source: "operational-report-export",
        ...(input.metadata ?? {})
      }
    }
  });
}

export async function buildReportCsvMetadata(input: {
  session: SessionContext;
  reportId: string;
  extra?: CsvRow[];
}): Promise<CsvRow[]> {
  const exportPolicy = await getReportExportPolicy(input.session);

  return [
    ["Report ID", input.reportId],
    ["Company", input.session.context.companyName],
    ["Brand", input.session.context.brandName ?? "Company-wide"],
    ["Location", input.session.context.locationName],
    ["Location Type", input.session.context.locationType],
    ["Scope Filters Required", exportPolicy.requireScopeFilters ? "Yes" : "No"],
    ["Reporting Trust Gate", exportPolicy.trustGate.label],
    ["Trust Gate Mode", exportPolicy.trustGate.mode],
    ["Trust Gate Source Decision", exportPolicy.trustGate.sourceDecisionId],
    ["Trust Gate Overridden", exportPolicy.trustGate.isOverridden ? "Yes" : "No"],
    ...(input.extra ?? [])
  ];
}

export async function logOperationalExportFailure(input: {
  session: SessionContext;
  reportId: string;
  error: unknown;
  metadata?: Record<string, unknown>;
}) {
  await logOperationalExportAudit({
    session: input.session,
    reportId: input.reportId,
    eventType: "report.export_failed",
    reasonCode: getExportFailureReasonCode(input.error),
    ...(input.metadata ? { metadata: input.metadata } : {})
  });
}
