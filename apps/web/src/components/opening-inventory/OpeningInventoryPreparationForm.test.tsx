import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./OpeningInventoryPreparationForm.tsx", import.meta.url)), "utf8");

describe("opening inventory preparation draft storage", () => {
  it("uses session-only storage scoped by tenant, user, cohort, and count attempt", () => {
    expect(source).toContain("window.sessionStorage");
    expect(source).not.toContain("window.localStorage");
    expect(source).toContain("${tenantId}:${userId}:${cohortId}:${attemptId}");
  });

  it("recovers incomplete costs without hidden required-input traps and pages 11-plus lines", () => {
    expect(source).toContain("Show incomplete lines");
    expect(source).toContain("incompleteIds.size");
    expect(source).toContain("required={visible && Number(line.countedQuantityBaseUom) > 0}");
    expect(source).toContain("const pageSize = 10");
    expect(source).toContain("Load 10 more immutable lines");
  });
});
