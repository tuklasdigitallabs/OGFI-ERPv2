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

describe("ledger variance reconciliation profile UI", () => {
  it("requires both inventory read permissions before resolving the profile", () => {
    const balancePermission = source.indexOf("permissions.inventoryBalanceView");
    const ledgerPermission = source.indexOf("permissions.inventoryLedgerView");
    const profileResolution = source.indexOf("resolveInventoryDashboardProfile(profileParam)");

    expect(balancePermission).toBeGreaterThan(-1);
    expect(ledgerPermission).toBeGreaterThan(-1);
    expect(profileResolution).toBeGreaterThan(ledgerPermission);
  });

  it("fails closed for invalid profiles and overlong search before the profile read", () => {
    expect(source).toContain("if (!profile)");
    expect(source).toContain("query.length > maxInventorySearchLength");
    expect(source.indexOf("query.length > maxInventorySearchLength")).toBeLessThan(
      source.indexOf("listInventoryLedgerVarianceProfilePage(session")
    );
  });

  it("renders responsive diagnostic rows, exact traces, and no mutation controls", () => {
    expect(source).toContain("View ledger trace");
    expect(source).toContain('returnTo=${encodeURIComponent(returnHref)}');
    expect(source).toContain("md:grid-cols-");
    expect(source).toContain("This profile cannot repair stock");
    expect(source).not.toContain("action={");
  });

  it("keeps diagnostic rows but suppresses decision-ready KPI copy in block mode", () => {
    expect(source).toContain("NOT FOR OPERATIONAL DECISION");
    expect(source).toContain("Diagnostic rows only");
    expect(source).toContain("!isTrustBlocked");
  });

  it("uses 44px touch targets and scoped loading and retryable error states", () => {
    expect(source).toContain('controlClassName="min-h-11"');
    expect(source).not.toContain('className="min-h-10');
    expect(loadingSource).toContain('aria-live="polite"');
    expect(loadingSource).toContain("animate-pulse");
    expect(errorSource).toContain('role="alert"');
    expect(errorSource).toContain("onClick={reset}");
    expect(errorSource).toContain("min-h-11");
  });
});
