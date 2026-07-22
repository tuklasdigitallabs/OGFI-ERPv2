import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { permissions } from "./authorization";
import {
  assertWastageCanCancel,
  assertWastageCanPost,
  assertWastageCanReverse,
  assertWastageCanReview,
  assertWastageCanSubmit,
  assertWastageQuantity,
  buildWastagePolicyEvaluation,
  listWastageMyTaskPage,
  resolveWastageDashboardProfile,
  wastageDashboardProfileHref,
  wastageDashboardProfileWhere
} from "./wastage";

const mockPrisma = vi.hoisted(() => ({
  wastageReport: { count: vi.fn(), findMany: vi.fn() }
}));

vi.mock("@ogfi/database", () => ({ prisma: mockPrisma }));

const dashboardSession = {
  context: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    locationId: "00000000-0000-4000-8000-000000000004"
  }
};

describe("wastage foundation rules", () => {
  test("resolves only the closed wastage exception profile and canonical scoped predicate", () => {
    expect(resolveWastageDashboardProfile("wastage-exceptions-v1")).toBe(
      "wastage-exceptions-v1"
    );
    expect(resolveWastageDashboardProfile("all")).toBeNull();
    expect(resolveWastageDashboardProfile(undefined)).toBeNull();
    expect(wastageDashboardProfileHref("wastage-exceptions-v1", 2)).toBe(
      "/wastage?dashboard=wastage-exceptions-v1&page=2"
    );
    expect(
      wastageDashboardProfileWhere(
        dashboardSession as never,
        "wastage-exceptions-v1"
      )
    ).toEqual({
      tenantId: dashboardSession.context.tenantId,
      companyId: dashboardSession.context.companyId,
      inventoryLocation: { locationId: dashboardSession.context.locationId },
      OR: [
        { status: { in: ["PENDING_APPROVAL", "APPROVED", "POSTING", "RETURNED"] } },
        { evidenceRequired: true, evidenceSatisfied: false }
      ]
    });
  });

  test("dashboard, paged profile, and export use the canonical exception predicate", () => {
    const source = readFileSync(path.resolve(__dirname, "wastage.ts"), "utf8");
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/wastage/page.tsx"),
      "utf8"
    );
    const route = readFileSync(
      path.resolve(__dirname, "../../app/(app)/wastage/export/route.ts"),
      "utf8"
    );

    expect(source).toContain("wastageDashboardProfileWhere(");
    expect(source).toContain('"wastage-exceptions-v1"');
    expect(source).toContain("listWastageDashboardProfilePage");
    expect(source).toContain("take: wastageDashboardProfilePageSize");
    expect(page).toContain("!profile && canCreateWastage");
    expect(page).toContain("This read-only");
    expect(route).toContain("listWastageReports(session, profile ?? undefined)");
    expect(route).toContain("Unsupported wastage dashboard profile.");
  });

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

  test("wastage approval submission uses normalized routing without role fanout", () => {
    const source = readFileSync(path.resolve(__dirname, "wastage.ts"), "utf8");

    expect(source).toContain("for (const step of routedSteps)");
    expect(source).toContain("configureApprovalStepRouting(tx");
    expect(source).toContain("requiredPermissionCode: permissions.wastageApprove");
    expect(source).toContain("dueAt: null");
    expect(source).toContain('source: "wastage-report-submission"');
    expect(source).toContain("userId: report.reportedByUserId");
    expect(source).toContain("assertAnyEligibleApprovalActorForStep(tx");
    expect(source.indexOf("assertAnyEligibleApprovalActorForStep(tx")).toBeLessThan(
      source.indexOf("const submitted = await tx.wastageReport.updateMany")
    );
    expect(source).toContain("recordWorkflowNotifications");
    expect(source).toContain('notificationType: "APPROVE_WASTAGE_REPORT"');
    expect(source).toContain("locationId: report.inventoryLocation.locationId");
    expect(source).toContain("sourceEventKey: auditEvent.id");
    expect(source).toContain("recipientUserIds: firstStep.userId ? [firstStep.userId] : []");
    expect(source).not.toContain("resolveScopedNotificationRecipients");
    expect(source).toContain("deepLink: `/approvals/${approval.id}`");
    expect(source).toContain('source: "wastage-approval-submission"');
  });

  test("service read gate allows every wastage action permission", () => {
    const source = readFileSync(path.resolve(__dirname, "wastage.ts"), "utf8");

    expect(source).toContain("canUseWastageReports(session.permissionCodes)");
  });

  test("My Tasks returns only authorized review or post controls with an exact count and cursor", async () => {
    mockPrisma.wastageReport.count.mockResolvedValue(2);
    mockPrisma.wastageReport.findMany.mockResolvedValue([
      {
        id: "report-1",
        publicReference: "WST-2026-00001",
        status: "SUBMITTED",
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        inventoryLocation: { name: "Branch Stock" }
      },
      {
        id: "report-2",
        publicReference: "WST-2026-00002",
        status: "APPROVED",
        createdAt: new Date("2026-07-21T00:00:00.000Z"),
        inventoryLocation: { name: "Branch Stock" }
      }
    ]);
    const session = {
      user: { id: "user-1" },
      context: dashboardSession.context,
      permissionCodes: [permissions.wastageReview, permissions.wastagePost]
    };

    await expect(listWastageMyTaskPage(session as never, { take: 1 })).resolves.toEqual({
      totalCount: 2,
      items: [
        expect.objectContaining({
          taskId: "wastage-report-1",
          actionLabel: "Review wastage report"
        })
      ],
      nextCursor: {
        createdAt: "2026-07-20T00:00:00.000Z",
        id: "report-1"
      }
    });
    expect(mockPrisma.wastageReport.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: dashboardSession.context.tenantId,
        companyId: dashboardSession.context.companyId,
        status: { in: ["SUBMITTED", "APPROVED"] }
      })
    });
    expect(mockPrisma.wastageReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 2
      })
    );
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
