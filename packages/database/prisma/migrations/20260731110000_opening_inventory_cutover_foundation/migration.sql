-- DEC-0263 opening-inventory cutover foundation.  This migration is additive
-- and intentionally creates neither cohorts, cutovers, commands, nor ledger
-- movements.  Execution authority is installed separately by the executor
-- control-plane migration.

ALTER TYPE "InventoryPilotEndpointCapability"
  ADD VALUE IF NOT EXISTS 'OPENING_STOCK_LOCATION';

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE TYPE "OpeningInventoryCohortStatus" AS ENUM (
  'DRAFT', 'SEALED', 'FROZEN', 'STAGED', 'ACTIVE', 'CANCELLED', 'REVERSING', 'REVERSED'
);
CREATE TYPE "OpeningInventoryCutoverStatus" AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'RETURNED', 'REJECTED', 'APPROVED',
  'RECONCILED', 'ACTIVE', 'CANCELLED', 'REVERSING', 'REVERSED'
);
CREATE TYPE "OpeningInventoryCohortEventType" AS ENUM (
  'COHORT_SEALED', 'COHORT_FROZEN', 'LOCATION_STAGED', 'COHORT_ACTIVATED',
  'COHORT_CANCELLED', 'COHORT_REVERSAL_REQUESTED', 'COHORT_REVERSED'
);
CREATE TYPE "OpeningInventoryExecutionCommandType" AS ENUM (
  'FREEZE_COHORT', 'STAGE_LOCATION', 'ACTIVATE_COHORT', 'REVERSE_LOCATION'
);
CREATE TYPE "OpeningInventoryExecutionCommandStatus" AS ENUM (
  'PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED'
);

CREATE UNIQUE INDEX "Uom_exact_scope_key" ON "Uom"(id, "tenantId", "companyId");
CREATE UNIQUE INDEX "StockCountAttemptLine_exact_scope_key"
  ON "StockCountAttemptLine"(id, "tenantId", "companyId", "inventoryLocationId", "stockCountAttemptId");

CREATE TABLE "OpeningInventoryCohort" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "configurationRevisionId" UUID NOT NULL,
  "configurationRevisionNumber" INTEGER NOT NULL,
  "configurationDigest" CHAR(64) NOT NULL,
  "publicReference" VARCHAR(64) NOT NULL,
  "predecessorCohortId" UUID UNIQUE,
  generation INTEGER NOT NULL DEFAULT 1,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  status "OpeningInventoryCohortStatus" NOT NULL DEFAULT 'DRAFT',
  "canonicalJson" TEXT NOT NULL,
  "cohortDigest" CHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" UUID NOT NULL,
  "sealedByUserId" UUID,
  "sealedAt" TIMESTAMP(3),
  "frozenByUserId" UUID,
  "frozenAt" TIMESTAMP(3),
  "activatedByUserId" UUID,
  "activatedAt" TIMESTAMP(3),
  "cancelledByUserId" UUID,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "reversedByUserId" UUID,
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpeningInventoryCohort_pkey" PRIMARY KEY (id),
  CONSTRAINT "OpeningInventoryCohort_identity_check" CHECK (
    "configurationRevisionNumber" > 0 AND generation > 0 AND version > 0
    AND length(BTRIM("publicReference")) BETWEEN 1 AND 64
    AND "configurationDigest" ~ '^[a-f0-9]{64}$' AND "cohortDigest" ~ '^[a-f0-9]{64}$'
    AND NULLIF(BTRIM("canonicalJson"), '') IS NOT NULL
  )
);
CREATE UNIQUE INDEX "OpeningInventoryCohort_revision_effective_generation_key"
  ON "OpeningInventoryCohort"("tenantId", "companyId", "configurationRevisionId", "effectiveAt", generation);
CREATE UNIQUE INDEX "OpeningInventoryCohort_company_public_reference_key"
  ON "OpeningInventoryCohort"("companyId", "publicReference");
CREATE UNIQUE INDEX "OpeningInventoryCohort_exact_scope_key"
  ON "OpeningInventoryCohort"(id, "tenantId", "companyId");
CREATE UNIQUE INDEX "OpeningInventoryCohort_state_exact_key"
  ON "OpeningInventoryCohort"(id, "tenantId", "companyId", version, status);
CREATE INDEX "OpeningInventoryCohort_scope_status_effective_idx"
  ON "OpeningInventoryCohort"("tenantId", "companyId", status, "effectiveAt");
ALTER TABLE "OpeningInventoryCohort"
  ADD CONSTRAINT "OpeningInventoryCohort_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohort_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohort_revision_exact_fkey"
    FOREIGN KEY ("configurationRevisionId", "tenantId", "companyId", "configurationRevisionNumber", "configurationDigest")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohort_predecessor_fkey" FOREIGN KEY ("predecessorCohortId")
    REFERENCES "OpeningInventoryCohort"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohort_creator_scope_fkey" FOREIGN KEY ("createdByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohort_sealer_scope_fkey" FOREIGN KEY ("sealedByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohort_freezer_scope_fkey" FOREIGN KEY ("frozenByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohort_activator_scope_fkey" FOREIGN KEY ("activatedByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohort_canceller_scope_fkey" FOREIGN KEY ("cancelledByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohort_reverser_scope_fkey" FOREIGN KEY ("reversedByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OpeningInventoryCutover" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "stockCountSessionId" UUID NOT NULL,
  "stockCountAttemptId" UUID NOT NULL,
  status "OpeningInventoryCutoverStatus" NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "evidenceManifestJson" TEXT NOT NULL,
  "evidenceDigest" CHAR(64) NOT NULL,
  "valuationCanonicalJson" TEXT NOT NULL,
  "valuationDigest" CHAR(64) NOT NULL,
  "cutoverCanonicalJson" TEXT NOT NULL,
  "cutoverDigest" CHAR(64) NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "approvalInstanceId" UUID,
  "approvedAt" TIMESTAMP(3),
  "stagedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "reversalRequestedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpeningInventoryCutover_pkey" PRIMARY KEY (id),
  CONSTRAINT "OpeningInventoryCutover_identity_check" CHECK (
    version > 0 AND length(BTRIM("idempotencyKey")) BETWEEN 1 AND 160
    AND "evidenceDigest" ~ '^[a-f0-9]{64}$' AND "valuationDigest" ~ '^[a-f0-9]{64}$'
    AND "cutoverDigest" ~ '^[a-f0-9]{64}$'
    AND NULLIF(BTRIM("evidenceManifestJson"), '') IS NOT NULL AND NULLIF(BTRIM("valuationCanonicalJson"), '') IS NOT NULL
    AND NULLIF(BTRIM("cutoverCanonicalJson"), '') IS NOT NULL
  )
);
CREATE UNIQUE INDEX "OpeningInventoryCutover_cohort_location_key"
  ON "OpeningInventoryCutover"("cohortId", "inventoryLocationId");
CREATE UNIQUE INDEX "OpeningInventoryCutover_cohort_idempotency_key"
  ON "OpeningInventoryCutover"("cohortId", "idempotencyKey");
CREATE UNIQUE INDEX "OpeningInventoryCutover_exact_scope_key"
  ON "OpeningInventoryCutover"(id, "tenantId", "companyId", "inventoryLocationId");
CREATE INDEX "OpeningInventoryCutover_scope_location_status_idx"
  ON "OpeningInventoryCutover"("tenantId", "companyId", "inventoryLocationId", status);
ALTER TABLE "OpeningInventoryCutover"
  ADD CONSTRAINT "OpeningInventoryCutover_cohort_exact_fkey" FOREIGN KEY ("cohortId", "tenantId", "companyId")
    REFERENCES "OpeningInventoryCohort"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutover_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutover_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutover_inventory_location_exact_fkey"
    FOREIGN KEY ("inventoryLocationId", "tenantId", "companyId", "locationId")
    REFERENCES "InventoryLocation"(id, "tenantId", "companyId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutover_attempt_exact_fkey"
    FOREIGN KEY ("stockCountAttemptId", "tenantId", "companyId", "stockCountSessionId")
    REFERENCES "StockCountAttempt"(id, "tenantId", "companyId", "stockCountSessionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutover_requester_scope_fkey" FOREIGN KEY ("requestedByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutover_reviewer_scope_fkey" FOREIGN KEY ("reviewedByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OpeningInventoryCutoverLine" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "cutoverId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "uomId" UUID NOT NULL,
  "stockCountAttemptId" UUID NOT NULL,
  "stockCountAttemptLineId" UUID NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "lotKey" TEXT NOT NULL,
  "lotNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "sourceSystemQuantityBaseUom" DECIMAL(18,6) NOT NULL,
  "sourceCountedQuantityBaseUom" DECIMAL(18,6) NOT NULL,
  "sourceVarianceQuantityBaseUom" DECIMAL(18,6) NOT NULL,
  "openingQuantityBaseUom" DECIMAL(18,6) NOT NULL,
  "unitCost" DECIMAL(18,6) NOT NULL,
  "openingValue" DECIMAL(18,6) NOT NULL,
  "lineCanonicalJson" TEXT NOT NULL,
  "lineDigest" CHAR(64) NOT NULL,
  "postedMovementId" UUID UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpeningInventoryCutoverLine_pkey" PRIMARY KEY (id),
  CONSTRAINT "OpeningInventoryCutoverLine_identity_check" CHECK (
    "lineNumber" > 0 AND length(BTRIM("lotKey")) > 0 AND "lineDigest" ~ '^[a-f0-9]{64}$' AND NULLIF(BTRIM("lineCanonicalJson"), '') IS NOT NULL
    AND "sourceCountedQuantityBaseUom" >= 0 AND "openingQuantityBaseUom" >= 0 AND "unitCost" >= 0 AND "openingValue" >= 0
    AND "openingQuantityBaseUom" = "sourceCountedQuantityBaseUom"
    AND "sourceVarianceQuantityBaseUom" = "sourceCountedQuantityBaseUom" - "sourceSystemQuantityBaseUom"
    AND "openingValue" = "openingQuantityBaseUom" * "unitCost"
  )
);
CREATE UNIQUE INDEX "OpeningInventoryCutoverLine_cutover_line_key" ON "OpeningInventoryCutoverLine"("cutoverId", "lineNumber");
CREATE UNIQUE INDEX "OpeningInventoryCutoverLine_cutover_attempt_line_key" ON "OpeningInventoryCutoverLine"("cutoverId", "stockCountAttemptLineId");
CREATE UNIQUE INDEX "OpeningInventoryCutoverLine_cutover_stock_key" ON "OpeningInventoryCutoverLine"("cutoverId", "itemId", "lotKey");
CREATE INDEX "OpeningInventoryCutoverLine_scope_stock_key_idx" ON "OpeningInventoryCutoverLine"("tenantId", "companyId", "inventoryLocationId", "itemId", "lotKey");
ALTER TABLE "OpeningInventoryCutoverLine"
  ADD CONSTRAINT "OpeningInventoryCutoverLine_cutover_exact_fkey"
    FOREIGN KEY ("cutoverId", "tenantId", "companyId", "inventoryLocationId")
    REFERENCES "OpeningInventoryCutover"(id, "tenantId", "companyId", "inventoryLocationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutoverLine_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutoverLine_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutoverLine_item_exact_fkey" FOREIGN KEY ("itemId", "tenantId", "companyId")
    REFERENCES "Item"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutoverLine_uom_exact_fkey" FOREIGN KEY ("uomId", "tenantId", "companyId")
    REFERENCES "Uom"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutoverLine_attempt_line_exact_fkey"
    FOREIGN KEY ("stockCountAttemptLineId", "tenantId", "companyId", "inventoryLocationId", "stockCountAttemptId")
    REFERENCES "StockCountAttemptLine"(id, "tenantId", "companyId", "inventoryLocationId", "stockCountAttemptId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCutoverLine_movement_fkey" FOREIGN KEY ("postedMovementId")
    REFERENCES "InventoryMovement"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OpeningInventoryReconciliation" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "cutoverId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "reconciliationType" VARCHAR(48) NOT NULL,
  "lineCount" INTEGER NOT NULL,
  "quantityDigest" CHAR(64) NOT NULL,
  "valuationDigest" CHAR(64) NOT NULL,
  "reconciliationJson" TEXT NOT NULL,
  "reconciliationDigest" CHAR(64) NOT NULL,
  "reconciledByUserId" UUID NOT NULL,
  "reconciledAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpeningInventoryReconciliation_pkey" PRIMARY KEY (id),
  CONSTRAINT "OpeningInventoryReconciliation_identity_check" CHECK (
    "lineCount" >= 0 AND length(BTRIM("reconciliationType")) BETWEEN 1 AND 48
    AND "quantityDigest" ~ '^[a-f0-9]{64}$' AND "valuationDigest" ~ '^[a-f0-9]{64}$'
    AND "reconciliationDigest" ~ '^[a-f0-9]{64}$' AND NULLIF(BTRIM("reconciliationJson"), '') IS NOT NULL
  )
);
CREATE UNIQUE INDEX "OpeningInventoryReconciliation_cutover_type_key" ON "OpeningInventoryReconciliation"("cutoverId", "reconciliationType");
CREATE INDEX "OpeningInventoryReconciliation_scope_reconciled_idx" ON "OpeningInventoryReconciliation"("tenantId", "companyId", "inventoryLocationId", "reconciledAt");
ALTER TABLE "OpeningInventoryReconciliation"
  ADD CONSTRAINT "OpeningInventoryReconciliation_cutover_exact_fkey"
    FOREIGN KEY ("cutoverId", "tenantId", "companyId", "inventoryLocationId")
    REFERENCES "OpeningInventoryCutover"(id, "tenantId", "companyId", "inventoryLocationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryReconciliation_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryReconciliation_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryReconciliation_actor_scope_fkey" FOREIGN KEY ("reconciledByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OpeningInventoryApprovalAttestation" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "cutoverId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "approvalInstanceId" UUID NOT NULL,
  "approvalInstanceStepId" UUID NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "decisionActorUserId" UUID NOT NULL,
  "requiredPermissionId" UUID NOT NULL,
  "requiredPermissionCode" VARCHAR(160) NOT NULL,
  "authSessionId" UUID NOT NULL,
  "privilegeEpochAtIssue" INTEGER NOT NULL,
  "mfaVerifiedAt" TIMESTAMP(3) NOT NULL,
  "mfaMode" VARCHAR(48) NOT NULL,
  "mfaValidUntil" TIMESTAMP(3) NOT NULL,
  decision VARCHAR(24) NOT NULL DEFAULT 'APPROVED',
  "actedAt" TIMESTAMP(3) NOT NULL,
  "canonicalJson" TEXT NOT NULL,
  "attestationDigest" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpeningInventoryApprovalAttestation_pkey" PRIMARY KEY (id),
  CONSTRAINT "OpeningInventoryApprovalAttestation_identity_check" CHECK (
    "stepOrder" > 0 AND "privilegeEpochAtIssue" >= 0 AND decision = 'APPROVED'
    AND "mfaValidUntil" >= "mfaVerifiedAt" AND length(BTRIM("requiredPermissionCode")) BETWEEN 1 AND 160 AND length(BTRIM("mfaMode")) BETWEEN 1 AND 48
    AND "attestationDigest" ~ '^[a-f0-9]{64}$' AND NULLIF(BTRIM("canonicalJson"), '') IS NOT NULL
  )
);
CREATE UNIQUE INDEX "OpeningInventoryApprovalAttestation_cutover_step_key" ON "OpeningInventoryApprovalAttestation"("cutoverId", "approvalInstanceStepId");
CREATE INDEX "OpeningInventoryApprovalAttestation_scope_instance_acted_idx" ON "OpeningInventoryApprovalAttestation"("tenantId", "companyId", "approvalInstanceId", "actedAt");
ALTER TABLE "OpeningInventoryApprovalAttestation"
  ADD CONSTRAINT "OpeningInventoryApprovalAttestation_cutover_exact_fkey"
    FOREIGN KEY ("cutoverId", "tenantId", "companyId", "inventoryLocationId")
    REFERENCES "OpeningInventoryCutover"(id, "tenantId", "companyId", "inventoryLocationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryApprovalAttestation_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryApprovalAttestation_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryApprovalAttestation_instance_fkey" FOREIGN KEY ("approvalInstanceId", "tenantId", "companyId")
    REFERENCES "ApprovalInstance"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryApprovalAttestation_step_fkey" FOREIGN KEY ("approvalInstanceStepId", "approvalInstanceId")
    REFERENCES "ApprovalInstanceStep"(id, "approvalInstanceId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryApprovalAttestation_actor_scope_fkey" FOREIGN KEY ("decisionActorUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryApprovalAttestation_permission_fkey" FOREIGN KEY ("requiredPermissionId")
    REFERENCES "Permission"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryApprovalAttestation_auth_session_fkey" FOREIGN KEY ("authSessionId", "tenantId", "decisionActorUserId")
    REFERENCES "AuthSession"(id, "tenantId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OpeningInventoryCohortEvent" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "eventType" "OpeningInventoryCohortEventType" NOT NULL,
  "priorEventId" UUID,
  "canonicalJson" TEXT NOT NULL,
  "eventDigest" CHAR(64) NOT NULL,
  "actorUserId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpeningInventoryCohortEvent_pkey" PRIMARY KEY (id),
  CONSTRAINT "OpeningInventoryCohortEvent_identity_check" CHECK (
    "sequenceNumber" > 0 AND "eventDigest" ~ '^[a-f0-9]{64}$' AND NULLIF(BTRIM("canonicalJson"), '') IS NOT NULL
  )
);
CREATE UNIQUE INDEX "OpeningInventoryCohortEvent_cohort_sequence_key" ON "OpeningInventoryCohortEvent"("cohortId", "sequenceNumber");
CREATE UNIQUE INDEX "OpeningInventoryCohortEvent_prior_successor_key" ON "OpeningInventoryCohortEvent"("priorEventId");
CREATE INDEX "OpeningInventoryCohortEvent_scope_occurred_idx" ON "OpeningInventoryCohortEvent"("tenantId", "companyId", "cohortId", "occurredAt");
ALTER TABLE "OpeningInventoryCohortEvent"
  ADD CONSTRAINT "OpeningInventoryCohortEvent_cohort_exact_fkey" FOREIGN KEY ("cohortId", "tenantId", "companyId")
    REFERENCES "OpeningInventoryCohort"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohortEvent_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohortEvent_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohortEvent_prior_fkey" FOREIGN KEY ("priorEventId")
    REFERENCES "OpeningInventoryCohortEvent"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryCohortEvent_actor_scope_fkey" FOREIGN KEY ("actorUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OpeningInventoryExecutionCommand" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL,
  "cutoverId" UUID,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "commandType" "OpeningInventoryExecutionCommandType" NOT NULL,
  status "OpeningInventoryExecutionCommandStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "expectedCohortVersion" INTEGER NOT NULL,
  "expectedCutoverVersion" INTEGER,
  "canonicalJson" TEXT NOT NULL,
  "commandDigest" CHAR(64) NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "requestedAuthSessionId" UUID NOT NULL,
  "requestedPrivilegeEpoch" INTEGER NOT NULL,
  "requestedMfaVerifiedAt" TIMESTAMP(3) NOT NULL,
  "requestedMfaMode" VARCHAR(48) NOT NULL,
  "requestedMfaValidUntil" TIMESTAMP(3) NOT NULL,
  "requiredPermissionCode" VARCHAR(160) NOT NULL,
  "requestReason" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "claimedByExecutor" VARCHAR(120),
  "completedAt" TIMESTAMP(3),
  "failureCode" VARCHAR(120),
  "failureDetail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpeningInventoryExecutionCommand_pkey" PRIMARY KEY (id),
  CONSTRAINT "OpeningInventoryExecutionCommand_identity_check" CHECK (
    "expectedCohortVersion" > 0 AND ("expectedCutoverVersion" IS NULL OR "expectedCutoverVersion" > 0)
    AND length(BTRIM("idempotencyKey")) BETWEEN 1 AND 160
    AND "requestedPrivilegeEpoch" >= 0 AND "requestedMfaValidUntil" >= "requestedMfaVerifiedAt"
    AND length(BTRIM("requestedMfaMode")) BETWEEN 1 AND 48
    AND length(BTRIM("requiredPermissionCode")) BETWEEN 1 AND 160 AND length(BTRIM("requestReason")) BETWEEN 1 AND 2000
    AND "commandDigest" ~ '^[a-f0-9]{64}$' AND NULLIF(BTRIM("canonicalJson"), '') IS NOT NULL
    AND (("commandType" IN ('FREEZE_COHORT', 'ACTIVATE_COHORT') AND "cutoverId" IS NULL AND "expectedCutoverVersion" IS NULL)
      OR ("commandType" IN ('STAGE_LOCATION', 'REVERSE_LOCATION') AND "cutoverId" IS NOT NULL AND "expectedCutoverVersion" IS NOT NULL))
  )
);
CREATE UNIQUE INDEX "OpeningInventoryExecutionCommand_cohort_idempotency_key" ON "OpeningInventoryExecutionCommand"("cohortId", "idempotencyKey");
CREATE INDEX "OpeningInventoryExecutionCommand_scope_status_requested_idx" ON "OpeningInventoryExecutionCommand"("tenantId", "companyId", status, "requestedAt");
ALTER TABLE "OpeningInventoryExecutionCommand"
  ADD CONSTRAINT "OpeningInventoryExecutionCommand_cohort_exact_fkey" FOREIGN KEY ("cohortId", "tenantId", "companyId")
    REFERENCES "OpeningInventoryCohort"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryExecutionCommand_cutover_fkey" FOREIGN KEY ("cutoverId")
    REFERENCES "OpeningInventoryCutover"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryExecutionCommand_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryExecutionCommand_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryExecutionCommand_requester_scope_fkey" FOREIGN KEY ("requestedByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpeningInventoryExecutionCommand_requester_session_fkey" FOREIGN KEY ("requestedAuthSessionId", "tenantId", "requestedByUserId")
    REFERENCES "AuthSession"(id, "tenantId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.is_opening_inventory_executor_session()
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT count(*) = 1
    FROM pg_roles executor_role
   WHERE executor_role.rolname LIKE '%\_opening\_stock\_executor' ESCAPE '\'
     AND pg_has_role(session_user, executor_role.oid, 'member')
$$;

CREATE OR REPLACE FUNCTION public.is_opening_inventory_executor_context()
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT public.is_opening_inventory_executor_session()
      OR current_user = (SELECT p.proowner::regrole::text FROM pg_proc p WHERE p.oid = to_regprocedure('public.execute_opening_inventory_command(uuid)'))
$$;

CREATE OR REPLACE FUNCTION public.opening_inventory_utc_json_timestamp(value timestamp)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT to_char(value, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

CREATE OR REPLACE FUNCTION public.assert_opening_inventory_cohort_manifest(cohort_id UUID)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE cohort_row public."OpeningInventoryCohort"%ROWTYPE; expected jsonb;
BEGIN
  SELECT * INTO cohort_row FROM public."OpeningInventoryCohort" WHERE id = cohort_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPENING_INVENTORY_COHORT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT jsonb_build_object(
    'configurationDigest', cohort_row."configurationDigest", 'configurationRevisionId', cohort_row."configurationRevisionId"::text,
    'configurationRevisionNumber', cohort_row."configurationRevisionNumber", 'effectiveAt', public.opening_inventory_utc_json_timestamp(cohort_row."effectiveAt"),
    'endpointInventoryLocationIds', COALESCE(jsonb_agg(to_jsonb(endpoint."inventoryLocationId"::text) ORDER BY endpoint."inventoryLocationId"), '[]'::jsonb),
    'generation', cohort_row.generation, 'itemIds', (
      SELECT COALESCE(jsonb_agg(to_jsonb(item_membership."itemId"::text) ORDER BY item_membership."itemId"), '[]'::jsonb)
        FROM public."InventoryPilotItemMembership" item_membership
       WHERE item_membership."configurationRevisionId" = cohort_row."configurationRevisionId" AND item_membership."tenantId" = cohort_row."tenantId"
         AND item_membership."companyId" = cohort_row."companyId" AND item_membership."configurationRevisionNumber" = cohort_row."configurationRevisionNumber"
    ), 'predecessorCohortId', CASE WHEN cohort_row."predecessorCohortId" IS NULL THEN 'null'::jsonb ELSE to_jsonb(cohort_row."predecessorCohortId"::text) END
  ) INTO expected
    FROM public."InventoryPilotEndpointMembership" endpoint
   WHERE endpoint."configurationRevisionId" = cohort_row."configurationRevisionId" AND endpoint."tenantId" = cohort_row."tenantId"
     AND endpoint."companyId" = cohort_row."companyId" AND endpoint."configurationRevisionNumber" = cohort_row."configurationRevisionNumber"
     AND endpoint.capability = 'OPENING_STOCK_LOCATION';
  IF cohort_row."canonicalJson"::jsonb IS DISTINCT FROM expected
     OR encode(public.digest(cohort_row."canonicalJson", 'sha256'), 'hex') <> cohort_row."cohortDigest" THEN
    RAISE EXCEPTION 'OPENING_INVENTORY_COHORT_MANIFEST_INVALID' USING ERRCODE = '55000';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.assert_opening_inventory_cutover_facts(cutover_id UUID)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE cutover_row public."OpeningInventoryCutover"%ROWTYPE; line_row public."OpeningInventoryCutoverLine"%ROWTYPE; expected_line jsonb; expected_valuation jsonb; expected_cutover jsonb; attempt_cutoff timestamp; session_cutoff timestamp;
BEGIN
  SELECT * INTO cutover_row
    FROM public."OpeningInventoryCutover" cutover
   WHERE cutover.id = cutover_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPENING_INVENTORY_CUTOVER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT attempt."cutoffAt", session."cutoffAt" INTO attempt_cutoff, session_cutoff
    FROM public."StockCountAttempt" attempt
    JOIN public."StockCountSession" session ON session.id = cutover_row."stockCountSessionId"
   WHERE attempt.id = cutover_row."stockCountAttemptId";
  IF NOT FOUND THEN RAISE EXCEPTION 'OPENING_INVENTORY_SOURCE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  FOR line_row IN SELECT * FROM public."OpeningInventoryCutoverLine" WHERE "cutoverId" = cutover_row.id ORDER BY "lineNumber" LOOP
    expected_line := jsonb_build_object(
      'expiryDate', CASE WHEN line_row."expiryDate" IS NULL THEN 'null'::jsonb ELSE to_jsonb(public.opening_inventory_utc_json_timestamp(line_row."expiryDate")) END,
      'itemId', line_row."itemId"::text, 'lineNumber', line_row."lineNumber", 'lotKey', line_row."lotKey",
      'lotNumber', CASE WHEN line_row."lotNumber" IS NULL THEN 'null'::jsonb ELSE to_jsonb(line_row."lotNumber") END,
      'openingQuantityBaseUom', line_row."openingQuantityBaseUom", 'openingValue', line_row."openingValue",
      'sourceCountedQuantityBaseUom', line_row."sourceCountedQuantityBaseUom", 'sourceSystemQuantityBaseUom', line_row."sourceSystemQuantityBaseUom", 'sourceVarianceQuantityBaseUom', line_row."sourceVarianceQuantityBaseUom",
      'stockCountAttemptLineId', line_row."stockCountAttemptLineId"::text, 'unitCost', line_row."unitCost", 'uomId', line_row."uomId"::text
    );
    IF line_row."lineCanonicalJson"::jsonb IS DISTINCT FROM expected_line
       OR encode(public.digest(line_row."lineCanonicalJson", 'sha256'), 'hex') <> line_row."lineDigest" THEN
      RAISE EXCEPTION 'OPENING_INVENTORY_LINE_DIGEST_INVALID' USING ERRCODE = '55000';
    END IF;
  END LOOP;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('itemId', line."itemId"::text, 'lotKey', line."lotKey", 'unitCost', line."unitCost") ORDER BY line."itemId", line."lotKey"), '[]'::jsonb)
    INTO expected_valuation FROM public."OpeningInventoryCutoverLine" line WHERE line."cutoverId" = cutover_row.id;
  IF cutover_row."valuationCanonicalJson"::jsonb IS DISTINCT FROM expected_valuation
     OR encode(public.digest(cutover_row."valuationCanonicalJson", 'sha256'), 'hex') <> cutover_row."valuationDigest" THEN
    RAISE EXCEPTION 'OPENING_INVENTORY_VALUATION_DIGEST_INVALID' USING ERRCODE = '55000';
  END IF;
  SELECT jsonb_build_object(
    'attemptCutoffAt', public.opening_inventory_utc_json_timestamp(attempt_cutoff), 'cutoverVersion', 2,
    'evidenceDigest', cutover_row."evidenceDigest", 'lines', COALESCE(jsonb_agg(jsonb_build_object('lineCanonicalJson', line."lineCanonicalJson"::jsonb, 'lineDigest', line."lineDigest", 'lineNumber', line."lineNumber") ORDER BY line."lineNumber"), '[]'::jsonb),
    'sessionCutoffAt', public.opening_inventory_utc_json_timestamp(session_cutoff), 'stockCountAttemptId', cutover_row."stockCountAttemptId"::text,
    'valuationDigest', cutover_row."valuationDigest"
  ) INTO expected_cutover FROM public."OpeningInventoryCutoverLine" line WHERE line."cutoverId" = cutover_row.id;
  IF cutover_row."cutoverCanonicalJson"::jsonb IS DISTINCT FROM expected_cutover
     OR encode(public.digest(cutover_row."cutoverCanonicalJson", 'sha256'), 'hex') <> cutover_row."cutoverDigest" THEN
    RAISE EXCEPTION 'OPENING_INVENTORY_CUTOVER_DIGEST_INVALID' USING ERRCODE = '55000';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_opening_inventory_cohort_manifest(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_opening_inventory_cutover_facts(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.assert_opening_inventory_command_requester_segregation(cohort_id UUID, requester_id UUID, command_type "OpeningInventoryExecutionCommandType")
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."OpeningInventoryCohort" cohort
     WHERE cohort.id = cohort_id AND cohort."createdByUserId" = requester_id
  ) OR EXISTS (
    SELECT 1 FROM public."OpeningInventoryCutover" cutover
     WHERE cutover."cohortId" = cohort_id AND requester_id IN (cutover."requestedByUserId", cutover."reviewedByUserId")
  ) OR EXISTS (
    SELECT 1 FROM public."OpeningInventoryCutover" cutover JOIN public."StockCountAttempt" attempt ON attempt.id = cutover."stockCountAttemptId"
     WHERE cutover."cohortId" = cohort_id AND requester_id IN (attempt."createdByUserId", attempt."assignedToUserId", attempt."reviewedByUserId")
  ) OR EXISTS (
    SELECT 1 FROM public."OpeningInventoryCutover" cutover JOIN public."StockCountAttemptLine" line ON line."stockCountAttemptId" = cutover."stockCountAttemptId"
     WHERE cutover."cohortId" = cohort_id AND line."countedByUserId" = requester_id
  ) OR EXISTS (
    SELECT 1 FROM public."OpeningInventoryCutover" cutover JOIN public."OpeningInventoryApprovalAttestation" attestation ON attestation."cutoverId" = cutover.id
     WHERE cutover."cohortId" = cohort_id AND attestation."decisionActorUserId" = requester_id
  ) OR (command_type = 'ACTIVATE_COHORT' AND EXISTS (
    SELECT 1 FROM public."OpeningInventoryExecutionCommand" prior_command
     WHERE prior_command."cohortId" = cohort_id AND prior_command."commandType" = 'STAGE_LOCATION' AND prior_command.status = 'SUCCEEDED'
       AND prior_command."requestedByUserId" = requester_id
  )) THEN
    RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_REQUESTER_SOD_DENIED' USING ERRCODE = '42501';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_opening_inventory_command_requester_segregation(UUID, UUID, "OpeningInventoryExecutionCommandType") FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_cohort()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE predecessor public."OpeningInventoryCohort"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' OR NEW."sealedByUserId" IS NOT NULL OR NEW."sealedAt" IS NOT NULL
       OR NEW."frozenByUserId" IS NOT NULL OR NEW."frozenAt" IS NOT NULL OR NEW."activatedByUserId" IS NOT NULL OR NEW."activatedAt" IS NOT NULL
       OR NEW."cancelledByUserId" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL OR NEW."cancellationReason" IS NOT NULL
       OR NEW."reversedByUserId" IS NOT NULL OR NEW."reversedAt" IS NOT NULL OR NEW."reversalReason" IS NOT NULL THEN
      RAISE EXCEPTION 'Opening inventory cohort must begin as a clean draft' USING ERRCODE = '55000';
    END IF;
    IF NEW."predecessorCohortId" IS NOT NULL THEN
      SELECT * INTO predecessor FROM public."OpeningInventoryCohort" WHERE id = NEW."predecessorCohortId" FOR UPDATE;
      IF NOT FOUND OR predecessor."tenantId" <> NEW."tenantId" OR predecessor."companyId" <> NEW."companyId"
         OR predecessor.status <> 'REVERSED' OR NEW.generation <> predecessor.generation + 1 THEN
        RAISE EXCEPTION 'Opening inventory recovery cohort lineage is invalid' USING ERRCODE = '55000';
      END IF;
    ELSIF NEW.generation <> 1 THEN RAISE EXCEPTION 'Opening inventory root cohort generation is invalid' USING ERRCODE = '55000'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Opening inventory cohorts are immutable' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
       OR NEW."configurationRevisionId" IS DISTINCT FROM OLD."configurationRevisionId" OR NEW."configurationRevisionNumber" IS DISTINCT FROM OLD."configurationRevisionNumber"
       OR NEW."configurationDigest" IS DISTINCT FROM OLD."configurationDigest" OR NEW."effectiveAt" IS DISTINCT FROM OLD."effectiveAt"
       OR NEW."publicReference" IS DISTINCT FROM OLD."publicReference"
       OR NEW."predecessorCohortId" IS DISTINCT FROM OLD."predecessorCohortId" OR NEW.generation IS DISTINCT FROM OLD.generation
       OR ((NEW."canonicalJson" IS DISTINCT FROM OLD."canonicalJson" OR NEW."cohortDigest" IS DISTINCT FROM OLD."cohortDigest")
          AND NOT (OLD.status = 'DRAFT' AND NEW.status = 'SEALED' AND encode(public.digest(NEW."canonicalJson", 'sha256'), 'hex') = NEW."cohortDigest"))
       OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Opening inventory cohort identity is immutable' USING ERRCODE = '55000';
    END IF;
    IF NEW.version <> OLD.version + 1 OR NOT (
      (OLD.status = 'DRAFT' AND NEW.status IN ('SEALED','CANCELLED')) OR
      (OLD.status = 'SEALED' AND NEW.status IN ('FROZEN','CANCELLED')) OR
      (OLD.status = 'FROZEN' AND NEW.status IN ('STAGED','REVERSING','CANCELLED')) OR
      (OLD.status = 'STAGED' AND NEW.status IN ('ACTIVE','REVERSING','CANCELLED')) OR
      (OLD.status = 'REVERSING' AND NEW.status = 'REVERSED')
    ) THEN RAISE EXCEPTION 'Opening inventory cohort transition is invalid' USING ERRCODE = '55000'; END IF;
    IF NOT public.is_opening_inventory_executor_context() AND (
      NEW."frozenByUserId" IS DISTINCT FROM OLD."frozenByUserId" OR NEW."frozenAt" IS DISTINCT FROM OLD."frozenAt"
      OR NEW."activatedByUserId" IS DISTINCT FROM OLD."activatedByUserId" OR NEW."activatedAt" IS DISTINCT FROM OLD."activatedAt"
      OR NEW."reversedByUserId" IS DISTINCT FROM OLD."reversedByUserId" OR NEW."reversedAt" IS DISTINCT FROM OLD."reversedAt"
      OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason"
    ) THEN RAISE EXCEPTION 'Opening inventory cohort execution facts require isolated executor' USING ERRCODE = '42501'; END IF;
    IF OLD.status = 'DRAFT' AND NEW.status = 'SEALED' AND (NEW."sealedByUserId" IS NULL OR NEW."sealedAt" IS NULL
      OR NEW."frozenByUserId" IS NOT NULL OR NEW."activatedByUserId" IS NOT NULL OR NEW."reversedByUserId" IS NOT NULL) THEN
      RAISE EXCEPTION 'Opening inventory cohort seal facts are invalid' USING ERRCODE = '55000';
    END IF;
    IF OLD.status IN ('SEALED', 'FROZEN', 'STAGED', 'ACTIVE', 'REVERSING')
       AND NOT public.is_opening_inventory_executor_context() THEN
      RAISE EXCEPTION 'Opening inventory cohort execution requires isolated executor' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_cutover()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE cohort_revision UUID; endpoint_exists boolean; session_ok boolean;
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.status <> 'DRAFT' OR NEW."reviewedByUserId" IS NOT NULL OR NEW."reviewedAt" IS NOT NULL
      OR NEW."approvalInstanceId" IS NOT NULL OR NEW."approvedAt" IS NOT NULL OR NEW."stagedAt" IS NOT NULL OR NEW."reconciledAt" IS NOT NULL
      OR NEW."cancelledAt" IS NOT NULL OR NEW."cancellationReason" IS NOT NULL OR NEW."reversalRequestedAt" IS NOT NULL
      OR NEW."reversedAt" IS NOT NULL OR NEW."reversalReason" IS NOT NULL) THEN
    RAISE EXCEPTION 'Opening inventory cutover must begin as a clean draft' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Opening inventory cutovers are immutable' USING ERRCODE = '55000'; END IF;
  SELECT c."configurationRevisionId" INTO cohort_revision FROM public."OpeningInventoryCohort" c
   WHERE c.id = NEW."cohortId" AND c."tenantId" = NEW."tenantId" AND c."companyId" = NEW."companyId";
  SELECT EXISTS(SELECT 1 FROM public."InventoryPilotEndpointMembership" m WHERE m."configurationRevisionId" = cohort_revision
    AND m."tenantId" = NEW."tenantId" AND m."companyId" = NEW."companyId" AND m."inventoryLocationId" = NEW."inventoryLocationId" AND m.capability = 'OPENING_STOCK_LOCATION') INTO endpoint_exists;
  SELECT EXISTS(SELECT 1 FROM public."StockCountSession" s JOIN public."StockCountAttempt" a ON a.id = s."currentAttemptId"
    WHERE s.id = NEW."stockCountSessionId" AND s."tenantId" = NEW."tenantId" AND s."companyId" = NEW."companyId"
      AND s."inventoryLocationId" = NEW."inventoryLocationId" AND s."countType" = 'OPENING'
      AND a.id = NEW."stockCountAttemptId" AND a.status = 'REVIEWED') INTO session_ok;
  IF NOT endpoint_exists OR NOT session_ok THEN RAISE EXCEPTION 'Opening inventory cutover lineage is invalid' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."cohortId" IS DISTINCT FROM OLD."cohortId" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
      OR NEW."inventoryLocationId" IS DISTINCT FROM OLD."inventoryLocationId" OR NEW."locationId" IS DISTINCT FROM OLD."locationId"
      OR NEW."stockCountSessionId" IS DISTINCT FROM OLD."stockCountSessionId" OR NEW."stockCountAttemptId" IS DISTINCT FROM OLD."stockCountAttemptId"
      OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR NEW."evidenceManifestJson" IS DISTINCT FROM OLD."evidenceManifestJson" OR NEW."evidenceDigest" IS DISTINCT FROM OLD."evidenceDigest"
      OR NEW."valuationCanonicalJson" IS DISTINCT FROM OLD."valuationCanonicalJson" OR NEW."valuationDigest" IS DISTINCT FROM OLD."valuationDigest" OR NEW."cutoverCanonicalJson" IS DISTINCT FROM OLD."cutoverCanonicalJson" OR NEW."cutoverDigest" IS DISTINCT FROM OLD."cutoverDigest"
      OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId" OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Opening inventory cutover evidence is immutable' USING ERRCODE = '55000';
    END IF;
    IF NEW.version <> OLD.version + 1 OR NOT (
      (OLD.status = 'DRAFT' AND NEW.status IN ('PENDING_APPROVAL','CANCELLED')) OR
      (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('RETURNED','REJECTED','APPROVED','CANCELLED')) OR
      (OLD.status = 'RETURNED' AND NEW.status IN ('PENDING_APPROVAL','CANCELLED')) OR
      (OLD.status = 'APPROVED' AND NEW.status IN ('RECONCILED','CANCELLED')) OR
      (OLD.status = 'RECONCILED' AND NEW.status IN ('ACTIVE','REVERSING')) OR
      (OLD.status = 'REVERSING' AND NEW.status = 'REVERSED')
    ) THEN RAISE EXCEPTION 'Opening inventory cutover transition is invalid' USING ERRCODE = '55000'; END IF;
    IF NOT public.is_opening_inventory_executor_context() AND (
      NEW."stagedAt" IS DISTINCT FROM OLD."stagedAt" OR NEW."reconciledAt" IS DISTINCT FROM OLD."reconciledAt"
      OR NEW."reversalRequestedAt" IS DISTINCT FROM OLD."reversalRequestedAt" OR NEW."reversedAt" IS DISTINCT FROM OLD."reversedAt"
      OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason"
    ) THEN RAISE EXCEPTION 'Opening inventory cutover execution facts require isolated executor' USING ERRCODE = '42501'; END IF;
    IF OLD.status IN ('APPROVED', 'RECONCILED', 'ACTIVE', 'REVERSING')
       AND NOT public.is_opening_inventory_executor_context() THEN
      RAISE EXCEPTION 'Opening inventory cutover execution requires isolated executor' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_cutover_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE attempt_match boolean; draft_parent boolean; expected_line jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Opening inventory cutover lines are append-only' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'INSERT' AND NEW."postedMovementId" IS NOT NULL THEN RAISE EXCEPTION 'Opening inventory cutover lines cannot be pre-posted' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."postedMovementId" IS NULL AND NEW."postedMovementId" IS NOT NULL
      AND NEW.id IS NOT DISTINCT FROM OLD.id AND NEW."cutoverId" IS NOT DISTINCT FROM OLD."cutoverId"
      AND NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId" AND NEW."companyId" IS NOT DISTINCT FROM OLD."companyId"
      AND NEW."inventoryLocationId" IS NOT DISTINCT FROM OLD."inventoryLocationId" AND NEW."itemId" IS NOT DISTINCT FROM OLD."itemId"
      AND NEW."uomId" IS NOT DISTINCT FROM OLD."uomId" AND NEW."stockCountAttemptId" IS NOT DISTINCT FROM OLD."stockCountAttemptId"
      AND NEW."stockCountAttemptLineId" IS NOT DISTINCT FROM OLD."stockCountAttemptLineId" AND NEW."lineNumber" IS NOT DISTINCT FROM OLD."lineNumber"
      AND NEW."lotKey" IS NOT DISTINCT FROM OLD."lotKey" AND NEW."lotNumber" IS NOT DISTINCT FROM OLD."lotNumber"
      AND NEW."expiryDate" IS NOT DISTINCT FROM OLD."expiryDate" AND NEW."sourceSystemQuantityBaseUom" IS NOT DISTINCT FROM OLD."sourceSystemQuantityBaseUom" AND NEW."sourceCountedQuantityBaseUom" IS NOT DISTINCT FROM OLD."sourceCountedQuantityBaseUom" AND NEW."sourceVarianceQuantityBaseUom" IS NOT DISTINCT FROM OLD."sourceVarianceQuantityBaseUom" AND NEW."openingQuantityBaseUom" IS NOT DISTINCT FROM OLD."openingQuantityBaseUom"
      AND NEW."unitCost" IS NOT DISTINCT FROM OLD."unitCost" AND NEW."openingValue" IS NOT DISTINCT FROM OLD."openingValue"
      AND NEW."lineCanonicalJson" IS NOT DISTINCT FROM OLD."lineCanonicalJson" AND NEW."lineDigest" IS NOT DISTINCT FROM OLD."lineDigest" AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
      AND public.is_opening_inventory_executor_context() THEN RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Opening inventory cutover line is immutable after capture' USING ERRCODE = '55000';
  END IF;
  SELECT c.status = 'DRAFT' INTO draft_parent FROM public."OpeningInventoryCutover" c WHERE c.id = NEW."cutoverId";
  SELECT EXISTS(SELECT 1 FROM public."StockCountAttemptLine" l JOIN public."OpeningInventoryCutover" c ON c.id = NEW."cutoverId"
    WHERE l.id = NEW."stockCountAttemptLineId" AND l."stockCountAttemptId" = c."stockCountAttemptId" AND l."stockCountAttemptId" = NEW."stockCountAttemptId"
      AND l."tenantId" = NEW."tenantId" AND l."companyId" = NEW."companyId" AND l."inventoryLocationId" = NEW."inventoryLocationId"
      AND l."itemId" = NEW."itemId" AND l."uomId" = NEW."uomId" AND l."lotKey" = NEW."lotKey"
      AND l."lotNumber" IS NOT DISTINCT FROM NEW."lotNumber" AND l."expiryDate" IS NOT DISTINCT FROM NEW."expiryDate"
      AND l."systemQuantityBaseUom" = NEW."sourceSystemQuantityBaseUom" AND l."countedQuantityBaseUom" = NEW."sourceCountedQuantityBaseUom"
      AND COALESCE(l."varianceQuantityBaseUom", l."countedQuantityBaseUom" - l."systemQuantityBaseUom") = NEW."sourceVarianceQuantityBaseUom") INTO attempt_match;
  IF NOT COALESCE(draft_parent, false) OR NOT attempt_match THEN RAISE EXCEPTION 'Opening inventory cutover line lineage is invalid' USING ERRCODE = '55000'; END IF;
  expected_line := jsonb_build_object(
    'expiryDate', CASE WHEN NEW."expiryDate" IS NULL THEN 'null'::jsonb ELSE to_jsonb(public.opening_inventory_utc_json_timestamp(NEW."expiryDate")) END,
    'itemId', NEW."itemId"::text, 'lineNumber', NEW."lineNumber", 'lotKey', NEW."lotKey",
    'lotNumber', CASE WHEN NEW."lotNumber" IS NULL THEN 'null'::jsonb ELSE to_jsonb(NEW."lotNumber") END,
    'openingQuantityBaseUom', NEW."openingQuantityBaseUom", 'openingValue', NEW."openingValue",
    'sourceCountedQuantityBaseUom', NEW."sourceCountedQuantityBaseUom", 'sourceSystemQuantityBaseUom', NEW."sourceSystemQuantityBaseUom", 'sourceVarianceQuantityBaseUom', NEW."sourceVarianceQuantityBaseUom",
    'stockCountAttemptLineId', NEW."stockCountAttemptLineId"::text, 'unitCost', NEW."unitCost", 'uomId', NEW."uomId"::text
  );
  IF NEW."lineCanonicalJson"::jsonb IS DISTINCT FROM expected_line
     OR encode(public.digest(NEW."lineCanonicalJson", 'sha256'), 'hex') <> NEW."lineDigest" THEN
    RAISE EXCEPTION 'OPENING_INVENTORY_LINE_DIGEST_INVALID' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'Opening inventory history is append-only' USING ERRCODE = '55000'; END; $$;

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_approval_attestation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE expected_attestation jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Opening inventory approval attestations are append-only' USING ERRCODE = '55000'; END IF;
  SELECT jsonb_build_object(
    'approvalInstanceId', NEW."approvalInstanceId"::text,
    'approvalInstanceStepId', NEW."approvalInstanceStepId"::text,
    'attestationVersion', 1,
    'actedAt', public.opening_inventory_utc_json_timestamp(NEW."actedAt"),
    'authSessionId', NEW."authSessionId"::text,
    'cutoverDigest', cutover."cutoverDigest",
    'cutoverId', NEW."cutoverId"::text,
    'decision', NEW.decision,
    'decisionActorUserId', NEW."decisionActorUserId"::text,
    'inventoryLocationId', NEW."inventoryLocationId"::text,
    'mfaMode', NEW."mfaMode",
    'mfaValidUntil', public.opening_inventory_utc_json_timestamp(NEW."mfaValidUntil"),
    'mfaVerifiedAt', public.opening_inventory_utc_json_timestamp(NEW."mfaVerifiedAt"),
    'privilegeEpochAtIssue', NEW."privilegeEpochAtIssue",
    'requiredPermissionCode', NEW."requiredPermissionCode",
    'requiredPermissionId', NEW."requiredPermissionId"::text,
    'stepOrder', NEW."stepOrder"
  ) INTO expected_attestation
    FROM public."OpeningInventoryCutover" cutover
   WHERE cutover.id = NEW."cutoverId" AND cutover."tenantId" = NEW."tenantId" AND cutover."companyId" = NEW."companyId";
  IF expected_attestation IS NULL
     OR NEW."canonicalJson"::jsonb IS DISTINCT FROM expected_attestation
     OR encode(public.digest(NEW."canonicalJson", 'sha256'), 'hex') <> NEW."attestationDigest" OR NOT EXISTS (
    SELECT 1 FROM public."OpeningInventoryCutover" cutover
      JOIN public."ApprovalInstance" approval ON approval.id = NEW."approvalInstanceId" AND approval."tenantId" = NEW."tenantId" AND approval."companyId" = NEW."companyId"
      JOIN public."ApprovalInstanceStep" step ON step.id = NEW."approvalInstanceStepId" AND step."approvalInstanceId" = approval.id
      JOIN public."Permission" permission ON permission.id = NEW."requiredPermissionId" AND permission.code = NEW."requiredPermissionCode"
      JOIN public."AuthSession" auth_session ON auth_session.id = NEW."authSessionId" AND auth_session."tenantId" = NEW."tenantId" AND auth_session."userId" = NEW."decisionActorUserId"
      JOIN public."User" actor ON actor.id = NEW."decisionActorUserId" AND actor."tenantId" = NEW."tenantId"
     WHERE cutover.id = NEW."cutoverId" AND cutover."tenantId" = NEW."tenantId" AND cutover."companyId" = NEW."companyId" AND cutover."inventoryLocationId" = NEW."inventoryLocationId"
       AND cutover."approvalInstanceId" = approval.id AND approval."documentType" = 'OpeningInventoryCutover' AND approval."documentId" = cutover.id
       AND step."stepOrder" = NEW."stepOrder" AND step.status = 'APPROVED' AND step."actedByUserId" = NEW."decisionActorUserId" AND step."actedAt" = NEW."actedAt" AND step."requiredPermissionId" = NEW."requiredPermissionId"
       AND auth_session.status = 'ACTIVE' AND auth_session."idleExpiresAt" > NEW."actedAt" AND auth_session."absoluteExpiresAt" > NEW."actedAt"
       AND actor.status = 'ACTIVE' AND auth_session."privilegeEpochAtIssue" = NEW."privilegeEpochAtIssue" AND actor."privilegeEpoch" = NEW."privilegeEpochAtIssue"
       AND auth_session."mfaAuthenticatedAt" = NEW."mfaVerifiedAt" AND NEW."mfaMode" = 'runtime_mfa' AND NEW."mfaValidUntil" > NEW."actedAt"
  ) THEN RAISE EXCEPTION 'Opening inventory approval attestation lineage is invalid' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_reconciliation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE parent_status "OpeningInventoryCutoverStatus";
BEGIN
  IF TG_OP <> 'INSERT' OR NOT public.is_opening_inventory_executor_context() THEN RAISE EXCEPTION 'Opening inventory reconciliation is executor append-only' USING ERRCODE = '55000'; END IF;
  SELECT status INTO parent_status FROM public."OpeningInventoryCutover" WHERE id = NEW."cutoverId";
  IF NOT ((parent_status = 'APPROVED' AND NEW."reconciliationType" = 'PRE_ACTIVATION')
       OR (parent_status = 'ACTIVE' AND NEW."reconciliationType" = 'POST_ACTIVATION')) THEN
    RAISE EXCEPTION 'Opening inventory reconciliation state is invalid' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_cohort_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE previous_cohort UUID; previous_sequence integer; sealed_cohort public."OpeningInventoryCohort"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Opening inventory cohort events are append-only' USING ERRCODE = '55000'; END IF;
  IF NOT public.is_opening_inventory_executor_context() THEN
    IF pg_trigger_depth() <= 1 THEN RAISE EXCEPTION 'Opening inventory cohort events require isolated executor' USING ERRCODE = '42501'; END IF;
    SELECT * INTO sealed_cohort FROM public."OpeningInventoryCohort" WHERE id = NEW."cohortId";
    IF NOT FOUND OR NEW."eventType" <> 'COHORT_SEALED' OR NEW."sequenceNumber" <> 1 OR NEW."priorEventId" IS NOT NULL
       OR sealed_cohort.status <> 'SEALED' OR NEW."actorUserId" <> sealed_cohort."sealedByUserId"
       OR NEW."canonicalJson" <> sealed_cohort."canonicalJson" OR NEW."eventDigest" <> sealed_cohort."cohortDigest" THEN
      RAISE EXCEPTION 'Opening inventory cohort seal event is invalid' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."sequenceNumber" = 1 AND NEW."priorEventId" IS NOT NULL THEN RAISE EXCEPTION 'Opening inventory first event cannot have a predecessor' USING ERRCODE = '55000'; END IF;
  IF NEW."sequenceNumber" > 1 THEN
    SELECT "cohortId", "sequenceNumber" INTO previous_cohort, previous_sequence FROM public."OpeningInventoryCohortEvent" WHERE id = NEW."priorEventId";
    IF previous_cohort IS DISTINCT FROM NEW."cohortId" OR previous_sequence <> NEW."sequenceNumber" - 1 THEN
      RAISE EXCEPTION 'Opening inventory cohort event chain is invalid' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.append_opening_inventory_cohort_seal_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status = 'DRAFT' AND NEW.status = 'SEALED' THEN
    INSERT INTO public."OpeningInventoryCohortEvent" (
      "cohortId", "tenantId", "companyId", "sequenceNumber", "eventType", "canonicalJson", "eventDigest", "actorUserId", "occurredAt"
    ) VALUES (NEW.id, NEW."tenantId", NEW."companyId", 1, 'COHORT_SEALED', NEW."canonicalJson", NEW."cohortDigest", NEW."sealedByUserId", NEW."sealedAt");
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.append_opening_inventory_cohort_seal_event() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_execution_command()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.status <> 'PENDING' OR NEW."claimedAt" IS NOT NULL OR NEW."claimedByExecutor" IS NOT NULL
      OR NEW."completedAt" IS NOT NULL OR NEW."failureCode" IS NOT NULL OR NEW."failureDetail" IS NOT NULL
      OR length(BTRIM(NEW."idempotencyKey")) < 12 OR encode(public.digest(NEW."canonicalJson", 'sha256'), 'hex') <> NEW."commandDigest"
      OR NOT EXISTS (SELECT 1 FROM public."AuthSession" auth_session JOIN public."User" actor ON actor.id = NEW."requestedByUserId" AND actor."tenantId" = NEW."tenantId"
          WHERE auth_session.id = NEW."requestedAuthSessionId" AND auth_session."tenantId" = NEW."tenantId" AND auth_session."userId" = NEW."requestedByUserId"
            AND auth_session.status = 'ACTIVE' AND actor.status = 'ACTIVE' AND auth_session."idleExpiresAt" > CURRENT_TIMESTAMP AND auth_session."absoluteExpiresAt" > CURRENT_TIMESTAMP
            AND auth_session."privilegeEpochAtIssue" = NEW."requestedPrivilegeEpoch" AND actor."privilegeEpoch" = NEW."requestedPrivilegeEpoch"
            AND auth_session."mfaAuthenticatedAt" = NEW."requestedMfaVerifiedAt" AND NEW."requestedMfaMode" = 'runtime_mfa' AND NEW."requestedMfaValidUntil" <= auth_session."idleExpiresAt"
            AND NEW."requestedMfaValidUntil" <= auth_session."absoluteExpiresAt" AND NEW."requestedMfaValidUntil" > CURRENT_TIMESTAMP)) THEN
    RAISE EXCEPTION 'Opening inventory command must begin with a verified pending payload' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Opening inventory commands are immutable' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."cohortId" IS DISTINCT FROM OLD."cohortId" OR NEW."cutoverId" IS DISTINCT FROM OLD."cutoverId" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
      OR NEW."companyId" IS DISTINCT FROM OLD."companyId" OR NEW."commandType" IS DISTINCT FROM OLD."commandType" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
      OR NEW."expectedCohortVersion" IS DISTINCT FROM OLD."expectedCohortVersion" OR NEW."expectedCutoverVersion" IS DISTINCT FROM OLD."expectedCutoverVersion"
      OR NEW."canonicalJson" IS DISTINCT FROM OLD."canonicalJson" OR NEW."commandDigest" IS DISTINCT FROM OLD."commandDigest"
      OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId" OR NEW."requestedAuthSessionId" IS DISTINCT FROM OLD."requestedAuthSessionId" OR NEW."requestedPrivilegeEpoch" IS DISTINCT FROM OLD."requestedPrivilegeEpoch" OR NEW."requestedMfaVerifiedAt" IS DISTINCT FROM OLD."requestedMfaVerifiedAt" OR NEW."requestedMfaMode" IS DISTINCT FROM OLD."requestedMfaMode" OR NEW."requestedMfaValidUntil" IS DISTINCT FROM OLD."requestedMfaValidUntil" OR NEW."requiredPermissionCode" IS DISTINCT FROM OLD."requiredPermissionCode" OR NEW."requestReason" IS DISTINCT FROM OLD."requestReason" OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Opening inventory command payload is immutable' USING ERRCODE = '55000';
    END IF;
    IF NOT ((OLD.status = 'PENDING' AND NEW.status IN ('CLAIMED','CANCELLED'))
      OR (OLD.status = 'CLAIMED' AND NEW.status IN ('SUCCEEDED','FAILED_RETRYABLE','FAILED_TERMINAL'))
      OR (OLD.status = 'FAILED_RETRYABLE' AND NEW.status = 'CLAIMED')) THEN
      RAISE EXCEPTION 'Opening inventory command transition is invalid' USING ERRCODE = '55000';
    END IF;
    IF NEW.status <> 'CANCELLED' AND NOT public.is_opening_inventory_executor_context() THEN
      RAISE EXCEPTION 'Opening inventory command execution requires isolated executor' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_execution_command_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE cutover_cohort UUID; command_json jsonb;
BEGIN
  command_json := NEW."canonicalJson"::jsonb;
  IF jsonb_typeof(command_json) <> 'object'
     OR command_json - ARRAY['cohortId','commandType','companyId','cutoverId','expectedCohortVersion','expectedCutoverVersion','idempotencyKey','reason','requestedAuthSessionId','requestedByUserId','requestedMfaMode','requestedMfaValidUntil','requestedMfaVerifiedAt','requestedPrivilegeEpoch','requiredPermissionCode','tenantId'] <> '{}'::jsonb
     OR command_json ->> 'cohortId' IS DISTINCT FROM NEW."cohortId"::text
     OR command_json ->> 'commandType' IS DISTINCT FROM NEW."commandType"::text
     OR command_json ->> 'tenantId' IS DISTINCT FROM NEW."tenantId"::text
     OR command_json ->> 'companyId' IS DISTINCT FROM NEW."companyId"::text
     OR command_json ->> 'idempotencyKey' IS DISTINCT FROM NEW."idempotencyKey"
     OR (command_json ->> 'expectedCohortVersion')::integer IS DISTINCT FROM NEW."expectedCohortVersion"
     OR (NEW."expectedCutoverVersion" IS NOT NULL AND (command_json ->> 'expectedCutoverVersion')::integer IS DISTINCT FROM NEW."expectedCutoverVersion")
     OR (NEW."expectedCutoverVersion" IS NULL AND command_json -> 'expectedCutoverVersion' IS DISTINCT FROM 'null'::jsonb)
     OR command_json ->> 'requestedByUserId' IS DISTINCT FROM NEW."requestedByUserId"::text
     OR command_json ->> 'requestedAuthSessionId' IS DISTINCT FROM NEW."requestedAuthSessionId"::text
     OR (command_json ->> 'requestedPrivilegeEpoch')::integer IS DISTINCT FROM NEW."requestedPrivilegeEpoch"
     OR (command_json ->> 'requestedMfaVerifiedAt')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM NEW."requestedMfaVerifiedAt"
     OR command_json ->> 'requestedMfaMode' IS DISTINCT FROM NEW."requestedMfaMode"
     OR (command_json ->> 'requestedMfaValidUntil')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM NEW."requestedMfaValidUntil"
     OR command_json ->> 'requiredPermissionCode' IS DISTINCT FROM NEW."requiredPermissionCode"
     OR command_json ->> 'reason' IS DISTINCT FROM NEW."requestReason"
     OR (NEW."cutoverId" IS NOT NULL AND command_json ->> 'cutoverId' IS DISTINCT FROM NEW."cutoverId"::text)
     OR (NEW."cutoverId" IS NULL AND command_json -> 'cutoverId' IS DISTINCT FROM 'null'::jsonb)
     OR (NEW."commandType" IN ('FREEZE_COHORT', 'STAGE_LOCATION') AND NEW."requiredPermissionCode" <> 'inventory.opening_inventory.request_execute')
     OR (NEW."commandType" = 'ACTIVATE_COHORT' AND NEW."requiredPermissionCode" <> 'inventory.opening_inventory.request_activate')
     OR (NEW."commandType" = 'REVERSE_LOCATION' AND NEW."requiredPermissionCode" <> 'inventory.opening_inventory.request_reverse') THEN
    RAISE EXCEPTION 'Opening inventory command canonical payload is inconsistent' USING ERRCODE = '55000';
  END IF;
  IF NEW."cutoverId" IS NOT NULL THEN
    SELECT "cohortId" INTO cutover_cohort FROM public."OpeningInventoryCutover"
      WHERE id = NEW."cutoverId" AND "tenantId" = NEW."tenantId" AND "companyId" = NEW."companyId";
    IF cutover_cohort IS DISTINCT FROM NEW."cohortId" THEN RAISE EXCEPTION 'Opening inventory command cutover scope is invalid' USING ERRCODE = '55000'; END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."UserRoleAssignment" role_assignment
      JOIN public."Role" role_record ON role_record.id = role_assignment."roleId"
      JOIN public."RolePermission" role_permission ON role_permission."roleId" = role_assignment."roleId"
      JOIN public."Permission" permission ON permission.id = role_permission."permissionId"
     WHERE role_assignment."userId" = NEW."requestedByUserId" AND role_assignment.status = 'ACTIVE'
       AND role_assignment."startsAt" <= CURRENT_TIMESTAMP AND (role_assignment."endsAt" IS NULL OR role_assignment."endsAt" > CURRENT_TIMESTAMP)
       AND role_record.status = 'ACTIVE' AND (role_record."tenantId" IS NULL OR role_record."tenantId" = NEW."tenantId")
       AND (permission."tenantId" IS NULL OR permission."tenantId" = NEW."tenantId")
       AND permission.code = NEW."requiredPermissionCode"
  ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_REQUESTER_PERMISSION_DENIED' USING ERRCODE = '42501'; END IF;
  IF EXISTS (
    SELECT 1 FROM public."OpeningInventoryCutover" cutover
      JOIN public."InventoryLocation" inventory_location ON inventory_location.id = cutover."inventoryLocationId"
     WHERE cutover."cohortId" = NEW."cohortId" AND cutover."tenantId" = NEW."tenantId" AND cutover."companyId" = NEW."companyId"
       AND (NEW."commandType" IN ('FREEZE_COHORT', 'ACTIVATE_COHORT') OR cutover.id = NEW."cutoverId")
       AND NOT EXISTS (
         SELECT 1 FROM public."UserScopeAssignment" scope_assignment
          WHERE scope_assignment."userId" = NEW."requestedByUserId" AND scope_assignment.status = 'ACTIVE'
            AND scope_assignment."startsAt" <= CURRENT_TIMESTAMP AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > CURRENT_TIMESTAMP)
            AND scope_assignment."accessLevel" IN ('APPROVE', 'MANAGE')
            AND ((scope_assignment."scopeType" = 'LOCATION' AND scope_assignment."scopeId" = inventory_location."locationId")
              OR (scope_assignment."scopeType" = 'COMPANY' AND scope_assignment."scopeId" = NEW."companyId"))
       )
  ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_REQUESTER_SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_opening_inventory_command_requester_segregation(NEW."cohortId", NEW."requestedByUserId", NEW."commandType");
  END IF;
  RETURN NEW;
END; $$;

-- This is the pilot-wide posting fence, deliberately at the immutable ledger
-- boundary rather than in individual receiving/transfer/adjustment services.
CREATE OR REPLACE FUNCTION public.guard_opening_inventory_movement_fence()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE fenced BOOLEAN;
BEGIN
  -- Every ledger writer, including raw SQL through the runtime role, must use
  -- the same stable location lock as freeze/activation.  Transfer movements
  -- lock both endpoints to avoid an opposing-transfer deadlock or fence race.
  PERFORM 1
    FROM public."InventoryLocation" location_lock
   WHERE location_lock.id IN (NEW."inventoryLocationId", NEW."relatedInventoryLocationId")
   ORDER BY location_lock.id
   FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM public."InventoryLocation" inventory_location
     WHERE inventory_location.id = NEW."inventoryLocationId"
       AND inventory_location."tenantId" = NEW."tenantId"
       AND inventory_location."companyId" = NEW."companyId"
  ) OR (NEW."relatedInventoryLocationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."InventoryLocation" related_location
     WHERE related_location.id = NEW."relatedInventoryLocationId"
       AND related_location."tenantId" = NEW."tenantId"
       AND related_location."companyId" = NEW."companyId"
  )) THEN
    RAISE EXCEPTION 'INVENTORY_MOVEMENT_LOCATION_SCOPE_INVALID' USING ERRCODE = '55000';
  END IF;
  IF NEW."movementType" = 'OPENING_BALANCE_IN'
     OR NEW."sourceDocumentType" = 'OpeningInventoryCutover' THEN
    IF NOT public.is_opening_inventory_executor_context() OR NOT EXISTS (
      SELECT 1
        FROM public."OpeningInventoryCutoverLine" cutover_line
        JOIN public."OpeningInventoryCutover" cutover ON cutover.id = cutover_line."cutoverId"
        JOIN public."OpeningInventoryCohort" cohort ON cohort.id = cutover."cohortId"
       WHERE cutover_line.id = NEW."sourceDocumentLineId" AND cutover.id = NEW."sourceDocumentId"
         AND cutover_line."tenantId" = NEW."tenantId" AND cutover_line."companyId" = NEW."companyId"
         AND cutover_line."inventoryLocationId" = NEW."inventoryLocationId" AND cutover_line."itemId" = NEW."itemId"
         AND NEW."movementType" = 'OPENING_BALANCE_IN' AND NEW."sourceDocumentType" = 'OpeningInventoryCutover'
         AND NEW."sourceEventKey" = 'OPENING_STOCK:' || cutover_line.id::text AND cohort.status IN ('FROZEN', 'STAGED')
    ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_LEDGER_LINEAGE_DENIED' USING ERRCODE = '55000'; END IF;
  END IF;
  SELECT EXISTS (
    SELECT 1
      FROM public."OpeningInventoryCohort" cohort
      JOIN public."InventoryPilotConfigurationRevision" revision
        ON revision.id = cohort."configurationRevisionId" AND revision."tenantId" = cohort."tenantId"
       AND revision."companyId" = cohort."companyId" AND revision."revisionNumber" = cohort."configurationRevisionNumber"
       AND revision."configurationDigest" = cohort."configurationDigest" AND revision.status = 'SEALED'
      JOIN public."InventoryPilotEndpointMembership" endpoint
        ON endpoint."configurationRevisionId" = cohort."configurationRevisionId"
       AND endpoint."tenantId" = cohort."tenantId" AND endpoint."companyId" = cohort."companyId"
       AND endpoint."configurationRevisionNumber" = cohort."configurationRevisionNumber"
       AND endpoint.capability = 'OPENING_STOCK_LOCATION' AND endpoint."inventoryLocationId" = NEW."inventoryLocationId"
      JOIN public."InventoryPilotItemMembership" item_membership
        ON item_membership."configurationRevisionId" = cohort."configurationRevisionId"
       AND item_membership."tenantId" = cohort."tenantId" AND item_membership."companyId" = cohort."companyId"
       AND item_membership."configurationRevisionNumber" = cohort."configurationRevisionNumber"
       AND item_membership."itemId" = NEW."itemId"
     WHERE cohort."tenantId" = NEW."tenantId" AND cohort."companyId" = NEW."companyId"
       AND cohort.status IN ('FROZEN', 'STAGED', 'REVERSING')
  ) INTO fenced;
  IF fenced AND NOT (
    public.is_opening_inventory_executor_context()
    AND NEW."movementType" = 'OPENING_BALANCE_IN'
    AND NEW."sourceDocumentType" = 'OpeningInventoryCutover'
  ) THEN
    RAISE EXCEPTION 'OPENING_INVENTORY_CUTOVER_MOVEMENT_FENCE_ACTIVE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

-- InventoryBalance is a derived cache.  Direct writes are forbidden even to
-- code that happens to run inside another trigger; only the pinned movement
-- cache writer, executing as the non-login table owner at exact nested depth,
-- may insert or update it.  Balance rows are never deleted.
CREATE OR REPLACE FUNCTION public.guard_inventory_balance_derived_cache()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE balance_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(class.relowner)
    INTO balance_owner
    FROM pg_catalog.pg_class class
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
   WHERE namespace.nspname = 'public' AND class.relname = 'InventoryBalance';
  IF TG_OP = 'DELETE'
     OR pg_catalog.pg_trigger_depth() <> 2
     OR current_user <> balance_owner THEN
    RAISE EXCEPTION 'INVENTORY_BALANCE_DERIVED_CACHE_WRITE_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.apply_inventory_movement_to_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  canonical_lot_key text;
  affected_balance_id uuid;
BEGIN
  IF NEW."enteredQuantity" <= 0 OR NEW."quantityDeltaBaseUom" = 0 THEN
    RAISE EXCEPTION 'INVENTORY_MOVEMENT_QUANTITY_INVALID' USING ERRCODE = '22003';
  END IF;
  IF (NEW."movementType" IN ('RECEIPT_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'OPENING_BALANCE_IN', 'COUNT_VARIANCE_IN')
      AND NEW."quantityDeltaBaseUom" <= 0)
     OR (NEW."movementType" IN ('TRANSFER_OUT', 'WASTAGE_OUT', 'ADJUSTMENT_OUT', 'COUNT_VARIANCE_OUT')
      AND NEW."quantityDeltaBaseUom" >= 0) THEN
    RAISE EXCEPTION 'INVENTORY_MOVEMENT_TYPE_SIGN_INVALID' USING ERRCODE = '22003';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."Item" item
     WHERE item.id = NEW."itemId"
       AND item."tenantId" = NEW."tenantId"
       AND item."companyId" = NEW."companyId"
       AND item."baseUomId" = NEW."baseUomId"
       AND item."trackInventory" = true
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MOVEMENT_ITEM_SCOPE_OR_UOM_INVALID' USING ERRCODE = '55000';
  END IF;

  canonical_lot_key := COALESCE(NULLIF(pg_catalog.btrim(NEW."lotNumber"), ''), 'NOLOT')
    || '|' || COALESCE(pg_catalog.to_char(NEW."expiryDate", 'YYYY-MM-DD'), 'NOEXP');

  IF NEW."quantityDeltaBaseUom" > 0 THEN
    INSERT INTO public."InventoryBalance" (
      "tenantId", "companyId", "inventoryLocationId", "itemId", "lotKey",
      "lotNumber", "expiryDate", "baseUomId", "qtyOnHand", version, "updatedAt"
    ) VALUES (
      NEW."tenantId", NEW."companyId", NEW."inventoryLocationId", NEW."itemId", canonical_lot_key,
      NULLIF(pg_catalog.btrim(NEW."lotNumber"), ''), NEW."expiryDate", NEW."baseUomId",
      NEW."quantityDeltaBaseUom", 1, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("inventoryLocationId", "itemId", "lotKey") DO UPDATE
      SET "qtyOnHand" = public."InventoryBalance"."qtyOnHand" + EXCLUDED."qtyOnHand",
          version = public."InventoryBalance".version + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE public."InventoryBalance"."tenantId" = EXCLUDED."tenantId"
        AND public."InventoryBalance"."companyId" = EXCLUDED."companyId"
        AND public."InventoryBalance"."baseUomId" = EXCLUDED."baseUomId"
        AND public."InventoryBalance"."lotNumber" IS NOT DISTINCT FROM EXCLUDED."lotNumber"
        AND public."InventoryBalance"."expiryDate" IS NOT DISTINCT FROM EXCLUDED."expiryDate"
    RETURNING id INTO affected_balance_id;
  ELSE
    UPDATE public."InventoryBalance"
       SET "qtyOnHand" = "qtyOnHand" + NEW."quantityDeltaBaseUom",
           version = version + 1,
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "inventoryLocationId" = NEW."inventoryLocationId"
       AND "itemId" = NEW."itemId"
       AND "lotKey" = canonical_lot_key
       AND "tenantId" = NEW."tenantId"
       AND "companyId" = NEW."companyId"
       AND "baseUomId" = NEW."baseUomId"
       AND "lotNumber" IS NOT DISTINCT FROM NULLIF(pg_catalog.btrim(NEW."lotNumber"), '')
       AND "expiryDate" IS NOT DISTINCT FROM NEW."expiryDate"
       AND "qtyOnHand" >= pg_catalog.abs(NEW."quantityDeltaBaseUom")
    RETURNING id INTO affected_balance_id;
  END IF;
  IF affected_balance_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_BALANCE_METADATA_OR_QUANTITY_INVALID' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.apply_inventory_movement_to_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_inventory_balance_derived_cache() FROM PUBLIC;

-- The migration owner initially owns this routine.  Deployment reconciliation
-- subsequently transfers ownership to <prefix>_opening_stock_owner and grants
-- EXECUTE only to <prefix>_opening_stock_executor; PUBLIC is revoked below.
CREATE OR REPLACE FUNCTION public.execute_opening_inventory_command(command_id UUID)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  command_row public."OpeningInventoryExecutionCommand"%ROWTYPE;
  cohort_row public."OpeningInventoryCohort"%ROWTYPE;
  cutover_row public."OpeningInventoryCutover"%ROWTYPE;
  line_row public."OpeningInventoryCutoverLine"%ROWTYPE;
  movement_id UUID;
  current_sequence INTEGER;
  rows_remaining INTEGER;
  original_quantity NUMERIC(18,6);
  evidence_ok BOOLEAN;
  reconciliation_json TEXT;
  reconciliation_digest CHAR(64);
  max_count_age_minutes INTEGER;
  max_freeze_minutes INTEGER;
BEGIN
  SELECT * INTO command_row FROM public."OpeningInventoryExecutionCommand" WHERE id = command_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF command_row.status = 'SUCCEEDED' THEN RETURN 'SUCCEEDED'; END IF;
  IF command_row.status NOT IN ('PENDING', 'FAILED_RETRYABLE') THEN
    RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_NOT_RETRYABLE' USING ERRCODE = '55000';
  END IF;

  -- Claim outside the exception subtransaction so a later validation or
  -- posting failure can transition the durable CLAIMED row to its recorded
  -- retryable/terminal outcome instead of rolling the claim back to PENDING.
  UPDATE public."OpeningInventoryExecutionCommand"
     SET status = 'CLAIMED', "claimedAt" = CURRENT_TIMESTAMP, "claimedByExecutor" = current_user
   WHERE id = command_id;

  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public."AuthSession" auth_session JOIN public."User" actor ON actor.id = command_row."requestedByUserId" AND actor."tenantId" = command_row."tenantId"
      WHERE auth_session.id = command_row."requestedAuthSessionId" AND auth_session."tenantId" = command_row."tenantId" AND auth_session."userId" = command_row."requestedByUserId"
        AND auth_session.status = 'ACTIVE' AND actor.status = 'ACTIVE' AND auth_session."idleExpiresAt" > CURRENT_TIMESTAMP AND auth_session."absoluteExpiresAt" > CURRENT_TIMESTAMP
        AND auth_session."privilegeEpochAtIssue" = command_row."requestedPrivilegeEpoch" AND actor."privilegeEpoch" = command_row."requestedPrivilegeEpoch"
        AND auth_session."mfaAuthenticatedAt" = command_row."requestedMfaVerifiedAt" AND command_row."requestedMfaMode" = 'runtime_mfa'
        AND command_row."requestedMfaValidUntil" > CURRENT_TIMESTAMP AND command_row."requestedMfaValidUntil" <= auth_session."idleExpiresAt" AND command_row."requestedMfaValidUntil" <= auth_session."absoluteExpiresAt") THEN
      RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_REQUESTER_ATTESTATION_INVALID' USING ERRCODE = '55000';
    END IF;
    SELECT * INTO cohort_row FROM public."OpeningInventoryCohort"
      WHERE id = command_row."cohortId" FOR UPDATE;
    IF NOT FOUND OR cohort_row.version <> command_row."expectedCohortVersion" THEN
      RAISE EXCEPTION 'OPENING_INVENTORY_COHORT_VERSION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    PERFORM public.assert_opening_inventory_cohort_manifest(cohort_row.id);
    IF NOT EXISTS (
      SELECT 1 FROM public."UserRoleAssignment" role_assignment
        JOIN public."Role" role_record ON role_record.id = role_assignment."roleId"
        JOIN public."RolePermission" role_permission ON role_permission."roleId" = role_assignment."roleId"
        JOIN public."Permission" permission ON permission.id = role_permission."permissionId"
       WHERE role_assignment."userId" = command_row."requestedByUserId" AND role_assignment.status = 'ACTIVE'
         AND role_assignment."startsAt" <= CURRENT_TIMESTAMP AND (role_assignment."endsAt" IS NULL OR role_assignment."endsAt" > CURRENT_TIMESTAMP)
         AND role_record.status = 'ACTIVE' AND (role_record."tenantId" IS NULL OR role_record."tenantId" = command_row."tenantId")
         AND (permission."tenantId" IS NULL OR permission."tenantId" = command_row."tenantId")
         AND permission.code = command_row."requiredPermissionCode"
    ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_REQUESTER_PERMISSION_DENIED' USING ERRCODE = '42501'; END IF;
    PERFORM public.assert_opening_inventory_command_requester_segregation(cohort_row.id, command_row."requestedByUserId", command_row."commandType");
    IF EXISTS (
      SELECT 1 FROM public."OpeningInventoryCutover" requester_cutover
        JOIN public."InventoryLocation" requester_location ON requester_location.id = requester_cutover."inventoryLocationId"
       WHERE requester_cutover."cohortId" = cohort_row.id AND requester_cutover."tenantId" = cohort_row."tenantId" AND requester_cutover."companyId" = cohort_row."companyId"
         AND (command_row."commandType" IN ('FREEZE_COHORT', 'ACTIVATE_COHORT') OR requester_cutover.id = command_row."cutoverId")
         AND NOT EXISTS (
           SELECT 1 FROM public."UserScopeAssignment" scope_assignment
            WHERE scope_assignment."userId" = command_row."requestedByUserId" AND scope_assignment.status = 'ACTIVE'
              AND scope_assignment."startsAt" <= CURRENT_TIMESTAMP AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > CURRENT_TIMESTAMP)
              AND scope_assignment."accessLevel" IN ('APPROVE', 'MANAGE')
              AND ((scope_assignment."scopeType" = 'LOCATION' AND scope_assignment."scopeId" = requester_location."locationId")
                OR (scope_assignment."scopeType" = 'COMPANY' AND scope_assignment."scopeId" = cohort_row."companyId"))
         )
    ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_REQUESTER_SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
    IF command_row."commandType" = 'FREEZE_COHORT' THEN
      -- Drain every in-flight ledger writer first, then re-check the pristine
      -- baseline while holding the same stable location locks.
      PERFORM 1 FROM public."InventoryLocation" location_lock
       WHERE location_lock.id IN (
         SELECT child."inventoryLocationId"
           FROM public."OpeningInventoryCutover" child
          WHERE child."cohortId" = cohort_row.id
       )
       ORDER BY location_lock.id FOR UPDATE;
    IF cohort_row.status <> 'SEALED'
        OR cohort_row."effectiveAt" > CURRENT_TIMESTAMP
        OR EXISTS (
          SELECT 1 FROM public."InventoryPilotEndpointMembership" endpoint
           WHERE endpoint."configurationRevisionId" = cohort_row."configurationRevisionId" AND endpoint."tenantId" = cohort_row."tenantId"
             AND endpoint."companyId" = cohort_row."companyId" AND endpoint."configurationRevisionNumber" = cohort_row."configurationRevisionNumber"
             AND endpoint.capability = 'OPENING_STOCK_LOCATION'
             AND NOT EXISTS (SELECT 1 FROM public."OpeningInventoryCutover" child WHERE child."cohortId" = cohort_row.id AND child."inventoryLocationId" = endpoint."inventoryLocationId")
        ) OR EXISTS (
          SELECT 1 FROM public."OpeningInventoryCutover" child
           WHERE child."cohortId" = cohort_row.id AND child.status <> 'APPROVED'
        ) OR EXISTS (
          SELECT 1 FROM public."OpeningInventoryCutover" child
           WHERE child."cohortId" = cohort_row.id AND EXISTS (
             SELECT 1 FROM public."InventoryPilotItemMembership" item_membership
              WHERE item_membership."configurationRevisionId" = cohort_row."configurationRevisionId" AND item_membership."tenantId" = cohort_row."tenantId"
                AND item_membership."companyId" = cohort_row."companyId" AND item_membership."configurationRevisionNumber" = cohort_row."configurationRevisionNumber"
                AND NOT EXISTS (SELECT 1 FROM public."OpeningInventoryCutoverLine" line WHERE line."cutoverId" = child.id AND line."itemId" = item_membership."itemId")
           )
        ) OR EXISTS (
          SELECT 1 FROM public."OpeningInventoryCutoverLine" line JOIN public."OpeningInventoryCutover" child ON child.id = line."cutoverId"
           WHERE child."cohortId" = cohort_row.id AND NOT EXISTS (
             SELECT 1 FROM public."InventoryPilotItemMembership" item_membership
              WHERE item_membership."configurationRevisionId" = cohort_row."configurationRevisionId" AND item_membership."tenantId" = cohort_row."tenantId"
                AND item_membership."companyId" = cohort_row."companyId" AND item_membership."configurationRevisionNumber" = cohort_row."configurationRevisionNumber" AND item_membership."itemId" = line."itemId"
           )
        ) OR EXISTS (
          SELECT 1 FROM public."InventoryMovement" movement
            JOIN public."OpeningInventoryCutoverLine" line
              ON line."itemId" = movement."itemId"
             AND line."inventoryLocationId" = movement."inventoryLocationId"
            JOIN public."OpeningInventoryCutover" child ON child.id = line."cutoverId"
           WHERE child."cohortId" = cohort_row.id
             AND movement."tenantId" = cohort_row."tenantId"
             AND movement."companyId" = cohort_row."companyId"
        ) OR EXISTS (
          SELECT 1 FROM public."InventoryBalance" balance
           WHERE balance."tenantId" = cohort_row."tenantId"
             AND balance."companyId" = cohort_row."companyId"
             AND EXISTS (
               SELECT 1 FROM public."OpeningInventoryCutoverLine" selected_line
                 JOIN public."OpeningInventoryCutover" selected_child ON selected_child.id = selected_line."cutoverId"
                WHERE selected_child."cohortId" = cohort_row.id
                  AND selected_line."itemId" = balance."itemId"
                  AND selected_line."inventoryLocationId" = balance."inventoryLocationId"
             )
             AND (balance."qtyOnHand" <> 0 OR NOT EXISTS (
               SELECT 1 FROM public."OpeningInventoryCutoverLine" exact_line
                 JOIN public."OpeningInventoryCutover" exact_child ON exact_child.id = exact_line."cutoverId"
                WHERE exact_child."cohortId" = cohort_row.id
                  AND exact_line."itemId" = balance."itemId"
                  AND exact_line."inventoryLocationId" = balance."inventoryLocationId"
                  AND exact_line."lotKey" = balance."lotKey"
                  AND exact_line."uomId" = balance."baseUomId"
                  AND exact_line."lotNumber" IS NOT DISTINCT FROM balance."lotNumber"
                  AND exact_line."expiryDate" IS NOT DISTINCT FROM balance."expiryDate"
             ))
        ) THEN
        RAISE EXCEPTION 'OPENING_INVENTORY_FREEZE_PRECONDITION_FAILED' USING ERRCODE = '55000';
      END IF;
      UPDATE public."OpeningInventoryCohort" SET status = 'FROZEN', version = version + 1, "frozenAt" = CURRENT_TIMESTAMP, "frozenByUserId" = command_row."requestedByUserId", "updatedAt" = CURRENT_TIMESTAMP WHERE id = cohort_row.id;
      SELECT COALESCE(max("sequenceNumber"), 0) + 1 INTO current_sequence FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id;
      INSERT INTO public."OpeningInventoryCohortEvent" ("cohortId", "tenantId", "companyId", "sequenceNumber", "eventType", "priorEventId", "canonicalJson", "eventDigest", "actorUserId", "occurredAt")
      VALUES (cohort_row.id, cohort_row."tenantId", cohort_row."companyId", current_sequence, 'COHORT_FROZEN', (SELECT id FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id ORDER BY "sequenceNumber" DESC LIMIT 1), json_build_object('commandId', command_row.id, 'cohortId', cohort_row.id)::text, command_row."commandDigest", command_row."requestedByUserId", CURRENT_TIMESTAMP);

    ELSIF command_row."commandType" = 'STAGE_LOCATION' THEN
      SELECT * INTO cutover_row FROM public."OpeningInventoryCutover"
       WHERE id = command_row."cutoverId" FOR UPDATE;
      IF NOT FOUND OR cutover_row.version <> command_row."expectedCutoverVersion"
         OR cohort_row.status <> 'FROZEN' OR cutover_row.status <> 'APPROVED' THEN
        RAISE EXCEPTION 'OPENING_INVENTORY_STAGE_PRECONDITION_FAILED' USING ERRCODE = '55000';
      END IF;
      PERFORM public.assert_opening_inventory_cutover_facts(cutover_row.id);
      IF cohort_row."effectiveAt" > CURRENT_TIMESTAMP OR EXISTS (
        SELECT 1 FROM public."StockCountAttempt" count_attempt
         WHERE count_attempt.id = cutover_row."stockCountAttemptId" AND (count_attempt."cutoffAt" IS NULL OR count_attempt."cutoffAt" > cohort_row."effectiveAt")
      ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_EFFECTIVE_TIME_INVALID' USING ERRCODE = '55000'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public."StockCountAttempt" count_attempt
          JOIN public."StockCountSession" count_session ON count_session.id = count_attempt."stockCountSessionId"
         WHERE count_attempt.id = cutover_row."stockCountAttemptId" AND count_attempt."tenantId" = cutover_row."tenantId" AND count_attempt."companyId" = cutover_row."companyId"
           AND count_attempt."inventoryLocationId" = cutover_row."inventoryLocationId" AND count_attempt.status = 'REVIEWED' AND count_attempt."freezeMovements" = true
           AND count_attempt."cutoffAt" IS NOT NULL AND count_session."countType" = 'OPENING' AND count_session.status = 'REVIEWED'
           AND count_session."currentAttemptId" = count_attempt.id AND count_session."freezeMovements" = true AND count_session."cutoffAt" IS NOT NULL
      ) OR EXISTS (
        SELECT 1 FROM public."StockCountAttemptLine" source_line
          LEFT JOIN public."OpeningInventoryCutoverLine" line ON line."cutoverId" = cutover_row.id AND line."stockCountAttemptLineId" = source_line.id
         WHERE source_line."stockCountAttemptId" = cutover_row."stockCountAttemptId"
           AND (source_line."countedQuantityBaseUom" IS NULL OR source_line."countedQuantityBaseUom" < 0 OR source_line."systemQuantityBaseUom" <> 0
             OR line.id IS NULL OR line."tenantId" <> source_line."tenantId" OR line."companyId" <> source_line."companyId" OR line."inventoryLocationId" <> source_line."inventoryLocationId"
             OR line."itemId" <> source_line."itemId" OR line."uomId" <> source_line."uomId" OR line."lotKey" <> source_line."lotKey"
             OR line."lotNumber" IS DISTINCT FROM source_line."lotNumber" OR line."expiryDate" IS DISTINCT FROM source_line."expiryDate"
             OR line."sourceSystemQuantityBaseUom" <> source_line."systemQuantityBaseUom" OR line."sourceCountedQuantityBaseUom" <> source_line."countedQuantityBaseUom"
             OR line."sourceVarianceQuantityBaseUom" IS DISTINCT FROM COALESCE(source_line."varianceQuantityBaseUom", source_line."countedQuantityBaseUom" - source_line."systemQuantityBaseUom") OR line."openingQuantityBaseUom" <> source_line."countedQuantityBaseUom")
      ) OR EXISTS (
        SELECT 1 FROM public."OpeningInventoryCutoverLine" line
          LEFT JOIN public."StockCountAttemptLine" source_line ON source_line.id = line."stockCountAttemptLineId" AND source_line."stockCountAttemptId" = cutover_row."stockCountAttemptId"
         WHERE line."cutoverId" = cutover_row.id AND source_line.id IS NULL
      ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_SOURCE_FACTS_INVALID' USING ERRCODE = '55000'; END IF;
      IF cutover_row."approvalInstanceId" IS NULL OR NOT EXISTS (
        SELECT 1 FROM public."ApprovalInstance" approval
         WHERE approval.id = cutover_row."approvalInstanceId" AND approval."tenantId" = cutover_row."tenantId"
           AND approval."companyId" = cutover_row."companyId" AND approval."documentType" = 'OpeningInventoryCutover'
           AND approval."documentId" = cutover_row.id AND approval.status = 'APPROVED'
      ) OR EXISTS (
        SELECT 1 FROM public."ApprovalInstanceStep" approval_step
         WHERE approval_step."approvalInstanceId" = cutover_row."approvalInstanceId" AND approval_step.status NOT IN ('APPROVED', 'SKIPPED')
      ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_NORMALIZED_APPROVAL_NOT_APPROVED' USING ERRCODE = '55000'; END IF;
      IF (SELECT count(*) FROM public."OpeningInventoryApprovalAttestation" attestation WHERE attestation."cutoverId" = cutover_row.id) <> 2
        OR (SELECT count(DISTINCT attestation."decisionActorUserId") FROM public."OpeningInventoryApprovalAttestation" attestation WHERE attestation."cutoverId" = cutover_row.id) <> 2
        OR (SELECT array_agg(attestation."requiredPermissionCode" ORDER BY attestation."stepOrder")::text[] FROM public."OpeningInventoryApprovalAttestation" attestation WHERE attestation."cutoverId" = cutover_row.id)
             IS DISTINCT FROM ARRAY['inventory.opening_inventory.review.operations', 'inventory.opening_inventory.review.accounting']
        OR EXISTS (
          SELECT 1 FROM public."OpeningInventoryApprovalAttestation" attestation
           JOIN public."AuthSession" session ON session.id = attestation."authSessionId"
           JOIN public."User" actor ON actor.id = attestation."decisionActorUserId"
           JOIN public."ApprovalInstanceStep" approval_step ON approval_step.id = attestation."approvalInstanceStepId" AND approval_step."approvalInstanceId" = attestation."approvalInstanceId"
           JOIN public."Permission" permission ON permission.id = attestation."requiredPermissionId"
           JOIN public."StockCountAttempt" count_attempt ON count_attempt.id = cutover_row."stockCountAttemptId"
           WHERE attestation."cutoverId" = cutover_row.id
             AND (encode(public.digest(attestation."canonicalJson", 'sha256'), 'hex') <> attestation."attestationDigest"
               OR attestation.decision <> 'APPROVED' OR approval_step.status <> 'APPROVED' OR approval_step."actedByUserId" <> attestation."decisionActorUserId"
               OR approval_step."actedAt" <> attestation."actedAt" OR approval_step."requiredPermissionId" <> attestation."requiredPermissionId" OR permission.code <> attestation."requiredPermissionCode"
               OR session."privilegeEpochAtIssue" <> attestation."privilegeEpochAtIssue" OR actor."privilegeEpoch" <> attestation."privilegeEpochAtIssue"
               OR session."mfaAuthenticatedAt" IS DISTINCT FROM attestation."mfaVerifiedAt" OR attestation."mfaMode" <> 'runtime_mfa' OR attestation."mfaValidUntil" <= attestation."actedAt" OR actor.status <> 'ACTIVE'
               OR attestation."decisionActorUserId" IN (cutover_row."requestedByUserId", count_attempt."createdByUserId", count_attempt."assignedToUserId", count_attempt."reviewedByUserId", command_row."requestedByUserId")
               OR NOT EXISTS (SELECT 1 FROM public."UserRoleAssignment" role_assignment
                    JOIN public."Role" role ON role.id = role_assignment."roleId" AND role.status = 'ACTIVE'
                      AND (role."tenantId" IS NULL OR role."tenantId" = cutover_row."tenantId")
                    JOIN public."RolePermission" role_permission ON role_permission."roleId" = role_assignment."roleId"
                    JOIN public."Permission" live_permission ON live_permission.id = role_permission."permissionId"
                      AND (live_permission."tenantId" IS NULL OR live_permission."tenantId" = cutover_row."tenantId")
                    WHERE role_assignment."userId" = attestation."decisionActorUserId" AND role_assignment.status = 'ACTIVE' AND role_assignment."startsAt" <= CURRENT_TIMESTAMP
                      AND (role_assignment."endsAt" IS NULL OR role_assignment."endsAt" > CURRENT_TIMESTAMP) AND role_permission."permissionId" = attestation."requiredPermissionId")
               OR NOT EXISTS (SELECT 1 FROM public."UserScopeAssignment" scope_assignment JOIN public."InventoryLocation" inventory_location ON inventory_location.id = cutover_row."inventoryLocationId"
                    WHERE scope_assignment."userId" = attestation."decisionActorUserId" AND scope_assignment.status = 'ACTIVE' AND scope_assignment."startsAt" <= CURRENT_TIMESTAMP
                      AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > CURRENT_TIMESTAMP)
                      AND scope_assignment."accessLevel" IN ('APPROVE', 'MANAGE')
                      AND ((scope_assignment."scopeType" = 'LOCATION' AND scope_assignment."scopeId" = inventory_location."locationId") OR (scope_assignment."scopeType" = 'COMPANY' AND scope_assignment."scopeId" = cutover_row."companyId")))
               OR EXISTS (SELECT 1 FROM public."StockCountAttemptLine" counted_line WHERE counted_line."stockCountAttemptId" = count_attempt.id AND counted_line."countedByUserId" = attestation."decisionActorUserId"))
        ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_APPROVAL_ATTESTATION_INVALID' USING ERRCODE = '55000'; END IF;
      -- Match the ordinary posting lock.  This serializes a receipt/transfer/
      -- adjustment posting that began before the movement fence was raised.
      PERFORM 1 FROM public."InventoryLocation" location_lock
       WHERE location_lock.id = cutover_row."inventoryLocationId" AND location_lock."tenantId" = cutover_row."tenantId" AND location_lock."companyId" = cutover_row."companyId"
       FOR UPDATE;
      SELECT jsonb_typeof(cutover_row."evidenceManifestJson"::jsonb) = 'array'
          AND jsonb_array_length(cutover_row."evidenceManifestJson"::jsonb) > 0
          AND encode(public.digest(cutover_row."evidenceManifestJson", 'sha256'), 'hex') = cutover_row."evidenceDigest"
          AND NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(cutover_row."evidenceManifestJson"::jsonb) selected
              LEFT JOIN public."ControlledEvidenceAttachment" evidence
                ON evidence.id::text = selected->>'controlledEvidenceAttachmentId'
               AND evidence."tenantId" = cutover_row."tenantId" AND evidence."companyId" = cutover_row."companyId"
               AND evidence."sourceType" = 'OPENING_INVENTORY_COHORT' AND evidence."sourceRecordId" = cohort_row.id
               AND evidence.status = 'ACTIVE'
              LEFT JOIN public."Attachment" attachment ON attachment.id = evidence."attachmentId"
               AND attachment."tenantId" = cutover_row."tenantId" AND attachment."companyId" = cutover_row."companyId"
              LEFT JOIN public."AttachmentScanAttempt" scan ON scan."attachmentId" = attachment.id
               AND scan."tenantId" = attachment."tenantId" AND scan."companyId" = attachment."companyId"
               AND scan."objectVersionId" = attachment."objectVersionId" AND scan.result = 'CLEAN'
             WHERE evidence.id IS NULL OR attachment.id IS NULL
                OR attachment."availabilityState" <> 'AVAILABLE' OR attachment."scanState" <> 'CLEAN'
                OR attachment."scanVerifiedObjectVersionId" IS DISTINCT FROM attachment."objectVersionId"
                OR attachment."objectVersionId" IS DISTINCT FROM selected->>'objectVersionId'
                OR scan."plaintextChecksum" IS DISTINCT FROM selected->>'checksum'
          ) INTO evidence_ok;
      IF NOT COALESCE(evidence_ok, false) THEN RAISE EXCEPTION 'OPENING_INVENTORY_EVIDENCE_MANIFEST_NOT_VERIFIED' USING ERRCODE = '55000'; END IF;
      IF EXISTS (SELECT 1 FROM public."InventoryMovement" movement JOIN public."OpeningInventoryCutoverLine" line ON line."itemId" = movement."itemId" AND line."inventoryLocationId" = movement."inventoryLocationId" WHERE line."cutoverId" = cutover_row.id AND movement."tenantId" = cutover_row."tenantId" AND movement."companyId" = cutover_row."companyId") THEN RAISE EXCEPTION 'OPENING_INVENTORY_PRIOR_LEDGER_MOVEMENT_EXISTS' USING ERRCODE = '55000'; END IF;
      IF EXISTS (SELECT 1 FROM public."InventoryBalance" balance JOIN public."OpeningInventoryCutoverLine" line ON line."itemId" = balance."itemId" AND line."inventoryLocationId" = balance."inventoryLocationId" WHERE line."cutoverId" = cutover_row.id AND (balance."qtyOnHand" <> 0 OR balance."baseUomId" <> line."uomId")) THEN RAISE EXCEPTION 'OPENING_INVENTORY_PREEXISTING_BALANCE_INVALID' USING ERRCODE = '55000'; END IF;
      IF EXISTS (
        SELECT 1 FROM public."OpeningInventoryCutoverLine" line
          LEFT JOIN public."InventoryMovement" movement ON movement.id = line."postedMovementId"
          LEFT JOIN public."InventoryBalance" balance ON balance."inventoryLocationId" = line."inventoryLocationId" AND balance."itemId" = line."itemId" AND balance."lotKey" = line."lotKey"
         WHERE line."cutoverId" = cutover_row.id
           AND (movement.id IS NOT NULL OR (balance."qtyOnHand" IS NOT NULL AND balance."qtyOnHand" <> 0))
      ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_RECONCILIATION_MISMATCH' USING ERRCODE = '55000'; END IF;
      SELECT jsonb_build_object('cutoverId', cutover_row.id, 'effectiveAt', cohort_row."effectiveAt", 'lines', jsonb_agg(jsonb_build_object('lineId', line.id, 'itemId', line."itemId", 'lotKey', line."lotKey", 'quantity', line."openingQuantityBaseUom", 'value', line."openingValue", 'movementId', line."postedMovementId") ORDER BY line."lineNumber"))::text
        INTO reconciliation_json FROM public."OpeningInventoryCutoverLine" line WHERE line."cutoverId" = cutover_row.id;
      reconciliation_digest := encode(public.digest(reconciliation_json, 'sha256'), 'hex');
      INSERT INTO public."OpeningInventoryReconciliation" (
        "cutoverId", "tenantId", "companyId", "inventoryLocationId", "reconciliationType", "lineCount", "quantityDigest", "valuationDigest", "reconciliationJson", "reconciliationDigest", "reconciledByUserId", "reconciledAt"
      ) SELECT cutover_row.id, cutover_row."tenantId", cutover_row."companyId", cutover_row."inventoryLocationId", 'PRE_ACTIVATION', count(*), reconciliation_digest, reconciliation_digest,
        reconciliation_json, reconciliation_digest, command_row."requestedByUserId", CURRENT_TIMESTAMP
        FROM public."OpeningInventoryCutoverLine" WHERE "cutoverId" = cutover_row.id;
      UPDATE public."OpeningInventoryCutover" SET status = 'RECONCILED', version = version + 1, "stagedAt" = CURRENT_TIMESTAMP, "reconciledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = cutover_row.id;
      SELECT COALESCE(max("sequenceNumber"), 0) + 1 INTO current_sequence FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id;
      INSERT INTO public."OpeningInventoryCohortEvent" ("cohortId", "tenantId", "companyId", "sequenceNumber", "eventType", "priorEventId", "canonicalJson", "eventDigest", "actorUserId", "occurredAt")
      VALUES (cohort_row.id, cohort_row."tenantId", cohort_row."companyId", current_sequence, 'LOCATION_STAGED', (SELECT id FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id ORDER BY "sequenceNumber" DESC LIMIT 1), json_build_object('commandId', command_row.id, 'cutoverId', cutover_row.id)::text, command_row."commandDigest", command_row."requestedByUserId", CURRENT_TIMESTAMP);
      IF NOT EXISTS (SELECT 1 FROM public."OpeningInventoryCutover" WHERE "cohortId" = cohort_row.id AND status <> 'RECONCILED') THEN
        UPDATE public."OpeningInventoryCohort" SET status = 'STAGED', version = version + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = cohort_row.id;
      END IF;

    ELSIF command_row."commandType" = 'ACTIVATE_COHORT' THEN
      IF cohort_row.status <> 'STAGED' OR cohort_row."effectiveAt" > CURRENT_TIMESTAMP OR EXISTS (SELECT 1 FROM public."OpeningInventoryCutover" WHERE "cohortId" = cohort_row.id AND status <> 'RECONCILED') THEN
        RAISE EXCEPTION 'OPENING_INVENTORY_ACTIVATION_PRECONDITION_FAILED' USING ERRCODE = '55000';
      END IF;
      SELECT CASE WHEN value::text ~ '^[0-9]+$' THEN (value #>> '{}')::integer END INTO max_count_age_minutes
       FROM public."CompanyPolicySetting" WHERE "tenantId" = cohort_row."tenantId" AND "companyId" = cohort_row."companyId"
         AND key = 'inventory.opening_cutover.max_count_age_minutes' AND status = 'ACTIVE' AND "isDefault" = false AND "sourceDecisionId" = 'DEC-0263';
      SELECT CASE WHEN value::text ~ '^[0-9]+$' THEN (value #>> '{}')::integer END INTO max_freeze_minutes
       FROM public."CompanyPolicySetting" WHERE "tenantId" = cohort_row."tenantId" AND "companyId" = cohort_row."companyId"
         AND key = 'inventory.opening_cutover.max_freeze_minutes' AND status = 'ACTIVE' AND "isDefault" = false AND "sourceDecisionId" = 'DEC-0263';
      IF max_count_age_minutes IS NULL OR max_freeze_minutes IS NULL OR max_count_age_minutes NOT BETWEEN 1 AND 525600 OR max_freeze_minutes NOT BETWEEN 1 AND 525600 THEN
        RAISE EXCEPTION 'OPENING_INVENTORY_CUTOVER_WINDOW_NOT_CONFIGURED' USING ERRCODE = '55000';
      END IF;
      IF cohort_row."frozenAt" IS NULL OR cohort_row."frozenAt" + make_interval(mins => max_freeze_minutes) < CURRENT_TIMESTAMP
         OR EXISTS (SELECT 1 FROM public."OpeningInventoryCutover" cutover JOIN public."StockCountAttempt" count_attempt ON count_attempt.id = cutover."stockCountAttemptId"
             WHERE cutover."cohortId" = cohort_row.id AND (count_attempt."cutoffAt" IS NULL OR count_attempt."cutoffAt" + make_interval(mins => max_count_age_minutes) < CURRENT_TIMESTAMP)) THEN
        RAISE EXCEPTION 'OPENING_INVENTORY_CUTOVER_WINDOW_EXPIRED' USING ERRCODE = '55000';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public."InventoryPilotConfigurationRevision" revision
         WHERE revision.id = cohort_row."configurationRevisionId" AND revision."tenantId" = cohort_row."tenantId" AND revision."companyId" = cohort_row."companyId"
           AND revision."revisionNumber" = cohort_row."configurationRevisionNumber" AND revision."configurationDigest" = cohort_row."configurationDigest" AND revision.status = 'SEALED'
      ) OR EXISTS (
        SELECT 1 FROM public."OpeningInventoryCutover" child
         WHERE child."cohortId" = cohort_row.id AND NOT EXISTS (
           SELECT 1 FROM public."InventoryPilotEndpointMembership" endpoint
            WHERE endpoint."configurationRevisionId" = cohort_row."configurationRevisionId" AND endpoint."tenantId" = cohort_row."tenantId" AND endpoint."companyId" = cohort_row."companyId"
              AND endpoint."configurationRevisionNumber" = cohort_row."configurationRevisionNumber" AND endpoint.capability = 'OPENING_STOCK_LOCATION'
              AND endpoint."inventoryLocationId" = child."inventoryLocationId" AND endpoint."locationId" = child."locationId"
         )
      ) OR EXISTS (
        SELECT 1 FROM public."InventoryPilotEndpointMembership" endpoint
         WHERE endpoint."configurationRevisionId" = cohort_row."configurationRevisionId" AND endpoint."tenantId" = cohort_row."tenantId" AND endpoint."companyId" = cohort_row."companyId"
           AND endpoint."configurationRevisionNumber" = cohort_row."configurationRevisionNumber" AND endpoint.capability = 'OPENING_STOCK_LOCATION'
           AND NOT EXISTS (SELECT 1 FROM public."OpeningInventoryCutover" child WHERE child."cohortId" = cohort_row.id AND child."inventoryLocationId" = endpoint."inventoryLocationId")
      ) OR EXISTS (
        SELECT 1 FROM public."OpeningInventoryCutoverLine" line JOIN public."OpeningInventoryCutover" child ON child.id = line."cutoverId"
         WHERE child."cohortId" = cohort_row.id AND NOT EXISTS (
           SELECT 1 FROM public."InventoryPilotItemMembership" item_membership
            WHERE item_membership."configurationRevisionId" = cohort_row."configurationRevisionId" AND item_membership."tenantId" = cohort_row."tenantId" AND item_membership."companyId" = cohort_row."companyId"
              AND item_membership."configurationRevisionNumber" = cohort_row."configurationRevisionNumber" AND item_membership."itemId" = line."itemId"
         )
      ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_CONFIGURATION_MEMBERSHIP_INVALID' USING ERRCODE = '55000'; END IF;
      FOR cutover_row IN SELECT * FROM public."OpeningInventoryCutover" WHERE "cohortId" = cohort_row.id AND status = 'RECONCILED' ORDER BY "inventoryLocationId" LOOP
        PERFORM public.assert_opening_inventory_cutover_facts(cutover_row.id);
      END LOOP;
      -- Lock every affected location in a stable order before any opening line
      -- is written.  Ordinary inventory writers use the same location lock.
      PERFORM 1 FROM public."InventoryLocation" location_lock
       WHERE location_lock.id IN (SELECT child."inventoryLocationId" FROM public."OpeningInventoryCutover" child WHERE child."cohortId" = cohort_row.id)
       ORDER BY location_lock.id FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM public."InventoryMovement" movement
          JOIN public."OpeningInventoryCutoverLine" line ON line."itemId" = movement."itemId" AND line."inventoryLocationId" = movement."inventoryLocationId"
          JOIN public."OpeningInventoryCutover" child ON child.id = line."cutoverId"
         WHERE child."cohortId" = cohort_row.id AND movement."tenantId" = cohort_row."tenantId" AND movement."companyId" = cohort_row."companyId"
      ) OR EXISTS (
        SELECT 1 FROM public."InventoryBalance" balance
         WHERE balance."tenantId" = cohort_row."tenantId" AND balance."companyId" = cohort_row."companyId"
           AND EXISTS (
             SELECT 1 FROM public."OpeningInventoryCutoverLine" selected_line
               JOIN public."OpeningInventoryCutover" selected_child ON selected_child.id = selected_line."cutoverId"
              WHERE selected_child."cohortId" = cohort_row.id
                AND selected_line."itemId" = balance."itemId"
                AND selected_line."inventoryLocationId" = balance."inventoryLocationId"
           )
           AND (balance."qtyOnHand" <> 0 OR NOT EXISTS (
             SELECT 1 FROM public."OpeningInventoryCutoverLine" exact_line
               JOIN public."OpeningInventoryCutover" exact_child ON exact_child.id = exact_line."cutoverId"
              WHERE exact_child."cohortId" = cohort_row.id
                AND exact_line."itemId" = balance."itemId"
                AND exact_line."inventoryLocationId" = balance."inventoryLocationId"
                AND exact_line."lotKey" = balance."lotKey"
                AND exact_line."uomId" = balance."baseUomId"
                AND exact_line."lotNumber" IS NOT DISTINCT FROM balance."lotNumber"
                AND exact_line."expiryDate" IS NOT DISTINCT FROM balance."expiryDate"
           ))
      ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_PREACTIVATION_STOCK_STATE_INVALID' USING ERRCODE = '55000'; END IF;
      FOR line_row IN
        SELECT line.* FROM public."OpeningInventoryCutoverLine" line
          JOIN public."OpeningInventoryCutover" child ON child.id = line."cutoverId"
         WHERE child."cohortId" = cohort_row.id AND child.status = 'RECONCILED'
         ORDER BY line."inventoryLocationId", line."itemId", line."lotKey" FOR UPDATE OF line
      LOOP
        IF line_row."openingQuantityBaseUom" > 0 THEN
          INSERT INTO public."InventoryMovement" (
          "tenantId", "companyId", "inventoryLocationId", "itemId", "movementType", "occurredAt", "enteredQuantity", "enteredUomId", "quantityDeltaBaseUom", "baseUomId",
          "lotNumber", "expiryDate", "unitCost", "totalCost", "sourceDocumentType", "sourceDocumentId", "sourceDocumentLineId", "sourceEventKey", "reasonCode", "notes", "postedByUserId"
          ) VALUES (
          line_row."tenantId", line_row."companyId", line_row."inventoryLocationId", line_row."itemId", 'OPENING_BALANCE_IN', cohort_row."effectiveAt", line_row."openingQuantityBaseUom", line_row."uomId", line_row."openingQuantityBaseUom", line_row."uomId",
          line_row."lotNumber", line_row."expiryDate", line_row."unitCost", line_row."openingValue", 'OpeningInventoryCutover', line_row."cutoverId", line_row.id, 'OPENING_STOCK:' || line_row.id::text, 'OPENING_STOCK_CUTOVER', command_row."requestReason", command_row."requestedByUserId"
          ) RETURNING id INTO movement_id;
          UPDATE public."OpeningInventoryCutoverLine" SET "postedMovementId" = movement_id WHERE id = line_row.id AND "postedMovementId" IS NULL;
          IF NOT FOUND THEN RAISE EXCEPTION 'OPENING_INVENTORY_LINE_POSTING_CONFLICT' USING ERRCODE = '40001'; END IF;
        END IF;
      END LOOP;
      UPDATE public."OpeningInventoryCutover"
         SET status = 'ACTIVE', version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "cohortId" = cohort_row.id AND status = 'RECONCILED';
      IF (SELECT count(*) FROM public."OpeningInventoryCutover" WHERE "cohortId" = cohort_row.id AND status <> 'ACTIVE') <> 0 THEN
        RAISE EXCEPTION 'OPENING_INVENTORY_ACTIVATION_PRECONDITION_FAILED' USING ERRCODE = '55000';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public."OpeningInventoryCutoverLine" line JOIN public."OpeningInventoryCutover" child ON child.id = line."cutoverId"
          LEFT JOIN public."InventoryMovement" movement ON movement.id = line."postedMovementId"
          LEFT JOIN public."InventoryBalance" balance ON balance."inventoryLocationId" = line."inventoryLocationId" AND balance."itemId" = line."itemId" AND balance."lotKey" = line."lotKey"
         WHERE child."cohortId" = cohort_row.id AND (
           (line."openingQuantityBaseUom" > 0 AND (movement.id IS NULL OR movement."quantityDeltaBaseUom" <> line."openingQuantityBaseUom" OR movement."baseUomId" <> line."uomId" OR balance."qtyOnHand" <> line."openingQuantityBaseUom" OR balance."baseUomId" <> line."uomId"))
           OR (line."openingQuantityBaseUom" = 0 AND (line."postedMovementId" IS NOT NULL OR movement.id IS NOT NULL OR balance.id IS NOT NULL))
         )
      ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_POSTACTIVATION_RECONCILIATION_MISMATCH' USING ERRCODE = '55000'; END IF;
      INSERT INTO public."OpeningInventoryReconciliation" (
        "cutoverId", "tenantId", "companyId", "inventoryLocationId", "reconciliationType", "lineCount", "quantityDigest", "valuationDigest", "reconciliationJson", "reconciliationDigest", "reconciledByUserId", "reconciledAt"
      ) SELECT child.id, child."tenantId", child."companyId", child."inventoryLocationId", 'POST_ACTIVATION', count(*),
          encode(public.digest(jsonb_agg(jsonb_build_object('lineId', line.id, 'quantity', line."openingQuantityBaseUom", 'postedMovementId', line."postedMovementId") ORDER BY line."lineNumber")::text, 'sha256'), 'hex'),
          encode(public.digest(jsonb_agg(jsonb_build_object('lineId', line.id, 'value', line."openingValue") ORDER BY line."lineNumber")::text, 'sha256'), 'hex'),
          jsonb_agg(jsonb_build_object('lineId', line.id, 'quantity', line."openingQuantityBaseUom", 'postedMovementId', line."postedMovementId") ORDER BY line."lineNumber")::text,
          encode(public.digest(jsonb_agg(jsonb_build_object('lineId', line.id, 'quantity', line."openingQuantityBaseUom", 'postedMovementId', line."postedMovementId") ORDER BY line."lineNumber")::text, 'sha256'), 'hex'), command_row."requestedByUserId", CURRENT_TIMESTAMP
        FROM public."OpeningInventoryCutover" child JOIN public."OpeningInventoryCutoverLine" line ON line."cutoverId" = child.id
       WHERE child."cohortId" = cohort_row.id GROUP BY child.id, child."tenantId", child."companyId", child."inventoryLocationId";
      UPDATE public."OpeningInventoryCohort" SET status = 'ACTIVE', version = version + 1, "activatedAt" = CURRENT_TIMESTAMP, "activatedByUserId" = command_row."requestedByUserId", "updatedAt" = CURRENT_TIMESTAMP WHERE id = cohort_row.id;
      SELECT COALESCE(max("sequenceNumber"), 0) + 1 INTO current_sequence FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id;
      INSERT INTO public."OpeningInventoryCohortEvent" ("cohortId", "tenantId", "companyId", "sequenceNumber", "eventType", "priorEventId", "canonicalJson", "eventDigest", "actorUserId", "occurredAt")
      VALUES (cohort_row.id, cohort_row."tenantId", cohort_row."companyId", current_sequence, 'COHORT_ACTIVATED',
        (SELECT id FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id ORDER BY "sequenceNumber" DESC LIMIT 1),
        json_build_object('commandId', command_row.id, 'cohortId', cohort_row.id)::text, command_row."commandDigest", command_row."requestedByUserId", CURRENT_TIMESTAMP);

    ELSE
      SELECT * INTO cutover_row FROM public."OpeningInventoryCutover" WHERE id = command_row."cutoverId" FOR UPDATE;
      IF NOT FOUND OR cutover_row.version <> command_row."expectedCutoverVersion" OR cohort_row.status NOT IN ('FROZEN', 'STAGED', 'REVERSING') OR cutover_row.status <> 'RECONCILED' THEN
        RAISE EXCEPTION 'OPENING_INVENTORY_REVERSAL_PRECONDITION_FAILED' USING ERRCODE = '55000';
      END IF;
      IF cohort_row.status <> 'REVERSING' THEN
        UPDATE public."OpeningInventoryCohort" SET status = 'REVERSING', version = version + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = cohort_row.id;
        SELECT COALESCE(max("sequenceNumber"), 0) + 1 INTO current_sequence FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id;
        INSERT INTO public."OpeningInventoryCohortEvent" ("cohortId", "tenantId", "companyId", "sequenceNumber", "eventType", "priorEventId", "canonicalJson", "eventDigest", "actorUserId", "occurredAt")
        VALUES (cohort_row.id, cohort_row."tenantId", cohort_row."companyId", current_sequence, 'COHORT_REVERSAL_REQUESTED', (SELECT id FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id ORDER BY "sequenceNumber" DESC LIMIT 1), json_build_object('commandId', command_row.id, 'cohortId', cohort_row.id)::text, command_row."commandDigest", command_row."requestedByUserId", CURRENT_TIMESTAMP);
      END IF;
      UPDATE public."OpeningInventoryCutover" SET status = 'REVERSING', version = version + 1, "reversalRequestedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = cutover_row.id;
      IF EXISTS (SELECT 1 FROM public."InventoryMovement" movement JOIN public."OpeningInventoryCutoverLine" line ON line."itemId" = movement."itemId" AND line."inventoryLocationId" = movement."inventoryLocationId" WHERE line."cutoverId" = cutover_row.id) THEN RAISE EXCEPTION 'OPENING_INVENTORY_PREACTIVE_REVERSAL_ONLY' USING ERRCODE = '55000'; END IF;
      UPDATE public."OpeningInventoryCutover" SET status = 'REVERSED', version = version + 1, "reversedAt" = CURRENT_TIMESTAMP, "reversalReason" = 'Controlled opening-stock reversal', "updatedAt" = CURRENT_TIMESTAMP WHERE id = cutover_row.id;
      IF NOT EXISTS (SELECT 1 FROM public."OpeningInventoryCutover" WHERE "cohortId" = cohort_row.id AND status <> 'REVERSED') THEN
        UPDATE public."OpeningInventoryCohort" SET status = 'REVERSED', version = version + 1, "reversedAt" = CURRENT_TIMESTAMP, "reversedByUserId" = command_row."requestedByUserId", "reversalReason" = 'Controlled opening-stock reversal', "updatedAt" = CURRENT_TIMESTAMP WHERE id = cohort_row.id;
        SELECT COALESCE(max("sequenceNumber"), 0) + 1 INTO current_sequence FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id;
        INSERT INTO public."OpeningInventoryCohortEvent" ("cohortId", "tenantId", "companyId", "sequenceNumber", "eventType", "priorEventId", "canonicalJson", "eventDigest", "actorUserId", "occurredAt")
        VALUES (cohort_row.id, cohort_row."tenantId", cohort_row."companyId", current_sequence, 'COHORT_REVERSED', (SELECT id FROM public."OpeningInventoryCohortEvent" WHERE "cohortId" = cohort_row.id ORDER BY "sequenceNumber" DESC LIMIT 1), json_build_object('commandId', command_row.id, 'cohortId', cohort_row.id)::text, command_row."commandDigest", command_row."requestedByUserId", CURRENT_TIMESTAMP);
      END IF;
    END IF;
    INSERT INTO public."AuditEvent" (id, "tenantId", "companyId", "actorUserId", "eventType", "entityType", "entityId", "occurredAt", metadata)
    VALUES (gen_random_uuid(), command_row."tenantId", command_row."companyId", command_row."requestedByUserId", 'OPENING_INVENTORY_COMMAND_SUCCEEDED', 'OpeningInventoryExecutionCommand', command_row.id, CURRENT_TIMESTAMP,
      json_build_object('commandType', command_row."commandType", 'cohortId', command_row."cohortId", 'cutoverId', command_row."cutoverId", 'commandDigest', command_row."commandDigest"));
    UPDATE public."OpeningInventoryExecutionCommand" SET status = 'SUCCEEDED', "completedAt" = CURRENT_TIMESTAMP WHERE id = command_id;
    RETURN 'SUCCEEDED';
  EXCEPTION WHEN serialization_failure OR deadlock_detected THEN
    UPDATE public."OpeningInventoryExecutionCommand" SET status = 'FAILED_RETRYABLE', "completedAt" = CURRENT_TIMESTAMP, "failureCode" = SQLSTATE, "failureDetail" = SQLERRM WHERE id = command_id;
    RETURN 'FAILED_RETRYABLE';
  WHEN OTHERS THEN
    UPDATE public."OpeningInventoryExecutionCommand" SET status = 'FAILED_TERMINAL', "completedAt" = CURRENT_TIMESTAMP, "failureCode" = SQLSTATE, "failureDetail" = SQLERRM WHERE id = command_id;
    RETURN 'FAILED_TERMINAL';
  END;
END; $$;
REVOKE ALL ON FUNCTION public.execute_opening_inventory_command(UUID) FROM PUBLIC;

CREATE TRIGGER "OpeningInventoryCohort_transition_trg" BEFORE UPDATE OR DELETE ON "OpeningInventoryCohort" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_inventory_cohort();
CREATE TRIGGER "OpeningInventoryCohort_seal_event_trg" AFTER UPDATE ON "OpeningInventoryCohort" FOR EACH ROW EXECUTE FUNCTION public.append_opening_inventory_cohort_seal_event();
CREATE TRIGGER "OpeningInventoryCutover_transition_trg" BEFORE INSERT OR UPDATE OR DELETE ON "OpeningInventoryCutover" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_inventory_cutover();
CREATE TRIGGER "OpeningInventoryCutoverLine_append_only_trg" BEFORE INSERT OR UPDATE OR DELETE ON "OpeningInventoryCutoverLine" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_inventory_cutover_line();
CREATE TRIGGER "OpeningInventoryReconciliation_append_only_trg" BEFORE INSERT OR UPDATE OR DELETE ON "OpeningInventoryReconciliation" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_inventory_reconciliation();
CREATE TRIGGER "OpeningInventoryApprovalAttestation_append_only_trg" BEFORE INSERT OR UPDATE OR DELETE ON "OpeningInventoryApprovalAttestation" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_inventory_approval_attestation();
CREATE TRIGGER "OpeningInventoryCohortEvent_append_only_trg" BEFORE INSERT OR UPDATE OR DELETE ON "OpeningInventoryCohortEvent" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_inventory_cohort_event();
CREATE TRIGGER "OpeningInventoryExecutionCommand_scope_trg" BEFORE INSERT OR UPDATE ON "OpeningInventoryExecutionCommand" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_inventory_execution_command_scope();
CREATE TRIGGER "OpeningInventoryExecutionCommand_transition_trg" BEFORE UPDATE OR DELETE ON "OpeningInventoryExecutionCommand" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_inventory_execution_command();
CREATE TRIGGER "00_OpeningInventoryMovement_fence_trg" BEFORE INSERT ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_inventory_movement_fence();
CREATE TRIGGER "90_InventoryMovement_balance_cache_trg" AFTER INSERT ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement_to_balance();
CREATE TRIGGER "InventoryBalance_derived_cache_guard_trg" BEFORE INSERT OR UPDATE OR DELETE ON "InventoryBalance" FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_balance_derived_cache();
ALTER TABLE "OpeningInventoryCohort" ENABLE ALWAYS TRIGGER "OpeningInventoryCohort_transition_trg";
ALTER TABLE "OpeningInventoryCohort" ENABLE ALWAYS TRIGGER "OpeningInventoryCohort_seal_event_trg";
ALTER TABLE "OpeningInventoryCutover" ENABLE ALWAYS TRIGGER "OpeningInventoryCutover_transition_trg";
ALTER TABLE "OpeningInventoryCutoverLine" ENABLE ALWAYS TRIGGER "OpeningInventoryCutoverLine_append_only_trg";
ALTER TABLE "OpeningInventoryReconciliation" ENABLE ALWAYS TRIGGER "OpeningInventoryReconciliation_append_only_trg";
ALTER TABLE "OpeningInventoryApprovalAttestation" ENABLE ALWAYS TRIGGER "OpeningInventoryApprovalAttestation_append_only_trg";
ALTER TABLE "OpeningInventoryCohortEvent" ENABLE ALWAYS TRIGGER "OpeningInventoryCohortEvent_append_only_trg";
ALTER TABLE "OpeningInventoryExecutionCommand" ENABLE ALWAYS TRIGGER "OpeningInventoryExecutionCommand_scope_trg";
ALTER TABLE "OpeningInventoryExecutionCommand" ENABLE ALWAYS TRIGGER "OpeningInventoryExecutionCommand_transition_trg";
ALTER TABLE "InventoryMovement" ENABLE ALWAYS TRIGGER "00_OpeningInventoryMovement_fence_trg";
ALTER TABLE "InventoryMovement" ENABLE ALWAYS TRIGGER "90_InventoryMovement_balance_cache_trg";
ALTER TABLE "InventoryBalance" ENABLE ALWAYS TRIGGER "InventoryBalance_derived_cache_guard_trg";

COMMIT;
