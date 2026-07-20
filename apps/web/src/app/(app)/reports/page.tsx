import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  canUseOperationalReports,
  getOperationalReportTrustContext,
  listOperationalReports,
  type OperationalReportCard
} from "@/server/services/reports";

export const dynamic = "force-dynamic";

const reportGroups: OperationalReportCard["group"][] = [
  "Purchasing",
  "Receiving",
  "Inventory",
  "Controls",
  "Projects",
  "Restaurant Ops",
  "Audit"
];

const reportTabs = ["All", ...reportGroups] as const;
type ReportTab = (typeof reportTabs)[number];

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeReportTab(value: string | undefined): ReportTab {
  const decoded = value?.replaceAll("-", " ");
  return reportTabs.includes(decoded as ReportTab) ? (decoded as ReportTab) : "All";
}

function reportTabHref(tab: ReportTab) {
  if (tab === "All") {
    return "/reports";
  }
  return `/reports?tab=${encodeURIComponent(tab.replaceAll(" ", "-"))}`;
}

function ReportCard({ report }: { report: OperationalReportCard }) {
  return (
    <Panel className="ogfi-record-summary shadow-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-950">{report.title}</h3>
            <Badge tone="info" size="sm">
              {report.group}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">{report.description}</p>
        </div>
        <Badge tone={report.status === "CSV_AVAILABLE" ? "success" : "neutral"}>
          {report.status === "CSV_AVAILABLE" ? "CSV" : "View"}
        </Badge>
      </div>
      {report.trustNotice ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={report.trustNotice.tone} size="sm">
              {report.trustNotice.label}
            </Badge>
            <span className="font-semibold">{report.trustNotice.sourceDecisionId}</span>
          </div>
          <p className="mt-1 leading-5">{report.trustNotice.detail}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <ButtonLink
          href={report.sourceHref}
          tone="secondary"
          className="min-h-9 border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
        >
          Open Source
        </ButtonLink>
        {report.exportHref ? (
          <ButtonLink href={report.exportHref} className="min-h-9">
            Export CSV
          </ButtonLink>
        ) : null}
      </div>
    </Panel>
  );
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseOperationalReports(session)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const reports = listOperationalReports(session);
  const trustContext = await getOperationalReportTrustContext(session);
  const exportCount = reports.filter((report) => report.exportHref).length;
  const params = searchParams ? await searchParams : {};
  const activeTab = normalizeReportTab(getSearchParam(params, "tab"));
  const visibleReports =
    activeTab === "All"
      ? reports
      : reports.filter((report) => report.group === activeTab);

  return (
    <AppShell
      session={session}
      title="Operational Reports"
      subtitle="Scoped operational, project, and restaurant source-record reports"
      activeNav="reports"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Reports are scoped source-record views.</strong> Exports use the
              same server-side permissions and selected company/location context as the
              operational modules.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Opening or exporting a report does not approve, post, reverse, or mutate
              any procurement, receiving, inventory, or audit source record.
            </p>
          </div>
          <span>Controlled exports</span>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Available reports</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{reports.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">CSV exports</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">{exportCount}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Scope</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {session.context.locationName}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Trust gate</p>
          <p className="mt-2 text-sm font-bold text-slate-950">
            {trustContext.trustGateLabel}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {trustContext.requireScopeFilters
              ? "Scope filters preserved"
              : "Scope filter requirement relaxed"}{" "}
            / {trustContext.trustGateSourceDecisionId}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Report Library</h2>
            <p className="text-sm text-slate-500">
              Browse report views by workflow area without leaving the selected operating scope.
            </p>
          </div>
          <Badge tone="info">
            {visibleReports.length} report{visibleReports.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="border-b border-slate-100 p-3">
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
            {reportTabs.map((tab) => {
              const count =
                tab === "All"
                  ? reports.length
                  : reports.filter((report) => report.group === tab).length;
              const active = activeTab === tab;
              return (
                <a
                  key={tab}
                  className={
                    active
                      ? "rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 shadow-sm"
                      : "rounded-xl border border-transparent px-4 py-3 text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                  }
                  href={reportTabHref(tab)}
                >
                  <span className="block text-sm font-bold">{tab}</span>
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    {count} report{count === 1 ? "" : "s"}
                  </span>
                </a>
              );
            })}
          </div>
        </div>

        {visibleReports.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No reports available</p>
            <p className="mt-1 text-sm text-slate-600">
              Report tabs only show source views allowed by your role and current scope.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            {visibleReports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
