import { redirect } from "next/navigation";
import { Badge, ButtonLink, PaginationBar } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportInventoryLedger } from "@/server/services/exportAuthorization";
import {
  inventoryDashboardProfileHref,
  getInventoryLedgerVarianceTracePage,
  listInventoryMovements,
  maxInventorySearchLength,
  normalizeInventoryMovementFilters,
  resolveInventoryDashboardProfile,
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

function formatQuantity(value: number | null) {
  return value === null
    ? "Unavailable"
    : value.toLocaleString("en-PH", { maximumFractionDigits: 6 });
}

function formatSignedQuantity(value: number | null) {
  return value !== null && value > 0
    ? `+${formatQuantity(value)}`
    : formatQuantity(value);
}

function getPositivePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function exactTracePageHref(input: {
  inventoryLocationId: string;
  itemId: string;
  lotKey: string;
  page: number;
  returnHref: string | null;
}) {
  const params = new URLSearchParams({
    inventoryLocationId: input.inventoryLocationId,
    itemId: input.itemId,
    lotKey: input.lotKey
  });
  if (input.page > 1) params.set("tracePage", String(input.page));
  if (input.returnHref) params.set("returnTo", input.returnHref);
  return `/inventory/ledger?${params.toString()}`;
}

function reconciliationReturnHref(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value, "https://ogfi.invalid");
    if (
      url.origin !== "https://ogfi.invalid" ||
      url.pathname !== "/inventory/reconciliation"
    ) {
      return null;
    }
    const profile = resolveInventoryDashboardProfile(
      url.searchParams.get("dashboard") ?? undefined
    );
    const query = url.searchParams.get("q")?.trim() || undefined;
    const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    if (!profile || (query && query.length > maxInventorySearchLength)) {
      return null;
    }
    return inventoryDashboardProfileHref(profile, {
      ...(query ? { query } : {}),
      ...(Number.isFinite(rawPage) && rawPage > 1 ? { page: rawPage } : {})
    });
  } catch {
    return null;
  }
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
  const returnHref = reconciliationReturnHref(getSearchParam(params, "returnTo"));
  const rawTraceFilters = {
    inventoryLocationId: getSearchParam(params, "inventoryLocationId"),
    itemId: getSearchParam(params, "itemId"),
    lotKey: getSearchParam(params, "lotKey")
  };
  const hasTraceInput = Object.values(rawTraceFilters).some(Boolean);
  let normalizedFilters: InventoryMovementFilters | null = null;
  let traceError = false;
  try {
    normalizedFilters = normalizeInventoryMovementFilters({
      query: normalizedQuery,
      movementType: getSearchParam(params, "movementType"),
      ...rawTraceFilters
    });
  } catch {
    traceError = hasTraceInput;
  }
  const searchError =
    normalizedQuery && normalizedQuery.length > maxInventorySearchLength
      ? `Search is limited to ${maxInventorySearchLength} characters.`
      : null;
  const filters: InventoryMovementFilters = normalizedFilters ?? {};
  const isExactTrace =
    !traceError &&
    Boolean(filters.inventoryLocationId && filters.itemId && filters.lotKey);
  if (
    isExactTrace &&
    !session.permissionCodes.includes(permissions.inventoryBalanceView)
  ) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
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
  const tracePage = isExactTrace
    ? await getInventoryLedgerVarianceTracePage(session, {
        inventoryLocationId: filters.inventoryLocationId!,
        itemId: filters.itemId!,
        lotKey: filters.lotKey!,
        page: getPositivePage(getSearchParam(params, "tracePage"))
      })
    : null;
  const movements = tracePage
    ? tracePage.items
    : searchError || traceError
      ? []
      : await listInventoryMovements(session, filters);
  const traceRangeStart =
    tracePage && tracePage.totalItems > 0
      ? (tracePage.page - 1) * tracePage.pageSize + 1
      : 0;
  const traceRangeEnd = tracePage
    ? traceRangeStart + tracePage.items.length - (tracePage.items.length > 0 ? 1 : 0)
    : 0;

  if (traceError) {
    return (
      <AppShell
        session={session}
        title="Ledger trace unavailable"
        subtitle="The requested exact inventory key is incomplete or invalid"
        activeNav="inventory-ledger"
      >
        <section className="ogfi-data-surface p-5">
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">Ledger trace cannot be opened safely</p>
            <p className="mt-1 text-sm text-slate-600">
              Return to the reconciliation profile and open the current exact trace link. No generic ledger search was substituted.
            </p>
          </div>
          <div className="mt-4 flex justify-center">
            <ButtonLink
              href={returnHref ?? "/inventory/reconciliation?dashboard=ledger-variance-v1"}
              className="min-h-11"
            >
              Back to reconciliation
            </ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      session={session}
      title="Inventory Ledger"
      subtitle={
        isExactTrace
          ? "Exact immutable movement trace for the selected reconciliation key"
          : "Immutable movement trail for the current location"
      }
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
            <h2 className="text-lg font-bold text-slate-950">
              {isExactTrace ? "Exact Ledger Trace" : "Recent Movements"}
            </h2>
            <p className="text-sm text-slate-500">
              {isExactTrace
                ? `Showing ${traceRangeStart}–${traceRangeEnd} of ${tracePage?.totalItems ?? 0} movements for the exact item, storage, lot, and expiry key`
                : "Showing the latest 100 source-linked movements for this location"}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge tone="info">{session.context.locationName}</Badge>
            {isExactTrace && returnHref ? (
              <ButtonLink href={returnHref} tone="secondary" className="min-h-11">
                Back to reconciliation
              </ButtonLink>
            ) : null}
            {canExportLedger && !isExactTrace ? (
              <ButtonLink
                href={exportHref}
                className="min-h-11 bg-slate-100 text-blue-700 hover:bg-blue-50"
              >
                Export CSV
              </ButtonLink>
            ) : null}
          </div>
        </div>

        {isExactTrace ? (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
            <strong>Exact trace active.</strong> Scope and key filters are server-validated and cannot be widened from this view. Return to reconciliation to select another variance row.
            {tracePage?.isCurrentVariance ? (
              <p className="mt-2 font-semibold">
                Current cached quantity {formatQuantity(tracePage.currentBalanceQuantity)}, ledger quantity {formatQuantity(tracePage.currentLedgerQuantity)}, signed variance {formatSignedQuantity(tracePage.currentVarianceQuantity)}.
              </p>
            ) : null}
          </div>
        ) : (
          <form className="ogfi-filter-bar grid gap-3 md:grid-cols-[1fr_14rem_auto_auto]">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Search
            <input
              className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
              defaultValue={rawQuery}
              name="q"
              placeholder="Item, code, lot, source"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Movement type
            <select
              className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
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
            <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 md:w-auto">
              Apply
            </button>
          </div>
          <div className="flex items-end">
            <ButtonLink
              href="/inventory/ledger"
              className="min-h-11 w-full bg-slate-100 text-slate-700 hover:bg-slate-200 md:w-auto"
            >
              Clear
            </ButtonLink>
          </div>
          </form>
        )}
        {tracePage && !tracePage.isCurrentVariance ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">STALE / RESOLVED</Badge>
              <p className="font-bold">This key is no longer in the current variance population.</p>
            </div>
            <p className="mt-2 text-sm leading-6">
              Historical movements remain available for audit, but this trace must not be treated as a current reconciliation finding. The latest canonical check at {new Date(tracePage.currentVarianceGeneratedAt).toLocaleString()} did not return this key as a non-zero variance.
            </p>
          </div>
        ) : null}
        {searchError ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {searchError}
          </div>
        ) : null}

        {movements.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">
              {isExactTrace ? "No movements found for this exact key" : "No inventory movements found"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {isExactTrace
                ? "The variance or its source data may have changed. Return to reconciliation for the current diagnostic population."
                : "Posted receiving, transfer dispatch and receipt, wastage posting, and approved future adjustment workflows will create ledger entries."}
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
        {tracePage && tracePage.totalItems > 0 ? (
          <PaginationBar
            page={tracePage.page}
            pageSize={tracePage.pageSize}
            totalItems={tracePage.totalItems}
            itemLabel="ledger movements"
            controlClassName="min-h-11"
            getPageHref={(nextPage) =>
              exactTracePageHref({
                inventoryLocationId: filters.inventoryLocationId!,
                itemId: filters.itemId!,
                lotKey: filters.lotKey!,
                page: nextPage,
                returnHref
              })
            }
          />
        ) : null}
      </section>
    </AppShell>
  );
}
