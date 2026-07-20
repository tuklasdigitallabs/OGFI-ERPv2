import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Filter,
  Hammer,
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
  createExpansionConstructionTask,
  getExpansionConstructionBoard,
  recordExpansionConstructionProgress,
  transitionExpansionConstructionTask,
  type ExpansionConstructionTaskRow
} from "@/server/services/expansionProjects";

export const dynamic = "force-dynamic";

type ConstructionBoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const workstreams = [
  "SITE_PREPARATION",
  "CIVIL_WORKS",
  "MEP",
  "KITCHEN_EQUIPMENT",
  "IT_SYSTEMS",
  "SIGNAGE",
  "DESIGN_COORDINATION",
  "INSPECTION",
  "TURNOVER"
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

async function createConstructionAction(formData: FormData) {
  "use server";

  try {
    await createExpansionConstructionTask(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/construction", error));
  }
  redirect("/expansion/construction");
}

async function recordProgressAction(formData: FormData) {
  "use server";

  try {
    await recordExpansionConstructionProgress(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/construction", error));
  }
  redirect("/expansion/construction");
}

async function transitionConstructionAction(formData: FormData) {
  "use server";

  try {
    await transitionExpansionConstructionTask(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/construction", error));
  }
  redirect("/expansion/construction");
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

function constructionPageHref(input: {
  page: number;
  query: string;
  status: string;
  workstream: string;
}) {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.workstream) {
    params.set("workstream", input.workstream);
  }
  params.set("page", String(input.page));
  return `/expansion/construction?${params.toString()}`;
}

function Pagination({
  page,
  totalPages,
  totalCount,
  startIndex,
  endIndex,
  query,
  status,
  workstream
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  query: string;
  status: string;
  workstream: string;
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
          href={constructionPageHref({
            page: Math.max(1, page - 1),
            query,
            status,
            workstream
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
          href={constructionPageHref({
            page: Math.min(totalPages, page + 1),
            query,
            status,
            workstream
          })}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function ConstructionActions({ row }: { row: ExpansionConstructionTaskRow }) {
  if (!row.canMutate) {
    return <span className="text-xs font-semibold text-slate-400">No edit access to this project.</span>;
  }
  if (row.status === "COMPLETED" || row.status === "CANCELLED") {
    return <span className="text-xs font-semibold text-slate-400">No action</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <EntryModal
        title="Record Construction Progress"
        triggerLabel="Progress"
        triggerClassName="min-h-9 px-3 text-xs"
      >
        <form action={recordProgressAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">{row.title}</p>
            <p className="mt-1 text-blue-900/75">
              Record site progress and evidence only. This does not authorize
              payments, POs, inventory receipts, or contractor portal activity.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Progress %
            <input
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
              defaultValue={row.progressPercent}
              max={100}
              min={0}
              name="progressPercent"
              required
              type="number"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Evidence reference
            <input
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
              name="evidenceReference"
              placeholder="Photo log, inspection, signed progress report"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Progress note
            <textarea
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="progressNote"
              placeholder="What changed, who verified it, and what remains."
              minLength={5}
              required
            />
          </label>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            type="submit"
          >
            Record Progress
          </button>
        </form>
      </EntryModal>

      <EntryModal
        title="Update Construction Status"
        triggerLabel="Status"
        triggerClassName="min-h-9 border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
      >
        <form action={transitionConstructionAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
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
              placeholder="Required when marking complete: handover note, inspection signoff, photo log, or completion certificate."
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
        title="Cancel Construction Task"
        triggerLabel="Cancel"
        triggerClassName="min-h-9 border border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-50"
      >
        <form action={transitionConstructionAction} className="grid gap-4 pt-5">
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
            Cancel Task
          </button>
        </form>
      </EntryModal>
    </div>
  );
}

export default async function ConstructionBoardPage({
  searchParams
}: ConstructionBoardPageProps) {
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
  const workstream = firstSearchValue(resolvedSearchParams.workstream);
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const dashboard = await getExpansionConstructionBoard(session);
  const createProjects = dashboard.projects.filter((project) => project.canMutate);
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedStatus = status.trim().toUpperCase();
  const normalizedWorkstream = workstream.trim().toUpperCase();
  const filteredRows = dashboard.rows.filter((row) => {
    const matchesQuery = normalizedQuery
      ? [
          row.title,
          row.projectCode,
          row.projectName,
          row.siteName,
          row.brandName,
          row.area ?? "",
          row.contractorName ?? "",
          row.ownerName
        ]
          .join(" ")
          .toUpperCase()
          .includes(normalizedQuery)
      : true;
    const matchesStatus = normalizedStatus ? row.status === normalizedStatus : true;
    const matchesWorkstream = normalizedWorkstream
      ? row.workstream === normalizedWorkstream
      : true;
    return matchesQuery && matchesStatus && matchesWorkstream;
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
      title="Construction Board"
      subtitle="Fit-out, contractor coordination, progress, and evidence tracking"
      activeNav="construction-board"
    >
      <ExpansionWorkspaceNav />

      <ActionFeedbackBanner feedback={actionFeedback} />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Construction Board uses project tasks.</strong> It tracks
              workstream progress and evidence without replacing procurement,
              finance, inventory, legal, or contractor systems of record.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Progress updates do not approve POs, release payments, receive
              inventory, author BOQs, or expose a contractor portal.
            </p>
          </div>
          <Badge tone="info">Coordination only</Badge>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Construction tasks</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.taskCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Open</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.openTaskCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Blocked</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.blockedTaskCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.overdueTaskCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Avg progress</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {dashboard.averageProgressPercent}%
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Construction List</h2>
            <p className="text-sm text-slate-500">
              Progress, blockers, due dates, contractor context, and evidence.
            </p>
          </div>
          <ExpansionEntrySheet
            title="Create Construction Task"
            triggerLabel="Create Construction Task"
            submitLabel="Create Construction Task"
            triggerClassName="gap-2"
            disabled={createProjects.length === 0}
            disabledReason="Choose an Expansion project where you have edit access before adding a construction task."
          >
            <form action={createConstructionAction} className="grid gap-5 pt-5">
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
                  Workstream
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="workstream"
                    required
                  >
                    {workstreams.map((option) => (
                      <option key={option} value={option}>
                        {humanize(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Task title
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="title"
                    placeholder="Kitchen exhaust rough-in"
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
                  Area
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="area"
                    placeholder="Kitchen, dining, facade, BOH"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Contractor / supplier reference
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="contractorName"
                    placeholder="Internal reference only"
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
                  Starting progress %
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    defaultValue={0}
                    max={100}
                    min={0}
                    name="progressPercent"
                    type="number"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                  Evidence reference
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="evidenceReference"
                    placeholder="Photo log, inspection, daily report, or signed handover reference"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Notes
                <textarea
                  className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  name="notes"
                  placeholder="Scope notes, constraints, dependencies, or inspection assumptions."
                />
              </label>
            </form>
          </ExpansionEntrySheet>
        </div>

        <form
          className="grid gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-[1fr_14rem_14rem_auto_auto]"
          action="/expansion/construction"
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
                placeholder="Task, project, area, contractor"
                defaultValue={query}
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Workstream
            <select
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
              name="workstream"
              defaultValue={workstream}
            >
              <option value="">All workstreams</option>
              {workstreams.map((option) => (
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
            href="/expansion/construction"
          >
            Clear
          </Link>
        </form>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Construction Task</th>
                <th className="px-5 py-3">Project / Site</th>
                <th className="px-5 py-3">Progress</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3">Evidence / Links</th>
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
                          No construction tasks found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Adjust filters or create a project-scoped construction
                          task for fit-out, inspection, equipment, IT, signage, or
                          turnover work.
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
                            <Hammer aria-hidden="true" className="h-4 w-4" />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-950">{row.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {humanize(row.workstream)}
                            {row.area ? ` / ${row.area}` : ""}
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
                      {row.contractorName ? (
                        <p className="mt-2 text-xs font-semibold text-slate-600">
                          {row.contractorName}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="min-w-40">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                          <span>{row.progressPercent}%</span>
                          <span>{row.nextAction}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-blue-600"
                            style={{ width: `${row.progressPercent}%` }}
                          />
                        </div>
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
                        {row.evidenceReference ??
                          `${row.attachmentCount} attachment / ${row.linkedRecordCount} link(s)`}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <ConstructionActions row={row} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {visibleRows.length === 0 ? <div className="px-5 py-8"><p className="font-bold text-slate-950">No construction tasks found</p><p className="mt-1 text-sm text-slate-500">Adjust filters or create a scoped construction task.</p></div> : visibleRows.map((row) => (
            <article className="grid gap-3 px-5 py-4" key={row.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.projectCode} / {row.projectName}</p></div><Badge tone={statusTone(row.status)}>{humanize(row.status)}</Badge></div>
              <div className="flex flex-wrap gap-2"><Badge tone="neutral">{humanize(row.workstream)}</Badge>{row.isOverdue ? <Badge tone="warning">Overdue</Badge> : <Badge tone="neutral">Due {formatDate(row.dueDate)}</Badge>}<Badge tone={row.evidenceReference ? "success" : "neutral"}>{row.evidenceReference ? "Evidence recorded" : "Evidence pending"}</Badge></div>
              <div><div className="flex items-center justify-between text-sm"><span className="font-semibold text-slate-800">Progress</span><span className="font-bold text-slate-900">{row.progressPercent}%</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.progressPercent}%` }} /></div></div>
              <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Owner</p><p className="mt-1 font-semibold text-slate-800">{row.ownerName}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Next</p><p className="mt-1 font-semibold text-slate-800">{row.nextAction}</p></div></div>
              <ConstructionActions row={row} />
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
          workstream={workstream}
        />
      </section>
    </AppShell>
  );
}
