import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAppendOnlyContract } from "./db-append-only-contract.mjs";
import {
  loadDatabaseRoleContract,
  postgresProcessEnvironment,
  sanitizedContractSummary,
} from "./database-role-contract-lib.mjs";
import { requirePostgresTool } from "./postgres-client-tools.mjs";

export function controlledMigrationPlan(env = process.env) {
  const contract = loadDatabaseRoleContract(env);
  return {
    contract,
    migrationScript: "pnpm db:migrate:deploy",
    reconciliationSql: "infra/hostinger/postgres/reconcile-ownership-and-grants.sql",
  };
}

export function runControlledMigration(plan, { psql = requirePostgresTool("psql", "db:migrate:controlled"), runMigration = defaultMigrationRunner } = {}) {
  assertMigratorSession(psql, plan.contract);
  runMigration(plan.contract.migration.url);
  reconcile(psql, plan.contract, plan.reconciliationSql);
  const checks = runAppendOnlyContract(plan.contract, { psql });
  return checks;
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
    `--file=${join(process.cwd(), sqlFile)}`,
    `--variable=database_name=${contract.expectedDatabaseName}`,
    `--variable=owner_role=${contract.roles.owner}`,
    `--variable=migrator_role=${contract.roles.migrator}`,
    `--variable=runtime_role=${contract.roles.runtime}`,
  ]);
  if (result.status !== 0 || !result.stdout.includes("RESULT | PASS")) {
    throw new Error(`Ownership/grant reconciliation failed: ${sanitize(result.stderr || result.stdout)}`);
  }
}

function defaultMigrationRunner(migrationUrl) {
  const childEnvironment = { ...process.env, DATABASE_URL: migrationUrl };
  for (const name of Object.keys(childEnvironment)) {
    if (
      name === "DIRECT_DATABASE_URL" ||
      name === "RUNTIME_DATABASE_URL_FILE" ||
      name === "MIGRATION_DATABASE_URL_FILE" ||
      /(?:ADMIN|OWNER|MIGRAT)/i.test(name) ||
      /^PG(?:PASSWORD|USER|HOST|PORT|DATABASE|SERVICE|OPTIONS)$/i.test(name)
    ) {
      delete childEnvironment[name];
    }
  }
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["db:migrate:deploy"], {
    env: childEnvironment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma migration deployment failed with status ${result.status ?? "unknown"}.`);
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

async function main() {
  const plan = controlledMigrationPlan();
  const checks = runControlledMigration(plan);
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const outputFile = process.env.OGFI_CONTROLLED_MIGRATION_OUTPUT_FILE ?? join("release-evidence", "database-role-contract", `controlled-migration-${timestamp}.json`);
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${JSON.stringify({ schemaVersion: 1, generatedAtUtc: new Date().toISOString(), ...sanitizedContractSummary(plan.contract), migrationMode: "prisma-deploy-controlled", checks, result: "PASS" }, null, 2)}\n`);
  console.log(`RESULT | PASS | Controlled migration and role reconciliation completed. Evidence: ${outputFile}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`Controlled database migration: FAIL | ${sanitize(error instanceof Error ? error.message : error)}`);
    process.exit(1);
  });
}
