-- DEC-0261 Inventory Pilot relational classifier, activation history, source
-- versions, and typed approval-submission intents. This additive migration
-- creates no configuration, membership, activation, or intent rows.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

DO $permission_preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Permission"
     WHERE id = '00000000-0000-4000-8000-000000000177'
       AND code <> 'inventory.transfer.approve'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_APPROVE_PERMISSION_ID_CONFLICT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Permission"
     WHERE code = 'inventory.transfer.approve'
       AND (id <> '00000000-0000-4000-8000-000000000177'
            OR "tenantId" IS NOT NULL
            OR module <> 'inventory'
            OR action <> 'transfer.approve')
  ) THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_APPROVE_PERMISSION_METADATA_CONFLICT';
  END IF;
END;
$permission_preflight$;

INSERT INTO "Permission" (id, code, module, action, description)
VALUES (
  '00000000-0000-4000-8000-000000000177',
  'inventory.transfer.approve',
  'inventory',
  'transfer.approve',
  'Approve an inventory transfer through its configured normalized approval route.'
)
ON CONFLICT (code) DO NOTHING;

-- Extend the existing database-enforced producer family set before either
-- inventory family can create or mutate a normalized approval graph. The lock
-- identity and runtime/shared-only grant boundary remain unchanged.
CREATE OR REPLACE FUNCTION public.acquire_approval_routing_producer_barrier_shared(
  scope_tenant_id UUID,
  scope_company_id UUID,
  producer_document_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $inventory_pilot_barrier$
BEGIN
  IF scope_tenant_id IS NULL OR scope_company_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public."Company" company
     WHERE company."id" = scope_company_id
       AND company."tenantId" = scope_tenant_id
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_SCOPE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF producer_document_type IS NULL OR producer_document_type NOT IN (
    'PurchaseRequest', 'QuotationRecommendation', 'PurchaseOrder',
    'PurchaseOrderBalanceClosure', 'PurchaseOrderAmendment', 'WastageReport',
    'StockAdjustment', 'FinanceCloseRun', 'BudgetRevision', 'ExpenseRequest',
    'CashAdvanceRequest', 'PettyCashRequest', 'PaymentRequest', 'PaymentRelease',
    'EmployeeLeaveRequest', 'EmployeeOvertimeRecord', 'WorkforceSchedule',
    'AttendanceImportBatch', 'InventoryTransfer', 'StockCountAttemptReview'
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_FAMILY_UNSUPPORTED'
      USING ERRCODE = '55000';
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'ogfi:approval-routing-producer-barrier:v1:'
        || scope_tenant_id::text || ':' || scope_company_id::text,
      6510615555426900570::bigint
    )
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_RETRY'
      USING ERRCODE = '40001';
  END IF;
END;
$inventory_pilot_barrier$;

REVOKE ALL ON FUNCTION public.acquire_approval_routing_producer_barrier_shared(UUID, UUID, TEXT) FROM PUBLIC;

CREATE TYPE "InventoryPilotConfigurationStatus" AS ENUM ('SEALED');
CREATE TYPE "InventoryPilotEndpointCapability" AS ENUM (
  'TRANSFER_SOURCE', 'TRANSFER_DESTINATION', 'COUNT_LOCATION'
);
CREATE TYPE "InventoryPilotApprovalFamily" AS ENUM (
  'InventoryTransfer', 'StockCountAttemptReview'
);
CREATE TYPE "InventoryPilotActivationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "InventoryTransfer" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StockCountAttempt" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StockCountSession" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_version_check" CHECK ("version" > 0);
ALTER TABLE "StockCountAttempt"
  ADD CONSTRAINT "StockCountAttempt_version_check" CHECK ("version" > 0);
ALTER TABLE "StockCountSession"
  ADD CONSTRAINT "StockCountSession_version_check" CHECK ("version" > 0);

ALTER TABLE "InventoryTransfer" DROP CONSTRAINT "InventoryTransfer_status_check";
ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_status_check" CHECK (
    status IN (
      'DRAFT', 'PENDING_APPROVAL', 'RETURNED', 'REJECTED', 'REQUESTED',
      'DISPATCHED', 'PARTIALLY_RECEIVED', 'DISPUTED', 'RECEIVED', 'CLOSED',
      'CANCELLED'
    )
  );

CREATE UNIQUE INDEX "InventoryLocation_exact_parent_scope_key"
  ON "InventoryLocation"(id, "tenantId", "companyId", "locationId");
CREATE UNIQUE INDEX "Item_exact_scope_key"
  ON "Item"(id, "tenantId", "companyId");
CREATE UNIQUE INDEX "InventoryTransfer_exact_scope_key"
  ON "InventoryTransfer"(id, "tenantId", "companyId");
CREATE UNIQUE INDEX "StockCountAttempt_exact_scope_key"
  ON "StockCountAttempt"(id, "tenantId", "companyId");
CREATE UNIQUE INDEX "StockCountAttempt_session_exact_key"
  ON "StockCountAttempt"(id, "tenantId", "companyId", "stockCountSessionId");
CREATE UNIQUE INDEX "StockCountSession_exact_scope_key"
  ON "StockCountSession"(id, "tenantId", "companyId");
CREATE UNIQUE INDEX "StockCountSession_current_attempt_exact_key"
  ON "StockCountSession"(id, "tenantId", "companyId", "currentAttemptId");
CREATE UNIQUE INDEX "ApprovalInstance_exact_document_scope_key"
  ON "ApprovalInstance"(id, "tenantId", "companyId", "documentType", "documentId");

CREATE TABLE "InventoryPilotConfigurationRevision" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  status "InventoryPilotConfigurationStatus" NOT NULL DEFAULT 'SEALED',
  "canonicalJson" TEXT NOT NULL,
  "configurationDigest" CHAR(64) NOT NULL,
  "sourceDecisionId" VARCHAR(40) NOT NULL,
  "sealedByUserId" UUID NOT NULL,
  "sealedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotConfigurationRevision_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotConfigurationRevision_identity_check" CHECK (
    "revisionNumber" > 0
    AND "schemaVersion" = 1
    AND length(btrim("sourceDecisionId")) BETWEEN 1 AND 40
    AND "configurationDigest" ~ '^[a-f0-9]{64}$'
    AND nullif(btrim("canonicalJson"), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX "InventoryPilotConfigurationRevision_scope_revision_key"
  ON "InventoryPilotConfigurationRevision"("tenantId", "companyId", "revisionNumber");
CREATE UNIQUE INDEX "InventoryPilotConfigurationRevision_exact_scope_key"
  ON "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber");
CREATE UNIQUE INDEX "InventoryPilotConfigurationRevision_exact_digest_key"
  ON "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest");
CREATE INDEX "InventoryPilotConfigurationRevision_scope_sealed_idx"
  ON "InventoryPilotConfigurationRevision"("tenantId", "companyId", "sealedAt");

ALTER TABLE "InventoryPilotConfigurationRevision"
  ADD CONSTRAINT "InventoryPilotConfigurationRevision_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationRevision_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationRevision_sealer_scope_fkey"
    FOREIGN KEY ("sealedByUserId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotEndpointMembership" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "configurationRevisionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "configurationRevisionNumber" INTEGER NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  capability "InventoryPilotEndpointCapability" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotEndpointMembership_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotEndpointMembership_revision_number_check"
    CHECK ("configurationRevisionNumber" > 0)
);
CREATE UNIQUE INDEX "InventoryPilotEndpointMembership_revision_capability_key"
  ON "InventoryPilotEndpointMembership"("configurationRevisionId", capability, "inventoryLocationId");
CREATE INDEX "InventoryPilotEndpointMembership_lookup_idx"
  ON "InventoryPilotEndpointMembership"("tenantId", "companyId", capability, "inventoryLocationId");
ALTER TABLE "InventoryPilotEndpointMembership"
  ADD CONSTRAINT "InventoryPilotEndpointMembership_revision_exact_fkey"
    FOREIGN KEY ("configurationRevisionId", "tenantId", "companyId", "configurationRevisionNumber")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotEndpointMembership_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotEndpointMembership_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotEndpointMembership_inventory_location_exact_fkey"
    FOREIGN KEY ("inventoryLocationId", "tenantId", "companyId", "locationId")
    REFERENCES "InventoryLocation"(id, "tenantId", "companyId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotEndpointMembership_location_exact_fkey"
    FOREIGN KEY ("locationId", "tenantId", "companyId")
    REFERENCES "Location"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotItemMembership" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "configurationRevisionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "configurationRevisionNumber" INTEGER NOT NULL,
  "itemId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotItemMembership_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotItemMembership_revision_number_check"
    CHECK ("configurationRevisionNumber" > 0)
);
CREATE UNIQUE INDEX "InventoryPilotItemMembership_revision_item_key"
  ON "InventoryPilotItemMembership"("configurationRevisionId", "itemId");
CREATE INDEX "InventoryPilotItemMembership_lookup_idx"
  ON "InventoryPilotItemMembership"("tenantId", "companyId", "itemId");
ALTER TABLE "InventoryPilotItemMembership"
  ADD CONSTRAINT "InventoryPilotItemMembership_revision_exact_fkey"
    FOREIGN KEY ("configurationRevisionId", "tenantId", "companyId", "configurationRevisionNumber")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotItemMembership_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotItemMembership_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotItemMembership_item_exact_fkey"
    FOREIGN KEY ("itemId", "tenantId", "companyId") REFERENCES "Item"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotFamilyActivationEvent" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  family "InventoryPilotApprovalFamily" NOT NULL,
  status "InventoryPilotActivationStatus" NOT NULL,
  "configurationRevisionId" UUID NOT NULL,
  "configurationRevisionNumber" INTEGER NOT NULL,
  "configurationDigest" CHAR(64) NOT NULL,
  generation INTEGER NOT NULL,
  "priorActivationEventId" UUID,
  "priorGeneration" INTEGER,
  "activatedByUserId" UUID NOT NULL,
  "activationReason" TEXT NOT NULL,
  "canonicalJson" TEXT NOT NULL,
  "activationHash" CHAR(64) NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotFamilyActivationEvent_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotFamilyActivationEvent_identity_check" CHECK (
    generation > 0 AND "configurationRevisionNumber" > 0
    AND "configurationDigest" ~ '^[a-f0-9]{64}$'
    AND "activationHash" ~ '^[a-f0-9]{64}$'
    AND nullif(btrim("activationReason"), '') IS NOT NULL
    AND nullif(btrim("canonicalJson"), '') IS NOT NULL
  ),
  CONSTRAINT "InventoryPilotFamilyActivationEvent_chain_check" CHECK (
    (generation = 1 AND "priorActivationEventId" IS NULL AND "priorGeneration" IS NULL)
    OR (generation > 1 AND "priorActivationEventId" IS NOT NULL AND "priorGeneration" = generation - 1)
  )
);
CREATE UNIQUE INDEX "InventoryPilotFamilyActivationEvent_scope_generation_key"
  ON "InventoryPilotFamilyActivationEvent"("tenantId", "companyId", family, generation);
CREATE UNIQUE INDEX "InventoryPilotFamilyActivationEvent_prior_successor_key"
  ON "InventoryPilotFamilyActivationEvent"("priorActivationEventId", "tenantId", "companyId", family);
CREATE UNIQUE INDEX "InventoryPilotFamilyActivationEvent_prior_generation_key"
  ON "InventoryPilotFamilyActivationEvent"("priorActivationEventId", "tenantId", "companyId", family, "priorGeneration");
CREATE UNIQUE INDEX "InventoryPilotFamilyActivationEvent_prior_exact_key"
  ON "InventoryPilotFamilyActivationEvent"(id, "tenantId", "companyId", family, generation);
CREATE UNIQUE INDEX "InventoryPilotFamilyActivationEvent_state_exact_key"
  ON "InventoryPilotFamilyActivationEvent"(id, "tenantId", "companyId", family, status, "configurationRevisionId", "configurationRevisionNumber", "configurationDigest", generation);
CREATE INDEX "InventoryPilotFamilyActivationEvent_scope_activated_idx"
  ON "InventoryPilotFamilyActivationEvent"("tenantId", "companyId", family, "activatedAt");
ALTER TABLE "InventoryPilotFamilyActivationEvent"
  ADD CONSTRAINT "InventoryPilotFamilyActivationEvent_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotFamilyActivationEvent_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotFamilyActivationEvent_revision_exact_fkey"
    FOREIGN KEY ("configurationRevisionId", "tenantId", "companyId", "configurationRevisionNumber", "configurationDigest")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotFamilyActivationEvent_prior_exact_fkey"
    FOREIGN KEY ("priorActivationEventId", "tenantId", "companyId", family, "priorGeneration")
    REFERENCES "InventoryPilotFamilyActivationEvent"(id, "tenantId", "companyId", family, generation) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotFamilyActivationEvent_actor_scope_fkey"
    FOREIGN KEY ("activatedByUserId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotFamilyActivation" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  family "InventoryPilotApprovalFamily" NOT NULL,
  status "InventoryPilotActivationStatus" NOT NULL,
  "configurationRevisionId" UUID NOT NULL,
  "configurationRevisionNumber" INTEGER NOT NULL,
  "configurationDigest" CHAR(64) NOT NULL,
  "currentActivationEventId" UUID NOT NULL,
  generation INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryPilotFamilyActivation_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotFamilyActivation_identity_check" CHECK (
    generation > 0 AND "configurationRevisionNumber" > 0
    AND "configurationDigest" ~ '^[a-f0-9]{64}$'
  )
);
CREATE UNIQUE INDEX "InventoryPilotFamilyActivation_currentActivationEventId_key"
  ON "InventoryPilotFamilyActivation"("currentActivationEventId");
CREATE UNIQUE INDEX "InventoryPilotFamilyActivation_scope_family_key"
  ON "InventoryPilotFamilyActivation"("tenantId", "companyId", family);
CREATE UNIQUE INDEX "InventoryPilotFamilyActivation_event_exact_key"
  ON "InventoryPilotFamilyActivation"("currentActivationEventId", "tenantId", "companyId", family, status, "configurationRevisionId", "configurationRevisionNumber", "configurationDigest", generation);
CREATE INDEX "InventoryPilotFamilyActivation_scope_status_idx"
  ON "InventoryPilotFamilyActivation"("tenantId", "companyId", status, "updatedAt");
ALTER TABLE "InventoryPilotFamilyActivation"
  ADD CONSTRAINT "InventoryPilotFamilyActivation_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotFamilyActivation_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotFamilyActivation_revision_exact_fkey"
    FOREIGN KEY ("configurationRevisionId", "tenantId", "companyId", "configurationRevisionNumber", "configurationDigest")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotFamilyActivation_event_exact_fkey"
    FOREIGN KEY ("currentActivationEventId", "tenantId", "companyId", family, status, "configurationRevisionId", "configurationRevisionNumber", "configurationDigest", generation)
    REFERENCES "InventoryPilotFamilyActivationEvent"(id, "tenantId", "companyId", family, status, "configurationRevisionId", "configurationRevisionNumber", "configurationDigest", generation) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryTransferApprovalSubmissionIntent" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryTransferId" UUID NOT NULL,
  "sourceVersionBefore" INTEGER NOT NULL,
  "sourceVersionAfter" INTEGER NOT NULL,
  "sourceCanonicalHash" CHAR(64) NOT NULL,
  "configurationRevisionId" UUID NOT NULL,
  "configurationRevisionNumber" INTEGER NOT NULL,
  "configurationDigest" CHAR(64) NOT NULL,
  "activationEventId" UUID NOT NULL,
  "activationFamily" "InventoryPilotApprovalFamily" NOT NULL DEFAULT 'InventoryTransfer',
  "activationStatus" "InventoryPilotActivationStatus" NOT NULL DEFAULT 'ACTIVE',
  "activationGeneration" INTEGER NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "requestCanonicalJson" TEXT NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "submitterUserId" UUID NOT NULL,
  "approvalInstanceId" UUID NOT NULL,
  "approvalDocumentType" VARCHAR(80) NOT NULL DEFAULT 'InventoryTransfer',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransferApprovalSubmissionIntent_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryTransferApprovalIntent_identity_check" CHECK (
    "sourceVersionBefore" > 0 AND "sourceVersionAfter" = "sourceVersionBefore" + 1
    AND "configurationRevisionNumber" > 0 AND "activationGeneration" > 0
    AND "activationFamily" = 'InventoryTransfer' AND "activationStatus" = 'ACTIVE'
    AND "approvalDocumentType" = 'InventoryTransfer'
    AND "sourceCanonicalHash" ~ '^[a-f0-9]{64}$'
    AND "configurationDigest" ~ '^[a-f0-9]{64}$'
    AND "requestHash" ~ '^[a-f0-9]{64}$'
    AND length(btrim("idempotencyKey")) BETWEEN 1 AND 200
    AND nullif(btrim("requestCanonicalJson"), '') IS NOT NULL
  )
);
CREATE UNIQUE INDEX "InventoryTransferApprovalSubmissionIntent_approvalInstanceId_key"
  ON "InventoryTransferApprovalSubmissionIntent"("approvalInstanceId");
CREATE UNIQUE INDEX "InventoryTransferApprovalIntent_scope_idempotency_key"
  ON "InventoryTransferApprovalSubmissionIntent"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "InventoryTransferApprovalIntent_graph_exact_key"
  ON "InventoryTransferApprovalSubmissionIntent"("approvalInstanceId", "tenantId", "companyId", "approvalDocumentType", "inventoryTransferId");
CREATE UNIQUE INDEX "InventoryTransferApprovalIntent_source_version_key"
  ON "InventoryTransferApprovalSubmissionIntent"("tenantId", "companyId", "inventoryTransferId", "sourceVersionAfter");
CREATE INDEX "InventoryTransferApprovalIntent_source_created_idx"
  ON "InventoryTransferApprovalSubmissionIntent"("tenantId", "companyId", "inventoryTransferId", "createdAt");
ALTER TABLE "InventoryTransferApprovalSubmissionIntent"
  ADD CONSTRAINT "InventoryTransferApprovalIntent_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferApprovalIntent_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferApprovalIntent_source_exact_fkey"
    FOREIGN KEY ("inventoryTransferId", "tenantId", "companyId") REFERENCES "InventoryTransfer"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferApprovalIntent_revision_exact_fkey"
    FOREIGN KEY ("configurationRevisionId", "tenantId", "companyId", "configurationRevisionNumber", "configurationDigest")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferApprovalIntent_activation_exact_fkey"
    FOREIGN KEY ("activationEventId", "tenantId", "companyId", "activationFamily", "activationStatus", "configurationRevisionId", "configurationRevisionNumber", "configurationDigest", "activationGeneration")
    REFERENCES "InventoryPilotFamilyActivationEvent"(id, "tenantId", "companyId", family, status, "configurationRevisionId", "configurationRevisionNumber", "configurationDigest", generation) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferApprovalIntent_submitter_scope_fkey"
    FOREIGN KEY ("submitterUserId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferApprovalIntent_graph_exact_fkey"
    FOREIGN KEY ("approvalInstanceId", "tenantId", "companyId", "approvalDocumentType", "inventoryTransferId")
    REFERENCES "ApprovalInstance"(id, "tenantId", "companyId", "documentType", "documentId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StockCountReviewSubmissionIntent" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "stockCountAttemptId" UUID NOT NULL,
  "stockCountSessionId" UUID NOT NULL,
  "attemptVersionBefore" INTEGER NOT NULL,
  "attemptVersionAfter" INTEGER NOT NULL,
  "sessionVersionBefore" INTEGER NOT NULL,
  "sessionVersionAfter" INTEGER NOT NULL,
  "evidenceCanonicalHash" CHAR(64) NOT NULL,
  "configurationRevisionId" UUID NOT NULL,
  "configurationRevisionNumber" INTEGER NOT NULL,
  "configurationDigest" CHAR(64) NOT NULL,
  "activationEventId" UUID NOT NULL,
  "activationFamily" "InventoryPilotApprovalFamily" NOT NULL DEFAULT 'StockCountAttemptReview',
  "activationStatus" "InventoryPilotActivationStatus" NOT NULL DEFAULT 'ACTIVE',
  "activationGeneration" INTEGER NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "requestCanonicalJson" TEXT NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "submitterUserId" UUID NOT NULL,
  "approvalInstanceId" UUID NOT NULL,
  "approvalDocumentType" VARCHAR(80) NOT NULL DEFAULT 'StockCountAttemptReview',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockCountReviewSubmissionIntent_pkey" PRIMARY KEY (id),
  CONSTRAINT "StockCountReviewIntent_identity_check" CHECK (
    "attemptVersionBefore" > 0 AND "attemptVersionAfter" = "attemptVersionBefore" + 1
    AND "sessionVersionBefore" > 0 AND "sessionVersionAfter" = "sessionVersionBefore" + 1
    AND "configurationRevisionNumber" > 0 AND "activationGeneration" > 0
    AND "activationFamily" = 'StockCountAttemptReview' AND "activationStatus" = 'ACTIVE'
    AND "approvalDocumentType" = 'StockCountAttemptReview'
    AND "evidenceCanonicalHash" ~ '^[a-f0-9]{64}$'
    AND "configurationDigest" ~ '^[a-f0-9]{64}$'
    AND "requestHash" ~ '^[a-f0-9]{64}$'
    AND length(btrim("idempotencyKey")) BETWEEN 1 AND 200
    AND nullif(btrim("requestCanonicalJson"), '') IS NOT NULL
  )
);
CREATE UNIQUE INDEX "StockCountReviewSubmissionIntent_approvalInstanceId_key"
  ON "StockCountReviewSubmissionIntent"("approvalInstanceId");
CREATE UNIQUE INDEX "StockCountReviewIntent_scope_idempotency_key"
  ON "StockCountReviewSubmissionIntent"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "StockCountReviewIntent_graph_exact_key"
  ON "StockCountReviewSubmissionIntent"("approvalInstanceId", "tenantId", "companyId", "approvalDocumentType", "stockCountAttemptId");
CREATE UNIQUE INDEX "StockCountReviewIntent_attempt_version_key"
  ON "StockCountReviewSubmissionIntent"("tenantId", "companyId", "stockCountAttemptId", "attemptVersionAfter");
CREATE INDEX "StockCountReviewIntent_session_created_idx"
  ON "StockCountReviewSubmissionIntent"("tenantId", "companyId", "stockCountSessionId", "createdAt");
ALTER TABLE "StockCountReviewSubmissionIntent"
  ADD CONSTRAINT "StockCountReviewIntent_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountReviewIntent_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountReviewIntent_attempt_exact_fkey"
    FOREIGN KEY ("stockCountAttemptId", "tenantId", "companyId", "stockCountSessionId")
    REFERENCES "StockCountAttempt"(id, "tenantId", "companyId", "stockCountSessionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountReviewIntent_session_exact_fkey"
    FOREIGN KEY ("stockCountSessionId", "tenantId", "companyId")
    REFERENCES "StockCountSession"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountReviewIntent_revision_exact_fkey"
    FOREIGN KEY ("configurationRevisionId", "tenantId", "companyId", "configurationRevisionNumber", "configurationDigest")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountReviewIntent_activation_exact_fkey"
    FOREIGN KEY ("activationEventId", "tenantId", "companyId", "activationFamily", "activationStatus", "configurationRevisionId", "configurationRevisionNumber", "configurationDigest", "activationGeneration")
    REFERENCES "InventoryPilotFamilyActivationEvent"(id, "tenantId", "companyId", family, status, "configurationRevisionId", "configurationRevisionNumber", "configurationDigest", generation) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountReviewIntent_submitter_scope_fkey"
    FOREIGN KEY ("submitterUserId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountReviewIntent_graph_exact_fkey"
    FOREIGN KEY ("approvalInstanceId", "tenantId", "companyId", "approvalDocumentType", "stockCountAttemptId")
    REFERENCES "ApprovalInstance"(id, "tenantId", "companyId", "documentType", "documentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Recursively canonicalize JSON objects by ASCII key and preserve array order.
CREATE FUNCTION "inventory_pilot_canonical_json"(payload JSONB)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog
AS $canonical$
DECLARE result TEXT;
BEGIN
  CASE jsonb_typeof(payload)
    WHEN 'object' THEN
      SELECT '{' || coalesce(string_agg(to_jsonb(e.key)::text || ':' || public."inventory_pilot_canonical_json"(e.value), ',' ORDER BY e.key), '') || '}'
        INTO result FROM jsonb_each(payload) AS e(key, value);
    WHEN 'array' THEN
      SELECT '[' || coalesce(string_agg(public."inventory_pilot_canonical_json"(e.value), ',' ORDER BY e.ordinality), '') || ']'
        INTO result FROM jsonb_array_elements(payload) WITH ORDINALITY AS e(value, ordinality);
    ELSE result := payload::text;
  END CASE;
  RETURN result;
END;
$canonical$;

CREATE FUNCTION "inventory_pilot_revision_canonical_json"(revision_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE STRICT
SET search_path = pg_catalog
AS $revision_canonical$
DECLARE revision_row RECORD; endpoint_rows JSONB; item_rows JSONB;
BEGIN
  SELECT * INTO revision_row FROM public."InventoryPilotConfigurationRevision" WHERE id = revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_REVISION_NOT_FOUND'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'capability', capability::text,
           'inventoryLocationId', "inventoryLocationId"::text,
           'locationId', "locationId"::text
         ) ORDER BY capability::text, "inventoryLocationId"::text, "locationId"::text), '[]'::jsonb)
    INTO endpoint_rows FROM public."InventoryPilotEndpointMembership"
   WHERE "configurationRevisionId" = revision_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemId', "itemId"::text) ORDER BY "itemId"::text), '[]'::jsonb)
    INTO item_rows FROM public."InventoryPilotItemMembership"
   WHERE "configurationRevisionId" = revision_id;
  RETURN public."inventory_pilot_canonical_json"(jsonb_build_object(
    'schemaVersion', revision_row."schemaVersion",
    'tenantId', revision_row."tenantId"::text,
    'companyId', revision_row."companyId"::text,
    'revisionNumber', revision_row."revisionNumber",
    'status', revision_row.status::text,
    'sourceDecisionId', revision_row."sourceDecisionId",
    'endpoints', endpoint_rows,
    'items', item_rows
  ));
END;
$revision_canonical$;

CREATE FUNCTION "validate_inventory_pilot_revision_insert"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $revision_insert$
DECLARE maximum_revision INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId"::text || ':' || NEW."companyId"::text || ':inventory-pilot-revision', 0));
  SELECT max("revisionNumber") INTO maximum_revision
    FROM public."InventoryPilotConfigurationRevision"
   WHERE "tenantId" = NEW."tenantId" AND "companyId" = NEW."companyId";
  IF maximum_revision IS NOT NULL AND NEW."revisionNumber" <= maximum_revision THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_REVISION_NOT_MONOTONIC';
  END IF;
  RETURN NEW;
END;
$revision_insert$;

CREATE TRIGGER "InventoryPilotConfigurationRevision_monotonic_trg"
BEFORE INSERT ON "InventoryPilotConfigurationRevision"
FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_revision_insert"();
ALTER TABLE "InventoryPilotConfigurationRevision"
  ENABLE ALWAYS TRIGGER "InventoryPilotConfigurationRevision_monotonic_trg";

CREATE FUNCTION "validate_inventory_pilot_revision_digest"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $revision_digest$
DECLARE revision_id UUID; revision_row RECORD; expected_canonical TEXT;
BEGIN
  revision_id := CASE
    WHEN TG_TABLE_NAME = 'InventoryPilotConfigurationRevision' THEN (to_jsonb(NEW)->>'id')::uuid
    ELSE (to_jsonb(NEW)->>'configurationRevisionId')::uuid
  END;
  SELECT * INTO revision_row FROM public."InventoryPilotConfigurationRevision" WHERE id = revision_id;
  expected_canonical := public."inventory_pilot_revision_canonical_json"(revision_id);
  IF revision_row.status <> 'SEALED'
     OR revision_row."canonicalJson" <> expected_canonical
     OR encode(public.digest(expected_canonical, 'sha256'), 'hex') <> revision_row."configurationDigest" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_REVISION_DIGEST_MISMATCH';
  END IF;
  RETURN NEW;
END;
$revision_digest$;

CREATE CONSTRAINT TRIGGER "InventoryPilotConfigurationRevision_digest_trg"
AFTER INSERT ON "InventoryPilotConfigurationRevision"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_revision_digest"();
CREATE CONSTRAINT TRIGGER "InventoryPilotEndpointMembership_digest_trg"
AFTER INSERT ON "InventoryPilotEndpointMembership"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_revision_digest"();
CREATE CONSTRAINT TRIGGER "InventoryPilotItemMembership_digest_trg"
AFTER INSERT ON "InventoryPilotItemMembership"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_revision_digest"();
ALTER TABLE "InventoryPilotConfigurationRevision" ENABLE ALWAYS TRIGGER "InventoryPilotConfigurationRevision_digest_trg";
ALTER TABLE "InventoryPilotEndpointMembership" ENABLE ALWAYS TRIGGER "InventoryPilotEndpointMembership_digest_trg";
ALTER TABLE "InventoryPilotItemMembership" ENABLE ALWAYS TRIGGER "InventoryPilotItemMembership_digest_trg";

CREATE FUNCTION "validate_inventory_pilot_activation_event"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $activation_event$
DECLARE state_row RECORD; state_found BOOLEAN; expected_canonical TEXT; maximum_active_revision INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId"::text || ':' || NEW."companyId"::text || ':inventory-pilot-activation', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId"::text || ':' || NEW."companyId"::text || ':' || NEW.family::text, 0));
  SELECT * INTO state_row FROM public."InventoryPilotFamilyActivation"
   WHERE "tenantId" = NEW."tenantId" AND "companyId" = NEW."companyId" AND family = NEW.family
   FOR UPDATE;
  state_found := FOUND;
  IF NEW.generation = 1 THEN
    IF state_found THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_ACTIVATION_GENERATION_CONFLICT'; END IF;
  ELSE
    IF NOT state_found OR state_row.generation <> NEW."priorGeneration" OR state_row."currentActivationEventId" <> NEW."priorActivationEventId" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_ACTIVATION_PRIOR_STATE_MISMATCH';
    END IF;
  END IF;
  IF NEW.status = 'ACTIVE' THEN
    SELECT max("configurationRevisionNumber") INTO maximum_active_revision
      FROM public."InventoryPilotFamilyActivationEvent"
     WHERE "tenantId" = NEW."tenantId" AND "companyId" = NEW."companyId"
       AND family = NEW.family AND status = 'ACTIVE';
    IF maximum_active_revision IS NOT NULL AND NEW."configurationRevisionNumber" <= maximum_active_revision THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_OLDER_REVISION_REACTIVATION_DENIED';
    END IF;
    IF state_found AND NEW."configurationRevisionNumber" <= state_row."configurationRevisionNumber" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_ACTIVATION_REVISION_NOT_FORWARD';
    END IF;
  ELSIF state_found AND NEW."configurationRevisionId" <> state_row."configurationRevisionId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_DEACTIVATION_REVISION_DRIFT';
  END IF;
  expected_canonical := public."inventory_pilot_canonical_json"(jsonb_build_object(
    'schemaVersion', 1, 'tenantId', NEW."tenantId"::text, 'companyId', NEW."companyId"::text,
    'family', NEW.family::text, 'status', NEW.status::text,
    'configurationRevisionId', NEW."configurationRevisionId"::text,
    'configurationRevisionNumber', NEW."configurationRevisionNumber",
    'configurationDigest', NEW."configurationDigest", 'generation', NEW.generation,
    'priorActivationEventId', CASE WHEN NEW."priorActivationEventId" IS NULL THEN NULL ELSE to_jsonb(NEW."priorActivationEventId"::text) END,
    'priorGeneration', NEW."priorGeneration", 'activatedByUserId', NEW."activatedByUserId"::text,
    'activationReason', NEW."activationReason"
  ));
  IF NEW."canonicalJson" <> expected_canonical OR encode(public.digest(expected_canonical, 'sha256'), 'hex') <> NEW."activationHash" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_ACTIVATION_EVENT_DIGEST_MISMATCH';
  END IF;
  NEW."activatedAt" := date_trunc('milliseconds', transaction_timestamp());
  RETURN NEW;
END;
$activation_event$;

CREATE TRIGGER "InventoryPilotFamilyActivationEvent_lineage_trg"
BEFORE INSERT ON "InventoryPilotFamilyActivationEvent"
FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_activation_event"();
ALTER TABLE "InventoryPilotFamilyActivationEvent"
  ENABLE ALWAYS TRIGGER "InventoryPilotFamilyActivationEvent_lineage_trg";

CREATE FUNCTION "validate_inventory_pilot_activation_transition"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $activation_transition$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.generation <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_ACTIVATION_CAS_INVALID';
    END IF;
  ELSE
    IF NEW.id <> OLD.id OR NEW."tenantId" <> OLD."tenantId" OR NEW."companyId" <> OLD."companyId" OR NEW.family <> OLD.family
       OR NEW."createdAt" <> OLD."createdAt" OR NEW.generation <> OLD.generation + 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_ACTIVATION_CAS_INVALID';
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."InventoryPilotFamilyActivationEvent" event
     WHERE event.id = NEW."currentActivationEventId" AND event."tenantId" = NEW."tenantId"
       AND event."companyId" = NEW."companyId" AND event.family = NEW.family
       AND event.status = NEW.status AND event."configurationRevisionId" = NEW."configurationRevisionId"
       AND event."configurationRevisionNumber" = NEW."configurationRevisionNumber"
       AND event."configurationDigest" = NEW."configurationDigest" AND event.generation = NEW.generation
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_ACTIVATION_EVENT_NOT_ACCEPTED';
  END IF;
  NEW."updatedAt" := date_trunc('milliseconds', transaction_timestamp());
  RETURN NEW;
END;
$activation_transition$;

CREATE TRIGGER "InventoryPilotFamilyActivation_transition_trg"
BEFORE INSERT OR UPDATE ON "InventoryPilotFamilyActivation"
FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_activation_transition"();
ALTER TABLE "InventoryPilotFamilyActivation"
  ENABLE ALWAYS TRIGGER "InventoryPilotFamilyActivation_transition_trg";

CREATE FUNCTION "validate_inventory_pilot_activation_event_acceptance"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $activation_acceptance$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."InventoryPilotFamilyActivation" state
     WHERE state."tenantId" = NEW."tenantId" AND state."companyId" = NEW."companyId"
       AND state.family = NEW.family AND state.generation >= NEW.generation
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_ACTIVATION_EVENT_NOT_ACCEPTED';
  END IF;
  RETURN NEW;
END;
$activation_acceptance$;

CREATE CONSTRAINT TRIGGER "InventoryPilotFamilyActivationEvent_acceptance_trg"
AFTER INSERT ON "InventoryPilotFamilyActivationEvent"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_activation_event_acceptance"();
ALTER TABLE "InventoryPilotFamilyActivationEvent"
  ENABLE ALWAYS TRIGGER "InventoryPilotFamilyActivationEvent_acceptance_trg";

CREATE FUNCTION "validate_inventory_pilot_cross_family_state"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $cross_family$
DECLARE mismatch_count INTEGER;
BEGIN
  SELECT count(DISTINCT "configurationRevisionId"::text || ':' || "configurationDigest")
    INTO mismatch_count FROM public."InventoryPilotFamilyActivation"
   WHERE "tenantId" = NEW."tenantId" AND "companyId" = NEW."companyId" AND status = 'ACTIVE';
  IF mismatch_count > 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_CROSS_FAMILY_REVISION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$cross_family$;

CREATE CONSTRAINT TRIGGER "InventoryPilotFamilyActivation_cross_family_trg"
AFTER INSERT OR UPDATE ON "InventoryPilotFamilyActivation"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_cross_family_state"();
ALTER TABLE "InventoryPilotFamilyActivation"
  ENABLE ALWAYS TRIGGER "InventoryPilotFamilyActivation_cross_family_trg";

CREATE FUNCTION "validate_inventory_transfer_approval_intent"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $transfer_intent$
BEGIN
  IF NEW."requestCanonicalJson" <> public."inventory_pilot_canonical_json"(NEW."requestCanonicalJson"::jsonb)
     OR encode(public.digest(NEW."requestCanonicalJson", 'sha256'), 'hex') <> NEW."requestHash" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_TRANSFER_APPROVAL_INTENT_REQUEST_HASH_MISMATCH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."InventoryTransfer" source
    JOIN public."ApprovalInstance" approval ON approval.id = NEW."approvalInstanceId"
    JOIN public."InventoryPilotFamilyActivation" activation
      ON activation."currentActivationEventId" = NEW."activationEventId"
     AND activation."tenantId" = NEW."tenantId" AND activation."companyId" = NEW."companyId"
     AND activation.family = NEW."activationFamily" AND activation.status = NEW."activationStatus"
     AND activation.generation = NEW."activationGeneration"
     AND activation."configurationRevisionId" = NEW."configurationRevisionId"
     AND activation."configurationDigest" = NEW."configurationDigest"
    WHERE source.id = NEW."inventoryTransferId" AND source."tenantId" = NEW."tenantId"
      AND source."companyId" = NEW."companyId" AND source.version = NEW."sourceVersionAfter"
      AND source.status = 'PENDING_APPROVAL' AND approval.status = 'PENDING'
      AND approval."documentType" = 'InventoryTransfer' AND approval."documentId" = source.id
      AND approval."tenantId" = NEW."tenantId" AND approval."companyId" = NEW."companyId"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_TRANSFER_APPROVAL_INTENT_LINEAGE_INVALID';
  END IF;
  RETURN NEW;
END;
$transfer_intent$;

CREATE TRIGGER "InventoryTransferApprovalSubmissionIntent_lineage_trg"
BEFORE INSERT ON "InventoryTransferApprovalSubmissionIntent"
FOR EACH ROW EXECUTE FUNCTION "validate_inventory_transfer_approval_intent"();
ALTER TABLE "InventoryTransferApprovalSubmissionIntent"
  ENABLE ALWAYS TRIGGER "InventoryTransferApprovalSubmissionIntent_lineage_trg";

CREATE FUNCTION "validate_stock_count_review_intent"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $count_intent$
BEGIN
  IF NEW."requestCanonicalJson" <> public."inventory_pilot_canonical_json"(NEW."requestCanonicalJson"::jsonb)
     OR encode(public.digest(NEW."requestCanonicalJson", 'sha256'), 'hex') <> NEW."requestHash" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STOCK_COUNT_REVIEW_INTENT_REQUEST_HASH_MISMATCH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."StockCountAttempt" attempt
    JOIN public."StockCountSession" session ON session.id = attempt."stockCountSessionId"
    JOIN public."ApprovalInstance" approval ON approval.id = NEW."approvalInstanceId"
    JOIN public."InventoryPilotFamilyActivation" activation
      ON activation."currentActivationEventId" = NEW."activationEventId"
     AND activation."tenantId" = NEW."tenantId" AND activation."companyId" = NEW."companyId"
     AND activation.family = NEW."activationFamily" AND activation.status = NEW."activationStatus"
     AND activation.generation = NEW."activationGeneration"
     AND activation."configurationRevisionId" = NEW."configurationRevisionId"
     AND activation."configurationDigest" = NEW."configurationDigest"
    WHERE attempt.id = NEW."stockCountAttemptId" AND attempt."tenantId" = NEW."tenantId"
      AND attempt."companyId" = NEW."companyId" AND attempt.version = NEW."attemptVersionAfter"
      AND attempt.status = 'SUBMITTED' AND session.id = NEW."stockCountSessionId"
      AND session."currentAttemptId" = attempt.id AND session.version = NEW."sessionVersionAfter"
      AND session.status = 'SUBMITTED' AND approval.status = 'PENDING'
      AND approval."documentType" = 'StockCountAttemptReview' AND approval."documentId" = attempt.id
      AND approval."tenantId" = NEW."tenantId" AND approval."companyId" = NEW."companyId"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STOCK_COUNT_REVIEW_INTENT_LINEAGE_INVALID';
  END IF;
  RETURN NEW;
END;
$count_intent$;

CREATE TRIGGER "StockCountReviewSubmissionIntent_lineage_trg"
BEFORE INSERT ON "StockCountReviewSubmissionIntent"
FOR EACH ROW EXECUTE FUNCTION "validate_stock_count_review_intent"();
ALTER TABLE "StockCountReviewSubmissionIntent"
  ENABLE ALWAYS TRIGGER "StockCountReviewSubmissionIntent_lineage_trg";

CREATE FUNCTION "reject_inventory_pilot_history_mutation"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $append_only$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INVENTORY_PILOT_HISTORY_APPEND_ONLY';
END;
$append_only$;

DO $append_only_triggers$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'InventoryPilotConfigurationRevision', 'InventoryPilotEndpointMembership',
    'InventoryPilotItemMembership', 'InventoryPilotFamilyActivationEvent',
    'InventoryTransferApprovalSubmissionIntent', 'StockCountReviewSubmissionIntent'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_pilot_history_mutation"()',
      table_name || '_append_only_guard_trg', table_name
    );
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', table_name, table_name || '_append_only_guard_trg');
  END LOOP;
END;
$append_only_triggers$;

CREATE TRIGGER "InventoryPilotFamilyActivation_remove_guard_trg"
BEFORE DELETE OR TRUNCATE ON "InventoryPilotFamilyActivation"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_pilot_history_mutation"();
ALTER TABLE "InventoryPilotFamilyActivation"
  ENABLE ALWAYS TRIGGER "InventoryPilotFamilyActivation_remove_guard_trg";

REVOKE ALL ON FUNCTION "inventory_pilot_canonical_json"(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION "inventory_pilot_revision_canonical_json"(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_revision_insert"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_revision_digest"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_activation_event"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_activation_transition"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_activation_event_acceptance"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_cross_family_state"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_transfer_approval_intent"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_stock_count_review_intent"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "reject_inventory_pilot_history_mutation"() FROM PUBLIC;

COMMIT;
