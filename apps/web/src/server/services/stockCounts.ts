import { prisma, Prisma, type TransactionClient } from "@ogfi/database";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canUseStockCounts, permissions, requirePermission } from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext
} from "./context";
import type { CsvRow } from "./csv";
import {
  lockInventoryLocationForPosting,
  normalizeInventoryLotKey
} from "./inventory";
import { getStockCountCadencePolicy } from "./policySettings";
import { nextStockAdjustmentReference } from "./stockAdjustments";
import { dateOnlyInTimeZone } from "./projectDates";
import {
  compareDashboardTaskOrder,
  dashboardTaskAfterWhere,
  type DashboardTaskCursor,
  type DashboardTaskFilter
} from "./dashboardTasks";
import {
  assertAnyEligibleApprovalActorForStep,
  configureApprovalStepRouting
} from "./approvalRouting";
import { terminatePendingApprovalForCancellation } from "./approvalCancellation";
import { getApprovalRoutingPolicy } from "./approvalRoutingRegistry";
import { withApprovalProducerTransaction } from "./approvalProducerBarrier";
import {
  classifyStockCountAttemptForPilotApproval,
  INVENTORY_PILOT_APPROVAL_ERRORS,
  inventoryPilotCanonicalJson,
  inventoryPilotDigest,
  type InventoryPilotApprovalAttestation
} from "./inventoryPilotApprovalPolicy";
import { recordWorkflowNotifications } from "./notifications";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";
import {
  CONTROLLED_EVIDENCE_QUALIFICATION_RUNTIME_ENABLED
} from "./controlledEvidenceQualification";

const countTypes = ["FULL", "CYCLE", "SPOT", "HIGH_VALUE", "OPENING"] as const;

const optionalDateSchema = z
  .string()
  .optional()
  .transform((value) => (value ? new Date(value) : undefined));

const scheduleStockCountSchema = z.object({
  inventoryLocationId: z.string().uuid(),
  countType: z.enum(countTypes),
  scheduledDate: optionalDateSchema,
  blindCount: z.coerce.boolean().default(true),
  freezeMovements: z.coerce.boolean().default(false)
});

const stockCountActionSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(200).optional()
});

const stockCountLineEntrySchema = z.object({
  lineId: z.string().uuid(),
  countedQuantityBaseUom: z.coerce.number().min(0),
  notes: z.string().trim().max(1000).optional()
});

const saveStockCountSchema = z.object({
  id: z.string().uuid(),
  lines: z.array(stockCountLineEntrySchema).min(1)
});

const reviewStockCountSchema = z.object({
  id: z.string().uuid(),
  reviewAction: z.enum(["REVIEW", "RECOUNT"]),
  reviewNotes: z.string().trim().min(5).max(1000)
});

const cancelStockCountSchema = z.object({
  id: z.string().uuid(),
  cancellationReason: z.string().trim().min(5).max(500)
});

const requestStockCountRecountSchema = z.object({
  id: z.string().uuid(),
  assignedToUserId: z.string().uuid(),
  expectedSessionVersion: z.coerce.number().int().positive(),
  expectedAttemptVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
  evidenceReference: z.string().trim().min(1).max(240),
  idempotencyKey: z.string().trim().min(1).max(120)
});

const STOCK_COUNT_RECOUNT_RECOVERY_V1_ENABLED =
  process.env.STOCK_COUNT_RECOUNT_RECOVERY_V1_ENABLED === "true";
const STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED =
  process.env.STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED === "true";

export function assertStockCountCanStart(status: string) {
  if (status !== "DRAFT") {
    throw new Error("STOCK_COUNT_NOT_DRAFT_FOR_START");
  }
}

export function assertStockCountCanEnter(status: string) {
  if (status !== "IN_PROGRESS") {
    throw new Error("STOCK_COUNT_NOT_OPEN_FOR_ENTRY");
  }
}

export function assertStockCountCanSubmit(status: string) {
  if (status !== "IN_PROGRESS") {
    throw new Error("STOCK_COUNT_NOT_OPEN_FOR_SUBMIT");
  }
}

export function assertStockCountAssignedActor(input: {
  assignedToUserId: string | null;
  actorUserId: string;
}) {
  if (!input.assignedToUserId || input.assignedToUserId !== input.actorUserId) {
    throw new Error("STOCK_COUNT_NOT_ASSIGNED_TO_ACTOR");
  }
}

export function isStockCountScheduledStartEligible(
  scheduledDate: Date | null,
  now = new Date()
) {
  return (
    scheduledDate === null ||
    scheduledDate.toISOString().slice(0, 10) <= dateOnlyInTimeZone(now)
  );
}

type StockCountProtectedRead = {
  status: string;
  blindCount: boolean;
  createdByUserId: string;
  lines: Array<{
    countedQuantityBaseUom: unknown;
    countedByUserId: string | null;
    countedAt: Date | null;
  }>;
};

function hasCompleteStockCountLineage(count: StockCountProtectedRead) {
  return (
    count.lines.length > 0 &&
    count.lines.every(
      (line) =>
        line.countedQuantityBaseUom !== null &&
        Boolean(line.countedByUserId) &&
        Boolean(line.countedAt)
    )
  );
}

export function canExposeStockCountProtectedFacts(
  session: SessionContext,
  count: StockCountProtectedRead
) {
  if (!session.permissionCodes.includes(permissions.stockCountReview)) {
    return false;
  }
  if (!count.blindCount) {
    return true;
  }
  if (count.status === "REVIEWED") {
    return true;
  }
  return canReviewStockCountCurrentActor(session, count);
}

export function canReviewStockCountCurrentActor(
  session: SessionContext,
  count: StockCountProtectedRead
) {
  return (
    session.permissionCodes.includes(permissions.stockCountReview) &&
    count.status === "SUBMITTED" &&
    hasCompleteStockCountLineage(count) &&
    count.createdByUserId !== session.user.id &&
    count.lines.every((line) => line.countedByUserId !== session.user.id)
  );
}

function assertStockCountReviewLineage(
  count: Pick<StockCountProtectedRead, "lines">
) {
  if (!hasCompleteStockCountLineage({
    status: "SUBMITTED",
    blindCount: true,
    createdByUserId: "lineage-check",
    lines: count.lines
  })) {
    throw new Error("STOCK_COUNT_REVIEW_LINEAGE_INCOMPLETE");
  }
}

export function assertStockCountCanReview(status: string) {
  if (status !== "SUBMITTED") {
    throw new Error("STOCK_COUNT_NOT_SUBMITTED_FOR_REVIEW");
  }
}

export function assertStockCountReviewerSegregation(input: {
  reviewerUserId: string;
  createdByUserId: string;
  countedByUserIds: Array<string | null>;
}) {
  if (input.reviewerUserId === input.createdByUserId) {
    throw new Error("STOCK_COUNT_SELF_REVIEW_BLOCKED");
  }
  if (input.countedByUserIds.includes(input.reviewerUserId)) {
    throw new Error("STOCK_COUNT_SELF_REVIEW_BLOCKED");
  }
}

export function assertStockCountCanGenerateAdjustment(status: string) {
  if (status !== "REVIEWED") {
    throw new Error("STOCK_COUNT_NOT_REVIEWED_FOR_ADJUSTMENT");
  }
}

export function assertStockCountCanCancel(status: string) {
  if (status === "REVIEWED" || status === "CANCELLED") {
    throw new Error("STOCK_COUNT_NOT_CANCELLABLE");
  }
}

export function calculateCountVariance(
  countedQuantityBaseUom: number,
  systemQuantityBaseUom: number
) {
  if (!Number.isFinite(countedQuantityBaseUom) || countedQuantityBaseUom < 0) {
    throw new Error("STOCK_COUNT_QUANTITY_INVALID");
  }
  return countedQuantityBaseUom - systemQuantityBaseUom;
}

export function filterCountVarianceLines<
  T extends {
    countedQuantityBaseUom: unknown;
    varianceQuantityBaseUom: unknown;
  }
>(lines: T[]) {
  if (lines.some((line) => line.countedQuantityBaseUom === null)) {
    throw new Error("STOCK_COUNT_HAS_UNCOUNTED_LINES");
  }
  return lines.filter(
    (line) => Number(line.varianceQuantityBaseUom ?? 0) !== 0
  );
}

export function recommendedStockCountCadenceDays(
  countType: string,
  policy: {
    standardFrequencyDays: number;
    highRiskFrequencyDays: number;
  }
) {
  return countType === "HIGH_VALUE"
    ? policy.highRiskFrequencyDays
    : policy.standardFrequencyDays;
}

async function nextStockCountReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.stockCountSession.count({
    where: {
      companyId,
      publicReference: { startsWith: `SC-${year}-` }
    }
  });
  return `SC-${year}-${String(count + 1).padStart(5, "0")}`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function requireStockCountRead(session: SessionContext) {
  if (!canUseStockCounts(session.permissionCodes)) {
    await requirePermission(session, permissions.stockCountView);
  }
}

function scopedStockCountWhere(session: SessionContext, id?: string) {
  return {
    ...(id ? { id } : {}),
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    inventoryLocation: {
      locationId: session.context.locationId
    }
  };
}

type LockedStockCount = {
  id: string;
  currentAttemptId: string | null;
  currentAttemptVersion: number | null;
  inventoryLocationId: string;
  status: string;
  blindCount: boolean;
  freezeMovements: boolean;
  scheduledDate: Date | null;
  createdByUserId: string;
  assignedToUserId: string | null;
  reviewedByUserId: string | null;
  version: number;
  updatedAt: Date;
  databaseNow: Date;
};

async function findScopedStockCountLocation(
  session: SessionContext,
  id: string
) {
  const count = await prisma.stockCountSession.findFirst({
    where: scopedStockCountWhere(session, id),
    select: { id: true, inventoryLocationId: true }
  });
  if (!count) {
    throw new Error("STOCK_COUNT_NOT_FOUND");
  }
  return count;
}

async function lockScopedStockCount(
  tx: TransactionClient,
  session: SessionContext,
  id: string,
  inventoryLocationId: string
) {
  const rows = await tx.$queryRaw<LockedStockCount[]>(Prisma.sql`
    SELECT sc.id,
           sc."currentAttemptId",
           ca.version AS "currentAttemptVersion",
           sc."inventoryLocationId",
           sc.status,
           sc."blindCount",
           sc."freezeMovements",
           sc."scheduledDate",
           sc."createdByUserId",
           sc."assignedToUserId",
           sc."reviewedByUserId",
           sc.version,
           sc."updatedAt",
           clock_timestamp() AS "databaseNow"
      FROM "StockCountSession" sc
      LEFT JOIN "StockCountAttempt" ca
        ON ca.id = sc."currentAttemptId"
       AND ca."stockCountSessionId" = sc.id
       AND ca."tenantId" = sc."tenantId"
       AND ca."companyId" = sc."companyId"
       AND ca."inventoryLocationId" = sc."inventoryLocationId"
      JOIN "InventoryLocation" il
        ON il.id = sc."inventoryLocationId"
       AND il."tenantId" = sc."tenantId"
       AND il."companyId" = sc."companyId"
     WHERE sc.id = ${id}::uuid
       AND sc."tenantId" = ${session.context.tenantId}::uuid
       AND sc."companyId" = ${session.context.companyId}::uuid
       AND sc."inventoryLocationId" = ${inventoryLocationId}::uuid
       AND (sc."currentAttemptId" IS NULL OR ca.id IS NOT NULL)
       AND il."locationId" = ${session.context.locationId}::uuid
     FOR UPDATE OF sc
  `);
  const count = rows[0];
  if (!count || rows.length !== 1) {
    throw new Error("STOCK_COUNT_NOT_FOUND");
  }
  if (count.currentAttemptId) {
    const attempts = await tx.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
      SELECT id, version
        FROM "StockCountAttempt"
       WHERE id = ${count.currentAttemptId}::uuid
         AND "stockCountSessionId" = ${count.id}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
         AND "inventoryLocationId" = ${count.inventoryLocationId}::uuid
       FOR UPDATE
    `);
    const attempt = attempts[0];
    if (!attempt || attempts.length !== 1) {
      throw new Error("STOCK_COUNT_ATTEMPT_NOT_LINKED");
    }
    count.currentAttemptVersion = attempt.version;
  }
  return count;
}

/**
 * Resolves a locked additive attempt-1 record for the legacy first-pass
 * session during the reversible cutover. Callers combine any required relink
 * with their own session mutation so one successful workflow increments the
 * session aggregate version exactly once.
 */
async function ensureStockCountAttempt1(
  tx: TransactionClient,
  session: SessionContext,
  count: LockedStockCount
) {
  if (count.currentAttemptId) {
    if (count.currentAttemptVersion === null) {
      throw new Error("STOCK_COUNT_ATTEMPT_NOT_LINKED");
    }
    return {
      id: count.currentAttemptId,
      version: count.currentAttemptVersion,
      needsSessionLink: false
    };
  }
  const existingAttempts = await tx.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
    SELECT id, version
      FROM "StockCountAttempt"
     WHERE "stockCountSessionId" = ${count.id}::uuid
       AND "tenantId" = ${session.context.tenantId}::uuid
       AND "companyId" = ${session.context.companyId}::uuid
       AND "inventoryLocationId" = ${count.inventoryLocationId}::uuid
       AND "attemptNumber" = 1
     FOR UPDATE
  `);
  if (existingAttempts.length === 1) {
    return {
      id: existingAttempts[0]!.id,
      version: existingAttempts[0]!.version,
      needsSessionLink: true
    };
  }
  if (existingAttempts.length > 1) {
    throw new Error("STOCK_COUNT_ATTEMPT_LINEAGE_INVALID");
  }
  const rows = await tx.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
    INSERT INTO "StockCountAttempt" (
      "stockCountSessionId", "tenantId", "companyId", "inventoryLocationId",
      "attemptNumber", "status", "blindCount", "freezeMovements",
      "createdByUserId", "assignedToUserId", "reviewedByUserId",
      "cutoffAt", "startedAt", "submittedAt", "reviewedAt", "cancelledAt",
      "cancellationReason", "reviewNotes",
      "createdAt", "updatedAt"
    )
    SELECT sc.id, sc."tenantId", sc."companyId", sc."inventoryLocationId",
           1, sc.status, sc."blindCount", sc."freezeMovements",
           sc."createdByUserId", sc."assignedToUserId", sc."reviewedByUserId",
           sc."cutoffAt", sc."startedAt", sc."submittedAt", sc."reviewedAt", sc."cancelledAt",
           sc."cancellationReason", sc."reviewNotes",
           sc."createdAt", sc."updatedAt"
      FROM "StockCountSession" sc
     WHERE sc.id = ${count.id}::uuid
       AND sc."tenantId" = ${session.context.tenantId}::uuid
       AND sc."companyId" = ${session.context.companyId}::uuid
    RETURNING id, version
  `);
  const attempt = rows[0];
  if (!attempt) {
    throw new Error("STOCK_COUNT_ATTEMPT_CREATE_FAILED");
  }
  return { id: attempt.id, version: attempt.version, needsSessionLink: true };
}

async function syncStockCountAttempt1Lines(
  tx: TransactionClient,
  session: SessionContext,
  attemptId: string,
  stockCountSessionId: string,
  inventoryLocationId: string
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "StockCountAttemptLine" (
      "id", "stockCountAttemptId", "tenantId", "companyId", "inventoryLocationId",
      "itemId", "uomId", "lineNumber", "lotKey", "lotNumber", "expiryDate",
      "systemQuantityBaseUom", "countedQuantityBaseUom", "varianceQuantityBaseUom",
      "notes", "countedByUserId", "countedAt", "legacyStockCountLineId",
      "createdAt", "updatedAt"
    )
    SELECT l.id, ${attemptId}::uuid, l."tenantId", l."companyId", l."inventoryLocationId",
           l."itemId", l."uomId", l."lineNumber", l."lotKey", l."lotNumber", l."expiryDate",
           l."systemQuantityBaseUom", l."countedQuantityBaseUom", l."varianceQuantityBaseUom",
           l.notes, l."countedByUserId", l."countedAt", l.id, l."createdAt", l."updatedAt"
      FROM "StockCountLine" l
     WHERE l."stockCountSessionId" = ${stockCountSessionId}::uuid
       AND l."tenantId" = ${session.context.tenantId}::uuid
       AND l."companyId" = ${session.context.companyId}::uuid
       AND l."inventoryLocationId" = ${inventoryLocationId}::uuid
    ON CONFLICT ("legacyStockCountLineId") DO NOTHING
  `);
}

type StockCountAttemptParityRow = {
  currentAttemptId: string | null;
  sessionStatus: string;
  attemptStatus: string;
  sessionBlindCount: boolean;
  attemptBlindCount: boolean;
  sessionFreezeMovements: boolean;
  attemptFreezeMovements: boolean;
  sessionCreatedByUserId: string;
  attemptCreatedByUserId: string;
  sessionAssignedToUserId: string | null;
  attemptAssignedToUserId: string | null;
  sessionReviewedByUserId: string | null;
  attemptReviewedByUserId: string | null;
  sessionCutoffAt: Date | null;
  attemptCutoffAt: Date | null;
  sessionStartedAt: Date | null;
  attemptStartedAt: Date | null;
  sessionSubmittedAt: Date | null;
  attemptSubmittedAt: Date | null;
  sessionReviewedAt: Date | null;
  attemptReviewedAt: Date | null;
  sessionCancelledAt: Date | null;
  attemptCancelledAt: Date | null;
  sessionCancellationReason: string | null;
  attemptCancellationReason: string | null;
  sessionReviewNotes: string | null;
  attemptReviewNotes: string | null;
  legacyLineCount: number;
  attemptLineCount: number;
  legacyDigest: string;
  attemptDigest: string;
};

/**
 * Compares the compatibility line projection with the current immutable
 * attempt without exposing line facts. A mismatch fails closed; reads never
 * silently fall back to divergent mutable evidence.
 */
export async function assertStockCountAttemptLineParity(
  session: SessionContext,
  stockCountSessionId: string
) {
  const rows = await prisma.$queryRaw<StockCountAttemptParityRow[]>(Prisma.sql`
    SELECT sc."currentAttemptId",
           sc.status AS "sessionStatus",
           a.status AS "attemptStatus",
           sc."blindCount" AS "sessionBlindCount",
           a."blindCount" AS "attemptBlindCount",
           sc."freezeMovements" AS "sessionFreezeMovements",
           a."freezeMovements" AS "attemptFreezeMovements",
           sc."createdByUserId" AS "sessionCreatedByUserId",
           a."createdByUserId" AS "attemptCreatedByUserId",
           sc."assignedToUserId" AS "sessionAssignedToUserId",
           a."assignedToUserId" AS "attemptAssignedToUserId",
           sc."reviewedByUserId" AS "sessionReviewedByUserId",
           a."reviewedByUserId" AS "attemptReviewedByUserId",
           sc."cutoffAt" AS "sessionCutoffAt",
           a."cutoffAt" AS "attemptCutoffAt",
           sc."startedAt" AS "sessionStartedAt",
           a."startedAt" AS "attemptStartedAt",
           sc."submittedAt" AS "sessionSubmittedAt",
           a."submittedAt" AS "attemptSubmittedAt",
           sc."reviewedAt" AS "sessionReviewedAt",
           a."reviewedAt" AS "attemptReviewedAt",
           sc."cancelledAt" AS "sessionCancelledAt",
           a."cancelledAt" AS "attemptCancelledAt",
           sc."cancellationReason" AS "sessionCancellationReason",
           a."cancellationReason" AS "attemptCancellationReason",
           sc."reviewNotes" AS "sessionReviewNotes",
           a."reviewNotes" AS "attemptReviewNotes",
           (
             SELECT COUNT(*)::int
               FROM "StockCountLine" l
              WHERE l."stockCountSessionId" = sc.id
                AND l."tenantId" = sc."tenantId"
                AND l."companyId" = sc."companyId"
                AND l."inventoryLocationId" = sc."inventoryLocationId"
           ) AS "legacyLineCount",
           (
             SELECT COUNT(*)::int
               FROM "StockCountAttemptLine" al
              WHERE al."stockCountAttemptId" = sc."currentAttemptId"
                AND al."tenantId" = sc."tenantId"
                AND al."companyId" = sc."companyId"
                AND al."inventoryLocationId" = sc."inventoryLocationId"
           ) AS "attemptLineCount",
           md5(COALESCE((
             SELECT string_agg(concat_ws('|', l.id::text, l."itemId"::text,
               l."uomId"::text, l."lineNumber"::text, l."lotKey",
               l."lotNumber", l."expiryDate"::text,
               l."systemQuantityBaseUom"::text, l."countedQuantityBaseUom"::text,
               l."varianceQuantityBaseUom"::text, l.notes,
               l."countedByUserId"::text, l."countedAt"::text), '||'
               ORDER BY l."lineNumber", l.id)
               FROM "StockCountLine" l
              WHERE l."stockCountSessionId" = sc.id
                AND l."tenantId" = sc."tenantId"
                AND l."companyId" = sc."companyId"
                AND l."inventoryLocationId" = sc."inventoryLocationId"
           ), '')) AS "legacyDigest",
           md5(COALESCE((
             SELECT string_agg(concat_ws('|', COALESCE(al."legacyStockCountLineId"::text, al.id::text), al."itemId"::text,
               al."uomId"::text, al."lineNumber"::text, al."lotKey",
               al."lotNumber", al."expiryDate"::text,
               al."systemQuantityBaseUom"::text, al."countedQuantityBaseUom"::text,
               al."varianceQuantityBaseUom"::text, al.notes,
               al."countedByUserId"::text, al."countedAt"::text), '||'
               ORDER BY al."lineNumber", COALESCE(al."legacyStockCountLineId", al.id))
               FROM "StockCountAttemptLine" al
              WHERE al."stockCountAttemptId" = sc."currentAttemptId"
                AND al."tenantId" = sc."tenantId"
                AND al."companyId" = sc."companyId"
                AND al."inventoryLocationId" = sc."inventoryLocationId"
           ), '')) AS "attemptDigest"
      FROM "StockCountSession" sc
      JOIN "StockCountAttempt" a
        ON a.id = sc."currentAttemptId"
       AND a."stockCountSessionId" = sc.id
       AND a."tenantId" = sc."tenantId"
       AND a."companyId" = sc."companyId"
       AND a."inventoryLocationId" = sc."inventoryLocationId"
     WHERE sc.id = ${stockCountSessionId}::uuid
       AND sc."tenantId" = ${session.context.tenantId}::uuid
       AND sc."companyId" = ${session.context.companyId}::uuid
       AND sc."inventoryLocationId" IN (
         SELECT il.id FROM "InventoryLocation" il
          WHERE il.id = sc."inventoryLocationId"
            AND il."tenantId" = ${session.context.tenantId}::uuid
            AND il."companyId" = ${session.context.companyId}::uuid
            AND il."locationId" = ${session.context.locationId}::uuid
       )
  `);
  const parity = rows[0];
  const sameDate = (left: Date | null, right: Date | null) =>
    left?.getTime() === right?.getTime();
  if (!parity || !parity.currentAttemptId) {
    throw new Error("STOCK_COUNT_ATTEMPT_LINE_PARITY_FAILED");
  }
  const headerMismatch =
    parity.sessionStatus !== parity.attemptStatus ||
    parity.sessionBlindCount !== parity.attemptBlindCount ||
    parity.sessionFreezeMovements !== parity.attemptFreezeMovements ||
    parity.sessionCreatedByUserId !== parity.attemptCreatedByUserId ||
    parity.sessionAssignedToUserId !== parity.attemptAssignedToUserId ||
    parity.sessionReviewedByUserId !== parity.attemptReviewedByUserId ||
    !sameDate(parity.sessionCutoffAt, parity.attemptCutoffAt) ||
    !sameDate(parity.sessionStartedAt, parity.attemptStartedAt) ||
    !sameDate(parity.sessionSubmittedAt, parity.attemptSubmittedAt) ||
    !sameDate(parity.sessionReviewedAt, parity.attemptReviewedAt) ||
    !sameDate(parity.sessionCancelledAt, parity.attemptCancelledAt) ||
    parity.sessionCancellationReason !== parity.attemptCancellationReason ||
    parity.sessionReviewNotes !== parity.attemptReviewNotes;
  if (headerMismatch) {
    throw new Error("STOCK_COUNT_ATTEMPT_HEADER_PARITY_FAILED");
  }
  if (
    Number(parity.legacyLineCount) !== Number(parity.attemptLineCount) ||
    parity.legacyDigest !== parity.attemptDigest
  ) {
    throw new Error("STOCK_COUNT_ATTEMPT_LINE_PARITY_FAILED");
  }
}

/**
 * Attempt-authoritative detail/export reads are prepared but disabled until
 * disposable PostgreSQL parity, migration, concurrency, and redaction gates
 * are accepted. When enabled, a missing attempt projection fails closed; it
 * never silently falls back to mutable compatibility lines.
 */
export const STOCK_COUNT_ATTEMPT_READ_V1_ENABLED = false;

export function selectStockCountReadLines<T extends { lineNumber: number }>(
  legacyLines: T[],
  attemptLines: T[] | null | undefined,
  enabled = STOCK_COUNT_ATTEMPT_READ_V1_ENABLED
) {
  if (!enabled) return legacyLines;
  if (!attemptLines) {
    throw new Error("STOCK_COUNT_ATTEMPT_LINE_PARITY_FAILED");
  }
  return attemptLines;
}

type StockCountMyTaskItem = {
  taskId: string;
  recordId: string;
  publicReference: string;
  status: string;
  actionLabel: "Start stock count" | "Enter stock count" | "Submit stock count";
  createdAt: string;
  sourceType: "STOCK_COUNT";
};

export type StockCountMyTaskPage = {
  totalCount: number;
  items: StockCountMyTaskItem[];
  nextCursor: DashboardTaskCursor | null;
};

function stockCountTaskPredicates(
  session: SessionContext,
  eligibleBefore: Date
) {
  const currentAttemptFor = (status: string) => ({
    is: {
      status,
      assignedToUserId: session.user.id
    }
  });
  const predicates: Array<{
    actionLabel: StockCountMyTaskItem["actionLabel"];
    where: Prisma.StockCountSessionWhereInput;
  }> = [];
  if (session.permissionCodes.includes(permissions.stockCountEnter)) {
    predicates.push(
      {
        actionLabel: "Start stock count",
        where: {
          currentAttempt: currentAttemptFor("DRAFT"),
          status: "DRAFT",
          OR: [
            { scheduledDate: null },
            { scheduledDate: { lt: eligibleBefore } }
          ]
        }
      },
      {
        actionLabel: "Enter stock count",
        where: {
          currentAttempt: currentAttemptFor("IN_PROGRESS"),
          status: "IN_PROGRESS",
          lines: {
            some: { countedQuantityBaseUom: null }
          }
        }
      }
    );
  }
  if (session.permissionCodes.includes(permissions.stockCountSubmit)) {
    predicates.push({
      actionLabel: "Submit stock count",
      where: {
        currentAttempt: currentAttemptFor("IN_PROGRESS"),
        status: "IN_PROGRESS",
        lines: {
          some: {},
          none: { countedQuantityBaseUom: null }
        }
      }
    });
  }
  return predicates;
}

/** Returns one assigned, first-pass Stock Count obligation per session. */
export async function listStockCountMyTaskPage(
  session: SessionContext,
  input: { after?: DashboardTaskCursor; take?: number; filter?: DashboardTaskFilter } = {}
): Promise<StockCountMyTaskPage> {
  if (input.filter?.priority && input.filter.priority !== "HIGH") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.due && input.filter.due.kind !== "NO_DUE") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.status && !["DRAFT", "IN_PROGRESS"].includes(input.filter.status)) return { totalCount: 0, items: [], nextCursor: null };
  const today = new Date(`${dateOnlyInTimeZone(new Date())}T00:00:00.000Z`);
  const eligibleBefore = new Date(today.getTime() + 86_400_000);
  const predicates = stockCountTaskPredicates(session, eligibleBefore).filter(({ where }) =>
    !input.filter?.status || where.status === input.filter.status
  );
  if (predicates.length === 0) {
    return { totalCount: 0, items: [], nextCursor: null };
  }
  const take = Math.min(Math.max(input.take ?? 25, 1), 50);
  const scopedWhere = scopedStockCountWhere(session);
  const afterWhere = dashboardTaskAfterWhere("STOCK_COUNT", input.after);
  const select = {
    id: true,
    publicReference: true,
    status: true,
    createdAt: true,
    currentAttempt: { select: { status: true } }
  } satisfies Prisma.StockCountSessionSelect;
  const [totalCount, ...taskRows] = await Promise.all([
    prisma.stockCountSession.count({
      where: { ...scopedWhere, OR: predicates.map(({ where }) => where) }
    }),
    ...predicates.map(async ({ actionLabel, where }) => ({
      actionLabel,
      rows: await prisma.stockCountSession.findMany({
        where: {
          ...scopedWhere,
          AND: [where, ...(afterWhere ? [afterWhere] : [])]
        },
        select,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: take + 1
      })
    }))
  ]);
  const merged = taskRows
    .flatMap(({ actionLabel, rows }) =>
      rows.map((row) => ({
        taskId: `stock-count-${row.id}`,
        recordId: row.id,
        publicReference: row.publicReference,
        status: row.currentAttempt?.status ?? row.status,
        actionLabel,
        createdAt: row.createdAt.toISOString(),
        sourceType: "STOCK_COUNT" as const,
        priority: "HIGH" as const,
        dueAt: null
      }))
    )
    .sort(compareDashboardTaskOrder);
  const items = merged.slice(0, take);
  const last = items.at(-1);
  return {
    totalCount,
    items,
    nextCursor:
      merged.length > take && last
        ? {
            priority: "HIGH",
            dueAt: null,
            createdAt: last.createdAt,
            sourceType: "STOCK_COUNT",
            recordId: last.recordId
          }
        : null
  };
}

const stockCountDashboardTaskCandidateLimit = 8;
const stockCountDashboardActionStatuses = [
  "SUBMITTED",
  "REVIEWED",
  "RECOUNT_REQUESTED"
];

type StockCountDashboardAttemptAggregateRow = {
  id: string;
  publicReference: string;
  status: string;
  inventoryLocationName: string;
  varianceLineCount: number;
  createdAt: Date;
  totalCount: number;
};

export type StockCountDashboardRead = {
  varianceCount: number;
  taskCandidates: Array<{
    id: string;
    publicReference: string;
    status: string;
    inventoryLocationName: string;
    varianceLineCount: number;
    createdAt: string;
  }>;
};

/**
 * Keeps dashboard work bounded to count sessions with a reviewable variance;
 * blind-count values and line detail never leave the counts workspace here.
 */
export async function getStockCountDashboardRead(
  session: SessionContext
): Promise<StockCountDashboardRead> {
  await requirePermission(session, permissions.stockCountReview);

  // One scoped current-attempt query supplies both the total and bounded rows.
  // Missing current-attempt lineage is excluded (fail closed); legacy lines are
  // intentionally not consulted by this dashboard contract.
  const rows = await prisma.$queryRaw<StockCountDashboardAttemptAggregateRow[]>(Prisma.sql`
    WITH scoped AS (
      SELECT sc.id,
             sc."publicReference",
             sc."createdAt",
             a.status,
             a."blindCount",
             a."createdByUserId",
             il.name AS "inventoryLocationName",
             a.id AS "attemptId"
        FROM "StockCountSession" sc
        JOIN "StockCountAttempt" a
          ON a.id = sc."currentAttemptId"
         AND a."stockCountSessionId" = sc.id
         AND a."tenantId" = sc."tenantId"
         AND a."companyId" = sc."companyId"
         AND a."inventoryLocationId" = sc."inventoryLocationId"
        JOIN "InventoryLocation" il
          ON il.id = sc."inventoryLocationId"
         AND il."tenantId" = sc."tenantId"
         AND il."companyId" = sc."companyId"
       WHERE sc."currentAttemptId" IS NOT NULL
         AND sc."tenantId" = ${session.context.tenantId}::uuid
         AND sc."companyId" = ${session.context.companyId}::uuid
         AND il."locationId" = ${session.context.locationId}::uuid
         AND a.status IN (${Prisma.join(stockCountDashboardActionStatuses)})
    ), line_rollup AS (
      SELECT al."stockCountAttemptId" AS "attemptId",
             COUNT(*) FILTER (WHERE al."varianceQuantityBaseUom" <> 0)::int AS "varianceLineCount",
             COUNT(*)::int AS "lineCount",
             COUNT(*) FILTER (WHERE al."countedQuantityBaseUom" IS NOT NULL
                               AND al."countedByUserId" IS NOT NULL
                               AND al."countedAt" IS NOT NULL)::int AS "completeLineCount",
             COUNT(*) FILTER (WHERE al."countedByUserId" = ${session.user.id}::uuid)::int AS "actorLineCount"
        FROM "StockCountAttemptLine" al
       JOIN scoped s ON s."attemptId" = al."stockCountAttemptId"
       WHERE al."tenantId" = ${session.context.tenantId}::uuid
         AND al."companyId" = ${session.context.companyId}::uuid
       GROUP BY al."stockCountAttemptId"
    ), eligible AS (
      SELECT s.*, r."varianceLineCount"
        FROM scoped s
        JOIN line_rollup r ON r."attemptId" = s."attemptId"
       WHERE r."varianceLineCount" > 0
         AND (
           s."blindCount" = false
           OR s.status = 'REVIEWED'
           OR (
             s.status = 'SUBMITTED'
             AND s."blindCount" = true
             AND s."createdByUserId" <> ${session.user.id}::uuid
             AND r."lineCount" > 0
             AND r."completeLineCount" = r."lineCount"
             AND r."actorLineCount" = 0
           )
         )
    ), ranked AS (
      SELECT e.*, COUNT(*) OVER ()::int AS "totalCount"
        FROM eligible e
       ORDER BY e."createdAt" ASC, e.id ASC
       LIMIT ${stockCountDashboardTaskCandidateLimit}
    )
    SELECT id, "publicReference", status, "inventoryLocationName",
           "varianceLineCount", "createdAt", "totalCount"
      FROM ranked
     ORDER BY "createdAt" ASC, id ASC
  `);
  const varianceCount = rows[0] ? Number(rows[0].totalCount) : 0;

  return {
    varianceCount,
    taskCandidates: rows.map((count) => ({
      id: count.id,
      publicReference: count.publicReference,
      status: count.status,
      inventoryLocationName: count.inventoryLocationName,
      varianceLineCount: Number(count.varianceLineCount),
      createdAt: new Date(count.createdAt).toISOString()
    }))
  };
}

export async function listStockCountFormOptions(session: SessionContext) {
  await requirePermission(session, permissions.stockCountCreate);
  const cadencePolicy = await getStockCountCadencePolicy(session);

  const inventoryLocations = await prisma.inventoryLocation.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      status: "ACTIVE"
    },
    orderBy: { name: "asc" }
  });

  return {
    inventoryLocations: inventoryLocations.map((location) => ({
      id: location.id,
      name: location.name
    })),
    countTypes: countTypes.map((countType) => ({
      value: countType,
      label: countType.replaceAll("_", " "),
      recommendedCadenceDays: recommendedStockCountCadenceDays(countType, cadencePolicy)
    })),
    cadencePolicy
  };
}

export async function listStockCounts(session: SessionContext) {
  await requireStockCountRead(session);
  const cadencePolicy = await getStockCountCadencePolicy(session);
  const counts = await prisma.stockCountSession.findMany({
    where: scopedStockCountWhere(session),
    include: {
      inventoryLocation: true,
      createdBy: true,
      assignedTo: true,
      reviewedBy: true,
      currentAttempt: { select: { id: true, attemptNumber: true, status: true } },
      lines: true
    },
    orderBy: [{ createdAt: "desc" }]
  });

  for (const count of counts) {
    await assertStockCountAttemptLineParity(session, count.id);
  }

  return counts.map((count) => mapStockCount(session, count, cadencePolicy));
}

type StockCountWithRelations = Prisma.StockCountSessionGetPayload<{ include: {
  inventoryLocation: true; createdBy: true; assignedTo: true; reviewedBy: true;
  currentAttempt: { select: { id: true; attemptNumber: true; status: true } };
  lines: true;
} }>;

function mapStockCount(session: SessionContext, count: StockCountWithRelations, cadencePolicy: Awaited<ReturnType<typeof getStockCountCadencePolicy>>) {
    const canShowProtectedFacts = canExposeStockCountProtectedFacts(
      session,
      count
    );
    return {
    id: count.id,
    currentAttemptId: count.currentAttempt?.id ?? null,
    currentAttemptNumber: count.currentAttempt?.attemptNumber ?? null,
    publicReference: count.publicReference,
    status: count.status,
    countType: count.countType,
    inventoryLocationName: count.inventoryLocation.name,
    createdByName: count.createdBy.displayName,
    assignedToName: count.assignedTo?.displayName ?? null,
    reviewedByName: canShowProtectedFacts
      ? count.reviewedBy?.displayName ?? null
      : null,
    scheduledDate: count.scheduledDate?.toISOString().slice(0, 10) ?? null,
    recommendedCadenceDays: recommendedStockCountCadenceDays(
      count.countType,
      cadencePolicy
    ),
    cutoffAt: count.cutoffAt?.toISOString() ?? null,
    submittedAt: count.submittedAt?.toISOString() ?? null,
    lineCount: count.lines.length,
    varianceCount: canShowProtectedFacts
      ? count.lines.filter(
          (line) => Number(line.varianceQuantityBaseUom ?? 0) !== 0
        ).length
      : null
    };
  }

export async function listStockCountPage(
  session: SessionContext,
  input: { page?: number; pageSize?: number } = {}
) {
  await requireStockCountRead(session);
  const cadencePolicy = await getStockCountCadencePolicy(session);
  const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const requestedPage = Math.max(1, Math.trunc(input.page ?? 1));
  const where = scopedStockCountWhere(session);
  const totalItems = await prisma.stockCountSession.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const counts = await prisma.stockCountSession.findMany({
    where,
    include: {
      inventoryLocation: true,
      createdBy: true,
      assignedTo: true,
      reviewedBy: true,
      currentAttempt: { select: { id: true, attemptNumber: true, status: true } },
      lines: true
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  });
  for (const count of counts) {
    await assertStockCountAttemptLineParity(session, count.id);
  }
  return { items: counts.map((count) => mapStockCount(session, count, cadencePolicy)), totalItems, page, pageSize, totalPages };
}

export async function buildStockCountExportRows(
  session: SessionContext,
  input: { maxRows?: number } = {}
) {
  await requireStockCountRead(session);
  const maxRows = input.maxRows ?? 100_000;
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100_000) {
    throw new Error("STOCK_COUNT_EXPORT_MAX_ROWS_INVALID");
  }
  const counts = await prisma.stockCountSession.findMany({
    where: scopedStockCountWhere(session),
    select: {
      id: true,
      publicReference: true,
      status: true,
      countType: true,
      blindCount: true,
      createdByUserId: true,
      assignedToUserId: true,
      scheduledDate: true,
      cutoffAt: true,
      submittedAt: true,
      reviewedAt: true,
      inventoryLocation: { select: { name: true } },
      createdBy: { select: { displayName: true } },
      assignedTo: { select: { displayName: true } },
      reviewedBy: { select: { displayName: true } },
      currentAttempt: {
        select: {
          attemptNumber: true,
          ...(STOCK_COUNT_ATTEMPT_READ_V1_ENABLED
            ? {
                lines: {
                  orderBy: { lineNumber: "asc" },
                  include: { item: true, uom: true, countedBy: true }
                }
              }
            : {}),
          stockAdjustments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { publicReference: true, status: true }
          }
        }
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        select: {
          lineNumber: true,
          lotNumber: true,
          expiryDate: true,
          systemQuantityBaseUom: true,
          countedQuantityBaseUom: true,
          varianceQuantityBaseUom: true,
          notes: true,
          countedByUserId: true,
          countedAt: true,
          item: { select: { itemCode: true, itemName: true } },
          uom: { select: { uomCode: true } },
          countedBy: { select: { displayName: true } }
        }
      }
    },
    orderBy: [{ createdAt: "desc" }],
    take: maxRows + 1
  });

  const rows: CsvRow[] = [
    [
      "Reference",
      "Status",
      "Count Type",
      "Inventory Location",
      "Created By",
      "Assigned To",
      "Reviewed By",
      "Scheduled Date",
      "Cutoff At",
      "Submitted At",
      "Reviewed At",
      "Variance Adjustment",
      "Variance Adjustment Status",
      "Line",
      "Item Code",
      "Item Name",
      "UOM",
      "Lot",
      "Expiry",
      "System Qty",
      "Counted Qty",
      "Variance Qty",
      "Line Notes",
      "Counted By",
      "Counted At",
      "Current Attempt"
    ]
  ];

  for (const count of counts) {
    await assertStockCountAttemptLineParity(session, count.id);
    const readLines = selectStockCountReadLines(
      count.lines,
      STOCK_COUNT_ATTEMPT_READ_V1_ENABLED
        ? (count.currentAttempt as { lines?: typeof count.lines } | null)?.lines
        : undefined
    );
    const canShowSystemQuantity = canExposeStockCountProtectedFacts(
      session,
      count
    );
    const canShowEnteredCountFacts =
      count.assignedToUserId === session.user.id || canShowSystemQuantity;
    const adjustment = count.currentAttempt?.stockAdjustments[0];
    const sharedColumns: CsvRow = [
      count.publicReference,
      count.status,
      count.countType,
      count.inventoryLocation.name,
      count.createdBy.displayName,
      count.assignedTo?.displayName ?? "",
      canShowSystemQuantity ? count.reviewedBy?.displayName ?? "" : "",
      count.scheduledDate?.toISOString().slice(0, 10) ?? "",
      count.cutoffAt?.toISOString() ?? "",
      count.submittedAt?.toISOString() ?? "",
      canShowSystemQuantity ? count.reviewedAt?.toISOString() ?? "" : "",
      canShowSystemQuantity ? adjustment?.publicReference ?? "" : "",
      canShowSystemQuantity ? adjustment?.status ?? "" : ""
    ];

    if (readLines.length === 0) {
      rows.push([...sharedColumns, "", "", "", "", "", "", "", "", "", "", "", ""]);
      continue;
    }

    for (const line of readLines) {
      rows.push([
        ...sharedColumns,
        line.lineNumber,
        line.item.itemCode,
        line.item.itemName,
        line.uom.uomCode,
        line.lotNumber ?? "",
        line.expiryDate?.toISOString().slice(0, 10) ?? "",
        canShowSystemQuantity ? Number(line.systemQuantityBaseUom) : "",
        !canShowEnteredCountFacts || line.countedQuantityBaseUom === null
          ? ""
          : Number(line.countedQuantityBaseUom),
        canShowSystemQuantity && line.varianceQuantityBaseUom !== null
          ? Number(line.varianceQuantityBaseUom)
          : "",
        canShowEnteredCountFacts ? line.notes ?? "" : "",
        canShowEnteredCountFacts ? line.countedBy?.displayName ?? "" : "",
        canShowEnteredCountFacts ? line.countedAt?.toISOString() ?? "" : "",
        count.currentAttempt?.attemptNumber ?? ""
      ]);
    }
  }

  if (rows.length - 1 > maxRows) {
    throw new Error("REPORT_EXPORT_ROW_LIMIT_EXCEEDED");
  }
  return rows;
}

export async function getStockCount(session: SessionContext, id: string) {
  await requireStockCountRead(session);

  const count = await prisma.stockCountSession.findFirst({
    where: scopedStockCountWhere(session, id),
    include: {
      inventoryLocation: {
        include: {
          location: true
        }
      },
      createdBy: true,
      assignedTo: true,
      reviewedBy: true,
      currentAttempt: {
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          lines: {
            orderBy: { lineNumber: "asc" },
            include: { item: true, uom: true, countedBy: true }
          },
          stockAdjustments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, publicReference: true, status: true }
          }
        }
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true,
          countedBy: true
        }
      }
    }
  });

  if (!count) {
    return null;
  }

  if ((count.currentAttempt?.attemptNumber ?? 1) === 1) {
    await assertStockCountAttemptLineParity(session, count.id);
  }
  const readLines = selectStockCountReadLines(
    count.lines,
    STOCK_COUNT_ATTEMPT_READ_V1_ENABLED ||
      (count.currentAttempt?.attemptNumber ?? 1) > 1
      ? (count.currentAttempt?.lines as unknown as typeof count.lines)
      : undefined
  );

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "StockCountSession",
      entityId: count.id
    },
    orderBy: { occurredAt: "asc" }
  });

  const canShowSystemQuantity = canExposeStockCountProtectedFacts(
    session,
    count
  );
  const attemptHistory = canShowSystemQuantity
    ? await prisma.stockCountAttempt.findMany({
        where: {
          stockCountSessionId: count.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId
        },
        orderBy: { attemptNumber: "asc" },
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          cutoffAt: true,
          startedAt: true,
          submittedAt: true,
          reviewedAt: true,
          cancelledAt: true,
          reason: true,
          evidenceReference: true,
          assignedTo: { select: { displayName: true } },
          reviewedBy: { select: { displayName: true } },
          stockAdjustments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, publicReference: true, status: true }
          },
          sourceRecountTransitions: {
            select: {
              adjustmentDisposition: true,
              cutoffDisposition: true,
              occurredAt: true,
              linkedStockAdjustment: {
                select: { id: true, publicReference: true, status: true }
              }
            },
            take: 1
          }
        }
      })
    : [];
  const canReviewCurrentActor = canReviewStockCountCurrentActor(
    session,
    count
  );
  const assignedToCurrentUser = count.assignedToUserId === session.user.id;
  const canShowEnteredCountFacts =
    assignedToCurrentUser || canShowSystemQuantity;
  const scheduledStartEligible = isStockCountScheduledStartEligible(
    count.scheduledDate
  );
  const hasSnapshotLines = readLines.length > 0;
  const hasUncountedLines = readLines.some(
    (line) => line.countedQuantityBaseUom === null
  );

  return {
    id: count.id,
    version: count.version,
    currentAttemptId: count.currentAttempt?.id ?? null,
    currentAttemptNumber: count.currentAttempt?.attemptNumber ?? null,
    publicReference: count.publicReference,
    status: count.status,
    countType: count.countType,
    blindCount: count.blindCount,
    freezeMovements: count.freezeMovements,
    inventoryLocationId: count.inventoryLocationId,
    inventoryLocationName: count.inventoryLocation.name,
    locationName: count.inventoryLocation.location.name,
    createdByName: count.createdBy.displayName,
    assignedToName: count.assignedTo?.displayName ?? null,
    reviewedByName: canShowSystemQuantity
      ? count.reviewedBy?.displayName ?? null
      : null,
    scheduledDate: count.scheduledDate?.toISOString().slice(0, 10) ?? null,
    cutoffAt: count.cutoffAt?.toISOString() ?? null,
    startedAt: count.startedAt?.toISOString() ?? null,
    submittedAt: count.submittedAt?.toISOString() ?? null,
    reviewedAt: canShowSystemQuantity
      ? count.reviewedAt?.toISOString() ?? null
      : null,
    cancelledAt: count.cancelledAt?.toISOString() ?? null,
    cancellationReason: count.cancellationReason ?? null,
    reviewNotes: canShowSystemQuantity ? count.reviewNotes ?? null : null,
    varianceAdjustmentId: canShowSystemQuantity
      ? count.currentAttempt?.stockAdjustments[0]?.id ?? null
      : null,
    varianceAdjustmentReference:
      canShowSystemQuantity
        ? count.currentAttempt?.stockAdjustments[0]?.publicReference ?? null
        : null,
    varianceAdjustmentStatus: canShowSystemQuantity
      ? count.currentAttempt?.stockAdjustments[0]?.status ?? null
      : null,
    attemptHistory: attemptHistory.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      cutoffAt: attempt.cutoffAt?.toISOString() ?? null,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      reviewedAt: attempt.reviewedAt?.toISOString() ?? null,
      cancelledAt: attempt.cancelledAt?.toISOString() ?? null,
      reason: attempt.reason ?? null,
      hasEvidence: Boolean(attempt.evidenceReference),
      assignedToName: attempt.assignedTo?.displayName ?? null,
      reviewedByName: attempt.reviewedBy?.displayName ?? null,
      adjustment: attempt.stockAdjustments[0] ?? null,
      recovery: attempt.sourceRecountTransitions[0]
        ? {
            adjustmentDisposition:
              attempt.sourceRecountTransitions[0].adjustmentDisposition,
            cutoffDisposition:
              attempt.sourceRecountTransitions[0].cutoffDisposition,
            occurredAt:
              attempt.sourceRecountTransitions[0].occurredAt.toISOString(),
            linkedAdjustment:
              attempt.sourceRecountTransitions[0].linkedStockAdjustment
          }
        : null
    })),
    assignedToCurrentUser,
    scheduledStartEligible,
    hasSnapshotLines,
    hasUncountedLines,
    canReviewCurrentActor,
    canShowSystemQuantity,
    lines: readLines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      itemCode: line.item.itemCode,
      itemName: line.item.itemName,
      uomCode: line.uom.uomCode,
      lotNumber: line.lotNumber ?? null,
      expiryDate: line.expiryDate?.toISOString().slice(0, 10) ?? null,
      systemQuantityBaseUom: canShowSystemQuantity
        ? Number(line.systemQuantityBaseUom)
        : null,
      countedQuantityBaseUom:
        !canShowEnteredCountFacts || line.countedQuantityBaseUom === null
          ? null
          : Number(line.countedQuantityBaseUom),
      varianceQuantityBaseUom:
        canShowSystemQuantity && line.varianceQuantityBaseUom !== null
          ? Number(line.varianceQuantityBaseUom)
          : null,
      notes: canShowEnteredCountFacts ? line.notes ?? null : null,
      countedByName: canShowEnteredCountFacts
        ? line.countedBy?.displayName ?? null
        : null,
      countedAt: canShowEnteredCountFacts
        ? line.countedAt?.toISOString() ?? null
        : null
    })),
    auditEvents: canShowSystemQuantity
      ? auditEvents.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          occurredAt: event.occurredAt.toISOString(),
          metadata: event.metadata
        }))
      : []
  };
}

export async function scheduleStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountCreate);
  const values = scheduleStockCountSchema.parse(Object.fromEntries(formData));
  const cadencePolicy = await getStockCountCadencePolicy(session);
  const recommendedCadenceDays = recommendedStockCountCadenceDays(
    values.countType,
    cadencePolicy
  );

  const inventoryLocation = await prisma.inventoryLocation.findFirst({
    where: {
      id: values.inventoryLocationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      status: "ACTIVE"
    }
  });
  if (!inventoryLocation) {
    throw new Error("STOCK_COUNT_INVENTORY_LOCATION_NOT_FOUND");
  }
  assertAuthorizedLocation(session, inventoryLocation.locationId);

  let countId: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const publicReference = await nextStockCountReference(session.context.companyId);
      countId = await prisma.$transaction(async (tx) => {
        const count = await tx.stockCountSession.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: inventoryLocation.id,
            publicReference,
            countType: values.countType,
            scheduledDate: values.scheduledDate ?? null,
            blindCount: values.blindCount,
            freezeMovements: values.freezeMovements,
            createdByUserId: session.user.id,
            assignedToUserId: session.user.id
          }
        });
        const attempt = await tx.stockCountAttempt.create({
          data: {
            stockCountSessionId: count.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: inventoryLocation.id,
            attemptNumber: 1,
            status: "DRAFT",
            blindCount: values.blindCount,
            freezeMovements: values.freezeMovements,
            createdByUserId: session.user.id,
            assignedToUserId: session.user.id
          },
          select: { id: true }
        });
        const linked = await tx.stockCountSession.updateMany({
          where: {
            id: count.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: inventoryLocation.id,
            currentAttemptId: null,
            version: count.version
          },
          data: {
            currentAttemptId: attempt.id,
            version: { increment: 1 }
          }
        });
        if (linked.count !== 1) {
          throw new Error("STOCK_COUNT_ATTEMPT_LINK_FAILED");
        }
        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "stock_count.scheduled",
            entityType: "StockCountSession",
            entityId: count.id,
            afterData: { status: "DRAFT" },
            metadata: {
              inventoryLocationId: inventoryLocation.id,
              countType: values.countType,
              attemptId: attempt.id,
              recommendedCadenceDays,
              cadencePolicy
            }
          }
        });
        return count.id;
      });
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 5) {
        throw error;
      }
    }
  }

  if (!countId) {
    throw new Error("STOCK_COUNT_REFERENCE_ALLOCATION_FAILED");
  }

  return countId;
}

type StockCountRecountAuthorityLine = {
  id: string;
  tenantId: string;
  companyId: string;
  inventoryLocationId: string;
  itemId: string;
};

async function attestStockCountRecountReviewAuthority(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    stockCountSessionId: string;
    stockCountAttemptId: string;
    inventoryLocationId: string;
    sessionVersion: number;
    attemptVersion: number;
    lines: readonly StockCountRecountAuthorityLine[];
  }
): Promise<InventoryPilotApprovalAttestation> {
  if (!STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED) {
    throw new Error("STOCK_COUNT_RECOUNT_REVIEW_APPROVAL_REQUIRED");
  }
  if (!CONTROLLED_EVIDENCE_QUALIFICATION_RUNTIME_ENABLED) {
    throw new Error("CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED");
  }
  return classifyStockCountAttemptForPilotApproval({
    tx,
    stage: "SUBMIT",
    count: {
      session: {
        id: input.stockCountSessionId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        version: input.sessionVersion,
        status: "IN_PROGRESS",
        inventoryLocationId: input.inventoryLocationId,
        locationId: session.context.locationId,
        currentAttemptId: input.stockCountAttemptId
      },
      attempt: {
        id: input.stockCountAttemptId,
        stockCountSessionId: input.stockCountSessionId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        version: input.attemptVersion,
        status: "IN_PROGRESS",
        inventoryLocationId: input.inventoryLocationId,
        lines: input.lines
      }
    }
  });
}

function requireControlledEvidenceQualificationForRecount(): string {
  // DEC-0077 intentionally leaves the policy registry and action adapter
  // dormant. Keep the required transition FK typed and impossible to satisfy
  // until an approved action-specific qualification is implemented.
  throw new Error("CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED");
}

export async function startStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountEnter);
  const values = stockCountActionSchema.parse(Object.fromEntries(formData));
  const target = await findScopedStockCountLocation(session, values.id);

  await prisma.$transaction(async (tx) => {
    await lockInventoryLocationForPosting(
      tx,
      session,
      target.inventoryLocationId
    );
    const count = await lockScopedStockCount(
      tx,
      session,
      target.id,
      target.inventoryLocationId
    );
    await requirePermission(session, permissions.stockCountEnter);
    if (count.status === "RECOUNT_REQUESTED") {
      if (!STOCK_COUNT_RECOUNT_RECOVERY_V1_ENABLED) {
        throw new Error("STOCK_COUNT_RECOUNT_DISABLED");
      }
      assertStockCountAssignedActor({
        assignedToUserId: count.assignedToUserId,
        actorUserId: session.user.id
      });
      if (!count.currentAttemptId || count.currentAttemptVersion === null) {
        throw new Error("STOCK_COUNT_ATTEMPT_NOT_LINKED");
      }
      const attempts = await tx.$queryRaw<Array<{
        id: string;
        attemptNumber: number;
        status: string;
        version: number;
        assignedToUserId: string | null;
      }>>(Prisma.sql`
        SELECT id, "attemptNumber", status, version, "assignedToUserId"
          FROM "StockCountAttempt"
         WHERE id = ${count.currentAttemptId}::uuid
           AND "stockCountSessionId" = ${count.id}::uuid
           AND "tenantId" = ${session.context.tenantId}::uuid
           AND "companyId" = ${session.context.companyId}::uuid
           AND "inventoryLocationId" = ${count.inventoryLocationId}::uuid
         FOR UPDATE
      `);
      const attempt = attempts[0];
      if (
        !attempt ||
        attempt.attemptNumber <= 1 ||
        attempt.status !== "DRAFT" ||
        attempt.assignedToUserId !== session.user.id
      ) {
        throw new Error("STOCK_COUNT_RECOUNT_NOT_READY_TO_START");
      }
      const existingAttemptLineCount = await tx.stockCountAttemptLine.count({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          stockCountAttemptId: attempt.id,
          inventoryLocationId: count.inventoryLocationId
        }
      });
      if (existingAttemptLineCount !== 0) {
        throw new Error("STOCK_COUNT_RECOUNT_DRAFT_HAS_EXISTING_LINES");
      }
      const recountTransition = await tx.stockCountRecountTransition.findUnique({
        where: { successorAttemptId: attempt.id },
        select: {
          tenantId: true,
          companyId: true,
          inventoryLocationId: true,
          stockCountSessionId: true,
          successorAttemptId: true,
          reviewConfigurationRevisionId: true,
          reviewConfigurationRevisionNumber: true,
          reviewConfigurationDigest: true,
          reviewActivationEventId: true,
          reviewActivationFamily: true,
          reviewActivationStatus: true,
          reviewActivationGeneration: true
        }
      });
      if (
        !recountTransition ||
        recountTransition.tenantId !== session.context.tenantId ||
        recountTransition.companyId !== session.context.companyId ||
        recountTransition.inventoryLocationId !== count.inventoryLocationId ||
        recountTransition.stockCountSessionId !== count.id ||
        recountTransition.successorAttemptId !== attempt.id ||
        recountTransition.reviewActivationFamily !== "StockCountAttemptReview" ||
        recountTransition.reviewActivationStatus !== "ACTIVE"
      ) {
        throw new Error("STOCK_COUNT_RECOUNT_REVIEW_AUTHORITY_STALE");
      }
      const balances = await tx.inventoryBalance.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId
        },
        include: { item: true },
        orderBy: [{ item: { itemName: "asc" } }, { expiryDate: "asc" }]
      });
      if (balances.length === 0) throw new Error("STOCK_COUNT_HAS_NO_BALANCES");
      const recountAuthority = await attestStockCountRecountReviewAuthority(
        tx,
        session,
        {
          stockCountSessionId: count.id,
          stockCountAttemptId: attempt.id,
          inventoryLocationId: count.inventoryLocationId,
          sessionVersion: count.version,
          attemptVersion: attempt.version,
          lines: balances.map((balance) => ({
            id: balance.id,
            tenantId: balance.tenantId,
            companyId: balance.companyId,
            inventoryLocationId: balance.inventoryLocationId,
            itemId: balance.itemId
          }))
        }
      );
      if (
        recountAuthority.configurationRevisionId !==
          recountTransition.reviewConfigurationRevisionId ||
        recountAuthority.configurationRevisionNumber !==
          recountTransition.reviewConfigurationRevisionNumber ||
        recountAuthority.configurationDigest !==
          recountTransition.reviewConfigurationDigest ||
        recountAuthority.activationEventId !==
          recountTransition.reviewActivationEventId ||
        recountAuthority.activationGeneration !==
          recountTransition.reviewActivationGeneration
      ) {
        throw new Error("STOCK_COUNT_RECOUNT_REVIEW_AUTHORITY_STALE");
      }
      await tx.stockCountAttemptLine.createMany({
        data: balances.map((balance, index) => ({
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          stockCountAttemptId: attempt.id,
          inventoryLocationId: count.inventoryLocationId,
          itemId: balance.itemId,
          uomId: balance.baseUomId,
          lineNumber: index + 1,
          lotKey: balance.lotKey,
          lotNumber: balance.lotNumber,
          expiryDate: balance.expiryDate,
          systemQuantityBaseUom: balance.qtyOnHand,
          legacyStockCountLineId: null
        }))
      });
      const attemptStarted = await tx.stockCountAttempt.updateMany({
        where: {
          id: attempt.id,
          stockCountSessionId: count.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId,
          status: "DRAFT",
          version: attempt.version
        },
        data: {
          status: "IN_PROGRESS",
          cutoffAt: count.databaseNow,
          startedAt: count.databaseNow,
          version: { increment: 1 }
        }
      });
      if (attemptStarted.count !== 1) {
        throw new Error("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
      }
      const sessionStarted = await tx.stockCountSession.updateMany({
        where: {
          id: count.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId,
          status: "RECOUNT_REQUESTED",
          currentAttemptId: attempt.id,
          version: count.version
        },
        data: {
          status: "IN_PROGRESS",
          cutoffAt: count.databaseNow,
          startedAt: count.databaseNow,
          submittedAt: null,
          reviewedAt: null,
          reviewedByUserId: null,
          reviewNotes: null,
          version: { increment: 1 }
        }
      });
      if (sessionStarted.count !== 1) {
        throw new Error("STOCK_COUNT_CONCURRENT_MODIFICATION");
      }
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "stock_count.recount_started",
          entityType: "StockCountSession",
          entityId: count.id,
          beforeData: { status: "RECOUNT_REQUESTED" },
          afterData: { status: "IN_PROGRESS", currentAttemptId: attempt.id },
          metadata: {
            attemptNumber: attempt.attemptNumber,
            cutoffAt: count.databaseNow.toISOString(),
            snapshotLineCount: balances.length
          }
        }
      });
      return;
    }
    assertStockCountCanStart(count.status);
    assertStockCountAssignedActor({
      assignedToUserId: count.assignedToUserId,
      actorUserId: session.user.id
    });
    if (!isStockCountScheduledStartEligible(count.scheduledDate, count.databaseNow)) {
      throw new Error("STOCK_COUNT_SCHEDULED_DATE_IN_FUTURE");
    }

    const existingLineCount = await tx.stockCountLine.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        stockCountSessionId: count.id,
        inventoryLocationId: count.inventoryLocationId
      }
    });
    if (existingLineCount !== 0) {
      throw new Error("STOCK_COUNT_DRAFT_HAS_EXISTING_LINES");
    }
    const balances = await tx.inventoryBalance.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: count.inventoryLocationId
      },
      include: { item: true },
      orderBy: [{ item: { itemName: "asc" } }, { expiryDate: "asc" }]
    });
    if (balances.length === 0) {
      throw new Error("STOCK_COUNT_HAS_NO_BALANCES");
    }

    const ensuredAttempt = await ensureStockCountAttempt1(tx, session, count);
    const started = await tx.stockCountSession.updateMany({
      where: {
        id: count.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: count.inventoryLocationId,
        assignedToUserId: session.user.id,
        status: "DRAFT",
        updatedAt: count.updatedAt,
        version: count.version,
        ...(ensuredAttempt.needsSessionLink ? { currentAttemptId: null } : {})
      },
      data: {
        status: "IN_PROGRESS",
        startedAt: count.databaseNow,
        cutoffAt: count.databaseNow,
        ...(ensuredAttempt.needsSessionLink
          ? { currentAttemptId: ensuredAttempt.id }
          : {}),
        version: { increment: 1 }
      }
    });
    if (started.count !== 1) {
      throw new Error("STOCK_COUNT_CONCURRENT_MODIFICATION");
    }

    await tx.stockCountLine.createMany({
      data: balances.map((balance, index) => ({
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        stockCountSessionId: count.id,
        inventoryLocationId: count.inventoryLocationId,
        itemId: balance.itemId,
        uomId: balance.baseUomId,
        lineNumber: index + 1,
        lotKey: balance.lotKey,
        lotNumber: balance.lotNumber,
        expiryDate: balance.expiryDate,
        systemQuantityBaseUom: balance.qtyOnHand
      }))
    });

    const attemptUpdated = await tx.$executeRaw(Prisma.sql`
      UPDATE "StockCountAttempt"
         SET status = 'IN_PROGRESS',
             "startedAt" = ${count.databaseNow},
             "cutoffAt" = ${count.databaseNow},
             "updatedAt" = ${count.databaseNow},
             version = version + 1
       WHERE id = ${ensuredAttempt.id}::uuid
         AND "stockCountSessionId" = ${count.id}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
         AND status = 'DRAFT'
         AND version = ${ensuredAttempt.version}
    `);
    if (attemptUpdated !== 1) {
      throw new Error("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
    }
    await syncStockCountAttempt1Lines(
      tx,
      session,
      ensuredAttempt.id,
      count.id,
      count.inventoryLocationId
    );

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_count.started",
        entityType: "StockCountSession",
        entityId: count.id,
        beforeData: { status: "DRAFT" },
        afterData: { status: "IN_PROGRESS" },
        metadata: {
          cutoffAt: count.databaseNow.toISOString(),
          snapshotLineCount: balances.length
        }
      }
    });
  });
}

export async function saveStockCountEntries(rawValues: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountEnter);
  const values = saveStockCountSchema.parse(rawValues);

  if (new Set(values.lines.map((line) => line.lineId)).size !== values.lines.length) {
    throw new Error("STOCK_COUNT_LINE_DUPLICATE");
  }
  const target = await findScopedStockCountLocation(session, values.id);

  await prisma.$transaction(async (tx) => {
    await lockInventoryLocationForPosting(
      tx,
      session,
      target.inventoryLocationId
    );
    const count = await lockScopedStockCount(
      tx,
      session,
      target.id,
      target.inventoryLocationId
    );
    await requirePermission(session, permissions.stockCountEnter);
    assertStockCountCanEnter(count.status);
    assertStockCountAssignedActor({
      assignedToUserId: count.assignedToUserId,
      actorUserId: session.user.id
    });
    if (count.currentAttemptId) {
      const currentAttempts = await tx.stockCountAttempt.findMany({
        where: {
          id: count.currentAttemptId,
          stockCountSessionId: count.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId,
          status: "IN_PROGRESS"
        },
        select: { id: true, attemptNumber: true, version: true }
      });
      const currentAttempt = currentAttempts[0];
      if (currentAttempt?.attemptNumber && currentAttempt.attemptNumber > 1) {
        const attemptLines = await tx.stockCountAttemptLine.findMany({
          where: {
            id: { in: values.lines.map((line) => line.lineId) },
            stockCountAttemptId: currentAttempt.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: count.inventoryLocationId,
            legacyStockCountLineId: null
          }
        });
        if (attemptLines.length !== values.lines.length) {
          throw new Error("STOCK_COUNT_LINE_NOT_FOUND");
        }
        const byId = new Map(attemptLines.map((line) => [line.id, line]));
        for (const entry of values.lines) {
          const line = byId.get(entry.lineId);
          if (!line) throw new Error("STOCK_COUNT_LINE_NOT_FOUND");
          const variance = calculateCountVariance(
            entry.countedQuantityBaseUom,
            Number(line.systemQuantityBaseUom)
          );
          const updated = await tx.stockCountAttemptLine.updateMany({
            where: {
              id: line.id,
              stockCountAttemptId: currentAttempt.id,
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              inventoryLocationId: count.inventoryLocationId,
              legacyStockCountLineId: null,
              updatedAt: line.updatedAt
            },
            data: {
              countedQuantityBaseUom: entry.countedQuantityBaseUom,
              varianceQuantityBaseUom: variance,
              notes: entry.notes || null,
              countedByUserId: session.user.id,
              countedAt: count.databaseNow
            }
          });
          if (updated.count !== 1) {
            throw new Error("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
          }
        }
        const attemptTouched = await tx.stockCountAttempt.updateMany({
          where: {
            id: currentAttempt.id,
            stockCountSessionId: count.id,
            status: "IN_PROGRESS",
            version: currentAttempt.version
          },
          data: { version: { increment: 1 } }
        });
        const sessionTouched = await tx.stockCountSession.updateMany({
          where: {
            id: count.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: count.inventoryLocationId,
            currentAttemptId: currentAttempt.id,
            assignedToUserId: session.user.id,
            status: "IN_PROGRESS",
            version: count.version
          },
          data: { updatedAt: count.databaseNow, version: { increment: 1 } }
        });
        if (attemptTouched.count !== 1 || sessionTouched.count !== 1) {
          throw new Error("STOCK_COUNT_CONCURRENT_MODIFICATION");
        }
        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "stock_count.recount_entries_saved",
            entityType: "StockCountSession",
            entityId: count.id,
            metadata: {
              attemptNumber: currentAttempt.attemptNumber,
              lineCount: values.lines.length
            }
          }
        });
        return;
      }
    }
    const lines = await tx.stockCountLine.findMany({
      where: {
        id: { in: values.lines.map((line) => line.lineId) },
        stockCountSessionId: count.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: count.inventoryLocationId
      }
    });
    if (lines.length !== values.lines.length) {
      throw new Error("STOCK_COUNT_LINE_NOT_FOUND");
    }
    const linesById = new Map(lines.map((line) => [line.id, line]));
    const ensuredAttempt = await ensureStockCountAttempt1(tx, session, count);
    if (ensuredAttempt.needsSessionLink) {
      await syncStockCountAttempt1Lines(
        tx,
        session,
        ensuredAttempt.id,
        count.id,
        count.inventoryLocationId
      );
    }
    for (const entry of values.lines) {
      const line = linesById.get(entry.lineId);
      if (!line) {
        throw new Error("STOCK_COUNT_LINE_NOT_FOUND");
      }
      const variance = calculateCountVariance(
        entry.countedQuantityBaseUom,
        Number(line.systemQuantityBaseUom)
      );
      const updated = await tx.stockCountLine.updateMany({
        where: {
          id: entry.lineId,
          stockCountSessionId: count.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId,
          updatedAt: line.updatedAt
        },
        data: {
          countedQuantityBaseUom: entry.countedQuantityBaseUom,
          varianceQuantityBaseUom: variance,
          notes: entry.notes || null,
          countedByUserId: session.user.id,
          countedAt: count.databaseNow
        }
      });
      if (updated.count !== 1) {
        throw new Error("STOCK_COUNT_CONCURRENT_MODIFICATION");
      }
      const attemptUpdated = await tx.$executeRaw(Prisma.sql`
        UPDATE "StockCountAttemptLine" al
           SET "countedQuantityBaseUom" = ${entry.countedQuantityBaseUom},
               "varianceQuantityBaseUom" = ${variance},
               notes = ${entry.notes || null},
               "countedByUserId" = ${session.user.id}::uuid,
               "countedAt" = ${count.databaseNow},
               "updatedAt" = ${count.databaseNow}
          FROM "StockCountAttempt" a
         WHERE al.id = ${entry.lineId}::uuid
           AND al."legacyStockCountLineId" = ${entry.lineId}::uuid
           AND al."stockCountAttemptId" = a.id
           AND a.id = ${ensuredAttempt.id}::uuid
           AND a.status = 'IN_PROGRESS'
           AND al."updatedAt" = ${line.updatedAt}
      `);
      if (attemptUpdated !== 1) {
        throw new Error("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
      }
    }
    const attemptTouched = await tx.$executeRaw(Prisma.sql`
      UPDATE "StockCountAttempt"
         SET "updatedAt" = ${count.databaseNow},
             version = version + 1
       WHERE id = ${ensuredAttempt.id}::uuid
         AND "stockCountSessionId" = ${count.id}::uuid
         AND status = 'IN_PROGRESS'
         AND version = ${ensuredAttempt.version}
    `);
    if (attemptTouched !== 1) {
      throw new Error("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
    }
    const touched = await tx.stockCountSession.updateMany({
      where: {
        id: count.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: count.inventoryLocationId,
        assignedToUserId: session.user.id,
        status: "IN_PROGRESS",
        updatedAt: count.updatedAt,
        version: count.version,
        ...(ensuredAttempt.needsSessionLink ? { currentAttemptId: null } : {})
      },
      data: {
        updatedAt: count.databaseNow,
        ...(ensuredAttempt.needsSessionLink
          ? { currentAttemptId: ensuredAttempt.id }
          : {}),
        version: { increment: 1 }
      }
    });
    if (touched.count !== 1) {
      throw new Error("STOCK_COUNT_CONCURRENT_MODIFICATION");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_count.entries_saved",
        entityType: "StockCountSession",
        entityId: count.id,
        metadata: { lineCount: values.lines.length }
      }
    });
  });
}

type LockedStockCountApprovalAttempt = {
  id: string;
  stockCountSessionId: string;
  tenantId: string;
  companyId: string;
  inventoryLocationId: string;
  status: string;
  attemptNumber: number;
  version: number;
  createdByUserId: string;
  assignedToUserId: string | null;
  evidenceReference: string | null;
};

type LockedStockCountApprovalLine = {
  id: string;
  tenantId: string;
  companyId: string;
  inventoryLocationId: string;
  itemId: string;
  countedByUserId: string | null;
  countedAt: Date | null;
  countedQuantityBaseUom: unknown;
};

async function lockCurrentStockCountAttemptForApproval(
  tx: TransactionClient,
  session: SessionContext,
  count: LockedStockCount
) {
  if (!count.currentAttemptId) {
    throw new Error("STOCK_COUNT_ATTEMPT_NOT_LINKED");
  }
  const attempts = await tx.$queryRaw<LockedStockCountApprovalAttempt[]>(Prisma.sql`
    SELECT a.id, a."stockCountSessionId", a."tenantId", a."companyId",
           a."inventoryLocationId", a.status, a."attemptNumber", a.version, a."createdByUserId",
           a."assignedToUserId", a."evidenceReference"
      FROM "StockCountAttempt" a
     WHERE a.id = ${count.currentAttemptId}::uuid
       AND a."stockCountSessionId" = ${count.id}::uuid
       AND a."tenantId" = ${session.context.tenantId}::uuid
       AND a."companyId" = ${session.context.companyId}::uuid
       AND a."inventoryLocationId" = ${count.inventoryLocationId}::uuid
     FOR UPDATE
  `);
  const attempt = attempts[0];
  if (!attempt || attempts.length !== 1) {
    throw new Error("STOCK_COUNT_ATTEMPT_NOT_LINKED");
  }
  const lines = await tx.$queryRaw<LockedStockCountApprovalLine[]>(Prisma.sql`
    SELECT al.id, al."tenantId", al."companyId", al."inventoryLocationId",
           al."itemId", al."countedByUserId", al."countedAt",
           al."countedQuantityBaseUom"
      FROM "StockCountAttemptLine" al
     WHERE al."stockCountAttemptId" = ${attempt.id}::uuid
       AND al."tenantId" = ${session.context.tenantId}::uuid
       AND al."companyId" = ${session.context.companyId}::uuid
       AND al."inventoryLocationId" = ${count.inventoryLocationId}::uuid
     ORDER BY al."lineNumber" ASC, al.id ASC
     FOR UPDATE
  `);
  if (
    lines.length === 0 ||
    lines.some(
      (line) =>
        line.countedQuantityBaseUom === null ||
        !line.countedByUserId ||
        !line.countedAt
    )
  ) {
    throw new Error("STOCK_COUNT_ENTRY_LINEAGE_INCOMPLETE");
  }
  return { attempt, lines };
}

function stockCountReviewRequest(input: {
  stockCountSessionId: string;
  stockCountAttemptId: string;
  submitterUserId: string;
  idempotencyKey: string;
}) {
  const request = {
    action: "StockCountAttemptReview.submit",
    idempotencyKey: input.idempotencyKey,
    schemaVersion: 1,
    stockCountAttemptId: input.stockCountAttemptId,
    stockCountSessionId: input.stockCountSessionId,
    submitterUserId: input.submitterUserId
  };
  return {
    canonicalJson: inventoryPilotCanonicalJson(request),
    hash: inventoryPilotDigest(request)
  };
}

async function allStockCountApprovalProhibitedActors(
  tx: TransactionClient,
  session: SessionContext,
  count: LockedStockCount,
  attempt: LockedStockCountApprovalAttempt
) {
  const counters = await tx.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
    SELECT al."countedByUserId" AS "userId"
      FROM "StockCountAttempt" a
      JOIN "StockCountAttemptLine" al ON al."stockCountAttemptId" = a.id
     WHERE a.id = ${attempt.id}::uuid
       AND a."stockCountSessionId" = ${count.id}::uuid
       AND a."tenantId" = ${session.context.tenantId}::uuid
       AND a."companyId" = ${session.context.companyId}::uuid
       AND al."tenantId" = ${session.context.tenantId}::uuid
       AND al."companyId" = ${session.context.companyId}::uuid
       AND al."inventoryLocationId" = ${count.inventoryLocationId}::uuid
       AND al."countedByUserId" IS NOT NULL
     ORDER BY al."countedByUserId" ASC, al."lineNumber" ASC, al.id ASC
     FOR UPDATE OF a, al
  `);
  return buildStockCountApprovalProhibitedActors({
    sessionCreatedByUserId: count.createdByUserId,
    sessionAssignedToUserId: count.assignedToUserId,
    attemptCreatedByUserId: attempt.createdByUserId,
    attemptAssignedToUserId: attempt.assignedToUserId,
    countedByUserIds: counters.map(({ userId }) => userId)
  });
}

export function buildStockCountApprovalProhibitedActors(input: {
  sessionCreatedByUserId: string;
  sessionAssignedToUserId: string | null;
  attemptCreatedByUserId: string;
  attemptAssignedToUserId: string | null;
  countedByUserIds: Iterable<string>;
}) {
  const actors = new Map<string, string>();
  actors.set(input.sessionCreatedByUserId, "SESSION_CREATOR");
  if (input.sessionAssignedToUserId) {
    actors.set(input.sessionAssignedToUserId, "SESSION_ASSIGNED_COUNTER");
  }
  actors.set(input.attemptCreatedByUserId, "CREATOR");
  if (input.attemptAssignedToUserId) {
    actors.set(input.attemptAssignedToUserId, "ASSIGNED_COUNTER");
  }
  for (const userId of input.countedByUserIds) actors.set(userId, "COUNTER");
  return [...actors].map(([userId, reasonCode]) => ({ userId, reasonCode }));
}

async function assertLegacyStockCountReviewIsAllowed(
  tx: TransactionClient,
  session: SessionContext,
  count: LockedStockCount,
  stage: "SUBMIT" | "REVALIDATE"
) {
  // The environment switch may deny use of the pilot producer, but it must
  // never downgrade a database-active family to the legacy direct path.
  // This runs under the same shared producer barrier as the source locks, so
  // activation cannot race the legacy admission decision.
  const activation = await tx.inventoryPilotFamilyActivation.findUnique({
    where: {
      tenantId_companyId_family: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        family: "StockCountAttemptReview"
      }
    },
    select: { status: true }
  });
  if (activation?.status === "ACTIVE") {
    const locked = await lockCurrentStockCountAttemptForApproval(tx, session, count);
    try {
      await classifyStockCountAttemptForPilotApproval({
        tx,
        // The environment is a denial-only switch. This explicit local value
        // is used solely to classify an already-active sealed database cohort;
        // it never creates activation or grants an approval path.
        environment: {
          STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED: "true"
        },
        stage,
        count: {
          session: {
            id: count.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            version: count.version,
            status: count.status,
            inventoryLocationId: count.inventoryLocationId,
            locationId: session.context.locationId,
            currentAttemptId: count.currentAttemptId
          },
          attempt: {
            id: locked.attempt.id,
            stockCountSessionId: locked.attempt.stockCountSessionId,
            tenantId: locked.attempt.tenantId,
            companyId: locked.attempt.companyId,
            version: locked.attempt.version,
            status: locked.attempt.status,
            inventoryLocationId: locked.attempt.inventoryLocationId,
            lines: locked.lines.map((line) => ({
              id: line.id,
              tenantId: line.tenantId,
              companyId: line.companyId,
              inventoryLocationId: line.inventoryLocationId,
              itemId: line.itemId
            }))
          }
        }
      });
    } catch (error) {
      // A cohort with neither matching endpoint nor item membership remains on
      // the legacy path. A mixed cohort, stale authority, malformed evidence,
      // or source mismatch is never treated as a legacy fallback.
      if (
        error instanceof Error &&
        (error.message === INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH ||
          error.message ===
            INVENTORY_PILOT_APPROVAL_ERRORS.ENDPOINT_CAPABILITY_MISMATCH)
      ) {
        return;
      }
      throw error;
    }
    throw new Error(INVENTORY_PILOT_APPROVAL_ERRORS.DISABLED);
  }
}

export async function submitStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountSubmit);
  const values = stockCountActionSchema.parse(Object.fromEntries(formData));

  const target = await findScopedStockCountLocation(session, values.id);
  const pilotEnabled =
    process.env.STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED === "true";
  await withApprovalProducerTransaction({
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    documentType: "StockCountAttemptReview"
  }, async (tx) => {
    await lockInventoryLocationForPosting(
      tx,
      session,
      target.inventoryLocationId
    );
    const count = await lockScopedStockCount(
      tx,
      session,
      target.id,
      target.inventoryLocationId
    );
    await requirePermission(session, permissions.stockCountSubmit);
    assertStockCountAssignedActor({
      assignedToUserId: count.assignedToUserId,
      actorUserId: session.user.id
    });
    const currentAttemptIdentity = count.currentAttemptId
      ? await tx.stockCountAttempt.findFirst({
          where: {
            id: count.currentAttemptId,
            stockCountSessionId: count.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: count.inventoryLocationId
          },
          select: { attemptNumber: true }
        })
      : null;
    if ((currentAttemptIdentity?.attemptNumber ?? 1) > 1 && !pilotEnabled) {
      throw new Error("STOCK_COUNT_RECOUNT_REVIEW_APPROVAL_REQUIRED");
    }
    if (!pilotEnabled) {
      await assertLegacyStockCountReviewIsAllowed(tx, session, count, "SUBMIT");
    }

    let pilotApprovalContext: {
      locked: Awaited<ReturnType<typeof lockCurrentStockCountAttemptForApproval>>;
      request: ReturnType<typeof stockCountReviewRequest>;
    } | null = null;
    if (pilotEnabled) {
      if (!values.idempotencyKey) {
        assertStockCountCanSubmit(count.status);
        throw new Error("STOCK_COUNT_APPROVAL_IDEMPOTENCY_KEY_REQUIRED");
      }
      const locked = await lockCurrentStockCountAttemptForApproval(tx, session, count);
      const request = stockCountReviewRequest({
        stockCountSessionId: count.id,
        stockCountAttemptId: locked.attempt.id,
        submitterUserId: session.user.id,
        idempotencyKey: values.idempotencyKey
      });
      const replay = await tx.stockCountReviewSubmissionIntent.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          idempotencyKey: values.idempotencyKey
        }
      });
      if (replay) {
        const replayApproval = await tx.approvalInstance.findFirst({
          where: {
            id: replay.approvalInstanceId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId
          },
          select: { documentType: true, documentId: true }
        });
        const currentActivation = await tx.inventoryPilotFamilyActivation.findUnique({
          where: {
            tenantId_companyId_family: {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              family: "StockCountAttemptReview"
            }
          }
        });
        if (
          replay.stockCountAttemptId !== locked.attempt.id ||
          replay.stockCountSessionId !== count.id ||
          replay.submitterUserId !== session.user.id ||
          replay.requestCanonicalJson !== request.canonicalJson ||
          replay.requestHash !== request.hash ||
          replay.attemptVersionBefore + 1 !== replay.attemptVersionAfter ||
          replay.sessionVersionBefore + 1 !== replay.sessionVersionAfter ||
          replay.approvalDocumentType !== "StockCountAttemptReview" ||
          replay.activationFamily !== "StockCountAttemptReview" ||
          replay.activationStatus !== "ACTIVE" ||
          !replayApproval ||
          replayApproval.documentType !== "StockCountAttemptReview" ||
          replayApproval.documentId !== locked.attempt.id ||
          count.currentAttemptId !== locked.attempt.id ||
          !currentActivation ||
          currentActivation.status !== "ACTIVE" ||
          currentActivation.currentActivationEventId !== replay.activationEventId ||
          currentActivation.configurationRevisionId !== replay.configurationRevisionId ||
          currentActivation.configurationRevisionNumber !== replay.configurationRevisionNumber ||
          currentActivation.configurationDigest !== replay.configurationDigest ||
          currentActivation.generation !== replay.activationGeneration
        ) {
          throw new Error("STOCK_COUNT_APPROVAL_IDEMPOTENCY_CONFLICT");
        }
        return;
      }
      pilotApprovalContext = { locked, request };
    }

    assertStockCountCanSubmit(count.status);
    const lines =
      pilotApprovalContext?.locked.attempt.attemptNumber &&
      pilotApprovalContext.locked.attempt.attemptNumber > 1
        ? pilotApprovalContext.locked.lines
        : await tx.stockCountLine.findMany({
            where: {
              stockCountSessionId: count.id,
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              inventoryLocationId: count.inventoryLocationId
            },
            select: {
              countedQuantityBaseUom: true,
              countedByUserId: true,
              countedAt: true
            }
          });
    if (lines.length === 0) {
      throw new Error("STOCK_COUNT_HAS_NO_LINES");
    }
    if (lines.some((line) => line.countedQuantityBaseUom === null)) {
      throw new Error("STOCK_COUNT_HAS_UNCOUNTED_LINES");
    }
    if (lines.some((line) => !line.countedByUserId || !line.countedAt)) {
      throw new Error("STOCK_COUNT_ENTRY_LINEAGE_INCOMPLETE");
    }

    // The ordinary review graph is deliberately default-off. A disabled
    // family is the only non-admitted result that can use the legacy path;
    // an enabled family with missing, mixed, or stale authority fails closed.
    if (pilotEnabled) {
      if (!pilotApprovalContext || !values.idempotencyKey) {
        throw new Error("STOCK_COUNT_APPROVAL_IDEMPOTENCY_KEY_REQUIRED");
      }
      const { locked, request } = pilotApprovalContext;

      const attestation = await classifyStockCountAttemptForPilotApproval({
        tx,
        stage: "SUBMIT",
        count: {
          session: {
            id: count.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            version: count.version,
            status: count.status,
            inventoryLocationId: count.inventoryLocationId,
            locationId: session.context.locationId,
            currentAttemptId: count.currentAttemptId
          },
          attempt: {
            id: locked.attempt.id,
            stockCountSessionId: locked.attempt.stockCountSessionId,
            tenantId: locked.attempt.tenantId,
            companyId: locked.attempt.companyId,
            version: locked.attempt.version,
            status: locked.attempt.status,
            inventoryLocationId: locked.attempt.inventoryLocationId,
            lines: locked.lines.map((line) => ({
              id: line.id,
              tenantId: line.tenantId,
              companyId: line.companyId,
              inventoryLocationId: line.inventoryLocationId,
              itemId: line.itemId
            }))
          }
        }
      });
      const approvalRule = await tx.approvalRule.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          transactionType: "StockCountAttemptReview",
          isActive: true,
          definitionSealed: true
        },
        include: { steps: { orderBy: { stepOrder: "asc" } } },
        orderBy: { priority: "asc" }
      });
      if (!approvalRule || approvalRule.steps.length === 0) {
        throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
      }
      const firstStep = approvalRule.steps[0];
      if (!firstStep) throw new Error("APPROVAL_RULE_STEP_NOT_CONFIGURED");
      const prohibitedActors = await allStockCountApprovalProhibitedActors(
        tx,
        session,
        count,
        locked.attempt
      );
      const routedSteps = approvalRule.steps.map((step, index) => ({
        ...step,
        approvalInstanceStepId: randomUUID(),
        activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
      }));
      const firstRoutedStep = routedSteps[0];
      if (!firstRoutedStep) throw new Error("APPROVAL_RULE_STEP_NOT_CONFIGURED");

      const approval = await tx.approvalInstance.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          documentType: "StockCountAttemptReview",
          documentId: locked.attempt.id,
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
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          routingPolicy: getApprovalRoutingPolicy("StockCountAttemptReview"),
          requiredPermissionCode: permissions.stockCountReview,
          dueAt: null,
          activationAudit: {
            actorUserId: session.user.id,
            source: "stock-count-attempt-review-submission"
          },
          scopeGroups: [{
            groupOrder: 1,
            targetMatchMode: "ANY",
            targets: [{
              scopeType: "LOCATION",
              companyId: session.context.companyId,
              locationId: session.context.locationId
            }]
          }],
          prohibitedActors
        });
      }
      await assertAnyEligibleApprovalActorForStep(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId
      });
      const sessionDigest = inventoryPilotDigest({
        schemaVersion: 1,
        id: count.id,
        currentAttemptId: count.currentAttemptId,
        status: count.status,
        version: count.version
      });
      const attemptDigest = inventoryPilotDigest({
        schemaVersion: 1,
        id: locked.attempt.id,
        stockCountSessionId: locked.attempt.stockCountSessionId,
        status: locked.attempt.status,
        version: locked.attempt.version
      });
      const evidenceDigest = inventoryPilotDigest({
        schemaVersion: 1,
        evidenceReference: locked.attempt.evidenceReference,
        lines: locked.lines.map((line) => ({
          id: line.id,
          itemId: line.itemId,
          countedByUserId: line.countedByUserId,
          countedAt: line.countedAt?.toISOString() ?? null,
          countedQuantityBaseUom: String(line.countedQuantityBaseUom)
        }))
      });

      const submitted = await tx.stockCountSession.updateMany({
        where: {
          id: count.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId,
          assignedToUserId: session.user.id,
          currentAttemptId: locked.attempt.id,
          status: "IN_PROGRESS",
          updatedAt: count.updatedAt,
          version: count.version
        },
        data: {
          status: "SUBMITTED",
          submittedAt: count.databaseNow,
          version: { increment: 1 }
        }
      });
      if (submitted.count !== 1) throw new Error("STOCK_COUNT_CONCURRENT_MODIFICATION");
      const attemptSubmitted = await tx.$executeRaw(Prisma.sql`
        UPDATE "StockCountAttempt"
           SET status = 'SUBMITTED', "submittedAt" = ${count.databaseNow},
               "updatedAt" = ${count.databaseNow}, version = version + 1
         WHERE id = ${locked.attempt.id}::uuid
           AND "stockCountSessionId" = ${count.id}::uuid
           AND "tenantId" = ${session.context.tenantId}::uuid
           AND "companyId" = ${session.context.companyId}::uuid
           AND status = 'IN_PROGRESS' AND version = ${locked.attempt.version}
      `);
      if (attemptSubmitted !== 1) throw new Error("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
      const evidenceCanonicalHash = inventoryPilotDigest({
        schemaVersion: 1,
        sessionDigest,
        attemptDigest,
        evidenceDigest
      });
      await tx.stockCountReviewSubmissionIntent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          stockCountAttemptId: locked.attempt.id,
          stockCountSessionId: count.id,
          attemptVersionBefore: locked.attempt.version,
          attemptVersionAfter: locked.attempt.version + 1,
          sessionVersionBefore: count.version,
          sessionVersionAfter: count.version + 1,
          evidenceCanonicalHash,
          configurationRevisionId: attestation.configurationRevisionId,
          configurationRevisionNumber: attestation.configurationRevisionNumber,
          configurationDigest: attestation.configurationDigest,
          activationEventId: attestation.activationEventId,
          activationFamily: "StockCountAttemptReview",
          activationStatus: "ACTIVE",
          activationGeneration: attestation.activationGeneration,
          idempotencyKey: values.idempotencyKey,
          requestCanonicalJson: request.canonicalJson,
          requestHash: request.hash,
          submitterUserId: session.user.id,
          approvalInstanceId: approval.id,
          approvalDocumentType: "StockCountAttemptReview"
        }
      });
      const auditEvent = await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "stock_count.submitted",
          entityType: "StockCountAttempt",
          entityId: locked.attempt.id,
          beforeData: { sessionStatus: "IN_PROGRESS", attemptStatus: "IN_PROGRESS" },
          afterData: { sessionStatus: "SUBMITTED", attemptStatus: "SUBMITTED" },
          metadata: {
            approvalInstanceId: approval.id,
            approvalRuleId: approvalRule.id,
            configurationRevisionId: attestation.configurationRevisionId,
            activationEventId: attestation.activationEventId,
            sessionDigest,
            attemptDigest,
            evidenceDigest,
            evidenceCanonicalHash
          }
        }
      });
      await recordWorkflowNotifications(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        recipientUserIds: firstStep.userId ? [firstStep.userId] : [],
        notificationType: "APPROVE_STOCK_COUNT_REVIEW",
        priority: "NORMAL",
        title: `Review Stock Count ${count.id}`,
        body: `${session.user.displayName} submitted a stock count for independent review.`,
        deepLink: `/approvals/${approval.id}`,
        entityType: "StockCountAttempt",
        entityId: locked.attempt.id,
        sourceEventKey: auditEvent.id,
        recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
        metadata: { approvalInstanceId: approval.id, approvalStepOrder: firstStep.stepOrder }
      });
      return;
    }

    const ensuredAttempt = await ensureStockCountAttempt1(tx, session, count);
    const submitted = await tx.stockCountSession.updateMany({
      where: {
        id: count.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: count.inventoryLocationId,
        assignedToUserId: session.user.id,
        status: "IN_PROGRESS",
        updatedAt: count.updatedAt,
        version: count.version,
        ...(ensuredAttempt.needsSessionLink ? { currentAttemptId: null } : {})
      },
      data: {
        status: "SUBMITTED",
        submittedAt: count.databaseNow,
        ...(ensuredAttempt.needsSessionLink
          ? { currentAttemptId: ensuredAttempt.id }
          : {}),
        version: { increment: 1 }
      }
    });
    if (submitted.count !== 1) {
      throw new Error("STOCK_COUNT_CONCURRENT_MODIFICATION");
    }
    const attemptSubmitted = await tx.$executeRaw(Prisma.sql`
      UPDATE "StockCountAttempt"
         SET status = 'SUBMITTED',
             "submittedAt" = ${count.databaseNow},
             "updatedAt" = ${count.databaseNow},
             version = version + 1
       WHERE id = ${ensuredAttempt.id}::uuid
         AND "stockCountSessionId" = ${count.id}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
         AND status = 'IN_PROGRESS'
         AND version = ${ensuredAttempt.version}
    `);
    if (attemptSubmitted !== 1) {
      throw new Error("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_count.submitted",
        entityType: "StockCountSession",
        entityId: count.id,
        beforeData: { status: "IN_PROGRESS" },
        afterData: { status: "SUBMITTED" }
      }
    });
  });
}

export async function reviewStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountReview);
  const values = reviewStockCountSchema.parse(Object.fromEntries(formData));

  if (values.reviewAction === "RECOUNT") {
    throw new Error("STOCK_COUNT_RECOUNT_DISABLED");
  }

  const target = await findScopedStockCountLocation(session, values.id);
  const nextStatus = "REVIEWED";
  const pilotEnabled =
    process.env.STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED === "true";
  await withApprovalProducerTransaction({
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    documentType: "StockCountAttemptReview"
  }, async (tx) => {
    await lockInventoryLocationForPosting(
      tx,
      session,
      target.inventoryLocationId
    );
    const count = await lockScopedStockCount(
      tx,
      session,
      target.id,
      target.inventoryLocationId
    );
    await requirePermission(session, permissions.stockCountReview);

    // Once the sealed ordinary-count approval family is enabled, direct review
    // is not an alternate terminal path. Revalidate the locked current attempt
    // against the relational activation authority before rejecting it. This
    // deliberately propagates missing, stale, mixed, or malformed pilot
    // authority instead of falling through to the legacy mutation path.
    if (pilotEnabled) {
      const locked = await lockCurrentStockCountAttemptForApproval(
        tx,
        session,
        count
      );
      await classifyStockCountAttemptForPilotApproval({
        tx,
        stage: "REVALIDATE",
        count: {
          session: {
            id: count.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            version: count.version,
            status: count.status,
            inventoryLocationId: count.inventoryLocationId,
            locationId: session.context.locationId,
            currentAttemptId: count.currentAttemptId
          },
          attempt: {
            id: locked.attempt.id,
            stockCountSessionId: locked.attempt.stockCountSessionId,
            tenantId: locked.attempt.tenantId,
            companyId: locked.attempt.companyId,
            version: locked.attempt.version,
            status: locked.attempt.status,
            inventoryLocationId: locked.attempt.inventoryLocationId,
            lines: locked.lines.map((line) => ({
              id: line.id,
              tenantId: line.tenantId,
              companyId: line.companyId,
              inventoryLocationId: line.inventoryLocationId,
              itemId: line.itemId
            }))
          }
        }
      });
      throw new Error("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_REQUIRED");
    }
    await assertLegacyStockCountReviewIsAllowed(
      tx,
      session,
      count,
      "REVALIDATE"
    );

    assertStockCountCanReview(count.status);
    const lines = await tx.stockCountLine.findMany({
      where: {
        stockCountSessionId: count.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: count.inventoryLocationId
      },
      select: {
        countedQuantityBaseUom: true,
        countedByUserId: true,
        countedAt: true
      }
    });
    assertStockCountReviewLineage({ lines });
    assertStockCountReviewerSegregation({
      reviewerUserId: session.user.id,
      createdByUserId: count.createdByUserId,
      countedByUserIds: lines.map((line) => line.countedByUserId)
    });
    const reviewed = await tx.stockCountSession.updateMany({
      where: {
        id: count.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: count.inventoryLocationId,
        status: "SUBMITTED",
        updatedAt: count.updatedAt,
        version: count.version
      },
      data: {
        status: nextStatus,
        reviewedAt: count.databaseNow,
        reviewedByUserId: session.user.id,
        reviewNotes: values.reviewNotes,
        version: { increment: 1 }
      }
    });
    if (reviewed.count !== 1) {
      throw new Error("STOCK_COUNT_CONCURRENT_MODIFICATION");
    }
    const attemptId = count.currentAttemptId;
    if (!attemptId) {
      throw new Error("STOCK_COUNT_ATTEMPT_NOT_LINKED");
    }
    if (count.currentAttemptVersion === null) {
      throw new Error("STOCK_COUNT_ATTEMPT_NOT_LINKED");
    }
    const attemptReviewed = await tx.$executeRaw(Prisma.sql`
      UPDATE "StockCountAttempt"
         SET status = ${nextStatus},
             "reviewedAt" = ${count.databaseNow},
             "reviewedByUserId" = ${session.user.id}::uuid,
             "reviewNotes" = ${values.reviewNotes},
             "updatedAt" = ${count.databaseNow},
             version = version + 1
       WHERE id = ${attemptId}::uuid
         AND "stockCountSessionId" = ${count.id}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
         AND status = 'SUBMITTED'
         AND version = ${count.currentAttemptVersion}
    `);
    if (attemptReviewed !== 1) {
      throw new Error("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_count.reviewed",
        entityType: "StockCountSession",
        entityId: count.id,
        beforeData: { status: "SUBMITTED" },
        afterData: { status: nextStatus },
        metadata: { reviewNotes: values.reviewNotes }
      }
    });
  });
}

async function assertLiveStockCountRecoveryAuthority(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    inventoryLocationId: string;
    assignedToUserId: string;
    prohibitedActorIds: ReadonlySet<string>;
  }
) {
  const now = new Date();
  const inventoryLocation = await tx.inventoryLocation.findFirst({
    where: {
      id: input.inventoryLocationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId
    },
    select: { locationId: true }
  });
  if (!inventoryLocation) throw new Error("STOCK_COUNT_NOT_FOUND");

  const assertActor = async (
    userId: string,
    requiredPermissionCodes: string[],
    errorCode: string
  ) => {
    const user = await tx.user.findFirst({
      where: { id: userId, tenantId: session.context.tenantId, status: "ACTIVE" },
      select: { privilegeEpoch: true }
    });
    if (!user) throw new Error(errorCode);
    const assignments = await tx.userRoleAssignment.findMany({
      where: {
        userId,
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        role: {
          status: "ACTIVE",
          OR: [{ tenantId: null }, { tenantId: session.context.tenantId }]
        }
      },
      select: {
        role: {
          select: {
            permissions: { select: { permission: { select: { code: true } } } }
          }
        }
      }
    });
    const codes = new Set(
      assignments.flatMap((assignment) =>
        assignment.role.permissions.map(({ permission }) => permission.code)
      )
    );
    if (requiredPermissionCodes.some((code) => !codes.has(code))) {
      throw new Error(errorCode);
    }
    const scope = await tx.userScopeAssignment.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        startsAt: { lte: now },
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          {
            OR: [
              { scopeType: "LOCATION", scopeId: inventoryLocation.locationId },
              { scopeType: "COMPANY", scopeId: session.context.companyId }
            ]
          }
        ],
        accessLevel: { in: ["OPERATE", "APPROVE", "MANAGE"] }
      },
      select: { id: true }
    });
    if (!scope) throw new Error(errorCode);
    return user;
  };

  const actor = await assertActor(
    session.user.id,
    [permissions.stockCountRecovery],
    "STOCK_COUNT_RECOVERY_AUTHORITY_STALE"
  );
  await assertActor(
    input.assignedToUserId,
    [permissions.stockCountEnter, permissions.stockCountSubmit],
    "STOCK_COUNT_RECOUNT_ASSIGNEE_NOT_ELIGIBLE"
  );
  if (input.prohibitedActorIds.has(input.assignedToUserId)) {
    throw new Error("STOCK_COUNT_RECOUNT_ASSIGNEE_SEGREGATION_REQUIRED");
  }
  if (!session.authentication?.sessionId) {
    throw new Error("PRIVILEGED_MFA_STEP_UP_REQUIRED");
  }
  const authSession = await tx.authSession.findFirst({
    where: {
      id: session.authentication.sessionId,
      tenantId: session.context.tenantId,
      userId: session.user.id,
      status: "ACTIVE",
      privilegeEpochAtIssue: actor.privilegeEpoch,
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: { not: null },
      idleExpiresAt: { gt: now },
      absoluteExpiresAt: { gt: now },
      revokedAt: null
    },
    select: { id: true, mfaAuthenticatedAt: true }
  });
  if (!authSession?.mfaAuthenticatedAt) {
    throw new Error("PRIVILEGED_MFA_STEP_UP_REQUIRED");
  }
  return authSession;
}

export async function requestStockCountRecount(
  rawInput: unknown,
  providedSession?: SessionContext
) {
  const session = providedSession ?? (await requireSessionContext());
  await requirePermission(session, permissions.stockCountRecovery);
  if (!STOCK_COUNT_RECOUNT_RECOVERY_V1_ENABLED) {
    throw new Error("STOCK_COUNT_RECOUNT_DISABLED");
  }
  if (!STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED) {
    throw new Error("STOCK_COUNT_RECOUNT_REVIEW_APPROVAL_REQUIRED");
  }
  const input = requestStockCountRecountSchema.parse(rawInput);
  const target = await findScopedStockCountLocation(session, input.id);
  await prisma.$transaction((tx) =>
    assertLiveStockCountRecoveryAuthority(tx, session, {
      inventoryLocationId: target.inventoryLocationId,
      assignedToUserId: input.assignedToUserId,
      prohibitedActorIds: new Set()
    })
  );
  const buildRequest = (source: {
    stockCountSessionId: string;
    sourceAttemptId: string;
    sourceAttemptNumber: number;
  }) => ({
    action: "StockCountRecount.request",
    schemaVersion: 1,
    stockCountSessionId: source.stockCountSessionId,
    sourceAttemptId: source.sourceAttemptId,
    sourceAttemptNumber: source.sourceAttemptNumber,
    assignedToUserId: input.assignedToUserId,
    expectedSessionVersion: input.expectedSessionVersion,
    expectedAttemptVersion: input.expectedAttemptVersion,
    reason: input.reason,
    evidenceReference: input.evidenceReference,
    idempotencyKey: input.idempotencyKey,
    cutoffDisposition: "NEW_CUTOFF"
  });
  const existing = await prisma.stockCountRecountTransition.findUnique({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey: input.idempotencyKey
      }
    },
    select: {
      id: true,
      stockCountSessionId: true,
      inventoryLocationId: true,
      sourceAttemptId: true,
      successorAttemptId: true,
      requestHash: true,
      actorUserId: true,
      reviewConfigurationRevisionId: true,
      reviewConfigurationRevisionNumber: true,
      reviewConfigurationDigest: true,
      reviewActivationEventId: true,
      reviewActivationGeneration: true,
      sourceAttempt: { select: { attemptNumber: true } }
    }
  });
  if (existing) {
    if (
      existing.actorUserId !== session.user.id ||
      existing.stockCountSessionId !== input.id ||
      existing.inventoryLocationId !== target.inventoryLocationId
    ) {
      throw new Error("STOCK_COUNT_NOT_FOUND");
    }
    const replayRequest = buildRequest({
      stockCountSessionId: existing.stockCountSessionId,
      sourceAttemptId: existing.sourceAttemptId,
      sourceAttemptNumber: existing.sourceAttempt.attemptNumber
    });
    if (existing.requestHash.trim() !== inventoryPilotDigest(replayRequest)) {
      throw new Error("STOCK_COUNT_RECOUNT_IDEMPOTENCY_CONFLICT");
    }
    await prisma.$transaction(async (tx) => {
      await assertLiveStockCountRecoveryAuthority(tx, session, {
        inventoryLocationId: target.inventoryLocationId,
        assignedToUserId: input.assignedToUserId,
        prohibitedActorIds: new Set()
      });
      await assertPrivilegedMfaForAction(
        session,
        {
          action: "stock_count.recount_recovery",
          enforcementScope: "all_sensitive",
          permissionCode: permissions.stockCountRecovery,
          entityType: "StockCountSession",
          entityId: input.id,
          reason: input.reason
        },
        { transaction: tx, forceEnforcement: true }
      );
      const currentActivation = await tx.inventoryPilotFamilyActivation.findUnique({
        where: {
          tenantId_companyId_family: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            family: "StockCountAttemptReview"
          }
        }
      });
      if (
        !currentActivation ||
        currentActivation.status !== "ACTIVE" ||
        currentActivation.currentActivationEventId !==
          existing.reviewActivationEventId ||
        currentActivation.configurationRevisionId !==
          existing.reviewConfigurationRevisionId ||
        currentActivation.configurationRevisionNumber !==
          existing.reviewConfigurationRevisionNumber ||
        currentActivation.configurationDigest !==
          existing.reviewConfigurationDigest ||
        currentActivation.generation !== existing.reviewActivationGeneration
      ) {
        throw new Error("STOCK_COUNT_RECOUNT_REVIEW_AUTHORITY_STALE");
      }
    });
    return {
      transitionId: existing.id,
      successorAttemptId: existing.successorAttemptId,
      replayed: true
    };
  }
  const preflight = await prisma.stockCountSession.findFirst({
    where: {
      ...scopedStockCountWhere(session, input.id),
      inventoryLocationId: target.inventoryLocationId,
      status: "REVIEWED",
      currentAttemptId: { not: null }
    },
    select: {
      id: true,
      version: true,
      currentAttempt: {
        select: {
          id: true,
          version: true,
          attemptNumber: true,
          stockAdjustments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true }
          }
        }
      }
    }
  });
  if (!preflight?.currentAttempt) throw new Error("STOCK_COUNT_NOT_FOUND");
  const sourcePreflight = preflight.currentAttempt;
  const request = buildRequest({
    stockCountSessionId: preflight.id,
    sourceAttemptId: sourcePreflight.id,
    sourceAttemptNumber: sourcePreflight.attemptNumber
  });
  const requestCanonicalJson = inventoryPilotCanonicalJson(request);
  const requestHash = inventoryPilotDigest(request);

  return withApprovalProducerTransaction(
    {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "StockAdjustment"
    },
    async (tx) => {
      type LockedAdjustment = {
        id: string;
        status: string;
        requestedByUserId: string;
        inventoryLocationId: string;
        adjustmentType: string;
        postedAt: Date | null;
        reversedAt: Date | null;
      };
      type LockedAdjustmentLine = {
        id: string;
        postedMovementId: string | null;
      };
      type LockedAdjustmentApproval = {
        id: string;
        status: string;
      };
      type LockedAdjustmentApprovalStep = {
        id: string;
        status: string;
        actedByUserId: string | null;
        assignedUserId: string | null;
      };
      const adjustmentId = sourcePreflight.stockAdjustments[0]?.id ?? null;
      const adjustmentRows = adjustmentId
        ? await tx.$queryRaw<LockedAdjustment[]>(Prisma.sql`
            SELECT id, status, "requestedByUserId", "inventoryLocationId",
                   "adjustmentType", "postedAt", "reversedAt"
              FROM "StockAdjustment"
             WHERE id = ${adjustmentId}::uuid
               AND "tenantId" = ${session.context.tenantId}::uuid
               AND "companyId" = ${session.context.companyId}::uuid
             FOR UPDATE
          `)
        : [];
      const adjustment = adjustmentRows[0] ?? null;
      if (adjustmentId && !adjustment) throw new Error("STOCK_COUNT_RECOVERY_ADJUSTMENT_NOT_AVAILABLE");

      const locationScopeRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT il.id
          FROM "InventoryLocation" il
          JOIN "Location" l
            ON l.id = il."locationId"
           AND l."tenantId" = il."tenantId"
           AND l."companyId" = il."companyId"
         WHERE il.id = ${target.inventoryLocationId}::uuid
           AND il."tenantId" = ${session.context.tenantId}::uuid
           AND il."companyId" = ${session.context.companyId}::uuid
           AND l.id = ${session.context.locationId}::uuid
         FOR SHARE OF il, l
      `);
      if (locationScopeRows.length !== 1) throw new Error("STOCK_COUNT_NOT_FOUND");
      const lockedAdjustmentLines = adjustment
        ? await tx.$queryRaw<LockedAdjustmentLine[]>(Prisma.sql`
            SELECT id, "postedMovementId"
              FROM "StockAdjustmentLine"
             WHERE "stockAdjustmentId" = ${adjustment.id}::uuid
               AND "tenantId" = ${session.context.tenantId}::uuid
               AND "companyId" = ${session.context.companyId}::uuid
               AND "inventoryLocationId" = ${target.inventoryLocationId}::uuid
             ORDER BY "lineNumber", id
             FOR UPDATE
          `)
        : [];
      const lockedAdjustmentApprovals = adjustment
        ? await tx.$queryRaw<LockedAdjustmentApproval[]>(Prisma.sql`
            SELECT id, status
              FROM "ApprovalInstance"
             WHERE "tenantId" = ${session.context.tenantId}::uuid
               AND "companyId" = ${session.context.companyId}::uuid
               AND "documentType" = 'StockAdjustment'
               AND "documentId" = ${adjustment.id}::uuid
             ORDER BY "createdAt", id
             FOR UPDATE
          `)
        : [];
      if (lockedAdjustmentApprovals.length > 1) {
        throw new Error("STOCK_COUNT_RECOVERY_ADJUSTMENT_APPROVAL_AMBIGUOUS");
      }
      const lockedAdjustmentApprovalSteps = lockedAdjustmentApprovals[0]
        ? await tx.$queryRaw<LockedAdjustmentApprovalStep[]>(Prisma.sql`
            SELECT id, status, "actedByUserId", "assignedUserId"
              FROM "ApprovalInstanceStep"
             WHERE "approvalInstanceId" = ${lockedAdjustmentApprovals[0].id}::uuid
             ORDER BY "stepOrder", id
             FOR UPDATE
          `)
        : [];
      const actionableAdjustmentNotifications = adjustment
        ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id
              FROM "Notification"
             WHERE "tenantId" = ${session.context.tenantId}::uuid
               AND "companyId" = ${session.context.companyId}::uuid
               AND "entityType" = 'StockAdjustment'
               AND "entityId" = ${adjustment.id}::uuid
               AND "archivedAt" IS NULL
               AND status <> 'ARCHIVED'
             ORDER BY id
             FOR UPDATE
          `)
        : [];

      await lockInventoryLocationForPosting(tx, session, target.inventoryLocationId);
      const count = await lockScopedStockCount(tx, session, target.id, target.inventoryLocationId);
      if (
        count.status !== "REVIEWED" ||
        count.version !== input.expectedSessionVersion ||
        count.currentAttemptId !== sourcePreflight.id ||
        count.currentAttemptVersion !== input.expectedAttemptVersion
      ) {
        throw new Error("STOCK_COUNT_RECOUNT_STALE_VERSION");
      }
      const attempts = await tx.$queryRaw<Array<{
        id: string;
        attemptNumber: number;
        status: string;
        version: number;
        blindCount: boolean;
        freezeMovements: boolean;
        createdByUserId: string;
        assignedToUserId: string | null;
        reviewedByUserId: string | null;
      }>>(Prisma.sql`
        SELECT id, "attemptNumber", status, version, "blindCount",
               "freezeMovements", "createdByUserId", "assignedToUserId",
               "reviewedByUserId"
          FROM "StockCountAttempt"
         WHERE id = ${count.currentAttemptId}::uuid
           AND "stockCountSessionId" = ${count.id}::uuid
           AND "tenantId" = ${session.context.tenantId}::uuid
           AND "companyId" = ${session.context.companyId}::uuid
           AND "inventoryLocationId" = ${count.inventoryLocationId}::uuid
         FOR UPDATE
      `);
      const sourceAttempt = attempts[0];
      if (!sourceAttempt || sourceAttempt.status !== "REVIEWED") {
        throw new Error("STOCK_COUNT_RECOUNT_SOURCE_NOT_REVIEWED");
      }
      const custodyRows = await tx.$queryRaw<Array<StockCountRecountAuthorityLine & {
        userId: string | null;
      }>>(Prisma.sql`
        SELECT id, "tenantId", "companyId", "inventoryLocationId", "itemId",
               "countedByUserId" AS "userId"
          FROM "StockCountAttemptLine"
         WHERE "stockCountAttemptId" = ${sourceAttempt.id}::uuid
           AND "tenantId" = ${session.context.tenantId}::uuid
           AND "companyId" = ${session.context.companyId}::uuid
           AND "inventoryLocationId" = ${count.inventoryLocationId}::uuid
         ORDER BY "lineNumber", id
         FOR UPDATE
      `);
      const reviewAuthority = await attestStockCountRecountReviewAuthority(
        tx,
        session,
        {
          stockCountSessionId: count.id,
          stockCountAttemptId: sourceAttempt.id,
          inventoryLocationId: count.inventoryLocationId,
          sessionVersion: count.version,
          attemptVersion: sourceAttempt.version,
          lines: custodyRows.map((line) => ({
            id: line.id,
            tenantId: line.tenantId,
            companyId: line.companyId,
            inventoryLocationId: line.inventoryLocationId,
            itemId: line.itemId
          }))
        }
      );
      const adjustmentOutcomeRecipientIds = new Set<string>([session.user.id]);
      const recoveryActorConflicts = new Set(
        [
          count.createdByUserId,
          count.assignedToUserId,
          sourceAttempt.createdByUserId,
          sourceAttempt.assignedToUserId,
          ...custodyRows.map(({ userId }) => userId)
        ].filter((value): value is string => Boolean(value))
      );
      if (adjustment) {
        recoveryActorConflicts.add(adjustment.requestedByUserId);
        adjustmentOutcomeRecipientIds.add(adjustment.requestedByUserId);
        for (const step of lockedAdjustmentApprovalSteps) {
          if (step.actedByUserId) recoveryActorConflicts.add(step.actedByUserId);
          if (step.actedByUserId) adjustmentOutcomeRecipientIds.add(step.actedByUserId);
          if (step.assignedUserId) {
            adjustmentOutcomeRecipientIds.add(step.assignedUserId);
          }
        }
      }
      if (recoveryActorConflicts.has(session.user.id)) {
        throw new Error("STOCK_COUNT_RECOVERY_ACTOR_SEGREGATION_REQUIRED");
      }
      const assigneeProhibitedActorIds = new Set([
        ...recoveryActorConflicts,
        session.user.id,
        ...(count.reviewedByUserId ? [count.reviewedByUserId] : []),
        ...(sourceAttempt.reviewedByUserId
          ? [sourceAttempt.reviewedByUserId]
          : [])
      ]);
      const authSession = await assertLiveStockCountRecoveryAuthority(tx, session, {
        inventoryLocationId: count.inventoryLocationId,
        assignedToUserId: input.assignedToUserId,
        prohibitedActorIds: assigneeProhibitedActorIds
      });
      await assertPrivilegedMfaForAction(
        session,
        {
          action: "stock_count.recount_recovery",
          enforcementScope: "all_sensitive",
          permissionCode: permissions.stockCountRecovery,
          entityType: "StockCountSession",
          entityId: count.id,
          reason: input.reason
        },
        { transaction: tx, forceEnforcement: true }
      );

      let adjustmentDisposition = "NONE";
      if (adjustment) {
        if (adjustment.inventoryLocationId !== count.inventoryLocationId || adjustment.adjustmentType !== "COUNT_VARIANCE") {
          throw new Error("STOCK_COUNT_RECOVERY_ADJUSTMENT_NOT_AVAILABLE");
        }
        if (adjustment.status === "CANCELLED") adjustmentDisposition = "CANCELLED_UNPOSTED";
        else if (adjustment.status === "REVERSED") adjustmentDisposition = "REVERSED_POSTED";
        else if (adjustment.status === "APPROVED" && !adjustment.postedAt) {
          const approval = lockedAdjustmentApprovals[0];
          if (
            !approval ||
            approval.status !== "APPROVED" ||
            lockedAdjustmentApprovalSteps.length === 0 ||
            lockedAdjustmentApprovalSteps.some(
              (step) => !["APPROVED", "SKIPPED"].includes(step.status)
            )
          ) {
            throw new Error("STOCK_COUNT_RECOVERY_ADJUSTMENT_APPROVAL_NOT_TERMINAL");
          }
          if (
            lockedAdjustmentLines.length === 0 ||
            lockedAdjustmentLines.some((line) => line.postedMovementId)
          ) {
            throw new Error("STOCK_COUNT_RECOVERY_ADJUSTMENT_NOT_VOIDABLE");
          }
          if (recoveryActorConflicts.has(session.user.id)) {
            throw new Error("STOCK_COUNT_RECOVERY_ACTOR_SEGREGATION_REQUIRED");
          }
          if (actionableAdjustmentNotifications.length > 0) {
            const archivedNotifications = await tx.notification.updateMany({
              where: {
                id: { in: actionableAdjustmentNotifications.map(({ id }) => id) },
                tenantId: session.context.tenantId,
                companyId: session.context.companyId,
                entityType: "StockAdjustment",
                entityId: adjustment.id,
                archivedAt: null
              },
              data: { status: "ARCHIVED", archivedAt: count.databaseNow }
            });
            if (archivedNotifications.count !== actionableAdjustmentNotifications.length) {
              throw new Error("STOCK_COUNT_RECOVERY_NOTIFICATION_CONFLICT");
            }
          }
          const voided = await tx.stockAdjustment.updateMany({
            where: {
              id: adjustment.id,
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              inventoryLocationId: count.inventoryLocationId,
              status: "APPROVED",
              postedAt: null,
              postedByUserId: null
            },
            data: {
              status: "VOIDED_FOR_RECOUNT",
              voidedForRecountByUserId: session.user.id,
              voidedForRecountAt: count.databaseNow,
              voidedForRecountReason: input.reason,
              voidedForRecountEvidenceReference: input.evidenceReference
            }
          });
          if (voided.count !== 1) throw new Error("STOCK_COUNT_RECOVERY_ADJUSTMENT_CONFLICT");
          adjustmentDisposition = "VOIDED_APPROVED_UNPOSTED";
        } else if (["DRAFT", "SUBMITTED", "RETURNED", "PENDING_APPROVAL"].includes(adjustment.status)) {
          throw new Error("STOCK_COUNT_RECOVERY_CANCEL_ADJUSTMENT_FIRST");
        } else if (adjustment.status === "POSTED") {
          throw new Error("STOCK_COUNT_RECOVERY_REVERSE_ADJUSTMENT_FIRST");
        } else {
          throw new Error("STOCK_COUNT_RECOVERY_ADJUSTMENT_IN_PROGRESS");
        }
      }

      const successor = await tx.stockCountAttempt.create({
        data: {
          stockCountSessionId: count.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId,
          attemptNumber: sourceAttempt.attemptNumber + 1,
          status: "DRAFT",
          blindCount: sourceAttempt.blindCount,
          freezeMovements: sourceAttempt.freezeMovements,
          reason: input.reason,
          evidenceReference: input.evidenceReference,
          createdByUserId: session.user.id,
          assignedToUserId: input.assignedToUserId
        },
        select: { id: true }
      });
      const transition = await tx.stockCountRecountTransition.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId,
          stockCountSessionId: count.id,
          sourceAttemptId: sourceAttempt.id,
          successorAttemptId: successor.id,
          linkedStockAdjustmentId: adjustment?.id ?? null,
          adjustmentDisposition,
          cutoffDisposition: "NEW_CUTOFF",
          idempotencyKey: input.idempotencyKey,
          requestCanonicalJson: JSON.parse(requestCanonicalJson),
          requestHash,
          reason: input.reason,
          evidenceReference: input.evidenceReference,
          actorUserId: session.user.id,
          authSessionId: authSession.id,
          mfaVerifiedAt: authSession.mfaAuthenticatedAt!,
          controlledEvidenceQualificationId:
            requireControlledEvidenceQualificationForRecount(),
          reviewConfigurationRevisionId:
            reviewAuthority.configurationRevisionId,
          reviewConfigurationRevisionNumber:
            reviewAuthority.configurationRevisionNumber,
          reviewConfigurationDigest: reviewAuthority.configurationDigest,
          reviewActivationEventId: reviewAuthority.activationEventId,
          reviewActivationFamily: reviewAuthority.family,
          reviewActivationStatus: "ACTIVE",
          reviewActivationGeneration: reviewAuthority.activationGeneration
        },
        select: { id: true }
      });
      const moved = await tx.stockCountSession.updateMany({
        where: {
          id: count.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: count.inventoryLocationId,
          status: "REVIEWED",
          currentAttemptId: sourceAttempt.id,
          version: input.expectedSessionVersion
        },
        data: {
          status: "RECOUNT_REQUESTED",
          currentAttemptId: successor.id,
          assignedToUserId: input.assignedToUserId,
          version: { increment: 1 }
        }
      });
      if (moved.count !== 1) throw new Error("STOCK_COUNT_RECOUNT_STALE_VERSION");
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "stock_count.recount_requested",
          entityType: "StockCountSession",
          entityId: count.id,
          beforeData: { status: "REVIEWED", currentAttemptId: sourceAttempt.id },
          afterData: { status: "RECOUNT_REQUESTED", currentAttemptId: successor.id },
          metadata: {
            transitionId: transition.id,
            adjustmentDisposition,
            cutoffDisposition: "NEW_CUTOFF"
          }
        }
      });
      await recordWorkflowNotifications(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        recipientUserIds: [input.assignedToUserId],
        notificationType: "STOCK_COUNT_RECOUNT_ASSIGNED",
        priority: "HIGH",
        title: "Stock recount assigned",
        body: "A protected recount is ready to start with a new cutoff.",
        deepLink: `/counts/${count.id}`,
        entityType: "StockCountSession",
        entityId: count.id,
        sourceEventKey: `stock-count-recount:${transition.id}:assigned`,
        recipientBasis: "ASSIGNED_RECOUNT_COUNTER"
      });
      if (adjustment && adjustmentDisposition !== "NONE") {
        await recordWorkflowNotifications(tx, {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
          recipientUserIds: [...adjustmentOutcomeRecipientIds],
          notificationType: "STOCK_COUNT_RECOUNT_RECOVERY_OUTCOME",
          priority: "HIGH",
          title: "Stock-count recovery recorded",
          body:
            "A linked count-variance adjustment reached a protected terminal disposition before a recount was assigned.",
          deepLink: `/counts/${count.id}`,
          entityType: "StockAdjustment",
          entityId: adjustment.id,
          sourceEventKey: `stock-count-recount:${transition.id}:adjustment-outcome`,
          recipientBasis: "RECOUNT_RECOVERY_STAKEHOLDER",
          metadata: {
            stockCountSessionId: count.id,
            transitionId: transition.id,
            adjustmentDisposition
          }
        });
      }
      return { transitionId: transition.id, successorAttemptId: successor.id, replayed: false };
    }
  );
}

export async function cancelStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountCancel);
  const values = cancelStockCountSchema.parse(Object.fromEntries(formData));

  const target = await findScopedStockCountLocation(session, values.id);

  await prisma.$transaction(async (tx) => {
    await lockInventoryLocationForPosting(
      tx,
      session,
      target.inventoryLocationId
    );
    const count = await lockScopedStockCount(
      tx,
      session,
      target.id,
      target.inventoryLocationId
    );
    await requirePermission(session, permissions.stockCountCancel);
    assertStockCountCanCancel(count.status);
    if (!count.currentAttemptId || count.currentAttemptVersion === null) {
      throw new Error("STOCK_COUNT_ATTEMPT_NOT_LINKED");
    }

    // A pilot-admitted review is identified by the immutable intent, rather
    // than the rollout flag. This lets an already-admitted count be cancelled
    // coherently even after the default-off switch is restored. Keep the lock
    // order source -> intent -> graph: terminal approval paths take the same
    // source lock before changing either graph or source state.
    const pendingIntent = count.status === "SUBMITTED"
      ? await tx.$queryRaw<Array<{
          id: string;
          approvalInstanceId: string;
          stockCountAttemptId: string;
          stockCountSessionId: string;
          attemptVersionBefore: number;
          attemptVersionAfter: number;
          sessionVersionBefore: number;
          sessionVersionAfter: number;
          approvalDocumentType: string;
          activationFamily: string;
          activationStatus: string;
        }>>(Prisma.sql`
          SELECT i.id, i."approvalInstanceId", i."stockCountAttemptId",
                 i."stockCountSessionId", i."attemptVersionBefore",
                 i."attemptVersionAfter", i."sessionVersionBefore",
                 i."sessionVersionAfter", i."approvalDocumentType",
                 i."activationFamily", i."activationStatus"
            FROM "StockCountReviewSubmissionIntent" i
           WHERE i."tenantId" = ${session.context.tenantId}::uuid
             AND i."companyId" = ${session.context.companyId}::uuid
             AND i."stockCountAttemptId" = ${count.currentAttemptId}::uuid
             AND i."stockCountSessionId" = ${count.id}::uuid
           ORDER BY i."createdAt" ASC, i.id ASC
        `)
      : [];
    const pendingGraphs = count.status === "SUBMITTED"
      ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT ai.id
            FROM "ApprovalInstance" ai
           WHERE ai."tenantId" = ${session.context.tenantId}::uuid
             AND ai."companyId" = ${session.context.companyId}::uuid
             AND ai."documentType" = 'StockCountAttemptReview'
             AND ai."documentId" = ${count.currentAttemptId}::uuid
             AND ai.status = 'PENDING'::"ApprovalStatus"
           ORDER BY ai.id ASC
           FOR UPDATE OF ai
        `)
      : [];
    if (pendingIntent.length !== pendingGraphs.length || pendingIntent.length > 1) {
      throw new Error("STOCK_COUNT_CANCELLATION_APPROVAL_LINEAGE_CONFLICT");
    }
    const intent = pendingIntent[0];
    const graph = pendingGraphs[0];
    if (
      intent &&
      (!graph ||
        intent.approvalInstanceId !== graph.id ||
        intent.stockCountAttemptId !== count.currentAttemptId ||
        intent.stockCountSessionId !== count.id ||
        intent.attemptVersionBefore + 1 !== intent.attemptVersionAfter ||
        intent.sessionVersionBefore + 1 !== intent.sessionVersionAfter ||
        intent.attemptVersionAfter !== count.currentAttemptVersion ||
        intent.sessionVersionAfter !== count.version ||
        intent.approvalDocumentType !== "StockCountAttemptReview" ||
        intent.activationFamily !== "StockCountAttemptReview" ||
        intent.activationStatus !== "ACTIVE")
    ) {
      throw new Error("STOCK_COUNT_CANCELLATION_APPROVAL_LINEAGE_CONFLICT");
    }
    const approvalCancellation = intent
      ? await terminatePendingApprovalForCancellation(tx, {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          documentType: "StockCountAttemptReview",
          documentId: intent.stockCountAttemptId,
          policy: "APPROVAL_REQUIRED",
          // Admission is durable evidence. A later flag disable cannot strand
          // an in-flight normalized graph.
          forceWhenDisabled: true
        })
      : null;
    if (
      intent &&
      (approvalCancellation?.mode !== "CANCELLED" ||
        approvalCancellation.approvalInstanceId !== intent.approvalInstanceId)
    ) {
      throw new Error("STOCK_COUNT_CANCELLATION_APPROVAL_LINEAGE_CONFLICT");
    }
    const cancelled = await tx.stockCountSession.updateMany({
      where: {
        id: count.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: count.inventoryLocationId,
        status: count.status,
        updatedAt: count.updatedAt,
        version: count.version
      },
      data: {
        status: "CANCELLED",
        cancelledAt: count.databaseNow,
        cancellationReason: values.cancellationReason,
        version: { increment: 1 }
      }
    });
    if (cancelled.count !== 1) {
      throw new Error("STOCK_COUNT_CONCURRENT_MODIFICATION");
    }
    const attemptId = count.currentAttemptId;
    const attemptCancelled = await tx.$executeRaw(Prisma.sql`
      UPDATE "StockCountAttempt"
         SET status = 'CANCELLED',
             "cancelledAt" = ${count.databaseNow},
             "cancellationReason" = ${values.cancellationReason},
             "updatedAt" = ${count.databaseNow},
             version = version + 1
       WHERE id = ${attemptId}::uuid
         AND "stockCountSessionId" = ${count.id}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
         AND "inventoryLocationId" = ${count.inventoryLocationId}::uuid
         AND status = ${count.status}
         AND version = ${count.currentAttemptVersion}
    `);
    if (attemptCancelled !== 1) {
      throw new Error("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_count.cancelled",
        entityType: "StockCountSession",
        entityId: count.id,
        beforeData: { status: count.status },
        afterData: { status: "CANCELLED" },
        metadata: {
          reason: values.cancellationReason,
          approvalInstanceId: intent?.approvalInstanceId ?? null
        }
      }
    });
  });
}

export async function generateStockCountVarianceAdjustment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockAdjustmentCreate);
  // DEC-0098/DEC-0060 keep Count Variance generation disabled until immutable
  // recount recovery, adjustment lineage, and production evidence are complete.
  throw new Error("STOCK_COUNT_VARIANCE_DISABLED");
  const values = stockCountActionSchema.parse(Object.fromEntries(formData));
  const target = await findScopedStockCountLocation(session, values.id);

  let adjustmentId: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const adjustment = await prisma.$transaction(async (tx) => {
        await lockInventoryLocationForPosting(
          tx,
          session,
          target.inventoryLocationId
        );
        const locked = await lockScopedStockCount(
          tx,
          session,
          target.id,
          target.inventoryLocationId
        );
        await requirePermission(session, permissions.stockAdjustmentCreate);
        assertStockCountCanGenerateAdjustment(locked.status);

        const existing = await tx.stockAdjustment.findFirst({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            sourceStockCountSessionId: locked.id
          },
          select: { id: true }
        });
        if (existing) {
          return existing;
        }

        const count = await tx.stockCountSession.findFirst({
          where: {
            id: locked.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: locked.inventoryLocationId,
            status: "REVIEWED"
          },
          select: {
            id: true,
            publicReference: true,
            inventoryLocationId: true,
            currentAttemptId: true,
            lines: {
              orderBy: { lineNumber: "asc" },
              select: {
                id: true,
                itemId: true,
                uomId: true,
                lotNumber: true,
                expiryDate: true,
                systemQuantityBaseUom: true,
                countedQuantityBaseUom: true,
                varianceQuantityBaseUom: true,
                notes: true,
                uom: { select: { uomCode: true } },
                attemptLineMigration: {
                  select: { id: true, stockCountAttemptId: true }
                }
              }
            }
          }
        });
        if (!count) {
          throw new Error("STOCK_COUNT_NOT_REVIEWED_FOR_ADJUSTMENT");
        }
        const varianceLines = filterCountVarianceLines(count.lines);
        if (varianceLines.length === 0) {
          throw new Error("STOCK_COUNT_HAS_NO_VARIANCE_LINES");
        }
        if (!count.currentAttemptId) {
          throw new Error("STOCK_COUNT_ATTEMPT_NOT_LINKED");
        }
        if (varianceLines.some(
          (line) =>
            line.attemptLineMigration?.stockCountAttemptId !== count.currentAttemptId
        )) {
          throw new Error("STOCK_COUNT_ATTEMPT_LINE_PARITY_FAILED");
        }

        const created = await tx.stockAdjustment.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: count.inventoryLocationId,
            publicReference: await nextStockAdjustmentReference(
              session.context.companyId
            ),
            requestedByUserId: session.user.id,
            adjustmentType: "COUNT_VARIANCE",
            reasonCode: "COUNT_VARIANCE",
            reasonDescription: `Stock count variance generated from ${count.publicReference}`,
            sourceDocumentType: "StockCountSession",
            sourceDocumentId: count.id,
            sourceStockCountSessionId: count.id,
            sourceStockCountAttemptId: count.currentAttemptId,
            totalEstimatedValueImpact: 0
          }
        });

        await tx.stockAdjustmentLine.createMany({
          data: varianceLines.map((line, index) => {
            const quantityDeltaBaseUom = Number(line.varianceQuantityBaseUom);
            const lotKey = normalizeInventoryLotKey(
              line.lotNumber,
              line.expiryDate
            );

            return {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              stockAdjustmentId: created.id,
              inventoryLocationId: count.inventoryLocationId,
              itemId: line.itemId,
              uomId: line.uomId,
              lineNumber: index + 1,
              lotKey,
              lotNumber: line.lotNumber ?? null,
              expiryDate: line.expiryDate ?? null,
              systemQuantityBaseUom: line.systemQuantityBaseUom,
              quantityDeltaBaseUom,
              unitCost: 0,
              estimatedValueImpact: 0,
              reasonCode: "COUNT_VARIANCE",
              notes:
                line.notes ??
                `Counted ${Number(line.countedQuantityBaseUom)} ${line.uom.uomCode}`,
              sourceStockCountLineId: line.id,
              sourceStockCountAttemptLineId: line.attemptLineMigration?.id ?? null
            };
          })
        });

        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "stock_count.variance_adjustment_generated",
            entityType: "StockCountSession",
            entityId: count.id,
            metadata: {
              adjustmentId: created.id,
              lineCount: varianceLines.length,
              nonPostingAdjustment: true
            }
          }
        });

        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "stock_adjustment.created_from_stock_count",
            entityType: "StockAdjustment",
            entityId: created.id,
            afterData: { status: "DRAFT" },
            metadata: {
              stockCountSessionId: count.id,
              stockCountReference: count.publicReference,
              lineCount: varianceLines.length,
              approvalAndPostingRequired: true
            }
          }
        });

        return created;
      });
      adjustmentId = adjustment.id;
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 5) {
        throw error;
      }
    }
  }

  if (!adjustmentId) {
    throw new Error("STOCK_ADJUSTMENT_REFERENCE_ALLOCATION_FAILED");
  }

  return adjustmentId;
}
