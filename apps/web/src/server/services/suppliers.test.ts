import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertNoDuplicateSupplierCode,
  assertNoDuplicateSupplierItemLink
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
    expect(page).toContain("<TaskSheet");
    expect(page).toContain("Only this selected link is affected");
    expect(page).not.toContain('title="Deactivate Supplier Item Link"');
    expect(page).toContain('name="returnPath"');
    expect(page).toContain('name="selectedItemId"');
    expect(page).toContain('name="selectedUomId"');
    expect(page).not.toContain("listSupplierItemLinkOptions");
  });
});
