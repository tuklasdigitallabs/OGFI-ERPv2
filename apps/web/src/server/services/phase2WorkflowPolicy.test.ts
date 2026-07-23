import { describe, expect, test } from "vitest";
import { phase2WorkflowPolicySeedRows } from "../../../../../packages/database/src/phase2-workflow-policies";
import { permissions } from "./authorization";
import {
  assertPhase2WorkflowTransitionAllowed,
  getPhase2ReachableStatuses,
  getPhase2WorkflowActionsForStatus,
  getPhase2WorkflowTransitions,
  phase2WorkflowDomains,
  phase2WorkflowTransitions,
  requiresPhase2IndependentReview
} from "./phase2WorkflowPolicy";

describe("Phase 2 workflow policy registry", () => {
  test("defines transitions for every Phase 2 workflow domain", () => {
    for (const domain of phase2WorkflowDomains) {
      expect(getPhase2WorkflowTransitions(domain).length).toBeGreaterThan(0);
    }
  });

  test("keeps transition metadata complete and permission-backed", () => {
    const permissionCodes = new Set(Object.values(permissions));

    for (const transition of phase2WorkflowTransitions) {
      expect(transition.action.trim()).not.toHaveLength(0);
      expect(transition.fromStatus.trim()).not.toHaveLength(0);
      expect(transition.toStatus.trim()).not.toHaveLength(0);
      expect(transition.label.trim()).not.toHaveLength(0);
      expect(permissionCodes.has(transition.permissionCode)).toBe(true);
    }
  });

  test("keeps seeded database policy rows aligned with the runtime transition registry", () => {
    const runtimeRows = phase2WorkflowTransitions.map((transition) => ({
      domain: transition.domain,
      action: transition.action,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      permissionCode: transition.permissionCode,
      requiresReason: transition.requiresReason,
      requiresEvidence: transition.requiresEvidence,
      terminal: transition.terminal,
      active: true
    }));

    const seededRows = phase2WorkflowPolicySeedRows.map((policy) => ({
      domain: policy.domain,
      action: policy.action,
      fromStatus: policy.fromStatus,
      toStatus: policy.toStatus,
      permissionCode: policy.permissionCode,
      requiresReason: policy.requiresReason,
      requiresEvidence: policy.requiresEvidence,
      terminal: policy.terminal,
      active: policy.active
    }));

    expect(seededRows).toEqual(runtimeRows);
  });

  test("marks cost and menu-price approval/apply policies as self-approval blocked in seed data", () => {
    const blockedPolicyKeys = phase2WorkflowPolicySeedRows
      .filter((policy) => policy.blocksSelfApproval)
      .map((policy) => `${policy.domain}:${policy.action}:${policy.fromStatus}`);

    expect(blockedPolicyKeys).toEqual([
      "RECIPE_VERSION:APPROVE:UNDER_REVIEW",
      "RECIPE_VERSION:PUBLISH:APPROVED",
      "MENU_PRICE_DECISION:APPROVE:UNDER_REVIEW",
      "MENU_PRICE_DECISION:APPLY:APPROVED"
    ]);
  });

  test("exposes only permitted actions for a role and record status", () => {
    expect(
      getPhase2WorkflowActionsForStatus("RECIPE_VERSION", "APPROVED", [
        permissions.recipePublish
      ]).map((transition) => transition.action)
    ).toEqual(["PUBLISH"]);

    expect(
      getPhase2WorkflowActionsForStatus("RECIPE_VERSION", "APPROVED", [
        permissions.recipeView
      ])
    ).toEqual([]);
  });

  test("requires explicit reason and evidence when policy says so", () => {
    expect(() =>
      assertPhase2WorkflowTransitionAllowed({
        domain: "RECIPE_VERSION",
        action: "PUBLISH",
        fromStatus: "APPROVED",
        permissionCodes: [permissions.recipePublish]
      })
    ).toThrow("PHASE2_WORKFLOW_REASON_REQUIRED");

    expect(() =>
      assertPhase2WorkflowTransitionAllowed({
        domain: "RECIPE_VERSION",
        action: "PUBLISH",
        fromStatus: "APPROVED",
        permissionCodes: [permissions.recipePublish],
        reason: "Approved recipe cost basis for launch."
      })
    ).toThrow("PHASE2_WORKFLOW_EVIDENCE_REQUIRED");

    expect(
      assertPhase2WorkflowTransitionAllowed({
        domain: "RECIPE_VERSION",
        action: "PUBLISH",
        fromStatus: "APPROVED",
        permissionCodes: [permissions.recipePublish],
        reason: "Approved recipe cost basis for launch.",
        evidenceReference: "approval-pack-001"
      }).toStatus
    ).toBe("PUBLISHED");
  });

  test("blocks invalid or unauthorized transitions before services mutate records", () => {
    expect(() =>
      assertPhase2WorkflowTransitionAllowed({
        domain: "OPERATIONAL_INCIDENT",
        action: "RESOLVE",
        fromStatus: "PENDING_VENDOR",
        permissionCodes: [permissions.incidentResolve],
        reason: "Issue fixed.",
        evidenceReference: "incident-photo-001"
      })
    ).toThrow("PHASE2_WORKFLOW_TRANSITION_NOT_ALLOWED");

    expect(() =>
      assertPhase2WorkflowTransitionAllowed({
        domain: "OPERATIONAL_INCIDENT",
        action: "RESOLVE",
        fromStatus: "OPEN",
        permissionCodes: [permissions.incidentView]
      })
    ).toThrow("PERMISSION_DENIED");
  });

  test("keeps intermediate statuses reachable only through declared transitions", () => {
    expect(getPhase2ReachableStatuses("BRANCH_CHECKLIST")).toEqual(
      expect.arrayContaining(["SUBMITTED", "MANAGER_REVIEW", "RETURNED", "CLOSED"])
    );
    expect(
      getPhase2WorkflowActionsForStatus("BRANCH_CHECKLIST", "MANAGER_REVIEW", [
        permissions.branchOperationsReview,
        permissions.branchOperationsCorrect
      ]).map((transition) => transition.action)
    ).toEqual(["RETURN_FOR_CORRECTION", "CLOSE"]);
  });

  test("reconciles incident and maintenance transitions to supported service statuses and actions", () => {
    expect(
      getPhase2WorkflowTransitions("OPERATIONAL_INCIDENT").map(
        ({ action, fromStatus, toStatus }) => [action, fromStatus, toStatus]
      )
    ).toEqual([
      ["RESOLVE", "OPEN", "RESOLVED"],
      ["RESOLVE", "IN_PROGRESS", "RESOLVED"],
      ["RESOLVE", "PENDING_REVIEW", "RESOLVED"],
      ["CANCEL", "OPEN", "CANCELLED"],
      ["CANCEL", "IN_PROGRESS", "CANCELLED"],
      ["CANCEL", "PENDING_REVIEW", "CANCELLED"],
      ["DETAIL_CORRECTION", "OPEN", "OPEN"],
      ["DETAIL_CORRECTION", "IN_PROGRESS", "IN_PROGRESS"],
      ["DETAIL_CORRECTION", "PENDING_REVIEW", "PENDING_REVIEW"]
    ]);

    expect(
      getPhase2WorkflowTransitions("MAINTENANCE_TICKET").map(
        ({ action, fromStatus, toStatus }) => [action, fromStatus, toStatus]
      )
    ).toEqual([
      ["COMPLETE", "OPEN", "COMPLETED"],
      ["COMPLETE", "IN_PROGRESS", "COMPLETED"],
      ["COMPLETE", "PENDING_VENDOR", "COMPLETED"],
      ["CANCEL", "OPEN", "CANCELLED"],
      ["CANCEL", "IN_PROGRESS", "CANCELLED"],
      ["CANCEL", "PENDING_VENDOR", "CANCELLED"],
      ["DETAIL_CORRECTION", "OPEN", "OPEN"],
      ["DETAIL_CORRECTION", "IN_PROGRESS", "IN_PROGRESS"],
      ["DETAIL_CORRECTION", "PENDING_VENDOR", "PENDING_VENDOR"]
    ]);
  });

  test("requires the dedicated maintenance correction authority", () => {
    expect(
      getPhase2WorkflowActionsForStatus("MAINTENANCE_TICKET", "OPEN", [
        permissions.maintenanceCreate
      ]).map((transition) => transition.action)
    ).toEqual([]);
    expect(
      getPhase2WorkflowActionsForStatus("MAINTENANCE_TICKET", "OPEN", [
        permissions.maintenanceCorrect
      ]).map((transition) => transition.action)
    ).toEqual(["DETAIL_CORRECTION"]);
  });

  test("identifies critical and high-risk controlled actions requiring independent review", () => {
    expect(
      requiresPhase2IndependentReview({
        domain: "OPERATIONAL_INCIDENT",
        action: "RESOLVE",
        riskLevel: "critical"
      })
    ).toBe(true);
    expect(
      requiresPhase2IndependentReview({
        domain: "MAINTENANCE_TICKET",
        action: "CANCEL",
        riskLevel: "HIGH"
      })
    ).toBe(true);
    expect(
      requiresPhase2IndependentReview({
        domain: "OPERATIONAL_INCIDENT",
        action: "DETAIL_CORRECTION",
        riskLevel: "CRITICAL"
      })
    ).toBe(false);
    expect(
      requiresPhase2IndependentReview({
        domain: "MAINTENANCE_TICKET",
        action: "COMPLETE",
        riskLevel: "MEDIUM"
      })
    ).toBe(false);
  });

  test("does not expose outgoing actions from terminal Phase 2 statuses", () => {
    const terminalCases = [
      ["RECIPE_VERSION", "PUBLISHED", permissions.recipePublish],
      ["RECIPE_VERSION", "REJECTED", permissions.recipeReview],
      ["MENU_PRICE_DECISION", "APPLIED", permissions.menuPriceDecide],
      ["BRANCH_CHECKLIST", "CLOSED", permissions.branchOperationsReview],
      ["FOOD_SAFETY_LOG", "CLOSED", permissions.foodSafetyReview],
      ["OPERATIONAL_INCIDENT", "RESOLVED", permissions.incidentResolve],
      ["OPERATIONAL_INCIDENT", "CANCELLED", permissions.incidentResolve],
      ["MAINTENANCE_TICKET", "COMPLETED", permissions.maintenanceComplete],
      ["MAINTENANCE_TICKET", "CANCELLED", permissions.maintenanceComplete]
    ] as const;

    for (const [domain, status, permission] of terminalCases) {
      expect(getPhase2WorkflowActionsForStatus(domain, status, [permission])).toEqual(
        []
      );
    }
  });

  test("blocks stale or mismatched workflow transitions even with valid permissions", () => {
    expect(() =>
      assertPhase2WorkflowTransitionAllowed({
        domain: "RECIPE_VERSION",
        action: "PUBLISH",
        fromStatus: "UNDER_REVIEW",
        permissionCodes: [permissions.recipePublish],
        reason: "Trying to publish before approval.",
        evidenceReference: "approval-pack-001"
      })
    ).toThrow("PHASE2_WORKFLOW_TRANSITION_NOT_ALLOWED");

    expect(() =>
      assertPhase2WorkflowTransitionAllowed({
        domain: "MENU_PRICE_DECISION",
        action: "APPLY",
        fromStatus: "UNDER_REVIEW",
        permissionCodes: [permissions.menuPriceDecide],
        reason: "Trying to apply before approval.",
        evidenceReference: "price-pack-001"
      })
    ).toThrow("PHASE2_WORKFLOW_TRANSITION_NOT_ALLOWED");

    expect(() =>
      assertPhase2WorkflowTransitionAllowed({
        domain: "FOOD_SAFETY_LOG",
        action: "RETURN_FOR_CORRECTION",
        fromStatus: "SUBMITTED",
        permissionCodes: [permissions.foodSafetyCorrect],
        reason: "Needs corrected evidence."
      })
    ).toThrow("PHASE2_WORKFLOW_TRANSITION_NOT_ALLOWED");
  });
});
