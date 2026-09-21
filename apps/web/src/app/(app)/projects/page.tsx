import { redirect } from "next/navigation";
import { Badge, Panel, PaginationBar, WorkspaceTabs } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportProjects } from "@/server/services/exportAuthorization";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getProjectDashboard } from "@/server/services/projectDashboard";
import {
  createProjectRisk,
  transitionProjectRisk,
  listProjectRiskPage,
  type ProjectRiskCard
} from "@/server/services/projectRisks";
import { listPublishedProjectTemplatesForProjectCreate } from "@/server/services/projectTemplates";
import {
  addProjectMember,
  createProject,
  listProjectMemberOptions,
  listProjectMemberPage,
  listProjects,
  removeProjectMember,
  transitionProjectLifecycle
} from "@/server/services/projects";

export const dynamic = "force-dynamic";

type ProjectsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ProjectTab = "overview" | "members" | "risks" | "activity";

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getProjectTab(
  searchParams: Record<string, string | string[] | undefined>,
): ProjectTab {
  const tab = getStringParam(searchParams, "tab");
  return tab === "members" || tab === "risks" || tab === "activity" ? tab : "overview";
}

async function createProjectAction(formData: FormData) {
  "use server";

  try {
    await createProject(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/projects", error));
  }
  redirect("/projects");
}

async function createRiskAction(formData: FormData) {
  "use server";

  try {
    await createProjectRisk(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/projects", error));
  }
  redirect("/projects");
}

async function transitionRiskAction(formData: FormData) {
  "use server";

  try {
    await transitionProjectRisk(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/projects", error));
  }
  redirect("/projects");
}

async function addMemberAction(formData: FormData) {
  "use server";

  try {
    await addProjectMember(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/projects", error));
  }
  redirect("/projects");
}

async function removeMemberAction(formData: FormData) {
  "use server";

  try {
    await removeProjectMember(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/projects", error));
  }
  redirect("/projects");
}

async function transitionProjectLifecycleAction(formData: FormData) {
  "use server";

  try {
    await transitionProjectLifecycle(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/projects", error));
  }
  redirect("/projects");
}

function riskTone(risk: ProjectRiskCard) {
  if (risk.status === "CLOSED" || risk.status === "MITIGATED") {
    return "success" as const;
  }
  if (risk.severity === "CRITICAL" || risk.severity === "HIGH") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function projectLifecycleActions(status: string) {
  if (status === "DRAFT") {
    return [{ status: "ACTIVE", label: "Activate", needsReason: false }];
  }
  if (status === "ACTIVE") {
    return [
      { status: "ON_HOLD", label: "Hold", needsReason: true },
      { status: "COMPLETED", label: "Complete", needsReason: false },
      { status: "CANCELLED", label: "Cancel", needsReason: true }
    ];
  }
  if (status === "ON_HOLD") {
    return [
      { status: "ACTIVE", label: "Resume", needsReason: false },
      { status: "CANCELLED", label: "Cancel", needsReason: true }
    ];
  }
  if (status === "COMPLETED" || status === "CANCELLED") {
    return [{ status: "ARCHIVED", label: "Archive", needsReason: true }];
  }
  return [];
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.projectView)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeTab = getProjectTab(resolvedSearchParams);
  const requestedPage = Number.parseInt(getStringParam(resolvedSearchParams, "page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const canCreateProject = session.permissionCodes.includes(permissions.projectCreate);
  const [projects, dashboard, memberPage, riskPage, memberOptions, publishedTemplates] =
    await Promise.all([
      listProjects(session),
      getProjectDashboard(session),
      listProjectMemberPage(session, { page, pageSize: 10 }),
      listProjectRiskPage(session, { page, pageSize: 10 }),
      session.permissionCodes.includes(permissions.projectManageMembers)
        ? listProjectMemberOptions(session)
        : Promise.resolve([]),
      canCreateProject
        ? listPublishedProjectTemplatesForProjectCreate(session)
        : Promise.resolve([])
    ]);
  const canExportProjectsCsv = canExportProjects(session);
  const canCreateRisk = session.permissionCodes.includes(permissions.projectRiskCreate);

  return (
    <AppShell
      session={session}
      title="Projects Tracker"
      subtitle="Phase 1.5 project foundation with scoped membership and activity"
      activeNav="projects"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Project tracker is a coordination layer.</strong> Projects,
              members, risks, milestones, tasks, and links make rollout work visible
              without approving, posting, or changing controlled ERP records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Restricted projects continue to rely on explicit membership and project
              scope; this UI polish does not relax service-layer permissions.
            </p>
          </div>
          <span>Phase 1.5</span>
        </div>
      </div>
      <WorkspaceTabs
        ariaLabel="Projects workspace sections"
        className="mb-5"
        items={[
          { label: "Overview", href: "/projects", active: activeTab === "overview", count: projects.length },
          { label: "Members", href: "/projects?tab=members", active: activeTab === "members", count: memberPage.totalItems },
          { label: "Risks", href: "/projects?tab=risks", active: activeTab === "risks", count: riskPage.totalItems },
          { label: "Activity", href: "/projects?tab=activity", active: activeTab === "activity", count: dashboard.recentActivity.length },
        ]}
      />
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Visible projects</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.projectCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Restricted</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {projects.filter((project) => project.isRestricted).length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Active</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {dashboard.activeProjectCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Blocked / overdue</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.blockedTaskCount + dashboard.overdueTaskCount}
          </p>
        </Panel>
      </div>

      <div className="mb-5 flex flex-wrap justify-end gap-2">
        {canCreateProject ? (
          <EntryModal title="Create Project" triggerLabel="Create Project">
            <p className="mt-1 text-sm text-slate-500">
              Foundation fields only; tasks and linked records come after this access
              layer is verified.
            </p>
            <form action={createProjectAction} className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Code
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2"
                    name="code"
                    placeholder="ERP-ROLLOUT-001"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Name
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2"
                    name="name"
                    placeholder="Branch ERP rollout"
                    required
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Template
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2"
                    name="templateId"
                    defaultValue=""
                  >
                    <option value="">No template</option>
                    {publishedTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.code} / {template.name}
                        {template.isRestrictedDefault ? " / restricted" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Project type
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2"
                    name="projectType"
                    defaultValue="ERP / IT Implementation"
                  >
                    <option>ERP / IT Implementation</option>
                    <option>Operational Improvement</option>
                    <option>Renovation / Fit-Out</option>
                    <option>Maintenance Project</option>
                    <option>Marketing Campaign</option>
                    <option>Training Rollout</option>
                    <option>Audit Corrective Action</option>
                    <option>Compliance / Permit Work</option>
                    <option>Supplier Onboarding</option>
                    <option>Future Branch Opening</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Location scope
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2"
                    name="locationId"
                    defaultValue={session.context.locationId}
                  >
                    {session.authorizedLocations.map((location) => (
                      <option key={location.scopeAssignmentId} value={location.locationId}>
                        {location.locationName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Target date
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2"
                    name="targetEndAt"
                    type="date"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Description
                <textarea
                  className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                  name="description"
                  placeholder="Implementation context, goals, and important constraints"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input name="isRestricted" type="checkbox" />
                Restricted membership
              </label>
              <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Create Project
              </button>
            </form>
          </EntryModal>
        ) : null}
        <EntryModal title="Add Member" triggerLabel="Add Member">
          {memberOptions.length > 0 && projects.length > 0 ? (
            <form action={addMemberAction} className="mt-4 grid gap-3">
              <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="projectId">
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} / {project.name}
                  </option>
                ))}
              </select>
              <div className="grid gap-3 md:grid-cols-2">
                <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="userId">
                  {memberOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} / {user.email}
                    </option>
                  ))}
                </select>
                <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="projectRole" defaultValue="CONTRIBUTOR">
                  <option value="SPONSOR">Sponsor</option>
                  <option value="MANAGER">Manager</option>
                  <option value="CONTRIBUTOR">Contributor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Add Member
              </button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Member management is unavailable.</p>
          )}
        </EntryModal>
        {canCreateRisk ? (
          <EntryModal title="Add Risk" triggerLabel="Add Risk">
            {projects.length > 0 ? (
              <form action={createRiskAction} className="mt-4 grid gap-3">
                <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="projectId">
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code} / {project.name}
                    </option>
                  ))}
                </select>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    name="title"
                    placeholder="Risk title"
                    required
                  />
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    name="category"
                    placeholder="Category"
                    required
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="likelihood" defaultValue="MEDIUM">
                    <option value="LOW">Low likelihood</option>
                    <option value="MEDIUM">Medium likelihood</option>
                    <option value="HIGH">High likelihood</option>
                    <option value="CRITICAL">Critical likelihood</option>
                  </select>
                  <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="impact" defaultValue="MEDIUM">
                    <option value="LOW">Low impact</option>
                    <option value="MEDIUM">Medium impact</option>
                    <option value="HIGH">High impact</option>
                    <option value="CRITICAL">Critical impact</option>
                  </select>
                </div>
                <input
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  name="targetMitigationDate"
                  type="date"
                />
                <textarea
                  className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  name="description"
                  placeholder="Risk context"
                />
                <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                  Add Risk
                </button>
              </form>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Risk creation is unavailable.</p>
            )}
          </EntryModal>
        ) : null}
      </div>

      <section className={`ogfi-data-surface mb-5 ${activeTab === "overview" ? "" : "hidden"}`}>
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Project Health</h2>
            <p className="text-sm text-slate-500">
              Read-only portfolio visibility from project, task, milestone, activity, and
              linked-record references.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{dashboard.linkedRecordCount} linked records</Badge>
            {canExportProjectsCsv ? (
              <>
                <a
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  href="/projects/export"
                >
                  Export Health CSV
                </a>
                <a
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  href="/projects/tasks/export"
                >
                  Export Tasks CSV
                </a>
                <a
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  href="/projects/activity/export"
                >
                  Export Activity CSV
                </a>
                <a
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  href="/projects/links/export"
                >
                  Export Linked Records CSV
                </a>
              </>
            ) : null}
          </div>
        </div>
        {dashboard.projects.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No project health records</p>
            <p className="mt-1 text-sm text-slate-600">
              Health appears after scoped projects are created.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-4 xl:grid-cols-2">
            {dashboard.projects.map((project) => (
              <Panel key={project.projectId} className="ogfi-record-summary shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">
                      {project.code}
                    </p>
                    <h3 className="text-base font-bold text-slate-950">{project.name}</h3>
                    <p className="text-xs text-slate-500">
                      Manager: {project.managerName} / Target:{" "}
                      {project.targetDate ?? "No target"}
                    </p>
                  </div>
                  <Badge tone={project.isAtRisk ? "warning" : "success"}>
                    {project.isAtRisk ? "At risk" : "On track"}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <span>
                    Progress: {project.completedTaskCount}/{project.taskCount} tasks
                  </span>
                  <span>Blocked: {project.blockedTaskCount}</span>
                  <span>Overdue: {project.overdueTaskCount}</span>
                  <span>Linked records: {project.linkedRecordCount}</span>
                  <span className="sm:col-span-2">
                    Next milestone:{" "}
                    {project.nextMilestoneTitle
                      ? `${project.nextMilestoneTitle} (${project.nextMilestoneDate ?? "No date"})`
                      : "None planned"}
                  </span>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </section>

      <section className={`ogfi-data-surface mb-5 ${activeTab === "members" ? "" : "hidden"}`}>
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Members</h2>
            <p className="text-sm text-slate-500">
              Restricted projects rely on explicit membership and project scope.
            </p>
          </div>
          <Badge tone="info">{memberPage.totalItems} active</Badge>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-[1fr_22rem]">
          <div className="grid gap-2">
            {memberPage.totalItems === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No project members visible.
              </p>
            ) : (
              memberPage.items.map((member) => (
                <div
                  className="ogfi-list-row grid gap-2 rounded-md border border-slate-200 text-sm md:grid-cols-[1fr_10rem_12rem]"
                  key={member.id}
                >
                  <div>
                    <p className="font-bold text-slate-950">{member.userName}</p>
                    <p className="text-xs text-slate-500">
                      {member.userEmail} / {member.projectCode}
                    </p>
                  </div>
                  <Badge>{member.projectRole}</Badge>
                  {member.canRemove ? (
                    <EntryModal title="Remove Project Member" triggerLabel="Remove">
                      <form action={removeMemberAction} className="mt-4 grid gap-3">
                        <input name="memberId" type="hidden" value={member.id} />
                        <input
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                          name="removalReason"
                          placeholder="Removal reason"
                          required
                        />
                        <button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 sm:w-fit">
                          Remove
                        </button>
                      </form>
                    </EntryModal>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
        <PaginationBar
          page={memberPage.page}
          pageSize={memberPage.pageSize}
          totalItems={memberPage.totalItems}
          itemLabel="project members"
          getPageHref={(nextPage) => `/projects?tab=members&page=${nextPage}`}
        />
      </section>

      <section className={`ogfi-data-surface mb-5 ${activeTab === "risks" ? "" : "hidden"}`}>
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Risk Register</h2>
            <p className="text-sm text-slate-500">
              Advisory project risks only; operational records remain in their source modules.
            </p>
          </div>
          <Badge tone="warning">{riskPage.totalItems} total</Badge>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-[1fr_22rem]">
          <div className="grid gap-3">
            {riskPage.totalItems === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No project risks recorded.
              </p>
            ) : (
              riskPage.items.map((risk) => (
                <div className="ogfi-record-summary p-4" key={risk.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {risk.projectCode} / {risk.category}
                      </p>
                      <h3 className="mt-1 font-bold text-slate-950">{risk.title}</h3>
                      <p className="text-xs text-slate-500">
                        Owner: {risk.ownerName} / Target: {risk.targetMitigationDate ?? "No target"}
                      </p>
                    </div>
                    <Badge tone={riskTone(risk)}>
                      {risk.severity} / {risk.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  {risk.description ? (
                    <p className="mt-2 text-sm text-slate-600">{risk.description}</p>
                  ) : null}
                  {risk.canMutate ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {risk.status === "OPEN" ? (
                        <EntryModal title="Start Risk Mitigation" triggerLabel="Start Mitigation">
                          <form action={transitionRiskAction} className="mt-4 grid gap-3">
                            <input name="riskId" type="hidden" value={risk.id} />
                            <input name="expectedVersion" type="hidden" value={risk.version} />
                            <input name="nextStatus" type="hidden" value="MITIGATING" />
                            <input
                              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                              name="mitigationPlan"
                              placeholder="Mitigation plan"
                            />
                            <button className="min-h-10 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 sm:w-fit">
                              Start Mitigation
                            </button>
                          </form>
                        </EntryModal>
                      ) : null}
                      {risk.canResolve && !["CLOSED", "CANCELLED"].includes(risk.status) ? (
                        <EntryModal title="Close Project Risk" triggerLabel="Close Risk">
                          <form action={transitionRiskAction} className="mt-4 grid gap-3">
                            <input name="riskId" type="hidden" value={risk.id} />
                            <input name="expectedVersion" type="hidden" value={risk.version} />
                            <input name="nextStatus" type="hidden" value="CLOSED" />
                            <input
                              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                              name="resolutionNote"
                              placeholder="Resolution note"
                              required
                            />
                            <button className="min-h-10 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700 sm:w-fit">
                              Close Risk
                            </button>
                          </form>
                        </EntryModal>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
        <PaginationBar
          page={riskPage.page}
          pageSize={riskPage.pageSize}
          totalItems={riskPage.totalItems}
          itemLabel="project risks"
          getPageHref={(nextPage) => `/projects?tab=risks&page=${nextPage}`}
        />
      </section>

      <section className={`ogfi-data-surface mb-5 ${activeTab === "activity" ? "" : "hidden"}`}>
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-lg font-bold text-slate-950">Recent Activity</h2>
          <p className="text-sm text-slate-500">
            Activity is scoped to projects visible to the current user.
          </p>
        </div>
        {dashboard.recentActivity.length === 0 ? (
          <div className="ogfi-empty-state text-sm text-slate-600">No recent project activity.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dashboard.recentActivity.map((activity) => (
              <div
                className="ogfi-list-row grid gap-2 text-sm md:grid-cols-[1fr_12rem_10rem]"
                key={activity.id}
              >
                <span className="font-semibold text-slate-900">
                  {activity.projectName}
                </span>
                <span className="text-slate-600">{activity.eventType}</span>
                <span className="text-xs text-slate-500">
                  {new Date(activity.occurredAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className={`space-y-4 ${activeTab === "overview" ? "" : "hidden"}`}>
        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Project Registry</h2>
              <p className="text-sm text-slate-500">
                Projects are coordination records only; controlled ERP records remain in
                their source modules.
              </p>
            </div>
            <Badge tone="info">Read-only list</Badge>
          </div>
          {projects.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">No visible projects yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Create a scoped project to start tracking rollout, training,
                maintenance, or improvement work.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="ogfi-list-row grid gap-3 md:grid-cols-[1fr_10rem_10rem_8rem] md:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-950">{project.name}</h3>
                      <Badge tone={project.isRestricted ? "warning" : "neutral"}>
                        {project.isRestricted ? "Restricted" : "Scoped"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {project.code} / {project.projectType} / {project.scopeLabel}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Sponsor: {project.sponsorName} / Manager: {project.managerName}
                    </p>
                    {project.canManageLifecycle ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {projectLifecycleActions(project.status).map((action) => (
                          action.needsReason ? (
                            <EntryModal
                              key={action.status}
                              title={`${action.label} Project`}
                              triggerLabel={action.label}
                            >
                              <form action={transitionProjectLifecycleAction} className="mt-4 grid gap-3">
                                <input name="projectId" type="hidden" value={project.id} />
                                <input name="expectedVersion" type="hidden" value={project.version} />
                                <input name="nextStatus" type="hidden" value={action.status} />
                                <input
                                  className="min-h-10 rounded-md border border-slate-300 px-3 text-sm"
                                  name="reason"
                                  placeholder={`${action.label} reason`}
                                  required
                                />
                                <button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:w-fit">
                                  {action.label}
                                </button>
                              </form>
                            </EntryModal>
                          ) : (
                            <form action={transitionProjectLifecycleAction} key={action.status}>
                              <input name="projectId" type="hidden" value={project.id} />
                              <input name="expectedVersion" type="hidden" value={project.version} />
                              <input name="nextStatus" type="hidden" value={action.status} />
                              <button className="ogfi-mobile-action rounded-md border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                                {action.label}
                              </button>
                            </form>
                          )
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Badge tone={project.status === "ACTIVE" ? "success" : "neutral"}>
                    {project.status.replaceAll("_", " ")}
                  </Badge>
                  <p className="text-sm font-medium text-slate-700">
                    {project.memberCount} member{project.memberCount === 1 ? "" : "s"}
                  </p>
                  <span className="text-xs text-slate-500">
                    {project.targetEndAt
                      ? new Date(project.targetEndAt).toLocaleDateString()
                      : "No target"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
