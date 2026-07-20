ALTER TABLE "Recipe"
  ADD COLUMN "currentVersionId" UUID,
  ADD COLUMN "publishedVersionId" UUID;

ALTER TABLE "RecipeVersion"
  ADD COLUMN "supersedesVersionId" UUID,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "publishedByUserId" UUID,
  ADD COLUMN "reason" TEXT;

ALTER TABLE "MenuPrice"
  ADD COLUMN "decisionId" UUID,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPLIED';

CREATE TABLE "RecipeVersionTransition" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "recipeId" UUID NOT NULL,
  "recipeVersionId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "actorUserId" UUID,
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMP(3),
  "reason" TEXT,
  "evidenceReference" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecipeVersionTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuPriceDecision" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "menuItemId" UUID NOT NULL,
  "locationId" UUID,
  "requestedPrice" DECIMAL(18,6) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "requestedByUserId" UUID,
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMP(3),
  "appliedByUserId" UUID,
  "appliedAt" TIMESTAMP(3),
  "reason" TEXT,
  "evidenceReference" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MenuPriceDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalCorrectionRecord" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID,
  "targetEntityType" TEXT NOT NULL,
  "targetEntityId" UUID NOT NULL,
  "correctionType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "requestedByUserId" UUID,
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMP(3),
  "appliedByUserId" UUID,
  "appliedAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "evidenceReference" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationalCorrectionRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalStatusTransition" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID,
  "targetEntityType" TEXT NOT NULL,
  "targetEntityId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "actorUserId" UUID,
  "reason" TEXT,
  "evidenceReference" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperationalStatusTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowTransitionPolicy" (
  "id" UUID NOT NULL,
  "domain" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "permissionCode" TEXT NOT NULL,
  "requiresReason" BOOLEAN NOT NULL DEFAULT false,
  "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
  "blocksSelfApproval" BOOLEAN NOT NULL DEFAULT false,
  "terminal" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkflowTransitionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Recipe_currentVersionId_idx" ON "Recipe"("currentVersionId");
CREATE INDEX "Recipe_publishedVersionId_idx" ON "Recipe"("publishedVersionId");

CREATE INDEX "RecipeVersion_supersedesVersionId_idx" ON "RecipeVersion"("supersedesVersionId");
CREATE INDEX "RecipeVersion_publishedByUserId_idx" ON "RecipeVersion"("publishedByUserId");

CREATE INDEX "MenuPrice_decisionId_idx" ON "MenuPrice"("decisionId");
CREATE INDEX "MenuPrice_status_idx" ON "MenuPrice"("status");

CREATE UNIQUE INDEX "RecipeVersionTransition_recipeVersionId_idempotencyKey_key"
  ON "RecipeVersionTransition"("recipeVersionId", "idempotencyKey");
CREATE INDEX "RecipeVersionTransition_tenantId_companyId_brandId_recipeId_idx"
  ON "RecipeVersionTransition"("tenantId", "companyId", "brandId", "recipeId");
CREATE INDEX "RecipeVersionTransition_recipeVersionId_createdAt_idx"
  ON "RecipeVersionTransition"("recipeVersionId", "createdAt");
CREATE INDEX "RecipeVersionTransition_action_toStatus_idx"
  ON "RecipeVersionTransition"("action", "toStatus");

CREATE UNIQUE INDEX "MenuPriceDecision_tenantId_companyId_menuItemId_locationId_idempotencyKey_key"
  ON "MenuPriceDecision"("tenantId", "companyId", "menuItemId", "locationId", "idempotencyKey");
CREATE INDEX "MenuPriceDecision_tenantId_companyId_brandId_locationId_status_idx"
  ON "MenuPriceDecision"("tenantId", "companyId", "brandId", "locationId", "status");
CREATE INDEX "MenuPriceDecision_menuItemId_effectiveFrom_idx"
  ON "MenuPriceDecision"("menuItemId", "effectiveFrom");

CREATE UNIQUE INDEX "OperationalCorrectionRecord_tenantId_companyId_targetEntityType_targetEntityId_idempotencyKey_key"
  ON "OperationalCorrectionRecord"("tenantId", "companyId", "targetEntityType", "targetEntityId", "idempotencyKey");
CREATE INDEX "OperationalCorrectionRecord_tenantId_companyId_brandId_locationId_status_idx"
  ON "OperationalCorrectionRecord"("tenantId", "companyId", "brandId", "locationId", "status");
CREATE INDEX "OperationalCorrectionRecord_targetEntityType_targetEntityId_idx"
  ON "OperationalCorrectionRecord"("targetEntityType", "targetEntityId");
CREATE INDEX "OperationalCorrectionRecord_correctionType_status_idx"
  ON "OperationalCorrectionRecord"("correctionType", "status");

CREATE UNIQUE INDEX "OperationalStatusTransition_tenantId_companyId_targetEntityType_targetEntityId_idempotencyKey_key"
  ON "OperationalStatusTransition"("tenantId", "companyId", "targetEntityType", "targetEntityId", "idempotencyKey");
CREATE INDEX "OperationalStatusTransition_tenantId_companyId_brandId_locationId_idx"
  ON "OperationalStatusTransition"("tenantId", "companyId", "brandId", "locationId");
CREATE INDEX "OperationalStatusTransition_targetEntityType_targetEntityId_createdAt_idx"
  ON "OperationalStatusTransition"("targetEntityType", "targetEntityId", "createdAt");
CREATE INDEX "OperationalStatusTransition_action_fromStatus_toStatus_idx"
  ON "OperationalStatusTransition"("action", "fromStatus", "toStatus");

CREATE UNIQUE INDEX "WorkflowTransitionPolicy_domain_action_fromStatus_key"
  ON "WorkflowTransitionPolicy"("domain", "action", "fromStatus");
CREATE INDEX "WorkflowTransitionPolicy_domain_fromStatus_active_idx"
  ON "WorkflowTransitionPolicy"("domain", "fromStatus", "active");
CREATE INDEX "WorkflowTransitionPolicy_permissionCode_idx"
  ON "WorkflowTransitionPolicy"("permissionCode");
