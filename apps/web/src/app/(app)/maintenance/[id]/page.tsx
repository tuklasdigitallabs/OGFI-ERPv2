import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ArrowLeft, XCircle } from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
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
import {
  cancelMaintenanceTicket,
  completeMaintenanceTicket,
  correctMaintenanceTicket,
  getMaintenanceTicketDetail
} from "@/server/services/maintenance";

export const dynamic = "force-dynamic";

const maintenanceCategories = [
  "EQUIPMENT",
  "FACILITY",
  "UTILITIES",
  "CLEANING",
  "SAFETY",
  "OTHER"
] as const;
const maintenancePriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

async function completeMaintenanceTicketAction(formData: FormData) {
  "use server";

  const id = String(formData.get("ticketId"));
  let ticketId: string;
  try {
    ticketId = await completeMaintenanceTicket(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/maintenance/${id}`, error));
  }
  redirect(`/maintenance/${ticketId}`);
}

async function cancelMaintenanceTicketAction(formData: FormData) {
  "use server";

  const id = String(formData.get("ticketId"));
  let ticketId: string;
  try {
    ticketId = await cancelMaintenanceTicket(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/maintenance/${id}`, error));
  }
  redirect(`/maintenance/${ticketId}`);
}

async function correctMaintenanceTicketAction(formData: FormData) {
  "use server";

  const id = String(formData.get("ticketId"));
  let ticketId: string;
  try {
    ticketId = await correctMaintenanceTicket(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/maintenance/${id}`, error));
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

function sourceIncidentHref(sourceIncidentId: string | null) {
  return sourceIncidentId ? `/incidents/${sourceIncidentId}` : null;
}

export default async function MaintenanceDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseMaintenance(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const ticket = await getMaintenanceTicketDetail(session, id);
  if (!ticket) {
    notFound();
  }
  const canComplete =
    session.permissionCodes.includes(permissions.maintenanceComplete) &&
    !["COMPLETED", "CANCELLED"].includes(ticket.status) &&
    (!["CRITICAL", "HIGH"].includes(ticket.priority) ||
      (ticket.hasReporter && !ticket.reportedByCurrentUser));
  const canCorrect =
    session.permissionCodes.includes(permissions.maintenanceCorrect) &&
    ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"].includes(ticket.status);
  const today = new Date().toISOString().slice(0, 10);
  const actionFeedback = getActionFeedback(searchParams ? await searchParams : {});
  const sourceHref = sourceIncidentHref(ticket.sourceIncidentId);

  return (
    <AppShell
      session={session}
      title={ticket.title}
      subtitle="Maintenance SLA, downtime, corrective action, and evidence detail"
      activeNav="maintenance"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/maintenance" tone="ghost" className="ogfi-chip">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Maintenance
        </ButtonLink>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badgeTone(ticket.status)}>
            {ticket.status.replaceAll("_", " ").toLowerCase()}
          </Badge>
          <Badge tone={badgeTone(ticket.status, ticket.priority)}>
            {ticket.priority.toLowerCase()}
          </Badge>
          {canCorrect ? (
            <TaskSheet
              title="Correct Maintenance Details"
              description={`Update ${ticket.ticketNumber} and record why the correction is required. Existing audit history is retained.`}
              trigger="Correct Details"
              triggerClassName="border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              footer={
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
                  form="correct-maintenance-ticket"
                  type="submit"
                >
                  Save Maintenance Correction
                </button>
              }
            >
              <form
                action={correctMaintenanceTicketAction}
                className="ogfi-form-shell grid gap-3 md:grid-cols-2"
                id="correct-maintenance-ticket"
              >
                <input name="ticketId" type="hidden" value={ticket.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Requested date
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.requestedAt}
                    name="requestedAt"
                    required
                    type="date"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Target due date
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.targetDueAt ?? ""}
                    name="targetDueAt"
                    type="date"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Category
                  <select
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.category}
                    name="category"
                    required
                  >
                    {maintenanceCategories.map((category) => (
                      <option key={category} value={category}>
                        {category.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Priority
                  <select
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.priority}
                    name="priority"
                    required
                  >
                    {maintenancePriorities.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Asset
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.assetName}
                    maxLength={160}
                    name="assetName"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Area
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.assetArea}
                    maxLength={120}
                    name="assetArea"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Title
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.title}
                    maxLength={160}
                    name="title"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Description
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.description}
                    maxLength={2000}
                    name="description"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Downtime minutes
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.downtimeMinutes ?? 0}
                    min="0"
                    name="downtimeMinutes"
                    type="number"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Evidence reference
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.evidenceReference ?? ""}
                    maxLength={255}
                    name="evidenceReference"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Corrective action / follow-up
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.correctiveAction ?? ""}
                    maxLength={2000}
                    name="correctiveAction"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Correction evidence
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={255}
                    name="correctionEvidenceReference"
                    placeholder="Optional reference for this correction"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Correction reason
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={1000}
                    name="correctionReason"
                    placeholder="Explain why these maintenance details are being corrected."
                    required
                  />
                </label>
              </form>
            </TaskSheet>
          ) : null}
          {canComplete ? (
            <EntryModal title="Complete Maintenance Ticket" triggerLabel="Complete Ticket">
              <form
                action={completeMaintenanceTicketAction}
                className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2"
              >
                <input name="ticketId" type="hidden" value={ticket.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Completed date
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={today}
                    name="completedAt"
                    required
                    type="date"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Downtime minutes
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.downtimeMinutes ?? 0}
                    min="0"
                    name="downtimeMinutes"
                    type="number"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Evidence reference
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.evidenceReference ?? ""}
                    name="evidenceReference"
                    placeholder="Photo, vendor report, service ticket ref"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Corrective action completed
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={ticket.correctiveAction ?? ""}
                    name="correctiveAction"
                    placeholder="What was fixed, who verified it, and any follow-up needed"
                    required
                  />
                </label>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 md:col-span-2">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  Complete Maintenance Ticket
                </button>
              </form>
            </EntryModal>
          ) : null}
          {canComplete ? (
            <EntryModal title="Cancel Maintenance Ticket" triggerLabel="Cancel Ticket">
              <form
                action={cancelMaintenanceTicketAction}
                className="ogfi-form-shell mt-4 grid gap-3"
              >
                <input name="ticketId" type="hidden" value={ticket.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Cancellation reason
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={1000}
                    name="cancelReason"
                    placeholder="Explain why this maintenance ticket should be cancelled instead of completed"
                    required
                  />
                </label>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100">
                  <XCircle aria-hidden="true" className="h-4 w-4" />
                  Cancel Ticket
                </button>
              </form>
            </EntryModal>
          ) : null}
        </div>
      </div>

      <div className="ogfi-coordination-cue mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Phase II boundary:</strong> this detail view tracks the
              maintenance ticket source record only. Completion updates this
              ticket and its audit history; it does not approve purchasing,
              post inventory, close incidents, or create finance entries.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Evidence references and corrective actions are displayed for
              follow-up; authority remains with the owning workflow.
            </p>
          </div>
          <span>Maintenance source record</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Ticket Summary
              </h2>
              <p className="text-sm text-slate-500">
                {ticket.ticketNumber} / {ticket.locationName} / {ticket.requestedAt}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{ticket.category.toLowerCase()}</Badge>
              {ticket.sourceIncidentId ? (
                <Badge tone="info">Linked incident</Badge>
              ) : null}
            </div>
          </div>
          <div className="p-5">
            <p className="text-sm leading-6 text-slate-700">{ticket.description}</p>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Asset
              </p>
              <p className="mt-2 text-lg font-bold text-slate-950">
                {ticket.assetName}
              </p>
              <p className="text-sm font-semibold text-slate-600">
                {ticket.assetArea}
              </p>
            </div>

            {ticket.sourceIncidentId ? (
              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase text-blue-700">
                  Source incident (read-only reference)
                </p>
                <p className="mt-2 break-all text-sm font-semibold text-blue-950">
                  {ticket.sourceIncidentId}
                </p>
                <p className="mt-1 text-xs text-blue-900/70">
                  Read-only link. Completing this ticket does not resolve the incident.
                </p>
                {sourceHref ? (
                  <ButtonLink
                    href={sourceHref}
                    tone="ghost"
                    className="ogfi-chip mt-3"
                  >
                    Open Source Incident
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  SLA due
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {ticket.targetDueAt ?? "Not set"}
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Downtime
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {ticket.downtimeMinutes ?? 0}m
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Completed
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {ticket.completedAt ?? "Open"}
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Evidence
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {ticket.evidenceReference ?? "Pending"}
                </p>
              </Panel>
            </div>

            <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Corrective action
              </p>
              <p className="mt-2 text-sm font-semibold text-amber-950">
                {ticket.correctiveAction ?? "Pending corrective action"}
              </p>
            </div>
          </div>

          <section className="mt-5 border-t border-slate-100 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Same Asset History
                </h2>
                <p className="text-sm text-slate-500">
                  Prior tickets for {ticket.assetName} at {ticket.locationName}.
                </p>
              </div>
              <Badge tone="info">{ticket.history.length} prior</Badge>
            </div>

            {ticket.history.length === 0 ? (
              <div className="ogfi-empty-state mt-4">
                <p className="font-semibold text-slate-900">
                  No prior same-asset tickets
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  This location has no earlier maintenance records for this asset.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {ticket.history.map((historyTicket) => (
                  <Panel
                    key={historyTicket.id}
                    className="border border-slate-200 bg-white shadow-none"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-950">
                            {historyTicket.ticketNumber}
                          </h3>
                          <Badge tone={badgeTone(historyTicket.status)}>
                            {historyTicket.status
                              .replaceAll("_", " ")
                              .toLowerCase()}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {historyTicket.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {historyTicket.requestedAt} / {historyTicket.assetArea}
                        </p>
                      </div>
                      <ButtonLink
                        href={`/maintenance/${historyTicket.id}`}
                        tone="ghost"
                        className="ogfi-chip"
                      >
                        View Ticket
                      </ButtonLink>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Downtime
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-950">
                          {historyTicket.downtimeMinutes ?? 0}m
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Corrective action
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {historyTicket.correctiveAction ?? "Pending"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Evidence
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {historyTicket.evidenceReference ?? "Pending"}
                        </p>
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </section>
        </section>

        <aside className="grid gap-4 content-start">
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Scope</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {ticket.locationName}
            </p>
          </Panel>
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Reported by</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {ticket.reportedByName ?? "Not recorded"}
            </p>
          </Panel>
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Owner</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {ticket.ownerName ?? "Unassigned"}
            </p>
          </Panel>
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Priority</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {ticket.priority.replaceAll("_", " ").toLowerCase()}
            </p>
          </Panel>
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Next action</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {ticket.completedAt
                ? "Review completion evidence and retain ticket history."
                : canComplete
                  ? "Complete this ticket after the fix is verified and evidence is attached."
                  : ["CRITICAL", "HIGH"].includes(ticket.priority) &&
                      (!ticket.hasReporter || ticket.reportedByCurrentUser)
                    ? "This high-risk ticket requires a known reporter and a different authorized maintainer for completion or cancellation."
                  : "Coordinate owner/vendor follow-up and ask an authorized maintainer to complete the ticket after verification."}
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
