import assert from "node:assert/strict";
import test from "node:test";
import { runAppendOnlyContract } from "./db-append-only-contract.mjs";

test("verifies owner guards, runtime least privilege, inserts, and escalation negatives", () => {
  const checks = runAppendOnlyContract(contract(), { psql: fakePsql });
  assert.ok(checks.length >= 30);
  assert.ok(checks.includes("PASS | runtime cannot suppress triggers through replication mode"));
  assert.ok(checks.includes("PASS | runtime cannot assume migrator"));
  assert.ok(checks.includes("PASS | runtime cannot create public tables"));
  assert.ok(checks.includes("PASS | runtime cannot create temporary tables"));
  assert.ok(checks.includes("PASS | runtime can INSERT InventoryMovement with rollback"));
  assert.ok(checks.includes("PASS | owner rejects UPDATE on PettyCashApprovalStepIntent"));
  assert.ok(checks.includes("PASS | runtime lacks TRUNCATE on PettyCashApprovalStepIntent"));
  assert.ok(checks.includes("PASS | runtime can insert first denial evidence and bucket then increment allowed columns with rollback"));
  assert.ok(checks.includes("PASS | runtime lacks table-wide UPDATE on AuthorizationDenialBucket"));
  assert.ok(checks.includes("PASS | runtime cannot finalize an open denial bucket before its window ends"));
  assert.ok(checks.includes("PASS | runtime cannot disable denial bucket guard"));
  assert.ok(checks.includes("PASS | runtime exact throttle reservation and success release are allowed with rollback"));
  assert.ok(checks.includes("PASS | runtime cannot update throttle identity columns"));
  assert.ok(checks.includes("PASS | runtime cannot update throttle limits"));
  assert.ok(checks.includes("PASS | runtime cannot delete an active throttle window"));
  assert.ok(checks.includes("PASS | runtime can delete an expired throttle window with rollback"));
  assert.ok(checks.includes("PASS | runtime cannot truncate throttle windows"));
  assert.ok(checks.includes("PASS | runtime cannot disable throttle guards"));
  assert.ok(checks.includes("PASS | web runtime has zero table and column privileges on ApprovalRoutingBackfillRun"));
  assert.ok(checks.includes("PASS | web runtime has zero table and column privileges on ApprovalRoutingBackfillBatch"));
  assert.ok(checks.includes("PASS | web runtime has zero table and column privileges on ApprovalRoutingBackfillBlockerObservation"));
  assert.ok(checks.includes("PASS | web runtime cannot SELECT ApprovalRoutingBackfillRun"));
  assert.ok(checks.includes("PASS | web runtime cannot INSERT ApprovalRoutingBackfillRun"));
  assert.ok(checks.includes("PASS | web runtime cannot SELECT ApprovalRoutingBackfillBatch"));
  assert.ok(checks.includes("PASS | web runtime cannot INSERT ApprovalRoutingBackfillBatch"));
  assert.ok(checks.includes("PASS | web runtime cannot SELECT ApprovalRoutingBackfillBlockerObservation"));
  assert.ok(checks.includes("PASS | web runtime cannot INSERT ApprovalRoutingBackfillBlockerObservation"));
  assert.ok(checks.includes("PASS | runtime lacks TRUNCATE on ApprovalRoutingBackfillRun"));
  assert.ok(checks.includes("PASS | owner rejects TRUNCATE on ApprovalRoutingBackfillBatch"));
  assert.ok(checks.includes("PASS | owner rejects TRUNCATE on ApprovalRoutingBackfillBlockerObservation"));
  assert.ok(checks.includes("PASS | runtime cannot disable approval backfill run guard"));
  assert.ok(checks.includes("PASS | runtime cannot disable approval backfill evidence guards"));
  assert.ok(checks.includes("PASS | runtime cannot disable approval backfill blocker guards"));
  assert.ok(checks.includes("PASS | runtime cannot alter approval backfill run function"));
});

function fakePsql(connection, args) {
  if (args.some((value) => value.includes("verify-role-contract.sql"))) {
    return { status: 0, stdout: "RESULT | PASS | PostgreSQL effective role contract verified.\n", stderr: "" };
  }
  const sql = args.find((value) => value.startsWith("--command="))?.slice("--command=".length) ?? "";
  if (/AuthorizationDenialBucket/.test(sql) && /"finalizedAt"/.test(sql)) {
    return { status: 1, stdout: "", stderr: "ERROR:  55000: AuthorizationDenialBucket update is not an exact increment or one-way finalization" };
  }
  if (/AuthenticationThrottleWindow/.test(sql) && /DELETE FROM/.test(sql) && /repeat\('b'/.test(sql)) {
    return { status: 1, stdout: "", stderr: "ERROR:  55000: AUTH_THROTTLE_RETENTION_ACTIVE" };
  }
  if (/AuthenticationThrottleWindow/.test(sql) && /repeat\('c'/.test(sql)) {
    return { status: 0, stdout: "", stderr: "" };
  }
  if (/AuthenticationThrottleWindow/.test(sql) && /"requestCount"/.test(sql)) {
    return { status: 0, stdout: "", stderr: "" };
  }
  if (/^SELECT count\(\*\) FROM "ApprovalRoutingBackfill/.test(sql)) {
    return { status: 1, stdout: "", stderr: "ERROR: permission denied" };
  }
  if (/SELECT count|WITH inserted|has_table_privilege/.test(sql)) return { status: 0, stdout: "", stderr: "" };
  if (connection.username === "ogfi_prod_migrator") {
    const table = sql.match(/"(AuditEvent|ProjectActivityEvent|InventoryMovement|PettyCashApprovalStepIntent|ApprovalRoutingBackfillBatch|ApprovalRoutingBackfillBlockerObservation)"/)?.[1];
    const operation = /^UPDATE/.test(sql) ? "UPDATE" : /^DELETE/.test(sql) ? "DELETE" : "TRUNCATE";
    const message = table === "PettyCashApprovalStepIntent"
      ? "PETTY_CASH_APPROVAL_INTENT_APPEND_ONLY"
      : `${table} is append-only; ${operation} is prohibited`;
    return { status: 1, stdout: "", stderr: `ERROR:  55000: ${message}` };
  }
  const stderr = /ALTER TABLE|ALTER FUNCTION/.test(sql)
    ? "ERROR: must be owner of protected object"
    : "ERROR: permission denied";
  return { status: 1, stdout: "", stderr };
}

function contract() {
  const base = {
    host: "127.0.0.1",
    port: "5432",
    databaseName: "ogfi_erp_production",
    schema: "public",
    password: "not-logged",
  };
  return {
    appEnvironment: "production",
    expectedDatabaseName: "ogfi_erp_production",
    roles: { owner: "ogfi_prod_owner", migrator: "ogfi_prod_migrator", runtime: "ogfi_prod_runtime" },
    migration: { ...base, username: "ogfi_prod_migrator" },
    runtime: { ...base, username: "ogfi_prod_runtime" },
  };
}
