import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import { permissions, requirePermission } from "./authorization";
import type { SessionContext } from "./context";
import {
  getInventoryLotExpiryPolicy,
  inventoryItemLotExpiryRequirements
} from "./policySettings";

export type InventoryMovementType =
  | "RECEIPT_IN"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "WASTAGE_OUT"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "OPENING_BALANCE_IN"
  | "COUNT_VARIANCE_IN"
  | "COUNT_VARIANCE_OUT"
  | "REVERSAL";

export type InventoryMovementPostingInput = {
  inventoryLocationId: string;
  relatedInventoryLocationId?: string | null;
  itemId: string;
  movementType: InventoryMovementType;
  occurredAt: Date;
  enteredQuantity: number;
  enteredUomId: string;
  quantityDeltaBaseUom: number;
  sourceDocumentType: string;
  sourceDocumentId: string;
  sourceDocumentLineId?: string | null;
  sourceEventKey: string;
  lotNumber?: string | null;
  expiryDate?: Date | null;
  unitCost?: number | null;
  totalCost?: number | null;
  reasonCode?: string | null;
  notes?: string | null;
  reversalOfMovementId?: string | null;
};

const inventoryLocationPostingLockBrand = Symbol(
  "inventoryLocationPostingLock"
);

export type InventoryLocationPostingLock = {
  readonly [inventoryLocationPostingLockBrand]: true;
};

const inventoryLocationPostingLockState = new WeakMap<
  InventoryLocationPostingLock,
  {
    transaction: TransactionClient;
    tenantId: string;
    companyId: string;
    inventoryLocationIds: ReadonlySet<string>;
  }
>();

export type InventoryBalanceFilters = {
  query?: string | undefined;
};

export type InventoryMovementFilters = {
  query?: string | undefined;
  movementType?: string | undefined;
  inventoryLocationId?: string | undefined;
  itemId?: string | undefined;
  lotKey?: string | undefined;
};

export type InventoryBalanceReconciliationRow = {
  key: string;
  inventoryLocationName: string;
  locationName: string;
  itemCode: string;
  itemName: string;
  lotNumber: string | null;
  expiryDate: string | null;
  baseUomCode: string;
  balanceQuantity: number;
  ledgerQuantity: number;
  varianceQuantity: number;
  status: "MATCHED" | "VARIANCE";
  traceHref?: string;
};

export const inventoryDashboardProfiles = ["ledger-variance-v1"] as const;
export type InventoryDashboardProfile =
  (typeof inventoryDashboardProfiles)[number];

export type InventoryLedgerVarianceRow = InventoryBalanceReconciliationRow & {
  status: "VARIANCE";
};

export type InventoryLedgerVarianceProfileRow = InventoryLedgerVarianceRow & {
  traceHref: string;
};

export type InventoryLedgerVarianceProfilePage = {
  profile: InventoryDashboardProfile;
  items: InventoryLedgerVarianceProfileRow[];
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query: string | null;
  generatedAt: string;
};

export type InventoryLedgerVarianceDashboardRead = {
  varianceCount: number;
  candidates: InventoryLedgerVarianceProfileRow[];
  generatedAt: string;
};

const inventoryMovementTypes = [
  "RECEIPT_IN",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "WASTAGE_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "OPENING_BALANCE_IN",
  "COUNT_VARIANCE_IN",
  "COUNT_VARIANCE_OUT",
  "REVERSAL"
] as const;

export const maxInventorySearchLength = 120;
const inventoryLedgerVariancePageSize = 25;
const inventoryTraceUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveInventoryDashboardProfile(
  value: string | undefined
): InventoryDashboardProfile | null {
  return value === "ledger-variance-v1" ? value : null;
}

export function inventoryDashboardProfileHref(
  profile: InventoryDashboardProfile,
  input: { page?: number; query?: string } = {}
) {
  const params = new URLSearchParams({ dashboard: profile });
  const query = input.query?.trim();
  if (query) params.set("q", query);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/inventory/reconciliation?${params.toString()}`;
}

export function inventoryLedgerTraceHref(input: {
  inventoryLocationId: string;
  itemId: string;
  lotKey: string;
}) {
  const params = new URLSearchParams({
    inventoryLocationId: input.inventoryLocationId,
    itemId: input.itemId,
    lotKey: input.lotKey
  });
  return `/inventory/ledger?${params.toString()}`;
}

function normalizeInventorySearchQuery(query?: string) {
  const normalizedQuery = query?.trim() || undefined;
  if (normalizedQuery && normalizedQuery.length > maxInventorySearchLength) {
    throw new Error("INVENTORY_SEARCH_QUERY_TOO_LONG");
  }
  return normalizedQuery;
}

export function normalizeInventoryBalanceFilters(
  filters: InventoryBalanceFilters = {}
): InventoryBalanceFilters {
  return {
    query: normalizeInventorySearchQuery(filters.query)
  };
}

export function normalizeInventoryMovementFilters(
  filters: InventoryMovementFilters = {}
): InventoryMovementFilters {
  const traceValues = [
    filters.inventoryLocationId?.trim() || undefined,
    filters.itemId?.trim() || undefined,
    filters.lotKey?.trim() || undefined
  ] as const;
  const suppliedTraceValues = traceValues.filter(Boolean).length;
  if (suppliedTraceValues !== 0 && suppliedTraceValues !== traceValues.length) {
    throw new Error("INVENTORY_LEDGER_TRACE_FILTER_INCOMPLETE");
  }
  if (
    suppliedTraceValues === traceValues.length &&
    (!inventoryTraceUuidPattern.test(traceValues[0]!) ||
      !inventoryTraceUuidPattern.test(traceValues[1]!))
  ) {
    throw new Error("INVENTORY_LEDGER_TRACE_FILTER_INVALID");
  }
  if (suppliedTraceValues === traceValues.length) {
    parseInventoryLotKey(traceValues[2]!);
  }
  const normalized: InventoryMovementFilters = {
    query: normalizeInventorySearchQuery(filters.query),
    movementType: inventoryMovementTypes.includes(filters.movementType as never)
      ? filters.movementType
      : undefined
  };
  return suppliedTraceValues === traceValues.length
    ? {
        ...normalized,
        inventoryLocationId: traceValues[0],
        itemId: traceValues[1],
        lotKey: traceValues[2]
      }
    : normalized;
}

export function normalizeInventoryLotKey(
  lotNumber?: string | null,
  expiryDate?: Date | string | null
) {
  const normalizedLot = lotNumber?.trim() || "NOLOT";
  const normalizedExpiry = expiryDate
    ? new Date(expiryDate).toISOString().slice(0, 10)
    : "NOEXP";
  return `${normalizedLot}|${normalizedExpiry}`;
}

function parseInventoryLotKey(lotKey: string) {
  const separatorIndex = lotKey.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex === lotKey.length - 1) {
    throw new Error("INVENTORY_LEDGER_TRACE_FILTER_INVALID");
  }
  const lotPart = lotKey.slice(0, separatorIndex);
  const expiryPart = lotKey.slice(separatorIndex + 1);
  if (lotPart.length > 255) {
    throw new Error("INVENTORY_LEDGER_TRACE_FILTER_INVALID");
  }
  if (expiryPart !== "NOEXP") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryPart)) {
      throw new Error("INVENTORY_LEDGER_TRACE_FILTER_INVALID");
    }
    const expiryDate = new Date(`${expiryPart}T00:00:00.000Z`);
    if (
      Number.isNaN(expiryDate.getTime()) ||
      expiryDate.toISOString().slice(0, 10) !== expiryPart
    ) {
      throw new Error("INVENTORY_LEDGER_TRACE_FILTER_INVALID");
    }
  }
  return {
    lotNumber: lotPart === "NOLOT" ? null : lotPart,
    expiryDate:
      expiryPart === "NOEXP" ? null : new Date(`${expiryPart}T00:00:00.000Z`)
  };
}

export function assertInventoryMovementQuantities(
  enteredQuantity: number,
  quantityDeltaBaseUom: number
) {
  if (!Number.isFinite(enteredQuantity) || enteredQuantity <= 0) {
    throw new Error("INVENTORY_MOVEMENT_ENTERED_QUANTITY_INVALID");
  }
  if (!Number.isFinite(quantityDeltaBaseUom) || quantityDeltaBaseUom === 0) {
    throw new Error("INVENTORY_MOVEMENT_BASE_QUANTITY_INVALID");
  }
}

export function calculateBalanceQuantity(
  currentQtyOnHand: number,
  quantityDeltaBaseUom: number
) {
  const nextQty = currentQtyOnHand + quantityDeltaBaseUom;
  if (nextQty < 0) {
    throw new Error("INVENTORY_BALANCE_NEGATIVE_NOT_ALLOWED");
  }
  return nextQty;
}

export function calculateInventoryBalanceVariance(
  balanceQuantity: number,
  ledgerQuantity: number
) {
  return Number((balanceQuantity - ledgerQuantity).toFixed(6));
}

export function getInventoryBalanceReconciliationStatus(
  balanceQuantity: number,
  ledgerQuantity: number
) {
  return calculateInventoryBalanceVariance(balanceQuantity, ledgerQuantity) === 0
    ? "MATCHED"
    : "VARIANCE";
}

export function assertInventoryMovementsNotFrozen(input: {
  activeFrozenCountId?: string | null;
}) {
  if (input.activeFrozenCountId) {
    throw new Error("INVENTORY_MOVEMENT_FROZEN_BY_STOCK_COUNT");
  }
}

export async function lockInventoryLocationsForPosting(
  tx: TransactionClient,
  session: SessionContext,
  inventoryLocationIds: readonly string[]
): Promise<InventoryLocationPostingLock> {
  const sortedInventoryLocationIds = [...new Set(inventoryLocationIds)].sort();
  if (sortedInventoryLocationIds.length === 0) {
    throw new Error("INVENTORY_LOCATION_POSTING_LOCK_SET_EMPTY");
  }

  const lockedLocations = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT il.id
        FROM "InventoryLocation" il
       WHERE il.id IN (${Prisma.join(
         sortedInventoryLocationIds.map((id) => Prisma.sql`${id}::uuid`)
       )})
         AND il."tenantId" = ${session.context.tenantId}::uuid
         AND il."companyId" = ${session.context.companyId}::uuid
       ORDER BY il.id ASC
       FOR UPDATE OF il
    `
  );

  if (
    lockedLocations.length !== sortedInventoryLocationIds.length ||
    lockedLocations.some(
      (location, index) => location.id !== sortedInventoryLocationIds[index]
    )
  ) {
    throw new Error("INVENTORY_LOCATION_POSTING_LOCK_SCOPE_DENIED");
  }

  const lock = Object.freeze({
    [inventoryLocationPostingLockBrand]: true as const
  });
  inventoryLocationPostingLockState.set(lock, {
    transaction: tx,
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    inventoryLocationIds: new Set(sortedInventoryLocationIds)
  });
  return lock;
}

export async function lockInventoryLocationForPosting(
  tx: TransactionClient,
  session: SessionContext,
  inventoryLocationId: string
) {
  return await lockInventoryLocationsForPosting(tx, session, [inventoryLocationId]);
}

function assertInventoryLocationPostingLock(
  tx: TransactionClient,
  session: SessionContext,
  lock: InventoryLocationPostingLock,
  input: InventoryMovementPostingInput
) {
  const lockState = inventoryLocationPostingLockState.get(lock);
  const requiredInventoryLocationIds = [
    input.inventoryLocationId,
    ...(input.relatedInventoryLocationId
      ? [input.relatedInventoryLocationId]
      : [])
  ];
  if (
    lock[inventoryLocationPostingLockBrand] !== true ||
    !lockState ||
    lockState.transaction !== tx ||
    lockState.tenantId !== session.context.tenantId ||
    lockState.companyId !== session.context.companyId ||
    requiredInventoryLocationIds.some(
      (inventoryLocationId) =>
        !lockState.inventoryLocationIds.has(inventoryLocationId)
    )
  ) {
    throw new Error("INVENTORY_LOCATION_POSTING_LOCK_REQUIRED");
  }
}

export async function postInventoryMovement(
  session: SessionContext,
  input: InventoryMovementPostingInput
) {
  assertInventoryMovementQuantities(
    input.enteredQuantity,
    input.quantityDeltaBaseUom
  );

  const existingMovement = await prisma.inventoryMovement.findUnique({
    where: {
      tenantId_companyId_sourceDocumentType_sourceDocumentId_sourceEventKey: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceDocumentType: input.sourceDocumentType,
        sourceDocumentId: input.sourceDocumentId,
        sourceEventKey: input.sourceEventKey
      }
    }
  });

  if (existingMovement) {
    return { movement: existingMovement, duplicate: true };
  }

  return prisma.$transaction(async (tx) => {
    const lock = await lockInventoryLocationsForPosting(tx, session, [
      input.inventoryLocationId,
      ...(input.relatedInventoryLocationId
        ? [input.relatedInventoryLocationId]
        : [])
    ]);
    return postInventoryMovementInTransaction(tx, session, lock, input);
  });
}

export async function postInventoryMovementInTransaction(
  tx: TransactionClient,
  session: SessionContext,
  lock: InventoryLocationPostingLock,
  input: InventoryMovementPostingInput
) {
  assertInventoryLocationPostingLock(tx, session, lock, input);
  assertInventoryMovementQuantities(
    input.enteredQuantity,
    input.quantityDeltaBaseUom
  );

  const existingMovement = await tx.inventoryMovement.findUnique({
    where: {
      tenantId_companyId_sourceDocumentType_sourceDocumentId_sourceEventKey: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceDocumentType: input.sourceDocumentType,
        sourceDocumentId: input.sourceDocumentId,
        sourceEventKey: input.sourceEventKey
      }
    }
  });

  if (existingMovement) {
    return { movement: existingMovement, duplicate: true };
  }

  const [inventoryLocation, item] = await Promise.all([
    tx.inventoryLocation.findFirst({
      where: {
        id: input.inventoryLocationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    tx.item.findFirst({
      where: {
        id: input.itemId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      include: { category: true }
    })
  ]);

  if (!inventoryLocation) {
    throw new Error("INVENTORY_LOCATION_NOT_FOUND");
  }
  if (inventoryLocation.locationId !== session.context.locationId) {
    throw new Error("INVENTORY_LOCATION_SCOPE_DENIED");
  }
  if (!item) {
    throw new Error("INVENTORY_ITEM_NOT_FOUND");
  }
  if (!item.trackInventory) {
    throw new Error("ITEM_NOT_TRACKED_FOR_INVENTORY");
  }
  if (input.enteredUomId !== item.baseUomId) {
    const conversion = await tx.itemUomConversion.findFirst({
      where: {
        itemId: item.id,
        fromUomId: input.enteredUomId,
        toUomId: item.baseUomId
      }
    });
    if (!conversion) {
      throw new Error("INVENTORY_UOM_CONVERSION_REQUIRED");
    }
  }
  const lotExpiryPolicy = await getInventoryLotExpiryPolicy(session);
  const lotExpiryRequirements = inventoryItemLotExpiryRequirements(
    item,
    lotExpiryPolicy
  );
  if (lotExpiryRequirements.requiresLot && !input.lotNumber?.trim()) {
    throw new Error("INVENTORY_LOT_REQUIRED");
  }
  if (lotExpiryRequirements.requiresExpiry && !input.expiryDate) {
    throw new Error("INVENTORY_EXPIRY_REQUIRED");
  }
  const activeFrozenCount = await tx.stockCountSession.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocationId: inventoryLocation.id,
      freezeMovements: true,
      status: { in: ["IN_PROGRESS", "RECOUNT_REQUESTED", "SUBMITTED"] }
    },
    select: { id: true }
  });
  assertInventoryMovementsNotFrozen({
    activeFrozenCountId: activeFrozenCount?.id ?? null
  });

  const lotKey = normalizeInventoryLotKey(input.lotNumber, input.expiryDate);

  const movement = await tx.inventoryMovement.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocationId: input.inventoryLocationId,
      relatedInventoryLocationId: input.relatedInventoryLocationId ?? null,
      itemId: input.itemId,
      movementType: input.movementType,
      occurredAt: input.occurredAt,
      enteredQuantity: input.enteredQuantity,
      enteredUomId: input.enteredUomId,
      quantityDeltaBaseUom: input.quantityDeltaBaseUom,
      baseUomId: item.baseUomId,
      lotNumber: input.lotNumber ?? null,
      expiryDate: input.expiryDate ?? null,
      unitCost: input.unitCost ?? null,
      totalCost: input.totalCost ?? null,
      sourceDocumentType: input.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentLineId: input.sourceDocumentLineId ?? null,
      sourceEventKey: input.sourceEventKey,
      reasonCode: input.reasonCode ?? null,
      notes: input.notes ?? null,
      reversalOfMovementId: input.reversalOfMovementId ?? null,
      postedByUserId: session.user.id
    }
  });

  if (input.quantityDeltaBaseUom > 0) {
    await tx.inventoryBalance.upsert({
      where: {
        inventoryLocationId_itemId_lotKey: {
          inventoryLocationId: input.inventoryLocationId,
          itemId: input.itemId,
          lotKey
        }
      },
      create: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: input.inventoryLocationId,
        itemId: input.itemId,
        lotKey,
        lotNumber: input.lotNumber ?? null,
        expiryDate: input.expiryDate ?? null,
        baseUomId: item.baseUomId,
        qtyOnHand: input.quantityDeltaBaseUom,
        version: 1
      },
      update: {
        qtyOnHand: {
          increment: input.quantityDeltaBaseUom
        },
        version: {
          increment: 1
        }
      }
    });
  } else {
    const updatedBalance = await tx.inventoryBalance.updateMany({
      where: {
        inventoryLocationId: input.inventoryLocationId,
        itemId: input.itemId,
        lotKey,
        qtyOnHand: {
          gte: Math.abs(input.quantityDeltaBaseUom)
        }
      },
      data: {
        qtyOnHand: {
          increment: input.quantityDeltaBaseUom
        },
        version: {
          increment: 1
        }
      }
    });

    if (updatedBalance.count !== 1) {
      throw new Error("INVENTORY_BALANCE_NEGATIVE_NOT_ALLOWED");
    }
  }

  return { movement, duplicate: false };
}

type InventoryLedgerVarianceRawRow = {
  inventoryLocationId: string | null;
  itemId: string | null;
  lotKey: string | null;
  inventoryLocationName: string | null;
  locationName: string | null;
  itemCode: string | null;
  itemName: string | null;
  lotNumber: string | null;
  expiryDate: Date | string | null;
  baseUomCode: string | null;
  balanceQuantity: Prisma.Decimal | number | string | null;
  ledgerQuantity: Prisma.Decimal | number | string | null;
  varianceQuantity: Prisma.Decimal | number | string | null;
  totalRows: bigint | number;
  matchedRows: bigint | number;
  varianceRows: bigint | number;
  profileTotalCount: bigint | number;
  safePage: bigint | number;
  generatedAt: Date | string;
};

function inventoryLedgerVarianceSearchPattern(query: string | undefined) {
  if (!query) return null;
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * One source-owned PostgreSQL reconciliation statement. Both cache and ledger
 * sources are independently scope-qualified before their canonical keys are
 * unioned; callers may change only bounded search and pagination.
 */
export function buildInventoryLedgerVarianceQuery(
  session: SessionContext,
  input: {
    page?: number;
    pageSize?: number | null;
    query?: string;
    exactKey?: {
      inventoryLocationId: string;
      itemId: string;
      lotKey: string;
    };
    includeMatchedExact?: boolean;
  } = {}
) {
  if (input.includeMatchedExact && !input.exactKey) {
    throw new Error("INVENTORY_LEDGER_EXACT_KEY_REQUIRED");
  }
  const normalizedQuery = normalizeInventorySearchQuery(input.query);
  const searchPattern = inventoryLedgerVarianceSearchPattern(normalizedQuery);
  const requestedPage =
    input.page && Number.isFinite(input.page) && input.page > 0
      ? Math.floor(input.page)
      : 1;
  const pageSize =
    input.pageSize === null
      ? null
      : Math.min(Math.max(Math.floor(input.pageSize ?? inventoryLedgerVariancePageSize), 1), 25);
  const pagingSql = pageSize
    ? Prisma.sql`OFFSET ((pm."safePage" - 1) * ${pageSize}) LIMIT ${pageSize}`
    : Prisma.empty;
  const exactKeySql = input.exactKey
    ? Prisma.sql`
        AND r."inventoryLocationId" = ${input.exactKey.inventoryLocationId}::uuid
        AND r."itemId" = ${input.exactKey.itemId}::uuid
        AND r."lotKey" = ${input.exactKey.lotKey}
      `
    : Prisma.empty;

  return {
    normalizedQuery,
    query: Prisma.sql`
      WITH balance_rows AS MATERIALIZED (
        SELECT
          b."inventoryLocationId",
          b."itemId",
          COALESCE(NULLIF(BTRIM(b."lotNumber"), ''), 'NOLOT') || '|' ||
            COALESCE(TO_CHAR(b."expiryDate", 'YYYY-MM-DD'), 'NOEXP') AS "lotKey",
          MIN(NULLIF(BTRIM(b."lotNumber"), '')) AS "lotNumber",
          MIN(b."expiryDate"::date) AS "expiryDate",
          SUM(b."qtyOnHand")::numeric AS "balanceQuantity"
        FROM "InventoryBalance" b
        INNER JOIN "InventoryLocation" il
          ON il.id = b."inventoryLocationId"
         AND il."tenantId" = ${session.context.tenantId}::uuid
         AND il."companyId" = ${session.context.companyId}::uuid
         AND il."locationId" = ${session.context.locationId}::uuid
         AND il.status = CAST('ACTIVE' AS "RecordStatus")
        WHERE b."tenantId" = ${session.context.tenantId}::uuid
          AND b."companyId" = ${session.context.companyId}::uuid
        GROUP BY b."inventoryLocationId", b."itemId", "lotKey"
      ),
      ledger_rows AS MATERIALIZED (
        SELECT
          m."inventoryLocationId",
          m."itemId",
          COALESCE(NULLIF(BTRIM(m."lotNumber"), ''), 'NOLOT') || '|' ||
            COALESCE(TO_CHAR(m."expiryDate", 'YYYY-MM-DD'), 'NOEXP') AS "lotKey",
          MIN(NULLIF(BTRIM(m."lotNumber"), '')) AS "lotNumber",
          MIN(m."expiryDate"::date) AS "expiryDate",
          SUM(m."quantityDeltaBaseUom")::numeric AS "ledgerQuantity"
        FROM "InventoryMovement" m
        INNER JOIN "InventoryLocation" il
          ON il.id = m."inventoryLocationId"
         AND il."tenantId" = ${session.context.tenantId}::uuid
         AND il."companyId" = ${session.context.companyId}::uuid
         AND il."locationId" = ${session.context.locationId}::uuid
         AND il.status = CAST('ACTIVE' AS "RecordStatus")
        WHERE m."tenantId" = ${session.context.tenantId}::uuid
          AND m."companyId" = ${session.context.companyId}::uuid
        GROUP BY m."inventoryLocationId", m."itemId", "lotKey"
      ),
      all_keys AS MATERIALIZED (
        SELECT "inventoryLocationId", "itemId", "lotKey" FROM balance_rows
        UNION
        SELECT "inventoryLocationId", "itemId", "lotKey" FROM ledger_rows
      ),
      reconciled AS MATERIALIZED (
        SELECT
          k."inventoryLocationId",
          k."itemId",
          k."lotKey",
          il.name AS "inventoryLocationName",
          l.name AS "locationName",
          i."itemCode",
          i."itemName",
          COALESCE(b."lotNumber", lr."lotNumber") AS "lotNumber",
          COALESCE(b."expiryDate", lr."expiryDate") AS "expiryDate",
          u."uomCode" AS "baseUomCode",
          COALESCE(b."balanceQuantity", 0)::numeric AS "balanceQuantity",
          COALESCE(lr."ledgerQuantity", 0)::numeric AS "ledgerQuantity",
          ROUND(
            COALESCE(b."balanceQuantity", 0)::numeric -
            COALESCE(lr."ledgerQuantity", 0)::numeric,
            6
          ) AS "varianceQuantity"
        FROM all_keys k
        INNER JOIN "InventoryLocation" il
          ON il.id = k."inventoryLocationId"
         AND il."tenantId" = ${session.context.tenantId}::uuid
         AND il."companyId" = ${session.context.companyId}::uuid
         AND il."locationId" = ${session.context.locationId}::uuid
         AND il.status = CAST('ACTIVE' AS "RecordStatus")
        INNER JOIN "Location" l
          ON l.id = il."locationId"
         AND l."tenantId" = ${session.context.tenantId}::uuid
         AND l."companyId" = ${session.context.companyId}::uuid
        INNER JOIN "Item" i
          ON i.id = k."itemId"
         AND i."tenantId" = ${session.context.tenantId}::uuid
         AND i."companyId" = ${session.context.companyId}::uuid
        INNER JOIN "Uom" u
          ON u.id = i."baseUomId"
         AND u."tenantId" = ${session.context.tenantId}::uuid
         AND u."companyId" = ${session.context.companyId}::uuid
        LEFT JOIN balance_rows b
          ON b."inventoryLocationId" = k."inventoryLocationId"
         AND b."itemId" = k."itemId"
         AND b."lotKey" = k."lotKey"
        LEFT JOIN ledger_rows lr
          ON lr."inventoryLocationId" = k."inventoryLocationId"
         AND lr."itemId" = k."itemId"
         AND lr."lotKey" = k."lotKey"
      ),
      source_stats AS (
        SELECT
          COUNT(*)::bigint AS "totalRows",
          COUNT(*) FILTER (WHERE "varianceQuantity" = 0)::bigint AS "matchedRows",
          COUNT(*) FILTER (WHERE "varianceQuantity" <> 0)::bigint AS "varianceRows"
        FROM reconciled
      ),
      filtered_variances AS MATERIALIZED (
        SELECT *
        FROM reconciled r
        WHERE (r."varianceQuantity" <> 0 OR ${input.includeMatchedExact === true})
          ${exactKeySql}
          AND (
            ${searchPattern}::text IS NULL OR
            r."itemCode" ILIKE ${searchPattern} ESCAPE '\\' OR
            r."itemName" ILIKE ${searchPattern} ESCAPE '\\' OR
            r."inventoryLocationName" ILIKE ${searchPattern} ESCAPE '\\' OR
            COALESCE(r."lotNumber", 'NOLOT') ILIKE ${searchPattern} ESCAPE '\\'
          )
      ),
      profile_meta AS (
        SELECT COUNT(*)::bigint AS "profileTotalCount" FROM filtered_variances
      ),
      page_meta AS (
        SELECT
          LEAST(
            ${requestedPage}::bigint,
            GREATEST(
              1::bigint,
              CEIL(pm."profileTotalCount"::numeric / ${pageSize ?? 1})::bigint
            )
          ) AS "safePage"
        FROM profile_meta pm
      )
      SELECT
        page_rows.*,
        ss."totalRows",
        ss."matchedRows",
        ss."varianceRows",
        profile_meta."profileTotalCount",
        pm."safePage",
        statement_timestamp() AS "generatedAt"
      FROM source_stats ss
      CROSS JOIN profile_meta
      CROSS JOIN page_meta pm
      LEFT JOIN LATERAL (
        SELECT *
        FROM filtered_variances fv
        ORDER BY
          fv."itemName" ASC,
          fv."itemCode" ASC,
          fv."inventoryLocationName" ASC,
          fv."lotKey" ASC,
          fv."inventoryLocationId" ASC,
          fv."itemId" ASC
        ${pagingSql}
      ) page_rows ON TRUE
    `
  };
}

async function requireInventoryLedgerVarianceRead(session: SessionContext) {
  await requirePermission(session, permissions.inventoryBalanceView);
  await requirePermission(session, permissions.inventoryLedgerView);
}

function inventoryLedgerVarianceResult(rows: InventoryLedgerVarianceRawRow[]) {
  const meta = rows[0];
  const items = rows.flatMap((row): InventoryLedgerVarianceProfileRow[] => {
    if (!row.inventoryLocationId || !row.itemId || !row.lotKey) return [];
    const expiryDate = row.expiryDate
      ? new Date(row.expiryDate).toISOString().slice(0, 10)
      : null;
    return [{
      key: `${row.inventoryLocationId}|${row.itemId}|${row.lotKey}`,
      inventoryLocationName: row.inventoryLocationName ?? "Unknown inventory location",
      locationName: row.locationName ?? "Unknown location",
      itemCode: row.itemCode ?? "Unknown item",
      itemName: row.itemName ?? "Unknown item",
      lotNumber: row.lotNumber,
      expiryDate,
      baseUomCode: row.baseUomCode ?? "",
      balanceQuantity: Number(row.balanceQuantity ?? 0),
      ledgerQuantity: Number(row.ledgerQuantity ?? 0),
      varianceQuantity: Number(row.varianceQuantity ?? 0),
      status: "VARIANCE",
      traceHref: inventoryLedgerTraceHref({
        inventoryLocationId: row.inventoryLocationId,
        itemId: row.itemId,
        lotKey: row.lotKey
      })
    }];
  });
  return {
    items,
    totalRows: Number(meta?.totalRows ?? 0),
    matchedRows: Number(meta?.matchedRows ?? 0),
    varianceRows: Number(meta?.varianceRows ?? 0),
    profileTotalCount: Number(meta?.profileTotalCount ?? 0),
    safePage: Number(meta?.safePage ?? 1),
    generatedAt: meta
      ? new Date(meta.generatedAt).toISOString()
      : new Date().toISOString()
  };
}

async function queryInventoryLedgerVariance(
  session: SessionContext,
  input: {
    page?: number;
    pageSize?: number | null;
    query?: string;
    exactKey?: {
      inventoryLocationId: string;
      itemId: string;
      lotKey: string;
    };
    includeMatchedExact?: boolean;
  } = {}
) {
  const built = buildInventoryLedgerVarianceQuery(session, input);
  const rows = await prisma.$queryRaw<InventoryLedgerVarianceRawRow[]>(built.query);
  return {
    ...inventoryLedgerVarianceResult(rows),
    normalizedQuery: built.normalizedQuery
  };
}

export async function listInventoryLedgerVarianceProfilePage(
  session: SessionContext,
  input: { page?: number; query?: string } = {}
): Promise<InventoryLedgerVarianceProfilePage> {
  await requireInventoryLedgerVarianceRead(session);
  const result = await queryInventoryLedgerVariance(session, {
    pageSize: inventoryLedgerVariancePageSize,
    ...(input.page !== undefined ? { page: input.page } : {}),
    ...(input.query !== undefined ? { query: input.query } : {})
  });
  return {
    profile: "ledger-variance-v1",
    items: result.items,
    totalItems: result.profileTotalCount,
    page: result.safePage,
    pageSize: inventoryLedgerVariancePageSize,
    totalPages: Math.max(1, Math.ceil(result.profileTotalCount / inventoryLedgerVariancePageSize)),
    query: result.normalizedQuery ?? null,
    generatedAt: result.generatedAt
  };
}

export async function getInventoryLedgerVarianceDashboardRead(
  session: SessionContext
): Promise<InventoryLedgerVarianceDashboardRead> {
  await requireInventoryLedgerVarianceRead(session);
  const result = await queryInventoryLedgerVariance(session, {
    page: 1,
    pageSize: 3
  });
  return {
    varianceCount: result.profileTotalCount,
    candidates: result.items,
    generatedAt: result.generatedAt
  };
}

export async function listInventoryLedgerVarianceExportRows(
  session: SessionContext,
  input: { query?: string } = {}
) {
  await requireInventoryLedgerVarianceRead(session);
  const result = await queryInventoryLedgerVariance(session, {
    page: 1,
    pageSize: null,
    ...(input.query !== undefined ? { query: input.query } : {})
  });
  return {
    rows: result.items,
    totalItems: result.profileTotalCount,
    query: result.normalizedQuery ?? null,
    generatedAt: result.generatedAt
  };
}

export async function listInventoryBalances(
  session: SessionContext,
  filters: InventoryBalanceFilters = {}
) {
  await requirePermission(session, permissions.inventoryBalanceView);
  const normalizedFilters = normalizeInventoryBalanceFilters(filters);

  const balances = await prisma.inventoryBalance.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocation: {
        locationId: session.context.locationId,
        status: "ACTIVE"
      },
      ...(normalizedFilters.query
        ? {
            OR: [
              {
                item: {
                  itemCode: {
                    contains: normalizedFilters.query,
                    mode: "insensitive"
                  }
                }
              },
              {
                item: {
                  itemName: {
                    contains: normalizedFilters.query,
                    mode: "insensitive"
                  }
                }
              },
              {
                inventoryLocation: {
                  name: {
                    contains: normalizedFilters.query,
                    mode: "insensitive"
                  }
                }
              },
              {
                lotNumber: {
                  contains: normalizedFilters.query,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    },
    include: {
      inventoryLocation: {
        include: {
          location: true
        }
      },
      item: {
        include: {
          category: true
        }
      },
      baseUom: true
    },
    orderBy: [
      { item: { itemName: "asc" } },
      { inventoryLocation: { name: "asc" } },
      { expiryDate: "asc" }
    ]
  });

  return balances.map((balance) => ({
    id: balance.id,
    inventoryLocationName: balance.inventoryLocation.name,
    locationName: balance.inventoryLocation.location.name,
    itemCode: balance.item.itemCode,
    itemName: balance.item.itemName,
    categoryName: balance.item.category.categoryName,
    qtyOnHand: Number(balance.qtyOnHand),
    baseUomCode: balance.baseUom.uomCode,
    lotNumber: balance.lotNumber ?? null,
    expiryDate: balance.expiryDate?.toISOString().slice(0, 10) ?? null,
    version: balance.version,
    updatedAt: balance.updatedAt.toISOString()
  }));
}

export async function getInventoryBalanceReconciliation(
  session: SessionContext
): Promise<{
  totalRows: number;
  matchedRows: number;
  varianceRows: number;
  rows: InventoryBalanceReconciliationRow[];
  generatedAt?: string;
}> {
  await requireInventoryLedgerVarianceRead(session);
  const result = await queryInventoryLedgerVariance(session, {
    page: 1,
    pageSize: null
  });
  return {
    totalRows: result.totalRows,
    matchedRows: result.matchedRows,
    varianceRows: result.varianceRows,
    rows: result.items,
    generatedAt: result.generatedAt
  };
}

export function inventoryMovementListWhere(
  session: SessionContext,
  filters: InventoryMovementFilters = {}
): Prisma.InventoryMovementWhereInput {
  const normalizedFilters = normalizeInventoryMovementFilters(filters);
  const clauses: Prisma.InventoryMovementWhereInput[] = [
    {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocation: {
        locationId: session.context.locationId,
        status: "ACTIVE"
      }
    }
  ];
  if (normalizedFilters.movementType) {
    clauses.push({
      movementType: normalizedFilters.movementType as InventoryMovementType
    });
  }
  if (normalizedFilters.query) {
    clauses.push({
      OR: [
        {
          item: {
            itemCode: { contains: normalizedFilters.query, mode: "insensitive" }
          }
        },
        {
          item: {
            itemName: { contains: normalizedFilters.query, mode: "insensitive" }
          }
        },
        {
          sourceDocumentType: {
            contains: normalizedFilters.query,
            mode: "insensitive"
          }
        },
        {
          sourceEventKey: {
            contains: normalizedFilters.query,
            mode: "insensitive"
          }
        },
        {
          lotNumber: { contains: normalizedFilters.query, mode: "insensitive" }
        }
      ]
    });
  }
  if (
    normalizedFilters.inventoryLocationId &&
    normalizedFilters.itemId &&
    normalizedFilters.lotKey
  ) {
    const lot = parseInventoryLotKey(normalizedFilters.lotKey);
    const expiryWhere = lot.expiryDate
      ? {
          gte: lot.expiryDate,
          lt: new Date(lot.expiryDate.getTime() + 24 * 60 * 60 * 1000)
        }
      : null;
    clauses.push({
      inventoryLocationId: normalizedFilters.inventoryLocationId,
      itemId: normalizedFilters.itemId,
      lotNumber: lot.lotNumber,
      expiryDate: expiryWhere
    });
  }
  return { AND: clauses };
}

const inventoryLedgerVarianceTracePageSize = 50;

type InventoryLedgerVarianceTraceIdRow = {
  id: string | null;
  totalItems: bigint | number;
  safePage: bigint | number;
};

export function buildInventoryLedgerVarianceTraceQuery(
  session: SessionContext,
  input: {
    inventoryLocationId: string;
    itemId: string;
    lotKey: string;
    page?: number;
  }
) {
  const normalized = normalizeInventoryMovementFilters({
    inventoryLocationId: input.inventoryLocationId,
    itemId: input.itemId,
    lotKey: input.lotKey
  });
  const inventoryLocationId = normalized.inventoryLocationId!;
  const itemId = normalized.itemId!;
  const lotKey = normalized.lotKey!;
  const requestedPage =
    input.page && Number.isFinite(input.page) && input.page > 0
      ? Math.floor(input.page)
      : 1;
  return Prisma.sql`
    WITH trace_rows AS MATERIALIZED (
      SELECT
        m.id,
        m."occurredAt",
        COUNT(*) OVER()::bigint AS "totalItems"
      FROM "InventoryMovement" m
      INNER JOIN "InventoryLocation" il
        ON il.id = m."inventoryLocationId"
       AND il."tenantId" = ${session.context.tenantId}::uuid
       AND il."companyId" = ${session.context.companyId}::uuid
       AND il."locationId" = ${session.context.locationId}::uuid
       AND il.status = CAST('ACTIVE' AS "RecordStatus")
      WHERE m."tenantId" = ${session.context.tenantId}::uuid
        AND m."companyId" = ${session.context.companyId}::uuid
        AND m."inventoryLocationId" = ${inventoryLocationId}::uuid
        AND m."itemId" = ${itemId}::uuid
        AND COALESCE(NULLIF(BTRIM(m."lotNumber"), ''), 'NOLOT') || '|' ||
            COALESCE(TO_CHAR(m."expiryDate", 'YYYY-MM-DD'), 'NOEXP') = ${lotKey}
    ),
    trace_meta AS (
      SELECT COALESCE(MAX("totalItems"), 0)::bigint AS "totalItems"
      FROM trace_rows
    ),
    page_meta AS (
      SELECT LEAST(
        ${requestedPage}::bigint,
        GREATEST(
          1::bigint,
          CEIL(tm."totalItems"::numeric / ${inventoryLedgerVarianceTracePageSize})::bigint
        )
      ) AS "safePage"
      FROM trace_meta tm
    )
    SELECT
      page_rows.id,
      tm."totalItems",
      pm."safePage"
    FROM trace_meta tm
    CROSS JOIN page_meta pm
    LEFT JOIN LATERAL (
      SELECT tr.id
      FROM trace_rows tr
      ORDER BY tr."occurredAt" DESC, tr.id DESC
      OFFSET ((pm."safePage" - 1) * ${inventoryLedgerVarianceTracePageSize})
      LIMIT ${inventoryLedgerVarianceTracePageSize}
    ) page_rows ON TRUE
  `;
}

export async function getInventoryLedgerVarianceTracePage(
  session: SessionContext,
  input: {
    inventoryLocationId: string;
    itemId: string;
    lotKey: string;
    page?: number;
  }
) {
  await requireInventoryLedgerVarianceRead(session);
  const normalized = normalizeInventoryMovementFilters({
    inventoryLocationId: input.inventoryLocationId,
    itemId: input.itemId,
    lotKey: input.lotKey
  });
  const exactKey = {
    inventoryLocationId: normalized.inventoryLocationId!,
    itemId: normalized.itemId!,
    lotKey: normalized.lotKey!
  };
  const [traceRows, currentVariance] = await Promise.all([
    prisma.$queryRaw<InventoryLedgerVarianceTraceIdRow[]>(
      buildInventoryLedgerVarianceTraceQuery(session, input)
    ),
    queryInventoryLedgerVariance(session, {
      page: 1,
      pageSize: 1,
      exactKey,
      includeMatchedExact: true
    })
  ]);
  const ids = traceRows.flatMap((row) => (row.id ? [row.id] : []));
  const movements = ids.length
    ? await prisma.inventoryMovement.findMany({
        where: {
          AND: [
            {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              inventoryLocation: {
                locationId: session.context.locationId,
                status: "ACTIVE"
              }
            },
            {
              inventoryLocationId: exactKey.inventoryLocationId,
              itemId: exactKey.itemId,
              id: { in: ids }
            }
          ]
        },
        include: {
          inventoryLocation: { include: { location: true } },
          item: true,
          enteredUom: true,
          baseUom: true
        }
      })
    : [];
  const postedByUserIds = Array.from(
    new Set(movements.map((movement) => movement.postedByUserId))
  );
  const postedByUsers = postedByUserIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: postedByUserIds },
          tenantId: session.context.tenantId
        },
        select: { id: true, displayName: true }
      })
    : [];
  const postedByNames = new Map(
    postedByUsers.map((user) => [user.id, user.displayName])
  );
  const movementById = new Map(movements.map((movement) => [movement.id, movement]));
  const items = ids.flatMap((id) => {
    const movement = movementById.get(id);
    if (!movement) return [];
    const quantityDeltaBaseUom = Number(movement.quantityDeltaBaseUom);
    return [{
      id: movement.id,
      occurredAt: movement.occurredAt.toISOString(),
      movementType: movement.movementType,
      inventoryLocationName: movement.inventoryLocation.name,
      locationName: movement.inventoryLocation.location.name,
      itemCode: movement.item.itemCode,
      itemName: movement.item.itemName,
      enteredQuantity: Number(movement.enteredQuantity),
      enteredUomCode: movement.enteredUom.uomCode,
      quantityDeltaBaseUom,
      inQuantityBaseUom: quantityDeltaBaseUom > 0 ? quantityDeltaBaseUom : 0,
      outQuantityBaseUom:
        quantityDeltaBaseUom < 0 ? Math.abs(quantityDeltaBaseUom) : 0,
      baseUomCode: movement.baseUom.uomCode,
      lotNumber: movement.lotNumber ?? null,
      expiryDate: movement.expiryDate?.toISOString().slice(0, 10) ?? null,
      sourceDocumentType: movement.sourceDocumentType,
      sourceEventKey: movement.sourceEventKey,
      reasonCode: movement.reasonCode ?? null,
      postedByName: postedByNames.get(movement.postedByUserId) ?? "Unknown user"
    }];
  });
  const meta = traceRows[0];
  const current = currentVariance.items[0] ?? null;
  return {
    totalItems: Number(meta?.totalItems ?? 0),
    page: Number(meta?.safePage ?? 1),
    pageSize: inventoryLedgerVarianceTracePageSize,
    items,
    isCurrentVariance:
      current !== null && current.varianceQuantity !== 0,
    currentBalanceQuantity: current?.balanceQuantity ?? null,
    currentLedgerQuantity: current?.ledgerQuantity ?? null,
    currentVarianceQuantity: current?.varianceQuantity ?? null,
    currentVarianceGeneratedAt: currentVariance.generatedAt
  };
}

export async function listInventoryMovements(
  session: SessionContext,
  filters: InventoryMovementFilters = {}
) {
  await requirePermission(session, permissions.inventoryLedgerView);
  const normalizedFilters = normalizeInventoryMovementFilters(filters);
  if (
    normalizedFilters.inventoryLocationId ||
    normalizedFilters.itemId ||
    normalizedFilters.lotKey
  ) {
    throw new Error("INVENTORY_LEDGER_TRACE_REQUIRES_DEDICATED_SERVICE");
  }

  const movements = await prisma.inventoryMovement.findMany({
    where: inventoryMovementListWhere(session, normalizedFilters),
    include: {
      inventoryLocation: {
        include: {
          location: true
        }
      },
      item: true,
      enteredUom: true,
      baseUom: true
    },
    orderBy: { occurredAt: "desc" },
    take: 100
  });
  const postedByUserIds = Array.from(
    new Set(movements.map((movement) => movement.postedByUserId))
  );
  const postedByUsers =
    postedByUserIds.length > 0
      ? await prisma.user.findMany({
          where: {
            id: { in: postedByUserIds },
            tenantId: session.context.tenantId
          },
          select: {
            id: true,
            displayName: true
          }
        })
      : [];
  const postedByNames = new Map(
    postedByUsers.map((user) => [user.id, user.displayName])
  );

  return movements.map((movement) => ({
    id: movement.id,
    occurredAt: movement.occurredAt.toISOString(),
    movementType: movement.movementType,
    inventoryLocationName: movement.inventoryLocation.name,
    locationName: movement.inventoryLocation.location.name,
    itemCode: movement.item.itemCode,
    itemName: movement.item.itemName,
    enteredQuantity: Number(movement.enteredQuantity),
    enteredUomCode: movement.enteredUom.uomCode,
    quantityDeltaBaseUom: Number(movement.quantityDeltaBaseUom),
    inQuantityBaseUom:
      Number(movement.quantityDeltaBaseUom) > 0
        ? Number(movement.quantityDeltaBaseUom)
        : 0,
    outQuantityBaseUom:
      Number(movement.quantityDeltaBaseUom) < 0
        ? Math.abs(Number(movement.quantityDeltaBaseUom))
        : 0,
    baseUomCode: movement.baseUom.uomCode,
    lotNumber: movement.lotNumber ?? null,
    expiryDate: movement.expiryDate?.toISOString().slice(0, 10) ?? null,
    sourceDocumentType: movement.sourceDocumentType,
    sourceEventKey: movement.sourceEventKey,
    reasonCode: movement.reasonCode ?? null,
    postedByName: postedByNames.get(movement.postedByUserId) ?? "Unknown user"
  }));
}
