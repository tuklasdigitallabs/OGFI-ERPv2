import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  ClipboardCheck,
  Database,
  FileText,
  ShieldCheck,
  TriangleAlert,
  Utensils,
  Wrench
} from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import {
  DashboardOverviewAccordion,
  type DashboardOverviewAccordionSection
} from "@/components/DashboardOverviewAccordion";
import {
  canUseRecipesAndCosting,
  permissions,
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  getOperationalDashboard,
  type DashboardCard,
  type DashboardMetric,
  type DashboardQueueItem,
  type DashboardSourceId,
  type DashboardSourceObservation
} from "@/server/services/dashboard";
import { branchOperationsDashboardProfileHref } from "@/server/services/branchOperations";
import { foodSafetyDashboardProfileHref } from "@/server/services/foodSafety";
import { incidentDashboardProfileHref } from "@/server/services/incidents";
import { maintenanceDashboardProfileHref } from "@/server/services/maintenance";
import { receivingDashboardProfileHref } from "@/server/services/receiving";
import { stockAdjustmentDashboardProfileHref } from "@/server/services/stockAdjustments";
import { transferDashboardProfileHref } from "@/server/services/transfers";
import { wastageDashboardProfileHref } from "@/server/services/wastage";
import { formatDashboardCheckedAt } from "./sourceObservation";

export const dynamic = "force-dynamic";

const metricIcons = {
  "low-stock": AlertTriangle,
  "stocked-items": Boxes,
  "active-stock-rows": Boxes,
  "zero-stock-rows": AlertTriangle,
  "lot-expiry-data": Database,
  "sales-source": BarChart3
};

const dashboardViews = ["overview", "analytics", "reports", "notifications"] as const;
type DashboardView = (typeof dashboardViews)[number];
const dashboardViewLabels: Record<DashboardView, string> = {
  overview: "Overview",
  analytics: "Analytics",
  reports: "Source views",
  notifications: "Notifications"
};
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

const dashboardIndicatorPriority = {
  approver: [
    "pending-approvals",
    "wastage-exceptions",
    "adjustment-exceptions",
    "branch-checklist-reviews",
    "food-safety-reviews",
  ],
  branch: [
    "transfer-follow-up",
    "receiving-follow-up",
    "wastage-exceptions",
    "branch-checklist-exceptions",
    "food-safety-exceptions",
    "maintenance-follow-up",
  ],
  operations: [
    "branch-checklist-exceptions",
    "food-safety-exceptions",
    "open-operational-incidents",
    "maintenance-follow-up",
    "wastage-exceptions",
    "transfer-follow-up",
  ],
  purchasing: [
    "open-purchase-requests",
    "open-purchase-orders",
    "receiving-follow-up",
    "pending-approvals",
    "transfer-follow-up",
    "wastage-exceptions",
  ],
  warehouse: [
    "receiving-follow-up",
    "transfer-follow-up",
    "adjustment-exceptions",
    "ledger-reconciliation",
    "wastage-exceptions",
    "open-purchase-orders",
  ],
} as const;

function dashboardIndicatorOrder(role: string, permissionCodes: string[]) {
  const normalizedRole = role.toLowerCase();
  const profiles: Array<readonly string[]> = [];
  const hasAny = (...codes: string[]) =>
    codes.some((code) => permissionCodes.includes(code));

  if (
    hasAny(
      permissions.purchaseRequestApprove,
      permissions.quoteApprove,
      permissions.purchaseOrderApprove,
      permissions.transferApprove,
      permissions.wastageApprove,
      permissions.stockAdjustmentApprove,
      permissions.stockCountReview,
    )
  ) {
    profiles.push(dashboardIndicatorPriority.approver);
  }
  if (
    hasAny(
      permissions.purchaseRequestCreate,
      permissions.purchaseRequestSubmit,
      permissions.quoteManage,
      permissions.purchaseOrderCreate,
      permissions.purchaseOrderIssue,
    )
  ) {
    profiles.push(dashboardIndicatorPriority.purchasing);
  }
  if (
    hasAny(
      permissions.receivingCreate,
      permissions.receivingPost,
      permissions.transferDispatch,
      permissions.transferReceive,
      permissions.stockCountEnter,
    )
  ) {
    profiles.push(dashboardIndicatorPriority.warehouse);
  }
  if (
    hasAny(
      permissions.branchOperationsView,
      permissions.foodSafetyView,
      permissions.incidentView,
      permissions.maintenanceView,
    )
  ) {
    profiles.push(dashboardIndicatorPriority.operations);
  }

  if (profiles.length === 0) {
    if (normalizedRole.includes("purchas")) {
      profiles.push(dashboardIndicatorPriority.purchasing);
    } else if (
      normalizedRole.includes("warehouse") ||
      normalizedRole.includes("storekeeper")
    ) {
      profiles.push(dashboardIndicatorPriority.warehouse);
    } else if (normalizedRole.includes("branch")) {
      profiles.push(dashboardIndicatorPriority.branch);
    } else if (normalizedRole.includes("approver")) {
      profiles.push(dashboardIndicatorPriority.approver);
    } else if (normalizedRole.includes("operations")) {
      profiles.push(dashboardIndicatorPriority.operations);
    }
  }

  profiles.push([
    "pending-approvals",
    "open-purchase-requests",
    "open-purchase-orders",
    "receiving-follow-up",
    "transfer-follow-up",
    "ledger-reconciliation",
  ]);
  return Array.from(new Set(profiles.flat()));
}

function roleAwareIndicators(
  cards: DashboardCard[],
  role: string,
  permissionCodes: string[],
) {
  const preferredOrder = dashboardIndicatorOrder(role, permissionCodes);
  const preferredRank = new Map<string, number>(
    preferredOrder.map((id, index) => [id, index]),
  );

  return [...cards]
    .sort((left, right) => {
      if ((left.value > 0) !== (right.value > 0)) return left.value > 0 ? -1 : 1;
      const leftRank = preferredRank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = preferredRank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.label.localeCompare(right.label);
    })
    .slice(0, 6);
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = metricIcons[metric.id as keyof typeof metricIcons] ?? BarChart3;
  const hasExactProfile = metric.href?.includes("dashboard=") ?? false;
  const body = (
    <Panel className="ogfi-metric-card h-full p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {metric.label}
          </p>
          <p
            className={
              metric.id === "dashboard-trust-gate"
                ? "mt-2 text-lg font-bold leading-6 text-slate-950"
                : "mt-2 truncate text-2xl font-bold text-slate-950"
            }
          >
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
          {metric.id === "dashboard-trust-gate"
            ? "Read-only policy status"
            : hasExactProfile
            ? "Exact profile"
            : metric.href
              ? "Drill-down ready"
              : "Source pending"}
        </Badge>
        {metric.href ? (
          <span className="text-xs font-semibold text-blue-700">
            {hasExactProfile ? "View matching records" : "Open source"}
          </span>
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
            ? "This is a partial preview, so it is not confirmation that no work is waiting. Open the affected source workspace in Dashboard source status."
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
          className="grid min-w-0 gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div className="min-w-0">
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
            <div className="mt-1 flex min-w-0 flex-col gap-1 lg:flex-row lg:items-baseline lg:gap-3">
              <h3 className="break-words font-bold text-slate-950">
                {item.reference}
              </h3>
              <p className="break-words text-sm leading-5 text-slate-600">
                {item.detail}
              </p>
            </div>
            <dl className="mt-2 grid min-w-0 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0">
                <dt className="inline font-semibold">Location: </dt>
                <dd className="inline break-words">{item.locationName}</dd>
              </div>
              <div className="min-w-0">
                <dt className="inline font-semibold">Owner: </dt>
                <dd className="inline break-words">{item.ownerLabel}</dd>
              </div>
              <div className="min-w-0">
                <dt className="inline font-semibold">Timing: </dt>
                <dd className="inline break-words">{item.ageLabel}</dd>
              </div>
              <div className="min-w-0">
                <dt className="inline font-semibold">Next: </dt>
                <dd className="inline break-words">
                  {item.nextAction ?? actionLabel}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="sr-only">Next assigned actor</dt>
                <dd className="inline break-words">
                  Assigned to: {item.nextActor}
                </dd>
              </div>
            </dl>
          </div>
          <ButtonLink
            href={item.href}
            tone="secondary"
            className="min-h-11 shrink-0 justify-center text-blue-700 hover:bg-blue-50"
          >
            Open
          </ButtonLink>
        </div>
      ))}
    </div>
  );
}

function OverviewQueuePreview({
  actionLabel,
  contract,
  emptyDetail,
  sourceHref,
  sourceLabel,
}: {
  actionLabel: string;
  contract: DashboardData["approvalQueueContract"];
  emptyDetail: string;
  sourceHref?: string;
  sourceLabel?: string;
}) {
  if (contract.items.length === 0) {
    return (
      <div className="p-4">
        <EmptyDashboardState
          title={
            contract.completeness === "PARTIAL"
              ? "No records shown from available sources"
              : "Nothing waiting right now"
          }
          detail={
            contract.completeness === "PARTIAL"
              ? "This partial preview does not confirm there is no work. Review Dashboard source status and the affected source workspaces."
              : emptyDetail
          }
          {...(sourceHref && sourceLabel
            ? { actionHref: sourceHref, actionLabel: sourceLabel }
            : {})}
        />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold text-slate-950">
            {queueCountLabel(contract, "records")}
          </p>
          <p className="text-xs leading-5 text-slate-500">
            Ordered by operational priority. Open a record for its authoritative
            detail and action controls.
          </p>
        </div>
        {sourceHref && sourceLabel ? (
          <ButtonLink
            className="min-h-10 shrink-0 justify-center text-blue-700 hover:bg-blue-50"
            href={sourceHref}
            tone="secondary"
          >
            {sourceLabel}
          </ButtonLink>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {contract.items.map((item) => (
          <article
            className="group grid min-w-0 gap-3 border-b border-slate-100 px-4 py-4 transition-colors last:border-b-0 hover:bg-blue-50/40 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)_auto] lg:items-center"
            key={item.id}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  size="sm"
                  tone={item.priority === "CRITICAL" ? "danger" : "warning"}
                >
                  {item.severityLabel || item.priority}
                </Badge>
                <Badge size="sm" tone={item.tone}>
                  {item.status.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="mt-2 text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">
                {item.label}
              </p>
              <h3 className="mt-0.5 break-words text-base font-bold text-slate-950">
                {item.reference}
              </h3>
            </div>
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm leading-5 text-slate-600">
                {item.detail}
              </p>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <div className="min-w-0">
                  <dt className="inline font-bold text-slate-400">Location: </dt>
                  <dd className="inline break-words">{item.locationName}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="inline font-bold text-slate-400">Timing: </dt>
                  <dd className="inline break-words">{item.ageLabel}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="inline font-bold text-slate-400">Owner: </dt>
                  <dd className="inline break-words">{item.ownerLabel}</dd>
                </div>
                {item.nextActor ? (
                  <div className="min-w-0">
                    <dt className="inline font-bold text-slate-400">Assigned: </dt>
                    <dd className="inline break-words">{item.nextActor}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-2 text-xs font-semibold text-slate-600">
                {item.nextAction ?? actionLabel}
              </p>
            </div>
            <div className="flex justify-end">
              <ButtonLink
                className="min-h-10 shrink-0 justify-center text-blue-700 group-hover:bg-blue-50"
                href={item.href}
                tone="secondary"
              >
                {actionLabel}
              </ButtonLink>
            </div>
          </article>
        ))}
      </div>
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
              <p className="mt-1 text-xs">
                {source.unavailableReason ?? (source.id === "approvals"
                  ? "The approval queue is unavailable. Pending work may still exist."
                  : "Source data was unavailable for this response.")}
              </p>
            ) : null}
          </div>
          {source.id === "approvals" && source.availability === "UNAVAILABLE" ? (
            <span className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-bold text-slate-500">
              Queue unavailable
            </span>
          ) : (
            <a
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              href={source.href}
            >
              Open source
            </a>
          )}
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

function AnalyticsQueueSummaryPanel({
  approvals,
  exceptions,
  approvalIsPartial,
  exceptionIsPartial,
}: {
  approvals: number | null;
  exceptions: number;
  approvalIsPartial: boolean;
  exceptionIsPartial: boolean;
}) {
  return (
    <section className="ogfi-data-surface">
      <div className="border-b border-slate-100 p-4">
        <h2 className="text-lg font-bold text-slate-950">Queue overview</h2>
        <p className="text-sm text-slate-500">
          Separate bounded previews. Approval decisions and operational
          exceptions use different record grains and are not added together.
        </p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-blue-950">Assigned approval preview</p>
            <p className="text-2xl font-bold text-blue-700">
              {approvals === null ? "Unavailable" : approvals}
            </p>
          </div>
          <p className="mt-1 text-sm text-blue-900/70">
            {approvals === null
              ? "Approval Inbox is unavailable. Pending work may still exist."
              : approvalIsPartial
                ? "Rows shown from the available approval source."
                : "Assigned decisions shown in this bounded preview."}
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-amber-950">
              Operational exception preview
            </p>
            <p className="text-2xl font-bold text-amber-700">{exceptions}</p>
          </div>
          <p className="mt-1 text-sm text-amber-900/70">
            {exceptionIsPartial
              ? "Rows shown from available operational sources."
              : "Overdue, discrepancy, variance, and handoff records shown in this bounded preview."}
          </p>
        </div>
      </div>
    </section>
  );
}

function DashboardOverview({
  contextKey,
  dashboard,
  permissionCodes,
  role,
}: {
  contextKey: string;
  dashboard: DashboardData;
  permissionCodes: string[];
  role: string;
}) {
  const hasUnavailableSource = dashboardResponseIsPartial(dashboard);
  const approvalQueueIsPartial =
    dashboard.approvalQueueContract.completeness === "PARTIAL";
  const exceptionQueueIsPartial =
    dashboard.exceptionQueueContract.completeness === "PARTIAL";
  const priorityIndicators = roleAwareIndicators(
    dashboard.cards,
    role,
    permissionCodes,
  );
  const approvalSource = dashboard.sourceObservations.find(
    (source) => source.id === "approvals"
  );
  const inventorySource = dashboard.sourceObservations.find(
    (source) => source.id === "inventory-balances"
  );
  const indicatorSourceIds = new Set<DashboardSourceId>([
    "approvals",
    "purchase-requests",
    "purchase-orders",
    "receiving",
    "transfers",
    "stock-counts",
    "wastage",
    "stock-adjustments",
    "inventory-reconciliation",
    "branch-operations",
    "food-safety",
    "incidents",
    "maintenance"
  ]);
  const hasIndicatorSource = dashboard.sourceObservations.some((source) =>
    indicatorSourceIds.has(source.id)
  );
  const approvalHasRows =
    dashboard.approvalQueueContract.availability === "AVAILABLE" &&
    dashboard.approvalQueueContract.items.length > 0;
  const exceptionHasRows = dashboard.exceptionQueueContract.items.length > 0;
  const criticalExceptionCount = dashboard.exceptionQueueContract.items.filter(
    (item) => item.priority === "CRITICAL"
  ).length;
  const highExceptionCount = dashboard.exceptionQueueContract.items.filter(
    (item) => item.priority === "HIGH"
  ).length;
  const hasPositiveIndicator = priorityIndicators.some((card) => card.value > 0);
  const positiveIndicatorCount = priorityIndicators.filter(
    (card) => card.value > 0,
  ).length;
  const topIndicator = priorityIndicators[0];
  const topException = dashboard.exceptionQueueContract.items[0];
  const sections: DashboardOverviewAccordionSection[] = [];

  const lowStockSource = dashboard.sourceObservations.find(source => source.id === "low-stock");
  if (lowStockSource) {
    const metric = dashboard.metrics.find(item => item.id === "low-stock");
    const available = lowStockSource.availability === "AVAILABLE" && Boolean(metric);
    sections.push({
      id: "low-stock", title: "Low-stock alerts",
      supportingText: "Configured thresholds for the selected branch or warehouse; live recorded on-hand across storage lots.",
      snapshots: [{ label: "Item/storage pairs", value: available ? metric!.displayValue : "Unavailable", tone: available ? metric!.tone : "warning" }],
      body: <div className="grid gap-3 p-4 lg:p-5">
        {available ? <><p>{metric!.displayValue} configured item/storage pairs are at or below their threshold.</p><p className="text-sm text-slate-600">Only configured items are monitored. Zero alerts does not confirm every item is stocked. A configured item without a balance is recorded as zero and needs initialization or reconciliation.</p></>
          : <p role="status">{lowStockSource.unavailableReason ?? "Low-stock details are unavailable in this context. No count or stock status is disclosed."}</p>}
        <ButtonLink href="/inventory/low-stock" tone="secondary">Review low stock and thresholds</ButtonLink>
      </div>,
    });
  }

  if (approvalSource) {
    const approvalUnavailable =
      dashboard.approvalQueueContract.availability === "UNAVAILABLE";
    sections.push({
      id: "assigned-approvals",
      title: "Assigned Approvals",
      supportingText: approvalUnavailable
        ? "The approval preview is unavailable; pending work may still exist."
        : approvalQueueIsPartial
          ? "Assigned decisions shown from the available approval source; additional work may still exist."
          : "Decisions assigned to you in the selected operating scope.",
      snapshots: approvalUnavailable
        ? [
            { label: "Queue", value: "Unavailable", tone: "warning" },
            { label: "Pending", value: "May still exist", tone: "warning" },
            { label: "Access", value: "Hardened UAT", tone: "neutral" },
          ]
        : [
            {
              label: "Assigned",
              value: String(dashboard.approvalQueueContract.displayedCount),
              tone: approvalHasRows ? "warning" : "success",
            },
            {
              label: "Highest priority",
              value:
                dashboard.approvalQueueContract.items[0]?.severityLabel ??
                "None waiting",
              tone: approvalHasRows ? "warning" : "neutral",
            },
            {
              label: "Coverage",
              value: approvalQueueIsPartial ? "Partial" : "Complete",
              tone: approvalQueueIsPartial ? "warning" : "success",
            },
          ],
      body: approvalUnavailable ? (
        <div className="p-4">
          <EmptyDashboardState
            title="Approval preview and queue are unavailable"
            detail={dashboard.approvalQueueContract.unavailableDetail ?? "Pending approval work may still exist. Follow your workflow owner's release guidance until the Approval Inbox is activated."}
          />
        </div>
      ) : (
        <OverviewQueuePreview
          actionLabel="Review"
          contract={dashboard.approvalQueueContract}
          emptyDetail="Assigned approval decisions will appear here after controlled records are submitted."
          sourceHref="/approvals"
          sourceLabel="Open Approval Inbox"
        />
      )
    });
  }

  if (dashboard.exceptionQueueContract.contributors.length > 0) {
    sections.push({
      id: "operational-exceptions",
      title: "Operational Exceptions",
      supportingText: exceptionQueueIsPartial
        ? "Exceptions shown from available sources; additional work may still exist."
        : "Overdue, discrepancy, variance, and handoff risk in the selected scope.",
      snapshots: [
        {
          label: "Preview shown",
          value: String(dashboard.exceptionQueueContract.displayedCount),
          tone: exceptionHasRows ? "warning" : "success",
        },
        {
          label: "Urgent in preview",
          value:
            criticalExceptionCount > 0
              ? `${criticalExceptionCount} critical`
              : highExceptionCount > 0
                ? `${highExceptionCount} high`
                : "No critical items",
          tone:
            criticalExceptionCount > 0
              ? "destructive"
              : highExceptionCount > 0
                ? "warning"
                : "success",
        },
        {
          label: "Next focus",
          value: topException?.label ?? "No exceptions",
          tone: topException ? "info" : "neutral",
        },
      ],
      body: (
        <OverviewQueuePreview
          actionLabel="Open"
          contract={dashboard.exceptionQueueContract}
          emptyDetail="Open exceptions are pulled from purchasing, receiving, transfers, counts, and inventory controls."
        />
      )
    });
  }

  if (hasIndicatorSource) {
    sections.push({
      id: "priority-indicators",
      title: "Priority Indicators",
      supportingText: hasUnavailableSource
        ? `Up to six source-backed indicators prioritized for ${role}; values use separate grains and may omit unavailable sources.`
        : `Up to six source-backed indicators prioritized for ${role}; values use separate grains and are not additive.`,
      snapshots: [
        {
          label: "Positive signals",
          value: String(positiveIndicatorCount),
          tone: hasPositiveIndicator ? "info" : "success",
        },
        {
          label: "Top signal",
          value: topIndicator
            ? `${topIndicator.label}: ${topIndicator.value}`
            : "No indicators",
          tone: topIndicator?.tone ?? "neutral",
        },
        {
          label: "Coverage",
          value: hasUnavailableSource ? "Available sources" : "All checked",
          tone: hasUnavailableSource ? "warning" : "success",
        },
      ],
      body: priorityIndicators.length === 0 ? (
        <div className="p-4">
          <EmptyDashboardState
            title={hasUnavailableSource ? "No indicators shown from available sources" : "No operational indicators available"}
            detail={hasUnavailableSource ? "This does not confirm there are no matching records. Review Dashboard source status and the unavailable source workspaces." : "Indicators appear after your role receives permission to view matching source records."}
          />
        </div>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 lg:p-5">
          {priorityIndicators.map((card) => (
            <a
              className="group min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
              href={card.href}
              key={card.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{card.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{card.description}</p>
                </div>
                <span className="text-2xl font-bold text-violet-700">{card.value}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <Badge tone={card.tone} size="sm">
                  {card.value > 0 ? "Matching records" : hasUnavailableSource ? "Zero in available sources" : "No matching records"}
                </Badge>
                <span className="text-xs font-bold text-violet-700">View source</span>
              </div>
            </a>
          ))}
        </div>
      )
    });
  }

  if (inventorySource) {
    const stockUnavailable = inventorySource.availability === "UNAVAILABLE";
    sections.push({
      id: "stock-balance-signals",
      title: "Stock Balance Signals",
      supportingText: stockUnavailable
        ? "The authorized stock source is unavailable; stock work may still exist."
        : "Approved balance-row measures for the selected location; values are not combined.",
      snapshots: stockUnavailable
        ? [
            { label: "Source", value: "Unavailable", tone: "warning" },
            { label: "Balance", value: "Not confirmed", tone: "warning" },
            { label: "Action", value: "Open Inventory", tone: "neutral" },
          ]
        : dashboard.stockHealth.slice(0, 3).map((metric) => ({
            label: metric.label,
            value: metric.displayValue,
            tone: metric.tone,
          })),
      body: stockUnavailable ? (
        <div className="p-4">
          <EmptyDashboardState
            title="Stock balance signals unavailable"
            detail="The stock source could not be read for this dashboard response. Open Inventory for the authoritative current records."
            actionHref={inventorySource.href}
            actionLabel="Open Inventory"
          />
        </div>
      ) : dashboard.stockHealth.length === 0 ? (
        <div className="p-4">
          <EmptyDashboardState
            title="No stock balance signals available"
            detail="No approved balance-row signal is available in the selected operating scope."
            actionHref={inventorySource.href}
            actionLabel="Open Inventory"
          />
        </div>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 lg:p-5">
          {dashboard.stockHealth.map((metric) => {
            const content = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{metric.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{metric.detail}</p>
                  </div>
                  <span className="text-2xl font-bold text-emerald-700">{metric.displayValue}</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Badge tone={metric.tone} size="sm">Balance-row signal</Badge>
                  {metric.href ? <span className="text-xs font-bold text-emerald-700">View inventory</span> : null}
                </div>
              </>
            );
            return metric.href ? (
              <a className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={metric.href} key={metric.id}>
                {content}
              </a>
            ) : (
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={metric.id}>
                {content}
              </div>
            );
          })}
        </div>
      )
    });
  }

  return (
    <DashboardOverviewAccordion
      key={`${contextKey}:${sections.map((section) => section.id).join("|")}`}
      sections={sections}
    />
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
      label: "Stock balance signals",
      detail: "Current balance-row signals"
    },
    {
      id: "attention",
      label: "Queue overview",
      detail: "Separate bounded previews",
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
          title="Stock balance signals"
          detail="Visual stock balance signals for the current location and authorized inventory scope."
          rows={stockRows}
        />
      ) : null}

      {activePanel === "attention" ? (
        <AnalyticsQueueSummaryPanel
          approvals={
            dashboard.approvalQueueContract.availability === "AVAILABLE"
              ? dashboard.approvalQueueContract.displayedCount
              : null
          }
          exceptions={dashboard.exceptionQueueContract.displayedCount}
          approvalIsPartial={
            dashboard.approvalQueueContract.completeness === "PARTIAL"
          }
          exceptionIsPartial={
            dashboard.exceptionQueueContract.completeness === "PARTIAL"
          }
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
  type Destination = {
    title: string;
    detail: string;
    href: string;
    kind: "EXACT_VIEW" | "SOURCE_WORKSPACE";
    source?: DashboardSourceObservation;
  };

  const sourceById = new Map(
    dashboard.sourceObservations.map((source) => [source.id, source])
  );
  const fromSource = (
    sourceId: DashboardSourceId,
    destination: Omit<Destination, "source">
  ): Destination[] => {
    const source = sourceById.get(sourceId);
    return source ? [{ ...destination, source }] : [];
  };

  const destinations: Destination[] = [
    ...fromSource("inventory-balances", {
      title: "Inventory Balances",
      detail: "Open the authorized inventory workspace for balance and ledger source records.",
      href: "/inventory",
      kind: "SOURCE_WORKSPACE"
    }),
    ...fromSource("purchase-orders", {
      title: "Purchase Orders",
      detail: "Open the authorized source workspace to review purchase-order records and status.",
      href: "/purchase-orders",
      kind: "SOURCE_WORKSPACE"
    }),
    ...fromSource("receiving", {
      title: "Receiving Follow-up",
      detail: "Unposted drafts, posting receipts, and active receiving discrepancies.",
      href: receivingDashboardProfileHref("receiving-follow-up-v1"),
      kind: "EXACT_VIEW"
    }),
    ...fromSource("transfers", {
      title: "Transfer Follow-up",
      detail: "Transfers awaiting dispatch, receipt, or discrepancy settlement.",
      href: transferDashboardProfileHref("transfer-follow-up-v1"),
      kind: "EXACT_VIEW"
    }),
    ...fromSource("wastage", {
      title: "Wastage Exceptions",
      detail: "Wastage records requiring controlled review, posting, correction, or reversal.",
      href: wastageDashboardProfileHref("wastage-exceptions-v1"),
      kind: "EXACT_VIEW"
    }),
    ...fromSource("stock-adjustments", {
      title: "Stock Adjustment Exceptions",
      detail: "Stock adjustments requiring controlled review, posting, correction, or reversal.",
      href: stockAdjustmentDashboardProfileHref("stock-adjustment-exceptions-v1"),
      kind: "EXACT_VIEW"
    }),
    ...(dashboard.approvalQueueContract.availability !== "UNAVAILABLE"
      ? fromSource("approvals", {
          title: "Approval Inbox",
          detail: "Open the authorized approval source workspace for the selected scope.",
          href: "/approvals",
          kind: "SOURCE_WORKSPACE"
        })
      : []),
    ...(canOpenFoodCostAnalysis
      ? [{
          title: "Food Cost Analysis Source",
          detail: "Review the source workspace, its current evidence, and its trust notices.",
          href: "/recipes/analysis",
          kind: "SOURCE_WORKSPACE" as const
        }]
      : []),
    ...fromSource("branch-operations", {
      title: "Branch Checklist Exceptions",
      detail: "Checklist exception records across opening and closing operational logs.",
      href: branchOperationsDashboardProfileHref("branch-checklist-exceptions-v1"),
      kind: "EXACT_VIEW"
    }),
    ...fromSource("food-safety", {
      title: "Food Safety Exceptions",
      detail: "Exception readings and their affected Food Safety logs.",
      href: foodSafetyDashboardProfileHref("food-safety-exceptions-v1"),
      kind: "EXACT_VIEW"
    }),
    ...fromSource("incidents", {
      title: "Open Incidents",
      detail: "Incident records that remain open in the selected operating scope.",
      href: incidentDashboardProfileHref("incident-open-v1"),
      kind: "EXACT_VIEW"
    }),
    ...fromSource("maintenance", {
      title: "Maintenance Follow-up",
      detail: "Active maintenance tickets requiring operational follow-up.",
      href: maintenanceDashboardProfileHref("maintenance-follow-up-v1"),
      kind: "EXACT_VIEW"
    })
  ];
  const groups = [
    {
      title: "Exact operational views",
      detail: "Versioned, read-only populations that preserve the selected operating scope.",
      destinations: destinations.filter((destination) => destination.kind === "EXACT_VIEW")
    },
    {
      title: "Source workspaces",
      detail: "Authorized source modules without an implied report or record population.",
      destinations: destinations.filter((destination) => destination.kind === "SOURCE_WORKSPACE")
    }
  ].filter((group) => group.destinations.length > 0);

  return (
    <section className="ogfi-data-surface">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Operational source views</h2>
          <p className="text-sm text-slate-500">
            Open exact scoped populations or their authoritative source workspaces.
          </p>
        </div>
        <Badge tone="info" size="sm">{destinations.length} destinations</Badge>
      </div>
      <div className="grid gap-6 p-4">
        {groups.length === 0 ? (
          <EmptyDashboardState
            title="No source destinations available"
            detail="No operational source view is enrolled for your current role and selected scope."
          />
        ) : groups.map((group) => (
          <section key={group.title} aria-labelledby={`source-view-${group.title.replaceAll(" ", "-").toLowerCase()}`}>
            <h3 id={`source-view-${group.title.replaceAll(" ", "-").toLowerCase()}`} className="font-bold text-slate-950">{group.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{group.detail}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.destinations.map((destination) => (
                <a
                  key={destination.title}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  href={destination.href}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                      {destination.title.includes("Safety") ? (
                        <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                      ) : destination.title.includes("Maintenance") ? (
                        <Wrench aria-hidden="true" className="h-5 w-5" />
                      ) : destination.title.includes("Food") ? (
                        <Utensils aria-hidden="true" className="h-5 w-5" />
                      ) : (
                        <FileText aria-hidden="true" className="h-5 w-5" />
                      )}
                    </span>
                    <Badge tone="neutral" size="sm">
                      {destination.kind === "EXACT_VIEW" ? "Exact scoped view" : "Source workspace"}
                    </Badge>
                  </div>
                  <h4 className="mt-4 font-bold text-slate-950">{destination.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{destination.detail}</p>
                  {destination.source ? (
                    <p className={`mt-3 text-xs font-semibold ${destination.source.availability === "AVAILABLE" ? "text-emerald-700" : "text-amber-700"}`}>
                      Dashboard source {destination.source.availability === "AVAILABLE" ? "available" : "unavailable"}
                    </p>
                  ) : null}
                  <p className="mt-4 text-sm font-bold text-blue-700">
                    {destination.kind === "EXACT_VIEW" ? "Open exact view" : "Open source workspace"}
                  </p>
                </a>
              ))}
            </div>
          </section>
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
  const overviewControlStatuses = dashboard.sourceHealth.filter((metric) =>
    ["dashboard-trust-gate", "ledger-reconciliation-blocked"].includes(
      metric.id,
    ),
  );

  return (
    <AppShell
      session={session}
      title="Company Overview"
      subtitle="Operational performance, stock health, and control exceptions"
      activeNav="dashboard"
    >
      <section className="mb-4 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Building2 aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Selected operating scope
              </p>
              <p className="break-words font-bold text-slate-950">
                {dashboard.scope.locationName}
              </p>
              <p className="break-words text-xs text-slate-500">
                {dashboard.scope.companyName} / {dashboard.scope.brandName} /{" "}
                {dashboard.scope.locationType} · {session.user.role}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
            <Badge tone="info" size="sm">
              Dashboard assembled{" "}
              {formatDashboardCheckedAt(dashboard.assembledAt)}
            </Badge>
            {overviewControlStatuses.map((metric) => {
              const status = (
                <Badge tone={metric.tone} size="sm">
                  {metric.label}: {metric.displayValue}
                </Badge>
              );
              return metric.href ? (
                <a
                  key={metric.id}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  href={metric.href}
                >
                  {status}
                </a>
              ) : (
                <span key={metric.id}>{status}</span>
              );
            })}
          </div>
        </div>
        <nav
          aria-label="Dashboard views"
          className="border-t border-slate-100 px-3 py-2"
        >
          <div className="ogfi-tab-list">
            {dashboardViews.map((view) => (
              <a
                key={view}
                aria-current={activeView === view ? "page" : undefined}
                className={
                  activeView === view ? "ogfi-tab is-active" : "ogfi-tab"
                }
                href={dashboardViewHref(view)}
              >
                {dashboardViewLabels[view]}
              </a>
            ))}
          </div>
        </nav>
        <SourceObservationDisclosure dashboard={dashboard} />
      </section>

      {activeView === "overview" ? (
        <DashboardOverview
          contextKey={session.context.locationId}
          dashboard={dashboard}
          permissionCodes={session.permissionCodes}
          role={session.user.role}
        />
      ) : null}
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
