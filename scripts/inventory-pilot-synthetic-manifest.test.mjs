import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import { extractApprovalRuleCatalogTransactionTypes, findForbiddenSyntheticManifestImports } from "./inventory-pilot-synthetic-boundary.mjs";
import { canonicalizeSyntheticPilotManifest, deriveSyntheticPilotUuid, digestSyntheticPilotManifest, validateSyntheticPilotManifest, verifySyntheticPilotManifestEnvelope } from "./inventory-pilot-synthetic-manifest.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/inventory-pilot.synthetic.local-only.json", import.meta.url), "utf8"));
const copy = (value = fixture) => structuredClone(value);
const GOLDEN_DIGEST = "920b4503fcb64db6481e61bc1d1676b2b61fea43fe1dec558c2ce3a3b93342ec";
const GOLDEN_CANONICAL_DEFLATE_BASE64 = "7Vpbj9o6EP4vfg5ou1IfDm/ZkJ5F3SUtl1arI4SMM4DbxE5thy2q+O+VcyPkRoDd7h5t38Aez3zzeTwz2PxCmBCQ8l+BgzXq/UKYKC4k6v33CxHuB5htB67+iuSWqTUoSjrJeOfq6h2aGYi6qJebjRR0cBAIvgGBDORxghXlrKRnITAj60iNUTV8fTD8iAWseSghtSu4ByWderBD2QaY4mKbh1GQCUJB1lhSttoLzXbGZV4THjLVCUAsufAvdb7RxaKli6HvORPwIwSpXnzv9jgudo7xSHlLhw7wNdp2gVHstYLAQ9Xhy44kPGjEkahM548TJgC7Hc68bQeHLlX8CegK+CvY/gxE/cFNRC73d6/yZYO/EsjF7pUj5CV8e4Y4VQIzuQTRcakMsCLr5m07AWyV5qeDK4AA3TxrfSjbmu2SBXFxLyCsLCoGCkD4VErKmel5/NGjUmlj2SntSsXJ93m0sAssPjfVszJc+FTFLFYZryzaLe1j91solQ9MdZPFtTAEbCg8Hkw/YqnwCrKlLSBmyekowJh/ylZdvaYCVg57SSJFFk20gJXPXqdTRwRgBc0Qk12sY7dWxQkRUkVAhd506lhcVTV6tezshbvJR5hz4YLIxVWVTEJ8tdSPkKsW0VUubGfApFKG7Wy0iJUGNnxgbg0XsQTxeMSLjymjbNUsm+5uvUgWG03sN+pJhao0xTvkY4ZXDeRV1dGjp2yBPcwIdEtZxwN3BaI8vk8YpanSaayRiI9TaTKtCd3aDJhM1G9DJFBLUHU9PkpRhitd1sJCroS2158s0qVwZ6D4QGLP/hkAUVEVlvoX8BL71Nv2Q7W9x0FA2SoumGnyMHUtHxz5zRuAkFQqcD/CFvXQp+nIujXH9nxkf57a44mWiI54vbJ9ChB8TRdUgetsQHg4iMp9aquXyWXnuZfDsR9Me+XcWIPxqjSh9+QiEpJQcnQk/WXA1ClUn+K/VNzEOdLyuAwFvEk+Poc8TkEjINzXoRF9e5NcjHURM7Mq99o5qGq/n4QCS5fxL1hQfTjeNh9f4wZlBAEX/08CZgaKuhS2sjgjEKgQex90p0EhvW0/GNZeO6P+YGiOHubjiWN9nFvOdDgpccNCz4tvJkrrJyNzOP5gj/JtR3nt7HA0IqiiYSmW79pi1pza6xNd+dgfOQWHQRG1dKFac0FV5Lw9nsyd4d0DMhDxsJR0SeO7Ft3k6VaTS7zwAPWUCMFAS/pThQIcpqmLh/TljJcfYJyZiQmsdCeZjGcREA/sDARsQwVnEdIe6g/Gn5yxeXNnz+8cy7zLN98WVtjjKw2KYAUrLrbR5/Si6SDA8tdMpVumdHkyq4BhpgoK4sFIYmfomNnorY85WWAJU+4XVoTc7+iZROs5uDIryXz6o6LaWDrb3g0JHhAF7kCBHx+mdq4kfA0aaTzDYarAb43+lYC9bgN2ZiAZBoFHQey5bmNzHwKDI7FRQJeay3OqPw5qGT8puDJvaqy238Q/ysJ1IwvXT8/CqdHRPjLoH2GeXuxZyKiSzvIecFTIznSvcKi/U6bnb8yx/XzOVmx4Yjet8q0o2OneR/JQELjhIXOju5JC5kXjh+Hk1p4MrHlUfkf22JmOLHt+40yH/fn7KFmTNfj4S1p23ukR/Saq/3vgfsMEmOpHb6AWZ0pwT+aqof5Y8K7iCbbGm0TysHSk7y/1JbfSQDWIg0fb/e6OzKF1exKq+Fu9t3npnYH0o5B7ZtMQrT2lY6jbiBY7cKgq64DuEtqS0q0BDepBnulj9pbWaleKFfoZMV1fikk38WdBOHwPzVDcm4Ph/Ks5sm+dacvc0BCxhVCNE0gfCM3KYN+2OlfX7/9Bu98=";
const GOLDEN_CANONICAL_V2_DEFLATE_BASE64 = "7VpZj9o6FP4vfgbUIvXh8pYJaScqQ1qWVqNqFHmcA7hN7NR2mKIR/71yNgJZCMu0vWrfBvvY5zufzxZ7nhEmBKR8J3C4QoNnhIniQqLBl2dEeBBitrE9/RPJDVMrUJR00/Huq1ev0UMHUQ8NCrPxBl0choKvQaAO8jnBinJW2udRYEZW8TadquH+3vATFrDikYRMr+A+lPbUg13K1sAUF5sijAOZMBJkhSVly53Qw7ZzmdWER0x1QxALLoJLjW808VDTxdB3nAn4HoFUv/3sdjguNo7xePOWBu3ha9TtAaPYbwWBR6rLF11JeNiII90ymz9OmADsdTnzN10ceVTxK9AV8j/g+HMQ9YGbilxu727L3+v8lUAuNq/sIb/DthfwUyUwkwsQXY/KECuyaj62E8BW7Xw9uAII0PWL1oeyrodtuiAp7gcIK4tKB4UgAiol5czwff7kU6m0sjxKe1Jx8s2NF/aAJXFTPSujx4CqhMUq5ZVFu6V+7H2NpAqAqV66uBaGgDWFp73pJywVXkK+tAXEPDkdBZjwT9myp9dUwCpgL0lkyOKJFrCK2et06ogArKAZYnqKdezWbnGCh1QRULFvNnXMr6oavVp2dsK99E9wufBAFPyqSiYlvlrqe8RVC+8qF7YzYFIpo3Y6WvhKAxsBMK+Gi0SC+DzmJcCUUbZsls1Ot14k940m9hv3yYSqdkpOKMAMLxvIq6qjR6PsEfuYEeiVso4P3hJEeXyXMEpTpWiskUjCqTSZ1YRebQZMJ+qPIRaoJai6Hh+lKMeVLWuhoVBC2++fLtKlcNtBSUBi3/oRAlFxFZb6C3iBA+pvhpHa3OEwpGyZFMwseRi6lttHvnlDEJJKBd572KAB+jCfmLfG1HIn1se5NZ1piTjE6zfbpQDBV/SRKvCcNQgfh3G5z3QNcrk8ngcFHLvBrFcujDUor0oT+kwuIiF1JUd70j8GDJ1CdRT/o+ImyZGmz2Uk4K/k42PEkxQ0AcID7Rrxr7+Si6kuYkZe5f50Dqra76tQYOoy/gkLqoPj7+bjc9KgTCDk4v9JwEMHxV0KW5qcEQhVhP23utOgkN227w1rq53J0B4bk3t3OnPM967pzMezEjcs8v3kZqK0fjYxxtO31qTYdpTXPuyPxgRVNCyH5bu2mDWn9vpEVw77I1Gw7xRxSxepFRdUxcZb05nrjEf3qIOIj6WkC5rctegmT7eaXOJHH9BAiQg6aEF/qEiAwzR1yZC+nPGLA4wzI1WBle4k0/HcA5KBbQcBW1PBWYx0gIb29IMzNW5GljtyTGNUbL5NrLDPlxoUwQqWXGziv7OLpj0HK14zlW6ZsuXprAKGmTrYIBmMJbYd7TNrffRx5/vlGT1iCXMeHKyJeNDVM+m+5yDL9WTzCg616KF0NvvoqIaSzbY28xfZ1W+0q391ux46SIIPRIFnKwhOOcHUUexG/zmDj8IZXu9YXhhsvy3XURj6FMSO6zY6dx5iHwuJ/flMXZHTK0ZNbk2N1vaHeD0W+sdZuHKMHWfhVO9o7xn0lzBPL7YsYlRJZ3EHOK7gZ5p3ENTfKNPzN8bUejljKw481Zu1N60o2OqmT/JIELjhEfPiSyLqAVN0QUGYnCmBSVzmrZk1ubPH9nRmm+7IeWebxsi1h+7Mcedze4hKGRtN78ezW0uLx/3KxJo684lpuTfOfDx03+giLckKAvwpCRM0eK1H9COy/mcN7ysmwNQwfjSOkXBfFtqHBOqebRVv1q16heylqr45qdy5Wvve8/bOHSbG2LxtByf5VW9fUXrbQfrdzDuzr4rXntJU1VF/Mud5kzhK+To7vey+SXLq914Yd++QJdNzmRcK0yZo/RbQ+r8U2v4jci26Q7E2mTZcbSQl2N8/7Nj77HqPPNOh81M9PfZeFlP/Ukz6o/YsCIdnlqK4M+yx+9mYWLfOvGXJaEhPB3kpqStDIDTvjoaW2X3Vf/Mf2v4E";

test("accepts the exact synthetic fixture and its committed canonical digest", () => {
  const evidence = verifySyntheticPilotManifestEnvelope(fixture);
  assert.equal(evidence.digest, fixture.digest);
  const committedCanonical = inflateRawSync(Buffer.from(GOLDEN_CANONICAL_V2_DEFLATE_BASE64, "base64")).toString("utf8");
  assert.equal(evidence.canonical, committedCanonical);
  assert.equal(evidence.canonical.length, 10141);
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
  const promoted = copy(fixture.manifest); promoted.approvalExpectations.missingConceptualFamilies[0].persistedKey = "TRANSFER_REQUEST";
  assert.throws(() => validateSyntheticPilotManifest(promoted), /must be null/);
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

test("logical fixture identifiers derive stable RFC-compatible UUIDs", () => {
  assert.equal(deriveSyntheticPilotUuid("synthetic-tenant-001"), "f5273e87-5d7a-5a12-806a-daa292b16b28");
  assert.match(deriveSyntheticPilotUuid("synthetic-company-001"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(deriveSyntheticPilotUuid("synthetic-company-001"), deriveSyntheticPilotUuid("synthetic-company-002"));
  assert.throws(() => deriveSyntheticPilotUuid("real-company"), /stable synthetic/);
});
