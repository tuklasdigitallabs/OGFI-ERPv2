import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getMobileOperationalNavItems,
  getMobilePreviewRailItems,
  getNavigationSections
} from "../src/components/ShellNavigation";
import {
  getDashboardSnapshotItems,
  getModulePreviewActions
} from "../src/server/mockups/modulePreviewAccess";
import { modulePreviews, type ModulePreviewKey } from "../src/server/mockups/modulePreviews";
import { permissions } from "../src/server/services/authorization";
import type { SessionContext } from "../src/server/services/context";

const appRouteRoot = fileURLToPath(new URL("../src/app/(app)/", import.meta.url));

const previewRoutes = {
  dashboard: "dashboard/page.tsx",
  reports: "reports/page.tsx",
  notifications: "notifications/page.tsx",
  projects: "projects/page.tsx",
  myWork: "my-work/page.tsx",
  workBoards: "work-boards/page.tsx",
  workCalendar: "work-calendar/page.tsx",
  marketingCalendar: "marketing/calendar/page.tsx",
  campaigns: "marketing/campaigns/page.tsx",
  promotions: "marketing/promotions/page.tsx",
  itemLaunches: "marketing/item-launches/page.tsx",
  creativeBoard: "marketing/creative-board/page.tsx",
  expansionDashboard: "expansion/page.tsx",
  sitePipeline: "expansion/sites/page.tsx",
  lifecycleGates: "expansion/gates/page.tsx",
  permits: "expansion/permits/page.tsx",
  constructionBoard: "expansion/construction/page.tsx",
  openingReadiness: "expansion/readiness/page.tsx",
  punchList: "expansion/punch-list/page.tsx",
  financeOverview: "finance/page.tsx",
  generalLedger: "finance/general-ledger/page.tsx",
  accountsPayable: "finance/accounts-payable/page.tsx",
  bankCash: "finance/bank-cash/page.tsx",
  periodClose: "finance/period-close/page.tsx",
  adminSettings: "admin/settings/page.tsx"
} satisfies Record<ModulePreviewKey, string>;

const implementedRouteAssertions: Partial<Record<ModulePreviewKey, string[]>> = {
  expansionDashboard: ["getExpansionDashboard", "getExpansionReportRollups"],
  sitePipeline: ["listExpansionSitePipeline", "createProject(formData)"],
  lifecycleGates: [
    "getExpansionLifecycleGates",
    "transitionExpansionLifecycleGate"
  ],
  permits: ["getExpansionPermitDocuments", "createExpansionPermitDocument"],
  constructionBoard: [
    "getExpansionConstructionBoard",
    "createExpansionConstructionTask"
  ],
  openingReadiness: [
    "getExpansionOpeningReadiness",
    "createExpansionOpeningReadiness"
  ],
  punchList: ["getExpansionPunchList", "createExpansionPunchListItem"],
  financeOverview: ["getFinanceFoundationDashboard"],
  generalLedger: ["getFinanceFoundationDashboard"],
  accountsPayable: ["getFinanceFoundationDashboard"],
  bankCash: ["getFinanceFoundationDashboard"],
  periodClose: ["getPeriodCloseDashboard"]
};

function allNavItems(sections: ReturnType<typeof getNavigationSections>) {
  return sections.flatMap((section) => section.items);
}

function routePathForHref(href: string) {
  const pathname = href.split("?")[0] ?? href;
  return `${appRouteRoot}${pathname.slice(1)}/page.tsx`;
}

function appPageSource(routePath: string) {
  return readFileSync(`${appRouteRoot}${routePath}`, "utf8");
}

describe("module preview navigation", () => {
  it("keeps every configured preview wired to a route page", () => {
    expect(Object.keys(previewRoutes).sort()).toEqual(Object.keys(modulePreviews).sort());

    for (const [previewKey, routePath] of Object.entries(previewRoutes)) {
      const filePath = `${appRouteRoot}${routePath}`;

      expect(existsSync(filePath), `${routePath} exists`).toBe(true);
      if (previewKey === "notifications") {
        expect(readFileSync(filePath, "utf8")).toContain("listNotifications(session");
        continue;
      }
      if (previewKey === "dashboard") {
        expect(readFileSync(filePath, "utf8")).toContain("getOperationalDashboard(session");
        expect(readFileSync(filePath, "utf8")).not.toContain("renderModulePreview");
        continue;
      }
      if (previewKey === "reports") {
        expect(readFileSync(filePath, "utf8")).toContain("listOperationalReports(session");
        expect(readFileSync(filePath, "utf8")).not.toContain("renderModulePreview");
        continue;
      }
      if (previewKey === "adminSettings") {
        expect(readFileSync(filePath, "utf8")).toContain("listCompanyPolicySettings(session)");
        expect(readFileSync(filePath, "utf8")).toContain("updateCompanyPolicySetting(formData)");
        expect(readFileSync(filePath, "utf8")).not.toContain("renderModulePreview");
        continue;
      }
      if (previewKey === "projects") {
        expect(readFileSync(filePath, "utf8")).toContain("listProjects(session");
        expect(readFileSync(filePath, "utf8")).not.toContain("renderModulePreview");
        continue;
      }
      if (previewKey === "myWork") {
        expect(readFileSync(filePath, "utf8")).toContain("listMyProjectTasks(session");
        expect(readFileSync(filePath, "utf8")).not.toContain("renderModulePreview");
        continue;
      }
      if (previewKey === "workBoards") {
        expect(readFileSync(filePath, "utf8")).toContain("listProjectBoardTasks");
        expect(readFileSync(filePath, "utf8")).toContain("listProjectBoardStatuses");
        expect(readFileSync(filePath, "utf8")).not.toContain("renderModulePreview");
        continue;
      }
      if (previewKey === "workCalendar") {
        expect(readFileSync(filePath, "utf8")).toContain("listProjectCalendarEvents");
        expect(readFileSync(filePath, "utf8")).not.toContain("renderModulePreview");
        continue;
      }
      const implementedAssertions =
        implementedRouteAssertions[previewKey as ModulePreviewKey];
      if (implementedAssertions) {
        const source = readFileSync(filePath, "utf8");
        for (const assertion of implementedAssertions) {
          expect(source).toContain(assertion);
        }
        expect(source).not.toContain("renderModulePreview");
        continue;
      }
      expect(readFileSync(filePath, "utf8")).toContain(`renderModulePreview("${previewKey}")`);
    }
  });

  it("keeps preview active nav keys present in the admin navigation", () => {
    const sections = getNavigationSections(
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
      true
    );
    const activeKeys = new Set(
      sections.flatMap((section) => section.items.map((item) => item.activeKey))
    );

    for (const config of Object.values(modulePreviews)) {
      expect(activeKeys.has(config.activeNav), `${config.activeNav} is in nav`).toBe(true);
    }
  });

  it("shows procurement navigation when a user only has receiving access", () => {
    const sections = getNavigationSections(
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false
    );
    const procurement = sections.find((section) => section.id === "procurement");

    expect(procurement?.items.map((item) => item.href ?? null)).toEqual([
      null,
      "/receiving"
    ]);
  });

  it("does not expose admin-only preview modules in non-admin navigation", () => {
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
      false
    );
    const visibleActiveKeys = new Set(allNavItems(sections).map((item) => item.activeKey));
    const adminOnlyPreviewKeys = Object.values(modulePreviews)
      .filter((config) => config.requiresAdmin)
      .map((config) => config.activeNav);

    expect([...visibleActiveKeys].sort()).toEqual([
      "dashboard",
      "knowledge-base"
    ]);
    for (const activeKey of adminOnlyPreviewKeys) {
      expect(visibleActiveKeys.has(activeKey), `${activeKey} is hidden from non-admin nav`).toBe(
        false
      );
    }
    expect(getMobilePreviewRailItems(sections).map((item) => item.activeKey)).toEqual([
      "knowledge-base"
    ]);
  });

  it("gives evidence-register users a dedicated admin route without core admin", () => {
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
      true,
    );
    const admin = sections.find((section) => section.id === "admin");
    expect(admin?.items).toEqual([
      expect.objectContaining({
        href: "/admin/evidence-retention",
        activeKey: "admin-evidence-retention",
      }),
    ]);
  });

  it("keeps every enabled admin navigation link pointed at a route page", () => {
    const sections = getNavigationSections(
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
      true
    );

    for (const item of allNavItems(sections)) {
      if (!item.href || item.disabled) {
        continue;
      }

      expect(existsSync(routePathForHref(item.href)), `${item.href} exists`).toBe(true);
    }
  });

  it("keeps future preview pages admin-only except the dashboard", () => {
    for (const [previewKey, config] of Object.entries(modulePreviews)) {
      if (previewKey === "dashboard") {
        expect(config.requiresAdmin).not.toBe(true);
        expect(config.dashboardItems?.length).toBeGreaterThan(0);
        continue;
      }
      if (["projects", "myWork", "workBoards", "workCalendar"].includes(previewKey)) {
        expect(config.requiresAdmin).toBe(true);
        continue;
      }

      expect(config.requiresAdmin, `${previewKey} requires admin`).toBe(true);
    }
  });

  it("gives every preview route a page-specific mockup section", () => {
    for (const [previewKey, config] of Object.entries(modulePreviews)) {
      if (["projects", "myWork", "workBoards", "workCalendar"].includes(previewKey)) {
        continue;
      }

      const hasVisualSection =
        Boolean(config.board) ||
        Boolean(config.calendar) ||
        Boolean(config.reports) ||
        Boolean(config.financeLines) ||
        Boolean(config.alerts) ||
        Boolean(config.settings) ||
        Boolean(config.pipeline) ||
        Boolean(config.readiness) ||
        Boolean(config.documents) ||
        Boolean(config.dashboardItems);

      expect(hasVisualSection, `${previewKey} has a mockup section`).toBe(true);
    }
  });

  it("does not build dead mobile preview rail links", () => {
    const sections = getNavigationSections(
      true,
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
      false
    );
    const railItems = getMobilePreviewRailItems(sections);

    expect(railItems.length).toBeGreaterThan(0);
    expect(railItems.every((item) => item.href && item.href !== "#" && !item.disabled)).toBe(true);
  });

  it("keeps mobile operational navigation aligned with inventory action access", () => {
    const mobileItems = getMobileOperationalNavItems({
      canAdminister: false,
      canManageQuotes: false,
      canUsePurchaseRequests: true,
      canUseApprovals: true,
      canViewPurchaseOrders: false,
      canUseReceiving: false,
      canUseTransfers: true,
      canUseCounts: true,
      canUseWastage: true,
      canUseStockAdjustments: true,
      canViewInventory: false,
      canViewInventoryLedger: false
    });

    expect(mobileItems.map((item) => item.href)).toEqual([
      "/purchase-requests",
      "/approvals",
      "/transfers",
      "/counts",
      "/wastage",
      "/adjustments"
    ]);
  });

  it("keeps denied module redirects on accessible fallback routes", () => {
    for (const routePath of [
      "transfers/page.tsx",
      "counts/page.tsx",
      "wastage/page.tsx",
      "adjustments/page.tsx"
    ]) {
      const source = appPageSource(routePath);

      expect(source).toContain("? \"/inventory\"");
      expect(source).toContain(": getDefaultAppRoute(session.permissionCodes)");
    }

    const receivingSource = appPageSource("receiving/page.tsx");

    expect(receivingSource).toContain("canReadPurchaseOrders(session.permissionCodes)");
    expect(receivingSource).toContain("? \"/purchase-orders\"");
    expect(receivingSource).toContain(": getDefaultAppRoute(session.permissionCodes)");
  });

  it("keeps every mobile operational link pointed at a route page", () => {
    const mobileItems = getMobileOperationalNavItems({
      canAdminister: true,
      canManageQuotes: true,
      canUsePurchaseRequests: true,
      canUseApprovals: true,
      canViewPurchaseOrders: true,
      canUseReceiving: true,
      canUseTransfers: true,
      canUseCounts: true,
      canUseWastage: true,
      canUseStockAdjustments: true,
      canViewInventory: true,
      canViewInventoryLedger: true
    });

    for (const item of mobileItems) {
      expect(existsSync(routePathForHref(item.href)), `${item.href} exists`).toBe(true);
    }
  });

  it("keeps non-admin dashboard actions inside accessible operational pages", () => {
    const { primaryAction, secondaryAction } = getModulePreviewActions(
      modulePreviews.dashboard,
      false,
      []
    );

    expect(primaryAction).toEqual({ href: "/dashboard", label: "Open Dashboard" });
    expect(secondaryAction).toEqual({ href: "/dashboard", label: "Open Dashboard" });
  });

  it("links non-admin dashboard actions to permitted request and approval pages", () => {
    const { primaryAction, secondaryAction } = getModulePreviewActions(
      modulePreviews.dashboard,
      false,
      [permissions.purchaseRequestCreate, permissions.purchaseRequestApprove]
    );

    expect(primaryAction).toEqual({ href: "/purchase-requests", label: "Open Requests" });
    expect(secondaryAction).toEqual({ href: "/approvals", label: "Open Approvals" });
  });

  it("links non-admin dashboard inventory action only when inventory is permitted", () => {
    const { secondaryAction } = getModulePreviewActions(modulePreviews.dashboard, false, [
      permissions.inventoryBalanceView
    ]);

    expect(secondaryAction).toEqual({ href: "/inventory", label: "Open Inventory" });
  });

  it("keeps non-admin dashboard snapshot scoped to the selected location", () => {
    const session: SessionContext = {
      user: {
        id: "user-1",
        email: "branch@example.test",
        displayName: "Branch User",
        role: "Storekeeper"
      },
      context: {
        tenantId: "tenant-1",
        companyId: "company-1",
        companyName: "OGFI",
        brandId: "brand-1",
        brandName: "Demo Brand",
        locationId: "location-1",
        locationName: "Selected Branch",
        locationType: "BRANCH"
      },
      authorizedLocations: [],
      permissionCodes: []
    };

    expect(getDashboardSnapshotItems(session, false)).toEqual([
      {
        branch: "Selected Branch",
        detail: "Demo Brand / branch context",
        status: "Ready"
      }
    ]);
  });
});
