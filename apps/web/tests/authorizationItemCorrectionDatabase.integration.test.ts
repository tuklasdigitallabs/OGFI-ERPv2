import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { SessionContext } from "../src/server/services/context";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const boundaryMock = vi.hoisted(() => ({
  assertCanManageCompanyScope: vi.fn().mockResolvedValue(undefined),
  requirePermission: vi.fn().mockResolvedValue(undefined),
  requireSessionContext: vi.fn(),
}));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/context")
  >("../src/server/services/context");
  return {
    ...actual,
    requireSessionContext: boundaryMock.requireSessionContext,
  };
});

vi.mock("../src/server/services/authorization", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/authorization")
  >("../src/server/services/authorization");
  return { ...actual, requirePermission: boundaryMock.requirePermission };
});

vi.mock("../src/server/services/coreAdmin", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/coreAdmin")
  >("../src/server/services/coreAdmin");
  return {
    ...actual,
    assertCanManageCompanyScope: boundaryMock.assertCanManageCompanyScope,
  };
});

const databaseEnabled =
  process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";
const initialName = "DEC-0241 original item name";

type ItemsService = typeof import("../src/server/services/items");

type ItemFixture = {
  alternateCategoryId: string;
  alternateUomId: string;
  baseUomId: string;
  companyId: string;
  issueUomId: string;
  itemCategoryId: string;
  itemId: string;
  purchaseUomId: string;
  updatedAt: Date;
};

type ItemFormOverrides = Partial<{
  baseUomId: string;
  expectedUpdatedAt: Date;
  issueUomId: string;
  itemCategoryId: string;
  itemType: string;
  requiresReceivingInspection: boolean;
  trackExpiry: boolean;
  trackInventory: boolean;
  trackLot: boolean;
  purchaseUomId: string;
}>;

describe.skipIf(!databaseEnabled).sequential(
  "DEC-0241 Item correction integrity against disposable PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let items: ItemsService;
    let tenantId: string;
    let primaryCompanyId: string;
    let foreignCompanyId: string;
    let actorId: string;
    let session: SessionContext;

    beforeAll(async () => {
      const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(
        process.env,
      );
      const database = await import("@ogfi/database");
      ({ prisma } = database);
      items = await import("../src/server/services/items");

      await prisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
      const identity = await prisma.$queryRaw<
        Array<{ currentDatabase: string }>
      >`SELECT current_database() AS "currentDatabase"`;
      expect(identity).toEqual([{ currentDatabase: expectedDatabase }]);

      const suffix = randomUUID().slice(0, 8);
      tenantId = randomUUID();
      primaryCompanyId = randomUUID();
      foreignCompanyId = randomUUID();
      actorId = randomUUID();
      await prisma.tenant.create({
        data: {
          id: tenantId,
          loginCode: `item-correction-${suffix}`,
          name: `DEC-0241 tenant ${suffix}`,
        },
      });
      await prisma.company.createMany({
        data: [
          {
            id: primaryCompanyId,
            tenantId,
            code: `IC-A-${suffix}`,
            legalName: `DEC-0241 primary company ${suffix}`,
            currencyCode: "PHP",
          },
          {
            id: foreignCompanyId,
            tenantId,
            code: `IC-B-${suffix}`,
            legalName: `DEC-0241 foreign company ${suffix}`,
            currencyCode: "PHP",
          },
        ],
      });
      await prisma.user.create({
        data: {
          id: actorId,
          tenantId,
          email: `item-correction-${suffix}@example.test`,
          displayName: `DEC-0241 actor ${suffix}`,
        },
      });
      session = {
        user: {
          id: actorId,
          email: `item-correction-${suffix}@example.test`,
          displayName: `DEC-0241 actor ${suffix}`,
          role: "Core Administrator",
        },
        context: {
          tenantId,
          companyId: primaryCompanyId,
          companyName: `DEC-0241 primary company ${suffix}`,
          brandId: "",
          brandName: "Company-wide",
          locationId: randomUUID(),
          locationName: "Head Office",
          locationType: "HEAD_OFFICE",
        },
        authorizedLocations: [],
        permissionCodes: [],
      } satisfies SessionContext;
      boundaryMock.requireSessionContext.mockResolvedValue(session);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    async function createFixture(input?: {
      companyId?: string;
      status?: "ACTIVE" | "INACTIVE";
    }): Promise<ItemFixture> {
      const suffix = randomUUID().slice(0, 8);
      const companyId = input?.companyId ?? primaryCompanyId;
      const itemCategoryId = randomUUID();
      const alternateCategoryId = randomUUID();
      const baseUomId = randomUUID();
      const purchaseUomId = randomUUID();
      const issueUomId = randomUUID();
      const alternateUomId = randomUUID();
      await prisma.itemCategory.createMany({
        data: [
          {
            id: itemCategoryId,
            tenantId,
            companyId,
            categoryCode: `IC-A-${suffix}`,
            categoryName: `DEC-0241 source category ${suffix}`,
            inventoryClass: "RAW_MATERIAL",
          },
          {
            id: alternateCategoryId,
            tenantId,
            companyId,
            categoryCode: `IC-B-${suffix}`,
            categoryName: `DEC-0241 alternate category ${suffix}`,
            inventoryClass: "PACKAGING",
          },
        ],
      });
      await prisma.uom.createMany({
        data: [
          [baseUomId, "B"],
          [purchaseUomId, "P"],
          [issueUomId, "I"],
          [alternateUomId, "A"],
        ].map(([id, marker]) => ({
          id: id as string,
          tenantId,
          companyId,
          uomCode: `IC-${marker}-${suffix}`,
          uomName: `DEC-0241 ${marker} UOM ${suffix}`,
          uomType: "COUNT",
        })),
      });
      const item = await prisma.item.create({
        data: {
          tenantId,
          companyId,
          itemCode: `IC-${suffix}`,
          itemName: initialName,
          itemCategoryId,
          itemType: "inventory",
          baseUomId,
          purchaseUomId,
          issueUomId,
          trackInventory: true,
          trackExpiry: false,
          trackLot: false,
          requiresReceivingInspection: false,
          status: input?.status ?? "ACTIVE",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        select: { id: true, updatedAt: true },
      });
      return {
        alternateCategoryId,
        alternateUomId,
        baseUomId,
        companyId,
        issueUomId,
        itemCategoryId,
        itemId: item.id,
        purchaseUomId,
        updatedAt: item.updatedAt,
      };
    }

    function correctionForm(
      fixture: ItemFixture,
      itemName: string,
      reason: string,
      overrides: ItemFormOverrides = {},
    ) {
      const values = {
        baseUomId: fixture.baseUomId,
        expectedUpdatedAt: fixture.updatedAt,
        issueUomId: fixture.issueUomId,
        itemCategoryId: fixture.itemCategoryId,
        itemType: "inventory",
        purchaseUomId: fixture.purchaseUomId,
        requiresReceivingInspection: false,
        trackExpiry: false,
        trackInventory: true,
        trackLot: false,
        ...overrides,
      };
      const form = new FormData();
      form.set("itemId", fixture.itemId);
      form.set("expectedUpdatedAt", values.expectedUpdatedAt.toISOString());
      form.set("itemName", itemName);
      form.set("itemCategoryId", values.itemCategoryId);
      form.set("itemType", values.itemType);
      form.set("baseUomId", values.baseUomId);
      form.set("purchaseUomId", values.purchaseUomId);
      form.set("issueUomId", values.issueUomId);
      form.set("trackInventory", String(values.trackInventory));
      form.set("trackExpiry", String(values.trackExpiry));
      form.set("trackLot", String(values.trackLot));
      form.set(
        "requiresReceivingInspection",
        String(values.requiresReceivingInspection),
      );
      form.set("reason", reason);
      return form;
    }

    function itemSnapshot(itemId: string) {
      return prisma.item.findUniqueOrThrow({
        where: { id: itemId },
        select: {
          id: true,
          tenantId: true,
          companyId: true,
          itemCode: true,
          itemName: true,
          itemCategoryId: true,
          itemType: true,
          baseUomId: true,
          purchaseUomId: true,
          issueUomId: true,
          trackInventory: true,
          trackExpiry: true,
          trackLot: true,
          requiresReceivingInspection: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    function itemUpdateAudits(itemId: string) {
      return prisma.auditEvent.findMany({
        where: {
          tenantId,
          entityType: "Item",
          entityId: itemId,
          eventType: "item.updated",
        },
        orderBy: { occurredAt: "asc" },
        select: {
          tenantId: true,
          companyId: true,
          actorUserId: true,
          eventType: true,
          entityType: true,
          entityId: true,
          beforeData: true,
          afterData: true,
          metadata: true,
        },
      });
    }

    test("two corrections sharing one version produce one winner, one conflict, and one exact audit", async () => {
      const fixture = await createFixture();
      const before = await itemSnapshot(fixture.itemId);
      const candidates = [
        {
          name: "DEC-0241 concurrent correction alpha",
          reason: "Correct the item label to alpha after catalog verification.",
        },
        {
          name: "DEC-0241 concurrent correction beta",
          reason: "Correct the item label to beta after catalog verification.",
        },
      ];

      const outcomes = await Promise.allSettled(
        candidates.map(({ name, reason }) =>
          items.updateItem(correctionForm(fixture, name, reason)),
        ),
      );
      const fulfilled = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<ItemsService["updateItem"]>>> =>
          outcome.status === "fulfilled",
      );
      const rejected = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({
        message: "ITEM_UPDATE_CONFLICT",
      });

      const after = await itemSnapshot(fixture.itemId);
      const winner = candidates.find(({ name }) => name === after.itemName);
      expect(winner).toBeDefined();
      expect(fulfilled[0]?.value).toMatchObject({
        id: fixture.itemId,
        itemName: winner?.name,
      });
      expect({ ...after, itemName: before.itemName, updatedAt: before.updatedAt }).toEqual(
        before,
      );
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      await expect(itemUpdateAudits(fixture.itemId)).resolves.toEqual([
        {
          tenantId,
          companyId: primaryCompanyId,
          actorUserId: actorId,
          eventType: "item.updated",
          entityType: "Item",
          entityId: fixture.itemId,
          beforeData: { itemName: initialName },
          afterData: { itemName: winner?.name },
          metadata: { reason: winner?.reason },
        },
      ]);
    });

    test("a stale correction token leaves the Item and audit history unchanged", async () => {
      const fixture = await createFixture();
      const before = await itemSnapshot(fixture.itemId);
      const staleUpdatedAt = new Date(fixture.updatedAt.getTime() - 1_000);

      await expect(
        items.updateItem(
          correctionForm(
            fixture,
            "DEC-0241 stale correction",
            "Attempt a stale correction after another editor changed the record.",
            { expectedUpdatedAt: staleUpdatedAt },
          ),
        ),
      ).rejects.toThrow("ITEM_UPDATE_CONFLICT");
      await expect(itemSnapshot(fixture.itemId)).resolves.toEqual(before);
      await expect(itemUpdateAudits(fixture.itemId)).resolves.toEqual([]);
    });

    test("an inactive Item leaves the record and audit history unchanged", async () => {
      const fixture = await createFixture({ status: "INACTIVE" });
      const before = await itemSnapshot(fixture.itemId);

      await expect(
        items.updateItem(
          correctionForm(
            fixture,
            "DEC-0241 inactive correction",
            "Attempt a correction against an inactive historical record.",
          ),
        ),
      ).rejects.toThrow("ITEM_NOT_ACTIVE");
      await expect(itemSnapshot(fixture.itemId)).resolves.toEqual(before);
      await expect(itemUpdateAudits(fixture.itemId)).resolves.toEqual([]);
    });

    test("a foreign-company Item is concealed and remains unchanged", async () => {
      const fixture = await createFixture({ companyId: foreignCompanyId });
      const before = await itemSnapshot(fixture.itemId);

      await expect(
        items.updateItem(
          correctionForm(
            fixture,
            "DEC-0241 foreign correction",
            "Attempt a correction outside the active company scope.",
          ),
        ),
      ).rejects.toThrow("ITEM_NOT_FOUND");
      await expect(itemSnapshot(fixture.itemId)).resolves.toEqual(before);
      await expect(itemUpdateAudits(fixture.itemId)).resolves.toEqual([]);
    });

    test("direct deactivation fails closed without changing the Item or audit history", async () => {
      const fixture = await createFixture();
      const before = await itemSnapshot(fixture.itemId);
      const form = new FormData();
      form.set("itemId", fixture.itemId);
      form.set("reason", "Attempt direct deactivation before governance is available.");

      await expect(items.deactivateItem(form)).rejects.toThrow(
        "ITEM_DEACTIVATION_GOVERNANCE_REQUIRED",
      );
      await expect(itemSnapshot(fixture.itemId)).resolves.toEqual(before);
      await expect(
        prisma.auditEvent.findMany({
          where: {
            tenantId,
            entityType: "Item",
            entityId: fixture.itemId,
            eventType: { in: ["item.updated", "item.deactivated"] },
          },
        }),
      ).resolves.toEqual([]);
    });

    const forgedMaterialFields = [
      {
        field: "category",
        overrides: (fixture: ItemFixture) => ({
          itemCategoryId: fixture.alternateCategoryId,
        }),
      },
      {
        field: "item type",
        overrides: () => ({ itemType: "service" }),
      },
      {
        field: "base UOM",
        overrides: (fixture: ItemFixture) => ({
          baseUomId: fixture.alternateUomId,
        }),
      },
      {
        field: "purchase UOM",
        overrides: (fixture: ItemFixture) => ({
          purchaseUomId: fixture.alternateUomId,
        }),
      },
      {
        field: "issue UOM",
        overrides: (fixture: ItemFixture) => ({
          issueUomId: fixture.alternateUomId,
        }),
      },
      {
        field: "inventory tracking",
        overrides: () => ({ trackInventory: false }),
      },
      {
        field: "expiry tracking",
        overrides: () => ({ trackExpiry: true }),
      },
      {
        field: "lot tracking",
        overrides: () => ({ trackLot: true }),
      },
      {
        field: "receiving inspection",
        overrides: () => ({ requiresReceivingInspection: true }),
      },
    ] satisfies Array<{
      field: string;
      overrides: (fixture: ItemFixture) => ItemFormOverrides;
    }>;

    test.each(forgedMaterialFields)(
      "a forged $field change leaves the Item and audit history unchanged",
      async ({ overrides }) => {
        const fixture = await createFixture();
        const before = await itemSnapshot(fixture.itemId);

        await expect(
          items.updateItem(
            correctionForm(
              fixture,
              "DEC-0241 forged material correction",
              "Attempt a governed-field change through the correction boundary.",
              overrides(fixture),
            ),
          ),
        ).rejects.toThrow("ITEM_MATERIAL_CHANGE_REQUIRES_REVIEW");
        await expect(itemSnapshot(fixture.itemId)).resolves.toEqual(before);
        await expect(itemUpdateAudits(fixture.itemId)).resolves.toEqual([]);
      },
    );
  },
);
