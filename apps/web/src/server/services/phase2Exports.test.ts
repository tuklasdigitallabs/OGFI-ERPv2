import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const reportSource = readFileSync(new URL("./reports.ts", import.meta.url), "utf8");
const exportAuditSource = readFileSync(
  new URL("./exportAudit.ts", import.meta.url),
  "utf8"
);
const exportErrorsSource = readFileSync(
  new URL("./exportErrors.ts", import.meta.url),
  "utf8"
);
const exportAuthSource = readFileSync(
  new URL("./exportAuthorization.ts", import.meta.url),
  "utf8"
);
const routeSources = [
  "recipes/export/route.ts",
  "recipes/analysis/export/route.ts",
  "branch-operations/export/route.ts",
  "food-safety/export/route.ts",
  "incidents/export/route.ts",
  "maintenance/export/route.ts"
].map((routePath) =>
  readFileSync(path.resolve(__dirname, `../../app/(app)/${routePath}`), "utf8")
);
const reportsPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/reports/page.tsx"),
  "utf8"
);
const phase2UatSource = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../docs/phases/phase-02-restaurant-operations-and-food-cost/quality/PHASE2_UAT_SCENARIOS.md"
  ),
  "utf8"
);

describe("Phase 2 reporting exports", () => {
  it("registers restaurant operations report cards with scoped CSV exports", () => {
    expect(reportSource).toContain('group: "Restaurant Ops"');
    expect(reportsPageSource).toContain('"Restaurant Ops"');
    expect(reportsPageSource).toContain(
      "Scoped operational, project, and restaurant source-record reports"
    );
    expect(reportSource).toContain('id: "recipe-costing"');
    expect(reportSource).toContain('id: "food-cost-analysis"');
    expect(reportSource).toContain('id: "branch-checklist-compliance"');
    expect(reportSource).toContain('id: "food-safety-exceptions"');
    expect(reportSource).toContain('id: "incident-corrective-actions"');
    expect(reportSource).toContain('id: "maintenance-sla-downtime"');
  });

  it("uses existing Phase 2 permissions as export gates", () => {
    expect(exportAuthSource).toContain("canExportRecipeCosting");
    expect(exportAuthSource).toContain("canUseRecipesAndCosting");
    expect(exportAuthSource).toContain("canExportBranchOperations");
    expect(exportAuthSource).toContain("canUseBranchOperations");
    expect(exportAuthSource).toContain("canExportFoodSafety");
    expect(exportAuthSource).toContain("canUseFoodSafety");
    expect(exportAuthSource).toContain("canExportIncidents");
    expect(exportAuthSource).toContain("canUseIncidents");
    expect(exportAuthSource).toContain("canExportMaintenance");
    expect(exportAuthSource).toContain("canUseMaintenance");
  });

  it("audits started, completed, denied, and failed export attempts", () => {
    expect(exportAuditSource).toContain('"report.export_failed"');
    expect(exportErrorsSource).toContain("getExportFailureReasonCode");
    expect(exportErrorsSource).toContain("getStrictDateSearchParam");
    expect(exportErrorsSource).toContain("EXPORT_FAILED");

    for (const routeSource of routeSources) {
      expect(routeSource).toContain("exportAuthRequiredResponse");
      expect(routeSource).toContain("exportErrorResponse");
      expect(routeSource).toContain("exportPermissionDeniedResponse");
      expect(routeSource).toContain("getExportFailureReasonCode");
      expect(routeSource).toContain("logOperationalExportAudit");
      expect(routeSource).toContain("getFilterParams");
      expect(routeSource).toContain('eventType: "report.export_denied"');
      expect(routeSource).toContain('eventType: "report.export_started"');
      expect(routeSource).toContain('eventType: "report.export_completed"');
      expect(routeSource).toContain('eventType: "report.export_failed"');
      expect(routeSource).toContain("throw error");
      expect(routeSource).toContain("csvExportResponse");
    }
  });

  it("validates Phase 2 CSV date filters before export rows are built", () => {
    const routeSourceByPath = new Map([
      ["recipes/analysis/export/route.ts", routeSources[1]],
      ["branch-operations/export/route.ts", routeSources[2]],
      ["food-safety/export/route.ts", routeSources[3]],
      ["incidents/export/route.ts", routeSources[4]],
      ["maintenance/export/route.ts", routeSources[5]]
    ]);

    for (const [routePath, routeSource] of routeSourceByPath) {
      expect(routeSource, routePath).toContain("getStrictDateSearchParam");
    }
    expect(routeSourceByPath.get("recipes/analysis/export/route.ts")).toContain(
      "FOOD_COST_BUSINESS_DATE_INVALID"
    );
    expect(routeSourceByPath.get("branch-operations/export/route.ts")).toContain(
      "BRANCH_OPERATIONS_BUSINESS_DATE_INVALID"
    );
    expect(routeSourceByPath.get("food-safety/export/route.ts")).toContain(
      "FOOD_SAFETY_BUSINESS_DATE_INVALID"
    );
    expect(routeSourceByPath.get("incidents/export/route.ts")).toContain(
      "INCIDENT_FILTER_DATE_INVALID"
    );
    expect(routeSourceByPath.get("maintenance/export/route.ts")).toContain(
      "MAINTENANCE_REQUESTED_AT_FILTER_INVALID"
    );
  });

  it("keeps concrete Phase 2 UAT scripts for implemented restaurant operations", () => {
    for (const heading of [
      "Recipe Costing And Version History",
      "Food-Cost Analysis",
      "Branch Operations",
      "Food Safety",
      "Incidents",
      "Maintenance",
      "Dashboard, Reports, And Notifications"
    ]) {
      expect(phase2UatSource).toContain(`### ${heading}`);
    }
    expect(phase2UatSource).toContain("Only users with `restaurant.incident.create`");
    expect(phase2UatSource).toContain("Only users with `restaurant.incident.resolve`");
    expect(phase2UatSource).toContain("Only users with `restaurant.branch_operations.review`");
    expect(phase2UatSource).toContain("Only users with `restaurant.food_safety.review`");
    expect(phase2UatSource).toContain(
      "Only users with `restaurant.maintenance.correct` can correct"
    );
    expect(phase2UatSource).toContain("Only users with `restaurant.maintenance.complete`");
    expect(phase2UatSource).toContain("Branch close requires a reason");
    expect(phase2UatSource).toContain("Food-safety close requires a reason");
    expect(phase2UatSource).toContain("Cancellation writes an audit event");
    expect(phase2UatSource).toContain("Source-record links must reference an authorized same-scope source record");
    expect(phase2UatSource).toContain("Source incident links must reference an authorized same-scope incident");
    expect(phase2UatSource).toContain("Notification scan redirects preserve current inbox tab/status.");
  });
});
