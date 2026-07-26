import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertDistinctConversionUoms,
  assertBaseUomChangeAllowed,
  assertNoActiveMasterDataDependents,
  assertNoDuplicateMasterCode,
  itemInventoryClasses,
  itemTypes,
  uomTypes
} from "./items";

describe("item master-data controls", () => {
  test("duplicate master codes are rejected with the configured error", () => {
    expect(() =>
      assertNoDuplicateMasterCode("existing-category", "DUPLICATE_ITEM_CATEGORY_CODE")
    ).toThrow("DUPLICATE_ITEM_CATEGORY_CODE");
    expect(() =>
      assertNoDuplicateMasterCode(undefined, "DUPLICATE_ITEM_CATEGORY_CODE")
    ).not.toThrow();
  });

  test("UOM conversions must use distinct source and target units", () => {
    expect(() => assertDistinctConversionUoms("uom-1", "uom-1")).toThrow(
      "INVALID_UOM_CONVERSION"
    );
    expect(() => assertDistinctConversionUoms("uom-1", "uom-2")).not.toThrow();
  });

  test("base UOM changes are blocked after posted movement history", () => {
    expect(() => assertBaseUomChangeAllowed("uom-1", "uom-1", 4)).not.toThrow();
    expect(() => assertBaseUomChangeAllowed("uom-1", "uom-2", 0)).not.toThrow();
    expect(() => assertBaseUomChangeAllowed("uom-1", "uom-2", 1)).toThrow(
      "BASE_UOM_CHANGE_REQUIRES_MIGRATION"
    );
  });

  test("master-data deactivation blocks active dependents", () => {
    expect(() =>
      assertNoActiveMasterDataDependents(1, "ITEM_CATEGORY_HAS_ACTIVE_ITEMS")
    ).toThrow("ITEM_CATEGORY_HAS_ACTIVE_ITEMS");
    expect(() =>
      assertNoActiveMasterDataDependents(0, "ITEM_CATEGORY_HAS_ACTIVE_ITEMS")
    ).not.toThrow();
  });

  test("item setup writes are admin scoped, transactional, and audited", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");

    expect(source).toContain("requirePermission(session, permissions.coreAdminister)");
    expect(source).toContain(
      "assertCanManageCompanyScope(session, session.context.companyId)"
    );
    expect(source).toContain("tenantId: session.context.tenantId");
    expect(source).toContain("companyId: session.context.companyId");
    expect(source).toContain("prisma.$transaction");
    expect(source).toContain("assertBaseUomChangeAllowed");
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("tx.auditEvent.create");
    for (const eventType of [
      "item_category.created",
      "uom.created",
      "item.created",
      "item_uom_conversion.created",
      "item.deactivated",
      "item_category.deactivated",
      "uom.deactivated"
    ]) {
      expect(source).toContain(`eventType: "${eventType}"`);
    }
  });

  test("item writes and parent deactivation share scoped lifecycle locks", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");
    const parentLock = source.slice(
      source.indexOf("async function lockActiveItemParents"),
      source.indexOf("async function assertAdminCanManageMasterData")
    );
    const createItemSource = source.slice(
      source.indexOf("export async function createItem("),
      source.indexOf("export async function createItemUomConversion")
    );
    const updateItemSource = source.slice(
      source.indexOf("export async function updateItem("),
      source.indexOf("export async function updateItemUomConversion")
    );
    const deactivateCategorySource = source.slice(
      source.indexOf("export async function deactivateItemCategory"),
      source.indexOf("export async function deactivateUom")
    );
    const deactivateUomSource = source.slice(
      source.indexOf("export async function deactivateUom")
    );

    expect(parentLock).toContain('FROM "ItemCategory"');
    expect(parentLock).toContain('FROM "Uom"');
    expect(parentLock).toContain('"tenantId" = ${session.context.tenantId}::uuid');
    expect(parentLock).toContain('"companyId" = ${session.context.companyId}::uuid');
    expect(parentLock).toContain(".sort()");
    expect(parentLock.match(/^\s+FOR UPDATE$/gm)).toHaveLength(2);
    expect(parentLock).toContain('category.status !== "ACTIVE"');
    expect(parentLock).toContain('uom.status === "ACTIVE"');

    expect(createItemSource.indexOf("prisma.$transaction")).toBeLessThan(
      createItemSource.indexOf("lockActiveItemParents")
    );
    expect(updateItemSource).toContain('FROM "Item"');
    expect(updateItemSource).toContain("FOR UPDATE");
    expect(updateItemSource.indexOf("FOR UPDATE")).toBeLessThan(
      updateItemSource.indexOf("lockActiveItemParents")
    );

    for (const deactivationSource of [
      deactivateCategorySource,
      deactivateUomSource
    ]) {
      expect(deactivationSource.indexOf("prisma.$transaction")).toBeLessThan(
        deactivationSource.indexOf("FOR UPDATE")
      );
      expect(deactivationSource.indexOf("FOR UPDATE")).toBeLessThan(
        deactivationSource.indexOf("tx.item.count")
      );
      expect(deactivationSource.indexOf("tx.item.count")).toBeLessThan(
        deactivationSource.indexOf("tx.auditEvent.create")
      );
    }
  });

  test("option catalogs are bounded and preserve scoped selected values", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");
    expect(source).toContain("listItemMasterOptionCatalog");
    expect(source).toContain('pageSize: z.number().int().min(10).max(100)');
    expect(source).toContain("selectedIds: z.array(z.string().uuid()).max(20)");
    expect(source).toContain("hasMore: effectivePage < totalPages");
    expect(source).toContain("page: effectivePage");
    expect(source).toContain('status: \"ACTIVE\" as const');
    expect(source).toContain("where: { ...scope, id: { in: values.selectedIds } }");
    expect(source).not.toContain(": values.selectedIds.length ? { id: { in: values.selectedIds } } : {}");
  });

  test("Item Master uses an active-tab profile and compact URL-backed workspace tabs", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");
    const page = readFileSync(path.resolve(__dirname, "../../app/(app)/items/page.tsx"), "utf8");
    expect(source).toContain('activeTab: z.enum(["items", "categories", "uoms", "conversions"])');
    expect(source).toContain("loadItems");
    expect(source).toContain("loadCategories");
    expect(source).toContain("loadUoms");
    expect(source).toContain("loadConversions");
    expect(page).toContain("<WorkspaceTabs");
    expect(page).toContain("Only the selected Item Master register and its required detail/catalog queries are loaded");
  });

  test("conversion reads fence all three related records to company scope", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");
    expect(source).toContain("fromUom: {");
    expect(source).toContain("toUom: {");
    expect(source).toContain("item_uom_conversion.updated");
  });

  test("controlled master-data classifications are rendered as dropdown options", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/items/page.tsx"),
      "utf8"
    );

    expect(itemInventoryClasses).toContain("RAW_MATERIAL");
    expect(itemTypes).toContain("inventory");
    expect(uomTypes).toContain("count");
    expect(page).toContain("itemInventoryClasses.map");
    expect(page).toContain("itemTypes.map");
    expect(page).toContain("uomTypes.map");
    expect(page).toContain('name="inventoryClass"');
    expect(page).toContain('name="itemType"');
    expect(page).toContain('name="uomType"');
    expect(page).toContain("listItemMasterOptionCatalog");
    expect(page).toContain("<ItemCreateComposer");
    expect(page).not.toContain("categoryOptionCatalog.hasMore || uomOptionCatalog.hasMore");
    expect(page).toContain("ConversionCreateComposer");
    expect(page).not.toContain("itemOptionCatalog.hasMore || uomOptionCatalog.hasMore");
    expect(page).toContain("masterData.categoriesPage");
    expect(page).toContain("masterData.uomsPage");
    expect(page).toContain("masterData.conversionsPage");
    expect(page).not.toContain("ItemMasterSearch");
    expect(page).toContain("selectedItemId");
    expect(page).toContain("Selected item:");
    expect(page).toContain("returnItemPage");
    expect(page).toContain("Open controls");
    expect(page).toContain("Selected category:");
    expect(page).toContain("Selected UOM:");
    expect(page).toContain("returnCategoryPage");
    expect(page).toContain("returnUomPage");
    expect(page).toContain("Selected conversion:");
    expect(page).toContain("returnConversionPage");
    expect(page).toContain("getItemUomConversionRecord");
  });

  test("item creation uses an uncapped focused composer with independent retained selectors", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/items/page.tsx"),
      "utf8"
    );
    const composer = readFileSync(
      path.resolve(__dirname, "../../components/ItemCreateComposer.tsx"),
      "utf8"
    );
    const createAction = page.slice(
      page.indexOf("async function createItemAction"),
      page.indexOf("async function createConversionAction")
    );

    expect(page).toContain("<ItemCreateComposer");
    expect(page).not.toContain('disabledReason="Item selectors exceed');
    expect(page).not.toContain("...masterData.items.map((item) => item.itemCategoryId)");
    expect(page).toContain("const selectedCategoryIds = selectedItem ? [selectedItem.itemCategoryId] : []");
    expect(page).toContain('activeTab === "items" && selectedItem');
    expect(createAction).toContain("assertTrustedServerActionOrigin");
    expect(createAction).toContain("getActionErrorCode");
    expect(createAction).toContain('status: "success"');
    expect(createAction).toContain("itemCode: createdItem.itemCode");

    expect(composer).toContain("<TaskSheet");
    expect(composer).toContain('footer={');
    expect(composer).toContain('size="workspace"');
    expect(composer).toContain("Governed item master");
    expect(composer).toContain("No stock movement");
    expect(composer).toContain("useActionState");
    expect(composer).toContain("Your draft remains in this sheet");
    expect(composer).toContain("router.refresh()");
    expect(composer).toContain("Discard the information entered in this form?");
    expect(composer).toContain(">Cancel</button>");

    for (const independentState of [
      'selectorName="category"',
      'selectorName="baseUom"',
      'selectorName="purchaseUom"',
      'selectorName="issueUom"',
      "setCategoryId",
      "setBaseUomId",
      "setPurchaseUomId",
      "setIssueUomId"
    ]) {
      expect(composer).toContain(independentState);
    }
    expect(composer).toContain("useDebouncedValue(query, 250)");
    expect(composer).toContain("createItemCatalogRequestController");
    expect(composer).toContain("fetchItemMasterCatalog");
    expect(composer).toContain("Selected:</span> {selectedOption.code} / {selectedOption.label}");
    expect(composer).toContain('required ? `Select ${label.toLowerCase()}` : "None"');
    expect(composer).toContain('const [categoryId, setCategoryId] = useState("")');
    expect(composer).toContain('const [baseUomId, setBaseUomId] = useState("")');
    expect(composer).toContain("!selectorReady.category");
    expect(composer).toContain("!selectorReady.baseUom");
    expect(composer).toContain("disabled={submitDisabled}");
    expect(composer).toContain("min-h-11");
  });
});
