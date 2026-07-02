import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { approvalReminderKind } from "./approvals";
import {
  projectTaskDeadlineReminderKind,
  readProjectReminderConfig
} from "./projectNotifications";

describe("notification foundation wiring", () => {
  test("notification model enforces scoped idempotent in-app records", () => {
    const schema = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );

    expect(schema).toContain("model Notification");
    expect(schema).toContain("@@unique([tenantId, recipientUserId, sourceEventKey])");
    expect(schema).toContain("@@index([tenantId, recipientUserId, status, generatedAt])");
    expect(schema).toMatch(/recipient\s+User\s+@relation/);
  });

  test("workflow submissions create approval notifications from source audit events", () => {
    const purchaseRequests = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8"
    );
    const purchaseOrders = readFileSync(
      path.resolve(__dirname, "purchaseOrders.ts"),
      "utf8"
    );
    const quotes = readFileSync(path.resolve(__dirname, "quotes.ts"), "utf8");

    for (const source of [purchaseRequests, purchaseOrders, quotes]) {
      expect(source).toContain("resolveScopedNotificationRecipients");
      expect(source).toContain("recordWorkflowNotifications");
      expect(source).toContain("sourceEventKey: auditEvent.id");
      expect(source).toContain("deepLink: `/approvals/${approvalInstance.id}`");
    }
    expect(purchaseRequests).toContain("APPROVE_PURCHASE_REQUEST");
    expect(purchaseOrders).toContain("APPROVE_PURCHASE_ORDER");
    expect(purchaseOrders).toContain("APPROVE_PO_BALANCE_CLOSURE");
    expect(quotes).toContain("APPROVE_QUOTATION_RECOMMENDATION");
  });

  test("project notifications derive scoped recipients and avoid source payload leaks", () => {
    const projectNotifications = readFileSync(
      path.resolve(__dirname, "projectNotifications.ts"),
      "utf8"
    );
    const projectTasks = readFileSync(path.resolve(__dirname, "projectTasks.ts"), "utf8");
    const projectRisks = readFileSync(path.resolve(__dirname, "projectRisks.ts"), "utf8");
    const projectMilestones = readFileSync(
      path.resolve(__dirname, "projectMilestones.ts"),
      "utf8"
    );

    expect(projectNotifications).toContain("activeProjectRecipientIds");
    expect(projectNotifications).toContain("recordWorkflowNotifications");
    expect(projectNotifications).toContain("PROJECT_TASK_ASSIGNED");
    expect(projectNotifications).toContain("PROJECT_TASK_BLOCKED");
    expect(projectNotifications).toContain("PROJECT_TASK_DUE_SOON");
    expect(projectNotifications).toContain("PROJECT_TASK_OVERDUE");
    expect(projectNotifications).toContain("PROJECT_RISK_ELEVATED");
    expect(projectNotifications).toContain("PROJECT_MILESTONE_AT_RISK");
    expect(projectNotifications).toContain("project-task-assigned:");
    expect(projectNotifications).toContain("project-task-blocked:");
    expect(projectNotifications).toContain("project-task-deadline:");
    expect(projectNotifications).toContain("project-risk-elevated:");
    expect(projectNotifications).toContain("project-milestone-at-risk:");
    expect(projectNotifications).toContain("/my-work/${input.task.id}");
    expect(projectNotifications).toContain("/work-calendar?projectId=");
    expect(projectNotifications).toContain("input.task.assigneeUserId === input.task.actorUserId");
    expect(projectNotifications).toContain("scanProjectTaskDeadlineReminders");
    expect(projectNotifications).toContain("runProjectTaskDeadlineReminderScan");
    expect(projectNotifications).toContain("permissions.projectManage");
    expect(projectNotifications).toContain("hasCompanyManageScope");
    expect(projectNotifications).toContain("readProjectReminderConfig");
    expect(projectNotifications).toContain("maxOverdueRemindersPerTask");
    expect(projectNotifications).toContain("overdueReminderFrequencyDays");
    expect(projectNotifications).toContain("project_task.due_soon_reminder");
    expect(projectNotifications).toContain("project_task.overdue_reminder");
    expect(projectNotifications).not.toContain("reason:");
    expect(projectNotifications).not.toContain("sourceRecordId");
    expect(projectNotifications).not.toContain("objectKey");
    expect(projectTasks).toContain("notifyProjectTaskAssigned");
    expect(projectTasks).toContain("notifyProjectTaskBlocked");
    expect(projectRisks).toContain("notifyProjectRiskElevated");
    expect(projectMilestones).toContain("notifyProjectMilestoneAtRisk");
  });

  test("project deadline reminders use bounded config and skip terminal tasks", () => {
    expect(readProjectReminderConfig(null)).toEqual({
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5
    });
    expect(
      readProjectReminderConfig({
        notificationDefaults: {
          dueSoonWindowDays: 4,
          overdueReminderFrequencyDays: 2,
          maxOverdueRemindersPerTask: 3
        }
      })
    ).toEqual({
      dueSoonWindowDays: 4,
      overdueReminderFrequencyDays: 2,
      maxOverdueRemindersPerTask: 3
    });
    expect(
      readProjectReminderConfig({
        notificationDefaults: {
          dueSoonWindowDays: 99,
          overdueReminderFrequencyDays: 0,
          maxOverdueRemindersPerTask: -1
        }
      })
    ).toEqual({
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5
    });

    const asOf = new Date("2026-06-30T02:00:00.000Z");
    expect(
      projectTaskDeadlineReminderKind({
        dueDate: new Date("2026-07-02T00:00:00.000Z"),
        status: "IN_PROGRESS",
        asOf,
        dueSoonWindowDays: 2
      })
    ).toBe("DUE_SOON");
    expect(
      projectTaskDeadlineReminderKind({
        dueDate: new Date("2026-06-28T00:00:00.000Z"),
        status: "BLOCKED",
        asOf,
        dueSoonWindowDays: 2
      })
    ).toBe("OVERDUE");
    expect(
      projectTaskDeadlineReminderKind({
        dueDate: new Date("2026-06-28T00:00:00.000Z"),
        status: "COMPLETED",
        asOf,
        dueSoonWindowDays: 2
      })
    ).toBeNull();
    expect(
      projectTaskDeadlineReminderKind({
        dueDate: null,
        status: "IN_PROGRESS",
        asOf,
        dueSoonWindowDays: 2
      })
    ).toBeNull();
  });

  test("notifications page is a real scoped inbox instead of a module preview", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/notifications/page.tsx"),
      "utf8"
    );

    expect(page).toContain("listNotifications(session");
    expect(page).toContain("runApprovalReminderScan");
    expect(page).toContain("markNotificationRead");
    expect(page).toContain("archiveNotification");
    expect(page).toContain("runProjectTaskDeadlineReminderScan");
    expect(page).toContain("scanApprovalRemindersAction");
    expect(page).toContain("scanDeadlineRemindersAction");
    expect(page).toContain("Scan Approvals");
    expect(page).toContain("permissions.projectManage");
    expect(page).toContain("permissions.purchaseRequestApprove");
    expect(page).toContain("Scan Reminders");
    expect(page).toContain("approvalScanned");
    expect(page).toContain("approvalReminders");
    expect(page).toContain("scannedTaskCount");
    expect(page).toContain("reminderCount");
    expect(page).toContain("tasks scanned /");
    expect(page).toContain("approvals scanned /");
    expect(page).not.toContain("renderModulePreview");
  });

  test("approval reminder scan is manual, scoped, idempotent, and non-mutating", () => {
    const approvals = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const scanSource = approvals.slice(
      approvals.indexOf("export async function runApprovalReminderScan"),
      approvals.indexOf("export async function getApprovalDetail")
    );

    expect(approvals).toContain("runApprovalReminderScan");
    expect(scanSource).toContain("canUseApprovals(session.permissionCodes)");
    expect(scanSource).toContain("throw new Error(\"PERMISSION_DENIED\")");
    expect(scanSource).toContain("listPendingApprovals(session)");
    expect(scanSource).toContain("recordWorkflowNotifications(tx");
    expect(scanSource).toContain("recipientUserIds: [session.user.id]");
    expect(scanSource).toContain("APPROVAL_DUE_SOON");
    expect(scanSource).toContain("APPROVAL_OVERDUE");
    expect(scanSource).toContain("CURRENT_APPROVER_MANUAL_SCAN");
    expect(scanSource).toContain("approval-reminder:");
    expect(scanSource).toContain("countExistingApprovalOverdueReminderBuckets");
    expect(scanSource).toContain("maxOverdueRemindersPerApproval");
    expect(scanSource).toContain("notification.approval_reminder_scan");
    expect(scanSource).toContain("scannedApprovalCount");
    expect(scanSource).toContain("reminderCount");
    expect(scanSource).not.toContain("status: \"APPROVED\"");
    expect(scanSource).not.toContain("actedAt: new Date()");
  });

  test("approval reminder date classification uses date-only aging", () => {
    const asOf = new Date("2026-07-01T02:00:00.000Z");

    expect(
      approvalReminderKind({
        requiredDate: "2026-07-02",
        asOf,
        dueSoonWindowDays: 1
      })
    ).toBe("DUE_SOON");
    expect(
      approvalReminderKind({
        requiredDate: "2026-06-30",
        asOf,
        dueSoonWindowDays: 1
      })
    ).toBe("OVERDUE");
    expect(
      approvalReminderKind({
        requiredDate: "2026-07-05",
        asOf,
        dueSoonWindowDays: 1
      })
    ).toBeNull();
  });
});
