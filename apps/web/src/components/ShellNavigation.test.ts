import { describe, expect, it } from "vitest";
import { getNavigationSections } from "./ShellNavigation";

function navigationForRecipeAccess(
  canUseRecipesAndCosting: boolean,
  canAdminister = false
) {
  return getNavigationSections(
    canAdminister,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    canUseRecipesAndCosting
  );
}

describe("Food Cost Analysis navigation", () => {
  it("links authorized users to the authoritative analysis workspace", () => {
    const item = navigationForRecipeAccess(true)
      .flatMap((section) => section.items)
      .find((candidate) => candidate.label === "Food Cost Analysis");

    expect(item).toMatchObject({
      href: "/recipes/analysis",
      activeKey: "food-cost",
      badge: "Source"
    });
    expect(item?.disabled).not.toBe(true);
  });

  it("does not expose the Food Cost source link without recipe or costing access", () => {
    const item = navigationForRecipeAccess(false)
      .flatMap((section) => section.items)
      .find((candidate) => candidate.label === "Food Cost Analysis");

    expect(item).toBeUndefined();
  });

  it("does not treat broad administration as Food Cost source authorization", () => {
    const item = navigationForRecipeAccess(false, true)
      .flatMap((section) => section.items)
      .find((candidate) => candidate.label === "Food Cost Analysis");

    expect(item).toBeUndefined();
  });
});
