import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const environmentDefinitions = {
  production: { databaseMarker: /(?:^|[_-])(prod|production)(?:[_-]|$)/, prefix: "ogfi_prod" },
  staging: { databaseMarker: /(?:^|[_-])(stage|staging)(?:[_-]|$)/, prefix: "ogfi_stg" },
};

const rolePattern = /^[a-z][a-z0-9_]{2,62}$/;
const databasePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,62}$/;

export function loadDatabaseRoleContract(env = process.env) {
  const appEnvironment = env.APP_ENV;
  const definition = environmentDefinitions[appEnvironment];
  if (!definition) {
    throw new Error("APP_ENV must be production or staging for controlled database operations.");
  }

  const expectedDatabaseName = required(env, "OGFI_DATABASE_NAME");
  if (!databasePattern.test(expectedDatabaseName)) {
    throw new Error("OGFI_DATABASE_NAME contains unsupported characters.");
  }
  if (!definition.databaseMarker.test(expectedDatabaseName.toLowerCase())) {
    throw new Error(`OGFI_DATABASE_NAME is not positively identified as ${appEnvironment}.`);
  }

  const roles = {
    owner: required(env, "OGFI_DATABASE_OWNER_ROLE"),
    migrator: required(env, "OGFI_DATABASE_MIGRATOR_ROLE"),
    runtime: required(env, "OGFI_DATABASE_RUNTIME_ROLE"),
  };
  const expectedRoles = {
    owner: `${definition.prefix}_owner`,
    migrator: `${definition.prefix}_migrator`,
    runtime: `${definition.prefix}_runtime`,
  };
  for (const [kind, role] of Object.entries(roles)) {
    if (!rolePattern.test(role)) {
      throw new Error(`OGFI database ${kind} role contains unsupported characters.`);
    }
    if (role !== expectedRoles[kind]) {
      throw new Error(`OGFI database ${kind} role must be ${expectedRoles[kind]} for ${appEnvironment}.`);
    }
  }
  if (new Set(Object.values(roles)).size !== 3) {
    throw new Error("Owner, migrator, and runtime database roles must be distinct.");
  }

  const requireRootOwnership = env.OGFI_REQUIRE_ROOT_OWNED_DATABASE_CREDENTIALS !== "no";
  const credentialsDirectory = env.CREDENTIALS_DIRECTORY;
  const migrationCredential = readCredentialFile(
    required(env, "MIGRATION_DATABASE_URL_FILE"),
    { requireRootOwnership, credentialsDirectory, expectedCredentialName: "migration_database_url" },
  );
  const runtimeCredential = readCredentialFile(
    required(env, "RUNTIME_DATABASE_URL_FILE"),
    { requireRootOwnership, credentialsDirectory, expectedCredentialName: "runtime_database_url" },
  );
  const migration = parseConnection(migrationCredential.value, "migration");
  const runtime = parseConnection(runtimeCredential.value, "runtime");

  assertConnection(migration, roles.migrator, expectedDatabaseName, "migration");
  assertConnection(runtime, roles.runtime, expectedDatabaseName, "runtime");
  if (migration.endpointFingerprint !== runtime.endpointFingerprint) {
    throw new Error("Migration and runtime credentials must target the same database endpoint.");
  }
  if (migration.identityFingerprint === runtime.identityFingerprint) {
    throw new Error("Migration and runtime connection identity fingerprints must differ.");
  }
  if (migrationCredential.value === runtimeCredential.value) {
    throw new Error("Migration and runtime credentials must not be identical.");
  }

  const applicationEnvironmentFile = assertApplicationEnvironmentFile(
    required(env, "OGFI_APPLICATION_ENV_FILE"),
    { migration, runtime, migrationUrl: migrationCredential.value, requireRootOwnership },
  );

  return {
    appEnvironment,
    expectedDatabaseName,
    roles,
    migration: { ...migration, url: migrationCredential.value },
    runtime: { ...runtime, url: runtimeCredential.value },
    credentialFiles: {
      migration: migrationCredential.path,
      runtime: runtimeCredential.path,
    },
    applicationEnvironmentFile,
  };
}

export function assertApplicationEnvironmentFile(
  path,
  { migration, runtime, migrationUrl, requireRootOwnership = true },
) {
  const absolutePath = resolve(path);
  if (absolutePath !== path) {
    throw new Error("Application environment file path must be absolute.");
  }
  const linkStat = lstatSync(absolutePath);
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
    throw new Error("Application environment path must be a regular non-symlink file.");
  }
  const fileStat = statSync(absolutePath);
  if (process.platform !== "win32" && (fileStat.mode & 0o027) !== 0) {
    throw new Error("Application environment file must not be writable by group or accessible by other users.");
  }
  if (requireRootOwnership && process.platform !== "win32" && fileStat.uid !== 0) {
    throw new Error("Application environment file must be root-owned.");
  }

  const content = readFileSync(absolutePath, "utf8");
  const assignments = parseEnvironmentAssignments(content);
  for (const key of assignments.keys()) {
    if (
      key === "DIRECT_DATABASE_URL" ||
      key === "MIGRATION_DATABASE_URL" ||
      (key !== "DATABASE_URL" && /(?:DATABASE|POSTGRES).*URL|URL.*(?:DATABASE|POSTGRES)/i.test(key)) ||
      /(?:ADMIN|OWNER|MIGRAT).*(?:URL|PASSWORD|CREDENTIAL|SECRET)|(?:URL|PASSWORD|CREDENTIAL|SECRET).*(?:ADMIN|OWNER|MIGRAT)/i.test(key)
    ) {
      throw new Error(`Application environment file contains forbidden privileged database setting ${key}.`);
    }
  }
  const runtimeUrl = assignments.get("DATABASE_URL");
  if (!runtimeUrl) {
    throw new Error("Application environment file must define DATABASE_URL for the runtime role.");
  }
  const application = parseConnection(runtimeUrl, "application runtime");
  if (
    application.username !== runtime.username ||
    application.password !== runtime.password ||
    application.endpointFingerprint !== runtime.endpointFingerprint
  ) {
    throw new Error("Application DATABASE_URL must match the reviewed runtime credential.");
  }
  if (content.includes(migrationUrl) || content.includes(migration.username)) {
    throw new Error("Application environment file exposes the migration database identity.");
  }
  return absolutePath;
}

export function readCredentialFile(
  path,
  {
    requireRootOwnership = true,
    credentialsDirectory,
    expectedCredentialName,
  } = {},
) {
  const absolutePath = resolve(path);
  if (absolutePath !== path) {
    throw new Error("Database credential paths must be absolute.");
  }
  const linkStat = lstatSync(absolutePath);
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
    throw new Error("Database credential path must be a regular non-symlink file.");
  }
  const fileStat = statSync(absolutePath);
  if (process.platform !== "win32" && (fileStat.mode & 0o077) !== 0) {
    throw new Error("Database credential files must not be accessible by group or other users.");
  }
  if (credentialsDirectory) {
    assertSystemdCredentialProvenance(
      absolutePath,
      fileStat,
      credentialsDirectory,
      expectedCredentialName,
    );
  } else if (requireRootOwnership && process.platform !== "win32" && fileStat.uid !== 0) {
    throw new Error("Database credential source files must be root-owned.");
  }
  const value = readFileSync(absolutePath, "utf8").trim();
  if (!value || /[\r\n]/.test(value)) {
    throw new Error("Database credential file must contain exactly one non-empty URL.");
  }
  return { path: absolutePath, value };
}

function assertSystemdCredentialProvenance(
  absolutePath,
  fileStat,
  credentialsDirectory,
  expectedCredentialName,
) {
  if (process.platform === "win32") {
    throw new Error("CREDENTIALS_DIRECTORY is supported only for the reviewed Linux systemd units.");
  }
  const absoluteDirectory = resolve(credentialsDirectory);
  if (absoluteDirectory !== credentialsDirectory || dirname(absolutePath) !== absoluteDirectory) {
    throw new Error("Database credential must be inside the exact systemd CREDENTIALS_DIRECTORY.");
  }
  if (!expectedCredentialName || basename(absolutePath) !== expectedCredentialName) {
    throw new Error("Database credential filename does not match the reviewed systemd credential ID.");
  }
  const directoryLinkStat = lstatSync(absoluteDirectory);
  if (directoryLinkStat.isSymbolicLink() || !directoryLinkStat.isDirectory()) {
    throw new Error("CREDENTIALS_DIRECTORY must be a regular non-symlink directory.");
  }
  const directoryStat = statSync(absoluteDirectory);
  if ((directoryStat.mode & 0o077) !== 0) {
    throw new Error("CREDENTIALS_DIRECTORY must not be accessible by group or other users.");
  }
  const serviceUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (serviceUid === undefined || fileStat.uid !== serviceUid) {
    throw new Error("Copied systemd credential must be owned by the service UID.");
  }
  if (directoryStat.uid !== serviceUid && directoryStat.uid !== 0) {
    throw new Error("CREDENTIALS_DIRECTORY owner is not the service UID or root.");
  }
}

export function parseConnection(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} database credential is not a parseable URL.`);
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error(`${label} database credential must use PostgreSQL.`);
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.username || !parsed.password || !parsed.hostname || !databaseName) {
    throw new Error(`${label} database credential must include user, password, host, and database.`);
  }
  if (parsed.searchParams.has("options")) {
    throw new Error(`${label} database credential must not include connection-startup role options.`);
  }
  const port = parsed.port || "5432";
  const schema = parsed.searchParams.get("schema") || "public";
  const endpointDescriptor = `${parsed.hostname.toLowerCase()}:${port}/${databaseName}?schema=${schema}`;
  const identityDescriptor = `${decodeURIComponent(parsed.username)}@${endpointDescriptor}`;
  return {
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    host: parsed.hostname,
    port,
    databaseName,
    schema,
    sslmode: parsed.searchParams.get("sslmode"),
    endpointFingerprint: fingerprint(endpointDescriptor),
    identityFingerprint: fingerprint(identityDescriptor),
  };
}

export function postgresProcessEnvironment(connection, base = process.env) {
  const env = {
    ...base,
    PGHOST: connection.host,
    PGPORT: connection.port,
    PGDATABASE: connection.databaseName,
    PGUSER: connection.username,
    PGPASSWORD: connection.password,
  };
  if (connection.sslmode) env.PGSSLMODE = connection.sslmode;
  return env;
}

export function sanitizedContractSummary(contract) {
  return {
    appEnvironment: contract.appEnvironment,
    databaseName: contract.expectedDatabaseName,
    databaseEndpointFingerprint: contract.migration.endpointFingerprint,
    migrationIdentityFingerprint: contract.migration.identityFingerprint,
    runtimeIdentityFingerprint: contract.runtime.identityFingerprint,
    roles: contract.roles,
  };
}

function assertConnection(connection, expectedRole, expectedDatabaseName, label) {
  if (connection.username !== expectedRole) {
    throw new Error(`${label} database credential username must match its declared role.`);
  }
  if (connection.databaseName !== expectedDatabaseName) {
    throw new Error(`${label} database credential targets an unexpected database.`);
  }
  if (connection.schema !== "public") {
    throw new Error(`${label} database credential must use the reviewed public schema.`);
  }
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseEnvironmentAssignments(content) {
  const assignments = new Map();
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (assignments.has(match[1])) {
      throw new Error(`Application environment file defines ${match[1]} more than once (line ${index + 1}).`);
    }
    assignments.set(match[1], value);
  }
  return assignments;
}
