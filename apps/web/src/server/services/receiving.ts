import { prisma } from "@ogfi/database";
import { z } from "zod";
import { canUseReceiving, permissions, requirePermission } from "./authorization";
import { assertAuthorizedLocation, requireSessionContext, type SessionContext } from "./context";
import type { CsvRow } from "./csv";
import { postInventoryMovementInTransaction } from "./inventory";
import { classifyPurchaseOrderDeliveryAging } from "./purchaseOrders";

const createReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  supplierDeliveryReceiptNumber: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional()
});

const postReceiptSchema = z.object({
  id: z.string().uuid()
});

const reverseReceiptSchema = z.object({
  id: z.string().uuid(),
  reversalReason: z.string().trim().min(5).max(500)
});

export function assertPurchaseOrderCanBeReceived(status: string) {
  if (status !== "ISSUED" && status !== "PARTIALLY_RECEIVED") {
    throw new Error("PURCHASE_ORDER_NOT_ISSUED_FOR_RECEIVING");
  }
}

export function assertGoodsReceiptCanBePosted(status: string) {
  if (status !== "DRAFT") {
    throw new Error("GOODS_RECEIPT_NOT_DRAFT_FOR_POSTING");
  }
}

export function assertGoodsReceiptCanBeReversed(status: string, reversedAt?: unknown) {
  if (reversedAt) {
    throw new Error("GOODS_RECEIPT_ALREADY_REVERSED");
  }
  if (status !== "POSTED" && status !== "POSTED_WITH_DISCREPANCY") {
    throw new Error("GOODS_RECEIPT_NOT_POSTED_FOR_REVERSAL");
  }
}

export function calculatePurchaseOrderReceivingStatus(
  lines: Array<{ orderedQty: unknown; receivedQty: unknown; cancelledQty: unknown }>
) {
  const totalReceived = lines.reduce(
    (sum, line) => sum + Number(line.receivedQty),
    0
  );
  if (totalReceived <= 0) {
    return "ISSUED";
  }
  const fullyReceived = lines.every(
    (line) =>
      Number(line.receivedQty) + Number(line.cancelledQty) >=
      Number(line.orderedQty)
  );
  return fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED";
}

async function requireReceivingRead(session: SessionContext) {
  if (!canUseReceiving(session.permissionCodes)) {
    await requirePermission(session, permissions.receivingView);
  }
}

export function validateReceivingQuantities(values: {
  deliveredQty: number;
  acceptedQty: number;
  rejectedQty: number;
  damagedQty: number;
  shortQty: number;
  outstandingQty?: number;
  discrepancyReason?: string | null;
  evidenceReference?: string | null;
}) {
  const quantities = [
    values.deliveredQty,
    values.acceptedQty,
    values.rejectedQty,
    values.damagedQty,
    values.shortQty
  ];
  if (quantities.some((quantity) => !Number.isFinite(quantity) || quantity < 0)) {
    throw new Error("RECEIVING_QUANTITY_INVALID");
  }
  if (
    values.acceptedQty + values.rejectedQty + values.damagedQty >
    values.deliveredQty
  ) {
    throw new Error("RECEIVING_LINE_OUTCOME_EXCEEDS_DELIVERED");
  }
  if (
    values.outstandingQty != null &&
    (values.deliveredQty > values.outstandingQty ||
      values.acceptedQty > values.outstandingQty)
  ) {
    throw new Error("RECEIVING_LINE_EXCEEDS_OUTSTANDING");
  }
  if (
    (values.rejectedQty > 0 || values.damagedQty > 0 || values.shortQty > 0) &&
    !values.discrepancyReason?.trim()
  ) {
    throw new Error("RECEIVING_DISCREPANCY_REASON_REQUIRED");
  }
  if (
    (values.rejectedQty > 0 || values.damagedQty > 0 || values.shortQty > 0) &&
    !values.evidenceReference?.trim()
  ) {
    throw new Error("RECEIVING_DISCREPANCY_EVIDENCE_REQUIRED");
  }
}

function getLineValue(formData: FormData, lineId: string, field: string) {
  return formData.get(`line.${lineId}.${field}`);
}

async function nextGoodsReceiptReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.goodsReceipt.count({
    where: {
      companyId,
      publicReference: { startsWith: `RR-${year}-` }
    }
  });
  return `RR-${year}-${String(count + 1).padStart(5, "0")}`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function getBaseQuantity(line: {
  itemId: string;
  uomId: string;
  acceptedQty: unknown;
  item: {
    baseUomId: string;
  };
}) {
  const acceptedQty = Number(line.acceptedQty);
  if (line.uomId === line.item.baseUomId) {
    return acceptedQty;
  }

  const conversion = await prisma.itemUomConversion.findFirst({
    where: {
      itemId: line.itemId,
      fromUomId: line.uomId,
      toUomId: line.item.baseUomId
    }
  });

  if (!conversion) {
    throw new Error("INVENTORY_UOM_CONVERSION_REQUIRED");
  }

  return acceptedQty * Number(conversion.conversionFactor);
}

export async function listGoodsReceipts(session: SessionContext) {
  await requireReceivingRead(session);

  const receipts = await prisma.goodsReceipt.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: {
      purchaseOrder: true,
      supplier: true,
      receivingLocation: true,
      receivedBy: true,
      reversedBy: true,
      lines: true
    },
    orderBy: { createdAt: "desc" }
  });

  return receipts.map((receipt) => ({
    id: receipt.id,
    publicReference: receipt.publicReference,
    purchaseOrderReference: receipt.purchaseOrder.publicReference,
    purchaseOrderStatus: receipt.purchaseOrder.status,
    purchaseOrderExpectedDeliveryDate: receipt.purchaseOrder.expectedDeliveryDate
      .toISOString()
      .slice(0, 10),
    supplierName: receipt.supplier.tradingName ?? receipt.supplier.legalName,
    receivedByName: receipt.receivedBy.displayName,
    reversedByName: receipt.reversedBy?.displayName ?? null,
    receivedAt: receipt.receivedAt.toISOString(),
    reversedAt: receipt.reversedAt?.toISOString() ?? null,
    status: receipt.status,
    lineCount: receipt.lines.length,
    discrepancyFlag: receipt.discrepancyFlag
  }));
}

export async function buildReceivingReportExportRows(session: SessionContext) {
  await requireReceivingRead(session);

  const receipts = await prisma.goodsReceipt.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: {
      purchaseOrder: true,
      supplier: true,
      receivingLocation: true,
      receivedBy: true,
      reversedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          inventoryDestinationLocation: true,
          item: true,
          uom: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const rows: CsvRow[] = [
    [
      "Reference",
      "Status",
      "Purchase Order",
      "PO Status",
      "PO Expected Delivery",
      "Supplier",
      "Receiving Location",
      "Received By",
      "Received At",
      "Posted At",
      "Reversed By",
      "Reversed At",
      "Line",
      "Item Code",
      "Item Name",
      "Destination",
      "UOM",
      "Ordered Qty",
      "Delivered Qty",
      "Accepted Qty",
      "Rejected Qty",
      "Damaged Qty",
      "Short Qty",
      "Condition",
      "Discrepancy Type",
      "Discrepancy Reason",
      "Evidence Reference",
      "Lot",
      "Expiry",
      "Posted Movement"
    ]
  ];

  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      rows.push([
        receipt.publicReference,
        receipt.status,
        receipt.purchaseOrder.publicReference,
        receipt.purchaseOrder.status,
        receipt.purchaseOrder.expectedDeliveryDate.toISOString().slice(0, 10),
        receipt.supplier.tradingName ?? receipt.supplier.legalName,
        receipt.receivingLocation.name,
        receipt.receivedBy.displayName,
        receipt.receivedAt.toISOString(),
        receipt.postedAt?.toISOString() ?? "",
        receipt.reversedBy?.displayName ?? "",
        receipt.reversedAt?.toISOString() ?? "",
        line.lineNumber,
        line.item.itemCode,
        line.item.itemName,
        line.inventoryDestinationLocation.name,
        line.uom.uomCode,
        Number(line.orderedQty),
        Number(line.deliveredQty),
        Number(line.acceptedQty),
        Number(line.rejectedQty),
        Number(line.damagedQty),
        Number(line.shortQty),
        line.conditionStatus,
        line.discrepancyType ?? "",
        line.discrepancyReason ?? "",
        line.evidenceReference ?? "",
        line.lotNumber ?? "",
        line.expiryDate?.toISOString().slice(0, 10) ?? "",
        line.postedMovementId ?? ""
      ]);
    }
  }

  return rows;
}

export async function listReceivablePurchaseOrders(session: SessionContext) {
  await requirePermission(session, permissions.receivingCreate);

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId,
      status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }
    },
    include: {
      supplier: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      }
    },
    orderBy: { expectedDeliveryDate: "asc" }
  });

  const today = new Date().toISOString().slice(0, 10);

  return orders.map((order) => {
    const expectedDeliveryDate = order.expectedDeliveryDate.toISOString().slice(0, 10);
    const deliveryAging = classifyPurchaseOrderDeliveryAging({
      status: order.status,
      expectedDeliveryDate,
      today
    });

    return {
      id: order.id,
      publicReference: order.publicReference,
      supplierName: order.supplier.tradingName ?? order.supplier.legalName,
      expectedDeliveryDate,
      deliveryAgingStatus: deliveryAging.deliveryAgingStatus,
      daysOverdue: deliveryAging.daysOverdue,
      status: order.status,
      lines: order.lines
        .filter(
          (line) =>
            line.itemId &&
            line.item &&
            Number(line.orderedQty) -
              Number(line.receivedQty) -
              Number(line.cancelledQty) >
              0
        )
        .map((line) => ({
          id: line.id,
          lineNumber: line.lineNumber,
          description: line.description,
          outstandingQty:
            Number(line.orderedQty) -
            Number(line.receivedQty) -
            Number(line.cancelledQty),
          uomCode: line.uom.uomCode,
          requiresLot: line.item?.trackLot ?? false,
          requiresExpiry: line.item?.trackExpiry ?? false
        })),
      openLineCount: order.lines.filter(
        (line) =>
          Number(line.orderedQty) -
            Number(line.receivedQty) -
            Number(line.cancelledQty) >
          0
      ).length
    };
  });
}

export async function getGoodsReceipt(session: SessionContext, id: string) {
  await requireReceivingRead(session);

  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: {
      purchaseOrder: true,
      supplier: true,
      receivingLocation: true,
      receivedBy: true,
      reversedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          inventoryDestinationLocation: true,
          item: true,
          uom: true,
          postedMovement: {
            include: {
              reversalMovements: true
            }
          }
        }
      }
    }
  });

  if (!receipt) {
    return null;
  }
  assertAuthorizedLocation(session, receipt.receivingLocationId);

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "GoodsReceipt",
      entityId: receipt.id
    },
    orderBy: { occurredAt: "asc" }
  });
  const auditActorUserIds = auditEvents
    .map((event) => event.actorUserId)
    .filter((id): id is string => Boolean(id));
  const auditActors =
    auditActorUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(new Set(auditActorUserIds)) } },
          select: { id: true, displayName: true }
        })
      : [];
  const auditActorNames = new Map(
    auditActors.map((actor) => [actor.id, actor.displayName])
  );

  const purchaseOrderExpectedDeliveryDate = receipt.purchaseOrder.expectedDeliveryDate
    .toISOString()
    .slice(0, 10);
  const deliveryAging = classifyPurchaseOrderDeliveryAging({
    status: receipt.purchaseOrder.status,
    expectedDeliveryDate: purchaseOrderExpectedDeliveryDate,
    today: new Date().toISOString().slice(0, 10)
  });

  return {
    id: receipt.id,
    publicReference: receipt.publicReference,
    status: receipt.status,
    purchaseOrderId: receipt.purchaseOrderId,
    purchaseOrderReference: receipt.purchaseOrder.publicReference,
    purchaseOrderStatus: receipt.purchaseOrder.status,
    purchaseOrderExpectedDeliveryDate,
    purchaseOrderDeliveryAgingStatus: deliveryAging.deliveryAgingStatus,
    purchaseOrderDaysOverdue: deliveryAging.daysOverdue,
    supplierName: receipt.supplier.tradingName ?? receipt.supplier.legalName,
    receivingLocationName: receipt.receivingLocation.name,
    receivedByName: receipt.receivedBy.displayName,
    receivedAt: receipt.receivedAt.toISOString(),
    postedAt: receipt.postedAt?.toISOString() ?? null,
    reversedAt: receipt.reversedAt?.toISOString() ?? null,
    reversedByName: receipt.reversedBy?.displayName ?? null,
    reversalReason: receipt.reversalReason ?? null,
    supplierDeliveryReceiptNumber:
      receipt.supplierDeliveryReceiptNumber ?? null,
    discrepancyFlag: receipt.discrepancyFlag,
    discrepancySummary: receipt.discrepancySummary ?? null,
    notes: receipt.notes ?? null,
    lines: receipt.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      description: line.description,
      itemCode: line.item.itemCode,
      itemName: line.item.itemName,
      destinationName: line.inventoryDestinationLocation.name,
      orderedQty: Number(line.orderedQty),
      deliveredQty: Number(line.deliveredQty),
      acceptedQty: Number(line.acceptedQty),
      rejectedQty: Number(line.rejectedQty),
      damagedQty: Number(line.damagedQty),
      shortQty: Number(line.shortQty),
      uomCode: line.uom.uomCode,
      unitCost: line.unitCost ? Number(line.unitCost) : null,
      conditionStatus: line.conditionStatus,
      discrepancyType: line.discrepancyType ?? null,
      discrepancyReason: line.discrepancyReason ?? null,
      evidenceReference: line.evidenceReference ?? null,
      lotNumber: line.lotNumber ?? null,
      expiryDate: line.expiryDate?.toISOString().slice(0, 10) ?? null,
      postedMovementId: line.postedMovementId ?? null,
      reversalMovementCount: line.postedMovement?.reversalMovements.length ?? 0,
      notes: line.notes ?? null
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      actorName: event.actorUserId
        ? auditActorNames.get(event.actorUserId) ?? "Recorded user"
        : null,
      occurredAt: event.occurredAt.toISOString(),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : undefined
    }))
  };
}

export async function createGoodsReceiptFromPurchaseOrder(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.receivingCreate);
  const values = createReceiptSchema.parse(Object.fromEntries(formData));

  const order = await prisma.purchaseOrder.findFirst({
    where: {
      id: values.purchaseOrderId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId
    },
    include: {
      supplier: true,
      deliveryLocation: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      }
    }
  });

  if (!order) {
    throw new Error("PURCHASE_ORDER_NOT_FOUND");
  }
  assertAuthorizedLocation(session, order.deliveryLocationId);
  assertPurchaseOrderCanBeReceived(order.status);

  const inventoryLocation = await prisma.inventoryLocation.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      status: "ACTIVE"
    },
    orderBy: { createdAt: "asc" }
  });
  if (!inventoryLocation) {
    throw new Error("INVENTORY_LOCATION_NOT_FOUND");
  }

  const lines = order.lines.flatMap((line) => {
    if (!line.itemId || !line.item || !line.item.trackInventory) {
      return [];
    }
    const outstandingQty =
      Number(line.orderedQty) - Number(line.receivedQty) - Number(line.cancelledQty);
    if (outstandingQty <= 0) {
      return [];
    }

    const deliveredQty = Number(getLineValue(formData, line.id, "deliveredQty") ?? 0);
    const acceptedQty = Number(getLineValue(formData, line.id, "acceptedQty") ?? 0);
    const rejectedQty = Number(getLineValue(formData, line.id, "rejectedQty") ?? 0);
    const damagedQty = Number(getLineValue(formData, line.id, "damagedQty") ?? 0);
    const shortQty = Math.max(outstandingQty - deliveredQty, 0);
    const discrepancyReason = String(
      getLineValue(formData, line.id, "discrepancyReason") ?? ""
    ).trim();
    const evidenceReference = String(
      getLineValue(formData, line.id, "evidenceReference") ?? ""
    ).trim();
    validateReceivingQuantities({
      deliveredQty,
      acceptedQty,
      rejectedQty,
      damagedQty,
      shortQty,
      outstandingQty,
      discrepancyReason,
      evidenceReference
    });

    if (deliveredQty === 0 && acceptedQty === 0 && rejectedQty === 0 && damagedQty === 0) {
      return [];
    }

    return [
      {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        purchaseOrderLineId: line.id,
        inventoryDestinationLocationId: inventoryLocation.id,
        itemId: line.itemId,
        uomId: line.uomId,
        lineNumber: line.lineNumber,
        description: line.description,
        orderedQty: Number(line.orderedQty),
        deliveredQty,
        acceptedQty,
        rejectedQty,
        damagedQty,
        shortQty,
        unitCost: Number(line.unitPrice),
        conditionStatus:
          rejectedQty > 0 || damagedQty > 0 || shortQty > 0
            ? "WITH_DISCREPANCY"
            : "ACCEPTED",
        discrepancyType:
          rejectedQty > 0 || damagedQty > 0 || shortQty > 0 ? "QUANTITY_OR_CONDITION" : null,
        discrepancyReason: discrepancyReason || null,
        evidenceReference: evidenceReference || null,
        lotNumber: String(getLineValue(formData, line.id, "lotNumber") ?? "").trim() || null,
        expiryDate: getLineValue(formData, line.id, "expiryDate")
          ? new Date(String(getLineValue(formData, line.id, "expiryDate")))
          : null,
        notes: String(getLineValue(formData, line.id, "notes") ?? "").trim() || null
      }
    ];
  });

  if (lines.length === 0) {
    throw new Error("GOODS_RECEIPT_LINE_REQUIRED");
  }

  const discrepancyFlag = lines.some(
    (line) => line.rejectedQty > 0 || line.damagedQty > 0 || line.shortQty > 0
  );

  let receiptId: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const receipt = await prisma.goodsReceipt.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          publicReference: await nextGoodsReceiptReference(session.context.companyId),
          purchaseOrderId: order.id,
          supplierId: order.supplierId,
          receivingLocationId: order.deliveryLocationId,
          receivedByUserId: session.user.id,
          receivedAt: new Date(),
          supplierDeliveryReceiptNumber:
            values.supplierDeliveryReceiptNumber || null,
          discrepancyFlag,
          discrepancySummary: discrepancyFlag
            ? "One or more lines include rejected, damaged, or short quantities."
            : null,
          notes: values.notes || null,
          lines: {
            create: lines
          }
        }
      });
      receiptId = receipt.id;
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 5) {
        throw error;
      }
    }
  }
  if (!receiptId) {
    throw new Error("GOODS_RECEIPT_REFERENCE_ALLOCATION_FAILED");
  }

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: "goods_receipt.created",
      entityType: "GoodsReceipt",
      entityId: receiptId,
      afterData: { status: "DRAFT" },
      metadata: {
        purchaseOrderId: order.id,
        lineCount: lines.length,
        discrepancyFlag
      }
    }
  });

  return receiptId;
}

export async function postGoodsReceipt(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.receivingPost);
  const values = postReceiptSchema.parse(Object.fromEntries(formData));

  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: {
      purchaseOrder: {
        include: {
          lines: true
        }
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      }
    }
  });

  if (!receipt) {
    throw new Error("GOODS_RECEIPT_NOT_FOUND");
  }
  assertAuthorizedLocation(session, receipt.receivingLocationId);
  assertGoodsReceiptCanBePosted(receipt.status);
  assertPurchaseOrderCanBeReceived(receipt.purchaseOrder.status);

  await prisma.$transaction(async (tx) => {
    const claimedReceipt = await tx.goodsReceipt.updateMany({
      where: {
        id: receipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT"
      },
      data: {
        status: "POSTING"
      }
    });
    if (claimedReceipt.count !== 1) {
      throw new Error("GOODS_RECEIPT_NOT_DRAFT_FOR_POSTING");
    }

    const receivablePurchaseOrder = await tx.purchaseOrder.findFirst({
      where: {
        id: receipt.purchaseOrderId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }
      },
      select: {
        id: true,
        status: true
      }
    });
    if (!receivablePurchaseOrder) {
      throw new Error("PURCHASE_ORDER_NOT_RECEIVABLE");
    }

    for (const line of receipt.lines) {
      if (Number(line.acceptedQty) <= 0) {
        continue;
      }
      const quantityDeltaBaseUom = await getBaseQuantity({
        itemId: line.itemId,
        uomId: line.uomId,
        acceptedQty: line.acceptedQty,
        item: line.item
      });
      const { movement, duplicate } = await postInventoryMovementInTransaction(tx, session, {
        inventoryLocationId: line.inventoryDestinationLocationId,
        itemId: line.itemId,
        movementType: "RECEIPT_IN",
        occurredAt: receipt.receivedAt,
        enteredQuantity: Number(line.acceptedQty),
        enteredUomId: line.uomId,
        quantityDeltaBaseUom,
        sourceDocumentType: "GoodsReceipt",
        sourceDocumentId: receipt.id,
        sourceDocumentLineId: line.id,
        sourceEventKey: `posted:${line.id}`,
        lotNumber: line.lotNumber,
        expiryDate: line.expiryDate,
        unitCost: line.unitCost ? Number(line.unitCost) : null,
        totalCost: line.unitCost
          ? Number(line.unitCost) * Number(line.acceptedQty)
          : null,
        reasonCode: "SUPPLIER_RECEIPT",
        notes: line.notes
      });

      await tx.goodsReceiptLine.update({
        where: { id: line.id },
        data: {
          postedMovementId: movement.id
        }
      });
      if (duplicate) {
        continue;
      }
      await tx.purchaseOrderLine.update({
        where: { id: line.purchaseOrderLineId },
        data: {
          receivedQty: {
            increment: line.acceptedQty
          }
        }
      });
    }

    const refreshedPoLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: receipt.purchaseOrderId }
    });
    const fullyReceived = refreshedPoLines.every(
      (line) =>
        Number(line.receivedQty) + Number(line.cancelledQty) >= Number(line.orderedQty)
    );

    await tx.goodsReceipt.update({
      where: { id: receipt.id },
      data: {
        status: receipt.discrepancyFlag ? "POSTED_WITH_DISCREPANCY" : "POSTED",
        postedAt: new Date()
      }
    });
    const updatedPurchaseOrder = await tx.purchaseOrder.updateMany({
      where: {
        id: receipt.purchaseOrderId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }
      },
      data: {
        status: fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED"
      }
    });
    if (updatedPurchaseOrder.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_RECEIVABLE");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "goods_receipt.posted",
        entityType: "GoodsReceipt",
        entityId: receipt.id,
        beforeData: { status: "DRAFT" },
        afterData: {
          status: receipt.discrepancyFlag ? "POSTED_WITH_DISCREPANCY" : "POSTED",
          purchaseOrderStatus: fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED"
        },
        metadata: {
          purchaseOrderId: receipt.purchaseOrderId,
          lineCount: receipt.lines.length,
          discrepancyFlag: receipt.discrepancyFlag
        }
      }
    });
  });

  return receipt.purchaseOrderId;
}

export async function reverseGoodsReceipt(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.receivingReverse);
  const values = reverseReceiptSchema.parse(Object.fromEntries(formData));

  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: {
      purchaseOrder: {
        include: {
          balanceClosures: true
        }
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true,
          postedMovement: {
            include: {
              reversalMovements: true
            }
          }
        }
      }
    }
  });

  if (!receipt) {
    throw new Error("GOODS_RECEIPT_NOT_FOUND");
  }
  assertAuthorizedLocation(session, receipt.receivingLocationId);
  assertGoodsReceiptCanBeReversed(receipt.status, receipt.reversedAt);
  if (receipt.receivedByUserId === session.user.id) {
    throw new Error("GOODS_RECEIPT_SELF_REVERSAL_NOT_ALLOWED");
  }
  if (receipt.purchaseOrder.status === "CLOSED" || receipt.purchaseOrder.status === "CANCELLED") {
    throw new Error("GOODS_RECEIPT_REVERSAL_PO_CLOSED");
  }
  if (
    receipt.purchaseOrder.balanceClosures.some((closure) =>
      ["PENDING", "APPROVED"].includes(closure.status)
    )
  ) {
    throw new Error("GOODS_RECEIPT_REVERSAL_PO_CLOSURE_ACTIVE");
  }

  await prisma.$transaction(async (tx) => {
    const claimedReceipt = await tx.goodsReceipt.updateMany({
      where: {
        id: receipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["POSTED", "POSTED_WITH_DISCREPANCY"] },
        reversedAt: null
      },
      data: {
        status: "REVERSING"
      }
    });
    if (claimedReceipt.count !== 1) {
      throw new Error("GOODS_RECEIPT_NOT_POSTED_FOR_REVERSAL");
    }

    const currentPurchaseOrder = await tx.purchaseOrder.findFirst({
      where: {
        id: receipt.purchaseOrderId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { notIn: ["CLOSED", "CANCELLED"] }
      },
      include: {
        balanceClosures: true
      }
    });
    if (!currentPurchaseOrder) {
      throw new Error("GOODS_RECEIPT_REVERSAL_PO_CLOSED");
    }
    if (
      currentPurchaseOrder.balanceClosures.some((closure) =>
        ["PENDING", "APPROVED"].includes(closure.status)
      )
    ) {
      throw new Error("GOODS_RECEIPT_REVERSAL_PO_CLOSURE_ACTIVE");
    }

    const otherOpenReceiptCount = await tx.goodsReceipt.count({
      where: {
        purchaseOrderId: receipt.purchaseOrderId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { not: receipt.id },
        status: { in: ["DRAFT", "POSTING", "REVERSING"] }
      }
    });
    if (otherOpenReceiptCount > 0) {
      throw new Error("GOODS_RECEIPT_REVERSAL_OPEN_RECEIPT_EXISTS");
    }

    const originalMovementIds: string[] = [];
    const reversalMovementIds: string[] = [];

    for (const line of receipt.lines) {
      if (Number(line.acceptedQty) <= 0) {
        continue;
      }
      const original = line.postedMovement;
      if (!original) {
        throw new Error("GOODS_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_REQUIRED");
      }
      if (original.movementType !== "RECEIPT_IN") {
        throw new Error("GOODS_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_INVALID");
      }
      if (
        original.tenantId !== session.context.tenantId ||
        original.companyId !== session.context.companyId ||
        original.inventoryLocationId !== line.inventoryDestinationLocationId ||
        original.itemId !== line.itemId ||
        original.sourceDocumentType !== "GoodsReceipt" ||
        original.sourceDocumentId !== receipt.id ||
        original.sourceDocumentLineId !== line.id
      ) {
        throw new Error("GOODS_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH");
      }
      if (original.reversalMovements.length > 0) {
        throw new Error("GOODS_RECEIPT_ALREADY_REVERSED");
      }

      const quantityDeltaBaseUom = -Math.abs(Number(original.quantityDeltaBaseUom));
      const { movement } = await postInventoryMovementInTransaction(tx, session, {
        inventoryLocationId: line.inventoryDestinationLocationId,
        itemId: line.itemId,
        movementType: "REVERSAL",
        occurredAt: new Date(),
        enteredQuantity: Number(line.acceptedQty),
        enteredUomId: line.uomId,
        quantityDeltaBaseUom,
        sourceDocumentType: "GoodsReceipt",
        sourceDocumentId: receipt.id,
        sourceDocumentLineId: line.id,
        sourceEventKey: `reversed:${line.id}`,
        lotNumber: line.lotNumber,
        expiryDate: line.expiryDate,
        unitCost: line.unitCost ? Number(line.unitCost) : null,
        totalCost: line.unitCost
          ? -Math.abs(Number(line.unitCost) * Number(line.acceptedQty))
          : null,
        reasonCode: "GOODS_RECEIPT_REVERSAL",
        notes: values.reversalReason,
        reversalOfMovementId: original.id
      });

      const restoredPoLine = await tx.purchaseOrderLine.updateMany({
        where: {
          id: line.purchaseOrderLineId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          receivedQty: {
            gte: line.acceptedQty
          }
        },
        data: {
          receivedQty: {
            decrement: line.acceptedQty
          }
        }
      });
      if (restoredPoLine.count !== 1) {
        throw new Error("GOODS_RECEIPT_REVERSAL_PO_RECEIVED_QTY_INVALID");
      }

      originalMovementIds.push(original.id);
      reversalMovementIds.push(movement.id);
    }

    const refreshedPoLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: receipt.purchaseOrderId }
    });
    const nextPurchaseOrderStatus =
      calculatePurchaseOrderReceivingStatus(refreshedPoLines);

    await tx.purchaseOrder.update({
      where: { id: receipt.purchaseOrderId },
      data: {
        status: nextPurchaseOrderStatus
      }
    });

    const reversed = await tx.goodsReceipt.updateMany({
      where: {
        id: receipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "REVERSING"
      },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversedByUserId: session.user.id,
        reversalReason: values.reversalReason
      }
    });
    if (reversed.count !== 1) {
      throw new Error("GOODS_RECEIPT_REVERSAL_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "goods_receipt.reversed",
        entityType: "GoodsReceipt",
        entityId: receipt.id,
        beforeData: {
          status: receipt.status,
          purchaseOrderStatus: receipt.purchaseOrder.status
        },
        afterData: {
          status: "REVERSED",
          purchaseOrderStatus: nextPurchaseOrderStatus
        },
        metadata: {
          purchaseOrderId: receipt.purchaseOrderId,
          reversalReason: values.reversalReason,
          originalMovementIds,
          reversalMovementIds,
          lineCount: receipt.lines.length,
          discrepancyFlag: receipt.discrepancyFlag
        }
      }
    });
  });

  return receipt.purchaseOrderId;
}
