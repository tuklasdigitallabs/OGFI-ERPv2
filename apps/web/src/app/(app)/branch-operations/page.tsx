import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState, Panel } from "@ogfi/ui";
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
  branchOperationsChecklistDetailHref,
  branchOperationsDashboardProfileHref,
  branchOperationsDashboardProfilePageHref,
  getBranchOperationsDashboardRead,
  listBranchOperationChecklistPage,
  resolveBranchOperationsDashboardParameters,
  resolveBranchOperationsDashboardRequest
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
const PAGE_SIZE = 25;

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

function nextActionLabel(status: string) {
  if (status === "SUBMITTED" || status === "MANAGER_REVIEW") return "Review";
  if (status === "RETURNED") return "Correct and resubmit";
  if (status === "REVIEWED" || status === "EXCEPTION_OPEN") return "Close or follow up";
  if (status === "CLOSED") return "No further action";
  return "Complete and submit";
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

  const canExport = canExportBranchOperations(session);
  const canCreate = session.permissionCodes.includes(
    permissions.branchOperationsCreate
  );
  const params = searchParams ? await searchParams : {};
  const dashboardRequest = resolveBranchOperationsDashboardRequest(
    params.dashboard,
    params.q
  );
  const dashboardProfile = dashboardRequest.profile;
  if (dashboardRequest.error === "PROFILE_INVALID") {
    return (
      <AppShell
        session={session}
        title="Branch Operations dashboard view unavailable"
        subtitle="The requested dashboard profile is unsupported or retired"
        activeNav="branch-operations"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="Dashboard view unavailable"
            description="This dashboard link cannot be opened safely. Return to Overview for a current Branch Operations card, or deliberately open the full Branch Operations workspace."
          />
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink className="min-h-11" href="/dashboard">Back to Overview</ButtonLink>
            <ButtonLink className="min-h-11" href="/branch-operations" tone="secondary">Open full workspace</ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }
  const feedback = getActionFeedback(params);
  const query = dashboardRequest.query;
  if (dashboardRequest.error === "SEARCH_INVALID" && dashboardProfile) {
    return (
      <AppShell
        session={session}
        title="Branch Operations dashboard view unavailable"
        subtitle="The requested dashboard search is invalid"
        activeNav="branch-operations"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="Search is too long"
            description="Dashboard-view search is limited to 120 characters. Return to the unfiltered view and try a shorter checklist, actor, line, evidence, or note search."
          />
          <div className="mt-4 flex justify-center">
            <ButtonLink className="min-h-11" href={branchOperationsDashboardProfileHref(dashboardProfile)}>Clear search</ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }
  if (dashboardRequest.error === "SEARCH_DUPLICATE" && dashboardProfile) {
    return (
      <AppShell
        session={session}
        title="Branch Operations dashboard view unavailable"
        subtitle="The requested dashboard search is invalid"
        activeNav="branch-operations"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="Use one search value"
            description="This dashboard profile accepts one optional Search value. Clear the duplicate parameters before trying again."
          />
          <div className="mt-4 flex justify-center">
            <ButtonLink className="min-h-11" href={branchOperationsDashboardProfileHref(dashboardProfile)}>Clear search</ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }
  const dashboardParameters = resolveBranchOperationsDashboardParameters(
    params,
    dashboardProfile
  );
  if (dashboardParameters.error && dashboardProfile) {
    return (
      <AppShell
        session={session}
        title="Branch Operations dashboard view unavailable"
        subtitle="The requested dashboard parameters are invalid"
        activeNav="branch-operations"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="Dashboard parameters are invalid"
            description="This dashboard profile accepts only one profile, one optional Search value, and one positive page number. Raw status, shift, date, scope, and duplicate parameters cannot redefine it."
          />
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink className="min-h-11" href={branchOperationsDashboardProfileHref(dashboardProfile)}>Open unfiltered profile</ButtonLink>
            <ButtonLink className="min-h-11" href="/dashboard" tone="secondary">Back to Overview</ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }
  const dashboardRead = await getBranchOperationsDashboardRead(session);
  const businessDate = getSearchParam(params, "businessDate") ?? "";
  const shiftFilter = normalizeOption(getSearchParam(params, "shift"), shiftOptions);
  const statusFilter = normalizeOption(getSearchParam(params, "status"), statusOptions);
  const workspace = await listBranchOperationChecklistPage(session, {
    q: query,
    ...(!dashboardProfile ? {
      businessDate,
      shift: shiftFilter,
      status: statusFilter
    } : {})
  }, {
    page: dashboardProfile
      ? dashboardParameters.page ?? 1
      : normalizePage(getSearchParam(params, "page")),
    pageSize: PAGE_SIZE,
    ...(dashboardProfile ? { dashboardProfile } : {})
  });
  const dashboard = {
    locationName: dashboardRead.locationName,
    businessDate: dashboardRead.businessDate,
    totalChecklists: dashboardRead.totalChecklists,
    completedChecklists: dashboardRead.completedChecklists,
    openExceptions: dashboardRead.openExceptions,
    criticalExceptions: dashboardRead.severityCounts.CRITICAL,
    statusCounts: dashboardRead.statusCounts,
    severityCounts: dashboardRead.severityCounts,
    averageCompletionPercent: dashboardRead.averageCompletionPercent,
    checklists: workspace.items
  };
  const paginatedChecklists = workspace.items;
  const pageHref = (page: number) => dashboardProfile
    ? branchOperationsDashboardProfilePageHref(dashboardProfile, { query, page })
    : buildQueryHref("/branch-operations", {
        q: getSearchParam(params, "q"),
        businessDate,
        shift: shiftFilter !== "ALL" ? shiftFilter : undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        page: page > 1 ? String(page) : undefined
      });
  const detailHref = (checklistId: string) =>
    branchOperationsChecklistDetailHref(checklistId, pageHref(workspace.page));
  const profileTitle = dashboardProfile === "branch-checklist-exceptions-v1"
    ? "Checklist Exceptions"
    : dashboardProfile === "branch-checklist-critical-exceptions-v1"
      ? "Critical Exception Lines"
      : "Checklist Reviews";
  const hasListFilters = Boolean(
    query ||
    (!dashboardProfile && (
      businessDate || shiftFilter !== "ALL" || statusFilter !== "ALL"
    ))
  );

  return (
    <AppShell
      session={session}
      title="Branch Operations"
      subtitle="Phase II opening, closing, readiness, and exception controls"
      activeNav="branch-operations"
    >
      <ActionFeedbackBanner feedback={feedback} />
      {dashboardProfile ? (
        <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Dashboard profile</Badge>
            <Badge tone="neutral">{session.context.companyName}</Badge>
            {session.context.brandId ? (
              <Badge tone="neutral">{session.context.brandName}</Badge>
            ) : null}
            <Badge tone="neutral">{session.context.locationName}</Badge>
          </div>
          <h2 className="mt-3 text-lg font-bold text-slate-950">{profileTitle}</h2>
          {dashboardProfile === "branch-checklist-exceptions-v1" ? (
            <p className="mt-1">
              This read-only oversight view contains {workspace.signalTotal ?? 0} exception line(s) across {workspace.totalItems} checklist(s) in the selected scope. The dashboard card counts exception lines; the register pages affected checklists.
            </p>
          ) : dashboardProfile === "branch-checklist-critical-exceptions-v1" ? (
            <p className="mt-1">
              This read-only oversight view contains {workspace.signalTotal ?? 0} retained EXCEPTION + CRITICAL line(s) across {workspace.totalItems} affected checklist(s) in the selected scope. It includes all checklist statuses and is not an unresolved-action count or historical snapshot.
            </p>
          ) : (
            <p className="mt-1">
              This read-only oversight view contains all {workspace.totalItems} submitted or manager-review checklist(s) in the selected scope. It is not a personal task queue.
            </p>
          )}
          <p className="mt-1 text-blue-900/80">
            Opening a record does not grant review, correction, or close authority. Detail actions independently recheck current role, scope, status, actor lineage, and segregation rules.
          </p>
          <ButtonLink href="/branch-operations" tone="secondary" className="mt-3 min-h-11">
            Exit dashboard view
          </ButtonLink>
        </section>
      ) : null}
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

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              {dashboardProfile ? profileTitle : "Daily Branch Readiness"}
            </h2>
            <p className="text-sm text-slate-500">
              {dashboardProfile
                ? `${dashboard.locationName} / server-owned read-only dashboard destination.`
                : `${dashboard.locationName} / opening and closing checklist source records.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dashboard.criticalExceptions > 0 ? "destructive" : "info"}>
              {dashboard.criticalExceptions} critical exceptions
            </Badge>
            {canCreate && !dashboardProfile ? (
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
            {canExport ? (!dashboardProfile ? (
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
            ) : null) : null}
          </div>
        </div>

        <form className={`grid gap-3 border-b border-slate-100 p-4 ${dashboardProfile ? "sm:grid-cols-[1fr_auto]" : "sm:grid-cols-2 lg:grid-cols-[1fr_11rem_12rem_12rem_auto]"} lg:items-end`}>
          {dashboardProfile ? <input name="dashboard" type="hidden" value={dashboardProfile} /> : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Search
            <input
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={getSearchParam(params, "q") ?? ""}
              name="q"
              placeholder="Checklist, area, opened by, submitted by, reviewer, evidence"
            />
          </label>
          {!dashboardProfile ? <label className="grid gap-1 text-sm font-medium text-slate-700">
            Business date
            <input
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={businessDate}
              name="businessDate"
              type="date"
            />
          </label> : null}
          {!dashboardProfile ? <label className="grid gap-1 text-sm font-medium text-slate-700">
            Shift
            <select
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={shiftFilter}
              name="shift"
            >
              {shiftOptions.map((shift) => (
                <option key={shift} value={shift}>
                  {shift === "ALL" ? "All shifts" : shift.toLowerCase()}
                </option>
              ))}
            </select>
          </label> : null}
          {!dashboardProfile ? <label className="grid gap-1 text-sm font-medium text-slate-700">
            Status
            <select
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={statusFilter}
              name="status"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === "ALL" ? "All statuses" : status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label> : null}
          <div className="flex gap-2">
            <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Apply
            </button>
            <ButtonLink href={dashboardProfile ? branchOperationsDashboardProfileHref(dashboardProfile) : "/branch-operations"} tone="ghost" className="min-h-11">
              Clear
            </ButtonLink>
          </div>
        </form>

        {workspace.totalItems === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">
              {hasListFilters
                ? "No checklists match the current filters"
                : dashboardProfile === "branch-checklist-exceptions-v1"
                ? "No checklists with exceptions in this scope"
                : dashboardProfile === "branch-checklist-reviews-v1"
                  ? "No submitted or manager-review checklists in this scope"
                  : dashboardProfile === "branch-checklist-critical-exceptions-v1"
                    ? "No retained critical exception lines in this scope"
                  : "No checklist records yet"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {hasListFilters
                ? dashboardProfile
                  ? "Adjust or clear the search without changing this dashboard profile."
                  : "Adjust search, business date, shift, or status to widen this Branch Operations register."
                : dashboardProfile
                ? "Return to Overview for the current dashboard state or exit this profile to open the full Branch Operations workspace."
                : "Create or seed branch opening and closing checklist records before reviewing branch readiness."}
            </p>
          </div>
        ) : workspace.items.length === 0 ? (
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
            <div className="divide-y divide-slate-100 lg:hidden">
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
                    <div>
                      <dt className="text-xs font-semibold uppercase text-slate-500">
                        {dashboardProfile === "branch-checklist-critical-exceptions-v1" ? "Critical lines" : "Exceptions"}
                      </dt>
                      <dd className="font-bold text-slate-950">
                        {dashboardProfile === "branch-checklist-critical-exceptions-v1"
                          ? checklist.lines.filter((line) => line.result === "EXCEPTION" && line.severity === "CRITICAL").length
                          : checklist.exceptionCount} / {checklist.lines.length}
                      </dd>
                    </div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Location</dt><dd className="font-semibold text-slate-700">{checklist.locationName}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Next action</dt><dd className="font-semibold text-slate-700">{nextActionLabel(checklist.status)}</dd></div>
                  </dl>
                  <ButtonLink href={detailHref(checklist.id)} tone="secondary" className="min-h-11 justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100">View Detail</ButtonLink>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto lg:block">
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
                          {dashboardProfile === "branch-checklist-critical-exceptions-v1"
                            ? `${checklist.lines.filter((line) => line.result === "EXCEPTION" && line.severity === "CRITICAL").length} critical exception line(s) / ${checklist.exceptionCount} total exception(s)`
                            : `${checklist.exceptionCount} exception(s) / ${checklist.lines.length} line(s)`}
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
                        {checklist.reviewedByName ?? "Not reviewed"}
                      </p>
                      <ButtonLink
                        href={detailHref(checklist.id)}
                        tone="secondary"
                        className="min-h-11 justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
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
                Showing {workspace.items.length === 0 ? 0 : (workspace.page - 1) * workspace.pageSize + 1}-{workspace.items.length === 0 ? 0 : Math.min((workspace.page - 1) * workspace.pageSize + workspace.items.length, workspace.totalItems)} of {workspace.totalItems} checklists
              </p>
              {workspace.totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  {workspace.page > 1 ? (
                    <ButtonLink href={pageHref(workspace.page - 1)} tone="secondary" className="min-h-11">
                      Previous
                    </ButtonLink>
                  ) : (
                    <span className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                      Previous
                    </span>
                  )}
                  <span className="font-semibold text-slate-700">
                    Page {workspace.page} of {workspace.totalPages}
                  </span>
                  {workspace.page < workspace.totalPages ? (
                    <ButtonLink href={pageHref(workspace.page + 1)} tone="secondary" className="min-h-11">
                      Next
                    </ButtonLink>
                  ) : (
                    <span className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
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
