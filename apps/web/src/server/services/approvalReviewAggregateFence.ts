import { createHash } from "node:crypto";
import { Prisma, type TransactionClient } from "@ogfi/database";

export const approvalReviewSourceFrozenError =
  "APPROVAL_REVIEW_SOURCE_FROZEN";

export const approvalReviewBoundEvidenceSourceTypes = [
  "PURCHASE_REQUEST",
  "SUPPLIER_QUOTATION",
  "PURCHASE_ORDER",
] as const;

export type ApprovalReviewBoundEvidenceSourceType =
  (typeof approvalReviewBoundEvidenceSourceTypes)[number];

export type ApprovalReviewAggregateIdentity = {
  tenantId: string;
  companyId: string;
  sourceType:
    | ApprovalReviewBoundEvidenceSourceType
    | "QUOTATION_REQUEST"
    | "INVENTORY_TRANSFER"
    | "STOCK_COUNT_ATTEMPT"
    | "WASTAGE_REPORT"
    | "STOCK_ADJUSTMENT";
  sourceRecordId: string;
};

export type ApprovalReviewDecisionIdentity = {
  tenantId: string;
  companyId: string;
  family:
    | "PurchaseRequest"
    | "QuotationRecommendation"
    | "PurchaseOrder"
    | "InventoryTransfer"
    | "StockCountAttemptReview"
    | "WastageReport"
    | "StockAdjustment";
  documentId: string;
};

type GovernedApprovalRow = { approvalId: string; status: string };
type SupplierQuotationRow = { sourceRecordId: string };
type MutableSourceRow = { status: string };
type QuotationRequestRow = { sourceRecordId: string };

function isApprovalReviewBoundEvidenceSourceType(
  sourceType: string,
): sourceType is ApprovalReviewBoundEvidenceSourceType {
  return (approvalReviewBoundEvidenceSourceTypes as readonly string[]).includes(
    sourceType,
  );
}

/**
 * PostgreSQL advisory locks accept two signed 32-bit integers. Deriving both
 * words from a domain-separated SHA-256 digest keeps the lock stable across
 * Node processes without exposing or truncating a UUID to an unsafe JS number.
 */
export function approvalReviewAggregateFenceKeyForTest(
  input: ApprovalReviewAggregateIdentity,
) {
  const digest = createHash("sha256")
    .update("ogfi:approval-review-aggregate-fence:v1\0")
    .update(input.tenantId)
    .update("\0")
    .update(input.companyId)
    .update("\0")
    .update(input.sourceType)
    .update("\0")
    .update(input.sourceRecordId)
    .digest();
  return {
    namespaceKey: digest.readInt32BE(0),
    aggregateKey: digest.readInt32BE(4),
  };
}

/**
 * Shared by reviewed decisions and every writer that can alter the canonical
 * review snapshot. The lock is transaction-scoped and therefore releases on
 * commit or rollback without a separate cleanup path.
 */
export async function acquireApprovalReviewAggregateFence(
  tx: TransactionClient,
  input: ApprovalReviewAggregateIdentity,
) {
  const key = approvalReviewAggregateFenceKeyForTest(input);
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${key.namespaceKey}::int, ${key.aggregateKey}::int)`,
  );
}

async function readGovernedApprovals(
  tx: TransactionClient,
  input: {
    tenantId: string;
    companyId: string;
    sourceType: ApprovalReviewBoundEvidenceSourceType;
    sourceRecordId: string;
  },
) {
  return input.sourceType === "SUPPLIER_QUOTATION"
    ? tx.$queryRaw<GovernedApprovalRow[]>(Prisma.sql`
        SELECT approval.id AS "approvalId", approval.status::text AS status
          FROM "SupplierQuotation" quotation
          JOIN "QuotationRecommendation" recommendation
            ON recommendation."quotationRequestId" = quotation."quotationRequestId"
           AND recommendation."tenantId" = quotation."tenantId"
           AND recommendation."companyId" = quotation."companyId"
          JOIN "ApprovalInstance" approval
            ON approval."documentType" = 'QuotationRecommendation'
           AND approval."documentId" = recommendation.id
           AND approval."tenantId" = recommendation."tenantId"
           AND approval."companyId" = recommendation."companyId"
         WHERE quotation.id = ${input.sourceRecordId}::uuid
           AND quotation."tenantId" = ${input.tenantId}::uuid
           AND quotation."companyId" = ${input.companyId}::uuid
         ORDER BY approval.id
      `)
    : tx.$queryRaw<GovernedApprovalRow[]>(Prisma.sql`
        SELECT approval.id AS "approvalId", approval.status::text AS status
          FROM "ApprovalInstance" approval
         WHERE approval."tenantId" = ${input.tenantId}::uuid
           AND approval."companyId" = ${input.companyId}::uuid
           AND approval."documentType" = ${
             input.sourceType === "PURCHASE_REQUEST"
               ? "PurchaseRequest"
               : "PurchaseOrder"
           }
           AND approval."documentId" = ${input.sourceRecordId}::uuid
         ORDER BY approval.id
      `);
}

async function lockAndReadCanonicalEvidenceSource(
  tx: TransactionClient,
  input: {
    tenantId: string;
    companyId: string;
    sourceType: ApprovalReviewBoundEvidenceSourceType;
    sourceRecordId: string;
  },
) {
  if (input.sourceType === "PURCHASE_REQUEST") {
    return (await tx.$queryRaw<MutableSourceRow[]>(Prisma.sql`
      SELECT request.status::text AS status
        FROM "PurchaseRequest" request
       WHERE request.id = ${input.sourceRecordId}::uuid
         AND request."tenantId" = ${input.tenantId}::uuid
         AND request."companyId" = ${input.companyId}::uuid
       FOR UPDATE OF request
    `))[0];
  }
  if (input.sourceType === "PURCHASE_ORDER") {
    return (await tx.$queryRaw<MutableSourceRow[]>(Prisma.sql`
      SELECT purchase_order.status AS status
        FROM "PurchaseOrder" purchase_order
       WHERE purchase_order.id = ${input.sourceRecordId}::uuid
         AND purchase_order."tenantId" = ${input.tenantId}::uuid
         AND purchase_order."companyId" = ${input.companyId}::uuid
       FOR UPDATE OF purchase_order
    `))[0];
  }
  return (await tx.$queryRaw<MutableSourceRow[]>(Prisma.sql`
    SELECT quotation.status AS status
      FROM "SupplierQuotation" quotation
     WHERE quotation.id = ${input.sourceRecordId}::uuid
       AND quotation."tenantId" = ${input.tenantId}::uuid
       AND quotation."companyId" = ${input.companyId}::uuid
     FOR UPDATE OF quotation
  `))[0];
}

/**
 * Decision-side companion. Procurement recommendations lock every quotation
 * whose evidence contributes to the comparison; ordering prevents two reviews
 * over the same quotation request from acquiring those locks inconsistently.
 */
export async function acquireApprovalReviewDecisionAggregateFences(
  tx: TransactionClient,
  input: ApprovalReviewDecisionIdentity,
) {
  let sources: ApprovalReviewAggregateIdentity[];
  if (input.family === "QuotationRecommendation") {
    const quotationRequests = await tx.$queryRaw<QuotationRequestRow[]>(Prisma.sql`
      SELECT recommendation."quotationRequestId" AS "sourceRecordId"
        FROM "QuotationRecommendation" recommendation
       WHERE recommendation.id = ${input.documentId}::uuid
         AND recommendation."tenantId" = ${input.tenantId}::uuid
         AND recommendation."companyId" = ${input.companyId}::uuid
    `);
    const quotationRequest = quotationRequests[0];
    if (!quotationRequest) return;
    await acquireApprovalReviewAggregateFence(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      sourceType: "QUOTATION_REQUEST",
      sourceRecordId: quotationRequest.sourceRecordId,
    });
    const quotations = await tx.$queryRaw<SupplierQuotationRow[]>(Prisma.sql`
      SELECT quotation.id AS "sourceRecordId"
        FROM "SupplierQuotation" quotation
       WHERE quotation."quotationRequestId" = ${quotationRequest.sourceRecordId}::uuid
         AND quotation."tenantId" = ${input.tenantId}::uuid
         AND quotation."companyId" = ${input.companyId}::uuid
       ORDER BY quotation.id
    `);
    sources = quotations.map((quotation) => ({
      tenantId: input.tenantId,
      companyId: input.companyId,
      sourceType: "SUPPLIER_QUOTATION",
      sourceRecordId: quotation.sourceRecordId,
    }));
  } else {
    const sourceTypeByFamily = {
      PurchaseRequest: "PURCHASE_REQUEST",
      PurchaseOrder: "PURCHASE_ORDER",
      InventoryTransfer: "INVENTORY_TRANSFER",
      StockCountAttemptReview: "STOCK_COUNT_ATTEMPT",
      WastageReport: "WASTAGE_REPORT",
      StockAdjustment: "STOCK_ADJUSTMENT",
    } as const;
    sources = [{
      tenantId: input.tenantId,
      companyId: input.companyId,
      sourceType: sourceTypeByFamily[input.family],
      sourceRecordId: input.documentId,
    }];
  }
  for (const source of sources) {
    await acquireApprovalReviewAggregateFence(tx, source);
  }
}

async function readQuotationRequestGovernedApprovals(
  tx: TransactionClient,
  input: { tenantId: string; companyId: string; quotationRequestId: string },
) {
  return tx.$queryRaw<GovernedApprovalRow[]>(Prisma.sql`
    SELECT approval.id AS "approvalId", approval.status::text AS status
      FROM "QuotationRecommendation" recommendation
      JOIN "ApprovalInstance" approval
        ON approval."documentType" = 'QuotationRecommendation'
       AND approval."documentId" = recommendation.id
       AND approval."tenantId" = recommendation."tenantId"
       AND approval."companyId" = recommendation."companyId"
     WHERE recommendation."quotationRequestId" = ${input.quotationRequestId}::uuid
       AND recommendation."tenantId" = ${input.tenantId}::uuid
       AND recommendation."companyId" = ${input.companyId}::uuid
     ORDER BY approval.id
  `);
}

/**
 * Prevents a new quotation from appearing after a recommendation decision has
 * enumerated the comparison set. This is the parent lock in the mandatory
 * QuotationRequest -> SupplierQuotation lock order.
 */
export async function assertApprovalReviewQuotationRequestMutable(
  tx: TransactionClient,
  input: { tenantId: string; companyId: string; quotationRequestId: string },
) {
  const beforeLock = await readQuotationRequestGovernedApprovals(tx, input);
  await acquireApprovalReviewAggregateFence(tx, {
    tenantId: input.tenantId,
    companyId: input.companyId,
    sourceType: "QUOTATION_REQUEST",
    sourceRecordId: input.quotationRequestId,
  });
  const requests = await tx.$queryRaw<MutableSourceRow[]>(Prisma.sql`
    SELECT request.status AS status
      FROM "QuotationRequest" request
     WHERE request.id = ${input.quotationRequestId}::uuid
       AND request."tenantId" = ${input.tenantId}::uuid
       AND request."companyId" = ${input.companyId}::uuid
     FOR UPDATE OF request
  `);
  const afterLock = await readQuotationRequestGovernedApprovals(tx, input);
  const wasOrIsPending = [...beforeLock, ...afterLock].some(
    (approval) => approval.status === "PENDING",
  );
  if (
    !requests[0] ||
    wasOrIsPending ||
    JSON.stringify(beforeLock) !== JSON.stringify(afterLock)
  ) {
    throw new Error(approvalReviewSourceFrozenError);
  }
}

/**
 * No-ops for evidence families outside DEC-0270. For a bound family it locks
 * every canonical aggregate in deterministic order and fails before mutation
 * while any matching approval remains pending.
 */
export async function assertApprovalReviewEvidenceSourceMutable(
  tx: TransactionClient,
  input: {
    tenantId: string;
    companyId: string;
    sourceType: string;
    sourceRecordId: string;
  },
) {
  if (!isApprovalReviewBoundEvidenceSourceType(input.sourceType)) return;
  const source = { ...input, sourceType: input.sourceType };
  const beforeLock = await readGovernedApprovals(tx, source);
  await acquireApprovalReviewAggregateFence(tx, source);
  const currentSource = await lockAndReadCanonicalEvidenceSource(tx, source);
  const afterLock = await readGovernedApprovals(tx, source);
  const wasOrIsPending = [...beforeLock, ...afterLock].some(
    (approval) => approval.status === "PENDING",
  );
  if (
    !currentSource ||
    wasOrIsPending ||
    JSON.stringify(beforeLock) !== JSON.stringify(afterLock)
  ) {
    throw new Error(approvalReviewSourceFrozenError);
  }
}
