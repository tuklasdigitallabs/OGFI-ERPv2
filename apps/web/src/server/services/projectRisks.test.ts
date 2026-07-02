import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertProjectRiskContext,
  assertProjectRiskCreation,
  assertProjectRiskTransition,
  deriveProjectRiskSeverity
} from "./projectRisks";

describe("project risk lifecycle controls", () => {
  test("derives severity from likelihood and impact", () => {
    expect(deriveProjectRiskSeverity("LOW", "LOW")).toBe("LOW");
    expect(deriveProjectRiskSeverity("MEDIUM", "MEDIUM")).toBe("MEDIUM");
    expect(deriveProjectRiskSeverity("HIGH", "MEDIUM")).toBe("HIGH");
    expect(deriveProjectRiskSeverity("CRITICAL", "HIGH")).toBe("CRITICAL");
  });

  test("blocks ambiguous task and milestone context", () => {
    expect(() =>
      assertProjectRiskContext({
        taskId: "task-1",
        milestoneId: "milestone-1"
      })
    ).toThrow("PROJECT_RISK_CONTEXT_INVALID");
  });

  test("high and critical risks require target mitigation date", () => {
    expect(() =>
      assertProjectRiskCreation({
        severity: "HIGH"
      })
    ).toThrow("PROJECT_RISK_TARGET_DATE_REQUIRED");

    expect(() =>
      assertProjectRiskCreation({
        severity: "MEDIUM"
      })
    ).not.toThrow();
  });

  test("terminal risk transitions require permission and reason", () => {
    expect(() =>
      assertProjectRiskTransition({
        currentStatus: "MITIGATING",
        nextStatus: "CLOSED",
        canMutate: true,
        canResolve: false,
        resolutionNote: "Resolved with sponsor"
      })
    ).toThrow("PROJECT_RISK_RESOLVE_PERMISSION_DENIED");

    expect(() =>
      assertProjectRiskTransition({
        currentStatus: "MITIGATING",
        nextStatus: "CLOSED",
        canMutate: true,
        canResolve: true
      })
    ).toThrow("PROJECT_RISK_RESOLUTION_NOTE_REQUIRED");
  });

  test("project risk service is advisory and activity-backed", () => {
    const source = readFileSync(path.resolve(__dirname, "projectRisks.ts"), "utf8");
    const schema = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );

    expect(source).toContain("project_risk.created");
    expect(source).toContain("project_risk.status_changed");
    expect(source).toContain("permissions.projectRiskCreate");
    expect(source).toContain("permissions.projectRiskResolve");
    expect(source).toContain("expectedVersion: formData.get(\"expectedVersion\") || undefined");
    expect(source).toContain("PROJECT_RISK_STALE_VERSION");
    expect(source).toContain("tx.projectRisk.updateMany");
    expect(source).toContain("version: { increment: 1 }");
    expect(source).not.toContain("./purchaseOrders");
    expect(source).not.toContain("./purchaseRequests");
    expect(source).not.toContain("./receiving");
    expect(source).not.toContain("./transfers");
    expect(source).not.toContain("./inventory");
    expect(source).not.toContain("./approvals");
    expect(schema).toContain("model ProjectRisk");
    expect(schema).toContain("ProjectRiskStatus");
  });

  test("risk forms submit expected versions for stale-update protection", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/projects/page.tsx"),
      "utf8"
    );
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(page).toContain('name="expectedVersion"');
    expect(page).toContain("value={risk.version}");
    expect(feedbackSource).toContain("PROJECT_RISK_STALE_VERSION");
  });
});
