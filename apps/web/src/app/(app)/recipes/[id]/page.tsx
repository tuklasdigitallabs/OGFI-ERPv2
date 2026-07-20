import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import { canUseRecipesAndCosting, getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  archiveRecipe,
  createMenuPriceDecision,
  getMenuPriceDecisionActionsForStatus,
  getRecipeCostingSummary,
  getRecipeVersionActionsForStatus,
  transitionMenuPriceDecision,
  transitionRecipeVersion
} from "@/server/services/recipes";

export const dynamic = "force-dynamic";

const sections = ["overview", "lines", "workflow", "pricing", "history"] as const;
type DetailSection = (typeof sections)[number];
const modalFooterClass = "sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur";
const primarySubmitClass = "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700";
const dangerSubmitClass = "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-rose-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-rose-700";

async function transitionRecipeVersionAction(formData: FormData) {
  "use server";
  const recipeId = formData.get("recipeId");
  const redirectPath = typeof recipeId === "string" ? `/recipes/${recipeId}` : "/recipes";
  try { await transitionRecipeVersion(formData); } catch (error) { redirect(actionErrorRedirectPath(`${redirectPath}?section=workflow`, error)); }
  redirect(`${redirectPath}?section=workflow`);
}

async function createMenuPriceDecisionAction(formData: FormData) {
  "use server";
  const recipeId = formData.get("recipeId");
  const redirectPath = typeof recipeId === "string" ? `/recipes/${recipeId}` : "/recipes";
  try { await createMenuPriceDecision(formData); } catch (error) { redirect(actionErrorRedirectPath(`${redirectPath}?section=pricing`, error)); }
  redirect(`${redirectPath}?section=pricing`);
}

async function archiveRecipeAction(formData: FormData) {
  "use server";
  const recipeId = formData.get("recipeId");
  const redirectPath = typeof recipeId === "string" ? `/recipes/${recipeId}` : "/recipes";
  try { await archiveRecipe(formData); } catch (error) { redirect(actionErrorRedirectPath(redirectPath, error)); }
  redirect(redirectPath);
}

async function transitionMenuPriceDecisionAction(formData: FormData) {
  "use server";
  const recipeId = formData.get("recipeId");
  const redirectPath = typeof recipeId === "string" ? `/recipes/${recipeId}` : "/recipes";
  try { await transitionMenuPriceDecision(formData); } catch (error) { redirect(actionErrorRedirectPath(`${redirectPath}?section=pricing`, error)); }
  redirect(`${redirectPath}?section=pricing`);
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSection(value: string | undefined): DetailSection {
  return sections.includes(value as DetailSection) ? value as DetailSection : "overview";
}

function money(value: number | null) {
  return value === null ? "Pending" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value);
}

function percent(value: number | null) { return value === null ? "Pending" : `${value.toFixed(2)}%`; }
function dateLabel(value: string | null) { return value ?? "Not set"; }
function timestampLabel(value: string | null) { return value ? new Date(value).toLocaleString() : "Pending"; }

export default async function RecipeDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!canUseRecipesAndCosting(session.permissionCodes)) redirect(getDefaultAppRoute(session.permissionCodes));

  const { id } = await params;
  const recipe = await getRecipeCostingSummary(session, id);
  if (!recipe) notFound();

  const resolvedSearchParams = (await searchParams) ?? {};
  const activeSection = normalizeSection(getParam(resolvedSearchParams, "section"));
  const feedback = getActionFeedback(resolvedSearchParams);
  const canManageRecipe = session.permissionCodes.includes(permissions.recipeManage);
  const canArchiveRecipe = session.permissionCodes.includes(permissions.recipeArchive) && recipe.status !== "ARCHIVED";
  const workflowActions = recipe.versionId && recipe.selectedVersionStatus !== "NO_VERSION"
    ? getRecipeVersionActionsForStatus(recipe.selectedVersionStatus, session.permissionCodes)
    : [];
  const priceActions = recipe.openMenuPriceDecision
    ? getMenuPriceDecisionActionsForStatus(recipe.openMenuPriceDecision.status, session.permissionCodes)
    : [];
  const suggestedMenuPrice = recipe.estimatedServingCost !== null && recipe.targetFoodCostPercent
    ? Number((recipe.estimatedServingCost / (recipe.targetFoodCostPercent / 100)).toFixed(2))
    : recipe.currentMenuPrice;

  const tabItems: Array<{ id: DetailSection; label: string; detail: string }> = [
    { id: "overview", label: "Overview", detail: "Identity and costing" },
    { id: "lines", label: "Lines", detail: `${recipe.lineCount} ingredients` },
    { id: "workflow", label: "Workflow", detail: `${workflowActions.length} actions` },
    { id: "pricing", label: "Pricing", detail: recipe.openMenuPriceDecision ? "Open decision" : "Menu basis" },
    { id: "history", label: "History", detail: `${recipe.versionHistory.length} versions` }
  ];

  return (
    <AppShell session={session} title={recipe.recipeName} subtitle="Recipe costing detail and source trace" activeNav="recipes">
      <ActionFeedbackBanner feedback={feedback} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ButtonLink href="/recipes" tone="ghost" className="ogfi-chip"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to Recipes</ButtonLink>
        <Badge tone={recipe.status === "ACTIVE" ? "success" : "neutral"}>{recipe.status.replaceAll("_", " ").toLowerCase()}</Badge>
        <Badge tone={recipe.selectedVersionStatus === "PUBLISHED" ? "info" : "neutral"}>{recipe.selectedVersionStatus.replaceAll("_", " ").toLowerCase()}</Badge>
        <Badge tone={recipe.costingStatus === "COSTED" ? "success" : "warning"}>{recipe.costingStatus === "COSTED" ? "costed" : `${recipe.pendingCostLineCount} pending cost line(s)`}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {recipe.versionId ? <ButtonLink href={`/recipes/${recipe.id}/revision-template`} tone="ghost" className="ogfi-chip">Export Revision Workbook</ButtonLink> : null}
          {canManageRecipe && recipe.versionId ? <ButtonLink href={`/recipes/${recipe.id}/revise`}>Create Revision Draft</ButtonLink> : null}
          {canArchiveRecipe ? (
            <EntryModal title="Archive Recipe" triggerLabel="Archive Recipe" triggerClassName="border border-rose-200 bg-white text-rose-700 hover:bg-rose-50">
              <form action={archiveRecipeAction} className="ogfi-form-shell mt-4 grid gap-4">
                <input type="hidden" name="recipeId" value={recipe.id} />
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-semibold">Archive with control</p><p className="mt-1 text-xs">Archive is blocked while a draft, review, returned, or approved version is open. Inventory, menu prices, POS, and finance are unchanged.</p></div>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">Archive reason<textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2" name="reason" placeholder="Menu discontinued, recipe replaced, duplicate cleanup..." required /></label>
                <div className={modalFooterClass}><button className={dangerSubmitClass} type="submit">Archive Recipe</button></div>
              </form>
            </EntryModal>
          ) : null}
        </div>
      </div>

      <section className="ogfi-data-surface mb-5 overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs font-bold uppercase text-slate-500">Company</p><p className="mt-1 font-bold text-slate-950">{session.context.companyName}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-500">Brand</p><p className="mt-1 font-bold text-slate-950">{recipe.brandName}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-500">Location context</p><p className="mt-1 font-bold text-slate-950">{session.context.locationName}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-500">Next action / owner</p><p className="mt-1 font-bold text-slate-950">{workflowActions[0]?.label ?? (recipe.selectedVersionStatus === "PUBLISHED" ? "Monitor costing evidence" : "No action for your role")}</p></div>
        </div>
      </section>

      <nav aria-label="Recipe detail sections" className="mb-5 grid gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:grid-cols-2 lg:grid-cols-5">
        {tabItems.map((tab) => <a key={tab.id} href={tab.id === "overview" ? `/recipes/${recipe.id}` : `/recipes/${recipe.id}?section=${tab.id}`} aria-current={activeSection === tab.id ? "page" : undefined} className={activeSection === tab.id ? "rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-blue-800" : "rounded-lg border border-transparent px-3 py-3 text-slate-600 hover:bg-slate-50"}><span className="block text-sm font-bold">{tab.label}</span><span className="mt-1 block text-xs font-semibold text-slate-500">{tab.detail}</span></a>)}
      </nav>

      {activeSection === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <section className="ogfi-data-surface overflow-hidden">
            <div className="ogfi-section-header"><div><h2 className="text-lg font-bold text-slate-950">Recipe overview</h2><p className="text-sm text-slate-500">{recipe.recipeCode} / {recipe.recipeType.replaceAll("_", " ").toLowerCase()} / Version {recipe.versionNo ?? "Pending"}</p></div><Badge tone="info">{recipe.lineCount} lines</Badge></div>
            <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-xs font-bold uppercase text-slate-500">Menu item</dt><dd className="mt-2 font-bold text-slate-950">{recipe.menuItemName ?? "Not linked"}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-slate-500">Yield</dt><dd className="mt-2 font-bold text-slate-950">{recipe.yieldQuantity ?? "-"} {recipe.yieldUomCode ?? ""}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-slate-500">Serving</dt><dd className="mt-2 font-bold text-slate-950">{recipe.servingQuantity ?? "-"} {recipe.servingUomCode ?? ""}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-slate-500">Target food cost</dt><dd className="mt-2 font-bold text-slate-950">{percent(recipe.targetFoodCostPercent)}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-slate-500">Current approver</dt><dd className="mt-2 font-bold text-slate-950">{workflowActions.length > 0 ? "Determined by workflow policy" : "No approval action available"}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-slate-500">Activity / audit</dt><dd className="mt-2 font-bold text-slate-950"><a className="text-blue-700 hover:underline" href={`/recipes/${recipe.id}?section=history`}>View version history</a></dd></div>
            </dl>
            <div className="border-t border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">Recipe publishing changes the costing basis only. It does not post inventory, POS sales, finance, or approval-source records.</div>
          </section>
          <aside className="grid content-start gap-4">
            <Panel className="ogfi-detail-card"><p className="text-xs font-bold uppercase text-slate-500">Recipe cost</p><p className="mt-3 text-2xl font-bold text-blue-700">{money(recipe.estimatedRecipeCost)}</p></Panel>
            <Panel className="ogfi-detail-card"><p className="text-xs font-bold uppercase text-slate-500">Plate cost</p><p className="mt-3 text-2xl font-bold text-slate-950">{money(recipe.estimatedServingCost)}</p></Panel>
            <Panel className="ogfi-detail-card"><p className="text-xs font-bold uppercase text-slate-500">Food cost</p><p className="mt-3 text-2xl font-bold text-emerald-700">{percent(recipe.estimatedFoodCostPercent)}</p><p className="mt-2 text-xs font-semibold text-slate-500">Current price {money(recipe.currentMenuPrice)}</p></Panel>
          </aside>
        </div>
      ) : null}

      {activeSection === "lines" ? (
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header"><div><h2 className="text-lg font-bold text-slate-950">Ingredient lines</h2><p className="text-sm text-slate-500">Supplier price and UOM evidence are shown per line.</p></div><Badge tone="info">{recipe.costedLineCount}/{recipe.lineCount} costed</Badge></div>
          {recipe.lines.length === 0 ? <div className="ogfi-empty-state"><p className="font-semibold text-slate-900">No ingredient lines</p><p className="mt-1 text-sm text-slate-600">Create a revision draft to add controlled ingredient lines.</p></div> : <div className="divide-y divide-slate-100">{recipe.lines.map((line) => <div key={line.id} className="grid gap-2 px-4 py-4 text-sm lg:grid-cols-[4rem_1fr_8rem_9rem_9rem] lg:gap-3"><p className="font-semibold text-slate-500">{line.lineNo}</p><div><p className="font-bold text-slate-950">{line.itemName}</p><p className="text-xs text-slate-500">{line.itemCode} / {line.uomCode}</p>{line.preparationNote ? <p className="mt-1 text-xs font-semibold text-slate-600">{line.preparationNote}</p> : null}</div><p className="font-semibold text-slate-900">{line.quantity} {line.uomCode}</p><p className="text-slate-700">{money(line.latestUnitPrice)}</p><div><p className="font-bold text-slate-950">{money(line.estimatedCost)}</p>{line.costingNote ? <p className="mt-1 text-xs font-semibold text-amber-700">{line.costingNote}</p> : null}</div></div>)}</div>}
        </section>
      ) : null}

      {activeSection === "workflow" ? (
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header"><div><h2 className="text-lg font-bold text-slate-950">Version workflow</h2><p className="text-sm text-slate-500">Version {recipe.versionNo ?? "Pending"} / {recipe.selectedVersionStatus.replaceAll("_", " ").toLowerCase()}</p></div><Badge tone="info">{workflowActions.length} available</Badge></div>
          {workflowActions.length === 0 ? <div className="ogfi-empty-state"><p className="font-semibold text-slate-900">No workflow action is available</p><p className="mt-1 text-sm text-slate-600">The server-side transition policy does not permit an action for your role and this status.</p></div> : <div className="flex flex-wrap gap-3 p-4">{workflowActions.map((action) => <EntryModal key={`${action.action}-${action.fromStatus}`} title={action.label} triggerLabel={action.label}><form action={transitionRecipeVersionAction} className="ogfi-form-shell mt-4 grid gap-4"><input type="hidden" name="recipeId" value={recipe.id} /><input type="hidden" name="recipeVersionId" value={recipe.versionId ?? ""} /><input type="hidden" name="action" value={action.action} /><input type="hidden" name="idempotencyKey" value={`${recipe.versionId}:${action.action}:${action.fromStatus}`} /><div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900"><p className="font-semibold">{action.fromStatus.replaceAll("_", " ").toLowerCase()} to {action.toStatus.replaceAll("_", " ").toLowerCase()}</p><p className="mt-1 text-xs">This writes transition history and audit evidence without mutating inventory, POS, finance, or supplier records.</p></div>{action.requiresReason ? <label className="grid gap-1 text-sm font-semibold text-slate-700">Reason<textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2" name="reason" required /></label> : null}{action.requiresEvidence ? <label className="grid gap-1 text-sm font-semibold text-slate-700">Evidence reference<input className="rounded-lg border border-slate-300 px-3 py-2" name="evidenceReference" required /></label> : null}<div className={modalFooterClass}><button className={primarySubmitClass} type="submit">{action.label}</button></div></form></EntryModal>)}</div>}
        </section>
      ) : null}

      {activeSection === "pricing" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <section className="ogfi-data-surface overflow-hidden">
            <div className="ogfi-section-header"><div><h2 className="text-lg font-bold text-slate-950">Menu price decision</h2><p className="text-sm text-slate-500">Pricing remains a separate controlled decision from recipe publication.</p></div>{recipe.openMenuPriceDecision ? <Badge tone="info">{recipe.openMenuPriceDecision.status.replaceAll("_", " ").toLowerCase()}</Badge> : <Badge tone="neutral">No open decision</Badge>}</div>
            <div className="grid gap-4 p-4 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase text-slate-500">Current menu price</p><p className="mt-2 text-2xl font-bold text-slate-950">{money(recipe.currentMenuPrice)}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Suggested basis</p><p className="mt-2 text-2xl font-bold text-blue-700">{money(suggestedMenuPrice)}</p></div></div>
            {recipe.openMenuPriceDecision ? <div className="border-t border-slate-100 p-4"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-xs font-bold uppercase text-slate-500">Requested price</dt><dd className="mt-1 font-bold text-slate-950">{money(recipe.openMenuPriceDecision.requestedPrice)}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-500">Effective from</dt><dd className="mt-1 font-bold text-slate-950">{recipe.openMenuPriceDecision.effectiveFrom}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-500">Reason</dt><dd className="mt-1 font-bold text-slate-950">{recipe.openMenuPriceDecision.reason ?? "Not recorded"}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2">{priceActions.length === 0 ? <p className="text-sm font-semibold text-slate-500">No action is available for your role and this decision status.</p> : priceActions.map((action) => <EntryModal key={`${action.action}-${action.fromStatus}`} title={action.label} triggerLabel={action.label}><form action={transitionMenuPriceDecisionAction} className="ogfi-form-shell mt-4 grid gap-4"><input type="hidden" name="recipeId" value={recipe.id} /><input type="hidden" name="menuPriceDecisionId" value={recipe.openMenuPriceDecision?.id ?? ""} /><input type="hidden" name="action" value={action.action} /><input type="hidden" name="idempotencyKey" value={`${recipe.openMenuPriceDecision?.id ?? ""}:${action.action}:${action.fromStatus}`} /><div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">Applying inserts a new effective-dated menu price. Recipes, POS sales, inventory, and finance remain unchanged.</div>{action.requiresReason ? <label className="grid gap-1 text-sm font-semibold text-slate-700">Reason<textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2" name="reason" required /></label> : null}{action.requiresEvidence ? <label className="grid gap-1 text-sm font-semibold text-slate-700">Evidence reference<input className="rounded-lg border border-slate-300 px-3 py-2" name="evidenceReference" required /></label> : null}<div className={modalFooterClass}><button className={primarySubmitClass} type="submit">{action.label}</button></div></form></EntryModal>)}</div></div> : null}
          </section>
          <aside><Panel className="ogfi-detail-card"><p className="text-xs font-bold uppercase text-slate-500">Food cost at current price</p><p className="mt-3 text-2xl font-bold text-emerald-700">{percent(recipe.estimatedFoodCostPercent)}</p><p className="mt-2 text-xs font-semibold text-slate-500">Target {percent(recipe.targetFoodCostPercent)}</p>{recipe.menuItemId && !recipe.openMenuPriceDecision ? <div className="mt-4"><EntryModal title="Create Menu Price Decision" triggerLabel="Propose Price" triggerClassName="w-full rounded-md bg-blue-600 text-white hover:bg-blue-700"><form action={createMenuPriceDecisionAction} className="ogfi-form-shell mt-4 grid gap-4"><input type="hidden" name="recipeId" value={recipe.id} /><input type="hidden" name="menuItemId" value={recipe.menuItemId} /><div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">Creates a decision record only. Price changes after review, approval, and apply.</div><label className="grid gap-1 text-sm font-semibold text-slate-700">Requested price<input className="rounded-lg border border-slate-300 px-3 py-2" name="requestedPrice" type="number" step="0.01" min="0.01" defaultValue={suggestedMenuPrice ?? undefined} required /></label><label className="grid gap-1 text-sm font-semibold text-slate-700">Currency<input className="rounded-lg border border-slate-300 px-3 py-2" name="currencyCode" defaultValue="PHP" maxLength={3} required /></label><label className="grid gap-1 text-sm font-semibold text-slate-700">Effective from<input className="rounded-lg border border-slate-300 px-3 py-2" name="effectiveFrom" type="date" required /></label><label className="grid gap-1 text-sm font-semibold text-slate-700">Reason<textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2" name="reason" required /></label><label className="grid gap-1 text-sm font-semibold text-slate-700">Evidence reference<input className="rounded-lg border border-slate-300 px-3 py-2" name="evidenceReference" /></label><div className={modalFooterClass}><button className={primarySubmitClass} type="submit">Create Decision</button></div></form></EntryModal></div> : null}</Panel></aside>
        </div>
      ) : null}

      {activeSection === "history" ? (
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header"><div><h2 className="text-lg font-bold text-slate-950">Version history and audit context</h2><p className="text-sm text-slate-500">Effective dates, approval timestamps, status, and selected costing basis.</p></div><Badge tone="info">{recipe.versionHistory.length} versions</Badge></div>
          {recipe.versionHistory.length === 0 ? <div className="ogfi-empty-state"><p className="font-semibold text-slate-900">No recipe versions found</p><p className="mt-1 text-sm text-slate-600">History appears after controlled versions are created.</p></div> : <div className="divide-y divide-slate-100">{recipe.versionHistory.map((version) => <div key={version.id} className="grid gap-4 px-4 py-4 text-sm lg:grid-cols-[7rem_1fr_12rem_12rem_12rem]"><div><p className="text-xs font-semibold uppercase text-slate-500">Version</p><p className="mt-1 font-bold text-slate-950">v{version.versionNo}</p></div><div><div className="flex flex-wrap gap-2"><Badge tone={version.status === "PUBLISHED" ? "success" : "neutral"}>{version.status.replaceAll("_", " ").toLowerCase()}</Badge>{version.isSelectedCostingVersion ? <Badge tone="info">current costing basis</Badge> : null}</div><p className="mt-2 font-semibold text-slate-700">Yield {version.yieldQuantity ?? "-"} {version.yieldUomCode} / Serving {version.servingQuantity ?? "-"} {version.servingUomCode}</p><p className="mt-1 text-xs text-slate-500">Target food cost {percent(version.targetFoodCostPercent)}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Effective from</p><p className="mt-1 font-bold text-slate-950">{dateLabel(version.effectiveFrom)}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Effective to</p><p className="mt-1 font-bold text-slate-950">{dateLabel(version.effectiveTo)}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Approved</p><p className="mt-1 font-bold text-slate-950">{timestampLabel(version.approvedAt)}</p></div></div>)}</div>}
        </section>
      ) : null}
    </AppShell>
  );
}
