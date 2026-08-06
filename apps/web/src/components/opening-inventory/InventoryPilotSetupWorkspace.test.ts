import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./InventoryPilotSetupWorkspace.tsx", import.meta.url), "utf8");

describe("InventoryPilotSetupWorkspace visible controls", () => {
  it("provides working subworkspace surfaces rather than passive tabs", () => {
    for (const label of ["Endpoints", "Items", "Named users", "Approval routes", "Readiness", "Activity"]) {
      expect(source).toContain(label);
    }
    for (const action of [
      "Create configuration draft",
      "Create successor draft",
      "Save endpoint selections",
      "Save item selections",
      "Save named users",
      "Save route bindings",
      "Validate readiness",
      "Abandon draft",
      "Seal configuration revision",
    ]) expect(source).toContain(action);
  });

  it("keeps candidate lists server-paged without losing off-page selections", () => {
    expect(source).toContain('itemLabel="configuration revisions"');
    expect(source).toContain('itemLabel="eligible endpoints"');
    expect(source).toContain('itemLabel="eligible items"');
    expect(source).toContain('itemLabel="eligible named users"');
    expect(source).toContain('name="itemQuery"');
    expect(source).toContain('name="itemCategoryId"');
    expect(source).toContain("Paging never removes a selection");
    expect(source).toMatch(/selectedEndpointRoles\s*\.slice\(0, 10\)/);
    expect(source).toContain("selectedItems.slice(0, 10)");
    expect(source).toContain("and {selectedItems.length - 10} more");
    expect(source).not.toContain("max-h-[34rem]");
  });

  it("retains exact record identity and pending actor/route choices across navigation", () => {
    expect(source).toMatch(/record\.status === "SEALED"\s*\? \{ revision: record\.id \}\s*: \{ draft: record\.id \}/);
    expect(source).toContain('data-retains-draft-selections="true"');
    expect(source.match(/inventoryPilotPendingSelectionParams\(/g)).toHaveLength(2);
    expect(source).toContain('name="userResponsibility"');
    expect(source).toContain('name="ruleFamily"');
  });

  it("remounts and reseeds endpoint and item editor state for every record version", () => {
    expect(source).toContain('key={`endpoints:${selected.id}:${selected.version}`}');
    expect(source).toContain('key={`items:${selected.id}:${selected.version}`}');
    expect(source).toMatch(
      /setSelected\(new Set\(selectionSeed\)\)[\s\S]*\[record\.id, record\.version, selectionSeed\]/,
    );
    expect(source).toMatch(
      /setChosen\(new Set\(selectionSeed\)\)[\s\S]*\[record\.id, record\.version, selectionSeed\]/,
    );
  });

  it("shows exact Purchase Request resolver evidence and a fail-closed unavailable state", () => {
    for (const label of [
      "Purchase Request resolver evidence",
      "purchase_request_approval_rule_v1",
      "Emergency request",
      "Selected route",
      "Route type",
      "Fallback used",
      "Evidence unavailable",
      "This record fails closed",
    ])
      expect(source).toContain(label);
  });

  it("paginates every immutable endpoint and item membership", () => {
    expect(source).toContain('itemLabel="retained endpoint roles"');
    expect(source).toContain('itemLabel="retained pilot items"');
    expect(source).toContain('inventoryPilotSetupHref(record, "endpoints"');
    expect(source).toContain('inventoryPilotSetupHref(record, "items"');
  });

  it("keeps inactive retained items removable without allowing new inactive selections", () => {
    expect(source).toContain('item.status !== "ACTIVE" && !selected');
    expect(source).toMatch(
      /Inactive items are reviewable but cannot be newly\s+selected\./,
    );
    expect(source).toContain('aria-label={`Remove ${item.name}`}');
  });

  it("makes sealed revisions read-only and explains independent sealing controls", () => {
    expect(source).toContain("Sealed and abandoned configurations are immutable.");
    expect(source).toContain("creator or last material editor cannot seal");
    expect(source).toContain("Fresh MFA is required before sealing");
    expect(source).toMatch(
      /Sealing has no activation, approval, cohort, posting,\s+ledger, custody, or financial effect\./,
    );
    expect(source).toContain("Immutable SHA-256 digest");
    expect(source).toContain("standard, non-emergency");
    expect(source).toContain("DEFAULT route");
    expect(source).toContain("emergency purchasing routes may coexist");
  });

  it("shows blockers, empty selection guidance, and unsaved-change protection", () => {
    expect(source).toContain("No pilot revisions yet");
    expect(source).toContain("Select a configuration revision");
    expect(source).toContain("Readiness has not been validated");
    expect(source).toContain("result.blockers.map");
    expect(source).toContain("Unsaved configuration changes");
    expect(source).toContain('window.addEventListener("beforeunload"');
  });

  it("uses shared toast feedback and refreshes authoritative state after mutations", () => {
    expect(source).toContain("useActionToast");
    expect(source).toContain("useEntryModalFeedback");
    expect(source).toContain("router.refresh()");
    expect(source).toContain("router.replace(href");
    expect(source).not.toContain('redirect("")');
  });
});
