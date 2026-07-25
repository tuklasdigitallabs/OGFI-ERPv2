import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

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
    expect(source).toContain("Request PO Amendment");
    expect(source).toContain("Changes require approval and remain in the PO audit history.");
    expect(source).toContain('size="workspace"');
    expect(source).toContain("min-h-11");
  });
});
