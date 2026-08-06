import { prisma, Prisma } from "@ogfi/database";
import { z } from "zod";
import {
  getGrantedPermissionCodes,
  permissions,
  requireAnyPermission,
  requirePermission
} from "./authorization";
import {
  assertCanManageCompanyMasterDataScope,
  assertCanViewCompanyMasterDataScope,
} from "./coreAdmin";
import { requireSessionContext, type SessionContext } from "./context";

const supplierCodeSchema = z
  .string()
  .min(2)
  .max(40)
  .transform((value) => value.trim().toUpperCase());

const optionalTextSchema = z
  .string()
  .max(160)
  .transform((value) => value.trim())
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalNonNegativeIntegerSchema = z
  .preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().nonnegative().optional()
  );

const optionalPositiveNumberSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().positive().optional()
);

export function isIsoCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

const optionalIsoDateSchema = z
  .string()
  .refine(isIsoCalendarDate, "INVALID_CALENDAR_DATE")
  .optional()
  .or(z.literal("").transform(() => undefined));

const createSupplierSchema = z.object({
  supplierCode: supplierCodeSchema,
  legalName: z.string().min(2).max(200).transform((value) => value.trim()),
  tradingName: optionalTextSchema,
  taxIdentifier: optionalTextSchema,
  paymentTerms: optionalTextSchema,
  primaryContactName: optionalTextSchema,
  primaryContactRole: optionalTextSchema,
  primaryContactEmail: optionalTextSchema,
  primaryContactPhone: optionalTextSchema,
  reason: z.string().min(5).max(500)
});

const deactivateSupplierSchema = z.object({
  supplierId: z.string().uuid(),
  reason: z.string().min(5).max(500)
});

const supplierAccreditationStatuses = [
  "PENDING_REVIEW",
  "APPROVED",
  "SUSPENDED",
  "BLOCKED"
] as const;

const updateSupplierAccreditationSchema = z.object({
  supplierId: z.string().uuid(),
  accreditationStatus: z.enum(supplierAccreditationStatuses),
  reason: z.string().min(5).max(500),
  evidenceReference: optionalTextSchema
});

const createSupplierItemLinkSchema = z.object({
  supplierId: z.string().uuid(),
  itemId: z.string().uuid(),
  purchaseUomId: z.string().uuid(),
  supplierSku: optionalTextSchema,
  supplierItemName: optionalTextSchema,
  leadTimeDays: optionalNonNegativeIntegerSchema,
  minOrderQty: optionalPositiveNumberSchema,
  preferredRank: optionalNonNegativeIntegerSchema,
  unitPrice: optionalPositiveNumberSchema,
  effectiveFrom: optionalIsoDateSchema,
  reason: z.string().min(5).max(500)
});

const deactivateSupplierItemLinkSchema = z.object({
  supplierId: z.string().uuid(),
  supplierItemLinkId: z.string().uuid(),
  reason: z.string().min(5).max(500)
});

const supplierListInputSchema = z.object({
  query: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  accreditationStatus: z.enum(supplierAccreditationStatuses).optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25)
});

const supplierItemLinkLookupInputSchema = z.object({
  itemQuery: z.string().trim().max(120).default(""),
  itemPage: z.number().int().min(1).max(10_000).default(1),
  selectedItemId: z.string().uuid().optional(),
  uomQuery: z.string().trim().max(120).default(""),
  uomPage: z.number().int().min(1).max(10_000).default(1),
  selectedUomId: z.string().uuid().optional(),
  pageSize: z.number().int().min(10).max(50).default(25)
});

const boundedCatalogSearchSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().slice(0, 120) : ""),
  z.string().max(120)
);

function clampCatalogInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numericValue)));
}

const supplierCatalogInputSchema = z
  .object({
    query: boundedCatalogSearchSchema.default(""),
    status: z.preprocess(
      (value) => (["ACTIVE", "INACTIVE", "ALL"].includes(String(value)) ? value : "ALL"),
      z.enum(["ACTIVE", "INACTIVE", "ALL"])
    ).default("ALL"),
    categoryId: z.preprocess((value) => {
      if (typeof value !== "string") return undefined;
      const normalized = value.trim();
      return z.string().uuid().safeParse(normalized).success ? normalized : undefined;
    }, z.string().uuid().optional()),
    categoryQuery: boundedCatalogSearchSchema.default(""),
    categoryPage: z.preprocess(
      (value) => clampCatalogInteger(value, 1, 10_000, 1),
      z.number().int().min(1).max(10_000)
    ).default(1),
    categoryPageSize: z.preprocess(
      (value) => clampCatalogInteger(value, 10, 100, 25),
      z.number().int().min(10).max(100)
    ).default(25),
    page: z.preprocess(
      (value) => clampCatalogInteger(value, 1, 10_000, 1),
      z.number().int().min(1).max(10_000)
    ).default(1),
    pageSize: z.preprocess(
      (value) => clampCatalogInteger(value, 10, 100, 25),
      z.number().int().min(10).max(100)
    ).default(25)
  })
  .strict();

async function canViewSupplierConfidential(session: SessionContext) {
  const grantedPermissionCodes = await getGrantedPermissionCodes(session);
  return grantedPermissionCodes.includes(permissions.supplierConfidentialView);
}

async function assertSupplierMasterView(session: SessionContext) {
  await requireAnyPermission(session, [permissions.coreAdminister, permissions.supplierMasterView]);
  await assertCanViewCompanyMasterDataScope(session, session.context.companyId);
}

async function assertSupplierMasterCreate(session: SessionContext) {
  await requireAnyPermission(session, [permissions.coreAdminister, permissions.supplierMasterCreate]);
  await assertCanManageCompanyMasterDataScope(session, session.context.companyId);
}

async function assertSupplierMasterEdit(session: SessionContext) {
  await requireAnyPermission(session, [permissions.coreAdminister, permissions.supplierMasterEdit]);
  await assertCanManageCompanyMasterDataScope(session, session.context.companyId);
}

async function assertSupplierMasterManage(session: SessionContext) {
  await requireAnyPermission(session, [permissions.coreAdminister, permissions.supplierMasterManage]);
  await assertCanManageCompanyMasterDataScope(session, session.context.companyId);
}

export function assertNoDuplicateSupplierCode(existingSupplierId?: string) {
  if (existingSupplierId) {
    throw new Error("DUPLICATE_SUPPLIER_CODE");
  }
}

export function assertNoDuplicateSupplierItemLink(existingSupplierItemLinkId?: string) {
  if (existingSupplierItemLinkId) {
    throw new Error("DUPLICATE_SUPPLIER_ITEM_LINK");
  }
}

export async function listSuppliers(
  session: SessionContext,
  input: z.input<typeof supplierListInputSchema> = {}
) {
  await assertSupplierMasterView(session);
  const hasConfidentialAccess = await canViewSupplierConfidential(session);
  const values = supplierListInputSchema.parse(input);
  const query = values.query ? { contains: values.query, mode: "insensitive" as const } : undefined;
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.status ? { status: values.status } : {}),
    ...(values.accreditationStatus ? { accreditationStatus: values.accreditationStatus } : {}),
    ...(query ? { OR: [{ supplierCode: query }, { legalName: query }, { tradingName: query }] } : {})
  };
  const totalSuppliers = await prisma.supplier.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalSuppliers / values.pageSize));
  const effectivePage = Math.min(values.page, totalPages);

  const suppliers = await prisma.supplier.findMany({
    where,
    select: {
      id: true,
      supplierCode: true,
      legalName: true,
      tradingName: true,
      taxIdentifier: true,
      status: true,
      accreditationStatus: true,
      paymentTerms: hasConfidentialAccess,
      createdAt: true,
      _count: {
        select: {
          itemLinks: true
        }
      },
      contacts: {
        where: { isPrimary: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { name: true, role: true, email: true, phone: true },
        take: 1
      },
      itemLinks: {
        orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "asc" }],
        take: 3,
        select: {
          id: true,
          supplierSku: true,
          supplierItemName: true,
          leadTimeDays: true,
          minOrderQty: true,
          preferredRank: true,
          status: true,
          item: { select: { itemCode: true, itemName: true } },
          purchaseUom: { select: { uomCode: true } },
          priceHistory: hasConfidentialAccess
            ? {
                orderBy: [
                  { effectiveFrom: "desc" as const },
                  { createdAt: "desc" as const },
                  { id: "desc" as const }
                ],
                select: {
                  currencyCode: true,
                  unitPrice: true,
                  effectiveFrom: true
                },
                take: 1
              }
            : false
        }
      }
    },
    orderBy: [{ status: "asc" }, { legalName: "asc" }, { id: "asc" }],
    skip: (effectivePage - 1) * values.pageSize,
    take: values.pageSize
  });

  return {
    canViewSupplierConfidential: hasConfidentialAccess,
    suppliers: suppliers.map((supplier) => ({
    id: supplier.id,
    supplierCode: supplier.supplierCode,
    legalName: supplier.legalName,
    tradingName: supplier.tradingName,
    taxIdentifier: supplier.taxIdentifier,
    status: supplier.status,
    accreditationStatus: supplier.accreditationStatus,
    paymentTerms: hasConfidentialAccess ? supplier.paymentTerms : null,
    createdAt: supplier.createdAt.toISOString(),
    itemLinkCount: supplier._count.itemLinks,
    primaryContact: supplier.contacts[0]
      ? {
          name: supplier.contacts[0].name,
          role: supplier.contacts[0].role,
          email: supplier.contacts[0].email,
          phone: supplier.contacts[0].phone
        }
      : null,
    itemLinks: supplier.itemLinks.map((link) => ({
      id: link.id,
      itemCode: link.item.itemCode,
      itemName: link.item.itemName,
      purchaseUomCode: link.purchaseUom.uomCode,
      supplierSku: link.supplierSku,
      supplierItemName: link.supplierItemName,
      leadTimeDays: link.leadTimeDays,
      minOrderQty: link.minOrderQty ? Number(link.minOrderQty) : null,
      preferredRank: link.preferredRank,
      status: link.status,
      latestPrice: hasConfidentialAccess && link.priceHistory[0]
        ? {
            currencyCode: link.priceHistory[0].currencyCode,
            unitPrice: Number(link.priceHistory[0].unitPrice),
            effectiveFrom: link.priceHistory[0].effectiveFrom.toISOString().slice(0, 10)
          }
        : null
    }))
    })),
    suppliersPage: {
      page: effectivePage,
      pageSize: values.pageSize,
      totalSuppliers
    }
  };
}

export async function getSupplierMasterRecord(
  session: SessionContext,
  supplierId: string
) {
  await assertSupplierMasterView(session);
  const scopedSupplierId = z.string().uuid().safeParse(supplierId);
  if (!scopedSupplierId.success) return null;
  const hasConfidentialAccess = await canViewSupplierConfidential(session);

  const supplier = await prisma.supplier.findFirst({
    where: {
      id: scopedSupplierId.data,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    select: {
      id: true,
      supplierCode: true,
      legalName: true,
      tradingName: true,
      taxIdentifier: true,
      status: true,
      accreditationStatus: true,
      paymentTerms: hasConfidentialAccess,
      createdAt: true,
      updatedAt: true,
      _count: { select: { itemLinks: true } },
      contacts: {
        where: { isPrimary: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { name: true, role: true, email: true, phone: true },
        take: 1
      }
    }
  });
  if (!supplier) return null;

  return {
    id: supplier.id,
    supplierCode: supplier.supplierCode,
    legalName: supplier.legalName,
    tradingName: supplier.tradingName,
    taxIdentifier: supplier.taxIdentifier,
    status: supplier.status,
    accreditationStatus: supplier.accreditationStatus,
    paymentTerms: hasConfidentialAccess ? supplier.paymentTerms : null,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
    itemLinkCount: supplier._count.itemLinks,
    primaryContact: supplier.contacts[0]
      ? {
          name: supplier.contacts[0].name,
          role: supplier.contacts[0].role,
          email: supplier.contacts[0].email,
          phone: supplier.contacts[0].phone
        }
      : null
  };
}

export async function getSupplierCatalog(
  session: SessionContext,
  supplierId: string,
  filters: z.input<typeof supplierCatalogInputSchema> = {}
) {
  await assertSupplierMasterView(session);
  const hasConfidentialAccess = await canViewSupplierConfidential(session);
  const scopedSupplierId = z.string().uuid().safeParse(supplierId);
  if (!scopedSupplierId.success) return null;
  const values = supplierCatalogInputSchema.parse(filters);

  const supplier = await prisma.supplier.findFirst({
    where: {
      id: scopedSupplierId.data,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    select: {
      id: true,
      supplierCode: true,
      legalName: true,
      tradingName: true,
      taxIdentifier: true,
      status: true,
      accreditationStatus: true,
      paymentTerms: hasConfidentialAccess,
      updatedAt: true,
      contacts: {
        where: { isPrimary: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { name: true, role: true, email: true, phone: true },
        take: 1
      }
    }
  });

  if (!supplier) {
    return null;
  }

  const categoryWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.categoryQuery
      ? {
          OR: [
            { categoryName: { contains: values.categoryQuery, mode: "insensitive" as const } },
            { categoryCode: { contains: values.categoryQuery, mode: "insensitive" as const } }
          ]
        }
      : {}),
    items: {
      some: {
        supplierItemLinks: { some: { supplierId: supplier.id } }
      }
    }
  };
  const selectedCategoryWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    items: {
      some: {
        supplierItemLinks: { some: { supplierId: supplier.id } }
      }
    }
  };
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    supplierId: supplier.id,
    ...(values.status === "ALL" ? {} : { status: values.status }),
    ...(values.categoryId
      ? {
          item: {
            itemCategoryId: values.categoryId
          }
        }
      : {}),
    ...(values.query
      ? {
          OR: [
            { supplierSku: { contains: values.query, mode: "insensitive" as const } },
            { supplierItemName: { contains: values.query, mode: "insensitive" as const } },
            {
              item: {
                OR: [
                  { itemCode: { contains: values.query, mode: "insensitive" as const } },
                  { itemName: { contains: values.query, mode: "insensitive" as const } }
                ]
              }
            }
          ]
        }
      : {})
  };

  const [totalCount, activeCount, categoryCount, categoryTotalCount, filteredTotalCount] =
    await Promise.all([
      prisma.supplierItemLink.count({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          supplierId: supplier.id
        }
      }),
      prisma.supplierItemLink.count({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          supplierId: supplier.id,
          status: "ACTIVE"
        }
      }),
      prisma.itemCategory.count({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          items: {
            some: {
              supplierItemLinks: {
                some: {
                  tenantId: session.context.tenantId,
                  companyId: session.context.companyId,
                  supplierId: supplier.id
                }
              }
            }
          }
        }
      }),
      prisma.itemCategory.count({ where: categoryWhere }),
      prisma.supplierItemLink.count({
        where
      })
    ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotalCount / values.pageSize));
  const page = Math.min(values.page, totalPages);
  const categoryTotalPages = Math.max(
    1,
    Math.ceil(categoryTotalCount / values.categoryPageSize)
  );
  const categoryPage = Math.min(values.categoryPage, categoryTotalPages);

  const [categories, selectedCategory, itemLinks] = await Promise.all([
    prisma.itemCategory.findMany({
      where: categoryWhere,
      orderBy: [{ categoryName: "asc" }, { id: "asc" }],
      skip: (categoryPage - 1) * values.categoryPageSize,
      take: values.categoryPageSize
    }),
    values.categoryId
      ? prisma.itemCategory.findFirst({
          where: { ...selectedCategoryWhere, id: values.categoryId }
        })
      : Promise.resolve(null),
    prisma.supplierItemLink.findMany({
        where,
        select: {
          id: true,
          supplierSku: true,
          supplierItemName: true,
          leadTimeDays: true,
          minOrderQty: true,
          preferredRank: true,
          status: true,
          item: {
            select: {
              itemCode: true,
              itemName: true,
              category: { select: { categoryName: true } }
            }
          },
          purchaseUom: { select: { uomCode: true } },
          priceHistory: hasConfidentialAccess
            ? {
                orderBy: [
                  { effectiveFrom: "desc" as const },
                  { createdAt: "desc" as const },
                  { id: "desc" as const }
                ],
                select: {
                  currencyCode: true,
                  unitPrice: true,
                  effectiveFrom: true
                },
                take: 1
              }
            : false
        },
        orderBy: [
          { status: "asc" },
          { item: { itemName: "asc" } },
          { createdAt: "desc" },
          { id: "asc" }
        ],
        skip: (page - 1) * values.pageSize,
        take: values.pageSize
      })
    ]);

  const rangeStart = filteredTotalCount === 0
    ? 0
    : (page - 1) * values.pageSize + 1;
  const rangeEnd = filteredTotalCount === 0
    ? 0
    : Math.min(page * values.pageSize, filteredTotalCount);

  return {
    canViewSupplierConfidential: hasConfidentialAccess,
    supplier: {
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      legalName: supplier.legalName,
      tradingName: supplier.tradingName,
      taxIdentifier: supplier.taxIdentifier,
      status: supplier.status,
      accreditationStatus: supplier.accreditationStatus,
      paymentTerms: hasConfidentialAccess ? supplier.paymentTerms : null,
      updatedAt: supplier.updatedAt.toISOString(),
      primaryContact: supplier.contacts[0]
        ? {
            name: supplier.contacts[0].name,
            role: supplier.contacts[0].role,
            email: supplier.contacts[0].email,
            phone: supplier.contacts[0].phone
          }
        : null
    },
    summary: {
      totalCount,
      activeCount,
      inactiveCount: totalCount - activeCount,
      categoryCount
    },
    categories: [
      ...(selectedCategory && !categories.some((category) => category.id === selectedCategory.id)
        ? [selectedCategory]
        : []),
      ...categories
    ].map((category) => ({
      id: category.id,
      categoryCode: category.categoryCode,
      categoryName: category.categoryName
    })),
    categoriesPage: {
      page: categoryPage,
      pageSize: values.categoryPageSize,
      totalItems: categoryTotalCount,
      hasNextPage: categoryPage < categoryTotalPages,
      hasPreviousPage: categoryPage > 1
    },
    page,
    pageSize: values.pageSize,
    filteredCount: filteredTotalCount,
    totalPages,
    rangeStart,
    rangeEnd,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    itemLinks: itemLinks.map((link) => ({
      id: link.id,
      itemCode: link.item.itemCode,
      itemName: link.item.itemName,
      categoryName: link.item.category.categoryName,
      purchaseUomCode: link.purchaseUom.uomCode,
      supplierSku: link.supplierSku,
      supplierItemName: link.supplierItemName,
      leadTimeDays: link.leadTimeDays,
      minOrderQty: link.minOrderQty ? Number(link.minOrderQty) : null,
      preferredRank: link.preferredRank,
      status: link.status,
      latestPrice: hasConfidentialAccess && link.priceHistory[0]
        ? {
            currencyCode: link.priceHistory[0].currencyCode,
            unitPrice: Number(link.priceHistory[0].unitPrice),
            effectiveFrom: link.priceHistory[0].effectiveFrom.toISOString().slice(0, 10)
          }
        : null
    }))
  };
}

export async function getSupplierItemLinkLookup(
  session: SessionContext,
  supplierId: string,
  input: z.input<typeof supplierItemLinkLookupInputSchema> = {}
) {
  await assertSupplierMasterEdit(session);
  const values = supplierItemLinkLookupInputSchema.parse(input);
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    },
    select: { id: true, supplierCode: true, legalName: true }
  });
  if (!supplier) {
    throw new Error("SUPPLIER_NOT_FOUND");
  }

  const itemWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    status: "ACTIVE" as const,
    ...(values.itemQuery || values.selectedItemId
      ? {
          OR: [
            ...(values.itemQuery
              ? [
                  { itemName: { contains: values.itemQuery, mode: "insensitive" as const } },
                  { itemCode: { contains: values.itemQuery, mode: "insensitive" as const } }
                ]
              : []),
            ...(values.selectedItemId ? [{ id: values.selectedItemId }] : [])
          ]
        }
      : {})
  };
  const uomWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    status: "ACTIVE" as const,
    ...(values.uomQuery || values.selectedUomId
      ? {
          OR: [
            ...(values.uomQuery
              ? [
                  { uomCode: { contains: values.uomQuery, mode: "insensitive" as const } },
                  { uomName: { contains: values.uomQuery, mode: "insensitive" as const } }
                ]
              : []),
            ...(values.selectedUomId ? [{ id: values.selectedUomId }] : [])
          ]
        }
      : {})
  };
  const [itemTotal, uomTotal] = await Promise.all([
    prisma.item.count({ where: itemWhere }),
    prisma.uom.count({ where: uomWhere })
  ]);
  const itemPage = Math.min(values.itemPage, Math.max(1, Math.ceil(itemTotal / values.pageSize)));
  const uomPage = Math.min(values.uomPage, Math.max(1, Math.ceil(uomTotal / values.pageSize)));
  const [items, uoms] = await Promise.all([
    prisma.item.findMany({
      where: itemWhere,
      select: { id: true, itemCode: true, itemName: true },
      orderBy: [{ itemName: "asc" }, { itemCode: "asc" }, { id: "asc" }],
      skip: (itemPage - 1) * values.pageSize,
      take: values.pageSize
    }),
    prisma.uom.findMany({
      where: uomWhere,
      select: { id: true, uomCode: true, uomName: true },
      orderBy: [{ uomCode: "asc" }, { id: "asc" }],
      skip: (uomPage - 1) * values.pageSize,
      take: values.pageSize
    })
  ]);
  return {
    supplier,
    items: {
      options: items,
      page: itemPage,
      pageSize: values.pageSize,
      totalItems: itemTotal,
      hasNextPage: itemPage * values.pageSize < itemTotal,
      hasPreviousPage: itemPage > 1
    },
    uoms: {
      options: uoms,
      page: uomPage,
      pageSize: values.pageSize,
      totalItems: uomTotal,
      hasNextPage: uomPage * values.pageSize < uomTotal,
      hasPreviousPage: uomPage > 1
    }
  };
}

export async function createSupplier(formData: FormData) {
  const session = await requireSessionContext();
  const values = createSupplierSchema.parse(Object.fromEntries(formData));

  await assertSupplierMasterCreate(session);
  if (values.paymentTerms !== undefined) {
    await requirePermission(session, permissions.supplierConfidentialView);
  }

  const existing = await prisma.supplier.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      supplierCode: values.supplierCode
    },
    select: { id: true }
  });
  assertNoDuplicateSupplierCode(existing?.id);

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        supplierCode: values.supplierCode,
        legalName: values.legalName,
        tradingName: values.tradingName ?? null,
        taxIdentifier: values.taxIdentifier ?? null,
        accreditationStatus: "PENDING_REVIEW",
        paymentTerms: values.paymentTerms ?? null,
        ...(values.primaryContactName
          ? {
              contacts: {
                create: {
                  name: values.primaryContactName,
                  isPrimary: true,
                  ...(values.primaryContactRole ? { role: values.primaryContactRole } : {}),
                  ...(values.primaryContactEmail ? { email: values.primaryContactEmail } : {}),
                  ...(values.primaryContactPhone ? { phone: values.primaryContactPhone } : {})
                }
              }
            }
          : {})
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "supplier.created",
        entityType: "Supplier",
        entityId: supplier.id,
        afterData: {
          supplierCode: supplier.supplierCode,
          legalName: supplier.legalName,
          status: supplier.status,
          accreditationStatus: supplier.accreditationStatus
        },
        metadata: {
          reason: values.reason
        }
      }
    });

    return supplier;
  });
}

export async function deactivateSupplier(formData: FormData) {
  const session = await requireSessionContext();
  const values = deactivateSupplierSchema.parse(Object.fromEntries(formData));

  await assertSupplierMasterManage(session);

  await prisma.$transaction(async (tx) => {
    const [supplier] = await tx.$queryRaw<Array<{
      id: string;
      supplierCode: string;
      legalName: string;
      status: string;
      accreditationStatus: string;
    }>>(Prisma.sql`
      SELECT
        supplier."id",
        supplier."supplierCode",
        supplier."legalName",
        supplier."status"::text AS "status",
        supplier."accreditationStatus"::text AS "accreditationStatus"
      FROM "Supplier" supplier
      WHERE supplier."id" = ${values.supplierId}::uuid
        AND supplier."tenantId" = ${session.context.tenantId}::uuid
        AND supplier."companyId" = ${session.context.companyId}::uuid
        AND supplier."status" = 'ACTIVE'
      FOR UPDATE OF supplier
    `);

    if (!supplier) {
      throw new Error("SUPPLIER_NOT_FOUND");
    }

    const updated = await tx.supplier.updateMany({
      where: {
        id: values.supplierId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      data: {
        status: "INACTIVE",
        accreditationStatus: "SUSPENDED"
      }
    });
    if (updated.count !== 1) {
      throw new Error("SUPPLIER_NOT_FOUND");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "supplier.deactivated",
        entityType: "Supplier",
        entityId: supplier.id,
        beforeData: {
          supplierCode: supplier.supplierCode,
          legalName: supplier.legalName,
          status: supplier.status,
          accreditationStatus: supplier.accreditationStatus
        },
        afterData: {
          status: "INACTIVE",
          accreditationStatus: "SUSPENDED"
        },
        metadata: {
          reason: values.reason
        }
      }
    });
  });
}

export async function updateSupplierAccreditation(formData: FormData) {
  const session = await requireSessionContext();
  const values = updateSupplierAccreditationSchema.parse(
    Object.fromEntries(formData)
  );

  await assertSupplierMasterManage(session);

  await prisma.$transaction(async (tx) => {
    const [supplier] = await tx.$queryRaw<Array<{
      id: string;
      supplierCode: string;
      legalName: string;
      accreditationStatus: string;
    }>>(Prisma.sql`
      SELECT
        supplier."id",
        supplier."supplierCode",
        supplier."legalName",
        supplier."accreditationStatus"::text AS "accreditationStatus"
      FROM "Supplier" supplier
      WHERE supplier."id" = ${values.supplierId}::uuid
        AND supplier."tenantId" = ${session.context.tenantId}::uuid
        AND supplier."companyId" = ${session.context.companyId}::uuid
        AND supplier."status" = 'ACTIVE'
      FOR UPDATE OF supplier
    `);
    if (!supplier) {
      throw new Error("SUPPLIER_NOT_FOUND");
    }

    const updated = await tx.supplier.updateMany({
      where: {
        id: supplier.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      data: {
        accreditationStatus: values.accreditationStatus
      }
    });
    if (updated.count !== 1) {
      throw new Error("SUPPLIER_NOT_FOUND");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "supplier.accreditation_status_updated",
        entityType: "Supplier",
        entityId: supplier.id,
        beforeData: {
          supplierCode: supplier.supplierCode,
          legalName: supplier.legalName,
          accreditationStatus: supplier.accreditationStatus
        },
        afterData: {
          accreditationStatus: values.accreditationStatus
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reason: values.reason,
          evidenceReference: values.evidenceReference ?? null
        }
      }
    });
  });
}

export async function createSupplierItemLink(formData: FormData) {
  const session = await requireSessionContext();
  const values = createSupplierItemLinkSchema.parse(Object.fromEntries(formData));

  await assertSupplierMasterEdit(session);
  if (values.unitPrice !== undefined || values.effectiveFrom !== undefined) {
    await requirePermission(session, permissions.supplierConfidentialView);
  }
  if (values.effectiveFrom !== undefined && values.unitPrice === undefined) {
    throw new Error("SUPPLIER_REFERENCE_PRICE_REQUIRED");
  }

  const [item, uom, duplicate, company] = await Promise.all([
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
        id: values.purchaseUomId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.supplierItemLink.findUnique({
      where: {
        supplierId_itemId_purchaseUomId: {
          supplierId: values.supplierId,
          itemId: values.itemId,
          purchaseUomId: values.purchaseUomId
        }
      },
      select: { id: true }
    }),
    prisma.company.findFirst({
      where: {
        id: session.context.companyId,
        tenantId: session.context.tenantId
      },
      select: { currencyCode: true }
    })
  ]);

  if (!item) {
    throw new Error("ITEM_NOT_FOUND");
  }
  if (!uom) {
    throw new Error("UOM_NOT_FOUND");
  }
  if (!company) {
    throw new Error("COMPANY_NOT_FOUND");
  }
  assertNoDuplicateSupplierItemLink(duplicate?.id);

  const effectiveFrom = values.effectiveFrom
    ? new Date(`${values.effectiveFrom}T00:00:00.000Z`)
    : new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const [supplier] = await tx.$queryRaw<Array<{
        id: string;
        supplierCode: string;
      }>>(Prisma.sql`
        SELECT supplier."id", supplier."supplierCode"
        FROM "Supplier" supplier
        WHERE supplier."id" = ${values.supplierId}::uuid
          AND supplier."tenantId" = ${session.context.tenantId}::uuid
          AND supplier."companyId" = ${session.context.companyId}::uuid
          AND supplier."status" = 'ACTIVE'
        FOR UPDATE OF supplier
      `);
      if (!supplier) {
        throw new Error("SUPPLIER_NOT_FOUND");
      }

      const link = await tx.supplierItemLink.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          supplierId: supplier.id,
          itemId: item.id,
          purchaseUomId: uom.id,
          supplierSku: values.supplierSku ?? null,
          supplierItemName: values.supplierItemName ?? null,
          leadTimeDays: values.leadTimeDays ?? null,
          minOrderQty: values.minOrderQty ?? null,
          preferredRank: values.preferredRank ?? null
        }
      });

      if (values.unitPrice) {
        await tx.supplierPriceHistory.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            supplierId: supplier.id,
            itemId: item.id,
            supplierItemLinkId: link.id,
            uomId: uom.id,
            currencyCode: company.currencyCode,
            unitPrice: values.unitPrice,
            effectiveFrom
          }
        });
      }

      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "supplier_item_link.created",
          entityType: "SupplierItemLink",
          entityId: link.id,
          afterData: {
            supplierCode: supplier.supplierCode,
            itemCode: item.itemCode,
            purchaseUomCode: uom.uomCode,
            status: link.status
          },
          metadata: {
            reason: values.reason,
            hasReferencePrice: Boolean(values.unitPrice)
          }
        }
      });

      return link;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.some((target) => String(target).includes("supplierId_itemId_purchaseUomId"))
    ) {
      throw new Error("DUPLICATE_SUPPLIER_ITEM_LINK");
    }
    throw error;
  }
}

export async function deactivateSupplierItemLink(formData: FormData) {
  const session = await requireSessionContext();
  const values = deactivateSupplierItemLinkSchema.parse(Object.fromEntries(formData));

  await assertSupplierMasterManage(session);

  await prisma.$transaction(async (tx) => {
    const [activeSupplier] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT supplier."id"
      FROM "Supplier" supplier
      WHERE supplier."id" = ${values.supplierId}::uuid
        AND supplier."tenantId" = ${session.context.tenantId}::uuid
        AND supplier."companyId" = ${session.context.companyId}::uuid
        AND supplier."status" = 'ACTIVE'
      FOR UPDATE OF supplier
    `);
    if (!activeSupplier) {
      throw new Error("SUPPLIER_ITEM_LINK_NOT_FOUND");
    }

    const [link] = await tx.$queryRaw<Array<{
      id: string;
      supplierCode: string;
      itemCode: string;
      purchaseUomCode: string;
      status: string;
    }>>(Prisma.sql`
      SELECT
        link."id",
        supplier."supplierCode",
        item."itemCode",
        uom."uomCode" AS "purchaseUomCode",
        link."status"::text AS "status"
      FROM "SupplierItemLink" link
      JOIN "Supplier" supplier
        ON supplier."id" = link."supplierId"
       AND supplier."tenantId" = link."tenantId"
       AND supplier."companyId" = link."companyId"
       AND supplier."status" = 'ACTIVE'
      JOIN "Item" item
        ON item."id" = link."itemId"
       AND item."tenantId" = link."tenantId"
       AND item."companyId" = link."companyId"
      JOIN "Uom" uom
        ON uom."id" = link."purchaseUomId"
       AND uom."tenantId" = link."tenantId"
       AND uom."companyId" = link."companyId"
      WHERE link."id" = ${values.supplierItemLinkId}::uuid
        AND link."supplierId" = ${values.supplierId}::uuid
        AND link."tenantId" = ${session.context.tenantId}::uuid
        AND link."companyId" = ${session.context.companyId}::uuid
        AND link."status" = 'ACTIVE'
      FOR UPDATE OF link
    `);

    if (!link) {
      throw new Error("SUPPLIER_ITEM_LINK_NOT_FOUND");
    }

    const updated = await tx.supplierItemLink.updateMany({
      where: {
        id: values.supplierItemLinkId,
        supplierId: values.supplierId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      data: { status: "INACTIVE" }
    });
    if (updated.count !== 1) {
      throw new Error("SUPPLIER_ITEM_LINK_NOT_FOUND");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "supplier_item_link.deactivated",
        entityType: "SupplierItemLink",
        entityId: link.id,
        beforeData: {
          supplierCode: link.supplierCode,
          itemCode: link.itemCode,
          purchaseUomCode: link.purchaseUomCode,
          status: link.status
        },
        afterData: {
          status: "INACTIVE"
        },
        metadata: {
          reason: values.reason
        }
      }
    });
  });
}
