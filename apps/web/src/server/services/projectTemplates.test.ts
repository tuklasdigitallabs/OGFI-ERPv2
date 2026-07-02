import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertProjectTemplateCanPublish,
  parseProjectTemplateConfig
} from "./projectTemplates";

describe("project template controls", () => {
  test("publish validation requires active, completed, and cancelled outcomes", () => {
    expect(() =>
      assertProjectTemplateCanPublish({
        statusSet: ["PLANNED", "COMPLETED", "CANCELLED"]
      })
    ).toThrow("PROJECT_TEMPLATE_STATUS_SET_INCOMPLETE");

    expect(() =>
      assertProjectTemplateCanPublish({
        statusSet: ["IN_PROGRESS", "COMPLETED", "CANCELLED"]
      })
    ).not.toThrow();
  });

  test("template config validation supports default tasks and milestones", () => {
    const config = parseProjectTemplateConfig({
      schemaVersion: 1,
      statusSet: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      tasks: [
        {
          templateTaskCode: "T-001",
          title: "Kickoff",
          status: "PLANNED",
          priority: "NORMAL",
          checklistItems: [{ title: "Confirm scope", required: true }]
        }
      ],
      milestones: [{ code: "MS-001", title: "Readiness", targetOffsetDays: 5 }]
    });

    expect(config.tasks[0]?.templateTaskCode).toBe("T-001");
    expect(config.tasks[0]?.owner.value).toBe("PROJECT_MANAGER");
    expect(config.milestones[0]?.owner.value).toBe("PROJECT_MANAGER");
    expect(config.notificationDefaults).toEqual({
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5
    });
    expect(() =>
      parseProjectTemplateConfig({
        schemaVersion: 1,
        statusSet: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
        tasks: [
          { templateTaskCode: "T-001", title: "One" },
          { templateTaskCode: "T-001", title: "Two" }
        ]
      })
    ).toThrow("PROJECT_TEMPLATE_TASK_CODE_DUPLICATE");
    expect(() =>
      parseProjectTemplateConfig({
        schemaVersion: 1,
        statusSet: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
        tasks: [{ templateTaskCode: "T-002", title: "Blocked task", status: "BLOCKED" }]
      })
    ).toThrow("PROJECT_TEMPLATE_TASK_STATUS_DISABLED");
    expect(() =>
      parseProjectTemplateConfig({
        schemaVersion: 1,
        statusSet: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
        notificationDefaults: {
          dueSoonWindowDays: 60,
          overdueReminderFrequencyDays: 0,
          maxOverdueRemindersPerTask: 0
        }
      })
    ).toThrow();
  });

  test("template service is configuration-only and navigation-backed", () => {
    const source = readFileSync(path.resolve(__dirname, "projectTemplates.ts"), "utf8");
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/project-templates/page.tsx"),
      "utf8"
    );
    const nav = readFileSync(
      path.resolve(__dirname, "../../components/ShellNavigation.tsx"),
      "utf8"
    );
    const appShell = readFileSync(
      path.resolve(__dirname, "../../components/AppShell.tsx"),
      "utf8"
    );

    expect(source).toContain("permissions.projectTemplateConfigure");
    expect(source).toContain("PROJECT_TEMPLATE_CODE_DUPLICATE");
    expect(source).toContain("const code = values.code.toUpperCase();");
    expect(source).toContain("listPublishedProjectTemplatesForProjectCreate");
    expect(source).toContain("permissions.projectCreate");
    expect(source).toContain("PUBLISHED");
    expect(source).toContain("ARCHIVED");
    expect(source).not.toContain("projectTask.create");
    expect(source).not.toContain("./purchaseOrders");
    expect(source).not.toContain("./inventory");
    expect(page).toContain("ActionFeedbackBanner");
    expect(page).toContain("getActionFeedback");
    expect(page).toContain("actionErrorRedirectPath");
    expect(page).toContain("permissions.projectTemplateConfigure");
    expect(page).not.toContain("templates.some((template) => template.canConfigure)");
    expect(page).toContain("Published template changes affect future projects only");
    expect(appShell).toContain("canConfigureProjectTemplates");
    expect(appShell).toContain("canUseProjectTemplates={canAccessProjectTemplates}");
    expect(nav).toContain("canUseProjectTemplates");
    expect(nav).toContain("canAdminister || canUseProjects || canUseProjectTemplates");
    expect(nav).toContain("Project Templates");
    expect(nav).toContain('label: "Work Calendar"');
    expect(nav).toContain('badge: "Live"');
  });
});
