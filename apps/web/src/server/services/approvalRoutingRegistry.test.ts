import { describe, expect, test } from "vitest";
import {
  APPROVAL_ROUTING_MAPPING_HASH,
  approvalRoutingPolicies,
  getApprovalRoutingPolicy,
  isSupportedApprovalDocumentType,
  supportedApprovalDocumentTypes,
} from "./approvalRoutingRegistry";

describe("approval routing mapping registry", () => {
  test("contains exactly the 18 confirmed document types with no fallback", () => {
    expect(supportedApprovalDocumentTypes).toHaveLength(18);
    expect(new Set(supportedApprovalDocumentTypes).size).toBe(18);
    expect(Object.keys(approvalRoutingPolicies).sort()).toEqual(
      [...supportedApprovalDocumentTypes].sort(),
    );
    expect(isSupportedApprovalDocumentType("PROJECT_REQUIREMENT")).toBe(false);
    expect(isSupportedApprovalDocumentType("UnknownDocument")).toBe(false);
  });

  test.each(supportedApprovalDocumentTypes)(
    "%s has a complete deterministic mapping",
    (documentType) => {
      const policy = getApprovalRoutingPolicy(documentType);
      expect(policy.documentType).toBe(documentType);
      expect(policy.requiredPermissionCode).toMatch(/^[a-z0-9._-]+$/);
      expect(policy.allowedSourceStatuses.length).toBeGreaterThan(0);
      expect(policy.scopeSource).not.toBe("");
      expect(policy.dueSource).not.toBe("");
      expect(policy.prohibitedActorSources.length).toBeGreaterThan(0);
    },
  );

  test("uses direct source locations for location-bound workforce records", () => {
    expect(getApprovalRoutingPolicy("EmployeeLeaveRequest").scopeSource).toBe("locationId");
    expect(getApprovalRoutingPolicy("EmployeeOvertimeRecord").scopeSource).toBe("locationId");
  });

  test("uses the live FinanceCloseRun source status", () => {
    expect(getApprovalRoutingPolicy("FinanceCloseRun").allowedSourceStatuses).toEqual(["CLOSED"]);
  });

  test("accepts the intentional budget pre-review and actionable states", () => {
    expect(getApprovalRoutingPolicy("BudgetRevision").allowedSourceStatuses).toEqual([
      "SUBMITTED",
      "UNDER_REVIEW",
    ]);
  });

  test("publishes a stable SHA-256 mapping hash", () => {
    expect(APPROVAL_ROUTING_MAPPING_HASH).toMatch(/^[a-f0-9]{64}$/);
  });
});
