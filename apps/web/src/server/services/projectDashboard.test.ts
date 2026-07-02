import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("project dashboard reporting boundary", () => {
  test("project dashboard is read-only and does not import operational mutation services", () => {
    const source = readFileSync(path.resolve(__dirname, "projectDashboard.ts"), "utf8");
    const reportSource = readFileSync(
      path.resolve(__dirname, "projectReports.ts"),
      "utf8"
    );
    const generalProjectExports = reportSource.slice(
      0,
      reportSource.indexOf("export async function buildProjectLinkedRecordFollowUpExportRows")
    );
    const exportRoute = readFileSync(
      path.resolve(__dirname, "../../app/(app)/projects/export/route.ts"),
      "utf8"
    );
    const taskExportRoute = readFileSync(
      path.resolve(__dirname, "../../app/(app)/projects/tasks/export/route.ts"),
      "utf8"
    );
    const activityExportRoute = readFileSync(
      path.resolve(__dirname, "../../app/(app)/projects/activity/export/route.ts"),
      "utf8"
    );
    const linkedRecordExportRoute = readFileSync(
      path.resolve(__dirname, "../../app/(app)/projects/links/export/route.ts"),
      "utf8"
    );
    const projectsPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/projects/page.tsx"),
      "utf8"
    );

    expect(source).not.toContain("./purchaseOrders");
    expect(source).not.toContain("./purchaseRequests");
    expect(source).not.toContain("./receiving");
    expect(source).not.toContain("./transfers");
    expect(source).not.toContain("./inventory");
    expect(source).not.toContain("./approvals");
    expect(generalProjectExports).toContain("getProjectDashboard(session)");
    expect(generalProjectExports).toContain("project_report.export_denied");
    expect(generalProjectExports).toContain("project_report.export_started");
    expect(generalProjectExports).toContain("project_report.export_completed");
    expect(generalProjectExports).toContain("assertProjectExportThrottle");
    expect(generalProjectExports).not.toContain("sourceRecordId");
    expect(generalProjectExports).not.toContain("sourceRecordType");
    expect(exportRoute).toContain("buildProjectHealthExportRows(session)");
    expect(exportRoute).not.toContain("sourceRecordId");
    expect(exportRoute).not.toContain("sourceRecordType");
    expect(taskExportRoute).toContain("buildProjectTaskRegisterExportRows(session)");
    expect(taskExportRoute).not.toContain("sourceRecordId");
    expect(taskExportRoute).not.toContain("sourceRecordType");
    expect(activityExportRoute).toContain("buildProjectActivityLogExportRows(session)");
    expect(activityExportRoute).not.toContain("sourceRecordId");
    expect(activityExportRoute).not.toContain("sourceRecordType");
    expect(linkedRecordExportRoute).toContain(
      "buildProjectLinkedRecordFollowUpExportRows(session)"
    );
    expect(linkedRecordExportRoute).toContain("project-linked-record-follow-up.csv");
    expect(projectsPage).toContain('href="/projects/export"');
    expect(projectsPage).toContain('href="/projects/tasks/export"');
    expect(projectsPage).toContain('href="/projects/activity/export"');
    expect(projectsPage).toContain('href="/projects/links/export"');
  });
});
