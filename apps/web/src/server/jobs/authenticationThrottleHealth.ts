import { pathToFileURL } from "node:url";
import { prisma } from "@ogfi/database";
import {
  authenticationThrottleKeyFingerprint,
  authenticationThrottlePolicyDigest,
  authenticationThrottleWindowBounds,
  loadAuthenticationThrottleConfig,
} from "../services/authenticationThrottle";
import {
  authenticationThrottleHealthCodes,
  boundedHealthCount,
  type AuthenticationThrottleHealthFacts,
} from "./authenticationThrottleHealthPolicy";

type TimestampRow = { occurredAt: Date };
type ControlRow = {
  status: "ACTIVE" | "PAUSED";
  generation: bigint;
  activeKeyVersion: number;
  activeKeyFingerprint: string;
  activeFrom: Date;
  previousGeneration: bigint | null;
  previousKeyVersion: number | null;
  previousKeyFingerprint: string | null;
  previousRetireAt: Date | null;
  policyDigest: string;
  databaseNow: Date;
};
type PressureRow = {
  requestCount: bigint;
  deniedCount: bigint;
  maximumPressurePermille: bigint;
  occupiedIdentifierShards: bigint;
  occupiedSourceShards: bigint;
  maximumShardPressurePermille: bigint;
};

const now = new Date();

function integerEnvironment(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name}_INVALID`);
  return value;
}

function safeEqual(left: string | null, right: string | null) {
  return left !== null && right !== null && left.length === 64 && right.length === 64 && left === right;
}

function previousOverlapIsValid(control: ControlRow, config: ReturnType<typeof loadAuthenticationThrottleConfig>) {
  const envHasPrevious = config.previousKeyVersion !== undefined && config.previousHmacKey !== undefined;
  const dbHasPrevious = control.previousGeneration !== null || control.previousKeyVersion !== null ||
    control.previousKeyFingerprint !== null || control.previousRetireAt !== null;
  if (!envHasPrevious && !dbHasPrevious) return true;
  if (!envHasPrevious || !dbHasPrevious) return false;
  return control.previousGeneration !== null && control.previousGeneration > 0n &&
    control.previousGeneration < control.generation &&
    control.previousKeyVersion === config.previousKeyVersion &&
    safeEqual(control.previousKeyFingerprint, authenticationThrottleKeyFingerprint(config.previousHmacKey!)) &&
    control.previousRetireAt !== null && control.previousRetireAt > control.databaseNow;
}

async function readRuntimeMetrics() {
  const rawUrl = process.env.AUTH_RUNTIME_METRICS_URL;
  const token = process.env.AUTH_HEALTH_METRICS_TOKEN;
  if (!rawUrl || !token || Buffer.byteLength(token, "utf8") < 32) throw new Error("AUTH_RUNTIME_METRICS_CONFIG_INVALID");
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
      url.port !== "2021" || url.pathname !== "/api/internal/authentication-metrics" ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("AUTH_RUNTIME_METRICS_URL_INVALID");
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(3_000),
    cache: "no-store",
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || declaredLength > 16_384) throw new Error("AUTH_RUNTIME_METRICS_UNAVAILABLE");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > 16_384) throw new Error("AUTH_RUNTIME_METRICS_INVALID");
  const value = JSON.parse(body) as Partial<AuthenticationThrottleHealthFacts>;
  const argon2 = value.argon2;
  const counts = argon2 && [argon2.capacity, argon2.active, argon2.maximumActive, argon2.rejected,
    argon2.completed, argon2.totalDurationMs, argon2.maximumDurationMs, value.caddyRejectedDelta];
  if (!counts || counts.some((count) => !Number.isSafeInteger(count) || Number(count) < 0) ||
      !argon2 || argon2.capacity < 1 || argon2.capacity > 4 || argon2.active > argon2.capacity ||
      argon2.maximumActive > argon2.capacity) throw new Error("AUTH_RUNTIME_METRICS_INVALID");
  return { argon2, caddyRejectedDelta: value.caddyRejectedDelta! };
}

export async function runAuthenticationThrottleHealth() {
  try {
    const config = loadAuthenticationThrottleConfig();
    const graceMinutes = integerEnvironment("AUTH_THROTTLE_HEALTH_GRACE_MINUTES", 10, 1, 1440);
    const overdueBefore = new Date(now.getTime() - graceMinutes * 60_000);
    const legacyCutoff = new Date(now.getTime() - config.retentionDays * 86_400_000);
    const legacyOverdueBefore = new Date(legacyCutoff.getTime() - graceMinutes * 60_000);
    const { windowStartedAt } = authenticationThrottleWindowBounds(now, config.windowMinutes, config.retentionDays);
    const previousVersion = config.previousKeyVersion ?? -1;

    const [overdueWindows, overdueLegacyAttempts, incompatibleKeys, controls, pressure, runtime] = await Promise.all([
      prisma.$queryRaw<TimestampRow[]>`SELECT "retainUntil" AS "occurredAt" FROM "AuthenticationThrottleWindow" WHERE "retainUntil" <= ${overdueBefore} ORDER BY "retainUntil", "id" LIMIT 1`,
      prisma.$queryRaw<TimestampRow[]>`SELECT "attemptedAt" AS "occurredAt" FROM "AuthLoginAttempt" WHERE "attemptedAt" < ${legacyOverdueBefore} ORDER BY "attemptedAt", "id" LIMIT 1`,
      prisma.$queryRaw<TimestampRow[]>`SELECT "windowEndsAt" AS "occurredAt" FROM "AuthenticationThrottleWindow" WHERE "windowEndsAt" > clock_timestamp() AND "keyVersion" <> ${config.keyVersion} AND "keyVersion" <> ${previousVersion} ORDER BY "windowEndsAt", "id" LIMIT 1`,
      prisma.$queryRaw<ControlRow[]>`SELECT "status", "generation", "activeKeyVersion", "activeKeyFingerprint"::text AS "activeKeyFingerprint", "activeFrom", "previousGeneration", "previousKeyVersion", "previousKeyFingerprint"::text AS "previousKeyFingerprint", "previousRetireAt", "policyDigest"::text AS "policyDigest", clock_timestamp() AS "databaseNow" FROM "AuthenticationThrottleControl" WHERE "id" = 1 LIMIT 1`,
      prisma.$queryRaw<PressureRow[]>`SELECT LEAST(COALESCE(SUM("requestCount"), 0), 1000000000000)::bigint AS "requestCount", LEAST(COALESCE(SUM("deniedCount"), 0), 1000000000000)::bigint AS "deniedCount", LEAST(COALESCE(MAX(("requestCount"::numeric * 1000) / GREATEST("limitCount", 1)), 0), 1000000000000)::bigint AS "maximumPressurePermille", COUNT(DISTINCT "shardNumber") FILTER (WHERE "dimensionType" = 'IDENTIFIER_SHARD')::bigint AS "occupiedIdentifierShards", COUNT(DISTINCT "shardNumber") FILTER (WHERE "dimensionType" = 'SOURCE_SHARD')::bigint AS "occupiedSourceShards", LEAST(COALESCE(MAX(("requestCount"::numeric * 1000) / GREATEST("limitCount", 1)) FILTER (WHERE "dimensionType" IN ('IDENTIFIER_SHARD', 'SOURCE_SHARD')), 0), 1000000000000)::bigint AS "maximumShardPressurePermille" FROM "AuthenticationThrottleWindow" WHERE "windowStartedAt" = ${windowStartedAt} AND "keyVersion" IN (${config.keyVersion}, ${previousVersion})`,
      readRuntimeMetrics(),
    ]);
    const control = controls[0];
    const aggregate = pressure[0]!;
    const facts: AuthenticationThrottleHealthFacts = {
      cleanupOverdueWindows: overdueWindows.length,
      cleanupOverdueLegacyAttempts: overdueLegacyAttempts.length,
      incompatibleActiveWindows: incompatibleKeys.length,
      controlPresent: Boolean(control),
      controlPaused: control?.status === "PAUSED",
      activeConfigurationMatches: Boolean(control && control.generation > 0n && control.activeFrom <= control.databaseNow &&
        control.activeKeyVersion === config.keyVersion && safeEqual(control.activeKeyFingerprint, authenticationThrottleKeyFingerprint(config.hmacKey)) &&
        safeEqual(control.policyDigest, authenticationThrottlePolicyDigest(config))),
      previousOverlapValid: control ? previousOverlapIsValid(control, config) : false,
      requestCount: boundedHealthCount(aggregate.requestCount),
      deniedCount: boundedHealthCount(aggregate.deniedCount),
      maximumPressurePermille: boundedHealthCount(aggregate.maximumPressurePermille),
      occupiedIdentifierShards: boundedHealthCount(aggregate.occupiedIdentifierShards),
      occupiedSourceShards: boundedHealthCount(aggregate.occupiedSourceShards),
      maximumShardPressurePermille: boundedHealthCount(aggregate.maximumShardPressurePermille),
      argon2: runtime.argon2,
      caddyRejectedDelta: runtime.caddyRejectedDelta,
    };
    const codes = authenticationThrottleHealthCodes(facts, {
      deniedCount: integerEnvironment("AUTH_THROTTLE_HEALTH_DENIED_THRESHOLD", 100, 1, 1_000_000_000),
      pressurePermille: integerEnvironment("AUTH_THROTTLE_HEALTH_PRESSURE_PERMILLE", 900, 1, 1000),
      argon2Rejected: integerEnvironment("AUTH_THROTTLE_HEALTH_ARGON2_REJECTED_THRESHOLD", 10, 1, 1_000_000),
      argon2MaximumDurationMs: integerEnvironment("AUTH_THROTTLE_HEALTH_ARGON2_DURATION_MS", 5_000, 1, 3_600_000),
      caddyRejectedDelta: integerEnvironment("AUTH_THROTTLE_HEALTH_CADDY_REJECTED_THRESHOLD", 100, 1, 1_000_000),
    });
    const payload = { event: "authentication_throttle_health", status: codes.length ? "CRITICAL" : "OK", checkedAt: now.toISOString(), codes, aggregates: facts };
    if (codes.length) { console.error(JSON.stringify(payload)); process.exitCode = 1; }
    else console.log(JSON.stringify(payload));
  } catch (error) {
    console.error(JSON.stringify({ event: "authentication_throttle_health", status: "CRITICAL", code: healthErrorCode(error), checkedAt: now.toISOString() }));
    process.exitCode = 1;
  }
}

function healthErrorCode(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) return error.message;
  return "AUTH_THROTTLE_HEALTH_QUERY_FAILED";
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) void runAuthenticationThrottleHealth();
