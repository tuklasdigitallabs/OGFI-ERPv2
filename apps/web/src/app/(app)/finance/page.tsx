import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  FileSearch,
  Landmark,
  LockKeyhole,
  ReceiptText,
  ShieldCheck
} from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  FinancePagination,
  getPaginationState
} from "@/components/FinancePagination";
import {
  canUseFinance,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportFinance } from "@/server/services/exportAuthorization";
import {
  createFiscalYearWithMonthlyPeriods,
  getFinanceFoundationDashboard,
  openAccountingPeriod,
  openFiscalYear
} from "@/server/services/finance";

export const dynamic = "force-dynamic";

const metricIcons = {
  "open-commitments": ReceiptText,
  "received-value": BadgeCheck,
  "ready-for-invoice": FileSearch,
  "discrepancy-review": AlertTriangle
};

const matchTone = {
  READY_FOR_INVOICE: "success",
  PARTIAL_RECEIPT: "info",
  DISCREPANCY_REVIEW: "warning",
  AWAITING_RECEIPT: "neutral"
} as const;

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila"
  }).format(new Date(value));
}

function parseDateField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return new Date(`${value}T00:00:00.000Z`);
}

async function runFiscalYearCreateAction(formData: FormData) {
  "use server";
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  await createFiscalYearWithMonthlyPeriods(session, {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    startDate: parseDateField(formData, "startDate"),
    endDate: parseDateField(formData, "endDate"),
    isDefault: formData.get("isDefault") === "on",
    openFirstPeriod: formData.get("openFirstPeriod") === "on",
    reason: String(formData.get("reason") ?? "")
  });
  revalidatePath("/finance");
}

async function runFiscalYearOpenAction(formData: FormData) {
  "use server";
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  await openFiscalYear(session, {
    fiscalYearId: String(formData.get("fiscalYearId") ?? ""),
    reason: String(formData.get("reason") ?? "")
  });
  revalidatePath("/finance");
}

async function runAccountingPeriodOpenAction(formData: FormData) {
  "use server";
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  await openAccountingPeriod(session, {
    accountingPeriodId: String(formData.get("accountingPeriodId") ?? ""),
    reason: String(formData.get("reason") ?? "")
  });
  revalidatePath("/finance");
}

type FinanceOverviewPageProps = {
  searchParams?: Promise<{ page?: string; tab?: string }>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default async function FinanceOverviewPage({
  searchParams
}: FinanceOverviewPageProps) {
  const resolvedSearchParams = await searchParams;
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseFinance(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboard = await getFinanceFoundationDashboard(session);
  const enabledControlCount = Object.values(dashboard.permissions).filter(Boolean).length;
  const canExportFinanceCsv = canExportFinance(session);
  const canConfigureFinance = dashboard.permissions.canConfigure;
  const tabs = [
    {
      id: "summary",
      label: "Summary",
      description: "Finance signals and current context.",
      count: dashboard.metrics.length
    },
    {
      id: "setup",
      label: "Accounting setup",
      description: "Periods, chart, and posting templates.",
      count: dashboard.configuration.postingRules.length
    },
    {
      id: "source-chain",
      label: "AP source chain",
      description: "PO and receiving basis for AP readiness.",
      count: dashboard.sourceChain.length
    },
    {
      id: "controls",
      label: "Controls",
      description: "Permissions, guardrails, and finance routes.",
      count: enabledControlCount
    }
  ];
  const activeTab = tabs.some((tab) => tab.id === resolvedSearchParams?.tab)
    ? String(resolvedSearchParams?.tab)
    : "summary";
  const sourceChainPagination = getPaginationState(
    dashboard.sourceChain.length,
    resolvedSearchParams?.page
  );
  const sourceChainRows = dashboard.sourceChain.slice(
    sourceChainPagination.startIndex,
    sourceChainPagination.endIndex
  );

  return (
    <AppShell
      session={session}
      title="Finance Control Center"
      subtitle="Phase 3 finance foundation, AP readiness, and accounting guardrails"
      activeNav="finance-overview"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Finance is source-linked and guarded.</strong> This workspace reads
              approved procurement and receiving records for accounting readiness without
              posting journals, releasing payments, or changing operational source records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Production finance use remains gated by posting rules, segregation-of-duties
              tests, UAT evidence, migration rehearsal, and owner signoff.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canExportFinanceCsv ? (
              <ButtonLink href="/finance/export" tone="secondary">
                Export Finance CSV
              </ButtonLink>
            ) : null}
            <span>Controlled build</span>
          </div>
        </div>
      </div>

      <nav
        aria-label="Finance control center sections"
        className="mb-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
      >
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                aria-current={selected ? "page" : undefined}
                className={cx(
                  "flex min-w-44 flex-col rounded-xl px-4 py-3 text-left transition",
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-50"
                )}
                href={`/finance?tab=${tab.id}`}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-bold">
                  {tab.label}
                  <span
                    className={cx(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      selected
                        ? "bg-white/20 text-white"
                        : "bg-blue-50 text-blue-700"
                    )}
                  >
                    {tab.count}
                  </span>
                </span>
                <span
                  className={cx(
                    "mt-1 text-xs leading-5",
                    selected
                      ? "text-blue-50"
                      : "text-slate-500"
                  )}
                >
                  {tab.description}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "summary" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">At a glance</h2>
            <p className="text-sm text-slate-500">
              Source-linked finance signals for the current posting context.
            </p>
          </div>
          <Badge tone="info">Operational summary</Badge>
        </div>
        <div className="grid divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
        {dashboard.metrics.map((metric) => {
          const Icon =
            metricIcons[metric.id as keyof typeof metricIcons] ?? Landmark;
          return (
            <div key={metric.id} className="min-w-0 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-1 truncate text-xl font-bold text-slate-950">
                    {metric.displayValue}
                  </p>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                {metric.detail}
              </p>
              <div className="mt-3">
                <Badge tone={metric.tone} size="sm">
                  Source-linked
                </Badge>
              </div>
            </div>
          );
        })}
        </div>
      </section>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "setup" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Accounting Setup
            </h2>
            <p className="text-sm text-slate-500">
              Configuration foundation for periods, chart of accounts, and future posting templates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">Posting disabled</Badge>
            <EntryModal
              title="Create Fiscal Year"
              triggerLabel="Create Fiscal Year"
              disabled={!canConfigureFinance}
            >
              <form action={runFiscalYearCreateAction} className="grid gap-5 pt-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Fiscal year code
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="code"
                      placeholder="FY2026"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Fiscal year name
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="name"
                      placeholder="Fiscal Year 2026"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Start date
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="startDate"
                      type="date"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    End date
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="endDate"
                      type="date"
                      required
                    />
                  </label>
                </div>
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
                    <input className="mt-1" name="isDefault" type="checkbox" />
                    <span>
                      Set as default fiscal year
                      <span className="block text-xs font-normal leading-5 text-slate-500">
                        Used as the primary finance setup year for dashboards and budget defaults.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
                    <input className="mt-1" name="openFirstPeriod" type="checkbox" />
                    <span>
                      Open first accounting period
                      <span className="block text-xs font-normal leading-5 text-slate-500">
                        Allows controlled postings into the first generated monthly period.
                      </span>
                    </span>
                  </label>
                </div>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Setup reason
                  <textarea
                    className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    name="reason"
                    placeholder="Initial finance setup for the company accounting calendar."
                    required
                  />
                </label>
                <button
                  className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                  type="submit"
                >
                  Create Fiscal Year
                </button>
              </form>
            </EntryModal>
          </div>
        </div>

        <div className="grid gap-5 p-4">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Default fiscal year
              </p>
              <p className="mt-1 font-bold text-slate-950">
                {dashboard.configuration.fiscalYear?.name ?? "Not configured"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Open periods
              </p>
              <p className="mt-1 font-bold text-slate-950">
                {dashboard.configuration.openPeriods.length}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Chart foundation
              </p>
              <p className="mt-1 font-bold text-slate-950">
                {dashboard.configuration.accountClassCount} classes /{" "}
                {dashboard.configuration.postingAccountCount} posting accounts
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="font-bold text-slate-950">Fiscal Years</h3>
                <p className="text-sm text-slate-500">
                  Accounting calendars and monthly period generation.
                </p>
              </div>
              <Badge tone="info" size="sm">
                {dashboard.configuration.fiscalYears.length} year
                {dashboard.configuration.fiscalYears.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Fiscal year</th>
                    <th className="px-4 py-3">Window</th>
                    <th className="px-4 py-3">Periods</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.configuration.fiscalYears.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6" colSpan={5}>
                        <p className="font-semibold text-slate-950">
                          No fiscal years configured yet
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Create a fiscal year to generate monthly accounting periods.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    dashboard.configuration.fiscalYears.map((year) => (
                      <tr key={year.id} className="align-top">
                        <td className="px-4 py-4">
                          <p className="font-bold text-slate-950">{year.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {year.code}
                            {year.isDefault ? " / Default" : ""}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {formatDate(year.startDate)} to {formatDate(year.endDate)}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-900">
                          {year.periodCount}
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            tone={year.status === "OPEN" ? "success" : "neutral"}
                            size="sm"
                          >
                            {year.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {year.status === "DRAFT" ? (
                            <EntryModal
                              title={`Open ${year.code}`}
                              triggerLabel="Open Year"
                              triggerClassName="border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                              disabled={!canConfigureFinance}
                            >
                              <form action={runFiscalYearOpenAction} className="grid gap-4 pt-5">
                                <input name="fiscalYearId" type="hidden" value={year.id} />
                                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                  Opening a fiscal year makes it eligible for controlled finance setup and period operations.
                                </p>
                                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                                  Reason
                                  <textarea
                                    className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    name="reason"
                                    required
                                  />
                                </label>
                                <button
                                  className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                                  type="submit"
                                >
                                  Open Fiscal Year
                                </button>
                              </form>
                            </EntryModal>
                          ) : (
                            <span className="text-xs font-semibold text-slate-500">
                              No action
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="font-bold text-slate-950">Accounting Periods</h3>
                <p className="text-sm text-slate-500">
                  Open only the periods ready for controlled posting.
                </p>
              </div>
              <Badge tone="info" size="sm">
                Latest {Math.min(dashboard.configuration.accountingPeriods.length, 24)}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Fiscal year</th>
                    <th className="px-4 py-3">Window</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.configuration.accountingPeriods.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6" colSpan={5}>
                        <p className="font-semibold text-slate-950">
                          No accounting periods yet
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Periods are generated when a fiscal year is created.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    dashboard.configuration.accountingPeriods.slice(0, 10).map((period) => (
                      <tr key={period.id} className="align-top">
                        <td className="px-4 py-4">
                          <p className="font-bold text-slate-950">{period.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {period.code} / Period {period.periodNumber}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {period.fiscalYearCode}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {formatDate(period.startDate)} to {formatDate(period.endDate)}
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            tone={
                              ["OPEN", "REOPENED"].includes(period.status)
                                ? "success"
                                : period.status === "FUTURE"
                                  ? "neutral"
                                  : "warning"
                            }
                            size="sm"
                          >
                            {period.status.replaceAll("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {period.status === "FUTURE" ? (
                            <EntryModal
                              title={`Open ${period.code}`}
                              triggerLabel="Open Period"
                              triggerClassName="border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                              disabled={!canConfigureFinance}
                            >
                              <form action={runAccountingPeriodOpenAction} className="grid gap-4 pt-5">
                                <input
                                  name="accountingPeriodId"
                                  type="hidden"
                                  value={period.id}
                                />
                                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                  Opening this period allows controlled finance posting into {period.name}.
                                </p>
                                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                                  Reason
                                  <textarea
                                    className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    name="reason"
                                    required
                                  />
                                </label>
                                <button
                                  className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                                  type="submit"
                                >
                                  Open Accounting Period
                                </button>
                              </form>
                            </EntryModal>
                          ) : (
                            <span className="text-xs font-semibold text-slate-500">
                              Controlled by close workflow
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {dashboard.configuration.accountingPeriods.length > 10 ? (
              <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                Showing latest 10 periods. Older periods remain controlled by fiscal-year and period-close records.
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="font-bold text-slate-950">Posting Templates</h3>
                <p className="text-sm text-slate-500">
                  Configuration templates only; automated posting remains disabled.
                </p>
              </div>
              <Badge tone="info" size="sm">
                {dashboard.configuration.postingRules.length} template
                {dashboard.configuration.postingRules.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Account maps</th>
                    <th className="px-4 py-3">Dimensions</th>
                    <th className="px-4 py-3">Execution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.configuration.postingRules.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6" colSpan={5}>
                        <p className="font-semibold text-slate-950">
                          No posting-rule templates configured
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Finance can view source chains, but journal behavior remains disabled.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    dashboard.configuration.postingRules.map((rule) => (
                      <tr key={rule.id}>
                        <td className="px-4 py-4">
                          <p className="font-bold text-slate-950">{rule.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{rule.code}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {rule.sourceType} / {rule.sourceEvent}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-900">
                          {rule.accountMapCount}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-900">
                          {rule.dimensionRequirementCount}
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            tone={rule.isExecutionEnabled ? "warning" : "success"}
                            size="sm"
                          >
                            {rule.isExecutionEnabled ? "Execution enabled" : "Execution off"}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <div
        className={cx(
          "mb-5 grid gap-4",
          activeTab === "source-chain"
            ? "lg:grid-cols-[1fr_24rem]"
            : activeTab === "controls"
              ? "lg:grid-cols-2"
              : "hidden"
        )}
      >
        <section
          className={cx(
            "ogfi-data-surface overflow-hidden",
            activeTab === "source-chain" ? "" : "hidden"
          )}
        >
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                AP Source Chain
              </h2>
              <p className="text-sm text-slate-500">
                Purchase order and receiving basis for future invoice matching.
              </p>
            </div>
            <Badge tone="info">
              {dashboard.sourceChain.length} source chain
              {dashboard.sourceChain.length === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">PO / Supplier</th>
                  <th className="px-5 py-3">PO Status</th>
                  <th className="px-5 py-3">PO Total</th>
                  <th className="px-5 py-3">Received Basis</th>
                  <th className="px-5 py-3">Finance Readiness</th>
                  <th className="px-5 py-3 text-right">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.sourceChain.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8">
                      <p className="font-semibold text-slate-950">
                        No AP source chains in this scope yet
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Approved/issued purchase orders and posted receiving records
                        will appear here before invoice matching and payment controls
                        are enabled.
                      </p>
                    </td>
                  </tr>
                ) : (
                  sourceChainRows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-950">
                          {row.purchaseOrderReference}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.supplierName}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone="neutral" size="sm">
                          {row.status.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {formatMoney(row.totalAmount, row.currencyCode)}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {formatMoney(row.receivedAmount, row.currencyCode)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.discrepancyCount} discrepancy flag
                          {row.discrepancyCount === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={matchTone[row.matchStatus]} size="sm">
                          {row.matchStatus.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <ButtonLink
                          href={row.sourceHref}
                          tone="secondary"
                          className="min-h-9 border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
                        >
                          Open PO
                        </ButtonLink>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <FinancePagination
            basePath="/finance"
            tab={activeTab}
            page={sourceChainPagination.page}
            totalPages={sourceChainPagination.totalPages}
            totalCount={dashboard.sourceChain.length}
            startIndex={sourceChainPagination.startIndex}
            endIndex={sourceChainPagination.endIndex}
          />
        </section>

        <aside
          className={cx(
            activeTab === "controls" ? "grid gap-4 lg:col-span-2 lg:grid-cols-2" : "hidden"
          )}
        >
          <Panel className="ogfi-detail-card">
            <div className="flex items-start gap-3">
              <span className="ogfi-icon-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                <LockKeyhole aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-950">Enabled Controls</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {enabledControlCount} of {Object.keys(dashboard.permissions).length}
                  {" "}finance permissions are active for your current role.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <ButtonLink
                href="/finance/general-ledger"
                tone={
                  session.permissionCodes.includes(permissions.financeLedgerView)
                    ? "secondary"
                    : "ghost"
                }
                className="min-h-10 justify-start"
              >
                General Ledger
              </ButtonLink>
              <ButtonLink
                href="/finance/accounts-payable"
                tone={
                  session.permissionCodes.includes(permissions.financePayablesView)
                    ? "secondary"
                    : "ghost"
                }
                className="min-h-10 justify-start"
              >
                Accounts Payable
              </ButtonLink>
              <ButtonLink
                href="/finance/bank-cash"
                tone={
                  session.permissionCodes.includes(
                    permissions.financeReconciliationView
                  )
                    ? "secondary"
                    : "ghost"
                }
                className="min-h-10 justify-start"
              >
                Bank & Cash
              </ButtonLink>
              <ButtonLink
                href="/finance/period-close"
                tone={
                  session.permissionCodes.includes(
                    permissions.financePeriodCloseManage
                  )
                    ? "secondary"
                    : "ghost"
                }
                className="min-h-10 justify-start"
              >
                Period Close
              </ButtonLink>
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <div className="flex items-start gap-3">
              <span className="ogfi-icon-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                <ShieldCheck aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-950">Guardrails</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  These controls must stay visible until finance posting and release
                  workflows pass UAT.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {dashboard.guardrails.map((guardrail) => (
                <div
                  key={guardrail.label}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950">
                      {guardrail.label}
                    </p>
                    <Badge tone={guardrail.tone} size="sm">
                      Required
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {guardrail.detail}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
