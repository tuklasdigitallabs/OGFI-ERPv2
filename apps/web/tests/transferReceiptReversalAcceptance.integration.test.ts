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
  },
);
