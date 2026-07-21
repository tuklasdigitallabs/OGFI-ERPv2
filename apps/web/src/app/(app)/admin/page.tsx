import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  Building2,
  ClipboardCheck,
  History,
  KeyRound,
  MapPin,
  ShieldCheck,
  Users
} from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import {
  createCoreAdminBrand,
  createCoreAdminCompany,
  createCoreAdminDepartment,
  createCoreAdminLocation,
  createCoreAdminRole,
  createCoreAdminUser,
  getCoreAdminOverview,
  listCoreAdminAuditEvents,
  type CoreAdminAuditEventFilters
} from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";
import { canExportCoreAdminAudit } from "@/server/services/exportAuthorization";

export const dynamic = "force-dynamic";

type CoreAdministrationPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

const adminTabs = ["users", "roles", "organization", "approval-rules", "audit"] as const;
type AdminTab = (typeof adminTabs)[number];

function normalizeAdminTab(value: string | undefined): AdminTab {
  return adminTabs.includes(value as AdminTab) ? (value as AdminTab) : "users";
}

async function createUserAction(formData: FormData) {
  "use server";

  try {
    await createCoreAdminUser(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin?tab=users", error));
  }
  revalidatePath("/admin");
  redirect("/admin?tab=users");
}

async function createRoleAction(formData: FormData) {
  "use server";

  try {
    await createCoreAdminRole(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin?tab=roles", error));
  }
  revalidatePath("/admin");
  redirect("/admin?tab=roles");
}

async function createCompanyAction(formData: FormData) {
  "use server";

  try {
    await createCoreAdminCompany(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin?tab=organization", error));
  }
  revalidatePath("/admin");
  redirect("/admin?tab=organization");
}

async function createBrandAction(formData: FormData) {
  "use server";

  try {
    await createCoreAdminBrand(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin?tab=organization", error));
  }
  revalidatePath("/admin");
  redirect("/admin?tab=organization");
}

async function createDepartmentAction(formData: FormData) {
  "use server";

  try {
    await createCoreAdminDepartment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin?tab=organization", error));
  }
  revalidatePath("/admin");
  redirect("/admin?tab=organization");
}

async function createLocationAction(formData: FormData) {
  "use server";

  try {
    await createCoreAdminLocation(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin?tab=organization", error));
  }
  revalidatePath("/admin");
  redirect("/admin?tab=organization");
}

export default async function CoreAdministrationPage({
  searchParams
}: CoreAdministrationPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const canExportAudit = canExportCoreAdminAudit(session);
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const activeTab = normalizeAdminTab(getSearchParam(params, "tab"));
  const auditFilters: CoreAdminAuditEventFilters = {};
  const auditQuery = getSearchParam(params, "q");
  const auditEventType = getSearchParam(params, "eventType");
  const auditEntityType = getSearchParam(params, "entityType");
  const auditActor = getSearchParam(params, "actor");
  const auditRequestId = getSearchParam(params, "requestId");
  const auditOccurredFrom = getSearchParam(params, "occurredFrom");
  const auditOccurredTo = getSearchParam(params, "occurredTo");
  if (auditQuery) {
    auditFilters.query = auditQuery;
  }
  if (auditEventType) {
    auditFilters.eventType = auditEventType;
  }
  if (auditEntityType) {
    auditFilters.entityType = auditEntityType;
  }
  if (auditActor) {
    auditFilters.actor = auditActor;
  }
  if (auditRequestId) {
    auditFilters.requestId = auditRequestId;
  }
  if (auditOccurredFrom) {
    auditFilters.occurredFrom = auditOccurredFrom;
  }
  if (auditOccurredTo) {
    auditFilters.occurredTo = auditOccurredTo;
  }

  const auditExportParams = new URLSearchParams();
  Object.entries(auditFilters).forEach(([key, value]) => {
    if (value) {
      auditExportParams.set(key, value);
    }
  });
  const auditExportHref = `/admin/audit/export${
    auditExportParams.size ? `?${auditExportParams.toString()}` : ""
  }`;

  const [overview, auditEvents] = await Promise.all([
    getCoreAdminOverview(session),
    listCoreAdminAuditEvents(session, auditFilters)
  ]);
  const activeUsers = overview.users.filter((user) => user.status === "ACTIVE").length;
  const activeRoles = overview.roles.filter((role) => role.status === "ACTIVE").length;
  const activeRules = overview.approvalRules.filter((rule) => rule.isActive).length;
  const companyLocations = overview.locations.filter(
    (location) => location.companyName === session.context.companyName
  );
  const highAccessRoles = overview.roles.filter((role) =>
    role.permissions.some((permission) => {
      const highAccessPermissionCodes: string[] = [
        permissions.coreAdminister,
        permissions.purchaseRequestApprove,
        permissions.purchaseOrderApprove,
        permissions.receivingPost,
        permissions.receivingReverse,
        permissions.stockAdjustmentPost,
        permissions.stockAdjustmentReverse,
        permissions.wastagePost,
        permissions.wastageReverse
      ];
      return highAccessPermissionCodes.includes(permission.code);
    })
  );

  const workspaces = [
    {
      id: "users",
      title: "Users & Access",
      detail: "Assign roles and operating scope to people.",
      metric: `${activeUsers}/${overview.users.length}`,
      metricLabel: "active users",
      icon: Users,
      href: "/admin?tab=users",
      action: "Review users"
    },
    {
      id: "roles",
      title: "Roles & Permissions",
      detail: "Apply recommended role sets or override toggles with audit.",
      metric: `${activeRoles}/${overview.roles.length}`,
      metricLabel: "active roles",
      icon: KeyRound,
      href: "/admin?tab=roles",
      action: "Configure roles"
    },
    {
      id: "organization",
      title: "Organization Scope",
      detail: "Review companies, branches, warehouses, and location context.",
      metric: `${companyLocations.length}`,
      metricLabel: "locations in context",
      icon: Building2,
      href: "/admin?tab=organization",
      action: "Review structure"
    },
    {
      id: "approval-rules",
      title: "Approval Rules",
      detail: "Check approval routing for purchasing, inventory, and controls.",
      metric: `${activeRules}/${overview.approvalRules.length}`,
      metricLabel: "active rules",
      icon: ClipboardCheck,
      href: "/admin?tab=approval-rules",
      action: "Review rules"
    },
    {
      id: "audit",
      title: "Audit Trail",
      detail: "Search controlled changes and export scoped audit evidence.",
      metric: `${auditEvents.length}`,
      metricLabel: "matching events",
      icon: History,
      href: "/admin?tab=audit",
      action: "Search audit"
    }
  ] satisfies Array<{
    id: AdminTab;
    title: string;
    detail: string;
    metric: string;
    metricLabel: string;
    icon: typeof Users;
    href: string;
    action: string;
  }>;

  return (
    <AppShell
      session={session}
      title="Core Administration"
      subtitle="Control center for users, roles, scope, approvals, and audit history"
      activeNav="admin"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <section className="mb-5 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[var(--shadow-surface)]">
        <div className="grid gap-5 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 lg:grid-cols-[1.25fr_0.75fr] lg:p-6">
          <div>
            <Badge tone="info">Admin control center</Badge>
            <h2 className="mt-3 text-2xl font-bold text-slate-950">
              Start with the admin task you need to complete.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Core Admin is where access, operating scope, approval policy, and audit
              evidence are controlled. Pick a workspace below instead of hunting through
              one large configuration screen.
            </p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white/85 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-600" />
              <div>
                <p className="font-semibold text-slate-950">Guardrails active</p>
                <p className="mt-1 text-sm text-slate-600">
                  Role administration requires tenant-wide role authority and company
                  Manage scope. Other admin changes retain their service-specific
                  permission, reason, and audit controls.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-4 lg:grid-cols-5">
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;
          const isActive = activeTab === workspace.id;
          return (
            <a
              key={workspace.id}
              aria-current={isActive ? "page" : undefined}
              className={`group rounded-2xl border p-4 shadow-[var(--shadow-soft)] transition hover:border-blue-200 hover:shadow-[var(--shadow-surface)] ${
                isActive
                  ? "border-blue-300 bg-blue-50/80 ring-2 ring-blue-100"
                  : "border-slate-200 bg-white"
              }`}
              href={workspace.href}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-semibold text-slate-500">
                {workspace.metricLabel}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-950">
                {workspace.metric}
              </p>
              <h3 className="mt-4 font-bold text-slate-950">{workspace.title}</h3>
              <p className="mt-1 min-h-10 text-sm leading-5 text-slate-600">
                {workspace.detail}
              </p>
              <span className="mt-4 inline-flex text-sm font-semibold text-blue-700 group-hover:text-blue-800">
                {isActive ? "Current workspace" : workspace.action}
              </span>
            </a>
          );
        })}
      </section>

      <div className="mt-5">
        {activeTab === "users" ? (
        <Panel id="users" className="ogfi-detail-card">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Users & Access</h2>
              <p className="text-sm text-slate-500">
                Review who can access the ERP and open a user to manage roles and scopes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{activeUsers} active</Badge>
              <EntryModal title="Create User" triggerLabel="Create User">
                <form action={createUserAction} className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Full name
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="displayName" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Email
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="email" type="email" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Initial role
                    <select className="rounded-md border border-slate-300 px-3 py-2" name="initialRoleId">
                      <option value="">No role yet</option>
                      {overview.roles
                        .filter((role) => role.status === "ACTIVE")
                        .map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name} - {role.assignmentEligibility}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Initial location scope
                    <select className="rounded-md border border-slate-300 px-3 py-2" name="initialLocationId">
                      <option value="">No location yet</option>
                      {overview.locations
                        .filter((location) => location.status === "ACTIVE")
                        .map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name} / {location.brandName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Location access
                    <select className="rounded-md border border-slate-300 px-3 py-2" name="accessLevel">
                      <option value="VIEW">View</option>
                      <option value="OPERATE">Operate</option>
                      <option value="APPROVE">Approve</option>
                      <option value="MANAGE">Manage</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Setup reason
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
                  </label>
                  <p className="text-sm text-slate-500 md:col-span-2">
                    Initial role assignment requires Administer tenant-wide roles and
                    company Manage scope. The selected location establishes the new
                    user&apos;s company eligibility. A setup reason is required and audited.
                  </p>
                  <p className="text-sm text-slate-500 md:col-span-2">
                    This creates the ERP user record. Authentication credentials remain handled by the login system.
                  </p>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 md:w-fit">
                    Create User
                  </button>
                </form>
              </EntryModal>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="ogfi-table-head hidden grid-cols-[1.2fr_1fr_1.4fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 md:grid">
              <span>User</span>
              <span>Name</span>
              <span>Roles</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-slate-100">
              {overview.users.map((user) => (
                <div
                  key={user.id}
                  data-testid="admin-user-row"
                  className="ogfi-table-row grid gap-3 px-4 py-4 md:grid-cols-[1.2fr_1fr_1.4fr_1fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">
                      {user.email.split("@")[0]}
                    </p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                  <p className="font-semibold text-slate-950">{user.displayName}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {user.roles.length === 0 ? (
                      <Badge>No role</Badge>
                    ) : (
                      user.roles.map((role) => (
                        <Badge key={role} tone="info" size="sm">
                          {role}
                        </Badge>
                      ))
                    )}
                  </div>
                  <Badge tone={user.status === "ACTIVE" ? "success" : "neutral"}>
                    {user.status}
                  </Badge>
                  <div className="flex justify-start md:justify-end">
                    <ButtonLink
                      href={`/admin/users/${user.id}`}
                      tone="ghost"
                      className="ogfi-chip"
                    >
                      Manage Access
                    </ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        ) : null}

        {activeTab === "roles" ? (
        <Panel id="roles" className="ogfi-detail-card">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Roles & Permissions</h2>
              <p className="text-sm text-slate-500">
                Use recommended sets or override permission toggles with audit.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">{highAccessRoles.length} high access</Badge>
              <EntryModal title="Create Role" triggerLabel="Create Role">
                <form action={createRoleAction} className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Role name
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="name" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Business role code
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="code" placeholder="e.g. STOREKEEPER-BGC" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Setup reason
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
                  </label>
                  <p className="text-sm text-slate-500 md:col-span-2">
                    New roles start without permissions. Open the role after creation to apply recommended permissions or toggle overrides.
                  </p>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 md:w-fit">
                    Create Role
                  </button>
                </form>
              </EntryModal>
            </div>
          </div>
          <div className="space-y-3">
            {overview.roles.map((role) => (
              <div key={role.id} data-testid="admin-role-row" className="ogfi-record-summary p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{role.name}</p>
                    <p className="text-xs text-slate-500">{role.code}</p>
                  </div>
                  <Badge tone={role.status === "ACTIVE" ? "success" : "neutral"}>
                    {role.status}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="info">{role.permissions.length} permissions</Badge>
                  {role.permissions.slice(0, 3).map((permission) => (
                    <Badge key={permission.id} tone="neutral" size="sm">
                      {permission.label}
                    </Badge>
                  ))}
                </div>
                <ButtonLink
                  href={`/admin/roles/${role.id}`}
                  tone="ghost"
                  className="ogfi-chip mt-3"
                >
                  Configure Role
                </ButtonLink>
              </div>
            ))}
          </div>
        </Panel>
        ) : null}

        {activeTab === "organization" ? (
        <Panel id="organization" className="ogfi-detail-card">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Organization Scope</h2>
              <p className="text-sm text-slate-500">
                Company, brand, and location records that define where users operate.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MapPin aria-hidden="true" className="h-5 w-5 text-blue-600" />
              <EntryModal title="Create Company" triggerLabel="Create Company">
                <form action={createCompanyAction} className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Company code
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="code" placeholder="e.g. OGFI" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Legal name
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="legalName" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Display name
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="tradingName" />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Tax identifier
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="taxIdentifier" />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Currency
                    <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue="PHP" name="currencyCode" maxLength={3} required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Timezone
                    <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue="Asia/Manila" name="timezone" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Setup reason
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
                  </label>
                  <p className="text-sm text-slate-500 md:col-span-2">
                    The current admin receives Manage scope for this company so setup can continue.
                  </p>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 md:w-fit">
                    Create Company
                  </button>
                </form>
              </EntryModal>
              <EntryModal title="Create Brand" triggerLabel="Create Brand">
                <form action={createBrandAction} className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Company
                    <select className="rounded-md border border-slate-300 px-3 py-2" name="companyId" required>
                      {overview.companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name} / {company.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Brand code
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="code" placeholder="e.g. GSB" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Brand name
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="name" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Setup reason
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
                  </label>
                  <p className="text-sm text-slate-500 md:col-span-2">
                    Create the restaurant or operating brand before creating branch locations under it.
                  </p>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 md:w-fit">
                    Create Brand
                  </button>
                </form>
              </EntryModal>
              <EntryModal title="Create Department" triggerLabel="Create Department">
                <form action={createDepartmentAction} className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Company
                    <select className="rounded-md border border-slate-300 px-3 py-2" name="companyId" required>
                      {overview.companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name} / {company.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Department code
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="code" placeholder="e.g. MARKETING" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Department name
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="name" placeholder="e.g. Marketing" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Setup reason
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
                  </label>
                  <p className="text-sm text-slate-500 md:col-span-2">
                    Departments are company-scoped owners for budgets, cost centers, projects, workforce assignments, and finance requests.
                  </p>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 md:w-fit">
                    Create Department
                  </button>
                </form>
              </EntryModal>
              <EntryModal title="Create Branch / Location" triggerLabel="Create Branch / Location">
                <form action={createLocationAction} className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Company
                    <select className="rounded-md border border-slate-300 px-3 py-2" name="companyId" required>
                      {overview.companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name} / {company.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Brand
                    <select className="rounded-md border border-slate-300 px-3 py-2" name="brandId">
                      <option value="">Company-wide location</option>
                      {overview.brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name} / {brand.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Location type
                    <select className="rounded-md border border-slate-300 px-3 py-2" name="locationType" required>
                      <option value="BRANCH">Branch</option>
                      <option value="WAREHOUSE">Warehouse</option>
                      <option value="COMMISSARY">Commissary</option>
                      <option value="CENTRAL_KITCHEN">Central kitchen</option>
                      <option value="HEAD_OFFICE">Head office</option>
                      <option value="PROJECT_SITE">Project site</option>
                      <option value="TEMPORARY_SITE">Temporary site</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Location code
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="code" placeholder="e.g. BGC" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Location name
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="name" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Timezone
                    <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue="Asia/Manila" name="timezone" required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Address
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="address" />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Setup reason
                    <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
                  </label>
                  <p className="text-sm text-slate-500 md:col-span-2">
                    Branch locations require a brand. Warehouses and head office locations can remain company-wide.
                  </p>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 md:w-fit">
                    Create Branch / Location
                  </button>
                </form>
              </EntryModal>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-4">
            <section className="space-y-3">
              <div>
                <h3 className="font-bold text-slate-950">Companies</h3>
                <p className="text-sm text-slate-500">Legal operating entities</p>
              </div>
              {overview.companies.map((company) => (
                <div key={company.id} data-testid="admin-company-row" className="ogfi-record-summary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{company.name}</p>
                      <p className="text-sm text-slate-600">
                        {company.code} / {company.currencyCode} / {company.timezone}
                      </p>
                    </div>
                    <Badge tone={company.status === "ACTIVE" ? "success" : "neutral"}>
                      {company.status}
                    </Badge>
                  </div>
                  <ButtonLink
                    href={`/admin/companies/${company.id}`}
                    tone="ghost"
                    className="ogfi-chip mt-3"
                  >
                    View Company
                  </ButtonLink>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-bold text-slate-950">Brands</h3>
                <p className="text-sm text-slate-500">Restaurant or operating brands</p>
              </div>
              {overview.brands.length === 0 ? (
                <div className="ogfi-record-summary p-4">
                  <p className="font-semibold text-slate-950">No brands yet</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Create a brand before creating branch locations under it.
                  </p>
                </div>
              ) : (
                overview.brands.map((brand) => (
                  <div key={brand.id} data-testid="admin-brand-row" className="ogfi-record-summary p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{brand.name}</p>
                        <p className="text-sm text-slate-600">
                          {brand.companyName} / {brand.code}
                        </p>
                      </div>
                      <Badge tone={brand.status === "ACTIVE" ? "success" : "neutral"}>
                        {brand.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-bold text-slate-950">Departments</h3>
                <p className="text-sm text-slate-500">Budget and responsibility owners</p>
              </div>
              {overview.departments.length === 0 ? (
                <div className="ogfi-record-summary p-4">
                  <p className="font-semibold text-slate-950">No departments yet</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Create departments such as Marketing, Purchasing, HR, Finance, and Operations before assigning department budgets.
                  </p>
                </div>
              ) : (
                overview.departments.map((department) => (
                  <div key={department.id} data-testid="admin-department-row" className="ogfi-record-summary p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{department.name}</p>
                        <p className="text-sm text-slate-600">
                          {department.companyName} / {department.code}
                        </p>
                      </div>
                      <Badge tone={department.status === "ACTIVE" ? "success" : "neutral"}>
                        {department.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="info" size="sm">
                        {department.budgetCount} budget{department.budgetCount === 1 ? "" : "s"}
                      </Badge>
                      <Badge tone="neutral" size="sm">
                        {department.budgetLineCount} line{department.budgetLineCount === 1 ? "" : "s"}
                      </Badge>
                      <Badge tone="neutral" size="sm">
                        {department.costCenterCount} cost center{department.costCenterCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-bold text-slate-950">Locations</h3>
                <p className="text-sm text-slate-500">Branches, warehouses, and sites</p>
              </div>
              {overview.locations.map((location) => (
                <div key={location.id} data-testid="admin-location-row" className="ogfi-record-summary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{location.name}</p>
                      <p className="text-xs text-slate-500">
                        {location.companyName} / {location.brandName} / {location.code}
                      </p>
                    </div>
                    <Badge tone="info">{location.type}</Badge>
                  </div>
                  <ButtonLink
                    href={`/admin/locations/${location.id}`}
                    tone="ghost"
                    className="ogfi-chip mt-3"
                  >
                    View Location
                  </ButtonLink>
                </div>
              ))}
            </section>
          </div>
        </Panel>
        ) : null}

        {activeTab === "approval-rules" ? (
        <Panel id="approval-rules" className="ogfi-detail-card">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Approval Rules</h2>
              <p className="text-sm text-slate-500">
                Routing rules that control purchasing, inventory, and exception workflows.
              </p>
            </div>
            <Badge tone="info">{activeRules} active</Badge>
          </div>
          <div className="divide-y divide-slate-100">
            {overview.approvalRules.map((rule) => (
              <div key={rule.id} data-testid="admin-rule-row" className="ogfi-list-row">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{rule.transactionType}</p>
                    <p className="text-xs text-slate-500">{rule.companyName}</p>
                  </div>
                  <Badge tone={rule.isActive ? "success" : "neutral"}>
                    {rule.isActive ? "ACTIVE" : "INACTIVE"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Priority {rule.priority} · {rule.stepCount} step{rule.stepCount === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-xs text-slate-500">{rule.stepSummary}</p>
                <ButtonLink
                  href={`/admin/approval-rules/${rule.id}`}
                  tone="ghost"
                  className="ogfi-chip mt-3"
                >
                  View Rule
                </ButtonLink>
              </div>
            ))}
          </div>
        </Panel>
        ) : null}

        {activeTab === "audit" ? (
        <Panel id="audit">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Audit Trail</h2>
              <p className="text-sm text-slate-500">
                Search append-only controlled events by action, actor, entity, date, or request ID.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="info">Read-only</Badge>
              {canExportAudit ? (
                <ButtonLink href={auditExportHref} tone="ghost" className="ogfi-chip">
                  Export CSV
                </ButtonLink>
              ) : null}
            </div>
          </div>
          <form className="ogfi-form-shell mb-4 grid gap-3 border-b border-slate-100 pb-4 md:grid-cols-3 xl:grid-cols-4">
            <input name="tab" type="hidden" value="audit" />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Search
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                defaultValue={auditFilters.query}
                name="q"
                placeholder="Action, entity, actor, request"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Action
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                defaultValue={auditFilters.eventType}
                name="eventType"
                placeholder="submitted"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Entity
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                defaultValue={auditFilters.entityType}
                name="entityType"
                placeholder="PurchaseOrder"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Actor
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                defaultValue={auditFilters.actor}
                name="actor"
                placeholder="Name or email"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              From
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                defaultValue={auditFilters.occurredFrom}
                name="occurredFrom"
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              To
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                defaultValue={auditFilters.occurredTo}
                name="occurredTo"
                type="date"
              />
            </label>
            <div className="flex items-end">
              <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 md:w-auto">
                Apply
              </button>
            </div>
            <div className="flex items-end">
              <ButtonLink href="/admin?tab=audit" tone="ghost" className="min-h-10 w-full md:w-auto">
                Clear
              </ButtonLink>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              Request ID
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                defaultValue={auditFilters.requestId}
                name="requestId"
                placeholder="Correlation/request ID"
              />
            </label>
          </form>
          <div className="hidden grid-cols-[1fr_1fr_1fr_1fr] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-400 md:grid">
            <span>Event</span>
            <span>Record</span>
            <span>Actor</span>
            <span>Occurred</span>
          </div>
          {auditEvents.length === 0 ? (
            <div className="ogfi-record-summary p-4">
              <p className="font-semibold text-slate-950">No audit events match</p>
              <p className="mt-1 text-sm text-slate-600">
                Adjust the filters or clear them to review recent controlled actions.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditEvents.map((event) => (
                <div
                  key={event.id}
                  data-testid="admin-audit-row"
                  className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_1fr_1fr_1fr] md:items-center"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{event.eventType}</p>
                    <p className="text-xs text-slate-500">{event.id}</p>
                    {event.requestId ? (
                      <p className="text-xs text-slate-500">Request {event.requestId}</p>
                    ) : null}
                    <ButtonLink
                      href={`/admin/audit/${event.id}`}
                      tone="ghost"
                      className="ogfi-chip mt-2"
                    >
                      View Event
                    </ButtonLink>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {event.entityType}
                    </p>
                    <p className="text-xs text-slate-500">{event.entityId}</p>
                  </div>
                  <p className="text-sm text-slate-700">{event.actorName}</p>
                  <p className="text-sm text-slate-600">{event.occurredAt}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
