import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlertTriangle, FileCheck2, Search, SlidersHorizontal } from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  createOperationalReasonCode,
  deactivateOperationalReasonCode,
  listOperationalReasonCodes,
  operationalReasonWorkflows
} from "@/server/services/operationalReasonCodes";

export const dynamic = "force-dynamic";

type AdminReasonCodesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

const workflowLabels = {
  WASTAGE: "Wastage",
  STOCK_ADJUSTMENT: "Stock adjustments",
  RECEIVING_DISCREPANCY: "Receiving discrepancies",
  TRANSFER_DISCREPANCY: "Transfer discrepancies",
  STOCK_COUNT_VARIANCE: "Stock count variances",
  PURCHASE_ORDER_CANCELLATION: "PO cancellations",
  PURCHASE_ORDER_CLOSURE: "PO closures",
  REVERSAL: "Reversals",
  MASTER_DATA_CHANGE: "Master data changes"
} satisfies Record<(typeof operationalReasonWorkflows)[number], string>;

function normalizeReasonWorkflow(value: string | undefined) {
  return operationalReasonWorkflows.includes(
    value as (typeof operationalReasonWorkflows)[number]
  )
    ? (value as (typeof operationalReasonWorkflows)[number])
    : "all";
}

async function createReasonCodeAction(formData: FormData) {
  "use server";

  try {
    await createOperationalReasonCode(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/reason-codes", error));
  }
  revalidatePath("/admin/reason-codes");
  redirect("/admin/reason-codes");
}

async function deactivateReasonCodeAction(formData: FormData) {
  "use server";

  try {
    await deactivateOperationalReasonCode(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/reason-codes", error));
  }
  revalidatePath("/admin/reason-codes");
  redirect("/admin/reason-codes");
}

export default async function AdminReasonCodesPage({
  searchParams
}: AdminReasonCodesPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const reasonCodes = await listOperationalReasonCodes(session);
  const activeCount = reasonCodes.filter((reason) => reason.status === "ACTIVE").length;
  const evidenceCount = reasonCodes.filter((reason) => reason.requiresEvidence).length;
  const selectedWorkflow = normalizeReasonWorkflow(getSearchParam(params, "workflow"));
  const selectedStatus = getSearchParam(params, "status") ?? "all";
  const query = (getSearchParam(params, "q") ?? "").trim().toLowerCase();
  const filteredReasonCodes = reasonCodes.filter((reason) => {
    const workflowMatches =
      selectedWorkflow === "all" || reason.workflow === selectedWorkflow;
    const statusMatches = selectedStatus === "all" || reason.status === selectedStatus;
    const queryMatches =
      !query ||
      [reason.code, reason.label, reason.appliesTo, reason.notes, reason.workflow]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));

    return workflowMatches && statusMatches && queryMatches;
  });
  const workflowTabs = [
    {
      id: "all",
      label: "All workflows",
      count: reasonCodes.length
    },
    ...operationalReasonWorkflows.map((workflow) => ({
      id: workflow,
      label: workflowLabels[workflow],
      count: reasonCodes.filter((reason) => reason.workflow === workflow).length
    }))
  ];

  return (
    <AppShell
      session={session}
      title="Reason Codes"
      subtitle="Controlled operational classifications for wastage, adjustments, and exception workflows"
      activeNav="admin-reason-codes"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <section className="mb-5 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[var(--shadow-surface)]">
        <div className="grid gap-5 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 lg:grid-cols-[1.3fr_0.7fr] lg:items-center lg:p-6">
          <div>
            <Badge tone="info">Controlled setup</Badge>
            <h2 className="mt-3 text-2xl font-bold text-slate-950">
              Standardize the reasons users select in controlled workflows.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              These codes appear as dropdown choices for wastage, stock adjustments,
              receiving discrepancies, transfer disputes, reversals, and other
              exception workflows. They guide reporting without letting users invent
              uncontrolled classifications at entry time.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-blue-100 bg-white/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Company scope
              </p>
              <p className="mt-1 text-sm font-bold text-slate-950">
                {session.context.companyName}
              </p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                Deactivation keeps history
              </div>
              <p className="mt-1 text-xs leading-5">
                Existing transactions keep their audit trail; inactive codes stop
                appearing in new entries.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Total codes</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{reasonCodes.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Active options</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{activeCount}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Evidence required</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{evidenceCount}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Workflows covered</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {
              operationalReasonWorkflows.filter((workflow) =>
                reasonCodes.some((reason) => reason.workflow === workflow)
              ).length
            }
          </p>
        </Panel>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Reason code library</h2>
          <p className="text-sm text-slate-500">
            Search, filter, and maintain the dropdown values used by entry workflows.
          </p>
        </div>
        <EntryModal title="Create Reason Code" triggerLabel="Create Reason Code">
          <form action={createReasonCodeAction} className="ogfi-form-shell mt-4 grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Workflow
                <select
                  className="rounded-md border border-slate-300 px-3 py-2"
                  name="workflow"
                  required
                >
                  {operationalReasonWorkflows.map((workflow) => (
                    <option key={workflow} value={workflow}>
                      {workflowLabels[workflow]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Code
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  name="code"
                  placeholder="EXPIRED"
                  required
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Label
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                name="label"
                placeholder="Expired item"
                required
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Applies to
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  name="appliesTo"
                  placeholder="Optional type, e.g. SPOILAGE_EXPIRY"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Sort order
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  defaultValue="100"
                  min="0"
                  name="sortOrder"
                  type="number"
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Notes
              <textarea
                className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                name="notes"
                placeholder="Administrative policy note"
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              <span>
                <span className="block font-bold text-slate-900">
                  Require evidence by default
                </span>
                <span className="text-xs text-slate-500">
                  Users must attach or reference support when this code is selected.
                </span>
              </span>
              <span className="relative inline-flex h-7 w-12 items-center rounded-full bg-slate-300 p-1">
                <input className="peer sr-only" name="requiresEvidence" type="checkbox" />
                <span className="h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-checked:bg-blue-600" />
              </span>
            </label>
            <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Create Reason Code
            </button>
          </form>
        </EntryModal>
      </div>

      <section className="ogfi-data-surface mb-5 p-2">
        <div className="grid gap-2 lg:grid-cols-5">
          {workflowTabs.map((tab) => {
            const active = selectedWorkflow === tab.id;
            return (
              <a
                key={tab.id}
                className={
                  active
                    ? "rounded-xl bg-blue-50 px-4 py-3 text-blue-700 ring-1 ring-blue-100"
                    : "rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }
                href={`/admin/reason-codes?workflow=${tab.id}`}
              >
                <span className="block text-sm font-bold">{tab.label}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {tab.count} configured
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <form className="ogfi-data-surface mb-5 grid gap-3 p-4 lg:grid-cols-[1fr_14rem_auto_auto] lg:items-end">
        <input name="workflow" type="hidden" value={selectedWorkflow} />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Search reason codes
          <span className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm"
              defaultValue={getSearchParam(params, "q") ?? ""}
              name="q"
              placeholder="Code, label, workflow, notes..."
            />
          </span>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Status
          <select
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            defaultValue={selectedStatus}
            name="status"
          >
            <option value="all">All statuses</option>
            <option value="ACTIVE">Active only</option>
            <option value="INACTIVE">Inactive only</option>
          </select>
        </label>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          Apply
        </button>
        <a
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
          href="/admin/reason-codes"
        >
          Reset
        </a>
      </form>

      <section className="ogfi-data-surface">
        <div className="ogfi-section-header flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Reason Code Register</h2>
            <p className="text-sm text-slate-500">
              Showing {filteredReasonCodes.length} of {reasonCodes.length} reason codes.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Active codes appear as dropdown options in controlled workflows.
          </p>
        </div>
        {filteredReasonCodes.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No reason codes found</p>
            <p className="mt-1 text-sm text-slate-600">
              Adjust the filters or create the first code for this workflow.
            </p>
          </div>
        ) : (
          <div>
            <div className="ogfi-table-head hidden grid-cols-[12rem_1.1fr_0.75fr_8rem_8rem_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-500 lg:grid">
              <span>Workflow</span>
              <span>Reason</span>
              <span>Applies to</span>
              <span>Evidence</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-slate-100">
            {filteredReasonCodes.map((reason) => (
              <div
                className="ogfi-table-row grid gap-4 px-5 py-4 lg:grid-cols-[12rem_1.1fr_0.75fr_8rem_8rem_auto] lg:items-center"
                key={reason.id}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Workflow
                  </p>
                  <p className="mt-1 font-bold text-slate-950">
                    {workflowLabels[reason.workflow]}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-slate-950">{reason.label}</p>
                  <p className="text-xs text-slate-500">
                    {reason.code}
                    {reason.notes ? ` / ${reason.notes}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 lg:hidden">
                    Applies to
                  </p>
                  <p className="text-xs text-slate-500">
                    {reason.appliesTo ?? "All types"}
                  </p>
                </div>
                <div>
                  <Badge tone={reason.requiresEvidence ? "warning" : "neutral"}>
                    {reason.requiresEvidence ? "Required" : "Optional"}
                  </Badge>
                </div>
                <Badge tone={reason.status === "ACTIVE" ? "success" : "neutral"}>
                  {reason.status}
                </Badge>
                {reason.status === "ACTIVE" ? (
                  <div className="flex justify-start lg:justify-end">
                    <EntryModal
                      title={`Deactivate ${reason.code}`}
                      triggerLabel="Deactivate"
                      triggerClassName="ogfi-mobile-action bg-white px-3 text-slate-700 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <form
                        action={deactivateReasonCodeAction}
                        className="ogfi-form-shell mt-4 grid gap-4"
                      >
                        <input name="id" type="hidden" value={reason.id} />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="font-bold text-slate-950">{reason.label}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {workflowLabels[reason.workflow]} / {reason.code}
                          </p>
                        </div>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Deactivation reason
                          <textarea
                            className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                            name="reason"
                            placeholder="Explain why this code should no longer be available for new entries."
                            required
                          />
                        </label>
                        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700">
                          <FileCheck2 aria-hidden="true" className="h-4 w-4" />
                          Deactivate Reason Code
                        </button>
                      </form>
                    </EntryModal>
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">Retained history</span>
                )}
              </div>
            ))}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
