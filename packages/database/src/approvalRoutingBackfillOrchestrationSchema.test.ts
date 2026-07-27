import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const schemaSource = read("../prisma/schema.prisma");
const migrationSource = read(
  "../prisma/migrations/20260727140000_approval_routing_backfill_orchestration/migration.sql",
);

describe("DEC-0245 durable approval-routing backfill orchestration schema", () => {
  test("is additive and creates no populated orchestration or routing data", () => {
    for (const model of [
      "ApprovalRoutingBackfillRun",
      "ApprovalRoutingBackfillBatch",
      "ApprovalRoutingBackfillBlockerObservation",
    ]) {
      expect(schemaSource).toContain(`model ${model} {`);
      expect(migrationSource).toContain(`CREATE TABLE \"${model}\"`);
      expect(migrationSource).not.toMatch(
        new RegExp(`INSERT INTO\\s+\"${model}\"`, "i"),
      );
    }
    expect(migrationSource).not.toMatch(
      /UPDATE\s+"(?:ApprovalInstance|ApprovalInstanceStep|AuditEvent)"/i,
    );
    expect(migrationSource).not.toMatch(
      /INSERT INTO\s+"(?:ApprovalInstance|ApprovalInstanceStep|AuditEvent)"/i,
    );
  });

  test("binds every orchestration fact to exact tenant and company scope", () => {
    for (const constraint of [
      "ApprovalRoutingBackfillRun_company_scope_fkey",
      "ApprovalRoutingBackfillBatch_company_scope_fkey",
      "ApprovalRoutingBackfillBatch_run_scope_fkey",
      "ApprovalRoutingBackfillBlocker_company_scope_fkey",
      "ApprovalRoutingBackfillBlocker_run_scope_fkey",
      "ApprovalRoutingBackfillBlocker_batch_scope_fkey",
      "ApprovalRoutingBackfillBlocker_instance_scope_fkey",
    ]) {
      expect(migrationSource).toContain(constraint);
    }
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "ApprovalRoutingBackfillRun_one_authoritative_key"',
    );
    expect(migrationSource).toContain(
      "WHERE \"status\" IN ('ACTIVE', 'BLOCKED', 'BARRIER_REQUIRED', 'INCOMPATIBLE')",
    );
  });

  test("closes contract, status, blocker, counter, and receipt identities", () => {
    for (const fragment of [
      '"mode" = \'APPLY\'',
      "'ACTIVE', 'BLOCKED', 'BARRIER_REQUIRED', 'INCOMPATIBLE', 'STOPPED', 'COMPLETED'",
      "'CONTINUE', 'BLOCKED', 'BARRIER_REQUIRED'",
      "ApprovalRoutingBackfillRun_contract_check",
      "ApprovalRoutingBackfillRun_request_check",
      "ApprovalRoutingBackfillBatch_progress_check",
      "ApprovalRoutingBackfillBlocker_code_check",
      "ApprovalRoutingBackfillBatch_receipt_key",
      "ApprovalRoutingBackfillBlocker_retry_key",
    ]) {
      expect(migrationSource).toContain(fragment);
    }
  });

  test("uses database-time fenced leases and atomic batch checkpoints", () => {
    expect(migrationSource).toContain("clock_timestamp()");
    expect(migrationSource).toContain(
      "APPROVAL_ROUTING_BACKFILL_START_SHAPE_INVALID",
    );
    expect(migrationSource).toContain(
      "APPROVAL_ROUTING_BACKFILL_LEASE_WINDOW_INVALID",
    );
    expect(migrationSource).toContain(
      "APPROVAL_ROUTING_BACKFILL_OWNER_REQUIRES_NEW_FENCE",
    );
    expect(migrationSource).toContain(
      "APPROVAL_ROUTING_BACKFILL_CHECKPOINT_REQUIRES_BATCH",
    );
    expect(migrationSource).toContain(
      "APPROVAL_ROUTING_BACKFILL_BATCH_NOT_CHECKPOINTED",
    );
    expect(migrationSource).toContain(
      'NEW."status" IS DISTINCT FROM (CASE committed_batch."outcome"',
    );
    expect(migrationSource).toContain(
      "APPROVAL_ROUTING_BACKFILL_RECEIPT_CHAIN_INVALID",
    );
    expect(migrationSource).toContain(
      "APPROVAL_ROUTING_BACKFILL_BLOCKER_COUNT_MISMATCH",
    );
    expect(migrationSource).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  test("allows only batch-backed status progress or an exact same-transaction audited stop", () => {
    for (const fragment of [
      "APPROVAL_ROUTING_BACKFILL_STATUS_REQUIRES_BATCH_OR_STOP",
      "APPROVAL_ROUTING_BACKFILL_STOP_AUDIT_INVALID",
      "APPROVAL_ROUTING_BACKFILL_BATCH_STATUS_INVALID",
      '"stopAuditEventId" UUID',
      "ApprovalRoutingBackfillRun_stop_audit_scope_fkey",
      "xmin::text::numeric = mod(",
      "pg_current_xact_id()::text::numeric",
      "4294967296::numeric",
      "stop_audit.\"occurredAt\" AT TIME ZONE 'UTC'",
      "stop_audit.\"metadata\" ->> 'fencingToken'",
    ]) {
      expect(migrationSource).toContain(fragment);
    }
  });

  test("uses absolute instants for leases and evidence while retaining the source cursor type", () => {
    for (const column of [
      "leaseExpiresAt",
      "startedAt",
      "completedAt",
      "stoppedAt",
      "createdAt",
      "updatedAt",
      "committedAt",
      "observedAt",
    ]) {
      expect(migrationSource).toMatch(
        new RegExp(`\"${column}\" TIMESTAMPTZ\\(3\\)`),
      );
    }
    for (const cursor of [
      "lastCursorCreatedAt",
      "cursorFromCreatedAt",
      "cursorToCreatedAt",
    ]) {
      expect(migrationSource).toContain(`\"${cursor}\" TIMESTAMP(3)`);
    }
  });

  test("makes batch and blocker evidence append-only and adds the stable pending keyset index", () => {
    for (const trigger of [
      "ApprovalRoutingBackfillBatch_append_only_guard_trg",
      "ApprovalRoutingBackfillBatch_truncate_guard_trg",
      "ApprovalRoutingBackfillBlocker_append_only_guard_trg",
      "ApprovalRoutingBackfillBlocker_truncate_guard_trg",
    ]) {
      expect(migrationSource).toContain(`ENABLE ALWAYS TRIGGER \"${trigger}\"`);
    }
    expect(migrationSource).toContain(
      'CREATE INDEX "ApprovalInstance_pending_created_id_idx"',
    );
    expect(migrationSource).toContain(
      'ON "ApprovalInstance"("tenantId", "companyId", "createdAt", "id")',
    );
    expect(migrationSource).toContain('WHERE "status" = \'PENDING\'');
  });

  test("does not broaden public privileges", () => {
    for (const table of [
      "ApprovalRoutingBackfillRun",
      "ApprovalRoutingBackfillBatch",
      "ApprovalRoutingBackfillBlockerObservation",
    ]) {
      expect(migrationSource).toContain(
        `REVOKE ALL ON TABLE \"${table}\" FROM PUBLIC`,
      );
    }
    expect(migrationSource).not.toMatch(/GRANT\s+/i);
  });
});
