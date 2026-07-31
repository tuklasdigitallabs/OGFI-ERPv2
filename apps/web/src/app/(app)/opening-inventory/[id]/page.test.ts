import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");

describe("opening inventory controlled detail", () => {
  it("has required detail subworkspaces and server-owned tab pagination", () => {
    for (const tab of ["Summary", "Immutable Lines", "Evidence", "Approvals", "Activity"]) expect(source).toContain(tab);
    expect(source).toContain("getOpeningInventoryCutoverDetail(session, id, { tab: activeTab, page, pageSize: 10 })");
    expect(source).toContain("<PaginationBar");
    expect(source).not.toContain("OpeningInventoryIncrementalList");
  });

  it("keeps controlled commands separate from inventory posting", () => {
    expect(source).toContain("This requests an immutable command only.");
    expect(source).toContain("never posts inventory, activates a cohort, or reverses stock itself");
    expect(source).toContain("requestOpeningInventoryExecutionCommand");
  });

  it("paginates 11-plus lines, evidence, and combined activity by URL", () => {
    expect(source).toContain('pageHref("lines", next)');
    expect(source).toContain('pageHref("evidence", next)');
    expect(source).toContain('pageHref("activity", next)');
    expect(source).toContain("cohortSharedVisible");
  });

  it("shows command lifecycle and suppresses duplicate retryable requests", () => {
    expect(source).toContain("FAILED_RETRYABLE");
    expect(source).toContain("safe failure code");
    expect(source).toContain("commandInFlight");
  });

  it("keeps an unavailable detail non-enumerating and actionable", () => {
    expect(source).toContain("Opening inventory batch unavailable");
    expect(source).toContain("This opening inventory batch is unavailable or outside your authorized scope.");
    expect(source).toContain('href="/opening-inventory"');
    expect(source).not.toContain('catch { redirect("/opening-inventory"); }');
  });

  it("separates unavailable evidence from live-scope restriction without exposing metadata", () => {
    expect(source).toContain("cutover.evidenceUnavailable ?");
    expect(source).toContain("Evidence is temporarily unavailable");
    expect(source).toContain("No evidence details are shown.");
    expect(source).toContain("Retry evidence");
    expect(source).toContain("contact support");
    expect(source).toContain("cutover.cohortSharedVisible ?");
    expect(source.indexOf("cutover.evidenceUnavailable ?")).toBeLessThan(
      source.indexOf("file.originalFilename"),
    );
  });

  it("keeps the record context ahead of the action panel on mobile", () => {
    expect(source).not.toContain("order-first");
    expect(source).toContain("{session.context.companyName} / {cutover.inventoryLocation.location.name}");
  });
});
