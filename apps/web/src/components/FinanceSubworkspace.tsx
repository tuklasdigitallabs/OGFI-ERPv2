import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  FileSearch,
  Landmark,
  LockKeyhole,
  ReceiptText,
  ShieldCheck
} from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  FinancePagination,
  getPaginationState
} from "@/components/FinancePagination";
import type { ShellActiveNav } from "@/components/ShellNavigation";
import {
  archiveControlledEvidenceAttachment,
  createControlledEvidenceAttachmentMetadataLink,
  createControlledEvidenceAttachmentUploadLink,
  listControlledEvidenceAttachments,
  type ControlledEvidenceAttachmentRow,
  type EvidenceAttachmentPurpose,
  type EvidenceAttachmentSourceType
} from "@/server/services/attachments";
import { permissions } from "@/server/services/authorization";
import type { SessionContext } from "@/server/services/context";
import { canExportFinance } from "@/server/services/exportAuthorization";
import {
  approveManualJournal,
  approvePaymentRequest,
  cancelPaymentRelease,
  cancelPaymentRequest,
  createApInvoiceDraft,
  createBranchCashDepositDeclaration,
  createManualJournalDraft,
  createPaymentRequestDraft,
  createPaymentReleaseDraft,
  createSupplierCreditNoteDraft,
  executePaymentRelease,
  evaluateApInvoiceMatch,
  handoffPaymentReleaseToReconciliation,
  holdPaymentRelease,
  markPaymentReleaseExecutionFailed,
  matchBranchCashDepositToBankReconciliation,
  matchPaymentReleaseToBankReconciliation,
  postApprovedManualJournal,
  recordPaymentReleaseReconciliationOutcome,
  rejectPaymentRequest,
  reversePostedFinanceJournal,
  requestPaymentReleaseReversal,
  resumePaymentReleaseFromHold,
  submitManualJournal,
  submitApInvoiceForMatch,
  submitSupplierCreditNoteForApplication,
  submitPaymentRequest,
  cancelApInvoice,
  cancelSupplierCreditNote
} from "@/server/services/finance";
import type { FinanceFoundationDashboard } from "@/server/services/finance";

type FinanceSubworkspaceKind = "ledger" | "payables" | "bank-cash" | "period-close";
type FinanceSubworkspaceTab = {
  id: string;
  label: string;
  description: string;
  count?: number;
};

const kindIcon = {
  ledger: Landmark,
  payables: ReceiptText,
  "bank-cash": BadgeCheck,
  "period-close": LockKeyhole
};

const kindStatus = {
  ledger: "Posting gated",
  payables: "Source-linked",
  "bank-cash": "Reconciliation gated",
  "period-close": "Close gated"
};

const financeSubworkspacePaths: Record<FinanceSubworkspaceKind, string> = {
  ledger: "/finance/general-ledger",
  payables: "/finance/accounts-payable",
  "bank-cash": "/finance/bank-cash",
  "period-close": "/finance/period-close"
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const matchTone = {
  READY_FOR_INVOICE: "success",
  PARTIAL_RECEIPT: "info",
  DISCREPANCY_REVIEW: "warning",
  AWAITING_RECEIPT: "neutral"
} as const;

function settlementReadinessTone(severity: string) {
  if (severity === "HIGH") {
    return "destructive" as const;
  }
  if (severity === "MEDIUM") {
    return "warning" as const;
  }
  return "info" as const;
}

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0
  }).format(value);
}

const paymentReleaseActionLabels = {
  execute: "Record Release",
  hold: "Hold",
  resume: "Resume",
  cancel: "Cancel",
  fail: "Record Failure",
  handoff_reconciliation: "Send to Reconciliation",
  match_bank: "Match Statement",
  reconcile: "Record Outcome",
  reverse: "Request Reversal"
} as const;

const paymentRequestActionLabels = {
  submit: "Submit",
  approve: "Approve",
  reject: "Reject",
  cancel: "Cancel"
} as const;

const apInvoiceActionLabels = {
  submit: "Submit for Match",
  match: "Evaluate Match",
  cancel: "Cancel"
} as const;

const supplierCreditActionLabels = {
  submit: "Submit for Application",
  cancel: "Cancel"
} as const;

const manualJournalActionLabels = {
  submit: "Submit",
  approve: "Approve",
  post: "Post",
  reverse: "Reverse"
} as const;

function allowedManualJournalActions(
  status: string,
  canSubmitJournal: boolean,
  canApproveJournal: boolean,
  canPostJournal: boolean,
  canReverseJournal: boolean
) {
  const actions: Array<keyof typeof manualJournalActionLabels> = [];
  if (status === "DRAFT" && canSubmitJournal) {
    actions.push("submit");
  }
  if (status === "SUBMITTED" && canApproveJournal) {
    actions.push("approve");
  }
  if (status === "APPROVED" && canPostJournal) {
    actions.push("post");
  }
  if (status === "POSTED" && canReverseJournal) {
    actions.push("reverse");
  }
  return actions;
}

function allowedApInvoiceActions(
  status: string,
  canSubmitApInvoice: boolean,
  canMatchApInvoice: boolean,
  canCancelApInvoice: boolean
) {
  const actions: Array<keyof typeof apInvoiceActionLabels> = [];
  if (status === "DRAFT" && canSubmitApInvoice) {
    actions.push("submit");
  }
  if (["MATCH_PENDING", "ON_HOLD", "DISPUTED"].includes(status) && canMatchApInvoice) {
    actions.push("match");
  }
  if (
    ["DRAFT", "SUBMITTED", "MATCH_PENDING", "ON_HOLD", "DISPUTED"].includes(status) &&
    canCancelApInvoice
  ) {
    actions.push("cancel");
  }
  return actions;
}

function allowedPaymentRequestActions(
  status: string,
  canCreatePaymentRequest: boolean,
  canApprovePaymentRequest: boolean
) {
  const actions: Array<keyof typeof paymentRequestActionLabels> = [];
  if (["DRAFT", "RETURNED_FOR_REVISION"].includes(status) && canCreatePaymentRequest) {
    actions.push("submit");
  }
  if (status === "AWAITING_APPROVAL" && canApprovePaymentRequest) {
    actions.push("approve", "reject");
  }
  if (
    ["DRAFT", "SUBMITTED", "AWAITING_APPROVAL", "RETURNED_FOR_REVISION"].includes(
      status
    ) &&
    canCreatePaymentRequest
  ) {
    actions.push("cancel");
  }
  return actions;
}

function allowedPaymentReleaseActions(
  status: string,
  canReleasePayment: boolean,
  canMatchReconciliation: boolean
) {
  const actions: Array<keyof typeof paymentReleaseActionLabels> = [];
  if (status === "READY_FOR_RELEASE" && canReleasePayment) {
    actions.push("execute", "hold", "cancel", "fail");
  }
  if (status === "ON_HOLD" && canReleasePayment) {
    actions.push("resume", "cancel");
  }
  if (status === "RELEASED" && canReleasePayment) {
    actions.push("hold", "handoff_reconciliation", "reverse");
  }
  if (status === "RECONCILIATION_PENDING") {
    if (canReleasePayment) {
      actions.push("hold", "reverse");
    }
    if (canMatchReconciliation) {
      actions.push("match_bank", "reconcile");
    }
  }
  if (status === "PARTIALLY_RECONCILED") {
    if (canMatchReconciliation) {
      actions.push("match_bank", "reconcile");
    }
    if (canReleasePayment) {
      actions.push("reverse");
    }
  }
  if (["FULLY_RECONCILED", "EXCEPTION"].includes(status) && canReleasePayment) {
    actions.push("reverse");
  }
  if (status === "EXCEPTION" && canReleasePayment) {
    actions.push("hold", "cancel");
  }
  return actions;
}

function optionalNumber(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function requiredNumber(formData: FormData, key: string, errorCode: string) {
  const value = optionalNumber(formData, key);
  if (value == null) {
    throw new Error(errorCode);
  }
  return value;
}

function cleanField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requiredField(formData: FormData, key: string, errorCode: string) {
  const value = cleanField(formData, key);
  if (!value) {
    throw new Error(errorCode);
  }
  return value;
}

async function createFinanceEvidenceLink(input: {
  formData: FormData;
  sourceType: EvidenceAttachmentSourceType;
  sourceRecordId: string;
  purpose: EvidenceAttachmentPurpose;
  requiredPermissionCode: string;
  defaultRequiredForAction: string;
}) {
  const evidenceFile = input.formData.get("evidenceFile");
  const common = {
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    purpose: input.purpose,
    caption: cleanField(input.formData, "caption") || null,
    requiredForAction:
      cleanField(input.formData, "requiredForAction") ||
      input.defaultRequiredForAction,
    requiredPermissionCode: input.requiredPermissionCode
  };

  if (evidenceFile instanceof File && evidenceFile.size > 0) {
    await createControlledEvidenceAttachmentUploadLink({
      ...common,
      file: evidenceFile
    });
    return;
  }

  await createControlledEvidenceAttachmentMetadataLink({
    ...common,
    attachment: {
      originalFilename: requiredField(
        input.formData,
        "originalFilename",
        "EVIDENCE_FILENAME_REQUIRED"
      ),
      mimeType: requiredField(
        input.formData,
        "mimeType",
        "EVIDENCE_MIME_TYPE_REQUIRED"
      ),
      sizeBytes: requiredNumber(
        input.formData,
        "sizeBytes",
        "EVIDENCE_SIZE_REQUIRED"
      ),
      storageProvider:
        cleanField(input.formData, "storageProvider") ||
        "manual-private-reference",
      objectKey: requiredField(
        input.formData,
        "objectKey",
        "EVIDENCE_OBJECT_KEY_REQUIRED"
      ),
      checksum: cleanField(input.formData, "checksum") || null
    }
  });
}

function optionalDate(formData: FormData, key: string) {
  const raw = cleanField(formData, key);
  if (!raw) {
    return undefined;
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("FINANCE_DATE_INVALID");
  }
  return date;
}

function requiredDate(formData: FormData, key: string, errorCode: string) {
  const date = optionalDate(formData, key);
  if (!date) {
    throw new Error(errorCode);
  }
  return date;
}

function paymentMethod(value: string) {
  const allowed = ["BANK_TRANSFER", "CHECK", "CASH", "MANUAL_REFERENCE"] as const;
  return allowed.find((method) => method === value) ?? "BANK_TRANSFER";
}

function reconciliationOutcome(value: string) {
  const allowed = ["FULLY_RECONCILED", "PARTIALLY_RECONCILED", "EXCEPTION"] as const;
  return allowed.find((outcome) => outcome === value) ?? "EXCEPTION";
}

function EvidenceMetadataPanel({
  action,
  archiveAction,
  attachments,
  canAdd,
  hiddenIdName,
  objectKeyPlaceholder,
  recordId,
  sourceType,
  triggerLabel
}: {
  action: (formData: FormData) => Promise<void>;
  archiveAction?: (formData: FormData) => Promise<void>;
  attachments: ControlledEvidenceAttachmentRow[];
  canAdd: boolean;
  hiddenIdName: string;
  objectKeyPlaceholder: string;
  recordId: string;
  sourceType:
    | "AP_INVOICE"
    | "SUPPLIER_CREDIT_NOTE"
    | "PAYMENT_REQUEST"
    | "BANK_RECONCILIATION";
  triggerLabel: string;
}) {
  return (
    <div className="mt-3 space-y-3">
      {attachments.length > 0 ? (
        <div className="grid gap-2">
          {attachments.slice(0, 3).map((attachment) => (
            <div
              key={attachment.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <p className="text-xs font-bold text-slate-950">
                {attachment.originalFilename}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {attachment.mimeType} /{" "}
                {(attachment.sizeBytes / 1024).toLocaleString("en-PH", {
                  maximumFractionDigits: 1
                })}{" "}
                KB
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                {attachment.caption ? (
                  <p className="text-[11px] text-slate-600">
                    {attachment.caption}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {attachment.storageProvider === "local-private" ? (
                    <a
                      className="inline-flex min-h-8 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                      href={`/evidence/${attachment.id}/download`}
                    >
                      Download
                    </a>
                  ) : null}
                  {archiveAction && canAdd ? (
                    <EntryModal
                      title="Archive Evidence Link"
                      triggerLabel="Archive"
                      triggerClassName="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      <form action={archiveAction} className="grid gap-4">
                        <input
                          name="controlledEvidenceAttachmentId"
                          type="hidden"
                          value={attachment.id}
                        />
                        <input name="sourceType" type="hidden" value={sourceType} />
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                          This archives the evidence link only. The private file
                          metadata remains preserved for audit and recovery; no
                          source record is changed.
                        </div>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Archive reason
                          <textarea
                            className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                            name="archiveReason"
                            placeholder="Duplicate link, wrong source record, superseded evidence, etc."
                            required
                          />
                        </label>
                        <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                          Archive Evidence Link
                        </button>
                      </form>
                    </EntryModal>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {attachments.length > 3 ? (
            <p className="text-xs font-semibold text-slate-500">
              +{attachments.length - 3} more evidence link
              {attachments.length - 3 === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ) : null}
      {canAdd ? (
        <EntryModal
          title="Add Evidence Metadata"
          triggerLabel={triggerLabel}
          triggerClassName="border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
        >
          <form action={action} encType="multipart/form-data" className="grid gap-4">
            <input name={hiddenIdName} type="hidden" value={recordId} />
            <input name="sourceType" type="hidden" value={sourceType} />
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
              Upload controlled evidence for this source record. Files stay
              private, source records are not mutated, and each download is
              audited.
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Evidence file
              <input
                accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.txt,.xlsx,.docx,application/pdf,image/jpeg,image/png,image/webp,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                name="evidenceFile"
                type="file"
              />
              <span className="text-xs font-normal text-slate-500">
                PDF, image, CSV, text, Excel, or Word file. Maximum 25 MB.
              </span>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Required for action
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="requiredForAction"
                  placeholder="Capture, match, approval, release"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Caption
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="caption"
                  placeholder="What this evidence supports"
                />
              </label>
            </div>
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <summary className="cursor-pointer font-bold text-slate-900">
                Link metadata-only evidence instead
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="originalFilename"
                  placeholder="payables-evidence.pdf"
                />
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="mimeType"
                >
                  <option value="">Select MIME type</option>
                  <option value="application/pdf">PDF</option>
                  <option value="image/jpeg">JPEG image</option>
                  <option value="image/png">PNG image</option>
                  <option value="image/webp">WebP image</option>
                  <option value="text/csv">CSV</option>
                  <option value="text/plain">Text</option>
                  <option value="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                    Excel workbook
                  </option>
                  <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                    Word document
                  </option>
                </select>
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  min="1"
                  name="sizeBytes"
                  placeholder="Size in bytes"
                  step="1"
                  type="number"
                />
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="storageProvider"
                  placeholder="manual-private-reference"
                />
              </div>
              <input
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                name="objectKey"
                placeholder={objectKeyPlaceholder}
              />
              <input
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                name="checksum"
                placeholder="Optional checksum"
              />
            </details>
            <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Upload Evidence
            </button>
          </form>
        </EntryModal>
      ) : null}
    </div>
  );
}

async function runManualJournalDraftAction(formData: FormData) {
  "use server";

  const accountingPeriodId = requiredField(
    formData,
    "accountingPeriodId",
    "FINANCE_JOURNAL_PERIOD_REQUIRED"
  );
  const journalDate = requiredDate(
    formData,
    "journalDate",
    "FINANCE_JOURNAL_DATE_REQUIRED"
  );
  const description = requiredField(
    formData,
    "description",
    "FINANCE_JOURNAL_DESCRIPTION_REQUIRED"
  );
  const businessJustification = requiredField(
    formData,
    "businessJustification",
    "FINANCE_JOURNAL_BUSINESS_JUSTIFICATION_REQUIRED"
  );
  const debitAccountId = requiredField(
    formData,
    "debitAccountId",
    "FINANCE_JOURNAL_DEBIT_ACCOUNT_REQUIRED"
  );
  const creditAccountId = requiredField(
    formData,
    "creditAccountId",
    "FINANCE_JOURNAL_CREDIT_ACCOUNT_REQUIRED"
  );
  const amountPhp = requiredNumber(
    formData,
    "amountPhp",
    "FINANCE_JOURNAL_AMOUNT_REQUIRED"
  );
  const debitLineDescription =
    cleanField(formData, "debitLineDescription") || description;
  const creditLineDescription =
    cleanField(formData, "creditLineDescription") || description;
  const evidenceReference = cleanField(formData, "evidenceReference");

  await createManualJournalDraft({
    accountingPeriodId,
    journalDate,
    description,
    businessJustification,
    ...(evidenceReference ? { evidenceReference } : {}),
    sourceEventKey: `manual-journal-draft-ui:${accountingPeriodId}:${journalDate.toISOString()}:${debitAccountId}:${creditAccountId}:${amountPhp}:${description}`,
    lines: [
      {
        accountId: debitAccountId,
        amountSide: "DEBIT",
        amountPhp,
        lineDescription: debitLineDescription
      },
      {
        accountId: creditAccountId,
        amountSide: "CREDIT",
        amountPhp,
        lineDescription: creditLineDescription
      }
    ]
  });

  revalidatePath("/finance/general-ledger");
}

async function runManualJournalAction(formData: FormData) {
  "use server";

  const journalId = requiredField(
    formData,
    "journalId",
    "FINANCE_JOURNAL_ID_REQUIRED"
  );
  const action = requiredField(
    formData,
    "action",
    "FINANCE_JOURNAL_ACTION_REQUIRED"
  );
  const remarks = cleanField(formData, "remarks");
  const reversalReason = cleanField(formData, "reversalReason");
  const baseInput = {
    journalId,
    ...(remarks ? { remarks } : {})
  };

  switch (action) {
    case "submit":
      await submitManualJournal(baseInput);
      break;
    case "approve":
      await approveManualJournal(baseInput);
      break;
    case "post":
      await postApprovedManualJournal({
        ...baseInput,
        idempotencyKey: `manual-journal-post-ui:${journalId}`
      });
      break;
    case "reverse":
      await reversePostedFinanceJournal({
        journalId,
        reversalReason: reversalReason || "Manual journal reversal requested from ledger workspace.",
        idempotencyKey: `manual-journal-reverse-ui:${journalId}:${reversalReason || "default"}`
      });
      break;
    default:
      throw new Error("FINANCE_JOURNAL_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/general-ledger");
}

async function runApInvoiceDraftAction(formData: FormData) {
  "use server";

  const supplierId = requiredField(
    formData,
    "supplierId",
    "AP_INVOICE_SUPPLIER_REQUIRED"
  );
  const supplierInvoiceNumber = requiredField(
    formData,
    "supplierInvoiceNumber",
    "AP_INVOICE_NUMBER_REQUIRED"
  );
  const invoiceDate = requiredDate(
    formData,
    "invoiceDate",
    "AP_INVOICE_DATE_REQUIRED"
  );
  const dueDate = optionalDate(formData, "dueDate");
  const purchaseOrderId = cleanField(formData, "purchaseOrderId");
  const nonPoReason = cleanField(formData, "nonPoReason");
  const freightAmount = optionalNumber(formData, "freightAmount");
  const evidenceReference = cleanField(formData, "evidenceReference");
  const lines = Array.from({ length: 10 }, (_, index) => {
    const lineNumber = index + 1;
    const description = cleanField(formData, `lineDescription-${lineNumber}`);
    const quantity = optionalNumber(formData, `lineQty-${lineNumber}`);
    const unitPrice = optionalNumber(formData, `lineUnitPrice-${lineNumber}`);
    const taxAmount = optionalNumber(formData, `lineTaxAmount-${lineNumber}`);
    const discountAmount = optionalNumber(
      formData,
      `lineDiscountAmount-${lineNumber}`
    );
    const hasAnyValue =
      Boolean(description) ||
      quantity != null ||
      unitPrice != null ||
      taxAmount != null ||
      discountAmount != null;
    if (!hasAnyValue) {
      return null;
    }
    if (!description || quantity == null || unitPrice == null) {
      throw new Error("AP_INVOICE_LINE_INCOMPLETE");
    }
    return {
      description,
      invoicedQty: quantity,
      unitPrice,
      ...(taxAmount != null ? { taxAmount } : {}),
      ...(discountAmount != null ? { discountAmount } : {})
    };
  }).filter((line): line is NonNullable<typeof line> => line != null);

  if (lines.length === 0) {
    throw new Error("AP_INVOICE_LINES_REQUIRED");
  }

  await createApInvoiceDraft({
    supplierId,
    supplierInvoiceNumber,
    invoiceDate,
    ...(dueDate ? { dueDate } : {}),
    ...(purchaseOrderId ? { purchaseOrderId } : {}),
    ...(!purchaseOrderId
      ? { nonPoReason: nonPoReason || "Non-PO supplier invoice captured from finance workspace" }
      : nonPoReason
        ? { nonPoReason }
        : {}),
    ...(evidenceReference ? { evidenceReference } : {}),
    ...(freightAmount != null ? { freightAmount } : {}),
    captureIdempotencyKey: `ap-invoice-draft-ui:${supplierId}:${supplierInvoiceNumber}:${invoiceDate.toISOString()}:${lines.length}:${lines.map((line) => `${line.description}:${line.invoicedQty}:${line.unitPrice}`).join("|")}`,
    lines
  });

  revalidatePath("/finance/accounts-payable");
}

async function runApInvoiceAction(formData: FormData) {
  "use server";

  const apInvoiceId = requiredField(
    formData,
    "apInvoiceId",
    "AP_INVOICE_ID_REQUIRED"
  );
  const action = requiredField(formData, "action", "AP_INVOICE_ACTION_REQUIRED");
  const remarks = cleanField(formData, "remarks");
  const reason = cleanField(formData, "reason");
  const baseInput = {
    apInvoiceId,
    ...(remarks ? { remarks } : {})
  };

  switch (action) {
    case "submit":
      await submitApInvoiceForMatch(baseInput);
      break;
    case "match":
      await evaluateApInvoiceMatch(baseInput);
      break;
    case "cancel":
      await cancelApInvoice({ ...baseInput, reason });
      break;
    default:
      throw new Error("AP_INVOICE_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/accounts-payable");
}

async function runSupplierCreditDraftAction(formData: FormData) {
  "use server";

  const originalApInvoiceId = requiredField(
    formData,
    "originalApInvoiceId",
    "SUPPLIER_CREDIT_NOTE_ORIGINAL_INVOICE_REQUIRED"
  );
  const supplierCreditNoteNumber = requiredField(
    formData,
    "supplierCreditNoteNumber",
    "SUPPLIER_CREDIT_NOTE_NUMBER_REQUIRED"
  );
  const creditDate = requiredDate(
    formData,
    "creditDate",
    "SUPPLIER_CREDIT_NOTE_DATE_REQUIRED"
  );
  const creditAmount = requiredNumber(
    formData,
    "creditAmount",
    "SUPPLIER_CREDIT_NOTE_AMOUNT_REQUIRED"
  );
  const reasonCode = requiredField(
    formData,
    "reasonCode",
    "SUPPLIER_CREDIT_NOTE_REASON_CODE_REQUIRED"
  );
  const reasonDescription = requiredField(
    formData,
    "reasonDescription",
    "SUPPLIER_CREDIT_NOTE_REASON_DESCRIPTION_REQUIRED"
  );
  const evidenceReference = cleanField(formData, "evidenceReference");
  const applicationNotes = cleanField(formData, "applicationNotes");

  await createSupplierCreditNoteDraft({
    originalApInvoiceId,
    supplierCreditNoteNumber,
    creditDate,
    creditAmount,
    reasonCode,
    reasonDescription,
    ...(evidenceReference ? { evidenceReference } : {}),
    ...(applicationNotes ? { applicationNotes } : {}),
    idempotencyKey: `supplier-credit-note-ui:${originalApInvoiceId}:${supplierCreditNoteNumber}:${creditDate.toISOString()}:${creditAmount}`
  });

  revalidatePath("/finance/accounts-payable");
}

async function runSupplierCreditAction(formData: FormData) {
  "use server";

  const supplierCreditNoteId = requiredField(
    formData,
    "supplierCreditNoteId",
    "SUPPLIER_CREDIT_NOTE_ID_REQUIRED"
  );
  const action = requiredField(
    formData,
    "action",
    "SUPPLIER_CREDIT_NOTE_ACTION_REQUIRED"
  );
  const reason = cleanField(formData, "reason");
  const remarks = cleanField(formData, "remarks");

  switch (action) {
    case "submit":
      await submitSupplierCreditNoteForApplication({
        supplierCreditNoteId,
        ...(remarks ? { remarks } : {})
      });
      break;
    case "cancel":
      await cancelSupplierCreditNote({ supplierCreditNoteId, reason });
      break;
    default:
      throw new Error("SUPPLIER_CREDIT_NOTE_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/accounts-payable");
}

async function runPaymentRequestDraftAction(formData: FormData) {
  "use server";

  const requestReason = requiredField(
    formData,
    "requestReason",
    "PAYMENT_REQUEST_REASON_REQUIRED"
  );
  const evidenceReference = cleanField(formData, "evidenceReference");
  const lines = Array.from({ length: 10 }, (_, index) => {
    const lineNumber = index + 1;
    const apInvoiceId = cleanField(formData, `paymentLineApInvoiceId-${lineNumber}`);
    const requestedAmount = optionalNumber(
      formData,
      `paymentLineRequestedAmount-${lineNumber}`
    );
    const notes = cleanField(formData, `paymentLineNotes-${lineNumber}`);
    const hasAnyValue = Boolean(apInvoiceId) || requestedAmount != null || Boolean(notes);
    if (!hasAnyValue) {
      return null;
    }
    if (!apInvoiceId) {
      throw new Error("PAYMENT_REQUEST_LINE_INVOICE_REQUIRED");
    }
    return {
      apInvoiceId,
      ...(requestedAmount != null ? { requestedAmount } : {}),
      ...(notes ? { notes } : {})
    };
  }).filter((line): line is NonNullable<typeof line> => line != null);

  if (lines.length === 0) {
    throw new Error("PAYMENT_REQUEST_LINES_REQUIRED");
  }

  await createPaymentRequestDraft({
    requestReason,
    ...(evidenceReference ? { evidenceReference } : {}),
    lines,
    idempotencyKey: `payment-request-draft-ui:${requestReason}:${lines.length}:${lines
      .map((line) => `${line.apInvoiceId}:${line.requestedAmount ?? "outstanding"}`)
      .join("|")}`
  });

  revalidatePath("/finance/accounts-payable");
}

async function runPaymentRequestAction(formData: FormData) {
  "use server";

  const paymentRequestId = requiredField(
    formData,
    "paymentRequestId",
    "PAYMENT_REQUEST_ID_REQUIRED"
  );
  const action = requiredField(
    formData,
    "action",
    "PAYMENT_REQUEST_ACTION_REQUIRED"
  );
  const reason = cleanField(formData, "reason");
  const remarks = cleanField(formData, "remarks");
  const baseInput = {
    paymentRequestId,
    ...(remarks ? { remarks } : {})
  };

  switch (action) {
    case "submit":
      await submitPaymentRequest(baseInput);
      break;
    case "approve":
      await approvePaymentRequest(baseInput);
      break;
    case "reject":
      await rejectPaymentRequest({ ...baseInput, reason });
      break;
    case "cancel":
      await cancelPaymentRequest({ ...baseInput, reason });
      break;
    default:
      throw new Error("PAYMENT_REQUEST_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/accounts-payable");
}

async function runBranchCashDepositDeclarationAction(formData: FormData) {
  "use server";

  const bankAccountId = requiredField(
    formData,
    "bankAccountId",
    "BRANCH_CASH_DEPOSIT_BANK_ACCOUNT_REQUIRED"
  );
  const depositDate = requiredDate(
    formData,
    "depositDate",
    "BRANCH_CASH_DEPOSIT_DATE_REQUIRED"
  );
  const amountPhp = requiredNumber(
    formData,
    "amountPhp",
    "BRANCH_CASH_DEPOSIT_AMOUNT_REQUIRED"
  );
  const depositSlipNumber = cleanField(formData, "depositSlipNumber");
  const evidenceReference = cleanField(formData, "evidenceReference");
  const notes = cleanField(formData, "notes");

  await createBranchCashDepositDeclaration({
    bankAccountId,
    depositDate,
    amountPhp,
    ...(depositSlipNumber ? { depositSlipNumber } : {}),
    ...(evidenceReference ? { evidenceReference } : {}),
    ...(notes ? { notes } : {}),
    sourceEventKey: `branch-cash-deposit-ui:${bankAccountId}:${depositDate.toISOString()}:${amountPhp}:${depositSlipNumber || "no-slip"}`
  });

  revalidatePath("/finance/bank-cash");
}

async function addBranchCashDepositEvidenceMetadata(formData: FormData) {
  "use server";

  await createFinanceEvidenceLink({
    formData,
    sourceType: "BRANCH_CASH_DEPOSIT",
    sourceRecordId: requiredField(
      formData,
      "branchCashDepositId",
      "BRANCH_CASH_DEPOSIT_ID_REQUIRED"
    ),
    purpose: "EVIDENCE",
    requiredPermissionCode: permissions.financeCashDepositCreate,
    defaultRequiredForAction: "DEPOSIT_REVIEW"
  });

  revalidatePath("/finance/bank-cash");
}

async function addBankReconciliationEvidenceMetadata(formData: FormData) {
  "use server";

  await createFinanceEvidenceLink({
    formData,
    sourceType: "BANK_RECONCILIATION",
    sourceRecordId: requiredField(
      formData,
      "bankReconciliationId",
      "BANK_RECONCILIATION_ID_REQUIRED"
    ),
    purpose: "RECONCILIATION_SUPPORT",
    requiredPermissionCode: permissions.financeReconciliationMatch,
    defaultRequiredForAction: "RECONCILIATION_REVIEW"
  });

  revalidatePath("/finance/bank-cash");
}

async function archiveSharedEvidenceMetadata(formData: FormData) {
  "use server";

  const sourceType = cleanField(formData, "sourceType");
  const permission = (() => {
    if (sourceType === "AP_INVOICE") {
      return permissions.financeApInvoiceCreate;
    }
    if (sourceType === "SUPPLIER_CREDIT_NOTE") {
      return permissions.financeSupplierCreditCreate;
    }
    if (sourceType === "PAYMENT_REQUEST") {
      return permissions.financePaymentRequestCreate;
    }
    if (sourceType === "PAYMENT_RELEASE") {
      return permissions.financePaymentRelease;
    }
    if (sourceType === "BRANCH_CASH_DEPOSIT") {
      return permissions.financeCashDepositCreate;
    }
    if (sourceType === "BANK_RECONCILIATION") {
      return permissions.financeReconciliationMatch;
    }
    throw new Error("CONTROLLED_EVIDENCE_ARCHIVE_SOURCE_INVALID");
  })();

  await archiveControlledEvidenceAttachment({
    controlledEvidenceAttachmentId: requiredField(
      formData,
      "controlledEvidenceAttachmentId",
      "CONTROLLED_EVIDENCE_ATTACHMENT_ID_REQUIRED"
    ),
    archiveReason: requiredField(
      formData,
      "archiveReason",
      "CONTROLLED_EVIDENCE_ARCHIVE_REASON_REQUIRED"
    ),
    requiredPermissionCode: permission
  });

  revalidatePath(
    sourceType === "BANK_RECONCILIATION" ||
      sourceType === "BRANCH_CASH_DEPOSIT"
      ? "/finance/bank-cash"
      : "/finance/accounts-payable"
  );
}

async function runPaymentReleaseDraftAction(formData: FormData) {
  "use server";

  const paymentRequestId = String(formData.get("paymentRequestId") ?? "");
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const method = paymentMethod(String(formData.get("method") ?? ""));
  const releaseAmount = optionalNumber(formData, "releaseAmount");

  await createPaymentReleaseDraft({
    paymentRequestId,
    bankAccountId,
    method,
    reason,
    ...(releaseAmount ? { releaseAmount } : {}),
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: `payment-release-draft-ui:${paymentRequestId}:${bankAccountId}:${method}:${releaseAmount ?? "full"}`
  });

  revalidatePath("/finance/accounts-payable");
}

async function runPaymentReleaseAction(formData: FormData) {
  "use server";

  const paymentReleaseId = String(formData.get("paymentReleaseId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const remarks = String(formData.get("remarks") ?? "").trim() || undefined;
  const releaseReference =
    String(formData.get("releaseReference") ?? "").trim() || undefined;
  const failureCode = String(formData.get("failureCode") ?? "").trim() || undefined;
  const bankReference = String(formData.get("bankReference") ?? "").trim() || undefined;
  const reconciliationId =
    String(formData.get("reconciliationId") ?? "").trim() || undefined;
  const statementLineId =
    String(formData.get("statementLineId") ?? "").trim() || undefined;
  const outcome = reconciliationOutcome(String(formData.get("outcome") ?? ""));
  const matchedAmount = optionalNumber(formData, "matchedAmount");
  const baseInput = {
    paymentReleaseId,
    idempotencyKey: `payment-release-ui:${paymentReleaseId}:${action}:${releaseReference ?? bankReference ?? failureCode ?? reconciliationId ?? "none"}:${statementLineId ?? "none"}:${reason ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {}),
    ...(remarks ? { remarks } : {})
  };

  switch (action) {
    case "execute":
      await executePaymentRelease({
        ...baseInput,
        releaseReference: releaseReference ?? "",
        evidenceReference: evidenceReference ?? "",
        idempotencyKey: baseInput.idempotencyKey
      });
      break;
    case "hold":
      await holdPaymentRelease(baseInput);
      break;
    case "resume":
      await resumePaymentReleaseFromHold(baseInput);
      break;
    case "cancel":
      await cancelPaymentRelease(baseInput);
      break;
    case "fail":
      await markPaymentReleaseExecutionFailed({
        ...baseInput,
        failureCode: failureCode ?? ""
      });
      break;
    case "handoff_reconciliation":
      await handoffPaymentReleaseToReconciliation(baseInput);
      break;
    case "match_bank":
      await matchPaymentReleaseToBankReconciliation({
        ...baseInput,
        reconciliationId: reconciliationId ?? "",
        statementLineId: statementLineId ?? "",
        ...(matchedAmount != null ? { matchedAmount } : {})
      });
      break;
    case "reconcile":
      await recordPaymentReleaseReconciliationOutcome({
        ...baseInput,
        outcome,
        ...(matchedAmount != null ? { matchedAmount } : {}),
        ...(bankReference ? { bankReference } : {})
      });
      break;
    case "reverse":
      await requestPaymentReleaseReversal(baseInput);
      break;
    default:
      throw new Error("PAYMENT_RELEASE_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/accounts-payable");
}

async function runBranchCashDepositMatchAction(formData: FormData) {
  "use server";

  const branchCashDepositId = String(formData.get("branchCashDepositId") ?? "");
  const reconciliationId = String(formData.get("reconciliationId") ?? "");
  const statementLineId = String(formData.get("statementLineId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const matchedAmount = optionalNumber(formData, "matchedAmount");

  await matchBranchCashDepositToBankReconciliation({
    branchCashDepositId,
    reconciliationId,
    statementLineId,
    idempotencyKey: `branch-deposit-match-ui:${branchCashDepositId}:${reconciliationId}:${statementLineId}:${matchedAmount ?? "remaining"}:${reason ?? "none"}`,
    ...(matchedAmount != null ? { matchedAmount } : {}),
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  });

  revalidatePath("/finance/bank-cash");
}

async function addPaymentReleaseEvidenceMetadata(formData: FormData) {
  "use server";

  await createFinanceEvidenceLink({
    formData,
    sourceType: "PAYMENT_RELEASE",
    sourceRecordId: requiredField(
      formData,
      "paymentReleaseId",
      "PAYMENT_RELEASE_ID_REQUIRED"
    ),
    purpose: "PAYMENT_PROOF",
    requiredPermissionCode: permissions.financePaymentRelease,
    defaultRequiredForAction: "RELEASE"
  });

  revalidatePath("/finance/accounts-payable");
}

async function addPayablesEvidenceMetadata(formData: FormData) {
  "use server";

  const sourceType = cleanField(formData, "sourceType");
  const config = (() => {
    if (sourceType === "AP_INVOICE") {
      return {
        field: "apInvoiceId",
        errorCode: "AP_INVOICE_ID_REQUIRED",
        permission: permissions.financeApInvoiceCreate,
        defaultRequiredForAction: "INVOICE_CAPTURE"
      };
    }
    if (sourceType === "SUPPLIER_CREDIT_NOTE") {
      return {
        field: "supplierCreditNoteId",
        errorCode: "SUPPLIER_CREDIT_NOTE_ID_REQUIRED",
        permission: permissions.financeSupplierCreditCreate,
        defaultRequiredForAction: "CREDIT_REVIEW"
      };
    }
    if (sourceType === "PAYMENT_REQUEST") {
      return {
        field: "paymentRequestId",
        errorCode: "PAYMENT_REQUEST_ID_REQUIRED",
        permission: permissions.financePaymentRequestCreate,
        defaultRequiredForAction: "PAYMENT_APPROVAL"
      };
    }
    throw new Error("PAYABLES_EVIDENCE_SOURCE_INVALID");
  })();

  await createFinanceEvidenceLink({
    formData,
    sourceType,
    sourceRecordId: requiredField(formData, config.field, config.errorCode),
    purpose: "EVIDENCE",
    requiredPermissionCode: config.permission,
    defaultRequiredForAction: config.defaultRequiredForAction
  });

  revalidatePath("/finance/accounts-payable");
}

export async function FinanceSubworkspace({
  session,
  dashboard,
  activeNav,
  kind,
  title,
  subtitle,
  narrative,
  activeTab,
  activePage
}: {
  session: SessionContext;
  dashboard: FinanceFoundationDashboard;
  activeNav: ShellActiveNav;
  kind: FinanceSubworkspaceKind;
  title: string;
  subtitle: string;
  narrative: string;
  activeTab?: string | undefined;
  activePage?: string | number | undefined;
}) {
  const Icon = kindIcon[kind];
  const sourceRows =
    kind === "payables"
      ? dashboard.sourceChain
      : dashboard.sourceChain.slice(0, 5);
  const journalRows = dashboard.recentJournals;
  const apInvoiceRows = dashboard.apInvoices;
  const supplierCreditRows = dashboard.supplierCreditNotes;
  const paymentRequestRows = dashboard.paymentRequests;
  const paymentReleaseRows = dashboard.paymentReleases;
  const apInvoiceEvidencePairs =
    kind === "payables"
      ? await Promise.all(
          apInvoiceRows.map(async (row) => [
            row.id,
            await listControlledEvidenceAttachments({
              sourceType: "AP_INVOICE",
              sourceRecordId: row.id,
              requiredPermissionCode: permissions.financePayablesView
            })
          ] as const)
        )
      : [];
  const apInvoiceEvidenceById = new Map(apInvoiceEvidencePairs);
  const supplierCreditEvidencePairs =
    kind === "payables"
      ? await Promise.all(
          supplierCreditRows.map(async (row) => [
            row.id,
            await listControlledEvidenceAttachments({
              sourceType: "SUPPLIER_CREDIT_NOTE",
              sourceRecordId: row.id,
              requiredPermissionCode: permissions.financePayablesView
            })
          ] as const)
        )
      : [];
  const supplierCreditEvidenceById = new Map(supplierCreditEvidencePairs);
  const paymentRequestEvidencePairs =
    kind === "payables"
      ? await Promise.all(
          paymentRequestRows.map(async (row) => [
            row.id,
            await listControlledEvidenceAttachments({
              sourceType: "PAYMENT_REQUEST",
              sourceRecordId: row.id,
              requiredPermissionCode: permissions.financePayablesView
            })
          ] as const)
        )
      : [];
  const paymentRequestEvidenceById = new Map(paymentRequestEvidencePairs);
  const paymentReleaseEvidencePairs =
    kind === "payables"
      ? await Promise.all(
          paymentReleaseRows.map(async (row) => [
            row.id,
            await listControlledEvidenceAttachments({
              sourceType: "PAYMENT_RELEASE",
              sourceRecordId: row.id,
              requiredPermissionCode: permissions.financePayablesView
            })
          ] as const)
        )
      : [];
  const paymentReleaseEvidenceById = new Map(paymentReleaseEvidencePairs);
  const paymentReleaseReportRows = dashboard.paymentReleaseReportRows;
  const paymentReleaseSettlementReadinessRows =
    dashboard.paymentReleaseSettlementReadinessRows;
  const payablesReportRows = dashboard.payablesReportRows;
  const bankCashRows = dashboard.bankCash;
  const branchDepositEvidencePairs =
    kind === "bank-cash"
      ? await Promise.all(
          bankCashRows.deposits.map(async (row) => [
            row.id,
            await listControlledEvidenceAttachments({
              sourceType: "BRANCH_CASH_DEPOSIT",
              sourceRecordId: row.id,
              requiredPermissionCode: permissions.financeReconciliationView
            })
          ] as const)
        )
      : [];
  const branchDepositEvidenceById = new Map(branchDepositEvidencePairs);
  const bankReconciliationEvidencePairs =
    kind === "bank-cash"
      ? await Promise.all(
          bankCashRows.reconciliations.map(async (row) => [
            row.id,
            await listControlledEvidenceAttachments({
              sourceType: "BANK_RECONCILIATION",
              sourceRecordId: row.id,
              requiredPermissionCode: permissions.financeReconciliationView
            })
          ] as const)
        )
      : [];
  const bankReconciliationEvidenceById = new Map(
    bankReconciliationEvidencePairs
  );
  const bankCashReportRows = dashboard.bankCashReportRows;
  const bankCashExceptionRows = dashboard.bankCashExceptionRows;
  const releaseBankAccounts = bankCashRows.accounts.filter(
    (account) => account.status === "ACTIVE"
  );
  const canDeclareBranchDeposit =
    kind === "bank-cash" &&
    dashboard.permissions.canCreateCashDeposit &&
    releaseBankAccounts.length > 0;
  const canCreateManualJournal =
    kind === "ledger" &&
    dashboard.permissions.canCreateJournal &&
    dashboard.configuration.openPeriods.length > 0 &&
    dashboard.draftOptions.journalAccounts.length >= 2;
  const canCaptureApInvoice =
    kind === "payables" &&
    dashboard.permissions.canCreateApInvoice &&
    dashboard.draftOptions.suppliers.length > 0;
  const creditEligibleInvoices = apInvoiceRows.filter(
    (invoice) => !["CANCELLED", "REVERSED"].includes(invoice.status)
  );
  const canCreateSupplierCredit =
    kind === "payables" &&
    dashboard.permissions.canCreateSupplierCredit &&
    creditEligibleInvoices.length > 0;
  const paymentReadyInvoices = apInvoiceRows.filter((invoice) => invoice.paymentReady);
  const canCreatePaymentRequest =
    kind === "payables" &&
    dashboard.permissions.canCreatePaymentRequest &&
    paymentReadyInvoices.length > 0;
  const canExportFinanceCsv = canExportFinance(session);
  const tabs: FinanceSubworkspaceTab[] =
    kind === "ledger"
      ? [
          {
            id: "queue",
            label: "Journal queue",
            description: "Review, approve, post, and reverse journal records.",
            count: journalRows.length
          },
          {
            id: "drafts",
            label: "Draft entry",
            description: "Create controlled manual journal drafts."
          },
          {
            id: "controls",
            label: "Controls",
            description: "Guardrails, evidence, and release gates."
          }
        ]
      : kind === "payables"
        ? [
            {
              id: "invoices",
              label: "Invoices",
              description: "Capture and match supplier AP invoices.",
              count: apInvoiceRows.length
            },
            {
              id: "payments",
              label: "Payments",
              description: "Prepare payment requests and release drafts.",
              count: paymentRequestRows.length
            },
            {
              id: "credits",
              label: "Credits",
              description: "Record supplier credit notes for later application.",
              count: supplierCreditRows.length
            },
            {
              id: "reports",
              label: "Reports",
              description: "Aging, settlement, and release readiness previews.",
              count: payablesReportRows.length + paymentReleaseReportRows.length
            },
            {
              id: "controls",
              label: "Controls",
              description: "Guardrails, evidence, and release gates."
            }
          ]
        : [
            {
              id: "workbench",
              label: "Workbench",
              description: "Deposit, bank account, statement, and reconciliation work.",
              count: bankCashRows.deposits.length + bankCashRows.statementLines.length
            },
            {
              id: "exceptions",
              label: "Exceptions",
              description: "Readiness issues and reconciliation follow-up.",
              count: bankCashExceptionRows.length
            },
            {
              id: "reports",
              label: "Reports",
              description: "Bank and cash export readiness preview.",
              count: bankCashReportRows.length
            },
            {
              id: "controls",
              label: "Controls",
              description: "Guardrails, evidence, and release gates."
            }
          ];
  const activeTabId = tabs.some((tab) => tab.id === activeTab)
    ? String(activeTab)
    : tabs[0]?.id ?? "workbench";
  const tabBasePath = financeSubworkspacePaths[kind];
  const paginate = <T,>(rows: T[]) => {
    const pagination = getPaginationState(rows.length, activePage);
    return {
      pagination,
      rows: rows.slice(pagination.startIndex, pagination.endIndex)
    };
  };
  const pagedSupplierCredits = paginate(supplierCreditRows);
  const pagedJournals = paginate(journalRows);
  const pagedApInvoices = paginate(apInvoiceRows);
  const pagedPaymentRequests = paginate(paymentRequestRows);
  const pagedPaymentReleases = paginate(paymentReleaseRows);
  const pagedSettlementReadiness = paginate(
    paymentReleaseSettlementReadinessRows
  );
  const pagedPayablesReports = paginate(payablesReportRows);
  const pagedPaymentReleaseReports = paginate(paymentReleaseReportRows);
  const pagedBankAccounts = paginate(bankCashRows.accounts);
  const pagedBankDeposits = paginate(bankCashRows.deposits);
  const pagedBankStatementLines = paginate(bankCashRows.statementLines);
  const pagedBankReconciliations = paginate(bankCashRows.reconciliations);
  const pagedBankCashExceptions = paginate(bankCashExceptionRows);
  const pagedBankCashReports = paginate(bankCashReportRows);
  const showMainQueue =
    (kind === "ledger" && activeTabId === "queue") ||
    (kind === "payables" && activeTabId === "invoices") ||
    (kind !== "ledger" && kind !== "payables" && activeTabId === "sources");

  return (
    <AppShell
      session={session}
      title={title}
      subtitle={subtitle}
      activeNav={activeNav}
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>{title} is guarded.</strong> {narrative}
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              This view does not approve payments, post journals, lock periods, or
              mutate procurement, receiving, inventory, bank, or cash source records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {kind === "bank-cash" && canExportFinanceCsv ? (
              <ButtonLink href="/finance/bank-cash/export" tone="secondary">
                Export Bank & Cash CSV
              </ButtonLink>
            ) : null}
            {canExportFinanceCsv ? (
              <ButtonLink href="/finance/export" tone="secondary">
                Export Finance CSV
              </ButtonLink>
            ) : null}
            <span>{kindStatus[kind]}</span>
          </div>
        </div>
      </div>

      <nav
        aria-label={`${title} workspace sections`}
        className="mb-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
      >
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => {
            const selected = tab.id === activeTabId;
            return (
              <Link
                key={tab.id}
                aria-current={selected ? "page" : undefined}
                className={cx(
                  "flex min-w-44 flex-col rounded-xl px-4 py-3 text-left transition",
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-50"
                )}
                href={`${tabBasePath}?tab=${tab.id}`}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-bold">
                  {tab.label}
                  {tab.count != null ? (
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        selected
                          ? "bg-white/20 text-white"
                          : "bg-blue-50 text-blue-700"
                      )}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cx(
                    "mt-1 text-xs leading-5",
                    selected
                      ? "text-blue-50"
                      : "text-slate-500"
                  )}
                >
                  {tab.description}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mb-5 grid gap-4 lg:grid-cols-[24rem_1fr]">
        <Panel
          className={cx(
            "ogfi-detail-card",
            activeTabId === "controls" ? "" : "hidden"
          )}
        >
          <div className="flex items-start gap-3">
            <span className="ogfi-icon-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-bold text-slate-950">Phase 3 Guarded State</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                The finance spine is active for read-side control and source-chain
                visibility. Mutating accounting workflows stay gated until their
                tests and UAT evidence are complete.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {dashboard.guardrails.map((guardrail) => (
              <div
                key={guardrail.label}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-950">{guardrail.label}</p>
                  <Badge tone={guardrail.tone} size="sm">
                    Required
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {guardrail.detail}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        {kind === "ledger" &&
        activeTabId === "drafts" &&
        dashboard.permissions.canCreateJournal ? (
          <section className="ogfi-data-surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Create Draft Manual Journal
                </h2>
                <p className="text-sm text-slate-500">
                  Create a balanced two-line PHP draft. Submit, approval, posting,
                  reversal, and source-record effects stay separate.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={canCreateManualJournal ? "info" : "warning"}>
                  Draft only
                </Badge>
                <EntryModal
                  title="Create Draft Manual Journal"
                  triggerLabel="Create Draft Manual Journal"
                  disabled={!canCreateManualJournal}
                >

            <form action={runManualJournalDraftAction} className="grid gap-4 pt-5">
              {!canCreateManualJournal ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Manual journal drafts need an open accounting period and at
                  least two active posting accounts.
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Accounting period
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="accountingPeriodId"
                    defaultValue={dashboard.configuration.openPeriods[0]?.id ?? ""}
                    required
                  >
                    {dashboard.configuration.openPeriods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.code} / {period.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Journal date
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="journalDate"
                    type="date"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Amount
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    min="0.01"
                    name="amountPhp"
                    placeholder="10000"
                    step="0.01"
                    type="number"
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Debit account
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="debitAccountId"
                    defaultValue={dashboard.draftOptions.journalAccounts[0]?.id ?? ""}
                    required
                  >
                    {dashboard.draftOptions.journalAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Credit account
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="creditAccountId"
                    defaultValue={dashboard.draftOptions.journalAccounts[1]?.id ?? ""}
                    required
                  >
                    {dashboard.draftOptions.journalAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Description
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="description"
                    placeholder="Manual reclassification draft"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Evidence reference
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="evidenceReference"
                    placeholder="Working paper, approval memo, or source packet"
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Business justification
                  </span>
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="businessJustification"
                    placeholder="Why this journal draft is needed"
                    required
                  />
                </label>
                <div className="grid gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Debit line note
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="debitLineDescription"
                      placeholder="Defaults to journal description"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Credit line note
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="creditLineDescription"
                      placeholder="Defaults to journal description"
                    />
                  </label>
                </div>
              </div>

              <button
                className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!canCreateManualJournal}
                type="submit"
              >
                Create Draft Manual Journal
              </button>
            </form>
                </EntryModal>
              </div>
            </div>
            <FinancePagination
              basePath={tabBasePath}
              tab={activeTabId}
              page={pagedSupplierCredits.pagination.page}
              totalPages={pagedSupplierCredits.pagination.totalPages}
              totalCount={supplierCreditRows.length}
              startIndex={pagedSupplierCredits.pagination.startIndex}
              endIndex={pagedSupplierCredits.pagination.endIndex}
            />
          </section>
        ) : null}

        {kind === "payables" &&
        activeTabId === "invoices" &&
        dashboard.permissions.canCreateApInvoice ? (
          <section className="ogfi-data-surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Capture Draft AP Invoice
                </h2>
                <p className="text-sm text-slate-500">
                  Create one supplier invoice draft with multiple lines for AP
                  review. Matching, payment request, release, bank, and journal
                  actions stay separate.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={canCaptureApInvoice ? "info" : "warning"}>
                  Draft only
                </Badge>
                <EntryModal
                  title="Capture Draft AP Invoice"
                  triggerLabel="Capture Draft AP Invoice"
                  disabled={!canCaptureApInvoice}
                >

            <form action={runApInvoiceDraftAction} className="grid gap-4 pt-5">
              {!canCaptureApInvoice ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  AP capture needs at least one active supplier in this company
                  scope and the AP invoice create permission.
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Supplier
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="supplierId"
                    defaultValue={dashboard.draftOptions.suppliers[0]?.id ?? ""}
                    required
                  >
                    {dashboard.draftOptions.suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Supplier invoice no.
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="supplierInvoiceNumber"
                    placeholder="SI-2026-000123"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Source PO
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="purchaseOrderId"
                    defaultValue=""
                  >
                    <option value="">No PO source</option>
                    {dashboard.draftOptions.purchaseOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-4">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Invoice date
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="invoiceDate"
                    type="date"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Due date
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="dueDate"
                    type="date"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Freight
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    min="0"
                    name="freightAmount"
                    placeholder="Optional"
                    step="0.01"
                    type="number"
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Invoice lines
                      </p>
                      <p className="text-xs text-slate-500">
                        Enter up to 10 lines here. Use description, quantity, and
                        unit price for each populated row.
                      </p>
                    </div>
                    <Badge tone="info" size="sm">
                      Multi-line
                    </Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[48rem] text-left text-sm">
                      <thead className="text-xs uppercase text-slate-500">
                        <tr>
                          <th className="w-10 px-2 py-2">#</th>
                          <th className="px-2 py-2">Description</th>
                          <th className="w-24 px-2 py-2">Qty</th>
                          <th className="w-28 px-2 py-2">Unit price</th>
                          <th className="w-24 px-2 py-2">Tax</th>
                          <th className="w-24 px-2 py-2">Discount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 10 }, (_, index) => {
                          const lineNumber = index + 1;
                          return (
                            <tr key={`ap-invoice-line-${lineNumber}`}>
                              <td className="px-2 py-1 text-xs font-semibold text-slate-500">
                                {lineNumber}
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name={`lineDescription-${lineNumber}`}
                                  placeholder={
                                    lineNumber === 1
                                      ? "Supplier invoice goods or service line"
                                      : "Optional"
                                  }
                                  required={lineNumber === 1}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  min="0.01"
                                  name={`lineQty-${lineNumber}`}
                                  placeholder="1"
                                  required={lineNumber === 1}
                                  step="0.001"
                                  type="number"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  min="0"
                                  name={`lineUnitPrice-${lineNumber}`}
                                  placeholder="0.00"
                                  required={lineNumber === 1}
                                  step="0.01"
                                  type="number"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  min="0"
                                  name={`lineTaxAmount-${lineNumber}`}
                                  placeholder="0.00"
                                  step="0.01"
                                  type="number"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  min="0"
                                  name={`lineDiscountAmount-${lineNumber}`}
                                  placeholder="0.00"
                                  step="0.01"
                                  type="number"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Evidence reference
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="evidenceReference"
                    placeholder="Scanned invoice, voucher, or email"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Non-PO reason
                </span>
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="nonPoReason"
                  placeholder="Required when no source PO is selected"
                />
              </label>

              <button
                className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!canCaptureApInvoice}
                type="submit"
              >
                Create Draft AP Invoice
              </button>
            </form>
                </EntryModal>
              </div>
            </div>
          </section>
        ) : null}

        {kind === "payables" && activeTabId === "credits" ? (
          <section className="ogfi-data-surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Supplier Credit Notes
                </h2>
                <p className="text-sm text-slate-500">
                  Record supplier credits against an original AP invoice. Credits
                  stay pending application and do not reduce invoices, settle AP,
                  release cash, or post journals.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={canCreateSupplierCredit ? "info" : "warning"}>
                  Pending application
                </Badge>
                <EntryModal
                  title="Record Supplier Credit"
                  triggerLabel="Record Supplier Credit"
                  disabled={!canCreateSupplierCredit}
                >
                  <form action={runSupplierCreditDraftAction} className="grid gap-4 pt-5">
                    {!canCreateSupplierCredit ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        Supplier credit capture needs the credit-create
                        permission and at least one scoped AP invoice.
                      </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Original AP invoice
                        </span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="originalApInvoiceId"
                          defaultValue={creditEligibleInvoices[0]?.id ?? ""}
                          required
                        >
                          {creditEligibleInvoices.map((invoice) => (
                            <option key={invoice.id} value={invoice.id}>
                              {invoice.publicReference} / {invoice.supplierName} /{" "}
                              {formatMoney(invoice.totalAmount, invoice.currencyCode)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Supplier credit no.
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="supplierCreditNoteNumber"
                          placeholder="CN-2026-000123"
                          required
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Credit date
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="creditDate"
                          type="date"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Credit amount
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          min="0.01"
                          name="creditAmount"
                          placeholder="0.00"
                          step="0.01"
                          type="number"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Reason code
                        </span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="reasonCode"
                          defaultValue="SUPPLIER_RETURN_CREDIT"
                          required
                        >
                          <option value="SUPPLIER_RETURN_CREDIT">
                            Supplier return credit
                          </option>
                          <option value="PRICE_ADJUSTMENT_CREDIT">
                            Price adjustment credit
                          </option>
                          <option value="DAMAGED_REJECTED_GOODS_CREDIT">
                            Damaged/rejected goods credit
                          </option>
                          <option value="BILLING_ERROR_CREDIT">
                            Billing error credit
                          </option>
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Reason description
                        </span>
                        <textarea
                          className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="reasonDescription"
                          placeholder="Describe the credit basis and source evidence."
                          required
                        />
                      </label>
                      <div className="grid gap-4">
                        <label className="block">
                          <span className="text-xs font-semibold uppercase text-slate-500">
                            Evidence reference
                          </span>
                          <input
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            name="evidenceReference"
                            placeholder="Credit memo scan, return note, or supplier email"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-semibold uppercase text-slate-500">
                            Application notes
                          </span>
                          <input
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            name="applicationNotes"
                            placeholder="Optional AP follow-up note"
                          />
                        </label>
                      </div>
                    </div>

                    <button
                      className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!canCreateSupplierCredit}
                      type="submit"
                    >
                      Record Supplier Credit
                    </button>
                  </form>
                </EntryModal>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {supplierCreditRows.length === 0 ? (
                <div className="p-6">
                  <p className="font-semibold text-slate-950">
                    No supplier credits recorded yet
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Supplier credit notes appear here after finance records a
                    credit memo against a scoped AP invoice.
                  </p>
                </div>
              ) : (
                pagedSupplierCredits.rows.map((row) => {
                  const canSubmit =
                    dashboard.permissions.canSubmitSupplierCredit &&
                    row.status === "DRAFT";
                  const canCancel =
                    dashboard.permissions.canCancelSupplierCredit &&
                    ["DRAFT", "PENDING_APPLICATION"].includes(row.status);
                  return (
                    <div
                      key={row.id}
                      className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_20rem] xl:items-start"
                    >
                      <div className="grid gap-4 md:grid-cols-[1fr_9rem_10rem_auto] md:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-slate-950">
                              {row.publicReference}
                            </p>
                            <Badge
                              tone={row.status === "CANCELLED" ? "warning" : "info"}
                              size="sm"
                            >
                              {row.status.replaceAll("_", " ")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {row.supplierName} / Credit {row.supplierCreditNoteNumber}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Original invoice {row.originalInvoiceReference} / {row.reasonCode}
                          </p>
                        </div>
                        <p className="font-semibold text-slate-900">
                          {formatMoney(row.creditAmount, row.currencyCode)}
                        </p>
                        <p className="text-sm font-semibold text-slate-700">
                          {new Date(row.creditDate).toLocaleDateString("en-PH")}
                        </p>
                        <Badge tone={row.evidenceReference ? "success" : "warning"}>
                          {row.evidenceReference ? "Evidence" : "Needs evidence"}
                        </Badge>
                      </div>
                      <EvidenceMetadataPanel
                        action={addPayablesEvidenceMetadata}
                        archiveAction={archiveSharedEvidenceMetadata}
                        attachments={supplierCreditEvidenceById.get(row.id) ?? []}
                        canAdd={dashboard.permissions.canCreateSupplierCredit}
                        hiddenIdName="supplierCreditNoteId"
                        objectKeyPlaceholder="finance/evidence/supplier-credit/credit-note.pdf"
                        recordId={row.id}
                        sourceType="SUPPLIER_CREDIT_NOTE"
                        triggerLabel="Add Evidence"
                      />

                      {canSubmit || canCancel ? (
                        <div className="flex justify-end">
                          <EntryModal
                            title={`Manage ${row.publicReference}`}
                            triggerLabel="Manage Actions"
                            triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            <form action={runSupplierCreditAction} className="grid gap-4 pt-5">
                              <input
                                name="supplierCreditNoteId"
                                type="hidden"
                                value={row.id}
                              />
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="font-bold text-slate-950">
                                  {row.supplierName}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {row.publicReference} /{" "}
                                  {formatMoney(row.creditAmount, row.currencyCode)}
                                </p>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                {canSubmit ? (
                                  <label className="block">
                                    <span className="text-xs font-semibold uppercase text-slate-500">
                                      Application note
                                    </span>
                                    <input
                                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                      name="remarks"
                                      placeholder="Optional review note"
                                    />
                                  </label>
                                ) : null}
                                {canCancel ? (
                                  <label className="block">
                                    <span className="text-xs font-semibold uppercase text-slate-500">
                                      Cancellation reason
                                    </span>
                                    <input
                                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                      name="reason"
                                      placeholder="Required to cancel"
                                    />
                                  </label>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                                {canSubmit ? (
                                  <button
                                    className="rounded-lg border border-blue-200 bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                                    name="action"
                                    type="submit"
                                    value="submit"
                                  >
                                    {supplierCreditActionLabels.submit}
                                  </button>
                                ) : null}
                                {canCancel ? (
                                  <button
                                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                    name="action"
                                    type="submit"
                                    value="cancel"
                                  >
                                    {supplierCreditActionLabels.cancel}
                                  </button>
                                ) : null}
                              </div>
                            </form>
                          </EntryModal>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        <section
          className={cx(
            kind === "payables" || kind === "ledger"
              ? "ogfi-data-surface overflow-hidden lg:col-span-2"
              : "ogfi-data-surface overflow-hidden",
            showMainQueue ? "" : "hidden"
          )}
        >
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {kind === "ledger"
                  ? "Journal Work Queue"
                  : kind === "payables"
                    ? "AP Invoice Match Queue"
                    : "Source-Linked Work Queue"}
              </h2>
              <p className="text-sm text-slate-500">
                {kind === "ledger"
                  ? "Manual journals, reversals, and posting-state records in the selected company."
                  : kind === "payables"
                    ? "Captured supplier invoices with three-way match status and exceptions."
                    : "Authoritative operational records that will feed this finance workflow."}
              </p>
            </div>
            <Badge tone="info">
              {kind === "ledger"
                ? journalRows.length
                : kind === "payables"
                  ? apInvoiceRows.length
                  : sourceRows.length} record
              {(kind === "ledger"
                ? journalRows.length
                : kind === "payables"
                  ? apInvoiceRows.length
                  : sourceRows.length) === 1
                ? ""
                : "s"}
            </Badge>
          </div>

          <div className="divide-y divide-slate-100">
            {kind === "ledger" ? (
              journalRows.length === 0 ? (
                <div className="p-6">
                  <p className="font-semibold text-slate-950">
                    No finance journals in this scope yet
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Balanced manual journal drafts, posted journals, and reversal
                    journals will appear here after authorized finance users create them.
                  </p>
                </div>
              ) : (
                pagedJournals.rows.map((row) => {
                  const journalActions = allowedManualJournalActions(
                    row.status,
                    dashboard.permissions.canSubmitJournal,
                    dashboard.permissions.canApproveJournal,
                    dashboard.permissions.canPostJournal,
                    dashboard.permissions.canReverseJournal
                  );
                  return (
                    <div
                      key={row.id}
                      className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_24rem] xl:items-start"
                    >
                      <div className="grid gap-4 md:grid-cols-[1fr_9rem_11rem_11rem] md:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-slate-950">
                              {row.publicReference}
                            </p>
                            <Badge
                              tone={
                                row.status === "POSTED"
                                  ? "success"
                                  : row.status === "REVERSED"
                                    ? "warning"
                                    : "info"
                              }
                              size="sm"
                            >
                              {row.status.replaceAll("_", " ")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {row.description}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Type
                          </p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {row.journalType}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Debit / Credit
                          </p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {formatMoney(row.totalDebitAmountPhp, "PHP")} /{" "}
                            {formatMoney(row.totalCreditAmountPhp, "PHP")}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Lines
                          </p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {row.lineCount}
                          </p>
                        </div>
                      </div>

                      {journalActions.length > 0 ? (
                        <div className="flex justify-end">
                          <EntryModal
                            title={`Manage ${row.publicReference}`}
                            triggerLabel="Manage Actions"
                            triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            <form action={runManualJournalAction} className="grid gap-4 pt-5">
                              <input name="journalId" type="hidden" value={row.id} />
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="font-bold text-slate-950">
                                  {row.publicReference}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {row.description}
                                </p>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase text-slate-500">
                                    Remarks
                                  </span>
                                  <input
                                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    name="remarks"
                                    placeholder="Submit, approval, or posting note"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase text-slate-500">
                                    Reversal reason
                                  </span>
                                  <input
                                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    name="reversalReason"
                                    placeholder="Required when reversing a posted journal"
                                  />
                                </label>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                                {journalActions.map((action) => (
                                  <button
                                    key={action}
                                    className={
                                      action === "reverse"
                                        ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                        : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                                    }
                                    name="action"
                                    type="submit"
                                    value={action}
                                  >
                                    {manualJournalActionLabels[action]}
                                  </button>
                                ))}
                              </div>
                            </form>
                          </EntryModal>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )
            ) : kind === "payables" && apInvoiceRows.length > 0 ? (
              pagedApInvoices.rows.map((row) => {
                const apInvoiceActions = allowedApInvoiceActions(
                  row.status,
                  dashboard.permissions.canSubmitApInvoice,
                  dashboard.permissions.canMatchApInvoice,
                  dashboard.permissions.canCancelApInvoice
                );
                return (
                  <div
                    key={row.id}
                    className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_24rem] xl:items-start"
                  >
                    <div className="grid gap-4 md:grid-cols-[1fr_9rem_11rem_9rem_auto] md:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-950">
                            {row.publicReference}
                          </p>
                          <Badge
                            tone={
                              row.status === "ON_HOLD" ||
                              row.matchStatus === "VARIANCE_HOLD"
                                ? "warning"
                                : row.status === "MATCHED" ||
                                    row.status === "MATCHED_WITHIN_TOLERANCE" ||
                                    row.matchStatus === "EXACT_MATCH" ||
                                    row.matchStatus === "WITHIN_TOLERANCE"
                                  ? "success"
                                  : "info"
                            }
                            size="sm"
                          >
                            {row.matchStatus.replaceAll("_", " ")}
                          </Badge>
                          {row.duplicateRisk !== "CLEAN" ? (
                            <Badge tone="warning" size="sm">
                              Duplicate {row.duplicateRisk.toLowerCase()}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {row.supplierName} / Invoice {row.supplierInvoiceNumber}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Payment prep: {row.paymentPreparationStatus.replaceAll("_", " ")}
                          {row.paymentOutstandingAmount > 0
                            ? ` / ${formatMoney(row.paymentOutstandingAmount, row.currencyCode)} outstanding`
                            : ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Total
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatMoney(row.totalAmount, row.currencyCode)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Invoice date
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {new Date(row.invoiceDate).toLocaleDateString("en-PH")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Lines / Holds
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {row.lineCount} / {row.exceptionCount}
                        </p>
                      </div>
                      <Badge
                        tone={
                          row.status === "ON_HOLD"
                            ? "warning"
                            : row.status === "MATCHED" ||
                                row.status === "MATCHED_WITHIN_TOLERANCE" ||
                                row.status === "APPROVED_EXCEPTION"
                              ? "success"
                              : "info"
                        }
                      >
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <EvidenceMetadataPanel
                      action={addPayablesEvidenceMetadata}
                      archiveAction={archiveSharedEvidenceMetadata}
                      attachments={apInvoiceEvidenceById.get(row.id) ?? []}
                      canAdd={dashboard.permissions.canCreateApInvoice}
                      hiddenIdName="apInvoiceId"
                      objectKeyPlaceholder="finance/evidence/ap-invoice/invoice-support.pdf"
                      recordId={row.id}
                      sourceType="AP_INVOICE"
                      triggerLabel="Add Evidence"
                    />

                    {apInvoiceActions.length > 0 ? (
                      <div className="flex justify-end">
                        <EntryModal
                          title={`Manage ${row.publicReference}`}
                          triggerLabel="Manage Actions"
                          triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <form action={runApInvoiceAction} className="grid gap-4 pt-5">
                            <input name="apInvoiceId" type="hidden" value={row.id} />
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="font-bold text-slate-950">
                                {row.supplierName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Invoice {row.supplierInvoiceNumber} /{" "}
                                {formatMoney(row.totalAmount, row.currencyCode)}
                              </p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Remarks
                                </span>
                                <input
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="remarks"
                                  placeholder="Submission or match review note"
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Cancellation reason
                                </span>
                                <input
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="reason"
                                  placeholder="Required only when cancelling"
                                />
                              </label>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                              {apInvoiceActions.map((action) => (
                                <button
                                  key={action}
                                  className={
                                    action === "cancel"
                                      ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                      : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                                  }
                                  name="action"
                                  type="submit"
                                  value={action}
                                >
                                  {apInvoiceActionLabels[action]}
                                </button>
                              ))}
                            </div>
                          </form>
                        </EntryModal>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : sourceRows.length === 0 ? (
              <div className="p-6">
                <p className="font-semibold text-slate-950">
                  No source records in this scope yet
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Purchase orders and receiving records appear here only after
                  the relevant source workflow has created the authoritative record.
                </p>
              </div>
            ) : (
              sourceRows.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_11rem_12rem_auto] md:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950">
                        {row.purchaseOrderReference}
                      </p>
                      <Badge tone={matchTone[row.matchStatus]} size="sm">
                        {row.matchStatus.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {row.supplierName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      PO total
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatMoney(row.totalAmount, row.currencyCode)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Received basis
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatMoney(row.receivedAmount, row.currencyCode)}
                    </p>
                  </div>
                  <ButtonLink
                    href={row.sourceHref}
                    tone="secondary"
                    className="min-h-9 border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
                  >
                    Open Source
                  </ButtonLink>
                </div>
              ))
            )}
          </div>
          {kind === "ledger" ? (
            <FinancePagination
              basePath={tabBasePath}
              tab={activeTabId}
              page={pagedJournals.pagination.page}
              totalPages={pagedJournals.pagination.totalPages}
              totalCount={journalRows.length}
              startIndex={pagedJournals.pagination.startIndex}
              endIndex={pagedJournals.pagination.endIndex}
            />
          ) : kind === "payables" ? (
            <FinancePagination
              basePath={tabBasePath}
              tab={activeTabId}
              page={pagedApInvoices.pagination.page}
              totalPages={pagedApInvoices.pagination.totalPages}
              totalCount={apInvoiceRows.length}
              startIndex={pagedApInvoices.pagination.startIndex}
              endIndex={pagedApInvoices.pagination.endIndex}
            />
          ) : null}
        </section>
      </div>

      {kind === "payables" && activeTabId === "payments" ? (
        <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Payment Request Preparation
              </h2>
              <p className="text-sm text-slate-500">
                Approved payment requests can be prepared into manual release
                control records. Bank API, AP settlement, and journal posting
                stay outside this workflow.
              </p>
            </div>
            <Badge tone={dashboard.permissions.canReleasePayment ? "success" : "warning"}>
              {dashboard.permissions.canReleasePayment ? "Release enabled" : "Release gated"}
            </Badge>
          </div>
          <div className="border-b border-slate-100 bg-blue-50 px-5 py-3 text-xs text-blue-900">
            <p className="font-semibold">Payment release settlement policy</p>
            <p className="mt-1">
              Execution mode:{" "}
              {dashboard.paymentReleaseSettlementPolicy.policy.releaseExecutionMode.replaceAll(
                "_",
                " "
              )}
              . AP settlement:{" "}
              {dashboard.paymentReleaseSettlementPolicy.policy
                .apSettlementMutationAllowed
                ? "Allowed"
                : "Blocked"}
              . Bank API mutation:{" "}
              {dashboard.paymentReleaseSettlementPolicy.policy.bankApiMutationAllowed
                ? "Allowed"
                : "Blocked"}
              . Journal posting:{" "}
              {dashboard.paymentReleaseSettlementPolicy.policy.journalPostingAllowed
                ? "Allowed"
                : "Blocked"}
              .
            </p>
            <p className="mt-1 text-blue-700">
              {dashboard.paymentReleaseSettlementPolicy.policy.decisionBasis}
            </p>
          </div>
          {dashboard.permissions.canCreatePaymentRequest ? (
            <div className="border-b border-slate-100 p-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">
                      Create Draft Payment Request
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Prepare a draft request from one or more matched AP invoices
                      for the same supplier. Approval, release, bank, AP settlement,
                      and journal actions remain separate.
                    </p>
                  </div>
                  <EntryModal
                    title="Create Draft Payment Request"
                    triggerLabel="Create Draft Payment Request"
                    disabled={!canCreatePaymentRequest}
                  >
                <form action={runPaymentRequestDraftAction} className="grid gap-3 pt-5">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Payment request lines
                        </p>
                        <p className="text-xs text-slate-500">
                          Enter up to 10 AP invoices. Amount can be blank to use
                          each invoice's outstanding value.
                        </p>
                      </div>
                      <Badge tone="info" size="sm">
                        Multi-invoice
                      </Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-[48rem] text-left text-sm">
                        <thead className="text-xs uppercase text-slate-500">
                          <tr>
                            <th className="w-10 px-2 py-2">#</th>
                            <th className="px-2 py-2">Eligible AP invoice</th>
                            <th className="w-32 px-2 py-2">Amount</th>
                            <th className="w-56 px-2 py-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 10 }, (_, index) => {
                            const lineNumber = index + 1;
                            return (
                              <tr key={`payment-request-line-${lineNumber}`}>
                                <td className="px-2 py-1 text-xs font-semibold text-slate-500">
                                  {lineNumber}
                                </td>
                                <td className="px-2 py-1">
                                  <select
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    disabled={!canCreatePaymentRequest}
                                    name={`paymentLineApInvoiceId-${lineNumber}`}
                                    required={lineNumber === 1}
                                    defaultValue={
                                      lineNumber === 1
                                        ? paymentReadyInvoices[0]?.id ?? ""
                                        : ""
                                    }
                                  >
                                    <option value="">
                                      {lineNumber === 1
                                        ? "Select AP invoice"
                                        : "Optional"}
                                    </option>
                                    {paymentReadyInvoices.map((invoice) => (
                                      <option key={invoice.id} value={invoice.id}>
                                        {invoice.publicReference} / {invoice.supplierName} /{" "}
                                        {formatMoney(
                                          invoice.paymentOutstandingAmount,
                                          invoice.currencyCode
                                        )}{" "}
                                        outstanding
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2 py-1">
                                  <input
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    min="0"
                                    name={`paymentLineRequestedAmount-${lineNumber}`}
                                    placeholder="Outstanding"
                                    step="0.01"
                                    type="number"
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <input
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    name={`paymentLineNotes-${lineNumber}`}
                                    placeholder="Optional"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Evidence reference
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="evidenceReference"
                        placeholder="Voucher, approval packet, or payment memo"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Request reason
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="requestReason"
                      placeholder="Why these AP invoices are ready for payment preparation"
                      required
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!canCreatePaymentRequest}
                      type="submit"
                    >
                      Create Draft Payment Request
                    </button>
                    {!canCreatePaymentRequest ? (
                      <Badge tone="warning" size="sm">
                        No eligible invoice
                      </Badge>
                    ) : null}
                  </div>
                </form>
                  </EntryModal>
                </div>
              </div>
            </div>
          ) : null}
          <div className="divide-y divide-slate-100">
            {paymentRequestRows.length === 0 ? (
              <div className="p-6">
                <p className="font-semibold text-slate-950">
                  No payment requests prepared yet
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Requests appear here after an eligible AP invoice is matched or exception-approved and finance prepares it for approval.
                </p>
              </div>
            ) : (
              pagedPaymentRequests.rows.map((row) => {
                const paymentRequestActions = allowedPaymentRequestActions(
                  row.status,
                  dashboard.permissions.canCreatePaymentRequest,
                  dashboard.permissions.canApprovePaymentRequest
                );
                return (
                  <div
                    key={row.id}
                    className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_28rem] xl:items-start"
                  >
                    <div className="grid gap-4 md:grid-cols-[1fr_10rem_8rem_auto] md:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-950">
                            {row.publicReference}
                          </p>
                          <Badge
                            tone={row.status === "APPROVED" ? "success" : "info"}
                            size="sm"
                          >
                            {row.status.replaceAll("_", " ")}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {row.supplierName} / Prepared by {row.requestedBy}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Amount
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatMoney(row.totalRequestedAmount, row.currencyCode)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Lines
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {row.lineCount}
                        </p>
                      </div>
                      <Badge tone={row.status === "APPROVED" ? "success" : "warning"}>
                        {row.status === "APPROVED" ? "Release ready" : "No release"}
                      </Badge>
                    </div>
                    <EvidenceMetadataPanel
                      action={addPayablesEvidenceMetadata}
                      archiveAction={archiveSharedEvidenceMetadata}
                      attachments={paymentRequestEvidenceById.get(row.id) ?? []}
                      canAdd={dashboard.permissions.canCreatePaymentRequest}
                      hiddenIdName="paymentRequestId"
                      objectKeyPlaceholder="finance/evidence/payment-request/approval-support.pdf"
                      recordId={row.id}
                      sourceType="PAYMENT_REQUEST"
                      triggerLabel="Add Evidence"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      {paymentRequestActions.length > 0 ? (
                        <EntryModal
                          title={`Manage ${row.publicReference}`}
                          triggerLabel="Manage Actions"
                          triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <form action={runPaymentRequestAction} className="grid gap-4 pt-5">
                            <input
                              name="paymentRequestId"
                              type="hidden"
                              value={row.id}
                            />
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="font-bold text-slate-950">
                                {row.supplierName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {row.publicReference} /{" "}
                                {formatMoney(row.totalRequestedAmount, row.currencyCode)}
                              </p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Remarks
                                </span>
                                <input
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="remarks"
                                  placeholder="Submit or approval note"
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Reason
                                </span>
                                <input
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="reason"
                                  placeholder="Required for reject or cancel"
                                />
                              </label>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                              {paymentRequestActions.map((action) => (
                                <button
                                  key={action}
                                  className={
                                    action === "reject" || action === "cancel"
                                      ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                      : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                                  }
                                  name="action"
                                  type="submit"
                                  value={action}
                                >
                                  {paymentRequestActionLabels[action]}
                                </button>
                              ))}
                            </div>
                          </form>
                        </EntryModal>
                      ) : null}

                      {row.status === "APPROVED" && dashboard.permissions.canReleasePayment ? (
                        <EntryModal
                          title={`Create release for ${row.publicReference}`}
                          triggerLabel="Create Release Draft"
                          triggerClassName="border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          disabled={releaseBankAccounts.length === 0}
                        >
                          <form action={runPaymentReleaseDraftAction} className="grid gap-4 pt-5">
                            <input
                              name="paymentRequestId"
                              type="hidden"
                              value={row.id}
                            />
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="font-bold text-slate-950">
                                {row.supplierName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Approved request {row.publicReference} /{" "}
                                {formatMoney(row.totalRequestedAmount, row.currencyCode)}
                              </p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Bank account
                                </span>
                                <select
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="bankAccountId"
                                  defaultValue={releaseBankAccounts[0]?.id ?? ""}
                                  required
                                >
                                  {releaseBankAccounts.length === 0 ? (
                                    <option value="">No active bank account</option>
                                  ) : null}
                                  {releaseBankAccounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                      {account.bankName} / {account.maskedAccountNumber} /{" "}
                                      {account.scopeLabel}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Release method
                                </span>
                                <select
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="method"
                                >
                                  <option value="BANK_TRANSFER">Bank transfer</option>
                                  <option value="CHECK">Check</option>
                                  <option value="CASH">Cash</option>
                                  <option value="MANUAL_REFERENCE">Manual reference</option>
                                </select>
                              </label>
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Release amount
                                </span>
                                <input
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  min="0"
                                  name="releaseAmount"
                                  placeholder="Defaults to full amount"
                                  step="0.01"
                                  type="number"
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Reason
                                </span>
                                <input
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="reason"
                                  placeholder="Treasury release reason"
                                />
                              </label>
                              <label className="block md:col-span-2">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Evidence reference
                                </span>
                                <input
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="evidenceReference"
                                  placeholder="Voucher, approval package, or instruction memo"
                                />
                              </label>
                            </div>
                            <div className="flex justify-end border-t border-slate-100 pt-4">
                              <button
                                className="rounded-lg border border-blue-200 bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                                type="submit"
                              >
                                Create Release Draft
                              </button>
                            </div>
                          </form>
                        </EntryModal>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <FinancePagination
            basePath={tabBasePath}
            tab={activeTabId}
            page={pagedPaymentRequests.pagination.page}
            totalPages={pagedPaymentRequests.pagination.totalPages}
            totalCount={paymentRequestRows.length}
            startIndex={pagedPaymentRequests.pagination.startIndex}
            endIndex={pagedPaymentRequests.pagination.endIndex}
          />
          <div className="border-t border-slate-100">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Payment Settlement Readiness
                </h2>
                <p className="text-sm text-slate-500">
                  Actionable blockers before a release can be treated as
                  production-settled. This queue does not settle AP, mutate bank
                  balances, or post journals.
                </p>
              </div>
              <Badge
                tone={
                  paymentReleaseSettlementReadinessRows.length > 0
                    ? "warning"
                    : "success"
                }
              >
                {paymentReleaseSettlementReadinessRows.length} readiness item
                {paymentReleaseSettlementReadinessRows.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Issue</th>
                    <th className="px-5 py-3">Release</th>
                    <th className="px-5 py-3">Supplier / Bank</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Next Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentReleaseSettlementReadinessRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8">
                        <p className="font-semibold text-slate-950">
                          No payment settlement readiness issues
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Missing evidence, partial releases, unreconciled
                          releases, and exception states will appear here before
                          production settlement signoff.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paymentReleaseSettlementReadinessRows
                      .slice(
                        pagedSettlementReadiness.pagination.startIndex,
                        pagedSettlementReadiness.pagination.endIndex
                      )
                      .map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                tone={settlementReadinessTone(row.severity)}
                                size="sm"
                              >
                                {row.severity}
                              </Badge>
                              {row.blockerId ? (
                                <Badge tone="warning" size="sm">
                                  {row.blockerId}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 font-bold text-slate-950">
                              {row.issueLabel}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.issueType.replaceAll("_", " ")}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-950">
                              {row.publicReference}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.paymentRequestReference} /{" "}
                              {row.method.replaceAll("_", " ")}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-950">
                              {row.supplierName}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.bankName}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            {row.amount != null ? (
                              <p className="font-bold text-slate-950">
                                {formatMoney(row.amount, row.currencyCode)}
                              </p>
                            ) : (
                              <p className="font-semibold text-slate-600">
                                Evidence control
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <p className="max-w-lg text-sm leading-6 text-slate-600">
                              {row.nextAction}
                            </p>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="border-t border-slate-100">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  AP Aging & Supplier Ledger Preview
                </h2>
                <p className="text-sm text-slate-500">
                  Read-only view of invoice exposure, pending supplier credits,
                  and payment preparation status. Credits stay unapplied until a
                  controlled settlement workflow exists.
                </p>
              </div>
              <Badge tone="info">
                {payablesReportRows.length} report rows
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Reference</th>
                    <th className="px-5 py-3">Supplier</th>
                    <th className="px-5 py-3">Type / Status</th>
                    <th className="px-5 py-3">Open amount</th>
                    <th className="px-5 py-3">Bucket</th>
                    <th className="px-5 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payablesReportRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8">
                        <p className="font-semibold text-slate-950">
                          No payables report rows yet
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          AP aging rows appear after invoices, supplier credits,
                          or payment requests are recorded in scope.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pagedPayablesReports.rows.map((row) => (
                      <tr key={`${row.rowType}-${row.id}`} className="align-top">
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-950">
                            {row.reference}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.supplierName}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge tone="info" size="sm">
                              {row.rowType.replaceAll("_", " ")}
                            </Badge>
                            <Badge
                              tone={
                                row.status === "CANCELLED" ||
                                row.status === "REJECTED"
                                  ? "warning"
                                  : "success"
                              }
                              size="sm"
                            >
                              {row.status.replaceAll("_", " ")}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-950">
                            {formatMoney(row.openAmount, row.currencyCode)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Gross {formatMoney(row.amount, row.currencyCode)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <Badge tone={row.ageBucket === "DAYS_90_PLUS" ? "warning" : "info"}>
                            {row.ageBucket.replaceAll("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          <p className="max-w-md text-xs text-slate-500">
                            {row.detail}
                          </p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="border-t border-slate-100">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Payment Release Report Preview
                </h2>
                <p className="text-sm text-slate-500">
                  Export-ready release rows for settlement state, evidence,
                  proof reference, and reconciliation follow-up.
                </p>
              </div>
              <Badge tone="info">
                {paymentReleaseReportRows.length} report rows
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Release</th>
                    <th className="px-5 py-3">Supplier / Bank</th>
                    <th className="px-5 py-3">Settlement</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentReleaseReportRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8">
                        <p className="font-semibold text-slate-950">
                          No payment release report rows yet
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Release report rows appear after treasury creates payment
                          release control records.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pagedPaymentReleaseReports.rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-950">
                            {row.publicReference}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.paymentRequestReference} /{" "}
                            {row.method.replaceAll("_", " ")}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.supplierName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.bankName}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              tone={
                                row.settlementState === "EXCEPTION"
                                  ? "warning"
                                  : row.settlementState === "RECONCILED" ||
                                      row.settlementState === "RELEASED"
                                    ? "success"
                                    : "info"
                              }
                              size="sm"
                            >
                              {row.settlementState.replaceAll("_", " ")}
                            </Badge>
                            <Badge
                              tone={
                                row.evidenceState === "COMPLETE"
                                  ? "success"
                                  : "warning"
                              }
                              size="sm"
                            >
                              {row.evidenceState}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {row.status.replaceAll("_", " ")}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-950">
                            {formatMoney(row.releaseAmount, row.currencyCode)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Remaining{" "}
                            {formatMoney(row.remainingAmount, row.currencyCode)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.releaseReference ?? "Pending proof"}
                          </p>
                          <p className="mt-2 max-w-md text-xs text-slate-500">
                            {row.exportSafeSummary}
                          </p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="border-t border-slate-100">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Payment Release Control Register
                </h2>
                <p className="text-sm text-slate-500">
                  Offline/manual release evidence and idempotent execution records; no bank API or journal posting happens here.
                </p>
              </div>
              <Badge tone="info">
                {paymentReleaseRows.length} release
                {paymentReleaseRows.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="divide-y divide-slate-100">
              {paymentReleaseRows.length === 0 ? (
                <div className="p-6">
                  <p className="font-semibold text-slate-950">
                    No payment releases recorded yet
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Approved payment requests can be converted into release control records once treasury evidence is ready.
                  </p>
                </div>
              ) : (
                pagedPaymentReleases.rows.map((row) => {
                  const reconciliationOptions = bankCashRows.reconciliations.filter(
                    (reconciliation) =>
                      reconciliation.bankAccountId === row.bankAccountId &&
                      ["OPEN", "IN_PROGRESS", "EXCEPTION"].includes(
                        reconciliation.status
                      )
                  );
                  const statementLineOptions = bankCashRows.statementLines.filter(
                    (line) =>
                      line.bankAccountId === row.bankAccountId &&
                      ["UNMATCHED", "PARTIALLY_MATCHED", "EXCEPTION"].includes(
                        line.status
                      ) &&
                      line.netAmount < 0
                  );
                  const actions = allowedPaymentReleaseActions(
                    row.status,
                    dashboard.permissions.canReleasePayment,
                    dashboard.permissions.canMatchReconciliation
                  ).filter(
                    (action) =>
                      action !== "match_bank" ||
                      (reconciliationOptions.length > 0 &&
                        statementLineOptions.length > 0)
                  );
                  const evidenceAttachments =
                    paymentReleaseEvidenceById.get(row.id) ?? [];
                  return (
                    <div
                      key={row.id}
                      className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_30rem] xl:items-start"
                    >
                      <div className="grid gap-4 md:grid-cols-[1fr_10rem_10rem_9rem_auto] md:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-slate-950">
                              {row.publicReference}
                            </p>
                            <Badge
                              tone={
                                row.status === "RELEASED" ||
                                row.status === "FULLY_RECONCILED"
                                  ? "success"
                                  : row.status === "ON_HOLD" ||
                                      row.status === "EXCEPTION"
                                    ? "warning"
                                    : "info"
                              }
                              size="sm"
                            >
                              {row.status.replaceAll("_", " ")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {row.supplierName} / {row.paymentRequestReference} /{" "}
                            {row.bankName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Created by {row.createdBy}
                            {row.releasedBy ? ` / released by ${row.releasedBy}` : ""}
                            {row.reconciliationMatchCount > 0
                              ? ` / ${row.reconciliationMatchCount} bank match${row.reconciliationMatchCount === 1 ? "" : "es"}`
                              : ""}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Release
                          </p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {formatMoney(row.releaseAmount, row.currencyCode)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Released{" "}
                            {formatMoney(row.releasedAmount, row.currencyCode)}
                          </p>
                          {row.reconciliationMatchedAmount > 0 ? (
                            <p className="mt-1 text-xs text-slate-500">
                              Matched{" "}
                              {formatMoney(
                                row.reconciliationMatchedAmount,
                                row.currencyCode
                              )}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Method
                          </p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {row.method.replaceAll("_", " ")}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Proof
                          </p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {row.releaseReference ?? "Pending"}
                          </p>
                        </div>
                        <Badge tone={row.evidenceReference ? "success" : "warning"}>
                          {row.evidenceReference ? "Evidence" : "Needs evidence"}
                        </Badge>
                        <div className="md:col-span-5">
                          {evidenceAttachments.length > 0 ? (
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              {evidenceAttachments.slice(0, 4).map((attachment) => (
                                <div
                                  key={attachment.id}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                                >
                                  <p className="text-xs font-bold text-slate-950">
                                    {attachment.originalFilename}
                                  </p>
                                  <p className="mt-1 text-[11px] text-slate-500">
                                    {attachment.mimeType} /{" "}
                                    {(attachment.sizeBytes / 1024).toLocaleString(
                                      "en-PH",
                                      { maximumFractionDigits: 1 }
                                    )}{" "}
                                    KB / {attachment.purpose.replaceAll("_", " ")}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                                    {attachment.caption ? (
                                      <p className="text-[11px] text-slate-600">
                                        {attachment.caption}
                                      </p>
                                    ) : (
                                      <span />
                                    )}
                                    <div className="flex flex-wrap items-center gap-2">
                                      {attachment.storageProvider ===
                                      "local-private" ? (
                                        <a
                                          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                                          href={`/evidence/${attachment.id}/download`}
                                        >
                                          Download
                                        </a>
                                      ) : null}
                                    {dashboard.permissions.canReleasePayment ? (
                                      <EntryModal
                                        title="Archive Evidence Link"
                                        triggerLabel="Archive"
                                        triggerClassName="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                      >
                                        <form
                                          action={archiveSharedEvidenceMetadata}
                                          className="grid gap-4"
                                        >
                                          <input
                                            name="controlledEvidenceAttachmentId"
                                            type="hidden"
                                            value={attachment.id}
                                          />
                                          <input
                                            name="sourceType"
                                            type="hidden"
                                            value="PAYMENT_RELEASE"
                                          />
                                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                                            This archives the evidence link only.
                                            The private file metadata remains
                                            preserved for audit and recovery; no
                                            payment release, AP, bank, or journal
                                            state is changed.
                                          </div>
                                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                                            Archive reason
                                            <textarea
                                              className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                              name="archiveReason"
                                              placeholder="Duplicate link, wrong release, superseded proof, etc."
                                              required
                                            />
                                          </label>
                                          <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                            Archive Evidence Link
                                          </button>
                                        </form>
                                      </EntryModal>
                                    ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {dashboard.permissions.canReleasePayment ? (
                            <div className="mt-3">
                              <EntryModal
                                title="Add Release Evidence Metadata"
                                triggerLabel="Add Evidence"
                                triggerClassName="border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                              >
                                <form
                                  action={addPaymentReleaseEvidenceMetadata}
                                  encType="multipart/form-data"
                                  className="grid gap-4"
                                >
                                  <input
                                    name="paymentReleaseId"
                                    type="hidden"
                                    value={row.id}
                                  />
                                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
                                    Upload controlled payment proof here. Files
                                    stay private, payment/AP/bank records are
                                    not mutated, and downloads are audited.
                                  </div>
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Evidence file
                                    <input
                                      accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.txt,.xlsx,.docx,application/pdf,image/jpeg,image/png,image/webp,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                                      name="evidenceFile"
                                      type="file"
                                    />
                                  </label>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                                      File name
                                      <input
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                        name="originalFilename"
                                        placeholder="bank-transfer-proof.pdf"
                                      />
                                    </label>
                                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                                      MIME type
                                      <select
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                        name="mimeType"
                                      >
                                        <option value="">Select MIME type</option>
                                        <option value="application/pdf">PDF</option>
                                        <option value="image/jpeg">JPEG image</option>
                                        <option value="image/png">PNG image</option>
                                        <option value="image/webp">WebP image</option>
                                        <option value="text/csv">CSV</option>
                                        <option value="text/plain">Text</option>
                                        <option value="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                                          Excel workbook
                                        </option>
                                        <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                                          Word document
                                        </option>
                                      </select>
                                    </label>
                                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                                      Size in bytes
                                      <input
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                        min="1"
                                        name="sizeBytes"
                                        step="1"
                                        type="number"
                                      />
                                    </label>
                                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                                      Storage provider
                                      <input
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                        name="storageProvider"
                                        placeholder="manual-private-reference"
                                      />
                                    </label>
                                  </div>
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Internal object key
                                    <input
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="objectKey"
                                      placeholder="finance/evidence/payment-release/proof.pdf"
                                    />
                                  </label>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                                      Checksum
                                      <input
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                        name="checksum"
                                        placeholder="sha256..."
                                      />
                                    </label>
                                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                                      Required for action
                                      <input
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                        name="requiredForAction"
                                        placeholder="Release, reconciliation, reversal"
                                      />
                                    </label>
                                  </div>
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Caption
                                    <textarea
                                      className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="caption"
                                      placeholder="What this release proof supports"
                                    />
                                  </label>
                                  <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                                    Upload Release Evidence
                                  </button>
                                </form>
                              </EntryModal>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        {actions.length === 0 ? (
                          <Badge tone="neutral">No available action</Badge>
                        ) : (
                          <EntryModal
                            title={`Manage ${row.publicReference}`}
                            triggerLabel="Manage Actions"
                            triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            <form
                              action={runPaymentReleaseAction}
                              className="grid gap-4 pt-5"
                            >
                              <input
                                name="paymentReleaseId"
                                type="hidden"
                                value={row.id}
                              />
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="font-bold text-slate-950">
                                  {row.supplierName}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {row.publicReference} /{" "}
                                  {formatMoney(row.releaseAmount, row.currencyCode)}
                                </p>
                              </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Reason
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="reason"
                              placeholder="Required for hold, cancel, failure, reconcile, reverse"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Evidence reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="evidenceReference"
                              placeholder="Release proof, bank screenshot, or reconciliation packet"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Release reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="releaseReference"
                              placeholder="Manual transfer/check/cash proof no."
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Failure code
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="failureCode"
                              placeholder="BANK_REJECTED, CHECK_VOID, etc."
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Reconciliation outcome
                            </span>
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="outcome"
                            >
                              <option value="FULLY_RECONCILED">
                                Fully reconciled
                              </option>
                              <option value="PARTIALLY_RECONCILED">
                                Partially reconciled
                              </option>
                              <option value="EXCEPTION">Exception</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Reconciliation batch
                            </span>
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="reconciliationId"
                            >
                              <option value="">Select batch for statement match</option>
                              {reconciliationOptions.map((reconciliation) => (
                                <option key={reconciliation.id} value={reconciliation.id}>
                                  {reconciliation.publicReference} /{" "}
                                  {reconciliation.statementReference} /{" "}
                                  {formatMoney(
                                    reconciliation.varianceAmount,
                                    row.currencyCode
                                  )}{" "}
                                  variance
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Statement line
                            </span>
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="statementLineId"
                            >
                              <option value="">Select bank outflow line</option>
                              {statementLineOptions.map((line) => (
                                <option key={line.id} value={line.id}>
                                  {line.bankReference} /{" "}
                                  {formatMoney(
                                    Math.abs(line.netAmount),
                                    row.currencyCode
                                  )}{" "}
                                  / matched{" "}
                                  {formatMoney(line.matchedAmount, row.currencyCode)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Matched amount
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              min="0"
                              name="matchedAmount"
                              placeholder="Defaults to released amount"
                              step="0.01"
                              type="number"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Bank reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="bankReference"
                              placeholder="Statement or bank trace reference"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Remarks
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="remarks"
                              placeholder="Optional reviewer note"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                          {actions.map((action) => (
                              <button
                                key={action}
                                className={
                                  action === "cancel" ||
                                  action === "fail" ||
                                  action === "reverse"
                                    ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                    : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                                }
                                name="action"
                                type="submit"
                                value={action}
                              >
                                {paymentReleaseActionLabels[action]}
                              </button>
                            ))}
                        </div>
                            </form>
                          </EntryModal>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      ) : kind === "bank-cash" && activeTabId === "workbench" ? (
        <>
          {dashboard.permissions.canCreateCashDeposit ? (
            <section className="ogfi-data-surface mb-5 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Declare Branch Cash Deposit
                  </h2>
                  <p className="text-sm text-slate-500">
                    Record deposit evidence for finance review. Matching,
                    reconciliation, bank balance, payment, and journal actions
                    remain separate.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={canDeclareBranchDeposit ? "info" : "warning"}>
                    Evidence intake
                  </Badge>
                  <EntryModal
                    title="Declare Branch Cash Deposit"
                    triggerLabel="Declare Branch Cash Deposit"
                    disabled={!canDeclareBranchDeposit}
                  >

              <form
                action={runBranchCashDepositDeclarationAction}
                className="grid gap-4 pt-5"
              >
                {!canDeclareBranchDeposit ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Branch deposit declaration needs at least one active scoped
                    PHP bank account and the cash-deposit create permission.
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Bank account
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="bankAccountId"
                      defaultValue={releaseBankAccounts[0]?.id ?? ""}
                      required
                    >
                      {releaseBankAccounts.length === 0 ? (
                        <option value="">No active bank account</option>
                      ) : null}
                      {releaseBankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.bankName} / {account.maskedAccountNumber} /{" "}
                          {account.scopeLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Deposit date
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="depositDate"
                      type="date"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Amount
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      min="0.01"
                      name="amountPhp"
                      placeholder="25000"
                      step="0.01"
                      type="number"
                      required
                    />
                  </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Deposit slip no.
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="depositSlipNumber"
                      placeholder="BDO-DEP-2026-0001"
                    />
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Evidence reference
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="evidenceReference"
                      placeholder="Deposit slip scan, cash count packet, or branch proof"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Notes
                  </span>
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="notes"
                    placeholder="Cashier shift, sales date, variance context, or branch remarks"
                  />
                </label>

                <button
                  className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!canDeclareBranchDeposit}
                  type="submit"
                >
                  Declare Branch Cash Deposit
                </button>
              </form>
                  </EntryModal>
                </div>
              </div>
            </section>
          ) : null}

          <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Bank & Cash Reconciliation Readiness
              </h2>
              <p className="text-sm text-slate-500">
                Branch deposit evidence, imported statement lines, and reconciliation batches are visible here; no payment release or bank posting happens in this slice.
              </p>
            </div>
            <Badge tone="warning">Release blocked</Badge>
          </div>

          <div className="border-t border-slate-100">
            <div className="ogfi-section-header">
              <div>
                <h3 className="font-bold text-slate-950">
                  Bank & Cash Exception Queue
                </h3>
                <p className="text-sm text-slate-500">
                  Close-readiness issues for deposit evidence, bank statement
                  matching, reconciliation variance, and account activity.
                </p>
              </div>
              <Badge tone={bankCashExceptionRows.length > 0 ? "warning" : "success"}>
                {bankCashExceptionRows.length} exception
                {bankCashExceptionRows.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Issue</th>
                    <th className="px-5 py-3">Account</th>
                    <th className="px-5 py-3">Impact</th>
                    <th className="px-5 py-3">Next Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bankCashExceptionRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8">
                        <p className="font-semibold text-slate-950">
                          No bank/cash exceptions in this scope
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Deposit evidence gaps, unmatched statement lines, and
                          reconciliation variances will appear here before close
                          review.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pagedBankCashExceptions.rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="px-5 py-4">
                          <Badge
                            tone={settlementReadinessTone(row.severity)}
                            size="sm"
                          >
                            {row.severity}
                          </Badge>
                          <p className="mt-2 font-bold text-slate-950">
                            {row.issueLabel}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.issueType.replaceAll("_", " ")}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.bankName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.maskedAccountNumber} / {row.scopeLabel}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          {row.amountPhp != null ? (
                            <p className="font-bold text-slate-950">
                              {formatMoney(row.amountPhp, row.currencyCode)}
                            </p>
                          ) : row.count != null ? (
                            <p className="font-bold text-slate-950">
                              {row.count} item{row.count === 1 ? "" : "s"}
                            </p>
                          ) : (
                            <p className="font-semibold text-slate-600">
                              Activity review
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <p className="max-w-lg text-sm leading-6 text-slate-600">
                            {row.nextAction}
                          </p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-slate-100">
            <div className="ogfi-section-header">
              <div>
                <h3 className="font-bold text-slate-950">
                  Bank & Cash Report Preview
                </h3>
                <p className="text-sm text-slate-500">
                  Export-ready account rows for deposit evidence, statement
                  matching, reconciliation variance, and exception follow-up.
                </p>
              </div>
              <Badge tone="info">
                {bankCashReportRows.length} report rows
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Account</th>
                    <th className="px-5 py-3">Readiness</th>
                    <th className="px-5 py-3">Deposits</th>
                    <th className="px-5 py-3">Statements</th>
                    <th className="px-5 py-3">Reconciliation</th>
                    <th className="px-5 py-3">Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bankCashReportRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8">
                        <p className="font-semibold text-slate-950">
                          No bank/cash report rows yet
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Report rows appear once bank accounts are configured in
                          scope.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pagedBankCashReports.rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-950">
                            {row.bankName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.maskedAccountNumber} / {row.scopeLabel}
                          </p>
                          <Badge
                            tone={row.status === "ACTIVE" ? "success" : "neutral"}
                            size="sm"
                          >
                            {row.status.replaceAll("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            tone={
                              row.readinessState === "READY"
                                ? "success"
                                : row.readinessState === "NEEDS_REVIEW"
                                  ? "warning"
                                  : "neutral"
                            }
                            size="sm"
                          >
                            {row.readinessState.replaceAll("_", " ")}
                          </Badge>
                          <p className="mt-2 text-xs text-slate-500">
                            {row.evidenceGapCount} evidence gap(s)
                          </p>
                          {row.readinessIssues.length > 0 ? (
                            <ul className="mt-2 space-y-1 text-xs text-amber-800">
                              {row.readinessIssues.map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-xs text-emerald-700">
                              No readiness issue flagged
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-950">
                            {formatMoney(row.depositAmountPhp, row.currencyCode)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.depositCount} deposit(s)
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.statementLineCount} line(s)
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.unmatchedStatementCount} unmatched
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.reconciliationCount} batch(es)
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Variance{" "}
                            {formatMoney(row.varianceAmountPhp, row.currencyCode)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="max-w-md text-xs text-slate-500">
                            {row.exportSafeSummary}
                          </p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="font-bold text-slate-950">Bank accounts</h3>
                <p className="text-xs text-slate-500">
                  Active treasury and scoped branch cash accounts.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {bankCashRows.accounts.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">
                    No bank accounts configured in this scope yet.
                  </div>
                ) : (
                  pagedBankAccounts.rows.map((row) => (
                    <div key={row.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-950">
                            {row.bankName}
                          </p>
                          <p className="text-sm text-slate-600">
                            {row.maskedAccountNumber} / {row.scopeLabel}
                          </p>
                        </div>
                        <Badge
                          tone={row.status === "ACTIVE" ? "success" : "info"}
                          size="sm"
                        >
                          {row.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {row.depositCount} deposits / {row.statementCount} statements / {row.reconciliationCount} reconciliations
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="font-bold text-slate-950">Branch deposits</h3>
                <p className="text-xs text-slate-500">
                  Cash deposit declarations awaiting finance reconciliation.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {bankCashRows.deposits.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">
                    No branch cash deposits recorded in this scope yet.
                  </div>
                ) : (
                  pagedBankDeposits.rows.map((row) => {
                    const evidenceAttachments =
                      branchDepositEvidenceById.get(row.id) ?? [];
                    const reconciliationOptions =
                      bankCashRows.reconciliations.filter(
                        (reconciliation) =>
                          reconciliation.bankAccountId === row.bankAccountId &&
                          ["OPEN", "IN_PROGRESS", "EXCEPTION"].includes(
                            reconciliation.status
                          )
                      );
                    const statementLineOptions =
                      bankCashRows.statementLines.filter(
                        (line) =>
                          line.bankAccountId === row.bankAccountId &&
                          ["UNMATCHED", "PARTIALLY_MATCHED", "EXCEPTION"].includes(
                            line.status
                          ) &&
                          line.netAmount > 0
                      );
                    const canMatchDeposit =
                      dashboard.permissions.canMatchReconciliation &&
                      ["SUBMITTED", "FINANCE_APPROVED", "QUEUED_FOR_RECONCILIATION", "EXCEPTION"].includes(
                        row.status
                      ) &&
                      reconciliationOptions.length > 0 &&
                      statementLineOptions.length > 0;
                    return (
                    <div
                      key={row.id}
                      className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_9rem_auto] md:items-start"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-950">
                            {row.publicReference}
                          </p>
                          <Badge
                            tone={
                              row.status === "MATCHED" || row.status === "RECONCILED"
                                ? "success"
                                : "info"
                            }
                            size="sm"
                          >
                            {row.status.replaceAll("_", " ")}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {row.locationName} / {row.bankName} / Declared by {row.declaredBy}
                        </p>
                        {evidenceAttachments.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {evidenceAttachments.slice(0, 3).map((attachment) => (
                              <div
                                key={attachment.id}
                                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                              >
                                <p className="text-xs font-bold text-slate-950">
                                  {attachment.originalFilename}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {attachment.mimeType} /{" "}
                                  {(attachment.sizeBytes / 1024).toLocaleString(
                                    "en-PH",
                                    { maximumFractionDigits: 1 }
                                  )}{" "}
                                  KB
                                </p>
                                <div className="mt-1 flex flex-wrap justify-end gap-2">
                                  {attachment.storageProvider ===
                                  "local-private" ? (
                                    <a
                                      className="inline-flex min-h-8 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                                      href={`/evidence/${attachment.id}/download`}
                                    >
                                      Download
                                    </a>
                                  ) : null}
                                  {dashboard.permissions.canCreateCashDeposit ? (
                                    <EntryModal
                                      title="Archive Evidence Link"
                                      triggerLabel="Archive"
                                      triggerClassName="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                    >
                                      <form
                                        action={archiveSharedEvidenceMetadata}
                                        className="grid gap-4"
                                      >
                                        <input
                                          name="controlledEvidenceAttachmentId"
                                          type="hidden"
                                          value={attachment.id}
                                        />
                                        <input
                                          name="sourceType"
                                          type="hidden"
                                          value="BRANCH_CASH_DEPOSIT"
                                        />
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                                          This archives the evidence link only.
                                          The private file metadata remains
                                          preserved for audit and recovery; no
                                          branch cash deposit, bank,
                                          reconciliation, or journal state is
                                          changed.
                                        </div>
                                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                                          Archive reason
                                          <textarea
                                            className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                            name="archiveReason"
                                            placeholder="Duplicate link, wrong deposit, superseded slip, etc."
                                            required
                                          />
                                        </label>
                                        <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                          Archive Evidence Link
                                        </button>
                                      </form>
                                    </EntryModal>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {dashboard.permissions.canCreateCashDeposit ? (
                          <div className="mt-3">
                            <EntryModal
                              title="Add Deposit Evidence Metadata"
                              triggerLabel="Add Evidence"
                              triggerClassName="border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                            >
                              <form
                                action={addBranchCashDepositEvidenceMetadata}
                                encType="multipart/form-data"
                                className="grid gap-4"
                              >
                                <input
                                  name="branchCashDepositId"
                                  type="hidden"
                                  value={row.id}
                                />
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
                                  Upload controlled deposit proof here. Files
                                  stay private, cash/bank/journal records are
                                  not mutated, and downloads are audited.
                                </div>
                                <label className="grid gap-1 text-sm font-medium text-slate-700">
                                  Evidence file
                                  <input
                                    accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.txt,.xlsx,.docx,application/pdf,image/jpeg,image/png,image/webp,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                                    name="evidenceFile"
                                    type="file"
                                  />
                                </label>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    File name
                                    <input
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="originalFilename"
                                      placeholder="deposit-slip.pdf"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    MIME type
                                    <select
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="mimeType"
                                    >
                                      <option value="">Select MIME type</option>
                                      <option value="application/pdf">PDF</option>
                                      <option value="image/jpeg">JPEG image</option>
                                      <option value="image/png">PNG image</option>
                                      <option value="image/webp">WebP image</option>
                                      <option value="text/csv">CSV</option>
                                      <option value="text/plain">Text</option>
                                      <option value="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                                        Excel workbook
                                      </option>
                                      <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                                        Word document
                                      </option>
                                    </select>
                                  </label>
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Size in bytes
                                    <input
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      min="1"
                                      name="sizeBytes"
                                      step="1"
                                      type="number"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Storage provider
                                    <input
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="storageProvider"
                                      placeholder="manual-private-reference"
                                    />
                                  </label>
                                </div>
                                <label className="grid gap-1 text-sm font-medium text-slate-700">
                                  Internal object key
                                  <input
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                    name="objectKey"
                                    placeholder="finance/evidence/deposits/deposit-slip.pdf"
                                  />
                                </label>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Checksum
                                    <input
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="checksum"
                                      placeholder="sha256..."
                                    />
                                  </label>
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Required for action
                                    <input
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="requiredForAction"
                                      placeholder="Deposit review, reconciliation"
                                    />
                                  </label>
                                </div>
                                <label className="grid gap-1 text-sm font-medium text-slate-700">
                                  Caption
                                  <textarea
                                    className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                    name="caption"
                                    placeholder="Cash count or deposit packet context"
                                  />
                                </label>
                                <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                                  Upload Deposit Evidence
                                </button>
                              </form>
                            </EntryModal>
                          </div>
                        ) : null}
                        {dashboard.permissions.canMatchReconciliation ? (
                          <div className="mt-3">
                            <EntryModal
                              title="Match Deposit to Bank Line"
                              triggerLabel="Match Deposit"
                              triggerClassName={
                                canMatchDeposit
                                  ? "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                                  : "border border-slate-200 bg-slate-100 text-slate-400"
                              }
                              disabled={!canMatchDeposit}
                            >
                              <form
                                action={runBranchCashDepositMatchAction}
                                className="grid gap-4"
                              >
                                <input
                                  name="branchCashDepositId"
                                  type="hidden"
                                  value={row.id}
                                />
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
                                  This creates a controlled reconciliation match
                                  only. It does not mutate bank balances, create
                                  payment releases, settle AP, or post journals.
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Reconciliation batch
                                    <select
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="reconciliationId"
                                      required
                                    >
                                      <option value="">Select batch</option>
                                      {reconciliationOptions.map(
                                        (reconciliation) => (
                                          <option
                                            key={reconciliation.id}
                                            value={reconciliation.id}
                                          >
                                            {reconciliation.publicReference} /{" "}
                                            {reconciliation.statementReference} /{" "}
                                            {formatMoney(
                                              reconciliation.varianceAmount,
                                              "PHP"
                                            )}
                                          </option>
                                        )
                                      )}
                                    </select>
                                  </label>
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Bank statement line
                                    <select
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="statementLineId"
                                      required
                                    >
                                      <option value="">Select bank line</option>
                                      {statementLineOptions.map((line) => (
                                        <option key={line.id} value={line.id}>
                                          {line.bankReference} /{" "}
                                          {formatMoney(
                                            Math.abs(line.netAmount) -
                                              line.matchedAmount,
                                            "PHP"
                                          )}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Match amount
                                    <input
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      min="0.01"
                                      name="matchedAmount"
                                      placeholder="Defaults to remaining deposit"
                                      step="0.01"
                                      type="number"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                                    Evidence reference
                                    <input
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                      name="evidenceReference"
                                      placeholder="Bank statement/deposit packet proof"
                                      required
                                    />
                                  </label>
                                </div>
                                <label className="grid gap-1 text-sm font-medium text-slate-700">
                                  Match reason
                                  <textarea
                                    className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                                    name="reason"
                                    placeholder="Why this bank line matches this branch cash deposit"
                                    required
                                  />
                                </label>
                                <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
                                  Match Deposit
                                </button>
                              </form>
                            </EntryModal>
                          </div>
                        ) : null}
                      </div>
                      <p className="font-semibold text-slate-900">
                        {formatMoney(row.amountPhp, "PHP")}
                      </p>
                      <Badge tone={row.evidenceReference ? "success" : "warning"}>
                        {row.evidenceReference ? "Evidence" : "Needs evidence"}
                      </Badge>
                    </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="font-bold text-slate-950">Statement lines</h3>
                <p className="text-xs text-slate-500">
                  Imported bank lines available for controlled matching.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {bankCashRows.statementLines.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">
                    No bank statement lines imported yet.
                  </div>
                ) : (
                  pagedBankStatementLines.rows.map((row) => (
                    <div
                      key={row.id}
                      className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_9rem_auto] md:items-center"
                    >
                      <div>
                        <p className="font-bold text-slate-950">
                          {row.bankReference}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {row.description} / {row.publicReference}
                        </p>
                      </div>
                      <p className="font-semibold text-slate-900">
                        {formatMoney(row.netAmount, "PHP")}
                      </p>
                      <Badge
                        tone={row.status === "MATCHED" ? "success" : "warning"}
                      >
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="font-bold text-slate-950">Reconciliation batches</h3>
                <p className="text-xs text-slate-500">
                  Prepared batches keep variance visible before close approval.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {bankCashRows.reconciliations.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">
                    No reconciliation batches prepared yet.
                  </div>
                ) : (
                  pagedBankReconciliations.rows.map((row) => (
                    <div
                      key={row.id}
                      className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_8rem_auto] md:items-start"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-950">
                            {row.publicReference}
                          </p>
                          <Badge
                            tone={row.status === "MATCHED" ? "success" : "info"}
                            size="sm"
                          >
                            {row.status.replaceAll("_", " ")}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {row.bankName} / Statement {row.statementReference}
                        </p>
                      </div>
                      <p className="font-semibold text-slate-900">
                        {row.matchCount} match{row.matchCount === 1 ? "" : "es"}
                      </p>
                      <Badge tone={row.varianceAmount === 0 ? "success" : "warning"}>
                        Variance {formatMoney(row.varianceAmount, "PHP")}
                      </Badge>
                      <div className="md:col-span-3">
                        <EvidenceMetadataPanel
                          action={addBankReconciliationEvidenceMetadata}
                          archiveAction={archiveSharedEvidenceMetadata}
                          attachments={
                            bankReconciliationEvidenceById.get(row.id) ?? []
                          }
                          canAdd={dashboard.permissions.canMatchReconciliation}
                          hiddenIdName="bankReconciliationId"
                          objectKeyPlaceholder="finance/evidence/reconciliation/review-support.pdf"
                          recordId={row.id}
                          sourceType="BANK_RECONCILIATION"
                          triggerLabel="Add Evidence"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          </section>
        </>
      ) : null}

      {kind === "payables" && activeTabId === "reports" ? (
        <div className="grid gap-5">
          <section className="ogfi-data-surface overflow-hidden">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  AP Aging & Supplier Ledger
                </h2>
                <p className="text-sm text-slate-500">
                  Read-only exposure by invoice, supplier credit, and payment state.
                </p>
              </div>
              <Badge tone="info">
                Showing {Math.min(payablesReportRows.length, 10)} of{" "}
                {payablesReportRows.length}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Reference</th>
                    <th className="px-5 py-3">Supplier</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Open amount</th>
                    <th className="px-5 py-3">Aging</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payablesReportRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8">
                        <p className="font-semibold text-slate-950">
                          No payables report rows yet
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Report rows appear after invoices, credits, or payment
                          requests are recorded in scope.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pagedPayablesReports.rows.map((row) => (
                      <tr key={`${row.rowType}-${row.id}`}>
                        <td className="px-5 py-4 font-bold text-slate-950">
                          {row.reference}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-900">
                          {row.supplierName}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge tone="info" size="sm">
                              {row.rowType.replaceAll("_", " ")}
                            </Badge>
                            <Badge
                              tone={
                                row.status === "CANCELLED" ||
                                row.status === "REJECTED"
                                  ? "warning"
                                  : "success"
                              }
                              size="sm"
                            >
                              {row.status.replaceAll("_", " ")}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-bold text-slate-950">
                          {formatMoney(row.openAmount, row.currencyCode)}
                        </td>
                        <td className="px-5 py-4">
                          <Badge tone={row.ageBucket === "DAYS_90_PLUS" ? "warning" : "info"}>
                            {row.ageBucket.replaceAll("_", " ")}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <FinancePagination
              basePath={tabBasePath}
              tab={activeTabId}
              page={pagedPayablesReports.pagination.page}
              totalPages={pagedPayablesReports.pagination.totalPages}
              totalCount={payablesReportRows.length}
              startIndex={pagedPayablesReports.pagination.startIndex}
              endIndex={pagedPayablesReports.pagination.endIndex}
            />
          </section>

          <section className="ogfi-data-surface overflow-hidden">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Payment Release Readiness
                </h2>
                <p className="text-sm text-slate-500">
                  Settlement blockers and export-safe release follow-up.
                </p>
              </div>
              <Badge
                tone={
                  paymentReleaseSettlementReadinessRows.length > 0
                    ? "warning"
                    : "success"
                }
              >
                {paymentReleaseSettlementReadinessRows.length} readiness item
                {paymentReleaseSettlementReadinessRows.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Issue</th>
                    <th className="px-5 py-3">Release</th>
                    <th className="px-5 py-3">Supplier / Bank</th>
                    <th className="px-5 py-3">Next action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentReleaseSettlementReadinessRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8">
                        <p className="font-semibold text-slate-950">
                          No payment release readiness issues
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pagedSettlementReadiness.rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="px-5 py-4">
                          <Badge
                            tone={settlementReadinessTone(row.severity)}
                            size="sm"
                          >
                            {row.severity}
                          </Badge>
                          <p className="mt-2 font-bold text-slate-950">
                            {row.issueLabel}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.publicReference}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.paymentRequestReference}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.supplierName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.bankName}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm leading-6 text-slate-600">
                          {row.nextAction}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <FinancePagination
              basePath={tabBasePath}
              tab={activeTabId}
              page={pagedSettlementReadiness.pagination.page}
              totalPages={pagedSettlementReadiness.pagination.totalPages}
              totalCount={paymentReleaseSettlementReadinessRows.length}
              startIndex={pagedSettlementReadiness.pagination.startIndex}
              endIndex={pagedSettlementReadiness.pagination.endIndex}
            />
          </section>
        </div>
      ) : null}

      {kind === "bank-cash" &&
      (activeTabId === "exceptions" || activeTabId === "reports") ? (
        <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {activeTabId === "exceptions"
                  ? "Bank & Cash Exception Queue"
                  : "Bank & Cash Report Preview"}
              </h2>
              <p className="text-sm text-slate-500">
                {activeTabId === "exceptions"
                  ? "Readiness issues for evidence, statement matching, variance, and account activity."
                  : "Export-ready account rows for deposits, statements, reconciliation, and traceability."}
              </p>
            </div>
            <Badge tone={activeTabId === "exceptions" ? "warning" : "info"}>
              {activeTabId === "exceptions"
                ? `${bankCashExceptionRows.length} exception${
                    bankCashExceptionRows.length === 1 ? "" : "s"
                  }`
                : `${bankCashReportRows.length} report rows`}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                {activeTabId === "exceptions" ? (
                  <tr>
                    <th className="px-5 py-3">Issue</th>
                    <th className="px-5 py-3">Account</th>
                    <th className="px-5 py-3">Impact</th>
                    <th className="px-5 py-3">Next action</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-5 py-3">Account</th>
                    <th className="px-5 py-3">Readiness</th>
                    <th className="px-5 py-3">Deposits</th>
                    <th className="px-5 py-3">Statements</th>
                    <th className="px-5 py-3">Reconciliation</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeTabId === "exceptions" ? (
                  bankCashExceptionRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8">
                        <p className="font-semibold text-slate-950">
                          No bank/cash exceptions in this scope
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pagedBankCashExceptions.rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="px-5 py-4">
                          <Badge
                            tone={settlementReadinessTone(row.severity)}
                            size="sm"
                          >
                            {row.severity}
                          </Badge>
                          <p className="mt-2 font-bold text-slate-950">
                            {row.issueLabel}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.bankName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.maskedAccountNumber}
                          </p>
                        </td>
                        <td className="px-5 py-4 font-bold text-slate-950">
                          {row.amountPhp != null
                            ? formatMoney(row.amountPhp, row.currencyCode)
                            : row.count != null
                              ? `${row.count} item${row.count === 1 ? "" : "s"}`
                              : "Activity review"}
                        </td>
                        <td className="px-5 py-4 text-sm leading-6 text-slate-600">
                          {row.nextAction}
                        </td>
                      </tr>
                    ))
                  )
                ) : bankCashReportRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8">
                      <p className="font-semibold text-slate-950">
                        No bank/cash report rows yet
                      </p>
                    </td>
                  </tr>
                ) : (
                  pagedBankCashReports.rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-950">{row.bankName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.maskedAccountNumber} / {row.scopeLabel}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          tone={
                            row.readinessState === "READY"
                              ? "success"
                              : row.readinessState === "NEEDS_REVIEW"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {row.readinessState.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-950">
                        {formatMoney(row.depositAmountPhp, row.currencyCode)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {row.statementLineCount} line(s)
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        Variance {formatMoney(row.varianceAmountPhp, row.currencyCode)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {activeTabId === "exceptions" ? (
            <FinancePagination
              basePath={tabBasePath}
              tab={activeTabId}
              page={pagedBankCashExceptions.pagination.page}
              totalPages={pagedBankCashExceptions.pagination.totalPages}
              totalCount={bankCashExceptionRows.length}
              startIndex={pagedBankCashExceptions.pagination.startIndex}
              endIndex={pagedBankCashExceptions.pagination.endIndex}
            />
          ) : (
            <FinancePagination
              basePath={tabBasePath}
              tab={activeTabId}
              page={pagedBankCashReports.pagination.page}
              totalPages={pagedBankCashReports.pagination.totalPages}
              totalCount={bankCashReportRows.length}
              startIndex={pagedBankCashReports.pagination.startIndex}
              endIndex={pagedBankCashReports.pagination.endIndex}
            />
          )}
        </section>
      ) : null}

      <div
        className={cx(
          "grid gap-4 md:grid-cols-3",
          activeTabId === "controls" ? "" : "hidden"
        )}
      >
        <Panel className="ogfi-detail-card">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="mt-1 h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-bold text-slate-950">Controls</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Tenant, company, location, role, and segregation rules are enforced
                in services before finance actions can move beyond read-side views.
              </p>
            </div>
          </div>
        </Panel>
        <Panel className="ogfi-detail-card">
          <div className="flex items-start gap-3">
            <FileSearch aria-hidden="true" className="mt-1 h-5 w-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-slate-950">Evidence</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Source PO, receiving, discrepancy, and audit records remain the
                evidence chain for future invoice/payment decisions.
              </p>
            </div>
          </div>
        </Panel>
        <Panel className="ogfi-detail-card">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-1 h-5 w-5 text-amber-600" />
            <div>
              <h3 className="font-bold text-slate-950">Release Gate</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Posting, release, reconciliation, and close need focused tests,
                finance-owner validation, and UAT before production use.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
