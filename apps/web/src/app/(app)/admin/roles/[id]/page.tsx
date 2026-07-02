import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import {
  applyRecommendedRolePermissions,
  getCoreAdminRoleDetail,
  updateRolePermissions
} from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

async function updateRolePermissionsAction(formData: FormData) {
  "use server";

  const roleId = String(formData.get("roleId") ?? "");
  try {
    await updateRolePermissions(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/admin/roles/${roleId}`, error));
  }
  revalidatePath(`/admin/roles/${roleId}`);
  redirect(`/admin/roles/${roleId}`);
}

async function applyRecommendedRolePermissionsAction(formData: FormData) {
  "use server";

  const roleId = String(formData.get("roleId") ?? "");
  try {
    await applyRecommendedRolePermissions(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/admin/roles/${roleId}`, error));
  }
  revalidatePath(`/admin/roles/${roleId}`);
  redirect(`/admin/roles/${roleId}`);
}

export default async function CoreAdminRoleDetailPage({
  params,
  searchParams
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

  const { id } = await params;
  const queryParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(queryParams);
  const role = await getCoreAdminRoleDetail(session, id);
  if (!role) {
    redirect("/admin");
  }

  return (
    <AppShell
      session={session}
      title="Role Access"
      subtitle={`${role.name} / ${role.code}`}
      activeNav="admin"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
              <ButtonLink href="/admin" tone="ghost" className="ogfi-chip">
                Core Administration
              </ButtonLink>
              <span className="text-slate-400">/</span>
              <ButtonLink href="/admin?tab=roles" tone="ghost" className="ogfi-chip">
                Roles & Permissions
              </ButtonLink>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">{role.name}</span>
            </nav>
            <p className="mt-2 text-sm text-slate-500">
              You are configuring one role. Return to the Roles workspace to compare
              or choose another role.
            </p>
          </div>
          <ButtonLink href="/admin?tab=roles" tone="secondary" className="gap-2">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to Roles Workspace
          </ButtonLink>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Status</p>
          <div className="mt-3">
            <Badge tone={role.status === "ACTIVE" ? "success" : "neutral"}>{role.status}</Badge>
          </div>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Users</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{role.assignedUsers.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Permissions</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{role.permissions.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Recommended drift</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {role.addedFromRecommended + role.removedFromRecommended === 0
              ? "Aligned"
              : `${role.addedFromRecommended} added / ${role.removedFromRecommended} removed`}
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Role Permissions</h2>
              <p className="text-sm text-slate-500">
                Toggle capabilities using human-readable labels. System codes remain internal.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={role.hasRecommendedSet ? "info" : "neutral"}>
                {role.recommendedLabel}
              </Badge>
              {role.sensitiveEnabledCount > 0 ? (
                <Badge tone="warning">{role.sensitiveEnabledCount} sensitive enabled</Badge>
              ) : null}
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex gap-2">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Sensitive approval, posting, reversal, and admin permissions affect control
                boundaries. Saving changes requires a reason and writes a before/after audit diff.
              </p>
            </div>
          </div>
          <form action={updateRolePermissionsAction} className="mt-5">
            <input name="roleId" type="hidden" value={role.id} />
            <div className="space-y-4">
              {role.permissionGroups.map((group) => (
                <section
                  key={group.name}
                  className="overflow-hidden rounded-xl border border-slate-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div>
                      <h3 className="font-bold text-slate-950">{group.name}</h3>
                      <p className="text-xs text-slate-500">
                        {group.enabledCount}/{group.permissions.length} enabled ·{" "}
                        {group.recommendedCount} recommended
                      </p>
                    </div>
                    <Badge tone="neutral">{group.permissions.length} permissions</Badge>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.permissions.map((permission) => (
                      <label
                        key={permission.id}
                        className="ogfi-toggle-row grid cursor-pointer gap-3 px-4 py-4 md:grid-cols-[1fr_auto] md:items-center"
                        data-testid="admin-role-permission-toggle"
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-950">
                              {permission.label}
                            </span>
                            {permission.recommended ? (
                              <Badge tone="info" size="sm">Recommended</Badge>
                            ) : null}
                            {permission.sensitive ? (
                              <Badge tone="warning" size="sm">Sensitive</Badge>
                            ) : null}
                            {permission.overrideState === "ADDED_FROM_RECOMMENDED" ? (
                              <Badge tone="warning" size="sm">Added override</Badge>
                            ) : null}
                            {permission.overrideState === "REMOVED_FROM_RECOMMENDED" ? (
                              <Badge tone="destructive" size="sm">Removed override</Badge>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-sm text-slate-600">
                            {permission.description}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-3 md:justify-end">
                          <span className="text-xs font-semibold text-slate-500">
                            {permission.enabled ? "Enabled" : "Off"}
                          </span>
                          <input
                            className="peer sr-only"
                            defaultChecked={permission.enabled}
                            name="permissionCodes"
                            type="checkbox"
                            value={permission.code}
                          />
                          <span
                            aria-hidden="true"
                            className="h-7 w-12 rounded-full border border-slate-300 bg-slate-200 p-0.5 transition-colors peer-checked:border-blue-500 peer-checked:bg-blue-600"
                          >
                            <span className="block h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="sticky bottom-0 mt-5 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-[0_-18px_42px_-34px_rgba(15,23,42,0.7)] backdrop-blur">
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Change reason
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                  name="reason"
                  placeholder="Explain why this role permission set is being changed"
                  required
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                  Save Permission Overrides
                </button>
                <ButtonLink href="/admin?tab=roles" tone="ghost" className="min-h-10">
                  Cancel and Return
                </ButtonLink>
                {role.hasRecommendedSet ? (
                  <EntryModal
                    title="Apply Recommended Permissions"
                    triggerClassName="bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                    triggerLabel="Apply Recommended Set"
                  >
                    <form
                      action={applyRecommendedRolePermissionsAction}
                      className="ogfi-form-shell mt-4 grid gap-4"
                    >
                      <input name="roleId" type="hidden" value={role.id} />
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                        <div className="flex gap-2">
                          <RotateCcw aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                          <p>
                            This replaces the current role permissions with the system
                            recommended set for {role.name}. Current custom additions and
                            removals will be recorded in the audit diff.
                          </p>
                        </div>
                      </div>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Reason
                        <input
                          className="rounded-md border border-slate-300 px-3 py-2"
                          name="reason"
                          required
                        />
                      </label>
                      <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                        Apply Recommended Permissions
                      </button>
                    </form>
                  </EntryModal>
                ) : null}
              </div>
            </div>
          </form>
        </Panel>

        <Panel className="ogfi-detail-card">
          <div className="flex items-start gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-950">Assigned Users</h2>
              <p className="text-sm text-slate-500">
                Role changes affect every active assignment below.
              </p>
            </div>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {role.assignedUsers.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">No active users are assigned to this role.</p>
            ) : (
              role.assignedUsers.map((user) => (
                <div key={user.id} data-testid="admin-role-user-row" className="ogfi-list-row">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{user.displayName}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                    <Badge tone="success">{user.scopes.length} scopes</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Assigned {user.startsAt}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
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
        </Panel>
      </div>

      <div className="mt-5">
        <ButtonLink href="/admin?tab=roles" tone="ghost" className="ogfi-chip">
          Back to Roles Workspace
        </ButtonLink>
      </div>
    </AppShell>
  );
}
