import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { permissions, requireActiveScopeAssignment, requirePermission } from "./authorization";
import type { SessionContext } from "./context";
import { lockLiveInventoryActionAuthority } from "./inventoryActionAuthority";
import { withInventoryQuantityRead } from "./inventoryQuantityRead";

export const lowStockThresholdInput = z.object({
  inventoryLocationId: z.string().uuid(),
  itemCode: z.string().trim().min(1).max(80),
  thresholdQuantity: z.string().trim().regex(/^\d{1,12}(\.\d{1,6})?$/, "Enter a nonnegative quantity with at most six decimal places."),
  active: z.boolean(),
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export type LowStockRow = {
  id: string; itemCode: string; itemName: string; inventoryLocationName: string;
  baseUomCode: string; thresholdQuantity: string; recordedOnHand: string;
  balanceRows: number; lowStock: boolean; active: boolean; eligible: boolean;
  version: number; updatedAt: string;
};

export async function requireLowStockRead(session: SessionContext) {
  await requirePermission(session, permissions.inventoryBalanceView);
  await requireActiveScopeAssignment(session, {
    scopeType: "LOCATION", scopeId: session.context.locationId, allowCompanyManage: true,
  });
}

/** A single statement keeps the total and paginated rows on the same live snapshot. */
export async function queryLowStockPage(
  tx: TransactionClient,
  session: SessionContext,
  input: { page?: number; pageSize?: number; query?: string; alertsOnly?: boolean } = {},
) {
  const page = Math.max(1, Math.min(1_000_000, Math.floor(input.page || 1)));
  const pageSize = Math.max(1, Math.min(10_001, Math.floor(input.pageSize || 10)));
  const query = (input.query ?? "").trim().slice(0, 100);
  const result = await tx.$queryRaw<Array<{ totalItems: bigint; items: LowStockRow[] }>>(Prisma.sql`
    WITH facts AS (
      SELECT t.id, i."itemCode", i."itemName", il.name AS "inventoryLocationName",
        u."uomCode" AS "baseUomCode", t."thresholdQuantity", t.active, t.version, t."updatedAt",
        (i.status = 'ACTIVE' AND i."trackInventory" AND u.status = 'ACTIVE' AND il.status = 'ACTIVE' AND l.status = 'ACTIVE') AS eligible,
        COALESCE(SUM(b."qtyOnHand"), 0) AS "recordedOnHand", COUNT(b.id)::int AS "balanceRows"
      FROM "InventoryLowStockThreshold" t
      JOIN "Item" i ON i.id = t."itemId" AND i."tenantId" = t."tenantId" AND i."companyId" = t."companyId" AND i."baseUomId" = t."baseUomId"
      JOIN "Uom" u ON u.id = t."baseUomId" AND u."tenantId" = t."tenantId" AND u."companyId" = t."companyId"
      JOIN "InventoryLocation" il ON il.id = t."inventoryLocationId" AND il."tenantId" = t."tenantId" AND il."companyId" = t."companyId"
      JOIN "Location" l ON l.id = il."locationId" AND l."tenantId" = t."tenantId" AND l."companyId" = t."companyId"
      LEFT JOIN "InventoryBalance" b ON b."inventoryLocationId" = t."inventoryLocationId" AND b."itemId" = t."itemId" AND b."tenantId" = t."tenantId" AND b."companyId" = t."companyId" AND b."baseUomId" = t."baseUomId"
      WHERE t."tenantId" = ${session.context.tenantId}::uuid AND t."companyId" = ${session.context.companyId}::uuid
        AND il."locationId" = ${session.context.locationId}::uuid
        AND (${query} = '' OR POSITION(LOWER(${query}) IN LOWER(i."itemCode" || ' ' || i."itemName" || ' ' || il.name)) > 0)
      GROUP BY t.id, i.id, il.id, l.id, u.id
    ), classified AS (
      SELECT *, (active AND eligible AND "recordedOnHand" <= "thresholdQuantity") AS "lowStock" FROM facts
    ), population AS (
      SELECT * FROM classified WHERE ${input.alertsOnly ?? true} = false OR "lowStock"
    ), page_rows AS (
      SELECT * FROM population ORDER BY "itemCode", "inventoryLocationName", id
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    )
    SELECT (SELECT COUNT(*) FROM population) AS "totalItems", COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'itemCode', "itemCode", 'itemName', "itemName", 'inventoryLocationName', "inventoryLocationName",
        'baseUomCode', "baseUomCode", 'thresholdQuantity', "thresholdQuantity"::text, 'recordedOnHand', "recordedOnHand"::text,
        'balanceRows', "balanceRows", 'lowStock', "lowStock", 'active', active, 'eligible', eligible,
        'version', version, 'updatedAt', "updatedAt"
      ) ORDER BY "itemCode", "inventoryLocationName", id) FROM page_rows
    ), '[]'::jsonb) AS items
  `);
  return { items: result[0]?.items ?? [], totalItems: Number(result[0]?.totalItems ?? 0), page, pageSize };
}

export async function listLowStockPage(session: SessionContext, input: Parameters<typeof queryLowStockPage>[2] = {}) {
  await requireLowStockRead(session);
  return withInventoryQuantityRead(session, tx => queryLowStockPage(tx, session, { ...input, pageSize: Math.min(input.pageSize || 10, 100) }));
}

export async function exportLowStockRows(session: SessionContext, input: { query?: string; alertsOnly?: boolean; maxRows: number }) {
  await requireLowStockRead(session);
  const maxRows = Math.max(1, Math.min(10_000, Math.floor(input.maxRows)));
  return withInventoryQuantityRead(session, async tx => {
    const page = await queryLowStockPage(tx, session, { ...input, pageSize: maxRows + 1 });
    if (page.totalItems > maxRows) throw new Error("REPORT_EXPORT_ROW_LIMIT_EXCEEDED");
    return page.items;
  });
}

export async function getLowStockDashboardRead(session: SessionContext) {
  return listLowStockPage(session, { pageSize: 5, alertsOnly: true });
}

export async function canManageLowStockThresholds(session: SessionContext) {
  if (!session.permissionCodes.includes(permissions.itemMasterEdit)) return false;
  const now = new Date();
  return Boolean(await prisma.userScopeAssignment.findFirst({ where: {
    userId: session.user.id, status: "ACTIVE", accessLevel: "MANAGE", startsAt: { lte: now },
    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    OR: [{ scopeType: "LOCATION", scopeId: session.context.locationId }, { scopeType: "COMPANY", scopeId: session.context.companyId }],
  }, select: { id: true } }));
}

export async function getLowStockEditor(session: SessionContext, id?: string) {
  await requireLowStockRead(session);
  // Configuration itself has no actual-stock facts. Inventory quantities are never loaded here.
  const scope = { tenantId: session.context.tenantId, companyId: session.context.companyId };
  const inventoryLocations = await prisma.inventoryLocation.findMany({ where: {
    ...scope, locationId: session.context.locationId, status: "ACTIVE", location: { status: "ACTIVE" },
  }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const threshold = id ? await prisma.inventoryLowStockThreshold.findFirst({ where: {
    ...scope, id, inventoryLocation: { locationId: session.context.locationId },
  }, include: { item: { include: { baseUom: true } } } }) : null;
  if (id && !threshold) throw new Error("LOW_STOCK_THRESHOLD_NOT_FOUND");
  const history = threshold ? await prisma.auditEvent.findMany({ where: {
    ...scope, entityType: "InventoryLowStockThreshold", entityId: threshold.id,
  }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 10, select: {
    id: true, occurredAt: true, eventType: true, metadata: true, actor: { select: { displayName: true } },
  } }) : [];
  return { inventoryLocations, threshold, history, canManage: await canManageLowStockThresholds(session) };
}

export async function saveLowStockThreshold(session: SessionContext, raw: unknown) {
  const input = lowStockThresholdInput.parse(raw);
  await requirePermission(session, permissions.itemMasterEdit);
  await requireLowStockRead(session);
  try {
    return await prisma.$transaction(async tx => {
      await lockLiveInventoryActionAuthority(tx, session, {
        inventoryLocationId: input.inventoryLocationId, permissionCode: permissions.itemMasterEdit,
        staleErrorCode: "PERMISSION_DENIED",
      });
      const now = new Date();
      const manages = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT s.id FROM "UserScopeAssignment" s WHERE s."userId" = ${session.user.id}::uuid
          AND s.status = 'ACTIVE' AND s."accessLevel" = 'MANAGE' AND s."startsAt" <= ${now}
          AND (s."endsAt" IS NULL OR s."endsAt" > ${now})
          AND ((s."scopeType" = 'LOCATION' AND s."scopeId" = ${session.context.locationId}::uuid)
            OR (s."scopeType" = 'COMPANY' AND s."scopeId" = ${session.context.companyId}::uuid))
        ORDER BY s.id FOR SHARE OF s
      `);
      if (!manages.length) throw new Error("SCOPE_DENIED");
      const scope = { tenantId: session.context.tenantId, companyId: session.context.companyId };
      const location = await tx.inventoryLocation.findFirst({ where: {
        ...scope, id: input.inventoryLocationId, locationId: session.context.locationId, status: "ACTIVE",
      } });
      if (!location) throw new Error("SCOPE_DENIED");
      const items = await tx.$queryRaw<Array<{ id: string; baseUomId: string }>>(Prisma.sql`
        SELECT i.id, i."baseUomId" FROM "Item" i JOIN "Uom" u ON u.id = i."baseUomId"
        WHERE i."tenantId" = ${scope.tenantId}::uuid AND i."companyId" = ${scope.companyId}::uuid
          AND i."itemCode" = ${input.itemCode} AND i.status = 'ACTIVE' AND i."trackInventory"
          AND u."tenantId" = i."tenantId" AND u."companyId" = i."companyId" AND u.status = 'ACTIVE'
        FOR SHARE OF i, u
      `);
      const item = items[0];
      if (!item) throw new Error("LOW_STOCK_ITEM_INVALID");
      const where = { ...scope, inventoryLocationId: location.id, itemId: item.id };
      const before = await tx.inventoryLowStockThreshold.findFirst({ where });
      if ((before?.version ?? 0) !== input.expectedVersion) throw new Error("LOW_STOCK_THRESHOLD_STALE");
      const data = { thresholdQuantity: new Prisma.Decimal(input.thresholdQuantity), active: input.active };
      let id: string;
      if (before) {
        const updated = await tx.inventoryLowStockThreshold.updateMany({ where: { ...where, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
        if (updated.count !== 1) throw new Error("LOW_STOCK_THRESHOLD_STALE");
        id = before.id;
      } else {
        const created = await tx.inventoryLowStockThreshold.create({ data: { ...where, ...data, baseUomId: item.baseUomId } });
        id = created.id;
      }
      const afterData = { ...where, baseUomId: item.baseUomId, thresholdQuantity: data.thresholdQuantity.toString(), active: data.active, version: input.expectedVersion + 1 };
      await tx.auditEvent.create({ data: {
        ...scope, actorUserId: session.user.id, entityType: "InventoryLowStockThreshold", entityId: id,
        eventType: before ? "inventory.low_stock_threshold.updated" : "inventory.low_stock_threshold.created",
        ...(before ? { beforeData: { thresholdQuantity: before.thresholdQuantity.toString(), active: before.active, version: before.version } } : {}),
        afterData, metadata: { reason: input.reason, locationId: session.context.locationId, measure: "RECORDED_ON_HAND" },
      } });
      return { id, version: input.expectedVersion + 1 };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("LOW_STOCK_THRESHOLD_STALE");
    throw error;
  }
}
