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
});

function fakePsql(connection, args) {
  if (args.some((value) => value.includes("verify-role-contract.sql"))) {
    return { status: 0, stdout: "RESULT | PASS | PostgreSQL effective role contract verified.\n", stderr: "" };
  }
  const sql = args.find((value) => value.startsWith("--command="))?.slice("--command=".length) ?? "";
  if (/SELECT count|WITH inserted/.test(sql)) return { status: 0, stdout: "", stderr: "" };
  if (connection.username === "ogfi_prod_migrator") {
    const table = sql.match(/"(AuditEvent|ProjectActivityEvent|InventoryMovement)"/)?.[1];
    const operation = /^UPDATE/.test(sql) ? "UPDATE" : /^DELETE/.test(sql) ? "DELETE" : "TRUNCATE";
    return { status: 1, stdout: "", stderr: `ERROR:  55000: ${table} is append-only; ${operation} is prohibited` };
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
