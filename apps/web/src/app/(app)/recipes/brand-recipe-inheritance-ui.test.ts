import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const recipesPage = readFileSync(path.resolve(__dirname, "page.tsx"), "utf8");
const createRecipePage = readFileSync(
  path.resolve(__dirname, "new/page.tsx"),
  "utf8",
);
const brandContextSelect = readFileSync(
  path.resolve(__dirname, "_components/RecipeBrandContextSelect.tsx"),
  "utf8",
);
const recipeDetailPage = readFileSync(
  path.resolve(__dirname, "[id]/page.tsx"),
  "utf8",
);
const rolloutImpactPreview = readFileSync(
  path.resolve(__dirname, "_components/RecipeRolloutImpactPreview.tsx"),
  "utf8",
);
const settingsPage = readFileSync(
  path.resolve(__dirname, "../servings/settings/page.tsx"),
  "utf8",
);
const settingsForms = readFileSync(
  path.resolve(
    __dirname,
    "../../../components/RestaurantConsumptionSettingsForms.tsx",
  ),
  "utf8",
);
const servingEditor = readFileSync(
  path.resolve(__dirname, "../../../components/ServingDeclarationEditor.tsx"),
  "utf8",
);

describe("brand recipe inheritance visible controls", () => {
  test("makes brand ownership and Company-shared adoption explicit", () => {
    expect(recipesPage).toContain("Recipe brand");
    expect(recipesPage).toContain("RecipeBrandContextSelect");
    expect(recipesPage).toContain("Cross-brand recipes excluded");
    expect(recipesPage).toContain("Company-shared · adopted by brand");
    expect(settingsForms).toContain("Adopt a Company-shared recipe");
    expect(settingsForms).toContain("Adoption makes the formula eligible");
    expect(createRecipePage).toContain('name="brandId"');
    expect(createRecipePage).toContain("manageableBrands.map");
    expect(createRecipePage).toContain("Company-shared recipe");
    expect(createRecipePage.indexOf("Recipe identity")).toBeLessThan(
      createRecipePage.indexOf('name="brandId"'),
    );
    expect(brandContextSelect).toContain('type="button"');
    expect(brandContextSelect).not.toContain("<form");
    expect(brandContextSelect).toContain('query.set("brandId", nextBrandId)');
    expect(brandContextSelect).not.toContain("/api/context/location");
    expect(recipesPage).toContain("getRecipeBrandScopeOptions(session)");
    expect(recipesPage).not.toContain(
      "for (const location of session.authorizedLocations)",
    );
  });

  test("uses brand defaults with focused branch exceptions instead of repeated inherit forms", () => {
    expect(settingsForms).toContain("Brand default");
    expect(settingsForms).toContain("Branch override");
    expect(settingsForms).toContain("Branch availability");
    expect(settingsForms).toContain(
      "Unavailable masks both the branch override",
    );
    expect(settingsForms).toContain("End override and resume brand default");
    expect(settingsForms).toContain("Cancel scheduled policy");
    expect(settingsForms).toContain("idempotencyKey");
    expect(settingsForms).toContain("canManageBranchExceptions");
    expect(settingsPage).toContain("Menu readiness register");
    expect(settingsPage).toContain("menuRecipePolicyPermissions");
  });

  test("keeps publication formula-only and identifies rollout as a separate action", () => {
    expect(recipeDetailPage).toContain(
      "Publishing approves this formula version only",
    );
    expect(recipeDetailPage).toMatch(
      /Brand\s+rollout remains a separate permissioned action/,
    );
    expect(recipeDetailPage).not.toContain("consumptionRolloutIntent");
    expect(recipeDetailPage).toContain(
      "Roll out published recipe to brand menu",
    );
    expect(recipeDetailPage).toContain(
      "previewRecipePublicationConsumptionImpact",
    );
    expect(rolloutImpactPreview).toContain("previewSnapshotHash");
    expect(rolloutImpactPreview).toContain("Existing branch overrides");
    expect(rolloutImpactPreview).toContain(
      "Page {currentPage} of {totalPages}",
    );
  });

  test("distinguishes quantity readiness from cost evidence", () => {
    expect(recipesPage).toContain("cost evidence pending");
    expect(recipeDetailPage).toMatch(
      /authoritative peso\s+food-cost analysis remains pending/,
    );
    expect(servingEditor).toMatch(
      /Pending cost\s+evidence does not block quantity entry/,
    );
    expect(servingEditor).toContain("Missing recipe setup is shown as a");
    expect(servingEditor).toContain("verification will be blocked");
    expect(servingEditor).toContain("Brand default");
    expect(servingEditor).toContain("Branch override");
  });
});
