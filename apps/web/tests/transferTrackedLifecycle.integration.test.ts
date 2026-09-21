import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "../src/server/services/context";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const databaseEnabled =
  process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";

const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn(),
}));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/context")
  >("../src/server/services/context");
  return { ...actual, requireSessionContext: mockContext.requireSessionContext };
});

vi.mock("../src/server/services/authorization", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/authorization")
  >("../src/server/services/authorization");
  return { ...actual, requirePermission: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../src/server/services/privilegedMfaGuard", () => ({
  assertPrivilegedMfaForAction: vi.fn().mockResolvedValue(undefined),
}));

describe.skipIf(!databaseEnabled).sequential("tracked transfer service lifecycle", () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    assertDisposableAuthorizationDatabaseConfigured(process.env);
    ({ prisma } = await import("@ogfi/database"));
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  it("preserves an explicit lot/expiry through service creation, dispatch, receipt, replay, and reversal", async () => {
      const suffix = randomUUID().slice(0, 8);
      const ids = {
        tenant: randomUUID(),
        company: randomUUID(),
        sourceLocation: randomUUID(),
        destinationLocation: randomUUID(),
        sourceInventoryLocation: randomUUID(),
        destinationInventoryLocation: randomUUID(),
        receiver: randomUUID(),
        dispatcher: randomUUID(),
        reverser: randomUUID(),
        role: randomUUID(),
        uom: randomUUID(),
        category: randomUUID(),
        item: randomUUID(),
        transfer: randomUUID(),
        line: randomUUID(),
        line2: randomUUID(),
        authSession: randomUUID(),
        reverseAuthSession: randomUUID(),
      };
      const now = new Date();
      const permissions = await prisma.permission.findMany({
        where: { code: { in: ["inventory.transfer.create", "inventory.transfer.submit", "inventory.transfer.dispatch", "inventory.transfer.receive", "inventory.transfer.receipt.reverse"] } },
        select: { id: true, code: true },
      });
      expect(permissions).toHaveLength(5);
      await prisma.tenant.create({
        data: { id: ids.tenant, name: `Receipt Acceptance ${suffix}`, loginCode: `ra-${suffix}` },
      });
      await prisma.company.create({
        data: { id: ids.company, tenantId: ids.tenant, code: `RA-${suffix}`, legalName: `Receipt Acceptance ${suffix}`, currencyCode: "PHP" },
      });
      await prisma.location.createMany({
        data: [
          { id: ids.sourceLocation, tenantId: ids.tenant, companyId: ids.company, locationType: "BRANCH", code: `RA-S-${suffix}`, name: "Receipt Source" },
          { id: ids.destinationLocation, tenantId: ids.tenant, companyId: ids.company, locationType: "BRANCH", code: `RA-D-${suffix}`, name: "Receipt Destination" },
        ],
      });
      await prisma.inventoryLocation.createMany({
        data: [
          { id: ids.sourceInventoryLocation, tenantId: ids.tenant, companyId: ids.company, locationId: ids.sourceLocation, code: `RA-IS-${suffix}`, name: "Receipt Source Stock", status: "ACTIVE" },
          { id: ids.destinationInventoryLocation, tenantId: ids.tenant, companyId: ids.company, locationId: ids.destinationLocation, code: `RA-ID-${suffix}`, name: "Receipt Destination Stock", status: "ACTIVE" },
        ],
      });
      await prisma.uom.create({
        data: { id: ids.uom, tenantId: ids.tenant, companyId: ids.company, uomCode: `EA-${suffix}`, uomName: "Each", uomType: "COUNT" },
      });
      await prisma.itemCategory.create({
        data: { id: ids.category, tenantId: ids.tenant, companyId: ids.company, categoryCode: `RA-C-${suffix}`, categoryName: "Receipt Acceptance", inventoryClass: "STOCK" },
      });
      await prisma.item.create({
        data: { id: ids.item, tenantId: ids.tenant, companyId: ids.company, itemCode: `RA-I-${suffix}`, itemName: "Receipt Acceptance Item", itemCategoryId: ids.category, itemType: "INVENTORY", baseUomId: ids.uom, purchaseUomId: ids.uom, issueUomId: ids.uom, trackInventory: true, trackLot: true, trackExpiry: true },
      });
      await prisma.user.createMany({
        data: [
          { id: ids.receiver, tenantId: ids.tenant, email: `receiver-${suffix}@example.test`, displayName: "Receipt Receiver", status: "ACTIVE", privilegeEpoch: 0 },
          { id: ids.dispatcher, tenantId: ids.tenant, email: `dispatcher-${suffix}@example.test`, displayName: "Receipt Dispatcher", status: "ACTIVE", privilegeEpoch: 0 },
          { id: ids.reverser, tenantId: ids.tenant, email: `reverser-${suffix}@example.test`, displayName: "Receipt Reverser", status: "ACTIVE", privilegeEpoch: 0 },
        ],
      });
      await prisma.role.create({
        data: {
          id: ids.role,
          tenantId: ids.tenant,
          code: `RA-ROLE-${suffix}`,
          name: "Receipt Acceptance Receiver",
          permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) },
        },
      });
      await prisma.userRoleAssignment.create({ data: { userId: ids.receiver, roleId: ids.role } });
      await prisma.userRoleAssignment.create({ data: { userId: ids.reverser, roleId: ids.role } });
      await prisma.userScopeAssignment.create({
        data: { userId: ids.receiver, scopeType: "LOCATION", scopeId: ids.destinationLocation, accessLevel: "MANAGE" },
      });
      await prisma.userScopeAssignment.create({
        data: { userId: ids.reverser, scopeType: "LOCATION", scopeId: ids.destinationLocation, accessLevel: "MANAGE" },
      });
      await prisma.authSession.create({
        data: {
          id: ids.authSession,
          tenantId: ids.tenant,
          userId: ids.receiver,
          tokenHash: `ra-token-${suffix}`,
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: now,
          privilegeEpochAtIssue: 0,
          idleExpiresAt: new Date(now.getTime() + 30 * 60_000),
          absoluteExpiresAt: new Date(now.getTime() + 60 * 60_000),
        },
      });
      await prisma.authSession.create({
        data: {
          id: ids.reverseAuthSession,
          tenantId: ids.tenant,
          userId: ids.reverser,
          tokenHash: `ra-reverse-token-${suffix}`,
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: now,
          privilegeEpochAtIssue: 0,
          idleExpiresAt: new Date(now.getTime() + 30 * 60_000),
          absoluteExpiresAt: new Date(now.getTime() + 60 * 60_000),
        },
      });
      const session: SessionContext = {
        user: { id: ids.receiver, email: `receiver-${suffix}@example.test`, displayName: "Receipt Receiver", role: "Receipt Acceptance Receiver" },
        context: { tenantId: ids.tenant, companyId: ids.company, companyName: `Receipt Acceptance ${suffix}`, brandId: "", brandName: "Company-wide", locationId: ids.destinationLocation, locationName: "Receipt Destination", locationType: "BRANCH" },
        authorizedLocations: [{ tenantId: ids.tenant, companyId: ids.company, companyName: `Receipt Acceptance ${suffix}`, brandId: "", brandName: "Company-wide", locationId: ids.destinationLocation, locationName: "Receipt Destination", locationType: "BRANCH", scopeAssignmentId: `ra-scope-${suffix}`, accessLevel: "MANAGE" }],
        permissionCodes: ["inventory.transfer.create", "inventory.transfer.submit", "inventory.transfer.dispatch", "inventory.transfer.receive", "inventory.transfer.receipt.reverse"],
        authentication: { sessionId: ids.authSession, assuranceLevel: "MFA", mfaAuthenticatedAt: now, absoluteExpiresAt: new Date(now.getTime() + 60 * 60_000) },
      };

    const dispatcherSessionId = randomUUID();
    await prisma.userRoleAssignment.create({ data: { userId: ids.dispatcher, roleId: ids.role } });
    await prisma.userScopeAssignment.create({ data: { userId: ids.dispatcher, scopeType: "LOCATION", scopeId: ids.sourceLocation, accessLevel: "MANAGE" } });
    await prisma.authSession.create({ data: { id: dispatcherSessionId, tenantId: ids.tenant, userId: ids.dispatcher, tokenHash: `dispatch-token-${suffix}`, status: "ACTIVE", assuranceLevel: "MFA", mfaAuthenticatedAt: now, privilegeEpochAtIssue: 0, idleExpiresAt: new Date(now.getTime() + 3600000), absoluteExpiresAt: new Date(now.getTime() + 3600000) } });
    const dispatcher: SessionContext = {
      ...session, user: { ...session.user, id: ids.dispatcher },
      context: { ...session.context, locationId: ids.sourceLocation },
      authorizedLocations: [{ ...session.authorizedLocations[0]!, locationId: ids.sourceLocation }],
      authentication: { ...session.authentication!, sessionId: dispatcherSessionId }
    };
    const previousAuthMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = "local";
    try {
      const inventory = await import("../src/server/services/inventory");
      const transfers = await import("../src/server/services/transfers");
      const expiryDate = new Date("2027-12-31T00:00:00Z");
      // Seed source stock through the ordinary ledger writer, never a balance edit.
      await prisma.$transaction(async (tx) => {
        const lock = await inventory.lockInventoryLocationsForPosting(tx, dispatcher, [ids.sourceInventoryLocation]);
        await inventory.postInventoryMovementInTransaction(tx, dispatcher, lock, {
          inventoryLocationId: ids.sourceInventoryLocation, itemId: ids.item, movementType: "RECEIPT_IN", occurredAt: now,
          enteredQuantity: 5, enteredUomId: ids.uom, quantityDeltaBaseUom: 5,
          sourceDocumentType: "TEST_RECEIVING_FIXTURE", sourceDocumentId: randomUUID(), sourceEventKey: "source-stock",
          lotNumber: "LOT-TRACKED", expiryDate
        });
      });
      mockContext.requireSessionContext.mockResolvedValue(session);
      const create = new FormData();
      create.set("sourceInventoryLocationId", ids.sourceInventoryLocation);
      create.set("transferType", "BRANCH_TO_BRANCH"); create.set("purpose", "Tracked stock service lifecycle");
      create.set("lineItemId", ids.item); create.set("lineRequestedQty", "2");
      await expect(transfers.createInventoryTransfer(create)).rejects.toThrow("INVENTORY_LOT_REQUIRED");
      create.set("lineLotNumber", "LOT-TRACKED");
      await expect(transfers.createInventoryTransfer(create)).rejects.toThrow("INVENTORY_EXPIRY_REQUIRED");
      create.set("lineExpiryDate", "2027-12-31");
      const transferId = await transfers.createInventoryTransfer(create);
      const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId }, include: { lines: true } });
      expect(transfer.lines[0]).toMatchObject({ lotNumber: "LOT-TRACKED", expiryDate });
      const action = new FormData(); action.set("id", transferId);
      await transfers.submitInventoryTransfer(action);
      mockContext.requireSessionContext.mockResolvedValue(dispatcher);
      await transfers.dispatchInventoryTransfer(action);
      await transfers.dispatchInventoryTransfer(action);
      expect(await prisma.inventoryMovement.count({ where: { sourceDocumentId: transferId, movementType: "TRANSFER_OUT" } })).toBe(1);
      mockContext.requireSessionContext.mockResolvedValue(session);
      const receive = new FormData(); receive.set("id", transferId); receive.set("idempotencyKey", `tracked-receipt-${suffix}`);
      receive.set(`lines.${transfer.lines[0]!.id}.acceptedQty`, "2");
      await transfers.receiveInventoryTransfer(receive); await transfers.receiveInventoryTransfer(receive);
      const receipt = await prisma.inventoryTransferReceipt.findFirstOrThrow({ where: { inventoryTransferId: transferId } });
      expect(await prisma.inventoryMovement.count({ where: { sourceDocumentId: transferId, movementType: "TRANSFER_IN" } })).toBe(1);
      mockContext.requireSessionContext.mockResolvedValue({ ...session, user: { ...session.user, id: ids.reverser }, authentication: { ...session.authentication!, sessionId: ids.reverseAuthSession } });
      const reverse = new FormData(); reverse.set("id", transferId); reverse.set("receiptId", receipt.id); reverse.set("reversalReason", "Correct tracked receipt evidence");
      await transfers.reverseInventoryTransferReceipt(reverse);
      const movements = await prisma.inventoryMovement.findMany({ where: { sourceDocumentId: transferId } });
      expect(movements).toHaveLength(3);
      expect(movements.every((movement) => movement.lotNumber === "LOT-TRACKED" && movement.expiryDate?.getTime() === expiryDate.getTime())).toBe(true);
      const sourceBalance = await prisma.inventoryBalance.findFirstOrThrow({ where: { inventoryLocationId: ids.sourceInventoryLocation, itemId: ids.item } });
      const destinationBalance = await prisma.inventoryBalance.findFirstOrThrow({ where: { inventoryLocationId: ids.destinationInventoryLocation, itemId: ids.item } });
      expect(Number(sourceBalance.qtyOnHand)).toBe(3);
      expect(Number(destinationBalance.qtyOnHand)).toBe(0);
      expect(await prisma.auditEvent.count({ where: { entityId: transferId, eventType: "inventory_transfer.receipt_reversed" } })).toBe(1);
    } finally { if (previousAuthMode === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = previousAuthMode; }
  }, 60_000);
});
