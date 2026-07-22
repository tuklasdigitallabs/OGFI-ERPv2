import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  authenticationThrottleWindowBounds,
  buildAuthenticationThrottleDimensions,
  canonicalAuthenticationThrottleReservation,
  loadAuthenticationThrottleConfig,
  reserveAuthenticationAttempt,
  signAuthenticationThrottleReservation,
  transitionAuthenticationThrottleControl,
  verifyAuthenticationThrottleReservationProof,
  validateAuthenticationThrottleConfig,
  type AuthenticationThrottleConfig
} from "./authenticationThrottle";

const config: AuthenticationThrottleConfig = {
  hmacKey: "test-only-authentication-throttle-key-material",
  keyVersion: 1,
  windowMinutes: 15,
  retentionDays: 30,
  identifierShardCount: 16,
  sourceShardCount: 16,
  limits: {
    PASSWORD: {
      GLOBAL: 1000,
      IDENTIFIER_SHARD: 100,
      SOURCE_SHARD: 100,
      TENANT: 100,
      ACCOUNT: 10
    },
    MFA: {
      GLOBAL: 1000,
      IDENTIFIER_SHARD: 100,
      SOURCE_SHARD: 100,
      TENANT: 100,
      ACCOUNT: 8
    }
  }
};

describe("bounded authentication throttle", () => {
  test("uses UTC-aligned fixed windows and bounded retention", () => {
    expect(
      authenticationThrottleWindowBounds(
        new Date("2026-07-22T07:07:41.222Z"),
        15,
        30
      )
    ).toEqual({
      windowStartedAt: new Date("2026-07-22T07:00:00.000Z"),
      windowEndsAt: new Date("2026-07-22T07:15:00.000Z"),
      retainUntil: new Date("2026-08-21T07:15:00.000Z")
    });
  });

  test("unknown varying inputs cannot create more than fixed shard cardinality", () => {
    const identities = new Set<string>();
    for (let index = 0; index < 10_000; index += 1) {
      for (const dimension of buildAuthenticationThrottleDimensions(
        {
          attemptType: "PASSWORD",
          identifierSignal: `unknown-${index}@example.test`,
          sourceSignal: `198.51.100.${index}`
        },
        config
      )) {
        identities.add(`${dimension.dimensionType}:${dimension.bucketKey}`);
      }
    }
    expect(identities.size).toBeLessThanOrEqual(
      1 + config.identifierShardCount + config.sourceShardCount
    );
  });

  test("resolved tenant and account dimensions are tenant-qualified and separated", () => {
    const tenantOne = "00000000-0000-4000-8000-000000000001";
    const tenantTwo = "00000000-0000-4000-8000-000000000002";
    const account = "00000000-0000-4000-8000-000000000003";
    const first = buildAuthenticationThrottleDimensions(
      {
        attemptType: "PASSWORD",
        identifierSignal: "same@example.test",
        sourceSignal: "same-source",
        tenantId: tenantOne,
        accountUserId: account
      },
      config
    );
    const second = buildAuthenticationThrottleDimensions(
      {
        attemptType: "PASSWORD",
        identifierSignal: "same@example.test",
        sourceSignal: "same-source",
        tenantId: tenantTwo,
        accountUserId: account
      },
      config
    );
    expect(first).toHaveLength(5);
    expect(first.find((value) => value.dimensionType === "TENANT")?.bucketKey)
      .not.toBe(second.find((value) => value.dimensionType === "TENANT")?.bucketKey);
    expect(first.find((value) => value.dimensionType === "ACCOUNT")?.bucketKey)
      .not.toBe(second.find((value) => value.dimensionType === "ACCOUNT")?.bucketKey);
  });

  test("fails startup validation for unsafe keys, shard counts, windows, and limits", () => {
    expect(() => loadAuthenticationThrottleConfig({} as NodeJS.ProcessEnv)).toThrow(
      "AUTH_THROTTLE_HMAC_KEY_INVALID"
    );
    expect(() =>
      validateAuthenticationThrottleConfig({
        ...config,
        sourceShardCount: 2
      })
    ).toThrow("AUTH_THROTTLE_SOURCE_SHARDS_INVALID");
    expect(() =>
      validateAuthenticationThrottleConfig({
        ...config,
        limits: {
          ...config.limits,
          MFA: { ...config.limits.MFA, ACCOUNT: 0 }
        }
      })
    ).toThrow("AUTH_THROTTLE_MFA_ACCOUNT_LIMIT_INVALID");
  });

  test("database failure returns a stable fail-closed result", async () => {
    const result = await reserveAuthenticationAttempt(
      {
        attemptType: "PASSWORD",
        identifierSignal: "unknown@example.test",
        sourceSignal: "198.51.100.1"
      },
      {
        config,
        client: {
          $transaction: async () => {
            throw new Error("database detail must not escape");
          }
        } as never
      }
    );
    expect(result).toEqual({
      allowed: false,
      reason: "THROTTLE_UNAVAILABLE",
      reservation: null,
      thresholdDimensions: []
    });
  });

  test.each([
    ["write conflict", { code: "P2034" }],
    ["closed transaction", { code: "P2028" }],
    ["deadlock", { meta: { code: "40P01" } }]
  ])("control transition retries a known transient %s", async (_label, transient) => {
    let attempts = 0;
    const result = await transitionAuthenticationThrottleControl(
      {
        expectedGeneration: 7n,
        requestedStatus: "PAUSED",
        config
      },
      {
        client: {
          $transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
            attempts += 1;
            if (attempts === 1) throw transient;
            return operation({
              $queryRaw: async () => [{
                generation: 8n,
                status: "PAUSED",
                activeKeyVersion: config.keyVersion,
                activeKeyFingerprint: "1".repeat(64),
                policyDigest: "2".repeat(64),
                previousRetireAt: null
              }]
            });
          }
        } as never
      }
    );
    expect(attempts).toBe(2);
    expect(result.status).toBe("PAUSED");
    expect(result.generation).toBe(8n);
  });

  test("control transition never retries a generation conflict", async () => {
    let attempts = 0;
    await expect(
      transitionAuthenticationThrottleControl(
        {
          expectedGeneration: 7n,
          requestedStatus: "PAUSED",
          config
        },
        {
          client: {
            $transaction: async () => {
              attempts += 1;
              throw Object.assign(
                new Error("AUTH_THROTTLE_CONTROL_GENERATION_CONFLICT"),
                { meta: { code: "40001" } }
              );
            }
          } as never
        }
      )
    ).rejects.toThrow("AUTH_THROTTLE_CONTROL_GENERATION_CONFLICT");
    expect(attempts).toBe(1);
  });

  test("migration enforces exact transitions, shape, retention, and active trigger", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260722160000_authentication_throttle_windows/migration.sql"
      ),
      "utf8"
    );
    const service = readFileSync(
      path.resolve(__dirname, "authenticationThrottle.ts"),
      "utf8"
    );
    const atomicMigration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260722190000_authentication_throttle_atomic_reservations/migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain("AUTH_THROTTLE_INSERT_NOT_RESERVATION");
    expect(migration).toContain("AUTH_THROTTLE_IDENTITY_IMMUTABLE");
    expect(migration).toContain("AUTH_THROTTLE_TRANSITION_INVALID");
    expect(migration).toContain("ENABLE ALWAYS TRIGGER");
    expect(migration).toContain("AUTH_THROTTLE_TRUNCATE_FORBIDDEN");
    expect(migration).toContain('"requestCount" = "failureReservationCount" + "successCount"');
    expect(service).toContain('"failureReservationCount" > "limitCount"');
    expect(service).toContain("AUTH_THROTTLE_KEY_ROTATION_NOT_READY");
    expect(service).toContain("WITH input AS MATERIALIZED");
    expect(service).toContain("jsonb_to_recordset");
    expect(service).toContain("ON CONFLICT");
    expect(service).not.toContain("pg_advisory_xact_lock");
    expect(atomicMigration).toContain('"AuthenticationThrottleControl"');
    expect(atomicMigration).toContain("operator_transition_authentication_throttle_control");
    expect(atomicMigration).toContain("lock_authentication_throttle_control");
    expect(atomicMigration).toContain("SECURITY DEFINER");
    expect(atomicMigration).toContain("audit.xmin::text = pg_current_xact_id()::text");
    expect(service).toContain("timingSafeEqual");
    expect(service).toContain("ogfi-authentication-throttle-reservation:v1\\0");
    expect(service).toContain("AUTH_THROTTLE_SUCCESS_ALREADY_CONSUMED");
    expect(service).toContain("::integer");
    expect(
      service.match(/ORDER BY throttle_window\."dimensionType", throttle_window\."bucketKey"/g)
    ).toHaveLength(1);
    expect(service).toContain('ORDER BY input."dimensionType", input."bucketKey"');
    expect(atomicMigration).toContain("AUTH_THROTTLE_PREVIOUS_GENERATION_UNEXPIRED");
    expect(atomicMigration).toContain("AUTH_THROTTLE_KEY_IDENTITY_REUSE_FORBIDDEN");
    expect(atomicMigration).toContain("requested_status IS NULL");
  });

  test("requires bounded and distinct active/previous key material", () => {
    expect(() =>
      validateAuthenticationThrottleConfig({
        ...config,
        previousHmacKey: "previous-test-only-authentication-throttle-key",
      })
    ).toThrow("AUTH_THROTTLE_PREVIOUS_KEY_PAIR_INVALID");
    expect(() =>
      validateAuthenticationThrottleConfig({
        ...config,
        previousHmacKey: "previous-test-only-authentication-throttle-key",
        previousKeyVersion: config.keyVersion,
      })
    ).toThrow("AUTH_THROTTLE_PREVIOUS_KEY_VERSION_INVALID");
  });

  test("uses a deterministic domain-separated proof that binds every reservation field", () => {
    const reservation = {
      schemaVersion: 1 as const,
      id: "00000000-0000-4000-8000-000000000010",
      attemptType: "PASSWORD" as const,
      tenantId: "00000000-0000-4000-8000-000000000011",
      accountUserId: "00000000-0000-4000-8000-000000000012",
      windowStartedAt: new Date("2026-07-22T07:00:00.000Z"),
      windowEndsAt: new Date("2026-07-22T07:15:00.000Z"),
      expiresAt: new Date("2026-07-22T07:15:00.000Z"),
      generation: 7n,
      keyVersion: 3,
      keyFingerprint: "1".repeat(64),
      policyDigest: "2".repeat(64),
      dimensions: [
        { dimensionType: "ACCOUNT" as const, id: "00000000-0000-4000-8000-000000000013" },
        { dimensionType: "GLOBAL" as const, id: "00000000-0000-4000-8000-000000000014" },
        { dimensionType: "IDENTIFIER_SHARD" as const, id: "00000000-0000-4000-8000-000000000015" },
        { dimensionType: "SOURCE_SHARD" as const, id: "00000000-0000-4000-8000-000000000016" },
        { dimensionType: "TENANT" as const, id: "00000000-0000-4000-8000-000000000017" }
      ],
      bucketIds: [
        "00000000-0000-4000-8000-000000000013",
        "00000000-0000-4000-8000-000000000014",
        "00000000-0000-4000-8000-000000000015",
        "00000000-0000-4000-8000-000000000016",
        "00000000-0000-4000-8000-000000000017"
      ]
    };
    const secret = "deterministic-test-only-authentication-throttle-secret";
    const proof = signAuthenticationThrottleReservation(reservation, secret);
    expect(proof).toBe(
      "02447f1efc5c9d96624f33e3cf50d458c980f2350e5510ddd28a375c3c83b8f6"
    );
    expect(canonicalAuthenticationThrottleReservation(reservation)).not.toContain(secret);

    const mutations = [
      { ...reservation, schemaVersion: 2 as never },
      { ...reservation, id: "00000000-0000-4000-8000-000000000020" },
      { ...reservation, attemptType: "MFA" as const },
      { ...reservation, tenantId: "00000000-0000-4000-8000-000000000021" },
      { ...reservation, accountUserId: "00000000-0000-4000-8000-000000000022" },
      { ...reservation, windowStartedAt: new Date("2026-07-22T06:45:00.000Z") },
      { ...reservation, windowEndsAt: new Date("2026-07-22T07:30:00.000Z") },
      { ...reservation, expiresAt: new Date("2026-07-22T07:30:00.000Z") },
      { ...reservation, generation: 8n },
      { ...reservation, keyVersion: 4 },
      { ...reservation, keyFingerprint: "3".repeat(64) },
      { ...reservation, policyDigest: "4".repeat(64) },
      {
        ...reservation,
        dimensions: reservation.dimensions.map((dimension, index) => index === 0
          ? { ...dimension, id: "00000000-0000-4000-8000-000000000023" }
          : dimension)
      },
      { ...reservation, dimensions: [...reservation.dimensions].reverse() }
    ];
    for (const mutation of mutations) {
      expect(verifyAuthenticationThrottleReservationProof(mutation, proof, secret))
        .toBe(false);
    }
    expect(verifyAuthenticationThrottleReservationProof(reservation, proof, secret))
      .toBe(true);
    expect(verifyAuthenticationThrottleReservationProof(reservation, "f".repeat(64), secret))
      .toBe(false);
    expect(verifyAuthenticationThrottleReservationProof(reservation, "not-hex", secret))
      .toBe(false);
  });
});
