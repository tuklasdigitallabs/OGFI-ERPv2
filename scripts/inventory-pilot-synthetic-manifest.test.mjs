import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import { assertSafeSyntheticFixtureDatabaseName, extractApprovalRuleCatalogTransactionTypes, findForbiddenSyntheticManifestImports } from "./inventory-pilot-synthetic-boundary.mjs";
import { canonicalizeSyntheticPilotManifest, deriveSyntheticPilotUuid, digestSyntheticPilotManifest, validateSyntheticPilotManifest, verifySyntheticPilotManifestEnvelope } from "./inventory-pilot-synthetic-manifest.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/inventory-pilot.synthetic.local-only.json", import.meta.url), "utf8"));
const copy = (value = fixture) => structuredClone(value);
const GOLDEN_DIGEST = "35481b72a1a48708319f03b8aa0e71f0ae7c4ef549318c580c3ff346aa127d20";
const GOLDEN_CANONICAL_DEFLATE_BASE64 = "7Vpbj9o6EP4vfg5ou1IfDm/ZkJ5F3SUtl1arI4SMM4DbxE5thy2q+O+VcyPkRoDd7h5t38Aez3zzeTwz2PxCmBCQ8l+BgzXq/UKYKC4k6v33CxHuB5htB67+iuSWqTUoSjrJeOfq6h2aGYi6qJebjRR0cBAIvgGBDORxghXlrKRnITAj60iNUTV8fTD8iAWseSghtSu4ByWderBD2QaY4mKbh1GQCUJB1lhSttoLzXbGZV4THjLVCUAsufAvdb7RxaKli6HvORPwIwSpXnzv9jgudo7xSHlLhw7wNdp2gVHstYLAQ9Xhy44kPGjEkahM548TJgC7Hc68bQeHLlX8CegK+CvY/gxE/cFNRC73d6/yZYO/EsjF7pUj5CV8e4Y4VQIzuQTRcakMsCLr5m07AWyV5qeDK4AA3TxrfSjbmu2SBXFxLyCsLCoGCkD4VErKmel5/NGjUmlj2SntSsXJ93m0sAssPjfVszJc+FTFLFYZryzaLe1j91solQ9MdZPFtTAEbCg8Hkw/YqnwCrKlLSBmyekowJh/ylZdvaYCVg57SSJFFk20gJXPXqdTRwRgBc0Qk12sY7dWxQkRUkVAhd506lhcVTV6tezshbvJR5hz4YLIxVWVTEJ8tdSPkKsW0VUubGfApFKG7Wy0iJUGNnxgbg0XsQTxeMSLjymjbNUsm+5uvUgWG03sN+pJhao0xTvkY4ZXDeRV1dGjp2yBPcwIdEtZxwN3BaI8vk8YpanSaayRiI9TaTKtCd3aDJhM1G9DJFBLUHU9PkpRhitd1sJCroS2158s0qVwZ6D4QGLP/hkAUVEVlvoX8BL71Nv2Q7W9x0FA2SoumGnyMHUtHxz5zRuAkFQqcD/CFvXQp+nIujXH9nxkf57a44mWiI54vbJ9ChB8TRdUgetsQHg4iMp9aquXyWXnuZfDsR9Me+XcWIPxqjSh9+QiEpJQcnQk/WXA1ClUn+K/VNzEOdLyuAwFvEk+Poc8TkEjINzXoRF9e5NcjHURM7Mq99o5qGq/n4QCS5fxL1hQfTjeNh9f4wZlBAEX/08CZgaKuhS2sjgjEKgQex90p0EhvW0/GNZeO6P+YGiOHubjiWN9nFvOdDgpccNCz4tvJkrrJyNzOP5gj/JtR3nt7HA0IqiiYSmW79pi1pza6xNd+dgfOQWHQRG1dKFac0FV5Lw9nsyd4d0DMhDxsJR0SeO7Ft3k6VaTS7zwAPWUCMFAS/pThQIcpqmLh/TljJcfYJyZiQmsdCeZjGcREA/sDARsQwVnEdIe6g/Gn5yxeXNnz+8cy7zLN98WVtjjKw2KYAUrLrbR5/Si6SDA8tdMpVumdHkyq4BhpgoK4sFIYmfomNnorY85WWAJU+4XVoTc7+iZROs5uDIryXz6o6LaWDrb3g0JHhAF7kCBHx+mdq4kfA0aaTzDYarAb43+lYC9bgN2ZiAZBoFHQey5bmNzHwKDI7FRQJeay3OqPw5qGT8puDJvaqy238Q/ysJ1IwvXT8/CqdHRPjLoH2GeXuxZyKiSzvIecFTIznSvcKi/U6bnb8yx/XzOVmx4Yjet8q0o2OneR/JQELjhIXOju5JC5kXjh+Hk1p4MrHlUfkf22JmOLHt+40yH/fn7KFmTNfj4S1p23ukR/Saq/3vgfsMEmOpHb6AWZ0pwT+aqof5Y8K7iCbbGm0TysHSk7y/1JbfSQDWIg0fb/e6OzKF1exKq+Fu9t3npnYH0o5B7ZtMQrT2lY6jbiBY7cKgq64DuEtqS0q0BDepBnulj9pbWaleKFfoZMV1fikk38WdBOHwPzVDcm4Ph/Ks5sm+dacvc0BCxhVCNE0gfCM3KYN+2OlfX7/9Bu98=";
const GOLDEN_CANONICAL_V2_DEFLATE_BASE64 = "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";

test("accepts the exact synthetic fixture and its committed canonical digest", () => {
  const evidence = verifySyntheticPilotManifestEnvelope(fixture);
  assert.equal(evidence.digest, fixture.digest);
  const committedCanonical = inflateRawSync(Buffer.from(GOLDEN_CANONICAL_V2_DEFLATE_BASE64, "base64")).toString("utf8");
  assert.equal(evidence.canonical, committedCanonical);
  assert.equal(evidence.canonical.length, 14047);
  assert.equal(evidence.digest, GOLDEN_DIGEST);
});

test("persisted approval keys are derived from and equal the runtime approvalRuleCatalog", () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "apps/web/src/server/services/approvalRuleCatalog.ts"), "utf8");
  const runtimeKeys = extractApprovalRuleCatalogTransactionTypes(source).sort();
  assert.deepEqual([...fixture.manifest.approvalExpectations.persistedKeys].sort(), runtimeKeys);
});

test("synthetic manifest has no runtime, seed, migration, or policy import path", () => {
  assert.deepEqual(findForbiddenSyntheticManifestImports(repositoryRoot), []);
});

test("canonical digest uses locale-independent ordering for every set-like collection", () => {
  const reordered = copy(fixture.manifest);
  reordered.scope.physicalLocations.reverse(); reordered.scope.inventoryLocations.reverse();
  for (const key of ["suppliers", "unitsOfMeasure", "selectedItems", "conversions", "supplierItems"]) reordered.inventoryCatalog[key].reverse();
  reordered.accessGraph.roles.reverse(); reordered.accessGraph.actors.reverse();
  reordered.accessGraph.roles.forEach((role) => role.permissionAllowlist.reverse());
  reordered.approvalExpectations.persistedKeys.reverse();
  reordered.approvalExpectations.missingConceptualFamilies.reverse();
  reordered.approvalExpectations.familyDutyMappings.reverse();
  reordered.approvalExpectations.familyDutyMappings.forEach((mapping) => mapping.executionActorIds.reverse());
  reordered.approvalExpectations.routePlans.reverse();
  assert.equal(digestSyntheticPilotManifest(reordered), fixture.digest);
});

test("rejects digest and manifest tampering", () => {
  const badDigest = copy(); badDigest.digest = "0".repeat(64);
  assert.throws(() => verifySyntheticPilotManifestEnvelope(badDigest), /does not match/);
  const changed = copy(); changed.manifest.inventoryCatalog.selectedItems[0].id = "synthetic-item-tampered";
  assert.throws(() => verifySyntheticPilotManifestEnvelope(changed), /does not match|must link one selected item/);
});

test("rejects absent or false fixture authority markers", () => {
  for (const key of ["authority", "environment", "sourceDecisionId"]) {
    const missing = copy(fixture.manifest); delete missing[key];
    assert.throws(() => validateSyntheticPilotManifest(missing), /must contain exactly/);
  }
  const wrong = copy(fixture.manifest); wrong.authority = "RUNTIME";
  assert.throws(() => validateSyntheticPilotManifest(wrong), /authority markers/);
  const falseAttestation = copy(fixture.manifest); falseAttestation.classification.nonAuthoritative = false;
  assert.throws(() => validateSyntheticPilotManifest(falseAttestation), /must be true/);
});

test("rejects tenant, company, location, and catalog cross-scope references", () => {
  const company = copy(fixture.manifest); company.inventoryCatalog.selectedItems[0].companyId = "synthetic-denial-company-001";
  assert.throws(() => validateSyntheticPilotManifest(company), /manifest tenant and company/);
  const denialCollapse = copy(fixture.manifest); denialCollapse.scope.adjacentDenialControls.tenant.id = "synthetic-tenant-001";
  assert.throws(() => validateSyntheticPilotManifest(denialCollapse), /distinct from the pilot scope/);
  const location = copy(fixture.manifest); location.accessGraph.actors[0].locationIds.push("synthetic-denial-location-001");
  assert.throws(() => validateSyntheticPilotManifest(location), /out-of-scope location/);
  const supplier = copy(fixture.manifest); supplier.inventoryCatalog.supplierItems[0].supplierId = "synthetic-supplier-999";
  assert.throws(() => validateSyntheticPilotManifest(supplier), /unknown or non-item-specific/);
});

test("rejects duplicate, missing, extra, and incorrectly linked graph members", () => {
  const duplicate = copy(fixture.manifest); duplicate.inventoryCatalog.selectedItems.push(copy(duplicate.inventoryCatalog.selectedItems[0]));
  assert.throws(() => validateSyntheticPilotManifest(duplicate), /duplicates/);
  const missingSupplierItem = copy(fixture.manifest); missingSupplierItem.inventoryCatalog.supplierItems.pop();
  assert.throws(() => validateSyntheticPilotManifest(missingSupplierItem), /every selected item/);
  const extraBranch = copy(fixture.manifest); extraBranch.scope.physicalLocations.push({ id: "synthetic-branch-003", tenantId: "synthetic-tenant-001", companyId: "synthetic-company-001", brandId: "synthetic-brand-001", kind: "BRANCH" });
  assert.throws(() => validateSyntheticPilotManifest(extraBranch), /one warehouse and one or two branches/);
  const wrongUom = copy(fixture.manifest); wrongUom.inventoryCatalog.conversions[0].purchaseUomId = "synthetic-uom-base-001";
  assert.throws(() => validateSyntheticPilotManifest(wrongUom), /exact base and purchase UOMs/);
  const crossItemConversion = copy(fixture.manifest); crossItemConversion.inventoryCatalog.supplierItems[0].conversionId = "synthetic-conversion-002";
  assert.throws(() => validateSyntheticPilotManifest(crossItemConversion), /non-item-specific/);
});

test("rejects permission escalation and malformed denial actors", () => {
  const escalation = copy(fixture.manifest); escalation.accessGraph.roles[0].permissionAllowlist.push("core.administer");
  assert.throws(() => validateSyntheticPilotManifest(escalation), /must contain exactly/);
  const auditorMutation = copy(fixture.manifest);
  const auditorRole = auditorMutation.accessGraph.roles.find(({ id }) => id === "synthetic-role-read-only-auditor"); auditorRole.permissionAllowlist.push("inventory.wastage.post");
  assert.throws(() => validateSyntheticPilotManifest(auditorMutation), /must contain exactly/);
  const noRole = copy(fixture.manifest); noRole.accessGraph.actors.find(({ id }) => id === "synthetic-actor-no-role").roleIds.push("synthetic-role-read-only-auditor");
  assert.throws(() => validateSyntheticPilotManifest(noRole), /must contain exactly/);
  const outOfScope = copy(fixture.manifest); outOfScope.accessGraph.actors.find(({ id }) => id === "synthetic-actor-out-of-scope").companyIds = ["synthetic-company-001"];
  assert.throws(() => validateSyntheticPilotManifest(outOfScope), /must contain exactly/);
  const wrongDutyRole = copy(fixture.manifest); wrongDutyRole.accessGraph.actors.find(({ id }) => id === "synthetic-actor-approver").roleIds = ["synthetic-role-read-only-auditor"];
  assert.throws(() => validateSyntheticPilotManifest(wrongDutyRole), /must contain exactly/);
  const dispatcherAtBranch = copy(fixture.manifest); dispatcherAtBranch.accessGraph.actors.find(({ id }) => id === "synthetic-actor-transfer-dispatcher").locationIds = ["synthetic-branch-001"];
  assert.throws(() => validateSyntheticPilotManifest(dispatcherAtBranch), /must contain exactly/);
});

test("rejects persisted-family drift, conceptual-family promotion, and duty overlap", () => {
  const renamed = copy(fixture.manifest); renamed.approvalExpectations.persistedKeys[0] = "PurchaseRequest";
  assert.throws(() => validateSyntheticPilotManifest(renamed), /must contain exactly/);
  const promoted = copy(fixture.manifest); promoted.approvalExpectations.missingConceptualFamilies.push({ conceptualFamily: "TRANSFER_REQUEST", persistedKey: "InventoryTransfer" });
  assert.throws(() => validateSyntheticPilotManifest(promoted), /must be null|must contain exactly/);
  const oneStepOpening = copy(fixture.manifest); oneStepOpening.approvalExpectations.routePlans.find(({ persistedKey }) => persistedKey === "OpeningInventoryCutover").steps.pop();
  assert.throws(() => validateSyntheticPilotManifest(oneStepOpening), /exact 2-step/);
  const wrongOpeningRole = copy(fixture.manifest); wrongOpeningRole.approvalExpectations.routePlans.find(({ persistedKey }) => persistedKey === "OpeningInventoryCutover").steps[1].roleId = "synthetic-role-inventory-approver";
  assert.throws(() => validateSyntheticPilotManifest(wrongOpeningRole), /closed .* route-plan/);
  const overlap = copy(fixture.manifest); overlap.approvalExpectations.familyDutyMappings[0].approverActorId = overlap.approvalExpectations.familyDutyMappings[0].requesterActorId;
  assert.throws(() => validateSyntheticPilotManifest(overlap), /must be distinct/);
  const wrongFamilyDuty = copy(fixture.manifest); wrongFamilyDuty.approvalExpectations.familyDutyMappings.find(({ persistedKey }) => persistedKey === "WastageReport").requesterActorId = "synthetic-actor-purchasing-requester";
  assert.throws(() => validateSyntheticPilotManifest(wrongFamilyDuty), /must be synthetic-actor-inventory-requester/);
  const omittedProhibition = copy(fixture.manifest); omittedProhibition.approvalExpectations.familyDutyMappings[0].prohibitedOverlaps.pop();
  assert.throws(() => validateSyntheticPilotManifest(omittedProhibition), /must contain exactly/);
});

test("rejects unknown fields, real identities, operational markers, and numeric values", () => {
  const unknown = copy(fixture.manifest); unknown.inventoryCatalog.category.policy = "synthetic-policy-001";
  assert.throws(() => validateSyntheticPilotManifest(unknown), /must contain exactly/);
  const email = copy(fixture.manifest); email.accessGraph.actors[0].id = "person@example.com";
  assert.throws(() => validateSyntheticPilotManifest(email), /real-identity/);
  const authority = copy(fixture.manifest); authority.inventoryCatalog.selectedItems[0].id = "synthetic-approved-item";
  assert.throws(() => validateSyntheticPilotManifest(authority), /operational-authority/);
  const quantity = copy(fixture.manifest); quantity.inventoryCatalog.selectedItems[0].openingQuantity = 1;
  assert.throws(() => validateSyntheticPilotManifest(quantity), /numeric policy/);
});

test("the selected-item cap is explicitly a synthetic test resource bound", () => {
  const unbound = copy(fixture.manifest); unbound.resourceBounds.selectedItems = "PILOT_COHORT_MAX_5";
  assert.throws(() => validateSyntheticPilotManifest(unbound), /synthetic test resource bound/);
  const nonDeterministicIds = copy(fixture.manifest); nonDeterministicIds.resourceBounds.identifierContract = "LOGICAL_IDS_ONLY";
  assert.throws(() => validateSyntheticPilotManifest(nonDeterministicIds), /deterministic logical-ID/);
  const aboveBound = copy(fixture.manifest);
  for (let index = 3; index <= 6; index += 1) aboveBound.inventoryCatalog.selectedItems.push({ id: `synthetic-item-00${index}`, tenantId: "synthetic-tenant-001", companyId: "synthetic-company-001", categoryId: "synthetic-category-001", baseUomId: "synthetic-uom-base-001" });
  assert.throws(() => validateSyntheticPilotManifest(aboveBound), /SYNTHETIC_TEST_RESOURCE_BOUND_5/);
});

test("logical fixture identifiers derive stable application-defined version 8 UUIDs", () => {
  assert.equal(deriveSyntheticPilotUuid("synthetic-tenant-001"), "f5273e87-5d7a-8a12-806a-daa292b16b28");
  assert.match(deriveSyntheticPilotUuid("synthetic-company-001"), /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(deriveSyntheticPilotUuid("synthetic-company-001"), deriveSyntheticPilotUuid("synthetic-company-002"));
  assert.throws(() => deriveSyntheticPilotUuid("real-company"), /stable synthetic/);
});

test("rejects every production-like disposable fixture database name", () => {
  assert.equal(
    assertSafeSyntheticFixtureDatabaseName("ogfi_test_inventory_0123456789abcdef"),
    "ogfi_test_inventory_0123456789abcdef",
  );
  for (const token of ["prod", "production", "live", "shared", "stage", "staging", "pilot", "uat"]) {
    assert.throws(
      () => assertSafeSyntheticFixtureDatabaseName(`ogfi_test_${token}_0123456789abcdef`),
      /DATABASE_NAME_UNSAFE/,
      token,
    );
  }
});
