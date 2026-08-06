import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { SessionContext } from "../src/server/services/context";
import type * as PilotConfigurationService from "../src/server/services/inventoryPilotConfiguration";
import type * as OpeningInventoryService from "../src/server/services/openingInventoryCutovers";
import { permissions } from "../src/server/services/authorization";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import { createSealedApprovalRuleFixture } from "./helpers/approvalRulePgFixtures";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
if (!process.env.DATABASE_URL) {
  throw new Error("INVENTORY_PILOT_CONFIGURATION_DATABASE_REQUIRED");
}

const capabilities = [
  "TRANSFER_SOURCE",
  "TRANSFER_DESTINATION",
  "COUNT_LOCATION",
  "OPENING_STOCK_LOCATION",
] as const;
const responsibilities = [
  "PREPARER",
  "SUBMITTER",
  "OPERATIONS_REVIEWER",
  "ACCOUNTING_REVIEWER",
  "COMMAND_REQUESTER",
] as const;
const routeFamilies = [
  ["PurchaseRequest", "PURCHASE_REQUEST", permissions.purchaseRequestApprove],
  ["QuotationRecommendation", "QuotationRecommendation", permissions.quoteApprove],
  ["PurchaseOrder", "PurchaseOrder", permissions.purchaseOrderApprove],
  ["InventoryTransfer", "InventoryTransfer", permissions.transferApprove],
  ["StockCountAttemptReview", "StockCountAttemptReview", permissions.stockCountReview],
  ["WastageReport", "WastageReport", permissions.wastageApprove],
  ["StockAdjustment", "StockAdjustment", permissions.stockAdjustmentApprove],
  ["OpeningInventoryCutover", "OpeningInventoryCutover", permissions.openingInventoryOperationsReview],
] as const;
const participantPermissionCodes = [
  permissions.openingInventoryPrepare,
  permissions.openingInventorySubmit,
  permissions.openingInventoryOperationsReview,
  permissions.openingInventoryAccountingReview,
  permissions.openingInventoryRequestExecute,
  permissions.openingInventoryRequestActivate,
  permissions.openingInventoryRequestReverse,
] as const;
const configurationPermissionCodes = [
  permissions.inventoryPilotConfigurationView,
  permissions.inventoryPilotConfigurationDraft,
  permissions.inventoryPilotConfigurationSeal,
] as const;

describe("DEC-0273 inventory pilot configuration PostgreSQL controls", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const id = () => randomUUID();
  const ids = {
    tenant: id(), company: id(), adjacentCompany: id(), foreignTenant: id(), foreignCompany: id(),
    location: id(), adjacentLocation: id(), inactiveLocation: id(), foreignLocation: id(),
    inventoryLocation: id(), adjacentInventoryLocation: id(), inactiveInventoryLocation: id(),
    category: id(), uom: id(), item: id(), adjacentCategory: id(), adjacentUom: id(), adjacentItem: id(), inactiveItem: id(),
    creator: id(), editor: id(), sealer: id(), wrongScopeActor: id(), routeActor: id(), accountingRouteActor: id(), dualRouteActorA: id(), dualRouteActorB: id(),
    creatorRole: id(), editorRole: id(), sealerRole: id(), participantRole: id(), routeRole: id(), accountingRouteRole: id(), dualRouteRole: id(), wrongScopeRole: id(),
    creatorRoleAssignment: id(), editorRoleAssignment: id(), sealerRoleAssignment: id(), routeRoleAssignment: id(), accountingRouteRoleAssignment: id(), dualRouteRoleAssignmentA: id(), dualRouteRoleAssignmentB: id(), wrongScopeRoleAssignment: id(),
    creatorSession: id(), editorSession: id(), sealerSession: id(), foreignUser: id(), foreignRole: id(), foreignRoleAssignment: id(), foreignSession: id(),
  };
  const crowdedRoleId = id();
  const crowdedValidActorId = id();
  const crowdedWrongActors = Array.from({ length: 50 }, (_, index) => ({ id: id(), index }));
  const participantUsers = responsibilities.map(() => id());
  const participantAssignments = responsibilities.map(() => id());
  const routeRuleIds = new Map<string, string>();
  const adjacentRuleId = id();
  let prisma: PrismaClient;
  let pilot: typeof PilotConfigurationService;
  let opening: typeof OpeningInventoryService;
  let creatorSession: SessionContext;
  let editorSession: SessionContext;
  let sealerSession: SessionContext;
  let adjacentCompanySession: SessionContext;
  let adjacentCompanySealerSession: SessionContext;
  let foreignTenantSession: SessionContext;
  let firstRevisionId = "";
  let latestRevisionId = "";
  let existingCohortId = "";

  function sessionFor(user: { id: string; email: string; name: string }, companyId: string, locationId: string, authSessionId: string, tenantId = ids.tenant): SessionContext {
    return {
      user: { id: user.id, email: user.email, displayName: user.name, role: "Pilot configuration test role" },
      context: {
        tenantId,
        companyId,
        companyName: `Pilot Company ${suffix}`,
        brandId: "",
        brandName: "Company-wide",
        locationId,
        locationName: `Pilot Location ${suffix}`,
        locationType: "BRANCH",
      },
      authorizedLocations: [{
        tenantId,
        companyId,
        companyName: `Pilot Company ${suffix}`,
        brandId: "",
        brandName: "Company-wide",
        locationId,
        locationName: `Pilot Location ${suffix}`,
        locationType: "BRANCH",
        scopeAssignmentId: `pilot-session-${suffix}`,
        accessLevel: "MANAGE",
      }],
      permissionCodes: [],
      authentication: {
        sessionId: authSessionId,
        assuranceLevel: "MFA",
        mfaAuthenticatedAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    };
  }

  function fullSelection(overrides: {
    inventoryLocationId?: string;
    itemId?: string;
    participantUserId?: string;
    participantRoleAssignmentId?: string;
    routeFamily?: (typeof routeFamilies)[number][0];
    routeRuleId?: string;
  } = {}) {
    return {
      endpoints: capabilities.map((capability) => ({ capability, inventoryLocationId: overrides.inventoryLocationId ?? ids.inventoryLocation })),
      itemIds: [overrides.itemId ?? ids.item],
      participants: responsibilities.map((responsibility, index) => ({
        responsibility,
        userId: index === 0 && overrides.participantUserId ? overrides.participantUserId : participantUsers[index]!,
        roleAssignmentId: index === 0 && overrides.participantRoleAssignmentId ? overrides.participantRoleAssignmentId : participantAssignments[index]!,
      })),
      routeBindings: routeFamilies.map(([family]) => ({
        family,
        approvalRuleId: family === (overrides.routeFamily ?? "PurchaseRequest") && overrides.routeRuleId ? overrides.routeRuleId : routeRuleIds.get(family)!,
      })),
    };
  }

  async function createConfiguredSuccessor(predecessorRevisionId: string) {
    const draft = await pilot.createInventoryPilotConfigurationSuccessorDraft(creatorSession, {
      predecessorRevisionId,
      reason: "Prepare a controlled successor configuration.",
    });
    return pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: draft.id,
      expectedVersion: draft.version,
      ...fullSelection(),
      reason: "Confirm the cloned configuration evidence before sealing.",
    });
  }

  async function createOpeningRouteFixture(
    priority: number,
    _label: string,
    steps: Array<{ stepOrder: number; roleId: string }>,
  ) {
    await prisma.approvalRule.updateMany({
      where: {
        tenantId: ids.tenant,
        companyId: ids.company,
        transactionType: "OpeningInventoryCutover",
        routeKey: "DEFAULT",
        isActive: true,
      },
      data: { isActive: false },
    });
    const ruleId = id();
    await createSealedApprovalRuleFixture(prisma, {
      data: {
        id: ruleId,
        tenantId: ids.tenant,
        companyId: ids.company,
        transactionType: "OpeningInventoryCutover",
        routeKey: "DEFAULT",
        priority,
        isActive: true,
        steps: { create: steps.map((step) => ({ ...step, approverType: "ROLE", userId: null, required: true })) },
      },
    });
    return ruleId;
  }

  async function sideEffectSnapshot() {
    const [activations, cohorts, movements, balances] = await Promise.all([
      prisma.inventoryPilotFamilyActivation.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
      prisma.openingInventoryCohort.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
      prisma.inventoryMovement.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
      prisma.inventoryBalance.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
    ]);
    return { activations, cohorts, movements, balances };
  }

  beforeAll(async () => {
    process.env.AUTH_MODE = "local";
    ({ prisma } = await import("@ogfi/database"));
    pilot = await import("../src/server/services/inventoryPilotConfiguration");
    opening = await import("../src/server/services/openingInventoryCutovers");
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`SELECT current_database() AS "currentDatabase"`;
    if (identity[0]?.currentDatabase !== expectedDatabase) throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");

    await prisma.tenant.create({ data: { id: ids.tenant, name: `Pilot Config ${suffix}`, loginCode: `pilot-config-${suffix}` } });
    await prisma.tenant.create({ data: { id: ids.foreignTenant, name: `Foreign Pilot Config ${suffix}`, loginCode: `foreign-pilot-config-${suffix}` } });
    await prisma.company.createMany({ data: [
      { id: ids.company, tenantId: ids.tenant, code: `PC-${suffix}`, legalName: `Pilot Configuration ${suffix}`, currencyCode: "PHP" },
      { id: ids.adjacentCompany, tenantId: ids.tenant, code: `PCA-${suffix}`, legalName: `Adjacent Pilot Configuration ${suffix}`, currencyCode: "PHP" },
      { id: ids.foreignCompany, tenantId: ids.foreignTenant, code: `PCF-${suffix}`, legalName: `Foreign Pilot Configuration ${suffix}`, currencyCode: "PHP" },
    ] });
    await prisma.location.createMany({ data: [
      { id: ids.location, tenantId: ids.tenant, companyId: ids.company, locationType: "BRANCH", code: `PC-L-${suffix}`, name: "Pilot branch" },
      { id: ids.inactiveLocation, tenantId: ids.tenant, companyId: ids.company, locationType: "WAREHOUSE", code: `PC-I-${suffix}`, name: "Inactive pilot warehouse", status: "INACTIVE" },
      { id: ids.adjacentLocation, tenantId: ids.tenant, companyId: ids.adjacentCompany, locationType: "BRANCH", code: `PCA-L-${suffix}`, name: "Adjacent branch" },
      { id: ids.foreignLocation, tenantId: ids.foreignTenant, companyId: ids.foreignCompany, locationType: "BRANCH", code: `PCF-L-${suffix}`, name: "Foreign branch" },
    ] });
    await prisma.inventoryLocation.createMany({ data: [
      { id: ids.inventoryLocation, tenantId: ids.tenant, companyId: ids.company, locationId: ids.location, code: `PC-INV-${suffix}`, name: "Pilot stock" },
      { id: ids.inactiveInventoryLocation, tenantId: ids.tenant, companyId: ids.company, locationId: ids.inactiveLocation, code: `PC-INACTIVE-${suffix}`, name: "Inactive pilot stock", status: "INACTIVE" },
      { id: ids.adjacentInventoryLocation, tenantId: ids.tenant, companyId: ids.adjacentCompany, locationId: ids.adjacentLocation, code: `PCA-INV-${suffix}`, name: "Adjacent stock" },
    ] });
    await prisma.itemCategory.createMany({ data: [
      { id: ids.category, tenantId: ids.tenant, companyId: ids.company, categoryCode: `PC-C-${suffix}`, categoryName: "Pilot category", inventoryClass: "FOOD" },
      { id: ids.adjacentCategory, tenantId: ids.tenant, companyId: ids.adjacentCompany, categoryCode: `PCA-C-${suffix}`, categoryName: "Adjacent category", inventoryClass: "FOOD" },
    ] });
    await prisma.uom.createMany({ data: [
      { id: ids.uom, tenantId: ids.tenant, companyId: ids.company, uomCode: `PC-EA-${suffix}`, uomName: "Each", uomType: "COUNT" },
      { id: ids.adjacentUom, tenantId: ids.tenant, companyId: ids.adjacentCompany, uomCode: `PCA-EA-${suffix}`, uomName: "Each", uomType: "COUNT" },
    ] });
    await prisma.item.createMany({ data: [
      { id: ids.item, tenantId: ids.tenant, companyId: ids.company, itemCode: `PC-I-${suffix}`, itemName: "Pilot item", itemCategoryId: ids.category, itemType: "INVENTORY", baseUomId: ids.uom, trackInventory: true },
      { id: ids.inactiveItem, tenantId: ids.tenant, companyId: ids.company, itemCode: `PC-X-${suffix}`, itemName: "Inactive pilot item", itemCategoryId: ids.category, itemType: "INVENTORY", baseUomId: ids.uom, trackInventory: true, status: "INACTIVE" },
      { id: ids.adjacentItem, tenantId: ids.tenant, companyId: ids.adjacentCompany, itemCode: `PCA-I-${suffix}`, itemName: "Adjacent item", itemCategoryId: ids.adjacentCategory, itemType: "INVENTORY", baseUomId: ids.adjacentUom, trackInventory: true },
    ] });

    const users = [
      { id: ids.creator, email: `creator-${suffix}@example.test`, displayName: "Pilot Creator" },
      { id: ids.editor, email: `editor-${suffix}@example.test`, displayName: "Pilot Editor" },
      { id: ids.sealer, email: `sealer-${suffix}@example.test`, displayName: "Pilot Sealer" },
      { id: ids.wrongScopeActor, email: `wrong-scope-${suffix}@example.test`, displayName: "Wrong Scope Actor" },
      { id: ids.routeActor, email: `route-${suffix}@example.test`, displayName: "Route Actor" },
      { id: ids.accountingRouteActor, email: `accounting-route-${suffix}@example.test`, displayName: "Accounting Route Actor" },
      { id: ids.dualRouteActorA, email: `dual-route-a-${suffix}@example.test`, displayName: "Dual Route Actor A" },
      { id: ids.dualRouteActorB, email: `dual-route-b-${suffix}@example.test`, displayName: "Dual Route Actor B" },
      ...crowdedWrongActors.map((actor) => ({ id: actor.id, email: `crowded-wrong-${actor.index}-${suffix}@example.test`, displayName: `Crowded Wrong ${String(actor.index).padStart(2, "0")}` })),
      { id: crowdedValidActorId, email: `crowded-valid-${suffix}@example.test`, displayName: "Crowded Valid 99" },
      ...participantUsers.map((userId, index) => ({ id: userId, email: `participant-${index}-${suffix}@example.test`, displayName: `Participant ${index}` })),
    ];
    await prisma.user.createMany({ data: users.map((user) => ({ ...user, tenantId: ids.tenant })) });
    await prisma.user.create({ data: { id: ids.foreignUser, tenantId: ids.foreignTenant, email: `foreign-${suffix}@example.test`, displayName: "Foreign Tenant Manager" } });

    const permissionCodes = [...new Set([...configurationPermissionCodes, ...participantPermissionCodes, ...routeFamilies.map((row) => row[2])])];
    for (const code of permissionCodes) {
      await prisma.permission.upsert({ where: { code }, update: {}, create: { tenantId: null, code, module: "inventory", action: code.split(".").at(-1) ?? "manage" } });
    }
    await prisma.role.createMany({ data: [
      { id: ids.creatorRole, tenantId: ids.tenant, code: `PC-CREATOR-${suffix}`, name: "Pilot Creator" },
      { id: ids.editorRole, tenantId: ids.tenant, code: `PC-EDITOR-${suffix}`, name: "Pilot Editor" },
      { id: ids.sealerRole, tenantId: ids.tenant, code: `PC-SEALER-${suffix}`, name: "Pilot Sealer" },
      { id: ids.participantRole, tenantId: ids.tenant, code: `PC-PARTICIPANT-${suffix}`, name: "Pilot Participant" },
      { id: ids.routeRole, tenantId: ids.tenant, code: `PC-ROUTE-${suffix}`, name: "Pilot Route Approver" },
      { id: ids.accountingRouteRole, tenantId: ids.tenant, code: `PC-ACCOUNTING-ROUTE-${suffix}`, name: "Pilot Accounting Approver" },
      { id: ids.dualRouteRole, tenantId: ids.tenant, code: `PC-DUAL-ROUTE-${suffix}`, name: "Pilot Dual-Permission Approver" },
      { id: ids.wrongScopeRole, tenantId: ids.tenant, code: `PC-WRONG-${suffix}`, name: "Wrong Scope Participant" },
      { id: crowdedRoleId, tenantId: ids.tenant, code: `PC-CROWDED-${suffix}`, name: "Crowded route role" },
      { id: ids.foreignRole, tenantId: ids.foreignTenant, code: `PCF-MANAGER-${suffix}`, name: "Foreign Pilot Manager" },
    ] });
    const permissionRows = await prisma.permission.findMany({ where: { code: { in: permissionCodes } }, select: { id: true, code: true } });
    const permissionId = new Map(permissionRows.map((row) => [row.code, row.id]));
    const grants = [
      ...[configurationPermissionCodes[0], configurationPermissionCodes[1], participantPermissionCodes[0]].map((code) => ({ roleId: ids.creatorRole, permissionId: permissionId.get(code)! })),
      ...[configurationPermissionCodes[0], configurationPermissionCodes[1]].map((code) => ({ roleId: ids.editorRole, permissionId: permissionId.get(code)! })),
      ...[configurationPermissionCodes[0], configurationPermissionCodes[2]].map((code) => ({ roleId: ids.sealerRole, permissionId: permissionId.get(code)! })),
      ...participantPermissionCodes.map((code) => ({ roleId: ids.participantRole, permissionId: permissionId.get(code)! })),
      ...routeFamilies.map((row) => ({ roleId: ids.routeRole, permissionId: permissionId.get(row[2])! })),
      { roleId: ids.accountingRouteRole, permissionId: permissionId.get(permissions.openingInventoryAccountingReview)! },
      { roleId: ids.dualRouteRole, permissionId: permissionId.get(permissions.openingInventoryOperationsReview)! },
      { roleId: ids.dualRouteRole, permissionId: permissionId.get(permissions.openingInventoryAccountingReview)! },
      ...participantPermissionCodes.map((code) => ({ roleId: ids.wrongScopeRole, permissionId: permissionId.get(code)! })),
      { roleId: crowdedRoleId, permissionId: permissionId.get(permissions.purchaseRequestApprove)! },
      ...configurationPermissionCodes.map((code) => ({ roleId: ids.foreignRole, permissionId: permissionId.get(code)! })),
      { roleId: ids.foreignRole, permissionId: permissionId.get(permissions.openingInventoryPrepare)! },
    ];
    await prisma.rolePermission.createMany({ data: grants, skipDuplicates: true });

    await prisma.userRoleAssignment.createMany({ data: [
      { id: ids.creatorRoleAssignment, userId: ids.creator, roleId: ids.creatorRole },
      { id: ids.editorRoleAssignment, userId: ids.editor, roleId: ids.editorRole },
      { id: ids.sealerRoleAssignment, userId: ids.sealer, roleId: ids.sealerRole },
      { id: ids.routeRoleAssignment, userId: ids.routeActor, roleId: ids.routeRole },
      { id: ids.accountingRouteRoleAssignment, userId: ids.accountingRouteActor, roleId: ids.accountingRouteRole },
      { id: ids.dualRouteRoleAssignmentA, userId: ids.dualRouteActorA, roleId: ids.dualRouteRole },
      { id: ids.dualRouteRoleAssignmentB, userId: ids.dualRouteActorB, roleId: ids.dualRouteRole },
      { id: ids.wrongScopeRoleAssignment, userId: ids.wrongScopeActor, roleId: ids.wrongScopeRole },
      ...crowdedWrongActors.map((actor) => ({ userId: actor.id, roleId: crowdedRoleId })),
      { userId: crowdedValidActorId, roleId: crowdedRoleId },
      { id: ids.foreignRoleAssignment, userId: ids.foreignUser, roleId: ids.foreignRole },
      ...participantAssignments.map((assignmentId, index) => ({ id: assignmentId, userId: participantUsers[index]!, roleId: ids.participantRole })),
    ] });
    await prisma.userScopeAssignment.createMany({ data: [
      { userId: ids.creator, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "MANAGE" },
      { userId: ids.editor, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "MANAGE" },
      { userId: ids.sealer, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "MANAGE" },
      { userId: ids.routeActor, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "APPROVE" },
      { userId: ids.accountingRouteActor, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "APPROVE" },
      { userId: ids.dualRouteActorA, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "APPROVE" },
      { userId: ids.dualRouteActorB, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "APPROVE" },
      { userId: ids.wrongScopeActor, scopeType: "LOCATION", scopeId: ids.adjacentLocation, accessLevel: "APPROVE" },
      ...crowdedWrongActors.map((actor) => ({ userId: actor.id, scopeType: "LOCATION" as const, scopeId: ids.adjacentLocation, accessLevel: "APPROVE" as const })),
      { userId: crowdedValidActorId, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "APPROVE" },
      { userId: ids.foreignUser, scopeType: "COMPANY", scopeId: ids.foreignCompany, accessLevel: "MANAGE" },
      ...participantUsers.map((userId, index) => ({ userId, scopeType: "COMPANY" as const, scopeId: ids.company, accessLevel: index < 2 ? "OPERATE" as const : "APPROVE" as const })),
    ] });
    const sessionExpiry = new Date(Date.now() + 60 * 60_000);
    await prisma.authSession.createMany({ data: [
      { id: ids.creatorSession, tenantId: ids.tenant, userId: ids.creator, tokenHash: createHash("sha256").update(`creator-${suffix}`).digest("hex"), status: "ACTIVE", assuranceLevel: "MFA", mfaAuthenticatedAt: new Date(), privilegeEpochAtIssue: 0, idleExpiresAt: sessionExpiry, absoluteExpiresAt: sessionExpiry },
      { id: ids.editorSession, tenantId: ids.tenant, userId: ids.editor, tokenHash: createHash("sha256").update(`editor-${suffix}`).digest("hex"), status: "ACTIVE", assuranceLevel: "MFA", mfaAuthenticatedAt: new Date(), privilegeEpochAtIssue: 0, idleExpiresAt: sessionExpiry, absoluteExpiresAt: sessionExpiry },
      { id: ids.sealerSession, tenantId: ids.tenant, userId: ids.sealer, tokenHash: createHash("sha256").update(`sealer-${suffix}`).digest("hex"), status: "ACTIVE", assuranceLevel: "MFA", mfaAuthenticatedAt: new Date(), privilegeEpochAtIssue: 0, idleExpiresAt: sessionExpiry, absoluteExpiresAt: sessionExpiry },
      { id: ids.foreignSession, tenantId: ids.foreignTenant, userId: ids.foreignUser, tokenHash: createHash("sha256").update(`foreign-${suffix}`).digest("hex"), status: "ACTIVE", assuranceLevel: "MFA", mfaAuthenticatedAt: new Date(), privilegeEpochAtIssue: 0, idleExpiresAt: sessionExpiry, absoluteExpiresAt: sessionExpiry },
    ] });
    creatorSession = sessionFor({ id: ids.creator, email: `creator-${suffix}@example.test`, name: "Pilot Creator" }, ids.company, ids.location, ids.creatorSession);
    editorSession = sessionFor({ id: ids.editor, email: `editor-${suffix}@example.test`, name: "Pilot Editor" }, ids.company, ids.location, ids.editorSession);
    sealerSession = sessionFor({ id: ids.sealer, email: `sealer-${suffix}@example.test`, name: "Pilot Sealer" }, ids.company, ids.location, ids.sealerSession);
    adjacentCompanySession = sessionFor({ id: ids.creator, email: `creator-${suffix}@example.test`, name: "Pilot Creator" }, ids.adjacentCompany, ids.adjacentLocation, ids.creatorSession);
    adjacentCompanySealerSession = sessionFor({ id: ids.sealer, email: `sealer-${suffix}@example.test`, name: "Pilot Sealer" }, ids.adjacentCompany, ids.adjacentLocation, ids.sealerSession);
    foreignTenantSession = sessionFor({ id: ids.foreignUser, email: `foreign-${suffix}@example.test`, name: "Foreign Tenant Manager" }, ids.foreignCompany, ids.foreignLocation, ids.foreignSession, ids.foreignTenant);

    for (const [family, transactionType] of routeFamilies) {
      const ruleId = id();
      routeRuleIds.set(family, ruleId);
      await createSealedApprovalRuleFixture(prisma, {
        data: {
          id: ruleId,
          tenantId: ids.tenant,
          companyId: ids.company,
          transactionType,
          routeKey: "DEFAULT",
          isActive: true,
          steps: { create: family === "OpeningInventoryCutover" ? [
            { stepOrder: 1, approverType: "ROLE", roleId: ids.routeRole, userId: null, required: true },
            { stepOrder: 2, approverType: "ROLE", roleId: ids.accountingRouteRole, userId: null, required: true },
          ] : [{ stepOrder: 1, approverType: "ROLE", roleId: family === "PurchaseRequest" ? crowdedRoleId : ids.routeRole, userId: null, required: true }] },
        },
      });
    }
    await createSealedApprovalRuleFixture(prisma, {
      data: {
        id: adjacentRuleId,
        tenantId: ids.tenant,
        companyId: ids.adjacentCompany,
        transactionType: "PURCHASE_REQUEST",
        routeKey: "DEFAULT",
        isActive: true,
        steps: { create: [{ stepOrder: 1, approverType: "ROLE", roleId: ids.routeRole, userId: null, required: true }] },
      },
    });
  }, 120_000);

  afterAll(async () => {
    delete process.env.AUTH_MODE;
    if (prisma) await prisma.$disconnect();
  });

  it("AUTHZ-PI-PILOT-CONFIG-AUTHORIZATION-NO-MUTATION", async () => {
    const tenantCompanyDraft = await pilot.createInventoryPilotConfigurationDraft(
      creatorSession,
      { reason: "Create a real company draft for the adjacent-company snapshot denial." },
    );
    const before = await Promise.all([
      prisma.inventoryPilotConfigurationDraft.count({ where: { tenantId: ids.tenant, companyId: ids.adjacentCompany } }),
      prisma.auditEvent.count({ where: { tenantId: ids.tenant, companyId: ids.adjacentCompany } }),
    ]);
    await expect(pilot.createInventoryPilotConfigurationDraft(adjacentCompanySession, {
      reason: "Attempt an adjacent company configuration change.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED");
    await expect(pilot.getInventoryPilotConfigurationWorkspace(adjacentCompanySession)).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED");
    await expect(
      pilot.getInventoryPilotConfigurationDraftSnapshot(
        adjacentCompanySession,
        tenantCompanyDraft.id,
      ),
    ).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED");
    await expect(pilot.createInventoryPilotConfigurationSuccessorDraft(adjacentCompanySession, {
      predecessorRevisionId: randomUUID(),
      reason: "Attempt an adjacent company successor draft.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED");
    await expect(pilot.updateInventoryPilotConfigurationDraft(adjacentCompanySession, {
      draftId: randomUUID(), expectedVersion: 1, ...fullSelection(), reason: "Attempt an adjacent company whole snapshot update.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED");
    await expect(pilot.abandonInventoryPilotConfigurationDraft(adjacentCompanySession, {
      draftId: randomUUID(), expectedVersion: 1, reason: "Attempt an adjacent company draft abandonment.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED");
    await expect(pilot.evaluateInventoryPilotConfigurationReadiness(adjacentCompanySession, { draftId: randomUUID() })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED");
    await expect(pilot.sealInventoryPilotConfigurationDraft(adjacentCompanySealerSession, {
      draftId: randomUUID(), expectedVersion: 1, idempotencyKey: `adjacent-seal-${suffix}`, reason: "Attempt an adjacent company configuration seal.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED");
    const crossTenantSession: SessionContext = {
      ...creatorSession,
      context: { ...creatorSession.context, tenantId: randomUUID() },
      authorizedLocations: [],
    };
    await expect(pilot.getInventoryPilotConfigurationWorkspace(crossTenantSession)).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_PERMISSION_DENIED");
    expect(await Promise.all([
      prisma.inventoryPilotConfigurationDraft.count({ where: { tenantId: ids.tenant, companyId: ids.adjacentCompany } }),
      prisma.auditEvent.count({ where: { tenantId: ids.tenant, companyId: ids.adjacentCompany } }),
    ])).toEqual(before);
  });

  it("AUTHZ-PI-PILOT-CONFIG-REAL-CROSS-TENANT-IDS-NO-MUTATION", async () => {
    const tenantOneDraft = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Create the tenant-one foreign-ID probe draft." });
    const tenantTwoDraft = await pilot.createInventoryPilotConfigurationDraft(foreignTenantSession, { reason: "Create the tenant-two authorization probe draft." });
    const before = await Promise.all([
      prisma.inventoryPilotConfigurationDraft.findUnique({ where: { id: tenantOneDraft.id }, select: { status: true, version: true } }),
      prisma.inventoryPilotConfigurationDraft.findUnique({ where: { id: tenantTwoDraft.id }, select: { status: true, version: true } }),
      prisma.inventoryPilotConfigurationRevision.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
      prisma.openingInventoryCohort.count({ where: { tenantId: ids.foreignTenant, companyId: ids.foreignCompany } }),
      prisma.auditEvent.count({ where: { OR: [
        { tenantId: ids.tenant, companyId: ids.company },
        { tenantId: ids.foreignTenant, companyId: ids.foreignCompany },
      ] } }),
    ]);
    await expect(pilot.createInventoryPilotConfigurationSuccessorDraft(foreignTenantSession, {
      predecessorRevisionId: tenantOneDraft.id,
      reason: "Reject a real foreign predecessor identifier.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_NOT_FOUND");
    await expect(pilot.updateInventoryPilotConfigurationDraft(foreignTenantSession, {
      draftId: tenantOneDraft.id, expectedVersion: tenantOneDraft.version, ...fullSelection(), reason: "Reject a real foreign draft identifier.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_NOT_FOUND");
    await expect(pilot.abandonInventoryPilotConfigurationDraft(foreignTenantSession, {
      draftId: tenantOneDraft.id, expectedVersion: tenantOneDraft.version, reason: "Reject a real foreign abandon identifier.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_NOT_FOUND");
    await expect(pilot.evaluateInventoryPilotConfigurationReadiness(foreignTenantSession, { draftId: tenantOneDraft.id })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_NOT_FOUND");
    await expect(pilot.sealInventoryPilotConfigurationDraft(foreignTenantSession, {
      draftId: tenantOneDraft.id, expectedVersion: tenantOneDraft.version, idempotencyKey: `foreign-seal-${suffix}`, reason: "Reject a real foreign seal identifier.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_NOT_FOUND");
    await expect(pilot.getInventoryPilotConfigurationWorkspace(foreignTenantSession, { draftId: tenantOneDraft.id })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_NOT_FOUND");
    await expect(pilot.getInventoryPilotConfigurationWorkspace(foreignTenantSession, { revisionId: tenantOneDraft.id })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_NOT_FOUND");
    await expect(
      pilot.getInventoryPilotConfigurationDraftSnapshot(
        foreignTenantSession,
        tenantOneDraft.id,
      ),
    ).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_NOT_FOUND");
    await expect(pilot.updateInventoryPilotConfigurationDraft(foreignTenantSession, {
      draftId: tenantTwoDraft.id, expectedVersion: tenantTwoDraft.version, ...fullSelection(), reason: "Reject tenant-one selection identifiers in tenant two.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_SELECTION_INVALID");
    await expect(opening.createOpeningInventoryCohort({
      configurationRevisionId: tenantOneDraft.id,
      effectiveAt: new Date("2026-08-14T00:00:00.000Z"),
    }, foreignTenantSession)).rejects.toThrow("OPENING_INVENTORY_CONFIGURATION_NOT_SEALED");
    expect(await Promise.all([
      prisma.inventoryPilotConfigurationDraft.findUnique({ where: { id: tenantOneDraft.id }, select: { status: true, version: true } }),
      prisma.inventoryPilotConfigurationDraft.findUnique({ where: { id: tenantTwoDraft.id }, select: { status: true, version: true } }),
      prisma.inventoryPilotConfigurationRevision.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
      prisma.openingInventoryCohort.count({ where: { tenantId: ids.foreignTenant, companyId: ids.foreignCompany } }),
      prisma.auditEvent.count({ where: { OR: [
        { tenantId: ids.tenant, companyId: ids.company },
        { tenantId: ids.foreignTenant, companyId: ids.foreignCompany },
      ] } }),
    ])).toEqual(before);
  });

  it("AUTHZ-PI-PILOT-CONFIG-READINESS-SCOPE-AND-COMPLETENESS", async () => {
    const incomplete = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Create an incomplete readiness evidence draft." });
    const incompleteReadiness = await pilot.evaluateInventoryPilotConfigurationReadiness(creatorSession, { draftId: incomplete.id });
    expect(incompleteReadiness.blocking).toBe(true);
    expect(incompleteReadiness.blockers.filter((row) => row.code === "INVENTORY_PILOT_CONFIGURATION_ENDPOINT_CAPABILITY_REQUIRED")).toHaveLength(4);
    expect(incompleteReadiness.blockers.filter((row) => row.code === "INVENTORY_PILOT_CONFIGURATION_PARTICIPANT_REQUIRED")).toHaveLength(5);
    expect(incompleteReadiness.blockers.filter((row) => row.code === "INVENTORY_PILOT_CONFIGURATION_ROUTE_REQUIRED")).toHaveLength(8);

    const invalidInputs = [
      fullSelection({ inventoryLocationId: ids.adjacentInventoryLocation }),
      fullSelection({ itemId: ids.adjacentItem }),
      fullSelection({ routeRuleId: adjacentRuleId }),
    ];
    for (const selection of invalidInputs) {
      await expect(pilot.updateInventoryPilotConfigurationDraft(editorSession, {
        draftId: incomplete.id,
        expectedVersion: incomplete.version,
        ...selection,
        reason: "Reject an out-of-scope configuration selection.",
      })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_SELECTION_INVALID");
    }

    let current = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: incomplete.id,
      expectedVersion: incomplete.version,
      ...fullSelection({ inventoryLocationId: ids.inactiveInventoryLocation, itemId: ids.inactiveItem }),
      reason: "Capture inactive facts for readiness rejection.",
    });
    let readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(editorSession, { draftId: current.id });
    expect(readiness.blockers.map((row) => row.code)).toEqual(expect.arrayContaining([
      "INVENTORY_PILOT_CONFIGURATION_ENDPOINT_INACTIVE",
      "INVENTORY_PILOT_CONFIGURATION_ITEM_INACTIVE",
    ]));
    current = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: current.id,
      expectedVersion: current.version,
      ...fullSelection(),
      reason: "Restore active company-scoped readiness facts.",
    });
    readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(editorSession, { draftId: current.id });
    expect(readiness).toMatchObject({ blocking: false, blockers: [] });
    current = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: current.id,
      expectedVersion: current.version,
      ...fullSelection({ participantUserId: ids.wrongScopeActor, participantRoleAssignmentId: ids.wrongScopeRoleAssignment }),
      reason: "Capture a participant without every opening endpoint scope.",
    });
    readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(editorSession, { draftId: current.id });
    expect(readiness.blockers.map((row) => row.code)).toContain("INVENTORY_PILOT_CONFIGURATION_PARTICIPANT_SCOPE_STALE");
  });

  it("AUTHZ-PI-PILOT-CONFIG-OPENING-ROUTE-ONE-STEP-REJECTED", async () => {
    const ruleId = await createOpeningRouteFixture(90, "ONE_STEP", [
      { stepOrder: 1, roleId: ids.routeRole },
    ]);
    const draft = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Test one-step Opening route rejection." });
    const configured = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: draft.id,
      expectedVersion: draft.version,
      ...fullSelection({ routeFamily: "OpeningInventoryCutover", routeRuleId: ruleId }),
      reason: "Capture a one-step Opening route as negative evidence.",
    });
    const readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(editorSession, { draftId: configured.id });
    expect(readiness.blockers).toContainEqual(expect.objectContaining({ family: "OpeningInventoryCutover", code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_ROLE_EVIDENCE_MISSING" }));
  });

  it("AUTHZ-PI-PILOT-CONFIG-OPENING-ROUTE-SAME-ROLE-REJECTED", async () => {
    const ruleId = await createOpeningRouteFixture(80, "SAME_ROLE", [
      { stepOrder: 1, roleId: ids.dualRouteRole },
      { stepOrder: 2, roleId: ids.dualRouteRole },
    ]);
    const draft = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Test same-role Opening route rejection." });
    const configured = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: draft.id,
      expectedVersion: draft.version,
      ...fullSelection({ routeFamily: "OpeningInventoryCutover", routeRuleId: ruleId }),
      reason: "Capture a same-role two-step Opening route as negative evidence.",
    });
    const readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(editorSession, { draftId: configured.id });
    expect(readiness.blockers).toContainEqual(expect.objectContaining({ family: "OpeningInventoryCutover", code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_ROLE_EVIDENCE_MISSING" }));
  });

  it("AUTHZ-PI-PILOT-CONFIG-OPENING-ROUTE-REVERSED-PERMISSIONS-REJECTED", async () => {
    const reversedRuleId = await createOpeningRouteFixture(70, "REVERSED", [
      { stepOrder: 1, roleId: ids.accountingRouteRole },
      { stepOrder: 2, roleId: ids.routeRole },
    ]);
    const draft = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Test reversed Opening route permission rejection." });
    const configured = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: draft.id,
      expectedVersion: draft.version,
      ...fullSelection({ routeFamily: "OpeningInventoryCutover", routeRuleId: reversedRuleId }),
      reason: "Capture reversed Operations and Accounting route evidence.",
    });
    const readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(editorSession, { draftId: configured.id });
    expect(readiness.blockers).toContainEqual(expect.objectContaining({ family: "OpeningInventoryCutover", code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_ROLE_EVIDENCE_MISSING" }));

    const validReplacementId = await createOpeningRouteFixture(60, "VALID_REPLACEMENT", [
      { stepOrder: 1, roleId: ids.routeRole },
      { stepOrder: 2, roleId: ids.accountingRouteRole },
    ]);
    routeRuleIds.set("OpeningInventoryCutover", validReplacementId);
  });

  it("AUTHZ-PI-PILOT-CONFIG-ROUTE-ACTOR-BEYOND-FIFTY", async () => {
    expect(await prisma.userRoleAssignment.count({ where: { roleId: crowdedRoleId, status: "ACTIVE" } })).toBe(51);
    const draft = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Test a valid route actor beyond the former cap." });
    const configured = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: draft.id,
      expectedVersion: draft.version,
      ...fullSelection(),
      reason: "Capture the crowded route with its final valid scoped actor.",
    });
    const readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(editorSession, { draftId: configured.id });
    expect(readiness.blockers.filter((blocker) => blocker.family === "PurchaseRequest")).toEqual([]);
    expect(readiness.blocking).toBe(false);
  });

  it("AUTHZ-PI-PILOT-CONFIG-PARTICIPANT-CANDIDATE-PAGINATION", async () => {
    const candidates = Array.from({ length: 25 }, (_, index) => ({ id: id(), index }));
    await prisma.user.createMany({ data: candidates.map((candidate) => ({
      id: candidate.id,
      tenantId: ids.tenant,
      email: `candidate-${String(candidate.index).padStart(2, "0")}-${suffix}@example.test`,
      displayName: `Candidate ${String(candidate.index).padStart(2, "0")}`,
    })) });
    await prisma.userRoleAssignment.createMany({ data: candidates.map((candidate) => ({ userId: candidate.id, roleId: ids.participantRole })) });
    await prisma.userScopeAssignment.createMany({ data: candidates.map((candidate) => ({ userId: candidate.id, scopeType: "COMPANY" as const, scopeId: ids.company, accessLevel: "OPERATE" as const })) });
    const draft = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Test responsibility-scoped participant pagination." });
    const configured = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: draft.id,
      expectedVersion: draft.version,
      ...fullSelection(),
      reason: "Prepare active endpoints for participant pagination evidence.",
    });
    const pageInput = { draftId: configured.id, userResponsibility: "PREPARER" as const, userPageSize: 10 };
    const first = await pilot.getInventoryPilotConfigurationWorkspace(creatorSession, { ...pageInput, userPage: 1 });
    const firstReplay = await pilot.getInventoryPilotConfigurationWorkspace(creatorSession, { ...pageInput, userPage: 1 });
    const second = await pilot.getInventoryPilotConfigurationWorkspace(creatorSession, { ...pageInput, userPage: 2 });
    expect(first.candidateUsers.totalItems).toBe(31);
    expect(first.candidateUsers.items).toHaveLength(10);
    expect(second.candidateUsers.totalItems).toBe(31);
    expect(second.candidateUsers.items).toHaveLength(10);
    expect(firstReplay.candidateUsers.items.map((user) => user.id)).toEqual(first.candidateUsers.items.map((user) => user.id));
    const firstIds = new Set(first.candidateUsers.items.map((user) => user.id));
    expect(second.candidateUsers.items.filter((user) => firstIds.has(user.id))).toHaveLength(0);
    expect([...first.candidateUsers.items, ...second.candidateUsers.items].every((user) => user.roleAssignments.every((assignment) => assignment.eligibleResponsibilities.every((responsibility) => responsibility === "PREPARER")))).toBe(true);
  });

  it("AUTHZ-PI-PILOT-CONFIG-SEAL-ATOMIC-IDEMPOTENT-NO-SIDE-EFFECT", async () => {
    const draft = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Create the first controlled pilot configuration." });
    const configured = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: draft.id,
      expectedVersion: draft.version,
      ...fullSelection(),
      reason: "Complete the first controlled pilot configuration.",
    });
    const sealInput = { draftId: configured.id, expectedVersion: configured.version, idempotencyKey: `seal-first-${suffix}`, reason: "Seal the independently reviewed pilot configuration." };
    const sealPermission = await prisma.permission.findUniqueOrThrow({ where: { code: permissions.inventoryPilotConfigurationSeal }, select: { id: true } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: ids.sealerRole, permissionId: sealPermission.id } } });
    await expect(pilot.sealInventoryPilotConfigurationDraft(sealerSession, sealInput)).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_PERMISSION_DENIED");
    await prisma.rolePermission.create({ data: { roleId: ids.sealerRole, permissionId: sealPermission.id } });
    await prisma.userScopeAssignment.updateMany({ where: { userId: ids.sealer, scopeType: "COMPANY", scopeId: ids.company }, data: { status: "INACTIVE" } });
    await expect(pilot.sealInventoryPilotConfigurationDraft(sealerSession, sealInput)).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED");
    await prisma.userScopeAssignment.updateMany({ where: { userId: ids.sealer, scopeType: "COMPANY", scopeId: ids.company }, data: { status: "ACTIVE" } });
    await prisma.authSession.update({ where: { id: ids.sealerSession }, data: { status: "REVOKED" } });
    await expect(pilot.sealInventoryPilotConfigurationDraft(sealerSession, sealInput)).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_AUTHORITY_STALE");
    await prisma.authSession.update({ where: { id: ids.sealerSession }, data: { status: "ACTIVE" } });
    await prisma.user.update({ where: { id: ids.sealer }, data: { privilegeEpoch: 1 } });
    await expect(pilot.sealInventoryPilotConfigurationDraft(sealerSession, sealInput)).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_AUTHORITY_STALE");
    await prisma.user.update({ where: { id: ids.sealer }, data: { privilegeEpoch: 0 } });
    await prisma.authSession.update({ where: { id: ids.sealerSession }, data: { mfaAuthenticatedAt: new Date(Date.now() - 24 * 60 * 60_000) } });
    await expect(pilot.sealInventoryPilotConfigurationDraft(sealerSession, sealInput)).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_MFA_REQUIRED");
    await prisma.authSession.update({ where: { id: ids.sealerSession }, data: { mfaAuthenticatedAt: new Date() } });
    await prisma.rolePermission.createMany({ data: [
      { roleId: ids.creatorRole, permissionId: sealPermission.id },
      { roleId: ids.editorRole, permissionId: sealPermission.id },
    ] });
    try {
      await expect(pilot.sealInventoryPilotConfigurationDraft(creatorSession, sealInput)).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_EDITOR_CANNOT_SEAL");
      await expect(pilot.sealInventoryPilotConfigurationDraft(editorSession, sealInput)).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_EDITOR_CANNOT_SEAL");
    } finally {
      await prisma.rolePermission.deleteMany({ where: { permissionId: sealPermission.id, roleId: { in: [ids.creatorRole, ids.editorRole] } } });
    }
    const beforeEffects = await sideEffectSnapshot();
    const sealed = await pilot.sealInventoryPilotConfigurationDraft(sealerSession, sealInput);
    firstRevisionId = sealed.revision.id;
    expect(sealed.replayed).toBe(false);
    expect(await sideEffectSnapshot()).toEqual(beforeEffects);
    const replay = await pilot.sealInventoryPilotConfigurationDraft(sealerSession, sealInput);
    expect(replay).toMatchObject({ replayed: true, revision: { id: firstRevisionId } });
    await expect(pilot.sealInventoryPilotConfigurationDraft(sealerSession, {
      ...sealInput,
      reason: "Conflicting content for the same idempotency key.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_IDEMPOTENCY_CONFLICT");
    expect(await prisma.inventoryPilotConfigurationRevision.count({ where: { tenantId: ids.tenant, companyId: ids.company } })).toBe(1);
    expect(await prisma.inventoryPilotConfigurationSealOperation.count({ where: { tenantId: ids.tenant, companyId: ids.company } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { tenantId: ids.tenant, companyId: ids.company, eventType: "inventory_pilot_configuration.revision_sealed", entityId: firstRevisionId } })).toBe(1);
    await expect(pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: configured.id, expectedVersion: configured.version + 1, ...fullSelection(), reason: "Reject mutation of a sealed configuration draft.",
    })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_STATE_CONFLICT");
    const selectionAudit = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "InventoryPilotConfigurationDraft", entityId: configured.id, eventType: "inventory_pilot_configuration.draft_updated" }, orderBy: { occurredAt: "desc" } });
    expect(selectionAudit.beforeData).toMatchObject({ version: 1, selections: { endpointMemberships: [], itemIds: [], participants: [], routeReadiness: [] } });
    expect(selectionAudit.afterData).toMatchObject({ version: 2, selections: { endpointMemberships: expect.any(Array), itemIds: [ids.item], participants: expect.any(Array), routeReadiness: expect.any(Array) } });
    const workspace = await pilot.getInventoryPilotConfigurationWorkspace(sealerSession, { revisionId: firstRevisionId, activityPageSize: 20 });
    expect(workspace.selectedDraft).toBeNull();
    expect(workspace.selectedRevision?.id).toBe(firstRevisionId);
    expect(workspace.selectedItemDetails).toHaveLength(1);
    expect(workspace.selectedEndpointDetails).toHaveLength(1);
    expect(workspace.activityPage.items.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "inventory_pilot_configuration.draft_created",
      "inventory_pilot_configuration.draft_updated",
      "inventory_pilot_configuration.seal_denied",
      "inventory_pilot_configuration.revision_sealed",
    ]));
  });

  it("AUTHZ-PI-PILOT-CONFIG-SEAL-ROLLBACK-AND-CONCURRENT-ONE-WINNER", async () => {
    const firstSuccessor = await createConfiguredSuccessor(firstRevisionId);
    const rollbackSentinel = "00000000-0000-0000-0000-000000000000";
    await prisma.$executeRaw`
      INSERT INTO ogfi_disposable_control.inventory_pilot_audit_failure (entity_id, event_type)
      VALUES (${rollbackSentinel}::uuid, 'inventory_pilot_configuration.revision_sealed')
    `;
    const revisionCountBefore = await prisma.inventoryPilotConfigurationRevision.count({ where: { tenantId: ids.tenant, companyId: ids.company } });
    try {
      await expect(pilot.sealInventoryPilotConfigurationDraft(sealerSession, {
        draftId: firstSuccessor.id,
        expectedVersion: firstSuccessor.version,
        idempotencyKey: `seal-rollback-${suffix}`,
        reason: "Verify an audit failure rolls back the entire seal.",
      })).rejects.toThrow("INVENTORY_PILOT_CONFIGURATION_STATE_CONFLICT");
    } finally {
      await prisma.$executeRaw`
        DELETE FROM ogfi_disposable_control.inventory_pilot_audit_failure
         WHERE entity_id = ${rollbackSentinel}::uuid
           AND event_type = 'inventory_pilot_configuration.revision_sealed'
      `;
    }
    expect(await prisma.inventoryPilotConfigurationRevision.count({ where: { tenantId: ids.tenant, companyId: ids.company } })).toBe(revisionCountBefore);
    expect(await prisma.inventoryPilotConfigurationSealOperation.count({ where: { draftId: firstSuccessor.id } })).toBe(0);
    expect(await prisma.inventoryPilotConfigurationDraft.findUnique({ where: { id: firstSuccessor.id }, select: { status: true, version: true } })).toEqual({ status: "DRAFT", version: firstSuccessor.version });

    existingCohortId = (await opening.createOpeningInventoryCohort({
      configurationRevisionId: firstRevisionId,
      effectiveAt: new Date("2026-08-15T00:00:00.000Z"),
    }, creatorSession)).id;
    const secondSuccessor = await createConfiguredSuccessor(firstRevisionId);
    const beforeEffects = await sideEffectSnapshot();
    const outcomes = await Promise.allSettled([
      pilot.sealInventoryPilotConfigurationDraft(sealerSession, { draftId: firstSuccessor.id, expectedVersion: firstSuccessor.version, idempotencyKey: `seal-race-a-${suffix}`, reason: "Race the first valid successor seal request." }),
      pilot.sealInventoryPilotConfigurationDraft(sealerSession, { draftId: secondSuccessor.id, expectedVersion: secondSuccessor.version, idempotencyKey: `seal-race-b-${suffix}`, reason: "Race the second valid successor seal request." }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const winner = outcomes.find((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof pilot.sealInventoryPilotConfigurationDraft>>> => outcome.status === "fulfilled")!;
    latestRevisionId = winner.value.revision.id;
    expect(await prisma.inventoryPilotConfigurationRevision.count({ where: { tenantId: ids.tenant, companyId: ids.company } })).toBe(2);
    const afterEffects = await sideEffectSnapshot();
    expect(afterEffects).toEqual({ ...beforeEffects, cohorts: beforeEffects.cohorts });
  });

  it("AUTHZ-PI-PILOT-CONFIG-OPENING-LATEST-AND-LIVE-READINESS-GATE", async () => {
    const pinned = await prisma.openingInventoryCohort.findUnique({ where: { id: existingCohortId }, select: { configurationRevisionId: true } });
    expect(pinned?.configurationRevisionId).toBe(firstRevisionId);
    const options = await opening.getOpeningInventoryFormOptions(creatorSession);
    expect(options.revisions.map((revision) => revision.id)).toEqual([latestRevisionId]);
    const preRaceRevisionId = latestRevisionId;
    const racedSuccessor = await createConfiguredSuccessor(preRaceRevisionId);
    const [cohortRace, sealRace] = await Promise.allSettled([
      opening.createOpeningInventoryCohort({ configurationRevisionId: preRaceRevisionId, effectiveAt: new Date("2026-08-16T00:00:00.000Z") }, creatorSession),
      pilot.sealInventoryPilotConfigurationDraft(sealerSession, { draftId: racedSuccessor.id, expectedVersion: racedSuccessor.version, idempotencyKey: `seal-cohort-race-${suffix}`, reason: "Serialize a successor seal against old-leaf cohort admission." }),
    ]);
    expect(sealRace.status).toBe("fulfilled");
    if (sealRace.status === "fulfilled") latestRevisionId = sealRace.value.revision.id;
    if (cohortRace.status === "fulfilled") expect(cohortRace.value.configurationRevisionId).toBe(preRaceRevisionId);
    else expect((cohortRace.reason as Error).message).toBe("OPENING_INVENTORY_CONFIGURATION_NOT_LATEST");
    await expect(opening.createOpeningInventoryCohort({
      configurationRevisionId: firstRevisionId,
      effectiveAt: new Date("2026-08-16T12:00:00.000Z"),
    }, creatorSession)).rejects.toThrow("OPENING_INVENTORY_CONFIGURATION_NOT_LATEST");

    await prisma.userRoleAssignment.update({ where: { id: participantAssignments[0]! }, data: { status: "INACTIVE" } });
    const participantStaleOptions = await opening.getOpeningInventoryFormOptions(creatorSession);
    expect(participantStaleOptions.revisions).toEqual([]);
    expect(participantStaleOptions.configurationEligibility).toMatchObject({ eligible: false, code: "OPENING_INVENTORY_CONFIGURATION_LIVE_READINESS_BLOCKED" });
    expect(participantStaleOptions.configurationEligibility.blockerCodes).toContain("INVENTORY_PILOT_CONFIGURATION_PARTICIPANT_ROLE_STALE");
    await expect(opening.createOpeningInventoryCohort({
      configurationRevisionId: latestRevisionId,
      effectiveAt: new Date("2026-08-17T00:00:00.000Z"),
    }, creatorSession)).rejects.toThrow("OPENING_INVENTORY_CONFIGURATION_LIVE_READINESS_BLOCKED");
    await prisma.userRoleAssignment.update({ where: { id: participantAssignments[0]! }, data: { status: "ACTIVE" } });

    await prisma.userRoleAssignment.update({ where: { id: ids.routeRoleAssignment }, data: { status: "INACTIVE" } });
    const routeStaleOptions = await opening.getOpeningInventoryFormOptions(creatorSession);
    expect(routeStaleOptions.revisions).toEqual([]);
    expect(routeStaleOptions.configurationEligibility.blockerCodes).toContain("INVENTORY_PILOT_CONFIGURATION_ROUTE_LIVE_ACTOR_MISSING");
    await expect(opening.createOpeningInventoryCohort({
      configurationRevisionId: latestRevisionId,
      effectiveAt: new Date("2026-08-18T00:00:00.000Z"),
    }, creatorSession)).rejects.toThrow("OPENING_INVENTORY_CONFIGURATION_LIVE_READINESS_BLOCKED");
    await prisma.userRoleAssignment.update({ where: { id: ids.routeRoleAssignment }, data: { status: "ACTIVE" } });
    expect((await opening.getOpeningInventoryFormOptions(creatorSession)).revisions.map((revision) => revision.id)).toEqual([latestRevisionId]);
  });

  it("AUTHZ-PI-PILOT-CONFIG-SEALED-EVIDENCE-APPEND-ONLY", async () => {
    await expect(prisma.inventoryPilotConfigurationRevision.update({ where: { id: firstRevisionId }, data: { canonicalJson: "{}" } })).rejects.toThrow();
    await expect(prisma.inventoryPilotConfigurationRevision.delete({ where: { id: firstRevisionId } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "InventoryPilotConfigurationRevision"')).rejects.toThrow();
    expect(await prisma.inventoryPilotConfigurationRevision.count({ where: { tenantId: ids.tenant, companyId: ids.company } })).toBe(3);
  });

  it("AUTHZ-PI-PILOT-CONFIG-PR-DEFAULT-AND-EMERGENCY-RESOLUTION", async () => {
    const emergencyRuleId = id();
    await createSealedApprovalRuleFixture(prisma, {
      data: {
        id: emergencyRuleId,
        tenantId: ids.tenant,
        companyId: ids.company,
        transactionType: "PURCHASE_REQUEST",
        routeKey: "PR_EMERGENCY",
        scopeFilters: { emergency: true, route: "emergency" },
        priority: 40,
        isActive: true,
        steps: { create: [{ stepOrder: 1, approverType: "ROLE", roleId: ids.routeRole, userId: null, required: true }] },
      },
    });
    const draft = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Test the standard route alongside an emergency route." });
    const configured = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: draft.id,
      expectedVersion: draft.version,
      ...fullSelection(),
      reason: "Capture the standard non-emergency route resolver evidence.",
    });
    const readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(editorSession, { draftId: configured.id });
    expect(readiness.blockers.filter((blocker) => blocker.family === "PurchaseRequest")).toEqual([]);
    const snapshot = configured.routeReadiness.find((row) => row.family === "PurchaseRequest")!;
    expect(snapshot.resolverEvidenceCanonicalJson).toContain('"resolverId":"purchase_request_approval_rule_v1"');
    expect(snapshot.resolverEvidenceCanonicalJson).toContain('"scenario":"STANDARD_NON_EMERGENCY"');
    expect(snapshot.resolverEvidenceCanonicalJson).toContain('"routeType":"normal"');
    expect(snapshot.resolverEvidenceCanonicalJson).toContain('"fallbackUsed":false');
    await expect(prisma.inventoryPilotDraftRouteReadiness.update({
      where: { draftId_family: { draftId: configured.id, family: "PurchaseRequest" } },
      data: { resolverEvidenceDigest: "0".repeat(64) },
    })).rejects.toThrow();
    await expect(prisma.inventoryPilotDraftRouteReadiness.update({
      where: { draftId_family: { draftId: configured.id, family: "PurchaseRequest" } },
      data: { ruleDefinitionDigest: "0".repeat(64) },
    })).rejects.toThrow();

    const wrongDraft = await pilot.createInventoryPilotConfigurationDraft(creatorSession, { reason: "Test rejection of the emergency route as the standard route." });
    const wrongConfigured = await pilot.updateInventoryPilotConfigurationDraft(editorSession, {
      draftId: wrongDraft.id,
      expectedVersion: wrongDraft.version,
      ...fullSelection({ routeFamily: "PurchaseRequest", routeRuleId: emergencyRuleId }),
      reason: "Capture the deliberately wrong emergency route selection.",
    });
    const wrongReadiness = await pilot.evaluateInventoryPilotConfigurationReadiness(editorSession, { draftId: wrongConfigured.id });
    expect(wrongReadiness.blockers).toContainEqual(expect.objectContaining({ family: "PurchaseRequest", code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_NOT_AUTHORITATIVE" }));
  });

  it("AUTHZ-PI-PILOT-CONFIG-PR-ONLY-EMERGENCY-REJECTED", async () => {
    const companyId = id();
    const locationId = id();
    const emergencyRuleId = id();
    await prisma.company.create({ data: { id: companyId, tenantId: ids.tenant, code: `PC-E-${suffix}`, legalName: `Emergency-only Pilot ${suffix}`, currencyCode: "PHP" } });
    await prisma.location.create({ data: { id: locationId, tenantId: ids.tenant, companyId, locationType: "BRANCH", code: `PC-E-L-${suffix}`, name: "Emergency-only branch" } });
    await prisma.userScopeAssignment.createMany({ data: [
      { userId: ids.creator, scopeType: "COMPANY", scopeId: companyId, accessLevel: "MANAGE" },
      { userId: ids.editor, scopeType: "COMPANY", scopeId: companyId, accessLevel: "MANAGE" },
    ] });
    await createSealedApprovalRuleFixture(prisma, {
      data: {
        id: emergencyRuleId,
        tenantId: ids.tenant,
        companyId,
        transactionType: "PURCHASE_REQUEST",
        routeKey: "PR_EMERGENCY",
        scopeFilters: { emergency: true },
        priority: 10,
        isActive: true,
        steps: { create: [{ stepOrder: 1, approverType: "ROLE", roleId: crowdedRoleId, userId: null, required: true }] },
      },
    });
    const scopedCreator = sessionFor({ id: ids.creator, email: `creator-${suffix}@example.test`, name: "Pilot Creator" }, companyId, locationId, ids.creatorSession);
    const scopedEditor = sessionFor({ id: ids.editor, email: `editor-${suffix}@example.test`, name: "Pilot Editor" }, companyId, locationId, ids.editorSession);
    const draft = await pilot.createInventoryPilotConfigurationDraft(scopedCreator, { reason: "Test an emergency-only Purchase Request route set." });
    const configured = await pilot.updateInventoryPilotConfigurationDraft(scopedEditor, {
      draftId: draft.id,
      expectedVersion: draft.version,
      endpoints: [],
      itemIds: [],
      participants: [],
      routeBindings: [{ family: "PurchaseRequest", approvalRuleId: emergencyRuleId }],
      reason: "Capture the emergency-only route resolver evidence.",
    });
    const readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(scopedEditor, { draftId: configured.id });
    expect(readiness.blockers).toContainEqual(expect.objectContaining({ family: "PurchaseRequest", code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_NOT_AUTHORITATIVE" }));
  });

  it("AUTHZ-PI-PILOT-CONFIG-PR-MALFORMED-ROUTE-CLASS-REJECTED", async () => {
    const companyId = id();
    const locationId = id();
    const malformedRuleId = id();
    await prisma.company.create({ data: { id: companyId, tenantId: ids.tenant, code: `PC-M-${suffix}`, legalName: `Malformed-route Pilot ${suffix}`, currencyCode: "PHP" } });
    await prisma.location.create({ data: { id: locationId, tenantId: ids.tenant, companyId, locationType: "BRANCH", code: `PC-M-L-${suffix}`, name: "Malformed-route branch" } });
    await prisma.userScopeAssignment.createMany({ data: [
      { userId: ids.creator, scopeType: "COMPANY", scopeId: companyId, accessLevel: "MANAGE" },
      { userId: ids.editor, scopeType: "COMPANY", scopeId: companyId, accessLevel: "MANAGE" },
    ] });
    await createSealedApprovalRuleFixture(prisma, {
      data: {
        id: malformedRuleId,
        tenantId: ids.tenant,
        companyId,
        transactionType: "PURCHASE_REQUEST",
        routeKey: "DEFAULT",
        scopeFilters: { emergency: true },
        priority: 20,
        isActive: true,
        steps: { create: [{ stepOrder: 1, approverType: "ROLE", roleId: crowdedRoleId, userId: null, required: true }] },
      },
    });
    const scopedCreator = sessionFor({ id: ids.creator, email: `creator-${suffix}@example.test`, name: "Pilot Creator" }, companyId, locationId, ids.creatorSession);
    const scopedEditor = sessionFor({ id: ids.editor, email: `editor-${suffix}@example.test`, name: "Pilot Editor" }, companyId, locationId, ids.editorSession);
    const draft = await pilot.createInventoryPilotConfigurationDraft(scopedCreator, { reason: "Test mismatched Purchase Request route classification." });
    const configured = await pilot.updateInventoryPilotConfigurationDraft(scopedEditor, {
      draftId: draft.id,
      expectedVersion: draft.version,
      endpoints: [],
      itemIds: [],
      participants: [],
      routeBindings: [{ family: "PurchaseRequest", approvalRuleId: malformedRuleId }],
      reason: "Capture an emergency-classified route with the wrong key.",
    });
    const readiness = await pilot.evaluateInventoryPilotConfigurationReadiness(scopedEditor, { draftId: configured.id });
    expect(readiness.blockers).toContainEqual(expect.objectContaining({ family: "PurchaseRequest", code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_NOT_AUTHORITATIVE" }));
  });

  it("AUTHZ-PI-PILOT-CONFIG-PR-MULTIPLE-NORMAL-ROUTES-REJECTED", async () => {
    const before = await prisma.approvalRule.count({ where: { tenantId: ids.tenant, companyId: ids.company, transactionType: "PURCHASE_REQUEST", routeKey: "DEFAULT", isActive: true } });
    await expect(createSealedApprovalRuleFixture(prisma, {
      data: {
        id: id(),
        tenantId: ids.tenant,
        companyId: ids.company,
        transactionType: "PURCHASE_REQUEST",
        routeKey: "DEFAULT",
        priority: 30,
        isActive: true,
        steps: { create: [{ stepOrder: 1, approverType: "ROLE", roleId: crowdedRoleId, userId: null, required: true }] },
      },
    })).rejects.toThrow();
    expect(await prisma.approvalRule.count({ where: { tenantId: ids.tenant, companyId: ids.company, transactionType: "PURCHASE_REQUEST", routeKey: "DEFAULT", isActive: true } })).toBe(before);
  });
});
