import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  productionAuthOrigin,
  validateProductionAuthenticatedE2eEnvironment,
} from "./production-auth-e2e-runner.mjs";

function environment(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "ogfi-production-auth-e2e-"));
  const cert = join(root, "cert.pem");
  const key = join(root, "key.pem");
  const ca = join(root, "ca.pem");
  writeFileSync(cert, "fixture");
  writeFileSync(key, "fixture");
  writeFileSync(ca, "fixture");
  return {
    CI: "true",
    NODE_ENV: "production",
    APP_ENV: "production",
    AUTH_MODE: "local",
    APP_URL: productionAuthOrigin,
    AUTH_TRUSTED_PROXY_MODE: "caddy_single_hop",
    OGFI_PRODUCTION_AUTH_E2E_TLS_CERT_FILE: cert,
    OGFI_PRODUCTION_AUTH_E2E_TLS_KEY_FILE: key,
    OGFI_PRODUCTION_AUTH_E2E_TLS_CA_FILE: ca,
    OGFI_PRODUCTION_AUTH_E2E_TLS_DIR: root,
    OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE: join(root, "fixture.json"),
    DATABASE_URL: "postgresql://runtime:fixture@127.0.0.1/ogfi_test_fixture",
    OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME: "ogfi_test_fixture",
    OGFI_DISPOSABLE_DATABASE_RUN_ID: "fixture-run",
    OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: "a".repeat(64),
    AUTH_SECRET: "a".repeat(32),
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    AUTH_THROTTLE_HMAC_KEY: "b".repeat(32),
    SMTP_HOST: "smtp.fixture.test",
    SMTP_PORT: "465",
    SMTP_USERNAME: "fixture",
    SMTP_PASSWORD: "c".repeat(32),
    SMTP_FROM: "fixture@example.test",
    SMTP_SECURITY: "implicit",
    NEXT_DIST_DIR: ".next-production-authenticated-e2e",
    ...overrides,
  };
}

test("production authenticated runner requires production local HTTPS proxy contract", () => {
  assert.doesNotThrow(() => validateProductionAuthenticatedE2eEnvironment(environment()));
  assert.throws(
    () => validateProductionAuthenticatedE2eEnvironment(environment({ AUTH_MODE: "demo" })),
    /PRODUCTION_AUTH_E2E_LOCAL_AUTH_REQUIRED/,
  );
  assert.throws(
    () => validateProductionAuthenticatedE2eEnvironment(environment({ APP_URL: "http://127.0.0.1:3443" })),
    /PRODUCTION_AUTH_E2E_HTTPS_ORIGIN_REQUIRED/,
  );
  assert.throws(
    () => validateProductionAuthenticatedE2eEnvironment(environment({ NODE_TLS_REJECT_UNAUTHORIZED: "0" })),
    /PRODUCTION_AUTH_E2E_TLS_BYPASS_FORBIDDEN/,
  );
  assert.throws(
    () => validateProductionAuthenticatedE2eEnvironment(environment({ AUTH_TRUSTED_PROXY_MODE: "" })),
    /PRODUCTION_AUTH_E2E_PROXY_MODE_REQUIRED/,
  );
});
