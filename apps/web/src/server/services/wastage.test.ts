import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertWastageCanCancel,
  assertWastageCanPost,
  assertWastageCanReverse,
  assertWastageCanReview,
  assertWastageCanSubmit,
  assertWastageQuantity,
  buildWastagePolicyEvaluation
} from "./wastage";

describe("wastage foundation rules", () => {
  test("list page copy matches implemented approval, posting, and reversal workflow", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../app/(app)/wastage/page.tsx"),
      "utf8"
    );

    expect(source).toContain("Post Wastage action creates WASTAGE_OUT");
    expect(source).not.toContain(
      "Approved reports are approval-only until posting policy is implemented"
    );
    expect(source).not.toContain(
      "This foundation records evidence and review status only"
    );
  });

  test("list page gate allows every wastage action permission", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../app/(app)/wastage/page.tsx"),
      "utf8"
    );

    expect(source).toContain("canUseWastageReports(session.permissionCodes)");
  });

  test("audit metadata reflects separate wastage posting instead of non-posting foundation", () => {
    const source = readFileSync(path.resolve(__dirname, "wastage.ts"), "utf8");

    expect(source).toContain("postingRequiresSeparateAction: true");
    expect(source).not.toContain("nonPostingFoundation: true");
  });

  test("wastage approval submission emits scoped in-app approval notification", () => {
    const source = readFileSync(path.resolve(__dirname, "wastage.ts"), "utf8");

    expect(source).toContain("resolveScopedNotificationRecipients");
    expect(source).toContain("recordWorkflowNotifications");
    expect(source).toContain('notificationType: "APPROVE_WASTAGE_REPORT"');
    expect(source).toContain("locationId: report.inventoryLocation.locationId");
    expect(source).toContain("sourceEventKey: auditEvent.id");
    expect(source).toContain('recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role"');
    expect(source).toContain("deepLink: `/approvals/${approval.id}`");
    expect(source).toContain('source: "wastage-approval-submission"');
  });

  test("service read gate allows every wastage action permission", () => {
    const source = readFileSync(path.resolve(__dirname, "wastage.ts"), "utf8");

    expect(source).toContain("canUseWastageReports(session.permissionCodes)");
  });

  test("requires positive wastage quantities", () => {
    expect(() => assertWastageQuantity(1)).not.toThrow();
    expect(() => assertWastageQuantity(0)).toThrow("WASTAGE_QUANTITY_INVALID");
    expect(() => assertWastageQuantity(Number.NaN)).toThrow(
      "WASTAGE_QUANTITY_INVALID"
    );
  });

  test("submits only draft or returned wastage reports", () => {
    expect(() => assertWastageCanSubmit("DRAFT")).not.toThrow();
    expect(() => assertWastageCanSubmit("RETURNED")).not.toThrow();
    expect(() => assertWastageCanSubmit("PENDING_APPROVAL")).toThrow(
      "WASTAGE_NOT_OPEN_FOR_SUBMIT"
    );
    expect(() => assertWastageCanSubmit("SUBMITTED")).toThrow(
      "WASTAGE_NOT_OPEN_FOR_SUBMIT"
    );
  });

  test("reviews only submitted wastage reports", () => {
    expect(() => assertWastageCanReview("SUBMITTED")).not.toThrow();
    expect(() => assertWastageCanReview("DRAFT")).toThrow(
      "WASTAGE_NOT_SUBMITTED_FOR_REVIEW"
    );
  });

  test("cancels only non-final non-posting wastage reports", () => {
    expect(() => assertWastageCanCancel("DRAFT")).not.toThrow();
    expect(() => assertWastageCanCancel("SUBMITTED")).not.toThrow();
    expect(() => assertWastageCanCancel("PENDING_APPROVAL")).not.toThrow();
    expect(() => assertWastageCanCancel("RETURNED")).not.toThrow();
    expect(() => assertWastageCanCancel("APPROVED")).toThrow(
      "WASTAGE_NOT_CANCELLABLE"
    );
    expect(() => assertWastageCanCancel("REVIEWED")).toThrow(
      "WASTAGE_NOT_CANCELLABLE"
    );
    expect(() => assertWastageCanCancel("REJECTED")).toThrow(
      "WASTAGE_NOT_CANCELLABLE"
    );
  });

  test("posts only approved unposted wastage reports", () => {
    expect(() => assertWastageCanPost("APPROVED", null)).not.toThrow();
    expect(() => assertWastageCanPost("PENDING_APPROVAL", null)).toThrow(
      "WASTAGE_NOT_APPROVED_FOR_POSTING"
    );
    expect(() => assertWastageCanPost("REVIEWED", null)).toThrow(
      "WASTAGE_NOT_APPROVED_FOR_POSTING"
    );
    expect(() => assertWastageCanPost("POSTED", new Date())).toThrow(
      "WASTAGE_ALREADY_POSTED"
    );
  });

  test("reverses only posted unreversed wastage reports", () => {
    expect(() => assertWastageCanReverse("POSTED", null)).not.toThrow();
    expect(() => assertWastageCanReverse("APPROVED", null)).toThrow(
      "WASTAGE_NOT_POSTED_FOR_REVERSAL"
    );
    expect(() => assertWastageCanReverse("REVIEWED", null)).toThrow(
      "WASTAGE_NOT_POSTED_FOR_REVERSAL"
    );
    expect(() => assertWastageCanReverse("REVERSED", new Date())).toThrow(
      "WASTAGE_ALREADY_REVERSED"
    );
  });

  test("requires evidence when category photo policy applies", () => {
    const evaluation = buildWastagePolicyEvaluation({
      policy: null,
      totalEstimatedCost: 100,
      categoryPhotoRequired: true,
      evidenceReference: null,
      repeatItemLocationPriorCount: 0,
      repeatReporterPriorCount: 0
    });

    expect(evaluation.evidenceRequired).toBe(true);
    expect(evaluation.evidenceSatisfied).toBe(false);
    expect(evaluation.flags).toEqual(
      expect.arrayContaining([
        "CATEGORY_PHOTO_REQUIRED",
        "EVIDENCE_REQUIRED",
        "EVIDENCE_MISSING"
      ])
    );
  });

  test("flags high-value wastage and requires evidence from configured policy", () => {
    const evaluation = buildWastagePolicyEvaluation({
      policy: {
        id: "policy-1",
        name: "High value",
        policyVersion: "v1",
        minimumEstimatedCost: 5000,
        requiresEvidence: true,
        repeatLookbackDays: 30,
        repeatItemLocationCount: 3,
        repeatReporterCount: 5
      },
      totalEstimatedCost: 6000,
      categoryPhotoRequired: false,
      evidenceReference: "photo-001.jpg",
      repeatItemLocationPriorCount: 0,
      repeatReporterPriorCount: 0
    });

    expect(evaluation.evidenceRequired).toBe(true);
    expect(evaluation.evidenceSatisfied).toBe(true);
    expect(evaluation.flags).toEqual(
      expect.arrayContaining(["HIGH_VALUE", "EVIDENCE_REQUIRED"])
    );
    expect(evaluation.policySnapshot.policyVersion).toBe("v1");
  });

  test("flags repeat patterns as factual context without making evidence missing", () => {
    const evaluation = buildWastagePolicyEvaluation({
      policy: {
        id: "policy-1",
        name: "Repeat review",
        policyVersion: "v1",
        minimumEstimatedCost: null,
        requiresEvidence: false,
        repeatLookbackDays: 30,
        repeatItemLocationCount: 3,
        repeatReporterCount: 5
      },
      totalEstimatedCost: 50,
      categoryPhotoRequired: false,
      evidenceReference: null,
      repeatItemLocationPriorCount: 2,
      repeatReporterPriorCount: 4
    });

    expect(evaluation.evidenceRequired).toBe(false);
    expect(evaluation.evidenceSatisfied).toBe(true);
    expect(evaluation.flags).toEqual(
      expect.arrayContaining(["REPEAT_ITEM_LOCATION", "REPEAT_REPORTER"])
    );
    expect(evaluation.flags).not.toContain("EVIDENCE_MISSING");
  });
});
