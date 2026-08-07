import { request as httpsRequest } from "node:https";
import { connect as connectTcp } from "node:net";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSecureExchangeDirectory,
  assertSecureRegularFile,
  privateDatabaseExchangePath,
  privateDatabaseProtocol,
  readPrivateDatabaseJson,
  sha256,
} from "./production-auth-e2e-private-db-exchange.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const productionAuthOrigin = "https://127.0.0.1:3443";
const composeFile = "infra/ci/production-authenticated-e2e/compose.yaml";
const nginxImage =
  "docker.io/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10";
const immutableImagePattern =
  /^(?:[a-z0-9][a-z0-9._:/-]*@)?sha256:[a-f0-9]{64}$/;
const containerNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const exchangeRuntimeKeys = new Set([
  "AUTHORIZATION_DATABASE_INTEGRATION",
  "AUTHORIZATION_TEST_DATABASE",
  "AUTHORIZATION_TEST_DATABASE_HOST",
  "AUTHORIZATION_TEST_DATABASE_NONCE_SHA256",
  "AUTHORIZATION_TEST_DATABASE_PORT",
  "AUTHORIZATION_TEST_RUN_ID",
  "AUTHORIZATION_TEST_RUNTIME_ROLE",
  "AUTH_DATABASE_INTEGRATION",
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME",
  "OGFI_DISPOSABLE_DATABASE_NONCE_SHA256",
  "OGFI_DISPOSABLE_DATABASE_RUN_ID",
]);

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

function parseStrictEnvironmentFile(file, expectedKeys) {
  assertSecureRegularFile(file);
  const parsed = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_ENV_INVALID");
    }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!expectedKeys.has(key) || Object.hasOwn(parsed, key)) {
      throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_ENV_UNEXPECTED_KEY");
    }
    parsed[key] = value;
  }
  if (
    Object.keys(parsed).length !== expectedKeys.size ||
    [...expectedKeys].some((key) => !Object.hasOwn(parsed, key))
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_ENV_INCOMPLETE");
  }
  return parsed;
}

function collectRegularFiles(root) {
  if (!existsSync(root)) return [];
  const stat = statSync(root);
  if (stat.isFile()) return [root];
  if (!stat.isDirectory()) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    collectRegularFiles(join(root, entry.name)),
  );
}

function assertBrowserArtifactsSanitized(secrets, environment) {
  const lane = environment.APP_ENV === "uat" ? "bounded-uat" : "production";
  const roots = [
    resolve(
      workspaceRoot,
      `apps/web/test-results/production-auth-${lane}-artifacts`,
    ),
    resolve(
      workspaceRoot,
      `apps/web/test-results/production-auth-${lane}-html`,
    ),
    resolve(
      workspaceRoot,
      `apps/web/test-results/production-auth-${lane}-junit.xml`,
    ),
  ];
  for (const file of roots.flatMap(collectRegularFiles)) {
    const content = readFileSync(file);
    for (const secret of secrets) {
      if (secret.length >= 8 && content.includes(Buffer.from(secret))) {
        throw new Error("PRODUCTION_AUTH_E2E_BROWSER_ARTIFACT_SECRET_LEAK");
      }
    }
  }
}

export function loadPrivateDatabaseExchange(environment = process.env) {
  const runId = required(environment, "AUTHORIZATION_TEST_RUN_ID");
  const exchangeDirectory = assertSecureExchangeDirectory(
    join(
      required(environment, "OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_ROOT"),
      `run-${runId}`,
    ),
  );
  const state = readPrivateDatabaseJson(
    privateDatabaseExchangePath(exchangeDirectory, "state"),
  );
  const manifest = readPrivateDatabaseJson(
    privateDatabaseExchangePath(exchangeDirectory, "manifest"),
  );
  const runtimeEnvironment = parseStrictEnvironmentFile(
    privateDatabaseExchangePath(exchangeDirectory, "runtime"),
    exchangeRuntimeKeys,
  );
  const browserFixtureFile = privateDatabaseExchangePath(
    exchangeDirectory,
    "browserFixture",
  );
  assertSecureRegularFile(browserFixtureFile);
  const now = Date.now();
  if (
    state.protocol !== privateDatabaseProtocol ||
    state.runId !== runId ||
    state.state !== "HOLDING" ||
    state.sequence !== 3 ||
    manifest.protocol !== privateDatabaseProtocol ||
    manifest.runId !== runId ||
    !Number.isFinite(Date.parse(manifest.issuedAt)) ||
    !Number.isFinite(Date.parse(manifest.expiresAt)) ||
    Date.parse(manifest.issuedAt) > now + 30_000 ||
    Date.parse(manifest.expiresAt) <= now
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_HANDOFF_INVALID");
  }
  for (const [name, file] of [
    ["manifest", privateDatabaseExchangePath(exchangeDirectory, "manifest")],
    ["runtime", privateDatabaseExchangePath(exchangeDirectory, "runtime")],
    ["browserFixture", browserFixtureFile],
  ]) {
    if (state.fileDigests?.[name] !== sha256(readFileSync(file))) {
      throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_HANDOFF_TAMPERED");
    }
  }
  let browserFixture;
  try {
    browserFixture = JSON.parse(readFileSync(browserFixtureFile, "utf8"));
  } catch {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_BROWSER_FIXTURE_INVALID");
  }
  const browserFixtureSecrets = [
    browserFixture?.branch?.password,
    browserFixture?.privileged?.password,
    browserFixture?.privileged?.totpSecret,
  ];
  if (
    browserFixtureSecrets.some(
      (value) => typeof value !== "string" || value.length < 8,
    )
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_BROWSER_FIXTURE_INVALID");
  }
  if (
    manifest.candidate?.commit !==
      environment.OGFI_PRODUCTION_AUTH_E2E_CANDIDATE_COMMIT ||
    manifest.candidate?.image !==
      environment.OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE ||
    !immutableImagePattern.test(manifest.lifecycle?.image ?? "") ||
    !immutableImagePattern.test(manifest.database?.image ?? "") ||
    !containerNamePattern.test(manifest.database?.alias ?? "") ||
    !containerNamePattern.test(manifest.database?.networkName ?? "") ||
    !/^[a-f0-9]{12,64}$/.test(manifest.database?.networkId ?? "") ||
    !/^[a-f0-9]{12,64}$/.test(manifest.database?.containerId ?? "")
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_MANIFEST_INVALID");
  }
  if (
    runtimeEnvironment.AUTHORIZATION_TEST_RUN_ID !== runId ||
    runtimeEnvironment.OGFI_DISPOSABLE_DATABASE_RUN_ID !== runId ||
    runtimeEnvironment.OGFI_DISPOSABLE_DATABASE_NONCE_SHA256 !==
      manifest.nonceSha256 ||
    runtimeEnvironment.OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME !==
      manifest.database.name ||
    runtimeEnvironment.AUTHORIZATION_TEST_RUNTIME_ROLE !==
      manifest.database.runtimeRole ||
    runtimeEnvironment.AUTHORIZATION_TEST_DATABASE_HOST !==
      manifest.database.alias ||
    runtimeEnvironment.DIRECT_DATABASE_URL !== ""
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_RUNTIME_BINDING_INVALID");
  }
  const runtimeUrl = new URL(runtimeEnvironment.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(runtimeUrl.protocol) ||
    runtimeUrl.hostname !== manifest.database.alias ||
    runtimeUrl.port !== "5432" ||
    decodeURIComponent(runtimeUrl.pathname.replace(/^\//, "")) !==
      manifest.database.name ||
    decodeURIComponent(runtimeUrl.username) !== manifest.database.runtimeRole ||
    !runtimeUrl.password
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_RUNTIME_URL_INVALID");
  }
  return {
    browserFixtureFile,
    browserFixtureSecrets,
    exchangeDirectory,
    manifest,
    runtimeEnvironment,
  };
}

export function validateProductionAuthenticatedE2eEnvironment(
  environment = process.env,
) {
  if (environment.CI !== "true")
    throw new Error("PRODUCTION_AUTH_E2E_CI_REQUIRED");
  const ordinaryProductionLane =
    environment.APP_ENV === "production" &&
    environment.AUTH_HARDENED_UAT_RUNTIME_ENABLED === "false" &&
    environment.BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED === "false" &&
    environment.APPROVAL_ROUTING_V1_ENABLED === "false";
  const boundedUatLane =
    environment.APP_ENV === "uat" &&
    environment.AUTH_HARDENED_UAT_RUNTIME_ENABLED === "true" &&
    environment.BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED === "true" &&
    environment.APPROVAL_ROUTING_V1_ENABLED === "false";
  if (
    environment.NODE_ENV !== "production" ||
    (!ordinaryProductionLane && !boundedUatLane)
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRODUCTION_RUNTIME_REQUIRED");
  }
  if (environment.AUTH_MODE !== "local")
    throw new Error("PRODUCTION_AUTH_E2E_LOCAL_AUTH_REQUIRED");
  if (environment.APP_URL !== productionAuthOrigin) {
    throw new Error("PRODUCTION_AUTH_E2E_HTTPS_ORIGIN_REQUIRED");
  }
  if (environment.AUTH_TRUSTED_PROXY_MODE !== "caddy_single_hop") {
    throw new Error("PRODUCTION_AUTH_E2E_PROXY_MODE_REQUIRED");
  }
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("PRODUCTION_AUTH_E2E_TLS_BYPASS_FORBIDDEN");
  }
  if (environment.NODE_EXTRA_CA_CERTS?.trim()) {
    throw new Error("PRODUCTION_AUTH_E2E_DEFAULT_CA_OVERRIDE_FORBIDDEN");
  }
  for (const name of [
    "PLAYWRIGHT_IGNORE_HTTPS_ERRORS",
    "IGNORE_HTTPS_ERRORS",
  ]) {
    if (environment[name]?.trim().toLowerCase() === "true") {
      throw new Error("PRODUCTION_AUTH_E2E_TLS_BYPASS_FORBIDDEN");
    }
  }
  const certFile = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_TLS_CERT_FILE",
  );
  const keyFile = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_TLS_KEY_FILE",
  );
  const caFile = required(environment, "OGFI_PRODUCTION_AUTH_E2E_TLS_CA_FILE");
  const wrongCaFile = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_TLS_WRONG_CA_FILE",
  );
  const tlsDirectory = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_TLS_DIR",
  );
  if (
    !existsSync(certFile) ||
    !existsSync(keyFile) ||
    !existsSync(caFile) ||
    !existsSync(wrongCaFile) ||
    !existsSync(tlsDirectory)
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_TLS_MATERIAL_MISSING");
  }
  if (dirname(certFile) !== tlsDirectory || dirname(keyFile) !== tlsDirectory) {
    throw new Error("PRODUCTION_AUTH_E2E_TLS_DIRECTORY_MISMATCH");
  }
  const fixtureFile = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE",
  );
  const reportFile = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_REPORT_FILE",
  );
  if (
    environment.OGFI_PRODUCTION_AUTH_E2E_FIXTURE_PREPROVISIONED !== "true" ||
    !existsSync(fixtureFile)
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PREPROVISIONED_FIXTURE_MISSING");
  }
  const runtimeUrl = required(environment, "DATABASE_URL");
  const expectedDatabase = required(
    environment,
    "OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME",
  );
  required(environment, "OGFI_DISPOSABLE_DATABASE_RUN_ID");
  const nonce = required(environment, "OGFI_DISPOSABLE_DATABASE_NONCE_SHA256");
  if (!/^[a-f0-9]{64}$/.test(nonce)) {
    throw new Error("OGFI_DISPOSABLE_DATABASE_NONCE_SHA256_INVALID");
  }
  secureValue(environment, "AUTH_SECRET");
  secureValue(environment, "APP_ENCRYPTION_KEY", 43);
  secureValue(environment, "AUTH_THROTTLE_HMAC_KEY");
  secureValue(environment, "OGFI_PRODUCTION_AUTH_E2E_PROBE_TOKEN");
  if (
    environment.AUTHORIZATION_DATABASE_INTEGRATION !== "yes" ||
    environment.AUTH_DATABASE_INTEGRATION !== "yes"
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_DATABASE_MARKER_REQUIRED");
  }
  const runtimeRole = required(environment, "AUTHORIZATION_TEST_RUNTIME_ROLE");
  const parsedRuntimeUrl = new URL(runtimeUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsedRuntimeUrl.protocol) ||
    parsedRuntimeUrl.hostname !==
      required(environment, "AUTHORIZATION_TEST_DATABASE_HOST") ||
    parsedRuntimeUrl.port !== "5432" ||
    decodeURIComponent(parsedRuntimeUrl.pathname.replace(/^\//, "")) !==
      expectedDatabase ||
    decodeURIComponent(parsedRuntimeUrl.username) !== runtimeRole
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_RUNTIME_DATABASE_INVALID");
  }
  const webImage = required(environment, "OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE");
  if (!immutableImagePattern.test(webImage)) {
    throw new Error("PRODUCTION_AUTH_E2E_WEB_IMAGE_NOT_IMMUTABLE");
  }
  const caddyImage = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_CADDY_IMAGE",
  );
  if (!immutableImagePattern.test(caddyImage)) {
    throw new Error("PRODUCTION_AUTH_E2E_CADDY_IMAGE_NOT_IMMUTABLE");
  }
  const candidateCommit = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_CANDIDATE_COMMIT",
  );
  if (!/^[a-f0-9]{40}$/.test(candidateCommit)) {
    throw new Error("PRODUCTION_AUTH_E2E_CANDIDATE_COMMIT_INVALID");
  }
  const lifecycleContainer = required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_LIFECYCLE_CONTAINER_ID",
  );
  if (!/^[a-f0-9]{12,64}$/.test(lifecycleContainer)) {
    throw new Error("PRODUCTION_AUTH_E2E_LIFECYCLE_CONTAINER_INVALID");
  }
  if (ordinaryProductionLane) {
    secureValue(environment, "SMTP_PASSWORD");
    required(environment, "SMTP_HOST");
    required(environment, "SMTP_USERNAME");
    required(environment, "SMTP_FROM");
    required(environment, "SMTP_PORT");
    required(environment, "SMTP_SECURITY");
  }
  return {
    caFile,
    caddyImage,
    candidateCommit,
    lifecycleContainer,
    privateDatabaseUrl: runtimeUrl,
    reportFile,
    tlsDirectory,
    webImage,
    wrongCaFile,
  };
}

function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    const outcome = result.signal
      ? `signal=${result.signal}`
      : `status=${result.status ?? "unknown"}`;
    throw new Error(
      `PRODUCTION_AUTH_E2E_COMMAND_FAILED:${command}:${args.join(" ")}:${outcome}`,
    );
  }
}

function capture(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: environment,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const outcome = result.signal
      ? `signal=${result.signal}`
      : `status=${result.status ?? "unknown"}`;
    throw new Error(
      `PRODUCTION_AUTH_E2E_COMMAND_FAILED:${command}:${args.join(" ")}:${outcome}`,
    );
  }
  return result.stdout.trim();
}

function captureWithInput(command, args, environment, input) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: environment,
    encoding: "utf8",
    input,
  });
  if (result.status !== 0) {
    const outcome = result.signal
      ? `signal=${result.signal}`
      : `status=${result.status ?? "unknown"}`;
    throw new Error(
      `PRODUCTION_AUTH_E2E_COMMAND_FAILED:${command}:${args.join(" ")}:${outcome}`,
    );
  }
  return result.stdout.trim();
}

function commandFails(command, args, environment) {
  return (
    spawnSync(command, args, {
      cwd: workspaceRoot,
      env: environment,
      stdio: "ignore",
    }).status !== 0
  );
}

function writeSanitizedReport(reportFile, report, environment) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const secretNames = [
    "DATABASE_URL",
    "DIRECT_DATABASE_URL",
    "DISPOSABLE_DATABASE_ADMIN_URL",
    "AUTH_SECRET",
    "AUTH_THROTTLE_HMAC_KEY",
    "APP_ENCRYPTION_KEY",
    "SMTP_PASSWORD",
    "OGFI_PRODUCTION_AUTH_E2E_PROBE_TOKEN",
    "OGFI_PRODUCTION_AUTH_E2E_DATABASE_STOP_TOKEN",
  ];
  for (const name of secretNames) {
    const value = environment[name];
    if (value && value.length >= 8 && serialized.includes(value)) {
      throw new Error(`PRODUCTION_AUTH_E2E_REPORT_SECRET_LEAK:${name}`);
    }
  }
  writeFileSync(reportFile, serialized, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function composeArgs(projectName, ...args) {
  return ["compose", "-f", composeFile, "--project-name", projectName, ...args];
}

function assertPrivateDatabaseTopology(
  manifest,
  lifecycleContainerId,
  environment,
) {
  const network = JSON.parse(
    capture(
      "docker",
      ["network", "inspect", manifest.database.networkName],
      environment,
    ),
  )?.[0];
  if (
    !network ||
    network.Id !== manifest.database.networkId ||
    network.Internal !== true
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_NETWORK_DRIFT");
  }
  const container = JSON.parse(
    capture("docker", ["inspect", manifest.database.containerId], environment),
  )?.[0];
  const requestedImageId = capture(
    "docker",
    ["image", "inspect", "--format", "{{.Id}}", manifest.database.image],
    environment,
  );
  const networks = container?.NetworkSettings?.Networks ?? {};
  const ports = container?.HostConfig?.PortBindings ?? {};
  const mounts = container?.Mounts ?? [];
  const normalizeCapabilities = (capabilities = []) =>
    (Array.isArray(capabilities) ? capabilities : [])
      .map((capability) => capability.replace(/^CAP_/, ""))
      .sort();
  const normalizeSecurityOptions = (options = []) =>
    (Array.isArray(options) ? options : [])
      .map((option) => option.replace(/(?::|=)true$/, ""))
      .sort();
  const mountContract = (actualMounts, expectedMounts) => {
    const normalized = actualMounts
      .map((mount) => ({
        destination: mount.Destination,
        readWrite: mount.RW,
        source: mount.Source,
        type: mount.Type,
      }))
      .sort((left, right) => left.destination.localeCompare(right.destination));
    const expected = [...expectedMounts].sort((left, right) =>
      left.destination.localeCompare(right.destination),
    );
    return JSON.stringify(normalized) === JSON.stringify(expected);
  };
  const normalizeTmpfs = (tmpfs = {}) =>
    Object.fromEntries(
      Object.entries(tmpfs && typeof tmpfs === "object" ? tmpfs : {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([destination, options]) => [
          destination,
          options.split(",").sort().join(","),
        ]),
    );
  const expectedDatabaseMounts = [
    {
      destination: "/run/secrets/ogfi_private_db_admin_password",
      readWrite: false,
      source: required(
        environment,
        "OGFI_PRODUCTION_AUTH_E2E_DATABASE_ADMIN_PASSWORD_FILE",
      ),
      type: "bind",
    },
  ];
  if (
    !container?.Id?.startsWith(manifest.database.containerId) ||
    container.Image !== requestedImageId ||
    container.State?.Running !== true ||
    container.HostConfig?.Privileged !== false ||
    container.HostConfig?.ReadonlyRootfs !== true ||
    container.HostConfig?.NetworkMode === "host" ||
    container.HostConfig?.PidMode === "host" ||
    container.HostConfig?.IpcMode === "host" ||
    JSON.stringify(
      normalizeSecurityOptions(container.HostConfig?.SecurityOpt),
    ) !== JSON.stringify(["no-new-privileges"]) ||
    JSON.stringify(normalizeCapabilities(container.HostConfig?.CapDrop)) !==
      JSON.stringify(["ALL"]) ||
    JSON.stringify(normalizeCapabilities(container.HostConfig?.CapAdd)) !==
      JSON.stringify(["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"]) ||
    JSON.stringify(normalizeTmpfs(container.HostConfig?.Tmpfs)) !==
      JSON.stringify(
        normalizeTmpfs({
          "/tmp": "size=32m,mode=1777",
          "/var/lib/postgresql/data": "size=1g,mode=0700",
          "/var/run/postgresql": "size=1m,mode=3775",
        }),
      ) ||
    Object.keys(networks).length !== 1 ||
    !Object.hasOwn(networks, manifest.database.networkName) ||
    Object.keys(ports).length !== 0 ||
    !mountContract(mounts, expectedDatabaseMounts)
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_CONTAINER_DRIFT");
  }
  const databaseProcessUid = capture(
    "docker",
    [
      "exec",
      manifest.database.containerId,
      "sh",
      "-lc",
      "awk '/^Uid:/{print $2; exit}' /proc/1/status",
    ],
    environment,
  );
  if (databaseProcessUid !== "70") {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_PROCESS_IDENTITY_DRIFT");
  }
  const lifecycle = JSON.parse(
    capture("docker", ["inspect", lifecycleContainerId], environment),
  )?.[0];
  const requestedLifecycleImageId = capture(
    "docker",
    ["image", "inspect", "--format", "{{.Id}}", manifest.lifecycle.image],
    environment,
  );
  const lifecyclePorts = lifecycle?.HostConfig?.PortBindings ?? {};
  const lifecycleMounts = lifecycle?.Mounts ?? [];
  const expectedLifecycleMounts = [
    {
      destination: "/run/ogfi-private-db-exchange",
      readWrite: true,
      source: required(
        environment,
        "OGFI_PRODUCTION_AUTH_E2E_DATABASE_EXCHANGE_ROOT",
      ),
      type: "bind",
    },
    {
      destination: "/run/secrets/ogfi-private-db-admin-url",
      readWrite: false,
      source: required(
        environment,
        "OGFI_PRODUCTION_AUTH_E2E_DATABASE_ADMIN_URL_FILE",
      ),
      type: "bind",
    },
  ];
  const expectedLifecycleUser = `${required(
    environment,
    "OGFI_PRODUCTION_AUTH_E2E_HOST_UID",
  )}:${required(environment, "OGFI_PRODUCTION_AUTH_E2E_HOST_GID")}`;
  const lifecycleDrift = [];
  if (!lifecycle?.Id?.startsWith(lifecycleContainerId)) lifecycleDrift.push("id");
  if (lifecycle?.Image !== requestedLifecycleImageId) lifecycleDrift.push("image");
  if (lifecycle?.State?.Running !== true) lifecycleDrift.push("running");
  if (lifecycle?.Config?.User !== expectedLifecycleUser) lifecycleDrift.push("user");
  if (lifecycle?.HostConfig?.NetworkMode !== `container:${container.Id}`) lifecycleDrift.push("network_mode");
  if (lifecycle?.HostConfig?.Privileged !== false) lifecycleDrift.push("privileged");
  if (lifecycle?.HostConfig?.ReadonlyRootfs !== true) lifecycleDrift.push("readonly_rootfs");
  if (
    JSON.stringify(normalizeSecurityOptions(lifecycle?.HostConfig?.SecurityOpt)) !==
    JSON.stringify(["no-new-privileges"])
  ) lifecycleDrift.push("security_options");
  if (
    JSON.stringify(normalizeCapabilities(lifecycle?.HostConfig?.CapDrop)) !==
    JSON.stringify(["ALL"])
  ) lifecycleDrift.push("cap_drop");
  if (normalizeCapabilities(lifecycle?.HostConfig?.CapAdd).length !== 0) lifecycleDrift.push("cap_add");
  if (
    JSON.stringify(normalizeTmpfs(lifecycle?.HostConfig?.Tmpfs)) !==
    JSON.stringify(normalizeTmpfs({ "/tmp": "size=64m,mode=1777" }))
  ) lifecycleDrift.push("tmpfs");
  if (lifecycle?.HostConfig?.PidMode === "host") lifecycleDrift.push("pid_mode");
  if (lifecycle?.HostConfig?.IpcMode === "host") lifecycleDrift.push("ipc_mode");
  if (Object.keys(lifecyclePorts).length !== 0) lifecycleDrift.push("ports");
  if (!mountContract(lifecycleMounts, expectedLifecycleMounts)) lifecycleDrift.push("mounts");
  if (lifecycleDrift.length > 0) {
    throw new Error(
      `PRODUCTION_AUTH_E2E_PRIVATE_DB_LIFECYCLE_DRIFT:${lifecycleDrift.join(",")}`,
    );
  }
}

function assertPrivateDatabaseRuntimeMarker(manifest, runtimeUrl, environment) {
  const parsed = new URL(runtimeUrl);
  const output = captureWithInput(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      `PGHOST=${manifest.database.alias}`,
      "-e",
      "PGPORT=5432",
      "-e",
      `PGUSER=${manifest.database.runtimeRole}`,
      "-e",
      `PGDATABASE=${manifest.database.name}`,
      manifest.database.containerId,
      "sh",
      "-lc",
      "IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -X -v ON_ERROR_STOP=1 -At -c \"SELECT current_database() || '|' || current_user || '|' || session_user || '|' || database_name || '|' || run_id || '|' || nonce_sha256 FROM ogfi_disposable_control.verify_database_identity()\"",
    ],
    environment,
    `${decodeURIComponent(parsed.password)}\n`,
  );
  const expected = [
    manifest.database.name,
    manifest.database.runtimeRole,
    manifest.database.runtimeRole,
    manifest.database.name,
    manifest.runId,
    manifest.nonceSha256,
  ].join("|");
  if (output !== expected) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_DB_RUNTIME_MARKER_DRIFT");
  }
}

function assertLiveSharedNamespace(
  projectName,
  databaseNetwork,
  databaseContainerId,
  expectedWebImage,
  expectedCaddyImage,
  candidateCommit,
  environment,
) {
  const serviceId = (service) =>
    capture(
      "docker",
      composeArgs(projectName, "ps", "-q", service),
      environment,
    );
  const nginxId = serviceId("nginx");
  const caddyId = serviceId("caddy");
  const appId = serviceId("app");
  if (!nginxId || !caddyId || !appId) {
    throw new Error("PRODUCTION_AUTH_E2E_TOPOLOGY_SERVICE_MISSING");
  }
  const appImageId = capture(
    "docker",
    ["inspect", "--format", "{{.Image}}", appId],
    environment,
  );
  const requestedAppImageId = capture(
    "docker",
    ["image", "inspect", "--format", "{{.Id}}", expectedWebImage],
    environment,
  );
  const appRevision = capture(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "org.opencontainers.image.revision"}}',
      appId,
    ],
    environment,
  );
  if (appImageId !== requestedAppImageId || appRevision !== candidateCommit) {
    throw new Error("PRODUCTION_AUTH_E2E_APP_IDENTITY_DRIFT");
  }
  const nginxImageId = capture(
    "docker",
    ["image", "inspect", "--format", "{{.Id}}", nginxImage],
    environment,
  );
  if (
    capture(
      "docker",
      ["inspect", "--format", "{{.Image}}", nginxId],
      environment,
    ) !== nginxImageId
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_NGINX_IDENTITY_DRIFT");
  }
  const caddyLabels = JSON.parse(
    capture(
      "docker",
      ["inspect", "--format", "{{json .Config.Labels}}", caddyId],
      environment,
    ),
  );
  const requestedCaddyImageId = capture(
    "docker",
    ["image", "inspect", "--format", "{{.Id}}", expectedCaddyImage],
    environment,
  );
  if (
    capture(
      "docker",
      ["inspect", "--format", "{{.Image}}", caddyId],
      environment,
    ) !== requestedCaddyImageId
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_CADDY_IMAGE_ID_DRIFT");
  }
  if (
    caddyLabels?.["io.ogfi.caddy.version"] !== "v2.11.4" ||
    caddyLabels?.["io.ogfi.caddy-ratelimit.commit"] !==
      "5625512f24f6f59d6f64fb3aafe5eecff0b286db"
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_CADDY_IDENTITY_DRIFT");
  }
  for (const [service, containerId] of [
    ["caddy", caddyId],
    ["app", appId],
  ]) {
    const networkMode = capture(
      "docker",
      ["inspect", "--format", "{{.HostConfig.NetworkMode}}", containerId],
      environment,
    );
    if (networkMode !== `container:${nginxId}`) {
      throw new Error(
        `PRODUCTION_AUTH_E2E_${service.toUpperCase()}_NAMESPACE_DRIFT`,
      );
    }
  }
  const nginxNetworks = JSON.parse(
    capture(
      "docker",
      ["inspect", "--format", "{{json .NetworkSettings.Networks}}", nginxId],
      environment,
    ),
  );
  if (
    Object.keys(nginxNetworks).length !== 1 ||
    !Object.hasOwn(nginxNetworks, databaseNetwork)
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_NETWORK_DRIFT");
  }
  const privateNetwork = JSON.parse(
    capture("docker", ["network", "inspect", databaseNetwork], environment),
  )?.[0];
  const attachedContainers = Object.keys(
    privateNetwork?.Containers ?? {},
  ).sort();
  if (
    attachedContainers.length !== 2 ||
    !attachedContainers.includes(nginxId) ||
    !attachedContainers.some((id) => id.startsWith(databaseContainerId))
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVATE_NETWORK_MEMBERSHIP_DRIFT");
  }
  const portBindings = JSON.parse(
    capture(
      "docker",
      ["inspect", "--format", "{{json .HostConfig.PortBindings}}", nginxId],
      environment,
    ),
  );
  const httpsBindings = portBindings?.["3443/tcp"];
  if (
    Object.keys(portBindings ?? {}).length !== 1 ||
    !Array.isArray(httpsBindings) ||
    httpsBindings.length !== 1 ||
    httpsBindings[0]?.HostIp !== "127.0.0.1" ||
    httpsBindings[0]?.HostPort !== "3443"
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_PUBLICATION_DRIFT");
  }
  for (const [service, containerId] of [
    ["nginx", nginxId],
    ["caddy", caddyId],
  ]) {
    const configuredEnvironment = JSON.parse(
      capture(
        "docker",
        ["inspect", "--format", "{{json .Config.Env}}", containerId],
        environment,
      ),
    );
    if (
      configuredEnvironment.some((entry) =>
        /^(?:DATABASE_URL|DIRECT_DATABASE_URL|AUTH_|APP_ENCRYPTION_KEY|SMTP_)/.test(
          entry,
        ),
      )
    ) {
      throw new Error(
        `PRODUCTION_AUTH_E2E_${service.toUpperCase()}_SECRET_ENVIRONMENT_DRIFT`,
      );
    }
  }
  const parseMounts = (containerId) =>
    JSON.parse(
      capture(
        "docker",
        ["inspect", "--format", "{{json .Mounts}}", containerId],
        environment,
      ),
    );
  if (parseMounts(appId).length !== 0) {
    throw new Error("PRODUCTION_AUTH_E2E_APP_MOUNT_DRIFT");
  }
  for (const [service, containerId] of [
    ["nginx", nginxId],
    ["caddy", caddyId],
  ]) {
    const mounts = parseMounts(containerId);
    if (
      mounts.some(
        (mount) =>
          mount.RW !== false ||
          /docker\.sock$/i.test(mount.Source ?? "") ||
          /docker\.sock$/i.test(mount.Destination ?? ""),
      )
    ) {
      throw new Error(
        `PRODUCTION_AUTH_E2E_${service.toUpperCase()}_MOUNT_DRIFT`,
      );
    }
  }
  const appEnvironment = JSON.parse(
    capture(
      "docker",
      ["inspect", "--format", "{{json .Config.Env}}", appId],
      environment,
    ),
  );
  if (
    appEnvironment.some((entry) =>
      /^(?:DISPOSABLE_DATABASE_ADMIN_URL|DATABASE_URL_FILE|DIRECT_DATABASE_URL_FILE)=/.test(
        entry,
      ),
    ) ||
    !appEnvironment.includes(["DIRECT_DATABASE_URL", ""].join("="))
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_APP_SECRET_ENVIRONMENT_DRIFT");
  }
  const tcpTable = capture(
    "docker",
    ["exec", nginxId, "cat", "/proc/net/tcp"],
    environment,
  );
  const listeners = tcpTable
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields[3] === "0A")
    .map((fields) => {
      const [address, port] = fields[1].split(":");
      return { address, port: Number.parseInt(port, 16) };
    });
  for (const port of [3101, 3102]) {
    if (
      !listeners.some(
        (listener) => listener.port === port && listener.address === "0100007F",
      )
    ) {
      throw new Error(`PRODUCTION_AUTH_E2E_LOOPBACK_LISTENER_${port}_MISSING`);
    }
  }
  if (!listeners.some((listener) => listener.port === 3443)) {
    throw new Error("PRODUCTION_AUTH_E2E_TLS_LISTENER_MISSING");
  }
  return { app: appId, caddy: caddyId, nginx: nginxId };
}

function expectTcpDenied(port) {
  return new Promise((resolveDenied, rejectDenied) => {
    const socket = connectTcp({ host: "127.0.0.1", port });
    socket.setTimeout(2_000);
    socket.once("connect", () => {
      socket.destroy();
      rejectDenied(
        new Error(`PRODUCTION_AUTH_E2E_DIRECT_PORT_${port}_EXPOSED`),
      );
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolveDenied();
    });
    socket.once("error", () => resolveDenied());
  });
}

function httpsProbe(options = {}) {
  return new Promise((resolveProbe, rejectProbe) => {
    const request = httpsRequest(
      productionAuthOrigin,
      { timeout: 5_000, ...options },
      (response) => {
        response.resume();
        response.once("end", () => resolveProbe(response.statusCode ?? 0));
      },
    );
    request.once("error", rejectProbe);
    request.end();
  });
}

function httpsJsonProbe(pathname, options = {}) {
  return new Promise((resolveProbe, rejectProbe) => {
    const request = httpsRequest(
      new URL(pathname, productionAuthOrigin),
      { timeout: 5_000, ...options },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.once("end", () => {
          try {
            resolveProbe({
              body: JSON.parse(body),
              status: response.statusCode ?? 0,
            });
          } catch (error) {
            rejectProbe(error);
          }
        });
      },
    );
    request.once("error", rejectProbe);
    request.end();
  });
}

async function assertTlsAndHostBoundary(caFile, wrongCaFile) {
  for (const options of [{}, { ca: readFileSync(wrongCaFile) }]) {
    try {
      await httpsProbe(options);
      throw new Error("PRODUCTION_AUTH_E2E_UNTRUSTED_CA_ACCEPTED");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "PRODUCTION_AUTH_E2E_UNTRUSTED_CA_ACCEPTED"
      ) {
        throw error;
      }
    }
  }
  await Promise.all([expectTcpDenied(3101), expectTcpDenied(3102)]);
  const hostileHeaders = {
    Forwarded: "for=203.0.113.10;proto=http",
    "X-Real-IP": "203.0.113.10",
    "X-Forwarded-For": "203.0.113.10",
    "X-Forwarded-Proto": "http",
    "X-Forwarded-Host": "attacker.example",
  };
  const status = await httpsProbe({
    ca: readFileSync(caFile),
    headers: hostileHeaders,
  });
  if (status < 200 || status >= 500) {
    throw new Error("PRODUCTION_AUTH_E2E_SPOOFED_HEADER_PROBE_FAILED");
  }
  const probe = await httpsJsonProbe(
    "/api/internal/production-auth-e2e-proxy-probe",
    {
      ca: readFileSync(caFile),
      headers: {
        ...hostileHeaders,
        "x-ogfi-e2e-probe-token":
          process.env.OGFI_PRODUCTION_AUTH_E2E_PROBE_TOKEN,
      },
    },
  );
  if (
    probe.status !== 200 ||
    probe.body?.forwardedHeaderRemoved !== true ||
    probe.body?.xRealIpRemoved !== true ||
    probe.body?.forwardedFor !== "127.0.0.1" ||
    probe.body?.forwardedProto !== "https" ||
    probe.body?.forwardedHost !== "127.0.0.1:3443" ||
    probe.body?.trustedLoopbackSource !== true
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_HEADER_NORMALIZATION_FAILED");
  }
}

function waitForHttpsReady(caFile) {
  const deadline = Date.now() + 120_000;
  return new Promise((resolveReady, rejectReady) => {
    const attempt = () => {
      const request = httpsRequest(
        productionAuthOrigin,
        { ca: readFileSync(caFile), timeout: 5_000 },
        (response) => {
          response.resume();
          resolveReady();
        },
      );
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
  const exchange = loadPrivateDatabaseExchange(process.env);
  const admittedEnvironment = {
    ...process.env,
    ...exchange.runtimeEnvironment,
    OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE: exchange.browserFixtureFile,
    OGFI_PRODUCTION_AUTH_E2E_FIXTURE_PREPROVISIONED: "true",
  };
  const {
    caFile,
    caddyImage,
    candidateCommit,
    lifecycleContainer,
    privateDatabaseUrl: appDatabaseUrl,
    reportFile,
    tlsDirectory,
    webImage,
    wrongCaFile,
  } = validateProductionAuthenticatedE2eEnvironment(admittedEnvironment);
  const projectName = `ogfi-production-auth-${process.pid}`;
  const databaseNetwork = exchange.manifest.database.networkName;
  const environment = {
    ...admittedEnvironment,
    OGFI_PRODUCTION_AUTH_E2E_APP_DATABASE_URL: appDatabaseUrl,
    OGFI_PRODUCTION_AUTH_E2E_CADDY_IMAGE: caddyImage,
    OGFI_PRODUCTION_AUTH_E2E_DATABASE_NETWORK: databaseNetwork,
    OGFI_PRODUCTION_AUTH_E2E_TLS_DIR: tlsDirectory,
    OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE: webImage,
  };
  const serviceWaits = new Map();
  let liveServiceIds = {};
  let serviceExitCodes = {};
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const cleanupErrors = [];
    const clean = (args) => {
      try {
        run("docker", args, environment);
      } catch (error) {
        cleanupErrors.push(error);
      }
    };
    if (Object.keys(liveServiceIds).length > 0) {
      clean(composeArgs(projectName, "stop", "--timeout", "10"));
      for (const [service, containerId] of Object.entries(liveServiceIds)) {
        try {
          serviceExitCodes[service] = Number.parseInt(
            capture(
              "docker",
              ["inspect", "--format", "{{.State.ExitCode}}", containerId],
              environment,
            ),
            10,
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
    clean(composeArgs(projectName, "down", "--volumes", "--remove-orphans"));
    for (const wait of serviceWaits.values()) {
      if (!wait.killed) wait.kill("SIGTERM");
    }
    try {
      assertBrowserArtifactsSanitized(
        [
          ...exchange.browserFixtureSecrets,
          environment.DATABASE_URL,
          decodeURIComponent(new URL(environment.DATABASE_URL).password),
          environment.AUTH_SECRET,
          environment.AUTH_THROTTLE_HMAC_KEY,
          environment.APP_ENCRYPTION_KEY,
          environment.SMTP_PASSWORD,
          environment.OGFI_PRODUCTION_AUTH_E2E_PROBE_TOKEN,
          environment.OGFI_PRODUCTION_AUTH_E2E_DATABASE_STOP_TOKEN,
        ].filter((value) => typeof value === "string"),
        environment,
      );
    } catch (error) {
      cleanupErrors.push(error);
    }
    for (const containerId of Object.values(liveServiceIds)) {
      if (!commandFails("docker", ["inspect", containerId], environment)) {
        cleanupErrors.push(
          new Error("PRODUCTION_AUTH_E2E_CONTAINER_TEARDOWN_INCOMPLETE"),
        );
      }
    }
    try {
      run(
        process.execPath,
        [
          "scripts/production-auth-e2e-private-db-lifecycle.mjs",
          "stop",
          exchange.exchangeDirectory,
        ],
        environment,
      );
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const state = readPrivateDatabaseJson(
          privateDatabaseExchangePath(exchange.exchangeDirectory, "state"),
        );
        if (state.state === "TEARDOWN_COMPLETE" || state.state === "FAILED") {
          break;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
      }
      run(
        process.execPath,
        [
          "scripts/production-auth-e2e-private-db-lifecycle.mjs",
          "verify-teardown",
          exchange.exchangeDirectory,
        ],
        environment,
      );
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        "PRODUCTION_AUTH_E2E_CLEANUP_FAILED",
      );
    }
    writeSanitizedReport(
      reportFile,
      {
        candidateCommit,
        applicationTopologyCleanup: "VERIFIED",
        executionMode:
          process.env.APP_ENV === "uat" ? "hardened-bounded-uat" : "production",
        privateDatabase: {
          image: exchange.manifest.database.image,
          lifecycleImage: exchange.manifest.lifecycle.image,
          teardown:
            "DISPOSABLE_DATABASE_REMOVED_PENDING_INFRASTRUCTURE_TEARDOWN",
        },
        serviceExitCodes,
        topology: "nginx-owned-shared-namespace",
      },
      environment,
    );
  };
  try {
    assertPrivateDatabaseTopology(
      exchange.manifest,
      lifecycleContainer,
      environment,
    );
    assertPrivateDatabaseRuntimeMarker(
      exchange.manifest,
      appDatabaseUrl,
      environment,
    );
    run("docker", composeArgs(projectName, "up", "--detach"), environment);
    const serviceIds = assertLiveSharedNamespace(
      projectName,
      databaseNetwork,
      exchange.manifest.database.containerId,
      webImage,
      caddyImage,
      candidateCommit,
      environment,
    );
    liveServiceIds = serviceIds;
    for (const [service, containerId] of Object.entries({
      ...serviceIds,
      database: exchange.manifest.database.containerId,
      lifecycle: lifecycleContainer,
    })) {
      const wait = spawn("docker", ["wait", containerId], {
        cwd: workspaceRoot,
        env: environment,
        stdio: ["ignore", "pipe", "ignore"],
      });
      serviceWaits.set(service, wait);
      let exitCodeText = "";
      wait.stdout?.on("data", (chunk) => {
        exitCodeText += chunk.toString();
      });
      wait.once("exit", (code) => {
        if (stopped) return;
        const serviceExitCode = Number.parseInt(exitCodeText.trim(), 10);
        console.error(
          `PRODUCTION_AUTH_E2E_SERVICE_EXITED:${service}:${Number.isInteger(serviceExitCode) ? serviceExitCode : (code ?? "unknown")}`,
        );
        try {
          stop();
        } catch (error) {
          console.error(error instanceof Error ? error.message : error);
        }
        process.exit(1);
      });
    }
    await waitForHttpsReady(caFile);
    await assertTlsAndHostBoundary(caFile, wrongCaFile);
  } catch (error) {
    try {
      stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "PRODUCTION_AUTH_E2E_STARTUP_AND_CLEANUP_FAILED",
      );
    }
    throw error;
  }
  const terminate = (signal) => {
    try {
      stop();
      process.exit(signal === "SIGTERM" ? 0 : 1);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  };
  process.once("SIGINT", () => terminate("SIGINT"));
  process.once("SIGTERM", () => terminate("SIGTERM"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
