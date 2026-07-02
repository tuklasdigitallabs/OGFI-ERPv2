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
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  getGoodsReceipt,
  postGoodsReceipt,
  reverseGoodsReceipt
} from "@/server/services/receiving";

export const dynamic = "force-dynamic";

type ReceivingDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function postReceiptAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  let purchaseOrderId: string;
  try {
    purchaseOrderId = await postGoodsReceipt(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/receiving/${id}`, error));
  }
  revalidatePath(`/receiving/${id}`);
  revalidatePath("/receiving");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
}

async function reverseReceiptAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  let purchaseOrderId: string;
  try {
    purchaseOrderId = await reverseGoodsReceipt(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/receiving/${id}`, error));
  }
  revalidatePath(`/receiving/${id}`);
  revalidatePath("/receiving");
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
}

function statusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (
    status === "POSTED" ||
    status === "POSTED_WITH_DISCREPANCY" ||
    status === "REVERSED"
  ) {
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
  return null;
}

export default async function ReceivingDetailPage({
  params,
  searchParams
}: ReceivingDetailPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseReceiving(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const canAccessPurchaseOrders = canReadPurchaseOrders(session.permissionCodes);

  const { id } = await params;
  const receipt = await getGoodsReceipt(session, id);
  if (!receipt) {
    redirect("/receiving");
  }
  const canPostReceiving = session.permissionCodes.includes(permissions.receivingPost);
  const canReverseReceiving = session.permissionCodes.includes(
    permissions.receivingReverse
  );
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="Receiving Report"
      subtitle={`${receipt.publicReference} / ${receipt.receivingLocationName}`}
      activeNav="receiving"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Receiving Report</p>
              <h2 className="text-2xl font-semibold text-slate-950">
                {receipt.publicReference}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                PO {receipt.purchaseOrderReference} / {receipt.supplierName}
              </p>
            </div>
            <Badge tone={statusTone(receipt.status)}>{receipt.status}</Badge>
          </div>

          <dl className="mt-6 grid gap-4 ogfi-record-summary p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-500">Receiving location</dt>
              <dd className="text-slate-950">{receipt.receivingLocationName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Received by</dt>
              <dd className="text-slate-950">{receipt.receivedByName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Received at</dt>
              <dd className="text-slate-950">
                {new Date(receipt.receivedAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Posted at</dt>
              <dd className="text-slate-950">
                {receipt.postedAt ? new Date(receipt.postedAt).toLocaleString() : "Not posted"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Reversed at</dt>
              <dd className="text-slate-950">
                {receipt.reversedAt
                  ? new Date(receipt.reversedAt).toLocaleString()
                  : "Not reversed"}
              </dd>
              {receipt.reversedByName ? (
                <dd className="text-xs text-slate-500">
                  by {receipt.reversedByName}
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Supplier DR</dt>
              <dd className="text-slate-950">
                {receipt.supplierDeliveryReceiptNumber ?? "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">PO status</dt>
              <dd className="text-slate-950">{receipt.purchaseOrderStatus}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">PO expected delivery</dt>
              <dd className="text-slate-950">
                {receipt.purchaseOrderExpectedDeliveryDate}
              </dd>
              {deliveryAgingText(
                receipt.purchaseOrderDeliveryAgingStatus,
                receipt.purchaseOrderDaysOverdue
              ) ? (
                <dd
                  className={`text-xs font-semibold ${
                    receipt.purchaseOrderDeliveryAgingStatus === "OVERDUE"
                      ? "text-red-700"
                      : receipt.purchaseOrderDeliveryAgingStatus === "DUE_TODAY"
                        ? "text-amber-700"
                        : "text-slate-500"
                  }`}
                >
                  {deliveryAgingText(
                    receipt.purchaseOrderDeliveryAgingStatus,
                    receipt.purchaseOrderDaysOverdue
                  )}
                </dd>
              ) : null}
            </div>
          </dl>

          {receipt.discrepancyFlag ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Discrepancy recorded</p>
              <p className="mt-1">{receipt.discrepancySummary}</p>
            </div>
          ) : null}

          {receipt.reversalReason ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">Receipt reversed</p>
              <p className="mt-1">{receipt.reversalReason}</p>
            </div>
          ) : null}

          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid gap-2 border-b border-slate-100 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 md:grid-cols-[3rem_1fr_6rem_6rem_6rem_6rem_6rem]">
              <span>Line</span>
              <span>Description</span>
              <span>Delivered</span>
              <span>Accepted</span>
              <span>Rejected</span>
              <span>Damaged</span>
              <span>Short</span>
            </div>
            <div className="divide-y divide-slate-100">
              {receipt.lines.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 p-3 text-sm md:grid-cols-[3rem_1fr_6rem_6rem_6rem_6rem_6rem]"
                >
                  <p className="font-semibold text-slate-500">#{line.lineNumber}</p>
                  <div>
                    <p className="font-medium text-slate-950">{line.description}</p>
                    <p className="text-xs text-slate-500">
                      {line.itemCode} / {line.destinationName} / {line.conditionStatus}
                    </p>
                    {line.discrepancyReason ? (
                      <p className="mt-1 text-xs text-amber-700">
                        {line.discrepancyType}: {line.discrepancyReason}
                      </p>
                    ) : null}
                    {line.evidenceReference ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Evidence: {line.evidenceReference}
                      </p>
                    ) : null}
                    {line.lotNumber || line.expiryDate ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Lot {line.lotNumber ?? "none"} / Expiry {line.expiryDate ?? "none"}
                      </p>
                    ) : null}
                    {line.postedMovementId ? (
                      <p className="mt-1 text-xs text-emerald-700">
                        Movement {line.postedMovementId}
                        {line.reversalMovementCount > 0
                          ? ` / Reversed ${line.reversalMovementCount} time${
                              line.reversalMovementCount === 1 ? "" : "s"
                            }`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <p>{line.deliveredQty} {line.uomCode}</p>
                  <p>{line.acceptedQty} {line.uomCode}</p>
                  <p>{line.rejectedQty} {line.uomCode}</p>
                  <p>{line.damagedQty} {line.uomCode}</p>
                  <p>{line.shortQty} {line.uomCode}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/receiving" className="bg-slate-700 hover:bg-slate-800">
              Back to Receiving
            </ButtonLink>
            {canAccessPurchaseOrders ? (
              <ButtonLink
                href={`/purchase-orders/${receipt.purchaseOrderId}`}
                className="bg-slate-100 text-blue-700 hover:bg-blue-50"
              >
                View Purchase Order
              </ButtonLink>
            ) : null}
            {receipt.status === "DRAFT" && canPostReceiving ? (
              <form action={postReceiptAction}>
                <input name="id" type="hidden" value={receipt.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                  Post Receipt
                </button>
              </form>
            ) : null}
          </div>
        </Panel>

        <div className="grid gap-4">
          {canReverseReceiving &&
          (receipt.status === "POSTED" ||
            receipt.status === "POSTED_WITH_DISCREPANCY") ? (
            <Panel className="ogfi-detail-card">
              <h2 className="text-lg font-bold text-slate-950">Reverse Receipt</h2>
              <p className="mt-1 text-sm text-slate-600">
                Reversal creates linked inventory movements and restores PO received
                quantities. The original receipt remains visible.
              </p>
              <div className="mt-4">
                <EntryModal title="Reverse Receipt" triggerLabel="Reverse Receipt">
                  <form action={reverseReceiptAction} className="mt-4 grid gap-3">
                    <input name="id" type="hidden" value={receipt.id} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Reversal reason
                      <textarea
                        className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                        maxLength={500}
                        minLength={5}
                        name="reversalReason"
                        required
                      />
                    </label>
                    <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 sm:w-fit">
                      Reverse Receipt
                    </button>
                  </form>
                </EntryModal>
              </div>
            </Panel>
          ) : null}
          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Audit History</h2>
            <ol className="mt-4 space-y-4">
              {receipt.auditEvents.length === 0 ? (
                <li className="text-sm text-slate-500">No audit events recorded.</li>
              ) : (
                receipt.auditEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-blue-200 pl-3">
                    <p className="text-sm font-medium text-slate-950">{event.eventType}</p>
                    <p className="text-xs text-slate-500">
                      {event.occurredAt}
                      {event.actorName ? ` / by ${event.actorName}` : ""}
                    </p>
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
