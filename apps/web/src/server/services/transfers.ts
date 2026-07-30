import { createHash, randomUUID } from "node:crypto";
import { prisma, Prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { TRANSFER_MAX_LINES } from "../../lib/workflowLimits";
import { canUseTransfers, permissions, requirePermission } from "./authorization";
import { assertAuthorizedLocation, requireSessionContext, type SessionContext } from "./context";
import type { CsvRow } from "./csv";
import {
  lockInventoryLocationsForPosting,
  postInventoryMovementInTransaction
} from "./inventory";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";
import {
  getAuthMode,
  getMfaStepUpMinutes,
  isMfaAssuranceFresh,
} from "./authentication";
import {
  dashboardTaskAfterWhere,
  type DashboardTaskCursor,
  type DashboardTaskFilter
} from "./dashboardTasks";
import { recordWorkflowNotifications } from "./notifications";
import {
  assertAnyEligibleApprovalActorForStep,
  configureApprovalStepRouting
} from "./approvalRouting";
import {
  terminatePendingApprovalForCancellation
} from "./approvalCancellation";
import { getApprovalRoutingPolicy } from "./approvalRoutingRegistry";
import { withApprovalProducerTransaction } from "./approvalProducerBarrier";
import {
  classifyInventoryTransferForPilotApproval,
  INVENTORY_PILOT_APPROVAL_ERRORS,
  inventoryPilotCanonicalJson
} from "./inventoryPilotApprovalPolicy";

const optionalDateSchema = z
  .string()
  .optional()
  .transform((value) => (value ? new Date(value) : undefined));

const createTransferSchema = z.object({
  sourceInventoryLocationId: z.string().uuid(),
  transferType: z.string().trim().min(2).max(80),
  purpose: z.string().trim().min(5).max(500),
  requiredByDate: optionalDateSchema
});

const createTransferLineSchema = z.object({
  itemId: z.string().uuid(),
  requestedQty: z.coerce.number().positive(),
  notes: z.string().trim().max(1000).optional()
});

type TransferLineDraft = {
  lineNumber: number;
  item: {
    id: string;
    itemName: string;
    baseUomId: string;
  };
  requestedQty: number;
  notes: string | null;
};

const transferActionSchema = z.object({
  id: z.string().uuid(),
  // Legacy transfers do not require this field while the pilot is disabled.
  // An admitted approval submission requires it below, after classification.
  idempotencyKey: z.string().trim().min(16).max(200).optional()
});

const receiveTransferSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().trim().min(16).max(200),
  notes: z.string().trim().max(1000).optional()
});

type LockedTransferAuthoritySession = {
  status: string;
  assuranceLevel: string;
  mfaAuthenticatedAt: Date | null;
  privilegeEpochAtIssue: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
};

/**
 * Transfer receipt/reversal actions are stock-affecting. Recheck the live
 * principal, session, permission, and destination scope after inventory and
 * transfer locks are held so a revoked actor cannot post from a stale
 * request context. Local MFA is evaluated from the locked AuthSession rather
 * than the request snapshot; the privileged-MFA guard still records the
 * configured external-enforcement evidence.
 */
async function assertFreshTransferReceiptAuthority(
  tx: TransactionClient,
  session: SessionContext,
  permissionCode: string,
  destinationLocationId: string,
) {
  if (destinationLocationId !== session.context.locationId) {
    throw new Error("SCOPE_DENIED");
  }
  const now = new Date();
  const principals = await tx.$queryRaw<
    Array<{ status: string; privilegeEpoch: number }>
  >`
    SELECT status, "privilegeEpoch"
      FROM "User"
     WHERE id = ${session.user.id}::uuid
       AND "tenantId" = ${session.context.tenantId}::uuid
     FOR SHARE
  `;
  const principal = principals[0];
  if (!principal || principal.status !== "ACTIVE") {
    throw new Error("AUTH_REQUIRED");
  }

  let liveSession: LockedTransferAuthoritySession | null = null;
  if (session.authentication?.sessionId) {
    const sessions = await tx.$queryRaw<LockedTransferAuthoritySession[]>`
      SELECT status, "assuranceLevel", "mfaAuthenticatedAt",
             "privilegeEpochAtIssue", "idleExpiresAt", "absoluteExpiresAt"
        FROM "AuthSession"
       WHERE id = ${session.authentication.sessionId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "userId" = ${session.user.id}::uuid
       FOR SHARE
    `;
    liveSession = sessions[0] ?? null;
  }
  if (
    session.authentication?.sessionId &&
    (!liveSession ||
      liveSession.status !== "ACTIVE" ||
      liveSession.privilegeEpochAtIssue !== principal.privilegeEpoch ||
      liveSession.idleExpiresAt <= now ||
      liveSession.absoluteExpiresAt <= now)
  ) {
    throw new Error("AUTH_REQUIRED");
  }
  if (getAuthMode() === "local" && !liveSession) {
    throw new Error("AUTH_REQUIRED");
  }

  const roleAssignments = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT ura.id
      FROM "UserRoleAssignment" ura
      JOIN "Role" r ON r.id = ura."roleId"
      JOIN "RolePermission" rp ON rp."roleId" = r.id
      JOIN "Permission" p ON p.id = rp."permissionId"
     WHERE ura."userId" = ${session.user.id}::uuid
       AND ura.status = 'ACTIVE'::"RecordStatus"
       AND ura."startsAt" <= ${now}
       AND (ura."endsAt" IS NULL OR ura."endsAt" > ${now})
       AND r.status = 'ACTIVE'::"RecordStatus"
       AND (r."tenantId" IS NULL OR r."tenantId" = ${session.context.tenantId}::uuid)
       AND p.code = ${permissionCode}
       AND (p."tenantId" IS NULL OR p."tenantId" = ${session.context.tenantId}::uuid)
     ORDER BY ura.id ASC
     LIMIT 1
  `;
  if (!roleAssignments[0]) {
    throw new Error("PERMISSION_DENIED");
  }

  const locationScopes = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT usa.id
      FROM "UserScopeAssignment" usa
      JOIN "Location" l ON l.id = usa."scopeId"
     WHERE usa."userId" = ${session.user.id}::uuid
       AND usa."scopeType" = 'LOCATION'::"ScopeType"
       AND usa."scopeId" = ${destinationLocationId}::uuid
       AND usa.status = 'ACTIVE'::"RecordStatus"
       AND usa."startsAt" <= ${now}
       AND (usa."endsAt" IS NULL OR usa."endsAt" > ${now})
       AND l."tenantId" = ${session.context.tenantId}::uuid
       AND l."companyId" = ${session.context.companyId}::uuid
       AND l.status = 'ACTIVE'::"RecordStatus"
     ORDER BY usa.id ASC
     LIMIT 1
  `;
  if (!locationScopes[0]) {
    throw new Error("SCOPE_DENIED");
  }

  if (
    getAuthMode() === "local" &&
    (!liveSession ||
      !isMfaAssuranceFresh({
        assuranceLevel: liveSession.assuranceLevel,
        mfaAuthenticatedAt: liveSession.mfaAuthenticatedAt,
        freshnessMinutes: getMfaStepUpMinutes(),
        now,
      }))
  ) {
    throw new Error("PRIVILEGED_MFA_STEP_UP_REQUIRED");
  }
}

type TransferReceiptHashLine = {
  lineId: string;
  sourceInventoryLocationId: string;
  destinationInventoryLocationId: string;
  acceptedQty: number;
  rejectedQty: number;
  damagedQty: number;
  discrepancyQty: number;
  discrepancyType: string | null;
  discrepancyReason: string | null;
  evidenceReference: string | null;
};

type TransferApprovalSubmissionHashLine = {
  id: string;
  itemId: string;
  sourceInventoryLocationId: string;
  destinationInventoryLocationId: string;
  lineNumber: number;
  requestedQty: Prisma.Decimal;
  uomId: string;
  description: string;
  notes: string | null;
};

type TransferApprovalSubmissionSource = {
  id: string;
  tenantId: string;
  companyId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  requestedByUserId: string;
  publicReference: string;
  transferType: string;
  purpose: string;
  requiredByDate: Date | null;
  status: string;
  version: number;
  lines: TransferApprovalSubmissionHashLine[];
};

type LockedTransferApprovalSubmissionSource =
  TransferApprovalSubmissionSource & { updatedAt: Date };

function canonicalTransferApprovalQuantity(value: Prisma.Decimal) {
  return value.toFixed(6);
}

/**
 * The intent pins the editable, pre-transition source image. This deliberately
 * excludes generated timestamps and presentation-only relations so a retry can
 * prove the exact business source rather than an incidental database shape.
 */
export function inventoryTransferApprovalSourceCanonicalJson(
  transfer: TransferApprovalSubmissionSource
) {
  return inventoryPilotCanonicalJson({
    schemaVersion: 1,
    documentType: "InventoryTransfer",
    id: transfer.id,
    tenantId: transfer.tenantId,
    companyId: transfer.companyId,
    sourceLocationId: transfer.sourceLocationId,
    destinationLocationId: transfer.destinationLocationId,
    requestedByUserId: transfer.requestedByUserId,
    publicReference: transfer.publicReference,
    transferType: transfer.transferType,
    purpose: transfer.purpose,
    requiredByDate: transfer.requiredByDate?.toISOString() ?? null,
    status: transfer.status,
    version: transfer.version,
    lines: [...transfer.lines]
      .sort((left, right) =>
        left.lineNumber - right.lineNumber || left.id.localeCompare(right.id)
      )
      .map((line) => ({
        id: line.id,
        itemId: line.itemId,
        sourceInventoryLocationId: line.sourceInventoryLocationId,
        destinationInventoryLocationId: line.destinationInventoryLocationId,
        lineNumber: line.lineNumber,
        requestedQty: canonicalTransferApprovalQuantity(line.requestedQty),
        uomId: line.uomId,
        description: line.description,
        notes: line.notes ?? null
      }))
  });
}

export function hashInventoryTransferApprovalSource(
  transfer: TransferApprovalSubmissionSource
) {
  return createHash("sha256")
    .update(inventoryTransferApprovalSourceCanonicalJson(transfer), "utf8")
    .digest("hex");
}

export function inventoryTransferApprovalRequestCanonicalJson(input: {
  transferId: string;
  submitterUserId: string;
  idempotencyKey: string;
}) {
  return inventoryPilotCanonicalJson({
    schemaVersion: 1,
    action: "inventory-transfer-approval-submit",
    documentType: "InventoryTransfer",
    transferId: input.transferId,
    submitterUserId: input.submitterUserId,
    idempotencyKey: input.idempotencyKey
  });
}

export function hashInventoryTransferApprovalRequest(input: {
  transferId: string;
  submitterUserId: string;
  idempotencyKey: string;
}) {
  return createHash("sha256")
    .update(inventoryTransferApprovalRequestCanonicalJson(input), "utf8")
    .digest("hex");
}

/**
 * The environment switch is a denial switch, not an authorization source. If
 * a sealed database activation is already live, a disabled process must still
 * classify the locked source to decide whether it belongs to that cohort. A
 * matching source is denied; only an exact non-cohort scope mismatch may keep
 * using the legacy workflow. Configuration drift remains fail-closed.
 */
async function assertDisabledTransferSubmissionCanUseLegacy(
  tx: TransactionClient,
  transfer: LockedTransferApprovalSubmissionSource
) {
  const activeActivations = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH activation_guard AS MATERIALIZED (
      SELECT pg_advisory_xact_lock_shared(
        hashtextextended(
          ${transfer.tenantId}::text || ':' || ${transfer.companyId}::text || ':inventory-pilot-activation',
          0
        )
      ) AS locked
    )
    SELECT a."id"
    FROM activation_guard
    CROSS JOIN "InventoryPilotFamilyActivation" a
    WHERE a."tenantId" = ${transfer.tenantId}::uuid
      AND a."companyId" = ${transfer.companyId}::uuid
      AND a."family" = 'InventoryTransfer'::"InventoryPilotApprovalFamily"
      AND a.status = 'ACTIVE'::"InventoryPilotActivationStatus"
    ORDER BY a."id" ASC
  `);
  if (activeActivations.length === 0) return;
  if (activeActivations.length !== 1) {
    throw new Error(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
  }

  try {
    await classifyInventoryTransferForPilotApproval({
      tx,
      transfer: {
        id: transfer.id,
        tenantId: transfer.tenantId,
        companyId: transfer.companyId,
        version: transfer.version,
        status: transfer.status,
        sourceLocationId: transfer.sourceLocationId,
        destinationLocationId: transfer.destinationLocationId,
        lines: transfer.lines.map((line) => ({
          id: line.id,
          tenantId: transfer.tenantId,
          companyId: transfer.companyId,
          itemId: line.itemId,
          sourceInventoryLocationId: line.sourceInventoryLocationId,
          destinationInventoryLocationId: line.destinationInventoryLocationId
        }))
      },
      stage: "SUBMIT",
      environment: {
        ...process.env,
        INVENTORY_TRANSFER_APPROVAL_V1_ENABLED: "true"
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH
    ) {
      return;
    }
    throw error;
  }

  throw new Error(INVENTORY_PILOT_APPROVAL_ERRORS.DISABLED);
}

function canonicalReceiptQuantity(value: number) {
  return value.toFixed(6);
}

export function hashInventoryTransferReceiptRequest(input: {
  actorUserId: string;
  destinationLocationId: string;
  transferId: string;
  notes?: string | null;
  lines: TransferReceiptHashLine[];
}) {
  const payload = {
    version: "inventory-transfer-receipt-v1",
    actorUserId: input.actorUserId,
    destinationLocationId: input.destinationLocationId,
    transferId: input.transferId,
    notes: input.notes?.trim() || null,
    lines: [...input.lines]
      .sort((left, right) => left.lineId.localeCompare(right.lineId))
      .map((line) => ({
        lineId: line.lineId,
        sourceInventoryLocationId: line.sourceInventoryLocationId,
        destinationInventoryLocationId: line.destinationInventoryLocationId,
        acceptedQty: canonicalReceiptQuantity(line.acceptedQty),
        rejectedQty: canonicalReceiptQuantity(line.rejectedQty),
        damagedQty: canonicalReceiptQuantity(line.damagedQty),
        discrepancyQty: canonicalReceiptQuantity(line.discrepancyQty),
        discrepancyType: line.discrepancyType?.trim() || null,
        discrepancyReason: line.discrepancyReason?.trim() || null,
        evidenceReference: line.evidenceReference?.trim() || null
      }))
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function receiptRequestHashFromForm(
  transfer: {
    id: string;
    destinationLocationId: string;
    lines: Array<{
      id: string;
      dispatchedQty: unknown;
      receivedQty: unknown;
      rejectedQty: unknown;
      damagedQty: unknown;
      discrepancyQty: unknown;
      sourceInventoryLocationId: string;
      destinationInventoryLocationId: string;
    }>;
  },
  session: SessionContext,
  formData: FormData,
  notes: string | null | undefined
) {
  return hashInventoryTransferReceiptRequest({
    actorUserId: session.user.id,
    destinationLocationId: transfer.destinationLocationId,
    transferId: transfer.id,
    notes: notes ?? null,
    lines: transfer.lines.map((line) => ({
      lineId: line.id,
      sourceInventoryLocationId: line.sourceInventoryLocationId,
      destinationInventoryLocationId: line.destinationInventoryLocationId,
      acceptedQty:
        parseReceiptQuantity(formData, line.id, "acceptedQty") ??
        0,
      rejectedQty: parseReceiptQuantity(formData, line.id, "rejectedQty") ?? 0,
      damagedQty: parseReceiptQuantity(formData, line.id, "damagedQty") ?? 0,
      discrepancyQty:
        parseReceiptQuantity(formData, line.id, "discrepancyQty") ?? 0,
      discrepancyType:
        String(formData.get(`lines.${line.id}.discrepancyType`) ?? "").trim() || null,
      discrepancyReason:
        String(formData.get(`lines.${line.id}.discrepancyReason`) ?? "").trim() || null,
      evidenceReference:
        String(formData.get(`lines.${line.id}.evidenceReference`) ?? "").trim() || null
    }))
  });
}

const reverseTransferReceiptSchema = z.object({
  id: z.string().uuid(),
  receiptId: z.string().uuid(),
  reversalReason: z.string().trim().min(5).max(500)
});

const settleTransferDiscrepancySchema = z.object({
  id: z.string().uuid(),
  settlementReason: z.string().trim().min(5).max(1000),
  evidenceReference: z.string().trim().min(3).max(160),
  settlementType: z
    .enum(["INVESTIGATION_CLOSED", "REPLACEMENT_TRANSFER", "ADJUSTMENT_LINKED"])
    .default("INVESTIGATION_CLOSED")
});

const cancelTransferSchema = z.object({
  id: z.string().uuid(),
  cancellationReason: z.string().trim().min(5).max(500)
});

export function assertTransferLocationsDistinct(
  sourceLocationId: string,
  destinationLocationId: string
) {
  if (sourceLocationId === destinationLocationId) {
    throw new Error("TRANSFER_SOURCE_DESTINATION_MUST_DIFFER");
  }
}

export function assertPositiveTransferQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("TRANSFER_QUANTITY_INVALID");
  }
}

export function assertTransferCanSubmit(status: string) {
  if (status !== "DRAFT") {
    throw new Error("TRANSFER_NOT_DRAFT_FOR_SUBMIT");
  }
}

export function assertTransferCanCancel(status: string) {
  if (!["DRAFT", "REQUESTED", "PENDING_APPROVAL"].includes(status)) {
    throw new Error("TRANSFER_NOT_CANCELLABLE");
  }
}

/**
 * A person who approved any cycle of this transfer must not later obtain
 * custody through dispatch or receipt. Query inside the already-locked posting
 * transaction so a role/scope change cannot convert historical approval into a
 * physical-custody bypass.
 */
async function assertTransferActorWasNotApprover(
  tx: TransactionClient,
  input: {
    tenantId: string;
    companyId: string;
    transferId: string;
    actorUserId: string;
    action: "DISPATCH" | "RECEIVE";
  }
) {
  const approvedSteps = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s."id"
    FROM "ApprovalInstanceStep" s
    JOIN "ApprovalInstance" ai ON ai."id" = s."approvalInstanceId"
    WHERE ai."tenantId" = ${input.tenantId}::uuid
      AND ai."companyId" = ${input.companyId}::uuid
      AND ai."documentType" = 'InventoryTransfer'
      AND ai."documentId" = ${input.transferId}::uuid
      AND s."actedByUserId" = ${input.actorUserId}::uuid
      AND s.status = 'APPROVED'::"ApprovalStepStatus"
    ORDER BY ai."createdAt" ASC, ai."id" ASC, s."stepOrder" ASC, s."id" ASC
    LIMIT 1
    FOR SHARE OF s, ai
  `);
  if (approvedSteps[0]) {
    throw new Error(
      input.action === "DISPATCH"
        ? "TRANSFER_APPROVER_CANNOT_DISPATCH"
        : "TRANSFER_APPROVER_CANNOT_RECEIVE"
    );
  }
}

export function assertTransferCanDispatch(status: string) {
  if (status !== "REQUESTED") {
    throw new Error("TRANSFER_NOT_REQUESTED_FOR_DISPATCH");
  }
}

export function assertTransferCanReceive(status: string) {
  if (!["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"].includes(status)) {
    throw new Error("TRANSFER_NOT_DISPATCHED_FOR_RECEIPT");
  }
}

export function assertTransferCanSettleDiscrepancy(input: {
  status: string;
  hasDiscrepancy: boolean;
  actorUserId: string;
  requestedByUserId: string;
  dispatchedByUserId?: string | null;
  activeReceiptReceiverUserIds: string[];
}) {
  if (input.status !== "DISPUTED") {
    throw new Error("TRANSFER_DISCREPANCY_NOT_SETTLEABLE");
  }
  if (!input.hasDiscrepancy) {
    throw new Error("TRANSFER_DISCREPANCY_NOT_FOUND");
  }
  if (input.actorUserId === input.requestedByUserId) {
    throw new Error("TRANSFER_DISCREPANCY_SELF_SETTLEMENT_NOT_ALLOWED");
  }
  if (input.dispatchedByUserId && input.actorUserId === input.dispatchedByUserId) {
    throw new Error("TRANSFER_DISCREPANCY_DISPATCHER_SETTLEMENT_NOT_ALLOWED");
  }
  if (input.activeReceiptReceiverUserIds.includes(input.actorUserId)) {
    throw new Error("TRANSFER_DISCREPANCY_RECEIVER_SETTLEMENT_NOT_ALLOWED");
  }
}

export function assertTransferReceiptCanReverse(
  status: string,
  reversedAt?: unknown
) {
  if (status === "REVERSED" || reversedAt) {
    throw new Error("TRANSFER_RECEIPT_ALREADY_REVERSED");
  }
  if (status !== "POSTED") {
    throw new Error("TRANSFER_RECEIPT_NOT_POSTED_FOR_REVERSAL");
  }
}

function parseReceiptQuantity(formData: FormData, lineId: string, field: string) {
  const value = formData.get(`lines.${lineId}.${field}`);
  if (value === null || String(value).trim() === "") {
    return undefined;
  }
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("TRANSFER_RECEIPT_QUANTITY_INVALID");
  }
  return quantity;
}

function requiredFormValues(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function optionalFormValues(formData: FormData, name: string, count: number) {
  const values = formData.getAll(name).map((value) => String(value).trim());
  return Array.from({ length: count }, (_, index) => values[index] ?? "");
}

function parseTransferLines(formData: FormData) {
  const itemIds = requiredFormValues(formData, "lineItemId");
  const requestedQtys = requiredFormValues(formData, "lineRequestedQty");
  const notes = optionalFormValues(formData, "lineNotes", itemIds.length);

  if (itemIds.length === 0) {
    throw new Error("TRANSFER_HAS_NO_LINES");
  }
  if (itemIds.length > TRANSFER_MAX_LINES) {
    throw new Error("TRANSFER_TOO_MANY_LINES");
  }
  if (requestedQtys.length !== itemIds.length) {
    throw new Error("TRANSFER_LINE_REQUIRED");
  }

  return itemIds.map((itemId, index) =>
    createTransferLineSchema.parse({
      itemId,
      requestedQty: requestedQtys[index],
      notes: notes[index] || undefined
    })
  );
}

export function assertTransferReceiptQuantities(input: {
  acceptedQty: number;
  rejectedQty: number;
  damagedQty: number;
  discrepancyQty: number;
  remainingQty: number;
  discrepancyReason?: string | null;
  evidenceReference?: string | null;
}) {
  const quantities = [
    input.acceptedQty,
    input.rejectedQty,
    input.damagedQty,
    input.discrepancyQty,
    input.remainingQty
  ];
  if (quantities.some((quantity) => !Number.isFinite(quantity) || quantity < 0)) {
    throw new Error("TRANSFER_RECEIPT_QUANTITY_INVALID");
  }

  const capturedQty =
    input.acceptedQty +
    input.rejectedQty +
    input.damagedQty +
    input.discrepancyQty;
  if (capturedQty > input.remainingQty) {
    throw new Error("TRANSFER_RECEIPT_EXCEEDS_DISPATCHED");
  }
  if (
    input.rejectedQty + input.damagedQty + input.discrepancyQty > 0 &&
    (!input.discrepancyReason || input.discrepancyReason.trim().length < 5)
  ) {
    throw new Error("TRANSFER_RECEIPT_DISCREPANCY_REASON_REQUIRED");
  }
  if (
    input.rejectedQty + input.damagedQty + input.discrepancyQty > 0 &&
    (!input.evidenceReference || input.evidenceReference.trim().length < 3)
  ) {
    throw new Error("TRANSFER_RECEIPT_DISCREPANCY_EVIDENCE_REQUIRED");
  }
}

export function calculateTransferReceiptStatus(
  lines: Array<{
    dispatchedQty: number;
    receivedQty: number;
    rejectedQty: number;
    damagedQty: number;
    discrepancyQty: number;
  }>
) {
  const hasDiscrepancy = lines.some(
    (line) => line.rejectedQty + line.damagedQty + line.discrepancyQty > 0
  );
  if (hasDiscrepancy) {
    return "DISPUTED";
  }

  const hasDispatched = lines.some((line) => line.dispatchedQty > 0);
  const allReceived =
    hasDispatched &&
    lines.every(
      (line) => line.dispatchedQty > 0 && line.receivedQty >= line.dispatchedQty
    );
  if (allReceived) {
    return "RECEIVED";
  }

  const hasReceipt = lines.some((line) => line.receivedQty > 0);
  return hasReceipt ? "PARTIALLY_RECEIVED" : "DISPATCHED";
}

async function nextTransferReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.inventoryTransfer.count({
    where: {
      companyId,
      publicReference: { startsWith: `TR-${year}-` }
    }
  });
  return `TR-${year}-${String(count + 1).padStart(5, "0")}`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isTransferReceiptIdempotencyUniqueConstraintError(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error)
  ) {
    return false;
  }
  if ((error as { code?: unknown }).code === "P2010") {
    const message =
      "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
    return (
      message.includes("23505") &&
      message.includes("InventoryTransferReceipt_tenantId_companyId_idempotencyKey")
    );
  }
  if (!isUniqueConstraintError(error)) return false;
  const meta =
    "meta" in (error as object) &&
    typeof (error as { meta?: unknown }).meta === "object" &&
    (error as { meta?: unknown }).meta !== null
      ? (error as unknown as { meta: Record<string, unknown> }).meta
      : null;
  const target = meta?.target;
  return Array.isArray(target)
    ? target.includes("tenantId") &&
        target.includes("companyId") &&
        target.includes("idempotencyKey")
    : typeof target === "string" && target.includes("idempotencyKey");
}

function settlementMetadataValue(
  metadata: unknown,
  key: "settlementType" | "evidenceReference" | "reason"
) {
  if (typeof metadata !== "object" || metadata === null || !(key in metadata)) {
    return "";
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

async function requireTransferRead(session: SessionContext) {
  if (!canUseTransfers(session.permissionCodes)) {
    await requirePermission(session, permissions.transferView);
  }
}

function scopedTransferWhere(session: SessionContext, id?: string) {
  return {
    ...(id ? { id } : {}),
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    OR: [
      { sourceLocationId: session.context.locationId },
      { destinationLocationId: session.context.locationId }
    ]
  };
}

export const transferDashboardProfiles = ["transfer-follow-up-v1"] as const;
export type TransferDashboardProfile = (typeof transferDashboardProfiles)[number];

const transferFollowUpStatuses = [
  "REQUESTED",
  "DISPATCHED",
  "PARTIALLY_RECEIVED",
  "DISPUTED"
] as const;

const transferProfilePageSize = 25;

export function resolveTransferDashboardProfile(
  value: string | undefined
): TransferDashboardProfile | null {
  return value === "transfer-follow-up-v1" ? value : null;
}

export function transferDashboardProfileHref(
  profile: TransferDashboardProfile,
  page = 1
) {
  const params = new URLSearchParams({ dashboard: profile });
  if (page > 1) {
    params.set("page", String(page));
  }
  return `/transfers?${params.toString()}`;
}

export function transferDashboardProfileWhere(
  session: SessionContext,
  profile: TransferDashboardProfile
) {
  if (profile === "transfer-follow-up-v1") {
    return {
      ...scopedTransferWhere(session),
      status: { in: [...transferFollowUpStatuses] }
    } satisfies Prisma.InventoryTransferWhereInput;
  }

  throw new Error("TRANSFER_DASHBOARD_PROFILE_UNSUPPORTED");
}

const transferDashboardTaskCandidateLimit = 8;
const transferMyTaskPageSize = 25;

export type TransferDashboardRead = {
  followUpCount: number;
  taskCandidates: Array<{
    id: string;
    publicReference: string;
    status: string;
    sourceLocationName: string;
    destinationLocationName: string;
    createdAt: string;
  }>;
};

export type TransferMyTaskPage = {
  totalCount: number;
  items: Array<{
    taskId: string;
    recordId: string;
    publicReference: string;
    status: string;
    actionLabel: "Dispatch transfer" | "Receive transfer";
    sourceLocationName: string;
    destinationLocationName: string;
    createdAt: string;
  }>;
  nextCursor: DashboardTaskCursor | null;
};

/**
 * Returns only transfer actions that are currently executable in the selected
 * location. Dispute settlement is intentionally excluded until the task
 * projection can carry and verify its stricter independent-actor rule.
 */
export async function listTransferMyTaskPage(
  session: SessionContext,
  input: {
    after?: DashboardTaskCursor;
    take?: number;
    filter?: DashboardTaskFilter;
  } = {}
): Promise<TransferMyTaskPage> {
  await requireTransferRead(session);
  if (input.filter?.priority && input.filter.priority !== "HIGH") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.due && input.filter.due.kind !== "NO_DUE") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.status && !["REQUESTED", "DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"].includes(input.filter.status)) return { totalCount: 0, items: [], nextCursor: null };

  const actionPredicates: Prisma.InventoryTransferWhereInput[] = [
    ...(session.permissionCodes.includes(permissions.transferDispatch)
      ? [
          {
            sourceLocationId: session.context.locationId,
            status: "REQUESTED"
          }
        ]
      : []),
    ...(session.permissionCodes.includes(permissions.transferReceive)
      ? [
          {
            destinationLocationId: session.context.locationId,
            status: { in: ["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"] },
            dispatchedByUserId: { not: session.user.id }
          }
        ]
      : [])
  ];
  const filteredActionPredicates = input.filter?.status
    ? actionPredicates.filter((predicate) =>
        input.filter?.status === "REQUESTED"
          ? "sourceLocationId" in predicate
          : "destinationLocationId" in predicate
      )
    : actionPredicates;
  if (filteredActionPredicates.length === 0) {
    return { totalCount: 0, items: [], nextCursor: null };
  }

  const take = Math.min(Math.max(input.take ?? transferMyTaskPageSize, 1), 50);
  const afterWhere = dashboardTaskAfterWhere("TRANSFER", input.after);
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(input.filter?.status ? { status: input.filter.status } : {}),
    AND: [
      { OR: filteredActionPredicates },
      ...(afterWhere ? [afterWhere] : [])
    ]
  } satisfies Prisma.InventoryTransferWhereInput;
  const select = {
    id: true,
    publicReference: true,
    status: true,
    createdAt: true,
    sourceLocationId: true,
    destinationLocationId: true,
    sourceLocation: { select: { name: true } },
    destinationLocation: { select: { name: true } }
  } satisfies Prisma.InventoryTransferSelect;
  const countWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(input.filter?.status ? { status: input.filter.status } : {}),
    OR: filteredActionPredicates
  } satisfies Prisma.InventoryTransferWhereInput;
  const [totalCount, rows] = await Promise.all([
    prisma.inventoryTransfer.count({ where: countWhere }),
    prisma.inventoryTransfer.findMany({
      where,
      select,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1
    })
  ]);
  const pageRows = rows.slice(0, take);
  const lastRow = pageRows.at(-1);

  return {
    totalCount,
    items: pageRows.map((transfer) => ({
      taskId: `transfer-${transfer.id}`,
      recordId: transfer.id,
      publicReference: transfer.publicReference,
      status: transfer.status,
      actionLabel:
        transfer.sourceLocationId === session.context.locationId
          ? "Dispatch transfer"
          : "Receive transfer",
      sourceLocationName: transfer.sourceLocation.name,
      destinationLocationName: transfer.destinationLocation.name,
      createdAt: transfer.createdAt.toISOString()
    })),
    nextCursor:
      rows.length > take && lastRow
        ? {
            createdAt: lastRow.createdAt.toISOString(),
            sourceType: "TRANSFER",
            recordId: lastRow.id
          }
        : null
  };
}

/**
 * Returns only the dashboard's transfer follow-up aggregate and a bounded
 * source-record candidate set. Transfer detail remains in its workspace.
 */
export async function getTransferDashboardRead(
  session: SessionContext
): Promise<TransferDashboardRead> {
  await requireTransferRead(session);

  const taskStatuses = ["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"];
  const profileWhere = transferDashboardProfileWhere(
    session,
    "transfer-follow-up-v1"
  );
  const candidateSelect = {
    id: true,
    publicReference: true,
    status: true,
    createdAt: true,
    sourceLocation: { select: { name: true } },
    destinationLocation: { select: { name: true } }
  } satisfies Prisma.InventoryTransferSelect;
  const candidateOrderBy: Prisma.InventoryTransferOrderByWithRelationInput[] = [
    { createdAt: "asc" },
    { id: "asc" }
  ];
  const [followUpCount, disputedCandidates, normalCandidates] = await Promise.all([
    prisma.inventoryTransfer.count({
      where: profileWhere
    }),
    prisma.inventoryTransfer.findMany({
      where: { ...profileWhere, status: "DISPUTED" },
      select: candidateSelect,
      orderBy: candidateOrderBy,
      take: transferDashboardTaskCandidateLimit
    }),
    prisma.inventoryTransfer.findMany({
      where: {
        ...profileWhere,
        status: { in: taskStatuses.filter((status) => status !== "DISPUTED") }
      },
      select: candidateSelect,
      orderBy: candidateOrderBy,
      take: transferDashboardTaskCandidateLimit
    })
  ]);
  const candidates = [...disputedCandidates, ...normalCandidates].slice(
    0,
    transferDashboardTaskCandidateLimit
  );

  return {
    followUpCount,
    taskCandidates: candidates.map((transfer) => ({
      id: transfer.id,
      publicReference: transfer.publicReference,
      status: transfer.status,
      sourceLocationName: transfer.sourceLocation.name,
      destinationLocationName: transfer.destinationLocation.name,
      createdAt: transfer.createdAt.toISOString()
    }))
  };
}

export async function listTransferFormOptions(session: SessionContext) {
  await requirePermission(session, permissions.transferCreate);

  const [destinationInventoryLocation, sourceInventoryLocations, items] =
    await Promise.all([
      prisma.inventoryLocation.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
          status: "ACTIVE"
        },
        include: { location: true }
      }),
      prisma.inventoryLocation.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE",
          locationId: { not: session.context.locationId }
        },
        include: { location: true },
        orderBy: { name: "asc" }
      }),
      prisma.item.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE",
          trackInventory: true
        },
        include: { baseUom: true },
        orderBy: { itemName: "asc" }
      })
    ]);

  return {
    destinationInventoryLocation: destinationInventoryLocation
      ? {
          id: destinationInventoryLocation.id,
          name: destinationInventoryLocation.name,
          locationName: destinationInventoryLocation.location.name
        }
      : null,
    sourceInventoryLocations: sourceInventoryLocations.map((location) => ({
      id: location.id,
      name: location.name,
      locationName: location.location.name,
      locationType: location.location.locationType
    })),
    items: items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      baseUomId: item.baseUomId,
      baseUomCode: item.baseUom.uomCode
    }))
  };
}

export async function listInventoryTransfers(session: SessionContext) {
  await requireTransferRead(session);

  const transfers = await prisma.inventoryTransfer.findMany({
    where: scopedTransferWhere(session),
    include: {
      sourceLocation: true,
      destinationLocation: true,
      requestedBy: true,
      lines: true
    },
    orderBy: { createdAt: "desc" }
  });

  return transfers.map(mapInventoryTransfer);
}

type InventoryTransferWithRelations = Prisma.InventoryTransferGetPayload<{ include: {
  sourceLocation: true; destinationLocation: true; requestedBy: true; lines: true;
} }>;

function mapInventoryTransfer(transfer: InventoryTransferWithRelations) {
  return {
    id: transfer.id,
    publicReference: transfer.publicReference,
    status: transfer.status,
    transferType: transfer.transferType,
    purpose: transfer.purpose,
    sourceLocationId: transfer.sourceLocationId,
    destinationLocationId: transfer.destinationLocationId,
    sourceLocationName: transfer.sourceLocation.name,
    destinationLocationName: transfer.destinationLocation.name,
    requestedByName: transfer.requestedBy.displayName,
    requiredByDate: transfer.requiredByDate?.toISOString().slice(0, 10) ?? null,
    createdAt: transfer.createdAt.toISOString(),
    submittedAt: transfer.submittedAt?.toISOString() ?? null,
    dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
    receivedAt: transfer.receivedAt?.toISOString() ?? null,
    cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
    lineCount: transfer.lines.length,
    requestedQty: transfer.lines.reduce(
      (total, line) => total + Number(line.requestedQty),
      0
    )
  };
}

export async function listInventoryTransferPage(
  session: SessionContext,
  input: { tab?: "all" | "draft" | "dispatch" | "receive" | "completed"; page?: number; pageSize?: number } = {}
) {
  await requireTransferRead(session);
  const tab = input.tab ?? "all";
  const statusWhere = tab === "draft" ? { status: "DRAFT" }
    : tab === "dispatch" ? { status: "REQUESTED" }
      : tab === "receive" ? { status: { in: ["DISPATCHED", "PARTIALLY_RECEIVED"] } }
        : tab === "completed" ? { status: "RECEIVED" } : {};
  const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const requestedPage = Math.max(1, Math.trunc(input.page ?? 1));
  const where = { ...scopedTransferWhere(session), ...statusWhere } satisfies Prisma.InventoryTransferWhereInput;
  const [totalItems, allCount, draftCount, dispatchCount, receiveCount, completedCount] = await Promise.all([
    prisma.inventoryTransfer.count({ where }),
    prisma.inventoryTransfer.count({ where: scopedTransferWhere(session) }),
    prisma.inventoryTransfer.count({ where: { ...scopedTransferWhere(session), status: "DRAFT" } }),
    prisma.inventoryTransfer.count({ where: { ...scopedTransferWhere(session), status: "REQUESTED" } }),
    prisma.inventoryTransfer.count({ where: { ...scopedTransferWhere(session), status: { in: ["DISPATCHED", "PARTIALLY_RECEIVED"] } } }),
    prisma.inventoryTransfer.count({ where: { ...scopedTransferWhere(session), status: "RECEIVED" } })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const transfers = await prisma.inventoryTransfer.findMany({
    where,
    include: { sourceLocation: true, destinationLocation: true, requestedBy: true, lines: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  });
  return { items: transfers.map(mapInventoryTransfer), totalItems, page, pageSize, totalPages, tabCounts: { all: allCount, draft: draftCount, dispatch: dispatchCount, receive: receiveCount, completed: completedCount } };
}

export type TransferFollowUpProfilePage = {
  transfers: Awaited<ReturnType<typeof listInventoryTransfers>>;
  totalItems: number;
  page: number;
  pageSize: number;
};

export async function listInventoryTransfersDashboardProfilePage(
  session: SessionContext,
  profile: TransferDashboardProfile,
  requestedPage: number
): Promise<TransferFollowUpProfilePage> {
  await requireTransferRead(session);

  const page = Number.isFinite(requestedPage) && requestedPage > 0
    ? Math.floor(requestedPage)
    : 1;
  const where = transferDashboardProfileWhere(session, profile);
  const totalItems = await prisma.inventoryTransfer.count({ where });
  const safePage = Math.min(
    page,
    Math.max(1, Math.ceil(totalItems / transferProfilePageSize))
  );
  const transfers = await prisma.inventoryTransfer.findMany({
    where,
    include: {
      sourceLocation: true,
      destinationLocation: true,
      requestedBy: true,
      lines: true
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (safePage - 1) * transferProfilePageSize,
    take: transferProfilePageSize
  });

  return {
    transfers: transfers.map((transfer) => ({
      id: transfer.id,
      publicReference: transfer.publicReference,
      status: transfer.status,
      transferType: transfer.transferType,
      purpose: transfer.purpose,
      sourceLocationId: transfer.sourceLocationId,
      destinationLocationId: transfer.destinationLocationId,
      sourceLocationName: transfer.sourceLocation.name,
      destinationLocationName: transfer.destinationLocation.name,
      requestedByName: transfer.requestedBy.displayName,
      requiredByDate: transfer.requiredByDate?.toISOString().slice(0, 10) ?? null,
      createdAt: transfer.createdAt.toISOString(),
      submittedAt: transfer.submittedAt?.toISOString() ?? null,
      dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
      receivedAt: transfer.receivedAt?.toISOString() ?? null,
      cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
      lineCount: transfer.lines.length,
      requestedQty: transfer.lines.reduce(
        (total, line) => total + Number(line.requestedQty),
        0
      )
    })),
    totalItems,
    page: safePage,
    pageSize: transferProfilePageSize
  };
}

export async function buildInventoryTransferExportRows(
  session: SessionContext,
  profile?: TransferDashboardProfile
) {
  await requireTransferRead(session);

  const transfers = await prisma.inventoryTransfer.findMany({
    where: profile
      ? transferDashboardProfileWhere(session, profile)
      : scopedTransferWhere(session),
    include: {
      sourceLocation: true,
      destinationLocation: true,
      requestedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      },
      receipts: {
        orderBy: { receivedAt: "desc" },
        include: {
          receivedBy: true,
          reversedBy: true,
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              item: true,
              uom: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  const settlementEvents =
    transfers.length > 0
      ? await prisma.auditEvent.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            entityType: "InventoryTransfer",
            entityId: { in: transfers.map((transfer) => transfer.id) },
            eventType: "inventory_transfer.discrepancy_settled"
          },
          include: { actor: true },
          orderBy: { occurredAt: "desc" }
        })
      : [];
  const latestSettlementByTransferId = new Map<
    string,
    (typeof settlementEvents)[number]
  >();
  for (const event of settlementEvents) {
    if (!latestSettlementByTransferId.has(event.entityId)) {
      latestSettlementByTransferId.set(event.entityId, event);
    }
  }

  const rows: CsvRow[] = [
    [
      "Reference",
      "Status",
      "Type",
      "Source Location",
      "Destination Location",
      "Requested By",
      "Required By",
      "Created At",
      "Submitted At",
      "Dispatched At",
      "Received At",
      "Transfer Line",
      "Item Code",
      "Item Name",
      "UOM",
      "Requested Qty",
      "Dispatched Qty",
      "Cumulative Received Qty",
      "Cumulative Rejected Qty",
      "Cumulative Damaged Qty",
      "Cumulative Discrepancy Qty",
      "Settlement Status",
      "Settlement Type",
      "Settlement Evidence Reference",
      "Settlement Reason",
      "Settled At",
      "Settled By",
      "Receipt Status",
      "Receipt Received At",
      "Receipt Received By",
      "Receipt Reversed At",
      "Receipt Reversed By",
      "Accepted Qty",
      "Rejected Qty",
      "Damaged Qty",
      "Discrepancy Qty",
      "Outstanding Qty",
      "Discrepancy Type",
      "Discrepancy Reason",
      "Evidence Reference"
    ]
  ];

  for (const transfer of transfers) {
    const settlement = latestSettlementByTransferId.get(transfer.id);
    const settlementColumns: CsvRow = [
      settlement ? "SETTLED" : "",
      settlementMetadataValue(settlement?.metadata, "settlementType"),
      settlementMetadataValue(settlement?.metadata, "evidenceReference"),
      settlementMetadataValue(settlement?.metadata, "reason"),
      settlement?.occurredAt.toISOString() ?? "",
      settlement?.actor?.displayName ?? ""
    ];

    for (const line of transfer.lines) {
      const receiptLines = transfer.receipts.flatMap((receipt) =>
        receipt.lines
          .filter((receiptLine) => receiptLine.inventoryTransferLineId === line.id)
          .map((receiptLine) => ({ receipt, receiptLine }))
      );
      const baseRow: CsvRow = [
        transfer.publicReference,
        transfer.status,
        transfer.transferType,
        transfer.sourceLocation.name,
        transfer.destinationLocation.name,
        transfer.requestedBy.displayName,
        transfer.requiredByDate?.toISOString().slice(0, 10) ?? "",
        transfer.createdAt.toISOString(),
        transfer.submittedAt?.toISOString() ?? "",
        transfer.dispatchedAt?.toISOString() ?? "",
        transfer.receivedAt?.toISOString() ?? "",
        line.lineNumber,
        line.item.itemCode,
        line.item.itemName,
        line.uom.uomCode,
        Number(line.requestedQty),
        Number(line.dispatchedQty),
        Number(line.receivedQty),
        Number(line.rejectedQty),
        Number(line.damagedQty),
        Number(line.discrepancyQty),
        ...settlementColumns
      ];

      if (receiptLines.length === 0) {
        rows.push([...baseRow, "", "", "", "", "", "", "", "", "", "", "", "", ""]);
        continue;
      }

      for (const { receipt, receiptLine } of receiptLines) {
        rows.push([
          ...baseRow,
          receipt.status,
          receipt.receivedAt.toISOString(),
          receipt.receivedBy.displayName,
          receipt.reversedAt?.toISOString() ?? "",
          receipt.reversedBy?.displayName ?? "",
          Number(receiptLine.acceptedQty),
          Number(receiptLine.rejectedQty),
          Number(receiptLine.damagedQty),
          Number(receiptLine.discrepancyQty),
          Number(receiptLine.outstandingQty),
          receiptLine.discrepancyType ?? "",
          receiptLine.discrepancyReason ?? "",
          receiptLine.evidenceReference ?? ""
        ]);
      }
    }
  }

  return rows;
}

export async function getInventoryTransfer(session: SessionContext, id: string) {
  await requireTransferRead(session);

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: scopedTransferWhere(session, id),
    include: {
      sourceLocation: true,
      destinationLocation: true,
      requestedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          sourceInventoryLocation: true,
          destinationInventoryLocation: true,
          item: true,
          uom: true
        }
      },
      receipts: {
        orderBy: { receivedAt: "desc" },
        include: {
          receivedBy: true,
          reversedBy: true,
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              postedMovement: {
                include: {
                  reversalMovements: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!transfer) {
    return null;
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "InventoryTransfer",
      entityId: transfer.id
    },
    orderBy: { occurredAt: "asc" }
  });

  return {
    id: transfer.id,
    publicReference: transfer.publicReference,
    status: transfer.status,
    transferType: transfer.transferType,
    purpose: transfer.purpose,
    sourceLocationId: transfer.sourceLocationId,
    destinationLocationId: transfer.destinationLocationId,
    sourceLocationName: transfer.sourceLocation.name,
    destinationLocationName: transfer.destinationLocation.name,
    requestedByName: transfer.requestedBy.displayName,
    requiredByDate: transfer.requiredByDate?.toISOString().slice(0, 10) ?? null,
    submittedAt: transfer.submittedAt?.toISOString() ?? null,
    dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
    receivedAt: transfer.receivedAt?.toISOString() ?? null,
    cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
    cancellationReason: transfer.cancellationReason ?? null,
    createdAt: transfer.createdAt.toISOString(),
    lines: transfer.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      description: line.description,
      sourceInventoryLocationName: line.sourceInventoryLocation.name,
      destinationInventoryLocationName: line.destinationInventoryLocation.name,
      itemCode: line.item.itemCode,
      itemName: line.item.itemName,
      requestedQty: Number(line.requestedQty),
      approvedQty: Number(line.approvedQty),
      preparedQty: Number(line.preparedQty),
      dispatchedQty: Number(line.dispatchedQty),
      receivedQty: Number(line.receivedQty),
      rejectedQty: Number(line.rejectedQty),
      damagedQty: Number(line.damagedQty),
      discrepancyQty: Number(line.discrepancyQty),
      uomCode: line.uom.uomCode,
      lotNumber: line.lotNumber ?? null,
      expiryDate: line.expiryDate?.toISOString().slice(0, 10) ?? null,
      notes: line.notes ?? null
    })),
    receipts: transfer.receipts.map((receipt) => ({
      id: receipt.id,
      status: receipt.status,
      receivedAt: receipt.receivedAt.toISOString(),
      postedAt: receipt.postedAt?.toISOString() ?? null,
      receivedByName: receipt.receivedBy.displayName,
      reversedByName: receipt.reversedBy?.displayName ?? null,
      reversedAt: receipt.reversedAt?.toISOString() ?? null,
      reversalReason: receipt.reversalReason ?? null,
      discrepancyFlag: receipt.discrepancyFlag,
      discrepancySummary: receipt.discrepancySummary ?? null,
      notes: receipt.notes ?? null,
      lines: receipt.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        acceptedQty: Number(line.acceptedQty),
        rejectedQty: Number(line.rejectedQty),
        damagedQty: Number(line.damagedQty),
        discrepancyQty: Number(line.discrepancyQty),
        outstandingQty: Number(line.outstandingQty),
        discrepancyReason: line.discrepancyReason ?? null,
        postedMovementId: line.postedMovementId ?? null,
        reversalMovementCount: line.postedMovement?.reversalMovements.length ?? 0
      }))
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : undefined
    }))
  };
}

export async function createInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferCreate);
  assertAuthorizedLocation(session, session.context.locationId);
  const values = createTransferSchema.parse(Object.fromEntries(formData));
  const lineValues = parseTransferLines(formData);

  const [sourceInventoryLocation, destinationInventoryLocation] =
    await Promise.all([
      prisma.inventoryLocation.findFirst({
        where: {
          id: values.sourceInventoryLocationId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE"
        },
        include: { location: true }
      }),
      prisma.inventoryLocation.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
          status: "ACTIVE"
        },
        include: { location: true }
      })
    ]);

  if (!sourceInventoryLocation) {
    throw new Error("TRANSFER_SOURCE_INVENTORY_LOCATION_NOT_FOUND");
  }
  if (!destinationInventoryLocation) {
    throw new Error("TRANSFER_DESTINATION_INVENTORY_LOCATION_NOT_FOUND");
  }
  assertTransferLocationsDistinct(
    sourceInventoryLocation.locationId,
    destinationInventoryLocation.locationId
  );
  assertAuthorizedLocation(session, destinationInventoryLocation.locationId);

  const itemIds = Array.from(new Set(lineValues.map((line) => line.itemId)));
  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
      trackInventory: true
    },
    include: { baseUom: true }
  });
  const itemById = new Map(items.map((item) => [item.id, item]));
  if (items.length !== itemIds.length) {
    throw new Error("TRANSFER_ITEM_NOT_FOUND");
  }

  const lineDrafts: TransferLineDraft[] = lineValues.map((line, index) => {
    assertPositiveTransferQuantity(line.requestedQty);
    const item = itemById.get(line.itemId);
    if (!item) {
      throw new Error("TRANSFER_ITEM_NOT_FOUND");
    }
    return {
      lineNumber: index + 1,
      item,
      requestedQty: line.requestedQty,
      notes: line.notes || null
    };
  });

  let transferId: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const transfer = await prisma.inventoryTransfer.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          publicReference: await nextTransferReference(session.context.companyId),
          sourceLocationId: sourceInventoryLocation.locationId,
          destinationLocationId: destinationInventoryLocation.locationId,
          requestedByUserId: session.user.id,
          transferType: values.transferType,
          purpose: values.purpose,
          requiredByDate: values.requiredByDate ?? null,
          lines: {
            create: lineDrafts.map((line) => ({
                tenantId: session.context.tenantId,
                companyId: session.context.companyId,
                sourceInventoryLocationId: sourceInventoryLocation.id,
                destinationInventoryLocationId: destinationInventoryLocation.id,
                itemId: line.item.id,
                uomId: line.item.baseUomId,
                lineNumber: line.lineNumber,
                description: line.item.itemName,
                requestedQty: line.requestedQty,
                notes: line.notes
              }))
          }
        }
      });
      transferId = transfer.id;
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 5) {
        throw error;
      }
    }
  }

  if (!transferId) {
    throw new Error("TRANSFER_REFERENCE_ALLOCATION_FAILED");
  }

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: "inventory_transfer.created",
      entityType: "InventoryTransfer",
      entityId: transferId,
      afterData: { status: "DRAFT" },
      metadata: {
        sourceLocationId: sourceInventoryLocation.locationId,
        destinationLocationId: destinationInventoryLocation.locationId,
        itemIds,
        lineCount: lineDrafts.length,
        requestedQty: lineDrafts.reduce(
          (total, line) => total + line.requestedQty,
          0
        )
      }
    }
  });

  return transferId;
}

export async function submitInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferSubmit);
  const values = transferActionSchema.parse(Object.fromEntries(formData));

  return withApprovalProducerTransaction({
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    documentType: "InventoryTransfer"
  }, async (tx) => {
    const [lockedTransfer] = await tx.$queryRaw<Array<
      LockedTransferApprovalSubmissionSource
    >>(Prisma.sql`
      SELECT t."id", t."tenantId", t."companyId", t."sourceLocationId",
        t."destinationLocationId", t."requestedByUserId", t."publicReference",
        t."transferType", t."purpose", t."requiredByDate", t."status",
        t."updatedAt", t."version"
      FROM "InventoryTransfer" t
      WHERE t."id" = ${values.id}::uuid
        AND t."tenantId" = ${session.context.tenantId}::uuid
        AND t."companyId" = ${session.context.companyId}::uuid
        AND (t."sourceLocationId" = ${session.context.locationId}::uuid
          OR t."destinationLocationId" = ${session.context.locationId}::uuid)
      FOR UPDATE OF t
    `);
    if (!lockedTransfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }

    const replayRequest = values.idempotencyKey
      ? {
          canonicalJson: inventoryTransferApprovalRequestCanonicalJson({
            transferId: lockedTransfer.id,
            submitterUserId: session.user.id,
            idempotencyKey: values.idempotencyKey
          }),
          hash: hashInventoryTransferApprovalRequest({
            transferId: lockedTransfer.id,
            submitterUserId: session.user.id,
            idempotencyKey: values.idempotencyKey
          })
        }
      : null;

    // The same immutable request remains an exact replay after later approval
    // decisions advance the source and graph. Revalidate the currently active
    // authority pins, but never require the source to remain in its submitted
    // version/status merely to acknowledge an already committed request.
    const existingIntent = values.idempotencyKey
      ? await tx.inventoryTransferApprovalSubmissionIntent.findFirst({
          where: {
            tenantId: lockedTransfer.tenantId,
            companyId: lockedTransfer.companyId,
            idempotencyKey: values.idempotencyKey
          }
        })
      : null;
    if (existingIntent) {
      const existingApproval = await tx.approvalInstance.findFirst({
        where: {
          id: existingIntent.approvalInstanceId,
          tenantId: lockedTransfer.tenantId,
          companyId: lockedTransfer.companyId
        },
        select: { documentType: true, documentId: true }
      });
      const currentActivation = await tx.inventoryPilotFamilyActivation.findUnique({
        where: {
          tenantId_companyId_family: {
            tenantId: lockedTransfer.tenantId,
            companyId: lockedTransfer.companyId,
            family: "InventoryTransfer"
          }
        }
      });
      if (
        !replayRequest ||
        existingIntent.inventoryTransferId !== lockedTransfer.id ||
        existingIntent.submitterUserId !== session.user.id ||
        existingIntent.requestCanonicalJson !== replayRequest.canonicalJson ||
        existingIntent.requestHash !== replayRequest.hash ||
        !/^[a-f0-9]{64}$/.test(existingIntent.sourceCanonicalHash) ||
        !/^[a-f0-9]{64}$/.test(existingIntent.configurationDigest) ||
        existingIntent.configurationRevisionNumber < 1 ||
        existingIntent.activationGeneration < 1 ||
        existingIntent.sourceVersionBefore + 1 !== existingIntent.sourceVersionAfter ||
        existingIntent.approvalDocumentType !== "InventoryTransfer" ||
        existingIntent.activationFamily !== "InventoryTransfer" ||
        existingIntent.activationStatus !== "ACTIVE" ||
        !existingApproval ||
        existingApproval.documentType !== "InventoryTransfer" ||
        existingApproval.documentId !== lockedTransfer.id ||
        !currentActivation ||
        currentActivation.status !== "ACTIVE" ||
        currentActivation.currentActivationEventId !== existingIntent.activationEventId ||
        currentActivation.configurationRevisionId !== existingIntent.configurationRevisionId ||
        currentActivation.configurationRevisionNumber !== existingIntent.configurationRevisionNumber ||
        currentActivation.configurationDigest !== existingIntent.configurationDigest ||
        currentActivation.generation !== existingIntent.activationGeneration
      ) {
        throw new Error("TRANSFER_APPROVAL_SUBMISSION_IDEMPOTENCY_CONFLICT");
      }
      return;
    }
    if (lockedTransfer.status === "PENDING_APPROVAL") {
      throw new Error("TRANSFER_APPROVAL_SUBMISSION_IDEMPOTENCY_CONFLICT");
    }

    assertTransferLocationsDistinct(
      lockedTransfer.sourceLocationId,
      lockedTransfer.destinationLocationId
    );

    const locationIds = [
      lockedTransfer.sourceLocationId,
      lockedTransfer.destinationLocationId
    ].sort();
    const locations = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT l."id", l."status"
      FROM "Location" l
      WHERE l."id" IN (${Prisma.join(locationIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND l."tenantId" = ${lockedTransfer.tenantId}::uuid
        AND l."companyId" = ${lockedTransfer.companyId}::uuid
      ORDER BY l."id" ASC
      FOR SHARE OF l
    `);
    if (locations.length !== 2 || locations.some((location) => location.status !== "ACTIVE")) {
      throw new Error("TRANSFER_LOCATION_SCOPE_CONFLICT");
    }

    const lines = await tx.$queryRaw<TransferApprovalSubmissionHashLine[] & Array<{
      sourceLocationId: string;
      destinationLocationId: string;
      requestedQty: Prisma.Decimal;
      dispatchedQty: Prisma.Decimal;
      receivedQty: Prisma.Decimal;
      rejectedQty: Prisma.Decimal;
      damagedQty: Prisma.Decimal;
      discrepancyQty: Prisma.Decimal;
    }>>(Prisma.sql`
      SELECT l."id", l."itemId", l."sourceInventoryLocationId",
        l."destinationInventoryLocationId", l."lineNumber", l."requestedQty",
        l."uomId", l."description", l."notes", sil."locationId" AS "sourceLocationId",
        dil."locationId" AS "destinationLocationId",
        l."dispatchedQty", l."receivedQty", l."rejectedQty", l."damagedQty",
        l."discrepancyQty"
      FROM "InventoryTransferLine" l
      JOIN "InventoryLocation" sil ON sil."id" = l."sourceInventoryLocationId"
      JOIN "InventoryLocation" dil ON dil."id" = l."destinationInventoryLocationId"
      WHERE l."inventoryTransferId" = ${lockedTransfer.id}::uuid
        AND l."tenantId" = ${lockedTransfer.tenantId}::uuid
        AND l."companyId" = ${lockedTransfer.companyId}::uuid
        AND sil."tenantId" = ${lockedTransfer.tenantId}::uuid
        AND sil."companyId" = ${lockedTransfer.companyId}::uuid
        AND dil."tenantId" = ${lockedTransfer.tenantId}::uuid
        AND dil."companyId" = ${lockedTransfer.companyId}::uuid
      ORDER BY l."lineNumber" ASC, l."id" ASC
      FOR UPDATE OF l
    `);
    if (lines.length === 0) {
      throw new Error("TRANSFER_SUBMIT_SCOPE_CONFLICT");
    }
    for (const line of lines) {
      if (
        line.sourceLocationId !== lockedTransfer.sourceLocationId ||
        line.destinationLocationId !== lockedTransfer.destinationLocationId
      ) {
        throw new Error("TRANSFER_SUBMIT_SCOPE_CONFLICT");
      }
      assertPositiveTransferQuantity(Number(line.requestedQty));
      if ([
        line.dispatchedQty,
        line.receivedQty,
        line.rejectedQty,
        line.damagedQty,
        line.discrepancyQty
      ].some((quantity) => Number(quantity) !== 0)) {
        throw new Error("TRANSFER_SUBMIT_RESIDUE_CONFLICT");
      }
    }

    const transfer: LockedTransferApprovalSubmissionSource = {
      ...lockedTransfer,
      lines
    };

    const [receiptResidue, movementResidue, approvalHistory] = await Promise.all([
      tx.inventoryTransferReceipt.count({
        where: { tenantId: transfer.tenantId, companyId: transfer.companyId, inventoryTransferId: transfer.id }
      }),
      tx.inventoryMovement.count({
        where: {
          tenantId: transfer.tenantId,
          companyId: transfer.companyId,
          sourceDocumentType: "InventoryTransfer",
          sourceDocumentId: transfer.id
        }
      }),
      tx.approvalInstance.findMany({
        where: {
          tenantId: transfer.tenantId,
          companyId: transfer.companyId,
          documentType: "InventoryTransfer",
          documentId: transfer.id
        },
        select: { status: true },
        orderBy: { createdAt: "asc" }
      })
    ]);
    const approvalHistoryIsValid =
      (transfer.status === "DRAFT" && approvalHistory.length === 0) ||
      (transfer.status === "RETURNED" &&
        approvalHistory.length > 0 &&
        approvalHistory.every(({ status }) => status === "RETURNED"));
    if (
      receiptResidue > 0 ||
      movementResidue > 0 ||
      !approvalHistoryIsValid
    ) {
      throw new Error("TRANSFER_SUBMIT_RESIDUE_CONFLICT");
    }

    let attestation: Awaited<ReturnType<typeof classifyInventoryTransferForPilotApproval>>;
    try {
      attestation = await classifyInventoryTransferForPilotApproval({
        tx,
        transfer: {
          id: transfer.id,
          tenantId: transfer.tenantId,
          companyId: transfer.companyId,
          version: transfer.version,
          status: transfer.status,
          sourceLocationId: transfer.sourceLocationId,
          destinationLocationId: transfer.destinationLocationId,
          lines: transfer.lines.map((line) => ({
            id: line.id,
            tenantId: transfer.tenantId,
            companyId: transfer.companyId,
            itemId: line.itemId,
            sourceInventoryLocationId: line.sourceInventoryLocationId,
            destinationInventoryLocationId: line.destinationInventoryLocationId
          }))
        },
        stage: "SUBMIT"
      });
    } catch (error) {
      // Default-off is the only legacy path. A configured classifier that is
      // stale, incomplete, mixed, or otherwise invalid must never bypass its
      // authority by silently falling back to REQUESTED.
      if (
        error instanceof Error &&
        error.message === INVENTORY_PILOT_APPROVAL_ERRORS.DISABLED
      ) {
        await assertDisabledTransferSubmissionCanUseLegacy(tx, transfer);
        assertTransferCanSubmit(transfer.status);
        const submitted = await tx.inventoryTransfer.updateMany({
          where: {
            id: transfer.id,
            tenantId: transfer.tenantId,
            companyId: transfer.companyId,
            sourceLocationId: transfer.sourceLocationId,
            destinationLocationId: transfer.destinationLocationId,
            status: "DRAFT",
            updatedAt: transfer.updatedAt,
            version: transfer.version
          },
          data: {
            status: "REQUESTED",
            submittedAt: new Date(),
            version: { increment: 1 }
          }
        });
        if (submitted.count !== 1) {
          throw new Error("TRANSFER_NOT_DRAFT_FOR_SUBMIT");
        }
        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "inventory_transfer.submitted",
            entityType: "InventoryTransfer",
            entityId: transfer.id,
            beforeData: { status: "DRAFT" },
            afterData: { status: "REQUESTED" }
          }
        });
        return;
      }
      throw error;
    }

    if (!values.idempotencyKey || !replayRequest) {
      throw new Error("TRANSFER_APPROVAL_SUBMISSION_IDEMPOTENCY_KEY_REQUIRED");
    }

    // The database unique key is the final backstop, but normalize a reused
    // key before any source transition so a pilot retry mismatch is never
    // surfaced as a provider-specific unique-constraint error.
    const reusedIntent = await tx.inventoryTransferApprovalSubmissionIntent.findFirst({
      where: {
        tenantId: transfer.tenantId,
        companyId: transfer.companyId,
        idempotencyKey: values.idempotencyKey
      },
      select: { id: true }
    });
    if (reusedIntent) {
      throw new Error("TRANSFER_APPROVAL_SUBMISSION_IDEMPOTENCY_CONFLICT");
    }

    const ruleRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT r."id"
      FROM "ApprovalRule" r
      WHERE r."tenantId" = ${transfer.tenantId}::uuid
        AND r."companyId" = ${transfer.companyId}::uuid
        AND r."transactionType" = 'InventoryTransfer'
        AND r."isActive" = true
        AND r."definitionSealed" = true
      ORDER BY r."priority" ASC, r."id" ASC
      LIMIT 1
      FOR SHARE OF r
    `);
    const approvalRule = ruleRows[0];
    if (!approvalRule) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }
    const ruleSteps = await tx.$queryRaw<Array<{
      stepOrder: number;
      userId: string | null;
      roleId: string | null;
    }>>(Prisma.sql`
      SELECT s."stepOrder", s."userId", s."roleId"
      FROM "ApprovalRuleStep" s
      WHERE s."approvalRuleId" = ${approvalRule.id}::uuid
      ORDER BY s."stepOrder" ASC
      FOR SHARE OF s
    `);
    const firstStep = ruleSteps[0];
    if (!firstStep) {
      throw new Error("APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }

    const sourceDigest = hashInventoryTransferApprovalSource(transfer);
    const submitted = await tx.inventoryTransfer.updateMany({
      where: {
        id: transfer.id,
        tenantId: transfer.tenantId,
        companyId: transfer.companyId,
        sourceLocationId: transfer.sourceLocationId,
        destinationLocationId: transfer.destinationLocationId,
        status: { in: ["DRAFT", "RETURNED"] },
        updatedAt: transfer.updatedAt,
        version: transfer.version
      },
      data: {
        status: "PENDING_APPROVAL",
        submittedAt: new Date(),
        version: { increment: 1 }
      }
    });
    if (submitted.count !== 1) {
      throw new Error("TRANSFER_APPROVAL_SOURCE_CAS_CONFLICT");
    }

    const routedSteps = ruleSteps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
    }));
    const firstRoutedStep = routedSteps[0];
    if (!firstRoutedStep) {
      throw new Error("APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }
    const approval = await tx.approvalInstance.create({
      data: {
        tenantId: transfer.tenantId,
        companyId: transfer.companyId,
        documentType: "InventoryTransfer",
        documentId: transfer.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: routedSteps.map((step) => ({
            id: step.approvalInstanceStepId,
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: step.activationStatus
          }))
        }
      }
    });
    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: transfer.tenantId,
        companyId: transfer.companyId,
        routingPolicy: getApprovalRoutingPolicy("InventoryTransfer"),
        requiredPermissionCode: permissions.transferApprove,
        dueAt: transfer.requiredByDate,
        activationAudit: {
          actorUserId: session.user.id,
          source: "inventory-transfer-approval-submission"
        },
        scopeGroups: [
          {
            groupOrder: 1,
            targetMatchMode: "ANY",
            targets: [{
              scopeType: "LOCATION",
              companyId: transfer.companyId,
              locationId: transfer.sourceLocationId
            }]
          },
          {
            groupOrder: 2,
            targetMatchMode: "ANY",
            targets: [{
              scopeType: "LOCATION",
              companyId: transfer.companyId,
              locationId: transfer.destinationLocationId
            }]
          }
        ],
        prohibitedActors: [{
          userId: transfer.requestedByUserId,
          reasonCode: "REQUESTER"
        }]
      });
    }
    await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: transfer.tenantId,
      companyId: transfer.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId
    });

    const intent = await tx.inventoryTransferApprovalSubmissionIntent.create({
      data: {
        tenantId: transfer.tenantId,
        companyId: transfer.companyId,
        inventoryTransferId: transfer.id,
        sourceVersionBefore: transfer.version,
        sourceVersionAfter: transfer.version + 1,
        sourceCanonicalHash: sourceDigest,
        configurationRevisionId: attestation.configurationRevisionId,
        configurationRevisionNumber: attestation.configurationRevisionNumber,
        configurationDigest: attestation.configurationDigest,
        activationEventId: attestation.activationEventId,
        activationFamily: "InventoryTransfer",
        activationStatus: "ACTIVE",
        activationGeneration: attestation.activationGeneration,
        idempotencyKey: values.idempotencyKey,
        requestCanonicalJson: replayRequest.canonicalJson,
        requestHash: replayRequest.hash,
        submitterUserId: session.user.id,
        approvalInstanceId: approval.id,
        approvalDocumentType: "InventoryTransfer"
      }
    });
    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: transfer.tenantId,
        companyId: transfer.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.approval_submitted",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: transfer.status, version: transfer.version },
        afterData: {
          status: "PENDING_APPROVAL",
          version: transfer.version + 1,
          currentApprovalStep: firstStep.stepOrder
        },
        metadata: {
          approvalInstanceId: approval.id,
          approvalRuleId: approvalRule.id,
          approvalSubmissionIntentId: intent.id,
          sourceCanonicalHash: sourceDigest,
          configurationRevisionId: attestation.configurationRevisionId,
          configurationRevisionNumber: attestation.configurationRevisionNumber,
          configurationDigest: attestation.configurationDigest,
          activationEventId: attestation.activationEventId,
          activationGeneration: attestation.activationGeneration,
          lineCount: transfer.lines.length,
          nonPostingApproval: true
        }
      }
    });
    await recordWorkflowNotifications(tx, {
      tenantId: transfer.tenantId,
      companyId: transfer.companyId,
      locationId: transfer.destinationLocationId,
      recipientUserIds: firstStep.userId ? [firstStep.userId] : [],
      notificationType: "APPROVE_INVENTORY_TRANSFER",
      priority: "NORMAL",
      title: `Approve Inventory Transfer ${transfer.publicReference}`,
      body: `${session.user.displayName} submitted ${transfer.publicReference} for transfer approval.`,
      deepLink: `/approvals/${approval.id}`,
      entityType: "InventoryTransfer",
      entityId: transfer.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approval.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: transfer.publicReference,
        source: "inventory-transfer-approval-submission"
      }
    });
  });
}

export async function dispatchInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferDispatch);
  const values = transferActionSchema.parse(Object.fromEntries(formData));

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      sourceLocationId: session.context.locationId
    },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" }
      }
    }
  });
  if (!transfer) {
    throw new Error("TRANSFER_NOT_FOUND");
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const inventoryLocationLock = await lockInventoryLocationsForPosting(
      tx,
      session,
      transfer.lines.flatMap((line) => [
        line.sourceInventoryLocationId,
        line.destinationInventoryLocationId
      ])
    );

    const [lockedTransfer] = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      updatedAt: Date;
      version: number;
      sourceLocationId: string;
      destinationLocationId: string;
    }>>(Prisma.sql`
      SELECT t."id", t."status", t."updatedAt", t."version", t."sourceLocationId",
        t."destinationLocationId"
      FROM "InventoryTransfer" t
      WHERE t."id" = ${values.id}::uuid
        AND t."tenantId" = ${session.context.tenantId}::uuid
        AND t."companyId" = ${session.context.companyId}::uuid
        AND t."sourceLocationId" = ${session.context.locationId}::uuid
      FOR UPDATE OF t
    `);
    if (!lockedTransfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }

    const lockedLineIds = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT l."id"
      FROM "InventoryTransferLine" l
      WHERE l."inventoryTransferId" = ${lockedTransfer.id}::uuid
        AND l."tenantId" = ${session.context.tenantId}::uuid
        AND l."companyId" = ${session.context.companyId}::uuid
      ORDER BY l."lineNumber" ASC, l."id" ASC
      FOR UPDATE OF l
    `);
    const authoritativeTransfer = await tx.inventoryTransfer.findFirst({
      where: {
        id: lockedTransfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceLocationId: session.context.locationId
      },
      include: { lines: { orderBy: { lineNumber: "asc" } } }
    });
    if (!authoritativeTransfer || lockedLineIds.length !== authoritativeTransfer.lines.length) {
      throw new Error("TRANSFER_DISPATCH_SCOPE_CONFLICT");
    }
    const activeInventoryLocations = await tx.inventoryLocation.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        id: {
          in: authoritativeTransfer.lines.flatMap((line) => [
            line.sourceInventoryLocationId,
            line.destinationInventoryLocationId
          ])
        }
      },
      select: { id: true }
    });
    const expectedInventoryLocationIds = new Set(
      authoritativeTransfer.lines.flatMap((line) => [
        line.sourceInventoryLocationId,
        line.destinationInventoryLocationId
      ])
    );
    if (activeInventoryLocations.length !== expectedInventoryLocationIds.size) {
      throw new Error("TRANSFER_DISPATCH_SCOPE_CONFLICT");
    }

    if (lockedTransfer.status === "DISPATCHED") {
      const movementKeys = authoritativeTransfer.lines.map((line) => `dispatch:${line.id}`);
      const existingMovements = await tx.inventoryMovement.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          sourceDocumentType: "InventoryTransfer",
          sourceDocumentId: lockedTransfer.id,
          sourceEventKey: { in: movementKeys }
        },
        select: { sourceEventKey: true }
      });
      const exactReplay = existingMovements.length === movementKeys.length &&
        new Set(existingMovements.map((movement) => movement.sourceEventKey)).size === movementKeys.length &&
        authoritativeTransfer.lines.every((line) => Number(line.dispatchedQty) === Number(line.requestedQty));
      if (exactReplay) return;
      throw new Error("TRANSFER_DISPATCH_STATE_CONFLICT");
    }
    assertTransferCanDispatch(lockedTransfer.status);
    await assertTransferActorWasNotApprover(tx, {
      tenantId: authoritativeTransfer.tenantId,
      companyId: authoritativeTransfer.companyId,
      transferId: authoritativeTransfer.id,
      actorUserId: session.user.id,
      action: "DISPATCH"
    });
    if (authoritativeTransfer.lines.length === 0) {
      throw new Error("TRANSFER_DISPATCH_SCOPE_CONFLICT");
    }

    const dispatched = await tx.inventoryTransfer.updateMany({
      where: {
        id: lockedTransfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceLocationId: session.context.locationId,
        status: "REQUESTED",
        updatedAt: lockedTransfer.updatedAt,
        version: lockedTransfer.version
      },
      data: {
        status: "DISPATCHED",
        dispatchedAt: now,
        dispatchedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (dispatched.count !== 1) {
      throw new Error("TRANSFER_NOT_REQUESTED_FOR_DISPATCH");
    }

    for (const line of authoritativeTransfer.lines) {
      const requestedQty = Number(line.requestedQty);
      assertPositiveTransferQuantity(requestedQty);
      if (Number(line.dispatchedQty) !== 0) {
        throw new Error("TRANSFER_LINE_ALREADY_DISPATCHED");
      }

      const { duplicate } = await postInventoryMovementInTransaction(tx, session, inventoryLocationLock, {
        inventoryLocationId: line.sourceInventoryLocationId,
        relatedInventoryLocationId: line.destinationInventoryLocationId,
        itemId: line.itemId,
        movementType: "TRANSFER_OUT",
        occurredAt: now,
        enteredQuantity: requestedQty,
        enteredUomId: line.uomId,
        quantityDeltaBaseUom: -requestedQty,
        sourceDocumentType: "InventoryTransfer",
        sourceDocumentId: transfer.id,
        sourceDocumentLineId: line.id,
        sourceEventKey: `dispatch:${line.id}`,
        lotNumber: line.lotNumber,
        expiryDate: line.expiryDate,
        reasonCode: "TRANSFER_DISPATCH",
        notes: authoritativeTransfer.publicReference
      });

      if (!duplicate) {
        const lineUpdated = await tx.inventoryTransferLine.updateMany({
          where: {
            id: line.id,
            inventoryTransferId: lockedTransfer.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            dispatchedQty: line.dispatchedQty
          },
          data: {
            dispatchedQty: {
              increment: requestedQty
            }
          }
        });
        if (lineUpdated.count !== 1) {
          throw new Error("TRANSFER_LINE_DISPATCH_STATE_CONFLICT");
        }
      }
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.dispatched",
        entityType: "InventoryTransfer",
        entityId: lockedTransfer.id,
        beforeData: { status: "REQUESTED" },
        afterData: { status: "DISPATCHED" },
        metadata: {
          sourceLocationId: transfer.sourceLocationId,
          destinationLocationId: transfer.destinationLocationId,
          lineCount: authoritativeTransfer.lines.length
        }
      }
    });
  });
}

export async function receiveInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferReceive);
  const values = receiveTransferSchema.parse(Object.fromEntries(formData));

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      destinationLocationId: session.context.locationId
    },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" }
      }
    }
  });
  if (!transfer) {
    throw new Error("TRANSFER_NOT_FOUND");
  }
  const requestHashCandidate = receiptRequestHashFromForm(
    transfer,
    session,
    formData,
    values.notes
  );

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
    const inventoryLocationLock = await lockInventoryLocationsForPosting(
      tx,
      session,
      transfer.lines.flatMap((line) => [
        line.sourceInventoryLocationId,
        line.destinationInventoryLocationId
      ])
    );
    const [lockedTransfer] = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      updatedAt: Date;
      version: number;
      sourceLocationId: string;
      destinationLocationId: string;
    }>>(Prisma.sql`
      SELECT t."id", t."status", t."updatedAt", t."version", t."sourceLocationId",
        t."destinationLocationId"
      FROM "InventoryTransfer" t
      WHERE t."id" = ${values.id}::uuid
        AND t."tenantId" = ${session.context.tenantId}::uuid
        AND t."companyId" = ${session.context.companyId}::uuid
        AND t."destinationLocationId" = ${session.context.locationId}::uuid
      FOR UPDATE OF t
    `);
    if (!lockedTransfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }
    const lockedLineIds = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT l."id"
      FROM "InventoryTransferLine" l
      WHERE l."inventoryTransferId" = ${lockedTransfer.id}::uuid
        AND l."tenantId" = ${session.context.tenantId}::uuid
        AND l."companyId" = ${session.context.companyId}::uuid
      ORDER BY l."lineNumber" ASC, l."id" ASC
      FOR UPDATE OF l
    `);
    const authoritativeTransfer = await tx.inventoryTransfer.findFirst({
      where: {
        id: lockedTransfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        destinationLocationId: session.context.locationId
      },
      include: { lines: { orderBy: { lineNumber: "asc" } } }
    });
    if (
      !authoritativeTransfer ||
      lockedLineIds.length !== authoritativeTransfer.lines.length ||
      lockedTransfer.sourceLocationId !== authoritativeTransfer.sourceLocationId ||
      lockedTransfer.destinationLocationId !== authoritativeTransfer.destinationLocationId
    ) {
      throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
    }
    // Reauthorize after the authoritative locks are held so a revoked receiver
    // cannot post against a stale session snapshot.
    await requirePermission(session, permissions.transferReceive);
    const authoritativeInventoryLocationIds = new Set(
      authoritativeTransfer.lines.flatMap((line) => [
        line.sourceInventoryLocationId,
        line.destinationInventoryLocationId
      ])
    );
    const initiallyLockedInventoryLocationIds = new Set(
      transfer.lines.flatMap((line) => [
        line.sourceInventoryLocationId,
        line.destinationInventoryLocationId
      ])
    );
    if (
      authoritativeInventoryLocationIds.size !== initiallyLockedInventoryLocationIds.size ||
      [...authoritativeInventoryLocationIds].some(
        (id) => !initiallyLockedInventoryLocationIds.has(id)
      )
    ) {
      throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
    }
    const activeInventoryLocations = await tx.inventoryLocation.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        id: { in: [...authoritativeInventoryLocationIds] }
      },
      select: { id: true, locationId: true }
    });
    if (activeInventoryLocations.length !== authoritativeInventoryLocationIds.size) {
      throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
    }
    const inventoryLocationById = new Map(
      activeInventoryLocations.map((location) => [location.id, location.locationId])
    );
    if (
      authoritativeTransfer.lines.some(
        (line) =>
          inventoryLocationById.get(line.sourceInventoryLocationId) !==
            authoritativeTransfer.sourceLocationId ||
          inventoryLocationById.get(line.destinationInventoryLocationId) !==
            authoritativeTransfer.destinationLocationId
      )
    ) {
      throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
    }
    if (authoritativeTransfer.dispatchedByUserId === session.user.id) {
      throw new Error("TRANSFER_RECEIVER_MUST_DIFFER_FROM_DISPATCHER");
    }

    const receiptInputs = authoritativeTransfer.lines.map((line) => {
      const acceptedQty = parseReceiptQuantity(formData, line.id, "acceptedQty") ?? 0;
      const rejectedQty = parseReceiptQuantity(formData, line.id, "rejectedQty") ?? 0;
      const damagedQty = parseReceiptQuantity(formData, line.id, "damagedQty") ?? 0;
      const discrepancyQty = parseReceiptQuantity(formData, line.id, "discrepancyQty") ?? 0;
      return {
        line,
        acceptedQty,
        rejectedQty,
        damagedQty,
        discrepancyQty,
        discrepancyReason: String(formData.get(`lines.${line.id}.discrepancyReason`) ?? "").trim() || null,
        discrepancyType: String(formData.get(`lines.${line.id}.discrepancyType`) ?? "").trim() || null,
        evidenceReference: String(formData.get(`lines.${line.id}.evidenceReference`) ?? "").trim() || null
      };
    });
    const idempotencyRequestHash = hashInventoryTransferReceiptRequest({
      actorUserId: session.user.id,
      destinationLocationId: authoritativeTransfer.destinationLocationId,
      transferId: authoritativeTransfer.id,
      notes: values.notes ?? null,
      lines: receiptInputs.map((input) => ({
        lineId: input.line.id,
        sourceInventoryLocationId: input.line.sourceInventoryLocationId,
        destinationInventoryLocationId: input.line.destinationInventoryLocationId,
        acceptedQty: input.acceptedQty,
        rejectedQty: input.rejectedQty,
        damagedQty: input.damagedQty,
        discrepancyQty: input.discrepancyQty,
        discrepancyType: input.discrepancyType,
        discrepancyReason: input.discrepancyReason,
        evidenceReference: input.evidenceReference
      }))
    });
    await assertFreshTransferReceiptAuthority(
      tx,
      session,
      permissions.transferReceive,
      authoritativeTransfer.destinationLocationId,
    );
    await assertPrivilegedMfaForAction(session, {
      action: "inventory_transfer_receipt.receive",
      enforcementScope: "all_sensitive",
      permissionCode: permissions.transferReceive,
      entityType: "InventoryTransfer",
      entityId: authoritativeTransfer.id,
      reason: "Transfer receipt posting changes destination inventory and records discrepancies.",
      metadata: { destinationLocationId: authoritativeTransfer.destinationLocationId }
    }, { transaction: tx });
    const existingReceipt = await tx.inventoryTransferReceipt.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey: values.idempotencyKey
      },
      select: { id: true, idempotencyRequestHash: true, status: true }
    });
    if (existingReceipt) {
      if (existingReceipt.idempotencyRequestHash !== idempotencyRequestHash) {
        throw new Error("TRANSFER_RECEIPT_IDEMPOTENCY_CONFLICT");
      }
      if (existingReceipt.status === "POSTED" || existingReceipt.status === "REVERSED") {
        return;
      }
      throw new Error("TRANSFER_RECEIPT_IDEMPOTENCY_IN_PROGRESS");
    }
    assertTransferCanReceive(lockedTransfer.status);
    await assertTransferActorWasNotApprover(tx, {
      tenantId: authoritativeTransfer.tenantId,
      companyId: authoritativeTransfer.companyId,
      transferId: authoritativeTransfer.id,
      actorUserId: session.user.id,
      action: "RECEIVE"
    });
    const receipt = await tx.inventoryTransferReceipt.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryTransferId: authoritativeTransfer.id,
        receivedByUserId: session.user.id,
        status: "POSTING",
        receivedAt: now,
        notes: values.notes || null,
        idempotencyKey: values.idempotencyKey,
        idempotencyRequestHash
      }
    });

    let capturedReceiptQty = 0;
    let discrepancyFlag = false;
    const discrepancySummaries: string[] = [];

    for (const input of receiptInputs) {
      const line = input.line;
      const dispatchedQty = Number(line.dispatchedQty);
      assertPositiveTransferQuantity(dispatchedQty);
      const alreadyAccountedQty =
        Number(line.receivedQty) +
        Number(line.rejectedQty) +
        Number(line.damagedQty) +
        Number(line.discrepancyQty);
      const remainingQty = Number((dispatchedQty - alreadyAccountedQty).toFixed(6));
      if (remainingQty <= 0) {
        continue;
      }

      const { acceptedQty, rejectedQty, damagedQty, discrepancyQty, discrepancyReason, discrepancyType, evidenceReference } = input;

      assertTransferReceiptQuantities({
        acceptedQty,
        rejectedQty,
        damagedQty,
        discrepancyQty,
        remainingQty,
        discrepancyReason,
        evidenceReference
      });

      const capturedLineQty =
        acceptedQty + rejectedQty + damagedQty + discrepancyQty;
      if (capturedLineQty <= 0) {
        continue;
      }

      const outstandingQty = Number((remainingQty - capturedLineQty).toFixed(6));
      const receiptLine = await tx.inventoryTransferReceiptLine.create({
        data: {
          transferReceiptId: receipt.id,
          inventoryTransferId: authoritativeTransfer.id,
          inventoryTransferLineId: line.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          itemId: line.itemId,
          uomId: line.uomId,
          lineNumber: line.lineNumber,
          dispatchedQtySnapshot: dispatchedQty,
          acceptedQty,
          rejectedQty,
          damagedQty,
          discrepancyQty,
          outstandingQty,
          discrepancyType,
          discrepancyReason,
          evidenceReference
        }
      });

      if (acceptedQty > 0) {
        const { movement } = await postInventoryMovementInTransaction(tx, session, inventoryLocationLock, {
          inventoryLocationId: line.destinationInventoryLocationId,
          relatedInventoryLocationId: line.sourceInventoryLocationId,
          itemId: line.itemId,
          movementType: "TRANSFER_IN",
          occurredAt: now,
          enteredQuantity: acceptedQty,
          enteredUomId: line.uomId,
          quantityDeltaBaseUom: acceptedQty,
          sourceDocumentType: "InventoryTransfer",
          sourceDocumentId: authoritativeTransfer.id,
          sourceDocumentLineId: line.id,
          sourceEventKey: `receipt:${receiptLine.id}`,
          lotNumber: line.lotNumber,
          expiryDate: line.expiryDate,
          reasonCode: "TRANSFER_RECEIPT",
          notes: authoritativeTransfer.publicReference
        });

        const linked = await tx.inventoryTransferReceiptLine.updateMany({
          where: {
            id: receiptLine.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryTransferId: authoritativeTransfer.id,
            postedMovementId: null
          },
          data: { postedMovementId: movement.id }
        });
        if (linked.count !== 1) {
          throw new Error("TRANSFER_RECEIPT_STATE_CONFLICT");
        }
      }

      const updated = await tx.inventoryTransferLine.updateMany({
        where: {
          id: line.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryTransferId: authoritativeTransfer.id,
          receivedQty: line.receivedQty,
          rejectedQty: line.rejectedQty,
          damagedQty: line.damagedQty,
          discrepancyQty: line.discrepancyQty
        },
        data: {
          receivedQty: { increment: acceptedQty },
          rejectedQty: { increment: rejectedQty },
          damagedQty: { increment: damagedQty },
          discrepancyQty: { increment: discrepancyQty }
        }
      });
      if (updated.count !== 1) {
        throw new Error("TRANSFER_RECEIPT_STATE_CONFLICT");
      }

      capturedReceiptQty += capturedLineQty;
      if (rejectedQty + damagedQty + discrepancyQty > 0) {
        discrepancyFlag = true;
        discrepancySummaries.push(
          `Line ${line.lineNumber}: ${rejectedQty} rejected, ${damagedQty} damaged, ${discrepancyQty} short/discrepant`
        );
      }
    }

    if (capturedReceiptQty <= 0) {
      throw new Error("TRANSFER_RECEIPT_QUANTITY_REQUIRED");
    }

    const updatedLines = await tx.inventoryTransferLine.findMany({
      where: { inventoryTransferId: authoritativeTransfer.id },
      orderBy: { lineNumber: "asc" }
    });
    const nextStatus = calculateTransferReceiptStatus(
      updatedLines.map((line) => ({
        dispatchedQty: Number(line.dispatchedQty),
        receivedQty: Number(line.receivedQty),
        rejectedQty: Number(line.rejectedQty),
        damagedQty: Number(line.damagedQty),
        discrepancyQty: Number(line.discrepancyQty)
      }))
    );

    const postedReceipt = await tx.inventoryTransferReceipt.updateMany({
      where: {
        id: receipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryTransferId: authoritativeTransfer.id,
        status: "POSTING",
        updatedAt: receipt.updatedAt
      },
      data: {
        status: "POSTED",
        postedAt: now,
        discrepancyFlag,
        discrepancySummary: discrepancySummaries.join("; ") || null
      }
    });
    if (postedReceipt.count !== 1) {
      throw new Error("TRANSFER_RECEIPT_STATE_CONFLICT");
    }

    const updatedTransfer = await tx.inventoryTransfer.updateMany({
      where: {
        id: authoritativeTransfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        destinationLocationId: session.context.locationId,
        status: lockedTransfer.status,
        updatedAt: lockedTransfer.updatedAt,
        version: lockedTransfer.version
      },
      data: {
        status: nextStatus,
        receivedAt: now,
        receivedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updatedTransfer.count !== 1) {
      throw new Error("TRANSFER_RECEIPT_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.received",
        entityType: "InventoryTransfer",
        entityId: authoritativeTransfer.id,
        beforeData: { status: lockedTransfer.status },
        afterData: { status: nextStatus },
        metadata: {
          receiptId: receipt.id,
          sourceLocationId: authoritativeTransfer.sourceLocationId,
          destinationLocationId: authoritativeTransfer.destinationLocationId,
          lineCount: authoritativeTransfer.lines.length,
          discrepancyFlag
        }
      }
    });
    });
  } catch (error) {
    if (isTransferReceiptIdempotencyUniqueConstraintError(error)) {
      const racedReceipt = await prisma.inventoryTransferReceipt.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          idempotencyKey: values.idempotencyKey,
          inventoryTransferId: values.id
        },
        select: { idempotencyRequestHash: true, status: true }
      });
      if (
        racedReceipt?.idempotencyRequestHash === requestHashCandidate &&
        (racedReceipt.status === "POSTED" || racedReceipt.status === "REVERSED")
      ) {
        return;
      }
      throw new Error("TRANSFER_RECEIPT_IDEMPOTENCY_CONFLICT");
    }
    throw error;
  }
}

export async function settleInventoryTransferDiscrepancy(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferDiscrepancySettle);
  const values = settleTransferDiscrepancySchema.parse(Object.fromEntries(formData));

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      destinationLocationId: session.context.locationId
    },
    include: {
      lines: true,
      receipts: {
        where: {
          status: "POSTED",
          reversedAt: null
        },
        select: {
          id: true,
          receivedByUserId: true,
          discrepancyFlag: true
        }
      }
    }
  });
  if (!transfer) {
    throw new Error("TRANSFER_NOT_FOUND");
  }

  const discrepancyLines = transfer.lines
    .filter(
      (line) =>
        Number(line.rejectedQty) +
          Number(line.damagedQty) +
          Number(line.discrepancyQty) >
        0
    )
    .map((line) => ({
      lineId: line.id,
      lineNumber: line.lineNumber,
      rejectedQty: Number(line.rejectedQty),
      damagedQty: Number(line.damagedQty),
      discrepancyQty: Number(line.discrepancyQty)
    }));

  assertTransferCanSettleDiscrepancy({
    status: transfer.status,
    hasDiscrepancy:
      discrepancyLines.length > 0 ||
      transfer.receipts.some((receipt) => receipt.discrepancyFlag),
    actorUserId: session.user.id,
    requestedByUserId: transfer.requestedByUserId,
    dispatchedByUserId: transfer.dispatchedByUserId,
    activeReceiptReceiverUserIds: transfer.receipts.map(
      (receipt) => receipt.receivedByUserId
    )
  });

  await prisma.$transaction(async (tx) => {
    const [lockedTransfer] = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      version: number;
    }>>(Prisma.sql`
      SELECT t."id", t."status", t."version"
      FROM "InventoryTransfer" t
      WHERE t."id" = ${transfer.id}::uuid
        AND t."tenantId" = ${session.context.tenantId}::uuid
        AND t."companyId" = ${session.context.companyId}::uuid
        AND t."destinationLocationId" = ${session.context.locationId}::uuid
      FOR UPDATE OF t
    `);
    if (!lockedTransfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }
    const updated = await tx.inventoryTransfer.updateMany({
      where: {
        id: lockedTransfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        destinationLocationId: session.context.locationId,
        status: "DISPUTED",
        version: lockedTransfer.version
      },
      data: {
        status: "DISCREPANCY_SETTLED",
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("TRANSFER_DISCREPANCY_SETTLEMENT_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.discrepancy_settled",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: "DISPUTED" },
        afterData: { status: "DISCREPANCY_SETTLED" },
        metadata: {
          reason: values.settlementReason,
          evidenceReference: values.evidenceReference,
          settlementType: values.settlementType,
          nonPostingSettlement: true,
          receiptIds: transfer.receipts.map((receipt) => receipt.id),
          discrepancyLines
        }
      }
    });
  });
}

export async function reverseInventoryTransferReceipt(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferReceiptReverse);
  const values = reverseTransferReceiptSchema.parse(Object.fromEntries(formData));

  let receipt = await prisma.inventoryTransferReceipt.findFirst({
    where: {
      id: values.receiptId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryTransferId: values.id,
      inventoryTransfer: {
        destinationLocationId: session.context.locationId
      }
    },
    include: {
      inventoryTransfer: {
        include: {
          lines: {
            orderBy: { lineNumber: "asc" }
          }
        }
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          inventoryTransferLine: true,
          postedMovement: {
            include: {
              reversalMovements: true
            }
          }
        }
      }
    }
  });
  if (!receipt) {
    throw new Error("TRANSFER_RECEIPT_NOT_FOUND");
  }
  const loadedReceipt = receipt;
  let transfer = receipt.inventoryTransfer;
  assertAuthorizedLocation(session, transfer.destinationLocationId);
  assertTransferReceiptCanReverse(receipt.status, receipt.reversedAt);
  if (receipt.receivedByUserId === session.user.id) {
    throw new Error("TRANSFER_RECEIPT_SELF_REVERSAL_NOT_ALLOWED");
  }
  if (transfer.dispatchedByUserId === session.user.id) {
    throw new Error("TRANSFER_RECEIPT_DISPATCHER_REVERSAL_NOT_ALLOWED");
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const reversalInventoryLocationIds = loadedReceipt.lines.flatMap((line) => {
      if (Number(line.acceptedQty) <= 0 || !line.postedMovement) {
        return [];
      }
      return [
        line.postedMovement.inventoryLocationId,
        ...(line.postedMovement.relatedInventoryLocationId
          ? [line.postedMovement.relatedInventoryLocationId]
          : [])
      ];
    });
    const inventoryLocationLock =
      reversalInventoryLocationIds.length > 0
        ? await lockInventoryLocationsForPosting(
            tx,
            session,
            reversalInventoryLocationIds
          )
        : null;
    const [lockedTransfer] = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      updatedAt: Date;
      version: number;
      destinationLocationId: string;
    }>>(Prisma.sql`
      SELECT t."id", t."status", t."updatedAt", t."version", t."destinationLocationId"
      FROM "InventoryTransfer" t
      WHERE t."id" = ${values.id}::uuid
        AND t."tenantId" = ${session.context.tenantId}::uuid
        AND t."companyId" = ${session.context.companyId}::uuid
        AND t."destinationLocationId" = ${session.context.locationId}::uuid
      FOR UPDATE OF t
    `);
    if (!lockedTransfer) {
      throw new Error("TRANSFER_RECEIPT_NOT_FOUND");
    }
    await tx.$queryRaw(Prisma.sql`
      SELECT l."id"
      FROM "InventoryTransferLine" l
      WHERE l."inventoryTransferId" = ${lockedTransfer.id}::uuid
        AND l."tenantId" = ${session.context.tenantId}::uuid
        AND l."companyId" = ${session.context.companyId}::uuid
      ORDER BY l."lineNumber" ASC, l."id" ASC
      FOR UPDATE OF l
    `);
    const lockedReceiptRows = await tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
      SELECT r."id", r."updatedAt"
      FROM "InventoryTransferReceipt" r
      WHERE r."id" = ${loadedReceipt.id}::uuid
        AND r."tenantId" = ${session.context.tenantId}::uuid
        AND r."companyId" = ${session.context.companyId}::uuid
        AND r."inventoryTransferId" = ${lockedTransfer.id}::uuid
      FOR UPDATE OF r
    `);
    if (lockedReceiptRows.length !== 1) {
      throw new Error("TRANSFER_RECEIPT_NOT_FOUND");
    }
    const lockedReceiptLines = await tx.$queryRaw<
      Array<{ id: string; postedMovementId: string | null }>
    >(Prisma.sql`
      SELECT rl."id", rl."postedMovementId"
      FROM "InventoryTransferReceiptLine" rl
      WHERE rl."transferReceiptId" = ${loadedReceipt.id}::uuid
        AND rl."tenantId" = ${session.context.tenantId}::uuid
        AND rl."companyId" = ${session.context.companyId}::uuid
      ORDER BY rl."lineNumber" ASC, rl."id" ASC
      FOR UPDATE OF rl
    `);
    const originalMovementIdsToLock = lockedReceiptLines
      .map((line) => line.postedMovementId)
      .filter((id): id is string => Boolean(id));
    if (originalMovementIdsToLock.length > 0) {
      // InventoryMovement is append-only and the runtime role is intentionally
      // denied direct SELECT ... FOR UPDATE on that table. The ORM read uses
      // the runtime's approved read surface; inventory-location locks provide
      // the posting serialization boundary, while immutability protects the
      // movement lineage after it is read.
      const lockedOriginalMovements = await tx.inventoryMovement.findMany({
        where: {
          id: { in: originalMovementIdsToLock },
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      if (
        lockedOriginalMovements.length !== new Set(originalMovementIdsToLock).size
      ) {
        throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
      }
    }
    const authoritativeReceipt = await tx.inventoryTransferReceipt.findFirst({
      where: {
        id: loadedReceipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryTransferId: lockedTransfer.id
      },
      include: {
        inventoryTransfer: {
          include: { lines: { orderBy: { lineNumber: "asc" } } }
        },
        lines: {
          orderBy: { lineNumber: "asc" },
          include: {
            inventoryTransferLine: true,
            postedMovement: { include: { reversalMovements: true } }
          }
        }
      }
    });
    if (!authoritativeReceipt) {
      throw new Error("TRANSFER_RECEIPT_NOT_FOUND");
    }
    if (lockedReceiptLines.length !== authoritativeReceipt.lines.length) {
      throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
    }
    receipt = authoritativeReceipt;
    transfer = authoritativeReceipt.inventoryTransfer;
    // Reauthorize and validate endpoint lineage after the receipt graph is
    // rehydrated; the pre-lock session and line snapshots are not authoritative.
    await requirePermission(session, permissions.transferReceiptReverse);
    if (transfer.destinationLocationId !== session.context.locationId) {
      throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
    }
    assertTransferReceiptCanReverse(authoritativeReceipt.status, authoritativeReceipt.reversedAt);
    if (
      authoritativeReceipt.receivedByUserId === session.user.id ||
      transfer.dispatchedByUserId === session.user.id
    ) {
      throw new Error(
        authoritativeReceipt.receivedByUserId === session.user.id
          ? "TRANSFER_RECEIPT_SELF_REVERSAL_NOT_ALLOWED"
          : "TRANSFER_RECEIPT_DISPATCHER_REVERSAL_NOT_ALLOWED"
      );
    }
    if (
      authoritativeReceipt.lines.some(
        (line) =>
          line.inventoryTransferId !== transfer.id ||
          line.inventoryTransferLine.inventoryTransferId !== transfer.id ||
          line.inventoryTransferLine.itemId !== line.itemId ||
          line.inventoryTransferLine.uomId !== line.uomId
      )
    ) {
      throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
    }
    const receiptInventoryLocationIds = new Set(
      transfer.lines.flatMap((line) => [
        line.sourceInventoryLocationId,
        line.destinationInventoryLocationId
      ])
    );
    const receiptInventoryLocations = await tx.inventoryLocation.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        id: { in: [...receiptInventoryLocationIds] }
      },
      select: { id: true, locationId: true }
    });
    const receiptInventoryLocationById = new Map(
      receiptInventoryLocations.map((location) => [location.id, location.locationId])
    );
    if (
      receiptInventoryLocations.length !== receiptInventoryLocationIds.size ||
      transfer.lines.some(
        (line) =>
          receiptInventoryLocationById.get(line.sourceInventoryLocationId) !==
            transfer.sourceLocationId ||
          receiptInventoryLocationById.get(line.destinationInventoryLocationId) !==
            transfer.destinationLocationId
      )
    ) {
      throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
    }
    const authoritativeReversalLocationIds = new Set(
      authoritativeReceipt.lines.flatMap((line) => {
        if (Number(line.acceptedQty) <= 0 || !line.postedMovement) return [];
        return [
          line.postedMovement.inventoryLocationId,
          ...(line.postedMovement.relatedInventoryLocationId
            ? [line.postedMovement.relatedInventoryLocationId]
            : [])
        ];
      })
    );
    const initiallyLockedReversalLocationIds = new Set(reversalInventoryLocationIds);
    if (
      authoritativeReversalLocationIds.size !== initiallyLockedReversalLocationIds.size ||
      [...authoritativeReversalLocationIds].some(
        (id) => !initiallyLockedReversalLocationIds.has(id)
      )
    ) {
      throw new Error("TRANSFER_RECEIPT_SCOPE_CONFLICT");
    }
    await assertFreshTransferReceiptAuthority(
      tx,
      session,
      permissions.transferReceiptReverse,
      transfer.destinationLocationId,
    );
    await assertPrivilegedMfaForAction(session, {
      action: "inventory_transfer_receipt.reverse",
      enforcementScope: "all_sensitive",
      permissionCode: permissions.transferReceiptReverse,
      entityType: "InventoryTransferReceipt",
      entityId: authoritativeReceipt.id,
      reason:
        "Transfer receipt reversal creates counter-movements and requires privileged MFA evidence.",
      metadata: {
        transferId: authoritativeReceipt.inventoryTransferId,
        destinationLocationId: transfer.destinationLocationId
      }
    }, { transaction: tx });
    const claimed = await tx.inventoryTransferReceipt.updateMany({
      where: {
        id: receipt!.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "POSTED",
        reversedAt: null,
        updatedAt: authoritativeReceipt.updatedAt
      },
      data: { status: "REVERSING" }
    });
    if (claimed.count !== 1) {
      const current = await tx.inventoryTransferReceipt.findFirst({
        where: {
          id: receipt!.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        },
        select: { status: true, reversedAt: true }
      });
      if (current?.status === "REVERSED" || current?.reversedAt) {
        return;
      }
      throw new Error("TRANSFER_RECEIPT_NOT_POSTED_FOR_REVERSAL");
    }

    const originalMovementIds: string[] = [];
    const reversalMovementIds: string[] = [];
    const receiptLineIds: string[] = [];

    for (const line of receipt!.lines) {
      const acceptedQty = Number(line.acceptedQty);
      const rejectedQty = Number(line.rejectedQty);
      const damagedQty = Number(line.damagedQty);
      const discrepancyQty = Number(line.discrepancyQty);

      if (acceptedQty > 0) {
        const original = line.postedMovement;
        if (!original || !line.postedMovementId) {
          throw new Error("TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_REQUIRED");
        }
        if (original.movementType !== "TRANSFER_IN") {
          throw new Error("TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_INVALID");
        }
        if (
          original.tenantId !== session.context.tenantId ||
          original.companyId !== session.context.companyId ||
          original.inventoryLocationId !==
            line.inventoryTransferLine.destinationInventoryLocationId ||
          original.itemId !== line.itemId ||
          original.sourceDocumentType !== "InventoryTransfer" ||
          original.sourceDocumentId !== transfer.id ||
            original.sourceDocumentLineId !== line.inventoryTransferLineId
        ) {
          throw new Error("TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH");
        }
        if (
          Number(original.enteredQuantity) !== acceptedQty ||
          Number(original.quantityDeltaBaseUom) !== acceptedQty ||
          original.enteredUomId !== line.uomId ||
          original.baseUomId !== line.inventoryTransferLine.uomId ||
          original.lotNumber !== line.inventoryTransferLine.lotNumber ||
          (original.expiryDate?.getTime() ?? null) !==
            (line.inventoryTransferLine.expiryDate?.getTime() ?? null)
        ) {
          throw new Error("TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH");
        }
        if (original.reversalMovements.length > 0) {
          throw new Error("TRANSFER_RECEIPT_LINE_ALREADY_REVERSED");
        }

        const { movement } = await postInventoryMovementInTransaction(tx, session, inventoryLocationLock!, {
          inventoryLocationId: original.inventoryLocationId,
          relatedInventoryLocationId: original.relatedInventoryLocationId,
          itemId: original.itemId,
          movementType: "REVERSAL",
          occurredAt: now,
          enteredQuantity: Number(original.enteredQuantity),
          enteredUomId: original.enteredUomId,
          quantityDeltaBaseUom: -Number(original.quantityDeltaBaseUom),
          sourceDocumentType: "InventoryTransfer",
          sourceDocumentId: transfer.id,
          sourceDocumentLineId: line.inventoryTransferLineId,
          sourceEventKey: `receipt:${line.id}:reverse`,
          lotNumber: original.lotNumber,
          expiryDate: original.expiryDate,
          unitCost: original.unitCost ? Number(original.unitCost) : null,
          totalCost: original.totalCost ? Number(original.totalCost) : null,
          reasonCode: "TRANSFER_RECEIPT_REVERSAL",
          notes: values.reversalReason,
          reversalOfMovementId: original.id
        });
        originalMovementIds.push(original.id);
        reversalMovementIds.push(movement.id);
      }

      const updated = await tx.inventoryTransferLine.updateMany({
        where: {
          id: line.inventoryTransferLineId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryTransferId: transfer.id,
          receivedQty: line.inventoryTransferLine.receivedQty,
          rejectedQty: line.inventoryTransferLine.rejectedQty,
          damagedQty: line.inventoryTransferLine.damagedQty,
          discrepancyQty: line.inventoryTransferLine.discrepancyQty
        },
        data: {
          receivedQty: { decrement: acceptedQty },
          rejectedQty: { decrement: rejectedQty },
          damagedQty: { decrement: damagedQty },
          discrepancyQty: { decrement: discrepancyQty }
        }
      });
      if (updated.count !== 1) {
        throw new Error("TRANSFER_RECEIPT_REVERSAL_ROLLUP_INVALID");
      }
      receiptLineIds.push(line.id);
    }

    const updatedLines = await tx.inventoryTransferLine.findMany({
      where: {
        inventoryTransferId: transfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      orderBy: { lineNumber: "asc" }
    });
    const nextStatus = calculateTransferReceiptStatus(
      updatedLines.map((line) => ({
        dispatchedQty: Number(line.dispatchedQty),
        receivedQty: Number(line.receivedQty),
        rejectedQty: Number(line.rejectedQty),
        damagedQty: Number(line.damagedQty),
        discrepancyQty: Number(line.discrepancyQty)
      }))
    );

    const latestRemainingReceipt = await tx.inventoryTransferReceipt.findFirst({
      where: {
        inventoryTransferId: transfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "POSTED",
        reversedAt: null,
        id: { not: receipt.id }
      },
      orderBy: { receivedAt: "desc" },
      select: {
        receivedAt: true,
        receivedByUserId: true
      }
    });

    const reversed = await tx.inventoryTransferReceipt.updateMany({
      where: {
        id: receipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "REVERSING",
        reversedAt: null
      },
      data: {
        status: "REVERSED",
        reversedAt: now,
        reversedByUserId: session.user.id,
        reversalReason: values.reversalReason
      }
    });
    if (reversed.count !== 1) {
      throw new Error("TRANSFER_RECEIPT_REVERSAL_STATE_CONFLICT");
    }

    const updatedTransfer = await tx.inventoryTransfer.updateMany({
      where: {
        id: transfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        destinationLocationId: session.context.locationId,
        status: lockedTransfer.status,
        updatedAt: lockedTransfer.updatedAt,
        version: lockedTransfer.version
      },
      data: {
        status: nextStatus,
        receivedAt: latestRemainingReceipt?.receivedAt ?? null,
        receivedByUserId: latestRemainingReceipt?.receivedByUserId ?? null,
        version: { increment: 1 }
      }
    });
    if (updatedTransfer.count !== 1) {
      throw new Error("TRANSFER_RECEIPT_REVERSAL_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.receipt_reversed",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: transfer.status },
        afterData: { status: nextStatus },
        metadata: {
          receiptId: receipt.id,
          receiptLineIds,
          reversalReason: values.reversalReason,
          originalMovementIds,
          reversalMovementIds
        }
      }
    });
  });
}

export async function cancelInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferCancel);
  const values = cancelTransferSchema.parse(Object.fromEntries(formData));

  await prisma.$transaction(async (tx) => {
    const [transfer] = await tx.$queryRaw<Array<{
      id: string;
      tenantId: string;
      companyId: string;
      sourceLocationId: string;
      destinationLocationId: string;
      requestedByUserId: string;
      publicReference: string;
      status: string;
      updatedAt: Date;
      version: number;
    }>>(Prisma.sql`
      SELECT t."id", t."tenantId", t."companyId", t."sourceLocationId",
        t."destinationLocationId", t."requestedByUserId", t."publicReference",
        t."status", t."updatedAt", t."version"
      FROM "InventoryTransfer" t
      WHERE t."id" = ${values.id}::uuid
        AND t."tenantId" = ${session.context.tenantId}::uuid
        AND t."companyId" = ${session.context.companyId}::uuid
        AND (t."sourceLocationId" = ${session.context.locationId}::uuid
          OR t."destinationLocationId" = ${session.context.locationId}::uuid)
      FOR UPDATE OF t
    `);
    if (!transfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }
    await requirePermission(session, permissions.transferCancel);
    assertTransferCanCancel(transfer.status);

    // An admitted pilot source may only be cancelled with its exact immutable
    // submission intent and active graph. Lock the source first, then the
    // intent, then let the shared helper take the graph/step locks. This
    // prevents a generic or historical approval graph from being cancelled on
    // behalf of a different transfer cycle.
    const pendingApprovalIntent = transfer.status === "PENDING_APPROVAL"
      ? await tx.$queryRaw<Array<{
          approvalInstanceId: string;
          sourceVersionAfter: number;
          approvalDocumentType: string;
          activationFamily: string;
          activationStatus: string;
        }>>(Prisma.sql`
          SELECT i."approvalInstanceId", i."sourceVersionAfter",
            i."approvalDocumentType", i."activationFamily", i."activationStatus"
          FROM "InventoryTransferApprovalSubmissionIntent" i
          JOIN "ApprovalInstance" ai ON ai."id" = i."approvalInstanceId"
          WHERE i."tenantId" = ${transfer.tenantId}::uuid
            AND i."companyId" = ${transfer.companyId}::uuid
            AND i."inventoryTransferId" = ${transfer.id}::uuid
            AND i."approvalDocumentType" = 'InventoryTransfer'
            AND i."activationFamily" = 'InventoryTransfer'
            AND i."activationStatus" = 'ACTIVE'
            AND ai."tenantId" = ${transfer.tenantId}::uuid
            AND ai."companyId" = ${transfer.companyId}::uuid
            AND ai."documentType" = 'InventoryTransfer'
            AND ai."documentId" = ${transfer.id}::uuid
            AND ai.status = 'PENDING'::"ApprovalStatus"
          ORDER BY i."createdAt" ASC, i."id" ASC
        `)
      : [];
    if (transfer.status === "PENDING_APPROVAL" && pendingApprovalIntent.length !== 1) {
      throw new Error("TRANSFER_CANCELLATION_APPROVAL_LINEAGE_CONFLICT");
    }
    const pendingIntent = pendingApprovalIntent[0];
    if (
      pendingIntent &&
      (pendingIntent.sourceVersionAfter !== transfer.version ||
        pendingIntent.approvalDocumentType !== "InventoryTransfer" ||
        pendingIntent.activationFamily !== "InventoryTransfer" ||
        pendingIntent.activationStatus !== "ACTIVE")
    ) {
      throw new Error("TRANSFER_CANCELLATION_APPROVAL_LINEAGE_CONFLICT");
    }
    const approvalCancellation = pendingIntent
      ? await terminatePendingApprovalForCancellation(tx, {
          tenantId: transfer.tenantId,
          companyId: transfer.companyId,
          documentType: "InventoryTransfer",
          documentId: transfer.id,
          policy: "APPROVAL_REQUIRED",
          // Admission remains cancellable after a rollout flag is disabled;
          // the locked, typed intent proves this source entered the pilot.
          forceWhenDisabled: true
        })
      : null;
    if (
      pendingIntent &&
      (approvalCancellation?.mode !== "CANCELLED" ||
        approvalCancellation.approvalInstanceId !== pendingIntent.approvalInstanceId)
    ) {
      throw new Error("TRANSFER_CANCELLATION_APPROVAL_LINEAGE_CONFLICT");
    }

    const locations = await tx.location.findMany({
      where: {
        tenantId: transfer.tenantId,
        companyId: transfer.companyId,
        id: { in: [transfer.sourceLocationId, transfer.destinationLocationId] },
        status: "ACTIVE"
      },
      select: { id: true }
    });
    assertTransferLocationsDistinct(transfer.sourceLocationId, transfer.destinationLocationId);
    if (locations.length !== 2) {
      throw new Error("TRANSFER_LOCATION_SCOPE_CONFLICT");
    }

    const lines = await tx.$queryRaw<Array<{
      id: string;
      dispatchedQty: Prisma.Decimal;
      receivedQty: Prisma.Decimal;
      rejectedQty: Prisma.Decimal;
      damagedQty: Prisma.Decimal;
      discrepancyQty: Prisma.Decimal;
    }>>(Prisma.sql`
      SELECT l."id", l."dispatchedQty", l."receivedQty", l."rejectedQty",
        l."damagedQty", l."discrepancyQty"
      FROM "InventoryTransferLine" l
      WHERE l."inventoryTransferId" = ${transfer.id}::uuid
        AND l."tenantId" = ${transfer.tenantId}::uuid
        AND l."companyId" = ${transfer.companyId}::uuid
      ORDER BY l."lineNumber" ASC, l."id" ASC
      FOR UPDATE OF l
    `);
    if (lines.some((line) => [
      line.dispatchedQty,
      line.receivedQty,
      line.rejectedQty,
      line.damagedQty,
      line.discrepancyQty
    ].some((quantity) => Number(quantity) !== 0))) {
      throw new Error("TRANSFER_CANCELLATION_RESIDUE_CONFLICT");
    }

    const receipts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT r."id"
      FROM "InventoryTransferReceipt" r
      WHERE r."inventoryTransferId" = ${transfer.id}::uuid
        AND r."tenantId" = ${transfer.tenantId}::uuid
        AND r."companyId" = ${transfer.companyId}::uuid
      ORDER BY r."id" ASC
      FOR UPDATE OF r
    `);
    const [movementResidue, approvalResidue] = await Promise.all([
      tx.inventoryMovement.count({
        where: {
          tenantId: transfer.tenantId,
          companyId: transfer.companyId,
          sourceDocumentType: "InventoryTransfer",
          sourceDocumentId: transfer.id
        }
      }),
      tx.approvalInstance.count({
        where: {
          tenantId: transfer.tenantId,
          companyId: transfer.companyId,
          documentType: "InventoryTransfer",
          documentId: transfer.id,
          status: "PENDING"
        }
      })
    ]);
    if (receipts.length > 0 || movementResidue > 0 || approvalResidue > 0) {
      throw new Error("TRANSFER_CANCELLATION_RESIDUE_CONFLICT");
    }

    const cancelled = await tx.inventoryTransfer.updateMany({
      where: {
        id: transfer.id,
        tenantId: transfer.tenantId,
        companyId: transfer.companyId,
        sourceLocationId: transfer.sourceLocationId,
        destinationLocationId: transfer.destinationLocationId,
        status: transfer.status,
        updatedAt: transfer.updatedAt,
        version: transfer.version
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: values.cancellationReason,
        version: { increment: 1 }
      }
    });
    if (cancelled.count !== 1) {
      throw new Error("TRANSFER_NOT_CANCELLABLE");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.cancelled",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: transfer.status },
        afterData: { status: "CANCELLED" },
        metadata: {
          reason: values.cancellationReason,
          approvalInstanceId: approvalCancellation?.approvalInstanceId ?? null,
          nonPostingCancellation: true
        }
      }
    });
    await recordWorkflowNotifications(tx, {
      tenantId: transfer.tenantId,
      companyId: transfer.companyId,
      locationId: transfer.destinationLocationId,
      recipientUserIds: [transfer.requestedByUserId],
      notificationType: "INVENTORY_TRANSFER_CANCELLED",
      priority: "NORMAL",
      title: `Inventory Transfer ${transfer.publicReference} cancelled`,
      body: `The transfer was cancelled before dispatch. ${values.cancellationReason}`,
      deepLink: `/transfers/${transfer.id}`,
      entityType: "InventoryTransfer",
      entityId: transfer.id,
      sourceEventKey: `inventory-transfer-cancelled:${transfer.id}:${transfer.version + 1}`,
      recipientBasis: "requester",
      metadata: {
        approvalInstanceId: approvalCancellation?.approvalInstanceId ?? null,
        nonPostingCancellation: true
      }
    });
  });
}
