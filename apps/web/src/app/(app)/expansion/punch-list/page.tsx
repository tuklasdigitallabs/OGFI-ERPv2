import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Search,
  ShieldCheck,
  Wrench
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
  createExpansionPunchListItem,
  getExpansionPunchList,
  transitionExpansionPunchListItem,
  type ExpansionPunchListRow
} from "@/server/services/expansionProjects";

export const dynamic = "force-dynamic";

type PunchListPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const punchTypes = [
  "DEFECT",
  "SNAG",
  "RECTIFICATION",
  "INSPECTION_FINDING",
  "SAFETY_FINDING",
  "HANDOVER_EXCEPTION",
  "WARRANTY_FOLLOW_UP"
] as const;

const severityOptions = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const statusOptions = [
  "PLANNED",
  "IN_PROGRESS",
  "WAITING_FOR_APPROVAL",
  "BLOCKED",
  "FOR_REVIEW",
  "COMPLETED",
  "CANCELLED"
];

async function createPunchItemAction(formData: FormData) {
  "use server";

  try {
    await createExpansionPunchListItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/punch-list", error));
  }
  redirect("/expansion/punch-list");
}

async function transitionPunchItemAction(formData: FormData) {
  "use server";

  try {
    await transitionExpansionPunchListItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/punch-list", error));
  }
  redirect("/expansion/punch-list");
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

function severityTone(severity: string) {
  if (severity === "CRITICAL" || severity === "HIGH") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function punchListPageHref(input: {
  page: number;
  query: string;
  status: string;
  severity: string;
}) {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.severity) {
    params.set("severity", input.severity);
  }
  params.set("page", String(input.page));
  return `/expansion/punch-list?${params.toString()}`;
}

function Pagination({
  page,
  totalPages,
  totalCount,
  startIndex,
  endIndex,
  query,
  status,
  severity
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  query: string;
  status: string;
  severity: string;
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
          href={punchListPageHref({
            page: Math.max(1, page - 1),
            query,
            status,
            severity
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
          href={punchListPageHref({
            page: Math.min(totalPages, page + 1),
            query,
            status,
            severity
          })}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function PunchListActions({ row }: { row: ExpansionPunchListRow }) {
  if (!row.canMutate) {
    return <span className="text-xs font-semibold text-slate-400">No edit access to this project.</span>;
  }
  if (row.status === "COMPLETED" || row.status === "CANCELLED") {
    return (
      <EntryModal
        title="Reopen Punch List Item"
        triggerLabel="Reopen"
        triggerClassName="min-h-9 px-3 text-xs"
      >
        <form action={transitionPunchItemAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
          <input name="nextStatus" type="hidden" value="IN_PROGRESS" />
          <input name="severity" type="hidden" value={row.severity} />
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Reopening preserves the original closure or cancellation history and returns the item to active rectification.
          </p>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Reopen reason
            <textarea
              className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="reason"
              minLength={5}
              placeholder="Explain the failed inspection, new defect, or reason the item needs more work."
              required
            />
          </label>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            type="submit"
          >
            Reopen Punch Item
          </button>
        </form>
      </EntryModal>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <EntryModal
        title="Update Punch List Item"
        triggerLabel="Status"
        triggerClassName="min-h-9 px-3 text-xs"
      >
        <form action={transitionPunchItemAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
          <input name="severity" type="hidden" value={row.severity} />
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">{row.title}</p>
            <p className="mt-1 text-blue-900/75">
              This updates defect and rectification follow-up only. It does not
              approve payments, issue POs, receive inventory, create branches,
              or operate a contractor portal.
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
              placeholder="Required when blocked; optional for normal progress updates."
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Progress note
            <textarea
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="completionNote"
              placeholder="Optional progress, rectification, or reviewer handoff note."
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
      {row.canClose ? (
        <EntryModal
          title="Close Punch List Item"
          triggerLabel="Close"
          triggerClassName="min-h-9 border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-800 hover:bg-emerald-100"
        >
          <form action={transitionPunchItemAction} className="grid gap-4 pt-5">
            <input name="taskId" type="hidden" value={row.id} />
            <input name="expectedVersion" type="hidden" value={row.version} />
            <input name="nextStatus" type="hidden" value="COMPLETED" />
            <input name="severity" type="hidden" value={row.severity} />
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
              {row.requiresIndependentClosure
                ? "This high-severity item is ready for independent review. Closing it records your review and preserves the rectification trail."
                : "Closing records the resolved item and its inspection or rectification evidence. It can be reopened later with a reason."}
            </p>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Closure evidence reference
              <textarea
                className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                name="completionNote"
                minLength={5}
                placeholder="Inspection signoff, photo set, turnover note, warranty confirmation, or linked record reference"
                required
              />
            </label>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
              type="submit"
            >
              Close Punch Item
            </button>
          </form>
        </EntryModal>
      ) : null}
      <EntryModal
        title="Cancel Punch List Item"
        triggerLabel="Cancel"
        triggerClassName="min-h-9 border border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-50"
      >
        <form action={transitionPunchItemAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
          <input name="nextStatus" type="hidden" value="CANCELLED" />
          <input name="severity" type="hidden" value={row.severity} />
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
            Cancel Punch Item
          </button>
        </form>
      </EntryModal>
    </div>
  );
}

export default async function PunchListPage({ searchParams }: PunchListPageProps) {
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
  const severity = firstSearchValue(resolvedSearchParams.severity);
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const dashboard = await getExpansionPunchList(session);
  const createProjects = dashboard.projects.filter((project) => project.canMutate);
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedStatus = status.trim().toUpperCase();
  const normalizedSeverity = severity.trim().toUpperCase();
  const filteredRows = dashboard.rows.filter((row) => {
    const matchesQuery = normalizedQuery
      ? [
          row.title,
          row.projectCode,
          row.projectName,
          row.siteName,
          row.brandName,
          row.ownerName,
          row.area ?? "",
          row.responsibleParty ?? ""
        ]
          .join(" ")
          .toUpperCase()
          .includes(normalizedQuery)
      : true;
    const matchesStatus = normalizedStatus ? row.status === normalizedStatus : true;
    const matchesSeverity = normalizedSeverity
      ? row.severity === normalizedSeverity
      : true;
    return matchesQuery && matchesStatus && matchesSeverity;
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
      title="Punch List"
      subtitle="Defect, snag, rectification, and handover exception follow-up"
      activeNav="punch-list"
    >
      <ExpansionWorkspaceNav />

      <ActionFeedbackBanner feedback={actionFeedback} />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Punch List coordinates rectification follow-up.</strong>{" "}
              It does not approve POs, release payments, receive inventory,
              create branch records, or operate a contractor portal.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Closure requires evidence while financial, procurement,
              inventory, branch-master, and contractor source records stay in
              their proper ERP modules.
            </p>
          </div>
          <Badge tone="info">Coordination only</Badge>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Punch items</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.punchCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Open</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.openPunchCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Critical</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.criticalPunchCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.overduePunchCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Closed</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {dashboard.completedPunchCount}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Punch List Items</h2>
            <p className="text-sm text-slate-500">
              List-first inspection exceptions with evidence-required closure.
            </p>
          </div>
          <ExpansionEntrySheet
            title="Create Punch List Item"
            triggerLabel="Create Punch Item"
            submitLabel="Create Punch Item"
            triggerClassName="gap-2"
            disabled={createProjects.length === 0}
            disabledReason="Choose an Expansion project where you have edit access before recording a punch-list item."
          >
            <form action={createPunchItemAction} className="grid gap-5 pt-5">
              <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
                Choose the project first. The accountable owner and independent reviewer must both be active members of that project; high and critical items cannot be created without a reviewer who is independent from the owner and creator.
              </p>
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
                  Punch type
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="punchType"
                    required
                  >
                    {punchTypes.map((option) => (
                      <option key={option} value={option}>
                        {humanize(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Title
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="title"
                    placeholder="Exhaust hood inspection finding"
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
                  Severity
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="severity"
                    defaultValue="MEDIUM"
                  >
                    {severityOptions.map((option) => (
                      <option key={option} value={option}>
                        {humanize(option)}
                      </option>
                    ))}
                  </select>
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
                  Area
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="area"
                    placeholder="Kitchen, dining, MEP, storefront"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Responsible party
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="responsibleParty"
                    placeholder="Fit-out contractor, mall admin, internal IT"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Assigned owner
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="ownerUserId"
                    required
                  >
                    <option value="">Select the accountable project member</option>
                    {createProjects.flatMap((project) =>
                      project.members.map((member) => (
                        <option key={`${project.id}-${member.id}`} value={member.id}>
                          {project.code} / {member.displayName}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Escalation owner
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="escalationOwner"
                    placeholder="Required for high or critical items"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Independent reviewer
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="independentReviewerUserId"
                  >
                    <option value="">Required for high or critical items</option>
                    {createProjects.flatMap((project) =>
                      project.members.map((member) => (
                        <option key={`${project.id}-reviewer-${member.id}`} value={member.id}>
                          {project.code} / {member.displayName}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                  Operational impact
                  <textarea
                    className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    name="impactSummary"
                    placeholder="Describe the schedule, budget, compliance, opening-date, or readiness impact."
                    required
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                  Evidence reference
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="evidenceReference"
                    placeholder="Inspection report, photo set, snag sheet, handover note"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Notes
                <textarea
                  className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  name="notes"
                  placeholder="Describe the defect, operational impact, inspection context, or closure expectation."
                />
              </label>
            </form>
          </ExpansionEntrySheet>
        </div>

        <form
          className="grid gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-[1fr_14rem_14rem_auto_auto]"
          action="/expansion/punch-list"
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
                placeholder="Punch item, project, area, responsible party"
                defaultValue={query}
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Severity
            <select
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
              name="severity"
              defaultValue={severity}
            >
              <option value="">All severities</option>
              {severityOptions.map((option) => (
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
            href="/expansion/punch-list"
          >
            Clear
          </Link>
        </form>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Punch Item</th>
                <th className="px-5 py-3">Project / Site</th>
                <th className="px-5 py-3">Area / Party</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Evidence</th>
                <th className="px-5 py-3">Owner</th>
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
                          No punch-list items found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Adjust filters or create an inspection exception,
                          defect, snag, or rectification item.
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
                          ) : row.severity === "CRITICAL" ? (
                            <AlertTriangle
                              aria-hidden="true"
                              className="h-4 w-4 text-amber-700"
                            />
                          ) : (
                            <Wrench aria-hidden="true" className="h-4 w-4" />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-950">{row.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {humanize(row.punchType)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge tone={statusTone(row.status)}>
                              {humanize(row.status)}
                            </Badge>
                            <Badge tone={severityTone(row.severity)}>
                              {humanize(row.severity)}
                            </Badge>
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
                      <p className="font-semibold text-slate-800">
                        {row.area ?? "Area not set"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.responsibleParty ?? "Responsible party not set"}
                      </p>
                      <p className="mt-2 max-w-xs text-xs text-slate-500">
                        Impact: {row.impactSummary}
                      </p>
                      {row.escalationOwner ? (
                        <p className="mt-1 text-xs font-semibold text-amber-700">
                          Escalate to: {row.escalationOwner}
                        </p>
                      ) : null}
                      {row.independentReviewerName ? (
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          Independent reviewer: {row.independentReviewerName}
                        </p>
                      ) : null}
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
                    <td className="px-5 py-4 align-top">
                      <Badge
                        tone={
                          row.closureEvidence
                            ? "success"
                            : row.evidenceReference
                              ? "info"
                              : "neutral"
                        }
                      >
                        {row.closureEvidence
                          ? "Closed"
                          : row.evidenceReference
                            ? "Raised"
                            : "Pending"}
                      </Badge>
                      <p className="mt-2 max-w-xs text-xs text-slate-500">
                        {row.closureEvidence ??
                          row.evidenceReference ??
                          "Closure evidence required"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {row.attachmentCount} attachment(s),{" "}
                        {row.linkedRecordCount} link(s)
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-slate-700">
                      {row.ownerName}
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <PunchListActions row={row} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {visibleRows.length === 0 ? (
            <div className="px-5 py-8">
              <p className="font-bold text-slate-950">No punch-list items found</p>
              <p className="mt-1 text-sm text-slate-500">
                Adjust filters or create an inspection exception, defect, snag, or rectification item.
              </p>
            </div>
          ) : (
            visibleRows.map((row) => (
              <article className="grid gap-3 px-5 py-4" key={row.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-950">{row.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.projectCode} / {row.projectName}</p>
                  </div>
                  <Badge tone={severityTone(row.severity)}>{humanize(row.severity)}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={statusTone(row.status)}>{humanize(row.status)}</Badge>
                  <Badge tone={row.isOverdue ? "warning" : "neutral"}>{row.isOverdue ? "Overdue" : formatDate(row.dueDate)}</Badge>
                  <Badge tone={row.closureEvidence ? "success" : row.evidenceReference ? "info" : "neutral"}>{row.closureEvidence ? "Closed" : row.evidenceReference ? "Evidence raised" : "Evidence pending"}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs font-semibold uppercase text-slate-500">Owner</p><p className="mt-1 font-semibold text-slate-800">{row.ownerName}</p></div>
                  <div><p className="text-xs font-semibold uppercase text-slate-500">Area</p><p className="mt-1 font-semibold text-slate-800">{row.area ?? "Not set"}</p></div>
                </div>
                {row.independentReviewerName ? <p className="text-sm text-slate-600">Independent reviewer: {row.independentReviewerName}</p> : null}
                <PunchListActions row={row} />
              </article>
            ))
          )}
        </div>
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={filteredRows.length}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          query={query}
          status={status}
          severity={severity}
        />
      </section>
    </AppShell>
  );
}
