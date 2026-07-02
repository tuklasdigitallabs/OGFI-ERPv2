import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  projectTaskDeadlineReminderKind,
  readProjectReminderConfig
} from "./projectNotifications";

describe("project notification deadline controls", () => {
  test("reminder config accepts bounded integer values only", () => {
    expect(readProjectReminderConfig(null)).toEqual({
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5
    });
    expect(
      readProjectReminderConfig({
        notificationDefaults: {
          dueSoonWindowDays: 0,
          overdueReminderFrequencyDays: 30,
          maxOverdueRemindersPerTask: 30
        }
      })
    ).toEqual({
      dueSoonWindowDays: 0,
      overdueReminderFrequencyDays: 30,
      maxOverdueRemindersPerTask: 30
    });
    expect(
      readProjectReminderConfig({
        notificationDefaults: {
          dueSoonWindowDays: 31,
          overdueReminderFrequencyDays: 0,
          maxOverdueRemindersPerTask: 31
        }
      })
    ).toEqual({
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5
    });
  });

  test("deadline reminder kind classifies due soon and overdue tasks", () => {
    const asOf = new Date("2026-06-30T02:00:00.000Z");

    expect(
      projectTaskDeadlineReminderKind({
        dueDate: "2026-07-02",
        status: "IN_PROGRESS",
        asOf,
        dueSoonWindowDays: 2
      })
    ).toBe("DUE_SOON");
    expect(
      projectTaskDeadlineReminderKind({
        dueDate: "2026-06-29",
        status: "BLOCKED",
        asOf,
        dueSoonWindowDays: 2
      })
    ).toBe("OVERDUE");
    expect(
      projectTaskDeadlineReminderKind({
        dueDate: "2026-07-03",
        status: "PLANNED",
        asOf,
        dueSoonWindowDays: 2
      })
    ).toBeNull();
  });

  test("deadline reminders skip terminal and unscheduled tasks", () => {
    const asOf = new Date("2026-06-30T02:00:00.000Z");

    for (const status of ["COMPLETED", "CANCELLED"]) {
      expect(
        projectTaskDeadlineReminderKind({
          dueDate: "2026-06-29",
          status,
          asOf,
          dueSoonWindowDays: 2
        })
      ).toBeNull();
    }
    expect(
      projectTaskDeadlineReminderKind({
        dueDate: null,
        dueAt: null,
        status: "IN_PROGRESS",
        asOf,
        dueSoonWindowDays: 2
      })
    ).toBeNull();
  });

  test("manual deadline scan is scoped, permissioned, and excludes terminal records", () => {
    const source = readFileSync(
      path.resolve(__dirname, "projectNotifications.ts"),
      "utf8"
    );

    expect(source).toContain("runProjectTaskDeadlineReminderScan");
    expect(source).toContain("permissions.projectManage");
    expect(source).toContain("hasCompanyManageScope(scopes, session.context.companyId)");
    expect(source).toContain("throw new Error(\"PERMISSION_DENIED\")");
    expect(source).toContain("tenantId: session.context.tenantId");
    expect(source).toContain("companyId: session.context.companyId");
    expect(source).toContain("status: { notIn: [\"COMPLETED\", \"CANCELLED\"] }");
    expect(source).toContain(
      "project: { archivedAt: null, status: { notIn: [\"CANCELLED\", \"ARCHIVED\"] } }"
    );
  });

  test("overdue reminders are frequency-limited and bucketed idempotently", () => {
    const source = readFileSync(
      path.resolve(__dirname, "projectNotifications.ts"),
      "utf8"
    );

    expect(source).toContain("countExistingOverdueReminderBuckets");
    expect(source).toContain(
      "recipient.existingCount < input.maxOverdueRemindersPerTask"
    );
    expect(source).toContain("overdueDays % reminderConfig.overdueReminderFrequencyDays");
    expect(source).toContain(
      "sourceEventKey: `project-task-deadline:${input.project.tenantId}:${input.task.id}:${input.task.reminderKind}:${input.task.dueDateString}:${input.task.reminderBucket}`"
    );
    expect(source).toContain("reminderKind === \"OVERDUE\" ? asOfDate : dueDateString");
  });
});
