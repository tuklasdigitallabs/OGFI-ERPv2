import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSecureExchangeDirectory,
  assertSecureRegularFile,
  createPrivateDatabaseExchange,
  initializePrivateDatabaseState,
  privateDatabaseExchangePath,
  readPrivateDatabaseJson,
  removePrivateDatabaseSecretFile,
  transitionPrivateDatabaseState,
  writePrivateDatabaseJson,
  writePrivateDatabaseStopSignal,
} from "./production-auth-e2e-private-db-exchange.mjs";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function readAdminUrl(environment) {
  const file = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_DATABASE_ADMIN_URL_FILE",
  );
  assertSecureRegularFile(file);
  const value = readFileSync(file, "utf8").trim();
  if (!value) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_ADMIN_URL_FILE_EMPTY");
  }
  return value;
}

function stateFor(exchangeDirectory) {
  return readPrivateDatabaseJson(
    privateDatabaseExchangePath(exchangeDirectory, "state"),
  );
}

function ensureTearingDown(exchangeDirectory, runId, reason) {
  const state = stateFor(exchangeDirectory);
  if (["PREPARING", "READY", "HOLDING"].includes(state.state)) {
    transitionPrivateDatabaseState(
      exchangeDirectory,
      runId,
      "TEARING_DOWN",
      new Date(),
      { reason },
    );
  }
}

function writeReceipt(
  exchangeDirectory,
  runId,
  outcome,
  runnerExitCode,
  runtimeArtifacts = "REMOVED",
) {
  const file = privateDatabaseExchangePath(exchangeDirectory, "teardownReceipt");
  writePrivateDatabaseJson(file, {
    protocol: "ogfi-production-authenticated-private-database/v1",
    runId,
    outcome,
    runnerExitCode,
    completedAt: new Date().toISOString(),
    disposableDatabase: outcome === "TEARDOWN_COMPLETE" ? "VERIFIED_REMOVED" : "UNVERIFIED",
    runtimeArtifacts,
  });
}

function removeExchangeSecrets(exchangeDirectory) {
  for (const name of ["fixture", "browserFixture", "runtime", "stop"]) {
    const file = privateDatabaseExchangePath(exchangeDirectory, name);
    if (existsSync(file)) removePrivateDatabaseSecretFile(file);
  }
}

export function startPrivateDatabaseLifecycle(
  environment = process.env,
  execute = spawnSync,
) {
  if (environment.CI !== "true") {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_CI_REQUIRED");
  }
  const runId = required(environment, "AUTHORIZATION_TEST_RUN_ID");
  const exchangeDirectory = createPrivateDatabaseExchange(
    required(environment, "OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_ROOT"),
    runId,
  );
  initializePrivateDatabaseState(exchangeDirectory, runId, new Date());
  let result;
  try {
    result = execute(
      process.execPath,
      [
        "scripts/run-disposable-postgres-tests.mjs",
        "production-authenticated-e2e",
        "--",
        process.execPath,
        "scripts/production-auth-e2e-private-db-handoff.mjs",
      ],
      {
        cwd: workspaceRoot,
        env: {
          ...environment,
          DISPOSABLE_DATABASE_ADMIN_URL: readAdminUrl(environment),
          OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_DIRECTORY:
            exchangeDirectory,
        },
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    const exitCode = result.status ?? 1;
    ensureTearingDown(
      exchangeDirectory,
      runId,
      exitCode === 0 ? "DISPOSABLE_RUNNER_COMPLETED" : "DISPOSABLE_RUNNER_FAILED",
    );
    removeExchangeSecrets(exchangeDirectory);
    const outcome = exitCode === 0 ? "TEARDOWN_COMPLETE" : "FAILED";
    writeReceipt(exchangeDirectory, runId, outcome, exitCode);
    transitionPrivateDatabaseState(
      exchangeDirectory,
      runId,
      outcome,
      new Date(),
      { runnerExitCode: exitCode },
    );
    return { exchangeDirectory, exitCode, outcome };
  } catch (error) {
    ensureTearingDown(exchangeDirectory, runId, "LIFECYCLE_EXCEPTION");
    let cleanupError;
    try {
      removeExchangeSecrets(exchangeDirectory);
    } catch (caught) {
      cleanupError = caught;
    }
    writeReceipt(
      exchangeDirectory,
      runId,
      "FAILED",
      result?.status ?? 1,
      cleanupError ? "REMOVAL_FAILED" : "REMOVED",
    );
    const state = stateFor(exchangeDirectory);
    if (state.state === "TEARING_DOWN") {
      transitionPrivateDatabaseState(
        exchangeDirectory,
        runId,
        "FAILED",
        new Date(),
        { runnerExitCode: result?.status ?? 1 },
      );
    }
    if (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "PRODUCTION_AUTH_E2E_PRIVATE_DB_CLEANUP_FAILED",
      );
    }
    throw error;
  }
}

export function stopPrivateDatabaseLifecycle(
  exchangeDirectory,
  environment = process.env,
) {
  assertSecureExchangeDirectory(exchangeDirectory);
  const manifest = readPrivateDatabaseJson(
    privateDatabaseExchangePath(exchangeDirectory, "manifest"),
  );
  const state = stateFor(exchangeDirectory);
  if (state.state !== "HOLDING") {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_NOT_HOLDING");
  }
  return writePrivateDatabaseStopSignal(
    exchangeDirectory,
    manifest.runId,
    manifest.nonceSha256,
    required(environment, "OGFI_PRODUCTION_AUTH_E2E_DATABASE_STOP_TOKEN"),
    new Date(),
  );
}

export function verifyPrivateDatabaseTeardownReceipt(exchangeDirectory) {
  assertSecureExchangeDirectory(exchangeDirectory);
  const state = stateFor(exchangeDirectory);
  const receipt = readPrivateDatabaseJson(
    privateDatabaseExchangePath(exchangeDirectory, "teardownReceipt"),
  );
  if (
    state.state !== "TEARDOWN_COMPLETE" ||
    receipt.outcome !== "TEARDOWN_COMPLETE" ||
    receipt.runId !== state.runId ||
    receipt.runnerExitCode !== 0 ||
    receipt.disposableDatabase !== "VERIFIED_REMOVED" ||
    receipt.runtimeArtifacts !== "REMOVED"
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_TEARDOWN_UNVERIFIED");
  }
  return receipt;
}

function cli() {
  const command = process.argv[2];
  if (command === "start") {
    const result = startPrivateDatabaseLifecycle();
    process.exitCode = result.exitCode;
    return;
  }
  const exchangeDirectory = process.argv[3];
  if (!exchangeDirectory) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_DIRECTORY_REQUIRED");
  }
  if (command === "stop") {
    stopPrivateDatabaseLifecycle(exchangeDirectory);
    return;
  }
  if (command === "verify-teardown") {
    verifyPrivateDatabaseTeardownReceipt(exchangeDirectory);
    return;
  }
  throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_COMMAND_INVALID");
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    cli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
