"use client";

import { useState } from "react";

type ItemOption = { id: string; code: string; name: string };
type UomOption = { id: string; code: string; name: string };
type SubRecipeOption = {
  id: string;
  code: string;
  name: string;
  versionNo: number;
  servingUomCode: string;
};

const inputClass =
  "min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2";

function nextId(ids: number[]) {
  return ids.length === 0 ? 1 : Math.max(...ids) + 1;
}

function AddButton({ disabled, onClick, children }: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="inline-flex min-h-10 items-center justify-center rounded-md border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function IngredientFields({
  id,
  prefix,
  order,
  items,
  uoms,
  onRemove,
  canRemove
}: {
  id: number;
  prefix: "line" | "newLine";
  order: number;
  items: ItemOption[];
  uoms: UomOption[];
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[5rem_1.4fr_8rem_10rem_1fr_auto] md:items-end">
      <legend className="sr-only">Ingredient line {order}</legend>
      {prefix === "newLine" ? (
        <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">
          Order
          <input className={inputClass} name={`${prefix}.${id}.sortOrder`} type="number" min="1" max="100" step="1" defaultValue={order} required />
        </label>
      ) : (
        <p className="pb-2 text-sm font-bold text-slate-500">#{order}</p>
      )}
      <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">
        Ingredient
        <select className={inputClass} name={`${prefix}.${id}.itemId`} defaultValue="" required>
          <option value="" disabled>Select ingredient</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.name} / {item.code}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">
        Quantity
        <input className={inputClass} name={`${prefix}.${id}.quantity`} type="number" min="0.000001" step="0.000001" required />
      </label>
      <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">
        UOM
        <select className={inputClass} name={`${prefix}.${id}.uomId`} defaultValue={uoms[0]?.id ?? ""} required>
          {uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.code} / {uom.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">
        Preparation note
        <input className={inputClass} name={`${prefix}.${id}.preparationNote`} placeholder="Optional" />
      </label>
      <button className="min-h-10 rounded-md border border-rose-200 px-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={!canRemove} onClick={onRemove} type="button">Remove</button>
    </fieldset>
  );
}

export function DraftRecipeLineEditor({ items, uoms, maxLines = 100 }: {
  items: ItemOption[];
  uoms: UomOption[];
  maxLines?: number;
}) {
  const [lineIds, setLineIds] = useState([1]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{lineIds.length} of {maxLines} ingredient lines</p>
        <AddButton disabled={lineIds.length >= maxLines} onClick={() => setLineIds((ids) => [...ids, nextId(ids)])}>Add Ingredient</AddButton>
      </div>
      {lineIds.map((id, index) => (
        <IngredientFields key={id} id={id} prefix="line" order={index + 1} items={items} uoms={uoms} canRemove={lineIds.length > 1} onRemove={() => setLineIds((ids) => ids.filter((candidate) => candidate !== id))} />
      ))}
      {lineIds.length >= maxLines ? <p className="text-sm font-semibold text-amber-700">The 100-line recipe limit has been reached.</p> : null}
    </div>
  );
}

export function RevisionAdditionsEditor({ items, uoms, subRecipes, existingLineCount, maxLines = 100 }: {
  items: ItemOption[];
  uoms: UomOption[];
  subRecipes: SubRecipeOption[];
  existingLineCount: number;
  maxLines?: number;
}) {
  const [ingredientIds, setIngredientIds] = useState<number[]>([]);
  const [subRecipeIds, setSubRecipeIds] = useState<number[]>([]);
  const total = existingLineCount + ingredientIds.length + subRecipeIds.length;
  const atLimit = total >= maxLines;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
        <p className="text-sm font-semibold text-slate-700">{total} of {maxLines} total lines after revision</p>
        {atLimit ? <span className="text-sm font-semibold text-amber-700">Line limit reached</span> : null}
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-950">New ingredients</h3><p className="text-sm text-slate-500">Add only the ingredient rows needed for this revision.</p></div><AddButton disabled={atLimit} onClick={() => setIngredientIds((ids) => [...ids, nextId(ids)])}>Add Ingredient</AddButton></div>
        {ingredientIds.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No new ingredients added.</p> : ingredientIds.map((id, index) => <IngredientFields key={id} id={id} prefix="newLine" order={existingLineCount + index + 1} items={items} uoms={uoms} canRemove onRemove={() => setIngredientIds((ids) => ids.filter((candidate) => candidate !== id))} />)}
      </div>

      <div className="grid gap-3 border-t border-slate-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-950">New sub-recipes</h3><p className="text-sm text-slate-500">Link a published prep or sub-recipe version.</p></div><AddButton disabled={atLimit || subRecipes.length === 0} onClick={() => setSubRecipeIds((ids) => [...ids, nextId(ids)])}>Add Sub-recipe</AddButton></div>
        {subRecipeIds.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No new sub-recipes added.</p> : subRecipeIds.map((id, index) => {
          const order = existingLineCount + ingredientIds.length + index + 1;
          return <fieldset key={id} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[5rem_1.5fr_8rem_1fr_auto] md:items-end"><legend className="sr-only">New sub-recipe line {index + 1}</legend><label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Order<input className={inputClass} name={`newSubRecipe.${id}.sortOrder`} type="number" min="1" max="100" step="1" defaultValue={order} required /></label><label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Sub-recipe<select className={inputClass} name={`newSubRecipe.${id}.subRecipeVersionId`} defaultValue="" required><option value="" disabled>Select sub-recipe</option>{subRecipes.map((subRecipe) => <option key={subRecipe.id} value={subRecipe.id}>{subRecipe.code} / {subRecipe.name} / v{subRecipe.versionNo} / {subRecipe.servingUomCode}</option>)}</select></label><label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Quantity<input className={inputClass} name={`newSubRecipe.${id}.quantity`} type="number" min="0.000001" step="0.000001" required /></label><label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Preparation note<input className={inputClass} name={`newSubRecipe.${id}.preparationNote`} placeholder="Optional" /></label><button className="min-h-10 rounded-md border border-rose-200 px-3 text-sm font-bold text-rose-700 hover:bg-rose-50" onClick={() => setSubRecipeIds((ids) => ids.filter((candidate) => candidate !== id))} type="button">Remove</button></fieldset>;
        })}
      </div>
    </div>
  );
}
