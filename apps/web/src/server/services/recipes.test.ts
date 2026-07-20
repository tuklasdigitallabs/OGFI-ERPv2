import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import {
  filterActualConsumptionRows,
  filterFoodCostAnalysisRows,
  filterRecipeCostingSummaries,
  convertRecipeQuantityToPriceUom,
  pickEffectiveSupplierUnitPrice,
  summarizeActualConsumptionRows,
  summarizeFoodCostAnalysisRows,
  transitionMenuPriceDecision,
  transitionRecipeVersion
} from "./recipes";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  userRoleAssignment: {
    findMany: vi.fn()
  }
}));
const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn()
}));

vi.mock("@ogfi/database", () => ({
  prisma: mockPrisma
}));

vi.mock("./context", async () => {
  const actual = await vi.importActual<typeof import("./context")>("./context");
  return {
    ...actual,
    requireSessionContext: mockContext.requireSessionContext
  };
});

const serviceSource = readFileSync(new URL("./recipes.ts", import.meta.url), "utf8");
const detailPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/recipes/[id]/page.tsx"),
  "utf8"
);
const listPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/recipes/page.tsx"),
  "utf8"
);
const recipeCreatePageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/recipes/new/page.tsx"),
  "utf8"
);
const recipeRevisionPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/recipes/[id]/revise/page.tsx"),
  "utf8"
);
const analysisDrilldownSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/recipes/analysis/page.tsx"),
  "utf8"
);
const recipeExportRouteSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/recipes/export/route.ts"),
  "utf8"
);
const recipeRevisionWorkbookRouteSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/recipes/[id]/revision-template/route.ts"),
  "utf8"
);
const analysisExportRouteSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/recipes/analysis/export/route.ts"),
  "utf8"
);
const schemaSource = readFileSync(
  path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
  "utf8"
);
const salesImportMigration = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20260703103000_phase2_sales_import_food_cost_foundation/migration.sql"
  ),
  "utf8"
);

const session = {
  user: {
    id: "00000000-0000-4000-8000-000000000202",
    email: "costing.manager@example.test",
    displayName: "Costing Manager"
  },
  context: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    companyName: "One Gourmet Foods Inc.",
    brandId: "00000000-0000-4000-8000-000000000003",
    brandName: "Yakiniku Like",
    locationId: "00000000-0000-4000-8000-000000000004",
    locationName: "SM North Edsa",
    locationType: "BRANCH"
  },
  permissionCodes: [permissions.recipePublish, permissions.menuPriceDecide]
};

function recipePublishForm() {
  const form = new FormData();
  form.set("recipeVersionId", "00000000-0000-4000-8000-000000000901");
  form.set("action", "PUBLISH");
  form.set("reason", "Approved costing ready for branch rollout.");
  form.set("evidenceReference", "COSTING-PACK-901");
  form.set("idempotencyKey", "recipe-publish-901");
  return form;
}

function menuPriceApplyForm() {
  const form = new FormData();
  form.set("menuPriceDecisionId", "00000000-0000-4000-8000-000000000902");
  form.set("action", "APPLY");
  form.set("reason", "Approved price change effective next menu cycle.");
  form.set("evidenceReference", "PRICE-PACK-902");
  form.set("idempotencyKey", "menu-price-apply-902");
  return form;
}

describe("Phase 2 recipe and food-cost foundations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockReset();
    mockContext.requireSessionContext.mockResolvedValue(session);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.recipePublish
              }
            },
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.menuPriceDecide
              }
            }
          ]
        }
      }
    ]);
  });

  it("adds scoped POS-sales import tables for theoretical food-cost analysis", () => {
    expect(schemaSource).toContain("model RestaurantSalesImportBatch");
    expect(schemaSource).toContain("model RestaurantSalesImportLine");
    expect(schemaSource).toContain("tenantId");
    expect(schemaSource).toContain("companyId");
    expect(schemaSource).toContain("brandId");
    expect(schemaSource).toContain("locationId");
    expect(salesImportMigration).toContain(
      "RestaurantSalesImportBatch_companyId_locationId_businessDate_sourceSystem_importRef_key"
    );
    expect(salesImportMigration).toContain(
      "RestaurantSalesImportLine_batchId_menuItemId_salesChannel_key"
    );
  });

  it("keeps sales analysis report-only while deriving actuals from the inventory ledger", () => {
    expect(serviceSource).toContain("getFoodCostAnalysisDashboard");
    expect(serviceSource).toContain("buildRecipeCostingExportRows");
    expect(serviceSource).toContain("buildFoodCostAnalysisExportRows");
    expect(serviceSource).toContain("prisma.restaurantSalesImportLine.findMany");
    expect(serviceSource).toContain('batch: { status: "POSTED" }');
    expect(serviceSource).toContain("prisma.inventoryMovement.findMany");
    expect(serviceSource).toContain("actualConsumptionMovementTypes");
    expect(serviceSource).toContain("? \"WITHIN_TARGET\"");
    expect(serviceSource).toContain("WASTAGE_OUT");
    expect(serviceSource).toContain("ADJUSTMENT_OUT");
    expect(serviceSource).toContain("COUNT_VARIANCE_OUT");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("inventoryBalance.update");
    expect(serviceSource).not.toContain("finance.");
    expect(serviceSource).not.toContain("journalEntry");
  });

  it("adds controlled recipe-version workflow commands without inventory or finance mutation", () => {
    expect(serviceSource).toContain("transitionRecipeVersion");
    expect(serviceSource).toContain("recipeVersionWorkflowSchema");
    expect(serviceSource).toContain("assertPhase2WorkflowTransitionAllowed");
    expect(serviceSource).toContain("requirePermission(session, transition.permissionCode)");
    expect(serviceSource).toContain("RECIPE_VERSION_SELF_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("RECIPE_VERSION_TRANSITION_CONFLICT");
    expect(serviceSource).toContain("txAny.recipeVersionTransition.create");
    expect(serviceSource).toContain("eventType: `recipe_version.${transition.action.toLowerCase()}`");
    expect(serviceSource).toContain(
      "recipe_version_transition_only_no_inventory_or_finance_mutation"
    );
    expect(serviceSource).toContain("currentVersionId: current.id");
    expect(serviceSource).toContain("publishedVersionId: current.id");
    expect(serviceSource).not.toContain("menuPrice.update({");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("inventoryBalance.update");
    expect(serviceSource).not.toContain("generalLedger");
  });

  it("publishes approved recipe versions through transition, audit, and active-version pointer updates", async () => {
    const currentVersion = {
      id: "00000000-0000-4000-8000-000000000901",
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      recipeId: "00000000-0000-4000-8000-000000000911",
      status: "APPROVED",
      createdByUserId: "00000000-0000-4000-8000-000000000101",
      approvedAt: new Date("2026-07-05T00:00:00.000Z"),
      approvedByUserId: "00000000-0000-4000-8000-000000000203",
      publishedAt: null,
      publishedByUserId: null,
      effectiveFrom: null,
      recipe: {
        id: "00000000-0000-4000-8000-000000000911",
        brandId: session.context.brandId,
        recipeCode: "YL-KARUBI-SET"
      }
    };
    const updatedVersion = {
      ...currentVersion,
      status: "PUBLISHED",
      publishedAt: new Date("2026-07-06T00:00:00.000Z"),
      publishedByUserId: session.user.id
    };
    const tx = {
      recipeVersion: {
        findFirst: vi.fn().mockResolvedValue(currentVersion),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedVersion)
      },
      recipeVersionTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      },
      recipe: {
        update: vi.fn().mockResolvedValue({})
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(transitionRecipeVersion(recipePublishForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000901"
    );

    expect(tx.recipeVersion.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: currentVersion.id,
          status: "APPROVED"
        },
        data: expect.objectContaining({
          status: "PUBLISHED",
          publishedByUserId: session.user.id
        })
      })
    );
    expect(tx.recipeVersion.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          recipeId: currentVersion.recipeId,
          id: { not: currentVersion.id },
          status: "PUBLISHED"
        },
        data: expect.objectContaining({
          status: "SUPERSEDED"
        })
      })
    );
    expect(tx.recipe.update).toHaveBeenCalledWith({
      where: { id: currentVersion.recipeId },
      data: {
        currentVersionId: currentVersion.id,
        publishedVersionId: currentVersion.id
      }
    });
    expect(tx.recipeVersionTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipeVersionId: currentVersion.id,
          action: "PUBLISH",
          fromStatus: "APPROVED",
          toStatus: "PUBLISHED",
          actorUserId: session.user.id,
          approvedByUserId: session.user.id,
          reason: "Approved costing ready for branch rollout.",
          evidenceReference: "COSTING-PACK-901",
          idempotencyKey: "recipe-publish-901"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "recipe_version.publish",
          entityType: "RecipeVersion",
          entityId: currentVersion.id,
          metadata: expect.objectContaining({
            recipeCode: "YL-KARUBI-SET",
            action: "PUBLISH",
            boundary: "recipe_version_transition_only_no_inventory_or_finance_mutation"
          })
        })
      })
    );
  });

  it("adds controlled draft recipe creation without publishing or source mutation", () => {
    expect(serviceSource).toContain("createDraftRecipe");
    expect(serviceSource).toContain("createDraftRecipeSchema");
    expect(serviceSource).toContain("parseDraftRecipeLines");
    expect(serviceSource).toContain("permissions.recipeManage");
    expect(serviceSource).toContain("RECIPE_LINES_REQUIRED");
    expect(serviceSource).toContain("RECIPE_CODE_DUPLICATE");
    expect(serviceSource).toContain("recipe.draft_created");
    expect(serviceSource).toContain(
      "recipe_draft_create_only_no_inventory_menu_price_pos_or_finance_mutation"
    );
    expect(serviceSource).toContain("versions: {");
    expect(serviceSource).toContain('status: "DRAFT"');
    expect(serviceSource).toContain("lines: {");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("restaurantSalesImportLine.create");
    expect(serviceSource).not.toContain("journalEntry");
  });

  it("adds controlled recipe revision drafts and archive safeguards", () => {
    expect(serviceSource).toContain("createRecipeRevisionDraft");
    expect(serviceSource).toContain("createRecipeRevisionDraftSchema");
    expect(serviceSource).toContain("subRecipes: subRecipes.map");
    expect(serviceSource).toContain("subRecipeVersion");
    expect(serviceSource).toContain("Linked sub-recipe cost is not flattened");
    expect(serviceSource).toContain("parseRevisionLineOverrides");
    expect(serviceSource).toContain("parseRevisionAddedLines");
    expect(serviceSource).toContain("parseRevisionAddedSubRecipeLines");
    expect(serviceSource).toContain("parseRevisionSortOrder");
    expect(serviceSource).toContain("buildRecipeRevisionWorkbookRows");
    expect(serviceSource).toContain("Template row only");
    expect(serviceSource).toContain("Linked sub-recipes remain link-only");
    expect(serviceSource).toContain("permissions.recipeManage");
    expect(serviceSource).toContain("supersedesVersionId: sourceVersion.id");
    expect(serviceSource).toContain("RECIPE_DUPLICATE_LINE_NOT_ALLOWED");
    expect(serviceSource).toContain("RECIPE_LINE_SORT_ORDER_INVALID");
    expect(serviceSource).toContain("addedLineCount");
    expect(serviceSource).toContain("removedLineCount");
    expect(serviceSource).toContain("updatedLineCount");
    expect(serviceSource).toContain("reorderedLineCount");
    expect(serviceSource).toContain("addedSubRecipeLineCount");
    expect(serviceSource).toContain("RECIPE_SUB_RECIPE_VERSION_NOT_FOUND");
    expect(serviceSource).toContain('lineType: "SUB_RECIPE"');
    expect(serviceSource).toContain("RECIPE_OPEN_VERSION_EXISTS");
    expect(serviceSource).toContain("recipe.revision_draft_created");
    expect(serviceSource).toContain(
      "recipe_revision_draft_only_no_inventory_menu_price_pos_or_finance_mutation"
    );
    expect(serviceSource).toContain("archiveRecipe");
    expect(serviceSource).toContain("archiveRecipeSchema");
    expect(serviceSource).toContain("permissions.recipeArchive");
    expect(serviceSource).toContain("RECIPE_OPEN_VERSION_BLOCKS_ARCHIVE");
    expect(serviceSource).toContain("recipe.archived");
    expect(serviceSource).toContain(
      "recipe_archive_only_no_inventory_menu_price_pos_or_finance_mutation"
    );
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("restaurantSalesImportLine.create");
    expect(serviceSource).not.toContain("journalEntry");
  });

  it("adds separate controlled menu-price decisions without mutating recipes or operational sources", () => {
    expect(serviceSource).toContain("createMenuPriceDecision");
    expect(serviceSource).toContain("transitionMenuPriceDecision");
    expect(serviceSource).toContain("menuPriceDecisionSchema");
    expect(serviceSource).toContain("MENU_PRICE_DECISION");
    expect(serviceSource).toContain("MENU_PRICE_DECISION_SELF_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("txAny.operationalStatusTransition.create");
    expect(serviceSource).toContain("menu_price_decision_only_no_recipe_inventory_pos_or_finance_mutation");
    expect(serviceSource).toContain("menu_price_apply_inserts_effective_dated_price_only");
    expect(serviceSource).toContain("txAny.menuPrice.create");
    expect(serviceSource).toContain("txAny.menuPrice.updateMany");
    expect(serviceSource).not.toContain("menuPrice.update({");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("restaurantSalesImportLine.create");
    expect(serviceSource).not.toContain("journalEntry");
  });

  it("applies menu-price decisions by superseding old price rows and inserting an effective-dated price", async () => {
    const currentDecision = {
      id: "00000000-0000-4000-8000-000000000902",
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      menuItemId: "00000000-0000-4000-8000-000000000912",
      requestedPrice: "459",
      currencyCode: "PHP",
      effectiveFrom: new Date("2026-07-10T00:00:00.000Z"),
      effectiveTo: null,
      status: "APPROVED",
      requestedByUserId: "00000000-0000-4000-8000-000000000101",
      approvedAt: new Date("2026-07-05T00:00:00.000Z"),
      approvedByUserId: "00000000-0000-4000-8000-000000000203",
      appliedAt: null,
      appliedByUserId: null
    };
    const updatedDecision = {
      ...currentDecision,
      status: "APPLIED",
      appliedAt: new Date("2026-07-06T00:00:00.000Z"),
      appliedByUserId: session.user.id
    };
    const tx = {
      menuPriceDecision: {
        findFirst: vi.fn().mockResolvedValue(currentDecision),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedDecision)
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      },
      menuPrice: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "00000000-0000-4000-8000-000000000913",
            effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
            effectiveTo: null
          }
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({})
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(transitionMenuPriceDecision(menuPriceApplyForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000902"
    );

    expect(tx.menuPriceDecision.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: currentDecision.id,
          status: "APPROVED"
        },
        data: expect.objectContaining({
          status: "APPLIED",
          appliedByUserId: session.user.id,
          reason: "Approved price change effective next menu cycle.",
          evidenceReference: "PRICE-PACK-902"
        })
      })
    );
    expect(tx.menuPrice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "00000000-0000-4000-8000-000000000913",
          effectiveTo: null
        },
        data: {
          effectiveTo: currentDecision.effectiveFrom,
          status: "SUPERSEDED"
        }
      })
    );
    expect(tx.menuPrice.create).toHaveBeenCalledWith({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        menuItemId: currentDecision.menuItemId,
        locationId: currentDecision.locationId,
        decisionId: currentDecision.id,
        status: "APPLIED",
        currencyCode: "PHP",
        price: "459",
        effectiveFrom: currentDecision.effectiveFrom,
        effectiveTo: null
      }
    });
    expect(tx.operationalStatusTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "MenuPriceDecision",
          targetEntityId: currentDecision.id,
          action: "APPLY",
          fromStatus: "APPROVED",
          toStatus: "APPLIED",
          actorUserId: session.user.id,
          reason: "Approved price change effective next menu cycle.",
          evidenceReference: "PRICE-PACK-902",
          idempotencyKey: "menu-price-apply-902"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "menu_price_decision.apply",
          entityType: "MenuPriceDecision",
          entityId: currentDecision.id,
          metadata: expect.objectContaining({
            menuItemId: currentDecision.menuItemId,
            locationId: currentDecision.locationId,
            action: "APPLY",
            boundary: "menu_price_apply_inserts_effective_dated_price_only"
          })
        })
      })
    );
  });

  it("returns recorded menu-price retries before validating the terminal status", async () => {
    const currentDecision = {
      id: "00000000-0000-4000-8000-000000000902",
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      status: "APPLIED"
    };
    const tx = {
      menuPriceDecision: { findFirst: vi.fn().mockResolvedValue(currentDecision) },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-transition" })
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(transitionMenuPriceDecision(menuPriceApplyForm())).resolves.toBe(
      currentDecision.id
    );
    expect(tx.operationalStatusTransition.findFirst).toHaveBeenCalledOnce();
  });

  it("rejects overlapping menu-price intervals before changing the decision", async () => {
    const currentDecision = {
      id: "00000000-0000-4000-8000-000000000902",
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      menuItemId: "00000000-0000-4000-8000-000000000912",
      requestedPrice: "459",
      currencyCode: "PHP",
      effectiveFrom: new Date("2026-07-10T00:00:00.000Z"),
      effectiveTo: null,
      status: "APPROVED",
      requestedByUserId: "00000000-0000-4000-8000-000000000101"
    };
    const tx = {
      menuPriceDecision: {
        findFirst: vi.fn().mockResolvedValue(currentDecision),
        updateMany: vi.fn()
      },
      operationalStatusTransition: { findFirst: vi.fn().mockResolvedValue(null) },
      menuPrice: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "00000000-0000-4000-8000-000000000913",
            effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
            effectiveTo: new Date("2026-07-20T00:00:00.000Z")
          }
        ])
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(transitionMenuPriceDecision(menuPriceApplyForm())).rejects.toThrow(
      "MENU_PRICE_EFFECTIVE_RANGE_OVERLAP"
    );
    expect(tx.menuPriceDecision.updateMany).not.toHaveBeenCalled();
  });

  it("scopes menu-price decision transitions to the active brand or company-wide records", async () => {
    const tx = {
      menuPriceDecision: { findFirst: vi.fn().mockResolvedValue(null) }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(transitionMenuPriceDecision(menuPriceApplyForm())).rejects.toThrow(
      "MENU_PRICE_DECISION_NOT_FOUND"
    );
    expect(tx.menuPriceDecision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ brandId: null }, { brandId: session.context.brandId }] }
          ])
        })
      })
    );
  });

  it("returns recorded recipe-version retries before validating the terminal status", async () => {
    const currentVersion = {
      id: "00000000-0000-4000-8000-000000000901",
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      recipeId: "00000000-0000-4000-8000-000000000911",
      status: "PUBLISHED",
      recipe: { brandId: session.context.brandId }
    };
    const tx = {
      recipeVersion: { findFirst: vi.fn().mockResolvedValue(currentVersion) },
      recipeVersionTransition: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-transition" })
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(transitionRecipeVersion(recipePublishForm())).resolves.toBe(
      currentVersion.id
    );
    expect(tx.recipeVersionTransition.findFirst).toHaveBeenCalledWith({
      where: {
        recipeVersionId: currentVersion.id,
        idempotencyKey: "recipe-publish-901"
      }
    });
  });

  it("provides a scoped controlled recipe detail view", () => {
    expect(serviceSource).toContain("getRecipeCostingSummary");
    expect(serviceSource).toContain("versionHistory");
    expect(serviceSource).toContain("isSelectedCostingVersion");
    expect(serviceSource).toContain("selectedVersionStatus");
    expect(detailPageSource).toContain("getRecipeCostingSummary(session, id)");
    expect(detailPageSource).toContain("transitionRecipeVersionAction");
    expect(detailPageSource).toContain("/revise");
    expect(recipeRevisionPageSource).toContain("createRecipeRevisionDraftAction");
    expect(detailPageSource).toContain("archiveRecipeAction");
    expect(detailPageSource).toContain("createMenuPriceDecisionAction");
    expect(detailPageSource).toContain("transitionMenuPriceDecisionAction");
    expect(detailPageSource).toContain("getRecipeVersionActionsForStatus");
    expect(detailPageSource).toContain("getMenuPriceDecisionActionsForStatus");
    expect(detailPageSource).toContain("transitionRecipeVersion(formData)");
    expect(recipeRevisionPageSource).toContain("createRecipeRevisionDraft(formData)");
    expect(detailPageSource).toContain("archiveRecipe(formData)");
    expect(detailPageSource).toContain("createMenuPriceDecision(formData)");
    expect(detailPageSource).toContain("transitionMenuPriceDecision(formData)");
    expect(detailPageSource).toContain("recipe.selectedVersionStatus");
    expect(detailPageSource).toContain("Recipe publishing changes the costing basis only");
    expect(detailPageSource).toContain("Version workflow");
    expect(detailPageSource).toContain("Create Revision Draft");
    expect(detailPageSource).toContain("Export Revision Workbook");
    expect(detailPageSource).toContain("/recipes/${recipe.id}/revision-template");
    expect(detailPageSource).toContain("/revise");
    expect(recipeRevisionPageSource).toContain("Current ingredient lines");
    expect(recipeRevisionPageSource).toContain("RecipeRevisionAddLinesEditor");
    expect(recipeRevisionPageSource).toContain("line.${line.lineNo}.sortOrder");
    expect(recipeRevisionPageSource).toContain("line.${line.lineNo}.remove");
    expect(detailPageSource).toContain("Archive Recipe");
    expect(recipeRevisionPageSource).toContain("createRecipeRevisionDraftAction");
    expect(detailPageSource).toContain("action={archiveRecipeAction}");
    expect(detailPageSource).toContain("Menu price decision");
    expect(detailPageSource).toContain("Propose Price");
    expect(detailPageSource).toContain("Applying inserts a new effective-dated menu price");
    expect(detailPageSource).toContain("action={transitionRecipeVersionAction}");
    expect(detailPageSource).toContain("action={createMenuPriceDecisionAction}");
    expect(detailPageSource).toContain("action={transitionMenuPriceDecisionAction}");
    expect(detailPageSource).toContain("action.requiresReason");
    expect(detailPageSource).toContain("action.requiresEvidence");
    expect(detailPageSource).toContain("No workflow action is available");
    expect(detailPageSource).toContain("line.costingNote");
    expect(recipeRevisionWorkbookRouteSource).toContain(
      "buildRecipeRevisionWorkbookRows"
    );
    expect(recipeRevisionWorkbookRouteSource).toContain(
      "recipe-revision-workbook"
    );
    expect(recipeRevisionWorkbookRouteSource).toContain(
      "Planning export only; apply changes through Create Revision Draft"
    );
    expect(recipeRevisionWorkbookRouteSource).toContain("canExportRecipeCosting");
    expect(recipeRevisionWorkbookRouteSource).not.toContain("createRecipeRevisionDraft");
    expect(recipeRevisionWorkbookRouteSource).not.toContain("updateMany");
    expect(detailPageSource).toContain("recipe.costingStatus");
    expect(detailPageSource).toContain("recipe.costedLineCount");
    expect(detailPageSource).toContain("Version history and audit context");
    expect(detailPageSource).toContain("current costing basis");
    expect(detailPageSource).toContain("Effective from");
    expect(detailPageSource).toContain("Approved");
    expect(detailPageSource).not.toContain("inventoryMovement.create");
    expect(detailPageSource).not.toContain("inventoryBalance.update");
  });

  it("provides recipe and food-cost queue search and filters without mutating sources", () => {
    expect(listPageSource).toContain("searchParams");
    expect(listPageSource).toContain('name="q"');
    expect(listPageSource).toContain('name="type"');
    expect(listPageSource).toContain('name="status"');
    expect(listPageSource).toContain('name="analysisStatus"');
    expect(listPageSource).toContain("visibleRecipes");
    expect(listPageSource).toContain("RECIPES_PER_PAGE = 10");
    expect(listPageSource).toContain("paginatedRecipes");
    expect(listPageSource).toContain("recipePageHref");
    expect(listPageSource).toContain("paginatedFoodCostRecipes");
    expect(listPageSource).toContain("foodCostPageHref");
    expect(listPageSource).toContain("food-cost records");
    expect(listPageSource).toContain("Page {recipeLibraryPage} of {recipeLibraryTotalPages}");
    expect(listPageSource).toContain("Page {foodCostPage} of {foodCostTotalPages}");
    expect(listPageSource).toContain("View Recipe");
    expect(listPageSource).toContain("visibleAnalysisRows");
    expect(listPageSource).toContain("recipe.selectedVersionStatus");
    expect(listPageSource).not.toContain("recipe.lines.map");
    expect(listPageSource).toContain("pendingCostRecipes");
    expect(listPageSource).toContain("recipe.costingStatus");
    expect(listPageSource).toContain("recipe.costedLineCount");
    expect(listPageSource).toContain("filterRecipeCostingSummaries");
    expect(listPageSource).toContain("filterFoodCostAnalysisRows");
    expect(listPageSource).toContain("buildQueryHref");
    expect(listPageSource).toContain("/recipes/export");
    expect(listPageSource).toContain("/recipes/analysis/export");
    expect(listPageSource).toContain('"MENU"');
    expect(listPageSource).toContain('"SUB_RECIPE"');
    expect(listPageSource).toContain('"PREP"');
    expect(listPageSource).toContain('"ARCHIVED"');
    expect(listPageSource).not.toContain('"MENU_ITEM"');
    expect(listPageSource).not.toContain('"PREP_RECIPE"');
    expect(listPageSource).toContain("No recipes match the filters");
    expect(listPageSource).toContain("No sales rows match the filters");
    expect(listPageSource).toContain("listRecipeCostingSummaries(session)");
    expect(listPageSource).toContain("getFoodCostAnalysisDashboard(session)");
    expect(listPageSource).toContain('href="/recipes/new"');
    expect(listPageSource).toContain("Create Draft Recipe");
    expect(recipeCreatePageSource).toContain("createDraftRecipeAction");
    expect(recipeCreatePageSource).toContain("getRecipeCreateOptions(session)");
    expect(recipeCreatePageSource).toContain("RecipeIngredientLinesEditor");
    expect(recipeCreatePageSource).toContain("Creates a draft only");
    expect(listPageSource).not.toContain("inventoryMovement.create");
    expect(listPageSource).not.toContain("recipe.update");
  });

  it("provides a read-only food-cost analysis drilldown", () => {
    expect(analysisDrilldownSource).toContain("getFoodCostAnalysisDashboard(session, {");
    expect(analysisDrilldownSource).toContain("Actual Ledger Evidence");
    expect(analysisDrilldownSource).toContain("Branch-level actual cost is not allocated");
    expect(analysisDrilldownSource).toContain("searchParams");
    expect(analysisDrilldownSource).toContain('name="q"');
    expect(analysisDrilldownSource).toContain('name="status"');
    expect(analysisDrilldownSource).toContain('name="actualQ"');
    expect(analysisDrilldownSource).toContain('name="movementType"');
    expect(analysisDrilldownSource).toContain('name="businessDate"');
    expect(analysisDrilldownSource).toContain("Apply Date");
    expect(analysisDrilldownSource).toContain("Latest Posted");
    expect(analysisDrilldownSource).toContain("visibleSalesRows");
    expect(analysisDrilldownSource).toContain("visibleActualRows");
    expect(analysisDrilldownSource).toContain("ANALYSIS_ROWS_PER_PAGE = 10");
    expect(analysisDrilldownSource).toContain("paginatedSalesRows");
    expect(analysisDrilldownSource).toContain("paginatedActualRows");
    expect(analysisDrilldownSource).toContain('getSearchParam(params, "salesPage")');
    expect(analysisDrilldownSource).toContain('getSearchParam(params, "actualPage")');
    expect(analysisDrilldownSource).toContain("salesPageHref");
    expect(analysisDrilldownSource).toContain("actualPageHref");
    expect(analysisDrilldownSource).toContain('itemLabel="sales rows"');
    expect(analysisDrilldownSource).toContain('itemLabel="actual ledger rows"');
    expect(analysisDrilldownSource).toContain("visibleSalesSummary");
    expect(analysisDrilldownSource).toContain("visibleActualSummary");
    expect(analysisDrilldownSource).toContain("dashboard.statusCounts.WITHIN_TARGET");
    expect(analysisDrilldownSource).toContain("dashboard.statusCounts.ABOVE_TARGET");
    expect(analysisDrilldownSource).toContain("dashboard.statusCounts.MISSING_COST");
    expect(analysisDrilldownSource).toContain("dashboard.statusCounts.AWAITING_ACTUALS");
    expect(analysisDrilldownSource).toContain("Visible sales filter");
    expect(analysisDrilldownSource).toContain("Visible ledger evidence");
    expect(analysisDrilldownSource).toContain("filterFoodCostAnalysisRows");
    expect(analysisDrilldownSource).toContain("filterActualConsumptionRows");
    expect(analysisDrilldownSource).toContain("summarizeFoodCostAnalysisRows");
    expect(analysisDrilldownSource).toContain("summarizeActualConsumptionRows");
    expect(analysisDrilldownSource).toContain("getFoodCostAnalysisDashboard(session, {");
    expect(analysisDrilldownSource).toContain("buildQueryHref");
    expect(analysisDrilldownSource).toContain("/recipes/analysis/export");
    expect(analysisDrilldownSource).toContain("No sales rows match the filters");
    expect(analysisDrilldownSource).toContain("No actual rows match the filters");
    expect(analysisDrilldownSource).not.toContain("inventoryMovement.create");
    expect(analysisDrilldownSource).not.toContain("form action");
  });

  it("filters recipe and food-cost exports using the same source rules as the UI", () => {
    const recipes = [
      {
        recipeCode: "REC-1",
        recipeName: "Karubi Set",
        recipeType: "MENU",
        status: "ACTIVE",
        selectedVersionStatus: "PUBLISHED",
        brandName: "Yakiniku Like",
        menuItemName: "Karubi Set",
        lines: [
          {
            itemCode: "BEEF-KARUBI",
            itemName: "Beef Karubi",
            preparationNote: "Slice thin"
          }
        ]
      },
      {
        recipeCode: "REC-2",
        recipeName: "Garlic Sauce",
        recipeType: "PREP",
        status: "ACTIVE",
        selectedVersionStatus: "PUBLISHED",
        brandName: "Yakiniku Like",
        menuItemName: null,
        lines: [{ itemCode: "GARLIC", itemName: "Garlic", preparationNote: null }]
      },
      {
        recipeCode: "REC-3",
        recipeName: "Old Sauce",
        recipeType: "PREP",
        status: "ARCHIVED",
        selectedVersionStatus: "SUPERSEDED",
        brandName: "Yakiniku Like",
        menuItemName: null,
        lines: [{ itemCode: "SAUCE", itemName: "Sauce", preparationNote: null }]
      }
    ] as never;
    const rows = [
      {
        menuItemName: "Karubi Set",
        recipeName: "Karubi Set",
        status: "ABOVE_TARGET"
      },
      {
        menuItemName: "Chicken Set",
        recipeName: "Chicken Set",
        status: "WITHIN_TARGET"
      }
    ] as never;

    expect(
      filterRecipeCostingSummaries(recipes, { q: "beef", type: "MENU" }).map(
        (recipe) => recipe.recipeCode
      )
    ).toEqual(["REC-1"]);
    expect(
      filterRecipeCostingSummaries(recipes, { type: "PREP" }).map(
        (recipe) => recipe.recipeCode
      )
    ).toEqual(["REC-2", "REC-3"]);
    expect(
      filterRecipeCostingSummaries(recipes, { status: "ARCHIVED" }).map(
        (recipe) => recipe.recipeCode
      )
    ).toEqual(["REC-3"]);
    expect(
      filterFoodCostAnalysisRows(rows, { status: "ABOVE_TARGET" }).map(
        (row) => row.menuItemName
      )
    ).toEqual(["Karubi Set"]);
    expect(
      filterActualConsumptionRows(
        [
          {
            itemCode: "BEEF-KARUBI",
            itemName: "Beef Karubi",
            movementType: "WASTAGE_OUT"
          },
          {
            itemCode: "RICE-JASMINE",
            itemName: "Jasmine Rice",
            movementType: "ADJUSTMENT_OUT"
          }
        ] as never,
        { actualQ: "beef", movementType: "WASTAGE_OUT" }
      ).map((row) => row.itemCode)
    ).toEqual(["BEEF-KARUBI"]);
    expect(
      summarizeFoodCostAnalysisRows([
        {
          quantitySold: 10,
          netSalesAmount: 1000,
          theoreticalCost: 320
        },
        {
          quantitySold: 5,
          netSalesAmount: 500,
          theoreticalCost: null
        }
      ] as never)
    ).toEqual({
      rowCount: 2,
      quantitySold: 15,
      netSalesAmount: 1500,
      theoreticalCost: 320,
      theoreticalFoodCostPercent: 21.33
    });
    expect(
      summarizeActualConsumptionRows([
        {
          quantityBaseUom: 2.1234567,
          totalCost: 100.111
        },
        {
          quantityBaseUom: 3,
          totalCost: 50.224
        }
      ] as never)
    ).toEqual({
      rowCount: 2,
      quantityBaseUom: 5.123457,
      totalCost: 150.34
    });
    expect(recipeExportRouteSource).toContain("getFilterParams(request)");
    expect(recipeExportRouteSource).toContain("buildRecipeCostingExportRows(session");
    expect(listPageSource).toContain("Export Recipe Costing CSV");
    expect(listPageSource).toContain("Export Food Cost CSV");
    expect(listPageSource).toContain("Export Sales Analysis CSV");
    expect(listPageSource).toContain('businessDate: getSearchParam(params, "businessDate")');
    expect(listPageSource).toContain('actualQ: getSearchParam(params, "actualQ")');
    expect(listPageSource).toContain('movementType: getSearchParam(params, "movementType")');
    expect(serviceSource).toContain('"Menu Price"');
    expect(serviceSource).toContain('"Food Cost Percent"');
    expect(serviceSource).toContain('"Gross Margin"');
    expect(analysisExportRouteSource).toContain("getFilterParams(request)");
    expect(analysisExportRouteSource).toContain('searchParams.get("actualQ")');
    expect(analysisExportRouteSource).toContain('searchParams.get("movementType")');
    expect(analysisExportRouteSource).toContain("getStrictDateSearchParam");
    expect(analysisExportRouteSource).toContain('"businessDate"');
    expect(analysisExportRouteSource).toContain("FOOD_COST_BUSINESS_DATE_INVALID");
    expect(analysisExportRouteSource).toContain(
      "buildFoodCostAnalysisExportRows("
    );
    expect(serviceSource).toContain("filterActualConsumptionRows");
    expect(serviceSource).toContain("parseBusinessDateFilter");
    expect(serviceSource).toContain("Filtered Actual Evidence Rows");
    expect(serviceSource).toContain("Recipe Status");
    expect(serviceSource).toContain("Version Status");
    expect(serviceSource).toContain("Costing Note");
    expect(serviceSource).toContain("Costing Status");
    expect(serviceSource).toContain("Pending Cost Line Count");
    expect(serviceSource).toContain("No supplier price history");
    expect(serviceSource).toContain("Missing UOM conversion to supplier price unit");
    expect(serviceSource).toContain("hasPendingLineCost");
    expect(serviceSource).toContain("Filtered Sales Rows");
    expect(serviceSource).toContain("Within Target Rows");
    expect(serviceSource).toContain("Above Target Rows");
    expect(serviceSource).toContain("Missing Cost Rows");
    expect(serviceSource).toContain("Awaiting Actuals Rows");
    expect(serviceSource).toContain("Filtered Net Sales Amount");
    expect(serviceSource).toContain("Filtered Theoretical Cost");
    expect(serviceSource).toContain("Filtered Actual Quantity");
    expect(serviceSource).toContain("Filtered Actual Cost");
  });

  it("selects supplier prices by recipe version effective date", () => {
    const priceRows = [
      {
        itemId: "beef-karubi",
        uomId: "kg",
        unitPrice: 420,
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: null
      },
      {
        itemId: "beef-karubi",
        uomId: "kg",
        unitPrice: 390,
        effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-07-01T00:00:00.000Z")
      },
      {
        itemId: "beef-karubi",
        uomId: "kg",
        unitPrice: 360,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-05-01T00:00:00.000Z")
      },
      {
        itemId: "beef-shortplate",
        uomId: "kg",
        unitPrice: 510,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: null
      }
    ];

    expect(
      pickEffectiveSupplierUnitPrice(
        priceRows,
        "beef-karubi",
        new Date("2026-06-15T00:00:00.000Z")
      )
    ).toBe(390);
    expect(
      pickEffectiveSupplierUnitPrice(
        priceRows,
        "beef-karubi",
        new Date("2026-07-15T00:00:00.000Z")
      )
    ).toBe(420);
    expect(pickEffectiveSupplierUnitPrice(priceRows, "beef-karubi", null)).toBe(420);
    expect(pickEffectiveSupplierUnitPrice(priceRows, "missing-item", null)).toBeNull();
  });

  it("converts recipe quantities into supplier price UOM before costing", () => {
    const conversions = [
      {
        itemId: "beef-karubi",
        fromUomId: "gram",
        toUomId: "kg",
        conversionFactor: 0.001
      },
      {
        itemId: "beef-shortplate",
        fromUomId: "tray",
        toUomId: "kg",
        conversionFactor: 1.25
      }
    ];

    expect(
      convertRecipeQuantityToPriceUom(
        150,
        "beef-karubi",
        "gram",
        "kg",
        conversions
      )
    ).toBe(0.15);
    expect(
      convertRecipeQuantityToPriceUom(2, "beef-shortplate", "kg", "kg", conversions)
    ).toBe(2);
    expect(
      convertRecipeQuantityToPriceUom(1, "missing-item", "gram", "kg", conversions)
    ).toBeNull();
  });
});
