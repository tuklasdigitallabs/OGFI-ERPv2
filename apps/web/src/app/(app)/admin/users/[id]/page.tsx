import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  createUserRoleAssignment,
  createUserLocationScopeAssignment,
  deactivateUserRoleAssignment,
  deactivateUserScopeAssignment,
  getCoreAdminUserDetail
} from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

function humanizeEnum(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function createLocationScope(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  try {
    await createUserLocationScopeAssignment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/admin/users/${targetUserId}`, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(`/admin/users/${targetUserId}`);
}

async function deactivateScope(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  try {
    await deactivateUserScopeAssignment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/admin/users/${targetUserId}`, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(`/admin/users/${targetUserId}`);
}

async function createRoleAssignment(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  try {
    await createUserRoleAssignment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/admin/users/${targetUserId}`, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(`/admin/users/${targetUserId}`);
}

async function deactivateRoleAssignment(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  try {
    await deactivateUserRoleAssignment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/admin/users/${targetUserId}`, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(`/admin/users/${targetUserId}`);
}

export default async function CoreAdminUserDetailPage({
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
  const user = await getCoreAdminUserDetail(session, id);
  if (!user) {
    redirect("/admin");
  }
  const assignedLocationScopeIds = new Set(
    user.scopes
      .filter((scope) => scope.type === "LOCATION")
      .map((scope) => scope.scopeId)
  );
  const availableLocations = user.assignableLocations.filter(
    (location) => !assignedLocationScopeIds.has(location.id)
  );
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="User Access"
      subtitle={`${user.displayName} / ${user.email}`}
      activeNav="admin"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
              <ButtonLink href="/admin?tab=users" tone="ghost" className="ogfi-chip">
                Users & Access
              </ButtonLink>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">{user.displayName}</span>
            </nav>
            <p className="mt-2 text-sm text-slate-500">
              You are managing one user. Return to the Users workspace to choose another user.
            </p>
          </div>
          <ButtonLink href="/admin?tab=users" tone="secondary">
            Back to Users Workspace
          </ButtonLink>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Status</p>
          <div className="mt-3">
            <Badge tone={user.status === "ACTIVE" ? "success" : "neutral"}>{user.status}</Badge>
          </div>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Roles</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{user.roles.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Scopes</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{user.scopes.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Permissions</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{user.permissions.length}</p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Assigned Roles</h2>
              <p className="text-sm text-slate-500">Non-sensitive role changes require a reason</p>
            </div>
            {user.canMutateRoles ? <Badge tone="warning">Mutable</Badge> : <Badge>Self protected</Badge>}
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {user.roles.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">No active roles are assigned.</p>
            ) : (
              user.roles.map((role) => (
                <div
                  key={role.assignmentId}
                  data-testid="admin-user-role-row"
                  className="ogfi-list-row grid gap-2 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{role.name}</p>
                    <p className="mt-2 text-sm text-slate-600">Assigned {role.startsAt}</p>
                  </div>
                  {user.canMutateRoles && role.canMutate ? (
                    <EntryModal title="Deactivate Role" triggerLabel="Deactivate Role">
                      <form action={deactivateRoleAssignment} className="ogfi-form-shell mt-4 grid gap-3">
                        <input name="targetUserId" type="hidden" value={user.id} />
                        <input name="assignmentId" type="hidden" value={role.assignmentId} />
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Role deactivation reason
                          <input
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                            name="reason"
                            required
                          />
                        </label>
                        <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-700 px-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-fit">
                          Deactivate Role
                        </button>
                      </form>
                    </EntryModal>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Effective Permissions</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {user.permissions.length === 0 ? (
              <p className="text-sm text-slate-600">No effective permissions from active roles.</p>
            ) : (
              user.permissions.map((permission) => (
                <Badge key={permission.code} tone={permission.sensitive ? "warning" : "info"}>
                  {permission.label}
                </Badge>
              ))
            )}
          </div>
        </Panel>

        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Assigned Scopes</h2>
              <p className="text-sm text-slate-500">Location scope changes require a reason</p>
            </div>
            {user.canMutateScopes ? <Badge tone="warning">Mutable</Badge> : <Badge>Self protected</Badge>}
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {user.scopes.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">No active scopes are assigned.</p>
            ) : (
              user.scopes.map((scope) => (
                <div
                  key={scope.id}
                  data-testid="admin-user-scope-row"
                  className="ogfi-list-row grid gap-2 sm:grid-cols-[1fr_1fr]"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{scope.displayName}</p>
                    <p className="text-sm text-slate-600">{scope.displayContext}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="info" size="sm">
                        {humanizeEnum(scope.type)}
                      </Badge>
                      {scope.code ? (
                        <Badge tone="neutral" size="sm">
                          {scope.code}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <Badge tone="success">{humanizeEnum(scope.accessLevel)}</Badge>
                    <p className="mt-2 text-sm text-slate-600">Assigned {scope.startsAt}</p>
                    {user.canMutateScopes && scope.type === "LOCATION" ? (
                      <div className="mt-3">
                        <EntryModal title="Deactivate Scope" triggerLabel="Deactivate Scope">
                          <form action={deactivateScope} className="ogfi-form-shell mt-4 grid gap-3">
                            <input name="targetUserId" type="hidden" value={user.id} />
                            <input name="assignmentId" type="hidden" value={scope.id} />
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              Deactivation reason
                              <input
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                                name="reason"
                                required
                              />
                            </label>
                            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-700 px-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-fit">
                              Deactivate Scope
                            </button>
                          </form>
                        </EntryModal>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Actor Audit History</h2>
          {user.auditEvents.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No recent controlled actions by this user.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {user.auditEvents.map((event) => (
                <div key={event.id} data-testid="admin-user-audit-row" className="ogfi-list-row">
                  <p className="font-semibold text-slate-950">{event.eventType}</p>
                  <p className="text-sm text-slate-600">
                    {event.entityType} / {event.entityId}
                  </p>
                  <p className="text-xs text-slate-500">{event.occurredAt}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {user.canMutateScopes ? (
          <Panel className="xl:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Assign Location Scope</h2>
                <p className="text-sm text-slate-500">Creates an auditable active scope assignment</p>
              </div>
              <Badge tone="info">Role unchanged</Badge>
            </div>
            {availableLocations.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No unassigned active locations are available for this user.
              </p>
            ) : (
              <div className="mt-4">
                <EntryModal title="Assign Location Scope" triggerLabel="Assign Scope">
                  <form action={createLocationScope} className="ogfi-form-shell mt-4 grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Location
                      <select className="rounded-md border border-slate-300 px-3 py-2" name="locationId" required>
                        {availableLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name} / {location.type}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Access
                      <select className="rounded-md border border-slate-300 px-3 py-2" name="accessLevel" required>
                        <option value="VIEW">VIEW</option>
                        <option value="OPERATE">OPERATE</option>
                        <option value="APPROVE">APPROVE</option>
                        <option value="MANAGE">MANAGE</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Scope assignment reason
                      <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
                    </label>
                    <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 sm:w-fit">
                      Assign Scope
                    </button>
                  </form>
                </EntryModal>
              </div>
            )}
          </Panel>
        ) : null}

        {user.canMutateRoles ? (
          <Panel className="xl:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Assign Role</h2>
                <p className="text-sm text-slate-500">
                  Assign a role with required reason and audit history.
                </p>
              </div>
              <Badge tone="warning">Admin controlled</Badge>
            </div>
            {user.assignableRoles.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No unassigned roles are available for this user.
              </p>
            ) : (
              <div className="mt-4">
                <EntryModal title="Assign Role" triggerLabel="Assign Role">
                  <form action={createRoleAssignment} className="ogfi-form-shell mt-4 grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Role
                      <select className="rounded-md border border-slate-300 px-3 py-2" name="roleId" required>
                        {user.assignableRoles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name} - {role.assignmentEligibility}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Role assignment reason
                      <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
                    </label>
                    <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 sm:w-fit">
                      Assign Role
                    </button>
                  </form>
                </EntryModal>
              </div>
            )}
          </Panel>
        ) : null}
      </div>

      <div className="mt-5">
        <ButtonLink href="/admin?tab=users" tone="ghost" className="ogfi-chip">
          Back to Users Workspace
        </ButtonLink>
      </div>
    </AppShell>
  );
}
