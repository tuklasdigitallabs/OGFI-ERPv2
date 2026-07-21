import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertMarkerRow,
  assertAdversarialRoleBinding,
  assertSafeAdminUrl,
  assertSafeDisposableTarget,
  buildPsqlEnvironment,
  buildRuntimeEnvironment,
  buildSeedRepeatabilityEnvironment,
  createDisposablePostgresIdentity,
  shouldRunAdversarialRoleContract,
  shouldRunSeedRepeatability,
  targetDatabaseUrl,
} from "./disposable-postgres-lifecycle.mjs";

describe("disposable PostgreSQL lifecycle safety", () => {
  it("binds a generated database and runtime role to run ID and nonce", () => {
    const nonce = "a".repeat(64);
    const identity = createDisposablePostgresIdentity("run-12345", nonce);
    assert.equal(identity.databaseName, "ogfi_test_run_12345_aaaaaaaaaaaaaaaa");
    assert.match(identity.ownerRole, /^ogfi_test_run_12345_[a-f0-9]{32}_owner$/);
    assert.match(identity.migratorRole, /^ogfi_test_run_12345_[a-f0-9]{32}_migrator$/);
    assert.match(identity.runtimeRole, /^ogfi_test_run_12345_[a-f0-9]{32}_runtime$/);
    assert.match(identity.adversarialRole, /^ogfi_adv_run_1234_[a-f0-9]{32}$/);
    assert.ok(identity.ownerRole.length <= 63);
    assert.ok(identity.migratorRole.length <= 63);
    assert.ok(identity.runtimeRole.length <= 63);
    assert.ok(identity.adversarialRole.length <= 63);
    assert.equal(identity.nonceSha256.length, 64);
    assertMarkerRow(
      {
        databaseName: identity.databaseName,
        runId: identity.runId,
        nonceSha256: identity.nonceSha256,
      },
      identity,
    );
  });

  it("uses at least 128 bits of role identity entropy without collisions", () => {
    const sharedPrefix = "a".repeat(16);
    const first = createDisposablePostgresIdentity(
      "maximum-length-run-token-for-roles",
      `${sharedPrefix}${"b".repeat(48)}`,
    );
    const second = createDisposablePostgresIdentity(
      "maximum-length-run-token-for-roles",
      `${sharedPrefix}${"c".repeat(48)}`,
    );
    assert.notEqual(first.ownerRole, second.ownerRole);
    assert.notEqual(first.migratorRole, second.migratorRole);
    assert.notEqual(first.runtimeRole, second.runtimeRole);
    assert.notEqual(first.adversarialRole, second.adversarialRole);
    for (const role of [
      first.ownerRole,
      first.migratorRole,
      first.runtimeRole,
      second.ownerRole,
      second.migratorRole,
      second.runtimeRole,
    ]) {
      assert.ok(role.length <= 63, role);
      assert.match(role, /_[a-f0-9]{32}_(?:owner|migrator|runtime)$/);
    }
    for (const role of [first.adversarialRole, second.adversarialRole]) {
      assert.ok(role.length <= 63, role);
      assert.match(role, /^ogfi_adv_[a-z0-9_]{1,8}_[a-f0-9]{32}$/);
    }
  });

  it("rejects cross-run controlled and adversarial role variables", () => {
    const first = createDisposablePostgresIdentity("cross-run-one", "1".repeat(64));
    const second = createDisposablePostgresIdentity("cross-run-two", "2".repeat(64));
    assert.equal(assertAdversarialRoleBinding(first), true);
    for (const override of [
      { ownerRole: second.ownerRole },
      { migratorRole: second.migratorRole },
      { runtimeRole: second.runtimeRole },
      { adversarialRole: second.adversarialRole },
    ]) {
      assert.throws(
        () => assertAdversarialRoleBinding({ ...first, ...override }),
        { message: "DISPOSABLE_ADVERSARIAL_ROLE_CROSS_RUN" },
      );
    }
    const fixture = readFileSync(
      fileURLToPath(new URL("../infra/hostinger/postgres/adversarial-role-drift.sql", import.meta.url)),
      "utf8",
    );
    assert.match(fixture, /migrator_role <> regexp_replace\(owner_role/);
    assert.match(fixture, /runtime_role <> regexp_replace\(owner_role/);
    assert.match(fixture, /adversarial_identity\[2\] <> controlled_identity\[2\]/);
    assert.match(fixture, /left\(controlled_identity\[2\], 16\) <> database_identity\[2\]/);
  });

  it("requires an explicit admin URL", () => {
    assert.throws(() => assertSafeAdminUrl(undefined), {
      message: "DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED",
    });
    assert.throws(() => assertSafeAdminUrl("not-a-url-with-admin-secret"), {
      message: "DISPOSABLE_DATABASE_ADMIN_URL_INVALID",
    });
  });

  it("gives the child only the runtime database credential", () => {
    const identity = createDisposablePostgresIdentity("run-12345", "d".repeat(64));
    const adminUrl = "postgresql://postgres:admin@127.0.0.1:5432/ogfi_ci";
    const runtimeUrl = targetDatabaseUrl(adminUrl, identity.databaseName, {
      username: identity.runtimeRole,
      password: "runtime-secret",
    });
    const child = buildRuntimeEnvironment(
      {
        PATH: "/bin",
        DATABASE_URL: adminUrl,
        DIRECT_DATABASE_URL: adminUrl,
        DISPOSABLE_DATABASE_ADMIN_URL: adminUrl,
        MIGRATOR_DATABASE_URL: "postgresql://migrator:secret@localhost/db",
        POSTGRES_ADMIN_PASSWORD: "admin-secret",
        RUNTIME_DATABASE_URL_FILE: "/run/secrets/runtime_database_url",
        MIGRATOR_POSTGRES_URL_FILE: "/run/secrets/migrator_postgres_url",
        MIGRATOR_PASSWORD: "migrator-secret",
        OWNER_SECRET_FILE: "/run/secrets/owner",
        PGUSER: "postgres",
        PGPASSWORD: "admin-secret",
        OGFI_DISPOSABLE_DATABASE_NONCE: identity.nonce,
        OGFI_DISPOSABLE_DATABASE_CONFIRMATION: `DROP_RECREATE:${identity.databaseName}`,
        DISPOSABLE_DATABASE_NONCE: identity.nonce,
        DISPOSABLE_DATABASE_CONFIRMATION: `DROP_RECREATE:${identity.databaseName}`,
        MIGRATOR_DSN: "postgresql://migrator:secret@localhost/db",
        ALTERNATE_DATABASE_URL: "postgresql://owner:secret@localhost/db",
        DATABASE_PASSWORD: "database-secret",
        POSTGRES_USER: "postgres",
      },
      runtimeUrl,
      identity,
      adminUrl,
    );
    assert.equal(child.DATABASE_URL, runtimeUrl);
    assert.equal(child.PATH, "/bin");
    for (const key of [
      "DIRECT_DATABASE_URL",
      "DISPOSABLE_DATABASE_ADMIN_URL",
      "MIGRATOR_DATABASE_URL",
      "POSTGRES_ADMIN_PASSWORD",
      "RUNTIME_DATABASE_URL_FILE",
      "MIGRATOR_POSTGRES_URL_FILE",
      "MIGRATOR_PASSWORD",
      "OWNER_SECRET_FILE",
      "PGUSER",
      "PGPASSWORD",
      "OGFI_DISPOSABLE_DATABASE_NONCE",
      "OGFI_DISPOSABLE_DATABASE_CONFIRMATION",
      "DISPOSABLE_DATABASE_NONCE",
      "DISPOSABLE_DATABASE_CONFIRMATION",
      "MIGRATOR_DSN",
      "ALTERNATE_DATABASE_URL",
      "DATABASE_PASSWORD",
      "POSTGRES_USER",
    ]) {
      assert.equal(child[key], undefined, `${key} is absent`);
    }
  });

  it("passes psql credentials only through a scrubbed PG environment", () => {
    const connectionUrl =
      "postgresql://migrator:se%3Acret@127.0.0.1:5544/ogfi_test_run?sslmode=require";
    const psql = buildPsqlEnvironment(
      {
        PATH: "/bin",
        DATABASE_URL: "postgresql://leaked:secret@localhost/other",
        DISPOSABLE_DATABASE_ADMIN_URL: "postgresql://admin:secret@localhost/postgres",
        PGUSER: "leaked",
        PGPASSWORD: "leaked",
        POSTGRES_PASSWORD: "leaked",
      },
      connectionUrl,
    );
    assert.equal(psql.PATH, "/bin");
    assert.equal(psql.PGHOST, "127.0.0.1");
    assert.equal(psql.PGPORT, "5544");
    assert.equal(psql.PGDATABASE, "ogfi_test_run");
    assert.equal(psql.PGUSER, "migrator");
    assert.equal(psql.PGPASSWORD, "se:cret");
    assert.equal(psql.PGSSLMODE, "require");
    assert.equal(psql.DATABASE_URL, undefined);
    assert.equal(psql.DISPOSABLE_DATABASE_ADMIN_URL, undefined);
    assert.equal(psql.POSTGRES_PASSWORD, undefined);
    assert.equal(Object.values(psql).includes(connectionUrl), false);
  });

  it("runs seed repeatability only inside the aggregate authorization lifecycle", () => {
    const identity = createDisposablePostgresIdentity("run-12345", "e".repeat(64));
    const adminUrl = "postgresql://postgres:admin@127.0.0.1:5432/postgres";
    const runtimeUrl = targetDatabaseUrl(adminUrl, identity.databaseName, {
      username: identity.runtimeRole,
      password: "runtime-secret",
    });
    const env = buildSeedRepeatabilityEnvironment(
      { DISPOSABLE_DATABASE_ADMIN_URL: adminUrl },
      runtimeUrl,
      identity,
      adminUrl,
    );
    assert.equal(shouldRunSeedRepeatability("authorization-all"), true);
    assert.equal(shouldRunSeedRepeatability("access-control"), false);
    assert.equal(env.OGFI_RUN_SEED_REPEATABILITY_TEST, "true");
    assert.equal(env.DATABASE_URL, runtimeUrl);
    assert.equal(env.DISPOSABLE_DATABASE_ADMIN_URL, undefined);

    const runner = readFileSync(
      fileURLToPath(new URL("./run-disposable-postgres-tests.mjs", import.meta.url)),
      "utf8",
    );
    assert.match(runner, /shouldRunSeedRepeatability\(suiteName\)/);
    assert.match(runner, /seed-repeatability\.integration\.test\.ts/);
  });

  it("runs all per-run adversarial role cases only in authorization-all", () => {
    assert.equal(shouldRunAdversarialRoleContract("authorization-all"), true);
    for (const suite of ["access-control", "authorization-finance", "e2e", "authorization_all"]) {
      assert.equal(shouldRunAdversarialRoleContract(suite), false, suite);
    }

    const runner = readFileSync(
      fileURLToPath(new URL("./run-disposable-postgres-tests.mjs", import.meta.url)),
      "utf8",
    );
    const fixture = readFileSync(
      fileURLToPath(new URL("../infra/hostinger/postgres/adversarial-role-drift.sql", import.meta.url)),
      "utf8",
    );
    assert.match(runner, /shouldRunAdversarialRoleContract\(suiteName\)/);
    assert.match(runner, /ADVERSARIAL_ROLE_CONTRACT_PASS/);
    assert.match(runner, /adversarial_role: marker\.adversarialRole/);
    assert.match(runner, /applyAdversarialFixture\(adminTargetUrl, marker, "cleanup", driftCase\)/);
    assert.match(runner, /DROP ROLE IF EXISTS[\s\S]*marker\.adversarialRole/);
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
      assert.match(runner, new RegExp(`\\[?"${driftCase}"`));
    }
    assert.match(fixture, /:'adversarial_role'/);
    assert.match(fixture, /\^ogfi_adv_/);
    assert.match(fixture, /adversarial_identity\[2\] <> controlled_identity\[2\]/);
    assert.match(fixture, /requires PostgreSQL 17/);
    assert.doesNotMatch(fixture, /ogfi_contract_adversarial_role/);
  });

  it("exposes marker attestation only through a constrained security-definer function", () => {
    const runner = readFileSync(
      fileURLToPath(new URL("./run-disposable-postgres-tests.mjs", import.meta.url)),
      "utf8",
    );
    assert.match(runner, /SECURITY DEFINER/);
    assert.match(runner, /SECURITY DEFINER\s+STABLE/);
    assert.match(runner, /SET search_path = pg_catalog/);
    assert.match(
      runner,
      /GRANT EXECUTE ON FUNCTION ogfi_disposable_control\.verify_database_identity\(\)/,
    );
    assert.match(
      runner,
      /REVOKE ALL\s+ON ogfi_disposable_control\.database_identity\s+FROM/,
    );
    assert.match(
      runner,
      /SELECT \* FROM ogfi_disposable_control\.database_identity/,
    );
    assert.match(runner, /verifyRuntimeMarkerBoundary\(runtimeUrl, identity\)/);
  });

  it("rejects production, staging, shared, remote, fixed, and overlapping targets", () => {
    for (const url of [
      "postgresql://postgres:x@127.0.0.1/ogfi_production",
      "postgresql://postgres:x@127.0.0.1/ogfi_staging",
      "postgresql://postgres:x@127.0.0.1/ogfi_shared",
      "postgresql://postgres:x@db.example.test/ogfi_ci",
    ]) {
      assert.throws(() => assertSafeAdminUrl(url));
    }
    const adminUrl = "postgresql://postgres:x@127.0.0.1:5432/ogfi_ci";
    assert.throws(() =>
      assertSafeDisposableTarget({
        adminUrl,
        databaseName: "ogfi_test_fixed",
        runtimeUrl: "postgresql://postgres:x@127.0.0.1:5432/ogfi_test_fixed",
        runtimeRole: "postgres",
      }),
    );
  });

  it("rejects host, role, database, and marker mismatches", () => {
    const identity = createDisposablePostgresIdentity("run-12345", "b".repeat(64));
    const adminUrl = "postgresql://postgres:x@127.0.0.1:5432/ogfi_ci";
    const runtimeUrl = targetDatabaseUrl(adminUrl, identity.databaseName, {
      username: identity.runtimeRole,
      password: "runtime-secret",
    });
    assert.equal(
      assertSafeDisposableTarget({
        adminUrl,
        databaseName: identity.databaseName,
        runtimeUrl,
        runtimeRole: identity.runtimeRole,
      }),
      true,
    );
    assert.throws(() =>
      assertSafeDisposableTarget({
        adminUrl,
        databaseName: identity.databaseName,
        runtimeUrl: runtimeUrl.replace("127.0.0.1", "localhost"),
        runtimeRole: identity.runtimeRole,
      }),
    );
    assert.throws(() =>
      assertMarkerRow(
        {
          databaseName: identity.databaseName,
          runId: identity.runId,
          nonceSha256: "c".repeat(64),
        },
        identity,
      ),
    );
  });
});
