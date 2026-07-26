import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { assertCanManageCompanyScope } from "./coreAdmin";
import { requireSessionContext, type SessionContext } from "./context";

export const itemInventoryClasses = [
  "RAW_MATERIAL",
  "PACKAGING",
  "OPERATING_SUPPLY",
  "FINISHED_GOOD",
  "NON_STOCK"
] as const;

export const itemTypes = [
  "inventory",
  "non_inventory",
  "service",
  "packaging",
  "supply"
] as const;

export const uomTypes = ["count", "weight", "volume", "length"] as const;

const codeSchema = z
  .string()
  .min(1)
  .max(40)
  .transform((value) => value.trim().toUpperCase());

const reasonSchema = z.string().min(5).max(500);
const optionalUuidSchema = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined));
const checkboxSchema = z
  .union([z.literal("on"), z.literal("true"), z.literal("false")])
  .optional()
  .transform((value) => value === "on" || value === "true");

const createCategorySchema = z.object({
  categoryCode: codeSchema,
  categoryName: z.string().min(2).max(160).transform((value) => value.trim()),
  inventoryClass: z.enum(itemInventoryClasses),
  requiresExpiryTracking: checkboxSchema,
  requiresLotTracking: checkboxSchema,
  defaultWastageRequiresPhoto: checkboxSchema,
  reason: reasonSchema
});

const createUomSchema = z.object({
  uomCode: codeSchema,
  uomName: z.string().min(1).max(120).transform((value) => value.trim()),
  uomType: z.enum(uomTypes),
  decimalPrecision: z.coerce.number().int().min(0).max(6),
  reason: reasonSchema
});

const createItemSchema = z.object({
  itemCode: codeSchema,
  itemName: z.string().min(2).max(180).transform((value) => value.trim()),
  itemCategoryId: z.string().uuid(),
  itemType: z.enum(itemTypes),
  baseUomId: z.string().uuid(),
  purchaseUomId: optionalUuidSchema,
  issueUomId: optionalUuidSchema,
  trackInventory: checkboxSchema,
  trackExpiry: checkboxSchema,
  trackLot: checkboxSchema,
  requiresReceivingInspection: checkboxSchema,
  reason: reasonSchema
});

const createConversionSchema = z.object({
  itemId: z.string().uuid(),
  fromUomId: z.string().uuid(),
  toUomId: z.string().uuid(),
  conversionFactor: z.coerce.number().positive(),
  roundingRule: z.enum(["none", "up", "down", "nearest"]),
  reason: reasonSchema
});

const updateCategorySchema = createCategorySchema
  .omit({ categoryCode: true })
  .extend({
    categoryId: z.string().uuid()
  });

const updateUomSchema = createUomSchema.omit({ uomCode: true }).extend({
  uomId: z.string().uuid()
});

const updateItemSchema = createItemSchema
  .omit({ itemCode: true })
  .extend({
    itemId: z.string().uuid(),
    expectedUpdatedAt: z.coerce.date()
  });

const updateConversionSchema = z.object({
  conversionId: z.string().uuid(),
  conversionFactor: z.coerce.number().positive(),
  roundingRule: z.enum(["none", "up", "down", "nearest"]),
  reason: reasonSchema
});

const deactivateItemSchema = z.object({
  itemId: z.string().uuid(),
  reason: reasonSchema
});

const deactivateCategorySchema = z.object({
  categoryId: z.string().uuid(),
  reason: reasonSchema
});

const deactivateUomSchema = z.object({
  uomId: z.string().uuid(),
  reason: reasonSchema
});

export function assertNoDuplicateMasterCode(
  existingId: string | undefined,
  errorCode: string
) {
  if (existingId) {
    throw new Error(errorCode);
  }
}

export function assertDistinctConversionUoms(fromUomId: string, toUomId: string) {
  if (fromUomId === toUomId) {
    throw new Error("INVALID_UOM_CONVERSION");
  }
}

export function assertBaseUomChangeAllowed(
  currentBaseUomId: string,
  requestedBaseUomId: string,
  postedMovementCount: number
) {
  if (currentBaseUomId !== requestedBaseUomId && postedMovementCount > 0) {
    throw new Error("BASE_UOM_CHANGE_REQUIRES_MIGRATION");
  }
}

export function assertNoActiveMasterDataDependents(
  activeDependentCount: number,
  errorCode: string
) {
  if (activeDependentCount > 0) {
    throw new Error(errorCode);
  }
}

type LockedItemParentRow = {
  id: string;
  status: string;
};

type LockedItemRow = {
  id: string;
  status: string;
  updatedAt: Date;
  itemName: string;
  itemCategoryId: string;
  itemType: string;
  baseUomId: string;
  purchaseUomId: string | null;
  issueUomId: string | null;
  trackInventory: boolean;
  trackExpiry: boolean;
  trackLot: boolean;
  requiresReceivingInspection: boolean;
};

type ItemParentReferences = {
  itemCategoryId: string;
  baseUomId: string;
  purchaseUomId?: string | undefined;
  issueUomId?: string | undefined;
};

type MaterialItemFields = {
  itemCategoryId: string;
  baseUomId: string;
  purchaseUomId?: string | null | undefined;
  issueUomId?: string | null | undefined;
  itemType: string;
  trackInventory: boolean;
  trackExpiry: boolean;
  trackLot: boolean;
  requiresReceivingInspection: boolean;
};

export function assertItemCorrectionIsNonMaterial(
  current: MaterialItemFields,
  proposed: MaterialItemFields
) {
  if (
    current.itemCategoryId !== proposed.itemCategoryId ||
    current.itemType !== proposed.itemType ||
    current.baseUomId !== proposed.baseUomId ||
    (current.purchaseUomId ?? null) !== (proposed.purchaseUomId ?? null) ||
    (current.issueUomId ?? null) !== (proposed.issueUomId ?? null) ||
    current.trackInventory !== proposed.trackInventory ||
    current.trackExpiry !== proposed.trackExpiry ||
    current.trackLot !== proposed.trackLot ||
    current.requiresReceivingInspection !== proposed.requiresReceivingInspection
  ) {
    throw new Error("ITEM_MATERIAL_CHANGE_REQUIRES_REVIEW");
  }
}

async function lockActiveItemParents(
  tx: TransactionClient,
  session: SessionContext,
  references: ItemParentReferences
) {
  // Keep the lock order stable across item creation and editing. FOR UPDATE is
  // intentionally shared with parent deactivation so either the child write or
  // the lifecycle change wins, then the waiting transaction revalidates.
  const categories = await tx.$queryRaw<LockedItemParentRow[]>`
    SELECT id, status::text AS status
      FROM "ItemCategory"
     WHERE id = ${references.itemCategoryId}::uuid
       AND "tenantId" = ${session.context.tenantId}::uuid
       AND "companyId" = ${session.context.companyId}::uuid
     ORDER BY id
     FOR UPDATE
  `;
  const category = categories[0];
  if (!category || category.status !== "ACTIVE") {
    throw new Error("ITEM_CATEGORY_NOT_FOUND");
  }

  const uomIds = [
    references.baseUomId,
    references.purchaseUomId,
    references.issueUomId
  ]
    .filter((id): id is string => Boolean(id))
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .sort();
  const uoms = await tx.$queryRaw<LockedItemParentRow[]>(Prisma.sql`
    SELECT id, status::text AS status
      FROM "Uom"
     WHERE id IN (${Prisma.join(uomIds.map((id) => Prisma.sql`${id}::uuid`))})
       AND "tenantId" = ${session.context.tenantId}::uuid
       AND "companyId" = ${session.context.companyId}::uuid
     ORDER BY id
     FOR UPDATE
  `);
  const activeUomIds = new Set(
    uoms.filter((uom) => uom.status === "ACTIVE").map((uom) => uom.id)
  );
  if (!activeUomIds.has(references.baseUomId)) {
    throw new Error("BASE_UOM_NOT_FOUND");
  }
  if (references.purchaseUomId && !activeUomIds.has(references.purchaseUomId)) {
    throw new Error("PURCHASE_UOM_NOT_FOUND");
  }
  if (references.issueUomId && !activeUomIds.has(references.issueUomId)) {
    throw new Error("ISSUE_UOM_NOT_FOUND");
  }

  return {
    categoryId: category.id,
    baseUomId: references.baseUomId,
    purchaseUomId: references.purchaseUomId ?? null,
    issueUomId: references.issueUomId ?? null
  };
}

async function assertAdminCanManageMasterData(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
}

const itemMasterPageInputSchema = z.object({
  activeTab: z.enum(["items", "categories", "uoms", "conversions"]).default("items"),
  query: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  categoryQuery: z.string().trim().max(120).default(""),
  categoryStatus: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  categoryPage: z.number().int().min(1).max(10_000).default(1),
  uomQuery: z.string().trim().max(120).default(""),
  uomStatus: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  uomPage: z.number().int().min(1).max(10_000).default(1),
  conversionQuery: z.string().trim().max(120).default(""),
  conversionPage: z.number().int().min(1).max(10_000).default(1)
});

const itemMasterOptionCatalogInputSchema = z.object({
  kind: z.enum(["category", "uom", "item"]),
  query: z.string().trim().max(120).default(""),
  selectedIds: z.array(z.string().uuid()).max(20).default([]),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25)
});

const itemMasterRecordIdSchema = z.string().uuid();

export async function getItemMasterRecord(session: SessionContext, itemId: string) {
  await assertAdminCanManageMasterData(session);
  const id = itemMasterRecordIdSchema.parse(itemId);
  const item = await prisma.item.findFirst({
    where: {
      id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      category: { tenantId: session.context.tenantId, companyId: session.context.companyId },
      baseUom: { tenantId: session.context.tenantId, companyId: session.context.companyId },
      OR: [
        { purchaseUomId: null },
        { purchaseUom: { tenantId: session.context.tenantId, companyId: session.context.companyId } }
      ],
      AND: [
        {
          OR: [
            { issueUomId: null },
            { issueUom: { tenantId: session.context.tenantId, companyId: session.context.companyId } }
          ]
        }
      ]
    },
    include: { category: true, baseUom: true, purchaseUom: true, issueUom: true }
  });
  if (!item) return null;
  return {
    id: item.id,
    itemCode: item.itemCode,
    itemName: item.itemName,
    itemType: item.itemType,
    itemCategoryId: item.itemCategoryId,
    baseUomId: item.baseUomId,
    purchaseUomId: item.purchaseUomId,
    issueUomId: item.issueUomId,
    categoryName: item.category.categoryName,
    baseUomCode: item.baseUom.uomCode,
    purchaseUomCode: item.purchaseUom?.uomCode ?? null,
    issueUomCode: item.issueUom?.uomCode ?? null,
    trackInventory: item.trackInventory,
    trackExpiry: item.trackExpiry,
    trackLot: item.trackLot,
    requiresReceivingInspection: item.requiresReceivingInspection,
    status: item.status,
    updatedAt: item.updatedAt
  };
}

export async function getItemCategoryRecord(session: SessionContext, categoryId: string) {
  await assertAdminCanManageMasterData(session);
  const id = itemMasterRecordIdSchema.parse(categoryId);
  return prisma.itemCategory.findFirst({
    where: { id, tenantId: session.context.tenantId, companyId: session.context.companyId }
  });
}

export async function getUomRecord(session: SessionContext, uomId: string) {
  await assertAdminCanManageMasterData(session);
  const id = itemMasterRecordIdSchema.parse(uomId);
  return prisma.uom.findFirst({
    where: { id, tenantId: session.context.tenantId, companyId: session.context.companyId }
  });
}

export async function getItemUomConversionRecord(session: SessionContext, conversionId: string) {
  await assertAdminCanManageMasterData(session);
  const id = itemMasterRecordIdSchema.parse(conversionId);
  return prisma.itemUomConversion.findFirst({
    where: {
      id,
      item: { tenantId: session.context.tenantId, companyId: session.context.companyId },
      fromUom: { tenantId: session.context.tenantId, companyId: session.context.companyId },
      toUom: { tenantId: session.context.tenantId, companyId: session.context.companyId }
    },
    include: { item: true, fromUom: true, toUom: true }
  });
}

export async function listItemMasterOptionCatalog(
  session: SessionContext,
  input: z.input<typeof itemMasterOptionCatalogInputSchema>
) {
  await assertAdminCanManageMasterData(session);
  const values = itemMasterOptionCatalogInputSchema.parse(input);
  const query = values.query ? { contains: values.query, mode: "insensitive" as const } : undefined;
  const scope = { tenantId: session.context.tenantId, companyId: session.context.companyId };

  if (values.kind === "category") {
    const where = {
      ...scope,
      status: "ACTIVE" as const,
      ...(query ? { OR: [{ categoryCode: query }, { categoryName: query }] } : {})
    };
    const total = await prisma.itemCategory.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / values.pageSize));
    const effectivePage = Math.min(values.page, totalPages);
    const rows = await prisma.itemCategory.findMany({ where, orderBy: [{ categoryName: "asc" }, { id: "asc" }], skip: (effectivePage - 1) * values.pageSize, take: values.pageSize });
    const selected = values.selectedIds.length
      ? await prisma.itemCategory.findMany({ where: { ...scope, id: { in: values.selectedIds } }, orderBy: { categoryName: "asc" } })
      : [];
    const options = [...selected, ...rows.filter((row) => !selected.some((item) => item.id === row.id))].map((row) => ({ id: row.id, code: row.categoryCode, label: row.categoryName, status: row.status }));
    return { kind: values.kind, options, page: effectivePage, pageSize: values.pageSize, total, hasMore: effectivePage < totalPages };
  }

  if (values.kind === "uom") {
    const where = {
      ...scope,
      status: "ACTIVE" as const,
      ...(query ? { OR: [{ uomCode: query }, { uomName: query }] } : {})
    };
    const total = await prisma.uom.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / values.pageSize));
    const effectivePage = Math.min(values.page, totalPages);
    const rows = await prisma.uom.findMany({ where, orderBy: [{ uomCode: "asc" }, { id: "asc" }], skip: (effectivePage - 1) * values.pageSize, take: values.pageSize });
    const selected = values.selectedIds.length
      ? await prisma.uom.findMany({ where: { ...scope, id: { in: values.selectedIds } }, orderBy: { uomCode: "asc" } })
      : [];
    const options = [...selected, ...rows.filter((row) => !selected.some((item) => item.id === row.id))].map((row) => ({ id: row.id, code: row.uomCode, label: row.uomName, status: row.status }));
    return { kind: values.kind, options, page: effectivePage, pageSize: values.pageSize, total, hasMore: effectivePage < totalPages };
  }

  const where = {
    ...scope,
    status: "ACTIVE" as const,
    ...(query ? { OR: [{ itemCode: query }, { itemName: query }] } : {})
  };
  const total = await prisma.item.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / values.pageSize));
  const effectivePage = Math.min(values.page, totalPages);
  const rows = await prisma.item.findMany({ where, orderBy: [{ itemName: "asc" }, { id: "asc" }], skip: (effectivePage - 1) * values.pageSize, take: values.pageSize });
  const selected = values.selectedIds.length
    ? await prisma.item.findMany({ where: { ...scope, id: { in: values.selectedIds } }, orderBy: { itemName: "asc" } })
    : [];
  const options = [...selected, ...rows.filter((row) => !selected.some((item) => item.id === row.id))].map((row) => ({ id: row.id, code: row.itemCode, label: row.itemName, status: row.status }));
  return { kind: values.kind, options, page: effectivePage, pageSize: values.pageSize, total, hasMore: effectivePage < totalPages };
}

export async function listItemMasterData(
  session: SessionContext,
  input: z.input<typeof itemMasterPageInputSchema> = {},
) {
  await assertAdminCanManageMasterData(session);
  const values = itemMasterPageInputSchema.parse(input);
  const loadItems = values.activeTab === "items";
  const loadCategories = values.activeTab === "categories";
  const loadUoms = values.activeTab === "uoms";
  const loadConversions = values.activeTab === "conversions";
  const query = values.query ? { contains: values.query, mode: "insensitive" as const } : undefined;
  const itemWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.status ? { status: values.status } : {}),
    ...(query ? { OR: [{ itemCode: query }, { itemName: query }, { category: { categoryName: query } }] } : {}),
  };

  const itemTotal = loadItems ? await prisma.item.count({ where: itemWhere }) : 0;
  const totalPages = Math.max(1, Math.ceil(itemTotal / values.pageSize));
  const effectivePage = Math.min(values.page, totalPages);
  const categoryQuery = values.categoryQuery ? { contains: values.categoryQuery, mode: "insensitive" as const } : undefined;
  const categoryWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.categoryStatus ? { status: values.categoryStatus } : {}),
    ...(categoryQuery ? { OR: [{ categoryCode: categoryQuery }, { categoryName: categoryQuery }] } : {})
  };
  const uomQuery = values.uomQuery ? { contains: values.uomQuery, mode: "insensitive" as const } : undefined;
  const uomWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.uomStatus ? { status: values.uomStatus } : {}),
    ...(uomQuery ? { OR: [{ uomCode: uomQuery }, { uomName: uomQuery }] } : {})
  };
  const conversionQuery = values.conversionQuery ? { contains: values.conversionQuery, mode: "insensitive" as const } : undefined;
  const conversionWhere = {
    item: { tenantId: session.context.tenantId, companyId: session.context.companyId },
    fromUom: { tenantId: session.context.tenantId, companyId: session.context.companyId },
    toUom: { tenantId: session.context.tenantId, companyId: session.context.companyId },
    ...(conversionQuery ? { OR: [
      { item: { itemCode: conversionQuery } },
      { item: { itemName: conversionQuery } },
      { fromUom: { uomCode: conversionQuery } },
      { toUom: { uomCode: conversionQuery } }
    ] } : {})
  };
  const [categoryTotal, uomTotal, conversionTotal] = await Promise.all([
    loadCategories ? prisma.itemCategory.count({ where: categoryWhere }) : Promise.resolve(0),
    loadUoms ? prisma.uom.count({ where: uomWhere }) : Promise.resolve(0),
    loadConversions ? prisma.itemUomConversion.count({ where: conversionWhere }) : Promise.resolve(0)
  ]);
  const categoryPages = Math.max(1, Math.ceil(categoryTotal / values.pageSize));
  const uomPages = Math.max(1, Math.ceil(uomTotal / values.pageSize));
  const conversionPages = Math.max(1, Math.ceil(conversionTotal / values.pageSize));
  const effectiveCategoryPage = Math.min(values.categoryPage, categoryPages);
  const effectiveUomPage = Math.min(values.uomPage, uomPages);
  const effectiveConversionPage = Math.min(values.conversionPage, conversionPages);
  const [categories, uoms, items, activeItemCount, activeCategoryCount, activeUomCount, conversions] = await Promise.all([
    loadCategories ? prisma.itemCategory.findMany({
      where: categoryWhere,
      orderBy: [{ status: "asc" }, { categoryName: "asc" }, { id: "asc" }],
      skip: (effectiveCategoryPage - 1) * values.pageSize,
      take: values.pageSize
    }) : Promise.resolve([]),
    loadUoms ? prisma.uom.findMany({
      where: uomWhere,
      orderBy: [{ status: "asc" }, { uomCode: "asc" }, { id: "asc" }],
      skip: (effectiveUomPage - 1) * values.pageSize,
      take: values.pageSize
    }) : Promise.resolve([]),
    loadItems ? prisma.item.findMany({
      where: itemWhere,
      include: {
        category: true,
        baseUom: true,
        purchaseUom: true,
        issueUom: true
      },
      orderBy: [{ status: "asc" }, { itemName: "asc" }, { id: "asc" }],
      skip: (effectivePage - 1) * values.pageSize,
      take: values.pageSize,
    }) : Promise.resolve([]),
    loadItems ? prisma.item.count({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "ACTIVE" } }) : Promise.resolve(0),
    loadCategories ? prisma.itemCategory.count({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "ACTIVE" } }) : Promise.resolve(0),
    loadUoms ? prisma.uom.count({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "ACTIVE" } }) : Promise.resolve(0),
    loadConversions ? prisma.itemUomConversion.findMany({
      where: conversionWhere,
      include: {
        item: true,
        fromUom: true,
        toUom: true
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (effectiveConversionPage - 1) * values.pageSize,
      take: values.pageSize
    }) : Promise.resolve([])
  ]);

  return {
    categories: categories.map((category) => ({
      id: category.id,
      categoryCode: category.categoryCode,
      categoryName: category.categoryName,
      inventoryClass: category.inventoryClass,
      requiresExpiryTracking: category.requiresExpiryTracking,
      requiresLotTracking: category.requiresLotTracking,
      defaultWastageRequiresPhoto: category.defaultWastageRequiresPhoto,
      status: category.status
    })),
    uoms: uoms.map((uom) => ({
      id: uom.id,
      uomCode: uom.uomCode,
      uomName: uom.uomName,
      uomType: uom.uomType,
      decimalPrecision: uom.decimalPrecision,
      status: uom.status
    })),
    items: items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      itemType: item.itemType,
      itemCategoryId: item.itemCategoryId,
      baseUomId: item.baseUomId,
      purchaseUomId: item.purchaseUomId,
      issueUomId: item.issueUomId,
      categoryName: item.category.categoryName,
      baseUomCode: item.baseUom.uomCode,
      purchaseUomCode: item.purchaseUom?.uomCode ?? null,
      issueUomCode: item.issueUom?.uomCode ?? null,
      trackInventory: item.trackInventory,
      trackExpiry: item.trackExpiry,
      trackLot: item.trackLot,
      requiresReceivingInspection: item.requiresReceivingInspection,
      status: item.status
    })),
    conversions: conversions.map((conversion) => ({
      id: conversion.id,
      itemId: conversion.itemId,
      itemName: conversion.item.itemName,
      fromUomId: conversion.fromUomId,
      fromUomCode: conversion.fromUom.uomCode,
      toUomId: conversion.toUomId,
      toUomCode: conversion.toUom.uomCode,
      conversionFactor: Number(conversion.conversionFactor),
      roundingRule: conversion.roundingRule
    })),
    itemsPage: {
      page: effectivePage,
      pageSize: values.pageSize,
      totalItems: itemTotal,
      activeItems: activeItemCount,
    },
    categoriesPage: {
      page: effectiveCategoryPage,
      pageSize: values.pageSize,
      totalItems: categoryTotal,
      activeItems: activeCategoryCount
    },
    uomsPage: {
      page: effectiveUomPage,
      pageSize: values.pageSize,
      totalItems: uomTotal,
      activeItems: activeUomCount
    },
    conversionsPage: {
      page: effectiveConversionPage,
      pageSize: values.pageSize,
      totalItems: conversionTotal
    }
  };
}

export async function createItemCategory(formData: FormData) {
  const session = await requireSessionContext();
  const values = createCategorySchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  const existing = await prisma.itemCategory.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      categoryCode: values.categoryCode
    },
    select: { id: true }
  });
  assertNoDuplicateMasterCode(existing?.id, "DUPLICATE_ITEM_CATEGORY_CODE");

  return prisma.$transaction(async (tx) => {
    const category = await tx.itemCategory.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        categoryCode: values.categoryCode,
        categoryName: values.categoryName,
        inventoryClass: values.inventoryClass,
        requiresExpiryTracking: values.requiresExpiryTracking,
        requiresLotTracking: values.requiresLotTracking,
        defaultWastageRequiresPhoto: values.defaultWastageRequiresPhoto
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "item_category.created",
        entityType: "ItemCategory",
        entityId: category.id,
        afterData: {
          categoryCode: category.categoryCode,
          categoryName: category.categoryName,
          status: category.status
        },
        metadata: { reason: values.reason }
      }
    });

    return category;
  });
}

export async function createUom(formData: FormData) {
  const session = await requireSessionContext();
  const values = createUomSchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  const existing = await prisma.uom.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      uomCode: values.uomCode
    },
    select: { id: true }
  });
  assertNoDuplicateMasterCode(existing?.id, "DUPLICATE_UOM_CODE");

  return prisma.$transaction(async (tx) => {
    const uom = await tx.uom.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        uomCode: values.uomCode,
        uomName: values.uomName,
        uomType: values.uomType,
        decimalPrecision: values.decimalPrecision
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "uom.created",
        entityType: "Uom",
        entityId: uom.id,
        afterData: {
          uomCode: uom.uomCode,
          uomName: uom.uomName,
          status: uom.status
        },
        metadata: { reason: values.reason }
      }
    });

    return uom;
  });
}

export async function createItem(formData: FormData) {
  const session = await requireSessionContext();
  const values = createItemSchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  const existing = await prisma.item.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      itemCode: values.itemCode
    },
    select: { id: true }
  });
  assertNoDuplicateMasterCode(existing?.id, "DUPLICATE_ITEM_CODE");

  return prisma.$transaction(async (tx) => {
    const parents = await lockActiveItemParents(tx, session, values);
    const item = await tx.item.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        itemCode: values.itemCode,
        itemName: values.itemName,
        itemCategoryId: parents.categoryId,
        itemType: values.itemType,
        baseUomId: parents.baseUomId,
        purchaseUomId: parents.purchaseUomId,
        issueUomId: parents.issueUomId,
        trackInventory: values.trackInventory,
        trackExpiry: values.trackExpiry,
        trackLot: values.trackLot,
        requiresReceivingInspection: values.requiresReceivingInspection
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "item.created",
        entityType: "Item",
        entityId: item.id,
        afterData: {
          itemCode: item.itemCode,
          itemName: item.itemName,
          status: item.status
        },
        metadata: { reason: values.reason }
      }
    });

    return item;
  });
}

export async function createItemUomConversion(formData: FormData) {
  const session = await requireSessionContext();
  const values = createConversionSchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);
  assertDistinctConversionUoms(values.fromUomId, values.toUomId);

  const [item, fromUom, toUom, existing] = await Promise.all([
    prisma.item.findFirst({
      where: {
        id: values.itemId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.uom.findFirst({
      where: {
        id: values.fromUomId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.uom.findFirst({
      where: {
        id: values.toUomId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.itemUomConversion.findFirst({
      where: {
        itemId: values.itemId,
        fromUomId: values.fromUomId,
        toUomId: values.toUomId,
        item: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        },
        fromUom: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        },
        toUom: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        }
      },
      select: { id: true }
    })
  ]);

  if (!item) {
    throw new Error("ITEM_NOT_FOUND");
  }
  if (!fromUom || !toUom) {
    throw new Error("UOM_NOT_FOUND");
  }
  assertNoDuplicateMasterCode(existing?.id, "DUPLICATE_UOM_CONVERSION");

  return prisma.$transaction(async (tx) => {
    const conversion = await tx.itemUomConversion.create({
      data: {
        itemId: item.id,
        fromUomId: fromUom.id,
        toUomId: toUom.id,
        conversionFactor: values.conversionFactor,
        roundingRule: values.roundingRule
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "item_uom_conversion.created",
        entityType: "ItemUomConversion",
        entityId: conversion.id,
        afterData: {
          itemId: item.id,
          fromUomCode: fromUom.uomCode,
          toUomCode: toUom.uomCode,
          conversionFactor: values.conversionFactor,
          roundingRule: values.roundingRule
        },
        metadata: { reason: values.reason }
      }
    });

    return conversion;
  });
}

export async function updateItemCategory(formData: FormData) {
  const session = await requireSessionContext();
  const values = updateCategorySchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  const category = await prisma.itemCategory.findFirst({
    where: {
      id: values.categoryId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    }
  });

  if (!category) {
    throw new Error("ITEM_CATEGORY_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.itemCategory.update({
      where: { id: category.id },
      data: {
        categoryName: values.categoryName,
        inventoryClass: values.inventoryClass,
        requiresExpiryTracking: values.requiresExpiryTracking,
        requiresLotTracking: values.requiresLotTracking,
        defaultWastageRequiresPhoto: values.defaultWastageRequiresPhoto
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "item_category.updated",
        entityType: "ItemCategory",
        entityId: category.id,
        beforeData: {
          categoryName: category.categoryName,
          inventoryClass: category.inventoryClass,
          requiresExpiryTracking: category.requiresExpiryTracking,
          requiresLotTracking: category.requiresLotTracking,
          defaultWastageRequiresPhoto: category.defaultWastageRequiresPhoto
        },
        afterData: {
          categoryName: updated.categoryName,
          inventoryClass: updated.inventoryClass,
          requiresExpiryTracking: updated.requiresExpiryTracking,
          requiresLotTracking: updated.requiresLotTracking,
          defaultWastageRequiresPhoto: updated.defaultWastageRequiresPhoto
        },
        metadata: { reason: values.reason }
      }
    });

    return updated;
  });
}

export async function updateUom(formData: FormData) {
  const session = await requireSessionContext();
  const values = updateUomSchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  const uom = await prisma.uom.findFirst({
    where: {
      id: values.uomId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    }
  });

  if (!uom) {
    throw new Error("UOM_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.uom.update({
      where: { id: uom.id },
      data: {
        uomName: values.uomName,
        uomType: values.uomType,
        decimalPrecision: values.decimalPrecision
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "uom.updated",
        entityType: "Uom",
        entityId: uom.id,
        beforeData: {
          uomName: uom.uomName,
          uomType: uom.uomType,
          decimalPrecision: uom.decimalPrecision
        },
        afterData: {
          uomName: updated.uomName,
          uomType: updated.uomType,
          decimalPrecision: updated.decimalPrecision
        },
        metadata: { reason: values.reason }
      }
    });

    return updated;
  });
}

export async function updateItem(formData: FormData) {
  const session = await requireSessionContext();
  const values = updateItemSchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  return prisma.$transaction(async (tx) => {
    const items = await tx.$queryRaw<LockedItemRow[]>`
      SELECT id,
             status::text AS status,
             "updatedAt",
             "itemName",
             "itemCategoryId",
             "itemType",
             "baseUomId",
             "purchaseUomId",
             "issueUomId",
             "trackInventory",
             "trackExpiry",
             "trackLot",
             "requiresReceivingInspection"
        FROM "Item"
       WHERE id = ${values.itemId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
       FOR UPDATE
    `;
    const item = items[0];
    if (!item) {
      throw new Error("ITEM_NOT_FOUND");
    }
    if (item.status !== "ACTIVE") {
      throw new Error("ITEM_NOT_ACTIVE");
    }
    if (item.updatedAt.getTime() !== values.expectedUpdatedAt.getTime()) {
      throw new Error("ITEM_UPDATE_CONFLICT");
    }
    assertItemCorrectionIsNonMaterial(item, values);
    if (item.itemName.trim() === values.itemName) {
      throw new Error("ITEM_CORRECTION_NO_CHANGE");
    }
    const updated = await tx.item.update({
      where: { id: item.id },
      data: {
        itemName: values.itemName
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "item.updated",
        entityType: "Item",
        entityId: item.id,
        beforeData: {
          itemName: item.itemName
        },
        afterData: {
          itemName: updated.itemName
        },
        metadata: { reason: values.reason }
      }
    });

    return updated;
  });
}

export async function updateItemUomConversion(formData: FormData) {
  const session = await requireSessionContext();
  const values = updateConversionSchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  const conversion = await prisma.itemUomConversion.findFirst({
    where: {
      id: values.conversionId,
      item: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      fromUom: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      toUom: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    },
    include: {
      item: true,
      fromUom: true,
      toUom: true
    }
  });

  if (!conversion) {
    throw new Error("UOM_CONVERSION_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.itemUomConversion.update({
      where: { id: conversion.id },
      data: {
        conversionFactor: values.conversionFactor,
        roundingRule: values.roundingRule
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "item_uom_conversion.updated",
        entityType: "ItemUomConversion",
        entityId: conversion.id,
        beforeData: {
          itemName: conversion.item.itemName,
          fromUomCode: conversion.fromUom.uomCode,
          toUomCode: conversion.toUom.uomCode,
          conversionFactor: Number(conversion.conversionFactor),
          roundingRule: conversion.roundingRule
        },
        afterData: {
          conversionFactor: values.conversionFactor,
          roundingRule: updated.roundingRule
        },
        metadata: { reason: values.reason }
      }
    });

    return updated;
  });
}

export async function deactivateItem(formData: FormData) {
  const session = await requireSessionContext();
  deactivateItemSchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);
  throw new Error("ITEM_DEACTIVATION_GOVERNANCE_REQUIRED");
}

export async function deactivateItemCategory(formData: FormData) {
  const session = await requireSessionContext();
  const values = deactivateCategorySchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  await prisma.$transaction(async (tx) => {
    const categories = await tx.$queryRaw<Array<{
      id: string;
      categoryCode: string;
      categoryName: string;
      status: string;
    }>>`
      SELECT id, "categoryCode", "categoryName", status::text AS status
        FROM "ItemCategory"
       WHERE id = ${values.categoryId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
       FOR UPDATE
    `;
    const category = categories[0];
    if (!category || category.status !== "ACTIVE") {
      throw new Error("ITEM_CATEGORY_NOT_FOUND");
    }
    const activeDependentCount = await tx.item.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        itemCategoryId: category.id,
        status: "ACTIVE"
      }
    });
    assertNoActiveMasterDataDependents(
      activeDependentCount,
      "ITEM_CATEGORY_HAS_ACTIVE_ITEMS"
    );
    const updated = await tx.itemCategory.update({
      where: { id: category.id },
      data: { status: "INACTIVE" }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "item_category.deactivated",
        entityType: "ItemCategory",
        entityId: category.id,
        beforeData: {
          categoryCode: category.categoryCode,
          categoryName: category.categoryName,
          status: category.status
        },
        afterData: {
          status: updated.status
        },
        metadata: {
          reason: values.reason
        }
      }
    });
  });
}

export async function deactivateUom(formData: FormData) {
  const session = await requireSessionContext();
  const values = deactivateUomSchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  await prisma.$transaction(async (tx) => {
    const uoms = await tx.$queryRaw<Array<{
      id: string;
      uomCode: string;
      uomName: string;
      status: string;
    }>>`
      SELECT id, "uomCode", "uomName", status::text AS status
        FROM "Uom"
       WHERE id = ${values.uomId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
       FOR UPDATE
    `;
    const uom = uoms[0];
    if (!uom || uom.status !== "ACTIVE") {
      throw new Error("UOM_NOT_FOUND");
    }
    const activeDependentCount = await tx.item.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        OR: [
          { baseUomId: uom.id },
          { purchaseUomId: uom.id },
          { issueUomId: uom.id }
        ]
      }
    });
    assertNoActiveMasterDataDependents(activeDependentCount, "UOM_HAS_ACTIVE_ITEMS");
    const updated = await tx.uom.update({
      where: { id: uom.id },
      data: { status: "INACTIVE" }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "uom.deactivated",
        entityType: "Uom",
        entityId: uom.id,
        beforeData: {
          uomCode: uom.uomCode,
          uomName: uom.uomName,
          status: uom.status
        },
        afterData: {
          status: updated.status
        },
        metadata: {
          reason: values.reason
        }
      }
    });
  });
}
