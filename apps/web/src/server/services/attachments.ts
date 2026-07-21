import { prisma } from "@ogfi/database";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  permissions,
  requireAnyPermission,
  requirePermission,
} from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import { getControlledEvidenceStoragePolicy } from "./policySettings";
import { findAuthorizedProject } from "./projects";
import { assertWorkforceSourceScopeAccess } from "./workforce";

export const phase3EvidenceUploadBlockerId = "P3-BLOCK-002";
export const attachmentMaxSizeBytes = 25 * 1024 * 1024;
export const privateAttachmentStorageProvider = "local-private";

export const evidenceAttachmentSourceTypes = [
  "AP_INVOICE",
  "AP_INVOICE_LINE",
  "SUPPLIER_CREDIT_NOTE",
  "PAYMENT_REQUEST",
  "PAYMENT_RELEASE",
  "BRANCH_CASH_DEPOSIT",
  "BANK_RECONCILIATION",
  "EXPENSE_REQUEST",
  "EXPENSE_REQUEST_LINE",
  "CASH_ADVANCE_REQUEST",
  "CASH_ADVANCE_LIQUIDATION",
  "CASH_ADVANCE_LIQUIDATION_LINE",
  "PETTY_CASH_FUND",
  "PETTY_CASH_REQUEST",
  "PETTY_CASH_LIQUIDATION",
  "PETTY_CASH_LIQUIDATION_LINE",
  "FINANCE_CLOSE_RUN",
  "FINANCE_CLOSE_ITEM",
  "WORKFORCE_EMPLOYEE",
  "WORKFORCE_ASSIGNMENT",
  "WORKFORCE_LEAVE",
  "WORKFORCE_OVERTIME",
  "WORKFORCE_SCHEDULE",
  "WORKFORCE_ATTENDANCE_IMPORT",
  "PROJECT_REQUIREMENT",
] as const;

const evidenceAttachmentPurposes = [
  "EVIDENCE",
  "REFERENCE",
  "APPROVAL_SUPPORT",
  "EXCEPTION_SUPPORT",
  "PAYMENT_PROOF",
  "RECONCILIATION_SUPPORT",
  "CLOSURE_SUPPORT",
] as const;

const allowedAttachmentMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type EvidenceState = "COMPLETE" | "MISSING";
export type EvidenceCaptureMode =
  | "REFERENCE_ONLY"
  | "ATTACHMENT_METADATA_READY"
  | "MISSING";
export type EvidenceProductionReadiness =
  | "PRODUCTION_READY"
  | "BINARY_UPLOAD_DEFERRED_BY_P3_BLOCK_002"
  | "NEEDS_EVIDENCE_REFERENCE";
export type EvidenceAttachmentSourceType =
  (typeof evidenceAttachmentSourceTypes)[number];
export type EvidenceAttachmentPurpose =
  (typeof evidenceAttachmentPurposes)[number];

export type EvidenceReadiness = {
  evidenceState: EvidenceState;
  evidenceCaptureMode: EvidenceCaptureMode;
  evidenceProductionReadiness: EvidenceProductionReadiness;
  evidenceBlockerId: typeof phase3EvidenceUploadBlockerId | null;
};

export type AttachmentMetadataInput = {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  objectKey: string;
  checksum?: string | null | undefined;
};

export type AttachmentMetadataValidation = {
  isValid: boolean;
  normalized: AttachmentMetadataInput | null;
  errors: string[];
};

export type EvidenceAttachmentLinkInput = {
  tenantId: string;
  companyId: string;
  sourceType: EvidenceAttachmentSourceType;
  sourceRecordId: string;
  sourceLineId?: string | null | undefined;
  attachmentId: string;
  purpose?: EvidenceAttachmentPurpose | undefined;
  caption?: string | null | undefined;
  requiredForAction?: string | null | undefined;
};

export type ControlledEvidenceAttachmentRow = {
  id: string;
  sourceType: EvidenceAttachmentSourceType;
  sourceRecordId: string;
  sourceLineId: string | null;
  sourceKey: string;
  attachmentId: string;
  purpose: EvidenceAttachmentPurpose;
  caption: string | null;
  requiredForAction: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  status: string;
  createdByUserId: string;
  createdAt: string;
};

export type LinkControlledEvidenceAttachmentInput = Omit<
  EvidenceAttachmentLinkInput,
  "tenantId" | "companyId"
> & {
  requiredPermissionCode: string;
};

export type ListControlledEvidenceAttachmentInput = {
  sourceType: EvidenceAttachmentSourceType;
  sourceRecordId: string;
  sourceLineId?: string | null | undefined;
  requiredPermissionCode: string;
};

export type ArchiveControlledEvidenceAttachmentInput = {
  controlledEvidenceAttachmentId: string;
  archiveReason: string;
  requiredPermissionCode: string;
};

export type CreateControlledEvidenceAttachmentMetadataLinkInput = Omit<
  LinkControlledEvidenceAttachmentInput,
  "attachmentId"
> & {
  attachment: AttachmentMetadataInput;
};

export type CreateControlledEvidenceAttachmentUploadLinkInput = Omit<
  LinkControlledEvidenceAttachmentInput,
  "attachmentId"
> & {
  file: File;
};

export type DownloadControlledEvidenceAttachmentInput = {
  controlledEvidenceAttachmentId: string;
};

export type ControlledEvidenceAttachmentDownload = {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

export type EvidenceAttachmentLinkValidation = {
  isValid: boolean;
  normalized:
    | (Required<
        Pick<
          EvidenceAttachmentLinkInput,
          | "tenantId"
          | "companyId"
          | "sourceType"
          | "sourceRecordId"
          | "attachmentId"
        >
      > & {
        sourceLineId: string | null;
        sourceKey: string;
        purpose: EvidenceAttachmentPurpose;
        caption: string | null;
        requiredForAction: string | null;
      })
    | null;
  errors: string[];
};

const attachmentMetadataSchema = z.object({
  originalFilename: z
    .string()
    .trim()
    .min(1, "Attachment filename is required.")
    .max(180, "Attachment filename is too long.")
    .refine(
      (filename) =>
        !filename.includes("/") &&
        !filename.includes("\\") &&
        !filename.includes("\0"),
      "Attachment filename must not include path separators.",
    ),
  mimeType: z.enum(allowedAttachmentMimeTypes, {
    message: "Attachment file type is not allowed for evidence.",
  }),
  sizeBytes: z
    .number()
    .int("Attachment size must be a whole number of bytes.")
    .positive("Attachment size must be greater than zero.")
    .max(
      attachmentMaxSizeBytes,
      "Attachment exceeds the configured evidence size limit.",
    ),
  storageProvider: z
    .string()
    .trim()
    .min(2, "Attachment storage provider is required.")
    .max(60, "Attachment storage provider is too long."),
  objectKey: z
    .string()
    .trim()
    .min(2, "Attachment object key is required.")
    .max(500, "Attachment object key is too long.")
    .refine(
      (key) =>
        !key.startsWith("/") &&
        !key.includes("..") &&
        !key.includes("\\") &&
        !/^https?:\/\//i.test(key),
      "Attachment object key must be an internal storage key, not a public path or URL.",
    ),
  checksum: z.string().trim().max(128).optional().nullable(),
});

const evidenceAttachmentLinkSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  sourceType: z.enum(evidenceAttachmentSourceTypes),
  sourceRecordId: z.string().uuid(),
  sourceLineId: z.string().uuid().optional().nullable(),
  attachmentId: z.string().uuid(),
  purpose: z.enum(evidenceAttachmentPurposes).default("EVIDENCE"),
  caption: z.string().trim().max(500).optional().nullable(),
  requiredForAction: z.string().trim().max(100).optional().nullable(),
});

const archiveControlledEvidenceAttachmentSchema = z.object({
  controlledEvidenceAttachmentId: z.string().uuid(),
  archiveReason: z.string().trim().min(5).max(1000),
  requiredPermissionCode: z.string().trim().min(2).max(120),
});

export function normalizeEvidenceReference(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveEvidenceReadiness(input: {
  evidenceReference?: string | null | undefined;
  attachmentCount?: number;
  binaryUploadEnabled?: boolean | undefined;
}): EvidenceReadiness {
  const evidenceReference = normalizeEvidenceReference(input.evidenceReference);
  const attachmentCount = input.attachmentCount ?? 0;

  if (attachmentCount > 0) {
    return {
      evidenceState: "COMPLETE",
      evidenceCaptureMode: "ATTACHMENT_METADATA_READY",
      evidenceProductionReadiness: input.binaryUploadEnabled
        ? "PRODUCTION_READY"
        : "BINARY_UPLOAD_DEFERRED_BY_P3_BLOCK_002",
      evidenceBlockerId: input.binaryUploadEnabled
        ? null
        : phase3EvidenceUploadBlockerId,
    };
  }

  if (evidenceReference) {
    return {
      evidenceState: "COMPLETE",
      evidenceCaptureMode: "REFERENCE_ONLY",
      evidenceProductionReadiness: input.binaryUploadEnabled
        ? "PRODUCTION_READY"
        : "BINARY_UPLOAD_DEFERRED_BY_P3_BLOCK_002",
      evidenceBlockerId: input.binaryUploadEnabled
        ? null
        : phase3EvidenceUploadBlockerId,
    };
  }

  return {
    evidenceState: "MISSING",
    evidenceCaptureMode: "MISSING",
    evidenceProductionReadiness: "NEEDS_EVIDENCE_REFERENCE",
    evidenceBlockerId: null,
  };
}

export function buildEvidenceReadinessRows<
  T extends { id?: string; evidenceReference?: string | null },
>(
  records: T[],
  options: {
    attachmentCountById?: Map<string, number>;
    binaryUploadEnabled?: boolean | undefined;
  } = {},
) {
  return records.map((record) => {
    const readiness = resolveEvidenceReadiness({
      evidenceReference: record.evidenceReference,
      attachmentCount: record.id
        ? (options.attachmentCountById?.get(record.id) ?? 0)
        : 0,
      binaryUploadEnabled: options.binaryUploadEnabled,
    });
    return {
      ...record,
      ...readiness,
    };
  });
}

export function buildEvidenceSourceKey(input: {
  sourceRecordId: string;
  sourceLineId?: string | null | undefined;
}) {
  return input.sourceLineId
    ? `${input.sourceRecordId}:${input.sourceLineId}`
    : `${input.sourceRecordId}:HEADER`;
}

export function validateAttachmentMetadata(
  input: AttachmentMetadataInput,
): AttachmentMetadataValidation {
  const result = attachmentMetadataSchema.safeParse(input);
  if (!result.success) {
    return {
      isValid: false,
      normalized: null,
      errors: result.error.issues.map((issue) => issue.message),
    };
  }

  return {
    isValid: true,
    normalized: result.data,
    errors: [],
  };
}

export function validateEvidenceAttachmentLinkInput(
  input: EvidenceAttachmentLinkInput,
): EvidenceAttachmentLinkValidation {
  const result = evidenceAttachmentLinkSchema.safeParse(input);
  if (!result.success) {
    return {
      isValid: false,
      normalized: null,
      errors: result.error.issues.map((issue) => issue.message),
    };
  }

  const values = result.data;
  return {
    isValid: true,
    normalized: {
      tenantId: values.tenantId,
      companyId: values.companyId,
      sourceType: values.sourceType,
      sourceRecordId: values.sourceRecordId,
      sourceLineId: values.sourceLineId ?? null,
      sourceKey: buildEvidenceSourceKey({
        sourceRecordId: values.sourceRecordId,
        sourceLineId: values.sourceLineId,
      }),
      attachmentId: values.attachmentId,
      purpose: values.purpose,
      caption: values.caption?.trim() || null,
      requiredForAction: values.requiredForAction?.trim() || null,
    },
    errors: [],
  };
}

function assertCompanySession(session: SessionContext) {
  if (!session.context.companyId) {
    throw new Error("COMPANY_CONTEXT_REQUIRED");
  }
  return session.context.companyId;
}

function controlledEvidenceAttachmentRow(link: {
  id: string;
  sourceType: string;
  sourceRecordId: string;
  sourceLineId: string | null;
  sourceKey: string;
  attachmentId: string;
  purpose: string;
  caption: string | null;
  requiredForAction: string | null;
  status: string;
  createdByUserId: string;
  createdAt: Date;
  attachment: {
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    storageProvider: string;
  };
}): ControlledEvidenceAttachmentRow {
  return {
    id: link.id,
    sourceType: link.sourceType as EvidenceAttachmentSourceType,
    sourceRecordId: link.sourceRecordId,
    sourceLineId: link.sourceLineId,
    sourceKey: link.sourceKey,
    attachmentId: link.attachmentId,
    purpose: link.purpose as EvidenceAttachmentPurpose,
    caption: link.caption,
    requiredForAction: link.requiredForAction,
    originalFilename: link.attachment.originalFilename,
    mimeType: link.attachment.mimeType,
    sizeBytes: link.attachment.sizeBytes,
    storageProvider: link.attachment.storageProvider,
    status: link.status,
    createdByUserId: link.createdByUserId,
    createdAt: link.createdAt.toISOString(),
  };
}

function getPrivateAttachmentRoot() {
  return (
    process.env.OGFI_PRIVATE_ATTACHMENT_ROOT ||
    path.join(process.cwd(), ".ogfi-private-attachments")
  );
}

function sanitizeEvidenceFilename(filename: string) {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  return base || "evidence-file";
}

function buildPrivateEvidenceObjectKey(input: {
  tenantId: string;
  attachmentId: string;
  originalFilename: string;
}) {
  return [
    "controlled-evidence",
    input.tenantId,
    input.attachmentId,
    sanitizeEvidenceFilename(input.originalFilename),
  ].join("/");
}

function resolvePrivateAttachmentPath(objectKey: string) {
  const root = getPrivateAttachmentRoot();
  const resolved = path.resolve(root, objectKey);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("ATTACHMENT_OBJECT_KEY_OUT_OF_BOUNDS");
  }
  return resolved;
}

function requiredViewPermissionsForSourceType(
  sourceType: EvidenceAttachmentSourceType,
) {
  switch (sourceType) {
    case "AP_INVOICE":
    case "AP_INVOICE_LINE":
    case "SUPPLIER_CREDIT_NOTE":
    case "PAYMENT_REQUEST":
    case "PAYMENT_RELEASE":
      return [permissions.financePayablesView, permissions.financeView];
    case "EXPENSE_REQUEST":
    case "EXPENSE_REQUEST_LINE":
      return [permissions.financeExpenseRequestView];
    case "CASH_ADVANCE_REQUEST":
    case "CASH_ADVANCE_LIQUIDATION":
    case "CASH_ADVANCE_LIQUIDATION_LINE":
      return [permissions.financeCashAdvanceView];
    case "PETTY_CASH_FUND":
    case "PETTY_CASH_REQUEST":
    case "PETTY_CASH_LIQUIDATION":
    case "PETTY_CASH_LIQUIDATION_LINE":
      return [permissions.financePettyCashView];
    case "BRANCH_CASH_DEPOSIT":
    case "BANK_RECONCILIATION":
      return [permissions.financeReconciliationView, permissions.financeView];
    case "FINANCE_CLOSE_RUN":
    case "FINANCE_CLOSE_ITEM":
      return [permissions.financePeriodCloseManage];
    case "WORKFORCE_EMPLOYEE":
    case "WORKFORCE_ASSIGNMENT":
    case "WORKFORCE_LEAVE":
    case "WORKFORCE_OVERTIME":
      return [permissions.workforceManage, permissions.coreAdminister];
    case "WORKFORCE_SCHEDULE":
      return [permissions.workforceScheduleView, permissions.workforceView];
    case "WORKFORCE_ATTENDANCE_IMPORT":
      return [
        permissions.workforceAttendanceImportManage,
        permissions.coreAdminister,
      ];
    case "PROJECT_REQUIREMENT":
      return [permissions.projectView];
    default:
      return [];
  }
}

function requiredWritePermissionsForSourceType(
  sourceType: EvidenceAttachmentSourceType,
) {
  switch (sourceType) {
    case "AP_INVOICE":
    case "AP_INVOICE_LINE":
      return [permissions.financeApInvoiceCreate];
    case "SUPPLIER_CREDIT_NOTE":
      return [permissions.financeSupplierCreditCreate];
    case "PAYMENT_REQUEST":
      return [permissions.financePaymentRequestCreate];
    case "PAYMENT_RELEASE":
      return [permissions.financePaymentRelease];
    case "BRANCH_CASH_DEPOSIT":
      return [permissions.financeCashDepositCreate];
    case "BANK_RECONCILIATION":
      return [permissions.financeReconciliationMatch];
    case "EXPENSE_REQUEST":
    case "EXPENSE_REQUEST_LINE":
      return [permissions.financeExpenseRequestCreate];
    case "CASH_ADVANCE_REQUEST":
      return [permissions.financeCashAdvanceCreate];
    case "CASH_ADVANCE_LIQUIDATION":
    case "CASH_ADVANCE_LIQUIDATION_LINE":
      return [permissions.financeCashAdvanceLiquidate];
    case "PETTY_CASH_FUND":
    case "PETTY_CASH_REQUEST":
      return [permissions.financePettyCashCreate];
    case "PETTY_CASH_LIQUIDATION":
    case "PETTY_CASH_LIQUIDATION_LINE":
      return [permissions.financePettyCashLiquidate];
    case "FINANCE_CLOSE_RUN":
    case "FINANCE_CLOSE_ITEM":
      return [permissions.financePeriodCloseManage];
    case "WORKFORCE_EMPLOYEE":
    case "WORKFORCE_ASSIGNMENT":
      return [permissions.workforceManage, permissions.coreAdminister];
    case "WORKFORCE_LEAVE":
      return [
        permissions.workforceManage,
        permissions.workforceLeaveApprove,
        permissions.coreAdminister,
      ];
    case "WORKFORCE_OVERTIME":
      return [
        permissions.workforceManage,
        permissions.workforceOvertimeApprove,
        permissions.coreAdminister,
      ];
    case "WORKFORCE_SCHEDULE":
      return [permissions.workforceScheduleManage, permissions.coreAdminister];
    case "WORKFORCE_ATTENDANCE_IMPORT":
      return [
        permissions.workforceAttendanceImportManage,
        permissions.coreAdminister,
      ];
    case "PROJECT_REQUIREMENT":
      return [permissions.projectManage];
    default:
      return [];
  }
}

async function requireCanonicalEvidenceWritePermission(input: {
  session: SessionContext;
  sourceType: EvidenceAttachmentSourceType;
  sourceRecordId: string;
}) {
  try {
    await requireAnyPermission(
      input.session,
      requiredWritePermissionsForSourceType(input.sourceType),
    );
    return;
  } catch (error) {
    if (
      input.sourceType !== "PROJECT_REQUIREMENT" ||
      !(error instanceof Error) ||
      error.message !== "PERMISSION_DENIED"
    ) {
      throw error;
    }
  }

  const ownedRequirement = await prisma.projectRequirement.findFirst({
    where: {
      id: input.sourceRecordId,
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      ownerUserId: input.session.user.id,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!ownedRequirement) throw new Error("PERMISSION_DENIED");
  await requirePermission(input.session, permissions.projectView);
}

type EvidenceSourceScope = {
  tenantId: string;
  companyId: string;
  brandId: string | null;
  locationId: string | null;
  departmentId: string | null;
  projectId: string | null;
};

type EvidenceAccessScope = {
  scopeType: string;
  scopeId: string;
};

const emptyScopeColumns =
  'NULL::uuid AS "brandId", NULL::uuid AS "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId"';

function evidenceSourceScopeQuery(sourceType: EvidenceAttachmentSourceType) {
  switch (sourceType) {
    case "AP_INVOICE":
      return `SELECT "tenantId", "companyId", NULL::uuid AS "brandId", "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "ApInvoice" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "AP_INVOICE_LINE":
      return `SELECT l."tenantId", l."companyId", NULL::uuid AS "brandId", i."locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "ApInvoiceLine" l JOIN "ApInvoice" i ON i.id = l."apInvoiceId" WHERE l.id = $1 AND l."tenantId" = $2 AND l."companyId" = $3`;
    case "SUPPLIER_CREDIT_NOTE":
      return `SELECT n."tenantId", n."companyId", NULL::uuid AS "brandId", i."locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "SupplierCreditNote" n JOIN "ApInvoice" i ON i.id = n."originalApInvoiceId" WHERE n.id = $1 AND n."tenantId" = $2 AND n."companyId" = $3`;
    case "PAYMENT_REQUEST":
      return `SELECT "tenantId", "companyId", NULL::uuid AS "brandId", "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "PaymentRequest" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "PAYMENT_RELEASE":
      return `SELECT "tenantId", "companyId", NULL::uuid AS "brandId", "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "PaymentRelease" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "BRANCH_CASH_DEPOSIT":
      return `SELECT "tenantId", "companyId", NULL::uuid AS "brandId", "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "BranchCashDeposit" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "BANK_RECONCILIATION":
      return `SELECT r."tenantId", r."companyId", NULL::uuid AS "brandId", a."locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "BankReconciliation" r JOIN "BankAccount" a ON a.id = r."bankAccountId" WHERE r.id = $1 AND r."tenantId" = $2 AND r."companyId" = $3`;
    case "EXPENSE_REQUEST":
      return `SELECT "tenantId", "companyId", "brandId", "locationId", "departmentId", "projectId" FROM "ExpenseRequest" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "EXPENSE_REQUEST_LINE":
      return `SELECT l."tenantId", l."companyId", COALESCE(l."brandId", r."brandId") AS "brandId", COALESCE(l."locationId", r."locationId") AS "locationId", COALESCE(l."departmentId", r."departmentId") AS "departmentId", COALESCE(l."projectId", r."projectId") AS "projectId" FROM "ExpenseRequestLine" l JOIN "ExpenseRequest" r ON r.id = l."expenseRequestId" WHERE l.id = $1 AND l."tenantId" = $2 AND l."companyId" = $3`;
    case "CASH_ADVANCE_REQUEST":
      return `SELECT "tenantId", "companyId", "brandId", "locationId", "departmentId", "projectId" FROM "CashAdvanceRequest" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "CASH_ADVANCE_LIQUIDATION":
      return `SELECT l."tenantId", l."companyId", r."brandId", l."locationId", r."departmentId", r."projectId" FROM "CashAdvanceLiquidation" l JOIN "CashAdvanceRequest" r ON r.id = l."cashAdvanceRequestId" WHERE l.id = $1 AND l."tenantId" = $2 AND l."companyId" = $3`;
    case "CASH_ADVANCE_LIQUIDATION_LINE":
      return `SELECT l."tenantId", l."companyId", r."brandId", l."locationId", r."departmentId", r."projectId" FROM "CashAdvanceLiquidationLine" l JOIN "CashAdvanceLiquidation" q ON q.id = l."liquidationId" JOIN "CashAdvanceRequest" r ON r.id = q."cashAdvanceRequestId" WHERE l.id = $1 AND l."tenantId" = $2 AND l."companyId" = $3`;
    case "PETTY_CASH_FUND":
      return `SELECT "tenantId", "companyId", "brandId", "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "PettyCashFund" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "PETTY_CASH_REQUEST":
      return `SELECT r."tenantId", r."companyId", f."brandId", f."locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "PettyCashRequest" r JOIN "PettyCashFund" f ON f.id = r."pettyCashFundId" WHERE r.id = $1 AND r."tenantId" = $2 AND r."companyId" = $3`;
    case "PETTY_CASH_LIQUIDATION":
      return `SELECT l."tenantId", l."companyId", f."brandId", f."locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "PettyCashLiquidation" l JOIN "PettyCashFund" f ON f.id = l."pettyCashFundId" WHERE l.id = $1 AND l."tenantId" = $2 AND l."companyId" = $3`;
    case "PETTY_CASH_LIQUIDATION_LINE":
      return `SELECT l."tenantId", l."companyId", f."brandId", f."locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "PettyCashLiquidationLine" l JOIN "PettyCashFund" f ON f.id = l."pettyCashFundId" WHERE l.id = $1 AND l."tenantId" = $2 AND l."companyId" = $3`;
    case "FINANCE_CLOSE_RUN":
      return `SELECT "tenantId", "companyId", ${emptyScopeColumns} FROM "FinanceCloseRun" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "FINANCE_CLOSE_ITEM":
      return `SELECT "tenantId", "companyId", ${emptyScopeColumns} FROM "FinanceCloseChecklistItem" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "WORKFORCE_EMPLOYEE":
      return `SELECT "tenantId", "companyId", NULL::uuid AS "brandId", "homeLocationId" AS "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "Employee" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "WORKFORCE_ASSIGNMENT":
      return `SELECT "tenantId", "companyId", "brandId", "locationId", "departmentId", NULL::uuid AS "projectId" FROM "EmployeeAssignment" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "WORKFORCE_LEAVE":
      return `SELECT "tenantId", "companyId", NULL::uuid AS "brandId", "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "EmployeeLeaveRequest" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "WORKFORCE_OVERTIME":
      return `SELECT "tenantId", "companyId", NULL::uuid AS "brandId", "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "EmployeeOvertimeRecord" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "WORKFORCE_SCHEDULE":
      return `SELECT "tenantId", "companyId", "brandId", "locationId", "departmentId", NULL::uuid AS "projectId" FROM "WorkforceSchedule" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "WORKFORCE_ATTENDANCE_IMPORT":
      return `SELECT "tenantId", "companyId", "brandId", "locationId", NULL::uuid AS "departmentId", NULL::uuid AS "projectId" FROM "AttendanceImportBatch" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
    case "PROJECT_REQUIREMENT":
      return `SELECT "tenantId", "companyId", NULL::uuid AS "brandId", NULL::uuid AS "locationId", NULL::uuid AS "departmentId", "projectId" FROM "ProjectRequirement" WHERE id = $1 AND "tenantId" = $2 AND "companyId" = $3`;
  }
}

export function evidenceSourceMatchesActiveScope(
  source: EvidenceSourceScope,
  scopes: EvidenceAccessScope[],
) {
  const hasExactScope = (scopeType: string, scopeId: string | null) =>
    !scopeId ||
    scopes.some(
      (scope) => scope.scopeType === scopeType && scope.scopeId === scopeId,
    );
  return (
    hasExactScope("BRAND", source.brandId) &&
    hasExactScope("LOCATION", source.locationId) &&
    hasExactScope("DEPARTMENT", source.departmentId)
  );
}

async function evidenceSourceDimensionsMatchActiveCompany(
  session: SessionContext,
  source: EvidenceSourceScope,
) {
  const [location, brand, department] = await Promise.all([
    source.locationId
      ? prisma.location.findFirst({
          where: {
            id: source.locationId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
          },
          select: { brandId: true },
        })
      : null,
    source.brandId
      ? prisma.brand.findFirst({
          where: {
            id: source.brandId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : null,
    source.departmentId
      ? prisma.department.findFirst({
          where: {
            id: source.departmentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : null,
  ]);

  if (source.locationId && !location) return false;
  if (source.brandId && !brand) return false;
  if (source.departmentId && !department) return false;
  if (source.brandId && source.locationId && location?.brandId !== source.brandId) {
    return false;
  }
  return true;
}

export async function assertControlledEvidenceSourceAccess(
  session: SessionContext,
  sourceType: EvidenceAttachmentSourceType,
  sourceRecordId: string,
) {
  const query = evidenceSourceScopeQuery(sourceType)
    .replaceAll("$1", "$1::uuid")
    .replaceAll("$2", "$2::uuid")
    .replaceAll("$3", "$3::uuid");
  const rows = await prisma.$queryRawUnsafe<EvidenceSourceScope[]>(
    query,
    sourceRecordId,
    session.context.tenantId,
    session.context.companyId,
  );
  const source = rows[0];
  if (!source) {
    throw new Error("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
  }

  if (!(await evidenceSourceDimensionsMatchActiveCompany(session, source))) {
    throw new Error("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
  }

  if (sourceType.startsWith("WORKFORCE_")) {
    try {
      await assertWorkforceSourceScopeAccess(session, source);
    } catch {
      throw new Error("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    }
    return;
  }

  const now = new Date();
  const scopes = await prisma.userScopeAssignment.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: { scopeType: true, scopeId: true },
  });
  if (
    sourceType !== "PROJECT_REQUIREMENT" &&
    !evidenceSourceMatchesActiveScope(source, scopes)
  ) {
    throw new Error("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
  }

  if (source.projectId) {
    const project = await findAuthorizedProject(session, source.projectId);
    if (!project) {
      throw new Error("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    }
  }
}

async function logControlledEvidenceAttachmentDenied(input: {
  session: SessionContext;
  sourceType?: string;
  sourceRecordId?: string;
  attachmentId?: string;
  reasonCode: string;
  attemptedAction: "LINK" | "ARCHIVE" | "LIST" | "DOWNLOAD";
}) {
  const fallbackEntityId = "00000000-0000-0000-0000-000000000000";
  const entityId = z.string().uuid().safeParse(input.sourceRecordId).success
    ? (input.sourceRecordId ?? fallbackEntityId)
    : fallbackEntityId;

  await prisma.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: "controlled_evidence_attachment.denied",
      entityType: "ControlledEvidenceAttachment",
      entityId,
      metadata: {
        attemptedAction: input.attemptedAction,
        reasonCode: input.reasonCode,
        sourceType: input.sourceType ?? null,
        attachmentId: input.attachmentId ?? null,
        source: "phase3-controlled-evidence",
      },
    },
  });
}

async function authorizeControlledEvidenceSourceAction(input: {
  session: SessionContext;
  sourceType: EvidenceAttachmentSourceType;
  sourceRecordId: string;
  attemptedAction: "LINK" | "ARCHIVE" | "LIST";
}) {
  try {
    if (input.attemptedAction === "LIST") {
      await requireAnyPermission(
        input.session,
        requiredViewPermissionsForSourceType(input.sourceType),
      );
    } else {
      await requireCanonicalEvidenceWritePermission(input);
    }
    await assertControlledEvidenceSourceAccess(
      input.session,
      input.sourceType,
      input.sourceRecordId,
    );
  } catch (error) {
    await logControlledEvidenceAttachmentDenied({
      session: input.session,
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      reasonCode:
        error instanceof Error ? error.message : "CONTROLLED_EVIDENCE_ACCESS_DENIED",
      attemptedAction: input.attemptedAction,
    });
    throw error;
  }
}

export async function listControlledEvidenceAttachments(
  input: ListControlledEvidenceAttachmentInput,
) {
  const session = await requireSessionContext();
  await authorizeControlledEvidenceSourceAction({
    session,
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    attemptedAction: "LIST",
  });
  const companyId = assertCompanySession(session);
  const sourceKey = input.sourceLineId
    ? buildEvidenceSourceKey({
        sourceRecordId: input.sourceRecordId,
        sourceLineId: input.sourceLineId,
      })
    : null;

  const rows = await prisma.controlledEvidenceAttachment.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId,
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      ...(sourceKey ? { sourceKey } : {}),
      status: "ACTIVE",
      archivedAt: null,
    },
    include: {
      attachment: {
        select: {
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        storageProvider: true,
      },
    },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map(controlledEvidenceAttachmentRow);
}

export async function linkControlledEvidenceAttachment(
  input: LinkControlledEvidenceAttachmentInput,
) {
  const session = await requireSessionContext();
  await authorizeControlledEvidenceSourceAction({
    session,
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    attemptedAction: "LINK",
  });
  const companyId = assertCompanySession(session);
  const validation = validateEvidenceAttachmentLinkInput({
    tenantId: session.context.tenantId,
    companyId,
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    sourceLineId: input.sourceLineId,
    attachmentId: input.attachmentId,
    purpose: input.purpose,
    caption: input.caption,
    requiredForAction: input.requiredForAction,
  });

  if (!validation.normalized) {
    await logControlledEvidenceAttachmentDenied({
      session,
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      attachmentId: input.attachmentId,
      reasonCode: "CONTROLLED_EVIDENCE_ATTACHMENT_INPUT_INVALID",
      attemptedAction: "LINK",
    });
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_INPUT_INVALID");
  }

  const values = validation.normalized;
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: values.attachmentId,
      tenantId: values.tenantId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      storageProvider: true,
    },
  });

  if (!attachment) {
    await logControlledEvidenceAttachmentDenied({
      session,
      sourceType: values.sourceType,
      sourceRecordId: values.sourceRecordId,
      attachmentId: values.attachmentId,
      reasonCode: "ATTACHMENT_NOT_FOUND_INACTIVE_OR_UNSCOPED",
      attemptedAction: "LINK",
    });
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_NOT_FOUND");
  }

  const link = await prisma.$transaction(async (tx) => {
    const existing = await tx.controlledEvidenceAttachment.findFirst({
      where: {
        tenantId: values.tenantId,
        companyId: values.companyId,
        sourceType: values.sourceType,
        sourceKey: values.sourceKey,
        attachmentId: values.attachmentId,
      },
      include: {
        attachment: {
          select: {
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            storageProvider: true,
          },
        },
      },
    });

    if (existing?.status === "ACTIVE" && !existing.archivedAt) {
      return existing;
    }

    const saved = existing
      ? await tx.controlledEvidenceAttachment.update({
          where: { id: existing.id },
          data: {
            purpose: values.purpose,
            caption: values.caption,
            requiredForAction: values.requiredForAction,
            status: "ACTIVE",
            archivedAt: null,
            archivedByUserId: null,
            archiveReason: null,
          },
          include: {
            attachment: {
              select: {
                originalFilename: true,
                mimeType: true,
                sizeBytes: true,
                storageProvider: true,
              },
            },
          },
        })
      : await tx.controlledEvidenceAttachment.create({
          data: {
            tenantId: values.tenantId,
            companyId: values.companyId,
            sourceType: values.sourceType,
            sourceRecordId: values.sourceRecordId,
            sourceLineId: values.sourceLineId,
            sourceKey: values.sourceKey,
            attachmentId: values.attachmentId,
            purpose: values.purpose,
            caption: values.caption,
            requiredForAction: values.requiredForAction,
            createdByUserId: session.user.id,
          },
          include: {
            attachment: {
              select: {
                originalFilename: true,
                mimeType: true,
                sizeBytes: true,
                storageProvider: true,
              },
            },
          },
        });

    await tx.auditEvent.create({
      data: {
        tenantId: values.tenantId,
        companyId: values.companyId,
        actorUserId: session.user.id,
        eventType: existing
          ? "controlled_evidence_attachment.relinked"
          : "controlled_evidence_attachment.linked",
        entityType: "ControlledEvidenceAttachment",
        entityId: saved.id,
        afterData: {
          sourceType: saved.sourceType,
          sourceRecordId: saved.sourceRecordId,
          sourceLineId: saved.sourceLineId,
          sourceKey: saved.sourceKey,
          attachmentId: saved.attachmentId,
          purpose: saved.purpose,
          requiredForAction: saved.requiredForAction,
          originalFilename: attachment.originalFilename,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        },
        metadata: {
          source: "phase3-controlled-evidence",
          noSourceMutation: true,
          noBinaryUpload: true,
          blockerId: phase3EvidenceUploadBlockerId,
        },
      },
    });

    return saved;
  });

  return controlledEvidenceAttachmentRow(link);
}

export async function createControlledEvidenceAttachmentMetadataLink(
  input: CreateControlledEvidenceAttachmentMetadataLinkInput,
) {
  const session = await requireSessionContext();
  await authorizeControlledEvidenceSourceAction({
    session,
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    attemptedAction: "LINK",
  });
  const companyId = assertCompanySession(session);
  const metadata = validateAttachmentMetadata(input.attachment);
  if (!metadata.normalized) {
    await logControlledEvidenceAttachmentDenied({
      session,
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      reasonCode: "CONTROLLED_EVIDENCE_ATTACHMENT_METADATA_INVALID",
      attemptedAction: "LINK",
    });
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_METADATA_INVALID");
  }

  const attachmentId = randomUUID();
  const validation = validateEvidenceAttachmentLinkInput({
    tenantId: session.context.tenantId,
    companyId,
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    sourceLineId: input.sourceLineId,
    attachmentId,
    purpose: input.purpose,
    caption: input.caption,
    requiredForAction: input.requiredForAction,
  });

  if (!validation.normalized) {
    await logControlledEvidenceAttachmentDenied({
      session,
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      attachmentId,
      reasonCode: "CONTROLLED_EVIDENCE_ATTACHMENT_INPUT_INVALID",
      attemptedAction: "LINK",
    });
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_INPUT_INVALID");
  }

  const values = validation.normalized;
  const attachmentValues = metadata.normalized;
  const link = await prisma.$transaction(async (tx) => {
    const attachment = await tx.attachment.create({
      data: {
        id: attachmentId,
        tenantId: session.context.tenantId,
        storageProvider: attachmentValues.storageProvider,
        objectKey: attachmentValues.objectKey,
        originalFilename: attachmentValues.originalFilename,
        mimeType: attachmentValues.mimeType,
        sizeBytes: attachmentValues.sizeBytes,
        checksum: attachmentValues.checksum?.trim() || null,
        uploadedByUserId: session.user.id,
      },
    });
    const saved = await tx.controlledEvidenceAttachment.create({
      data: {
        tenantId: values.tenantId,
        companyId: values.companyId,
        sourceType: values.sourceType,
        sourceRecordId: values.sourceRecordId,
        sourceLineId: values.sourceLineId,
        sourceKey: values.sourceKey,
        attachmentId: attachment.id,
        purpose: values.purpose,
        caption: values.caption,
        requiredForAction: values.requiredForAction,
        createdByUserId: session.user.id,
      },
      include: {
        attachment: {
          select: {
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            storageProvider: true,
          },
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: values.tenantId,
        companyId: values.companyId,
        actorUserId: session.user.id,
        eventType: "controlled_evidence_attachment.metadata_linked",
        entityType: "ControlledEvidenceAttachment",
        entityId: saved.id,
        afterData: {
          sourceType: saved.sourceType,
          sourceRecordId: saved.sourceRecordId,
          sourceLineId: saved.sourceLineId,
          sourceKey: saved.sourceKey,
          attachmentId: saved.attachmentId,
          purpose: saved.purpose,
          requiredForAction: saved.requiredForAction,
          originalFilename: attachment.originalFilename,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          storageProvider: attachment.storageProvider,
        },
        metadata: {
          source: "phase3-controlled-evidence",
          noSourceMutation: true,
          noBinaryUpload: true,
          metadataOnly: true,
          blockerId: phase3EvidenceUploadBlockerId,
        },
      },
    });

    return saved;
  });

  return controlledEvidenceAttachmentRow(link);
}

export async function createControlledEvidenceAttachmentUploadLink(
  input: CreateControlledEvidenceAttachmentUploadLinkInput,
) {
  const session = await requireSessionContext();
  await authorizeControlledEvidenceSourceAction({
    session,
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    attemptedAction: "LINK",
  });
  const companyId = assertCompanySession(session);
  const evidenceStoragePolicy = await getControlledEvidenceStoragePolicy(session);
  const policyMaxSizeBytes =
    evidenceStoragePolicy.policy.uploadLimitMb * 1024 * 1024;
  if (input.file.size > policyMaxSizeBytes) {
    await logControlledEvidenceAttachmentDenied({
      session,
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      reasonCode: "CONTROLLED_EVIDENCE_ATTACHMENT_UPLOAD_POLICY_SIZE_EXCEEDED",
      attemptedAction: "LINK",
    });
    throw new Error(
      "CONTROLLED_EVIDENCE_ATTACHMENT_UPLOAD_POLICY_SIZE_EXCEEDED",
    );
  }
  const attachmentId = randomUUID();
  const originalFilename = sanitizeEvidenceFilename(input.file.name);
  const objectKey = buildPrivateEvidenceObjectKey({
    tenantId: session.context.tenantId,
    attachmentId,
    originalFilename,
  });
  const metadata = validateAttachmentMetadata({
    originalFilename,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
    storageProvider: privateAttachmentStorageProvider,
    objectKey,
    checksum: null,
  });

  if (!metadata.normalized) {
    await logControlledEvidenceAttachmentDenied({
      session,
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      reasonCode: "CONTROLLED_EVIDENCE_ATTACHMENT_UPLOAD_INVALID",
      attemptedAction: "LINK",
    });
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_UPLOAD_INVALID");
  }

  const validation = validateEvidenceAttachmentLinkInput({
    tenantId: session.context.tenantId,
    companyId,
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    sourceLineId: input.sourceLineId,
    attachmentId,
    purpose: input.purpose,
    caption: input.caption,
    requiredForAction: input.requiredForAction,
  });

  if (!validation.normalized) {
    await logControlledEvidenceAttachmentDenied({
      session,
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      attachmentId,
      reasonCode: "CONTROLLED_EVIDENCE_ATTACHMENT_INPUT_INVALID",
      attemptedAction: "LINK",
    });
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_INPUT_INVALID");
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (buffer.byteLength !== input.file.size) {
    await logControlledEvidenceAttachmentDenied({
      session,
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      attachmentId,
      reasonCode: "CONTROLLED_EVIDENCE_ATTACHMENT_UPLOAD_SIZE_MISMATCH",
      attemptedAction: "LINK",
    });
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_UPLOAD_SIZE_MISMATCH");
  }

  const checksum = `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
  const attachmentValues = {
    ...metadata.normalized,
    checksum,
  };
  const filePath = resolvePrivateAttachmentPath(attachmentValues.objectKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer, { flag: "wx" });

  try {
    const values = validation.normalized;
    const link = await prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          id: attachmentId,
          tenantId: session.context.tenantId,
          storageProvider: attachmentValues.storageProvider,
          objectKey: attachmentValues.objectKey,
          originalFilename: attachmentValues.originalFilename,
          mimeType: attachmentValues.mimeType,
          sizeBytes: attachmentValues.sizeBytes,
          checksum: attachmentValues.checksum,
          uploadedByUserId: session.user.id,
        },
      });
      const saved = await tx.controlledEvidenceAttachment.create({
        data: {
          tenantId: values.tenantId,
          companyId: values.companyId,
          sourceType: values.sourceType,
          sourceRecordId: values.sourceRecordId,
          sourceLineId: values.sourceLineId,
          sourceKey: values.sourceKey,
          attachmentId: attachment.id,
          purpose: values.purpose,
          caption: values.caption,
          requiredForAction: values.requiredForAction,
          createdByUserId: session.user.id,
        },
        include: {
          attachment: {
            select: {
              originalFilename: true,
              mimeType: true,
              sizeBytes: true,
              storageProvider: true,
            },
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          tenantId: values.tenantId,
          companyId: values.companyId,
          actorUserId: session.user.id,
          eventType: "controlled_evidence_attachment.uploaded",
          entityType: "ControlledEvidenceAttachment",
          entityId: saved.id,
          afterData: {
            sourceType: saved.sourceType,
            sourceRecordId: saved.sourceRecordId,
            sourceLineId: saved.sourceLineId,
            sourceKey: saved.sourceKey,
            attachmentId: saved.attachmentId,
            purpose: saved.purpose,
            requiredForAction: saved.requiredForAction,
            originalFilename: attachment.originalFilename,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            storageProvider: attachment.storageProvider,
            checksum: attachment.checksum,
          },
          metadata: {
            source: "phase3-controlled-evidence",
            noSourceMutation: true,
            binaryUpload: true,
            privateStorage: true,
            storagePolicyKey: evidenceStoragePolicy.key,
            storagePolicySourceDecisionId:
              evidenceStoragePolicy.sourceDecisionId,
            storagePolicyOverridden: evidenceStoragePolicy.isOverridden,
            configuredUploadLimitMb:
              evidenceStoragePolicy.policy.uploadLimitMb,
            allowedMimePolicy:
              evidenceStoragePolicy.policy.allowedMimePolicy,
            downloadAuditRequired:
              evidenceStoragePolicy.policy.downloadAuditRequired,
            malwareScanMode: evidenceStoragePolicy.policy.malwareScanMode,
            malwareScanWaiverReason:
              evidenceStoragePolicy.policy.malwareScanWaiverReason,
            retentionPolicy: evidenceStoragePolicy.policy.retentionPolicy,
            recoveryPolicy: evidenceStoragePolicy.policy.recoveryPolicy,
          },
        },
      });

      return saved;
    });

    return controlledEvidenceAttachmentRow(link);
  } catch (error) {
    await rm(filePath, { force: true });
    throw error;
  }
}

export async function downloadControlledEvidenceAttachment(
  input: DownloadControlledEvidenceAttachmentInput,
): Promise<ControlledEvidenceAttachmentDownload> {
  const session = await requireSessionContext();
  return downloadControlledEvidenceAttachmentForSession(session, input);
}

function controlledEvidenceDownloadDenialReason(error: unknown) {
  if (!(error instanceof Error)) return "CONTROLLED_EVIDENCE_DOWNLOAD_DENIED";
  if (error.message === "PERMISSION_DENIED") return "PERMISSION_DENIED";
  if (error.message === "CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE") {
    return "CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE";
  }
  if (error.message.includes("CHECKSUM")) return "ATTACHMENT_INTEGRITY_DENIED";
  if (error.message.includes("SIZE_MISMATCH")) return "ATTACHMENT_INTEGRITY_DENIED";
  return "CONTROLLED_EVIDENCE_DOWNLOAD_DENIED";
}

export async function downloadControlledEvidenceAttachmentForSession(
  session: SessionContext,
  input: DownloadControlledEvidenceAttachmentInput,
): Promise<ControlledEvidenceAttachmentDownload> {
  const companyId = assertCompanySession(session);
  const link = await prisma.controlledEvidenceAttachment.findFirst({
    where: {
      id: input.controlledEvidenceAttachmentId,
      tenantId: session.context.tenantId,
      companyId,
      status: "ACTIVE",
      archivedAt: null,
    },
    include: {
      attachment: {
        select: {
          id: true,
          storageProvider: true,
          objectKey: true,
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          checksum: true,
          status: true,
        },
      },
    },
  });

  if (!link || link.attachment.status !== "ACTIVE") {
    await logControlledEvidenceAttachmentDenied({
      session,
      reasonCode: "CONTROLLED_EVIDENCE_ATTACHMENT_LINK_NOT_FOUND",
      attemptedAction: "DOWNLOAD",
    });
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_LINK_NOT_FOUND");
  }

  const sourceType = link.sourceType as EvidenceAttachmentSourceType;
  let buffer: Buffer;
  try {
    await requireAnyPermission(
      session,
      requiredViewPermissionsForSourceType(sourceType),
    );
    await assertControlledEvidenceSourceAccess(
      session,
      sourceType,
      link.sourceRecordId,
    );

    if (link.attachment.storageProvider !== privateAttachmentStorageProvider) {
      throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_BINARY_NOT_AVAILABLE");
    }

    const filePath = resolvePrivateAttachmentPath(link.attachment.objectKey);
    buffer = await readFile(filePath);
    if (buffer.byteLength !== link.attachment.sizeBytes) {
      throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_SIZE_MISMATCH");
    }

    const checksum = `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
    if (link.attachment.checksum && link.attachment.checksum !== checksum) {
      throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_CHECKSUM_MISMATCH");
    }
  } catch (error) {
    await logControlledEvidenceAttachmentDenied({
      session,
      sourceType: link.sourceType,
      sourceRecordId: link.sourceRecordId,
      attachmentId: link.attachmentId,
      reasonCode: controlledEvidenceDownloadDenialReason(error),
      attemptedAction: "DOWNLOAD",
    });
    throw error;
  }

  await prisma.auditEvent.create({
    data: {
      tenantId: link.tenantId,
      companyId: link.companyId,
      actorUserId: session.user.id,
      eventType: "controlled_evidence_attachment.downloaded",
      entityType: "ControlledEvidenceAttachment",
      entityId: link.id,
      metadata: {
        source: "phase3-controlled-evidence",
        sourceType: link.sourceType,
        sourceRecordId: link.sourceRecordId,
        sourceLineId: link.sourceLineId,
        attachmentId: link.attachmentId,
        storageProvider: link.attachment.storageProvider,
        checksumVerified: Boolean(link.attachment.checksum),
      },
    },
  });

  return {
    buffer,
    originalFilename: link.attachment.originalFilename,
    mimeType: link.attachment.mimeType,
    sizeBytes: link.attachment.sizeBytes,
  };
}

export async function archiveControlledEvidenceAttachment(
  input: ArchiveControlledEvidenceAttachmentInput,
) {
  const session = await requireSessionContext();
  const companyId = assertCompanySession(session);
  const values = archiveControlledEvidenceAttachmentSchema.parse(input);
  const link = await prisma.controlledEvidenceAttachment.findFirst({
    where: {
      id: values.controlledEvidenceAttachmentId,
      tenantId: session.context.tenantId,
      companyId,
      status: "ACTIVE",
      archivedAt: null,
    },
    include: {
      attachment: {
        select: {
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          storageProvider: true,
        },
      },
    },
  });

  if (!link) {
    await logControlledEvidenceAttachmentDenied({
      session,
      reasonCode: "CONTROLLED_EVIDENCE_ATTACHMENT_LINK_NOT_FOUND",
      attemptedAction: "ARCHIVE",
    });
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE");
  }
  try {
    await authorizeControlledEvidenceSourceAction({
      session,
      sourceType: link.sourceType as EvidenceAttachmentSourceType,
      sourceRecordId: link.sourceRecordId,
      attemptedAction: "ARCHIVE",
    });
  } catch {
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE");
  }

  const archived = await prisma.$transaction(async (tx) => {
    const saved = await tx.controlledEvidenceAttachment.update({
      where: { id: link.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        archiveReason: values.archiveReason,
      },
      include: {
        attachment: {
          select: {
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            storageProvider: true,
          },
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: link.tenantId,
        companyId: link.companyId,
        actorUserId: session.user.id,
        eventType: "controlled_evidence_attachment.archived",
        entityType: "ControlledEvidenceAttachment",
        entityId: link.id,
        beforeData: {
          status: link.status,
          sourceType: link.sourceType,
          sourceRecordId: link.sourceRecordId,
          sourceLineId: link.sourceLineId,
          attachmentId: link.attachmentId,
          purpose: link.purpose,
          originalFilename: link.attachment.originalFilename,
        },
        afterData: {
          status: saved.status,
          archivedAt: saved.archivedAt?.toISOString() ?? null,
          archiveReason: saved.archiveReason,
        },
        metadata: {
          source: "phase3-controlled-evidence",
          noSourceMutation: true,
          noBinaryDelete: true,
          blockerId: phase3EvidenceUploadBlockerId,
        },
      },
    });

    return saved;
  });

  return controlledEvidenceAttachmentRow(archived);
}
