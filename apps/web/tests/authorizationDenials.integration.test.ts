import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import { beforeAll, describe, expect, test } from "vitest";
import {
  finalizeExpiredAuthorizationDenialBuckets,
  recordAuthorizationDenial
} from "../src/server/services/authorizationDenials";

type Scope = { tenantId: string; companyId: string; locationId: string; actorUserId: string };
let scope: Scope;
let runBase: Date;

function runTime(hours: number, minutes = 0) {
  return new Date(runBase.getTime() + (hours * 60 + minutes) * 60_000);
}

function bucketKey() {
  return randomUUID().replaceAll("-", "").repeat(2);
}

async function createBucketAuditEvent(input: {
  bucketId: string;
  tenantId: string;
  companyId?: string | null;
  actorUserId?: string | null;
  eventType?: string;
  entityType?: string;
  entityId?: string;
}) {
  return prisma.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType ?? "authorization.denial.first",
      entityType: input.entityType ?? "AuthorizationDenialBucket",
      entityId: input.entityId ?? input.bucketId
    }
  });
}

async function insertAnonymousBucket(input: {
  id: string;
  tenantId: string;
  firstAuditEventId: string;
  windowStartedAt: Date;
  windowEndsAt: Date;
  key?: string;
  companyId?: string | null;
  locationId?: string | null;
}) {
  return prisma.$executeRaw`
    INSERT INTO "AuthorizationDenialBucket" (
      "id", "tenantId", "companyId", "locationId", "actorUserId", "subjectType",
      "action", "reason", "resource", "bucketKey", "windowStartedAt", "windowEndsAt",
      "denialCount", "firstDeniedAt", "lastDeniedAt", "firstAuditEventId", "createdAt", "updatedAt"
    ) VALUES (
      ${input.id}::uuid, ${input.tenantId}::uuid, ${input.companyId ?? null}::uuid,
      ${input.locationId ?? null}::uuid, NULL, 'ANONYMOUS'::"AuthorizationDenialSubjectType",
      'READ'::"AuthorizationDenialAction", 'PERMISSION_MISSING'::"AuthorizationDenialReason",
      'REPORTING'::"AuthorizationDenialResource", ${input.key ?? bucketKey()},
      ${input.windowStartedAt}, ${input.windowEndsAt}, 1, ${input.windowStartedAt},
      ${input.windowStartedAt}, ${input.firstAuditEventId}::uuid,
      ${input.windowStartedAt}, ${input.windowStartedAt}
    )`;
}

beforeAll(async () => {
  const horizons = await prisma.$queryRaw<Array<{ maxWindowEndsAt: Date | null }>>`
    SELECT max("windowEndsAt") AS "maxWindowEndsAt"
      FROM "AuthorizationDenialBucket"`;
  const minimumBase = Date.parse("2031-01-01T00:00:00.000Z");
  const afterExisting = (horizons[0]?.maxWindowEndsAt?.getTime() ?? minimumBase - 60 * 60_000)
    + 60 * 60_000;
  const hourMs = 60 * 60_000;
  runBase = new Date(Math.ceil(Math.max(minimumBase, afterExisting) / hourMs) * hourMs);
  let drained = false;
  for (let pass = 0; pass < 100; pass += 1) {
    const finalized = await finalizeExpiredAuthorizationDenialBuckets({
      now: runBase,
      batchSize: 500
    });
    if (finalized < 500) {
      drained = true;
      break;
    }
  }
  if (!drained) throw new Error("AUTHORIZATION_DENIAL_TEST_BACKLOG_EXCEEDS_BOUND");
  const overdue = await prisma.authorizationDenialBucket.count({
    where: { finalizedAt: null, windowEndsAt: { lte: runBase } }
  });
  if (overdue !== 0) throw new Error("AUTHORIZATION_DENIAL_TEST_BACKLOG_NOT_DRAINED");
  const occupied = await prisma.authorizationDenialBucket.count({
    where: { windowStartedAt: { gte: runBase } }
  });
  if (occupied !== 0) throw new Error("AUTHORIZATION_DENIAL_TEST_HORIZON_OCCUPIED");

  const rows = await prisma.$queryRaw<Scope[]>`
    SELECT t."id" AS "tenantId", c."id" AS "companyId", l."id" AS "locationId", u."id" AS "actorUserId"
    FROM "Tenant" t
    JOIN "Company" c ON c."tenantId" = t."id"
    JOIN "Location" l ON l."tenantId" = t."id" AND l."companyId" = c."id"
    JOIN "User" u ON u."tenantId" = t."id"
    ORDER BY t."id", c."id", l."id", u."id" LIMIT 1`;
  if (!rows[0]) throw new Error("AUTHORIZATION_DENIAL_TEST_SCOPE_MISSING");
  scope = rows[0];
});

function input(overrides: Partial<Parameters<typeof recordAuthorizationDenial>[0]> = {}) {
  return {
    ...scope,
    subjectType: "ACTOR" as const,
    action: "READ" as const,
    reason: "PERMISSION_MISSING" as const,
    resource: "REPORTING" as const,
    windowMinutes: 15,
    ...overrides
  };
}

describe("DEC-0050 denial buckets on PostgreSQL", () => {
  test("preserves an exact count and one first event under concurrency", async () => {
    const now = runTime(0, 1);
    const settled = await Promise.allSettled(
      Array.from({ length: 24 }, () => recordAuthorizationDenial(input(), { now }))
    );
    const rejected = settled.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(0);
    const results = settled
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof recordAuthorizationDenial>>> =>
        result.status === "fulfilled"
      )
      .map((result) => result.value);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    const bucketId = results[0]!.bucketId;
    const buckets = await prisma.$queryRaw<Array<{ denialCount: bigint; firstAuditEventId: string }>>`
      SELECT "denialCount", "firstAuditEventId" FROM "AuthorizationDenialBucket" WHERE "id" = ${bucketId}::uuid`;
    expect(buckets[0]?.denialCount).toBe(24n);
    expect(await prisma.auditEvent.count({ where: { entityId: bucketId, eventType: "authorization.denial.first" } })).toBe(1);
  });

  test("ignores attacker-selected details for cardinality and isolates tenants", async () => {
    const now = runTime(1, 1);
    const unsafeA = { ...input({ action: "EXPORT", resource: "EVIDENCE" }), targetId: randomUUID(), path: "/a", errorText: "a" };
    const unsafeB = { ...input({ action: "EXPORT", resource: "EVIDENCE" }), targetId: randomUUID(), path: "/b", errorText: "b" };
    const first = await recordAuthorizationDenial(unsafeA, { now });
    const second = await recordAuthorizationDenial(unsafeB, { now });
    expect(second.bucketId).toBe(first.bucketId);
    expect(second.count).toBe(2n);

    const tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, name: "Denial Isolation Tenant", loginCode: `denial-${tenantId}` } });
    const isolated = await recordAuthorizationDenial({
      tenantId, companyId: null, locationId: null, actorUserId: null,
      subjectType: "ANONYMOUS", action: "AUTHENTICATE",
      reason: "AUTHENTICATION_REQUIRED", resource: "AUTHENTICATION", windowMinutes: 15
    }, { now });
    expect(isolated.bucketId).not.toBe(first.bucketId);
  });

  test("separates otherwise identical dimensions across 5, 15, and 60 minute policies", async () => {
    const now = runTime(1, 30);
    const fiveMinute = await recordAuthorizationDenial(input({ windowMinutes: 5 }), { now });
    const fifteenMinute = await recordAuthorizationDenial(input({ windowMinutes: 15 }), { now });
    const sixtyMinute = await recordAuthorizationDenial(input({ windowMinutes: 60 }), { now });
    expect(new Set([
      fiveMinute.bucketId,
      fifteenMinute.bucketId,
      sixtyMinute.bucketId
    ])).toHaveLength(3);
    expect(new Set([
      fiveMinute.windowEndsAt.toISOString(),
      fifteenMinute.windowEndsAt.toISOString(),
      sixtyMinute.windowEndsAt.toISOString()
    ])).toHaveLength(3);
  });

  test("finalizes once, writes a summary only above one, and lazy rollover shares the path", async () => {
    const old = runTime(2, 1);
    const finalizeAt = runTime(2, 16);
    const repeatedInput = input({ action: "ADMINISTER", reason: "SCOPE_DENIED", resource: "SETTINGS" });
    const repeated = await recordAuthorizationDenial(repeatedInput, { now: old });
    await recordAuthorizationDenial(repeatedInput, { now: old });
    const [left, right] = await Promise.all([
      finalizeExpiredAuthorizationDenialBuckets({ now: finalizeAt, batchSize: 10 }),
      finalizeExpiredAuthorizationDenialBuckets({ now: finalizeAt, batchSize: 10 })
    ]);
    expect(left + right).toBeGreaterThanOrEqual(1);
    expect(await prisma.auditEvent.count({ where: { entityId: repeated.bucketId, eventType: "authorization.denial.summary" } })).toBe(1);
    expect(await finalizeExpiredAuthorizationDenialBuckets({ now: finalizeAt, batchSize: 10 })).toBe(0);

    const singleInput = input({ action: "SUBMIT", reason: "STATUS_DENIED", resource: "PROCUREMENT" });
    const single = await recordAuthorizationDenial(singleInput, { now: old });
    await recordAuthorizationDenial(singleInput, { now: finalizeAt });
    expect(await prisma.auditEvent.count({ where: { entityId: single.bucketId, eventType: "authorization.denial.summary" } })).toBe(0);
    const oldBucket = await prisma.authorizationDenialBucket.findUniqueOrThrow({ where: { id: single.bucketId } });
    expect(oldBucket.finalizedAt).not.toBeNull();
  });

  test("rejects cross-tenant and mismatched first or final evidence", async () => {
    const foreignTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: foreignTenantId,
        name: "Denial Foreign Evidence Tenant",
        loginCode: `denial-${foreignTenantId}`
      }
    });
    const started = runTime(3);
    const ends = runTime(3, 15);
    const crossTenantBucketId = randomUUID();
    const foreignEvent = await createBucketAuditEvent({
      bucketId: crossTenantBucketId,
      tenantId: foreignTenantId
    });
    await expect(insertAnonymousBucket({
      id: crossTenantBucketId,
      tenantId: scope.tenantId,
      firstAuditEventId: foreignEvent.id,
      windowStartedAt: started,
      windowEndsAt: ends
    })).rejects.toThrow();

    const wrongFirstBucketId = randomUUID();
    const wrongFirst = await createBucketAuditEvent({
      bucketId: wrongFirstBucketId,
      tenantId: scope.tenantId,
      eventType: "authorization.denial.summary"
    });
    await expect(insertAnonymousBucket({
      id: wrongFirstBucketId,
      tenantId: scope.tenantId,
      firstAuditEventId: wrongFirst.id,
      windowStartedAt: started,
      windowEndsAt: ends
    })).rejects.toThrow();

    for (const mismatch of [
      { companyId: scope.companyId, actorUserId: null, entityType: "AuthorizationDenialBucket" },
      { companyId: null, actorUserId: scope.actorUserId, entityType: "AuthorizationDenialBucket" },
      { companyId: null, actorUserId: null, entityType: "WrongEntityType" }
    ]) {
      const mismatchedBucketId = randomUUID();
      const mismatchedEvent = await createBucketAuditEvent({
        bucketId: mismatchedBucketId,
        tenantId: scope.tenantId,
        ...mismatch
      });
      await expect(insertAnonymousBucket({
        id: mismatchedBucketId,
        tenantId: scope.tenantId,
        firstAuditEventId: mismatchedEvent.id,
        windowStartedAt: started,
        windowEndsAt: ends
      })).rejects.toThrow();
    }

    const repeated = await recordAuthorizationDenial(
      input({ action: "CREATE", reason: "POLICY_DENIED", resource: "SETTINGS" }),
      { now: started }
    );
    await recordAuthorizationDenial(
      input({ action: "CREATE", reason: "POLICY_DENIED", resource: "SETTINGS" }),
      { now: started }
    );
    const wrongFinalId = randomUUID();
    await expect(prisma.$transaction(async (tx) => {
      await tx.auditEvent.create({
        data: {
          id: wrongFinalId,
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          actorUserId: scope.actorUserId,
          eventType: "authorization.denial.summary",
          entityType: "AuthorizationDenialBucket",
          entityId: randomUUID()
        }
      });
      await tx.$executeRaw`
        UPDATE "AuthorizationDenialBucket"
           SET "finalizedAt" = ${ends}, "finalAuditEventId" = ${wrongFinalId}::uuid,
               "updatedAt" = ${ends}
         WHERE "id" = ${repeated.bucketId}::uuid`;
    })).rejects.toThrow();
    expect(await prisma.auditEvent.count({ where: { id: wrongFinalId } })).toBe(0);
  });

  test("rejects invalid windows, scope shapes, cross-tenant company scope, and duplicate windows", async () => {
    const started = runTime(4);
    for (const minutes of [4, 61]) {
      const id = randomUUID();
      const event = await createBucketAuditEvent({ bucketId: id, tenantId: scope.tenantId });
      await expect(insertAnonymousBucket({
        id,
        tenantId: scope.tenantId,
        firstAuditEventId: event.id,
        windowStartedAt: started,
        windowEndsAt: new Date(started.getTime() + minutes * 60_000)
      })).rejects.toThrow();
    }

    const locationWithoutCompanyId = randomUUID();
    const locationWithoutCompanyEvent = await createBucketAuditEvent({
      bucketId: locationWithoutCompanyId,
      tenantId: scope.tenantId
    });
    await expect(insertAnonymousBucket({
      id: locationWithoutCompanyId,
      tenantId: scope.tenantId,
      locationId: scope.locationId,
      firstAuditEventId: locationWithoutCompanyEvent.id,
      windowStartedAt: started,
      windowEndsAt: new Date(started.getTime() + 15 * 60_000)
    })).rejects.toThrow();

    const foreignTenantId = randomUUID();
    const foreignCompanyId = randomUUID();
    const foreignLocationId = randomUUID();
    await prisma.tenant.create({ data: { id: foreignTenantId, name: "Denial Foreign Scope Tenant", loginCode: `denial-${foreignTenantId}` } });
    await prisma.company.create({
      data: {
        id: foreignCompanyId,
        tenantId: foreignTenantId,
        code: `DEN-${foreignCompanyId.slice(0, 8)}`,
        legalName: "Denial Foreign Scope Company",
        currencyCode: "PHP"
      }
    });
    await prisma.location.create({
      data: {
        id: foreignLocationId,
        tenantId: foreignTenantId,
        companyId: foreignCompanyId,
        locationType: "BRANCH",
        code: `DEN-${foreignLocationId.slice(0, 8)}`,
        name: "Denial Foreign Scope Location"
      }
    });
    const firstEventCount = await prisma.auditEvent.count({
      where: { tenantId: scope.tenantId, eventType: "authorization.denial.first" }
    });
    await expect(recordAuthorizationDenial(
      input({ locationId: foreignLocationId, action: "POST", resource: "INVENTORY" }),
      { now: started }
    )).rejects.toThrow();
    expect(await prisma.auditEvent.count({
      where: { tenantId: scope.tenantId, eventType: "authorization.denial.first" }
    })).toBe(firstEventCount);

    const existing = await recordAuthorizationDenial(
      input({ action: "DELETE", reason: "STATUS_DENIED", resource: "PROJECTS" }),
      { now: started }
    );
    const existingRow = await prisma.authorizationDenialBucket.findUniqueOrThrow({ where: { id: existing.bucketId } });
    const duplicateId = randomUUID();
    const duplicateEvent = await createBucketAuditEvent({
      bucketId: duplicateId,
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      actorUserId: scope.actorUserId
    });
    await expect(prisma.$executeRaw`
      INSERT INTO "AuthorizationDenialBucket" (
        "id", "tenantId", "companyId", "locationId", "actorUserId", "subjectType",
        "action", "reason", "resource", "bucketKey", "windowStartedAt", "windowEndsAt",
        "denialCount", "firstDeniedAt", "lastDeniedAt", "firstAuditEventId", "createdAt", "updatedAt"
      ) VALUES (
        ${duplicateId}::uuid, ${scope.tenantId}::uuid, ${scope.companyId}::uuid,
        ${scope.locationId}::uuid, ${scope.actorUserId}::uuid, 'ACTOR'::"AuthorizationDenialSubjectType",
        'DELETE'::"AuthorizationDenialAction", 'STATUS_DENIED'::"AuthorizationDenialReason",
        'PROJECTS'::"AuthorizationDenialResource", ${existingRow.bucketKey},
        ${existingRow.windowStartedAt}, ${existingRow.windowEndsAt}, 1,
        ${existingRow.firstDeniedAt}, ${existingRow.firstDeniedAt}, ${duplicateEvent.id}::uuid,
        ${existingRow.createdAt}, ${existingRow.updatedAt}
      )`).rejects.toThrow();
  });

  test("rejects deletion, truncation, tampering, mixed or future finalization, and unfinalization", async () => {
    const started = runTime(5, 1);
    const ends = runTime(5, 15);
    const repeatedInput = input({ action: "UPDATE", reason: "MFA_REQUIRED", resource: "ADMINISTRATION" });
    const repeated = await recordAuthorizationDenial(repeatedInput, { now: started });
    await recordAuthorizationDenial(repeatedInput, { now: started });

    await expect(prisma.$executeRaw`
      UPDATE "AuthorizationDenialBucket" SET "denialCount" = 1, "updatedAt" = ${started}
      WHERE "id" = ${repeated.bucketId}::uuid`).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "AuthorizationDenialBucket" SET "resource" = 'FINANCE'::"AuthorizationDenialResource",
        "denialCount" = "denialCount" + 1, "lastDeniedAt" = ${started}, "updatedAt" = ${started}
      WHERE "id" = ${repeated.bucketId}::uuid`).rejects.toThrow();

    const invalidSummaryId = randomUUID();
    await expect(prisma.$transaction(async (tx) => {
      await tx.auditEvent.create({
        data: {
          id: invalidSummaryId,
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          actorUserId: scope.actorUserId,
          eventType: "authorization.denial.summary",
          entityType: "AuthorizationDenialBucket",
          entityId: repeated.bucketId
        }
      });
      await tx.$executeRaw`
        UPDATE "AuthorizationDenialBucket"
           SET "denialCount" = "denialCount" + 1, "lastDeniedAt" = ${started},
               "finalizedAt" = ${ends}, "finalAuditEventId" = ${invalidSummaryId}::uuid,
               "updatedAt" = ${ends}
         WHERE "id" = ${repeated.bucketId}::uuid`;
    })).rejects.toThrow();
    expect(await prisma.auditEvent.count({
      where: {
        id: invalidSummaryId,
        entityId: repeated.bucketId,
        eventType: "authorization.denial.summary"
      }
    })).toBe(0);

    const futureSummaryId = randomUUID();
    await expect(prisma.$transaction(async (tx) => {
      await tx.auditEvent.create({
        data: {
          id: futureSummaryId,
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          actorUserId: scope.actorUserId,
          eventType: "authorization.denial.summary",
          entityType: "AuthorizationDenialBucket",
          entityId: repeated.bucketId
        }
      });
      await tx.$executeRaw`
        UPDATE "AuthorizationDenialBucket"
           SET "finalizedAt" = ${new Date(ends.getTime() - 1)},
               "finalAuditEventId" = ${futureSummaryId}::uuid, "updatedAt" = ${started}
         WHERE "id" = ${repeated.bucketId}::uuid`;
    })).rejects.toThrow();
    expect(await prisma.auditEvent.count({ where: { id: futureSummaryId } })).toBe(0);
    await expect(prisma.$executeRaw`
      DELETE FROM "AuthorizationDenialBucket" WHERE "id" = ${repeated.bucketId}::uuid`).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "AuthorizationDenialBucket"'
    )).rejects.toThrow();

    await finalizeExpiredAuthorizationDenialBuckets({ now: runTime(5, 16), batchSize: 100 });
    expect(await prisma.auditEvent.count({
      where: {
        entityId: repeated.bucketId,
        eventType: "authorization.denial.summary"
      }
    })).toBe(1);
    await expect(prisma.$executeRaw`
      UPDATE "AuthorizationDenialBucket"
         SET "finalizedAt" = NULL, "finalAuditEventId" = NULL,
             "updatedAt" = ${runTime(5, 17)}
       WHERE "id" = ${repeated.bucketId}::uuid`).rejects.toThrow();
  });
});
