import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertDistinctConversionUoms,
  assertBaseUomChangeAllowed,
  assertItemCorrectionIsNonMaterial,
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
      "item_category.deactivated",
      "uom.deactivated"
    ]) {
      expect(source).toContain(`eventType: "${eventType}"`);
    }
  });

  test("option catalog authorizes and validates before consuming an application permit", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");
    const catalog = source.slice(
      source.indexOf("export async function listItemMasterOptionCatalog"),
      source.indexOf("export async function listItemMasterData"),
    );
    expect(catalog.indexOf("assertAdminCanManageMasterData(session)")).toBeGreaterThan(-1);
    expect(catalog.indexOf("itemMasterOptionCatalogInputSchema.parse(input)")).toBeGreaterThan(-1);
    expect(catalog.indexOf("assertAdminCanManageMasterData(session)")).toBeLessThan(
      catalog.indexOf("runWithItemOptionCatalogAdmission"),
    );
    expect(catalog.indexOf("itemMasterOptionCatalogInputSchema.parse(input)")).toBeLessThan(
      catalog.indexOf("runWithItemOptionCatalogAdmission"),
    );
  });

  test("item creation and parent deactivation share scoped lifecycle locks while correction uses item CAS", () => {
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
    expect(updateItemSource).toContain('item.status !== "ACTIVE"');
    expect(updateItemSource).toContain("item.updatedAt.getTime() !== values.expectedUpdatedAt.getTime()");
    expect(updateItemSource).toContain("assertItemCorrectionIsNonMaterial(item, values)");
    expect(updateItemSource).not.toContain("lockActiveItemParents(tx, session, values)");

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

  test("item correction rejects every material-field difference", () => {
    const current = {
      itemCategoryId: "category-1",
      itemType: "inventory",
      baseUomId: "uom-1",
      purchaseUomId: "uom-2",
      issueUomId: null,
      trackInventory: true,
      trackExpiry: false,
      trackLot: false,
      requiresReceivingInspection: true
    };
    expect(() => assertItemCorrectionIsNonMaterial(current, current)).not.toThrow();
    for (const proposed of [
      { ...current, itemCategoryId: "category-2" },
      { ...current, itemType: "service" },
      { ...current, baseUomId: "uom-3" },
      { ...current, purchaseUomId: null },
      { ...current, issueUomId: "uom-4" },
      { ...current, trackInventory: false },
      { ...current, trackExpiry: true },
      { ...current, trackLot: true },
      { ...current, requiresReceivingInspection: false }
    ]) {
      expect(() => assertItemCorrectionIsNonMaterial(current, proposed)).toThrow(
        "ITEM_MATERIAL_CHANGE_REQUIRES_REVIEW"
      );
    }
  });

  test("direct item deactivation fails closed without mutation or audit", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");
    const boundary = source.slice(
      source.indexOf("export async function deactivateItem("),
      source.indexOf("export async function deactivateItemCategory")
    );
    expect(boundary).toContain("requireSessionContext()");
    expect(boundary).toContain("deactivateItemSchema.parse");
    expect(boundary).toContain("assertAdminCanManageMasterData(session)");
    expect(boundary).toContain('throw new Error("ITEM_DEACTIVATION_GOVERNANCE_REQUIRED")');
    expect(boundary).not.toContain("prisma.item");
    expect(boundary).not.toContain("item.update");
    expect(boundary).not.toContain("auditEvent.create");
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
    const itemComposer = readFileSync(
      path.resolve(__dirname, "../../components/ItemCreateComposer.tsx"),
      "utf8"
    );

    expect(itemInventoryClasses).toContain("RAW_MATERIAL");
    expect(itemTypes).toContain("inventory");
    expect(uomTypes).toContain("count");
    expect(page).toContain("itemInventoryClasses.map");
    expect(itemComposer).toContain("itemTypes.map");
    expect(page).toContain("uomTypes.map");
    expect(page).toContain('name="inventoryClass"');
    expect(itemComposer).toContain('name="itemType"');
    expect(page).toContain('name="uomType"');
    expect(page).toContain("<ItemCreateComposer");
    expect(page).not.toContain("categoryOptionCatalog.hasMore || uomOptionCatalog.hasMore");
    expect(page).toContain("ConversionCreateComposer");
    expect(page).not.toContain("itemOptionCatalog.hasMore || uomOptionCatalog.hasMore");
    expect(page).toContain("masterData.categoriesPage");
    expect(page).toContain("masterData.uomsPage");
    expect(page).toContain("masterData.conversionsPage");
    expect(page).not.toContain("ItemMasterSearch");
    expect(page).toContain("selectedItemId");
    expect(page).toContain("<SelectedItemTaskSheet");
    expect(page).toContain("<UnavailableSelectedItemTaskSheet");
    expect(page).toContain("Open item details");
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

  test("selected Item TaskSheet exposes only concurrency-safe name correction", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");
    const page = readFileSync(path.resolve(__dirname, "../../app/(app)/items/page.tsx"), "utf8");
    const sheet = readFileSync(path.resolve(__dirname, "../../components/SelectedItemTaskSheet.tsx"), "utf8");
    const updateSource = source.slice(
      source.indexOf("export async function updateItem("),
      source.indexOf("export async function updateItemUomConversion")
    );
    const updateAction = page.slice(
      page.indexOf("async function updateItemAction"),
      page.indexOf("async function updateConversionAction")
    );

    expect(updateAction).toContain("assertTrustedServerActionOrigin");
    expect(updateAction).toContain("getActionErrorCode");
    expect(updateSource).toContain('status::text AS status');
    expect(updateSource).toContain('"updatedAt"');
    expect(updateSource).toContain('throw new Error("ITEM_NOT_ACTIVE")');
    expect(updateSource).toContain('throw new Error("ITEM_UPDATE_CONFLICT")');
    expect(updateSource).toContain('throw new Error("ITEM_CORRECTION_NO_CHANGE")');
    expect(updateSource.indexOf("ITEM_CORRECTION_NO_CHANGE")).toBeLessThan(updateSource.indexOf("tx.item.update"));
    expect(updateSource).toContain("assertItemCorrectionIsNonMaterial(item, values)");
    expect(updateSource).toContain("data: {\n        itemName: values.itemName\n      }");

    expect(sheet).toContain('title={item.status === "ACTIVE" ? "Correct Item Name"');
    expect(sheet).toContain('name="expectedUpdatedAt"');
    expect(sheet).toContain('name="itemName"');
    expect(sheet).not.toContain('name="deactivationReason"');
    expect(sheet).toContain("Save Item Name");
    expect(sheet).toContain("Governed fields are read-only");
    expect(sheet).toContain("This item remains Active");
    expect(sheet).toContain("no deactivation request is recorded here");
    expect(sheet).toContain("contact the master-data owner");
    expect(sheet).toContain("aria-describedby");
    expect(sheet).toContain("View authoritative item audit history (opens in new tab)");
    expect(sheet).toContain("Discard the item-name correction draft?");
    expect(sheet).toContain("Return to refreshed register");
    expect(sheet).toContain("disabled={refreshRequired}");
    expect(sheet).toContain("event.preventDefault()");
    expect(sheet).toContain('document.getElementById("item-register-heading")?.focus');
    expect(sheet).toContain('target="_blank"');
    expect(sheet).toContain('rel="noopener noreferrer"');
    expect(page).toContain('item={{ ...selectedItem, updatedAt: selectedItem.updatedAt.toISOString() }}');
    expect(page).toContain('id="item-register-heading"');
    expect(page).not.toContain("itemNotice");
    expect(page).not.toContain("noticeItemId");
    expect(page).not.toContain("noticeItemCode");
    expect(page).not.toContain("noticeItemName");
  });
});
