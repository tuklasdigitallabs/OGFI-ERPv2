import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import {
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseRecipesAndCosting,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  canExportFoodCostAnalysis,
  canExportRecipeCosting
} from "@/server/services/exportAuthorization";
import {
  filterFoodCostAnalysisRows,
  filterRecipeCostingSummaries,
  getFoodCostAnalysisDashboard,
  listRecipeCostingSummaries
} from "@/server/services/recipes";

export const dynamic = "force-dynamic";

const views = ["recipes", "food-cost", "analysis"] as const;
type RecipeWorkspaceView = (typeof views)[number];
const recipeTypeOptions = ["ALL", "MENU", "SUB_RECIPE", "PREP"] as const;
const recipeStatusOptions = ["ALL", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;
const analysisStatusOptions = [
  "ALL",
  "WITHIN_TARGET",
  "ABOVE_TARGET",
  "MISSING_COST",
  "AWAITING_ACTUALS"
] as const;
const RECIPES_PER_PAGE = 10;

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeView(value: string | undefined): RecipeWorkspaceView {
  return views.includes(value as RecipeWorkspaceView)
    ? (value as RecipeWorkspaceView)
    : "recipes";
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

function viewHref(view: RecipeWorkspaceView) {
  return view === "recipes" ? "/recipes" : `/recipes?view=${view}`;
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

export default async function RecipesPage({
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

  const params = searchParams ? await searchParams : {};
  const activeView = normalizeView(getSearchParam(params, "view"));
  const query = (getSearchParam(params, "q") ?? "").trim().toLowerCase();
  const recipeTypeFilter = normalizeOption(
    getSearchParam(params, "type"),
    recipeTypeOptions
  );
  const recipeStatusFilter = normalizeOption(
    getSearchParam(params, "status"),
    recipeStatusOptions
  );
  const analysisStatusFilter = normalizeOption(
    getSearchParam(params, "analysisStatus"),
    analysisStatusOptions
  );
  const [recipes, foodCostAnalysis] = await Promise.all([
    listRecipeCostingSummaries(session),
    getFoodCostAnalysisDashboard(session)
  ]);
  const canCreateRecipe = session.permissionCodes.includes(permissions.recipeManage);
  const actionFeedback = getActionFeedback(params);
  const canExportRecipes = canExportRecipeCosting(session);
  const canExportAnalysis = canExportFoodCostAnalysis(session);
  const exportHref =
    activeView === "analysis"
      ? buildQueryHref("/recipes/analysis/export", {
          businessDate: getSearchParam(params, "businessDate"),
          q: getSearchParam(params, "q"),
          status: analysisStatusFilter,
          actualQ: getSearchParam(params, "actualQ"),
          movementType: getSearchParam(params, "movementType")
        })
      : buildQueryHref("/recipes/export", {
          q: getSearchParam(params, "q"),
          type: recipeTypeFilter,
          status: recipeStatusFilter
        });
  const canExportActiveView =
    activeView === "analysis" ? canExportAnalysis : canExportRecipes;
  const exportLabel =
    activeView === "analysis"
      ? "Export Sales Analysis CSV"
      : activeView === "food-cost"
        ? "Export Food Cost CSV"
        : "Export Recipe Costing CSV";
  const pricedRecipes = recipes.filter(
    (recipe) => recipe.currentMenuPrice !== null && recipe.estimatedServingCost !== null
  );
  const pendingCostRecipes = recipes.filter(
    (recipe) => recipe.costingStatus === "PENDING_COST"
  );
  const visibleRecipes = filterRecipeCostingSummaries(recipes, {
    q: query,
    type: recipeTypeFilter,
    status: recipeStatusFilter
  });
  const requestedRecipePage = normalizePage(getSearchParam(params, "page"));
  const recipeLibraryTotalPages = Math.max(
    1,
    Math.ceil(visibleRecipes.length / RECIPES_PER_PAGE)
  );
  const recipeLibraryPage = Math.min(requestedRecipePage, recipeLibraryTotalPages);
  const recipeStartIndex = (recipeLibraryPage - 1) * RECIPES_PER_PAGE;
  const paginatedRecipes = visibleRecipes.slice(
    recipeStartIndex,
    recipeStartIndex + RECIPES_PER_PAGE
  );
  const recipeShowingStart = visibleRecipes.length === 0 ? 0 : recipeStartIndex + 1;
  const recipeShowingEnd = Math.min(
    recipeStartIndex + RECIPES_PER_PAGE,
    visibleRecipes.length
  );
  const recipePageHref = (page: number) =>
    buildQueryHref("/recipes", {
      q: getSearchParam(params, "q"),
      type: recipeTypeFilter,
      status: recipeStatusFilter,
      page: page > 1 ? String(page) : undefined
    });
  const requestedFoodCostPage = normalizePage(getSearchParam(params, "page"));
  const foodCostTotalPages = Math.max(
    1,
    Math.ceil(visibleRecipes.length / RECIPES_PER_PAGE)
  );
  const foodCostPage = Math.min(requestedFoodCostPage, foodCostTotalPages);
  const foodCostStartIndex = (foodCostPage - 1) * RECIPES_PER_PAGE;
  const paginatedFoodCostRecipes = visibleRecipes.slice(
    foodCostStartIndex,
    foodCostStartIndex + RECIPES_PER_PAGE
  );
  const foodCostShowingStart =
    visibleRecipes.length === 0 ? 0 : foodCostStartIndex + 1;
  const foodCostShowingEnd = Math.min(
    foodCostStartIndex + RECIPES_PER_PAGE,
    visibleRecipes.length
  );
  const foodCostPageHref = (page: number) =>
    buildQueryHref("/recipes", {
      view: "food-cost",
      q: getSearchParam(params, "q"),
      type: recipeTypeFilter,
      status: recipeStatusFilter,
      page: page > 1 ? String(page) : undefined
    });
  const visibleAnalysisRows = filterFoodCostAnalysisRows(foodCostAnalysis.rows, {
    q: query,
    status: analysisStatusFilter
  });
  return (
    <AppShell
      session={session}
      title="Recipes & Menu Costing"
      subtitle="Phase II recipe, menu price, and food-cost foundation"
      activeNav={activeView === "recipes" ? "recipes" : "food-cost"}
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Phase II boundary:</strong> recipes estimate expected usage and
              menu cost. Inventory remains the source of truth for actual movements;
              POS sales and finance postings are not changed by this workspace.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              This first slice uses published recipe versions, menu prices, and latest
              supplier price history as a controlled costing preview.
            </p>
          </div>
          <span>Controlled costing foundation</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Recipes</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{recipes.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Priced menu items</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {pricedRecipes.length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Pending costing</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {pendingCostRecipes.length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Imported sales</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {money(foodCostAnalysis.netSalesAmount)}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Scope</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {session.context.brandName}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Phase II Costing Workspace
            </h2>
            <p className="text-sm text-slate-500">
              Cost estimates are source-linked to recipe lines and supplier price history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{recipes.length} recipe records</Badge>
            {canCreateRecipe ? (
              <ButtonLink href="/recipes/new">Create Draft Recipe</ButtonLink>
            ) : null}
            {canExportActiveView ? (
              <ButtonLink href={exportHref} tone="ghost" className="ogfi-chip">
                {exportLabel}
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <div className="border-b border-slate-100 p-3">
          <div className="grid gap-2 md:grid-cols-3">
            {[
              { id: "recipes" as const, label: "Recipe Library", detail: "Versions and ingredient lines" },
              { id: "food-cost" as const, label: "Food Cost View", detail: "Menu price, plate cost, margin" },
              { id: "analysis" as const, label: "Sales Analysis", detail: "Imported sales and theoretical cost" }
            ].map((tab) => {
              const active = activeView === tab.id;
              return (
                <a
                  key={tab.id}
                  className={
                    active
                      ? "rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 shadow-sm"
                      : "rounded-xl border border-transparent px-4 py-3 text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                  }
                  href={viewHref(tab.id)}
                >
                  <span className="block text-sm font-bold">{tab.label}</span>
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    {tab.detail}
                  </span>
                </a>
              );
            })}
          </div>
        </div>

        <form className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_12rem_12rem_auto] md:items-end">
          <input name="view" type="hidden" value={activeView} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Search
            <input
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              defaultValue={getSearchParam(params, "q") ?? ""}
              name="q"
              placeholder={
                activeView === "analysis"
                  ? "Menu item, recipe, status"
                  : "Recipe, ingredient, code, menu item"
              }
            />
          </label>
          {activeView === "analysis" ? (
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              Analysis status
              <select
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                defaultValue={analysisStatusFilter}
                name="analysisStatus"
              >
                {analysisStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status === "ALL" ? "All analysis statuses" : status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Recipe type
                <select
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                  defaultValue={recipeTypeFilter}
                  name="type"
                >
                  {recipeTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type === "ALL" ? "All types" : type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Status
                <select
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                  defaultValue={recipeStatusFilter}
                  name="status"
                >
                  {recipeStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status === "ALL" ? "All statuses" : status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="flex gap-2">
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Apply
            </button>
            <ButtonLink href={viewHref(activeView)} tone="ghost" className="min-h-10">
              Clear
            </ButtonLink>
          </div>
        </form>

        {recipes.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No recipes yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Seed or create approved recipe versions before using menu costing.
            </p>
          </div>
        ) : activeView !== "analysis" && visibleRecipes.length === 0 ? (
          <div className="ogfi-empty-state">
            <p className="font-semibold text-slate-900">No recipes match the filters</p>
            <p className="mt-1 text-sm text-slate-600">
              Adjust search, recipe type, or status to widen this costing workspace.
            </p>
          </div>
        ) : activeView === "recipes" ? (
          <>
          <div className="divide-y divide-slate-100">
            {paginatedRecipes.map((recipe) => (
              <div key={recipe.id} className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-950">
                        {recipe.recipeName}
                      </h3>
                      <Badge tone="info" size="sm">{recipe.recipeType}</Badge>
                      <Badge tone={recipe.status === "ACTIVE" ? "success" : "neutral"} size="sm">
                        {recipe.status.replaceAll("_", " ")}
                      </Badge>
                      <Badge
                        tone={
                          recipe.selectedVersionStatus === "PUBLISHED"
                            ? "info"
                            : "neutral"
                        }
                        size="sm"
                      >
                        {recipe.selectedVersionStatus.replaceAll("_", " ")}
                      </Badge>
                      <Badge
                        tone={
                          recipe.costingStatus === "COSTED" ? "success" : "warning"
                        }
                        size="sm"
                      >
                        {recipe.costingStatus === "COSTED"
                          ? "Costed"
                          : `${recipe.pendingCostLineCount} pending cost line(s)`}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {recipe.recipeCode} / {recipe.brandName} / Version{" "}
                      {recipe.versionNo ?? "Pending"}
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase text-slate-500">Yield</p>
                      <p className="font-bold text-slate-900">
                        {recipe.yieldQuantity ?? "-"} {recipe.yieldUomCode ?? ""}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase text-slate-500">Serving</p>
                      <p className="font-bold text-slate-900">
                        {recipe.servingQuantity ?? "-"} {recipe.servingUomCode ?? ""}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Costed lines
                      </p>
                      <p className="font-bold text-slate-900">
                        {recipe.costedLineCount}/{recipe.lineCount}
                      </p>
                    </div>
                    <ButtonLink
                      href={`/recipes/${recipe.id}`}
                      tone="ghost"
                      className="min-h-[3.5rem] justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
                    >
                      View Recipe
                    </ButtonLink>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {recipeShowingStart}-{recipeShowingEnd} of {visibleRecipes.length} recipes
            </p>
            {recipeLibraryTotalPages > 1 ? (
              <div className="flex items-center gap-2">
                {recipeLibraryPage > 1 ? (
                  <ButtonLink href={recipePageHref(recipeLibraryPage - 1)} tone="secondary">
                    Previous
                  </ButtonLink>
                ) : (
                  <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                    Previous
                  </span>
                )}
                <span className="font-semibold text-slate-700">
                  Page {recipeLibraryPage} of {recipeLibraryTotalPages}
                </span>
                {recipeLibraryPage < recipeLibraryTotalPages ? (
                  <ButtonLink href={recipePageHref(recipeLibraryPage + 1)} tone="secondary">
                    Next
                  </ButtonLink>
                ) : (
                  <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                    Next
                  </span>
                )}
              </div>
            ) : null}
          </div>
          </>
        ) : activeView === "food-cost" ? (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[64rem]">
                <div className="grid grid-cols-[1.7fr_8rem_8rem_8rem_8rem_8rem_8rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  <span>Recipe</span>
                  <span>Plate cost</span>
                  <span>Menu price</span>
                  <span>Food cost</span>
                  <span>Target</span>
                  <span>Gross margin</span>
                  <span>Action</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {paginatedFoodCostRecipes.map((recipe) => {
                    const overTarget =
                      recipe.targetFoodCostPercent !== null &&
                      recipe.estimatedFoodCostPercent !== null &&
                      recipe.estimatedFoodCostPercent > recipe.targetFoodCostPercent;
                    return (
                      <div
                        key={recipe.id}
                        className="grid grid-cols-[1.7fr_8rem_8rem_8rem_8rem_8rem_8rem] items-center gap-3 px-4 py-4 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-slate-950">
                              {recipe.menuItemName ?? recipe.recipeName}
                            </h3>
                            <Badge tone={overTarget ? "warning" : "success"} size="sm">
                              {overTarget ? "Above target" : "Within target"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {recipe.recipeName} / {recipe.lineCount} ingredient lines
                          </p>
                        </div>
                        <p className="font-bold text-slate-950">
                          {money(recipe.estimatedServingCost)}
                        </p>
                        <p className="font-semibold text-slate-800">
                          {money(recipe.currentMenuPrice)}
                        </p>
                        <p
                          className={
                            overTarget
                              ? "font-bold text-amber-700"
                              : "font-bold text-emerald-700"
                          }
                        >
                          {percent(recipe.estimatedFoodCostPercent)}
                        </p>
                        <p className="font-semibold text-slate-700">
                          {percent(recipe.targetFoodCostPercent)}
                        </p>
                        <p className="font-bold text-emerald-700">
                          {money(recipe.estimatedGrossMargin)}
                        </p>
                        <ButtonLink
                          href={`/recipes/${recipe.id}`}
                          tone="secondary"
                          className="min-h-10 justify-center border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
                        >
                          View Recipe
                        </ButtonLink>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {foodCostShowingStart}-{foodCostShowingEnd} of{" "}
                {visibleRecipes.length} food-cost records
              </p>
              {foodCostTotalPages > 1 ? (
                <div className="flex items-center gap-2">
                  {foodCostPage > 1 ? (
                    <ButtonLink href={foodCostPageHref(foodCostPage - 1)} tone="secondary">
                      Previous
                    </ButtonLink>
                  ) : (
                    <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                      Previous
                    </span>
                  )}
                  <span className="font-semibold text-slate-700">
                    Page {foodCostPage} of {foodCostTotalPages}
                  </span>
                  {foodCostPage < foodCostTotalPages ? (
                    <ButtonLink href={foodCostPageHref(foodCostPage + 1)} tone="secondary">
                      Next
                    </ButtonLink>
                  ) : (
                    <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                      Next
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="p-5">
            <div className="grid gap-4 md:grid-cols-6">
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">Latest sales date</p>
                <p className="mt-2 text-xl font-bold text-slate-950">
                  {foodCostAnalysis.businessDate ?? "No import"}
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">Quantity sold</p>
                <p className="mt-2 text-xl font-bold text-slate-950">
                  {foodCostAnalysis.quantitySold}
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">Theoretical cost</p>
                <p className="mt-2 text-xl font-bold text-blue-700">
                  {money(foodCostAnalysis.theoreticalCost)}
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">Theoretical %</p>
                <p className="mt-2 text-xl font-bold text-emerald-700">
                  {percent(foodCostAnalysis.theoreticalFoodCostPercent)}
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">Actual cost</p>
                <p className="mt-2 text-xl font-bold text-amber-700">
                  {money(foodCostAnalysis.actualCost)}
                </p>
              </Panel>
              <Panel className="border border-slate-200 bg-slate-50 shadow-none">
                <p className="text-xs font-semibold uppercase text-slate-500">Variance</p>
                <p
                  className={`mt-2 text-xl font-bold ${
                    (foodCostAnalysis.varianceAmount ?? 0) > 0
                      ? "text-red-700"
                      : "text-emerald-700"
                  }`}
                >
                  {money(foodCostAnalysis.varianceAmount)}
                </p>
              </Panel>
            </div>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="font-bold">Actual variance is ledger-derived.</p>
                <ButtonLink href="/recipes/analysis" tone="ghost" className="ogfi-chip">
                  Open Drilldown
                </ButtonLink>
              </div>
              <p className="mt-1 text-blue-900/80">
                This view uses posted POS-sales import records and published recipe costs
                to calculate theoretical food cost. Actual cost is summarized from posted
                outbound inventory movements for the selected branch and sales date; menu
                item rows stay theoretical-only until a controlled menu-item consumption
                source exists.
              </p>
              <p className="mt-2 text-xs font-semibold text-blue-900/80">
                {foodCostAnalysis.actualCostSource} {foodCostAnalysis.actualMovementCount} movement(s).
              </p>
            </div>

            {foodCostAnalysis.actualConsumptionRows.length > 0 ? (
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <div className="bg-slate-50 px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-950">
                    Actual Consumption Snapshot
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ledger outbound movements grouped by ingredient and movement type.
                  </p>
                </div>
                <div className="hidden bg-slate-50 px-4 py-2 text-xs font-bold uppercase text-slate-500 lg:grid lg:grid-cols-[1fr_10rem_8rem_9rem] lg:gap-3">
                  <span>Ingredient</span>
                  <span>Movement</span>
                  <span>Quantity</span>
                  <span>Actual cost</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {foodCostAnalysis.actualConsumptionRows.map((row) => (
                    <div
                      key={`${row.itemId}:${row.movementType}`}
                      className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[1fr_10rem_8rem_9rem] lg:gap-3"
                    >
                      <div>
                        <p className="font-bold text-slate-950">{row.itemName}</p>
                        <p className="text-xs text-slate-500">{row.itemCode}</p>
                      </div>
                      <p className="font-semibold text-slate-700">
                        {row.movementType.replaceAll("_", " ").toLowerCase()}
                      </p>
                      <p className="text-slate-700">{row.quantityBaseUom}</p>
                      <p className="font-bold text-slate-950">{money(row.totalCost)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
              <div className="hidden bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 lg:grid lg:grid-cols-[1.4fr_7rem_9rem_9rem_8rem_8rem_9rem] lg:gap-3">
                <span>Menu item</span>
                <span>Sold</span>
                <span>Net sales</span>
                <span>Theoretical</span>
                <span>Food cost</span>
                <span>Target</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-slate-100">
                {foodCostAnalysis.rows.length === 0 ? (
                  <div className="ogfi-empty-state">
                    <p className="font-semibold text-slate-900">No sales import found</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Import or seed posted sales for the selected branch before running
                      theoretical food-cost analysis.
                    </p>
                  </div>
                ) : visibleAnalysisRows.length === 0 ? (
                  <div className="ogfi-empty-state">
                    <p className="font-semibold text-slate-900">
                      No sales rows match the filters
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Adjust search or analysis status to widen this food-cost view.
                    </p>
                  </div>
                ) : (
                  visibleAnalysisRows.map((row) => (
                    <div
                      key={row.menuItemId}
                      className="grid gap-2 px-4 py-4 text-sm lg:grid-cols-[1.4fr_7rem_9rem_9rem_8rem_8rem_9rem] lg:gap-3"
                    >
                      <div>
                        <p className="font-bold text-slate-950">{row.menuItemName}</p>
                        <p className="text-xs text-slate-500">{row.recipeName}</p>
                      </div>
                      <p className="font-semibold text-slate-900">{row.quantitySold}</p>
                      <p className="text-slate-700">{money(row.netSalesAmount)}</p>
                      <p className="font-bold text-slate-950">
                        {money(row.theoreticalCost)}
                      </p>
                      <p className="font-semibold text-blue-700">
                        {percent(row.theoreticalFoodCostPercent)}
                      </p>
                      <p className="text-slate-700">{percent(row.targetFoodCostPercent)}</p>
                      <Badge
                        tone={
                          row.status === "ABOVE_TARGET"
                            ? "warning"
                            : row.status === "MISSING_COST"
                              ? "destructive"
                              : "info"
                        }
                      >
                        {row.status.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
