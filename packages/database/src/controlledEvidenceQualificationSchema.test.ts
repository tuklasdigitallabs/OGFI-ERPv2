import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const schemaSource = read("../prisma/schema.prisma");
const migrationSource = read(
  "../prisma/migrations/20260724010000_controlled_evidence_qualification_foundation/migration.sql",
);
const reconcileSource = read(
  "../../../infra/hostinger/postgres/reconcile-ownership-and-grants.sql",
);
const verifySource = read(
  "../../../infra/hostinger/postgres/verify-role-contract.sql",
);
const disposableRunnerSource = read(
  "../../../scripts/run-disposable-postgres-tests.mjs",
);

describe("DEC-0077 dormant controlled-evidence database foundation", () => {
  test("attests the exact deployed control routine bodies", () => {
    for (const routine of [
      "controlled_evidence_canonical_json",
      "reject_controlled_evidence_history_mutation",
      "validate_controlled_evidence_policy_version",
      "validate_controlled_evidence_activation_event_lineage",
      "validate_controlled_evidence_policy_activation_transition",
      "validate_controlled_evidence_qualification_lineage",
      "validate_controlled_evidence_selection_lineage",
      "validate_controlled_evidence_selection_count",
      "validate_controlled_evidence_selection_parent_count",
    ]) {
      const escaped = routine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const body = migrationSource.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION "${escaped}"\\([^\\n]*\\)[\\s\\S]*?AS \\$function\\$(\\n[\\s\\S]*?\\n)\\$function\\$;`,
        ),
      )?.[1];
      expect(body, routine).toBeDefined();
      const digest = createHash("md5").update(body!).digest("hex");
      expect(verifySource, routine).toContain(`'${digest}'`);
    }
  });
  test("adds only the five policy-neutral foundation models", () => {
    for (const model of [
      "ControlledEvidencePolicyVersion",
      "ControlledEvidencePolicyActivation",
      "ControlledEvidencePolicyActivationEvent",
      "ControlledEvidenceActionQualification",
      "ControlledEvidenceActionSelection",
    ]) {
      expect(schemaSource).toContain(`model ${model} {`);
      expect(migrationSource).toContain(`CREATE TABLE \"${model}\"`);
    }

    expect(migrationSource).not.toMatch(
      /INSERT INTO\s+"ControlledEvidence(?:PolicyVersion|PolicyActivation|PolicyActivationEvent|ActionQualification|ActionSelection)"/,
    );
    expect(migrationSource).not.toContain("CompanyPolicySetting");
  });

  test("binds exact tenant, company, policy, actor, approval, link, attachment, and scan lineage", () => {
    for (const constraint of [
      "ControlledEvidencePolicyActivation_active_event_exact_fkey",
      "ControlledEvidencePolicyActivationEvent_policy_exact_fkey",
      "ControlledEvidenceActionQualification_event_exact_fkey",
      "ControlledEvidenceActionQualification_pointer_scope_fkey",
      "ControlledEvidenceActionQualification_policy_exact_fkey",
      "ControlledEvidenceActionQualification_actor_scope_fkey",
      "ControlledEvidenceActionQualification_auth_session_scope_fkey",
      "ControlledEvidenceActionQualification_approval_scope_fkey",
      "ControlledEvidenceActionQualification_approval_step_fkey",
      "ControlledEvidenceActionSelection_qualification_scope_fkey",
      "ControlledEvidenceActionSelection_link_exact_fkey",
      "ControlledEvidenceActionSelection_attachment_exact_version_fkey",
      "ControlledEvidenceActionSelection_scan_exact_version_fkey",
      "ControlledEvidenceAttachment_company_scope_fkey",
      "ControlledEvidenceAttachment_creator_scope_fkey",
      "ControlledEvidenceAttachment_archiver_scope_fkey",
    ]) {
      expect(migrationSource).toContain(constraint);
    }

    expect(migrationSource).toContain(
      "CONTROLLED_EVIDENCE_ACTIVATION_SNAPSHOT_MISMATCH",
    );
    expect(migrationSource).toContain(
      "CONTROLLED_EVIDENCE_POLICY_SNAPSHOT_MISMATCH",
    );
    expect(migrationSource).toContain(
      "CONTROLLED_EVIDENCE_SELECTION_LINEAGE_MISSING",
    );

    const scanForeignKey = migrationSource.match(
      /ADD CONSTRAINT "ControlledEvidenceActionSelection_scan_exact_version_fkey"([\s\S]*?)ON DELETE RESTRICT ON UPDATE CASCADE;/,
    )?.[1];
    expect(scanForeignKey).toBeDefined();
    expect(scanForeignKey?.match(/FOREIGN KEY/g)).toHaveLength(1);
    expect(scanForeignKey?.match(/REFERENCES/g)).toHaveLength(1);
    expect(scanForeignKey).toContain(
      'FOREIGN KEY ("scanAttemptId", "tenantId", "companyId", "attachmentId", "objectVersionId")',
    );
    expect(scanForeignKey).toContain(
      'REFERENCES "AttachmentScanAttempt"("id", "tenantId", "companyId", "attachmentId", "objectVersionId")',
    );
  });

  test("requires exact clean durable readiness without conflating encrypted and plaintext checksums", () => {
    expect(migrationSource).toContain('"uploadState" = \'VERIFIED\'');
    expect(migrationSource).toContain('"scanState" = \'CLEAN\'');
    expect(migrationSource).toContain('"availabilityState" = \'AVAILABLE\'');
    expect(migrationSource).toContain('"physicalState" = \'DURABLE\'');
    expect(migrationSource).toContain(
      '"attachmentDetectedChecksum" = "attachmentChecksum"',
    );
    expect(migrationSource).toContain(
      '"scanPlaintextChecksum" = "attachmentChecksum"',
    );
    expect(migrationSource).toContain(
      '"attachmentStoredChecksum" ~ \'^[a-f0-9]{64}$\'',
    );
    expect(migrationSource).not.toContain(
      '"attachmentStoredChecksum" = "attachmentChecksum"',
    );
    expect(migrationSource).toContain(
      "encode(decode(attachment_row.\"checksum\", 'base64'), 'hex')",
    );
    expect(migrationSource).toContain(
      "encode(decode(attachment_row.\"detectedChecksum\", 'base64'), 'hex')",
    );
    expect(migrationSource).not.toMatch(
      /FROM "(?:ControlledEvidencePolicyActivationEvent|ControlledEvidencePolicyVersion|ControlledEvidenceActionQualification|AttachmentScanAttempt)"[\s\S]{0,300}?FOR SHARE/,
    );
  });

  test("makes policy and qualification history owner-resistant append-only", () => {
    expect(migrationSource).toMatch(/^--[\s\S]*\nBEGIN;\nSET LOCAL lock_timeout = '5s';/);
    expect(migrationSource.trimEnd()).toMatch(/COMMIT;$/);
    for (const table of [
      "AttachmentScanAttempt",
      "ControlledEvidencePolicyVersion",
      "ControlledEvidencePolicyActivationEvent",
      "ControlledEvidenceActionQualification",
      "ControlledEvidenceActionSelection",
    ]) {
      expect(migrationSource).toContain(
        `CREATE TRIGGER \"${table}_append_only_guard_trg\"`,
      );
      expect(migrationSource).toContain(
        `ENABLE ALWAYS TRIGGER \"${table}_append_only_guard_trg\"`,
      );
    }
    expect(migrationSource).toContain(
      "CONTROLLED_EVIDENCE_ACTIVATION_CAS_INVALID",
    );
    expect(migrationSource).toContain(
      'ENABLE ALWAYS TRIGGER "ControlledEvidencePolicyActivation_transition_guard_trg"',
    );
    expect(migrationSource).toContain(
      'ENABLE ALWAYS TRIGGER "ControlledEvidencePolicyActivation_remove_guard_trg"',
    );
    expect(migrationSource).toContain(
      'NEW."activatedAt" := date_trunc(\'milliseconds\', transaction_timestamp())',
    );
    expect(migrationSource).toContain(
      "CONTROLLED_EVIDENCE_SELECTION_COUNT_MISMATCH",
    );
    expect(migrationSource).toContain(
      'CREATE CONSTRAINT TRIGGER "ControlledEvidenceActionSelection_parent_count_trg"',
    );
    expect(migrationSource).toContain(
      'DROP TRIGGER "AttachmentScanAttempt_append_only_update_trg"',
    );
  });

  test("reconciles runtime to read-only policy state and append-only fact inserts", () => {
    for (const source of [reconcileSource, verifySource]) {
      expect(source).toContain("ControlledEvidencePolicyVersion");
      expect(source).toContain("ControlledEvidencePolicyActivation");
      expect(source).toContain("ControlledEvidenceActionQualification");
      expect(source).toContain("ControlledEvidenceActionSelection");
      expect(source).toContain("AttachmentScanAttempt");
    }
    expect(reconcileSource).toContain(
      "EXECUTE format('GRANT SELECT ON TABLE public.%I TO %I', protected_table, runtime_role)",
    );
    expect(reconcileSource).toContain(
      'GRANT UPDATE ("updatedAt") ON TABLE public."ControlledEvidencePolicyActivation"',
    );
    expect(reconcileSource).toContain(
      "GRANT EXECUTE ON FUNCTION public.controlled_evidence_canonical_json(JSONB)",
    );
    expect(reconcileSource).toContain(
      "EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO %I', protected_table, runtime_role)",
    );
    expect(verifySource).toContain(
      "ControlledEvidencePolicyVersion append-only trigger is incomplete",
    );
    expect(verifySource).toContain(
      "ControlledEvidencePolicyActivationEvent append-only trigger is incomplete",
    );
    expect(verifySource).toContain(
      "ControlledEvidencePolicyActivation transition trigger is incomplete",
    );
    expect(verifySource).toContain(
      "ControlledEvidencePolicyActivation row-lock column privilege is missing",
    );
    expect(verifySource).toContain(
      "Controlled-evidence lineage or cardinality trigger contract is incomplete",
    );
    expect(verifySource).toContain("t.tgtype = expected.trigger_type");
    expect(verifySource).toContain("t.tgdeferrable = expected.is_deferrable");
    expect(verifySource).toContain("t.tginitdeferred = expected.is_deferred");
    expect(migrationSource).toContain(
      'link."sourceType" <> qualification_row."sourceType"',
    );
    expect(migrationSource).toContain(
      'link."sourceRecordId" <> qualification_row."sourceRecordId"',
    );
    expect(migrationSource).toContain(
      'link."purpose" <> selection."purpose"',
    );
    expect(verifySource).toContain("md5(p.prosrc) <> expected.source_md5");
    expect(verifySource).toContain(
      "Controlled-evidence canonicalizer runtime execution boundary is unsafe",
    );
  });

  test("uses one closed disposable-only synthetic policy fixture", () => {
    expect(disposableRunnerSource).toContain(
      'suiteName === "controlled-evidence-qualification"',
    );
    expect(disposableRunnerSource).toContain(
      "d0770000-0000-4000-8000-000000000001",
    );
    expect(disposableRunnerSource).toContain(
      "d0770000-0000-4000-8000-000000000002",
    );
    expect(disposableRunnerSource).toContain(
      "d0770000-0000-4000-8000-000000000003",
    );
    expect(disposableRunnerSource).not.toContain(
      ")\n      ), event_payload AS (",
    );
    expect(disposableRunnerSource).toContain(
      "1b15749b1b236585d92f2e95bb4ede6245c3edcc3798ba880bfc3cb1e6e05004",
    );
    expect(disposableRunnerSource).toContain(
      "verifyControlledEvidenceRuntimeBoundary(runtimeUrl, suiteName)",
    );
    expect(disposableRunnerSource).toContain(
      "verifyControlledEvidenceOwnerBoundary(migratorUrl)",
    );
    expect(disposableRunnerSource).toContain(
      'event."activatedAt" = event."createdAt"',
    );
    expect(disposableRunnerSource).toContain("FOR SHARE");
    expect(disposableRunnerSource).not.toMatch(
      /CONTROLLED_EVIDENCE_(?:FIXTURE_)?(?:PATH|SQL|INPUT)/,
    );
  });
});
