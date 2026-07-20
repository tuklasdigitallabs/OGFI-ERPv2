import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  ClipboardList,
  Gauge,
  LockKeyhole,
  ReceiptText
} from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
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
import {
  activateBudget,
  approveBudget,
  approveBudgetRevision,
  archiveBudget,
  cancelBudget,
  cancelBudgetRevision,
  closeBudget,
  createDraftBudget,
  createDraftBudgetRevision,
  getBudgetControlDashboard,
  rejectBudget,
  rejectBudgetRevision,
  returnBudgetForRevision,
  startBudgetReview,
  startBudgetRevisionReview,
  submitBudgetRevisionForReview,
  submitBudgetForReview
} from "@/server/services/budgetControl";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

type BudgetControlPageProps = {
  searchParams?: Promise<{ page?: string; tab?: string }>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const metricIcons = {
  "approved-budget": Gauge,
  "open-commitments": ReceiptText,
  "posted-actuals": Banknote,
  "budget-exceptions": AlertTriangle
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila"
  }).format(new Date(value));
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseDateField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  return new Date(`${value}T00:00:00.000Z`);
}

function optionalDateField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function parseNumberField(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replaceAll(",", "");
  return raw ? Number(raw) : Number.NaN;
}

function optionalNumberField(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replaceAll(",", "").trim();
  return raw ? Number(raw) : null;
}

const budgetActionLabels = {
  submit: "Submit",
  start_review: "Start Review",
  approve: "Approve",
  return: "Return",
  reject: "Reject",
  activate: "Activate",
  close: "Close",
  cancel: "Cancel",
  archive: "Archive"
} as const;

const budgetRevisionActionLabels = {
  submit: "Submit",
  start_review: "Start Review",
  approve: "Approve Request",
  reject: "Reject",
  cancel: "Cancel"
} as const;

function budgetStatusTone(status: string) {
  if (["APPROVED", "ACTIVE"].includes(status)) {
    return "success" as const;
  }
  if (["SUBMITTED", "UNDER_REVIEW", "RETURNED", "PARTIALLY_RELEASED"].includes(status)) {
    return "warning" as const;
  }
  if (["REJECTED", "CANCELLED", "ARCHIVED"].includes(status)) {
    return "destructive" as const;
  }
  return "info" as const;
}

async function runBudgetDraftAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const name = String(formData.get("name") ?? "").trim();
  const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const lineCode = String(formData.get("lineCode") ?? "").trim();
  const lineName = String(formData.get("lineName") ?? "").trim();
  const periodStartText = String(formData.get("periodStart") ?? "").trim();
  const periodEndText = String(formData.get("periodEnd") ?? "").trim();
  const periodStart = parseDateField(formData, "periodStart");
  const periodEnd = parseDateField(formData, "periodEnd");
  const amountPhp = parseNumberField(formData, "amountPhp");

  await createDraftBudget(session, {
    name,
    description: String(formData.get("description") ?? "").trim() || undefined,
    budgetType: String(formData.get("budgetType") ?? "").trim() || "OPERATING",
    fiscalYearId,
    locationId,
    ...(departmentId ? { departmentId } : {}),
    periodStart,
    periodEnd,
    accountId,
    lineCode,
    lineName,
    lineDescription:
      String(formData.get("lineDescription") ?? "").trim() || undefined,
    amountPhp,
    warningThresholdPct: optionalNumberField(formData, "warningThresholdPct") ?? 80,
    hardBlockPct: optionalNumberField(formData, "hardBlockPct"),
    reason: String(formData.get("reason") ?? "").trim(),
    evidenceReference:
      String(formData.get("evidenceReference") ?? "").trim() || undefined,
    idempotencyKey: [
      "budget-draft-ui",
      session.user.id,
      fiscalYearId,
      locationId,
      departmentId || "no-department",
      accountId,
      name,
      lineCode,
      periodStartText,
      periodEndText,
      amountPhp
    ].join(":")
  });

  revalidatePath("/finance/budget-control");
}

async function runBudgetLifecycleAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const budgetId = String(formData.get("budgetId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const input = {
    budgetId,
    idempotencyKey: `budget-ui:${budgetId}:${action}:${reason ?? "none"}:${evidenceReference ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "submit":
      await submitBudgetForReview(session, input);
      break;
    case "start_review":
      await startBudgetReview(session, input);
      break;
    case "approve":
      await approveBudget(session, input);
      break;
    case "return":
      await returnBudgetForRevision(session, input);
      break;
    case "reject":
      await rejectBudget(session, input);
      break;
    case "activate":
      await activateBudget(session, input);
      break;
    case "close":
      await closeBudget(session, input);
      break;
    case "cancel":
      await cancelBudget(session, input);
      break;
    case "archive":
      await archiveBudget(session, input);
      break;
    default:
      throw new Error("BUDGET_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/budget-control");
}

async function runBudgetRevisionDraftAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const budgetLineId = String(formData.get("budgetLineId") ?? "").trim();
  const revisionType = String(formData.get("revisionType") ?? "AMENDMENT") as
    | "AMENDMENT"
    | "REBASE"
    | "REALLOCATION";
  const proposedAmountPhp = parseNumberField(formData, "proposedAmountPhp");
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;

  await createDraftBudgetRevision(session, {
    budgetLineId,
    revisionType,
    proposedAmountPhp,
    effectiveFrom: optionalDateField(formData, "effectiveFrom"),
    effectiveTo: optionalDateField(formData, "effectiveTo"),
    reason,
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: [
      "budget-revision-draft-ui",
      session.user.id,
      budgetLineId,
      revisionType,
      proposedAmountPhp,
      reason
    ].join(":")
  });

  revalidatePath("/finance/budget-control");
}

async function runBudgetRevisionLifecycleAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const budgetRevisionId = String(formData.get("budgetRevisionId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const input = {
    budgetRevisionId,
    idempotencyKey: `budget-revision-ui:${budgetRevisionId}:${action}:${reason ?? "none"}:${evidenceReference ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "submit":
      await submitBudgetRevisionForReview(session, input);
      break;
    case "start_review":
      await startBudgetRevisionReview(session, input);
      break;
    case "approve":
      await approveBudgetRevision(session, input);
      break;
    case "reject":
      await rejectBudgetRevision(session, input);
      break;
    case "cancel":
      await cancelBudgetRevision(session, input);
      break;
    default:
      throw new Error("BUDGET_REVISION_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/budget-control");
}

export default async function BudgetControlPage({
  searchParams
}: BudgetControlPageProps) {
  const resolvedSearchParams = await searchParams;
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (
    !canUseFinance(session.permissionCodes) ||
    !session.permissionCodes.includes(permissions.financeBudgetView)
  ) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboard = await getBudgetControlDashboard(session);
  const canCreateDraftBudget =
    dashboard.permissions.canManageBudget &&
    dashboard.budgetDraftOptions.fiscalYears.length > 0 &&
    dashboard.budgetDraftOptions.accounts.length > 0 &&
    dashboard.budgetDraftOptions.locations.length > 0;
  const canCreateDraftRevision =
    dashboard.permissions.canManageBudget &&
    dashboard.budgetDraftOptions.revisionLines.length > 0;
  const tabs = [
    {
      id: "lines",
      label: "Budget lines",
      description: "Approved lines, commitments, actuals, and remaining balance.",
      count: dashboard.lines.length
    },
    {
      id: "workflow",
      label: "Workflow",
      description: "Review, approve, activate, close, and archive budgets.",
      count: dashboard.budgets.length
    },
    {
      id: "revisions",
      label: "Revisions",
      description: "Budget amendment requests and decisions.",
      count: dashboard.revisions.length
    },
    {
      id: "entry",
      label: "New budget",
      description: "Create budgets and revision drafts."
    },
    {
      id: "reports",
      label: "Reports",
      description: "Budget utilization and source allocation readiness.",
      count: dashboard.metrics.length
    },
    {
      id: "controls",
      label: "Controls",
      description: "Source hook policy, permissions, and guardrails."
    }
  ];
  const activeTab = tabs.some((tab) => tab.id === resolvedSearchParams?.tab)
    ? String(resolvedSearchParams?.tab)
    : "lines";
  const paginate = <T,>(rows: T[]) => {
    const pagination = getPaginationState(rows.length, resolvedSearchParams?.page);
    return {
      pagination,
      rows: rows.slice(pagination.startIndex, pagination.endIndex)
    };
  };
  const pagedBudgetRows = paginate(dashboard.budgets);
  const pagedRevisionRows = paginate(dashboard.revisions);
  const pagedLineRows = paginate(dashboard.lines);
  const pagedCommitmentRows = paginate(dashboard.commitments);

  return (
    <AppShell
      session={session}
      title="Budget Control"
      subtitle="Budget vs commitment vs posted actual visibility"
      activeNav="budget-control"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Budget control is source-linked.</strong> Commitments track
              approved obligations while actuals come from posted finance journal
              lines only.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              This workspace does not approve POs, receive stock, release payments,
              post journals, or change source-record status.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              href="/finance/budget-control?tab=entry"
            >
              Create Budget
            </Link>
            <Badge tone="info">Warning-first policy</Badge>
          </div>
        </div>
      </div>

      <nav
        aria-label="Budget control sections"
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
                href={`/finance/budget-control?tab=${tab.id}`}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-bold">
                  {tab.label}
                  {tab.count != null ? (
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
                  ) : null}
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

      {activeTab === "entry" && dashboard.permissions.canManageBudget ? (
        <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Create Draft Budget
              </h2>
              <p className="text-sm text-slate-500">
                Create a PHP draft budget header with one starting line. Approval,
                revisions, and source hooks stay separate.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={canCreateDraftBudget ? "info" : "warning"}>
                Draft only
              </Badge>
              <EntryModal
                title="Create Draft Budget"
                triggerLabel="Create Draft Budget"
                disabled={!canCreateDraftBudget}
              >

          <form action={runBudgetDraftAction} className="grid gap-4 pt-5">
            {!canCreateDraftBudget ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Budget creation needs at least one open fiscal year, one posting
                account, and one authorized location.
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Budget name
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="name"
                  placeholder="July store operating budget"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Fiscal year
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="fiscalYearId"
                  defaultValue={dashboard.budgetDraftOptions.fiscalYears[0]?.id ?? ""}
                  required
                >
                  {dashboard.budgetDraftOptions.fiscalYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Location
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="locationId"
                  defaultValue={session.context.locationId}
                  required
                >
                  {dashboard.budgetDraftOptions.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Department
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="departmentId"
                  defaultValue=""
                >
                  <option value="">No department</option>
                  {dashboard.budgetDraftOptions.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Period start
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="periodStart"
                  type="date"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Period end
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="periodEnd"
                  type="date"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Budget type
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="budgetType"
                  defaultValue="OPERATING"
                >
                  <option value="OPERATING">Operating</option>
                  <option value="CAPEX">Capital expense</option>
                  <option value="PROJECT">Project</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Amount
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  min="0.01"
                  name="amountPhp"
                  placeholder="250000"
                  step="0.01"
                  type="number"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_12rem_12rem]">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Posting account
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="accountId"
                  defaultValue={dashboard.budgetDraftOptions.accounts[0]?.id ?? ""}
                  required
                >
                  {dashboard.budgetDraftOptions.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Warning %
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  defaultValue="80"
                  max="100"
                  min="1"
                  name="warningThresholdPct"
                  step="0.01"
                  type="number"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Hard block %
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  max="100"
                  min="1"
                  name="hardBlockPct"
                  placeholder="Optional"
                  step="0.01"
                  type="number"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Line code
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm uppercase text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="lineCode"
                  placeholder="FOOD-COST"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Line name
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="lineName"
                  placeholder="Food cost purchases"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Description
                </span>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="description"
                  placeholder="Scope, assumptions, and budget context"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Line description
                </span>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="lineDescription"
                  placeholder="What this budget line controls"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Creation reason
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="reason"
                  placeholder="Initial budget setup for the period"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Evidence reference
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="evidenceReference"
                  placeholder="Board memo, approved worksheet, or planning file"
                />
              </label>
            </div>

            <button
              className="inline-flex w-fit items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canCreateDraftBudget}
              type="submit"
            >
              Create Draft Budget
            </button>
          </form>
              </EntryModal>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "entry" && dashboard.permissions.canManageBudget ? (
        <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Create Draft Budget Revision
              </h2>
              <p className="text-sm text-slate-500">
                Record a proposed amendment for an approved budget line. Draft
                revisions do not change budget totals, line amounts, commitments,
                source records, payments, or journals.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={canCreateDraftRevision ? "warning" : "neutral"}>
                Request only
              </Badge>
              <EntryModal
                title="Create Draft Budget Revision"
                triggerLabel="Create Draft Revision"
                disabled={!canCreateDraftRevision}
              >

          <form action={runBudgetRevisionDraftAction} className="grid gap-4 pt-5">
            {!canCreateDraftRevision ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Budget revision needs at least one approved or active budget line
                in your authorized scope.
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[1fr_14rem_14rem]">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Budget line
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  disabled={!canCreateDraftRevision}
                  name="budgetLineId"
                  required
                >
                  {dashboard.budgetDraftOptions.revisionLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.label} - {line.detail}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Revision type
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="revisionType"
                  defaultValue="AMENDMENT"
                >
                  <option value="AMENDMENT">Amendment</option>
                  <option value="REBASE">Rebase</option>
                  <option value="REALLOCATION">Reallocation</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Proposed amount
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  disabled={!canCreateDraftRevision}
                  min="0.01"
                  name="proposedAmountPhp"
                  placeholder="300000"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Effective from
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="effectiveFrom"
                  type="date"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Effective to
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="effectiveTo"
                  type="date"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Revision reason
                </span>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="reason"
                  placeholder="Sales forecast change, supplier inflation, promotion, or operational reallocation"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Evidence reference
                </span>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="evidenceReference"
                  placeholder="Forecast worksheet, supplier notice, approval memo, or planning file"
                />
              </label>
            </div>

            <button
              className="inline-flex w-fit items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canCreateDraftRevision}
              type="submit"
            >
              Create Draft Revision
            </button>
          </form>
              </EntryModal>
            </div>
          </div>
        </section>
      ) : null}

      <div
        className={cx(
          "mb-5 grid gap-4 md:grid-cols-4",
          activeTab === "reports" ? "" : "hidden"
        )}
      >
        {dashboard.metrics.map((metric) => {
          const Icon = metricIcons[metric.id as keyof typeof metricIcons] ?? Gauge;
          return (
            <Panel key={metric.id} className="ogfi-metric-card p-5">
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
              <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">
                {metric.detail}
              </p>
              <Badge tone={metric.tone} size="sm">
                Budget control
              </Badge>
            </Panel>
          );
        })}
      </div>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "controls" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Source Allocation Readiness
            </h2>
            <p className="text-sm text-slate-500">
              Read-only rollout view for PR, PO, and AP source-line budget
              allocation before any hard-block policy is enabled.
            </p>
          </div>
          <Badge tone="info">Backfill and UAT gate</Badge>
        </div>
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-950">
                Budget source-hook policy
              </p>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                {dashboard.sourceHookPolicy.decisionBasis}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {dashboard.sourceHookPolicy.key} /{" "}
                {dashboard.sourceHookPolicy.sourceDecisionId}
                {dashboard.sourceHookPolicy.isOverridden ? " / overridden" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="info" size="sm">
                {humanize(dashboard.sourceHookPolicy.rolloutMode)}
              </Badge>
              <Badge
                tone={
                  dashboard.sourceHookPolicy.commitmentProjectionEnabled
                    ? "success"
                    : "neutral"
                }
                size="sm"
              >
                Projection{" "}
                {dashboard.sourceHookPolicy.commitmentProjectionEnabled
                  ? "on"
                  : "off"}
              </Badge>
              <Badge
                tone={
                  dashboard.sourceHookPolicy.hardBlockEnabled
                    ? "destructive"
                    : "warning"
                }
                size="sm"
              >
                Hard block{" "}
                {dashboard.sourceHookPolicy.hardBlockEnabled ? "on" : "off"}
              </Badge>
              <Badge tone="warning" size="sm">
                Backfill{" "}
                {dashboard.sourceHookPolicy.formalBackfillRequiredBeforeHardBlock
                  ? "required"
                  : "optional"}
              </Badge>
              <Badge tone="warning" size="sm">
                UAT{" "}
                {dashboard.sourceHookPolicy.uatRequiredBeforeHardBlock
                  ? "required"
                  : "optional"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 lg:grid-cols-3">
          {dashboard.sourceAllocationReadiness.map((row) => (
            <div
              key={row.sourceType}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950">{row.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {humanize(row.sourceType)}
                  </p>
                </div>
                <Badge tone={row.tone} size="sm">
                  {humanize(row.readiness)}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    Allocated
                  </p>
                  <p className="mt-1 font-bold text-slate-950">
                    {row.allocatedLineCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    Gaps
                  </p>
                  <p className="mt-1 font-bold text-slate-950">
                    {row.unallocatedLineCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    Coverage
                  </p>
                  <p className="mt-1 font-bold text-slate-950">
                    {row.allocationPct}%
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {row.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "workflow" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Budget Workflow Actions
            </h2>
            <p className="text-sm text-slate-500">
              Header-level budget transitions. Reasons are required for return,
              reject, cancel, close, and archive actions.
            </p>
          </div>
          <Badge tone="info">{dashboard.budgets.length} budget records</Badge>
        </div>

        <div className="divide-y divide-slate-100">
          {dashboard.budgets.length === 0 ? (
            <div className="p-6">
              <p className="font-semibold text-slate-950">
                No budget headers in this scope yet
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Draft, submitted, approved, active, closed, and cancelled budget
                headers will appear here once finance creates budget models.
              </p>
            </div>
          ) : (
            pagedBudgetRows.rows.map((budget) => (
              <div
                key={budget.id}
                className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_24rem] xl:items-start"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-950">{budget.name}</p>
                    <Badge tone={budgetStatusTone(budget.status)} size="sm">
                      {humanize(budget.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {budget.publicReference} / {budget.lineCount} line(s)
                  </p>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Owner
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {budget.ownerName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Submitted / Approved
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {budget.submittedByName ?? "Not submitted"} /{" "}
                        {budget.approvedByName ?? "Not approved"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Revised Total
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {formatMoney(budget.totalRevisedAmountPhp)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start justify-end">
                  {budget.allowedActions.length === 0 ? (
                    <Badge tone="neutral">No available action</Badge>
                  ) : (
                    <EntryModal
                      title={`Manage ${budget.publicReference}`}
                      triggerLabel="Manage Actions"
                      triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      <form action={runBudgetLifecycleAction} className="grid gap-4 pt-5">
                        <input name="budgetId" type="hidden" value={budget.id} />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="font-bold text-slate-950">{budget.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {budget.publicReference} / revised total{" "}
                            {formatMoney(budget.totalRevisedAmountPhp)}
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Reason
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="reason"
                              placeholder="Required for exceptions and closure"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Evidence reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="evidenceReference"
                              placeholder="Memo, approval, or policy reference"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                          {budget.allowedActions.map((action) => (
                            <button
                              key={action}
                              className={
                                action === "reject" || action === "cancel"
                                  ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                  : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                              }
                              name="action"
                              type="submit"
                              value={action}
                            >
                              {budgetActionLabels[action]}
                            </button>
                          ))}
                        </div>
                      </form>
                    </EntryModal>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <FinancePagination
          basePath="/finance/budget-control"
          tab={activeTab}
          page={pagedBudgetRows.pagination.page}
          totalPages={pagedBudgetRows.pagination.totalPages}
          totalCount={dashboard.budgets.length}
          startIndex={pagedBudgetRows.pagination.startIndex}
          endIndex={pagedBudgetRows.pagination.endIndex}
        />
      </section>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "revisions" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Budget Revision Requests
            </h2>
            <p className="text-sm text-slate-500">
              Proposed budget amendments remain request records until a later
              controlled apply step changes official budget amounts.
            </p>
          </div>
          <Badge tone="warning">
            {dashboard.revisions.length} revision
            {dashboard.revisions.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="divide-y divide-slate-100">
          {dashboard.revisions.length === 0 ? (
            <div className="p-6">
              <p className="font-semibold text-slate-950">
                No budget revision requests in this scope
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Draft and submitted budget amendments appear here after finance
                creates a revision request.
              </p>
            </div>
          ) : (
            pagedRevisionRows.rows.map((revision) => (
              <div
                key={revision.id}
                className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_24rem] xl:items-start"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-950">
                      Revision {revision.revisionNumber} / {revision.budgetName}
                    </p>
                    <Badge tone={budgetStatusTone(revision.status)} size="sm">
                      {humanize(revision.status)}
                    </Badge>
                    <Badge tone="info" size="sm">
                      {humanize(revision.revisionType)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {revision.budgetReference} / Requested by{" "}
                    {revision.requestedByName} on{" "}
                    {formatDateTime(revision.requestedAt)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {revision.reason}
                  </p>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Current
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {revision.originalAmountPhp == null
                          ? "Not captured"
                          : formatMoney(revision.originalAmountPhp)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Proposed
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {revision.proposedAmountPhp == null
                          ? "Not captured"
                          : formatMoney(revision.proposedAmountPhp)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Delta
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {revision.amountDeltaPhp == null
                          ? "Not captured"
                          : formatMoney(revision.amountDeltaPhp)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Reviewer
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {revision.reviewedByName ?? "Not reviewed"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start justify-end">
                  {revision.allowedActions.length === 0 ? (
                    <Badge tone="neutral">No available action</Badge>
                  ) : (
                    <EntryModal
                      title={`Review revision ${revision.revisionNumber}`}
                      triggerLabel="Manage Actions"
                      triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      <form
                        action={runBudgetRevisionLifecycleAction}
                        className="grid gap-4 pt-5"
                      >
                        <input
                          name="budgetRevisionId"
                          type="hidden"
                          value={revision.id}
                        />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="font-bold text-slate-950">
                            {revision.budgetName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Revision {revision.revisionNumber} / delta{" "}
                            {revision.amountDeltaPhp == null
                              ? "not captured"
                              : formatMoney(revision.amountDeltaPhp)}
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Reason
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="reason"
                              placeholder="Required for rejection or cancellation"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Evidence reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="evidenceReference"
                              placeholder="Approval memo or supporting worksheet"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                          {revision.allowedActions.map((action) => (
                            <button
                              key={action}
                              className={
                                action === "reject" || action === "cancel"
                                  ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                  : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                              }
                              name="action"
                              type="submit"
                              value={action}
                            >
                              {budgetRevisionActionLabels[action]}
                            </button>
                          ))}
                        </div>
                      </form>
                    </EntryModal>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <FinancePagination
          basePath="/finance/budget-control"
          tab={activeTab}
          page={pagedRevisionRows.pagination.page}
          totalPages={pagedRevisionRows.pagination.totalPages}
          totalCount={dashboard.revisions.length}
          startIndex={pagedRevisionRows.pagination.startIndex}
          endIndex={pagedRevisionRows.pagination.endIndex}
        />
      </section>

      <div
        className={cx(
          "mb-5 grid gap-4 lg:grid-cols-[1fr_24rem]",
          activeTab === "lines" ? "" : "hidden"
        )}
      >
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Budget Lines
              </h2>
              <p className="text-sm text-slate-500">
                Approved budget lines, source-linked commitments, posted actuals,
                and remaining amount.
              </p>
            </div>
            <Badge tone="info">{dashboard.lines.length} line records</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Budget / Line</th>
                  <th className="px-5 py-3">Scope</th>
                  <th className="px-5 py-3">Budget</th>
                  <th className="px-5 py-3">Committed</th>
                  <th className="px-5 py-3">Posted Actual</th>
                  <th className="px-5 py-3">Remaining</th>
                  <th className="px-5 py-3">Use</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8">
                      <p className="font-semibold text-slate-950">
                        No active budget lines in this scope yet
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Approved budget lines will appear after finance creates and
                        activates the budget model.
                      </p>
                    </td>
                  </tr>
                ) : (
                  pagedLineRows.rows.map((line) => (
                    <tr key={line.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-950">{line.lineName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {line.budgetReference} / {line.lineCode}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {line.accountName}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-950">
                          {line.locationName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {line.departmentName} / {line.periodLabel}
                        </p>
                        <Badge tone="success" size="sm">
                          {line.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-950">
                        {formatMoney(line.revisedAmountPhp)}
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {formatMoney(line.committedAmountPhp)}
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {formatMoney(line.actualAmountPhp)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={
                            line.remainingAmountPhp < 0
                              ? "font-bold text-red-700"
                              : "font-semibold text-slate-950"
                          }
                        >
                          {formatMoney(line.remainingAmountPhp)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={line.tone} size="sm">
                          {line.utilizationPct}%
                        </Badge>
                        <p className="mt-2 text-xs text-slate-500">
                          {humanize(line.thresholdState)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Warn {line.warningThresholdPct}%{" "}
                          {line.hardBlockPct == null
                            ? "/ no hard block"
                            : `/ block ${line.hardBlockPct}%`}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <FinancePagination
            basePath="/finance/budget-control"
            tab={activeTab}
            page={pagedLineRows.pagination.page}
            totalPages={pagedLineRows.pagination.totalPages}
            totalCount={dashboard.lines.length}
            startIndex={pagedLineRows.pagination.startIndex}
            endIndex={pagedLineRows.pagination.endIndex}
          />
        </section>

        <aside className="space-y-4">
          <Panel className="p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="ogfi-icon-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                <BadgeCheck aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Permissions
                </h2>
                <p className="text-sm text-slate-500">
                  What this account can do in budget control.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={dashboard.permissions.canManageBudget ? "success" : "neutral"}>
                Manage {dashboard.permissions.canManageBudget ? "enabled" : "disabled"}
              </Badge>
              <Badge tone={dashboard.permissions.canApproveBudget ? "success" : "neutral"}>
                Approve {dashboard.permissions.canApproveBudget ? "enabled" : "disabled"}
              </Badge>
              <Badge
                tone={
                  dashboard.permissions.canReviewCommitments ? "success" : "neutral"
                }
              >
                Commitment review{" "}
                {dashboard.permissions.canReviewCommitments ? "enabled" : "disabled"}
              </Badge>
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="ogfi-icon-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                <ClipboardList aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Recent Commitments
                </h2>
                <p className="text-sm text-slate-500">
                  Source-linked obligations and budget reservations.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {dashboard.commitments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-950">
                    No commitments yet
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Approved PR/PO/AP hooks will reserve budget here in a later
                    production workflow slice.
                  </p>
                </div>
              ) : (
                pagedCommitmentRows.rows.map((commitment) => (
                  <div
                    key={commitment.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-950">
                          {commitment.sourceReference}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {commitment.sourceType} / {commitment.lineName}
                        </p>
                      </div>
                      <Badge tone="info" size="sm">
                        {commitment.status}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      {commitment.sourceSummary}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs uppercase text-slate-500">
                          Committed
                        </p>
                        <p className="font-bold text-slate-950">
                          {formatMoney(commitment.committedAmountPhp)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-500">
                          Consumed
                        </p>
                        <p className="font-bold text-slate-950">
                          {formatMoney(commitment.consumedAmountPhp)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      {formatDateTime(commitment.sourceEventAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
            <FinancePagination
              basePath="/finance/budget-control"
              tab={activeTab}
              page={pagedCommitmentRows.pagination.page}
              totalPages={pagedCommitmentRows.pagination.totalPages}
              totalCount={dashboard.commitments.length}
              startIndex={pagedCommitmentRows.pagination.startIndex}
              endIndex={pagedCommitmentRows.pagination.endIndex}
            />
          </Panel>
        </aside>
      </div>

      <section
        className={cx(
          "ogfi-data-surface overflow-hidden",
          activeTab === "controls" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Guardrails
            </h2>
            <p className="text-sm text-slate-500">
              Boundary rules for budget, commitment, actual, and source-record control.
            </p>
          </div>
          <Badge tone="success">Source-of-truth protected</Badge>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-3">
          {dashboard.guardrails.map((guardrail) => (
            <div
              key={guardrail.label}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <LockKeyhole aria-hidden="true" className="h-4 w-4 text-blue-700" />
                <Badge tone={guardrail.tone} size="sm">
                  Control
                </Badge>
              </div>
              <p className="font-bold text-slate-950">{guardrail.label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {guardrail.detail}
              </p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
