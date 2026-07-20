import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertProjectLifecycleTransition,
  buildProjectTemplateSeedPlan,
  buildProjectTemplateSnapshot,
  canAccessRestrictedProject,
  hasCompanyManageScope,
  projectTemplateStartDate,
  resolveProjectTemplateOwner,
  type ProjectMemberSummary
} from "./projects";

describe("project tracker authorization helpers", () => {
  test("restricted projects require membership, project scope, or project manager with company manage scope", () => {
    expect(
      canAccessRestrictedProject({
        isMember: false,
        hasProjectScope: false,
        canManageProjects: false,
        hasCompanyManageScope: true
      })
    ).toBe(false);
    expect(
      canAccessRestrictedProject({
        isMember: true,
        hasProjectScope: false,
        canManageProjects: false,
        hasCompanyManageScope: false
      })
    ).toBe(true);
    expect(
      canAccessRestrictedProject({
        isMember: false,
        hasProjectScope: true,
        canManageProjects: false,
        hasCompanyManageScope: false
      })
    ).toBe(true);
    expect(
      canAccessRestrictedProject({
        isMember: false,
        hasProjectScope: false,
        canManageProjects: true,
        hasCompanyManageScope: true
      })
    ).toBe(true);
  });

  test("company manage scope is exact to the active company", () => {
    expect(
      hasCompanyManageScope(
        [
          {
            scopeType: "COMPANY",
            scopeId: "company-1",
            accessLevel: "VIEW"
          },
          {
            scopeType: "COMPANY",
            scopeId: "company-2",
            accessLevel: "MANAGE"
          }
        ],
        "company-1"
      )
    ).toBe(false);
    expect(
      hasCompanyManageScope(
        [
          {
            scopeType: "COMPANY",
            scopeId: "company-1",
            accessLevel: "MANAGE"
          }
        ],
        "company-1"
      )
    ).toBe(true);
  });

  test("project service does not import operational mutation services", () => {
    const source = readFileSync(path.resolve(__dirname, "projects.ts"), "utf8");

    expect(source).not.toContain("./purchaseOrders");
    expect(source).not.toContain("./purchaseRequests");
    expect(source).not.toContain("./receiving");
    expect(source).not.toContain("./transfers");
    expect(source).not.toContain("./inventory");
    expect(source).not.toContain("./approvals");
  });

  test("project scope lookup excludes future and expired assignments", () => {
    const source = readFileSync(path.resolve(__dirname, "projects.ts"), "utf8");

    expect(source).toContain("startsAt: { lte: now }");
    expect(source).toContain("OR: [{ endsAt: null }, { endsAt: { gt: now } }]");
  });

  test("published template application stores an immutable project snapshot", () => {
    const snapshot = buildProjectTemplateSnapshot({
      id: "template-1",
      code: "ROLLOUT",
      name: "ERP Rollout",
      projectType: "ERP / IT Implementation",
      isRestrictedDefault: true,
      configJson: {
        statusSet: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
      }
    });

    expect(snapshot).toEqual({
      templateId: "template-1",
      code: "ROLLOUT",
      name: "ERP Rollout",
      projectType: "ERP / IT Implementation",
      isRestrictedDefault: true,
      configJson: {
        statusSet: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
      },
      snapshotVersion: 1
    });
  });

  test("template seed plan resolves owners, keys, checklist order, and offsets", () => {
    const plan = buildProjectTemplateSeedPlan({
      project: {
        id: "project-1",
        tenantId: "tenant-1",
        companyId: "company-1",
        code: "ERP",
        startAt: null,
        targetEndAt: new Date("2026-07-10T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T08:00:00.000Z"),
        managerUserId: "manager-1",
        sponsorUserId: "sponsor-1"
      },
      actorUserId: "creator-1",
      templateConfig: {
        schemaVersion: 1,
        statusSet: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
        defaults: {
          initialTaskStatus: "PLANNED",
          ownerAssignment: "PROJECT_MANAGER"
        },
        notificationDefaults: {
          dueSoonWindowDays: 2,
          overdueReminderFrequencyDays: 1,
          maxOverdueRemindersPerTask: 5
        },
        tasks: [
          {
            templateTaskCode: "T-001",
            title: "Kickoff",
            status: "PLANNED",
            priority: "HIGH",
            owner: { type: "ROLE", value: "PROJECT_MANAGER" },
            startOffsetDays: -1,
            dueOffsetDays: 2,
            checklistItems: [
              { title: "Confirm participants", required: true },
              { title: "Confirm scope", required: false }
            ]
          },
          {
            templateTaskCode: "T-002",
            title: "Sponsor signoff",
            status: "IN_PROGRESS",
            priority: "NORMAL",
            owner: { type: "ROLE", value: "PROJECT_SPONSOR" },
            checklistItems: []
          },
          {
            templateTaskCode: "T-003",
            title: "Creator follow-up",
            status: "PLANNED",
            priority: "NORMAL",
            owner: { type: "ROLE", value: "CREATOR" },
            checklistItems: []
          }
        ],
        milestones: [
          {
            code: "MS-001",
            title: "Readiness",
            targetOffsetDays: 5,
            owner: { type: "ROLE", value: "PROJECT_SPONSOR" }
          }
        ],
        evidenceDefaults: [],
        signoffDefaults: []
      }
    });

    expect(plan.tasks.map((task) => task.taskKey)).toEqual([
      "ERP-001",
      "ERP-002",
      "ERP-003"
    ]);
    expect(plan.tasks.map((task) => task.ownerUserId)).toEqual([
      "manager-1",
      "sponsor-1",
      "creator-1"
    ]);
    expect(plan.tasks[0]?.startDate?.toISOString()).toBe("2026-07-09T00:00:00.000Z");
    expect(plan.tasks[0]?.dueDate?.toISOString()).toBe("2026-07-12T00:00:00.000Z");
    expect(plan.tasks[0]?.checklistItems).toEqual([
      { title: "Confirm participants", position: 1, isRequired: true },
      { title: "Confirm scope", position: 2, isRequired: false }
    ]);
    expect(plan.milestones[0]?.ownerUserId).toBe("sponsor-1");
    expect(plan.milestones[0]?.targetDate?.toISOString()).toBe(
      "2026-07-15T00:00:00.000Z"
    );
  });

  test("template helper owner and start-date fallbacks are deterministic", () => {
    const ownerInput = {
      managerUserId: "manager",
      sponsorUserId: "sponsor",
      creatorUserId: "creator"
    };

    expect(resolveProjectTemplateOwner({ role: "PROJECT_MANAGER", ...ownerInput })).toBe(
      "manager"
    );
    expect(resolveProjectTemplateOwner({ role: "PROJECT_SPONSOR", ...ownerInput })).toBe(
      "sponsor"
    );
    expect(resolveProjectTemplateOwner({ role: "CREATOR", ...ownerInput })).toBe(
      "creator"
    );
    expect(
      projectTemplateStartDate({
        startAt: new Date("2026-07-03T00:00:00.000Z"),
        targetEndAt: new Date("2026-07-04T00:00:00.000Z"),
        createdAt: new Date("2026-07-05T00:00:00.000Z")
      }).toISOString()
    ).toBe("2026-07-03T00:00:00.000Z");
    expect(
      projectTemplateStartDate({
        startAt: null,
        targetEndAt: null,
        createdAt: new Date("2026-07-05T00:00:00.000Z")
      }).toISOString()
    ).toBe("2026-07-05T00:00:00.000Z");
  });

  test("project lifecycle transitions enforce the status matrix and reason rules", () => {
    expect(() =>
      assertProjectLifecycleTransition({
        currentStatus: "DRAFT",
        nextStatus: "ACTIVE"
      })
    ).not.toThrow();

    expect(() =>
      assertProjectLifecycleTransition({
        currentStatus: "DRAFT",
        nextStatus: "ARCHIVED",
        reason: "archive"
      })
    ).toThrow("PROJECT_LIFECYCLE_INVALID_TRANSITION");

    expect(() =>
      assertProjectLifecycleTransition({
        currentStatus: "ACTIVE",
        nextStatus: "ON_HOLD"
      })
    ).toThrow("PROJECT_LIFECYCLE_REASON_REQUIRED");

    expect(() =>
      assertProjectLifecycleTransition({
        currentStatus: "COMPLETED",
        nextStatus: "ARCHIVED",
        reason: "Completed and ready to archive"
      })
    ).not.toThrow();
  });

  test("member management is permission gated and activity backed", () => {
    const source = readFileSync(path.resolve(__dirname, "projects.ts"), "utf8");
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/projects/page.tsx"),
      "utf8"
    );
    const _shape: ProjectMemberSummary = {
      id: "member-1",
      userId: "user-1",
      projectId: "project-1",
      projectCode: "P-1",
      projectName: "Project",
      userName: "User",
      userEmail: "user@example.test",
      projectRole: "CONTRIBUTOR",
      canRemove: true
    };

    expect(source).toContain("permissions.projectManageMembers");
    expect(source).toContain("transitionProjectLifecycle");
    expect(source).toContain("project.lifecycle.transitioned");
    expect(source).toContain("project.lifecycle.denied");
    expect(source).toContain("PROJECT_LIFECYCLE_STALE_VERSION");
    expect(source).toContain("assertProjectCanCloseCancelOrArchive");
    expect(source).toContain('"COMPLETED", "CANCELLED", "ARCHIVED"');
    expect(source).toContain("PROJECT_LIFECYCLE_ACTIVE_TASKS_BLOCKED");
    expect(source).toContain("PROJECT_LIFECYCLE_OPEN_BLOCKERS_BLOCKED");
    expect(source).toContain("PROJECT_LIFECYCLE_OPEN_RISKS_BLOCKED");
    expect(source).toContain("PROJECT_LIFECYCLE_EXPANSION_GATES_BLOCKED");
    expect(source).toContain("EXPANSION_LIFECYCLE_GATE:");
    expect(source).toContain("tx.project.updateMany");
    expect(source).toContain("reasonCode: \"PROJECT_LIFECYCLE_ACTIVE_TASKS_BLOCKED\"");
    expect(source).toContain("canMutateWork");
    expect(source).toContain('"MANAGER", "ADMINISTRATOR", "CONTRIBUTOR"');
    expect(source).not.toContain("./purchaseOrders");
    expect(source).not.toContain("./inventory");
    expect(source).toContain("PROJECT_TEMPLATE_NOT_PUBLISHED");
    expect(source).toContain("templateSnapshotJson");
    expect(source).toContain("applyProjectTemplateDefaults");
    expect(source).toContain("projectTask.create");
    expect(source).toContain("projectTaskChecklistItem.createMany");
    expect(source).toContain("projectMilestone.create");
    expect(source).toContain("project-template-apply");
    expect(source).toContain("project_member.added");
    expect(source).toContain("project_member.removed");
    expect(source).toContain("PROJECT_MEMBER_SELF_REMOVE_BLOCKED");
    expect(source).not.toContain("delete(");
    expect(page).toContain("ActionFeedbackBanner");
    expect(page).toContain("getActionFeedback");
    expect(page).toContain("actionErrorRedirectPath");
    expect(page).toContain("addProjectMember");
    expect(page).toContain("removeProjectMember");
    expect(page).toContain("transitionProjectLifecycleAction");
    expect(page).toContain("expectedVersion");
    expect(page).toContain("Members");
  });
});
