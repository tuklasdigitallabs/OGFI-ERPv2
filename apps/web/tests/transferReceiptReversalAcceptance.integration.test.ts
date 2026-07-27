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

describe.skipIf(!databaseEnabled).sequential(
  "transfer receipt/reversal PostgreSQL acceptance prerequisites",
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(
        process.env,
      );
      const database = await import("@ogfi/database");
      ({ prisma } = database);
      await prisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
      const identity = await prisma.$queryRaw<
        Array<{ currentDatabase: string }>
      >`SELECT current_database() AS "currentDatabase"`;
      expect(identity).toEqual([{ currentDatabase: expectedDatabase }]);
    });

    // Migration names, completion, and checksums are attested by the
    // disposable runner through its migrator connection. The application
    // runtime role is intentionally denied access to _prisma_migrations.

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("has a validated pair-coherence check and scoped replay uniqueness", async () => {
      const constraints = await prisma.$queryRaw<
        Array<{ convalidated: boolean; definition: string }>
      >`
        SELECT convalidated,
               pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
         WHERE conname = 'InventoryTransferReceipt_idempotency_pair_check'
           AND conrelid = '"InventoryTransferReceipt"'::regclass
      `;
      expect(constraints).toHaveLength(1);
      expect(constraints[0]?.convalidated).toBe(true);
      const definition = constraints[0]?.definition ?? "";
      expect(definition).toContain('"idempotencyKey" IS NULL');
      expect(definition).toContain('"idempotencyRequestHash" IS NULL');
      expect(definition).toContain('"idempotencyKey" IS NOT NULL');
      expect(definition).toContain('"idempotencyRequestHash" IS NOT NULL');
      expect(definition).toContain('btrim(("idempotencyRequestHash")::text)');
      expect(definition).toContain("^[0-9a-f]{64}$");

      const uniqueIndexes = await prisma.$queryRaw<
        Array<{ indexName: string; definition: string }>
      >`
        SELECT indexrelid::regclass::text AS "indexName",
               pg_get_indexdef(indexrelid) AS definition
          FROM pg_index
         WHERE indrelid = '"InventoryTransferReceipt"'::regclass
           AND indisunique
      `;
      const scopedReplayIndexes = uniqueIndexes.filter(
        ({ definition }) =>
          /^CREATE UNIQUE INDEX/i.test(definition) &&
          definition.includes('"tenantId"') &&
          definition.includes('"companyId"') &&
          definition.includes('"idempotencyKey"'),
      );
      expect(scopedReplayIndexes).toHaveLength(1);
    });

    it("posts one receipt, replays the exact request, and rejects a same-key conflict", async () => {
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
        role: randomUUID(),
        uom: randomUUID(),
        category: randomUUID(),
        item: randomUUID(),
        transfer: randomUUID(),
        line: randomUUID(),
        authSession: randomUUID(),
      };
      const now = new Date();
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: "inventory.transfer.receive" },
        select: { id: true },
      });
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
        data: { id: ids.item, tenantId: ids.tenant, companyId: ids.company, itemCode: `RA-I-${suffix}`, itemName: "Receipt Acceptance Item", itemCategoryId: ids.category, itemType: "INVENTORY", baseUomId: ids.uom, purchaseUomId: ids.uom, issueUomId: ids.uom, trackInventory: true },
      });
      await prisma.user.createMany({
        data: [
          { id: ids.receiver, tenantId: ids.tenant, email: `receiver-${suffix}@example.test`, displayName: "Receipt Receiver", status: "ACTIVE", privilegeEpoch: 0 },
          { id: ids.dispatcher, tenantId: ids.tenant, email: `dispatcher-${suffix}@example.test`, displayName: "Receipt Dispatcher", status: "ACTIVE", privilegeEpoch: 0 },
        ],
      });
      await prisma.role.create({
        data: {
          id: ids.role,
          tenantId: ids.tenant,
          code: `RA-ROLE-${suffix}`,
          name: "Receipt Acceptance Receiver",
          permissions: { create: { permissionId: permission.id } },
        },
      });
      await prisma.userRoleAssignment.create({ data: { userId: ids.receiver, roleId: ids.role } });
      await prisma.userScopeAssignment.create({
        data: { userId: ids.receiver, scopeType: "LOCATION", scopeId: ids.destinationLocation, accessLevel: "MANAGE" },
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
      const createdTransfer = await prisma.inventoryTransfer.create({
        data: {
          id: ids.transfer,
          tenantId: ids.tenant,
          companyId: ids.company,
          publicReference: `RA-TR-${suffix}`,
          sourceLocationId: ids.sourceLocation,
          destinationLocationId: ids.destinationLocation,
          requestedByUserId: ids.dispatcher,
          transferType: "BRANCH_REPLENISHMENT",
          purpose: "Receipt acceptance behavior",
          status: "DISPATCHED",
          dispatchedByUserId: ids.dispatcher,
          lines: {
            create: {
              id: ids.line,
              tenantId: ids.tenant,
              companyId: ids.company,
              sourceInventoryLocationId: ids.sourceInventoryLocation,
              destinationInventoryLocationId: ids.destinationInventoryLocation,
              itemId: ids.item,
              uomId: ids.uom,
              lineNumber: 1,
              description: "Receipt acceptance line",
              requestedQty: 2,
              approvedQty: 2,
              preparedQty: 2,
              dispatchedQty: 2,
            },
          },
        },
        include: { lines: true },
      });
      const lineId = createdTransfer.lines[0]?.id ?? ids.line;

      const session: SessionContext = {
        user: { id: ids.receiver, email: `receiver-${suffix}@example.test`, displayName: "Receipt Receiver", role: "Receipt Acceptance Receiver" },
        context: { tenantId: ids.tenant, companyId: ids.company, companyName: `Receipt Acceptance ${suffix}`, brandId: "", brandName: "Company-wide", locationId: ids.destinationLocation, locationName: "Receipt Destination", locationType: "BRANCH" },
        authorizedLocations: [{ tenantId: ids.tenant, companyId: ids.company, companyName: `Receipt Acceptance ${suffix}`, brandId: "", brandName: "Company-wide", locationId: ids.destinationLocation, locationName: "Receipt Destination", locationType: "BRANCH", scopeAssignmentId: `ra-scope-${suffix}`, accessLevel: "MANAGE" }],
        permissionCodes: ["inventory.transfer.receive"],
        authentication: { sessionId: ids.authSession, assuranceLevel: "MFA", mfaAuthenticatedAt: now, absoluteExpiresAt: new Date(now.getTime() + 60 * 60_000) },
      };
      const previousAuthMode = process.env.AUTH_MODE;
      process.env.AUTH_MODE = "local";
      mockContext.requireSessionContext.mockResolvedValue(session);
      try {
        const { receiveInventoryTransfer } = await import("../src/server/services/transfers");
        const form = (acceptedQty: string) => {
          const value = new FormData();
          value.set("id", ids.transfer);
          value.set("idempotencyKey", `receipt-replay-${suffix}`);
          value.set(`lines.${lineId}.acceptedQty`, acceptedQty);
          value.set(`lines.${lineId}.rejectedQty`, "0");
          value.set(`lines.${lineId}.damagedQty`, "0");
          value.set(`lines.${lineId}.discrepancyQty`, "0");
          return value;
        };
        const concurrentResults = await Promise.allSettled([
          receiveInventoryTransfer(form("2")),
          receiveInventoryTransfer(form("2")),
        ]);
        expect(concurrentResults.every(({ status }) => status === "fulfilled")).toBe(true);
        const first = await prisma.inventoryTransferReceipt.findFirstOrThrow({ where: { inventoryTransferId: ids.transfer } });
        expect(first.status).toBe("POSTED");
        const receiptLine = await prisma.inventoryTransferReceiptLine.findFirstOrThrow({ where: { transferReceiptId: first.id } });
        expect(Number(receiptLine.acceptedQty)).toBe(2);
        expect(Number(receiptLine.rejectedQty)).toBe(0);
        expect(Number(receiptLine.damagedQty)).toBe(0);
        expect(Number(receiptLine.discrepancyQty)).toBe(0);
        expect(Number(receiptLine.outstandingQty)).toBe(0);
        expect(Number((await prisma.inventoryTransferLine.findUniqueOrThrow({ where: { id: lineId } })).receivedQty)).toBe(2);
        expect((await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: ids.transfer } })).status).toBe("RECEIVED");
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, sourceEventKey: { startsWith: "receipt:" } } })).toBe(1);
        expect(Number((await prisma.inventoryBalance.findUniqueOrThrow({ where: { inventoryLocationId_itemId_lotKey: { inventoryLocationId: ids.destinationInventoryLocation, itemId: ids.item, lotKey: "NOLOT|NOEXP" } } })).qtyOnHand)).toBe(2);
        expect(await prisma.auditEvent.count({ where: { entityType: "InventoryTransfer", entityId: ids.transfer, eventType: "inventory_transfer.received" } })).toBe(1);
        const movementCount = await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer } });
        await expect(receiveInventoryTransfer(form("2"))).resolves.toBeUndefined();
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer } })).toBe(movementCount);
        const conflicting = form("1");
        await expect(receiveInventoryTransfer(conflicting)).rejects.toThrow("TRANSFER_RECEIPT_IDEMPOTENCY_CONFLICT");
        expect(await prisma.inventoryTransferReceipt.count({ where: { inventoryTransferId: ids.transfer } })).toBe(1);
      } finally {
        if (previousAuthMode === undefined) delete process.env.AUTH_MODE;
        else process.env.AUTH_MODE = previousAuthMode;
      }
    });
  },
);
