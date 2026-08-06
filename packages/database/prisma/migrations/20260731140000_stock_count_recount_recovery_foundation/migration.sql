-- DEC-0264: immutable recount recovery foundation. This migration is additive;
-- it does not activate recount UI/services or mutate inventory movements.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "StockCountAttempt"
    WHERE "status" IN ('DRAFT', 'IN_PROGRESS', 'SUBMITTED')
    GROUP BY "stockCountSessionId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one open stock-count attempt: duplicate open attempts exist';
  END IF;
END;
$$;

CREATE UNIQUE INDEX "StockCountAttempt_one_open_per_session_key"
  ON "StockCountAttempt"("stockCountSessionId")
  WHERE "status" IN ('DRAFT', 'IN_PROGRESS', 'SUBMITTED');

ALTER TABLE "StockAdjustment"
  ADD COLUMN "voidedForRecountByUserId" UUID,
  ADD COLUMN "voidedForRecountAt" TIMESTAMP(3),
  ADD COLUMN "voidedForRecountReason" TEXT,
  ADD COLUMN "voidedForRecountEvidenceReference" TEXT;

ALTER TABLE "StockAdjustment" DROP CONSTRAINT IF EXISTS "StockAdjustment_status_check";
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_status_check"
  CHECK ("status" IN (
    'DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'POSTING', 'POSTED',
    'REVERSING', 'REVERSED', 'RETURNED', 'REJECTED', 'CANCELLED', 'VOIDED_FOR_RECOUNT'
  ));
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_recount_void_fields_check"
  CHECK (
    "status" <> 'VOIDED_FOR_RECOUNT' OR (
      "adjustmentType" = 'COUNT_VARIANCE'
      AND "sourceStockCountAttemptId" IS NOT NULL
      AND "voidedForRecountByUserId" IS NOT NULL
      AND "voidedForRecountAt" IS NOT NULL
      AND NULLIF(BTRIM("voidedForRecountReason"), '') IS NOT NULL
      AND NULLIF(BTRIM("voidedForRecountEvidenceReference"), '') IS NOT NULL
      AND "postedAt" IS NULL AND "postedByUserId" IS NULL
      AND "reversedAt" IS NULL AND "reversedByUserId" IS NULL
    )
  );
CREATE INDEX "StockAdjustment_voidedForRecountByUserId_idx"
  ON "StockAdjustment"("voidedForRecountByUserId");
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_recount_void_actor_fkey"
  FOREIGN KEY ("voidedForRecountByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "StockCountRecountTransition" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "stockCountSessionId" UUID NOT NULL,
  "sourceAttemptId" UUID NOT NULL,
  "successorAttemptId" UUID NOT NULL,
  "linkedStockAdjustmentId" UUID,
  "adjustmentDisposition" TEXT NOT NULL,
  "cutoffDisposition" TEXT NOT NULL DEFAULT 'NEW_CUTOFF',
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "requestCanonicalJson" JSONB NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "reason" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "actorUserId" UUID NOT NULL,
  "authSessionId" UUID NOT NULL,
  "mfaVerifiedAt" TIMESTAMP(3) NOT NULL,
  "controlledEvidenceQualificationId" UUID NOT NULL,
  "reviewConfigurationRevisionId" UUID NOT NULL,
  "reviewConfigurationRevisionNumber" INTEGER NOT NULL,
  "reviewConfigurationDigest" CHAR(64) NOT NULL,
  "reviewActivationEventId" UUID NOT NULL,
  "reviewActivationFamily" "InventoryPilotApprovalFamily" NOT NULL DEFAULT 'StockCountAttemptReview',
  "reviewActivationStatus" "InventoryPilotActivationStatus" NOT NULL DEFAULT 'ACTIVE',
  "reviewActivationGeneration" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockCountRecountTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockCountRecountTransition_source_key" UNIQUE ("sourceAttemptId"),
  CONSTRAINT "StockCountRecountTransition_successor_key" UNIQUE ("successorAttemptId"),
  CONSTRAINT "StockCountRecountTransition_adjustment_key" UNIQUE ("linkedStockAdjustmentId"),
  CONSTRAINT "StockCountRecountTransition_evidence_qualification_key" UNIQUE ("controlledEvidenceQualificationId"),
  CONSTRAINT "StockCountRecountTransition_evidence_qualification_exact_key" UNIQUE ("controlledEvidenceQualificationId", "tenantId", "companyId"),
  CONSTRAINT "StockCountRecountTransition_scope_idempotency_key" UNIQUE ("tenantId", "companyId", "idempotencyKey"),
  CONSTRAINT "StockCountRecountTransition_disposition_check" CHECK (
    "adjustmentDisposition" IN ('NONE', 'CANCELLED_UNPOSTED', 'VOIDED_APPROVED_UNPOSTED', 'REVERSED_POSTED')
  ),
  CONSTRAINT "StockCountRecountTransition_cutoff_check" CHECK ("cutoffDisposition" = 'NEW_CUTOFF'),
  CONSTRAINT "StockCountRecountTransition_required_text_check" CHECK (
    NULLIF(BTRIM("idempotencyKey"), '') IS NOT NULL
    AND NULLIF(BTRIM("reason"), '') IS NOT NULL
    AND NULLIF(BTRIM("evidenceReference"), '') IS NOT NULL
    AND "requestHash" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("requestCanonicalJson") = 'object'
    AND "reviewConfigurationRevisionNumber" > 0
    AND "reviewConfigurationDigest" ~ '^[0-9a-f]{64}$'
    AND "reviewActivationFamily" = 'StockCountAttemptReview'
    AND "reviewActivationStatus" = 'ACTIVE'
    AND "reviewActivationGeneration" > 0
  ),
  CONSTRAINT "StockCountRecountTransition_adjustment_shape_check" CHECK (
    ("adjustmentDisposition" = 'NONE' AND "linkedStockAdjustmentId" IS NULL)
    OR ("adjustmentDisposition" <> 'NONE' AND "linkedStockAdjustmentId" IS NOT NULL)
  ),
  CONSTRAINT "StockCountRecountTransition_distinct_attempts_check" CHECK ("sourceAttemptId" <> "successorAttemptId"),
  CONSTRAINT "StockCountRecountTransition_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountRecountTransition_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountRecountTransition_location_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountRecountTransition_session_fkey" FOREIGN KEY ("stockCountSessionId") REFERENCES "StockCountSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountRecountTransition_source_fkey" FOREIGN KEY ("sourceAttemptId") REFERENCES "StockCountAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountRecountTransition_successor_fkey" FOREIGN KEY ("successorAttemptId") REFERENCES "StockCountAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountRecountTransition_adjustment_fkey" FOREIGN KEY ("linkedStockAdjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountRecountTransition_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountRecountTransition_auth_session_fkey" FOREIGN KEY ("authSessionId") REFERENCES "AuthSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "StockCountRecountTransition"
  ADD CONSTRAINT "StockCountRecountTransition_evidence_qualification_exact_fkey"
    FOREIGN KEY ("controlledEvidenceQualificationId", "tenantId", "companyId")
    REFERENCES "ControlledEvidenceActionQualification"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountRecountTransition_review_revision_exact_fkey"
    FOREIGN KEY ("reviewConfigurationRevisionId", "tenantId", "companyId", "reviewConfigurationRevisionNumber", "reviewConfigurationDigest")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountRecountTransition_review_activation_exact_fkey"
    FOREIGN KEY ("reviewActivationEventId", "tenantId", "companyId", "reviewActivationFamily", "reviewActivationStatus", "reviewConfigurationRevisionId", "reviewConfigurationRevisionNumber", "reviewConfigurationDigest", "reviewActivationGeneration")
    REFERENCES "InventoryPilotFamilyActivationEvent"(id, "tenantId", "companyId", family, status, "configurationRevisionId", "configurationRevisionNumber", "configurationDigest", generation) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "StockCountRecountTransition_scope_location_occurred_idx"
  ON "StockCountRecountTransition"("tenantId", "companyId", "inventoryLocationId", "occurredAt");
CREATE INDEX "StockCountRecountTransition_session_occurred_idx"
  ON "StockCountRecountTransition"("stockCountSessionId", "occurredAt");
REVOKE ALL ON TABLE "StockCountRecountTransition" FROM PUBLIC;

CREATE OR REPLACE FUNCTION "guard_stock_count_recount_transition_insert"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  source_row "StockCountAttempt"%ROWTYPE;
  successor_row "StockCountAttempt"%ROWTYPE;
  session_row "StockCountSession"%ROWTYPE;
  adjustment_row "StockAdjustment"%ROWTYPE;
  auth_row "AuthSession"%ROWTYPE;
  linked_adjustment_count INTEGER;
BEGIN
  NEW."occurredAt" := clock_timestamp();
  NEW."createdAt" := NEW."occurredAt";
  SELECT * INTO source_row FROM "StockCountAttempt" WHERE "id" = NEW."sourceAttemptId";
  SELECT * INTO successor_row FROM "StockCountAttempt" WHERE "id" = NEW."successorAttemptId";
  SELECT * INTO session_row FROM "StockCountSession" WHERE "id" = NEW."stockCountSessionId";
  SELECT * INTO auth_row FROM "AuthSession" WHERE "id" = NEW."authSessionId";

  IF NOT EXISTS (
    SELECT 1 FROM "ControlledEvidenceActionQualification" qualification
    WHERE qualification.id = NEW."controlledEvidenceQualificationId"
      AND qualification."tenantId" = NEW."tenantId"
      AND qualification."companyId" = NEW."companyId"
      AND qualification."actionCode" = 'STOCK_COUNT_RECOUNT_RECOVERY'
      AND qualification."sourceType" = 'StockCountAttempt'
      AND qualification."sourceRecordId" = NEW."sourceAttemptId"
      AND qualification."sourceVersion" = source_row."version"::text
      AND qualification."actorUserId" = NEW."actorUserId"
      AND qualification."actorAuthSessionId" = NEW."authSessionId"
      AND qualification."idempotencyKey" = NEW."idempotencyKey"
  ) THEN
    RAISE EXCEPTION 'Controlled evidence qualification is required for recount recovery' USING ERRCODE = '23514';
  END IF;

  IF source_row."id" IS NULL OR source_row."status" <> 'REVIEWED'
     OR session_row."currentAttemptId" IS DISTINCT FROM source_row."id"
     OR session_row."status" <> 'REVIEWED'
     OR source_row."stockCountSessionId" IS DISTINCT FROM NEW."stockCountSessionId"
     OR successor_row."stockCountSessionId" IS DISTINCT FROM NEW."stockCountSessionId"
     OR successor_row."attemptNumber" <> source_row."attemptNumber" + 1
     OR successor_row."status" <> 'DRAFT'
     OR successor_row."blindCount" IS DISTINCT FROM source_row."blindCount"
     OR successor_row."freezeMovements" IS DISTINCT FROM source_row."freezeMovements"
     OR successor_row."blindCount" IS DISTINCT FROM session_row."blindCount"
     OR successor_row."freezeMovements" IS DISTINCT FROM session_row."freezeMovements"
     OR successor_row."cutoffAt" IS NOT NULL
     OR successor_row."startedAt" IS NOT NULL
     OR successor_row."submittedAt" IS NOT NULL
     OR successor_row."reviewedAt" IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM "StockCountAttemptLine" l
       WHERE l."stockCountAttemptId" = successor_row."id"
     )
     OR source_row."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR successor_row."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR session_row."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR source_row."companyId" IS DISTINCT FROM NEW."companyId"
     OR successor_row."companyId" IS DISTINCT FROM NEW."companyId"
     OR session_row."companyId" IS DISTINCT FROM NEW."companyId"
     OR source_row."inventoryLocationId" IS DISTINCT FROM NEW."inventoryLocationId"
     OR successor_row."inventoryLocationId" IS DISTINCT FROM NEW."inventoryLocationId"
     OR session_row."inventoryLocationId" IS DISTINCT FROM NEW."inventoryLocationId" THEN
    RAISE EXCEPTION 'Invalid stock-count recount lineage' USING ERRCODE = '23514';
  END IF;

  IF auth_row."id" IS NULL OR auth_row."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR auth_row."userId" IS DISTINCT FROM NEW."actorUserId"
     OR auth_row."status" <> 'ACTIVE' OR auth_row."assuranceLevel" <> 'MFA'
     OR auth_row."mfaAuthenticatedAt" IS NULL
     OR NEW."mfaVerifiedAt" IS DISTINCT FROM auth_row."mfaAuthenticatedAt"
     OR auth_row."idleExpiresAt" <= NEW."occurredAt"
     OR auth_row."absoluteExpiresAt" <= NEW."occurredAt"
     OR auth_row."revokedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Privileged MFA session is not valid for recount recovery' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "InventoryPilotFamilyActivation" activation
    JOIN "InventoryPilotEndpointMembership" endpoint
      ON endpoint."configurationRevisionId" = activation."configurationRevisionId"
     AND endpoint."configurationRevisionNumber" = activation."configurationRevisionNumber"
     AND endpoint."tenantId" = activation."tenantId"
     AND endpoint."companyId" = activation."companyId"
     AND endpoint."inventoryLocationId" = NEW."inventoryLocationId"
     AND endpoint.capability = 'COUNT_LOCATION'
    WHERE activation."tenantId" = NEW."tenantId"
      AND activation."companyId" = NEW."companyId"
      AND activation.family = NEW."reviewActivationFamily"
      AND activation.status = NEW."reviewActivationStatus"
      AND activation."currentActivationEventId" = NEW."reviewActivationEventId"
      AND activation."configurationRevisionId" = NEW."reviewConfigurationRevisionId"
      AND activation."configurationRevisionNumber" = NEW."reviewConfigurationRevisionNumber"
      AND activation."configurationDigest" = NEW."reviewConfigurationDigest"
      AND activation.generation = NEW."reviewActivationGeneration"
  ) THEN
    RAISE EXCEPTION 'Active stock-count review authority is not exact for recount recovery' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO linked_adjustment_count
  FROM "StockAdjustment" a
  WHERE a."sourceStockCountAttemptId" = NEW."sourceAttemptId"
    AND a."adjustmentType" = 'COUNT_VARIANCE';
  IF (NEW."adjustmentDisposition" = 'NONE' AND linked_adjustment_count <> 0)
     OR (NEW."adjustmentDisposition" <> 'NONE' AND linked_adjustment_count <> 1) THEN
    RAISE EXCEPTION 'Stock-count recount requires one unambiguous adjustment disposition' USING ERRCODE = '23514';
  END IF;

  IF NEW."adjustmentDisposition" <> 'NONE' THEN
    SELECT * INTO adjustment_row FROM "StockAdjustment" WHERE "id" = NEW."linkedStockAdjustmentId";
    IF adjustment_row."id" IS NULL
       OR adjustment_row."tenantId" IS DISTINCT FROM NEW."tenantId"
       OR adjustment_row."companyId" IS DISTINCT FROM NEW."companyId"
       OR adjustment_row."inventoryLocationId" IS DISTINCT FROM NEW."inventoryLocationId"
       OR adjustment_row."sourceStockCountAttemptId" IS DISTINCT FROM NEW."sourceAttemptId"
       OR adjustment_row."adjustmentType" <> 'COUNT_VARIANCE'
       OR (NEW."adjustmentDisposition" = 'CANCELLED_UNPOSTED' AND (
         adjustment_row."status" <> 'CANCELLED'
         OR adjustment_row."cancelledByUserId" IS NULL
         OR adjustment_row."cancelledAt" IS NULL
         OR NULLIF(BTRIM(adjustment_row."cancellationReason"), '') IS NULL
         OR adjustment_row."postedByUserId" IS NOT NULL
         OR adjustment_row."postedAt" IS NOT NULL
         OR adjustment_row."reversedByUserId" IS NOT NULL
         OR adjustment_row."reversedAt" IS NOT NULL
         OR adjustment_row."reversalReason" IS NOT NULL
       ))
       OR (NEW."adjustmentDisposition" = 'VOIDED_APPROVED_UNPOSTED' AND adjustment_row."status" <> 'VOIDED_FOR_RECOUNT')
       OR (NEW."adjustmentDisposition" = 'VOIDED_APPROVED_UNPOSTED' AND (
         adjustment_row."voidedForRecountByUserId" IS DISTINCT FROM NEW."actorUserId"
         OR adjustment_row."voidedForRecountReason" IS DISTINCT FROM NEW."reason"
         OR adjustment_row."voidedForRecountEvidenceReference" IS DISTINCT FROM NEW."evidenceReference"
         OR adjustment_row."voidedForRecountAt" IS NULL
         OR adjustment_row."voidedForRecountAt" > NEW."occurredAt"
       ))
       OR (NEW."adjustmentDisposition" = 'REVERSED_POSTED' AND (
         adjustment_row."status" <> 'REVERSED'
         OR adjustment_row."postedByUserId" IS NULL
         OR adjustment_row."postedAt" IS NULL
         OR adjustment_row."reversedByUserId" IS NULL
         OR adjustment_row."reversedAt" IS NULL
         OR adjustment_row."reversedAt" < adjustment_row."postedAt"
         OR NULLIF(BTRIM(adjustment_row."reversalReason"), '') IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM "StockAdjustmentLine" l
           WHERE l."stockAdjustmentId" = adjustment_row."id"
         )
         OR EXISTS (
           SELECT 1
           FROM "StockAdjustmentLine" l
           LEFT JOIN "InventoryMovement" original ON original."id" = l."postedMovementId"
           WHERE l."stockAdjustmentId" = adjustment_row."id"
             AND (
               original."id" IS NULL
               OR original."tenantId" IS DISTINCT FROM l."tenantId"
               OR original."companyId" IS DISTINCT FROM l."companyId"
               OR original."inventoryLocationId" IS DISTINCT FROM l."inventoryLocationId"
               OR original."itemId" IS DISTINCT FROM l."itemId"
               OR original."sourceDocumentType" IS DISTINCT FROM 'StockAdjustment'
               OR original."sourceDocumentId" IS DISTINCT FROM adjustment_row."id"
               OR original."sourceDocumentLineId" IS DISTINCT FROM l."id"
               OR original."movementType"::text NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')
               OR (SELECT COUNT(*) FROM "InventoryMovement" reversal
                   WHERE reversal."reversalOfMovementId" = original."id"
                     AND reversal."movementType"::text = 'REVERSAL'
                     AND reversal."tenantId" = original."tenantId"
                     AND reversal."companyId" = original."companyId"
                     AND reversal."inventoryLocationId" = original."inventoryLocationId"
                     AND reversal."itemId" = original."itemId"
                     AND reversal."sourceDocumentType" = 'StockAdjustment'
                     AND reversal."sourceDocumentId" = adjustment_row."id"
                     AND reversal."sourceDocumentLineId" = l."id"
                     AND reversal."quantityDeltaBaseUom" = -original."quantityDeltaBaseUom") <> 1
             )
         )
       ))
       OR (NEW."adjustmentDisposition" IN ('CANCELLED_UNPOSTED', 'VOIDED_APPROVED_UNPOSTED') AND EXISTS (
         SELECT 1 FROM "StockAdjustmentLine" l
         WHERE l."stockAdjustmentId" = adjustment_row."id" AND l."postedMovementId" IS NOT NULL
       )) THEN
      RAISE EXCEPTION 'Stock adjustment disposition is not terminal and recount-safe' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "guard_stock_count_recount_transition_append_only"()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Stock count recount transitions are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION "validate_stock_count_recount_transition_commit"()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "StockCountSession" s
    JOIN "StockCountAttempt" source ON source."id" = NEW."sourceAttemptId"
    JOIN "StockCountAttempt" successor ON successor."id" = NEW."successorAttemptId"
    JOIN "ControlledEvidenceActionQualification" qualification
      ON qualification.id = NEW."controlledEvidenceQualificationId"
     AND qualification."tenantId" = NEW."tenantId"
     AND qualification."companyId" = NEW."companyId"
     AND qualification."actionCode" = 'STOCK_COUNT_RECOUNT_RECOVERY'
     AND qualification."sourceType" = 'StockCountAttempt'
     AND qualification."sourceRecordId" = NEW."sourceAttemptId"
     AND qualification."sourceVersion" = source."version"::text
     AND qualification."actorUserId" = NEW."actorUserId"
     AND qualification."actorAuthSessionId" = NEW."authSessionId"
     AND qualification."idempotencyKey" = NEW."idempotencyKey"
    WHERE s."id" = NEW."stockCountSessionId"
      AND s."status" = 'RECOUNT_REQUESTED'
      AND s."currentAttemptId" = successor."id"
      AND source."status" = 'REVIEWED'
      AND successor."status" = 'DRAFT'
      AND successor."attemptNumber" = source."attemptNumber" + 1
  ) THEN
    RAISE EXCEPTION 'Recount recovery transaction did not commit an exact successor lineage' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "StockCountRecountTransition_insert_guard_trg"
  BEFORE INSERT ON "StockCountRecountTransition"
  FOR EACH ROW EXECUTE FUNCTION "guard_stock_count_recount_transition_insert"();
CREATE TRIGGER "StockCountRecountTransition_append_only_guard_trg"
  BEFORE UPDATE OR DELETE ON "StockCountRecountTransition"
  FOR EACH STATEMENT EXECUTE FUNCTION "guard_stock_count_recount_transition_append_only"();
CREATE CONSTRAINT TRIGGER "StockCountRecountTransition_commit_guard_trg"
  AFTER INSERT ON "StockCountRecountTransition" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "validate_stock_count_recount_transition_commit"();
ALTER TABLE "StockCountRecountTransition" ENABLE ALWAYS TRIGGER "StockCountRecountTransition_insert_guard_trg";
ALTER TABLE "StockCountRecountTransition" ENABLE ALWAYS TRIGGER "StockCountRecountTransition_append_only_guard_trg";
ALTER TABLE "StockCountRecountTransition" ENABLE ALWAYS TRIGGER "StockCountRecountTransition_commit_guard_trg";

CREATE OR REPLACE FUNCTION "guard_stock_adjustment_void_for_recount"()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD."status" = 'APPROVED' AND NEW."status" = 'VOIDED_FOR_RECOUNT'
     AND OLD."postedAt" IS NULL AND OLD."postedByUserId" IS NULL
     AND OLD."voidedForRecountByUserId" IS NULL
     AND OLD."voidedForRecountAt" IS NULL
     AND OLD."voidedForRecountReason" IS NULL
     AND OLD."voidedForRecountEvidenceReference" IS NULL
     AND NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId"
     AND NEW."companyId" IS NOT DISTINCT FROM OLD."companyId"
     AND NEW."inventoryLocationId" IS NOT DISTINCT FROM OLD."inventoryLocationId"
     AND NEW."publicReference" IS NOT DISTINCT FROM OLD."publicReference"
     AND NEW."requestedByUserId" IS NOT DISTINCT FROM OLD."requestedByUserId"
     AND NEW."cancelledByUserId" IS NOT DISTINCT FROM OLD."cancelledByUserId"
     AND NEW."postedByUserId" IS NOT DISTINCT FROM OLD."postedByUserId"
     AND NEW."reversedByUserId" IS NOT DISTINCT FROM OLD."reversedByUserId"
     AND NEW."adjustmentType" IS NOT DISTINCT FROM OLD."adjustmentType"
     AND NEW."reasonCode" IS NOT DISTINCT FROM OLD."reasonCode"
     AND NEW."reasonDescription" IS NOT DISTINCT FROM OLD."reasonDescription"
     AND NEW."evidenceReference" IS NOT DISTINCT FROM OLD."evidenceReference"
     AND NEW."sourceDocumentType" IS NOT DISTINCT FROM OLD."sourceDocumentType"
     AND NEW."sourceDocumentId" IS NOT DISTINCT FROM OLD."sourceDocumentId"
     AND NEW."sourceStockCountSessionId" IS NOT DISTINCT FROM OLD."sourceStockCountSessionId"
     AND NEW."sourceStockCountAttemptId" IS NOT DISTINCT FROM OLD."sourceStockCountAttemptId"
     AND NEW."totalEstimatedValueImpact" IS NOT DISTINCT FROM OLD."totalEstimatedValueImpact"
     AND NEW."submittedAt" IS NOT DISTINCT FROM OLD."submittedAt"
     AND NEW."postedAt" IS NOT DISTINCT FROM OLD."postedAt"
     AND NEW."reversedAt" IS NOT DISTINCT FROM OLD."reversedAt"
     AND NEW."cancelledAt" IS NOT DISTINCT FROM OLD."cancelledAt"
     AND NEW."cancellationReason" IS NOT DISTINCT FROM OLD."cancellationReason"
     AND NEW."reversalReason" IS NOT DISTINCT FROM OLD."reversalReason"
     AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
     AND NOT EXISTS (SELECT 1 FROM "StockAdjustmentLine" l WHERE l."stockAdjustmentId" = OLD."id" AND l."postedMovementId" IS NOT NULL)
     AND NEW."voidedForRecountByUserId" IS NOT NULL
     AND NEW."voidedForRecountAt" IS NOT NULL
     AND NULLIF(BTRIM(NEW."voidedForRecountReason"), '') IS NOT NULL
     AND NULLIF(BTRIM(NEW."voidedForRecountEvidenceReference"), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'VOIDED_FOR_RECOUNT' AND NEW.* IS DISTINCT FROM OLD.* THEN
    RAISE EXCEPTION 'Recount-voided stock adjustment is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW."status" = 'VOIDED_FOR_RECOUNT' THEN
    RAISE EXCEPTION 'Invalid stock adjustment recount-void transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "validate_stock_adjustment_recount_void_commit"()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."status" = 'VOIDED_FOR_RECOUNT' AND NOT EXISTS (
    SELECT 1 FROM "StockCountRecountTransition" t
    WHERE t."linkedStockAdjustmentId" = NEW."id"
      AND t."adjustmentDisposition" = 'VOIDED_APPROVED_UNPOSTED'
  ) THEN
    RAISE EXCEPTION 'Recount-voided adjustment lacks its immutable transition' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "StockAdjustment_recount_void_guard_trg"
  BEFORE UPDATE ON "StockAdjustment" FOR EACH ROW
  EXECUTE FUNCTION "guard_stock_adjustment_void_for_recount"();
CREATE CONSTRAINT TRIGGER "StockAdjustment_recount_void_commit_guard_trg"
  AFTER UPDATE ON "StockAdjustment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW."status" = 'VOIDED_FOR_RECOUNT')
  EXECUTE FUNCTION "validate_stock_adjustment_recount_void_commit"();
ALTER TABLE "StockAdjustment" ENABLE ALWAYS TRIGGER "StockAdjustment_recount_void_guard_trg";
ALTER TABLE "StockAdjustment" ENABLE ALWAYS TRIGGER "StockAdjustment_recount_void_commit_guard_trg";

CREATE OR REPLACE FUNCTION "guard_stock_count_recount_attempt_line"()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."legacyStockCountLineId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "StockCountAttempt" a
    WHERE a."id" = NEW."stockCountAttemptId" AND a."attemptNumber" > 1
  ) THEN
    RAISE EXCEPTION 'Recount attempt lines cannot claim legacy attempt-1 lineage' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StockCountAttemptLine_recount_lineage_guard_trg"
  BEFORE INSERT OR UPDATE ON "StockCountAttemptLine" FOR EACH ROW
  EXECUTE FUNCTION "guard_stock_count_recount_attempt_line"();
ALTER TABLE "StockCountAttemptLine" ENABLE ALWAYS TRIGGER "StockCountAttemptLine_recount_lineage_guard_trg";

REVOKE ALL ON FUNCTION "guard_stock_count_recount_transition_insert"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "guard_stock_count_recount_transition_append_only"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_stock_count_recount_transition_commit"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "guard_stock_adjustment_void_for_recount"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_stock_adjustment_recount_void_commit"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "guard_stock_count_recount_attempt_line"() FROM PUBLIC;

COMMIT;
