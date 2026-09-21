import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import type { SessionContext } from "./context";
import { canExposeStockCountProtectedFacts } from "./stockCountConfidentiality";

export const INVENTORY_QUANTITY_READ_PROTECTED = "INVENTORY_QUANTITY_READ_PROTECTED";
export const inventoryQuantityProtectedMessage =
  "Quantities and count-derived details are protected by blind-count confidentiality. Continue your assigned count in Stock Counts; an independent authorized reviewer can access eligible submitted counts.";

export function isInventoryQuantityReadProtected(error: unknown) {
  return error instanceof Error && error.message === INVENTORY_QUANTITY_READ_PROTECTED;
}

const countLineSelect = { countedQuantityBaseUom: true, countedByUserId: true, countedAt: true } as const;
const countInclude = { lines: { select: countLineSelect } } as const;
const activeCountStatuses = ["SCHEDULED", "DRAFT", "IN_PROGRESS", "SUBMITTED", "RECOUNT", "RECOUNT_REQUIRED"];

export async function assertInventoryQuantityReadAllowed(
  tx: TransactionClient,
  session: SessionContext,
  inventoryLocationIds: readonly string[],
) {
  const counts = await tx.stockCountSession.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocationId: { in: [...inventoryLocationIds] },
      blindCount: true,
      status: { in: activeCountStatuses },
    },
    include: { ...countInclude, currentAttempt: { include: countInclude } },
  });
  for (const count of counts) {
    // Both compatibility and current-attempt lineage must authorize exposure.
    if (!canExposeStockCountProtectedFacts(session, count) ||
        !count.currentAttempt || !canExposeStockCountProtectedFacts(session, count.currentAttempt)) {
      throw new Error(INVENTORY_QUANTITY_READ_PROTECTED);
    }
  }
}

type CountDerivedAdjustment = {
  adjustmentType: string;
  sourceDocumentType: string | null;
  sourceDocumentId: string | null;
  sourceStockCountSessionId: string | null;
  sourceStockCountAttemptId: string | null;
  inventoryLocationId: string;
};

export function isCountDerivedAdjustment(source: CountDerivedAdjustment) {
  return source.adjustmentType === "COUNT_VARIANCE" || Boolean(source.sourceStockCountSessionId) ||
    Boolean(source.sourceStockCountAttemptId) || /stock.?count/i.test(source.sourceDocumentType ?? "");
}

export async function canReadCountDerivedAdjustment(
  tx: TransactionClient,
  session: SessionContext,
  source: CountDerivedAdjustment,
) {
  if (!isCountDerivedAdjustment(source)) return true;
  const scope = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    inventoryLocationId: source.inventoryLocationId,
  };
  if (source.sourceStockCountAttemptId) {
    const attempt = await tx.stockCountAttempt.findFirst({
      where: { ...scope, id: source.sourceStockCountAttemptId }, include: countInclude,
    });
    return Boolean(attempt && canExposeStockCountProtectedFacts(session, attempt));
  }
  const id = source.sourceStockCountSessionId ??
    (source.sourceDocumentType === "StockCountSession" ? source.sourceDocumentId : null);
  if (!id) return false;
  const count = await tx.stockCountSession.findFirst({ where: { ...scope, id }, include: countInclude });
  return Boolean(count && canExposeStockCountProtectedFacts(session, count));
}

export async function assertCountDerivedAdjustmentsReadable(
  tx: TransactionClient,
  session: SessionContext,
  inventoryLocationIds: readonly string[],
  adjustmentId?: string,
) {
  const sources = await tx.stockAdjustment.findMany({
    where: {
      tenantId: session.context.tenantId, companyId: session.context.companyId,
      inventoryLocationId: { in: [...inventoryLocationIds] },
      ...(adjustmentId ? { id: adjustmentId } : {}),
      OR: [
        { adjustmentType: "COUNT_VARIANCE" }, { sourceStockCountSessionId: { not: null } },
        { sourceStockCountAttemptId: { not: null } },
        { sourceDocumentType: { contains: "StockCount", mode: "insensitive" } },
      ],
    },
  });
  for (const source of sources) {
    if (!await canReadCountDerivedAdjustment(tx, session, source)) {
      throw new Error(INVENTORY_QUANTITY_READ_PROTECTED);
    }
  }
}

/** All source writers take matching exclusive locks. Keep this fence through projection. */
export async function withInventoryQuantityRead<T>(
  session: SessionContext,
  read: (tx: TransactionClient) => Promise<T>,
  options: { adjustments?: boolean; adjustmentId?: string; inventoryLocationIds?: readonly string[] } = {},
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const requestedIds = options.inventoryLocationIds;
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT il.id FROM "InventoryLocation" il
      WHERE il."tenantId" = ${session.context.tenantId}::uuid
        AND il."companyId" = ${session.context.companyId}::uuid
        ${requestedIds
          ? Prisma.sql`AND il.id IN (${Prisma.join([...new Set(requestedIds)].sort().map(id => Prisma.sql`${id}::uuid`))})`
          : Prisma.sql`AND il."locationId" = ${session.context.locationId}::uuid`}
      ORDER BY il.id ASC FOR SHARE OF il
    `);
    const ids = rows.map(row => row.id);
    if (requestedIds && new Set(requestedIds).size !== ids.length) {
      throw new Error(INVENTORY_QUANTITY_READ_PROTECTED);
    }
    await assertInventoryQuantityReadAllowed(tx, session, ids);
    if (options.adjustments) await assertCountDerivedAdjustmentsReadable(tx, session, ids, options.adjustmentId);
    return await read(tx);
  }, { timeout: 30_000 });
}

/** Immutable audit storage is untouched; even free-text labels can disclose a variance. */
export async function redactProtectedInventoryAuditEvent<T extends {
  entityType: string; entityId: string; eventType: string;
  companyId?: string | null; beforeData?: unknown; afterData?: unknown; metadata?: unknown;
}>(session: SessionContext, event: T): Promise<T> {
  if (!/stock.?count|stockadjustment|inventorymovement|inventorybalance/i.test(event.entityType)) return event;
  const redact = (): T => ({
    ...event, eventType: "inventory.protected_activity", entityType: "ProtectedInventoryRecord", entityId: "",
    beforeData: null, afterData: null, metadata: { restricted: inventoryQuantityProtectedMessage },
  });
  // An audit scope is not operational quantity-review authority at other scopes.
  if (event.companyId !== session.context.companyId) return redact();
  try {
    return await withInventoryQuantityRead(session, async (tx) => {
      const where = {
        id: event.entityId, tenantId: session.context.tenantId, companyId: session.context.companyId,
        inventoryLocation: { locationId: session.context.locationId },
      };
      if (event.entityType === "StockAdjustment") {
        const source = await tx.stockAdjustment.findFirst({ where });
        return source && await canReadCountDerivedAdjustment(tx, session, source) ? event : redact();
      }
      if (event.entityType === "StockCountSession" || event.entityType === "StockCountAttempt") {
        const source = event.entityType === "StockCountSession"
          ? await tx.stockCountSession.findFirst({ where, include: countInclude })
          : await tx.stockCountAttempt.findFirst({ where, include: countInclude });
        return source && canExposeStockCountProtectedFacts(session, source) ? event : redact();
      }
      // Other inventory audit embeddings have no approved safe quantity projection.
      return redact();
    });
  } catch (error) {
    if (isInventoryQuantityReadProtected(error)) return redact();
    throw error;
  }
}
