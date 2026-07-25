import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Badge, ButtonLink, PaginationBar, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { TaskSheet } from "@/components/TaskSheet";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import {
  approveHighRiskUserLocationScopeRequest,
  approveSensitiveUserRoleRequest,
  assertCanManageCompanyScope,
  createUserRoleAssignment,
  createUserLocationScopeAssignment,
  deactivateUserRoleAssignment,
  deactivateUserScopeAssignment,
  getCoreAdminUserDetail,
  listCoreAdminUserAuditEventPage,
  listCoreAdminUserScopePage,
  rejectHighRiskUserLocationScopeRequest,
  rejectSensitiveUserRoleRequest,
  requestSensitiveUserRole,
  requestHighRiskUserLocationScope
} from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

function humanizeEnum(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatUserAccessDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

type UserAccessSection = "overview" | "roles" | "scopes" | "requests" | "audit";

async function createLocationScope(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const submittedReturnPath = formData.get("returnPath");
  const returnPath = typeof submittedReturnPath === "string" && submittedReturnPath.startsWith(`/admin/users/${targetUserId}`)
    ? submittedReturnPath
    : `/admin/users/${targetUserId}?section=scopes`;
  try {
    await createUserLocationScopeAssignment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
}

async function requestHighRiskScope(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const submittedReturnPath = formData.get("returnPath");
  const returnPath = typeof submittedReturnPath === "string" && submittedReturnPath.startsWith(`/admin/users/${targetUserId}`)
    ? submittedReturnPath
    : `/admin/users/${targetUserId}?section=requests&requestKind=scope`;
  try {
    await requestHighRiskUserLocationScope(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
}

async function approveHighRiskScopeRequest(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const returnPath = String(formData.get("returnPath") || `/admin/users/${targetUserId}`);
  try {
    await approveHighRiskUserLocationScopeRequest(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
}

async function rejectHighRiskScopeRequest(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const returnPath = String(formData.get("returnPath") || `/admin/users/${targetUserId}`);
  try {
    await rejectHighRiskUserLocationScopeRequest(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
}

async function requestSensitiveRole(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const submittedReturnPath = formData.get("returnPath");
  const returnPath = typeof submittedReturnPath === "string" && submittedReturnPath.startsWith(`/admin/users/${targetUserId}`)
    ? submittedReturnPath
    : `/admin/users/${targetUserId}?section=requests&requestKind=role`;
  try {
    await requestSensitiveUserRole(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
}

async function approveSensitiveRoleRequest(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const returnPath = String(formData.get("returnPath") || `/admin/users/${targetUserId}`);
  try {
    await approveSensitiveUserRoleRequest(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
}

async function rejectSensitiveRoleRequest(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const returnPath = String(formData.get("returnPath") || `/admin/users/${targetUserId}`);
  try {
    await rejectSensitiveUserRoleRequest(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
}

async function deactivateScope(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const returnPath = String(formData.get("returnPath") || `/admin/users/${targetUserId}`);
  try {
    await deactivateUserScopeAssignment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
}

async function createRoleAssignment(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const submittedReturnPath = formData.get("returnPath");
  const returnPath = typeof submittedReturnPath === "string" && submittedReturnPath.startsWith(`/admin/users/${targetUserId}`)
    ? submittedReturnPath
    : `/admin/users/${targetUserId}?section=roles`;
  try {
    await createUserRoleAssignment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
}

async function deactivateRoleAssignment(formData: FormData) {
  "use server";

  const targetUserId = String(formData.get("targetUserId"));
  const returnPath = String(formData.get("returnPath") || "/admin/users/" + targetUserId + "?section=roles");
  try {
    await deactivateUserRoleAssignment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(returnPath);
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

  try {
    await assertCanManageCompanyScope(session, session.context.companyId);
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_SCOPE_DENIED") {
      return (
        <AppShell
          session={session}
          title="User Access"
          subtitle="Core Administration user detail"
          activeNav="admin"
        >
          <Panel className="ogfi-detail-card border-amber-200 bg-amber-50">
            <Badge tone="warning">Access restricted</Badge>
            <h2 className="mt-3 text-lg font-bold text-slate-950">
              Selected-company Manage scope is required
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              This account cannot open user access details for the selected company.
              No user, role, scope, or access-history data was loaded.
            </p>
          </Panel>
        </AppShell>
      );
    }
    throw error;
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locationQuery = Array.isArray(resolvedSearchParams.locationQuery)
    ? resolvedSearchParams.locationQuery[0]
    : resolvedSearchParams.locationQuery;
  const roleQuery = Array.isArray(resolvedSearchParams.roleQuery)
    ? resolvedSearchParams.roleQuery[0]
    : resolvedSearchParams.roleQuery;
  const assignedRoleQuery = Array.isArray(resolvedSearchParams.assignedRoleQuery)
    ? resolvedSearchParams.assignedRoleQuery[0]
    : resolvedSearchParams.assignedRoleQuery;
  const assignedRolePageValue = Number.parseInt(String(resolvedSearchParams.assignedRolePage ?? "1"), 10);
  const scopeQuery = Array.isArray(resolvedSearchParams.scopeQuery) ? resolvedSearchParams.scopeQuery[0] : resolvedSearchParams.scopeQuery;
  const scopeType = Array.isArray(resolvedSearchParams.scopeType) ? resolvedSearchParams.scopeType[0] : resolvedSearchParams.scopeType;
  const scopePageValue = Number.parseInt(String(resolvedSearchParams.scopePage ?? "1"), 10);
  const scopeActionId = Array.isArray(resolvedSearchParams.scopeActionId) ? resolvedSearchParams.scopeActionId[0] : resolvedSearchParams.scopeActionId;
  const roleActionId = Array.isArray(resolvedSearchParams.roleActionId) ? resolvedSearchParams.roleActionId[0] : resolvedSearchParams.roleActionId;
  const sectionValue = Array.isArray(resolvedSearchParams.section) ? resolvedSearchParams.section[0] : resolvedSearchParams.section;
  const section: UserAccessSection = ["overview", "roles", "scopes", "requests", "audit"].includes(sectionValue ?? "")
    ? (sectionValue as UserAccessSection)
    : "overview";
  const requestKindValue = Array.isArray(resolvedSearchParams.requestKind) ? resolvedSearchParams.requestKind[0] : resolvedSearchParams.requestKind;
  const requestKind = requestKindValue === "role" ? "role" : "scope";
  const requestActionId = Array.isArray(resolvedSearchParams.requestActionId) ? resolvedSearchParams.requestActionId[0] : resolvedSearchParams.requestActionId;
  const auditCursor = Array.isArray(resolvedSearchParams.auditCursor) ? resolvedSearchParams.auditCursor[0] : resolvedSearchParams.auditCursor;
  const auditQuery = Array.isArray(resolvedSearchParams.auditQuery) ? resolvedSearchParams.auditQuery[0] : resolvedSearchParams.auditQuery;
  const scopeRequestStatusValue = Array.isArray(resolvedSearchParams.scopeRequestStatus)
    ? resolvedSearchParams.scopeRequestStatus[0]
    : resolvedSearchParams.scopeRequestStatus;
  const roleRequestStatusValue = Array.isArray(resolvedSearchParams.roleRequestStatus)
    ? resolvedSearchParams.roleRequestStatus[0]
    : resolvedSearchParams.roleRequestStatus;
  const scopeRequestPageValue = Number.parseInt(String(resolvedSearchParams.scopeRequestPage ?? "1"), 10);
  const roleRequestPageValue = Number.parseInt(String(resolvedSearchParams.roleRequestPage ?? "1"), 10);
  const scopeRequestPageSizeValue = Number.parseInt(String(resolvedSearchParams.scopeRequestPageSize ?? "25"), 10);
  const roleRequestPageSizeValue = Number.parseInt(String(resolvedSearchParams.roleRequestPageSize ?? "25"), 10);
  const permissionPageValue = Number.parseInt(String(resolvedSearchParams.permissionPage ?? "1"), 10);
  const permissionQuery = Array.isArray(resolvedSearchParams.permissionQuery)
    ? resolvedSearchParams.permissionQuery[0]
    : resolvedSearchParams.permissionQuery;
  const user = await getCoreAdminUserDetail(session, id, {
    ...(locationQuery ? { locationQuery } : {}),
    ...(roleQuery ? { roleQuery } : {}),
    ...(assignedRoleQuery ? { assignedRoleQuery } : {}),
    assignedRolePage: Number.isFinite(assignedRolePageValue) ? assignedRolePageValue : 1,
    assignedRolePageSize: 25,
    permissionPage: Number.isFinite(permissionPageValue) ? permissionPageValue : 1,
    permissionPageSize: 25,
    ...(section === "roles" && permissionQuery ? { permissionQuery } : {}),
    scopeRequestPage: Number.isFinite(scopeRequestPageValue) ? scopeRequestPageValue : 1,
    scopeRequestPageSize: Number.isFinite(scopeRequestPageSizeValue) ? scopeRequestPageSizeValue : 25,
    requestKind: section === "requests" ? requestKind : "none",
    userAccessSection: section,
    roleRequestPage: Number.isFinite(roleRequestPageValue) ? roleRequestPageValue : 1,
    roleRequestPageSize: Number.isFinite(roleRequestPageSizeValue) ? roleRequestPageSizeValue : 25,
    ...(scopeRequestStatusValue && ["PENDING", "APPROVED", "REJECTED"].includes(scopeRequestStatusValue)
      ? { scopeRequestStatus: scopeRequestStatusValue as "PENDING" | "APPROVED" | "REJECTED" }
      : {}),
    ...(roleRequestStatusValue && ["PENDING", "APPROVED", "REJECTED"].includes(roleRequestStatusValue)
      ? { roleRequestStatus: roleRequestStatusValue as "PENDING" | "APPROVED" | "REJECTED" }
      : {}),
  });
  if (!user) {
    redirect("/admin");
  }
  const auditPage = section === "audit"
    ? await listCoreAdminUserAuditEventPage(session, id, {
        ...(auditCursor ? { cursor: auditCursor } : {}),
        ...(auditQuery ? { query: auditQuery } : {}),
        pageSize: 25,
      })
    : null;
  const loadScopePage =
    section === "overview" ||
    section === "scopes" ||
    (section === "requests" && requestKind === "scope");
  const loadRoleSurface = section === "overview" || section === "roles";
  const scopePage = loadScopePage
    ? await listCoreAdminUserScopePage(session, id, {
        ...(scopeQuery ? { query: scopeQuery } : {}),
        ...(scopeType ? { scopeType } : {}),
        page: Number.isFinite(scopePageValue) ? scopePageValue : 1,
        pageSize: 25,
      })
    : {
        items: [],
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 1,
        query: "",
        scopeType: null,
      };
  const scopedUser = {
    ...user,
    scopes: scopePage.items.map((item) => ({
      id: item.id,
      type: item.scopeType,
      scopeId: item.scopeId,
      displayName: item.displayName,
      displayContext: item.displayContext,
      code: item.code,
      accessLevel: item.accessLevel,
      canMutate: item.canMutate,
      riskLabel: item.riskLabel,
      startsAt: item.startsAt.toISOString(),
      effectiveState: item.effectiveState,
      endsAt: item.endsAt?.toISOString() ?? null,
    })),
    scopesPage: scopePage,
  };
  const selectedScope = scopeActionId ? scopedUser.scopes.find((scope) => scope.id === scopeActionId) : null;
  const selectedRole = roleActionId ? user.roles.find((role) => role.assignmentId === roleActionId) : null;
  const roleReturnPath = `/admin/users/${id}?section=roles${user.rolesPage.page > 1 ? `&assignedRolePage=${user.rolesPage.page}` : ""}${user.rolesPage.query ? `&assignedRoleQuery=${encodeURIComponent(user.rolesPage.query)}` : ""}`;
  const buildScopeHref = (actionId?: string, page = scopePage.page) => `/admin/users/${id}?section=scopes&scopePage=${page}${scopePage.query ? `&scopeQuery=${encodeURIComponent(scopePage.query)}` : ""}${scopePage.scopeType ? `&scopeType=${encodeURIComponent(scopePage.scopeType)}` : ""}${actionId ? `&scopeActionId=${encodeURIComponent(actionId)}` : ""}`;
  const scopeReturnPath = buildScopeHref();
  const requestReturnPath = `/admin/users/${id}?section=requests&requestKind=${requestKind}${requestActionId ? `&requestActionId=${encodeURIComponent(requestActionId)}` : ""}${scopeRequestStatusValue ? `&scopeRequestStatus=${encodeURIComponent(scopeRequestStatusValue)}` : ""}${roleRequestStatusValue ? `&roleRequestStatus=${encodeURIComponent(roleRequestStatusValue)}` : ""}${requestKind === "scope" ? `&scopeRequestPage=${user?.highRiskScopeRequestPage.page ?? 1}` : `&roleRequestPage=${user?.sensitiveRoleRequestPage.page ?? 1}`}`;
  const selectedScopeRequest = requestKind === "scope" && requestActionId
    ? scopedUser.highRiskScopeRequests.find((request) => request.id === requestActionId)
    : null;
  const selectedRoleRequest = requestKind === "role" && requestActionId
    ? scopedUser.sensitiveRoleRequests.find((request) => request.id === requestActionId)
    : null;
  const availableLocations = scopedUser.assignableLocations;
  const requestableHighRiskLocations = scopedUser.controlledLocationCatalog;
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
              Company: {session.context.companyName}. You are managing one user. Return to the Users workspace to choose another user.
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
          <p className="mt-2 text-3xl font-bold text-slate-950">{loadRoleSurface ? user.rolesPage.totalItems : "—"}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Scopes</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{loadScopePage ? scopedUser.scopesPage.totalItems : "—"}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Permissions</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{loadRoleSurface ? user.permissionTotal : "—"}</p>
        </Panel>
      </div>
      <nav aria-label="User access sections" className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[var(--shadow-soft)]">
        {[['overview', 'Overview'], ['roles', 'Roles'], ['scopes', 'Scopes'], ['requests', 'Requests'], ['audit', 'Audit']].map(([key, label]) => (
          <ButtonLink key={key} href={`/admin/users/${user.id}?section=${key}`} tone={section === key ? "primary" : "ghost"} className="min-h-11">
            {label}
          </ButtonLink>
        ))}
      </nav>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        {section === "requests" ? (
          <div className="xl:col-span-2 flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
            <span className="text-sm font-semibold text-slate-700">Request type</span>
            <ButtonLink href={`/admin/users/${user.id}?section=requests&requestKind=scope`} tone={requestKind === "scope" ? "primary" : "ghost"} className="min-h-11">Scope requests</ButtonLink>
            <ButtonLink href={`/admin/users/${user.id}?section=requests&requestKind=role`} tone={requestKind === "role" ? "primary" : "ghost"} className="min-h-11">Role requests</ButtonLink>
          </div>
        ) : null}
        {section !== "requests" ? <>
        {section === "overview" || section === "roles" ? <>
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Assigned Role Lifecycle</h2>
              <p className="text-sm text-slate-500">Active assignment records include scheduled (FUTURE) and ended (EXPIRED) dates; this is not the user’s current effective permission set.</p>
            </div>
            {user.canMutateRoles ? <Badge tone="warning">Mutable</Badge> : <Badge>Self protected</Badge>}
          </div>
          <form className="mt-4 flex flex-wrap gap-2" method="get">
            <input name="section" type="hidden" value="roles" />
            <label className="grid min-w-56 flex-1 gap-1 text-sm font-medium text-slate-700">
              Search assigned roles
              <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" name="assignedRoleQuery" defaultValue={user.rolesPage.query} placeholder="Role name or code" />
            </label>
            <button className="mt-auto min-h-11 rounded-md bg-slate-800 px-4 text-sm font-semibold text-white" type="submit">Search</button>
          </form>
          <div className="mt-4 divide-y divide-slate-100">
            {user.roles.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">{user.rolesPage.query ? "No role assignment records match this filter." : "No active role assignment records."}</p>
            ) : (
              user.roles.map((role) => (
                <div
                  key={role.assignmentId}
                  data-testid="admin-user-role-row"
                  className="ogfi-list-row grid gap-2 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{role.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{role.code} · Assignment: {role.effectiveState} · Role: {role.status}</p>
                    <p className="mt-2 text-sm text-slate-600">Assigned {formatUserAccessDate(role.startsAt)}{role.endsAt ? ` · ends ${formatUserAccessDate(role.endsAt)}` : ""}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <ButtonLink href={`/admin/roles/${role.roleId}`} tone="ghost" className="min-h-11 px-0 text-sm text-blue-700">View role detail</ButtonLink>
                      {user.canMutateRoles && role.canMutate ? (
                        <ButtonLink href={`${roleReturnPath}&roleActionId=${encodeURIComponent(role.assignmentId)}`} tone="ghost" className="min-h-11 px-0 text-sm text-amber-700">Open role controls</ButtonLink>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {user.rolesPage.totalItems > 0 ? <PaginationBar page={user.rolesPage.page} pageSize={user.rolesPage.pageSize} totalItems={user.rolesPage.totalItems} itemLabel="assigned roles" getPageHref={(nextPage) => `/admin/users/${user.id}?section=roles&assignedRolePage=${nextPage}${user.rolesPage.query ? `&assignedRoleQuery=${encodeURIComponent(user.rolesPage.query)}` : ""}`} /> : null}
          {roleActionId ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="admin-user-role-controls">
              {selectedRole ? (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Role controls</p>
                      <p className="mt-1 font-semibold text-slate-950">{selectedRole.name} ({selectedRole.code})</p>
                      <p className="mt-1 text-sm text-slate-700">Status: {selectedRole.status} · Assigned {selectedRole.startsAt}</p>
                    </div>
                    <ButtonLink href={roleReturnPath} tone="ghost" className="min-h-11">Close controls</ButtonLink>
                  </div>
                  {user.canMutateRoles && selectedRole.canMutate ? (
                    <form action={deactivateRoleAssignment} className="ogfi-form-shell mt-4 grid gap-3">
                      <input name="targetUserId" type="hidden" value={user.id} />
                      <input name="assignmentId" type="hidden" value={selectedRole.assignmentId} />
                      <input name="returnPath" type="hidden" value={roleReturnPath} />
                      <p className="text-sm text-amber-900">Deactivation revokes this user’s role assignment after server-side eligibility and concurrency checks.</p>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Role deactivation reason
                        <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" name="reason" minLength={5} required />
                      </label>
                      <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-700 px-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-fit">
                        Deactivate Role
                      </button>
                    </form>
                  ) : (
                    <p className="mt-3 text-sm text-amber-900">This role cannot be changed from the current user context. Server-side authorization and self-protection controls remain authoritative.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-amber-900">This role assignment is no longer on the selected page or is no longer active. Refresh the role list before taking action.</p>
              )}
            </div>
          ) : null}
        </Panel>
        </> : null}

        {section === "overview" || section === "roles" ? <>
        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Effective Permissions</h2>
          <p className="mt-1 text-sm text-slate-500">Read-only access derived from this user’s currently effective active roles in the selected company.</p>
          {section === "roles" ? (
            <form className="mt-4 flex flex-wrap gap-2" method="get">
              <input name="section" type="hidden" value="roles" />
              <input name="assignedRolePage" type="hidden" value={user.rolesPage.page} />
              {user.rolesPage.query ? <input name="assignedRoleQuery" type="hidden" value={user.rolesPage.query} /> : null}
              <label className="grid min-w-56 flex-1 gap-1 text-sm font-medium text-slate-700">
                Search effective permissions
                <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" name="permissionQuery" maxLength={120} defaultValue={user.permissionsPage.query} placeholder="Permission code" />
              </label>
              <button className="mt-auto min-h-11 rounded-md bg-slate-800 px-4 text-sm font-semibold text-white" type="submit">Search</button>
            </form>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {user.permissions.length === 0 ? (
              <p className="text-sm text-slate-600">{user.permissionsPage.query ? "No effective permissions match this filter." : "No effective permissions from active roles."}</p>
            ) : (
              user.permissions.map((permission) => (
                permission.id ? (
                  <ButtonLink key={permission.code} href={`/admin/permissions/${permission.id}`} tone="ghost" className="min-h-11 px-1">
                    <Badge tone={permission.sensitive ? "warning" : "info"}>{permission.label}</Badge>
                  </ButtonLink>
                ) : (
                  <Badge key={permission.code} tone={permission.sensitive ? "warning" : "info"}>{permission.label}</Badge>
                )
              ))
            )}
          </div>
          {section === "roles" ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span>{user.permissionsPage.query ? `Showing ${user.permissions.length} matching permissions of ${user.permissionTotal} effective permissions` : `Showing ${user.permissions.length} of ${user.permissionTotal} effective permissions`}</span>
                {user.permissionsPage.query ? <ButtonLink href={`/admin/users/${user.id}?section=roles`} tone="ghost" className="min-h-11 px-0 text-blue-700">Clear search</ButtonLink> : null}
              </div>
              {user.permissionsPage.totalItems > 0 ? <PaginationBar page={user.permissionsPage.page} pageSize={user.permissionsPage.pageSize} totalItems={user.permissionsPage.totalItems} itemLabel="effective permissions" getPageHref={(nextPage) => `/admin/users/${user.id}?section=roles&permissionPage=${nextPage}${user.permissionsPage.query ? `&permissionQuery=${encodeURIComponent(user.permissionsPage.query)}` : ""}${user.rolesPage.page > 1 ? `&assignedRolePage=${user.rolesPage.page}` : ""}${user.rolesPage.query ? `&assignedRoleQuery=${encodeURIComponent(user.rolesPage.query)}` : ""}`} /> : null}
            </>
          ) : user.permissionTotal > user.permissions.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><span>Showing {user.permissions.length} of {user.permissionTotal} effective permissions.</span><ButtonLink href={`/admin/users/${user.id}?section=roles&permissionPage=1${user.rolesPage.page > 1 ? `&assignedRolePage=${user.rolesPage.page}` : ""}${user.rolesPage.query ? `&assignedRoleQuery=${encodeURIComponent(user.rolesPage.query)}` : ""}`} tone="ghost" className="min-h-11 px-0 text-blue-700">Open effective permission list</ButtonLink></div>
          ) : null}
        </Panel>

        </> : null}
        {section === "scopes" ? <>
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Assigned Scopes</h2>
              <p className="text-sm text-slate-500">Location scope changes require a reason</p>
            </div>
            {user.canMutateScopes ? <Badge tone="warning">Mutable</Badge> : <Badge>Self protected</Badge>}
          </div>
          <form className="mt-4 grid gap-2 md:grid-cols-[1fr_12rem_auto]" method="get">
            <input name="section" type="hidden" value="scopes" />
            <label className="grid gap-1 text-sm font-medium text-slate-700">Search scopes<input className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" name="scopeQuery" defaultValue={scopedUser.scopesPage.query} placeholder="Name or code" /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Type<select className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" name="scopeType" defaultValue={scopedUser.scopesPage.scopeType ?? ""}><option value="">All types</option>{["COMPANY", "BRAND", "LOCATION", "DEPARTMENT", "PROJECT"].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <button className="mt-auto min-h-11 rounded-md bg-slate-800 px-4 text-sm font-semibold text-white" type="submit">Search</button>
          </form>
          <div className="mt-4 divide-y divide-slate-100">
            {scopedUser.scopes.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">{scopedUser.scopesPage.query || scopedUser.scopesPage.scopeType ? "No scopes match this filter." : "No active scopes are assigned."}</p>
            ) : (
              scopedUser.scopes.map((scope) => (
                <div
                  key={scope.id}
                  data-testid="admin-user-scope-row"
                  data-scope-can-mutate={String(scope.canMutate)}
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
                    <p className="mt-2 text-sm text-slate-600">Assigned {formatUserAccessDate(scope.startsAt)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{scope.effectiveState}{scope.endsAt ? ` · ends ${formatUserAccessDate(scope.endsAt)}` : ""}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {scope.riskLabel}
                    </p>
                    <ButtonLink href={buildScopeHref(scope.id)} tone="ghost" className="mt-3 min-h-11 px-0 text-sm text-blue-700">Open scope controls</ButtonLink>
                  </div>
                </div>
              ))
            )}
          </div>
          {scopeActionId && !selectedScope ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This scope is no longer available in the current filtered page. Refresh the register before taking action.</p> : null}
          {selectedScope ? <EntryModal title="Deactivate Scope" triggerLabel={`Controls: ${selectedScope.displayName}`}>
            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700"><p className="font-semibold text-slate-950">{selectedScope.displayName}</p><p>{selectedScope.displayContext} · {humanizeEnum(selectedScope.type)} · {humanizeEnum(selectedScope.accessLevel)}</p><p className="mt-1">{selectedScope.riskLabel}. Deactivation is audited and rechecked when submitted.</p></div>
            {user.canMutateScopes && selectedScope.canMutate ? <form action={deactivateScope} className="ogfi-form-shell mt-4 grid gap-3"><input name="targetUserId" type="hidden" value={user.id} /><input name="assignmentId" type="hidden" value={selectedScope.id} /><input name="returnPath" type="hidden" value={scopeReturnPath} /><label className="grid gap-1 text-sm font-medium text-slate-700">Deactivation reason<input className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" name="reason" minLength={5} required /></label><button className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-700 px-3 text-sm font-bold text-white sm:w-fit">Deactivate Scope</button></form> : <p className="mt-3 text-sm text-amber-800">This scope cannot be deactivated from the current user context. Live authorization and risk controls remain authoritative.</p>}
          </EntryModal> : null}
          {scopedUser.scopesPage.totalItems > 0 ? <PaginationBar page={scopedUser.scopesPage.page} pageSize={scopedUser.scopesPage.pageSize} totalItems={scopedUser.scopesPage.totalItems} itemLabel="scopes" getPageHref={(nextPage) => buildScopeHref(undefined, nextPage)} /> : null}
        </Panel>
        </> : null}

        {section === "audit" ? (
          <Panel className="ogfi-detail-card xl:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Audit</h2>
                <p className="text-sm text-slate-500">Read-only actor history for {user.displayName}; sensitive fields remain redacted.</p>
              </div>
              <Badge tone="info">Selected company</Badge>
            </div>
            <form method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="section" value="audit" />
              <label className="grid flex-1 gap-1 text-sm font-medium text-slate-700">Search audit events<input className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" name="auditQuery" defaultValue={auditQuery ?? ""} placeholder="Event, entity, or request ID" /></label>
              <button className="min-h-11 self-end rounded-md bg-slate-800 px-4 text-sm font-semibold text-white" type="submit">Search</button>
            </form>
            {!auditPage || auditPage.items.length === 0 ? (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No matching audit events are available for this user and selected company.</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {auditPage.items.map((event) => (
                  <div key={event.id} data-testid="admin-user-audit-row" className="ogfi-list-row grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div><p className="font-semibold text-slate-950">{event.eventType}</p><p className="text-sm text-slate-600">{event.entityType} / {event.entityId}</p><p className="text-xs text-slate-500">{formatUserAccessDate(event.occurredAt)} · {event.companyName}</p></div>
                    <ButtonLink href={`/admin/audit/${event.id}?returnTo=${encodeURIComponent(`/admin/users/${user.id}?section=audit${auditQuery ? `&auditQuery=${encodeURIComponent(auditQuery)}` : ""}`)}`} tone="ghost" className="min-h-11 self-start text-blue-700">Open audit detail</ButtonLink>
                  </div>
                ))}
              </div>
            )}
            {auditPage ? <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>Showing {auditPage.items.length} of {auditPage.totalItems} audit events</span>{auditPage.hasMore ? <ButtonLink href={`/admin/users/${user.id}?section=audit&auditCursor=${encodeURIComponent(auditPage.nextCursor ?? "")}${auditQuery ? `&auditQuery=${encodeURIComponent(auditQuery)}` : ""}`} tone="secondary" className="min-h-11">Next page</ButtonLink> : <span>End of audit history</span>}</div> : null}
          </Panel>
        ) : null}

        {section === "scopes" && user.canMutateScopes ? (
          <Panel className="xl:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Assign Location Scope</h2>
                <p className="text-sm text-slate-500">Creates an auditable active scope assignment</p>
              </div>
              <Badge tone="info">Role unchanged</Badge>
            </div>
            <form method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="section" value="scopes" />
              <input
                className="min-h-10 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                name="locationQuery"
                defaultValue={locationQuery ?? ""}
                placeholder="Find an active location by name or code"
              />
              <button type="submit" className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">
                Find locations
              </button>
            </form>
            {user.assignableLocationCatalogHasMore ? (
              <p className="mt-2 text-xs text-amber-700">
                More active locations exist. Refine the search to find a location outside this first 100-result catalog.
              </p>
            ) : null}
            {availableLocations.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No low-risk unassigned active locations are available for this user.
                High-risk warehouse, commissary, head-office, project, temporary, or
                Manage-level scope changes require controlled approval.
              </p>
            ) : (
              <div className="mt-4">
                <EntryModal title="Assign Location Scope" triggerLabel="Assign Scope">
                  <form action={createLocationScope} className="ogfi-form-shell mt-4 grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} />
                    <input name="returnPath" type="hidden" value={scopeReturnPath} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Location
                      <select className="rounded-md border border-slate-300 px-3 py-2" name="locationId" required>
                        {availableLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name} / {location.type} / {location.assignmentEligibility}
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
                      </select>
                      <span className="text-xs text-slate-500">
                        Manage-level scope requires controlled approval and is not available in quick assignment.
                      </span>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Scope assignment reason
                      <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
                    </label>
                    <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 sm:w-fit">
                      Assign Scope
                    </button>
                  </form>
                </EntryModal>
              </div>
            )}
          </Panel>
        ) : null}
        </> : null}

        {section === "requests" && requestKind === "scope" && user.canMutateScopes ? (
          <Panel className="xl:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Controlled Scope Requests
                </h2>
                <p className="text-sm text-slate-500">
                  Warehouse, commissary, head-office, project, temporary, and
                  Manage-level scope changes require a second admin decision.
                </p>
              </div>
              <Badge tone="warning">Approval required</Badge>
            </div>

            <form method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="section" value="requests" /><input type="hidden" name="requestKind" value="scope" />
              <input type="hidden" name="scopeRequestPage" value="1" />
              {locationQuery ? <input type="hidden" name="locationQuery" value={locationQuery} /> : null}
              <select className="min-h-11 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" name="scopeRequestStatus" defaultValue={scopeRequestStatusValue ?? ""}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select>
              <button type="submit" className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">Filter requests</button>
            </form>
            <form method="get" className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="section" value="requests" /><input type="hidden" name="requestKind" value="scope" /><input type="hidden" name="scopeRequestPage" value="1" />
              {scopeRequestStatusValue ? <input type="hidden" name="scopeRequestStatus" value={scopeRequestStatusValue} /> : null}
              <input className="min-h-10 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" name="locationQuery" defaultValue={locationQuery ?? ""} placeholder="Find a high-risk location" />
              <button type="submit" className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">Find locations</button>
            </form>

            <div className="mt-4">
              {user.controlledLocationCatalogHasMore ? (
                <p className="mb-2 text-xs text-amber-700">More high-risk locations exist. Refine the location search to find a location outside this first 100-result catalog.</p>
              ) : null}
              {requestableHighRiskLocations.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No unassigned active locations are available for controlled
                  scope request.
                </p>
              ) : (
                <TaskSheet
                  title="Request Controlled Scope"
                  trigger={<span>Request Controlled Scope</span>}
                  triggerClassName="min-h-11 bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700"
                  size="default"
                  bodyScroll="contained"
                  description={`Controlled scope request for ${user.displayName} in the selected company. Evidence and a reason are required.`}
                >
                  <form action={requestHighRiskScope} className="ogfi-form-shell mt-4 grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} />
                    <input name="returnPath" type="hidden" value={requestReturnPath} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Location
                      <select className="rounded-md border border-slate-300 px-3 py-2" name="locationId" required>
                        {requestableHighRiskLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name} / {location.type} / {location.assignmentEligibility}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Requested access
                      <select className="rounded-md border border-slate-300 px-3 py-2" name="accessLevel" required>
                        <option value="VIEW">VIEW</option>
                        <option value="OPERATE">OPERATE</option>
                        <option value="APPROVE">APPROVE</option>
                        <option value="MANAGE">MANAGE</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Business reason
                      <textarea
                        className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                        name="reason"
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Evidence reference
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="evidenceReference"
                        placeholder="Approval note, ticket, rollout plan, or incident reference"
                        required
                      />
                    </label>
                    <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700 sm:w-fit">
                      Submit Controlled Request
                    </button>
                  </form>
                </TaskSheet>
              )}
            </div>

            <div className="mt-5 divide-y divide-slate-100">
              {user.highRiskScopeRequests.length === 0 ? (
                <div className="py-4 text-sm text-slate-600">
                  <p>{scopeRequestStatusValue ? "No controlled scope requests match this status filter." : "No controlled scope requests have been recorded for this user."}</p>
                  {scopeRequestStatusValue ? <ButtonLink href={`/admin/users/${user.id}?section=requests&requestKind=scope`} tone="ghost" className="mt-2 min-h-11 px-0 text-blue-700">Clear status filter</ButtonLink> : null}
                </div>
              ) : (
                user.highRiskScopeRequests.map((request) => {
                  const canReview =
                    request.status === "PENDING" &&
                    request.requestedByUserId !== session.user.id &&
                    user.id !== session.user.id;
                  return (
                    <div
                      key={request.id}
                      className="ogfi-list-row grid gap-3 lg:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-950">
                            {request.locationName}
                          </p>
                          <Badge
                            tone={
                              request.status === "APPROVED"
                                ? "success"
                                : request.status === "REJECTED"
                                  ? "destructive"
                                  : "warning"
                            }
                          >
                            {humanizeEnum(request.status)}
                          </Badge>
                          <Badge tone="info">
                            {humanizeEnum(request.accessLevel)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {request.locationCode ?? "No code"} /{" "}
                          {humanizeEnum(request.locationType)} /{" "}
                          {request.riskLabel}
                        </p>
                        {request.reason ? (
                          <p className="mt-2 text-sm text-slate-700">{request.reason}</p>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">
                            Review narrative is retained in the audit record; it is not shown in this historical summary.
                          </p>
                        )}
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {request.evidenceRecorded ? "Evidence recorded" : "No evidence reference recorded"} / Requested by{" "}
                          {request.requestedByName} on{" "}
                          {formatUserAccessDate(request.createdAt)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {request.status === "PENDING" ? "Next action: eligible second-admin review" : `Outcome: ${humanizeEnum(request.status)}`}
                        </p>
                        {request.reviewedByName ? (
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Reviewed by {request.reviewedByName}
                            {request.reviewedAt
                              ? ` on ${formatUserAccessDate(request.reviewedAt)}`
                              : ""}
                            {request.reviewReason ? ` / ${request.reviewReason}` : ""}
                          </p>
                        ) : null}
                      </div>
                      {canReview ? (
                        <ButtonLink href={`/admin/users/${user.id}?section=requests&requestKind=scope&requestActionId=${encodeURIComponent(request.id)}`} tone="ghost" className="min-h-11 self-start text-blue-700">
                          Open review controls
                        </ButtonLink>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Showing {user.highRiskScopeRequests.length} of {user.highRiskScopeRequestPage.totalItems} scope requests</span>
              <PaginationBar
                page={user.highRiskScopeRequestPage.page}
                pageSize={user.highRiskScopeRequestPage.pageSize}
                totalItems={user.highRiskScopeRequestPage.totalItems}
                itemLabel="scope requests"
                controlClassName="min-h-10"
                getPageHref={(nextPage) => {
                  const next = new URLSearchParams({ section: "requests", requestKind: "scope", scopeRequestPage: String(nextPage), scopeRequestPageSize: String(user.highRiskScopeRequestPage.pageSize) });
                  if (scopeRequestStatusValue) next.set("scopeRequestStatus", scopeRequestStatusValue);
                  if (locationQuery) next.set("locationQuery", locationQuery);
                  return `/admin/users/${user.id}?${next.toString()}`;
                }}
              />
            </div>
          </Panel>
        ) : null}

        {section === "roles" && user.canMutateRoles ? (
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
            <form method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="section" value="roles" />
              <input
                className="min-h-10 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                name="roleQuery"
                defaultValue={roleQuery ?? ""}
                placeholder="Find an active role by name or code"
              />
              <button type="submit" className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">
                Find roles
              </button>
            </form>
            {user.assignableRoleCatalogHasMore ? (
              <p className="mt-2 text-xs text-amber-700">
                More active roles exist. Refine the search to find a role outside this first 100-result catalog.
              </p>
            ) : null}
            {user.assignableRoles.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No unassigned roles are available for this user.
              </p>
            ) : (
              <div className="mt-4">
                <EntryModal title="Assign Role" triggerLabel="Assign Role">
                  <form action={createRoleAssignment} className="ogfi-form-shell mt-4 grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} />
                    <input name="returnPath" type="hidden" value={roleReturnPath} />
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
                    <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 sm:w-fit">
                      Assign Role
                    </button>
                  </form>
                </EntryModal>
              </div>
            )}
          </Panel>
        ) : null}

        {section === "requests" && requestKind === "role" && user.canMutateRoles ? (
          <Panel className="xl:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Controlled Role Requests
                </h2>
                <p className="text-sm text-slate-500">
                  Admin, approver, and sensitive-permission roles require
                  evidence, MFA, and a separate admin decision.
                </p>
              </div>
              <Badge tone="warning">Dual approval</Badge>
            </div>

            <form method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="section" value="requests" /><input type="hidden" name="requestKind" value="role" />
              <input type="hidden" name="roleRequestPage" value="1" />
              {roleQuery ? <input type="hidden" name="roleQuery" value={roleQuery} /> : null}
              <select className="min-h-11 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" name="roleRequestStatus" defaultValue={roleRequestStatusValue ?? ""}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select>
              <button type="submit" className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">Filter requests</button>
            </form>
            <form method="get" className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="section" value="requests" /><input type="hidden" name="requestKind" value="role" /><input type="hidden" name="roleRequestPage" value="1" />
              {roleRequestStatusValue ? <input type="hidden" name="roleRequestStatus" value={roleRequestStatusValue} /> : null}
              <input className="min-h-10 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" name="roleQuery" defaultValue={roleQuery ?? ""} placeholder="Find a controlled role" />
              <button type="submit" className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">Find roles</button>
            </form>

            <div className="mt-4">
              {user.requestableSensitiveRoleCatalogHasMore ? (
                <p className="mb-2 text-xs text-amber-700">More controlled roles exist. Refine the role search to find a role outside this first 100-result catalog.</p>
              ) : null}
              {user.requestableSensitiveRoles.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No unassigned sensitive roles are available for controlled
                  request.
                </p>
              ) : (
                <TaskSheet
                  title="Request Controlled Role"
                  trigger={<span>Request Controlled Role</span>}
                  triggerClassName="min-h-11 bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700"
                  size="default"
                  bodyScroll="contained"
                  description={`Controlled role request for ${user.displayName}. Evidence, MFA, and a reason are required.`}
                >
                  <form action={requestSensitiveRole} className="ogfi-form-shell mt-4 grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} />
                    <input name="returnPath" type="hidden" value={requestReturnPath} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Role
                      <select className="rounded-md border border-slate-300 px-3 py-2" name="roleId" required>
                        {user.requestableSensitiveRoles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name} - {role.assignmentEligibility}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Business reason
                      <textarea
                        className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                        name="reason"
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Evidence reference
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="evidenceReference"
                        placeholder="Approval note, ticket, rollout plan, or controls evidence"
                        required
                      />
                    </label>
                    <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700 sm:w-fit">
                      Submit Controlled Role Request
                    </button>
                  </form>
                </TaskSheet>
              )}
            </div>

            <div className="mt-5 divide-y divide-slate-100">
              {user.sensitiveRoleRequests.length === 0 ? (
                <div className="py-4 text-sm text-slate-600">
                  <p>{roleRequestStatusValue ? "No controlled role requests match this status filter." : "No controlled role requests have been recorded for this user."}</p>
                  {roleRequestStatusValue ? <ButtonLink href={`/admin/users/${user.id}?section=requests&requestKind=role`} tone="ghost" className="mt-2 min-h-11 px-0 text-blue-700">Clear status filter</ButtonLink> : null}
                </div>
              ) : (
                user.sensitiveRoleRequests.map((request) => {
                  const canReview =
                    request.status === "PENDING" &&
                    request.requestedByUserId !== session.user.id &&
                    user.id !== session.user.id;
                  return (
                    <div
                      key={request.id}
                      className="ogfi-list-row grid gap-3 lg:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-950">
                            {request.roleName}
                          </p>
                          <Badge
                            tone={
                              request.status === "APPROVED"
                                ? "success"
                                : request.status === "REJECTED"
                                  ? "destructive"
                                  : "warning"
                            }
                          >
                            {humanizeEnum(request.status)}
                          </Badge>
                          <Badge tone="info">{request.roleCode}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {request.riskLabel}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {request.permissionIntegrityIssue ? (
                            <span className="basis-full rounded-md border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-800">
                              Permission data needs administrator review. Review actions are unavailable until the role-permission links are repaired.
                            </span>
                          ) : null}
                          {request.permissionLabels.map((permission) => (
                            <Badge
                              key={permission.code}
                              tone={permission.sensitive ? "warning" : "info"}
                              size="sm"
                            >
                              {permission.label}
                            </Badge>
                          ))}
                          {request.permissionTotal > request.permissionLabels.length ? (
                            <Badge tone="neutral" size="sm">
                              Showing {request.permissionLabels.length} of {request.permissionTotal} permissions
                            </Badge>
                          ) : null}
                          {request.status !== "PENDING" ? (
                            <span className="text-xs text-slate-500">Permission detail is available during pending review only.</span>
                          ) : null}
                        </div>
                        {request.reason ? (
                          <p className="mt-2 text-sm text-slate-700">{request.reason}</p>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">
                            Review narrative is retained in the audit record; it is not shown in this historical summary.
                          </p>
                        )}
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {request.evidenceRecorded ? "Evidence recorded" : "No evidence reference recorded"} / Requested by{" "}
                          {request.requestedByName} on{" "}
                          {formatUserAccessDate(request.createdAt)}
                        </p>
                        {request.reviewedByName ? (
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Reviewed by {request.reviewedByName}
                            {request.reviewedAt
                              ? ` on ${formatUserAccessDate(request.reviewedAt)}`
                              : ""}
                            {request.reviewReason
                              ? ` / ${request.reviewReason}`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                      {canReview && !request.permissionIntegrityIssue ? (
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <ButtonLink href={`/admin/users/${user.id}?section=requests&requestKind=role&requestActionId=${encodeURIComponent(request.id)}`} tone="ghost" className="min-h-11 text-blue-700">Open review controls</ButtonLink>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Showing {user.sensitiveRoleRequests.length} of {user.sensitiveRoleRequestPage.totalItems} role requests</span>
              <PaginationBar
                page={user.sensitiveRoleRequestPage.page}
                pageSize={user.sensitiveRoleRequestPage.pageSize}
                totalItems={user.sensitiveRoleRequestPage.totalItems}
                itemLabel="role requests"
                controlClassName="min-h-10"
                getPageHref={(nextPage) => {
                  const next = new URLSearchParams({ section: "requests", requestKind: "role", roleRequestPage: String(nextPage), roleRequestPageSize: String(user.sensitiveRoleRequestPage.pageSize) });
                   if (roleRequestStatusValue) next.set("roleRequestStatus", roleRequestStatusValue);
                   if (roleQuery) next.set("roleQuery", roleQuery);
                  return `/admin/users/${user.id}?${next.toString()}`;
                }}
              />
            </div>
          </Panel>
        ) : null}
        {section === "requests" && requestActionId ? (
          <TaskSheet title="Review controlled request" defaultOpen size="default" bodyScroll="contained" description={`Review context for ${user.displayName} in the selected company. The server rechecks status, actor, scope, MFA, and segregation of duties.`}>
            {selectedScopeRequest ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">{selectedScopeRequest.locationName}</p>
                  <p>{selectedScopeRequest.locationCode ?? "No code"} · {humanizeEnum(selectedScopeRequest.locationType)} · {humanizeEnum(selectedScopeRequest.accessLevel)}</p>
                  <p className="mt-1">Requested by {selectedScopeRequest.requestedByName} on {formatUserAccessDate(selectedScopeRequest.createdAt)}. {selectedScopeRequest.riskLabel}</p>
                  {selectedScopeRequest.reason ? <p className="mt-2">Reason: {selectedScopeRequest.reason}</p> : null}
                  {selectedScopeRequest.evidenceReference ? <p className="mt-1">Evidence reference recorded.</p> : null}
                </div>
                {selectedScopeRequest.status === "PENDING" && selectedScopeRequest.requestedByUserId !== session.user.id && user.id !== session.user.id ? <>
                  <form action={approveHighRiskScopeRequest} className="ogfi-form-shell grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} /><input name="requestId" type="hidden" value={selectedScopeRequest.id} /><input name="returnPath" type="hidden" value={requestReturnPath} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Approval reason<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" name="reviewReason" required /></label>
                    <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white sm:w-fit">Approve scope</button>
                  </form>
                  <form action={rejectHighRiskScopeRequest} className="ogfi-form-shell grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} /><input name="requestId" type="hidden" value={selectedScopeRequest.id} /><input name="returnPath" type="hidden" value={requestReturnPath} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Rejection reason<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" name="reviewReason" required /></label>
                    <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-bold text-white sm:w-fit">Reject scope</button>
                  </form>
                </> : <p className="text-sm text-amber-800">This request is historical or cannot be reviewed by the current actor. The server remains authoritative.</p>}
              </div>
            ) : selectedRoleRequest ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">{selectedRoleRequest.roleName}</p>
                  <p>{selectedRoleRequest.roleCode} · {selectedRoleRequest.riskLabel}</p>
                  <p className="mt-1">Requested by {selectedRoleRequest.requestedByName} on {formatUserAccessDate(selectedRoleRequest.createdAt)}.</p>
                  {selectedRoleRequest.reason ? <p className="mt-2">Reason: {selectedRoleRequest.reason}</p> : null}
                  {selectedRoleRequest.evidenceReference ? <p className="mt-1">Evidence reference recorded.</p> : null}
                  {selectedRoleRequest.permissionIntegrityIssue ? <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 font-semibold text-rose-800">Permission data needs administrator review. Approval is unavailable until the role-permission links are repaired; rejection remains available to close the unsafe request.</p> : null}
                </div>
                {selectedRoleRequest.status === "PENDING" && selectedRoleRequest.requestedByUserId !== session.user.id && user.id !== session.user.id ? <>
                  {!selectedRoleRequest.permissionIntegrityIssue ? <form action={approveSensitiveRoleRequest} className="ogfi-form-shell grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} /><input name="requestId" type="hidden" value={selectedRoleRequest.id} /><input name="returnPath" type="hidden" value={requestReturnPath} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Approval reason<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" name="reviewReason" required /></label>
                    <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white sm:w-fit">Approve role</button>
                  </form> : null}
                  <form action={rejectSensitiveRoleRequest} className="ogfi-form-shell grid gap-3">
                    <input name="targetUserId" type="hidden" value={user.id} /><input name="requestId" type="hidden" value={selectedRoleRequest.id} /><input name="returnPath" type="hidden" value={requestReturnPath} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Rejection reason<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" name="reviewReason" required /></label>
                    <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-bold text-white sm:w-fit">Reject role</button>
                  </form>
                </> : <p className="text-sm text-amber-800">This request is historical or cannot be reviewed by the current actor. The server remains authoritative.</p>}
              </div>
            ) : <p className="mt-4 text-sm text-amber-800">This request is no longer available in the current page. Refresh the request list before taking action.</p>}
          </TaskSheet>
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
