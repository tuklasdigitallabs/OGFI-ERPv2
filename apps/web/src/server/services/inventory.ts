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
  return {
    query: normalizeInventorySearchQuery(filters.query),
    movementType: inventoryMovementTypes.includes(filters.movementType as never)
      ? filters.movementType
      : undefined
  };
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

export async function getInventoryBalanceReconciliation(session: SessionContext) {
  await requirePermission(session, permissions.inventoryLedgerView);

  const [balances, movements] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocation: {
          locationId: session.context.locationId,
          status: "ACTIVE"
        }
      },
      include: {
        inventoryLocation: {
          include: {
            location: true
          }
        },
        item: true,
        baseUom: true
      }
    }),
    prisma.inventoryMovement.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocation: {
          locationId: session.context.locationId,
          status: "ACTIVE"
        }
      },
      include: {
        inventoryLocation: {
          include: {
            location: true
          }
        },
        item: true,
        baseUom: true
      }
    })
  ]);

  const rowsByKey = new Map<string, InventoryBalanceReconciliationRow>();

  for (const balance of balances) {
    const key = `${balance.inventoryLocationId}|${balance.itemId}|${balance.lotKey}`;
    rowsByKey.set(key, {
      key,
      inventoryLocationName: balance.inventoryLocation.name,
      locationName: balance.inventoryLocation.location.name,
      itemCode: balance.item.itemCode,
      itemName: balance.item.itemName,
      lotNumber: balance.lotNumber ?? null,
      expiryDate: balance.expiryDate?.toISOString().slice(0, 10) ?? null,
      baseUomCode: balance.baseUom.uomCode,
      balanceQuantity: Number(balance.qtyOnHand),
      ledgerQuantity: 0,
      varianceQuantity: 0,
      status: "MATCHED"
    });
  }

  for (const movement of movements) {
    const lotKey = normalizeInventoryLotKey(
      movement.lotNumber,
      movement.expiryDate
    );
    const key = `${movement.inventoryLocationId}|${movement.itemId}|${lotKey}`;
    const existing = rowsByKey.get(key);
    if (existing) {
      existing.ledgerQuantity = Number(
        (existing.ledgerQuantity + Number(movement.quantityDeltaBaseUom)).toFixed(6)
      );
      continue;
    }
    rowsByKey.set(key, {
      key,
      inventoryLocationName: movement.inventoryLocation.name,
      locationName: movement.inventoryLocation.location.name,
      itemCode: movement.item.itemCode,
      itemName: movement.item.itemName,
      lotNumber: movement.lotNumber ?? null,
      expiryDate: movement.expiryDate?.toISOString().slice(0, 10) ?? null,
      baseUomCode: movement.baseUom.uomCode,
      balanceQuantity: 0,
      ledgerQuantity: Number(movement.quantityDeltaBaseUom),
      varianceQuantity: 0,
      status: "MATCHED"
    });
  }

  const rows = Array.from(rowsByKey.values())
    .map((row) => {
      const varianceQuantity = calculateInventoryBalanceVariance(
        row.balanceQuantity,
        row.ledgerQuantity
      );
      return {
        ...row,
        varianceQuantity,
        status: getInventoryBalanceReconciliationStatus(
          row.balanceQuantity,
          row.ledgerQuantity
        )
      } satisfies InventoryBalanceReconciliationRow;
    })
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "VARIANCE" ? -1 : 1;
      }
      return `${a.itemName}${a.inventoryLocationName}`.localeCompare(
        `${b.itemName}${b.inventoryLocationName}`
      );
    });

  return {
    totalRows: rows.length,
    matchedRows: rows.filter((row) => row.status === "MATCHED").length,
    varianceRows: rows.filter((row) => row.status === "VARIANCE").length,
    rows
  };
}

export async function listInventoryMovements(
  session: SessionContext,
  filters: InventoryMovementFilters = {}
) {
  await requirePermission(session, permissions.inventoryLedgerView);
  const normalizedFilters = normalizeInventoryMovementFilters(filters);

  const movements = await prisma.inventoryMovement.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocation: {
        locationId: session.context.locationId,
        status: "ACTIVE"
      },
      ...(normalizedFilters.movementType
        ? { movementType: normalizedFilters.movementType as InventoryMovementType }
        : {}),
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
