import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);

describe("Receiving detail follow-up return contract", () => {
  it("accepts only the closed profile marker and bounded search/page values", () => {
    expect(source).toContain('=== "receiving-follow-up-v1"');
    expect(source).toContain("returnQuery.length <= 120");
    expect(source).toContain("receivingDashboardProfileHref(\"receiving-follow-up-v1\"");
  });

  it("preserves the locked return context and explains changed membership", () => {
    expect(source).toContain("Back to Receiving Follow-up");
    expect(source).toContain("no longer matches Receiving Follow-up");
    expect(source).toContain("isReceivingFollowUp(receipt)");
    expect(source).toContain("href={receivingReturnHref}");
  });
});


it("exposes scoped draft cancellation, an explicit permission-denied state, and its audited reason", () => {
  expect(source).toContain("permissions.receivingCancel");
  expect(source).toContain("await cancelGoodsReceipt(formData)");
  expect(source).toContain('name="cancellationReason" minLength={5} maxLength={500} required');
  expect(source).toContain("Your role does not have permission to cancel draft receipts");
  expect(source).toContain("event.metadata.cancellationReason");
});
