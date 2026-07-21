import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260721200000_project_requirement_attachment_context/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("project requirement attachment context migration", () => {
  it("permits task, comment, and requirement contexts without allowing an orphan", () => {
    expect(migrationSource).toContain(
      '"commentId" IS NOT NULL\n      AND "taskId" IS NULL\n      AND "requirementId" IS NULL',
    );
    expect(migrationSource).toContain(
      '"commentId" IS NULL\n      AND ("taskId" IS NOT NULL OR "requirementId" IS NOT NULL)',
    );
    expect(migrationSource).toContain(
      'DROP CONSTRAINT "ProjectAttachment_exactly_one_parent_chk"',
    );
    expect(migrationSource).toContain(
      'TO "ProjectAttachment_valid_context_chk"',
    );
  });

  it("fails closed when a requirement and attachment disagree on task context", () => {
    expect(migrationSource).toContain(
      'attachment."taskId" IS DISTINCT FROM requirement."taskId"',
    );
    expect(migrationSource).toContain(
      'NEW."taskId" IS DISTINCT FROM requirement_task_id',
    );
    expect(migrationSource).toContain(
      'ProjectRequirement_attachment_task_context_trg',
    );
  });

  it("prevents duplicate active requirement evidence links", () => {
    expect(migrationSource).toContain(
      'ProjectAttachment_active_requirement_attachment_unique_idx',
    );
    expect(migrationSource).toContain(
      'ON "ProjectAttachment"("requirementId", "attachmentId")',
    );
    expect(migrationSource).toContain('"status" = \'ACTIVE\'');
    expect(migrationSource).toContain('"archivedAt" IS NULL');
  });
});
