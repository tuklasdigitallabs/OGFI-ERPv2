import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { SessionContext } from "../src/server/services/context";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import {
  authenticationSessionTokenHash,
  clearAuthenticatedRequest,
  configureAuthenticatedRequest,
} from "./authenticatedRequestHarness";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
if (!process.env.DATABASE_URL) throw new Error("SUPPLIER_CONFIDENTIAL_DATABASE_REQUIRED");

const observationTimeoutMs = 5_000;
const settlementTimeoutMs = 8_000;

type RaceAction = "accreditation" | "link-create" | "link-deactivate";
type RaceWinner = "action" | "supplier";

type RaceFixture = {
  actionReason: string;
  auditFixtureId: string;
  initialLinkId?: string;
  supplierCode: string;
  supplierId: string;
  supplierReason: string;
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function tracked<T>(promise: Promise<T>) {
  let settled = false;
  void promise.finally(() => {
    settled = true;
  }).catch(() => undefined);
  return { promise, isSettled: () => settled };
}

async function within<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForAuditWriterBlocked(input: {
  blockerPid: number;
  control: PrismaClient;
  isSettled: () => boolean;
}) {
  const deadline = Date.now() + observationTimeoutMs;
  while (Date.now() < deadline) {
    const rows = await input.control.$queryRaw<Array<{ pid: number; query: string }>>`
      SELECT activity.pid, activity.query
        FROM pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND ${input.blockerPid}::int = ANY(pg_blocking_pids(activity.pid))
       ORDER BY activity.pid ASC
    `;
    const writer = rows.find(({ query }) => /INSERT[\s\S]*"AuditEvent"/i.test(query));
    if (writer) return writer.pid;
    if (input.isSettled()) {
      throw new Error("DEC_0242_WINNER_SETTLED_BEFORE_AUDIT_LOCK_WAIT");
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`DEC_0242_AUDIT_WRITER_LOCK_WAIT_NOT_OBSERVED:${input.blockerPid}`);
}

async function waitForSupplierLockWait(input: {
  blockerPid: number;
  control: PrismaClient;
  isSettled: () => boolean;
}) {
  const supplierLockPattern = /FROM "Supplier"[\s\S]*FOR UPDATE/i;
  const deadline = Date.now() + observationTimeoutMs;
  while (Date.now() < deadline) {
    const rows = await input.control.$queryRaw<
      Array<{ blockers: number[]; pid: number; query: string }>
    >`
      SELECT activity.pid,
             activity.query,
             pg_blocking_pids(activity.pid) AS blockers
        FROM pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND activity.pid <> pg_backend_pid()
       ORDER BY activity.pid ASC
    `;
    const waiter = rows.find(
      ({ blockers, query }) =>
        blockers.includes(input.blockerPid) && supplierLockPattern.test(query),
    );
    if (waiter) return waiter.pid;
    if (input.isSettled()) {
      throw new Error("DEC_0242_LOSER_SETTLED_BEFORE_SUPPLIER_LOCK_WAIT");
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`DEC_0242_SUPPLIER_LOCK_WAIT_NOT_OBSERVED:${input.blockerPid}`);
}

describe.sequential("DEC-0242 supplier confidentiality and deactivation integrity", () => {
  const seeded = {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    locationId: "00000000-0000-4000-8000-000000000004",
    adminUserId: "00000000-0000-4000-8000-000000000014",
    requesterUserId: "00000000-0000-4000-8000-000000000005",
  };
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    adjacentCompanyId: randomUUID(),
    categoryId: randomUUID(),
    adjacentCategoryId: randomUUID(),
    uomId: randomUUID(),
    adjacentUomId: randomUUID(),
    itemId: randomUUID(),
    secondItemId: randomUUID(),
    adjacentItemId: randomUUID(),
    supplierAId: randomUUID(),
    supplierBId: randomUUID(),
    supplierConcurrentId: randomUUID(),
    inactiveSupplierId: randomUUID(),
    adjacentSupplierId: randomUUID(),
    linkAId: randomUUID(),
    concurrentLinkId: randomUUID(),
    adjacentLinkId: randomUUID(),
    inactiveSupplierLinkId: randomUUID(),
    lowPriceId: "11111111-1111-4111-8111-111111111111",
    highPriceId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    authSessionId: randomUUID(),
    permissionOnlyRoleId: randomUUID(),
    permissionOnlyAssignmentId: randomUUID(),
  };
  const sessionToken = `supplier-confidential-${randomUUID()}`;

  let prisma: PrismaClient;
  let barrierPrisma: PrismaClient;
  let adminSession: SessionContext;
  let superSession: SessionContext;
  let permissionOnlySession: SessionContext;
  let suppliers: typeof import("../src/server/services/suppliers");

  beforeAll(async () => {
    const database = await import("@ogfi/database");
    ({ prisma } = database);
    suppliers = await import("../src/server/services/suppliers");
    const { getConfiguredContext } = await import("../src/server/services/context");
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const barrierUrl = new URL(process.env.DATABASE_URL as string);
    barrierUrl.searchParams.set("connection_limit", "2");
    barrierUrl.searchParams.set("pool_timeout", "10");
    barrierPrisma = new database.PrismaClient({ datasourceUrl: barrierUrl.toString() });
    await barrierPrisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(barrierPrisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("SUPPLIER_CONFIDENTIAL_DATABASE_IDENTITY_MISMATCH");
    }

    const admin = await prisma.user.findUniqueOrThrow({
      where: { id: seeded.adminUserId },
      select: { privilegeEpoch: true },
    });
    await prisma.authSession.create({
      data: {
        id: ids.authSessionId,
        tenantId: seeded.tenantId,
        userId: seeded.adminUserId,
        tokenHash: authenticationSessionTokenHash(sessionToken),
        status: "ACTIVE",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: admin.privilegeEpoch,
        idleExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    configureAuthenticatedRequest({
      sessionToken,
      selectedLocationId: seeded.locationId,
    });

    await prisma.company.create({
      data: {
        id: ids.adjacentCompanyId,
        tenantId: seeded.tenantId,
        code: `SC-ADJ-${suffix}`,
        legalName: `Supplier Confidential Adjacent ${suffix}`,
        currencyCode: "PHP",
      },
    });
    await prisma.itemCategory.createMany({
      data: [
        {
          id: ids.categoryId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          categoryCode: `SC-${suffix}`,
          categoryName: `Supplier Confidential ${suffix}`,
          inventoryClass: "GENERAL",
        },
        {
          id: ids.adjacentCategoryId,
          tenantId: seeded.tenantId,
          companyId: ids.adjacentCompanyId,
          categoryCode: `SC-ADJ-${suffix}`,
          categoryName: `Adjacent Supplier Confidential ${suffix}`,
          inventoryClass: "GENERAL",
        },
      ],
    });
    await prisma.uom.createMany({
      data: [
        {
          id: ids.uomId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          uomCode: `SC-${suffix}`,
          uomName: "Supplier Confidential Unit",
          uomType: "COUNT",
        },
        {
          id: ids.adjacentUomId,
          tenantId: seeded.tenantId,
          companyId: ids.adjacentCompanyId,
          uomCode: `SC-ADJ-${suffix}`,
          uomName: "Adjacent Supplier Confidential Unit",
          uomType: "COUNT",
        },
      ],
    });
    await prisma.item.createMany({
      data: [
        {
          id: ids.itemId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          itemCode: `SC-I1-${suffix}`,
          itemName: `Supplier Confidential Item 1 ${suffix}`,
          itemCategoryId: ids.categoryId,
          itemType: "INVENTORY",
          baseUomId: ids.uomId,
        },
        {
          id: ids.secondItemId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          itemCode: `SC-I2-${suffix}`,
          itemName: `Supplier Confidential Item 2 ${suffix}`,
          itemCategoryId: ids.categoryId,
          itemType: "INVENTORY",
          baseUomId: ids.uomId,
        },
        {
          id: ids.adjacentItemId,
          tenantId: seeded.tenantId,
          companyId: ids.adjacentCompanyId,
          itemCode: `SC-ADJ-${suffix}`,
          itemName: `Adjacent Supplier Confidential Item ${suffix}`,
          itemCategoryId: ids.adjacentCategoryId,
          itemType: "INVENTORY",
          baseUomId: ids.adjacentUomId,
        },
      ],
    });
    await prisma.supplier.createMany({
      data: [
        {
          id: ids.supplierAId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierCode: `SC-A-${suffix}`,
          legalName: `Supplier Confidential A ${suffix}`,
          paymentTerms: "NET 30 CONFIDENTIAL",
        },
        {
          id: ids.supplierBId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierCode: `SC-B-${suffix}`,
          legalName: `Supplier Confidential B ${suffix}`,
        },
        {
          id: ids.supplierConcurrentId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierCode: `SC-C-${suffix}`,
          legalName: `Supplier Confidential Concurrent ${suffix}`,
        },
        {
          id: ids.inactiveSupplierId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierCode: `SC-IN-${suffix}`,
          legalName: `Inactive Supplier Link Guard ${suffix}`,
          status: "INACTIVE",
          accreditationStatus: "SUSPENDED",
        },
        {
          id: ids.adjacentSupplierId,
          tenantId: seeded.tenantId,
          companyId: ids.adjacentCompanyId,
          supplierCode: `SC-ADJ-${suffix}`,
          legalName: `Adjacent Supplier Confidential ${suffix}`,
          paymentTerms: "ADJACENT SECRET",
        },
      ],
    });
    await prisma.supplierItemLink.createMany({
      data: [
        {
          id: ids.linkAId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierId: ids.supplierAId,
          itemId: ids.itemId,
          purchaseUomId: ids.uomId,
        },
        {
          id: ids.concurrentLinkId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierId: ids.supplierAId,
          itemId: ids.secondItemId,
          purchaseUomId: ids.uomId,
        },
        {
          id: ids.adjacentLinkId,
          tenantId: seeded.tenantId,
          companyId: ids.adjacentCompanyId,
          supplierId: ids.adjacentSupplierId,
          itemId: ids.adjacentItemId,
          purchaseUomId: ids.adjacentUomId,
        },
        {
          id: ids.inactiveSupplierLinkId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierId: ids.inactiveSupplierId,
          itemId: ids.itemId,
          purchaseUomId: ids.uomId,
          status: "ACTIVE",
        },
      ],
    });
    const priceTimestamp = new Date("2026-07-01T00:00:00.000Z");
    await prisma.supplierPriceHistory.createMany({
      data: [
        {
          id: ids.lowPriceId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierId: ids.supplierAId,
          itemId: ids.itemId,
          supplierItemLinkId: ids.linkAId,
          uomId: ids.uomId,
          currencyCode: "PHP",
          unitPrice: 111,
          effectiveFrom: priceTimestamp,
          createdAt: priceTimestamp,
        },
        {
          id: ids.highPriceId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierId: ids.supplierAId,
          itemId: ids.itemId,
          supplierItemLinkId: ids.linkAId,
          uomId: ids.uomId,
          currencyCode: "PHP",
          unitPrice: 222,
          effectiveFrom: priceTimestamp,
          createdAt: priceTimestamp,
        },
      ],
    });

    const confidentialPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: "purchasing.supplier_confidential.view" },
      select: { id: true },
    });
    await prisma.role.create({
      data: {
        id: ids.permissionOnlyRoleId,
        tenantId: seeded.tenantId,
        code: `SC-CONF-ONLY-${suffix}`,
        name: `Supplier Confidential Only ${suffix}`,
        permissions: { create: { permissionId: confidentialPermission.id } },
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        id: ids.permissionOnlyAssignmentId,
        userId: seeded.requesterUserId,
        roleId: ids.permissionOnlyRoleId,
      },
    });

    adminSession = await getConfiguredContext("admin@example.test", seeded.locationId);
    superSession = await getConfiguredContext("super@example.test", seeded.locationId);
    permissionOnlySession = await getConfiguredContext("user@example.test", seeded.locationId);
  });

  afterAll(async () => {
    clearAuthenticatedRequest();
    if (barrierPrisma) await barrierPrisma.$disconnect();
    if (prisma) await prisma.$disconnect();
  });

  function form(values: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  }

  async function createRaceFixture(action: RaceAction): Promise<RaceFixture> {
    const raceSuffix = randomUUID().slice(0, 8);
    const supplierId = randomUUID();
    const supplierCode = `SC-R-${raceSuffix}`;
    const actionReason = `DEC-0242 ${action} action ${raceSuffix}`;
    const supplierReason = `DEC-0242 ${action} supplier deactivation ${raceSuffix}`;
    await prisma.supplier.create({
      data: {
        id: supplierId,
        tenantId: seeded.tenantId,
        companyId: seeded.companyId,
        supplierCode,
        legalName: `DEC-0242 ${action} race ${raceSuffix}`,
      },
    });

    let initialLinkId: string | undefined;
    if (action === "link-deactivate") {
      initialLinkId = randomUUID();
      await prisma.supplierItemLink.create({
        data: {
          id: initialLinkId,
          tenantId: seeded.tenantId,
          companyId: seeded.companyId,
          supplierId,
          itemId: ids.itemId,
          purchaseUomId: ids.uomId,
        },
      });
    }

    const auditFixture = await prisma.auditEvent.create({
      data: {
        tenantId: seeded.tenantId,
        companyId: seeded.companyId,
        actorUserId: seeded.adminUserId,
        eventType: "test.supplier_lifecycle.fixture",
        entityType: "SupplierLifecycleRaceFixture",
        entityId: randomUUID(),
        metadata: { operation: "create", action },
      },
      select: { id: true },
    });
    return {
      actionReason,
      auditFixtureId: auditFixture.id,
      initialLinkId,
      supplierCode,
      supplierId,
      supplierReason,
    };
  }

  async function startActorForeignKeyBarrier() {
    const ready = deferred();
    const release = deferred();
    let pid = 0;
    const blocker = barrierPrisma.$transaction(
      async (tx) => {
        [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        const actors = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
            FROM "User"
           WHERE id = ${seeded.adminUserId}::uuid
             AND "tenantId" = ${seeded.tenantId}::uuid
           FOR UPDATE
        `;
        if (actors[0]?.id !== seeded.adminUserId) {
          throw new Error("DEC_0242_ACTOR_BARRIER_FIXTURE_NOT_FOUND");
        }
        ready.resolve();
        await release.promise;
      },
      { timeout: 20_000 },
    );
    await within(
      Promise.race([ready.promise, blocker]),
      observationTimeoutMs,
      "DEC_0242_AUDIT_BARRIER_READY",
    );
    return { blocker, pid, release };
  }

  function executeRaceAction(action: RaceAction, fixture: RaceFixture) {
    if (action === "accreditation") {
      return suppliers.updateSupplierAccreditation(form({
        supplierId: fixture.supplierId,
        accreditationStatus: "APPROVED",
        reason: fixture.actionReason,
      }));
    }
    if (action === "link-create") {
      return suppliers.createSupplierItemLink(form({
        supplierId: fixture.supplierId,
        itemId: ids.itemId,
        purchaseUomId: ids.uomId,
        reason: fixture.actionReason,
      }));
    }
    return suppliers.deactivateSupplierItemLink(form({
      supplierId: fixture.supplierId,
      supplierItemLinkId: fixture.initialLinkId as string,
      reason: fixture.actionReason,
    }));
  }

  function executeSupplierDeactivation(fixture: RaceFixture) {
    return suppliers.deactivateSupplier(form({
      supplierId: fixture.supplierId,
      reason: fixture.supplierReason,
    }));
  }

  async function raceSnapshot(fixture: RaceFixture) {
    const [supplier, links, priceHistoryCount, auditFixture, audits] = await Promise.all([
      prisma.supplier.findUniqueOrThrow({
        where: { id: fixture.supplierId },
        select: { accreditationStatus: true, status: true },
      }),
      prisma.supplierItemLink.findMany({
        where: { supplierId: fixture.supplierId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          itemId: true,
          purchaseUomId: true,
          status: true,
          supplierId: true,
        },
      }),
      prisma.supplierPriceHistory.count({ where: { supplierId: fixture.supplierId } }),
      prisma.auditEvent.findUnique({
        where: { id: fixture.auditFixtureId },
        select: { id: true, eventType: true },
      }),
      prisma.$queryRaw<Array<{
        actorUserId: string | null;
        entityId: string;
        eventType: string;
        reason: string | null;
      }>>`
        SELECT audit."actorUserId" AS "actorUserId",
               audit."entityId" AS "entityId",
               audit."eventType" AS "eventType",
               audit."metadata"->>'reason' AS reason
          FROM "AuditEvent" audit
         WHERE audit."tenantId" = ${seeded.tenantId}::uuid
           AND audit."metadata"->>'reason' IN (${fixture.actionReason}, ${fixture.supplierReason})
         ORDER BY audit."eventType" ASC, audit."entityId" ASC
      `,
    ]);
    return { auditFixture, audits, links, priceHistoryCount, supplier };
  }

  function sortedAudits(
    audits: Array<{
      actorUserId: string;
      entityId: string;
      eventType: string;
      reason: string;
    }>,
  ) {
    const bytewiseCompare = (left: string, right: string) =>
      left === right ? 0 : left < right ? -1 : 1;
    return audits.sort((left, right) =>
      bytewiseCompare(left.eventType, right.eventType) ||
      bytewiseCompare(left.entityId, right.entityId),
    );
  }

  async function runSupplierLifecycleRace(action: RaceAction, winner: RaceWinner) {
    const fixture = await createRaceFixture(action);
    const before = await raceSnapshot(fixture);
    expect(before.supplier).toEqual({
      accreditationStatus: "PENDING_REVIEW",
      status: "ACTIVE",
    });
    expect(before.links).toHaveLength(action === "link-deactivate" ? 1 : 0);
    if (action === "link-deactivate") {
      expect(before.links[0]).toEqual({
        id: fixture.initialLinkId,
        itemId: ids.itemId,
        purchaseUomId: ids.uomId,
        status: "ACTIVE",
        supplierId: fixture.supplierId,
      });
    }
    expect(before.priceHistoryCount).toBe(0);
    expect(before.audits).toEqual([]);
    expect(before.auditFixture).toEqual({
      id: fixture.auditFixtureId,
      eventType: "test.supplier_lifecycle.fixture",
    });

    // AuditEvent.actorUserId has a real FK to User. Its insert takes a KEY
    // SHARE row lock on the actor, which conflicts with this fixture's FOR
    // UPDATE lock. The winner pauses after its Supplier write owns the row
    // and before either the source mutation or audit can commit.
    const barrier = await startActorForeignKeyBarrier();
    const winnerOperation = tracked(
      winner === "action"
        ? executeRaceAction(action, fixture)
        : executeSupplierDeactivation(fixture),
    );
    let loserOperation: ReturnType<typeof tracked<unknown>> | undefined;
    let observationError: unknown;
    try {
      const winnerPid = await waitForAuditWriterBlocked({
        blockerPid: barrier.pid,
        control: prisma,
        isSettled: winnerOperation.isSettled,
      });
      loserOperation = tracked(
        winner === "action"
          ? executeSupplierDeactivation(fixture)
          : executeRaceAction(action, fixture),
      );
      const loserPid = await waitForSupplierLockWait({
        blockerPid: winnerPid,
        control: prisma,
        isSettled: loserOperation.isSettled,
      });
      expect(loserPid).not.toBe(winnerPid);
      expect(loserPid).not.toBe(barrier.pid);
    } catch (error) {
      observationError = error;
    } finally {
      barrier.release.resolve();
    }

    const outcomes = await within(
      Promise.allSettled([
        barrier.blocker,
        winnerOperation.promise,
        ...(loserOperation ? [loserOperation.promise] : []),
      ]),
      settlementTimeoutMs,
      `DEC_0242_${action}_${winner}_SETTLEMENT`,
    );
    if (observationError) throw observationError;
    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]?.status).toBe("fulfilled");
    expect(outcomes[1]?.status).toBe("fulfilled");
    if (winner === "action") {
      expect(outcomes[2]?.status).toBe("fulfilled");
    } else {
      expect(outcomes[2]).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({
          message:
            action === "link-deactivate"
              ? "SUPPLIER_ITEM_LINK_NOT_FOUND"
              : "SUPPLIER_NOT_FOUND",
        }),
      });
    }

    const after = await raceSnapshot(fixture);
    expect(after.auditFixture).toEqual(before.auditFixture);
    expect(after.supplier).toEqual({
      accreditationStatus: "SUSPENDED",
      status: "INACTIVE",
    });
    expect(after.priceHistoryCount).toBe(0);

    if (action === "link-create") {
      expect(after.links).toHaveLength(winner === "action" ? 1 : 0);
      if (winner === "action") {
        expect(after.links[0]).toMatchObject({
          itemId: ids.itemId,
          purchaseUomId: ids.uomId,
          status: "ACTIVE",
          supplierId: fixture.supplierId,
        });
      }
    } else if (action === "link-deactivate") {
      expect(after.links).toEqual([
        {
          id: fixture.initialLinkId,
          itemId: ids.itemId,
          purchaseUomId: ids.uomId,
          status: winner === "action" ? "INACTIVE" : "ACTIVE",
          supplierId: fixture.supplierId,
        },
      ]);
    } else {
      expect(after.links).toEqual([]);
    }

    const expectedAudits = [
      {
        actorUserId: seeded.adminUserId,
        entityId: fixture.supplierId,
        eventType: "supplier.deactivated",
        reason: fixture.supplierReason,
      },
    ];
    if (winner === "action") {
      expectedAudits.push({
        actorUserId: seeded.adminUserId,
        entityId:
          action === "link-create" ? after.links[0]!.id :
          action === "link-deactivate" ? fixture.initialLinkId as string : fixture.supplierId,
        eventType:
          action === "accreditation" ? "supplier.accreditation_status_updated" :
          action === "link-create" ? "supplier_item_link.created" :
          "supplier_item_link.deactivated",
        reason: fixture.actionReason,
      });
    }
    expect(after.audits).toEqual(sortedAudits(expectedAudits));
  }

  it("redacts confidential supplier fields without the explicit permission", async () => {
    const ordinaryList = await suppliers.listSuppliers(adminSession, {
      query: `SC-A-${suffix}`,
      pageSize: 10,
    });
    expect(ordinaryList.canViewSupplierConfidential).toBe(false);
    expect(ordinaryList.suppliers.find((supplier) => supplier.id === ids.supplierAId)?.paymentTerms).toBeNull();
    const ordinary = await suppliers.getSupplierCatalog(adminSession, ids.supplierAId);
    expect(ordinary?.canViewSupplierConfidential).toBe(false);
    expect(ordinary?.supplier.paymentTerms).toBeNull();
    expect(ordinary?.itemLinks.find((link) => link.id === ids.linkAId)?.latestPrice).toBeNull();

    const privileged = await suppliers.getSupplierCatalog(superSession, ids.supplierAId);
    expect(privileged?.canViewSupplierConfidential).toBe(true);
    expect(privileged?.supplier.paymentTerms).toBe("NET 30 CONFIDENTIAL");
    expect(privileged?.itemLinks.find((link) => link.id === ids.linkAId)?.latestPrice?.unitPrice).toBe(222);
    const privilegedList = await suppliers.listSuppliers(superSession, {
      query: `SC-A-${suffix}`,
      pageSize: 10,
    });
    expect(privilegedList.canViewSupplierConfidential).toBe(true);
    expect(privilegedList.suppliers.find((supplier) => supplier.id === ids.supplierAId)?.paymentTerms).toBe("NET 30 CONFIDENTIAL");
  });

  it("does not treat confidential clearance as standalone Supplier authority", async () => {
    await expect(
      suppliers.getSupplierCatalog(permissionOnlySession, ids.supplierAId)
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      suppliers.listSuppliers(permissionOnlySession, { query: `SC-A-${suffix}`, pageSize: 10 })
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  it("clamps filtered catalog pages and returns exact range metadata", async () => {
    const result = await suppliers.getSupplierCatalog(adminSession, ids.supplierAId, {
      page: 99_999,
      pageSize: 10,
      categoryId: "not-a-uuid",
      query: " ".repeat(140),
    });
    expect(result).toMatchObject({
      page: 1,
      pageSize: 10,
      filteredCount: 2,
      totalPages: 1,
      rangeStart: 1,
      rangeEnd: 2,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it("keeps equal-sort-key catalog rows stable across multiple bounded pages", async () => {
    const itemIds = Array.from({ length: 21 }, () => randomUUID());
    const linkIds = Array.from({ length: 21 }, () => randomUUID());
    await prisma.item.createMany({
      data: itemIds.map((id, index) => ({
        id,
        tenantId: seeded.tenantId,
        companyId: seeded.companyId,
        itemCode: `SC-PAGE-${suffix}-${String(index).padStart(2, "0")}`,
        itemName: `Supplier Paging Tie ${suffix}`,
        itemCategoryId: ids.categoryId,
        itemType: "INVENTORY",
        baseUomId: ids.uomId,
      })),
    });
    await prisma.supplierItemLink.createMany({
      data: itemIds.map((itemId, index) => ({
        id: linkIds[index]!,
        tenantId: seeded.tenantId,
        companyId: seeded.companyId,
        supplierId: ids.supplierBId,
        itemId,
        purchaseUomId: ids.uomId,
      })),
    });

    const pages = await Promise.all([1, 2, 3].map((page) =>
      suppliers.getSupplierCatalog(adminSession, ids.supplierBId, {
        query: `SC-PAGE-${suffix}`,
        page,
        pageSize: 10,
      })
    ));
    expect(pages.map((result) => result.itemLinks.length)).toEqual([10, 10, 1]);
    expect(pages[0]).toMatchObject({ filteredCount: 21, totalPages: 3, rangeStart: 1, rangeEnd: 10 });
    expect(pages[2]).toMatchObject({ rangeStart: 21, rangeEnd: 21, hasNextPage: false });
    const observedIds = pages.flatMap((result) => result.itemLinks.map((link) => link.id));
    expect(new Set(observedIds).size).toBe(21);
    expect(observedIds).toEqual([...linkIds].sort());
    const repeatedFirstPage = await suppliers.getSupplierCatalog(adminSession, ids.supplierBId, {
      query: `SC-PAGE-${suffix}`,
      page: 1,
      pageSize: 10,
    });
    expect(repeatedFirstPage.itemLinks.map((link) => link.id)).toEqual(observedIds.slice(0, 10));
  });

  it("denies confidential writes to ordinary configured administrators without mutation", async () => {
    const before = await Promise.all([
      prisma.supplier.count({ where: { supplierCode: `SC-DENY-${suffix}` } }),
      prisma.supplierItemLink.count({
        where: { supplierId: ids.supplierBId, itemId: ids.itemId, purchaseUomId: ids.uomId },
      }),
      prisma.supplierPriceHistory.count({ where: { supplierId: ids.supplierBId } }),
      prisma.auditEvent.count({ where: { tenantId: seeded.tenantId } }),
    ]);
    await expect(suppliers.createSupplier(form({
      supplierCode: `SC-DENY-${suffix}`,
      legalName: "Denied Confidential Supplier",
      paymentTerms: "NET 90",
      reason: "Confidential write denial test",
    }))).rejects.toThrow("PERMISSION_DENIED");
    await expect(suppliers.createSupplierItemLink(form({
      supplierId: ids.supplierBId,
      itemId: ids.itemId,
      purchaseUomId: ids.uomId,
      unitPrice: "12.50",
      effectiveFrom: "2026-07-26",
      reason: "Confidential price denial test",
    }))).rejects.toThrow("PERMISSION_DENIED");
    const after = await Promise.all([
      prisma.supplier.count({ where: { supplierCode: `SC-DENY-${suffix}` } }),
      prisma.supplierItemLink.count({
        where: { supplierId: ids.supplierBId, itemId: ids.itemId, purchaseUomId: ids.uomId },
      }),
      prisma.supplierPriceHistory.count({ where: { supplierId: ids.supplierBId } }),
      prisma.auditEvent.count({ where: { tenantId: seeded.tenantId } }),
    ]);
    expect(after).toEqual(before);
  });

  it("honors a live confidential grant and fails closed immediately after revocation", async () => {
    const [assignment, permission] = await Promise.all([
      prisma.userRoleAssignment.findFirstOrThrow({
        where: { userId: seeded.adminUserId, status: "ACTIVE" },
        select: { roleId: true },
      }),
      prisma.permission.findUniqueOrThrow({
        where: { code: "purchasing.supplier_confidential.view" },
        select: { id: true },
      }),
    ]);
    await prisma.rolePermission.create({
      data: { roleId: assignment.roleId, permissionId: permission.id },
    });
    try {
      const visible = await suppliers.getSupplierCatalog(adminSession, ids.supplierAId);
      expect(visible.canViewSupplierConfidential).toBe(true);
      expect(visible.supplier.paymentTerms).toBe("NET 30 CONFIDENTIAL");
      const created = await suppliers.createSupplier(form({
        supplierCode: `SC-LIVE-${suffix}`,
        legalName: "Live Confidential Grant Supplier",
        paymentTerms: "NET 45",
        reason: "Live confidential grant positive test",
      }));
      expect(created.paymentTerms).toBe("NET 45");
    } finally {
      await prisma.rolePermission.deleteMany({
        where: { roleId: assignment.roleId, permissionId: permission.id },
      });
    }

    const redacted = await suppliers.getSupplierCatalog(adminSession, ids.supplierAId);
    expect(redacted.canViewSupplierConfidential).toBe(false);
    expect(redacted.supplier.paymentTerms).toBeNull();
    await expect(suppliers.createSupplier(form({
      supplierCode: `SC-REVOKED-${suffix}`,
      legalName: "Revoked Confidential Supplier",
      paymentTerms: "NET 60",
      reason: "Live confidential revocation test",
    }))).rejects.toThrow("PERMISSION_DENIED");
  });

  it("rejects cross-supplier and foreign-company link tampering without audit", async () => {
    const beforeAudits = await prisma.auditEvent.count({
      where: { eventType: "supplier_item_link.deactivated", entityId: ids.linkAId },
    });
    await expect(suppliers.deactivateSupplierItemLink(form({
      supplierId: ids.supplierBId,
      supplierItemLinkId: ids.linkAId,
      reason: "Cross supplier tampering test",
    }))).rejects.toThrow("SUPPLIER_ITEM_LINK_NOT_FOUND");
    await expect(suppliers.deactivateSupplierItemLink(form({
      supplierId: ids.adjacentSupplierId,
      supplierItemLinkId: ids.adjacentLinkId,
      reason: "Foreign company tampering test",
    }))).rejects.toThrow("SUPPLIER_ITEM_LINK_NOT_FOUND");
    expect(await prisma.supplierItemLink.findUniqueOrThrow({ where: { id: ids.linkAId } })).toMatchObject({ status: "ACTIVE" });
    expect(await prisma.supplierItemLink.findUniqueOrThrow({ where: { id: ids.adjacentLinkId } })).toMatchObject({ status: "ACTIVE" });
    expect(await prisma.auditEvent.count({
      where: { eventType: "supplier_item_link.deactivated", entityId: ids.linkAId },
    })).toBe(beforeAudits);
  });

  it("keeps active child links under an inactive supplier read-only", async () => {
    const beforeAudits = await prisma.auditEvent.count({
      where: { eventType: "supplier_item_link.deactivated", entityId: ids.inactiveSupplierLinkId },
    });
    await expect(suppliers.deactivateSupplierItemLink(form({
      supplierId: ids.inactiveSupplierId,
      supplierItemLinkId: ids.inactiveSupplierLinkId,
      reason: "Inactive supplier retained history test",
    }))).rejects.toThrow("SUPPLIER_ITEM_LINK_NOT_FOUND");
    expect(await prisma.supplierItemLink.findUniqueOrThrow({
      where: { id: ids.inactiveSupplierLinkId },
    })).toMatchObject({ status: "ACTIVE" });
    expect(await prisma.auditEvent.count({
      where: { eventType: "supplier_item_link.deactivated", entityId: ids.inactiveSupplierLinkId },
    })).toBe(beforeAudits);
  });

  it("allows exactly one concurrent link deactivation and writes one audit", async () => {
    const data = () => form({
      supplierId: ids.supplierAId,
      supplierItemLinkId: ids.concurrentLinkId,
      reason: "Concurrent supplier link deactivation",
    });
    const results = await Promise.allSettled([
      suppliers.deactivateSupplierItemLink(data()),
      suppliers.deactivateSupplierItemLink(data()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({ status: "rejected" });
    if (rejection?.status === "rejected") {
      expect(String(rejection.reason)).toContain("SUPPLIER_ITEM_LINK_NOT_FOUND");
    }
    expect(await prisma.auditEvent.count({
      where: { eventType: "supplier_item_link.deactivated", entityId: ids.concurrentLinkId },
    })).toBe(1);
  });

  it("allows exactly one concurrent supplier deactivation and writes one audit", async () => {
    const data = () => form({
      supplierId: ids.supplierConcurrentId,
      reason: "Concurrent supplier deactivation test",
    });
    const results = await Promise.allSettled([
      suppliers.deactivateSupplier(data()),
      suppliers.deactivateSupplier(data()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    if (rejection?.status === "rejected") {
      expect(String(rejection.reason)).toContain("SUPPLIER_NOT_FOUND");
    }
    expect(await prisma.auditEvent.count({
      where: { eventType: "supplier.deactivated", entityId: ids.supplierConcurrentId },
    })).toBe(1);
  });

  it("forces accreditation update versus supplier deactivation in both winner orders", async () => {
    await runSupplierLifecycleRace("accreditation", "action");
    await runSupplierLifecycleRace("accreditation", "supplier");
  }, 45_000);

  it("forces link creation versus supplier deactivation in both winner orders", async () => {
    await runSupplierLifecycleRace("link-create", "action");
    await runSupplierLifecycleRace("link-create", "supplier");
  }, 45_000);

  it("forces link deactivation versus supplier deactivation in both winner orders", async () => {
    await runSupplierLifecycleRace("link-deactivate", "action");
    await runSupplierLifecycleRace("link-deactivate", "supplier");
  }, 45_000);
});
