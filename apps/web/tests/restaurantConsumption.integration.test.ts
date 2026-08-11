import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { prisma } from "@ogfi/database";
import type { SessionContext } from "../src/server/services/context";
import { permissions } from "../src/server/services/authorization";
import {
  activateRestaurantConsumptionConfiguration,
  adoptSharedRecipeForBrand,
  assignBrandMenuRecipeDefault,
  assignMenuRecipe,
  cancelFutureRestaurantMenuPolicy,
  cancelServingDeclaration,
  cancelVerifiedServingDeclaration,
  configureRestaurantConsumption,
  createServingCorrection,
  createServingDeclaration,
  endLocationMenuRecipeOverride,
  getRestaurantConsumptionSettings,
  listRestaurantConsumptionCatalog,
  postServingConsumption,
  returnServingDeclaration,
  reverseServingConsumption,
  setMenuItemLocationAvailability,
  submitServingDeclaration,
  updateServingDeclarationDraft,
  verifyServingDeclaration,
} from "../src/server/services/restaurantConsumption";
import {
  previewRecipePublicationConsumptionImpact,
  rolloutPublishedRecipeSuccessor,
} from "../src/server/services/recipes";
import {
  lockInventoryLocationForPosting,
  postInventoryMovementInTransaction,
} from "../src/server/services/inventory";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const mockContext = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/context")
  >("../src/server/services/context");
  return {
    ...actual,
    requireSessionContext: mockContext.requireSessionContext,
  };
});

const runPg = process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";
const pgDescribe = runPg ? describe : describe.skip;
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let fixture: Fixture;
let initialOverrideId: string;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function sessionFor(input: {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  permissionCodes: string[];
  scopeAssignmentId: string;
  authSessionId?: string;
  assuranceLevel?: "PASSWORD" | "MFA";
}): SessionContext {
  const location = {
    tenantId: fixture.tenantId,
    companyId: fixture.companyId,
    companyName: "Consumption Test Company",
    brandId: fixture.brandId,
    brandName: "Consumption Test Brand",
    locationId: fixture.locationId,
    locationName: "Consumption Test Branch",
    locationType: "BRANCH" as const,
  };
  return {
    user: {
      id: input.userId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
    },
    context: location,
    authorizedLocations: [
      {
        ...location,
        scopeAssignmentId: input.scopeAssignmentId,
        accessLevel: input.role === "Encoder" ? "OPERATE" : "MANAGE",
      },
    ],
    permissionCodes: input.permissionCodes,
    ...(input.authSessionId
      ? {
          authentication: {
            sessionId: input.authSessionId,
            assuranceLevel: input.assuranceLevel ?? "MFA",
            mfaAuthenticatedAt:
              (input.assuranceLevel ?? "MFA") === "MFA" ? new Date() : null,
            absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
          },
        }
      : {}),
  };
}

async function createFixture() {
  const token = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      name: `Consumption Test ${token}`,
      loginCode: `consumption-${token}`,
    },
  });
  const company = await prisma.company.create({
    data: {
      tenantId: tenant.id,
      code: `C${token}`,
      legalName: "Consumption Test Company",
      currencyCode: "PHP",
      timezone: "Asia/Manila",
    },
  });
  const brand = await prisma.brand.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      code: `B${token}`,
      name: "Consumption Test Brand",
    },
  });
  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      brandId: brand.id,
      locationType: "BRANCH",
      code: `L${token}`,
      name: "Consumption Test Branch",
      timezone: "Asia/Manila",
    },
  });
  const [encoder, manager] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `encoder-${token}@example.test`,
        displayName: "Consumption Encoder",
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `manager-${token}@example.test`,
        displayName: "Consumption Manager",
      },
    }),
  ]);
  const [encoderRole, managerRole] = await Promise.all([
    prisma.role.create({
      data: {
        tenantId: tenant.id,
        code: `ENCODER_${token}`,
        name: "Consumption Encoder",
      },
    }),
    prisma.role.create({
      data: {
        tenantId: tenant.id,
        code: `MANAGER_${token}`,
        name: "Consumption Manager",
      },
    }),
  ]);
  const encoderPermissionCodes = [
    permissions.consumptionView,
    permissions.consumptionCreate,
  ];
  const managerPermissionCodes = [
    permissions.consumptionView,
    permissions.consumptionVerify,
    permissions.consumptionPost,
    permissions.consumptionReverse,
    permissions.consumptionConfigure,
    permissions.menuRecipeAdopt,
    permissions.menuRecipeBranchException,
    permissions.menuRecipeRollout,
    permissions.recipeView,
    permissions.recipePublish,
  ];
  const permissionRows = await prisma.permission.findMany({
    where: {
      code: { in: [...encoderPermissionCodes, ...managerPermissionCodes] },
    },
  });
  expect(permissionRows).toHaveLength(11);
  await prisma.rolePermission.createMany({
    data: permissionRows.flatMap((permission) => [
      ...(encoderPermissionCodes.includes(permission.code)
        ? [{ roleId: encoderRole.id, permissionId: permission.id }]
        : []),
      ...(managerPermissionCodes.includes(permission.code)
        ? [{ roleId: managerRole.id, permissionId: permission.id }]
        : []),
    ]),
  });
  const [encoderScope, managerScope] = await Promise.all([
    prisma.userScopeAssignment.create({
      data: {
        userId: encoder.id,
        scopeType: "LOCATION",
        scopeId: location.id,
        accessLevel: "OPERATE",
      },
    }),
    prisma.userScopeAssignment.create({
      data: {
        userId: manager.id,
        scopeType: "LOCATION",
        scopeId: location.id,
        accessLevel: "MANAGE",
      },
    }),
  ]);
  await prisma.userScopeAssignment.create({
    data: {
      userId: manager.id,
      scopeType: "BRAND",
      scopeId: brand.id,
      accessLevel: "MANAGE",
    },
  });
  await prisma.userRoleAssignment.createMany({
    data: [
      { userId: encoder.id, roleId: encoderRole.id },
      { userId: manager.id, roleId: managerRole.id },
    ],
  });
  const authSession = await prisma.authSession.create({
    data: {
      tenantId: tenant.id,
      userId: manager.id,
      tokenHash: `consumption-${randomUUID()}`,
      status: "ACTIVE",
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(),
      privilegeEpochAtIssue: manager.privilegeEpoch,
      idleExpiresAt: new Date(Date.now() + 60 * 60_000),
      absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  const uom = await prisma.uom.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      uomCode: `KG-${token}`,
      uomName: "Kilogram",
      uomType: "WEIGHT",
      decimalPrecision: 6,
    },
  });
  const category = await prisma.itemCategory.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      categoryCode: `ING-${token}`,
      categoryName: "Ingredients",
      inventoryClass: "FOOD",
      requiresExpiryTracking: true,
      requiresLotTracking: true,
    },
  });
  const item = await prisma.item.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      itemCode: `MEAT-${token}`,
      itemName: "Test Meat",
      itemCategoryId: category.id,
      itemType: "INGREDIENT",
      baseUomId: uom.id,
      issueUomId: uom.id,
      trackInventory: true,
      trackExpiry: true,
      trackLot: true,
    },
  });
  const inventoryLocation = await prisma.inventoryLocation.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      locationId: location.id,
      code: `STORE-${token}`,
      name: "Branch Dry Store",
      storageType: "DRY",
    },
  });
  const recipe = await prisma.recipe.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      brandId: brand.id,
      recipeCode: `SET-${token}`,
      recipeName: "Test Set",
      createdByUserId: manager.id,
    },
  });
  const recipeVersion = await prisma.recipeVersion.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      recipeId: recipe.id,
      versionNo: 1,
      status: "PUBLISHED",
      yieldQuantity: 1,
      yieldUomId: uom.id,
      servingQuantity: 1,
      servingUomId: uom.id,
      publishedAt: new Date(),
      publishedByUserId: manager.id,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  await prisma.recipeLine.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      recipeVersionId: recipeVersion.id,
      lineNo: 1,
      itemId: item.id,
      quantity: 0.5,
      uomId: uom.id,
    },
  });
  await prisma.recipe.update({
    where: { id: recipe.id },
    data: {
      currentVersionId: recipeVersion.id,
      publishedVersionId: recipeVersion.id,
    },
  });
  const menuItem = await prisma.menuItem.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      brandId: brand.id,
      menuItemCode: `MENU-${token}`,
      menuItemName: "Test Menu Set",
      menuCategory: "Sets",
      currentRecipeVersionId: recipeVersion.id,
    },
  });
  return {
    tenantId: tenant.id,
    companyId: company.id,
    brandId: brand.id,
    locationId: location.id,
    inventoryLocationId: inventoryLocation.id,
    itemId: item.id,
    uomId: uom.id,
    menuItemId: menuItem.id,
    recipeVersionId: recipeVersion.id,
    recipeId: recipe.id,
    encoder,
    manager,
    encoderRoleId: encoderRole.id,
    managerRoleId: managerRole.id,
    encoderScopeId: encoderScope.id,
    managerScopeId: managerScope.id,
    authSessionId: authSession.id,
    encoderPermissionCodes,
    managerPermissionCodes,
  };
}

function encoderSession() {
  return sessionFor({
    userId: fixture.encoder.id,
    email: fixture.encoder.email,
    displayName: fixture.encoder.displayName,
    role: "Encoder",
    permissionCodes: fixture.encoderPermissionCodes,
    scopeAssignmentId: fixture.encoderScopeId,
  });
}

function managerSession() {
  return sessionFor({
    userId: fixture.manager.id,
    email: fixture.manager.email,
    displayName: fixture.manager.displayName,
    role: "Manager",
    permissionCodes: fixture.managerPermissionCodes,
    scopeAssignmentId: fixture.managerScopeId,
    authSessionId: fixture.authSessionId,
  });
}

function passwordOnlyManagerSession() {
  return sessionFor({
    userId: fixture.manager.id,
    email: fixture.manager.email,
    displayName: fixture.manager.displayName,
    role: "Manager",
    permissionCodes: fixture.managerPermissionCodes,
    scopeAssignmentId: fixture.managerScopeId,
    authSessionId: fixture.authSessionId,
    assuranceLevel: "PASSWORD",
  });
}

async function createAndSubmit(
  quantityServed: number,
  idempotencyKey: string,
  businessDate = "2026-07-01",
) {
  mockContext.requireSessionContext.mockResolvedValue(encoderSession());
  const declaration = await createServingDeclaration({
    businessDate,
    servicePeriodCode: "DAILY",
    idempotencyKey,
    lines: [
      {
        menuItemId: fixture.menuItemId,
        disposition: "PAID",
        quantityServed,
      },
    ],
  });
  await submitServingDeclaration(form({ id: declaration.id }));
  return declaration;
}

pgDescribe.sequential("restaurant consumption PostgreSQL lifecycle", () => {
  beforeAll(async () => {
    expect(expectedDatabase).toBeTruthy();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    process.env.AUTH_MODE = "local";
    fixture = await createFixture();
    mockContext.requireSessionContext.mockResolvedValue(managerSession());
    const initialOverride = await assignMenuRecipe({
      locationId: fixture.locationId,
      menuItemId: fixture.menuItemId,
      recipeVersionId: fixture.recipeVersionId,
      idempotencyKey: `recipe-map-${randomUUID()}`,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      reason: "Map the approved pilot menu recipe.",
    });
    initialOverrideId = initialOverride.id;
    const configuration = await configureRestaurantConsumption({
      locationId: fixture.locationId,
      defaultIssueInventoryLocationId: fixture.inventoryLocationId,
      servicePeriodMode: "DAILY",
      timezone: "Asia/Manila",
      servicePeriods: [
        { code: "DAILY", label: "Daily service", start: "00:00", end: "23:59" },
      ],
      sentinelRules: {
        dailyCountItemIds: [fixture.itemId],
        pilotDailyCountDays: 28,
        highRiskCountFrequencyDays: 7,
        generalCountFrequencyDays: 30,
      },
      saveAsCompanyDefault: true,
      effectiveFrom: new Date("2026-01-02T00:00:00.000Z"),
      reason: "Activate the disposable branch consumption pilot.",
    });
    await activateRestaurantConsumptionConfiguration(
      form({ id: configuration.id, reason: "Readiness checks passed." }),
    );
    await prisma.$transaction(async (tx) => {
      const lock = await lockInventoryLocationForPosting(
        tx,
        managerSession(),
        fixture.inventoryLocationId,
      );
      for (const [index, entry] of [
        {
          lot: "EARLY",
          quantity: 2,
          expiry: new Date("2027-01-01T00:00:00.000Z"),
        },
        {
          lot: "LATER",
          quantity: 5,
          expiry: new Date("2027-06-01T00:00:00.000Z"),
        },
      ].entries()) {
        await postInventoryMovementInTransaction(tx, managerSession(), lock, {
          inventoryLocationId: fixture.inventoryLocationId,
          itemId: fixture.itemId,
          movementType: "ADJUSTMENT_IN",
          occurredAt: new Date("2026-06-30T00:00:00.000Z"),
          enteredQuantity: entry.quantity,
          enteredUomId: fixture.uomId,
          quantityDeltaBaseUom: entry.quantity,
          sourceDocumentType: "RestaurantConsumptionIntegrationBaseline",
          sourceDocumentId: randomUUID(),
          sourceEventKey: `baseline-${index}`,
          lotNumber: entry.lot,
          expiryDate: entry.expiry,
          reasonCode: "TEST_BASELINE",
        });
      }
    });
  }, 60_000);

  test("verifies facts without stock mutation, posts FEFO exactly once, reverses, and creates a correction", async () => {
    const declaration = await createAndSubmit(6, `servings-${randomUUID()}`);
    const beforeVerification = await prisma.inventoryMovement.count({
      where: { tenantId: fixture.tenantId, movementType: "CONSUMPTION_OUT" },
    });
    mockContext.requireSessionContext.mockResolvedValue(managerSession());
    await verifyServingDeclaration(form({ id: declaration.id }));
    expect(
      await prisma.inventoryMovement.count({
        where: { tenantId: fixture.tenantId, movementType: "CONSUMPTION_OUT" },
      }),
    ).toBe(beforeVerification);
    const verified = await prisma.servingDeclaration.findUniqueOrThrow({
      where: { id: declaration.id },
      include: { ingredientSnapshots: true },
    });
    expect(verified.status).toBe("READY_TO_POST");
    expect(verified.ingredientSnapshots).toHaveLength(1);
    expect(verified.ingredientSnapshots[0]?.rawQuantityBaseUom.toString()).toBe(
      "3",
    );

    const postAttempts = await Promise.allSettled([
      postServingConsumption(form({ id: declaration.id })),
      postServingConsumption(form({ id: declaration.id })),
    ]);
    expect(postAttempts.some(({ status }) => status === "fulfilled")).toBe(
      true,
    );
    const posting = await prisma.consumptionPosting.findUniqueOrThrow({
      where: { declarationId: declaration.id },
      include: { allocations: { orderBy: { allocationNo: "asc" } } },
    });
    expect(posting.status).toBe("POSTED");
    expect(
      posting.allocations.map((row) => [
        row.lotNumber,
        row.quantityBaseUom.toString(),
      ]),
    ).toEqual([
      ["EARLY", "2"],
      ["LATER", "1"],
    ]);
    expect(
      await prisma.inventoryMovement.count({
        where: {
          tenantId: fixture.tenantId,
          sourceDocumentType: "ConsumptionPosting",
          sourceDocumentId: posting.id,
          movementType: "CONSUMPTION_OUT",
        },
      }),
    ).toBe(2);

    const reversalKey = `reverse-${randomUUID()}`;
    const reversal = form({
      id: declaration.id,
      reason: "Correct an approved serving-entry error.",
      idempotencyKey: reversalKey,
    });
    const reversalAttempts = await Promise.allSettled([
      reverseServingConsumption(reversal),
      reverseServingConsumption(reversal),
    ]);
    expect(reversalAttempts.some(({ status }) => status === "fulfilled")).toBe(
      true,
    );
    const reversed = await prisma.consumptionPosting.findUniqueOrThrow({
      where: { declarationId: declaration.id },
      include: { allocations: true },
    });
    expect(reversed.status).toBe("REVERSED");
    expect(reversed.allocations.every((row) => row.reversalMovementId)).toBe(
      true,
    );
    const net = await prisma.inventoryMovement.aggregate({
      where: {
        tenantId: fixture.tenantId,
        sourceDocumentType: {
          in: ["ConsumptionPosting", "ConsumptionPostingReversal"],
        },
        sourceDocumentId: posting.id,
      },
      _sum: { quantityDeltaBaseUom: true },
    });
    expect(net._sum.quantityDeltaBaseUom?.toString()).toBe("0");

    mockContext.requireSessionContext.mockResolvedValue(encoderSession());
    const correction = await createServingCorrection(
      form({
        id: declaration.id,
        idempotencyKey: `correction-${randomUUID()}`,
      }),
    );
    expect(correction.status).toBe("DRAFT");
    expect(correction.supersedesDeclarationId).toBe(declaration.id);
  }, 60_000);

  test("denies self-verification and rolls an insufficient-stock post back completely", async () => {
    const selfDeclaration = await createAndSubmit(
      1,
      `self-${randomUUID()}`,
      "2026-07-02",
    );
    const verifyPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: permissions.consumptionVerify },
    });
    await prisma.rolePermission.create({
      data: {
        roleId: fixture.encoderRoleId,
        permissionId: verifyPermission.id,
      },
    });
    mockContext.requireSessionContext.mockResolvedValue({
      ...encoderSession(),
      permissionCodes: [
        ...encoderSession().permissionCodes,
        permissions.consumptionVerify,
      ],
    });
    await expect(
      verifyServingDeclaration(form({ id: selfDeclaration.id })),
    ).rejects.toThrow("SERVING_DECLARATION_SELF_VERIFICATION_DENIED");

    const insufficient = await createAndSubmit(
      100,
      `insufficient-${randomUUID()}`,
      "2026-07-03",
    );
    mockContext.requireSessionContext.mockResolvedValue(managerSession());
    await verifyServingDeclaration(form({ id: insufficient.id }));
    const movementsBefore = await prisma.inventoryMovement.count({
      where: { tenantId: fixture.tenantId },
    });
    await expect(
      postServingConsumption(form({ id: insufficient.id })),
    ).rejects.toThrow("CONSUMPTION_STOCK_INSUFFICIENT");
    expect(
      await prisma.consumptionPosting.count({
        where: { declarationId: insufficient.id },
      }),
    ).toBe(0);
    expect(
      await prisma.inventoryMovement.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(movementsBefore);
  }, 60_000);

  test("updates, returns, and cancels declarations without inventory mutation", async () => {
    const movementsBefore = await prisma.inventoryMovement.count({
      where: { tenantId: fixture.tenantId },
    });
    mockContext.requireSessionContext.mockResolvedValue(encoderSession());
    const draft = await createServingDeclaration({
      businessDate: "2026-07-04",
      servicePeriodCode: "DAILY",
      idempotencyKey: `mutable-${randomUUID()}`,
      lines: [
        {
          menuItemId: fixture.menuItemId,
          disposition: "PAID",
          quantityServed: 1,
        },
      ],
    });
    const updated = await updateServingDeclarationDraft({
      id: draft.id,
      version: draft.version,
      idempotencyKey: `update-${randomUUID()}`,
      businessDate: "2026-07-04",
      servicePeriodCode: "DAILY",
      lines: [
        {
          menuItemId: fixture.menuItemId,
          disposition: "PAID",
          quantityServed: 2,
        },
      ],
    });
    await submitServingDeclaration(form({ id: updated.id }));

    mockContext.requireSessionContext.mockResolvedValue(managerSession());
    await returnServingDeclaration(
      form({ id: updated.id, reason: "Correct the verified shift quantity." }),
    );

    mockContext.requireSessionContext.mockResolvedValue(encoderSession());
    const returned = await prisma.servingDeclaration.findUniqueOrThrow({
      where: { id: updated.id },
    });
    await updateServingDeclarationDraft({
      id: returned.id,
      version: returned.version,
      idempotencyKey: `returned-update-${randomUUID()}`,
      businessDate: "2026-07-04",
      servicePeriodCode: "DAILY",
      lines: [
        {
          menuItemId: fixture.menuItemId,
          disposition: "PAID",
          quantityServed: 3,
        },
      ],
    });
    await cancelServingDeclaration(
      form({
        id: returned.id,
        reason: "Replace the duplicate shift declaration.",
      }),
    );

    const verified = await createAndSubmit(
      1,
      `verified-cancel-${randomUUID()}`,
      "2026-07-05",
    );
    mockContext.requireSessionContext.mockResolvedValue(managerSession());
    await verifyServingDeclaration(form({ id: verified.id }));
    await cancelVerifiedServingDeclaration(
      form({
        id: verified.id,
        reason: "Cancel before inventory posting after manager review.",
      }),
    );

    const statuses = await prisma.servingDeclaration.findMany({
      where: { id: { in: [returned.id, verified.id] } },
      select: { id: true, status: true },
    });
    expect(statuses).toEqual(
      expect.arrayContaining([
        { id: returned.id, status: "CANCELLED" },
        { id: verified.id, status: "CANCELLED" },
      ]),
    );
    expect(
      await prisma.inventoryMovement.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(movementsBefore);
  }, 60_000);

  test("enforces menu-policy authority, MFA, idempotency, recovery, rollout, and zero inventory mutation", async () => {
    const localDate = (daysFromNow: number) => {
      const value = new Date(Date.now() + daysFromNow * 24 * 60 * 60_000);
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(value);
      return `${date}T00:00`;
    };
    const defaultEffectiveFrom = localDate(30);
    const rolloutEffectiveFrom = localDate(60);
    const laterEffectiveFrom = localDate(90);
    const movementsBefore = await prisma.inventoryMovement.count({
      where: { tenantId: fixture.tenantId },
    });

    mockContext.requireSessionContext.mockResolvedValue(managerSession());
    const defaultKey = `brand-default-${randomUUID()}`;
    const defaultInput = {
      brandId: fixture.brandId,
      menuItemId: fixture.menuItemId,
      recipeVersionId: fixture.recipeVersionId,
      effectiveFrom: defaultEffectiveFrom,
      idempotencyKey: defaultKey,
      reason: "Adopt the approved brand recipe for inheriting branches.",
    };
    const brandDefault = await assignBrandMenuRecipeDefault(defaultInput);
    const replay = await assignBrandMenuRecipeDefault(defaultInput);
    expect(replay.id).toBe(brandDefault.id);
    const settings = await getRestaurantConsumptionSettings(managerSession());
    expect(
      settings.menuItems.some((item) => item.id === fixture.menuItemId),
    ).toBe(true);
    const catalog = await listRestaurantConsumptionCatalog(encoderSession());
    expect(catalog.some((item) => item.id === fixture.menuItemId)).toBe(true);
    await expect(
      assignBrandMenuRecipeDefault({
        ...defaultInput,
        reason: "Attempt to reuse the command for a different decision.",
      }),
    ).rejects.toThrow("RESTAURANT_MENU_POLICY_IDEMPOTENCY_CONFLICT");

    mockContext.requireSessionContext.mockResolvedValue(
      passwordOnlyManagerSession(),
    );
    await expect(
      setMenuItemLocationAvailability({
        brandId: fixture.brandId,
        locationId: fixture.locationId,
        menuItemId: fixture.menuItemId,
        state: "UNAVAILABLE",
        effectiveFrom: laterEffectiveFrom,
        idempotencyKey: `availability-mfa-${randomUUID()}`,
        reason: "Exercise the required privileged-MFA boundary.",
      }),
    ).rejects.toThrow("PRIVILEGED_MFA_STEP_UP_REQUIRED");

    mockContext.requireSessionContext.mockResolvedValue(encoderSession());
    await expect(
      assignBrandMenuRecipeDefault({
        ...defaultInput,
        idempotencyKey: `brand-default-denied-${randomUUID()}`,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");

    mockContext.requireSessionContext.mockResolvedValue(managerSession());
    const availability = await setMenuItemLocationAvailability({
      brandId: fixture.brandId,
      locationId: fixture.locationId,
      menuItemId: fixture.menuItemId,
      state: "UNAVAILABLE",
      effectiveFrom: laterEffectiveFrom,
      idempotencyKey: `availability-${randomUUID()}`,
      reason: "Schedule a branch menu exception for recovery testing.",
    });
    const sharedRecipe = await prisma.recipe.create({
      data: {
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        brandId: null,
        recipeCode: `SHARED-${randomUUID().slice(0, 8)}`,
        recipeName: "Shared test recipe",
        createdByUserId: fixture.manager.id,
      },
    });
    const adoption = await adoptSharedRecipeForBrand({
      brandId: fixture.brandId,
      recipeId: sharedRecipe.id,
      effectiveFrom: laterEffectiveFrom,
      idempotencyKey: `shared-adoption-${randomUUID()}`,
      reason: "Authorize a company-shared recipe for this brand only.",
    });
    expect(adoption.brandId).toBe(fixture.brandId);

    await endLocationMenuRecipeOverride({
      brandId: fixture.brandId,
      locationId: fixture.locationId,
      assignmentId: initialOverrideId,
      effectiveTo: rolloutEffectiveFrom,
      idempotencyKey: `end-override-${randomUUID()}`,
      reason: "Return this branch to the inherited brand recipe.",
    });

    const successor = await prisma.recipeVersion.create({
      data: {
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        recipeId: fixture.recipeId,
        versionNo: 2,
        status: "PUBLISHED",
        yieldQuantity: 1,
        yieldUomId: fixture.uomId,
        servingQuantity: 1,
        servingUomId: fixture.uomId,
        publishedAt: new Date(),
        publishedByUserId: fixture.manager.id,
        effectiveFrom: new Date(),
      },
    });
    await prisma.recipeLine.create({
      data: {
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        recipeVersionId: successor.id,
        lineNo: 1,
        itemId: fixture.itemId,
        quantity: 0.5,
        uomId: fixture.uomId,
      },
    });
    const preview = await previewRecipePublicationConsumptionImpact(
      managerSession(),
      {
        brandId: fixture.brandId,
        recipeVersionId: successor.id,
        effectiveFrom: rolloutEffectiveFrom,
      },
    );
    expect(preview.safeToAdvance).toBe(true);
    const rollout = await rolloutPublishedRecipeSuccessor({
      brandId: fixture.brandId,
      recipeVersionId: successor.id,
      effectiveFrom: rolloutEffectiveFrom,
      reason: "Advance inheriting branches at a reviewed service boundary.",
      idempotencyKey: `successor-rollout-${randomUUID()}`,
      previewSnapshotHash: preview.previewSnapshotHash,
    });
    expect(rollout.assignmentIds).toHaveLength(1);

    const cancelled = await cancelFutureRestaurantMenuPolicy({
      brandId: fixture.brandId,
      targetType: "MENU_ITEM_LOCATION_AVAILABILITY",
      targetId: availability.id,
      idempotencyKey: `cancel-availability-${randomUUID()}`,
      reason: "Cancel the future branch exception before it takes effect.",
    });
    expect(cancelled.status).toBe("INACTIVE");
    expect(
      await prisma.restaurantMenuPolicyCommand.count({
        where: { tenantId: fixture.tenantId, companyId: fixture.companyId },
      }),
    ).toBeGreaterThanOrEqual(6);
    expect(
      await prisma.inventoryMovement.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(movementsBefore);
  }, 60_000);
});
