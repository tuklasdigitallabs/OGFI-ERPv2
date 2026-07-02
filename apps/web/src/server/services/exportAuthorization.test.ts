import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { permissions } from "./authorization";
import type { SessionContext } from "./context";
import {
  canExportCoreAdminAudit,
  canExportInventoryBalances,
  canExportInventoryLedger,
  canExportInventoryTransfers,
  canExportProjects,
  canExportPurchaseOrders,
  canExportPurchaseRequests,
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
  "counts/export/route.ts": "canExportStockCounts",
  "inventory/export/route.ts": "canExportInventoryBalances",
  "inventory/ledger/export/route.ts": "canExportInventoryLedger",
  "projects/activity/export/route.ts": "canExportProjects",
  "projects/export/route.ts": "canExportProjects",
  "projects/links/export/route.ts": "canExportProjects",
  "projects/tasks/export/route.ts": "canExportProjects",
  "purchase-orders/export/route.ts": "canExportPurchaseOrders",
  "purchase-requests/export/route.ts": "canExportPurchaseRequests",
  "quotes/export/route.ts": "canExportSupplierQuotes",
  "receiving/export/route.ts": "canExportReceivingReports",
  "transfers/export/route.ts": "canExportInventoryTransfers",
  "wastage/export/route.ts": "canExportWastageReports"
} as const;

const exportPageVisibilityContracts = {
  "adjustments/page.tsx": {
    helperName: "canExportStockAdjustments",
    flagName: "canExportAdjustments",
    hrefSnippet: 'href="/adjustments/export"'
  },
  "admin/page.tsx": {
    helperName: "canExportCoreAdminAudit",
    flagName: "canExportAudit",
    hrefSnippet: "const auditExportHref = `/admin/audit/export"
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
    hrefSnippet: 'const exportHref = `/inventory/ledger/export'
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
    hrefSnippet: 'href="/receiving/export"'
  },
  "transfers/page.tsx": {
    helperName: "canExportInventoryTransfers",
    flagName: "canExportTransfers",
    hrefSnippet: 'href="/transfers/export"'
  },
  "wastage/page.tsx": {
    helperName: "canExportWastageReports",
    flagName: "canExportWastage",
    hrefSnippet: 'href="/wastage/export"'
  }
} as const;

const operationalExportAuditContracts = {
  "adjustments/export/route.ts": "stock-adjustment-report",
  "admin/audit/export/route.ts": "audit-trail",
  "counts/export/route.ts": "stock-count-variance",
  "inventory/export/route.ts": "stock-balances",
  "inventory/ledger/export/route.ts": "movement-ledger",
  "purchase-orders/export/route.ts": "purchase-order-status",
  "purchase-requests/export/route.ts": "purchase-request-register",
  "quotes/export/route.ts": "supplier-quotes",
  "receiving/export/route.ts": "receiving-reports",
  "transfers/export/route.ts": "transfer-status",
  "wastage/export/route.ts": "wastage-report"
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
    expect(service).toContain('source: "operational-report-export"');

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
      expect(routeSource, `${routePath} logs row count`).toContain("rowCount:");
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
      expect(pageSource, `${pagePath} gates export link with ${contract.flagName}`).toContain(
        `{${contract.flagName} ? (`
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
});
