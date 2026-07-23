import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { permissions } from "./authorization";
import type { SessionContext } from "./context";
import {
  canExportCoreAdminAudit,
  canExportExpansion,
  canExportInventoryBalances,
  canExportInventoryLedger,
  canExportInventoryLedgerVariance,
  canExportInventoryTransfers,
  canExportProjects,
  canExportPurchaseOrders,
  canExportPurchaseRequests,
  canExportRecipeCosting,
  canExportFoodCostAnalysis,
  canExportBranchOperations,
  canExportFoodSafety,
  canExportFinance,
  canExportIncidents,
  canExportMaintenance,
  canExportWorkforce,
  canExportReleaseReadiness,
  canExportReceivingReports,
  canExportStockAdjustments,
  canExportStockCounts,
  canExportSupplierQuotes,
  canExportWastageReports
} from "./exportAuthorization";

const appRouteRoot = fileURLToPath(new URL("../../app/(app)/", import.meta.url));

const exportRouteAuthorizationContracts = {
  "adjustments/export/route.ts": "canExportStockAdjustments",
  "admin/audit/export/route.ts": "canExportCoreAdminAudit",
  "admin/readiness/export/route.ts": "canExportReleaseReadiness",
  "counts/export/route.ts": "canExportStockCounts",
  "inventory/export/route.ts": "canExportInventoryBalances",
  "inventory/ledger/export/route.ts": "canExportInventoryLedger",
  "inventory/reconciliation/export/route.ts": "canExportInventoryLedgerVariance",
  "branch-operations/export/route.ts": "canExportBranchOperations",
  "food-safety/export/route.ts": "canExportFoodSafety",
  "expansion/export/route.ts": "canExportExpansion",
  "finance/export/route.ts": "canExportFinance",
  "incidents/export/route.ts": "canExportIncidents",
  "maintenance/export/route.ts": "canExportMaintenance",
  "projects/activity/export/route.ts": "canExportProjects",
  "projects/export/route.ts": "canExportProjects",
  "projects/links/export/route.ts": "canExportProjects",
  "projects/tasks/export/route.ts": "canExportProjects",
  "purchase-orders/export/route.ts": "canExportPurchaseOrders",
  "purchase-requests/export/route.ts": "canExportPurchaseRequests",
  "quotes/export/route.ts": "canExportSupplierQuotes",
  "receiving/export/route.ts": "canExportReceivingReports",
  "recipes/export/route.ts": "canExportRecipeCosting",
  "recipes/[id]/revision-template/route.ts": "canExportRecipeCosting",
  "recipes/analysis/export/route.ts": "canExportFoodCostAnalysis",
  "transfers/export/route.ts": "canExportInventoryTransfers",
  "wastage/export/route.ts": "canExportWastageReports",
  "workforce/export/route.ts": "canExportWorkforce"
} as const;

const exportPageVisibilityContracts = {
  "adjustments/page.tsx": {
    helperName: "canExportStockAdjustments",
    flagName: "canExportAdjustments",
    hrefSnippet: 'href={profile ? `/adjustments/export?dashboard=${profile}` : "/adjustments/export"}'
  },
  "admin/page.tsx": {
    helperName: "canExportCoreAdminAudit",
    flagName: "canExportAudit",
    hrefSnippet: "const auditExportHref = `/admin/audit/export"
  },
  "admin/readiness/page.tsx": {
    helperName: "canExportReleaseReadiness",
    flagName: "canExportReadiness",
    hrefSnippet: "href={exportHref}",
    labelSnippet: "Export Readiness Register"
  },
  "counts/page.tsx": {
    helperName: "canExportStockCounts",
    flagName: "canExportCounts",
    hrefSnippet: 'href="/counts/export"'
  },
  "inventory/page.tsx": {
    helperName: "canExportInventoryBalances",
    flagName: "canExportInventory",
    hrefSnippet: 'const exportHref = `/inventory/export'
  },
  "inventory/ledger/page.tsx": {
    helperName: "canExportInventoryLedger",
    flagName: "canExportLedger",
    gateFlagName: "canExportLedger && !isExactTrace",
    hrefSnippet: 'const exportHref = `/inventory/ledger/export'
  },
  "branch-operations/page.tsx": {
    helperName: "canExportBranchOperations",
    flagName: "canExport",
    hrefSnippet: 'href={buildQueryHref("/branch-operations/export"',
    labelSnippet: "Export Checklist CSV"
  },
  "food-safety/page.tsx": {
    helperName: "canExportFoodSafety",
    flagName: "canExport",
    hrefSnippet: 'href={buildQueryHref("/food-safety/export"',
    labelSnippet: "Export Food-Safety CSV"
  },
  "expansion/page.tsx": {
    helperName: "canExportExpansion",
    flagName: "canExportExpansionCsv",
    hrefSnippet: 'href="/expansion/export"',
    labelSnippet: "Export CSV"
  },
  "finance/page.tsx": {
    helperName: "canExportFinance",
    flagName: "canExportFinanceCsv",
    hrefSnippet: 'href="/finance/export"',
    labelSnippet: "Export Finance CSV"
  },
  "incidents/page.tsx": {
    helperName: "canExportIncidents",
    flagName: "canExport",
    hrefSnippet: 'href={buildQueryHref("/incidents/export"',
    labelSnippet: "Export Incident CSV"
  },
  "maintenance/page.tsx": {
    helperName: "canExportMaintenance",
    flagName: "canExport",
    hrefSnippet: 'href={buildQueryHref("/maintenance/export"',
    labelSnippet: "Export Maintenance CSV"
  },
  "purchase-orders/page.tsx": {
    helperName: "canExportPurchaseOrders",
    flagName: "canExportPurchaseOrderCsv",
    hrefSnippet: "href={`/purchase-orders/export"
  },
  "purchase-requests/page.tsx": {
    helperName: "canExportPurchaseRequests",
    flagName: "canExportPurchaseRequestCsv",
    hrefSnippet: 'const exportHref = `/purchase-requests/export'
  },
  "projects/page.tsx": {
    helperName: "canExportProjects",
    flagName: "canExportProjectsCsv",
    hrefSnippet: 'href="/projects/export"',
    labelSnippet: "Export Health CSV"
  },
  "quotes/page.tsx": {
    helperName: "canExportSupplierQuotes",
    flagName: "canExportQuotes",
    hrefSnippet: 'href="/quotes/export"'
  },
  "receiving/page.tsx": {
    helperName: "canExportReceivingReports",
    flagName: "canExportReceiving",
    hrefSnippet: 'href={profile'
  },
  "recipes/page.tsx": {
    helperName: "canExportRecipeCosting",
    flagName: "canExportRecipes",
    gateFlagName: "canExportActiveView",
    hrefSnippet: 'buildQueryHref("/recipes/export"',
    labelSnippet: "Export Recipe Costing CSV"
  },
  "recipes/analysis/page.tsx": {
    helperName: "canExportFoodCostAnalysis",
    flagName: "canExport",
    hrefSnippet: 'href={buildQueryHref("/recipes/analysis/export"',
    labelSnippet: "Export Food-Cost Analysis CSV"
  },
  "transfers/page.tsx": {
    helperName: "canExportInventoryTransfers",
    flagName: "canExportTransfers",
    gateFlagName: "canExportTransfers && profile",
    hrefSnippet: 'href="/transfers/export"'
  },
  "wastage/page.tsx": {
    helperName: "canExportWastageReports",
    flagName: "canExportWastage",
    hrefSnippet: 'href={profile ? `/wastage/export?dashboard=${profile}` : "/wastage/export"}'
  },
  "workforce/page.tsx": {
    helperName: "canExportWorkforce",
    flagName: "canExportWorkforceCsv",
    hrefSnippet: 'href="/workforce/export"',
    labelSnippet: "Export Workforce CSV"
  }
} as const;

const operationalExportAuditContracts = {
  "adjustments/export/route.ts": "stock-adjustment-report",
  "admin/audit/export/route.ts": "audit-trail",
  "admin/readiness/export/route.ts": "release-readiness",
  "counts/export/route.ts": "stock-count-variance",
  "inventory/export/route.ts": "stock-balances",
  "inventory/ledger/export/route.ts": "movement-ledger",
  "inventory/reconciliation/export/route.ts": "inventory-ledger-variance",
  "branch-operations/export/route.ts": "branch-checklist-compliance",
  "food-safety/export/route.ts": "food-safety-exceptions",
  "expansion/export/route.ts": "phase-4-expansion-portfolio",
  "finance/export/route.ts": "phase-3-finance-control-center",
  "incidents/export/route.ts": "incident-corrective-actions",
  "maintenance/export/route.ts": "maintenance-sla-downtime",
  "purchase-orders/export/route.ts": "purchase-order-status",
  "purchase-requests/export/route.ts": "purchase-request-register",
  "quotes/export/route.ts": "supplier-quotes",
  "receiving/export/route.ts": "receiving-reports",
  "recipes/export/route.ts": "recipe-costing",
  "recipes/[id]/revision-template/route.ts": "recipe-revision-workbook",
  "recipes/analysis/export/route.ts": "food-cost-analysis",
  "transfers/export/route.ts": "transfer-status",
  "wastage/export/route.ts": "wastage-report",
  "workforce/export/route.ts": "phase-3-workforce-operations"
} as const;

function sessionWithPermissions(permissionCodes: string[]): SessionContext {
  return {
    user: {
      id: "user-1",
      email: "user@example.test",
      displayName: "Test User",
      role: "Storekeeper"
    },
    context: {
      tenantId: "tenant-1",
      companyId: "company-1",
      companyName: "OGFI",
      brandId: "brand-1",
      brandName: "Demo Brand",
      locationId: "location-1",
      locationName: "Demo Branch",
      locationType: "BRANCH"
    },
    authorizedLocations: [],
    permissionCodes
  };
}

describe("export authorization", () => {
  test("keeps permission-gated export routes explicitly guarded", () => {
    for (const [routePath, helperName] of Object.entries(
      exportRouteAuthorizationContracts
    )) {
      const filePath = `${appRouteRoot}${routePath}`;
      const routeSource = readFileSync(filePath, "utf8");

      expect(existsSync(filePath), `${routePath} exists`).toBe(true);
      expect(routeSource, `${routePath} imports export authorization`).toContain(
        "@/server/services/exportAuthorization"
      );
      expect(routeSource, `${routePath} calls ${helperName}`).toContain(
        `${helperName}(session)`
      );
      expect(routeSource, `${routePath} uses shared denied response`).toContain(
        "exportPermissionDeniedResponse()"
      );
    }
  });

  test("selected operational exports write denied, started, and completed audit events", () => {
    const service = readFileSync(
      fileURLToPath(new URL("./exportAudit.ts", import.meta.url)),
      "utf8"
    );

    expect(service).toContain("logOperationalExportAudit");
    expect(service).toContain("report.export_denied");
    expect(service).toContain("report.export_started");
    expect(service).toContain("report.export_completed");
    expect(service).toContain("report.export_failed");
    expect(service).toContain('source: "operational-report-export"');
    expect(service).toContain("assertReportExportScopeFilters");
    expect(service).toContain("REPORT_EXPORT_SCOPE_FILTER_REQUIRED");
    expect(service).toContain("trustGateMode");
    expect(service).toContain("locationName");

    for (const [routePath, reportId] of Object.entries(
      operationalExportAuditContracts
    )) {
      const routeSource = readFileSync(`${appRouteRoot}${routePath}`, "utf8");
      expect(routeSource, `${routePath} imports export audit`).toContain(
        "logOperationalExportAudit"
      );
      expect(routeSource, `${routePath} has report id`).toContain(
        `reportId: "${reportId}"`
      );
      expect(routeSource, `${routePath} logs denial`).toContain(
        'eventType: "report.export_denied"'
      );
      expect(routeSource, `${routePath} logs start`).toContain(
        'eventType: "report.export_started"'
      );
      expect(routeSource, `${routePath} logs completion`).toContain(
        'eventType: "report.export_completed"'
      );
      expect(
        routeSource,
        `${routePath} logs terminal failure or uses shared failure helper`
      ).toMatch(/report\.export_failed|logOperationalExportFailure/);
      expect(routeSource, `${routePath} logs row count`).toContain("rowCount:");
      expect(routeSource, `${routePath} includes DEC-0036 scope/trust metadata in CSV`).toContain(
        "buildReportCsvMetadata"
      );
      expect(routeSource, `${routePath} passes report id to CSV metadata`).toContain(
        `reportId: "${reportId}"`
      );
    }
  });

  test("hides module export buttons behind the same export helpers as routes", () => {
    for (const [pagePath, contract] of Object.entries(
      exportPageVisibilityContracts
    )) {
      const pageSource = readFileSync(`${appRouteRoot}${pagePath}`, "utf8");

      expect(pageSource, `${pagePath} imports export authorization`).toContain(
        "@/server/services/exportAuthorization"
      );
      expect(pageSource, `${pagePath} calls ${contract.helperName}`).toContain(
        `const ${contract.flagName} = ${contract.helperName}(session);`
      );
      const gateFlagName =
        "gateFlagName" in contract ? contract.gateFlagName : contract.flagName;
      expect(pageSource, `${pagePath} gates export link with ${gateFlagName}`).toContain(
        `{${gateFlagName} ? (`
      );
      expect(pageSource, `${pagePath} renders the guarded export href`).toContain(
        contract.hrefSnippet
      );
      expect(pageSource, `${pagePath} keeps export button label visible when allowed`).toContain(
        "labelSnippet" in contract ? contract.labelSnippet : "Export CSV"
      );
    }
  });

  test("uses purchase order read permissions for purchase order exports", () => {
    expect(canExportPurchaseOrders(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportPurchaseOrders(sessionWithPermissions([permissions.purchaseOrderView]))
    ).toBe(true);
    expect(
      canExportPurchaseOrders(sessionWithPermissions([permissions.purchaseOrderCreate]))
    ).toBe(true);
  });

  test("uses purchase request action permissions for purchase request exports", () => {
    expect(canExportPurchaseRequests(sessionWithPermissions([]))).toBe(false);
    for (const permission of [
      permissions.purchaseRequestCreate,
      permissions.purchaseRequestSubmit,
      permissions.purchaseRequestApprove
    ]) {
      expect(canExportPurchaseRequests(sessionWithPermissions([permission]))).toBe(
        true
      );
    }
  });

  test("uses quote manage permission for supplier quote exports", () => {
    expect(canExportSupplierQuotes(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportSupplierQuotes(sessionWithPermissions([permissions.quoteManage]))
    ).toBe(true);
  });

  test("uses core administer permission for admin audit exports", () => {
    expect(canExportCoreAdminAudit(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportCoreAdminAudit(sessionWithPermissions([permissions.coreAdminister]))
    ).toBe(true);
  });

  test("uses core administer permission for release readiness exports", () => {
    expect(canExportReleaseReadiness(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportReleaseReadiness(
        sessionWithPermissions([permissions.coreAdminister])
      )
    ).toBe(true);
  });

  test("uses project permissions for expansion exports", () => {
    expect(canExportExpansion(sessionWithPermissions([]))).toBe(false);
    expect(canExportExpansion(sessionWithPermissions([permissions.projectView]))).toBe(
      true
    );
  });

  test("uses stock balance permission for inventory balance exports", () => {
    expect(canExportInventoryBalances(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportInventoryBalances(
        sessionWithPermissions([permissions.inventoryBalanceView])
      )
    ).toBe(true);
  });

  test("uses inventory ledger permission for ledger exports", () => {
    expect(canExportInventoryLedger(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportInventoryLedger(sessionWithPermissions([permissions.inventoryLedgerView]))
    ).toBe(true);
  });

  test("requires both balance and ledger permissions for variance exports", () => {
    expect(canExportInventoryLedgerVariance(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportInventoryLedgerVariance(
        sessionWithPermissions([permissions.inventoryBalanceView])
      )
    ).toBe(false);
    expect(
      canExportInventoryLedgerVariance(
        sessionWithPermissions([permissions.inventoryLedgerView])
      )
    ).toBe(false);
    expect(
      canExportInventoryLedgerVariance(
        sessionWithPermissions([
          permissions.inventoryBalanceView,
          permissions.inventoryLedgerView
        ])
      )
    ).toBe(true);
  });

  test("uses receiving view permission for receiving report exports", () => {
    expect(canExportReceivingReports(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportReceivingReports(sessionWithPermissions([permissions.receivingView]))
    ).toBe(true);
  });

  test("uses transfer view permission for transfer exports", () => {
    expect(canExportInventoryTransfers(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportInventoryTransfers(sessionWithPermissions([permissions.transferView]))
    ).toBe(true);
  });

  test("uses stock count view permission for stock count exports", () => {
    expect(canExportStockCounts(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportStockCounts(sessionWithPermissions([permissions.stockCountView]))
    ).toBe(true);
  });

  test("uses wastage view permission for wastage report exports", () => {
    expect(canExportWastageReports(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportWastageReports(sessionWithPermissions([permissions.wastageView]))
    ).toBe(true);
  });

  test("uses stock adjustment view permission for adjustment exports", () => {
    expect(canExportStockAdjustments(sessionWithPermissions([]))).toBe(false);
    expect(
      canExportStockAdjustments(
        sessionWithPermissions([permissions.stockAdjustmentView])
      )
    ).toBe(true);
  });

  test("uses project permissions for project exports", () => {
    expect(canExportProjects(sessionWithPermissions([]))).toBe(false);
    expect(canExportProjects(sessionWithPermissions([permissions.projectView]))).toBe(
      true
    );
    expect(
      canExportProjects(sessionWithPermissions([permissions.projectManage]))
    ).toBe(true);
  });

  test("uses Phase II recipe and menu-cost permissions for recipe exports", () => {
    expect(canExportRecipeCosting(sessionWithPermissions([]))).toBe(false);
    expect(canExportFoodCostAnalysis(sessionWithPermissions([]))).toBe(false);
    for (const permission of [
      permissions.recipeView,
      permissions.recipeManage,
      permissions.menuCostView
    ]) {
      expect(canExportRecipeCosting(sessionWithPermissions([permission]))).toBe(
        true
      );
      expect(canExportFoodCostAnalysis(sessionWithPermissions([permission]))).toBe(
        true
      );
    }
  });

  test("uses Phase II operating workspace permissions for checklist exports", () => {
    expect(canExportBranchOperations(sessionWithPermissions([]))).toBe(false);
    for (const permission of [
      permissions.branchOperationsView,
      permissions.branchOperationsCreate,
      permissions.branchOperationsReview
    ]) {
      expect(canExportBranchOperations(sessionWithPermissions([permission]))).toBe(
        true
      );
    }
  });

  test("uses Phase II food-safety permissions for food-safety exports", () => {
    expect(canExportFoodSafety(sessionWithPermissions([]))).toBe(false);
    for (const permission of [
      permissions.foodSafetyView,
      permissions.foodSafetyCreate,
      permissions.foodSafetyReview
    ]) {
      expect(canExportFoodSafety(sessionWithPermissions([permission]))).toBe(true);
    }
  });

  test("uses Phase II incident permissions for incident exports", () => {
    expect(canExportIncidents(sessionWithPermissions([]))).toBe(false);
    for (const permission of [
      permissions.incidentView,
      permissions.incidentCreate,
      permissions.incidentResolve
    ]) {
      expect(canExportIncidents(sessionWithPermissions([permission]))).toBe(true);
    }
  });

  test("uses Phase II maintenance permissions for maintenance exports", () => {
    expect(canExportMaintenance(sessionWithPermissions([]))).toBe(false);
    for (const permission of [
      permissions.maintenanceView,
      permissions.maintenanceCreate,
      permissions.maintenanceComplete
    ]) {
      expect(canExportMaintenance(sessionWithPermissions([permission]))).toBe(true);
    }
  });

  test("uses Phase III finance permissions for finance exports", () => {
    expect(canExportFinance(sessionWithPermissions([]))).toBe(false);
    for (const permission of [
      permissions.financeView,
      permissions.financeLedgerView,
      permissions.financePayablesView,
      permissions.financePaymentRelease,
      permissions.financeReconciliationView
    ]) {
      expect(canExportFinance(sessionWithPermissions([permission]))).toBe(true);
    }
  });

  test("uses Phase III workforce permissions for workforce exports", () => {
    expect(canExportWorkforce(sessionWithPermissions([]))).toBe(false);
    for (const permission of [
      permissions.workforceView,
      permissions.workforceManage,
      permissions.workforceScheduleView,
      permissions.workforceAttendanceImportView
    ]) {
      expect(canExportWorkforce(sessionWithPermissions([permission]))).toBe(true);
    }
  });
});
