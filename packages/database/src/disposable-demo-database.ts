import { createHash, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const DISPOSABLE_DATABASE_NAME =
  /^ogfi_demo_disposable_[a-z0-9][a-z0-9_]{7,}$/;
const DISPOSABLE_TEST_DATABASE_NAME =
  /^ogfi_test_[a-z0-9_]{1,24}_[a-f0-9]{16}$/;
const FORBIDDEN_TEST_DATABASE_TOKENS = new Set([
  "live",
  "pilot",
  "prod",
  "production",
  "shared",
  "stage",
  "staging",
  "uat",
]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const DISPOSABLE_RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

type DisposableDemoDatabaseEnvironment = Record<string, string | undefined>;

type DatabaseIdentity = {
  databaseName: string;
  host: string;
  port: string;
  schema: string;
  username: string;
};

const ROLE_NAME = /^[a-z][a-z0-9_]{2,62}$/;

export type DisposableDatabaseMarkerRow = {
  database_name: string;
  run_id: string;
  nonce_sha256: string;
};

function databaseIdentity(
  label: string,
  rawUrl: string | undefined,
  databaseNamePattern = DISPOSABLE_DATABASE_NAME,
) {
  if (!rawUrl) {
    throw new Error(`DEMO_RESET_${label}_URL_REQUIRED`);
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`DEMO_RESET_${label}_URL_INVALID`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`DEMO_RESET_${label}_URL_MUST_BE_POSTGRESQL`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`DEMO_RESET_${label}_HOST_MUST_BE_LOOPBACK`);
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseNamePattern.test(databaseName)) {
    throw new Error(`DEMO_RESET_${label}_DATABASE_NAME_NOT_DISPOSABLE`);
  }

  const schema = url.searchParams.get("schema") ?? "public";
  if (schema !== "public") {
    throw new Error(`DEMO_RESET_${label}_SCHEMA_MUST_BE_PUBLIC`);
  }

  return {
    databaseName,
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    schema,
    username: decodeURIComponent(url.username),
  } satisfies DatabaseIdentity;
}

export function identifyDisposableDemoDatabase(rawUrl: string | undefined) {
  return databaseIdentity("RUNTIME", rawUrl);
}

export function identifyDisposableTestDatabase(rawUrl: string | undefined) {
  const identity = databaseIdentity(
    "TEST",
    rawUrl,
    DISPOSABLE_TEST_DATABASE_NAME,
  );
  const lifecycleLabel = identity.databaseName
    .slice("ogfi_test_".length, -17)
    .split("_");
  if (lifecycleLabel.some((token) => FORBIDDEN_TEST_DATABASE_TOKENS.has(token))) {
    throw new Error("DEMO_RESET_TEST_DATABASE_NAME_FORBIDDEN");
  }
  return identity;
}

export function assertDisposableDemoDatabase(
  env: DisposableDemoDatabaseEnvironment,
) {
  if (env.NODE_ENV === "production") {
    throw new Error("DEMO_RESET_REFUSES_PRODUCTION_ENVIRONMENT");
  }

  const runtime = databaseIdentity("RUNTIME", env.DATABASE_URL);
  const admin = databaseIdentity(
    "ADMIN",
    env.DEMO_RESET_ADMIN_DATABASE_URL,
  );

  if (
    runtime.databaseName !== admin.databaseName ||
    runtime.host !== admin.host ||
    runtime.port !== admin.port ||
    runtime.schema !== admin.schema
  ) {
    throw new Error("DEMO_RESET_ADMIN_RUNTIME_TARGET_MISMATCH");
  }
  if (!runtime.username || !admin.username || runtime.username === admin.username) {
    throw new Error("DEMO_RESET_ADMIN_IDENTITY_MUST_BE_DISTINCT");
  }

  const requiredConfirmation = `DROP_RECREATE:${runtime.databaseName}`;
  if (env.OGFI_DISPOSABLE_DATABASE_CONFIRMATION !== requiredConfirmation) {
    throw new Error("DEMO_RESET_EXACT_CONFIRMATION_REQUIRED");
  }

  return runtime;
}

export function assertDisposableDemoRoleContract(
  env: DisposableDemoDatabaseEnvironment,
  expectedRuntime: DatabaseIdentity,
) {
  const runtime = databaseIdentity("RUNTIME", env.DATABASE_URL);
  const admin = databaseIdentity("ADMIN", env.DEMO_RESET_ADMIN_DATABASE_URL);
  const migrator = databaseIdentity(
    "MIGRATOR",
    env.DEMO_RESET_MIGRATOR_DATABASE_URL,
  );
  const ownerRole = env.DEMO_RESET_OWNER_ROLE;
  if (!ownerRole) {
    throw new Error("DEMO_RESET_OWNER_ROLE_REQUIRED");
  }
  if (!ROLE_NAME.test(ownerRole)) {
    throw new Error("DEMO_RESET_OWNER_ROLE_INVALID");
  }
  for (const candidate of [runtime, admin, migrator]) {
    if (
      candidate.databaseName !== expectedRuntime.databaseName ||
      candidate.host !== expectedRuntime.host ||
      candidate.port !== expectedRuntime.port ||
      candidate.schema !== expectedRuntime.schema
    ) {
      throw new Error("DEMO_RESET_ROLE_CONTRACT_TARGET_MISMATCH");
    }
  }
  if (
    !runtime.username ||
    !migrator.username ||
    new Set([ownerRole, migrator.username, runtime.username]).size !== 3 ||
    [ownerRole, migrator.username, runtime.username].includes(admin.username)
  ) {
    throw new Error("DEMO_RESET_ROLE_CONTRACT_IDENTITIES_MUST_BE_DISTINCT");
  }
  return {
    databaseName: runtime.databaseName,
    migratorDatabaseUrl: env.DEMO_RESET_MIGRATOR_DATABASE_URL!,
    migratorRole: migrator.username,
    ownerRole,
    runtimeDatabaseUrl: env.DATABASE_URL!,
    runtimeRole: runtime.username,
  };
}

export function scrubPrivilegedDatabaseEnvironment(
  sourceEnv: DisposableDemoDatabaseEnvironment,
): DisposableDemoDatabaseEnvironment {
  const env = { ...sourceEnv };
  for (const key of Object.keys(env)) {
    if (
      [
        "DATABASE_URL",
        "DATABASE_URL_FILE",
        "DIRECT_DATABASE_URL",
        "DIRECT_DATABASE_URL_FILE",
        "DEMO_RESET_ADMIN_DATABASE_URL",
        "DEMO_RESET_MIGRATOR_DATABASE_URL",
        "OGFI_DISPOSABLE_DATABASE_CONFIRMATION",
        "OGFI_DISPOSABLE_DATABASE_NONCE",
      ].includes(key) ||
      (/(?:DATABASE|POSTGRES)/i.test(key) &&
        /(?:URL|URI|DSN|CONNECTION|PASSWORD|SECRET|TOKEN|CREDENTIAL|FILE)/i.test(key)) ||
      (/DISPOSABLE/i.test(key) && /(?:NONCE|CONFIRMATION)/i.test(key)) ||
      /^POSTGRES/i.test(key) ||
      /^PG/i.test(key) ||
      (/(?:ADMIN|MIGRAT|OWNER|SETUP|SECONDARY|DIRECT)/i.test(key) &&
        /(?:PASSWORD|SECRET|TOKEN|CREDENTIAL|URL|URI|DSN|CONNECTION|FILE)/i.test(key)) ||
      (/(?:ADMIN|MIGRAT|OWNER|SETUP|SECONDARY|DIRECT)/i.test(key) &&
        /DATABASE|POSTGRES/i.test(key))
    ) {
      delete env[key];
    }
  }
  return env;
}

export function buildDatabaseUrlChildEnvironment(
  sourceEnv: DisposableDemoDatabaseEnvironment,
  databaseUrl: string,
  includeDirectDatabaseUrl = false,
): DisposableDemoDatabaseEnvironment {
  return {
    ...scrubPrivilegedDatabaseEnvironment(sourceEnv),
    DATABASE_URL: databaseUrl,
    ...(includeDirectDatabaseUrl ? { DIRECT_DATABASE_URL: databaseUrl } : {}),
  };
}

export function buildPostgresChildEnvironment(
  sourceEnv: DisposableDemoDatabaseEnvironment,
  databaseUrl: string,
): DisposableDemoDatabaseEnvironment {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DEMO_RESET_POSTGRES_URL_INVALID");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("DEMO_RESET_POSTGRES_URL_INVALID");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !databaseName) {
    throw new Error("DEMO_RESET_POSTGRES_URL_INVALID");
  }
  const env = scrubPrivilegedDatabaseEnvironment(sourceEnv);
  env.PGHOST = parsed.hostname.replace(/^\[|\]$/g, "");
  env.PGPORT = parsed.port || "5432";
  env.PGDATABASE = databaseName;
  env.PGSSLMODE = parsed.searchParams.get("sslmode") || "prefer";
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  return env;
}

function safeHashEquals(actual: string, expected: string) {
  if (!SHA256_HEX.test(actual) || !SHA256_HEX.test(expected)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export function assertDisposableDatabaseMarker(
  env: DisposableDemoDatabaseEnvironment,
  identity: DatabaseIdentity,
  rows: DisposableDatabaseMarkerRow[],
) {
  const runId = env.OGFI_DISPOSABLE_DATABASE_RUN_ID;
  const nonce = env.OGFI_DISPOSABLE_DATABASE_NONCE;
  if (!runId || !DISPOSABLE_RUN_ID.test(runId)) {
    throw new Error("DEMO_RESET_DISPOSABLE_RUN_ID_INVALID");
  }
  if (!nonce || nonce.length < 32 || nonce.length > 512) {
    throw new Error("DEMO_RESET_DISPOSABLE_NONCE_INVALID");
  }
  if (rows.length !== 1) {
    throw new Error("DEMO_RESET_DATABASE_MARKER_MISSING_OR_AMBIGUOUS");
  }

  const marker = rows[0];
  if (!marker || marker.database_name !== identity.databaseName) {
    throw new Error("DEMO_RESET_DATABASE_MARKER_NAME_MISMATCH");
  }
  if (marker.run_id !== runId) {
    throw new Error("DEMO_RESET_DATABASE_MARKER_RUN_ID_MISMATCH");
  }

  const expectedNonceHash = createHash("sha256").update(nonce).digest("hex");
  if (!safeHashEquals(marker.nonce_sha256, expectedNonceHash)) {
    throw new Error("DEMO_RESET_DATABASE_MARKER_NONCE_MISMATCH");
  }
}

export function assertDisposableTestDatabaseMarker(
  env: DisposableDemoDatabaseEnvironment,
  identity: DatabaseIdentity,
  rows: DisposableDatabaseMarkerRow[],
) {
  const expectedName = env.OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME;
  const expectedRunId = env.OGFI_DISPOSABLE_DATABASE_RUN_ID;
  const expectedNonceHash = env.OGFI_DISPOSABLE_DATABASE_NONCE_SHA256;
  if (expectedName !== identity.databaseName) {
    throw new Error("SEED_TEST_DATABASE_EXPECTED_NAME_MISMATCH");
  }
  if (!expectedRunId || !DISPOSABLE_RUN_ID.test(expectedRunId)) {
    throw new Error("SEED_TEST_DATABASE_RUN_ID_INVALID");
  }
  if (!expectedNonceHash || !SHA256_HEX.test(expectedNonceHash)) {
    throw new Error("SEED_TEST_DATABASE_NONCE_HASH_INVALID");
  }
  if (rows.length !== 1) {
    throw new Error("SEED_TEST_DATABASE_MARKER_MISSING_OR_AMBIGUOUS");
  }

  const marker = rows[0];
  if (!marker || marker.database_name !== expectedName) {
    throw new Error("SEED_TEST_DATABASE_MARKER_NAME_MISMATCH");
  }
  if (marker.run_id !== expectedRunId) {
    throw new Error("SEED_TEST_DATABASE_MARKER_RUN_ID_MISMATCH");
  }
  if (!safeHashEquals(marker.nonce_sha256, expectedNonceHash)) {
    throw new Error("SEED_TEST_DATABASE_MARKER_NONCE_HASH_MISMATCH");
  }
}

export async function verifyDisposableDatabaseMarker(
  env: DisposableDemoDatabaseEnvironment,
  identity: DatabaseIdentity,
) {
  const adminDatabaseUrl = env.DEMO_RESET_ADMIN_DATABASE_URL;
  if (!adminDatabaseUrl) {
    throw new Error("DEMO_RESET_ADMIN_URL_REQUIRED");
  }

  const admin = new PrismaClient({ datasourceUrl: adminDatabaseUrl });
  try {
    let rows: DisposableDatabaseMarkerRow[];
    try {
      rows = await admin.$queryRaw<DisposableDatabaseMarkerRow[]>`
        SELECT database_name, run_id, nonce_sha256
        FROM ogfi_disposable_control.database_identity
        WHERE singleton = TRUE
      `;
    } catch {
      throw new Error("DEMO_RESET_DATABASE_MARKER_UNREADABLE");
    }
    assertDisposableDatabaseMarker(env, identity, rows);
  } finally {
    await admin.$disconnect();
  }
}
