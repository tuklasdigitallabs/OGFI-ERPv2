import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadPrivateDatabaseExchange,
  productionAuthOrigin,
  validateProductionAuthenticatedE2eEnvironment,
} from "./production-auth-e2e-runner.mjs";

function environment(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "ogfi-production-auth-e2e-"));
  const cert = join(root, "cert.pem");
  const key = join(root, "key.pem");
  const ca = join(root, "ca.pem");
  const wrongCa = join(root, "wrong-ca.pem");
  const fixture = join(root, "fixture.json");
  writeFileSync(cert, "fixture");
  writeFileSync(key, "fixture");
  writeFileSync(ca, "fixture");
  writeFileSync(wrongCa, "fixture");
  writeFileSync(fixture, "{}\n");
  return {
    CI: "true",
    NODE_ENV: "production",
    APP_ENV: "production",
    AUTH_HARDENED_UAT_RUNTIME_ENABLED: "false",
    BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED: "false",
    APPROVAL_ROUTING_V1_ENABLED: "false",
    AUTH_MODE: "local",
    APP_URL: productionAuthOrigin,
    AUTH_TRUSTED_PROXY_MODE: "caddy_single_hop",
    OGFI_PRODUCTION_AUTH_E2E_TLS_CERT_FILE: cert,
    OGFI_PRODUCTION_AUTH_E2E_TLS_KEY_FILE: key,
    OGFI_PRODUCTION_AUTH_E2E_TLS_CA_FILE: ca,
    OGFI_PRODUCTION_AUTH_E2E_TLS_WRONG_CA_FILE: wrongCa,
    OGFI_PRODUCTION_AUTH_E2E_TLS_DIR: root,
    OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE: fixture,
    OGFI_PRODUCTION_AUTH_E2E_FIXTURE_PREPROVISIONED: "true",
    OGFI_PRODUCTION_AUTH_E2E_REPORT_FILE: join(root, "report.json"),
    DATABASE_URL:
      "postgresql://runtime:fixture@ogfi-private-db:5432/ogfi_test_fixture",
    OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME: "ogfi_test_fixture",
    OGFI_DISPOSABLE_DATABASE_RUN_ID: "fixture-run",
    OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: "a".repeat(64),
    AUTHORIZATION_DATABASE_INTEGRATION: "yes",
    AUTH_DATABASE_INTEGRATION: "yes",
    AUTHORIZATION_TEST_RUNTIME_ROLE: "runtime",
    AUTHORIZATION_TEST_DATABASE_HOST: "ogfi-private-db",
    OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE: `sha256:${"d".repeat(64)}`,
    OGFI_PRODUCTION_AUTH_E2E_CADDY_IMAGE: `sha256:${"c".repeat(64)}`,
    OGFI_PRODUCTION_AUTH_E2E_CANDIDATE_COMMIT: "e".repeat(40),
    OGFI_PRODUCTION_AUTH_E2E_LIFECYCLE_CONTAINER_ID: "4".repeat(64),
    OGFI_PRODUCTION_AUTH_E2E_PROBE_TOKEN: "f".repeat(32),
    AUTH_SECRET: "a".repeat(32),
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    AUTH_THROTTLE_HMAC_KEY: "b".repeat(32),
    SMTP_HOST: "smtp.fixture.test",
    SMTP_PORT: "465",
    SMTP_USERNAME: "fixture",
    SMTP_PASSWORD: "c".repeat(32),
    SMTP_FROM: "fixture@example.test",
    SMTP_SECURITY: "implicit",
    ...overrides,
  };
}

test("production authenticated runner requires production local HTTPS proxy contract", () => {
  assert.doesNotThrow(() =>
    validateProductionAuthenticatedE2eEnvironment(environment()),
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({ AUTH_MODE: "demo" }),
      ),
    /PRODUCTION_AUTH_E2E_LOCAL_AUTH_REQUIRED/,
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({ APP_URL: "http://127.0.0.1:3443" }),
      ),
    /PRODUCTION_AUTH_E2E_HTTPS_ORIGIN_REQUIRED/,
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({ NODE_TLS_REJECT_UNAUTHORIZED: "0" }),
      ),
    /PRODUCTION_AUTH_E2E_TLS_BYPASS_FORBIDDEN/,
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({ NODE_EXTRA_CA_CERTS: "/tmp/ca.pem" }),
      ),
    /PRODUCTION_AUTH_E2E_DEFAULT_CA_OVERRIDE_FORBIDDEN/,
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({ AUTH_TRUSTED_PROXY_MODE: "" }),
      ),
    /PRODUCTION_AUTH_E2E_PROXY_MODE_REQUIRED/,
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({ OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE: "ogfi-web:latest" }),
      ),
    /PRODUCTION_AUTH_E2E_WEB_IMAGE_NOT_IMMUTABLE/,
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({ OGFI_PRODUCTION_AUTH_E2E_CANDIDATE_COMMIT: "short" }),
      ),
    /PRODUCTION_AUTH_E2E_CANDIDATE_COMMIT_INVALID/,
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({
          OGFI_PRODUCTION_AUTH_E2E_LIFECYCLE_CONTAINER_ID: "short",
        }),
      ),
    /PRODUCTION_AUTH_E2E_LIFECYCLE_CONTAINER_INVALID/,
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({ AUTHORIZATION_TEST_RUNTIME_ROLE: "different-runtime" }),
      ),
    /PRODUCTION_AUTH_E2E_RUNTIME_DATABASE_INVALID/,
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({ AUTHORIZATION_DATABASE_INTEGRATION: "" }),
      ),
    /PRODUCTION_AUTH_E2E_DATABASE_MARKER_REQUIRED/,
  );
  assert.doesNotThrow(() =>
    validateProductionAuthenticatedE2eEnvironment(
      environment({
        APP_ENV: "uat",
        AUTH_HARDENED_UAT_RUNTIME_ENABLED: "true",
        BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED: "true",
        APPROVAL_ROUTING_V1_ENABLED: "false",
        OGFI_PRODUCTION_AUTH_E2E_PROBE_TOKEN: "f".repeat(32),
        SMTP_HOST: "",
        SMTP_PORT: "",
        SMTP_USERNAME: "",
        SMTP_PASSWORD: "",
        SMTP_FROM: "",
        SMTP_SECURITY: "",
      }),
    ),
  );
  assert.throws(
    () =>
      validateProductionAuthenticatedE2eEnvironment(
        environment({
          APP_ENV: "uat",
          AUTH_HARDENED_UAT_RUNTIME_ENABLED: "true",
          BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED: "true",
          APPROVAL_ROUTING_V1_ENABLED: "true",
        }),
      ),
    /PRODUCTION_AUTH_E2E_PRODUCTION_RUNTIME_REQUIRED/,
  );
});

test(
  "production authenticated runner admits only a complete bound private database exchange",
  {
    skip:
      process.platform === "win32" &&
      "POSIX ownership and mode contract runs in hosted Linux CI",
  },
  () => {
    const env = environment();
    const exchangeRoot = mkdtempSync(join(tmpdir(), "ogfi-private-db-root-"));
    chmodSync(exchangeRoot, 0o700);
    const runId = "private-db-run-123";
    const exchangeDirectory = join(exchangeRoot, `run-${runId}`);
    mkdirSync(exchangeDirectory, { mode: 0o700 });
    chmodSync(exchangeDirectory, 0o700);
    const writeSecure = (name, content) => {
      const file = join(exchangeDirectory, name);
      writeFileSync(file, content, { mode: 0o600 });
      chmodSync(file, 0o600);
    };
    const nonce = "a".repeat(64);
    const manifestContent = `${JSON.stringify({
      protocol: "ogfi-production-authenticated-private-database/v1",
      runId,
      nonceSha256: nonce,
      issuedAt: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      candidate: {
        commit: env.OGFI_PRODUCTION_AUTH_E2E_CANDIDATE_COMMIT,
        image: env.OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE,
      },
      lifecycle: { image: `sha256:${"b".repeat(64)}` },
      database: {
        alias: "ogfi-private-db",
        containerId: "1".repeat(64),
        image: `docker.io/library/postgres:17-alpine@sha256:${"2".repeat(64)}`,
        name: "ogfi_test_fixture",
        networkId: "3".repeat(64),
        networkName: "ogfi-private-network",
        runtimeRole: "runtime",
      },
    })}\n`;
    const runtimeContent = [
      "AUTHORIZATION_DATABASE_INTEGRATION=yes",
      "AUTHORIZATION_TEST_DATABASE=ogfi_test_fixture",
      "AUTHORIZATION_TEST_DATABASE_HOST=ogfi-private-db",
      `AUTHORIZATION_TEST_DATABASE_NONCE_SHA256=${nonce}`,
      "AUTHORIZATION_TEST_DATABASE_PORT=5432",
      `AUTHORIZATION_TEST_RUN_ID=${runId}`,
      "AUTHORIZATION_TEST_RUNTIME_ROLE=runtime",
      "AUTH_DATABASE_INTEGRATION=yes",
      [
        "DATABASE_URL",
        "postgresql://runtime:fixture@ogfi-private-db:5432/ogfi_test_fixture",
      ].join("="),
      ["DIRECT_DATABASE_URL", ""].join("="),
      "OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME=ogfi_test_fixture",
      `OGFI_DISPOSABLE_DATABASE_NONCE_SHA256=${nonce}`,
      `OGFI_DISPOSABLE_DATABASE_RUN_ID=${runId}`,
      "",
    ].join("\n");
    const browserFixtureContent = `${JSON.stringify({
      tenantCode: "ogfi",
      branch: { password: "branch-password" },
      privileged: {
        password: "privileged-password",
        totpSecret: "totp-secret-value",
      },
    })}\n`;
    const digest = (content) =>
      createHash("sha256").update(content).digest("hex");
    writeSecure("manifest.json", manifestContent);
    writeSecure("runtime.env", runtimeContent);
    writeSecure("browser-fixture.json", browserFixtureContent);
    writeSecure(
      "state.json",
      `${JSON.stringify({
        protocol: "ogfi-production-authenticated-private-database/v1",
        runId,
        state: "HOLDING",
        sequence: 3,
        fileDigests: {
          manifest: digest(manifestContent),
          runtime: digest(runtimeContent),
          browserFixture: digest(browserFixtureContent),
        },
      })}\n`,
    );

    const exchange = loadPrivateDatabaseExchange({
      ...env,
      AUTHORIZATION_TEST_RUN_ID: runId,
      OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_ROOT: exchangeRoot,
    });
    assert.equal(exchange.exchangeDirectory, exchangeDirectory);
    assert.equal(
      exchange.manifest.database.networkName,
      "ogfi-private-network",
    );

    writeSecure(
      "browser-fixture.json",
      `${JSON.stringify({ tenantCode: "tampered" })}\n`,
    );
    assert.throws(
      () =>
        loadPrivateDatabaseExchange({
          ...env,
          AUTHORIZATION_TEST_RUN_ID: runId,
          OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_ROOT: exchangeRoot,
        }),
      /PRODUCTION_AUTH_E2E_PRIVATE_DB_HANDOFF_TAMPERED/,
    );
  },
);
