import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  FileText,
  PackageCheck
} from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getSessionContext } from "@/server/services/context";
import {
  getOperationalDashboard,
  type DashboardMetric,
  type DashboardQueueItem
} from "@/server/services/dashboard";

export const dynamic = "force-dynamic";

const metricIcons = {
  "po-commitment-value": CircleDollarSign,
  "open-po-exposure": AlertTriangle,
  "received-po-value": PackageCheck,
  "stocked-items": Boxes,
  "active-stock-rows": Boxes,
  "zero-stock-rows": AlertTriangle,
  "lot-expiry-coverage": Database,
  "recent-stock-updates": ClipboardCheck,
  "sales-source": BarChart3,
  "inventory-value-source": Boxes
};

const dashboardViews = ["overview", "analytics", "reports", "notifications"] as const;
type DashboardView = (typeof dashboardViews)[number];

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDashboardView(value: string | undefined): DashboardView {
  return dashboardViews.includes(value as DashboardView)
    ? (value as DashboardView)
    : "overview";
}

function dashboardViewHref(view: DashboardView) {
  return view === "overview" ? "/dashboard" : `/dashboard?view=${view}`;
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = metricIcons[metric.id as keyof typeof metricIcons] ?? BarChart3;
  const body = (
    <Panel className="ogfi-metric-card h-full p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {metric.label}
          </p>
          <p className="mt-2 truncate text-2xl font-bold text-slate-950">
            {metric.displayValue}
          </p>
        </div>
        <span className="ogfi-icon-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 min-h-10 text-sm leading-6 text-slate-600">{metric.detail}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Badge tone={metric.tone} size="sm">
          {metric.href ? "Drill-down ready" : "Source pending"}
        </Badge>
        {metric.href ? (
          <span className="text-xs font-semibold text-blue-700">Open source</span>
        ) : null}
      </div>
    </Panel>
  );

  if (!metric.href) {
    return body;
  }

  return (
    <a className="block h-full transition-transform hover:-translate-y-0.5" href={metric.href}>
      {body}
    </a>
  );
}

function EmptyDashboardState({
  title,
  detail,
  actionHref,
  actionLabel
}: {
  title: string;
  detail: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{detail}</p>
      {actionHref && actionLabel ? (
        <ButtonLink
          href={actionHref}
          tone="secondary"
          className="mt-4 min-h-10 text-blue-700 hover:bg-blue-50"
        >
          {actionLabel}
        </ButtonLink>
      ) : null}
    </div>
  );
}

function QueueList({
  emptyDetail,
  items,
  actionLabel = "Open record"
}: {
  emptyDetail: string;
  items: DashboardQueueItem[];
  actionLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="p-5">
        <p className="font-semibold text-slate-900">Nothing waiting right now</p>
        <p className="mt-1 text-sm text-slate-600">{emptyDetail}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <div
          key={item.id}
          className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_11rem_auto] md:items-center"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {item.label}
              </p>
              <Badge tone={item.tone} size="sm">
                {item.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <h3 className="mt-1 font-bold text-slate-950">{item.reference}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
            <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              Next action: {actionLabel}
            </p>
          </div>
          <div className="text-sm text-slate-600">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Current state
            </p>
            <p className="mt-1 font-semibold text-slate-800">
              {item.status.replaceAll("_", " ")}
            </p>
          </div>
          <ButtonLink
            href={item.href}
            tone="secondary"
            className="min-h-11 text-blue-700 hover:bg-blue-50"
          >
            Open
          </ButtonLink>
        </div>
      ))}
    </div>
  );
}

function DashboardOverview({ dashboard }: { dashboard: Awaited<ReturnType<typeof getOperationalDashboard>> }) {
  return (
    <>
      <div className="mb-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="ogfi-data-surface">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Operational Indicators</h2>
              <p className="text-sm text-slate-500">
                Counts and exceptions from purchasing, receiving, transfers, stock counts, wastage, and ledger checks
              </p>
            </div>
            <Badge tone="info" size="sm">{dashboard.cards.length} indicators</Badge>
          </div>
          {dashboard.cards.length === 0 ? (
            <div className="p-5">
              <p className="font-semibold text-slate-900">No operational widgets available</p>
              <p className="mt-1 text-sm text-slate-600">
                Widgets appear after your role receives permission to view source records.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {dashboard.cards.map((card) => (
                <a
                  key={card.id}
                  className="ogfi-metric-card rounded-[1rem] border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                  href={card.href}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">{card.label}</p>
                      <p className="mt-2 text-3xl font-bold text-slate-950">{card.value}</p>
                    </div>
                    <Badge tone={card.tone} size="sm">{card.value > 0 ? "Action" : "Clear"}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{card.description}</p>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="ogfi-data-surface">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-lg font-bold text-slate-950">Data Source Coverage</h2>
            <p className="text-sm text-slate-500">
              Shows which executive metrics are backed by trusted ERP sources
            </p>
          </div>
          <div className="grid gap-3 p-4">
            {dashboard.sourceHealth.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>
        </section>
      </div>

      {dashboard.stockHealth.length > 0 ? (
        <section className="ogfi-data-surface mb-5">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Stock Health</h2>
              <p className="text-sm text-slate-500">
                Inventory balance coverage for the selected location
              </p>
            </div>
            <ButtonLink
              href="/inventory"
              tone="secondary"
              className="min-h-10 text-blue-700 hover:bg-blue-50"
            >
              View Inventory
            </ButtonLink>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.stockHealth.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Approval Queue</h2>
              <p className="text-sm text-slate-500">
                Assigned approvals filtered by role, scope, and self-approval controls
              </p>
            </div>
            <Badge tone="info" size="sm">{dashboard.approvalQueue.length} shown</Badge>
          </div>
          <QueueList
            actionLabel="Review assigned approval"
            emptyDetail="Assigned approval decisions will appear here after controlled records are submitted."
            items={dashboard.approvalQueue}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Needs Attention</h2>
              <p className="text-sm text-slate-500">
                Source records with overdue, variance, discrepancy, or handoff risk
              </p>
            </div>
            <Badge tone="warning" size="sm">{dashboard.exceptionQueue.length} shown</Badge>
          </div>
          <QueueList
            actionLabel="Open source record"
            emptyDetail="Open exceptions are pulled from purchasing, receiving, transfers, counts, and inventory controls."
            items={dashboard.exceptionQueue}
          />
        </section>
      </div>
    </>
  );
}

function DashboardAnalytics({ dashboard }: { dashboard: Awaited<ReturnType<typeof getOperationalDashboard>> }) {
  const analyticsMetrics = [...dashboard.metrics, ...dashboard.stockHealth];

  return (
    <div className="grid gap-5">
      <section className="ogfi-data-surface">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Operational Analytics</h2>
            <p className="text-sm text-slate-500">
              Read-only analysis from source records in the selected operating scope.
            </p>
          </div>
          <Badge tone="info" size="sm">{analyticsMetrics.length} metrics</Badge>
        </div>
        {analyticsMetrics.length === 0 ? (
          <div className="p-4">
            <EmptyDashboardState
              title="No analytics available yet"
              detail="Analytics appear after purchasing, receiving, inventory, or ledger source records are available to your role."
            />
          </div>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {analyticsMetrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>
        )}
      </section>

      <section className="ogfi-data-surface">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-lg font-bold text-slate-950">Exception Mix</h2>
          <p className="text-sm text-slate-500">
            A quick comparison of the operational indicators currently visible to you.
          </p>
        </div>
        {dashboard.cards.length === 0 ? (
          <div className="p-4">
            <EmptyDashboardState
              title="No indicator data yet"
              detail="Open PRs, POs, receiving variances, transfer follow-ups, counts, wastage, adjustments, and ledger checks will appear here when available."
            />
          </div>
        ) : (
          <div className="grid gap-3 p-4">
            {dashboard.cards.map((card) => (
              <a
                key={card.id}
                className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-blue-200 hover:bg-blue-50/40 md:grid-cols-[1fr_auto_9rem] md:items-center"
                href={card.href}
              >
                <div>
                  <p className="font-bold text-slate-950">{card.label}</p>
                  <p className="text-sm text-slate-600">{card.description}</p>
                </div>
                <p className="text-2xl font-bold text-slate-950">{card.value}</p>
                <Badge tone={card.tone} size="sm">
                  {card.value > 0 ? "Follow-up" : "Clear"}
                </Badge>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DashboardReports({ dashboard }: { dashboard: Awaited<ReturnType<typeof getOperationalDashboard>> }) {
  const reports = [
    {
      title: "Inventory Balance Report",
      detail: "Current on-hand stock by item, location, lot, expiry, and ledger status.",
      href: "/inventory",
      available: dashboard.stockHealth.length > 0
    },
    {
      title: "Purchase Order Exposure",
      detail: "PO commitments, open value, receiving progress, and overdue supplier deliveries.",
      href: "/purchase-orders",
      available: dashboard.metrics.some((metric) => metric.id.includes("po"))
    },
    {
      title: "Receiving Variance Review",
      detail: "Receipts with damaged, rejected, short, or discrepancy handling status.",
      href: "/receiving",
      available: dashboard.cards.some((card) => card.id === "receiving-variance")
    },
    {
      title: "Transfer Follow-up",
      detail: "Warehouse-to-branch transfers awaiting dispatch, receipt, or discrepancy settlement.",
      href: "/transfers",
      available: dashboard.cards.some((card) => card.id === "transfer-follow-up")
    },
    {
      title: "Wastage and Adjustments",
      detail: "Controlled stock exceptions requiring approval, evidence, posting, or reversal.",
      href: "/wastage",
      available: dashboard.cards.some((card) => card.id === "wastage-exceptions")
    },
    {
      title: "Approval Queue",
      detail: "Pending approvals assigned by role, scope, approver eligibility, and status.",
      href: "/approvals",
      available: dashboard.approvalQueue.length > 0
    }
  ];

  return (
    <section className="ogfi-data-surface">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Reports</h2>
          <p className="text-sm text-slate-500">
            Report shortcuts preserve the selected operating scope and open source modules.
          </p>
        </div>
        <Badge tone="info" size="sm">{reports.length} report views</Badge>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <a
            key={report.title}
            className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
            href={report.href}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                <FileText aria-hidden="true" className="h-5 w-5" />
              </span>
              <Badge tone={report.available ? "success" : "neutral"} size="sm">
                {report.available ? "Data available" : "Ready"}
              </Badge>
            </div>
            <h3 className="mt-4 font-bold text-slate-950">{report.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{report.detail}</p>
            <p className="mt-4 text-sm font-bold text-blue-700">Open report source</p>
          </a>
        ))}
      </div>
    </section>
  );
}

function DashboardNotifications({ dashboard }: { dashboard: Awaited<ReturnType<typeof getOperationalDashboard>> }) {
  const notificationItems = [...dashboard.approvalQueue, ...dashboard.exceptionQueue];

  return (
    <div className="grid gap-5">
      <section className="ogfi-data-surface">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Notifications</h2>
            <p className="text-sm text-slate-500">
              Work alerts collected from approvals and source-record exceptions.
            </p>
          </div>
          <ButtonLink
            href="/notifications"
            tone="secondary"
            className="min-h-10 text-blue-700 hover:bg-blue-50"
          >
            Open Notification Center
          </ButtonLink>
        </div>
        {notificationItems.length === 0 ? (
          <div className="p-4">
            <EmptyDashboardState
              title="No dashboard notifications right now"
              detail="Approval assignments, overdue POs, receiving discrepancies, transfer disputes, stock count variances, wastage exceptions, and ledger variances will appear here."
              actionHref="/notifications"
              actionLabel="View Notification Center"
            />
          </div>
        ) : (
          <QueueList
            actionLabel="Open source record"
            emptyDetail="No dashboard notifications right now."
            items={notificationItems}
          />
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Panel className="ogfi-detail-card">
          <div className="flex items-center gap-3">
            <Bell aria-hidden="true" className="h-5 w-5 text-blue-700" />
            <p className="text-sm font-semibold text-slate-500">Approval alerts</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.approvalQueue.length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <div className="flex items-center gap-3">
            <AlertTriangle aria-hidden="true" className="h-5 w-5 text-amber-700" />
            <p className="text-sm font-semibold text-slate-500">Exception alerts</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.exceptionQueue.length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <div className="flex items-center gap-3">
            <ClipboardCheck aria-hidden="true" className="h-5 w-5 text-emerald-700" />
            <p className="text-sm font-semibold text-slate-500">Clear indicators</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.cards.filter((card) => card.value === 0).length}
          </p>
        </Panel>
      </section>
    </div>
  );
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const params = searchParams ? await searchParams : {};
  const activeView = normalizeDashboardView(getSearchParam(params, "view"));
  const dashboard = await getOperationalDashboard(session);

  return (
    <AppShell
      session={session}
      title="Company Overview"
      subtitle="Operational performance, stock health, commitments, and control exceptions"
      activeNav="dashboard"
    >
      <section className="ogfi-dashboard-hero mb-6 overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 pt-5">
          <div className="ogfi-tab-list mb-4">
            {dashboardViews.map((view) => (
              <a
                key={view}
                className={activeView === view ? "ogfi-tab is-active" : "ogfi-tab"}
                href={dashboardViewHref(view)}
              >
                {view[0]!.toUpperCase() + view.slice(1)}
              </a>
            ))}
          </div>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_2fr]">
          <div className="ogfi-scope-card rounded-[1rem] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Building2 aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Selected operating scope
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                  {dashboard.scope.locationName}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {dashboard.scope.companyName} / {dashboard.scope.brandName} /{" "}
                  {dashboard.scope.locationType}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="info" size="sm">Live source records</Badge>
              <Badge size="sm">Updated {new Date(dashboard.generatedAt).toLocaleString()}</Badge>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.metrics.slice(0, 4).map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>
        </div>
      </section>

      {activeView === "overview" ? <DashboardOverview dashboard={dashboard} /> : null}
      {activeView === "analytics" ? <DashboardAnalytics dashboard={dashboard} /> : null}
      {activeView === "reports" ? <DashboardReports dashboard={dashboard} /> : null}
      {activeView === "notifications" ? (
        <DashboardNotifications dashboard={dashboard} />
      ) : null}
    </AppShell>
  );
}
