import { createHmac, randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decryptAuthValueForRotationTest,
  encryptAuthValueForRotationTest,
  prisma,
  rotateAuthenticationEncryption,
  runBootstrapAuth,
  type TransactionClient,
} from "@ogfi/database";
import {
  finalizeMfaAuthenticationInTransaction,
  finalizePasswordAuthenticationInTransaction,
  hashPassword,
  recordMfaFailure,
  rotateSessionInTransaction,
} from "../src/server/services/authentication";
import {
  reserveAuthenticationAttempt,
} from "../src/server/services/authenticationThrottle";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const describeAuthenticationDatabase =
  process.env.AUTH_DATABASE_INTEGRATION === "yes" ? describe : describe.skip;

describeAuthenticationDatabase("database-backed authentication integrity", () => {
  const suffix = randomUUID().slice(0, 8);
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const companyA = randomUUID();
  const companyB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const originalThrottleHmacKey = process.env.AUTH_THROTTLE_HMAC_KEY;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_HMAC_KEY ??= "database-test-auth-throttle-key-material";
    process.env.AUTH_SECRET = "database-test-auth-secret-material";
    const expectedDatabase =
      assertDisposableAuthorizationDatabaseConfigured(process.env);
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: `Auth tenant A ${suffix}`, loginCode: `auth-a-${suffix}` },
        { id: tenantB, name: `Auth tenant B ${suffix}`, loginCode: `auth-b-${suffix}` },
      ],
    });
    await prisma.company.createMany({
      data: [
        {
          id: companyA,
          tenantId: tenantA,
          code: `AUTH-A-${suffix}`,
          legalName: `Auth company A ${suffix}`,
          currencyCode: "PHP",
        },
        {
          id: companyB,
          tenantId: tenantA,
          code: `AUTH-B-${suffix}`,
          legalName: `Auth company B ${suffix}`,
          currencyCode: "PHP",
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: userA,
          tenantId: tenantA,
          email: `auth-a-${suffix}@example.test`,
          displayName: "Auth user A",
        },
        {
          id: userB,
          tenantId: tenantB,
          email: `auth-b-${suffix}@example.test`,
          displayName: "Auth user B",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (originalThrottleHmacKey === undefined) {
      delete process.env.AUTH_THROTTLE_HMAC_KEY;
    } else {
      process.env.AUTH_THROTTLE_HMAC_KEY = originalThrottleHmacKey;
    }
    delete process.env.AUTH_SECRET;
  });

  it("rejects a cross-tenant identity even when both records exist", async () => {
    await expect(
      prisma.authIdentity.create({
        data: {
          tenantId: tenantA,
          userId: userB,
          provider: "LOCAL",
          normalizedIdentifier: `cross-${suffix}@example.test`,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects cross-tenant MFA, session, activation, and recovery references", async () => {
    const invalidWrites = [
      prisma.mfaAuthenticator.create({
        data: {
          tenantId: tenantA,
          userId: userB,
          label: "Cross tenant",
          encryptedSecret: "invalid",
          secretIv: "invalid",
          secretAuthTag: "invalid",
        },
      }),
      prisma.authSession.create({
        data: {
          tenantId: tenantA,
          userId: userB,
          tokenHash: `cross-${suffix}`,
          privilegeEpochAtIssue: 0,
          idleExpiresAt: new Date(Date.now() + 60_000),
          absoluteExpiresAt: new Date(Date.now() + 120_000),
        },
      }),
      prisma.authActivationToken.create({
        data: {
          tenantId: tenantA,
          targetUserId: userB,
          tokenHash: `cross-activation-${suffix}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
      prisma.authRecoveryRequest.create({
        data: {
          tenantId: tenantA,
          companyId: companyA,
          targetUserId: userB,
          requestedByUserId: userA,
          reason: "Cross-tenant test must fail",
          evidenceReference: "AUTH-CROSS-TENANT",
        },
      }),
    ];
    const results = await Promise.allSettled(invalidWrites);
    expect(results.every(({ status }) => status === "rejected")).toBe(true);
  });

  it("permits only one active activation and one pending recovery per scope", async () => {
    const tokenData = (tokenHash: string) => ({
      tenantId: tenantA,
      targetUserId: userA,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const activationResults = await Promise.allSettled([
      prisma.authActivationToken.create({ data: tokenData(`one-${suffix}`) }),
      prisma.authActivationToken.create({ data: tokenData(`two-${suffix}`) }),
    ]);
    expect(activationResults.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(activationResults.filter(({ status }) => status === "rejected")).toHaveLength(1);

    const recoveryData = {
      tenantId: tenantA,
      companyId: companyA,
      targetUserId: userA,
      requestedByUserId: userA,
      reason: "Database concurrency verification",
      evidenceReference: "AUTH-DB-TEST",
    };
    const recoveryResults = await Promise.allSettled([
      prisma.authRecoveryRequest.create({ data: recoveryData }),
      prisma.authRecoveryRequest.create({ data: recoveryData }),
    ]);
    expect(recoveryResults.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(recoveryResults.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(
      prisma.authRecoveryRequest.create({
        data: { ...recoveryData, companyId: companyB },
      }),
    ).rejects.toThrow();
  });

  it("allows exactly one activation consumption and one recovery review decision", async () => {
    const activation = await prisma.authActivationToken.findFirstOrThrow({
      where: { tenantId: tenantA, targetUserId: userA, status: "ACTIVE" },
    });
    const activationResults = await Promise.all([
      prisma.authActivationToken.updateMany({
        where: { id: activation.id, status: "ACTIVE" },
        data: { status: "CONSUMED", consumedAt: new Date() },
      }),
      prisma.authActivationToken.updateMany({
        where: { id: activation.id, status: "ACTIVE" },
        data: { status: "CONSUMED", consumedAt: new Date() },
      }),
    ]);
    expect(activationResults.map(({ count }) => count).sort()).toEqual([0, 1]);

    const recovery = await prisma.authRecoveryRequest.findFirstOrThrow({
      where: { tenantId: tenantA, targetUserId: userA, status: "PENDING" },
    });
    const reviewResults = await Promise.all([
      prisma.authRecoveryRequest.updateMany({
        where: { id: recovery.id, status: "PENDING" },
        data: { status: "APPROVED", reviewedAt: new Date() },
      }),
      prisma.authRecoveryRequest.updateMany({
        where: { id: recovery.id, status: "PENDING" },
        data: { status: "REJECTED", reviewedAt: new Date() },
      }),
    ]);
    expect(reviewResults.map(({ count }) => count).sort()).toEqual([0, 1]);
  });

  it("rotates a challenge exactly once without extending absolute expiry", async () => {
    const absoluteExpiresAt = new Date(Date.now() + 60 * 60_000);
    const pending = await prisma.authSession.create({
      data: {
        tenantId: tenantA,
        userId: userA,
        tokenHash: `pending-${suffix}`,
        status: "PENDING_MFA",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 10 * 60_000),
        absoluteExpiresAt,
      },
      include: { user: true },
    });
    const rotate = () =>
      prisma.$transaction((tx: TransactionClient) =>
        rotateSessionInTransaction(tx, pending, "PENDING_MFA", {
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
          fingerprint: {
            sourceAddress: "203.0.113.77",
            userAgent: "current-mfa-client",
          },
        }),
      );
    const results = await Promise.allSettled([rotate(), rotate()]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const replacement = await prisma.authSession.findMany({
      where: { userId: userA, status: "ACTIVE" },
    });
    expect(replacement).toHaveLength(1);
    expect(replacement[0]?.absoluteExpiresAt.toISOString()).toBe(
      absoluteExpiresAt.toISOString(),
    );
    expect(replacement[0]).toMatchObject({
      sourceAddressHash: createHmac(
        "sha256",
        process.env.AUTH_SECRET!,
      ).update("203.0.113.77").digest("hex"),
      userAgentHash: createHmac(
        "sha256",
        process.env.AUTH_SECRET!,
      ).update("current-mfa-client").digest("hex"),
    });
  });

  it("rejects a stale verified password and atomically consumes success exactly once", async () => {
    const identityId = randomUUID();
    const normalizedIdentifier = `atomic-${suffix}@example.test`;
    const oldHash = await hashPassword("Old-Password-For-Race-42");
    const newHash = await hashPassword("New-Password-For-Race-42");
    await prisma.authIdentity.create({
      data: {
        id: identityId,
        tenantId: tenantA,
        userId: userA,
        provider: "LOCAL",
        normalizedIdentifier,
        passwordCredential: { create: { passwordHash: oldHash } },
      },
    });
    const reserve = async (sourceSignal: string) => {
      const result = await reserveAuthenticationAttempt({
        attemptType: "PASSWORD",
        identifierSignal: `auth-a-${suffix}:${normalizedIdentifier}`,
        sourceSignal,
        tenantId: tenantA,
        accountUserId: userA,
      });
      if (!result.allowed) throw new Error("expected allowed reservation");
      return result.reservation;
    };
    const staleReservation = await reserve("203.0.113.80");
    await prisma.passwordCredential.update({
      where: { authIdentityId: identityId },
      data: { passwordHash: newHash },
    });
    await expect(
      prisma.$transaction((tx) =>
        finalizePasswordAuthenticationInTransaction(tx, {
          identityId,
          tenantCode: `auth-a-${suffix}`,
          normalizedIdentifier,
          verifiedPasswordHash: oldHash,
          fingerprint: {
            sourceAddress: "203.0.113.80",
            userAgent: "stale-race-client",
          },
          reservation: staleReservation,
        }),
      ),
    ).rejects.toThrow("LOGIN_CREDENTIALS_INVALID");
    expect(
      await prisma.authSession.count({ where: { authIdentityId: identityId } }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { id: staleReservation.id } }),
    ).toBe(0);

    const reservation = await reserve("203.0.113.81");
    const finalize = (proof = reservation.proof) =>
      prisma.$transaction((tx) =>
        finalizePasswordAuthenticationInTransaction(tx, {
          identityId,
          tenantCode: `auth-a-${suffix}`,
          normalizedIdentifier,
          verifiedPasswordHash: newHash,
          fingerprint: {
            sourceAddress: "203.0.113.81",
            userAgent: "atomic-success-client",
          },
          reservation: { ...reservation, proof },
        }),
      );
    await expect(finalize("0".repeat(64))).rejects.toThrow();
    expect(
      await prisma.authSession.count({ where: { authIdentityId: identityId } }),
    ).toBe(0);
    expect(await prisma.auditEvent.count({ where: { id: reservation.id } })).toBe(0);

    await expect(finalize()).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(finalize()).rejects.toThrow();
    expect(
      await prisma.authSession.count({ where: { authIdentityId: identityId } }),
    ).toBe(1);
    expect(await prisma.auditEvent.count({ where: { id: reservation.id } })).toBe(1);
    const counters = await prisma.authenticationThrottleWindow.findMany({
      where: { id: { in: reservation.bucketIds } },
    });
    expect(counters).toHaveLength(reservation.bucketIds.length);
    expect(counters.every((row) => row.successCount === 1n)).toBe(true);
  });

  it("atomically retains failed MFA throttle reservations and bounded denial evidence", async () => {
    const pending = await prisma.authSession.create({
      data: {
        tenantId: tenantA,
        userId: userA,
        tokenHash: `failure-${suffix}`,
        status: "PENDING_MFA",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 10 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
      include: { user: true },
    });
    await expect(recordMfaFailure(pending)).resolves.toBe("MFA_CODE_INVALID");
    const [updated, throttleWindows, denialBuckets, events] = await Promise.all([
      prisma.authSession.findUniqueOrThrow({ where: { id: pending.id } }),
      prisma.authenticationThrottleWindow.findMany({
        where: { accountUserId: userA, attemptType: "MFA" },
      }),
      prisma.authorizationDenialBucket.findMany({
        where: {
          tenantId: tenantA,
          actorUserId: userA,
          action: "AUTHENTICATE",
          reason: "AUTHENTICATION_REQUIRED",
          resource: "AUTHENTICATION",
        },
      }),
      prisma.auditEvent.findMany({
        where: { entityType: "AuthSession", entityId: pending.id },
      }),
    ]);
    expect(updated.challengeFailureCount).toBe(1);
    expect(throttleWindows).toHaveLength(1);
    expect(throttleWindows[0]?.failureReservationCount).toBe(1n);
    expect(denialBuckets).toHaveLength(1);
    expect(denialBuckets[0]?.denialCount).toBe(1n);
    expect(
      JSON.stringify(
        { throttleWindows, denialBuckets },
        (_key, value) => typeof value === "bigint" ? value.toString() : value,
      ),
    ).not.toContain("submittedCode");
    expect(events.some(({ eventType }) => eventType === "auth.mfa.challenge_failed")).toBe(false);
  });

  it("locks an MFA challenge once under concurrent final failures", async () => {
    const pending = await prisma.authSession.create({
      data: {
        tenantId: tenantA,
        userId: userA,
        tokenHash: `concurrent-failure-${suffix}`,
        status: "PENDING_MFA",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        challengeFailureCount: 4,
        idleExpiresAt: new Date(Date.now() + 10 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
      include: { user: true },
    });
    const outcomes = await Promise.allSettled([
      recordMfaFailure(pending),
      recordMfaFailure(pending),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const [locked, lockEvents] = await Promise.all([
      prisma.authSession.findUniqueOrThrow({ where: { id: pending.id } }),
      prisma.auditEvent.findMany({
        where: {
          entityType: "AuthSession",
          entityId: pending.id,
          eventType: "auth.mfa.challenge_locked",
        },
      }),
    ]);
    expect(locked).toMatchObject({
      status: "REVOKED",
      challengeFailureCount: 5,
    });
    expect(lockEvents).toHaveLength(1);
  });

  it("refuses to rotate an expired challenge", async () => {
    const expired = await prisma.authSession.create({
      data: {
        tenantId: tenantA,
        userId: userA,
        tokenHash: `expired-${suffix}`,
        status: "PENDING_MFA",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() - 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
      include: { user: true },
    });
    await expect(
      prisma.$transaction((tx: TransactionClient) =>
        rotateSessionInTransaction(tx, expired, "PENDING_MFA", {
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
        }),
      ),
    ).rejects.toThrow("AUTH_SESSION_TRANSITION_INVALID");
  });

  it("leaves no authoritative session when MFA rotation races administrator revocation", async () => {
    const pending = await prisma.authSession.create({
      data: {
        tenantId: tenantA,
        userId: userA,
        tokenHash: `revoke-race-${suffix}`,
        status: "PENDING_MFA",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 10 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
      include: { user: true },
    });
    await Promise.allSettled([
      prisma.$transaction((tx: TransactionClient) =>
        rotateSessionInTransaction(tx, pending, "PENDING_MFA", {
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
        }),
      ),
      prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userA },
          data: { privilegeEpoch: { increment: 1 } },
        });
        await tx.authSession.updateMany({
          where: {
            userId: userA,
            status: { in: ["ACTIVE", "PENDING_MFA", "MFA_ENROLLMENT_REQUIRED"] },
          },
          data: { status: "REVOKED", revokedAt: new Date() },
        });
      }),
    ]);
    const [user, activeSessions] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userA } }),
      prisma.authSession.findMany({ where: { userId: userA, status: "ACTIVE" } }),
    ]);
    expect(
      activeSessions.every(
        ({ privilegeEpochAtIssue }) => privilegeEpochAtIssue !== user.privilegeEpoch,
      ),
    ).toBe(true);
  });

  it("consumes one recovery code once through the locked active authenticator", async () => {
    const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: userA } });
    const authenticator = await prisma.mfaAuthenticator.create({
      data: {
        tenantId: tenantA,
        userId: userA,
        label: `Recovery race ${suffix}`,
        status: "ACTIVE",
        encryptedSecret: "recovery-race-encrypted",
        secretIv: "recovery-race-iv",
        secretAuthTag: "recovery-race-tag",
        keyVersion: 2,
        verifiedAt: new Date(),
      },
    });
    const recovery = await prisma.mfaRecoveryCode.create({
      data: {
        authenticatorId: authenticator.id,
        codeHash: createHmac("sha256", process.env.AUTH_SECRET!)
          .update(`recovery-${suffix}`)
          .digest("hex"),
      },
    });
    const sessions = await Promise.all(
      ["one", "two"].map((label) =>
        prisma.authSession.create({
          data: {
            tenantId: tenantA,
            userId: userA,
            tokenHash: `recovery-${label}-${suffix}`,
            status: "PENDING_MFA",
            assuranceLevel: "PASSWORD",
            privilegeEpochAtIssue: currentUser.privilegeEpoch,
            idleExpiresAt: new Date(Date.now() + 10 * 60_000),
            absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
          },
        }),
      ),
    );
    const reservations = await Promise.all(
      ["203.0.113.91", "203.0.113.92"].map(async (sourceSignal) => {
        const reserved = await reserveAuthenticationAttempt({
          attemptType: "MFA",
          identifierSignal: `${tenantA}:${userA}`,
          sourceSignal,
          tenantId: tenantA,
          accountUserId: userA,
        });
        if (!reserved.allowed) throw new Error("expected allowed MFA reservation");
        return reserved.reservation;
      }),
    );
    const outcomes = await Promise.allSettled(
      sessions.map((session, index) =>
        prisma.$transaction((tx) =>
          finalizeMfaAuthenticationInTransaction(tx, {
            sessionId: session.id,
            authenticator,
            usedCounter: null,
            recoveryCodeId: recovery.id,
            fingerprint: {
              sourceAddress: `203.0.113.${91 + index}`,
              userAgent: `recovery-race-${index}`,
            },
            reservation: reservations[index]!,
          }),
        ),
      ),
    );
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(
      (await prisma.mfaRecoveryCode.findUniqueOrThrow({ where: { id: recovery.id } }))
        .consumedAt,
    ).not.toBeNull();
    await prisma.mfaAuthenticator.update({
      where: { id: authenticator.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
  });

  it("cannot establish an authoritative MFA session across authenticator revocation and account reset", async () => {
    const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: userA } });
    const authenticator = await prisma.mfaAuthenticator.create({
      data: {
        tenantId: tenantA,
        userId: userA,
        label: `Revocation race ${suffix}`,
        status: "ACTIVE",
        encryptedSecret: "revocation-race-encrypted",
        secretIv: "revocation-race-iv",
        secretAuthTag: "revocation-race-tag",
        keyVersion: 2,
        verifiedAt: new Date(),
      },
    });
    const pending = await prisma.authSession.create({
      data: {
        tenantId: tenantA,
        userId: userA,
        tokenHash: `authenticator-revoke-race-${suffix}`,
        status: "PENDING_MFA",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: currentUser.privilegeEpoch,
        idleExpiresAt: new Date(Date.now() + 10 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const reserved = await reserveAuthenticationAttempt({
      attemptType: "MFA",
      identifierSignal: `${tenantA}:${userA}`,
      sourceSignal: "203.0.113.93",
      tenantId: tenantA,
      accountUserId: userA,
    });
    if (!reserved.allowed) throw new Error("expected allowed MFA reservation");
    const outcomes = await Promise.allSettled([
      prisma.$transaction((tx) =>
        finalizeMfaAuthenticationInTransaction(tx, {
          sessionId: pending.id,
          authenticator,
          usedCounter: 9_000_000_000n,
          recoveryCodeId: null,
          fingerprint: {
            sourceAddress: "203.0.113.93",
            userAgent: "authenticator-revocation-race",
          },
          reservation: reserved.reservation,
        }),
      ),
      prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userA },
          data: { privilegeEpoch: { increment: 1 } },
        });
        await tx.authSession.updateMany({
          where: {
            userId: userA,
            status: { in: ["ACTIVE", "PENDING_MFA", "MFA_ENROLLMENT_REQUIRED"] },
          },
          data: { status: "REVOKED", revokedAt: new Date() },
        });
        await tx.mfaAuthenticator.update({
          where: { id: authenticator.id },
          data: { status: "REVOKED", revokedAt: new Date() },
        });
      }),
    ]);
    expect(outcomes[1]?.status).toBe("fulfilled");
    const [resetUser, activeSessions] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userA } }),
      prisma.authSession.findMany({ where: { userId: userA, status: "ACTIVE" } }),
    ]);
    expect(
      activeSessions.some(
        ({ privilegeEpochAtIssue }) => privilegeEpochAtIssue === resetUser.privilegeEpoch,
      ),
    ).toBe(false);
    expect(
      (await prisma.mfaAuthenticator.findUniqueOrThrow({
        where: { id: authenticator.id },
      })).status,
    ).toBe("REVOKED");
  });

  it("resumes interrupted MFA encryption rotation and rejects a wrong previous key", async () => {
    const currentKey = Buffer.alloc(32, 7);
    const previousKey = Buffer.alloc(32, 6);
    process.env.APP_ENCRYPTION_KEY = currentKey.toString("base64");
    process.env.APP_ENCRYPTION_KEY_VERSION = "2";
    process.env.APP_ENCRYPTION_PREVIOUS_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.APP_ENCRYPTION_PREVIOUS_KEY_VERSION = "1";
    const records = ["rotation-one", "rotation-two"].map((secret, index) => {
      const encrypted = encryptAuthValueForRotationTest(secret, previousKey);
      return {
        tenantId: tenantA,
        userId: userA,
        label: `Rotation ${index}`,
        status: index === 0 ? "PENDING" : "REVOKED",
        encryptedSecret: encrypted.encryptedValue,
        secretIv: encrypted.iv,
        secretAuthTag: encrypted.authTag,
        keyVersion: 1,
      };
    });
    await prisma.mfaAuthenticator.createMany({ data: records });
    await expect(
      rotateAuthenticationEncryption({ batchSize: 1, maxBatches: 1 }),
    ).rejects.toThrow();
    expect(
      await prisma.mfaAuthenticator.count({
        where: {
          userId: userA,
          keyVersion: 1,
          label: { startsWith: "Rotation" },
        },
      }),
    ).toBe(2);

    process.env.APP_ENCRYPTION_PREVIOUS_KEY = previousKey.toString("base64");
    const interrupted = await rotateAuthenticationEncryption({
      batchSize: 1,
      maxBatches: 1,
    });
    expect(interrupted).toMatchObject({ complete: false, remainingPrevious: 1 });
    const completed = await rotateAuthenticationEncryption({ batchSize: 1 });
    expect(completed).toMatchObject({ complete: true, remainingPrevious: 0 });
    const rotated = await prisma.mfaAuthenticator.findMany({
      where: { userId: userA, label: { startsWith: "Rotation" } },
    });
    expect(rotated).toHaveLength(2);
    for (const authenticator of rotated) {
      expect(
        decryptAuthValueForRotationTest({
          encryptedValue: authenticator.encryptedSecret,
          iv: authenticator.secretIv,
          authTag: authenticator.secretAuthTag,
          key: currentKey,
        }),
      ).toMatch(/^rotation-/);
      expect(authenticator.keyVersion).toBe(2);
    }
  });

  it("permits one file-only bootstrap for an approved scoped administrator", async () => {
    const bootstrapTenant = randomUUID();
    const bootstrapCompany = randomUUID();
    const bootstrapUser = randomUUID();
    const secondAdmin = randomUUID();
    const nonAdmin = randomUUID();
    const roleId = randomUUID();
    let permissionId = randomUUID();
    const loginCode = `bootstrap-${suffix}`;
    const outputFile = path.join(tmpdir(), `ogfi-bootstrap-${randomUUID()}.txt`);
    const secondOutputFile = path.join(tmpdir(), `ogfi-bootstrap-${randomUUID()}.txt`);
    try {
      await prisma.tenant.create({
        data: { id: bootstrapTenant, name: "Bootstrap tenant", loginCode },
      });
      await prisma.company.create({
        data: {
          id: bootstrapCompany,
          tenantId: bootstrapTenant,
          code: `BOOT-${suffix}`,
          legalName: "Bootstrap company",
          currencyCode: "PHP",
        },
      });
      await prisma.user.createMany({
        data: [
          {
            id: bootstrapUser,
            tenantId: bootstrapTenant,
            email: `bootstrap-${suffix}@example.test`,
            displayName: "Bootstrap administrator",
          },
          {
            id: secondAdmin,
            tenantId: bootstrapTenant,
            email: `bootstrap-second-${suffix}@example.test`,
            displayName: "Second administrator",
          },
          {
            id: nonAdmin,
            tenantId: bootstrapTenant,
            email: `bootstrap-user-${suffix}@example.test`,
            displayName: "Non administrator",
          },
        ],
      });
      await prisma.role.create({
        data: {
          id: roleId,
          tenantId: bootstrapTenant,
          code: `BOOT_ADMIN_${suffix}`,
          name: "Bootstrap administrator",
        },
      });
      const existingPermission = await prisma.permission.findUnique({
        where: { code: "core.administer" },
        select: { id: true },
      });
      if (existingPermission) {
        permissionId = existingPermission.id;
      } else {
        await prisma.permission.create({
          data: {
            id: permissionId,
            tenantId: bootstrapTenant,
            code: "core.administer",
            module: "core",
            action: "administer",
          },
        });
      }
      await prisma.rolePermission.create({
        data: { roleId, permissionId },
      });
      await prisma.userRoleAssignment.createMany({
        data: [
          { userId: bootstrapUser, roleId },
          { userId: secondAdmin, roleId },
        ],
      });
      await prisma.userScopeAssignment.createMany({
        data: [
          {
            userId: bootstrapUser,
            scopeType: "COMPANY",
            scopeId: bootstrapCompany,
            accessLevel: "MANAGE",
          },
          {
            userId: secondAdmin,
            scopeType: "COMPANY",
            scopeId: bootstrapCompany,
            accessLevel: "MANAGE",
          },
        ],
      });
      process.env.AUTH_BOOTSTRAP_TENANT_CODE = loginCode;
      process.env.AUTH_BOOTSTRAP_USER_EMAIL = `bootstrap-${suffix}@example.test`;
      process.env.AUTH_BOOTSTRAP_AUTHORIZATION_REFERENCE = "SEC-APPROVAL-001";
      process.env.AUTH_BOOTSTRAP_OUTPUT_FILE = outputFile;
      process.env.APP_URL = "https://erp.example.test";
      await runBootstrapAuth();
      expect(await readFile(outputFile, "utf8")).toContain(
        "https://erp.example.test/activate?token=",
      );
      expect(
        await prisma.authBootstrapState.count({
          where: { tenantId: bootstrapTenant, targetUserId: bootstrapUser },
        }),
      ).toBe(1);
      process.env.AUTH_BOOTSTRAP_USER_EMAIL = `bootstrap-second-${suffix}@example.test`;
      process.env.AUTH_BOOTSTRAP_OUTPUT_FILE = secondOutputFile;
      await expect(runBootstrapAuth()).rejects.toThrow(
        "AUTH_BOOTSTRAP_ALREADY_COMPLETED",
      );
      process.env.AUTH_BOOTSTRAP_USER_EMAIL = `bootstrap-user-${suffix}@example.test`;
      await expect(runBootstrapAuth()).rejects.toThrow(
        "AUTH_BOOTSTRAP_ADMIN_ROLE_REQUIRED",
      );
      process.env.AUTH_BOOTSTRAP_TENANT_CODE = `auth-b-${suffix}`;
      await expect(runBootstrapAuth()).rejects.toThrow(
        "AUTH_BOOTSTRAP_USER_NOT_FOUND",
      );
    } finally {
      await unlink(outputFile).catch(() => undefined);
      await unlink(secondOutputFile).catch(() => undefined);
    }
  });
});
