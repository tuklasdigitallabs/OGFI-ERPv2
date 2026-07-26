import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");
const loadingSource = readFileSync(fileURLToPath(new URL("./loading.tsx", import.meta.url)), "utf8");
const errorSource = readFileSync(fileURLToPath(new URL("./error.tsx", import.meta.url)), "utf8");

describe("closed stock-balance dashboard profile UI", () => {
  it("fails closed before the balance read for invalid or widening profile input", () => {
    expect(source).toContain("resolveInventoryBalanceDashboardRequest(params.dashboard, params.q)");
    expect(source).toContain('new Set(["dashboard", "q", "page"])');
    expect(source).toContain("!profileQueryKeys.has(key)");
    expect(source).toContain("Stock balance profile cannot be opened safely");
    expect(source.indexOf("!profileRequest.profile")).toBeLessThan(
      source.indexOf("await listInventoryBalancePage(session")
    );
  });

  it("preserves the closed profile through search, paging, and export", () => {
    expect(source).toContain('exportParams.set("dashboard", dashboardProfile)');
    expect(source).toContain('<input type="hidden" name="dashboard" value={dashboardProfile} />');
    expect(source).toContain("inventoryBalanceDashboardProfileHref(dashboardProfile");
    expect(source).toContain("inventoryLedgerHref(");
    expect(source).toContain("returnTo");
    expect(source).toContain("Open all stock balances");
  });

  it("describes a live read-only profile and keeps ordinary tabs out of profile mode", () => {
    expect(source).toContain("live inquiry, not a historical snapshot");
    expect(source).toContain("Search may only narrow that fixed population");
    expect(source).toContain("dashboardProfile ? (");
    expect(source).toContain("Only current positive balance rows are included");
    expect(source).toContain("Only existing balance rows at exactly zero are included");
    expect(source).toContain("Only rows with a non-blank lot number or an expiry date are included");
    expect(source).toContain("not a historical snapshot of the dashboard value or an automatic replenishment queue");
    expect(source).toContain("does not measure tracking-policy compliance or complete traceability");
  });

  it("provides profile-aware empty, loading, error, and accessible control states", () => {
    expect(source).toContain("No positive stock rows match this search");
    expect(source).toContain("No zero stock rows match this search");
    expect(source).toContain("This does not confirm that every catalog item is stocked");
    expect(source).toContain("No rows with lot or expiry data match this search");
    expect(source).toContain('dashboardProfile === "lot-expiry-data-v1" ? "Not recorded"');
    expect(source).toContain("narrow Search and try again; no partial file is downloaded");
    expect(source).not.toContain('className="min-h-9');
    expect(source).not.toContain('className="min-h-10');
    expect(source).toContain('controlClassName="min-h-11"');
    expect(source).toContain('className="min-h-11 rounded-md border border-slate-300 px-3 py-2"');
    expect(source).toContain('balance.lotNumber?.trim() || "Not recorded"');
    for (const label of ["On hand: ", "Lot: ", "Expiry: ", "Storage: ", "Updated: "]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("md:hidden");
    expect(loadingSource).toContain('aria-live="polite"');
    expect(loadingSource).toContain("animate-pulse");
    expect(errorSource).toContain('role="alert"');
    expect(errorSource).toContain("onClick={reset}");
    expect(errorSource).toContain("min-h-11");
  });
});
