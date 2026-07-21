import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  assertDisposableDatabaseMarker,
  assertDisposableDemoDatabase,
  assertDisposableDemoRoleContract,
  assertDisposableTestDatabaseMarker,
  buildDatabaseUrlChildEnvironment,
  identifyDisposableTestDatabase,
} from "./disposable-demo-database";

const seedSource = readFileSync(
  fileURLToPath(new URL("./seed.ts", import.meta.url)),
  "utf8",
);
const resetSource = readFileSync(
  fileURLToPath(new URL("./reset-demo-data.ts", import.meta.url)),
  "utf8",
);
const repeatabilitySource = readFileSync(
  fileURLToPath(new URL("./seed-repeatability.integration.test.ts", import.meta.url)),
  "utf8",
);

describe("DEC-0049 append-only seed lifecycle", () => {
  test("ordinary seed never updates, upserts, or deletes protected history", () => {
    for (const model of [
      "auditEvent",
      "projectActivityEvent",
      "inventoryMovement",
    ]) {
      expect(seedSource).not.toMatch(
        new RegExp(
          `(?:prisma|tx)\\.${model}\\.(?:delete|deleteMany|update|updateMany|upsert)\\s*\\(`,
        ),
      );
    }

    expect(seedSource).toContain("tx.inventoryMovement.findMany");
    expect(seedSource).toContain("tx.inventoryMovement.create");
    expect(seedSource).toContain("assertSingleCanonicalSeedInventoryMovement");
    expect(seedSource).toContain("assertSeedInventoryBalanceMatchesLedger");
    expect(seedSource).toContain("isPrismaUniqueConflict");
    expect(seedSource).toContain("await prisma.$transaction(verifyExisting)");
    expect(seedSource).toContain("qtyOnHand: { increment: quantity }");
    expect(seedSource).toContain("qtyOnHand: { decrement: line.quantity }");
    expect(seedSource).not.toContain("DEMO_RESET_DATA");
  });

  test("demo reset rebuilds only after a positive disposable identity check", () => {
    expect(resetSource).toContain("assertDisposableDemoDatabase(process.env)");
    expect(resetSource).toContain(
      "verifyDisposableDatabaseMarker(process.env, identity)",
    );
    expect(resetSource).toContain('"migrate", "reset"');
    expect(resetSource).toContain("roleContract.migratorDatabaseUrl");
    expect(resetSource).toContain("reconcile-ownership-and-grants.sql");
    expect(resetSource).toContain('verifyRoleContract(roleContract.runtimeDatabaseUrl, "runtime")');
    expect(resetSource).toContain("buildDatabaseUrlChildEnvironment");
    expect(resetSource).not.toContain("DATABASE_URL: adminDatabaseUrl");
    expect(resetSource).not.toContain("delete seedEnvironment");
    expect(resetSource).not.toMatch(/\.(?:delete|deleteMany|updateMany)\s*\(/);
    expect(resetSource).not.toContain('import("./seed")');
  });

  test("demo reset requires distinct owner, migrator, runtime, and admin identities", () => {
    const env = {
      DATABASE_URL:
        "postgresql://demo_runtime:runtime-secret@localhost:5432/ogfi_demo_disposable_example1",
      DEMO_RESET_ADMIN_DATABASE_URL:
        "postgresql://postgres:admin-secret@localhost:5432/ogfi_demo_disposable_example1",
      DEMO_RESET_MIGRATOR_DATABASE_URL:
        "postgresql://demo_migrator:migrator-secret@localhost:5432/ogfi_demo_disposable_example1",
      DEMO_RESET_OWNER_ROLE: "demo_owner",
      OGFI_DISPOSABLE_DATABASE_CONFIRMATION:
        "DROP_RECREATE:ogfi_demo_disposable_example1",
    };
    const identity = assertDisposableDemoDatabase(env);
    expect(assertDisposableDemoRoleContract(env, identity)).toEqual({
      databaseName: identity.databaseName,
      migratorDatabaseUrl: env.DEMO_RESET_MIGRATOR_DATABASE_URL,
      migratorRole: "demo_migrator",
      ownerRole: "demo_owner",
      runtimeDatabaseUrl: env.DATABASE_URL,
      runtimeRole: "demo_runtime",
    });
    expect(() =>
      assertDisposableDemoRoleContract(
        { ...env, DEMO_RESET_OWNER_ROLE: "demo_runtime" },
        identity,
      ),
    ).toThrow("DEMO_RESET_ROLE_CONTRACT_IDENTITIES_MUST_BE_DISTINCT");
    expect(() =>
      assertDisposableDemoRoleContract(
        {
          ...env,
          DEMO_RESET_MIGRATOR_DATABASE_URL:
            "postgresql://demo_migrator:migrator-secret@localhost:5432/ogfi_demo_disposable_other123",
        },
        identity,
      ),
    ).toThrow("DEMO_RESET_ROLE_CONTRACT_TARGET_MISMATCH");
  });

  test("runtime seed child receives no privileged or secondary database credentials", () => {
    const runtimeUrl =
      "postgresql://demo_runtime:runtime-secret@localhost:5432/ogfi_demo_disposable_example1";
    const child = buildDatabaseUrlChildEnvironment(
      {
        PATH: "/bin",
        DATABASE_URL: runtimeUrl,
        DIRECT_DATABASE_URL: "postgresql://owner:secret@localhost/db",
        DEMO_RESET_ADMIN_DATABASE_URL:
          "postgresql://postgres:secret@localhost/db",
        DEMO_RESET_MIGRATOR_DATABASE_URL:
          "postgresql://migrator:secret@localhost/db",
        SECONDARY_DATABASE_URL:
          "postgresql://secondary:secret@localhost/db",
        OWNER_DSN: "postgresql://owner:secret@localhost/db",
        PGUSER: "postgres",
        PGPASSWORD: "secret",
        OGFI_DISPOSABLE_DATABASE_NONCE: "raw-nonce",
        OGFI_DISPOSABLE_DATABASE_CONFIRMATION: "DROP_RECREATE:db",
      },
      runtimeUrl,
    );
    expect(child).toMatchObject({ PATH: "/bin", DATABASE_URL: runtimeUrl });
    for (const key of [
      "DIRECT_DATABASE_URL",
      "DEMO_RESET_ADMIN_DATABASE_URL",
      "DEMO_RESET_MIGRATOR_DATABASE_URL",
      "SECONDARY_DATABASE_URL",
      "OWNER_DSN",
      "PGUSER",
      "PGPASSWORD",
      "OGFI_DISPOSABLE_DATABASE_NONCE",
      "OGFI_DISPOSABLE_DATABASE_CONFIRMATION",
    ]) {
      expect(child[key]).toBeUndefined();
    }
  });

  test("repeatability captures the seeded baseline before either repeat", () => {
    const baseline = repeatabilitySource.indexOf(
      "const seededBaseline = await protectedSnapshot()",
    );
    const firstRepeat = repeatabilitySource.indexOf("runSeed()", baseline);
    const firstComparison = repeatabilitySource.indexOf(
      "expect(afterFirstRepeat).toBe(seededBaseline)",
      firstRepeat,
    );
    const secondRepeat = repeatabilitySource.indexOf(
      "runSeed()",
      firstComparison,
    );
    const secondComparison = repeatabilitySource.indexOf(
      "expect(afterSecondRepeat).toBe(seededBaseline)",
      secondRepeat,
    );
    expect(baseline).toBeGreaterThan(-1);
    expect(firstRepeat).toBeGreaterThan(baseline);
    expect(firstComparison).toBeGreaterThan(firstRepeat);
    expect(secondRepeat).toBeGreaterThan(firstComparison);
    expect(secondComparison).toBeGreaterThan(secondRepeat);
  });

  test("unsafe or ambiguous reset targets are rejected", () => {
    expect(() =>
      assertDisposableDemoDatabase({
        NODE_ENV: "production",
        DATABASE_URL:
          "postgresql://runtime@localhost:5432/ogfi_demo_disposable_example1",
        DEMO_RESET_ADMIN_DATABASE_URL:
          "postgresql://admin@localhost:5432/ogfi_demo_disposable_example1",
        OGFI_DISPOSABLE_DATABASE_CONFIRMATION:
          "DROP_RECREATE:ogfi_demo_disposable_example1",
      }),
    ).toThrow("DEMO_RESET_REFUSES_PRODUCTION_ENVIRONMENT");

    expect(() =>
      assertDisposableDemoDatabase({
        DATABASE_URL: "postgresql://runtime@localhost:5432/ogfi_dev",
        DEMO_RESET_ADMIN_DATABASE_URL:
          "postgresql://admin@localhost:5432/ogfi_dev",
        OGFI_DISPOSABLE_DATABASE_CONFIRMATION: "DROP_RECREATE:ogfi_dev",
      }),
    ).toThrow("DEMO_RESET_RUNTIME_DATABASE_NAME_NOT_DISPOSABLE");

    expect(() =>
      assertDisposableDemoDatabase({
        DATABASE_URL:
          "postgresql://runtime@db.internal:5432/ogfi_demo_disposable_example1",
        DEMO_RESET_ADMIN_DATABASE_URL:
          "postgresql://admin@db.internal:5432/ogfi_demo_disposable_example1",
        OGFI_DISPOSABLE_DATABASE_CONFIRMATION:
          "DROP_RECREATE:ogfi_demo_disposable_example1",
      }),
    ).toThrow("DEMO_RESET_RUNTIME_HOST_MUST_BE_LOOPBACK");

    expect(() =>
      assertDisposableDemoDatabase({
        DATABASE_URL:
          "postgresql://runtime@localhost:5432/ogfi_demo_disposable_example1",
        DEMO_RESET_ADMIN_DATABASE_URL:
          "postgresql://admin@localhost:5432/ogfi_demo_disposable_other123",
        OGFI_DISPOSABLE_DATABASE_CONFIRMATION:
          "DROP_RECREATE:ogfi_demo_disposable_example1",
      }),
    ).toThrow("DEMO_RESET_ADMIN_RUNTIME_TARGET_MISMATCH");

    expect(() =>
      assertDisposableDemoDatabase({
        DATABASE_URL:
          "postgresql://runtime@localhost:5432/ogfi_demo_disposable_example1",
        DEMO_RESET_ADMIN_DATABASE_URL:
          "postgresql://admin@localhost:5432/ogfi_demo_disposable_example1",
      }),
    ).toThrow("DEMO_RESET_EXACT_CONFIRMATION_REQUIRED");

    expect(() =>
      assertDisposableDemoDatabase({
        DATABASE_URL:
          "postgresql://same_role@localhost:5432/ogfi_demo_disposable_example1",
        DEMO_RESET_ADMIN_DATABASE_URL:
          "postgresql://same_role@localhost:5432/ogfi_demo_disposable_example1",
        OGFI_DISPOSABLE_DATABASE_CONFIRMATION:
          "DROP_RECREATE:ogfi_demo_disposable_example1",
      }),
    ).toThrow("DEMO_RESET_ADMIN_IDENTITY_MUST_BE_DISTINCT");
  });

  test("an exact loopback disposable target and confirmation are accepted", () => {
    expect(
      assertDisposableDemoDatabase({
        NODE_ENV: "development",
        DATABASE_URL:
          "postgresql://runtime@127.0.0.1:5432/ogfi_demo_disposable_example1?schema=public",
        DEMO_RESET_ADMIN_DATABASE_URL:
          "postgresql://admin@127.0.0.1:5432/ogfi_demo_disposable_example1?schema=public",
        OGFI_DISPOSABLE_DATABASE_CONFIRMATION:
          "DROP_RECREATE:ogfi_demo_disposable_example1",
      }),
    ).toEqual({
      databaseName: "ogfi_demo_disposable_example1",
      host: "127.0.0.1",
      port: "5432",
      schema: "public",
      username: "runtime",
    });
  });

  test("missing, malformed, or mismatched database markers are rejected", () => {
    const identity = assertDisposableDemoDatabase({
      DATABASE_URL:
        "postgresql://runtime@localhost:5432/ogfi_demo_disposable_example1",
      DEMO_RESET_ADMIN_DATABASE_URL:
        "postgresql://admin@localhost:5432/ogfi_demo_disposable_example1",
      OGFI_DISPOSABLE_DATABASE_CONFIRMATION:
        "DROP_RECREATE:ogfi_demo_disposable_example1",
    });
    const env = {
      OGFI_DISPOSABLE_DATABASE_RUN_ID: "spf006-run-0001",
      OGFI_DISPOSABLE_DATABASE_NONCE:
        "0123456789abcdef0123456789abcdef0123456789abcdef",
    };
    const nonceHash = createHash("sha256")
      .update(env.OGFI_DISPOSABLE_DATABASE_NONCE)
      .digest("hex");

    expect(() => assertDisposableDatabaseMarker(env, identity, [])).toThrow(
      "DEMO_RESET_DATABASE_MARKER_MISSING_OR_AMBIGUOUS",
    );
    expect(() =>
      assertDisposableDatabaseMarker(env, identity, [
        {
          database_name: identity.databaseName,
          run_id: env.OGFI_DISPOSABLE_DATABASE_RUN_ID,
          nonce_sha256: "not-a-sha256-hash",
        },
      ]),
    ).toThrow("DEMO_RESET_DATABASE_MARKER_NONCE_MISMATCH");
    expect(() =>
      assertDisposableDatabaseMarker(env, identity, [
        {
          database_name: "ogfi_demo_disposable_different1",
          run_id: env.OGFI_DISPOSABLE_DATABASE_RUN_ID,
          nonce_sha256: nonceHash,
        },
      ]),
    ).toThrow("DEMO_RESET_DATABASE_MARKER_NAME_MISMATCH");
    expect(() =>
      assertDisposableDatabaseMarker(env, identity, [
        {
          database_name: identity.databaseName,
          run_id: "spf006-run-different",
          nonce_sha256: nonceHash,
        },
      ]),
    ).toThrow("DEMO_RESET_DATABASE_MARKER_RUN_ID_MISMATCH");
    expect(() =>
      assertDisposableDatabaseMarker(env, identity, [
        {
          database_name: identity.databaseName,
          run_id: env.OGFI_DISPOSABLE_DATABASE_RUN_ID,
          nonce_sha256: "0".repeat(64),
        },
      ]),
    ).toThrow("DEMO_RESET_DATABASE_MARKER_NONCE_MISMATCH");

    expect(() =>
      assertDisposableDatabaseMarker(env, identity, [
        {
          database_name: identity.databaseName,
          run_id: env.OGFI_DISPOSABLE_DATABASE_RUN_ID,
          nonce_sha256: nonceHash,
        },
      ]),
    ).not.toThrow();
  });

  test("repeatability tests require the exact lifecycle name and marker metadata", () => {
    const identity = identifyDisposableTestDatabase(
      "postgresql://runtime@localhost:5432/ogfi_test_seedrun_0123456789abcdef",
    );
    const env = {
      OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME: identity.databaseName,
      OGFI_DISPOSABLE_DATABASE_RUN_ID: "spf006-seed-run1",
      OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: "a".repeat(64),
    };
    const marker = {
      database_name: identity.databaseName,
      run_id: env.OGFI_DISPOSABLE_DATABASE_RUN_ID,
      nonce_sha256: env.OGFI_DISPOSABLE_DATABASE_NONCE_SHA256,
    };

    expect(() =>
      identifyDisposableTestDatabase(
        "postgresql://runtime@localhost:5432/ogfi_test_shared_0123456789abcdef",
      ),
    ).toThrow("DEMO_RESET_TEST_DATABASE_NAME_FORBIDDEN");
    expect(() =>
      identifyDisposableTestDatabase(
        "postgresql://runtime@localhost:5432/ogfi_test_seedrun_unbounded_suffix",
      ),
    ).toThrow("DEMO_RESET_TEST_DATABASE_NAME_NOT_DISPOSABLE");
    expect(() =>
      assertDisposableTestDatabaseMarker(env, identity, [
        { ...marker, nonce_sha256: "b".repeat(64) },
      ]),
    ).toThrow("SEED_TEST_DATABASE_MARKER_NONCE_HASH_MISMATCH");
    expect(() =>
      assertDisposableTestDatabaseMarker(env, identity, [marker]),
    ).not.toThrow();
  });
});
