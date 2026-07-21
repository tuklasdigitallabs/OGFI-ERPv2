export const maximumFileSizeBytes = 25 * 1024 * 1024;
export const acceptedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);
export const acceptedExtensions = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "txt",
]);
export const acceptedFileTypes =
  ".pdf,.jpg,.jpeg,.png,.webp,.txt,application/pdf,image/jpeg,image/png,image/webp,text/plain";

export type EvidenceSourceType =
  | "AP_INVOICE"
  | "AP_INVOICE_LINE"
  | "SUPPLIER_CREDIT_NOTE"
  | "PAYMENT_REQUEST"
  | "PAYMENT_RELEASE"
  | "BRANCH_CASH_DEPOSIT"
  | "BANK_RECONCILIATION"
  | "EXPENSE_REQUEST"
  | "EXPENSE_REQUEST_LINE"
  | "CASH_ADVANCE_REQUEST"
  | "CASH_ADVANCE_LIQUIDATION"
  | "CASH_ADVANCE_LIQUIDATION_LINE"
  | "PETTY_CASH_FUND"
  | "PETTY_CASH_REQUEST"
  | "PETTY_CASH_LIQUIDATION"
  | "PETTY_CASH_LIQUIDATION_LINE"
  | "FINANCE_CLOSE_RUN"
  | "FINANCE_CLOSE_ITEM"
  | "WORKFORCE_EMPLOYEE"
  | "WORKFORCE_ASSIGNMENT"
  | "WORKFORCE_LEAVE"
  | "WORKFORCE_OVERTIME"
  | "WORKFORCE_SCHEDULE"
  | "WORKFORCE_ATTENDANCE_IMPORT"
  | "PROJECT_REQUIREMENT";

export type EvidencePurpose =
  | "EVIDENCE"
  | "REFERENCE"
  | "APPROVAL_SUPPORT"
  | "EXCEPTION_SUPPORT"
  | "PAYMENT_PROOF"
  | "RECONCILIATION_SUPPORT"
  | "CLOSURE_SUPPORT";

export type ControlledEvidenceDisplayRow = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  purpose: string;
  caption: string | null;
  requiredForAction?: string | null;
  legalHold?: boolean;
  status: string;
  uploadState?: string;
  scanState?: string;
  availabilityState?: string;
  createdAt?: string;
};

export type UploadPhase =
  | "idle"
  | "hashing"
  | "uploading"
  | "scanning"
  | "error";

export type UploadIntentResponse = {
  intentId: string;
  attachmentId: string;
  intentToken: string;
  upload: {
    method: "application-proxy";
    url: string;
    fields: Record<string, string>;
    expiresAt: string;
    key: string;
  };
  reused: boolean;
};

export type ControlledEvidencePanelProps = {
  attachments: readonly ControlledEvidenceDisplayRow[];
  canAdd: boolean;
  sourceType: EvidenceSourceType;
  sourceRecordId: string;
  sourceLineId?: string | null | undefined;
  purpose?: EvidencePurpose;
  requiredForAction?: string | undefined;
  triggerLabel?: string;
  captionPlaceholder?: string;
  archiveAction?: ((formData: FormData) => Promise<void>) | undefined;
  archiveImpact?: string;
};
