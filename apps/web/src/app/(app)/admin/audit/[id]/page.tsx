import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { assertCanManageCompanyScope, getCoreAdminAuditEventDetail } from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

function JsonPanel({
  title,
  value
}: {
  title: string;
  value: Record<string, unknown> | null;
}) {
  return (
    <Panel className="ogfi-detail-card">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <pre className="mt-4 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </Panel>
  );
}

export default async function CoreAdminAuditEventDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  if (!session.permissionCodes.includes(permissions.tenantRoleAdminister)) {
    redirect("/admin");
  }
  try {
    await assertCanManageCompanyScope(session, session.context.companyId);
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_SCOPE_DENIED") {
      redirect("/admin");
    }
    throw error;
  }

  const { id } = await params;
  const event = await getCoreAdminAuditEventDetail(session, id);
  if (!event) {
    redirect("/admin");
  }

  return (
    <AppShell
      session={session}
      title="Audit Event"
      subtitle={`${event.eventType} / ${event.entityType}`}
      activeNav="admin"
    >
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
              <ButtonLink href="/admin?tab=audit" tone="ghost" className="ogfi-chip">
                Audit Trail
              </ButtonLink>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">{event.eventType}</span>
            </nav>
            <p className="mt-2 text-sm text-slate-500">
              You are viewing one audit event. Return to Audit Trail to continue searching evidence.
            </p>
          </div>
          <ButtonLink href="/admin?tab=audit" tone="secondary">
            Back to Audit Trail
          </ButtonLink>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Event</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{event.eventType}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Actor</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{event.actorName}</p>
          {event.actorEmail ? (
            <p className="text-xs text-slate-500">{event.actorEmail}</p>
          ) : null}
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Company</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{event.companyName}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Mode</p>
          <div className="mt-3">
            <Badge tone="info">Append-only</Badge>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Record Reference</h2>
          <dl className="mt-4 grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Entity</dt>
              <dd className="mt-1 font-semibold text-slate-950">{event.entityType}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Entity ID</dt>
              <dd className="mt-1 break-all font-semibold text-slate-950">{event.entityId}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Occurred</dt>
              <dd className="mt-1 font-semibold text-slate-950">{event.occurredAt}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Request ID</dt>
              <dd className="mt-1 font-semibold text-slate-950">{event.requestId ?? "Not captured"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">IP address</dt>
              <dd className="mt-1 font-semibold text-slate-950">{event.ipAddress ?? "Not captured"}</dd>
            </div>
          </dl>
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Audit ID</h2>
          <p className="mt-4 break-all rounded-lg bg-slate-50 p-4 font-mono text-sm text-slate-700">
            {event.id}
          </p>
          <p className="mt-4 text-sm text-slate-600">
            Audit events are displayed for inspection only. Corrections must be recorded as new events.
          </p>
        </Panel>

        <JsonPanel title="Before Data" value={event.beforeData} />
        <JsonPanel title="After Data" value={event.afterData} />
        <JsonPanel title="Metadata" value={event.metadata} />
      </div>

    </AppShell>
  );
}
