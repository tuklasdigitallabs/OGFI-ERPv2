-- DEC-0077 dormant controlled-evidence qualification foundation.
-- This migration is additive and intentionally creates no policy, activation,
-- adapter, qualification, or selection rows.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

-- Close the remaining identifier-only scope paths on the controlled link that
-- immutable selections reference. Validation is fail-closed and rewrites no row.
ALTER TABLE "ControlledEvidenceAttachment"
  ADD CONSTRAINT "dec0077_controlled_link_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "dec0077_controlled_link_creator_scope_fkey"
    FOREIGN KEY ("createdByUserId", "tenantId") REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "dec0077_controlled_link_archiver_scope_fkey"
    FOREIGN KEY ("archivedByUserId", "tenantId") REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ControlledEvidenceAttachment"
  VALIDATE CONSTRAINT "dec0077_controlled_link_company_scope_fkey";
ALTER TABLE "ControlledEvidenceAttachment"
  VALIDATE CONSTRAINT "dec0077_controlled_link_creator_scope_fkey";
ALTER TABLE "ControlledEvidenceAttachment"
  VALIDATE CONSTRAINT "dec0077_controlled_link_archiver_scope_fkey";
ALTER TABLE "ControlledEvidenceAttachment"
  DROP CONSTRAINT "ControlledEvidenceAttachment_companyId_fkey",
  DROP CONSTRAINT "ControlledEvidenceAttachment_createdByUserId_fkey",
  DROP CONSTRAINT "ControlledEvidenceAttachment_archivedByUserId_fkey";
ALTER TABLE "ControlledEvidenceAttachment"
  RENAME CONSTRAINT "dec0077_controlled_link_company_scope_fkey"
    TO "ControlledEvidenceAttachment_company_scope_fkey";
ALTER TABLE "ControlledEvidenceAttachment"
  RENAME CONSTRAINT "dec0077_controlled_link_creator_scope_fkey"
    TO "ControlledEvidenceAttachment_creator_scope_fkey";
ALTER TABLE "ControlledEvidenceAttachment"
  RENAME CONSTRAINT "dec0077_controlled_link_archiver_scope_fkey"
    TO "ControlledEvidenceAttachment_archiver_scope_fkey";

CREATE UNIQUE INDEX "AuthSession_scope_user_key"
  ON "AuthSession"("id", "tenantId", "userId");
CREATE UNIQUE INDEX "ApprovalInstance_scope_key"
  ON "ApprovalInstance"("id", "tenantId", "companyId");
CREATE UNIQUE INDEX "ApprovalInstanceStep_instance_key"
  ON "ApprovalInstanceStep"("id", "approvalInstanceId");
CREATE UNIQUE INDEX "AttachmentScanAttempt_exact_scope_key"
  ON "AttachmentScanAttempt"("id", "tenantId", "companyId", "attachmentId", "objectVersionId");
CREATE UNIQUE INDEX "ControlledEvidenceAttachment_exact_scope_key"
  ON "ControlledEvidenceAttachment"("id", "tenantId", "companyId", "attachmentId");

-- Replace the older owner-bypassable row guards with one unconditional
-- statement guard that also closes TRUNCATE.
DROP TRIGGER "AttachmentScanAttempt_append_only_update_trg" ON "AttachmentScanAttempt";
DROP TRIGGER "AttachmentScanAttempt_append_only_delete_trg" ON "AttachmentScanAttempt";
DROP FUNCTION "spf005_reject_attachment_scan_attempt_mutation"();

CREATE OR REPLACE FUNCTION "controlled_evidence_canonical_json"(payload JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $function$
DECLARE
  result TEXT;
BEGIN
  CASE jsonb_typeof(payload)
    WHEN 'object' THEN
      SELECT '{' || coalesce(
        string_agg(to_jsonb(entry.key)::text || ':' || public."controlled_evidence_canonical_json"(entry.value), ',' ORDER BY entry.key),
        ''
      ) || '}'
        INTO result
        FROM jsonb_each(payload) AS entry(key, value);
    WHEN 'array' THEN
      SELECT '[' || coalesce(
        string_agg(public."controlled_evidence_canonical_json"(entry.value), ',' ORDER BY entry.ordinality),
        ''
      ) || ']'
        INTO result
        FROM jsonb_array_elements(payload) WITH ORDINALITY AS entry(value, ordinality);
    ELSE
      result := payload::text;
  END CASE;
  RETURN result;
END;
$function$;

CREATE TABLE "ControlledEvidencePolicyVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "actionCode" VARCHAR(120) NOT NULL,
  "version" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "policy" JSONB NOT NULL,
  "canonicalJson" TEXT NOT NULL,
  "configHash" CHAR(64) NOT NULL,
  "provenance" JSONB NOT NULL,
  "sourceDecisionId" VARCHAR(40) NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ControlledEvidencePolicyVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ControlledEvidencePolicyVersion_identity_chk" CHECK (
    length(btrim("actionCode")) BETWEEN 1 AND 120
    AND "version" > 0
    AND "schemaVersion" > 0
    AND length(btrim("sourceDecisionId")) BETWEEN 1 AND 40
  ),
  CONSTRAINT "ControlledEvidencePolicyVersion_payload_chk" CHECK (
    jsonb_typeof("policy") = 'object'
    AND jsonb_typeof("provenance") = 'object'
    AND nullif(btrim("canonicalJson"), '') IS NOT NULL
    AND "canonicalJson"::jsonb = "policy"
    AND "configHash" ~ '^[a-f0-9]{64}$'
    AND "canonicalJson" = public."controlled_evidence_canonical_json"("policy")
    AND encode(digest("canonicalJson", 'sha256'), 'hex') = "configHash"
  )
);

CREATE UNIQUE INDEX "ControlledEvidencePolicyVersion_scope_action_version_key"
  ON "ControlledEvidencePolicyVersion"("tenantId", "companyId", "actionCode", "version");
CREATE UNIQUE INDEX "ControlledEvidencePolicyVersion_exact_scope_key"
  ON "ControlledEvidencePolicyVersion"("id", "tenantId", "companyId", "actionCode", "version");
CREATE INDEX "ControlledEvidencePolicyVersion_scope_action_created_idx"
  ON "ControlledEvidencePolicyVersion"("tenantId", "companyId", "actionCode", "createdAt");

ALTER TABLE "ControlledEvidencePolicyVersion"
  ADD CONSTRAINT "ControlledEvidencePolicyVersion_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidencePolicyVersion_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidencePolicyVersion_creator_scope_fkey"
    FOREIGN KEY ("createdByUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ControlledEvidencePolicyActivationEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "actionCode" VARCHAR(120) NOT NULL,
  "policyVersionId" UUID NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "priorActivationEventId" UUID,
  "pointerVersion" INTEGER NOT NULL,
  "activatedByUserId" UUID NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL,
  "activationReason" TEXT NOT NULL,
  "provenance" JSONB NOT NULL,
  "canonicalJson" TEXT NOT NULL,
  "activationHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ControlledEvidencePolicyActivationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ControlledEvidencePolicyActivationEvent_identity_chk" CHECK (
    length(btrim("actionCode")) BETWEEN 1 AND 120
    AND "policyVersion" > 0
    AND "pointerVersion" > 0
    AND nullif(btrim("activationReason"), '') IS NOT NULL
  ),
  CONSTRAINT "ControlledEvidencePolicyActivationEvent_chain_chk" CHECK (
    ("pointerVersion" = 1 AND "priorActivationEventId" IS NULL)
    OR ("pointerVersion" > 1 AND "priorActivationEventId" IS NOT NULL)
  ),
  CONSTRAINT "ControlledEvidencePolicyActivationEvent_payload_chk" CHECK (
    jsonb_typeof("provenance") = 'object'
    AND nullif(btrim("canonicalJson"), '') IS NOT NULL
    AND jsonb_typeof("canonicalJson"::jsonb) = 'object'
    AND "activationHash" ~ '^[a-f0-9]{64}$'
    AND encode(digest("canonicalJson", 'sha256'), 'hex') = "activationHash"
  )
);

CREATE UNIQUE INDEX "ControlledEvidencePolicyActivationEvent_scope_version_key"
  ON "ControlledEvidencePolicyActivationEvent"("tenantId", "companyId", "actionCode", "pointerVersion");
CREATE UNIQUE INDEX "ControlledEvidencePolicyActivationEvent_exact_scope_key"
  ON "ControlledEvidencePolicyActivationEvent"("id", "tenantId", "companyId", "actionCode");
CREATE UNIQUE INDEX "ControlledEvidencePolicyActivationEvent_pointer_exact_key"
  ON "ControlledEvidencePolicyActivationEvent"("id", "tenantId", "companyId", "actionCode", "pointerVersion");
CREATE INDEX "ControlledEvidencePolicyActivationEvent_scope_activated_idx"
  ON "ControlledEvidencePolicyActivationEvent"("tenantId", "companyId", "actionCode", "activatedAt");

ALTER TABLE "ControlledEvidencePolicyActivationEvent"
  ADD CONSTRAINT "ControlledEvidencePolicyActivationEvent_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidencePolicyActivationEvent_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidencePolicyActivationEvent_policy_exact_fkey"
    FOREIGN KEY ("policyVersionId", "tenantId", "companyId", "actionCode", "policyVersion")
    REFERENCES "ControlledEvidencePolicyVersion"("id", "tenantId", "companyId", "actionCode", "version")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidencePolicyActivationEvent_prior_exact_fkey"
    FOREIGN KEY ("priorActivationEventId", "tenantId", "companyId", "actionCode")
    REFERENCES "ControlledEvidencePolicyActivationEvent"("id", "tenantId", "companyId", "actionCode")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidencePolicyActivationEvent_actor_scope_fkey"
    FOREIGN KEY ("activatedByUserId", "tenantId") REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ControlledEvidencePolicyActivation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "actionCode" VARCHAR(120) NOT NULL,
  "activeActivationEventId" UUID NOT NULL,
  "pointerVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ControlledEvidencePolicyActivation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ControlledEvidencePolicyActivation_identity_chk" CHECK (
    length(btrim("actionCode")) BETWEEN 1 AND 120
    AND "pointerVersion" > 0
  )
);

CREATE UNIQUE INDEX "ControlledEvidencePolicyActivation_scope_action_key"
  ON "ControlledEvidencePolicyActivation"("tenantId", "companyId", "actionCode");
CREATE UNIQUE INDEX "ControlledEvidencePolicyActivation_exact_scope_key"
  ON "ControlledEvidencePolicyActivation"("id", "tenantId", "companyId", "actionCode");
CREATE INDEX "ControlledEvidencePolicyActivation_scope_updated_idx"
  ON "ControlledEvidencePolicyActivation"("tenantId", "companyId", "updatedAt");

ALTER TABLE "ControlledEvidencePolicyActivation"
  ADD CONSTRAINT "ControlledEvidencePolicyActivation_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidencePolicyActivation_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidencePolicyActivation_active_event_exact_fkey"
    FOREIGN KEY ("activeActivationEventId", "tenantId", "companyId", "actionCode", "pointerVersion")
    REFERENCES "ControlledEvidencePolicyActivationEvent"("id", "tenantId", "companyId", "actionCode", "pointerVersion")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ControlledEvidenceActionQualification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "actionCode" VARCHAR(120) NOT NULL,
  "actionSchemaVersion" INTEGER NOT NULL,
  "sourceType" VARCHAR(120) NOT NULL,
  "sourceRecordId" UUID NOT NULL,
  "sourceLineId" UUID,
  "sourceVersion" VARCHAR(120) NOT NULL,
  "executionKey" VARCHAR(200) NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "executionCanonicalJson" TEXT NOT NULL,
  "executionHash" CHAR(64) NOT NULL,
  "policyActivationId" UUID NOT NULL,
  "policyActivationPointerId" UUID NOT NULL,
  "policyPointerVersion" INTEGER NOT NULL,
  "policyActivatedByUserId" UUID NOT NULL,
  "policyActivatedAt" TIMESTAMP(3) NOT NULL,
  "policyActivationReason" TEXT NOT NULL,
  "priorPolicyVersionId" UUID,
  "priorPolicyVersion" INTEGER,
  "policyVersionId" UUID NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "policySchemaVersion" INTEGER NOT NULL,
  "policySnapshot" JSONB NOT NULL,
  "policyCanonicalJson" TEXT NOT NULL,
  "policyConfigHash" CHAR(64) NOT NULL,
  "selectionHash" CHAR(64) NOT NULL,
  "selectionCount" INTEGER NOT NULL,
  "actorUserId" UUID NOT NULL,
  "actorAuthSessionId" UUID,
  "actorPrivilegeEpoch" INTEGER NOT NULL,
  "approvalInstanceId" UUID,
  "approvalInstanceStepId" UUID,
  "provenance" JSONB NOT NULL,
  "qualifiedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ControlledEvidenceActionQualification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ControlledEvidenceActionQualification_identity_chk" CHECK (
    length(btrim("actionCode")) BETWEEN 1 AND 120
    AND "actionSchemaVersion" > 0
    AND length(btrim("sourceType")) BETWEEN 1 AND 120
    AND length(btrim("sourceVersion")) BETWEEN 1 AND 120
    AND length(btrim("executionKey")) BETWEEN 1 AND 200
    AND length(btrim("idempotencyKey")) BETWEEN 1 AND 200
    AND "policyPointerVersion" > 0
    AND "policyVersion" > 0
    AND "policySchemaVersion" > 0
    AND "selectionCount" > 0
    AND "actorPrivilegeEpoch" >= 0
    AND nullif(btrim("policyActivationReason"), '') IS NOT NULL
  ),
  CONSTRAINT "ControlledEvidenceActionQualification_hashes_chk" CHECK (
    "executionHash" ~ '^[a-f0-9]{64}$'
    AND "policyConfigHash" ~ '^[a-f0-9]{64}$'
    AND "selectionHash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ControlledEvidenceActionQualification_payload_chk" CHECK (
    nullif(btrim("executionCanonicalJson"), '') IS NOT NULL
    AND jsonb_typeof("executionCanonicalJson"::jsonb) = 'object'
    AND "executionCanonicalJson" = public."controlled_evidence_canonical_json"("executionCanonicalJson"::jsonb)
    AND encode(digest("executionCanonicalJson", 'sha256'), 'hex') = "executionHash"
    AND "idempotencyKey" = 'controlled-evidence-qualification:v1:' || "executionHash"
    AND jsonb_typeof("policySnapshot") = 'object'
    AND nullif(btrim("policyCanonicalJson"), '') IS NOT NULL
    AND "policyCanonicalJson"::jsonb = "policySnapshot"
    AND "policyCanonicalJson" = public."controlled_evidence_canonical_json"("policySnapshot")
    AND encode(digest("policyCanonicalJson", 'sha256'), 'hex') = "policyConfigHash"
    AND jsonb_typeof("provenance") = 'object'
  ),
  CONSTRAINT "ControlledEvidenceActionQualification_prior_pair_chk" CHECK (
    ("priorPolicyVersionId" IS NULL) = ("priorPolicyVersion" IS NULL)
    AND ("priorPolicyVersion" IS NULL OR "priorPolicyVersion" > 0)
  ),
  CONSTRAINT "ControlledEvidenceActionQualification_approval_pair_chk" CHECK (
    ("approvalInstanceId" IS NULL) = ("approvalInstanceStepId" IS NULL)
  )
);

CREATE UNIQUE INDEX "ControlledEvidenceActionQualification_execution_key"
  ON "ControlledEvidenceActionQualification"("tenantId", "companyId", "actionCode", "executionKey");
CREATE UNIQUE INDEX "ControlledEvidenceActionQualification_idempotency_key"
  ON "ControlledEvidenceActionQualification"("tenantId", "companyId", "actionCode", "idempotencyKey");
CREATE UNIQUE INDEX "ControlledEvidenceActionQualification_exact_scope_key"
  ON "ControlledEvidenceActionQualification"("id", "tenantId", "companyId");
CREATE INDEX "ControlledEvidenceActionQualification_source_idx"
  ON "ControlledEvidenceActionQualification"("tenantId", "companyId", "sourceType", "sourceRecordId", "sourceLineId", "qualifiedAt");
CREATE INDEX "ControlledEvidenceActionQualification_action_idx"
  ON "ControlledEvidenceActionQualification"("tenantId", "companyId", "actionCode", "qualifiedAt");
CREATE INDEX "ControlledEvidenceActionQualification_actor_idx"
  ON "ControlledEvidenceActionQualification"("actorUserId", "qualifiedAt");
CREATE INDEX "ControlledEvidenceActionQualification_approval_idx"
  ON "ControlledEvidenceActionQualification"("approvalInstanceId", "approvalInstanceStepId");

ALTER TABLE "ControlledEvidenceActionQualification"
  ADD CONSTRAINT "ControlledEvidenceActionQualification_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_event_exact_fkey"
    FOREIGN KEY ("policyActivationId", "tenantId", "companyId", "actionCode", "policyPointerVersion")
    REFERENCES "ControlledEvidencePolicyActivationEvent"("id", "tenantId", "companyId", "actionCode", "pointerVersion")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_pointer_scope_fkey"
    FOREIGN KEY ("policyActivationPointerId", "tenantId", "companyId", "actionCode")
    REFERENCES "ControlledEvidencePolicyActivation"("id", "tenantId", "companyId", "actionCode")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_policy_exact_fkey"
    FOREIGN KEY ("policyVersionId", "tenantId", "companyId", "actionCode", "policyVersion")
    REFERENCES "ControlledEvidencePolicyVersion"("id", "tenantId", "companyId", "actionCode", "version")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_prior_policy_fkey"
    FOREIGN KEY ("priorPolicyVersionId", "tenantId", "companyId", "actionCode", "priorPolicyVersion")
    REFERENCES "ControlledEvidencePolicyVersion"("id", "tenantId", "companyId", "actionCode", "version")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_actor_scope_fkey"
    FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_policy_actor_fkey"
    FOREIGN KEY ("policyActivatedByUserId", "tenantId") REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_auth_session_scope_fkey"
    FOREIGN KEY ("actorAuthSessionId", "tenantId", "actorUserId")
    REFERENCES "AuthSession"("id", "tenantId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_approval_scope_fkey"
    FOREIGN KEY ("approvalInstanceId", "tenantId", "companyId")
    REFERENCES "ApprovalInstance"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionQualification_approval_step_fkey"
    FOREIGN KEY ("approvalInstanceStepId", "approvalInstanceId")
    REFERENCES "ApprovalInstanceStep"("id", "approvalInstanceId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ControlledEvidenceActionSelection" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "qualificationId" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "controlledEvidenceAttachmentId" UUID NOT NULL,
  "attachmentId" UUID NOT NULL,
  "sourceLineId" UUID,
  "purpose" VARCHAR(120) NOT NULL,
  "controlledEvidenceLinkStatus" "RecordStatus" NOT NULL,
  "controlledEvidenceLinkUpdatedAt" TIMESTAMP(3) NOT NULL,
  "controlledEvidenceLinkArchivedAt" TIMESTAMP(3),
  "objectVersionId" TEXT NOT NULL,
  "attachmentRowVersion" INTEGER NOT NULL,
  "attachmentStatus" "RecordStatus" NOT NULL,
  "scanVerifiedObjectVersionId" TEXT NOT NULL,
  "replacementAttachmentId" UUID,
  "attachmentChecksum" CHAR(64) NOT NULL,
  "attachmentDetectedChecksum" CHAR(64) NOT NULL,
  "attachmentStoredChecksum" CHAR(64) NOT NULL,
  "uploadState" "AttachmentUploadState" NOT NULL,
  "scanState" "AttachmentScanState" NOT NULL,
  "availabilityState" "AttachmentAvailabilityState" NOT NULL,
  "physicalState" "AttachmentPhysicalState" NOT NULL,
  "scanAttemptId" UUID NOT NULL,
  "scanResult" "AttachmentScanState" NOT NULL,
  "scanCompletedAt" TIMESTAMP(3) NOT NULL,
  "scanProvider" TEXT NOT NULL,
  "scannerEngineVersion" TEXT NOT NULL,
  "scanSignatureVersion" TEXT NOT NULL,
  "scanPlaintextChecksum" CHAR(64) NOT NULL,
  "selectionCanonicalJson" TEXT NOT NULL,
  "selectionHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ControlledEvidenceActionSelection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ControlledEvidenceActionSelection_identity_chk" CHECK (
    "ordinal" > 0
    AND length(btrim("purpose")) BETWEEN 1 AND 120
    AND nullif(btrim("objectVersionId"), '') IS NOT NULL
    AND "attachmentRowVersion" > 0
    AND nullif(btrim("scanVerifiedObjectVersionId"), '') IS NOT NULL
    AND nullif(btrim("scanProvider"), '') IS NOT NULL
    AND nullif(btrim("scannerEngineVersion"), '') IS NOT NULL
    AND nullif(btrim("scanSignatureVersion"), '') IS NOT NULL
  ),
  CONSTRAINT "ControlledEvidenceActionSelection_hashes_chk" CHECK (
    "attachmentChecksum" ~ '^[a-f0-9]{64}$'
    AND "attachmentDetectedChecksum" = "attachmentChecksum"
    AND "attachmentStoredChecksum" ~ '^[a-f0-9]{64}$'
    AND "scanPlaintextChecksum" = "attachmentChecksum"
    AND "selectionHash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ControlledEvidenceActionSelection_readiness_chk" CHECK (
    "controlledEvidenceLinkStatus" = 'ACTIVE'
    AND "controlledEvidenceLinkArchivedAt" IS NULL
    AND "attachmentStatus" = 'ACTIVE'
    AND "scanVerifiedObjectVersionId" = "objectVersionId"
    AND "replacementAttachmentId" IS NULL
    AND "uploadState" = 'VERIFIED'
    AND "scanState" = 'CLEAN'
    AND "availabilityState" = 'AVAILABLE'
    AND "physicalState" = 'DURABLE'
    AND "scanResult" = 'CLEAN'
  ),
  CONSTRAINT "ControlledEvidenceActionSelection_payload_chk" CHECK (
    nullif(btrim("selectionCanonicalJson"), '') IS NOT NULL
    AND jsonb_typeof("selectionCanonicalJson"::jsonb) = 'object'
    AND "selectionCanonicalJson" = public."controlled_evidence_canonical_json"("selectionCanonicalJson"::jsonb)
    AND encode(digest("selectionCanonicalJson", 'sha256'), 'hex') = "selectionHash"
  )
);

CREATE UNIQUE INDEX "ControlledEvidenceActionSelection_qualification_ordinal_key"
  ON "ControlledEvidenceActionSelection"("qualificationId", "ordinal");
CREATE UNIQUE INDEX "ControlledEvidenceActionSelection_qualification_link_key"
  ON "ControlledEvidenceActionSelection"("qualificationId", "controlledEvidenceAttachmentId");
CREATE INDEX "ControlledEvidenceActionSelection_attachment_idx"
  ON "ControlledEvidenceActionSelection"("tenantId", "companyId", "attachmentId", "objectVersionId");
CREATE INDEX "ControlledEvidenceActionSelection_scan_idx"
  ON "ControlledEvidenceActionSelection"("tenantId", "companyId", "scanAttemptId");

ALTER TABLE "ControlledEvidenceActionSelection"
  ADD CONSTRAINT "ControlledEvidenceActionSelection_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionSelection_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionSelection_qualification_scope_fkey"
    FOREIGN KEY ("qualificationId", "tenantId", "companyId")
    REFERENCES "ControlledEvidenceActionQualification"("id", "tenantId", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionSelection_link_exact_fkey"
    FOREIGN KEY ("controlledEvidenceAttachmentId", "tenantId", "companyId", "attachmentId")
    REFERENCES "ControlledEvidenceAttachment"("id", "tenantId", "companyId", "attachmentId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionSelection_attachment_exact_version_fkey"
    FOREIGN KEY ("attachmentId", "tenantId", "companyId", "objectVersionId")
    REFERENCES "Attachment"("id", "tenantId", "companyId", "objectVersionId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledEvidenceActionSelection_scan_exact_version_fkey"
    FOREIGN KEY ("scanAttemptId", "tenantId", "companyId", "attachmentId", "objectVersionId")
    REFERENCES "AttachmentScanAttempt"("id", "tenantId", "companyId", "attachmentId", "objectVersionId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "reject_controlled_evidence_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%s is append-only; %s is prohibited', TG_TABLE_NAME, TG_OP);
END;
$function$;

CREATE OR REPLACE FUNCTION "validate_controlled_evidence_policy_version"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  requirement_count INTEGER;
BEGIN
  NEW."createdAt" := date_trunc('milliseconds', transaction_timestamp());
  IF NEW."policy" <> jsonb_build_object(
       'schemaVersion', NEW."schemaVersion",
       'sourceType', NEW."policy"->'sourceType',
       'purposeRequirements', NEW."policy"->'purposeRequirements'
     )
     OR NEW."schemaVersion" <> 1
     OR jsonb_typeof(NEW."policy"->'sourceType') <> 'string'
     OR NEW."policy"->>'sourceType' !~ '^[A-Za-z][A-Za-z0-9_.:-]{0,119}$'
     OR jsonb_typeof(NEW."policy"->'purposeRequirements') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_POLICY_SCHEMA_INVALID';
  END IF;

  SELECT count(*) INTO requirement_count
    FROM jsonb_array_elements(NEW."policy"->'purposeRequirements') requirement
   WHERE requirement = jsonb_build_object(
       'purpose', requirement->'purpose',
       'minimumCount', requirement->'minimumCount',
       'maximumCount', requirement->'maximumCount'
     )
     AND jsonb_typeof(requirement->'purpose') = 'string'
     AND requirement->>'purpose' ~ '^[A-Za-z][A-Za-z0-9_.:-]{0,119}$'
     AND jsonb_typeof(requirement->'minimumCount') = 'number'
     AND jsonb_typeof(requirement->'maximumCount') = 'number'
     AND CASE
       WHEN requirement->>'minimumCount' ~ '^[0-9]{1,9}$'
        AND requirement->>'maximumCount' ~ '^[0-9]{1,9}$'
       THEN (requirement->>'minimumCount')::integer <= (requirement->>'maximumCount')::integer
        AND (requirement->>'maximumCount')::integer > 0
       ELSE false
     END;
  IF requirement_count = 0
     OR requirement_count <> jsonb_array_length(NEW."policy"->'purposeRequirements')
     OR requirement_count <> (
       SELECT count(DISTINCT requirement->>'purpose')
         FROM jsonb_array_elements(NEW."policy"->'purposeRequirements') requirement
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_POLICY_REQUIREMENTS_INVALID';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION "validate_controlled_evidence_activation_event_lineage"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  prior_version INTEGER;
  expected_payload JSONB;
BEGIN
  NEW."activatedAt" := date_trunc('milliseconds', transaction_timestamp());
  NEW."createdAt" := NEW."activatedAt";
  IF NEW."pointerVersion" > 1 THEN
    SELECT "pointerVersion" INTO STRICT prior_version
      FROM "ControlledEvidencePolicyActivationEvent"
     WHERE "id" = NEW."priorActivationEventId"
       AND "tenantId" = NEW."tenantId" AND "companyId" = NEW."companyId"
       AND "actionCode" = NEW."actionCode";
    IF prior_version <> NEW."pointerVersion" - 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_ACTIVATION_CHAIN_INVALID';
    END IF;
  END IF;
  expected_payload := jsonb_build_object(
    'schemaVersion', 1, 'tenantId', NEW."tenantId"::text,
    'companyId', NEW."companyId"::text, 'actionCode', NEW."actionCode",
    'pointerVersion', NEW."pointerVersion", 'policyVersionId', NEW."policyVersionId"::text,
    'policyVersion', NEW."policyVersion", 'priorActivationEventId', NEW."priorActivationEventId"::text,
    'activatedByUserId', NEW."activatedByUserId"::text,
    'activatedAt', to_char(NEW."activatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'activationReason', NEW."activationReason", 'provenance', NEW."provenance"
  );
  NEW."canonicalJson" := public."controlled_evidence_canonical_json"(expected_payload);
  NEW."activationHash" := encode(digest(NEW."canonicalJson", 'sha256'), 'hex');
  RETURN NEW;
EXCEPTION WHEN NO_DATA_FOUND THEN
  RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CONTROLLED_EVIDENCE_PRIOR_ACTIVATION_MISSING';
END;
$function$;

CREATE OR REPLACE FUNCTION "validate_controlled_evidence_policy_activation_transition"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE event_row "ControlledEvidencePolicyActivationEvent"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."createdAt" := date_trunc('milliseconds', transaction_timestamp());
    NEW."updatedAt" := NEW."createdAt";
  ELSE
    NEW."updatedAt" := date_trunc('milliseconds', transaction_timestamp());
  END IF;
  SELECT * INTO STRICT event_row FROM "ControlledEvidencePolicyActivationEvent"
   WHERE "id" = NEW."activeActivationEventId" AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId" AND "actionCode" = NEW."actionCode"
     AND "pointerVersion" = NEW."pointerVersion";
  IF TG_OP = 'INSERT' THEN
    IF NEW."pointerVersion" <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_ACTIVATION_INITIAL_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW."id", NEW."tenantId", NEW."companyId", NEW."actionCode", NEW."createdAt")
     IS DISTINCT FROM
     (OLD."id", OLD."tenantId", OLD."companyId", OLD."actionCode", OLD."createdAt") THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CONTROLLED_EVIDENCE_ACTIVATION_IDENTITY_IMMUTABLE';
  END IF;
  IF NEW."pointerVersion" <> OLD."pointerVersion" + 1
     OR NEW."activeActivationEventId" = OLD."activeActivationEventId"
     OR event_row."priorActivationEventId" <> OLD."activeActivationEventId"
     OR NEW."updatedAt" < OLD."updatedAt" THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTROLLED_EVIDENCE_ACTIVATION_CAS_INVALID';
  END IF;
  RETURN NEW;
EXCEPTION WHEN NO_DATA_FOUND THEN
  RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CONTROLLED_EVIDENCE_ACTIVE_EVENT_MISSING';
END;
$function$;

CREATE OR REPLACE FUNCTION "validate_controlled_evidence_qualification_lineage"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  activation_row "ControlledEvidencePolicyActivation"%ROWTYPE;
  event_row "ControlledEvidencePolicyActivationEvent"%ROWTYPE;
  prior_event_row "ControlledEvidencePolicyActivationEvent"%ROWTYPE;
  policy_row "ControlledEvidencePolicyVersion"%ROWTYPE;
  actor_epoch INTEGER;
  session_epoch INTEGER;
BEGIN
  NEW."qualifiedAt" := date_trunc('milliseconds', transaction_timestamp());
  NEW."createdAt" := NEW."qualifiedAt";
  SELECT * INTO STRICT activation_row
    FROM "ControlledEvidencePolicyActivation"
   WHERE "id" = NEW."policyActivationPointerId"
     AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId"
     AND "actionCode" = NEW."actionCode" FOR SHARE;

  SELECT * INTO STRICT event_row FROM "ControlledEvidencePolicyActivationEvent"
   WHERE "id" = NEW."policyActivationId" AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId" AND "actionCode" = NEW."actionCode";
  IF activation_row."activeActivationEventId" <> event_row."id"
     OR activation_row."pointerVersion" <> event_row."pointerVersion"
     OR (NEW."policyPointerVersion", NEW."policyActivatedByUserId", NEW."policyActivatedAt",
         NEW."policyActivationReason", NEW."policyVersionId", NEW."policyVersion")
        IS DISTINCT FROM
        (event_row."pointerVersion", event_row."activatedByUserId", event_row."activatedAt",
         event_row."activationReason", event_row."policyVersionId", event_row."policyVersion") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_ACTIVATION_SNAPSHOT_MISMATCH';
  END IF;
  IF event_row."priorActivationEventId" IS NULL THEN
    IF NEW."priorPolicyVersionId" IS NOT NULL OR NEW."priorPolicyVersion" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_PRIOR_POLICY_SNAPSHOT_MISMATCH';
    END IF;
  ELSE
    SELECT * INTO STRICT prior_event_row FROM "ControlledEvidencePolicyActivationEvent"
     WHERE "id" = event_row."priorActivationEventId";
    IF (NEW."priorPolicyVersionId", NEW."priorPolicyVersion") IS DISTINCT FROM
       (prior_event_row."policyVersionId", prior_event_row."policyVersion") THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_PRIOR_POLICY_SNAPSHOT_MISMATCH';
    END IF;
  END IF;

  SELECT * INTO STRICT policy_row
    FROM "ControlledEvidencePolicyVersion"
   WHERE "id" = NEW."policyVersionId"
     AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId"
     AND "actionCode" = NEW."actionCode"
     AND "version" = NEW."policyVersion";

  IF (NEW."policySchemaVersion", NEW."policySnapshot", NEW."policyCanonicalJson", NEW."policyConfigHash")
     IS DISTINCT FROM
     (policy_row."schemaVersion", policy_row."policy", policy_row."canonicalJson", policy_row."configHash") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_POLICY_SNAPSHOT_MISMATCH';
  END IF;
  IF policy_row."policy"->>'sourceType' <> NEW."sourceType" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_POLICY_SOURCE_TYPE_MISMATCH';
  END IF;

  IF NEW."executionCanonicalJson"::jsonb <> jsonb_build_object(
    'schemaVersion', 1, 'actionCode', NEW."actionCode", 'actionSchemaVersion', NEW."actionSchemaVersion",
    'tenantId', NEW."tenantId"::text, 'companyId', NEW."companyId"::text,
    'sourceType', NEW."sourceType", 'sourceRecordId', NEW."sourceRecordId"::text,
    'sourceVersion', NEW."sourceVersion", 'sourceLineId', NEW."sourceLineId"::text,
    'executionKey', NEW."executionKey", 'actorUserId', NEW."actorUserId"::text,
    'actorAuthSessionId', NEW."actorAuthSessionId"::text, 'actorPrivilegeEpoch', NEW."actorPrivilegeEpoch",
    'approvalInstanceId', NEW."approvalInstanceId"::text, 'approvalStepId', NEW."approvalInstanceStepId"::text,
    'provenance', NEW."provenance") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_EXECUTION_PAYLOAD_MISMATCH';
  END IF;

  SELECT "privilegeEpoch" INTO STRICT actor_epoch
    FROM "User"
   WHERE "id" = NEW."actorUserId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF actor_epoch <> NEW."actorPrivilegeEpoch" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_ACTOR_EPOCH_MISMATCH';
  END IF;

  IF NEW."actorAuthSessionId" IS NOT NULL THEN
    SELECT "privilegeEpochAtIssue" INTO STRICT session_epoch
      FROM "AuthSession"
     WHERE "id" = NEW."actorAuthSessionId"
       AND "tenantId" = NEW."tenantId"
       AND "userId" = NEW."actorUserId"
       AND "status" = 'ACTIVE' AND "revokedAt" IS NULL
       AND "idleExpiresAt" > NEW."qualifiedAt" AND "absoluteExpiresAt" > NEW."qualifiedAt" FOR SHARE;
    IF session_epoch <> NEW."actorPrivilegeEpoch" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_SESSION_EPOCH_MISMATCH';
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CONTROLLED_EVIDENCE_QUALIFICATION_LINEAGE_MISSING';
END;
$function$;

CREATE OR REPLACE FUNCTION "validate_controlled_evidence_selection_lineage"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  qualification_row "ControlledEvidenceActionQualification"%ROWTYPE;
  link_row "ControlledEvidenceAttachment"%ROWTYPE;
  attachment_row "Attachment"%ROWTYPE;
  scan_row "AttachmentScanAttempt"%ROWTYPE;
  replacement_id UUID;
  expected_payload JSONB;
BEGIN
  NEW."createdAt" := date_trunc('milliseconds', transaction_timestamp());
  SELECT * INTO STRICT qualification_row
    FROM "ControlledEvidenceActionQualification"
   WHERE "id" = NEW."qualificationId"
     AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId";
  SELECT * INTO STRICT link_row
    FROM "ControlledEvidenceAttachment"
   WHERE "id" = NEW."controlledEvidenceAttachmentId"
     AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId"
     AND "attachmentId" = NEW."attachmentId" FOR SHARE;
  SELECT * INTO STRICT attachment_row
    FROM "Attachment"
   WHERE "id" = NEW."attachmentId"
     AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId"
     AND "objectVersionId" = NEW."objectVersionId" FOR SHARE;
  SELECT * INTO STRICT scan_row
    FROM "AttachmentScanAttempt"
   WHERE "id" = NEW."scanAttemptId"
     AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId"
     AND "attachmentId" = NEW."attachmentId"
     AND "objectVersionId" = NEW."objectVersionId";
  SELECT "id" INTO replacement_id FROM "Attachment"
   WHERE "tenantId" = NEW."tenantId" AND "companyId" = NEW."companyId"
     AND "replacesAttachmentId" = NEW."attachmentId"
   ORDER BY "createdAt" DESC, "id" DESC LIMIT 1;

  IF link_row."sourceType" <> qualification_row."sourceType"
     OR link_row."sourceRecordId" <> qualification_row."sourceRecordId"
     OR link_row."sourceLineId" IS DISTINCT FROM qualification_row."sourceLineId"
     OR link_row."sourceLineId" IS DISTINCT FROM NEW."sourceLineId"
     OR link_row."purpose" <> NEW."purpose"
     OR link_row."status" <> NEW."controlledEvidenceLinkStatus"
     OR link_row."archivedAt" IS DISTINCT FROM NEW."controlledEvidenceLinkArchivedAt"
     OR link_row."updatedAt" <> NEW."controlledEvidenceLinkUpdatedAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_LINK_SNAPSHOT_MISMATCH';
  END IF;

  IF (attachment_row."rowVersion", attachment_row."status", attachment_row."scanVerifiedObjectVersionId",
      replacement_id,
      CASE WHEN attachment_row."checksum" ~ '^[A-Fa-f0-9]{64}$' THEN lower(attachment_row."checksum")
           ELSE encode(decode(attachment_row."checksum", 'base64'), 'hex') END,
      CASE WHEN attachment_row."detectedChecksum" ~ '^[A-Fa-f0-9]{64}$' THEN lower(attachment_row."detectedChecksum")
           ELSE encode(decode(attachment_row."detectedChecksum", 'base64'), 'hex') END,
      attachment_row."storedChecksum", attachment_row."uploadState", attachment_row."scanState",
      attachment_row."availabilityState", attachment_row."physicalState")
     IS DISTINCT FROM
     (NEW."attachmentRowVersion", NEW."attachmentStatus", NEW."scanVerifiedObjectVersionId",
      NEW."replacementAttachmentId", NEW."attachmentChecksum", NEW."attachmentDetectedChecksum",
      NEW."attachmentStoredChecksum", NEW."uploadState", NEW."scanState",
      NEW."availabilityState", NEW."physicalState") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_ATTACHMENT_SNAPSHOT_MISMATCH';
  END IF;

  expected_payload := jsonb_build_object(
    'ordinal', NEW."ordinal", 'controlledEvidenceAttachmentId', NEW."controlledEvidenceAttachmentId"::text,
    'attachmentId', NEW."attachmentId"::text, 'sourceLineId', NEW."sourceLineId"::text,
    'purpose', NEW."purpose", 'controlledEvidenceLinkStatus', NEW."controlledEvidenceLinkStatus"::text,
    'controlledEvidenceLinkUpdatedAt', to_char(NEW."controlledEvidenceLinkUpdatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'controlledEvidenceLinkArchivedAt', CASE WHEN NEW."controlledEvidenceLinkArchivedAt" IS NULL THEN NULL ELSE to_char(NEW."controlledEvidenceLinkArchivedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'objectVersionId', NEW."objectVersionId", 'attachmentRowVersion', NEW."attachmentRowVersion",
    'attachmentStatus', NEW."attachmentStatus"::text, 'scanVerifiedObjectVersionId', NEW."scanVerifiedObjectVersionId",
    'replacementAttachmentId', NEW."replacementAttachmentId"::text, 'attachmentChecksum', NEW."attachmentChecksum",
    'attachmentDetectedChecksum', NEW."attachmentDetectedChecksum", 'attachmentStoredChecksum', NEW."attachmentStoredChecksum",
    'uploadState', NEW."uploadState"::text, 'scanState', NEW."scanState"::text,
    'availabilityState', NEW."availabilityState"::text, 'physicalState', NEW."physicalState"::text,
    'scanAttemptId', NEW."scanAttemptId"::text, 'scanResult', NEW."scanResult"::text,
    'scanCompletedAt', to_char(NEW."scanCompletedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'scanProvider', NEW."scanProvider", 'scannerEngineVersion', NEW."scannerEngineVersion",
    'scanSignatureVersion', NEW."scanSignatureVersion", 'scanPlaintextChecksum', NEW."scanPlaintextChecksum"
  );
  IF NEW."selectionCanonicalJson"::jsonb <> expected_payload THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_SELECTION_PAYLOAD_MISMATCH';
  END IF;

  IF (scan_row."result", scan_row."completedAt", scan_row."scanProvider",
      scan_row."scannerEngineVersion", scan_row."signatureVersion", scan_row."plaintextChecksum")
     IS DISTINCT FROM
     (NEW."scanResult", NEW."scanCompletedAt", NEW."scanProvider",
      NEW."scannerEngineVersion", NEW."scanSignatureVersion", NEW."scanPlaintextChecksum") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_SCAN_SNAPSHOT_MISMATCH';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CONTROLLED_EVIDENCE_SELECTION_LINEAGE_MISSING';
END;
$function$;

CREATE OR REPLACE FUNCTION "validate_controlled_evidence_selection_count"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  actual_count INTEGER;
  first_ordinal INTEGER;
  last_ordinal INTEGER;
  aggregate_json TEXT;
  policy JSONB;
BEGIN
  SELECT count(*)::integer, min("ordinal"), max("ordinal")
    INTO actual_count, first_ordinal, last_ordinal
    FROM "ControlledEvidenceActionSelection"
   WHERE "qualificationId" = NEW."id";
  SELECT "policySnapshot" INTO policy FROM "ControlledEvidenceActionQualification" WHERE "id" = NEW."id";
  SELECT '{"schemaVersion":1,"selections":[' || string_agg("selectionCanonicalJson", ',' ORDER BY "ordinal") || ']}'
    INTO aggregate_json FROM "ControlledEvidenceActionSelection" WHERE "qualificationId" = NEW."id";
  IF actual_count <> NEW."selectionCount"
     OR first_ordinal <> 1
     OR last_ordinal <> NEW."selectionCount"
     OR encode(digest(aggregate_json, 'sha256'), 'hex') <> NEW."selectionHash"
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(policy->'purposeRequirements') requirement
       WHERE (SELECT count(*) FROM "ControlledEvidenceActionSelection" selection
              WHERE selection."qualificationId" = NEW."id"
                AND selection."purpose" = requirement->>'purpose')
             NOT BETWEEN (requirement->>'minimumCount')::integer AND (requirement->>'maximumCount')::integer
     )
     OR EXISTS (
       SELECT 1 FROM "ControlledEvidenceActionSelection" selection
       WHERE selection."qualificationId" = NEW."id"
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(policy->'purposeRequirements') requirement
                         WHERE requirement->>'purpose' = selection."purpose")
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_SELECTION_COUNT_MISMATCH';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION "validate_controlled_evidence_selection_parent_count"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  qualification_row "ControlledEvidenceActionQualification"%ROWTYPE;
  actual_count INTEGER;
  first_ordinal INTEGER;
  last_ordinal INTEGER;
  aggregate_json TEXT;
BEGIN
  SELECT * INTO STRICT qualification_row
    FROM "ControlledEvidenceActionQualification"
   WHERE "id" = NEW."qualificationId";
  SELECT count(*)::integer, min("ordinal"), max("ordinal"),
         '{"schemaVersion":1,"selections":[' || string_agg("selectionCanonicalJson", ',' ORDER BY "ordinal") || ']}'
    INTO actual_count, first_ordinal, last_ordinal, aggregate_json
    FROM "ControlledEvidenceActionSelection" WHERE "qualificationId" = NEW."qualificationId";
  IF actual_count <> qualification_row."selectionCount"
     OR first_ordinal <> 1 OR last_ordinal <> qualification_row."selectionCount"
     OR encode(digest(aggregate_json, 'sha256'), 'hex') <> qualification_row."selectionHash"
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(qualification_row."policySnapshot"->'purposeRequirements') requirement
       WHERE (SELECT count(*) FROM "ControlledEvidenceActionSelection" selection
              WHERE selection."qualificationId" = NEW."qualificationId"
                AND selection."purpose" = requirement->>'purpose')
             NOT BETWEEN (requirement->>'minimumCount')::integer AND (requirement->>'maximumCount')::integer)
     OR EXISTS (
       SELECT 1 FROM "ControlledEvidenceActionSelection" selection
       WHERE selection."qualificationId" = NEW."qualificationId"
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(qualification_row."policySnapshot"->'purposeRequirements') requirement
                         WHERE requirement->>'purpose' = selection."purpose"))
     OR EXISTS (
       SELECT 1
         FROM "ControlledEvidenceActionSelection" selection
         JOIN "ControlledEvidenceAttachment" link
           ON link."id" = selection."controlledEvidenceAttachmentId"
          AND link."tenantId" = selection."tenantId" AND link."companyId" = selection."companyId"
         JOIN "Attachment" attachment
           ON attachment."id" = selection."attachmentId"
          AND attachment."tenantId" = selection."tenantId" AND attachment."companyId" = selection."companyId"
        WHERE selection."qualificationId" = NEW."qualificationId"
          AND (link."sourceType" <> qualification_row."sourceType"
            OR link."sourceRecordId" <> qualification_row."sourceRecordId"
            OR link."sourceLineId" IS DISTINCT FROM qualification_row."sourceLineId"
            OR link."sourceLineId" IS DISTINCT FROM selection."sourceLineId"
            OR link."purpose" <> selection."purpose"
            OR link."status" <> 'ACTIVE' OR link."archivedAt" IS NOT NULL
            OR link."updatedAt" <> selection."controlledEvidenceLinkUpdatedAt"
            OR attachment."status" <> 'ACTIVE'
            OR attachment."rowVersion" <> selection."attachmentRowVersion"
            OR attachment."objectVersionId" IS DISTINCT FROM selection."objectVersionId"
            OR attachment."scanVerifiedObjectVersionId" IS DISTINCT FROM selection."objectVersionId"
            OR (CASE WHEN attachment."checksum" ~ '^[A-Fa-f0-9]{64}$' THEN lower(attachment."checksum")
                     ELSE encode(decode(attachment."checksum", 'base64'), 'hex') END) <> selection."attachmentChecksum"
            OR (CASE WHEN attachment."detectedChecksum" ~ '^[A-Fa-f0-9]{64}$' THEN lower(attachment."detectedChecksum")
                     ELSE encode(decode(attachment."detectedChecksum", 'base64'), 'hex') END) <> selection."attachmentDetectedChecksum"
            OR attachment."storedChecksum" IS DISTINCT FROM selection."attachmentStoredChecksum"
            OR attachment."uploadState" <> 'VERIFIED' OR attachment."scanState" <> 'CLEAN'
            OR attachment."availabilityState" <> 'AVAILABLE' OR attachment."physicalState" <> 'DURABLE'
            OR EXISTS (SELECT 1 FROM "Attachment" replacement
                        WHERE replacement."tenantId" = selection."tenantId"
                          AND replacement."companyId" = selection."companyId"
                          AND replacement."replacesAttachmentId" = selection."attachmentId"))
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTROLLED_EVIDENCE_SELECTION_AGGREGATE_MISMATCH';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER "ControlledEvidencePolicyVersion_validation_trg"
BEFORE INSERT ON "ControlledEvidencePolicyVersion"
FOR EACH ROW EXECUTE FUNCTION "validate_controlled_evidence_policy_version"();
ALTER TABLE "ControlledEvidencePolicyVersion" ENABLE ALWAYS TRIGGER "ControlledEvidencePolicyVersion_validation_trg";

CREATE TRIGGER "ControlledEvidencePolicyActivationEvent_lineage_trg"
BEFORE INSERT ON "ControlledEvidencePolicyActivationEvent"
FOR EACH ROW EXECUTE FUNCTION "validate_controlled_evidence_activation_event_lineage"();
ALTER TABLE "ControlledEvidencePolicyActivationEvent" ENABLE ALWAYS TRIGGER "ControlledEvidencePolicyActivationEvent_lineage_trg";

CREATE TRIGGER "ControlledEvidencePolicyActivation_transition_guard_trg"
BEFORE INSERT OR UPDATE ON "ControlledEvidencePolicyActivation"
FOR EACH ROW EXECUTE FUNCTION "validate_controlled_evidence_policy_activation_transition"();
ALTER TABLE "ControlledEvidencePolicyActivation"
  ENABLE ALWAYS TRIGGER "ControlledEvidencePolicyActivation_transition_guard_trg";

CREATE TRIGGER "ControlledEvidencePolicyActivation_remove_guard_trg"
BEFORE DELETE OR TRUNCATE ON "ControlledEvidencePolicyActivation"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_controlled_evidence_history_mutation"();
ALTER TABLE "ControlledEvidencePolicyActivation"
  ENABLE ALWAYS TRIGGER "ControlledEvidencePolicyActivation_remove_guard_trg";

CREATE TRIGGER "ControlledEvidenceActionQualification_lineage_trg"
BEFORE INSERT ON "ControlledEvidenceActionQualification"
FOR EACH ROW EXECUTE FUNCTION "validate_controlled_evidence_qualification_lineage"();
ALTER TABLE "ControlledEvidenceActionQualification"
  ENABLE ALWAYS TRIGGER "ControlledEvidenceActionQualification_lineage_trg";

CREATE TRIGGER "ControlledEvidenceActionSelection_lineage_trg"
BEFORE INSERT ON "ControlledEvidenceActionSelection"
FOR EACH ROW EXECUTE FUNCTION "validate_controlled_evidence_selection_lineage"();
ALTER TABLE "ControlledEvidenceActionSelection"
  ENABLE ALWAYS TRIGGER "ControlledEvidenceActionSelection_lineage_trg";

CREATE CONSTRAINT TRIGGER "ControlledEvidenceActionQualification_selection_count_trg"
AFTER INSERT ON "ControlledEvidenceActionQualification"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_controlled_evidence_selection_count"();
ALTER TABLE "ControlledEvidenceActionQualification"
  ENABLE ALWAYS TRIGGER "ControlledEvidenceActionQualification_selection_count_trg";

CREATE CONSTRAINT TRIGGER "ControlledEvidenceActionSelection_parent_count_trg"
AFTER INSERT ON "ControlledEvidenceActionSelection"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_controlled_evidence_selection_parent_count"();
ALTER TABLE "ControlledEvidenceActionSelection"
  ENABLE ALWAYS TRIGGER "ControlledEvidenceActionSelection_parent_count_trg";

CREATE TRIGGER "ControlledEvidencePolicyVersion_append_only_guard_trg"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ControlledEvidencePolicyVersion"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_controlled_evidence_history_mutation"();
ALTER TABLE "ControlledEvidencePolicyVersion"
  ENABLE ALWAYS TRIGGER "ControlledEvidencePolicyVersion_append_only_guard_trg";

CREATE TRIGGER "ControlledEvidencePolicyActivationEvent_append_only_guard_trg"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ControlledEvidencePolicyActivationEvent"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_controlled_evidence_history_mutation"();
ALTER TABLE "ControlledEvidencePolicyActivationEvent"
  ENABLE ALWAYS TRIGGER "ControlledEvidencePolicyActivationEvent_append_only_guard_trg";

CREATE TRIGGER "AttachmentScanAttempt_append_only_guard_trg"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "AttachmentScanAttempt"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_controlled_evidence_history_mutation"();
ALTER TABLE "AttachmentScanAttempt"
  ENABLE ALWAYS TRIGGER "AttachmentScanAttempt_append_only_guard_trg";

CREATE TRIGGER "ControlledEvidenceActionQualification_append_only_guard_trg"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ControlledEvidenceActionQualification"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_controlled_evidence_history_mutation"();
ALTER TABLE "ControlledEvidenceActionQualification"
  ENABLE ALWAYS TRIGGER "ControlledEvidenceActionQualification_append_only_guard_trg";

CREATE TRIGGER "ControlledEvidenceActionSelection_append_only_guard_trg"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ControlledEvidenceActionSelection"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_controlled_evidence_history_mutation"();
ALTER TABLE "ControlledEvidenceActionSelection"
  ENABLE ALWAYS TRIGGER "ControlledEvidenceActionSelection_append_only_guard_trg";

REVOKE ALL ON FUNCTION "reject_controlled_evidence_history_mutation"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_controlled_evidence_policy_version"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_controlled_evidence_activation_event_lineage"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_controlled_evidence_policy_activation_transition"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_controlled_evidence_qualification_lineage"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_controlled_evidence_selection_lineage"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_controlled_evidence_selection_count"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_controlled_evidence_selection_parent_count"() FROM PUBLIC;

COMMIT;
