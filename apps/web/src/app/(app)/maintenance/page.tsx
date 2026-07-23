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
  canUseMaintenance,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportMaintenance } from "@/server/services/exportAuthorization";
import {
  createMaintenanceTicket,
  getMaintenanceDashboardRead,
  listMaintenanceTicketPage
} from "@/server/services/maintenance";

export const dynamic = "force-dynamic";

const statusOptions = [
  "ALL",
  "OPEN",
  "IN_PROGRESS",
  "PENDING_VENDOR",
  "COMPLETED",
  "CANCELLED"
] as const;
const priorityOptions = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const createPriorityOptions = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const createCategoryOptions = [
  "EQUIPMENT",
  "FACILITY",
  "UTILITIES",
  "CLEANING",
  "SAFETY",
  "OTHER"
] as const;
const PAGE_SIZE = 25;

async function createMaintenanceTicketAction(formData: FormData) {
  "use server";

  let ticketId: string;
  try {
    ticketId = await createMaintenanceTicket(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/maintenance", error));
  }
  redirect(`/maintenance/${ticketId}`);
}

function badgeTone(status: string, priority?: string) {
  if (priority === "CRITICAL") {
    return "destructive" as const;
  }
  if (status === "OPEN" || status === "IN_PROGRESS" || status === "PENDING_VENDOR") {
    return "warning" as const;
  }
  if (status === "COMPLETED" || status === "CANCELLED") {
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

function sourceIncidentHref(sourceIncidentId: string | null) {
  return sourceIncidentId ? `/incidents/${sourceIncidentId}` : null;
}

export default async function MaintenancePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseMaintenance(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboardRead = await getMaintenanceDashboardRead(session);
  const canExport = canExportMaintenance(session);
  const canCreate = session.permissionCodes.includes(permissions.maintenanceCreate);
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const query = (getSearchParam(params, "q") ?? "").trim().toLowerCase();
  const requestedAt = getSearchParam(params, "requestedAt") ?? "";
  const statusFilter = normalizeOption(getSearchParam(params, "status"), statusOptions);
  const priorityFilter = normalizeOption(
    getSearchParam(params, "priority"),
    priorityOptions
  );
  let workspace;
  try {
    workspace = await listMaintenanceTicketPage(session, {
      q: query,
      requestedAt,
      status: statusFilter,
      priority: priorityFilter
    }, { page: normalizePage(getSearchParam(params, "page")), pageSize: PAGE_SIZE });
  } catch (error) {
    redirect(actionErrorRedirectPath("/maintenance", error));
  }
  const dashboard = {
    locationName: session.context.locationName,
    totalTickets: dashboardRead.totalTickets,
    openTickets: dashboardRead.openTickets,
    criticalTickets: dashboardRead.criticalTickets,
    overdueTickets: dashboardRead.overdueTickets,
    downtimeMinutes: dashboardRead.downtimeMinutes,
    statusCounts: dashboardRead.statusCounts,
    priorityCounts: dashboardRead.priorityCounts,
    tickets: workspace.items
  };
  const paginatedTickets = workspace.items;
  const pageHref = (page: number) =>
    buildQueryHref("/maintenance", {
      q: getSearchParam(params, "q"),
      requestedAt,
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      priority: priorityFilter !== "ALL" ? priorityFilter : undefined,
      page: page > 1 ? String(page) : undefined
    });

  return (
    <AppShell
      session={session}
      title="Maintenance"
      subtitle="Phase II equipment and facility ticket visibility"
      activeNav="maintenance"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Phase II boundary:</strong> maintenance tickets track
              asset, priority, downtime, SLA due date, corrective action, and
              evidence references. They do not approve purchasing, post inventory,
              or close incident records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Equipment history remains a maintenance source record and may link
              to incidents without mutating them.
            </p>
          </div>
          <span>Maintenance source records</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Tickets</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.totalTickets}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Open</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.openTickets}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Critical</p>
          <p className="mt-2 text-3xl font-bold text-red-700">
            {dashboard.criticalTickets}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {dashboard.overdueTickets}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Downtime</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.downtimeMinutes}m
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Maintenance Ticket Queue
            </h2>
            <p className="text-sm text-slate-500">
              {dashboard.locationName} / equipment and facility maintenance
              follow-up.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dashboard.criticalTickets > 0 ? "destructive" : "info"}>
              {dashboard.criticalTickets} critical
            </Badge>
            {canCreate ? (
              <TaskSheet
                title="Create Maintenance Ticket"
                description={`Record the asset issue, SLA target, downtime, and evidence for ${dashboard.locationName}.`}
                trigger="Create Ticket"
                triggerClassName="border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                footer={
                  <button
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
                    form="create-maintenance-ticket"
                    type="submit"
                  >
                    Create Maintenance Ticket
                  </button>
                }
              >
                <form
                  action={createMaintenanceTicketAction}
                  className="ogfi-form-shell grid gap-3 md:grid-cols-2"
                  id="create-maintenance-ticket"
                >
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Requested date
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="requestedAt"
                      required
                      type="date"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Target due date
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="targetDueAt"
                      type="date"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Category
                    <select
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="category"
                    >
                      {createCategoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Priority
                    <select
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="priority"
                    >
                      {createPriorityOptions.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Asset name
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="assetName"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Asset area
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="assetArea"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Title
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="title"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Description
                    <textarea
                      className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="description"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Downtime minutes
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      min="0"
                      name="downtimeMinutes"
                      type="number"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Evidence reference
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="evidenceReference"
                      placeholder="Photo, vendor report, ticket ref"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Source incident ID
                    <input
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="sourceIncidentId"
                      placeholder="Optional incident UUID read-only link"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Corrective action
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                      name="correctiveAction"
                      placeholder="Initial action or requested vendor response"
                    />
                  </label>
                </form>
              </TaskSheet>
            ) : null}
            {canExport ? (
              <ButtonLink
                href={buildQueryHref("/maintenance/export", {
                  q: query || null,
                  requestedAt: requestedAt || null,
                  status: statusFilter === "ALL" ? null : statusFilter,
                  priority: priorityFilter === "ALL" ? null : priorityFilter
                })}
                tone="ghost"
                className="ogfi-chip"
              >
                Export Maintenance CSV
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
              placeholder="Ticket, asset, area, reporter, owner, evidence"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Requested date
            <input
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={requestedAt}
              name="requestedAt"
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
            Priority
            <select
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={priorityFilter}
              name="priority"
            >
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {priority === "ALL" ? "All priorities" : priority}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Apply
            </button>
            <ButtonLink href="/maintenance" tone="ghost" className="min-h-10">
              Clear
            </ButtonLink>
          </div>
        </form>

        {dashboard.totalTickets === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No maintenance tickets yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Create or seed maintenance tickets before reviewing equipment and
              facility follow-up.
            </p>
          </div>
        ) : workspace.items.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No tickets match the filters</p>
            <p className="mt-1 text-sm text-slate-600">
              Adjust search, status, or priority to widen this maintenance queue.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-4 xl:hidden">
              {paginatedTickets.map((ticket) => {
                const sourceHref = sourceIncidentHref(ticket.sourceIncidentId);
                return (
                  <article
                    key={ticket.id}
                    className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="break-words font-bold text-slate-950">{ticket.title}</h3>
                        <p className="mt-1 break-words text-xs font-semibold text-slate-500">
                          {ticket.ticketNumber} / {ticket.category.toLowerCase()}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Badge tone={badgeTone(ticket.status)} size="sm">
                          {ticket.status.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                        <Badge tone={badgeTone(ticket.status, ticket.priority)} size="sm">
                          {ticket.priority.toLowerCase()}
                        </Badge>
                      </div>
                    </div>
                    <dl className="mt-4 grid min-w-0 grid-cols-2 gap-3 text-sm">
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase text-slate-500">Location</dt>
                        <dd className="mt-1 break-words font-semibold text-slate-800">{dashboard.locationName}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase text-slate-500">Requested</dt>
                        <dd className="mt-1 font-semibold text-slate-800">{ticket.requestedAt}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase text-slate-500">Asset / area</dt>
                        <dd className="mt-1 break-words font-semibold text-slate-800">{ticket.assetName} / {ticket.assetArea}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase text-slate-500">Owner</dt>
                        <dd className="mt-1 break-words font-semibold text-slate-800">{ticket.ownerName ?? "Unassigned"}</dd>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <dt className="text-xs font-semibold uppercase text-slate-500">SLA due / next action</dt>
                        <dd className="mt-1 break-words font-semibold text-slate-800">{ticket.targetDueAt ?? "Assign an SLA due date"}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
                      {sourceHref ? (
                        <ButtonLink href={sourceHref} tone="ghost" className="min-h-10 justify-center sm:w-auto">
                          Open Incident
                        </ButtonLink>
                      ) : null}
                      <ButtonLink
                        href={`/maintenance/${ticket.id}`}
                        tone="secondary"
                        className="min-h-10 justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
                      >
                        View Ticket
                      </ButtonLink>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <div className="min-w-[74rem]">
                <div className="grid grid-cols-[1.7fr_8rem_8rem_8rem_10rem_10rem_8rem_8rem_8rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  <span>Ticket</span>
                  <span>Requested</span>
                  <span>Status</span>
                  <span>Priority</span>
                  <span>Asset</span>
                  <span>Owner</span>
                  <span>Due</span>
                  <span>Source</span>
                  <span>Action</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {paginatedTickets.map((ticket) => {
                    const sourceHref = sourceIncidentHref(ticket.sourceIncidentId);
                    return (
                      <div
                        key={ticket.id}
                        className="grid grid-cols-[1.7fr_8rem_8rem_8rem_10rem_10rem_8rem_8rem_8rem] items-center gap-3 px-4 py-4 text-sm"
                      >
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-slate-950">{ticket.title}</h3>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {ticket.ticketNumber} / {ticket.category.toLowerCase()}
                          </p>
                        </div>
                        <p className="font-semibold text-slate-800">{ticket.requestedAt}</p>
                        <Badge tone={badgeTone(ticket.status)} size="sm">
                          {ticket.status.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                        <Badge tone={badgeTone(ticket.status, ticket.priority)} size="sm">
                          {ticket.priority.toLowerCase()}
                        </Badge>
                        <p className="truncate font-semibold text-slate-700">
                          {ticket.assetName} / {ticket.assetArea}
                        </p>
                        <p className="truncate font-semibold text-slate-700">
                          {ticket.ownerName ?? "Unassigned"}
                        </p>
                        <p className="font-semibold text-slate-700">
                          {ticket.targetDueAt ?? "Not set"}
                        </p>
                        {sourceHref ? (
                          <ButtonLink href={sourceHref} tone="ghost" className="ogfi-chip">
                            Source
                          </ButtonLink>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">None</span>
                        )}
                        <ButtonLink
                          href={`/maintenance/${ticket.id}`}
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
                Showing {workspace.items.length === 0 ? 0 : (workspace.page - 1) * workspace.pageSize + 1}-{workspace.items.length === 0 ? 0 : Math.min((workspace.page - 1) * workspace.pageSize + workspace.items.length, workspace.totalItems)} of {workspace.totalItems} tickets
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
