import { createHash } from "node:crypto";

export const PERSISTED_APPROVAL_KEYS = Object.freeze([
  "PURCHASE_REQUEST", "PurchaseOrder", "PurchaseOrderAmendment",
  "PurchaseOrderBalanceClosure", "QuotationRecommendation", "StockAdjustment",
  "StockCountVarianceAdjustment", "WastageReport",
]);
const MISSING_CONCEPTUAL_FAMILIES = Object.freeze(["ORDINARY_STOCK_COUNT", "TRANSFER_REQUEST"]);
const PROHIBITED_OVERLAPS = Object.freeze(["approver:poster", "requester:approver", "requester:poster"]);
const SYNTHETIC_ID = /^synthetic-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSAFE_TEXT = /(?:^|[^a-z])(prod(?:uction)?|live|real|operational|authoritative|approved)(?:[^a-z]|$)/i;
const ROLE_PERMISSIONS = Object.freeze({
  "synthetic-role-purchasing-requester": ["purchasing.purchase_order.amend", "purchasing.purchase_order.close_remaining", "purchasing.purchase_order.create", "purchasing.purchase_order.submit", "purchasing.purchase_request.create", "purchasing.purchase_request.submit", "purchasing.quote.manage"],
  "synthetic-role-purchasing-approver": ["purchasing.purchase_order.approve", "purchasing.purchase_request.approve", "purchasing.quote.approve"],
  "synthetic-role-purchasing-poster": ["purchasing.purchase_order.issue"],
  "synthetic-role-inventory-requester": ["inventory.stock_adjustment.create", "inventory.stock_adjustment.submit", "inventory.stock_count.create", "inventory.stock_count.enter", "inventory.stock_count.submit", "inventory.wastage.create", "inventory.wastage.submit"],
  "synthetic-role-inventory-approver": ["inventory.stock_adjustment.approve", "inventory.stock_count.review", "inventory.wastage.approve"],
  "synthetic-role-inventory-poster": ["inventory.receiving.post", "inventory.stock_adjustment.post", "inventory.wastage.post"],
  "synthetic-role-transfer-dispatcher": ["inventory.transfer.dispatch"],
  "synthetic-role-transfer-receiver": ["inventory.transfer.receive"],
  "synthetic-role-count-performer": ["inventory.stock_count.enter", "inventory.stock_count.submit"],
  "synthetic-role-read-only-auditor": ["inventory.balance.view", "inventory.ledger.view", "inventory.receiving.view", "inventory.stock_adjustment.view", "inventory.stock_count.view", "inventory.transfer.view", "inventory.wastage.view", "purchasing.purchase_order.view"],
});
const ACTOR_ROLES = Object.freeze({
  "synthetic-actor-purchasing-requester": ["synthetic-role-purchasing-requester"],
  "synthetic-actor-inventory-requester": ["synthetic-role-inventory-requester"],
  "synthetic-actor-approver": ["synthetic-role-inventory-approver", "synthetic-role-purchasing-approver"],
  "synthetic-actor-poster": ["synthetic-role-inventory-poster", "synthetic-role-purchasing-poster"],
  "synthetic-actor-transfer-dispatcher": ["synthetic-role-transfer-dispatcher"],
  "synthetic-actor-transfer-receiver": ["synthetic-role-transfer-receiver"],
  "synthetic-actor-count-performer": ["synthetic-role-count-performer"],
  "synthetic-actor-read-only-auditor": ["synthetic-role-read-only-auditor"],
  "synthetic-actor-no-role": [],
  "synthetic-actor-out-of-scope": ["synthetic-role-read-only-auditor"],
});
const PURCHASING_APPROVAL_DUTIES = Object.freeze({
  requesterActorId: "synthetic-actor-purchasing-requester",
  approverActorId: "synthetic-actor-approver",
  posterActorId: "synthetic-actor-poster",
});
const INVENTORY_APPROVAL_DUTIES = Object.freeze({
  requesterActorId: "synthetic-actor-inventory-requester",
  approverActorId: "synthetic-actor-approver",
  posterActorId: "synthetic-actor-poster",
});
const FAMILY_DUTIES = Object.freeze(Object.fromEntries(PERSISTED_APPROVAL_KEYS.map((key) => [
  key,
  ["WastageReport", "StockAdjustment", "StockCountVarianceAdjustment"].includes(key)
    ? INVENTORY_APPROVAL_DUTIES
    : PURCHASING_APPROVAL_DUTIES,
])));

function fail(path, message) { throw new TypeError(`${path}: ${message}`); }
function asciiCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function exactObject(value, keys, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  const actual = Object.keys(value).sort(asciiCompare);
  const expected = [...keys].sort(asciiCompare);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(path, `must contain exactly: ${expected.join(", ")}`);
}
function id(value, path) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) fail(path, "must be a stable synthetic-* identifier");
  if (UNSAFE_TEXT.test(value)) fail(path, "contains a forbidden operational marker");
  return value;
}
function unique(values, path) {
  if (!Array.isArray(values)) fail(path, "must be an array");
  if (new Set(values).size !== values.length) fail(path, "must not contain duplicates");
}
function exactSet(actual, expected, path) {
  unique(actual, path);
  const sorted = [...actual].sort(asciiCompare);
  if (sorted.length !== expected.length || sorted.some((value, index) => value !== expected[index])) fail(path, `must contain exactly: ${expected.join(", ")}`);
}
function scoped(value, keys, path, scope) {
  exactObject(value, ["id", "tenantId", "companyId", ...keys], path);
  id(value.id, `${path}.id`);
  if (value.tenantId !== scope.tenant.id || value.companyId !== scope.company.id) fail(path, "must reference the manifest tenant and company");
}
function safety(value, path = "manifest") {
  if (typeof value === "number" && path !== "manifest.schemaVersion") fail(path, "numeric policy, threshold, quantity, conversion factor, or opening value is forbidden");
  if (typeof value === "string" && (value.includes("@") || UNSAFE_TEXT.test(value))) fail(path, "contains a real-identity or operational-authority marker");
  if (Array.isArray(value)) value.forEach((entry, index) => safety(entry, `${path}[${index}]`));
  else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) safety(entry, `${path}.${key}`);
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort(asciiCompare).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sortById(values) { return [...values].sort((left, right) => asciiCompare(left.id, right.id)); }
function requireUniqueIds(values, path) {
  unique(values.map((entry) => entry.id), path);
  values.forEach((entry, index) => id(entry.id, `${path}[${index}].id`));
}

export function validateSyntheticPilotManifest(manifest) {
  exactObject(manifest, ["accessGraph", "approvalExpectations", "authority", "classification", "environment", "inventoryCatalog", "resourceBounds", "schemaVersion", "scope", "sourceDecisionId"], "manifest");
  if (manifest.schemaVersion !== 1) fail("manifest.schemaVersion", "must be 1");
  if (manifest.authority !== "TEST_ONLY" || manifest.environment !== "DISPOSABLE_LOCAL" || manifest.sourceDecisionId !== "DEC-0259") fail("manifest", "must retain TEST_ONLY, DISPOSABLE_LOCAL, and DEC-0259 authority markers");
  safety(manifest);
  exactObject(manifest.classification, ["disposable", "fixtureOnly", "localOnly", "nonAuthoritative", "synthetic"], "manifest.classification");
  for (const key of Object.keys(manifest.classification)) if (manifest.classification[key] !== true) fail(`manifest.classification.${key}`, "must be true");
  exactObject(manifest.resourceBounds, ["identifierContract", "selectedItems"], "manifest.resourceBounds");
  if (manifest.resourceBounds.selectedItems !== "SYNTHETIC_TEST_RESOURCE_BOUND_5") fail("manifest.resourceBounds.selectedItems", "must name the synthetic test resource bound");
  if (manifest.resourceBounds.identifierContract !== "DETERMINISTIC_LOGICAL_ID_TO_UUID") fail("manifest.resourceBounds.identifierContract", "must declare deterministic logical-ID to UUID derivation");

  const scope = manifest.scope;
  exactObject(scope, ["adjacentDenialControls", "brand", "company", "inventoryLocations", "physicalLocations", "tenant"], "manifest.scope");
  exactObject(scope.tenant, ["id"], "manifest.scope.tenant"); id(scope.tenant.id, "manifest.scope.tenant.id");
  exactObject(scope.company, ["id", "tenantId"], "manifest.scope.company"); id(scope.company.id, "manifest.scope.company.id");
  if (scope.company.tenantId !== scope.tenant.id) fail("manifest.scope.company.tenantId", "must reference the manifest tenant");
  exactObject(scope.brand, ["companyId", "id", "tenantId"], "manifest.scope.brand"); id(scope.brand.id, "manifest.scope.brand.id");
  if (scope.brand.tenantId !== scope.tenant.id || scope.brand.companyId !== scope.company.id) fail("manifest.scope.brand", "must reference the manifest tenant and company");
  if (!Array.isArray(scope.physicalLocations) || scope.physicalLocations.length < 2 || scope.physicalLocations.length > 3) fail("manifest.scope.physicalLocations", "must contain one warehouse and one or two branches");
  requireUniqueIds(scope.physicalLocations, "manifest.scope.physicalLocations");
  let warehouses = 0; let branches = 0;
  for (const [index, location] of scope.physicalLocations.entries()) {
    const path = `manifest.scope.physicalLocations[${index}]`;
    exactObject(location, ["brandId", "companyId", "id", "kind", "tenantId"], path);
    if (location.tenantId !== scope.tenant.id || location.companyId !== scope.company.id) fail(path, "must reference the manifest tenant and company");
    if (location.kind === "MAIN_WAREHOUSE" && location.brandId === null) warehouses += 1;
    else if (location.kind === "BRANCH" && location.brandId === scope.brand.id) branches += 1;
    else fail(path, "must be the company warehouse or a branch of the manifest brand");
  }
  if (warehouses !== 1 || branches < 1 || branches > 2) fail("manifest.scope.physicalLocations", "must contain exactly one warehouse and one or two branches");
  if (!Array.isArray(scope.inventoryLocations) || scope.inventoryLocations.length !== scope.physicalLocations.length) fail("manifest.scope.inventoryLocations", "must map every physical location exactly once");
  requireUniqueIds(scope.inventoryLocations, "manifest.scope.inventoryLocations");
  const physicalLocationIds = scope.physicalLocations.map(({ id: value }) => value);
  scope.inventoryLocations.forEach((location, index) => scoped(location, ["locationId"], `manifest.scope.inventoryLocations[${index}]`, scope));
  exactSet(scope.inventoryLocations.map(({ locationId }) => locationId), [...physicalLocationIds].sort(asciiCompare), "manifest.scope.inventoryLocations.locationId");
  const denial = scope.adjacentDenialControls;
  exactObject(denial, ["company", "location", "tenant"], "manifest.scope.adjacentDenialControls");
  exactObject(denial.tenant, ["id"], "manifest.scope.adjacentDenialControls.tenant"); id(denial.tenant.id, "manifest.scope.adjacentDenialControls.tenant.id");
  exactObject(denial.company, ["id", "tenantId"], "manifest.scope.adjacentDenialControls.company"); id(denial.company.id, "manifest.scope.adjacentDenialControls.company.id");
  exactObject(denial.location, ["companyId", "id", "kind", "tenantId"], "manifest.scope.adjacentDenialControls.location"); id(denial.location.id, "manifest.scope.adjacentDenialControls.location.id");
  if (denial.tenant.id === scope.tenant.id || denial.company.id === scope.company.id || physicalLocationIds.includes(denial.location.id)) fail("manifest.scope.adjacentDenialControls", "must be distinct from the pilot scope");
  if (denial.company.tenantId !== scope.tenant.id || denial.location.tenantId !== scope.tenant.id || denial.location.companyId !== denial.company.id || denial.location.kind !== "BRANCH") fail("manifest.scope.adjacentDenialControls", "must contain an adjacent tenant plus a coherent same-tenant adjacent company and location");

  const catalog = manifest.inventoryCatalog;
  exactObject(catalog, ["category", "conversions", "selectedItems", "supplierItems", "suppliers", "unitsOfMeasure"], "manifest.inventoryCatalog");
  if (!Array.isArray(catalog.suppliers) || catalog.suppliers.length === 0) fail("manifest.inventoryCatalog.suppliers", "must be nonempty"); requireUniqueIds(catalog.suppliers, "manifest.inventoryCatalog.suppliers");
  catalog.suppliers.forEach((value, index) => scoped(value, [], `manifest.inventoryCatalog.suppliers[${index}]`, scope));
  scoped(catalog.category, [], "manifest.inventoryCatalog.category", scope);
  if (!Array.isArray(catalog.unitsOfMeasure) || catalog.unitsOfMeasure.length !== 2) fail("manifest.inventoryCatalog.unitsOfMeasure", "must contain base and purchase UOMs"); requireUniqueIds(catalog.unitsOfMeasure, "manifest.inventoryCatalog.unitsOfMeasure");
  catalog.unitsOfMeasure.forEach((value, index) => scoped(value, ["kind"], `manifest.inventoryCatalog.unitsOfMeasure[${index}]`, scope));
  exactSet(catalog.unitsOfMeasure.map(({ kind }) => kind), ["BASE", "PURCHASE"], "manifest.inventoryCatalog.unitsOfMeasure.kind");
  const baseUom = catalog.unitsOfMeasure.find(({ kind }) => kind === "BASE").id;
  const purchaseUom = catalog.unitsOfMeasure.find(({ kind }) => kind === "PURCHASE").id;
  if (!Array.isArray(catalog.selectedItems) || catalog.selectedItems.length === 0 || catalog.selectedItems.length > 5) fail("manifest.inventoryCatalog.selectedItems", "must be nonempty and remain within SYNTHETIC_TEST_RESOURCE_BOUND_5"); requireUniqueIds(catalog.selectedItems, "manifest.inventoryCatalog.selectedItems");
  catalog.selectedItems.forEach((value, index) => { scoped(value, ["baseUomId", "categoryId"], `manifest.inventoryCatalog.selectedItems[${index}]`, scope); if (value.categoryId !== catalog.category.id || value.baseUomId !== baseUom) fail(`manifest.inventoryCatalog.selectedItems[${index}]`, "must reference the fixture category and base UOM"); });
  if (!Array.isArray(catalog.conversions) || catalog.conversions.length !== catalog.selectedItems.length) fail("manifest.inventoryCatalog.conversions", "must bind every selected item to one item-specific conversion"); requireUniqueIds(catalog.conversions, "manifest.inventoryCatalog.conversions");
  const itemIds = new Set(catalog.selectedItems.map(({ id: value }) => value));
  catalog.conversions.forEach((value, index) => { scoped(value, ["baseUomId", "itemId", "purchaseUomId"], `manifest.inventoryCatalog.conversions[${index}]`, scope); if (!itemIds.has(value.itemId) || value.baseUomId !== baseUom || value.purchaseUomId !== purchaseUom) fail(`manifest.inventoryCatalog.conversions[${index}]`, "must link one selected item and the exact base and purchase UOMs"); });
  exactSet(catalog.conversions.map(({ itemId }) => itemId), [...itemIds].sort(asciiCompare), "manifest.inventoryCatalog.conversions.itemId");
  if (!Array.isArray(catalog.supplierItems) || catalog.supplierItems.length !== catalog.selectedItems.length) fail("manifest.inventoryCatalog.supplierItems", "must bind every selected item exactly once"); requireUniqueIds(catalog.supplierItems, "manifest.inventoryCatalog.supplierItems");
  const supplierIds = new Set(catalog.suppliers.map(({ id: value }) => value)); const conversionByItem = new Map(catalog.conversions.map((value) => [value.itemId, value.id]));
  catalog.supplierItems.forEach((value, index) => { scoped(value, ["conversionId", "itemId", "purchaseUomId", "supplierId"], `manifest.inventoryCatalog.supplierItems[${index}]`, scope); if (!supplierIds.has(value.supplierId) || !itemIds.has(value.itemId) || value.purchaseUomId !== purchaseUom || value.conversionId !== conversionByItem.get(value.itemId)) fail(`manifest.inventoryCatalog.supplierItems[${index}]`, "contains an unknown or non-item-specific supplier/item/UOM/conversion reference"); });
  exactSet(catalog.supplierItems.map(({ itemId }) => itemId), [...itemIds].sort(asciiCompare), "manifest.inventoryCatalog.supplierItems.itemId");

  const access = manifest.accessGraph;
  exactObject(access, ["actors", "roles"], "manifest.accessGraph");
  if (!Array.isArray(access.roles)) fail("manifest.accessGraph.roles", "must be an array"); requireUniqueIds(access.roles, "manifest.accessGraph.roles");
  exactSet(access.roles.map(({ id: value }) => value), Object.keys(ROLE_PERMISSIONS).sort(asciiCompare), "manifest.accessGraph.roles.id");
  access.roles.forEach((role, index) => { exactObject(role, ["id", "permissionAllowlist"], `manifest.accessGraph.roles[${index}]`); exactSet(role.permissionAllowlist, ROLE_PERMISSIONS[role.id], `manifest.accessGraph.roles[${index}].permissionAllowlist`); });
  if (!Array.isArray(access.actors)) fail("manifest.accessGraph.actors", "must be an array"); requireUniqueIds(access.actors, "manifest.accessGraph.actors");
  exactSet(access.actors.map(({ id: value }) => value), Object.keys(ACTOR_ROLES).sort(asciiCompare), "manifest.accessGraph.actors.id");
  const roleIds = new Set(access.roles.map(({ id: value }) => value)); const pilotLocationIds = new Set(physicalLocationIds);
  const warehouseLocationIds = scope.physicalLocations.filter(({ kind }) => kind === "MAIN_WAREHOUSE").map(({ id: value }) => value);
  const branchLocationIds = scope.physicalLocations.filter(({ kind }) => kind === "BRANCH").map(({ id: value }) => value).sort(asciiCompare);
  for (const [index, actor] of access.actors.entries()) {
    const path = `manifest.accessGraph.actors[${index}]`; exactObject(actor, ["companyIds", "id", "locationIds", "roleIds"], path);
    unique(actor.roleIds, `${path}.roleIds`); unique(actor.companyIds, `${path}.companyIds`); unique(actor.locationIds, `${path}.locationIds`);
    if (actor.id === "synthetic-actor-out-of-scope") {
      exactSet(actor.companyIds, [denial.company.id], `${path}.companyIds`); exactSet(actor.locationIds, [denial.location.id], `${path}.locationIds`);
    } else {
      exactSet(actor.companyIds, [scope.company.id], `${path}.companyIds`);
      if (actor.locationIds.some((value) => !pilotLocationIds.has(value))) fail(`${path}.locationIds`, "contains an out-of-scope location");
      const expectedLocations = actor.id === "synthetic-actor-transfer-dispatcher"
        ? warehouseLocationIds
        : ["synthetic-actor-transfer-receiver", "synthetic-actor-count-performer"].includes(actor.id)
          ? branchLocationIds
          : actor.id === "synthetic-actor-no-role"
            ? [branchLocationIds[0]]
            : physicalLocationIds.sort(asciiCompare);
      exactSet(actor.locationIds, expectedLocations, `${path}.locationIds`);
    }
    exactSet(actor.roleIds, ACTOR_ROLES[actor.id], `${path}.roleIds`);
    if (actor.roleIds.some((value) => !roleIds.has(value))) fail(`${path}.roleIds`, "contains an unknown role");
  }
  const actorIds = new Set(access.actors.map(({ id: value }) => value));
  for (const requiredActor of ["synthetic-actor-read-only-auditor", "synthetic-actor-no-role", "synthetic-actor-out-of-scope"]) if (!actorIds.has(requiredActor)) fail("manifest.accessGraph.actors", `must contain ${requiredActor}`);

  const approvals = manifest.approvalExpectations;
  exactObject(approvals, ["familyDutyMappings", "missingConceptualFamilies", "persistedKeys"], "manifest.approvalExpectations");
  exactSet(approvals.persistedKeys, PERSISTED_APPROVAL_KEYS, "manifest.approvalExpectations.persistedKeys");
  if (!Array.isArray(approvals.missingConceptualFamilies)) fail("manifest.approvalExpectations.missingConceptualFamilies", "must be an array");
  const missingNames = approvals.missingConceptualFamilies.map((entry, index) => { exactObject(entry, ["conceptualFamily", "persistedKey"], `manifest.approvalExpectations.missingConceptualFamilies[${index}]`); if (entry.persistedKey !== null) fail(`manifest.approvalExpectations.missingConceptualFamilies[${index}].persistedKey`, "must be null because this is not a persisted key"); return entry.conceptualFamily; });
  exactSet(missingNames, MISSING_CONCEPTUAL_FAMILIES, "manifest.approvalExpectations.missingConceptualFamilies");
  if (!Array.isArray(approvals.familyDutyMappings) || approvals.familyDutyMappings.length !== PERSISTED_APPROVAL_KEYS.length) fail("manifest.approvalExpectations.familyDutyMappings", "must map every persisted family exactly once");
  exactSet(approvals.familyDutyMappings.map(({ persistedKey }) => persistedKey), PERSISTED_APPROVAL_KEYS, "manifest.approvalExpectations.familyDutyMappings.persistedKey");
  approvals.familyDutyMappings.forEach((mapping, index) => {
    const path = `manifest.approvalExpectations.familyDutyMappings[${index}]`; exactObject(mapping, ["approverActorId", "persistedKey", "posterActorId", "prohibitedOverlaps", "requesterActorId"], path);
    exactSet(mapping.prohibitedOverlaps, PROHIBITED_OVERLAPS, `${path}.prohibitedOverlaps`);
    for (const key of ["requesterActorId", "approverActorId", "posterActorId"]) if (!actorIds.has(mapping[key])) fail(`${path}.${key}`, "must reference a manifest actor");
    if (new Set([mapping.requesterActorId, mapping.approverActorId, mapping.posterActorId]).size !== 3) fail(path, "requester, approver, and poster must be distinct");
    const expectedDuties = FAMILY_DUTIES[mapping.persistedKey];
    for (const key of ["requesterActorId", "approverActorId", "posterActorId"]) if (mapping[key] !== expectedDuties[key]) fail(`${path}.${key}`, `must be ${expectedDuties[key]} for ${mapping.persistedKey}`);
  });
  return manifest;
}

export function canonicalizeSyntheticPilotManifest(manifest) {
  validateSyntheticPilotManifest(manifest);
  const value = structuredClone(manifest);
  value.scope.physicalLocations = sortById(value.scope.physicalLocations);
  value.scope.inventoryLocations = sortById(value.scope.inventoryLocations);
  for (const key of ["suppliers", "unitsOfMeasure", "selectedItems", "conversions", "supplierItems"]) value.inventoryCatalog[key] = sortById(value.inventoryCatalog[key]);
  value.accessGraph.roles = sortById(value.accessGraph.roles).map((role) => ({ ...role, permissionAllowlist: [...role.permissionAllowlist].sort(asciiCompare) }));
  value.accessGraph.actors = sortById(value.accessGraph.actors).map((actor) => ({ ...actor, roleIds: [...actor.roleIds].sort(asciiCompare), companyIds: [...actor.companyIds].sort(asciiCompare), locationIds: [...actor.locationIds].sort(asciiCompare) }));
  value.approvalExpectations.persistedKeys.sort(asciiCompare);
  value.approvalExpectations.missingConceptualFamilies.sort((left, right) => asciiCompare(left.conceptualFamily, right.conceptualFamily));
  value.approvalExpectations.familyDutyMappings.sort((left, right) => asciiCompare(left.persistedKey, right.persistedKey));
  value.approvalExpectations.familyDutyMappings.forEach((mapping) => mapping.prohibitedOverlaps.sort(asciiCompare));
  return stableJson(value);
}
export function digestSyntheticPilotManifest(manifest) { return createHash("sha256").update(canonicalizeSyntheticPilotManifest(manifest), "utf8").digest("hex"); }
export function deriveSyntheticPilotUuid(logicalId) {
  id(logicalId, "logicalId");
  const hex = createHash("sha256").update(`DEC-0259:${logicalId}`, "utf8").digest("hex").slice(0, 32).split("");
  // RFC 9562 version 8 identifies this as an application-defined SHA-256
  // derivation rather than incorrectly presenting it as namespace UUIDv5.
  hex[12] = "8";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
export function verifySyntheticPilotManifestEnvelope(envelope) {
  exactObject(envelope, ["digest", "manifest"], "envelope");
  if (typeof envelope.digest !== "string" || !/^[a-f0-9]{64}$/.test(envelope.digest)) fail("envelope.digest", "must be a lowercase SHA-256 digest");
  const canonical = canonicalizeSyntheticPilotManifest(envelope.manifest); const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  if (digest !== envelope.digest) fail("envelope.digest", "does not match the canonical manifest");
  return { canonical, digest };
}
