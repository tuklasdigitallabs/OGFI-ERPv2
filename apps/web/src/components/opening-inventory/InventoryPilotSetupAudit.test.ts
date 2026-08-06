import { describe, expect, it } from "vitest";
import { inventoryPilotSelectionAuditChanges } from "./InventoryPilotSetupAudit";

describe("inventory pilot selection audit presentation", () => {
  it("shows bounded endpoint, item, actor, and route additions/removals/changes", () => {
    const changes = inventoryPilotSelectionAuditChanges(
      {
        endpointMemberships: [{ capability: "COUNT_LOCATION", inventoryLocationId: "endpoint-old", locationId: "location-old" }],
        itemIds: ["item-old"],
        participants: [{ responsibility: "PREPARER", userId: "user-old", roleAssignmentId: "role-old" }],
        routeReadiness: [{ family: "PurchaseRequest", approvalRuleId: "rule-old", approvalRuleVersion: 1 }],
      },
      {
        endpointMemberships: [{ capability: "OPENING_STOCK_LOCATION", inventoryLocationId: "endpoint-new", locationId: "location-new" }],
        itemIds: ["item-new"],
        participants: [{ responsibility: "PREPARER", userId: "user-new", roleAssignmentId: "role-new" }],
        routeReadiness: [{ family: "PurchaseRequest", approvalRuleId: "rule-new", approvalRuleVersion: 2 }],
      },
    );

    expect(changes.join(" · ")).toContain("Endpoint roles removed: Count location at endpoint endpoint-old");
    expect(changes.join(" · ")).toContain("Endpoint roles added: Opening stock location at endpoint endpoint-new");
    expect(changes.join(" · ")).toContain("Items removed: item item-old");
    expect(changes.join(" · ")).toContain("Items added: item item-new");
    expect(changes.join(" · ")).toContain("Named users changed: Preparer: user user-old / role assignment role-old → Preparer: user user-new / role assignment role-new");
    expect(changes.join(" · ")).toContain("Routes changed: Purchase Request: rule rule-old / version 1 → Purchase Request: rule rule-new / version 2");
  });

  it("limits visible deltas and reports the retained remainder", () => {
    const changes = inventoryPilotSelectionAuditChanges(
      { itemIds: [] },
      { itemIds: Array.from({ length: 12 }, (_, index) => `item-${index + 1}`) },
    );

    expect(changes).toHaveLength(9);
    expect(changes.at(-1)).toBe("4 more selection change(s) retained in the audit record");
  });
});
