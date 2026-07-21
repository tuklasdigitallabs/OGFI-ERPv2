import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const schemaSource = readFileSync(
  fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  "utf8",
);

const migrationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260721170000_controlled_evidence_storage_contract/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const policyMigrationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260721190000_controlled_evidence_policy_alignment/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("SPF-005 Hostinger-local controlled evidence database contract", () => {
  test("fails legacy company backfill closed instead of inferring scope", () => {
    expect(migrationSource).toContain(
      "orphan attachment has no company-scoped source link",
    );
    expect(migrationSource).toContain(
      "attachment resolves to multiple companies",
    );
    expect(migrationSource).toContain("uploader tenant mismatch");

    for (const linkTable of [
      "ControlledEvidenceAttachment",
      "ProjectAttachment",
      "EmployeeTrainingRecord",
      "EmployeeComplianceDocument",
    ]) {
      expect(migrationSource).toContain(`FROM \"${linkTable}\"`);
    }

    expect(migrationSource).toContain(
      '"storageEnvironment" "AttachmentStorageEnvironment" NOT NULL DEFAULT \'LEGACY_UNVERIFIED\'',
    );
    expect(migrationSource).toContain(
      '"availabilityState" "AttachmentAvailabilityState" NOT NULL DEFAULT \'QUARANTINED\'',
    );
  });

  test("enforces company scope on every existing attachment link type", () => {
    for (const constraint of [
      "ControlledEvidenceAttachment_attachment_scope_fkey",
      "ProjectAttachment_attachment_scope_fkey",
      "EmployeeTrainingRecord_attachment_scope_fkey",
      "EmployeeComplianceDocument_attachment_scope_fkey",
    ]) {
      expect(migrationSource).toContain(constraint);
    }

    expect(schemaSource).toContain(
      "fields: [attachmentId, tenantId, companyId], references: [id, tenantId, companyId]",
    );
  });

  test("requires exact-version clean verification before availability", () => {
    expect(migrationSource).toContain(
      "Attachment_available_verified_clean_chk",
    );
    expect(migrationSource).toContain(
      '"scanVerifiedObjectVersionId" = "objectVersionId"',
    );
    expect(migrationSource).toContain('"detectedChecksum" = "checksum"');
    expect(migrationSource).toContain('"uploadState" = \'VERIFIED\'');
    expect(migrationSource).toContain('"scanState" = \'CLEAN\'');
    expect(migrationSource).toContain('"physicalState" = \'DURABLE\'');
    expect(migrationSource).toContain(
      "Attachment_production_durable_verified_encrypted_chk",
    );
    expect(migrationSource).toContain(
      '"encryptionAlgorithm" = \'AES-256-GCM\'',
    );
    expect(migrationSource).toContain(
      '"physicalState" "AttachmentPhysicalState" NOT NULL DEFAULT \'LEGACY_UNVERIFIED\'',
    );
  });

  test("keeps complete scan attempts append-only and quota accounting bounded", () => {
    expect(migrationSource).toContain(
      "AttachmentScanAttempt_append_only_update_trg",
    );
    expect(migrationSource).toContain(
      "AttachmentScanAttempt_append_only_delete_trg",
    );
    expect(migrationSource).toContain('CREATE TABLE "AttachmentScanAttempt"');
    expect(migrationSource).toContain('"scannerEngineVersion" TEXT NOT NULL');
    expect(migrationSource).toContain('"signatureVersion" TEXT NOT NULL');
    expect(migrationSource).toContain('"plaintextChecksum" TEXT NOT NULL');
    expect(migrationSource).toContain(
      "AttachmentScanAttempt_attachment_exact_version_fkey",
    );
    expect(schemaSource).not.toContain("AttachmentScanSignal");
    expect(migrationSource).toContain(
      "AttachmentCompanyQuotaUsage_nonnegative_chk",
    );
    expect(migrationSource).toContain(
      '"usedBytes" + "reservedBytes" <= "quotaLimitBytes"',
    );
    expect(schemaSource).not.toContain("AttachmentTenantQuotaUsage");
  });

  test("makes upload-intent retries scoped and payload-bound", () => {
    expect(schemaSource).toContain(
      '@@unique([tenantId, companyId, idempotencyKey], map: "AttachmentUploadIntent_scope_idempotency_key")',
    );
    expect(migrationSource).toContain('"idempotencyKey" TEXT NOT NULL');
    expect(migrationSource).toContain('"requestHash" TEXT NOT NULL');
    expect(migrationSource).toContain(
      '"expectedObjectVersionId" TEXT NOT NULL',
    );
    expect(migrationSource).toContain(
      '"completedVersionId" = "expectedObjectVersionId"',
    );
    expect(migrationSource).toContain(
      "AttachmentUploadIntent_request_identity_chk",
    );
    expect(migrationSource).toContain(
      '"AttachmentUploadIntent_scope_idempotency_key"',
    );
    expect(migrationSource).toContain("'UPLOADING'");
    expect(migrationSource).toContain('"uploadLeaseOwner" TEXT');
    expect(migrationSource).toContain('"uploadLeaseExpiresAt" TIMESTAMP(3)');
    expect(migrationSource).toContain(
      "AttachmentUploadIntent_state_coherence_chk",
    );
    expect(migrationSource).toContain(
      '"AttachmentUploadIntent_status_uploadLease_idx"',
    );
    expect(schemaSource).toContain(
      "@@index([status, uploadLeaseExpiresAt]",
    );
  });

  test("separates physical purge from logical removal and blocks self replacement", () => {
    expect(migrationSource).toContain("Attachment_purge_metadata_chk");
    expect(migrationSource).toContain('"purgedByUserId" UUID');
    expect(migrationSource).toContain("Attachment_purgedBy_scope_fkey");
    expect(migrationSource).toContain('"legalHold" = false');
    expect(migrationSource).toContain("Attachment_replacement_not_self_chk");
    expect(migrationSource).toContain(
      '"replacesAttachmentId" <> "id"',
    );
  });

  test("aligns only default evidence-policy values to the Hostinger decision", () => {
    expect(policyMigrationSource).toContain(
      "WHEN setting.\"isDefault\" THEN policy.value ELSE setting.\"value\"",
    );
    expect(policyMigrationSource).toContain(
      "'storageProvider', 'environment-isolated'",
    );
    expect(policyMigrationSource).toContain(
      "'malwareScanMode', 'required_before_availability'",
    );
    expect(policyMigrationSource).toContain(
      '"sourceDecisionId" = \'DEC-0046\'',
    );
    expect(policyMigrationSource).not.toMatch(/AWS|S3|GuardDuty/i);
  });
});
