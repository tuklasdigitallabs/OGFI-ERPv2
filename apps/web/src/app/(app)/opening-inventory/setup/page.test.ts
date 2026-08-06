import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Inventory Pilot Setup Center page boundary", () => {
  it("requires dedicated view access and delegates every mutation to the configuration service", () => {
    expect(source).toContain("permissions.inventoryPilotConfigurationView");
    for (const service of [
      "createInventoryPilotConfigurationDraft",
      "createInventoryPilotConfigurationSuccessorDraft",
      "updateInventoryPilotConfigurationDraft",
      "abandonInventoryPilotConfigurationDraft",
      "evaluateInventoryPilotConfigurationReadiness",
      "sealInventoryPilotConfigurationDraft",
    ]) expect(source).toContain(service);
    expect(source.match(/await assertTrustedServerActionOrigin\(\)/g)).toHaveLength(1);
    expect(source).toContain("sessionForMutation()");
  });

  it("passes full normalized snapshots when editing one section", () => {
    expect(source).toContain("currentDraftSnapshot");
    expect(source).toContain("endpoints: snapshot.endpoints");
    expect(source).toContain("itemIds: snapshot.itemIds");
    expect(source).toContain("participants: snapshot.participants");
    expect(source).toContain("routeBindings: snapshot.routeBindings");
  });

  it("uses URL-owned, server-paged workspace state", () => {
    for (const key of ["queuePage", "endpointPage", "itemPage", "userPage", "rulePage", "activityPage"]) {
      expect(source).toContain(key);
    }
    expect(source).toContain("workspace.revisionQueuePage");
    expect(source).toContain("workspace.selectedRevision");
    expect(source).toContain("workspace.sealEligibility");
    expect(source).toContain("userResponsibility");
    expect(source).toContain("ruleFamily");
    expect(source).toContain("parseInventoryPilotPendingSelections");
    expect(source).toContain("routeSelectionValues");
  });

  it("maps canonical Purchase Request resolver evidence without changing the service contract", () => {
    expect(source).toContain("parsePurchaseRequestResolverEvidence");
    expect(source).toContain("route?.resolverEvidenceCanonicalJson");
    expect(source).toContain("route?.approvalRuleId");
  });

  it("distinguishes denied, missing, and retryable load states and summarizes linked audit history", () => {
    expect(source).toContain("Setup Center permission denied");
    expect(source).toContain("Configuration record unavailable");
    expect(source).toContain("Setup Center could not be loaded");
    expect(source).toContain("Retry Setup Center");
    expect(source).toContain("Source draft history");
    expect(source).toContain("safeAuditDetail(entry)");
    expect(source).toContain("inventoryPilotSelectionAuditChanges");
  });

  it("returns safe action feedback instead of blank redirects", () => {
    expect(source).toContain("getActionErrorFeedback");
    expect(source).toContain("getActionSuccessFeedback");
    expect(source).not.toContain('redirect("")');
    expect(source).not.toContain("window.location");
  });
});
