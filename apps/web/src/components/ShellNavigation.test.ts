import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
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

describe("Inventory Control Pilot navigation", () => {
  function navigationWithAllAccess(inventoryControlPilot: boolean) {
    return getNavigationSections(
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      inventoryControlPilot,
    );
  }

  it("keeps deferred workspaces visible and labels them without changing routes", () => {
    const sections = navigationWithAllAccess(true);
    const expectedDeferredRoutes = new Map([
      ["phase-1-5", "/projects"],
      ["restaurant-ops", "/branch-operations"],
      ["workforce", "/workforce"],
      ["marketing", "/marketing/calendar"],
      ["expansion", "/expansion"],
      ["finance", "/finance"],
    ]);

    for (const [sectionId, route] of expectedDeferredRoutes) {
      const section = sections.find((candidate) => candidate.id === sectionId);

      expect(section?.releaseStatus).toBe("Deferred");
      expect(section?.items.some((item) => item.href === route)).toBe(true);
      expect(
        section?.items.every((item) => item.releaseStatus === "Deferred"),
      ).toBe(true);
    }
  });

  it("does not relabel the active pilot or administration workspaces", () => {
    const sections = navigationWithAllAccess(true);

    for (const sectionId of [
      "operations",
      "procurement",
      "inventory",
      "admin",
    ]) {
      expect(
        sections.find((section) => section.id === sectionId)?.releaseStatus,
      ).toBeUndefined();
    }
  });

  it("does not expand permissions merely because the pilot profile is active", () => {
    const sections = getNavigationSections(
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
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    );

    expect(sections.some((section) => section.id === "finance")).toBe(false);
    expect(sections.some((section) => section.id === "marketing")).toBe(false);
    expect(sections.some((section) => section.id === "expansion")).toBe(false);
  });

  it("leaves standard navigation without pilot release labels", () => {
    const standardSections = navigationWithAllAccess(false);

    expect(
      standardSections.every((section) => section.releaseStatus === undefined),
    ).toBe(true);
  });

  it("changes only release labels across the complete authorized navigation projection", () => {
    const withoutReleaseStatus = (sections: ReturnType<typeof getNavigationSections>) =>
      sections.map(({ releaseStatus: _sectionStatus, items, ...section }) => ({
        ...section,
        items: items.map(({ releaseStatus: _itemStatus, ...item }) => item),
      }));

    expect(withoutReleaseStatus(navigationWithAllAccess(true))).toEqual(
      withoutReleaseStatus(navigationWithAllAccess(false)),
    );
  });

  it("renders truthful release labels for expanded, collapsed, and mobile navigation", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "ShellNavigation.tsx"),
      "utf8",
    );

    expect(source).toMatch(/aria-label=\{\s*section\.releaseStatus/);
    expect(source).toContain("!collapsed && section.releaseStatus");
    expect(source).toMatch(/mobileNavigationItems\.map[\s\S]*item\.releaseStatus/);
    expect(source).toContain("{item.releaseStatus}");
  });
});
