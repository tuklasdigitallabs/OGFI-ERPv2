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
    let racePrisma: PrismaClient;

    async function waitForLockWait(isSettled: () => boolean) {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const rows = await racePrisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count
            FROM pg_stat_activity
           WHERE datname = current_database()
             AND pid <> pg_backend_pid()
             AND state = 'active'
             AND wait_event_type = 'Lock'
        `;
        if ((rows[0]?.count ?? 0) > 0) return;
        if (isSettled()) throw new Error("RECEIPT_REVOCATION_SETTLED_BEFORE_LOCK_WAIT");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("RECEIPT_REVOCATION_LOCK_WAIT_NOT_OBSERVED");
    }

    beforeAll(async () => {
      const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(
        process.env,
      );
      const database = await import("@ogfi/database");
      ({ prisma } = database);
      await prisma.$connect();
      const raceDatabaseUrl = new URL(process.env.DATABASE_URL as string);
      raceDatabaseUrl.searchParams.set("connection_limit", "2");
      raceDatabaseUrl.searchParams.set("pool_timeout", "10");
      racePrisma = new database.PrismaClient({ datasourceUrl: raceDatabaseUrl.toString() });
      await racePrisma.$connect();
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
      await racePrisma?.$disconnect();
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
        where: { code: { in: ["inventory.transfer.receive", "inventory.transfer.receipt.reverse"] } },
        select: { id: true, code: true },
      });
      expect(permissions).toHaveLength(2);
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
            create: [
              {
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
              {
                id: ids.line2,
                tenantId: ids.tenant,
                companyId: ids.company,
                sourceInventoryLocationId: ids.sourceInventoryLocation,
                destinationInventoryLocationId: ids.destinationInventoryLocation,
                itemId: ids.item,
                uomId: ids.uom,
                lineNumber: 2,
                description: "Receipt rollback line",
                requestedQty: 2,
                approvedQty: 2,
                preparedQty: 2,
                dispatchedQty: 2,
              },
            ],
          },
        },
        include: { lines: true },
      });
      const lineIds = createdTransfer.lines.map((line) => line.id);

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
        const form = (rollback = false) => {
          const value = new FormData();
          value.set("id", ids.transfer);
          value.set("idempotencyKey", `receipt-replay-${suffix}`);
          value.set(`lines.${lineIds[0]}.acceptedQty`, rollback ? "1" : "2");
          value.set(`lines.${lineIds[0]}.rejectedQty`, "0");
          value.set(`lines.${lineIds[0]}.damagedQty`, "0");
          value.set(`lines.${lineIds[0]}.discrepancyQty`, "0");
          value.set(`lines.${lineIds[1]}.acceptedQty`, rollback ? "0" : "2");
          value.set(`lines.${lineIds[1]}.rejectedQty`, rollback ? "1" : "0");
          value.set(`lines.${lineIds[1]}.damagedQty`, "0");
          value.set(`lines.${lineIds[1]}.discrepancyQty`, "0");
          return value;
        };
        await expect(receiveInventoryTransfer(form(true))).rejects.toThrow("TRANSFER_RECEIPT_DISCREPANCY_REASON_REQUIRED");
        expect(await prisma.inventoryTransferReceipt.count({ where: { inventoryTransferId: ids.transfer } })).toBe(0);
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer } })).toBe(0);
        expect(await prisma.inventoryBalance.count({ where: { inventoryLocationId: ids.destinationInventoryLocation, itemId: ids.item } })).toBe(0);
        expect(await prisma.auditEvent.count({ where: { entityType: "InventoryTransfer", entityId: ids.transfer } })).toBe(0);
        expect((await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: ids.transfer } })).status).toBe("DISPATCHED");
        expect((await prisma.inventoryTransferLine.findMany({ where: { id: { in: lineIds } } })).every((line) => Number(line.receivedQty) === 0 && Number(line.rejectedQty) === 0 && Number(line.damagedQty) === 0 && Number(line.discrepancyQty) === 0)).toBe(true);

        let releaseLocation!: () => void;
        let signalLocationLock!: () => void;
        const locationLocked = new Promise<void>((resolve) => { signalLocationLock = resolve; });
        const locationGate = new Promise<void>((resolve) => { releaseLocation = resolve; });
        const holdLocation = racePrisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "InventoryLocation" WHERE id = ${ids.destinationInventoryLocation}::uuid FOR UPDATE`;
          signalLocationLock();
          await locationGate;
        });
        await locationLocked;
        let revocationSettled = false;
        const revocationAttempt = receiveInventoryTransfer(form());
        await waitForLockWait(() => revocationSettled);
        const { touchUserPrivilegeEpoch } = await import("../src/server/services/coreAdmin");
        await racePrisma.$transaction((tx) => touchUserPrivilegeEpoch(tx, ids.receiver, {
          companyId: ids.company,
          requestedByUserId: ids.dispatcher,
          reason: "Disposable receipt authority revocation race",
          sourceEventType: "user_scope_assignment.deactivated",
          sourceRecordId: ids.destinationLocation,
        }));
        releaseLocation();
        await expect(revocationAttempt).rejects.toThrow("AUTH_REQUIRED");
        revocationSettled = true;
        await holdLocation;
        expect(await prisma.inventoryTransferReceipt.count({ where: { inventoryTransferId: ids.transfer } })).toBe(0);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.receiver } })).privilegeEpoch).toBe(1);
        expect((await prisma.authSession.findUniqueOrThrow({ where: { id: ids.authSession } })).status).toBe("REVOKED");
        await prisma.authSession.update({ where: { id: ids.authSession }, data: { status: "ACTIVE", revokedAt: null, revocationReason: null, privilegeEpochAtIssue: 1, idleExpiresAt: new Date(Date.now() + 30 * 60_000), absoluteExpiresAt: new Date(Date.now() + 60 * 60_000) } });
        const concurrentResults = await Promise.allSettled([
          receiveInventoryTransfer(form()),
          receiveInventoryTransfer(form()),
        ]);
        expect(concurrentResults.every(({ status }) => status === "fulfilled")).toBe(true);
        const first = await prisma.inventoryTransferReceipt.findFirstOrThrow({ where: { inventoryTransferId: ids.transfer } });
        expect(first.status).toBe("POSTED");
        const receiptLines = await prisma.inventoryTransferReceiptLine.findMany({ where: { transferReceiptId: first.id } });
        expect(receiptLines).toHaveLength(2);
        expect(receiptLines.every((line) => Number(line.acceptedQty) === 2 && Number(line.outstandingQty) === 0)).toBe(true);
        expect((await prisma.inventoryTransferLine.findMany({ where: { id: { in: lineIds } } })).every((line) => Number(line.receivedQty) === 2)).toBe(true);
        expect((await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: ids.transfer } })).status).toBe("RECEIVED");
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, sourceEventKey: { startsWith: "receipt:" } } })).toBe(2);
        expect(Number((await prisma.inventoryBalance.findUniqueOrThrow({ where: { inventoryLocationId_itemId_lotKey: { inventoryLocationId: ids.destinationInventoryLocation, itemId: ids.item, lotKey: "NOLOT|NOEXP" } } })).qtyOnHand)).toBe(4);
        expect(await prisma.auditEvent.count({ where: { entityType: "InventoryTransfer", entityId: ids.transfer, eventType: "inventory_transfer.received" } })).toBe(1);
        const movementCount = await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer } });
        await expect(receiveInventoryTransfer(form())).resolves.toBeUndefined();
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer } })).toBe(movementCount);
        const conflicting = form();
        conflicting.set(`lines.${lineIds[0]}.acceptedQty`, "1");
        await expect(receiveInventoryTransfer(conflicting)).rejects.toThrow("TRANSFER_RECEIPT_IDEMPOTENCY_CONFLICT");
        expect(await prisma.inventoryTransferReceipt.count({ where: { inventoryTransferId: ids.transfer } })).toBe(1);

        const originalMovements = await prisma.inventoryMovement.findMany({
          where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, movementType: "TRANSFER_IN" },
          orderBy: { sourceEventKey: "asc" },
          select: { id: true, quantityDeltaBaseUom: true, sourceEventKey: true, createdAt: true },
        });
        const reverseSession: SessionContext = {
          ...session,
          user: { id: ids.reverser, email: `reverser-${suffix}@example.test`, displayName: "Receipt Reverser", role: "Receipt Reverser" },
          permissionCodes: ["inventory.transfer.receipt.reverse"],
          authentication: { sessionId: ids.reverseAuthSession, assuranceLevel: "MFA", mfaAuthenticatedAt: now, absoluteExpiresAt: new Date(now.getTime() + 60 * 60_000) },
        };
        mockContext.requireSessionContext.mockResolvedValue(reverseSession);
        const { reverseInventoryTransferReceipt } = await import("../src/server/services/transfers");
        const reversalForm = new FormData();
        reversalForm.set("id", ids.transfer);
        reversalForm.set("receiptId", first.id);
        reversalForm.set("reversalReason", "Disposable neutrality reversal");
        const reversalMovementCountBeforeSod = await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, movementType: "REVERSAL" } });
        mockContext.requireSessionContext.mockResolvedValue(session);
        await expect(reverseInventoryTransferReceipt(reversalForm)).rejects.toThrow("TRANSFER_RECEIPT_SELF_REVERSAL_NOT_ALLOWED");
        mockContext.requireSessionContext.mockResolvedValue({
          ...reverseSession,
          user: { id: ids.dispatcher, email: `dispatcher-${suffix}@example.test`, displayName: "Receipt Dispatcher", role: "Receipt Dispatcher" },
          authentication: undefined,
        });
        await expect(reverseInventoryTransferReceipt(reversalForm)).rejects.toThrow("TRANSFER_RECEIPT_DISPATCHER_REVERSAL_NOT_ALLOWED");
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, movementType: "REVERSAL" } })).toBe(reversalMovementCountBeforeSod);
        mockContext.requireSessionContext.mockResolvedValue(reverseSession);
        const laterReceiptLine = receiptLines.find((line) => line.lineNumber === 2)!;
        const laterMovementId = laterReceiptLine.postedMovementId;
        expect(laterMovementId).toBeTruthy();
        await prisma.inventoryTransferReceiptLine.update({ where: { id: laterReceiptLine.id }, data: { postedMovementId: null } });
        await expect(reverseInventoryTransferReceipt(reversalForm)).rejects.toThrow("TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_REQUIRED");
        expect((await prisma.inventoryTransferReceipt.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("POSTED");
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, movementType: "REVERSAL" } })).toBe(0);
        expect(Number((await prisma.inventoryBalance.findUniqueOrThrow({ where: { inventoryLocationId_itemId_lotKey: { inventoryLocationId: ids.destinationInventoryLocation, itemId: ids.item, lotKey: "NOLOT|NOEXP" } } })).qtyOnHand)).toBe(4);
        expect(await prisma.auditEvent.count({ where: { entityType: "InventoryTransfer", entityId: ids.transfer, eventType: "inventory_transfer.receipt_reversed" } })).toBe(0);
        await prisma.inventoryTransferReceiptLine.update({ where: { id: laterReceiptLine.id }, data: { postedMovementId: laterMovementId } });
        const firstReceiptLine = receiptLines.find((line) => line.lineNumber === 1)!;
        await prisma.inventoryTransferReceiptLine.update({ where: { id: firstReceiptLine.id }, data: { acceptedQty: 1 } });
        await expect(reverseInventoryTransferReceipt(reversalForm)).rejects.toThrow("TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH");
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, movementType: "REVERSAL" } })).toBe(0);
        await prisma.inventoryTransferReceiptLine.update({ where: { id: firstReceiptLine.id }, data: { acceptedQty: 2 } });
        await reverseInventoryTransferReceipt(reversalForm);
        const reversedReceipt = await prisma.inventoryTransferReceipt.findUniqueOrThrow({ where: { id: first.id } });
        expect(reversedReceipt.status).toBe("REVERSED");
        expect(reversedReceipt.reversedByUserId).toBe(ids.reverser);
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, movementType: "REVERSAL" } })).toBe(2);
        expect(Number((await prisma.inventoryBalance.findUniqueOrThrow({ where: { inventoryLocationId_itemId_lotKey: { inventoryLocationId: ids.destinationInventoryLocation, itemId: ids.item, lotKey: "NOLOT|NOEXP" } } })).qtyOnHand)).toBe(0);
        expect((await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: ids.transfer } })).status).toBe("DISPATCHED");
        expect((await prisma.inventoryTransferLine.findMany({ where: { id: { in: lineIds } } })).every((line) => Number(line.receivedQty) === 0)).toBe(true);
        expect(await prisma.auditEvent.count({ where: { entityType: "InventoryTransfer", entityId: ids.transfer, eventType: "inventory_transfer.receipt_reversed" } })).toBe(1);
        const reversalMovements = await prisma.inventoryMovement.findMany({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, movementType: "REVERSAL" }, select: { reversalOfMovementId: true, sourceEventKey: true, quantityDeltaBaseUom: true } });
        expect(reversalMovements.every((movement) => originalMovements.some((original) => original.id === movement.reversalOfMovementId) && Number(movement.quantityDeltaBaseUom) === -2)).toBe(true);
        await expect(reverseInventoryTransferReceipt(reversalForm)).rejects.toThrow("TRANSFER_RECEIPT_ALREADY_REVERSED");
        expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "InventoryTransfer", sourceDocumentId: ids.transfer, movementType: "REVERSAL" } })).toBe(2);
        expect(await prisma.auditEvent.count({ where: { entityType: "InventoryTransfer", entityId: ids.transfer, eventType: "inventory_transfer.receipt_reversed" } })).toBe(1);
      } finally {
        if (previousAuthMode === undefined) delete process.env.AUTH_MODE;
        else process.env.AUTH_MODE = previousAuthMode;
      }
    });
  },
);
