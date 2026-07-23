import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
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
