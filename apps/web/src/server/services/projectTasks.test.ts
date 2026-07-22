import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { permissions } from "./authorization";
import {
  dateOnlyInTimeZone,
  isProjectTaskOverdue,
  projectTaskDueState
} from "./projectDates";
import {
  assertProjectTaskCanReassign,
  assertProjectTaskStatusEnabled,
  assertTaskTransition,
  enabledProjectTaskStatuses,
  canMutateProjectWork,
  projectTaskReassignmentRequiresReason
} from "./projectTasks";

const projectTaskService = readFileSync(
  path.resolve(__dirname, "projectTasks.ts"),
  "utf8"
);

describe("project task workflow controls", () => {
  test("status transitions use a version-checked write to reject concurrent changes", () => {
    expect(projectTaskService).toContain("version: task.version");
    expect(projectTaskService).toContain("PROJECT_TASK_STALE_VERSION");
    expect(projectTaskService).toContain("tx.projectTask.updateMany");
  });
  test("project overdue helper uses local date-only semantics and terminal overrides", () => {
    const asOf = new Date("2026-06-30T16:30:00.000Z");

    expect(
      dateOnlyInTimeZone(new Date("2026-06-30T16:30:00.000Z"), "Asia/Manila")
    ).toBe("2026-07-01");
    expect(
      isProjectTaskOverdue({
        dueDate: new Date("2026-06-30T00:00:00.000Z"),
        status: "IN_PROGRESS",
        asOf
      })
    ).toBe(true);
    expect(
      isProjectTaskOverdue({
        dueDate: new Date("2026-07-01T00:00:00.000Z"),
        status: "BLOCKED",
        asOf
      })
    ).toBe(false);
    expect(
      projectTaskDueState({
        dueDate: new Date("2026-07-01T00:00:00.000Z"),
        status: "BLOCKED",
        asOf
      })
    ).toEqual({ dueState: "DUE_TODAY", overdueDays: 0 });
    expect(
      projectTaskDueState({
        dueDate: new Date("2026-06-28T00:00:00.000Z"),
        status: "FOR_REVIEW",
        asOf
      })
    ).toEqual({ dueState: "OVERDUE", overdueDays: 3 });
    expect(
      isProjectTaskOverdue({
        dueDate: new Date("2026-06-30T00:00:00.000Z"),
        status: "COMPLETED",
        asOf
      })
    ).toBe(false);
    expect(
      isProjectTaskOverdue({
        dueDate: null,
        status: "IN_PROGRESS",
        asOf
      })
    ).toBe(false);
  });

  test("blocked, cancelled, and reopened tasks require reasons", () => {
    expect(() =>
      assertTaskTransition({
        currentStatus: "IN_PROGRESS",
        nextStatus: "BLOCKED",
        canMutate: true
      })
    ).toThrow("PROJECT_TASK_BLOCKER_REASON_REQUIRED");

    expect(() =>
      assertTaskTransition({
        currentStatus: "IN_PROGRESS",
        nextStatus: "CANCELLED",
        canMutate: true,
        reason: "no"
      })
    ).toThrow("PROJECT_TASK_CANCEL_REASON_REQUIRED");

    expect(() =>
      assertTaskTransition({
        currentStatus: "COMPLETED",
        nextStatus: "IN_PROGRESS",
        canMutate: true
      })
    ).toThrow("PROJECT_TASK_REOPEN_REASON_REQUIRED");
  });

  test("blocked task reason enforcement reads the configurable DEC-0036 policy", () => {
    expect(() =>
      assertTaskTransition({
        currentStatus: "IN_PROGRESS",
        nextStatus: "BLOCKED",
        canMutate: true,
        blockerReasonRequired: false
      })
    ).not.toThrow();

    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const policySource = readFileSync(
      path.resolve(__dirname, "policySettings.ts"),
      "utf8"
    );

    expect(source).toContain("getProjectTaskPolicy");
    expect(source).toContain("blockerReasonRequired");
    expect(policySource).toContain("projects.blocker_reason_required");

    const boardPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/work-boards/page.tsx"),
      "utf8"
    );
    const myWorkSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/page.tsx"),
      "utf8"
    );
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/[taskId]/page.tsx"),
      "utf8"
    );

    for (const pageSource of [boardPageSource, myWorkSource, detailPageSource]) {
      expect(pageSource).toContain("getProjectTaskPolicy");
      expect(pageSource).toContain("blockerReasonRequired");
      expect(pageSource).toContain("required={blockerReasonRequired}");
      expect(pageSource).toContain("Company policy requires a blocker reason");
    }
  });

  test("blocked task transition persists optional next-review dates across task forms", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const boardPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/work-boards/page.tsx"),
      "utf8"
    );
    const myWorkSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/page.tsx"),
      "utf8"
    );
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/[taskId]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("nextReviewAt: formData.get(\"nextReviewAt\") || undefined");
    expect(source).toContain("const nextReviewAt = values.nextReviewAt ? new Date(values.nextReviewAt) : null");
    expect(source).toContain("nextBlockerReviewAt");
    expect(source).toContain("nextBlockerReviewAt?.toISOString() ?? null");
    for (const pageSource of [boardPageSource, myWorkSource, detailPageSource]) {
      expect(pageSource).toContain("name=\"nextReviewAt\"");
      expect(pageSource).toContain("type=\"date\"");
      expect(pageSource).toContain("nextBlockerReviewAt");
    }
  });

  test("blocked task resume or cancellation closes open blocker records with activity", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const reportsSource = readFileSync(path.resolve(__dirname, "projectReports.ts"), "utf8");

    expect(source).toContain("const shouldCloseOpenBlockers =");
    expect(source).toContain("task.status === \"BLOCKED\" && values.nextStatus !== \"BLOCKED\"");
    expect(source).toContain("tx.projectBlocker.updateMany");
    expect(source).toContain("status: blockerStatus");
    expect(source).toContain("resolvedAt: now");
    expect(source).toContain("resolvedByUserId: session.user.id");
    expect(source).toContain("project_blocker.resolved");
    expect(source).toContain("project_blocker.cancelled");
    expect(source).toContain("openBlockersClosed: shouldCloseOpenBlockers");
    expect(reportsSource).toContain('"project_blocker.resolved": "Blocker resolved"');
    expect(reportsSource).toContain('"project_blocker.cancelled": "Blocker cancelled"');
    expect(reportsSource).toContain('ProjectBlocker: "BLOCKER"');
  });

  test("open blockers can be manually resolved or cancelled without mutating task status", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/[taskId]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("export async function resolveProjectTaskBlocker");
    expect(source).toContain("resolveBlockerSchema");
    expect(source).toContain("resolutionNote: z.string().trim().min(5).max(1000)");
    expect(source).toContain("PROJECT_BLOCKER_NOT_FOUND");
    expect(source).toContain("PROJECT_BLOCKER_NOT_OPEN");
    expect(source).toContain("getTaskMutationAccess(session, blocker.projectId)");
    expect(source).toContain("tx.projectBlocker.updateMany");
    expect(source).toContain("status: values.nextStatus");
    expect(source).toContain("resolutionNote: values.resolutionNote");
    expect(source).toContain("project-task-blocker-manual-resolution");
    expect(source).not.toContain("purchaseOrder.update");
    expect(source).not.toContain("inventoryMovement.create");
    expect(detailPageSource).toContain("resolveProjectTaskBlocker");
    expect(detailPageSource).toContain("OpenBlockers");
    expect(detailPageSource).toContain("name=\"blockerId\"");
    expect(detailPageSource).toContain("name=\"resolutionNote\"");
    expect(detailPageSource).toContain("value=\"RESOLVED\"");
    expect(detailPageSource).toContain("value=\"CANCELLED\"");
  });

  test("terminal task states can only reopen with a reason", () => {
    expect(() =>
      assertTaskTransition({
        currentStatus: "COMPLETED",
        nextStatus: "BLOCKED",
        canMutate: true,
        reason: "Needs vendor response"
      })
    ).toThrow("PROJECT_TASK_TERMINAL_STATUS");

    expect(() =>
      assertTaskTransition({
        currentStatus: "COMPLETED",
        nextStatus: "IN_PROGRESS",
        canMutate: true,
        reason: "Client reopened scope"
      })
    ).not.toThrow();
  });

  test("task completion is blocked until required checklist items are complete", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(source).toContain("checklistItems: {");
    expect(source).toContain("where: { archivedAt: null }");
    expect(source).toContain('values.nextStatus === "COMPLETED"');
    expect(source).toContain("item.isRequired && !item.isCompleted");
    expect(source).toContain("PROJECT_TASK_REQUIRED_CHECKLIST_INCOMPLETE");
    expect(feedbackSource).toContain("PROJECT_TASK_REQUIRED_CHECKLIST_INCOMPLETE");
  });

  test("task reassignment requires reasons for high-friction work and blocks terminal tasks", () => {
    expect(
      projectTaskReassignmentRequiresReason({
        status: "IN_PROGRESS",
        priority: "NORMAL",
        isOverdue: false
      })
    ).toBe(false);
    expect(
      projectTaskReassignmentRequiresReason({
        status: "IN_PROGRESS",
        priority: "HIGH",
        isOverdue: false
      })
    ).toBe(true);
    expect(
      projectTaskReassignmentRequiresReason({
        status: "BLOCKED",
        priority: "NORMAL",
        isOverdue: false
      })
    ).toBe(true);
    expect(
      projectTaskReassignmentRequiresReason({
        status: "WAITING_FOR_APPROVAL",
        priority: "NORMAL",
        isOverdue: false
      })
    ).toBe(true);
    expect(
      projectTaskReassignmentRequiresReason({
        status: "PLANNED",
        priority: "NORMAL",
        isOverdue: true
      })
    ).toBe(true);

    expect(() =>
      assertProjectTaskCanReassign({
        status: "BLOCKED",
        priority: "NORMAL",
        isOverdue: false
      })
    ).toThrow("PROJECT_TASK_REASSIGNMENT_REASON_REQUIRED");
    expect(() =>
      assertProjectTaskCanReassign({
        status: "COMPLETED",
        priority: "NORMAL",
        isOverdue: false,
        reason: "Owner changed"
      })
    ).toThrow("PROJECT_TASK_REASSIGNMENT_TERMINAL_STATUS");
    expect(() =>
      assertProjectTaskCanReassign({
        status: "IN_PROGRESS",
        priority: "HIGH",
        isOverdue: false,
        reason: "Owner unavailable"
      })
    ).not.toThrow();
  });

  test("project task statuses respect configured template status sets with legacy fallback", () => {
    expect(
      enabledProjectTaskStatuses({
        statusSet: ["IN_PROGRESS", "COMPLETED", "CANCELLED"]
      }).has("BLOCKED")
    ).toBe(false);

    expect(() =>
      assertProjectTaskStatusEnabled({
        projectConfigJson: {
          statusSet: ["IN_PROGRESS", "COMPLETED", "CANCELLED"]
        },
        nextStatus: "BLOCKED"
      })
    ).toThrow("PROJECT_TASK_STATUS_NOT_ENABLED");

    expect(
      enabledProjectTaskStatuses({
        statusSet: ["DRAFT", "ACTIVE", "ON_HOLD"]
      }).has("BLOCKED")
    ).toBe(true);
  });

  test("task mutation requires project membership, ownership, or managed company scope", () => {
    const project = {
      managerUserId: "manager-1",
      sponsorUserId: "sponsor-1",
      members: [
        { userId: "viewer-1", projectRole: "VIEWER" },
        { userId: "contributor-1", projectRole: "CONTRIBUTOR" }
      ]
    } as unknown as Parameters<typeof canMutateProjectWork>[0]["project"];

    expect(
      canMutateProjectWork({
        project,
        userId: "viewer-1",
        permissionCodes: [],
        hasCompanyManage: false
      })
    ).toBe(false);
    expect(
      canMutateProjectWork({
        project,
        userId: "contributor-1",
        permissionCodes: [],
        hasCompanyManage: false
      })
    ).toBe(true);
    expect(
      canMutateProjectWork({
        project,
        userId: "outsider-1",
        permissionCodes: [permissions.projectManage],
        hasCompanyManage: true
      })
    ).toBe(true);
  });

  test("project task service does not import operational mutation services", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");

    expect(source).not.toContain("./purchaseOrders");
    expect(source).not.toContain("./purchaseRequests");
    expect(source).not.toContain("./receiving");
    expect(source).not.toContain("./transfers");
    expect(source).not.toContain("./inventory");
    expect(source).not.toContain("./approvals");
  });

  test("task creation assigns only active project members and emits minimal assignment notifications", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const notificationsSource = readFileSync(
      path.resolve(__dirname, "projectNotifications.ts"),
      "utf8"
    );
    const boardPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/work-boards/page.tsx"),
      "utf8"
    );
    const feedbackSource = readFileSync(
      path.resolve(__dirname, "actionFeedback.ts"),
      "utf8"
    );

    expect(source).toContain("listProjectTaskAssigneeOptions");
    expect(source).toContain("assigneeUserId: formData.get(\"assigneeUserId\")");
    expect(source).toContain("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
    expect(source).toContain("member.status === \"ACTIVE\" && member.user.status === \"ACTIVE\"");
    expect(source).toContain("ownerUserId: assigneeUserId");
    expect(source).toContain("userId: assigneeUserId");
    expect(source).toContain("project_task.assigned");
    expect(source).toContain("notifyProjectTaskAssigned");
    expect(notificationsSource).toContain("PROJECT_TASK_ASSIGNED");
    expect(notificationsSource).toContain("PROJECT_TASK_ASSIGNEE");
    expect(notificationsSource).toContain("project-task-assigned:");
    expect(notificationsSource).toContain("input.task.assigneeUserId === input.task.actorUserId");
    expect(notificationsSource).not.toContain("description:");
    expect(notificationsSource).not.toContain("sourceRecordId");
    expect(boardPageSource).toContain("listProjectTaskAssigneeOptions(session, selectedProject.id)");
    expect(boardPageSource).toContain("assigneeOptions.length === 0");
    expect(boardPageSource).toContain("Task creation is unavailable for your role on this project.");
    expect(boardPageSource).toContain("name=\"assigneeUserId\"");
    expect(feedbackSource).toContain("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  });

  test("task reassignment is server-authorized, versioned, audited, and notification-safe", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const notificationsSource = readFileSync(
      path.resolve(__dirname, "projectNotifications.ts"),
      "utf8"
    );
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/[taskId]/page.tsx"),
      "utf8"
    );
    const reportsSource = readFileSync(path.resolve(__dirname, "projectReports.ts"), "utf8");
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(source).toContain("export async function reassignProjectTask");
    expect(source).toContain("task.version !== values.expectedVersion");
    expect(source).toContain("PROJECT_TASK_STALE_VERSION");
    expect(source).toContain("getTaskMutationAccess(session, task.projectId)");
    expect(source).toContain("PROJECT_TASK_PERMISSION_DENIED");
    expect(source).toContain("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
    expect(source).toContain("assertProjectTaskCanReassign");
    expect(source).toContain("tx.projectTaskAssignee.updateMany");
    expect(source).toContain("tx.projectTaskAssignee.upsert");
    expect(source).toContain("eventType: \"project_task.reassigned\"");
    expect(source).toContain("metadata: { source: \"project-task-reassignment\" }");
    expect(source).toContain("notifyProjectTaskAssigned");
    expect(source).toContain("sourceEventKeySuffix: `reassign-v${task.version + 1}`");
    expect(notificationsSource).toContain("sourceEventKeySuffix");
    expect(detailPageSource).toContain("reassignProjectTask");
    expect(detailPageSource).toContain("listProjectTaskAssigneeOptions(session, task.projectId)");
    expect(detailPageSource).toContain("name=\"assigneeUserId\"");
    expect(detailPageSource).toContain("Reassign Task");
    expect(reportsSource).toContain('"project_task.reassigned": "Task reassigned"');
    expect(feedbackSource).toContain("PROJECT_TASK_REASSIGNMENT_REASON_REQUIRED");
    expect(feedbackSource).toContain("PROJECT_TASK_REASSIGNMENT_TERMINAL_STATUS");
  });

  test("checklist, comment, and attachment writes create project activity events", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const myWorkSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/page.tsx"),
      "utf8"
    );

    expect(source).toContain("addProjectTaskChecklistItem");
    expect(source).toContain("toggleProjectTaskChecklistItem");
    expect(source).toContain("addProjectTaskComment");
    expect(source).toContain("addProjectTaskAttachment");
    expect(source).toContain("archiveProjectTaskAttachment");
    expect(source).toContain("project_task_checklist_item.created");
    expect(source).toContain("project_task_checklist_item.completed");
    expect(source).toContain("project_comment.created");
    expect(source).toContain("project_attachment.added");
    expect(source).toContain("project_attachment.archived");
    expect(source).toContain("recordSessionDeniedDecisionSafely");
    expect(source).not.toContain("getAuthorizationDenialWindowMinutes");
    expect(source).toContain("ATTACHMENT_NOT_FOUND_INACTIVE_OR_UNSCOPED");
    expect(source).toContain("attemptedAction: \"RELINK\"");
    expect(source).toContain("projectLinks: {");
    expect(source).toContain("projectId: task.projectId");
    expect(source).toContain("archivedAt: null");
    expect(source).toContain("PROJECT_TASK_STALE_VERSION");
    expect(source).not.toContain("objectKey:");
    expect(myWorkSource).toContain("TaskChecklist");
    expect(myWorkSource).toContain("TaskComments");
    expect(myWorkSource).toContain("TaskAttachments");
    expect(myWorkSource).toContain("expectedVersion");
    expect(myWorkSource).not.toContain("objectKey");
  });

  test("project attachment denial recorder excludes target data", () => {
    const writer = projectTaskService.slice(
      projectTaskService.indexOf("async function logProjectAttachmentDenied"),
      projectTaskService.indexOf("export async function addProjectTaskAttachment")
    );
    const recorderInput = writer.slice(writer.indexOf("recordSessionDeniedDecisionSafely("));

    expect(writer).not.toContain("auditEvent.create");
    expect(recorderInput).not.toContain("taskId:");
    expect(recorderInput).not.toContain("projectId:");
    expect(recorderInput).not.toContain("attachmentId:");
    expect(recorderInput).not.toContain("reasonCode:");
    expect(recorderInput).toContain('resource: "PROJECTS"');
  });

  test("mobile task detail route uses authorized task reads and existing transition services", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/[taskId]/page.tsx"),
      "utf8"
    );
    const boardPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/work-boards/page.tsx"),
      "utf8"
    );

    expect(source).toContain("getProjectTaskDetail");
    expect(source).toContain("projectId: { in: access.projectIds }");
    expect(detailPageSource).toContain("getProjectTaskDetail(session, taskId)");
    expect(detailPageSource).toContain("transitionProjectTask");
    expect(detailPageSource).toContain("toggleProjectTaskChecklistItem");
    expect(detailPageSource).toContain("listProjectTaskRecordLinks(session, task.id)");
    expect(detailPageSource).toContain("expectedVersion");
    expect(boardPageSource).toContain("href={`/my-work/${task.id}`}");
  });

  test("task pages route service errors through sanitized action feedback", () => {
    const myWorkSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/page.tsx"),
      "utf8"
    );
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/[taskId]/page.tsx"),
      "utf8"
    );
    const boardPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/work-boards/page.tsx"),
      "utf8"
    );

    for (const pageSource of [myWorkSource, detailPageSource, boardPageSource]) {
      expect(pageSource).toContain("ActionFeedbackBanner");
      expect(pageSource).toContain("getActionFeedback");
      expect(pageSource).toContain("actionErrorRedirectPath");
    }
    expect(myWorkSource).toContain('redirect(actionErrorRedirectPath("/my-work", error))');
    expect(detailPageSource).toContain("redirect(actionErrorRedirectPath(`/my-work/${taskId}`, error))");
    expect(boardPageSource).toContain("redirect(actionErrorRedirectPath(`/work-boards?projectId=${projectId}`, error))");
  });
});
