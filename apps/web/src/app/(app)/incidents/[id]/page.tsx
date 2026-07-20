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
  canUseIncidents,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  cancelOperationalIncident,
  correctOperationalIncident,
  getOperationalIncidentSummary,
  resolveOperationalIncident
} from "@/server/services/incidents";

export const dynamic = "force-dynamic";

const incidentCategories = [
  "FOOD_SAFETY",
  "CUSTOMER_COMPLAINT",
  "EQUIPMENT",
  "INVENTORY",
  "SERVICE",
  "STAFFING",
  "OTHER"
] as const;
const incidentSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

async function resolveOperationalIncidentAction(formData: FormData) {
  "use server";

  const id = String(formData.get("incidentId"));
  let incidentId: string;
  try {
    incidentId = await resolveOperationalIncident(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/incidents/${id}`, error));
  }
  redirect(`/incidents/${incidentId}`);
}

async function cancelOperationalIncidentAction(formData: FormData) {
  "use server";

  const id = String(formData.get("incidentId"));
  let incidentId: string;
  try {
    incidentId = await cancelOperationalIncident(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/incidents/${id}`, error));
  }
  redirect(`/incidents/${incidentId}`);
}

async function correctOperationalIncidentAction(formData: FormData) {
  "use server";

  const id = String(formData.get("incidentId"));
  let incidentId: string;
  try {
    incidentId = await correctOperationalIncident(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/incidents/${id}`, error));
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
  if (status === "RESOLVED" || status === "CANCELLED") {
    return "success" as const;
  }
  return "info" as const;
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

export default async function IncidentDetailPage({
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
  if (!canUseIncidents(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const incident = await getOperationalIncidentSummary(session, id);
  if (!incident) {
    notFound();
  }
  const canResolve =
    session.permissionCodes.includes(permissions.incidentResolve) &&
    !["RESOLVED", "CANCELLED"].includes(incident.status);
  const canCorrect =
    session.permissionCodes.includes(permissions.incidentCreate) &&
    ["OPEN", "IN_PROGRESS", "PENDING_REVIEW"].includes(incident.status);
  const today = new Date().toISOString().slice(0, 10);
  const actionFeedback = getActionFeedback(searchParams ? await searchParams : {});
  const sourceHref = sourceRecordHref(
    incident.sourceRecordType,
    incident.sourceRecordId
  );

  return (
    <AppShell
      session={session}
      title={incident.title}
      subtitle="Incident detail, corrective action, and evidence reference"
      activeNav="incidents"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/incidents" tone="ghost" className="ogfi-chip">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Incidents
        </ButtonLink>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badgeTone(incident.status)}>
            {incident.status.replaceAll("_", " ").toLowerCase()}
          </Badge>
          <Badge tone={badgeTone(incident.status, incident.severity)}>
            {incident.severity.toLowerCase()}
          </Badge>
          {canCorrect ? (
            <TaskSheet
              title="Correct Incident Details"
              description={`Update ${incident.incidentNumber} and record why the correction is required. Existing audit history is retained.`}
              trigger="Correct Details"
              triggerClassName="border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              footer={
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
                  form="correct-incident"
                  type="submit"
                >
                  Save Incident Correction
                </button>
              }
            >
              <form
                action={correctOperationalIncidentAction}
                className="ogfi-form-shell grid gap-3 md:grid-cols-2"
                id="correct-incident"
              >
                <input name="incidentId" type="hidden" value={incident.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Incident date
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={incident.incidentDate}
                    name="incidentDate"
                    required
                    type="date"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Due date
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={incident.dueAt ?? ""}
                    name="dueAt"
                    type="date"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Category
                  <select
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={incident.category}
                    name="category"
                    required
                  >
                    {incidentCategories.map((category) => (
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
                    defaultValue={incident.severity}
                    name="severity"
                    required
                  >
                    {incidentSeverities.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Title
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={incident.title}
                    maxLength={160}
                    name="title"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Summary
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={incident.summary}
                    maxLength={2000}
                    name="summary"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Evidence reference
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={incident.evidenceReference ?? ""}
                    maxLength={255}
                    name="evidenceReference"
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
                  Corrective action / follow-up
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={incident.correctiveAction ?? ""}
                    maxLength={2000}
                    name="correctiveAction"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Correction reason
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={1000}
                    name="correctionReason"
                    placeholder="Explain why these incident details are being corrected."
                    required
                  />
                </label>
              </form>
            </TaskSheet>
          ) : null}
          {canResolve ? (
            <EntryModal title="Resolve Incident" triggerLabel="Resolve Incident">
              <form
                action={resolveOperationalIncidentAction}
                className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2"
              >
                <input name="incidentId" type="hidden" value={incident.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Resolution date
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={today}
                    name="resolvedAt"
                    required
                    type="date"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Evidence reference
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={incident.evidenceReference ?? ""}
                    name="evidenceReference"
                    placeholder="Photo, report, or file reference"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Corrective action completed
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={incident.correctiveAction ?? ""}
                    maxLength={2000}
                    name="correctiveAction"
                    placeholder="What was corrected, who verified it, and any follow-up needed"
                    required
                  />
                </label>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 md:col-span-2">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  Resolve Incident
                </button>
              </form>
            </EntryModal>
          ) : null}
          {canResolve ? (
            <EntryModal title="Cancel Incident" triggerLabel="Cancel Incident">
              <form
                action={cancelOperationalIncidentAction}
                className="ogfi-form-shell mt-4 grid gap-3"
              >
                <input name="incidentId" type="hidden" value={incident.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Cancellation reason
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={1000}
                    name="cancelReason"
                    placeholder="Explain why this incident record should be cancelled instead of resolved"
                    required
                  />
                </label>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100">
                  <XCircle aria-hidden="true" className="h-4 w-4" />
                  Cancel Incident
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
              incident follow-up record only. Resolution updates this incident
              and its audit history; it does not approve food-safety, inventory,
              maintenance, purchasing, or finance source records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Any linked source record remains authoritative for its own status,
              evidence, posting, or approval state.
            </p>
          </div>
          <span>Incident source record</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Incident Summary
              </h2>
              <p className="text-sm text-slate-500">
                {incident.incidentNumber} / {incident.locationName} /{" "}
                {incident.incidentDate}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {incident.sourceRecordType ? (
                <Badge tone="info">{incident.sourceRecordType}</Badge>
              ) : null}
              {incident.sourceRecordId ? (
                <Badge tone="info">Linked source</Badge>
              ) : null}
            </div>
          </div>
          <div className="p-5">
            <p className="text-sm leading-6 text-slate-700">{incident.summary}</p>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Category
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {incident.category.replaceAll("_", " ").toLowerCase()}
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Source record (read-only reference)
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-950">
                  {incident.sourceRecordType ?? "No source type"}
                </p>
                <p className="mt-1 break-all text-xs text-slate-500">
                  {incident.sourceRecordId ?? "No linked source ID"}
                </p>
                {sourceHref ? (
                  <ButtonLink
                    href={sourceHref}
                    tone="ghost"
                    className="ogfi-chip mt-3"
                  >
                    Open Source Record
                  </ButtonLink>
                ) : incident.sourceRecordId ? (
                  <Badge tone="neutral">Source link unavailable</Badge>
                ) : null}
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Due
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {incident.dueAt ?? "Not set"}
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Resolved
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {incident.resolvedAt ?? "Open"}
                </p>
              </Panel>
            </div>

            <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Corrective action
              </p>
              <p className="mt-2 text-sm font-semibold text-amber-950">
                {incident.correctiveAction ?? "Pending corrective action"}
              </p>
            </div>
          </div>
        </section>

        <aside className="grid gap-4 content-start">
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Evidence</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {incident.evidenceReference ?? "Pending"}
            </p>
          </Panel>
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Reported by</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {incident.reportedByName ?? "Not recorded"}
            </p>
          </Panel>
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Owner</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {incident.ownerName ?? "Unassigned"}
            </p>
          </Panel>
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Scope</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {incident.locationName}
            </p>
          </Panel>
          <Panel className="ogfi-detail-card">
            <p className="text-sm font-semibold text-slate-500">Next action</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {incident.resolvedAt
                ? "Review closure evidence and retain the audit trail."
                : canResolve
                  ? "Resolve this incident after corrective action is verified and evidence is attached."
                  : "Follow up with the owner and ask an authorized user to resolve the incident after verification."}
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
