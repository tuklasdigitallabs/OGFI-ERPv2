import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Download,
  Link2,
  ShieldCheck
} from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { ExpansionWorkspaceNav } from "@/components/ExpansionWorkspaceNav";
import { canUseProjects, getDefaultAppRoute } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportExpansion } from "@/server/services/exportAuthorization";
import {
  getExpansionDashboard,
  getExpansionReportRollups
} from "@/server/services/expansionProjects";

export const dynamic = "force-dynamic";

const scheduleTone = {
  ON_TRACK: "success",
  WATCH: "warning",
  AT_RISK: "warning",
  NO_DATE: "neutral"
} as const;

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila"
  }).format(new Date(value));
}

function metricClass(tone: "neutral" | "success" | "warning" | "info") {
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (tone === "info") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function healthTone(health: "CLEAR" | "WATCH" | "AT_RISK") {
  if (health === "CLEAR") {
    return "success" as const;
  }
  return "warning" as const;
}

type ExpansionDashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchValue(value: string | string[] | undefined, fallback = "") {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

export default async function ExpansionDashboardPage({
  searchParams
}: ExpansionDashboardPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseProjects(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const [dashboard, reportRollups] = await Promise.all([
    getExpansionDashboard(session),
    getExpansionReportRollups(session)
  ]);
  const canExportExpansionCsv = canExportExpansion(session);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedTab = firstSearchValue(resolvedSearchParams.tab, "portfolio");
  const tab = ["portfolio", "reports", "activity"].includes(requestedTab)
    ? requestedTab
    : "portfolio";
  const atRiskProjects = dashboard.projects.filter(
    (project) => project.scheduleState === "AT_RISK" || project.scheduleState === "WATCH"
  );
  const nextMilestones = dashboard.projects
    .filter((project) => project.nextMilestoneTitle)
    .slice(0, 8);

  return (
    <AppShell
      session={session}
      title="Expansion Dashboard"
      subtitle="Branch openings, renovations, construction, and readiness control"
      activeNav="expansion-dashboard"
    >
      <ExpansionWorkspaceNav />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Expansion uses the shared project engine.</strong> This
              workspace specializes project, task, milestone, risk, blocker, and
              linked-record visibility for branch opening work.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Financial, procurement, payment, inventory, and approval records stay
              in their source modules. Expansion only shows authorized references.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Phase 4 foundation</Badge>
            {canExportExpansionCsv ? (
              <Link
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-800 hover:bg-blue-50"
                href="/expansion/export"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Export CSV
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        {[
          {
            label: "Expansion projects",
            value: dashboard.projectCount,
            detail: `${dashboard.activeProjectCount} active`,
            icon: Building2,
            tone: "info" as const
          },
          {
            label: "Schedule risk",
            value: dashboard.atRiskProjectCount,
            detail: `${dashboard.blockedTaskCount} blocked task(s)`,
            icon: AlertTriangle,
            tone: dashboard.atRiskProjectCount > 0 ? ("warning" as const) : ("success" as const)
          },
          {
            label: "Upcoming milestones",
            value: dashboard.upcomingMilestoneCount,
            detail: `${dashboard.overdueTaskCount} overdue task(s)`,
            icon: CalendarClock,
            tone: dashboard.overdueTaskCount > 0 ? ("warning" as const) : ("neutral" as const)
          },
          {
            label: "Linked source records",
            value: dashboard.linkedRecordCount,
            detail: "Read-only ERP references",
            icon: Link2,
            tone: "neutral" as const
          }
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Panel key={metric.label} className="ogfi-detail-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{metric.detail}</p>
                </div>
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${metricClass(metric.tone)}`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
              </div>
            </Panel>
          );
        })}
      </div>

      <nav aria-label="Expansion dashboard views" className="mb-5 flex flex-wrap gap-2">
        {[
          ["portfolio", "Portfolio"],
          ["reports", "Reports"],
          ["activity", "Activity"]
        ].map(([key, label]) => (
          <Link
            aria-current={tab === key ? "page" : undefined}
            className={
              tab === key
                ? "inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white shadow-sm"
                : "inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            }
            href={`/expansion?tab=${key}`}
            key={key}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "reports" ? <section className="ogfi-data-surface mb-5 overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Expansion Report Rollups
            </h2>
            <p className="text-sm text-slate-500">
              Source-linked reporting coverage for pipeline, gates, permits,
              construction, readiness, and punch-list exceptions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={reportRollups.exceptionCount > 0 ? "warning" : "success"}>
              {reportRollups.exceptionCount} exception(s)
            </Badge>
            <Badge tone="info">{reportRollups.projectCount} project(s)</Badge>
          </div>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Report</th>
                <th className="px-5 py-3">Source Workspace</th>
                <th className="px-5 py-3">Open</th>
                <th className="px-5 py-3">Exceptions</th>
                <th className="px-5 py-3">Completed</th>
                <th className="px-5 py-3">Health</th>
                <th className="px-5 py-3">Next Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportRollups.rollups.map((rollup) => (
                <tr key={rollup.reportId}>
                  <td className="px-5 py-4 align-top">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
                        <BarChart3 aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-bold text-slate-950">
                          {rollup.reportName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {rollup.reportId}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <Link
                      className="font-semibold text-blue-700 hover:text-blue-900"
                      href={rollup.sourceHref}
                    >
                      {rollup.sourceWorkspace}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {rollup.totalCount} total record(s)
                    </p>
                  </td>
                  <td className="px-5 py-4 align-top font-semibold text-slate-900">
                    {rollup.openCount}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span
                      className={
                        rollup.exceptionCount > 0
                          ? "font-bold text-amber-700"
                          : "font-semibold text-slate-700"
                      }
                    >
                      {rollup.exceptionCount}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top font-semibold text-slate-900">
                    {rollup.completedCount}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <Badge tone={healthTone(rollup.health)}>
                      {rollup.health.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 align-top text-slate-600">
                    {rollup.nextAction}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {reportRollups.rollups.map((rollup) => (
            <Link
              className="block px-5 py-4 hover:bg-slate-50"
              href={rollup.sourceHref}
              key={rollup.reportId}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950">{rollup.reportName}</p>
                  <p className="mt-1 text-xs text-slate-500">{rollup.sourceWorkspace}</p>
                </div>
                <Badge tone={healthTone(rollup.health)}>{rollup.health.replaceAll("_", " ")}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs font-semibold uppercase text-slate-500">Open</p><p className="mt-1 font-bold text-slate-900">{rollup.openCount}</p></div>
                <div><p className="text-xs font-semibold uppercase text-slate-500">Exceptions</p><p className="mt-1 font-bold text-slate-900">{rollup.exceptionCount}</p></div>
                <div><p className="text-xs font-semibold uppercase text-slate-500">Complete</p><p className="mt-1 font-bold text-slate-900">{rollup.completedCount}</p></div>
              </div>
              <p className="mt-3 text-sm text-slate-600">Next: {rollup.nextAction}</p>
            </Link>
          ))}
        </div>
      </section> : null}

      {tab === "portfolio" ? <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_24rem]">
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
            <h2 className="text-lg font-bold text-slate-950">
              Expansion Portfolio
            </h2>
            <p className="text-sm text-slate-500">
                The first 10 of {dashboard.projects.length} authorized projects. Use Site Pipeline for the full paginated register.
            </p>
            </div>
            <Link
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-800 hover:bg-blue-100"
              href="/expansion/sites"
            >
              Open Site Pipeline
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Project / Site</th>
                  <th className="px-5 py-3">Target Opening</th>
                  <th className="px-5 py-3">Progress</th>
                  <th className="px-5 py-3">Risk</th>
                  <th className="px-5 py-3">Next Milestone</th>
                  <th className="px-5 py-3">Source Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.projects.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8" colSpan={6}>
                      <p className="font-semibold text-slate-950">
                        No expansion projects yet
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Create expansion projects from the Site Pipeline to start
                        tracking opening dates, readiness, blockers, and linked ERP records.
                      </p>
                    </td>
                  </tr>
                ) : (
                  dashboard.projects.slice(0, 10).map((project) => (
                    <tr key={project.id} className="align-top">
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link className="font-bold text-slate-950 hover:text-blue-700" href={`/expansion/sites/${project.id}`}>
                            {project.name}
                          </Link>
                          {project.isRestricted ? (
                            <Badge tone="warning" size="sm">
                              Restricted
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {project.code} / {project.projectType}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {project.brandName} / {project.siteName}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {formatDate(project.targetOpeningDate)}
                        </p>
                        <Badge tone={scheduleTone[project.scheduleState]} size="sm">
                          {project.scheduleState.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {project.completionPercent}%
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {project.completedTaskCount}/{project.taskCount} task(s)
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {project.highRiskCount} high risk
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {project.blockedTaskCount} blocked / {project.overdueTaskCount} overdue
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {project.nextMilestoneTitle ?? "No planned milestone"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(project.nextMilestoneDate)}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {project.linkedRecordCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 md:hidden">
            {dashboard.projects.length === 0 ? (
              <div className="px-5 py-8">
                <p className="font-semibold text-slate-950">No expansion projects yet</p>
                <p className="mt-1 text-sm text-slate-600">
                  Create an Expansion project from Site Pipeline to begin tracking its opening controls.
                </p>
              </div>
            ) : (
              dashboard.projects.slice(0, 10).map((project) => (
                <Link
                  className="block px-5 py-4 hover:bg-slate-50"
                  href={`/expansion/sites/${project.id}`}
                  key={project.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{project.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {project.code} / {project.brandName} / {project.siteName}
                      </p>
                    </div>
                    <Badge tone={scheduleTone[project.scheduleState]} size="sm">
                      {project.scheduleState.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-xs font-semibold uppercase text-slate-500">Progress</p><p className="mt-1 font-bold text-slate-900">{project.completionPercent}%</p></div>
                    <div><p className="text-xs font-semibold uppercase text-slate-500">Exceptions</p><p className="mt-1 font-bold text-slate-900">{project.blockedTaskCount + project.overdueTaskCount}</p></div>
                    <div><p className="text-xs font-semibold uppercase text-slate-500">Opening</p><p className="mt-1 font-bold text-slate-900">{formatDate(project.targetOpeningDate)}</p></div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">Next: {project.nextMilestoneTitle ?? "No planned milestone"}</p>
                </Link>
              ))
            )}
          </div>
        </section>

        <aside className="grid gap-4">
          <Panel className="ogfi-detail-card">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-800">
                <AlertTriangle aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-950">Attention Queue</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Sites with blockers, overdue work, or high risks.
                </p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {atRiskProjects.length === 0 ? (
                <p className="py-3 text-sm text-slate-600">
                  No expansion schedule risks in the current scope.
                </p>
              ) : (
                atRiskProjects.slice(0, 5).map((project) => (
                  <div key={project.id} className="py-3">
                    <Link className="font-semibold text-slate-950 hover:text-blue-700" href={`/expansion/sites/${project.id}`}>
                      {project.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {project.blockedTaskCount} blocked, {project.overdueTaskCount} overdue,
                      {" "}
                      {project.highRiskCount} high risk
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-800">
                <ClipboardCheck aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-950">Next Milestones</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Upcoming phase and opening-readiness dates.
                </p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {nextMilestones.length === 0 ? (
                <p className="py-3 text-sm text-slate-600">
                  No planned milestones in the current scope.
                </p>
              ) : (
                nextMilestones.map((project) => (
                  <div key={project.id} className="py-3">
                    <p className="font-semibold text-slate-950">
                      {project.nextMilestoneTitle}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {project.name} / {formatDate(project.nextMilestoneDate)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800">
                <ShieldCheck aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-950">Source Boundary</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Expansion can link to budget, PR, PO, invoice, payment, and permit
                  evidence records, but cannot approve, post, pay, receive, or mutate them.
                </p>
              </div>
            </div>
          </Panel>
        </aside>
      </div> : null}

      {tab === "activity" ? <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Recent Activity</h2>
            <p className="text-sm text-slate-500">
              Auditable project activity for visible expansion projects.
            </p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {dashboard.recentActivity.length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-600">
              No recent expansion activity.
            </div>
          ) : (
            dashboard.recentActivity.map((activity) => (
              <div key={activity.id} className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_12rem]">
                <div>
                  <p className="font-semibold text-slate-950">
                    {activity.eventType.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {activity.projectName} / {activity.actorName}
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  {formatDateTime(activity.occurredAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </section> : null}
    </AppShell>
  );
}
