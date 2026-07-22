import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { controlledMigrationPlan } from "./db-migrate-controlled.mjs";

function envLine(name, value) {
  return [name, value].join("=");
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "ogfi-db-role-test-"));
  const migrationFile = join(root, "migration-url");
  const runtimeFile = join(root, "runtime-url");
  const applicationEnvironmentFile = join(root, "application.env");
  writeFileSync(migrationFile, "postgresql://ogfi_prod_migrator:migration-secret@127.0.0.1:5432/ogfi_erp_production?schema=public\n");
  writeFileSync(runtimeFile, "postgresql://ogfi_prod_runtime:runtime-secret@127.0.0.1:5432/ogfi_erp_production?schema=public\n");
  writeFileSync(applicationEnvironmentFile, [
    envLine("APP_ENV", "production"),
    envLine("DATABASE_URL", "postgresql://ogfi_prod_runtime:runtime-secret@127.0.0.1:5432/ogfi_erp_production?schema=public"),
    "",
  ].join("\n"));
  chmodSync(migrationFile, 0o600);
  chmodSync(runtimeFile, 0o600);
  chmodSync(applicationEnvironmentFile, 0o640);
  return {
    root,
    env: {
      APP_ENV: "production",
      OGFI_DATABASE_NAME: "ogfi_erp_production",
      OGFI_DATABASE_OWNER_ROLE: "ogfi_prod_owner",
      OGFI_DATABASE_MIGRATOR_ROLE: "ogfi_prod_migrator",
      OGFI_DATABASE_RUNTIME_ROLE: "ogfi_prod_runtime",
      MIGRATION_DATABASE_URL_FILE: migrationFile,
      RUNTIME_DATABASE_URL_FILE: runtimeFile,
      OGFI_APPLICATION_ENV_FILE: applicationEnvironmentFile,
      OGFI_REQUIRE_ROOT_OWNED_DATABASE_CREDENTIALS: "no",
      ...overrides,
    },
  };
}

test("builds a controlled migration plan with distinct sanitized identities", () => {
  const setup = fixture();
  try {
    const plan = controlledMigrationPlan(setup.env);
    assert.equal(plan.contract.migration.username, "ogfi_prod_migrator");
    assert.equal(plan.contract.runtime.username, "ogfi_prod_runtime");
    assert.notEqual(plan.contract.migration.identityFingerprint, plan.contract.runtime.identityFingerprint);
    assert.equal(plan.contract.migration.endpointFingerprint, plan.contract.runtime.endpointFingerprint);
  } finally {
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test("rejects privileged database credentials in the application environment", () => {
  const setup = fixture();
  try {
    writeFileSync(
      setup.env.OGFI_APPLICATION_ENV_FILE,
      [
        envLine("DATABASE_URL", "postgresql://ogfi_prod_runtime:runtime-secret@127.0.0.1:5432/ogfi_erp_production?schema=public"),
        envLine("DIRECT_DATABASE_URL", "postgresql://ogfi_prod_migrator:migration-secret@127.0.0.1:5432/ogfi_erp_production?schema=public"),
        "",
      ].join("\n"),
    );
    assert.throws(() => controlledMigrationPlan(setup.env), /forbidden privileged database setting DIRECT_DATABASE_URL/);
  } finally {
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test("rejects generic secondary database URLs in the application environment", () => {
  const setup = fixture();
  try {
    writeFileSync(
      setup.env.OGFI_APPLICATION_ENV_FILE,
      [
        envLine("DATABASE_URL", "postgresql://ogfi_prod_runtime:runtime-secret@127.0.0.1:5432/ogfi_erp_production?schema=public"),
        envLine("SETUP_DATABASE_URL", "postgresql://setup:any@127.0.0.1:5432/ogfi_erp_production"),
        "",
      ].join("\n"),
    );
    assert.throws(() => controlledMigrationPlan(setup.env), /forbidden privileged database setting SETUP_DATABASE_URL/);
  } finally {
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test("rejects an unsafe database identity and non-environment role", () => {
  const setup = fixture({ OGFI_DATABASE_NAME: "ogfi_erp" });
  try {
    assert.throws(() => controlledMigrationPlan(setup.env), /positively identified as production/);
    setup.env.OGFI_DATABASE_NAME = "ogfi_erp_production";
    setup.env.OGFI_DATABASE_RUNTIME_ROLE = "shared_runtime";
    assert.throws(() => controlledMigrationPlan(setup.env), /must be ogfi_prod_runtime/);
  } finally {
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test("rejects matching migration/runtime identities and permissive credential files", () => {
  const setup = fixture();
  try {
    writeFileSync(setup.env.RUNTIME_DATABASE_URL_FILE, "postgresql://ogfi_prod_migrator:migration-secret@127.0.0.1:5432/ogfi_erp_production?schema=public\n");
    assert.throws(() => controlledMigrationPlan(setup.env), /username must match/);
    if (process.platform !== "win32") {
      chmodSync(setup.env.RUNTIME_DATABASE_URL_FILE, 0o644);
      assert.throws(() => controlledMigrationPlan(setup.env), /must not be accessible by group or other/);
    }
  } finally {
    rmSync(setup.root, { recursive: true, force: true });
  }
});

test("role SQL uses no temporary objects and includes cluster-admin adoption", () => {
  const bootstrap = new URL("../infra/hostinger/postgres/bootstrap-roles.sql", import.meta.url);
  const reconcile = new URL("../infra/hostinger/postgres/reconcile-ownership-and-grants.sql", import.meta.url);
  const verify = new URL("../infra/hostinger/postgres/verify-role-contract.sql", import.meta.url);
  const sources = [bootstrap, reconcile, verify].map((url) => String(requireText(url)));
  for (const source of sources) assert.doesNotMatch(source, /CREATE\s+TEMP/i);
  assert.match(sources[0], /ALTER DATABASE %I OWNER TO %I/);
  assert.match(sources[0], /SET role TO %L/);
  assert.match(sources[0], /SET search_path TO public, pg_catalog', migrator_role/);
  assert.match(sources[0], /SET search_path TO pg_catalog, public', runtime_role/);
  assert.match(sources[2], /Owner or runtime role membership closure is not empty/);
});

test("role SQL fails closed for adversarial ACL, membership, ownership, and routine drift", () => {
  const reconcile = requireText(new URL("../infra/hostinger/postgres/reconcile-ownership-and-grants.sql", import.meta.url));
  const verify = requireText(new URL("../infra/hostinger/postgres/verify-role-contract.sql", import.meta.url));
  const fixture = requireText(new URL("../infra/hostinger/postgres/adversarial-role-drift.sql", import.meta.url));

  assert.match(reconcile, /REVOKE ALL ON ROUTINE/);
  assert.match(reconcile, /REVOKE ALL \(%I\) ON TABLE public\.%I/);
  assert.match(reconcile, /REVOKE UPDATE, DELETE ON TABLE public\."AuthorizationDenialBucket"/);
  assert.match(reconcile, /GRANT SELECT, INSERT, DELETE ON TABLE public\."AuthenticationThrottleWindow"/);
  assert.match(reconcile, /GRANT SELECT ON TABLE public\."AuthenticationThrottleControl"/);
  assert.match(reconcile, /GRANT EXECUTE ON FUNCTION public\.lock_authentication_throttle_control\(\)/);
  assert.match(reconcile, /GRANT EXECUTE ON FUNCTION public\.operator_transition_authentication_throttle_control/);
  assert.match(reconcile, /GRANT UPDATE \("requestCount", "failureReservationCount", "successCount", "deniedCount", "lastRequestAt", "thresholdReachedAt", "updatedAt"\)/);
  assert.match(reconcile, /GRANT SELECT, DELETE ON TABLE public\."AuthLoginAttempt"/);
  assert.match(reconcile, /AuthenticationThrottleWindow" FROM %I', column_name, runtime_role/);
  assert.match(reconcile, /AuthLoginAttempt" FROM %I', column_name, runtime_role/);
  assert.match(reconcile, /GRANT UPDATE \("denialCount", "lastDeniedAt", "updatedAt", "finalizedAt", "finalAuditEventId"\)/);
  assert.match(reconcile, /REVOKE ALL ON FUNCTIONS FROM PUBLIC/);
  assert.match(verify, /SECURITY DEFINER routine/);
  assert.match(verify, /column ACL/);
  assert.match(verify, /AuthorizationDenialBucket trigger contract is incomplete/);
  assert.match(verify, /unauthorized AuthorizationDenialBucket column/);
  assert.match(verify, /AuthenticationThrottleWindow ENABLE ALWAYS trigger contract is incomplete/);
  assert.match(verify, /unauthorized AuthenticationThrottleWindow column/);
  assert.match(verify, /AuthenticationThrottleControl ENABLE ALWAYS trigger contract is incomplete/);
  assert.match(verify, /AuthenticationThrottleControl shared-lock function contract is unsafe or incomplete/);
  assert.match(verify, /Runtime can execute AuthenticationThrottleControl operator CAS function/);
  assert.match(verify, /AuthenticationThrottleControl operator CAS function semantics drifted/);
  assert.match(verify, /Approval routing child trigger semantics drifted/);
  assert.match(verify, /Approval routing child trigger function semantics drifted/);
  assert.match(verify, /t\.tgfoid = expected\.function_oid/);
  assert.match(verify, /md5\(p\.prosrc\) <> expected\.source_md5/);
  assert.match(verify, /Reviewed control function semantics drifted/);
  assert.match(verify, /Migrator membership must be exactly owner/);
  assert.match(verify, /supported public object is not owned/);
  assert.match(verify, /default privileges contain an unsafe/);
  assert.match(verify, /demo_disposable/);
  assert.match(fixture, /demo_disposable/);
  for (const driftCase of [
    "security_definer",
    "column_acl",
    "owner_membership",
    "migrator_membership",
    "runtime_membership",
    "wrong_ownership",
    "default_privilege",
    "unexpected_schema",
  ]) {
    assert.match(fixture, new RegExp(`'${driftCase}'`));
  }
});

function requireText(url) {
  return readFileSync(url, "utf8");
}
