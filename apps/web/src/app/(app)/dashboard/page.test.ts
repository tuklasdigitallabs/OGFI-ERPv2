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
    expect(source).toContain('"Open source"');
    expect(source).not.toContain("Recipes and Menu Costing");
    expect(source).not.toContain(
      'available: dashboard.metrics.some((metric) => metric.id === "restaurant-net-sales")'
    );
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
