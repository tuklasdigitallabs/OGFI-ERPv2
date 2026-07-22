import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { scanApprovalRoutingKeysetPages } from "./approvalRoutingBackfill";

const source = readFileSync(
  path.resolve(__dirname, "approvalRoutingBackfill.ts"),
  "utf8",
);
const job = readFileSync(
  path.resolve(__dirname, "../jobs/approvalRoutingBackfill.ts"),
  "utf8",
);
const routing = readFileSync(
  path.resolve(__dirname, "approvalRouting.ts"),
  "utf8",
);
const auditUniquenessMigration = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20260722180000_approval_routing_backfill_audit_uniqueness/migration.sql",
  ),
  "utf8",
);

describe("approval routing active-work backfill contract", () => {
  test("defaults to dry-run and requires an explicit apply flag", () => {
    expect(job).toContain('const apply = process.argv.includes("--apply")');
    expect(source).toContain("const apply = options.apply === true");
    expect(source).toContain('mode: apply ? "APPLY" : "DRY_RUN"');
  });

  test("coordinates bounded serializable per-instance transactions", () => {
    expect(source).toContain("pg_try_advisory_xact_lock");
    expect(source).toContain("APPROVAL_ROUTING_BACKFILL_MAX_BATCH_SIZE = 100");
    expect(source).toContain("APPROVAL_ROUTING_BACKFILL_MAX_SECONDS = 50");
    expect(source).toContain('isolationLevel: "Serializable"');
    expect(source).toContain('id: { gt: afterId }');
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("routingSchemaVersion: 0");
    expect(source).toContain("APPROVAL_ROUTING_BACKFILL_CAS_FAILED");
  });

  test("rolls an instance back on any child, CAS, or audit failure", () => {
    expect(source).toContain(
      "const inspected = await inspectOrApplyInstance(tx, row.id, true)",
    );
    expect(source).toContain("throw new BackfillDryRunRollback()");
    expect(source.indexOf("approvalInstanceStepScopeGroup.create"))
      .toBeLessThan(source.indexOf("await tx.auditEvent.create"));
    expect(source).toContain("prisma.$transaction(");
  });

  test("blocks every confirmed unsafe legacy shape without guessing", () => {
    for (const code of [
      "UNSUPPORTED_PROJECT_REQUIREMENT",
      "UNSUPPORTED_DOCUMENT_TYPE",
      "ZERO_STEPS",
      "MULTIPLE_PENDING_STEPS",
      "CURRENT_PENDING_STEP_MISMATCH",
      "ORPHAN_STEP_STRUCTURE",
      "ASSIGNMENT_XOR_INVALID",
      "DELEGATED_STEP_UNSUPPORTED",
      "SOURCE_NOT_FOUND",
      "SOURCE_SCOPE_MISMATCH",
      "SOURCE_STATUS_INVALID",
      "SOURCE_LOCATION_REQUIRED",
    ]) expect(source).toContain(`"${code}"`);
    expect(source).toContain('instance.documentType === "PROJECT_REQUIREMENT"');
  });

  test("preserves terminal rows and verifies v1 reruns for drift", () => {
    expect(source).toContain('status: "PENDING"');
    expect(source).toContain('return { state: "TERMINAL" as const }');
    expect(source).toContain("verifyStepDescriptor(tx, step, expected)");
    expect(source).toContain('block("BACKFILL_AUDIT_DRIFT")');
  });

  test("records one backfill event without synthetic activation or notifications", () => {
    expect(source.match(/await tx\.auditEvent\.create/g)).toHaveLength(1);
    expect(source).toContain('eventType: "approval.step_routing_backfilled"');
    expect(source.match(/eventType: "approval\.step_activated"/g)).toHaveLength(1);
    expect(source).not.toContain("notification.create");
    expect(source).toContain("actorUserId: null");
    expect(source).toContain("mappingHash: APPROVAL_ROUTING_MAPPING_HASH");
    expect(source).toContain("sourceDigest: expected.sourceDigest");
    expect(source).toContain("activatedAtProvenance");
    expect(auditUniquenessMigration).toContain(
      'CREATE UNIQUE INDEX "AuditEvent_approval_routing_backfill_key"',
    );
    expect(auditUniquenessMigration).toContain(
      '"eventType" = \'approval.step_routing_backfilled\'',
    );
  });

  test("readiness invokes full inspection including zero-step and unknown types", () => {
    expect(routing).toContain('import(\n    "./approvalRoutingBackfill"');
    expect(source).toContain("inspectApprovalRoutingReadiness");
    expect(source).toContain('if (steps.length === 0) block("ZERO_STEPS")');
    expect(source).toContain('if (!isSupportedApprovalDocumentType(instance.documentType))');
    expect(source).toContain("CURRENT_ELIGIBLE_ACTOR_MISSING");
    expect(source).toContain("ROLE_NOTIFICATION_PRESENT");
  });

  test("keyset scanning crosses batch boundaries and reruns idempotently", async () => {
    const rows = Array.from({ length: 205 }, (_, index) => ({
      id: String(index + 1).padStart(4, "0"),
    }));
    const applied = new Set<string>();
    let writes = 0;
    const run = () => scanApprovalRoutingKeysetPages({
      batchSize: 50,
      deadlineMs: 10_000,
      now: () => 0,
      loadPage: async (afterId, batchSize) =>
        rows.filter((row) => !afterId || row.id > afterId).slice(0, batchSize),
      visit: async (row) => {
        if (!applied.has(row.id)) {
          applied.add(row.id);
          writes += 1;
        }
      },
    });
    expect(await run()).toEqual({ scanned: 205, hasMore: false, lastId: "0205" });
    expect(await run()).toEqual({ scanned: 205, hasMore: false, lastId: "0205" });
    expect(applied.size).toBe(205);
    expect(writes).toBe(205);
  });
});
