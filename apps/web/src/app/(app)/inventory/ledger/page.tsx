import { redirect } from "next/navigation";
import { Badge, ButtonLink } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportInventoryLedger } from "@/server/services/exportAuthorization";
import {
  listInventoryMovements,
  maxInventorySearchLength,
  type InventoryMovementFilters
} from "@/server/services/inventory";

export const dynamic = "force-dynamic";

type InventoryLedgerPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function movementTone(quantityDeltaBaseUom: number) {
  if (quantityDeltaBaseUom > 0) {
    return "success" as const;
  }
  if (quantityDeltaBaseUom < 0) {
    return "warning" as const;
  }
  return "neutral" as const;
}

export default async function InventoryLedgerPage({
  searchParams
}: InventoryLedgerPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.inventoryLedgerView)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const canExportLedger = canExportInventoryLedger(session);

  const params = searchParams ? await searchParams : {};
  const rawQuery = getSearchParam(params, "q");
  const normalizedQuery = rawQuery?.trim() || undefined;
  const searchError =
    normalizedQuery && normalizedQuery.length > maxInventorySearchLength
      ? `Search is limited to ${maxInventorySearchLength} characters.`
      : null;
  const filters: InventoryMovementFilters = {
    query: searchError ? undefined : normalizedQuery,
    movementType: getSearchParam(params, "movementType")
  };
  const exportParams = new URLSearchParams();
  if (filters.query) {
    exportParams.set("q", filters.query);
  }
  if (filters.movementType) {
    exportParams.set("movementType", filters.movementType);
  }
  const exportHref = `/inventory/ledger/export${
    exportParams.size ? `?${exportParams}` : ""
  }`;
  const movements = searchError
    ? []
    : await listInventoryMovements(session, filters);

  return (
    <AppShell
      session={session}
      title="Inventory Ledger"
      subtitle="Immutable movement trail for the current location"
      activeNav="inventory-ledger"
    >
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Immutable movements</span>
          <span>Source document</span>
          <span>Actor and reason</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>The ledger is the source of inventory truth.</strong> Movement
          signs, source documents, lots, reasons, and posting actors are preserved
          for audit and reconciliation.
        </p>
      </div>
      <section className="ogfi-data-surface">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Recent Movements</h2>
            <p className="text-sm text-slate-500">
              Showing the latest 100 source-linked movements for this location
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge tone="info">{session.context.locationName}</Badge>
            {canExportLedger ? (
              <ButtonLink
                href={exportHref}
                className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
              >
                Export CSV
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <form className="ogfi-filter-bar grid gap-3 md:grid-cols-[1fr_14rem_auto_auto]">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Search
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              defaultValue={rawQuery}
              name="q"
              placeholder="Item, code, lot, source"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Movement type
            <select
              className="rounded-md border border-slate-300 px-3 py-2"
              defaultValue={filters.movementType}
              name="movementType"
            >
              <option value="">All</option>
              <option value="RECEIPT_IN">Receipt in</option>
              <option value="TRANSFER_OUT">Transfer out</option>
              <option value="TRANSFER_IN">Transfer in</option>
              <option value="WASTAGE_OUT">Wastage out</option>
              <option value="ADJUSTMENT_IN">Adjustment in</option>
              <option value="ADJUSTMENT_OUT">Adjustment out</option>
              <option value="OPENING_BALANCE_IN">Opening balance in</option>
              <option value="COUNT_VARIANCE_IN">Count variance in</option>
              <option value="COUNT_VARIANCE_OUT">Count variance out</option>
              <option value="REVERSAL">Reversal</option>
            </select>
          </label>
          <div className="flex items-end">
            <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 md:w-auto">
              Apply
            </button>
          </div>
          <div className="flex items-end">
            <ButtonLink
              href="/inventory/ledger"
              className="min-h-10 w-full bg-slate-100 text-slate-700 hover:bg-slate-200 md:w-auto"
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

        {movements.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No inventory movements found</p>
            <p className="mt-1 text-sm text-slate-600">
              Posted receiving, transfer dispatch and receipt, wastage posting, and
              approved future adjustment workflows will create ledger entries.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {movements.map((movement) => (
              <div
                key={movement.id}
                className="ogfi-list-row grid gap-3 text-sm lg:grid-cols-[10rem_1fr_10rem_10rem_9rem_12rem]"
              >
                <div>
                  <p className="font-semibold text-slate-950">
                    {new Date(movement.occurredAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(movement.occurredAt).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950">{movement.itemName}</p>
                    <Badge tone={movementTone(movement.quantityDeltaBaseUom)}>
                      {movement.movementType}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {movement.itemCode} / {movement.inventoryLocationName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Source {movement.sourceDocumentType} / {movement.sourceEventKey}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {movement.enteredQuantity} {movement.enteredUomCode}
                  </p>
                  <p className="text-xs text-slate-500">
                    Delta {movement.quantityDeltaBaseUom} {movement.baseUomCode}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    In / Out
                  </p>
                  <p className="text-slate-700">
                    {movement.inQuantityBaseUom} / {movement.outQuantityBaseUom}{" "}
                    {movement.baseUomCode}
                  </p>
                  <p className="text-xs text-slate-500">
                    Posted by {movement.postedByName}
                  </p>
                </div>
                <div>
                  <p className="text-slate-700">{movement.lotNumber ?? "No lot"}</p>
                  <p className="text-xs text-slate-500">
                    Expiry {movement.expiryDate ?? "none"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    Reason
                  </p>
                  <p className="text-slate-700">
                    {movement.reasonCode ?? "Not specified"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
