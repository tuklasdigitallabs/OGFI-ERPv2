import assert from "node:assert/strict";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

import {
  deriveSyntheticPilotUuid,
  verifySyntheticPilotManifestEnvelope,
} from "../../../scripts/inventory-pilot-synthetic-manifest.mjs";
import { assertSafeSyntheticFixtureDatabaseName } from "../../../scripts/inventory-pilot-synthetic-boundary.mjs";

const envelope = JSON.parse(fs.readFileSync(new URL("../../../scripts/fixtures/inventory-pilot.synthetic.local-only.json", import.meta.url), "utf8"));
const { digest } = verifySyntheticPilotManifestEnvelope(envelope);
const manifest = envelope.manifest;
const prisma = new PrismaClient();
const uuid = (logicalId) => deriveSyntheticPilotUuid(logicalId);
const code = (logicalId) => logicalId.replace(/^synthetic-/, "SYN-").replaceAll("-", "_").toUpperCase();
const loginCode = (logicalId) => logicalId.replace(/^synthetic-/, "syn-").replaceAll("-", "_").toLowerCase();
const name = (logicalId) => `Synthetic ${logicalId.replace(/^synthetic-/, "").replaceAll("-", " ")}`;
const fixtureEffectiveAt = new Date("2026-01-01T00:00:00.000Z");
const asciiCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
let allowFixtureCreates = false;

function fail(message) {
  throw new Error(`INVENTORY_PILOT_SYNTHETIC_FIXTURE_INVALID:${message}`);
}

function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && typeof value.toFixed === "function") return value.toFixed(6);
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, comparable(entry)]));
  return value;
}

function assertExact(actual, expected, label) {
  try {
    assert.deepEqual(comparable(actual), comparable(expected));
  } catch {
    fail(`${label}_DRIFT`);
  }
}

async function assertDisposableMarker(client) {
  const required = [
    "AUTHORIZATION_DATABASE_INTEGRATION",
    "AUTHORIZATION_TEST_DATABASE",
    "AUTHORIZATION_TEST_RUN_ID",
    "AUTHORIZATION_TEST_RUNTIME_ROLE",
    "AUTHORIZATION_TEST_DATABASE_NONCE_SHA256",
  ];
  for (const key of required) if (!process.env[key]) fail(`${key}_REQUIRED`);
  if (process.env.AUTHORIZATION_DATABASE_INTEGRATION !== "yes") fail("DISPOSABLE_SENTINEL_REQUIRED");
  const parsed = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) fail("DATABASE_HOST_NOT_LOOPBACK");
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  try {
    assertSafeSyntheticFixtureDatabaseName(databaseName);
  } catch {
    fail("DATABASE_NAME_UNSAFE");
  }
  if (databaseName !== process.env.AUTHORIZATION_TEST_DATABASE) fail("DATABASE_IDENTITY_MISMATCH");
  if (decodeURIComponent(parsed.username) !== process.env.AUTHORIZATION_TEST_RUNTIME_ROLE) fail("DATABASE_ROLE_MISMATCH");
  const rows = await client.$queryRawUnsafe(`
    SELECT current_database()::text AS "currentDatabase",
           current_user::text AS "currentUser",
           marker.database_name AS "databaseName",
           marker.run_id AS "runId",
           marker.nonce_sha256 AS "nonceSha256"
      FROM ogfi_disposable_control.verify_database_identity() AS marker
  `);
  assertExact(rows, [{
    currentDatabase: databaseName,
    currentUser: process.env.AUTHORIZATION_TEST_RUNTIME_ROLE,
    databaseName,
    runId: process.env.AUTHORIZATION_TEST_RUN_ID,
    nonceSha256: process.env.AUTHORIZATION_TEST_DATABASE_NONCE_SHA256,
  }], "DISPOSABLE_MARKER");
}

async function ensureUnique(model, where, data, select, label) {
  const existing = await model.findUnique({ where, select });
  const expected = Object.fromEntries(Object.keys(select).map((key) => [key, data[key]]));
  if (existing) {
    assertExact(existing, expected, label);
    return existing;
  }
  if (!allowFixtureCreates) fail(`${label}_MISSING`);
  const created = await model.create({ data, select });
  assertExact(created, expected, label);
  return created;
}

function ids(values) {
  return values.map(({ id }) => uuid(id));
}

async function assertExactIds(model, where, expected, label) {
  const rows = await model.findMany({ where, select: { id: true } });
  assertExact(rows.map(({ id }) => id).sort(asciiCompare), [...expected].sort(asciiCompare), label);
}

function accessLevelFor(actor) {
  return actor.id.includes("approver")
    ? "APPROVE"
    : actor.id.includes("auditor") || actor.id.includes("out-of-scope") || actor.id.includes("no-role")
      ? "VIEW"
      : "OPERATE";
}

function approvalRuleLogicalId(transactionType) {
  return `synthetic-approval-rule-${transactionType.replaceAll(/([a-z])([A-Z])/g, "$1-$2").replaceAll("_", "-").toLowerCase()}`;
}

function approverRoleFor(transactionType) {
  return ["WastageReport", "StockAdjustment", "StockCountVarianceAdjustment"].includes(transactionType)
    ? "synthetic-role-inventory-approver"
    : "synthetic-role-purchasing-approver";
}

async function provision(client, allowCreate) {
  allowFixtureCreates = allowCreate;
  const scope = manifest.scope;
  await ensureUnique(client.tenant, { id: uuid(scope.tenant.id) }, {
    id: uuid(scope.tenant.id), name: name(scope.tenant.id), loginCode: loginCode(scope.tenant.id), status: "ACTIVE", defaultTimezone: "Asia/Manila",
  }, { id: true, name: true, loginCode: true, status: true, defaultTimezone: true }, "TENANT");
  await ensureUnique(client.tenant, { id: uuid(scope.adjacentDenialControls.tenant.id) }, {
    id: uuid(scope.adjacentDenialControls.tenant.id), name: name(scope.adjacentDenialControls.tenant.id), loginCode: loginCode(scope.adjacentDenialControls.tenant.id), status: "ACTIVE", defaultTimezone: "Asia/Manila",
  }, { id: true, name: true, loginCode: true, status: true, defaultTimezone: true }, "DENIAL_TENANT");
  for (const company of [scope.company, scope.adjacentDenialControls.company]) {
    await ensureUnique(client.company, { id: uuid(company.id) }, {
      id: uuid(company.id), tenantId: uuid(company.tenantId), code: code(company.id), legalName: name(company.id), tradingName: name(company.id), currencyCode: "PHP", timezone: "Asia/Manila", status: "ACTIVE",
    }, { id: true, tenantId: true, code: true, legalName: true, tradingName: true, currencyCode: true, timezone: true, status: true }, `COMPANY_${company.id}`);
  }
  await ensureUnique(client.brand, { id: uuid(scope.brand.id) }, {
    id: uuid(scope.brand.id), tenantId: uuid(scope.brand.tenantId), companyId: uuid(scope.brand.companyId), code: code(scope.brand.id), name: name(scope.brand.id), status: "ACTIVE",
  }, { id: true, tenantId: true, companyId: true, code: true, name: true, status: true }, "BRAND");
  for (const location of [...scope.physicalLocations, scope.adjacentDenialControls.location]) {
    await ensureUnique(client.location, { id: uuid(location.id) }, {
      id: uuid(location.id), tenantId: uuid(location.tenantId), companyId: uuid(location.companyId), brandId: location.brandId ? uuid(location.brandId) : null,
      locationType: location.kind === "MAIN_WAREHOUSE" ? "WAREHOUSE" : "BRANCH", code: code(location.id), name: name(location.id), timezone: "Asia/Manila", status: "ACTIVE",
    }, { id: true, tenantId: true, companyId: true, brandId: true, locationType: true, code: true, name: true, timezone: true, status: true }, `LOCATION_${location.id}`);
  }
  for (const location of scope.inventoryLocations) {
    await ensureUnique(client.inventoryLocation, { id: uuid(location.id) }, {
      id: uuid(location.id), tenantId: uuid(location.tenantId), companyId: uuid(location.companyId), locationId: uuid(location.locationId), code: code(location.id), name: name(location.id), storageType: "SYNTHETIC", status: "ACTIVE",
    }, { id: true, tenantId: true, companyId: true, locationId: true, code: true, name: true, storageType: true, status: true }, `INVENTORY_LOCATION_${location.id}`);
  }

  const catalog = manifest.inventoryCatalog;
  await ensureUnique(client.itemCategory, { id: uuid(catalog.category.id) }, {
    id: uuid(catalog.category.id), tenantId: uuid(catalog.category.tenantId), companyId: uuid(catalog.category.companyId), categoryCode: code(catalog.category.id), categoryName: name(catalog.category.id), inventoryClass: "SYNTHETIC", status: "ACTIVE",
  }, { id: true, tenantId: true, companyId: true, categoryCode: true, categoryName: true, inventoryClass: true, status: true }, "ITEM_CATEGORY");
  for (const uom of catalog.unitsOfMeasure) {
    await ensureUnique(client.uom, { id: uuid(uom.id) }, {
      id: uuid(uom.id), tenantId: uuid(uom.tenantId), companyId: uuid(uom.companyId), uomCode: code(uom.id), uomName: name(uom.id), uomType: uom.kind, decimalPrecision: 6, status: "ACTIVE",
    }, { id: true, tenantId: true, companyId: true, uomCode: true, uomName: true, uomType: true, decimalPrecision: true, status: true }, `UOM_${uom.id}`);
  }
  const purchaseUom = catalog.unitsOfMeasure.find(({ kind }) => kind === "PURCHASE");
  for (const supplier of catalog.suppliers) {
    await ensureUnique(client.supplier, { id: uuid(supplier.id) }, {
      id: uuid(supplier.id), tenantId: uuid(supplier.tenantId), companyId: uuid(supplier.companyId), supplierCode: code(supplier.id), legalName: name(supplier.id), accreditationStatus: "APPROVED", status: "ACTIVE",
    }, { id: true, tenantId: true, companyId: true, supplierCode: true, legalName: true, accreditationStatus: true, status: true }, `SUPPLIER_${supplier.id}`);
  }
  for (const item of catalog.selectedItems) {
    await ensureUnique(client.item, { id: uuid(item.id) }, {
      id: uuid(item.id), tenantId: uuid(item.tenantId), companyId: uuid(item.companyId), itemCode: code(item.id), itemName: name(item.id), itemCategoryId: uuid(item.categoryId), itemType: "INVENTORY", baseUomId: uuid(item.baseUomId), purchaseUomId: uuid(purchaseUom.id), issueUomId: uuid(item.baseUomId), trackInventory: true, trackExpiry: false, trackLot: false, requiresReceivingInspection: false, status: "ACTIVE",
    }, { id: true, tenantId: true, companyId: true, itemCode: true, itemName: true, itemCategoryId: true, itemType: true, baseUomId: true, purchaseUomId: true, issueUomId: true, trackInventory: true, trackExpiry: true, trackLot: true, requiresReceivingInspection: true, status: true }, `ITEM_${item.id}`);
  }
  for (const conversion of catalog.conversions) {
    await ensureUnique(client.itemUomConversion, { id: uuid(conversion.id) }, {
      id: uuid(conversion.id), itemId: uuid(conversion.itemId), fromUomId: uuid(conversion.purchaseUomId), toUomId: uuid(conversion.baseUomId), conversionFactor: "1.000000", roundingRule: "SYNTHETIC_EXACT",
    }, { id: true, itemId: true, fromUomId: true, toUomId: true, conversionFactor: true, roundingRule: true }, `CONVERSION_${conversion.id}`);
  }
  for (const link of catalog.supplierItems) {
    await ensureUnique(client.supplierItemLink, { id: uuid(link.id) }, {
      id: uuid(link.id), tenantId: uuid(link.tenantId), companyId: uuid(link.companyId), supplierId: uuid(link.supplierId), itemId: uuid(link.itemId), purchaseUomId: uuid(link.purchaseUomId), supplierSku: code(link.id), supplierItemName: name(link.id), status: "ACTIVE",
    }, { id: true, tenantId: true, companyId: true, supplierId: true, itemId: true, purchaseUomId: true, supplierSku: true, supplierItemName: true, status: true }, `SUPPLIER_ITEM_${link.id}`);
  }

  for (const role of manifest.accessGraph.roles) {
    await ensureUnique(client.role, { id: uuid(role.id) }, {
      id: uuid(role.id), tenantId: uuid(scope.tenant.id), code: code(role.id), name: name(role.id), systemRole: false, status: "ACTIVE",
    }, { id: true, tenantId: true, code: true, name: true, systemRole: true, status: true }, `ROLE_${role.id}`);
    const permissions = await client.permission.findMany({ where: { code: { in: role.permissionAllowlist } }, select: { id: true, code: true } });
    assertExact(permissions.map(({ code: value }) => value).sort(), [...role.permissionAllowlist].sort(), `PERMISSION_CATALOG_${role.id}`);
    if (allowCreate) await client.rolePermission.createMany({ data: permissions.map(({ id: permissionId }) => ({ roleId: uuid(role.id), permissionId })), skipDuplicates: true });
  }
  for (const actor of manifest.accessGraph.actors) {
    const tenantId = uuid(scope.tenant.id);
    await ensureUnique(client.user, { id: uuid(actor.id) }, {
      id: uuid(actor.id), tenantId, email: `${uuid(actor.id)}@synthetic.invalid`, displayName: name(actor.id), status: "ACTIVE", privilegeEpoch: 0,
    }, { id: true, tenantId: true, email: true, displayName: true, status: true, privilegeEpoch: true }, `USER_${actor.id}`);
    for (const roleId of actor.roleIds) await ensureUnique(client.userRoleAssignment, { id: uuid(`${actor.id}-${roleId.replace(/^synthetic-/, "")}`) }, {
      id: uuid(`${actor.id}-${roleId.replace(/^synthetic-/, "")}`), userId: uuid(actor.id), roleId: uuid(roleId), startsAt: fixtureEffectiveAt, status: "ACTIVE", endsAt: null,
    }, { id: true, userId: true, roleId: true, startsAt: true, status: true, endsAt: true }, `USER_ROLE_${actor.id}_${roleId}`);
    for (const companyId of actor.companyIds) await ensureUnique(client.userScopeAssignment, { id: uuid(`${actor.id}-${companyId.replace(/^synthetic-/, "")}`) }, {
      id: uuid(`${actor.id}-${companyId.replace(/^synthetic-/, "")}`), userId: uuid(actor.id), scopeType: "COMPANY", scopeId: uuid(companyId), accessLevel: accessLevelFor(actor), startsAt: fixtureEffectiveAt, status: "ACTIVE", endsAt: null,
    }, { id: true, userId: true, scopeType: true, scopeId: true, accessLevel: true, startsAt: true, status: true, endsAt: true }, `USER_COMPANY_SCOPE_${actor.id}_${companyId}`);
    for (const locationId of actor.locationIds) await ensureUnique(client.userScopeAssignment, { id: uuid(`${actor.id}-${locationId.replace(/^synthetic-/, "")}`) }, {
      id: uuid(`${actor.id}-${locationId.replace(/^synthetic-/, "")}`), userId: uuid(actor.id), scopeType: "LOCATION", scopeId: uuid(locationId), accessLevel: accessLevelFor(actor), startsAt: fixtureEffectiveAt, status: "ACTIVE", endsAt: null,
    }, { id: true, userId: true, scopeType: true, scopeId: true, accessLevel: true, startsAt: true, status: true, endsAt: true }, `USER_LOCATION_SCOPE_${actor.id}_${locationId}`);
  }

  for (const transactionType of manifest.approvalExpectations.persistedKeys) {
    const logicalRuleId = approvalRuleLogicalId(transactionType);
    const ruleId = uuid(logicalRuleId);
    const existing = await client.approvalRule.findUnique({ where: { id: ruleId }, include: { steps: true } });
    if (!existing) {
      if (!allowCreate) fail(`APPROVAL_RULE_${transactionType}_MISSING`);
      await client.$transaction(async (tx) => {
        await tx.approvalRule.create({ data: { id: ruleId, lineageId: ruleId, tenantId: uuid(scope.tenant.id), companyId: uuid(scope.company.id), transactionType, routeKey: "DEFAULT", scopeFilters: { authority: manifest.authority, sourceDecisionId: manifest.sourceDecisionId, manifestDigest: digest }, priority: 100, isActive: true, version: 1, lifecycleVersion: 1, definitionSealed: false } });
        await tx.approvalRuleStep.create({ data: { id: uuid(`${logicalRuleId}-step-001`), approvalRuleId: ruleId, stepOrder: 1, approverType: "ROLE", roleId: uuid(approverRoleFor(transactionType)), userId: null, required: true } });
        const sealed = await tx.approvalRule.updateMany({ where: { id: ruleId, definitionSealed: false }, data: { definitionSealed: true } });
        if (sealed.count !== 1) fail(`APPROVAL_RULE_${transactionType}_SEAL_FAILED`);
      });
    }
  }
}

async function validate(client) {
  await provision(client, false);
  const scope = manifest.scope;
  const catalog = manifest.inventoryCatalog;
  const roleIds = ids(manifest.accessGraph.roles);
  const actorIds = ids(manifest.accessGraph.actors);
  const tenantId = uuid(scope.tenant.id);
  const companyId = uuid(scope.company.id);
  await assertExactIds(client.company, { tenantId }, [companyId, uuid(scope.adjacentDenialControls.company.id)], "COMPANY_SET");
  await assertExactIds(client.company, { tenantId: uuid(scope.adjacentDenialControls.tenant.id) }, [], "DENIAL_TENANT_COMPANY_SET");
  await assertExactIds(client.brand, { tenantId }, [uuid(scope.brand.id)], "BRAND_SET");
  await assertExactIds(client.location, { tenantId }, ids([...scope.physicalLocations, scope.adjacentDenialControls.location]), "LOCATION_SET");
  await assertExactIds(client.inventoryLocation, { tenantId }, ids(scope.inventoryLocations), "INVENTORY_LOCATION_SET");
  await assertExactIds(client.itemCategory, { tenantId }, [uuid(catalog.category.id)], "ITEM_CATEGORY_SET");
  await assertExactIds(client.uom, { tenantId }, ids(catalog.unitsOfMeasure), "UOM_SET");
  await assertExactIds(client.item, { tenantId }, ids(catalog.selectedItems), "ITEM_SET");
  await assertExactIds(client.supplier, { tenantId }, ids(catalog.suppliers), "SUPPLIER_SET");
  await assertExactIds(client.supplierItemLink, { tenantId }, ids(catalog.supplierItems), "SUPPLIER_ITEM_SET");
  await assertExactIds(client.user, { tenantId }, actorIds, "USER_SET");
  await assertExactIds(client.role, { tenantId }, roleIds, "ROLE_SET");
  const conversionRows = await client.itemUomConversion.findMany({ where: { itemId: { in: ids(catalog.selectedItems) } }, select: { id: true } });
  assertExact(conversionRows.map(({ id }) => id).sort(asciiCompare), ids(catalog.conversions).sort(asciiCompare), "CONVERSION_SET");
  const roles = await client.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, permissions: { select: { permission: { select: { code: true } } } } } });
  assert.equal(roles.length, roleIds.length, "synthetic roles must exist exactly");
  for (const role of manifest.accessGraph.roles) {
    const persisted = roles.find(({ id }) => id === uuid(role.id));
    assertExact(persisted.permissions.map(({ permission }) => permission.code).sort(), [...role.permissionAllowlist].sort(), `ROLE_PERMISSION_${role.id}`);
  }
  const assignments = await client.userRoleAssignment.findMany({ where: { userId: { in: actorIds } }, select: { userId: true, roleId: true, startsAt: true, status: true, endsAt: true } });
  const expectedAssignments = manifest.accessGraph.actors.flatMap((actor) => actor.roleIds.map((roleId) => ({ userId: uuid(actor.id), roleId: uuid(roleId), startsAt: fixtureEffectiveAt, status: "ACTIVE", endsAt: null })));
  assertExact(assignments.sort((a, b) => asciiCompare(`${a.userId}:${a.roleId}`, `${b.userId}:${b.roleId}`)), expectedAssignments.sort((a, b) => asciiCompare(`${a.userId}:${a.roleId}`, `${b.userId}:${b.roleId}`)), "USER_ROLE_ASSIGNMENTS");
  const scopes = await client.userScopeAssignment.findMany({ where: { userId: { in: actorIds } }, select: { userId: true, scopeType: true, scopeId: true, accessLevel: true, startsAt: true, status: true, endsAt: true } });
  const expectedScopes = manifest.accessGraph.actors.flatMap((actor) => [
    ...actor.companyIds.map((scopeId) => ({ userId: uuid(actor.id), scopeType: "COMPANY", scopeId: uuid(scopeId), accessLevel: accessLevelFor(actor), startsAt: fixtureEffectiveAt, status: "ACTIVE", endsAt: null })),
    ...actor.locationIds.map((scopeId) => ({ userId: uuid(actor.id), scopeType: "LOCATION", scopeId: uuid(scopeId), accessLevel: accessLevelFor(actor), startsAt: fixtureEffectiveAt, status: "ACTIVE", endsAt: null })),
  ]);
  const scopeKey = (entry) => `${entry.userId}:${entry.scopeType}:${entry.scopeId}`;
  assertExact(scopes.sort((a, b) => asciiCompare(scopeKey(a), scopeKey(b))), expectedScopes.sort((a, b) => asciiCompare(scopeKey(a), scopeKey(b))), "USER_SCOPE_ASSIGNMENTS");
  const rules = await client.approvalRule.findMany({ where: { tenantId: uuid(scope.tenant.id), companyId: uuid(scope.company.id) }, include: { steps: true } });
  const expectedRuleIds = manifest.approvalExpectations.persistedKeys.map((transactionType) => uuid(approvalRuleLogicalId(transactionType)));
  assertExact(rules.map(({ id }) => id).sort(asciiCompare), expectedRuleIds.sort(asciiCompare), "APPROVAL_RULE_SET");
  for (const rule of rules) {
    const logicalRuleId = approvalRuleLogicalId(rule.transactionType);
    const expectedRuleId = uuid(logicalRuleId);
    assertExact({
      id: rule.id,
      tenantId: rule.tenantId,
      companyId: rule.companyId,
      transactionType: rule.transactionType,
      routeKey: rule.routeKey,
      priority: rule.priority,
      isActive: rule.isActive,
      lineageId: rule.lineageId,
      version: rule.version,
      supersedesRuleId: rule.supersedesRuleId,
      lifecycleVersion: rule.lifecycleVersion,
      definitionSealed: rule.definitionSealed,
    }, {
      id: expectedRuleId,
      tenantId,
      companyId,
      transactionType: rule.transactionType,
      routeKey: "DEFAULT",
      priority: 100,
      isActive: true,
      lineageId: expectedRuleId,
      version: 1,
      supersedesRuleId: null,
      lifecycleVersion: 1,
      definitionSealed: true,
    }, `APPROVAL_RULE_${rule.transactionType}_SHAPE`);
    assertExact(rule.steps.map((step) => ({ id: step.id, stepOrder: step.stepOrder, approverType: step.approverType, roleId: step.roleId, userId: step.userId, required: step.required, escalationHours: step.escalationHours })), [{
      id: uuid(`${logicalRuleId}-step-001`), stepOrder: 1, approverType: "ROLE", roleId: uuid(approverRoleFor(rule.transactionType)), userId: null, required: true, escalationHours: null,
    }], `APPROVAL_RULE_${rule.transactionType}_STEPS`);
    assertExact(rule.scopeFilters, { authority: manifest.authority, sourceDecisionId: manifest.sourceDecisionId, manifestDigest: digest }, `APPROVAL_RULE_${rule.transactionType}_PROVENANCE`);
  }
  const prohibitedStateCounts = {
    purchaseRequests: await client.purchaseRequest.count({ where: { tenantId } }),
    purchaseOrders: await client.purchaseOrder.count({ where: { tenantId } }),
    goodsReceipts: await client.goodsReceipt.count({ where: { tenantId } }),
    inventoryTransfers: await client.inventoryTransfer.count({ where: { tenantId } }),
    stockCountSessions: await client.stockCountSession.count({ where: { tenantId } }),
    wastageReports: await client.wastageReport.count({ where: { tenantId } }),
    stockAdjustments: await client.stockAdjustment.count({ where: { tenantId } }),
    approvalInstances: await client.approvalInstance.count({ where: { tenantId } }),
    notifications: await client.notification.count({ where: { tenantId } }),
    auditEvents: await client.auditEvent.count({ where: { tenantId } }),
    inventoryMovements: await client.inventoryMovement.count({ where: { tenantId } }),
    inventoryBalances: await client.inventoryBalance.count({ where: { tenantId } }),
    companyPolicySettings: await client.companyPolicySetting.count({ where: { tenantId } }),
  };
  if (Object.values(prohibitedStateCounts).some((count) => count !== 0)) {
    fail(`FIXTURE_MUST_NOT_CREATE_AUTHORITY_OR_INVENTORY_STATE:${JSON.stringify(prohibitedStateCounts)}`);
  }
  return { actors: actorIds.length, approvalRules: rules.length, digest, roles: roleIds.length, scopes: scopes.length };
}

async function proveAdversarialRejection() {
  const scope = manifest.scope;
  const tenantId = uuid(scope.tenant.id);
  const companyId = uuid(scope.company.id);
  const warehouseLocation = scope.physicalLocations.find(({ kind }) => kind === "MAIN_WAREHOUSE");
  const branchLocation = scope.physicalLocations.find(({ kind }) => kind === "BRANCH");
  const warehouseInventoryLocation = scope.inventoryLocations.find(({ locationId }) => locationId === warehouseLocation.id);
  const item = manifest.inventoryCatalog.selectedItems[0];
  const actor = manifest.accessGraph.actors.find(({ id }) => id === "synthetic-actor-inventory-requester");
  const noRoleActor = manifest.accessGraph.actors.find(({ id }) => id === "synthetic-actor-no-role");
  const expectedRuleId = uuid(approvalRuleLogicalId(manifest.approvalExpectations.persistedKeys[0]));

  const cases = [
    {
      name: "EXTRA_ROLE_ASSIGNMENT",
      expected: "USER_ROLE_ASSIGNMENTS_DRIFT",
      mutate: (tx) => tx.userRoleAssignment.create({ data: { id: uuid("synthetic-adversarial-extra-assignment"), userId: uuid(noRoleActor.id), roleId: uuid("synthetic-role-read-only-auditor") } }),
    },
    {
      name: "CROSS_SCOPE_ASSIGNMENT",
      expected: "USER_SCOPE_ASSIGNMENTS_DRIFT",
      mutate: (tx) => tx.userScopeAssignment.create({ data: { id: uuid("synthetic-adversarial-cross-scope"), userId: uuid(actor.id), scopeType: "LOCATION", scopeId: uuid(scope.adjacentDenialControls.location.id), accessLevel: "VIEW", startsAt: fixtureEffectiveAt } }),
    },
    {
      name: "EXTRA_PERMISSION",
      expected: "ROLE_PERMISSION_synthetic-role-read-only-auditor_DRIFT",
      mutate: async (tx) => {
        const role = manifest.accessGraph.roles.find(({ id }) => id === "synthetic-role-read-only-auditor");
        const permission = await tx.permission.findFirstOrThrow({ where: { code: { notIn: role.permissionAllowlist } }, select: { id: true } });
        return tx.rolePermission.create({ data: { roleId: uuid(role.id), permissionId: permission.id } });
      },
    },
    {
      name: "EXTRA_APPROVAL_RULE",
      expected: "APPROVAL_RULE_SET_DRIFT",
      mutate: (tx) => tx.approvalRule.create({ data: { id: uuid("synthetic-adversarial-extra-rule"), tenantId, companyId, transactionType: "SyntheticUnexpected", routeKey: "DEFAULT", lineageId: uuid("synthetic-adversarial-extra-rule") } }),
    },
    {
      name: "EXTRA_APPROVAL_ROUTE",
      expected: "APPROVAL_RULE_SET_DRIFT",
      mutate: (tx) => tx.approvalRule.create({ data: { id: uuid("synthetic-adversarial-extra-route"), tenantId, companyId, transactionType: "PURCHASE_REQUEST", routeKey: "PR_EMERGENCY", lineageId: uuid("synthetic-adversarial-extra-route") } }),
    },
    {
      name: "OPERATIONAL_TRANSACTION",
      expected: "FIXTURE_MUST_NOT_CREATE_AUTHORITY_OR_INVENTORY_STATE",
      mutate: (tx) => tx.inventoryTransfer.create({ data: { id: uuid("synthetic-adversarial-transfer"), tenantId, companyId, publicReference: "SYN-ADVERSARIAL-TRANSFER", sourceLocationId: uuid(warehouseLocation.id), destinationLocationId: uuid(branchLocation.id), requestedByUserId: uuid(actor.id), transferType: "REPLENISHMENT", purpose: "Adversarial rollback proof" } }),
    },
    {
      name: "APPROVAL_INSTANCE",
      expected: "FIXTURE_MUST_NOT_CREATE_AUTHORITY_OR_INVENTORY_STATE",
      mutate: (tx) => tx.approvalInstance.create({ data: { id: uuid("synthetic-adversarial-approval-instance"), tenantId, companyId, documentType: manifest.approvalExpectations.persistedKeys[0], documentId: uuid("synthetic-adversarial-document"), approvalRuleId: expectedRuleId } }),
    },
    {
      name: "INVENTORY_BALANCE",
      expected: "FIXTURE_MUST_NOT_CREATE_AUTHORITY_OR_INVENTORY_STATE",
      mutate: (tx) => tx.inventoryBalance.create({ data: { id: uuid("synthetic-adversarial-balance"), tenantId, companyId, inventoryLocationId: uuid(warehouseInventoryLocation.id), itemId: uuid(item.id), baseUomId: uuid(item.baseUomId), qtyOnHand: "1" } }),
    },
    {
      name: "INVENTORY_MOVEMENT",
      expected: "FIXTURE_MUST_NOT_CREATE_AUTHORITY_OR_INVENTORY_STATE",
      mutate: (tx) => tx.inventoryMovement.create({ data: { id: uuid("synthetic-adversarial-movement"), tenantId, companyId, inventoryLocationId: uuid(warehouseInventoryLocation.id), itemId: uuid(item.id), movementType: "OPENING_BALANCE_IN", occurredAt: fixtureEffectiveAt, enteredQuantity: "1", enteredUomId: uuid(item.baseUomId), quantityDeltaBaseUom: "1", baseUomId: uuid(item.baseUomId), sourceDocumentType: "SyntheticAdversarial", sourceDocumentId: uuid("synthetic-adversarial-document"), sourceEventKey: "synthetic-adversarial-movement", postedByUserId: uuid(actor.id) } }),
    },
    {
      name: "COMPANY_POLICY",
      expected: "FIXTURE_MUST_NOT_CREATE_AUTHORITY_OR_INVENTORY_STATE",
      mutate: (tx) => tx.companyPolicySetting.create({ data: { id: uuid("synthetic-adversarial-policy"), tenantId, companyId, key: "synthetic.adversarial", category: "INVENTORY", label: "Synthetic adversarial", description: "Rollback proof only", value: true, defaultValue: false, valueType: "BOOLEAN", sourceDecisionId: "DEC-0259" } }),
    },
    {
      name: "NOTIFICATION",
      expected: "FIXTURE_MUST_NOT_CREATE_AUTHORITY_OR_INVENTORY_STATE",
      mutate: (tx) => tx.notification.create({ data: { id: uuid("synthetic-adversarial-notification"), tenantId, companyId, locationId: uuid(branchLocation.id), recipientUserId: uuid(actor.id), notificationType: "SYNTHETIC", title: "Synthetic adversarial", body: "Rollback proof only", deepLink: "/synthetic", entityType: "Synthetic", entityId: uuid("synthetic-adversarial-document"), sourceEventKey: "synthetic-adversarial-notification" } }),
    },
    {
      name: "AUDIT_EVENT",
      expected: "FIXTURE_MUST_NOT_CREATE_AUTHORITY_OR_INVENTORY_STATE",
      mutate: (tx) => tx.auditEvent.create({ data: { id: uuid("synthetic-adversarial-audit"), tenantId, companyId, actorUserId: uuid(actor.id), eventType: "SYNTHETIC_ADVERSARIAL", entityType: "Synthetic", entityId: uuid("synthetic-adversarial-document") } }),
    },
  ];

  for (const adversarialCase of cases) {
    try {
      await prisma.$transaction(async (tx) => {
        await adversarialCase.mutate(tx);
        await validate(tx);
      });
      fail(`ADVERSARIAL_${adversarialCase.name}_ACCEPTED`);
    } catch (error) {
      if (!String(error).includes(adversarialCase.expected)) throw error;
    }
  }
}

try {
  await assertDisposableMarker(prisma);
  await provision(prisma, true);
  const first = await validate(prisma);
  await provision(prisma, true);
  const second = await validate(prisma);
  assertExact(second, first, "REPEAT_VALIDATION");
  await proveAdversarialRejection();
  const final = await validate(prisma);
  assertExact(final, first, "POST_ADVERSARIAL_ROLLBACK");
  console.log(`INVENTORY_PILOT_SYNTHETIC_FIXTURE_OK:${JSON.stringify(final)}`);
} finally {
  await prisma.$disconnect();
}
