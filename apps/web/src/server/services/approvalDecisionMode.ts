import { normalizedApprovalRoutingEnabled } from "./approvalRouting"

export function canonicalApprovalDecisionsEnabled() {
  return normalizedApprovalRoutingEnabled()
}

export function assertLegacyApprovalDecisionAllowed() {
  if (canonicalApprovalDecisionsEnabled()) {
    throw new Error("LEGACY_APPROVAL_DECISION_DISABLED")
  }
}

export function assertPaymentRequestApprovalPolicyConfirmed() {
  if (canonicalApprovalDecisionsEnabled()) {
    throw new Error("PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED")
  }
}

export function assertAuthoritativeApprovalEvidence(
  sourceEvidenceReference: string | null | undefined,
  errorCode: string
) {
  if (!sourceEvidenceReference?.trim()) {
    throw new Error(errorCode)
  }
}
