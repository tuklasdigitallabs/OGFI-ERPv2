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
});
