import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, ButtonLink, PaginationBar, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import {
  canUseRecipesAndCosting,
  getDefaultAppRoute
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportFoodCostAnalysis } from "@/server/services/exportAuthorization";
import {
  filterActualConsumptionRows,
  filterFoodCostAnalysisRows,
  getFoodCostAnalysisDashboard,
  summarizeActualConsumptionRows,
  summarizeFoodCostAnalysisRows
} from "@/server/services/recipes";

export const dynamic = "force-dynamic";

const analysisStatusOptions = [
  "ALL",
  "WITHIN_TARGET",
  "ABOVE_TARGET",
  "MISSING_COST",
  "AWAITING_ACTUALS"
] as const;
const movementTypeOptions = [
  "ALL",
  "WASTAGE_OUT",
  "ADJUSTMENT_OUT",
  "COUNT_VARIANCE_OUT"
] as const;
const ANALYSIS_ROWS_PER_PAGE = 10;

function money(value: number | null) {
  if (value === null) {
    return "Pending";
  }
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2
  }).format(value);
}

function percent(value: number | null) {
  if (value === null) {
    return "Pending";
  }
  return `${value.toFixed(2)}%`;
}

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeOption<T extends readonly string[]>(
  value: string | undefined,
  options: T
): T[number] {
  return options.includes(value ?? "") ? (value as T[number]) : options[0]!;
}

function normalizePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function buildQueryHref(basePath: string, params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "ALL") {
      query.set(key, value);
    }
  }
  const queryString = query.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

export default async function FoodCostAnalysisDetailPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseRecipesAndCosting(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const canExport = canExportFoodCostAnalysis(session);
  const params = searchParams ? await searchParams : {};
  const businessDate = getSearchParam(params, "businessDate") ?? "";
  const dashboard = await getFoodCostAnalysisDashboard(session, {
    businessDate
  });
  const salesQuery = (getSearchParam(params, "q") ?? "").trim().toLowerCase();
  const analysisStatusFilter = normalizeOption(
    getSearchParam(params, "status"),
    analysisStatusOptions
  );
  const actualQuery = (getSearchParam(params, "actualQ") ?? "")
    .trim()
    .toLowerCase();
  const movementTypeFilter = normalizeOption(
    getSearchParam(params, "movementType"),
    movementTypeOptions
  );
  const visibleSalesRows = filterFoodCostAnalysisRows(dashboard.rows, {
    q: salesQuery,
    status: analysisStatusFilter
  });
  const visibleActualRows = filterActualConsumptionRows(dashboard.actualConsumptionRows, {
    actualQ: actualQuery,
    movementType: movementTypeFilter
  });
  const requestedSalesPage = normalizePage(getSearchParam(params, "salesPage"));
  const salesTotalPages = Math.max(
    1,
    Math.ceil(visibleSalesRows.length / ANALYSIS_ROWS_PER_PAGE)
  );
  const salesPage = Math.min(requestedSalesPage, salesTotalPages);
  const paginatedSalesRows = visibleSalesRows.slice(
    (salesPage - 1) * ANALYSIS_ROWS_PER_PAGE,
    salesPage * ANALYSIS_ROWS_PER_PAGE
  );
  const requestedActualPage = normalizePage(getSearchParam(params, "actualPage"));
  const actualTotalPages = Math.max(
    1,
    Math.ceil(visibleActualRows.length / ANALYSIS_ROWS_PER_PAGE)
  );
  const actualPage = Math.min(requestedActualPage, actualTotalPages);
  const paginatedActualRows = visibleActualRows.slice(
    (actualPage - 1) * ANALYSIS_ROWS_PER_PAGE,
    actualPage * ANALYSIS_ROWS_PER_PAGE
  );
  const salesPageHref = (page: number) =>
    buildQueryHref("/recipes/analysis", {
      businessDate,
      q: getSearchParam(params, "q"),
      status: analysisStatusFilter,
      actualQ: getSearchParam(params, "actualQ"),
      movementType: movementTypeFilter,
      salesPage: page > 1 ? String(page) : undefined,
      actualPage: actualPage > 1 ? String(actualPage) : undefined
    });
  const actualPageHref = (page: number) =>
    buildQueryHref("/recipes/analysis", {
      businessDate,
      q: getSearchParam(params, "q"),
      status: analysisStatusFilter,
      actualQ: getSearchParam(params, "actualQ"),
      movementType: movementTypeFilter,
      salesPage: salesPage > 1 ? String(salesPage) : undefined,
      actualPage: page > 1 ? String(page) : undefined
    });
  const visibleSalesSummary = summarizeFoodCostAnalysisRows(visibleSalesRows);
  const visibleActualSummary = summarizeActualConsumptionRows(visibleActualRows);
  const hasFilteredSales =
    salesQuery.length > 0 || analysisStatusFilter !== "ALL";
  const hasFilteredActuals =
    actualQuery.length > 0 || movementTypeFilter !== "ALL";

  return (
    <AppShell
      session={session}
      title="Food Cost Analysis Drilldown"
      subtitle="Posted sales, theoretical recipe cost, and ledger-derived actual cost"
      activeNav="food-cost"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/recipes?view=analysis" tone="ghost" className="ogfi-chip">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Analysis
        </ButtonLink>
        {canExport ? (
          <ButtonLink
            href={buildQueryHref("/recipes/analysis/export", {
              businessDate,
              q: getSearchParam(params, "q"),
              status: analysisStatusFilter,
              actualQ: getSearchParam(params, "actualQ"),
              movementType: movementTypeFilter
            })}
            tone="primary"
          >
            Export Food-Cost Analysis CSV
          </ButtonLink>
        ) : null}
      </div>

      <div className="ogfi-coordination-cue mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Evidence boundary:</strong> sales rows are posted import
              records, theoretical cost comes from recipe costing, and actual
              cost comes from posted outbound inventory movements only.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Branch-level actual cost is not allocated to menu items until a
              controlled menu-item consumption source exists.
            </p>
          </div>
          <span>Read-only reconciliation</span>
        </div>
      </div>

      <Panel className="mb-5">
        <form className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <input name="q" type="hidden" value={getSearchParam(params, "q") ?? ""} />
          <input name="status" type="hidden" value={analysisStatusFilter} />
          <input
            name="actualQ"
            type="hidden"
            value={getSearchParam(params, "actualQ") ?? ""}
          />
          <input name="movementType" type="hidden" value={movementTypeFilter} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Business date
            <input
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={businessDate}
              name="businessDate"
              type="date"
            />
          </label>
          <div className="flex gap-2">
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Apply Date
            </button>
            <ButtonLink
              href={buildQueryHref("/recipes/analysis", {
                q: getSearchParam(params, "q"),
                status: analysisStatusFilter,
                actualQ: getSearchParam(params, "actualQ"),
                movementType: movementTypeFilter
              })}
              tone="ghost"
              className="min-h-10"
            >
              Latest Posted
            </ButtonLink>
          </div>
        </form>
      </Panel>

      <div className="mb-5 grid gap-4 lg:grid-cols-6">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Business date</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {dashboard.businessDate ?? "No import"}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Location</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {dashboard.locationName}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Net sales</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {money(dashboard.netSalesAmount)}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Theoretical</p>
          <p className="mt-2 text-xl font-bold text-blue-700">
            {money(dashboard.theoreticalCost)}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Actual ledger</p>
          <p className="mt-2 text-xl font-bold text-amber-700">
            {money(dashboard.actualCost)}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Variance</p>
          <p
            className={`mt-2 text-xl font-bold ${
              (dashboard.varianceAmount ?? 0) > 0
                ? "text-red-700"
                : "text-emerald-700"
            }`}
          >
            {money(dashboard.varianceAmount)}
          </p>
        </Panel>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Within target</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">
            {dashboard.statusCounts.WITHIN_TARGET}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Above target</p>
          <p className="mt-2 text-2xl font-bold text-red-700">
            {dashboard.statusCounts.ABOVE_TARGET}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Missing cost</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">
            {dashboard.statusCounts.MISSING_COST}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Awaiting actuals</p>
          <p className="mt-2 text-2xl font-bold text-blue-700">
            {dashboard.statusCounts.AWAITING_ACTUALS}
          </p>
        </Panel>
      </div>

      {(hasFilteredSales || hasFilteredActuals) ? (
        <div className="mb-5 grid gap-4 lg:grid-cols-6">
          <Panel className="border border-blue-100 bg-blue-50 shadow-none lg:col-span-3">
            <p className="text-xs font-semibold uppercase text-blue-700">
              Visible sales filter
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold text-blue-900/70">Rows</p>
                <p className="font-bold text-blue-950">
                  {visibleSalesSummary.rowCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-900/70">Sold</p>
                <p className="font-bold text-blue-950">
                  {visibleSalesSummary.quantitySold}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-900/70">Net sales</p>
                <p className="font-bold text-blue-950">
                  {money(visibleSalesSummary.netSalesAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-900/70">Food cost</p>
                <p className="font-bold text-blue-950">
                  {percent(visibleSalesSummary.theoreticalFoodCostPercent)}
                </p>
              </div>
            </div>
          </Panel>
          <Panel className="border border-amber-100 bg-amber-50 shadow-none lg:col-span-3">
            <p className="text-xs font-semibold uppercase text-amber-700">
              Visible ledger evidence
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-amber-900/70">Rows</p>
                <p className="font-bold text-amber-950">
                  {visibleActualSummary.rowCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-900/70">Quantity</p>
                <p className="font-bold text-amber-950">
                  {visibleActualSummary.quantityBaseUom}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-900/70">Actual cost</p>
                <p className="font-bold text-amber-950">
                  {visibleActualSummary.rowCount === 0
                    ? "Pending"
                    : money(visibleActualSummary.totalCost)}
                </p>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Posted Sales and Theoretical Cost
              </h2>
              <p className="text-sm text-slate-500">
                {dashboard.salesImportBatches} posted batch(es), {dashboard.quantitySold} sold units.
              </p>
            </div>
            <Badge tone="info">{percent(dashboard.theoreticalFoodCostPercent)}</Badge>
          </div>
          <form className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_12rem_auto] md:items-end">
            <input
              name="actualQ"
              type="hidden"
              value={getSearchParam(params, "actualQ") ?? ""}
            />
            <input name="businessDate" type="hidden" value={businessDate} />
            <input
              name="movementType"
              type="hidden"
              value={movementTypeFilter}
            />
            <input
              name="actualPage"
              type="hidden"
              value={actualPage > 1 ? String(actualPage) : ""}
            />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Search sales rows
              <input
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                defaultValue={getSearchParam(params, "q") ?? ""}
                name="q"
                placeholder="Menu item, recipe, status"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Status
              <select
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                defaultValue={analysisStatusFilter}
                name="status"
              >
                {analysisStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status === "ALL" ? "All statuses" : status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Apply
              </button>
              <ButtonLink
                href={buildQueryHref("/recipes/analysis", {
                  businessDate,
                  actualQ: getSearchParam(params, "actualQ"),
                  movementType: movementTypeFilter,
                  actualPage: actualPage > 1 ? String(actualPage) : undefined
                })}
                tone="ghost"
                className="min-h-10"
              >
                Clear Sales
              </ButtonLink>
            </div>
          </form>
          <div className="hidden bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 lg:grid lg:grid-cols-[1.3fr_7rem_9rem_9rem_8rem_8rem] lg:gap-3">
            <span>Menu item</span>
            <span>Sold</span>
            <span>Net sales</span>
            <span>Theoretical</span>
            <span>Food cost</span>
            <span>Target</span>
          </div>
          <div className="divide-y divide-slate-100">
            {dashboard.rows.length === 0 ? (
              <div className="ogfi-empty-state">
                <p className="font-semibold text-slate-900">No sales import found</p>
                <p className="mt-1 text-sm text-slate-600">
                  Import or seed posted sales for the selected branch before running
                  theoretical food-cost analysis.
                </p>
              </div>
            ) : visibleSalesRows.length === 0 ? (
              <div className="ogfi-empty-state">
                <p className="font-semibold text-slate-900">
                  No sales rows match the filters
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Adjust sales search or status to widen this theoretical-cost list.
                </p>
              </div>
            ) : (
              paginatedSalesRows.map((row) => (
              <div
                key={row.menuItemId}
                className="grid gap-2 px-4 py-4 text-sm lg:grid-cols-[1.3fr_7rem_9rem_9rem_8rem_8rem] lg:gap-3"
              >
                <div>
                  <p className="font-bold text-slate-950">{row.menuItemName}</p>
                  <p className="text-xs text-slate-500">{row.recipeName}</p>
                </div>
                <p className="font-semibold text-slate-900">{row.quantitySold}</p>
                <p className="text-slate-700">{money(row.netSalesAmount)}</p>
                <p className="font-bold text-slate-950">{money(row.theoreticalCost)}</p>
                <p className="font-semibold text-blue-700">
                  {percent(row.theoreticalFoodCostPercent)}
                </p>
                <p className="text-slate-700">{percent(row.targetFoodCostPercent)}</p>
              </div>
              ))
            )}
          </div>
          {visibleSalesRows.length > 0 ? (
            <PaginationBar
              page={salesPage}
              pageSize={ANALYSIS_ROWS_PER_PAGE}
              totalItems={visibleSalesRows.length}
              itemLabel="sales rows"
              getPageHref={salesPageHref}
            />
          ) : null}
        </section>

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Actual Ledger Evidence
              </h2>
              <p className="text-sm text-slate-500">
                {dashboard.actualMovementCount} outbound movement(s).
              </p>
            </div>
            <Badge tone={dashboard.actualCost === null ? "warning" : "success"}>
              {dashboard.actualCost === null ? "pending" : "ledger"}
            </Badge>
          </div>
          <div className="border-b border-slate-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900">
            {dashboard.actualCostSource}
          </div>
          <form className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_12rem_auto] md:items-end">
            <input name="q" type="hidden" value={getSearchParam(params, "q") ?? ""} />
            <input name="status" type="hidden" value={analysisStatusFilter} />
            <input name="businessDate" type="hidden" value={businessDate} />
            <input
              name="salesPage"
              type="hidden"
              value={salesPage > 1 ? String(salesPage) : ""}
            />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Search actual rows
              <input
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                defaultValue={getSearchParam(params, "actualQ") ?? ""}
                name="actualQ"
                placeholder="Ingredient, code, movement"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Movement
              <select
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                defaultValue={movementTypeFilter}
                name="movementType"
              >
                {movementTypeOptions.map((movementType) => (
                  <option key={movementType} value={movementType}>
                    {movementType === "ALL"
                      ? "All movements"
                      : movementType.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Apply
              </button>
              <ButtonLink
                href={buildQueryHref("/recipes/analysis", {
                  businessDate,
                  q: getSearchParam(params, "q"),
                  status: analysisStatusFilter,
                  salesPage: salesPage > 1 ? String(salesPage) : undefined
                })}
                tone="ghost"
                className="min-h-10"
              >
                Clear Actuals
              </ButtonLink>
            </div>
          </form>
          {dashboard.actualConsumptionRows.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">No actual ledger evidence</p>
              <p className="mt-1 text-sm text-slate-600">
                Posted outbound inventory movements are required before actual
                cost can be compared to theoretical cost.
              </p>
            </div>
          ) : visibleActualRows.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">
                No actual rows match the filters
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Adjust actual search or movement type to widen this ledger evidence list.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {paginatedActualRows.map((row) => (
                <div key={`${row.itemId}:${row.movementType}`} className="px-4 py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{row.itemName}</p>
                      <p className="text-xs text-slate-500">{row.itemCode}</p>
                    </div>
                    <Badge tone="neutral">
                      {row.movementType.replaceAll("_", " ").toLowerCase()}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Quantity
                      </p>
                      <p className="font-bold text-slate-950">{row.quantityBaseUom}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Cost
                      </p>
                      <p className="font-bold text-slate-950">{money(row.totalCost)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {visibleActualRows.length > 0 ? (
            <PaginationBar
              page={actualPage}
              pageSize={ANALYSIS_ROWS_PER_PAGE}
              totalItems={visibleActualRows.length}
              itemLabel="actual ledger rows"
              getPageHref={actualPageHref}
            />
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
