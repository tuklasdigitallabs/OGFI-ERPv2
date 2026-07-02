import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getCoreAdminLocationDetail } from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

export default async function CoreAdminLocationDetailPage({
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

  const { id } = await params;
  const location = await getCoreAdminLocationDetail(session, id);
  if (!location) {
    redirect("/admin");
  }

  return (
    <AppShell
      session={session}
      title="Location Context"
      subtitle={`${location.companyName} / ${location.brandName} / ${location.name}`}
      activeNav="admin"
    >
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
              <ButtonLink href="/admin?tab=organization" tone="ghost" className="ogfi-chip">
                Organization Scope
              </ButtonLink>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">{location.name}</span>
            </nav>
            <p className="mt-2 text-sm text-slate-500">
              You are viewing one location. Return to Organization Scope to review companies and locations.
            </p>
          </div>
          <ButtonLink href="/admin?tab=organization" tone="secondary">
            Back to Organization Scope
          </ButtonLink>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Location</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{location.name}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Type</p>
          <div className="mt-3">
            <Badge tone="info">{location.type}</Badge>
          </div>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Assigned users</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{location.assignedUsers.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Status</p>
          <div className="mt-3">
            <Badge tone={location.status === "ACTIVE" ? "success" : "neutral"}>{location.status}</Badge>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Location Identity</h2>
              <p className="text-sm text-slate-500">Fixed operational context</p>
            </div>
            <Badge tone="info">Read-only</Badge>
          </div>
          <dl className="mt-4 grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Company</dt>
              <dd className="mt-1 font-semibold text-slate-950">{location.companyName}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Brand</dt>
              <dd className="mt-1 font-semibold text-slate-950">{location.brandName}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Code</dt>
              <dd className="mt-1 font-semibold text-slate-950">{location.code}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Timezone</dt>
              <dd className="mt-1 font-semibold text-slate-950">{location.timezone}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Address</dt>
              <dd className="mt-1 font-semibold text-slate-950">{location.address ?? "Not configured"}</dd>
            </div>
          </dl>
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Assigned Access</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {location.assignedUsers.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">No active users are assigned to this location.</p>
            ) : (
              location.assignedUsers.map((assignment) => (
                <div key={assignment.id} data-testid="admin-location-user-row" className="ogfi-list-row">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{assignment.displayName}</p>
                      <p className="text-xs text-slate-500">{assignment.email}</p>
                    </div>
                    <Badge tone="success">{assignment.accessLevel}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {assignment.roles.join(", ") || "No role"} / assigned {assignment.startsAt}
                  </p>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Recent Requests</h2>
          {location.purchaseRequests.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No Purchase Requests for this location yet.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {location.purchaseRequests.map((request) => (
                <div key={request.id} data-testid="admin-location-request-row" className="ogfi-list-row">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{request.publicReference}</p>
                      <p className="text-sm text-slate-600">{request.lineDescription}</p>
                    </div>
                    <Badge tone={request.status === "APPROVED" ? "success" : "warning"}>
                      {request.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {request.requesterName} / required {request.requiredDate}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Location Audit Activity</h2>
          {location.auditEvents.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No recent controlled events for this location.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {location.auditEvents.map((event) => (
                <div key={event.id} data-testid="admin-location-audit-row" className="ogfi-list-row">
                  <p className="font-semibold text-slate-950">{event.eventType}</p>
                  <p className="text-sm text-slate-600">
                    {event.entityType} / {event.entityId}
                  </p>
                  <p className="text-xs text-slate-500">
                    {event.actorName} / {event.occurredAt}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-5">
        <ButtonLink href="/admin?tab=organization" tone="ghost" className="ogfi-chip">
          Back to Organization Scope
        </ButtonLink>
      </div>
    </AppShell>
  );
}
