import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");

describe("opening inventory preparation task", () => {
  it("uses a focused route with controlled evidence and server-owned preparation", () => {
    expect(source).toContain("Focused immutable valuation task");
    expect(source).toContain("getOpeningInventoryPreparationFormOptions");
    expect(source).toContain("ControlledEvidencePanel");
    expect(source).toContain("prepareOpeningInventoryCutover");
  });

  it("returns action errors to the same cohort and attempt", () => {
    expect(source).toContain("/opening-inventory/prepare?cohort=");
    expect(source).toContain("attempt=${encodeURIComponent(attemptId)}");
  });

  it("scopes temporary preparation drafts to the authenticated tenant and user", () => {
    expect(source).toContain("tenantId={session.context.tenantId}");
    expect(source).toContain("userId={session.user.id}");
  });

  it("clears the session draft only after an explicit successful preparation signal", () => {
    expect(source).toContain("prepared=1");
    expect(source).toContain("preparedAttempt=");
    expect(source).toContain("OpeningInventoryDraftClearer");
  });

  it("server-pages eligible evidence while preserving cohort and attempt", () => {
    expect(source).toContain("evidencePageSize: 10");
    expect(source).toContain("eligibleEvidencePage");
    expect(source).toContain("new URLSearchParams({ cohort: cohort.id");
  });
});
