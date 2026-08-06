import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { SessionContext } from "../src/server/services/context";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const boundaryMock = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/context")
  >("../src/server/services/context");
  return {
    ...actual,
    requireSessionContext: boundaryMock.requireSessionContext,
  };
});

const databaseEnabled =
  process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";
const observationTimeoutMs = 4_000;
const settlementTimeoutMs = 5_000;
const reason = "DEC-0239 deterministic parent lifecycle race verification.";

type ItemsService = typeof import("../src/server/services/items");
type ParentRole = "category" | "base" | "purchase" | "issue";
type Winner = "item" | "parent";

type RaceFixture = {
  actorId: string;
  auditFixtureId: string;
  itemCode: string;
  itemInput: {
    baseUomId: string;
    issueUomId: string;
    itemCategoryId: string;
    purchaseUomId: string;
  };
  parentId: string;
  parentRole: ParentRole;
  session: SessionContext;
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Settlement<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

function describeSettlement(settlement: Settlement<unknown> | undefined) {
  if (!settlement) return "PENDING";
  if (settlement.status === "fulfilled") return "FULFILLED";
  return settlement.reason instanceof Error
    ? `REJECTED:${settlement.reason.message}`
    : `REJECTED:${String(settlement.reason)}`;
}

function tracked<T>(promise: Promise<T>) {
  let settled = false;
  let settlement: Settlement<T> | undefined;
  void promise.then(
    (value) => { settlement = { status: "fulfilled", value }; },
    (reason) => { settlement = { status: "rejected", reason }; },
  ).finally(() => { settled = true; }).catch(() => undefined);
  return {
    promise,
    isSettled: () => settled,
    settlement: () => settlement,
  };
}

async function within<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label}_TIMEOUT`)),
          timeoutMs,
        );
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
  settlement: () => Settlement<unknown> | undefined;
}) {
  const deadline = Date.now() + observationTimeoutMs;
  while (Date.now() < deadline) {
    const rows = await input.control.$queryRaw<
      Array<{ pid: number; query: string; waitEventType: string | null }>
    >`
      SELECT activity.pid,
             activity.query,
             activity.wait_event_type AS "waitEventType"
        FROM pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND ${input.blockerPid}::int = ANY(pg_blocking_pids(activity.pid))
       ORDER BY activity.pid ASC
    `;
    const writer = rows.find(({ query, waitEventType }) =>
      waitEventType === "Lock" && /"AuditEvent"/i.test(query),
    );
    if (writer) return writer.pid;
    if (input.isSettled()) {
      throw new Error(
        `DEC_0239_WINNER_SETTLED_BEFORE_AUDIT_LOCK_WAIT:${describeSettlement(input.settlement())}`,
      );
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(
    `DEC_0239_AUDIT_WRITER_LOCK_WAIT_NOT_OBSERVED:${input.blockerPid}`,
  );
}

async function waitForParentLockWait(input: {
  blockerPid: number;
  control: PrismaClient;
  isSettled: () => boolean;
  settlement: () => Settlement<unknown> | undefined;
  parentRole: ParentRole;
}) {
  const relation = input.parentRole === "category" ? "ItemCategory" : "Uom";
  const relationPattern = new RegExp(
    `FROM "${relation}"[\\s\\S]*FOR UPDATE`,
    "i",
  );
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
        blockers.includes(input.blockerPid) && relationPattern.test(query),
    );
    if (waiter) return waiter.pid;
    if (input.isSettled()) {
      throw new Error(
        `DEC_0239_LOSER_SETTLED_BEFORE_PARENT_LOCK_WAIT:${describeSettlement(input.settlement())}`,
      );
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(
    `DEC_0239_PARENT_LOCK_WAIT_NOT_OBSERVED:${relation}:${input.blockerPid}`,
  );
}

function itemForm(fixture: RaceFixture) {
  const form = new FormData();
  form.set("itemCode", fixture.itemCode);
  form.set("itemName", "DEC-0239 create winner candidate");
  form.set("itemCategoryId", fixture.itemInput.itemCategoryId);
  form.set("itemType", "inventory");
  form.set("baseUomId", fixture.itemInput.baseUomId);
  form.set("purchaseUomId", fixture.itemInput.purchaseUomId);
  form.set("issueUomId", fixture.itemInput.issueUomId);
  form.set("trackInventory", "true");
  form.set("reason", reason);
  return form;
}

function parentForm(fixture: RaceFixture) {
  const form = new FormData();
  form.set(
    fixture.parentRole === "category" ? "categoryId" : "uomId",
    fixture.parentId,
  );
  form.set("reason", reason);
  return form;
}

describe.skipIf(!databaseEnabled).sequential(
  "DEC-0239 Item parent lifecycle serialization against disposable PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let barrierPrisma: PrismaClient;
    let items: ItemsService;
    let tenantId: string;
    let companyId: string;
    let coreAdminPermissionId: string;

    beforeAll(async () => {
      const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(
        process.env,
      );
      const database = await import("@ogfi/database");
      ({ prisma } = database);
      items = await import("../src/server/services/items");

      await prisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
      const barrierUrl = new URL(process.env.DATABASE_URL as string);
      barrierUrl.searchParams.set("connection_limit", "2");
      barrierUrl.searchParams.set("pool_timeout", "10");
      barrierPrisma = new database.PrismaClient({
        datasourceUrl: barrierUrl.toString(),
      });
      await barrierPrisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(
        barrierPrisma,
        process.env,
      );
      const identity = await prisma.$queryRaw<
        Array<{ currentDatabase: string }>
      >`SELECT current_database() AS "currentDatabase"`;
      expect(identity).toEqual([{ currentDatabase: expectedDatabase }]);

      const suffix = randomUUID().slice(0, 8);
      tenantId = randomUUID();
      companyId = randomUUID();
      await prisma.tenant.create({
        data: {
          id: tenantId,
          loginCode: `item-lock-${suffix}`,
          name: `DEC-0239 tenant ${suffix}`,
        },
      });
      await prisma.company.create({
        data: {
          id: companyId,
          tenantId,
          code: `IL-${suffix}`,
          legalName: `DEC-0239 company ${suffix}`,
          currencyCode: "PHP",
        },
      });
      const coreAdminPermission = await prisma.permission.upsert({
        where: { code: "core.administer" },
        update: {},
        create: {
          code: "core.administer",
          module: "core",
          action: "administer",
        },
        select: { id: true },
      });
      coreAdminPermissionId = coreAdminPermission.id;
    });

    afterAll(async () => {
      await barrierPrisma?.$disconnect();
      await prisma?.$disconnect();
    });

    async function createFixture(
      parentRole: ParentRole,
    ): Promise<RaceFixture> {
      const suffix = randomUUID().slice(0, 8);
      const actorId = randomUUID();
      const sourceCategoryId = randomUUID();
      const targetCategoryId = randomUUID();
      const currentBaseUomId = randomUUID();
      const currentPurchaseUomId = randomUUID();
      const currentIssueUomId = randomUUID();
      const targetUomId = randomUUID();
      const itemCode = `IL-${suffix}`;

      await prisma.user.create({
        data: {
          id: actorId,
          tenantId,
          email: `item-parent-lock-${suffix}@example.test`,
          displayName: `DEC-0239 actor ${suffix}`,
        },
      });
      const actorRoleId = randomUUID();
      const activeAt = new Date(Date.now() - 60_000);
      await prisma.role.create({
        data: {
          id: actorRoleId,
          tenantId,
          code: `ITEM-LIFECYCLE-${suffix}`,
          name: `DEC-0239 item lifecycle actor ${suffix}`,
          permissions: { create: { permissionId: coreAdminPermissionId } },
        },
      });
      await prisma.userRoleAssignment.create({
        data: {
          id: randomUUID(),
          userId: actorId,
          roleId: actorRoleId,
          status: "ACTIVE",
          startsAt: activeAt,
        },
      });
      await prisma.userScopeAssignment.create({
        data: {
          id: randomUUID(),
          userId: actorId,
          scopeType: "COMPANY",
          scopeId: companyId,
          accessLevel: "MANAGE",
          status: "ACTIVE",
          startsAt: activeAt,
        },
      });
      await prisma.itemCategory.createMany({
        data: [
          {
            id: sourceCategoryId,
            tenantId,
            companyId,
            categoryCode: `IL-S-${suffix}`,
            categoryName: `Source category ${suffix}`,
            inventoryClass: "RAW_MATERIAL",
          },
          {
            id: targetCategoryId,
            tenantId,
            companyId,
            categoryCode: `IL-T-${suffix}`,
            categoryName: `Target category ${suffix}`,
            inventoryClass: "RAW_MATERIAL",
          },
        ],
      });
      await prisma.uom.createMany({
        data: [
          [currentBaseUomId, "B"],
          [currentPurchaseUomId, "P"],
          [currentIssueUomId, "I"],
          [targetUomId, "T"],
        ].map(([id, marker]) => ({
          id: id as string,
          tenantId,
          companyId,
          uomCode: `IL-${marker}-${suffix}`,
          uomName: `DEC-0239 ${marker} UOM ${suffix}`,
          uomType: "COUNT",
        })),
      });
      const auditFixture = await prisma.auditEvent.create({
        data: {
          tenantId,
          companyId,
          actorUserId: actorId,
          eventType: "test.item_parent_lifecycle.fixture",
          entityType: "ItemLifecycleRaceFixture",
          entityId: randomUUID(),
          metadata: { operation: "create", parentRole },
        },
        select: { id: true },
      });

      const itemInput = {
        itemCategoryId:
          parentRole === "category" ? targetCategoryId : sourceCategoryId,
        baseUomId:
          parentRole === "base" ? targetUomId : currentBaseUomId,
        purchaseUomId:
          parentRole === "purchase" ? targetUomId : currentPurchaseUomId,
        issueUomId:
          parentRole === "issue" ? targetUomId : currentIssueUomId,
      };
      const parentId =
        parentRole === "category" ? targetCategoryId : targetUomId;
      const session = {
        user: {
          id: actorId,
          email: `item-parent-lock-${suffix}@example.test`,
          displayName: `DEC-0239 actor ${suffix}`,
          role: "Core Administrator",
        },
        context: {
          tenantId,
          companyId,
          companyName: `DEC-0239 company ${suffix}`,
          brandId: "",
          brandName: "Company-wide",
          locationId: randomUUID(),
          locationName: "Head Office",
          locationType: "WAREHOUSE" as const,
        },
        authorizedLocations: [],
        permissionCodes: [],
      } satisfies SessionContext;
      return {
        actorId,
        auditFixtureId: auditFixture.id,
        itemCode,
        itemInput,
        parentId,
        parentRole,
        session,
      };
    }

    async function startActorForeignKeyBarrier(actorId: string) {
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
             WHERE id = ${actorId}::uuid
               AND "tenantId" = ${tenantId}::uuid
             FOR UPDATE
          `;
          if (actors[0]?.id !== actorId) {
            throw new Error("DEC_0239_ACTOR_BARRIER_FIXTURE_NOT_FOUND");
          }
          ready.resolve();
          await release.promise;
        },
        { timeout: 15_000 },
      );
      await within(
        Promise.race([ready.promise, blocker]),
        observationTimeoutMs,
        "DEC_0239_AUDIT_BARRIER_READY",
      );
      return { blocker, pid, release };
    }

    function executeItem(fixture: RaceFixture) {
      return items.createItem(itemForm(fixture));
    }

    function executeParent(fixture: RaceFixture) {
      return fixture.parentRole === "category"
        ? items.deactivateItemCategory(parentForm(fixture))
        : items.deactivateUom(parentForm(fixture));
    }

    async function sourceSnapshot(fixture: RaceFixture, itemId?: string) {
      const [parent, item, audits, auditFixture] = await Promise.all([
        fixture.parentRole === "category"
          ? prisma.itemCategory.findUniqueOrThrow({
              where: { id: fixture.parentId },
              select: { id: true, status: true },
            })
          : prisma.uom.findUniqueOrThrow({
              where: { id: fixture.parentId },
              select: { id: true, status: true },
            }),
        prisma.item.findFirst({
          where: itemId
            ? { id: itemId, tenantId, companyId }
            : { tenantId, companyId, itemCode: fixture.itemCode },
          select: {
            id: true,
            status: true,
            itemName: true,
            itemCategoryId: true,
            baseUomId: true,
            purchaseUomId: true,
            issueUomId: true,
          },
        }),
        prisma.auditEvent.findMany({
          where: {
            actorUserId: fixture.actorId,
            eventType: {
              in: [
                "item.created",
                "item_category.deactivated",
                "uom.deactivated",
              ],
            },
          },
          orderBy: { occurredAt: "asc" },
          select: { actorUserId: true, entityId: true, eventType: true },
        }),
        prisma.auditEvent.findUnique({
          where: { id: fixture.auditFixtureId },
          select: { id: true, eventType: true },
        }),
      ]);
      return { auditFixture, audits, item, parent };
    }

    async function runRace(
      parentRole: ParentRole,
      winner: Winner,
    ) {
      const fixture = await createFixture(parentRole);
      boundaryMock.requireSessionContext.mockResolvedValue(fixture.session);
      const [{ getGrantedPermissionCodes }, { assertCanManageCompanyMasterDataScope }] =
        await Promise.all([
          import("../src/server/services/authorization"),
          import("../src/server/services/coreAdmin"),
        ]);
      await expect(getGrantedPermissionCodes(fixture.session)).resolves.toContain(
        "core.administer",
      );
      await expect(
        assertCanManageCompanyMasterDataScope(fixture.session, companyId),
      ).resolves.toBeUndefined();
      const before = await sourceSnapshot(fixture);
      expect(before.parent.status).toBe("ACTIVE");
      expect(before.audits).toEqual([]);
      expect(before.auditFixture).toEqual({
        id: fixture.auditFixtureId,
        eventType: "test.item_parent_lifecycle.fixture",
      });

      // AuditEvent.actorUserId has a real FK to User. Its insert takes a
      // KEY SHARE row lock on the actor, which conflicts with this fixture's
      // FOR UPDATE lock. The winner therefore pauses after its source write
      // owns the parent row and before either source or audit can commit.
      const barrier = await startActorForeignKeyBarrier(fixture.actorId);
      let createdItemId: string | undefined;
      const winnerOperation = tracked(
        winner === "item"
          ? executeItem(fixture).then((item) => {
              createdItemId = item.id;
              return item;
            })
          : executeParent(fixture),
      );
      let loserOperation:
        | ReturnType<typeof tracked<unknown>>
        | undefined;
      let observationError: unknown;
      try {
        const winnerPid = await waitForAuditWriterBlocked({
          blockerPid: barrier.pid,
          control: prisma,
          isSettled: winnerOperation.isSettled,
          settlement: winnerOperation.settlement,
        });
        loserOperation = tracked(
          winner === "item"
            ? executeParent(fixture)
            : executeItem(fixture),
        );
        const loserPid = await waitForParentLockWait({
          blockerPid: winnerPid,
          control: prisma,
          isSettled: loserOperation.isSettled,
          settlement: loserOperation.settlement,
          parentRole,
        });
        expect(loserPid).not.toBe(winnerPid);
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
        `DEC_0239_create_${parentRole}_${winner}_SETTLEMENT`,
      );
      if (observationError) throw observationError;
      expect(outcomes[0]?.status).toBe("fulfilled");
      if (outcomes[1]?.status !== "fulfilled") {
        throw new Error(
          `DEC_0239_WINNER_REJECTED:${describeSettlement(outcomes[1] as Settlement<unknown>)}`,
        );
      }
      expect(outcomes[1]?.status).toBe("fulfilled");

      const loserError =
        winner === "item"
          ? parentRole === "category"
            ? "ITEM_CATEGORY_HAS_ACTIVE_ITEMS"
            : "UOM_HAS_ACTIVE_ITEMS"
          : parentRole === "category"
            ? "ITEM_CATEGORY_NOT_FOUND"
            : parentRole === "base"
              ? "BASE_UOM_NOT_FOUND"
              : parentRole === "purchase"
                ? "PURCHASE_UOM_NOT_FOUND"
                : "ISSUE_UOM_NOT_FOUND";
      expect(outcomes[2]).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ message: loserError }),
      });

      const after = await sourceSnapshot(fixture, createdItemId);
      expect(after.auditFixture).toEqual(before.auditFixture);
      if (winner === "item") {
        expect(after.parent.status).toBe("ACTIVE");
        expect(after.item).toMatchObject({
          status: "ACTIVE",
          itemCategoryId: fixture.itemInput.itemCategoryId,
          baseUomId: fixture.itemInput.baseUomId,
          purchaseUomId: fixture.itemInput.purchaseUomId,
          issueUomId: fixture.itemInput.issueUomId,
        });
        expect(after.audits).toEqual([
          {
            actorUserId: fixture.actorId,
            entityId: after.item?.id,
            eventType: "item.created",
          },
        ]);
      } else {
        expect(after.parent.status).toBe("INACTIVE");
        expect(after.item).toEqual(before.item);
        expect(after.audits).toEqual([
          {
            actorUserId: fixture.actorId,
            entityId: fixture.parentId,
            eventType:
              parentRole === "category"
                ? "item_category.deactivated"
                : "uom.deactivated",
          },
        ]);
      }
    }

    const matrix = (["category", "base", "purchase", "issue"] as const).map(
      (parentRole) => ({ parentRole }),
    );

    test.each(matrix)(
      "create versus $parentRole deactivation serializes in both winner orders",
      async ({ parentRole }) => {
        await runRace(parentRole, "item");
        await runRace(parentRole, "parent");
      },
      30_000,
    );
  },
);
