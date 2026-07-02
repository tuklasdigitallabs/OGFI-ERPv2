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
  canReadPurchaseOrders,
  canUseReceiving,
  canUsePurchaseRequests,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  cancelPurchaseOrder,
  getPurchaseOrder,
  issuePurchaseOrderToSupplier,
  requestPurchaseOrderAmendment,
  requestPurchaseOrderBalanceClosure,
  submitPurchaseOrderForApproval
} from "@/server/services/purchaseOrders";

export const dynamic = "force-dynamic";

type PurchaseOrderDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function submitForApproval(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await submitPurchaseOrderForApproval(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/purchase-orders/${id}`, error));
  }
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/approvals");
}

async function issueToSupplier(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await issuePurchaseOrderToSupplier(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/purchase-orders/${id}`, error));
  }
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/receiving");
}

async function cancelOrder(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await cancelPurchaseOrder(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/purchase-orders/${id}`, error));
  }
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/receiving");
}

async function requestBalanceClosure(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await requestPurchaseOrderBalanceClosure(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/purchase-orders/${id}`, error));
  }
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/approvals");
}

async function requestAmendment(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  const lineIds = formData.getAll("lineId").map(String);
  const orderedQtyValues = formData.getAll("orderedQty").map(String);
  const unitPriceValues = formData.getAll("unitPrice").map(String);
  const notesValues = formData.getAll("notes").map(String);
  formData.set(
    "proposedLines",
    JSON.stringify(
      lineIds.map((lineId, index) => ({
        purchaseOrderLineId: lineId,
        orderedQty: orderedQtyValues[index] ?? "",
        unitPrice: unitPriceValues[index] ?? "",
        notes: notesValues[index] ?? null
      }))
    )
  );

  try {
    await requestPurchaseOrderAmendment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/purchase-orders/${id}`, error));
  }
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/approvals");
}

function formatMoney(currencyCode: string, amount: number) {
  return `${currencyCode} ${amount.toFixed(2)}`;
}

function statusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (status === "APPROVED") {
    return "success" as const;
  }
  if (status === "ISSUED") {
    return "info" as const;
  }
  if (status === "FULLY_RECEIVED" || status === "CLOSED") {
    return "success" as const;
  }
  if (status === "CANCELLED") {
    return "neutral" as const;
  }
  return "warning" as const;
}

function receiptStatusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (status === "POSTED") {
    return "success" as const;
  }
  return "warning" as const;
}

function deliveryAgingText(status: string, daysOverdue: number) {
  if (status === "OVERDUE") {
    return `Overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}`;
  }
  if (status === "DUE_TODAY") {
    return "Delivery due today";
  }
  if (status === "UPCOMING") {
    return "Delivery upcoming";
  }
  if (status === "UNKNOWN") {
    return "Delivery aging unavailable";
  }
  return null;
}

function deliveryAgingClass(status: string) {
  if (status === "OVERDUE") {
    return "text-red-700";
  }
  if (status === "DUE_TODAY") {
    return "text-amber-700";
  }
  return "text-slate-500";
}

function getMetadataText(
  metadata: Record<string, unknown> | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export default async function PurchaseOrderDetailPage({
  params,
  searchParams
}: PurchaseOrderDetailPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canReadPurchaseOrders(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const order = await getPurchaseOrder(session, id);
  if (!order) {
    redirect("/purchase-orders");
  }
  const canSubmitPurchaseOrders = session.permissionCodes.includes(
    permissions.purchaseOrderSubmit
  );
  const canIssuePurchaseOrders = session.permissionCodes.includes(
    permissions.purchaseOrderIssue
  );
  const canCancelPurchaseOrders = session.permissionCodes.includes(
    permissions.purchaseOrderCancel
  );
  const canCloseRemainingBalance = session.permissionCodes.includes(
    permissions.purchaseOrderCloseRemaining
  );
  const canAmendPurchaseOrders = session.permissionCodes.includes(
    permissions.purchaseOrderAmend
  );
  const canAccessReceiving = canUseReceiving(session.permissionCodes);
  const canAccessPurchaseRequests = canUsePurchaseRequests(session.permissionCodes);
  const totalOrderedQty = order.lines.reduce((total, line) => total + line.orderedQty, 0);
  const totalReceivedQty = order.lines.reduce((total, line) => total + line.receivedQty, 0);
  const totalOutstandingQty = order.lines.reduce(
    (total, line) => total + line.outstandingQty,
    0
  );
  const supplierIssueEvents = order.auditEvents.filter(
    (event) =>
      event.eventType === "purchase_order.issued" ||
      event.eventType === "purchase_order.resent"
  );
  const hasDraftReceivingReport = order.receivingReports.some(
    (receipt) => receipt.status !== "POSTED"
  );
  const hasPendingBalanceClosure = order.balanceClosures.some(
    (closure) => closure.status === "PENDING_APPROVAL"
  );
  const hasPendingAmendment = order.amendments.some(
    (amendment) => amendment.status === "PENDING_APPROVAL"
  );
  const canRequestBalanceClosure =
    order.status === "PARTIALLY_RECEIVED" &&
    totalOutstandingQty > 0 &&
    !hasDraftReceivingReport &&
    !hasPendingBalanceClosure &&
    canCloseRemainingBalance;
  const canRequestAmendment =
    order.status === "ISSUED" &&
    order.receivingReports.length === 0 &&
    totalReceivedQty === 0 &&
    !hasPendingBalanceClosure &&
    !hasPendingAmendment &&
    canAmendPurchaseOrders;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="Purchase Order"
      subtitle={`${order.publicReference} / ${order.deliveryLocationName}`}
      activeNav="purchase-orders"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Purchase Order</p>
              <h2 className="text-2xl font-semibold text-slate-950">
                {order.publicReference}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {session.context.companyName} / {session.context.brandName} /{" "}
                {order.deliveryLocationName}
              </p>
            </div>
            <Badge tone={statusTone(order.status)}>{order.status}</Badge>
          </div>

          <dl className="mt-6 grid gap-4 ogfi-record-summary p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-500">Supplier</dt>
              <dd className="text-slate-950">{order.supplierName}</dd>
              <dd className="text-xs text-slate-500">{order.supplierCode}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Expected delivery</dt>
              <dd className="text-slate-950">{order.expectedDeliveryDate}</dd>
              {deliveryAgingText(order.deliveryAgingStatus, order.daysOverdue) ? (
                <dd
                  className={`text-xs font-semibold ${deliveryAgingClass(
                    order.deliveryAgingStatus
                  )}`}
                >
                  {deliveryAgingText(order.deliveryAgingStatus, order.daysOverdue)}
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Department</dt>
              <dd className="text-slate-950">{order.departmentName ?? "Not assigned"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Cost center</dt>
              <dd className="text-slate-950">{order.costCenterName ?? "Not assigned"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Created by</dt>
              <dd className="text-slate-950">{order.createdByName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Created</dt>
              <dd className="text-slate-950">
                {new Date(order.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>

          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid gap-2 border-b border-slate-100 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 md:grid-cols-[3rem_1fr_7rem_7rem_7rem_8rem_8rem]">
              <span>Line</span>
              <span>Description</span>
              <span>Ordered</span>
              <span>Received</span>
              <span>Open</span>
              <span>Unit price</span>
              <span className="md:text-right">Total</span>
            </div>
            <div className="divide-y divide-slate-100">
              {order.lines.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 p-3 text-sm md:grid-cols-[3rem_1fr_7rem_7rem_7rem_8rem_8rem]"
                >
                  <p className="font-semibold text-slate-500">#{line.lineNumber}</p>
                  <div>
                    <p className="font-medium text-slate-950">{line.description}</p>
                    <p className="text-xs text-slate-500">
                      {line.itemCode ? `${line.itemCode} / ` : ""}
                      {line.availabilityStatus ?? "Availability not stated"}
                      {line.leadTimeDays != null ? ` / ${line.leadTimeDays} lead days` : ""}
                    </p>
                    {line.notes ? (
                      <p className="mt-1 text-xs text-slate-500">{line.notes}</p>
                    ) : null}
                  </div>
                  <p className="text-slate-700">
                    {line.orderedQty} {line.uomCode}
                  </p>
                  <p className="text-slate-700">
                    {line.receivedQty} {line.uomCode}
                  </p>
                  <p className="text-slate-700">
                    {line.outstandingQty} {line.uomCode}
                  </p>
                  <p className="text-slate-700">
                    {formatMoney(order.currencyCode, line.unitPrice)}
                  </p>
                  <p className="font-semibold text-slate-900 md:text-right">
                    {formatMoney(order.currencyCode, line.lineTotal)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/purchase-orders" className="bg-slate-700 hover:bg-slate-800">
              Back to Purchase Orders
            </ButtonLink>
            {canAccessPurchaseRequests ? (
              <ButtonLink
                href={`/purchase-requests/${order.purchaseRequestId}`}
                className="bg-slate-100 text-blue-700 hover:bg-blue-50"
              >
                View Source PR
              </ButtonLink>
            ) : null}
            {[
              "APPROVED",
              "ISSUED",
              "PARTIALLY_RECEIVED",
              "FULLY_RECEIVED",
              "CLOSED"
            ].includes(
              order.status
            ) ? (
              <ButtonLink
                href={`/purchase-orders/${order.id}/print`}
                className="bg-slate-100 text-blue-700 hover:bg-blue-50"
              >
                Supplier Copy
              </ButtonLink>
            ) : null}
            {order.status === "DRAFT" && canSubmitPurchaseOrders ? (
              <form action={submitForApproval}>
                <input name="id" type="hidden" value={order.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                  Submit PO for Approval
                </button>
              </form>
            ) : null}
            {["ISSUED", "PARTIALLY_RECEIVED"].includes(order.status) &&
            canAccessReceiving ? (
              <ButtonLink
                href="/receiving"
                className="bg-slate-100 text-blue-700 hover:bg-blue-50"
              >
                Open Receiving
              </ButtonLink>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {["APPROVED", "ISSUED"].includes(order.status) &&
            canIssuePurchaseOrders ? (
              <EntryModal
                title={order.status === "ISSUED" ? "Record Supplier Re-send" : "Send PO to Supplier"}
                triggerLabel={order.status === "ISSUED" ? "Record Re-send" : "Send PO to Supplier"}
              >
                <form action={issueToSupplier} className="mt-4 grid gap-3">
                  <input name="id" type="hidden" value={order.id} />
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Method
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="communicationMethod"
                        required
                      >
                        <option value="Email">Email</option>
                        <option value="Printed copy">Printed copy</option>
                        <option value="Supplier portal">Supplier portal</option>
                        <option value="Manual handoff">Manual handoff</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Recipient / reference
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="recipientReference"
                        placeholder="Supplier contact, email, or ref"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Remarks
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="remarks"
                        placeholder="Optional note"
                      />
                    </label>
                  </div>
                  <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-fit">
                    {order.status === "ISSUED" ? "Record Re-send" : "Send PO to Supplier"}
                  </button>
                </form>
              </EntryModal>
            ) : null}
            {canRequestAmendment ? (
              <EntryModal title="Request PO Amendment" triggerLabel="Request Amendment">
                <form action={requestAmendment} className="mt-4 grid gap-4">
              <input name="id" type="hidden" value={order.id} />
              <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Amendment reason
                  <textarea
                    className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                    name="reason"
                    placeholder="Reason required for approval and audit"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Expected delivery
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2"
                    defaultValue={order.expectedDeliveryDate}
                    name="expectedDeliveryDate"
                    type="date"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Supplier notice reference
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2"
                    name="supplierNoticeReference"
                    placeholder="Email, ticket, or reference"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  If notice is unavailable, explain
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2"
                    name="supplierNoticeUnavailableReason"
                    placeholder="Why supplier notice is not available"
                  />
                </label>
              </div>
              <div className="overflow-x-auto rounded-lg border border-violet-100 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Line</th>
                      <th className="px-3 py-2 text-left">Qty</th>
                      <th className="px-3 py-2 text-left">Unit price</th>
                      <th className="px-3 py-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2">
                          <input name="lineId" type="hidden" value={line.id} />
                          <p className="font-semibold text-slate-950">
                            {line.lineNumber}. {line.description}
                          </p>
                          <p className="text-xs text-slate-500">{line.uomCode}</p>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-28 rounded-md border border-slate-300 px-3 py-2"
                            defaultValue={line.orderedQty}
                            min="0.000001"
                            name="orderedQty"
                            step="0.000001"
                            type="number"
                            required
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-32 rounded-md border border-slate-300 px-3 py-2"
                            defaultValue={line.unitPrice}
                            min="0"
                            name="unitPrice"
                            step="0.000001"
                            type="number"
                            required
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="min-w-48 rounded-md border border-slate-300 px-3 py-2"
                            defaultValue={line.notes ?? ""}
                            name="notes"
                            placeholder="Optional line note"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 sm:w-auto">
                  Request Amendment
                </button>
              </div>
                </form>
              </EntryModal>
            ) : null}
            {["DRAFT", "APPROVED", "ISSUED"].includes(order.status) &&
            canCancelPurchaseOrders ? (
              <EntryModal title="Cancel Purchase Order" triggerLabel="Cancel PO">
                <form action={cancelOrder} className="mt-4 grid gap-3">
                  <input name="id" type="hidden" value={order.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Cancellation reason
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="cancellationReason"
                      placeholder="Reason required for audit"
                      required
                    />
                  </label>
                  {order.status === "ISSUED" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Supplier notice reference
                        <input
                          className="rounded-md border border-slate-300 px-3 py-2"
                          name="supplierNoticeReference"
                          placeholder="Email, ticket, or reference"
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        If unavailable, explain
                        <input
                          className="rounded-md border border-slate-300 px-3 py-2"
                          name="supplierNoticeUnavailableReason"
                          placeholder="Why supplier notice is not available"
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">
                      Cancelling this PO clears its open quantities and keeps the supplier
                      commitment in audit history.
                    </p>
                  )}
                  <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 sm:w-fit">
                    Cancel PO
                  </button>
                </form>
              </EntryModal>
            ) : null}
            {canRequestBalanceClosure ? (
              <EntryModal title="Request Balance Closure" triggerLabel="Request Closure">
                <form action={requestBalanceClosure} className="mt-4 grid gap-3">
                  <input name="id" type="hidden" value={order.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Remaining balance closure reason
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="reason"
                      placeholder="Reason required for approval and audit"
                      required
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Supplier notice reference
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="supplierNoticeReference"
                        placeholder="Email, ticket, or reference"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      If unavailable, explain
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="supplierNoticeUnavailableReason"
                        placeholder="Why supplier notice is not available"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Notes
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="notes"
                      placeholder="Optional internal note"
                    />
                  </label>
                  <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 sm:w-fit">
                    Request Closure
                  </button>
                </form>
              </EntryModal>
            ) : null}
          </div>
          {hasPendingAmendment ? (
            <p className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
              A Purchase Order amendment is pending approval. Receiving is paused
              until it is approved, returned, or rejected.
            </p>
          ) : null}
        </Panel>

        <div className="grid gap-4">
          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Totals</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="font-semibold text-slate-900">
                  {formatMoney(order.currencyCode, order.subtotalAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Tax</dt>
                <dd className="font-semibold text-slate-900">
                  {formatMoney(order.currencyCode, order.taxAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Discount</dt>
                <dd className="font-semibold text-slate-900">
                  {formatMoney(order.currencyCode, order.discountAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-slate-100 pt-3">
                <dt className="font-semibold text-slate-950">Total</dt>
                <dd className="text-lg font-bold text-blue-700">
                  {formatMoney(order.currencyCode, order.totalAmount)}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Commercial Terms</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Currency</dt>
                <dd className="font-semibold text-slate-900">{order.currencyCode}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Expected delivery</dt>
                <dd className="text-right">
                  <span className="block font-semibold text-slate-900">
                    {order.expectedDeliveryDate}
                  </span>
                  {deliveryAgingText(order.deliveryAgingStatus, order.daysOverdue) ? (
                    <span
                      className={`block text-xs font-semibold ${deliveryAgingClass(
                        order.deliveryAgingStatus
                      )}`}
                    >
                      {deliveryAgingText(order.deliveryAgingStatus, order.daysOverdue)}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Quote date</dt>
                <dd className="font-semibold text-slate-900">
                  {order.selectedQuoteDate}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Quote validity</dt>
                <dd className="font-semibold text-slate-900">
                  {order.selectedQuoteValidityDate ?? "Not stated"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-950">Supplier payment terms</p>
              <p className="mt-1 text-slate-600">
                {order.supplierPaymentTerms ?? "Not stated"}
              </p>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-950">Quote terms</p>
              <p className="mt-1 text-slate-600">
                {order.selectedQuoteTerms ?? "Not stated"}
              </p>
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Receiving Progress</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Ordered quantity</dt>
                <dd className="font-semibold text-slate-900">{totalOrderedQty}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Accepted quantity</dt>
                <dd className="font-semibold text-slate-900">{totalReceivedQty}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-slate-100 pt-3">
                <dt className="font-semibold text-slate-950">Open quantity</dt>
                <dd className="font-bold text-blue-700">{totalOutstandingQty}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-3">
              {order.receivingReports.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No Receiving Reports recorded yet.
                </p>
              ) : (
                order.receivingReports.map((receipt) => (
                  <div
                    key={receipt.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">
                          {receipt.publicReference}
                        </p>
                        <p className="text-xs text-slate-500">
                          Received by {receipt.receivedByName} /{" "}
                          {new Date(receipt.receivedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge tone={receiptStatusTone(receipt.status)}>
                        {receipt.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      Accepted {receipt.acceptedQty} / Rejected {receipt.rejectedQty} /
                      Damaged {receipt.damagedQty} / Short {receipt.shortQty}
                    </p>
                    {receipt.discrepancyFlag ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Discrepancy recorded
                      </p>
                    ) : null}
                    {canAccessReceiving ? (
                      <ButtonLink
                        href={`/receiving/${receipt.id}`}
                        className="mt-3 min-h-8 bg-white px-3 text-xs text-blue-700 hover:bg-blue-50"
                      >
                        View Receipt
                      </ButtonLink>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Amendments</h2>
            <p className="text-sm text-slate-500">
              Controlled PO changes before any receiving activity
            </p>
            <div className="mt-4 space-y-3">
              {order.amendments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No amendments requested.
                </p>
              ) : (
                order.amendments.map((amendment) => (
                  <div
                    key={amendment.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">
                          Requested by {amendment.requestedByName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(amendment.requestedAt).toLocaleDateString()}
                          {amendment.approvedByName
                            ? ` / approved by ${amendment.approvedByName}`
                            : ""}
                        </p>
                      </div>
                      <Badge
                        tone={
                          amendment.status === "APPROVED"
                            ? "success"
                            : amendment.status === "REJECTED" ||
                                amendment.status === "RETURNED"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {amendment.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      {amendment.reason}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {amendment.supplierNoticeReference
                        ? `Supplier notice: ${amendment.supplierNoticeReference}`
                        : `Notice unavailable: ${amendment.supplierNoticeUnavailableReason}`}
                    </p>
                    {amendment.rejectionReason ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Decision remarks: {amendment.rejectionReason}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Balance Closure</h2>
            <p className="text-sm text-slate-500">
              Approval-backed closure of undelivered PO quantities
            </p>
            <div className="mt-4 space-y-3">
              {order.balanceClosures.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No remaining balance closure requested.
                </p>
              ) : (
                order.balanceClosures.map((closure) => (
                  <div
                    key={closure.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">
                          {formatMoney(order.currencyCode, closure.totalClosedValue)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Requested by {closure.requestedByName} /{" "}
                          {new Date(closure.requestedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge
                        tone={
                          closure.status === "APPROVED"
                            ? "success"
                            : closure.status === "REJECTED" ||
                                closure.status === "RETURNED"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {closure.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{closure.reason}</p>
                    <p className="mt-2 text-xs text-slate-600">
                      Closed quantity {closure.totalClosedQuantity}
                      {closure.approvedByName
                        ? ` / approved by ${closure.approvedByName}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {closure.supplierNoticeReference
                        ? `Supplier notice: ${closure.supplierNoticeReference}`
                        : `Notice unavailable: ${closure.supplierNoticeUnavailableReason}`}
                    </p>
                    {closure.rejectionReason ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Decision remarks: {closure.rejectionReason}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
              {hasDraftReceivingReport ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Draft receiving reports must be posted or cleared before requesting
                  balance closure.
                </p>
              ) : null}
              {hasPendingBalanceClosure ? (
                <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  A closure request is already pending approval.
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Source Lineage</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">
                  PR {order.purchaseRequestReference}
                </p>
                <p className="text-xs text-slate-500">
                  {order.purchaseRequestStatus} / requested by {order.requesterName}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">
                  Quote {order.selectedQuoteReference}
                </p>
                <p className="text-xs text-slate-500">
                  {order.selectedQuoteDate} / recommendation {order.recommendationStatus}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">Selection reason</p>
                <p className="mt-1 text-slate-700">
                  {order.recommendationSelectionReason}
                </p>
                {order.recommendationNonLowestJustification ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Non-lowest justification: {order.recommendationNonLowestJustification}
                  </p>
                ) : null}
                {order.recommendationSingleSourceJustification ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Single-source justification:{" "}
                    {order.recommendationSingleSourceJustification}
                  </p>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Approval Timeline</h2>
            <p className="text-sm text-slate-500">
              Configured approval route and step decisions for this PO
            </p>
            <div className="mt-4 space-y-3">
              {order.approvalTimeline.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  This PO has not been submitted into an approval route yet.
                </p>
              ) : (
                order.approvalTimeline.map((approval) => (
                  <div
                    key={approval.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">
                          Approval request
                        </p>
                        <p className="text-xs text-slate-500">
                          Created {new Date(approval.createdAt).toLocaleString()}
                          {approval.currentStepOrder
                            ? ` / step ${approval.currentStepOrder} pending`
                            : ""}
                        </p>
                      </div>
                      <Badge tone={approval.status === "APPROVED" ? "success" : "info"}>
                        {approval.status}
                      </Badge>
                    </div>
                    <ol className="mt-3 space-y-2">
                      {approval.steps.map((step) => (
                        <li
                          key={step.id}
                          className="grid gap-1 border-l-2 border-blue-200 pl-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-950">
                              Step {step.stepOrder}
                            </span>
                            <Badge
                              tone={
                                step.status === "APPROVED"
                                  ? "success"
                                  : step.status === "PENDING"
                                    ? "info"
                                    : "neutral"
                              }
                            >
                              {step.status}
                            </Badge>
                          </div>
                          <p className="text-slate-600">Assigned to {step.assignedName}</p>
                          {step.actedByName || step.actedAt ? (
                            <p className="text-xs text-slate-500">
                              {step.actedByName ?? "Approver"} /{" "}
                              {step.actedAt
                                ? new Date(step.actedAt).toLocaleString()
                                : "time not recorded"}
                            </p>
                          ) : null}
                          {step.remarks ? (
                            <p className="text-xs text-slate-600">
                              Remarks: {step.remarks}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Supplier Issue History</h2>
            <p className="text-sm text-slate-500">
              Supplier communication evidence for issue and re-send actions
            </p>
            <div className="mt-4 space-y-3">
              {supplierIssueEvents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No supplier issue/send event recorded yet.
                </p>
              ) : (
                supplierIssueEvents.map((event) => {
                  const communicationMethod = getMetadataText(
                    event.metadata,
                    "communicationMethod"
                  );
                  const recipientReference = getMetadataText(
                    event.metadata,
                    "recipientReference"
                  );
                  const remarks = getMetadataText(event.metadata, "remarks");

                  return (
                    <div
                      key={event.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">
                            {event.eventType === "purchase_order.resent"
                              ? "Re-send recorded"
                              : "Issued to supplier"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(event.occurredAt).toLocaleString()}
                            {event.actorName ? ` / by ${event.actorName}` : ""}
                          </p>
                        </div>
                        <Badge tone="info">
                          {communicationMethod ?? "Recorded"}
                        </Badge>
                      </div>
                      {recipientReference ? (
                        <p className="mt-2 text-sm text-slate-700">
                          Recipient/ref: {recipientReference}
                        </p>
                      ) : null}
                      {remarks ? (
                        <p className="mt-1 text-sm text-slate-700">
                          Remarks: {remarks}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Attachments</h2>
            <p className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Supplier copy and communication references are recorded in issue history.
              Formal PO attachment upload and enforcement remain a future controlled
              workflow.
            </p>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Audit History</h2>
            <p className="text-sm text-slate-500">Append-only activity for this PO</p>
            <ol className="mt-4 space-y-4">
              {order.auditEvents.length === 0 ? (
                <li className="text-sm text-slate-500">No audit events recorded.</li>
              ) : (
                order.auditEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-blue-200 pl-3">
                    <p className="text-sm font-medium text-slate-950">{event.eventType}</p>
                    <p className="text-xs text-slate-500">
                      {event.occurredAt}
                      {event.actorName ? ` / by ${event.actorName}` : ""}
                    </p>
                    {typeof event.metadata?.remarks === "string" ? (
                      <p className="mt-1 text-sm text-slate-700">
                        Remarks: {event.metadata.remarks}
                      </p>
                    ) : null}
                    {typeof event.metadata?.cancellationReason === "string" ? (
                      <p className="mt-1 text-sm text-slate-700">
                        Reason: {event.metadata.cancellationReason}
                      </p>
                    ) : null}
                    {typeof event.metadata?.supplierNoticeReference === "string" ? (
                      <p className="mt-1 text-sm text-slate-700">
                        Supplier notice: {event.metadata.supplierNoticeReference}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ol>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
