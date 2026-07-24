import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { permissions } from "./authorization";
import {
  createGoodsReceiptFromPurchaseOrder,
  postGoodsReceipt
} from "./receiving";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  goodsReceipt: {
    findFirst: vi.fn()
  }
}));

const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn()
}));

const mockAuthorization = vi.hoisted(() => ({
  requirePermission: vi.fn()
}));

const mockPrivilegedMfa = vi.hoisted(() => ({
  assertPrivilegedMfaForAction: vi.fn()
}));

const mockInventory = vi.hoisted(() => ({
  lockInventoryLocationsForPosting: vi.fn(),
  postInventoryMovementInTransaction: vi.fn()
}));

vi.mock("@ogfi/database", () => ({
  prisma: mockPrisma
}));

vi.mock("./context", async () => {
  const actual = await vi.importActual<typeof import("./context")>("./context");
  return {
    ...actual,
    requireSessionContext: mockContext.requireSessionContext
  };
});

vi.mock("./authorization", async () => {
  const actual = await vi.importActual<typeof import("./authorization")>(
    "./authorization"
  );
  return {
    ...actual,
    requirePermission: mockAuthorization.requirePermission
  };
});

vi.mock("./privilegedMfaGuard", () => ({
  assertPrivilegedMfaForAction:
    mockPrivilegedMfa.assertPrivilegedMfaForAction
}));

vi.mock("./inventory", () => ({
  lockInventoryLocationsForPosting:
    mockInventory.lockInventoryLocationsForPosting,
  postInventoryMovementInTransaction:
    mockInventory.postInventoryMovementInTransaction
}));

vi.mock("./purchaseOrders", () => ({
  classifyPurchaseOrderDeliveryAging: vi.fn(() => ({
    status: "ON_TIME",
    daysOverdue: 0
  }))
}));

const ids = {
  tenant: "00000000-0000-4000-8000-000000000101",
  company: "00000000-0000-4000-8000-000000000102",
  brand: "00000000-0000-4000-8000-000000000103",
  location: "00000000-0000-4000-8000-000000000104",
  inventoryLocation: "00000000-0000-4000-8000-000000000105",
  user: "00000000-0000-4000-8000-000000000106",
  purchaseOrder: "00000000-0000-4000-8000-000000000107",
  purchaseOrderLine: "00000000-0000-4000-8000-000000000108",
  receipt: "00000000-0000-4000-8000-000000000109",
  receiptLine: "00000000-0000-4000-8000-000000000110",
  supplier: "00000000-0000-4000-8000-000000000111",
  item: "00000000-0000-4000-8000-000000000112",
  uom: "00000000-0000-4000-8000-000000000113",
  movement: "00000000-0000-4000-8000-000000000114"
} as const;

const session = {
  user: {
    id: ids.user,
    email: "receiver@example.test",
    displayName: "Receiving Operator",
    role: "Storekeeper"
  },
  context: {
    tenantId: ids.tenant,
    companyId: ids.company,
    companyName: "OGFI Foods",
    brandId: ids.brand,
    brandName: "OGFI",
    locationId: ids.location,
    locationName: "BGC",
    locationType: "BRANCH" as const
  },
  authorizedLocations: [
    {
      tenantId: ids.tenant,
      companyId: ids.company,
      companyName: "OGFI Foods",
      brandId: ids.brand,
      brandName: "OGFI",
      locationId: ids.location,
      locationName: "BGC",
      locationType: "BRANCH" as const,
      scopeAssignmentId: "scope-1",
      accessLevel: "MANAGE"
    }
  ],
  permissionCodes: [permissions.receivingCreate, permissions.receivingPost]
};

function purchaseOrderLine(input?: {
  orderedQty?: number;
  receivedQty?: number;
  cancelledQty?: number;
}) {
  return {
    id: ids.purchaseOrderLine,
    tenantId: ids.tenant,
    companyId: ids.company,
    purchaseOrderId: ids.purchaseOrder,
    itemId: ids.item,
    uomId: ids.uom,
    lineNumber: 1,
    description: "Inventory item",
    orderedQty: input?.orderedQty ?? 10,
    receivedQty: input?.receivedQty ?? 0,
    cancelledQty: input?.cancelledQty ?? 0,
    unitPrice: 5,
    item: {
      id: ids.item,
      trackInventory: true,
      baseUomId: ids.uom
    },
    uom: {
      id: ids.uom,
      uomCode: "EA"
    }
  };
}

function purchaseOrder(input?: {
  status?: string;
  orderedQty?: number;
  receivedQty?: number;
  cancelledQty?: number;
}) {
  return {
    id: ids.purchaseOrder,
    tenantId: ids.tenant,
    companyId: ids.company,
    supplierId: ids.supplier,
    deliveryLocationId: ids.location,
    status: input?.status ?? "ISSUED",
    supplier: { id: ids.supplier },
    deliveryLocation: { id: ids.location },
    lines: [purchaseOrderLine(input)]
  };
}

function goodsReceipt(input?: {
  status?: string;
  acceptedQty?: number;
  deliveredQty?: number;
  shortQty?: number;
}) {
  const shortQty = input?.shortQty ?? 0;
  return {
    id: ids.receipt,
    tenantId: ids.tenant,
    companyId: ids.company,
    purchaseOrderId: ids.purchaseOrder,
    receivingLocationId: ids.location,
    receivedByUserId: ids.user,
    receivedAt: new Date("2026-07-22T00:00:00.000Z"),
    status: input?.status ?? "DRAFT",
    discrepancyFlag: shortQty > 0,
    discrepancySummary:
      shortQty > 0 ? "One or more lines include discrepancies." : null,
    purchaseOrder: purchaseOrder({ status: "PARTIALLY_RECEIVED" }),
    lines: [
      {
        id: ids.receiptLine,
        purchaseOrderLineId: ids.purchaseOrderLine,
        inventoryDestinationLocationId: ids.inventoryLocation,
        itemId: ids.item,
        uomId: ids.uom,
        lineNumber: 1,
        orderedQty: 10,
        deliveredQty: input?.deliveredQty ?? input?.acceptedQty ?? 1,
        acceptedQty: input?.acceptedQty ?? 1,
        rejectedQty: 0,
        damagedQty: 0,
        shortQty,
        conditionStatus: shortQty > 0 ? "WITH_DISCREPANCY" : "ACCEPTED",
        discrepancyType: shortQty > 0 ? "QUANTITY_OR_CONDITION" : null,
        discrepancyReason: shortQty > 0 ? "Supplier delivered short" : null,
        evidenceReference: shortQty > 0 ? "photo-short" : null,
        unitCost: 5,
        lotNumber: null,
        expiryDate: null,
        notes: null,
        item: {
          id: ids.item,
          baseUomId: ids.uom
        },
        uom: {
          id: ids.uom,
          uomCode: "EA"
        }
      }
    ]
  };
}

function makeQueryRaw(input?: {
  permissionGranted?: boolean;
  scopeGranted?: boolean;
  userStatus?: string;
  strictMfa?: boolean;
  verifiedMfa?: boolean;
}) {
  return vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join(" ");
    if (sql.includes('FROM "PurchaseOrder" po')) {
      return [{ id: ids.purchaseOrder }];
    }
    if (sql.includes('FROM "PurchaseOrderLine" pol')) {
      return [{ id: ids.purchaseOrderLine }];
    }
    if (sql.includes('DocumentNumberSequence')) {
      return [{ nextValue: 1 }];
    }
    if (sql.includes('FROM "GoodsReceipt" gr')) {
      return [{ id: ids.receipt }];
    }
    if (sql.includes('FROM "User"')) {
      return [{ status: input?.userStatus ?? "ACTIVE", privilegeEpoch: 0 }];
    }
    if (sql.includes('FROM "UserRoleAssignment"')) {
      return input?.permissionGranted === false ? [] : [{ id: "role-1" }];
    }
    if (sql.includes('FROM "UserScopeAssignment"')) {
      return input?.scopeGranted === false ? [] : [{ id: "scope-1" }];
    }
    if (sql.includes('FROM "CompanyPolicySetting"')) {
      return input?.strictMfa
        ? [{ value: "enforce_all_sensitive", status: "ACTIVE" }]
        : [];
    }
    if (sql.includes('FROM "PrivilegedMfaEnrollment"')) {
      return input?.verifiedMfa ? [{ id: "mfa-1" }] : [];
    }
    return [];
  });
}

function createReceiptForm(input?: { deliveredQty?: number; acceptedQty?: number }) {
  const formData = new FormData();
  formData.set("purchaseOrderId", ids.purchaseOrder);
  formData.set("idempotencyKey", `receiving-test-${randomUUID()}`);
  formData.set(
    `line.${ids.purchaseOrderLine}.deliveredQty`,
    String(input?.deliveredQty ?? 10)
  );
  formData.set(
    `line.${ids.purchaseOrderLine}.acceptedQty`,
    String(input?.acceptedQty ?? 10)
  );
  formData.set(`line.${ids.purchaseOrderLine}.rejectedQty`, "0");
  formData.set(`line.${ids.purchaseOrderLine}.damagedQty`, "0");
  return formData;
}

function postReceiptForm() {
  const formData = new FormData();
  formData.set("id", ids.receipt);
  return formData;
}

function makeCreateTransaction(input?: {
  order?: ReturnType<typeof purchaseOrder>;
  auditFailure?: Error;
  permissionGranted?: boolean;
  scopeGranted?: boolean;
}) {
  return {
    $queryRaw: makeQueryRaw(input),
    $executeRaw: vi.fn().mockResolvedValue(0),
    purchaseOrder: {
      findFirst: vi.fn().mockResolvedValue(input?.order ?? purchaseOrder())
    },
    inventoryLocation: {
      findFirst: vi.fn().mockResolvedValue({ id: ids.inventoryLocation })
    },
    goodsReceipt: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: ids.receipt })
    },
    auditEvent: {
      create: input?.auditFailure
        ? vi.fn().mockRejectedValue(input.auditFailure)
        : vi.fn().mockResolvedValue({ id: "audit-event" })
    }
  };
}

function makePostTransaction(input?: {
  order?: ReturnType<typeof purchaseOrder>;
  receipt?: ReturnType<typeof goodsReceipt>;
  claimCount?: number;
  permissionGranted?: boolean;
  scopeGranted?: boolean;
  strictMfa?: boolean;
  verifiedMfa?: boolean;
}) {
  const liveOrder =
    input?.order ??
    purchaseOrder({ status: "PARTIALLY_RECEIVED", receivedQty: 9 });
  const liveReceipt = input?.receipt ?? goodsReceipt();
  return {
    $queryRaw: makeQueryRaw(input),
    purchaseOrder: {
      findFirst: vi.fn().mockResolvedValue(liveOrder),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    purchaseOrderLine: {
      update: vi.fn().mockResolvedValue({ id: ids.purchaseOrderLine }),
      findMany: vi.fn().mockResolvedValue([
        purchaseOrderLine({ orderedQty: 10, receivedQty: 10 })
      ])
    },
    goodsReceipt: {
      findFirst: vi.fn().mockResolvedValue(liveReceipt),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: input?.claimCount ?? 1 }),
      update: vi.fn().mockResolvedValue({ id: ids.receipt })
    },
    goodsReceiptLine: {
      update: vi.fn().mockResolvedValue({ id: ids.receiptLine })
    },
    itemUomConversion: {
      findFirst: vi.fn()
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit-event" })
    }
  };
}

describe("receiving Purchase Order serialization", () => {
  const inventoryLocationLock = Object.freeze({ locked: true });

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.requireSessionContext.mockResolvedValue(session);
    mockAuthorization.requirePermission.mockResolvedValue(undefined);
    mockPrivilegedMfa.assertPrivilegedMfaForAction.mockResolvedValue(undefined);
    mockInventory.lockInventoryLocationsForPosting.mockResolvedValue(
      inventoryLocationLock
    );
    mockInventory.postInventoryMovementInTransaction.mockResolvedValue({
      movement: { id: ids.movement },
      duplicate: false
    });
    mockPrisma.goodsReceipt.findFirst.mockResolvedValue(goodsReceipt());
  });

  it("locks the scoped PO and its ordered lines before atomically creating and auditing the receipt", async () => {
    const tx = makeCreateTransaction();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      createGoodsReceiptFromPurchaseOrder(createReceiptForm())
    ).resolves.toBe(ids.receipt);

    const poLockSql = tx.$queryRaw.mock.calls[0]?.[0].join(" ");
    const lineLockSql = tx.$queryRaw.mock.calls[1]?.[0].join(" ");
    const referenceAllocationSql = tx.$queryRaw.mock.calls
      .map((call) => call[0].join(" "))
      .find((sql) => sql.includes("DocumentNumberSequence"));
    expect(poLockSql).toContain('FROM "PurchaseOrder" po');
    expect(poLockSql).toContain('po."tenantId"');
    expect(poLockSql).toContain('po."companyId"');
    expect(poLockSql).toContain('po."deliveryLocationId"');
    expect(poLockSql).toContain("FOR UPDATE OF po");
    expect(lineLockSql).toContain('FROM "PurchaseOrderLine" pol');
    expect(lineLockSql).toContain(
      'ORDER BY pol."lineNumber" ASC, pol.id ASC'
    );
    expect(lineLockSql).toContain("FOR UPDATE OF pol");
    expect(referenceAllocationSql).toContain("DocumentNumberSequence");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.goodsReceipt.create.mock.invocationCallOrder[0] ?? 0
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.goodsReceipt.create.mock.invocationCallOrder[0] ?? 0
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "goods_receipt.created",
          entityId: ids.receipt
        })
      })
    );
  });

  it("revalidates current outstanding quantity under the PO lock before creating", async () => {
    const tx = makeCreateTransaction({
      order: purchaseOrder({ orderedQty: 10, receivedQty: 8 })
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      createGoodsReceiptFromPurchaseOrder(
        createReceiptForm({ deliveredQty: 3, acceptedQty: 3 })
      )
    ).rejects.toThrow("RECEIVING_LINE_EXCEEDS_OUTSTANDING");

    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects receipt creation when live permission is revoked after PO locking", async () => {
    const tx = makeCreateTransaction({ permissionGranted: false });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      createGoodsReceiptFromPurchaseOrder(createReceiptForm())
    ).rejects.toThrow("PERMISSION_DENIED");

    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects receipt creation when live location scope is revoked after PO locking", async () => {
    const tx = makeCreateTransaction({ scopeGranted: false });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      createGoodsReceiptFromPurchaseOrder(createReceiptForm())
    ).rejects.toThrow("SCOPE_DENIED");

    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("does not complete receipt creation when its audit write fails in the transaction", async () => {
    const auditFailure = new Error("AUDIT_WRITE_FAILED");
    const tx = makeCreateTransaction({ auditFailure });
    let committed = false;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback(tx);
      committed = true;
      return result;
    });

    await expect(
      createGoodsReceiptFromPurchaseOrder(createReceiptForm())
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(tx.goodsReceipt.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(committed).toBe(false);
  });

  it("locks PO then PO lines then receipt, and posts accepted stock with a deterministic source key", async () => {
    const tx = makePostTransaction();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(postGoodsReceipt(postReceiptForm())).resolves.toBe(
      ids.purchaseOrder
    );

    expect(tx.$queryRaw.mock.calls[0]?.[0].join(" ")).toContain(
      'FROM "PurchaseOrder" po'
    );
    expect(tx.$queryRaw.mock.calls[1]?.[0].join(" ")).toContain(
      'FROM "PurchaseOrderLine" pol'
    );
    expect(tx.$queryRaw.mock.calls[2]?.[0].join(" ")).toContain(
      'FROM "GoodsReceipt" gr'
    );
    expect(
      mockInventory.lockInventoryLocationsForPosting
    ).toHaveBeenCalledWith(tx, session, [ids.inventoryLocation]);
    expect(
      mockInventory.lockInventoryLocationsForPosting.mock.invocationCallOrder[0]
    ).toBeLessThan(tx.$queryRaw.mock.invocationCallOrder[0] ?? 0);
    expect(tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      tx.goodsReceipt.updateMany.mock.invocationCallOrder[0] ?? 0
    );
    expect(
      mockInventory.postInventoryMovementInTransaction
    ).toHaveBeenCalledWith(
      tx,
      session,
      inventoryLocationLock,
      expect.objectContaining({
        movementType: "RECEIPT_IN",
        sourceDocumentId: ids.receipt,
        sourceDocumentLineId: ids.receiptLine,
        sourceEventKey: `posted:${ids.receiptLine}`
      })
    );
    expect(tx.purchaseOrderLine.update).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a PO closed while posting waited and creates no movement", async () => {
    const tx = makePostTransaction({
      order: purchaseOrder({ status: "CLOSED", receivedQty: 5 })
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(postGoodsReceipt(postReceiptForm())).rejects.toThrow(
      "PURCHASE_ORDER_NOT_RECEIVABLE"
    );

    expect(tx.goodsReceipt.updateMany).not.toHaveBeenCalled();
    expect(
      mockInventory.postInventoryMovementInTransaction
    ).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects stale draft quantities that exceed live locked PO outstanding quantity", async () => {
    const tx = makePostTransaction({
      order: purchaseOrder({
        status: "PARTIALLY_RECEIVED",
        orderedQty: 10,
        receivedQty: 9
      }),
      receipt: goodsReceipt({ acceptedQty: 2 })
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(postGoodsReceipt(postReceiptForm())).rejects.toThrow(
      "RECEIVING_LINE_EXCEEDS_OUTSTANDING"
    );

    expect(tx.goodsReceipt.updateMany).not.toHaveBeenCalled();
    expect(
      mockInventory.postInventoryMovementInTransaction
    ).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects stale short-discrepancy fields derived from an earlier outstanding quantity", async () => {
    const tx = makePostTransaction({
      order: purchaseOrder({
        status: "PARTIALLY_RECEIVED",
        orderedQty: 10,
        receivedQty: 5
      }),
      receipt: goodsReceipt({ acceptedQty: 5, deliveredQty: 5, shortQty: 5 })
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(postGoodsReceipt(postReceiptForm())).rejects.toThrow(
      "GOODS_RECEIPT_DISCREPANCY_CONFLICT"
    );

    expect(tx.goodsReceipt.updateMany).not.toHaveBeenCalled();
    expect(
      mockInventory.postInventoryMovementInTransaction
    ).not.toHaveBeenCalled();
    expect(tx.purchaseOrderLine.update).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects posting when live permission is revoked after receipt locking", async () => {
    const tx = makePostTransaction({ permissionGranted: false });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(postGoodsReceipt(postReceiptForm())).rejects.toThrow(
      "PERMISSION_DENIED"
    );

    expect(tx.goodsReceipt.updateMany).not.toHaveBeenCalled();
    expect(
      mockInventory.postInventoryMovementInTransaction
    ).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects posting when live location scope is revoked after receipt locking", async () => {
    const tx = makePostTransaction({ scopeGranted: false });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(postGoodsReceipt(postReceiptForm())).rejects.toThrow(
      "SCOPE_DENIED"
    );

    expect(tx.goodsReceipt.updateMany).not.toHaveBeenCalled();
    expect(
      mockInventory.postInventoryMovementInTransaction
    ).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects posting when strict privileged-MFA evidence is revoked after receipt locking", async () => {
    const tx = makePostTransaction({ strictMfa: true, verifiedMfa: false });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(postGoodsReceipt(postReceiptForm())).rejects.toThrow(
      "PRIVILEGED_MFA_REQUIRED"
    );

    expect(tx.goodsReceipt.updateMany).not.toHaveBeenCalled();
    expect(
      mockInventory.postInventoryMovementInTransaction
    ).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("fails with the stable receipt CAS error before any stock or PO mutation", async () => {
    const tx = makePostTransaction({ claimCount: 0 });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(postGoodsReceipt(postReceiptForm())).rejects.toThrow(
      "GOODS_RECEIPT_NOT_DRAFT_FOR_POSTING"
    );

    expect(
      mockInventory.postInventoryMovementInTransaction
    ).not.toHaveBeenCalled();
    expect(tx.purchaseOrderLine.update).not.toHaveBeenCalled();
    expect(tx.purchaseOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
