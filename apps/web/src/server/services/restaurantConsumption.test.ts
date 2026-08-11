import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const service = readFileSync(
  new URL("./restaurantConsumption.ts", import.meta.url),
  "utf8",
);
const editor = readFileSync(
  path.resolve(__dirname, "../../components/ServingDeclarationEditor.tsx"),
  "utf8",
);
const settingsForms = readFileSync(
  path.resolve(
    __dirname,
    "../../components/RestaurantConsumptionSettingsForms.tsx",
  ),
  "utf8",
);
const listPage = readFileSync(
  path.resolve(__dirname, "../../app/(app)/servings/page.tsx"),
  "utf8",
);
const detailPage = readFileSync(
  path.resolve(__dirname, "../../app/(app)/servings/[id]/page.tsx"),
  "utf8",
);
const settingsPage = readFileSync(
  path.resolve(__dirname, "../../app/(app)/servings/settings/page.tsx"),
  "utf8",
);
const reviewPage = readFileSync(
  path.resolve(__dirname, "../../app/(app)/servings/review/page.tsx"),
  "utf8",
);
const workspaceTabs = readFileSync(
  path.resolve(__dirname, "../../components/ServingsWorkspaceTabs.tsx"),
  "utf8",
);
const exportRoute = readFileSync(
  path.resolve(__dirname, "../../app/(app)/servings/export/route.ts"),
  "utf8",
);
const stockCounts = readFileSync(
  new URL("./stockCounts.ts", import.meta.url),
  "utf8",
);

describe("DEC-0279 restaurant servings and controlled consumption", () => {
  test("keeps fact verification separate from inventory posting with live SOD and MFA", () => {
    expect(service).toContain("SERVING_DECLARATION_SELF_VERIFICATION_DENIED");
    expect(service).toContain("SERVING_DECLARATION_SELF_POST_DENIED");
    expect(service).toContain("serving_declaration.verify");
    expect(service).toContain("serving_consumption.post");
    expect(service).toContain("lockLiveInventoryActionAuthority");
    expect(service).toContain("assertPrivilegedMfaForAction");
    const verification = service.slice(
      service.indexOf("export async function verifyServingDeclaration"),
      service.indexOf("export async function returnServingDeclaration"),
    );
    expect(verification).not.toContain("postInventoryMovementInTransaction");
  });

  test("posts all-or-zero FEFO consumption through the immutable ledger and supports full reversal", () => {
    expect(service).toContain('movementType: "CONSUMPTION_OUT"');
    expect(service).toContain('movementType: "REVERSAL"');
    expect(service).toContain(
      'ORDER BY "itemId", "expiryDate" ASC NULLS LAST, "lotKey", id',
    );
    expect(service).not.toContain(
      'ORDER BY "itemId", "expiryDate" ASC NULLS LAST, "lotKey", id\n       FOR UPDATE',
    );
    expect(service).toContain("CONSUMPTION_STOCK_INSUFFICIENT");
    expect(service).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(service).toContain("CONSUMPTION_SNAPSHOT_HASH_INVALID");
    expect(service).toContain("lockInventoryLocationsForPosting");
    expect(service).toContain("rounded6(total.quantity)");
    expect(service).toContain("cancelVerifiedServingDeclaration");
    expect(service).toContain('status: { in: ["REVERSED", "CANCELLED"] }');
    expect(service).toContain("CONSUMPTION_POST_AFTER_COUNT_CUTOFF_DENIED");
    expect(service).toContain("CONSUMPTION_POST_CLOSED_PERIOD_DENIED");
    expect(stockCounts).toContain(
      "assertNoClosedServicePeriodAwaitingConsumptionPosting",
    );
    expect(stockCounts).toContain("STOCK_COUNT_PENDING_SERVING_CONSUMPTION");
  });

  test("preserves active menu facts while missing recipes fail derivation closed", () => {
    const catalog = service.slice(
      service.indexOf("export async function listRestaurantConsumptionCatalog"),
      service.indexOf("export async function configureRestaurantConsumption"),
    );
    expect(catalog).not.toContain("recipeAssignments:");
    expect(service).toContain("MENU_RECIPE_ASSIGNMENT_MISSING");
    expect(service).toContain('status: "DERIVATION_BLOCKED"');
    expect(service).toContain("readinessBlockers: blockers");
  });

  test("requires complete complimentary evidence and supports editable drafts and corrected revisions", () => {
    expect(service).toContain("COMPLIMENTARY_REASON_REQUIRED");
    expect(service).toContain("COMPLIMENTARY_REFERENCE_REQUIRED");
    expect(service).toContain("updateServingDeclarationDraft");
    expect(service).toContain("createServingCorrection");
    expect(detailPage).toContain("Create corrected revision");
    expect(detailPage).toContain("Edit draft");
    expect(service).toContain("replay.requestHash !== requestHash");
    expect(service).toContain("verifiedByUserId: null");
    expect(service).toContain(
      "fullCoverageWhere(input.coverageStartAt, input.coverageEndAt)",
    );
    expect(detailPage).toContain("Cancel verified facts");
  });

  test("provides a searchable all-item editor and versioned branch configuration", () => {
    expect(editor).toContain('role="combobox"');
    expect(editor).toContain("Select or search active menu items");
    expect(editor).toContain("Complimentary reason");
    expect(settingsForms).toContain("Per shift with daily rollup");
    expect(settingsForms).toContain("Service periods");
    expect(settingsPage).toContain("Menu readiness register");
    expect(settingsPage).toContain("Create branch configuration version");
    expect(settingsPage).toContain("activationReadiness.blockers");
    expect(service).toContain("restaurantConsumptionConfigurationReadiness");
    expect(service).toContain("RECIPE_BRAND_SCOPE_DENIED");
  });

  test("separates declarations, controlled review, and branch configuration by live permission", () => {
    expect(workspaceTabs).toContain("Serving Declarations");
    expect(workspaceTabs).toContain("Review & Posting");
    expect(workspaceTabs).toContain("Branch Configuration");
    expect(workspaceTabs).toContain("permissions.consumptionVerify");
    expect(workspaceTabs).toContain("permissions.consumptionPost");
    expect(listPage).toContain('active="declarations"');
    expect(reviewPage).toContain('active="review"');
    expect(settingsPage).toContain('active="configuration"');
    expect(reviewPage).toContain("getGrantedPermissionCodes");
    expect(reviewPage).toContain("Needs verification");
    expect(reviewPage).toContain("Ready to post");
  });

  test("shows exact-branch configuration read-only while keeping all mutations admin-gated", () => {
    expect(service).toContain("permissions.consumptionView");
    expect(settingsPage).toContain("Effective branch configuration");
    expect(settingsPage).toContain("READ ONLY");
    expect(settingsPage).toContain("canConfigureConsumption");
    expect(settingsPage).toContain("canOpenMenuPolicy");
    expect(settingsPage).toContain("an authorized administrator");
    expect(service).toContain(
      "await requirePermission(session, permissions.consumptionConfigure)",
    );
    expect(listPage).toContain("View branch configuration");
  });

  test("places the workflow under Restaurant Ops with clear register, detail, and readiness states", () => {
    expect(listPage).toContain('activeNav="servings"');
    expect(listPage).toContain("Servings & Consumption");
    expect(listPage).toContain(
      "Consumption posting is not configured for this branch",
    );
    expect(detailPage).toContain("Expected ingredient consumption");
    expect(detailPage).toContain("not independent physical actual evidence");
    expect(detailPage).toContain("Activity and audit history");
    expect(detailPage).toContain("Immutable FEFO lot allocations");
    expect(listPage).toContain("Export expected consumption");
    expect(exportRoute).toContain(
      "Recipe-derived expected/book consumption; not independent physical actual consumption",
    );
  });

  test("inherits brand menu defaults while location unavailability and overrides remain deterministic", () => {
    expect(service).toContain("resolveEffectiveMenuRecipeAssignment");
    expect(service).toContain('scopeType: "BRAND_DEFAULT"');
    expect(service).toContain('scopeType: "LOCATION_OVERRIDE"');
    expect(service.indexOf("if (unavailableDuringCoverage)")).toBeLessThan(
      service.indexOf("const locationOverride"),
    );
    expect(service.indexOf("const locationOverride")).toBeLessThan(
      service.indexOf("const brandDefault"),
    );
    expect(service).toContain("MENU_ITEM_LOCATION_UNAVAILABLE");
    expect(service).toContain("SHARED_RECIPE_BRAND_ADOPTION_REQUIRED");
    expect(service).toContain("MENU_RECIPE_BRAND_SCOPE_DENIED");
    expect(service).toContain(
      "MENU_RECIPE_ASSIGNMENT_EFFECTIVE_RANGE_CONFLICT",
    );
    expect(service).toContain(
      "if (replay) return { record: replay, predecessor: null, replayed: true }",
    );
    expect(service).toContain("pg_advisory_xact_lock");
    expect(service).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(service).toContain('locationType: "BRANCH"');
  });

  test("preserves offered facts while excluding unavailable items and pins resolved provenance", () => {
    const catalog = service.slice(
      service.indexOf("export async function listRestaurantConsumptionCatalog"),
      service.indexOf("export async function configureRestaurantConsumption"),
    );
    expect(catalog).toContain('readiness.offerState !== "UNAVAILABLE"');
    expect(catalog).toContain("quantityReadiness: readiness.quantityReadiness");
    expect(catalog).toContain("quantityBlockers: readiness.quantityBlockers");
    expect(catalog).toContain("resolutionSource");
    expect(catalog).toContain("recipeVersionId");
    expect(service).toContain("recipeAssignmentId: assignment.id");
    expect(service).toContain("recipeVersionId: assignment.recipeVersionId");
    expect(service).toContain(
      "recipeBrandAdoptionId: resolution.brandAdoptionId",
    );
    expect(service).toContain('version: "DEC-0280-v1"');
    expect(service).toContain("coverageStartAt: locked.coverageStartAt");
    expect(service).toContain("coverageEndAt: locked.coverageEndAt");
    expect(service).toContain("RECIPE_COST_BASIS_PENDING");
    const create = service.slice(
      service.indexOf("export async function createServingDeclaration"),
      service.indexOf("export async function updateServingDeclaration"),
    );
    expect(create).toContain(
      'resolution.blockerCode === "MENU_ITEM_LOCATION_UNAVAILABLE"',
    );
    expect(create).not.toContain(
      "if (resolution.blockerCode) throw new Error(resolution.blockerCode)",
    );
  });

  test("provides controlled audited brand defaults, branch exceptions, and shared adoption", () => {
    expect(service).toContain("assignBrandMenuRecipeDefault");
    expect(service).toContain("assignLocationMenuRecipeOverride");
    expect(service).toContain("setMenuItemLocationAvailability");
    expect(service).toContain("adoptSharedRecipeForBrand");
    expect(service).toContain("endLocationMenuRecipeOverride");
    expect(service).toContain("cancelFutureRestaurantMenuPolicy");
    expect(service).toContain("permissions.menuRecipeAdopt");
    expect(service).toContain("permissions.menuRecipeBranchException");
    expect(service).toContain("assertLiveMenuRecipeAuthority");
    expect(service).toContain("assertMenuPolicyMfa");
    expect(service).toContain("restaurantMenuPolicyCommand.create");
    expect(service).toContain("RESTAURANT_MENU_POLICY_IDEMPOTENCY_CONFLICT");
    expect(service).toContain("parseCompanyLocalDateTime");
    expect(service).toContain(
      "restaurant_consumption.brand_menu_recipe_default_assigned",
    );
    expect(service).toContain(
      "restaurant_consumption.location_menu_recipe_override_assigned",
    );
    expect(service).toContain(
      "restaurant_consumption.menu_item_location_availability_changed",
    );
    expect(service).toContain(
      "restaurant_consumption.shared_recipe_adopted_for_brand",
    );
    expect(service).toContain(
      "restaurant_consumption.location_menu_recipe_override_ended",
    );
    expect(service).toContain(
      "restaurant_consumption.future_menu_policy_cancelled",
    );
    expect(service).toContain('sourceDecisionId: "DEC-0280"');
  });
});
