import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const privateDatabaseProtocol =
  "ogfi-production-authenticated-private-database/v1";

export const privateDatabaseExchangeFiles = Object.freeze({
  browserFixture: "browser-fixture.json",
  fixture: "fixture.env",
  manifest: "manifest.json",
  runtime: "runtime.env",
  state: "state.json",
  stop: "stop.signal",
  teardownReceipt: "teardown-receipt.json",
});

const immutableImagePattern =
  /^(?:[a-z0-9][a-z0-9._:/-]*@)?sha256:[a-f0-9]{64}$/;
const runIdPattern = /^[A-Za-z0-9._-]{6,128}$/;
const safeNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const stateSequence = Object.freeze({
  PREPARING: 1,
  READY: 2,
  HOLDING: 3,
  TEARING_DOWN: 4,
  TEARDOWN_COMPLETE: 5,
  FAILED: 5,
});
const transitions = Object.freeze({
  PREPARING: new Set(["READY", "TEARING_DOWN"]),
  READY: new Set(["HOLDING", "TEARING_DOWN"]),
  HOLDING: new Set(["TEARING_DOWN"]),
  TEARING_DOWN: new Set(["TEARDOWN_COMPLETE", "FAILED"]),
  TEARDOWN_COMPLETE: new Set(),
  FAILED: new Set(),
});

function fail(code) {
  throw new Error(code);
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) fail(`${name}_REQUIRED`);
  return value;
}

function assertOwner(stat, code) {
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    fail(code);
  }
}

function assertMode(stat, expected, code) {
  if ((stat.mode & 0o777) !== expected) fail(code);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertImmutableImageIdentity(value, code) {
  if (!immutableImagePattern.test(value ?? "")) fail(code);
  return value;
}

export function createPrivateDatabaseExchange(exchangeRoot, runId) {
  if (!runIdPattern.test(runId ?? "")) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_RUN_ID_INVALID");
  }
  const root = path.resolve(exchangeRoot ?? "");
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_ROOT_UNSAFE");
  }
  assertOwner(
    rootStat,
    "PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_ROOT_OWNER_INVALID",
  );
  if ((rootStat.mode & 0o077) !== 0) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_ROOT_PERMISSIVE");
  }
  const exchangeDirectory = path.join(root, `run-${runId}`);
  try {
    mkdirSync(exchangeDirectory, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_PREEXISTING");
    }
    throw error;
  }
  chmodSync(exchangeDirectory, 0o700);
  assertSecureExchangeDirectory(exchangeDirectory);
  return exchangeDirectory;
}

export function assertSecureExchangeDirectory(exchangeDirectory) {
  const stat = lstatSync(exchangeDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_UNSAFE");
  }
  assertOwner(stat, "PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_OWNER_INVALID");
  assertMode(stat, 0o700, "PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_PERMISSIVE");
  return path.resolve(exchangeDirectory);
}

export function assertSecureRegularFile(file, { allowMissing = false } = {}) {
  if (!existsSync(file)) {
    if (allowMissing) return false;
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_MISSING");
  }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_UNSAFE");
  }
  if (stat.nlink !== 1) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_HARDLINKED");
  }
  assertOwner(
    stat,
    "PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_OWNER_INVALID",
  );
  assertMode(
    stat,
    0o600,
    "PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_PERMISSIVE",
  );
  return true;
}

function atomicWrite(file, content, { replace = false } = {}) {
  const directory = assertSecureExchangeDirectory(path.dirname(file));
  if (!replace && existsSync(file)) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_FILE_PREEXISTING");
  }
  if (replace) assertSecureRegularFile(file);
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, content, { encoding: "utf8" });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, 0o600);
    renameSync(temporary, file);
    const directoryDescriptor = openSync(directory, "r");
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  assertSecureRegularFile(file);
}

export function writePrivateDatabaseJson(file, value, options) {
  atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`, options);
}

export function removePrivateDatabaseSecretFile(file) {
  assertSecureRegularFile(file);
  const directory = assertSecureExchangeDirectory(path.dirname(file));
  unlinkSync(file);
  const directoryDescriptor = openSync(directory, "r");
  try {
    fsyncSync(directoryDescriptor);
  } finally {
    closeSync(directoryDescriptor);
  }
}

export function readPrivateDatabaseJson(file) {
  assertSecureRegularFile(file);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_EXCHANGE_JSON_INVALID");
  }
}

export function initializePrivateDatabaseState(exchangeDirectory, runId, now) {
  const file = path.join(exchangeDirectory, privateDatabaseExchangeFiles.state);
  const state = {
    protocol: privateDatabaseProtocol,
    runId,
    state: "PREPARING",
    sequence: stateSequence.PREPARING,
    previousState: null,
    changedAt: now.toISOString(),
  };
  writePrivateDatabaseJson(file, state);
  return state;
}

export function transitionPrivateDatabaseState(
  exchangeDirectory,
  runId,
  nextState,
  now,
  details = {},
) {
  if (!(nextState in stateSequence)) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_STATE_INVALID");
  }
  const file = path.join(exchangeDirectory, privateDatabaseExchangeFiles.state);
  const current = readPrivateDatabaseJson(file);
  if (
    current.protocol !== privateDatabaseProtocol ||
    current.runId !== runId ||
    !transitions[current.state]?.has(nextState) ||
    current.sequence !== stateSequence[current.state]
  ) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_STATE_TRANSITION_INVALID");
  }
  const state = {
    ...details,
    protocol: privateDatabaseProtocol,
    runId,
    state: nextState,
    sequence: stateSequence[nextState],
    previousState: current.state,
    changedAt: now.toISOString(),
  };
  writePrivateDatabaseJson(file, state, { replace: true });
  return state;
}

function assertSafeRuntimeUrl(
  runtimeUrl,
  expectedDatabase,
  expectedRuntimeRole,
) {
  let parsed;
  try {
    parsed = new URL(runtimeUrl);
  } catch {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_RUNTIME_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    decodeURIComponent(parsed.pathname.replace(/^\//, "")) !==
      expectedDatabase ||
    decodeURIComponent(parsed.username) !== expectedRuntimeRole ||
    !parsed.password
  ) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_RUNTIME_URL_INVALID");
  }
  return parsed;
}

export function privateNetworkRuntimeUrl(
  runtimeUrl,
  expectedDatabase,
  expectedRuntimeRole,
  databaseAlias,
) {
  if (!safeNamePattern.test(databaseAlias ?? "")) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_ALIAS_INVALID");
  }
  const parsed = assertSafeRuntimeUrl(
    runtimeUrl,
    expectedDatabase,
    expectedRuntimeRole,
  );
  parsed.hostname = databaseAlias;
  parsed.port = "5432";
  return parsed.toString();
}

export function buildPrivateDatabaseManifest(environment, now, expiresAt) {
  const runId = required(environment, "OGFI_DISPOSABLE_DATABASE_RUN_ID");
  const nonceSha256 = required(
    environment,
    "OGFI_DISPOSABLE_DATABASE_NONCE_SHA256",
  );
  const databaseName = required(
    environment,
    "OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME",
  );
  const runtimeRole = required(environment, "AUTHORIZATION_TEST_RUNTIME_ROLE");
  if (!runIdPattern.test(runId) || !/^[a-f0-9]{64}$/.test(nonceSha256)) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_IDENTITY_INVALID");
  }
  const candidateImage = assertImmutableImageIdentity(
    required(environment, "OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE"),
    "PRODUCTION_AUTH_E2E_PRIVATE_DB_CANDIDATE_IMAGE_INVALID",
  );
  const lifecycleImage = assertImmutableImageIdentity(
    required(environment, "OGFI_PRODUCTION_AUTH_E2E_LIFECYCLE_IMAGE"),
    "PRODUCTION_AUTH_E2E_PRIVATE_DB_LIFECYCLE_IMAGE_INVALID",
  );
  const databaseImage = assertImmutableImageIdentity(
    required(environment, "OGFI_PRODUCTION_AUTH_E2E_DATABASE_IMAGE"),
    "PRODUCTION_AUTH_E2E_PRIVATE_DB_DATABASE_IMAGE_INVALID",
  );
  const candidateCommit = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_CANDIDATE_COMMIT",
  );
  if (!/^[a-f0-9]{40}$/.test(candidateCommit)) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_CANDIDATE_COMMIT_INVALID");
  }
  const databaseAlias = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_DATABASE_ALIAS",
  );
  const networkId = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_DATABASE_NETWORK_ID",
  );
  const networkName = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_DATABASE_NETWORK_NAME",
  );
  const databaseContainerId = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_DATABASE_CONTAINER_ID",
  );
  const stopToken = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_DATABASE_STOP_TOKEN",
  );
  if (stopToken.length < 32 || /[\r\n]/.test(stopToken)) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_STOP_TOKEN_INVALID");
  }
  if (
    !safeNamePattern.test(databaseAlias) ||
    !safeNamePattern.test(networkName) ||
    !/^[a-f0-9]{12,64}$/.test(networkId) ||
    !/^[a-f0-9]{12,64}$/.test(databaseContainerId)
  ) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_TOPOLOGY_IDENTITY_INVALID");
  }
  return {
    protocol: privateDatabaseProtocol,
    runId,
    nonceSha256,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    candidate: { commit: candidateCommit, image: candidateImage },
    lifecycle: { image: lifecycleImage },
    database: {
      alias: databaseAlias,
      containerId: databaseContainerId,
      image: databaseImage,
      name: databaseName,
      networkId,
      networkName,
      runtimeRole,
    },
    files: {
      browserFixture: privateDatabaseExchangeFiles.browserFixture,
      fixtureBrokerSecrets: "SCRUBBED_BEFORE_READY",
      runtime: privateDatabaseExchangeFiles.runtime,
      state: privateDatabaseExchangeFiles.state,
      stop: privateDatabaseExchangeFiles.stop,
      teardownReceipt: privateDatabaseExchangeFiles.teardownReceipt,
    },
    stopTokenSha256: sha256(stopToken),
  };
}

export function writePrivateDatabaseFixtureEnvironment(
  exchangeDirectory,
  environment,
) {
  const socket = required(environment, "OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET");
  const token = required(environment, "OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN");
  if (!path.isAbsolute(socket) || token.length < 32 || /[\r\n=]/.test(token)) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_FIXTURE_SECRET_INVALID");
  }
  const content = [
    `OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET=${socket}`,
    `OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN=${token}`,
    "",
  ].join("\n");
  const file = path.join(
    exchangeDirectory,
    privateDatabaseExchangeFiles.fixture,
  );
  atomicWrite(file, content);
  return file;
}

export function writePrivateDatabaseRuntimeEnvironment(
  exchangeDirectory,
  environment,
) {
  const databaseName = required(
    environment,
    "OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME",
  );
  const runtimeRole = required(environment, "AUTHORIZATION_TEST_RUNTIME_ROLE");
  const privateUrl = privateNetworkRuntimeUrl(
    required(environment, "DATABASE_URL"),
    databaseName,
    runtimeRole,
    required(environment, "OGFI_PRODUCTION_AUTH_E2E_DATABASE_ALIAS"),
  );
  const entries = {
    AUTHORIZATION_DATABASE_INTEGRATION: "yes",
    AUTHORIZATION_TEST_DATABASE: databaseName,
    AUTHORIZATION_TEST_DATABASE_HOST: required(
      environment,
      "OGFI_PRODUCTION_AUTH_E2E_DATABASE_ALIAS",
    ),
    AUTHORIZATION_TEST_DATABASE_NONCE_SHA256: required(
      environment,
      "AUTHORIZATION_TEST_DATABASE_NONCE_SHA256",
    ),
    AUTHORIZATION_TEST_DATABASE_PORT: "5432",
    AUTHORIZATION_TEST_RUN_ID: required(
      environment,
      "AUTHORIZATION_TEST_RUN_ID",
    ),
    AUTHORIZATION_TEST_RUNTIME_ROLE: runtimeRole,
    AUTH_DATABASE_INTEGRATION: "yes",
    DATABASE_URL: privateUrl,
    DIRECT_DATABASE_URL: "",
    OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME: databaseName,
    OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: required(
      environment,
      "OGFI_DISPOSABLE_DATABASE_NONCE_SHA256",
    ),
    OGFI_DISPOSABLE_DATABASE_RUN_ID: required(
      environment,
      "OGFI_DISPOSABLE_DATABASE_RUN_ID",
    ),
  };
  const content = `${Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
  if (
    new RegExp("ADMIN|MIGRAT|OWNER|DIRECT_DATABASE_URL" + "=.+").test(content)
  ) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_PRIVILEGED_CREDENTIAL_LEAK");
  }
  const file = path.join(
    exchangeDirectory,
    privateDatabaseExchangeFiles.runtime,
  );
  atomicWrite(file, content);
  return file;
}

export function writePrivateDatabaseStopSignal(
  exchangeDirectory,
  runId,
  nonceSha256,
  stopToken,
  now,
) {
  const file = path.join(exchangeDirectory, privateDatabaseExchangeFiles.stop);
  writePrivateDatabaseJson(file, {
    protocol: privateDatabaseProtocol,
    runId,
    nonceSha256,
    requestedAt: now.toISOString(),
    stopToken,
  });
  return file;
}

export function assertPrivateDatabaseStopSignal(
  exchangeDirectory,
  manifest,
  now,
) {
  const file = path.join(exchangeDirectory, privateDatabaseExchangeFiles.stop);
  if (!assertSecureRegularFile(file, { allowMissing: true })) return false;
  const signal = readPrivateDatabaseJson(file);
  if (
    signal.protocol !== privateDatabaseProtocol ||
    signal.runId !== manifest.runId ||
    signal.nonceSha256 !== manifest.nonceSha256 ||
    typeof signal.stopToken !== "string" ||
    sha256(signal.stopToken) !== manifest.stopTokenSha256 ||
    !Number.isFinite(Date.parse(signal.requestedAt)) ||
    Date.parse(signal.requestedAt) > now.getTime() + 30_000
  ) {
    fail("PRODUCTION_AUTH_E2E_PRIVATE_DB_STOP_SIGNAL_INVALID");
  }
  return true;
}

export function privateDatabaseExchangePath(exchangeDirectory, name) {
  return path.join(
    assertSecureExchangeDirectory(exchangeDirectory),
    privateDatabaseExchangeFiles[name],
  );
}
