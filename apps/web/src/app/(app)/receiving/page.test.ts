import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);

describe("Receiving Follow-up dashboard profile", () => {
  it("uses the closed server-owned profile and server pagination", () => {
    expect(source).toContain("resolveReceivingDashboardProfile(profileParam)");
    expect(source).toContain("listReceivingDashboardProfilePage(session, profile");
    expect(source).toContain("receivingDashboardProfileHref(profile");
    expect(source).toContain("profilePage.pageSize");
    expect(source).toContain("Receiving Follow-up is unavailable");
    expect(source).toContain("Back to Overview");
    expect(source).toContain("Open Receiving workspace");
  });

  it("is visibly read-only and explains its operational population", () => {
    expect(source).toContain("Receiving Follow-up");
    expect(source).toContain("Dashboard profile");
    expect(source).toContain("unposted drafts, posting receipts, and active discrepancy records");
    expect(source).toContain("does not resolve discrepancies or grant posting, reversal");
    expect(source).toContain("View Receiving Report");
  });

  it("does not render create or inline posting controls in profile mode", () => {
    expect(source).toContain("!profile && canCreateReceiving");
    expect(source).toContain('receipt.status === "DRAFT" && canPostReceiving');
    expect(source).toContain("!profile && visibleReceipts.length > 0");
  });

  it("keeps search inside the profile and preserves it during paging/export", () => {
    expect(source).toContain('name="dashboard"');
    expect(source).toContain('name="q"');
    expect(source).toContain("GRN, PO, or supplier");
    expect(source).toContain("encodeURIComponent(profilePage.query)");
    expect(source).toContain("query: profilePage.query");
    expect(source).toContain("Search is too long");
    expect(source).toContain("from=${profile}&page=${profilePage.page}");
  });
});
