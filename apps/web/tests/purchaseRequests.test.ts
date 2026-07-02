import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertAuthorizedLocation,
  getConfiguredContextFallback,
  resolveAuthorizedLocationContext,
} from "../src/server/services/context";
import {
  assertCanCancelPurchaseRequest,
  assertCanReopenReturnedPurchaseRequest,
  getCatalogLineUomRequirementIssue,
} from "../src/server/services/purchaseRequests";
import {
  assertPermissionAllowed,
  permissions,
} from "../src/server/services/authorization";
import { assertNotSelfApproval } from "../src/server/services/approvals";
import {
  assertAssignableNonSensitiveRole,
  assertNoActiveDuplicateScope,
  assertNoActiveDuplicateRole,
  assertNotSelfRoleMutation,
  assertNotSelfScopeMutation,
  isAssignableNonSensitiveRole,
} from "../src/server/services/coreAdmin";
import {
  assertNoDuplicateSupplierCode,
  assertNoDuplicateSupplierItemLink,
} from "../src/server/services/suppliers";
import {
  assertApprovedPurchaseRequestForQuote,
  getLowestQuoteIds,
} from "../src/server/services/quotes";
import {
  assertDistinctConversionUoms,
  assertNoActiveMasterDataDependents,
  assertNoDuplicateMasterCode,
} from "../src/server/services/items";
import { PURCHASE_REQUEST_MAX_LINES } from "../src/lib/workflowLimits";

describe("purchase request service scaffold", () => {
  it("keeps purchase request read surfaces permission-gated", () => {
    const serviceSource = readFileSync(
      path.resolve(__dirname, "../src/server/services/purchaseRequests.ts"),
      "utf8",
    );
    const listPageSource = readFileSync(
      path.resolve(__dirname, "../src/app/(app)/purchase-requests/page.tsx"),
      "utf8",
    );
    const detailPageSource = readFileSync(
      path.resolve(
        __dirname,
        "../src/app/(app)/purchase-requests/[id]/page.tsx",
      ),
      "utf8",
    );
    const exportRouteSource = readFileSync(
      path.resolve(
        __dirname,
        "../src/app/(app)/purchase-requests/export/route.ts",
      ),
      "utf8",
    );

    expect(serviceSource).toContain(
      "canUsePurchaseRequests(session.permissionCodes)",
    );
    expect(listPageSource).toContain(
      "canUsePurchaseRequests(session.permissionCodes)",
    );
    expect(detailPageSource).toContain(
      "canUsePurchaseRequests(session.permissionCodes)",
    );
    expect(exportRouteSource).toContain("canExportPurchaseRequests(session)");
    expect(exportRouteSource).toContain("exportPermissionDeniedResponse()");
  });

  it("blocks a mismatched posting location context", () => {
    const session = getConfiguredContextFallback();
    expect(() =>
      assertAuthorizedLocation(session, "00000000-0000-4000-8000-000000000099"),
    ).toThrow("SCOPE_DENIED");
  });

  it("blocks a missing purchase request permission", () => {
    expect(() =>
      assertPermissionAllowed([], permissions.purchaseRequestCreate),
    ).toThrow("PERMISSION_DENIED");
  });

  it("selects an explicitly authorized location context", () => {
    const session = getConfiguredContextFallback();
    expect(
      resolveAuthorizedLocationContext(
        session.authorizedLocations,
        "00000000-0000-4000-8000-000000000004",
      ).locationName,
    ).toBe("Golden Spoon - BGC");
  });

  it("falls back when the selected location is not authorized", () => {
    const session = getConfiguredContextFallback();
    expect(
      resolveAuthorizedLocationContext(
        session.authorizedLocations,
        "00000000-0000-4000-8000-000000000099",
      ).locationId,
    ).toBe("00000000-0000-4000-8000-000000000004");
  });

  it("blocks self scope mutation", () => {
    expect(() =>
      assertNotSelfScopeMutation(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toThrow("SELF_SCOPE_MUTATION_BLOCKED");
  });

  it("blocks self approval", () => {
    expect(() =>
      assertNotSelfApproval(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toThrow("SELF_APPROVAL_BLOCKED");
  });

  it("blocks duplicate active scope assignment", () => {
    expect(() =>
      assertNoActiveDuplicateScope("00000000-0000-4000-8000-000000000099"),
    ).toThrow("DUPLICATE_ACTIVE_SCOPE_ASSIGNMENT");
  });

  it("allows only explicitly non-sensitive role assignment", () => {
    expect(isAssignableNonSensitiveRole("CONFIGURED_REQUESTER")).toBe(true);
    expect(() => assertAssignableNonSensitiveRole("CONFIGURED_ADMIN")).toThrow(
      "SENSITIVE_ROLE_ASSIGNMENT_BLOCKED",
    );
    expect(() =>
      assertAssignableNonSensitiveRole("CONFIGURED_APPROVER"),
    ).toThrow("SENSITIVE_ROLE_ASSIGNMENT_BLOCKED");
  });

  it("blocks self role mutation", () => {
    expect(() =>
      assertNotSelfRoleMutation(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toThrow("SELF_ROLE_MUTATION_BLOCKED");
  });

  it("blocks duplicate active role assignment", () => {
    expect(() =>
      assertNoActiveDuplicateRole("00000000-0000-4000-8000-000000000099"),
    ).toThrow("DUPLICATE_ACTIVE_ROLE_ASSIGNMENT");
  });

  it("blocks duplicate retained supplier codes", () => {
    expect(() =>
      assertNoDuplicateSupplierCode("00000000-0000-4000-8000-000000000099"),
    ).toThrow("DUPLICATE_SUPPLIER_CODE");
  });

  it("blocks duplicate supplier-item links", () => {
    expect(() =>
      assertNoDuplicateSupplierItemLink("00000000-0000-4000-8000-000000000099"),
    ).toThrow("DUPLICATE_SUPPLIER_ITEM_LINK");
  });

  it("blocks duplicate item master codes", () => {
    expect(() =>
      assertNoDuplicateMasterCode(
        "00000000-0000-4000-8000-000000000099",
        "DUPLICATE_ITEM_CODE",
      ),
    ).toThrow("DUPLICATE_ITEM_CODE");
  });

  it("blocks a UOM conversion to the same UOM", () => {
    expect(() =>
      assertDistinctConversionUoms(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toThrow("INVALID_UOM_CONVERSION");
  });

  it("blocks master-data deactivation with active dependents", () => {
    expect(() =>
      assertNoActiveMasterDataDependents(1, "ITEM_CATEGORY_HAS_ACTIVE_ITEMS"),
    ).toThrow("ITEM_CATEGORY_HAS_ACTIVE_ITEMS");
  });

  it("requires catalog UOMs for catalog item lines", () => {
    expect(
      getCatalogLineUomRequirementIssue({
        itemId: "00000000-0000-4000-8000-000000000024",
        uomCode: "kg",
      }),
    ).toEqual({
      path: "uomId",
      message: "Catalog item lines require a catalog UOM.",
    });
  });

  it("requires a UOM code for free-text lines", () => {
    expect(getCatalogLineUomRequirementIssue({ uomCode: " " })).toEqual({
      path: "uomCode",
      message: "Free-text lines require a UOM code.",
    });
  });

  it("allows catalog unit lines without free-text UOM codes", () => {
    expect(
      getCatalogLineUomRequirementIssue({
        itemId: "00000000-0000-4000-8000-000000000024",
        uomId: "00000000-0000-4000-8000-000000000022",
      }),
    ).toBeNull();
  });

  it("uses a compact capped line-entry matrix for large purchase requests", () => {
    const serviceSource = readFileSync(
      path.resolve(__dirname, "../src/server/services/purchaseRequests.ts"),
      "utf8",
    );
    const editorSource = readFileSync(
      path.resolve(
        __dirname,
        "../src/components/PurchaseRequestLinesEditor.tsx",
      ),
      "utf8",
    );

    expect(PURCHASE_REQUEST_MAX_LINES).toBe(100);
    expect(serviceSource).toContain("PURCHASE_REQUEST_LINES_LIMIT_EXCEEDED");
    expect(editorSource).toContain("max-h-[62vh]");
    expect(editorSource).toContain("<table");
    expect(editorSource).toContain("disabled={!canAddLine}");
  });

  it("reopens only returned purchase requests", () => {
    expect(() =>
      assertCanReopenReturnedPurchaseRequest("RETURNED"),
    ).not.toThrow();
    expect(() => assertCanReopenReturnedPurchaseRequest("DRAFT")).toThrow(
      "INVALID_STATUS_TRANSITION",
    );
    expect(() => assertCanReopenReturnedPurchaseRequest("APPROVED")).toThrow(
      "INVALID_STATUS_TRANSITION",
    );
  });

  it("cancels only draft or returned purchase requests", () => {
    expect(() => assertCanCancelPurchaseRequest("DRAFT")).not.toThrow();
    expect(() => assertCanCancelPurchaseRequest("RETURNED")).not.toThrow();
    expect(() => assertCanCancelPurchaseRequest("PENDING_APPROVAL")).toThrow(
      "INVALID_STATUS_TRANSITION",
    );
    expect(() => assertCanCancelPurchaseRequest("APPROVED")).toThrow(
      "INVALID_STATUS_TRANSITION",
    );
  });

  it("captures supplier quotes only for approved purchase requests", () => {
    expect(() =>
      assertApprovedPurchaseRequestForQuote("APPROVED"),
    ).not.toThrow();
    expect(() => assertApprovedPurchaseRequestForQuote("DRAFT")).toThrow(
      "PURCHASE_REQUEST_NOT_APPROVED_FOR_QUOTE",
    );
    expect(() =>
      assertApprovedPurchaseRequestForQuote("PENDING_APPROVAL"),
    ).toThrow("PURCHASE_REQUEST_NOT_APPROVED_FOR_QUOTE");
    expect(() => assertApprovedPurchaseRequestForQuote("RETURNED")).toThrow(
      "PURCHASE_REQUEST_NOT_APPROVED_FOR_QUOTE",
    );
  });

  it("marks the lowest recorded quote cost without forcing a selection", () => {
    expect(Array.from(getLowestQuoteIds([]))).toEqual([]);
    expect(
      Array.from(
        getLowestQuoteIds([
          { id: "quote-a", totalAmount: 125 },
          { id: "quote-b", totalAmount: 120 },
          { id: "quote-c", totalAmount: 120 },
        ]),
      ).sort(),
    ).toEqual(["quote-b", "quote-c"]);
  });
});
