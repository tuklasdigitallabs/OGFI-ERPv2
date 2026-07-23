import { redirect } from "next/navigation";
import {
  Badge,
  ButtonLink,
  EmptyState,
  PaginationBar,
  Panel,
  WorkspaceTabs
} from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportInventoryBalances } from "@/server/services/exportAuthorization";
import {
  getInventoryBalanceReconciliation,
  listInventoryBalancePage,
  maxInventorySearchLength,
  type InventoryBalanceFilters
} from "@/server/services/inventory";

export const dynamic = "force-dynamic";

type InventoryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InventoryTab = "all" | "positive" | "expiring";

const PAGE_SIZE = 10;

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getInventoryTab(
  searchParams: Record<string, string | string[] | undefined>
): InventoryTab {
  const tab = getSearchParam(searchParams, "tab");
  if (tab === "positive" || tab === "expiring") {
    return tab;
  }
  return "all";
}

function getPage(searchParams: Record<string, string | string[] | undefined>) {
  const page = Number.parseInt(getSearchParam(searchParams, "page") ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function inventoryHref(tab: InventoryTab, query: string | undefined, page = 1) {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (tab !== "all") {
    params.set("tab", tab);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const nextQuery = params.toString();
  return nextQuery ? `/inventory?${nextQuery}` : "/inventory";
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.inventoryBalanceView)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const canViewLedger = session.permissionCodes.includes(permissions.inventoryLedgerView);
  const canExportInventory = canExportInventoryBalances(session);

  const params = searchParams ? await searchParams : {};
  const activeTab = getInventoryTab(params);
  const page = getPage(params);
  const rawQuery = getSearchParam(params, "q");
  const normalizedQuery = rawQuery?.trim() || undefined;
  const searchError =
    normalizedQuery && normalizedQuery.length > maxInventorySearchLength
      ? `Search is limited to ${maxInventorySearchLength} characters.`
      : null;
  const filters: InventoryBalanceFilters = {
    query: searchError ? undefined : normalizedQuery,
    tab: activeTab
  };
  const exportParams = new URLSearchParams();
  if (filters.query) {
    exportParams.set("q", filters.query);
  }
  const exportHref = `/inventory/export${exportParams.size ? `?${exportParams}` : ""}`;
  const balancePage = searchError
    ? { items: [], totalItems: 0, positiveItems: 0, expiringItems: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 }
    : await listInventoryBalancePage(session, filters, { page, pageSize: PAGE_SIZE });
  const balances = balancePage.items;
  const reconciliation = canViewLedger
    ? await getInventoryBalanceReconciliation(session)
    : null;
  const totalLots = balances.length;
  const positiveBalances = balancePage.positiveItems;
  const expiringLots = balancePage.expiringItems;
  const visibleBalances = balances;
  const safePage = balancePage.page;
  const pagedBalances = visibleBalances;
  const emptyCopy =
    activeTab === "positive"
      ? {
          title: "No positive stock balances found",
          description:
            "Positive balances will appear here after posted receiving or transfer receipt movements."
        }
      : activeTab === "expiring"
        ? {
            title: "No lots expiring in 30 days",
            description:
              "Tracked lots with expiry dates inside the next 30 days will appear here."
          }
        : {
            title: "No stock balances found",
            description:
              "Posted receiving, transfer receipt, wastage posting, and stock adjustment posting will populate this inquiry."
          };

  return (
    <AppShell
      session={session}
      title="Stock Balances"
      subtitle="Posted inventory balance inquiry for the current location"
      activeNav="inventory"
    >
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Derived balance</span>
          <span>Posted movements only</span>
          <span>Ledger trace</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>Balances are inquiries, not direct edits.</strong> Stock changes
          must come from receiving, transfer, wastage, adjustment, count variance,
          or reversal movements posted to the immutable ledger.
        </p>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Balance rows</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{totalLots}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Positive stock</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {positiveBalances}
          </p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Expiring in 30 days</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{expiringLots}</p>
        </Panel>
        {reconciliation ? (
          <Panel>
            <p className="text-sm font-semibold text-slate-500">Ledger check</p>
            <p
              className={`mt-2 text-3xl font-bold ${
                reconciliation.varianceRows > 0 ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              {reconciliation.varianceRows}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              variance row{reconciliation.varianceRows === 1 ? "" : "s"} /
              {reconciliation.totalRows} checked
            </p>
          </Panel>
        ) : null}
      </div>

      <section className="ogfi-data-surface">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Current Location Stock</h2>
            <p className="text-sm text-slate-500">
              Balances are derived from posted inventory movements
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge tone="info">{session.context.locationName}</Badge>
            {canExportInventory ? (
              <ButtonLink
                href={exportHref}
                className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
              >
                Export CSV
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <form className="ogfi-filter-bar grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Search
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              defaultValue={rawQuery}
              name="q"
              placeholder="Item, code, lot, storage location"
            />
          </label>
          <div className="flex items-end">
            <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
              Apply
            </button>
          </div>
          <div className="flex items-end">
            <ButtonLink
              href="/inventory"
              tone="secondary"
              className="min-h-10 w-full border border-slate-300 bg-white px-4 font-bold !text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
            >
              Clear
            </ButtonLink>
          </div>
        </form>
        {searchError ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {searchError}
          </div>
        ) : null}
        <div className="border-b border-slate-100 p-4">
          <WorkspaceTabs
            items={[
              {
                label: "All balances",
                href: inventoryHref("all", filters.query),
                active: activeTab === "all",
                ...(activeTab === "all" ? { count: balancePage.totalItems } : {})
              },
              {
                label: "Positive stock",
                href: inventoryHref("positive", filters.query),
                active: activeTab === "positive",
                count: positiveBalances
              },
              {
                label: "Expiring soon",
                href: inventoryHref("expiring", filters.query),
                active: activeTab === "expiring",
                count: expiringLots
              }
            ]}
          />
        </div>

        {visibleBalances.length === 0 ? (
          <div className="p-5">
            <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="hidden border-b border-slate-100 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 md:grid md:grid-cols-[1fr_9rem_8rem_8rem_9rem_9rem_9.5rem] md:gap-3">
              <span>Item</span>
              <span>On hand</span>
              <span>Lot</span>
              <span>Expiry</span>
              <span>Storage</span>
              <span>Updated</span>
              <span>Trace</span>
            </div>
            <div className="divide-y divide-slate-100">
              {pagedBalances.map((balance) => (
                <div
                  key={balance.id}
                  className="ogfi-list-row grid gap-3 text-sm md:grid-cols-[1fr_9rem_8rem_8rem_9rem_9rem_9.5rem]"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{balance.itemName}</p>
                    <p className="text-xs text-slate-500">
                      {balance.itemCode} / {balance.categoryName}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">
                    {balance.qtyOnHand} {balance.baseUomCode}
                  </p>
                  <p className="text-slate-600">{balance.lotNumber ?? "Untracked"}</p>
                  <p className="text-slate-600">{balance.expiryDate ?? "None"}</p>
                  <p className="text-slate-600">{balance.inventoryLocationName}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(balance.updatedAt).toLocaleDateString()} / v
                    {balance.version}
                  </p>
                  {canViewLedger ? (
                    <ButtonLink
                      href={`/inventory/ledger?q=${encodeURIComponent(balance.itemCode)}`}
                      tone="secondary"
                      size="sm"
                      className="min-h-10 w-full whitespace-nowrap border border-blue-200 bg-blue-50 px-3 text-xs font-bold !text-blue-800 shadow-sm hover:border-blue-300 hover:bg-blue-100"
                    >
                      View Ledger
                    </ButtonLink>
                  ) : (
                    <span className="text-xs text-slate-400">No ledger access</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {visibleBalances.length > 0 ? (
          <PaginationBar
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={balancePage.totalItems}
            itemLabel="balance rows"
            getPageHref={(nextPage) =>
              inventoryHref(activeTab, filters.query, nextPage)
            }
          />
        ) : null}
      </section>
    </AppShell>
  );
}
