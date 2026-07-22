import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  APPROVAL_ROUTING_MAX_OFFSET,
  APPROVAL_ROUTING_MAX_PAGE_SIZE,
  assertApprovalRoutingRuntimeReady,
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

  test("runtime gate is instance-rooted and rejects every incomplete pending workflow", () => {
    const source = readFileSync(
      path.resolve(__dirname, "approvalRouting.ts"),
      "utf8"
    );
    expect(source).toContain("APPROVAL_ROUTING_BACKFILL_REQUIRED");
    expect(source).toContain('FROM "ApprovalInstance" ai');
    expect(source).toContain('ai."currentStepOrder" IS NULL');
    expect(source).toContain('SELECT count(*)\n             FROM "ApprovalInstanceStep" step');
    expect(source).toContain("AND step.status = 'PENDING'::\"ApprovalStepStatus\"");
    expect(source).toContain('step."stepOrder" = ai."currentStepOrder"');
    expect(source).toContain('num_nonnulls(step."assignedUserId", step."assignedRoleId") <> 1');
    expect(source).toContain('step."delegatedFromUserId" IS NOT NULL');
    expect(source).toContain('step."routingSchemaVersion" <> ${APPROVAL_ROUTING_SCHEMA_VERSION}');
    expect(source).toContain('step."requiredPermissionId" IS NULL');
    expect(source).toContain("step.status NOT IN (");
    expect(source).toContain("AND step.status <> 'WAITING'::\"ApprovalStepStatus\"");
    expect(source).toContain('step."activatedAt" IS NULL');
    expect(source).toContain('step."activatedAt" IS NOT NULL');
    expect(source).toContain('FROM "ApprovalInstanceStepScopeGroup" scope_group');
    expect(source).toContain('FROM "ApprovalInstanceStepScopeTarget" target');
  });

  test("runtime gate uses only the supplied client and never invokes operator inspection", async () => {
    let queryCount = 0;
    const readyClient = {
      $queryRaw: async () => {
        queryCount += 1;
        return [{ count: 0n }];
      }
    };
    await expect(
      assertApprovalRoutingRuntimeReady(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        readyClient as never
      )
    ).resolves.toBeUndefined();
    expect(queryCount).toBe(1);

    await expect(
      assertApprovalRoutingRuntimeReady(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        { $queryRaw: async () => [{ count: 1n }] } as never
      )
    ).rejects.toThrow("APPROVAL_ROUTING_BACKFILL_REQUIRED");

    const routingSource = readFileSync(
      path.resolve(__dirname, "approvalRouting.ts"),
      "utf8"
    );
    const runtimeStart = routingSource.indexOf(
      "export async function assertApprovalRoutingRuntimeReady("
    );
    const operatorStart = routingSource.indexOf(
      "export async function assertApprovalRoutingCutoverReady("
    );
    const runtimeSource = routingSource.slice(runtimeStart, operatorStart);
    expect(runtimeStart).toBeGreaterThanOrEqual(0);
    expect(operatorStart).toBeGreaterThan(runtimeStart);
    expect(runtimeSource).not.toContain("approvalRoutingBackfill");
    expect(runtimeSource).not.toContain("inspectApprovalRoutingReadiness");
    expect(runtimeSource).not.toContain("prisma.$transaction");
  });

  test("centralizes all next-step activation and normalized action-time checks", () => {
    const source = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const routingSource = readFileSync(
      path.resolve(__dirname, "approvalRouting.ts"),
      "utf8"
    );
    const financeCloseSource = readFileSync(
      path.resolve(__dirname, "financePeriodClose.ts"),
      "utf8"
    );
    expect(source.match(/data: \{ status: "PENDING" \}/g)).toHaveLength(1);
    expect(source.match(/await activateNextApprovalStep\(tx, session/g)).toHaveLength(11);
    expect(source.match(/prepareSpecializedApprovalDecisionAuthority\(/g)).toHaveLength(21);
    expect(source).toContain("prepareNormalizedApprovalDecisionPreflight");
    expect(financeCloseSource.match(/prepareFinanceCloseApprovalDecision\(/g)).toHaveLength(3);
    expect(financeCloseSource).toContain("prepareNormalizedApprovalDecisionPreflight");
    expect(routingSource).toContain("FOR UPDATE OF ai");
    expect(routingSource).toContain("FOR UPDATE OF step");
    expect(routingSource).toContain("assertApprovalRoutingRuntimeReady");
    expect(source).not.toContain("assertApprovalRoutingCutoverReady");
    expect(source).not.toContain("inspectApprovalRoutingReadiness");
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
