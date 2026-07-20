import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  BarChart3,
  Filter,
  Search,
  ShieldCheck
} from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { ExpansionEntrySheet } from "@/components/ExpansionEntrySheet";
import { ExpansionWorkspaceNav } from "@/components/ExpansionWorkspaceNav";
import { getPaginationState } from "@/components/FinancePagination";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { canUseProjects, getDefaultAppRoute } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { expansionSpecializedTaskNextStatuses } from "@/server/services/expansionTaskControls";
import {
  createExpansionPostOpeningReview,
  getExpansionPostOpeningReviews,
  transitionExpansionPostOpeningReview,
  type ExpansionPostOpeningReviewRow
} from "@/server/services/expansionProjects";

export const dynamic = "force-dynamic";

type PostOpeningPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const reviewPeriods = [
  "DAY_30",
  "DAY_60",
  "DAY_90",
  "FINAL_STABILIZATION"
] as const;

const statusOptions = [
  "PLANNED",
  "IN_PROGRESS",
  "WAITING_FOR_APPROVAL",
  "BLOCKED",
  "FOR_REVIEW",
  "COMPLETED",
  "CANCELLED"
];

async function createPostOpeningAction(formData: FormData) {
  "use server";

  try {
    await createExpansionPostOpeningReview(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/post-opening", error));
  }
  redirect("/expansion/post-opening");
}

async function transitionPostOpeningAction(formData: FormData) {
  "use server";

  try {
    await transitionExpansionPostOpeningReview(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/post-opening", error));
  }
  redirect("/expansion/post-opening");
}

function firstSearchValue(
  value: string | string[] | undefined,
  fallback = ""
) {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "No due date";
  }
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

function statusTone(status: string) {
  if (status === "COMPLETED") {
    return "success" as const;
  }
  if (status === "BLOCKED" || status === "WAITING_FOR_APPROVAL") {
    return "warning" as const;
  }
  if (status === "CANCELLED") {
    return "destructive" as const;
  }
  return "neutral" as const;
}

function postOpeningHref(input: {
  page: number;
  query: string;
  status: string;
  reviewPeriod: string;
}) {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.reviewPeriod) {
    params.set("period", input.reviewPeriod);
  }
  params.set("page", String(input.page));
  return `/expansion/post-opening?${params.toString()}`;
}

function Pagination({
  page,
  totalPages,
  totalCount,
  startIndex,
  endIndex,
  query,
  status,
  reviewPeriod
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  query: string;
  status: string;
  reviewPeriod: string;
}) {
  if (totalCount <= 10) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
      <p>
        Showing {startIndex + 1}-{endIndex} of {totalCount}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          aria-disabled={page === 1}
          className={
            page === 1
              ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400"
              : "inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50"
          }
          href={postOpeningHref({
            page: Math.max(1, page - 1),
            query,
            status,
            reviewPeriod
          })}
        >
          Previous
        </Link>
        <span className="px-2 text-xs font-semibold uppercase text-slate-500">
          Page {page} of {totalPages}
        </span>
        <Link
          aria-disabled={page === totalPages}
          className={
            page === totalPages
              ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400"
              : "inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 font-semibold text-blue-700 hover:bg-blue-100"
          }
          href={postOpeningHref({
            page: Math.min(totalPages, page + 1),
            query,
            status,
            reviewPeriod
          })}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function ReviewActions({ row }: { row: ExpansionPostOpeningReviewRow }) {
  if (!row.canMutate) {
    return <span className="text-xs font-semibold text-slate-400">No edit access to this project.</span>;
  }
  if (row.status === "COMPLETED" || row.status === "CANCELLED") {
    return <span className="text-xs font-semibold text-slate-500">Closed</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <EntryModal
        title="Update Post-Opening Review"
        triggerLabel="Status"
        triggerClassName="min-h-9 px-3 text-xs"
      >
        <form action={transitionPostOpeningAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">{row.title}</p>
            <p className="mt-1 text-blue-900/75">
              This updates post-opening coordination only. It does not post
              sales, mutate finance records, adjust inventory, change workforce
              records, create branch records, or approve source transactions.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            New status
            <select
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
              name="nextStatus"
              required
            >
              {expansionSpecializedTaskNextStatuses(row.status)
                .filter((status) => status !== "CANCELLED")
                .map((status) => (
                  <option key={status} value={status}>
                    {humanize(status)}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Reason or review note
            <textarea
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="reason"
              placeholder="Required when blocked; optional for stabilization progress."
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Completion evidence
            <textarea
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="completionNote"
              placeholder="Required when complete: 30/60/90 review pack, POS report, finance summary, staffing review, or owner signoff reference."
            />
          </label>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            type="submit"
          >
            Save Status
          </button>
        </form>
      </EntryModal>
      <EntryModal
        title="Cancel Post-Opening Review"
        triggerLabel="Cancel"
        triggerClassName="min-h-9 border border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-50"
      >
        <form action={transitionPostOpeningAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
          <input name="nextStatus" type="hidden" value="CANCELLED" />
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Cancellation reason
            <textarea
              className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="reason"
              minLength={5}
              required
            />
          </label>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700"
            type="submit"
          >
            Cancel Review
          </button>
        </form>
      </EntryModal>
    </div>
  );
}

export default async function PostOpeningPage({
  searchParams
}: PostOpeningPageProps) {
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
  const reviewPeriod = firstSearchValue(resolvedSearchParams.period);
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const dashboard = await getExpansionPostOpeningReviews(session);
  const createProjects = dashboard.projects.filter((project) => project.canMutate);
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedStatus = status.trim().toUpperCase();
  const normalizedPeriod = reviewPeriod.trim().toUpperCase();
  const filteredRows = dashboard.rows.filter((row) => {
    const matchesQuery = normalizedQuery
      ? [
          row.title,
          row.projectCode,
          row.projectName,
          row.siteName,
          row.brandName,
          row.ownerName,
          row.sourceReference ?? ""
        ]
          .join(" ")
          .toUpperCase()
          .includes(normalizedQuery)
      : true;
    const matchesStatus = normalizedStatus ? row.status === normalizedStatus : true;
    const matchesPeriod = normalizedPeriod
      ? row.reviewPeriod === normalizedPeriod
      : true;
    return matchesQuery && matchesStatus && matchesPeriod;
  });
  const pagination = getPaginationState(
    filteredRows.length,
    firstSearchValue(resolvedSearchParams.page)
  );
  const visibleRows = filteredRows.slice(
    pagination.startIndex,
    pagination.endIndex
  );

  return (
    <AppShell
      session={session}
      title="Post-Opening Review"
      subtitle="30/60/90-day stabilization review against feasibility, capex, staffing, and operating assumptions"
      activeNav="post-opening"
    >
      <ExpansionWorkspaceNav />

      <ActionFeedbackBanner feedback={actionFeedback} />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Post-Opening Review is a stabilization workspace.</strong>{" "}
              Sales, Finance, Inventory, Workforce, Procurement, and Admin remain
              the source of truth for operating transactions and master records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Completing a review records evidence and variance context only; it
              does not post sales, change budgets, adjust stock, release payments,
              or update branch records.
            </p>
          </div>
          <Badge tone="info">Review only</Badge>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-6">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Projects</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.projectCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Reviews</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.reviewCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Open</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.openReviewCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Exceptions</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.performanceExceptionCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Missing evidence</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.evidenceMissingCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Avg. score</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {dashboard.averageStabilizationScore}%
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Post-Opening Review List
            </h2>
            <p className="text-sm text-slate-500">
              Track 30/60/90-day performance, operating variances, source
              references, and evidence without replacing source modules.
            </p>
          </div>
          <ExpansionEntrySheet
            title="Create Post-Opening Review"
            triggerLabel="Create Review"
            submitLabel="Create Post-Opening Review"
            triggerClassName="gap-2"
            disabled={createProjects.length === 0}
            disabledReason="Choose an Expansion project where you have edit access before recording a post-opening review."
          >
            <form action={createPostOpeningAction} className="grid gap-5 pt-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Expansion project
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="projectId"
                    required
                  >
                    <option value="">Select project</option>
                    {createProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code} / {project.name} / {project.siteName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Review period
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="reviewPeriod"
                    required
                  >
                    {reviewPeriods.map((period) => (
                      <option key={period} value={period}>
                        {humanize(period)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Review title
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="title"
                    placeholder="30-day operating stabilization review"
                    required
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Due date
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="dueDate"
                    type="date"
                    required
                  />
                </label>
                {[
                  ["Target sales", "targetSales", "1500000"],
                  ["Actual sales", "actualSales", "1425000"],
                  ["Target food cost %", "targetFoodCostPercent", "37"],
                  ["Actual food cost %", "actualFoodCostPercent", "39"],
                  ["Target labor cost %", "targetLaborCostPercent", "18"],
                  ["Actual labor cost %", "actualLaborCostPercent", "19"],
                  ["Guest count", "guestCount", "8500"],
                  ["Issue count", "issueCount", "6"],
                  ["Stabilization score", "stabilizationScore", "82"]
                ].map(([label, name, placeholder]) => (
                  <label
                    key={name}
                    className="grid gap-2 text-sm font-semibold text-slate-700"
                  >
                    {label}
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name={name}
                      placeholder={placeholder}
                      step="0.01"
                      type="number"
                    />
                  </label>
                ))}
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Priority
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="priority"
                    defaultValue="NORMAL"
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Source reference
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="sourceReference"
                    placeholder="POS sales, finance summary, staffing review, inventory report"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Evidence reference
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="evidenceReference"
                    placeholder="Review pack, signed minutes, owner signoff"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Notes
                <textarea
                  className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  name="notes"
                  placeholder="Variance explanation, corrective actions, owners, and follow-up expectations."
                />
              </label>
            </form>
          </ExpansionEntrySheet>
        </div>

        <form
          className="grid gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-[1fr_14rem_14rem_auto_auto]"
          action="/expansion/post-opening"
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
                placeholder="Review, project, site, source ref, owner"
                defaultValue={query}
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Period
            <select
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
              name="period"
              defaultValue={reviewPeriod}
            >
              <option value="">All periods</option>
              {reviewPeriods.map((period) => (
                <option key={period} value={period}>
                  {humanize(period)}
                </option>
              ))}
            </select>
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
                  {humanize(option)}
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
            href="/expansion/post-opening"
          >
            Clear
          </Link>
        </form>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Review</th>
                <th className="px-5 py-3">Project / Site</th>
                <th className="px-5 py-3">Sales</th>
                <th className="px-5 py-3">Cost / Stabilization</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Evidence</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="px-5 py-8" colSpan={7}>
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                        <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-bold text-slate-950">
                          No post-opening reviews found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Create 30/60/90-day stabilization reviews for sales,
                          cost, staffing, issue, and owner-signoff evidence.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                          {row.status === "COMPLETED" ? (
                            <Activity aria-hidden="true" className="h-4 w-4" />
                          ) : (
                            <BarChart3 aria-hidden="true" className="h-4 w-4" />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-950">{row.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {humanize(row.reviewPeriod)} / {row.ownerName}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge tone={statusTone(row.status)}>
                              {humanize(row.status)}
                            </Badge>
                            {row.priority === "HIGH" ||
                            row.priority === "CRITICAL" ? (
                              <Badge tone="warning">{humanize(row.priority)}</Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-slate-950">
                        {row.projectCode}
                      </p>
                      <p className="text-sm text-slate-600">{row.projectName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.brandName} / {row.siteName}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-slate-950">
                        {formatMoney(row.actualSales)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Target {formatMoney(row.targetSales)}
                      </p>
                      <p
                        className={
                          row.salesVariancePercent < -5
                            ? "mt-2 text-xs font-semibold text-amber-700"
                            : "mt-2 text-xs font-semibold text-slate-600"
                        }
                      >
                        Variance {row.salesVariancePercent}%
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-slate-950">
                        Score {row.stabilizationScore}%
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Food {row.actualFoodCostPercent}% / target{" "}
                        {row.targetFoodCostPercent}%
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Labor {row.actualLaborCostPercent}% / target{" "}
                        {row.targetLaborCostPercent}%
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Guests {row.guestCount} / issues {row.issueCount}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p
                        className={
                          row.isOverdue
                            ? "font-bold text-amber-700"
                            : "font-semibold text-slate-700"
                        }
                      >
                        {formatDate(row.dueDate)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{row.nextAction}</p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <Badge tone={row.evidenceReference ? "success" : "neutral"}>
                        {row.evidenceReference ? "Recorded" : "Pending"}
                      </Badge>
                      <p className="mt-2 max-w-xs text-xs text-slate-500">
                        {row.evidenceReference ??
                          row.sourceReference ??
                          "Evidence required for completion"}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <ReviewActions row={row} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {visibleRows.length === 0 ? <div className="px-5 py-8"><p className="font-bold text-slate-950">No post-opening reviews found</p><p className="mt-1 text-sm text-slate-500">Adjust filters or create a scoped stabilization review.</p></div> : visibleRows.map((row) => (
            <article className="grid gap-3 px-5 py-4" key={row.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.projectCode} / {row.projectName}</p></div><Badge tone={statusTone(row.status)}>{humanize(row.status)}</Badge></div>
              <div className="flex flex-wrap gap-2"><Badge tone="neutral">{humanize(row.reviewPeriod)}</Badge>{row.isOverdue ? <Badge tone="warning">Overdue</Badge> : <Badge tone="neutral">Due {formatDate(row.dueDate)}</Badge>}<Badge tone={row.evidenceReference ? "success" : "neutral"}>{row.evidenceReference ? "Evidence recorded" : "Evidence pending"}</Badge></div>
              <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Actual sales</p><p className="mt-1 font-bold text-slate-900">{formatMoney(row.actualSales)}</p><p className="mt-1 text-xs text-slate-500">Variance {row.salesVariancePercent}%</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Stabilization</p><p className="mt-1 font-bold text-slate-900">{row.stabilizationScore}%</p><p className="mt-1 text-xs text-slate-500">Food {row.actualFoodCostPercent}% / Labor {row.actualLaborCostPercent}%</p></div></div>
              <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Owner</p><p className="mt-1 font-semibold text-slate-800">{row.ownerName}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Next</p><p className="mt-1 font-semibold text-slate-800">{row.nextAction}</p></div></div>
              <ReviewActions row={row} />
            </article>
          ))}
        </div>
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={filteredRows.length}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          query={query}
          status={status}
          reviewPeriod={reviewPeriod}
        />
      </section>
    </AppShell>
  );
}
