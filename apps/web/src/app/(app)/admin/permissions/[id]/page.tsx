import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel, PaginationBar } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { assertCanManageCompanyScope, getCoreAdminPermissionDetail } from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

export default async function CoreAdminPermissionDetailPage({
  params, searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  const paramsValue = searchParams ? await searchParams : {};
  const rawPage = Number.parseInt(String(Array.isArray(paramsValue.page) ? paramsValue.page[0] ?? "1" : paramsValue.page ?? "1"), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const query = (Array.isArray(paramsValue.query) ? paramsValue.query[0] : paramsValue.query)?.trim() ?? "";
  const permission = await getCoreAdminPermissionDetail(session, id, { page, pageSize: 25, query });
  if (!permission) {
    redirect("/admin");
  }

  const previewUserCount = new Set(
    permission.roles.flatMap((role) => role.assignedUsers.map((user) => user.userId))
  ).size;

  return (
    <AppShell
      session={session}
      title="Permission Access"
      subtitle={`${permission.module} / ${permission.action}`}
      activeNav="admin"
    >
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
              <ButtonLink href="/admin?tab=roles" tone="ghost" className="ogfi-chip">
                Roles & Permissions
              </ButtonLink>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">{permission.code}</span>
            </nav>
            <p className="mt-2 text-sm text-slate-500">
              You are inspecting one permission. Return to Roles & Permissions to configure access.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-600">Company: {session.context.companyName} · Read-only tenant-global role visibility through selected-company Manage scope.</p>
          </div>
          <ButtonLink href="/admin?tab=roles" tone="secondary">
            Back to Roles & Permissions
          </ButtonLink>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Permission</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{permission.code}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Module</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{permission.module}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Granting roles</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{permission.rolesPage.totalRoles}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Preview users shown on this page</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{previewUserCount}</p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Permission Definition</h2>
              <p className="text-sm text-slate-500">Capability inspected without mutation</p>
            </div>
            <Badge tone="info">Read-only</Badge>
          </div>
          <dl className="mt-4 grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Code</dt>
              <dd className="mt-1 break-all font-semibold text-slate-950">{permission.code}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Action</dt>
              <dd className="mt-1 font-semibold text-slate-950">{permission.action}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Description</dt>
              <dd className="mt-1 font-semibold text-slate-950">
                {permission.description ?? "Not configured"}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Roles Granting This Permission</h2>
          <p className="mt-1 text-sm text-slate-500">Bounded current-company user previews only; each granting role on this page shows up to five users. This is not an exhaustive effective-user total.</p>
          <form method="get" className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_auto]">
            <input className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm" name="query" defaultValue={query} placeholder="Search role name or code" aria-label="Search granting roles" />
            <button className="min-h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white">Search roles</button>
          </form>
          <div className="mt-4 divide-y divide-slate-100">
            {permission.roles.length === 0 ? (
              <div className="py-4 text-sm text-slate-600">
                <p>{query ? "No roles match this search." : "No roles grant this permission."}</p>
                {query ? <ButtonLink href={`/admin/permissions/${permission.id}`} tone="ghost" className="mt-2 min-h-11">Clear role search</ButtonLink> : null}
              </div>
            ) : (
              permission.roles.map((role) => (
                <div key={role.id} data-testid="admin-permission-role-row" className="ogfi-list-row">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{role.name}</p>
                      <p className="text-xs text-slate-500">{role.code} · {role.provenance === "GLOBAL" ? "Global role" : "Tenant role"}</p>
                    </div>
                    <Badge tone={role.status === "ACTIVE" ? "success" : "neutral"}>{role.status}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {role.assignedUsers.length === 0 ? (
                      <p className="text-sm text-slate-600">No current-company users currently receive this role.</p>
                    ) : (
                      <details className="rounded-lg border border-slate-200 bg-slate-50">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-700">
                          <span>Show up to {role.assignedUsers.length} user previews</span>
                          <span className="text-xs font-normal text-slate-500">Current role page only</span>
                        </summary>
                        <div className="grid gap-2 border-t border-slate-200 p-3">
                          {role.assignedUsers.map((user) => (
                            <div key={user.id} data-testid="admin-permission-user-row" className="ogfi-record-summary p-3">
                              <p className="font-semibold text-slate-950">{user.displayName}</p>
                              <p className="text-xs text-slate-500">{user.email}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {user.scopes.map((scope) => (
                                  <Badge key={scope.id} tone="info">{scope.type} / {scope.accessLevel}</Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{role.assignedUserCount} current-company active user{role.assignedUserCount === 1 ? "" : "s"}; showing {role.assignedUsers.length} preview{role.assignedUsers.length === 1 ? "" : "s"}.</p>
                </div>
              ))
            )}
          </div>
          {permission.rolesPage.totalRoles > 0 ? <PaginationBar page={permission.rolesPage.page} pageSize={permission.rolesPage.pageSize} totalItems={permission.rolesPage.totalRoles} itemLabel="granting roles" getPageHref={(nextPage) => `/admin/permissions/${permission.id}?page=${nextPage}${query ? `&query=${encodeURIComponent(query)}` : ""}`} /> : null}
        </Panel>
      </div>

      <div className="mt-5">
        <ButtonLink href="/admin?tab=roles" tone="ghost" className="ogfi-chip">
          Back to Roles & Permissions
        </ButtonLink>
      </div>
    </AppShell>
  );
}
