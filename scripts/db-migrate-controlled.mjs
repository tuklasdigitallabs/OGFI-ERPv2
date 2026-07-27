import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadMigrationDatabaseRoleContract,
  postgresProcessEnvironment,
} from "./database-role-contract-lib.mjs";
import { requirePostgresTool } from "./postgres-client-tools.mjs";
import {
  buildMigrationManifest,
  inspectMigrationLedger,
  MIGRATION_LEDGER_RACE_LIMITATION,
} from "./db-migration-ledger-preflight.mjs";

export function controlledMigrationPlan(env = process.env) {
  const contract = loadMigrationDatabaseRoleContract(env);
  return {
    contract,
    migrationScript: "pnpm db:migrate:deploy",
    reconciliationSql: fileURLToPath(new URL("../infra/hostinger/postgres/reconcile-ownership-and-grants.sql", import.meta.url)),
    migrationManifest: buildMigrationManifest(),
  };
}

export function runControlledMigration(plan, {
  psql,
  runMigration,
  inspectLedger = inspectMigrationLedger,
  assertSession = assertMigratorSession,
  assertRoleGraph = assertPredeployRoleGraph,
  reconcileRoles = reconcile,
} = {}) {
  if (typeof runMigration !== "function") {
    throw new Error("Controlled migration requires a trusted release-orchestrator migration runner.");
  }
  const psqlExecutable = psql ?? requirePostgresTool("psql", "db:migrate:controlled");
  assertSession(psqlExecutable, plan.contract);
  assertRoleGraph(psqlExecutable, plan.contract);
  const preflight = inspectLedger(psqlExecutable, plan.contract, plan.migrationManifest);
  runMigration(plan.contract.migration.url);
  reconcileRoles(psqlExecutable, plan.contract, plan.reconciliationSql);
  const postflight = inspectLedger(psqlExecutable, plan.contract, plan.migrationManifest, { requireExactCurrent: true });
  return { preflight, postflight, raceLimitation: MIGRATION_LEDGER_RACE_LIMITATION };
}

export function assertPredeployRoleGraph(psql, contract, execute = runPsql) {
  const { owner, migrator, runtime } = contract.roles;
  const sql = `SET search_path = pg_catalog;
  WITH controlled AS (
    SELECT
      (SELECT oid FROM pg_roles WHERE rolname = '${owner}') AS owner_oid,
      (SELECT oid FROM pg_roles WHERE rolname = '${migrator}') AS migrator_oid,
      (SELECT oid FROM pg_roles WHERE rolname = '${runtime}') AS runtime_oid
  )
  SELECT CASE WHEN
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${owner}' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${migrator}' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls)
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${runtime}' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls)
    AND (SELECT count(*) FROM pg_auth_members m, controlled c
         WHERE m.roleid IN (c.owner_oid, c.migrator_oid, c.runtime_oid)
            OR m.member IN (c.owner_oid, c.migrator_oid, c.runtime_oid)) = 1
    AND EXISTS (SELECT 1 FROM pg_auth_members m, controlled c
                WHERE m.roleid = c.owner_oid AND m.member = c.migrator_oid
                  AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)
    AND pg_has_role('${migrator}', '${owner}', 'MEMBER')
    AND pg_has_role('${migrator}', '${owner}', 'SET')
    AND NOT pg_has_role('${migrator}', '${owner}', 'USAGE')
    AND NOT pg_has_role('${owner}', '${migrator}', 'MEMBER')
    AND NOT pg_has_role('${owner}', '${runtime}', 'MEMBER')
    AND NOT pg_has_role('${runtime}', '${owner}', 'MEMBER')
    AND NOT pg_has_role('${runtime}', '${migrator}', 'MEMBER')
    AND NOT pg_has_role('${migrator}', '${runtime}', 'MEMBER')
    THEN 'RESULT | PASS' ELSE 'RESULT | FAIL' END`;
  const result = execute(psql, contract.migration, [`--command=${sql}`]);
  if (result.status !== 0 || !result.stdout.includes("RESULT | PASS")) {
    throw new Error("Controlled role graph preflight failed before migration deployment.");
  }
}

function assertMigratorSession(psql, contract) {
  const sql = `SELECT CASE WHEN session_user = '${contract.roles.migrator}' AND current_user = '${contract.roles.owner}' THEN 'RESULT | PASS' ELSE current_setting('role') END`;
  const result = runPsql(psql, contract.migration, [`--command=${sql}`]);
  if (result.status !== 0 || !result.stdout.includes("RESULT | PASS")) {
    throw new Error("Controlled migrator session does not assume the non-login owner role.");
  }
}

function reconcile(psql, contract, sqlFile) {
  const result = runPsql(psql, contract.migration, [
    `--file=${sqlFile}`,
    `--variable=database_name=${contract.expectedDatabaseName}`,
    `--variable=owner_role=${contract.roles.owner}`,
    `--variable=migrator_role=${contract.roles.migrator}`,
    `--variable=runtime_role=${contract.roles.runtime}`,
  ]);
  if (result.status !== 0 || !result.stdout.includes("RESULT | PASS")) {
    throw new Error(`Ownership/grant reconciliation failed: ${sanitize(result.stderr || result.stdout)}`);
  }
}

export function controlledMigrationChildEnvironment(migrationUrl, environment = process.env) {
  const advisoryLockSetting = environment.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK;
  if (
    advisoryLockSetting !== undefined
    && !["", "0", "false", "no"].includes(String(advisoryLockSetting).trim().toLowerCase())
  ) {
    throw new Error("Prisma migration advisory locking cannot be disabled for a controlled migration.");
  }
  const childEnvironment = { DATABASE_URL: migrationUrl };
  const allowedNames = new Set(["CI", "LANG", "LC_ALL", "TZ"]);
  for (const name of allowedNames) {
    const value = environment[name];
    if (value !== undefined) {
      childEnvironment[name] = value;
    }
  }
  return childEnvironment;
}

function runPsql(psql, connection, extraArgs) {
  return spawnSync(psql, ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", ...extraArgs], {
    encoding: "utf8",
    env: postgresProcessEnvironment(connection),
    maxBuffer: 1024 * 1024,
  });
}

function sanitize(value) {
  return String(value ?? "").replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]").trim().slice(0, 2000);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.error(
    "Controlled database migration: UNAVAILABLE | DEC-0248 requires invocation inside the root-owned release service; direct execution is disabled.",
  );
  process.exitCode = 78;
}
