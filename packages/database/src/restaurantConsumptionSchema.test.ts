import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const schema = read("../prisma/schema.prisma");
const migration = read(
  "../prisma/migrations/20260811130000_restaurant_consumption_foundation/migration.sql",
);
const brandInheritanceMigration = read(
  "../prisma/migrations/20260811140000_brand_recipe_inheritance/migration.sql",
);

describe("DEC-0279 restaurant consumption database foundation", () => {
  test("adds source-neutral declarations, immutable derivation, and controlled posting", () => {
    for (const model of [
      "RestaurantConsumptionConfiguration",
      "MenuRecipeAssignment",
      "ServingDeclaration",
      "ServingDeclarationLine",
      "ServingIngredientSnapshot",
      "ConsumptionPosting",
      "ConsumptionPostingAllocation",
    ]) {
      expect(schema).toContain(`model ${model} {`);
      expect(migration).toContain(`CREATE TABLE "${model}"`);
    }
    expect(schema).toContain("CONSUMPTION_OUT");
    expect(migration).toContain("ServingDeclaration_one_active_coverage_key");
  });

  test("enforces exact scope, immutable terminal facts, and one-source movement lineage", () => {
    for (const control of [
      "RestaurantConsumptionConfiguration_issue_location_fkey",
      "MenuRecipeAssignment_menu_item_scope_fkey",
      "MenuRecipeAssignment_recipe_version_scope_fkey",
      "ServingDeclaration_configuration_scope_fkey",
      "ServingDeclarationLine_declaration_scope_fkey",
      "ServingIngredientSnapshot_line_scope_fkey",
      "ConsumptionPosting_declaration_scope_fkey",
      "ConsumptionPostingAllocation_posting_scope_fkey",
      "guard_serving_declaration_transition",
      "guard_serving_line_write",
      "guard_serving_snapshot_write",
      "guard_restaurant_configuration_transition",
      "guard_menu_recipe_assignment_transition",
      "guard_consumption_posting_transition",
      "guard_consumption_allocation_update",
      "guard_append_only_restaurant_consumption",
      "guard_consumption_movement_source",
    ])
      expect(migration).toContain(control);
    expect(migration).toContain("CONSUMPTION_MOVEMENT_SOURCE_INVALID");
    expect(migration).toContain("CONSUMPTION_REVERSAL_SOURCE_INVALID");
    expect(migration).toContain(
      'allocation."lotNumber" IS NOT DISTINCT FROM NEW."lotNumber"',
    );
    expect(migration).toContain(
      'original."quantityDeltaBaseUom" = -NEW."quantityDeltaBaseUom"',
    );
    expect(migration).toContain("RESTAURANT_CONSUMPTION_APPEND_ONLY");
    expect(migration).toContain(
      "RESTAURANT_CONSUMPTION_CONFIGURATION_INITIAL_STATE_INVALID",
    );
    expect(migration).toContain("SERVING_DECLARATION_INITIAL_STATE_INVALID");
    expect(migration).toContain(
      "OLD.status = 'RETURNED' AND NEW.status IN ('DRAFT','SUBMITTED','CANCELLED')",
    );
    expect(migration).toContain("CONSUMPTION_POSTING_INITIAL_STATE_INVALID");
    expect(migration).toContain(
      'BEFORE TRUNCATE ON "RestaurantConsumptionConfiguration"',
    );
    expect(migration).toContain(
      'BEFORE TRUNCATE ON "MenuRecipeAssignment"',
    );
    expect(migration).not.toContain(
      '"locationId" UUID NOT NULL,\n  "declarationId" UUID NOT NULL,\n  "lineNo" INTEGER NOT NULL',
    );
    expect(migration).toContain(
      '"locationId" UUID NOT NULL,\n  "declarationId" UUID NOT NULL,\n  "inventoryLocationId" UUID NOT NULL',
    );
  });

  test("keeps recipe consumption distinct from wastage and derives balances from the ledger", () => {
    expect(migration).toContain("NEW.\"movementType\" = 'CONSUMPTION_OUT'");
    expect(migration).toContain('NEW."quantityDeltaBaseUom" >= 0');
    expect(migration).toContain(
      "'TRANSFER_OUT', 'WASTAGE_OUT', 'CONSUMPTION_OUT'",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.apply_inventory_movement_to_balance()",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.apply_inventory_movement_to_balance() FROM PUBLIC",
    );
    expect(migration).toContain("posting.status = 'POSTING'");
    expect(migration).toContain("posting.status = 'REVERSING'");
    expect(migration).toContain(
      'allocation."quantityBaseUom" = abs(NEW."quantityDeltaBaseUom")',
    );
  });

  test("requires complete complimentary evidence and non-overlapping schedules", () => {
    expect(migration).toContain(
      'DROP CONSTRAINT "OperationalReasonCode_workflow_check"',
    );
    expect(migration).toContain("'RESTAURANT_CONSUMPTION'");
    expect(migration).toContain("btrim(COALESCE(\"complimentaryReason\", ''))");
    expect(migration).toContain(
      "btrim(COALESCE(\"complimentaryReference\", ''))",
    );
    expect(migration).toContain(
      '"disposition" = \'PAID\' AND "complimentaryReason" IS NULL AND "complimentaryReference" IS NULL',
    );
    expect(migration).toContain("RESTAURANT_CONSUMPTION_CONFIGURATION_OVERLAP");
    expect(migration).toContain("MENU_RECIPE_ASSIGNMENT_OVERLAP");
    expect(migration).toContain('tsrange(existing."effectiveFrom"');
  });
});

describe("brand-default recipe inheritance database contract", () => {
  test("models brand defaults, location overrides, branch availability, and shared adoption", () => {
    expect(schema).toContain("enum MenuRecipeAssignmentScope {");
    expect(schema).toContain("BRAND_DEFAULT");
    expect(schema).toContain("LOCATION_OVERRIDE");
    expect(schema).toContain("enum MenuItemLocationAvailabilityState {");
    expect(schema).toContain("AVAILABLE");
    expect(schema).toContain("UNAVAILABLE");
    expect(schema).toContain("model MenuItemLocationAvailability {");
    expect(schema).toContain("model RecipeBrandAdoption {");
    expect(schema).toContain("scopeType       MenuRecipeAssignmentScope");
    expect(schema).toContain("locationId      String?                   @db.Uuid");
    expect(schema).toContain(
      "recipeAssignment      MenuRecipeAssignment? @relation(fields: [recipeAssignmentId, tenantId, companyId]",
    );
  });

  test("preserves location rows as overrides and enforces exact brand scope", () => {
    expect(brandInheritanceMigration).toContain(
      'SET "scopeType" = \'LOCATION_OVERRIDE\'',
    );
    expect(brandInheritanceMigration).toContain(
      "MENU_RECIPE_EXISTING_OVERRIDE_SCOPE_REVIEW_REQUIRED",
    );
    expect(brandInheritanceMigration).toContain(
      "MenuRecipeAssignment_scope_shape_check",
    );
    expect(brandInheritanceMigration).toContain(
      "MenuRecipeAssignment_location_brand_scope_fkey",
    );
    expect(brandInheritanceMigration).toContain(
      "MenuRecipeAssignment_brand_exact_scope_fkey",
    );
    expect(brandInheritanceMigration).toContain(
      "MenuRecipeAssignment_menu_item_brand_scope_fkey",
    );
    expect(brandInheritanceMigration).toContain(
      "ServingDeclarationLine_assignment_exact_scope_fkey",
    );
    expect(brandInheritanceMigration).toContain(
      "MENU_RECIPE_ASSIGNMENT_CROSS_BRAND_DENIED",
    );
    expect(brandInheritanceMigration).toContain(
      "MENU_RECIPE_ASSIGNMENT_BRANCH_REQUIRED",
    );
    expect(brandInheritanceMigration).toContain(
      "MENU_ITEM_AVAILABILITY_BRANCH_REQUIRED",
    );
    expect(brandInheritanceMigration).toContain(
      "LEGACY_LOCATION_OVERRIDES_MIGRATED",
    );
    expect(brandInheritanceMigration).toContain(
      'location."locationType" = \'BRANCH\'',
    );
  });

  test("uses race-safe half-open non-overlap constraints at each resolution grain", () => {
    expect(brandInheritanceMigration).toContain(
      "CREATE EXTENSION IF NOT EXISTS btree_gist",
    );
    for (const constraint of [
      "MenuRecipeAssignment_brand_default_no_overlap",
      "MenuRecipeAssignment_location_override_no_overlap",
      "MenuItemLocationAvailability_no_overlap",
      "RecipeBrandAdoption_no_overlap",
    ]) {
      expect(brandInheritanceMigration).toContain(constraint);
    }
    expect(brandInheritanceMigration).toContain(
      "tsrange(\"effectiveFrom\", \"effectiveTo\", '[)') WITH &&",
    );
  });

  test("requires explicit shared-recipe adoption and append-only effective policy history", () => {
    expect(brandInheritanceMigration).toContain(
      "MENU_RECIPE_ASSIGNMENT_SHARED_RECIPE_NOT_ADOPTED",
    );
    expect(brandInheritanceMigration).toContain(
      "RECIPE_BRAND_ADOPTION_REQUIRES_ACTIVE_SHARED_RECIPE",
    );
    expect(brandInheritanceMigration).toContain(
      "guard_effective_restaurant_policy_transition",
    );
    expect(brandInheritanceMigration).toContain(
      "RESTAURANT_EFFECTIVE_POLICY_DELETE_FORBIDDEN",
    );
    expect(brandInheritanceMigration).toContain(
      'NEW."effectiveTo" IS NOT NULL',
    );
    expect(brandInheritanceMigration).toContain(
      "RECIPE_BRAND_ADOPTION_HAS_DEPENDENT_ASSIGNMENT",
    );
    expect(brandInheritanceMigration).toContain(
      "guard_consumption_brand_identity",
    );
    expect(brandInheritanceMigration).toContain(
      'BEFORE TRUNCATE ON "MenuItemLocationAvailability"',
    );
    expect(brandInheritanceMigration).toContain(
      'BEFORE TRUNCATE ON "RecipeBrandAdoption"',
    );
  });

  test("backfills only conservative exact-brand quantity-ready defaults at rollout time", () => {
    expect(brandInheritanceMigration).toContain(
      'menu_item."currentRecipeVersionId"',
    );
    expect(brandInheritanceMigration).toContain(
      "recipe.\"brandId\" = menu_item.\"brandId\"",
    );
    expect(brandInheritanceMigration).toContain(
      'recipe."publishedVersionId" = version.id',
    );
    expect(brandInheritanceMigration).toContain(
      "version.status = 'PUBLISHED'",
    );
    expect(brandInheritanceMigration).toContain(
      'version."yieldUomId" = version."servingUomId"',
    );
    expect(brandInheritanceMigration).toContain(
      "line.\"lineType\" <> 'INGREDIENT'",
    );
    expect(brandInheritanceMigration).toContain(
      "conversion.\"conversionFactor\" > 0",
    );
    expect(brandInheritanceMigration).toContain(
      "BRAND_DEFAULT_BACKFILL_UNRESOLVED",
    );
    expect(brandInheritanceMigration).toContain(
      "keep affected branches blocked until explicitly resolved",
    );
    expect(brandInheritanceMigration).not.toContain("SupplierPriceHistory");
    expect(brandInheritanceMigration).not.toContain("InventoryMovement");
  });

  test("records immutable idempotent menu-policy commands and outcome lineage", () => {
    expect(schema).toContain("enum RestaurantMenuPolicyCommandType {");
    for (const commandType of [
      "ADOPT_SHARED_RECIPE",
      "SET_BRAND_DEFAULT",
      "SET_LOCATION_OVERRIDE",
      "SET_LOCATION_AVAILABILITY",
      "END_OVERRIDE",
      "REVERT",
      "CANCEL_FUTURE",
      "ROLLOUT_SUCCESSOR",
    ]) {
      expect(schema).toContain(commandType);
    }
    expect(brandInheritanceMigration).toContain(
      'OLD."effectiveFrom" > CURRENT_TIMESTAMP',
    );
    expect(
      brandInheritanceMigration.match(
        /OLD\."effectiveFrom" > CURRENT_TIMESTAMP/g,
      ),
    ).toHaveLength(2);
    expect(schema).toContain("model RestaurantMenuPolicyCommand {");
    expect(schema).toContain("commandType         RestaurantMenuPolicyCommandType");
    expect(schema).toContain("outcome             Json");
    expect(schema).toContain(
      '@@unique([tenantId, companyId, brandId, idempotencyKey], map: "RestaurantMenuPolicyCommand_scoped_idempotency_key")',
    );

    expect(brandInheritanceMigration).toContain(
      'CREATE TABLE "RestaurantMenuPolicyCommand"',
    );
    expect(brandInheritanceMigration).toContain(
      "RestaurantMenuPolicyCommand_request_hash_check",
    );
    expect(brandInheritanceMigration).toContain(
      "RestaurantMenuPolicyCommand_target_shape_check",
    );
    expect(brandInheritanceMigration).toContain(
      "RestaurantMenuPolicyCommand_rollout_preview_check",
    );
    expect(brandInheritanceMigration).toContain(
      "RestaurantMenuPolicyCommand_scoped_idempotency_key",
    );
    expect(brandInheritanceMigration).toContain(
      "RestaurantMenuPolicyCommand_location_brand_scope_fkey",
    );
    expect(brandInheritanceMigration).toContain(
      "RESTAURANT_MENU_POLICY_COMMAND_TARGET_SCOPE_INVALID",
    );
    expect(brandInheritanceMigration).toContain(
      "RestaurantMenuPolicyCommand_append_only_guard",
    );
    expect(brandInheritanceMigration).toContain(
      'BEFORE TRUNCATE ON "RestaurantMenuPolicyCommand"',
    );
  });

  test("retains resolved policy identifiers in immutable JSON snapshots", () => {
    expect(schema).toContain("derivationSnapshot   Json?");
    expect(schema).toContain("outcome             Json");
    expect(migration).toContain("guard_serving_declaration_transition");
    expect(migration).toContain("SERVING_DECLARATION_FACT_IMMUTABLE");
  });
});
