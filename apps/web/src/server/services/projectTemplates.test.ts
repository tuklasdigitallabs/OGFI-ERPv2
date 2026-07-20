import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertProjectTemplateCanPublish,
  parseProjectTemplateConfig,
} from "./projectTemplates";

describe("project template controls", () => {
  test("publish validation requires active, completed, and cancelled outcomes", () => {
    expect(() =>
      assertProjectTemplateCanPublish({
        statusSet: ["PLANNED", "COMPLETED", "CANCELLED"],
        tasks: [
          { templateTaskCode: "T-001", title: "Kickoff", status: "PLANNED" },
        ],
        milestones: [{ code: "MS-001", title: "Launch readiness" }],
      }),
    ).toThrow("PROJECT_TEMPLATE_STATUS_SET_INCOMPLETE");

    expect(() =>
      assertProjectTemplateCanPublish({
        statusSet: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
        tasks: [
          {
            templateTaskCode: "T-001",
            title: "Kickoff",
            status: "IN_PROGRESS",
          },
        ],
        milestones: [{ code: "MS-001", title: "Launch readiness" }],
      }),
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
          checklistItems: [{ title: "Confirm scope", required: true }],
        },
      ],
      milestones: [{ code: "MS-001", title: "Readiness", targetOffsetDays: 5 }],
    });

    expect(config.tasks[0]?.templateTaskCode).toBe("T-001");
    expect(config.tasks[0]?.owner.value).toBe("PROJECT_MANAGER");
    expect(config.milestones[0]?.owner.value).toBe("PROJECT_MANAGER");
    expect(config.evidenceDefaults).toEqual([]);
    expect(config.signoffDefaults).toEqual([]);
    expect(config.notificationDefaults).toEqual({
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5,
    });
    expect(() =>
      parseProjectTemplateConfig({
        schemaVersion: 1,
        statusSet: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
        tasks: [
          { templateTaskCode: "T-001", title: "One" },
          { templateTaskCode: "T-001", title: "Two" },
        ],
      }),
    ).toThrow("PROJECT_TEMPLATE_TASK_CODE_DUPLICATE");
    expect(() =>
      parseProjectTemplateConfig({
        schemaVersion: 1,
        statusSet: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
        tasks: [
          {
            templateTaskCode: "T-002",
            title: "Blocked task",
            status: "BLOCKED",
          },
        ],
      }),
    ).toThrow("PROJECT_TEMPLATE_TASK_STATUS_DISABLED");
    expect(() =>
      parseProjectTemplateConfig({
        schemaVersion: 1,
        statusSet: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
        notificationDefaults: {
          dueSoonWindowDays: 60,
          overdueReminderFrequencyDays: 0,
          maxOverdueRemindersPerTask: 0,
        },
      }),
    ).toThrow();
    expect(() =>
      parseProjectTemplateConfig({
        schemaVersion: 1,
        statusSet: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
        tasks: [{ templateTaskCode: "T-001", title: "Kickoff" }],
        evidenceDefaults: [
          { code: "EV-001", label: "One", taskCode: "T-001" },
          { code: "ev-001", label: "Two", taskCode: "T-001" },
        ],
      }),
    ).toThrow("PROJECT_TEMPLATE_EVIDENCE_CODE_DUPLICATE");
    expect(() =>
      parseProjectTemplateConfig({
        schemaVersion: 1,
        statusSet: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
        tasks: [{ templateTaskCode: "T-001", title: "Kickoff" }],
        evidenceDefaults: [
          { code: "EV-002", label: "Missing task", taskCode: "T-999" },
        ],
      }),
    ).toThrow("PROJECT_TEMPLATE_EVIDENCE_TASK_NOT_FOUND");
    expect(() =>
      parseProjectTemplateConfig({
        schemaVersion: 1,
        statusSet: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
        tasks: [{ templateTaskCode: "T-001", title: "Kickoff" }],
        signoffDefaults: [
          { code: "SO-001", label: "One" },
          { code: "so-001", label: "Two" },
        ],
      }),
    ).toThrow("PROJECT_TEMPLATE_SIGNOFF_CODE_DUPLICATE");
  });

  test("template service is configuration-only and navigation-backed", () => {
    const source = readFileSync(
      path.resolve(__dirname, "projectTemplates.ts"),
      "utf8",
    );
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/project-templates/page.tsx"),
      "utf8",
    );
    const playbookPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/playbooks/page.tsx"),
      "utf8",
    );
    const playbookDetailPage = readFileSync(
      path.resolve(
        __dirname,
        "../../app/(app)/expansion/playbooks/[id]/page.tsx",
      ),
      "utf8",
    );
    const nav = readFileSync(
      path.resolve(__dirname, "../../components/ShellNavigation.tsx"),
      "utf8",
    );
    const appShell = readFileSync(
      path.resolve(__dirname, "../../components/AppShell.tsx"),
      "utf8",
    );

    expect(source).toContain("permissions.projectTemplateConfigure");
    expect(source).toContain("PROJECT_TEMPLATE_CODE_DUPLICATE");
    expect(source).toContain("const code = values.code.toUpperCase();");
    expect(source).toContain("listPublishedProjectTemplatesForProjectCreate");
    expect(source).toContain("listExpansionOpeningPlaybooks");
    expect(source).toContain("createExpansionOpeningPlaybook");
    expect(source).toContain("getExpansionOpeningPlaybook");
    expect(source).toContain("updateExpansionOpeningPlaybookOverview");
    expect(source).toContain("upsertExpansionOpeningPlaybookTask");
    expect(source).toContain("removeExpansionOpeningPlaybookTask");
    expect(source).toContain("upsertExpansionOpeningPlaybookMilestone");
    expect(source).toContain("removeExpansionOpeningPlaybookMilestone");
    expect(source).toContain("upsertExpansionOpeningPlaybookChecklistItem");
    expect(source).toContain("removeExpansionOpeningPlaybookChecklistItem");
    expect(source).toContain("upsertExpansionOpeningPlaybookEvidenceDefault");
    expect(source).toContain("removeExpansionOpeningPlaybookEvidenceDefault");
    expect(source).toContain("upsertExpansionOpeningPlaybookSignoffDefault");
    expect(source).toContain("removeExpansionOpeningPlaybookSignoffDefault");
    expect(source).toContain("updateExpansionOpeningPlaybookReminders");
    expect(source).toContain("duplicateExpansionOpeningPlaybookRevision");
    expect(source).toContain("PROJECT_TEMPLATE_STALE_VERSION");
    expect(source).toContain("expansion.opening_playbook.published");
    expect(source).toContain("expansion.opening_playbook.archived");
    expect(source).toContain("PROJECT_TEMPLATE_EVIDENCE_TASK_NOT_FOUND");
    expect(source).toContain("openingPlaybookConfig");
    expect(source).toContain('source: "expansion-opening-playbook"');
    expect(source).toContain("Confirm site handover package");
    expect(source).toContain("Prepare opening go/no-go review");
    expect(source).toContain("EV-SITE-HANDOVER");
    expect(source).toContain("SO-GO-NOGO");
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
    expect(page).not.toContain(
      "templates.some((template) => template.canConfigure)",
    );
    expect(page).toContain(
      "Published template changes affect future projects only",
    );
    expect(playbookPage).toContain(
      "href={`/expansion/playbooks/${playbook.id}`}",
    );
    expect(playbookDetailPage).toContain("Playbook Builder");
    expect(playbookDetailPage).toContain("Edit Playbook Overview");
    expect(playbookDetailPage).toContain("TaskForm");
    expect(playbookDetailPage).toContain("MilestoneForm");
    expect(playbookDetailPage).toContain("ChecklistItemForm");
    expect(playbookDetailPage).toContain("EvidenceDefaultForm");
    expect(playbookDetailPage).toContain("SignoffDefaultForm");
    expect(playbookDetailPage).toContain("Add Checklist Line");
    expect(playbookDetailPage).toContain("Add Evidence");
    expect(playbookDetailPage).toContain("Add Signoff");
    expect(playbookDetailPage).toContain("Save Evidence Requirement");
    expect(playbookDetailPage).toContain("Save Signoff Requirement");
    expect(playbookDetailPage).toContain("Publish Playbook");
    expect(playbookDetailPage).toContain("Create Draft Revision");
    expect(playbookDetailPage).toContain("Archive Playbook");
    expect(playbookDetailPage).toContain("expectedVersion");
    expect(playbookDetailPage).toContain(
      "updateExpansionOpeningPlaybookReminders",
    );
    expect(playbookDetailPage).toContain("does not mutate active projects");
    expect(playbookDetailPage).not.toContain("renderModulePreview");
    expect(appShell).toContain("canConfigureProjectTemplates");
    expect(appShell).toContain(
      "canUseProjectTemplates={canAccessProjectTemplates}",
    );
    expect(nav).toContain("canUseProjectTemplates");
    expect(nav).toContain(
      "canAdminister || canUseProjects || canUseProjectTemplates",
    );
    expect(nav).toContain("Project Templates");
    expect(nav).toContain("Opening Playbooks");
    expect(nav).toContain('label: "Work Calendar"');
    expect(nav).toContain('badge: "Live"');
  });

  test("opening playbook revisions preserve source records and audit guarded writes", () => {
    const source = readFileSync(
      path.resolve(__dirname, "projectTemplates.ts"),
      "utf8",
    );
    const schema = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/schema.prisma",
      ),
      "utf8",
    );
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260711100000_expansion_playbook_revision_lifecycle/migration.sql",
      ),
      "utf8",
    );

    expect(source).toContain("duplicateExpansionOpeningPlaybookRevision");
    expect(source).toContain('status: { in: ["PUBLISHED", "ARCHIVED"] }');
    expect(source).toContain("sourceTemplateId: source.id");
    expect(source).toContain("lineageRootTemplateId");
    expect(source).toContain("revisionNumber");
    expect(source).toContain("PROJECT_TEMPLATE_STALE_VERSION");
    expect(source).toContain("version: values.expectedVersion");
    expect(source).toContain("version: { increment: 1 }");
    expect(source).toContain("expansion.opening_playbook.draft_updated");
    expect(source).toContain("expansion.opening_playbook.revision_created");
    expect(source).toContain("expansion.opening_playbook.published");
    expect(source).toContain("expansion.opening_playbook.archived");
    expect(source).toContain("reason: z.string().trim().min(5).max(1000)");
    expect(source).toContain("tx.auditEvent.create");
    expect(source).not.toContain("tx.project.update");
    expect(source).not.toContain("tx.projectTask.update");

    expect(schema).toContain("sourceTemplateId");
    expect(schema).toContain("lineageRootTemplateId");
    expect(schema).toContain("revisionNumber");
    expect(schema).toContain("version               Int");
    expect(migration).toContain('ALTER TABLE "ProjectTemplate"');
    expect(migration).toContain('ADD COLUMN "version"');
    expect(migration).not.toContain('ALTER TABLE "Project"');
    expect(migration).not.toContain("DROP COLUMN");
    expect(migration).not.toContain("DELETE FROM");
  });
});
