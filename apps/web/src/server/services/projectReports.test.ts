import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const source = readFileSync(path.resolve(__dirname, "projectReports.ts"), "utf8");

describe("project report denial auditing", () => {
  test("routes denied exports to bounded project dimensions", () => {
    const deniedBranch = source.slice(
      source.indexOf('if (input.eventType === "project_report.export_denied")'),
      source.indexOf("const exportPolicy =")
    );

    expect(deniedBranch).toContain("recordSessionDeniedDecisionSafely");
    expect(source).not.toContain("getAuthorizationDenialWindowMinutes");
    expect(deniedBranch).toContain('action: "EXPORT"');
    expect(deniedBranch).toContain('reason: "PERMISSION_MISSING"');
    expect(deniedBranch).toContain('resource: "PROJECTS"');
    expect(deniedBranch).not.toContain("reportId:");
    expect(deniedBranch).not.toContain("reasonCode:");
  });

  test("preserves project export lifecycle audits", () => {
    expect(source).toContain("prisma.auditEvent.create");
    expect(source).toContain("eventType: input.eventType");
    expect(source).toContain('source: "project-report-export"');
  });
});
