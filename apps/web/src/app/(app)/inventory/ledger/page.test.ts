import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);
const loadingSource = readFileSync(
  fileURLToPath(new URL("./loading.tsx", import.meta.url)),
  "utf8"
);
const errorSource = readFileSync(
  fileURLToPath(new URL("./error.tsx", import.meta.url)),
  "utf8"
);

describe("exact inventory ledger trace UI", () => {
  it("normalizes the complete trace tuple and never falls back after invalid input", () => {
    expect(source).toContain("normalizeInventoryMovementFilters({");
    expect(source).toContain("traceError = hasTraceInput");
    expect(source).toContain("Ledger trace cannot be opened safely");
    expect(source).toContain("No generic ledger search was substituted");
  });

  it("reconstructs only a local closed-profile return link", () => {
    expect(source).toContain('url.pathname !== "/inventory/reconciliation"');
    expect(source).toContain("resolveInventoryDashboardProfile(");
    expect(source).toContain("inventoryDashboardProfileHref(profile");
  });

  it("locks exact trace presentation and suppresses the generic ledger export", () => {
    expect(source).toContain("Exact trace active");
    expect(source).toContain("canExportLedger && !isExactTrace");
  });

  it("uses the dual-authorized trace service instead of the capped generic list", () => {
    expect(source).toContain("getInventoryLedgerVarianceTracePage(session");
    expect(source).toContain("const movements = tracePage");
    expect(source).toContain("? tracePage.items");
    expect(source).toContain(
      "!session.permissionCodes.includes(permissions.inventoryBalanceView)"
    );
    expect(source).toContain("Showing ${traceRangeStart}–${traceRangeEnd} of");
  });

  it("paginates the complete exact trace without silently claiming only 100 rows", () => {
    expect(source).toContain("<PaginationBar");
    expect(source).toContain('getSearchParam(params, "tracePage")');
    expect(source).toContain('params.set("tracePage", String(input.page))');
    expect(source).toContain("totalItems={tracePage.totalItems}");
    expect(source).toContain("returnHref");
    expect(source).toContain("listInventoryMovementPage");
    expect(source).toContain('getSearchParam(params, "page")');
    expect(source).toContain("source-linked movements`");
  });

  it("warns when a trace is resolved even if historical movements remain", () => {
    expect(source).toContain("tracePage && !tracePage.isCurrentVariance");
    expect(source).toContain("STALE / RESOLVED");
    expect(source).toContain("Historical movements remain available for audit");
    expect(source.indexOf("tracePage && !tracePage.isCurrentVariance")).toBeLessThan(
      source.indexOf("movements.length === 0")
    );
  });

  it("uses 44px touch targets and scoped loading and retryable error states", () => {
    expect(source).toContain('controlClassName="min-h-11"');
    expect(source).not.toContain('className="min-h-10');
    expect(source).not.toContain('className="min-h-9');
    expect(loadingSource).toContain('aria-live="polite"');
    expect(loadingSource).toContain("animate-pulse");
    expect(errorSource).toContain('role="alert"');
    expect(errorSource).toContain("onClick={reset}");
    expect(errorSource).toContain("min-h-11");
  });
});
