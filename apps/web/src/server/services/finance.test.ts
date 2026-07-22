import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertBalancedJournal,
  buildBankCashExceptionRows,
  buildBankCashReportRows,
  buildFinanceFoundationDashboard,
  buildPayablesReportRows,
  buildPaymentReleaseReportRows,
  buildPaymentReleaseSettlementReadinessRows,
  evaluateApInvoiceMatchLine
} from "./finance";
import type { SessionContext } from "./context";

const financeServiceSource = readFileSync(
  path.resolve(__dirname, "finance.ts"),
  "utf8"
);
const financeSubworkspaceSource = readFileSync(
  path.resolve(__dirname, "../../components/FinanceSubworkspace.tsx"),
  "utf8"
);
const bankCashExportRouteSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/finance/bank-cash/export/route.ts"),
  "utf8"
);

function functionSlice(source: string, functionName: string) {
  const start = source.indexOf(`export async function ${functionName}`);
  if (start === -1) {
    return "";
  }
  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

const session: SessionContext = {
  user: {
    id: "user-1",
    email: "finance@example.test",
    displayName: "Finance User",
    role: "Finance Controller"
  },
  context: {
    tenantId: "tenant-1",
    companyId: "company-1",
    companyName: "One Gourmet Foods Inc.",
    brandId: "brand-1",
    brandName: "Yakiniku Like",
    locationId: "location-1",
    locationName: "Yakiniku Like SM North Edsa",
    locationType: "BRANCH"
  },
  authorizedLocations: [],
  permissionCodes: [
    "finance.view",
    "finance.payables.view",
    "finance.payment_request.approve"
  ]
};

describe("finance foundation dashboard", () => {
  it("summarizes AP source chains without creating finance source records", () => {
    const dashboard = buildFinanceFoundationDashboard(session, [
      {
        id: "po-1",
        publicReference: "PO-001",
        status: "FULLY_RECEIVED",
        totalAmount: 1000,
        currencyCode: "PHP",
        supplier: { displayName: "Metro Packaging" },
        goodsReceipts: [
          {
            id: "grn-1",
            status: "POSTED",
            discrepancyFlag: false,
            lines: [{ acceptedQty: 10, unitCost: 100 }]
          }
        ]
      },
      {
        id: "po-2",
        publicReference: "PO-002",
        status: "PARTIALLY_RECEIVED",
        totalAmount: 2000,
        currencyCode: "PHP",
        supplier: { displayName: "Luzon Poultry" },
        goodsReceipts: [
          {
            id: "grn-2",
            status: "POSTED_WITH_DISCREPANCY",
            discrepancyFlag: true,
            lines: [{ acceptedQty: 5, unitCost: 200 }]
          }
        ]
      }
    ]);

    expect(dashboard.scope.locationName).toBe("Yakiniku Like SM North Edsa");
    expect(dashboard.metrics.map((metric) => metric.id)).toEqual([
      "open-commitments",
      "received-value",
      "ready-for-invoice",
      "discrepancy-review"
    ]);
    expect(dashboard.sourceChain.map((row) => row.matchStatus)).toEqual([
      "READY_FOR_INVOICE",
      "DISCREPANCY_REVIEW"
    ]);
    expect(dashboard.sourceChain[0]).toMatchObject({
      purchaseOrderReference: "PO-001",
      receivedAmount: 1000,
      sourceHref: "/purchase-orders/po-1"
    });
  });

  it("keeps finance production controls visible while posting is gated", () => {
    const dashboard = buildFinanceFoundationDashboard(session, []);

    expect(dashboard.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Source records remain authoritative"
        }),
        expect.objectContaining({
          label: "Automated source posting remains gated",
          tone: "warning"
        }),
        expect.objectContaining({
          label: "PHP-only baseline"
        })
      ])
    );
  });

  it("shows finance configuration templates without enabling posting", () => {
    const dashboard = buildFinanceFoundationDashboard(session, [], {
      fiscalYear: {
        id: "fy-2026",
        code: "FY2026",
        name: "Fiscal Year 2026",
        status: "OPEN",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
        isDefault: true
      },
      fiscalYears: [
        {
          id: "fy-2026",
          code: "FY2026",
          name: "Fiscal Year 2026",
          status: "OPEN",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
          isDefault: true,
          periodCount: 12
        }
      ],
      openPeriods: [
        {
          id: "period-2026-07",
          code: "2026-07",
          name: "July 2026",
          status: "OPEN",
          startDate: "2026-07-01T00:00:00.000Z",
          endDate: "2026-07-31T00:00:00.000Z"
        }
      ],
      accountingPeriods: [
        {
          id: "period-2026-07",
          fiscalYearId: "fy-2026",
          fiscalYearCode: "FY2026",
          periodNumber: 7,
          code: "2026-07",
          name: "July 2026",
          startDate: "2026-07-01T00:00:00.000Z",
          endDate: "2026-07-31T00:00:00.000Z",
          status: "OPEN"
        }
      ],
      accountClassCount: 6,
      postingAccountCount: 8,
      postingRules: [
        {
          id: "rule-1",
          code: "GOODS_RECEIPT_AP_ACCRUAL",
          name: "Goods receipt AP accrual template",
          status: "DRAFT",
          sourceType: "GOODS_RECEIPT",
          sourceEvent: "POSTED",
          isExecutionEnabled: false,
          isConfigOnly: true,
          accountMapCount: 2,
          dimensionRequirementCount: 3
        }
      ]
    });

    expect(dashboard.configuration.fiscalYear?.code).toBe("FY2026");
    expect(dashboard.configuration.openPeriods).toHaveLength(1);
    expect(dashboard.configuration.postingRules[0]).toMatchObject({
      isExecutionEnabled: false,
      isConfigOnly: true,
      accountMapCount: 2,
      dimensionRequirementCount: 3
    });
  });

  it("shows payment release control rows without implying bank API posting", () => {
    const dashboard = buildFinanceFoundationDashboard(
      session,
      [],
      undefined,
      [],
      [],
      [],
      [],
      [
        {
          id: "release-1",
          publicReference: "REL-2026-00001",
          paymentRequestReference: "PAY-2026-00001",
          supplierName: "Pacific Pantry",
          bankAccountId: "bank-1",
          bankName: "BDO Operating Account",
          method: "BANK_TRANSFER",
          status: "RELEASED",
          releaseAmount: 13440,
          releasedAmount: 13440,
          reconciliationMatchedAmount: 0,
          reconciliationMatchCount: 0,
          currencyCode: "PHP",
          createdBy: "Alyssa Tan",
          releasedBy: "Mara Santos",
          releaseReference: "BDO-OFFLINE-TRANSFER-2026-0705-001",
          evidenceReference: "DEMO-BDO-RELEASE-PROOF-001",
          createdAt: "2026-07-05T02:00:00.000Z"
        }
      ]
    );

    expect(dashboard.paymentReleases).toHaveLength(1);
    expect(dashboard.paymentReleases[0]).toMatchObject({
      publicReference: "REL-2026-00001",
      paymentRequestReference: "PAY-2026-00001",
      status: "RELEASED",
      releaseReference: "BDO-OFFLINE-TRANSFER-2026-0705-001"
    });
    expect(dashboard.paymentReleaseReportRows[0]).toMatchObject({
      publicReference: "REL-2026-00001",
      settlementState: "RELEASED",
      evidenceState: "COMPLETE",
      remainingAmount: 0
    });
  });

  it("builds export-ready payment release report rows without bank or journal posting", () => {
    const reportRows = buildPaymentReleaseReportRows([
      {
        id: "release-1",
        publicReference: "REL-2026-00001",
        paymentRequestReference: "PAY-2026-00001",
        supplierName: "Pacific Pantry",
        bankAccountId: "bank-1",
        bankName: "BDO Operating Account",
        method: "BANK_TRANSFER",
        status: "PARTIALLY_RECONCILED",
        releaseAmount: 13440,
        releasedAmount: 10000,
        reconciliationMatchedAmount: 8000,
        reconciliationMatchCount: 1,
        currencyCode: "PHP",
        createdBy: "Alyssa Tan",
        releasedBy: "Mara Santos",
        releaseReference: null,
        evidenceReference: "DEMO-BDO-RELEASE-PROOF-001",
        createdAt: "2026-07-05T02:00:00.000Z"
      },
      {
        id: "release-2",
        publicReference: "REL-2026-00002",
        paymentRequestReference: "PAY-2026-00002",
        supplierName: "FreshFarm Manila",
        bankAccountId: "bank-1",
        bankName: "BDO Operating Account",
        method: "BANK_TRANSFER",
        status: "REVERSED",
        releaseAmount: 5000,
        releasedAmount: 5000,
        reconciliationMatchedAmount: 0,
        reconciliationMatchCount: 0,
        currencyCode: "PHP",
        createdBy: "Alyssa Tan",
        releasedBy: "Mara Santos",
        releaseReference: "BDO-REVERSAL-001",
        evidenceReference: "REVERSAL-PACKET-001",
        createdAt: "2026-07-05T03:00:00.000Z"
      }
    ]);

    expect(reportRows[0]).toMatchObject({
      publicReference: "REL-2026-00001",
      settlementState: "RECONCILED",
      evidenceState: "MISSING",
      remainingAmount: 3440
    });
    expect(reportRows[0]?.exportSafeSummary).toContain("PAY-2026-00001");
    expect(reportRows[1]).toMatchObject({
      publicReference: "REL-2026-00002",
      settlementState: "EXCEPTION"
    });
  });

  it("builds payment release settlement readiness rows without settling AP, bank, or journals", () => {
    const reportRows = buildPaymentReleaseReportRows([
      {
        id: "release-1",
        publicReference: "REL-2026-00001",
        paymentRequestReference: "PAY-2026-00001",
        supplierName: "Pacific Pantry",
        bankAccountId: "bank-1",
        bankName: "BDO Operating Account",
        method: "BANK_TRANSFER",
        status: "READY_FOR_RELEASE",
        releaseAmount: 13440,
        releasedAmount: 0,
        reconciliationMatchedAmount: 0,
        reconciliationMatchCount: 0,
        currencyCode: "PHP",
        createdBy: "Alyssa Tan",
        releasedBy: null,
        releaseReference: null,
        evidenceReference: null,
        createdAt: "2026-07-05T02:00:00.000Z"
      },
      {
        id: "release-2",
        publicReference: "REL-2026-00002",
        paymentRequestReference: "PAY-2026-00002",
        supplierName: "FreshFarm Manila",
        bankAccountId: "bank-1",
        bankName: "BDO Operating Account",
        method: "CHECK",
        status: "RELEASED",
        releaseAmount: 5000,
        releasedAmount: 5000,
        reconciliationMatchedAmount: 0,
        reconciliationMatchCount: 0,
        currencyCode: "PHP",
        createdBy: "Alyssa Tan",
        releasedBy: "Mara Santos",
        releaseReference: "CHK-001",
        evidenceReference: "CHECK-PACKET-001",
        createdAt: "2026-07-05T03:00:00.000Z"
      },
      {
        id: "release-3",
        publicReference: "REL-2026-00003",
        paymentRequestReference: "PAY-2026-00003",
        supplierName: "Metro Packaging",
        bankAccountId: "bank-1",
        bankName: "BDO Operating Account",
        method: "BANK_TRANSFER",
        status: "REVERSED",
        releaseAmount: 8000,
        releasedAmount: 8000,
        reconciliationMatchedAmount: 0,
        reconciliationMatchCount: 0,
        currencyCode: "PHP",
        createdBy: "Alyssa Tan",
        releasedBy: "Mara Santos",
        releaseReference: "BDO-REVERSAL-001",
        evidenceReference: "REVERSAL-PACKET-001",
        createdAt: "2026-07-05T04:00:00.000Z"
      }
    ]);
    const readinessRows =
      buildPaymentReleaseSettlementReadinessRows(reportRows);

    expect(readinessRows.map((row) => row.issueType)).toEqual([
      "MISSING_EVIDENCE",
      "SETTLEMENT_EXCEPTION",
      "NOT_RELEASED",
      "RECONCILIATION_PENDING"
    ]);
    expect(readinessRows[0]).toMatchObject({
      severity: "HIGH",
      blockerId: "P3-BLOCK-002",
      nextAction:
        "Upload method-specific release proof or link approved metadata; production retention and scan/waiver signoff remain for UAT."
    });
    expect(financeServiceSource).not.toContain("apInvoice.updateMany");
    expect(financeServiceSource).not.toContain("bankTransaction.create");
    expect(financeServiceSource).not.toContain("journalEntry.create");
    expect(financeServiceSource).toContain("getPaymentReleaseSettlementPolicy");
    expect(financeServiceSource).toContain("paymentReleaseSettlementPolicy");
    expect(financeSubworkspaceSource).toContain(
      "Payment release settlement policy"
    );
    expect(financeSubworkspaceSource).toContain("apSettlementMutationAllowed");
    expect(financeSubworkspaceSource).toContain("bankApiMutationAllowed");
    expect(financeSubworkspaceSource).toContain("journalPostingAllowed");
  });

  it("builds export-ready bank/cash report rows for reconciliation readiness", () => {
    const reportRows = buildBankCashReportRows({
      accounts: [
        {
          id: "bank-1",
          publicReference: "BANK-001",
          bankName: "BDO Operating Account",
          maskedAccountNumber: "****1234",
          accountType: "CHECKING",
          status: "ACTIVE",
          currencyCode: "PHP",
          scopeLabel: "Company treasury",
          depositCount: 1,
          statementCount: 1,
          reconciliationCount: 1
        }
      ],
      deposits: [
        {
          id: "deposit-1",
          publicReference: "DEP-001",
          bankAccountId: "bank-1",
          locationName: "Yakiniku Like SM North Edsa",
          bankName: "BDO Operating Account",
          depositDate: "2026-07-08T00:00:00.000Z",
          amountPhp: 5000,
          status: "DECLARED",
          depositSlipNumber: null,
          evidenceReference: "EV-DEP-001",
          declaredBy: "Bianca Reyes"
        }
      ],
      statementLines: [
        {
          id: "statement-line-1",
          publicReference: "STM-001",
          bankAccountId: "bank-1",
          bankName: "BDO Operating Account",
          transactionDate: "2026-07-08T00:00:00.000Z",
          bankReference: "BDO-001",
          description: "Deposit",
          netAmount: 5000,
          matchedAmount: 0,
          status: "UNMATCHED"
        }
      ],
      reconciliations: [
        {
          id: "recon-1",
          publicReference: "REC-001",
          bankAccountId: "bank-1",
          bankName: "BDO Operating Account",
          statementReference: "STM-JULY",
          status: "DRAFT",
          preparedAt: "2026-07-08T00:00:00.000Z",
          varianceAmount: 5000,
          matchCount: 0
        }
      ]
    });

    expect(reportRows[0]).toMatchObject({
      bankName: "BDO Operating Account",
      readinessState: "NEEDS_REVIEW",
      depositAmountPhp: 5000,
      unmatchedStatementCount: 1,
      varianceAmountPhp: 5000,
      evidenceGapCount: 1,
      readinessIssues: [
        "1 deposit evidence gap",
        "1 unmatched statement line",
        "PHP 5,000 reconciliation variance"
      ]
    });
    expect(reportRows[0]?.exportSafeSummary).toContain("BANK-001");
    expect(reportRows[0]?.exportSafeSummary).toContain(
      "issues 1 deposit evidence gap; 1 unmatched statement line; PHP 5,000 reconciliation variance"
    );
    expect(financeSubworkspaceSource).toContain("row.readinessIssues");
  });

  it("builds bank/cash exception rows for close-readiness follow-up", () => {
    const exceptionRows = buildBankCashExceptionRows([
      {
        id: "bank-1",
        bankName: "BDO Operating Account",
        maskedAccountNumber: "****1234",
        scopeLabel: "Company treasury",
        status: "ACTIVE",
        currencyCode: "PHP",
        depositCount: 1,
        depositAmountPhp: 5000,
        statementLineCount: 1,
        unmatchedStatementCount: 1,
        reconciliationCount: 1,
        varianceAmountPhp: 5000,
        evidenceGapCount: 1,
        readinessState: "NEEDS_REVIEW",
        readinessIssues: [
          "1 deposit evidence gap",
          "1 unmatched statement line",
          "PHP 5,000 reconciliation variance"
        ],
        exportSafeSummary:
          "BANK-001 / BDO Operating Account / Company treasury / NEEDS_REVIEW"
      }
    ]);

    expect(exceptionRows.map((row) => row.issueType)).toEqual([
      "DEPOSIT_EVIDENCE_GAP",
      "UNMATCHED_STATEMENT_LINES",
      "RECONCILIATION_VARIANCE"
    ]);
    expect(exceptionRows[0]).toMatchObject({
      severity: "HIGH",
      count: 1,
      nextAction:
        "Add deposit slip and evidence metadata before treating cash deposits as close-ready."
    });
    expect(exceptionRows[2]).toMatchObject({
      amountPhp: 5000,
      nextAction:
        "Resolve or approve the reconciliation variance before period-close signoff."
    });
  });

  it("surfaces AP invoice payment-preparation readiness without creating payment releases", () => {
    const dashboard = buildFinanceFoundationDashboard(
      session,
      [],
      undefined,
      [],
      [
        {
          id: "ap-1",
          publicReference: "API-2026-00001",
          supplierInvoiceNumber: "SUP-INV-001",
          supplierName: "Pacific Pantry",
          status: "MATCHED",
          matchStatus: "EXACT_MATCH",
          duplicateRisk: "CLEAN",
          invoiceDate: "2026-07-08T00:00:00.000Z",
          totalAmount: 1200,
          paymentOutstandingAmount: 1200,
          paymentReady: true,
          paymentPreparationStatus: "READY",
          currencyCode: "PHP",
          lineCount: 1,
          exceptionCount: 0,
          sourceHref: "/finance/accounts-payable/ap-1"
        }
      ]
    );

    expect(dashboard.apInvoices[0]).toMatchObject({
      paymentReady: true,
      paymentPreparationStatus: "READY",
      paymentOutstandingAmount: 1200
    });
  });

  it("builds AP aging and supplier-ledger preview rows without settlement mutation", () => {
    const rows = buildPayablesReportRows(
      [
        {
          id: "ap-1",
          publicReference: "AP-INV-2026-00001",
          supplierInvoiceNumber: "SI-001",
          supplierName: "Pacific Pantry",
          status: "MATCHED",
          matchStatus: "EXACT_MATCH",
          duplicateRisk: "CLEAN",
          invoiceDate: "2026-05-01T00:00:00.000Z",
          totalAmount: 1200,
          paymentOutstandingAmount: 500,
          paymentReady: true,
          paymentPreparationStatus: "READY",
          currencyCode: "PHP",
          lineCount: 2,
          exceptionCount: 0,
          sourceHref: "/finance/accounts-payable/ap-1"
        }
      ],
      [
        {
          id: "cn-1",
          publicReference: "AP-CN-2026-00001",
          supplierCreditNoteNumber: "CN-001",
          originalInvoiceReference: "AP-INV-2026-00001",
          supplierName: "Pacific Pantry",
          status: "DRAFT",
          creditDate: "2026-07-01T00:00:00.000Z",
          creditAmount: 100,
          currencyCode: "PHP",
          reasonCode: "PRICE_ADJUSTMENT_CREDIT",
          evidenceReference: "SUPPLIER-CREDIT-MEMO-001",
          createdBy: "Finance User",
          createdAt: "2026-07-01T01:00:00.000Z"
        }
      ],
      [
        {
          id: "pay-1",
          publicReference: "PAY-2026-00001",
          supplierName: "Pacific Pantry",
          status: "DRAFT",
          totalRequestedAmount: 500,
          currencyCode: "PHP",
          lineCount: 1,
          requestedBy: "Finance User",
          createdAt: "2026-07-02T00:00:00.000Z"
        }
      ],
      "2026-07-08T00:00:00.000Z"
    );

    expect(rows.map((row) => row.rowType).sort()).toEqual([
      "AP_INVOICE",
      "PAYMENT_REQUEST",
      "SUPPLIER_CREDIT"
    ]);
    expect(rows.find((row) => row.rowType === "AP_INVOICE")).toMatchObject({
      ageBucket: "DAYS_61_90",
      openAmount: 500
    });
    expect(rows.find((row) => row.rowType === "SUPPLIER_CREDIT")).toMatchObject({
      ageBucket: "PENDING_CREDIT",
      openAmount: 100
    });
    expect(financeSubworkspaceSource).toContain("AP Aging & Supplier Ledger Preview");
    expect(financeServiceSource).toContain("Payables Report");
    expect(financeServiceSource).not.toContain("apInvoice.updateMany");
    expect(financeServiceSource).not.toContain("journalEntry.create");
  });

  it("evaluates AP invoice lines against accepted receiving and PO price basis", () => {
    expect(
      evaluateApInvoiceMatchLine({
        invoiceLineId: "ap-line-1",
        purchaseOrderLineId: "po-line-1",
        goodsReceiptLineId: "gr-line-1",
        poQty: 10,
        receivedQty: 10,
        invoicedQty: 10,
        poUnitPrice: 120,
        invoicedUnitPrice: 120,
        poLineTotal: 1200,
        invoicedLineTotal: 1200
      })
    ).toMatchObject({
      status: "EXACT_MATCH",
      qtyVariance: 0,
      amountVariance: 0
    });

    expect(
      evaluateApInvoiceMatchLine({
        invoiceLineId: "ap-line-2",
        purchaseOrderLineId: "po-line-2",
        goodsReceiptLineId: "gr-line-2",
        poQty: 10,
        receivedQty: 8,
        invoicedQty: 10,
        poUnitPrice: 120,
        invoicedUnitPrice: 120,
        poLineTotal: 960,
        invoicedLineTotal: 1200
      })
    ).toMatchObject({
      status: "VARIANCE_HOLD",
      exceptionCode: "QTY_VARIANCE",
      qtyVariance: 2,
      amountVariance: 240
    });
  });

  it("projects AP invoice budget commitments only after clean match outcomes", () => {
    expect(financeServiceSource).toContain(
      "projectBudgetCommitmentFromApprovedSourceEvent"
    );
    expect(financeServiceSource).toContain(
      "reverseBudgetCommitmentFromApprovedSourceEvent"
    );
    expect(financeServiceSource).toContain("projectApInvoiceBudgetCommitments");
    expect(financeServiceSource).toContain('sourceType: "AP_INVOICE"');
    expect(financeServiceSource).toContain("ap_invoice.matched:${line.id}");
    expect(financeServiceSource).toContain("ap_invoice.cancelled:${line.id}");
    expect(financeServiceSource).toContain('status: "PENDING"');
    expect(financeServiceSource).toContain('finalInvoiceStatus !== "ON_HOLD"');
  });

  it("validates manual journal balance before posting", () => {
    expect(() =>
      assertBalancedJournal([
        {
          accountId: "cash",
          amountSide: "DEBIT",
          amountPhp: 100,
          lineDescription: "Cash basis"
        },
        {
          accountId: "equity",
          amountSide: "CREDIT",
          amountPhp: 100,
          lineDescription: "Opening equity"
        }
      ])
    ).not.toThrow();

    expect(() =>
      assertBalancedJournal([
        {
          accountId: "cash",
          amountSide: "DEBIT",
          amountPhp: 100,
          lineDescription: "Cash basis"
        },
        {
          accountId: "equity",
          amountSide: "CREDIT",
          amountPhp: 90,
          lineDescription: "Opening equity"
        }
      ])
    ).toThrow("FINANCE_JOURNAL_NOT_BALANCED");
  });

  it("wires bounded manual journal draft entry through the ledger workspace", () => {
    const manualJournalDraftSource = functionSlice(
      financeServiceSource,
      "createManualJournalDraft"
    );

    expect(financeServiceSource).toContain("canCreateJournal");
    expect(financeServiceSource).toContain("journalAccounts");
    expect(financeServiceSource).toContain("permissions.financeJournalCreate");
    expect(financeSubworkspaceSource).toContain("runManualJournalDraftAction");
    expect(financeSubworkspaceSource).toContain("createManualJournalDraft");
    expect(financeSubworkspaceSource).toContain("Create Draft Manual Journal");
    expect(financeSubworkspaceSource).toContain("debitAccountId");
    expect(financeSubworkspaceSource).toContain("creditAccountId");
    expect(financeSubworkspaceSource).toContain('amountSide: "DEBIT"');
    expect(financeSubworkspaceSource).toContain('amountSide: "CREDIT"');
    expect(financeSubworkspaceSource).toContain("canCreateManualJournal");
    expect(manualJournalDraftSource).not.toContain("inventoryMovement.create");
    expect(manualJournalDraftSource).not.toContain("paymentRelease.updateMany");
    expect(manualJournalDraftSource).not.toContain("bankTransaction.create");
  });

  it("wires manual journal lifecycle controls through the ledger workspace", () => {
    expect(financeServiceSource).toContain("submitManualJournal");
    expect(financeServiceSource).toContain("approveManualJournal");
    expect(financeServiceSource).toContain("postApprovedManualJournal");
    expect(financeServiceSource).toContain("reversePostedFinanceJournal");
    expect(financeServiceSource).toContain("FINANCE_JOURNAL_SELF_APPROVAL_DENIED");
    expect(financeServiceSource).toContain("FINANCE_JOURNAL_POSTING_STATE_CONFLICT");
    expect(financeServiceSource).toContain("FINANCE_JOURNAL_NOT_POSTED_FOR_REVERSAL");
    expect(financeSubworkspaceSource).toContain("runManualJournalAction");
    expect(financeSubworkspaceSource).toContain("allowedManualJournalActions");
    expect(financeSubworkspaceSource).toContain("manualJournalActionLabels");
    expect(financeSubworkspaceSource).toContain("canSubmitJournal");
    expect(financeSubworkspaceSource).toContain("canApproveJournal");
    expect(financeSubworkspaceSource).toContain("canPostJournal");
    expect(financeSubworkspaceSource).toContain("canReverseJournal");
    expect(financeSubworkspaceSource).toContain("Submit, approval, or posting note");
    expect(financeSubworkspaceSource).toContain("Required when reversing a posted journal");
  });

  it("wires branch cash deposit declarations as evidence-only bank/cash intake", () => {
    const branchDepositSource = functionSlice(
      financeServiceSource,
      "createBranchCashDepositDeclaration"
    );

    expect(financeServiceSource).toContain(
      "createBranchCashDepositDeclaration"
    );
    expect(financeServiceSource).toContain("financeCashDepositCreate");
    expect(financeServiceSource).toContain("nextBranchCashDepositReference");
    expect(financeServiceSource).toContain("branch_cash_deposit.declared");
    expect(financeServiceSource).toContain("noBankMutation");
    expect(financeServiceSource).toContain("noReconciliationMatch");
    expect(financeSubworkspaceSource).toContain(
      "runBranchCashDepositDeclarationAction"
    );
    expect(financeSubworkspaceSource).toContain(
      "Declare Branch Cash Deposit"
    );
    expect(financeSubworkspaceSource).toContain("ControlledEvidencePanel");
    expect(financeSubworkspaceSource).toContain(
      'sourceType="BRANCH_CASH_DEPOSIT"'
    );
    expect(financeSubworkspaceSource).toContain(
      "permissions.financeCashDepositCreate"
    );
    expect(financeSubworkspaceSource).toContain("canDeclareBranchDeposit");
    expect(financeSubworkspaceSource).toContain(
      'sourceType="BANK_RECONCILIATION"'
    );
    expect(financeSubworkspaceSource).toContain(
      "permissions.financeReconciliationMatch"
    );
    expect(financeSubworkspaceSource).toContain(
      "bankReconciliationEvidenceById"
    );
    expect(financeSubworkspaceSource).not.toContain('name="objectKey"');
    expect(financeSubworkspaceSource).not.toContain('name="storageProvider"');
    expect(financeSubworkspaceSource).toContain("archiveSharedEvidenceMetadata");
    expect(financeSubworkspaceSource).toContain(
      "archiveControlledEvidenceAttachment"
    );
    expect(financeSubworkspaceSource).toContain(
      "CONTROLLED_EVIDENCE_ARCHIVE_REASON_REQUIRED"
    );
    expect(branchDepositSource).not.toContain("bankAccount.updateMany");
    expect(branchDepositSource).not.toContain("bankReconciliationMatch.create");
    expect(branchDepositSource).not.toContain("paymentRelease.updateMany");
    expect(branchDepositSource).not.toContain("journalEntry.create");
  });

  it("wires branch cash deposit reconciliation matching without bank or journal posting", () => {
    const matchSource = functionSlice(
      financeServiceSource,
      "matchBranchCashDepositToBankReconciliation"
    );

    expect(financeServiceSource).toContain(
      "matchBranchCashDepositToBankReconciliation"
    );
    expect(matchSource).toContain("permissions.financeReconciliationMatch");
    expect(matchSource).toContain('sourceType: "BRANCH_CASH_DEPOSIT"');
    expect(matchSource).toContain(
      "branch_cash_deposit.bank_reconciliation_matched"
    );
    expect(matchSource).toContain(
      "BRANCH_CASH_DEPOSIT_RECONCILIATION_SEGREGATION_REQUIRED"
    );
    expect(matchSource).toContain("BRANCH_CASH_DEPOSIT_STATEMENT_LINE_NOT_INFLOW");
    expect(matchSource).toContain("noBankMutation: true");
    expect(matchSource).toContain("noPaymentRelease: true");
    expect(matchSource).toContain("noApSettlement: true");
    expect(matchSource).toContain("noJournalPosting: true");
    expect(financeSubworkspaceSource).toContain(
      "runBranchCashDepositMatchAction"
    );
    expect(financeSubworkspaceSource).toContain(
      "Match Deposit to Bank Line"
    );
    expect(financeSubworkspaceSource).toContain("branch-deposit-match-ui");
    expect(financeSubworkspaceSource).toContain(
      "dashboard.permissions.canMatchReconciliation"
    );
    expect(matchSource).not.toContain("bankAccount.update");
    expect(matchSource).not.toContain("paymentRelease.update");
    expect(matchSource).not.toContain("financeJournal.create");
  });

  it("keeps manual journal posting out of procurement and inventory source records", () => {
    expect(financeServiceSource).not.toMatch(
      /prisma\.(purchaseOrder|purchaseOrderLine|goodsReceipt|goodsReceiptLine|inventoryMovement|inventoryBalance)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/
    );
    expect(financeServiceSource).toContain("prisma.purchaseOrder.findMany");
    expect(financeServiceSource).toContain("financeJournal.create");
    expect(financeServiceSource).toContain("financeJournalPostingAttempt.upsert");
    expect(financeServiceSource).toContain("apInvoice.create");
    expect(financeServiceSource).toContain("apInvoiceMatchResult.create");
    expect(financeServiceSource).toContain("paymentRequest.create");
    expect(financeServiceSource).toContain("paymentRelease.create");
    expect(financeServiceSource).toContain("paymentReleaseExecution.create");
    expect(financeServiceSource).toContain("noBankApiCall");
    expect(financeServiceSource).toContain("noJournalPosting");
    expect(financeServiceSource).toContain("noPaymentRelease");
  });

  it("defines payment release lifecycle controls beyond draft and execute", () => {
    expect(financeServiceSource).toContain("holdPaymentRelease");
    expect(financeServiceSource).toContain("resumePaymentReleaseFromHold");
    expect(financeServiceSource).toContain("cancelPaymentRelease");
    expect(financeServiceSource).toContain("markPaymentReleaseExecutionFailed");
    expect(financeServiceSource).toContain(
      "handoffPaymentReleaseToReconciliation"
    );
    expect(financeServiceSource).toContain(
      "recordPaymentReleaseReconciliationOutcome"
    );
    expect(financeServiceSource).toContain("requestPaymentReleaseReversal");
    expect(financeServiceSource).toContain("writePaymentReleaseAudit");
    expect(financeServiceSource).toContain("PAYMENT_RELEASE_EXECUTION_STATE_CONFLICT");
    expect(financeServiceSource).toContain("getPaymentReleaseEvidencePolicy");
    expect(financeServiceSource).toContain("evidencePolicySourceDecisionId");
    expect(financeServiceSource).toMatch(
      /paymentRelease\.updateMany\(\{\s*where: \{\s*id: release\.id,[\s\S]*status: "READY_FOR_RELEASE"/
    );
  });

  it("keeps payment release lifecycle evidence-based, segregated, and non-posting", () => {
    expect(financeServiceSource).toContain(
      "PAYMENT_RELEASE_HOLD_EVIDENCE_REQUIRED"
    );
    expect(financeServiceSource).toContain(
      "PAYMENT_RELEASE_CANCEL_SEGREGATION_REQUIRED"
    );
    expect(financeServiceSource).toContain(
      "PAYMENT_RELEASE_REVERSAL_SEGREGATION_REQUIRED"
    );
    expect(financeServiceSource).toContain("PAYMENT_RELEASE_CANCEL_REQUIRES_REVERSAL");
    expect(financeServiceSource).toContain("PAYMENT_RELEASE_RECONCILIATION_AMOUNT_INVALID");
    expect(financeServiceSource).toContain("reversalRecoveryApplied");
    expect(financeServiceSource).toContain("bankReconciliationMatch.updateMany");
    expect(financeServiceSource).toContain("reversedReconciliationMatchCount");
    expect(financeServiceSource).toContain("PAYMENT_RELEASE_REVERSAL_REQUIRES_RECONCILIATION_REOPEN");
    expect(financeServiceSource).not.toContain("bankTransaction.create");
    expect(financeServiceSource).not.toContain("apInvoice.updateMany");
    expect(financeServiceSource).not.toContain("journalEntry.create");
  });

  it("wires payment release production controls through server actions", () => {
    expect(financeSubworkspaceSource).toContain(
      "runPaymentReleaseDraftAction"
    );
    expect(financeSubworkspaceSource).toContain("runPaymentReleaseAction");
    expect(financeSubworkspaceSource).toContain(
      "allowedPaymentReleaseActions"
    );
    expect(financeSubworkspaceSource).toContain("Create Release Draft");
    expect(financeSubworkspaceSource).toContain("releaseBankAccounts");
    expect(financeSubworkspaceSource).toContain("No active bank account");
    expect(financeSubworkspaceSource).toContain("account.maskedAccountNumber");
    expect(financeSubworkspaceSource).toContain("Record Release");
    expect(financeSubworkspaceSource).toContain("Send to Reconciliation");
    expect(financeSubworkspaceSource).toContain("Request Reversal");
    expect(financeSubworkspaceSource).toContain("Payment Settlement Readiness");
    expect(financeSubworkspaceSource).toContain(
      "paymentReleaseSettlementReadinessRows"
    );
    expect(financeSubworkspaceSource).toContain("Payment Release Report Preview");
    expect(financeSubworkspaceSource).toContain("paymentReleaseReportRows");
    expect(financeSubworkspaceSource).toContain("listControlledEvidenceAttachments");
    expect(financeSubworkspaceSource).not.toContain(
      "createControlledEvidenceAttachmentMetadataLink"
    );
    expect(financeSubworkspaceSource).not.toContain(
      "createControlledEvidenceAttachmentUploadLink"
    );
    expect(financeSubworkspaceSource).toContain("ControlledEvidencePanel");
    expect(financeSubworkspaceSource).toContain(
      "permissions.financePaymentRelease"
    );
    expect(financeSubworkspaceSource).toContain('sourceType="PAYMENT_RELEASE"');
    expect(financeServiceSource).toContain("PaymentReleaseReportRow");
    expect(financeServiceSource).toContain(
      "PaymentReleaseSettlementReadinessRow"
    );
    expect(financeServiceSource).toContain("buildPaymentReleaseReportRows");
    expect(financeServiceSource).toContain(
      "buildPaymentReleaseSettlementReadinessRows"
    );
    expect(financeServiceSource).toContain("dashboard.paymentReleaseReportRows.find");
    expect(financeServiceSource).toContain("release.reconciliationMatchedAmount");
    expect(financeServiceSource).toContain("BankCashReportRow");
    expect(financeServiceSource).toContain("BankCashExceptionRow");
    expect(financeServiceSource).toContain("buildBankCashReportRows");
    expect(financeServiceSource).toContain("buildBankCashExceptionRows");
    expect(financeSubworkspaceSource).toContain("Bank & Cash Report Preview");
    expect(financeSubworkspaceSource).toContain("Bank & Cash Exception Queue");
    expect(financeSubworkspaceSource).toContain("bankCashReportRows");
    expect(financeSubworkspaceSource).toContain("bankCashExceptionRows");
    expect(financeServiceSource).toContain("exportSafeSummary");
    expect(financeServiceSource).toContain("matchPaymentReleaseToBankReconciliation");
    expect(financeServiceSource).toContain("financeReconciliationMatch");
    expect(financeServiceSource).toContain("PAYMENT_RELEASE_RECONCILIATION_SEGREGATION_REQUIRED");
    expect(financeServiceSource).toContain('sourceType: "PAYMENT_RELEASE"');
    expect(financeServiceSource).toContain("payment_release.bank_reconciliation_matched");
    expect(financeSubworkspaceSource).toContain("Match Statement");
    expect(financeSubworkspaceSource).toContain("reconciliationId");
    expect(financeSubworkspaceSource).toContain("statementLineId");
    expect(financeServiceSource).toContain("noApSettlement");
    expect(financeServiceSource).toContain("noBankApiCall");
    expect(financeServiceSource).toContain("noJournalPosting");
    expect(financeServiceSource).toContain("findPaymentReleaseApprovalRule");
    expect(financeServiceSource).toContain('documentType: "PaymentRelease"');
    expect(financeServiceSource).toContain("approvalInstance.create");
    expect(financeServiceSource).toContain("APPROVE_PAYMENT_RELEASE");
    expect(financeServiceSource).toContain("PAYMENT_RELEASE_APPROVAL_RULE_NOT_CONFIGURED");
    expect(financeServiceSource).toContain("payment_release.submitted");
    expect(financeServiceSource).toContain('status: "DRAFT"');
  });

  it("wires payables source records to controlled evidence upload controls", () => {
    expect(financeSubworkspaceSource).toContain("ControlledEvidencePanel");
    expect(financeSubworkspaceSource).not.toContain("createFinanceEvidenceLink");
    expect(financeSubworkspaceSource).not.toContain(
      "createControlledEvidenceAttachmentUploadLink"
    );
    expect(financeSubworkspaceSource).toContain('sourceType="AP_INVOICE"');
    expect(financeSubworkspaceSource).toContain(
      'sourceType="SUPPLIER_CREDIT_NOTE"'
    );
    expect(financeSubworkspaceSource).toContain('sourceType="PAYMENT_REQUEST"');
    expect(financeSubworkspaceSource).toContain("permissions.financeApInvoiceCreate");
    expect(financeSubworkspaceSource).toContain(
      "permissions.financeSupplierCreditCreate"
    );
    expect(financeSubworkspaceSource).toContain(
      "permissions.financePaymentRequestCreate"
    );
    expect(financeSubworkspaceSource).toContain("apInvoiceEvidenceById");
    expect(financeSubworkspaceSource).toContain("supplierCreditEvidenceById");
    expect(financeSubworkspaceSource).toContain("paymentRequestEvidenceById");
    expect(financeSubworkspaceSource).toContain("Add Evidence");
    expect(financeSubworkspaceSource).toContain("archiveSharedEvidenceMetadata");
    expect(financeSubworkspaceSource).not.toContain(
      'sourceType: "MANUAL_JOURNAL"'
    );
  });

  it("wires AP invoice to draft payment request preparation through server actions", () => {
    const paymentRequestDraftSource = functionSlice(
      financeServiceSource,
      "createPaymentRequestDraft"
    );

    expect(financeServiceSource).toContain("createPaymentRequestDraft");
    expect(financeServiceSource).toContain("assertPaymentRequestEligibleInvoice");
    expect(financeServiceSource).toContain("paymentOutstandingAmount");
    expect(financeServiceSource).toContain("paymentPreparationStatus");
    expect(financeServiceSource).toContain("PAYMENT_REQUEST_DUPLICATE_RISK_BLOCKED");
    expect(financeSubworkspaceSource).toContain("runPaymentRequestDraftAction");
    expect(financeSubworkspaceSource).toContain("Create Draft Payment Request");
    expect(financeSubworkspaceSource).toContain("paymentReadyInvoices");
    expect(financeSubworkspaceSource).toContain("Payment request lines");
    expect(financeSubworkspaceSource).toContain("paymentLineApInvoiceId-");
    expect(financeSubworkspaceSource).toContain("paymentLineRequestedAmount-");
    expect(financeSubworkspaceSource).toContain("Multi-invoice");
    expect(financeSubworkspaceSource).toContain("canCreatePaymentRequest");
    expect(financeSubworkspaceSource).toContain("journal actions remain separate");
    expect(paymentRequestDraftSource).toContain("PAYMENT_REQUEST_LINE_LIMIT_EXCEEDED");
    expect(paymentRequestDraftSource).toContain("PAYMENT_REQUEST_DUPLICATE_INVOICE_LINE");
    expect(paymentRequestDraftSource).toContain("PAYMENT_REQUEST_SUPPLIER_MISMATCH");
    expect(paymentRequestDraftSource).toContain("preparedLines");
    expect(paymentRequestDraftSource).toContain("originatingExpenseLinks");
    expect(paymentRequestDraftSource).toContain("expense_payment_request_handoff_v1");
    expect(paymentRequestDraftSource).toContain(
      "expense_to_payment_request_lineage_only_no_release_no_journal"
    );
    expect(paymentRequestDraftSource).toContain(
      "expense_request.payment_request_lineage_created"
    );
    expect(paymentRequestDraftSource).not.toContain("paymentRelease.updateMany");
    expect(paymentRequestDraftSource).not.toContain("bankTransaction.create");
    expect(paymentRequestDraftSource).not.toContain("journalEntry.create");
  });

  it("wires payment request lifecycle controls through server actions", () => {
    const paymentRequestLifecycleSource = [
      "submitPaymentRequest",
      "approvePaymentRequest",
      "rejectPaymentRequest",
      "cancelPaymentRequest"
    ]
      .map((functionName) => functionSlice(financeServiceSource, functionName))
      .join("\n");

    expect(financeServiceSource).toContain("submitPaymentRequest");
    expect(financeServiceSource).toContain("findPaymentRequestApprovalRule");
    expect(financeServiceSource).toContain('documentType: "PaymentRequest"');
    expect(financeServiceSource).toContain("approvalInstance.create");
    expect(financeServiceSource).toContain("APPROVE_PAYMENT_REQUEST");
    expect(financeServiceSource).toContain("PAYMENT_REQUEST_APPROVAL_RULE_NOT_CONFIGURED");
    expect(financeServiceSource).toContain("PAYMENT_REQUEST_ALREADY_SUBMITTED");
    expect(financeServiceSource).toContain("configureApprovalStepRouting");
    expect(financeServiceSource).not.toContain("resolveScopedNotificationRecipients");
    expect(financeServiceSource).toContain("approvePaymentRequest");
    expect(financeServiceSource).toContain("rejectPaymentRequest");
    expect(financeServiceSource).toContain("cancelPaymentRequest");
    expect(financeServiceSource).toContain("PAYMENT_REQUEST_SELF_APPROVAL_DENIED");
    expect(financeServiceSource).toContain("PAYMENT_REQUEST_SUBMITTER_MISMATCH");
    expect(financeSubworkspaceSource).toContain("runPaymentRequestAction");
    expect(financeSubworkspaceSource).toContain("allowedPaymentRequestActions");
    expect(financeSubworkspaceSource).toContain("paymentRequestActionLabels");
    expect(financeSubworkspaceSource).toContain("Required for reject or cancel");
    expect(paymentRequestLifecycleSource).not.toContain("paymentRelease.updateMany");
    expect(paymentRequestLifecycleSource).not.toContain("bankTransaction.create");
    expect(paymentRequestLifecycleSource).not.toContain("journalEntry.create");
  });

  it("wires bounded AP invoice draft capture through the payables workspace", () => {
    const apInvoiceDraftSource = functionSlice(
      financeServiceSource,
      "createApInvoiceDraft"
    );

    expect(financeServiceSource).toContain("canCreateApInvoice");
    expect(financeServiceSource).toContain("draftOptions");
    expect(financeServiceSource).toContain("purchaseOrders");
    expect(financeServiceSource).toContain("financeApInvoiceCreate");
    expect(financeSubworkspaceSource).toContain("runApInvoiceDraftAction");
    expect(financeSubworkspaceSource).toContain("createApInvoiceDraft");
    expect(financeSubworkspaceSource).toContain("Capture Draft AP Invoice");
    expect(financeSubworkspaceSource).toContain("Create Draft AP Invoice");
    expect(financeSubworkspaceSource).toContain("Non-PO reason");
    expect(financeSubworkspaceSource).toContain("Invoice lines");
    expect(financeSubworkspaceSource).toContain("invoicedQty: quantity");
    expect(financeSubworkspaceSource).toContain("unitPrice");
    expect(financeSubworkspaceSource).toContain("captureIdempotencyKey");
    expect(apInvoiceDraftSource).toContain("poLineById");
    expect(apInvoiceDraftSource).toContain("purchaseOrderLine?.budgetLineId ?? null");
    expect(apInvoiceDraftSource).not.toContain("purchaseOrder.updateMany");
    expect(apInvoiceDraftSource).not.toContain("goodsReceipt.updateMany");
    expect(apInvoiceDraftSource).not.toContain("inventoryMovement.create");
    expect(apInvoiceDraftSource).not.toContain("paymentRelease.updateMany");
    expect(apInvoiceDraftSource).not.toContain("journalEntry.create");
  });

  it("wires AP invoice lifecycle controls through server actions", () => {
    const apInvoiceLifecycleSource = [
      "submitApInvoiceForMatch",
      "evaluateApInvoiceMatch",
      "cancelApInvoice"
    ]
      .map((functionName) => functionSlice(financeServiceSource, functionName))
      .join("\n");

    expect(financeServiceSource).toContain("submitApInvoiceForMatch");
    expect(financeServiceSource).toContain("evaluateApInvoiceMatch");
    expect(financeServiceSource).toContain("cancelApInvoice");
    expect(financeServiceSource).toContain("AP_INVOICE_SUBMITTER_MISMATCH");
    expect(financeServiceSource).toContain("AP_INVOICE_SELF_REVIEW_DENIED");
    expect(financeServiceSource).toContain("AP_INVOICE_CANCEL_REASON_REQUIRED");
    expect(financeServiceSource).toContain("noSourceMutation");
    expect(financeSubworkspaceSource).toContain("runApInvoiceAction");
    expect(financeSubworkspaceSource).toContain("allowedApInvoiceActions");
    expect(financeSubworkspaceSource).toContain("apInvoiceActionLabels");
    expect(financeSubworkspaceSource).toContain("Submit for Match");
    expect(financeSubworkspaceSource).toContain("Evaluate Match");
    expect(financeSubworkspaceSource).toContain("Required only when cancelling");
    expect(apInvoiceLifecycleSource).not.toContain("purchaseOrder.updateMany");
    expect(apInvoiceLifecycleSource).not.toContain("goodsReceipt.updateMany");
    expect(apInvoiceLifecycleSource).not.toContain("inventoryMovement.create");
    expect(apInvoiceLifecycleSource).not.toContain("paymentRelease.updateMany");
    expect(apInvoiceLifecycleSource).not.toContain("journalEntry.create");
  });

  it("wires supplier credit notes as an explicit non-settlement AP register", () => {
    const supplierCreditCreateSource = functionSlice(
      financeServiceSource,
      "createSupplierCreditNoteDraft"
    );
    const supplierCreditCancelSource = functionSlice(
      financeServiceSource,
      "cancelSupplierCreditNote"
    );
    const supplierCreditSubmitSource = functionSlice(
      financeServiceSource,
      "submitSupplierCreditNoteForApplication"
    );

    expect(financeServiceSource).toContain("SupplierCreditNoteQueueRow");
    expect(financeServiceSource).toContain("financeSupplierCreditCreate");
    expect(financeServiceSource).toContain("financeSupplierCreditSubmit");
    expect(financeServiceSource).toContain("financeSupplierCreditCancel");
    expect(financeServiceSource).toContain("nextSupplierCreditNoteReference");
    expect(financeServiceSource).toContain("Supplier Credit Note");
    expect(financeSubworkspaceSource).toContain("runSupplierCreditDraftAction");
    expect(financeSubworkspaceSource).toContain("runSupplierCreditAction");
    expect(financeSubworkspaceSource).toContain("Record Supplier Credit");
    expect(financeSubworkspaceSource).toContain("Submit for Application");
    expect(financeSubworkspaceSource).toContain("Supplier Credit Notes");
    expect(supplierCreditCreateSource).toContain("SUPPLIER_CREDIT_NOTE_AMOUNT_EXCEEDS_INVOICE");
    expect(supplierCreditSubmitSource).toContain("SUPPLIER_CREDIT_NOTE_NOT_SUBMITTABLE");
    expect(supplierCreditSubmitSource).toContain("PENDING_APPLICATION");
    expect(supplierCreditCreateSource).toContain("noOriginalInvoiceMutation");
    expect(supplierCreditCreateSource).toContain("noPaymentSettlement");
    expect(supplierCreditCreateSource).toContain("noJournalPosting");
    expect(supplierCreditSubmitSource).toContain("noOriginalInvoiceMutation");
    expect(supplierCreditSubmitSource).toContain("noPaymentSettlement");
    expect(supplierCreditSubmitSource).toContain("noJournalPosting");
    expect(supplierCreditCancelSource).toContain("SUPPLIER_CREDIT_NOTE_CANCEL_REASON_REQUIRED");
    expect(supplierCreditCreateSource).not.toContain("apInvoice.update");
    expect(supplierCreditCreateSource).not.toContain("paymentRequest.update");
    expect(supplierCreditCreateSource).not.toContain("paymentRelease.update");
    expect(supplierCreditCreateSource).not.toContain("journalEntry.create");
    expect(supplierCreditSubmitSource).not.toContain("apInvoice.update");
    expect(supplierCreditSubmitSource).not.toContain("paymentRequest.update");
    expect(supplierCreditSubmitSource).not.toContain("paymentRelease.update");
    expect(supplierCreditSubmitSource).not.toContain("journalEntry.create");
  });

  it("supports multi-line AP invoice draft capture from the payables workspace", () => {
    const apInvoiceDraftSource = functionSlice(
      financeServiceSource,
      "createApInvoiceDraft"
    );

    expect(apInvoiceDraftSource).toContain("AP_INVOICE_LINE_LIMIT_EXCEEDED");
    expect(apInvoiceDraftSource).toContain("lineTotalFromApInput");
    expect(financeSubworkspaceSource).toContain("Invoice lines");
    expect(financeSubworkspaceSource).toContain("lineDescription-");
    expect(financeSubworkspaceSource).toContain("lineQty-");
    expect(financeSubworkspaceSource).toContain("lineUnitPrice-");
    expect(financeSubworkspaceSource).toContain("lineTaxAmount-");
    expect(financeSubworkspaceSource).toContain("lineDiscountAmount-");
    expect(financeSubworkspaceSource).toContain("AP_INVOICE_LINE_INCOMPLETE");
    expect(financeSubworkspaceSource).toContain("freightAmount");
    expect(financeSubworkspaceSource).toContain("Multi-line");
  });

  it("extends the central finance export with scoped request and custody report rows", () => {
    const exportSource = functionSlice(
      financeServiceSource,
      "buildFinanceFoundationExportRows"
    );

    expect(exportSource).toContain("getBudgetControlDashboard");
    expect(exportSource).toContain("Budget Line");
    expect(exportSource).toContain("Budget Commitment");
    expect(exportSource).toContain("getExpenseRequestDashboard");
    expect(exportSource).toContain("Expense Request");
    expect(exportSource).toContain("getCashAdvanceDashboard");
    expect(exportSource).toContain("Cash Advance");
    expect(exportSource).toContain("getPettyCashDashboard");
    expect(exportSource).toContain("Petty Cash Fund");
    expect(exportSource).toContain("financeExpenseRequestView");
    expect(exportSource).toContain("financeCashAdvanceView");
    expect(exportSource).toContain("financePettyCashView");
    expect(exportSource).not.toContain("paymentRelease.updateMany");
    expect(exportSource).not.toContain("financeJournal.create");
  });

  it("exports scoped bank and cash report rows from the bank cash workspace", () => {
    const exportSource = functionSlice(financeServiceSource, "buildBankCashExportRows");

    expect(exportSource).toContain("getFinanceFoundationDashboard");
    expect(exportSource).toContain("Bank Cash Report");
    expect(exportSource).toContain("Bank Account");
    expect(exportSource).toContain("Branch Cash Deposit");
    expect(exportSource).toContain("Bank Statement Line");
    expect(exportSource).toContain("Reconciliation");
    expect(exportSource).toContain("READ_ONLY");
    expect(exportSource).not.toContain("paymentRelease.updateMany");
    expect(exportSource).not.toContain("bankReconciliation.updateMany");
    expect(exportSource).not.toContain("financeJournal.create");
    expect(financeSubworkspaceSource).toContain("Export Bank & Cash CSV");
    expect(financeSubworkspaceSource).toContain("/finance/bank-cash/export");
    expect(bankCashExportRouteSource).toContain("buildBankCashExportRows");
    expect(bankCashExportRouteSource).toContain("phase-3-bank-cash");
    expect(bankCashExportRouteSource).toContain("checksumHeader: true");
  });
});
