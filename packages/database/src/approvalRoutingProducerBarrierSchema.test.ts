import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const schemaSource = read("../prisma/schema.prisma");
const migrationSource = read(
  "../prisma/migrations/20260727150000_approval_routing_producer_barrier_dormant/migration.sql",
);
const reconcileSource = read(
  "../../../infra/hostinger/postgres/reconcile-ownership-and-grants.sql",
);
const verifySource = read(
  "../../../infra/hostinger/postgres/verify-role-contract.sql",
);

const registeredFamilies = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
  "PurchaseOrderBalanceClosure",
  "PurchaseOrderAmendment",
  "WastageReport",
  "StockAdjustment",
  "FinanceCloseRun",
  "BudgetRevision",
  "ExpenseRequest",
  "CashAdvanceRequest",
  "PettyCashRequest",
  "PaymentRequest",
  "PaymentRelease",
  "EmployeeLeaveRequest",
  "EmployeeOvertimeRecord",
  "WorkforceSchedule",
  "AttendanceImportBatch",
] as const;

describe("DEC-0247 dormant approval-routing producer barrier schema", () => {
  test("is additive, empty, DORMANT-only, and has no readiness/result authority", () => {
    for (const table of [
      "ApprovalRoutingProducerBarrierGeneration",
      "ApprovalRoutingProducerProvenance",
    ]) {
      expect(schemaSource).toContain(`model ${table} {`);
      expect(migrationSource).toContain(`CREATE TABLE \"${table}\"`);
      expect(migrationSource).not.toMatch(
        new RegExp(`INSERT INTO\\s+\"${table}\"`, "i"),
      );
    }
    expect(migrationSource).toContain(
      'CHECK ("state" = \'DORMANT\')',
    );
    expect(migrationSource).not.toMatch(
      /CREATE TABLE\s+"[^"]*(?:Readiness|Activation|Result)[^"]*"/i,
    );
    expect(migrationSource).not.toMatch(/V1_PRODUCER_BARRIER_READY|DRAIN_CLEAN/);
    expect(migrationSource).not.toMatch(
      /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?"(?:ApprovalInstance|ApprovalInstanceStep|AuditEvent)"/i,
    );
  });

  test("binds generation and provenance to exact tenant/company/instance lineage", () => {
    for (const constraint of [
      "ApprovalProducerBarrierGeneration_company_scope_fkey",
      "ApprovalProducerProvenance_company_scope_fkey",
      "ApprovalProducerProvenance_generation_scope_fkey",
      "ApprovalProducerProvenance_instance_scope_fkey",
      "ApprovalProducerProvenance_instance_key",
    ]) {
      expect(migrationSource).toContain(constraint);
    }
    for (const binding of [
      'NEW."documentType" IS DISTINCT FROM instance."documentType"',
      'NEW."documentId" IS DISTINCT FROM instance."documentId"',
      'NEW."routingMappingHash" IS DISTINCT FROM generation."routingMappingHash"',
      'NEW."capabilityHash" IS DISTINCT FROM generation."capabilityHash"',
      'NEW."releaseIdentity" IS DISTINCT FROM generation."releaseIdentity"',
      "pg_current_xact_id()::text",
    ]) {
      expect(migrationSource).toContain(binding);
    }
  });

  test("uses one database-derived lock contract for the exact closed 18 families", () => {
    expect(registeredFamilies).toHaveLength(18);
    for (const family of registeredFamilies) {
      expect(migrationSource).toContain(`'${family}'`);
    }
    for (const fragment of [
      "acquire_approval_routing_producer_barrier_shared",
      "pg_catalog.hashtextextended",
      "ogfi:approval-routing-producer-barrier:v1:",
      "pg_catalog.pg_try_advisory_xact_lock_shared",
      "APPROVAL_ROUTING_PRODUCER_BARRIER_SCOPE_INVALID",
      "APPROVAL_ROUTING_PRODUCER_FAMILY_UNSUPPORTED",
      "APPROVAL_ROUTING_PRODUCER_BARRIER_RETRY",
      "ERRCODE = '40001'",
      "SET search_path = pg_catalog, public",
    ]) {
      expect(migrationSource).toContain(fragment);
    }
    expect(migrationSource).not.toContain("pg_advisory_xact_lock_shared(");
    expect(migrationSource).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  test("installs first-running ENABLE ALWAYS graph locks on all six relations", () => {
    for (const table of [
      "ApprovalInstance",
      "ApprovalInstanceStep",
      "ApprovalInstanceStepScopeGroup",
      "ApprovalInstanceStepScopeTarget",
      "ApprovalInstanceStepProhibitedActor",
      "ApprovalRoutingProducerProvenance",
    ]) {
      expect(migrationSource).toContain(
        `BEFORE INSERT OR UPDATE OR DELETE ON \"${table}\"`,
      );
      expect(migrationSource).toContain(
        `ALTER TABLE \"${table}\" ENABLE ALWAYS TRIGGER \"00_approval_producer_barrier_lock_trg\"`,
      );
    }
    expect(migrationSource).toContain(
      "PERFORM public.acquire_approval_routing_producer_barrier_shared(",
    );
  });

  test("keeps both evidence relations insert-disabled/append-only and the exact validator inert", () => {
    for (const trigger of [
      "ApprovalGeneration_dormant_insert_guard_trg",
      "ApprovalProvenance_dormant_insert_guard_trg",
      "ApprovalGeneration_append_only_guard_trg",
      "ApprovalGeneration_truncate_guard_trg",
      "ApprovalProvenance_append_only_guard_trg",
      "ApprovalProvenance_truncate_guard_trg",
    ]) {
      expect(migrationSource).toContain(`ENABLE ALWAYS TRIGGER \"${trigger}\"`);
    }
    expect(
      migrationSource.match(
        /BEFORE INSERT ON \"ApprovalRoutingProducer[^\"]+\"\n  FOR EACH STATEMENT/g,
      ),
    ).toHaveLength(2);
    expect(migrationSource).toContain(
      "APPROVAL_ROUTING_PRODUCER_BARRIER_DORMANT_INSERT_PROHIBITED",
    );
    expect(verifySource).toContain(
      "Approval producer barrier ENABLE ALWAYS dormant insert trigger contract is incomplete",
    );
    expect(verifySource).toContain(
      "Dormant approval producer barrier evidence relations are not empty",
    );
    expect(migrationSource.match(/DEFERRABLE INITIALLY DEFERRED FOR EACH ROW/g)).toHaveLength(6);
    expect(migrationSource.match(/WHEN \(false\)/g)).toHaveLength(6);
    expect(migrationSource).toContain(
      "APPROVAL_ROUTING_PRODUCER_VALIDATOR_DORMANT",
    );
  });

  test("grants no migration-time authority and closes hosted evidence privileges", () => {
    expect(migrationSource).not.toMatch(/\bGRANT\b/i);
    for (const table of [
      "ApprovalRoutingProducerBarrierGeneration",
      "ApprovalRoutingProducerProvenance",
    ]) {
      expect(migrationSource).toContain(
        `REVOKE ALL ON TABLE \"${table}\" FROM PUBLIC`,
      );
      expect(reconcileSource).toContain(`'${table}'`);
      expect(verifySource).toContain(`'${table}'`);
    }
    expect(reconcileSource).toContain(
      "GRANT EXECUTE ON FUNCTION public.acquire_approval_routing_producer_barrier_shared(UUID, UUID, TEXT)",
    );
    expect(verifySource).toContain(
      "Approval producer barrier shared-lock function contract is unsafe or incomplete",
    );
  });
});
