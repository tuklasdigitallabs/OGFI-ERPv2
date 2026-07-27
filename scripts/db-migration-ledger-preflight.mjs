import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { postgresProcessEnvironment } from "./database-role-contract-lib.mjs";

const defaultMigrationsDirectory = fileURLToPath(
  new URL("../packages/database/prisma/migrations/", import.meta.url),
);

export const KNOWN_LEGACY_MIGRATION_CHECKSUMS = Object.freeze({
  "20260724170000_stock_count_attempt_scope_lineage_guards": "6fcc3d63b6ec8b8ad3d34c8c5de3435bd1d3793cc99b03db1b570f6e835d007b",
  "20260727140000_approval_routing_backfill_orchestration": "7d3154479606ea38275834977e6f46731aec018660ceb456da1d25a86d18e946",
});

export const MIGRATION_LEDGER_RACE_LIMITATION =
  "Prisma deploy uses a separate database connection; preflight and postflight detect ledger drift but cannot make the interval atomic.";

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildMigrationManifest(migrationsDirectory = defaultMigrationsDirectory) {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const sql = readFileSync(join(migrationsDirectory, entry.name, "migration.sql"));
      return { name: entry.name, checksum: createHash("sha256").update(sql).digest("hex") };
    })
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

export function classifyMigrationLedger(manifest, snapshot, expectedIdentity) {
  const failures = [];
  const expectedByName = new Map(manifest.map((migration) => [migration.name, migration]));
  const rowsByName = new Map();
  const identity = snapshot?.identity ?? {};
  const state = snapshot?.state ?? {};

  if (!Number.isInteger(identity.serverVersionNum) || identity.serverVersionNum < 170000 || identity.serverVersionNum >= 180000) {
    failures.push({ code: "WRONG_POSTGRES_MAJOR" });
  }
  if (
    identity.databaseName !== expectedIdentity.databaseName ||
    identity.sessionUser !== expectedIdentity.sessionUser ||
    identity.currentUser !== expectedIdentity.currentUser
  ) {
    failures.push({ code: "WRONG_DATABASE_IDENTITY" });
  }
  if (identity.transactionIsolation !== "repeatable read" || identity.transactionReadOnly !== "on") {
    failures.push({ code: "UNSAFE_SNAPSHOT_MODE" });
  }
  if (typeof state.ledgerExists !== "boolean" || !Number.isInteger(state.bootstrapObjectCount)) {
    failures.push({ code: "INCOMPLETE_DATABASE_STATE" });
  } else if (!state.ledgerExists && state.bootstrapObjectCount !== 0) {
    failures.push({ code: "MISSING_LEDGER_ON_NONEMPTY_DATABASE" });
  } else if (state.ledgerExists && (snapshot?.rows ?? []).length === 0) {
    failures.push({ code: "EMPTY_EXISTING_LEDGER" });
  }

  for (const row of snapshot?.rows ?? []) {
    const rows = rowsByName.get(row.migrationName) ?? [];
    rows.push(row);
    rowsByName.set(row.migrationName, rows);
  }

  for (const [name, rows] of rowsByName) {
    if (rows.length !== 1) failures.push({ code: "DUPLICATE_MIGRATION", migrationName: name });
    if (!expectedByName.has(name)) failures.push({ code: "UNKNOWN_DATABASE_MIGRATION", migrationName: name });
  }

  for (const row of snapshot?.rows ?? []) {
    const expected = expectedByName.get(row.migrationName);
    if (expected && row.checksum !== expected.checksum) {
      failures.push({
        code:
          KNOWN_LEGACY_MIGRATION_CHECKSUMS[row.migrationName] === row.checksum
            ? "KNOWN_LEGACY_CHECKSUM"
            : "CHECKSUM_MISMATCH",
        migrationName: row.migrationName,
      });
    }
    if (!row.startedAtPresent || !row.finishedAtPresent) failures.push({ code: "UNFINISHED_MIGRATION", migrationName: row.migrationName });
    if (row.rolledBack) failures.push({ code: "ROLLED_BACK_MIGRATION", migrationName: row.migrationName });
    if (row.appliedStepsCount !== 1) failures.push({ code: "UNEXPECTED_APPLIED_STEPS", migrationName: row.migrationName });
    if (row.hasLogs) failures.push({ code: "MIGRATION_HAS_LOGS", migrationName: row.migrationName });
    if (row.invalidTimestampOrder) failures.push({ code: "INVALID_MIGRATION_TIMESTAMPS", migrationName: row.migrationName });
  }

  let missingSeen = false;
  for (const migration of manifest) {
    if (!rowsByName.has(migration.name)) missingSeen = true;
    else if (missingSeen) failures.push({ code: "NON_PREFIX_APPLIED_HISTORY", migrationName: migration.name });
  }

  const appliedCount = manifest.filter((migration) => rowsByName.has(migration.name)).length;
  const sanitizedLedgerRows = [...(snapshot?.rows ?? [])]
    .map((row) => ({
      migrationName: row.migrationName,
      checksum: row.checksum,
      startedAtPresent: row.startedAtPresent,
      finishedAtPresent: row.finishedAtPresent,
      rolledBack: row.rolledBack,
      appliedStepsCount: row.appliedStepsCount,
      hasLogs: row.hasLogs,
      invalidTimestampOrder: row.invalidTimestampOrder,
    }))
    .sort((left, right) => {
      const leftKey = `${left.migrationName}\0${left.checksum}`;
      const rightKey = `${right.migrationName}\0${right.checksum}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  return {
    result: failures.length === 0 ? "PASS" : "FAIL",
    classification: appliedCount === manifest.length ? "EXACT_CURRENT" : "CLEAN_PREFIX",
    filesystemMigrationCount: manifest.length,
    appliedMigrationCount: appliedCount,
    filesystemManifestSha256: digest(manifest),
    migrationLedgerSha256: digest(sanitizedLedgerRows),
    failures,
  };
}

export function inspectMigrationLedger(
  psql,
  contract,
  manifest,
  { requireExactCurrent = false, execute = executeLedgerSnapshot } = {},
) {
  const sql = String.raw`
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SELECT 'IDENTITY|' || json_build_object(
  'serverVersionNum', current_setting('server_version_num')::integer,
  'databaseName', current_database(),
  'sessionUser', session_user,
  'currentUser', current_user,
  'transactionIsolation', current_setting('transaction_isolation'),
  'transactionReadOnly', current_setting('transaction_read_only')
)::text;
SELECT 'STATE|' || json_build_object(
  'ledgerExists', to_regclass('public._prisma_migrations') IS NOT NULL,
  'bootstrapObjectCount',
    (SELECT count(*) FROM pg_namespace n
      WHERE n.nspname <> 'public'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND n.nspname NOT LIKE 'pg_temp_%')
    + (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname NOT IN ('_prisma_migrations', '_prisma_migrations_pkey'))
    + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname NOT IN ('_prisma_migrations', '__prisma_migrations'))
    + (SELECT count(*) FROM pg_operator o JOIN pg_namespace n ON n.oid = o.oprnamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_opclass o JOIN pg_namespace n ON n.oid = o.opcnamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_opfamily o JOIN pg_namespace n ON n.oid = o.opfnamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_conversion c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_statistic_ext s JOIN pg_namespace n ON n.oid = s.stxnamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_ts_config t JOIN pg_namespace n ON n.oid = t.cfgnamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_ts_dict t JOIN pg_namespace n ON n.oid = t.dictnamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_ts_parser t JOIN pg_namespace n ON n.oid = t.prsnamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_ts_template t JOIN pg_namespace n ON n.oid = t.tmplnamespace WHERE n.nspname = 'public')
    + (SELECT count(*) FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE n.nspname = 'public')
)::text;
SELECT (to_regclass('public._prisma_migrations') IS NOT NULL)::int AS ledger_exists \gset
\if :ledger_exists
SELECT 'LEDGER|' || COALESCE(json_agg(json_build_object(
  'migrationName', migration_name,
  'checksum', checksum,
  'startedAtPresent', started_at IS NOT NULL,
  'finishedAtPresent', finished_at IS NOT NULL,
  'rolledBack', rolled_back_at IS NOT NULL,
  'appliedStepsCount', applied_steps_count,
  'hasLogs', COALESCE(logs, '') <> '',
  'invalidTimestampOrder', finished_at IS NOT NULL AND started_at IS NOT NULL AND finished_at < started_at
) ORDER BY migration_name, started_at, id), '[]'::json)::text
FROM public._prisma_migrations;
\else
SELECT 'LEDGER|[]';
\endif
COMMIT;`;
  const result = execute(
    psql,
    contract.migration,
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", "--tuples-only", "--no-align", "--file=-"],
    sql,
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Migration ledger snapshot query failed.");

  const lines = String(result.stdout ?? "").split(/\r?\n/).map((line) => line.trim());
  const identityLine = lines.find((line) => line.startsWith("IDENTITY|"));
  const stateLine = lines.find((line) => line.startsWith("STATE|"));
  const ledgerLine = lines.find((line) => line.startsWith("LEDGER|"));
  if (!identityLine || !stateLine || !ledgerLine) throw new Error("Migration ledger snapshot returned an incomplete sanitized result.");
  let snapshot;
  try {
    snapshot = {
      identity: JSON.parse(identityLine.slice("IDENTITY|".length)),
      state: JSON.parse(stateLine.slice("STATE|".length)),
      rows: JSON.parse(ledgerLine.slice("LEDGER|".length)),
    };
  } catch {
    throw new Error("Migration ledger snapshot returned invalid sanitized JSON.");
  }

  const assessment = classifyMigrationLedger(manifest, snapshot, {
    databaseName: contract.expectedDatabaseName,
    sessionUser: contract.roles.migrator,
    currentUser: contract.roles.owner,
  });
  if (assessment.result !== "PASS") {
    const codes = [...new Set(assessment.failures.map((failure) => failure.code))].sort().join(", ");
    throw new Error(`Migration ledger validation failed: ${codes}.`);
  }
  if (requireExactCurrent && assessment.classification !== "EXACT_CURRENT") {
    throw new Error("Migration ledger postflight failed: pending filesystem migrations remain.");
  }
  return assessment;
}

function executeLedgerSnapshot(psql, connection, args, sql) {
  return spawnSync(psql, args, {
    encoding: "utf8",
    env: postgresProcessEnvironment(connection),
    input: sql,
    maxBuffer: 16 * 1024 * 1024,
  });
}
