import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPrivateDatabaseStopSignal,
  assertSecureExchangeDirectory,
  assertSecureRegularFile,
  buildPrivateDatabaseManifest,
  privateDatabaseExchangeFiles,
  privateDatabaseExchangePath,
  readPrivateDatabaseJson,
  removePrivateDatabaseSecretFile,
  sha256,
  transitionPrivateDatabaseState,
  writePrivateDatabaseFixtureEnvironment,
  writePrivateDatabaseJson,
  writePrivateDatabaseRuntimeEnvironment,
} from "./production-auth-e2e-private-db-exchange.mjs";

const defaultLifetimeMs = 30 * 60_000;
const pollIntervalMs = 200;

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function assertPreparingState(exchangeDirectory, runId) {
  const state = readPrivateDatabaseJson(
    privateDatabaseExchangePath(exchangeDirectory, "state"),
  );
  if (
    state.runId !== runId ||
    state.state !== "PREPARING" ||
    state.sequence !== 1
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_PREPARING_STATE_REQUIRED");
  }
  for (const name of [
    "browserFixture",
    "manifest",
    "runtime",
    "fixture",
    "stop",
    "teardownReceipt",
  ]) {
    if (existsSync(path.join(exchangeDirectory, privateDatabaseExchangeFiles[name]))) {
      throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_TAMPERED");
    }
  }
}

function provisionBrowserFixture(environment, fixtureFile) {
  const result = spawnSync(
    "pnpm",
    [
      "--dir",
      "apps/web",
      "exec",
      "tsx",
      "../../scripts/production-auth-e2e-fixture.ts",
      "provision",
    ],
    {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      env: {
        ...environment,
        OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE: fixtureFile,
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `PRODUCTION_AUTH_E2E_PRIVATE_DB_FIXTURE_PROVISION_FAILED:${result.status ?? 1}`,
    );
  }
}

export function publishPrivateDatabaseHandoff(
  environment = process.env,
  now = new Date(),
  provisionFixture = provisionBrowserFixture,
) {
  const exchangeDirectory = assertSecureExchangeDirectory(
    required(environment, "OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_DIRECTORY"),
  );
  const runId = required(environment, "OGFI_DISPOSABLE_DATABASE_RUN_ID");
  if (runId !== required(environment, "AUTHORIZATION_TEST_RUN_ID")) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_RUN_ID_MISMATCH");
  }
  assertPreparingState(exchangeDirectory, runId);
  const configuredLifetime = Number.parseInt(
    environment.OGFI_PRODUCTION_AUTH_E2E_DATABASE_LIFETIME_MS ??
      String(defaultLifetimeMs),
    10,
  );
  if (
    !Number.isSafeInteger(configuredLifetime) ||
    configuredLifetime < 60_000 ||
    configuredLifetime > 60 * 60_000
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_LIFETIME_INVALID");
  }
  const expiresAt = new Date(now.getTime() + configuredLifetime);
  const manifest = buildPrivateDatabaseManifest(environment, now, expiresAt);
  writePrivateDatabaseRuntimeEnvironment(exchangeDirectory, environment);
  const fixtureBrokerFile = writePrivateDatabaseFixtureEnvironment(
    exchangeDirectory,
    environment,
  );
  const browserFixtureFile = privateDatabaseExchangePath(
    exchangeDirectory,
    "browserFixture",
  );
  try {
    provisionFixture(environment, browserFixtureFile);
    assertSecureRegularFile(browserFixtureFile);
  } finally {
    removePrivateDatabaseSecretFile(fixtureBrokerFile);
  }
  writePrivateDatabaseJson(
    privateDatabaseExchangePath(exchangeDirectory, "manifest"),
    manifest,
  );
  const fileDigests = Object.fromEntries(
    ["manifest", "runtime", "browserFixture"].map((name) => [
      name,
      sha256(readFileSync(privateDatabaseExchangePath(exchangeDirectory, name))),
    ]),
  );
  transitionPrivateDatabaseState(exchangeDirectory, runId, "READY", new Date(), {
    fileDigests,
  });
  transitionPrivateDatabaseState(exchangeDirectory, runId, "HOLDING", new Date(), {
    fileDigests,
  });
  return { exchangeDirectory, expiresAt, fileDigests, manifest, runId };
}

export function assertPrivateDatabaseHandoffIntact(handoff) {
  for (const [name, expectedDigest] of Object.entries(handoff.fileDigests)) {
    const file = privateDatabaseExchangePath(handoff.exchangeDirectory, name);
    if (sha256(readFileSync(file)) !== expectedDigest) {
      throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_HANDOFF_TAMPERED");
    }
  }
  return true;
}

export function holdPrivateDatabaseHandoff(
  handoff,
  { now = () => new Date(), waitFor = wait } = {},
) {
  while (true) {
    const current = now();
    assertPrivateDatabaseHandoffIntact(handoff);
    if (current.getTime() >= handoff.expiresAt.getTime()) {
      transitionPrivateDatabaseState(
        handoff.exchangeDirectory,
        handoff.runId,
        "TEARING_DOWN",
        current,
        { reason: "EXPIRED" },
      );
      throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_HANDOFF_EXPIRED");
    }
    if (
      assertPrivateDatabaseStopSignal(
        handoff.exchangeDirectory,
        handoff.manifest,
        current,
      )
    ) {
      transitionPrivateDatabaseState(
        handoff.exchangeDirectory,
        handoff.runId,
        "TEARING_DOWN",
        current,
        { reason: "STOP_REQUESTED" },
      );
      return;
    }
    waitFor(pollIntervalMs);
  }
}

export function main(environment = process.env) {
  const handoff = publishPrivateDatabaseHandoff(environment);
  holdPrivateDatabaseHandoff(handoff);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
