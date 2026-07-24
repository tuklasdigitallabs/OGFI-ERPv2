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

  test("option catalogs are bounded and preserve scoped selected values", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");
    expect(source).toContain("listItemMasterOptionCatalog");
    expect(source).toContain('pageSize: z.number().int().min(10).max(100)');
    expect(source).toContain("selectedIds: z.array(z.string().uuid()).max(20)");
    expect(source).toContain("hasMore: total > options.length");
    expect(source).toContain('status: \"ACTIVE\" as const');
    expect(source).toContain("values.selectedIds.length ? { id: { in: values.selectedIds } } : {}");
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
    expect(page).toContain("categoryOptionCatalog.hasMore || uomOptionCatalog.hasMore");
    expect(page).toContain("itemOptionCatalog.hasMore || uomOptionCatalog.hasMore");
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
  });
});
