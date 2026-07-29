import { request as httpsRequest } from "node:https";
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const productionAuthOrigin = "https://127.0.0.1:3443";
const upstreamHost = "127.0.0.1";
const upstreamPort = 3102;
const composeFile = "infra/ci/production-authenticated-e2e/compose.yaml";

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function secureValue(environment, name, minimumLength = 32) {
  const value = required(environment, name);
  if (value.length < minimumLength) throw new Error(`${name}_WEAK`);
  return value;
}

export function validateProductionAuthenticatedE2eEnvironment(environment = process.env) {
  if (environment.CI !== "true") throw new Error("PRODUCTION_AUTH_E2E_CI_REQUIRED");
  if (environment.NODE_ENV !== "production" || environment.APP_ENV !== "production") {
    throw new Error("PRODUCTION_AUTH_E2E_PRODUCTION_RUNTIME_REQUIRED");
  }
  if (environment.AUTH_MODE !== "local") throw new Error("PRODUCTION_AUTH_E2E_LOCAL_AUTH_REQUIRED");
  if (environment.APP_URL !== productionAuthOrigin) {
    throw new Error("PRODUCTION_AUTH_E2E_HTTPS_ORIGIN_REQUIRED");
  }
  if (environment.AUTH_TRUSTED_PROXY_MODE !== "caddy_single_hop") {
    throw new Error("PRODUCTION_AUTH_E2E_PROXY_MODE_REQUIRED");
  }
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("PRODUCTION_AUTH_E2E_TLS_BYPASS_FORBIDDEN");
  }
  for (const name of ["PLAYWRIGHT_IGNORE_HTTPS_ERRORS", "IGNORE_HTTPS_ERRORS"]) {
    if (environment[name]?.trim().toLowerCase() === "true") {
      throw new Error("PRODUCTION_AUTH_E2E_TLS_BYPASS_FORBIDDEN");
    }
  }
  const certFile = required(environment, "OGFI_PRODUCTION_AUTH_E2E_TLS_CERT_FILE");
  const keyFile = required(environment, "OGFI_PRODUCTION_AUTH_E2E_TLS_KEY_FILE");
  const caFile = required(environment, "OGFI_PRODUCTION_AUTH_E2E_TLS_CA_FILE");
  const tlsDirectory = required(environment, "OGFI_PRODUCTION_AUTH_E2E_TLS_DIR");
  if (!existsSync(certFile) || !existsSync(keyFile) || !existsSync(caFile) || !existsSync(tlsDirectory)) {
    throw new Error("PRODUCTION_AUTH_E2E_TLS_MATERIAL_MISSING");
  }
  if (dirname(certFile) !== tlsDirectory || dirname(keyFile) !== tlsDirectory) {
    throw new Error("PRODUCTION_AUTH_E2E_TLS_DIRECTORY_MISMATCH");
  }
  required(environment, "OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE");
  required(environment, "DATABASE_URL");
  required(environment, "OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME");
  required(environment, "OGFI_DISPOSABLE_DATABASE_RUN_ID");
  const nonce = required(environment, "OGFI_DISPOSABLE_DATABASE_NONCE_SHA256");
  if (!/^[a-f0-9]{64}$/.test(nonce)) {
    throw new Error("OGFI_DISPOSABLE_DATABASE_NONCE_SHA256_INVALID");
  }
  secureValue(environment, "AUTH_SECRET");
  secureValue(environment, "APP_ENCRYPTION_KEY", 43);
  secureValue(environment, "AUTH_THROTTLE_HMAC_KEY");
  secureValue(environment, "SMTP_PASSWORD");
  required(environment, "SMTP_HOST");
  required(environment, "SMTP_USERNAME");
  required(environment, "SMTP_FROM");
  required(environment, "SMTP_PORT");
  required(environment, "SMTP_SECURITY");
  if (environment.NEXT_DIST_DIR !== ".next-production-authenticated-e2e") {
    throw new Error("PRODUCTION_AUTH_E2E_SEPARATE_BUILD_REQUIRED");
  }
  return { caFile, tlsDirectory };
}

function run(command, args, environment) {
  const result = spawnSync(command, args, { cwd: workspaceRoot, env: environment, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`PRODUCTION_AUTH_E2E_COMMAND_FAILED:${command}`);
}

function waitForHttpsReady(caFile) {
  const deadline = Date.now() + 120_000;
  return new Promise((resolveReady, rejectReady) => {
    const attempt = () => {
      const request = httpsRequest(productionAuthOrigin, { ca: readFileSync(caFile), timeout: 5_000 }, (response) => {
        response.resume();
        resolveReady();
      });
      request.on("error", (error) => {
        if (Date.now() >= deadline) rejectReady(error);
        else setTimeout(attempt, 500);
      });
      request.end();
    };
    attempt();
  });
}

async function main() {
  const { caFile, tlsDirectory } = validateProductionAuthenticatedE2eEnvironment();
  const environment = { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR, OGFI_PRODUCTION_AUTH_E2E_TLS_DIR: tlsDirectory };
  const projectName = `ogfi-production-auth-${process.pid}`;
  let next;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (next && !next.killed) next.kill("SIGTERM");
    run("docker", ["compose", "-f", composeFile, "--project-name", projectName, "down", "--volumes", "--remove-orphans"], environment);
  };
  try {
    run("pnpm", ["--dir", "apps/web", "build"], environment);
    run("pnpm", ["exec", "tsx", "scripts/production-auth-e2e-fixture.ts", "provision"], environment);
    next = spawn("pnpm", ["--dir", "apps/web", "exec", "next", "start", "-H", upstreamHost, "-p", String(upstreamPort)], { cwd: workspaceRoot, env: environment, stdio: "inherit" });
    run("docker", ["compose", "-f", composeFile, "--project-name", projectName, "up", "--detach", "--build"], environment);
    await waitForHttpsReady(caFile);
  } catch (error) {
    stop();
    throw error;
  }
  const terminate = (signal) => {
    stop();
    process.exit(signal === "SIGTERM" ? 0 : 1);
  };
  process.once("SIGINT", () => terminate("SIGINT"));
  process.once("SIGTERM", () => terminate("SIGTERM"));
  next.once("exit", (code) => {
    stop();
    process.exit(code ?? 1);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
