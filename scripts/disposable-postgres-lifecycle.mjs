import { createHash, randomBytes } from "node:crypto";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const forbiddenDatabaseToken =
  /(?:^|[_-])(prod(?:uction)?|live|stag(?:e|ing)|shared|pilot|uat)(?:[_-]|$)/i;
const disposableDatabasePattern = /^ogfi_test_([a-z0-9_]{1,24})_([a-f0-9]{16})$/;

export function createDisposablePostgresIdentity(runId, nonce = randomBytes(32).toString("hex")) {
  if (!/^[A-Za-z0-9._-]{6,128}$/.test(runId ?? "")) {
    throw new Error("DISPOSABLE_DATABASE_RUN_ID_INVALID");
  }
  if (!/^[a-f0-9]{64}$/.test(nonce)) {
    throw new Error("DISPOSABLE_DATABASE_NONCE_INVALID");
  }
  const runToken = runId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  if (!runToken || forbiddenDatabaseToken.test(runToken)) {
    throw new Error("DISPOSABLE_DATABASE_RUN_ID_UNSAFE");
  }
  const databaseName = `ogfi_test_${runToken}_${nonce.slice(0, 16)}`;
  const rolePrefix = `ogfi_test_${runToken.slice(0, 10)}_${nonce.slice(0, 32)}`;
  const identity = {
    adversarialRole: `ogfi_adv_${runToken.slice(0, 8)}_${nonce.slice(0, 32)}`,
    databaseName,
    migratorRole: `${rolePrefix}_migrator`,
    nonce,
    nonceSha256: createHash("sha256").update(nonce).digest("hex"),
    ownerRole: `${rolePrefix}_owner`,
    runId,
    runToken,
    runtimeRole: `${rolePrefix}_runtime`,
  };
  assertAdversarialRoleBinding(identity);
  return identity;
}

export function assertAdversarialRoleBinding({
  databaseName,
  ownerRole,
  migratorRole,
  runtimeRole,
  adversarialRole,
}) {
  const databaseIdentity = /^ogfi_test_([a-z0-9_]{1,24})_([a-f0-9]{16})$/.exec(
    databaseName ?? "",
  );
  const controlledIdentity = /^ogfi_test_([a-z0-9_]{1,10})_([a-f0-9]{32})_owner$/.exec(
    ownerRole ?? "",
  );
  const adversarialIdentity = /^ogfi_adv_([a-z0-9_]{1,8})_([a-f0-9]{32})$/.exec(
    adversarialRole ?? "",
  );
  if (
    !databaseIdentity ||
    !controlledIdentity ||
    !adversarialIdentity ||
    migratorRole !== ownerRole.replace(/_owner$/, "_migrator") ||
    runtimeRole !== ownerRole.replace(/_owner$/, "_runtime") ||
    controlledIdentity[1] !== databaseIdentity[1].slice(0, 10) ||
    adversarialIdentity[1] !== databaseIdentity[1].slice(0, 8) ||
    controlledIdentity[2].slice(0, 16) !== databaseIdentity[2] ||
    adversarialIdentity[2] !== controlledIdentity[2]
  ) {
    throw new Error("DISPOSABLE_ADVERSARIAL_ROLE_CROSS_RUN");
  }
  return true;
}

export function assertSafeAdminUrl(rawUrl) {
  if (!rawUrl) throw new Error("DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED");
  const parsed = parsePostgresUrl(rawUrl, "DISPOSABLE_DATABASE_ADMIN_URL_INVALID");
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DISPOSABLE_DATABASE_ADMIN_URL_INVALID");
  }
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error("DISPOSABLE_DATABASE_ADMIN_HOST_UNSAFE");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName || forbiddenDatabaseToken.test(databaseName)) {
    throw new Error("DISPOSABLE_DATABASE_ADMIN_TARGET_UNSAFE");
  }
  return parsed;
}

export function assertSafeDisposableTarget({
  adminUrl,
  databaseName,
  runtimeUrl,
  runtimeRole,
}) {
  const parsedAdmin = assertSafeAdminUrl(adminUrl);
  const parsedRuntime = parsePostgresUrl(
    runtimeUrl,
    "DISPOSABLE_DATABASE_RUNTIME_URL_INVALID",
  );
  if (!disposableDatabasePattern.test(databaseName) || forbiddenDatabaseToken.test(databaseName)) {
    throw new Error("DISPOSABLE_DATABASE_NAME_UNSAFE");
  }
  if (
    parsedRuntime.hostname !== parsedAdmin.hostname ||
    effectivePort(parsedRuntime) !== effectivePort(parsedAdmin)
  ) {
    throw new Error("DISPOSABLE_DATABASE_HOST_MISMATCH");
  }
  if (decodeURIComponent(parsedRuntime.pathname.replace(/^\//, "")) !== databaseName) {
    throw new Error("DISPOSABLE_DATABASE_URL_NAME_MISMATCH");
  }
  if (decodeURIComponent(parsedRuntime.username) !== runtimeRole) {
    throw new Error("DISPOSABLE_DATABASE_RUNTIME_ROLE_MISMATCH");
  }
  if (
    decodeURIComponent(parsedRuntime.username) === decodeURIComponent(parsedAdmin.username) ||
    comparableUrl(parsedRuntime) === comparableUrl(parsedAdmin)
  ) {
    throw new Error("DISPOSABLE_DATABASE_URL_OVERLAP");
  }
  return true;
}

export function assertMarkerRow(row, identity) {
  if (
    !row ||
    row.databaseName !== identity.databaseName ||
    row.runId !== identity.runId ||
    row.nonceSha256 !== identity.nonceSha256
  ) {
    throw new Error("DISPOSABLE_DATABASE_MARKER_MISMATCH");
  }
  return true;
}

export function buildRuntimeEnvironment(sourceEnv, runtimeUrl, identity, adminUrl) {
  const parsedAdmin = assertSafeAdminUrl(adminUrl);
  const env = scrubDatabaseCredentialEnvironment(sourceEnv);
  return {
    ...env,
    DATABASE_URL: runtimeUrl,
    AUTHORIZATION_DATABASE_INTEGRATION: "yes",
    AUTH_DATABASE_INTEGRATION: "yes",
    AUTHORIZATION_TEST_DATABASE: identity.databaseName,
    AUTHORIZATION_TEST_DATABASE_HOST: parsedAdmin.hostname,
    AUTHORIZATION_TEST_DATABASE_PORT: parsedAdmin.port || "5432",
    AUTHORIZATION_TEST_RUN_ID: identity.runId,
    AUTHORIZATION_TEST_RUNTIME_ROLE: identity.runtimeRole,
    AUTHORIZATION_TEST_DATABASE_NONCE_SHA256: identity.nonceSha256,
    OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME: identity.databaseName,
    OGFI_DISPOSABLE_DATABASE_RUN_ID: identity.runId,
    OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: identity.nonceSha256,
  };
}

export function buildSeedRepeatabilityEnvironment(
  sourceEnv,
  runtimeUrl,
  identity,
  adminUrl,
) {
  return {
    ...buildRuntimeEnvironment(sourceEnv, runtimeUrl, identity, adminUrl),
    OGFI_RUN_SEED_REPEATABILITY_TEST: "true",
  };
}

export function shouldRunSeedRepeatability(suiteName) {
  return suiteName === "authorization-all";
}

export function shouldRunAdversarialRoleContract(suiteName) {
  return suiteName === "authorization-all";
}

export function scrubDatabaseCredentialEnvironment(sourceEnv) {
  const env = { ...sourceEnv };
  for (const key of Object.keys(env)) {
    if (
      [
        "DATABASE_URL",
        "DATABASE_URL_FILE",
        "DIRECT_DATABASE_URL",
        "DIRECT_DATABASE_URL_FILE",
        "DISPOSABLE_DATABASE_ADMIN_URL",
        "OGFI_DISPOSABLE_DATABASE_CONFIRMATION",
        "OGFI_DISPOSABLE_DATABASE_NONCE",
      ].includes(key) ||
      (/(?:DATABASE|POSTGRES)/i.test(key) &&
        /(?:URL|URI|DSN|CONNECTION|PASSWORD|SECRET|TOKEN|CREDENTIAL|FILE)/i.test(key)) ||
      (/DISPOSABLE/i.test(key) && /(?:NONCE|CONFIRMATION)/i.test(key)) ||
      /^POSTGRES/i.test(key) ||
      /^PG/i.test(key) ||
      (/(?:ADMIN|MIGRAT|OWNER|SETUP)/i.test(key) &&
        /(?:PASSWORD|SECRET|TOKEN|CREDENTIAL|URL|URI|DSN|CONNECTION|FILE)/i.test(key)) ||
      (/(?:ADMIN|MIGRAT|OWNER|SETUP)/i.test(key) && /DATABASE|POSTGRES/i.test(key))
    ) {
      delete env[key];
    }
  }
  return env;
}

export function buildPsqlEnvironment(sourceEnv, rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("DISPOSABLE_DATABASE_PSQL_CONNECTION_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DISPOSABLE_DATABASE_PSQL_CONNECTION_INVALID");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !databaseName) {
    throw new Error("DISPOSABLE_DATABASE_PSQL_CONNECTION_INVALID");
  }
  const env = scrubDatabaseCredentialEnvironment(sourceEnv);
  env.PGHOST = parsed.hostname.replace(/^\[|\]$/g, "");
  env.PGPORT = parsed.port || "5432";
  env.PGDATABASE = databaseName;
  env.PGSSLMODE = parsed.searchParams.get("sslmode") || "prefer";
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  return env;
}

export function targetDatabaseUrl(baseUrl, databaseName, credentials) {
  const parsed = parsePostgresUrl(baseUrl, "DISPOSABLE_DATABASE_BASE_URL_INVALID");
  parsed.pathname = `/${databaseName}`;
  parsed.searchParams.delete("schema");
  if (credentials) {
    parsed.username = encodeURIComponent(credentials.username);
    parsed.password = encodeURIComponent(credentials.password);
  }
  return parsed.toString();
}

export function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error("DISPOSABLE_DATABASE_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

export function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function effectivePort(parsed) {
  return parsed.port || "5432";
}

function comparableUrl(parsed) {
  return `${parsed.protocol}//${parsed.username}@${parsed.hostname}:${effectivePort(parsed)}${parsed.pathname}`;
}

function parsePostgresUrl(rawUrl, errorCode) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(errorCode);
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(errorCode);
  }
  return parsed;
}

export const disposablePostgresPatterns = {
  databaseName: disposableDatabasePattern,
  forbiddenDatabaseToken,
};
