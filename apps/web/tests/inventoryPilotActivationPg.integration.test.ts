import { createHash, randomUUID } from "node:crypto";
import { prisma, type TransactionClient } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const runPg = process.env.RUN_INVENTORY_PILOT_ACTIVATION_PG_TESTS === "true";
const pgDescribe = runPg ? describe : describe.skip;
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;

type FixtureScope = {
  tenantId: string;
  companyId: string;
  actorUserId: string;
};

type SealedRevision = {
  id: string;
  revisionNumber: number;
  configurationDigest: string;
};

type ApprovalFamily = "InventoryTransfer" | "StockCountAttemptReview";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function revisionCanonicalJson(input: {
  scope: FixtureScope;
  revisionNumber: number;
  sourceDecisionId: string;
}) {
  return JSON.stringify({
    companyId: input.scope.companyId,
    endpoints: [],
    items: [],
    revisionNumber: input.revisionNumber,
    schemaVersion: 1,
    sourceDecisionId: input.sourceDecisionId,
    status: "SEALED",
    tenantId: input.scope.tenantId,
  });
}

function activationCanonicalJson(input: {
  scope: FixtureScope;
  family: ApprovalFamily;
  revision: SealedRevision;
  activationReason: string;
}) {
  return JSON.stringify({
    activatedByUserId: input.scope.actorUserId,
    activationReason: input.activationReason,
    companyId: input.scope.companyId,
    configurationDigest: input.revision.configurationDigest,
    configurationRevisionId: input.revision.id,
    configurationRevisionNumber: input.revision.revisionNumber,
    family: input.family,
    generation: 1,
    priorActivationEventId: null,
    priorGeneration: null,
    schemaVersion: 1,
    status: "ACTIVE",
    tenantId: input.scope.tenantId,
  });
}

function errorText(error: unknown) {
  if (typeof error !== "object" || error === null) return String(error);
  const candidate = error as { message?: unknown; meta?: { message?: unknown } };
  return [candidate.message, candidate.meta?.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

async function createScope(): Promise<FixtureScope> {
  const suffix = randomUUID().slice(0, 8);
  const scope = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    actorUserId: randomUUID(),
  };
  await prisma.tenant.create({
    data: {
      id: scope.tenantId,
      name: `Inventory pilot activation tenant ${suffix}`,
      loginCode: `ipa-${suffix}`,
    },
  });
  await prisma.company.create({
    data: {
      id: scope.companyId,
      tenantId: scope.tenantId,
      code: `IPA-${suffix}`,
      legalName: `Inventory pilot activation company ${suffix}`,
      currencyCode: "PHP",
    },
  });
  await prisma.user.create({
    data: {
      id: scope.actorUserId,
      tenantId: scope.tenantId,
      email: `inventory-pilot-activation-${suffix}@example.test`,
      displayName: "Inventory pilot activation tester",
    },
  });
  return scope;
}

async function createSealedRevision(
  tx: TransactionClient,
  scope: FixtureScope,
  revisionNumber: number,
  digestOverride?: string,
): Promise<SealedRevision> {
  const sourceDecisionId = `DEC-0261-PG-${revisionNumber}`;
  const canonicalJson = revisionCanonicalJson({ scope, revisionNumber, sourceDecisionId });
  const revision = {
    id: randomUUID(),
    revisionNumber,
    configurationDigest: digestOverride ?? sha256(canonicalJson),
  };
  await tx.$executeRaw`
    INSERT INTO "InventoryPilotConfigurationRevision" (
      id, "tenantId", "companyId", "revisionNumber", "schemaVersion", status,
      "canonicalJson", "configurationDigest", "sourceDecisionId", "sealedByUserId", "sealedAt"
    ) VALUES (
      ${revision.id}::uuid, ${scope.tenantId}::uuid, ${scope.companyId}::uuid,
      ${revision.revisionNumber}, 1, 'SEALED', ${canonicalJson},
      ${revision.configurationDigest}, ${sourceDecisionId}, ${scope.actorUserId}::uuid,
      CURRENT_TIMESTAMP
    )
  `;
  return revision;
}

async function activateRevision(
  tx: TransactionClient,
  input: {
    scope: FixtureScope;
    family: ApprovalFamily;
    revision: SealedRevision;
    activationHashOverride?: string;
  },
) {
  const activationReason = "Disposable PostgreSQL activation serialization verification.";
  const canonicalJson = activationCanonicalJson({
    scope: input.scope,
    family: input.family,
    revision: input.revision,
    activationReason,
  });
  const eventId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "InventoryPilotFamilyActivationEvent" (
      id, "tenantId", "companyId", family, status, "configurationRevisionId",
      "configurationRevisionNumber", "configurationDigest", generation,
      "priorActivationEventId", "priorGeneration", "activatedByUserId",
      "activationReason", "canonicalJson", "activationHash", "activatedAt"
    ) VALUES (
      ${eventId}::uuid, ${input.scope.tenantId}::uuid, ${input.scope.companyId}::uuid,
      ${input.family}::"InventoryPilotApprovalFamily", 'ACTIVE',
      ${input.revision.id}::uuid, ${input.revision.revisionNumber},
      ${input.revision.configurationDigest}, 1, NULL, NULL,
      ${input.scope.actorUserId}::uuid, ${activationReason}, ${canonicalJson},
      ${input.activationHashOverride ?? sha256(canonicalJson)}, CURRENT_TIMESTAMP
    )
  `;
  await tx.$executeRaw`
    INSERT INTO "InventoryPilotFamilyActivation" (
      id, "tenantId", "companyId", family, status, "configurationRevisionId",
      "configurationRevisionNumber", "configurationDigest", "currentActivationEventId",
      generation, "updatedAt"
    ) VALUES (
      ${randomUUID()}::uuid, ${input.scope.tenantId}::uuid, ${input.scope.companyId}::uuid,
      ${input.family}::"InventoryPilotApprovalFamily", 'ACTIVE',
      ${input.revision.id}::uuid, ${input.revision.revisionNumber},
      ${input.revision.configurationDigest}, ${eventId}::uuid, 1, CURRENT_TIMESTAMP
    )
  `;
}

async function waitForAdvisoryBlock(blockerPid: number, blockedPid: number) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<
      Array<{ waitEvent: string | null; waitEventType: string | null }>
    >`
      SELECT activity.wait_event AS "waitEvent", activity.wait_event_type AS "waitEventType"
        FROM pg_stat_activity activity
       WHERE activity.pid = ${blockedPid}::int
         AND ${blockerPid}::int = ANY(pg_blocking_pids(activity.pid))
    `;
    const row = rows[0];
    if (row?.waitEventType === "Lock" && row.waitEvent === "advisory") return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`INVENTORY_PILOT_ADVISORY_BLOCK_NOT_OBSERVED:${blockerPid}:${blockedPid}`);
}

pgDescribe("DEC-0261 inventory-pilot activation PostgreSQL contract", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const database = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    expect(database).toEqual([{ currentDatabase: expectedDatabase }]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("accepts a minimal sealed revision whose deferred digest validation uses public.digest", async () => {
    const scope = await createScope();
    const revision = await prisma.$transaction((tx) => createSealedRevision(tx, scope, 1));
    const rows = await prisma.$queryRaw<
      Array<{ canonicalJson: string; configurationDigest: string }>
    >`
      SELECT "canonicalJson", "configurationDigest"
        FROM "InventoryPilotConfigurationRevision"
       WHERE id = ${revision.id}::uuid
    `;
    expect(rows).toEqual([
      {
        canonicalJson: revisionCanonicalJson({
          scope,
          revisionNumber: 1,
          sourceDecisionId: "DEC-0261-PG-1",
        }),
        configurationDigest: revision.configurationDigest,
      },
    ]);
  });

  test("serializes cross-family activation and fails closed when sealed revisions differ", async () => {
    const scope = await createScope();
    const firstRevision = await prisma.$transaction((tx) => createSealedRevision(tx, scope, 1));
    const secondRevision = await prisma.$transaction((tx) => createSealedRevision(tx, scope, 2));
    const firstReady = deferred();
    const releaseFirst = deferred();
    const secondStarted = deferred();
    let firstPid = 0;
    let secondPid = 0;
    let secondActivation: Promise<void> | undefined;

    const firstActivation = prisma.$transaction(async (tx) => {
      try {
        [{ pid: firstPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        await activateRevision(tx, {
          scope,
          family: "InventoryTransfer",
          revision: firstRevision,
        });
        firstReady.resolve();
        await releaseFirst.promise;
      } catch (error) {
        firstReady.reject(error);
        throw error;
      }
    }, { timeout: 15_000 });

    try {
      await firstReady.promise;
      secondActivation = prisma.$transaction(async (tx) => {
        try {
          [{ pid: secondPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
            SELECT pg_backend_pid() AS pid
          `;
          secondStarted.resolve();
          await activateRevision(tx, {
            scope,
            family: "StockCountAttemptReview",
            revision: secondRevision,
          });
        } catch (error) {
          secondStarted.reject(error);
          throw error;
        }
      }, { timeout: 15_000 });

      await secondStarted.promise;
      await waitForAdvisoryBlock(firstPid, secondPid);
      releaseFirst.resolve();

      const [firstResult, secondResult] = await Promise.allSettled([
        firstActivation,
        secondActivation,
      ]);
      expect(firstResult.status).toBe("fulfilled");
      expect(secondResult.status).toBe("rejected");
      if (secondResult.status === "rejected") {
        expect(errorText(secondResult.reason)).toContain(
          "INVENTORY_PILOT_CROSS_FAMILY_REVISION_MISMATCH",
        );
      }
    } finally {
      releaseFirst.resolve();
      await Promise.allSettled([firstActivation, ...(secondActivation ? [secondActivation] : [])]);
    }

    const activeStates = await prisma.$queryRaw<
      Array<{ family: ApprovalFamily; configurationRevisionId: string; configurationDigest: string }>
    >`
      SELECT family::text AS family, "configurationRevisionId", "configurationDigest"
        FROM "InventoryPilotFamilyActivation"
       WHERE "tenantId" = ${scope.tenantId}::uuid
         AND "companyId" = ${scope.companyId}::uuid
         AND status = 'ACTIVE'
       ORDER BY family ASC
    `;
    expect(activeStates).toEqual([
      {
        family: "InventoryTransfer",
        configurationRevisionId: firstRevision.id,
        configurationDigest: firstRevision.configurationDigest,
      },
    ]);
  }, 30_000);

  test("rejects both sealed-revision and activation digest corruption", async () => {
    const scope = await createScope();
    const badRevision = await Promise.allSettled([
      prisma.$transaction((tx) => createSealedRevision(tx, scope, 1, "0".repeat(64))),
    ]);
    expect(badRevision[0]?.status).toBe("rejected");
    if (badRevision[0]?.status === "rejected") {
      expect(errorText(badRevision[0].reason)).toContain(
        "INVENTORY_PILOT_REVISION_DIGEST_MISMATCH",
      );
    }

    const validRevision = await prisma.$transaction((tx) => createSealedRevision(tx, scope, 1));
    const badActivation = await Promise.allSettled([
      prisma.$transaction((tx) =>
        activateRevision(tx, {
          scope,
          family: "InventoryTransfer",
          revision: validRevision,
          activationHashOverride: "0".repeat(64),
        }),
      ),
    ]);
    expect(badActivation[0]?.status).toBe("rejected");
    if (badActivation[0]?.status === "rejected") {
      expect(errorText(badActivation[0].reason)).toContain(
        "INVENTORY_PILOT_ACTIVATION_EVENT_DIGEST_MISMATCH",
      );
    }
  });
});
