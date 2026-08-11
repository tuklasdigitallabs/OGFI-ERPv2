-- Effective-dated brand recipe inheritance for DEC-0279.
-- Publication exposes exact-brand candidates; it does not fabricate a menu
-- identity or rewrite historical serving snapshots.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "MenuRecipeAssignmentScope" AS ENUM (
  'BRAND_DEFAULT',
  'LOCATION_OVERRIDE'
);

CREATE TYPE "MenuItemLocationAvailabilityState" AS ENUM (
  'AVAILABLE',
  'UNAVAILABLE'
);

CREATE TYPE "RestaurantMenuPolicyCommandType" AS ENUM (
  'ADOPT_SHARED_RECIPE',
  'SET_BRAND_DEFAULT',
  'SET_LOCATION_OVERRIDE',
  'SET_LOCATION_AVAILABILITY',
  'END_OVERRIDE',
  'REVERT',
  'CANCEL_FUTURE',
  'ROLLOUT_SUCCESSOR'
);

CREATE TYPE "RestaurantMenuPolicyTargetType" AS ENUM (
  'RECIPE_BRAND_ADOPTION',
  'MENU_RECIPE_ASSIGNMENT',
  'MENU_ITEM_LOCATION_AVAILABILITY'
);

ALTER TABLE "MenuRecipeAssignment"
  ADD COLUMN "scopeType" "MenuRecipeAssignmentScope";

-- The foundation transition trigger intentionally rejects arbitrary same-state
-- updates. Replace it around this one-time shape migration rather than weakening
-- its runtime rules.
DROP TRIGGER "MenuRecipeAssignment_overlap_guard" ON "MenuRecipeAssignment";
DROP TRIGGER "MenuRecipeAssignment_transition_guard" ON "MenuRecipeAssignment";

-- Existing location-grained rows retain their meaning as explicit overrides.
UPDATE "MenuRecipeAssignment" assignment
   SET "scopeType" = 'LOCATION_OVERRIDE',
       "brandId" = location."brandId"
  FROM "Location" location
 WHERE location.id = assignment."locationId"
   AND location."tenantId" = assignment."tenantId"
   AND location."companyId" = assignment."companyId"
   AND assignment."scopeType" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "MenuRecipeAssignment" assignment
      LEFT JOIN "Location" location
        ON location.id = assignment."locationId"
       AND location."tenantId" = assignment."tenantId"
       AND location."companyId" = assignment."companyId"
      LEFT JOIN "MenuItem" menu_item
        ON menu_item.id = assignment."menuItemId"
       AND menu_item."tenantId" = assignment."tenantId"
       AND menu_item."companyId" = assignment."companyId"
      LEFT JOIN "RecipeVersion" recipe_version
        ON recipe_version.id = assignment."recipeVersionId"
       AND recipe_version."tenantId" = assignment."tenantId"
       AND recipe_version."companyId" = assignment."companyId"
      LEFT JOIN "Recipe" recipe ON recipe.id = recipe_version."recipeId"
     WHERE assignment."scopeType" IS NULL
        OR assignment."brandId" IS NULL
        OR location.id IS NULL
        OR location."brandId" IS NULL
        OR location."locationType" <> 'BRANCH'
        OR location."brandId" <> assignment."brandId"
        OR menu_item.id IS NULL
        OR menu_item."brandId" IS NULL
        OR menu_item."brandId" <> assignment."brandId"
        OR recipe_version.id IS NULL
        OR recipe.id IS NULL
        OR recipe."brandId" IS NULL
        OR recipe."brandId" <> assignment."brandId"
  ) THEN
    RAISE EXCEPTION 'MENU_RECIPE_EXISTING_OVERRIDE_SCOPE_REVIEW_REQUIRED'
      USING ERRCODE = '23514';
  END IF;
END $$;

DO $$
DECLARE
  migrated_override_count bigint;
BEGIN
  SELECT count(*) INTO migrated_override_count
    FROM "MenuRecipeAssignment"
   WHERE "scopeType" = 'LOCATION_OVERRIDE';
  IF migrated_override_count > 0 THEN
    RAISE WARNING 'LEGACY_LOCATION_OVERRIDES_MIGRATED=%; review open-ended overrides before enabling inherited defaults', migrated_override_count;
  ELSE
    RAISE NOTICE 'LEGACY_LOCATION_OVERRIDES_MIGRATED=0';
  END IF;
END $$;

ALTER TABLE "MenuRecipeAssignment"
  ALTER COLUMN "scopeType" SET NOT NULL,
  ALTER COLUMN "brandId" SET NOT NULL,
  ALTER COLUMN "locationId" DROP NOT NULL,
  ADD CONSTRAINT "MenuRecipeAssignment_scope_shape_check" CHECK (
    ("scopeType" = 'BRAND_DEFAULT' AND "locationId" IS NULL)
    OR ("scopeType" = 'LOCATION_OVERRIDE' AND "locationId" IS NOT NULL)
  );

DROP INDEX IF EXISTS "MenuRecipeAssignment_locationId_menuItemId_effectiveFrom_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Recipe_exact_scope_key"
  ON "Recipe"(id, "tenantId", "companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "Location_exact_brand_scope_key"
  ON "Location"(id, "tenantId", "companyId", "brandId");
CREATE UNIQUE INDEX IF NOT EXISTS "MenuItem_exact_brand_scope_key"
  ON "MenuItem"(id, "tenantId", "companyId", "brandId");
CREATE UNIQUE INDEX "MenuRecipeAssignment_exact_company_scope_key"
  ON "MenuRecipeAssignment"(id, "tenantId", "companyId");
CREATE INDEX "MenuRecipeAssignment_brand_default_lookup_idx"
  ON "MenuRecipeAssignment"(
    "tenantId", "companyId", "brandId", "menuItemId", "scopeType", status, "effectiveFrom"
  );
CREATE INDEX "MenuRecipeAssignment_location_override_lookup_idx"
  ON "MenuRecipeAssignment"(
    "tenantId", "companyId", "locationId", "menuItemId", "scopeType", status, "effectiveFrom"
  );

ALTER TABLE "MenuRecipeAssignment"
  DROP CONSTRAINT "MenuRecipeAssignment_location_scope_fkey",
  DROP CONSTRAINT "MenuRecipeAssignment_menu_item_scope_fkey",
  DROP CONSTRAINT "MenuRecipeAssignment_brand_scope_fkey",
  ADD CONSTRAINT "MenuRecipeAssignment_brand_exact_scope_fkey"
    FOREIGN KEY ("brandId", "tenantId", "companyId")
    REFERENCES "Brand"(id, "tenantId", "companyId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "MenuRecipeAssignment_location_brand_scope_fkey"
    FOREIGN KEY ("locationId", "tenantId", "companyId", "brandId")
    REFERENCES "Location"(id, "tenantId", "companyId", "brandId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "MenuRecipeAssignment_menu_item_brand_scope_fkey"
    FOREIGN KEY ("menuItemId", "tenantId", "companyId", "brandId")
    REFERENCES "MenuItem"(id, "tenantId", "companyId", "brandId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ServingDeclarationLine"
  DROP CONSTRAINT "ServingDeclarationLine_assignment_fkey",
  ADD CONSTRAINT "ServingDeclarationLine_assignment_exact_scope_fkey"
    FOREIGN KEY ("recipeAssignmentId", "tenantId", "companyId")
    REFERENCES "MenuRecipeAssignment"(id, "tenantId", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MenuItemLocationAvailability" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "menuItemId" UUID NOT NULL,
  state "MenuItemLocationAvailabilityState" NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  status "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  reason TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuItemLocationAvailability_pkey" PRIMARY KEY (id),
  CONSTRAINT "MenuItemLocationAvailability_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "MenuItemLocationAvailability_reason_check"
    CHECK (length(btrim(reason)) >= 5)
);

CREATE UNIQUE INDEX "MenuItemLocationAvailability_exact_scope_key"
  ON "MenuItemLocationAvailability"(id, "tenantId", "companyId");
CREATE INDEX "MenuItemLocationAvailability_resolution_idx"
  ON "MenuItemLocationAvailability"(
    "tenantId", "companyId", "locationId", "menuItemId", status, "effectiveFrom"
  );

ALTER TABLE "MenuItemLocationAvailability"
  ADD CONSTRAINT "MenuItemAvailability_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MenuItemAvailability_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MenuItemAvailability_brand_scope_fkey"
    FOREIGN KEY ("brandId", "tenantId", "companyId") REFERENCES "Brand"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "MenuItemAvailability_location_brand_scope_fkey"
    FOREIGN KEY ("locationId", "tenantId", "companyId", "brandId") REFERENCES "Location"(id, "tenantId", "companyId", "brandId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "MenuItemAvailability_menu_item_brand_scope_fkey"
    FOREIGN KEY ("menuItemId", "tenantId", "companyId", "brandId") REFERENCES "MenuItem"(id, "tenantId", "companyId", "brandId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "MenuItemAvailability_created_by_tenant_fkey"
    FOREIGN KEY ("createdByUserId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RecipeBrandAdoption" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "recipeId" UUID NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  status "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  reason TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecipeBrandAdoption_pkey" PRIMARY KEY (id),
  CONSTRAINT "RecipeBrandAdoption_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "RecipeBrandAdoption_reason_check" CHECK (length(btrim(reason)) >= 5)
);

CREATE UNIQUE INDEX "RecipeBrandAdoption_exact_scope_key"
  ON "RecipeBrandAdoption"(id, "tenantId", "companyId");
CREATE INDEX "RecipeBrandAdoption_resolution_idx"
  ON "RecipeBrandAdoption"(
    "tenantId", "companyId", "brandId", "recipeId", status, "effectiveFrom"
  );

ALTER TABLE "RecipeBrandAdoption"
  ADD CONSTRAINT "RecipeBrandAdoption_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RecipeBrandAdoption_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RecipeBrandAdoption_brand_scope_fkey"
    FOREIGN KEY ("brandId", "tenantId", "companyId") REFERENCES "Brand"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RecipeBrandAdoption_recipe_scope_fkey"
    FOREIGN KEY ("recipeId", "tenantId", "companyId") REFERENCES "Recipe"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RecipeBrandAdoption_created_by_tenant_fkey"
    FOREIGN KEY ("createdByUserId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RestaurantMenuPolicyCommand" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "locationId" UUID,
  "commandType" "RestaurantMenuPolicyCommandType" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "targetType" "RestaurantMenuPolicyTargetType",
  "targetId" UUID,
  "previewSnapshotHash" TEXT,
  outcome JSONB NOT NULL,
  "actorUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantMenuPolicyCommand_pkey" PRIMARY KEY (id),
  CONSTRAINT "RestaurantMenuPolicyCommand_idempotency_key_check"
    CHECK (length(btrim("idempotencyKey")) BETWEEN 8 AND 200),
  CONSTRAINT "RestaurantMenuPolicyCommand_request_hash_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "RestaurantMenuPolicyCommand_target_shape_check"
    CHECK (("targetType" IS NULL) = ("targetId" IS NULL)),
  CONSTRAINT "RestaurantMenuPolicyCommand_preview_hash_check"
    CHECK ("previewSnapshotHash" IS NULL OR "previewSnapshotHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "RestaurantMenuPolicyCommand_rollout_preview_check"
    CHECK ("commandType" <> 'ROLLOUT_SUCCESSOR' OR "previewSnapshotHash" IS NOT NULL),
  CONSTRAINT "RestaurantMenuPolicyCommand_outcome_object_check"
    CHECK (jsonb_typeof(outcome) = 'object')
);

CREATE UNIQUE INDEX "RestaurantMenuPolicyCommand_scoped_idempotency_key"
  ON "RestaurantMenuPolicyCommand"("tenantId", "companyId", "brandId", "idempotencyKey");
CREATE INDEX "RestaurantMenuPolicyCommand_audit_idx"
  ON "RestaurantMenuPolicyCommand"("tenantId", "companyId", "brandId", "commandType", "createdAt");
CREATE INDEX "RestaurantMenuPolicyCommand_target_idx"
  ON "RestaurantMenuPolicyCommand"("tenantId", "companyId", "targetType", "targetId");

ALTER TABLE "RestaurantMenuPolicyCommand"
  ADD CONSTRAINT "RestaurantMenuPolicyCommand_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RestaurantMenuPolicyCommand_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RestaurantMenuPolicyCommand_brand_scope_fkey"
    FOREIGN KEY ("brandId", "tenantId", "companyId") REFERENCES "Brand"(id, "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RestaurantMenuPolicyCommand_location_brand_scope_fkey"
    FOREIGN KEY ("locationId", "tenantId", "companyId", "brandId") REFERENCES "Location"(id, "tenantId", "companyId", "brandId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RestaurantMenuPolicyCommand_actor_tenant_fkey"
    FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"(id, "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exclusion constraints are the race-safe authority. The overlap triggers below
-- retain stable application error codes, while a concurrent insert that passes
-- its snapshot still loses at constraint enforcement.
ALTER TABLE "MenuRecipeAssignment"
  ADD CONSTRAINT "MenuRecipeAssignment_brand_default_no_overlap"
    EXCLUDE USING gist (
      "tenantId" WITH =,
      "companyId" WITH =,
      "brandId" WITH =,
      "menuItemId" WITH =,
      tsrange("effectiveFrom", "effectiveTo", '[)') WITH &&
    ) WHERE (status = 'ACTIVE' AND "scopeType" = 'BRAND_DEFAULT'),
  ADD CONSTRAINT "MenuRecipeAssignment_location_override_no_overlap"
    EXCLUDE USING gist (
      "tenantId" WITH =,
      "companyId" WITH =,
      "locationId" WITH =,
      "menuItemId" WITH =,
      tsrange("effectiveFrom", "effectiveTo", '[)') WITH &&
    ) WHERE (status = 'ACTIVE' AND "scopeType" = 'LOCATION_OVERRIDE');

ALTER TABLE "MenuItemLocationAvailability"
  ADD CONSTRAINT "MenuItemLocationAvailability_no_overlap"
    EXCLUDE USING gist (
      "tenantId" WITH =,
      "companyId" WITH =,
      "locationId" WITH =,
      "menuItemId" WITH =,
      tsrange("effectiveFrom", "effectiveTo", '[)') WITH &&
    ) WHERE (status = 'ACTIVE');

ALTER TABLE "RecipeBrandAdoption"
  ADD CONSTRAINT "RecipeBrandAdoption_no_overlap"
    EXCLUDE USING gist (
      "tenantId" WITH =,
      "companyId" WITH =,
      "brandId" WITH =,
      "recipeId" WITH =,
      tsrange("effectiveFrom", "effectiveTo", '[)') WITH &&
    ) WHERE (status = 'ACTIVE');

CREATE OR REPLACE FUNCTION public.guard_menu_recipe_assignment_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM public."MenuRecipeAssignment" existing
     WHERE existing.id <> NEW.id
       AND existing."tenantId" = NEW."tenantId"
       AND existing."companyId" = NEW."companyId"
       AND existing."menuItemId" = NEW."menuItemId"
       AND existing."scopeType" = NEW."scopeType"
       AND existing.status = 'ACTIVE'
       AND (
         (NEW."scopeType" = 'BRAND_DEFAULT' AND existing."brandId" = NEW."brandId")
         OR (NEW."scopeType" = 'LOCATION_OVERRIDE' AND existing."locationId" = NEW."locationId")
       )
       AND tsrange(existing."effectiveFrom", existing."effectiveTo", '[)')
           && tsrange(NEW."effectiveFrom", NEW."effectiveTo", '[)')
  ) THEN
    RAISE EXCEPTION 'MENU_RECIPE_ASSIGNMENT_OVERLAP' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_menu_recipe_assignment_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  recipe_record RECORD;
BEGIN
  IF NEW."scopeType" = 'LOCATION_OVERRIDE' AND NOT EXISTS (
    SELECT 1 FROM public."Location" location
     WHERE location.id = NEW."locationId"
       AND location."tenantId" = NEW."tenantId"
       AND location."companyId" = NEW."companyId"
       AND location."brandId" = NEW."brandId"
       AND location."locationType" = 'BRANCH'
  ) THEN
    RAISE EXCEPTION 'MENU_RECIPE_ASSIGNMENT_BRANCH_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT recipe.id AS recipe_id, recipe."brandId" AS recipe_brand_id,
         recipe.status AS recipe_status, version.status AS version_status
    INTO recipe_record
    FROM public."RecipeVersion" version
    JOIN public."Recipe" recipe
      ON recipe.id = version."recipeId"
     AND recipe."tenantId" = version."tenantId"
     AND recipe."companyId" = version."companyId"
   WHERE version.id = NEW."recipeVersionId"
     AND version."tenantId" = NEW."tenantId"
     AND version."companyId" = NEW."companyId";

  IF recipe_record.recipe_id IS NULL
     OR recipe_record.recipe_status <> 'ACTIVE'
     OR recipe_record.version_status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'MENU_RECIPE_ASSIGNMENT_RECIPE_NOT_PUBLISHED' USING ERRCODE = '23514';
  END IF;
  IF recipe_record.recipe_brand_id IS NOT NULL
     AND recipe_record.recipe_brand_id <> NEW."brandId" THEN
    RAISE EXCEPTION 'MENU_RECIPE_ASSIGNMENT_CROSS_BRAND_DENIED' USING ERRCODE = '23514';
  END IF;
  IF recipe_record.recipe_brand_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public."RecipeBrandAdoption" adoption
     WHERE adoption."tenantId" = NEW."tenantId"
       AND adoption."companyId" = NEW."companyId"
       AND adoption."brandId" = NEW."brandId"
       AND adoption."recipeId" = recipe_record.recipe_id
       AND adoption.status = 'ACTIVE'
       AND adoption."effectiveFrom" <= NEW."effectiveFrom"
       AND (adoption."effectiveTo" IS NULL
         OR (NEW."effectiveTo" IS NOT NULL AND adoption."effectiveTo" >= NEW."effectiveTo"))
  ) THEN
    RAISE EXCEPTION 'MENU_RECIPE_ASSIGNMENT_SHARED_RECIPE_NOT_ADOPTED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_menu_item_location_availability_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Location" location
     WHERE location.id = NEW."locationId"
       AND location."tenantId" = NEW."tenantId"
       AND location."companyId" = NEW."companyId"
       AND location."brandId" = NEW."brandId"
       AND location."locationType" = 'BRANCH'
  ) THEN
    RAISE EXCEPTION 'MENU_ITEM_AVAILABILITY_BRANCH_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_restaurant_menu_policy_command_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."locationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."Location" location
     WHERE location.id = NEW."locationId"
       AND location."tenantId" = NEW."tenantId"
       AND location."companyId" = NEW."companyId"
       AND location."brandId" = NEW."brandId"
       AND location."locationType" = 'BRANCH'
  ) THEN
    RAISE EXCEPTION 'RESTAURANT_MENU_POLICY_COMMAND_BRANCH_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF NEW."targetType" = 'RECIPE_BRAND_ADOPTION' AND NOT EXISTS (
    SELECT 1 FROM public."RecipeBrandAdoption" adoption
     WHERE adoption.id = NEW."targetId"
       AND adoption."tenantId" = NEW."tenantId"
       AND adoption."companyId" = NEW."companyId"
       AND adoption."brandId" = NEW."brandId"
  ) THEN
    RAISE EXCEPTION 'RESTAURANT_MENU_POLICY_COMMAND_TARGET_SCOPE_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."targetType" = 'MENU_RECIPE_ASSIGNMENT' AND NOT EXISTS (
    SELECT 1 FROM public."MenuRecipeAssignment" assignment
     WHERE assignment.id = NEW."targetId"
       AND assignment."tenantId" = NEW."tenantId"
       AND assignment."companyId" = NEW."companyId"
       AND assignment."brandId" = NEW."brandId"
       AND (NEW."locationId" IS NULL OR assignment."locationId" = NEW."locationId")
  ) THEN
    RAISE EXCEPTION 'RESTAURANT_MENU_POLICY_COMMAND_TARGET_SCOPE_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."targetType" = 'MENU_ITEM_LOCATION_AVAILABILITY' AND NOT EXISTS (
    SELECT 1 FROM public."MenuItemLocationAvailability" availability
     WHERE availability.id = NEW."targetId"
       AND availability."tenantId" = NEW."tenantId"
       AND availability."companyId" = NEW."companyId"
       AND availability."brandId" = NEW."brandId"
       AND (NEW."locationId" IS NULL OR availability."locationId" = NEW."locationId")
  ) THEN
    RAISE EXCEPTION 'RESTAURANT_MENU_POLICY_COMMAND_TARGET_SCOPE_INVALID' USING ERRCODE = '23514';
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
     OR NEW."scopeType" IS DISTINCT FROM OLD."scopeType"
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
         AND NEW."effectiveTo" IS NOT NULL
         AND NEW."effectiveTo" > NEW."effectiveFrom"
         AND (OLD."effectiveTo" IS NULL
           OR OLD."effectiveTo" IS NOT DISTINCT FROM NEW."effectiveTo"))
       OR (NEW.status = 'INACTIVE'
         AND OLD."effectiveFrom" > CURRENT_TIMESTAMP
         AND NEW."effectiveTo" IS NOT DISTINCT FROM OLD."effectiveTo")
     ) THEN
    RAISE EXCEPTION 'MENU_RECIPE_ASSIGNMENT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_effective_restaurant_policy_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'RESTAURANT_EFFECTIVE_POLICY_INITIAL_STATE_INVALID' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RESTAURANT_EFFECTIVE_POLICY_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF to_jsonb(NEW) - ARRAY['status','effectiveTo','updatedAt']
       IS DISTINCT FROM to_jsonb(OLD) - ARRAY['status','effectiveTo','updatedAt']
     OR OLD.status <> 'ACTIVE'
     OR NOT (
       (NEW.status = 'ACTIVE' AND OLD."effectiveTo" IS NULL
         AND NEW."effectiveTo" IS NOT NULL AND NEW."effectiveTo" > NEW."effectiveFrom")
       OR (NEW.status = 'INACTIVE'
         AND NEW."effectiveTo" IS NOT NULL
         AND NEW."effectiveTo" > NEW."effectiveFrom"
         AND (OLD."effectiveTo" IS NULL
           OR OLD."effectiveTo" IS NOT DISTINCT FROM NEW."effectiveTo"))
       OR (NEW.status = 'INACTIVE'
         AND OLD."effectiveFrom" > CURRENT_TIMESTAMP
         AND NEW."effectiveTo" IS NOT DISTINCT FROM OLD."effectiveTo")
     ) THEN
    RAISE EXCEPTION 'RESTAURANT_EFFECTIVE_POLICY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_recipe_brand_adoption_dependency()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF (NEW.status <> 'ACTIVE' OR NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo")
     AND EXISTS (
       SELECT 1
         FROM public."MenuRecipeAssignment" assignment
         JOIN public."RecipeVersion" version
           ON version.id = assignment."recipeVersionId"
          AND version."tenantId" = assignment."tenantId"
          AND version."companyId" = assignment."companyId"
        WHERE assignment."tenantId" = OLD."tenantId"
          AND assignment."companyId" = OLD."companyId"
          AND assignment."brandId" = OLD."brandId"
          AND version."recipeId" = OLD."recipeId"
          AND assignment.status = 'ACTIVE'
          AND (
            NEW.status <> 'ACTIVE'
            OR assignment."effectiveFrom" < NEW."effectiveFrom"
            OR NEW."effectiveTo" IS NULL
            OR assignment."effectiveTo" IS NULL
            OR assignment."effectiveTo" > NEW."effectiveTo"
          )
     ) THEN
    RAISE EXCEPTION 'RECIPE_BRAND_ADOPTION_HAS_DEPENDENT_ASSIGNMENT' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_recipe_brand_adoption_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Recipe" recipe
     WHERE recipe.id = NEW."recipeId"
       AND recipe."tenantId" = NEW."tenantId"
       AND recipe."companyId" = NEW."companyId"
       AND recipe."brandId" IS NULL
       AND recipe.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'RECIPE_BRAND_ADOPTION_REQUIRES_ACTIVE_SHARED_RECIPE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_consumption_brand_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_TABLE_NAME = 'Location' THEN
    IF NEW."brandId" IS NOT DISTINCT FROM OLD."brandId"
       AND NEW."locationType" IS NOT DISTINCT FROM OLD."locationType" THEN
      RETURN NEW;
    END IF;
  ELSIF NEW."brandId" IS NOT DISTINCT FROM OLD."brandId" THEN
      RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'Recipe' AND (
    EXISTS (SELECT 1 FROM public."RecipeBrandAdoption" adoption WHERE adoption."recipeId" = OLD.id)
    OR EXISTS (
      SELECT 1 FROM public."RecipeVersion" version
       WHERE version."recipeId" = OLD.id
         AND version.status IN ('PUBLISHED', 'SUPERSEDED')
    )
    OR EXISTS (
      SELECT 1 FROM public."MenuRecipeAssignment" assignment
      JOIN public."RecipeVersion" version ON version.id = assignment."recipeVersionId"
       WHERE version."recipeId" = OLD.id
    )
  ) THEN
    RAISE EXCEPTION 'RECIPE_BRAND_IDENTITY_IMMUTABLE_AFTER_CONSUMPTION_REFERENCE' USING ERRCODE = '55000';
  ELSIF TG_TABLE_NAME = 'MenuItem' AND (
    OLD."currentRecipeVersionId" IS NOT NULL
    OR EXISTS (SELECT 1 FROM public."MenuRecipeAssignment" assignment WHERE assignment."menuItemId" = OLD.id)
    OR EXISTS (SELECT 1 FROM public."MenuItemLocationAvailability" availability WHERE availability."menuItemId" = OLD.id)
    OR EXISTS (SELECT 1 FROM public."ServingDeclarationLine" line WHERE line."menuItemId" = OLD.id)
  ) THEN
    RAISE EXCEPTION 'MENU_ITEM_BRAND_IDENTITY_IMMUTABLE_AFTER_CONSUMPTION_REFERENCE' USING ERRCODE = '55000';
  ELSIF TG_TABLE_NAME = 'Location' AND (
    EXISTS (SELECT 1 FROM public."RestaurantConsumptionConfiguration" configuration WHERE configuration."locationId" = OLD.id)
    OR EXISTS (SELECT 1 FROM public."MenuRecipeAssignment" assignment WHERE assignment."locationId" = OLD.id)
    OR EXISTS (SELECT 1 FROM public."MenuItemLocationAvailability" availability WHERE availability."locationId" = OLD.id)
    OR EXISTS (SELECT 1 FROM public."RestaurantMenuPolicyCommand" command WHERE command."locationId" = OLD.id)
    OR EXISTS (SELECT 1 FROM public."ServingDeclaration" declaration WHERE declaration."locationId" = OLD.id)
  ) THEN
    RAISE EXCEPTION 'LOCATION_CONSUMPTION_SCOPE_IMMUTABLE_AFTER_REFERENCE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER "MenuRecipeAssignment_overlap_guard"
  BEFORE INSERT OR UPDATE ON "MenuRecipeAssignment"
  FOR EACH ROW EXECUTE FUNCTION public.guard_menu_recipe_assignment_overlap();
CREATE TRIGGER "MenuRecipeAssignment_scope_guard"
  BEFORE INSERT ON "MenuRecipeAssignment"
  FOR EACH ROW EXECUTE FUNCTION public.guard_menu_recipe_assignment_scope();
CREATE TRIGGER "MenuRecipeAssignment_transition_guard"
  BEFORE UPDATE OR DELETE ON "MenuRecipeAssignment"
  FOR EACH ROW EXECUTE FUNCTION public.guard_menu_recipe_assignment_transition();

CREATE TRIGGER "MenuItemLocationAvailability_transition_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "MenuItemLocationAvailability"
  FOR EACH ROW EXECUTE FUNCTION public.guard_effective_restaurant_policy_transition();
CREATE TRIGGER "MenuItemLocationAvailability_scope_guard"
  BEFORE INSERT ON "MenuItemLocationAvailability"
  FOR EACH ROW EXECUTE FUNCTION public.guard_menu_item_location_availability_scope();
CREATE TRIGGER "MenuItemLocationAvailability_no_truncate_guard"
  BEFORE TRUNCATE ON "MenuItemLocationAvailability"
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "RecipeBrandAdoption_transition_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "RecipeBrandAdoption"
  FOR EACH ROW EXECUTE FUNCTION public.guard_effective_restaurant_policy_transition();
CREATE TRIGGER "RecipeBrandAdoption_scope_guard"
  BEFORE INSERT ON "RecipeBrandAdoption"
  FOR EACH ROW EXECUTE FUNCTION public.guard_recipe_brand_adoption_scope();
CREATE TRIGGER "RecipeBrandAdoption_dependency_guard"
  BEFORE UPDATE OR DELETE ON "RecipeBrandAdoption"
  FOR EACH ROW EXECUTE FUNCTION public.guard_recipe_brand_adoption_dependency();
CREATE TRIGGER "RecipeBrandAdoption_no_truncate_guard"
  BEFORE TRUNCATE ON "RecipeBrandAdoption"
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "RestaurantMenuPolicyCommand_scope_guard"
  BEFORE INSERT ON "RestaurantMenuPolicyCommand"
  FOR EACH ROW EXECUTE FUNCTION public.guard_restaurant_menu_policy_command_scope();
CREATE TRIGGER "RestaurantMenuPolicyCommand_append_only_guard"
  BEFORE UPDATE OR DELETE ON "RestaurantMenuPolicyCommand"
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "RestaurantMenuPolicyCommand_no_truncate_guard"
  BEFORE TRUNCATE ON "RestaurantMenuPolicyCommand"
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_append_only_restaurant_consumption();
CREATE TRIGGER "Recipe_consumption_brand_identity_guard"
  BEFORE UPDATE OF "brandId" ON "Recipe"
  FOR EACH ROW EXECUTE FUNCTION public.guard_consumption_brand_identity();
CREATE TRIGGER "MenuItem_consumption_brand_identity_guard"
  BEFORE UPDATE OF "brandId" ON "MenuItem"
  FOR EACH ROW EXECUTE FUNCTION public.guard_consumption_brand_identity();
CREATE TRIGGER "Location_consumption_brand_identity_guard"
  BEFORE UPDATE OF "brandId", "locationType" ON "Location"
  FOR EACH ROW EXECUTE FUNCTION public.guard_consumption_brand_identity();

REVOKE ALL ON FUNCTION public.guard_menu_recipe_assignment_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_menu_item_location_availability_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_restaurant_menu_policy_command_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_effective_restaurant_policy_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_recipe_brand_adoption_dependency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_recipe_brand_adoption_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_consumption_brand_identity() FROM PUBLIC;

-- Conservative rollout-time backfill. It deliberately excludes shared recipes,
-- null-brand menu items, recursive/sub-recipe recipes, ambiguous output UOMs,
-- inactive/non-inventory ingredients, and missing direct item-to-base conversions.
-- Supplier prices and costing readiness are not consulted because they are not
-- quantity-derivation prerequisites.
WITH eligible AS (
  SELECT menu_item."tenantId", menu_item."companyId", menu_item."brandId",
         menu_item.id AS menu_item_id, version.id AS recipe_version_id,
         COALESCE(version."publishedByUserId", recipe."createdByUserId") AS actor_user_id
    FROM "MenuItem" menu_item
    JOIN "RecipeVersion" version
      ON version.id = menu_item."currentRecipeVersionId"
     AND version."tenantId" = menu_item."tenantId"
     AND version."companyId" = menu_item."companyId"
    JOIN "Recipe" recipe
      ON recipe.id = version."recipeId"
     AND recipe."tenantId" = version."tenantId"
     AND recipe."companyId" = version."companyId"
   WHERE menu_item.status = 'ACTIVE'
     AND menu_item."brandId" IS NOT NULL
     AND version.status = 'PUBLISHED'
     AND version."yieldQuantity" > 0
     AND version."servingQuantity" > 0
     AND version."yieldUomId" = version."servingUomId"
     AND recipe.status = 'ACTIVE'
     AND recipe."brandId" = menu_item."brandId"
     AND recipe."publishedVersionId" = version.id
     AND COALESCE(version."publishedByUserId", recipe."createdByUserId") IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM "User" actor
        WHERE actor.id = COALESCE(version."publishedByUserId", recipe."createdByUserId")
          AND actor."tenantId" = menu_item."tenantId"
     )
     AND EXISTS (SELECT 1 FROM "RecipeLine" line WHERE line."recipeVersionId" = version.id)
     AND NOT EXISTS (
       SELECT 1
         FROM "RecipeLine" line
         LEFT JOIN "Item" item
           ON item.id = line."itemId"
          AND item."tenantId" = line."tenantId"
          AND item."companyId" = line."companyId"
        WHERE line."recipeVersionId" = version.id
          AND (
            line."lineType" <> 'INGREDIENT'
            OR line."itemId" IS NULL
            OR line."subRecipeVersionId" IS NOT NULL
            OR item.id IS NULL
            OR item.status <> 'ACTIVE'
            OR item."trackInventory" = false
            OR (
              line."uomId" <> item."baseUomId"
              AND NOT EXISTS (
                SELECT 1 FROM "ItemUomConversion" conversion
                 WHERE conversion."itemId" = item.id
                   AND conversion."fromUomId" = line."uomId"
                   AND conversion."toUomId" = item."baseUomId"
                   AND conversion."conversionFactor" > 0
              )
            )
          )
     )
)
INSERT INTO "MenuRecipeAssignment" (
  id, "tenantId", "companyId", "brandId", "scopeType", "locationId",
  "menuItemId", "recipeVersionId", "effectiveFrom", "effectiveTo", status,
  reason, "createdByUserId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), eligible."tenantId", eligible."companyId", eligible."brandId",
       'BRAND_DEFAULT', NULL, eligible.menu_item_id, eligible.recipe_version_id,
       CURRENT_TIMESTAMP, NULL, 'ACTIVE',
       'Exact-brand rollout default from current published menu recipe',
       eligible.actor_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM eligible
 WHERE NOT EXISTS (
   SELECT 1 FROM "MenuRecipeAssignment" existing
    WHERE existing."tenantId" = eligible."tenantId"
      AND existing."companyId" = eligible."companyId"
      AND existing."brandId" = eligible."brandId"
      AND existing."menuItemId" = eligible.menu_item_id
      AND existing."scopeType" = 'BRAND_DEFAULT'
      AND existing.status = 'ACTIVE'
 );

DO $$
DECLARE
  eligible_default_count bigint;
  unresolved_current_pointer_count bigint;
BEGIN
  SELECT count(*) INTO eligible_default_count
    FROM "MenuRecipeAssignment"
   WHERE "scopeType" = 'BRAND_DEFAULT'
     AND reason = 'Exact-brand rollout default from current published menu recipe';

  SELECT count(*) INTO unresolved_current_pointer_count
    FROM "MenuItem" menu_item
   WHERE menu_item.status = 'ACTIVE'
     AND menu_item."currentRecipeVersionId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM "MenuRecipeAssignment" assignment
        WHERE assignment."tenantId" = menu_item."tenantId"
          AND assignment."companyId" = menu_item."companyId"
          AND assignment."menuItemId" = menu_item.id
          AND assignment."scopeType" = 'BRAND_DEFAULT'
          AND assignment.status = 'ACTIVE'
     );

  RAISE NOTICE 'BRAND_DEFAULT_BACKFILL_INSERTED=%', eligible_default_count;
  IF unresolved_current_pointer_count > 0 THEN
    RAISE WARNING 'BRAND_DEFAULT_BACKFILL_UNRESOLVED=%; keep affected branches blocked until explicitly resolved', unresolved_current_pointer_count;
  ELSE
    RAISE NOTICE 'BRAND_DEFAULT_BACKFILL_UNRESOLVED=0';
  END IF;
END $$;
