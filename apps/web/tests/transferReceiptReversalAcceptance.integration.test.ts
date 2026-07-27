import type { PrismaClient } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const databaseEnabled =
  process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";

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

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("has the exact receipt idempotency migrations applied and finished", async () => {
      const rows = await prisma.$queryRaw<
        Array<{ migrationName: string; checksum: string; finishedAt: Date | null }>
      >`
        SELECT migration_name AS "migrationName",
               checksum,
               finished_at AS "finishedAt"
          FROM "_prisma_migrations"
         WHERE migration_name IN (
           '20260727180000_inventory_transfer_receipt_idempotency',
           '20260728100000_inventory_transfer_receipt_idempotency_coherence'
         )
         ORDER BY migration_name
      `;
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.finishedAt !== null)).toBe(true);
      expect(rows[0]?.checksum).toBe(
        "8a80d49118218455b3c48cf9b9a27db082c7bbddcf683c721a867b7d51b8df87",
      );
      expect(rows[1]?.checksum).toBe(
        "302dcbf87167b845f2504ed40195cebf2198e7f2a4655d4214b35275b28dd542",
      );
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
      expect(constraints).toEqual([
        {
          convalidated: true,
          definition:
            'CHECK ((("idempotencyKey" IS NULL) AND ("idempotencyRequestHash" IS NULL)) OR (("idempotencyKey" IS NOT NULL) AND ("idempotencyRequestHash" IS NOT NULL) AND (btrim(("idempotencyRequestHash")::text) ~ \'^[0-9a-f]{64}$\'::text)))',
        },
      ]);

      const uniqueIndexes = await prisma.$queryRaw<Array<{ indexName: string }>>`
        SELECT indexname AS "indexName"
          FROM pg_indexes
         WHERE schemaname = current_schema()
           AND tablename = 'InventoryTransferReceipt'
           AND indexname = 'InventoryTransferReceipt_tenantId_companyId_idempotencyKey_key'
      `;
      expect(uniqueIndexes).toEqual([
        {
          indexName:
            "InventoryTransferReceipt_tenantId_companyId_idempotencyKey_key",
        },
      ]);
    });
  },
);
