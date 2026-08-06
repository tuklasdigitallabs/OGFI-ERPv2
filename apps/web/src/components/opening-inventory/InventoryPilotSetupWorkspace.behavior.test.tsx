import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  Activity,
  ActorEditor,
  inventoryPilotSetupHref,
  parsePurchaseRequestResolverEvidence,
  ReadOnlyEndpointSummary,
  ReadOnlyItemSummary,
  ReadOnlyRoutes,
  Readiness,
  Routes,
  type InventoryPilotSetupRecord,
} from "./InventoryPilotSetupWorkspace";
import {
  inventoryPilotPendingSelectionParams,
  parseInventoryPilotPendingSelections,
} from "./InventoryPilotSetupState";

// The application is compiled by Next with the automatic JSX runtime. This
// focused Vitest server-render harness preserves JSX and therefore supplies the
// classic runtime global used by the compiled workspace component.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

const responsibilities = ["PREPARER", "SUBMITTER", "OPERATIONS_REVIEWER", "ACCOUNTING_REVIEWER", "COMMAND_REQUESTER"] as const;
const families = ["PurchaseRequest", "QuotationRecommendation", "PurchaseOrder", "InventoryTransfer", "StockCountAttemptReview", "WastageReport", "StockAdjustment", "OpeningInventoryCutover"] as const;
const uuids = Array.from({ length: 30 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const idleAction = async () => ({ status: "idle" as const });

function purchaseRequestResolverEvidenceJson(approvalRuleId = "rule-default") {
  return JSON.stringify({
    ruleDefinition: { id: approvalRuleId, routeKey: "DEFAULT" },
    resolverInput: {
      resolverId: "purchase_request_approval_rule_v1",
      isEmergency: false,
    },
    resolverOutcome: {
      selectedApprovalRuleId: approvalRuleId,
      requiredRouteKey: "DEFAULT",
      routeType: "normal",
      fallbackUsed: false,
    },
  });
}

function sealedRecord(): InventoryPilotSetupRecord {
  return {
    id: "revision-1",
    label: "Inventory Pilot Revision 1",
    status: "SEALED",
    version: 1,
    revisionNumber: 1,
    predecessorRevisionNumber: null,
    digest: "digest",
    sourceDecisionId: "DEC-0273",
    editorName: "Independent sealer",
    creatorUserId: "creator",
    editorUserId: "editor",
    sealedByName: "Independent sealer",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    sealedAt: "2026-08-01T00:00:00.000Z",
    endpointSelections: [],
    itemIds: [],
    selectedEndpointDetails: Array.from({ length: 12 }, (_, index) => ({
      inventoryLocationId: `endpoint-${index + 1}`,
      locationId: `location-${index + 1}`,
      code: `EP-${index + 1}`,
      name: `Endpoint ${index + 1}`,
      locationName: `Location ${index + 1}`,
      capabilities: ["OPENING_STOCK_LOCATION"],
    })),
    selectedItemDetails: Array.from({ length: 12 }, (_, index) => ({
      id: `item-${index + 1}`,
      code: `ITEM-${index + 1}`,
      name: `Item ${index + 1}`,
      categoryName: "HIGH RISK — High Risk",
      status: "ACTIVE",
    })),
    actorSelections: [],
    routes: [],
    readiness: [],
    activity: [],
  };
}

describe("Inventory Pilot Setup Center behavior", () => {
  it("uses revision identity for every sealed-record subworkspace URL", () => {
    const record = sealedRecord();
    expect(inventoryPilotSetupHref(record, "items", { itemPage: "2" })).toBe(
      "/opening-inventory/setup?revision=revision-1&tab=items&itemPage=2",
    );
    expect(inventoryPilotSetupHref({ ...record, id: "draft-1", status: "DRAFT" }, "actors")).toBe(
      "/opening-inventory/setup?draft=draft-1&tab=actors",
    );
  });

  it("paginates the complete immutable item and endpoint selections", () => {
    const record = sealedRecord();
    const itemHtml = renderToStaticMarkup(<ReadOnlyItemSummary record={record} page={2} pageSize={20} />);
    const endpointHtml = renderToStaticMarkup(<ReadOnlyEndpointSummary record={record} page={2} pageSize={20} />);

    expect(itemHtml).toContain("Item 11");
    expect(itemHtml).toContain("Item 12");
    expect(itemHtml).not.toContain("Item 1</p>");
    expect(itemHtml).toContain("revision=revision-1");
    expect(endpointHtml).toContain("Endpoint 11");
    expect(endpointHtml).toContain("Endpoint 12");
    expect(endpointHtml).not.toContain("Endpoint 1</p>");
    expect(endpointHtml).toContain("revision=revision-1");
  });

  it("renders meaningful linked draft audit context for a sealed revision", () => {
    const record = sealedRecord();
    const html = renderToStaticMarkup(
      <Activity
        entries={[{
          id: "event-1",
          action: "Configuration updated",
          actorName: "Administrator",
          occurredAt: "2026-08-01T00:00:00.000Z",
          detail: "Reason: Correct opening scope · Items: 10 → 12",
          sourceLabel: "Source draft history",
        }]}
        record={record}
        page={1}
        pageSize={20}
        totalItems={1}
      />,
    );

    expect(html).toContain("Source draft history");
    expect(html).toContain("Reason: Correct opening scope");
    expect(html).toContain("Items: 10 → 12");
  });

  it("retains and submits all five actor selections across search/page remounts", () => {
    const record = { ...sealedRecord(), id: uuids[0]!, status: "DRAFT" as const, version: 7 };
    const selected = Object.fromEntries(responsibilities.map((responsibility, index) => [responsibility, `${uuids[index + 1]}|${uuids[index + 8]}`]));
    const generated = inventoryPilotPendingSelectionParams("actor", selected, record.version);
    const remounted = parseInventoryPilotPendingSelections(generated, responsibilities, "actor", record.version);
    const html = renderToStaticMarkup(
      <ActorEditor
        record={record}
        options={[{ id: uuids[1]!, name: "Preparer A", email: "preparer@example.test", roleAssignments: [{ id: uuids[8]!, label: "PREPARER / Preparer", eligibleResponsibilities: ["PREPARER"] }] }]}
        action={idleAction}
        page={2}
        pageSize={10}
        totalItems={24}
        query="preparer"
        activeResponsibility="PREPARER"
        selectionValues={remounted}
      />,
    );

    for (const responsibility of responsibilities) {
      expect(remounted[responsibility]).toBe(selected[responsibility]);
      expect(html).toContain(`name="${responsibility}"`);
      expect(html).toContain(`name="actor_${responsibility}"`);
      expect(html).toContain(selected[responsibility]!);
    }
    expect(html).toContain("selectionVersion=7");
    expect(html).toContain("userPage=3");
    expect(html).toContain("Selected eligible user retained from another result page");
  });

  it("retains and submits all eight route selections across family search/page remounts", () => {
    const record = {
      ...sealedRecord(),
      id: uuids[0]!,
      status: "DRAFT" as const,
      version: 9,
      routes: families.map((family) => ({ family, label: family, approvalRuleId: null, routeLabel: null, ready: false, detail: "Select a rule" })),
    };
    const selected = Object.fromEntries(families.map((family, index) => [family, uuids[index + 1]! ]));
    const generated = inventoryPilotPendingSelectionParams("route", selected, record.version);
    const remounted = parseInventoryPilotPendingSelections(generated, families, "route", record.version);
    const html = renderToStaticMarkup(
      <Routes
        record={record}
        rules={[{ id: uuids[1]!, family: "PurchaseRequest", label: "PR approval / v2", status: "Active and sealed" }]}
        action={idleAction}
        page={2}
        pageSize={8}
        totalItems={18}
        query="PR"
        activeFamily="PurchaseRequest"
        selectionValues={remounted}
      />,
    );

    for (const family of families) {
      expect(remounted[family]).toBe(selected[family]);
      expect(html).toContain(`name="${family}"`);
      expect(html).toContain(`name="route_${family}"`);
      expect(html).toContain(selected[family]!);
    }
    expect(html).toContain("selectionVersion=9");
    expect(html).toContain("rulePage=3");
    expect(html).toContain("Selected eligible rule retained from another result page");
  });

  it("rejects malformed and stale pending-selection URLs before remount", () => {
    const validActor = `${uuids[1]}|${uuids[8]}`;
    expect(parseInventoryPilotPendingSelections({ selectionVersion: "3", actor_PREPARER: "not-an-assignment" }, responsibilities, "actor", 3)).toEqual({});
    expect(parseInventoryPilotPendingSelections({ selectionVersion: "2", actor_PREPARER: validActor }, responsibilities, "actor", 3)).toEqual({});
    expect(parseInventoryPilotPendingSelections({ selectionVersion: "3", route_PurchaseRequest: "stale-rule" }, families, "route", 3)).toEqual({});
  });

  it("accepts only the exact standard Purchase Request resolver evidence contract", () => {
    expect(
      parsePurchaseRequestResolverEvidence(
        purchaseRequestResolverEvidenceJson(),
        "rule-default",
      ),
    ).toEqual({
      status: "retained",
      resolverId: "purchase_request_approval_rule_v1",
      isEmergency: false,
      selectedRouteKey: "DEFAULT",
      routeType: "normal",
      fallbackUsed: false,
    });

    for (const evidence of [
      null,
      "not-json",
      purchaseRequestResolverEvidenceJson("different-rule"),
      purchaseRequestResolverEvidenceJson().replace('"fallbackUsed":false', '"fallbackUsed":true'),
    ]) {
      expect(
        parsePurchaseRequestResolverEvidence(evidence, "rule-default"),
      ).toEqual({ status: "unavailable" });
    }
  });

  it("shows explicit resolver evidence in draft Routes and Readiness plus sealed detail", () => {
    const resolverEvidence = parsePurchaseRequestResolverEvidence(
      purchaseRequestResolverEvidenceJson(),
      "rule-default",
    );
    const purchaseRequestRoute = {
      family: "PurchaseRequest",
      label: "Purchase Request",
      approvalRuleId: "rule-default",
      routeLabel: "DEFAULT / v1",
      ready: true,
      detail: "Bound readiness evidence",
      resolverEvidence,
    };
    const draft = {
      ...sealedRecord(),
      id: "draft-1",
      status: "DRAFT" as const,
      routes: [purchaseRequestRoute],
      readiness: [{
        family: "PurchaseRequest",
        label: "Purchase Request",
        ready: true,
        blockers: [],
        checkedAt: "2026-08-01T00:00:00.000Z",
      }],
    };
    const surfaces = [
      renderToStaticMarkup(
        <Routes
          record={draft}
          rules={[]}
          action={idleAction}
          page={1}
          pageSize={10}
          totalItems={0}
          query=""
          activeFamily="PurchaseRequest"
          selectionValues={{}}
        />,
      ),
      renderToStaticMarkup(
        <Readiness record={draft} action={idleAction} canEdit={false} />,
      ),
      renderToStaticMarkup(
        <ReadOnlyRoutes record={{ ...draft, id: "revision-1", status: "SEALED" }} />,
      ),
    ];

    for (const html of surfaces) {
      expect(html).toContain("Purchase Request resolver evidence");
      expect(html).toContain("purchase_request_approval_rule_v1");
      expect(html).toContain("Emergency request</dt><dd class=\"font-semibold\">false");
      expect(html).toContain("Selected route</dt><dd class=\"font-semibold\">DEFAULT");
      expect(html).toContain("Route type</dt><dd class=\"font-semibold\">normal");
      expect(html).toContain("Fallback used</dt><dd class=\"font-semibold\">false");
    }
  });

  it("renders missing or malformed resolver evidence as unavailable and fail-closed", () => {
    const record = {
      ...sealedRecord(),
      routes: [{
        family: "PurchaseRequest",
        label: "Purchase Request",
        approvalRuleId: "rule-default",
        routeLabel: "DEFAULT / v1",
        ready: true,
        detail: "Bound readiness evidence",
        resolverEvidence: parsePurchaseRequestResolverEvidence("{", "rule-default"),
      }],
    };
    const html = renderToStaticMarkup(<ReadOnlyRoutes record={record} />);

    expect(html).toContain("Evidence unavailable");
    expect(html).toContain("This record fails closed");
    expect(html).not.toContain("purchase_request_approval_rule_v1");
  });
});
