import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const schema = read("../prisma/schema.prisma");
const migration = read(
  "../prisma/migrations/20260731090000_inventory_pilot_classifier_activation_intents/migration.sql",
);
const seed = read("./seed.ts");

describe("DEC-0261 Inventory Pilot database foundation", () => {
  test("extends the shared approval barrier to the two exact inventory families", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.acquire_approval_routing_producer_barrier_shared",
    );
    expect(migration).toContain("'InventoryTransfer', 'StockCountAttemptReview'");
    expect(migration).toContain("APPROVAL_ROUTING_PRODUCER_FAMILY_UNSUPPORTED");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.acquire_approval_routing_producer_barrier_shared(UUID, UUID, TEXT) FROM PUBLIC",
    );
    expect(migration).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  test("adds only empty relational authority and typed-intent structures", () => {
    for (const model of [
      "InventoryPilotConfigurationRevision",
      "InventoryPilotEndpointMembership",
      "InventoryPilotItemMembership",
      "InventoryPilotFamilyActivation",
      "InventoryPilotFamilyActivationEvent",
      "InventoryTransferApprovalSubmissionIntent",
      "StockCountReviewSubmissionIntent",
    ]) {
      expect(schema).toContain(`model ${model} {`);
      expect(migration).toContain(`CREATE TABLE \"${model}\"`);
      expect(migration).not.toMatch(
        new RegExp(`INSERT\\s+INTO\\s+\"${model}\"`, "i"),
      );
    }
    expect(schema).not.toMatch(/activeApprovalInstanceId/);
    expect(migration).not.toMatch(/CompanyPolicySetting/);
  });

  test("closes classifier scope, capability, family, and digest lineage", () => {
    for (const value of [
      "TRANSFER_SOURCE",
      "TRANSFER_DESTINATION",
      "COUNT_LOCATION",
      "InventoryTransfer",
      "StockCountAttemptReview",
      "SEALED",
      "ACTIVE",
      "INACTIVE",
    ]) {
      expect(migration).toContain(`'${value}'`);
    }
    for (const constraint of [
      "InventoryPilotEndpointMembership_inventory_location_exact_fkey",
      "InventoryPilotEndpointMembership_location_exact_fkey",
      "InventoryPilotItemMembership_item_exact_fkey",
      "InventoryPilotFamilyActivation_revision_exact_fkey",
      "InventoryPilotFamilyActivation_event_exact_fkey",
      "InventoryTransferApprovalIntent_source_exact_fkey",
      "InventoryTransferApprovalIntent_activation_exact_fkey",
      "InventoryTransferApprovalIntent_graph_exact_fkey",
      "StockCountReviewIntent_attempt_exact_fkey",
      "StockCountReviewIntent_session_exact_fkey",
      "StockCountReviewIntent_activation_exact_fkey",
      "StockCountReviewIntent_graph_exact_fkey",
    ]) {
      expect(migration).toContain(constraint);
    }
    expect(migration).toContain("inventory_pilot_revision_canonical_json");
    expect(migration).toContain("INVENTORY_PILOT_REVISION_DIGEST_MISMATCH");
    expect(migration).toContain("INVENTORY_PILOT_CROSS_FAMILY_REVISION_MISMATCH");
    expect(migration).toContain("INVENTORY_PILOT_OLDER_REVISION_REACTIVATION_DENIED");
    expect(migration).toContain(":inventory-pilot-activation', 0)");
    expect(migration.match(/public\.digest\(/g)).toHaveLength(4);
    expect(migration).not.toMatch(/(?<!public\.)digest\(/);
  });

  test("makes sealed history, activation events, and intents owner-resistant append-only", () => {
    for (const table of [
      "InventoryPilotConfigurationRevision",
      "InventoryPilotEndpointMembership",
      "InventoryPilotItemMembership",
      "InventoryPilotFamilyActivationEvent",
      "InventoryTransferApprovalSubmissionIntent",
      "StockCountReviewSubmissionIntent",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("ENABLE ALWAYS TRIGGER");
    expect(migration).toContain("INVENTORY_PILOT_HISTORY_APPEND_ONLY");
    expect(migration).toContain("INVENTORY_PILOT_ACTIVATION_CAS_INVALID");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  test("adds positive source versions and the approval states without rewriting rows", () => {
    for (const table of [
      "InventoryTransfer",
      "StockCountAttempt",
      "StockCountSession",
    ]) {
      expect(migration).toContain(
        `ALTER TABLE \"${table}\" ADD COLUMN \"version\" INTEGER NOT NULL DEFAULT 1`,
      );
      expect(migration).toContain(`${table}_version_check`);
    }
    expect(migration).toContain("'PENDING_APPROVAL'");
    expect(migration).toContain("'RETURNED'");
    expect(migration).toContain("'REJECTED'");
    expect(migration).not.toMatch(
      /UPDATE\s+"(?:InventoryTransfer|StockCountAttempt|StockCountSession)"/i,
    );
  });

  test("pins replay identity and exact source-to-approval graph lineage", () => {
    expect(migration).toContain("sourceVersionAfter\" = \"sourceVersionBefore\" + 1");
    expect(migration).toContain("attemptVersionAfter\" = \"attemptVersionBefore\" + 1");
    expect(migration).toContain("sessionVersionAfter\" = \"sessionVersionBefore\" + 1");
    expect(migration).toContain("INVENTORY_TRANSFER_APPROVAL_INTENT_REQUEST_HASH_MISMATCH");
    expect(migration).toContain("STOCK_COUNT_REVIEW_INTENT_REQUEST_HASH_MISMATCH");
    expect(migration).toContain("InventoryTransferApprovalIntent_scope_idempotency_key");
    expect(migration).toContain("StockCountReviewIntent_scope_idempotency_key");
  });

  test("registers the dedicated transfer approval permission in migration and seed", () => {
    for (const source of [migration, seed]) {
      expect(source).toContain("inventory.transfer.approve");
      expect(source).toContain("transfer.approve");
      expect(source).toContain("00000000-0000-4000-8000-000000000177");
    }
    expect(seed).toContain("permissionId: ids.transferApprovePermissionId");
  });
});
