import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Filter,
  PackageCheck,
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
  createExpansionOpeningReadiness,
  getExpansionOpeningReadiness,
  toggleExpansionOpeningReadinessChecklist,
  transitionExpansionOpeningReadiness,
  type ExpansionOpeningReadinessRow
} from "@/server/services/expansionProjects";

export const dynamic = "force-dynamic";

type OpeningReadinessPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const readinessAreas = [
  "OPERATIONS",
  "HR_STAFFING",
  "TRAINING",
  "IT_SYSTEMS",
  "MARKETING",
  "PERMITS",
  "INVENTORY_STOCK",
  "EQUIPMENT",
  "FINANCE_CASH",
  "COMPLIANCE_SAFETY"
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

async function createReadinessAction(formData: FormData) {
  "use server";

  try {
    await createExpansionOpeningReadiness(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/readiness", error));
  }
  redirect("/expansion/readiness");
}

async function toggleChecklistAction(formData: FormData) {
  "use server";

  try {
    await toggleExpansionOpeningReadinessChecklist(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/readiness", error));
  }
  redirect("/expansion/readiness");
}

async function transitionReadinessAction(formData: FormData) {
  "use server";

  try {
    await transitionExpansionOpeningReadiness(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/readiness", error));
  }
  redirect("/expansion/readiness");
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

function readinessPageHref(input: {
  page: number;
  query: string;
  status: string;
  area: string;
}) {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.area) {
    params.set("area", input.area);
  }
  params.set("page", String(input.page));
  return `/expansion/readiness?${params.toString()}`;
}

function Pagination({
  page,
  totalPages,
  totalCount,
  startIndex,
  endIndex,
  query,
  status,
  area
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  query: string;
  status: string;
  area: string;
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
          href={readinessPageHref({
            page: Math.max(1, page - 1),
            query,
            status,
            area
          })}
        >
          Previous
        </Link>
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Page {page} of {totalPages}
        </span>
        <Link
          aria-disabled={page === totalPages}
          className={
            page === totalPages
              ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400"
              : "inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 font-semibold text-blue-700 hover:bg-blue-100"
          }
          href={readinessPageHref({
            page: Math.min(totalPages, page + 1),
            query,
            status,
            area
          })}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function ChecklistModal({ row }: { row: ExpansionOpeningReadinessRow }) {
  return (
    <EntryModal
      title="Readiness Checklist"
      triggerLabel="Checklist"
      triggerClassName="min-h-9 border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
    >
      <div className="grid gap-4 pt-5">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
          <p className="font-semibold">{row.title}</p>
          <p className="mt-1 text-blue-900/75">
            Checklist updates affect this project readiness task only. They do
            not create branches, hire staff, post inventory, approve POs, or
            release payments.
          </p>
        </div>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {row.checklistItems.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No checklist lines.</p>
          ) : (
            row.checklistItems.map((item) => (
              <form
                key={item.id}
                action={toggleChecklistAction}
                className="flex items-center justify-between gap-4 p-4"
              >
                <input name="checklistItemId" type="hidden" value={item.id} />
                <input
                  name="isCompleted"
                  type="hidden"
                  value={item.isCompleted ? "false" : "true"}
                />
                <div>
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.isRequired ? "Required" : "Optional"} /{" "}
                    {item.isCompleted ? "Completed" : "Open"}
                  </p>
                </div>
                <button
                  className={
                    item.isCompleted
                      ? "inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      : "inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
                  }
                  disabled={!row.canMutate}
                  type="submit"
                >
                  {item.isCompleted ? "Reopen" : "Complete"}
                </button>
              </form>
            ))
          )}
        </div>
      </div>
    </EntryModal>
  );
}

function ReadinessActions({ row }: { row: ExpansionOpeningReadinessRow }) {
  if (!row.canMutate) {
    return <span className="text-xs font-semibold text-slate-400">No edit access to this project.</span>;
  }
  if (row.status === "COMPLETED" || row.status === "CANCELLED") {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <ChecklistModal row={row} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <ChecklistModal row={row} />
      <EntryModal
        title="Update Opening Readiness"
        triggerLabel="Status"
        triggerClassName="min-h-9 px-3 text-xs"
      >
        <form action={transitionReadinessAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">{row.title}</p>
            <p className="mt-1 text-blue-900/75">
              This updates opening-readiness coordination only. Operational
              source records remain controlled in their own modules.
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
            Reason or blocker note
            <textarea
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="reason"
              placeholder="Required when marking blocked; optional for normal status updates."
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Completion evidence
            <textarea
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="completionNote"
              placeholder="Required when marking complete: readiness signoff, checklist evidence, or opening approval reference."
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
        title="Cancel Opening Readiness Item"
        triggerLabel="Cancel"
        triggerClassName="min-h-9 border border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-50"
      >
        <form action={transitionReadinessAction} className="grid gap-4 pt-5">
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
            Cancel Readiness Item
          </button>
        </form>
      </EntryModal>
    </div>
  );
}

export default async function OpeningReadinessPage({
  searchParams
}: OpeningReadinessPageProps) {
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
  const area = firstSearchValue(resolvedSearchParams.area);
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const dashboard = await getExpansionOpeningReadiness(session);
  const createProjects = dashboard.projects.filter((project) => project.canMutate);
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedStatus = status.trim().toUpperCase();
  const normalizedArea = area.trim().toUpperCase();
  const filteredRows = dashboard.rows.filter((row) => {
    const matchesQuery = normalizedQuery
      ? [
          row.title,
          row.projectCode,
          row.projectName,
          row.siteName,
          row.brandName,
          row.ownerName
        ]
          .join(" ")
          .toUpperCase()
          .includes(normalizedQuery)
      : true;
    const matchesStatus = normalizedStatus ? row.status === normalizedStatus : true;
    const matchesArea = normalizedArea ? row.readinessArea === normalizedArea : true;
    return matchesQuery && matchesStatus && matchesArea;
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
      title="Opening Readiness"
      subtitle="Pre-opening checks across operations, HR, IT, marketing, permits, inventory, and compliance"
      activeNav="opening-readiness"
    >
      <ExpansionWorkspaceNav />

      <ActionFeedbackBanner feedback={actionFeedback} />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Opening Readiness coordinates readiness tasks.</strong> It
              does not create branch records, hire employees, post inventory,
              approve POs, or release payments.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Checklist evidence supports opening governance while source
              records stay in Operations, Workforce, Inventory, Finance, and
              Procurement.
            </p>
          </div>
          <Badge tone="info">Readiness coordination</Badge>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Readiness items</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.readinessCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Open</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.openReadinessCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Blocked</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.blockedReadinessCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.overdueReadinessCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Avg completion</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {dashboard.averageCompletionPercent}%
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Readiness List</h2>
            <p className="text-sm text-slate-500">
              Checklist-backed readiness controls with evidence-required closure.
            </p>
          </div>
          <ExpansionEntrySheet
            title="Create Opening Readiness Item"
            triggerLabel="Create Readiness Item"
            submitLabel="Create Readiness Item"
            triggerClassName="gap-2"
            disabled={createProjects.length === 0}
            disabledReason="Choose an Expansion project where you have edit access before adding a readiness item."
          >
            <form action={createReadinessAction} className="grid gap-5 pt-5">
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
                  Readiness area
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="readinessArea"
                    required
                  >
                    {readinessAreas.map((option) => (
                      <option key={option} value={option}>
                        {humanize(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Readiness title
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="title"
                    placeholder="Opening day staffing confirmed"
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
                  Evidence reference
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="evidenceReference"
                    placeholder="Training signoff, stock checklist, IT go-live evidence"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Required checklist lines
                <textarea
                  className="min-h-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  name="checklistText"
                  placeholder="One required checklist line per row"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Notes
                <textarea
                  className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  name="notes"
                  placeholder="Dependencies, exception policy, owners, or opening-day assumptions."
                />
              </label>
            </form>
          </ExpansionEntrySheet>
        </div>

        <form
          className="grid gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-[1fr_14rem_14rem_auto_auto]"
          action="/expansion/readiness"
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
                placeholder="Readiness item, project, owner"
                defaultValue={query}
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Area
            <select
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
              name="area"
              defaultValue={area}
            >
              <option value="">All areas</option>
              {readinessAreas.map((option) => (
                <option key={option} value={option}>
                  {humanize(option)}
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
            href="/expansion/readiness"
          >
            Clear
          </Link>
        </form>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Readiness Item</th>
                <th className="px-5 py-3">Project / Site</th>
                <th className="px-5 py-3">Checklist</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Owner</th>
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
                          No readiness items found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Adjust filters or create a checklist-backed readiness
                          item for opening preparation.
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
                            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                          ) : (
                            <PackageCheck aria-hidden="true" className="h-4 w-4" />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-950">{row.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {humanize(row.readinessArea)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge tone={statusTone(row.status)}>
                              {humanize(row.status)}
                            </Badge>
                            {row.priority === "HIGH" || row.priority === "CRITICAL" ? (
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
                      <div className="min-w-40">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                          <span>
                            {row.checklistCompleted}/{row.checklistTotal}
                          </span>
                          <span>{row.completionPercent}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-blue-600"
                            style={{ width: `${row.completionPercent}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{row.nextAction}</p>
                      </div>
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
                      {row.isOverdue ? (
                        <p className="mt-1 text-xs text-amber-700">Overdue</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 align-top text-slate-700">
                      {row.ownerName}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <Badge tone={row.evidenceReference ? "success" : "neutral"}>
                        {row.evidenceReference ? "Recorded" : "Pending"}
                      </Badge>
                      <p className="mt-2 max-w-xs text-xs text-slate-500">
                        {row.evidenceReference ?? "Evidence required for closure"}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <ReadinessActions row={row} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {visibleRows.length === 0 ? <div className="px-5 py-8"><p className="font-bold text-slate-950">No readiness items found</p><p className="mt-1 text-sm text-slate-500">Adjust filters or create a scoped opening-readiness item.</p></div> : visibleRows.map((row) => (
            <article className="grid gap-3 px-5 py-4" key={row.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.projectCode} / {row.projectName}</p></div><Badge tone={statusTone(row.status)}>{humanize(row.status)}</Badge></div>
              <div className="flex flex-wrap gap-2"><Badge tone="neutral">{humanize(row.readinessArea)}</Badge>{row.isOverdue ? <Badge tone="warning">Overdue</Badge> : <Badge tone="neutral">Due {formatDate(row.dueDate)}</Badge>}<Badge tone={row.evidenceReference ? "success" : "neutral"}>{row.evidenceReference ? "Evidence recorded" : "Evidence pending"}</Badge></div>
              <div><div className="flex items-center justify-between text-sm"><span className="font-semibold text-slate-800">Checklist</span><span className="font-bold text-slate-900">{row.checklistCompleted}/{row.checklistTotal} ({row.completionPercent}%)</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.completionPercent}%` }} /></div></div>
              <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Owner</p><p className="mt-1 font-semibold text-slate-800">{row.ownerName}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Next</p><p className="mt-1 font-semibold text-slate-800">{row.nextAction}</p></div></div>
              <ReadinessActions row={row} />
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
          area={area}
        />
      </section>
    </AppShell>
  );
}
