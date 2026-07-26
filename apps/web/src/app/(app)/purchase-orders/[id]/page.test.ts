import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const sheetSource = readFileSync(
  new URL("../../../../components/PurchaseOrderAmendmentSheet.tsx", import.meta.url),
  "utf8",
);

describe("Purchase Order amendment visible states", () => {
  test("explains why an amendment request is unavailable instead of hiding the surface", () => {
    expect(source).toContain("getAmendmentUnavailableReason");
    expect(source).toContain("Amendment unavailable");
    expect(source).toContain("role=\"status\"");
    expect(source).toContain("pending approval");
    expect(source).toContain("receiving activity");
    expect(source).toContain("current access does not include Purchase Order amendment requests");
  });

  test("retains server feedback and the focused TaskSheet for eligible amendments", () => {
    expect(source).toContain("getActionFeedback(resolvedSearchParams)");
    expect(sheetSource).toContain("Request PO Amendment");
    expect(sheetSource).toContain("Changes require approval and remain in the PO audit history.");
    expect(sheetSource).toContain('size="workspace"');
    expect(sheetSource).toContain("min-h-11");
  });

  test("preserves an in-memory draft on validation errors and blocks stale retries", () => {
    expect(source).toContain("PurchaseOrderAmendmentSheet");
    expect(sheetSource).toContain("useActionState");
    expect(sheetSource).toContain("Your entered values remain in this sheet");
    expect(sheetSource).toContain("Reload current PO");
    expect(sheetSource).toContain('state.status === "conflict"');
    expect(sheetSource).toContain("disabled={pending || state.status === \"conflict\"}");
    expect(source).toContain("requestPurchaseOrderAmendment(formData)");
    expect(source).toContain("revalidatePath(`/purchase-orders/${id}`)");
    expect(source).toContain("PURCHASE_ORDER_RECEIVING_REPORT_BLOCKS_AMENDMENT");
  });

  test("tracks header and line-only edits for discard protection", () => {
    const updateLineSource = sheetSource.slice(
      sheetSource.indexOf("const updateLine"),
      sheetSource.indexOf("const handleOpenChange"),
    );

    expect(sheetSource).toContain("const updateDraft");
    expect(updateLineSource).toContain("setDirty(true)");
    expect(sheetSource).toContain("onDirtyChange={setDirty}");
    expect(sheetSource).toContain('updateLine(index, "orderedQty", event.target.value)');
    expect(sheetSource).toContain('updateLine(index, "unitPrice", event.target.value)');
    expect(sheetSource).toContain('updateLine(index, "notes", event.target.value)');
  });
});
