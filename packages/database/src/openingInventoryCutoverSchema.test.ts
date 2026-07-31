import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const schema = read("../prisma/schema.prisma");
const migration = read(
  "../prisma/migrations/20260731110000_opening_inventory_cutover_foundation/migration.sql",
);
const inflightGuardMigration = read(
  "../prisma/migrations/20260731120000_opening_inventory_command_inflight_guard/migration.sql",
);
const inventoryPilotMigration = read(
  "../prisma/migrations/20260731090000_inventory_pilot_classifier_activation_intents/migration.sql",
);
const approvalBarrierMigration = read(
  "../prisma/migrations/20260731130000_opening_inventory_approval_producer_barrier/migration.sql",
);
const roleVerifier = read("../../../infra/hostinger/postgres/verify-role-contract.sql");

function approvalBarrierBody(source: string) {
  return source.match(
    /CREATE OR REPLACE FUNCTION public\.acquire_approval_routing_producer_barrier_shared\([\s\S]*?AS \$inventory_pilot_barrier\$([\s\S]*?)\$inventory_pilot_barrier\$;/,
  )?.[1];
}

describe("DEC-0263 opening inventory cutover database foundation", () => {
  test("adds only additive cohort, location-cutover, immutable evidence, and command structures", () => {
    for (const model of [
      "OpeningInventoryCohort",
      "OpeningInventoryCutover",
      "OpeningInventoryCutoverLine",
      "OpeningInventoryReconciliation",
      "OpeningInventoryApprovalAttestation",
      "OpeningInventoryCohortEvent",
      "OpeningInventoryExecutionCommand",
    ]) {
      expect(schema).toContain(`model ${model} {`);
      expect(migration).toContain(`CREATE TABLE \"${model}\"`);
    }
    expect(schema).toContain("OPENING_STOCK_LOCATION");
    expect(schema).toContain("evidenceManifestJson");
  });

  test("pins exact revision, location, attempt-line, movement, and replacement lineage", () => {
    for (const constraint of [
      "OpeningInventoryCohort_revision_exact_fkey",
      "OpeningInventoryCutover_cohort_exact_fkey",
      "OpeningInventoryCutover_inventory_location_exact_fkey",
      "OpeningInventoryCutover_attempt_exact_fkey",
      "OpeningInventoryCutoverLine_cutover_exact_fkey",
      "OpeningInventoryCutoverLine_attempt_line_exact_fkey",
      "OpeningInventoryCutoverLine_movement_fkey",
      "OpeningInventoryCohort_predecessor_fkey",
    ]) {
      expect(migration).toContain(constraint);
    }
    expect(migration).toContain("OpeningInventoryCutover_cohort_location_key");
    expect(migration).toContain("OpeningInventoryCutoverLine_cutover_stock_key");
    expect(migration).toContain("OpeningInventoryCohort_revision_effective_generation_key");
  });

  test("keeps preparation separate from isolated execution and fences all ledger bypasses", () => {
    expect(migration).toContain("public.execute_opening_inventory_command(command_id UUID)");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("RETURNS text");
    expect(migration).toContain("OPENING_INVENTORY_CUTOVER_WINDOW_NOT_CONFIGURED");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.execute_opening_inventory_command(UUID) FROM PUBLIC");
    expect(migration).toContain("is_opening_inventory_executor_session");
    expect(migration).toContain("is_opening_inventory_executor_context");
    expect(migration).toContain("OPENING_INVENTORY_CUTOVER_MOVEMENT_FENCE_ACTIVE");
    expect(migration).toContain("OPENING_INVENTORY_LEDGER_LINEAGE_DENIED");
    expect(migration).toContain("OPENING_INVENTORY_PRIOR_LEDGER_MOVEMENT_EXISTS");
    expect(migration).toContain("OPENING_INVENTORY_PREEXISTING_BALANCE_INVALID");
    expect(migration).toContain("OPENING_INVENTORY_COMMAND_REQUESTER_ATTESTATION_INVALID");
    expect(migration).toContain('"requestedMfaValidUntil"');
    expect(migration).toContain('"requiredPermissionCode"');
    expect(migration).toContain('"requestReason"');
    expect(migration).toContain("OPENING_INVENTORY_COMMAND_REQUESTER_PERMISSION_DENIED");
    expect(migration).toContain("OPENING_INVENTORY_COMMAND_REQUESTER_SCOPE_DENIED");
    expect(migration).toContain("OPENING_INVENTORY_CONFIGURATION_MEMBERSHIP_INVALID");
    expect(migration).toContain("assert_opening_inventory_cohort_manifest");
    expect(migration).toContain("assert_opening_inventory_cutover_facts");
    expect(migration).toContain("OPENING_INVENTORY_LINE_DIGEST_INVALID");
    expect(migration).toContain("OPENING_INVENTORY_COMMAND_REQUESTER_SOD_DENIED");
    expect(migration).toContain('ENABLE ALWAYS TRIGGER "00_OpeningInventoryMovement_fence_trg"');
  });

  test("requires verified controlled-evidence versions and normalized approval before staging", () => {
    expect(migration).toContain("OPENING_INVENTORY_EVIDENCE_MANIFEST_NOT_VERIFIED");
    expect(migration).toContain("OPENING_INVENTORY_NORMALIZED_APPROVAL_NOT_APPROVED");
    expect(migration).toContain("'OPENING_INVENTORY_COHORT'");
    expect(migration).toContain("attachment.\"availabilityState\" <> 'AVAILABLE'");
    expect(migration).toContain("attachment.\"scanState\" <> 'CLEAN'");
    expect(migration).toContain("scan.\"plaintextChecksum\"");
    expect(migration).toContain("OpeningInventoryApprovalAttestation_cutover_step_key");
    expect(migration).toContain("Opening inventory approval attestation lineage is invalid");
    expect(migration).toContain('"mfaValidUntil"');
    expect(migration).toContain("OPENING_INVENTORY_SOURCE_FACTS_INVALID");
    expect(schema).toContain("cutoverCanonicalJson");
    expect(schema).toContain("valuationCanonicalJson");
    expect(schema).toContain("lineCanonicalJson");
  });

  test("keeps staging non-posting and posts each captured line only during atomic cohort activation", () => {
    const stageStart = migration.indexOf("ELSIF command_row.\"commandType\" = 'STAGE_LOCATION'");
    const activateStart = migration.indexOf("ELSIF command_row.\"commandType\" = 'ACTIVATE_COHORT'");
    const reverseStart = migration.indexOf("    ELSE\n      SELECT * INTO cutover_row");
    const stage = migration.slice(stageStart, activateStart);
    const activation = migration.slice(activateStart, reverseStart);
    expect(stage).not.toContain('INSERT INTO public."InventoryMovement"');
    expect(stage).not.toContain('INSERT INTO public."InventoryBalance"');
    expect(activation).toContain('INSERT INTO public."InventoryMovement"');
    expect(activation).not.toContain('INSERT INTO public."InventoryBalance"');
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.apply_inventory_movement_to_balance()");
    expect(migration).toContain('CREATE TRIGGER "90_InventoryMovement_balance_cache_trg"');
    expect(migration).toContain('ENABLE ALWAYS TRIGGER "90_InventoryMovement_balance_cache_trg"');
    expect(migration).toContain("INVENTORY_BALANCE_DERIVED_CACHE_WRITE_DENIED");
    expect(activation).toContain('OPENING_STOCK:\' || line_row.id::text');
    expect(activation).toContain("OPENING_INVENTORY_POSTACTIVATION_RECONCILIATION_MISMATCH");
    expect(activation).toContain("status = 'ACTIVE'");
    expect(migration).toContain("OPENING_INVENTORY_PREACTIVE_REVERSAL_ONLY");
  });

  test("fails deployment on malformed command targets or duplicate unresolved actions", () => {
    expect(inflightGuardMigration).toContain(
      "OPENING_INVENTORY_COMMAND_TARGET_SHAPE_OR_LINEAGE_INVALID",
    );
    expect(inflightGuardMigration).toContain(
      "OPENING_INVENTORY_DUPLICATE_UNRESOLVED_COMMAND_ACTION",
    );
    expect(inflightGuardMigration).toContain("cutover.\"cohortId\" IS DISTINCT FROM command.\"cohortId\"");
    expect(inflightGuardMigration).toContain("cutover.\"tenantId\" IS DISTINCT FROM command.\"tenantId\"");
    expect(inflightGuardMigration).toContain("cutover.\"companyId\" IS DISTINCT FROM command.\"companyId\"");
  });

  test("admits only one unresolved semantic action per cohort or location target", () => {
    for (const index of [
      "OpeningInventoryExecutionCommand_unresolved_cohort_action_key",
      "OpeningInventoryExecutionCommand_unresolved_cutover_action_key",
    ]) {
      expect(inflightGuardMigration).toContain(`CREATE UNIQUE INDEX \"${index}\"`);
    }
    expect(inflightGuardMigration).toContain('("cohortId", "commandType")');
    expect(inflightGuardMigration).toContain('("cutoverId", "commandType")');
    expect(inflightGuardMigration).toContain('"cutoverId" IS NULL');
    expect(inflightGuardMigration).toContain('"cutoverId" IS NOT NULL');
    for (const status of ["PENDING", "CLAIMED", "FAILED_RETRYABLE"]) {
      expect(inflightGuardMigration).toContain(
        `'${status}'::"OpeningInventoryExecutionCommandStatus"`,
      );
    }
  });

  test("enforces cohort and location target shapes with exact cutover lineage in the trigger", () => {
    expect(inflightGuardMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.guard_opening_inventory_execution_command_scope()",
    );
    expect(inflightGuardMigration).toContain("SET search_path = pg_catalog, public");
    expect(inflightGuardMigration).toContain("OPENING_INVENTORY_COMMAND_COHORT_TARGET_INVALID");
    expect(inflightGuardMigration).toContain("OPENING_INVENTORY_COMMAND_LOCATION_TARGET_INVALID");
    expect(inflightGuardMigration).toContain("OPENING_INVENTORY_COMMAND_CUTOVER_LINEAGE_INVALID");
    expect(inflightGuardMigration).toContain('cutover_row."cohortId" IS DISTINCT FROM NEW."cohortId"');
    expect(inflightGuardMigration).toContain('cutover_row."tenantId" IS DISTINCT FROM NEW."tenantId"');
    expect(inflightGuardMigration).toContain('cutover_row."companyId" IS DISTINCT FROM NEW."companyId"');
    expect(inflightGuardMigration).toContain(
      "REVOKE ALL ON FUNCTION public.guard_opening_inventory_execution_command_scope() FROM PUBLIC",
    );
    expect(roleVerifier).toContain(
      "Opening-stock command scope trigger routine contract is unsafe",
    );
    expect(roleVerifier).toContain(
      "16552c4b33a97941a91d23a3a9948cd102894937662c062c56cfae20f24d8f7c",
    );
  });

  test("adds only OpeningInventoryCutover to the closed approval producer family set", () => {
    const priorBody = approvalBarrierBody(inventoryPilotMigration);
    const openingBody = approvalBarrierBody(approvalBarrierMigration);
    expect(priorBody).toBeDefined();
    expect(openingBody).toBeDefined();
    expect(openingBody!.match(/'OpeningInventoryCutover'/g)).toHaveLength(1);
    expect(
      openingBody!.replace(",\n    'OpeningInventoryCutover'", ""),
    ).toBe(priorBody);
    expect(openingBody).toContain(
      "producer_document_type IS NULL OR producer_document_type NOT IN",
    );
    expect(openingBody).toContain(
      "APPROVAL_ROUTING_PRODUCER_FAMILY_UNSUPPORTED",
    );
    expect(approvalBarrierMigration).toContain(
      "REVOKE ALL ON FUNCTION public.acquire_approval_routing_producer_barrier_shared(UUID, UUID, TEXT) FROM PUBLIC",
    );
    expect(approvalBarrierMigration).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(roleVerifier).toContain("545894fd67665c8b6fee2a2729d389e2");
  });
});
