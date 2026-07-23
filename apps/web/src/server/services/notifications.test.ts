import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { approvalReminderKind } from "./approvals";
import { permissions } from "./authorization";
import {
  projectTaskDeadlineReminderKind,
  readProjectReminderConfig
} from "./projectNotifications";
import {
  buildRestaurantOpsReminderInputs,
  canRunRestaurantOpsExceptionReminderScan
} from "./restaurantOpsNotifications";

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

  test("notification inbox operations share a live selected-context boundary", () => {
    const source = readFileSync(path.resolve(__dirname, "notifications.ts"), "utf8");
    const visibilitySource = source.slice(
      source.indexOf("function notificationVisibilityWhere"),
      source.indexOf("export async function listNotifications")
    );
    const inboxSource = source.slice(
      source.indexOf("export async function listNotifications")
    );

    expect(visibilitySource).toContain("companyId: session.context.companyId");
    expect(visibilitySource).toContain("{ locationId: null }");
    expect(visibilitySource).toContain(
      "{ locationId: session.context.locationId }"
    );
    expect(visibilitySource).toContain('scopeType: "COMPANY"');
    expect(visibilitySource).toContain('scopeType: "LOCATION"');
    expect(visibilitySource).toContain("startsAt: { lte: now }");
    expect(visibilitySource).toContain("{ endsAt: { gt: now } }");
    expect(visibilitySource).toContain('status: "ACTIVE"');
    expect(visibilitySource).toContain("currentNotificationVisibilityWhere");
    expect(visibilitySource).toContain("prisma.location.findFirst");
    expect(inboxSource.match(/currentNotificationVisibilityWhere\(/g)).toHaveLength(
      4
    );
  });

  test("initial procurement approval work uses direct-user step readiness and zero role fanout", () => {
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
      expect(source).toContain("assertAnyEligibleApprovalActorForStep");
      expect(source).toContain("recordApprovalStepReadyNotification");
      expect(source).toContain("actorUserId: firstRoutedStep.userId");
      expect(source).toContain("if (firstRoutedStep.userId)");
      expect(source).toContain("recipientUserId: firstRoutedStep.userId");
      expect(source).toContain('scopeType: "LOCATION_CONTEXT"');
      expect(source).not.toContain("recipientUserIds: [firstEligibleActor.userId]");
      expect(source).not.toContain('recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role"');
    }
    expect(purchaseRequests.match(/await recordApprovalStepReadyNotification\(tx/g)).toHaveLength(1);
    expect(quotes.match(/await recordApprovalStepReadyNotification\(tx/g)).toHaveLength(1);
    expect(purchaseOrders.match(/await recordApprovalStepReadyNotification\(tx/g)).toHaveLength(3);
    expect(purchaseRequests).not.toContain("APPROVE_PURCHASE_REQUEST");
    expect(purchaseOrders).not.toContain("APPROVE_PURCHASE_ORDER");
    expect(purchaseOrders).not.toContain("APPROVE_PO_BALANCE_CLOSURE");
    expect(purchaseOrders).not.toContain("APPROVE_PO_AMENDMENT");
    expect(quotes).not.toContain("APPROVE_QUOTATION_RECOMMENDATION");
    expect(quotes).toContain('entityType: "PurchaseRequest"');
    expect(quotes).toContain("entityId: purchaseRequest.id");
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
    expect(page).toContain("runRestaurantOpsExceptionReminderScan");
    expect(page).toContain("scanApprovalRemindersAction");
    expect(page).toContain("scanDeadlineRemindersAction");
    expect(page).toContain("scanRestaurantOpsRemindersAction");
    expect(page).toContain("Scan Approvals");
    expect(page).toContain("Scan Restaurant Ops");
    expect(page).toContain("appendInboxFilterParams(params, formData)");
    expect(page).toContain("formData.get(\"status\")");
    expect(page).toContain("formData.get(\"group\")");
    expect(page).toContain("<input name=\"status\" type=\"hidden\" value={status} />");
    expect(page).toContain("<input name=\"group\" type=\"hidden\" value={group} />");
    expect(page).toContain("notificationGroups");
    expect(page).toContain("notificationGroupForType");
    expect(page).toContain("visibleNotifications");
    expect(page).toContain("buildQueryHref(\"/notifications\"");
    expect(page).toContain("permissions.projectManage");
    expect(page).toContain("permissions.purchaseRequestApprove");
    expect(page).toContain("Scan Reminders");
    expect(page).toContain("approvalScanned");
    expect(page).toContain("approvalReminders");
    expect(page).toContain("scannedTaskCount");
    expect(page).toContain("reminderCount");
    expect(page).toContain("tasks scanned /");
    expect(page).toContain("approvals scanned /");
    expect(page).toContain("restaurant exceptions scanned /");
    expect(page).toContain("BRANCH_CHECKLIST_REVIEW_READY");
    expect(page).toContain("FOOD_SAFETY_REVIEW_READY");
    expect(page).not.toContain("renderModulePreview");
  });

  test("restaurant ops exception scan is scoped, idempotent, audited, and non-mutating", () => {
    const scanSource = readFileSync(
      path.resolve(__dirname, "restaurantOpsNotifications.ts"),
      "utf8"
    );

    expect(scanSource).toContain("runRestaurantOpsExceptionReminderScan");
    expect(scanSource).toContain("buildRestaurantOpsReminderInputs");
    expect(scanSource).toContain("getGrantedPermissionCodes(session)");
    expect(scanSource).toContain(
      "canRunRestaurantOpsExceptionReminderScan(permissionCodes)"
    );
    expect(scanSource).toContain("throw new Error(\"PERMISSION_DENIED\")");
    expect(scanSource).not.toContain("getFoodCostAnalysisDashboard");
    expect(scanSource).not.toContain("canUseRecipesAndCosting");
    expect(scanSource).not.toContain("source.foodCost");
    expect(scanSource).not.toContain("food-cost:");
    expect(scanSource).toContain("getBranchOperationsDashboard(session)");
    expect(scanSource).toContain("getFoodSafetyDashboard(session)");
    expect(scanSource).toContain("getIncidentDashboard(session)");
    expect(scanSource).toContain("getMaintenanceDashboard(session)");
    expect(scanSource).toContain("recordWorkflowNotifications(tx");
    expect(scanSource).toContain("recipientUserIds: [session.user.id]");
    expect(scanSource).toContain("CURRENT_USER_AUTHORIZED_PHASE2_SCOPE");
    expect(scanSource).toContain("restaurant-ops-exception:");
    expect(scanSource).toContain("notification.restaurant_ops_exception_scan");
    expect(scanSource).toContain("scannedExceptionCount");
    expect(scanSource).toContain("reminderCount");
    expect(scanSource.match(/FOOD_COST_EXCEPTION/g)).toHaveLength(1);
    expect(scanSource).toContain("BRANCH_CHECKLIST_REVIEW_READY");
    expect(scanSource).toContain("BRANCH_CHECKLIST_EXCEPTION");
    expect(scanSource).toContain("FOOD_SAFETY_REVIEW_READY");
    expect(scanSource).toContain("FOOD_SAFETY_EXCEPTION");
    expect(scanSource).toContain("OPERATIONAL_INCIDENT_OPEN");
    expect(scanSource).toContain("MAINTENANCE_FOLLOW_UP");
    expect(scanSource).toContain("branchChecklistReviewStatuses");
    expect(scanSource).toContain("foodSafetyReviewStatuses");
    expect(scanSource).toContain("branch-checklist-review:");
    expect(scanSource).toContain("food-safety-review:");
    expect(scanSource).toContain("Checklist ready for review");
    expect(scanSource).toContain("Food-safety log ready for review");
    expect(scanSource).not.toContain("prisma.recipe.update");
    expect(scanSource).not.toContain("prisma.foodSafetyLog.update");
    expect(scanSource).not.toContain("prisma.branchOperationalChecklist.update");
    expect(scanSource).not.toContain("prisma.operationalIncident.update");
    expect(scanSource).not.toContain("prisma.maintenanceTicket.update");
    expect(scanSource).not.toContain("inventoryMovement.create");
  });

  test("recipe-only access cannot authorize an empty Restaurant Ops scan", () => {
    expect(
      canRunRestaurantOpsExceptionReminderScan([
        permissions.recipeView,
        permissions.recipeManage,
        permissions.menuCostView
      ])
    ).toBe(false);
    expect(
      canRunRestaurantOpsExceptionReminderScan([
        permissions.branchOperationsView
      ])
    ).toBe(true);
    expect(
      canRunRestaurantOpsExceptionReminderScan([permissions.foodSafetyView])
    ).toBe(true);
    expect(
      canRunRestaurantOpsExceptionReminderScan([permissions.incidentView])
    ).toBe(true);
    expect(
      canRunRestaurantOpsExceptionReminderScan([permissions.maintenanceView])
    ).toBe(true);
  });

  test("restaurant ops reminder building ignores retired Food Cost source data", () => {
    const reminders = buildRestaurantOpsReminderInputs({
      foodCost: {
        locationName: "SM North Edsa",
        rows: [
          {
            menuItemId: "menu-1",
            menuItemName: "Karubi Set",
            status: "ABOVE_TARGET"
          }
        ]
      }
    } as never);

    expect(reminders).toEqual([]);
  });

  test("restaurant ops reminders are built from source records without terminal follow-ups", () => {
    const reminders = buildRestaurantOpsReminderInputs({
      branchOps: {
        checklists: [
          {
            id: "checklist-1",
            checklistName: "Opening Checklist",
            locationName: "SM North Edsa",
            businessDate: "2026-07-03",
            status: "SUBMITTED",
            exceptionCount: 1,
            lines: [
              {
                result: "EXCEPTION",
                severity: "CRITICAL"
              }
            ]
          }
        ]
      } as never,
      foodSafety: {
        logs: [
          {
            id: "safety-1",
            title: "Opening Temperature Log",
            locationName: "SM North Edsa",
            businessDate: "2026-07-03",
            status: "EXCEPTION_REVIEW",
            exceptionCount: 1,
            readings: [
              {
                result: "EXCEPTION",
                severity: "CRITICAL"
              }
            ]
          }
        ]
      } as never,
      incidents: {
        incidents: [
          {
            id: "incident-1",
            incidentNumber: "INC-001",
            title: "Guest complaint escalation",
            locationName: "SM North Edsa",
            severity: "CRITICAL",
            status: "OPEN"
          },
          {
            id: "incident-2",
            incidentNumber: "INC-002",
            title: "Resolved equipment issue",
            locationName: "SM North Edsa",
            severity: "HIGH",
            status: "RESOLVED"
          }
        ]
      } as never,
      maintenance: {
        tickets: [
          {
            id: "ticket-1",
            ticketNumber: "MT-001",
            assetName: "Grill table 4",
            locationName: "SM North Edsa",
            priority: "CRITICAL",
            status: "PENDING_VENDOR"
          },
          {
            id: "ticket-2",
            ticketNumber: "MT-002",
            assetName: "Exhaust fan",
            locationName: "SM North Edsa",
            priority: "HIGH",
            status: "COMPLETED"
          }
        ]
      } as never
    });

    expect(
      reminders.map((reminder) => [
        reminder.reminderKind,
        reminder.sourceKey,
        reminder.priority
      ])
    ).toEqual([
      [
        "BRANCH_CHECKLIST_REVIEW_READY",
        "branch-checklist-review:checklist-1:SUBMITTED",
        "HIGH"
      ],
      ["BRANCH_CHECKLIST_EXCEPTION", "branch-checklist:checklist-1:1", "HIGH"],
      [
        "FOOD_SAFETY_REVIEW_READY",
        "food-safety-review:safety-1:EXCEPTION_REVIEW",
        "HIGH"
      ],
      ["FOOD_SAFETY_EXCEPTION", "food-safety:safety-1:1", "CRITICAL"],
      ["OPERATIONAL_INCIDENT_OPEN", "incident:incident-1:OPEN", "HIGH"],
      ["MAINTENANCE_FOLLOW_UP", "maintenance:ticket-1:PENDING_VENDOR", "HIGH"]
    ]);
    expect(
      reminders.find(
        (reminder) => reminder.reminderKind === "FOOD_SAFETY_EXCEPTION"
      )?.metadata
    ).toMatchObject({
      critical: true,
      source: "restaurant-ops-notification-scan"
    });
    expect(reminders.map((reminder) => reminder.deepLink)).toEqual([
      "/branch-operations/checklist-1",
      "/branch-operations/checklist-1",
      "/food-safety/safety-1",
      "/food-safety/safety-1",
      "/incidents/incident-1",
      "/maintenance/ticket-1"
    ]);
  });

  test("approval reminder scan is manual, scoped, idempotent, and non-mutating", () => {
    const approvals = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const scanSource = approvals.slice(
      approvals.indexOf("export async function runApprovalReminderScan"),
      approvals.indexOf("export async function getApprovalDetail")
    );

    expect(approvals).toContain("runApprovalReminderScan");
    expect(scanSource).toContain("getGrantedPermissionCodes(session)");
    expect(scanSource).toContain("canUseApprovals(permissionCodes)");
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
