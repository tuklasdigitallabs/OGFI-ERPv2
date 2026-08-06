import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import type { SessionContext } from "../../src/server/services/context";
import {
  createInventoryPilotConfigurationDraft,
  evaluateInventoryPilotConfigurationReadiness,
  sealInventoryPilotConfigurationDraft,
  updateInventoryPilotConfigurationDraft,
} from "../../src/server/services/inventoryPilotConfiguration";
import { permissions } from "../../src/server/services/authorization";
import { createSealedApprovalRuleFixture } from "./approvalRulePgFixtures";

const families = [
  ["PurchaseRequest", "PURCHASE_REQUEST", permissions.purchaseRequestApprove],
  [
    "QuotationRecommendation",
    "QuotationRecommendation",
    permissions.quoteApprove,
  ],
  ["PurchaseOrder", "PurchaseOrder", permissions.purchaseOrderApprove],
  ["InventoryTransfer", "InventoryTransfer", permissions.transferApprove],
  [
    "StockCountAttemptReview",
    "StockCountAttemptReview",
    permissions.stockCountReview,
  ],
  ["WastageReport", "WastageReport", permissions.wastageApprove],
  ["StockAdjustment", "StockAdjustment", permissions.stockAdjustmentApprove],
  [
    "OpeningInventoryCutover",
    "OpeningInventoryCutover",
    permissions.openingInventoryOperationsReview,
  ],
] as const;

const responsibilities = [
  ["PREPARER", [permissions.openingInventoryPrepare], "OPERATE"],
  ["SUBMITTER", [permissions.openingInventorySubmit], "OPERATE"],
  [
    "OPERATIONS_REVIEWER",
    [permissions.openingInventoryOperationsReview],
    "APPROVE",
  ],
  [
    "ACCOUNTING_REVIEWER",
    [permissions.openingInventoryAccountingReview],
    "APPROVE",
  ],
  [
    "COMMAND_REQUESTER",
    [
      permissions.openingInventoryRequestExecute,
      permissions.openingInventoryRequestActivate,
      permissions.openingInventoryRequestReverse,
    ],
    "APPROVE",
  ],
] as const;

export type ConfigurationV2SealedFixtureResult = {
  revisionId: string;
  revisionNumber: number;
  digest: string;
};

function fixtureSession(input: {
  userId: string;
  email: string;
  displayName: string;
  tenantId: string;
  companyId: string;
  companyName: string;
  locationId: string;
  locationName: string;
  sessionId: string;
}): SessionContext {
  return {
    user: {
      id: input.userId,
      email: input.email,
      displayName: input.displayName,
      role: "Disposable pilot configuration fixture",
    },
    context: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      companyName: input.companyName,
      brandId: "",
      brandName: "Company-wide",
      locationId: input.locationId,
      locationName: input.locationName,
      locationType: "BRANCH",
    },
    authorizedLocations: [
      {
        tenantId: input.tenantId,
        companyId: input.companyId,
        companyName: input.companyName,
        brandId: "",
        brandName: "Company-wide",
        locationId: input.locationId,
        locationName: input.locationName,
        locationType: "BRANCH",
        scopeAssignmentId: `fixture-company-manage-${input.userId}`,
        accessLevel: "MANAGE",
      },
    ],
    permissionCodes: [],
    authentication: {
      sessionId: input.sessionId,
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(),
      absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
    },
  };
}

function assertFixture(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function parseJsonRecord(value: string | null, code: string) {
  if (!value) throw new Error(code);
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(code);
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(code);
  }
}

/**
 * Disposable-only browser fixture. It deliberately provisions supporting
 * identities and approval rules with Prisma, but the configuration itself is
 * authored and sealed exclusively by the DEC-0273 service boundary.
 */
export async function createConfigurationV2SealedFixture(): Promise<ConfigurationV2SealedFixtureResult> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const id = () => randomUUID();
  const tenantCode = process.env.OGFI_PRODUCTION_AUTH_E2E_TENANT_CODE ?? "ogfi";
  const privilegedEmail =
    process.env.OGFI_PRODUCTION_AUTH_E2E_PRIVILEGED_EMAIL ??
    process.env.DEMO_ADMIN_EMAIL ??
    "erp.admin@ogfi.example";
  const privilegedUser = await prisma.user.findFirst({
    where: {
      email: { equals: privilegedEmail, mode: "insensitive" },
      status: "ACTIVE",
      tenant: { loginCode: tenantCode, status: "ACTIVE" },
    },
    select: { id: true, tenantId: true },
  });
  assertFixture(
    privilegedUser,
    "CONFIGURATION_V2_FIXTURE_PRIVILEGED_USER_NOT_FOUND",
  );
  const browserScope = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: privilegedUser.id,
      scopeType: "COMPANY",
      accessLevel: "MANAGE",
      status: "ACTIVE",
    },
    orderBy: { id: "asc" },
    select: { scopeId: true },
  });
  assertFixture(
    browserScope,
    "CONFIGURATION_V2_FIXTURE_BROWSER_COMPANY_SCOPE_MISSING",
  );
  const company = await prisma.company.findFirst({
    where: {
      id: browserScope.scopeId,
      tenantId: privilegedUser.tenantId,
      status: "ACTIVE",
    },
    select: { id: true, tenantId: true, legalName: true },
  });
  assertFixture(company, "CONFIGURATION_V2_FIXTURE_BROWSER_COMPANY_NOT_FOUND");

  const fixtureLocationId = id();
  const fixtureInventoryLocationId = id();
  const fixtureCategoryId = id();
  const fixtureUomId = id();
  const fixtureItemId = id();
  const creatorId = id();
  const editorId = id();
  const sealerId = id();
  const creatorSessionId = id();
  const editorSessionId = id();
  const sealerSessionId = id();
  const routeActorId = id();
  const operationsRouteActorId = id();
  const accountingRouteActorId = id();
  const creatorRoleId = id();
  const editorRoleId = id();
  const sealerRoleId = id();
  const routeRoleId = id();
  const operationsRouteRoleId = id();
  const accountingRouteRoleId = id();
  const participantIds = responsibilities.map(() => id());
  const participantRoleIds = responsibilities.map(() => id());
  const participantAssignmentIds = responsibilities.map(() => id());

  await prisma.location.create({
    data: {
      id: fixtureLocationId,
      tenantId: company.tenantId,
      companyId: company.id,
      locationType: "BRANCH",
      code: `E2E-PI-${suffix}`,
      name: `Disposable pilot configuration ${suffix}`,
    },
  });
  await prisma.inventoryLocation.create({
    data: {
      id: fixtureInventoryLocationId,
      tenantId: company.tenantId,
      companyId: company.id,
      locationId: fixtureLocationId,
      code: `E2E-PI-${suffix}`,
      name: `Disposable pilot inventory ${suffix}`,
    },
  });
  await prisma.itemCategory.create({
    data: {
      id: fixtureCategoryId,
      tenantId: company.tenantId,
      companyId: company.id,
      categoryCode: `E2E-PI-${suffix}`,
      categoryName: `Disposable pilot category ${suffix}`,
      inventoryClass: "FOOD",
    },
  });
  await prisma.uom.create({
    data: {
      id: fixtureUomId,
      tenantId: company.tenantId,
      companyId: company.id,
      uomCode: `E2E-${suffix}`,
      uomName: `Disposable unit ${suffix}`,
      uomType: "COUNT",
    },
  });
  await prisma.item.create({
    data: {
      id: fixtureItemId,
      tenantId: company.tenantId,
      companyId: company.id,
      itemCode: `E2E-PI-${suffix}`,
      itemName: `Disposable pilot item ${suffix}`,
      itemCategoryId: fixtureCategoryId,
      itemType: "INVENTORY",
      baseUomId: fixtureUomId,
      trackInventory: true,
    },
  });

  const fixtureUsers = [
    [creatorId, "creator", "Pilot configuration creator"],
    [editorId, "editor", "Pilot configuration editor"],
    [sealerId, "sealer", "Pilot configuration sealer"],
    [routeActorId, "route", "Pilot route actor"],
    [operationsRouteActorId, "ops-route", "Pilot opening operations actor"],
    [
      accountingRouteActorId,
      "accounting-route",
      "Pilot opening accounting actor",
    ],
    ...participantIds.map(
      (userId, index) =>
        [
          userId,
          `participant-${index + 1}`,
          `Pilot participant ${index + 1}`,
        ] as const,
    ),
  ] as const;
  await prisma.user.createMany({
    data: fixtureUsers.map(([userId, label, displayName]) => ({
      id: userId,
      tenantId: company.tenantId,
      email: `${label}-${suffix}@fixture.invalid`,
      displayName,
    })),
  });

  const permissionCodes = [
    ...new Set([
      permissions.inventoryPilotConfigurationView,
      permissions.inventoryPilotConfigurationDraft,
      permissions.inventoryPilotConfigurationSeal,
      ...families.map(([, , permissionCode]) => permissionCode),
      ...responsibilities.flatMap(([, permissionCodes]) => permissionCodes),
      permissions.openingInventoryAccountingReview,
    ]),
  ];
  for (const code of permissionCodes) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: {
        tenantId: null,
        code,
        module: "inventory",
        action: code.split(".").at(-1) ?? "manage",
      },
    });
  }
  const permissionRows = await prisma.permission.findMany({
    where: { code: { in: permissionCodes } },
    select: { id: true, code: true },
  });
  const permissionIds = new Map(
    permissionRows.map((row) => [row.code, row.id]),
  );
  if (permissionIds.size !== permissionCodes.length) {
    throw new Error("CONFIGURATION_V2_FIXTURE_PERMISSION_CATALOG_INCOMPLETE");
  }

  await prisma.role.createMany({
    data: [
      {
        id: creatorRoleId,
        tenantId: company.tenantId,
        code: `E2E-PI-CREATOR-${suffix}`,
        name: "Disposable pilot creator",
      },
      {
        id: editorRoleId,
        tenantId: company.tenantId,
        code: `E2E-PI-EDITOR-${suffix}`,
        name: "Disposable pilot editor",
      },
      {
        id: sealerRoleId,
        tenantId: company.tenantId,
        code: `E2E-PI-SEALER-${suffix}`,
        name: "Disposable pilot sealer",
      },
      {
        id: routeRoleId,
        tenantId: company.tenantId,
        code: `E2E-PI-ROUTE-${suffix}`,
        name: "Disposable pilot route actor",
      },
      {
        id: operationsRouteRoleId,
        tenantId: company.tenantId,
        code: `E2E-PI-OPS-${suffix}`,
        name: "Disposable opening operations route",
      },
      {
        id: accountingRouteRoleId,
        tenantId: company.tenantId,
        code: `E2E-PI-ACCOUNTING-${suffix}`,
        name: "Disposable opening accounting route",
      },
      ...responsibilities.map(([responsibility], index) => ({
        id: participantRoleIds[index]!,
        tenantId: company.tenantId,
        code: `E2E-PI-${responsibility}-${suffix}`,
        name: `Disposable pilot ${responsibility.toLowerCase().replaceAll("_", " ")}`,
      })),
    ],
  });
  const grants = [
    ...[
      permissions.inventoryPilotConfigurationView,
      permissions.inventoryPilotConfigurationDraft,
    ].map((code) => ({
      roleId: creatorRoleId,
      permissionId: permissionIds.get(code)!,
    })),
    ...[
      permissions.inventoryPilotConfigurationView,
      permissions.inventoryPilotConfigurationDraft,
    ].map((code) => ({
      roleId: editorRoleId,
      permissionId: permissionIds.get(code)!,
    })),
    ...[
      permissions.inventoryPilotConfigurationView,
      permissions.inventoryPilotConfigurationSeal,
    ].map((code) => ({
      roleId: sealerRoleId,
      permissionId: permissionIds.get(code)!,
    })),
    ...families
      .filter(([family]) => family !== "OpeningInventoryCutover")
      .map(([, , code]) => ({
        roleId: routeRoleId,
        permissionId: permissionIds.get(code)!,
      })),
    {
      roleId: operationsRouteRoleId,
      permissionId: permissionIds.get(
        permissions.openingInventoryOperationsReview,
      )!,
    },
    {
      roleId: accountingRouteRoleId,
      permissionId: permissionIds.get(
        permissions.openingInventoryAccountingReview,
      )!,
    },
    ...responsibilities.flatMap(([, codes], index) =>
      codes.map((code) => ({
        roleId: participantRoleIds[index]!,
        permissionId: permissionIds.get(code)!,
      })),
    ),
  ];
  await prisma.rolePermission.createMany({
    data: grants,
    skipDuplicates: true,
  });

  await prisma.userRoleAssignment.createMany({
    data: [
      { userId: creatorId, roleId: creatorRoleId },
      { userId: editorId, roleId: editorRoleId },
      { userId: sealerId, roleId: sealerRoleId },
      { userId: routeActorId, roleId: routeRoleId },
      { userId: operationsRouteActorId, roleId: operationsRouteRoleId },
      { userId: accountingRouteActorId, roleId: accountingRouteRoleId },
      ...participantIds.map((userId, index) => ({
        id: participantAssignmentIds[index]!,
        userId,
        roleId: participantRoleIds[index]!,
      })),
    ],
  });
  await prisma.userScopeAssignment.createMany({
    data: [
      ...[creatorId, editorId, sealerId].map((userId) => ({
        userId,
        scopeType: "COMPANY" as const,
        scopeId: company.id,
        accessLevel: "MANAGE" as const,
      })),
      ...[routeActorId, operationsRouteActorId, accountingRouteActorId].map(
        (userId) => ({
          userId,
          scopeType: "COMPANY" as const,
          scopeId: company.id,
          accessLevel: "APPROVE" as const,
        }),
      ),
      ...participantIds.map((userId, index) => ({
        userId,
        scopeType: "COMPANY" as const,
        scopeId: company.id,
        accessLevel: responsibilities[index]![2],
      })),
    ],
  });

  const sessionExpiry = new Date(Date.now() + 60 * 60_000);
  await prisma.authSession.createMany({
    data: [
      [creatorSessionId, creatorId, "creator"],
      [editorSessionId, editorId, "editor"],
      [sealerSessionId, sealerId, "sealer"],
    ].map(([sessionId, userId, label]) => ({
      id: sessionId,
      tenantId: company.tenantId,
      userId,
      tokenHash: createHash("sha256")
        .update(`configuration-v2-${label}-${suffix}`)
        .digest("hex"),
      status: "ACTIVE",
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(),
      privilegeEpochAtIssue: 0,
      idleExpiresAt: sessionExpiry,
      absoluteExpiresAt: sessionExpiry,
    })),
  });
  // The fixture needs exactly one normal DEFAULT PR route and one PR_EMERGENCY
  // route so the captured resolver evidence proves the non-emergency path.
  // These changes are confined to the per-run disposable database.
  const transactionTypes = families.map(
    ([, transactionType]) => transactionType,
  );
  await prisma.approvalRule.updateMany({
    where: {
      tenantId: company.tenantId,
      companyId: company.id,
      transactionType: { in: transactionTypes },
      isActive: true,
    },
    data: { isActive: false },
  });
  const routeRuleIds = new Map<string, string>();
  for (const [family, transactionType] of families) {
    const ruleId = id();
    routeRuleIds.set(family, ruleId);
    await createSealedApprovalRuleFixture(prisma, {
      data: {
        id: ruleId,
        tenantId: company.tenantId,
        companyId: company.id,
        transactionType,
        routeKey: "DEFAULT",
        priority: 10,
        isActive: true,
        steps: {
          create:
            family === "OpeningInventoryCutover"
              ? [
                  {
                    stepOrder: 1,
                    approverType: "ROLE",
                    roleId: operationsRouteRoleId,
                    userId: null,
                    required: true,
                  },
                  {
                    stepOrder: 2,
                    approverType: "ROLE",
                    roleId: accountingRouteRoleId,
                    userId: null,
                    required: true,
                  },
                ]
              : [
                  {
                    stepOrder: 1,
                    approverType: "ROLE",
                    roleId: routeRoleId,
                    userId: null,
                    required: true,
                  },
                ],
        },
      },
    });
  }
  const emergencyPurchaseRequestRuleId = id();
  await createSealedApprovalRuleFixture(prisma, {
    data: {
      id: emergencyPurchaseRequestRuleId,
      tenantId: company.tenantId,
      companyId: company.id,
      transactionType: "PURCHASE_REQUEST",
      routeKey: "PR_EMERGENCY",
      scopeFilters: { route: "emergency_purchase", emergency: true },
      priority: 5,
      isActive: true,
      steps: {
        create: [
          {
            stepOrder: 1,
            approverType: "ROLE",
            roleId: routeRoleId,
            userId: null,
            required: true,
          },
        ],
      },
    },
  });

  const creator = fixtureSession({
    userId: creatorId,
    email: `creator-${suffix}@fixture.invalid`,
    displayName: "Pilot configuration creator",
    tenantId: company.tenantId,
    companyId: company.id,
    companyName: company.legalName,
    locationId: fixtureLocationId,
    locationName: `Disposable pilot configuration ${suffix}`,
    sessionId: creatorSessionId,
  });
  const editor = fixtureSession({
    userId: editorId,
    email: `editor-${suffix}@fixture.invalid`,
    displayName: "Pilot configuration editor",
    tenantId: company.tenantId,
    companyId: company.id,
    companyName: company.legalName,
    locationId: fixtureLocationId,
    locationName: `Disposable pilot configuration ${suffix}`,
    sessionId: editorSessionId,
  });
  const sealer = fixtureSession({
    userId: sealerId,
    email: `sealer-${suffix}@fixture.invalid`,
    displayName: "Pilot configuration sealer",
    tenantId: company.tenantId,
    companyId: company.id,
    companyName: company.legalName,
    locationId: fixtureLocationId,
    locationName: `Disposable pilot configuration ${suffix}`,
    sessionId: sealerSessionId,
  });

  const draft = await createInventoryPilotConfigurationDraft(creator, {
    reason: "Create the isolated sealed-v2 browser fixture draft.",
  });
  const configured = await updateInventoryPilotConfigurationDraft(editor, {
    draftId: draft.id,
    expectedVersion: draft.version,
    endpoints: [
      "TRANSFER_SOURCE",
      "TRANSFER_DESTINATION",
      "COUNT_LOCATION",
      "OPENING_STOCK_LOCATION",
    ].map((capability) => ({
      capability,
      inventoryLocationId: fixtureInventoryLocationId,
    })),
    itemIds: [fixtureItemId],
    participants: responsibilities.map(([responsibility], index) => ({
      responsibility,
      userId: participantIds[index]!,
      roleAssignmentId: participantAssignmentIds[index]!,
    })),
    routeBindings: families.map(([family]) => ({
      family,
      approvalRuleId: routeRuleIds.get(family)!,
    })),
    reason:
      "Capture the complete sealed-v2 browser fixture readiness evidence.",
  });
  const readiness = await evaluateInventoryPilotConfigurationReadiness(editor, {
    draftId: configured.id,
  });
  if (readiness.blocking || readiness.blockers.length !== 0) {
    throw new Error("CONFIGURATION_V2_FIXTURE_READINESS_BLOCKED");
  }
  const sealed = await sealInventoryPilotConfigurationDraft(sealer, {
    draftId: configured.id,
    expectedVersion: configured.version,
    idempotencyKey: `configuration-v2-sealed-${suffix}`,
    reason:
      "Seal the isolated browser fixture after independent readiness review.",
  });
  if (sealed.replayed)
    throw new Error("CONFIGURATION_V2_FIXTURE_UNEXPECTED_REPLAY");

  const revision = await prisma.inventoryPilotConfigurationRevision.findFirst({
    where: {
      id: sealed.revision.id,
      tenantId: company.tenantId,
      companyId: company.id,
    },
    include: { routeReadinessMemberships: { orderBy: { family: "asc" } } },
  });
  assertFixture(revision, "CONFIGURATION_V2_FIXTURE_REVISION_NOT_FOUND");
  if (
    revision.schemaVersion !== 2 ||
    revision.routeReadinessMemberships.length !== 8 ||
    !/^[a-f0-9]{64}$/.test(revision.configurationDigest)
  ) {
    throw new Error("CONFIGURATION_V2_FIXTURE_SEAL_ASSERTION_FAILED");
  }
  const purchaseRequestEvidence = revision.routeReadinessMemberships.find(
    (row) => row.family === "PurchaseRequest",
  );
  assertFixture(
    purchaseRequestEvidence,
    "CONFIGURATION_V2_FIXTURE_PR_EVIDENCE_MISSING",
  );
  const evidence = parseJsonRecord(
    purchaseRequestEvidence.resolverEvidenceCanonicalJson,
    "CONFIGURATION_V2_FIXTURE_PR_EVIDENCE_INVALID",
  );
  const input = evidence.resolverInput as Record<string, unknown> | undefined;
  const outcome = evidence.resolverOutcome as
    | Record<string, unknown>
    | undefined;
  if (
    input?.resolverId !== "purchase_request_approval_rule_v1" ||
    input?.isEmergency !== false ||
    outcome?.selectedApprovalRuleId !== routeRuleIds.get("PurchaseRequest") ||
    outcome?.routeType !== "normal" ||
    outcome?.fallbackUsed !== false ||
    outcome?.requiredRouteKey !== "DEFAULT" ||
    !purchaseRequestEvidence.resolverEvidenceDigest ||
    !/^[a-f0-9]{64}$/.test(purchaseRequestEvidence.resolverEvidenceDigest)
  ) {
    throw new Error("CONFIGURATION_V2_FIXTURE_PR_EVIDENCE_INVALID");
  }
  const activePurchaseRequestRules = await prisma.approvalRule.findMany({
    where: {
      tenantId: company.tenantId,
      companyId: company.id,
      transactionType: "PURCHASE_REQUEST",
      isActive: true,
      definitionSealed: true,
    },
    select: { id: true, routeKey: true },
  });
  if (
    activePurchaseRequestRules.length !== 2 ||
    !activePurchaseRequestRules.some(
      (rule) =>
        rule.id === routeRuleIds.get("PurchaseRequest") &&
        rule.routeKey === "DEFAULT",
    ) ||
    !activePurchaseRequestRules.some(
      (rule) =>
        rule.id === emergencyPurchaseRequestRuleId &&
        rule.routeKey === "PR_EMERGENCY",
    )
  ) {
    throw new Error("CONFIGURATION_V2_FIXTURE_PR_ROUTE_CONTRACT_INVALID");
  }

  return {
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    digest: revision.configurationDigest,
  };
}
