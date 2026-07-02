import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink } from "@ogfi/ui";
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
import { canExportReceivingReports } from "@/server/services/exportAuthorization";
import {
  createGoodsReceiptFromPurchaseOrder,
  listGoodsReceipts,
  listReceivablePurchaseOrders,
  postGoodsReceipt
} from "@/server/services/receiving";

export const dynamic = "force-dynamic";

type ReceivingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function createReceiptAction(formData: FormData) {
  "use server";

  let receiptId: string;
  try {
    receiptId = await createGoodsReceiptFromPurchaseOrder(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/receiving", error));
  }
  revalidatePath("/receiving");
  redirect(`/receiving/${receiptId}`);
}

async function postReceiptAction(formData: FormData) {
  "use server";

  let purchaseOrderId: string;
  try {
    purchaseOrderId = await postGoodsReceipt(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/receiving", error));
  }
  revalidatePath("/receiving");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
  redirect("/receiving");
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

export default async function ReceivingPage({ searchParams }: ReceivingPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const canViewReceiving = canUseReceiving(session.permissionCodes);
  const canCreateReceiving = session.permissionCodes.includes(
    permissions.receivingCreate
  );
  const canPostReceiving = session.permissionCodes.includes(permissions.receivingPost);
  const canExportReceiving = canExportReceivingReports(session);

  if (!canViewReceiving) {
    redirect(
      canReadPurchaseOrders(session.permissionCodes)
        ? "/purchase-orders"
        : getDefaultAppRoute(session.permissionCodes)
    );
  }

  const [receipts, receivableOrders] = await Promise.all([
    listGoodsReceipts(session),
    canCreateReceiving ? listReceivablePurchaseOrders(session) : Promise.resolve([])
  ]);
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Receiving"
      subtitle="Ledger-backed receiving from issued Purchase Orders"
      activeNav="receiving"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Issued PO</span>
          <span>Delivered</span>
          <span>Accepted</span>
          <span>Rejected / damaged / short</span>
          <span>Ledger posting</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>Only accepted quantities update inventory.</strong> Rejected,
          damaged, and short quantities remain visible as discrepancies and do not
          increase stock balances.
        </p>
      </div>
      <div className="space-y-4">
        {canCreateReceiving ? (
          <div className="flex justify-end">
            <EntryModal title="Create Draft Receipt" triggerLabel="Create Draft Receipt">
              {receivableOrders.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No issued Purchase Orders are ready for receiving in this location.
                </div>
              ) : (
                <div className="mt-4 grid gap-4">
                  {receivableOrders.map((order) => (
                    <form
                      key={order.id}
                      action={createReceiptAction}
                      className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <input name="purchaseOrderId" type="hidden" value={order.id} />
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-400">
                          {order.publicReference}
                        </p>
                        <p className="font-semibold text-slate-950">{order.supplierName}</p>
                        <p className="text-xs text-slate-500">
                          Expected {order.expectedDeliveryDate} / {order.status}
                        </p>
                        {deliveryAgingText(
                          order.deliveryAgingStatus,
                          order.daysOverdue
                        ) ? (
                          <p
                            className={`text-xs font-semibold ${
                              order.deliveryAgingStatus === "OVERDUE"
                                ? "text-red-700"
                                : order.deliveryAgingStatus === "DUE_TODAY"
                                  ? "text-amber-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {deliveryAgingText(
                              order.deliveryAgingStatus,
                              order.daysOverdue
                            )}
                          </p>
                        ) : null}
                      </div>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Supplier DR / reference
                        <input
                          className="rounded-md border border-slate-300 px-3 py-2"
                          name="supplierDeliveryReceiptNumber"
                          placeholder="Optional"
                        />
                      </label>
                      <div className="grid gap-3">
                        {order.lines.map((line) => (
                          <div
                            key={line.id}
                            className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3"
                          >
                            <div>
                              <p className="font-semibold text-slate-950">
                                #{line.lineNumber} {line.description}
                              </p>
                              <p className="text-xs text-slate-500">
                                Open {line.outstandingQty} {line.uomCode}
                              </p>
                            </div>
                            <div className="grid gap-2 md:grid-cols-3">
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Delivered
                                <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={line.outstandingQty} min="0" name={`line.${line.id}.deliveredQty`} step="0.001" type="number" />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Accepted
                                <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={line.outstandingQty} min="0" name={`line.${line.id}.acceptedQty`} step="0.001" type="number" />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Rejected
                                <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue="0" min="0" name={`line.${line.id}.rejectedQty`} step="0.001" type="number" />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Damaged
                                <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue="0" min="0" name={`line.${line.id}.damagedQty`} step="0.001" type="number" />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Lot
                                <input className="rounded-md border border-slate-300 px-3 py-2" name={`line.${line.id}.lotNumber`} placeholder={line.requiresLot ? "Required" : "Optional"} />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Expiry
                                <input className="rounded-md border border-slate-300 px-3 py-2" name={`line.${line.id}.expiryDate`} type="date" />
                              </label>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2">
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Discrepancy reason
                                <input className="rounded-md border border-slate-300 px-3 py-2" name={`line.${line.id}.discrepancyReason`} placeholder="Required for rejected, damaged, or short quantities" />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Discrepancy evidence reference
                                <input className="rounded-md border border-slate-300 px-3 py-2" name={`line.${line.id}.evidenceReference`} placeholder="Required for rejected, damaged, or short quantities" />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button className="inline-flex min-h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                        Create Draft Receipt
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </EntryModal>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Receiving Reports</h2>
              <p className="text-sm text-slate-500">
                Posted receipts create immutable inventory movements for accepted quantities
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Badge tone="info">GRN</Badge>
              {canExportReceiving ? (
                <ButtonLink
                  href="/receiving/export"
                  className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
            </div>
          </div>
          {receipts.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">No receiving reports yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Create a draft receiving report from an issued Purchase Order.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {receipts.map((receipt) => (
                <div key={receipt.id} className="ogfi-list-row grid gap-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {receipt.publicReference}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-950">
                        {receipt.supplierName}
                      </h3>
                      <p className="text-sm text-slate-600">
                        PO {receipt.purchaseOrderReference} / {receipt.lineCount} lines
                      </p>
                      <p className="text-xs text-slate-500">
                        PO {receipt.purchaseOrderStatus} / expected{" "}
                        {receipt.purchaseOrderExpectedDeliveryDate}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <Badge tone={receipt.status === "DRAFT" ? "neutral" : "success"}>
                        {receipt.status}
                      </Badge>
                      {receipt.discrepancyFlag ? (
                        <p className="mt-2 text-xs font-semibold text-amber-700">
                          Discrepancy recorded
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Received by {receipt.receivedByName}</span>
                    <span>/</span>
                    <span>{new Date(receipt.receivedAt).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <ButtonLink
                      href={`/receiving/${receipt.id}`}
                      className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                    >
                      View Details
                    </ButtonLink>
                    {receipt.status === "DRAFT" && canPostReceiving ? (
                      <form action={postReceiptAction}>
                        <input name="id" type="hidden" value={receipt.id} />
                        <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                          Post Receipt
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
