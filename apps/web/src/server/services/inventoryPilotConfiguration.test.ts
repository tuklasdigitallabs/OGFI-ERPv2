import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  canonicalInventoryPilotConfigurationJson,
  inventoryPilotActorCoversOpeningEndpoints,
  inventoryPilotConfigurationReadinessFamilies,
  inventoryPilotConfigurationResponsibilities,
  inventoryPilotConfigurationStableErrors,
  isInventoryPilotSealActorSeparated,
} from "./inventoryPilotConfiguration";
import { hasExactInventoryPilotV2OpeningEvidence } from "./openingInventoryCutovers";

const serviceSource = readFileSync(join(process.cwd(), "src/server/services/inventoryPilotConfiguration.ts"), "utf8");
const openingSource = readFileSync(join(process.cwd(), "src/server/services/openingInventoryCutovers.ts"), "utf8");

describe("DEC-0273 inventory pilot configuration", () => {
  test("canonicalizes equal normalized evidence deterministically", () => {
    const left = canonicalInventoryPilotConfigurationJson({ z: ["b", "a"], a: { y: 2, x: 1 } });
    const right = canonicalInventoryPilotConfigurationJson({ a: { x: 1, y: 2 }, z: ["b", "a"] });
    expect(left).toBe(right);
    expect(createHash("sha256").update(left).digest("hex")).toHaveLength(64);
  });

  test("requires the five distinct actor responsibilities and exact eight readiness families", () => {
    expect(inventoryPilotConfigurationResponsibilities).toEqual([
      "PREPARER", "SUBMITTER", "OPERATIONS_REVIEWER", "ACCOUNTING_REVIEWER", "COMMAND_REQUESTER",
    ]);
    expect(inventoryPilotConfigurationReadinessFamilies).toEqual([
      "PurchaseRequest", "QuotationRecommendation", "PurchaseOrder", "InventoryTransfer",
      "StockCountAttemptReview", "WastageReport", "StockAdjustment", "OpeningInventoryCutover",
    ]);
    expect(serviceSource).toContain("PARTICIPANTS_MUST_BE_DISTINCT");
    expect(serviceSource).toContain("ROUTE_LIVE_ACTOR_MISSING");
    expect(serviceSource).toContain("openingTwoStepContract");
    expect(serviceSource).toContain("openingHasDistinctActors");
    expect(serviceSource).toContain("ROUTE_NOT_AUTHORITATIVE");
    expect(serviceSource).toContain('step.approverType === "ROLE"');
    expect(serviceSource).toContain("!step.userId");
  });

  test("requires exact Company MANAGE, live permission, and an active server session", () => {
    expect(serviceSource).toContain('scopeType: "COMPANY"');
    expect(serviceSource).toContain('accessLevel: "MANAGE"');
    expect(serviceSource).toContain("session.authentication?.sessionId");
    expect(serviceSource).toContain("privilegeEpochAtIssue: actor.privilegeEpoch");
    expect(serviceSource).toContain("idleExpiresAt: { gt: now }");
    expect(serviceSource).toContain("absoluteExpiresAt: { gt: now }");
    expect(serviceSource).toContain("permissionCode");
  });

  test("requires each actor to cover every opening endpoint at the role-specific access level", () => {
    const endpoints = [
      { locationId: "location-a", brandId: "brand-a" },
      { locationId: "location-b", brandId: "brand-a" },
    ];
    expect(inventoryPilotActorCoversOpeningEndpoints([
      { scopeType: "BRAND", scopeId: "brand-a", accessLevel: "OPERATE" },
    ], endpoints, "PREPARER", "company-a")).toBe(true);
    expect(inventoryPilotActorCoversOpeningEndpoints([
      { scopeType: "LOCATION", scopeId: "location-a", accessLevel: "OPERATE" },
    ], endpoints, "PREPARER", "company-a")).toBe(false);
    expect(inventoryPilotActorCoversOpeningEndpoints([
      { scopeType: "COMPANY", scopeId: "company-a", accessLevel: "OPERATE" },
    ], endpoints, "OPERATIONS_REVIEWER", "company-a")).toBe(false);
    expect(inventoryPilotActorCoversOpeningEndpoints([
      { scopeType: "COMPANY", scopeId: "company-a", accessLevel: "APPROVE" },
    ], endpoints, "COMMAND_REQUESTER", "company-a")).toBe(true);
  });

  test("blocks both the creator and last editor from sealing", () => {
    const draft = { createdByUserId: "creator", lastEditedByUserId: "editor" };
    expect(isInventoryPilotSealActorSeparated(draft, "creator")).toBe(false);
    expect(isInventoryPilotSealActorSeparated(draft, "editor")).toBe(false);
    expect(isInventoryPilotSealActorSeparated(draft, "independent-sealer")).toBe(true);
    expect(inventoryPilotConfigurationStableErrors.editorCannotSeal).toBe("INVENTORY_PILOT_CONFIGURATION_EDITOR_CANNOT_SEAL");
  });

  test("seals atomically and idempotently without activation or stock writers", () => {
    expect(serviceSource).toContain('isolationLevel: "Serializable"');
    expect(serviceSource).toContain("pg_advisory_xact_lock");
    expect(serviceSource).toContain("inventoryPilotConfigurationSealOperation.findFirst");
    expect(serviceSource).toContain("replay.requestHash !== requestHash");
    expect(serviceSource).toContain("inventory_pilot_configuration.revision_sealed");
    expect(serviceSource).toContain("inventory_pilot_configuration.seal_denied");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("inventoryBalance.update");
    expect(serviceSource).not.toContain("inventoryPilotFamilyActivation.create");
  });

  test("recognizes only digest-valid, complete, non-superseded v2 Opening evidence", () => {
    const canonicalJson = '{"schemaVersion":2}';
    const revision = {
      schemaVersion: 2,
      canonicalJson,
      configurationDigest: createHash("sha256").update(canonicalJson).digest("hex"),
      successorRevision: null,
      endpointMemberships: [{ capability: "OPENING_STOCK_LOCATION", inventoryLocationId: "inventory-a", locationId: "location-a" }],
      itemMemberships: [{ itemId: "item-a" }],
      participantMemberships: inventoryPilotConfigurationResponsibilities.map((responsibility, index) => ({ responsibility, userId: `user-${index}` })),
      routeReadinessMemberships: inventoryPilotConfigurationReadinessFamilies.map((family) => {
        const ruleDefinitionCanonicalJson = `{"family":"${family}"}`;
        const resolverEvidenceCanonicalJson = family === "PurchaseRequest" ? '{"resolverId":"purchase_request_approval_rule_v1"}' : null;
        return { family, ruleDefinitionCanonicalJson, ruleDefinitionDigest: createHash("sha256").update(ruleDefinitionCanonicalJson).digest("hex"), resolverEvidenceCanonicalJson, resolverEvidenceDigest: resolverEvidenceCanonicalJson ? createHash("sha256").update(resolverEvidenceCanonicalJson).digest("hex") : null };
      }),
    };
    expect(hasExactInventoryPilotV2OpeningEvidence(revision)).toBe(true);
    expect(hasExactInventoryPilotV2OpeningEvidence({ ...revision, schemaVersion: 1 })).toBe(false);
    expect(hasExactInventoryPilotV2OpeningEvidence({ ...revision, successorRevision: { id: "successor" } })).toBe(false);
    expect(hasExactInventoryPilotV2OpeningEvidence({ ...revision, routeReadinessMemberships: revision.routeReadinessMemberships.slice(1) })).toBe(false);
    expect(hasExactInventoryPilotV2OpeningEvidence({ ...revision, routeReadinessMemberships: revision.routeReadinessMemberships.map((row) => row.family === "PurchaseRequest" ? { ...row, resolverEvidenceDigest: null } : row) })).toBe(false);
    expect(hasExactInventoryPilotV2OpeningEvidence({ ...revision, participantMemberships: revision.participantMemberships.map((row) => ({ ...row, userId: "same-user" })) })).toBe(false);
  });

  test("new Opening selection and create share the latest live-ready v2 leaf gate", () => {
    expect(openingSource).toContain("evaluateLatestOpeningInventoryRevision");
    expect(openingSource).toContain("getInventoryPilotRevisionOpeningReadiness");
    expect(openingSource).toContain("inventory-pilot-configuration:");
    expect(serviceSource).toContain("input.revisionId ? null");
    expect(openingSource).toContain(
      "eligibility.revision.id !== input.configurationRevisionId",
    );
    expect(openingSource).toContain('schemaVersion: 2');
    expect(openingSource).toContain('successorRevision: { is: null }');
    expect(openingSource).toContain('configurationRevision.status !== "SEALED"');
  });
});
