import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { assertCanManageCompanyScope, getCoreAdminPermissionDetail } from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

export default async function CoreAdminPermissionDetailPage({
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
  const permission = await getCoreAdminPermissionDetail(session, id);
  if (!permission) {
    redirect("/admin");
  }

  const effectiveUserCount = new Set(
    permission.roles.flatMap((role) =>
      role.assignedUsers.map((user) => user.userId)
    )
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
          <p className="mt-2 text-3xl font-bold text-slate-950">{permission.roles.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Effective users</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{effectiveUserCount}</p>
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
          <div className="mt-4 divide-y divide-slate-100">
            {permission.roles.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">No active roles grant this permission.</p>
            ) : (
              permission.roles.map((role) => (
                <div key={role.id} data-testid="admin-permission-role-row" className="ogfi-list-row">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{role.name}</p>
                      <p className="text-xs text-slate-500">{role.code}</p>
                    </div>
                    <Badge tone={role.status === "ACTIVE" ? "success" : "neutral"}>{role.status}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {role.assignedUsers.length === 0 ? (
                      <p className="text-sm text-slate-600">No active users currently receive this role.</p>
                    ) : (
                      role.assignedUsers.map((user) => (
                        <div
                          key={user.id}
                          data-testid="admin-permission-user-row"
                          className="ogfi-record-summary p-3"
                        >
                          <p className="font-semibold text-slate-950">{user.displayName}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {user.scopes.map((scope) => (
                              <Badge key={scope.id} tone="info">
                                {scope.type} / {scope.accessLevel}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
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
