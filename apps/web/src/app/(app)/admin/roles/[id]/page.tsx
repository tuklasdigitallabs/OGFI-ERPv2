import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge, ButtonLink, Panel, PaginationBar } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  ApplyRecommendedRolePermissionsButton,
  RolePermissionEditor,
} from "@/components/RolePermissionEditor";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import {
  applyRecommendedRolePermissions,
  assertCanManageCompanyScope,
  getCoreAdminRoleDetail,
  updateRolePermissions
} from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

async function updateRolePermissionsAction(formData: FormData) {
  "use server";

  const roleId = String(formData.get("roleId") ?? "");
  const submittedReturnPath = formData.get("returnPath");
  const returnPath = typeof submittedReturnPath === "string" && submittedReturnPath.startsWith(`/admin/roles/${roleId}`)
    ? submittedReturnPath
    : `/admin/roles/${roleId}`;
  try {
    await updateRolePermissions(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/roles/${roleId}`);
  redirect(returnPath);
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
  redirect(
    `/admin/roles/${roleId}?success=CORE_ADMIN_ROLE_RECOMMENDED_PERMISSIONS_APPLIED`,
  );
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

  try {
    await assertCanManageCompanyScope(session, session.context.companyId);
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_SCOPE_DENIED") {
      return (
        <AppShell
          session={session}
          title="Role Access"
          subtitle="Core Administration role details"
          activeNav="admin"
        >
          <Panel className="ogfi-detail-card border-amber-200 bg-amber-50">
            <Badge tone="warning">Access restricted</Badge>
            <h2 className="mt-3 text-lg font-bold text-slate-950">
              Selected-company Manage scope is required
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              This role catalog is tenant-wide, but role detail access still requires
              active Manage scope for the selected company. No role or permission data
              was loaded.
            </p>
          </Panel>
        </AppShell>
      );
    }
    throw error;
  }

  const { id } = await params;
  const queryParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(queryParams);
  const assignmentQuery = Array.isArray(queryParams.assignmentQuery)
    ? queryParams.assignmentQuery[0]
    : queryParams.assignmentQuery;
  const assignmentPageValue = Number.parseInt(
    String(
      Array.isArray(queryParams.assignmentPage)
        ? queryParams.assignmentPage[0]
        : (queryParams.assignmentPage ?? "1"),
    ),
    10,
  );
  const permissionQuery = Array.isArray(queryParams.permissionQuery)
    ? queryParams.permissionQuery[0]
    : queryParams.permissionQuery;
  const permissionPageValue = Number.parseInt(
    String(
      Array.isArray(queryParams.permissionPage)
        ? queryParams.permissionPage[0]
        : (queryParams.permissionPage ?? "1"),
    ),
    10,
  );
  const permissionFilterValue = Array.isArray(queryParams.permissionFilter)
    ? queryParams.permissionFilter[0]
    : queryParams.permissionFilter;
  const permissionFilter =
    permissionFilterValue === "SENSITIVE" ||
    permissionFilterValue === "OVERRIDES" ||
    permissionFilterValue === "RECOMMENDED_DRIFT"
      ? permissionFilterValue
      : "ALL";
  const recommendedPermissionsApplied =
    (Array.isArray(queryParams.success)
      ? queryParams.success[0]
      : queryParams.success) ===
    "CORE_ADMIN_ROLE_RECOMMENDED_PERMISSIONS_APPLIED";
  const role = await getCoreAdminRoleDetail(session, id, {
    ...(assignmentQuery ? { query: assignmentQuery } : {}),
    page: Number.isFinite(assignmentPageValue) ? assignmentPageValue : 1,
    pageSize: 25,
    ...(permissionQuery ? { permissionQuery } : {}),
    permissionPage: Number.isFinite(permissionPageValue) ? permissionPageValue : 1,
    permissionPageSize: 25,
    permissionFilter,
  });
  if (!role) {
    redirect("/admin");
  }
  const permissionReturnPath = `/admin/roles/${role.id}?permissionPage=${role.permissionPage.page}${role.permissionPage.query ? `&permissionQuery=${encodeURIComponent(role.permissionPage.query)}` : ""}${role.permissionPage.filter !== "ALL" ? `&permissionFilter=${role.permissionPage.filter}` : ""}${assignmentQuery ? `&assignmentQuery=${encodeURIComponent(assignmentQuery)}` : ""}${Number.isFinite(assignmentPageValue) && assignmentPageValue > 1 ? `&assignmentPage=${assignmentPageValue}` : ""}`;

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
            <div className="mt-2">
              <Badge tone={role.sensitiveEnabledCount > 0 ? "warning" : "neutral"}>
                {role.sensitiveEnabledCount > 0 ? "Approval required" : "Standard role"}
              </Badge>
            </div>
          </div>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Users</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{role.assignedUsersPage.totalItems}</p>
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
                <Badge tone="warning">{role.sensitiveEnabledCount} approval-required</Badge>
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
          {role.permissionIntegrityIssue ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <div className="flex gap-2">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Permission data needs administrator review; editing is unavailable until the role-permission links are reconciled.</p>
              </div>
            </div>
          ) : null}
          <RolePermissionEditor
            action={updateRolePermissionsAction}
            assignmentPage={
              Number.isFinite(assignmentPageValue)
                ? assignmentPageValue
                : undefined
            }
            assignmentQuery={assignmentQuery}
            enabledPermissionCodes={role.enabledPermissionCodes}
            groups={role.permissionGroups}
            integrityIssue={role.permissionIntegrityIssue}
            permissionFilter={role.permissionPage.filter}
            permissionPage={role.permissionPage.page}
            permissionPageSize={role.permissionPage.pageSize}
            permissionQuery={role.permissionPage.query}
            permissionTotal={role.permissionPage.totalItems}
            returnPath={permissionReturnPath}
            sensitiveEnabledCount={role.sensitiveEnabledCount}
            resetDraft={recommendedPermissionsApplied}
            roleId={role.id}
          />
          {role.hasRecommendedSet ? (
            <div className="mt-3 flex justify-end">
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
                      <RotateCcw
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <p>
                        This replaces the saved role permissions with the system
                        recommended set for {role.name}. Any unsaved page
                        selections are discarded, and current custom additions
                        and removals are recorded in the audit diff.
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
                  <ApplyRecommendedRolePermissionsButton />
                </form>
              </EntryModal>
            </div>
          ) : null}
        </Panel>

        <Panel className="ogfi-detail-card">
          <div className="flex items-start gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-950">Assigned Users</h2>
              <p className="text-sm text-slate-500">
                Showing currently effective role assignments. Scope badges are selected-company previews, not complete access{role.scopeCatalogCapped ? "; the company scope catalog is capped" : ""}.
              </p>
            </div>
          </div>
          <form className="mt-4 flex flex-wrap gap-2" method="get">
            <label className="grid min-w-56 flex-1 gap-1 text-sm font-medium text-slate-700">
              Search assigned users
              <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="assignmentQuery" defaultValue={role.assignedUsersPage.query} placeholder="Name or email" />
            </label>
            <button className="mt-auto min-h-11 rounded-md bg-slate-800 px-4 text-sm font-semibold text-white" type="submit">Search</button>
          </form>
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
                    <Badge tone="success">{user.scopePreviewCapped ? `Showing ${user.scopes.length}+ scope previews` : `${user.scopes.length} scope previews`}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Assigned {new Date(user.startsAt).toLocaleString("en-PH", { timeZone: role.timezone })}</p>
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
          {role.assignedUsersPage.totalItems > 0 ? <PaginationBar page={role.assignedUsersPage.page} pageSize={role.assignedUsersPage.pageSize} totalItems={role.assignedUsersPage.totalItems} itemLabel="assigned users" getPageHref={(nextPage) => `/admin/roles/${role.id}?assignmentPage=${nextPage}${role.assignedUsersPage.query ? `&assignmentQuery=${encodeURIComponent(role.assignedUsersPage.query)}` : ""}${role.permissionPage.page > 1 ? `&permissionPage=${role.permissionPage.page}` : ""}${role.permissionPage.query ? `&permissionQuery=${encodeURIComponent(role.permissionPage.query)}` : ""}${role.permissionPage.filter !== "ALL" ? `&permissionFilter=${role.permissionPage.filter}` : ""}`} /> : null}
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
