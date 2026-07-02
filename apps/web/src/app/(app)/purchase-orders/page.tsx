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
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportPurchaseOrders } from "@/server/services/exportAuthorization";
import {
  createPurchaseOrderFromRecommendation,
  listApprovedRecommendationsForPo,
  listPurchaseOrders,
  type PurchaseOrderListFilters
} from "@/server/services/purchaseOrders";

export const dynamic = "force-dynamic";

async function createPurchaseOrderAction(formData: FormData) {
  "use server";

  try {
    await createPurchaseOrderFromRecommendation(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/purchase-orders", error));
  }
  revalidatePath("/purchase-orders");
  redirect("/purchase-orders");
}

type PurchaseOrdersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function purchaseOrderStatusTone(status: string) {
  if (status === "DRAFT" || status === "CLOSED" || status === "CANCELLED") {
    return "neutral" as const;
  }
  if (status === "PENDING_APPROVAL" || status === "APPROVED") {
    return "info" as const;
  }
  if (
    status === "ISSUED" ||
    status === "PARTIALLY_RECEIVED" ||
    status === "FULLY_RECEIVED"
  ) {
    return "success" as const;
  }
  return "warning" as const;
}

export default async function PurchaseOrdersPage({
  searchParams
}: PurchaseOrdersPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const canViewPurchaseOrders = canReadPurchaseOrders(session.permissionCodes);
  const canCreatePurchaseOrders = session.permissionCodes.includes(
    permissions.purchaseOrderCreate
  );
  const canExportPurchaseOrderCsv = canExportPurchaseOrders(session);

  if (!canViewPurchaseOrders) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const filters: PurchaseOrderListFilters = {
    query: getSearchParam(params, "q"),
    status: getSearchParam(params, "status"),
    expectedFrom: getSearchParam(params, "expectedFrom"),
    expectedTo: getSearchParam(params, "expectedTo"),
    minAmount: getSearchParam(params, "minAmount"),
    maxAmount: getSearchParam(params, "maxAmount"),
    approver: getSearchParam(params, "approver")
  };
  const exportParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });

  const [orders, approvedRecommendations] = await Promise.all([
    listPurchaseOrders(session, filters),
    canCreatePurchaseOrders
      ? listApprovedRecommendationsForPo(session)
      : Promise.resolve([])
  ]);
  const scopedTotal = orders.reduce((total, order) => total + order.totalAmount, 0);
  const firstRecommendation = approvedRecommendations[0];

  return (
    <AppShell
      session={session}
      title="Purchase Orders"
      subtitle="Approved supplier commitments, receiving status, and closure controls"
      activeNav="purchase-orders"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Approved PR</span>
          <span>Quote comparison</span>
          <span>Purchase Order</span>
          <span>Receiving</span>
          <span>Ledger</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>Purchase Orders are supplier commitments from approved sourcing.</strong>{" "}
          Receiving remains a separate control, and stock changes only when accepted
          receipt quantities are posted.
        </p>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Scoped POs</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{orders.length}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Filtered value</p>
          <p className="mt-2 text-2xl font-bold text-blue-700">
            {orders[0]?.currencyCode ?? "PHP"} {scopedTotal.toFixed(2)}
          </p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Approved recommendations</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {approvedRecommendations.length}
          </p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Location</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {session.context.locationName}
          </p>
        </Panel>
      </div>

      <div className="space-y-4">
        {canCreatePurchaseOrders ? (
          <div className="flex justify-end">
            <EntryModal title="Create Draft PO" triggerLabel="Create Draft PO">
              {approvedRecommendations.length > 0 ? (
                <form action={createPurchaseOrderAction} className="mt-4 grid gap-3">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Approved recommendation
                    <select
                      className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2"
                      name="quotationRecommendationId"
                      defaultValue={firstRecommendation?.id}
                      required
                    >
                      {approvedRecommendations.map((recommendation) => (
                        <option key={recommendation.id} value={recommendation.id}>
                          {recommendation.purchaseRequestReference} /{" "}
                          {recommendation.selectedSupplierName} /{" "}
                          {recommendation.currencyCode}{" "}
                          {recommendation.selectedEvaluatedTotal.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">
                      {firstRecommendation?.lineLabel ?? "Approved quote"}
                    </p>
                    <p className="mt-1">
                      Expected delivery defaults to{" "}
                      {firstRecommendation?.expectedDeliveryDate ?? "the PR required date"}.
                    </p>
                  </div>
                  <button className="inline-flex min-h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                    Create Draft PO
                  </button>
                </form>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No approved supplier recommendations are ready for PO creation.
                </div>
              )}
            </EntryModal>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Scoped Purchase Orders</h2>
              <p className="text-sm text-slate-500">
                Approval, supplier issue, receiving, and inventory posting controls
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canExportPurchaseOrderCsv ? (
                <ButtonLink
                  href={`/purchase-orders/export${exportParams.toString() ? `?${exportParams}` : ""}`}
                  className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
              <Badge tone="info">Lifecycle</Badge>
            </div>
          </div>
          <form className="ogfi-filter-bar grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Search
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                name="q"
                defaultValue={filters.query}
                placeholder="PO, supplier, PR, quote"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Status
              <select
                className="rounded-md border border-slate-300 px-3 py-2"
                name="status"
                defaultValue={filters.status}
              >
                <option value="">All</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING_APPROVAL">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="ISSUED">Issued</option>
                <option value="PARTIALLY_RECEIVED">Partially received</option>
                <option value="FULLY_RECEIVED">Fully received</option>
                <option value="CLOSED">Closed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              From
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                name="expectedFrom"
                type="date"
                defaultValue={filters.expectedFrom}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              To
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                name="expectedTo"
                type="date"
                defaultValue={filters.expectedTo}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Min
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                min="0"
                name="minAmount"
                step="0.01"
                type="number"
                defaultValue={filters.minAmount}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Max
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                min="0"
                name="maxAmount"
                step="0.01"
                type="number"
                defaultValue={filters.maxAmount}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Approver
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                name="approver"
                defaultValue={filters.approver}
                placeholder="Role or user"
              />
            </label>
            <div className="flex items-end gap-2 lg:col-span-4">
              <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Apply
              </button>
              <ButtonLink
                href="/purchase-orders"
                className="min-h-10 bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Clear
              </ButtonLink>
            </div>
          </form>
          {orders.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">No purchase orders found</p>
              <p className="mt-1 text-sm text-slate-600">
                Adjust the filters or create one from an approved supplier recommendation after quote approval.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {orders.map((order) => (
                <div key={order.id} data-testid="purchase-order-row" className="ogfi-list-row grid gap-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {order.publicReference}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-950">
                        {order.supplierName}
                      </h3>
                      <p className="text-sm text-slate-600">
                        PR {order.purchaseRequestReference} / Quote{" "}
                        {order.selectedQuoteReference}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <Badge tone={purchaseOrderStatusTone(order.status)}>
                        {order.status.replaceAll("_", " ")}
                      </Badge>
                      <p className="mt-2 text-lg font-bold text-slate-950">
                        {order.currencyCode} {order.totalAmount.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Expected {order.expectedDeliveryDate}
                      </p>
                      {order.deliveryAgingStatus !== "NOT_APPLICABLE" ? (
                        <p
                          className={`mt-1 text-xs font-semibold ${
                            order.deliveryAgingStatus === "OVERDUE"
                              ? "text-red-700"
                              : order.deliveryAgingStatus === "DUE_TODAY"
                                ? "text-amber-700"
                                : "text-slate-500"
                          }`}
                        >
                          {order.deliveryAgingStatus === "OVERDUE"
                            ? `Overdue by ${order.daysOverdue} day${
                                order.daysOverdue === 1 ? "" : "s"
                              }`
                            : order.deliveryAgingStatus === "DUE_TODAY"
                              ? "Delivery due today"
                              : order.deliveryAgingStatus === "UPCOMING"
                                ? "Delivery upcoming"
                                : "Delivery aging unavailable"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    {order.lines.map((line) => (
                      <div
                        key={line.id}
                        className="grid gap-2 text-sm md:grid-cols-[3rem_1fr_8rem_8rem]"
                      >
                        <p className="font-semibold text-slate-500">#{line.lineNumber}</p>
                        <p className="font-medium text-slate-900">{line.description}</p>
                        <p className="text-slate-600">
                          {line.orderedQty} {line.uomCode}
                        </p>
                        <p className="font-semibold text-slate-800">
                          {order.currencyCode} {line.lineTotal.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Created by {order.createdByName}</span>
                    <span>/</span>
                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                    <span>/</span>
                    <span>
                      Approver {order.currentApproverName ?? "not pending"}
                    </span>
                    <span>/</span>
                    <span>
                      Last sent{" "}
                      {order.lastIssuedAt
                        ? `${new Date(order.lastIssuedAt).toLocaleDateString()} via ${order.lastIssueMethod ?? "recorded method"}${
                            order.lastIssueActorName
                              ? ` by ${order.lastIssueActorName}`
                              : ""
                          }`
                        : "not sent"}
                    </span>
                    <span>/</span>
                    <span>Receiving from issued POs is active by location scope</span>
                  </div>
                  <div>
                    <ButtonLink
                      href={`/purchase-orders/${order.id}`}
                      className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                    >
                      View Details
                    </ButtonLink>
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
