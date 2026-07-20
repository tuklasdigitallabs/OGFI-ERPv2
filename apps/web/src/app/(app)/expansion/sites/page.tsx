import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Filter, Search } from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { ExpansionEntrySheet } from "@/components/ExpansionEntrySheet";
import { ExpansionWorkspaceNav } from "@/components/ExpansionWorkspaceNav";
import { getPaginationState } from "@/components/FinancePagination";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { canUseProjects, getDefaultAppRoute } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  getExpansionCreateOptions,
  listExpansionSitePipeline
} from "@/server/services/expansionProjects";
import { createProject } from "@/server/services/projects";

export const dynamic = "force-dynamic";

type SitePipelinePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const statusOptions = ["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];

const scheduleTone = {
  ON_TRACK: "success",
  WATCH: "warning",
  AT_RISK: "warning",
  NO_DATE: "neutral"
} as const;

async function createExpansionProjectAction(formData: FormData) {
  "use server";

  try {
    const session = await getSessionContext();
    if (!session) {
      throw new Error("SESSION_NOT_FOUND");
    }
    const templateId = String(formData.get("templateId") ?? "");
    const projectType = String(formData.get("projectType") ?? "");
    if (templateId) {
      const createOptions = await getExpansionCreateOptions(session);
      const template = createOptions.templates.find((option) => option.id === templateId);
      if (!template || template.projectType !== projectType) {
        throw new Error("EXPANSION_TEMPLATE_TYPE_MISMATCH");
      }
    }
    await createProject(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/sites", error));
  }
  redirect("/expansion/sites");
}

function firstSearchValue(
  value: string | string[] | undefined,
  fallback = ""
) {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function formatDate(value: string | null) {
  if (!value) {
    return "No target";
  }
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function statusTone(status: string) {
  if (status === "ACTIVE" || status === "COMPLETED") {
    return "success" as const;
  }
  if (status === "ON_HOLD") {
    return "warning" as const;
  }
  if (status === "CANCELLED") {
    return "destructive" as const;
  }
  return "neutral" as const;
}

function pipelinePageHref(input: {
  page: number;
  query: string;
  status: string;
}) {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  params.set("page", String(input.page));
  return `/expansion/sites?${params.toString()}`;
}

export default async function SitePipelinePage({
  searchParams
}: SitePipelinePageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseProjects(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = firstSearchValue(resolvedSearchParams.q);
  const status = firstSearchValue(resolvedSearchParams.status);
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const [rows, createOptions] = await Promise.all([
    listExpansionSitePipeline(session, {
      query,
      status
    }),
    getExpansionCreateOptions(session)
  ]);
  const pagination = getPaginationState(rows.length, firstSearchValue(resolvedSearchParams.page));
  const visibleRows = rows.slice(pagination.startIndex, pagination.endIndex);

  return (
    <AppShell
      session={session}
      title="Site Pipeline"
      subtitle="Candidate sites, branch openings, renovations, and construction work"
      activeNav="site-pipeline"
    >
      <ExpansionWorkspaceNav />

      <ActionFeedbackBanner feedback={actionFeedback} />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Site pipeline records are Expansion projects.</strong> They
              inherit shared project membership, tasks, milestones, risks, activity,
              attachments, and safe source-record links.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              This workspace does not create branches, approve capex, issue POs,
              release payments, or post journals.
            </p>
          </div>
          <Badge tone="info">Shared project engine</Badge>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Pipeline records</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{rows.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">At risk</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {rows.filter((row) => row.scheduleState === "AT_RISK").length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Blocked tasks</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {rows.reduce((total, row) => total + row.blockedTaskCount, 0)}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Punch list items</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {rows.reduce((total, row) => total + row.openPunchListCount, 0)}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Pipeline List</h2>
            <p className="text-sm text-slate-500">
              Searchable manager view with schedule, risk, and next-action signals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              href="/expansion"
            >
              Dashboard
            </Link>
            <ExpansionEntrySheet
              title="Create Site Project"
              triggerLabel="Create Site Project"
              submitLabel="Create Site Project"
              triggerClassName="gap-2"
              disabled={!createOptions.canCreateProject}
              disabledReason="Creating a site project requires project-create permission plus an assigned operating or management scope."
            >
              <form action={createExpansionProjectAction} className="grid gap-5 pt-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Project code
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="code"
                      placeholder="YL-SM-CEBU-OPENING"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Project name
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="name"
                      placeholder="Yakiniku Like SM City Cebu Opening"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Expansion type
                    <select
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="projectType"
                      required
                    >
                      {createOptions.projectTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Target opening date
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="targetEndAt"
                      type="date"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Existing location link
                    <select
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="locationId"
                    >
                      <option value="">Proposed site / no branch record yet</option>
                      {createOptions.locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} / {location.locationType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Template
                    <select
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="templateId"
                    >
                      <option value="">No template</option>
                      {createOptions.templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.code} / {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Project manager
                    <select className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" name="managerUserId" required>
                      <option value="">Select an independent manager</option>
                      {createOptions.leadershipUsers.filter((user) => user.id !== session.user.id).map((user) => <option key={user.id} value={user.id}>{user.displayName} / {user.email}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Primary sponsor
                    <select className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" name="sponsorUserId" required>
                      <option value="">Select an independent sponsor</option>
                      {createOptions.leadershipUsers.filter((user) => user.id !== session.user.id).map((user) => <option key={user.id} value={user.id}>{user.displayName} / {user.email}</option>)}
                    </select>
                  </label>
                </div>
                <p className="-mt-2 text-xs text-slate-500">The manager and sponsor must be different active project users. This keeps lifecycle gates and high-risk closure independently reviewable.</p>
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                  <input className="mt-1" name="isRestricted" type="checkbox" />
                  <span>
                    Restricted project
                    <span className="block text-xs font-normal leading-5 text-slate-500">
                      Only explicit members, project scope, and authorized managers can discover it.
                    </span>
                  </span>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Description
                  <textarea
                    className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    name="description"
                    placeholder="Site context, mall coordination notes, opening objective, or current feasibility assumptions."
                  />
                </label>
              </form>
            </ExpansionEntrySheet>
          </div>
        </div>

        <form
          className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[1fr_14rem_auto_auto]"
          action="/expansion/sites"
        >
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Search
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                className="min-h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
                name="q"
                placeholder="Project, site, manager, brand"
                defaultValue={query}
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Status
            <select
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
              name="status"
              defaultValue={status}
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            type="submit"
          >
            <Filter aria-hidden="true" className="h-4 w-4" />
            Apply
          </button>
          <Link
            className="inline-flex min-h-10 items-center justify-center self-end rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            href="/expansion/sites"
          >
            Clear
          </Link>
        </form>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Site Project</th>
                <th className="px-5 py-3">Target Opening</th>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3">Progress</th>
                <th className="px-5 py-3">Risks / Blockers</th>
                <th className="px-5 py-3">Next Milestone</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="px-5 py-8" colSpan={7}>
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                        <Building2 aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-semibold text-slate-950">
                          No site projects found
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Adjust filters or create a site project for branch opening,
                          renovation, relocation, or compliance work.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="font-bold text-slate-950 hover:text-blue-700" href={`/expansion/sites/${row.id}`}>
                          {row.name}
                        </Link>
                        {row.isRestricted ? (
                          <Badge tone="warning" size="sm">
                            Restricted
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.code} / {row.projectType}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.brandName} / {row.siteName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {formatDate(row.targetOpeningDate)}
                      </p>
                      <Badge tone={scheduleTone[row.scheduleState]} size="sm">
                        {row.scheduleState.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{row.managerName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Sponsor: {row.sponsorName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {row.completionPercent}%
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.completedTaskCount}/{row.taskCount} task(s)
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {row.highRiskCount} high risk
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.blockedTaskCount} blocked / {row.openPunchListCount} punch
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {row.nextMilestoneTitle ?? "No planned milestone"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(row.nextMilestoneDate)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(row.status)} size="sm">
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {visibleRows.length === 0 ? <div className="px-5 py-8"><p className="font-semibold text-slate-950">No site projects found</p><p className="mt-1 text-sm text-slate-600">Adjust filters or create a site project for branch opening, renovation, relocation, or compliance work.</p></div> : visibleRows.map((row) => (
            <Link className="block px-5 py-4 hover:bg-slate-50" href={`/expansion/sites/${row.id}`} key={row.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.code} / {row.brandName} / {row.siteName}</p></div><Badge tone={statusTone(row.status)} size="sm">{row.status.replaceAll("_", " ")}</Badge></div>
              <div className="mt-3 flex flex-wrap gap-2"><Badge tone={scheduleTone[row.scheduleState]} size="sm">{row.scheduleState.replaceAll("_", " ")}</Badge>{row.isRestricted ? <Badge tone="warning" size="sm">Restricted</Badge> : null}<Badge tone="neutral" size="sm">Opening {formatDate(row.targetOpeningDate)}</Badge></div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Progress</p><p className="mt-1 font-bold text-slate-900">{row.completionPercent}%</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Blocked</p><p className="mt-1 font-bold text-slate-900">{row.blockedTaskCount}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Punch</p><p className="mt-1 font-bold text-slate-900">{row.openPunchListCount}</p></div></div>
              <p className="mt-3 text-sm text-slate-600">Manager: {row.managerName} · Next: {row.nextMilestoneTitle ?? "No planned milestone"}</p>
            </Link>
          ))}
        </div>
        {rows.length > pagination.pageSize ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
            <p>
              Showing {pagination.startIndex + 1}-{pagination.endIndex} of {rows.length}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                aria-disabled={pagination.page === 1}
                className={
                  pagination.page === 1
                    ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400"
                    : "inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50"
                }
                href={pipelinePageHref({
                  page: Math.max(1, pagination.page - 1),
                  query,
                  status
                })}
              >
                Previous
              </Link>
              <span className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Link
                aria-disabled={pagination.page === pagination.totalPages}
                className={
                  pagination.page === pagination.totalPages
                    ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400"
                    : "inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 font-semibold text-blue-700 hover:bg-blue-100"
                }
                href={pipelinePageHref({
                  page: Math.min(pagination.totalPages, pagination.page + 1),
                  query,
                  status
                })}
              >
                Next
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
