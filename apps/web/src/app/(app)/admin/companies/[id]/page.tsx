import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { assertCanManageCompanyScope, getCoreAdminCompanyDetail } from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

export default async function CoreAdminCompanyDetailPage({
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
  const company = await getCoreAdminCompanyDetail(session, id);
  if (!company) {
    redirect("/admin");
  }

  return (
    <AppShell
      session={session}
      title="Company Context"
      subtitle={`${company.displayName} / ${company.currencyCode}`}
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
              <span className="font-semibold text-slate-700">{company.displayName}</span>
            </nav>
            <p className="mt-2 text-sm text-slate-500">
              You are viewing one company. Return to Organization Scope to review companies and locations.
            </p>
          </div>
          <ButtonLink href="/admin?tab=organization" tone="secondary">
            Back to Organization Scope
          </ButtonLink>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Company</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{company.displayName}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Brands</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{company.brands.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Locations</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{company.locations.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Status</p>
          <div className="mt-3">
            <Badge tone={company.status === "ACTIVE" ? "success" : "neutral"}>{company.status}</Badge>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Company Identity</h2>
              <p className="text-sm text-slate-500">Tenant-owned company record</p>
            </div>
            <Badge tone="info">Read-only</Badge>
          </div>
          <dl className="mt-4 grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Legal name</dt>
              <dd className="mt-1 font-semibold text-slate-950">{company.legalName}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Trading name</dt>
              <dd className="mt-1 font-semibold text-slate-950">{company.tradingName ?? "Not configured"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Tax identifier</dt>
              <dd className="mt-1 font-semibold text-slate-950">{company.taxIdentifier ?? "Not configured"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Currency / timezone</dt>
              <dd className="mt-1 font-semibold text-slate-950">
                {company.currencyCode} / {company.timezone}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Company Access</h2>
          {company.assignedUsers.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No company-level assignments.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {company.assignedUsers.map((assignment) => (
                <div key={assignment.id} data-testid="admin-company-user-row" className="ogfi-list-row">
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
              ))}
            </div>
          )}
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Brands & Locations</h2>
          <div className="ogfi-form-shell mt-4 grid gap-3">
            {company.brands.length === 0 && company.locations.length === 0 ? (
              <p className="text-sm text-slate-600">No active brands or locations are configured.</p>
            ) : (
              <>
                {company.brands.map((brand) => (
                  <div key={brand.id} data-testid="admin-company-brand-row" className="ogfi-record-summary p-3">
                    <p className="font-semibold text-slate-950">{brand.name}</p>
                    <p className="text-xs text-slate-500">{brand.code}</p>
                  </div>
                ))}
                {company.locations.map((location) => (
                  <div key={location.id} data-testid="admin-company-location-row" className="ogfi-record-summary p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{location.name}</p>
                        <p className="text-xs text-slate-500">{location.code}</p>
                      </div>
                      <Badge tone="info">{location.type}</Badge>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Recent Company Activity</h2>
          {company.purchaseRequests.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No recent Purchase Requests for this company yet.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {company.purchaseRequests.map((request) => (
                <div key={request.id} data-testid="admin-company-request-row" className="ogfi-list-row">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{request.publicReference}</p>
                      <p className="text-sm text-slate-600">
                        {request.locationName} / {request.lineDescription}
                      </p>
                    </div>
                    <Badge tone={request.status === "APPROVED" ? "success" : "warning"}>
                      {request.status.replace("_", " ")}
                    </Badge>
                  </div>
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
