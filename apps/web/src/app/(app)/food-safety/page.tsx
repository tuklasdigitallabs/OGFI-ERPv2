import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { FoodSafetyReadingsEditor } from "@/components/FoodSafetyReadingsEditor";
import { TaskSheet } from "@/components/TaskSheet";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseFoodSafety,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportFoodSafety } from "@/server/services/exportAuthorization";
import {
  createFoodSafetyLog,
  getFoodSafetyDashboardRead,
  listFoodSafetyLogPage
} from "@/server/services/foodSafety";

export const dynamic = "force-dynamic";

const logTypeOptions = [
  "ALL",
  "TEMPERATURE",
  "SANITATION",
  "OPENING",
  "CLOSING"
] as const;
const createLogTypeOptions = ["TEMPERATURE", "SANITATION", "OPENING", "CLOSING"] as const;
const statusOptions = [
  "ALL",
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED",
  "RETURNED",
  "REVIEWED",
  "CLOSED",
  "EXCEPTION_OPEN",
  "EXCEPTION_REVIEW"
] as const;
const readingResultOptions = ["PASS", "EXCEPTION", "NOT_APPLICABLE"] as const;
const readingSeverityOptions = ["NORMAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const PAGE_SIZE = 25;

async function createFoodSafetyLogAction(formData: FormData) {
  "use server";

  let logId: string;
  try {
    logId = await createFoodSafetyLog(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/food-safety", error));
  }
  redirect(`/food-safety/${logId}`);
}

function badgeToneFor(status: string, severity?: string) {
  if (severity === "CRITICAL") {
    return "destructive" as const;
  }
  if (
    status === "SUBMITTED" ||
    status === "RETURNED" ||
    status === "EXCEPTION" ||
    status.includes("EXCEPTION")
  ) {
    return "warning" as const;
  }
  if (status === "PASS" || status === "REVIEWED" || status === "CLOSED") {
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

export default async function FoodSafetyPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseFoodSafety(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboardRead = await getFoodSafetyDashboardRead(session);
  const canExport = canExportFoodSafety(session);
  const canCreate = session.permissionCodes.includes(permissions.foodSafetyCreate);
  const params = searchParams ? await searchParams : {};
  const feedback = getActionFeedback(params);
  const query = (getSearchParam(params, "q") ?? "").trim().toLowerCase();
  const businessDate = getSearchParam(params, "businessDate") ?? "";
  const logTypeFilter = normalizeOption(getSearchParam(params, "type"), logTypeOptions);
  const statusFilter = normalizeOption(getSearchParam(params, "status"), statusOptions);
  let workspace;
  try {
    workspace = await listFoodSafetyLogPage(session, {
      q: query,
      businessDate,
      type: logTypeFilter,
      status: statusFilter
    }, { page: normalizePage(getSearchParam(params, "page")), pageSize: PAGE_SIZE });
  } catch (error) {
    redirect(actionErrorRedirectPath("/food-safety", error));
  }
  const dashboard = {
    locationName: dashboardRead.locationName,
    businessDate: dashboardRead.businessDate,
    totalLogs: dashboardRead.totalLogs,
    reviewedLogs: dashboardRead.reviewedLogs,
    totalReadings: dashboardRead.totalReadings,
    exceptionCount: dashboardRead.exceptionCount,
    criticalExceptions: dashboardRead.severityCounts.CRITICAL,
    statusCounts: dashboardRead.statusCounts,
    severityCounts: dashboardRead.severityCounts,
    logs: workspace.items
  };
  const paginatedLogs = workspace.items;
  const pageHref = (page: number) =>
    buildQueryHref("/food-safety", {
      q: getSearchParam(params, "q"),
      businessDate,
      type: logTypeFilter !== "ALL" ? logTypeFilter : undefined,
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      page: page > 1 ? String(page) : undefined
    });

  return (
    <AppShell
      session={session}
      title="Food Safety"
      subtitle="Phase II temperature, sanitation, compliance, and exception logs"
      activeNav="food-safety"
    >
      <ActionFeedbackBanner feedback={feedback} />
      <div className="ogfi-coordination-cue mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Phase II boundary:</strong> food-safety logs capture
              readings, sanitation sign-offs, corrective actions, and evidence
              references. They do not post inventory movements or replace formal
              incident records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Exception rows are compliance follow-up signals for the selected
              branch context.
            </p>
          </div>
          <span>Read-only compliance foundation</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Business date</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {dashboard.businessDate ?? "No log"}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Logs</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.totalLogs}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Readings</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {dashboard.totalReadings}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Exceptions</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.exceptionCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Critical</p>
          <p className="mt-2 text-3xl font-bold text-red-700">
            {dashboard.criticalExceptions}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Food Safety Logbook
            </h2>
            <p className="text-sm text-slate-500">
              {dashboard.locationName} / temperature, sanitation, and corrective
              action source records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dashboard.criticalExceptions > 0 ? "destructive" : "info"}>
              {dashboard.reviewedLogs} reviewed logs
            </Badge>
            {canCreate ? (
              <TaskSheet
                title="Record Food-Safety Log"
                description="Capture temperature, sanitation, opening, or closing readings. Exceptions remain controlled source-record follow-up."
                trigger="Record Log"
                triggerClassName="border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                size="workspace"
                bodyScroll="contained"
                bodyClassName="p-0"
                footer={<button className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto" form="create-food-safety-log" type="submit">Record Food-Safety Log</button>}
              >
                <FoodSafetyReadingsEditor
                  action={createFoodSafetyLogAction}
                  logTypeOptions={createLogTypeOptions}
                  resultOptions={readingResultOptions}
                  severityOptions={readingSeverityOptions}
                  formId="create-food-safety-log"
                />
              </TaskSheet>
            ) : null}
            {canExport ? (
              <ButtonLink
                href={buildQueryHref("/food-safety/export", {
                  q: query || null,
                  businessDate: businessDate || null,
                  type: logTypeFilter === "ALL" ? null : logTypeFilter,
                  status: statusFilter === "ALL" ? null : statusFilter
                })}
                tone="ghost"
                className="ogfi-chip"
              >
                Export Food-Safety CSV
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
              placeholder="Log, station, recorder, reviewer, action, evidence"
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
            Type
            <select
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={logTypeFilter}
              name="type"
            >
              {logTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type === "ALL" ? "All types" : type.toLowerCase()}
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
            <ButtonLink href="/food-safety" tone="ghost" className="min-h-10">
              Clear
            </ButtonLink>
          </div>
        </form>

        {workspace.totalItems === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No food-safety logs yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Create or seed temperature and sanitation logs before reviewing
              compliance status.
            </p>
          </div>
        ) : workspace.items.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">
              No food-safety logs match the filters
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Adjust search, type, or status to widen this compliance queue.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100 md:hidden">
              {paginatedLogs.map((log) => (
                <article key={log.id} className="grid gap-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="font-bold text-slate-950">{log.title}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{log.businessDate} / {log.logType.toLowerCase()}</p></div>
                    <Badge tone={badgeToneFor(log.status)} size="sm">{log.status.replaceAll("_", " ").toLowerCase()}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Readings</dt><dd className="font-bold text-slate-950">{log.readingCount ?? log.readings.length}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Exceptions</dt><dd className="font-bold text-slate-950">{log.exceptionCount}</dd></div>
                    <div className="col-span-2"><dt className="text-xs font-semibold uppercase text-slate-500">Reviewer</dt><dd className="font-semibold text-slate-700">{log.reviewedByName ?? "Pending review"}</dd></div>
                  </dl>
                  <ButtonLink href={`/food-safety/${log.id}`} tone="secondary" className="min-h-10 justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100">View Detail</ButtonLink>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[62rem]">
                <div className="grid grid-cols-[1.7fr_8rem_8rem_8rem_8rem_10rem_10rem_8rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  <span>Log</span>
                  <span>Date</span>
                  <span>Type</span>
                  <span>Status</span>
                  <span>Exceptions</span>
                  <span>Recorded by</span>
                  <span>Reviewed by</span>
                  <span>Action</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {paginatedLogs.map((log) => (
                    <div
                      key={log.id}
                      className="grid grid-cols-[1.7fr_8rem_8rem_8rem_8rem_10rem_10rem_8rem] items-center gap-3 px-4 py-4 text-sm"
                    >
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-950">{log.title}</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {log.readingCount ?? log.readings.length} reading(s)
                        </p>
                      </div>
                      <p className="font-semibold text-slate-800">{log.businessDate}</p>
                      <p className="font-semibold capitalize text-slate-800">
                        {log.logType.toLowerCase()}
                      </p>
                      <Badge tone={badgeToneFor(log.status)} size="sm">
                        {log.status.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                      <Badge tone={log.exceptionCount > 0 ? "warning" : "success"} size="sm">
                        {log.exceptionCount}
                      </Badge>
                      <p className="truncate font-semibold text-slate-700">
                        {log.recordedByName ?? "Not recorded"}
                      </p>
                      <p className="truncate font-semibold text-slate-700">
                        {log.reviewedByName ?? "Pending review"}
                      </p>
                      <ButtonLink
                        href={`/food-safety/${log.id}`}
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
                Showing {workspace.items.length === 0 ? 0 : (workspace.page - 1) * workspace.pageSize + 1}-{workspace.items.length === 0 ? 0 : Math.min((workspace.page - 1) * workspace.pageSize + workspace.items.length, workspace.totalItems)} of {workspace.totalItems} logs
              </p>
              {workspace.totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  {workspace.page > 1 ? (
                    <ButtonLink href={pageHref(workspace.page - 1)} tone="secondary" className="min-h-11">
                      Previous
                    </ButtonLink>
                  ) : (
                    <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
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
