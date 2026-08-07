import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertPrivateDatabaseStopSignal,
  assertSecureRegularFile,
  createPrivateDatabaseExchange,
  initializePrivateDatabaseState,
  privateDatabaseExchangePath,
  readPrivateDatabaseJson,
  transitionPrivateDatabaseState,
  writePrivateDatabaseStopSignal,
} from "./production-auth-e2e-private-db-exchange.mjs";
import {
  assertPrivateDatabaseHandoffIntact,
  holdPrivateDatabaseHandoff,
  publishPrivateDatabaseHandoff,
} from "./production-auth-e2e-private-db-handoff.mjs";
import {
  startPrivateDatabaseLifecycle,
  stopPrivateDatabaseLifecycle,
  verifyPrivateDatabaseTeardownReceipt,
} from "./production-auth-e2e-private-db-lifecycle.mjs";

// The lifecycle executes only in the dedicated Linux container. Windows does
// not expose POSIX ownership/mode semantics, so security tests are skipped
// there rather than weakening the production 0700/0600 contract.
const posixLifecycleTest = process.platform === "win32" ? test.skip : test;

function secureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "ogfi-private-db-"));
  chmodSync(root, 0o700);
  return root;
}

function identityEnvironment(exchangeDirectory) {
  const runId = "ci-private-db-123456";
  const nonceSha256 = "b".repeat(64);
  return {
    CI: "true",
    AUTHORIZATION_TEST_DATABASE: "ogfi_test_ci_private_db_aaaaaaaaaaaaaaaa",
    AUTHORIZATION_TEST_DATABASE_HOST: "127.0.0.1",
    AUTHORIZATION_TEST_DATABASE_NONCE_SHA256: nonceSha256,
    AUTHORIZATION_TEST_DATABASE_PORT: "5432",
    AUTHORIZATION_TEST_RUN_ID: runId,
    AUTHORIZATION_TEST_RUNTIME_ROLE: `ogfi_${"a".repeat(32)}_runtime`,
    AUTH_DATABASE_INTEGRATION: "yes",
    AUTHORIZATION_DATABASE_INTEGRATION: "yes",
    DATABASE_URL: `postgresql://ogfi_${"a".repeat(32)}_runtime:runtime-secret@127.0.0.1:5432/ogfi_test_ci_private_db_aaaaaaaaaaaaaaaa`,
    DIRECT_DATABASE_URL: "",
    OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME:
      "ogfi_test_ci_private_db_aaaaaaaaaaaaaaaa",
    OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: nonceSha256,
    OGFI_DISPOSABLE_DATABASE_RUN_ID: runId,
    OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET: "/tmp/ogfi-bootstrap.sock",
    OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN:
      "fixture-token-that-is-long-enough-123456",
    OGFI_PRODUCTION_AUTH_E2E_CANDIDATE_COMMIT: "c".repeat(40),
    OGFI_PRODUCTION_AUTH_E2E_DATABASE_ALIAS: "ogfi-production-auth-database",
    OGFI_PRODUCTION_AUTH_E2E_DATABASE_CONTAINER_ID: "d".repeat(64),
    OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_DIRECTORY: exchangeDirectory,
    OGFI_PRODUCTION_AUTH_E2E_DATABASE_IMAGE: `sha256:${"e".repeat(64)}`,
    OGFI_PRODUCTION_AUTH_E2E_DATABASE_NETWORK_ID: "f".repeat(64),
    OGFI_PRODUCTION_AUTH_E2E_DATABASE_NETWORK_NAME: "ogfi-private-db-network",
    OGFI_PRODUCTION_AUTH_E2E_DATABASE_STOP_TOKEN:
      "private-database-stop-token-that-is-long-enough",
    OGFI_PRODUCTION_AUTH_E2E_LIFECYCLE_IMAGE: `sha256:${"1".repeat(64)}`,
    OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE: `sha256:${"2".repeat(64)}`,
  };
}

function fakeFixtureProvision(_environment, fixtureFile) {
  const brokerFile = privateDatabaseExchangePath(
    _environment.OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_DIRECTORY,
    "fixture",
  );
  const brokerKeys = readFileSync(brokerFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => line.split("=")[0]);
  assert.deepEqual(brokerKeys, [
    "OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET",
    "OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN",
  ]);
  writeFileSync(
    fixtureFile,
    `${JSON.stringify({ tenantCode: "ogfi", privileged: { password: "fixture-secret" } })}\n`,
    { mode: 0o600, flag: "wx" },
  );
}

posixLifecycleTest("publishes an atomic runtime-only HOLDING handoff", () => {
  const exchange = createPrivateDatabaseExchange(
    secureRoot(),
    "ci-private-db-123456",
  );
  initializePrivateDatabaseState(
    exchange,
    "ci-private-db-123456",
    new Date("2026-08-06T00:00:00.000Z"),
  );
  const environment = identityEnvironment(exchange);
  const handoff = publishPrivateDatabaseHandoff(
    environment,
    new Date("2026-08-06T00:00:00.000Z"),
    fakeFixtureProvision,
  );
  const state = readPrivateDatabaseJson(
    privateDatabaseExchangePath(exchange, "state"),
  );
  const manifest = readPrivateDatabaseJson(
    privateDatabaseExchangePath(exchange, "manifest"),
  );
  assert.equal(state.state, "HOLDING");
  assert.equal(state.previousState, "READY");
  assert.equal(manifest.database.networkName, "ogfi-private-db-network");
  assert.equal(manifest.database.networkId, "f".repeat(64));
  assert.equal(
    manifest.database.runtimeRole,
    environment.AUTHORIZATION_TEST_RUNTIME_ROLE,
  );
  assert.equal(
    manifest.candidate.image,
    environment.OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE,
  );
  assert.equal(
    manifest.lifecycle.image,
    environment.OGFI_PRODUCTION_AUTH_E2E_LIFECYCLE_IMAGE,
  );
  const runtime = readFileSync(
    privateDatabaseExchangePath(exchange, "runtime"),
    "utf8",
  );
  assert.match(runtime, new RegExp("DATABASE_URL" + "=postgresql://ogfi_"));
  assert.match(runtime, /@ogfi-production-auth-database:5432\//);
  assert.match(runtime, new RegExp("DIRECT_DATABASE_URL" + "=\\n"));
  assert.doesNotMatch(runtime, /admin|migrat|owner/i);
  assert.equal(
    existsSync(privateDatabaseExchangePath(exchange, "fixture")),
    false,
  );
  const browserFixture = readFileSync(
    privateDatabaseExchangePath(exchange, "browserFixture"),
    "utf8",
  );
  assert.match(browserFixture, /fixture-secret/);
  assert.doesNotMatch(browserFixture, /BOOTSTRAP_SOCKET|BOOTSTRAP_TOKEN/);
  const retained = ["state", "manifest", "runtime", "browserFixture"]
    .map((name) =>
      readFileSync(privateDatabaseExchangePath(exchange, name), "utf8"),
    )
    .join("\n");
  assert.doesNotMatch(
    retained,
    /disposable_admin|admin-secret|_migrator|_owner|fixture-token-that-is-long-enough/,
  );
  for (const name of ["state", "manifest", "runtime", "browserFixture"]) {
    assert.equal(
      assertSecureRegularFile(privateDatabaseExchangePath(exchange, name)),
      true,
    );
  }
  assert.equal(handoff.runId, "ci-private-db-123456");
});

posixLifecycleTest(
  "requires an authenticated run-bound stop signal before teardown",
  () => {
    const exchange = createPrivateDatabaseExchange(
      secureRoot(),
      "ci-private-db-123456",
    );
    initializePrivateDatabaseState(
      exchange,
      "ci-private-db-123456",
      new Date(),
    );
    const environment = identityEnvironment(exchange);
    const handoff = publishPrivateDatabaseHandoff(
      environment,
      new Date(),
      fakeFixtureProvision,
    );
    assert.equal(
      assertPrivateDatabaseStopSignal(exchange, handoff.manifest, new Date()),
      false,
    );
    writePrivateDatabaseStopSignal(
      exchange,
      handoff.runId,
      handoff.manifest.nonceSha256,
      environment.OGFI_PRODUCTION_AUTH_E2E_DATABASE_STOP_TOKEN,
      new Date(),
    );
    holdPrivateDatabaseHandoff(handoff, {
      now: () => new Date(),
      waitFor: () => assert.fail("valid stop must not wait"),
    });
    assert.equal(
      readPrivateDatabaseJson(privateDatabaseExchangePath(exchange, "state"))
        .state,
      "TEARING_DOWN",
    );
  },
);

posixLifecycleTest("rejects a tampered stop signal", () => {
  const exchange = createPrivateDatabaseExchange(
    secureRoot(),
    "ci-private-db-123456",
  );
  initializePrivateDatabaseState(exchange, "ci-private-db-123456", new Date());
  const environment = identityEnvironment(exchange);
  const handoff = publishPrivateDatabaseHandoff(
    environment,
    new Date(),
    fakeFixtureProvision,
  );
  writePrivateDatabaseStopSignal(
    exchange,
    handoff.runId,
    "9".repeat(64),
    environment.OGFI_PRODUCTION_AUTH_E2E_DATABASE_STOP_TOKEN,
    new Date(),
  );
  assert.throws(
    () =>
      assertPrivateDatabaseStopSignal(exchange, handoff.manifest, new Date()),
    /PRODUCTION_AUTH_E2E_PRIVATE_DB_STOP_SIGNAL_INVALID/,
  );
});

posixLifecycleTest(
  "rejects preexisting, symlinked, and permissive exchange material",
  () => {
    const root = secureRoot();
    const preexisting = path.join(root, "run-ci-private-db-123456");
    mkdirSync(preexisting, { mode: 0o700 });
    assert.throws(
      () => createPrivateDatabaseExchange(root, "ci-private-db-123456"),
      /PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_PREEXISTING/,
    );
    const target = path.join(root, "target");
    writeFileSync(target, "secret", { mode: 0o600 });
    const link = path.join(root, "link");
    symlinkSync(target, link);
    assert.throws(
      () => assertSecureRegularFile(link),
      /PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_UNSAFE/,
    );
    const permissive = path.join(root, "permissive");
    writeFileSync(permissive, "secret", { mode: 0o644 });
    assert.throws(
      () => assertSecureRegularFile(permissive),
      /PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_PERMISSIVE/,
    );
    const hardlinkSource = path.join(root, "hardlink-source");
    const hardlink = path.join(root, "hardlink");
    writeFileSync(hardlinkSource, "secret", { mode: 0o600 });
    linkSync(hardlinkSource, hardlink);
    assert.throws(
      () => assertSecureRegularFile(hardlink),
      /PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_HARDLINKED/,
    );
  },
);

posixLifecycleTest("detects a manifest changed after HOLDING", () => {
  const exchange = createPrivateDatabaseExchange(
    secureRoot(),
    "ci-private-db-123456",
  );
  initializePrivateDatabaseState(exchange, "ci-private-db-123456", new Date());
  const handoff = publishPrivateDatabaseHandoff(
    identityEnvironment(exchange),
    new Date(),
    fakeFixtureProvision,
  );
  writeFileSync(
    privateDatabaseExchangePath(exchange, "manifest"),
    `${JSON.stringify({ tampered: true })}\n`,
    { mode: 0o600 },
  );
  assert.throws(
    () => assertPrivateDatabaseHandoffIntact(handoff),
    /PRODUCTION_AUTH_E2E_PRIVATE_DB_HANDOFF_TAMPERED/,
  );
});

posixLifecycleTest("rejects skipped or repeated state transitions", () => {
  const exchange = createPrivateDatabaseExchange(
    secureRoot(),
    "ci-private-db-123456",
  );
  initializePrivateDatabaseState(exchange, "ci-private-db-123456", new Date());
  assert.throws(
    () =>
      transitionPrivateDatabaseState(
        exchange,
        "ci-private-db-123456",
        "HOLDING",
        new Date(),
      ),
    /PRODUCTION_AUTH_E2E_PRIVATE_DB_STATE_TRANSITION_INVALID/,
  );
});

posixLifecycleTest(
  "records teardown only after the disposable runner returns successfully",
  () => {
    const root = secureRoot();
    const adminFile = path.join(root, "admin-url");
    writeFileSync(
      adminFile,
      "postgresql://disposable_admin:admin-secret@127.0.0.1:5432/postgres\n",
      { mode: 0o600 },
    );
    const result = startPrivateDatabaseLifecycle(
      {
        CI: "true",
        AUTHORIZATION_TEST_RUN_ID: "ci-private-db-123456",
        OGFI_PRODUCTION_AUTH_E2E_DATABASE_ADMIN_URL_FILE: adminFile,
        OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_ROOT: root,
      },
      (_command, _args, options) => {
        const exchange =
          options.env.OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_DIRECTORY;
        assert.equal(
          options.env.DISPOSABLE_DATABASE_ADMIN_URL.includes("admin-secret"),
          true,
        );
        transitionPrivateDatabaseState(
          exchange,
          "ci-private-db-123456",
          "READY",
          new Date(),
        );
        transitionPrivateDatabaseState(
          exchange,
          "ci-private-db-123456",
          "HOLDING",
          new Date(),
        );
        transitionPrivateDatabaseState(
          exchange,
          "ci-private-db-123456",
          "TEARING_DOWN",
          new Date(),
        );
        return { status: 0 };
      },
    );
    assert.equal(result.outcome, "TEARDOWN_COMPLETE");
    assert.equal(
      verifyPrivateDatabaseTeardownReceipt(result.exchangeDirectory)
        .runnerExitCode,
      0,
    );
    const serializedExchange = ["state", "teardownReceipt"]
      .map((name) =>
        readFileSync(
          privateDatabaseExchangePath(result.exchangeDirectory, name),
          "utf8",
        ),
      )
      .join("\n");
    assert.doesNotMatch(serializedExchange, /admin-secret|disposable_admin/);
  },
);

posixLifecycleTest(
  "failed disposable teardown cannot produce a successful receipt",
  () => {
    const root = secureRoot();
    const adminFile = path.join(root, "admin-url");
    writeFileSync(
      adminFile,
      "postgresql://disposable_admin:admin-secret@127.0.0.1:5432/postgres\n",
      { mode: 0o600 },
    );
    const result = startPrivateDatabaseLifecycle(
      {
        CI: "true",
        AUTHORIZATION_TEST_RUN_ID: "ci-private-db-123456",
        OGFI_PRODUCTION_AUTH_E2E_DATABASE_ADMIN_URL_FILE: adminFile,
        OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_ROOT: root,
      },
      () => ({ status: 7 }),
    );
    assert.equal(result.outcome, "FAILED");
    assert.throws(
      () => verifyPrivateDatabaseTeardownReceipt(result.exchangeDirectory),
      /PRODUCTION_AUTH_E2E_PRIVATE_DB_TEARDOWN_UNVERIFIED/,
    );
  },
);

posixLifecycleTest(
  "stop command is accepted only for a live HOLDING exchange",
  () => {
    const exchange = createPrivateDatabaseExchange(
      secureRoot(),
      "ci-private-db-123456",
    );
    initializePrivateDatabaseState(
      exchange,
      "ci-private-db-123456",
      new Date(),
    );
    const environment = identityEnvironment(exchange);
    publishPrivateDatabaseHandoff(
      environment,
      new Date(),
      fakeFixtureProvision,
    );
    const stopFile = stopPrivateDatabaseLifecycle(exchange, environment);
    assert.equal(assertSecureRegularFile(stopFile), true);
    assert.throws(
      () => stopPrivateDatabaseLifecycle(exchange, environment),
      /PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_PREEXISTING/,
    );
  },
);

test("database lifecycle Compose contract is private, unprivileged, and host-UID bound", () => {
  const compose = readFileSync(
    path.join(
      process.cwd(),
      "infra/ci/production-authenticated-e2e/compose.database-lifecycle.yaml",
    ),
    "utf8",
  );
  assert.match(
    compose,
    /image: \$\{OGFI_PRODUCTION_AUTH_E2E_DATABASE_IMAGE:\?/,
  );
  assert.match(compose, /tmpfs:\n\s+- \/var\/lib\/postgresql\/data:/);
  assert.match(compose, /- \/var\/run\/postgresql:size=1m,mode=3775/);
  assert.match(compose, /- \/tmp:size=32m,mode=1777/);
  assert.match(compose, /network_mode: service:postgres/);
  assert.match(
    compose,
    /user: \$\{OGFI_PRODUCTION_AUTH_E2E_HOST_UID:\?[^\n]+HOST_GID/,
  );
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /cap_drop:\n\s+- ALL/);
  assert.match(
    compose,
    /postgres:[\s\S]*cap_add:\n\s+- CHOWN\n\s+- DAC_OVERRIDE\n\s+- FOWNER\n\s+- SETGID\n\s+- SETUID/,
  );
  assert.match(compose, /internal: true/);
  assert.match(compose, /lifecycle:[\s\S]*- \/tmp:size=64m,mode=1777/);
  assert.match(
    compose,
    /lifecycle:[\s\S]*- \/app\/packages\/database\/node_modules\/\.vite:size=64m,mode=1777/,
  );
  assert.match(
    compose,
    /lifecycle:[\s\S]*- \/app\/apps\/web\/node_modules\/\.vite:size=64m,mode=1777/,
  );
  assert.doesNotMatch(
    compose,
    /docker\.sock|privileged:|network_mode: host|\n\s+ports:/,
  );
  const dockerfile = readFileSync(
    path.join(
      process.cwd(),
      "infra/ci/production-authenticated-e2e/Dockerfile.database-lifecycle",
    ),
    "utf8",
  );
  assert.match(dockerfile, /COREPACK_HOME=\/opt\/corepack/);
  assert.match(dockerfile, /corepack prepare pnpm@9\.15\.4 --activate/);
  assert.match(dockerfile, /chmod -R a\+rX "\$\{COREPACK_HOME\}"/);
  assert.match(dockerfile, /pnpm --version \| grep -Fx '9\.15\.4'/);
  assert.match(dockerfile, /COREPACK_ENABLE_DOWNLOAD_PROMPT=0/);
});
