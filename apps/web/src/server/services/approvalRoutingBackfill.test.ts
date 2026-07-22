import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  scanApprovalRoutingKeysetPages,
  validateApprovalRoutingActivationAuditState,
  validateApprovalRoutingStructure,
} from "./approvalRoutingBackfill";

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
  type TestStep = {
    stepOrder: number;
    assignedUserId: string;
    assignedRoleId: null;
    delegatedFromUserId: null;
    status: string;
    actedAt: Date | null;
    activatedAt: Date | null;
    dueAt: Date | null;
  };
  const waitingStep = (stepOrder: number): TestStep => ({
    stepOrder,
    assignedUserId: `user-${stepOrder}`,
    assignedRoleId: null,
    delegatedFromUserId: null,
    status: "WAITING",
    actedAt: null,
    activatedAt: null,
    dueAt: null,
  });

  test("accepts the exact Budget Revision pre-review waiting shape", () => {
    expect(validateApprovalRoutingStructure({
      documentType: "BudgetRevision",
      sourceStatus: "SUBMITTED",
      currentStepOrder: 1,
      steps: [waitingStep(1), waitingStep(2)],
    })).toMatchObject({
      mode: "BUDGET_REVISION_PRE_REVIEW",
      current: { stepOrder: 1, status: "WAITING" },
    });
  });

  test.each([
    {
      name: "premature pending step",
      steps: [{ ...waitingStep(1), status: "PENDING", activatedAt: new Date() }],
      currentStepOrder: 1,
    },
    {
      name: "premature activation timestamp",
      steps: [{ ...waitingStep(1), activatedAt: new Date() }],
      currentStepOrder: 1,
    },
    {
      name: "premature SLA due date",
      steps: [{ ...waitingStep(1), dueAt: new Date() }],
      currentStepOrder: 1,
    },
    {
      name: "non-initial current step",
      steps: [waitingStep(1), waitingStep(2)],
      currentStepOrder: 2,
    },
  ])("fails closed for malformed pre-review state: $name", ({ steps, currentStepOrder }) => {
    expect(() => validateApprovalRoutingStructure({
      documentType: "BudgetRevision",
      sourceStatus: "SUBMITTED",
      currentStepOrder,
      steps,
    })).toThrow();
  });

  test("requires an activated current pending step once Budget Revision is under review", () => {
    const pending = {
      ...waitingStep(1),
      status: "PENDING",
      activatedAt: new Date("2026-07-22T00:00:00.000Z"),
      dueAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    expect(validateApprovalRoutingStructure({
      documentType: "BudgetRevision",
      sourceStatus: "UNDER_REVIEW",
      currentStepOrder: 1,
      steps: [pending, waitingStep(2)],
    })).toMatchObject({ mode: "ACTIONABLE", current: { status: "PENDING" } });
    expect(() => validateApprovalRoutingStructure({
      documentType: "BudgetRevision",
      sourceStatus: "UNDER_REVIEW",
      currentStepOrder: 1,
      steps: [waitingStep(1), waitingStep(2)],
    })).toThrow("MULTIPLE_PENDING_STEPS");
  });

  test("rejects activation audit evidence before Budget Revision review starts", () => {
    expect(() => validateApprovalRoutingActivationAuditState({
      mode: "BUDGET_REVISION_PRE_REVIEW",
      activationAuditPresent: true,
    })).toThrow("ROUTING_DESCRIPTOR_DRIFT");
    expect(() => validateApprovalRoutingActivationAuditState({
      mode: "BUDGET_REVISION_PRE_REVIEW",
      activationAuditPresent: false,
    })).not.toThrow();
  });

  test("does not relax the actionable structure for another approval family", () => {
    expect(() => validateApprovalRoutingStructure({
      documentType: "ExpenseRequest",
      sourceStatus: "SUBMITTED",
      currentStepOrder: 1,
      steps: [waitingStep(1)],
    })).toThrow("MULTIPLE_PENDING_STEPS");
  });

  test("defaults to dry-run and requires an explicit apply flag", () => {
    expect(job).toContain('const apply = process.argv.includes("--apply")');
    expect(source).toContain("const apply = options.apply === true");
    expect(source).toContain('mode: apply ? "APPLY" : "DRY_RUN"');
  });

  test("coordinates one bounded serializable transaction with per-instance savepoints", () => {
    expect(source).toContain("pg_try_advisory_xact_lock");
    expect(source).toContain("APPROVAL_ROUTING_BACKFILL_MAX_BATCH_SIZE = 100");
    expect(source).toContain("APPROVAL_ROUTING_BACKFILL_MAX_SECONDS = 50");
    expect(source).toContain('isolationLevel: "Serializable"');
    expect(source).toContain("SAVEPOINT approval_routing_backfill_instance");
    expect(source).toContain("ROLLBACK TO SAVEPOINT approval_routing_backfill_instance");
    expect(source).toContain("RELEASE SAVEPOINT approval_routing_backfill_instance");
    expect(source).toContain('id: { gt: afterId }');
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("routingSchemaVersion: 0");
    expect(source).toContain("APPROVAL_ROUTING_BACKFILL_CAS_FAILED");
  });

  test("rolls an instance back on any child, CAS, or audit failure", () => {
    expect(source).toContain(
      "const inspected = await inspectOrApplyInstance(coordinator, row.id, true)",
    );
    expect(source).toContain("throw new BackfillDryRunRollback()");
    expect(source.indexOf("approvalInstanceStepScopeGroup.create"))
      .toBeLessThan(source.indexOf("await tx.auditEvent.create"));
    expect(source).toContain("ROLLBACK TO SAVEPOINT approval_routing_backfill_instance");
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
      "SOURCE_APPROVAL_INTENT_REQUIRED",
    ]) expect(source).toContain(`"${code}"`);
    expect(source).toContain('instance.documentType === "PROJECT_REQUIREMENT"');
  });

  test("preserves terminal rows and verifies v1 reruns for drift", () => {
    expect(source).toContain('status: "PENDING"');
    expect(source).toContain('return { state: "TERMINAL" as const }');
    expect(source).toContain(
      "verifyStepDescriptor(tx, { instance, step, expected, mode })",
    );
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
    expect(source).toContain('mode === "BUDGET_REVISION_PRE_REVIEW"');
    expect(source).toContain('lifecycleMode: mode');
    expect(source).toContain('mode === "ACTIONABLE"');
    expect(source).toContain("dueAt: expectedStepDueAt");
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
    expect(routing).toContain('AS "isBudgetRevisionPreReview"');
    expect(routing).toContain("revision.status = 'SUBMITTED'");
    expect(routing).toContain("step.status <> 'WAITING'");
    expect(routing).toContain("step.\"dueAt\" IS NOT NULL");
    expect(routing).toContain("audit.\"eventType\" = 'approval.step_activated'");
    expect(routing).toContain("revision.status = 'UNDER_REVIEW'");
    expect(routing).toContain(
      'step."dueAt" IS DISTINCT FROM revision."effectiveFrom"',
    );
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
