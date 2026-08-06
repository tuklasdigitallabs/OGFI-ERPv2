import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reviewSource = readFileSync(
  new URL("./boundedApprovalReview.ts", import.meta.url),
  "utf8",
);
const tokenSource = readFileSync(
  new URL("./approvalReviewToken.ts", import.meta.url),
  "utf8",
);

describe("bounded approval reviewed-state contract", () => {
  it("binds the complete normalized routing assignment to the signed token", () => {
    for (const field of [
      "assignedUserId",
      "assignedRoleId",
      "requiredPermissionCode",
      "routingFingerprint",
    ]) {
      expect(tokenSource).toContain(field);
    }
    expect(reviewSource).toContain('dueAt: eligible.dueAt?.toISOString() ?? null');
    expect(reviewSource).toContain("groups,");
    expect(reviewSource).toContain("targets,");
    expect(reviewSource).toContain("prohibitedActors,");
    expect(reviewSource).toContain("routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION");
    expect(reviewSource).toContain("routing.fingerprint !== claims.routingFingerprint");
  });

  it("repeats exact eligibility and the routing fingerprint in the decision transaction", () => {
    expect(reviewSource.match(/exactEligibleStep\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(reviewSource).toContain("getBoundedApprovalRoutingSnapshot(");
    expect(reviewSource).toContain("boundedApprovalReviewDigest(review) !== claims.reviewDigest");
    expect(reviewSource).toContain('throw new Error("APPROVAL_REVIEW_STALE")');
  });
});
