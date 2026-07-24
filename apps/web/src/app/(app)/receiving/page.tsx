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
  listGoodsReceiptPage,
  listReceivingRegisterFilterOptions,
  listReceivingDashboardProfilePage,
  listReceivablePurchaseOrders,
  postGoodsReceipt,
  receivingDashboardProfileHref,
  resolveReceivingDashboardProfile
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

function getQuery(searchParams: Record<string, string | string[] | undefined>) {
  return (getStringParam(searchParams, "q") ?? "").trim();
}

function receivingHref(tab: ReceivingTab, page = 1, query?: string, filters: { status?: string; receivedFrom?: string; receivedTo?: string; supplierId?: string; purchaseOrderId?: string; receivedByUserId?: string } = {}) {
  const params = new URLSearchParams();
  if (tab !== "all") {
    params.set("tab", tab);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  if (query) {
    params.set("q", query);
  }
  if (filters.status) params.set("status", filters.status);
  if (filters.receivedFrom) params.set("receivedFrom", filters.receivedFrom);
  if (filters.receivedTo) params.set("receivedTo", filters.receivedTo);
  if (filters.supplierId) params.set("supplierId", filters.supplierId);
  if (filters.purchaseOrderId) params.set("purchaseOrderId", filters.purchaseOrderId);
  if (filters.receivedByUserId) params.set("receivedByUserId", filters.receivedByUserId);
  const serialized = params.toString();
  return serialized ? `/receiving?${serialized}` : "/receiving";
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

  const params = searchParams ? await searchParams : {};
  const profileParam = getStringParam(params, "dashboard");
  const profile = resolveReceivingDashboardProfile(profileParam);
  if (profileParam && !profile) {
    return (
      <AppShell
        session={session}
        title="Receiving Follow-up unavailable"
        subtitle="The requested dashboard profile is unsupported or retired"
        activeNav="receiving"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="Receiving Follow-up is unavailable"
            description="This dashboard link cannot be opened safely. Return to Overview for the current follow-up card, or deliberately open the full Receiving workspace."
          />
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink href="/dashboard">Back to Overview</ButtonLink>
            <ButtonLink href="/receiving" tone="secondary">Open Receiving workspace</ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }
  const query = getQuery(params);
  const status = getStringParam(params, "status") ?? undefined;
  const receivedFrom = getStringParam(params, "receivedFrom") ?? undefined;
  const receivedTo = getStringParam(params, "receivedTo") ?? undefined;
  const supplierId = getStringParam(params, "supplierId") ?? undefined;
  const purchaseOrderId = getStringParam(params, "purchaseOrderId") ?? undefined;
  const receivedByUserId = getStringParam(params, "receivedByUserId") ?? undefined;
  if (profile && query.length > 120) {
    return (
      <AppShell
        session={session}
        title="Receiving Follow-up"
        subtitle={`${session.context.companyName} / ${session.context.locationName}`}
        activeNav="receiving"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="Search is too long"
            description="Use no more than 120 characters and search by GRN, Purchase Order, or supplier. The Receiving Follow-up population and selected scope were not changed."
          />
          <div className="mt-4 flex justify-center">
            <ButtonLink href={receivingDashboardProfileHref(profile)}>
              Clear search
            </ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }
  const profilePage = profile
    ? await listReceivingDashboardProfilePage(session, profile, {
        page: getPage(params),
        ...(query ? { query } : {})
      })
    : null;
  const activeTab = getReceivingTab(params);
  const page = getPage(params);
  const [registerPage, receivableOrders, filterOptions] = profile
    ? [null, [], null]
    : await Promise.all([
        listGoodsReceiptPage(session, { tab: activeTab, page, pageSize: PAGE_SIZE, ...(query ? { query } : {}), ...(status ? { status } : {}), ...(receivedFrom ? { receivedFrom } : {}), ...(receivedTo ? { receivedTo } : {}), ...(supplierId ? { supplierId } : {}), ...(purchaseOrderId ? { purchaseOrderId } : {}), ...(receivedByUserId ? { receivedByUserId } : {}) }),
        canCreateReceiving ? listReceivablePurchaseOrders(session) : Promise.resolve([]),
        listReceivingRegisterFilterOptions(session, { ...(query ? { query } : {}), ...(supplierId ? { supplierId } : {}), ...(purchaseOrderId ? { purchaseOrderId } : {}), ...(receivedByUserId ? { receivedByUserId } : {}) })
      ]);
  const receipts = registerPage?.items ?? [];
  const actionFeedback = getActionFeedback(params);
  const visibleReceipts = receipts;
  const safePage = registerPage?.page ?? 1;
  const pagedReceipts = visibleReceipts;
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
        {!profile && canCreateReceiving ? (
          <div className="flex justify-end">
            <TaskSheet title="Create Draft Receipt" description="Receive one issued purchase order with controlled accepted and discrepancy quantities." trigger={<span>Create Draft Receipt</span>} triggerClassName="bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" size="workspace" bodyScroll="contained" bodyClassName="p-0">
              {receivableOrders.length === 0 ? <div className="m-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No issued Purchase Orders are ready for receiving in this location.</div> : <GoodsReceiptLinesEditor action={createReceiptAction} orders={receivableOrders} />}
            </TaskSheet>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {profile ? "Receiving Follow-up" : "Receiving Reports"}
              </h2>
              <p className="text-sm text-slate-500">
                {profile
                  ? `${profilePage?.totalItems ?? 0} unposted, processing, or discrepancy records at ${session.context.locationName}`
                  : `${registerPage?.tabCounts.all ?? 0} total, ${registerPage?.tabCounts.draft ?? 0} draft, ${registerPage?.tabCounts.discrepancies ?? 0} with discrepancies`}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {profile ? (
                <ButtonLink href="/receiving">Exit follow-up view</ButtonLink>
              ) : (
                <Badge tone="info">GRN</Badge>
              )}
              {canExportReceiving ? (
                <ButtonLink
                  href={profile
                    ? `/receiving/export?dashboard=${profile}${profilePage?.query ? `&q=${encodeURIComponent(profilePage.query)}` : ""}`
                    : `/receiving/export?tab=${activeTab}${query ? `&q=${encodeURIComponent(query)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}${receivedFrom ? `&receivedFrom=${receivedFrom}` : ""}${receivedTo ? `&receivedTo=${receivedTo}` : ""}${supplierId ? `&supplierId=${encodeURIComponent(supplierId)}` : ""}${purchaseOrderId ? `&purchaseOrderId=${encodeURIComponent(purchaseOrderId)}` : ""}${receivedByUserId ? `&receivedByUserId=${encodeURIComponent(receivedByUserId)}` : ""}`}
                  className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
            </div>
          </div>
          {profile ? (
            <div className="border-b border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">Dashboard profile</Badge>
                <Badge tone="neutral">{session.context.companyName}</Badge>
                <Badge tone="neutral">{session.context.locationName}</Badge>
              </div>
              <p className="mt-3">
                This read-only view shows unposted drafts, posting receipts, and active discrepancy records in the selected receiving location. It does not resolve discrepancies or grant posting, reversal, Purchase Order, or inventory authority. Open Receiving Report detail for current facts and independently authorized actions.
              </p>
            </div>
          ) : null}
          {profile ? (
            <form className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end" method="get">
              <input name="dashboard" type="hidden" value={profile} />
              <label className="flex-1 text-sm font-semibold text-slate-700">
                Search follow-up records
                <input
                  className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3 font-normal"
                  defaultValue={profilePage?.query ?? ""}
                  maxLength={120}
                  name="q"
                  placeholder="GRN, PO, or supplier"
                />
              </label>
              <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="submit">
                Search
              </button>
              {profilePage?.query ? (
                <ButtonLink href={receivingDashboardProfileHref(profile)}>Clear search</ButtonLink>
              ) : null}
            </form>
          ) : (
          <>
            <form className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-4" method="get">
              <input type="hidden" name="tab" value={activeTab} />
              <input
                className="min-h-10 min-w-56 flex-1 rounded-md border border-slate-300 px-3 text-sm"
                name="q"
                defaultValue={query}
                maxLength={120}
                placeholder="Search GRN, Purchase Order, or supplier"
              />
              <select name="status" defaultValue={status ?? ""} className="min-h-10 rounded-md border border-slate-300 px-2 text-sm">
                <option value="">Any status</option>
                {['DRAFT','POSTING','POSTED','POSTED_WITH_DISCREPANCY','REVERSING','REVERSED'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <input name="receivedFrom" type="date" defaultValue={receivedFrom} className="min-h-10 rounded-md border border-slate-300 px-2 text-sm" />
              <input name="receivedTo" type="date" defaultValue={receivedTo} className="min-h-10 rounded-md border border-slate-300 px-2 text-sm" />
              <label className="flex min-w-44 flex-col gap-1 text-xs font-semibold text-slate-600">
                Supplier
                <select name="supplierId" defaultValue={supplierId ?? ""} className="min-h-10 rounded-md border border-slate-300 px-2 text-sm font-normal">
                  <option value="">All suppliers</option>
                  {filterOptions?.suppliers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label className="flex min-w-40 flex-col gap-1 text-xs font-semibold text-slate-600">
                Purchase Order
                <select name="purchaseOrderId" defaultValue={purchaseOrderId ?? ""} className="min-h-10 rounded-md border border-slate-300 px-2 text-sm font-normal">
                  <option value="">All Purchase Orders</option>
                  {filterOptions?.purchaseOrders.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label className="flex min-w-44 flex-col gap-1 text-xs font-semibold text-slate-600">
                Receiver
                <select name="receivedByUserId" defaultValue={receivedByUserId ?? ""} className="min-h-10 rounded-md border border-slate-300 px-2 text-sm font-normal">
                  <option value="">All receivers</option>
                  {filterOptions?.receivers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">Search</button>
              {query || status || receivedFrom || receivedTo || supplierId || purchaseOrderId || receivedByUserId ? <ButtonLink href={receivingHref(activeTab)} tone="secondary">Clear filters</ButtonLink> : null}
            </form>
            <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              Supplier, Purchase Order, and Receiver filters are available from the selected location’s recent receipt population{filterOptions?.hasMore ? " (the option list is capped; use the search field to narrow the receipt population)" : ""}. Item and accepted-value filters remain under query-plan and policy review and are not presented as active controls.
            </p>
          <div className="border-b border-slate-100 p-4">
            <WorkspaceTabs
              items={[
                {
                  label: "All receipts",
                  href: receivingHref("all", 1, query, { ...(status ? { status } : {}), ...(receivedFrom ? { receivedFrom } : {}), ...(receivedTo ? { receivedTo } : {}), ...(supplierId ? { supplierId } : {}), ...(purchaseOrderId ? { purchaseOrderId } : {}), ...(receivedByUserId ? { receivedByUserId } : {}) }),
                  active: activeTab === "all",
                  count: registerPage?.tabCounts.all ?? 0
                },
                {
                  label: "Draft",
                  href: receivingHref("draft", 1, query, { ...(status ? { status } : {}), ...(receivedFrom ? { receivedFrom } : {}), ...(receivedTo ? { receivedTo } : {}), ...(supplierId ? { supplierId } : {}), ...(purchaseOrderId ? { purchaseOrderId } : {}), ...(receivedByUserId ? { receivedByUserId } : {}) }),
                  active: activeTab === "draft",
                  count: registerPage?.tabCounts.draft ?? 0
                },
                {
                  label: "Posted",
                  href: receivingHref("posted", 1, query, { ...(status ? { status } : {}), ...(receivedFrom ? { receivedFrom } : {}), ...(receivedTo ? { receivedTo } : {}), ...(supplierId ? { supplierId } : {}), ...(purchaseOrderId ? { purchaseOrderId } : {}), ...(receivedByUserId ? { receivedByUserId } : {}) }),
                  active: activeTab === "posted",
                  count: registerPage?.tabCounts.posted ?? 0
                },
                {
                  label: "Discrepancies",
                  href: receivingHref("discrepancies", 1, query, { ...(status ? { status } : {}), ...(receivedFrom ? { receivedFrom } : {}), ...(receivedTo ? { receivedTo } : {}), ...(supplierId ? { supplierId } : {}), ...(purchaseOrderId ? { purchaseOrderId } : {}), ...(receivedByUserId ? { receivedByUserId } : {}) }),
                  active: activeTab === "discrepancies",
                  count: registerPage?.tabCounts.discrepancies ?? 0
                }
              ]}
            />
          </div>
          </>
          )}
          {profile ? (
            profilePage && profilePage.items.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {profilePage.items.map((receipt) => (
                  <div key={receipt.id} className="ogfi-list-row grid gap-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-400">{receipt.publicReference}</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-950">{receipt.supplierName}</h3>
                        <p className="text-sm text-slate-600">PO {receipt.purchaseOrderReference}</p>
                        <p className="mt-1 text-xs text-slate-500">Received {new Date(receipt.receivedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Badge tone="neutral">{receipt.status}</Badge>
                        <Badge tone={receipt.inclusionReason === "Discrepancy recorded" ? "warning" : "info"}>
                          {receipt.inclusionReason}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <ButtonLink
                        href={`/receiving/${receipt.id}?from=${profile}&page=${profilePage.page}${profilePage.query ? `&q=${encodeURIComponent(profilePage.query)}` : ""}`}
                        className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                      >
                        View Receiving Report
                      </ButtonLink>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <EmptyState
                  title={profilePage?.query ? "No matching follow-up records" : "No receiving follow-up"}
                  description={profilePage?.query
                    ? "No unposted, processing, or discrepancy records match this search in the selected receiving location."
                    : "No unposted drafts, posting receipts, or active discrepancy records are in the selected receiving location."}
                />
              </div>
            )
          ) : visibleReceipts.length === 0 ? (
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
          {profile && profilePage && profilePage.totalItems > 0 ? (
            <PaginationBar
              page={profilePage.page}
              pageSize={profilePage.pageSize}
              totalItems={profilePage.totalItems}
              itemLabel="follow-up records"
              getPageHref={(nextPage) => receivingDashboardProfileHref(profile, {
                page: nextPage,
                ...(profilePage.query ? { query: profilePage.query } : {})
              })}
            />
          ) : !profile && visibleReceipts.length > 0 ? (
            <PaginationBar
              page={safePage}
              pageSize={registerPage?.pageSize ?? PAGE_SIZE}
              totalItems={registerPage?.totalItems ?? 0}
              itemLabel="receipts"
              getPageHref={(nextPage) => receivingHref(activeTab, nextPage, query, { ...(status ? { status } : {}), ...(receivedFrom ? { receivedFrom } : {}), ...(receivedTo ? { receivedTo } : {}), ...(supplierId ? { supplierId } : {}), ...(purchaseOrderId ? { purchaseOrderId } : {}), ...(receivedByUserId ? { receivedByUserId } : {}) })}
            />
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
