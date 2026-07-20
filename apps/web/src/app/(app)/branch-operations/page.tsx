import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { BranchChecklistLinesEditor } from "@/components/BranchChecklistLinesEditor";
import { TaskSheet } from "@/components/TaskSheet";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseBranchOperations,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import {
  createBranchOperationChecklist,
  filterBranchOperationChecklists,
  getBranchOperationsDashboard
} from "@/server/services/branchOperations";
import { getSessionContext } from "@/server/services/context";
import { canExportBranchOperations } from "@/server/services/exportAuthorization";

export const dynamic = "force-dynamic";

const shiftOptions = ["ALL", "OPENING", "CLOSING", "MIDSHIFT"] as const;
const createShiftOptions = ["OPENING", "CLOSING", "MIDSHIFT"] as const;
const statusOptions = [
  "ALL",
  "DRAFT",
  "IN_PROGRESS",
  "EXCEPTION_OPEN",
  "MANAGER_REVIEW",
  "SUBMITTED",
  "RETURNED",
  "REVIEWED",
  "CLOSED"
] as const;
const lineResultOptions = ["PASS", "EXCEPTION", "NOT_APPLICABLE"] as const;
const lineSeverityOptions = ["NORMAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const PAGE_SIZE = 10;

async function createBranchChecklistAction(formData: FormData) {
  "use server";

  let checklistId: string;
  try {
    checklistId = await createBranchOperationChecklist(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/branch-operations", error));
  }
  redirect(`/branch-operations/${checklistId}`);
}

function statusTone(status: string) {
  if (
    status === "EXCEPTION_OPEN" ||
    status === "SUBMITTED" ||
    status === "RETURNED" ||
    status === "MANAGER_REVIEW"
  ) {
    return "warning" as const;
  }
  if (status === "REVIEWED" || status === "CLOSED") {
    return "success" as const;
  }
  return "info" as const;
}

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeOption<T extends readonly string[]>(
  value: string | undefined,
  options: T
): T[number] {
  return options.includes(value ?? "") ? (value as T[number]) : options[0]!;
}

function normalizePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function buildQueryHref(
  basePath: string,
  params: Record<string, string | null | undefined>
) {
  const url = new URL(basePath, "http://localhost");
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
}

export default async function BranchOperationsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseBranchOperations(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboard = await getBranchOperationsDashboard(session);
  const canExport = canExportBranchOperations(session);
  const canCreate = session.permissionCodes.includes(
    permissions.branchOperationsCreate
  );
  const params = searchParams ? await searchParams : {};
  const feedback = getActionFeedback(params);
  const query = (getSearchParam(params, "q") ?? "").trim().toLowerCase();
  const businessDate = getSearchParam(params, "businessDate") ?? "";
  const shiftFilter = normalizeOption(getSearchParam(params, "shift"), shiftOptions);
  const statusFilter = normalizeOption(getSearchParam(params, "status"), statusOptions);
  const visibleChecklists = filterBranchOperationChecklists(dashboard.checklists, {
    q: query,
    businessDate,
    shift: shiftFilter,
    status: statusFilter
  });
  const requestedPage = normalizePage(getSearchParam(params, "page"));
  const totalPages = Math.max(1, Math.ceil(visibleChecklists.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedChecklists = visibleChecklists.slice(startIndex, startIndex + PAGE_SIZE);
  const showingStart = visibleChecklists.length === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(startIndex + PAGE_SIZE, visibleChecklists.length);
  const pageHref = (page: number) =>
    buildQueryHref("/branch-operations", {
      q: getSearchParam(params, "q"),
      businessDate,
      shift: shiftFilter !== "ALL" ? shiftFilter : undefined,
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      page: page > 1 ? String(page) : undefined
    });

  return (
    <AppShell
      session={session}
      title="Branch Operations"
      subtitle="Phase II opening, closing, readiness, and exception controls"
      activeNav="branch-operations"
    >
      <ActionFeedbackBanner feedback={feedback} />
      <div className="ogfi-coordination-cue mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Phase II boundary:</strong> branch checklists capture daily
              readiness, sign-off, and exceptions. They do not post stock,
              approve inventory adjustments, or replace incident and maintenance
              source records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Exceptions shown here are operational follow-up signals for the selected
              branch context.
            </p>
          </div>
          <span>Read-only branch controls</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Business date</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {dashboard.businessDate ?? "No checklist"}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Checklists</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.totalChecklists}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Completed</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {dashboard.completedChecklists}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Exceptions</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.openExceptions}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Completion</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {dashboard.averageCompletionPercent.toFixed(0)}%
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Daily Branch Readiness
            </h2>
            <p className="text-sm text-slate-500">
              {dashboard.locationName} / opening and closing checklist source records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dashboard.criticalExceptions > 0 ? "destructive" : "info"}>
              {dashboard.criticalExceptions} critical exceptions
            </Badge>
            {canCreate ? (
              <TaskSheet
                title="Create Branch Checklist"
                description="Capture opening, closing, or midshift readiness checks. Exceptions remain linked to this checklist and its audit history."
                trigger="Create Checklist"
                triggerClassName="border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                size="workspace"
                bodyScroll="contained"
                bodyClassName="p-0"
                footer={
                  <button
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
                    form="create-branch-checklist"
                    type="submit"
                  >
                    Create Branch Checklist
                  </button>
                }
              >
                <BranchChecklistLinesEditor
                  action={createBranchChecklistAction}
                  resultOptions={lineResultOptions}
                  severityOptions={lineSeverityOptions}
                  shiftOptions={createShiftOptions}
                  formId="create-branch-checklist"
                />
              </TaskSheet>
            ) : null}
            {canExport ? (
              <ButtonLink
                href={buildQueryHref("/branch-operations/export", {
                  q: query || null,
                  businessDate: businessDate || null,
                  shift: shiftFilter === "ALL" ? null : shiftFilter,
                  status: statusFilter === "ALL" ? null : statusFilter
                })}
                tone="ghost"
                className="ogfi-chip"
              >
                Export Checklist CSV
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <form className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_11rem_12rem_12rem_auto] md:items-end">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Search
            <input
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={getSearchParam(params, "q") ?? ""}
              name="q"
              placeholder="Checklist, area, opened by, submitted by, reviewer, evidence"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Business date
            <input
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={businessDate}
              name="businessDate"
              type="date"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Shift
            <select
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={shiftFilter}
              name="shift"
            >
              {shiftOptions.map((shift) => (
                <option key={shift} value={shift}>
                  {shift === "ALL" ? "All shifts" : shift.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Status
            <select
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={statusFilter}
              name="status"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === "ALL" ? "All statuses" : status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Apply
            </button>
            <ButtonLink href="/branch-operations" tone="ghost" className="min-h-10">
              Clear
            </ButtonLink>
          </div>
        </form>

        {dashboard.checklists.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No checklist records yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Create or seed branch opening and closing checklist records before
              reviewing branch readiness.
            </p>
          </div>
        ) : visibleChecklists.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">
              No checklists match the filters
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Adjust search, shift, or status to widen this branch operations queue.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100 md:hidden">
              {paginatedChecklists.map((checklist) => (
                <article key={checklist.id} className="grid gap-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-950">{checklist.checklistName}</h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{checklist.businessDate} / {checklist.shiftType.toLowerCase()}</p>
                    </div>
                    <Badge tone={statusTone(checklist.status)} size="sm">{checklist.status.replaceAll("_", " ").toLowerCase()}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Progress</dt><dd className="font-bold text-slate-950">{checklist.completionPercent.toFixed(0)}%</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Exceptions</dt><dd className="font-bold text-slate-950">{checklist.exceptionCount} / {checklist.lines.length}</dd></div>
                    <div className="col-span-2"><dt className="text-xs font-semibold uppercase text-slate-500">Next reviewer</dt><dd className="font-semibold text-slate-700">{checklist.reviewedByName ?? "Pending review"}</dd></div>
                  </dl>
                  <ButtonLink href={`/branch-operations/${checklist.id}`} tone="secondary" className="min-h-10 justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100">View Detail</ButtonLink>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[62rem]">
                <div className="grid grid-cols-[1.7fr_8rem_7rem_7rem_8rem_10rem_10rem_8rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  <span>Checklist</span>
                  <span>Date</span>
                  <span>Shift</span>
                  <span>Status</span>
                  <span>Progress</span>
                  <span>Opened by</span>
                  <span>Reviewed by</span>
                  <span>Action</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {paginatedChecklists.map((checklist) => (
                    <div
                      key={checklist.id}
                      className="grid grid-cols-[1.7fr_8rem_7rem_7rem_8rem_10rem_10rem_8rem] items-center gap-3 px-4 py-4 text-sm"
                    >
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-950">{checklist.checklistName}</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {checklist.exceptionCount} exception(s) / {checklist.lines.length} line(s)
                        </p>
                      </div>
                      <p className="font-semibold text-slate-800">{checklist.businessDate}</p>
                      <p className="font-semibold capitalize text-slate-800">
                        {checklist.shiftType.toLowerCase()}
                      </p>
                      <Badge tone={statusTone(checklist.status)} size="sm">
                        {checklist.status.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                      <p className="font-bold text-slate-950">
                        {checklist.completionPercent.toFixed(0)}%
                      </p>
                      <p className="truncate font-semibold text-slate-700">
                        {checklist.openedByName ?? "Not recorded"}
                      </p>
                      <p className="truncate font-semibold text-slate-700">
                        {checklist.reviewedByName ?? "Pending review"}
                      </p>
                      <ButtonLink
                        href={`/branch-operations/${checklist.id}`}
                        tone="secondary"
                        className="min-h-10 justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
                      >
                        View Detail
                      </ButtonLink>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {showingStart}-{showingEnd} of {visibleChecklists.length} checklists
              </p>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  {currentPage > 1 ? (
                    <ButtonLink href={pageHref(currentPage - 1)} tone="secondary">
                      Previous
                    </ButtonLink>
                  ) : (
                    <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                      Previous
                    </span>
                  )}
                  <span className="font-semibold text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  {currentPage < totalPages ? (
                    <ButtonLink href={pageHref(currentPage + 1)} tone="secondary">
                      Next
                    </ButtonLink>
                  ) : (
                    <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                      Next
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
