import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertNoDuplicateSupplierCode,
  assertNoDuplicateSupplierItemLink,
  isIsoCalendarDate
} from "./suppliers";

describe("supplier master-data controls", () => {
  test("duplicate supplier codes are rejected", () => {
    expect(() => assertNoDuplicateSupplierCode("existing-supplier")).toThrow(
      "DUPLICATE_SUPPLIER_CODE"
    );
    expect(() => assertNoDuplicateSupplierCode(undefined)).not.toThrow();
  });

  test("duplicate supplier-item purchase links are rejected", () => {
    expect(() => assertNoDuplicateSupplierItemLink("existing-link")).toThrow(
      "DUPLICATE_SUPPLIER_ITEM_LINK"
    );
    expect(() => assertNoDuplicateSupplierItemLink(undefined)).not.toThrow();
  });

  test("reference price dates reject normalized and malformed calendar dates", () => {
    expect(isIsoCalendarDate("2026-07-01")).toBe(true);
    expect(isIsoCalendarDate("2024-02-29")).toBe(true);
    expect(isIsoCalendarDate("2026-02-29")).toBe(false);
    expect(isIsoCalendarDate("2026-02-31")).toBe(false);
    expect(isIsoCalendarDate("07/01/2026")).toBe(false);
  });

  test("supplier setup writes are admin scoped, transactional, and audited", () => {
    const source = readFileSync(path.resolve(__dirname, "suppliers.ts"), "utf8");

    expect(source).toContain("requirePermission(session, permissions.coreAdminister)");
    expect(source).toContain(
      "assertCanManageCompanyScope(session, session.context.companyId)"
    );
    expect(source).toContain("tenantId: session.context.tenantId");
    expect(source).toContain("companyId: session.context.companyId");
    expect(source).toContain("prisma.$transaction");
    expect(source).toContain("Prisma.PrismaClientKnownRequestError");
    expect(source).toContain('throw new Error("DUPLICATE_SUPPLIER_ITEM_LINK")');
    expect(source).toContain("export async function getSupplierCatalog");
    expect(source).toContain("supplierCatalogInputSchema");
    expect(source).toContain("canViewSupplierConfidential");
    expect(source).toContain("permissions.supplierConfidentialView");
    expect(source).toContain('throw new Error("SUPPLIER_REFERENCE_PRICE_REQUIRED")');
    expect(source).toContain("paymentTerms: hasConfidentialAccess");
    expect(source).toContain("priceHistory: hasConfidentialAccess");
    expect(source).toContain("export async function getSupplierItemLinkLookup");
    expect(source).toContain("supplierItemLinkLookupInputSchema");
    expect(source).toContain('pageSize: z.number().int().min(10).max(50)');
    expect(source).toContain('status: "ACTIVE" as const');
    expect(source).toContain("hasNextPage");
    expect(source).toContain("itemQuery");
    expect(source).toContain("uomQuery");
    expect(source).toContain("selectedItemId");
    expect(source).toContain("selectedUomId");
    expect(source).toContain("Math.min(values.itemPage");
    expect(source).toContain("Math.min(values.uomPage");
    expect(source).toContain("tx.auditEvent.create");
    expect(source).toContain("FOR UPDATE OF supplier");
    expect(source).toContain("FOR UPDATE OF link");
    expect(source).toContain("updated.count !== 1");
    expect(source.match(/FOR UPDATE OF supplier/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("supplierId: z.string().uuid()");
    expect(source).toContain("currencyCode: company.currencyCode");
    expect(source).toContain('accreditationStatus: "PENDING_REVIEW"');
    expect(source).toContain("updateSupplierAccreditation");
    expect(source).toContain("supplier.accreditation_status_updated");
    expect(source).toContain("sourceDecisionId: \"DEC-0036\"");
    expect(source).toContain('accreditationStatus: "SUSPENDED"');
    for (const eventType of [
      "supplier.created",
      "supplier.deactivated",
      "supplier.accreditation_status_updated",
      "supplier_item_link.created",
      "supplier_item_link.deactivated"
    ]) {
      expect(source).toContain(`eventType: "${eventType}"`);
    }
  });

  test("supplier register uses bounded scoped pagination", () => {
    const service = readFileSync(path.resolve(__dirname, "suppliers.ts"), "utf8");
    const page = readFileSync(path.resolve(__dirname, "../../app/(app)/suppliers/page.tsx"), "utf8");
    expect(service).toContain("supplierListInputSchema");
    expect(service).toContain("totalSuppliers");
    expect(service).toContain('pageSize: z.number().int().min(10).max(100)');
    expect(service).toContain("assertCanManageCompanyScope(session, session.context.companyId)");
    expect(page).toContain("supplierData.suppliersPage");
    expect(page).toContain("PaginationBar");
    expect(page).toContain("Search supplier code or name");
    expect(page).toContain("selectedSupplierAction");
    expect(page).toContain("Open controls");
    expect(page).toContain("The selected supplier is the only record affected.");
    expect(page).toContain("getSupplierItemLinkLookup");
    expect(page).toContain("supplierLookupPageHref");
    expect(page).toContain("selectedSupplierItemLinkId");
    expect(page).toContain("<UrlOwnedTaskSheet");
    expect(page).toContain("Only this selected link is affected");
    expect(page).toContain("WorkspaceTabs");
    expect(page).toContain('label: "Overview"');
    expect(page).toContain('label: "Catalog"');
    expect(page).toContain('label: "Accreditation"');
    expect(page).toContain('label: "Audit"');
    expect(page).toContain("/admin?tab=audit&entityType=Supplier&entityId=");
    expect(page).not.toContain("/admin/audit?entityType=Supplier");
    expect(page).toContain('supplierTab === "catalog"');
    expect(page).not.toContain('title="Deactivate Supplier Item Link"');
    expect(page).toContain('name="selectedItemId"');
    expect(page).toContain('name="selectedUomId"');
    expect(page).not.toContain("listSupplierItemLinkOptions");
  });

  test("supplier catalog category options remain bounded and context-preserving", () => {
    const service = readFileSync(path.resolve(__dirname, "suppliers.ts"), "utf8");
    const page = readFileSync(path.resolve(__dirname, "../../app/(app)/suppliers/page.tsx"), "utf8");

    expect(service).toContain("categoryQuery: boundedCatalogSearchSchema");
    expect(service).toContain("categoryPage: z.preprocess");
    expect(service).toContain("categoryPageSize: z.preprocess");
    expect(service).toContain("clampCatalogInteger(value, 10, 100, 25)");
    expect(service).toContain('value.trim().slice(0, 120)');
    expect(service).toContain('orderBy: [{ categoryName: "asc" }, { id: "asc" }]');
    expect(service).toContain("skip: (categoryPage - 1) * values.categoryPageSize");
    expect(service).toContain("take: values.categoryPageSize");
    expect(service).toContain("categoryTotalCount");
    expect(service).toContain("categoryTotalPages");
    expect(service).toContain("selectedCategoryWhere");
    expect(service).toContain("selectedCategory && !categories.some");
    expect(service).not.toContain('distinct: ["itemId"]');
    expect(service).toContain("totalPages");
    expect(service).toContain("rangeStart");
    expect(service).toContain("rangeEnd");

    expect(page).toContain('name="catalogCategoryQuery"');
    expect(page).toContain('name="catalogCategory"');
    expect(page).toContain("catalogCategoryPageHref");
    expect(page).toContain("Previous category options");
    expect(page).toContain("Next category options");
    expect(page).toContain("min-h-11 items-center");
    expect(page).toContain("catalogCategoryQuery");
    expect(page).toContain("catalogCategoryPage");
  });

  test("supplier register and catalog provide responsive parity without task overflow", () => {
    const page = readFileSync(path.resolve(__dirname, "../../app/(app)/suppliers/page.tsx"), "utf8");
    const urlSheet = readFileSync(path.resolve(__dirname, "../../components/UrlOwnedTaskSheet.tsx"), "utf8");
    const taskSheet = readFileSync(path.resolve(__dirname, "../../components/TaskSheet.tsx"), "utf8");

    expect(page).toContain('data-testid="supplier-desktop-table"');
    expect(page).toContain('data-testid="supplier-responsive-cards"');
    expect(page).toContain('data-testid="supplier-catalog-desktop-table"');
    expect(page).toContain('data-testid="supplier-catalog-responsive-cards"');
    expect(page).toContain('data-testid="supplier-catalog-card"');
    expect(page).not.toContain('min-w-[1100px]');
    expect(page).not.toContain('className="overflow-x-auto"');
    expect(page).toContain('Inactive link retained as read-only history.');
    expect(page).toContain('Inactive supplier retained as read-only history.');
    expect(page).toContain('No catalog links configured');
    expect(page).toContain('No catalog links match the current filters');
    expect(page).toContain('No suppliers match the current filters');
    expect(page).toContain('selectedSupplierCatalog.rangeStart');
    expect(page).toContain('selectedSupplierCatalog.rangeEnd');
    expect(page).toContain('selectedSupplierCatalog.filteredCount');
    expect(page).toContain('selectedSupplierCatalog.totalPages');

    expect(urlSheet).toContain('router.replace(returnHref, { scroll: false })');
    expect(urlSheet).toContain('data-focus-key');
    expect(urlSheet).toContain('pending || submitDisabled');
    expect(taskSheet).toContain('requestClose: close');
  });

  test("catalog filters, task success, and confidential fields are truthful and context-preserving", () => {
    const page = readFileSync(path.resolve(__dirname, "../../app/(app)/suppliers/page.tsx"), "utf8");

    expect(page).toContain('<input name="tab" type="hidden" value="catalog" />');
    expect(page).toContain('clearCatalogFiltersHref()');
    expect(page).toContain('supplierRegisterHref()');
    expect(page).toContain('supplierData.canViewSupplierConfidential');
    expect(page).toContain('selectedSupplierCatalog.canViewSupplierConfidential');
    expect(page).toContain('Payment terms: Restricted');
    expect(page).toContain('Reference price: Restricted');
    expect(page).toContain('name="supplierId" type="hidden" value={selectedSupplier.id}');
    expect(page).toContain('SUPPLIER_ITEM_LINK_CREATED');
    expect(page).toContain('SUPPLIER_ITEM_LINK_DEACTIVATED');
    expect(page).toContain('getActionFeedback({ success: "SUPPLIER_ITEM_LINK_CREATED" })');
    expect(page).toContain('getActionFeedback({ success: "SUPPLIER_ITEM_LINK_DEACTIVATED" })');
    expect(page).toContain('const actionFeedback = getActionFeedback({ error: params.error })');
    expect(page).not.toContain('searchParams.set("success"');
  });

  test("registers supplier confidentiality without granting ordinary configured admins", () => {
    const seed = readFileSync(
      path.resolve(process.cwd(), "../../packages/database/src/seed.ts"),
      "utf8"
    );
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "../../packages/database/prisma/migrations/20260726190000_supplier_confidential_permission/migration.sql"
      ),
      "utf8"
    );
    expect(seed).toContain('code: "purchasing.supplier_confidential.view"');
    expect(seed).toContain("allSeededPermissions.map");
    expect(migration).toContain("purchasing.supplier_confidential.view");
    expect(migration).not.toContain("CONFIGURED_ADMIN");
    expect(migration).not.toContain("CONFIGURED_SUPER_USER");
  });
});
