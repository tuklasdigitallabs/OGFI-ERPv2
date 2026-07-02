import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportInventoryBalances } from "@/server/services/exportAuthorization";
import {
  getInventoryBalanceReconciliation,
  listInventoryBalances,
  maxInventorySearchLength,
  type InventoryBalanceFilters
} from "@/server/services/inventory";

export const dynamic = "force-dynamic";

type InventoryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
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
  const rawQuery = getSearchParam(params, "q");
  const normalizedQuery = rawQuery?.trim() || undefined;
  const searchError =
    normalizedQuery && normalizedQuery.length > maxInventorySearchLength
      ? `Search is limited to ${maxInventorySearchLength} characters.`
      : null;
  const filters: InventoryBalanceFilters = {
    query: searchError ? undefined : normalizedQuery
  };
  const exportParams = new URLSearchParams();
  if (filters.query) {
    exportParams.set("q", filters.query);
  }
  const exportHref = `/inventory/export${exportParams.size ? `?${exportParams}` : ""}`;
  const balances = searchError
    ? []
    : await listInventoryBalances(session, filters);
  const reconciliation = canViewLedger
    ? await getInventoryBalanceReconciliation(session)
    : null;
  const totalLots = balances.length;
  const positiveBalances = balances.filter((balance) => balance.qtyOnHand > 0).length;
  const expiringLots = balances.filter((balance) => {
    if (!balance.expiryDate) {
      return false;
    }
    const expiry = new Date(balance.expiryDate).getTime();
    const today = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return expiry >= today && expiry <= today + thirtyDays;
  }).length;

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
              className="min-h-10 w-full bg-slate-100 text-slate-700 hover:bg-slate-200 sm:w-auto"
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

        {balances.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No stock balances found</p>
            <p className="mt-1 text-sm text-slate-600">
              Posted receiving, transfer receipt, wastage posting, and stock adjustment posting will populate this inquiry.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="hidden border-b border-slate-100 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 md:grid md:grid-cols-[1fr_9rem_8rem_8rem_8rem_9rem_8rem] md:gap-3">
              <span>Item</span>
              <span>On hand</span>
              <span>Lot</span>
              <span>Expiry</span>
              <span>Storage</span>
              <span>Updated</span>
              <span>Trace</span>
            </div>
            <div className="divide-y divide-slate-100">
              {balances.map((balance) => (
                <div
                  key={balance.id}
                  className="ogfi-list-row grid gap-3 text-sm md:grid-cols-[1fr_9rem_8rem_8rem_8rem_9rem_8rem]"
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
                      className="min-h-8 bg-slate-100 px-3 text-xs text-blue-700 hover:bg-blue-50"
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
      </section>
    </AppShell>
  );
}
