import { prisma } from "@ogfi/database";
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
    itemId: z.string().uuid()
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

export function assertNoActiveMasterDataDependents(
  activeDependentCount: number,
  errorCode: string
) {
  if (activeDependentCount > 0) {
    throw new Error(errorCode);
  }
}

async function assertAdminCanManageMasterData(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
}

export async function listItemMasterData(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  const [categories, uoms, items, conversions] = await Promise.all([
    prisma.itemCategory.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      orderBy: [{ status: "asc" }, { categoryName: "asc" }]
    }),
    prisma.uom.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      orderBy: [{ status: "asc" }, { uomCode: "asc" }]
    }),
    prisma.item.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      include: {
        category: true,
        baseUom: true,
        purchaseUom: true,
        issueUom: true
      },
      orderBy: [{ status: "asc" }, { itemName: "asc" }]
    }),
    prisma.itemUomConversion.findMany({
      where: {
        item: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        }
      },
      include: {
        item: true,
        fromUom: true,
        toUom: true
      },
      orderBy: { createdAt: "desc" }
    })
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
    }))
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

  const [category, baseUom, purchaseUom, issueUom] = await Promise.all([
    prisma.itemCategory.findFirst({
      where: {
        id: values.itemCategoryId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.uom.findFirst({
      where: {
        id: values.baseUomId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    values.purchaseUomId
      ? prisma.uom.findFirst({
          where: {
            id: values.purchaseUomId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE"
          }
        })
      : null,
    values.issueUomId
      ? prisma.uom.findFirst({
          where: {
            id: values.issueUomId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE"
          }
        })
      : null
  ]);

  if (!category) {
    throw new Error("ITEM_CATEGORY_NOT_FOUND");
  }
  if (!baseUom) {
    throw new Error("BASE_UOM_NOT_FOUND");
  }
  if (values.purchaseUomId && !purchaseUom) {
    throw new Error("PURCHASE_UOM_NOT_FOUND");
  }
  if (values.issueUomId && !issueUom) {
    throw new Error("ISSUE_UOM_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.item.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        itemCode: values.itemCode,
        itemName: values.itemName,
        itemCategoryId: category.id,
        itemType: values.itemType,
        baseUomId: baseUom.id,
        purchaseUomId: purchaseUom?.id ?? null,
        issueUomId: issueUom?.id ?? null,
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
        toUomId: values.toUomId
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

  const [item, category, baseUom, purchaseUom, issueUom] = await Promise.all([
    prisma.item.findFirst({
      where: {
        id: values.itemId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      }
    }),
    prisma.itemCategory.findFirst({
      where: {
        id: values.itemCategoryId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.uom.findFirst({
      where: {
        id: values.baseUomId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    values.purchaseUomId
      ? prisma.uom.findFirst({
          where: {
            id: values.purchaseUomId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE"
          }
        })
      : null,
    values.issueUomId
      ? prisma.uom.findFirst({
          where: {
            id: values.issueUomId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE"
          }
        })
      : null
  ]);

  if (!item) {
    throw new Error("ITEM_NOT_FOUND");
  }
  if (!category) {
    throw new Error("ITEM_CATEGORY_NOT_FOUND");
  }
  if (!baseUom) {
    throw new Error("BASE_UOM_NOT_FOUND");
  }
  if (values.purchaseUomId && !purchaseUom) {
    throw new Error("PURCHASE_UOM_NOT_FOUND");
  }
  if (values.issueUomId && !issueUom) {
    throw new Error("ISSUE_UOM_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id: item.id },
      data: {
        itemName: values.itemName,
        itemCategoryId: category.id,
        itemType: values.itemType,
        baseUomId: baseUom.id,
        purchaseUomId: purchaseUom?.id ?? null,
        issueUomId: issueUom?.id ?? null,
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
        eventType: "item.updated",
        entityType: "Item",
        entityId: item.id,
        beforeData: {
          itemName: item.itemName,
          itemCategoryId: item.itemCategoryId,
          itemType: item.itemType,
          baseUomId: item.baseUomId,
          purchaseUomId: item.purchaseUomId,
          issueUomId: item.issueUomId,
          trackInventory: item.trackInventory,
          trackExpiry: item.trackExpiry,
          trackLot: item.trackLot,
          requiresReceivingInspection: item.requiresReceivingInspection
        },
        afterData: {
          itemName: updated.itemName,
          itemCategoryId: updated.itemCategoryId,
          itemType: updated.itemType,
          baseUomId: updated.baseUomId,
          purchaseUomId: updated.purchaseUomId,
          issueUomId: updated.issueUomId,
          trackInventory: updated.trackInventory,
          trackExpiry: updated.trackExpiry,
          trackLot: updated.trackLot,
          requiresReceivingInspection: updated.requiresReceivingInspection
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
        companyId: session.context.companyId
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
  const values = deactivateItemSchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  const item = await prisma.item.findFirst({
    where: {
      id: values.itemId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    }
  });

  if (!item) {
    throw new Error("ITEM_NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id: item.id },
      data: {
        status: "INACTIVE"
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "item.deactivated",
        entityType: "Item",
        entityId: item.id,
        beforeData: {
          itemCode: item.itemCode,
          itemName: item.itemName,
          status: item.status
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

export async function deactivateItemCategory(formData: FormData) {
  const session = await requireSessionContext();
  const values = deactivateCategorySchema.parse(Object.fromEntries(formData));
  await assertAdminCanManageMasterData(session);

  const category = await prisma.itemCategory.findFirst({
    where: {
      id: values.categoryId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    }
  });

  if (!category) {
    throw new Error("ITEM_CATEGORY_NOT_FOUND");
  }

  const activeDependentCount = await prisma.item.count({
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

  await prisma.$transaction(async (tx) => {
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

  const uom = await prisma.uom.findFirst({
    where: {
      id: values.uomId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    }
  });

  if (!uom) {
    throw new Error("UOM_NOT_FOUND");
  }

  const activeDependentCount = await prisma.item.count({
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

  await prisma.$transaction(async (tx) => {
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
