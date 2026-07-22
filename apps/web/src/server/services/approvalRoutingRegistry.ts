import { createHash } from "node:crypto";
import { permissions } from "./authorization";

export const APPROVAL_ROUTING_MAPPING_VERSION = "2026-07-22.1";

export const supportedApprovalDocumentTypes = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
  "PurchaseOrderBalanceClosure",
  "PurchaseOrderAmendment",
  "WastageReport",
  "StockAdjustment",
  "FinanceCloseRun",
  "BudgetRevision",
  "ExpenseRequest",
  "CashAdvanceRequest",
  "PettyCashRequest",
  "PaymentRequest",
  "PaymentRelease",
  "EmployeeLeaveRequest",
  "EmployeeOvertimeRecord",
  "WorkforceSchedule",
  "AttendanceImportBatch",
] as const;

export type SupportedApprovalDocumentType =
  (typeof supportedApprovalDocumentTypes)[number];

export type ApprovalRoutingPolicy = {
  documentType: SupportedApprovalDocumentType;
  requiredPermissionCode: string;
  allowedSourceStatuses: readonly string[];
  scopeSource: string;
  dueSource: string;
  prohibitedActorSources: readonly string[];
};

const policyList: readonly ApprovalRoutingPolicy[] = [
  { documentType: "PurchaseRequest", requiredPermissionCode: permissions.purchaseRequestApprove, allowedSourceStatuses: ["PENDING_APPROVAL"], scopeSource: "requestLocationId", dueSource: "requiredDate", prohibitedActorSources: ["requesterUserId:REQUESTER"] },
  { documentType: "QuotationRecommendation", requiredPermissionCode: permissions.quoteApprove, allowedSourceStatuses: ["PENDING_APPROVAL"], scopeSource: "quotationRequest.purchaseRequest.requestLocationId", dueSource: "quotationRequest.purchaseRequest.requiredDate", prohibitedActorSources: ["preparedByUserId:PREPARER", "quotationRequest.purchaseRequest.requesterUserId:REQUESTER"] },
  { documentType: "PurchaseOrder", requiredPermissionCode: permissions.purchaseOrderApprove, allowedSourceStatuses: ["PENDING_APPROVAL"], scopeSource: "deliveryLocationId", dueSource: "expectedDeliveryDate", prohibitedActorSources: ["createdByUserId:CREATOR", "purchaseRequest.requesterUserId:REQUESTER", "quotationRecommendation.preparedByUserId:PREPARER"] },
  { documentType: "PurchaseOrderBalanceClosure", requiredPermissionCode: permissions.purchaseOrderApprove, allowedSourceStatuses: ["PENDING_APPROVAL"], scopeSource: "purchaseOrder.deliveryLocationId", dueSource: "purchaseOrder.expectedDeliveryDate", prohibitedActorSources: ["requestedByUserId:REQUESTER", "purchaseOrder.createdByUserId:CREATOR", "purchaseOrder.purchaseRequest.requesterUserId:REQUESTER", "purchaseOrder.quotationRecommendation.preparedByUserId:PREPARER"] },
  { documentType: "PurchaseOrderAmendment", requiredPermissionCode: permissions.purchaseOrderApprove, allowedSourceStatuses: ["PENDING_APPROVAL"], scopeSource: "purchaseOrder.deliveryLocationId", dueSource: "purchaseOrder.expectedDeliveryDate", prohibitedActorSources: ["requestedByUserId:REQUESTER", "purchaseOrder.createdByUserId:CREATOR", "purchaseOrder.purchaseRequest.requesterUserId:REQUESTER", "purchaseOrder.quotationRecommendation.preparedByUserId:PREPARER"] },
  { documentType: "WastageReport", requiredPermissionCode: permissions.wastageApprove, allowedSourceStatuses: ["PENDING_APPROVAL"], scopeSource: "inventoryLocation.locationId", dueSource: "NONE", prohibitedActorSources: ["reportedByUserId:REPORTER"] },
  { documentType: "StockAdjustment", requiredPermissionCode: permissions.stockAdjustmentApprove, allowedSourceStatuses: ["PENDING_APPROVAL"], scopeSource: "inventoryLocation.locationId", dueSource: "NONE", prohibitedActorSources: ["requestedByUserId:REQUESTER"] },
  { documentType: "FinanceCloseRun", requiredPermissionCode: permissions.financePeriodCloseManage, allowedSourceStatuses: ["CLOSED"], scopeSource: "companyId", dueSource: "NONE", prohibitedActorSources: ["initiatedByUserId:INITIATOR", "configSnapshot.pendingSensitiveApproval.requestedByUserId:REQUESTER"] },
  { documentType: "BudgetRevision", requiredPermissionCode: permissions.financeBudgetApprove, allowedSourceStatuses: ["SUBMITTED"], scopeSource: "budget.locationId+budget.lines.locationId-or-company", dueSource: "effectiveFrom", prohibitedActorSources: ["requestedByUserId:REQUESTER"] },
  { documentType: "ExpenseRequest", requiredPermissionCode: permissions.financeExpenseRequestApprove, allowedSourceStatuses: ["AWAITING_APPROVAL"], scopeSource: "locationId", dueSource: "requiredByDate", prohibitedActorSources: ["requestedByUserId:REQUESTER"] },
  { documentType: "CashAdvanceRequest", requiredPermissionCode: permissions.financeCashAdvanceApprove, allowedSourceStatuses: ["AWAITING_APPROVAL"], scopeSource: "locationId", dueSource: "dueDate", prohibitedActorSources: ["beneficiaryUserId:BENEFICIARY", "requestedByUserId:REQUESTER"] },
  { documentType: "PettyCashRequest", requiredPermissionCode: permissions.financePettyCashApprove, allowedSourceStatuses: ["AWAITING_APPROVAL"], scopeSource: "fund.locationId", dueSource: "dueBy", prohibitedActorSources: ["requestedByUserId:REQUESTER"] },
  { documentType: "PaymentRequest", requiredPermissionCode: permissions.financePaymentRequestApprove, allowedSourceStatuses: ["AWAITING_APPROVAL"], scopeSource: "locationId", dueSource: "NONE", prohibitedActorSources: ["requestedByUserId:REQUESTER"] },
  { documentType: "PaymentRelease", requiredPermissionCode: permissions.financePaymentRelease, allowedSourceStatuses: ["DRAFT"], scopeSource: "locationId", dueSource: "scheduledAt", prohibitedActorSources: ["paymentRequest.approvedByUserId:PRIOR_APPROVER", "paymentRequest.requestedByUserId:REQUESTER", "createdByUserId:PREPARER"] },
  { documentType: "EmployeeLeaveRequest", requiredPermissionCode: permissions.workforceLeaveApprove, allowedSourceStatuses: ["SUBMITTED", "UNDER_REVIEW"], scopeSource: "locationId", dueSource: "startDate", prohibitedActorSources: ["requestedByUserId:REQUESTER"] },
  { documentType: "EmployeeOvertimeRecord", requiredPermissionCode: permissions.workforceOvertimeApprove, allowedSourceStatuses: ["SUBMITTED", "UNDER_REVIEW"], scopeSource: "locationId", dueSource: "workedStartAt", prohibitedActorSources: ["requestedByUserId:REQUESTER"] },
  { documentType: "WorkforceSchedule", requiredPermissionCode: permissions.workforceScheduleManage, allowedSourceStatuses: ["SUBMITTED", "UNDER_REVIEW"], scopeSource: "locationId", dueSource: "scheduleDate", prohibitedActorSources: ["createdByUserId:CREATOR", "submittedByUserId:SUBMITTER"] },
  { documentType: "AttendanceImportBatch", requiredPermissionCode: permissions.workforceAttendanceImportManage, allowedSourceStatuses: ["VALIDATING"], scopeSource: "locationId", dueSource: "NONE", prohibitedActorSources: ["createdByUserId:CREATOR", "reviewedByUserId:REVIEWER"] },
] as const;

export const approvalRoutingPolicies = Object.freeze(
  Object.fromEntries(policyList.map((policy) => [policy.documentType, policy])) as
    Record<SupportedApprovalDocumentType, ApprovalRoutingPolicy>,
);

export function isSupportedApprovalDocumentType(
  value: string,
): value is SupportedApprovalDocumentType {
  return Object.hasOwn(approvalRoutingPolicies, value);
}

export function getApprovalRoutingPolicy(
  documentType: SupportedApprovalDocumentType,
) {
  return approvalRoutingPolicies[documentType];
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

export function approvalRoutingDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export const APPROVAL_ROUTING_MAPPING_HASH = approvalRoutingDigest({
  mappingVersion: APPROVAL_ROUTING_MAPPING_VERSION,
  policies: policyList,
});
