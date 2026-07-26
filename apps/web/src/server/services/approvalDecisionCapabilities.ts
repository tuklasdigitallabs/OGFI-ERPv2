import { createHash } from "node:crypto";
import {
  isSupportedApprovalDocumentType,
  supportedApprovalDocumentTypes,
  type SupportedApprovalDocumentType,
} from "./approvalRoutingRegistry";

export const canonicalApprovalDecisionKinds = [
  "APPROVE",
  "RETURN",
  "REJECT",
] as const;

export type CanonicalApprovalDecisionKind =
  (typeof canonicalApprovalDecisionKinds)[number];

type ApprovalDecisionFamilyContract = {
  decisions: readonly CanonicalApprovalDecisionKind[];
  approveLabel: string;
  rejectLabel: string;
  supportsSupplementalEvidence: boolean;
};

const approvalDecisionFamilyContracts = {
  PurchaseRequest: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Purchase Request",
    rejectLabel: "Reject Purchase Request",
    supportsSupplementalEvidence: false,
  },
  QuotationRecommendation: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Recommendation",
    rejectLabel: "Reject Recommendation",
    supportsSupplementalEvidence: false,
  },
  PurchaseOrder: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Purchase Order",
    rejectLabel: "Reject Purchase Order",
    supportsSupplementalEvidence: false,
  },
  PurchaseOrderBalanceClosure: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Balance Closure",
    rejectLabel: "Reject Balance Closure",
    supportsSupplementalEvidence: false,
  },
  PurchaseOrderAmendment: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Purchase Order Amendment",
    rejectLabel: "Reject Purchase Order Amendment",
    supportsSupplementalEvidence: false,
  },
  WastageReport: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Wastage Report",
    rejectLabel: "Reject Wastage Report",
    supportsSupplementalEvidence: false,
  },
  StockAdjustment: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Stock Adjustment",
    rejectLabel: "Reject Stock Adjustment",
    supportsSupplementalEvidence: false,
  },
  FinanceCloseRun: {
    decisions: ["APPROVE", "REJECT"],
    approveLabel: "Approve Period Action",
    rejectLabel: "Reject Period Action",
    supportsSupplementalEvidence: false,
  },
  BudgetRevision: {
    decisions: ["APPROVE", "REJECT"],
    approveLabel: "Approve Budget Revision",
    rejectLabel: "Reject Budget Revision",
    supportsSupplementalEvidence: true,
  },
  ExpenseRequest: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Expense Request",
    rejectLabel: "Reject Expense Request",
    supportsSupplementalEvidence: true,
  },
  CashAdvanceRequest: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Cash Advance",
    rejectLabel: "Reject Cash Advance",
    supportsSupplementalEvidence: true,
  },
  PettyCashRequest: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Petty Cash",
    rejectLabel: "Reject Petty Cash",
    supportsSupplementalEvidence: true,
  },
  PaymentRequest: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Payment Request",
    rejectLabel: "Reject Payment Request",
    supportsSupplementalEvidence: false,
  },
  PaymentRelease: {
    decisions: ["APPROVE", "REJECT"],
    approveLabel: "Approve Payment Release",
    rejectLabel: "Reject Payment Release",
    supportsSupplementalEvidence: false,
  },
  EmployeeLeaveRequest: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Leave",
    rejectLabel: "Reject Leave",
    supportsSupplementalEvidence: true,
  },
  EmployeeOvertimeRecord: {
    decisions: ["APPROVE", "REJECT"],
    approveLabel: "Approve Overtime",
    rejectLabel: "Reject Overtime",
    supportsSupplementalEvidence: true,
  },
  WorkforceSchedule: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Schedule",
    rejectLabel: "Reject Schedule",
    supportsSupplementalEvidence: true,
  },
  AttendanceImportBatch: {
    decisions: ["APPROVE", "RETURN", "REJECT"],
    approveLabel: "Approve Attendance Review",
    rejectLabel: "Reject Attendance Review",
    supportsSupplementalEvidence: false,
  },
} as const satisfies Record<
  SupportedApprovalDocumentType,
  ApprovalDecisionFamilyContract
>;

export const canonicalApprovalDecisionCapabilities = Object.fromEntries(
  supportedApprovalDocumentTypes.map((family) => [
    family,
    approvalDecisionFamilyContracts[family].decisions,
  ]),
) as unknown as Record<
  SupportedApprovalDocumentType,
  readonly CanonicalApprovalDecisionKind[]
>;

export const APPROVAL_DECISION_CAPABILITY_VERSION = "1";

const paymentApprovalPolicyReason =
  "Approval is unavailable until Finance confirms the Payment Request invoice-eligibility and capacity policy. Return or reject remain available.";

function decisionLabel(
  contract: ApprovalDecisionFamilyContract,
  decision: CanonicalApprovalDecisionKind,
) {
  if (decision === "APPROVE") return contract.approveLabel;
  if (decision === "RETURN") return "Return for Revision";
  return contract.rejectLabel;
}

function normalizedDecisionAvailability(
  family: SupportedApprovalDocumentType,
  decision: CanonicalApprovalDecisionKind,
) {
  if (family === "PaymentRequest" && decision === "APPROVE") {
    return {
      available: false,
      disabledReasonCode: "PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED",
      disabledReason: paymentApprovalPolicyReason,
    } as const;
  }
  return {
    available: true,
    disabledReasonCode: null,
    disabledReason: null,
  } as const;
}

const capabilityDigestPayload = supportedApprovalDocumentTypes.map((family) => ({
  family,
  decisions: approvalDecisionFamilyContracts[family].decisions.map((decision) => {
    const availability = normalizedDecisionAvailability(family, decision);
    return {
      decision,
      available: availability.available,
      disabledReasonCode: availability.disabledReasonCode,
    };
  }),
  supportsSupplementalEvidence:
    approvalDecisionFamilyContracts[family].supportsSupplementalEvidence,
}));

export const APPROVAL_DECISION_CAPABILITY_HASH = createHash("sha256")
  .update(
    JSON.stringify({
      domain: "ogfi:approval-decision-capabilities:v1",
      version: APPROVAL_DECISION_CAPABILITY_VERSION,
      families: capabilityDigestPayload,
    }),
  )
  .digest("hex");

export function getApprovalDecisionSurfaceContract(family: string) {
  if (!isSupportedApprovalDocumentType(family)) {
    throw new Error("APPROVAL_DECISION_REQUIRED");
  }
  const contract = approvalDecisionFamilyContracts[family];
  return {
    family,
    supportsSupplementalEvidence: contract.supportsSupplementalEvidence,
    decisions: contract.decisions.map((decision) => ({
      decision,
      label: decisionLabel(contract, decision),
      supported: true as const,
      ...normalizedDecisionAvailability(family, decision),
    })),
  };
}

export function assertNormalizedApprovalDecisionAvailable(
  family: string,
  decision: string,
) {
  if (!isSupportedApprovalDocumentType(family)) {
    throw new Error("APPROVAL_DECISION_REQUIRED");
  }
  const normalizedDecision = decision.toUpperCase();
  if (
    !canonicalApprovalDecisionKinds.includes(
      normalizedDecision as CanonicalApprovalDecisionKind,
    ) ||
    !canonicalApprovalDecisionCapabilities[family].includes(
      normalizedDecision as never,
    )
  ) {
    throw new Error("APPROVAL_DECISION_REQUIRED");
  }
  const availability = normalizedDecisionAvailability(
    family,
    normalizedDecision as CanonicalApprovalDecisionKind,
  );
  if (!availability.available) {
    throw new Error(availability.disabledReasonCode);
  }
}

export function approvalFamilySupportsSupplementalEvidence(family: string) {
  return (
    isSupportedApprovalDocumentType(family) &&
    approvalDecisionFamilyContracts[family].supportsSupplementalEvidence
  );
}
