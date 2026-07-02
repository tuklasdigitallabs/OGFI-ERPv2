import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseStockAdjustments,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  cancelStockAdjustment,
  getStockAdjustment,
  postStockAdjustment,
  reverseStockAdjustment,
  submitStockAdjustment
} from "@/server/services/stockAdjustments";

export const dynamic = "force-dynamic";

type AdjustmentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function submitAdjustmentAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await submitStockAdjustment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/adjustments/${id}`, error));
  }
  revalidatePath(`/adjustments/${id}`);
  revalidatePath("/adjustments");
}

async function cancelAdjustmentAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await cancelStockAdjustment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/adjustments/${id}`, error));
  }
  revalidatePath(`/adjustments/${id}`);
  revalidatePath("/adjustments");
}

async function postAdjustmentAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await postStockAdjustment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/adjustments/${id}`, error));
  }
  revalidatePath(`/adjustments/${id}`);
  revalidatePath("/adjustments");
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
}

async function reverseAdjustmentAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await reverseStockAdjustment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/adjustments/${id}`, error));
  }
  revalidatePath(`/adjustments/${id}`);
  revalidatePath("/adjustments");
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
}

function statusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "POSTING"].includes(status)) {
    return "info" as const;
  }
  if (["POSTED", "REVERSED"].includes(status)) {
    return "success" as const;
  }
  return "warning" as const;
}

function formatMoney(amount: number) {
  return `PHP ${amount.toFixed(2)}`;
}

function formatQuantity(quantity: number) {
  return `${quantity > 0 ? "+" : ""}${quantity.toFixed(3)}`;
}

function getMetadataText(metadata: unknown, key: string) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export default async function AdjustmentDetailPage({
  params,
  searchParams
}: AdjustmentDetailPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseStockAdjustments(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const adjustment = await getStockAdjustment(session, id);
  if (!adjustment) {
    redirect("/adjustments");
  }

  const canSubmit = session.permissionCodes.includes(
    permissions.stockAdjustmentSubmit
  );
  const canCancel = session.permissionCodes.includes(
    permissions.stockAdjustmentCancel
  );
  const canPost = session.permissionCodes.includes(
    permissions.stockAdjustmentPost
  );
  const canReverse = session.permissionCodes.includes(
    permissions.stockAdjustmentReverse
  );
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="Stock Adjustment"
      subtitle={`${adjustment.publicReference} / ${adjustment.inventoryLocationName}`}
      activeNav="adjustments"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Stock Adjustment</p>
              <h2 className="text-2xl font-semibold text-slate-950">
                {adjustment.publicReference}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {adjustment.locationName} / {adjustment.inventoryLocationName}
              </p>
            </div>
            <Badge tone={statusTone(adjustment.status)}>{adjustment.status}</Badge>
          </div>

          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            Approval does not change stock. Only the separate Post Adjustment action
            creates inventory movements. Opening balances post through the same
            immutable ledger and can be corrected only through reversal.
          </div>

          <dl className="mt-6 grid gap-4 ogfi-record-summary p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-500">Type</dt>
              <dd className="text-slate-950">{adjustment.adjustmentType}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Reason</dt>
              <dd className="text-slate-950">{adjustment.reasonCode}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Requested by</dt>
              <dd className="text-slate-950">{adjustment.requestedByName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Posted by</dt>
              <dd className="text-slate-950">
                {adjustment.postedByName ?? "Not posted"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Reversed by</dt>
              <dd className="text-slate-950">
                {adjustment.reversedByName ?? "Not reversed"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Estimated impact</dt>
              <dd className="text-slate-950">
                {formatMoney(adjustment.totalEstimatedValueImpact)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Submitted</dt>
              <dd className="text-slate-950">
                {adjustment.submittedAt
                  ? new Date(adjustment.submittedAt).toLocaleString()
                  : "Not submitted"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Posted</dt>
              <dd className="text-slate-950">
                {adjustment.postedAt
                  ? new Date(adjustment.postedAt).toLocaleString()
                  : "Not posted"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Reversed</dt>
              <dd className="text-slate-950">
                {adjustment.reversedAt
                  ? new Date(adjustment.reversedAt).toLocaleString()
                  : "Not reversed"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-slate-500">
                Reason description
              </dt>
              <dd className="text-slate-950">{adjustment.reasonDescription}</dd>
            </div>
            {adjustment.evidenceReference ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Evidence reference</dt>
                <dd className="text-slate-950">{adjustment.evidenceReference}</dd>
              </div>
            ) : null}
            {adjustment.sourceDocumentType ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Source type</dt>
                <dd className="text-slate-950">{adjustment.sourceDocumentType}</dd>
              </div>
            ) : null}
            {adjustment.sourceDocumentId ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Source ID</dt>
                <dd className="break-all text-slate-950">
                  {adjustment.sourceDocumentId}
                </dd>
              </div>
            ) : null}
            {adjustment.cancellationReason ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">
                  Cancellation reason
                </dt>
                <dd className="text-slate-950">{adjustment.cancellationReason}</dd>
              </div>
            ) : null}
            {adjustment.reversalReason ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">
                  Reversal reason
                </dt>
                <dd className="text-slate-950">{adjustment.reversalReason}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/adjustments" className="bg-slate-700 hover:bg-slate-800">
              Back to Adjustments
            </ButtonLink>
            {canSubmit &&
            ["DRAFT", "SUBMITTED", "RETURNED"].includes(adjustment.status) ? (
              <form action={submitAdjustmentAction}>
                <input name="id" type="hidden" value={adjustment.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                  Submit for Approval
                </button>
              </form>
            ) : null}
            {canPost && adjustment.status === "APPROVED" ? (
              <form action={postAdjustmentAction}>
                <input name="id" type="hidden" value={adjustment.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto">
                  Post Adjustment
                </button>
              </form>
            ) : null}
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid gap-2 border-b border-slate-100 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 md:grid-cols-[3rem_1fr_8rem_8rem_8rem]">
              <span>#</span>
              <span>Item</span>
              <span>System Qty</span>
              <span>Delta</span>
              <span>Impact</span>
            </div>
            <div className="divide-y divide-slate-100">
              {adjustment.lines.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 p-3 text-sm md:grid-cols-[3rem_1fr_8rem_8rem_8rem]"
                >
                  <span className="font-semibold text-slate-500">{line.lineNumber}</span>
                  <div>
                    <p className="font-semibold text-slate-950">
                      {line.itemCode} / {line.itemName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {line.reasonCode}
                      {line.lotNumber ? ` / Lot ${line.lotNumber}` : ""}
                      {line.expiryDate ? ` / Exp ${line.expiryDate}` : ""}
                    </p>
                    {line.notes ? (
                      <p className="mt-1 text-xs text-slate-500">{line.notes}</p>
                    ) : null}
                  </div>
                  <span>{line.systemQuantityBaseUom.toFixed(3)}</span>
                  <span className="font-semibold">
                    {formatQuantity(line.quantityDeltaBaseUom)} {line.uomCode}
                  </span>
                  <span>{formatMoney(line.estimatedValueImpact)}</span>
                  {line.postedMovementId ? (
                    <span className="md:col-span-5 text-xs text-slate-500">
                      Posted movement: {line.postedMovementId}
                      {line.reversalMovementCount > 0
                        ? ` / Reversed ${line.reversalMovementCount} time${
                            line.reversalMovementCount === 1 ? "" : "s"
                          }`
                        : ""}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <div className="grid gap-4">
          {canCancel &&
          ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "RETURNED"].includes(
            adjustment.status
          ) ? (
            <Panel className="ogfi-detail-card">
              <h2 className="text-lg font-bold text-slate-950">Cancel Request</h2>
              <p className="mt-1 text-sm text-slate-500">
                Cancellation preserves the request history and prevents later posting.
              </p>
              <div className="mt-4">
                <EntryModal title="Cancel Stock Adjustment" triggerLabel="Cancel Adjustment">
                  <form action={cancelAdjustmentAction} className="mt-4 grid gap-3">
                    <input name="id" type="hidden" value={adjustment.id} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Cancellation reason
                      <textarea
                        className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                        name="cancellationReason"
                        required
                      />
                    </label>
                    <button className="inline-flex min-h-9 items-center justify-center rounded-md bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900 sm:w-fit">
                      Cancel Adjustment
                    </button>
                  </form>
                </EntryModal>
              </div>
            </Panel>
          ) : null}

          {canReverse && adjustment.status === "POSTED" ? (
            <Panel className="ogfi-detail-card">
              <h2 className="text-lg font-bold text-slate-950">Reverse Posted Adjustment</h2>
              <p className="mt-1 text-sm text-slate-500">
                Reversal posts linked counter-movements through the inventory ledger.
              </p>
              <div className="mt-4">
                <EntryModal
                  title="Reverse Posted Adjustment"
                  triggerLabel="Reverse Adjustment"
                >
                  <form action={reverseAdjustmentAction} className="mt-4 grid gap-3">
                    <input name="id" type="hidden" value={adjustment.id} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Reversal reason
                      <textarea
                        className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                        name="reversalReason"
                        required
                      />
                    </label>
                    <button className="inline-flex min-h-9 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 sm:w-fit">
                      Reverse Adjustment
                    </button>
                  </form>
                </EntryModal>
              </div>
            </Panel>
          ) : null}

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Activity</h2>
            <div className="mt-4 grid gap-3">
              {adjustment.auditEvents.length === 0 ? (
                <p className="text-sm text-slate-500">No activity recorded.</p>
              ) : (
                adjustment.auditEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-950">
                      {event.eventType.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(event.occurredAt).toLocaleString()}
                    </p>
                    {getMetadataText(event.metadata, "cancellationReason") ? (
                      <p className="mt-1 text-xs text-slate-600">
                        {getMetadataText(event.metadata, "cancellationReason")}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
