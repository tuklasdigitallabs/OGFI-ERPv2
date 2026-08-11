-- DEC-0279: source-neutral manual servings with separately authorized,
-- exactly-once recipe consumption posting. The feature remains default-off.

ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'CONSUMPTION_OUT' AFTER 'WASTAGE_OUT';

CREATE TYPE "RestaurantServicePeriodMode" AS ENUM ('DAILY', 'SHIFT');
CREATE TYPE "RestaurantConsumptionConfigurationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "ServingDeclarationSourceType" AS ENUM ('MANUAL', 'POS', 'IMPORT');
CREATE TYPE "ServingDisposition" AS ENUM ('PAID', 'COMPLIMENTARY');
CREATE TYPE "ServingDeclarationStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'RETURNED', 'DERIVATION_BLOCKED', 'READY_TO_POST',
  'POSTING', 'POSTED', 'REVERSED', 'CANCELLED'
);
CREATE TYPE "ConsumptionPostingStatus" AS ENUM ('READY', 'POSTING', 'POSTED', 'REVERSING', 'REVERSED');

INSERT INTO "Permission" ("id", "code", "module", "action", "description")
VALUES
  ('00000000-0000-4000-8000-000000000186', 'restaurant.consumption.view', 'restaurant', 'consumption.view', 'View serving declarations and expected/book consumption.'),
  ('00000000-0000-4000-8000-000000000187', 'restaurant.consumption.create', 'restaurant', 'consumption.create', 'Create, edit, submit, and cancel branch serving declarations.'),
  ('00000000-0000-4000-8000-000000000188', 'restaurant.consumption.verify', 'restaurant', 'consumption.verify', 'Independently verify or return serving facts.'),
  ('00000000-0000-4000-8000-000000000189', 'restaurant.consumption.post', 'restaurant', 'consumption.post', 'Post verified recipe consumption to the immutable inventory ledger.'),
  ('00000000-0000-4000-8000-000000000190', 'restaurant.consumption.reverse', 'restaurant', 'consumption.reverse', 'Reverse an entire posted consumption document.'),
  ('00000000-0000-4000-8000-000000000191', 'restaurant.consumption.configure', 'restaurant', 'consumption.configure', 'Configure branch service periods, issue locations, and recipe assignments.')
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role.id, permission.id
FROM "Role" role
JOIN "Permission" permission ON permission.code IN (
  'restaurant.consumption.view', 'restaurant.consumption.create'
)
WHERE role.code = 'CONFIGURED_REQUESTER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role.id, permission.id
FROM "Role" role
JOIN "Permission" permission ON permission.code IN (
  'restaurant.consumption.view', 'restaurant.consumption.verify',
  'restaurant.consumption.post', 'restaurant.consumption.reverse'
)
WHERE role.code = 'CONFIGURED_APPROVER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role.id, permission.id
FROM "Role" role
JOIN "Permission" permission ON permission.code LIKE 'restaurant.consumption.%'
WHERE role.code IN ('CONFIGURED_ADMIN', 'CONFIGURED_SUPER_USER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

ALTER TABLE "OperationalReasonCode"
  DROP CONSTRAINT "OperationalReasonCode_workflow_check",
  ADD CONSTRAINT "OperationalReasonCode_workflow_check"
    CHECK ("workflow" IN (
      'WASTAGE',
      'STOCK_ADJUSTMENT',
      'RECEIVING_DISCREPANCY',
      'TRANSFER_DISCREPANCY',
      'STOCK_COUNT_VARIANCE',
      'PURCHASE_ORDER_CANCELLATION',
      'PURCHASE_ORDER_CLOSURE',
      'REVERSAL',
      'MASTER_DATA_CHANGE',
      'RESTAURANT_CONSUMPTION'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS "RecipeVersion_exact_scope_key"
  ON "RecipeVersion"("id", "tenantId", "companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "MenuItem_exact_scope_key"
  ON "MenuItem"("id", "tenantId", "companyId");

CREATE TABLE "RestaurantConsumptionConfiguration" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "defaultIssueInventoryLocationId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "RestaurantConsumptionConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "servicePeriodMode" "RestaurantServicePeriodMode" NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
  "servicePeriods" JSONB NOT NULL,
  "sentinelRules" JSONB,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "activatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantConsumptionConfiguration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantConsumptionConfiguration_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "RestaurantConsumptionConfiguration_reason_check"
    CHECK (length(btrim("reason")) >= 5),
  CONSTRAINT "RestaurantConsumptionConfiguration_enabled_active_check"
    CHECK (NOT "enabled" OR "status" = 'ACTIVE')
);

CREATE TABLE "MenuRecipeAssignment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "menuItemId" UUID NOT NULL,
  "recipeVersionId" UUID NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuRecipeAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MenuRecipeAssignment_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "MenuRecipeAssignment_reason_check" CHECK (length(btrim("reason")) >= 5)
);

CREATE TABLE "ServingDeclaration" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "configurationId" UUID NOT NULL,
  "businessDate" DATE NOT NULL,
  "servicePeriodCode" TEXT NOT NULL,
  "coverageStartAt" TIMESTAMP(3) NOT NULL,
  "coverageEndAt" TIMESTAMP(3) NOT NULL,
  "sourceType" "ServingDeclarationSourceType" NOT NULL DEFAULT 'MANUAL',
  "sourceReference" TEXT,
  "revisionNo" INTEGER NOT NULL DEFAULT 1,
  "supersedesDeclarationId" UUID,
  "status" "ServingDeclarationStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "submittedByUserId" UUID,
  "submittedAt" TIMESTAMP(3),
  "verifiedByUserId" UUID,
  "verifiedAt" TIMESTAMP(3),
  "returnedByUserId" UUID,
  "returnedAt" TIMESTAMP(3),
  "returnReason" TEXT,
  "derivationSnapshot" JSONB,
  "derivationSnapshotHash" TEXT,
  "readinessBlockers" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServingDeclaration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServingDeclaration_coverage_check" CHECK ("coverageEndAt" > "coverageStartAt"),
  CONSTRAINT "ServingDeclaration_revision_check" CHECK ("revisionNo" > 0 AND "version" > 0),
  CONSTRAINT "ServingDeclaration_service_period_check" CHECK (length(btrim("servicePeriodCode")) > 0),
  CONSTRAINT "ServingDeclaration_request_hash_check" CHECK (length("requestHash") = 64),
  CONSTRAINT "ServingDeclaration_snapshot_hash_check"
    CHECK ("derivationSnapshotHash" IS NULL OR length("derivationSnapshotHash") = 64)
);

CREATE TABLE "ServingDeclarationLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "declarationId" UUID NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "menuItemId" UUID NOT NULL,
  "disposition" "ServingDisposition" NOT NULL,
  "quantityServed" DECIMAL(18,6) NOT NULL,
  "complimentaryReason" TEXT,
  "complimentaryReference" TEXT,
  "recipeAssignmentId" UUID,
  "recipeVersionId" UUID,
  "menuItemCodeSnapshot" TEXT NOT NULL,
  "menuItemNameSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServingDeclarationLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServingDeclarationLine_quantity_check" CHECK ("quantityServed" > 0),
  CONSTRAINT "ServingDeclarationLine_line_check" CHECK ("lineNo" > 0),
  CONSTRAINT "ServingDeclarationLine_recipe_snapshot_pair_check" CHECK (
    ("recipeAssignmentId" IS NULL AND "recipeVersionId" IS NULL)
    OR ("recipeAssignmentId" IS NOT NULL AND "recipeVersionId" IS NOT NULL)
  ),
  CONSTRAINT "ServingDeclarationLine_complimentary_check" CHECK (
    ("disposition" = 'PAID' AND "complimentaryReason" IS NULL AND "complimentaryReference" IS NULL)
    OR ("disposition" = 'COMPLIMENTARY'
      AND length(btrim(COALESCE("complimentaryReason", ''))) >= 3
      AND length(btrim(COALESCE("complimentaryReference", ''))) >= 3)
  )
);

CREATE TABLE "ServingIngredientSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "declarationId" UUID NOT NULL,
  "declarationLineId" UUID NOT NULL,
  "recipeVersionId" UUID NOT NULL,
  "recipeLinePath" TEXT NOT NULL,
  "itemId" UUID NOT NULL,
  "baseUomId" UUID NOT NULL,
  "rawQuantityBaseUom" DECIMAL(24,12) NOT NULL,
  "roundedQuantityBaseUom" DECIMAL(18,6) NOT NULL,
  "conversionEvidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServingIngredientSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServingIngredientSnapshot_quantity_check"
    CHECK ("rawQuantityBaseUom" > 0 AND "roundedQuantityBaseUom" > 0)
);

CREATE TABLE "ConsumptionPosting" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "declarationId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "status" "ConsumptionPostingStatus" NOT NULL DEFAULT 'READY',
  "snapshotHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "postedByUserId" UUID,
  "postedAt" TIMESTAMP(3),
  "reversedByUserId" UUID,
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "reversalIdempotencyKey" TEXT,
  "reversalRequestHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsumptionPosting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumptionPosting_hash_check"
    CHECK (length("snapshotHash") = 64 AND length("requestHash") = 64)
);

CREATE TABLE "ConsumptionPostingAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "postingId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "baseUomId" UUID NOT NULL,
  "allocationNo" INTEGER NOT NULL,
  "quantityBaseUom" DECIMAL(18,6) NOT NULL,
  "lotKey" TEXT NOT NULL,
  "lotNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "postedMovementId" UUID,
  "reversalMovementId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumptionPostingAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumptionPostingAllocation_quantity_check" CHECK ("quantityBaseUom" > 0),
  CONSTRAINT "ConsumptionPostingAllocation_number_check" CHECK ("allocationNo" > 0)
);

CREATE UNIQUE INDEX "RestaurantConsumptionConfiguration_companyId_locationId_version_key"
  ON "RestaurantConsumptionConfiguration"("companyId", "locationId", "version");
CREATE UNIQUE INDEX "RestaurantConsumptionConfiguration_exact_scope_key"
  ON "RestaurantConsumptionConfiguration"("id", "tenantId", "companyId", "locationId");
CREATE INDEX "RestaurantConsumptionConfiguration_scope_status_effective_idx"
  ON "RestaurantConsumptionConfiguration"("tenantId", "companyId", "locationId", "status", "effectiveFrom");
CREATE UNIQUE INDEX "MenuRecipeAssignment_locationId_menuItemId_effectiveFrom_key"
  ON "MenuRecipeAssignment"("locationId", "menuItemId", "effectiveFrom");
CREATE UNIQUE INDEX "MenuRecipeAssignment_exact_scope_key"
  ON "MenuRecipeAssignment"("id", "tenantId", "companyId", "locationId");
CREATE INDEX "MenuRecipeAssignment_scope_item_status_effective_idx"
  ON "MenuRecipeAssignment"("tenantId", "companyId", "locationId", "menuItemId", "status", "effectiveFrom");
CREATE UNIQUE INDEX "ServingDeclaration_tenantId_companyId_idempotencyKey_key"
  ON "ServingDeclaration"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "ServingDeclaration_coverage_revision_key"
  ON "ServingDeclaration"("tenantId", "companyId", "locationId", "businessDate", "servicePeriodCode", "sourceType", "revisionNo");
CREATE UNIQUE INDEX "ServingDeclaration_one_active_coverage_key"
  ON "ServingDeclaration"("tenantId", "companyId", "locationId", "businessDate", "servicePeriodCode")
  WHERE status NOT IN ('REVERSED', 'CANCELLED');
CREATE UNIQUE INDEX "ServingDeclaration_exact_company_scope_key"
  ON "ServingDeclaration"("id", "tenantId", "companyId");
CREATE UNIQUE INDEX "ServingDeclaration_exact_scope_key"
  ON "ServingDeclaration"("id", "tenantId", "companyId", "locationId");
CREATE INDEX "ServingDeclaration_scope_status_business_date_idx"
  ON "ServingDeclaration"("tenantId", "companyId", "locationId", "status", "businessDate");
CREATE UNIQUE INDEX "ServingDeclarationLine_declarationId_lineNo_key"
  ON "ServingDeclarationLine"("declarationId", "lineNo");
CREATE UNIQUE INDEX "ServingDeclarationLine_exact_scope_key"
  ON "ServingDeclarationLine"("id", "tenantId", "companyId");
CREATE INDEX "ServingDeclarationLine_scope_menu_item_idx"
  ON "ServingDeclarationLine"("tenantId", "companyId", "menuItemId");
CREATE UNIQUE INDEX "ServingIngredientSnapshot_line_path_item_key"
  ON "ServingIngredientSnapshot"("declarationLineId", "recipeLinePath", "itemId");
CREATE INDEX "ServingIngredientSnapshot_scope_declaration_item_idx"
  ON "ServingIngredientSnapshot"("tenantId", "companyId", "declarationId", "itemId");
CREATE UNIQUE INDEX "ConsumptionPosting_declarationId_key" ON "ConsumptionPosting"("declarationId");
CREATE UNIQUE INDEX "ConsumptionPosting_declaration_exact_scope_key"
  ON "ConsumptionPosting"("declarationId", "tenantId", "companyId", "locationId");
CREATE UNIQUE INDEX "ConsumptionPosting_tenantId_companyId_idempotencyKey_key"
  ON "ConsumptionPosting"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "ConsumptionPosting_tenantId_companyId_reversalIdempotencyKey_key"
  ON "ConsumptionPosting"("tenantId", "companyId", "reversalIdempotencyKey")
  WHERE "reversalIdempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX "ConsumptionPosting_exact_scope_key"
  ON "ConsumptionPosting"("id", "tenantId", "companyId");
CREATE INDEX "ConsumptionPosting_scope_location_status_idx"
  ON "ConsumptionPosting"("tenantId", "companyId", "locationId", "inventoryLocationId", "status", "createdAt");
CREATE UNIQUE INDEX "ConsumptionPostingAllocation_postingId_allocationNo_key"
  ON "ConsumptionPostingAllocation"("postingId", "allocationNo");
CREATE UNIQUE INDEX "ConsumptionPostingAllocation_postedMovementId_key"
  ON "ConsumptionPostingAllocation"("postedMovementId") WHERE "postedMovementId" IS NOT NULL;
CREATE UNIQUE INDEX "ConsumptionPostingAllocation_reversalMovementId_key"
  ON "ConsumptionPostingAllocation"("reversalMovementId") WHERE "reversalMovementId" IS NOT NULL;
CREATE INDEX "ConsumptionPostingAllocation_scope_posting_item_idx"
  ON "ConsumptionPostingAllocation"("tenantId", "companyId", "postingId", "itemId");

ALTER TABLE "RestaurantConsumptionConfiguration"
  ADD CONSTRAINT "RestaurantConsumptionConfiguration_scope_fkey"
    FOREIGN KEY ("locationId", "tenantId", "companyId") REFERENCES "Location"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RestaurantConsumptionConfiguration_issue_location_fkey"
    FOREIGN KEY ("defaultIssueInventoryLocationId", "tenantId", "companyId", "locationId") REFERENCES "InventoryLocation"("id", "tenantId", "companyId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RestaurantConsumptionConfiguration_created_by_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RestaurantConsumptionConfiguration_activated_by_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MenuRecipeAssignment"
  ADD CONSTRAINT "MenuRecipeAssignment_location_scope_fkey"
    FOREIGN KEY ("locationId", "tenantId", "companyId") REFERENCES "Location"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MenuRecipeAssignment_menu_item_scope_fkey"
    FOREIGN KEY ("menuItemId", "tenantId", "companyId") REFERENCES "MenuItem"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MenuRecipeAssignment_recipe_version_scope_fkey"
    FOREIGN KEY ("recipeVersionId", "tenantId", "companyId") REFERENCES "RecipeVersion"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MenuRecipeAssignment_brand_scope_fkey"
    FOREIGN KEY ("brandId", "tenantId", "companyId") REFERENCES "Brand"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MenuRecipeAssignment_created_by_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServingDeclaration"
  ADD CONSTRAINT "ServingDeclaration_location_scope_fkey"
    FOREIGN KEY ("locationId", "tenantId", "companyId") REFERENCES "Location"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclaration_configuration_scope_fkey"
    FOREIGN KEY ("configurationId", "tenantId", "companyId", "locationId") REFERENCES "RestaurantConsumptionConfiguration"("id", "tenantId", "companyId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclaration_brand_scope_fkey"
    FOREIGN KEY ("brandId", "tenantId", "companyId") REFERENCES "Brand"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclaration_supersedes_fkey" FOREIGN KEY ("supersedesDeclarationId") REFERENCES "ServingDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclaration_created_by_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclaration_submitted_by_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclaration_verified_by_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclaration_returned_by_fkey" FOREIGN KEY ("returnedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServingDeclarationLine"
  ADD CONSTRAINT "ServingDeclarationLine_declaration_scope_fkey"
    FOREIGN KEY ("declarationId", "tenantId", "companyId") REFERENCES "ServingDeclaration"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclarationLine_menu_item_scope_fkey"
    FOREIGN KEY ("menuItemId", "tenantId", "companyId") REFERENCES "MenuItem"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclarationLine_assignment_fkey" FOREIGN KEY ("recipeAssignmentId") REFERENCES "MenuRecipeAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingDeclarationLine_recipe_version_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "RecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServingIngredientSnapshot"
  ADD CONSTRAINT "ServingIngredientSnapshot_declaration_scope_fkey"
    FOREIGN KEY ("declarationId", "tenantId", "companyId") REFERENCES "ServingDeclaration"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingIngredientSnapshot_line_scope_fkey"
    FOREIGN KEY ("declarationLineId", "tenantId", "companyId") REFERENCES "ServingDeclarationLine"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingIngredientSnapshot_recipe_scope_fkey"
    FOREIGN KEY ("recipeVersionId", "tenantId", "companyId") REFERENCES "RecipeVersion"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingIngredientSnapshot_item_scope_fkey"
    FOREIGN KEY ("itemId", "tenantId", "companyId") REFERENCES "Item"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServingIngredientSnapshot_uom_scope_fkey"
    FOREIGN KEY ("baseUomId", "tenantId", "companyId") REFERENCES "Uom"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsumptionPosting"
  ADD CONSTRAINT "ConsumptionPosting_declaration_scope_fkey"
    FOREIGN KEY ("declarationId", "tenantId", "companyId", "locationId") REFERENCES "ServingDeclaration"("id", "tenantId", "companyId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsumptionPosting_location_scope_fkey"
    FOREIGN KEY ("locationId", "tenantId", "companyId") REFERENCES "Location"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsumptionPosting_inventory_location_scope_fkey"
    FOREIGN KEY ("inventoryLocationId", "tenantId", "companyId", "locationId") REFERENCES "InventoryLocation"("id", "tenantId", "companyId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsumptionPosting_posted_by_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsumptionPosting_reversed_by_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsumptionPostingAllocation"
  ADD CONSTRAINT "ConsumptionPostingAllocation_posting_scope_fkey"
    FOREIGN KEY ("postingId", "tenantId", "companyId") REFERENCES "ConsumptionPosting"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsumptionPostingAllocation_item_scope_fkey"
    FOREIGN KEY ("itemId", "tenantId", "companyId") REFERENCES "Item"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsumptionPostingAllocation_uom_scope_fkey"
    FOREIGN KEY ("baseUomId", "tenantId", "companyId") REFERENCES "Uom"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsumptionPostingAllocation_posted_movement_fkey" FOREIGN KEY ("postedMovementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsumptionPostingAllocation_reversal_movement_fkey" FOREIGN KEY ("reversalMovementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.guard_restaurant_configuration_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM public."RestaurantConsumptionConfiguration" existing
     WHERE existing.id <> NEW.id
       AND existing."tenantId" = NEW."tenantId"
       AND existing."companyId" = NEW."companyId"
       AND existing."locationId" = NEW."locationId"
       AND existing.status = 'ACTIVE'
       AND tsrange(existing."effectiveFrom", existing."effectiveTo", '[)')
           && tsrange(NEW."effectiveFrom", NEW."effectiveTo", '[)')
  ) THEN
    RAISE EXCEPTION 'RESTAURANT_CONSUMPTION_CONFIGURATION_OVERLAP' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_menu_recipe_assignment_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM public."MenuRecipeAssignment" existing
     WHERE existing.id <> NEW.id
       AND existing."tenantId" = NEW."tenantId"
       AND existing."companyId" = NEW."companyId"
       AND existing."locationId" = NEW."locationId"
       AND existing."menuItemId" = NEW."menuItemId"
       AND existing.status = 'ACTIVE'
       AND tsrange(existing."effectiveFrom", existing."effectiveTo", '[)')
           && tsrange(NEW."effectiveFrom", NEW."effectiveTo", '[)')
  ) THEN
    RAISE EXCEPTION 'MENU_RECIPE_ASSIGNMENT_OVERLAP' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_serving_declaration_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT'
       OR NEW."submittedByUserId" IS NOT NULL OR NEW."submittedAt" IS NOT NULL
       OR NEW."verifiedByUserId" IS NOT NULL OR NEW."verifiedAt" IS NOT NULL
       OR NEW."returnedByUserId" IS NOT NULL OR NEW."returnedAt" IS NOT NULL
       OR NEW."derivationSnapshot" IS NOT NULL OR NEW."derivationSnapshotHash" IS NOT NULL THEN
      RAISE EXCEPTION 'SERVING_DECLARATION_INITIAL_STATE_INVALID' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SERVING_DECLARATION_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF OLD.status NOT IN ('DRAFT','RETURNED') AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."brandId" IS DISTINCT FROM OLD."brandId" OR NEW."locationId" IS DISTINCT FROM OLD."locationId"
    OR NEW."configurationId" IS DISTINCT FROM OLD."configurationId" OR NEW."businessDate" IS DISTINCT FROM OLD."businessDate"
    OR NEW."servicePeriodCode" IS DISTINCT FROM OLD."servicePeriodCode" OR NEW."coverageStartAt" IS DISTINCT FROM OLD."coverageStartAt"
    OR NEW."coverageEndAt" IS DISTINCT FROM OLD."coverageEndAt" OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
    OR NEW."sourceReference" IS DISTINCT FROM OLD."sourceReference" OR NEW."revisionNo" IS DISTINCT FROM OLD."revisionNo"
    OR NEW."supersedesDeclarationId" IS DISTINCT FROM OLD."supersedesDeclarationId" OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
  ) THEN
    RAISE EXCEPTION 'SERVING_DECLARATION_FACT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('SUBMITTED','CANCELLED'))
    OR (OLD.status = 'RETURNED' AND NEW.status IN ('DRAFT','SUBMITTED','CANCELLED'))
    OR (OLD.status = 'SUBMITTED' AND NEW.status IN ('RETURNED','DERIVATION_BLOCKED','READY_TO_POST','CANCELLED'))
    OR (OLD.status = 'DERIVATION_BLOCKED' AND NEW.status IN ('RETURNED','READY_TO_POST','CANCELLED'))
    OR (OLD.status = 'READY_TO_POST' AND NEW.status IN ('POSTING','CANCELLED'))
    OR (OLD.status = 'POSTING' AND NEW.status = 'POSTED')
    OR (OLD.status = 'POSTED' AND NEW.status = 'REVERSED')
  ) THEN
    RAISE EXCEPTION 'SERVING_DECLARATION_STATUS_TRANSITION_INVALID' USING ERRCODE = '55000';
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_serving_line_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  parent_status public."ServingDeclarationStatus";
  parent_id uuid;
  parent_tenant_id uuid;
  parent_company_id uuid;
  parent_location_id uuid;
BEGIN
  parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."declarationId" ELSE NEW."declarationId" END;
  SELECT status, "tenantId", "companyId", "locationId"
    INTO parent_status, parent_tenant_id, parent_company_id, parent_location_id
    FROM public."ServingDeclaration"
   WHERE id = parent_id;
  IF TG_OP <> 'DELETE' AND (
    parent_status IS NULL OR NEW."tenantId" <> parent_tenant_id
    OR NEW."companyId" <> parent_company_id
  ) THEN
    RAISE EXCEPTION 'SERVING_DECLARATION_LINE_SCOPE_INVALID' USING ERRCODE = '55000';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."recipeAssignmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."MenuRecipeAssignment" assignment
     WHERE assignment.id = NEW."recipeAssignmentId"
       AND assignment."tenantId" = NEW."tenantId"
       AND assignment."companyId" = NEW."companyId"
       AND assignment."locationId" = parent_location_id
       AND assignment."menuItemId" = NEW."menuItemId"
       AND assignment."recipeVersionId" = NEW."recipeVersionId"
  ) THEN
    RAISE EXCEPTION 'SERVING_DECLARATION_LINE_RECIPE_SCOPE_INVALID' USING ERRCODE = '55000';
  END IF;
  IF parent_status NOT IN ('DRAFT','RETURNED') THEN
    IF TG_OP = 'UPDATE' AND parent_status IN ('SUBMITTED','DERIVATION_BLOCKED')
       AND NEW."tenantId" = OLD."tenantId" AND NEW."companyId" = OLD."companyId"
       AND NEW."declarationId" = OLD."declarationId" AND NEW."lineNo" = OLD."lineNo"
       AND NEW."menuItemId" = OLD."menuItemId" AND NEW.disposition = OLD.disposition
       AND NEW."quantityServed" = OLD."quantityServed"
       AND NEW."complimentaryReason" IS NOT DISTINCT FROM OLD."complimentaryReason"
       AND NEW."complimentaryReference" IS NOT DISTINCT FROM OLD."complimentaryReference"
       AND NEW."menuItemCodeSnapshot" = OLD."menuItemCodeSnapshot"
       AND NEW."menuItemNameSnapshot" = OLD."menuItemNameSnapshot"
       AND NEW."createdAt" = OLD."createdAt" THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'SERVING_DECLARATION_LINE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_append_only_restaurant_consumption()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'RESTAURANT_CONSUMPTION_APPEND_ONLY' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION public.guard_serving_snapshot_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  parent_status public."ServingDeclarationStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'SERVING_INGREDIENT_SNAPSHOT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  SELECT status INTO parent_status
    FROM public."ServingDeclaration"
   WHERE id = NEW."declarationId"
     AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId"
   FOR SHARE;
  IF parent_status NOT IN ('SUBMITTED', 'DERIVATION_BLOCKED') THEN
    RAISE EXCEPTION 'SERVING_INGREDIENT_SNAPSHOT_PARENT_STATE_INVALID' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_restaurant_configuration_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' OR NEW.enabled OR NEW."activatedByUserId" IS NOT NULL THEN
      RAISE EXCEPTION 'RESTAURANT_CONSUMPTION_CONFIGURATION_INITIAL_STATE_INVALID' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RESTAURANT_CONSUMPTION_CONFIGURATION_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."locationId" IS DISTINCT FROM OLD."locationId"
     OR NEW."defaultIssueInventoryLocationId" IS DISTINCT FROM OLD."defaultIssueInventoryLocationId"
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW."servicePeriodMode" IS DISTINCT FROM OLD."servicePeriodMode"
     OR NEW.timezone IS DISTINCT FROM OLD.timezone
     OR NEW."servicePeriods" IS DISTINCT FROM OLD."servicePeriods"
     OR NEW."sentinelRules" IS DISTINCT FROM OLD."sentinelRules"
     OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'RESTAURANT_CONSUMPTION_CONFIGURATION_FACT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'ACTIVE' AND OLD.enabled = false AND NEW.enabled = true
      AND OLD."effectiveTo" IS NOT DISTINCT FROM NEW."effectiveTo" AND NEW."activatedByUserId" IS NOT NULL)
    OR (OLD.status = 'ACTIVE' AND NEW.status = 'ACTIVE' AND OLD.enabled = true AND NEW.enabled = true
      AND OLD."effectiveTo" IS NULL AND NEW."effectiveTo" IS NOT NULL AND NEW."effectiveTo" > NEW."effectiveFrom")
    OR (OLD.status = 'ACTIVE' AND NEW.status = 'INACTIVE' AND OLD.enabled = true AND NEW.enabled = false
      AND (OLD."effectiveTo" IS NOT DISTINCT FROM NEW."effectiveTo"
        OR (OLD."effectiveTo" IS NULL AND NEW."effectiveTo" IS NOT NULL AND NEW."effectiveTo" > NEW."effectiveFrom")))
  ) THEN
    RAISE EXCEPTION 'RESTAURANT_CONSUMPTION_CONFIGURATION_TRANSITION_INVALID' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_menu_recipe_assignment_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'MENU_RECIPE_ASSIGNMENT_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."brandId" IS DISTINCT FROM OLD."brandId"
     OR NEW."locationId" IS DISTINCT FROM OLD."locationId"
     OR NEW."menuItemId" IS DISTINCT FROM OLD."menuItemId"
     OR NEW."recipeVersionId" IS DISTINCT FROM OLD."recipeVersionId"
     OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR OLD.status <> 'ACTIVE'
     OR NOT (
       (NEW.status = 'ACTIVE' AND OLD."effectiveTo" IS NULL
         AND NEW."effectiveTo" IS NOT NULL AND NEW."effectiveTo" > NEW."effectiveFrom")
       OR (NEW.status = 'INACTIVE'
         AND (OLD."effectiveTo" IS NOT DISTINCT FROM NEW."effectiveTo"
           OR (OLD."effectiveTo" IS NULL AND NEW."effectiveTo" IS NOT NULL
             AND NEW."effectiveTo" > NEW."effectiveFrom")))
     ) THEN
    RAISE EXCEPTION 'MENU_RECIPE_ASSIGNMENT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_consumption_posting_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'READY'
       OR NEW."postedByUserId" IS NOT NULL OR NEW."postedAt" IS NOT NULL
       OR NEW."reversedByUserId" IS NOT NULL OR NEW."reversedAt" IS NOT NULL
       OR NEW."reversalIdempotencyKey" IS NOT NULL OR NEW."reversalRequestHash" IS NOT NULL THEN
      RAISE EXCEPTION 'CONSUMPTION_POSTING_INITIAL_STATE_INVALID' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CONSUMPTION_POSTING_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."locationId" IS DISTINCT FROM OLD."locationId"
     OR NEW."declarationId" IS DISTINCT FROM OLD."declarationId"
     OR NEW."inventoryLocationId" IS DISTINCT FROM OLD."inventoryLocationId"
     OR NEW."snapshotHash" IS DISTINCT FROM OLD."snapshotHash"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'CONSUMPTION_POSTING_FACT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'READY' AND NEW.status = 'POSTING')
    OR (OLD.status = 'POSTING' AND NEW.status = 'POSTED'
      AND NEW."postedByUserId" IS NOT NULL AND NEW."postedAt" IS NOT NULL)
    OR (OLD.status = 'POSTED' AND NEW.status = 'REVERSING')
    OR (OLD.status = 'REVERSING' AND NEW.status = 'REVERSED'
      AND NEW."reversedByUserId" IS NOT NULL AND NEW."reversedAt" IS NOT NULL
      AND length(btrim(COALESCE(NEW."reversalReason", ''))) >= 5)
  ) THEN
    RAISE EXCEPTION 'CONSUMPTION_POSTING_STATUS_TRANSITION_INVALID' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'POSTED' AND NEW.status = 'REVERSING' AND (
    length(btrim(COALESCE(NEW."reversalIdempotencyKey", ''))) < 8
    OR length(COALESCE(NEW."reversalRequestHash", '')) <> 64
    OR length(btrim(COALESCE(NEW."reversalReason", ''))) < 5
  ) THEN
    RAISE EXCEPTION 'CONSUMPTION_POSTING_REVERSAL_INTENT_INVALID' USING ERRCODE = '55000';
  END IF;
  IF NOT (OLD.status = 'POSTED' AND NEW.status = 'REVERSING') AND (
    NEW."reversalIdempotencyKey" IS DISTINCT FROM OLD."reversalIdempotencyKey"
    OR NEW."reversalRequestHash" IS DISTINCT FROM OLD."reversalRequestHash"
    OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason"
  ) THEN
    RAISE EXCEPTION 'CONSUMPTION_POSTING_REVERSAL_INTENT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW.status = OLD.status AND (
    NEW."postedByUserId" IS DISTINCT FROM OLD."postedByUserId"
    OR NEW."postedAt" IS DISTINCT FROM OLD."postedAt"
    OR NEW."reversedByUserId" IS DISTINCT FROM OLD."reversedByUserId"
    OR NEW."reversedAt" IS DISTINCT FROM OLD."reversedAt"
    OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason"
  ) THEN
    RAISE EXCEPTION 'CONSUMPTION_POSTING_TERMINAL_FACT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_consumption_allocation_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  parent_status public."ConsumptionPostingStatus";
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO parent_status
      FROM public."ConsumptionPosting"
     WHERE id = NEW."postingId"
       AND "tenantId" = NEW."tenantId"
       AND "companyId" = NEW."companyId"
     FOR SHARE;
    IF parent_status <> 'POSTING' THEN
      RAISE EXCEPTION 'CONSUMPTION_POSTING_ALLOCATION_PARENT_STATE_INVALID' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CONSUMPTION_POSTING_ALLOCATION_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."postingId" IS DISTINCT FROM OLD."postingId"
     OR NEW."itemId" IS DISTINCT FROM OLD."itemId"
     OR NEW."baseUomId" IS DISTINCT FROM OLD."baseUomId"
     OR NEW."allocationNo" IS DISTINCT FROM OLD."allocationNo"
     OR NEW."quantityBaseUom" IS DISTINCT FROM OLD."quantityBaseUom"
     OR NEW."lotKey" IS DISTINCT FROM OLD."lotKey"
     OR NEW."lotNumber" IS DISTINCT FROM OLD."lotNumber"
     OR NEW."expiryDate" IS DISTINCT FROM OLD."expiryDate"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'CONSUMPTION_POSTING_ALLOCATION_FACT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  SELECT status INTO parent_status FROM public."ConsumptionPosting" WHERE id = OLD."postingId" FOR SHARE;
  IF OLD."postedMovementId" IS NULL AND NEW."postedMovementId" IS NOT NULL
     AND OLD."reversalMovementId" IS NOT DISTINCT FROM NEW."reversalMovementId"
     AND parent_status = 'POSTING' THEN
    RETURN NEW;
  END IF;
  IF OLD."reversalMovementId" IS NULL AND NEW."reversalMovementId" IS NOT NULL
     AND OLD."postedMovementId" IS NOT DISTINCT FROM NEW."postedMovementId"
     AND OLD."postedMovementId" IS NOT NULL AND parent_status = 'REVERSING' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'CONSUMPTION_POSTING_ALLOCATION_UPDATE_INVALID' USING ERRCODE = '55000';
END; $$;

CREATE OR REPLACE FUNCTION public.guard_consumption_movement_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."movementType" = 'CONSUMPTION_OUT' THEN
    IF NEW."sourceDocumentType" <> 'ConsumptionPosting'
       OR NEW."sourceDocumentLineId" IS NULL
       OR NEW."reversalOfMovementId" IS NOT NULL
       OR NEW."quantityDeltaBaseUom" >= 0
       OR NOT EXISTS (
         SELECT 1 FROM public."ConsumptionPostingAllocation" allocation
         JOIN public."ConsumptionPosting" posting ON posting.id = allocation."postingId"
        WHERE allocation.id = NEW."sourceDocumentLineId"
          AND posting.id = NEW."sourceDocumentId"
          AND posting.status = 'POSTING'
          AND allocation."tenantId" = NEW."tenantId" AND allocation."companyId" = NEW."companyId"
          AND posting."tenantId" = NEW."tenantId" AND posting."companyId" = NEW."companyId"
          AND allocation."itemId" = NEW."itemId" AND posting."inventoryLocationId" = NEW."inventoryLocationId"
          AND allocation."baseUomId" = NEW."baseUomId"
          AND allocation."lotNumber" IS NOT DISTINCT FROM NEW."lotNumber"
          AND allocation."expiryDate" IS NOT DISTINCT FROM NEW."expiryDate"
          AND allocation."quantityBaseUom" = abs(NEW."quantityDeltaBaseUom")
       ) THEN
      RAISE EXCEPTION 'CONSUMPTION_MOVEMENT_SOURCE_INVALID' USING ERRCODE = '55000';
    END IF;
  ELSIF NEW."sourceDocumentType" = 'ConsumptionPosting' THEN
    RAISE EXCEPTION 'CONSUMPTION_MOVEMENT_TYPE_INVALID' USING ERRCODE = '55000';
  ELSIF NEW."sourceDocumentType" = 'ConsumptionPostingReversal' THEN
    IF NEW."movementType" <> 'REVERSAL' OR NEW."reversalOfMovementId" IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public."ConsumptionPostingAllocation" allocation
          JOIN public."ConsumptionPosting" posting ON posting.id = allocation."postingId"
          JOIN public."InventoryMovement" original ON original.id = allocation."postedMovementId"
          WHERE allocation.id = NEW."sourceDocumentLineId"
            AND allocation."postingId" = NEW."sourceDocumentId"
            AND posting.status = 'REVERSING'
            AND posting."tenantId" = NEW."tenantId" AND posting."companyId" = NEW."companyId"
            AND posting."inventoryLocationId" = NEW."inventoryLocationId"
            AND allocation."tenantId" = NEW."tenantId" AND allocation."companyId" = NEW."companyId"
            AND allocation."itemId" = NEW."itemId" AND allocation."baseUomId" = NEW."baseUomId"
            AND allocation."lotNumber" IS NOT DISTINCT FROM NEW."lotNumber"
            AND allocation."expiryDate" IS NOT DISTINCT FROM NEW."expiryDate"
            AND allocation."quantityBaseUom" = NEW."quantityDeltaBaseUom"
            AND allocation."postedMovementId" = NEW."reversalOfMovementId"
            AND original."sourceDocumentType" = 'ConsumptionPosting'
            AND original."sourceDocumentId" = posting.id
            AND original."sourceDocumentLineId" = allocation.id
            AND original."tenantId" = NEW."tenantId" AND original."companyId" = NEW."companyId"
            AND original."inventoryLocationId" = NEW."inventoryLocationId"
            AND original."itemId" = NEW."itemId" AND original."baseUomId" = NEW."baseUomId"
            AND original."lotNumber" IS NOT DISTINCT FROM NEW."lotNumber"
            AND original."expiryDate" IS NOT DISTINCT FROM NEW."expiryDate"
            AND original."quantityDeltaBaseUom" = -NEW."quantityDeltaBaseUom"
       ) THEN
      RAISE EXCEPTION 'CONSUMPTION_REVERSAL_SOURCE_INVALID' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER "RestaurantConsumptionConfiguration_overlap_guard"
  BEFORE INSERT OR UPDATE ON "RestaurantConsumptionConfiguration"
  FOR EACH ROW EXECUTE FUNCTION public.guard_restaurant_configuration_overlap();
CREATE TRIGGER "MenuRecipeAssignment_overlap_guard"
  BEFORE INSERT OR UPDATE ON "MenuRecipeAssignment"
  FOR EACH ROW EXECUTE FUNCTION public.guard_menu_recipe_assignment_overlap();
CREATE TRIGGER "ServingDeclaration_transition_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "ServingDeclaration"
  FOR EACH ROW EXECUTE FUNCTION public.guard_serving_declaration_transition();
CREATE TRIGGER "ServingDeclarationLine_write_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "ServingDeclarationLine"
  FOR EACH ROW EXECUTE FUNCTION public.guard_serving_line_write();
CREATE TRIGGER "ServingIngredientSnapshot_append_only_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "ServingIngredientSnapshot"
  FOR EACH ROW EXECUTE FUNCTION public.guard_serving_snapshot_write();
CREATE TRIGGER "RestaurantConsumptionConfiguration_transition_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "RestaurantConsumptionConfiguration"
  FOR EACH ROW EXECUTE FUNCTION public.guard_restaurant_configuration_transition();
CREATE TRIGGER "MenuRecipeAssignment_transition_guard"
  BEFORE UPDATE OR DELETE ON "MenuRecipeAssignment"
  FOR EACH ROW EXECUTE FUNCTION public.guard_menu_recipe_assignment_transition();
CREATE TRIGGER "ConsumptionPosting_transition_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "ConsumptionPosting"
  FOR EACH ROW EXECUTE FUNCTION public.guard_consumption_posting_transition();
CREATE TRIGGER "ConsumptionPostingAllocation_update_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "ConsumptionPostingAllocation"
  FOR EACH ROW EXECUTE FUNCTION public.guard_consumption_allocation_update();
CREATE TRIGGER "InventoryMovement_consumption_source_guard"
  BEFORE INSERT ON "InventoryMovement"
  FOR EACH ROW EXECUTE FUNCTION public.guard_consumption_movement_source();

CREATE TRIGGER "ServingDeclaration_no_truncate_guard"
  BEFORE TRUNCATE ON "ServingDeclaration" FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "ServingDeclarationLine_no_truncate_guard"
  BEFORE TRUNCATE ON "ServingDeclarationLine" FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "ServingIngredientSnapshot_no_truncate_guard"
  BEFORE TRUNCATE ON "ServingIngredientSnapshot" FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "ConsumptionPosting_no_truncate_guard"
  BEFORE TRUNCATE ON "ConsumptionPosting" FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "ConsumptionPostingAllocation_no_truncate_guard"
  BEFORE TRUNCATE ON "ConsumptionPostingAllocation" FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "RestaurantConsumptionConfiguration_no_truncate_guard"
  BEFORE TRUNCATE ON "RestaurantConsumptionConfiguration" FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "MenuRecipeAssignment_no_truncate_guard"
  BEFORE TRUNCATE ON "MenuRecipeAssignment" FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();

REVOKE ALL ON FUNCTION public.guard_restaurant_configuration_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_menu_recipe_assignment_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_serving_declaration_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_serving_line_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_append_only_restaurant_consumption() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_serving_snapshot_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_restaurant_configuration_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_menu_recipe_assignment_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_consumption_posting_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_consumption_allocation_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_consumption_movement_source() FROM PUBLIC;

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
     OR (NEW."movementType" IN ('TRANSFER_OUT', 'WASTAGE_OUT', 'CONSUMPTION_OUT', 'ADJUSTMENT_OUT', 'COUNT_VARIANCE_OUT')
      AND NEW."quantityDeltaBaseUom" >= 0) THEN
    RAISE EXCEPTION 'INVENTORY_MOVEMENT_TYPE_SIGN_INVALID' USING ERRCODE = '22003';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."Item" item
     WHERE item.id = NEW."itemId" AND item."tenantId" = NEW."tenantId"
       AND item."companyId" = NEW."companyId" AND item."baseUomId" = NEW."baseUomId"
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
    ) ON CONFLICT ("inventoryLocationId", "itemId", "lotKey") DO UPDATE
      SET "qtyOnHand" = public."InventoryBalance"."qtyOnHand" + EXCLUDED."qtyOnHand",
          version = public."InventoryBalance".version + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE public."InventoryBalance"."tenantId" = EXCLUDED."tenantId"
        AND public."InventoryBalance"."companyId" = EXCLUDED."companyId"
        AND public."InventoryBalance"."baseUomId" = EXCLUDED."baseUomId"
        AND public."InventoryBalance"."lotNumber" IS NOT DISTINCT FROM EXCLUDED."lotNumber"
        AND public."InventoryBalance"."expiryDate" IS NOT DISTINCT FROM EXCLUDED."expiryDate"
    RETURNING id INTO affected_balance_id;
  ELSE
    UPDATE public."InventoryBalance"
       SET "qtyOnHand" = "qtyOnHand" + NEW."quantityDeltaBaseUom",
           version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "inventoryLocationId" = NEW."inventoryLocationId" AND "itemId" = NEW."itemId"
       AND "lotKey" = canonical_lot_key AND "tenantId" = NEW."tenantId"
       AND "companyId" = NEW."companyId" AND "baseUomId" = NEW."baseUomId"
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
