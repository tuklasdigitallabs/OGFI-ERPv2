import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";

export type AuthenticationThrottleTransactionHost = Pick<
  typeof prisma,
  "$transaction"
>;

export const authenticationThrottleAttemptTypes = ["PASSWORD", "MFA"] as const;
export const authenticationThrottleDimensionTypes = [
  "GLOBAL",
  "IDENTIFIER_SHARD",
  "SOURCE_SHARD",
  "TENANT",
  "ACCOUNT"
] as const;

type AttemptType = (typeof authenticationThrottleAttemptTypes)[number];
type DimensionType = (typeof authenticationThrottleDimensionTypes)[number];

export type AuthenticationThrottleConfig = {
  hmacKey: string;
  keyVersion: number;
  previousHmacKey?: string;
  previousKeyVersion?: number;
  windowMinutes: number;
  retentionDays: number;
  identifierShardCount: number;
  sourceShardCount: number;
  limits: Record<AttemptType, Record<DimensionType, number>>;
};

const DEFAULT_LIMITS: AuthenticationThrottleConfig["limits"] = {
  PASSWORD: {
    GLOBAL: 100_000,
    IDENTIFIER_SHARD: 200,
    SOURCE_SHARD: 500,
    TENANT: 10_000,
    ACCOUNT: 10
  },
  MFA: {
    GLOBAL: 100_000,
    IDENTIFIER_SHARD: 200,
    SOURCE_SHARD: 500,
    TENANT: 10_000,
    ACCOUNT: 8
  }
};

const throttleInputSchema = z
  .object({
    attemptType: z.enum(authenticationThrottleAttemptTypes),
    identifierSignal: z.string().min(1).max(1024),
    sourceSignal: z.string().min(1).max(256),
    tenantId: z.string().uuid().nullable().optional(),
    accountUserId: z.string().uuid().nullable().optional()
  })
  .superRefine((value, context) => {
    if (value.accountUserId && !value.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTH_THROTTLE_ACCOUNT_TENANT_REQUIRED"
      });
    }
  });

export type AuthenticationThrottleReserveInput = z.input<
  typeof throttleInputSchema
>;

export type AuthenticationThrottleReservation = {
  allowed: true;
  schemaVersion: 1;
  id: string;
  attemptType: AttemptType;
  tenantId: string | null;
  accountUserId: string | null;
  windowStartedAt: Date;
  windowEndsAt: Date;
  expiresAt: Date;
  generation: bigint;
  keyVersion: number;
  keyFingerprint: string;
  policyDigest: string;
  dimensions: Array<{ id: string; dimensionType: DimensionType }>;
  bucketIds: string[];
  proof: string;
};

export type AuthenticationThrottleReserveResult =
  | {
      allowed: true;
      reason: "ALLOWED";
      reservation: AuthenticationThrottleReservation;
      thresholdDimensions: [];
    }
  | {
      allowed: false;
      reason: "LIMIT_EXCEEDED";
      reservation: null;
      thresholdDimensions: DimensionType[];
    }
  | {
      allowed: false;
      reason: "THROTTLE_UNAVAILABLE";
      reservation: null;
      thresholdDimensions: [];
    };

type Dimension = {
  dimensionType: DimensionType;
  bucketKey: string;
  shardNumber: number | null;
  tenantId: string | null;
  accountUserId: string | null;
  limitCount: number;
};

type ReservedWindow = {
  id: string;
  dimensionType: DimensionType;
  exceeded: boolean;
};

type ControlRow = {
  status: "ACTIVE" | "PAUSED";
  generation: bigint;
  activeKeyVersion: number;
  activeKeyFingerprint: string;
  previousGeneration: bigint | null;
  previousKeyVersion: number | null;
  previousKeyFingerprint: string | null;
  previousRetireAt: Date | null;
  policyDigest: string;
  databaseNow: Date;
  windowStartedAt: Date;
  windowEndsAt: Date;
  retainUntil: Date;
};

type CountRow = { count: bigint };

function isRetryableAuthenticationThrottleError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: unknown;
    meta?: { code?: unknown };
    cause?: unknown;
  };
  return (
    value.code === "P2034" ||
    value.meta?.code === "40001" ||
    value.meta?.code === "40P01" ||
    isRetryableAuthenticationThrottleError(value.cause)
  );
}

function integerSetting(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  errorCode: string
) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(errorCode);
  }
  return value;
}

export function loadAuthenticationThrottleConfig(
  environment: NodeJS.ProcessEnv = process.env
): AuthenticationThrottleConfig {
  const hmacKey = environment.AUTH_THROTTLE_HMAC_KEY;
  if (!hmacKey || Buffer.byteLength(hmacKey, "utf8") < 32) {
    throw new Error("AUTH_THROTTLE_HMAC_KEY_INVALID");
  }
  const config: AuthenticationThrottleConfig = {
    hmacKey,
    keyVersion: integerSetting(
      environment.AUTH_THROTTLE_KEY_VERSION,
      1,
      1,
      1_000_000,
      "AUTH_THROTTLE_KEY_VERSION_INVALID"
    ),
    windowMinutes: integerSetting(
      environment.AUTH_THROTTLE_WINDOW_MINUTES,
      15,
      1,
      60,
      "AUTH_THROTTLE_WINDOW_INVALID"
    ),
    retentionDays: integerSetting(
      environment.AUTH_THROTTLE_RETENTION_DAYS,
      30,
      1,
      365,
      "AUTH_THROTTLE_RETENTION_INVALID"
    ),
    identifierShardCount: integerSetting(
      environment.AUTH_THROTTLE_IDENTIFIER_SHARDS,
      64,
      16,
      1024,
      "AUTH_THROTTLE_IDENTIFIER_SHARDS_INVALID"
    ),
    sourceShardCount: integerSetting(
      environment.AUTH_THROTTLE_SOURCE_SHARDS,
      64,
      16,
      1024,
      "AUTH_THROTTLE_SOURCE_SHARDS_INVALID"
    ),
    limits: { PASSWORD: { ...DEFAULT_LIMITS.PASSWORD }, MFA: { ...DEFAULT_LIMITS.MFA } }
  };
  const previousHmacKey = environment.AUTH_THROTTLE_PREVIOUS_HMAC_KEY;
  const previousKeyVersionRaw = environment.AUTH_THROTTLE_PREVIOUS_KEY_VERSION;
  if ((previousHmacKey === undefined) !== (previousKeyVersionRaw === undefined)) {
    throw new Error("AUTH_THROTTLE_PREVIOUS_KEY_PAIR_INVALID");
  }
  if (previousHmacKey !== undefined && previousKeyVersionRaw !== undefined) {
    if (Buffer.byteLength(previousHmacKey, "utf8") < 32) {
      throw new Error("AUTH_THROTTLE_PREVIOUS_HMAC_KEY_INVALID");
    }
    config.previousHmacKey = previousHmacKey;
    config.previousKeyVersion = integerSetting(
      previousKeyVersionRaw,
      1,
      1,
      1_000_000,
      "AUTH_THROTTLE_PREVIOUS_KEY_VERSION_INVALID"
    );
  }
  for (const attemptType of authenticationThrottleAttemptTypes) {
    for (const dimensionType of authenticationThrottleDimensionTypes) {
      config.limits[attemptType][dimensionType] = integerSetting(
        environment[`AUTH_THROTTLE_${attemptType}_${dimensionType}_LIMIT`],
        DEFAULT_LIMITS[attemptType][dimensionType],
        1,
        1_000_000,
        `AUTH_THROTTLE_${attemptType}_${dimensionType}_LIMIT_INVALID`
      );
    }
  }
  return config;
}

export function validateAuthenticationThrottleConfig(
  config: AuthenticationThrottleConfig
) {
  if (Buffer.byteLength(config.hmacKey, "utf8") < 32) {
    throw new Error("AUTH_THROTTLE_HMAC_KEY_INVALID");
  }
  if ((config.previousHmacKey === undefined) !== (config.previousKeyVersion === undefined)) {
    throw new Error("AUTH_THROTTLE_PREVIOUS_KEY_PAIR_INVALID");
  }
  if (config.previousHmacKey !== undefined && config.previousKeyVersion !== undefined) {
    if (Buffer.byteLength(config.previousHmacKey, "utf8") < 32) {
      throw new Error("AUTH_THROTTLE_PREVIOUS_HMAC_KEY_INVALID");
    }
    if (
      !Number.isInteger(config.previousKeyVersion) ||
      config.previousKeyVersion < 1 ||
      config.previousKeyVersion > 1_000_000 ||
      config.previousKeyVersion === config.keyVersion
    ) {
      throw new Error("AUTH_THROTTLE_PREVIOUS_KEY_VERSION_INVALID");
    }
  }
  const integerBounds: Array<[number, number, number, string]> = [
    [config.keyVersion, 1, 1_000_000, "AUTH_THROTTLE_KEY_VERSION_INVALID"],
    [config.windowMinutes, 1, 60, "AUTH_THROTTLE_WINDOW_INVALID"],
    [config.retentionDays, 1, 365, "AUTH_THROTTLE_RETENTION_INVALID"],
    [config.identifierShardCount, 16, 1024, "AUTH_THROTTLE_IDENTIFIER_SHARDS_INVALID"],
    [config.sourceShardCount, 16, 1024, "AUTH_THROTTLE_SOURCE_SHARDS_INVALID"]
  ];
  for (const [value, minimum, maximum, errorCode] of integerBounds) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(errorCode);
    }
  }
  for (const attemptType of authenticationThrottleAttemptTypes) {
    for (const dimensionType of authenticationThrottleDimensionTypes) {
      const limit = config.limits[attemptType][dimensionType];
      if (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000) {
        throw new Error(`AUTH_THROTTLE_${attemptType}_${dimensionType}_LIMIT_INVALID`);
      }
    }
  }
  return config;
}

export function authenticationThrottleKeyFingerprint(secret: string) {
  return createHmac("sha256", secret)
    .update("ogfi-authentication-throttle-key-fingerprint:v1", "utf8")
    .digest("hex");
}

export function authenticationThrottlePolicyDigest(
  config: AuthenticationThrottleConfig
) {
  const canonicalPolicy = JSON.stringify({
    windowMinutes: config.windowMinutes,
    retentionDays: config.retentionDays,
    identifierShardCount: config.identifierShardCount,
    sourceShardCount: config.sourceShardCount,
    limits: authenticationThrottleAttemptTypes.map((attemptType) => [
      attemptType,
      authenticationThrottleDimensionTypes.map((dimensionType) => [
        dimensionType,
        config.limits[attemptType][dimensionType]
      ])
    ])
  });
  return createHash("sha256").update(canonicalPolicy, "utf8").digest("hex");
}

function authenticationThrottleKeyring(config: AuthenticationThrottleConfig) {
  const keys = new Map<number, string>([[config.keyVersion, config.hmacKey]]);
  if (config.previousKeyVersion !== undefined && config.previousHmacKey !== undefined) {
    keys.set(config.previousKeyVersion, config.previousHmacKey);
  }
  if (keys.size > 2) throw new Error("AUTH_THROTTLE_KEYRING_UNBOUNDED");
  return keys;
}

export function authenticationThrottleWindowBounds(
  now: Date,
  windowMinutes: number,
  retentionDays: number
) {
  const windowMs = windowMinutes * 60_000;
  const windowStartedAt = new Date(
    Math.floor(now.getTime() / windowMs) * windowMs
  );
  const windowEndsAt = new Date(windowStartedAt.getTime() + windowMs);
  const retainUntil = new Date(
    windowEndsAt.getTime() + retentionDays * 24 * 60 * 60_000
  );
  return { windowStartedAt, windowEndsAt, retainUntil };
}

function digest(config: AuthenticationThrottleConfig, value: string) {
  return createHmac("sha256", config.hmacKey).update(value).digest();
}

function keyedBucket(
  config: AuthenticationThrottleConfig,
  attemptType: AttemptType,
  dimensionType: DimensionType,
  identity: string
) {
  return createHmac("sha256", config.hmacKey)
    .update(
      `${config.keyVersion}:${attemptType}:${dimensionType}:${identity}`,
      "utf8"
    )
    .digest("hex");
}

function shardNumber(
  config: AuthenticationThrottleConfig,
  signal: string,
  shardCount: number
) {
  return digest(config, signal).readUInt32BE(0) % shardCount;
}

export function buildAuthenticationThrottleDimensions(
  rawInput: AuthenticationThrottleReserveInput,
  config: AuthenticationThrottleConfig
): Dimension[] {
  validateAuthenticationThrottleConfig(config);
  const input = throttleInputSchema.parse(rawInput);
  const identifierShard = shardNumber(
    config,
    input.identifierSignal,
    config.identifierShardCount
  );
  const sourceShard = shardNumber(
    config,
    input.sourceSignal,
    config.sourceShardCount
  );
  const values: Array<{
    dimensionType: DimensionType;
    identity: string;
    shardNumber: number | null;
    tenantId: string | null;
    accountUserId: string | null;
  }> = [
    {
      dimensionType: "GLOBAL",
      identity: "GLOBAL",
      shardNumber: null,
      tenantId: null,
      accountUserId: null
    },
    {
      dimensionType: "IDENTIFIER_SHARD",
      identity: `SHARD:${identifierShard}`,
      shardNumber: identifierShard,
      tenantId: null,
      accountUserId: null
    },
    {
      dimensionType: "SOURCE_SHARD",
      identity: `SHARD:${sourceShard}`,
      shardNumber: sourceShard,
      tenantId: null,
      accountUserId: null
    }
  ];
  if (input.tenantId) {
    values.push({
      dimensionType: "TENANT",
      identity: input.tenantId,
      shardNumber: null,
      tenantId: input.tenantId,
      accountUserId: null
    });
  }
  if (input.tenantId && input.accountUserId) {
    values.push({
      dimensionType: "ACCOUNT",
      identity: `${input.tenantId}:${input.accountUserId}`,
      shardNumber: null,
      tenantId: input.tenantId,
      accountUserId: input.accountUserId
    });
  }
  return values
    .map((value) => ({
      ...value,
      bucketKey: keyedBucket(
        config,
        input.attemptType,
        value.dimensionType,
        value.identity
      ),
      limitCount: config.limits[input.attemptType][value.dimensionType]
    }))
    .sort((left, right) =>
      `${left.dimensionType}:${left.bucketKey}`.localeCompare(
        `${right.dimensionType}:${right.bucketKey}`
      )
    );
}

export type UnsignedAuthenticationThrottleReservation = Omit<
  AuthenticationThrottleReservation,
  "allowed" | "proof"
>;

const AUTHENTICATION_THROTTLE_RESERVATION_HMAC_DOMAIN =
  "ogfi-authentication-throttle-reservation:v1\0";

export function canonicalAuthenticationThrottleReservation(
  reservation: UnsignedAuthenticationThrottleReservation
) {
  return JSON.stringify({
    schemaVersion: reservation.schemaVersion,
    id: reservation.id,
    attemptType: reservation.attemptType,
    tenantId: reservation.tenantId,
    accountUserId: reservation.accountUserId,
    windowStartedAt: reservation.windowStartedAt.toISOString(),
    windowEndsAt: reservation.windowEndsAt.toISOString(),
    expiresAt: reservation.expiresAt.toISOString(),
    generation: reservation.generation.toString(),
    keyVersion: reservation.keyVersion,
    keyFingerprint: reservation.keyFingerprint,
    policyDigest: reservation.policyDigest,
    dimensions: reservation.dimensions.map(({ dimensionType, id }) => ({
      dimensionType,
      id
    }))
  });
}

export function signAuthenticationThrottleReservation(
  reservation: UnsignedAuthenticationThrottleReservation,
  secret: string
) {
  return createHmac("sha256", secret)
    .update(AUTHENTICATION_THROTTLE_RESERVATION_HMAC_DOMAIN, "utf8")
    .update(canonicalAuthenticationThrottleReservation(reservation), "utf8")
    .digest("hex");
}

export function verifyAuthenticationThrottleReservationProof(
  reservation: UnsignedAuthenticationThrottleReservation,
  proof: string,
  secret: string
) {
  return safeHexEqual(
    proof,
    signAuthenticationThrottleReservation(reservation, secret)
  );
}

function safeHexEqual(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function assertAuthenticationThrottleReservationShape(
  reservation: AuthenticationThrottleReservation
) {
  if (
    !reservation.allowed ||
    reservation.schemaVersion !== 1 ||
    !z.string().uuid().safeParse(reservation.id).success ||
    !authenticationThrottleAttemptTypes.includes(reservation.attemptType) ||
    (reservation.tenantId !== null &&
      !z.string().uuid().safeParse(reservation.tenantId).success) ||
    (reservation.accountUserId !== null &&
      !z.string().uuid().safeParse(reservation.accountUserId).success) ||
    (reservation.accountUserId !== null && reservation.tenantId === null) ||
    !(reservation.windowStartedAt instanceof Date) ||
    !(reservation.windowEndsAt instanceof Date) ||
    !(reservation.expiresAt instanceof Date) ||
    !Number.isFinite(reservation.windowStartedAt.getTime()) ||
    reservation.windowEndsAt.getTime() <= reservation.windowStartedAt.getTime() ||
    reservation.expiresAt.getTime() !== reservation.windowEndsAt.getTime() ||
    typeof reservation.generation !== "bigint" ||
    reservation.generation < 1n ||
    !Number.isInteger(reservation.keyVersion) ||
    reservation.keyVersion < 1 ||
    reservation.keyVersion > 1_000_000 ||
    !/^[0-9a-f]{64}$/.test(reservation.keyFingerprint) ||
    !/^[0-9a-f]{64}$/.test(reservation.policyDigest) ||
    !/^[0-9a-f]{64}$/.test(reservation.proof) ||
    reservation.dimensions.length < 3 ||
    reservation.dimensions.length > 5 ||
    reservation.bucketIds.length !== reservation.dimensions.length
  ) {
    throw new Error("AUTH_THROTTLE_RESERVATION_INVALID");
  }
  const sorted = [...reservation.dimensions].sort((left, right) =>
    `${left.dimensionType}:${left.id}`.localeCompare(`${right.dimensionType}:${right.id}`)
  );
  const exactDimensionTypes = reservation.tenantId && reservation.accountUserId
    ? authenticationThrottleDimensionTypes
    : authenticationThrottleDimensionTypes.slice(0, 3);
  if (
    sorted.some((dimension, index) =>
      dimension.id !== reservation.dimensions[index]?.id ||
      dimension.dimensionType !== reservation.dimensions[index]?.dimensionType ||
      !z.string().uuid().safeParse(dimension.id).success
    ) ||
    sorted.map(({ id }) => id).some((id, index) => id !== reservation.bucketIds[index]) ||
    sorted.map(({ dimensionType }) => dimensionType).join(",") !==
      [...exactDimensionTypes].sort().join(",")
  ) {
    throw new Error("AUTH_THROTTLE_RESERVATION_INVALID");
  }
}

async function reserveInTransaction(
  rawInput: AuthenticationThrottleReserveInput,
  tx: TransactionClient,
  config: AuthenticationThrottleConfig
): Promise<AuthenticationThrottleReserveResult> {
  const input = throttleInputSchema.parse(rawInput);
  const dimensions = buildAuthenticationThrottleDimensions(input, config);
  const keyFingerprint = authenticationThrottleKeyFingerprint(config.hmacKey);
  const policyDigest = authenticationThrottlePolicyDigest(config);
  const controlRows = await tx.$queryRaw<ControlRow[]>`
    WITH database_clock AS MATERIALIZED (
      SELECT date_trunc('milliseconds', clock_timestamp())::timestamp AS now
    )
    SELECT control."status"::text AS status,
           control."generation", control."activeKeyVersion",
           control."activeKeyFingerprint"::text AS "activeKeyFingerprint",
           control."previousGeneration", control."previousKeyVersion",
           control."previousKeyFingerprint"::text AS "previousKeyFingerprint",
           control."previousRetireAt", control."policyDigest"::text AS "policyDigest",
           database_clock.now AS "databaseNow",
           (date_trunc('hour', database_clock.now)
             + floor(extract(minute FROM database_clock.now) / ${config.windowMinutes})
               * ${config.windowMinutes} * interval '1 minute')::timestamp AS "windowStartedAt",
           (date_trunc('hour', database_clock.now)
             + (floor(extract(minute FROM database_clock.now) / ${config.windowMinutes}) + 1)
               * ${config.windowMinutes} * interval '1 minute')::timestamp AS "windowEndsAt",
           (date_trunc('hour', database_clock.now)
             + (floor(extract(minute FROM database_clock.now) / ${config.windowMinutes}) + 1)
               * ${config.windowMinutes} * interval '1 minute'
             + ${config.retentionDays} * interval '1 day')::timestamp AS "retainUntil"
      FROM public.lock_authentication_throttle_control() control
      CROSS JOIN database_clock
     WHERE control."id" = 1`;
  const control = controlRows[0];
  if (!control) throw new Error("AUTH_THROTTLE_CONTROL_MISSING");
  if (control.status !== "ACTIVE") throw new Error("AUTH_THROTTLE_CONTROL_PAUSED");
  if (control.activeKeyVersion !== config.keyVersion) {
    throw new Error("AUTH_THROTTLE_CONTROL_KEY_VERSION_MISMATCH");
  }
  if (!safeHexEqual(control.activeKeyFingerprint, keyFingerprint)) {
    throw new Error("AUTH_THROTTLE_CONTROL_KEY_FINGERPRINT_MISMATCH");
  }
  if (!safeHexEqual(control.policyDigest, policyDigest)) {
    throw new Error("AUTH_THROTTLE_CONTROL_POLICY_MISMATCH");
  }
  const dimensionPayload = JSON.stringify(
    dimensions.map((dimension) => ({
      dimensionType: dimension.dimensionType,
      bucketKey: dimension.bucketKey,
      shardNumber: dimension.shardNumber,
      tenantId: dimension.tenantId,
      accountUserId: dimension.accountUserId,
      limitCount: dimension.limitCount
    }))
  );
  const rows = await tx.$queryRaw<ReservedWindow[]>`
    WITH input AS MATERIALIZED (
      SELECT value."dimensionType"::"AuthenticationThrottleDimensionType" AS "dimensionType",
             value."bucketKey"::char(64) AS "bucketKey",
             value."shardNumber" AS "shardNumber",
             value."tenantId"::uuid AS "tenantId",
             value."accountUserId"::uuid AS "accountUserId",
             value."limitCount"::bigint AS "limitCount"
        FROM jsonb_to_recordset(${dimensionPayload}::jsonb) AS value(
          "dimensionType" text, "bucketKey" text, "shardNumber" integer,
          "tenantId" text, "accountUserId" text, "limitCount" integer
        )
    ), upserted AS (
      INSERT INTO "AuthenticationThrottleWindow" (
        "attemptType", "dimensionType", "bucketKey", "keyVersion", "shardNumber",
        "tenantId", "accountUserId", "windowStartedAt", "windowEndsAt", "limitCount",
        "requestCount", "failureReservationCount", "successCount", "deniedCount",
        "firstRequestAt", "lastRequestAt", "thresholdReachedAt", "retainUntil",
        "createdAt", "updatedAt"
      )
      SELECT ${input.attemptType}::"AuthenticationThrottleAttemptType",
             input."dimensionType", input."bucketKey", ${config.keyVersion},
             input."shardNumber", input."tenantId", input."accountUserId",
             ${control.windowStartedAt}, ${control.windowEndsAt}, input."limitCount",
             1, 1, 0, 0, ${control.databaseNow}, ${control.databaseNow}, NULL,
             ${control.retainUntil}, ${control.databaseNow}, ${control.databaseNow}
        FROM input
       ORDER BY input."dimensionType", input."bucketKey"
      ON CONFLICT ("attemptType", "dimensionType", "bucketKey", "keyVersion", "windowStartedAt")
      DO UPDATE SET
        "requestCount" = "AuthenticationThrottleWindow"."requestCount" + 1,
        "failureReservationCount" = "AuthenticationThrottleWindow"."failureReservationCount" + 1,
        "deniedCount" = "AuthenticationThrottleWindow"."deniedCount" + CASE
          WHEN "AuthenticationThrottleWindow"."failureReservationCount" + 1
                 > "AuthenticationThrottleWindow"."limitCount" THEN 1 ELSE 0 END,
        "lastRequestAt" = GREATEST(
          "AuthenticationThrottleWindow"."lastRequestAt", EXCLUDED."lastRequestAt"
        ),
        "thresholdReachedAt" = CASE
          WHEN "AuthenticationThrottleWindow"."failureReservationCount" + 1
                 > "AuthenticationThrottleWindow"."limitCount"
            THEN COALESCE("AuthenticationThrottleWindow"."thresholdReachedAt", GREATEST(
              "AuthenticationThrottleWindow"."lastRequestAt", EXCLUDED."lastRequestAt"
            ))
          ELSE "AuthenticationThrottleWindow"."thresholdReachedAt"
        END,
        "updatedAt" = GREATEST(
          "AuthenticationThrottleWindow"."lastRequestAt", EXCLUDED."lastRequestAt"
        )
      RETURNING "id", "dimensionType"::text AS "dimensionType",
                ("failureReservationCount" > "limitCount") AS exceeded
    )
    SELECT "id", "dimensionType", exceeded
      FROM upserted
     ORDER BY "dimensionType", "id"`;
  if (rows.length !== dimensions.length) {
    throw new Error("AUTH_THROTTLE_RESERVATION_FAILED");
  }
  const thresholdDimensions = rows
    .filter((row) => row.exceeded)
    .map((row) => row.dimensionType);
  const allowed = thresholdDimensions.length === 0;
  if (!allowed) {
    return {
      allowed: false,
      reason: "LIMIT_EXCEEDED",
      reservation: null,
      thresholdDimensions
    };
  }
  const reservationId = randomUUID();
  const reservedDimensions = rows
    .map((row) => ({ id: row.id, dimensionType: row.dimensionType }))
    .sort((left, right) =>
      `${left.dimensionType}:${left.id}`.localeCompare(`${right.dimensionType}:${right.id}`)
    );
  const unsigned = {
    schemaVersion: 1 as const,
    id: reservationId,
    attemptType: input.attemptType,
    tenantId: input.tenantId ?? null,
    accountUserId: input.accountUserId ?? null,
    windowStartedAt: control.windowStartedAt,
    windowEndsAt: control.windowEndsAt,
    expiresAt: control.windowEndsAt,
    generation: control.generation,
    keyVersion: config.keyVersion,
    keyFingerprint,
    policyDigest,
    dimensions: reservedDimensions,
    bucketIds: reservedDimensions.map((dimension) => dimension.id)
  };
  return {
    allowed: true,
    reason: "ALLOWED",
    reservation: {
      allowed: true,
      ...unsigned,
      proof: signAuthenticationThrottleReservation(unsigned, config.hmacKey)
    },
    thresholdDimensions: []
  };
}

export async function assertAuthenticationThrottleKeyRotationReady(
  input: { currentKeyVersion: number },
  options: { client?: AuthenticationThrottleTransactionHost } = {}
) {
  if (
    !Number.isInteger(input.currentKeyVersion) ||
    input.currentKeyVersion < 1 ||
    input.currentKeyVersion > 1_000_000
  ) {
    throw new Error("AUTH_THROTTLE_KEY_VERSION_INVALID");
  }
  const rows = await (options.client ?? prisma).$transaction((tx) =>
    tx.$queryRaw<Array<CountRow & { controlReferenceCount: bigint }>>`
      WITH control AS MATERIALIZED (
        SELECT "previousKeyVersion", "previousRetireAt"
          FROM public.lock_authentication_throttle_control()
         WHERE "id" = 1
      )
      SELECT count(*) FILTER (
               WHERE throttle_window."keyVersion" = ${input.currentKeyVersion}
                 AND throttle_window."windowEndsAt" > clock_timestamp()
             )::bigint AS count,
             count(*) FILTER (
               WHERE control."previousKeyVersion" = ${input.currentKeyVersion}
                 AND control."previousRetireAt" > clock_timestamp()
             )::bigint AS "controlReferenceCount"
        FROM control
        LEFT JOIN "AuthenticationThrottleWindow" throttle_window ON true
      `
  );
  const activeWindowCount = Number(rows[0]?.count ?? 0n);
  const controlReferenceCount = Number(rows[0]?.controlReferenceCount ?? 0n);
  if (activeWindowCount !== 0 || controlReferenceCount !== 0) {
    throw new Error("AUTH_THROTTLE_KEY_ROTATION_NOT_READY");
  }
  return { ready: true as const, activeWindowCount: 0, controlReferenceCount: 0 };
}

export async function transitionAuthenticationThrottleControl(
  input: {
    expectedGeneration: bigint;
    requestedStatus: "ACTIVE" | "PAUSED";
    config: AuthenticationThrottleConfig;
  },
  options: { client?: AuthenticationThrottleTransactionHost } = {}
) {
  if (input.requestedStatus !== "ACTIVE" && input.requestedStatus !== "PAUSED") {
    throw new Error("AUTH_THROTTLE_CONTROL_STATUS_INVALID");
  }
  validateAuthenticationThrottleConfig(input.config);
  if (input.expectedGeneration < 0n) {
    throw new Error("AUTH_THROTTLE_CONTROL_GENERATION_INVALID");
  }
  const rows = await (options.client ?? prisma).$transaction((tx) =>
    tx.$queryRaw<Array<{
      generation: bigint;
      status: "ACTIVE" | "PAUSED";
      activeKeyVersion: number;
      activeKeyFingerprint: string;
      policyDigest: string;
      previousRetireAt: Date | null;
    }>>`
      SELECT result.generation,
             result.status::text AS status,
             result.active_key_version AS "activeKeyVersion",
             result.active_key_fingerprint AS "activeKeyFingerprint",
             result.policy_digest AS "policyDigest",
             result.previous_retire_at AS "previousRetireAt"
        FROM public.operator_transition_authentication_throttle_control(
          ${input.expectedGeneration},
          ${input.requestedStatus}::"AuthenticationThrottleControlStatus",
          ${input.config.keyVersion}::integer,
          ${authenticationThrottleKeyFingerprint(input.config.hmacKey)},
          ${authenticationThrottlePolicyDigest(input.config)}
        ) result`
  );
  if (!rows[0]) throw new Error("AUTH_THROTTLE_CONTROL_TRANSITION_FAILED");
  return rows[0];
}

export async function reserveAuthenticationAttemptInTransaction(
  input: AuthenticationThrottleReserveInput,
  options: {
    client: TransactionClient;
    config?: AuthenticationThrottleConfig;
  }
) {
  const config = options.config ?? loadAuthenticationThrottleConfig();
  validateAuthenticationThrottleConfig(config);
  try {
    return await reserveInTransaction(input, options.client, config);
  } catch (error) {
    throw new Error("AUTH_THROTTLE_UNAVAILABLE", { cause: error });
  }
}

export async function reserveAuthenticationAttempt(
  input: AuthenticationThrottleReserveInput,
  options: {
    client?: AuthenticationThrottleTransactionHost;
    config?: AuthenticationThrottleConfig;
  } = {}
): Promise<AuthenticationThrottleReserveResult> {
  throttleInputSchema.parse(input);
  const config = options.config ?? loadAuthenticationThrottleConfig();
  validateAuthenticationThrottleConfig(config);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await (options.client ?? prisma).$transaction((tx) =>
        reserveInTransaction(input, tx, config)
      );
    } catch (error) {
      if (attempt < 3 && isRetryableAuthenticationThrottleError(error)) continue;
      return {
        allowed: false,
        reason: "THROTTLE_UNAVAILABLE",
        reservation: null,
        thresholdDimensions: []
      };
    }
  }
  throw new Error("AUTH_THROTTLE_UNREACHABLE");
}

async function completeInTransaction(
  reservation: AuthenticationThrottleReservation,
  tx: TransactionClient,
  config: AuthenticationThrottleConfig
) {
  assertAuthenticationThrottleReservationShape(reservation);
  if (!reservation.tenantId || !reservation.accountUserId) {
    throw new Error("AUTH_THROTTLE_SUCCESS_SCOPE_UNRESOLVED");
  }
  validateAuthenticationThrottleConfig(config);
  const secret = authenticationThrottleKeyring(config).get(reservation.keyVersion);
  if (!secret) throw new Error("AUTH_THROTTLE_RESERVATION_KEY_UNAVAILABLE");
  const expectedFingerprint = authenticationThrottleKeyFingerprint(secret);
  const { allowed: _allowed, proof: _proof, ...unsigned } = reservation;
  if (
    !safeHexEqual(reservation.keyFingerprint, expectedFingerprint) ||
    !verifyAuthenticationThrottleReservationProof(unsigned, reservation.proof, secret)
  ) {
    throw new Error("AUTH_THROTTLE_RESERVATION_AUTHENTICATION_FAILED");
  }

  const controlRows = await tx.$queryRaw<Array<ControlRow>>`
    SELECT control."status"::text AS status, control."generation",
           control."activeKeyVersion", control."activeKeyFingerprint"::text AS "activeKeyFingerprint",
           control."previousGeneration", control."previousKeyVersion",
           control."previousKeyFingerprint"::text AS "previousKeyFingerprint",
           control."previousRetireAt", control."policyDigest"::text AS "policyDigest",
           date_trunc('milliseconds', clock_timestamp())::timestamp AS "databaseNow",
           ${reservation.windowStartedAt}::timestamp AS "windowStartedAt",
           ${reservation.windowEndsAt}::timestamp AS "windowEndsAt",
           ${reservation.windowEndsAt}::timestamp AS "retainUntil"
      FROM public.lock_authentication_throttle_control() control
     WHERE control."id" = 1`;
  const control = controlRows[0];
  const activeKeyMatches = Boolean(
    control &&
    control.generation === reservation.generation &&
    control.activeKeyVersion === reservation.keyVersion &&
    safeHexEqual(control.activeKeyFingerprint, reservation.keyFingerprint) &&
    safeHexEqual(control.policyDigest, reservation.policyDigest)
  );
  const previousKeyMatches = Boolean(
    control &&
    control.previousGeneration === reservation.generation &&
    control.previousKeyVersion === reservation.keyVersion &&
    control.previousKeyFingerprint !== null &&
    safeHexEqual(control.previousKeyFingerprint, reservation.keyFingerprint) &&
    control.previousRetireAt !== null &&
    control.databaseNow < control.previousRetireAt
  );
  if (
    !control ||
    control.status !== "ACTIVE" ||
    control.databaseNow >= reservation.expiresAt ||
    (!activeKeyMatches && !previousKeyMatches)
  ) {
    throw new Error("AUTH_THROTTLE_RESERVATION_STALE");
  }

  const auditRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT audit."id"
      FROM "AuditEvent" audit
     WHERE audit."id" = ${reservation.id}::uuid
       AND audit."tenantId" = ${reservation.tenantId}::uuid
       AND audit."actorUserId" = ${reservation.accountUserId}::uuid
       AND audit."entityType" = 'AuthSession'
       AND audit."eventType" = ANY(
         CASE ${reservation.attemptType}::text
           WHEN 'PASSWORD' THEN ARRAY['auth.password.succeeded']::text[]
           ELSE ARRAY['auth.mfa.challenge_succeeded', 'auth.mfa.recovery_used']::text[]
         END
       )
       AND audit.xmin::text = pg_current_xact_id()::text`;
  if (!auditRows[0]) throw new Error("AUTH_THROTTLE_SUCCESS_AUDIT_REQUIRED");

  const markerRows = await tx.$queryRaw<Array<{ reservationId: string }>>`
    SELECT set_config(
      'ogfi.authentication_throttle_success_reservation_id',
      ${reservation.id}, true
    ) AS "reservationId"
     WHERE COALESCE(current_setting(
       'ogfi.authentication_throttle_success_consumed_id', true
     ), '') = ''`;
  if (!markerRows[0]) throw new Error("AUTH_THROTTLE_SUCCESS_ALREADY_CONSUMED");

  const dimensionPayload = JSON.stringify(reservation.dimensions);
  const counts = await tx.$queryRaw<Array<{ lockedCount: bigint; updatedCount: bigint }>>`
    WITH input AS MATERIALIZED (
      SELECT value.id::uuid AS id,
             value."dimensionType"::"AuthenticationThrottleDimensionType" AS "dimensionType"
        FROM jsonb_to_recordset(${dimensionPayload}::jsonb)
          AS value(id text, "dimensionType" text)
    ), locked AS MATERIALIZED (
      SELECT throttle_window."id"
        FROM "AuthenticationThrottleWindow" AS throttle_window
        JOIN input ON input.id = throttle_window."id"
                  AND input."dimensionType" = throttle_window."dimensionType"
       WHERE throttle_window."attemptType" = ${reservation.attemptType}::"AuthenticationThrottleAttemptType"
         AND throttle_window."keyVersion" = ${reservation.keyVersion}::integer
         AND throttle_window."windowStartedAt" = ${reservation.windowStartedAt}
         AND throttle_window."windowEndsAt" = ${reservation.windowEndsAt}
       ORDER BY throttle_window."dimensionType", throttle_window."bucketKey"
       FOR UPDATE OF throttle_window
    ), updated AS (
      UPDATE "AuthenticationThrottleWindow" AS throttle_window
         SET "failureReservationCount" = throttle_window."failureReservationCount" - 1,
             "successCount" = throttle_window."successCount" + 1,
             "updatedAt" = date_trunc('milliseconds', clock_timestamp())
       WHERE throttle_window."id" IN (SELECT "id" FROM locked)
         AND throttle_window."failureReservationCount" > throttle_window."deniedCount"
       RETURNING "id"
    )
    SELECT (SELECT count(*)::bigint FROM locked) AS "lockedCount",
           (SELECT count(*)::bigint FROM updated) AS "updatedCount"`;
  const lockedCount = Number(counts[0]?.lockedCount ?? 0n);
  const updatedCount = Number(counts[0]?.updatedCount ?? 0n);
  if (
    lockedCount !== reservation.dimensions.length ||
    updatedCount !== reservation.dimensions.length
  ) {
    throw new Error("AUTH_THROTTLE_SUCCESS_RELEASE_FAILED");
  }
  await tx.$queryRaw`
    SELECT set_config(
      'ogfi.authentication_throttle_success_consumed_id',
      ${reservation.id}, true
    )`;
  return { completed: true as const, releasedDimensions: updatedCount };
}

export async function completeSuccessfulAuthenticationAttemptInTransaction(
  reservation: AuthenticationThrottleReservation,
  options: { client: TransactionClient; config?: AuthenticationThrottleConfig }
) {
  const config = options.config ?? loadAuthenticationThrottleConfig();
  try {
    return await completeInTransaction(reservation, options.client, config);
  } catch (error) {
    throw new Error("AUTH_THROTTLE_SUCCESS_RELEASE_UNAVAILABLE", { cause: error });
  }
}

export async function completeSuccessfulAuthenticationAttempt(
  reservation: AuthenticationThrottleReservation,
  options: {
    client?: AuthenticationThrottleTransactionHost;
    config?: AuthenticationThrottleConfig;
  } = {}
) {
  const config = options.config ?? loadAuthenticationThrottleConfig();
  try {
    return await (options.client ?? prisma).$transaction((tx) =>
      completeInTransaction(reservation, tx, config)
    );
  } catch (error) {
    throw new Error("AUTH_THROTTLE_SUCCESS_RELEASE_UNAVAILABLE", { cause: error });
  }
}
