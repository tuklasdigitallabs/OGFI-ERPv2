import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeDollarSign,
  Filter,
  PackageSearch,
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
  createExpansionCapexProcurementItem,
  getExpansionCapexProcurement,
  transitionExpansionCapexProcurementItem,
  type ExpansionCapexProcurementRow
} from "@/server/services/expansionProjects";

export const dynamic = "force-dynamic";

type CapexProcurementPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const packageTypes = [
  "CAPEX_BUDGET",
  "BOQ_PACKAGE",
  "EQUIPMENT_PACKAGE",
  "CONTRACTOR_AWARD",
  "SUPPLIER_PROCUREMENT",
  "IT_SYSTEMS",
  "SIGNAGE_FURNITURE",
  "CONTINGENCY"
] as const;

const costCategories = [
  "FIT_OUT",
  "KITCHEN_EQUIPMENT",
  "FURNITURE_FIXTURES",
  "IT_POS",
  "SIGNAGE",
  "PERMITS_LEGAL",
  "PRE_OPENING",
  "CONTINGENCY",
  "OTHER"
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

async function createCapexProcurementAction(formData: FormData) {
  "use server";

  try {
    await createExpansionCapexProcurementItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/capex-procurement", error));
  }
  redirect("/expansion/capex-procurement");
}

async function transitionCapexProcurementAction(formData: FormData) {
  "use server";

  try {
    await transitionExpansionCapexProcurementItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/capex-procurement", error));
  }
  redirect("/expansion/capex-procurement");
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
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

function capexPageHref(input: {
  page: number;
  query: string;
  status: string;
  packageType: string;
}) {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.packageType) {
    params.set("type", input.packageType);
  }
  params.set("page", String(input.page));
  return `/expansion/capex-procurement?${params.toString()}`;
}

function Pagination({
  page,
  totalPages,
  totalCount,
  startIndex,
  endIndex,
  query,
  status,
  packageType
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  query: string;
  status: string;
  packageType: string;
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
          href={capexPageHref({
            page: Math.max(1, page - 1),
            query,
            status,
            packageType
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
          href={capexPageHref({
            page: Math.min(totalPages, page + 1),
            query,
            status,
            packageType
          })}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function CapexActions({ row }: { row: ExpansionCapexProcurementRow }) {
  if (!row.canMutate) {
    return <span className="text-xs font-semibold text-slate-400">No edit access to this project.</span>;
  }
  if (row.status === "COMPLETED" || row.status === "CANCELLED") {
    return <span className="text-xs font-semibold text-slate-500">Closed</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <EntryModal
        title="Update Capex / Procurement Item"
        triggerLabel="Status"
        triggerClassName="min-h-9 px-3 text-xs"
      >
        <form action={transitionCapexProcurementAction} className="grid gap-4 pt-5">
          <input name="taskId" type="hidden" value={row.id} />
          <input name="expectedVersion" type="hidden" value={row.version} />
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">{row.title}</p>
            <p className="mt-1 text-blue-900/75">
              This updates package coordination only. It does not approve capex,
              mutate budgets, release payments, issue POs, receive inventory, or
              alter linked Finance or Procurement source records.
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
            Reason or review note
            <textarea
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="reason"
              placeholder="Required when blocked; optional for coordination progress."
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Completion evidence
            <textarea
              className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="completionNote"
              placeholder="Required when complete: approved budget, award memo, PR/PO, invoice, payment, or handover evidence reference."
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
        title="Cancel Capex / Procurement Item"
        triggerLabel="Cancel"
        triggerClassName="min-h-9 border border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-50"
      >
        <form action={transitionCapexProcurementAction} className="grid gap-4 pt-5">
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
            Cancel Item
          </button>
        </form>
      </EntryModal>
    </div>
  );
}

export default async function CapexProcurementPage({
  searchParams
}: CapexProcurementPageProps) {
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
  const packageType = firstSearchValue(resolvedSearchParams.type);
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const dashboard = await getExpansionCapexProcurement(session);
  const createProjects = dashboard.projects.filter((project) => project.canMutate);
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedStatus = status.trim().toUpperCase();
  const normalizedType = packageType.trim().toUpperCase();
  const filteredRows = dashboard.rows.filter((row) => {
    const matchesQuery = normalizedQuery
      ? [
          row.title,
          row.projectCode,
          row.projectName,
          row.siteName,
          row.brandName,
          row.ownerName,
          row.responsibleParty ?? "",
          row.sourceReference ?? ""
        ]
          .join(" ")
          .toUpperCase()
          .includes(normalizedQuery)
      : true;
    const matchesStatus = normalizedStatus ? row.status === normalizedStatus : true;
    const matchesType = normalizedType ? row.packageType === normalizedType : true;
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
      title="Capex & Procurement"
      subtitle="Project package, budget-reference, award, and source-link coordination"
      activeNav="capex-procurement"
    >
      <ExpansionWorkspaceNav />

      <ActionFeedbackBanner feedback={actionFeedback} />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Capex & Procurement is a coordination workspace.</strong>{" "}
              Finance, Procurement, AP, Inventory, and branch-master modules remain
              the source of truth for approvals, budgets, POs, payments, stock, and
              official records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Completing an item records project evidence only; it does not mutate
              budgets, approve suppliers, issue POs, release payments, or post
              inventory.
            </p>
          </div>
          <Badge tone="info">Source-linked only</Badge>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-6">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Projects</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.projectCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Packages</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.itemCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Open</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.openItemCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Review</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {dashboard.reviewItemCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Over budget ref.</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.overBudgetReferenceCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Missing evidence</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.evidenceMissingCount}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Capex & Procurement Package List
            </h2>
            <p className="text-sm text-slate-500">
              Track packages, estimated budget, source-reference amounts, owners,
              and evidence without replacing Finance or Procurement.
            </p>
          </div>
          <ExpansionEntrySheet
            title="Create Capex / Procurement Item"
            triggerLabel="Create Item"
            submitLabel="Create Capex / Procurement Item"
            triggerClassName="gap-2"
            disabled={createProjects.length === 0 || !dashboard.canViewFinancialEstimates}
            disabledReason={dashboard.canViewFinancialEstimates ? "Choose an Expansion project where you have edit access before creating a capex or procurement item." : "Viewing or entering Expansion financial estimates requires the Budget Control permission."}
          >
            <form action={createCapexProcurementAction} className="grid gap-5 pt-5">
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
                  Package type
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="packageType"
                    required
                  >
                    {packageTypes.map((type) => (
                      <option key={type} value={type}>
                        {humanize(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Item title
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="title"
                    placeholder="Kitchen equipment award package"
                    required
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Cost category
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="costCategory"
                    required
                  >
                    {costCategories.map((category) => (
                      <option key={category} value={category}>
                        {humanize(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Budget estimate
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="budgetEstimate"
                    placeholder="2500000"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Committed source amount
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="committedReferenceAmount"
                    placeholder="PO or award amount"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Actual source amount
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="actualReferenceAmount"
                    placeholder="Invoice or payment reference amount"
                    step="0.01"
                    type="number"
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
                  Responsible party
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="responsibleParty"
                    placeholder="Expansion, Finance, Purchasing, contractor"
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
                  Source reference
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="sourceReference"
                    placeholder="Budget, PR, PO, award, invoice, or payment reference"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Evidence reference
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="evidenceReference"
                    placeholder="Approved budget, award memo, signed quote, handover pack"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Notes
                <textarea
                  className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  name="notes"
                  placeholder="Coordination notes, dependency, expected procurement step, or variance context."
                />
              </label>
            </form>
          </ExpansionEntrySheet>
          {!dashboard.canViewFinancialEstimates ? <p className="text-sm font-semibold text-slate-500">Restricted financial estimates</p> : null}
        </div>

        <form
          className="grid gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-[1fr_14rem_14rem_auto_auto]"
          action="/expansion/capex-procurement"
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
                placeholder="Package, project, site, source ref, owner"
                defaultValue={query}
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Package
            <select
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
              name="type"
              defaultValue={packageType}
            >
              <option value="">All packages</option>
              {packageTypes.map((type) => (
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
            href="/expansion/capex-procurement"
          >
            Clear
          </Link>
        </form>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Package</th>
                <th className="px-5 py-3">Project / Site</th>
                <th className="px-5 py-3">Budget & Source Amounts</th>
                <th className="px-5 py-3">Category / Responsible</th>
                <th className="px-5 py-3">Due</th>
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
                          No capex or procurement items found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Create package coordination records for approved budget
                          references, BOQ packages, awards, procurement follow-up,
                          and evidence tracking.
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
                          {row.packageType === "CAPEX_BUDGET" ? (
                            <BadgeDollarSign
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          ) : (
                            <PackageSearch
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-950">{row.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {humanize(row.packageType)} / {row.ownerName}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge tone={statusTone(row.status)}>
                              {humanize(row.status)}
                            </Badge>
                            {row.priority === "HIGH" ||
                            row.priority === "CRITICAL" ? (
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
                      {row.financialsMasked ? (
                        <p className="font-semibold text-slate-500">Restricted financial estimates</p>
                      ) : (
                        <>
                          <p className="font-semibold text-slate-950">Budget {formatMoney(row.budgetEstimate ?? 0)}</p>
                          <p className="mt-1 text-xs text-slate-500">Committed {formatMoney(row.committedReferenceAmount ?? 0)}</p>
                          <p className="mt-1 text-xs text-slate-500">Actual {formatMoney(row.actualReferenceAmount ?? 0)}</p>
                          {(row.varianceReferenceAmount ?? 0) > 0 ? <p className="mt-2 text-xs font-semibold text-amber-700">Over by {formatMoney(row.varianceReferenceAmount ?? 0)}</p> : null}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-slate-950">
                        {humanize(row.costCategory)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.responsibleParty ?? "No responsible party recorded"}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {row.sourceReference ?? "No source reference yet"}
                      </p>
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
                      <p className="mt-1 text-xs text-slate-500">{row.nextAction}</p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <Badge tone={row.evidenceReference ? "success" : "neutral"}>
                        {row.evidenceReference ? "Recorded" : "Pending"}
                      </Badge>
                      <p className="mt-2 max-w-xs text-xs text-slate-500">
                        {row.evidenceReference ??
                          "Evidence required for completion"}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <CapexActions row={row} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {visibleRows.length === 0 ? <div className="px-5 py-8"><p className="font-bold text-slate-950">No capex or procurement packages found</p><p className="mt-1 text-sm text-slate-500">Adjust filters or create a scoped package tracker.</p></div> : visibleRows.map((row) => (
            <article className="grid gap-3 px-5 py-4" key={row.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.projectCode} / {row.projectName}</p></div><Badge tone={statusTone(row.status)}>{humanize(row.status)}</Badge></div>
              <div className="flex flex-wrap gap-2"><Badge tone="neutral">{humanize(row.packageType)}</Badge>{row.isOverdue ? <Badge tone="warning">Overdue</Badge> : <Badge tone="neutral">Due {formatDate(row.dueDate)}</Badge>}<Badge tone={row.evidenceReference ? "success" : "neutral"}>{row.evidenceReference ? "Evidence recorded" : "Evidence pending"}</Badge></div>
              {row.financialsMasked ? <p className="text-sm font-semibold text-slate-500">Restricted financial estimates</p> : <div className="grid grid-cols-3 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Budget</p><p className="mt-1 font-bold text-slate-900">{formatMoney(row.budgetEstimate ?? 0)}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Committed</p><p className="mt-1 font-bold text-slate-900">{formatMoney(row.committedReferenceAmount ?? 0)}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Actual</p><p className="mt-1 font-bold text-slate-900">{formatMoney(row.actualReferenceAmount ?? 0)}</p></div></div>}
              <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Owner</p><p className="mt-1 font-semibold text-slate-800">{row.ownerName}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Next</p><p className="mt-1 font-semibold text-slate-800">{row.nextAction}</p></div></div>
              <CapexActions row={row} />
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
          packageType={packageType}
        />
      </section>
    </AppShell>
  );
}
