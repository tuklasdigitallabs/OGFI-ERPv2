import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  EVIDENCE_RECOVERY_SCHEMA,
  canonicalJson,
  componentRecord,
  inventoryEvidenceRoot,
  sha256Text,
  validateStagedReceipt,
  verifyStagedRecoverySet,
  writeJsonExclusive,
} from "./evidence-recovery-contract.mjs";

const roots = [];
test.afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

test("inventories encrypted evidence objects and hashes key IDs without key material", async () => {
  const root = temporaryRoot();
  writeEvidenceObject(
    join(root, "objects", "aa", "one.evd"),
    "key-2026-a",
    "alpha",
  );
  writeEvidenceObject(
    join(root, "objects", "bb", "two.evd"),
    "key-2026-b",
    "beta",
  );

  const inventory = await inventoryEvidenceRoot(root);
  assert.equal(inventory.objectCount, 2);
  assert.deepEqual(inventory.keyIds, ["key-2026-a", "key-2026-b"]);
  assert.equal(
    inventory.keyIdInventorySha256,
    sha256Text(canonicalJson(["key-2026-a", "key-2026-b"])),
  );
  assert.ok(
    inventory.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256)),
  );
});

test("refuses plaintext or unexpected files in the evidence root", async () => {
  const root = temporaryRoot();
  writeFileSync(join(root, "plaintext.txt"), "must not be archived");
  await assert.rejects(
    inventoryEvidenceRoot(root),
    /unexpected non-\.evd file/,
  );
});

test("a staged receipt cannot claim independent recovery", () => {
  const receipt = baseReceipt([]);
  receipt.destination = {
    identity: "other-host",
    independentFailureDomain: true,
    readBackVerified: true,
  };
  assert.throws(
    () => validateStagedReceipt(receipt),
    /cannot claim an independent or verified destination/,
  );
});

test("verifies component read-back and rejects ciphertext tampering", async () => {
  const setDirectory = await makeStagedSet();
  await verifyStagedRecoverySet(setDirectory);
  writeFileSync(join(setDirectory, "database.dump.age"), "tampered");
  await assert.rejects(
    verifyStagedRecoverySet(setDirectory),
    /component read-back failed/,
  );
});

test("destination verification commits only TRANSFERRED_UNVERIFIED and never RECOVERABLE", async () => {
  const setDirectory = await makeStagedSet();
  const attestationFile = join(temporaryRoot(), "destination-attestation.json");
  writeFileSync(
    attestationFile,
    JSON.stringify({
      schema: EVIDENCE_RECOVERY_SCHEMA,
      sourceHostId: "hostinger-vps-primary",
      sourceFailureDomain: "hostinger-vps-primary-disk",
      destinationId: "independent-recovery-vault-1",
      destinationFailureDomain: "independent-recovery-domain-1",
      independentFailureDomain: true,
      readBackMethod: "destination-mounted-full-ciphertext-read",
      verifiedAtUtc: "2026-07-21T12:00:00.000Z",
      verifiedBy: "independent-recovery-reviewer",
      evidenceReference: "RECOVERY-READBACK-2026-07-21",
    }),
  );
  const result = spawnSync(
    process.execPath,
    [resolve("scripts/evidence-recovery-verify.mjs")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        EVIDENCE_RECOVERY_SET_DIR: setDirectory,
        EVIDENCE_RECOVERY_DESTINATION_ATTESTATION_FILE: attestationFile,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const committed = JSON.parse(
    readFileSync(join(setDirectory, "commit-receipt.json"), "utf8"),
  );
  assert.equal(committed.state, "TRANSFERRED_UNVERIFIED");
  assert.equal(committed.destination.identity, "independent-recovery-vault-1");
  assert.equal(committed.destination.readBackVerified, true);
  assert.equal(committed.restore.proven, false);
  assert.equal(committed.state === "RECOVERABLE", false);
});

test("destination verification rejects a same-failure-domain attestation", async () => {
  const setDirectory = await makeStagedSet();
  const attestationFile = join(temporaryRoot(), "destination-attestation.json");
  writeFileSync(
    attestationFile,
    JSON.stringify({
      schema: EVIDENCE_RECOVERY_SCHEMA,
      sourceHostId: "hostinger-vps-primary",
      sourceFailureDomain: "hostinger-vps-primary-disk",
      destinationId: "same-disk-directory",
      destinationFailureDomain: "hostinger-vps-primary-disk",
      independentFailureDomain: true,
      readBackMethod: "local-file-read",
      verifiedAtUtc: "2026-07-21T12:00:00.000Z",
      verifiedBy: "operator",
      evidenceReference: "local-only",
    }),
  );
  const result = spawnSync(
    process.execPath,
    [resolve("scripts/evidence-recovery-verify.mjs")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        EVIDENCE_RECOVERY_SET_DIR: setDirectory,
        EVIDENCE_RECOVERY_DESTINATION_ATTESTATION_FILE: attestationFile,
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /separate failure domain/);
});

test("systemd templates stay manual, exclude keyring credentials, and never claim RECOVERABLE", () => {
  const stageUnit = readFileSync(
    resolve("infra/systemd/evidence/ogfi-evidence-recovery-stage@.service"),
    "utf8",
  );
  const verifyUnit = readFileSync(
    resolve("infra/systemd/evidence/ogfi-evidence-recovery-verify@.service"),
    "utf8",
  );
  assert.match(stageUnit, /evidence-recovery-create\.mjs/);
  assert.match(stageUnit, /LoadCredential=database_url:/);
  assert.match(stageUnit, /LoadCredential=age_recipient:/);
  assert.doesNotMatch(stageUnit, /broker_keys|EVIDENCE_BROKER_KEYS/);
  assert.match(verifyUnit, /TRANSFERRED_UNVERIFIED/);
  assert.doesNotMatch(verifyUnit, /state.?=.?RECOVERABLE/);
});

async function makeStagedSet() {
  const setDirectory = temporaryRoot();
  for (const file of [
    "database.dump.age",
    "evidence.tar.age",
    "inventory.json.age",
  ]) {
    writeFileSync(join(setDirectory, file), `encrypted-${file}`);
  }
  const components = await Promise.all(
    ["database.dump.age", "evidence.tar.age", "inventory.json.age"].map(
      (file) => componentRecord(setDirectory, file),
    ),
  );
  writeJsonExclusive(
    join(setDirectory, "staged-receipt.json"),
    baseReceipt(components),
  );
  return setDirectory;
}

function baseReceipt(components) {
  return {
    schema: EVIDENCE_RECOVERY_SCHEMA,
    recoverySetId: randomUUID(),
    state: "STAGED",
    createdAtUtc: "2026-07-21T10:00:00.000Z",
    committedAtUtc: "2026-07-21T10:05:00.000Z",
    source: {
      hostId: "hostinger-vps-primary",
      failureDomain: "hostinger-vps-primary-disk",
    },
    databaseSnapshot: {
      capturedAtUtc: "2026-07-21T10:00:01.000Z",
      walLsn: "0/16B6C50",
      snapshotIdSha256: "a".repeat(64),
    },
    components,
    evidence: {
      objectCount: 2,
      totalBytes: 1024,
      inventorySha256: "b".repeat(64),
      keyIdInventorySha256: "c".repeat(64),
    },
    encryption: { format: "age", recipientSha256: "d".repeat(64) },
    destination: {
      identity: "UNSELECTED",
      independentFailureDomain: false,
      readBackVerified: false,
      readBackVerifiedAtUtc: null,
    },
    keyringIncluded: false,
    keyringEscrowRequired: true,
  };
}

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "ogfi-evidence-recovery-test-"));
  roots.push(root);
  return root;
}

function writeEvidenceObject(filePath, keyId, body) {
  mkdirSync(dirname(filePath), { recursive: true });
  const header = Buffer.from(
    JSON.stringify({
      format: "ogfi-evidence-aes-256-gcm-v1",
      keyId,
    }),
    "utf8",
  );
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(header.byteLength);
  writeFileSync(
    filePath,
    Buffer.concat([prefix, header, Buffer.from(body), Buffer.alloc(16)]),
  );
}
