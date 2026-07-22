import { describe, expect, it } from "vitest";
import {
  canonicalApprovalDecisionCapabilities,
  parseCanonicalApprovalDecisionCommand,
} from "./approvalDecisionCommands";
import { validatePettyCashApprovedAmount } from "./pettyCash";
import { assertPaymentRequestEligibleInvoice } from "./finance";
import { supportedApprovalDocumentTypes } from "./approvalRoutingRegistry";

const approvalInstanceId = "11111111-1111-4111-8111-111111111111";

describe("canonical approval decision commands", () => {
  it("accepts approve and reject commands for every registered family", () => {
    for (const family of supportedApprovalDocumentTypes) {
      expect(
        parseCanonicalApprovalDecisionCommand({
          approvalInstanceId,
          family,
          decision: "APPROVE",
        }).family,
      ).toBe(family);
      expect(
        parseCanonicalApprovalDecisionCommand({
          approvalInstanceId,
          family,
          decision: "REJECT",
          remarks: "Policy requirements were not met",
        }).family,
      ).toBe(family);
    }
  });

  it("matches parser acceptance to every registered family capability", () => {
    for (const family of supportedApprovalDocumentTypes) {
      for (const decision of ["APPROVE", "RETURN", "REJECT"] as const) {
        const input = {
          approvalInstanceId,
          family,
          decision,
          ...(decision === "APPROVE"
            ? {}
            : { remarks: "Please revise the supporting details" }),
        };
        if (
          canonicalApprovalDecisionCapabilities[family].some(
            (supportedDecision) => supportedDecision === decision,
          )
        ) {
          expect(parseCanonicalApprovalDecisionCommand(input).family).toBe(
            family,
          );
        } else {
          expect(() => parseCanonicalApprovalDecisionCommand(input)).toThrow();
        }
      }
    }
  });

  it("rejects petty-cash amount changes while the owner policy is unresolved", () => {
    expect(() => parseCanonicalApprovalDecisionCommand({
      approvalInstanceId,
      family: "PettyCashRequest",
      decision: "APPROVE",
      approvedAmountPhp: 100,
    })).toThrow();
  });

  it("rejects cross-family and unknown command fields", () => {
    expect(() =>
      parseCanonicalApprovalDecisionCommand({
        approvalInstanceId,
        family: "PaymentRequest",
        decision: "APPROVE",
        evidenceReference: "not-accepted-for-payment",
      }),
    ).toThrow();
    expect(() =>
      parseCanonicalApprovalDecisionCommand({
        approvalInstanceId,
        family: "ExpenseRequest",
        decision: "APPROVE",
        approvedAmountPhp: 10,
      }),
    ).toThrow();
  });

  it("requires a reason for terminal decisions", () => {
    expect(() =>
      parseCanonicalApprovalDecisionCommand({
        approvalInstanceId,
        family: "ExpenseRequest",
        decision: "REJECT",
      }),
    ).toThrow();
  });
});

describe("canonical finance approval validation", () => {
  it("preserves the current petty-cash amount and blocks all amount changes", () => {
    expect(
      validatePettyCashApprovedAmount({
        approvedAmountPhp: undefined,
        requestedAmountPhp: 500,
      }),
    ).toBe(500);
    expect(
      validatePettyCashApprovedAmount({
        approvedAmountPhp: 400,
        requestedAmountPhp: 500,
        currentProposedAmountPhp: 400,
      }),
    ).toBe(400);
    expect(() =>
      validatePettyCashApprovedAmount({
        approvedAmountPhp: 0,
        requestedAmountPhp: 500,
      }),
    ).toThrow("PETTY_CASH_AMOUNT_CHANGE_POLICY_UNCONFIRMED");
    expect(() =>
      validatePettyCashApprovedAmount({
        approvedAmountPhp: 501,
        requestedAmountPhp: 500,
      }),
    ).toThrow("PETTY_CASH_AMOUNT_CHANGE_POLICY_UNCONFIRMED");
    expect(() =>
      validatePettyCashApprovedAmount({
        approvedAmountPhp: 399,
        requestedAmountPhp: 500,
        currentProposedAmountPhp: 400,
      }),
    ).toThrow("PETTY_CASH_AMOUNT_CHANGE_POLICY_UNCONFIRMED");
  });

  it("uses one payment-invoice eligibility validator for all failure paths", () => {
    const eligible = {
      status: "MATCHED",
      matchStatus: "EXACT_MATCH",
      duplicateRisk: "CLEAR",
      currencyCode: "PHP",
      evidenceReference: "EV-AP-1",
    };
    expect(() => assertPaymentRequestEligibleInvoice(eligible)).not.toThrow();
    expect(() =>
      assertPaymentRequestEligibleInvoice({
        ...eligible,
        duplicateRisk: "POTENTIAL",
      }),
    ).toThrow("PAYMENT_REQUEST_DUPLICATE_RISK_BLOCKED");
    expect(() =>
      assertPaymentRequestEligibleInvoice({
        ...eligible,
        status: "DRAFT",
      }),
    ).toThrow("PAYMENT_REQUEST_INVOICE_NOT_ELIGIBLE");
    expect(() =>
      assertPaymentRequestEligibleInvoice({
        ...eligible,
        matchStatus: "PENDING_MATCH",
      }),
    ).toThrow("PAYMENT_REQUEST_INVOICE_NOT_ELIGIBLE");
  });
});
