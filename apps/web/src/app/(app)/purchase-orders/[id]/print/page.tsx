import { redirect } from "next/navigation";
import {
  canReadPurchaseOrders,
  getDefaultAppRoute
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  assertPurchaseOrderCanRenderSupplierCopy,
  getPurchaseOrder
} from "@/server/services/purchaseOrders";

export const dynamic = "force-dynamic";

function formatMoney(currencyCode: string, amount: number) {
  return `${currencyCode} ${amount.toFixed(2)}`;
}

function formatQuantity(quantity: number, uomCode: string) {
  return `${quantity.toFixed(3)} ${uomCode}`;
}

function metadataText(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export default async function PurchaseOrderPrintPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
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
  try {
    assertPurchaseOrderCanRenderSupplierCopy(order.status);
  } catch {
    redirect(`/purchase-orders/${order.id}`);
  }

  const lastIssueEvent = [...order.auditEvents]
    .reverse()
    .find(
      (event) =>
        event.eventType === "purchase_order.issued" ||
        event.eventType === "purchase_order.resent"
    );
  const communicationMethod = metadataText(
    lastIssueEvent?.metadata,
    "communicationMethod"
  );
  const recipientReference = metadataText(
    lastIssueEvent?.metadata,
    "recipientReference"
  );
  const remarks = metadataText(lastIssueEvent?.metadata, "remarks");
  const issueRecordedAt = lastIssueEvent?.occurredAt
    ? new Date(lastIssueEvent.occurredAt).toLocaleString()
    : null;

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl rounded-lg bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-blue-700">
              Supplier Purchase Order
            </p>
            <h1 className="mt-1 text-3xl font-bold">{order.publicReference}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {session.context.companyName} / {order.deliveryLocationName}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Status</p>
            <p className="text-lg font-bold">{order.status}</p>
            <p className="mt-1 text-sm text-slate-600">
              Expected {order.expectedDeliveryDate}
            </p>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4 print:rounded-none">
            <h2 className="text-sm font-bold uppercase text-slate-500">Supplier</h2>
            <p className="mt-2 text-lg font-semibold">{order.supplierName}</p>
            <p className="text-sm text-slate-600">{order.supplierCode}</p>
            {lastIssueEvent ? (
              <div className="mt-4 text-sm text-slate-700">
                {communicationMethod ? <p>Sent by {communicationMethod}</p> : null}
                {recipientReference ? <p>Recipient/ref: {recipientReference}</p> : null}
                {issueRecordedAt ? <p>Recorded {issueRecordedAt}</p> : null}
                {lastIssueEvent.actorName ? (
                  <p>Recorded by {lastIssueEvent.actorName}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Supplier issue/send evidence has not been recorded.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-4 print:rounded-none">
            <h2 className="text-sm font-bold uppercase text-slate-500">
              Delivery and Source
            </h2>
            <dl className="mt-2 grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Delivery location</dt>
                <dd className="font-semibold">{order.deliveryLocationName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Source PR</dt>
                <dd className="font-semibold">{order.purchaseRequestReference}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Quote reference</dt>
                <dd className="font-semibold">{order.selectedQuoteReference}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Buyer</dt>
                <dd className="font-semibold">{order.createdByName}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 print:rounded-none">
          <div className="grid grid-cols-[3rem_1fr_7rem_7rem_8rem] gap-2 border-b border-slate-200 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 print:bg-white">
            <span>#</span>
            <span>Description</span>
            <span>Qty</span>
            <span>Unit</span>
            <span className="text-right">Line total</span>
          </div>
          {order.lines.map((line) => (
            <div
              key={line.id}
              className="grid grid-cols-[3rem_1fr_7rem_7rem_8rem] gap-2 border-b border-slate-100 p-3 text-sm last:border-b-0"
            >
              <span className="font-semibold text-slate-500">{line.lineNumber}</span>
              <div>
                <p className="font-semibold">{line.description}</p>
                <p className="text-xs text-slate-500">
                  {line.itemCode ? `${line.itemCode} / ` : ""}
                  {line.sourcePrPurpose ?? "No source purpose"}
                </p>
              </div>
              <span>{formatQuantity(line.orderedQty, line.uomCode)}</span>
              <span>{formatMoney(order.currencyCode, line.unitPrice)}</span>
              <span className="text-right font-semibold">
                {formatMoney(order.currencyCode, line.lineTotal)}
              </span>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-[1fr_22rem]">
          <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700 print:rounded-none">
            <h2 className="text-sm font-bold uppercase text-slate-500">Notes</h2>
            <p className="mt-2">
              Delivery acceptance remains subject to OGFI receiving inspection and
              discrepancy handling. This document does not record inventory receipt.
            </p>
            {remarks ? <p className="mt-3">Issue remarks: {remarks}</p> : null}
          </div>
          <dl className="rounded-lg border border-slate-200 p-4 text-sm print:rounded-none">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-semibold">
                {formatMoney(order.currencyCode, order.subtotalAmount)}
              </dd>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <dt className="text-slate-500">Tax</dt>
              <dd className="font-semibold">
                {formatMoney(order.currencyCode, order.taxAmount)}
              </dd>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <dt className="text-slate-500">Discount</dt>
              <dd className="font-semibold">
                {formatMoney(order.currencyCode, order.discountAmount)}
              </dd>
            </div>
            <div className="mt-3 flex justify-between gap-3 border-t border-slate-200 pt-3 text-lg">
              <dt className="font-bold">Total</dt>
              <dd className="font-bold text-blue-700 print:text-slate-950">
                {formatMoney(order.currencyCode, order.totalAmount)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="mt-6 flex items-center justify-between gap-4 text-xs text-slate-500 print:mt-8">
          <span>Generated from OGFI ERP on {new Date().toLocaleString()}</span>
          <span>Source of truth: {order.publicReference}</span>
        </div>

        <div className="mt-6 flex gap-3 print:hidden">
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900"
            href={`/purchase-orders/${order.id}`}
          >
            Back to PO
          </a>
        </div>
      </div>
    </main>
  );
}
