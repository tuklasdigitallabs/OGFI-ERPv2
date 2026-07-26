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
  it("covers every registered family with the exact 18/14/18 command matrix", () => {
    expect(Object.keys(canonicalApprovalDecisionCapabilities).sort()).toEqual(
      [...supportedApprovalDocumentTypes].sort(),
    );
    expect(
      supportedApprovalDocumentTypes.filter((family) =>
        canonicalApprovalDecisionCapabilities[family].includes("APPROVE"),
      ),
    ).toHaveLength(18);
    expect(
      supportedApprovalDocumentTypes.filter((family) =>
        canonicalApprovalDecisionCapabilities[family].includes("RETURN"),
      ),
    ).toHaveLength(14);
    expect(
      supportedApprovalDocumentTypes.filter((family) =>
        canonicalApprovalDecisionCapabilities[family].includes("REJECT"),
      ),
    ).toHaveLength(18);
  });

  it("publishes a stable versioned digest for the subsequent cutover cursor", () => {
    expect(APPROVAL_DECISION_CAPABILITY_VERSION).toBe("1");
    expect(APPROVAL_DECISION_CAPABILITY_HASH).toBe(
      "9059b8b0ef752d340b2f2d757f7298f7f66a07ea3a70db053421c534ae52e608",
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
