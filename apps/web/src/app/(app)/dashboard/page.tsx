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
  PackageCheck,
  ShieldCheck,
  TriangleAlert,
  Utensils,
  Wrench
} from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { canUseRecipesAndCosting } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  getOperationalDashboard,
  type DashboardMetric,
  type DashboardQueueItem,
  type DashboardSourceObservation
} from "@/server/services/dashboard";
import { formatDashboardCheckedAt } from "./sourceObservation";

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
const analyticsPanels = ["risk", "stock", "attention", "details"] as const;
type AnalyticsPanel = (typeof analyticsPanels)[number];

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

function normalizeAnalyticsPanel(value: string | undefined): AnalyticsPanel {
  return analyticsPanels.includes(value as AnalyticsPanel)
    ? (value as AnalyticsPanel)
    : "risk";
}

function analyticsPanelHref(panel: AnalyticsPanel) {
  return `/dashboard?view=analytics&panel=${panel}`;
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
  isPartial = false,
  actionLabel = "Open record"
}: {
  emptyDetail: string;
  items: DashboardQueueItem[];
  isPartial?: boolean;
  actionLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="p-5">
        <p className="font-semibold text-slate-900">
          {isPartial ? "No items shown from available sources" : "Nothing waiting right now"}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {isPartial
            ? "One or more authorized sources were unavailable, so this is not confirmation that no work is waiting. Open the affected source workspace in Dashboard source status."
            : emptyDetail}
        </p>
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
              <Badge tone={item.priority === "CRITICAL" ? "danger" : "warning"} size="sm">
                {item.priority}
              </Badge>
              <Badge tone={item.tone} size="sm">
                {item.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <h3 className="mt-1 font-bold text-slate-950">{item.reference}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
            <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              Next action: {item.nextAction ?? actionLabel}
            </p>
            <div className="mt-2 grid gap-1 text-xs font-semibold text-slate-500 sm:grid-cols-2">
              <p>Location: {item.locationName}</p>
              <p>Owner: {item.ownerLabel}</p>
              <p>Timing: {item.ageLabel}</p>
              <p>Severity: {item.severityLabel}</p>
            </div>
            {item.nextActor ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Assigned to: {item.nextActor}
              </p>
            ) : null}
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

type DashboardData = Awaited<ReturnType<typeof getOperationalDashboard>>;

function dashboardResponseIsPartial(dashboard: DashboardData) {
  return (
    dashboard.sourceObservations.length === 0 ||
    dashboard.sourceObservations.some(
      (source) => source.availability === "UNAVAILABLE"
    )
  );
}

function queueCountLabel(
  contract: DashboardData["approvalQueueContract"],
  noun: string
) {
  if (contract.totalCount === null) {
    return `${contract.displayedCount} ${noun} shown from available sources`;
  }

  return `${contract.displayedCount}${
    contract.totalCount > contract.displayedCount ? ` of ${contract.totalCount}` : ""
  } ${noun} shown`;
}

function SourceObservationList({
  sources
}: {
  sources: DashboardSourceObservation[];
}) {
  return (
    <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
      {sources.map((source) => (
        <li
          key={source.id}
          className="flex flex-col gap-2 rounded-lg border border-current/15 bg-white/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-semibold">{source.label}</p>
            <p className="text-xs">
              <span className="font-bold">
                {source.availability === "AVAILABLE" ? "Available" : "Unavailable"}
              </span>
              {" · Checked "}
              {formatDashboardCheckedAt(source.checkedAt)}
            </p>
            {source.dataAsOf ? (
              <p className="mt-1 text-xs">
                Source data as of {formatDashboardCheckedAt(source.dataAsOf)}
              </p>
            ) : null}
            {source.availability === "UNAVAILABLE" ? (
              <p className="mt-1 text-xs">Source data was unavailable for this response.</p>
            ) : null}
          </div>
          <a
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            href={source.href}
          >
            Open source
          </a>
        </li>
      ))}
    </ul>
  );
}

function SourceObservationDisclosure({ dashboard }: { dashboard: DashboardData }) {
  const hasNoAttemptedSources = dashboard.sourceObservations.length === 0;
  const isPartialResponse = dashboardResponseIsPartial(dashboard);
  const availableSources = dashboard.sourceObservations.filter(
    (source) => source.availability === "AVAILABLE"
  );
  const unavailableSources = dashboard.sourceObservations.filter(
    (source) => source.availability === "UNAVAILABLE"
  );

  return (
    <details
      className={
        isPartialResponse
          ? "border-t border-amber-200 bg-amber-50 px-5 py-2 text-amber-950"
          : "border-t border-slate-200 bg-slate-50 px-5 py-2 text-slate-700"
      }
      open={isPartialResponse}
    >
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-3 rounded-lg py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        {isPartialResponse ? (
          <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-700" />
        ) : (
          <Database aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-700" />
        )}
        <span className="flex-1">
          {isPartialResponse
            ? hasNoAttemptedSources
              ? "No dashboard sources were checked"
              : "Some dashboard sources were unavailable"
            : "Dashboard source status"}
        </span>
        <span className="w-full pl-8 text-xs font-bold uppercase tracking-wide sm:w-auto sm:pl-0">
          {isPartialResponse ? "Partial response · details open" : "All attempted sources available · show details"}
        </span>
      </summary>
      <div className="pb-3 pl-8">
        <p className="max-w-4xl text-sm leading-6">
          Checked times show when this dashboard response observed each source. They do not
          show when records changed and do not prove completeness or an SLA.
        </p>
        {isPartialResponse ? (
          <p className="mt-2 text-sm font-semibold">
            Totals, zero values, and empty queues may omit records. Review the unavailable
            source workspaces before deciding that no action is required.
          </p>
        ) : null}
        <div className="mt-3">
          {isPartialResponse ? (
            <>
              <SourceObservationList sources={unavailableSources} />
              {availableSources.length > 0 ? (
                <details className="mt-2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 [&::-webkit-details-marker]:hidden">
                    Show {availableSources.length} available source
                    {availableSources.length === 1 ? "" : "s"}
                  </summary>
                  <SourceObservationList sources={availableSources} />
                </details>
              ) : null}
            </>
          ) : (
            <SourceObservationList sources={availableSources} />
          )}
        </div>
      </div>
    </details>
  );
}

function chartToneClass(tone: DashboardMetric["tone"] | "warning") {
  if (tone === "success") {
    return "bg-emerald-500";
  }
  if (tone === "warning") {
    return "bg-amber-500";
  }
  if (tone === "info") {
    return "bg-blue-600";
  }
  return "bg-slate-400";
}

function parseDisplayNumber(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function AnalyticsBarPanel({
  title,
  detail,
  rows
}: {
  title: string;
  detail: string;
  rows: Array<{
    href?: string;
    label: string;
    value: number;
    detail: string;
    tone: DashboardMetric["tone"] | "warning";
  }>;
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="text-sm text-slate-500">{detail}</p>
      </div>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyDashboardState
            title="No chart data yet"
            detail="This chart will populate when matching source records are visible in the selected scope."
          />
        </div>
      ) : (
        <div className="grid gap-4 p-4">
          {rows.map((row) => {
            const width = `${Math.max((row.value / maxValue) * 100, row.value > 0 ? 8 : 2)}%`;
            const content = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-950">{row.label}</p>
                    <p className="text-xs text-slate-500">{row.detail}</p>
                  </div>
                  <p className="text-lg font-bold text-slate-950">{row.value}</p>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${chartToneClass(row.tone)}`}
                    style={{ width }}
                  />
                </div>
              </>
            );

            return row.href ? (
              <a
                key={row.label}
                className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                href={row.href}
              >
                {content}
              </a>
            ) : (
              <div
                key={row.label}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AnalyticsDonutPanel({
  approvals,
  exceptions,
  isPartial
}: {
  approvals: number | null;
  exceptions: number;
  isPartial: boolean;
}) {
  const knownApprovals = approvals ?? 0;
  const total = knownApprovals + exceptions;
  const approvalDegrees = total > 0 ? (knownApprovals / total) * 360 : 0;
  const background =
    total > 0
      ? `conic-gradient(#2563eb 0deg ${approvalDegrees}deg, #f59e0b ${approvalDegrees}deg 360deg)`
      : "conic-gradient(#e2e8f0 0deg 360deg)";

  return (
    <section className="ogfi-data-surface">
      <div className="border-b border-slate-100 p-4">
        <h2 className="text-lg font-bold text-slate-950">Attention Split</h2>
        <p className="text-sm text-slate-500">
          Approval alerts compared with operational exception alerts.
        </p>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-[16rem_1fr] md:items-center">
        <div className="mx-auto grid h-52 w-52 place-items-center rounded-full p-5" style={{ background }}>
          <div className="grid h-36 w-36 place-items-center rounded-full bg-white text-center shadow-inner">
            <div>
              <p className="text-3xl font-bold text-slate-950">{total}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isPartial ? "shown alerts" : "known alerts"}
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-blue-950">Approval alerts</p>
              <p className="text-2xl font-bold text-blue-700">
                {approvals === null ? "Unavailable" : approvals}
              </p>
            </div>
            <p className="mt-1 text-sm text-blue-900/70">
              {approvals === null
                ? "Use Approval Inbox while its controlled routing transition is active."
                : "Decisions assigned to the logged-in user and visible scope."}
            </p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-amber-950">Exception alerts</p>
              <p className="text-2xl font-bold text-amber-700">{exceptions}</p>
            </div>
            <p className="mt-1 text-sm text-amber-900/70">
              Overdue, variance, discrepancy, and ledger follow-ups.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardOverview({ dashboard }: { dashboard: DashboardData }) {
  const hasUnavailableSource = dashboardResponseIsPartial(dashboard);
  const approvalQueueIsPartial =
    dashboard.approvalQueueContract.completeness === "PARTIAL";
  const exceptionQueueIsPartial =
    dashboard.exceptionQueueContract.completeness === "PARTIAL";

  return (
    <>
      <section className="ogfi-data-surface mb-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Action first</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Today’s work</h2>
            <p className="mt-1 text-sm text-slate-500">
              A bounded priority preview of records assigned to you or requiring attention in the selected scope. Opened records recheck source-workspace access.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dashboard.approvalQueueContract.availability === "UNAVAILABLE" ? (
              <Badge tone="neutral" size="sm">Approval preview unavailable</Badge>
            ) : (
              <Badge tone="warning" size="sm">
                {queueCountLabel(dashboard.approvalQueueContract, "priority approvals")}
              </Badge>
            )}
            <Badge tone="warning" size="sm">
              {queueCountLabel(dashboard.exceptionQueueContract, "priority exceptions")}
            </Badge>
          </div>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-950">Assigned approvals</h3>
                <p className="text-sm text-slate-500">Only decisions you can act on are included.</p>
              </div>
              <ButtonLink href="/approvals" tone="secondary" className="min-h-10 text-blue-700 hover:bg-blue-50">
                Open approvals
              </ButtonLink>
            </div>
            {dashboard.approvalQueueContract.availability === "UNAVAILABLE" ? (
              <div className="p-4">
                <EmptyDashboardState
                  title="Approval preview is temporarily unavailable"
                  detail={dashboard.approvalQueueContract.unavailableDetail ?? "Use Approval Inbox for your controlled approval work."}
                  actionHref="/approvals"
                  actionLabel="Open Approval Inbox"
                />
              </div>
            ) : (
              <QueueList
                actionLabel="Review assigned approval"
                emptyDetail="Assigned approval decisions will appear here after controlled records are submitted."
                items={dashboard.approvalQueueContract.items}
                isPartial={approvalQueueIsPartial}
              />
            )}
          </section>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4">
              <h3 className="font-bold text-slate-950">Operational exceptions</h3>
              <p className="text-sm text-slate-500">Overdue, variance, discrepancy, and handoff risk in the selected scope.</p>
            </div>
            <QueueList
              actionLabel="Open source record"
              emptyDetail="Open exceptions are pulled from purchasing, receiving, transfers, counts, and inventory controls."
              items={dashboard.exceptionQueueContract.items}
              isPartial={exceptionQueueIsPartial}
            />
          </section>
        </div>
      </section>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="ogfi-data-surface">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Operational Indicators</h2>
              <p className="text-sm text-slate-500">
                Counts and exceptions from purchasing, receiving, stock controls, and restaurant operations
              </p>
            </div>
            <Badge tone={hasUnavailableSource ? "warning" : "info"} size="sm">
              {dashboard.cards.length} indicators
              {hasUnavailableSource ? " from available sources" : ""}
            </Badge>
          </div>
          {dashboard.cards.length === 0 ? (
            <div className="p-5">
              <p className="font-semibold text-slate-900">
                {hasUnavailableSource
                  ? "No operational indicators shown from available sources"
                  : "No operational widgets available"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {hasUnavailableSource
                  ? "This does not confirm there are no exceptions. Open the unavailable source workspaces in Dashboard source status."
                  : "Widgets appear after your role receives permission to view source records."}
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
                    <Badge tone={card.tone} size="sm">
                      {card.value > 0
                        ? "Action"
                        : hasUnavailableSource
                          ? "Zero in available sources"
                          : "No matching records"}
                    </Badge>
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
              Source-backed metrics and their authorized drill-downs
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

    </>
  );
}

function DashboardAnalytics({
  activePanel,
  dashboard
}: {
  activePanel: AnalyticsPanel;
  dashboard: DashboardData;
}) {
  const analyticsMetrics = [...dashboard.metrics, ...dashboard.stockHealth];
  const stockRows = dashboard.stockHealth.map((metric) => ({
    label: metric.label,
    value: parseDisplayNumber(metric.displayValue),
    detail: metric.detail,
    tone: metric.tone,
    ...(metric.href ? { href: metric.href } : {})
  }));
  const exceptionRows = dashboard.cards.map((card) => ({
    href: card.href,
    label: card.label,
    value: card.value,
    detail: card.description,
    tone: card.tone
  }));
  const panelTabs: Array<{
    id: AnalyticsPanel;
    label: string;
    detail: string;
  }> = [
    {
      id: "risk",
      label: "Risk Mix",
      detail: "Open operational indicators"
    },
    {
      id: "stock",
      label: "Stock Health",
      detail: "Inventory coverage signals"
    },
    {
      id: "attention",
      label: "Attention Split",
      detail: "Approvals vs exceptions"
    },
    {
      id: "details",
      label: "Metric Details",
      detail: "Drill-down metric cards"
    }
  ];

  return (
    <div className="grid gap-5">
      <section className="ogfi-data-surface p-2">
        <div className="grid gap-2 md:grid-cols-4">
          {panelTabs.map((tab) => {
            const active = activePanel === tab.id;
            return (
              <a
                key={tab.id}
                className={
                  active
                    ? "rounded-xl bg-blue-50 px-4 py-3 text-blue-700 ring-1 ring-blue-100"
                    : "rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }
                href={analyticsPanelHref(tab.id)}
              >
                <span className="block text-sm font-bold">{tab.label}</span>
                <span className="mt-1 block text-xs text-slate-500">{tab.detail}</span>
              </a>
            );
          })}
        </div>
      </section>

      {activePanel === "risk" ? (
        <AnalyticsBarPanel
          title="Operational Risk Mix"
          detail="Visual comparison of open indicators across controlled workflows."
          rows={exceptionRows}
        />
      ) : null}

      {activePanel === "stock" ? (
        <AnalyticsBarPanel
          title="Stock Health Coverage"
          detail="Visual stock balance signals for the current location and authorized inventory scope."
          rows={stockRows}
        />
      ) : null}

      {activePanel === "attention" ? (
        <AnalyticsDonutPanel
          approvals={dashboard.approvalQueueContract.availability === "AVAILABLE" ? dashboard.approvalQueue.length : null}
          exceptions={dashboard.exceptionQueue.length}
          isPartial={dashboardResponseIsPartial(dashboard)}
        />
      ) : null}

      {activePanel === "details" ? (
      <section className="ogfi-data-surface">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Metric Details</h2>
            <p className="text-sm text-slate-500">
              Drill-down cards behind the visual charts above.
            </p>
          </div>
          <Badge tone="info" size="sm">{analyticsMetrics.length} metrics</Badge>
        </div>
        {analyticsMetrics.length === 0 ? (
          <div className="p-4">
            <EmptyDashboardState
              title="No analytics available yet"
              detail={
                dashboardResponseIsPartial(dashboard)
                  ? "No analytics are shown from the available sources. This does not confirm there are no matching records; review Dashboard source status."
                  : "Analytics appear after purchasing, receiving, inventory, or ledger source records are available to your role."
              }
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
      ) : null}
    </div>
  );
}

function DashboardReports({
  canOpenFoodCostAnalysis,
  dashboard
}: {
  canOpenFoodCostAnalysis: boolean;
  dashboard: DashboardData;
}) {
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
      title: "Receiving Follow-up",
      detail: "Unposted drafts, posting receipts, and active receiving discrepancies.",
      href: "/receiving?dashboard=receiving-follow-up-v1",
      available: dashboard.cards.some((card) => card.id === "receiving-follow-up")
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
      available: dashboard.approvalQueueContract.availability === "AVAILABLE"
    },
    ...(canOpenFoodCostAnalysis
      ? [
          {
            title: "Food Cost Analysis",
            detail:
              "Open the source workspace to review its current evidence and trust notices.",
            href: "/recipes/analysis",
            sourceWorkspace: true
          }
        ]
      : []),
    {
      title: "Branch Checklist Compliance",
      detail: "Opening and closing checklists, exception counts, completion, and source detail.",
      href: "/branch-operations",
      available: dashboard.cards.some((card) => card.id === "branch-checklist-exceptions")
    },
    {
      title: "Food Safety Exceptions",
      detail: "Temperature, sanitation, corrective action, and evidence reading source records.",
      href: "/food-safety",
      available: dashboard.cards.some((card) => card.id === "food-safety-exceptions")
    },
    {
      title: "Incident Corrective Actions",
      detail: "Open incidents, severity, due dates, source links, corrective actions, and evidence.",
      href: "/incidents",
      available: dashboard.cards.some((card) => card.id === "open-operational-incidents")
    },
    {
      title: "Maintenance SLA and Downtime",
      detail: "Maintenance tickets, equipment, SLA risk, downtime, corrective actions, and evidence.",
      href: "/maintenance",
      available: dashboard.cards.some((card) => card.id === "maintenance-follow-up")
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
                {report.title.includes("Safety") ? (
                  <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                ) : report.title.includes("Maintenance") ? (
                  <Wrench aria-hidden="true" className="h-5 w-5" />
                ) : report.title.includes("Food") || report.title.includes("Recipes") ? (
                  <Utensils aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <FileText aria-hidden="true" className="h-5 w-5" />
                )}
              </span>
              {"sourceWorkspace" in report ? (
                <span className="text-xs font-semibold text-slate-500">
                  Source workspace
                </span>
              ) : (
                <Badge tone={report.available ? "success" : "neutral"} size="sm">
                  {report.available ? "Data available" : "Ready"}
                </Badge>
              )}
            </div>
            <h3 className="mt-4 font-bold text-slate-950">{report.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{report.detail}</p>
            <p className="mt-4 text-sm font-bold text-blue-700">
              {"sourceWorkspace" in report ? "Open source" : "Open report source"}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
}

function DashboardNotifications({ dashboard }: { dashboard: DashboardData }) {
  const notificationItems = [
    ...dashboard.approvalQueueContract.items,
    ...dashboard.exceptionQueueContract.items
  ];
  const isPartialResponse = dashboardResponseIsPartial(dashboard);
  const approvalQueueIsPartial =
    dashboard.approvalQueueContract.completeness === "PARTIAL";
  const exceptionQueueIsPartial =
    dashboard.exceptionQueueContract.completeness === "PARTIAL";

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
              title={
                isPartialResponse
                  ? "No notifications shown from available sources"
                  : "No dashboard notifications right now"
              }
              detail={
                isPartialResponse
                  ? "This does not confirm there are no alerts. Review Dashboard source status and open the unavailable source workspaces."
                  : "Approval assignments, overdue POs, receiving discrepancies, transfer disputes, stock count variances, wastage exceptions, and ledger variances will appear here."
              }
              actionHref="/notifications"
              actionLabel="View Notification Center"
            />
          </div>
        ) : (
          <QueueList
            actionLabel="Open source record"
            emptyDetail="No dashboard notifications right now."
            items={notificationItems}
            isPartial={isPartialResponse}
          />
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Panel className="ogfi-detail-card">
          <div className="flex items-center gap-3">
            <Bell aria-hidden="true" className="h-5 w-5 text-blue-700" />
            <p className="text-sm font-semibold text-slate-500">
              {approvalQueueIsPartial
                ? "Approval alerts from available sources"
                : "Approval alerts"}
            </p>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.approvalQueueContract.availability === "UNAVAILABLE"
              ? "Unavailable"
              : `${dashboard.approvalQueue.length}${approvalQueueIsPartial ? " shown" : ""}`}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <div className="flex items-center gap-3">
            <AlertTriangle aria-hidden="true" className="h-5 w-5 text-amber-700" />
            <p className="text-sm font-semibold text-slate-500">
              {exceptionQueueIsPartial
                ? "Exception alerts from available sources"
                : "Exception alerts"}
            </p>
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.exceptionQueue.length}
            {exceptionQueueIsPartial ? " shown" : ""}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <div className="flex items-center gap-3">
            <ClipboardCheck aria-hidden="true" className="h-5 w-5 text-emerald-700" />
            <p className="text-sm font-semibold text-slate-500">
              {isPartialResponse
                ? "Zero-value indicators from available sources"
                : "Indicators with no matching records"}
            </p>
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
  const activeAnalyticsPanel = normalizeAnalyticsPanel(getSearchParam(params, "panel"));
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
        <div className="p-5">
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
              <Badge tone="info" size="sm">
                Dashboard assembled {formatDashboardCheckedAt(dashboard.assembledAt)}
              </Badge>
            </div>
          </div>
        </div>
        <SourceObservationDisclosure dashboard={dashboard} />
      </section>

      {activeView === "overview" ? <DashboardOverview dashboard={dashboard} /> : null}
      {activeView === "analytics" ? (
        <DashboardAnalytics
          activePanel={activeAnalyticsPanel}
          dashboard={dashboard}
        />
      ) : null}
      {activeView === "reports" ? (
        <DashboardReports
          canOpenFoodCostAnalysis={canUseRecipesAndCosting(session.permissionCodes)}
          dashboard={dashboard}
        />
      ) : null}
      {activeView === "notifications" ? (
        <DashboardNotifications dashboard={dashboard} />
      ) : null}
    </AppShell>
  );
}
