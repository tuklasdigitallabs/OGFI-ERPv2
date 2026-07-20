import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCashAdvanceDisbursementRows,
  buildCashAdvanceLiquidationRows,
  buildCashAdvanceReportRows,
  buildCashAdvanceRows
} from "./cashAdvances";

const serviceSource = readFileSync(
  path.resolve(__dirname, "cashAdvances.ts"),
  "utf8"
);
const pageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/finance/cash-advances/page.tsx"),
  "utf8"
);

describe("cash advance foundation", () => {
  it("builds scoped cash advance rows with outstanding liquidation math", () => {
    const rows = buildCashAdvanceRows([
      {
        id: "cash-advance-1",
        publicReference: "CA-001",
        title: "Emergency store repair advance",
        status: "RELEASED_OFFLINE",
        sourceType: "STANDALONE",
        budgetStatus: "BUDGETED",
        requestDate: new Date("2026-07-07T00:00:00.000Z"),
        dueDate: new Date("2026-07-12T00:00:00.000Z"),
        requestedAmountPhp: 10000,
        issuedAmountPhp: 10000,
        liquidatedAmountPhp: 6500,
        categoryCode: "REPAIRS",
        evidenceReference: "EV-CA-001",
        requestedBy: { displayName: "Bianca Reyes" },
        beneficiary: { displayName: "Paolo Cruz" },
        location: { name: "Yakiniku Like SM North Edsa" },
        supplier: null,
        movements: [{ id: "movement-1" }, { id: "movement-2" }],
        liquidations: [{ id: "liquidation-1" }]
      }
    ]);

    expect(rows[0]?.requestedAmountPhp).toBe(10000);
    expect(rows[0]?.issuedAmountPhp).toBe(10000);
    expect(rows[0]?.liquidatedAmountPhp).toBe(6500);
    expect(rows[0]?.outstandingAmountPhp).toBe(3500);
    expect(rows[0]?.movementCount).toBe(2);
    expect(rows[0]?.liquidationCount).toBe(1);
    expect(rows[0]?.payeeType).toBe("EMPLOYEE_OR_CUSTODIAN");
    expect(rows[0]?.payeeLabel).toBe("Paolo Cruz");
    expect(rows[0]?.paymentHandoffReadiness).toBe(
      "PAYEE_IDENTIFIED_NO_SETTLEMENT"
    );
  });

  it("keeps cash advances permissioned, scoped, and non-posting", () => {
    expect(serviceSource).toContain("requirePermission");
    expect(serviceSource).toContain("permissions.financeCashAdvanceView");
    expect(serviceSource).toContain("authorizedLocationIds");
    expect(pageSource).toContain("Cash advances stop before payment and posting");
    expect(pageSource).toContain("paymentHandoffReadiness");
    expect(pageSource).toContain("Payee");
    expect(pageSource).toContain("Create Disbursement Handoff");
    expect(pageSource).toContain("Non-supplier Disbursement Handoffs");
    expect(serviceSource).not.toContain("paymentRelease.create");
    expect(serviceSource).not.toContain("paymentRequest.update");
    expect(serviceSource).not.toContain("financeJournal.create");
    expect(serviceSource).not.toContain("bankReconciliation.create");
  });

  it("builds export-ready cash advance report rows without posting side effects", () => {
    const rows = buildCashAdvanceRows([
      {
        id: "cash-advance-1",
        publicReference: "CA-001",
        title: "Emergency store repair advance",
        status: "RELEASED_OFFLINE",
        sourceType: "STANDALONE",
        budgetStatus: "BUDGETED",
        requestDate: new Date("2026-07-07T00:00:00.000Z"),
        dueDate: new Date("2026-07-12T00:00:00.000Z"),
        requestedAmountPhp: 10000,
        issuedAmountPhp: 10000,
        liquidatedAmountPhp: 6500,
        categoryCode: "REPAIRS",
        evidenceReference: null,
        requestedBy: { displayName: "Bianca Reyes" },
        beneficiary: { displayName: "Paolo Cruz" },
        location: { name: "Yakiniku Like SM North Edsa" },
        supplier: null,
        movements: [{ id: "movement-1" }, { id: "movement-2" }],
        liquidations: [{ id: "liquidation-1" }]
      }
    ]);
    const reportRows = buildCashAdvanceReportRows(rows);

    expect(reportRows[0]).toMatchObject({
      publicReference: "CA-001",
      outstandingAmountPhp: 3500,
      evidenceState: "MISSING",
      evidenceCaptureMode: "MISSING",
      evidenceProductionReadiness: "NEEDS_EVIDENCE_REFERENCE",
      payeeType: "EMPLOYEE_OR_CUSTODIAN",
      payeeLabel: "Paolo Cruz",
      paymentHandoffReadiness: "PAYEE_IDENTIFIED_NO_SETTLEMENT",
      movementCount: 2,
      liquidationCount: 1
    });
    expect(reportRows[0]?.exportSafeSummary).toContain("CA-001");
    expect(reportRows[0]?.exportSafeSummary).toContain(
      "PAYEE_IDENTIFIED_NO_SETTLEMENT"
    );
  });

  it("flags cash advances that still need explicit payee classification", () => {
    const rows = buildCashAdvanceRows([
      {
        id: "cash-advance-2",
        publicReference: "CA-002",
        title: "Unclassified advance",
        status: "DRAFT",
        sourceType: "STANDALONE",
        budgetStatus: "BUDGETED",
        requestDate: new Date("2026-07-07T00:00:00.000Z"),
        dueDate: null,
        requestedAmountPhp: 5000,
        issuedAmountPhp: 0,
        liquidatedAmountPhp: 0,
        categoryCode: "OPERATIONS",
        evidenceReference: null,
        requestedBy: { displayName: "" },
        beneficiary: null,
        location: { name: "Yakiniku Like SM North Edsa" },
        supplier: null,
        movements: [],
        liquidations: []
      }
    ]);

    expect(rows[0]).toMatchObject({
      payeeType: "UNCLASSIFIED",
      payeeLabel: "Needs payee classification",
      paymentHandoffReadiness: "NEEDS_PAYEE_CLASSIFICATION"
    });
  });

  it("defines controlled request lifecycle actions with approval segregation and audit", () => {
    expect(serviceSource).toContain("submitCashAdvanceForApproval");
    expect(serviceSource).toContain("findCashAdvanceApprovalRule");
    expect(serviceSource).toContain('documentType: "CashAdvanceRequest"');
    expect(serviceSource).toContain("approvalInstance.create");
    expect(serviceSource).toContain("APPROVE_CASH_ADVANCE");
    expect(serviceSource).toContain("CASH_ADVANCE_APPROVAL_RULE_NOT_CONFIGURED");
    expect(serviceSource).toContain("CASH_ADVANCE_ALREADY_SUBMITTED");
    expect(serviceSource).toContain("resolveScopedNotificationRecipients");
    expect(serviceSource).toContain("approveCashAdvanceRequest");
    expect(serviceSource).toContain("returnCashAdvanceForRevision");
    expect(serviceSource).toContain("rejectCashAdvanceRequest");
    expect(serviceSource).toContain("cancelCashAdvanceRequest");
    expect(serviceSource).toContain("CASH_ADVANCE_SELF_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("writeCashAdvanceAudit");
    expect(serviceSource).toContain("cash_advance.approved");
  });

  it("keeps issue and liquidation posting inside cash-advance movement exposure only", () => {
    expect(serviceSource).toContain("issueCashAdvanceOffline");
    expect(serviceSource).toContain("submitCashAdvanceLiquidation");
    expect(serviceSource).toContain("CASH_ADVANCE_LIQUIDATION_LINE_LIMIT_EXCEEDED");
    expect(serviceSource).toContain("approveCashAdvanceLiquidation");
    expect(serviceSource).toContain("markCashAdvanceLiquidationClosureReady");
    expect(serviceSource).toContain("closeCashAdvanceLiquidation");
    expect(serviceSource).toContain("voidCashAdvanceOfflineIssue");
    expect(serviceSource).toContain("reverseCashAdvanceLiquidation");
    expect(serviceSource).toContain('movementType: "ISSUE"');
    expect(serviceSource).toContain('movementType: "LIQUIDATION_SETTLEMENT"');
    expect(serviceSource).toContain('movementType: "REVERSAL"');
    expect(serviceSource).toContain("CASH_ADVANCE_ISSUE_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("CASH_ADVANCE_VOID_ISSUE_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain(
      "CASH_ADVANCE_VOID_ISSUE_REQUIRES_LIQUIDATION_REVERSAL"
    );
    expect(serviceSource).toContain(
      "CASH_ADVANCE_LIQUIDATION_APPROVAL_EVIDENCE_REQUIRED"
    );
    expect(serviceSource).toContain(
      "CASH_ADVANCE_LIQUIDATION_CLOSURE_READY_EVIDENCE_REQUIRED"
    );
    expect(serviceSource).toContain(
      "CASH_ADVANCE_LIQUIDATION_SETTLEMENT_REQUIRED"
    );
    expect(serviceSource).toContain(
      "CASH_ADVANCE_LIQUIDATION_REVERSAL_EVIDENCE_REQUIRED"
    );
    expect(serviceSource).toContain("cash_advance.issue_voided");
    expect(serviceSource).toContain("cash_advance.liquidation_closure_ready");
    expect(serviceSource).toContain("cash_advance.liquidation_closed");
    expect(serviceSource).toContain("cash_advance.liquidation_reversed");
    expect(serviceSource).toContain("closureReadinessOnlyNoPaymentMutation");
    expect(serviceSource).toContain("buildCashAdvanceLiquidationRows");
    expect(serviceSource).toContain("CashAdvanceReportRow");
    expect(serviceSource).toContain("buildCashAdvanceReportRows");
    expect(serviceSource).toContain("exportSafeSummary");
    expect(serviceSource).toContain("resolveLiquidationAllowedActions");
    expect(serviceSource).toContain("nextCashAdvanceLiquidationReference");
    expect(pageSource).toContain("runCashAdvanceAction");
    expect(pageSource).toContain("runCashAdvanceLiquidationSubmitAction");
    expect(pageSource).toContain("Liquidation lines");
    expect(pageSource).toContain("description_");
    expect(pageSource).toContain("amountPhp_");
    expect(pageSource).toContain("runCashAdvanceLiquidationAction");
    expect(pageSource).toContain("Submit Cash Advance Liquidation");
    expect(pageSource).toContain("Liquidation Actions");
    expect(pageSource).toContain("Cash Advance Report Preview");
    expect(pageSource).toContain("dashboard.reportRows");
    expect(pageSource).toContain("Recovery & Evidence Exceptions");
    expect(pageSource).toContain("recoveryExceptionRows");
    expect(serviceSource).toContain("getCashAdvanceRecoveryPolicy");
    expect(serviceSource).toContain("recoveryPolicy");
    expect(pageSource).toContain("Recovery policy");
    expect(pageSource).toContain("dueSoonDays");
    expect(pageSource).toContain("overdueEscalationDays");
    expect(pageSource).toContain("Cash Advance Actions");
    expect(pageSource).toContain("allowedCashAdvanceActions");
    expect(pageSource).toContain("issueCashAdvanceOffline");
    expect(pageSource).toContain("voidCashAdvanceOfflineIssue");
    expect(pageSource).toContain("Void Issue");
    expect(pageSource).toContain("markCashAdvanceLiquidationClosureReady");
    expect(pageSource).toContain("reverseCashAdvanceLiquidation");
    expect(pageSource).toContain("Reverse");
    expect(pageSource).toContain("closeCashAdvanceLiquidation");
    expect(serviceSource).toContain("sourceEventKey");
    expect(serviceSource).toContain("noBankMutation");
  });

  it("exposes cash-advance evidence metadata links without source mutation", () => {
    expect(pageSource).toContain("listControlledEvidenceAttachments");
    expect(pageSource).toContain("createControlledEvidenceAttachmentMetadataLink");
    expect(pageSource).toContain("archiveControlledEvidenceAttachment");
    expect(pageSource).toContain("CASH_ADVANCE_REQUEST");
    expect(pageSource).toContain("CASH_ADVANCE_LIQUIDATION");
    expect(pageSource).toContain("Add Advance Evidence");
    expect(pageSource).toContain("Add Liquidation Evidence");
    expect(pageSource).toContain("archiveCashAdvanceEvidenceMetadata");
    expect(pageSource).toContain("Archive Evidence Link");
    expect(pageSource).toContain("createControlledEvidenceAttachmentUploadLink");
    expect(pageSource).toContain('name="evidenceFile"');
    expect(pageSource).toContain("/evidence/${attachment.id}/download");
    expect(pageSource).toContain("Upload Evidence");
    expect(pageSource).toContain("metadata-only evidence");
    expect(pageSource).toContain("evidence link");
    expect(pageSource).toContain("permissions.financeCashAdvanceCreate");
    expect(pageSource).toContain("permissions.financeCashAdvanceLiquidate");
    expect(pageSource).not.toContain("createPaymentRequest(");
    expect(pageSource).not.toContain("createPaymentRelease(");
    expect(pageSource).not.toContain("journalEntry.create");
  });

  it("creates controlled non-supplier disbursement handoffs without supplier AP, bank, or journal mutation", () => {
    const rows = buildCashAdvanceDisbursementRows([
      {
        id: "disb-1",
        cashAdvanceRequestId: "advance-1",
        publicReference: "DISB-2026-00001",
        status: "DRAFT",
        sourceType: "CASH_ADVANCE",
        amountPhp: 10000,
        evidenceReference: "EV-DISB-001",
        createdAt: new Date("2026-07-08T00:00:00.000Z"),
        payee: {
          payeeType: "USER_CUSTODIAN",
          displayName: "Paolo Cruz"
        },
        location: { name: "Yakiniku Like SM North Edsa" },
        requestedBy: { displayName: "Nico Valdez" },
        cashAdvanceRequest: { publicReference: "CA-001" }
      }
    ]);

    expect(rows[0]).toMatchObject({
      publicReference: "DISB-2026-00001",
      cashAdvanceReference: "CA-001",
      sourceType: "CASH_ADVANCE",
      payeeLabel: "Paolo Cruz",
      payeeType: "USER_CUSTODIAN",
      amountPhp: 10000,
      evidenceReference: "EV-DISB-001"
    });
    expect(serviceSource).toContain("createCashAdvanceDisbursementHandoff");
    expect(serviceSource).toContain("permissions.financeDisbursementCreate");
    expect(serviceSource).toContain("financePayee.upsert");
    expect(serviceSource).toContain("nonSupplierDisbursementRequest.create");
    expect(serviceSource).toContain(
      "CASH_ADVANCE_SUPPLIER_PAYEE_USE_AP_PAYMENT_REQUEST"
    );
    expect(serviceSource).toContain(
      "cash_advance.disbursement_handoff_created"
    );
    expect(serviceSource).toContain("nonSupplierDisbursementRequestCreated");
    expect(serviceSource).toContain("noSupplierApPaymentRequest");
    expect(serviceSource).toContain("noPaymentRelease");
    expect(serviceSource).toContain("noBankMutation");
    expect(serviceSource).toContain("noJournalPosting");
    expect(pageSource).toContain("P3-BLOCK-001");
    expect(pageSource).toContain("runCashAdvanceDisbursementHandoffAction");
    expect(pageSource).toContain("disbursementEligibleAdvances");
    expect(pageSource).toContain("dashboard.disbursementRequests");
    expect(pageSource).toContain("disbursement request only");
    expect(pageSource).not.toContain("createPaymentRequest(");
    expect(pageSource).not.toContain("createPaymentRelease(");
  });

  it("derives liquidation action availability without self-approval hints", () => {
    const rows = buildCashAdvanceLiquidationRows({
      currentUserId: "reviewer-1",
      permissions: {
        canLiquidate: true,
        canReviewLiquidation: true
      },
      liquidations: [
        {
          id: "liq-1",
          cashAdvanceRequestId: "advance-1",
          publicReference: "CA-LIQ-001",
          status: "SUBMITTED",
          claimedAmountPhp: 2500,
          approvedAmountPhp: 0,
          amountReturnedPhp: 0,
          evidenceReference: "EV-LIQ-001",
          submittedAt: new Date("2026-07-08T00:00:00.000Z"),
          submittedByUserId: "requester-1",
          submittedBy: { displayName: "Bianca Reyes" },
          location: { name: "Yakiniku Like SM North Edsa" },
          lines: [{ id: "line-1" }],
          cashAdvanceRequest: {
            publicReference: "CA-001",
            title: "Emergency repair advance"
          }
        },
        {
          id: "liq-3",
          cashAdvanceRequestId: "advance-3",
          publicReference: "CA-LIQ-003",
          status: "APPROVED",
          claimedAmountPhp: 1000,
          approvedAmountPhp: 1000,
          amountReturnedPhp: 0,
          evidenceReference: "EV-LIQ-003",
          submittedAt: new Date("2026-07-08T00:00:00.000Z"),
          submittedByUserId: "requester-1",
          submittedBy: { displayName: "Bianca Reyes" },
          location: { name: "Yakiniku Like SM North Edsa" },
          lines: [{ id: "line-1" }],
          cashAdvanceRequest: {
            publicReference: "CA-003",
            title: "Store operations advance"
          }
        },
        {
          id: "liq-2",
          cashAdvanceRequestId: "advance-2",
          publicReference: "CA-LIQ-002",
          status: "SUBMITTED",
          claimedAmountPhp: 1000,
          approvedAmountPhp: 0,
          amountReturnedPhp: 0,
          evidenceReference: "EV-LIQ-002",
          submittedAt: null,
          submittedByUserId: "reviewer-1",
          submittedBy: { displayName: "Alyssa Tan" },
          location: { name: "Yakiniku Like SM North Edsa" },
          lines: [{ id: "line-1" }],
          cashAdvanceRequest: {
            publicReference: "CA-002",
            title: "Cleaning supplies advance"
          }
        }
      ]
    });

    expect(rows[0]?.allowedActions).toContain("approve_liquidation");
    expect(rows[0]?.allowedActions).toContain("cancel_liquidation");
    expect(rows[1]?.allowedActions).toContain("reverse_liquidation");
    expect(rows[2]?.allowedActions).not.toContain("approve_liquidation");
    expect(rows[2]?.allowedActions).toContain("cancel_liquidation");
  });

  it("blocks unsafe money-state transitions before real payment and accounting integration", () => {
    expect(serviceSource).toContain("CASH_ADVANCE_ISSUE_EXCEEDS_APPROVED_AMOUNT");
    expect(serviceSource).toContain(
      "CASH_ADVANCE_LIQUIDATION_EXCEEDS_OUTSTANDING"
    );
    expect(serviceSource).toContain("CASH_ADVANCE_CANCEL_REQUIRES_REVERSAL");
    expect(serviceSource).toContain("CASH_ADVANCE_CLOSE_OUTSTANDING_BALANCE");
    expect(serviceSource).not.toContain("journalEntry.create");
    expect(serviceSource).not.toContain("bankTransaction.create");
    expect(serviceSource).not.toContain("accountsPayable.create");
  });
});
