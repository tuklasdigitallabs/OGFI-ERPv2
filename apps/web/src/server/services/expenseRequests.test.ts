import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildExpenseRequestApHandoffRows,
  buildExpenseRequestReportRows,
  buildExpenseRequestRows
} from "./expenseRequests";

const serviceSource = readFileSync(
  path.resolve(__dirname, "expenseRequests.ts"),
  "utf8"
);
const pageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/finance/expense-requests/page.tsx"),
  "utf8"
);
const prismaSchemaSource = readFileSync(
  path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
  "utf8"
);

describe("expense request foundation", () => {
  it("builds scoped queue rows without payment or posting side effects", () => {
    const rows = buildExpenseRequestRows([
      {
        id: "expense-1",
        publicReference: "EXP-001",
        title: "Emergency repair",
        status: "AWAITING_APPROVAL",
        urgency: "EMERGENCY",
        budgetStatus: "BUDGETED",
        requestDate: new Date("2026-07-07T00:00:00.000Z"),
        requiredByDate: new Date("2026-07-08T00:00:00.000Z"),
        totalRequestedAmount: 1000,
        settledAmount: 0,
        categoryCode: "REPAIRS",
        evidenceReference: "EV-001",
        requestedBy: { displayName: "Bianca Reyes" },
        location: { name: "Yakiniku Like SM North Edsa" },
        supplier: null,
        lines: [{ id: "line-1" }],
        sourceLinks: [{ id: "source-1" }]
      }
    ]);

    expect(rows[0]?.totalRequestedAmount).toBe(1000);
    expect(rows[0]?.settledAmount).toBe(0);
    expect(rows[0]?.lineCount).toBe(1);
    expect(rows[0]?.sourceLinkCount).toBe(1);
  });

  it("builds export-ready report rows without replacing source records", () => {
    const rows = buildExpenseRequestRows([
      {
        id: "expense-1",
        publicReference: "EXP-001",
        title: "Emergency repair",
        status: "AWAITING_APPROVAL",
        urgency: "EMERGENCY",
        budgetStatus: "OVER_BUDGET",
        requestDate: new Date("2026-07-07T00:00:00.000Z"),
        requiredByDate: new Date("2026-07-08T00:00:00.000Z"),
        totalRequestedAmount: 1000,
        settledAmount: 250,
        categoryCode: "REPAIRS",
        evidenceReference: null,
        requestedBy: { displayName: "Bianca Reyes" },
        location: { name: "Yakiniku Like SM North Edsa" },
        supplier: null,
        lines: [{ id: "line-1" }],
        sourceLinks: [{ id: "source-1" }]
      }
    ]);
    const reportRows = buildExpenseRequestReportRows(rows);

    expect(reportRows[0]).toMatchObject({
      publicReference: "EXP-001",
      budgetStatus: "OVER_BUDGET",
      outstandingAmount: 750,
      evidenceState: "MISSING",
      sourceLinkCount: 1
    });
    expect(reportRows[0]?.exportSafeSummary).toContain("EXP-001");
  });

  it("builds AP handoff queue rows from source links without payment effects", () => {
    const rows = buildExpenseRequestApHandoffRows([
      {
        id: "link-1",
        expenseRequestId: "expense-1",
        sourceDocumentId: "ap-1",
        sourceAmountSnapshotPhp: 1000,
        remainingAmountSnapshotPhp: 1000,
        sourceDocumentSnapshot: {
          publicReference: "AP-INV-2026-00001",
          supplierInvoiceNumber: "EXP-001",
          status: "DRAFT",
          boundary: "expense_to_ap_invoice_draft_only_no_payment_release_no_journal"
        },
        createdAt: new Date("2026-07-08T00:00:00.000Z"),
        createdBy: { displayName: "Nico Valdez" },
        expenseRequest: {
          publicReference: "EXP-001",
          title: "Emergency repair",
          location: { name: "Yakiniku Like SM North Edsa" },
          supplier: {
            tradingName: "Metro Packaging",
            legalName: "Metro Food Packaging Supplies"
          }
        }
      }
    ]);

    expect(rows[0]).toMatchObject({
      expenseReference: "EXP-001",
      apInvoiceReference: "AP-INV-2026-00001",
      supplierInvoiceNumber: "EXP-001",
      status: "DRAFT",
      amountPhp: 1000,
      remainingAmountPhp: 1000,
      supplierName: "Metro Packaging",
      boundary: "expense_to_ap_invoice_draft_only_no_payment_release_no_journal"
    });
  });

  it("keeps expense requests permissioned, scoped, and source-safe", () => {
    expect(serviceSource).toContain("requirePermission");
    expect(serviceSource).toContain("permissions.financeExpenseRequestView");
    expect(serviceSource).toContain("authorizedLocationIds");
    expect(pageSource).toContain("Expense requests stop before payment and posting");
    expect(pageSource).toContain("marked handoff-ready");
    expect(serviceSource).toContain("getExpenseRequestHandoffPolicy");
    expect(serviceSource).toContain("handoffPolicy");
    expect(pageSource).toContain("Handoff policy");
    expect(pageSource).toContain("requiredHandoffPath");
    expect(pageSource).toContain("settlementMutationAllowed");
    expect(serviceSource).toContain("submitExpenseRequestForApproval");
    expect(serviceSource).toContain("findExpenseRequestApprovalRule");
    expect(serviceSource).toContain('documentType: "ExpenseRequest"');
    expect(serviceSource).toContain("approvalInstance.create");
    expect(serviceSource).toContain("APPROVE_EXPENSE_REQUEST");
    expect(serviceSource).toContain("EXPENSE_REQUEST_APPROVAL_RULE_NOT_CONFIGURED");
    expect(serviceSource).toContain("EXPENSE_REQUEST_ALREADY_SUBMITTED");
    expect(serviceSource).toContain("resolveScopedNotificationRecipients");
    expect(serviceSource).toContain("approveExpenseRequest");
    expect(serviceSource).toContain("returnExpenseRequestForRevision");
    expect(serviceSource).toContain("rejectExpenseRequest");
    expect(serviceSource).toContain("cancelExpenseRequest");
    expect(serviceSource).toContain("completeExpenseRequest");
    expect(serviceSource).toContain("markExpenseRequestPaymentHandoffReady");
    expect(serviceSource).toContain("createExpenseRequestApInvoiceDraft");
    expect(serviceSource).toContain("ExpenseRequestReportRow");
    expect(serviceSource).toContain("buildExpenseRequestReportRows");
    expect(serviceSource).toContain("exportSafeSummary");
    expect(serviceSource).toContain("createDraftExpenseRequest");
    expect(serviceSource).toContain("CreateDraftExpenseRequestLineInput");
    expect(serviceSource).toContain("EXPENSE_REQUEST_LINE_LIMIT_EXCEEDED");
    expect(serviceSource).toContain("normalizedLines");
    expect(serviceSource).toContain("EXPENSE_REQUEST_TITLE_REQUIRED");
    expect(serviceSource).toContain("EXPENSE_REQUEST_LOCATION_REQUIRED");
    expect(serviceSource).toContain("EXPENSE_REQUEST_AMOUNT_REQUIRED");
    expect(serviceSource).toContain("EXPENSE_REQUEST_BUDGET_LINE_NOT_ACTIVE");
    expect(serviceSource).toContain("expense_request.created");
    expect(serviceSource).toContain("phase3_create_only");
    expect(serviceSource).toContain("nextExpenseReference");
    expect(pageSource).toContain("listControlledEvidenceAttachments");
    expect(pageSource).toContain("createControlledEvidenceAttachmentMetadataLink");
    expect(pageSource).toContain("createControlledEvidenceAttachmentUploadLink");
    expect(pageSource).toContain("archiveControlledEvidenceAttachment");
    expect(pageSource).toContain("Add Evidence Metadata");
    expect(pageSource).toContain("Upload Evidence");
    expect(pageSource).toContain('name="evidenceFile"');
    expect(pageSource).toContain("/evidence/${attachment.id}/download");
    expect(pageSource).toContain("archiveExpenseEvidenceMetadata");
    expect(pageSource).toContain("Archive Evidence Link");
    expect(pageSource).toContain('sourceType: "EXPENSE_REQUEST"');
    expect(pageSource).toContain("each");
    expect(pageSource).toContain("download is audited");
    expect(serviceSource).toContain("EXPENSE_REQUEST_SELF_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("EXPENSE_REQUEST_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("EXPENSE_REQUEST_AP_HANDOFF_SUPPLIER_REQUIRED");
    expect(serviceSource).toContain("EXPENSE_REQUEST_HANDOFF_SELF_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("EXPENSE_REQUEST_AP_HANDOFF_DUPLICATE_INVOICE");
    expect(serviceSource).toContain("expense_ap_invoice_handoff_v1");
    expect(prismaSchemaSource).toContain(
      "@@unique([tenantId, companyId, expenseRequestId, sourceEventKey])"
    );
    expect(serviceSource).toContain("expense_request.payment_handoff_ready");
    expect(serviceSource).toContain("expense_request.ap_invoice_draft_created");
    expect(serviceSource).toContain("ap_invoice.created_from_expense_request");
    expect(serviceSource).toContain("upsertExpenseRequestBudgetCommitments");
    expect(serviceSource).toContain('sourceType: "EXPENSE_REQUEST"');
    expect(serviceSource).toContain("budget.commitment_created");
    expect(serviceSource).toContain("budgetCommitmentCount");
    expect(pageSource).toContain("runExpenseRequestAction");
    expect(pageSource).toContain("runExpenseRequestDraftAction");
    expect(pageSource).toContain("Create Draft Expense Request");
    expect(pageSource).toContain("name=\"categoryCode\"");
    expect(pageSource).toContain("name=\"budgetLineId\"");
    expect(pageSource).toContain("createDraftExpenseRequest");
    expect(pageSource).toContain("Request lines");
    expect(pageSource).toContain("lineDescription_");
    expect(pageSource).toContain("requestedAmountPhp_");
    expect(pageSource).toContain("Expense Workflow Actions");
    expect(pageSource).toContain("Expense Report Preview");
    expect(pageSource).toContain("dashboard.reportRows");
    expect(pageSource).toContain("AP Handoff Queue");
    expect(pageSource).toContain("dashboard.apHandoffRows");
    expect(serviceSource).toContain("buildExpenseRequestApHandoffRows");
    expect(serviceSource).toContain("expenseRequestSourceLink.findMany");
    expect(serviceSource).toContain("sourceDocumentType: \"AP_INVOICE\"");
    expect(pageSource).toContain("createExpenseRequestApInvoiceDraft");
    expect(pageSource).toContain("allowedExpenseActions");
    expect(serviceSource).toContain(
      "ready_marker_only_payment_request_or_ap_creation_deferred"
    );
    expect(serviceSource).toContain(
      "expense_to_ap_invoice_draft_only_no_payment_release_no_journal"
    );
    expect(serviceSource).toContain("budget_commitment_only_no_source_mutation");
    expect(serviceSource).toContain("noPaymentCreation");
    expect(serviceSource).toContain("noApSettlement");
    expect(serviceSource).not.toContain("paymentRequest.create");
    expect(serviceSource).not.toContain("paymentRelease.create");
    expect(serviceSource).not.toContain("financeJournal.create");
  });
});
