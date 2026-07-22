import { z } from "zod";
import type { SupportedApprovalDocumentType } from "./approvalRoutingRegistry";

export const canonicalApprovalDecisionCapabilities = {
  PurchaseRequest: ["APPROVE", "RETURN", "REJECT"],
  QuotationRecommendation: ["APPROVE", "RETURN", "REJECT"],
  PurchaseOrder: ["APPROVE", "RETURN", "REJECT"],
  PurchaseOrderBalanceClosure: ["APPROVE", "RETURN", "REJECT"],
  PurchaseOrderAmendment: ["APPROVE", "RETURN", "REJECT"],
  WastageReport: ["APPROVE", "RETURN", "REJECT"],
  StockAdjustment: ["APPROVE", "RETURN", "REJECT"],
  FinanceCloseRun: ["APPROVE", "REJECT"],
  BudgetRevision: ["APPROVE", "REJECT"],
  ExpenseRequest: ["APPROVE", "RETURN", "REJECT"],
  CashAdvanceRequest: ["APPROVE", "RETURN", "REJECT"],
  PettyCashRequest: ["APPROVE", "RETURN", "REJECT"],
  PaymentRequest: ["APPROVE", "RETURN", "REJECT"],
  PaymentRelease: ["APPROVE", "REJECT"],
  EmployeeLeaveRequest: ["APPROVE", "RETURN", "REJECT"],
  EmployeeOvertimeRecord: ["APPROVE", "REJECT"],
  WorkforceSchedule: ["APPROVE", "RETURN", "REJECT"],
  AttendanceImportBatch: ["APPROVE", "RETURN", "REJECT"],
} as const satisfies Record<
  SupportedApprovalDocumentType,
  readonly ("APPROVE" | "RETURN" | "REJECT")[]
>;

const simpleApproveFamilies = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
  "PurchaseOrderBalanceClosure",
  "PurchaseOrderAmendment",
  "WastageReport",
  "StockAdjustment",
  "FinanceCloseRun",
  "PaymentRequest",
  "PaymentRelease",
  "AttendanceImportBatch",
] as const;

const evidenceApproveFamilies = [
  "BudgetRevision",
  "CashAdvanceRequest",
  "ExpenseRequest",
  "EmployeeLeaveRequest",
  "EmployeeOvertimeRecord",
  "WorkforceSchedule",
] as const;

const simpleReturnFamilies = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
  "PurchaseOrderBalanceClosure",
  "PurchaseOrderAmendment",
  "WastageReport",
  "StockAdjustment",
  "PaymentRequest",
  "AttendanceImportBatch",
] as const;

const evidenceReturnFamilies = [
  "ExpenseRequest",
  "CashAdvanceRequest",
  "PettyCashRequest",
  "EmployeeLeaveRequest",
  "WorkforceSchedule",
] as const;

const simpleRejectFamilies = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
  "PurchaseOrderBalanceClosure",
  "PurchaseOrderAmendment",
  "WastageReport",
  "StockAdjustment",
  "FinanceCloseRun",
  "PaymentRequest",
  "PaymentRelease",
  "AttendanceImportBatch",
] as const;

const evidenceRejectFamilies = [
  "BudgetRevision",
  "ExpenseRequest",
  "CashAdvanceRequest",
  "PettyCashRequest",
  "EmployeeLeaveRequest",
  "EmployeeOvertimeRecord",
  "WorkforceSchedule",
] as const;

const baseDecisionSchema = z.object({
  approvalInstanceId: z.string().uuid(),
  remarks: z.string().max(1000).optional(),
}).strict();

const evidenceDecisionSchema = baseDecisionSchema.extend({
  evidenceReference: z.string().max(1000).optional(),
});

const requiredRemarksSchema = baseDecisionSchema.extend({
  remarks: z.string().min(3).max(1000),
});

const requiredRemarksWithEvidenceSchema = evidenceDecisionSchema.extend({
  remarks: z.string().min(3).max(1000),
});

const simpleApproveSchema = baseDecisionSchema.extend({
  family: z.enum(simpleApproveFamilies),
  decision: z.literal("APPROVE"),
});

const evidenceApproveSchema = evidenceDecisionSchema.extend({
  family: z.enum(evidenceApproveFamilies),
  decision: z.literal("APPROVE"),
});

const pettyCashApproveSchema = evidenceDecisionSchema.extend({
  family: z.literal("PettyCashRequest"),
  decision: z.literal("APPROVE"),
});

const simpleReturnSchema = requiredRemarksSchema.extend({
  family: z.enum(simpleReturnFamilies),
  decision: z.literal("RETURN"),
});

const evidenceReturnSchema = requiredRemarksWithEvidenceSchema.extend({
  family: z.enum(evidenceReturnFamilies),
  decision: z.literal("RETURN"),
});

const simpleRejectSchema = requiredRemarksSchema.extend({
  family: z.enum(simpleRejectFamilies),
  decision: z.literal("REJECT"),
});

const evidenceRejectSchema = requiredRemarksWithEvidenceSchema.extend({
  family: z.enum(evidenceRejectFamilies),
  decision: z.literal("REJECT"),
});

export const canonicalApprovalDecisionCommandSchema = z.union([
  simpleApproveSchema,
  evidenceApproveSchema,
  pettyCashApproveSchema,
  simpleReturnSchema,
  evidenceReturnSchema,
  simpleRejectSchema,
  evidenceRejectSchema,
]);

export type CanonicalApprovalDecisionCommand = z.infer<
  typeof canonicalApprovalDecisionCommandSchema
>;

export function parseCanonicalApprovalDecisionCommand(input: unknown) {
  return canonicalApprovalDecisionCommandSchema.parse(input);
}

export function approvalDecisionCommandToFormData(
  command: CanonicalApprovalDecisionCommand,
) {
  const formData = new FormData();
  formData.set("approvalInstanceId", command.approvalInstanceId);
  formData.set("documentType", command.family);
  if (command.remarks !== undefined) {
    formData.set("remarks", command.remarks);
  }
  if (
    "evidenceReference" in command &&
    command.evidenceReference !== undefined
  ) {
    formData.set("evidenceReference", command.evidenceReference);
  }
  return formData;
}
