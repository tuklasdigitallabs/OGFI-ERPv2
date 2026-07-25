import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Panel, PaginationBar, WorkspaceTabs } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { ConversionCreateComposer } from "@/components/ConversionCreateComposer";
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
  getItemMasterRecord,
  getItemCategoryRecord,
  getItemUomConversionRecord,
  getUomRecord,
  listItemMasterData,
  listItemMasterOptionCatalog,
  updateItem,
  updateItemCategory,
  updateItemUomConversion,
  updateUom,
  uomTypes
} from "@/server/services/items";

export const dynamic = "force-dynamic";

function itemReturnPath(formData: FormData) {
  const query = new URLSearchParams({ tab: "items" });
  const itemQuery = String(formData.get("returnItemQuery") ?? "").trim().slice(0, 120);
  const itemStatus = String(formData.get("returnItemStatus") ?? "");
  const itemPage = Number(formData.get("returnItemPage") ?? "1");
  const itemId = String(formData.get("returnItemId") ?? "");
  if (itemQuery) query.set("itemQuery", itemQuery);
  if (["ACTIVE", "INACTIVE", "ARCHIVED"].includes(itemStatus)) query.set("itemStatus", itemStatus);
  if (Number.isInteger(itemPage) && itemPage > 0 && itemPage <= 10_000) query.set("itemPage", String(itemPage));
  if (/^[0-9a-f-]{36}$/i.test(itemId)) query.set("itemId", itemId);
  return `/items?${query.toString()}`;
}

function masterTabReturnPath(formData: FormData, tab: "categories" | "uoms") {
  const prefix = tab === "categories" ? "category" : "uom";
  const label = tab === "categories" ? "Category" : "Uom";
  const query = new URLSearchParams({ tab });
  const search = String(formData.get(`return${label}Query`) ?? "").trim().slice(0, 120);
  const status = String(formData.get(`return${label}Status`) ?? "");
  const page = Number(formData.get(`return${label}Page`) ?? "1");
  const id = String(formData.get(`return${label}Id`) ?? "");
  if (search) query.set(`${prefix}Query`, search);
  if (["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) query.set(`${prefix}Status`, status);
  if (Number.isInteger(page) && page > 0 && page <= 10_000) query.set(`${prefix}Page`, String(page));
  if (/^[0-9a-f-]{36}$/i.test(id)) query.set(`${prefix}Id`, id);
  return `/items?${query.toString()}`;
}

function conversionReturnPath(formData: FormData) {
  const query = new URLSearchParams({ tab: "conversions" });
  const search = String(formData.get("returnConversionQuery") ?? "").trim().slice(0, 120);
  const page = Number(formData.get("returnConversionPage") ?? "1");
  const id = String(formData.get("returnConversionId") ?? "");
  if (search) query.set("conversionQuery", search);
  if (Number.isInteger(page) && page > 0 && page <= 10_000) query.set("conversionPage", String(page));
  if (/^[0-9a-f-]{36}$/i.test(id)) query.set("conversionId", id);
  return `/items?${query.toString()}`;
}

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
    redirect(actionErrorRedirectPath(itemReturnPath(formData), error));
  }
  revalidatePath("/items");
  redirect(itemReturnPath(formData));
}

async function deactivateCategoryAction(formData: FormData) {
  "use server";

  try {
    await deactivateItemCategory(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(masterTabReturnPath(formData, "categories"), error));
  }
  revalidatePath("/items");
  redirect(masterTabReturnPath(formData, "categories"));
}

async function deactivateUomAction(formData: FormData) {
  "use server";

  try {
    await deactivateUom(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(masterTabReturnPath(formData, "uoms"), error));
  }
  revalidatePath("/items");
  redirect(masterTabReturnPath(formData, "uoms"));
}

async function updateCategoryAction(formData: FormData) {
  "use server";

  try {
    await updateItemCategory(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(masterTabReturnPath(formData, "categories"), error));
  }
  revalidatePath("/items");
  redirect(masterTabReturnPath(formData, "categories"));
}

async function updateUomAction(formData: FormData) {
  "use server";

  try {
    await updateUom(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(masterTabReturnPath(formData, "uoms"), error));
  }
  revalidatePath("/items");
  redirect(masterTabReturnPath(formData, "uoms"));
}

async function updateItemAction(formData: FormData) {
  "use server";

  try {
    await updateItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(itemReturnPath(formData), error));
  }
  revalidatePath("/items");
  redirect(itemReturnPath(formData));
}

async function updateConversionAction(formData: FormData) {
  "use server";

  try {
    await updateItemUomConversion(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(conversionReturnPath(formData), error));
  }
  revalidatePath("/items");
  redirect(conversionReturnPath(formData));
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

  const params = searchParams ? await searchParams : {};
  const activeTab = normalizeItemMasterTab(params.tab);
  const itemQuery = (Array.isArray(params.itemQuery) ? params.itemQuery[0] : params.itemQuery)?.trim() ?? "";
  const selectedItemId = Array.isArray(params.itemId) ? params.itemId[0] : params.itemId;
  const selectedCategoryId = Array.isArray(params.categoryId) ? params.categoryId[0] : params.categoryId;
  const selectedUomId = Array.isArray(params.uomId) ? params.uomId[0] : params.uomId;
  const selectedConversionId = Array.isArray(params.conversionId) ? params.conversionId[0] : params.conversionId;
  const itemStatusRaw = Array.isArray(params.itemStatus) ? params.itemStatus[0] : params.itemStatus;
  const itemStatus = itemStatusRaw === "ACTIVE" || itemStatusRaw === "INACTIVE" || itemStatusRaw === "ARCHIVED" ? itemStatusRaw : undefined;
  const requestedPage = Number(Array.isArray(params.itemPage) ? params.itemPage[0] : params.itemPage);
  const itemPage = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10_000) : 1;
  const categoryQuery = (Array.isArray(params.categoryQuery) ? params.categoryQuery[0] : params.categoryQuery)?.trim() ?? "";
  const categoryStatusRaw = Array.isArray(params.categoryStatus) ? params.categoryStatus[0] : params.categoryStatus;
  const categoryStatus = categoryStatusRaw === "ACTIVE" || categoryStatusRaw === "INACTIVE" || categoryStatusRaw === "ARCHIVED" ? categoryStatusRaw : undefined;
  const categoryPageValue = Number(Array.isArray(params.categoryPage) ? params.categoryPage[0] : params.categoryPage);
  const categoryPage = Number.isInteger(categoryPageValue) && categoryPageValue > 0 ? Math.min(categoryPageValue, 10_000) : 1;
  const uomQuery = (Array.isArray(params.uomQuery) ? params.uomQuery[0] : params.uomQuery)?.trim() ?? "";
  const uomStatusRaw = Array.isArray(params.uomStatus) ? params.uomStatus[0] : params.uomStatus;
  const uomStatus = uomStatusRaw === "ACTIVE" || uomStatusRaw === "INACTIVE" || uomStatusRaw === "ARCHIVED" ? uomStatusRaw : undefined;
  const uomPageValue = Number(Array.isArray(params.uomPage) ? params.uomPage[0] : params.uomPage);
  const uomPage = Number.isInteger(uomPageValue) && uomPageValue > 0 ? Math.min(uomPageValue, 10_000) : 1;
  const conversionQuery = (Array.isArray(params.conversionQuery) ? params.conversionQuery[0] : params.conversionQuery)?.trim() ?? "";
  const conversionPageValue = Number(Array.isArray(params.conversionPage) ? params.conversionPage[0] : params.conversionPage);
  const conversionPage = Number.isInteger(conversionPageValue) && conversionPageValue > 0 ? Math.min(conversionPageValue, 10_000) : 1;
  const masterData = await listItemMasterData(session, {
    activeTab,
    query: itemQuery,
    status: itemStatus,
    page: itemPage,
    pageSize: 25,
    categoryQuery,
    categoryStatus,
    categoryPage,
    uomQuery,
    uomStatus,
    uomPage,
    conversionQuery,
    conversionPage
  });
  const selectedItem = activeTab === "items" && selectedItemId ? await getItemMasterRecord(session, selectedItemId).catch(() => null) : null;
  const selectedCategory = activeTab === "categories" && selectedCategoryId ? await getItemCategoryRecord(session, selectedCategoryId).catch(() => null) : null;
  const selectedUom = activeTab === "uoms" && selectedUomId ? await getUomRecord(session, selectedUomId).catch(() => null) : null;
  const selectedConversion = activeTab === "conversions" && selectedConversionId ? await getItemUomConversionRecord(session, selectedConversionId).catch(() => null) : null;
  const selectedCategoryIds = [...masterData.items.map((item) => item.itemCategoryId), ...(selectedItem ? [selectedItem.itemCategoryId] : [])];
  const selectedUomIds = [...masterData.items.flatMap((item) => [item.baseUomId, item.purchaseUomId, item.issueUomId].filter((id): id is string => Boolean(id))), ...(selectedItem ? [selectedItem.baseUomId, selectedItem.purchaseUomId, selectedItem.issueUomId].filter((id): id is string => Boolean(id)) : [])];
  const [categoryOptionCatalog, uomOptionCatalog] = activeTab === "items"
    ? await Promise.all([
        listItemMasterOptionCatalog(session, { kind: "category", selectedIds: selectedCategoryIds, page: 1, pageSize: 100 }),
        listItemMasterOptionCatalog(session, { kind: "uom", selectedIds: selectedUomIds, page: 1, pageSize: 100 })
      ])
    : [{ options: [], total: 0, hasMore: false }, { options: [], total: 0, hasMore: false }];
  const activeItems = masterData.itemsPage.activeItems;
  const activeCategories = categoryOptionCatalog.options.filter((category) => category.status === "ACTIVE");
  const activeUoms = uomOptionCatalog.options.filter((uom) => uom.status === "ACTIVE");
  const actionFeedback = getActionFeedback(params);
  const itemActionHref = (itemId?: string) => {
    const query = new URLSearchParams({ tab: "items", itemPage: String(masterData.itemsPage.page) });
    if (itemQuery) query.set("itemQuery", itemQuery);
    if (itemStatus) query.set("itemStatus", itemStatus);
    if (itemId) query.set("itemId", itemId);
    return `/items?${query.toString()}`;
  };
  const categoryActionHref = (categoryId?: string) => {
    const query = new URLSearchParams({ tab: "categories", categoryPage: String(masterData.categoriesPage.page) });
    if (categoryQuery) query.set("categoryQuery", categoryQuery);
    if (categoryStatus) query.set("categoryStatus", categoryStatus);
    if (categoryId) query.set("categoryId", categoryId);
    return `/items?${query.toString()}`;
  };
  const uomActionHref = (uomId?: string) => {
    const query = new URLSearchParams({ tab: "uoms", uomPage: String(masterData.uomsPage.page) });
    if (uomQuery) query.set("uomQuery", uomQuery);
    if (uomStatus) query.set("uomStatus", uomStatus);
    if (uomId) query.set("uomId", uomId);
    return `/items?${query.toString()}`;
  };
  const conversionActionHref = (conversionId?: string) => {
    const query = new URLSearchParams({ tab: "conversions", conversionPage: String(masterData.conversionsPage.page) });
    if (conversionQuery) query.set("conversionQuery", conversionQuery);
    if (conversionId) query.set("conversionId", conversionId);
    return `/items?${query.toString()}`;
  };

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
      <section className="mb-5 grid gap-3">
        <WorkspaceTabs
          ariaLabel="Item Master workspaces"
          className="[&>a]:min-h-11 [&>span]:min-h-11"
          items={itemMasterTabs.map((tab) => ({ label: tab.label, href: `/items?tab=${tab.id}`, active: activeTab === tab.id }))}
        />
        <p className="text-xs text-slate-500">Only the selected Item Master register and its required detail/catalog queries are loaded. Other registers are not loaded in this view.</p>
      </section>
      <Panel className="mb-5 border-slate-200 bg-slate-50">
        <p className="text-sm font-semibold text-slate-700">Current workspace</p>
        <p className="mt-1 text-lg font-bold text-slate-950">{itemMasterTabs.find((tab) => tab.id === activeTab)?.label}</p>
        <p className="mt-1 text-sm text-slate-600">{activeTab === "items" ? `${masterData.itemsPage.totalItems} matching items; ${activeItems} active.` : activeTab === "categories" ? `${masterData.categoriesPage.totalItems} matching categories.` : activeTab === "uoms" ? `${masterData.uomsPage.totalItems} matching units of measure.` : `${masterData.conversionsPage.totalItems} matching conversions.`}</p>
      </Panel>

      <div className="mb-5 flex flex-wrap justify-end gap-2">
        {activeTab === "items" ? (
        <EntryModal
          title="Create Item"
          triggerLabel="Create Item"
          disabled={categoryOptionCatalog.hasMore || uomOptionCatalog.hasMore}
          disabledReason="Item selectors exceed the current bounded option catalog; narrow the catalog or complete the selector migration before creating an item."
        >
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
                      {category.label}
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
                      {uom.code}
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
                      {uom.code}
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
                      {uom.code}
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
        <EntryModal
          title="Create Conversion"
          triggerLabel="Create Conversion"
        >
          <ConversionCreateComposer action={createConversionAction} returnQuery={conversionQuery} returnPage={masterData.conversionsPage.page} {...(selectedConversionId ? { returnId: selectedConversionId } : {})} />
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
          <form method="get" className="mb-4 grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_180px_auto]">
            <input type="hidden" name="tab" value="items" />
            <input className={inputClass} name="itemQuery" defaultValue={itemQuery} placeholder="Search code, name, or category" aria-label="Search items" />
            <select className={inputClass} name="itemStatus" defaultValue={itemStatus ?? ""} aria-label="Filter item status">
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Apply filters</button>
          </form>
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
                    <Link
                      className="inline-flex min-h-10 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50"
                      href={itemActionHref(item.id)}
                    >
                      Open controls
                    </Link>
                  </div>
                </div>
              </details>
            ))}
          </div>
          {selectedItem ? (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-950">Selected item: {selectedItem.itemName}</h3>
                  <p className="text-sm text-slate-600">Edit and lifecycle actions apply only to this selected record.</p>
                </div>
                <Link className="text-sm font-semibold text-blue-700 hover:underline" href={itemActionHref()}>Close controls</Link>
              </div>
              <form action={updateItemAction} className="grid gap-3">
                <input name="itemId" type="hidden" value={selectedItem.id} />
                <input name="returnItemQuery" type="hidden" value={itemQuery} />
                <input name="returnItemStatus" type="hidden" value={itemStatus ?? ""} />
                <input name="returnItemPage" type="hidden" value={String(masterData.itemsPage.page)} />
                <input name="returnItemId" type="hidden" value={selectedItem.id} />
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Item code
                    <input className={`${inputClass} bg-slate-50 text-slate-500`} value={selectedItem.itemCode} disabled />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Item name
                    <input className={inputClass} name="itemName" defaultValue={selectedItem.itemName} required />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Category
                    <select className={inputClass} name="itemCategoryId" defaultValue={selectedItem.itemCategoryId} required>
                      {categoryOptionCatalog.options.map((category) => <option key={category.id} value={category.id}>{category.label} ({category.status})</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Item type
                    <select className={inputClass} name="itemType" defaultValue={selectedItem.itemType} required>
                      {itemTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {(["baseUomId", "purchaseUomId", "issueUomId"] as const).map((name) => (
                    <label key={name} className="grid gap-1 text-sm font-medium text-slate-700">{name === "baseUomId" ? "Base UOM" : name === "purchaseUomId" ? "Purchase UOM" : "Issue UOM"}
                      <select className={inputClass} name={name} defaultValue={selectedItem[name] ?? ""} required={name === "baseUomId"}>
                        {name !== "baseUomId" ? <option value="">None</option> : null}
                        {uomOptionCatalog.options.map((uom) => <option key={uom.id} value={uom.id}>{uom.code} ({uom.status})</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="grid gap-2 text-sm font-medium text-slate-700 md:grid-cols-2">
                  <label className="flex items-center gap-2"><input name="trackInventory" type="checkbox" defaultChecked={selectedItem.trackInventory} /> Track inventory</label>
                  <label className="flex items-center gap-2"><input name="trackExpiry" type="checkbox" defaultChecked={selectedItem.trackExpiry} /> Track expiry</label>
                  <label className="flex items-center gap-2"><input name="trackLot" type="checkbox" defaultChecked={selectedItem.trackLot} /> Track lot</label>
                  <label className="flex items-center gap-2"><input name="requiresReceivingInspection" type="checkbox" defaultChecked={selectedItem.requiresReceivingInspection} /> Receiving inspection</label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input className={`${inputClass} min-w-64`} name="reason" minLength={5} placeholder="Update reason" required />
                  <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">Save Item</button>
                </div>
              </form>
              {selectedItem.status === "ACTIVE" ? (
                <form action={deactivateItemAction} className="mt-4 grid gap-2 border-t border-blue-100 pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <input name="itemId" type="hidden" value={selectedItem.id} />
                  <input name="returnItemQuery" type="hidden" value={itemQuery} />
                  <input name="returnItemStatus" type="hidden" value={itemStatus ?? ""} />
                  <input name="returnItemPage" type="hidden" value={String(masterData.itemsPage.page)} />
                  <input name="returnItemId" type="hidden" value={selectedItem.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Deactivation reason
                    <input className={inputClass} name="reason" minLength={5} required />
                  </label>
                  <button className="min-h-10 rounded-md bg-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-800">Deactivate Item</button>
                </form>
              ) : <p className="mt-4 border-t border-blue-100 pt-4 text-sm text-slate-600">Inactive item: retained history; no lifecycle mutation is available.</p>}
            </div>
          ) : selectedItemId ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The selected item is not available in the current company scope or filtered page.</p>
          ) : null}
          {masterData.itemsPage.totalItems === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{itemQuery || itemStatus ? "No items match the selected filters." : "No item master records yet."}</p>
          ) : null}
          {masterData.itemsPage.totalItems > 0 ? (
            <PaginationBar
              page={masterData.itemsPage.page}
              pageSize={masterData.itemsPage.pageSize}
              totalItems={masterData.itemsPage.totalItems}
              itemLabel="items"
              getPageHref={(nextPage) => {
                const query = new URLSearchParams({ tab: "items", itemPage: String(nextPage) });
                if (itemQuery) query.set("itemQuery", itemQuery);
                if (itemStatus) query.set("itemStatus", itemStatus);
                return `/items?${query.toString()}`;
              }}
            />
          ) : null}
        </Panel>
        ) : null}

        {activeTab === "categories" ? (
        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Categories</h2>
          <p className="text-sm text-slate-500">Grouping rules and default inventory controls</p>
          <form method="get" className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_180px_auto]">
            <input type="hidden" name="tab" value="categories" />
            <input className={inputClass} name="categoryQuery" defaultValue={categoryQuery} placeholder="Search code or name" aria-label="Search categories" />
            <select className={inputClass} name="categoryStatus" defaultValue={categoryStatus ?? ""} aria-label="Filter category status">
              <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option>
            </select>
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Apply filters</button>
          </form>
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
                    <Link className="inline-flex min-h-10 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50" href={categoryActionHref(category.id)}>Open controls</Link>
                    <EntryModal
                      title={`Edit ${category.categoryName}`}
                      triggerClassName={secondaryEditTrigger}
                      triggerLabel="Edit"
                      disabled
                      disabledReason="Use Open controls to edit the selected category."
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
                        disabled
                        disabledReason="Use Open controls to deactivate the selected category."
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
          {selectedCategory ? (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-lg font-bold text-slate-950">Selected category: {selectedCategory.categoryName}</h3><p className="text-sm text-slate-600">Actions apply only to this selected record.</p></div>
                <Link className="text-sm font-semibold text-blue-700 hover:underline" href={categoryActionHref()}>Close controls</Link>
              </div>
              <form action={updateCategoryAction} className="grid gap-3">
                <input name="categoryId" type="hidden" value={selectedCategory.id} />
                <input name="returnCategoryQuery" type="hidden" value={categoryQuery} /><input name="returnCategoryStatus" type="hidden" value={categoryStatus ?? ""} /><input name="returnCategoryPage" type="hidden" value={String(masterData.categoriesPage.page)} /><input name="returnCategoryId" type="hidden" value={selectedCategory.id} />
                <div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700">Category code<input className={`${inputClass} bg-slate-50 text-slate-500`} value={selectedCategory.categoryCode} disabled /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Category name<input className={inputClass} name="categoryName" defaultValue={selectedCategory.categoryName} required /></label></div>
                <label className="grid gap-1 text-sm font-medium text-slate-700">Inventory class<select className={inputClass} name="inventoryClass" defaultValue={selectedCategory.inventoryClass} required>{itemInventoryClasses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
                <div className="grid gap-2 text-sm font-medium text-slate-700 md:grid-cols-3"><label className="flex items-center gap-2"><input name="requiresExpiryTracking" type="checkbox" defaultChecked={selectedCategory.requiresExpiryTracking} /> Requires expiry</label><label className="flex items-center gap-2"><input name="requiresLotTracking" type="checkbox" defaultChecked={selectedCategory.requiresLotTracking} /> Requires lot</label><label className="flex items-center gap-2"><input name="defaultWastageRequiresPhoto" type="checkbox" defaultChecked={selectedCategory.defaultWastageRequiresPhoto} /> Wastage photo</label></div>
                <div className="flex flex-wrap gap-2"><input className={`${inputClass} min-w-64`} name="reason" minLength={5} placeholder="Update reason" required /><button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-bold text-white">Save Category</button></div>
              </form>
              {selectedCategory.status === "ACTIVE" ? <form action={deactivateCategoryAction} className="mt-4 grid gap-2 border-t border-blue-100 pt-4 sm:grid-cols-[1fr_auto] sm:items-end"><input name="categoryId" type="hidden" value={selectedCategory.id} /><input name="returnCategoryQuery" type="hidden" value={categoryQuery} /><input name="returnCategoryStatus" type="hidden" value={categoryStatus ?? ""} /><input name="returnCategoryPage" type="hidden" value={String(masterData.categoriesPage.page)} /><input name="returnCategoryId" type="hidden" value={selectedCategory.id} /><label className="grid gap-1 text-sm font-medium text-slate-700">Deactivation reason<input className={inputClass} name="reason" minLength={5} required /></label><button className="min-h-10 rounded-md bg-slate-700 px-4 text-sm font-bold text-white">Deactivate Category</button></form> : <p className="mt-4 border-t border-blue-100 pt-4 text-sm text-slate-600">Inactive category: retained history.</p>}
            </div>
          ) : selectedCategoryId ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The selected category is unavailable in the current company scope.</p> : null}
          {masterData.categoriesPage.totalItems === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">{categoryQuery || categoryStatus ? "No categories match the selected filters." : "No categories yet."}</p> : null}
          {masterData.categoriesPage.totalItems > 0 ? (
            <PaginationBar
              page={masterData.categoriesPage.page}
              pageSize={masterData.categoriesPage.pageSize}
              totalItems={masterData.categoriesPage.totalItems}
              itemLabel="categories"
              getPageHref={(nextPage) => {
                const query = new URLSearchParams({ tab: "categories", categoryPage: String(nextPage) });
                if (categoryQuery) query.set("categoryQuery", categoryQuery);
                if (categoryStatus) query.set("categoryStatus", categoryStatus);
                return `/items?${query.toString()}`;
              }}
            />
          ) : null}
        </Panel>
        ) : null}

        {activeTab === "uoms" ? (
        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">UOMs</h2>
          <p className="text-sm text-slate-500">
            Units used for purchasing, receiving, stocking, and issuing
          </p>
          <form method="get" className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_180px_auto]">
            <input type="hidden" name="tab" value="uoms" />
            <input className={inputClass} name="uomQuery" defaultValue={uomQuery} placeholder="Search code or name" aria-label="Search UOMs" />
            <select className={inputClass} name="uomStatus" defaultValue={uomStatus ?? ""} aria-label="Filter UOM status">
              <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option>
            </select>
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Apply filters</button>
          </form>
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
                  <Link className="inline-flex min-h-10 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50" href={uomActionHref(uom.id)}>Open controls</Link>
                  <EntryModal
                    title={`Edit ${uom.uomCode}`}
                    triggerClassName={secondaryEditTrigger}
                    triggerLabel="Edit"
                    disabled
                    disabledReason="Use Open controls to edit the selected UOM."
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
                      disabled
                      disabledReason="Use Open controls to deactivate the selected UOM."
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
          {selectedUom ? (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-950">Selected UOM: {selectedUom.uomCode}</h3><p className="text-sm text-slate-600">Actions apply only to this selected record.</p></div><Link className="text-sm font-semibold text-blue-700 hover:underline" href={uomActionHref()}>Close controls</Link></div>
              <form action={updateUomAction} className="grid gap-3">
                <input name="uomId" type="hidden" value={selectedUom.id} /><input name="returnUomQuery" type="hidden" value={uomQuery} /><input name="returnUomStatus" type="hidden" value={uomStatus ?? ""} /><input name="returnUomPage" type="hidden" value={String(masterData.uomsPage.page)} /><input name="returnUomId" type="hidden" value={selectedUom.id} />
                <div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700">UOM code<input className={`${inputClass} bg-slate-50 text-slate-500`} value={selectedUom.uomCode} disabled /></label><label className="grid gap-1 text-sm font-medium text-slate-700">UOM name<input className={inputClass} name="uomName" defaultValue={selectedUom.uomName} required /></label></div>
                <div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700">UOM type<select className={inputClass} name="uomType" defaultValue={selectedUom.uomType} required>{uomTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">Decimal precision<input className={inputClass} name="decimalPrecision" min="0" max="6" type="number" defaultValue={selectedUom.decimalPrecision} required /></label></div>
                <div className="flex flex-wrap gap-2"><input className={`${inputClass} min-w-64`} name="reason" minLength={5} placeholder="Update reason" required /><button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-bold text-white">Save UOM</button></div>
              </form>
              {selectedUom.status === "ACTIVE" ? <form action={deactivateUomAction} className="mt-4 grid gap-2 border-t border-blue-100 pt-4 sm:grid-cols-[1fr_auto] sm:items-end"><input name="uomId" type="hidden" value={selectedUom.id} /><input name="returnUomQuery" type="hidden" value={uomQuery} /><input name="returnUomStatus" type="hidden" value={uomStatus ?? ""} /><input name="returnUomPage" type="hidden" value={String(masterData.uomsPage.page)} /><input name="returnUomId" type="hidden" value={selectedUom.id} /><label className="grid gap-1 text-sm font-medium text-slate-700">Deactivation reason<input className={inputClass} name="reason" minLength={5} required /></label><button className="min-h-10 rounded-md bg-slate-700 px-4 text-sm font-bold text-white">Deactivate UOM</button></form> : <p className="mt-4 border-t border-blue-100 pt-4 text-sm text-slate-600">Inactive UOM: retained history.</p>}
            </div>
          ) : selectedUomId ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The selected UOM is unavailable in the current company scope.</p> : null}
          {masterData.uomsPage.totalItems === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">{uomQuery || uomStatus ? "No UOMs match the selected filters." : "No UOMs yet."}</p> : null}
          {masterData.uomsPage.totalItems > 0 ? (
            <PaginationBar
              page={masterData.uomsPage.page}
              pageSize={masterData.uomsPage.pageSize}
              totalItems={masterData.uomsPage.totalItems}
              itemLabel="UOMs"
              getPageHref={(nextPage) => {
                const query = new URLSearchParams({ tab: "uoms", uomPage: String(nextPage) });
                if (uomQuery) query.set("uomQuery", uomQuery);
                if (uomStatus) query.set("uomStatus", uomStatus);
                return `/items?${query.toString()}`;
              }}
            />
          ) : null}
        </Panel>
        ) : null}

        {activeTab === "conversions" ? (
        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Conversions</h2>
          <p className="text-sm text-slate-500">
            Item-specific unit conversion rules used by purchasing and stock controls
          </p>
          <form method="get" className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_auto]">
            <input type="hidden" name="tab" value="conversions" />
            <input className={inputClass} name="conversionQuery" defaultValue={conversionQuery} placeholder="Search item or UOM" aria-label="Search conversions" />
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Apply filters</button>
          </form>
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
                  <Link className="inline-flex min-h-10 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50" href={conversionActionHref(conversion.id)}>Open controls</Link>
                  <EntryModal
                    title={`Edit ${conversion.itemName} conversion`}
                    triggerClassName={secondaryEditTrigger}
                    triggerLabel="Edit"
                    disabled
                    disabledReason="Use Open controls to edit the selected conversion."
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
          {selectedConversion ? (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-950">Selected conversion: {selectedConversion.item.itemName}</h3><p className="text-sm text-slate-600">{selectedConversion.fromUom.uomCode} → {selectedConversion.toUom.uomCode}; only the factor and rounding rule are editable.</p></div><Link className="text-sm font-semibold text-blue-700 hover:underline" href={conversionActionHref()}>Close controls</Link></div>
              <form action={updateConversionAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <input name="conversionId" type="hidden" value={selectedConversion.id} /><input name="returnConversionQuery" type="hidden" value={conversionQuery} /><input name="returnConversionPage" type="hidden" value={String(masterData.conversionsPage.page)} /><input name="returnConversionId" type="hidden" value={selectedConversion.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">Conversion factor<input className={inputClass} name="conversionFactor" min="0.000001" step="0.000001" type="number" defaultValue={Number(selectedConversion.conversionFactor)} required /></label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">Rounding rule<select className={inputClass} name="roundingRule" defaultValue={selectedConversion.roundingRule} required><option value="none">none</option><option value="up">up</option><option value="down">down</option><option value="nearest">nearest</option></select></label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">Update reason<input className={inputClass} name="reason" minLength={5} required /></label>
                <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-bold text-white md:col-span-3 md:justify-self-start">Save Conversion</button>
              </form>
            </div>
          ) : selectedConversionId ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The selected conversion is unavailable in the current company scope.</p> : null}
          {masterData.conversionsPage.totalItems === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">{conversionQuery ? "No conversions match the selected filters." : "No conversions yet."}</p> : null}
          {masterData.conversionsPage.totalItems > 0 ? (
            <PaginationBar
              page={masterData.conversionsPage.page}
              pageSize={masterData.conversionsPage.pageSize}
              totalItems={masterData.conversionsPage.totalItems}
              itemLabel="conversions"
              getPageHref={(nextPage) => {
                const query = new URLSearchParams({ tab: "conversions", conversionPage: String(nextPage) });
                if (conversionQuery) query.set("conversionQuery", conversionQuery);
                return `/items?${query.toString()}`;
              }}
            />
          ) : null}
        </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
