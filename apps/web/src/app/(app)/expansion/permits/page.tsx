import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  Filter,
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
  createExpansionPermitDocument,
  getExpansionPermitDocuments,
  transitionExpansionPermitDocument,
  type ExpansionPermitDocumentRow
} from "@/server/services/expansionProjects";

export const dynamic = "force-dynamic";

type PermitsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const trackerTypes = [
  "PERMIT",
  "LEASE_DOCUMENT",
  "MALL_REQUIREMENT",
  "DESIGN_DOCUMENT",
  "CONTRACT_REFERENCE",
  "INSPECTION",
  "CERTIFICATION",
  "COMPLIANCE_REQUIREMENT"
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

async function createTrackerAction(formData: FormData) {
  "use server";

  try {
    await createExpansionPermitDocument(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/permits", error));
  }
  redirect("/expansion/permits");
}

async function transitionTrackerAction(formData: FormData) {
  "use server";

  try {
    await transitionExpansionPermitDocument(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/permits", error));
  }
  redirect("/expansion/permits");
}

function firstSearchValue(
  value: string | string[] | undefined,
  fallback = ""
) {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
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

function humanize(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  );
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

function permitsPageHref(input: {
  page: number;
  query: string;
  status: string;
  trackerType: string;
}) {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.trackerType) {
    params.set("type", input.trackerType);
  }
  params.set("page", String(input.page));
  return `/expansion/permits?${params.toString()}`;
}

function Pagination({
  page,
  totalPages,
  totalCount,
  startIndex,
  endIndex,
  query,
  status,
  trackerType
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  query: string;
  status: string;
  trackerType: string;
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
          href={permitsPageHref({
            page: Math.max(1, page - 1),
            query,
            status,
            trackerType
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
          href={permitsPageHref({
            page: Math.min(totalPages, page + 1),
            query,
            status,
            trackerType
          })}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function TrackerActions({ row }: { row: ExpansionPermitDocumentRow }) {
  if (!row.canMutate) {
    return <span className="text-xs font-semibold text-slate-400">No edit access to this project.</span>;
  }
  if (row.status === "COMPLETED" || row.status === "CANCELLED") {
    return <span className="text-xs font-semibold text-slate-400">No action</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <EntryModal
        title="Update Permit / Document"
        triggerLabel="Update"
        triggerClassName="min-h-9 px-3 text-xs"
      >
        <form action={transitionTrackerAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">{row.title}</p>
            <p className="mt-1 text-blue-900/75">
              This updates the project tracker task only. It does not approve
              legal contracts, permit filings, payments, POs, or branch records.
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
              placeholder="Required when marking blocked; optional for normal progress."
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Completion evidence
            <textarea
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="completionNote"
              placeholder="Required when marking completed: permit number, legal signoff, document reference, or inspection result."
            />
          </label>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            type="submit"
          >
            Save Update
          </button>
        </form>
      </EntryModal>
      <EntryModal
        title="Cancel Permit / Document Requirement"
        triggerLabel="Cancel"
        triggerClassName="min-h-9 border border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-50"
      >
        <form action={transitionTrackerAction} className="grid gap-4 pt-5">
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
            Cancel Requirement
          </button>
        </form>
      </EntryModal>
    </div>
  );
}

export default async function PermitsPage({ searchParams }: PermitsPageProps) {
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
  const trackerType = firstSearchValue(resolvedSearchParams.type);
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const dashboard = await getExpansionPermitDocuments(session);
  const createProjects = dashboard.projects.filter((project) => project.canMutate);
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedStatus = status.trim().toUpperCase();
  const normalizedType = trackerType.trim().toUpperCase();
  const filteredRows = dashboard.rows.filter((row) => {
    const matchesQuery = normalizedQuery
      ? [
          row.title,
          row.projectCode,
          row.projectName,
          row.siteName,
          row.brandName,
          row.authority ?? "",
          row.referenceNumber ?? "",
          row.ownerName
        ]
          .join(" ")
          .toUpperCase()
          .includes(normalizedQuery)
      : true;
    const matchesStatus = normalizedStatus ? row.status === normalizedStatus : true;
    const matchesType = normalizedType ? row.trackerType === normalizedType : true;
    return matchesQuery && matchesStatus && matchesType;
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
      title="Permits & Documents"
      subtitle="Lease, mall, permit, inspection, and compliance tracker"
      activeNav="permits"
    >
      <ExpansionWorkspaceNav />

      <ActionFeedbackBanner feedback={actionFeedback} />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Permits and documents are project coordination tasks.</strong>{" "}
              Legal, payment, purchasing, and branch-master source records stay
              in their proper modules.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Attachments and references support evidence; they do not author
              legal contracts, file permits automatically, or release money.
            </p>
          </div>
          <Badge tone="info">Tracker only</Badge>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Projects</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.projectCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Tracker records</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.trackerCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Open</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.openTrackerCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.overdueTrackerCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Completed</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {dashboard.completedTrackerCount}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Permit & Document List</h2>
            <p className="text-sm text-slate-500">
              Track legal, mall, compliance, inspection, and evidence deadlines.
            </p>
          </div>
          <ExpansionEntrySheet
            title="Create Permit / Document Requirement"
            triggerLabel="Create Requirement"
            submitLabel="Create Requirement"
            triggerClassName="gap-2"
            disabled={createProjects.length === 0}
            disabledReason="Choose an Expansion project where you have edit access before adding a permit or document requirement."
          >
            <form action={createTrackerAction} className="grid gap-5 pt-5">
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
                  Type
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="trackerType"
                    required
                  >
                    {trackerTypes.map((type) => (
                      <option key={type} value={type}>
                        {humanize(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Requirement title
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="title"
                    placeholder="Business permit application"
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
                  Authority / issuer
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="authority"
                    placeholder="Mall admin, city hall, BFP, legal counsel"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Reference number
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="referenceNumber"
                    placeholder="Application, contract, or permit reference"
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
                    placeholder="Document, folder, or signed reference"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Notes
                <textarea
                  className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  name="notes"
                  placeholder="Submission requirements, dependency, follow-up owner, or compliance notes."
                />
              </label>
            </form>
          </ExpansionEntrySheet>
        </div>

        <form
          className="grid gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-[1fr_14rem_14rem_auto_auto]"
          action="/expansion/permits"
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
                placeholder="Requirement, project, site, authority"
                defaultValue={query}
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Type
            <select
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
              name="type"
              defaultValue={trackerType}
            >
              <option value="">All types</option>
              {trackerTypes.map((type) => (
                <option key={type} value={type}>
                  {humanize(type)}
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
            href="/expansion/permits"
          >
            Clear
          </Link>
        </form>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Requirement</th>
                <th className="px-5 py-3">Project / Site</th>
                <th className="px-5 py-3">Authority</th>
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
                          No permit or document requirements found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Adjust filters or create a project-scoped requirement
                          for permits, inspections, lease documents, or mall
                          compliance.
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
                          ) : row.trackerType.includes("DOCUMENT") ||
                            row.trackerType.includes("CONTRACT") ? (
                            <FileText aria-hidden="true" className="h-4 w-4" />
                          ) : (
                            <ClipboardList
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-950">{row.title}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge tone="info">{humanize(row.trackerType)}</Badge>
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
                      <p className="font-semibold text-slate-700">
                        {row.authority ?? "Not specified"}
                      </p>
                      {row.referenceNumber ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Ref {row.referenceNumber}
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
                    <td className="px-5 py-4 align-top text-slate-700">
                      {row.ownerName}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <Badge tone={row.evidenceReference ? "success" : "neutral"}>
                        {row.evidenceReference ? "Recorded" : "Pending"}
                      </Badge>
                      <p className="mt-2 max-w-xs text-xs text-slate-500">
                        {row.evidenceReference ??
                          `${row.attachmentCount} attachment link(s)`}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <TrackerActions row={row} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {visibleRows.length === 0 ? <div className="px-5 py-8"><p className="font-bold text-slate-950">No permit or document requirements found</p><p className="mt-1 text-sm text-slate-500">Adjust filters or create a scoped permit/document tracker.</p></div> : visibleRows.map((row) => (
            <article className="grid gap-3 px-5 py-4" key={row.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.projectCode} / {row.projectName}</p></div><Badge tone={statusTone(row.status)}>{humanize(row.status)}</Badge></div>
              <div className="flex flex-wrap gap-2"><Badge tone="info">{humanize(row.trackerType)}</Badge>{row.isOverdue ? <Badge tone="warning">Overdue</Badge> : <Badge tone="neutral">Due {formatDate(row.dueDate)}</Badge>}<Badge tone={row.evidenceReference ? "success" : "neutral"}>{row.evidenceReference ? "Evidence recorded" : "Evidence pending"}</Badge></div>
              <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Authority</p><p className="mt-1 font-semibold text-slate-800">{row.authority ?? "Not specified"}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Owner</p><p className="mt-1 font-semibold text-slate-800">{row.ownerName}</p></div></div>
              {row.referenceNumber ? <p className="text-sm text-slate-600">Reference: {row.referenceNumber}</p> : null}
              <TrackerActions row={row} />
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
          trackerType={trackerType}
        />
      </section>
    </AppShell>
  );
}
