import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  readEvidenceHostingerContract,
  validateEvidenceHostingerContract,
} from "./evidence-hostinger-contract.mjs";

const digest = `sha256:${"a".repeat(64)}`;

function fixtureEnvironment() {
  return {
    COMPOSE_PROJECT_NAME: "ogfi-erp-production",
    OGFI_WEB_IMAGE: `registry.example.test/ogfi/web@${digest}`,
    OGFI_PRODUCTION_ENV_FILE: "/etc/ogfi/production.env",
    CLAMAV_IMAGE: `registry.example.test/security/clamav@${digest}`,
    EVIDENCE_HOST_STORAGE_ROOT: "/srv/ogfi/production/evidence",
    EVIDENCE_BROKER_KEYS_FILE_HOST: "/etc/ogfi/secrets/evidence-keys",
    EVIDENCE_BROKER_SHARED_SECRET_FILE_HOST: "/etc/ogfi/secrets/broker-auth",
    EVIDENCE_BROKER_RUNTIME_UID_GID: "10001:10001",
    CLAMAV_RUNTIME_UID_GID: "10002:10002",
    CLAMAV_SIGNATURES_CONTAINER_PATH: "/var/lib/clamav",
    CLAMAV_SIGNATURE_VOLUME_NAME: "ogfi_prod_clamav_signatures",
    CLAMAV_HEALTHCHECK_CMD: "clamd-and-signature-healthcheck",
    WEB_MEMORY_LIMIT: "2g",
    WEB_CPU_LIMIT: "1.5",
    WEB_PIDS_LIMIT: "256",
    EVIDENCE_BROKER_MEMORY_LIMIT: "1g",
    EVIDENCE_BROKER_CPU_LIMIT: "1",
    EVIDENCE_BROKER_PIDS_LIMIT: "128",
    EVIDENCE_BROKER_TMPFS_SIZE: "128m",
    CLAMAV_MEMORY_LIMIT: "3g",
    CLAMAV_CPU_LIMIT: "1.5",
    CLAMAV_PIDS_LIMIT: "128",
    CLAMAV_TMPFS_SIZE: "256m",
    CLAMAV_RUN_TMPFS_SIZE: "32m",
    CONTAINER_LOG_MAX_SIZE: "10m",
    CONTAINER_LOG_MAX_FILES: "5",
  };
}

function baseline() {
  return {
    ...readEvidenceHostingerContract(),
    env: fixtureEnvironment(),
  };
}

test("accepts the isolated Hostinger evidence contract", () => {
  assert.deepEqual(validateEvidenceHostingerContract(baseline()), []);
  const dockerfile = readFileSync(
    new URL("../infra/docker/Dockerfile.web.example", import.meta.url),
    "utf8",
  );
  assert.match(dockerfile, /apk add --no-cache util-linux/);
});

test("rejects an unsafe relative evidence root and mutable image tags", () => {
  const contract = baseline();
  contract.env.EVIDENCE_HOST_STORAGE_ROOT = "evidence";
  contract.env.CLAMAV_IMAGE = "clamav:latest";
  const issues = validateEvidenceHostingerContract(contract);
  assert.ok(
    issues.includes("EVIDENCE_HOST_STORAGE_ROOT_ABSOLUTE_PATH_REQUIRED"),
  );
  assert.ok(issues.includes("CLAMAV_IMAGE_IMMUTABLE_DIGEST_REQUIRED"));
});

test("requires an isolated project name and a non-scalable broker", () => {
  const contract = baseline();
  contract.env.COMPOSE_PROJECT_NAME = "ogfi-erp";
  contract.composeText = contract.composeText.replace(
    "    container_name: ${COMPOSE_PROJECT_NAME:?Set the isolated Compose project name}-evidence-broker\n",
    "",
  );
  const issues = validateEvidenceHostingerContract(contract);
  assert.ok(
    issues.includes("COMPOSE_PROJECT_NAME_ENVIRONMENT_ISOLATION_REQUIRED"),
  );
  assert.ok(issues.includes("EVIDENCE_BROKER_BOUNDARY_INVALID"));
});

test("rejects evidence storage or encryption access in web", () => {
  const contract = baseline();
  contract.composeText = contract.composeText.replace(
    "    secrets:\n      - evidence_broker_shared_secret",
    "    secrets:\n      - evidence_broker_shared_secret\n      - evidence_broker_keys",
  );
  assert.ok(
    validateEvidenceHostingerContract(contract).includes(
      "WEB_HAS_EVIDENCE_STORAGE_OR_ENCRYPTION_ACCESS",
    ),
  );
});

test("rejects database credentials in the minimal broker", () => {
  const contract = baseline();
  contract.composeText = contract.composeText.replace(
    "      EVIDENCE_BROKER_CLAMD_HOST: clamd",
    "      DATABASE_URL: forbidden\n      EVIDENCE_BROKER_CLAMD_HOST: clamd",
  );
  assert.ok(
    validateEvidenceHostingerContract(contract).includes(
      "EVIDENCE_BROKER_BOUNDARY_INVALID",
    ),
  );
});

test("rejects public or evidence-mounted ClamAV", () => {
  const contract = baseline();
  contract.composeText = contract.composeText.replace(
    "  clamd:\n    image:",
    '  clamd:\n    ports: ["3310:3310"]\n    image:',
  );
  assert.ok(
    validateEvidenceHostingerContract(contract).includes(
      "CLAMD_ISOLATION_OR_RESOURCE_CONTROL_INVALID",
    ),
  );
});

test("rejects an active production MinIO service", () => {
  const contract = baseline();
  contract.composeText = contract.composeText.replace(
    "  minio:\n    profiles: [disabled-production]",
    "  minio:\n    restart: unless-stopped",
  );
  assert.ok(
    validateEvidenceHostingerContract(contract).includes(
      "PRODUCTION_MINIO_NOT_DISABLED",
    ),
  );
});

test("rejects provider remnants and a slow reconciliation cadence", () => {
  const contract = baseline();
  contract.systemdReadmeText += "\nGuardDuty\n";
  contract.systemdTimerText = contract.systemdTimerText.replace(
    "OnUnitActiveSec=60s",
    "OnUnitActiveSec=5min",
  );
  const issues = validateEvidenceHostingerContract(contract);
  assert.ok(issues.includes("CLOUD_PROVIDER_REFERENCE_FORBIDDEN"));
  assert.ok(issues.includes("RECONCILIATION_TIMER_INVALID"));
});
