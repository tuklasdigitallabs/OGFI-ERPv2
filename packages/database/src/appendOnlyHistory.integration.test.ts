import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const guardContractRequested = process.env.APPEND_ONLY_GUARD_CONTRACT === "yes";
const describeGuardContract = guardContractRequested ? describe : describe.skip;
const prisma = guardContractRequested ? new PrismaClient() : null;

const protectedTables = [
  "AuditEvent",
  "ProjectActivityEvent",
  "InventoryMovement",
] as const;

type ProtectedTable = (typeof protectedTables)[number];
type ProhibitedOperation = "UPDATE" | "DELETE" | "TRUNCATE";

type DatabaseIdentityRow = {
  currentDatabase: string;
  currentUser: string;
  sessionUser: string;
};

type DisposableMarkerRow = {
  singleton: boolean;
  databaseName: string;
  runId: string;
  nonceSha256: string;
};

type PrismaRawDatabaseError = Error & {
  code?: unknown;
  meta?: {
    code?: unknown;
    message?: unknown;
  };
};

const insertSqlByTable: Record<ProtectedTable, string> = {
  AuditEvent: `
    INSERT INTO public."AuditEvent" (
      "id", "tenantId", "companyId", "actorUserId", "eventType",
      "entityType", "entityId", "occurredAt", "requestId", "ipAddress",
      "beforeData", "afterData", "metadata"
    )
    SELECT
      gen_random_uuid(), company."tenantId", company."id", NULL,
      'append_only.contract.insert', 'AppendOnlyContract', gen_random_uuid(),
      CURRENT_TIMESTAMP, 'append-only-contract', NULL, NULL, NULL,
      jsonb_build_object('sourceDecisionId', 'DEC-0049')
    FROM public."Company" company
    ORDER BY company."id"
    LIMIT 1
    RETURNING "id"
  `,
  ProjectActivityEvent: `
    INSERT INTO public."ProjectActivityEvent" (
      "id", "tenantId", "companyId", "projectId", "actorUserId",
      "eventType", "entityType", "entityId", "occurredAt", "requestId",
      "correlationId", "reason", "beforeData", "afterData", "metadata"
    )
    SELECT
      gen_random_uuid(), project."tenantId", project."companyId", project."id",
      project."createdByUserId", 'append_only.contract.insert', 'Project',
      project."id", CURRENT_TIMESTAMP, 'append-only-contract', NULL,
      'DEC-0049 insert contract proof', NULL, NULL,
      jsonb_build_object('sourceDecisionId', 'DEC-0049')
    FROM public."Project" project
    ORDER BY project."id"
    LIMIT 1
    RETURNING "id"
  `,
  InventoryMovement: `
    INSERT INTO public."InventoryMovement" (
      "id", "tenantId", "companyId", "inventoryLocationId",
      "relatedInventoryLocationId", "itemId", "movementType", "occurredAt",
      "enteredQuantity", "enteredUomId", "quantityDeltaBaseUom", "baseUomId",
      "lotNumber", "expiryDate", "unitCost", "totalCost",
      "sourceDocumentType", "sourceDocumentId", "sourceDocumentLineId",
      "sourceEventKey", "reasonCode", "notes", "reversalOfMovementId",
      "postedByUserId", "createdAt"
    )
    SELECT
      gen_random_uuid(), movement."tenantId", movement."companyId",
      movement."inventoryLocationId", movement."relatedInventoryLocationId",
      movement."itemId", movement."movementType", movement."occurredAt",
      movement."enteredQuantity", movement."enteredUomId",
      movement."quantityDeltaBaseUom", movement."baseUomId", movement."lotNumber",
      movement."expiryDate", movement."unitCost", movement."totalCost",
      movement."sourceDocumentType", movement."sourceDocumentId",
      movement."sourceDocumentLineId",
      concat(movement."sourceEventKey", ':append-only-contract:', gen_random_uuid()),
      movement."reasonCode", movement."notes", movement."reversalOfMovementId",
      movement."postedByUserId", CURRENT_TIMESTAMP
    FROM public."InventoryMovement" movement
    ORDER BY movement."id"
    LIMIT 1
    RETURNING "id"
  `,
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`APPEND_ONLY_GUARD_CONTRACT_${name}_REQUIRED`);
  }
  return value;
}

async function verifyControlledDatabaseIdentity(): Promise<void> {
  if (!prisma) {
    throw new Error("Controlled PostgreSQL client was not initialized");
  }

  const expectedDatabaseName = requiredEnvironment(
    "OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME",
  );
  const expectedRunId = requiredEnvironment("OGFI_DISPOSABLE_DATABASE_RUN_ID");
  const expectedNonceSha256 = requiredEnvironment(
    "OGFI_DISPOSABLE_DATABASE_NONCE_SHA256",
  );
  const expectedSessionUser = requiredEnvironment(
    "OGFI_APPEND_ONLY_EXPECTED_SESSION_USER",
  );
  const expectedCurrentUser = requiredEnvironment(
    "OGFI_APPEND_ONLY_EXPECTED_CURRENT_USER",
  );

  expect(expectedDatabaseName).toMatch(
    /^ogfi_test_[a-z0-9_]{1,24}_[a-f0-9]{16}$/,
  );
  expect(expectedRunId).toMatch(/^[A-Za-z0-9._-]{6,128}$/);
  expect(expectedNonceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(expectedSessionUser).toMatch(/^ogfi_test_[a-z0-9_]+_migrator$/);
  expect(expectedCurrentUser).toMatch(/^ogfi_test_[a-z0-9_]+_owner$/);
  expect(expectedSessionUser).not.toBe(expectedCurrentUser);

  const identities = await prisma.$queryRawUnsafe<DatabaseIdentityRow[]>(`
    SELECT
      current_database() AS "currentDatabase",
      session_user AS "sessionUser",
      current_user AS "currentUser"
  `);
  expect(identities).toEqual([
    {
      currentDatabase: expectedDatabaseName,
      sessionUser: expectedSessionUser,
      currentUser: expectedCurrentUser,
    },
  ]);

  const markers = await prisma.$queryRawUnsafe<DisposableMarkerRow[]>(`
    SELECT
      singleton,
      database_name AS "databaseName",
      run_id AS "runId",
      nonce_sha256 AS "nonceSha256"
    FROM ogfi_disposable_control.database_identity
    ORDER BY database_name, run_id, nonce_sha256
  `);
  expect(markers).toEqual([
    {
      singleton: true,
      databaseName: expectedDatabaseName,
      runId: expectedRunId,
      nonceSha256: expectedNonceSha256,
    },
  ]);
}

async function insertFixture(
  transaction: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  table: ProtectedTable,
): Promise<string> {
  const rows = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
    insertSqlByTable[table],
  );
  expect(rows).toHaveLength(1);
  return rows[0]!.id;
}

function mutationSql(
  table: ProtectedTable,
  operation: ProhibitedOperation,
): string {
  switch (operation) {
    case "UPDATE":
      return `UPDATE public."${table}" SET "occurredAt" = "occurredAt" + interval '1 millisecond' WHERE "id" = $1::uuid`;
    case "DELETE":
      return `DELETE FROM public."${table}" WHERE "id" = $1::uuid`;
    case "TRUNCATE":
      return `TRUNCATE TABLE public."${table}" CASCADE`;
  }
}

async function expectFixtureAbsent(
  table: ProtectedTable,
  fixtureId: string,
): Promise<void> {
  if (!prisma) {
    throw new Error("Controlled PostgreSQL client was not initialized");
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
    `SELECT count(*) AS "rowCount" FROM public."${table}" WHERE "id" = $1::uuid`,
    fixtureId,
  );
  expect(rows).toEqual([{ rowCount: 0n }]);
}

class UnexpectedMutationSuccess extends Error {
  constructor(
    readonly table: ProtectedTable,
    readonly operation: ProhibitedOperation,
    readonly fixtureId: string,
  ) {
    super(`${operation} unexpectedly succeeded on ${table}`);
  }
}

async function expectMutationRejected(
  table: ProtectedTable,
  operation: ProhibitedOperation,
): Promise<void> {
  if (!prisma) {
    throw new Error("Controlled PostgreSQL client was not initialized");
  }

  let fixtureId: string | undefined;
  let rejectedError: unknown;
  try {
    await prisma.$transaction(async (transaction) => {
      fixtureId = await insertFixture(transaction, table);
      const sql = mutationSql(table, operation);
      if (operation === "TRUNCATE") {
        await transaction.$executeRawUnsafe(sql);
      } else {
        await transaction.$executeRawUnsafe(sql, fixtureId);
      }
      throw new UnexpectedMutationSuccess(table, operation, fixtureId);
    });
  } catch (error) {
    rejectedError = error;
  }

  expect(fixtureId).toBeDefined();
  await expectFixtureAbsent(table, fixtureId!);

  if (rejectedError instanceof UnexpectedMutationSuccess) {
    throw new Error(
      `APPEND_ONLY_GUARD_MISSING: ${rejectedError.message}; destructive probe was rolled back`,
    );
  }

  const databaseError = rejectedError as PrismaRawDatabaseError;
  expect(databaseError).toMatchObject({
    code: "P2010",
    meta: { code: "55000" },
  });
  expect(databaseError.meta?.message).toContain(
    `${table} is append-only; ${operation} is prohibited`,
  );
}

class RollbackInsertProof extends Error {
  constructor(
    readonly table: ProtectedTable,
    readonly fixtureId: string,
  ) {
    super(`rollback ${table} insert proof`);
  }
}

async function expectInsertAllowed(table: ProtectedTable): Promise<void> {
  if (!prisma) {
    throw new Error("Controlled PostgreSQL client was not initialized");
  }

  let rollbackError: unknown;
  try {
    await prisma.$transaction(async (transaction) => {
      const fixtureId = await insertFixture(transaction, table);
      throw new RollbackInsertProof(table, fixtureId);
    });
  } catch (error) {
    rollbackError = error;
  }

  expect(rollbackError).toBeInstanceOf(RollbackInsertProof);
  const proof = rollbackError as RollbackInsertProof;
  await expectFixtureAbsent(table, proof.fixtureId);
}

describeGuardContract("DEC-0049 append-only PostgreSQL guards", () => {
  beforeAll(async () => {
    await verifyControlledDatabaseIdentity();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("installs ENABLE ALWAYS statement guards on every protected table", async () => {
    if (!prisma) {
      throw new Error("Controlled PostgreSQL client was not initialized");
    }
    const triggers = await prisma.$queryRawUnsafe<
      Array<{ tableName: string; triggerEnabled: string }>
    >(`
      SELECT
        relation.relname AS "tableName",
        trigger.tgenabled AS "triggerEnabled"
      FROM pg_catalog.pg_trigger trigger
      JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND trigger.tgname = relation.relname || '_append_only_guard_trg'
        AND relation.relname IN ('AuditEvent', 'ProjectActivityEvent', 'InventoryMovement')
      ORDER BY relation.relname
    `);
    expect(triggers).toEqual(
      [...protectedTables]
        .sort()
        .map((tableName) => ({ tableName, triggerEnabled: "A" })),
    );
  });

  it("rolls back the destructive probe when a guard unexpectedly permits it", async () => {
    if (!prisma) {
      throw new Error("Controlled PostgreSQL client was not initialized");
    }

    const beforeRows = await prisma.$queryRawUnsafe<
      Array<{ rowCount: bigint }>
    >('SELECT count(*) AS "rowCount" FROM public."AuditEvent"');
    let fixtureId: string | undefined;
    let sentinel: unknown;
    try {
      await prisma.$transaction(async (transaction) => {
        fixtureId = await insertFixture(transaction, "AuditEvent");
        await transaction.$executeRawUnsafe(
          'ALTER TABLE public."AuditEvent" DISABLE TRIGGER "AuditEvent_append_only_guard_trg"',
        );
        // AuditEvent now has append-only AuthorizationDenialBucket evidence
        // dependents. Disable that removal guard inside the same deliberately
        // doomed transaction so this probe still reaches the unexpected-
        // success sentinel instead of being stopped by the newer child guard.
        await transaction.$executeRawUnsafe(
          'ALTER TABLE public."AuthorizationDenialBucket" DISABLE TRIGGER "AuthorizationDenialBucket_no_remove_trg"',
        );
        await transaction.$executeRawUnsafe(
          'TRUNCATE TABLE public."AuditEvent" CASCADE',
        );
        throw new UnexpectedMutationSuccess(
          "AuditEvent",
          "TRUNCATE",
          fixtureId,
        );
      });
    } catch (error) {
      sentinel = error;
    }

    expect(sentinel).toBeInstanceOf(UnexpectedMutationSuccess);
    expect(fixtureId).toBeDefined();
    await expectFixtureAbsent("AuditEvent", fixtureId!);
    expect(
      await prisma.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
        'SELECT count(*) AS "rowCount" FROM public."AuditEvent"',
      ),
    ).toEqual(beforeRows);
    expect(
      await prisma.$queryRawUnsafe<Array<{ triggerEnabled: string }>>(`
        SELECT trigger.tgenabled AS "triggerEnabled"
        FROM pg_catalog.pg_trigger trigger
        JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'AuditEvent'
          AND trigger.tgname = 'AuditEvent_append_only_guard_trg'
      `),
    ).toEqual([{ triggerEnabled: "A" }]);
    expect(
      await prisma.$queryRawUnsafe<Array<{ triggerEnabled: string }>>(`
        SELECT trigger.tgenabled AS "triggerEnabled"
        FROM pg_catalog.pg_trigger trigger
        JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'AuthorizationDenialBucket'
          AND trigger.tgname = 'AuthorizationDenialBucket_no_remove_trg'
      `),
    ).toEqual([{ triggerEnabled: "A" }]);
  });

  for (const table of protectedTables) {
    for (const operation of ["UPDATE", "DELETE", "TRUNCATE"] as const) {
      it(`rejects actual-row ${operation} independently on ${table}`, async () => {
        await expectMutationRejected(table, operation);
      });
    }

    it(`allows SELECT on ${table}`, async () => {
      if (!prisma) {
        throw new Error("Controlled PostgreSQL client was not initialized");
      }

      const rows = await prisma.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
        `SELECT count(*) AS "rowCount" FROM public."${table}"`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.rowCount).toBeGreaterThanOrEqual(0n);
    });

    it(`allows ${table} inserts and rolls the proof back`, async () => {
      await expectInsertAllowed(table);
    });
  }
});
