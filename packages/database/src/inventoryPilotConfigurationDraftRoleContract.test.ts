import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const migration = read(
  "../prisma/migrations/20260806120000_inventory_pilot_configuration_draft_seal/migration.sql",
);
const reconcile = read(
  "../../../infra/hostinger/postgres/reconcile-ownership-and-grants.sql",
);
const verifier = read(
  "../../../infra/hostinger/postgres/verify-role-contract.sql",
);

describe("DEC-0273 hosted database role contract", () => {
  test("allows null initial lineage while checks keep optional references atomic", () => {
    expect(migration).not.toContain("MATCH FULL");
    expect(migration).toContain(
      '("predecessorRevisionId" IS NULL AND "predecessorRevisionNumber" IS NULL AND "predecessorDigest" IS NULL)',
    );
    expect(migration).toContain(
      '(status = \'DRAFT\' AND "sealedRevisionId" IS NULL AND "sealedRevisionNumber" IS NULL AND "sealedRevisionDigest" IS NULL',
    );
  });

  test("grants mutable draft access only through reviewed columns", () => {
    for (const table of [
      "InventoryPilotConfigurationDraft",
      "InventoryPilotDraftEndpointMembership",
      "InventoryPilotDraftItemMembership",
      "InventoryPilotDraftParticipant",
      "InventoryPilotDraftRouteReadiness",
    ]) {
      expect(reconcile).toContain(`'${table}'`);
      expect(verifier).toContain(`('${table}',`);
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain(
      "trigger_name := table_name || '_no_hard_delete_trg'",
    );
    expect(reconcile).toContain(
      'GRANT UPDATE (status, version, "lastEditedByUserId", "sealedRevisionId"',
    );
    expect(verifier).toContain(
      "runtime draft table-level privilege boundary is unsafe",
    );
    expect(verifier).toContain(
      "runtime/PUBLIC draft column ACL exceeds reviewed contract",
    );
  });

  test("gives runtime append-only seal output without activation authority", () => {
    for (const table of [
      "InventoryPilotConfigurationRevision",
      "InventoryPilotEndpointMembership",
      "InventoryPilotItemMembership",
      "InventoryPilotParticipantMembership",
      "InventoryPilotRouteReadinessMembership",
      "InventoryPilotConfigurationSealOperation",
    ]) {
      expect(reconcile).toContain(`'${table}'`);
      expect(verifier).toContain(`'${table}'`);
    }
    expect(reconcile).toContain(
      "GRANT SELECT, INSERT ON TABLE public.%I TO %I",
    );
    expect(verifier).toContain(
      "required runtime seal append privileges are missing",
    );
    expect(reconcile).toMatch(
      /'InventoryPilotFamilyActivationEvent',[\s\S]*'InventoryPilotFamilyActivation'[\s\S]*GRANT SELECT ON TABLE public\.%I TO %I/,
    );
  });

  test("pins trigger routines and exposes only their read-only canonicalizer call chain", () => {
    for (const [routine, revoke] of [
      [
        "inventory_pilot_approval_rule_canonical_json(uuid)",
        'REVOKE ALL ON FUNCTION "inventory_pilot_approval_rule_canonical_json"(UUID) FROM PUBLIC',
      ],
      [
        "validate_inventory_pilot_route_snapshot()",
        'REVOKE ALL ON FUNCTION "validate_inventory_pilot_route_snapshot"() FROM PUBLIC',
      ],
      [
        "validate_inventory_pilot_draft_header_write()",
        'REVOKE ALL ON FUNCTION "validate_inventory_pilot_draft_header_write"() FROM PUBLIC',
      ],
      [
        "validate_inventory_pilot_draft_child_write()",
        'REVOKE ALL ON FUNCTION "validate_inventory_pilot_draft_child_write"() FROM PUBLIC',
      ],
      [
        "validate_inventory_pilot_seal_operation()",
        'REVOKE ALL ON FUNCTION "validate_inventory_pilot_seal_operation"() FROM PUBLIC',
      ],
      [
        "validate_inventory_pilot_draft_terminal()",
        'REVOKE ALL ON FUNCTION "validate_inventory_pilot_draft_terminal"() FROM PUBLIC',
      ],
    ]) {
      expect(verifier).toContain(`public.${routine}`);
      expect(migration).toContain(revoke);
    }
    expect(verifier).toContain(
      "InventoryPilotConfigurationSealOperation_validate_trg",
    );
    expect(verifier).toContain(
      "InventoryPilotRouteReadinessMembership_digest_trg",
    );
    expect(verifier).toContain(
      "InventoryPilotDraftRouteReadiness_snapshot_trg",
    );
    expect(reconcile).toContain(
      "GRANT EXECUTE ON FUNCTION public.inventory_pilot_approval_rule_canonical_json(UUID) TO %I",
    );
    expect(reconcile).toContain(
      "GRANT EXECUTE ON FUNCTION public.inventory_pilot_revision_canonical_json(UUID) TO %I",
    );
    expect(verifier).toContain(
      "NOT has_function_privilege(runtime_role, 'public.inventory_pilot_revision_canonical_json(uuid)', 'EXECUTE')",
    );
    expect(verifier).toContain(
      "NOT has_function_privilege(runtime_role, 'public.inventory_pilot_approval_rule_canonical_json(uuid)', 'EXECUTE')",
    );
    expect(verifier).toContain(
      "has_function_privilege(runtime_role, guarded.function_oid, 'EXECUTE')",
    );
  });

  test("separates raw rule snapshots from bounded Purchase Request resolver evidence", () => {
    expect(migration.match(/"resolverEvidenceCanonicalJson" TEXT/g)).toHaveLength(2);
    expect(migration.match(/"resolverEvidenceDigest" CHAR\(64\)/g)).toHaveLength(2);
    expect(migration).toContain("family = 'PurchaseRequest'");
    expect(migration).toContain("family <> 'PurchaseRequest'");
    expect(migration).toContain(
      "NEW.\"resolverEvidenceCanonicalJson\" <> public.\"inventory_pilot_canonical_json\"(resolver_evidence)",
    );
    expect(migration).toContain(
      "resolver_evidence -> 'ruleDefinition' IS DISTINCT FROM NEW.\"ruleDefinitionCanonicalJson\"::jsonb",
    );
    expect(migration).toContain(
      "resolver_evidence #>> '{resolverOutcome,selectedApprovalRuleId}' IS DISTINCT FROM NEW.\"approvalRuleId\"::text",
    );
    expect(migration).toContain(
      "TG_TABLE_NAME = 'InventoryPilotRouteReadinessMembership'",
    );
    expect(migration).toContain(
      "resolver_evidence #>> '{resolverOutcome,routeType}' IS DISTINCT FROM 'normal'",
    );
    expect(reconcile).toContain(
      '"resolverEvidenceCanonicalJson", "resolverEvidenceDigest", "readinessCheckedAt"',
    );
    expect(verifier).toContain(
      "'resolverEvidenceCanonicalJson','resolverEvidenceDigest','readinessCheckedAt'",
    );
  });
});
