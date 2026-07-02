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
  canUseTransfers,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  cancelInventoryTransfer,
  dispatchInventoryTransfer,
  getInventoryTransfer,
  receiveInventoryTransfer,
  reverseInventoryTransferReceipt,
  settleInventoryTransferDiscrepancy,
  submitInventoryTransfer
} from "@/server/services/transfers";

export const dynamic = "force-dynamic";

type TransferDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function submitTransferAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await submitInventoryTransfer(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/transfers/${id}`, error));
  }
  revalidatePath(`/transfers/${id}`);
  revalidatePath("/transfers");
}

async function cancelTransferAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await cancelInventoryTransfer(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/transfers/${id}`, error));
  }
  revalidatePath(`/transfers/${id}`);
  revalidatePath("/transfers");
}

async function dispatchTransferAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await dispatchInventoryTransfer(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/transfers/${id}`, error));
  }
  revalidatePath(`/transfers/${id}`);
  revalidatePath("/transfers");
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
}

async function receiveTransferAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await receiveInventoryTransfer(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/transfers/${id}`, error));
  }
  revalidatePath(`/transfers/${id}`);
  revalidatePath("/transfers");
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
}

async function reverseTransferReceiptAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await reverseInventoryTransferReceipt(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/transfers/${id}`, error));
  }
  revalidatePath(`/transfers/${id}`);
  revalidatePath("/transfers");
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
}

async function settleTransferDiscrepancyAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await settleInventoryTransferDiscrepancy(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/transfers/${id}`, error));
  }
  revalidatePath(`/transfers/${id}`);
  revalidatePath("/transfers");
}

function statusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (status === "REQUESTED" || status === "PARTIALLY_RECEIVED") {
    return "info" as const;
  }
  if (
    status === "DISPATCHED" ||
    status === "RECEIVED" ||
    status === "DISCREPANCY_SETTLED"
  ) {
    return "success" as const;
  }
  return "warning" as const;
}

export default async function TransferDetailPage({
  params,
  searchParams
}: TransferDetailPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseTransfers(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const transfer = await getInventoryTransfer(session, id);
  if (!transfer) {
    redirect("/transfers");
  }

  const canSubmitTransfers = session.permissionCodes.includes(
    permissions.transferSubmit
  );
  const canCancelTransfers = session.permissionCodes.includes(
    permissions.transferCancel
  );
  const canDispatchTransfers = session.permissionCodes.includes(
    permissions.transferDispatch
  );
  const canReceiveTransfers = session.permissionCodes.includes(
    permissions.transferReceive
  );
  const canReverseTransferReceipts = session.permissionCodes.includes(
    permissions.transferReceiptReverse
  );
  const canSettleTransferDiscrepancies = session.permissionCodes.includes(
    permissions.transferDiscrepancySettle
  );
  const canDispatchCurrentTransfer =
    canDispatchTransfers &&
    transfer.status === "REQUESTED" &&
    transfer.sourceLocationId === session.context.locationId;
  const canReceiveCurrentTransfer =
    canReceiveTransfers &&
    ["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"].includes(transfer.status) &&
    transfer.destinationLocationId === session.context.locationId;
  const canSettleCurrentTransfer =
    canSettleTransferDiscrepancies &&
    transfer.status === "DISPUTED" &&
    transfer.destinationLocationId === session.context.locationId;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="Transfer Request"
      subtitle={`${transfer.publicReference} / ${transfer.sourceLocationName} to ${transfer.destinationLocationName}`}
      activeNav="transfers"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Transfer Request</p>
              <h2 className="text-2xl font-semibold text-slate-950">
                {transfer.publicReference}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {transfer.sourceLocationName} to {transfer.destinationLocationName}
              </p>
            </div>
            <Badge tone={statusTone(transfer.status)}>{transfer.status}</Badge>
          </div>

          {transfer.status === "RECEIVED" ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              This transfer has been received at the destination location. Source and
              destination stock movements are now posted.
            </div>
          ) : transfer.status === "DISCREPANCY_SETTLED" ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              This transfer discrepancy has been settled with an audited non-posting
              resolution. Original dispatch and receipt movements remain unchanged.
            </div>
          ) : transfer.status === "PARTIALLY_RECEIVED" ? (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              This transfer has a posted partial receipt. Remaining dispatched stock can
              still be received by an authorized destination user.
            </div>
          ) : transfer.status === "DISPUTED" ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              This transfer has a destination discrepancy. Accepted quantities are in
              stock; rejected, damaged, and short quantities did not increase stock.
            </div>
          ) : transfer.status === "DISPATCHED" ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              This transfer has been dispatched from the source location. An authorized
              destination user can now receive it.
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              This request has not received stock at the destination. Dispatch posts
              source stock out only from the source location.
            </div>
          )}

          <dl className="mt-6 grid gap-4 ogfi-record-summary p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-500">Transfer type</dt>
              <dd className="text-slate-950">{transfer.transferType}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Requested by</dt>
              <dd className="text-slate-950">{transfer.requestedByName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Required by</dt>
              <dd className="text-slate-950">
                {transfer.requiredByDate ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Submitted</dt>
              <dd className="text-slate-950">
                {transfer.submittedAt
                  ? new Date(transfer.submittedAt).toLocaleString()
                  : "Not submitted"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Dispatched</dt>
              <dd className="text-slate-950">
                {transfer.dispatchedAt
                  ? new Date(transfer.dispatchedAt).toLocaleString()
                  : "Not dispatched"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Received</dt>
              <dd className="text-slate-950">
                {transfer.receivedAt
                  ? new Date(transfer.receivedAt).toLocaleString()
                  : "Not received"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-slate-500">Purpose</dt>
              <dd className="text-slate-950">{transfer.purpose}</dd>
            </div>
            {transfer.cancellationReason ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Cancellation reason</dt>
                <dd className="text-slate-950">{transfer.cancellationReason}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid gap-2 border-b border-slate-100 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 md:grid-cols-[3rem_1fr_repeat(6,7rem)]">
              <span>Line</span>
              <span>Item</span>
              <span>Requested</span>
              <span>Prepared</span>
              <span>Dispatched</span>
              <span>Received</span>
              <span>Rejected</span>
              <span>Damaged</span>
            </div>
            <div className="divide-y divide-slate-100">
              {transfer.lines.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 p-3 text-sm md:grid-cols-[3rem_1fr_repeat(6,7rem)]"
                >
                  <p className="font-semibold text-slate-500">#{line.lineNumber}</p>
                  <div>
                    <p className="font-medium text-slate-950">{line.itemName}</p>
                    <p className="text-xs text-slate-500">
                      {line.itemCode} / {line.sourceInventoryLocationName} to{" "}
                      {line.destinationInventoryLocationName}
                    </p>
                    {line.notes ? (
                      <p className="mt-1 text-xs text-slate-500">{line.notes}</p>
                    ) : null}
                  </div>
                  <p>
                    {line.requestedQty} {line.uomCode}
                  </p>
                  <p>
                    {line.preparedQty} {line.uomCode}
                  </p>
                  <p>
                    {line.dispatchedQty} {line.uomCode}
                  </p>
                  <p>
                    {line.receivedQty} {line.uomCode}
                  </p>
                  <p>
                    {line.rejectedQty} {line.uomCode}
                  </p>
                  <p>
                    {line.damagedQty} {line.uomCode}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/transfers" className="bg-slate-700 hover:bg-slate-800">
              Back to Transfers
            </ButtonLink>
            {transfer.status === "DRAFT" && canSubmitTransfers ? (
              <form action={submitTransferAction}>
                <input name="id" type="hidden" value={transfer.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                  Submit Request
                </button>
              </form>
            ) : null}
            {canDispatchCurrentTransfer ? (
              <form action={dispatchTransferAction}>
                <input name="id" type="hidden" value={transfer.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto">
                  Dispatch Stock
                </button>
              </form>
            ) : null}
          </div>

          {canReceiveCurrentTransfer ? (
            <div className="mt-4">
              <EntryModal title="Receive Transfer" triggerLabel="Receive Transfer">
                <form action={receiveTransferAction} className="mt-4 grid gap-4">
                  <input name="id" type="hidden" value={transfer.id} />
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Accepted quantity posts destination stock. Rejected, damaged, and
                    discrepancy quantities are recorded without increasing stock.
                  </div>
                  <div className="grid gap-3">
                    {transfer.lines.map((line) => {
                      const accountedQty =
                        line.receivedQty +
                        line.rejectedQty +
                        line.damagedQty +
                        line.discrepancyQty;
                      const remainingQty = Math.max(
                        Number((line.dispatchedQty - accountedQty).toFixed(6)),
                        0
                      );
                      if (remainingQty <= 0) {
                        return null;
                      }

                      return (
                        <div
                          key={line.id}
                          className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 lg:grid-cols-[1fr_repeat(4,7rem)]"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              #{line.lineNumber} {line.itemName}
                            </p>
                            <p className="text-xs text-slate-500">
                              Remaining: {remainingQty} {line.uomCode}
                            </p>
                          </div>
                          <label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">
                            Accepted
                            <input
                              className="rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950"
                              name={`lines.${line.id}.acceptedQty`}
                              type="number"
                              min="0"
                              step="0.000001"
                              defaultValue={remainingQty}
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">
                            Rejected
                            <input
                              className="rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950"
                              name={`lines.${line.id}.rejectedQty`}
                              type="number"
                              min="0"
                              step="0.000001"
                              defaultValue={0}
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">
                            Damaged
                            <input
                              className="rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950"
                              name={`lines.${line.id}.damagedQty`}
                              type="number"
                              min="0"
                              step="0.000001"
                              defaultValue={0}
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">
                            Short
                            <input
                              className="rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950"
                              name={`lines.${line.id}.discrepancyQty`}
                              type="number"
                              min="0"
                              step="0.000001"
                              defaultValue={0}
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold uppercase text-slate-500 lg:col-span-3 lg:col-start-2">
                            Discrepancy reason
                            <input
                              className="rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950"
                              name={`lines.${line.id}.discrepancyReason`}
                              placeholder="Required for rejected, damaged, or short quantity"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">
                            Evidence ref
                            <input
                              className="rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950"
                              name={`lines.${line.id}.evidenceReference`}
                              placeholder="Photo or document"
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Notes
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="notes"
                      placeholder="Optional receiving note"
                    />
                  </label>
                  <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-fit">
                    Post Receipt
                  </button>
                </form>
              </EntryModal>
            </div>
          ) : null}

          {transfer.receipts.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm font-bold uppercase text-slate-500">
                Receipt Events
              </h3>
              <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {transfer.receipts.map((receipt) => (
                  <div key={receipt.id} className="p-3 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-950">
                          {receipt.receivedByName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(receipt.receivedAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge tone={receipt.discrepancyFlag ? "warning" : "success"}>
                        {receipt.status}
                      </Badge>
                    </div>
                    {receipt.discrepancySummary ? (
                      <p className="mt-2 text-amber-700">
                        {receipt.discrepancySummary}
                      </p>
                    ) : null}
                    {receipt.reversedAt ? (
                      <p className="mt-2 text-slate-600">
                        Reversed by {receipt.reversedByName ?? "Unknown"} on{" "}
                        {new Date(receipt.reversedAt).toLocaleString()}:{" "}
                        {receipt.reversalReason}
                      </p>
                    ) : null}
                    {canReverseTransferReceipts &&
                    receipt.status === "POSTED" &&
                    transfer.destinationLocationId === session.context.locationId ? (
                      <div className="mt-3">
                        <EntryModal
                          title="Reverse Transfer Receipt"
                          triggerLabel="Reverse Receipt"
                        >
                          <form action={reverseTransferReceiptAction} className="mt-4 grid gap-3">
                            <input name="id" type="hidden" value={transfer.id} />
                            <input name="receiptId" type="hidden" value={receipt.id} />
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              Reversal reason
                              <input
                                className="rounded-md border border-slate-300 px-3 py-2"
                                name="reversalReason"
                                placeholder="Reason required"
                                required
                              />
                            </label>
                            <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-slate-700 px-4 text-sm font-semibold text-white hover:bg-slate-800 sm:w-fit">
                              Reverse Receipt
                            </button>
                          </form>
                        </EntryModal>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {canSettleCurrentTransfer ? (
            <div className="mt-4">
              <EntryModal
                title="Settle Transfer Discrepancy"
                triggerLabel="Settle Discrepancy"
              >
                <form action={settleTransferDiscrepancyAction} className="mt-4 grid gap-3">
                  <input name="id" type="hidden" value={transfer.id} />
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    This records a final non-posting resolution. It does not change
                    source or destination inventory movements.
                  </div>
                  <div className="grid gap-3 md:grid-cols-[12rem_1fr_1fr]">
                    <label className="grid gap-1 text-xs font-semibold uppercase text-amber-900">
                      Settlement type
                      <select
                        className="rounded-md border border-amber-300 px-2 py-2 text-sm font-normal text-slate-950"
                        name="settlementType"
                        defaultValue="INVESTIGATION_CLOSED"
                      >
                        <option value="INVESTIGATION_CLOSED">Investigation closed</option>
                        <option value="REPLACEMENT_TRANSFER">Replacement transfer</option>
                        <option value="ADJUSTMENT_LINKED">Adjustment linked</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-semibold uppercase text-amber-900">
                      Evidence ref
                      <input
                        className="rounded-md border border-amber-300 px-2 py-2 text-sm font-normal text-slate-950"
                        name="evidenceReference"
                        placeholder="Photo, ticket, or adjustment reference"
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold uppercase text-amber-900">
                      Resolution reason
                      <input
                        className="rounded-md border border-amber-300 px-2 py-2 text-sm font-normal text-slate-950"
                        name="settlementReason"
                        placeholder="Reason required"
                        required
                      />
                    </label>
                  </div>
                  <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800 sm:w-fit">
                    Settle Discrepancy
                  </button>
                </form>
              </EntryModal>
            </div>
          ) : null}

          {["DRAFT", "REQUESTED"].includes(transfer.status) &&
          canCancelTransfers ? (
            <div className="mt-4">
              <EntryModal title="Cancel Transfer Request" triggerLabel="Cancel Request">
                <form action={cancelTransferAction} className="mt-4 grid gap-3">
                  <input name="id" type="hidden" value={transfer.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Cancellation reason
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="cancellationReason"
                      placeholder="Reason required"
                      required
                    />
                  </label>
                  <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-slate-700 px-4 text-sm font-semibold text-white hover:bg-slate-800 sm:w-fit">
                    Cancel Request
                  </button>
                </form>
              </EntryModal>
            </div>
          ) : null}
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Audit History</h2>
          <ol className="mt-4 space-y-4">
            {transfer.auditEvents.length === 0 ? (
              <li className="text-sm text-slate-500">No audit events recorded.</li>
            ) : (
              transfer.auditEvents.map((event) => (
                <li key={event.id} className="border-l-2 border-blue-200 pl-3">
                  <p className="text-sm font-medium text-slate-950">{event.eventType}</p>
                  <p className="text-xs text-slate-500">{event.occurredAt}</p>
                  {typeof event.metadata?.reason === "string" ? (
                    <p className="mt-1 text-sm text-slate-700">
                      Reason: {event.metadata.reason}
                    </p>
                  ) : null}
                </li>
              ))
            )}
          </ol>
        </Panel>
      </div>
    </AppShell>
  );
}
