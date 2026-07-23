import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { TaskSheet } from "@/components/TaskSheet";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseIncidents,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportIncidents } from "@/server/services/exportAuthorization";
import {
  createOperationalIncident,
  getIncidentDashboardRead,
  listIncidentPage
} from "@/server/services/incidents";

export const dynamic = "force-dynamic";

const statusOptions = [
  "ALL",
  "OPEN",
  "IN_PROGRESS",
  "PENDING_REVIEW",
  "RESOLVED",
  "CANCELLED"
] as const;
const severityOptions = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const createSeverityOptions = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const createCategoryOptions = [
  "FOOD_SAFETY",
  "CUSTOMER_COMPLAINT",
  "EQUIPMENT",
  "INVENTORY",
  "SERVICE",
  "STAFFING",
  "OTHER"
] as const;
const PAGE_SIZE = 25;

async function createIncidentAction(formData: FormData) {
  "use server";

  let incidentId: string;
  try {
    incidentId = await createOperationalIncident(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/incidents", error));
  }
  redirect(`/incidents/${incidentId}`);
}

function badgeTone(status: string, severity?: string) {
  if (severity === "CRITICAL") {
    return "destructive" as const;
  }
  if (status === "OPEN" || status === "IN_PROGRESS" || status === "PENDING_REVIEW") {
    return "warning" as const;
  }
  if (status === "RESOLVED") {
    return "success" as const;
  }
  if (status === "CANCELLED") {
    return "neutral" as const;
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

function sourceRecordHref(sourceRecordType: string | null, sourceRecordId: string | null) {
  if (!sourceRecordId) {
    return null;
  }
  if (sourceRecordType === "BranchOperationalChecklist") {
    return `/branch-operations/${sourceRecordId}`;
  }
  if (sourceRecordType === "FoodSafetyLog") {
    return `/food-safety/${sourceRecordId}`;
  }
  if (sourceRecordType === "MaintenanceTicket") {
    return `/maintenance/${sourceRecordId}`;
  }
  return null;
}

export default async function IncidentsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseIncidents(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboardRead = await getIncidentDashboardRead(session);
  const canExport = canExportIncidents(session);
  const canCreateIncident = session.permissionCodes.includes(permissions.incidentCreate);
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const query = (getSearchParam(params, "q") ?? "").trim().toLowerCase();
  const incidentDate = getSearchParam(params, "incidentDate") ?? "";
  const statusFilter = normalizeOption(getSearchParam(params, "status"), statusOptions);
  const severityFilter = normalizeOption(
    getSearchParam(params, "severity"),
    severityOptions
  );
  let workspace;
  try {
    workspace = await listIncidentPage(session, {
      q: query,
      incidentDate,
      status: statusFilter,
      severity: severityFilter
    }, { page: normalizePage(getSearchParam(params, "page")), pageSize: PAGE_SIZE });
  } catch (error) {
    redirect(actionErrorRedirectPath("/incidents", error));
  }
  const dashboard = {
    locationName: session.context.locationName,
    totalIncidents: dashboardRead.totalIncidents,
    openIncidents: dashboardRead.openIncidents,
    criticalIncidents: dashboardRead.criticalIncidents,
    overdueIncidents: dashboardRead.overdueIncidents,
    statusCounts: dashboardRead.statusCounts,
    severityCounts: dashboardRead.severityCounts,
    incidents: workspace.items
  };
  const paginatedIncidents = workspace.items;
  const pageHref = (page: number) =>
    buildQueryHref("/incidents", {
      q: getSearchParam(params, "q"),
      incidentDate,
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      severity: severityFilter !== "ALL" ? severityFilter : undefined,
      page: page > 1 ? String(page) : undefined
    });

  return (
    <AppShell
      session={session}
      title="Incident Management"
      subtitle="Phase II branch incident visibility, ownership, corrective actions, and evidence"
      activeNav="incidents"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Phase II boundary:</strong> incidents collect operational
              follow-up, owner, due date, corrective action, source-link, and
              evidence references. Viewing an incident does not approve inventory,
              maintenance, food-safety, or finance actions.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Source records remain authoritative for controlled stock,
              compliance, and approval state changes.
            </p>
          </div>
          <span>Read-only incident foundation</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Incidents</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.totalIncidents}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Open</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.openIncidents}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Critical</p>
          <p className="mt-2 text-3xl font-bold text-red-700">
            {dashboard.criticalIncidents}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {dashboard.overdueIncidents}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Incident Queue
            </h2>
            <p className="text-sm text-slate-500">
              {dashboard.locationName} / operational exceptions and corrective
              action follow-up.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dashboard.criticalIncidents > 0 ? "destructive" : "info"}>
              {dashboard.criticalIncidents} critical
            </Badge>
            {canCreateIncident ? (
              <TaskSheet
                title="Log Incident"
                description={`Capture the incident, corrective follow-up, and evidence for ${dashboard.locationName}.`}
                trigger="Log Incident"
                triggerClassName="border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                footer={
                  <button
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
                    form="create-incident"
                    type="submit"
                  >
                    Log Incident
                  </button>
                }
              >
                <form
                  action={createIncidentAction}
                  className="ogfi-form-shell grid gap-3 md:grid-cols-2"
                  id="create-incident"
                >
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Incident date
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="incidentDate"
                      required
                      type="date"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Due date
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="dueAt"
                      type="date"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Category
                    <select
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="category"
                      required
                    >
                      {createCategoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Severity
                    <select
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="severity"
                      required
                    >
                      {createSeverityOptions.map((severity) => (
                        <option key={severity} value={severity}>
                          {severity}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Title
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      maxLength={160}
                      name="title"
                      placeholder="Short incident title"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Summary
                    <textarea
                      className="min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      maxLength={2000}
                      name="summary"
                      placeholder="What happened, where, and immediate impact"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Corrective action
                    <textarea
                      className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      maxLength={2000}
                      name="correctiveAction"
                      placeholder="Immediate containment or follow-up action"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Evidence reference
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      maxLength={255}
                      name="evidenceReference"
                      placeholder="Photo, report, or file reference"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Source record type
                    <select
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="sourceRecordType"
                    >
                      <option value="">No linked source</option>
                      <option value="BranchOperationalChecklist">
                        Branch checklist
                      </option>
                      <option value="FoodSafetyLog">Food-safety log</option>
                      <option value="MaintenanceTicket">Maintenance ticket</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Source record ID
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="sourceRecordId"
                      placeholder="Optional UUID read-only link"
                    />
                  </label>
                </form>
              </TaskSheet>
            ) : null}
            {canExport ? (
              <ButtonLink
                href={buildQueryHref("/incidents/export", {
                  q: query || null,
                  incidentDate: incidentDate || null,
                  status: statusFilter === "ALL" ? null : statusFilter,
                  severity: severityFilter === "ALL" ? null : severityFilter
                })}
                tone="ghost"
                className="ogfi-chip"
              >
                Export Incident CSV
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
              placeholder="Incident number, title, category, reporter, owner, evidence"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Incident date
            <input
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={incidentDate}
              name="incidentDate"
              type="date"
            />
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
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Severity
            <select
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={severityFilter}
              name="severity"
            >
              {severityOptions.map((severity) => (
                <option key={severity} value={severity}>
                  {severity === "ALL" ? "All severities" : severity}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Apply
            </button>
            <ButtonLink href="/incidents" tone="ghost" className="min-h-10">
              Clear
            </ButtonLink>
          </div>
        </form>

        {workspace.totalItems === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No incident records yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Create or seed branch incidents before reviewing the incident queue.
            </p>
          </div>
        ) : workspace.items.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No incidents match the filters</p>
            <p className="mt-1 text-sm text-slate-600">
              Adjust search, status, or severity to widen this incident queue.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-4 xl:hidden">
              {paginatedIncidents.map((incident) => {
                const sourceHref = sourceRecordHref(
                  incident.sourceRecordType,
                  incident.sourceRecordId
                );
                return (
                  <article
                    key={incident.id}
                    className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="break-words font-bold text-slate-950">
                          {incident.title}
                        </h3>
                        <p className="mt-1 break-words text-xs font-semibold text-slate-500">
                          {incident.incidentNumber} / {incident.category.replaceAll("_", " ").toLowerCase()}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Badge tone={badgeTone(incident.status)} size="sm">
                          {incident.status.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                        <Badge tone={badgeTone(incident.status, incident.severity)} size="sm">
                          {incident.severity.toLowerCase()}
                        </Badge>
                      </div>
                    </div>
                    <dl className="mt-4 grid min-w-0 grid-cols-2 gap-3 text-sm">
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase text-slate-500">Location</dt>
                        <dd className="mt-1 break-words font-semibold text-slate-800">{dashboard.locationName}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase text-slate-500">Incident date</dt>
                        <dd className="mt-1 font-semibold text-slate-800">{incident.incidentDate}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase text-slate-500">Owner</dt>
                        <dd className="mt-1 break-words font-semibold text-slate-800">{incident.ownerName ?? "Unassigned"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase text-slate-500">Due / next action</dt>
                        <dd className="mt-1 break-words font-semibold text-slate-800">{incident.dueAt ?? "Assign a due date"}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
                      {sourceHref ? (
                        <ButtonLink href={sourceHref} tone="ghost" className="min-h-10 justify-center sm:w-auto">
                          Open Source
                        </ButtonLink>
                      ) : incident.sourceRecordId ? (
                        <span className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-600">
                          Source unavailable
                        </span>
                      ) : null}
                      <ButtonLink
                        href={`/incidents/${incident.id}`}
                        tone="secondary"
                        className="min-h-10 justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
                      >
                        View Incident
                      </ButtonLink>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <div className="min-w-[72rem]">
                <div className="grid grid-cols-[1.8fr_9rem_8rem_8rem_10rem_10rem_8rem_8rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  <span>Incident</span>
                  <span>Date</span>
                  <span>Status</span>
                  <span>Severity</span>
                  <span>Owner</span>
                  <span>Due</span>
                  <span>Source</span>
                  <span>Action</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {paginatedIncidents.map((incident) => {
                    const sourceHref = sourceRecordHref(
                      incident.sourceRecordType,
                      incident.sourceRecordId
                    );
                    return (
                      <div
                        key={incident.id}
                        className="grid grid-cols-[1.8fr_9rem_8rem_8rem_10rem_10rem_8rem_8rem] items-center gap-3 px-4 py-4 text-sm"
                      >
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-slate-950">
                            {incident.title}
                          </h3>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {incident.incidentNumber} /{" "}
                            {incident.category.replaceAll("_", " ").toLowerCase()}
                          </p>
                        </div>
                        <p className="font-semibold text-slate-800">{incident.incidentDate}</p>
                        <Badge tone={badgeTone(incident.status)} size="sm">
                          {incident.status.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                        <Badge tone={badgeTone(incident.status, incident.severity)} size="sm">
                          {incident.severity.toLowerCase()}
                        </Badge>
                        <p className="truncate font-semibold text-slate-700">
                          {incident.ownerName ?? "Unassigned"}
                        </p>
                        <p className="font-semibold text-slate-700">
                          {incident.dueAt ?? "Not set"}
                        </p>
                        {sourceHref ? (
                          <ButtonLink href={sourceHref} tone="ghost" className="ogfi-chip">
                            Source
                          </ButtonLink>
                        ) : incident.sourceRecordId ? (
                          <Badge tone="neutral">Unavailable</Badge>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">None</span>
                        )}
                        <ButtonLink
                          href={`/incidents/${incident.id}`}
                          tone="secondary"
                          className="min-h-10 justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
                        >
                          View Detail
                        </ButtonLink>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {workspace.items.length === 0 ? 0 : (workspace.page - 1) * workspace.pageSize + 1}-{workspace.items.length === 0 ? 0 : Math.min((workspace.page - 1) * workspace.pageSize + workspace.items.length, workspace.totalItems)} of {workspace.totalItems} incidents
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
