import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DASHBOARD_TIME_ZONE,
  formatDashboardCheckedAt
} from "./sourceObservation";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);
const loadingSource = readFileSync(
  fileURLToPath(new URL("./loading.tsx", import.meta.url)),
  "utf8"
);
const globalStyleSource = readFileSync(
  fileURLToPath(new URL("../../globals.css", import.meta.url)),
  "utf8"
);
const reportSource = source.slice(
  source.indexOf("function DashboardReports"),
  source.indexOf("function DashboardNotifications")
);

describe("DEC-0071 dashboard presentation", () => {
  it("removes Food Cost analytical identifiers and claims from Overview", () => {
    expect(source).not.toContain('"restaurant-net-sales"');
    expect(source).not.toContain('"theoretical-food-cost"');
    expect(source).not.toContain('"actual-food-cost"');
    expect(source).not.toContain('"food-cost-variance"');
    expect(source).not.toContain(
      "restaurant operations, and food cost"
    );
  });

  it("keeps only a permission-gated neutral Food Cost source shortcut", () => {
    expect(source).toContain(
      "canOpenFoodCostAnalysis={canUseRecipesAndCosting(session.permissionCodes)}"
    );
    expect(source).toContain("...(canOpenFoodCostAnalysis");
    expect(source).toContain('href: "/recipes/analysis"');
    expect(source).toContain("Source workspace");
    expect(source).toContain('"Open source workspace"');
    expect(source).not.toContain("Recipes and Menu Costing");
    expect(source).not.toContain(
      'available: dashboard.metrics.some((metric) => metric.id === "restaurant-net-sales")'
    );
  });
});

describe("DEC-0238 truthful operational source views", () => {
  it("keeps the reports URL compatible while presenting a typed destination directory", () => {
    expect(source).toContain('reports: "Source views"');
    expect(source).toContain("Operational source views");
    expect(source).toContain("Exact operational views");
    expect(source).toContain("Source workspaces");
    expect(source).toContain("Exact scoped view");
    expect(source).toContain("Open exact view");
    expect(source).toContain("Open source workspace");
    expect(source).toContain("{destinations.length} destinations");
    expect(source).toContain("No source destinations available");
    expect(source).not.toContain("report views");
    expect(source).not.toContain("Open report source");
    expect(source).not.toContain("Data available");
  });

  it("keeps the longer source-view tab usable on narrow touch screens", () => {
    expect(globalStyleSource).toMatch(/\.ogfi-tab-list\s*\{[^}]*overflow-x: auto;/s);
    expect(globalStyleSource).toMatch(/\.ogfi-tab\s*\{[^}]*min-height: 2\.75rem;/s);
    expect(globalStyleSource).toMatch(/\.ogfi-tab\s*\{[^}]*flex: 0 0 auto;/s);
  });

  it("uses authorized source enrollment and service-owned exact profile helpers", () => {
    expect(source).toContain("dashboard.sourceObservations.map");
    expect(source).toContain("return source ? [{ ...destination, source }] : []");
    expect(source).toContain('receivingDashboardProfileHref("receiving-follow-up-v1")');
    expect(source).toContain('transferDashboardProfileHref("transfer-follow-up-v1")');
    expect(source).toContain('wastageDashboardProfileHref("wastage-exceptions-v1")');
    expect(source).toContain(
      'stockAdjustmentDashboardProfileHref("stock-adjustment-exceptions-v1")'
    );
    expect(source).toContain(
      'branchOperationsDashboardProfileHref("branch-checklist-exceptions-v1")'
    );
    expect(source).toContain(
      'foodSafetyDashboardProfileHref("food-safety-exceptions-v1")'
    );
    expect(source).toContain('incidentDashboardProfileHref("incident-open-v1")');
    expect(source).toContain(
      'maintenanceDashboardProfileHref("maintenance-follow-up-v1")'
    );
  });

  it("splits controlled populations and removes unsupported semantic claims", () => {
    expect(source).toContain('title: "Wastage Exceptions"');
    expect(source).toContain('title: "Stock Adjustment Exceptions"');
    expect(source).toContain('title: "Branch Checklist Exceptions"');
    expect(source).toContain('title: "Open Incidents"');
    expect(source).toContain('title: "Maintenance Follow-up"');
    expect(source).not.toContain("Wastage and Adjustments");
    expect(source).not.toContain("Branch Checklist Compliance");
    expect(source).not.toContain("Incident Corrective Actions");
    expect(source).not.toContain("Maintenance SLA and Downtime");
  });

  it("distinguishes dashboard read failure from zero records", () => {
    expect(reportSource).toContain("Dashboard source");
    expect(reportSource).toContain('? "available" : "unavailable"');
    expect(reportSource).not.toContain("dashboard.cards.some");
    expect(reportSource).not.toContain("dashboard.stockHealth.length > 0");
  });
});

describe("DEC-0072 dashboard source observation presentation", () => {
  it("labels the response assembly time explicitly in Asia/Manila", () => {
    expect(DASHBOARD_TIME_ZONE).toBe("Asia/Manila");
    expect(formatDashboardCheckedAt("2026-07-23T00:00:00.000Z")).toMatch(
      /Jul 23,? 2026.*8:00:00.*Asia\/Manila/i
    );
    expect(source).toContain(
      "Dashboard assembled {formatDashboardCheckedAt(dashboard.assembledAt)}"
    );
    expect(source).not.toContain("Live source records");
    expect(source).not.toContain("Updated {new Date(dashboard.generatedAt)");
  });

  it("uses an accessible compact disclosure for every attempted authorized source", () => {
    expect(source).toContain("<details");
    expect(source).toContain("<summary className=");
    expect(source).toContain("min-h-11");
    expect(source).toContain("sources.map");
    expect(source).toContain('open={isPartialResponse}');
    expect(source).toContain("All attempted sources available · show details");
    expect(source).toContain("Some dashboard sources were unavailable");
    expect(source).toContain('href={source.href}');
    expect(source).toContain("Open source");
    expect(source).toContain(
      'source.availability === "AVAILABLE" ? "Available" : "Unavailable"'
    );
  });

  it("explains observation limits and protects partial totals and empty states", () => {
    expect(source).toContain(
      "Checked times show when this dashboard response observed each source."
    );
    expect(source).toMatch(
      /They do not\s+show when records changed and do not prove completeness or an SLA\./
    );
    expect(source).toContain("Totals, zero values, and empty queues may omit records.");
    expect(source).toContain("shown from available sources");
    expect(source).toContain("No items shown from available sources");
    expect(source).toContain("Zero in available sources");
    expect(source).toContain("Approval alerts from available sources");
    expect(source).toContain("Exception alerts from available sources");
    expect(source).not.toContain('card.value > 0 ? "Action" : "Clear"');
  });

  it("places the source warning before Today’s Work and keeps trust gates separate", () => {
    expect(source.indexOf("<SourceObservationDisclosure dashboard={dashboard} />")).toBeLessThan(
      source.indexOf('activeView === "overview"')
    );
    const disclosure = source.slice(
      source.indexOf("function SourceObservationDisclosure"),
      source.indexOf("function chartToneClass")
    );
    expect(disclosure).not.toContain("trustGate");
  });

  it("does not make freshness or completeness claims", () => {
    expect(source).not.toContain(">Fresh<");
    expect(source).not.toContain(">Stale<");
    expect(source).not.toContain(">Complete<");
  });

  it("keeps the loading hierarchy aligned with scope, source status, and action queues", () => {
    expect(loadingSource).toContain('aria-busy="true"');
    expect(loadingSource).toContain("dashboard source status");
    expect(loadingSource).toContain("today&apos;s work");
    expect(loadingSource).toContain("xl:grid-cols-2");
  });
});

describe("DEC-0234 stock balance signal suppression", () => {
  it("uses a balanced responsive three-profile strip without the cache-recency card", () => {
    expect(source).toContain('className="grid gap-3 p-4 md:grid-cols-3"');
    expect(source).not.toContain('"recent-stock-updates"');
    expect(source).not.toContain("Updated this week");
  });
});

describe("DEC-0235 PO monetary signal suppression", () => {
  it("does not retain monetary card icon registrations or labels", () => {
    expect(source).not.toContain('"po-commitment-value"');
    expect(source).not.toContain('"open-po-exposure"');
    expect(source).not.toContain('"received-po-value"');
    expect(source).not.toContain("PO commitment");
    expect(source).not.toContain("Open PO exposure");
    expect(source).not.toContain("Received value");
  });
});
