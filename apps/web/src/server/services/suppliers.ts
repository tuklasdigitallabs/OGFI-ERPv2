import { prisma } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { assertCanManageCompanyScope } from "./coreAdmin";
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
  effectiveFrom: z
    .string()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  reason: z.string().min(5).max(500)
});

const deactivateSupplierItemLinkSchema = z.object({
  supplierItemLinkId: z.string().uuid(),
  reason: z.string().min(5).max(500)
});

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

export async function listSuppliers(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  const suppliers = await prisma.supplier.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      _count: {
        select: {
          itemLinks: true
        }
      },
      contacts: {
        where: { isPrimary: true },
        take: 1
      },
      itemLinks: {
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 3,
        include: {
          item: true,
          purchaseUom: true,
          priceHistory: {
            orderBy: { effectiveFrom: "desc" },
            take: 1
          }
        }
      }
    },
    orderBy: [{ status: "asc" }, { legalName: "asc" }]
  });

  return suppliers.map((supplier) => ({
    id: supplier.id,
    supplierCode: supplier.supplierCode,
    legalName: supplier.legalName,
    tradingName: supplier.tradingName,
    taxIdentifier: supplier.taxIdentifier,
    status: supplier.status,
    paymentTerms: supplier.paymentTerms,
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
      latestPrice: link.priceHistory[0]
        ? {
            currencyCode: link.priceHistory[0].currencyCode,
            unitPrice: Number(link.priceHistory[0].unitPrice),
            effectiveFrom: link.priceHistory[0].effectiveFrom.toISOString().slice(0, 10)
          }
        : null
    }))
  }));
}

export async function getSupplierCatalog(
  session: SessionContext,
  supplierId: string,
  filters?: {
    query?: string;
    status?: "ACTIVE" | "INACTIVE" | "ALL";
    categoryId?: string;
    page?: number;
    pageSize?: number;
  }
) {
  await requirePermission(session, permissions.coreAdminister);

  const supplier = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      contacts: {
        where: { isPrimary: true },
        take: 1
      }
    }
  });

  if (!supplier) {
    return null;
  }

  const query = filters?.query?.trim();
  const status = filters?.status ?? "ALL";
  const pageSize = Math.min(Math.max(filters?.pageSize ?? 25, 10), 100);
  const page = Math.max(filters?.page ?? 1, 1);
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    supplierId: supplier.id,
    ...(status === "ALL" ? {} : { status }),
    ...(filters?.categoryId
      ? {
          item: {
            itemCategoryId: filters.categoryId
          }
        }
      : {}),
    ...(query
      ? {
          OR: [
            { supplierSku: { contains: query, mode: "insensitive" as const } },
            { supplierItemName: { contains: query, mode: "insensitive" as const } },
            {
              item: {
                OR: [
                  { itemCode: { contains: query, mode: "insensitive" as const } },
                  { itemName: { contains: query, mode: "insensitive" as const } }
                ]
              }
            }
          ]
        }
      : {})
  };

  const [totalCount, activeCount, categoryCount, categories, filteredTotalCount, itemLinks] =
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
      prisma.supplierItemLink
        .findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            supplierId: supplier.id
          },
          select: {
            item: {
              select: {
                itemCategoryId: true
              }
            }
          },
          distinct: ["itemId"]
        })
        .then(
          (links) =>
            new Set(links.map((link) => link.item.itemCategoryId)).size
        ),
      prisma.itemCategory.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          items: {
            some: {
              supplierItemLinks: {
                some: {
                  supplierId: supplier.id
                }
              }
            }
          }
        },
        orderBy: { categoryName: "asc" }
      }),
      prisma.supplierItemLink.count({
        where
      }),
      prisma.supplierItemLink.findMany({
        where,
        include: {
          item: {
            include: {
              category: true
            }
          },
          purchaseUom: true,
          priceHistory: {
            orderBy: { effectiveFrom: "desc" },
            take: 1
          }
        },
        orderBy: [
          { status: "asc" },
          { item: { itemName: "asc" } },
          { createdAt: "desc" }
        ],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

  return {
    supplier: {
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      legalName: supplier.legalName,
      tradingName: supplier.tradingName,
      taxIdentifier: supplier.taxIdentifier,
      status: supplier.status,
      paymentTerms: supplier.paymentTerms,
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
    categories: categories.map((category) => ({
      id: category.id,
      categoryCode: category.categoryCode,
      categoryName: category.categoryName
    })),
    page,
    pageSize,
    filteredCount: filteredTotalCount,
    hasNextPage: page * pageSize < filteredTotalCount,
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
      latestPrice: link.priceHistory[0]
        ? {
            currencyCode: link.priceHistory[0].currencyCode,
            unitPrice: Number(link.priceHistory[0].unitPrice),
            effectiveFrom: link.priceHistory[0].effectiveFrom.toISOString().slice(0, 10)
          }
        : null
    }))
  };
}

export async function listSupplierItemLinkOptions(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  const [suppliers, items, uoms] = await Promise.all([
    prisma.supplier.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      orderBy: { supplierCode: "asc" }
    }),
    prisma.item.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      orderBy: { itemName: "asc" }
    }),
    prisma.uom.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      orderBy: { uomCode: "asc" }
    })
  ]);

  return {
    suppliers: suppliers.map((supplier) => ({
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      legalName: supplier.legalName
    })),
    items: items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName
    })),
    uoms: uoms.map((uom) => ({
      id: uom.id,
      uomCode: uom.uomCode,
      uomName: uom.uomName
    }))
  };
}

export async function createSupplier(formData: FormData) {
  const session = await requireSessionContext();
  const values = createSupplierSchema.parse(Object.fromEntries(formData));

  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);

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
          status: supplier.status
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

  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const supplier = await prisma.supplier.findFirst({
    where: {
      id: values.supplierId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    }
  });

  if (!supplier) {
    throw new Error("SUPPLIER_NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.supplier.update({
      where: { id: supplier.id },
      data: {
        status: "INACTIVE"
      }
    });

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
          status: supplier.status
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

export async function createSupplierItemLink(formData: FormData) {
  const session = await requireSessionContext();
  const values = createSupplierItemLinkSchema.parse(Object.fromEntries(formData));

  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const [supplier, item, uom, duplicate, company] = await Promise.all([
    prisma.supplier.findFirst({
      where: {
        id: values.supplierId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
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

  if (!supplier) {
    throw new Error("SUPPLIER_NOT_FOUND");
  }
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

  return prisma.$transaction(async (tx) => {
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
}

export async function deactivateSupplierItemLink(formData: FormData) {
  const session = await requireSessionContext();
  const values = deactivateSupplierItemLinkSchema.parse(Object.fromEntries(formData));

  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const link = await prisma.supplierItemLink.findFirst({
    where: {
      id: values.supplierItemLinkId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    },
    include: {
      supplier: true,
      item: true,
      purchaseUom: true
    }
  });

  if (!link) {
    throw new Error("SUPPLIER_ITEM_LINK_NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.supplierItemLink.update({
      where: { id: link.id },
      data: { status: "INACTIVE" }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "supplier_item_link.deactivated",
        entityType: "SupplierItemLink",
        entityId: link.id,
        beforeData: {
          supplierCode: link.supplier.supplierCode,
          itemCode: link.item.itemCode,
          purchaseUomCode: link.purchaseUom.uomCode,
          status: link.status
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
