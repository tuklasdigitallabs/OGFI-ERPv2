import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDatabaseRoleContract,
  postgresProcessEnvironment,
  sanitizedContractSummary,
} from "./database-role-contract-lib.mjs";
import { requirePostgresTool } from "./postgres-client-tools.mjs";

const protectedTables = ["AuditEvent", "ProjectActivityEvent", "InventoryMovement"];
const guardFunction = "public.reject_protected_history_mutation()";

export function runAppendOnlyContract(
  contract,
  {
    psql = requirePostgresTool("psql", "db:append-only:contract"),
    executePsql = runPsql,
  } = {},
) {
  const checks = [];
  runStaticVerifier(executePsql, psql, contract, "owner", contract.migration, checks);
  runStaticVerifier(executePsql, psql, contract, "runtime", contract.runtime, checks);

  for (const table of protectedTables) {
    expectAllowed(executePsql, psql, contract.runtime, `SELECT count(*) FROM "${table}"`, `runtime can SELECT ${table}`, checks);
    expectRejected(executePsql, psql, contract.migration, `UPDATE "${table}" SET "occurredAt" = "occurredAt" WHERE false`, [`${table} is append-only; UPDATE is prohibited`, "55000"], `owner rejects UPDATE on ${table}`, checks);
    expectRejected(executePsql, psql, contract.migration, `DELETE FROM "${table}" WHERE false`, [`${table} is append-only; DELETE is prohibited`, "55000"], `owner rejects DELETE on ${table}`, checks);
    expectRejected(executePsql, psql, contract.migration, `BEGIN; SET LOCAL lock_timeout='2s'; TRUNCATE TABLE "${table}" CASCADE; ROLLBACK`, [`${table} is append-only; TRUNCATE is prohibited`, "55000"], `owner rejects TRUNCATE on ${table}`, checks);

    expectRejected(executePsql, psql, contract.runtime, `UPDATE "${table}" SET "occurredAt" = "occurredAt" WHERE false`, "permission denied", `runtime lacks UPDATE on ${table}`, checks);
    expectRejected(executePsql, psql, contract.runtime, `DELETE FROM "${table}" WHERE false`, "permission denied", `runtime lacks DELETE on ${table}`, checks);
    expectRejected(executePsql, psql, contract.runtime, `BEGIN; SET LOCAL lock_timeout='2s'; TRUNCATE TABLE "${table}" CASCADE; ROLLBACK`, "permission denied", `runtime lacks TRUNCATE on ${table}`, checks);
  }

  expectAllowed(psql, contract.runtime, `BEGIN; WITH inserted AS (INSERT INTO "AuditEvent" ("id","tenantId","companyId","actorUserId","eventType","entityType","entityId","occurredAt","metadata") SELECT gen_random_uuid(), c."tenantId", c."id", NULL, 'append_only.hosted_contract', 'HostedContract', gen_random_uuid(), now(), jsonb_build_object('sourceDecisionId','DEC-0049') FROM "Company" c ORDER BY c."id" LIMIT 1 RETURNING 1) SELECT 1 / count(*) FROM inserted; ROLLBACK`, "runtime can INSERT AuditEvent with rollback", checks);
  expectAllowed(psql, contract.runtime, `BEGIN; WITH inserted AS (INSERT INTO "ProjectActivityEvent" ("id","tenantId","companyId","projectId","actorUserId","eventType","entityType","entityId","occurredAt","reason","metadata") SELECT gen_random_uuid(), p."tenantId", p."companyId", p."id", p."createdByUserId", 'append_only.hosted_contract', 'Project', p."id", now(), 'DEC-0049 hosted insert proof', jsonb_build_object('sourceDecisionId','DEC-0049') FROM "Project" p ORDER BY p."id" LIMIT 1 RETURNING 1) SELECT 1 / count(*) FROM inserted; ROLLBACK`, "runtime can INSERT ProjectActivityEvent with rollback", checks);
  expectAllowed(psql, contract.runtime, `BEGIN; WITH inserted AS (INSERT INTO "InventoryMovement" ("id","tenantId","companyId","inventoryLocationId","relatedInventoryLocationId","itemId","movementType","occurredAt","enteredQuantity","enteredUomId","quantityDeltaBaseUom","baseUomId","lotNumber","expiryDate","unitCost","totalCost","sourceDocumentType","sourceDocumentId","sourceDocumentLineId","sourceEventKey","reasonCode","notes","reversalOfMovementId","postedByUserId","createdAt") SELECT gen_random_uuid(), m."tenantId", m."companyId", m."inventoryLocationId", m."relatedInventoryLocationId", m."itemId", m."movementType", m."occurredAt", m."enteredQuantity", m."enteredUomId", m."quantityDeltaBaseUom", m."baseUomId", m."lotNumber", m."expiryDate", m."unitCost", m."totalCost", m."sourceDocumentType", m."sourceDocumentId", m."sourceDocumentLineId", m."sourceEventKey" || ':hosted-contract:' || gen_random_uuid(), m."reasonCode", m."notes", m."reversalOfMovementId", m."postedByUserId", now() FROM "InventoryMovement" m ORDER BY m."id" LIMIT 1 RETURNING 1) SELECT 1 / count(*) FROM inserted; ROLLBACK`, "runtime can INSERT InventoryMovement with rollback", checks);

  expectRejected(psql, contract.runtime, `SET ROLE "${contract.roles.owner}"`, "permission denied", "runtime cannot assume owner", checks);
  expectRejected(psql, contract.runtime, `SET ROLE "${contract.roles.migrator}"`, "permission denied", "runtime cannot assume migrator", checks);
  expectRejected(psql, contract.runtime, 'CREATE TABLE public."ogfi_runtime_ddl_probe" (id integer)', "permission denied", "runtime cannot create public tables", checks);
  expectRejected(psql, contract.runtime, 'CREATE TEMP TABLE "ogfi_runtime_temp_probe" (id integer)', "permission denied", "runtime cannot create temporary tables", checks);
  expectRejected(psql, contract.runtime, 'ALTER TABLE "AuditEvent" DISABLE TRIGGER "AuditEvent_append_only_guard_trg"', "must be owner", "runtime cannot disable guard", checks);
  expectRejected(psql, contract.runtime, `ALTER FUNCTION ${guardFunction} OWNER TO "${contract.roles.runtime}"`, "must be owner", "runtime cannot alter guard function", checks);
  expectRejected(psql, contract.runtime, "SET session_replication_role = replica", "permission denied", "runtime cannot suppress triggers through replication mode", checks);
  return checks;
}

function runStaticVerifier(executePsql, psql, contract, mode, connection, checks) {
  const result = executePsql(psql, connection, [
    `--file=${join(process.cwd(), "infra/hostinger/postgres/verify-role-contract.sql")}`,
    `--variable=verification_mode=${mode}`,
    `--variable=database_name=${contract.expectedDatabaseName}`,
    `--variable=owner_role=${contract.roles.owner}`,
    `--variable=migrator_role=${contract.roles.migrator}`,
    `--variable=runtime_role=${contract.roles.runtime}`,
  ]);
  if (result.status !== 0 || !result.stdout.includes("RESULT | PASS")) {
    throw new Error(`${mode} PostgreSQL role verification failed: ${sanitize(result.stderr || result.stdout)}`);
  }
  checks.push(`PASS | ${mode} effective role contract`);
}

function expectRejected(...args) {
  const [executePsql, psql, connection, sql, expected, label, checks] =
    typeof args[0] === "function" && args.length === 7
      ? args
      : [runPsql, ...args];
  const result = executePsql(psql, connection, [`--command=${sql}`]);
  const output = sanitize(`${result.stdout}\n${result.stderr}`);
  const expectedFragments = Array.isArray(expected) ? expected : [expected];
  if (result.status === 0 || expectedFragments.some((fragment) => !output.toLowerCase().includes(fragment.toLowerCase()))) {
    throw new Error(`${label} did not fail with the expected contract error: ${output}`);
  }
  checks.push(`PASS | ${label}`);
}

function expectAllowed(...args) {
  const [executePsql, psql, connection, sql, label, checks] =
    typeof args[0] === "function" && args.length === 6
      ? args
      : [runPsql, ...args];
  const result = executePsql(psql, connection, [`--command=${sql}`]);
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${sanitize(result.stderr || result.stdout)}`);
  }
  checks.push(`PASS | ${label}`);
}

function runPsql(psql, connection, extraArgs) {
  if (typeof psql === "function") return psql(connection, extraArgs);
  return spawnSync(
    psql,
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose", "--quiet", ...extraArgs],
    {
      encoding: "utf8",
      env: postgresProcessEnvironment(connection),
      maxBuffer: 1024 * 1024,
    },
  );
}

function sanitize(value) {
  return String(value ?? "")
    .replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replaceAll(/password=[^\s]+/gi, "password=[REDACTED]")
    .trim()
    .slice(0, 2000);
}

async function main() {
  const contract = loadDatabaseRoleContract();
  const checks = runAppendOnlyContract(contract);
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const outputFile = process.env.OGFI_DATABASE_CONTRACT_OUTPUT_FILE ?? join("release-evidence", "database-role-contract", `append-only-contract-${timestamp}.json`);
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${JSON.stringify({ schemaVersion: 1, generatedAtUtc: new Date().toISOString(), ...sanitizedContractSummary(contract), checks, result: "PASS" }, null, 2)}\n`);
  console.log(checks.join("\n"));
  console.log(`RESULT | PASS | Hosted append-only role contract verified. Evidence: ${outputFile}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`Hosted append-only role contract: FAIL | ${sanitize(error instanceof Error ? error.message : error)}`);
    process.exit(1);
  });
}
