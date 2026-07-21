-- SPF-005: company-scoped Hostinger-local controlled-evidence storage contract.
-- Existing attachment bytes and object keys are preserved. Legacy rows are
-- explicitly quarantined as non-production/unverified until re-verified by the
-- controlled evidence service; this migration never infers company scope.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TYPE "AttachmentStorageEnvironment" AS ENUM (
  'LEGACY_UNVERIFIED',
  'LOCAL_DEVELOPMENT',
  'CONTROLLED_UAT',
  'STAGING',
  'PRODUCTION'
);

CREATE TYPE "AttachmentUploadState" AS ENUM (
  'LEGACY_UNVERIFIED',
  'PENDING',
  'INTENT_ISSUED',
  'UPLOADING',
  'UPLOADED',
  'VERIFIED',
  'EXPIRED',
  'FAILED'
);

CREATE TYPE "AttachmentScanState" AS ENUM (
  'LEGACY_UNVERIFIED',
  'PENDING',
  'CLEAN',
  'THREAT_FOUND',
  'UNSUPPORTED',
  'ACCESS_DENIED',
  'FAILED',
  'TIMED_OUT',
  'WAIVED_LOCAL'
);

CREATE TYPE "AttachmentAvailabilityState" AS ENUM (
  'QUARANTINED',
  'AVAILABLE',
  'REJECTED',
  'REMOVED',
  'EXPIRED'
);

CREATE TYPE "AttachmentPhysicalState" AS ENUM (
  'LEGACY_UNVERIFIED',
  'ABSENT',
  'STAGING',
  'DURABLE',
  'MISSING',
  'PURGED'
);

CREATE TYPE "AttachmentUploadIntentStatus" AS ENUM (
  'ISSUED',
  'UPLOADING',
  'CONSUMED',
  'EXPIRED',
  'INVALIDATED'
);

ALTER TABLE "Attachment"
  ADD COLUMN "companyId" UUID,
  ADD COLUMN "storageEnvironment" "AttachmentStorageEnvironment" NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
  ADD COLUMN "objectVersionId" TEXT,
  ADD COLUMN "detectedMimeType" TEXT,
  ADD COLUMN "detectedChecksum" TEXT,
  ADD COLUMN "uploadState" "AttachmentUploadState" NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
  ADD COLUMN "scanState" "AttachmentScanState" NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
  ADD COLUMN "availabilityState" "AttachmentAvailabilityState" NOT NULL DEFAULT 'QUARANTINED',
  ADD COLUMN "physicalState" "AttachmentPhysicalState" NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
  ADD COLUMN "storedChecksum" TEXT,
  ADD COLUMN "encryptionAlgorithm" TEXT,
  ADD COLUMN "encryptionKeyId" TEXT,
  ADD COLUMN "encryptedAt" TIMESTAMP(3),
  ADD COLUMN "scanVerifiedObjectVersionId" TEXT,
  ADD COLUMN "uploadIntentIssuedAt" TIMESTAMP(3),
  ADD COLUMN "uploadIntentExpiresAt" TIMESTAMP(3),
  ADD COLUMN "uploadConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "uploadVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "scanRequestedAt" TIMESTAMP(3),
  ADD COLUMN "scanCompletedAt" TIMESTAMP(3),
  ADD COLUMN "availableAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "removedAt" TIMESTAMP(3),
  ADD COLUMN "removalReason" TEXT,
  ADD COLUMN "purgedAt" TIMESTAMP(3),
  ADD COLUMN "purgeReason" TEXT,
  ADD COLUMN "purgedByUserId" UUID,
  ADD COLUMN "retentionClass" TEXT,
  ADD COLUMN "retainUntil" TIMESTAMP(3),
  ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legalHoldSetAt" TIMESTAMP(3),
  ADD COLUMN "legalHoldSetByUserId" UUID,
  ADD COLUMN "legalHoldReason" TEXT,
  ADD COLUMN "replacesAttachmentId" UUID,
  ADD COLUMN "reconciliationLeaseOwner" TEXT,
  ADD COLUMN "reconciliationLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reconciliationNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastReconciledAt" TIMESTAMP(3),
  ADD COLUMN "rowVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Fail closed if any predecessor link already crosses tenant/company scope.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ControlledEvidenceAttachment" link
    JOIN "Attachment" attachment ON attachment."id" = link."attachmentId"
    JOIN "Company" company ON company."id" = link."companyId"
    WHERE attachment."tenantId" <> link."tenantId"
       OR company."tenantId" <> link."tenantId"
  ) THEN
    RAISE EXCEPTION 'SPF-005 attachment backfill blocked: controlled-evidence tenant/company mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ProjectAttachment" link
    JOIN "Attachment" attachment ON attachment."id" = link."attachmentId"
    JOIN "Company" company ON company."id" = link."companyId"
    WHERE attachment."tenantId" <> link."tenantId"
       OR company."tenantId" <> link."tenantId"
  ) THEN
    RAISE EXCEPTION 'SPF-005 attachment backfill blocked: project-attachment tenant/company mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "EmployeeTrainingRecord" link
    JOIN "Attachment" attachment ON attachment."id" = link."attachmentId"
    JOIN "Company" company ON company."id" = link."companyId"
    WHERE link."attachmentId" IS NOT NULL
      AND (
        attachment."tenantId" <> link."tenantId"
        OR company."tenantId" <> link."tenantId"
      )
  ) THEN
    RAISE EXCEPTION 'SPF-005 attachment backfill blocked: training-certificate tenant/company mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "EmployeeComplianceDocument" link
    JOIN "Attachment" attachment ON attachment."id" = link."attachmentId"
    JOIN "Company" company ON company."id" = link."companyId"
    WHERE link."attachmentId" IS NOT NULL
      AND (
        attachment."tenantId" <> link."tenantId"
        OR company."tenantId" <> link."tenantId"
      )
  ) THEN
    RAISE EXCEPTION 'SPF-005 attachment backfill blocked: compliance-document tenant/company mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Attachment" attachment
    JOIN "User" uploader ON uploader."id" = attachment."uploadedByUserId"
    WHERE uploader."tenantId" <> attachment."tenantId"
  ) THEN
    RAISE EXCEPTION 'SPF-005 attachment backfill blocked: uploader tenant mismatch';
  END IF;
END $$;

CREATE TEMP TABLE "spf005_attachment_company_candidate" ON COMMIT DROP AS
WITH candidates AS (
  SELECT "attachmentId", "tenantId", "companyId" FROM "ControlledEvidenceAttachment"
  UNION ALL
  SELECT "attachmentId", "tenantId", "companyId" FROM "ProjectAttachment"
  UNION ALL
  SELECT "attachmentId", "tenantId", "companyId"
  FROM "EmployeeTrainingRecord"
  WHERE "attachmentId" IS NOT NULL
  UNION ALL
  SELECT "attachmentId", "tenantId", "companyId"
  FROM "EmployeeComplianceDocument"
  WHERE "attachmentId" IS NOT NULL
)
SELECT
  attachment."id" AS "attachmentId",
  attachment."tenantId",
  min(candidates."companyId"::text)::uuid AS "companyId",
  count(DISTINCT candidates."companyId") AS "companyCount"
FROM "Attachment" attachment
LEFT JOIN candidates
  ON candidates."attachmentId" = attachment."id"
 AND candidates."tenantId" = attachment."tenantId"
GROUP BY attachment."id", attachment."tenantId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "spf005_attachment_company_candidate"
    WHERE "companyCount" = 0
  ) THEN
    RAISE EXCEPTION 'SPF-005 attachment backfill blocked: orphan attachment has no company-scoped source link';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "spf005_attachment_company_candidate"
    WHERE "companyCount" <> 1
  ) THEN
    RAISE EXCEPTION 'SPF-005 attachment backfill blocked: attachment resolves to multiple companies';
  END IF;
END $$;

UPDATE "Attachment" attachment
SET
  "companyId" = candidate."companyId",
  "updatedAt" = attachment."createdAt"
FROM "spf005_attachment_company_candidate" candidate
WHERE candidate."attachmentId" = attachment."id";

ALTER TABLE "Attachment"
  ALTER COLUMN "companyId" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_size_nonnegative_chk"
    CHECK ("sizeBytes" >= 0),
  ADD CONSTRAINT "Attachment_production_size_positive_chk"
    CHECK ("storageEnvironment" <> 'PRODUCTION' OR "sizeBytes" > 0),
  ADD CONSTRAINT "Attachment_available_verified_clean_chk"
    CHECK (
      "availabilityState" <> 'AVAILABLE'
      OR (
        "physicalState" = 'DURABLE'
        AND
        "uploadState" = 'VERIFIED'
        AND "scanState" = 'CLEAN'
        AND nullif(btrim("objectVersionId"), '') IS NOT NULL
        AND "scanVerifiedObjectVersionId" = "objectVersionId"
        AND nullif(btrim("checksum"), '') IS NOT NULL
        AND "detectedChecksum" = "checksum"
        AND nullif(btrim("detectedMimeType"), '') IS NOT NULL
        AND "uploadVerifiedAt" IS NOT NULL
        AND "scanCompletedAt" IS NOT NULL
        AND "availableAt" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "Attachment_production_verified_exact_version_chk"
    CHECK (
      "storageEnvironment" <> 'PRODUCTION'
      OR "uploadState" <> 'VERIFIED'
      OR (
        nullif(btrim("objectVersionId"), '') IS NOT NULL
        AND nullif(btrim("checksum"), '') IS NOT NULL
        AND nullif(btrim("detectedChecksum"), '') IS NOT NULL
        AND nullif(btrim("detectedMimeType"), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT "Attachment_encryption_metadata_coherence_chk"
    CHECK (
      (
        "encryptionAlgorithm" IS NULL
        AND "encryptionKeyId" IS NULL
        AND "storedChecksum" IS NULL
        AND "encryptedAt" IS NULL
      )
      OR (
        nullif(btrim("encryptionAlgorithm"), '') IS NOT NULL
        AND nullif(btrim("encryptionKeyId"), '') IS NOT NULL
        AND "storedChecksum" ~ '^[a-f0-9]{64}$'
        AND "encryptedAt" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "Attachment_production_durable_verified_encrypted_chk"
    CHECK (
      "storageEnvironment" <> 'PRODUCTION'
      OR "physicalState" <> 'DURABLE'
      OR "uploadState" <> 'VERIFIED'
      OR (
        "encryptionAlgorithm" = 'AES-256-GCM'
        AND nullif(btrim("encryptionKeyId"), '') IS NOT NULL
        AND "storedChecksum" ~ '^[a-f0-9]{64}$'
        AND "encryptedAt" IS NOT NULL
        AND nullif(btrim("objectVersionId"), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT "Attachment_legal_hold_coherence_chk"
    CHECK (
      (
        "legalHold" = false
        AND "legalHoldSetAt" IS NULL
        AND "legalHoldSetByUserId" IS NULL
        AND "legalHoldReason" IS NULL
      )
      OR (
        "legalHold" = true
        AND "legalHoldSetAt" IS NOT NULL
        AND "legalHoldSetByUserId" IS NOT NULL
        AND nullif(btrim("legalHoldReason"), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT "Attachment_reconciliation_lease_coherence_chk"
    CHECK (
      ("reconciliationLeaseOwner" IS NULL AND "reconciliationLeaseExpiresAt" IS NULL)
      OR (
        nullif(btrim("reconciliationLeaseOwner"), '') IS NOT NULL
        AND "reconciliationLeaseExpiresAt" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "Attachment_reconciliation_attempt_nonnegative_chk"
    CHECK ("reconciliationAttemptCount" >= 0),
  ADD CONSTRAINT "Attachment_row_version_positive_chk"
    CHECK ("rowVersion" > 0),
  ADD CONSTRAINT "Attachment_intent_window_coherence_chk"
    CHECK (
      "uploadIntentExpiresAt" IS NULL
      OR (
        "uploadIntentIssuedAt" IS NOT NULL
        AND "uploadIntentExpiresAt" > "uploadIntentIssuedAt"
      )
    ),
  ADD CONSTRAINT "Attachment_rejected_timestamp_chk"
    CHECK ("availabilityState" <> 'REJECTED' OR "rejectedAt" IS NOT NULL),
  ADD CONSTRAINT "Attachment_removed_metadata_chk"
    CHECK (
      "availabilityState" <> 'REMOVED'
      OR (
        "removedAt" IS NOT NULL
        AND nullif(btrim("removalReason"), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT "Attachment_purge_metadata_chk"
    CHECK (
      (
        "physicalState" <> 'PURGED'
        AND "purgedAt" IS NULL
        AND "purgeReason" IS NULL
        AND "purgedByUserId" IS NULL
      )
      OR (
        "physicalState" = 'PURGED'
        AND "legalHold" = false
        AND "purgedAt" IS NOT NULL
        AND nullif(btrim("purgeReason"), '') IS NOT NULL
        AND "purgedByUserId" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "Attachment_replacement_not_self_chk"
    CHECK (
      "replacesAttachmentId" IS NULL
      OR "replacesAttachmentId" <> "id"
    );

CREATE UNIQUE INDEX "Attachment_id_tenantId_companyId_key"
  ON "Attachment"("id", "tenantId", "companyId");

CREATE UNIQUE INDEX "Attachment_replacement_scope_key"
  ON "Attachment"("replacesAttachmentId", "tenantId", "companyId");

CREATE UNIQUE INDEX "Attachment_intent_scope_key"
  ON "Attachment"(
    "id",
    "tenantId",
    "companyId",
    "storageEnvironment",
    "storageProvider",
    "objectKey"
  );

CREATE UNIQUE INDEX "Attachment_exact_version_key"
  ON "Attachment"("id", "tenantId", "companyId", "objectVersionId");

CREATE UNIQUE INDEX "Attachment_provider_environment_object_key"
  ON "Attachment"("storageProvider", "storageEnvironment", "objectKey");

CREATE INDEX "Attachment_scope_availability_created_idx"
  ON "Attachment"("tenantId", "companyId", "availabilityState", "createdAt");

CREATE INDEX "Attachment_scope_scan_retry_idx"
  ON "Attachment"("tenantId", "companyId", "scanState", "reconciliationNextAttemptAt");

CREATE INDEX "Attachment_reconcile_lease_retry_idx"
  ON "Attachment"("reconciliationLeaseExpiresAt", "reconciliationNextAttemptAt");

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Attachment_uploadedBy_scope_fkey"
    FOREIGN KEY ("uploadedByUserId", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Attachment_legalHoldSetBy_scope_fkey"
    FOREIGN KEY ("legalHoldSetByUserId", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Attachment_purgedBy_scope_fkey"
    FOREIGN KEY ("purgedByUserId", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Attachment_replacement_scope_fkey"
    FOREIGN KEY ("replacesAttachmentId", "tenantId", "companyId")
    REFERENCES "Attachment"("id", "tenantId", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace identifier-only attachment links with composite scope constraints.
ALTER TABLE "ControlledEvidenceAttachment"
  ADD CONSTRAINT "spf005_controlled_evidence_attachment_scope_fk"
  FOREIGN KEY ("attachmentId", "tenantId", "companyId")
  REFERENCES "Attachment"("id", "tenantId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ControlledEvidenceAttachment"
  VALIDATE CONSTRAINT "spf005_controlled_evidence_attachment_scope_fk";
ALTER TABLE "ControlledEvidenceAttachment"
  DROP CONSTRAINT "ControlledEvidenceAttachment_attachmentId_fkey";
ALTER TABLE "ControlledEvidenceAttachment"
  RENAME CONSTRAINT "spf005_controlled_evidence_attachment_scope_fk"
  TO "ControlledEvidenceAttachment_attachment_scope_fkey";

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "spf005_project_attachment_scope_fk"
  FOREIGN KEY ("attachmentId", "tenantId", "companyId")
  REFERENCES "Attachment"("id", "tenantId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ProjectAttachment"
  VALIDATE CONSTRAINT "spf005_project_attachment_scope_fk";
ALTER TABLE "ProjectAttachment"
  DROP CONSTRAINT "ProjectAttachment_attachmentId_fkey";
ALTER TABLE "ProjectAttachment"
  RENAME CONSTRAINT "spf005_project_attachment_scope_fk"
  TO "ProjectAttachment_attachment_scope_fkey";

ALTER TABLE "EmployeeTrainingRecord"
  ADD CONSTRAINT "spf005_training_attachment_scope_fk"
  FOREIGN KEY ("attachmentId", "tenantId", "companyId")
  REFERENCES "Attachment"("id", "tenantId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "EmployeeTrainingRecord"
  VALIDATE CONSTRAINT "spf005_training_attachment_scope_fk";
ALTER TABLE "EmployeeTrainingRecord"
  DROP CONSTRAINT "EmployeeTrainingRecord_attachmentId_fkey";
ALTER TABLE "EmployeeTrainingRecord"
  RENAME CONSTRAINT "spf005_training_attachment_scope_fk"
  TO "EmployeeTrainingRecord_attachment_scope_fkey";

ALTER TABLE "EmployeeComplianceDocument"
  ADD CONSTRAINT "spf005_compliance_attachment_scope_fk"
  FOREIGN KEY ("attachmentId", "tenantId", "companyId")
  REFERENCES "Attachment"("id", "tenantId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "EmployeeComplianceDocument"
  VALIDATE CONSTRAINT "spf005_compliance_attachment_scope_fk";
ALTER TABLE "EmployeeComplianceDocument"
  DROP CONSTRAINT "EmployeeComplianceDocument_attachmentId_fkey";
ALTER TABLE "EmployeeComplianceDocument"
  RENAME CONSTRAINT "spf005_compliance_attachment_scope_fk"
  TO "EmployeeComplianceDocument_attachment_scope_fkey";

CREATE TABLE "AttachmentUploadIntent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "attachmentId" UUID NOT NULL,
  "storageEnvironment" "AttachmentStorageEnvironment" NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "intentTokenHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "expectedMimeType" TEXT NOT NULL,
  "expectedSizeBytes" INTEGER NOT NULL,
  "expectedChecksum" TEXT,
  "expectedObjectVersionId" TEXT NOT NULL,
  "status" "AttachmentUploadIntentStatus" NOT NULL DEFAULT 'ISSUED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "uploadStartedAt" TIMESTAMP(3),
  "uploadLeaseOwner" TEXT,
  "uploadLeaseExpiresAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "invalidationReason" TEXT,
  "completedVersionId" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rowVersion" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "AttachmentUploadIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttachmentUploadIntent_size_positive_chk"
    CHECK ("expectedSizeBytes" > 0),
  CONSTRAINT "AttachmentUploadIntent_expiry_after_issue_chk"
    CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "AttachmentUploadIntent_row_version_positive_chk"
    CHECK ("rowVersion" > 0),
  CONSTRAINT "AttachmentUploadIntent_request_identity_chk"
    CHECK (
      "intentTokenHash" ~ '^[a-f0-9]{64}$'
      AND length(btrim("idempotencyKey")) BETWEEN 1 AND 200
      AND "requestHash" ~ '^[a-f0-9]{64}$'
      AND nullif(btrim("expectedMimeType"), '') IS NOT NULL
      AND nullif(btrim("expectedObjectVersionId"), '') IS NOT NULL
    ),
  CONSTRAINT "AttachmentUploadIntent_state_coherence_chk"
    CHECK (
      (
        "status" = 'ISSUED'
        AND "uploadStartedAt" IS NULL
        AND "uploadLeaseOwner" IS NULL
        AND "uploadLeaseExpiresAt" IS NULL
        AND "consumedAt" IS NULL
        AND "invalidatedAt" IS NULL
      )
      OR (
        "status" = 'UPLOADING'
        AND "uploadStartedAt" IS NOT NULL
        AND nullif(btrim("uploadLeaseOwner"), '') IS NOT NULL
        AND "uploadLeaseExpiresAt" > "uploadStartedAt"
        AND "consumedAt" IS NULL
        AND "invalidatedAt" IS NULL
      )
      OR (
        "status" = 'CONSUMED'
        AND "consumedAt" IS NOT NULL
        AND "invalidatedAt" IS NULL
        AND "uploadLeaseOwner" IS NULL
        AND "uploadLeaseExpiresAt" IS NULL
        AND nullif(btrim("completedVersionId"), '') IS NOT NULL
        AND "completedVersionId" = "expectedObjectVersionId"
      )
      OR (
        "status" = 'EXPIRED'
        AND "uploadLeaseOwner" IS NULL
        AND "uploadLeaseExpiresAt" IS NULL
        AND "consumedAt" IS NULL
      )
      OR (
        "status" = 'INVALIDATED'
        AND "uploadLeaseOwner" IS NULL
        AND "uploadLeaseExpiresAt" IS NULL
        AND "consumedAt" IS NULL
        AND "invalidatedAt" IS NOT NULL
        AND nullif(btrim("invalidationReason"), '') IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "AttachmentUploadIntent_intentTokenHash_key"
  ON "AttachmentUploadIntent"("intentTokenHash");
CREATE UNIQUE INDEX "AttachmentUploadIntent_scope_idempotency_key"
  ON "AttachmentUploadIntent"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "AttachmentUploadIntent_one_issued_per_attachment_idx"
  ON "AttachmentUploadIntent"("attachmentId")
  WHERE "status" = 'ISSUED';
CREATE INDEX "AttachmentUploadIntent_scope_status_expiry_idx"
  ON "AttachmentUploadIntent"("tenantId", "companyId", "status", "expiresAt");
CREATE INDEX "AttachmentUploadIntent_status_uploadLease_idx"
  ON "AttachmentUploadIntent"("status", "uploadLeaseExpiresAt");
CREATE INDEX "AttachmentUploadIntent_attachment_status_created_idx"
  ON "AttachmentUploadIntent"("attachmentId", "status", "createdAt");
CREATE INDEX "AttachmentUploadIntent_scope_creator_created_idx"
  ON "AttachmentUploadIntent"("tenantId", "companyId", "createdByUserId", "createdAt");
CREATE INDEX "AttachmentUploadIntent_scope_created_idx"
  ON "AttachmentUploadIntent"("tenantId", "companyId", "createdAt");

ALTER TABLE "AttachmentUploadIntent"
  ADD CONSTRAINT "AttachmentUploadIntent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttachmentUploadIntent_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttachmentUploadIntent_attachment_exact_key_fkey"
    FOREIGN KEY (
      "attachmentId",
      "tenantId",
      "companyId",
      "storageEnvironment",
      "storageProvider",
      "objectKey"
    ) REFERENCES "Attachment"(
      "id",
      "tenantId",
      "companyId",
      "storageEnvironment",
      "storageProvider",
      "objectKey"
    ) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttachmentUploadIntent_createdBy_scope_fkey"
    FOREIGN KEY ("createdByUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AttachmentScanAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "attachmentId" UUID NOT NULL,
  "objectVersionId" TEXT NOT NULL,
  "scanProvider" TEXT NOT NULL,
  "scannerEngineVersion" TEXT NOT NULL,
  "signatureVersion" TEXT NOT NULL,
  "signaturePublishedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "result" "AttachmentScanState" NOT NULL,
  "safeFailureCode" TEXT,
  "plaintextChecksum" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttachmentScanAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttachmentScanAttempt_identity_chk"
    CHECK (
      nullif(btrim("objectVersionId"), '') IS NOT NULL
      AND nullif(btrim("scanProvider"), '') IS NOT NULL
      AND nullif(btrim("scannerEngineVersion"), '') IS NOT NULL
      AND nullif(btrim("signatureVersion"), '') IS NOT NULL
      AND "plaintextChecksum" ~ '^[a-f0-9]{64}$'
    ),
  CONSTRAINT "AttachmentScanAttempt_time_order_chk"
    CHECK ("completedAt" >= "startedAt"),
  CONSTRAINT "AttachmentScanAttempt_terminal_result_chk"
    CHECK (
      "result" IN (
        'CLEAN',
        'THREAT_FOUND',
        'UNSUPPORTED',
        'ACCESS_DENIED',
        'FAILED',
        'TIMED_OUT'
      )
    )
);

CREATE INDEX "AttachmentScanAttempt_scope_attachment_completed_idx"
  ON "AttachmentScanAttempt"("tenantId", "companyId", "attachmentId", "completedAt");
CREATE INDEX "AttachmentScanAttempt_result_completed_idx"
  ON "AttachmentScanAttempt"("result", "completedAt");

ALTER TABLE "AttachmentScanAttempt"
  ADD CONSTRAINT "AttachmentScanAttempt_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttachmentScanAttempt_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttachmentScanAttempt_attachment_exact_version_fkey"
    FOREIGN KEY ("attachmentId", "tenantId", "companyId", "objectVersionId")
    REFERENCES "Attachment"("id", "tenantId", "companyId", "objectVersionId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "spf005_reject_attachment_scan_attempt_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AttachmentScanAttempt is append-only';
END;
$$;

CREATE TRIGGER "AttachmentScanAttempt_append_only_update_trg"
BEFORE UPDATE ON "AttachmentScanAttempt"
FOR EACH ROW EXECUTE FUNCTION "spf005_reject_attachment_scan_attempt_mutation"();

CREATE TRIGGER "AttachmentScanAttempt_append_only_delete_trg"
BEFORE DELETE ON "AttachmentScanAttempt"
FOR EACH ROW EXECUTE FUNCTION "spf005_reject_attachment_scan_attempt_mutation"();

CREATE TABLE "AttachmentCompanyQuotaUsage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "storageEnvironment" "AttachmentStorageEnvironment" NOT NULL,
  "quotaLimitBytes" BIGINT,
  "usedBytes" BIGINT NOT NULL DEFAULT 0,
  "reservedBytes" BIGINT NOT NULL DEFAULT 0,
  "rowVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttachmentCompanyQuotaUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttachmentCompanyQuotaUsage_nonnegative_chk"
    CHECK (
      "usedBytes" >= 0
      AND "reservedBytes" >= 0
      AND ("quotaLimitBytes" IS NULL OR "quotaLimitBytes" >= 0)
    ),
  CONSTRAINT "AttachmentCompanyQuotaUsage_cap_chk"
    CHECK (
      "quotaLimitBytes" IS NULL
      OR "usedBytes" + "reservedBytes" <= "quotaLimitBytes"
    ),
  CONSTRAINT "AttachmentCompanyQuotaUsage_row_version_positive_chk"
    CHECK ("rowVersion" > 0)
);

CREATE UNIQUE INDEX "AttachmentCompanyQuotaUsage_scope_environment_key"
  ON "AttachmentCompanyQuotaUsage"("tenantId", "companyId", "storageEnvironment");
CREATE INDEX "AttachmentCompanyQuotaUsage_environment_updated_idx"
  ON "AttachmentCompanyQuotaUsage"("storageEnvironment", "updatedAt");

ALTER TABLE "AttachmentCompanyQuotaUsage"
  ADD CONSTRAINT "AttachmentCompanyQuotaUsage_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttachmentCompanyQuotaUsage_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AttachmentCompanyQuotaUsage" (
  "tenantId",
  "companyId",
  "storageEnvironment",
  "usedBytes",
  "reservedBytes",
  "rowVersion",
  "updatedAt"
)
SELECT
  "tenantId",
  "companyId",
  "storageEnvironment",
  sum("sizeBytes")::bigint,
  0,
  1,
  CURRENT_TIMESTAMP
FROM "Attachment"
GROUP BY "tenantId", "companyId", "storageEnvironment";

COMMIT;
