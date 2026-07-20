import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, ButtonLink } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { RecipeIngredientLinesEditor } from "@/components/RecipeIngredientLinesEditor";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseRecipesAndCosting,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  createDraftRecipe,
  getRecipeCreateOptions
} from "@/server/services/recipes";

export const dynamic = "force-dynamic";

const inputClass = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2";

async function createDraftRecipeAction(formData: FormData) {
  "use server";

  try {
    const recipeId = await createDraftRecipe(formData);
    redirect(`/recipes/${recipeId}`);
  } catch (error) {
    redirect(actionErrorRedirectPath("/recipes/new", error));
  }
}

export default async function CreateRecipePage({
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
  if (!session.permissionCodes.includes(permissions.recipeManage)) {
    redirect("/recipes");
  }

  const [options, resolvedSearchParams] = await Promise.all([
    getRecipeCreateOptions(session),
    searchParams ?? Promise.resolve({})
  ]);
  const firstUomId = options.uoms[0]?.id ?? "";
  const feedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="Create Draft Recipe"
      subtitle="Focused recipe setup and ingredient entry"
      activeNav="recipes"
    >
      <ActionFeedbackBanner feedback={feedback} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/recipes" tone="ghost" className="ogfi-chip">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Cancel and return to Recipes
        </ButtonLink>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">Draft only</Badge>
          <Badge tone="neutral">{session.context.companyName}</Badge>
          <Badge tone="neutral">{session.context.brandName}</Badge>
          <Badge tone="neutral">{session.context.locationName}</Badge>
        </div>
      </div>

      <form action={createDraftRecipeAction} className="grid gap-5">
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Recipe identity</h2>
              <p className="text-sm text-slate-500">
                The current Company, Brand, and Location context is fixed when this
                draft is submitted.
              </p>
            </div>
            <Badge tone="warning">Not published</Badge>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Recipe code
              <input className={inputClass} name="recipeCode" placeholder="e.g. YL-KARUBI-SET" required />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700 md:col-span-2">
              Recipe name
              <input className={inputClass} name="recipeName" placeholder="e.g. Karubi Set" required />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Recipe type
              <select className={inputClass} name="recipeType" required>
                <option value="MENU">Menu item</option>
                <option value="SUB_RECIPE">Sub-recipe</option>
                <option value="PREP">Prep recipe</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Owner department
              <input className={inputClass} name="ownerDepartment" placeholder="Kitchen, Commissary, R&D" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Target food cost %
              <input className={inputClass} name="targetFoodCostPercent" type="number" min="0.01" max="100" step="0.01" />
            </label>
          </div>
        </section>

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Yield and serving</h2>
              <p className="text-sm text-slate-500">Define the controlled costing basis for the initial draft.</p>
            </div>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Yield quantity
              <input className={inputClass} name="yieldQuantity" type="number" min="0.000001" step="0.000001" required />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Yield UOM
              <select className={inputClass} name="yieldUomId" defaultValue={firstUomId} required>
                {options.uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.code} / {uom.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Serving quantity
              <input className={inputClass} name="servingQuantity" type="number" min="0.000001" step="0.000001" required />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Serving UOM
              <select className={inputClass} name="servingUomId" defaultValue={firstUomId} required>
                {options.uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.code} / {uom.name}</option>)}
              </select>
            </label>
          </div>
        </section>

        <RecipeIngredientLinesEditor items={options.items.map((item) => ({ id: item.id, code: item.code, name: item.name }))} uoms={options.uoms.map((uom) => ({ id: uom.id, code: uom.code }))} defaultUomId={firstUomId} />

        <section className="ogfi-data-surface p-4">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Draft notes
            <textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2" name="notes" placeholder="Test kitchen context or serving assumptions" />
          </label>
        </section>

        <div className="sticky bottom-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.06)] backdrop-blur">
          <p className="text-xs font-semibold text-slate-500">
            Creates a draft only; inventory, POS, finance, and menu prices are unchanged.
          </p>
          <div className="flex gap-2">
            <ButtonLink href="/recipes" tone="ghost">Cancel</ButtonLink>
            <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" type="submit">
              Create Draft Recipe
            </button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
