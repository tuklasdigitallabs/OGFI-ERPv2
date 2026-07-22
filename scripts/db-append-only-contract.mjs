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
const denialBucketGuardFunction = "public.enforce_authorization_denial_bucket_update()";
const throttleGuardFunction = "public.enforce_authentication_throttle_window_transition()";

const activeThrottleWindowProbeInsert = `INSERT INTO "AuthenticationThrottleWindow" (
  "attemptType", "dimensionType", "bucketKey", "keyVersion", "shardNumber",
  "windowStartedAt", "windowEndsAt", "limitCount", "requestCount",
  "failureReservationCount", "successCount", "deniedCount", "firstRequestAt",
  "lastRequestAt", "thresholdReachedAt", "retainUntil", "createdAt", "updatedAt"
) VALUES (
  'PASSWORD', 'GLOBAL', repeat('b', 64), 999999, NULL,
  date_trunc('minute', transaction_timestamp()),
  date_trunc('minute', transaction_timestamp()) + interval '15 minutes',
  10, 1, 1, 0, 0, transaction_timestamp(), transaction_timestamp(), NULL,
  date_trunc('minute', transaction_timestamp()) + interval '1 day 15 minutes',
  transaction_timestamp(), transaction_timestamp()
)`;

const denialBucketProbeInsert = `WITH inserted AS (
  SELECT gen_random_uuid() AS bucket_id, transaction_timestamp() AS denied_at
), first_event AS (
  INSERT INTO "AuditEvent" (
    "id", "tenantId", "companyId", "actorUserId", "eventType", "entityType",
    "entityId", "occurredAt", "metadata"
  )
  SELECT gen_random_uuid(), t."id", NULL, NULL, 'authorization.denial.first',
         'AuthorizationDenialBucket', inserted.bucket_id, inserted.denied_at,
         jsonb_build_object(
           'sourceDecisionId', 'DEC-0050', 'count', '1',
           'subjectType', 'SYSTEM', 'action', 'READ',
           'reason', 'POLICY_DENIED', 'resource', 'ADMINISTRATION',
           'locationId', NULL,
           'windowStartedAt', inserted.denied_at,
           'windowEndsAt', inserted.denied_at + interval '15 minutes',
           'contractProbe', true
         )
    FROM "Tenant" t CROSS JOIN inserted
   ORDER BY t."id" LIMIT 1
  RETURNING "id", "tenantId", "entityId", "occurredAt"
)
INSERT INTO "AuthorizationDenialBucket" (
  "id", "tenantId", "companyId", "locationId", "actorUserId", "subjectType",
  "action", "reason", "resource", "bucketKey", "windowStartedAt", "windowEndsAt",
  "denialCount", "firstDeniedAt", "lastDeniedAt", "firstAuditEventId", "createdAt", "updatedAt"
)
SELECT "entityId", "tenantId", NULL, NULL, NULL, 'SYSTEM', 'READ',
       'POLICY_DENIED', 'ADMINISTRATION', repeat('a', 64), "occurredAt",
       "occurredAt" + interval '15 minutes', 1, "occurredAt", "occurredAt",
       "id", "occurredAt", "occurredAt"
  FROM first_event`;

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
  expectAllowed(
    psql,
    contract.runtime,
    `BEGIN; ${denialBucketProbeInsert};
     SELECT 1 / count(*)
       FROM "AuthorizationDenialBucket"
      WHERE "bucketKey" = repeat('a', 64)
        AND "firstDeniedAt" = transaction_timestamp();
     UPDATE "AuthorizationDenialBucket"
        SET "denialCount" = "denialCount" + 1,
            "lastDeniedAt" = transaction_timestamp(),
            "updatedAt" = transaction_timestamp()
      WHERE "bucketKey" = repeat('a', 64)
        AND "firstDeniedAt" = transaction_timestamp();
     SELECT 1 / count(*)
       FROM "AuthorizationDenialBucket"
      WHERE "bucketKey" = repeat('a', 64)
        AND "firstDeniedAt" = transaction_timestamp()
        AND "denialCount" = 2;
     ROLLBACK`,
    "runtime can insert first denial evidence and bucket then increment allowed columns with rollback",
    checks
  );
  expectAllowed(
    psql,
    contract.runtime,
    `SELECT 1 / CASE WHEN has_table_privilege(current_user, 'public."AuthorizationDenialBucket"', 'UPDATE') THEN 0 ELSE 1 END`,
    "runtime lacks table-wide UPDATE on AuthorizationDenialBucket",
    checks
  );
  expectRejected(psql, contract.runtime, 'DELETE FROM "AuthorizationDenialBucket" WHERE false', "permission denied", "runtime lacks DELETE on AuthorizationDenialBucket", checks);
  expectRejected(psql, contract.runtime, 'UPDATE "AuthorizationDenialBucket" SET "resource" = "resource" WHERE false', "permission denied", "runtime cannot update AuthorizationDenialBucket identity columns", checks);
  expectRejected(
    psql,
    contract.runtime,
    `BEGIN; ${denialBucketProbeInsert};
     UPDATE "AuthorizationDenialBucket"
        SET "finalizedAt" = transaction_timestamp(),
            "updatedAt" = transaction_timestamp()
      WHERE "bucketKey" = repeat('a', 64)
        AND "firstDeniedAt" = transaction_timestamp();
     ROLLBACK`,
    ["one-way finalization", "55000"],
    "runtime cannot finalize an open denial bucket before its window ends",
    checks
  );

  expectAllowed(
    psql,
    contract.runtime,
    `BEGIN; ${activeThrottleWindowProbeInsert};
     UPDATE "AuthenticationThrottleWindow"
        SET "requestCount" = "requestCount" + 1,
            "failureReservationCount" = "failureReservationCount" + 1,
            "lastRequestAt" = transaction_timestamp(),
            "updatedAt" = transaction_timestamp()
      WHERE "bucketKey" = repeat('b', 64) AND "keyVersion" = 999999
        AND "windowStartedAt" = date_trunc('minute', transaction_timestamp());
     UPDATE "AuthenticationThrottleWindow"
        SET "failureReservationCount" = "failureReservationCount" - 1,
            "successCount" = "successCount" + 1,
            "updatedAt" = transaction_timestamp()
      WHERE "bucketKey" = repeat('b', 64) AND "keyVersion" = 999999
        AND "windowStartedAt" = date_trunc('minute', transaction_timestamp());
     ROLLBACK`,
    "runtime exact throttle reservation and success release are allowed with rollback",
    checks
  );
  expectRejected(psql, contract.runtime, 'UPDATE "AuthenticationThrottleWindow" SET "bucketKey" = "bucketKey" WHERE false', "permission denied", "runtime cannot update throttle identity columns", checks);
  expectRejected(psql, contract.runtime, 'UPDATE "AuthenticationThrottleWindow" SET "limitCount" = "limitCount" WHERE false', "permission denied", "runtime cannot update throttle limits", checks);
  expectRejected(
    psql,
    contract.runtime,
    `BEGIN; ${activeThrottleWindowProbeInsert};
     DELETE FROM "AuthenticationThrottleWindow"
      WHERE "bucketKey" = repeat('b', 64) AND "keyVersion" = 999999
        AND "windowStartedAt" = date_trunc('minute', transaction_timestamp());
     ROLLBACK`,
    ["AUTH_THROTTLE_RETENTION_ACTIVE", "55000"],
    "runtime cannot delete an active throttle window",
    checks
  );
  expectAllowed(
    psql,
    contract.runtime,
    `BEGIN;
     INSERT INTO "AuthenticationThrottleWindow" (
       "attemptType", "dimensionType", "bucketKey", "keyVersion", "shardNumber",
       "windowStartedAt", "windowEndsAt", "limitCount", "requestCount",
       "failureReservationCount", "successCount", "deniedCount", "firstRequestAt",
       "lastRequestAt", "thresholdReachedAt", "retainUntil", "createdAt", "updatedAt"
     ) VALUES (
       'PASSWORD', 'GLOBAL', repeat('c', 64), 999998, NULL,
       date_trunc('minute', transaction_timestamp()) - interval '3 days',
       date_trunc('minute', transaction_timestamp()) - interval '3 days' + interval '15 minutes',
       10, 1, 1, 0, 0,
       date_trunc('minute', transaction_timestamp()) - interval '3 days',
       date_trunc('minute', transaction_timestamp()) - interval '3 days', NULL,
       date_trunc('minute', transaction_timestamp()) - interval '2 days' + interval '15 minutes',
       date_trunc('minute', transaction_timestamp()) - interval '3 days',
       date_trunc('minute', transaction_timestamp()) - interval '3 days'
     );
     DELETE FROM "AuthenticationThrottleWindow"
      WHERE "bucketKey" = repeat('c', 64) AND "keyVersion" = 999998
        AND "windowStartedAt" = date_trunc('minute', transaction_timestamp()) - interval '3 days';
     ROLLBACK`,
    "runtime can delete an expired throttle window with rollback",
    checks
  );
  expectRejected(psql, contract.runtime, 'BEGIN; TRUNCATE TABLE "AuthenticationThrottleWindow"; ROLLBACK', "permission denied", "runtime cannot truncate throttle windows", checks);
  expectRejected(psql, contract.runtime, 'ALTER TABLE "AuthenticationThrottleWindow" DISABLE TRIGGER "AuthenticationThrottleWindow_transition_trg"', "must be owner", "runtime cannot disable throttle guards", checks);

  expectRejected(psql, contract.runtime, `SET ROLE "${contract.roles.owner}"`, "permission denied", "runtime cannot assume owner", checks);
  expectRejected(psql, contract.runtime, `SET ROLE "${contract.roles.migrator}"`, "permission denied", "runtime cannot assume migrator", checks);
  expectRejected(psql, contract.runtime, 'CREATE TABLE public."ogfi_runtime_ddl_probe" (id integer)', "permission denied", "runtime cannot create public tables", checks);
  expectRejected(psql, contract.runtime, 'CREATE TEMP TABLE "ogfi_runtime_temp_probe" (id integer)', "permission denied", "runtime cannot create temporary tables", checks);
  expectRejected(psql, contract.runtime, 'ALTER TABLE "AuditEvent" DISABLE TRIGGER "AuditEvent_append_only_guard_trg"', "must be owner", "runtime cannot disable guard", checks);
  expectRejected(psql, contract.runtime, 'ALTER TABLE "AuthorizationDenialBucket" DISABLE TRIGGER "AuthorizationDenialBucket_10_update_integrity_trg"', "must be owner", "runtime cannot disable denial bucket guard", checks);
  expectRejected(psql, contract.runtime, `ALTER FUNCTION ${guardFunction} OWNER TO "${contract.roles.runtime}"`, "must be owner", "runtime cannot alter guard function", checks);
  expectRejected(psql, contract.runtime, `ALTER FUNCTION ${denialBucketGuardFunction} OWNER TO "${contract.roles.runtime}"`, "must be owner", "runtime cannot alter denial bucket guard function", checks);
  expectRejected(psql, contract.runtime, `ALTER FUNCTION ${throttleGuardFunction} OWNER TO "${contract.roles.runtime}"`, "must be owner", "runtime cannot alter throttle guard function", checks);
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
