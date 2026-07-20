import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import type { Prisma, TransactionClient } from "@ogfi/database";
import {
  canUseFinance,
  permissions,
  requirePermission
} from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext
} from "./context";
import type { CsvRow } from "./csv";
import {
  recordWorkflowNotifications,
  resolveScopedNotificationRecipients
} from "./notifications";
import {
  phase3EvidenceUploadBlockerId,
  resolveEvidenceReadiness,
  type EvidenceCaptureMode,
  type EvidenceProductionReadiness
} from "./attachments";
import {
  getPaymentReleaseEvidencePolicy,
  getPaymentReleaseSettlementPolicy,
  type PaymentReleaseSettlementPolicy
} from "./policySettings";
import {
  getBudgetControlDashboard,
  projectBudgetCommitmentFromApprovedSourceEvent,
  reverseBudgetCommitmentFromApprovedSourceEvent
} from "./budgetControl";
import { getExpenseRequestDashboard } from "./expenseRequests";
import { getCashAdvanceDashboard } from "./cashAdvances";
import { getPettyCashDashboard } from "./pettyCash";

type BadgeTone = "neutral" | "info" | "success" | "warning";

export type FinanceFoundationMetric = {
  id: string;
  label: string;
  displayValue: string;
  detail: string;
  tone: BadgeTone;
};

export type FinanceSourceChainRow = {
  id: string;
  purchaseOrderReference: string;
  supplierName: string;
  status: string;
  totalAmount: number;
  currencyCode: string;
  receivedAmount: number;
  discrepancyCount: number;
  matchStatus: "READY_FOR_INVOICE" | "PARTIAL_RECEIPT" | "DISCREPANCY_REVIEW" | "AWAITING_RECEIPT";
  sourceHref: string;
};

export type FinanceGuardrail = {
  label: string;
  detail: string;
  tone: BadgeTone;
};

export type FinanceJournalRow = {
  id: string;
  publicReference: string;
  journalType: string;
  status: string;
  journalDate: string;
  description: string;
  totalDebitAmountPhp: number;
  totalCreditAmountPhp: number;
  lineCount: number;
  sourceHref: string;
};

export type ApInvoiceQueueRow = {
  id: string;
  publicReference: string;
  supplierInvoiceNumber: string;
  supplierName: string;
  status: string;
  matchStatus: string;
  duplicateRisk: string;
  invoiceDate: string;
  totalAmount: number;
  paymentOutstandingAmount: number;
  paymentReady: boolean;
  paymentPreparationStatus: string;
  currencyCode: string;
  lineCount: number;
  exceptionCount: number;
  sourceHref: string;
};

export type PaymentRequestQueueRow = {
  id: string;
  publicReference: string;
  supplierName: string;
  status: string;
  totalRequestedAmount: number;
  currencyCode: string;
  lineCount: number;
  requestedBy: string;
  createdAt: string;
};

export type SupplierCreditNoteQueueRow = {
  id: string;
  publicReference: string;
  supplierCreditNoteNumber: string;
  originalInvoiceReference: string;
  supplierName: string;
  status: string;
  creditDate: string;
  creditAmount: number;
  currencyCode: string;
  reasonCode: string;
  evidenceReference: string | null;
  createdBy: string;
  createdAt: string;
};

export type PayablesReportRow = {
  id: string;
  rowType: "AP_INVOICE" | "SUPPLIER_CREDIT" | "PAYMENT_REQUEST";
  reference: string;
  supplierName: string;
  status: string;
  amount: number;
  openAmount: number;
  currencyCode: string;
  ageBucket: "CURRENT" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_90_PLUS" | "PENDING_CREDIT" | "PAYMENT_PREP";
  detail: string;
};

export type PaymentReleaseQueueRow = {
  id: string;
  publicReference: string;
  paymentRequestReference: string;
  supplierName: string;
  bankAccountId: string;
  bankName: string;
  method: string;
  status: string;
  releaseAmount: number;
  releasedAmount: number;
  reconciliationMatchedAmount: number;
  reconciliationMatchCount: number;
  currencyCode: string;
  createdBy: string;
  releasedBy: string | null;
  releaseReference: string | null;
  evidenceReference: string | null;
  createdAt: string;
};

export type PaymentReleaseReportRow = {
  id: string;
  publicReference: string;
  paymentRequestReference: string;
  supplierName: string;
  bankName: string;
  method: string;
  status: string;
  settlementState:
    | "NOT_RELEASED"
    | "PARTIALLY_RELEASED"
    | "RELEASED"
    | "RECONCILED"
    | "EXCEPTION";
  releaseAmount: number;
  releasedAmount: number;
  remainingAmount: number;
  currencyCode: string;
  evidenceState: "COMPLETE" | "MISSING";
  evidenceCaptureMode: EvidenceCaptureMode;
  evidenceProductionReadiness: EvidenceProductionReadiness;
  evidenceBlockerId: string | null;
  releaseReference: string | null;
  exportSafeSummary: string;
};

export type PaymentReleaseSettlementReadinessRow = {
  id: string;
  paymentReleaseId: string;
  publicReference: string;
  paymentRequestReference: string;
  supplierName: string;
  bankName: string;
  method: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  issueType:
    | "NOT_RELEASED"
    | "PARTIAL_RELEASE"
    | "MISSING_EVIDENCE"
    | "RECONCILIATION_PENDING"
    | "SETTLEMENT_EXCEPTION";
  issueLabel: string;
  amount: number | null;
  currencyCode: string;
  nextAction: string;
  blockerId: string | null;
};

export type BankCashAccountRow = {
  id: string;
  publicReference: string;
  bankName: string;
  maskedAccountNumber: string;
  accountType: string;
  status: string;
  currencyCode: string;
  scopeLabel: string;
  depositCount: number;
  statementCount: number;
  reconciliationCount: number;
};

export type BranchCashDepositQueueRow = {
  id: string;
  publicReference: string;
  bankAccountId: string;
  locationName: string;
  bankName: string;
  depositDate: string;
  amountPhp: number;
  status: string;
  depositSlipNumber: string | null;
  evidenceReference: string | null;
  declaredBy: string;
};

export type BankStatementLineQueueRow = {
  id: string;
  publicReference: string;
  bankAccountId: string;
  bankName: string;
  transactionDate: string;
  bankReference: string;
  description: string;
  netAmount: number;
  matchedAmount: number;
  status: string;
};

export type BankReconciliationQueueRow = {
  id: string;
  publicReference: string;
  bankAccountId: string;
  bankName: string;
  statementReference: string;
  status: string;
  preparedAt: string;
  varianceAmount: number;
  matchCount: number;
};

export type BankCashSummary = {
  accounts: BankCashAccountRow[];
  deposits: BranchCashDepositQueueRow[];
  statementLines: BankStatementLineQueueRow[];
  reconciliations: BankReconciliationQueueRow[];
};

export type BankCashReportRow = {
  id: string;
  bankName: string;
  maskedAccountNumber: string;
  scopeLabel: string;
  status: string;
  currencyCode: string;
  depositCount: number;
  depositAmountPhp: number;
  statementLineCount: number;
  unmatchedStatementCount: number;
  reconciliationCount: number;
  varianceAmountPhp: number;
  evidenceGapCount: number;
  readinessState: "READY" | "NEEDS_REVIEW" | "NO_ACTIVITY";
  readinessIssues: string[];
  exportSafeSummary: string;
};

export type BankCashExceptionRow = {
  id: string;
  bankAccountId: string;
  bankName: string;
  maskedAccountNumber: string;
  scopeLabel: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  issueType:
    | "DEPOSIT_EVIDENCE_GAP"
    | "UNMATCHED_STATEMENT_LINES"
    | "RECONCILIATION_VARIANCE"
    | "NO_ACTIVITY";
  issueLabel: string;
  count: number | null;
  amountPhp: number | null;
  currencyCode: string;
  nextAction: string;
};

export type FinanceDraftOption = {
  id: string;
  label: string;
  detail: string;
};

export type FinanceConfigurationSummary = {
  fiscalYear: {
    id: string;
    code: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    isDefault: boolean;
  } | null;
  fiscalYears: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    isDefault: boolean;
    periodCount: number;
  }>;
  openPeriods: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
  }>;
  accountingPeriods: Array<{
    id: string;
    fiscalYearId: string;
    fiscalYearCode: string;
    periodNumber: number;
    code: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
  accountClassCount: number;
  postingAccountCount: number;
  postingRules: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    sourceType: string;
    sourceEvent: string;
    isExecutionEnabled: boolean;
    isConfigOnly: boolean;
    accountMapCount: number;
    dimensionRequirementCount: number;
  }>;
};

export type FinanceFoundationDashboard = {
  generatedAt: string;
  scope: {
    companyName: string;
    brandName: string;
    locationName: string;
    locationType: string;
  };
  permissions: {
    canConfigure: boolean;
    canViewLedger: boolean;
    canCreateJournal: boolean;
    canSubmitJournal: boolean;
    canApproveJournal: boolean;
    canPostJournal: boolean;
    canReverseJournal: boolean;
    canViewPayables: boolean;
    canCreateApInvoice: boolean;
    canSubmitApInvoice: boolean;
    canMatchApInvoice: boolean;
    canCancelApInvoice: boolean;
    canCreateSupplierCredit: boolean;
    canSubmitSupplierCredit: boolean;
    canCancelSupplierCredit: boolean;
    canCreatePaymentRequest: boolean;
    canApprovePaymentRequest: boolean;
    canReleasePayment: boolean;
    canCreateCashDeposit: boolean;
    canViewReconciliation: boolean;
    canMatchReconciliation: boolean;
    canManagePeriodClose: boolean;
  };
  metrics: FinanceFoundationMetric[];
  sourceChain: FinanceSourceChainRow[];
  draftOptions: {
    journalAccounts: FinanceDraftOption[];
    suppliers: FinanceDraftOption[];
    purchaseOrders: FinanceDraftOption[];
  };
  configuration: FinanceConfigurationSummary;
  recentJournals: FinanceJournalRow[];
  apInvoices: ApInvoiceQueueRow[];
  supplierCreditNotes: SupplierCreditNoteQueueRow[];
  paymentRequests: PaymentRequestQueueRow[];
  payablesReportRows: PayablesReportRow[];
  paymentReleases: PaymentReleaseQueueRow[];
  paymentReleaseReportRows: PaymentReleaseReportRow[];
  paymentReleaseSettlementReadinessRows: PaymentReleaseSettlementReadinessRow[];
  paymentReleaseSettlementPolicy: {
    key: string;
    policy: PaymentReleaseSettlementPolicy;
    isOverridden: boolean;
    sourceDecisionId: string;
  };
  bankCash: BankCashSummary;
  bankCashReportRows: BankCashReportRow[];
  bankCashExceptionRows: BankCashExceptionRow[];
  guardrails: FinanceGuardrail[];
};

type FinanceSourcePurchaseOrder = {
  id: string;
  publicReference: string;
  status: string;
  totalAmount: unknown;
  currencyCode: string;
  supplier: {
    displayName?: string | null;
    tradingName?: string | null;
    legalName?: string | null;
    supplierCode?: string | null;
  };
  goodsReceipts: Array<{
    id: string;
    status: string;
    discrepancyFlag: boolean;
    lines: Array<{
      acceptedQty: unknown;
      unitCost: unknown;
    }>;
  }>;
};

type ManualJournalLineInput = {
  accountId: string;
  amountSide: "DEBIT" | "CREDIT";
  amountPhp: number;
  lineDescription: string;
  brandId?: string | null;
  locationId?: string | null;
  departmentId?: string | null;
  costCenterId?: string | null;
  projectId?: string | null;
  supplierId?: string | null;
};

type ManualJournalDraftInput = {
  accountingPeriodId: string;
  journalDate: Date;
  description: string;
  businessJustification: string;
  evidenceReference?: string | null;
  sourceEventKey?: string | null;
  lines: ManualJournalLineInput[];
};

type FinanceJournalActionInput = {
  journalId: string;
  remarks?: string | null;
  idempotencyKey?: string | null;
};

type FinanceJournalReverseInput = FinanceJournalActionInput & {
  reversalReason: string;
};

type ApInvoiceLineInput = {
  description: string;
  invoicedQty: number;
  unitPrice: number;
  taxAmount?: number;
  discountAmount?: number;
  purchaseOrderLineId?: string | null;
  goodsReceiptLineId?: string | null;
  itemId?: string | null;
  uomId?: string | null;
};

type ApInvoiceDraftInput = {
  supplierId: string;
  supplierInvoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date | null;
  paymentTermsDays?: number | null;
  purchaseOrderId?: string | null;
  goodsReceiptId?: string | null;
  nonPoReason?: string | null;
  evidenceReference?: string | null;
  captureIdempotencyKey?: string | null;
  freightAmount?: number;
  lines: ApInvoiceLineInput[];
};

type ApInvoiceActionInput = {
  apInvoiceId: string;
  remarks?: string | null;
};

type ApInvoiceBudgetProjectionSource = {
  id: string;
  publicReference: string;
  supplierInvoiceNumber: string;
  lines: Array<{
    id: string;
    lineNumber: number;
    description: string;
    budgetLineId: string | null;
    lineTotalAmount: unknown;
  }>;
};

type SupplierCreditNoteDraftInput = {
  originalApInvoiceId: string;
  supplierCreditNoteNumber: string;
  creditDate: Date;
  creditAmount: number;
  reasonCode: string;
  reasonDescription: string;
  evidenceReference?: string | null;
  applicationNotes?: string | null;
  idempotencyKey?: string | null;
};

type SupplierCreditNoteActionInput = {
  supplierCreditNoteId: string;
  reason?: string | null;
};

type PaymentRequestDraftInput = {
  apInvoiceId?: string;
  requestedAmount?: number | null;
  requestReason: string;
  evidenceReference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  lines?: Array<{
    apInvoiceId: string;
    requestedAmount?: number | null;
    notes?: string | null;
  }>;
};

type PaymentRequestActionInput = {
  paymentRequestId: string;
  remarks?: string | null;
};

type PaymentReleaseDraftInput = {
  paymentRequestId: string;
  bankAccountId: string;
  releaseAmount?: number | null;
  method?: "BANK_TRANSFER" | "CHECK" | "CASH" | "MANUAL_REFERENCE";
  reason: string;
  evidenceReference?: string | null;
  scheduledAt?: Date | null;
  idempotencyKey?: string | null;
  sourceEventKey?: string | null;
};

type BranchCashDepositDeclarationInput = {
  bankAccountId: string;
  depositDate: Date;
  amountPhp: number;
  depositSlipNumber?: string | null;
  evidenceReference?: string | null;
  notes?: string | null;
  sourceEventKey?: string | null;
};

type PaymentReleaseActionInput = {
  paymentReleaseId: string;
  remarks?: string | null;
  reason?: string | null;
  evidenceReference?: string | null;
  idempotencyKey?: string | null;
};

type PaymentReleaseExecuteInput = PaymentReleaseActionInput & {
  releaseReference: string;
  evidenceReference: string;
  idempotencyKey: string;
};

type PaymentReleaseFailureInput = PaymentReleaseActionInput & {
  failureCode: string;
};

type PaymentReleaseReconciliationInput = PaymentReleaseActionInput & {
  outcome: "FULLY_RECONCILED" | "PARTIALLY_RECONCILED" | "EXCEPTION";
  matchedAmount?: number | null;
  bankReference?: string | null;
};

type PaymentReleaseBankMatchInput = PaymentReleaseActionInput & {
  reconciliationId: string;
  statementLineId: string;
  matchedAmount?: number | null;
};

type FiscalYearSetupInput = {
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isDefault?: boolean;
  openFirstPeriod?: boolean;
  reason: string;
};

type FiscalYearActionInput = {
  fiscalYearId: string;
  reason: string;
};

type AccountingPeriodActionInput = {
  accountingPeriodId: string;
  reason: string;
};

type BranchCashDepositBankMatchInput = {
  branchCashDepositId: string;
  reconciliationId: string;
  statementLineId: string;
  matchedAmount?: number | null;
  reason?: string | null;
  evidenceReference?: string | null;
  idempotencyKey?: string | null;
};

async function requirePaymentReleaseExecutionEvidence(
  session: SessionContext,
  method: PaymentReleaseDraftInput["method"],
  evidenceReference: string
) {
  const evidencePolicy = await getPaymentReleaseEvidencePolicy(session);
  const rule =
    evidencePolicy.policy[method ?? "BANK_TRANSFER"] ??
    evidencePolicy.policy.BANK_TRANSFER;
  if (rule.executionEvidenceRequired && !evidenceReference.trim()) {
    throw new Error("PAYMENT_RELEASE_EXECUTION_EVIDENCE_REQUIRED");
  }
  return {
    evidenceLabel: rule.evidenceLabel,
    evidencePolicyKey: evidencePolicy.key,
    evidencePolicySourceDecisionId: evidencePolicy.sourceDecisionId,
    evidencePolicyOverridden: evidencePolicy.isOverridden
  };
}

type ApInvoiceMatchLine = {
  invoiceLineId?: string | null;
  purchaseOrderLineId?: string | null;
  goodsReceiptLineId?: string | null;
  poQty?: number | null;
  receivedQty: number;
  invoicedQty: number;
  poUnitPrice?: number | null;
  invoicedUnitPrice: number;
  poLineTotal?: number | null;
  invoicedLineTotal: number;
  taxVarianceAmount?: number;
};

export type ApInvoiceMatchEvaluation = {
  status: "EXACT_MATCH" | "WITHIN_TOLERANCE" | "VARIANCE_HOLD";
  exceptionCode?: string;
  exceptionNotes?: string;
  qtyVariance: number;
  amountVariance: number;
};

function money(value: number, currencyCode = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0
  }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 0
  }).format(value);
}

function decimalToNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }
  return 0;
}

function receivedLineAmount(line: { acceptedQty: unknown; unitCost: unknown }) {
  return decimalToNumber(line.acceptedQty) * decimalToNumber(line.unitCost);
}

function assertPhpOnly(currencyCode: string) {
  if (currencyCode !== "PHP") {
    throw new Error("FINANCE_JOURNAL_PHP_ONLY");
  }
}

function assertApPhpOnly(currencyCode: string) {
  if (currencyCode !== "PHP") {
    throw new Error("AP_INVOICE_PHP_ONLY");
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function lineTotalFromApInput(line: ApInvoiceLineInput) {
  if (!Number.isFinite(line.invoicedQty) || line.invoicedQty <= 0) {
    throw new Error("AP_INVOICE_LINE_QTY_INVALID");
  }
  if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
    throw new Error("AP_INVOICE_LINE_PRICE_INVALID");
  }
  if (!line.description.trim()) {
    throw new Error("AP_INVOICE_LINE_DESCRIPTION_REQUIRED");
  }
  const taxAmount = line.taxAmount ?? 0;
  const discountAmount = line.discountAmount ?? 0;
  if (taxAmount < 0 || discountAmount < 0) {
    throw new Error("AP_INVOICE_LINE_AMOUNT_INVALID");
  }
  return roundMoney(line.invoicedQty * line.unitPrice + taxAmount - discountAmount);
}

function duplicateFingerprint(input: ApInvoiceDraftInput) {
  return createHash("sha256")
    .update(
      [
        input.supplierId,
        input.supplierInvoiceNumber.trim().toUpperCase(),
        input.invoiceDate.toISOString().slice(0, 10),
        input.lines.reduce((sum, line) => sum + lineTotalFromApInput(line), 0)
      ].join("|")
    )
    .digest("hex");
}

export function evaluateApInvoiceMatchLine(
  line: ApInvoiceMatchLine,
  tolerance = { amountPhp: 1, qty: 0 }
): ApInvoiceMatchEvaluation {
  if (!line.purchaseOrderLineId || !line.goodsReceiptLineId) {
    return {
      status: "VARIANCE_HOLD",
      exceptionCode: "SOURCE_LINK_REQUIRED",
      exceptionNotes: "Invoice line must link to both the purchase order line and accepted receipt line.",
      qtyVariance: line.invoicedQty,
      amountVariance: line.invoicedLineTotal
    };
  }

  const qtyVariance = roundMoney(line.invoicedQty - line.receivedQty);
  const expectedAmount =
    line.poLineTotal ?? roundMoney(line.receivedQty * (line.poUnitPrice ?? 0));
  const amountVariance = roundMoney(line.invoicedLineTotal - expectedAmount);

  if (qtyVariance === 0 && amountVariance === 0 && (line.taxVarianceAmount ?? 0) === 0) {
    return {
      status: "EXACT_MATCH",
      qtyVariance,
      amountVariance
    };
  }

  if (
    Math.abs(qtyVariance) <= tolerance.qty &&
    Math.abs(amountVariance) <= tolerance.amountPhp &&
    Math.abs(line.taxVarianceAmount ?? 0) <= tolerance.amountPhp
  ) {
    return {
      status: "WITHIN_TOLERANCE",
      exceptionCode: "WITHIN_TOLERANCE",
      exceptionNotes: "Invoice variance is inside the configured AP review tolerance.",
      qtyVariance,
      amountVariance
    };
  }

  return {
    status: "VARIANCE_HOLD",
    exceptionCode: qtyVariance !== 0 ? "QTY_VARIANCE" : "AMOUNT_VARIANCE",
    exceptionNotes: "Invoice line differs from accepted receiving or purchase order basis.",
    qtyVariance,
    amountVariance
  };
}

function calculateJournalTotals(lines: ManualJournalLineInput[]) {
  if (lines.length < 2) {
    throw new Error("FINANCE_JOURNAL_MINIMUM_TWO_LINES");
  }

  return lines.reduce(
    (totals, line) => {
      if (!Number.isFinite(line.amountPhp) || line.amountPhp <= 0) {
        throw new Error("FINANCE_JOURNAL_LINE_AMOUNT_INVALID");
      }
      if (!line.lineDescription.trim()) {
        throw new Error("FINANCE_JOURNAL_LINE_DESCRIPTION_REQUIRED");
      }
      if (line.amountSide === "DEBIT") {
        totals.debit += line.amountPhp;
      } else if (line.amountSide === "CREDIT") {
        totals.credit += line.amountPhp;
      } else {
        throw new Error("FINANCE_JOURNAL_LINE_SIDE_INVALID");
      }
      return totals;
    },
    { debit: 0, credit: 0 }
  );
}

export function assertBalancedJournal(lines: ManualJournalLineInput[]) {
  const totals = calculateJournalTotals(lines);
  if (Math.round(totals.debit * 1000000) !== Math.round(totals.credit * 1000000)) {
    throw new Error("FINANCE_JOURNAL_NOT_BALANCED");
  }
  return totals;
}

function reverseSide(side: "DEBIT" | "CREDIT"): "DEBIT" | "CREDIT" {
  return side === "DEBIT" ? "CREDIT" : "DEBIT";
}

async function nextFinanceJournalReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.financeJournal.count({
    where: {
      companyId,
      publicReference: { startsWith: `FJ-${year}-` }
    }
  });
  return `FJ-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function nextApInvoiceReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.apInvoice.count({
    where: {
      companyId,
      publicReference: { startsWith: `AP-INV-${year}-` }
    }
  });
  return `AP-INV-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function nextSupplierCreditNoteReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.supplierCreditNote.count({
    where: {
      companyId,
      publicReference: { startsWith: `AP-CN-${year}-` }
    }
  });
  return `AP-CN-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function nextPaymentRequestReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.paymentRequest.count({
    where: {
      companyId,
      publicReference: { startsWith: `PAY-${year}-` }
    }
  });
  return `PAY-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function findPaymentRequestApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "PaymentRequest",
      isActive: true
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  });
}

async function nextPaymentReleaseReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.paymentRelease.count({
    where: {
      companyId,
      publicReference: { startsWith: `REL-${year}-` }
    }
  });
  return `REL-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function findPaymentReleaseApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "PaymentRelease",
      isActive: true
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  });
}

async function nextBranchCashDepositReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.branchCashDeposit.count({
    where: {
      companyId,
      publicReference: { startsWith: `BCD-${year}-` }
    }
  });
  return `BCD-${year}-${String(count + 1).padStart(5, "0")}`;
}

function requireReleaseReason(value: string | null | undefined, errorCode: string) {
  if (!value?.trim()) {
    throw new Error(errorCode);
  }
  return value.trim();
}

function requireReleaseEvidence(
  value: string | null | undefined,
  errorCode: string
) {
  if (!value?.trim()) {
    throw new Error(errorCode);
  }
  return value.trim();
}

function assertPaymentReleaseStatus(
  status: string,
  allowed: string[],
  errorCode = "PAYMENT_RELEASE_INVALID_STATUS_TRANSITION"
) {
  if (!allowed.includes(status)) {
    throw new Error(errorCode);
  }
}

function assertPaymentReleaseSegregation(
  session: SessionContext,
  release: {
    createdByUserId: string;
    releasedByUserId?: string | null;
    paymentRequest: {
      requestedByUserId: string;
      approvedByUserId?: string | null;
    };
  },
  errorCode: string
) {
  if (
    release.createdByUserId === session.user.id ||
    release.releasedByUserId === session.user.id ||
    release.paymentRequest.requestedByUserId === session.user.id ||
    release.paymentRequest.approvedByUserId === session.user.id
  ) {
    throw new Error(errorCode);
  }
}

async function writePaymentReleaseAudit(
  tx: TransactionClient,
  input: {
  session: SessionContext;
  releaseId: string;
  eventType: string;
  beforeStatus: string;
  afterStatus: string;
  reason?: string | null;
  evidenceReference?: string | null;
  metadata?: Record<string, unknown>;
  }
) {
  await tx.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: input.eventType,
      entityType: "PaymentRelease",
      entityId: input.releaseId,
      beforeData: { status: input.beforeStatus },
      afterData: {
        status: input.afterStatus,
        reason: input.reason ?? null,
        evidenceReference: input.evidenceReference ?? null
      },
      metadata: {
        noSourceMutation: true,
        noApMutation: true,
        noProcurementMutation: true,
        noInventoryMutation: true,
        noBankApiCall: true,
        noJournalPosting: true,
        ...(input.metadata ?? {})
      }
    }
  });
}

function assertPaymentRequestEligibleInvoice(invoice: {
  status: string;
  matchStatus: string;
  duplicateRisk: string;
  currencyCode: string;
  evidenceReference: string | null;
}) {
  assertApPhpOnly(invoice.currencyCode);
  const eligibleStatus = ["MATCHED", "MATCHED_WITHIN_TOLERANCE", "APPROVED_EXCEPTION"];
  const eligibleMatch = ["EXACT_MATCH", "WITHIN_TOLERANCE", "APPROVED_EXCEPTION"];
  if (!eligibleStatus.includes(invoice.status) && !eligibleMatch.includes(invoice.matchStatus)) {
    throw new Error("PAYMENT_REQUEST_INVOICE_NOT_ELIGIBLE");
  }
  if (invoice.duplicateRisk === "BLOCKED" || invoice.duplicateRisk === "POTENTIAL") {
    throw new Error("PAYMENT_REQUEST_DUPLICATE_RISK_BLOCKED");
  }
  if (!invoice.evidenceReference) {
    throw new Error("PAYMENT_REQUEST_EVIDENCE_REQUIRED");
  }
}

async function assertJournalAccountsArePostable(
  session: SessionContext,
  lines: ManualJournalLineInput[]
) {
  const accountIds = [...new Set(lines.map((line) => line.accountId))];
  const accounts = await prisma.chartOfAccount.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      id: { in: accountIds },
      status: "ACTIVE",
      postingAllowed: true,
      isHeader: false
    },
    select: { id: true }
  });
  if (accounts.length !== accountIds.length) {
    throw new Error("FINANCE_JOURNAL_ACCOUNT_NOT_POSTABLE");
  }
}

async function requireOpenAccountingPeriod(
  session: SessionContext,
  accountingPeriodId: string
) {
  const period = await prisma.accountingPeriod.findFirst({
    where: {
      id: accountingPeriodId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      code: true
    }
  });
  if (!period) {
    throw new Error("ACCOUNTING_PERIOD_NOT_FOUND");
  }
  if (period.status !== "OPEN") {
    throw new Error("ACCOUNTING_PERIOD_NOT_OPEN");
  }
  return period;
}

function supplierName(supplier: FinanceSourcePurchaseOrder["supplier"]) {
  return (
    supplier.displayName ??
    supplier.tradingName ??
    supplier.legalName ??
    supplier.supplierCode ??
    "Supplier"
  );
}

function resolveMatchStatus(order: FinanceSourcePurchaseOrder): FinanceSourceChainRow["matchStatus"] {
  const postedReceipts = order.goodsReceipts.filter((receipt) =>
    receipt.status.startsWith("POSTED")
  );
  const discrepancyCount = postedReceipts.filter(
    (receipt) => receipt.discrepancyFlag || receipt.status === "POSTED_WITH_DISCREPANCY"
  ).length;

  if (discrepancyCount > 0) {
    return "DISCREPANCY_REVIEW";
  }
  if (postedReceipts.length === 0) {
    return "AWAITING_RECEIPT";
  }
  if (order.status === "FULLY_RECEIVED") {
    return "READY_FOR_INVOICE";
  }
  return "PARTIAL_RECEIPT";
}

export function assertFinanceAccess(session: SessionContext) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
}

function requireText(value: string | null | undefined, errorCode: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(errorCode);
  }
  return trimmed;
}

function normalizeFiscalYearCode(value: string) {
  return requireText(value, "FISCAL_YEAR_CODE_REQUIRED")
    .toUpperCase()
    .replaceAll(/\s+/g, "-");
}

function assertValidDate(value: Date, errorCode: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(errorCode);
  }
}

function dateOnlyUtc(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}

function addUtcDays(value: Date, days: number) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate() + days
    )
  );
}

function nextUtcMonthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
}

function formatPeriodName(startDate: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(startDate);
}

function buildMonthlyAccountingPeriods(input: {
  fiscalYearCode: string;
  fiscalYearStartDate: Date;
  fiscalYearEndDate: Date;
  openFirstPeriod?: boolean;
}) {
  const periods: Array<{
    periodNumber: number;
    code: string;
    name: string;
    startDate: Date;
    endDate: Date;
    status: "FUTURE" | "OPEN";
  }> = [];
  let cursor = dateOnlyUtc(input.fiscalYearStartDate);
  const fiscalYearEndDate = dateOnlyUtc(input.fiscalYearEndDate);

  while (cursor.getTime() <= fiscalYearEndDate.getTime()) {
    if (periods.length >= 24) {
      throw new Error("FISCAL_YEAR_PERIOD_RANGE_TOO_LONG");
    }
    const nextMonthStart = nextUtcMonthStart(cursor);
    const monthEnd = addUtcDays(nextMonthStart, -1);
    const periodEnd =
      monthEnd.getTime() > fiscalYearEndDate.getTime()
        ? fiscalYearEndDate
        : monthEnd;
    const periodNumber = periods.length + 1;
    periods.push({
      periodNumber,
      code: `${input.fiscalYearCode}-P${String(periodNumber).padStart(2, "0")}`,
      name: formatPeriodName(cursor),
      startDate: cursor,
      endDate: periodEnd,
      status: input.openFirstPeriod && periodNumber === 1 ? "OPEN" : "FUTURE"
    });
    cursor = addUtcDays(periodEnd, 1);
  }

  if (periods.length === 0) {
    throw new Error("FISCAL_YEAR_PERIODS_REQUIRED");
  }

  return periods;
}

async function requireFinanceConfigurationAccess(session: SessionContext) {
  assertFinanceAccess(session);
  await requirePermission(session, permissions.financeConfigure);
}

async function writeFinanceConfigurationAudit(
  tx: TransactionClient,
  input: {
    session: SessionContext;
    entityType: "FiscalYear" | "AccountingPeriod";
    entityId: string;
    eventType: string;
    beforeData?: Prisma.InputJsonObject | null;
    afterData?: Prisma.InputJsonObject | null;
    reason: string;
    metadata?: Prisma.InputJsonObject;
  }
) {
  await tx.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.beforeData ? { beforeData: input.beforeData } : {}),
      ...(input.afterData ? { afterData: input.afterData } : {}),
      metadata: {
        reason: input.reason,
        configurationChange: true,
        noJournalPosting: true,
        noPaymentMutation: true,
        noProcurementMutation: true,
        noInventoryMutation: true,
        ...(input.metadata ?? {})
      }
    }
  });
}

export async function createFiscalYearWithMonthlyPeriods(
  session: SessionContext,
  input: FiscalYearSetupInput
) {
  await requireFinanceConfigurationAccess(session);
  const code = normalizeFiscalYearCode(input.code);
  const name = requireText(input.name, "FISCAL_YEAR_NAME_REQUIRED");
  const reason = requireText(input.reason, "FISCAL_YEAR_SETUP_REASON_REQUIRED");
  assertValidDate(input.startDate, "FISCAL_YEAR_START_DATE_INVALID");
  assertValidDate(input.endDate, "FISCAL_YEAR_END_DATE_INVALID");
  const startDate = dateOnlyUtc(input.startDate);
  const endDate = dateOnlyUtc(input.endDate);
  if (endDate.getTime() < startDate.getTime()) {
    throw new Error("FISCAL_YEAR_DATE_RANGE_INVALID");
  }

  const periods = buildMonthlyAccountingPeriods({
    fiscalYearCode: code,
    fiscalYearStartDate: startDate,
    fiscalYearEndDate: endDate,
    openFirstPeriod: Boolean(input.openFirstPeriod)
  });

  return prisma.$transaction(async (tx) => {
    const existingCode = await tx.fiscalYear.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        code
      },
      select: { id: true }
    });
    if (existingCode) {
      throw new Error("FISCAL_YEAR_CODE_ALREADY_EXISTS");
    }

    const overlappingFiscalYear = await tx.fiscalYear.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      },
      select: {
        code: true
      }
    });
    if (overlappingFiscalYear) {
      throw new Error("FISCAL_YEAR_DATE_RANGE_OVERLAPS");
    }

    const defaultFiscalYear = await tx.fiscalYear.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        isDefault: true
      },
      select: { id: true }
    });
    const isDefault = input.isDefault ?? !defaultFiscalYear;
    if (isDefault) {
      await tx.fiscalYear.updateMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          isDefault: true
        },
        data: {
          isDefault: false
        }
      });
    }

    const fiscalYear = await tx.fiscalYear.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        code,
        name,
        startDate,
        endDate,
        status: input.openFirstPeriod ? "OPEN" : "DRAFT",
        isDefault,
        createdByUserId: session.user.id,
        accountingPeriods: {
          create: periods.map((period) => ({
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            periodNumber: period.periodNumber,
            code: period.code,
            name: period.name,
            startDate: period.startDate,
            endDate: period.endDate,
            status: period.status,
            createdByUserId: session.user.id
          }))
        }
      },
      include: {
        accountingPeriods: {
          orderBy: { periodNumber: "asc" }
        }
      }
    });

    await writeFinanceConfigurationAudit(tx, {
      session,
      entityType: "FiscalYear",
      entityId: fiscalYear.id,
      eventType: "finance.fiscal_year.created",
      reason,
      afterData: {
        code: fiscalYear.code,
        name: fiscalYear.name,
        status: fiscalYear.status,
        startDate: fiscalYear.startDate.toISOString(),
        endDate: fiscalYear.endDate.toISOString(),
        isDefault: fiscalYear.isDefault,
        periodCount: fiscalYear.accountingPeriods.length
      },
      metadata: {
        monthlyPeriodsGenerated: true,
        openFirstPeriod: Boolean(input.openFirstPeriod)
      }
    });

    if (input.openFirstPeriod) {
      const firstPeriod = fiscalYear.accountingPeriods[0];
      if (firstPeriod) {
        await writeFinanceConfigurationAudit(tx, {
          session,
          entityType: "AccountingPeriod",
          entityId: firstPeriod.id,
          eventType: "finance.accounting_period.opened",
          reason,
          beforeData: { status: "FUTURE" },
          afterData: {
            status: firstPeriod.status,
            code: firstPeriod.code,
            fiscalYearCode: fiscalYear.code
          },
          metadata: {
            openedFromFiscalYearSetup: true
          }
        });
      }
    }

    return fiscalYear;
  });
}

export async function openFiscalYear(
  session: SessionContext,
  input: FiscalYearActionInput
) {
  await requireFinanceConfigurationAccess(session);
  const reason = requireText(input.reason, "FISCAL_YEAR_OPEN_REASON_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const fiscalYear = await tx.fiscalYear.findFirst({
      where: {
        id: input.fiscalYearId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      }
    });
    if (!fiscalYear) {
      throw new Error("FISCAL_YEAR_NOT_FOUND");
    }
    if (fiscalYear.status === "CLOSED") {
      throw new Error("FISCAL_YEAR_CLOSED");
    }
    if (fiscalYear.status === "OPEN") {
      return fiscalYear;
    }

    const updated = await tx.fiscalYear.update({
      where: { id: fiscalYear.id },
      data: {
        status: "OPEN"
      }
    });
    await writeFinanceConfigurationAudit(tx, {
      session,
      entityType: "FiscalYear",
      entityId: fiscalYear.id,
      eventType: "finance.fiscal_year.opened",
      reason,
      beforeData: { status: fiscalYear.status },
      afterData: { status: updated.status }
    });
    return updated;
  });
}

export async function openAccountingPeriod(
  session: SessionContext,
  input: AccountingPeriodActionInput
) {
  await requireFinanceConfigurationAccess(session);
  const reason = requireText(input.reason, "ACCOUNTING_PERIOD_OPEN_REASON_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.findFirst({
      where: {
        id: input.accountingPeriodId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      include: {
        fiscalYear: true
      }
    });
    if (!period) {
      throw new Error("ACCOUNTING_PERIOD_NOT_FOUND");
    }
    if (["SOFT_CLOSED", "LOCKED"].includes(period.status)) {
      throw new Error("ACCOUNTING_PERIOD_CLOSE_CONTROL_REQUIRED");
    }
    if (["OPEN", "REOPENED"].includes(period.status)) {
      return period;
    }

    const updatedPeriod = await tx.accountingPeriod.update({
      where: { id: period.id },
      data: {
        status: "OPEN"
      }
    });

    if (period.fiscalYear.status === "DRAFT") {
      await tx.fiscalYear.update({
        where: { id: period.fiscalYearId },
        data: {
          status: "OPEN"
        }
      });
    }

    await writeFinanceConfigurationAudit(tx, {
      session,
      entityType: "AccountingPeriod",
      entityId: period.id,
      eventType: "finance.accounting_period.opened",
      reason,
      beforeData: {
        status: period.status,
        fiscalYearStatus: period.fiscalYear.status
      },
      afterData: {
        status: updatedPeriod.status,
        fiscalYearStatus:
          period.fiscalYear.status === "DRAFT" ? "OPEN" : period.fiscalYear.status
      },
      metadata: {
        fiscalYearId: period.fiscalYearId,
        fiscalYearCode: period.fiscalYear.code
      }
    });

    return updatedPeriod;
  });
}

function resolvePaymentReleaseSettlementState(
  release: Pick<
    PaymentReleaseQueueRow,
    "status" | "releaseAmount" | "releasedAmount"
  >
): PaymentReleaseReportRow["settlementState"] {
  if (["EXCEPTION", "REVERSED", "CANCELLED"].includes(release.status)) {
    return "EXCEPTION";
  }
  if (["FULLY_RECONCILED", "PARTIALLY_RECONCILED"].includes(release.status)) {
    return "RECONCILED";
  }
  if (release.releasedAmount <= 0) {
    return "NOT_RELEASED";
  }
  if (release.releasedAmount < release.releaseAmount) {
    return "PARTIALLY_RELEASED";
  }
  return "RELEASED";
}

export function buildPaymentReleaseReportRows(
  rows: PaymentReleaseQueueRow[]
): PaymentReleaseReportRow[] {
  return rows.map((release) => {
    const remainingAmount = Math.max(
      release.releaseAmount - release.releasedAmount,
      0
    );
    const evidenceReadiness = resolveEvidenceReadiness({
      evidenceReference:
        release.evidenceReference && release.releaseReference
          ? release.evidenceReference
          : null
    });
    return {
      id: release.id,
      publicReference: release.publicReference,
      paymentRequestReference: release.paymentRequestReference,
      supplierName: release.supplierName,
      bankName: release.bankName,
      method: release.method,
      status: release.status,
      settlementState: resolvePaymentReleaseSettlementState(release),
      releaseAmount: release.releaseAmount,
      releasedAmount: release.releasedAmount,
      remainingAmount,
      currencyCode: release.currencyCode,
      evidenceState: evidenceReadiness.evidenceState,
      evidenceCaptureMode: evidenceReadiness.evidenceCaptureMode,
      evidenceProductionReadiness: evidenceReadiness.evidenceProductionReadiness,
      evidenceBlockerId: evidenceReadiness.evidenceBlockerId,
      releaseReference: release.releaseReference,
      exportSafeSummary: [
        release.publicReference,
        release.paymentRequestReference,
        release.status,
        release.supplierName,
        release.bankName,
        release.method,
        evidenceReadiness.evidenceState,
        evidenceReadiness.evidenceCaptureMode
      ].join(" / ")
    };
  });
}

const paymentReleaseReadinessPriority = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2
} as const;

export function buildPaymentReleaseSettlementReadinessRows(
  rows: PaymentReleaseReportRow[]
): PaymentReleaseSettlementReadinessRow[] {
  const readinessRows = rows.flatMap((release) => {
    const issues: PaymentReleaseSettlementReadinessRow[] = [];
    if (release.settlementState === "EXCEPTION") {
      issues.push({
        id: `${release.id}:settlement-exception`,
        paymentReleaseId: release.id,
        publicReference: release.publicReference,
        paymentRequestReference: release.paymentRequestReference,
        supplierName: release.supplierName,
        bankName: release.bankName,
        method: release.method,
        severity: "HIGH",
        issueType: "SETTLEMENT_EXCEPTION",
        issueLabel: "Release has an exception or reversal state",
        amount: release.releaseAmount,
        currencyCode: release.currencyCode,
        nextAction:
          "Review hold, failure, reversal, and reconciliation evidence before treating this release as settled.",
        blockerId: null
      });
    }
    if (release.settlementState === "NOT_RELEASED") {
      issues.push({
        id: `${release.id}:not-released`,
        paymentReleaseId: release.id,
        publicReference: release.publicReference,
        paymentRequestReference: release.paymentRequestReference,
        supplierName: release.supplierName,
        bankName: release.bankName,
        method: release.method,
        severity: "MEDIUM",
        issueType: "NOT_RELEASED",
        issueLabel: "Approved release is not yet recorded",
        amount: release.releaseAmount,
        currencyCode: release.currencyCode,
        nextAction:
          "Record release evidence only after payment proof is available and segregation checks pass.",
        blockerId: null
      });
    }
    if (release.settlementState === "PARTIALLY_RELEASED") {
      issues.push({
        id: `${release.id}:partial-release`,
        paymentReleaseId: release.id,
        publicReference: release.publicReference,
        paymentRequestReference: release.paymentRequestReference,
        supplierName: release.supplierName,
        bankName: release.bankName,
        method: release.method,
        severity: "HIGH",
        issueType: "PARTIAL_RELEASE",
        issueLabel: "Release amount is only partially recorded",
        amount: release.remainingAmount,
        currencyCode: release.currencyCode,
        nextAction:
          "Confirm whether the remaining amount should be released, held, failed, cancelled, or reversed.",
        blockerId: null
      });
    }
    if (
      release.evidenceState === "MISSING" ||
      !release.releaseReference
    ) {
      issues.push({
        id: `${release.id}:missing-evidence`,
        paymentReleaseId: release.id,
        publicReference: release.publicReference,
        paymentRequestReference: release.paymentRequestReference,
        supplierName: release.supplierName,
        bankName: release.bankName,
        method: release.method,
        severity: "HIGH",
        issueType: "MISSING_EVIDENCE",
        issueLabel: "Release proof or evidence reference is incomplete",
        amount: null,
        currencyCode: release.currencyCode,
        nextAction:
          "Upload method-specific release proof or link approved metadata; production retention and scan/waiver signoff remain for UAT.",
        blockerId: release.evidenceBlockerId ?? phase3EvidenceUploadBlockerId
      });
    }
    if (release.settlementState === "RELEASED") {
      issues.push({
        id: `${release.id}:reconciliation-pending`,
        paymentReleaseId: release.id,
        publicReference: release.publicReference,
        paymentRequestReference: release.paymentRequestReference,
        supplierName: release.supplierName,
        bankName: release.bankName,
        method: release.method,
        severity: "MEDIUM",
        issueType: "RECONCILIATION_PENDING",
        issueLabel: "Released payment is not reconciled yet",
        amount: release.releaseAmount,
        currencyCode: release.currencyCode,
        nextAction:
          "Send the release to bank reconciliation and match it to the authorized statement outflow.",
        blockerId: null
      });
    }
    return issues;
  });

  return readinessRows.sort((left, right) => {
    const priorityDelta =
      paymentReleaseReadinessPriority[left.severity] -
      paymentReleaseReadinessPriority[right.severity];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.publicReference.localeCompare(right.publicReference);
  });
}

export function buildBankCashReportRows(
  bankCash: BankCashSummary
): BankCashReportRow[] {
  return bankCash.accounts.map((account) => {
    const deposits = bankCash.deposits.filter(
      (deposit) => deposit.bankName === account.bankName
    );
    const statementLines = bankCash.statementLines.filter(
      (line) => line.bankName === account.bankName
    );
    const reconciliations = bankCash.reconciliations.filter(
      (reconciliation) => reconciliation.bankName === account.bankName
    );
    const depositAmountPhp = deposits.reduce(
      (sum, deposit) => sum + deposit.amountPhp,
      0
    );
    const unmatchedStatementCount = statementLines.filter(
      (line) => line.status !== "MATCHED" && line.netAmount !== line.matchedAmount
    ).length;
    const varianceAmountPhp = reconciliations.reduce(
      (sum, reconciliation) => sum + Math.abs(reconciliation.varianceAmount),
      0
    );
    const evidenceGapCount = deposits.filter(
      (deposit) => !deposit.depositSlipNumber || !deposit.evidenceReference
    ).length;
    const hasActivity =
      deposits.length > 0 || statementLines.length > 0 || reconciliations.length > 0;
    const readinessState =
      !hasActivity
        ? "NO_ACTIVITY"
        : unmatchedStatementCount > 0 ||
            varianceAmountPhp > 0 ||
            evidenceGapCount > 0
          ? "NEEDS_REVIEW"
          : "READY";
    const readinessIssues = [
      evidenceGapCount > 0
        ? `${evidenceGapCount} deposit evidence gap${evidenceGapCount === 1 ? "" : "s"}`
        : null,
      unmatchedStatementCount > 0
        ? `${unmatchedStatementCount} unmatched statement line${unmatchedStatementCount === 1 ? "" : "s"}`
        : null,
      varianceAmountPhp > 0
        ? `PHP ${varianceAmountPhp.toLocaleString("en-PH")} reconciliation variance`
        : null
    ].filter((issue): issue is string => Boolean(issue));

    return {
      id: account.id,
      bankName: account.bankName,
      maskedAccountNumber: account.maskedAccountNumber,
      scopeLabel: account.scopeLabel,
      status: account.status,
      currencyCode: account.currencyCode,
      depositCount: deposits.length,
      depositAmountPhp,
      statementLineCount: statementLines.length,
      unmatchedStatementCount,
      reconciliationCount: reconciliations.length,
      varianceAmountPhp,
      evidenceGapCount,
      readinessState,
      readinessIssues,
      exportSafeSummary: [
        account.publicReference,
        account.bankName,
        account.scopeLabel,
        readinessState,
        readinessIssues.length > 0
          ? `issues ${readinessIssues.join("; ")}`
          : "issues none",
        `${deposits.length} deposit(s)`,
        `${statementLines.length} statement line(s)`,
        `${reconciliations.length} reconciliation(s)`
      ].join(" / ")
    };
    });
}

const bankCashExceptionPriority = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2
} as const;

export function buildBankCashExceptionRows(
  rows: BankCashReportRow[]
): BankCashExceptionRow[] {
  const exceptionRows = rows.flatMap((row) => {
    const issues: BankCashExceptionRow[] = [];
    if (row.evidenceGapCount > 0) {
      issues.push({
        id: `${row.id}:deposit-evidence-gap`,
        bankAccountId: row.id,
        bankName: row.bankName,
        maskedAccountNumber: row.maskedAccountNumber,
        scopeLabel: row.scopeLabel,
        severity: "HIGH",
        issueType: "DEPOSIT_EVIDENCE_GAP",
        issueLabel: "Branch deposit evidence is incomplete",
        count: row.evidenceGapCount,
        amountPhp: null,
        currencyCode: row.currencyCode,
        nextAction:
          "Add deposit slip and evidence metadata before treating cash deposits as close-ready."
      });
    }
    if (row.unmatchedStatementCount > 0) {
      issues.push({
        id: `${row.id}:unmatched-statement-lines`,
        bankAccountId: row.id,
        bankName: row.bankName,
        maskedAccountNumber: row.maskedAccountNumber,
        scopeLabel: row.scopeLabel,
        severity: "HIGH",
        issueType: "UNMATCHED_STATEMENT_LINES",
        issueLabel: "Bank statement lines remain unmatched",
        count: row.unmatchedStatementCount,
        amountPhp: null,
        currencyCode: row.currencyCode,
        nextAction:
          "Match branch deposits or payment releases to statement lines, or document an exception for finance review."
      });
    }
    if (row.varianceAmountPhp > 0) {
      issues.push({
        id: `${row.id}:reconciliation-variance`,
        bankAccountId: row.id,
        bankName: row.bankName,
        maskedAccountNumber: row.maskedAccountNumber,
        scopeLabel: row.scopeLabel,
        severity: "HIGH",
        issueType: "RECONCILIATION_VARIANCE",
        issueLabel: "Reconciliation variance remains open",
        count: null,
        amountPhp: row.varianceAmountPhp,
        currencyCode: row.currencyCode,
        nextAction:
          "Resolve or approve the reconciliation variance before period-close signoff."
      });
    }
    if (row.readinessState === "NO_ACTIVITY") {
      issues.push({
        id: `${row.id}:no-activity`,
        bankAccountId: row.id,
        bankName: row.bankName,
        maskedAccountNumber: row.maskedAccountNumber,
        scopeLabel: row.scopeLabel,
        severity: "LOW",
        issueType: "NO_ACTIVITY",
        issueLabel: "No bank/cash activity captured for this account",
        count: null,
        amountPhp: null,
        currencyCode: row.currencyCode,
        nextAction:
          "Confirm whether this account should have deposit, statement, or reconciliation activity for the period."
      });
    }
    return issues;
  });

  return exceptionRows.sort((left, right) => {
    const priorityDelta =
      bankCashExceptionPriority[left.severity] -
      bankCashExceptionPriority[right.severity];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.bankName.localeCompare(right.bankName);
  });
}

function agingBucket(invoiceDate: string, generatedAt: string): PayablesReportRow["ageBucket"] {
  const ageMs = new Date(generatedAt).getTime() - new Date(invoiceDate).getTime();
  const ageDays = Math.max(0, Math.floor(ageMs / 86_400_000));
  if (ageDays <= 30) {
    return "CURRENT";
  }
  if (ageDays <= 60) {
    return "DAYS_31_60";
  }
  if (ageDays <= 90) {
    return "DAYS_61_90";
  }
  return "DAYS_90_PLUS";
}

export function buildPayablesReportRows(
  apInvoices: ApInvoiceQueueRow[],
  supplierCreditNotes: SupplierCreditNoteQueueRow[],
  paymentRequests: PaymentRequestQueueRow[],
  generatedAt = new Date().toISOString()
): PayablesReportRow[] {
  return [
    ...apInvoices.map((invoice) => ({
      id: invoice.id,
      rowType: "AP_INVOICE" as const,
      reference: invoice.publicReference,
      supplierName: invoice.supplierName,
      status: invoice.status,
      amount: invoice.totalAmount,
      openAmount: invoice.paymentOutstandingAmount,
      currencyCode: invoice.currencyCode,
      ageBucket: agingBucket(invoice.invoiceDate, generatedAt),
      detail: `${invoice.matchStatus.replaceAll("_", " ")}; payment ${invoice.paymentPreparationStatus.replaceAll("_", " ")}; ${invoice.exceptionCount} exception(s)`
    })),
    ...supplierCreditNotes.map((creditNote) => ({
      id: creditNote.id,
      rowType: "SUPPLIER_CREDIT" as const,
      reference: creditNote.publicReference,
      supplierName: creditNote.supplierName,
      status: creditNote.status,
      amount: creditNote.creditAmount,
      openAmount: creditNote.status === "CANCELLED" ? 0 : creditNote.creditAmount,
      currencyCode: creditNote.currencyCode,
      ageBucket: "PENDING_CREDIT" as const,
      detail: `Original invoice ${creditNote.originalInvoiceReference}; reason ${creditNote.reasonCode}`
    })),
    ...paymentRequests.map((request) => ({
      id: request.id,
      rowType: "PAYMENT_REQUEST" as const,
      reference: request.publicReference,
      supplierName: request.supplierName,
      status: request.status,
      amount: request.totalRequestedAmount,
      openAmount: ["REJECTED", "CANCELLED", "VOIDED"].includes(request.status)
        ? 0
        : request.totalRequestedAmount,
      currencyCode: request.currencyCode,
      ageBucket: "PAYMENT_PREP" as const,
      detail: `${request.lineCount} AP invoice line(s); requested by ${request.requestedBy}`
    }))
  ].sort((a, b) => a.supplierName.localeCompare(b.supplierName) || a.reference.localeCompare(b.reference));
}

export function buildFinanceFoundationDashboard(
  session: SessionContext,
  sourceOrders: FinanceSourcePurchaseOrder[],
  configuration: FinanceConfigurationSummary = {
    fiscalYear: null,
    fiscalYears: [],
    openPeriods: [],
    accountingPeriods: [],
    accountClassCount: 0,
    postingAccountCount: 0,
    postingRules: []
  },
  recentJournals: FinanceJournalRow[] = [],
  apInvoices: ApInvoiceQueueRow[] = [],
  supplierCreditNotes: SupplierCreditNoteQueueRow[] = [],
  paymentRequests: PaymentRequestQueueRow[] = [],
  paymentReleases: PaymentReleaseQueueRow[] = [],
  bankCash: BankCashSummary = {
    accounts: [],
    deposits: [],
    statementLines: [],
    reconciliations: []
  },
  paymentReleaseSettlementPolicy: FinanceFoundationDashboard["paymentReleaseSettlementPolicy"] = {
    key: "finance.payment_release.settlement_policy",
    policy: {
      releaseExecutionMode: "manual_evidence_only",
      apSettlementMutationAllowed: false,
      bankApiMutationAllowed: false,
      journalPostingAllowed: false,
      reconciliationRequiredBeforeSettlement: true,
      reversalRequiresReconciliationRecovery: true,
      uatRequiredBeforeSettlement: true,
      decisionBasis:
        "F&B pilot default allows manual evidence-backed payment release control and reconciliation matching only; AP settlement, bank mutation, and journal posting remain UAT-gated."
    },
    isOverridden: false,
    sourceDecisionId: "DEC-0036"
  },
  draftOptions: FinanceFoundationDashboard["draftOptions"] = {
    journalAccounts: [],
    suppliers: [],
    purchaseOrders: []
  }
): FinanceFoundationDashboard {
  const currencyCode =
    sourceOrders.find((order) => order.currencyCode)?.currencyCode ??
    "PHP";
  const sourceChain = sourceOrders.map((order) => {
    const postedReceipts = order.goodsReceipts.filter((receipt) =>
      receipt.status.startsWith("POSTED")
    );
    const receivedAmount = postedReceipts.reduce(
      (sum, receipt) =>
        sum +
        receipt.lines.reduce(
          (lineSum, line) => lineSum + receivedLineAmount(line),
          0
        ),
      0
    );
    const discrepancyCount = postedReceipts.filter(
      (receipt) =>
        receipt.discrepancyFlag || receipt.status === "POSTED_WITH_DISCREPANCY"
    ).length;

    return {
      id: order.id,
      purchaseOrderReference: order.publicReference,
      supplierName: supplierName(order.supplier),
      status: order.status,
      totalAmount: decimalToNumber(order.totalAmount),
      currencyCode: order.currencyCode,
      receivedAmount,
      discrepancyCount,
      matchStatus: resolveMatchStatus(order),
      sourceHref: `/purchase-orders/${order.id}`
    };
  });

  const openCommitmentAmount = sourceChain
    .filter((row) =>
      ["APPROVED", "ISSUED", "PARTIALLY_RECEIVED"].includes(row.status)
    )
    .reduce((sum, row) => sum + row.totalAmount, 0);
  const readyForInvoice = sourceChain.filter(
    (row) => row.matchStatus === "READY_FOR_INVOICE"
  ).length;
  const discrepancyRows = sourceChain.filter(
    (row) => row.matchStatus === "DISCREPANCY_REVIEW"
  ).length;
  const receivedAmount = sourceChain.reduce(
    (sum, row) => sum + row.receivedAmount,
    0
  );
  const paymentReleaseReportRows =
    buildPaymentReleaseReportRows(paymentReleases);
  const paymentReleaseSettlementReadinessRows =
    buildPaymentReleaseSettlementReadinessRows(paymentReleaseReportRows);
  const bankCashReportRows = buildBankCashReportRows(bankCash);
  const bankCashExceptionRows = buildBankCashExceptionRows(bankCashReportRows);
  const generatedAt = new Date().toISOString();
  const payablesReportRows = buildPayablesReportRows(
    apInvoices,
    supplierCreditNotes,
    paymentRequests,
    generatedAt
  );

  return {
    generatedAt,
    scope: {
      companyName: session.context.companyName,
      brandName: session.context.brandName,
      locationName: session.context.locationName,
      locationType: session.context.locationType
    },
    permissions: {
      canConfigure: session.permissionCodes.includes(permissions.financeConfigure),
      canViewLedger: session.permissionCodes.includes(permissions.financeLedgerView),
      canCreateJournal: session.permissionCodes.includes(
        permissions.financeJournalCreate
      ),
      canSubmitJournal: session.permissionCodes.includes(
        permissions.financeJournalSubmit
      ),
      canApproveJournal: session.permissionCodes.includes(
        permissions.financeJournalApprove
      ),
      canPostJournal: session.permissionCodes.includes(permissions.financeJournalPost),
      canReverseJournal: session.permissionCodes.includes(
        permissions.financeJournalReverse
      ),
      canViewPayables: session.permissionCodes.includes(permissions.financePayablesView),
      canCreateApInvoice: session.permissionCodes.includes(
        permissions.financeApInvoiceCreate
      ),
      canSubmitApInvoice: session.permissionCodes.includes(
        permissions.financeApInvoiceSubmit
      ),
      canMatchApInvoice: session.permissionCodes.includes(
        permissions.financeApInvoiceMatch
      ),
      canCancelApInvoice: session.permissionCodes.includes(
        permissions.financeApInvoiceCancel
      ),
      canCreateSupplierCredit: session.permissionCodes.includes(
        permissions.financeSupplierCreditCreate
      ),
      canSubmitSupplierCredit: session.permissionCodes.includes(
        permissions.financeSupplierCreditSubmit
      ),
      canCancelSupplierCredit: session.permissionCodes.includes(
        permissions.financeSupplierCreditCancel
      ),
      canCreatePaymentRequest: session.permissionCodes.includes(
        permissions.financePaymentRequestCreate
      ),
      canApprovePaymentRequest: session.permissionCodes.includes(
        permissions.financePaymentRequestApprove
      ),
      canReleasePayment: session.permissionCodes.includes(
        permissions.financePaymentRelease
      ),
      canCreateCashDeposit: session.permissionCodes.includes(
        permissions.financeCashDepositCreate
      ),
      canViewReconciliation: session.permissionCodes.includes(
        permissions.financeReconciliationView
      ),
      canMatchReconciliation: session.permissionCodes.includes(
        permissions.financeReconciliationMatch
      ),
      canManagePeriodClose: session.permissionCodes.includes(
        permissions.financePeriodCloseManage
      )
    },
    metrics: [
      {
        id: "open-commitments",
        label: "Open supplier commitments",
        displayValue: money(openCommitmentAmount, currencyCode),
        detail: "Approved, issued, or partially received POs in the selected operating scope.",
        tone: openCommitmentAmount > 0 ? "info" : "neutral"
      },
      {
        id: "received-value",
        label: "Received value basis",
        displayValue: money(receivedAmount, currencyCode),
        detail: "Accepted receiving value from posted goods receipts; this is not a journal yet.",
        tone: receivedAmount > 0 ? "success" : "neutral"
      },
      {
        id: "ready-for-invoice",
        label: "Ready for invoice review",
        displayValue: number(readyForInvoice),
        detail: "Fully received source chains ready for controlled invoice capture and matching.",
        tone: readyForInvoice > 0 ? "success" : "neutral"
      },
      {
        id: "discrepancy-review",
        label: "Discrepancy review",
        displayValue: number(discrepancyRows),
        detail: "Source chains with receiving discrepancies that must be cleared before payment release.",
        tone: discrepancyRows > 0 ? "warning" : "success"
      }
    ],
    sourceChain,
    draftOptions,
    configuration,
    recentJournals,
    apInvoices,
    supplierCreditNotes,
    paymentRequests,
    payablesReportRows,
    paymentReleases,
    paymentReleaseReportRows,
    paymentReleaseSettlementReadinessRows,
    paymentReleaseSettlementPolicy,
    bankCash,
    bankCashReportRows,
    bankCashExceptionRows,
    guardrails: [
      {
        label: "Source records remain authoritative",
        detail:
          "Finance reads PR, PO, receiving, supplier, inventory, and approval records but does not mutate their status in this foundation slice.",
        tone: "success"
      },
      {
        label: "Automated source posting remains gated",
        detail:
          "Manual journal posting is controlled by balance, period, approval, idempotency, and reversal checks. Automated PR, PO, receiving, inventory, AP, payment, and bank posting remains gated.",
        tone: "warning"
      },
      {
        label: "PHP-only baseline",
        detail:
          "Amounts are shown in the company operating currency. No multi-currency, FX, revaluation, or FX gain/loss behavior is enabled.",
        tone: "info"
      },
      {
        label: "Segregation of duties required",
        detail:
          "Payment preparation, approval, release, and high-risk journal review must be separate controlled actions before production use.",
        tone: "info"
      }
    ]
  };
}

export async function getFinanceFoundationDashboard(
  session: SessionContext
): Promise<FinanceFoundationDashboard> {
  assertFinanceAccess(session);

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId,
      status: {
        in: ["APPROVED", "ISSUED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED"]
      }
    },
    include: {
      supplier: true,
      goodsReceipts: {
        include: {
          lines: true
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 10
  });

  const [
    fiscalYear,
    fiscalYears,
    openPeriods,
    accountingPeriods,
    accountClassCount,
    postingAccountCount,
    postingRules,
    recentJournals,
    apInvoices,
    supplierCreditNotes,
    paymentRequests,
    paymentReleases,
    bankAccounts,
    branchCashDeposits,
    bankStatementLines,
    bankReconciliations,
    suppliers,
    invoiceSourceOrders,
    journalAccounts,
    paymentReleaseSettlementPolicy
  ] = await Promise.all([
    prisma.fiscalYear.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        isDefault: true
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        isDefault: true
      },
      orderBy: {
        startDate: "desc"
      }
    }),
    prisma.fiscalYear.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        isDefault: true,
        _count: {
          select: {
            accountingPeriods: true
          }
        }
      },
      orderBy: {
        startDate: "desc"
      },
      take: 12
    }),
    prisma.accountingPeriod.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: {
          in: ["OPEN", "REOPENED"]
        }
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true
      },
      orderBy: {
        startDate: "asc"
      },
      take: 3
    }),
    prisma.accountingPeriod.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      select: {
        id: true,
        fiscalYearId: true,
        periodNumber: true,
        code: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        fiscalYear: {
          select: {
            code: true
          }
        }
      },
      orderBy: [{ startDate: "desc" }, { periodNumber: "desc" }],
      take: 24
    }),
    prisma.financeAccountClass.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.chartOfAccount.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        postingAllowed: true
      }
    }),
    prisma.financePostingRule.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        sourceType: true,
        sourceEvent: true,
        isExecutionEnabled: true,
        isConfigOnly: true,
        _count: {
          select: {
            accountMaps: true,
            dimensionRequirements: true
          }
        }
      },
      orderBy: [{ sourceType: "asc" }, { code: "asc" }],
      take: 5
    }),
    prisma.financeJournal.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      select: {
        id: true,
        publicReference: true,
        journalType: true,
        status: true,
        journalDate: true,
        description: true,
        totalDebitAmountPhp: true,
        totalCreditAmountPhp: true,
        _count: {
          select: {
            lines: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 10
    }),
    prisma.apInvoice.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        OR: [
          { purchaseOrder: { deliveryLocationId: session.context.locationId } },
          { goodsReceipt: { receivingLocationId: session.context.locationId } },
          { locationId: session.context.locationId }
        ]
      },
      include: {
        supplier: true,
        paymentRequestLines: {
          where: {
            paymentRequest: {
              status: {
                notIn: ["REJECTED", "CANCELLED", "VOIDED"]
              }
            }
          },
          select: {
            requestedAmount: true
          }
        },
        _count: {
          select: {
            lines: true,
            exceptions: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 10
    }),
    prisma.supplierCreditNote.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        originalApInvoice: {
          OR: [
            { locationId: session.context.locationId },
            { purchaseOrder: { deliveryLocationId: session.context.locationId } },
            { goodsReceipt: { receivingLocationId: session.context.locationId } }
          ]
        }
      },
      include: {
        supplier: true,
        originalApInvoice: true,
        createdBy: true
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 10
    }),
    prisma.paymentRequest.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: {
        supplier: true,
        requestedBy: true,
        _count: {
          select: {
            lines: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 10
    }),
    prisma.paymentRelease.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: {
        supplier: true,
        paymentRequest: true,
        bankAccount: true,
        createdBy: true,
        releasedBy: true,
        reconciliationMatches: {
          where: {
            status: {
              in: ["PROPOSED", "MATCHED"]
            }
          },
          select: {
            matchedAmount: true
          }
        },
        _count: {
          select: {
            reconciliationMatches: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 10
    }),
    prisma.bankAccount.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        OR: [{ locationId: null }, { locationId: session.context.locationId }]
      },
      include: {
        location: true,
        _count: {
          select: {
            deposits: true,
            statements: true,
            reconciliations: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { bankName: "asc" }],
      take: 10
    }),
    prisma.branchCashDeposit.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: {
        location: true,
        bankAccount: true,
        declaredBy: true
      },
      orderBy: {
        depositDate: "desc"
      },
      take: 10
    }),
    prisma.bankStatementLine.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        bankAccount: {
          OR: [{ locationId: null }, { locationId: session.context.locationId }]
        }
      },
      include: {
        bankAccount: true,
        statement: true
      },
      orderBy: {
        transactionDate: "desc"
      },
      take: 10
    }),
    prisma.bankReconciliation.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        bankAccount: {
          OR: [{ locationId: null }, { locationId: session.context.locationId }]
        }
      },
      include: {
        bankAccount: true,
        statement: true,
        _count: {
          select: {
            matches: true
          }
        }
      },
      orderBy: {
        preparedAt: "desc"
      },
      take: 10
    }),
    prisma.supplier.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      select: {
        id: true,
        supplierCode: true,
        legalName: true,
        tradingName: true
      },
      orderBy: [{ supplierCode: "asc" }],
      take: 100
    }),
    prisma.purchaseOrder.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: session.context.locationId,
        status: {
          in: ["ISSUED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CLOSED"]
        }
      },
      select: {
        id: true,
        publicReference: true,
        totalAmount: true,
        status: true,
        supplierId: true,
        supplier: {
          select: {
            legalName: true,
            tradingName: true,
            supplierCode: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 100
    }),
    prisma.chartOfAccount.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        postingAllowed: true,
        isHeader: false
      },
      select: {
        id: true,
        code: true,
        name: true,
        normalBalance: true
      },
      orderBy: [{ code: "asc" }],
      take: 200
    }),
    getPaymentReleaseSettlementPolicy(session)
  ]);

  return buildFinanceFoundationDashboard(
    session,
    purchaseOrders,
    {
      fiscalYear: fiscalYear
        ? {
            id: fiscalYear.id,
            code: fiscalYear.code,
            name: fiscalYear.name,
            status: fiscalYear.status,
            startDate: fiscalYear.startDate.toISOString(),
            endDate: fiscalYear.endDate.toISOString(),
            isDefault: fiscalYear.isDefault
          }
        : null,
      fiscalYears: fiscalYears.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        status: row.status,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        isDefault: row.isDefault,
        periodCount: row._count.accountingPeriods
      })),
      openPeriods: openPeriods.map((period) => ({
        id: period.id,
        code: period.code,
        name: period.name,
        status: period.status,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString()
      })),
      accountingPeriods: accountingPeriods.map((period) => ({
        id: period.id,
        fiscalYearId: period.fiscalYearId,
        fiscalYearCode: period.fiscalYear.code,
        periodNumber: period.periodNumber,
        code: period.code,
        name: period.name,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
        status: period.status
      })),
      accountClassCount,
      postingAccountCount,
      postingRules: postingRules.map((rule) => ({
        id: rule.id,
        code: rule.code,
        name: rule.name,
        status: rule.status,
        sourceType: rule.sourceType,
        sourceEvent: rule.sourceEvent,
        isExecutionEnabled: rule.isExecutionEnabled,
        isConfigOnly: rule.isConfigOnly,
        accountMapCount: rule._count.accountMaps,
        dimensionRequirementCount: rule._count.dimensionRequirements
      }))
    },
    recentJournals.map((journal) => ({
      id: journal.id,
      publicReference: journal.publicReference,
      journalType: journal.journalType,
      status: journal.status,
      journalDate: journal.journalDate.toISOString(),
      description: journal.description,
      totalDebitAmountPhp: decimalToNumber(journal.totalDebitAmountPhp),
      totalCreditAmountPhp: decimalToNumber(journal.totalCreditAmountPhp),
      lineCount: journal._count.lines,
      sourceHref: `/finance/general-ledger/${journal.id}`
    })),
    apInvoices.map((invoice) => {
      const totalAmount = decimalToNumber(invoice.totalAmount);
      const preparedAmount = invoice.paymentRequestLines.reduce(
        (sum, line) => sum + decimalToNumber(line.requestedAmount),
        0
      );
      const paymentOutstandingAmount = roundMoney(totalAmount - preparedAmount);
      const paymentEligibleStatus = [
        "MATCHED",
        "MATCHED_WITHIN_TOLERANCE",
        "APPROVED_EXCEPTION"
      ].includes(invoice.status);
      const paymentEligibleMatch = [
        "EXACT_MATCH",
        "WITHIN_TOLERANCE",
        "APPROVED_EXCEPTION"
      ].includes(invoice.matchStatus);
      const hasDuplicateRisk = ["BLOCKED", "POTENTIAL"].includes(
        invoice.duplicateRisk
      );
      const evidenceReady = Boolean(invoice.evidenceReference);
      const paymentReady =
        invoice.currencyCode === "PHP" &&
        (paymentEligibleStatus || paymentEligibleMatch) &&
        !hasDuplicateRisk &&
        evidenceReady &&
        paymentOutstandingAmount > 0;
      const paymentPreparationStatus = paymentReady
        ? "READY"
        : paymentOutstandingAmount <= 0
          ? "ALREADY_PREPARED"
          : !evidenceReady
            ? "EVIDENCE_REQUIRED"
            : hasDuplicateRisk
              ? "DUPLICATE_RISK"
              : !(paymentEligibleStatus || paymentEligibleMatch)
                ? "MATCH_NOT_READY"
                : invoice.currencyCode !== "PHP"
                  ? "CURRENCY_NOT_SUPPORTED"
                  : "NOT_READY";

      return {
        id: invoice.id,
        publicReference: invoice.publicReference,
        supplierInvoiceNumber: invoice.supplierInvoiceNumber,
        supplierName: supplierName(invoice.supplier),
        status: invoice.status,
        matchStatus: invoice.matchStatus,
        duplicateRisk: invoice.duplicateRisk,
        invoiceDate: invoice.invoiceDate.toISOString(),
        totalAmount,
        paymentOutstandingAmount,
        paymentReady,
        paymentPreparationStatus,
        currencyCode: invoice.currencyCode,
        lineCount: invoice._count.lines,
        exceptionCount: invoice._count.exceptions,
        sourceHref: `/finance/accounts-payable/${invoice.id}`
      };
    }),
    supplierCreditNotes.map((creditNote) => ({
      id: creditNote.id,
      publicReference: creditNote.publicReference,
      supplierCreditNoteNumber: creditNote.supplierCreditNoteNumber,
      originalInvoiceReference: creditNote.originalApInvoice.publicReference,
      supplierName: supplierName(creditNote.supplier),
      status: creditNote.status,
      creditDate: creditNote.creditDate.toISOString(),
      creditAmount: decimalToNumber(creditNote.creditAmount),
      currencyCode: creditNote.currencyCode,
      reasonCode: creditNote.reasonCode,
      evidenceReference: creditNote.evidenceReference,
      createdBy: creditNote.createdBy.displayName,
      createdAt: creditNote.createdAt.toISOString()
    })),
    paymentRequests.map((request) => ({
      id: request.id,
      publicReference: request.publicReference,
      supplierName: supplierName(request.supplier),
      status: request.status,
      totalRequestedAmount: decimalToNumber(request.totalRequestedAmount),
      currencyCode: request.currencyCode,
      lineCount: request._count.lines,
      requestedBy: request.requestedBy.displayName,
      createdAt: request.createdAt.toISOString()
    })),
    paymentReleases.map((release) => ({
      id: release.id,
      publicReference: release.publicReference,
      paymentRequestReference: release.paymentRequest.publicReference,
      supplierName: supplierName(release.supplier),
      bankName: release.bankAccount.bankName,
      bankAccountId: release.bankAccountId,
      method: release.method,
      status: release.status,
      releaseAmount: decimalToNumber(release.releaseAmount),
      releasedAmount: decimalToNumber(release.releasedAmount),
      reconciliationMatchedAmount: release.reconciliationMatches.reduce(
        (sum, match) => sum + decimalToNumber(match.matchedAmount),
        0
      ),
      reconciliationMatchCount: release._count.reconciliationMatches,
      currencyCode: release.currencyCode,
      createdBy: release.createdBy.displayName,
      releasedBy: release.releasedBy?.displayName ?? null,
      releaseReference: release.releaseReference,
      evidenceReference: release.evidenceReference,
      createdAt: release.createdAt.toISOString()
    })),
    {
      accounts: bankAccounts.map((account) => ({
        id: account.id,
        publicReference: account.publicReference,
        bankName: account.bankName,
        maskedAccountNumber: account.maskedAccountNumber,
        accountType: account.accountType,
        status: account.status,
        currencyCode: account.currencyCode,
        scopeLabel: account.location?.name ?? "Company treasury",
        depositCount: account._count.deposits,
        statementCount: account._count.statements,
        reconciliationCount: account._count.reconciliations
      })),
      deposits: branchCashDeposits.map((deposit) => ({
        id: deposit.id,
        publicReference: deposit.publicReference,
        bankAccountId: deposit.bankAccountId,
        locationName: deposit.location.name,
        bankName: deposit.bankAccount.bankName,
        depositDate: deposit.depositDate.toISOString(),
        amountPhp: decimalToNumber(deposit.amountPhp),
        status: deposit.status,
        depositSlipNumber: deposit.depositSlipNumber,
        evidenceReference: deposit.evidenceReference,
        declaredBy: deposit.declaredBy.displayName
      })),
      statementLines: bankStatementLines.map((line) => ({
        id: line.id,
        publicReference: line.statement.publicReference,
        bankAccountId: line.bankAccountId,
        bankName: line.bankAccount.bankName,
        transactionDate: line.transactionDate.toISOString(),
        bankReference: line.bankReference,
        description: line.description,
        netAmount: decimalToNumber(line.netAmount),
        matchedAmount: decimalToNumber(line.matchedAmount),
        status: line.status
      })),
      reconciliations: bankReconciliations.map((reconciliation) => ({
        id: reconciliation.id,
        publicReference: reconciliation.publicReference,
        bankAccountId: reconciliation.bankAccountId,
        bankName: reconciliation.bankAccount.bankName,
        statementReference: reconciliation.statement.publicReference,
        status: reconciliation.status,
        preparedAt: reconciliation.preparedAt.toISOString(),
        varianceAmount: decimalToNumber(reconciliation.varianceAmount),
        matchCount: reconciliation._count.matches
      }))
    },
    paymentReleaseSettlementPolicy,
    {
      journalAccounts: journalAccounts.map((account) => ({
        id: account.id,
        label: `${account.code} / ${account.name}`,
        detail: `${account.normalBalance} normal balance`
      })),
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        label: `${supplier.supplierCode} / ${
          supplier.tradingName ?? supplier.legalName
        }`,
        detail: supplier.legalName
      })),
      purchaseOrders: invoiceSourceOrders.map((order) => ({
        id: order.id,
        label: `${order.publicReference} / ${supplierName(order.supplier)}`,
        detail: `${order.status.replaceAll("_", " ")} / ${money(
          decimalToNumber(order.totalAmount),
          "PHP"
        )} / supplier:${order.supplierId}`
      }))
    }
  );
}

export async function buildFinanceFoundationExportRows(
  session: SessionContext
): Promise<CsvRow[]> {
  const dashboard = await getFinanceFoundationDashboard(session);
  const rows: CsvRow[] = [
    [
      "Section",
      "Reference",
      "Subject",
      "Status",
      "Amount",
      "Currency",
      "Date",
      "Detail",
      "Scope"
    ]
  ];

  for (const metric of dashboard.metrics) {
    rows.push([
      "Metric",
      metric.id,
      metric.label,
      metric.tone,
      metric.displayValue,
      "",
      dashboard.generatedAt,
      metric.detail,
      dashboard.scope.locationName
    ]);
  }

  for (const chain of dashboard.sourceChain) {
    rows.push([
      "PO Source Chain",
      chain.purchaseOrderReference,
      chain.supplierName,
      chain.matchStatus,
      chain.receivedAmount,
      chain.currencyCode,
      "",
      `${chain.status}; PO total ${chain.totalAmount}; discrepancies ${chain.discrepancyCount}`,
      dashboard.scope.locationName
    ]);
  }

  for (const journal of dashboard.recentJournals) {
    rows.push([
      "Journal",
      journal.publicReference,
      journal.description,
      journal.status,
      journal.totalDebitAmountPhp,
      "PHP",
      journal.journalDate,
      `${journal.journalType}; ${journal.lineCount} lines; credit ${journal.totalCreditAmountPhp}`,
      dashboard.scope.locationName
    ]);
  }

  for (const invoice of dashboard.apInvoices) {
    rows.push([
      "AP Invoice",
      invoice.publicReference,
      `${invoice.supplierName} / ${invoice.supplierInvoiceNumber}`,
      invoice.matchStatus,
      invoice.totalAmount,
      invoice.currencyCode,
      invoice.invoiceDate,
      `${invoice.status}; duplicate risk ${invoice.duplicateRisk}; ${invoice.exceptionCount} exceptions; payment ${invoice.paymentPreparationStatus}; outstanding ${invoice.paymentOutstandingAmount}`,
      dashboard.scope.locationName
    ]);
  }

  for (const creditNote of dashboard.supplierCreditNotes) {
    rows.push([
      "Supplier Credit Note",
      creditNote.publicReference,
      `${creditNote.supplierName} / ${creditNote.supplierCreditNoteNumber}`,
      creditNote.status,
      creditNote.creditAmount,
      creditNote.currencyCode,
      creditNote.creditDate,
      `Original invoice ${creditNote.originalInvoiceReference}; reason ${creditNote.reasonCode}; evidence ${creditNote.evidenceReference ?? "none"}; no settlement or journal posting`,
      dashboard.scope.locationName
    ]);
  }

  for (const request of dashboard.paymentRequests) {
    rows.push([
      "Payment Request",
      request.publicReference,
      request.supplierName,
      request.status,
      request.totalRequestedAmount,
      request.currencyCode,
      request.createdAt,
      `${request.lineCount} lines; requested by ${request.requestedBy}`,
      dashboard.scope.locationName
    ]);
  }

  for (const row of dashboard.payablesReportRows) {
    rows.push([
      "Payables Report",
      row.reference,
      row.supplierName,
      `${row.rowType}; ${row.status}`,
      row.openAmount,
      row.currencyCode,
      dashboard.generatedAt,
      `${row.ageBucket}; gross ${row.amount}; ${row.detail}`,
      dashboard.scope.locationName
    ]);
  }

  for (const release of dashboard.paymentReleases) {
    const reportRow = dashboard.paymentReleaseReportRows.find(
      (row) => row.id === release.id
    );
    rows.push([
      "Payment Release",
      release.publicReference,
      `${release.supplierName} / ${release.paymentRequestReference}`,
      reportRow?.settlementState ?? release.status,
      release.releaseAmount,
      release.currencyCode,
      release.createdAt,
      `${release.status}; ${release.method}; ${release.bankName}; released ${release.releasedAmount}; matched ${release.reconciliationMatchedAmount}; ${release.reconciliationMatchCount} match(es); evidence ${reportRow?.evidenceState ?? "MISSING"}; proof ${release.releaseReference ?? "none"}`,
      dashboard.scope.locationName
    ]);
  }

  for (const account of dashboard.bankCash.accounts) {
    rows.push([
      "Bank Account",
      account.publicReference,
      `${account.bankName} / ${account.maskedAccountNumber}`,
      account.status,
      "",
      account.currencyCode,
      "",
      `${account.accountType}; deposits ${account.depositCount}; statements ${account.statementCount}; reconciliations ${account.reconciliationCount}`,
      account.scopeLabel
    ]);
  }

  for (const deposit of dashboard.bankCash.deposits) {
    rows.push([
      "Branch Cash Deposit",
      deposit.publicReference,
      `${deposit.locationName} / ${deposit.bankName}`,
      deposit.status,
      deposit.amountPhp,
      "PHP",
      deposit.depositDate,
      `Slip ${deposit.depositSlipNumber ?? "none"}; evidence ${deposit.evidenceReference ?? "none"}; declared by ${deposit.declaredBy}`,
      deposit.locationName
    ]);
  }

  for (const line of dashboard.bankCash.statementLines) {
    rows.push([
      "Bank Statement Line",
      line.bankReference,
      `${line.bankName} / ${line.description}`,
      line.status,
      line.netAmount,
      "PHP",
      line.transactionDate,
      `Statement ${line.publicReference}; matched ${line.matchedAmount}`,
      dashboard.scope.locationName
    ]);
  }

  for (const reconciliation of dashboard.bankCash.reconciliations) {
    rows.push([
      "Reconciliation",
      reconciliation.publicReference,
      `${reconciliation.bankName} / ${reconciliation.statementReference}`,
      reconciliation.status,
      reconciliation.varianceAmount,
      "PHP",
      reconciliation.preparedAt,
      `${reconciliation.matchCount} matches`,
      dashboard.scope.locationName
    ]);
  }

  if (session.permissionCodes.includes(permissions.financeBudgetView)) {
    const budgetDashboard = await getBudgetControlDashboard(session);
    for (const line of budgetDashboard.lines) {
      rows.push([
        "Budget Line",
        line.budgetReference,
        `${line.lineCode} / ${line.accountName}`,
        line.status,
        line.revisedAmountPhp,
        "PHP",
        line.periodLabel,
        `Committed ${line.committedAmountPhp}; actual ${line.actualAmountPhp}; remaining ${line.remainingAmountPhp}; utilization ${line.utilizationPct}%; threshold ${line.thresholdState}`,
        line.locationName
      ]);
    }
    for (const commitment of budgetDashboard.commitments) {
      rows.push([
        "Budget Commitment",
        commitment.sourceReference,
        `${commitment.sourceType} / ${commitment.lineName}`,
        commitment.status,
        commitment.committedAmountPhp,
        "PHP",
        commitment.sourceEventAt,
        `Consumed ${commitment.consumedAmountPhp}; ${commitment.sourceSummary}`,
        budgetDashboard.scope.locationName
      ]);
    }
  }

  if (session.permissionCodes.includes(permissions.financeExpenseRequestView)) {
    const expenseDashboard = await getExpenseRequestDashboard(session);
    for (const expense of expenseDashboard.reportRows) {
      rows.push([
        "Expense Request",
        expense.publicReference,
        expense.title,
        expense.status,
        expense.totalRequestedAmount,
        "PHP",
        expense.dueState,
        `${expense.budgetStatus}; outstanding ${expense.outstandingAmount}; evidence ${expense.evidenceState}; ${expense.sourceLinkCount} source link(s); ${expense.exportSafeSummary}`,
        expense.locationName
      ]);
    }
  }

  if (session.permissionCodes.includes(permissions.financeCashAdvanceView)) {
    const cashAdvanceDashboard = await getCashAdvanceDashboard(session);
    for (const advance of cashAdvanceDashboard.reportRows) {
      rows.push([
        "Cash Advance",
        advance.publicReference,
        `${advance.title} / ${advance.beneficiaryName}`,
        advance.status,
        advance.issuedAmountPhp,
        "PHP",
        advance.dueState,
        `Liquidated ${advance.liquidatedAmountPhp}; outstanding ${advance.outstandingAmountPhp}; evidence ${advance.evidenceState}; ${advance.movementCount} movement(s); ${advance.liquidationCount} liquidation(s); ${advance.exportSafeSummary}`,
        advance.locationName
      ]);
    }
  }

  if (session.permissionCodes.includes(permissions.financePettyCashView)) {
    const pettyCashDashboard = await getPettyCashDashboard(session);
    for (const fund of pettyCashDashboard.reportRows) {
      rows.push([
        "Petty Cash Fund",
        fund.publicReference,
        `${fund.name} / ${fund.custodianName}`,
        fund.balanceState,
        fund.currentBalancePhp,
        "PHP",
        "",
        `${fund.status}; target ${fund.targetBalancePhp}; available to target ${fund.availableToTargetPhp}; open requests ${fund.openRequestCount}; open liquidations ${fund.openLiquidationCount}; evidence ${fund.evidenceState}; ${fund.exportSafeSummary}`,
        fund.locationName
      ]);
    }
  }

  for (const guardrail of dashboard.guardrails) {
    rows.push([
      "Guardrail",
      guardrail.label,
      guardrail.label,
      guardrail.tone,
      "",
      "",
      dashboard.generatedAt,
      guardrail.detail,
      dashboard.scope.locationName
    ]);
  }

  return rows;
}

export async function buildBankCashExportRows(
  session: SessionContext
): Promise<CsvRow[]> {
  const dashboard = await getFinanceFoundationDashboard(session);
  const rows: CsvRow[] = [
    [
      "Section",
      "Reference",
      "Subject",
      "Status",
      "Amount",
      "Currency",
      "Date",
      "Detail",
      "Scope"
    ]
  ];

  for (const report of dashboard.bankCashReportRows) {
    rows.push([
      "Bank Cash Report",
      report.id,
      `${report.bankName} / ${report.maskedAccountNumber}`,
      report.readinessState,
      report.depositAmountPhp,
      report.currencyCode,
      dashboard.generatedAt,
      `Deposits ${report.depositCount}; statement lines ${report.statementLineCount}; unmatched ${report.unmatchedStatementCount}; reconciliations ${report.reconciliationCount}; variance ${report.varianceAmountPhp}; evidence gaps ${report.evidenceGapCount}; readiness issues ${report.readinessIssues.join(" | ") || "none"}; ${report.exportSafeSummary}`,
      report.scopeLabel
    ]);
  }

  for (const account of dashboard.bankCash.accounts) {
    rows.push([
      "Bank Account",
      account.publicReference,
      `${account.bankName} / ${account.maskedAccountNumber}`,
      account.status,
      "",
      account.currencyCode,
      "",
      `${account.accountType}; deposits ${account.depositCount}; statements ${account.statementCount}; reconciliations ${account.reconciliationCount}`,
      account.scopeLabel
    ]);
  }

  for (const deposit of dashboard.bankCash.deposits) {
    rows.push([
      "Branch Cash Deposit",
      deposit.publicReference,
      `${deposit.locationName} / ${deposit.bankName}`,
      deposit.status,
      deposit.amountPhp,
      "PHP",
      deposit.depositDate,
      `Slip ${deposit.depositSlipNumber ?? "none"}; evidence ${deposit.evidenceReference ?? "none"}; declared by ${deposit.declaredBy}`,
      deposit.locationName
    ]);
  }

  for (const line of dashboard.bankCash.statementLines) {
    rows.push([
      "Bank Statement Line",
      line.bankReference,
      `${line.bankName} / ${line.description}`,
      line.status,
      line.netAmount,
      "PHP",
      line.transactionDate,
      `Statement ${line.publicReference}; matched ${line.matchedAmount}`,
      dashboard.scope.locationName
    ]);
  }

  for (const reconciliation of dashboard.bankCash.reconciliations) {
    rows.push([
      "Reconciliation",
      reconciliation.publicReference,
      `${reconciliation.bankName} / ${reconciliation.statementReference}`,
      reconciliation.status,
      reconciliation.varianceAmount,
      "PHP",
      reconciliation.preparedAt,
      `${reconciliation.matchCount} matches`,
      dashboard.scope.locationName
    ]);
  }

  rows.push([
    "Guardrail",
    "No mutation",
    "Bank & Cash export",
    "READ_ONLY",
    "",
    "",
    dashboard.generatedAt,
    "CSV export does not mutate bank accounts, deposits, statement lines, reconciliations, payment releases, AP, or journals.",
    dashboard.scope.locationName
  ]);

  return rows;
}

export async function createApInvoiceDraft(input: ApInvoiceDraftInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeApInvoiceCreate);
  assertApPhpOnly("PHP");

  const supplierInvoiceNumber = input.supplierInvoiceNumber.trim();
  if (!supplierInvoiceNumber) {
    throw new Error("AP_INVOICE_NUMBER_REQUIRED");
  }
  if (!input.purchaseOrderId && !input.nonPoReason?.trim()) {
    throw new Error("AP_INVOICE_NON_PO_REASON_REQUIRED");
  }
  if (input.lines.length === 0) {
    throw new Error("AP_INVOICE_LINES_REQUIRED");
  }
  if (input.lines.length > 100) {
    throw new Error("AP_INVOICE_LINE_LIMIT_EXCEEDED");
  }

  const supplier = await prisma.supplier.findFirst({
    where: {
      id: input.supplierId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    select: { id: true }
  });
  if (!supplier) {
    throw new Error("AP_INVOICE_SUPPLIER_NOT_FOUND");
  }

  const purchaseOrder = input.purchaseOrderId
    ? await prisma.purchaseOrder.findFirst({
        where: {
          id: input.purchaseOrderId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          supplierId: input.supplierId,
          deliveryLocationId: session.context.locationId
        },
        include: { lines: true }
      })
    : null;
  if (input.purchaseOrderId && !purchaseOrder) {
    throw new Error("AP_INVOICE_PURCHASE_ORDER_NOT_FOUND");
  }

  const goodsReceipt = input.goodsReceiptId
    ? await prisma.goodsReceipt.findFirst({
        where: {
          id: input.goodsReceiptId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          supplierId: input.supplierId,
          receivingLocationId: session.context.locationId,
          status: { startsWith: "POSTED" }
        },
        include: { lines: true }
      })
    : null;
  if (input.goodsReceiptId && !goodsReceipt) {
    throw new Error("AP_INVOICE_GOODS_RECEIPT_NOT_FOUND");
  }

  const poLineById = new Map(
    purchaseOrder?.lines.map((line) => [line.id, line]) ?? []
  );
  const receiptLineIds = new Set(goodsReceipt?.lines.map((line) => line.id) ?? []);
  const lines = input.lines.map((line, index) => {
    const lineTotalAmount = lineTotalFromApInput(line);
    const purchaseOrderLine = line.purchaseOrderLineId
      ? poLineById.get(line.purchaseOrderLineId)
      : null;
    if (line.purchaseOrderLineId && !purchaseOrderLine) {
      throw new Error("AP_INVOICE_PO_LINE_SCOPE_MISMATCH");
    }
    if (line.goodsReceiptLineId && !receiptLineIds.has(line.goodsReceiptLineId)) {
      throw new Error("AP_INVOICE_GR_LINE_SCOPE_MISMATCH");
    }
    return {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      lineNumber: index + 1,
      purchaseOrderLineId: line.purchaseOrderLineId ?? null,
      goodsReceiptLineId: line.goodsReceiptLineId ?? null,
      budgetLineId: purchaseOrderLine?.budgetLineId ?? null,
      itemId: line.itemId ?? null,
      uomId: line.uomId ?? null,
      description: line.description.trim(),
      invoicedQty: line.invoicedQty,
      unitPrice: line.unitPrice,
      taxAmount: line.taxAmount ?? 0,
      discountAmount: line.discountAmount ?? 0,
      lineTotalAmount
    };
  });
  const subtotalAmount = roundMoney(
    input.lines.reduce((sum, line) => sum + line.invoicedQty * line.unitPrice, 0)
  );
  const taxAmount = roundMoney(input.lines.reduce((sum, line) => sum + (line.taxAmount ?? 0), 0));
  const discountAmount = roundMoney(
    input.lines.reduce((sum, line) => sum + (line.discountAmount ?? 0), 0)
  );
  const freightAmount = input.freightAmount ?? 0;
  if (freightAmount < 0) {
    throw new Error("AP_INVOICE_FREIGHT_INVALID");
  }
  const totalAmount = roundMoney(subtotalAmount + taxAmount + freightAmount - discountAmount);
  const fingerprint = duplicateFingerprint(input);
  const publicReference = await nextApInvoiceReference(session.context.companyId);

  return prisma.$transaction(async (tx) => {
    const duplicateCandidate = await tx.apInvoice.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        supplierId: input.supplierId,
        duplicateFingerprint: fingerprint,
        status: { notIn: ["CANCELLED", "REVERSED"] }
      },
      select: {
        id: true,
        publicReference: true,
        totalAmount: true,
        invoiceDate: true
      }
    });

    const invoice = await tx.apInvoice.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        publicReference,
        supplierId: input.supplierId,
        locationId: session.context.locationId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        goodsReceiptId: input.goodsReceiptId ?? null,
        currencyCode: "PHP",
        supplierInvoiceNumber,
        invoiceDate: input.invoiceDate,
        receivedAt: new Date(),
        dueDate: input.dueDate ?? null,
        paymentTermsDays: input.paymentTermsDays ?? null,
        subtotalAmount,
        taxAmount,
        discountAmount,
        freightAmount,
        totalAmount,
        duplicateRisk: duplicateCandidate ? "POTENTIAL" : "CLEAN",
        captureIdempotencyKey: input.captureIdempotencyKey?.trim() || null,
        duplicateFingerprint: fingerprint,
        nonPoReason: input.nonPoReason?.trim() || null,
        evidenceReference: input.evidenceReference?.trim() || null,
        createdByUserId: session.user.id,
        lines: {
          createMany: {
            data: lines
          }
        }
      },
      include: { lines: true }
    });

    if (duplicateCandidate) {
      await tx.apInvoiceDuplicateSignal.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          apInvoiceId: invoice.id,
          candidateInvoiceId: duplicateCandidate.id,
          signalType: "SAME_SUPPLIER_NUMBER_DATE_TOTAL",
          risk: "POTENTIAL",
          duplicateKey: fingerprint,
          matchedAmount: totalAmount,
          matchedDate: input.invoiceDate,
          duplicateSnapshot: {
            candidateReference: duplicateCandidate.publicReference,
            candidateTotalAmount: decimalToNumber(duplicateCandidate.totalAmount)
          }
        }
      });
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "ap_invoice.created",
        entityType: "ApInvoice",
        entityId: invoice.id,
        afterData: {
          status: "DRAFT",
          publicReference,
          supplierInvoiceNumber,
          totalAmount
        },
        metadata: {
          lineCount: input.lines.length,
          linkedPurchaseOrderId: input.purchaseOrderId ?? null,
          linkedGoodsReceiptId: input.goodsReceiptId ?? null,
          noSourceMutation: true
        }
      }
    });

    return invoice;
  });
}

export async function submitApInvoiceForMatch(input: ApInvoiceActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeApInvoiceSubmit);

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.apInvoice.findFirst({
      where: {
        id: input.apInvoiceId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT"
      },
      include: {
        lines: true,
        purchaseOrder: true,
        goodsReceipt: true
      }
    });
    if (!invoice) {
      throw new Error("AP_INVOICE_NOT_OPEN_FOR_SUBMIT");
    }
    if (invoice.createdByUserId !== session.user.id) {
      throw new Error("AP_INVOICE_SUBMITTER_MISMATCH");
    }
    if (invoice.purchaseOrder?.deliveryLocationId) {
      await assertAuthorizedLocation(session, invoice.purchaseOrder.deliveryLocationId);
    }
    if (invoice.goodsReceipt?.receivingLocationId) {
      await assertAuthorizedLocation(session, invoice.goodsReceipt.receivingLocationId);
    }

    const submittedAt = new Date();
    const updated = await tx.apInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "MATCH_PENDING",
        submittedAt,
        submittedByUserId: session.user.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "ap_invoice.submitted",
        entityType: "ApInvoice",
        entityId: invoice.id,
        beforeData: { status: invoice.status },
        afterData: { status: "MATCH_PENDING", submittedAt },
        metadata: {
          remarks: input.remarks ?? null,
          noSourceMutation: true
        }
      }
    });

    return updated;
  });
}

async function projectApInvoiceBudgetCommitments(
  tx: TransactionClient,
  session: SessionContext,
  invoice: ApInvoiceBudgetProjectionSource,
  matchedAt: Date
) {
  for (const line of invoice.lines) {
    const committedAmountPhp = decimalToNumber(line.lineTotalAmount);
    if (!line.budgetLineId || committedAmountPhp <= 0) {
      continue;
    }

    await projectBudgetCommitmentFromApprovedSourceEvent(tx, session, {
      budgetLineId: line.budgetLineId,
      sourceType: "AP_INVOICE",
      sourceId: invoice.id,
      sourceLineId: line.id,
      sourceEventKey: `ap_invoice.matched:${line.id}`,
      sourceEventAt: matchedAt,
      sourceReference: invoice.publicReference,
      sourceSummary: `AP invoice ${invoice.publicReference} line ${line.lineNumber}: ${invoice.supplierInvoiceNumber} / ${line.description}`,
      committedAmountPhp,
      status: "PENDING"
    });
  }
}

export async function evaluateApInvoiceMatch(input: ApInvoiceActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeApInvoiceMatch);

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.apInvoice.findFirst({
      where: {
        id: input.apInvoiceId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["MATCH_PENDING", "ON_HOLD", "DISPUTED"] }
      },
      include: {
        lines: {
          include: {
            purchaseOrderLine: true,
            goodsReceiptLine: true
          },
          orderBy: { lineNumber: "asc" }
        },
        purchaseOrder: true,
        goodsReceipt: true
      }
    });
    if (!invoice) {
      throw new Error("AP_INVOICE_NOT_READY_FOR_MATCH");
    }
    if (invoice.createdByUserId === session.user.id) {
      throw new Error("AP_INVOICE_SELF_REVIEW_DENIED");
    }
    if (invoice.purchaseOrder?.deliveryLocationId) {
      await assertAuthorizedLocation(session, invoice.purchaseOrder.deliveryLocationId);
    }
    if (invoice.goodsReceipt?.receivingLocationId) {
      await assertAuthorizedLocation(session, invoice.goodsReceipt.receivingLocationId);
    }

    await tx.apInvoiceMatchResult.deleteMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        apInvoiceId: invoice.id
      }
    });

    const reviewedAt = new Date();
    const matchRows = invoice.lines.map((line) => {
      const evaluation = evaluateApInvoiceMatchLine({
        invoiceLineId: line.id,
        purchaseOrderLineId: line.purchaseOrderLineId,
        goodsReceiptLineId: line.goodsReceiptLineId,
        poQty: line.purchaseOrderLine
          ? decimalToNumber(line.purchaseOrderLine.orderedQty)
          : null,
        receivedQty: line.goodsReceiptLine
          ? decimalToNumber(line.goodsReceiptLine.acceptedQty)
          : 0,
        invoicedQty: decimalToNumber(line.invoicedQty),
        poUnitPrice: line.purchaseOrderLine
          ? decimalToNumber(line.purchaseOrderLine.unitPrice)
          : null,
        invoicedUnitPrice: decimalToNumber(line.unitPrice),
        poLineTotal: line.goodsReceiptLine
          ? roundMoney(
              decimalToNumber(line.goodsReceiptLine.acceptedQty) *
                decimalToNumber(line.goodsReceiptLine.unitCost)
            )
          : line.purchaseOrderLine
            ? decimalToNumber(line.purchaseOrderLine.lineTotal)
            : null,
        invoicedLineTotal: decimalToNumber(line.lineTotalAmount)
      });

      return {
        line,
        evaluation
      };
    });
    const finalMatchStatus = matchRows.some(
      (row) => row.evaluation.status === "VARIANCE_HOLD"
    )
      ? "VARIANCE_HOLD"
      : matchRows.some((row) => row.evaluation.status === "WITHIN_TOLERANCE")
        ? "WITHIN_TOLERANCE"
        : "EXACT_MATCH";
    const finalInvoiceStatus =
      finalMatchStatus === "EXACT_MATCH"
        ? "MATCHED"
        : finalMatchStatus === "WITHIN_TOLERANCE"
          ? "MATCHED_WITHIN_TOLERANCE"
          : "ON_HOLD";

    const createdResults = [];
    for (const row of matchRows) {
      const result = await tx.apInvoiceMatchResult.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          apInvoiceId: invoice.id,
          apInvoiceLineId: row.line.id,
          purchaseOrderLineId: row.line.purchaseOrderLineId,
          goodsReceiptLineId: row.line.goodsReceiptLineId,
          matchSource:
            row.line.purchaseOrderLineId && row.line.goodsReceiptLineId
              ? "PO_AND_RECEIPT"
              : "UNLINKED",
          poQtyAtMatch: row.line.purchaseOrderLine
            ? decimalToNumber(row.line.purchaseOrderLine.orderedQty)
            : null,
          receivedQtyToMatch: row.line.goodsReceiptLine
            ? decimalToNumber(row.line.goodsReceiptLine.acceptedQty)
            : 0,
          invoicedQty: decimalToNumber(row.line.invoicedQty),
          poUnitPrice: row.line.purchaseOrderLine
            ? decimalToNumber(row.line.purchaseOrderLine.unitPrice)
            : null,
          invoicedUnitPrice: decimalToNumber(row.line.unitPrice),
          poLineTotal: row.line.goodsReceiptLine
            ? roundMoney(
                decimalToNumber(row.line.goodsReceiptLine.acceptedQty) *
                  decimalToNumber(row.line.goodsReceiptLine.unitCost)
              )
            : row.line.purchaseOrderLine
              ? decimalToNumber(row.line.purchaseOrderLine.lineTotal)
              : null,
          invoicedLineTotal: decimalToNumber(row.line.lineTotalAmount),
          qtyVariance: row.evaluation.qtyVariance,
          amountVariance: row.evaluation.amountVariance,
          taxVarianceAmount: 0,
          toleranceConfig: { amountPhp: 1, qty: 0 },
          status: row.evaluation.status,
          exceptionCode: row.evaluation.exceptionCode ?? null,
          exceptionNotes: row.evaluation.exceptionNotes ?? null,
          reviewedByUserId: session.user.id,
          reviewedAt,
          reviewedReason: input.remarks?.trim() || null
        }
      });
      createdResults.push({ result, evaluation: row.evaluation });
    }

    await tx.apInvoiceException.updateMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        apInvoiceId: invoice.id,
        status: "OPEN"
      },
      data: {
        status: "CANCELLED",
        resolvedByUserId: session.user.id,
        resolvedAt: reviewedAt,
        resolutionReason: "Superseded by a new AP match evaluation."
      }
    });

    for (const created of createdResults.filter(
      (row) => row.evaluation.status === "VARIANCE_HOLD"
    )) {
      await tx.apInvoiceException.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          apInvoiceId: invoice.id,
          matchResultId: created.result.id,
          exceptionCode: created.evaluation.exceptionCode ?? "AP_MATCH_VARIANCE",
          exceptionType: "THREE_WAY_MATCH",
          status: "OPEN",
          severity: "HIGH",
          reason:
            created.evaluation.exceptionNotes ??
            "Invoice did not match purchase order and accepted receipt basis.",
          evidenceReference: invoice.evidenceReference,
          createdByUserId: session.user.id
        }
      });
    }

    const updated = await tx.apInvoice.update({
      where: { id: invoice.id },
      data: {
        status: finalInvoiceStatus,
        matchStatus: finalMatchStatus,
        holdReason:
          finalInvoiceStatus === "ON_HOLD"
            ? "One or more invoice lines require AP exception review."
            : null,
        reviewedByUserId: session.user.id,
        reviewedAt
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "ap_invoice.match_evaluated",
        entityType: "ApInvoice",
        entityId: invoice.id,
        beforeData: {
          status: invoice.status,
          matchStatus: invoice.matchStatus
        },
        afterData: {
          status: finalInvoiceStatus,
          matchStatus: finalMatchStatus,
          reviewedAt
        },
        metadata: {
          lineCount: matchRows.length,
          exceptionCount: createdResults.filter(
            (row) => row.evaluation.status === "VARIANCE_HOLD"
          ).length,
        noSourceMutation: true
        }
      }
    });

    if (finalInvoiceStatus !== "ON_HOLD") {
      await projectApInvoiceBudgetCommitments(
        tx,
        session,
        invoice,
        reviewedAt
      );
    }

    return updated;
  });
}

export async function cancelApInvoice(input: ApInvoiceActionInput & { reason: string }) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeApInvoiceCancel);
  if (!input.reason.trim()) {
    throw new Error("AP_INVOICE_CANCEL_REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.apInvoice.findFirst({
      where: {
        id: input.apInvoiceId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: {
          in: ["DRAFT", "SUBMITTED", "MATCH_PENDING", "ON_HOLD", "DISPUTED"]
        }
      },
      include: {
        purchaseOrder: true,
        goodsReceipt: true,
        lines: {
          orderBy: { lineNumber: "asc" }
        }
      }
    });
    if (!invoice) {
      throw new Error("AP_INVOICE_NOT_CANCELLABLE");
    }
    if (invoice.purchaseOrder?.deliveryLocationId) {
      await assertAuthorizedLocation(session, invoice.purchaseOrder.deliveryLocationId);
    }
    if (invoice.goodsReceipt?.receivingLocationId) {
      await assertAuthorizedLocation(session, invoice.goodsReceipt.receivingLocationId);
    }

    const cancelledAt = new Date();
    const updated = await tx.apInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "CANCELLED",
        cancelledAt,
        cancelledByUserId: session.user.id,
        cancelledReason: input.reason.trim()
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "ap_invoice.cancelled",
        entityType: "ApInvoice",
        entityId: invoice.id,
        beforeData: { status: invoice.status },
        afterData: { status: "CANCELLED", cancelledAt },
        metadata: {
          reason: input.reason.trim(),
          noSourceMutation: true
        }
      }
    });

    for (const line of invoice.lines) {
      if (!line.budgetLineId) {
        continue;
      }
      await reverseBudgetCommitmentFromApprovedSourceEvent(tx, session, {
        sourceType: "AP_INVOICE",
        sourceId: invoice.id,
        sourceEventKey: `ap_invoice.matched:${line.id}`,
        reversalEventKey: `ap_invoice.cancelled:${line.id}`,
        reason: input.reason.trim()
      });
    }

    return updated;
  });
}

export async function createSupplierCreditNoteDraft(
  input: SupplierCreditNoteDraftInput
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeSupplierCreditCreate);
  assertApPhpOnly("PHP");

  const supplierCreditNoteNumber = input.supplierCreditNoteNumber.trim();
  const reasonCode = input.reasonCode.trim();
  const reasonDescription = input.reasonDescription.trim();
  if (!supplierCreditNoteNumber) {
    throw new Error("SUPPLIER_CREDIT_NOTE_NUMBER_REQUIRED");
  }
  if (input.creditAmount <= 0) {
    throw new Error("SUPPLIER_CREDIT_NOTE_AMOUNT_INVALID");
  }
  if (!reasonCode) {
    throw new Error("SUPPLIER_CREDIT_NOTE_REASON_CODE_REQUIRED");
  }
  if (!reasonDescription) {
    throw new Error("SUPPLIER_CREDIT_NOTE_REASON_DESCRIPTION_REQUIRED");
  }

  const originalInvoice = await prisma.apInvoice.findFirst({
    where: {
      id: input.originalApInvoiceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: { notIn: ["CANCELLED", "REVERSED"] }
    },
    include: {
      supplier: true,
      purchaseOrder: true,
      goodsReceipt: true
    }
  });
  if (!originalInvoice) {
    throw new Error("SUPPLIER_CREDIT_NOTE_ORIGINAL_INVOICE_NOT_FOUND");
  }
  if (originalInvoice.currencyCode !== "PHP") {
    throw new Error("SUPPLIER_CREDIT_NOTE_CURRENCY_NOT_SUPPORTED");
  }
  if (originalInvoice.locationId) {
    await assertAuthorizedLocation(session, originalInvoice.locationId);
  }
  if (originalInvoice.purchaseOrder?.deliveryLocationId) {
    await assertAuthorizedLocation(
      session,
      originalInvoice.purchaseOrder.deliveryLocationId
    );
  }
  if (originalInvoice.goodsReceipt?.receivingLocationId) {
    await assertAuthorizedLocation(
      session,
      originalInvoice.goodsReceipt.receivingLocationId
    );
  }
  const originalInvoiceTotal = decimalToNumber(originalInvoice.totalAmount);
  if (input.creditAmount > originalInvoiceTotal) {
    throw new Error("SUPPLIER_CREDIT_NOTE_AMOUNT_EXCEEDS_INVOICE");
  }

  const publicReference = await nextSupplierCreditNoteReference(
    session.context.companyId
  );
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.supplierCreditNote.findUnique({
        where: {
          tenantId_companyId_idempotencyKey: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            idempotencyKey
          }
        }
      });
      if (existing) {
        return existing;
      }
    }

    const creditNote = await tx.supplierCreditNote.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        supplierId: originalInvoice.supplierId,
        originalApInvoiceId: originalInvoice.id,
        publicReference,
        supplierCreditNoteNumber,
        creditDate: input.creditDate,
        receivedAt: new Date(),
        currencyCode: "PHP",
        creditAmount: input.creditAmount,
        status: "DRAFT",
        reasonCode,
        reasonDescription,
        evidenceReference: input.evidenceReference?.trim() || null,
        applicationNotes: input.applicationNotes?.trim() || null,
        idempotencyKey,
        createdByUserId: session.user.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "supplier_credit_note.created",
        entityType: "SupplierCreditNote",
        entityId: creditNote.id,
        afterData: {
          status: "DRAFT",
          publicReference,
          supplierCreditNoteNumber,
          creditAmount: input.creditAmount
        },
        metadata: {
          originalApInvoiceId: originalInvoice.id,
          originalInvoiceReference: originalInvoice.publicReference,
          supplierId: originalInvoice.supplierId,
          noOriginalInvoiceMutation: true,
          noPaymentSettlement: true,
          noJournalPosting: true
        }
      }
    });

    return creditNote;
  });
}

export async function submitSupplierCreditNoteForApplication(
  input: SupplierCreditNoteActionInput & { remarks?: string | null }
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeSupplierCreditSubmit);
  const remarks = input.remarks?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const creditNote = await tx.supplierCreditNote.findFirst({
      where: {
        id: input.supplierCreditNoteId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT"
      },
      include: {
        originalApInvoice: {
          include: {
            purchaseOrder: true,
            goodsReceipt: true
          }
        }
      }
    });
    if (!creditNote) {
      throw new Error("SUPPLIER_CREDIT_NOTE_NOT_SUBMITTABLE");
    }
    if (creditNote.originalApInvoice.locationId) {
      await assertAuthorizedLocation(
        session,
        creditNote.originalApInvoice.locationId
      );
    }
    if (creditNote.originalApInvoice.purchaseOrder?.deliveryLocationId) {
      await assertAuthorizedLocation(
        session,
        creditNote.originalApInvoice.purchaseOrder.deliveryLocationId
      );
    }
    if (creditNote.originalApInvoice.goodsReceipt?.receivingLocationId) {
      await assertAuthorizedLocation(
        session,
        creditNote.originalApInvoice.goodsReceipt.receivingLocationId
      );
    }

    const updated = await tx.supplierCreditNote.update({
      where: { id: creditNote.id },
      data: {
        status: "PENDING_APPLICATION",
        ...(remarks ? { applicationNotes: remarks } : {})
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "supplier_credit_note.submitted_for_application",
        entityType: "SupplierCreditNote",
        entityId: creditNote.id,
        beforeData: { status: creditNote.status },
        afterData: { status: "PENDING_APPLICATION" },
        metadata: {
          remarks,
          originalApInvoiceId: creditNote.originalApInvoiceId,
          originalInvoiceReference: creditNote.originalApInvoice.publicReference,
          supplierId: creditNote.supplierId,
          noOriginalInvoiceMutation: true,
          noPaymentSettlement: true,
          noJournalPosting: true
        }
      }
    });

    return updated;
  });
}

export async function cancelSupplierCreditNote(
  input: SupplierCreditNoteActionInput & { reason: string }
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeSupplierCreditCancel);
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("SUPPLIER_CREDIT_NOTE_CANCEL_REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const creditNote = await tx.supplierCreditNote.findFirst({
      where: {
        id: input.supplierCreditNoteId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["DRAFT", "PENDING_APPLICATION"] }
      },
      include: {
        originalApInvoice: {
          include: {
            purchaseOrder: true,
            goodsReceipt: true
          }
        }
      }
    });
    if (!creditNote) {
      throw new Error("SUPPLIER_CREDIT_NOTE_NOT_CANCELLABLE");
    }
    if (creditNote.originalApInvoice.locationId) {
      await assertAuthorizedLocation(
        session,
        creditNote.originalApInvoice.locationId
      );
    }
    if (creditNote.originalApInvoice.purchaseOrder?.deliveryLocationId) {
      await assertAuthorizedLocation(
        session,
        creditNote.originalApInvoice.purchaseOrder.deliveryLocationId
      );
    }
    if (creditNote.originalApInvoice.goodsReceipt?.receivingLocationId) {
      await assertAuthorizedLocation(
        session,
        creditNote.originalApInvoice.goodsReceipt.receivingLocationId
      );
    }

    const cancelledAt = new Date();
    const updated = await tx.supplierCreditNote.update({
      where: { id: creditNote.id },
      data: {
        status: "CANCELLED",
        cancelledAt,
        cancelledByUserId: session.user.id,
        cancellationReason: reason
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "supplier_credit_note.cancelled",
        entityType: "SupplierCreditNote",
        entityId: creditNote.id,
        beforeData: { status: creditNote.status },
        afterData: { status: "CANCELLED", cancelledAt },
        metadata: {
          reason,
          originalApInvoiceId: creditNote.originalApInvoiceId,
          noOriginalInvoiceMutation: true,
          noPaymentSettlement: true,
          noJournalPosting: true
        }
      }
    });

    return updated;
  });
}

export async function createPaymentRequestDraft(input: PaymentRequestDraftInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRequestCreate);
  if (!input.requestReason.trim()) {
    throw new Error("PAYMENT_REQUEST_REASON_REQUIRED");
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await prisma.paymentRequest.findUnique({
      where: {
        tenantId_companyId_idempotencyKey: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          idempotencyKey
        }
      },
      include: { lines: true }
    });
    if (existing) {
      return existing;
    }
  }

  return prisma.$transaction(async (tx) => {
    const inputLines =
      input.lines && input.lines.length > 0
        ? input.lines
        : input.apInvoiceId
          ? [
              {
                apInvoiceId: input.apInvoiceId,
                requestedAmount: input.requestedAmount,
                notes: input.notes
              }
            ]
          : [];
    if (inputLines.length === 0) {
      throw new Error("PAYMENT_REQUEST_LINES_REQUIRED");
    }
    if (inputLines.length > 10) {
      throw new Error("PAYMENT_REQUEST_LINE_LIMIT_EXCEEDED");
    }
    const invoiceIds = inputLines.map((line) => line.apInvoiceId);
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      throw new Error("PAYMENT_REQUEST_DUPLICATE_INVOICE_LINE");
    }

    const invoices = await tx.apInvoice.findMany({
      where: {
        id: { in: invoiceIds },
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: {
        supplier: true
      }
    });
    if (invoices.length !== invoiceIds.length) {
      throw new Error("PAYMENT_REQUEST_INVOICE_NOT_FOUND");
    }
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const supplierId = invoices[0]?.supplierId;
    if (!supplierId || invoices.some((invoice) => invoice.supplierId !== supplierId)) {
      throw new Error("PAYMENT_REQUEST_SUPPLIER_MISMATCH");
    }

    const preparedLines = [];
    for (const [index, line] of inputLines.entries()) {
      const invoice = invoiceById.get(line.apInvoiceId);
      if (!invoice) {
        throw new Error("PAYMENT_REQUEST_INVOICE_NOT_FOUND");
      }
      assertPaymentRequestEligibleInvoice(invoice);
      const invoiceTotal = decimalToNumber(invoice.totalAmount);
      const prepared = await tx.paymentRequestLine.aggregate({
        where: {
          apInvoiceId: invoice.id,
          paymentRequest: {
            status: {
              notIn: ["REJECTED", "CANCELLED", "VOIDED"]
            }
          }
        },
        _sum: {
          requestedAmount: true
        }
      });
      const outstanding = roundMoney(
        invoiceTotal - decimalToNumber(prepared._sum.requestedAmount)
      );
      if (outstanding <= 0) {
        throw new Error("PAYMENT_REQUEST_INVOICE_ALREADY_PREPARED");
      }
      const requestedAmount = roundMoney(line.requestedAmount ?? outstanding);
      if (requestedAmount <= 0 || requestedAmount > outstanding) {
        throw new Error("PAYMENT_REQUEST_AMOUNT_INVALID");
      }
      preparedLines.push({
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        apInvoiceId: invoice.id,
        lineNumber: index + 1,
        requestedAmount,
        invoiceTotalSnapshot: invoiceTotal,
        invoiceOutstandingSnapshot: outstanding,
        notes: line.notes?.trim() || null,
        createdByUserId: session.user.id,
        invoice
      });
    }
    const requestedTotal = roundMoney(
      preparedLines.reduce((sum, line) => sum + line.requestedAmount, 0)
    );

    const publicReference = await nextPaymentRequestReference(session.context.companyId);
    const paymentRequest = await tx.paymentRequest.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        supplierId,
        publicReference,
        currencyCode: "PHP",
        totalRequestedAmount: requestedTotal,
        status: "DRAFT",
        requestedByUserId: session.user.id,
        requestReason: input.requestReason.trim(),
        evidenceReference:
          input.evidenceReference?.trim() ||
          preparedLines.find((line) => line.invoice.evidenceReference)?.invoice
            .evidenceReference ||
          null,
        idempotencyKey,
        lines: {
          create: preparedLines.map(({ invoice: _invoice, ...line }) => line)
        }
      },
      include: { lines: true }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_request.created",
        entityType: "PaymentRequest",
        entityId: paymentRequest.id,
        afterData: {
          status: "DRAFT",
          publicReference,
          totalRequestedAmount: requestedTotal,
          apInvoiceIds: preparedLines.map((line) => line.apInvoiceId)
        },
        metadata: {
          lineCount: preparedLines.length,
          invoiceStatuses: preparedLines.map((line) => line.invoice.status),
          invoiceMatchStatuses: preparedLines.map((line) => line.invoice.matchStatus),
          noSourceMutation: true,
          noPaymentRelease: true
        }
      }
    });

    const originatingExpenseLinks = await tx.expenseRequestSourceLink.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceDocumentType: "AP_INVOICE",
        sourceDocumentId: { in: preparedLines.map((line) => line.apInvoiceId) }
      },
      include: {
        expenseRequest: true
      }
    });

    for (const originatingExpenseLink of originatingExpenseLinks) {
      const paymentLine = paymentRequest.lines.find(
        (line) => line.apInvoiceId === originatingExpenseLink.sourceDocumentId
      );
      const preparedLine = preparedLines.find(
        (line) => line.apInvoiceId === originatingExpenseLink.sourceDocumentId
      );
      if (!paymentLine || !preparedLine) {
        throw new Error("PAYMENT_REQUEST_EXPENSE_LINEAGE_MISMATCH");
      }
      const sourceEventKey = `expense_payment_request_handoff_v1:${originatingExpenseLink.sourceDocumentId}`;
      await tx.expenseRequestSourceLink.upsert({
        where: {
          tenantId_companyId_sourceDocumentType_sourceDocumentId_sourceEventKey: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            sourceDocumentType: "PAYMENT_REQUEST",
            sourceDocumentId: paymentRequest.id,
            sourceEventKey
          }
        },
        create: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          expenseRequestId: originatingExpenseLink.expenseRequestId,
          expenseRequestLineId: null,
          sourceDocumentType: "PAYMENT_REQUEST",
          sourceDocumentId: paymentRequest.id,
          sourceDocumentLineId: paymentLine.id,
          sourceEventKey,
          sourceAmountSnapshotPhp: preparedLine.requestedAmount,
          remainingAmountSnapshotPhp: 0,
          sourceDocumentSnapshot: {
            paymentRequestReference: paymentRequest.publicReference,
            apInvoiceId: preparedLine.invoice.id,
            apInvoiceReference: preparedLine.invoice.publicReference,
            expenseRequestReference:
              originatingExpenseLink.expenseRequest.publicReference,
            boundary:
              "expense_to_payment_request_lineage_only_no_release_no_journal",
            noSourceMutation: true,
            noPaymentRelease: true,
            noBankMutation: true,
            noJournalPosting: true
          },
          createdByUserId: session.user.id
        },
        update: {
          sourceDocumentLineId: paymentLine.id,
          sourceAmountSnapshotPhp: preparedLine.requestedAmount,
          remainingAmountSnapshotPhp: 0,
          sourceDocumentSnapshot: {
            paymentRequestReference: paymentRequest.publicReference,
            apInvoiceId: preparedLine.invoice.id,
            apInvoiceReference: preparedLine.invoice.publicReference,
            expenseRequestReference:
              originatingExpenseLink.expenseRequest.publicReference,
            boundary:
              "expense_to_payment_request_lineage_only_no_release_no_journal",
            noSourceMutation: true,
            noPaymentRelease: true,
            noBankMutation: true,
            noJournalPosting: true
          }
        }
      });

      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "expense_request.payment_request_lineage_created",
          entityType: "ExpenseRequest",
          entityId: originatingExpenseLink.expenseRequestId,
          afterData: {
            paymentRequestId: paymentRequest.id,
            paymentRequestReference: paymentRequest.publicReference,
            apInvoiceId: preparedLine.invoice.id,
            apInvoiceReference: preparedLine.invoice.publicReference
          },
          metadata: {
            sourceDocumentType: "PAYMENT_REQUEST",
            sourceEventKey,
            noSourceMutation: true,
            noPaymentRelease: true,
            noBankMutation: true,
            noJournalPosting: true
          }
        }
      });
    }

    return paymentRequest;
  });
}

export async function submitPaymentRequest(input: PaymentRequestActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRequestCreate);

  return prisma.$transaction(async (tx) => {
    const request = await tx.paymentRequest.findFirst({
      where: {
        id: input.paymentRequestId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: { in: ["DRAFT", "RETURNED_FOR_REVISION"] }
      },
      include: {
        lines: {
          include: { apInvoice: true }
        }
      }
    });
    if (!request) {
      throw new Error("PAYMENT_REQUEST_NOT_OPEN_FOR_SUBMIT");
    }
    if (request.requestedByUserId !== session.user.id) {
      throw new Error("PAYMENT_REQUEST_SUBMITTER_MISMATCH");
    }
    for (const line of request.lines) {
      assertPaymentRequestEligibleInvoice(line.apInvoice);
    }
    const approvalRule = await findPaymentRequestApprovalRule(tx, session);
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("PAYMENT_REQUEST_APPROVAL_RULE_NOT_CONFIGURED");
    }
    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("PAYMENT_REQUEST_APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }
    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PaymentRequest",
        documentId: request.id,
        status: "PENDING"
      }
    });
    if (existingApproval) {
      throw new Error("PAYMENT_REQUEST_ALREADY_SUBMITTED");
    }

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PaymentRequest",
        documentId: request.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: approvalRule.steps.map((step, index) => ({
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: index === 0 ? "PENDING" : "WAITING"
          }))
        }
      }
    });
    const submittedAt = new Date();
    const updated = await tx.paymentRequest.update({
      where: { id: request.id },
      data: {
        status: "AWAITING_APPROVAL",
        approvalInstanceId: approvalInstance.id,
        submittedAt,
        submittedByUserId: session.user.id
      }
    });

    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_request.submitted",
        entityType: "PaymentRequest",
        entityId: request.id,
        beforeData: { status: request.status },
        afterData: { status: "AWAITING_APPROVAL", submittedAt },
        metadata: {
          remarks: input.remarks ?? null,
          approvalInstanceId: approvalInstance.id,
          approvalRuleId: approvalRule.id,
          noSourceMutation: true,
          noPaymentRelease: true
        }
      }
    });
    const recipientUserIds = await resolveScopedNotificationRecipients(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: request.locationId,
      assignedUserId: firstStep.userId,
      assignedRoleId: firstStep.roleId
    });
    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: request.locationId,
      recipientUserIds,
      notificationType: "APPROVE_PAYMENT_REQUEST",
      priority: "HIGH",
      title: `Approve Payment Request ${request.publicReference}`,
      body: `${session.user.displayName} submitted a payment request for approval.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "PaymentRequest",
      entityId: request.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: request.publicReference,
        requestedAmountPhp: Number(request.totalRequestedAmount),
        lineCount: request.lines.length,
        noSourceMutation: true,
        noPaymentRelease: true,
        noBankMutation: true,
        noJournalPosting: true
      }
    });

    return updated;
  });
}

export async function approvePaymentRequest(input: PaymentRequestActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRequestApprove);

  return prisma.$transaction(async (tx) => {
    const request = await tx.paymentRequest.findFirst({
      where: {
        id: input.paymentRequestId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: "AWAITING_APPROVAL"
      },
      include: {
        lines: {
          include: { apInvoice: true }
        }
      }
    });
    if (!request) {
      throw new Error("PAYMENT_REQUEST_NOT_AWAITING_APPROVAL");
    }
    if (request.requestedByUserId === session.user.id) {
      throw new Error("PAYMENT_REQUEST_SELF_APPROVAL_DENIED");
    }
    for (const line of request.lines) {
      assertPaymentRequestEligibleInvoice(line.apInvoice);
    }

    const approvedAt = new Date();
    const updated = await tx.paymentRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        approvedAt,
        approvedByUserId: session.user.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_request.approved",
        entityType: "PaymentRequest",
        entityId: request.id,
        beforeData: { status: request.status },
        afterData: { status: "APPROVED", approvedAt },
        metadata: {
          remarks: input.remarks ?? null,
          noSelfApproval: true,
          noSourceMutation: true,
          noPaymentRelease: true
        }
      }
    });

    return updated;
  });
}

export async function rejectPaymentRequest(
  input: PaymentRequestActionInput & { reason: string }
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRequestApprove);
  if (!input.reason.trim()) {
    throw new Error("PAYMENT_REQUEST_REJECT_REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.paymentRequest.findFirst({
      where: {
        id: input.paymentRequestId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: "AWAITING_APPROVAL"
      }
    });
    if (!request) {
      throw new Error("PAYMENT_REQUEST_NOT_AWAITING_APPROVAL");
    }
    if (request.requestedByUserId === session.user.id) {
      throw new Error("PAYMENT_REQUEST_SELF_REJECTION_DENIED");
    }
    const rejectedAt = new Date();
    const updated = await tx.paymentRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        rejectedAt,
        rejectedByUserId: session.user.id,
        rejectionReason: input.reason.trim()
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_request.rejected",
        entityType: "PaymentRequest",
        entityId: request.id,
        beforeData: { status: request.status },
        afterData: { status: "REJECTED", rejectedAt },
        metadata: {
          reason: input.reason.trim(),
          noSourceMutation: true,
          noPaymentRelease: true
        }
      }
    });

    return updated;
  });
}

export async function cancelPaymentRequest(
  input: PaymentRequestActionInput & { reason: string }
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRequestCreate);
  if (!input.reason.trim()) {
    throw new Error("PAYMENT_REQUEST_CANCEL_REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.paymentRequest.findFirst({
      where: {
        id: input.paymentRequestId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: { in: ["DRAFT", "SUBMITTED", "AWAITING_APPROVAL", "RETURNED_FOR_REVISION"] }
      }
    });
    if (!request) {
      throw new Error("PAYMENT_REQUEST_NOT_CANCELLABLE");
    }
    if (
      request.requestedByUserId !== session.user.id &&
      !session.permissionCodes.includes(permissions.financePaymentRequestApprove)
    ) {
      throw new Error("PAYMENT_REQUEST_CANCEL_PERMISSION_DENIED");
    }
    const cancelledAt = new Date();
    const updated = await tx.paymentRequest.update({
      where: { id: request.id },
      data: {
        status: "CANCELLED",
        cancelledAt,
        cancelledByUserId: session.user.id,
        cancellationReason: input.reason.trim()
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_request.cancelled",
        entityType: "PaymentRequest",
        entityId: request.id,
        beforeData: { status: request.status },
        afterData: { status: "CANCELLED", cancelledAt },
        metadata: {
          reason: input.reason.trim(),
          noSourceMutation: true,
          noPaymentRelease: true
        }
      }
    });

    return updated;
  });
}

export async function createBranchCashDepositDeclaration(
  input: BranchCashDepositDeclarationInput
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeCashDepositCreate);
  await assertAuthorizedLocation(session, session.context.locationId);
  if (!Number.isFinite(input.amountPhp) || input.amountPhp <= 0) {
    throw new Error("BRANCH_CASH_DEPOSIT_AMOUNT_REQUIRED");
  }
  if (!(input.depositDate instanceof Date) || Number.isNaN(input.depositDate.getTime())) {
    throw new Error("BRANCH_CASH_DEPOSIT_DATE_REQUIRED");
  }

  const sourceEventKey =
    input.sourceEventKey?.trim() ||
    `branch-cash-deposit:${session.context.locationId}:${input.bankAccountId}:${input.depositDate.toISOString()}:${input.amountPhp}:${input.depositSlipNumber?.trim() ?? "no-slip"}`;

  return prisma.$transaction(async (tx) => {
    const bankAccount = await tx.bankAccount.findFirst({
      where: {
        id: input.bankAccountId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        currencyCode: "PHP",
        status: "ACTIVE",
        OR: [{ locationId: null }, { locationId: session.context.locationId }]
      },
      select: {
        id: true,
        bankName: true,
        maskedAccountNumber: true
      }
    });
    if (!bankAccount) {
      throw new Error("BRANCH_CASH_DEPOSIT_BANK_ACCOUNT_NOT_FOUND");
    }

    const existing = await tx.branchCashDeposit.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey
      }
    });
    if (existing) {
      return existing;
    }

    const publicReference = await nextBranchCashDepositReference(
      session.context.companyId
    );
    const deposit = await tx.branchCashDeposit.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        bankAccountId: bankAccount.id,
        publicReference,
        depositDate: input.depositDate,
        amountPhp: roundMoney(input.amountPhp),
        status: "SUBMITTED",
        depositSlipNumber: input.depositSlipNumber?.trim() || null,
        sourceEventKey,
        evidenceReference: input.evidenceReference?.trim() || null,
        notes: input.notes?.trim() || null,
        declaredByUserId: session.user.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "branch_cash_deposit.declared",
        entityType: "BranchCashDeposit",
        entityId: deposit.id,
        afterData: {
          status: deposit.status,
          publicReference,
          amountPhp: roundMoney(input.amountPhp),
          bankName: bankAccount.bankName,
          maskedAccountNumber: bankAccount.maskedAccountNumber
        },
        metadata: {
          sourceEventKey,
          locationId: session.context.locationId,
          noBankMutation: true,
          noReconciliationMatch: true,
          noJournalPosting: true,
          noPaymentRelease: true
        }
      }
    });

    return deposit;
  });
}

export async function matchBranchCashDepositToBankReconciliation(
  input: BranchCashDepositBankMatchInput
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeReconciliationMatch);
  const reason = requireReleaseReason(
    input.reason,
    "BRANCH_CASH_DEPOSIT_RECONCILIATION_MATCH_REASON_REQUIRED"
  );
  const evidenceReference = requireReleaseEvidence(
    input.evidenceReference,
    "BRANCH_CASH_DEPOSIT_RECONCILIATION_MATCH_EVIDENCE_REQUIRED"
  );
  const idempotencyKey = requireReleaseEvidence(
    input.idempotencyKey,
    "BRANCH_CASH_DEPOSIT_RECONCILIATION_MATCH_IDEMPOTENCY_REQUIRED"
  );

  const existingMatch = await prisma.bankReconciliationMatch.findUnique({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey
      }
    },
    include: { branchCashDeposit: true }
  });
  if (existingMatch?.branchCashDeposit) {
    return existingMatch.branchCashDeposit;
  }

  return prisma.$transaction(async (tx) => {
    const deposit = await tx.branchCashDeposit.findFirst({
      where: {
        id: input.branchCashDepositId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: {
          in: [
            "SUBMITTED",
            "FINANCE_APPROVED",
            "QUEUED_FOR_RECONCILIATION",
            "EXCEPTION"
          ]
        }
      },
      include: {
        bankAccount: true,
        location: true,
        reconciliationMatches: {
          where: {
            sourceType: "BRANCH_CASH_DEPOSIT",
            status: { in: ["PROPOSED", "MATCHED"] }
          }
        }
      }
    });
    if (!deposit) {
      throw new Error("BRANCH_CASH_DEPOSIT_NOT_MATCHABLE");
    }
    await assertAuthorizedLocation(session, deposit.locationId);
    if (deposit.declaredByUserId === session.user.id) {
      throw new Error("BRANCH_CASH_DEPOSIT_RECONCILIATION_SEGREGATION_REQUIRED");
    }
    if (!deposit.depositSlipNumber && !deposit.evidenceReference) {
      throw new Error("BRANCH_CASH_DEPOSIT_EVIDENCE_REQUIRED");
    }

    const reconciliation = await tx.bankReconciliation.findFirst({
      where: {
        id: input.reconciliationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        bankAccountId: deposit.bankAccountId,
        status: { in: ["OPEN", "IN_PROGRESS", "EXCEPTION"] }
      },
      include: { bankAccount: true, statement: true }
    });
    if (!reconciliation) {
      throw new Error("BRANCH_CASH_DEPOSIT_RECONCILIATION_BATCH_NOT_AVAILABLE");
    }
    if (reconciliation.bankAccount.locationId) {
      await assertAuthorizedLocation(session, reconciliation.bankAccount.locationId);
    }

    const statementLine = await tx.bankStatementLine.findFirst({
      where: {
        id: input.statementLineId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        bankAccountId: deposit.bankAccountId,
        bankStatementId: reconciliation.bankStatementId,
        status: { in: ["UNMATCHED", "PARTIALLY_MATCHED", "EXCEPTION"] }
      }
    });
    if (!statementLine) {
      throw new Error("BRANCH_CASH_DEPOSIT_STATEMENT_LINE_NOT_AVAILABLE");
    }
    if (
      decimalToNumber(statementLine.creditAmount) <= 0 &&
      decimalToNumber(statementLine.netAmount) <= 0
    ) {
      throw new Error("BRANCH_CASH_DEPOSIT_STATEMENT_LINE_NOT_INFLOW");
    }

    const depositAmount = decimalToNumber(deposit.amountPhp);
    const depositMatchedAmount = roundMoney(
      deposit.reconciliationMatches.reduce(
        (sum, match) => sum + decimalToNumber(match.matchedAmount),
        0
      )
    );
    const depositRemainingAmount = roundMoney(depositAmount - depositMatchedAmount);
    const lineAmount = Math.abs(decimalToNumber(statementLine.netAmount));
    const lineMatchedAmount = decimalToNumber(statementLine.matchedAmount);
    const lineRemainingAmount = roundMoney(lineAmount - lineMatchedAmount);
    const matchedAmount = roundMoney(input.matchedAmount ?? depositRemainingAmount);

    if (matchedAmount <= 0) {
      throw new Error("BRANCH_CASH_DEPOSIT_RECONCILIATION_MATCH_AMOUNT_REQUIRED");
    }
    if (matchedAmount > depositRemainingAmount || matchedAmount > lineRemainingAmount) {
      throw new Error("BRANCH_CASH_DEPOSIT_RECONCILIATION_MATCH_AMOUNT_INVALID");
    }

    const match = await tx.bankReconciliationMatch.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        reconciliationId: reconciliation.id,
        statementLineId: statementLine.id,
        branchCashDepositId: deposit.id,
        sourceType: "BRANCH_CASH_DEPOSIT",
        sourceDocumentId: deposit.id,
        sourceDocumentSnapshot: {
          publicReference: deposit.publicReference,
          locationName: deposit.location.name,
          bankName: deposit.bankAccount.bankName,
          depositSlipNumber: deposit.depositSlipNumber,
          evidenceReference: deposit.evidenceReference,
          bankReference: statementLine.bankReference,
          depositAmount,
          matchedAmount,
          noBankMutation: true,
          noPaymentRelease: true,
          noApSettlement: true,
          noJournalPosting: true
        },
        matchedAmount,
        status: "MATCHED",
        idempotencyKey,
        matchedByUserId: session.user.id,
        matchedAt: new Date(),
        reason,
        evidenceReference
      }
    });

    const updatedLineMatchedAmount = roundMoney(lineMatchedAmount + matchedAmount);
    await tx.bankStatementLine.update({
      where: { id: statementLine.id },
      data: {
        matchedAmount: updatedLineMatchedAmount,
        status:
          updatedLineMatchedAmount >= lineAmount ? "MATCHED" : "PARTIALLY_MATCHED"
      }
    });

    const updatedDepositMatchedAmount = roundMoney(
      depositMatchedAmount + matchedAmount
    );
    const updatedDepositStatus =
      updatedDepositMatchedAmount >= depositAmount
        ? "MATCHED"
        : "QUEUED_FOR_RECONCILIATION";
    const updatedDeposit = await tx.branchCashDeposit.update({
      where: { id: deposit.id },
      data: {
        status: updatedDepositStatus,
        verifiedByUserId:
          updatedDepositStatus === "MATCHED" ? session.user.id : deposit.verifiedByUserId,
        verifiedAt: updatedDepositStatus === "MATCHED" ? new Date() : deposit.verifiedAt,
        evidenceReference
      }
    });

    const statementLines = await tx.bankStatementLine.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        bankStatementId: reconciliation.bankStatementId
      },
      select: { netAmount: true, matchedAmount: true }
    });
    const varianceAmount = roundMoney(
      statementLines.reduce(
        (sum, line) =>
          sum +
          Math.max(
            0,
            Math.abs(decimalToNumber(line.netAmount)) -
              decimalToNumber(line.matchedAmount)
          ),
        0
      )
    );
    await tx.bankReconciliation.update({
      where: { id: reconciliation.id },
      data: {
        status: varianceAmount === 0 ? "MATCHED" : "IN_PROGRESS",
        varianceAmount
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "branch_cash_deposit.bank_reconciliation_matched",
        entityType: "BranchCashDeposit",
        entityId: deposit.id,
        beforeData: { status: deposit.status },
        afterData: {
          status: updatedDeposit.status,
          matchedAmount,
          updatedDepositMatchedAmount,
          varianceAmount
        },
        metadata: {
          reconciliationId: reconciliation.id,
          statementLineId: statementLine.id,
          bankReconciliationMatchId: match.id,
          idempotencyKey,
          noBankMutation: true,
          noPaymentRelease: true,
          noApSettlement: true,
          noJournalPosting: true
        }
      }
    });

    return updatedDeposit;
  });
}

export async function createPaymentReleaseDraft(input: PaymentReleaseDraftInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  if (!input.reason.trim()) {
    throw new Error("PAYMENT_RELEASE_REASON_REQUIRED");
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await prisma.paymentRelease.findUnique({
      where: {
        tenantId_companyId_idempotencyKey: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          idempotencyKey
        }
      },
      include: { allocations: true }
    });
    if (existing) {
      return existing;
    }
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.paymentRequest.findFirst({
      where: {
        id: input.paymentRequestId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: "APPROVED"
      },
      include: {
        supplier: true,
        lines: true
      }
    });
    if (!request) {
      throw new Error("PAYMENT_RELEASE_REQUEST_NOT_APPROVED");
    }
    if (request.currencyCode !== "PHP") {
      throw new Error("PAYMENT_RELEASE_PHP_ONLY");
    }

    const bankAccount = await tx.bankAccount.findFirst({
      where: {
        id: input.bankAccountId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        currencyCode: "PHP",
        OR: [{ locationId: null }, { locationId: session.context.locationId }]
      }
    });
    if (!bankAccount) {
      throw new Error("PAYMENT_RELEASE_BANK_ACCOUNT_NOT_AVAILABLE");
    }
    if (request.lines.length === 0) {
      throw new Error("PAYMENT_RELEASE_LINES_REQUIRED");
    }

    const requestedTotal = decimalToNumber(request.totalRequestedAmount);
    const releaseAmount = roundMoney(input.releaseAmount ?? requestedTotal);
    if (releaseAmount <= 0 || releaseAmount > requestedTotal) {
      throw new Error("PAYMENT_RELEASE_AMOUNT_INVALID");
    }
    if (releaseAmount !== requestedTotal) {
      throw new Error("PAYMENT_RELEASE_PARTIAL_NOT_ENABLED");
    }
    const approvalRule = await findPaymentReleaseApprovalRule(tx, session);
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("PAYMENT_RELEASE_APPROVAL_RULE_NOT_CONFIGURED");
    }
    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("PAYMENT_RELEASE_APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }

    const publicReference = await nextPaymentReleaseReference(session.context.companyId);
    const sourceEventKey =
      input.sourceEventKey?.trim() || `payment-release:${request.id}:${randomUUID()}`;
    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PaymentRelease",
        documentId: randomUUID(),
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: approvalRule.steps.map((step, index) => ({
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: index === 0 ? "PENDING" : "WAITING"
          }))
        }
      }
    });
    const release = await tx.paymentRelease.create({
      data: {
        id: approvalInstance.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        supplierId: request.supplierId,
        paymentRequestId: request.id,
        bankAccountId: bankAccount.id,
        publicReference,
        currencyCode: "PHP",
        method: input.method ?? "BANK_TRANSFER",
        status: "DRAFT",
        approvalInstanceId: approvalInstance.id,
        totalRequestedAmount: requestedTotal,
        releaseAmount,
        releasedAmount: 0,
        sourceEventKey,
        idempotencyKey,
        reason: input.reason.trim(),
        evidenceReference: input.evidenceReference?.trim() || request.evidenceReference,
        scheduledAt: input.scheduledAt ?? null,
        createdByUserId: session.user.id,
        allocations: {
          create: request.lines.map((line) => ({
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            paymentRequestLineId: line.id,
            apInvoiceId: line.apInvoiceId,
            allocatedAmount: decimalToNumber(line.requestedAmount),
            requestLineSnapshotAmount: decimalToNumber(line.requestedAmount),
            invoiceOutstandingSnapshot: decimalToNumber(line.invoiceOutstandingSnapshot),
            createdByUserId: session.user.id
          }))
        }
      },
      include: { allocations: true }
    });

    const allocationTotal = release.allocations.reduce(
      (sum, line) => sum + decimalToNumber(line.allocatedAmount),
      0
    );
    if (roundMoney(allocationTotal) !== releaseAmount) {
      throw new Error("PAYMENT_RELEASE_ALLOCATION_TOTAL_MISMATCH");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_release.submitted",
        entityType: "PaymentRelease",
        entityId: release.id,
        afterData: {
          status: "DRAFT",
          publicReference,
          paymentRequestId: request.id,
          bankAccountId: bankAccount.id,
          releaseAmount
        },
        metadata: {
          approvalInstanceId: approvalInstance.id,
          approvalRuleId: approvalRule.id,
          sourcePaymentRequestStatus: request.status,
          noSourceMutation: true,
          noApMutation: true,
          noProcurementMutation: true,
          noInventoryMutation: true,
          noBankApiCall: true,
          noJournalPosting: true
        }
      }
    });
    const recipientUserIds = await resolveScopedNotificationRecipients(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      assignedUserId: firstStep.userId,
      assignedRoleId: firstStep.roleId
    });
    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      recipientUserIds,
      notificationType: "APPROVE_PAYMENT_RELEASE",
      priority: "HIGH",
      title: `Approve Payment Release ${release.publicReference}`,
      body: `${session.user.displayName} prepared a payment release for approval.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "PaymentRelease",
      entityId: release.id,
      sourceEventKey: `payment-release-approval:${release.id}`,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: release.publicReference,
        releaseAmountPhp: releaseAmount,
        method: release.method,
        bankAccountId: bankAccount.id,
        noBankApiCall: true,
        noJournalPosting: true,
        noApMutation: true
      }
    });

    return release;
  });
}

export async function executePaymentRelease(input: PaymentReleaseExecuteInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const releaseReference = input.releaseReference.trim();
  const evidenceReference = input.evidenceReference.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!releaseReference || !idempotencyKey) {
    throw new Error("PAYMENT_RELEASE_EXECUTION_EVIDENCE_REQUIRED");
  }

  const existingAttempt = await prisma.paymentReleaseExecution.findUnique({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey
      }
    },
    include: { paymentRelease: true }
  });
  if (existingAttempt) {
    return existingAttempt.paymentRelease;
  }

  return prisma.$transaction(async (tx) => {
    const release = await tx.paymentRelease.findFirst({
      where: {
        id: input.paymentReleaseId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: "READY_FOR_RELEASE"
      },
      include: {
        paymentRequest: true,
        bankAccount: true,
        allocations: true
      }
    });
    if (!release) {
      throw new Error("PAYMENT_RELEASE_NOT_READY");
    }
    if (release.createdByUserId === session.user.id) {
      throw new Error("PAYMENT_RELEASE_CREATOR_CANNOT_RELEASE");
    }
    if (release.paymentRequest.requestedByUserId === session.user.id) {
      throw new Error("PAYMENT_RELEASE_REQUESTER_CANNOT_RELEASE");
    }
    if (release.paymentRequest.approvedByUserId === session.user.id) {
      throw new Error("PAYMENT_RELEASE_APPROVER_CANNOT_RELEASE");
    }
    if (release.bankAccount.status !== "ACTIVE" || release.bankAccount.currencyCode !== "PHP") {
      throw new Error("PAYMENT_RELEASE_BANK_ACCOUNT_NOT_AVAILABLE");
    }
    const evidencePolicyMetadata = await requirePaymentReleaseExecutionEvidence(
      session,
      release.method,
      evidenceReference
    );

    const releasedAt = new Date();
    const releaseAmount = decimalToNumber(release.releaseAmount);
    const updatedRelease = await tx.paymentRelease.updateMany({
      where: {
        id: release.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "READY_FOR_RELEASE"
      },
      data: {
        status: "RELEASED",
        releasedAmount: releaseAmount,
        releasedAt,
        releasedByUserId: session.user.id,
        releaseReference,
        evidenceReference
      }
    });
    if (updatedRelease.count !== 1) {
      throw new Error("PAYMENT_RELEASE_EXECUTION_STATE_CONFLICT");
    }

    await tx.paymentReleaseExecution.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        paymentReleaseId: release.id,
        status: "SUCCEEDED",
        idempotencyKey,
        requestPayloadHash: createHash("sha256")
          .update(`${release.id}:${releaseReference}:${releaseAmount}`)
          .digest("hex"),
        releaseReference,
        executionSnapshot: {
          method: release.method,
          bankAccountId: release.bankAccountId,
          allocationCount: release.allocations.length,
          noBankApiCall: true
        },
        actorUserId: session.user.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_release.released",
        entityType: "PaymentRelease",
        entityId: release.id,
        beforeData: { status: release.status },
        afterData: {
          status: "RELEASED",
          releasedAt,
          releasedAmount: releaseAmount,
          releaseReference
        },
        metadata: {
          remarks: input.remarks ?? null,
          noSelfRelease: true,
          noSourceMutation: true,
          noApMutation: true,
          noProcurementMutation: true,
          noInventoryMutation: true,
          noBankApiCall: true,
          noJournalPosting: true,
          ...evidencePolicyMetadata
        }
      }
    });

    return tx.paymentRelease.findUniqueOrThrow({
      where: { id: release.id }
    });
  });
}

export async function holdPaymentRelease(input: PaymentReleaseActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const reason = requireReleaseReason(
    input.reason,
    "PAYMENT_RELEASE_HOLD_REASON_REQUIRED"
  );
  const evidenceReference = requireReleaseEvidence(
    input.evidenceReference,
    "PAYMENT_RELEASE_HOLD_EVIDENCE_REQUIRED"
  );

  return prisma.$transaction(async (tx) => {
    const release = await tx.paymentRelease.findFirst({
      where: {
        id: input.paymentReleaseId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: { paymentRequest: true }
    });
    if (!release) {
      throw new Error("PAYMENT_RELEASE_NOT_FOUND");
    }
    assertPaymentReleaseStatus(release.status, [
      "READY_FOR_RELEASE",
      "RELEASED",
      "RECONCILIATION_PENDING",
      "PARTIALLY_RECONCILED",
      "EXCEPTION"
    ]);
    assertPaymentReleaseSegregation(
      session,
      release,
      "PAYMENT_RELEASE_HOLD_SEGREGATION_REQUIRED"
    );
    const updated = await tx.paymentRelease.update({
      where: { id: release.id },
      data: {
        status: "ON_HOLD",
        holdReason: reason,
        heldAt: new Date(),
        heldByUserId: session.user.id,
        evidenceReference
      }
    });
    await writePaymentReleaseAudit(tx, {
      session,
      releaseId: release.id,
      eventType: "payment_release.held",
      beforeStatus: release.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        remarks: input.remarks ?? null
      }
    });
    return updated;
  });
}

export async function resumePaymentReleaseFromHold(input: PaymentReleaseActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const reason = requireReleaseReason(
    input.reason,
    "PAYMENT_RELEASE_RESUME_REASON_REQUIRED"
  );

  return prisma.$transaction(async (tx) => {
    const release = await tx.paymentRelease.findFirst({
      where: {
        id: input.paymentReleaseId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: { paymentRequest: true }
    });
    if (!release) {
      throw new Error("PAYMENT_RELEASE_NOT_FOUND");
    }
    assertPaymentReleaseStatus(release.status, ["ON_HOLD"]);
    assertPaymentReleaseSegregation(
      session,
      release,
      "PAYMENT_RELEASE_RESUME_SEGREGATION_REQUIRED"
    );
    const nextStatus =
      decimalToNumber(release.releasedAmount) > 0
        ? "RECONCILIATION_PENDING"
        : "READY_FOR_RELEASE";
    const updated = await tx.paymentRelease.update({
      where: { id: release.id },
      data: {
        status: nextStatus,
        holdReason: null
      }
    });
    await writePaymentReleaseAudit(tx, {
      session,
      releaseId: release.id,
      eventType: "payment_release.resumed",
      beforeStatus: release.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference?.trim() ?? release.evidenceReference,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null
      }
    });
    return updated;
  });
}

export async function cancelPaymentRelease(input: PaymentReleaseActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const reason = requireReleaseReason(
    input.reason,
    "PAYMENT_RELEASE_CANCELLATION_REASON_REQUIRED"
  );
  const evidenceReference = requireReleaseEvidence(
    input.evidenceReference,
    "PAYMENT_RELEASE_CANCELLATION_EVIDENCE_REQUIRED"
  );

  return prisma.$transaction(async (tx) => {
    const release = await tx.paymentRelease.findFirst({
      where: {
        id: input.paymentReleaseId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: { paymentRequest: true }
    });
    if (!release) {
      throw new Error("PAYMENT_RELEASE_NOT_FOUND");
    }
    assertPaymentReleaseStatus(release.status, [
      "READY_FOR_RELEASE",
      "ON_HOLD",
      "EXCEPTION"
    ]);
    assertPaymentReleaseSegregation(
      session,
      release,
      "PAYMENT_RELEASE_CANCEL_SEGREGATION_REQUIRED"
    );
    if (decimalToNumber(release.releasedAmount) > 0) {
      throw new Error("PAYMENT_RELEASE_CANCEL_REQUIRES_REVERSAL");
    }
    const updated = await tx.paymentRelease.update({
      where: { id: release.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByUserId: session.user.id,
        cancellationReason: reason,
        evidenceReference
      }
    });
    await writePaymentReleaseAudit(tx, {
      session,
      releaseId: release.id,
      eventType: "payment_release.cancelled",
      beforeStatus: release.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null
      }
    });
    return updated;
  });
}

export async function markPaymentReleaseExecutionFailed(
  input: PaymentReleaseFailureInput
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const reason = requireReleaseReason(
    input.reason,
    "PAYMENT_RELEASE_FAILURE_REASON_REQUIRED"
  );
  const evidenceReference = requireReleaseEvidence(
    input.evidenceReference,
    "PAYMENT_RELEASE_FAILURE_EVIDENCE_REQUIRED"
  );
  const failureCode = input.failureCode.trim();
  const idempotencyKey = requireReleaseEvidence(
    input.idempotencyKey,
    "PAYMENT_RELEASE_FAILURE_IDEMPOTENCY_REQUIRED"
  );
  if (!failureCode) {
    throw new Error("PAYMENT_RELEASE_FAILURE_CODE_REQUIRED");
  }

  const existingAttempt = await prisma.paymentReleaseExecution.findUnique({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey
      }
    },
    include: { paymentRelease: true }
  });
  if (existingAttempt) {
    return existingAttempt.paymentRelease;
  }

  return prisma.$transaction(async (tx) => {
    const release = await tx.paymentRelease.findFirst({
      where: {
        id: input.paymentReleaseId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: "READY_FOR_RELEASE"
      },
      include: { paymentRequest: true }
    });
    if (!release) {
      throw new Error("PAYMENT_RELEASE_NOT_READY");
    }
    assertPaymentReleaseSegregation(
      session,
      release,
      "PAYMENT_RELEASE_FAILURE_SEGREGATION_REQUIRED"
    );
    const updatedRelease = await tx.paymentRelease.updateMany({
      where: {
        id: release.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "READY_FOR_RELEASE"
      },
      data: {
        status: "EXCEPTION",
        exceptionReason: reason,
        evidenceReference
      }
    });
    if (updatedRelease.count !== 1) {
      throw new Error("PAYMENT_RELEASE_EXECUTION_STATE_CONFLICT");
    }

    await tx.paymentReleaseExecution.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        paymentReleaseId: release.id,
        status: "FAILED",
        idempotencyKey,
        failureCode,
        failureReason: reason,
        executionSnapshot: {
          evidenceReference,
          noBankApiCall: true,
          noJournalPosting: true
        },
        actorUserId: session.user.id
      }
    });
    await writePaymentReleaseAudit(tx, {
      session,
      releaseId: release.id,
      eventType: "payment_release.execution_failed",
      beforeStatus: release.status,
      afterStatus: "EXCEPTION",
      reason,
      evidenceReference,
      metadata: {
        failureCode,
        idempotencyKey
      }
    });
    return tx.paymentRelease.findUniqueOrThrow({
      where: { id: release.id }
    });
  });
}

export async function handoffPaymentReleaseToReconciliation(
  input: PaymentReleaseActionInput
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const reason = requireReleaseReason(
    input.reason,
    "PAYMENT_RELEASE_RECONCILIATION_HANDOFF_REASON_REQUIRED"
  );
  const evidenceReference = requireReleaseEvidence(
    input.evidenceReference,
    "PAYMENT_RELEASE_RECONCILIATION_HANDOFF_EVIDENCE_REQUIRED"
  );

  return prisma.$transaction(async (tx) => {
    const release = await tx.paymentRelease.findFirst({
      where: {
        id: input.paymentReleaseId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: { paymentRequest: true }
    });
    if (!release) {
      throw new Error("PAYMENT_RELEASE_NOT_FOUND");
    }
    assertPaymentReleaseStatus(release.status, ["RELEASED"]);
    const updated = await tx.paymentRelease.update({
      where: { id: release.id },
      data: {
        status: "RECONCILIATION_PENDING",
        evidenceReference
      }
    });
    await writePaymentReleaseAudit(tx, {
      session,
      releaseId: release.id,
      eventType: "payment_release.reconciliation_handoff",
      beforeStatus: release.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        remarks: input.remarks ?? null,
        noBankMutation: true
      }
    });
    return updated;
  });
}

export async function recordPaymentReleaseReconciliationOutcome(
  input: PaymentReleaseReconciliationInput
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const reason = requireReleaseReason(
    input.reason,
    "PAYMENT_RELEASE_RECONCILIATION_REASON_REQUIRED"
  );
  const evidenceReference = requireReleaseEvidence(
    input.evidenceReference,
    "PAYMENT_RELEASE_RECONCILIATION_EVIDENCE_REQUIRED"
  );

  return prisma.$transaction(async (tx) => {
    const release = await tx.paymentRelease.findFirst({
      where: {
        id: input.paymentReleaseId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: { paymentRequest: true }
    });
    if (!release) {
      throw new Error("PAYMENT_RELEASE_NOT_FOUND");
    }
    assertPaymentReleaseStatus(release.status, ["RECONCILIATION_PENDING"]);
    const matchedAmount = roundMoney(
      input.matchedAmount ?? decimalToNumber(release.releasedAmount)
    );
    if (matchedAmount < 0 || matchedAmount > decimalToNumber(release.releasedAmount)) {
      throw new Error("PAYMENT_RELEASE_RECONCILIATION_AMOUNT_INVALID");
    }
    if (input.outcome === "FULLY_RECONCILED" && matchedAmount !== decimalToNumber(release.releasedAmount)) {
      throw new Error("PAYMENT_RELEASE_FULL_RECONCILIATION_AMOUNT_MISMATCH");
    }
    const updated = await tx.paymentRelease.update({
      where: { id: release.id },
      data: {
        status: input.outcome,
        evidenceReference,
        exceptionReason: input.outcome === "EXCEPTION" ? reason : release.exceptionReason
      }
    });
    await writePaymentReleaseAudit(tx, {
      session,
      releaseId: release.id,
      eventType: "payment_release.reconciliation_outcome_recorded",
      beforeStatus: release.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        outcome: input.outcome,
        matchedAmount,
        bankReference: input.bankReference?.trim() ?? null,
        noBankMutation: true,
        noApSettlement: true
      }
    });
    return updated;
  });
}

export async function matchPaymentReleaseToBankReconciliation(
  input: PaymentReleaseBankMatchInput
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeReconciliationMatch);
  const reason = requireReleaseReason(
    input.reason,
    "PAYMENT_RELEASE_RECONCILIATION_MATCH_REASON_REQUIRED"
  );
  const evidenceReference = requireReleaseEvidence(
    input.evidenceReference,
    "PAYMENT_RELEASE_RECONCILIATION_MATCH_EVIDENCE_REQUIRED"
  );
  const idempotencyKey = requireReleaseEvidence(
    input.idempotencyKey,
    "PAYMENT_RELEASE_RECONCILIATION_MATCH_IDEMPOTENCY_REQUIRED"
  );

  const existingMatch = await prisma.bankReconciliationMatch.findUnique({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey
      }
    },
    include: { paymentRelease: true }
  });
  if (existingMatch?.paymentRelease) {
    return existingMatch.paymentRelease;
  }

  return prisma.$transaction(async (tx) => {
    const release = await tx.paymentRelease.findFirst({
      where: {
        id: input.paymentReleaseId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: {
          in: ["RELEASED", "RECONCILIATION_PENDING", "PARTIALLY_RECONCILED"]
        }
      },
      include: {
        paymentRequest: true,
        bankAccount: true,
        reconciliationMatches: {
          where: {
            status: {
              in: ["PROPOSED", "MATCHED"]
            }
          }
        }
      }
    });
    if (!release) {
      throw new Error("PAYMENT_RELEASE_NOT_MATCHABLE");
    }
    await assertAuthorizedLocation(session, release.locationId);
    if (
      release.createdByUserId === session.user.id ||
      release.paymentRequest.requestedByUserId === session.user.id ||
      release.paymentRequest.approvedByUserId === session.user.id ||
      release.releasedByUserId === session.user.id
    ) {
      throw new Error("PAYMENT_RELEASE_RECONCILIATION_SEGREGATION_REQUIRED");
    }
    if (!release.releaseReference || !release.evidenceReference) {
      throw new Error("PAYMENT_RELEASE_RELEASE_EVIDENCE_REQUIRED");
    }

    const reconciliation = await tx.bankReconciliation.findFirst({
      where: {
        id: input.reconciliationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        bankAccountId: release.bankAccountId,
        status: {
          in: ["OPEN", "IN_PROGRESS", "EXCEPTION"]
        }
      },
      include: {
        bankAccount: true,
        statement: true
      }
    });
    if (!reconciliation) {
      throw new Error("PAYMENT_RELEASE_RECONCILIATION_BATCH_NOT_AVAILABLE");
    }
    if (reconciliation.bankAccount.locationId) {
      await assertAuthorizedLocation(session, reconciliation.bankAccount.locationId);
    }

    const statementLine = await tx.bankStatementLine.findFirst({
      where: {
        id: input.statementLineId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        bankAccountId: release.bankAccountId,
        bankStatementId: reconciliation.bankStatementId,
        status: {
          in: ["UNMATCHED", "PARTIALLY_MATCHED", "EXCEPTION"]
        }
      }
    });
    if (!statementLine) {
      throw new Error("PAYMENT_RELEASE_STATEMENT_LINE_NOT_AVAILABLE");
    }
    if (
      decimalToNumber(statementLine.debitAmount) <= 0 &&
      decimalToNumber(statementLine.netAmount) >= 0
    ) {
      throw new Error("PAYMENT_RELEASE_STATEMENT_LINE_NOT_OUTFLOW");
    }

    const releasedAmount = decimalToNumber(release.releasedAmount);
    if (releasedAmount <= 0) {
      throw new Error("PAYMENT_RELEASE_NOT_RELEASED");
    }
    const releaseMatchedAmount = roundMoney(
      release.reconciliationMatches.reduce(
        (sum, match) => sum + decimalToNumber(match.matchedAmount),
        0
      )
    );
    const releaseRemainingAmount = roundMoney(releasedAmount - releaseMatchedAmount);
    const lineAmount = Math.abs(decimalToNumber(statementLine.netAmount));
    const lineMatchedAmount = decimalToNumber(statementLine.matchedAmount);
    const lineRemainingAmount = roundMoney(lineAmount - lineMatchedAmount);
    const matchedAmount = roundMoney(input.matchedAmount ?? releaseRemainingAmount);

    if (matchedAmount <= 0) {
      throw new Error("PAYMENT_RELEASE_RECONCILIATION_MATCH_AMOUNT_REQUIRED");
    }
    if (matchedAmount > releaseRemainingAmount || matchedAmount > lineRemainingAmount) {
      throw new Error("PAYMENT_RELEASE_RECONCILIATION_MATCH_AMOUNT_INVALID");
    }

    const match = await tx.bankReconciliationMatch.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        reconciliationId: reconciliation.id,
        statementLineId: statementLine.id,
        paymentReleaseId: release.id,
        sourceType: "PAYMENT_RELEASE",
        sourceDocumentId: release.id,
        sourceDocumentSnapshot: {
          publicReference: release.publicReference,
          paymentRequestReference: release.paymentRequest.publicReference,
          supplierId: release.supplierId,
          releaseReference: release.releaseReference,
          bankReference: statementLine.bankReference,
          releasedAmount,
          matchedAmount,
          noApSettlement: true,
          noBankApiCall: true,
          noJournalPosting: true
        },
        matchedAmount,
        status: "MATCHED",
        idempotencyKey,
        matchedByUserId: session.user.id,
        matchedAt: new Date(),
        reason,
        evidenceReference
      }
    });

    const updatedLineMatchedAmount = roundMoney(lineMatchedAmount + matchedAmount);
    await tx.bankStatementLine.update({
      where: { id: statementLine.id },
      data: {
        matchedAmount: updatedLineMatchedAmount,
        status:
          updatedLineMatchedAmount >= lineAmount ? "MATCHED" : "PARTIALLY_MATCHED"
      }
    });

    const statementLines = await tx.bankStatementLine.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        bankStatementId: reconciliation.bankStatementId
      },
      select: {
        netAmount: true,
        matchedAmount: true
      }
    });
    const varianceAmount = roundMoney(
      statementLines.reduce(
        (sum, line) =>
          sum +
          Math.max(
            0,
            Math.abs(decimalToNumber(line.netAmount)) -
              decimalToNumber(line.matchedAmount)
          ),
        0
      )
    );
    await tx.bankReconciliation.update({
      where: { id: reconciliation.id },
      data: {
        status: varianceAmount === 0 ? "MATCHED" : "IN_PROGRESS",
        varianceAmount
      }
    });

    const updatedReleaseMatchedAmount = roundMoney(
      releaseMatchedAmount + matchedAmount
    );
    const updatedReleaseStatus =
      updatedReleaseMatchedAmount >= releasedAmount
        ? "FULLY_RECONCILED"
        : "PARTIALLY_RECONCILED";
    const updatedRelease = await tx.paymentRelease.update({
      where: { id: release.id },
      data: {
        status: updatedReleaseStatus,
        evidenceReference
      }
    });

    await writePaymentReleaseAudit(tx, {
      session,
      releaseId: release.id,
      eventType: "payment_release.bank_reconciliation_matched",
      beforeStatus: release.status,
      afterStatus: updatedRelease.status,
      reason,
      evidenceReference,
      metadata: {
        reconciliationId: reconciliation.id,
        statementLineId: statementLine.id,
        bankReconciliationMatchId: match.id,
        matchedAmount,
        updatedReleaseMatchedAmount,
        varianceAmount,
        idempotencyKey,
        noBankApiCall: true,
        noApSettlement: true,
        noJournalPosting: true,
        noSourcePaymentRequestMutation: true
      }
    });

    return updatedRelease;
  });
}

export async function requestPaymentReleaseReversal(input: PaymentReleaseActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const reason = requireReleaseReason(
    input.reason,
    "PAYMENT_RELEASE_REVERSAL_REASON_REQUIRED"
  );
  const evidenceReference = requireReleaseEvidence(
    input.evidenceReference,
    "PAYMENT_RELEASE_REVERSAL_EVIDENCE_REQUIRED"
  );

  return prisma.$transaction(async (tx) => {
    const release = await tx.paymentRelease.findFirst({
      where: {
        id: input.paymentReleaseId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId
      },
      include: {
        paymentRequest: true,
        reconciliationMatches: {
          where: {
            sourceType: "PAYMENT_RELEASE",
            status: {
              in: ["PROPOSED", "MATCHED"]
            }
          },
          include: {
            reconciliation: true,
            statementLine: true
          }
        }
      }
    });
    if (!release) {
      throw new Error("PAYMENT_RELEASE_NOT_FOUND");
    }
    if (release.status === "REVERSED") {
      return release;
    }
    assertPaymentReleaseStatus(release.status, [
      "RELEASED",
      "RECONCILIATION_PENDING",
      "PARTIALLY_RECONCILED",
      "FULLY_RECONCILED",
      "EXCEPTION"
    ]);
    assertPaymentReleaseSegregation(
      session,
      release,
      "PAYMENT_RELEASE_REVERSAL_SEGREGATION_REQUIRED"
    );
    const closedReconciliationMatch = release.reconciliationMatches.find(
      (match) => match.reconciliation.status === "CLOSED"
    );
    if (closedReconciliationMatch) {
      throw new Error("PAYMENT_RELEASE_REVERSAL_REQUIRES_RECONCILIATION_REOPEN");
    }
    const voidedReconciliationMatch = release.reconciliationMatches.find(
      (match) =>
        match.reconciliation.status === "VOIDED" ||
        match.statementLine.status === "VOIDED"
    );
    if (voidedReconciliationMatch) {
      throw new Error("PAYMENT_RELEASE_REVERSAL_RECONCILIATION_VOIDED");
    }

    const reversedMatchIds = release.reconciliationMatches.map((match) => match.id);
    const impactedStatementLineIds = Array.from(
      new Set(release.reconciliationMatches.map((match) => match.statementLineId))
    );
    const impactedReconciliationIds = Array.from(
      new Set(release.reconciliationMatches.map((match) => match.reconciliationId))
    );

    if (reversedMatchIds.length > 0) {
      await tx.bankReconciliationMatch.updateMany({
        where: {
          id: {
            in: reversedMatchIds
          },
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          paymentReleaseId: release.id,
          status: {
            in: ["PROPOSED", "MATCHED"]
          }
        },
        data: {
          status: "REVERSED",
          reason,
          evidenceReference
        }
      });

      for (const statementLineId of impactedStatementLineIds) {
        const lineMatches = release.reconciliationMatches.filter(
          (match) => match.statementLineId === statementLineId
        );
        const statementLine = lineMatches[0]?.statementLine;
        if (!statementLine) {
          continue;
        }
        const reversedAmount = roundMoney(
          lineMatches.reduce(
            (sum, match) => sum + decimalToNumber(match.matchedAmount),
            0
          )
        );
        const lineAmount = Math.abs(decimalToNumber(statementLine.netAmount));
        const nextMatchedAmount = Math.max(
          0,
          roundMoney(decimalToNumber(statementLine.matchedAmount) - reversedAmount)
        );
        const nextStatus =
          nextMatchedAmount <= 0
            ? "UNMATCHED"
            : nextMatchedAmount >= lineAmount
              ? "MATCHED"
              : "PARTIALLY_MATCHED";
        await tx.bankStatementLine.update({
          where: { id: statementLine.id },
          data: {
            matchedAmount: nextMatchedAmount,
            status: nextStatus
          }
        });
      }

      for (const reconciliationId of impactedReconciliationIds) {
        const reconciliation = release.reconciliationMatches.find(
          (match) => match.reconciliationId === reconciliationId
        )?.reconciliation;
        if (!reconciliation) {
          continue;
        }
        const statementLines = await tx.bankStatementLine.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            bankStatementId: reconciliation.bankStatementId
          },
          select: {
            netAmount: true,
            matchedAmount: true
          }
        });
        const varianceAmount = roundMoney(
          statementLines.reduce(
            (sum, line) =>
              sum +
              Math.max(
                0,
                Math.abs(decimalToNumber(line.netAmount)) -
                  decimalToNumber(line.matchedAmount)
              ),
            0
          )
        );
        await tx.bankReconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: varianceAmount === 0 ? "MATCHED" : "IN_PROGRESS",
            varianceAmount,
            reason
          }
        });
      }
    }

    const updated = await tx.paymentRelease.update({
      where: { id: release.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversedByUserId: session.user.id,
        reversalReason: reason,
        evidenceReference
      }
    });
    await writePaymentReleaseAudit(tx, {
      session,
      releaseId: release.id,
      eventType: "payment_release.reversal_requested",
      beforeStatus: release.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        reversedReconciliationMatchCount: reversedMatchIds.length,
        impactedStatementLineCount: impactedStatementLineIds.length,
        impactedReconciliationCount: impactedReconciliationIds.length,
        reversalRecoveryApplied: true,
        noBankApiCall: true,
        noApSettlement: true,
        noJournalPosting: true,
        noSourcePaymentRequestMutation: true
      }
    });
    return updated;
  });
}

export async function createManualJournalDraft(input: ManualJournalDraftInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeJournalCreate);
  assertPhpOnly("PHP");
  const totals = assertBalancedJournal(input.lines);
  await requireOpenAccountingPeriod(session, input.accountingPeriodId);
  await assertJournalAccountsArePostable(session, input.lines);

  for (const line of input.lines) {
    if (line.locationId) {
      await assertAuthorizedLocation(session, line.locationId);
    }
  }

  const publicReference = await nextFinanceJournalReference(session.context.companyId);
  const sourceEventKey = input.sourceEventKey?.trim() || `manual:${randomUUID()}`;

  return prisma.$transaction(async (tx) => {
    const journal = await tx.financeJournal.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        publicReference,
        journalType: "MANUAL",
        status: "DRAFT",
        currencyCode: "PHP",
        accountingPeriodId: input.accountingPeriodId,
        journalDate: input.journalDate,
        description: input.description.trim(),
        businessJustification: input.businessJustification.trim(),
        evidenceReference: input.evidenceReference?.trim() || null,
        sourceDocumentType: "MANUAL_JOURNAL",
        sourceEventKey,
        postingConsequenceType: "MANUAL_JOURNAL",
        brandId: session.context.brandId,
        locationId: session.context.locationId,
        createdByUserId: session.user.id,
        totalDebitAmountPhp: totals.debit,
        totalCreditAmountPhp: totals.credit,
        lines: {
          createMany: {
            data: input.lines.map((line, index) => ({
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            lineNumber: index + 1,
            accountId: line.accountId,
            amountSide: line.amountSide,
            amountPhp: line.amountPhp,
            lineDescription: line.lineDescription.trim(),
            brandId: line.brandId ?? session.context.brandId,
            locationId: line.locationId ?? session.context.locationId,
            departmentId: line.departmentId ?? null,
            costCenterId: line.costCenterId ?? null,
            projectId: line.projectId ?? null,
            supplierId: line.supplierId ?? null
            }))
          }
        }
      },
      include: { lines: true }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "finance_journal.created",
        entityType: "FinanceJournal",
        entityId: journal.id,
        afterData: {
          status: "DRAFT",
          publicReference,
          totalDebitAmountPhp: totals.debit,
          totalCreditAmountPhp: totals.credit
        },
        metadata: {
          lineCount: input.lines.length,
          sourceEventKey,
          noSourceMutation: true
        }
      }
    });

    return journal;
  });
}

export async function submitManualJournal(input: FinanceJournalActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeJournalSubmit);

  return prisma.$transaction(async (tx) => {
    const journal = await tx.financeJournal.findFirst({
      where: {
        id: input.journalId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT"
      },
      include: { lines: true }
    });
    if (!journal) {
      throw new Error("FINANCE_JOURNAL_NOT_OPEN_FOR_SUBMIT");
    }
    if (journal.createdByUserId !== session.user.id) {
      throw new Error("FINANCE_JOURNAL_SUBMITTER_MISMATCH");
    }
    assertBalancedJournal(
      journal.lines.map((line) => ({
        accountId: line.accountId,
        amountSide: line.amountSide,
        amountPhp: decimalToNumber(line.amountPhp),
        lineDescription: line.lineDescription
      }))
    );

    const submittedAt = new Date();
    const updated = await tx.financeJournal.update({
      where: { id: journal.id },
      data: {
        status: "SUBMITTED",
        submittedAt,
        submittedByUserId: session.user.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "finance_journal.submitted",
        entityType: "FinanceJournal",
        entityId: journal.id,
        beforeData: { status: journal.status },
        afterData: { status: "SUBMITTED", submittedAt },
        metadata: {
          remarks: input.remarks ?? null,
          noSourceMutation: true
        }
      }
    });
    return updated;
  });
}

export async function approveManualJournal(input: FinanceJournalActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeJournalApprove);

  return prisma.$transaction(async (tx) => {
    const journal = await tx.financeJournal.findFirst({
      where: {
        id: input.journalId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "SUBMITTED"
      },
      include: { lines: true }
    });
    if (!journal) {
      throw new Error("FINANCE_JOURNAL_NOT_SUBMITTED_FOR_APPROVAL");
    }
    if (journal.createdByUserId === session.user.id) {
      throw new Error("FINANCE_JOURNAL_SELF_APPROVAL_DENIED");
    }
    assertBalancedJournal(
      journal.lines.map((line) => ({
        accountId: line.accountId,
        amountSide: line.amountSide,
        amountPhp: decimalToNumber(line.amountPhp),
        lineDescription: line.lineDescription
      }))
    );

    const approvedAt = new Date();
    const updated = await tx.financeJournal.update({
      where: { id: journal.id },
      data: {
        status: "APPROVED",
        approvedAt,
        approvedByUserId: session.user.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "finance_journal.approved",
        entityType: "FinanceJournal",
        entityId: journal.id,
        beforeData: { status: journal.status },
        afterData: { status: "APPROVED", approvedAt },
        metadata: {
          remarks: input.remarks ?? null,
          noSelfApproval: true,
          noSourceMutation: true
        }
      }
    });
    return updated;
  });
}

export async function postApprovedManualJournal(input: FinanceJournalActionInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeJournalPost);
  const idempotencyKey = input.idempotencyKey?.trim() || `post:${input.journalId}`;

  const existingAttempt = await prisma.financeJournalPostingAttempt.findUnique({
    where: {
      companyId_idempotencyKey: {
        companyId: session.context.companyId,
        idempotencyKey
      }
    },
    include: { journal: true }
  });
  if (existingAttempt?.status === "SUCCEEDED" && existingAttempt.journal) {
    return existingAttempt.journal;
  }

  return prisma.$transaction(async (tx) => {
    const journal = await tx.financeJournal.findFirst({
      where: {
        id: input.journalId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "APPROVED"
      },
      include: {
        lines: true,
        accountingPeriod: true
      }
    });
    if (!journal) {
      throw new Error("FINANCE_JOURNAL_NOT_APPROVED_FOR_POSTING");
    }
    if (journal.accountingPeriod.status !== "OPEN") {
      throw new Error("ACCOUNTING_PERIOD_NOT_OPEN");
    }
    assertBalancedJournal(
      journal.lines.map((line) => ({
        accountId: line.accountId,
        amountSide: line.amountSide,
        amountPhp: decimalToNumber(line.amountPhp),
        lineDescription: line.lineDescription
      }))
    );

    const attempt = await tx.financeJournalPostingAttempt.upsert({
      where: {
        companyId_idempotencyKey: {
          companyId: session.context.companyId,
          idempotencyKey
        }
      },
      create: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        financeJournalId: journal.id,
        idempotencyKey,
        action: "POST",
        status: "IN_PROGRESS",
        requestedByUserId: session.user.id
      },
      update: {
        financeJournalId: journal.id,
        status: "IN_PROGRESS",
        requestedByUserId: session.user.id,
        failureCode: null,
        failureReason: null
      }
    });

    const postingDate = new Date();
    const posted = await tx.financeJournal.updateMany({
      where: {
        id: journal.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "APPROVED"
      },
      data: {
        status: "POSTED",
        postingDate,
        postedAt: postingDate,
        postedByUserId: session.user.id
      }
    });
    if (posted.count !== 1) {
      throw new Error("FINANCE_JOURNAL_POSTING_STATE_CONFLICT");
    }

    await tx.financeJournalPostingAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "SUCCEEDED",
        resultJournalId: journal.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "finance_journal.posted",
        entityType: "FinanceJournal",
        entityId: journal.id,
        beforeData: { status: "APPROVED" },
        afterData: { status: "POSTED", postedAt: postingDate },
        metadata: {
          idempotencyKey,
          postingAttemptId: attempt.id,
          immutableAfterPosting: true,
          noSourceMutation: true
        }
      }
    });

    return tx.financeJournal.findUniqueOrThrow({
      where: { id: journal.id },
      include: { lines: true }
    });
  });
}

export async function reversePostedFinanceJournal(input: FinanceJournalReverseInput) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeJournalReverse);
  const idempotencyKey = input.idempotencyKey?.trim() || `reverse:${input.journalId}`;

  const existingAttempt = await prisma.financeJournalPostingAttempt.findUnique({
    where: {
      companyId_idempotencyKey: {
        companyId: session.context.companyId,
        idempotencyKey
      }
    },
    include: { journal: true }
  });
  if (existingAttempt?.status === "SUCCEEDED" && existingAttempt.journal) {
    return existingAttempt.journal;
  }

  return prisma.$transaction(async (tx) => {
    const original = await tx.financeJournal.findFirst({
      where: {
        id: input.journalId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "POSTED"
      },
      include: {
        lines: { orderBy: { lineNumber: "asc" } },
        accountingPeriod: true
      }
    });
    if (!original) {
      throw new Error("FINANCE_JOURNAL_NOT_POSTED_FOR_REVERSAL");
    }
    if (original.accountingPeriod.status !== "OPEN") {
      throw new Error("ACCOUNTING_PERIOD_NOT_OPEN");
    }

    const attempt = await tx.financeJournalPostingAttempt.upsert({
      where: {
        companyId_idempotencyKey: {
          companyId: session.context.companyId,
          idempotencyKey
        }
      },
      create: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        financeJournalId: original.id,
        idempotencyKey,
        action: "REVERSE",
        status: "IN_PROGRESS",
        requestedByUserId: session.user.id
      },
      update: {
        financeJournalId: original.id,
        status: "IN_PROGRESS",
        requestedByUserId: session.user.id,
        failureCode: null,
        failureReason: null
      }
    });

    const publicReference = await nextFinanceJournalReference(session.context.companyId);
    const reversedAt = new Date();
    const reversalLines = original.lines.map((line) => ({
      accountId: line.accountId,
      amountSide: reverseSide(line.amountSide as "DEBIT" | "CREDIT"),
      amountPhp: decimalToNumber(line.amountPhp),
      lineDescription: `Reversal: ${line.lineDescription}`,
      brandId: line.brandId,
      locationId: line.locationId,
      departmentId: line.departmentId,
      costCenterId: line.costCenterId,
      projectId: line.projectId,
      supplierId: line.supplierId
    }));
    const totals = assertBalancedJournal(reversalLines);

    const reversal = await tx.financeJournal.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        publicReference,
        journalType: "REVERSAL",
        status: "POSTED",
        currencyCode: "PHP",
        accountingPeriodId: original.accountingPeriodId,
        journalDate: reversedAt,
        postingDate: reversedAt,
        description: `Reversal of ${original.publicReference}`,
        businessJustification: input.reversalReason.trim(),
        evidenceReference: original.evidenceReference,
        sourceDocumentType: "FINANCE_JOURNAL_REVERSAL",
        sourceDocumentId: original.id,
        sourceEventKey: `reversal:${original.id}`,
        postingConsequenceType: "MANUAL_JOURNAL_REVERSAL",
        brandId: original.brandId,
        locationId: original.locationId,
        departmentId: original.departmentId,
        costCenterId: original.costCenterId,
        projectId: original.projectId,
        createdByUserId: session.user.id,
        postedByUserId: session.user.id,
        reversedByUserId: session.user.id,
        postedAt: reversedAt,
        reversalOfJournalId: original.id,
        reversalReason: input.reversalReason.trim(),
        totalDebitAmountPhp: totals.debit,
        totalCreditAmountPhp: totals.credit,
        lines: {
          createMany: {
            data: reversalLines.map((line, index) => ({
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            lineNumber: index + 1,
            accountId: line.accountId,
            amountSide: line.amountSide,
            amountPhp: line.amountPhp,
            lineDescription: line.lineDescription,
            brandId: line.brandId,
            locationId: line.locationId,
            departmentId: line.departmentId,
            costCenterId: line.costCenterId,
            projectId: line.projectId,
            supplierId: line.supplierId,
            sourceLineType: "FinanceJournalLine"
            }))
          }
        }
      }
    });

    await tx.financeJournal.update({
      where: { id: original.id },
      data: {
        status: "REVERSED",
        reversedAt,
        reversedByUserId: session.user.id,
        reversalReason: input.reversalReason.trim()
      }
    });

    await tx.financeJournalPostingAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "SUCCEEDED",
        resultJournalId: reversal.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "finance_journal.reversed",
        entityType: "FinanceJournal",
        entityId: original.id,
        beforeData: { status: "POSTED" },
        afterData: {
          status: "REVERSED",
          reversalJournalId: reversal.id,
          reversedAt
        },
        metadata: {
          idempotencyKey,
          postingAttemptId: attempt.id,
          reversalReason: input.reversalReason,
          noSourceMutation: true
        }
      }
    });

    return reversal;
  });
}
