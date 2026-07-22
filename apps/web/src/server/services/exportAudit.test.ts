import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const source = readFileSync(path.resolve(__dirname, "exportAudit.ts"), "utf8");

describe("operational export denial auditing", () => {
  test("routes denied exports to bounded server-derived dimensions", () => {
    const start = source.indexOf('if (input.eventType === "report.export_denied")');
    const deniedBranch = source.slice(start, source.indexOf("const exportPolicy =", start));

    expect(deniedBranch).toContain("recordSessionDeniedDecisionSafely");
    expect(source).not.toContain("getAuthorizationDenialWindowMinutes");
    expect(deniedBranch).toContain('action: "EXPORT"');
    expect(deniedBranch).toContain('reason: "PERMISSION_MISSING"');
    expect(deniedBranch).toContain('resource: "REPORTING"');
    expect(deniedBranch).not.toContain("reportId:");
    expect(deniedBranch).not.toContain("reasonCode:");
    expect(deniedBranch).not.toContain("metadata:");
  });

  test("preserves non-denial export audit events", () => {
    expect(source).toContain("prisma.auditEvent.create");
    expect(source).toContain("eventType: input.eventType");
    expect(source).toContain('source: "operational-report-export"');
  });
});
