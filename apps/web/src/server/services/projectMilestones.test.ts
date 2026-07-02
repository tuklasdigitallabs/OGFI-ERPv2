import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertMilestoneMutation, dateOnlyString } from "./projectMilestones";

describe("project milestone calendar controls", () => {
  test("date-only serialization preserves the calendar date", () => {
    expect(dateOnlyString("2026-07-14T16:00:00.000Z")).toBe("2026-07-14");
    expect(dateOnlyString(new Date("2026-07-14T00:00:00.000Z"))).toBe("2026-07-14");
    expect(dateOnlyString(null)).toBe(null);
  });

  test("at-risk and cancelled milestones require reasons", () => {
    expect(() =>
      assertMilestoneMutation({
        canMutate: true,
        isAtRisk: true
      })
    ).toThrow("PROJECT_MILESTONE_AT_RISK_REASON_REQUIRED");

    expect(() =>
      assertMilestoneMutation({
        canMutate: true,
        nextStatus: "CANCELLED",
        reason: "no"
      })
    ).toThrow("PROJECT_MILESTONE_CANCEL_REASON_REQUIRED");

    expect(() =>
      assertMilestoneMutation({
        canMutate: true,
        nextStatus: "ACHIEVED"
      })
    ).not.toThrow();
  });

  test("milestone mutations require project work mutation access", () => {
    expect(() =>
      assertMilestoneMutation({
        canMutate: false,
        nextStatus: "ACHIEVED"
      })
    ).toThrow("PROJECT_MILESTONE_PERMISSION_DENIED");
  });

  test("milestone service does not import operational mutation services", () => {
    const source = readFileSync(path.resolve(__dirname, "projectMilestones.ts"), "utf8");

    expect(source).not.toContain("./purchaseOrders");
    expect(source).not.toContain("./purchaseRequests");
    expect(source).not.toContain("./receiving");
    expect(source).not.toContain("./transfers");
    expect(source).not.toContain("./inventory");
    expect(source).not.toContain("./approvals");
  });

  test("at-risk milestone creation emits project notification without operational mutation", () => {
    const source = readFileSync(path.resolve(__dirname, "projectMilestones.ts"), "utf8");

    expect(source).toContain("notifyProjectMilestoneAtRisk");
    expect(source).toContain("if (created.isAtRisk)");
    expect(source).toContain("eventType: \"project_milestone.created\"");
  });

  test("calendar event filters use inclusive date-only window bounds", () => {
    const source = readFileSync(path.resolve(__dirname, "projectMilestones.ts"), "utf8");

    expect(source).toContain("projectDateWindowBounds({ from, to })");
    expect(source).toContain("dueDate: { gte: fromDate, lt: toDateExclusive }");
    expect(source).toContain("targetDate: { gte: fromDate, lt: toDateExclusive }");
    expect(source).not.toContain("dueDate: { gte: new Date(from), lte: new Date(to) }");
    expect(source).not.toContain("targetDate: { gte: new Date(from), lte: new Date(to) }");
  });

  test("milestone transitions use optimistic version checks and audit version increments", () => {
    const source = readFileSync(path.resolve(__dirname, "projectMilestones.ts"), "utf8");
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/work-calendar/page.tsx"),
      "utf8"
    );
    const feedbackSource = readFileSync(
      path.resolve(__dirname, "actionFeedback.ts"),
      "utf8"
    );

    expect(source).toContain("expectedVersion: formData.get(\"expectedVersion\") || undefined");
    expect(source).toContain("PROJECT_MILESTONE_STALE_VERSION");
    expect(source).toContain("tx.projectMilestone.updateMany");
    expect(source).toContain("version: { increment: 1 }");
    expect(pageSource).toContain("name=\"expectedVersion\"");
    expect(pageSource).toContain("value={milestone.version}");
    expect(pageSource).toContain("ActionFeedbackBanner");
    expect(pageSource).toContain("getActionFeedback");
    expect(pageSource).toContain("actionErrorRedirectPath");
    expect(pageSource).toContain("selectedProject?.canMutateWork");
    expect(pageSource).toContain("Read-only calendar access");
    expect(feedbackSource).toContain("PROJECT_MILESTONE_STALE_VERSION");
    expect(feedbackSource).toContain("PROJECT_MILESTONE_PERMISSION_DENIED");
  });
});
