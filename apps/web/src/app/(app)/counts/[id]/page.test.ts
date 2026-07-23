import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);

const actionEligibility = source.slice(
  source.indexOf("const canStartCount"),
  source.indexOf("const canShowEnteredCountFacts")
);

describe("stock count detail action eligibility", () => {
  it("limits assigned counter work to the approved pre-review states", () => {
    expect(actionEligibility).toContain("isAssignedEntryActor");
    expect(actionEligibility).toContain('count.status === "DRAFT"');
    expect(actionEligibility).toContain("count.scheduledStartEligible");
    expect(actionEligibility).toContain('count.status === "IN_PROGRESS"');
    expect(actionEligibility).toContain("count.hasSnapshotLines");
    expect(actionEligibility).toContain("count.hasUncountedLines");
    expect(actionEligibility).toContain("!count.hasUncountedLines");
    expect(actionEligibility).not.toContain("RECOUNT_REQUESTED");
  });

  it("explains unassigned, future-scheduled, incomplete, and empty-snapshot states", () => {
    expect(source).toContain("Read-only count access");
    expect(source).toContain("Only the assigned counter can start it");
    expect(source).toContain("Scheduled count has not opened");
    expect(source).toContain("The count cannot be started early");
    expect(source).toContain("Enter a physical quantity for every snapshot line");
    expect(source).toContain("Count entry and submission are unavailable");
  });

  it("uses server-owned visibility facts for blind-count protected content", () => {
    expect(source).toContain(
      "isAssignedEntryActor || count.canShowSystemQuantity"
    );
    expect(source).toContain(
      "count.canShowSystemQuantity && count.reviewNotes"
    );
    expect(source).toContain(
      "count.canShowSystemQuantity && count.varianceAdjustmentId"
    );
    expect(source).toContain(
      "const canReviewCount = count.canReviewCurrentActor"
    );
    expect(source).toContain(
      'count.status === "SUBMITTED" && canReviewCount'
    );
    expect(source).not.toContain("canReview && count.reviewNotes");
    expect(source).not.toContain("canReview && count.varianceAdjustmentId");
    expect(source).toContain("Independent review required");
    expect(source).toContain("did not create or");
    expect(source).toContain("complete counter");
  });

  it("warns when a movement freeze is configured or active", () => {
    expect(source).toContain("Inventory movement freeze");
    expect(source).toContain("Inventory posting for");
    expect(source).toContain("Receiving, transfer, wastage, and adjustment posting");
  });
});
