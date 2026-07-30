import { describe, expect, it } from "vitest";
import {
  APPROVAL_DECISION_CAPABILITY_HASH,
  APPROVAL_DECISION_CAPABILITY_VERSION,
  assertNormalizedApprovalDecisionAvailable,
  canonicalApprovalDecisionCapabilities,
  getApprovalDecisionSurfaceContract,
} from "./approvalDecisionCapabilities";
import { supportedApprovalDocumentTypes } from "./approvalRoutingRegistry";

describe("normalized approval decision capability contract", () => {
  it("covers every registered family with the exact 20/15/19 command matrix", () => {
    expect(Object.keys(canonicalApprovalDecisionCapabilities).sort()).toEqual(
      [...supportedApprovalDocumentTypes].sort(),
    );
    expect(
      supportedApprovalDocumentTypes.filter((family) =>
        canonicalApprovalDecisionCapabilities[family].includes("APPROVE"),
      ),
    ).toHaveLength(20);
    expect(
      supportedApprovalDocumentTypes.filter((family) =>
        canonicalApprovalDecisionCapabilities[family].includes("RETURN"),
      ),
    ).toHaveLength(15);
    expect(
      supportedApprovalDocumentTypes.filter((family) =>
        canonicalApprovalDecisionCapabilities[family].includes("REJECT"),
      ),
    ).toHaveLength(19);
  });

  it("pins the exact closed family/action sets and rejects runtime mutation", () => {
    const noReturn = new Set([
      "FinanceCloseRun",
      "BudgetRevision",
      "PaymentRelease",
      "EmployeeOvertimeRecord",
      "StockCountAttemptReview",
    ]);
    for (const family of supportedApprovalDocumentTypes) {
      expect(canonicalApprovalDecisionCapabilities[family]).toEqual(
        family === "StockCountAttemptReview"
          ? ["APPROVE"]
          : noReturn.has(family)
          ? ["APPROVE", "REJECT"]
          : ["APPROVE", "RETURN", "REJECT"],
      );
      expect(new Set(canonicalApprovalDecisionCapabilities[family]).size).toBe(
        canonicalApprovalDecisionCapabilities[family].length,
      );
      expect(Object.isFrozen(canonicalApprovalDecisionCapabilities[family])).toBe(true);
    }
    expect(Object.isFrozen(canonicalApprovalDecisionCapabilities)).toBe(true);
    expect(() => {
      (canonicalApprovalDecisionCapabilities.PurchaseRequest as string[]).push("RETURN");
    }).toThrow();
    expect(() => Object.defineProperty(
      canonicalApprovalDecisionCapabilities,
      "PurchaseRequest",
      { value: ["REJECT"] },
    )).toThrow();
  });

  it("publishes a stable versioned digest for the subsequent cutover cursor", () => {
    expect(APPROVAL_DECISION_CAPABILITY_VERSION).toBe("2");
    expect(APPROVAL_DECISION_CAPABILITY_HASH).toBe(
      "584834b6085e75e25de7703b63ca7e0a800a9e609f9811a3a511822dbbe89e03",
    );
  });

  it("makes the normalized Payment approval hold truthful without hiding cleanup decisions", () => {
    const contract = getApprovalDecisionSurfaceContract("PaymentRequest");
    expect(contract.decisions).toEqual([
      expect.objectContaining({
        decision: "APPROVE",
        available: false,
        disabledReasonCode: "PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED",
      }),
      expect.objectContaining({ decision: "RETURN", available: true }),
      expect.objectContaining({ decision: "REJECT", available: true }),
    ]);
    expect(() =>
      assertNormalizedApprovalDecisionAvailable("PaymentRequest", "APPROVE"),
    ).toThrow("PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED");
    expect(() =>
      assertNormalizedApprovalDecisionAvailable("PaymentRequest", "RETURN"),
    ).not.toThrow();
    expect(() =>
      assertNormalizedApprovalDecisionAvailable("PaymentRequest", "REJECT"),
    ).not.toThrow();
  });

  it("fails closed for unknown families and unsupported family decisions", () => {
    expect(() => getApprovalDecisionSurfaceContract("UnknownRequest")).toThrow(
      "APPROVAL_DECISION_REQUIRED",
    );
    expect(() =>
      assertNormalizedApprovalDecisionAvailable("FinanceCloseRun", "RETURN"),
    ).toThrow("APPROVAL_DECISION_REQUIRED");
    for (const malformed of [null, undefined, 1, {}, [], { toString: () => "PaymentRequest" }]) {
      expect(() =>
        assertNormalizedApprovalDecisionAvailable("PurchaseRequest", malformed),
      ).toThrow("APPROVAL_DECISION_REQUIRED");
      expect(() => getApprovalDecisionSurfaceContract(malformed as string)).toThrow(
        "APPROVAL_DECISION_REQUIRED",
      );
    }
  });

  it("provides an explicit label and availability for every supported control", () => {
    for (const family of supportedApprovalDocumentTypes) {
      const contract = getApprovalDecisionSurfaceContract(family);
      expect(contract.decisions).toHaveLength(
        canonicalApprovalDecisionCapabilities[family].length,
      );
      for (const decision of contract.decisions) {
        expect(decision.label.trim().length).toBeGreaterThan(0);
        expect(decision.supported).toBe(true);
        if (!decision.available) {
          expect(decision.disabledReasonCode).toMatch(/^[A-Z0-9_]+$/);
          expect(decision.disabledReason?.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
