import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@ogfi/database";
import {
  assertAuthenticationThrottleKeyRotationReady,
  buildAuthenticationThrottleDimensions,
  completeSuccessfulAuthenticationAttemptInTransaction,
  loadAuthenticationThrottleConfig,
  reserveAuthenticationAttempt,
  transitionAuthenticationThrottleControl,
} from "./authenticationThrottle";

const runPg = process.env.RUN_AUTH_THROTTLE_PG_TESTS === "true";
const tenantOne = randomUUID();
const tenantTwo = randomUUID();
const accountOne = randomUUID();
const accountTwo = randomUUID();
const thresholdAccount = randomUUID();
const now = new Date(Date.now() - 400 * 24 * 60 * 60_000);
const config = runPg ? loadAuthenticationThrottleConfig() : null;

function pgConfig() {
  if (!config) throw new Error("AUTH_THROTTLE_PG_CONFIG_UNAVAILABLE");
  return config;
}

async function consumeWithFreshAudit(
  reservation: Extract<
    Awaited<ReturnType<typeof reserveAuthenticationAttempt>>,
    { allowed: true }
  >["reservation"],
  options: { failAfterConsumption?: boolean } = {}
) {
  return prisma.$transaction(async (tx) => {
    await tx.auditEvent.create({
      data: {
        id: reservation.id,
        tenantId: reservation.tenantId!,
        actorUserId: reservation.accountUserId!,
        eventType: reservation.attemptType === "PASSWORD"
          ? "auth.password.succeeded"
          : "auth.mfa.challenge_succeeded",
        entityType: "AuthSession",
        entityId: randomUUID()
      }
    });
    const result = await completeSuccessfulAuthenticationAttemptInTransaction(
      reservation,
      { client: tx, config: pgConfig() }
    );
    if (options.failAfterConsumption) throw new Error("INJECTED_POST_CONSUMPTION_FAILURE");
    return result;
  });
}

describe.skipIf(!runPg)("authentication throttle PostgreSQL contract", () => {
  beforeAll(async () => {
    await prisma.$executeRaw`
      INSERT INTO "Tenant" (id, name, "loginCode", status, "createdAt", "updatedAt")
      VALUES
        (${tenantOne}::uuid, 'Throttle Tenant One', ${`thr-${tenantOne.slice(0, 8)}`}, 'ACTIVE', ${now}, ${now}),
        (${tenantTwo}::uuid, 'Throttle Tenant Two', ${`thr-${tenantTwo.slice(0, 8)}`}, 'ACTIVE', ${now}, ${now})`;
    await prisma.$executeRaw`
      INSERT INTO "User" (id, "tenantId", email, "displayName", status, "createdAt", "updatedAt")
      VALUES
        (${accountOne}::uuid, ${tenantOne}::uuid, ${`${accountOne}@test.invalid`}, 'Account One', 'ACTIVE', ${now}, ${now}),
        (${accountTwo}::uuid, ${tenantTwo}::uuid, ${`${accountTwo}@test.invalid`}, 'Account Two', 'ACTIVE', ${now}, ${now}),
        (${thresholdAccount}::uuid, ${tenantOne}::uuid, ${`${thresholdAccount}@test.invalid`}, 'Threshold Account', 'ACTIVE', ${now}, ${now})`;
  });

  test("serializes hundreds of concurrent reservations with exact threshold counters", async () => {
    const expectedDimensions = buildAuthenticationThrottleDimensions(
      {
        attemptType: "PASSWORD",
        identifierSignal: "account-one@test.invalid",
        sourceSignal: "198.51.100.10",
        tenantId: tenantOne,
        accountUserId: thresholdAccount
      },
      pgConfig()
    );
    const beforeRows = await prisma.authenticationThrottleWindow.findMany({
      where: {
        attemptType: "PASSWORD",
        keyVersion: pgConfig().keyVersion,
        bucketKey: { in: expectedDimensions.map(({ bucketKey }) => bucketKey) },
        windowEndsAt: { gt: new Date() }
      },
      select: {
        bucketKey: true,
        requestCount: true,
        failureReservationCount: true,
        successCount: true,
        deniedCount: true
      }
    });
    const beforeByKey = new Map(beforeRows.map((row) => [row.bucketKey, row]));
    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        reserveAuthenticationAttempt(
          {
            attemptType: "PASSWORD",
            identifierSignal: "account-one@test.invalid",
            sourceSignal: "198.51.100.10",
            tenantId: tenantOne,
            accountUserId: thresholdAccount
          },
          { config: pgConfig() }
        )
      )
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(100);
    expect(results.filter((result) => result.reason === "LIMIT_EXCEEDED"))
      .toHaveLength(100);
    const rows = await prisma.authenticationThrottleWindow.findMany({
      where: {
        attemptType: "PASSWORD",
        keyVersion: pgConfig().keyVersion,
        bucketKey: { in: expectedDimensions.map(({ bucketKey }) => bucketKey) },
        windowEndsAt: { gt: new Date() }
      }
    });
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      const before = beforeByKey.get(row.bucketKey);
      expect(row.requestCount - (before?.requestCount ?? 0n)).toBe(200n);
      expect(row.failureReservationCount - (before?.failureReservationCount ?? 0n))
        .toBe(200n);
      expect(row.successCount - (before?.successCount ?? 0n)).toBe(0n);
      expect(row.deniedCount - (before?.deniedCount ?? 0n)).toBe(
        row.dimensionType === "ACCOUNT" ? 100n : 0n
      );
    }
  }, 60_000);

  test("keeps thousands of unknown varying inputs within the fixed shard formula", async () => {
    let denied = 0;
    const batches = Array.from({ length: 20 }, (_, batch) => batch);
    for (const batch of batches) {
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, offset) => {
          const index = batch * 100 + offset;
          return reserveAuthenticationAttempt(
            {
              attemptType: "MFA",
              identifierSignal: `unknown-${index}@test.invalid`,
              sourceSignal: `source-${index}`
            },
            { config: pgConfig() }
          );
        })
      );
      denied += results.filter((result) => !result.allowed).length;
    }
    const rows = await prisma.authenticationThrottleWindow.count({
      where: { attemptType: "MFA" }
    });
    expect(rows).toBeLessThanOrEqual(
      1 + pgConfig().identifierShardCount + pgConfig().sourceShardCount
    );
    expect(denied).toBe(0);
  }, 120_000);

  test("separates resolved account dimensions by tenant", async () => {
    for (const resolved of [
      { tenantId: tenantOne, accountUserId: accountOne },
      { tenantId: tenantTwo, accountUserId: accountTwo }
    ]) {
      const result = await reserveAuthenticationAttempt(
        {
          attemptType: "PASSWORD",
          identifierSignal: "same@test.invalid",
          sourceSignal: "same-source",
          ...resolved
        },
        { config: pgConfig() }
      );
      expect(result.allowed).toBe(true);
    }
    expect(
      await prisma.authenticationThrottleWindow.count({
        where: {
          dimensionType: "ACCOUNT",
          accountUserId: { in: [accountOne, accountTwo] }
        }
      })
    ).toBe(2);
  });

  test("fails closed on environment key or policy drift", async () => {
    const keyMismatch = await reserveAuthenticationAttempt(
      {
        attemptType: "PASSWORD",
        identifierSignal: "key-mismatch@test.invalid",
        sourceSignal: "198.51.100.19"
      },
      {
        config: {
          ...pgConfig(),
          hmacKey: "different-test-only-key-material-that-is-long-enough"
        }
      }
    );
    expect(keyMismatch.reason).toBe("THROTTLE_UNAVAILABLE");
    const policyMismatch = await reserveAuthenticationAttempt(
      {
        attemptType: "PASSWORD",
        identifierSignal: "policy-mismatch@test.invalid",
        sourceSignal: "198.51.100.18"
      },
      {
        config: {
          ...pgConfig(),
          limits: {
            ...pgConfig().limits,
            PASSWORD: {
              ...pgConfig().limits.PASSWORD,
              GLOBAL: pgConfig().limits.PASSWORD.GLOBAL - 1
            }
          }
        }
      }
    );
    expect(policyMismatch.reason).toBe("THROTTLE_UNAVAILABLE");
  });

  test("reports unused-key readiness and denies runtime control transitions", async () => {
    const beforeControl = await prisma.authenticationThrottleControl.findUniqueOrThrow({
      where: { id: 1 },
      select: { status: true, generation: true },
    });
    await expect(
      assertAuthenticationThrottleKeyRotationReady({ currentKeyVersion: 999_999 }),
    ).resolves.toEqual({
      ready: true,
      activeWindowCount: 0,
      controlReferenceCount: 0,
    });
    await expect(
      transitionAuthenticationThrottleControl({
        expectedGeneration: beforeControl.generation,
        requestedStatus: "PAUSED",
        config: pgConfig(),
      }),
    ).rejects.toThrow();
    const control = await prisma.authenticationThrottleControl.findUniqueOrThrow({
      where: { id: 1 },
      select: { status: true, generation: true },
    });
    expect(control).toEqual(beforeControl);
  });

  test("successful completion releases one conservative failure reservation", async () => {
    const reserved = await reserveAuthenticationAttempt(
      {
        attemptType: "PASSWORD",
        identifierSignal: "success@test.invalid",
        sourceSignal: "198.51.100.20",
        tenantId: tenantOne,
        accountUserId: accountOne
      },
      { config: pgConfig() }
    );
    if (!reserved.allowed) throw new Error("expected allowed reservation");
    const beforeCompletion = await prisma.authenticationThrottleWindow.findMany({
      where: { id: { in: reserved.reservation.bucketIds } },
      select: { id: true, requestCount: true, failureReservationCount: true, successCount: true }
    });
    const beforeCompletionById = new Map(beforeCompletion.map((row) => [row.id, row]));
    await consumeWithFreshAudit(reserved.reservation);
    const rows = await prisma.authenticationThrottleWindow.findMany({
      where: { id: { in: reserved.reservation.bucketIds } }
    });
    for (const row of rows) {
      const before = beforeCompletionById.get(row.id)!;
      expect(row.requestCount).toBe(before.requestCount);
      expect(row.failureReservationCount).toBe(before.failureReservationCount - 1n);
      expect(row.successCount).toBe(before.successCount + 1n);
    }
  });

  test("rejects proof tampering, replay, and injected rollback without double release", async () => {
    const reserved = await reserveAuthenticationAttempt(
      {
        attemptType: "PASSWORD",
        identifierSignal: "atomic-success@test.invalid",
        sourceSignal: "198.51.100.21",
        tenantId: tenantOne,
        accountUserId: accountOne
      },
      { config: pgConfig() }
    );
    if (!reserved.allowed) throw new Error("expected allowed reservation");
    const before = await prisma.authenticationThrottleWindow.findMany({
      where: { id: { in: reserved.reservation.bucketIds } },
      select: { id: true, failureReservationCount: true, successCount: true }
    });

    await expect(
      consumeWithFreshAudit({
        ...reserved.reservation,
        proof: `${reserved.reservation.proof.slice(0, 63)}${
          reserved.reservation.proof.endsWith("0") ? "1" : "0"
        }`
      })
    ).rejects.toThrow("AUTH_THROTTLE_SUCCESS_RELEASE_UNAVAILABLE");
    expect(
      await prisma.auditEvent.findUnique({ where: { id: reserved.reservation.id } })
    ).toBeNull();

    await expect(
      consumeWithFreshAudit(reserved.reservation, { failAfterConsumption: true })
    ).rejects.toThrow("INJECTED_POST_CONSUMPTION_FAILURE");
    expect(
      await prisma.auditEvent.findUnique({ where: { id: reserved.reservation.id } })
    ).toBeNull();
    expect(
      await prisma.authenticationThrottleWindow.findMany({
        where: { id: { in: reserved.reservation.bucketIds } },
        select: { id: true, failureReservationCount: true, successCount: true }
      })
    ).toEqual(before);

    await consumeWithFreshAudit(reserved.reservation);
    await expect(consumeWithFreshAudit(reserved.reservation)).rejects.toThrow();
    const after = await prisma.authenticationThrottleWindow.findMany({
      where: { id: { in: reserved.reservation.bucketIds } },
      select: { failureReservationCount: true, successCount: true }
    });
    expect(after.every((row) => row.successCount >= 1n)).toBe(true);
  });

  test("consumes distinct authenticated success reservations independently", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 2 }, () => reserveAuthenticationAttempt(
        {
          attemptType: "MFA",
          identifierSignal: "distinct-success@test.invalid",
          sourceSignal: "198.51.100.22",
          tenantId: tenantTwo,
          accountUserId: accountTwo
        },
        { config: pgConfig() }
      ))
    );
    if (!attempts[0]?.allowed || !attempts[1]?.allowed) {
      throw new Error("expected distinct allowed reservations");
    }
    expect(attempts[0].reservation.id).not.toBe(attempts[1].reservation.id);
    await Promise.all([
      consumeWithFreshAudit(attempts[0].reservation),
      consumeWithFreshAudit(attempts[1].reservation)
    ]);
    const rows = await prisma.authenticationThrottleWindow.findMany({
      where: { id: { in: attempts[0].reservation.bucketIds } }
    });
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.successCount >= 2n)).toBe(true);
  });

  test("rejects counter tampering, negative release, and invalid dimension shape", async () => {
    const reserved = await reserveAuthenticationAttempt(
      {
        attemptType: "PASSWORD",
        identifierSignal: "tamper@test.invalid",
        sourceSignal: "198.51.100.30"
      },
      { config: pgConfig() }
    );
    expect(reserved.allowed).toBe(true);
    await expect(
      prisma.$executeRaw`
        UPDATE "AuthenticationThrottleWindow"
           SET "requestCount" = 0
         WHERE "dimensionType" = 'GLOBAL'::"AuthenticationThrottleDimensionType"`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        UPDATE "AuthenticationThrottleWindow"
           SET "failureReservationCount" = -1, "successCount" = 2
         WHERE "dimensionType" = 'GLOBAL'::"AuthenticationThrottleDimensionType"`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        INSERT INTO "AuthenticationThrottleWindow" (
          "attemptType", "dimensionType", "bucketKey", "keyVersion", "shardNumber",
          "windowStartedAt", "windowEndsAt", "limitCount", "requestCount",
          "failureReservationCount", "successCount", "deniedCount", "firstRequestAt",
          "lastRequestAt", "retainUntil", "createdAt", "updatedAt"
        ) VALUES (
          'PASSWORD', 'ACCOUNT', ${"a".repeat(64)}, ${pgConfig().keyVersion}, 1,
          ${new Date(Math.floor(now.getTime() / 900_000) * 900_000)},
          ${new Date(Math.floor(now.getTime() / 900_000) * 900_000 + 900_000)},
          10, 1, 1, 0, 0, ${now}, ${now},
          ${new Date(Math.floor(now.getTime() / 900_000) * 900_000 + 900_000 + 30 * 24 * 60 * 60_000)},
          ${now}, ${now}
        )`
    ).rejects.toThrow();
  });
});
