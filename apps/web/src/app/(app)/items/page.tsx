import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  createItem,
  createItemCategory,
  createItemUomConversion,
  createUom,
  deactivateItem,
  deactivateItemCategory,
  deactivateUom,
  itemInventoryClasses,
  itemTypes,
  listItemMasterData,
  updateItem,
  updateItemCategory,
  updateItemUomConversion,
  updateUom,
  uomTypes
} from "@/server/services/items";
import { ItemMasterSearch } from "@/components/ItemMasterSearch";

export const dynamic = "force-dynamic";

async function createCategoryAction(formData: FormData) {
  "use server";

  try {
    await createItemCategory(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=categories", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=categories");
}

async function createUomAction(formData: FormData) {
  "use server";

  try {
    await createUom(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=uoms", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=uoms");
}

async function createItemAction(formData: FormData) {
  "use server";

  try {
    await createItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=items", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=items");
}

async function createConversionAction(formData: FormData) {
  "use server";

  try {
    await createItemUomConversion(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=conversions", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=conversions");
}

async function deactivateItemAction(formData: FormData) {
  "use server";

  try {
    await deactivateItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=items", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=items");
}

async function deactivateCategoryAction(formData: FormData) {
  "use server";

  try {
    await deactivateItemCategory(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=categories", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=categories");
}

async function deactivateUomAction(formData: FormData) {
  "use server";

  try {
    await deactivateUom(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=uoms", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=uoms");
}

async function updateCategoryAction(formData: FormData) {
  "use server";

  try {
    await updateItemCategory(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=categories", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=categories");
}

async function updateUomAction(formData: FormData) {
  "use server";

  try {
    await updateUom(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=uoms", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=uoms");
}

async function updateItemAction(formData: FormData) {
  "use server";

  try {
    await updateItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=items", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=items");
}

async function updateConversionAction(formData: FormData) {
  "use server";

  try {
    await updateItemUomConversion(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/items?tab=conversions", error));
  }
  revalidatePath("/items");
  redirect("/items?tab=conversions");
}

type ItemsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ItemMasterTab = "items" | "categories" | "uoms" | "conversions";

const itemMasterTabs: Array<{
  id: ItemMasterTab;
  label: string;
  detail: string;
}> = [
  { id: "items", label: "Items", detail: "Inventory and purchasing item records" },
  { id: "categories", label: "Categories", detail: "Item grouping and default controls" },
  { id: "uoms", label: "UOMs", detail: "Units used in purchasing, stocking, and issuing" },
  { id: "conversions", label: "Conversions", detail: "Item-specific UOM conversion rules" }
];

function normalizeItemMasterTab(value: string | string[] | undefined): ItemMasterTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return itemMasterTabs.some((tab) => tab.id === raw) ? (raw as ItemMasterTab) : "items";
}

const secondaryDangerTrigger =
  "ogfi-mobile-action bg-white px-3 text-slate-700 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-700";
const secondaryEditTrigger =
  "ogfi-mobile-action bg-white px-3 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50";
const inputClass = "rounded-md border border-slate-300 px-3 py-2";

export default async function ItemsPage({ searchParams }: ItemsPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const masterData = await listItemMasterData(session);
  const activeItems = masterData.items.filter((item) => item.status === "ACTIVE").length;
  const activeCategories = masterData.categories.filter(
    (category) => category.status === "ACTIVE"
  );
  const activeUoms = masterData.uoms.filter((uom) => uom.status === "ACTIVE");
  const activeMasterItems = masterData.items.filter((item) => item.status === "ACTIVE");
  const params = searchParams ? await searchParams : {};
  const activeTab = normalizeItemMasterTab(params.tab);
  const actionFeedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Item Master"
      subtitle="Categories, UOMs, items, and conversions"
      activeNav="items"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Item master changes are governed setup data.</strong> Categories,
              UOMs, conversions, and item controls require reasons and do not post stock
              or rewrite historical transactions.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Inventory effects still come only from approved receiving, transfers,
              counts, wastage, and adjustment workflows.
            </p>
          </div>
          <span>Master data</span>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card min-w-0 overflow-hidden [&_*]:min-w-0 [&_button]:max-w-full [&_input]:w-full [&_select]:w-full [&_textarea]:w-full">
          <p className="text-sm font-semibold text-slate-500">Items</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{masterData.items.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card min-w-0 overflow-hidden [&_*]:min-w-0 [&_button]:max-w-full [&_input]:w-full [&_select]:w-full [&_textarea]:w-full">
          <p className="text-sm font-semibold text-slate-500">Active items</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{activeItems}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Categories</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{masterData.categories.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">UOMs</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{masterData.uoms.length}</p>
        </Panel>
      </div>

      <div className="ogfi-data-surface mb-5 p-2">
        <div className="grid gap-2 lg:grid-cols-4">
          {itemMasterTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <a
                key={tab.id}
                className={
                  active
                    ? "rounded-xl bg-blue-50 px-4 py-3 text-blue-700 ring-1 ring-blue-100"
                    : "rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }
                href={`/items?tab=${tab.id}`}
              >
                <span className="block text-sm font-bold">{tab.label}</span>
                <span className="mt-1 block text-xs text-slate-500">{tab.detail}</span>
              </a>
            );
          })}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap justify-end gap-2">
        {activeTab === "items" ? (
        <EntryModal title="Create Item" triggerLabel="Create Item">
          <form action={createItemAction} className="ogfi-form-shell mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Item code
                <input className="rounded-md border border-slate-300 px-3 py-2" name="itemCode" required />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Item name
                <input className="rounded-md border border-slate-300 px-3 py-2" name="itemName" required />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Category
                <select className="rounded-md border border-slate-300 px-3 py-2" name="itemCategoryId" required>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.categoryName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Item type
                <select className="rounded-md border border-slate-300 px-3 py-2" name="itemType" defaultValue="inventory" required>
                  {itemTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Base UOM
                <select className="rounded-md border border-slate-300 px-3 py-2" name="baseUomId" required>
                  {activeUoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.uomCode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Purchase UOM
                <select className="rounded-md border border-slate-300 px-3 py-2" name="purchaseUomId">
                  <option value="">None</option>
                  {activeUoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.uomCode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Issue UOM
                <select className="rounded-md border border-slate-300 px-3 py-2" name="issueUomId">
                  <option value="">None</option>
                  {activeUoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.uomCode}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-2 text-sm font-medium text-slate-700 md:grid-cols-2">
              <label className="flex items-center gap-2">
                <input name="trackInventory" type="checkbox" defaultChecked /> Track inventory
              </label>
              <label className="flex items-center gap-2">
                <input name="trackExpiry" type="checkbox" /> Track expiry
              </label>
              <label className="flex items-center gap-2">
                <input name="trackLot" type="checkbox" /> Track lot
              </label>
              <label className="flex items-center gap-2">
                <input name="requiresReceivingInspection" type="checkbox" /> Receiving inspection
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Creation reason
              <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" minLength={5} required />
            </label>
            <button className="inline-flex ogfi-mobile-action items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Create Item
            </button>
          </form>
        </EntryModal>
        ) : null}
        {activeTab === "categories" ? (
        <EntryModal title="Create Category" triggerLabel="Create Category">
          <form action={createCategoryAction} className="ogfi-form-shell mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input aria-label="Category code" className="rounded-md border border-slate-300 px-3 py-2" name="categoryCode" placeholder="Category code" required />
              <input aria-label="Category name" className="rounded-md border border-slate-300 px-3 py-2" name="categoryName" placeholder="Category name" required />
            </div>
            <select aria-label="Inventory class" className="rounded-md border border-slate-300 px-3 py-2" name="inventoryClass" defaultValue="RAW_MATERIAL" required>
              {itemInventoryClasses.map((inventoryClass) => (
                <option key={inventoryClass} value={inventoryClass}>
                  {inventoryClass.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <div className="grid gap-2 text-sm font-medium text-slate-700 md:grid-cols-2">
              <label className="flex items-center gap-2">
                <input name="requiresExpiryTracking" type="checkbox" /> Requires expiry tracking
              </label>
              <label className="flex items-center gap-2">
                <input name="requiresLotTracking" type="checkbox" /> Requires lot tracking
              </label>
              <label className="flex items-center gap-2">
                <input name="defaultWastageRequiresPhoto" type="checkbox" /> Wastage photo default
              </label>
            </div>
            <input aria-label="Category creation reason" className="rounded-md border border-slate-300 px-3 py-2" name="reason" placeholder="Creation reason" required />
            <button className="inline-flex ogfi-mobile-action items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Create Category
            </button>
          </form>
        </EntryModal>
        ) : null}
        {activeTab === "uoms" ? (
        <EntryModal title="Create UOM" triggerLabel="Create UOM">
          <form action={createUomAction} className="ogfi-form-shell mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input aria-label="UOM code" className="rounded-md border border-slate-300 px-3 py-2" name="uomCode" placeholder="UOM code" required />
              <input aria-label="UOM name" className="rounded-md border border-slate-300 px-3 py-2" name="uomName" placeholder="UOM name" required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <select aria-label="UOM type" className="rounded-md border border-slate-300 px-3 py-2" name="uomType" defaultValue="count" required>
                {uomTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input aria-label="Decimal precision" className="rounded-md border border-slate-300 px-3 py-2" name="decimalPrecision" min="0" max="6" type="number" defaultValue="0" required />
            </div>
            <input aria-label="UOM creation reason" className="rounded-md border border-slate-300 px-3 py-2" name="reason" placeholder="Creation reason" required />
            <button className="inline-flex ogfi-mobile-action items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Create UOM
            </button>
          </form>
        </EntryModal>
        ) : null}
        {activeTab === "conversions" ? (
        <EntryModal title="Create Conversion" triggerLabel="Create Conversion">
          <form action={createConversionAction} className="ogfi-form-shell mt-4 grid gap-3">
            <select className="rounded-md border border-slate-300 px-3 py-2" name="itemId" required>
              {activeMasterItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.itemName}
                </option>
              ))}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              <select className="rounded-md border border-slate-300 px-3 py-2" name="fromUomId" required>
                {activeUoms.map((uom) => (
                  <option key={uom.id} value={uom.id}>
                    From {uom.uomCode}
                  </option>
                ))}
              </select>
              <select className="rounded-md border border-slate-300 px-3 py-2" name="toUomId" required>
                {activeUoms.map((uom) => (
                  <option key={uom.id} value={uom.id}>
                    To {uom.uomCode}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input aria-label="Conversion factor" className="rounded-md border border-slate-300 px-3 py-2" name="conversionFactor" min="0.000001" step="0.000001" type="number" placeholder="Conversion factor" required />
              <select className="rounded-md border border-slate-300 px-3 py-2" name="roundingRule" defaultValue="none" required>
                <option value="none">none</option>
                <option value="up">up</option>
                <option value="down">down</option>
                <option value="nearest">nearest</option>
              </select>
            </div>
            <input aria-label="Conversion creation reason" className="rounded-md border border-slate-300 px-3 py-2" name="reason" placeholder="Creation reason" required />
            <button className="inline-flex ogfi-mobile-action items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Create Conversion
            </button>
          </form>
        </EntryModal>
        ) : null}
      </div>

      <div className="grid gap-4">
        {activeTab === "items" ? (
        <Panel className="ogfi-detail-card min-w-0 overflow-hidden">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Items</h2>
              <p className="text-sm text-slate-500">Company-scoped inventory master records</p>
            </div>
            <Badge tone="info">Not yet transactional</Badge>
          </div>
          <ItemMasterSearch scopeId="items" />
          <div className="hidden grid-cols-[1fr_1.1fr_1fr_1fr_1.1fr] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-400 md:grid">
            <span>Code</span>
            <span>Item</span>
            <span>Controls</span>
            <span>Status</span>
            <span>Lifecycle</span>
          </div>
          <div className="divide-y divide-slate-100">
            {masterData.items.map((item) => (
              <details
                key={item.id}
                data-master-scope="items"
                data-searchable={`${item.itemCode} ${item.itemName} ${item.itemType} ${item.categoryName} ${item.baseUomCode} ${item.purchaseUomCode ?? ""} ${item.issueUomCode ?? ""} ${item.status}`}
                data-status={item.status}
                data-testid="item-row"
                className="group"
              >
                <summary className="grid cursor-pointer list-none gap-3 px-4 py-4 hover:bg-slate-50 md:grid-cols-[1fr_1.1fr_1fr_1fr_1.1fr] md:items-center [&::-webkit-details-marker]:hidden">
                  <div>
                    <p className="font-bold text-slate-950">{item.itemCode}</p>
                    <p className="text-xs text-slate-500">{item.itemType}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{item.itemName}</p>
                    <p className="text-xs text-slate-500">
                      {item.categoryName} / Base {item.baseUomCode}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.trackInventory ? <Badge tone="info">Inventory</Badge> : null}
                    {item.trackExpiry ? <Badge tone="warning">Expiry</Badge> : null}
                    {item.trackLot ? <Badge tone="warning">Lot</Badge> : null}
                    {item.requiresReceivingInspection ? <Badge>Inspect</Badge> : null}
                  </div>
                  <Badge tone={item.status === "ACTIVE" ? "success" : "neutral"}>{item.status}</Badge>
                  <span className="text-sm font-semibold text-slate-500 group-open:text-blue-700">
                    {item.status === "ACTIVE" ? "Open actions" : "Retained history"}
                  </span>
                </summary>
                <div className="grid gap-3 bg-slate-50/70 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="text-sm text-slate-600">
                    <p>Purchase UOM: {item.purchaseUomCode ?? "None"}</p>
                    <p>Issue UOM: {item.issueUomCode ?? "None"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <EntryModal
                      title={`Edit ${item.itemName}`}
                      triggerClassName={secondaryEditTrigger}
                      triggerLabel="Edit"
                    >
                      <form action={updateItemAction} className="ogfi-form-shell mt-4 grid gap-3">
                        <input name="itemId" type="hidden" value={item.id} />
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Item code
                            <input className={`${inputClass} bg-slate-50 text-slate-500`} value={item.itemCode} disabled />
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Item name
                            <input className={inputClass} name="itemName" defaultValue={item.itemName} required />
                          </label>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Category
                            <select className={inputClass} name="itemCategoryId" defaultValue={item.itemCategoryId} required>
                              {masterData.categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.categoryName} ({category.status})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Item type
                            <select className={inputClass} name="itemType" defaultValue={item.itemType} required>
                              {itemTypes.map((type) => (
                                <option key={type} value={type}>
                                  {type.replaceAll("_", " ")}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Base UOM
                            <select className={inputClass} name="baseUomId" defaultValue={item.baseUomId} required>
                              {masterData.uoms.map((uom) => (
                                <option key={uom.id} value={uom.id}>
                                  {uom.uomCode} ({uom.status})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Purchase UOM
                            <select className={inputClass} name="purchaseUomId" defaultValue={item.purchaseUomId ?? ""}>
                              <option value="">None</option>
                              {masterData.uoms.map((uom) => (
                                <option key={uom.id} value={uom.id}>
                                  {uom.uomCode} ({uom.status})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Issue UOM
                            <select className={inputClass} name="issueUomId" defaultValue={item.issueUomId ?? ""}>
                              <option value="">None</option>
                              {masterData.uoms.map((uom) => (
                                <option key={uom.id} value={uom.id}>
                                  {uom.uomCode} ({uom.status})
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="grid gap-2 text-sm font-medium text-slate-700 md:grid-cols-2">
                          <label className="flex items-center gap-2">
                            <input name="trackInventory" type="checkbox" defaultChecked={item.trackInventory} /> Track inventory
                          </label>
                          <label className="flex items-center gap-2">
                            <input name="trackExpiry" type="checkbox" defaultChecked={item.trackExpiry} /> Track expiry
                          </label>
                          <label className="flex items-center gap-2">
                            <input name="trackLot" type="checkbox" defaultChecked={item.trackLot} /> Track lot
                          </label>
                          <label className="flex items-center gap-2">
                            <input name="requiresReceivingInspection" type="checkbox" defaultChecked={item.requiresReceivingInspection} /> Receiving inspection
                          </label>
                        </div>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Update reason
                          <input className={inputClass} name="reason" minLength={5} required />
                        </label>
                        <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 sm:w-fit">
                          Save Item
                        </button>
                      </form>
                    </EntryModal>
                    {item.status === "ACTIVE" ? (
                      <EntryModal
                        title="Deactivate Item"
                        triggerClassName={secondaryDangerTrigger}
                        triggerLabel="Deactivate"
                      >
                        <form action={deactivateItemAction} className="ogfi-form-shell mt-4 grid gap-3">
                          <input name="itemId" type="hidden" value={item.id} />
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Item deactivation reason
                            <input className={`${inputClass} text-sm`} name="reason" minLength={5} required />
                          </label>
                          <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-700 px-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-fit">
                            Deactivate Item
                          </button>
                        </form>
                      </EntryModal>
                    ) : null}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </Panel>
        ) : null}

        {activeTab === "categories" ? (
        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Categories</h2>
          <p className="text-sm text-slate-500">Grouping rules and default inventory controls</p>
          <ItemMasterSearch scopeId="categories" />
          <div className="mt-4 divide-y divide-slate-100">
            {masterData.categories.map((category) => (
              <details
                key={category.id}
                data-master-scope="categories"
                data-searchable={`${category.categoryCode} ${category.categoryName} ${category.inventoryClass} ${category.status}`}
                data-status={category.status}
                data-testid="item-category-row"
                className="group"
              >
                <summary className="grid cursor-pointer list-none gap-2 py-4 hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                  <div>
                    <p className="font-semibold text-slate-950">{category.categoryName}</p>
                    <p className="text-xs text-slate-500">
                      {category.categoryCode} / {category.inventoryClass}
                    </p>
                    <div className="mt-2">
                      <Badge tone={category.status === "ACTIVE" ? "success" : "neutral"}>{category.status}</Badge>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-slate-500 group-open:text-blue-700">
                    Open actions
                  </span>
                </summary>
                <div className="grid gap-3 rounded-xl bg-slate-50/70 p-4 sm:grid-cols-[1fr_auto]">
                  <div className="flex flex-wrap gap-2">
                    {category.requiresExpiryTracking ? <Badge tone="warning">Expiry default</Badge> : null}
                    {category.requiresLotTracking ? <Badge tone="warning">Lot default</Badge> : null}
                    {category.defaultWastageRequiresPhoto ? <Badge tone="info">Wastage photo</Badge> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <EntryModal
                      title={`Edit ${category.categoryName}`}
                      triggerClassName={secondaryEditTrigger}
                      triggerLabel="Edit"
                    >
                      <form action={updateCategoryAction} className="ogfi-form-shell mt-4 grid gap-3">
                        <input name="categoryId" type="hidden" value={category.id} />
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Category code
                            <input className={`${inputClass} bg-slate-50 text-slate-500`} value={category.categoryCode} disabled />
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Category name
                            <input className={inputClass} name="categoryName" defaultValue={category.categoryName} required />
                          </label>
                        </div>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Inventory class
                          <select className={inputClass} name="inventoryClass" defaultValue={category.inventoryClass} required>
                            {itemInventoryClasses.map((inventoryClass) => (
                              <option key={inventoryClass} value={inventoryClass}>
                                {inventoryClass.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid gap-2 text-sm font-medium text-slate-700 md:grid-cols-2">
                          <label className="flex items-center gap-2">
                            <input name="requiresExpiryTracking" type="checkbox" defaultChecked={category.requiresExpiryTracking} /> Requires expiry tracking
                          </label>
                          <label className="flex items-center gap-2">
                            <input name="requiresLotTracking" type="checkbox" defaultChecked={category.requiresLotTracking} /> Requires lot tracking
                          </label>
                          <label className="flex items-center gap-2">
                            <input name="defaultWastageRequiresPhoto" type="checkbox" defaultChecked={category.defaultWastageRequiresPhoto} /> Wastage photo default
                          </label>
                        </div>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Update reason
                          <input className={inputClass} name="reason" minLength={5} required />
                        </label>
                        <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 sm:w-fit">
                          Save Category
                        </button>
                      </form>
                    </EntryModal>
                    {category.status === "ACTIVE" ? (
                      <EntryModal
                        title="Deactivate Category"
                        triggerClassName={secondaryDangerTrigger}
                        triggerLabel="Deactivate"
                      >
                        <form action={deactivateCategoryAction} className="ogfi-form-shell mt-4 grid gap-3">
                          <input name="categoryId" type="hidden" value={category.id} />
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Category deactivation reason
                            <input className={`${inputClass} text-sm`} name="reason" minLength={5} required />
                          </label>
                          <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-700 px-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-fit">
                            Deactivate Category
                          </button>
                        </form>
                      </EntryModal>
                    ) : null}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </Panel>
        ) : null}

        {activeTab === "uoms" ? (
        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">UOMs</h2>
          <p className="text-sm text-slate-500">
            Units used for purchasing, receiving, stocking, and issuing
          </p>
          <ItemMasterSearch scopeId="uoms" />
          <div className="ogfi-form-shell mt-4 grid gap-3">
            {masterData.uoms.map((uom) => (
              <details
                key={uom.id}
                data-master-scope="uoms"
                data-searchable={`${uom.uomCode} ${uom.uomName} ${uom.uomType} precision ${uom.decimalPrecision} ${uom.status}`}
                data-status={uom.status}
                data-testid="uom-row"
                className="group rounded-lg border border-slate-200"
              >
                <summary className="grid cursor-pointer list-none gap-2 p-3 hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                  <div>
                    <p className="font-semibold text-slate-950">{uom.uomCode}</p>
                    <p className="text-xs text-slate-500">
                      {uom.uomName} / {uom.uomType} / precision {uom.decimalPrecision}
                    </p>
                    <div className="mt-2">
                      <Badge tone={uom.status === "ACTIVE" ? "success" : "neutral"}>{uom.status}</Badge>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-slate-500 group-open:text-blue-700">
                    Open actions
                  </span>
                </summary>
                <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/70 p-3 sm:justify-end">
                  <EntryModal
                    title={`Edit ${uom.uomCode}`}
                    triggerClassName={secondaryEditTrigger}
                    triggerLabel="Edit"
                  >
                    <form action={updateUomAction} className="ogfi-form-shell mt-4 grid gap-3">
                      <input name="uomId" type="hidden" value={uom.id} />
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          UOM code
                          <input className={`${inputClass} bg-slate-50 text-slate-500`} value={uom.uomCode} disabled />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          UOM name
                          <input className={inputClass} name="uomName" defaultValue={uom.uomName} required />
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          UOM type
                          <select className={inputClass} name="uomType" defaultValue={uom.uomType} required>
                            {uomTypes.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Decimal precision
                          <input className={inputClass} name="decimalPrecision" min="0" max="6" type="number" defaultValue={uom.decimalPrecision} required />
                        </label>
                      </div>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Update reason
                        <input className={inputClass} name="reason" minLength={5} required />
                      </label>
                      <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 sm:w-fit">
                        Save UOM
                      </button>
                    </form>
                  </EntryModal>
                  {uom.status === "ACTIVE" ? (
                    <EntryModal
                      title="Deactivate UOM"
                      triggerClassName={secondaryDangerTrigger}
                      triggerLabel="Deactivate"
                    >
                      <form action={deactivateUomAction} className="ogfi-form-shell mt-4 grid gap-3">
                        <input name="uomId" type="hidden" value={uom.id} />
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          UOM deactivation reason
                          <input className={`${inputClass} text-sm`} name="reason" minLength={5} required />
                        </label>
                        <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-700 px-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-fit">
                          Deactivate UOM
                        </button>
                      </form>
                    </EntryModal>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </Panel>
        ) : null}

        {activeTab === "conversions" ? (
        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Conversions</h2>
          <p className="text-sm text-slate-500">
            Item-specific unit conversion rules used by purchasing and stock controls
          </p>
          <ItemMasterSearch scopeId="conversions" />
          <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-4">
            {masterData.conversions.map((conversion) => (
              <details
                key={conversion.id}
                data-master-scope="conversions"
                data-searchable={`${conversion.itemName} ${conversion.fromUomCode} ${conversion.toUomCode} ${conversion.conversionFactor} ${conversion.roundingRule}`}
                data-status="ACTIVE"
                data-testid="conversion-row"
                className="group"
              >
                <summary className="grid cursor-pointer list-none gap-2 py-4 hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                  <div>
                    <p className="font-semibold text-slate-950">{conversion.itemName}</p>
                    <p className="text-xs text-slate-500">
                      1 {conversion.fromUomCode} = {conversion.conversionFactor} {conversion.toUomCode} / {conversion.roundingRule}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-500 group-open:text-blue-700">
                    Open actions
                  </span>
                </summary>
                <div className="flex flex-wrap justify-end gap-2 rounded-xl bg-slate-50/70 p-4">
                  <EntryModal
                    title={`Edit ${conversion.itemName} conversion`}
                    triggerClassName={secondaryEditTrigger}
                    triggerLabel="Edit"
                  >
                    <form action={updateConversionAction} className="ogfi-form-shell mt-4 grid gap-3">
                      <input name="conversionId" type="hidden" value={conversion.id} />
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Item
                          <input className={`${inputClass} bg-slate-50 text-slate-500`} value={conversion.itemName} disabled />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          From UOM
                          <input className={`${inputClass} bg-slate-50 text-slate-500`} value={conversion.fromUomCode} disabled />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          To UOM
                          <input className={`${inputClass} bg-slate-50 text-slate-500`} value={conversion.toUomCode} disabled />
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Conversion factor
                          <input className={inputClass} name="conversionFactor" min="0.000001" step="0.000001" type="number" defaultValue={conversion.conversionFactor} required />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Rounding rule
                          <select className={inputClass} name="roundingRule" defaultValue={conversion.roundingRule} required>
                            <option value="none">none</option>
                            <option value="up">up</option>
                            <option value="down">down</option>
                            <option value="nearest">nearest</option>
                          </select>
                        </label>
                      </div>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Update reason
                        <input className={inputClass} name="reason" minLength={5} required />
                      </label>
                      <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 sm:w-fit">
                        Save Conversion
                      </button>
                    </form>
                  </EntryModal>
                </div>
              </details>
            ))}
          </div>
        </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
