import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { PURCHASE_REQUEST_MAX_LINES } from "../../lib/workflowLimits";
import { getCatalogLineUomRequirementIssue } from "./purchaseRequests";

describe("purchase request workflow controls", () => {
  test("purchase request creation uses modal multi-line entry with bounded line count", () => {
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-requests/page.tsx"),
      "utf8"
    );
    const editorSource = readFileSync(
      path.resolve(__dirname, "../../components/PurchaseRequestLinesEditor.tsx"),
      "utf8"
    );
    const serviceSource = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8"
    );

    expect(pageSource).toContain("<EntryModal title=\"Create Draft PR\"");
    expect(pageSource).toContain("<PurchaseRequestLinesEditor");
    expect(editorSource).toContain("PURCHASE_REQUEST_MAX_LINES");
    expect(editorSource).toContain("Add Line");
    expect(editorSource).toContain("max-h-[62vh] overflow-auto");
    expect(editorSource).toContain('name="lineDescription"');
    expect(editorSource).toContain('name="lineRequestedQty"');
    expect(editorSource).toContain('name="lineItemId"');
    expect(editorSource).toContain('name="lineUomId"');
    expect(editorSource).toContain('name="lineUomCode"');
    expect(editorSource).toContain('name="linePurpose"');
    expect(serviceSource).toContain("parsePurchaseRequestLineInputs(formData)");
    expect(serviceSource).toContain("PURCHASE_REQUEST_LINES_LIMIT_EXCEEDED");
    expect(PURCHASE_REQUEST_MAX_LINES).toBe(100);
  });

  test("purchase request list keeps multi-line summaries visible without expanding every line", () => {
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-requests/page.tsx"),
      "utf8"
    );

    expect(pageSource).toContain("request.lines.slice(0, 3)");
    expect(pageSource).toContain("request.lines.length > 3");
    expect(pageSource).toContain("more line");
    expect(pageSource).toContain("data-testid=\"purchase-request-row\"");
  });

  test("catalog and free-text UOM requirements stay explicit at validation boundary", () => {
    expect(
      getCatalogLineUomRequirementIssue({
        itemId: "00000000-0000-0000-0000-000000000001",
        uomId: undefined,
        uomCode: "CASE"
      })
    ).toEqual({
      path: "uomId",
      message: "Catalog item lines require a catalog UOM."
    });

    expect(
      getCatalogLineUomRequirementIssue({
        itemId: undefined,
        uomId: undefined,
        uomCode: ""
      })
    ).toEqual({
      path: "uomCode",
      message: "Free-text lines require a UOM code."
    });

    expect(
      getCatalogLineUomRequirementIssue({
        itemId: undefined,
        uomId: undefined,
        uomCode: "tray"
      })
    ).toBeNull();
  });

  test("purchase request audit metadata records source and line-level lineage", () => {
    const serviceSource = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8"
    );

    expect(serviceSource).toContain('eventType: "purchase_request.created"');
    expect(serviceSource).toContain('source: "purchase-request-draft"');
    expect(serviceSource).toContain("lineCount: resolvedLines.length");
    expect(serviceSource).toContain("lineItemCodes: resolvedLines.map");
    expect(serviceSource).toContain("lineUomCodes: resolvedLines.map");
  });
});
