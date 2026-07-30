import { randomUUID } from "node:crypto";
import { Prisma, prisma, type PrismaClient } from "@ogfi/database";
import type { SessionContext } from "../../src/server/services/context";
import {
  inventoryPilotCanonicalJson,
  inventoryPilotDigest,
  type InventoryPilotApprovalFamily,
} from "../../src/server/services/inventoryPilotApprovalPolicy";
import { createSealedApprovalRuleFixture } from "./approvalRulePgFixtures";
import { requestInventoryPilotBootstrap } from "./inventoryPilotApprovalPgBootstrapClient";

type PilotFamily = InventoryPilotApprovalFamily;

export type InventoryPilotApprovalPgFixture = {
  tenantId: string;
  companyId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  sourceInventoryLocationId: string;
  destinationInventoryLocationId: string;
  itemId: string;
  uomId: string;
  requesterUserId: string;
  approverUserId: string;
  transferApprovalRuleId: string;
  stockCountApprovalRuleId: string;
  requesterSession: SessionContext;
  approverSession: SessionContext;
  createDraftTransfer(): Promise<string>;
  createInProgressStockCount(): Promise<{ sessionId: string; attemptId: string }>;
  rollOverActivation(family: PilotFamily): Promise<void>;
};

export type InventoryPilotApprovalPgFixtureOptions = {
  /**
   * Makes the source requester eligible through the same role as an
   * independent approver before graph creation. The graph must remain
   * admissible for the independent actor yet reject the requester/counter.
   */
  requesterIsApprover?: boolean;
};

function makeSession(input: {
  tenantId: string;
  companyId: string;
  userId: string;
  email: string;
  displayName: string;
  locationId: string;
  locationName: string;
  authorizedLocations: Array<{ id: string; name: string; accessLevel: "OPERATE" | "APPROVE" | "MANAGE" }>;
  permissionCodes: string[];
  authenticationSessionId: string;
}) : SessionContext {
  return {
    user: {
      id: input.userId,
      email: input.email,
      displayName: input.displayName,
      role: "Inventory pilot PostgreSQL acceptance",
    },
    context: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      companyName: "Inventory pilot PostgreSQL acceptance",
      brandId: "",
      brandName: "Company-wide",
      locationId: input.locationId,
      locationName: input.locationName,
      locationType: "BRANCH",
    },
    authorizedLocations: input.authorizedLocations.map((location, index) => ({
      tenantId: input.tenantId,
      companyId: input.companyId,
      companyName: "Inventory pilot PostgreSQL acceptance",
      brandId: "",
      brandName: "Company-wide",
      locationId: location.id,
      locationName: location.name,
      locationType: "BRANCH" as const,
      scopeAssignmentId: `inventory-pilot-scope-${input.userId}-${index}`,
      accessLevel: location.accessLevel,
    })),
    permissionCodes: input.permissionCodes,
    authentication: {
      sessionId: input.authenticationSessionId,
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(),
      absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
    },
  };
}

export type PilotConfigurationInput = {
  db: PrismaClient;
  tenantId: string;
  companyId: string;
  actorUserId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  sourceInventoryLocationId: string;
  destinationInventoryLocationId: string;
  itemId: string;
};

type SealedPilotRevision = {
  id: string;
  revisionNumber: number;
  configurationDigest: string;
};

export async function createExactSealedRevision(input: PilotConfigurationInput & {
  revisionNumber: number;
  sourceDecisionId: string;
}): Promise<SealedPilotRevision> {
  const revisionId = randomUUID();
  const endpoints = [
    {
      capability: "COUNT_LOCATION",
      inventoryLocationId: input.destinationInventoryLocationId,
      locationId: input.destinationLocationId,
    },
    {
      capability: "TRANSFER_DESTINATION",
      inventoryLocationId: input.destinationInventoryLocationId,
      locationId: input.destinationLocationId,
    },
    {
      capability: "TRANSFER_SOURCE",
      inventoryLocationId: input.sourceInventoryLocationId,
      locationId: input.sourceLocationId,
    },
  ].sort((left, right) =>
    left.capability.localeCompare(right.capability) ||
    left.inventoryLocationId.localeCompare(right.inventoryLocationId) ||
    left.locationId.localeCompare(right.locationId),
  );
  const canonicalJson = inventoryPilotCanonicalJson({
    schemaVersion: 1,
    tenantId: input.tenantId,
    companyId: input.companyId,
    revisionNumber: input.revisionNumber,
    status: "SEALED",
    sourceDecisionId: input.sourceDecisionId,
    endpoints,
    items: [{ itemId: input.itemId }],
  });
  const configurationDigest = inventoryPilotDigest(JSON.parse(canonicalJson));

  await input.db.$transaction(async (tx) => {
    await tx.inventoryPilotConfigurationRevision.create({
      data: {
        id: revisionId,
        tenantId: input.tenantId,
        companyId: input.companyId,
        revisionNumber: input.revisionNumber,
        schemaVersion: 1,
        status: "SEALED",
        canonicalJson,
        configurationDigest,
        sourceDecisionId: input.sourceDecisionId,
        sealedByUserId: input.actorUserId,
        sealedAt: new Date(),
      },
    });
    await tx.inventoryPilotEndpointMembership.createMany({
      data: endpoints.map((endpoint) => ({
        id: randomUUID(),
        configurationRevisionId: revisionId,
        tenantId: input.tenantId,
        companyId: input.companyId,
        configurationRevisionNumber: input.revisionNumber,
        ...endpoint,
      })),
    });
    await tx.inventoryPilotItemMembership.create({
      data: {
        id: randomUUID(),
        configurationRevisionId: revisionId,
        tenantId: input.tenantId,
        companyId: input.companyId,
        configurationRevisionNumber: input.revisionNumber,
        itemId: input.itemId,
      },
    });

  });
  return { id: revisionId, revisionNumber: input.revisionNumber, configurationDigest };
}

export async function activateSealedRevision(input: PilotConfigurationInput & {
  family: PilotFamily;
  revision: SealedPilotRevision;
  priorActivation?: {
    id: string;
    generation: number;
    currentActivationEventId: string;
  };
}): Promise<void> {
  const activationReason = "Disposable PostgreSQL DEC-0260/0261 acceptance fixture activation.";
  const generation = (input.priorActivation?.generation ?? 0) + 1;
  const priorActivationEventId = input.priorActivation?.currentActivationEventId ?? null;
  const priorGeneration = input.priorActivation?.generation ?? null;
  const eventId = randomUUID();
  const canonicalEvent = inventoryPilotCanonicalJson({
    schemaVersion: 1,
    tenantId: input.tenantId,
    companyId: input.companyId,
    family: input.family,
    status: "ACTIVE",
    configurationRevisionId: input.revision.id,
    configurationRevisionNumber: input.revision.revisionNumber,
    configurationDigest: input.revision.configurationDigest,
    generation,
    priorActivationEventId,
    priorGeneration,
    activatedByUserId: input.actorUserId,
    activationReason,
  });
  await input.db.$transaction(async (tx) => {
    await tx.inventoryPilotFamilyActivationEvent.create({
        data: {
          id: eventId,
          tenantId: input.tenantId,
          companyId: input.companyId,
          family: input.family,
          status: "ACTIVE",
          configurationRevisionId: input.revision.id,
          configurationRevisionNumber: input.revision.revisionNumber,
          configurationDigest: input.revision.configurationDigest,
          generation,
          priorActivationEventId,
          priorGeneration,
          activatedByUserId: input.actorUserId,
          activationReason,
          canonicalJson: canonicalEvent,
          activationHash: inventoryPilotDigest(JSON.parse(canonicalEvent)),
          activatedAt: new Date(),
        },
      });
    if (input.priorActivation) {
      const updated = await tx.inventoryPilotFamilyActivation.updateMany({
        where: {
          id: input.priorActivation.id,
          generation: input.priorActivation.generation,
          currentActivationEventId: input.priorActivation.currentActivationEventId,
        },
        data: {
          configurationRevisionId: input.revision.id,
          configurationRevisionNumber: input.revision.revisionNumber,
          configurationDigest: input.revision.configurationDigest,
          currentActivationEventId: eventId,
          generation,
        },
      });
      if (updated.count !== 1) throw new Error("INVENTORY_PILOT_ACCEPTANCE_ACTIVATION_ROLLOVER_CONFLICT");
      return;
    }
      await tx.inventoryPilotFamilyActivation.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          companyId: input.companyId,
          family: input.family,
          status: "ACTIVE",
          configurationRevisionId: input.revision.id,
          configurationRevisionNumber: input.revision.revisionNumber,
          configurationDigest: input.revision.configurationDigest,
          currentActivationEventId: eventId,
          generation,
        },
      });
  });
}

export async function initializeInventoryPilotConfiguration(input: PilotConfigurationInput) {
  const initialRevision = await createExactSealedRevision({
    ...input,
    revisionNumber: 1,
    sourceDecisionId: "DEC-0261-PG-ACCEPTANCE",
  });
  for (const family of ["InventoryTransfer", "StockCountAttemptReview"] as const) {
    await activateSealedRevision({ ...input, family, revision: initialRevision });
  }
}

export async function rollOverInventoryPilotConfiguration(
  input: PilotConfigurationInput & { family: PilotFamily },
) {
  const current = await input.db.inventoryPilotFamilyActivation.findMany({
    where: { tenantId: input.tenantId, companyId: input.companyId, status: "ACTIVE" },
    orderBy: { family: "asc" },
    select: {
      id: true, family: true, generation: true, currentActivationEventId: true,
      configurationRevisionNumber: true,
    },
  });
  if (
    current.length !== 2 || !current.some((activation) => activation.family === input.family) ||
    new Set(current.map((activation) => activation.configurationRevisionNumber)).size !== 1
  ) {
    throw new Error("INVENTORY_PILOT_ACCEPTANCE_ACTIVATION_ROLLOVER_PRECONDITION_FAILED");
  }
  const nextRevision = await createExactSealedRevision({
    ...input,
    revisionNumber: current[0]!.configurationRevisionNumber + 1,
    sourceDecisionId: "DEC-0261-PG-ROLLOVER",
  });
  await input.db.$transaction(async (tx) => {
    const nextEvents = current.map((activation) => {
      const eventId = randomUUID();
      const generation = activation.generation + 1;
      const activationReason = "Disposable PostgreSQL DEC-0261 acceptance activation rollover.";
      const canonicalJson = inventoryPilotCanonicalJson({
        schemaVersion: 1, tenantId: input.tenantId, companyId: input.companyId,
        family: activation.family, status: "ACTIVE",
        configurationRevisionId: nextRevision.id,
        configurationRevisionNumber: nextRevision.revisionNumber,
        configurationDigest: nextRevision.configurationDigest, generation,
        priorActivationEventId: activation.currentActivationEventId,
        priorGeneration: activation.generation, activatedByUserId: input.actorUserId,
        activationReason,
      });
      return { activation, eventId, generation, activationReason, canonicalJson };
    });
    for (const event of nextEvents) {
      await tx.inventoryPilotFamilyActivationEvent.create({
        data: {
          id: event.eventId, tenantId: input.tenantId, companyId: input.companyId,
          family: event.activation.family, status: "ACTIVE",
          configurationRevisionId: nextRevision.id,
          configurationRevisionNumber: nextRevision.revisionNumber,
          configurationDigest: nextRevision.configurationDigest,
          generation: event.generation,
          priorActivationEventId: event.activation.currentActivationEventId,
          priorGeneration: event.activation.generation,
          activatedByUserId: input.actorUserId,
          activationReason: event.activationReason,
          canonicalJson: event.canonicalJson,
          activationHash: inventoryPilotDigest(JSON.parse(event.canonicalJson)),
          activatedAt: new Date(),
        },
      });
    }
    for (const event of nextEvents) {
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "InventoryPilotFamilyActivation"
           SET "configurationRevisionId" = ${nextRevision.id}::uuid,
               "configurationRevisionNumber" = ${nextRevision.revisionNumber},
               "configurationDigest" = ${nextRevision.configurationDigest},
               generation = ${event.generation},
               "currentActivationEventId" = ${event.eventId}::uuid,
               "updatedAt" = clock_timestamp()
         WHERE id = ${event.activation.id}::uuid
           AND "tenantId" = ${input.tenantId}::uuid
           AND "companyId" = ${input.companyId}::uuid
           AND family = ${event.activation.family}::"InventoryPilotApprovalFamily"
           AND generation = ${event.activation.generation}
           AND "currentActivationEventId" = ${event.activation.currentActivationEventId}::uuid
      `);
      if (updated !== 1) throw new Error("INVENTORY_PILOT_ACCEPTANCE_ACTIVATION_ROLLOVER_CONFLICT");
    }
  });
}

export async function createInventoryPilotApprovalPgFixture(
  db: PrismaClient = prisma,
  options: InventoryPilotApprovalPgFixtureOptions = {},
): Promise<InventoryPilotApprovalPgFixture> {
  const suffix = randomUUID().slice(0, 8);
  const requesterUserId = randomUUID();
  const approverUserId = randomUUID();
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    sourceLocationId: randomUUID(),
    destinationLocationId: randomUUID(),
    sourceInventoryLocationId: randomUUID(),
    destinationInventoryLocationId: randomUUID(),
    uomId: randomUUID(),
    itemCategoryId: randomUUID(),
    itemId: randomUUID(),
    requesterUserId,
    approverUserId,
    requesterAuthSessionId: randomUUID(),
    approverAuthSessionId: randomUUID(),
    requesterRoleId: randomUUID(),
    approverRoleId: randomUUID(),
    transferApprovalRuleId: randomUUID(),
    stockCountApprovalRuleId: randomUUID(),
  };
  const permissionCodes = [
    "inventory.transfer.submit",
    "inventory.transfer.approve",
    "inventory.transfer.cancel",
    "inventory.transfer.dispatch",
    "inventory.stock_count.submit",
    "inventory.stock_count.review",
    "inventory.stock_count.cancel",
  ];
  const permissions = await db.permission.findMany({
    where: { code: { in: permissionCodes } },
    select: { id: true, code: true },
  });
  if (permissions.length !== permissionCodes.length) {
    throw new Error("INVENTORY_PILOT_ACCEPTANCE_PERMISSION_FIXTURE_INCOMPLETE");
  }
  const permissionId = new Map(permissions.map((permission) => [permission.code, permission.id]));
  const requesterCodes = [
    "inventory.transfer.submit",
    "inventory.transfer.cancel",
    "inventory.stock_count.submit",
    "inventory.stock_count.cancel",
  ];
  const approverCodes = [
    "inventory.transfer.approve",
    "inventory.transfer.dispatch",
    "inventory.stock_count.review",
  ];

  await db.tenant.create({
    data: { id: ids.tenantId, name: `Pilot approval ${suffix}`, loginCode: `pap-${suffix}` },
  });
  await db.company.create({
    data: {
      id: ids.companyId,
      tenantId: ids.tenantId,
      code: `PAP-${suffix}`,
      legalName: `Pilot approval ${suffix}`,
      currencyCode: "PHP",
    },
  });
  await db.location.createMany({
    data: [
      { id: ids.sourceLocationId, tenantId: ids.tenantId, companyId: ids.companyId, locationType: "WAREHOUSE", code: `PAP-S-${suffix}`, name: "Pilot source" },
      { id: ids.destinationLocationId, tenantId: ids.tenantId, companyId: ids.companyId, locationType: "BRANCH", code: `PAP-D-${suffix}`, name: "Pilot destination" },
    ],
  });
  await db.inventoryLocation.createMany({
    data: [
      { id: ids.sourceInventoryLocationId, tenantId: ids.tenantId, companyId: ids.companyId, locationId: ids.sourceLocationId, code: `PAP-IS-${suffix}`, name: "Pilot source inventory", status: "ACTIVE" },
      { id: ids.destinationInventoryLocationId, tenantId: ids.tenantId, companyId: ids.companyId, locationId: ids.destinationLocationId, code: `PAP-ID-${suffix}`, name: "Pilot destination inventory", status: "ACTIVE" },
    ],
  });
  await db.uom.create({
    data: { id: ids.uomId, tenantId: ids.tenantId, companyId: ids.companyId, uomCode: `EA-${suffix}`, uomName: "Each", uomType: "COUNT" },
  });
  await db.itemCategory.create({
    data: { id: ids.itemCategoryId, tenantId: ids.tenantId, companyId: ids.companyId, categoryCode: `PAP-C-${suffix}`, categoryName: "Pilot category", inventoryClass: "STOCK" },
  });
  await db.item.create({
    data: {
      id: ids.itemId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      itemCode: `PAP-I-${suffix}`,
      itemName: "Pilot countable item",
      itemCategoryId: ids.itemCategoryId,
      itemType: "INVENTORY",
      baseUomId: ids.uomId,
      purchaseUomId: ids.uomId,
      issueUomId: ids.uomId,
      trackInventory: true,
    },
  });
  await db.user.createMany({
    data: [
      { id: ids.requesterUserId, tenantId: ids.tenantId, email: `pilot-requester-${suffix}@example.test`, displayName: "Pilot requester", status: "ACTIVE", privilegeEpoch: 0 },
      { id: ids.approverUserId, tenantId: ids.tenantId, email: `pilot-approver-${suffix}@example.test`, displayName: "Pilot approver", status: "ACTIVE", privilegeEpoch: 0 },
    ],
  });
  await db.role.create({
    data: {
      id: ids.requesterRoleId,
      tenantId: ids.tenantId,
      code: `PAP_REQUESTER_${suffix}`,
      name: "Pilot requester",
      permissions: { create: requesterCodes.map((code) => ({ permissionId: permissionId.get(code)! })) },
    },
  });
  await db.role.create({
    data: {
      id: ids.approverRoleId,
      tenantId: ids.tenantId,
      code: `PAP_APPROVER_${suffix}`,
      name: "Pilot approver",
      permissions: { create: approverCodes.map((code) => ({ permissionId: permissionId.get(code)! })) },
    },
  });
  const startsAt = new Date(Date.now() - 60_000);
  await db.userRoleAssignment.createMany({
    data: [
      { userId: ids.requesterUserId, roleId: ids.requesterRoleId, startsAt },
      ...(options.requesterIsApprover ? [{ userId: ids.requesterUserId, roleId: ids.approverRoleId, startsAt }] : []),
      { userId: ids.approverUserId, roleId: ids.approverRoleId, startsAt },
    ],
  });
  await db.userScopeAssignment.createMany({
    data: [
      { userId: ids.requesterUserId, scopeType: "LOCATION", scopeId: ids.destinationLocationId, accessLevel: "MANAGE", startsAt },
      ...(options.requesterIsApprover ? [{ userId: ids.requesterUserId, scopeType: "LOCATION" as const, scopeId: ids.sourceLocationId, accessLevel: "APPROVE" as const, startsAt }] : []),
      { userId: ids.approverUserId, scopeType: "LOCATION", scopeId: ids.sourceLocationId, accessLevel: "APPROVE", startsAt },
      { userId: ids.approverUserId, scopeType: "LOCATION", scopeId: ids.destinationLocationId, accessLevel: "APPROVE", startsAt },
    ],
  });
  const expiresAt = new Date(Date.now() + 60 * 60_000);
  await db.authSession.createMany({
    data: [
      {
        id: ids.requesterAuthSessionId,
        tenantId: ids.tenantId,
        userId: ids.requesterUserId,
        tokenHash: `pilot-requester-session-${suffix}`,
        status: "ACTIVE",
        assuranceLevel: "MFA",
        mfaAuthenticatedAt: new Date(),
        privilegeEpochAtIssue: 0,
        idleExpiresAt: expiresAt,
        absoluteExpiresAt: expiresAt,
      },
      {
        id: ids.approverAuthSessionId,
        tenantId: ids.tenantId,
        userId: ids.approverUserId,
        tokenHash: `pilot-approver-session-${suffix}`,
        status: "ACTIVE",
        assuranceLevel: "MFA",
        mfaAuthenticatedAt: new Date(),
        privilegeEpochAtIssue: 0,
        idleExpiresAt: expiresAt,
        absoluteExpiresAt: expiresAt,
      },
    ],
  });
  await createSealedApprovalRuleFixture(db, {
    data: {
      id: ids.transferApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "InventoryTransfer",
      priority: 1,
      steps: {
        create: {
          stepOrder: 1,
          approverType: options.requesterIsApprover ? "ROLE" : "USER",
          ...(options.requesterIsApprover
            ? { roleId: ids.approverRoleId }
            : { userId: ids.approverUserId }),
        },
      },
    },
  });
  await createSealedApprovalRuleFixture(db, {
    data: {
      id: ids.stockCountApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "StockCountAttemptReview",
      priority: 1,
      steps: {
        create: {
          stepOrder: 1,
          approverType: options.requesterIsApprover ? "ROLE" : "USER",
          ...(options.requesterIsApprover
            ? { roleId: ids.approverRoleId }
            : { userId: ids.approverUserId }),
        },
      },
    },
  });
  await requestInventoryPilotBootstrap({
    action: "INITIALIZE",
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    actorUserId: ids.requesterUserId,
    sourceLocationId: ids.sourceLocationId,
    destinationLocationId: ids.destinationLocationId,
    sourceInventoryLocationId: ids.sourceInventoryLocationId,
    destinationInventoryLocationId: ids.destinationInventoryLocationId,
    itemId: ids.itemId,
  });

  const requesterSession = makeSession({
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    userId: ids.requesterUserId,
    email: `pilot-requester-${suffix}@example.test`,
    displayName: "Pilot requester",
    locationId: ids.destinationLocationId,
    locationName: "Pilot destination",
    authorizedLocations: [
      { id: ids.destinationLocationId, name: "Pilot destination", accessLevel: "MANAGE" },
      ...(options.requesterIsApprover ? [{ id: ids.sourceLocationId, name: "Pilot source", accessLevel: "APPROVE" as const }] : []),
    ],
    permissionCodes: options.requesterIsApprover ? [...requesterCodes, ...approverCodes] : requesterCodes,
    authenticationSessionId: ids.requesterAuthSessionId,
  });
  const approverSession = makeSession({
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    userId: ids.approverUserId,
    email: `pilot-approver-${suffix}@example.test`,
    displayName: "Pilot approver",
    locationId: ids.sourceLocationId,
    locationName: "Pilot source",
    authorizedLocations: [
      { id: ids.sourceLocationId, name: "Pilot source", accessLevel: "APPROVE" },
      { id: ids.destinationLocationId, name: "Pilot destination", accessLevel: "APPROVE" },
    ],
    permissionCodes: approverCodes,
    authenticationSessionId: ids.approverAuthSessionId,
  });

  async function createDraftTransfer() {
    const id = randomUUID();
    await db.inventoryTransfer.create({
      data: {
        id,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `PAP-TR-${randomUUID().slice(0, 8)}`,
        sourceLocationId: ids.sourceLocationId,
        destinationLocationId: ids.destinationLocationId,
        requestedByUserId: ids.requesterUserId,
        transferType: "BRANCH_REPLENISHMENT",
        purpose: "Disposable PostgreSQL approval acceptance",
        lines: {
          create: {
            id: randomUUID(), tenantId: ids.tenantId, companyId: ids.companyId,
            sourceInventoryLocationId: ids.sourceInventoryLocationId,
            destinationInventoryLocationId: ids.destinationInventoryLocationId,
            itemId: ids.itemId, uomId: ids.uomId, lineNumber: 1,
            description: "Pilot item", requestedQty: 2,
          },
        },
      },
    });
    return id;
  }

  async function createInProgressStockCount() {
    const sessionId = randomUUID();
    const attemptId = randomUUID();
    const legacyLineId = randomUUID();
    const now = new Date();
    await db.stockCountSession.create({
      data: {
        id: sessionId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        inventoryLocationId: ids.destinationInventoryLocationId,
        publicReference: `PAP-SC-${randomUUID().slice(0, 8)}`,
        countType: "CYCLE",
        status: "IN_PROGRESS",
        startedAt: now,
        createdByUserId: ids.requesterUserId,
        assignedToUserId: ids.requesterUserId,
        lines: {
          create: {
            id: legacyLineId, tenantId: ids.tenantId, companyId: ids.companyId,
            inventoryLocationId: ids.destinationInventoryLocationId, itemId: ids.itemId,
            uomId: ids.uomId, lineNumber: 1, systemQuantityBaseUom: 2,
            countedQuantityBaseUom: 2, varianceQuantityBaseUom: 0,
            countedByUserId: ids.requesterUserId, countedAt: now,
          },
        },
      },
    });
    await db.stockCountAttempt.create({
      data: {
        id: attemptId, stockCountSessionId: sessionId,
        tenantId: ids.tenantId, companyId: ids.companyId,
        inventoryLocationId: ids.destinationInventoryLocationId, attemptNumber: 1,
        status: "IN_PROGRESS", startedAt: now, createdByUserId: ids.requesterUserId,
        assignedToUserId: ids.requesterUserId,
        lines: {
          create: {
            id: randomUUID(), tenantId: ids.tenantId, companyId: ids.companyId,
            inventoryLocationId: ids.destinationInventoryLocationId, itemId: ids.itemId,
            uomId: ids.uomId, lineNumber: 1, systemQuantityBaseUom: 2,
            countedQuantityBaseUom: 2, varianceQuantityBaseUom: 0,
            countedByUserId: ids.requesterUserId, countedAt: now,
            legacyStockCountLineId: legacyLineId,
          },
        },
      },
    });
    await db.stockCountSession.update({
      where: { id: sessionId },
      data: { currentAttemptId: attemptId },
    });
    return { sessionId, attemptId };
  }

  async function rollOverActivation(family: PilotFamily) {
    await requestInventoryPilotBootstrap({
      action: "ROLLOVER",
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      actorUserId: ids.requesterUserId,
      sourceLocationId: ids.sourceLocationId,
      destinationLocationId: ids.destinationLocationId,
      sourceInventoryLocationId: ids.sourceInventoryLocationId,
      destinationInventoryLocationId: ids.destinationInventoryLocationId,
      itemId: ids.itemId,
      family,
    });
  }

  return {
    ...ids,
    requesterSession,
    approverSession,
    createDraftTransfer,
    createInProgressStockCount,
    rollOverActivation,
  };
}

export function actionForm(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}
