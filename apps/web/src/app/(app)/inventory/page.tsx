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
  inventoryBalanceDashboardProfileHref,
  listInventoryBalancePage,
  maxInventorySearchLength,
  resolveInventoryBalanceDashboardRequest,
  type InventoryBalanceDashboardProfile,
  type InventoryBalanceFilters
} from "@/server/services/inventory";
import {
  formatInventoryUpdatedDate,
  resolveInventoryTimeZone
} from "./inventoryPresentation";

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

function inventoryLedgerHref(itemCode: string, returnHref?: string) {
  const params = new URLSearchParams({ q: itemCode });
  if (returnHref) params.set("returnTo", returnHref);
  return `/inventory/ledger?${params.toString()}`;
}

function getStrictProfilePage(value: string | string[] | undefined) {
  if (value === undefined) return 1;
  if (Array.isArray(value) || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : null;
}

const profileQueryKeys = new Set(["dashboard", "q", "page"]);

function dashboardProfileCopy(profile: InventoryBalanceDashboardProfile) {
  switch (profile) {
    case "positive-stock-v1":
      return {
        title: "Positive Stock",
        rowLabel: "Positive stock rows",
        banner:
          "This read-only view contains current balance rows above zero for the selected location.",
        population: "Only current positive balance rows are included",
        emptyTitle: "No positive stock balances found",
        emptySearchTitle: "No positive stock rows match this search",
        emptyDescription:
          "Positive balances will appear here after posted receiving or transfer receipt movements.",
        emptySearchDescription:
          "Clear or change the search to review the current positive-stock population."
      };
    case "zero-stock-v1":
      return {
        title: "Zero Stock Rows",
        rowLabel: "Zero stock rows",
        banner:
          "This read-only view contains existing balance rows with on-hand quantity exactly zero for the selected location.",
        population:
          "Only existing balance rows at exactly zero are included; negative balances and catalog items without a balance row are excluded",
        emptyTitle: "No zero stock rows at this location",
        emptySearchTitle: "No zero stock rows match this search",
        emptyDescription:
          "Every existing balance row currently has a non-zero on-hand quantity. This does not confirm that every catalog item is stocked.",
        emptySearchDescription:
          "Clear or change the search to review the current zero-stock population."
      };
    case "lot-expiry-data-v1":
      return {
        title: "Rows with Lot or Expiry Data",
        rowLabel: "Rows with lot or expiry data",
        banner:
          "This read-only view contains current balance rows with a non-blank lot number or an expiry date for the selected location. Positive, zero, and negative quantities are included.",
        population:
          "Only rows with a non-blank lot number or an expiry date are included; this does not measure tracking-policy compliance or complete traceability",
        emptyTitle: "No balance rows have lot or expiry data",
        emptySearchTitle: "No rows with lot or expiry data match this search",
        emptyDescription:
          "No current balance row in this location has either field recorded. This does not indicate whether tracking is required.",
        emptySearchDescription:
          "Clear or change the search to review the current lot-or-expiry-data population."
      };
  }
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
  const hasDashboardProfile = params.dashboard !== undefined;
  const profileRequest = hasDashboardProfile
    ? resolveInventoryBalanceDashboardRequest(params.dashboard, params.q)
    : { profile: null, query: undefined, error: null };
  const profilePage = hasDashboardProfile ? getStrictProfilePage(params.page) : null;
  const hasProfileOverride = hasDashboardProfile && Object.keys(params).some(
    (key) => !profileQueryKeys.has(key)
  );
  if (
    hasDashboardProfile &&
    (!profileRequest.profile || profileRequest.error || profilePage === null || hasProfileOverride)
  ) {
    return (
      <AppShell
        session={session}
        title="Stock balance profile unavailable"
        subtitle="The requested dashboard destination is invalid or no longer supported"
        activeNav="inventory"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="Stock balance profile cannot be opened safely"
            description="Return to the dashboard and open the current stock-balance link. No ordinary or broader stock-balance list was substituted."
          />
          <div className="mt-4 flex justify-center">
            <ButtonLink href="/dashboard" className="min-h-11">
              Back to Operations Dashboard
            </ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }
  const dashboardProfile = profileRequest.profile;
  const profileCopy = dashboardProfile ? dashboardProfileCopy(dashboardProfile) : null;
  const activeTab = dashboardProfile === "positive-stock-v1" ? "positive" : dashboardProfile ? "all" : getInventoryTab(params);
  const page = dashboardProfile ? profilePage! : getPage(params);
  const rawQuery = dashboardProfile ? profileRequest.query : getSearchParam(params, "q");
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
  if (dashboardProfile) {
    exportParams.set("dashboard", dashboardProfile);
  }
  if (filters.query) {
    exportParams.set("q", filters.query);
  }
  const exportHref = `/inventory/export${exportParams.size ? `?${exportParams}` : ""}`;
  const balancePage = searchError
    ? { items: [], totalItems: 0, positiveItems: 0, expiringItems: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1, timeZone: "Asia/Manila" }
    : await listInventoryBalancePage(session, filters, {
        page,
        pageSize: PAGE_SIZE,
        ...(dashboardProfile ? { dashboardProfile } : {})
      });
  const inventoryTimeZone = resolveInventoryTimeZone(balancePage.timeZone);
  const balances = balancePage.items;
  const reconciliation = canViewLedger && !dashboardProfile
    ? await getInventoryBalanceReconciliation(session)
    : null;
  const totalLots = balancePage.totalItems;
  const positiveBalances = balancePage.positiveItems;
  const expiringLots = balancePage.expiringItems;
  const visibleBalances = balances;
  const safePage = balancePage.page;
  const pagedBalances = visibleBalances;
  const emptyCopy = profileCopy
    ? {
        title: normalizedQuery ? profileCopy.emptySearchTitle : profileCopy.emptyTitle,
        description: normalizedQuery
          ? profileCopy.emptySearchDescription
          : profileCopy.emptyDescription
      }
    : activeTab === "positive"
      ? {
          title: normalizedQuery
            ? "No positive stock rows match this search"
            : "No positive stock balances found",
          description: normalizedQuery
            ? "Clear or change the search to review the current positive-stock population."
            : "Positive balances will appear here after posted receiving or transfer receipt movements."
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
      {dashboardProfile ? (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          <strong>{profileCopy!.title} dashboard profile.</strong> {profileCopy!.banner} Search may only narrow that fixed population. It is a live inquiry, not a historical snapshot of the dashboard value or an automatic replenishment queue.
          <p className="mt-2">
            CSV export uses this profile and search. If the configured synchronous row limit is exceeded, narrow Search and try again; no partial file is downloaded.
          </p>
        </div>
      ) : null}
      <div className={`mb-5 grid gap-4 ${dashboardProfile ? "md:grid-cols-2" : "md:grid-cols-3 xl:grid-cols-4"}`}>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">
            {profileCopy ? profileCopy.rowLabel : "Balance rows"}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{totalLots}</p>
          <p className="mt-1 text-xs text-slate-500">
            {dashboardProfile ? "Matching the fixed profile and current search" : "Matching the current search and tab"}
          </p>
        </Panel>
        {!dashboardProfile ? <Panel>
          <p className="text-sm font-semibold text-slate-500">Positive stock</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {positiveBalances}
          </p>
        </Panel> : null}
        {!dashboardProfile ? <Panel>
          <p className="text-sm font-semibold text-slate-500">Expiring in 30 days</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{expiringLots}</p>
        </Panel> : null}
        {dashboardProfile ? (
          <Panel>
            <p className="text-sm font-semibold text-slate-500">Selected location</p>
            <p className="mt-2 text-lg font-bold text-slate-950">{session.context.locationName}</p>
            <p className="mt-1 text-xs text-slate-500">Current authorized scope</p>
          </Panel>
        ) : null}
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
            <h2 className="text-lg font-bold text-slate-950">
              {profileCopy ? profileCopy.title : "Current Location Stock"}
            </h2>
            <p className="text-sm text-slate-500">
              Balances are derived from posted inventory movements
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge tone="info">{session.context.locationName}</Badge>
            {canExportInventory ? (
              <ButtonLink
                href={exportHref}
                className="min-h-11 bg-slate-100 text-blue-700 hover:bg-blue-50"
              >
                Export CSV
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <form className="ogfi-filter-bar grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          {dashboardProfile ? (
            <input type="hidden" name="dashboard" value={dashboardProfile} />
          ) : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Search
            <input
              className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
              defaultValue={rawQuery}
              name="q"
              placeholder="Item, code, lot, storage location"
            />
          </label>
          <div className="flex items-end">
            <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
              Apply
            </button>
          </div>
          <div className="flex items-end">
            <ButtonLink
              href={dashboardProfile ? inventoryBalanceDashboardProfileHref(dashboardProfile) : "/inventory"}
              tone="secondary"
              className="min-h-11 w-full border border-slate-300 bg-white px-4 font-bold !text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
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
        {dashboardProfile ? (
          <div className="flex flex-col gap-3 border-b border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between">
            <p>{profileCopy!.population}; ordinary tabs and filters cannot redefine this dashboard profile.</p>
            <ButtonLink href="/inventory" tone="secondary" className="min-h-11 shrink-0">
              Open all stock balances
            </ButtonLink>
          </div>
        ) : <div className="border-b border-slate-100 p-4">
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
        </div>}

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
                  <p className={`font-semibold ${balance.qtyOnHand < 0 ? "text-rose-700" : "text-slate-900"}`}>
                    <span className="font-medium text-slate-500 md:hidden">On hand: </span>
                    {balance.qtyOnHand} {balance.baseUomCode}
                  </p>
                  <p className="text-slate-600">
                    <span className="font-medium text-slate-500 md:hidden">Lot: </span>
                    {dashboardProfile === "lot-expiry-data-v1"
                      ? balance.lotNumber?.trim() || "Not recorded"
                      : balance.lotNumber ?? "Untracked"}
                  </p>
                  <p className="text-slate-600">
                    <span className="font-medium text-slate-500 md:hidden">Expiry: </span>
                    {balance.expiryDate ?? (dashboardProfile === "lot-expiry-data-v1" ? "Not recorded" : "None")}
                  </p>
                  <p className="text-slate-600">
                    <span className="font-medium text-slate-500 md:hidden">Storage: </span>
                    {balance.inventoryLocationName}
                  </p>
                  <p className="text-xs text-slate-500">
                    <span className="font-medium md:hidden">Updated: </span>
                    {formatInventoryUpdatedDate(balance.updatedAt, inventoryTimeZone)} / v{balance.version}
                    <span className="block">{inventoryTimeZone}</span>
                  </p>
                  {canViewLedger ? (
                    <ButtonLink
                      href={inventoryLedgerHref(
                        balance.itemCode,
                        dashboardProfile
                          ? inventoryBalanceDashboardProfileHref(dashboardProfile, {
                              page: safePage,
                              query: filters.query
                            })
                          : undefined
                      )}
                      tone="secondary"
                      size="sm"
                      className="min-h-11 w-full whitespace-nowrap border border-blue-200 bg-blue-50 px-3 text-xs font-bold !text-blue-800 shadow-sm hover:border-blue-300 hover:bg-blue-100"
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
            controlClassName="min-h-11"
            getPageHref={(nextPage) =>
              dashboardProfile
                ? inventoryBalanceDashboardProfileHref(dashboardProfile, {
                    page: nextPage,
                    query: filters.query
                  })
                : inventoryHref(activeTab, filters.query, nextPage)
            }
          />
        ) : null}
      </section>
    </AppShell>
  );
}
