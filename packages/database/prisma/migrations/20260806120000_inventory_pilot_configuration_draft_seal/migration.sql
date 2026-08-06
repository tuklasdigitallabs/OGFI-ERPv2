-- DEC-0273: mutable pilot configuration drafts compiled atomically into the
-- existing immutable revision boundary. This migration is additive, creates no
-- draft or sealed configuration rows, and preserves schema-v1 canonical bytes.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE TYPE "InventoryPilotConfigurationDraftStatus" AS ENUM ('DRAFT', 'SEALED', 'ABANDONED');
CREATE TYPE "InventoryPilotParticipantResponsibility" AS ENUM (
  'PREPARER', 'SUBMITTER', 'OPERATIONS_REVIEWER', 'ACCOUNTING_REVIEWER', 'COMMAND_REQUESTER'
);
CREATE TYPE "InventoryPilotReadinessFamily" AS ENUM (
  'PurchaseRequest', 'QuotationRecommendation', 'PurchaseOrder', 'InventoryTransfer',
  'StockCountAttemptReview', 'WastageReport', 'StockAdjustment', 'OpeningInventoryCutover'
);

ALTER TABLE "InventoryPilotConfigurationRevision"
  DROP CONSTRAINT "InventoryPilotConfigurationRevision_identity_check",
  ADD COLUMN "predecessorRevisionId" UUID,
  ADD COLUMN "predecessorRevisionNumber" INTEGER,
  ADD COLUMN "predecessorDigest" CHAR(64),
  ADD CONSTRAINT "InventoryPilotConfigurationRevision_identity_check" CHECK (
    "revisionNumber" > 0
    AND "schemaVersion" IN (1, 2)
    AND length(btrim("sourceDecisionId")) BETWEEN 1 AND 40
    AND "configurationDigest" ~ '^[a-f0-9]{64}$'
    AND nullif(btrim("canonicalJson"), '') IS NOT NULL
    AND (
      ("predecessorRevisionId" IS NULL AND "predecessorRevisionNumber" IS NULL AND "predecessorDigest" IS NULL)
      OR ("predecessorRevisionId" IS NOT NULL AND "predecessorRevisionNumber" > 0 AND "predecessorDigest" ~ '^[a-f0-9]{64}$')
    )
    AND ("schemaVersion" = 2 OR "predecessorRevisionId" IS NULL)
  );

CREATE UNIQUE INDEX "InventoryPilotConfigurationRevision_predecessor_successor_key"
  ON "InventoryPilotConfigurationRevision"("predecessorRevisionId", "tenantId", "companyId");
CREATE UNIQUE INDEX "InventoryPilotConfigurationRevision_predecessor_exact_key"
  ON "InventoryPilotConfigurationRevision"("predecessorRevisionId", "tenantId", "companyId", "predecessorRevisionNumber", "predecessorDigest");
ALTER TABLE "InventoryPilotConfigurationRevision"
  ADD CONSTRAINT "InventoryPilotConfigurationRevision_predecessor_exact_fkey"
  FOREIGN KEY ("predecessorRevisionId", "tenantId", "companyId", "predecessorRevisionNumber", "predecessorDigest")
  REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "UserRoleAssignment_exact_actor_role_key"
  ON "UserRoleAssignment"(id, "userId", "roleId");
CREATE UNIQUE INDEX "ApprovalRule_exact_version_key"
  ON "ApprovalRule"(id, "tenantId", "companyId", "lineageId", version);

CREATE TABLE "InventoryPilotConfigurationDraft" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 2,
  status "InventoryPilotConfigurationDraftStatus" NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  "predecessorRevisionId" UUID,
  "predecessorRevisionNumber" INTEGER,
  "predecessorDigest" CHAR(64),
  "sourceDecisionId" VARCHAR(40) NOT NULL DEFAULT 'DEC-0273',
  "createdByUserId" UUID NOT NULL,
  "lastEditedByUserId" UUID NOT NULL,
  "sealedRevisionId" UUID,
  "sealedRevisionNumber" INTEGER,
  "sealedRevisionDigest" CHAR(64),
  "sealedAt" TIMESTAMP(3),
  "abandonedByUserId" UUID,
  "abandonedAt" TIMESTAMP(3),
  "abandonmentReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotConfigurationDraft_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotConfigurationDraft_identity_check" CHECK (
    "schemaVersion" = 2 AND version > 0
    AND length(btrim("sourceDecisionId")) BETWEEN 1 AND 40
    AND (
      ("predecessorRevisionId" IS NULL AND "predecessorRevisionNumber" IS NULL AND "predecessorDigest" IS NULL)
      OR ("predecessorRevisionId" IS NOT NULL AND "predecessorRevisionNumber" > 0 AND "predecessorDigest" ~ '^[a-f0-9]{64}$')
    )
    AND (
      (status = 'DRAFT' AND "sealedRevisionId" IS NULL AND "sealedRevisionNumber" IS NULL AND "sealedRevisionDigest" IS NULL
        AND "sealedAt" IS NULL AND "abandonedByUserId" IS NULL AND "abandonedAt" IS NULL AND "abandonmentReason" IS NULL)
      OR (status = 'SEALED' AND "sealedRevisionId" IS NOT NULL AND "sealedRevisionNumber" > 0
        AND "sealedRevisionDigest" ~ '^[a-f0-9]{64}$' AND "sealedAt" IS NOT NULL
        AND "abandonedByUserId" IS NULL AND "abandonedAt" IS NULL AND "abandonmentReason" IS NULL)
      OR (status = 'ABANDONED' AND "sealedRevisionId" IS NULL AND "sealedRevisionNumber" IS NULL AND "sealedRevisionDigest" IS NULL
        AND "sealedAt" IS NULL AND "abandonedByUserId" IS NOT NULL AND "abandonedAt" IS NOT NULL
        AND nullif(btrim("abandonmentReason"), '') IS NOT NULL)
    )
  )
);
CREATE UNIQUE INDEX "InventoryPilotConfigurationDraft_exact_scope_key"
  ON "InventoryPilotConfigurationDraft"(id, "tenantId", "companyId");
CREATE UNIQUE INDEX "InventoryPilotConfigurationDraft_state_exact_key"
  ON "InventoryPilotConfigurationDraft"(id, "tenantId", "companyId", version, status);
CREATE UNIQUE INDEX "InventoryPilotConfigurationDraft_sealedRevisionId_key"
  ON "InventoryPilotConfigurationDraft"("sealedRevisionId");
CREATE UNIQUE INDEX "InventoryPilotConfigurationDraft_sealed_revision_exact_key"
  ON "InventoryPilotConfigurationDraft"("sealedRevisionId", "tenantId", "companyId", "sealedRevisionNumber", "sealedRevisionDigest");
CREATE INDEX "InventoryPilotConfigurationDraft_scope_status_idx"
  ON "InventoryPilotConfigurationDraft"("tenantId", "companyId", status, "updatedAt");
CREATE INDEX "InventoryPilotConfigurationDraft_predecessor_idx"
  ON "InventoryPilotConfigurationDraft"("tenantId", "companyId", "predecessorRevisionId");
ALTER TABLE "InventoryPilotConfigurationDraft"
  ADD CONSTRAINT "InventoryPilotConfigurationDraft_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationDraft_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationDraft_predecessor_exact_fkey"
    FOREIGN KEY ("predecessorRevisionId", "tenantId", "companyId", "predecessorRevisionNumber", "predecessorDigest")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationDraft_sealed_revision_exact_fkey"
    FOREIGN KEY ("sealedRevisionId", "tenantId", "companyId", "sealedRevisionNumber", "sealedRevisionDigest")
    REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationDraft_creator_scope_fkey" FOREIGN KEY ("createdByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationDraft_last_editor_scope_fkey" FOREIGN KEY ("lastEditedByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationDraft_abandoner_scope_fkey" FOREIGN KEY ("abandonedByUserId", "tenantId")
    REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotDraftEndpointMembership" (
  id UUID NOT NULL DEFAULT gen_random_uuid(), "draftId" UUID NOT NULL,
  "tenantId" UUID NOT NULL, "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL, "locationId" UUID NOT NULL,
  capability "InventoryPilotEndpointCapability" NOT NULL,
  "isIncluded" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotDraftEndpointMembership_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "InventoryPilotDraftEndpointMembership_draft_capability_key"
  ON "InventoryPilotDraftEndpointMembership"("draftId", capability, "inventoryLocationId");
CREATE INDEX "InventoryPilotDraftEndpointMembership_scope_included_idx"
  ON "InventoryPilotDraftEndpointMembership"("tenantId", "companyId", "draftId", "isIncluded");
ALTER TABLE "InventoryPilotDraftEndpointMembership"
  ADD CONSTRAINT "InventoryPilotDraftEndpointMembership_draft_scope_fkey" FOREIGN KEY ("draftId", "tenantId", "companyId")
    REFERENCES "InventoryPilotConfigurationDraft"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftEndpointMembership_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftEndpointMembership_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftEndpoint_inventory_location_exact_fkey" FOREIGN KEY ("inventoryLocationId", "tenantId", "companyId", "locationId") REFERENCES "InventoryLocation"(id, "tenantId", "companyId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftEndpointMembership_location_exact_fkey" FOREIGN KEY ("locationId", "tenantId", "companyId") REFERENCES "Location"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotDraftItemMembership" (
  id UUID NOT NULL DEFAULT gen_random_uuid(), "draftId" UUID NOT NULL,
  "tenantId" UUID NOT NULL, "companyId" UUID NOT NULL, "itemId" UUID NOT NULL,
  "isIncluded" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotDraftItemMembership_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "InventoryPilotDraftItemMembership_draft_item_key" ON "InventoryPilotDraftItemMembership"("draftId", "itemId");
CREATE INDEX "InventoryPilotDraftItemMembership_scope_included_idx" ON "InventoryPilotDraftItemMembership"("tenantId", "companyId", "draftId", "isIncluded");
ALTER TABLE "InventoryPilotDraftItemMembership"
  ADD CONSTRAINT "InventoryPilotDraftItemMembership_draft_scope_fkey" FOREIGN KEY ("draftId", "tenantId", "companyId") REFERENCES "InventoryPilotConfigurationDraft"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftItemMembership_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftItemMembership_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftItemMembership_item_exact_fkey" FOREIGN KEY ("itemId", "tenantId", "companyId") REFERENCES "Item"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotDraftParticipant" (
  id UUID NOT NULL DEFAULT gen_random_uuid(), "draftId" UUID NOT NULL,
  "tenantId" UUID NOT NULL, "companyId" UUID NOT NULL,
  responsibility "InventoryPilotParticipantResponsibility" NOT NULL,
  "userId" UUID NOT NULL, "roleAssignmentId" UUID NOT NULL, "roleId" UUID NOT NULL,
  "isIncluded" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotDraftParticipant_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "InventoryPilotDraftParticipant_draft_responsibility_key" ON "InventoryPilotDraftParticipant"("draftId", responsibility);
CREATE INDEX "InventoryPilotDraftParticipant_scope_included_idx" ON "InventoryPilotDraftParticipant"("tenantId", "companyId", "draftId", "isIncluded");
CREATE INDEX "InventoryPilotDraftParticipant_actor_idx" ON "InventoryPilotDraftParticipant"("tenantId", "companyId", "userId");
ALTER TABLE "InventoryPilotDraftParticipant"
  ADD CONSTRAINT "InventoryPilotDraftParticipant_draft_scope_fkey" FOREIGN KEY ("draftId", "tenantId", "companyId") REFERENCES "InventoryPilotConfigurationDraft"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftParticipant_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftParticipant_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftParticipant_actor_scope_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftParticipant_role_assignment_exact_fkey" FOREIGN KEY ("roleAssignmentId", "userId", "roleId") REFERENCES "UserRoleAssignment"(id, "userId", "roleId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotDraftRouteReadiness" (
  id UUID NOT NULL DEFAULT gen_random_uuid(), "draftId" UUID NOT NULL,
  "tenantId" UUID NOT NULL, "companyId" UUID NOT NULL,
  family "InventoryPilotReadinessFamily" NOT NULL,
  "approvalRuleId" UUID NOT NULL, "approvalRuleLineageId" UUID NOT NULL,
  "approvalRuleVersion" INTEGER NOT NULL,
  "ruleDefinitionCanonicalJson" TEXT NOT NULL, "ruleDefinitionDigest" CHAR(64) NOT NULL,
  "resolverEvidenceCanonicalJson" TEXT, "resolverEvidenceDigest" CHAR(64),
  "readinessCheckedAt" TIMESTAMP(3) NOT NULL, "isIncluded" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotDraftRouteReadiness_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotDraftRouteReadiness_identity_check" CHECK (
    "approvalRuleVersion" > 0 AND "ruleDefinitionDigest" ~ '^[a-f0-9]{64}$'
    AND nullif(btrim("ruleDefinitionCanonicalJson"), '') IS NOT NULL
    AND (
      (family = 'PurchaseRequest'
        AND nullif(btrim("resolverEvidenceCanonicalJson"), '') IS NOT NULL
        AND "resolverEvidenceDigest" ~ '^[a-f0-9]{64}$')
      OR
      (family <> 'PurchaseRequest'
        AND "resolverEvidenceCanonicalJson" IS NULL
        AND "resolverEvidenceDigest" IS NULL)
    )
  )
);
CREATE UNIQUE INDEX "InventoryPilotDraftRouteReadiness_draft_family_key" ON "InventoryPilotDraftRouteReadiness"("draftId", family);
CREATE INDEX "InventoryPilotDraftRouteReadiness_scope_included_idx" ON "InventoryPilotDraftRouteReadiness"("tenantId", "companyId", "draftId", "isIncluded");
CREATE INDEX "InventoryPilotDraftRouteReadiness_rule_idx" ON "InventoryPilotDraftRouteReadiness"("tenantId", "companyId", "approvalRuleId");
ALTER TABLE "InventoryPilotDraftRouteReadiness"
  ADD CONSTRAINT "InventoryPilotDraftRouteReadiness_draft_scope_fkey" FOREIGN KEY ("draftId", "tenantId", "companyId") REFERENCES "InventoryPilotConfigurationDraft"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftRouteReadiness_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftRouteReadiness_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotDraftRouteReadiness_rule_exact_fkey" FOREIGN KEY ("approvalRuleId", "tenantId", "companyId", "approvalRuleLineageId", "approvalRuleVersion") REFERENCES "ApprovalRule"(id, "tenantId", "companyId", "lineageId", version) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotParticipantMembership" (
  id UUID NOT NULL DEFAULT gen_random_uuid(), "configurationRevisionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL, "companyId" UUID NOT NULL,
  "configurationRevisionNumber" INTEGER NOT NULL, "configurationDigest" CHAR(64) NOT NULL,
  responsibility "InventoryPilotParticipantResponsibility" NOT NULL,
  "userId" UUID NOT NULL, "roleAssignmentId" UUID NOT NULL, "roleId" UUID NOT NULL,
  "evidenceCutoffAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotParticipantMembership_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotParticipantMembership_identity_check" CHECK (
    "configurationRevisionNumber" > 0 AND "configurationDigest" ~ '^[a-f0-9]{64}$'
  )
);
CREATE UNIQUE INDEX "InventoryPilotParticipantMembership_revision_responsibility_key"
  ON "InventoryPilotParticipantMembership"("configurationRevisionId", responsibility);
CREATE INDEX "InventoryPilotParticipantMembership_actor_idx"
  ON "InventoryPilotParticipantMembership"("tenantId", "companyId", "userId");
ALTER TABLE "InventoryPilotParticipantMembership"
  ADD CONSTRAINT "InventoryPilotParticipantMembership_revision_exact_fkey" FOREIGN KEY ("configurationRevisionId", "tenantId", "companyId", "configurationRevisionNumber", "configurationDigest") REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotParticipantMembership_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotParticipantMembership_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotParticipantMembership_actor_scope_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotParticipantMembership_role_assignment_exact_fkey" FOREIGN KEY ("roleAssignmentId", "userId", "roleId") REFERENCES "UserRoleAssignment"(id, "userId", "roleId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotRouteReadinessMembership" (
  id UUID NOT NULL DEFAULT gen_random_uuid(), "configurationRevisionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL, "companyId" UUID NOT NULL,
  "configurationRevisionNumber" INTEGER NOT NULL, "configurationDigest" CHAR(64) NOT NULL,
  family "InventoryPilotReadinessFamily" NOT NULL,
  "approvalRuleId" UUID NOT NULL, "approvalRuleLineageId" UUID NOT NULL,
  "approvalRuleVersion" INTEGER NOT NULL,
  "ruleDefinitionCanonicalJson" TEXT NOT NULL, "ruleDefinitionDigest" CHAR(64) NOT NULL,
  "resolverEvidenceCanonicalJson" TEXT, "resolverEvidenceDigest" CHAR(64),
  "evidenceCutoffAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotRouteReadinessMembership_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotRouteReadinessMembership_identity_check" CHECK (
    "configurationRevisionNumber" > 0 AND "configurationDigest" ~ '^[a-f0-9]{64}$'
    AND "approvalRuleVersion" > 0 AND "ruleDefinitionDigest" ~ '^[a-f0-9]{64}$'
    AND nullif(btrim("ruleDefinitionCanonicalJson"), '') IS NOT NULL
    AND (
      (family = 'PurchaseRequest'
        AND nullif(btrim("resolverEvidenceCanonicalJson"), '') IS NOT NULL
        AND "resolverEvidenceDigest" ~ '^[a-f0-9]{64}$')
      OR
      (family <> 'PurchaseRequest'
        AND "resolverEvidenceCanonicalJson" IS NULL
        AND "resolverEvidenceDigest" IS NULL)
    )
  )
);
CREATE UNIQUE INDEX "InventoryPilotRouteReadinessMembership_revision_family_key"
  ON "InventoryPilotRouteReadinessMembership"("configurationRevisionId", family);
CREATE INDEX "InventoryPilotRouteReadinessMembership_scope_family_idx"
  ON "InventoryPilotRouteReadinessMembership"("tenantId", "companyId", family, "evidenceCutoffAt");
ALTER TABLE "InventoryPilotRouteReadinessMembership"
  ADD CONSTRAINT "InventoryPilotRouteReadinessMembership_revision_exact_fkey" FOREIGN KEY ("configurationRevisionId", "tenantId", "companyId", "configurationRevisionNumber", "configurationDigest") REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotRouteReadinessMembership_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotRouteReadinessMembership_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotRouteReadinessMembership_rule_exact_fkey" FOREIGN KEY ("approvalRuleId", "tenantId", "companyId", "approvalRuleLineageId", "approvalRuleVersion") REFERENCES "ApprovalRule"(id, "tenantId", "companyId", "lineageId", version) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryPilotConfigurationSealOperation" (
  id UUID NOT NULL DEFAULT gen_random_uuid(), "draftId" UUID NOT NULL,
  "tenantId" UUID NOT NULL, "companyId" UUID NOT NULL,
  "expectedDraftVersion" INTEGER NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL, "requestHash" CHAR(64) NOT NULL,
  "sealedRevisionId" UUID NOT NULL, "sealedRevisionNumber" INTEGER NOT NULL,
  "sealedRevisionDigest" CHAR(64) NOT NULL, "sealedByUserId" UUID NOT NULL,
  "evidenceCutoffAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPilotConfigurationSealOperation_pkey" PRIMARY KEY (id),
  CONSTRAINT "InventoryPilotConfigurationSealOperation_identity_check" CHECK (
    "expectedDraftVersion" > 0 AND "sealedRevisionNumber" > 0
    AND length(btrim("idempotencyKey")) BETWEEN 12 AND 160
    AND "requestHash" ~ '^[a-f0-9]{64}$' AND "sealedRevisionDigest" ~ '^[a-f0-9]{64}$'
  )
);
CREATE UNIQUE INDEX "InventoryPilotConfigurationSealOperation_draftId_key" ON "InventoryPilotConfigurationSealOperation"("draftId");
CREATE UNIQUE INDEX "InventoryPilotConfigurationSealOperation_sealedRevisionId_key" ON "InventoryPilotConfigurationSealOperation"("sealedRevisionId");
CREATE UNIQUE INDEX "InventoryPilotConfigurationSealOperation_scope_idempotency_key" ON "InventoryPilotConfigurationSealOperation"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "InventoryPilotConfigurationSealOperation_draft_exact_key" ON "InventoryPilotConfigurationSealOperation"("draftId", "tenantId", "companyId");
CREATE UNIQUE INDEX "InventoryPilotConfigurationSealOperation_revision_exact_key" ON "InventoryPilotConfigurationSealOperation"("sealedRevisionId", "tenantId", "companyId", "sealedRevisionNumber", "sealedRevisionDigest");
CREATE INDEX "InventoryPilotConfigurationSealOperation_scope_created_idx" ON "InventoryPilotConfigurationSealOperation"("tenantId", "companyId", "createdAt");
ALTER TABLE "InventoryPilotConfigurationSealOperation"
  ADD CONSTRAINT "InventoryPilotConfigurationSealOperation_draft_scope_fkey" FOREIGN KEY ("draftId", "tenantId", "companyId") REFERENCES "InventoryPilotConfigurationDraft"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationSealOperation_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationSealOperation_company_scope_fkey" FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationSealOperation_revision_exact_fkey" FOREIGN KEY ("sealedRevisionId", "tenantId", "companyId", "sealedRevisionNumber", "sealedRevisionDigest") REFERENCES "InventoryPilotConfigurationRevision"(id, "tenantId", "companyId", "revisionNumber", "configurationDigest") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryPilotConfigurationSealOperation_sealer_scope_fkey" FOREIGN KEY ("sealedByUserId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "inventory_pilot_approval_rule_canonical_json"(rule_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE STRICT
SET search_path = pg_catalog
AS $rule_canonical$
DECLARE rule_row RECORD; step_rows JSONB;
BEGIN
  SELECT * INTO rule_row FROM public."ApprovalRule" WHERE id = rule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_APPROVAL_RULE_NOT_FOUND';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'stepOrder', "stepOrder", 'approverType', "approverType",
           'roleId', "roleId"::text, 'userId', "userId"::text,
           'required', required, 'escalationHours', "escalationHours"
         ) ORDER BY "stepOrder", id::text COLLATE "C"), '[]'::jsonb)
    INTO step_rows FROM public."ApprovalRuleStep" WHERE "approvalRuleId" = rule_id;
  RETURN public."inventory_pilot_canonical_json"(jsonb_build_object(
    'id', rule_row.id::text, 'tenantId', rule_row."tenantId"::text,
    'companyId', rule_row."companyId"::text, 'transactionType', rule_row."transactionType",
    'routeKey', rule_row."routeKey", 'scopeFilters', rule_row."scopeFilters",
    'priority', rule_row.priority, 'isActive', rule_row."isActive",
    'lineageId', rule_row."lineageId"::text, 'version', rule_row.version,
    'lifecycleVersion', rule_row."lifecycleVersion",
    'definitionSealed', rule_row."definitionSealed", 'steps', step_rows
  ));
END;
$rule_canonical$;

-- Keep the schema-v1 branch byte-for-byte equivalent to DEC-0261. Schema v2
-- uses explicit C collation for every textual sort and includes predecessor,
-- named participant, and all eight readiness snapshots.
CREATE OR REPLACE FUNCTION "inventory_pilot_revision_canonical_json"(revision_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE STRICT
SET search_path = pg_catalog
AS $revision_canonical$
DECLARE
  revision_row RECORD; operation_row RECORD;
  endpoint_rows JSONB; item_rows JSONB; participant_rows JSONB; route_rows JSONB;
  predecessor_row JSONB;
BEGIN
  SELECT * INTO revision_row FROM public."InventoryPilotConfigurationRevision" WHERE id = revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_REVISION_NOT_FOUND'; END IF;

  IF revision_row."schemaVersion" = 1 THEN
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
  END IF;

  SELECT * INTO operation_row FROM public."InventoryPilotConfigurationSealOperation"
   WHERE "sealedRevisionId" = revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_V2_SEAL_OPERATION_NOT_FOUND';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'capability', capability::text,
           'inventoryLocationId', "inventoryLocationId"::text,
           'locationId', "locationId"::text
         ) ORDER BY capability::text COLLATE "C", "inventoryLocationId"::text COLLATE "C", "locationId"::text COLLATE "C"), '[]'::jsonb)
    INTO endpoint_rows FROM public."InventoryPilotEndpointMembership"
   WHERE "configurationRevisionId" = revision_id;
  SELECT coalesce(jsonb_agg("itemId"::text ORDER BY "itemId"::text COLLATE "C"), '[]'::jsonb)
    INTO item_rows FROM public."InventoryPilotItemMembership"
   WHERE "configurationRevisionId" = revision_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'responsibility', responsibility::text, 'userId', "userId"::text,
           'roleAssignmentId', "roleAssignmentId"::text, 'roleId', "roleId"::text
         ) ORDER BY responsibility::text COLLATE "C", "userId"::text COLLATE "C"), '[]'::jsonb)
    INTO participant_rows FROM public."InventoryPilotParticipantMembership"
   WHERE "configurationRevisionId" = revision_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'family', family::text, 'approvalRuleId', "approvalRuleId"::text,
           'approvalRuleLineageId', "approvalRuleLineageId"::text,
           'approvalRuleVersion', "approvalRuleVersion",
           'ruleDefinitionCanonicalJson', "ruleDefinitionCanonicalJson",
           'ruleDefinitionDigest', "ruleDefinitionDigest",
           'resolverEvidenceCanonicalJson', "resolverEvidenceCanonicalJson",
           'resolverEvidenceDigest', "resolverEvidenceDigest",
           'evidenceCutoffAt', to_char("evidenceCutoffAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         ) ORDER BY family::text COLLATE "C"), '[]'::jsonb)
    INTO route_rows FROM public."InventoryPilotRouteReadinessMembership"
   WHERE "configurationRevisionId" = revision_id;

  predecessor_row := CASE WHEN revision_row."predecessorRevisionId" IS NULL THEN 'null'::jsonb ELSE jsonb_build_object(
    'revisionId', revision_row."predecessorRevisionId"::text,
    'revisionNumber', revision_row."predecessorRevisionNumber",
    'configurationDigest', revision_row."predecessorDigest"
  ) END;

  RETURN public."inventory_pilot_canonical_json"(jsonb_build_object(
    'schemaVersion', revision_row."schemaVersion",
    'sourceDecisionId', revision_row."sourceDecisionId",
    'tenantId', revision_row."tenantId"::text,
    'companyId', revision_row."companyId"::text,
    'revisionNumber', revision_row."revisionNumber",
    'predecessor', predecessor_row,
    'endpoints', endpoint_rows,
    'itemIds', item_rows,
    'participants', participant_rows,
    'routeReadiness', route_rows,
    'sealedByUserId', revision_row."sealedByUserId"::text,
    'sealedAt', to_char(revision_row."sealedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'evidenceCutoffAt', to_char(operation_row."evidenceCutoffAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
END;
$revision_canonical$;

CREATE FUNCTION "validate_inventory_pilot_route_snapshot"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $route_snapshot$
DECLARE
  expected_canonical TEXT;
  rule_row RECORD;
  resolver_evidence JSONB;
BEGIN
  SELECT * INTO rule_row FROM public."ApprovalRule" WHERE id = NEW."approvalRuleId";
  expected_canonical := public."inventory_pilot_approval_rule_canonical_json"(NEW."approvalRuleId");
  IF NOT FOUND
     OR rule_row."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR rule_row."companyId" IS DISTINCT FROM NEW."companyId"
     OR rule_row."lineageId" IS DISTINCT FROM NEW."approvalRuleLineageId"
     OR rule_row.version IS DISTINCT FROM NEW."approvalRuleVersion"
     OR NOT rule_row."definitionSealed" OR NOT rule_row."isActive"
     OR NEW."ruleDefinitionCanonicalJson" <> expected_canonical
     OR encode(public.digest(expected_canonical, 'sha256'), 'hex') <> NEW."ruleDefinitionDigest" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_ROUTE_SNAPSHOT_MISMATCH';
  END IF;

  IF NEW.family = 'PurchaseRequest' THEN
    BEGIN
      resolver_evidence := NEW."resolverEvidenceCanonicalJson"::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_PR_RESOLVER_EVIDENCE_INVALID';
    END;

    IF NEW."resolverEvidenceCanonicalJson" <> public."inventory_pilot_canonical_json"(resolver_evidence)
       OR NEW."resolverEvidenceDigest" <> encode(public.digest(NEW."resolverEvidenceCanonicalJson", 'sha256'), 'hex')
       OR resolver_evidence #>> '{resolverInput,resolverId}' IS DISTINCT FROM 'purchase_request_approval_rule_v1'
       OR resolver_evidence #>> '{resolverInput,scenario}' IS DISTINCT FROM 'STANDARD_NON_EMERGENCY'
       OR resolver_evidence #>> '{resolverInput,isEmergency}' IS DISTINCT FROM 'false'
       OR jsonb_typeof(resolver_evidence #> '{resolverInput,candidates}') IS DISTINCT FROM 'array'
       OR jsonb_typeof(resolver_evidence -> 'resolverOutcome') IS DISTINCT FROM 'object'
       OR resolver_evidence -> 'ruleDefinition' IS DISTINCT FROM NEW."ruleDefinitionCanonicalJson"::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_PR_RESOLVER_EVIDENCE_INVALID';
    END IF;

    -- Drafts intentionally retain invalid resolver outcomes so readiness can
    -- explain the blocker. Only immutable sealed evidence may claim that the
    -- selected DEFAULT route resolved normally without fallback.
    IF TG_TABLE_NAME = 'InventoryPilotRouteReadinessMembership'
       AND (resolver_evidence #>> '{resolverOutcome,selectedApprovalRuleId}' IS DISTINCT FROM NEW."approvalRuleId"::text
         OR resolver_evidence #>> '{resolverOutcome,requiredRouteKey}' IS DISTINCT FROM 'DEFAULT'
         OR resolver_evidence #>> '{resolverOutcome,routeType}' IS DISTINCT FROM 'normal'
         OR resolver_evidence #>> '{resolverOutcome,fallbackUsed}' IS DISTINCT FROM 'false') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_PR_RESOLVER_OUTCOME_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$route_snapshot$;

CREATE TRIGGER "InventoryPilotDraftRouteReadiness_snapshot_trg"
BEFORE INSERT OR UPDATE ON "InventoryPilotDraftRouteReadiness"
FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_route_snapshot"();
ALTER TABLE "InventoryPilotDraftRouteReadiness" ENABLE ALWAYS TRIGGER "InventoryPilotDraftRouteReadiness_snapshot_trg";
CREATE TRIGGER "InventoryPilotRouteReadinessMembership_snapshot_trg"
BEFORE INSERT ON "InventoryPilotRouteReadinessMembership"
FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_route_snapshot"();
ALTER TABLE "InventoryPilotRouteReadinessMembership" ENABLE ALWAYS TRIGGER "InventoryPilotRouteReadinessMembership_snapshot_trg";

CREATE FUNCTION "validate_inventory_pilot_draft_header_write"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $draft_header$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' OR NEW.version <> 1
       OR NEW."createdByUserId" IS DISTINCT FROM NEW."lastEditedByUserId" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_DRAFT_INITIAL_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INVENTORY_PILOT_DRAFT_TERMINAL';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
     OR NEW."predecessorRevisionId" IS DISTINCT FROM OLD."predecessorRevisionId"
     OR NEW."predecessorRevisionNumber" IS DISTINCT FROM OLD."predecessorRevisionNumber"
     OR NEW."predecessorDigest" IS DISTINCT FROM OLD."predecessorDigest"
     OR NEW."sourceDecisionId" IS DISTINCT FROM OLD."sourceDecisionId"
     OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (NEW.status <> 'DRAFT' AND NEW."lastEditedByUserId" IS DISTINCT FROM OLD."lastEditedByUserId")
     OR NEW.version <> OLD.version + 1
     OR NEW.status NOT IN ('DRAFT', 'SEALED', 'ABANDONED') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INVENTORY_PILOT_DRAFT_UPDATE_INVALID';
  END IF;
  RETURN NEW;
END;
$draft_header$;

CREATE TRIGGER "InventoryPilotConfigurationDraft_write_trg"
BEFORE INSERT OR UPDATE ON "InventoryPilotConfigurationDraft"
FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_draft_header_write"();
ALTER TABLE "InventoryPilotConfigurationDraft" ENABLE ALWAYS TRIGGER "InventoryPilotConfigurationDraft_write_trg";

CREATE FUNCTION "validate_inventory_pilot_draft_child_write"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $draft_child$
DECLARE draft_status public."InventoryPilotConfigurationDraftStatus";
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW."draftId" IS DISTINCT FROM OLD."draftId"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INVENTORY_PILOT_DRAFT_CHILD_IDENTITY_IMMUTABLE';
  END IF;
  SELECT status INTO draft_status FROM public."InventoryPilotConfigurationDraft"
   WHERE id = NEW."draftId" AND "tenantId" = NEW."tenantId" AND "companyId" = NEW."companyId"
   FOR KEY SHARE;
  IF NOT FOUND OR draft_status <> 'DRAFT' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INVENTORY_PILOT_DRAFT_NOT_EDITABLE';
  END IF;
  RETURN NEW;
END;
$draft_child$;

DO $draft_child_triggers$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'InventoryPilotDraftEndpointMembership', 'InventoryPilotDraftItemMembership',
    'InventoryPilotDraftParticipant', 'InventoryPilotDraftRouteReadiness'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_draft_child_write"()', table_name || '_write_trg', table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', table_name, table_name || '_write_trg');
  END LOOP;
END;
$draft_child_triggers$;

CREATE OR REPLACE FUNCTION "validate_inventory_pilot_revision_digest"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $revision_digest$
DECLARE
  revision_id UUID; revision_row RECORD; operation_row RECORD; expected_canonical TEXT;
  participant_count INTEGER; participant_actor_count INTEGER; route_count INTEGER;
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

  IF revision_row."schemaVersion" = 1 THEN RETURN NEW; END IF;

  SELECT * INTO operation_row FROM public."InventoryPilotConfigurationSealOperation" WHERE "sealedRevisionId" = revision_id;
  IF NOT FOUND
     OR operation_row."tenantId" IS DISTINCT FROM revision_row."tenantId"
     OR operation_row."companyId" IS DISTINCT FROM revision_row."companyId"
     OR operation_row."sealedRevisionNumber" IS DISTINCT FROM revision_row."revisionNumber"
     OR operation_row."sealedRevisionDigest" IS DISTINCT FROM revision_row."configurationDigest"
     OR operation_row."sealedByUserId" IS DISTINCT FROM revision_row."sealedByUserId"
     OR revision_row."sealedAt" IS DISTINCT FROM operation_row."evidenceCutoffAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_V2_SEAL_LINEAGE_MISMATCH';
  END IF;
  IF (revision_row."revisionNumber" = 1 AND revision_row."predecessorRevisionId" IS NOT NULL)
     OR (revision_row."revisionNumber" > 1 AND (
       revision_row."predecessorRevisionId" IS NULL
       OR revision_row."predecessorRevisionNumber" <> revision_row."revisionNumber" - 1
     )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_V2_PREDECESSOR_INVALID';
  END IF;
  IF (SELECT count(*) FROM public."InventoryPilotEndpointMembership" WHERE "configurationRevisionId" = revision_id) = 0
     OR EXISTS (
       SELECT required.capability FROM (VALUES
         ('TRANSFER_SOURCE'::public."InventoryPilotEndpointCapability"),
         ('TRANSFER_DESTINATION'::public."InventoryPilotEndpointCapability"),
         ('COUNT_LOCATION'::public."InventoryPilotEndpointCapability"),
         ('OPENING_STOCK_LOCATION'::public."InventoryPilotEndpointCapability")
       ) required(capability)
       WHERE NOT EXISTS (SELECT 1 FROM public."InventoryPilotEndpointMembership" member WHERE member."configurationRevisionId" = revision_id AND member.capability = required.capability)
     )
     OR (SELECT count(*) FROM public."InventoryPilotItemMembership" WHERE "configurationRevisionId" = revision_id) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_V2_COHORT_INCOMPLETE';
  END IF;
  SELECT count(*), count(DISTINCT "userId") INTO participant_count, participant_actor_count
    FROM public."InventoryPilotParticipantMembership" WHERE "configurationRevisionId" = revision_id;
  SELECT count(*) INTO route_count FROM public."InventoryPilotRouteReadinessMembership" WHERE "configurationRevisionId" = revision_id;
  IF participant_count <> 5 OR participant_actor_count <> 5 OR route_count <> 8 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_V2_EVIDENCE_CARDINALITY_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."InventoryPilotParticipantMembership" participant
    JOIN public."User" actor ON actor.id = participant."userId" AND actor."tenantId" = participant."tenantId"
    JOIN public."UserRoleAssignment" assignment ON assignment.id = participant."roleAssignmentId"
      AND assignment."userId" = participant."userId" AND assignment."roleId" = participant."roleId"
    JOIN public."Role" role ON role.id = participant."roleId"
    WHERE participant."configurationRevisionId" = revision_id
      AND (participant."evidenceCutoffAt" IS DISTINCT FROM operation_row."evidenceCutoffAt"
        OR actor.status <> 'ACTIVE' OR assignment.status <> 'ACTIVE' OR role.status <> 'ACTIVE'
        OR assignment."startsAt" > operation_row."evidenceCutoffAt"
        OR (assignment."endsAt" IS NOT NULL AND assignment."endsAt" <= operation_row."evidenceCutoffAt")
        OR (role."tenantId" IS NOT NULL AND role."tenantId" <> participant."tenantId"))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_V2_PARTICIPANT_EVIDENCE_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."InventoryPilotRouteReadinessMembership" route
    JOIN public."ApprovalRule" rule ON rule.id = route."approvalRuleId"
    WHERE route."configurationRevisionId" = revision_id
      AND (route."evidenceCutoffAt" IS DISTINCT FROM operation_row."evidenceCutoffAt"
        OR NOT rule."isActive" OR NOT rule."definitionSealed"
        OR route."ruleDefinitionCanonicalJson" <> public."inventory_pilot_approval_rule_canonical_json"(route."approvalRuleId")
        OR route."ruleDefinitionDigest" <> encode(public.digest(route."ruleDefinitionCanonicalJson", 'sha256'), 'hex')
        OR (route.family = 'PurchaseRequest' AND (
          route."resolverEvidenceCanonicalJson" IS NULL
          OR route."resolverEvidenceDigest" <> encode(public.digest(route."resolverEvidenceCanonicalJson", 'sha256'), 'hex')
        ))
        OR (route.family <> 'PurchaseRequest' AND (
          route."resolverEvidenceCanonicalJson" IS NOT NULL
          OR route."resolverEvidenceDigest" IS NOT NULL
        )))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_V2_ROUTE_EVIDENCE_INVALID';
  END IF;
  RETURN NEW;
END;
$revision_digest$;

CREATE CONSTRAINT TRIGGER "InventoryPilotParticipantMembership_digest_trg"
AFTER INSERT ON "InventoryPilotParticipantMembership"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_revision_digest"();
CREATE CONSTRAINT TRIGGER "InventoryPilotRouteReadinessMembership_digest_trg"
AFTER INSERT ON "InventoryPilotRouteReadinessMembership"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_revision_digest"();
ALTER TABLE "InventoryPilotParticipantMembership" ENABLE ALWAYS TRIGGER "InventoryPilotParticipantMembership_digest_trg";
ALTER TABLE "InventoryPilotRouteReadinessMembership" ENABLE ALWAYS TRIGGER "InventoryPilotRouteReadinessMembership_digest_trg";

CREATE FUNCTION "validate_inventory_pilot_seal_operation"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $seal_operation$
DECLARE
  draft_row RECORD; revision_row RECORD;
  draft_endpoints JSONB; sealed_endpoints JSONB; draft_items JSONB; sealed_items JSONB;
  draft_participants JSONB; sealed_participants JSONB; draft_routes JSONB; sealed_routes JSONB;
BEGIN
  SELECT * INTO draft_row FROM public."InventoryPilotConfigurationDraft" WHERE id = NEW."draftId";
  SELECT * INTO revision_row FROM public."InventoryPilotConfigurationRevision" WHERE id = NEW."sealedRevisionId";
  IF NOT FOUND OR draft_row.status <> 'SEALED'
     OR draft_row."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR draft_row."companyId" IS DISTINCT FROM NEW."companyId"
     OR draft_row.version <> NEW."expectedDraftVersion" + 1
     OR draft_row."sealedRevisionId" IS DISTINCT FROM NEW."sealedRevisionId"
     OR draft_row."sealedRevisionNumber" IS DISTINCT FROM NEW."sealedRevisionNumber"
     OR draft_row."sealedRevisionDigest" IS DISTINCT FROM NEW."sealedRevisionDigest"
     OR draft_row."sealedAt" IS DISTINCT FROM NEW."evidenceCutoffAt"
     OR draft_row."createdByUserId" = NEW."sealedByUserId"
     OR draft_row."lastEditedByUserId" = NEW."sealedByUserId"
     OR revision_row."schemaVersion" <> 2
     OR revision_row."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR revision_row."companyId" IS DISTINCT FROM NEW."companyId"
     OR revision_row."revisionNumber" IS DISTINCT FROM NEW."sealedRevisionNumber"
     OR revision_row."configurationDigest" IS DISTINCT FROM NEW."sealedRevisionDigest"
     OR revision_row."sealedByUserId" IS DISTINCT FROM NEW."sealedByUserId"
     OR revision_row."sealedAt" IS DISTINCT FROM NEW."evidenceCutoffAt"
     OR revision_row."sourceDecisionId" IS DISTINCT FROM draft_row."sourceDecisionId"
     OR revision_row."predecessorRevisionId" IS DISTINCT FROM draft_row."predecessorRevisionId"
     OR revision_row."predecessorRevisionNumber" IS DISTINCT FROM draft_row."predecessorRevisionNumber"
     OR revision_row."predecessorDigest" IS DISTINCT FROM draft_row."predecessorDigest" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_SEAL_OPERATION_LINEAGE_INVALID';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_array(capability::text, "inventoryLocationId"::text, "locationId"::text)
           ORDER BY capability::text COLLATE "C", "inventoryLocationId"::text COLLATE "C", "locationId"::text COLLATE "C"), '[]'::jsonb)
    INTO draft_endpoints FROM public."InventoryPilotDraftEndpointMembership" WHERE "draftId" = NEW."draftId" AND "isIncluded";
  SELECT coalesce(jsonb_agg(jsonb_build_array(capability::text, "inventoryLocationId"::text, "locationId"::text)
           ORDER BY capability::text COLLATE "C", "inventoryLocationId"::text COLLATE "C", "locationId"::text COLLATE "C"), '[]'::jsonb)
    INTO sealed_endpoints FROM public."InventoryPilotEndpointMembership" WHERE "configurationRevisionId" = NEW."sealedRevisionId";
  SELECT coalesce(jsonb_agg("itemId"::text ORDER BY "itemId"::text COLLATE "C"), '[]'::jsonb)
    INTO draft_items FROM public."InventoryPilotDraftItemMembership" WHERE "draftId" = NEW."draftId" AND "isIncluded";
  SELECT coalesce(jsonb_agg("itemId"::text ORDER BY "itemId"::text COLLATE "C"), '[]'::jsonb)
    INTO sealed_items FROM public."InventoryPilotItemMembership" WHERE "configurationRevisionId" = NEW."sealedRevisionId";
  SELECT coalesce(jsonb_agg(jsonb_build_array(responsibility::text, "userId"::text, "roleAssignmentId"::text, "roleId"::text)
           ORDER BY responsibility::text COLLATE "C"), '[]'::jsonb)
    INTO draft_participants FROM public."InventoryPilotDraftParticipant" WHERE "draftId" = NEW."draftId" AND "isIncluded";
  SELECT coalesce(jsonb_agg(jsonb_build_array(responsibility::text, "userId"::text, "roleAssignmentId"::text, "roleId"::text)
           ORDER BY responsibility::text COLLATE "C"), '[]'::jsonb)
    INTO sealed_participants FROM public."InventoryPilotParticipantMembership" WHERE "configurationRevisionId" = NEW."sealedRevisionId";
  SELECT coalesce(jsonb_agg(jsonb_build_array(family::text, "approvalRuleId"::text, "approvalRuleLineageId"::text,
           "approvalRuleVersion", "ruleDefinitionCanonicalJson", "ruleDefinitionDigest",
           "resolverEvidenceCanonicalJson", "resolverEvidenceDigest") ORDER BY family::text COLLATE "C"), '[]'::jsonb)
    INTO draft_routes FROM public."InventoryPilotDraftRouteReadiness" WHERE "draftId" = NEW."draftId" AND "isIncluded";
  SELECT coalesce(jsonb_agg(jsonb_build_array(family::text, "approvalRuleId"::text, "approvalRuleLineageId"::text,
           "approvalRuleVersion", "ruleDefinitionCanonicalJson", "ruleDefinitionDigest",
           "resolverEvidenceCanonicalJson", "resolverEvidenceDigest") ORDER BY family::text COLLATE "C"), '[]'::jsonb)
    INTO sealed_routes FROM public."InventoryPilotRouteReadinessMembership" WHERE "configurationRevisionId" = NEW."sealedRevisionId";

  IF draft_endpoints IS DISTINCT FROM sealed_endpoints OR draft_items IS DISTINCT FROM sealed_items
     OR draft_participants IS DISTINCT FROM sealed_participants OR draft_routes IS DISTINCT FROM sealed_routes THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_SEAL_COMPILED_MEMBERSHIP_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."InventoryPilotDraftRouteReadiness"
     WHERE "draftId" = NEW."draftId" AND "isIncluded" AND "readinessCheckedAt" > NEW."evidenceCutoffAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_SEAL_READINESS_CUTOFF_INVALID';
  END IF;
  RETURN NEW;
END;
$seal_operation$;

CREATE CONSTRAINT TRIGGER "InventoryPilotConfigurationSealOperation_validate_trg"
AFTER INSERT ON "InventoryPilotConfigurationSealOperation"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_seal_operation"();
ALTER TABLE "InventoryPilotConfigurationSealOperation" ENABLE ALWAYS TRIGGER "InventoryPilotConfigurationSealOperation_validate_trg";

CREATE FUNCTION "validate_inventory_pilot_draft_terminal"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $draft_terminal$
DECLARE draft_id UUID; draft_row RECORD; operation_count INTEGER;
BEGIN
  draft_id := CASE WHEN TG_TABLE_NAME = 'InventoryPilotConfigurationDraft' THEN (to_jsonb(NEW)->>'id')::uuid ELSE (to_jsonb(NEW)->>'draftId')::uuid END;
  SELECT * INTO draft_row FROM public."InventoryPilotConfigurationDraft" WHERE id = draft_id;
  SELECT count(*) INTO operation_count FROM public."InventoryPilotConfigurationSealOperation" WHERE "draftId" = draft_id;
  IF (draft_row.status = 'SEALED' AND operation_count <> 1)
     OR (draft_row.status IN ('DRAFT', 'ABANDONED') AND operation_count <> 0) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVENTORY_PILOT_DRAFT_TERMINAL_OPERATION_INVALID';
  END IF;
  RETURN NEW;
END;
$draft_terminal$;

CREATE CONSTRAINT TRIGGER "InventoryPilotConfigurationDraft_terminal_trg"
AFTER INSERT OR UPDATE ON "InventoryPilotConfigurationDraft"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_draft_terminal"();
CREATE CONSTRAINT TRIGGER "InventoryPilotConfigurationSealOperation_draft_terminal_trg"
AFTER INSERT ON "InventoryPilotConfigurationSealOperation"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_inventory_pilot_draft_terminal"();
ALTER TABLE "InventoryPilotConfigurationDraft" ENABLE ALWAYS TRIGGER "InventoryPilotConfigurationDraft_terminal_trg";
ALTER TABLE "InventoryPilotConfigurationSealOperation" ENABLE ALWAYS TRIGGER "InventoryPilotConfigurationSealOperation_draft_terminal_trg";

-- Mutable draft rows may be changed only while their header is DRAFT, but they
-- are never hard-deleted. Sealed outputs and seal outcomes are append-only.
DO $history_guards$
DECLARE table_name TEXT; trigger_name TEXT; trigger_events TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'InventoryPilotConfigurationDraft', 'InventoryPilotDraftEndpointMembership',
    'InventoryPilotDraftItemMembership', 'InventoryPilotDraftParticipant',
    'InventoryPilotDraftRouteReadiness'
  ] LOOP
    trigger_name := table_name || '_no_hard_delete_trg';
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_pilot_history_mutation"()', trigger_name, table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', table_name, trigger_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY[
    'InventoryPilotConfigurationSealOperation', 'InventoryPilotParticipantMembership',
    'InventoryPilotRouteReadinessMembership'
  ] LOOP
    trigger_name := table_name || '_append_only_guard_trg';
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_pilot_history_mutation"()', trigger_name, table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', table_name, trigger_name);
  END LOOP;
END;
$history_guards$;

REVOKE ALL ON FUNCTION "inventory_pilot_approval_rule_canonical_json"(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_route_snapshot"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_draft_header_write"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_draft_child_write"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_seal_operation"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_inventory_pilot_draft_terminal"() FROM PUBLIC;

COMMIT;
