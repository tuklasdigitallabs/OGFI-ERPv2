import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, ButtonLink } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { RecipeRevisionAddLinesEditor } from "@/components/RecipeRevisionAddLinesEditor";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import { canUseRecipesAndCosting, getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { createRecipeRevisionDraft, getRecipeCreateOptions, getRecipeCostingSummary } from "@/server/services/recipes";

export const dynamic = "force-dynamic";

const inputClass = "min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2";

async function createRecipeRevisionDraftAction(formData: FormData) {
  "use server";
  const recipeId = formData.get("recipeId");
  const redirectPath = typeof recipeId === "string" ? `/recipes/${recipeId}` : "/recipes";
  try {
    await createRecipeRevisionDraft(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`${redirectPath}/revise`, error));
  }
  redirect(`${redirectPath}?section=workflow`);
}

export default async function ReviseRecipePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!canUseRecipesAndCosting(session.permissionCodes)) redirect(getDefaultAppRoute(session.permissionCodes));
  if (!session.permissionCodes.includes(permissions.recipeManage)) redirect("/recipes");

  const { id } = await params;
  const [recipe, options, resolvedSearchParams] = await Promise.all([
    getRecipeCostingSummary(session, id),
    getRecipeCreateOptions(session),
    searchParams ?? Promise.resolve({})
  ]);
  if (!recipe) notFound();
  if (!recipe.versionId) redirect(`/recipes/${id}`);

  const firstUomId = options.uoms[0]?.id ?? "";
  const feedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell session={session} title={`Revise ${recipe.recipeName}`} subtitle="Focused draft revision task" activeNav="recipes">
      <ActionFeedbackBanner feedback={feedback} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href={`/recipes/${recipe.id}`} tone="ghost" className="ogfi-chip">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Cancel and return to Recipe
        </ButtonLink>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">Source v{recipe.versionNo ?? "Pending"}</Badge>
          <Badge tone="neutral">{session.context.companyName}</Badge>
          <Badge tone="neutral">{recipe.brandName}</Badge>
          <Badge tone="neutral">{session.context.locationName}</Badge>
        </div>
      </div>

      <form action={createRecipeRevisionDraftAction} className="grid gap-5">
        <input type="hidden" name="recipeId" value={recipe.id} />
        <input type="hidden" name="sourceVersionId" value={recipe.versionId} />

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Revision basis</h2>
              <p className="text-sm text-slate-500">A new draft is created; the published costing basis remains unchanged.</p>
            </div>
            <Badge tone="warning">Draft revision</Badge>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-5">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">Yield quantity<input className={inputClass} name="yieldQuantity" type="number" min="0.000001" step="0.000001" defaultValue={recipe.yieldQuantity ?? undefined} required /></label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">Yield UOM<select className={inputClass} name="yieldUomId" defaultValue={recipe.yieldUomId ?? undefined} required>{options.uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.code} / {uom.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">Serving quantity<input className={inputClass} name="servingQuantity" type="number" min="0.000001" step="0.000001" defaultValue={recipe.servingQuantity ?? undefined} required /></label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">Serving UOM<select className={inputClass} name="servingUomId" defaultValue={recipe.servingUomId ?? undefined} required>{options.uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.code} / {uom.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">Target food cost %<input className={inputClass} name="targetFoodCostPercent" type="number" min="0.01" max="100" step="0.01" defaultValue={recipe.targetFoodCostPercent ?? undefined} /></label>
          </div>
          <div className="border-t border-slate-100 p-4">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">Change reason<input className={inputClass} name="reason" placeholder="Supplier yield, portion standard, costing refresh..." required /></label>
          </div>
        </section>

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div><h2 className="text-lg font-bold text-slate-950">Current ingredient lines</h2><p className="text-sm text-slate-500">Adjust quantities, preparation notes, order, or mark a line for removal.</p></div>
            <Badge tone="info">{recipe.lines.length} source lines</Badge>
          </div>
          <div className="grid gap-3 p-4">
            {recipe.lines.map((line) => (
              <fieldset key={line.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[5rem_1.3fr_8rem_1fr_7rem] md:items-end">
                <legend className="sr-only">Current ingredient {line.itemName}</legend>
                <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Order<input className={inputClass} name={`line.${line.lineNo}.sortOrder`} type="number" min="1" max="100" step="1" defaultValue={line.lineNo} required /></label>
                <div className="md:pb-2"><p className="font-bold text-slate-950">{line.itemName}</p><p className="text-xs text-slate-500">{line.itemCode} / {line.uomCode}</p></div>
                <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Quantity<input className={inputClass} name={`line.${line.lineNo}.quantity`} type="number" min="0.000001" step="0.000001" defaultValue={line.quantity} required /></label>
                <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Preparation note<input className={inputClass} name={`line.${line.lineNo}.preparationNote`} defaultValue={line.preparationNote ?? ""} placeholder="Optional" /></label>
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700"><input name={`line.${line.lineNo}.remove`} type="checkbox" value="1" />Remove</label>
              </fieldset>
            ))}
          </div>
        </section>

        <RecipeRevisionAddLinesEditor items={options.items} uoms={options.uoms} subRecipes={options.subRecipes} defaultUomId={firstUomId} firstSortOrder={recipe.lines.length + 1} />

        <section className="ogfi-data-surface p-4"><label className="grid gap-1 text-sm font-semibold text-slate-700">Revision notes<textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2" name="notes" placeholder="Internal costing notes for this draft version" /></label></section>

        <div className="sticky bottom-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.06)] backdrop-blur">
          <p className="text-xs font-semibold text-slate-500">Published recipe, menu price, inventory, POS, and finance records remain unchanged.</p>
          <div className="flex gap-2"><ButtonLink href={`/recipes/${recipe.id}`} tone="ghost">Cancel</ButtonLink><button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700" type="submit">Create Draft Revision</button></div>
        </div>
      </form>
    </AppShell>
  );
}
