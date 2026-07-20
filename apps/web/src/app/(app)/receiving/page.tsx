import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState, PaginationBar, WorkspaceTabs } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { GoodsReceiptLinesEditor } from "@/components/GoodsReceiptLinesEditor";
import { TaskSheet } from "@/components/TaskSheet";
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

type ReceivingTab = "all" | "draft" | "posted" | "discrepancies";

const PAGE_SIZE = 10;

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getReceivingTab(
  searchParams: Record<string, string | string[] | undefined>
): ReceivingTab {
  const tab = getStringParam(searchParams, "tab");
  if (tab === "draft" || tab === "posted" || tab === "discrepancies") {
    return tab;
  }
  return "all";
}

function getPage(searchParams: Record<string, string | string[] | undefined>) {
  const page = Number.parseInt(getStringParam(searchParams, "page") ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function receivingHref(tab: ReceivingTab, page = 1) {
  const params = new URLSearchParams();
  if (tab !== "all") {
    params.set("tab", tab);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/receiving?${query}` : "/receiving";
}

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
  const activeTab = getReceivingTab(params);
  const page = getPage(params);
  const draftReceipts = receipts.filter((receipt) => receipt.status === "DRAFT");
  const postedReceipts = receipts.filter((receipt) => receipt.status !== "DRAFT");
  const discrepantReceipts = receipts.filter((receipt) => receipt.discrepancyFlag);
  const visibleReceipts =
    activeTab === "draft"
      ? draftReceipts
      : activeTab === "posted"
        ? postedReceipts
        : activeTab === "discrepancies"
          ? discrepantReceipts
          : receipts;
  const pageCount = Math.max(1, Math.ceil(visibleReceipts.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedReceipts = visibleReceipts.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );
  const emptyCopy =
    activeTab === "draft"
      ? {
          title: "No draft receipts",
          description: "Draft receiving reports waiting for posting will appear here."
        }
      : activeTab === "posted"
        ? {
            title: "No posted receipts",
            description: "Posted receiving reports will appear here after inventory posting."
          }
        : activeTab === "discrepancies"
          ? {
              title: "No receiving discrepancies",
              description:
                "Receipts with rejected, damaged, short, or other discrepancy lines will appear here."
            }
          : {
              title: "No receiving reports yet",
              description: "Create a draft receiving report from an issued Purchase Order."
            };

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
            <TaskSheet title="Create Draft Receipt" description="Receive one issued purchase order with controlled accepted and discrepancy quantities." trigger={<span>Create Draft Receipt</span>} triggerClassName="bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" size="workspace" bodyScroll="contained" bodyClassName="p-0">
              {receivableOrders.length === 0 ? <div className="m-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No issued Purchase Orders are ready for receiving in this location.</div> : <GoodsReceiptLinesEditor action={createReceiptAction} orders={receivableOrders} />}
            </TaskSheet>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Receiving Reports</h2>
              <p className="text-sm text-slate-500">
                {receipts.length} total, {draftReceipts.length} draft,{" "}
                {discrepantReceipts.length} with discrepancies
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
          <div className="border-b border-slate-100 p-4">
            <WorkspaceTabs
              items={[
                {
                  label: "All receipts",
                  href: receivingHref("all"),
                  active: activeTab === "all",
                  count: receipts.length
                },
                {
                  label: "Draft",
                  href: receivingHref("draft"),
                  active: activeTab === "draft",
                  count: draftReceipts.length
                },
                {
                  label: "Posted",
                  href: receivingHref("posted"),
                  active: activeTab === "posted",
                  count: postedReceipts.length
                },
                {
                  label: "Discrepancies",
                  href: receivingHref("discrepancies"),
                  active: activeTab === "discrepancies",
                  count: discrepantReceipts.length
                }
              ]}
            />
          </div>
          {visibleReceipts.length === 0 ? (
            <div className="p-5">
              <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pagedReceipts.map((receipt) => (
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
          {visibleReceipts.length > 0 ? (
            <PaginationBar
              page={safePage}
              pageSize={PAGE_SIZE}
              totalItems={visibleReceipts.length}
              itemLabel="receipts"
              getPageHref={(nextPage) => receivingHref(activeTab, nextPage)}
            />
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
