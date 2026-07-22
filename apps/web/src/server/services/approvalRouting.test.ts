import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  APPROVAL_ROUTING_MAX_OFFSET,
  APPROVAL_ROUTING_MAX_PAGE_SIZE,
  normalizeApprovalRoutingPage
} from "./approvalRouting";

describe("normalized approval routing controls", () => {
  test("bounds page size and rejects an operationally unbounded offset", () => {
    expect(normalizeApprovalRoutingPage({ page: 0, pageSize: 999 })).toEqual({
      page: 1,
      pageSize: APPROVAL_ROUTING_MAX_PAGE_SIZE,
      offset: 0
    });
    expect(() =>
      normalizeApprovalRoutingPage({
        page: APPROVAL_ROUTING_MAX_OFFSET + 2,
        pageSize: 1
      })
    ).toThrow("APPROVAL_ROUTING_PAGE_OUT_OF_RANGE");
  });

  test("uses one materialized eligibility snapshot for page rows and exact count", () => {
    const source = readFileSync(
      path.resolve(__dirname, "approvalRouting.ts"),
      "utf8"
    );
    expect(source).toContain("WITH eligible AS MATERIALIZED");
    expect(source).toContain("SELECT count(*)::bigint");
    expect(source).toContain("LEFT JOIN page_rows ON true");
    expect(source).toContain('step."stepOrder" = ai."currentStepOrder"');
    expect(source).toContain("APPROVAL_ROUTING_DUE_BEFORE_REQUIRED");
  });

  test("requires live permission, role, scope, active resources, and prohibited-actor exclusion", () => {
    const source = readFileSync(
      path.resolve(__dirname, "approvalRouting.ts"),
      "utf8"
    );
    expect(source).toContain('grant_row."permissionId" = step."requiredPermissionId"');
    expect(source).toContain('assignment.status = \'ACTIVE\'::"RecordStatus"');
    expect(source).toContain('scope_assignment.status = \'ACTIVE\'::"RecordStatus"');
    expect(source).toContain('company.status = \'ACTIVE\'::"RecordStatus"');
    expect(source).toContain('brand.status = \'ACTIVE\'::"RecordStatus"');
    expect(source).toContain('location.status = \'ACTIVE\'::"RecordStatus"');
    expect(source).toContain('FROM "ApprovalInstanceStepProhibitedActor" prohibited');
  });

  test("records exactly one canonical activation event with explicit initial and later provenance", () => {
    const source = readFileSync(
      path.resolve(__dirname, "approvalRouting.ts"),
      "utf8"
    );
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260722140000_approval_step_eligibility_routing/migration.sql"
      ),
      "utf8"
    );
    expect(source).toContain('eventType: "approval.step_activated"');
    expect(source).toContain('fromStatus: "CREATED"');
    expect(source).toContain('fromStatus: "WAITING"');
    expect(migration).toContain('CREATE UNIQUE INDEX "AuditEvent_approval_step_activation_key"');
    expect(migration).toContain("AND \"eventType\" = 'approval.step_activated'");
  });

  test("cutover gate rejects every incomplete pending or waiting routing context", () => {
    const source = readFileSync(
      path.resolve(__dirname, "approvalRouting.ts"),
      "utf8"
    );
    expect(source).toContain("APPROVAL_ROUTING_BACKFILL_REQUIRED");
    expect(source).toContain('num_nonnulls(step."assignedUserId", step."assignedRoleId") <> 1');
    expect(source).toContain('step.status = \'PENDING\'::"ApprovalStepStatus" AND step."activatedAt" IS NULL');
    expect(source).toContain("AND NOT EXISTS (\n                SELECT 1 FROM \"ApprovalInstanceStepScopeTarget\"");
  });

  test("centralizes all next-step activation and normalized action-time checks", () => {
    const source = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    expect(source.match(/data: \{ status: "PENDING" \}/g)).toHaveLength(1);
    expect(source.match(/await activateNextApprovalStep\(tx, session/g)).toHaveLength(11);
    expect(source.match(/assertNormalizedApprovalAuthority\(tx, session, step\.id\)/g)).toHaveLength(20);
    expect(source).toContain("FOR UPDATE OF ai, step");
  });

  test("forces every approval routing child integrity trigger to run always", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260722170000_approval_routing_child_trigger_always/migration.sql"
      ),
      "utf8"
    );
    for (const triggerName of [
      "ApprovalStepScopeGroup_immutable_trg",
      "ApprovalStepScopeTarget_context_trg",
      "ApprovalStepScopeTarget_immutable_trg",
      "ApprovalStepProhibitedActor_context_trg",
      "ApprovalStepProhibitedActor_immutable_trg"
    ]) {
      expect(migration).toContain(`ENABLE ALWAYS TRIGGER "${triggerName}"`);
    }
  });
});
