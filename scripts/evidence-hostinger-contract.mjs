import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

export const defaultEvidenceHostingerContractPaths = {
  compose: join(
    repositoryRoot,
    "infra/hostinger/evidence/compose.production.yaml",
  ),
  readme: join(repositoryRoot, "infra/hostinger/evidence/README.md"),
  systemdReadme: join(repositoryRoot, "infra/systemd/evidence/README.md"),
  systemdService: join(
    repositoryRoot,
    "infra/systemd/evidence/ogfi-evidence-reconcile.service",
  ),
  systemdTimer: join(
    repositoryRoot,
    "infra/systemd/evidence/ogfi-evidence-reconcile.timer",
  ),
};

export const requiredEvidenceHostingerEnvironment = [
  "COMPOSE_PROJECT_NAME",
  "OGFI_WEB_IMAGE",
  "OGFI_PRODUCTION_ENV_FILE",
  "CLAMAV_IMAGE",
  "EVIDENCE_HOST_STORAGE_ROOT",
  "EVIDENCE_BROKER_KEYS_FILE_HOST",
  "EVIDENCE_BROKER_SHARED_SECRET_FILE_HOST",
  "EVIDENCE_BROKER_RUNTIME_UID_GID",
  "CLAMAV_RUNTIME_UID_GID",
  "CLAMAV_SIGNATURES_CONTAINER_PATH",
  "CLAMAV_SIGNATURE_VOLUME_NAME",
  "CLAMAV_HEALTHCHECK_CMD",
  "WEB_MEMORY_LIMIT",
  "WEB_CPU_LIMIT",
  "WEB_PIDS_LIMIT",
  "EVIDENCE_BROKER_MEMORY_LIMIT",
  "EVIDENCE_BROKER_CPU_LIMIT",
  "EVIDENCE_BROKER_PIDS_LIMIT",
  "EVIDENCE_BROKER_TMPFS_SIZE",
  "CLAMAV_MEMORY_LIMIT",
  "CLAMAV_CPU_LIMIT",
  "CLAMAV_PIDS_LIMIT",
  "CLAMAV_TMPFS_SIZE",
  "CLAMAV_RUN_TMPFS_SIZE",
  "CONTAINER_LOG_MAX_SIZE",
  "CONTAINER_LOG_MAX_FILES",
];

function namedServiceBlock(composeText, name) {
  const match = new RegExp(`^  ${name}:\\n`, "m").exec(composeText);
  if (!match) return "";
  const start = match.index;
  const remainder = composeText.slice(start + match[0].length);
  const next = /^  [a-zA-Z0-9_-]+:\n/m.exec(remainder);
  return composeText.slice(
    start,
    next ? start + match[0].length + next.index : undefined,
  );
}

function hasAll(text, fragments) {
  return fragments.every((fragment) => text.includes(fragment));
}

function validateEnvironment(env, issues) {
  for (const name of requiredEvidenceHostingerEnvironment) {
    if (!env[name]?.trim()) issues.push(`${name}_MISSING`);
  }

  if (
    env.COMPOSE_PROJECT_NAME?.trim() &&
    !/^ogfi-erp-(?:staging|production)$/.test(env.COMPOSE_PROJECT_NAME.trim())
  ) {
    issues.push("COMPOSE_PROJECT_NAME_ENVIRONMENT_ISOLATION_REQUIRED");
  }

  for (const name of ["OGFI_WEB_IMAGE", "CLAMAV_IMAGE"]) {
    const value = env[name]?.trim() ?? "";
    if (value && !/@sha256:[a-f0-9]{64}$/i.test(value)) {
      issues.push(`${name}_IMMUTABLE_DIGEST_REQUIRED`);
    }
  }

  for (const name of [
    "EVIDENCE_HOST_STORAGE_ROOT",
    "EVIDENCE_BROKER_KEYS_FILE_HOST",
    "EVIDENCE_BROKER_SHARED_SECRET_FILE_HOST",
    "OGFI_PRODUCTION_ENV_FILE",
    "CLAMAV_SIGNATURES_CONTAINER_PATH",
  ]) {
    const value = env[name]?.trim() ?? "";
    if (value && !isAbsolute(value))
      issues.push(`${name}_ABSOLUTE_PATH_REQUIRED`);
  }
  const evidenceRoot = resolve(env.EVIDENCE_HOST_STORAGE_ROOT?.trim() || "/");
  if (["/", "/tmp", "/var", "/srv", "/opt"].includes(evidenceRoot)) {
    issues.push("EVIDENCE_HOST_STORAGE_ROOT_UNSAFE");
  }

  for (const name of [
    "EVIDENCE_BROKER_RUNTIME_UID_GID",
    "CLAMAV_RUNTIME_UID_GID",
  ]) {
    const value = env[name]?.trim() ?? "";
    if (
      value &&
      (!/^\d+:\d+$/.test(value) ||
        value.startsWith("0:") ||
        value.endsWith(":0"))
    ) {
      issues.push(`${name}_NON_ROOT_UID_GID_REQUIRED`);
    }
  }

  for (const name of [
    "WEB_MEMORY_LIMIT",
    "EVIDENCE_BROKER_MEMORY_LIMIT",
    "EVIDENCE_BROKER_TMPFS_SIZE",
    "CLAMAV_MEMORY_LIMIT",
    "CLAMAV_TMPFS_SIZE",
    "CLAMAV_RUN_TMPFS_SIZE",
    "CONTAINER_LOG_MAX_SIZE",
  ]) {
    const value = env[name]?.trim() ?? "";
    if (value && !/^\d+(?:\.\d+)?[kmgt]b?$/i.test(value)) {
      issues.push(`${name}_SIZE_INVALID`);
    }
  }

  for (const name of [
    "WEB_CPU_LIMIT",
    "EVIDENCE_BROKER_CPU_LIMIT",
    "CLAMAV_CPU_LIMIT",
  ]) {
    const value = Number(env[name]);
    if (env[name]?.trim() && (!Number.isFinite(value) || value <= 0)) {
      issues.push(`${name}_INVALID`);
    }
  }

  for (const name of [
    "WEB_PIDS_LIMIT",
    "EVIDENCE_BROKER_PIDS_LIMIT",
    "CLAMAV_PIDS_LIMIT",
    "CONTAINER_LOG_MAX_FILES",
  ]) {
    const value = Number(env[name]);
    if (env[name]?.trim() && (!Number.isInteger(value) || value < 1)) {
      issues.push(`${name}_INVALID`);
    }
  }

  if (
    env.CLAMAV_SIGNATURE_VOLUME_NAME?.trim() &&
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(env.CLAMAV_SIGNATURE_VOLUME_NAME)
  ) {
    issues.push("CLAMAV_SIGNATURE_VOLUME_NAME_INVALID");
  }
}

export function validateEvidenceHostingerContract({
  composeText,
  readmeText,
  systemdReadmeText,
  systemdServiceText,
  systemdTimerText,
  env = {},
}) {
  const issues = [];
  validateEnvironment(env, issues);

  const allText = [
    composeText,
    readmeText,
    systemdReadmeText,
    systemdServiceText,
    systemdTimerText,
  ].join("\n");
  if (/\b(?:aws|guardduty|eventbridge|s3)\b/i.test(allText)) {
    issues.push("CLOUD_PROVIDER_REFERENCE_FORBIDDEN");
  }

  const web = namedServiceBlock(composeText, "web");
  if (
    !hasAll(web, [
      "image: ${OGFI_WEB_IMAGE:",
      "build: !reset null",
      "depends_on: !override",
      "evidence-broker:",
      "ports: !reset []",
      "env_file: !override",
      "OGFI_PRODUCTION_ENV_FILE",
      "EVIDENCE_STORAGE_PROVIDER: hostinger-local",
      "EVIDENCE_BROKER_URL: http://evidence-broker:3010",
      "EVIDENCE_BROKER_SHARED_SECRET_FILE:",
      "evidence_broker_shared_secret",
      "cap_drop:",
      "no-new-privileges:true",
      "healthcheck:",
      "mem_limit:",
      "cpus:",
      "pids_limit:",
    ])
  ) {
    issues.push("WEB_BROKER_ISOLATION_OR_RESOURCE_CONTROL_INVALID");
  }
  if (
    /EVIDENCE_HOST_STORAGE_ROOT|evidence_broker_keys|EVIDENCE_BROKER_KEYS_FILE|\/var\/lib\/ogfi\/evidence/.test(
      web,
    ) ||
    /^    volumes:/m.test(web)
  ) {
    issues.push("WEB_HAS_EVIDENCE_STORAGE_OR_ENCRYPTION_ACCESS");
  }

  const broker = namedServiceBlock(composeText, "evidence-broker");
  if (
    !hasAll(broker, [
      "image: ${OGFI_WEB_IMAGE:",
      "container_name: ${COMPOSE_PROJECT_NAME:",
      '"flock"',
      '"--nonblock"',
      '"/var/lib/ogfi/evidence/.ogfi-evidence-broker.lock"',
      '"pnpm"',
      '"evidence:broker"',
      "source: ${EVIDENCE_HOST_STORAGE_ROOT:",
      "target: /var/lib/ogfi/evidence",
      "create_host_path: false",
      "evidence_broker_keys",
      "evidence_broker_shared_secret",
      "EVIDENCE_BROKER_CLAMD_HOST: clamd",
      "read_only: true",
      "tmpfs:",
      "user: ${EVIDENCE_BROKER_RUNTIME_UID_GID:",
      "cap_drop:",
      "no-new-privileges:true",
      "healthcheck:",
      "mem_limit:",
      "cpus:",
      "pids_limit:",
    ]) ||
    /env_file:|DATABASE_URL|DIRECT_DATABASE_URL/.test(broker)
  ) {
    issues.push("EVIDENCE_BROKER_BOUNDARY_INVALID");
  }
  if (!composeText.includes("name: ${COMPOSE_PROJECT_NAME:")) {
    issues.push("COMPOSE_PROJECT_NAME_NOT_ENVIRONMENT_SCOPED");
  }

  const clamd = namedServiceBlock(composeText, "clamd");
  if (
    !hasAll(clamd, [
      "image: ${CLAMAV_IMAGE:",
      "clamav_signatures:${CLAMAV_SIGNATURES_CONTAINER_PATH:",
      "read_only: true",
      "tmpfs:",
      "user: ${CLAMAV_RUNTIME_UID_GID:",
      "cap_drop:",
      "no-new-privileges:true",
      "healthcheck:",
      "${CLAMAV_HEALTHCHECK_CMD:",
      "mem_limit:",
      "cpus:",
      "pids_limit:",
    ]) ||
    /ports:|expose:|env_file:|DATABASE_URL|DIRECT_DATABASE_URL|EVIDENCE_HOST_STORAGE_ROOT|evidence_broker_|\/var\/lib\/ogfi\/evidence/.test(
      clamd,
    )
  ) {
    issues.push("CLAMD_ISOLATION_OR_RESOURCE_CONTROL_INVALID");
  }

  const caddy = namedServiceBlock(composeText, "caddy");
  if (!caddy || /evidence|EVIDENCE|\/var\/lib\/ogfi/.test(caddy)) {
    issues.push("CADDY_EVIDENCE_ISOLATION_INVALID");
  }

  for (const service of ["postgres", "minio", "redis", "worker"]) {
    const block = namedServiceBlock(composeText, service);
    if (!block.includes("profiles: [disabled-production]")) {
      issues.push(`PRODUCTION_${service.toUpperCase()}_NOT_DISABLED`);
    }
  }
  for (const service of ["web", "caddy", "evidence-broker", "clamd"]) {
    const block = namedServiceBlock(composeText, service);
    if (!block || /^    profiles:/m.test(block)) {
      issues.push(
        `PRODUCTION_${service.toUpperCase().replaceAll("-", "_")}_NOT_ACTIVE`,
      );
    }
  }
  if (
    !composeText.includes("evidence_private:\n    internal: true") ||
    !composeText.includes("clamav_signatures:")
  ) {
    issues.push("PRIVATE_NETWORK_OR_SIGNATURE_VOLUME_MISSING");
  }

  if (
    !hasAll(systemdServiceText, [
      "Type=oneshot",
      "User=ogfi-runtime",
      "TimeoutStartSec=45s",
      "flock --nonblock",
      "infra/hostinger/evidence/compose.production.yaml",
      "run --rm --no-deps web pnpm evidence:scan:reconcile",
      "NoNewPrivileges=true",
    ]) ||
    /redis|bullmq|infra\/aws/i.test(systemdServiceText)
  ) {
    issues.push("RECONCILIATION_ONESHOT_SERVICE_INVALID");
  }
  if (
    !hasAll(systemdTimerText, [
      "OnBootSec=60s",
      "OnUnitActiveSec=60s",
      "Persistent=true",
      "RandomizedDelaySec=5s",
    ])
  ) {
    issues.push("RECONCILIATION_TIMER_INVALID");
  }

  return [...new Set(issues)];
}

export function readEvidenceHostingerContract(
  paths = defaultEvidenceHostingerContractPaths,
) {
  return {
    composeText: readFileSync(paths.compose, "utf8"),
    readmeText: readFileSync(paths.readme, "utf8"),
    systemdReadmeText: readFileSync(paths.systemdReadme, "utf8"),
    systemdServiceText: readFileSync(paths.systemdService, "utf8"),
    systemdTimerText: readFileSync(paths.systemdTimer, "utf8"),
  };
}

function main() {
  const issues = validateEvidenceHostingerContract({
    ...readEvidenceHostingerContract(),
    env: process.env,
  });
  if (issues.length > 0) {
    for (const issue of issues) console.error(`FAIL | ${issue}`);
    console.error(
      `RESULT | FAIL | Controlled evidence Hostinger contract has ${issues.length} issue(s).`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("PASS | Web has broker-only evidence access");
  console.log(
    "PASS | Broker exclusively owns the evidence mount and encryption key",
  );
  console.log(
    "PASS | ClamAV is private, secret-free, bounded, and signature-backed",
  );
  console.log(
    "PASS | Deferred services are inactive and reconciliation is bounded",
  );
  console.log(
    "RESULT | PASS | Controlled evidence Hostinger infrastructure contract is statically valid.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
