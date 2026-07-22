import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPettyCashExceptionRows,
  buildPettyCashFundRows,
  buildPettyCashReportRows
} from "./pettyCash";

const serviceSource = readFileSync(
  path.resolve(__dirname, "pettyCash.ts"),
  "utf8"
);
const pageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/finance/petty-cash/page.tsx"),
  "utf8"
);
const schemaSource = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/schema.prisma"
  ),
  "utf8"
);

describe("petty cash foundation", () => {
  it("builds scoped fund rows with balance and open-cycle counts", () => {
    const rows = buildPettyCashFundRows([
      {
        id: "fund-1",
        publicReference: "PCF-001",
        code: "PC-SMN",
        name: "SM North Edsa Petty Cash",
        status: "ACTIVE",
        currentBalancePhp: 4500,
        targetBalancePhp: 15000,
        lowBalanceAlertPhp: 5000,
        evidenceReference: "EV-PCF-001",
        location: { name: "Yakiniku Like SM North Edsa" },
        custodian: { displayName: "Bianca Reyes" },
        requests: [
          { id: "request-1", status: "AWAITING_APPROVAL" },
          { id: "request-2", status: "CLOSED" }
        ],
        liquidations: [{ id: "liquidation-1", status: "UNDER_REVIEW" }],
        ledgerEntries: [{ id: "ledger-1" }, { id: "ledger-2" }]
      }
    ]);

    expect(rows[0]?.currentBalancePhp).toBe(4500);
    expect(rows[0]?.targetBalancePhp).toBe(15000);
    expect(rows[0]?.availableToTargetPhp).toBe(10500);
    expect(rows[0]?.openRequestCount).toBe(1);
    expect(rows[0]?.openLiquidationCount).toBe(1);
    expect(rows[0]?.ledgerEntryCount).toBe(2);
  });

  it("keeps petty cash permissioned, scoped, and non-posting", () => {
    expect(serviceSource).toContain("requirePermission");
    expect(serviceSource).toContain("permissions.financePettyCashView");
    expect(serviceSource).toContain("authorizedLocationIds");
    expect(pageSource).toContain("Petty cash is custody control, not GL posting");
    expect(serviceSource).not.toContain("paymentRelease.create");
    expect(serviceSource).not.toContain("bankAccount.update");
    expect(serviceSource).not.toContain("cashAdvanceRequest.update");
    expect(serviceSource).not.toContain("financeJournal.create");
    expect(serviceSource).not.toContain("bankReconciliation.create");
  });

  it("builds export-ready petty cash report rows without posting side effects", () => {
    const rows = buildPettyCashFundRows([
      {
        id: "fund-1",
        publicReference: "PCF-001",
        code: "PC-SMN",
        name: "SM North Edsa Petty Cash",
        status: "ACTIVE",
        currentBalancePhp: 4500,
        targetBalancePhp: 15000,
        lowBalanceAlertPhp: 5000,
        evidenceReference: null,
        location: { name: "Yakiniku Like SM North Edsa" },
        custodian: { displayName: "Bianca Reyes" },
        requests: [{ id: "request-1", status: "AWAITING_APPROVAL" }],
        liquidations: [{ id: "liquidation-1", status: "UNDER_REVIEW" }],
        ledgerEntries: [{ id: "ledger-1" }, { id: "ledger-2" }]
      }
    ]);
    const reportRows = buildPettyCashReportRows(rows);

    expect(reportRows[0]).toMatchObject({
      publicReference: "PCF-001",
      balanceState: "LOW_BALANCE",
      evidenceState: "MISSING",
      openRequestCount: 1,
      openLiquidationCount: 1,
      ledgerEntryCount: 2
    });
    expect(reportRows[0]?.exportSafeSummary).toContain("PCF-001");
  });

  it("builds petty-cash exception rows for low balance, open cycles, and evidence gaps", () => {
    const rows = buildPettyCashFundRows([
      {
        id: "fund-1",
        publicReference: "PCF-001",
        code: "PC-SMN",
        name: "SM North Edsa Petty Cash",
        status: "ACTIVE",
        currentBalancePhp: 4500,
        targetBalancePhp: 15000,
        lowBalanceAlertPhp: 5000,
        evidenceReference: null,
        location: { name: "Yakiniku Like SM North Edsa" },
        custodian: { displayName: "Bianca Reyes" },
        requests: [{ id: "request-1", status: "AWAITING_APPROVAL" }],
        liquidations: [{ id: "liquidation-1", status: "UNDER_REVIEW" }],
        ledgerEntries: [{ id: "ledger-1" }]
      }
    ]);
    const exceptionRows = buildPettyCashExceptionRows(
      buildPettyCashReportRows(rows)
    );

    expect(exceptionRows).toHaveLength(4);
    expect(exceptionRows.map((row) => row.issueType)).toEqual([
      "LOW_BALANCE",
      "OPEN_LIQUIDATIONS",
      "OPEN_REQUESTS",
      "MISSING_EVIDENCE"
    ]);
    expect(exceptionRows[0]).toMatchObject({
      severity: "HIGH",
      amountPhp: 10500,
      nextAction:
        "Review open cycles, then create or approve a replenishment request if still needed."
    });
  });

  it("defines controlled petty-cash request lifecycle actions with SoD and audit", () => {
    expect(serviceSource).toContain("createPettyCashFund");
    expect(serviceSource).toContain("nextPettyCashFundReference");
    expect(serviceSource).toContain("petty_cash.fund_created");
    expect(serviceSource).toContain('entryType: "OPENING"');
    expect(serviceSource).toContain("activatePettyCashFund");
    expect(serviceSource).toContain("createPettyCashRequest");
    expect(serviceSource).toContain("submitPettyCashRequest");
    expect(serviceSource).toContain("findPettyCashApprovalRule");
    expect(serviceSource).toContain('documentType: "PettyCashRequest"');
    expect(serviceSource).toContain("approvalInstance.create");
    expect(serviceSource).toContain("APPROVE_PETTY_CASH");
    expect(serviceSource).toContain("PETTY_CASH_APPROVAL_RULE_NOT_CONFIGURED");
    expect(serviceSource).toContain("PETTY_CASH_ALREADY_SUBMITTED");
    expect(serviceSource).toContain("configureApprovalStepRouting");
    expect(serviceSource).not.toContain("resolveScopedNotificationRecipients");
    expect(serviceSource).toContain("approvePettyCashRequest");
    expect(serviceSource).toContain("returnPettyCashRequestForRevision");
    expect(serviceSource).toContain("rejectPettyCashRequest");
    expect(serviceSource).toContain("cancelPettyCashRequest");
    expect(serviceSource).toContain("PETTY_CASH_REQUEST_SELF_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("writePettyCashAudit");
    expect(serviceSource).toContain("petty_cash.request_approved");
  });

  it("posts only immutable petty-cash ledger markers for offline fulfillment", () => {
    expect(serviceSource).toContain("fulfillPettyCashRequestOffline");
    expect(serviceSource).toContain("voidPettyCashFulfillment");
    expect(serviceSource).toContain('entryType: isReplenishment ? "REPLENISHMENT" : "ISSUE"');
    expect(serviceSource).toContain('entryType: "REVERSAL"');
    expect(serviceSource).toContain("balanceBeforePhp");
    expect(serviceSource).toContain("balanceAfterPhp");
    expect(serviceSource).toContain("PETTY_CASH_FULFILLMENT_INSUFFICIENT_FUND_BALANCE");
    expect(serviceSource).toContain("PETTY_CASH_VOID_INSUFFICIENT_FUND_BALANCE");
    expect(serviceSource).toContain("PETTY_CASH_FULFILLER_APPROVER_SEGREGATION_REQUIRED");
    expect(serviceSource).toContain("petty_cash.request_fulfillment_voided");
    expect(serviceSource).toContain("voidedByUserId");
    expect(serviceSource).toContain("sourceEventKey");
    expect(serviceSource).toContain("noBankMutation");
    expect(pageSource).toContain("Void Movement");
  });

  it("creates source-linked petty-cash disbursement handoffs without settlement side effects", () => {
    expect(schemaSource).toContain("pettyCashRequestId   String?");
    expect(schemaSource).toContain("pettyCashRequest     PettyCashRequest?");
    expect(schemaSource).toMatch(
      /disbursementRequests\s+NonSupplierDisbursementRequest\[\]/,
    );
    expect(serviceSource).toContain("createPettyCashDisbursementHandoff");
    expect(serviceSource).toContain("permissions.financeDisbursementCreate");
    expect(serviceSource).toContain("financePayee.upsert");
    expect(serviceSource).toContain("nonSupplierDisbursementRequest.create");
    expect(serviceSource).toContain('sourceType: "PETTY_CASH"');
    expect(serviceSource).toContain("petty_cash.disbursement_handoff_created");
    expect(serviceSource).toContain("noPettyCashLedgerMutation");
    expect(pageSource).toContain("Create Draft Disbursement");
    expect(pageSource).toContain("createPettyCashDisbursementHandoff");
    expect(pageSource).toContain("disbursementHandoffReference");
    expect(serviceSource).not.toContain("paymentRelease.create");
    expect(serviceSource).not.toContain("journalEntry.create");
    expect(serviceSource).not.toContain("bankTransaction.create");
  });

  it("controls liquidation submit/review/close without payment, bank, or journal side effects", () => {
    expect(serviceSource).toContain("submitPettyCashLiquidation");
    expect(serviceSource).toContain("PETTY_CASH_LIQUIDATION_LINE_LIMIT_EXCEEDED");
    expect(serviceSource).toContain("approvePettyCashLiquidation");
    expect(serviceSource).toContain("returnPettyCashLiquidationForRevision");
    expect(serviceSource).toContain("rejectPettyCashLiquidation");
    expect(serviceSource).toContain("cancelPettyCashLiquidation");
    expect(serviceSource).toContain("reversePettyCashLiquidation");
    expect(serviceSource).toContain("closePettyCashLiquidation");
    expect(serviceSource).toContain("PETTY_CASH_LIQUIDATION_SELF_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("PETTY_CASH_LIQUIDATION_CLOSE_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PETTY_CASH_LIQUIDATION_REVERSAL_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PETTY_CASH_LIQUIDATION_SETTLEMENT_REQUIRED");
    expect(serviceSource).toContain("PETTY_CASH_LIQUIDATION_VARIANCE_REASON_REQUIRED");
    expect(serviceSource).toContain("PETTY_CASH_LIQUIDATION_VARIANCE_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PETTY_CASH_LIQUIDATION_VARIANCE_CONFLICT");
    expect(serviceSource).toContain('entryType: "LIQUIDATION_SETTLEMENT"');
    expect(serviceSource).toContain("petty_cash.liquidation_reversed");
    expect(serviceSource).toContain("Custody review marker only");
    expect(serviceSource).toContain("settlementLedgerEntryId");
    expect(pageSource).toContain("Variance policy");
    expect(pageSource).toContain("Variance decision");
    expect(pageSource).toContain("No variance");
    expect(pageSource).toContain("Shortage amount");
    expect(pageSource).toContain("Overage amount");
    expect(pageSource).toContain("Reverse");
    expect(serviceSource).not.toContain("paymentRequest.update");
    expect(serviceSource).not.toContain("bankTransaction.create");
    expect(serviceSource).not.toContain("journalEntry.create");
  });

  it("exposes petty-cash workflow action queues on the dashboard UI", () => {
    expect(serviceSource).toContain("PettyCashRequestWorkflowRow");
    expect(serviceSource).toContain("PettyCashLiquidationWorkflowRow");
    expect(serviceSource).toContain("PettyCashReportRow");
    expect(serviceSource).toContain("PettyCashExceptionRow");
    expect(serviceSource).toContain("buildPettyCashReportRows");
    expect(serviceSource).toContain("buildPettyCashExceptionRows");
    expect(serviceSource).toContain("exportSafeSummary");
    expect(serviceSource).toContain("resolvePettyCashRequestActions");
    expect(serviceSource).toContain("resolvePettyCashLiquidationActions");
    expect(pageSource).toContain("runPettyCashRequestAction");
    expect(pageSource).toContain("runPettyCashLiquidationAction");
    expect(pageSource).toContain("Petty Cash Request Actions");
    expect(pageSource).toContain("Petty Cash Liquidation Actions");
    expect(pageSource).toContain("Petty Cash Exception Queue");
    expect(pageSource).toContain("Petty Cash Report Preview");
    expect(pageSource).toContain("dashboard.reportRows");
    expect(pageSource).toContain("dashboard.exceptionRows");
  });

  it("exposes bounded petty-cash entry controls without payment or journal posting", () => {
    expect(serviceSource).toContain("PettyCashDraftOption");
    expect(serviceSource).toContain("draftOptions");
    expect(serviceSource).toContain("locations:");
    expect(serviceSource).toContain("custodians:");
    expect(serviceSource).toContain("pettyCashCategoryOptions");
    expect(serviceSource).toContain("nextPettyCashFundReference");
    expect(serviceSource).toContain("nextPettyCashRequestReference");
    expect(serviceSource).toContain("nextPettyCashLiquidationReference");
    expect(pageSource).toContain("runPettyCashFundCreateAction");
    expect(pageSource).toContain("runPettyCashRequestCreateAction");
    expect(pageSource).toContain("runPettyCashLiquidationSubmitAction");
    expect(pageSource).toContain("Set Up Petty Cash Fund");
    expect(pageSource).toContain("Create Petty Cash Fund");
    expect(pageSource).toContain("Create Petty Cash Request");
    expect(pageSource).toContain("Create Draft Petty Cash Request");
    expect(pageSource).toContain("Submit Petty Cash Liquidation");
    expect(pageSource).toContain("Liquidation lines");
    expect(pageSource).toContain("description_");
    expect(pageSource).toContain("amountPhp_");
    expect(pageSource).toContain("canCreatePettyCashRequest");
    expect(pageSource).toContain("canSubmitPettyCashLiquidation");
    expect(pageSource).toContain("Multi-line entry");
    expect(serviceSource).not.toContain("paymentRelease.create");
    expect(serviceSource).not.toContain("paymentRequest.create");
    expect(serviceSource).not.toContain("journalEntry.create");
    expect(serviceSource).not.toContain("bankTransaction.create");
  });

  it("exposes petty-cash controlled evidence panels without source mutation", () => {
    expect(pageSource).toContain("listControlledEvidenceAttachments");
    expect(pageSource).toContain("ControlledEvidencePanel");
    expect(pageSource).not.toContain("createControlledEvidenceAttachmentMetadataLink");
    expect(pageSource).not.toContain("createControlledEvidenceAttachmentUploadLink");
    expect(pageSource).toContain("archiveControlledEvidenceAttachment");
    expect(pageSource).toContain("PETTY_CASH_FUND");
    expect(pageSource).toContain("PETTY_CASH_REQUEST");
    expect(pageSource).toContain("PETTY_CASH_LIQUIDATION");
    expect(pageSource).toContain("Add Fund Evidence");
    expect(pageSource).toContain("Add Request Evidence");
    expect(pageSource).toContain("Add Liquidation Evidence");
    expect(pageSource).toContain("archivePettyCashEvidenceMetadata");
    expect(pageSource).not.toContain('name="objectKey"');
    expect(pageSource).not.toContain('name="storageProvider"');
    expect(pageSource).not.toContain("Binary upload");
    expect(pageSource).not.toContain("P3-BLOCK-002");
    expect(pageSource).not.toContain("Save Evidence Metadata");
    expect(pageSource).toContain("permissions.financePettyCashCreate");
    expect(pageSource).toContain("permissions.financePettyCashLiquidate");
    expect(pageSource).not.toContain("createPaymentRequest(");
    expect(pageSource).not.toContain("createPaymentRelease(");
    expect(pageSource).not.toContain("journalEntry.create");
  });
});
