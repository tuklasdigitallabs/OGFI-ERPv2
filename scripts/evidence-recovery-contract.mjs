import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

export const EVIDENCE_RECOVERY_SCHEMA = "ogfi-evidence-recovery-v1";
export const STAGED_RECEIPT_FILE = "staged-receipt.json";
export const COMMIT_RECEIPT_FILE = "commit-receipt.json";
export const RECOVERY_COMPONENT_FILES = Object.freeze([
  "database.dump.age",
  "evidence.tar.age",
  "inventory.json.age",
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const WAL_LSN_PATTERN = /^[0-9A-F]+\/[0-9A-F]+$/i;

export async function sha256File(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function canonicalJson(value) {
  return JSON.stringify(sortObject(value));
}

export function parseEvidenceHeader(filePath) {
  const descriptor = readFileSync(filePath);
  if (descriptor.byteLength < 5) {
    throw new Error(`Evidence object is truncated: ${basename(filePath)}`);
  }
  const headerBytes = descriptor.readUInt32BE(0);
  if (
    headerBytes < 2 ||
    headerBytes > 16_384 ||
    descriptor.byteLength < 4 + headerBytes + 16
  ) {
    throw new Error(
      `Evidence object has an invalid encrypted header: ${basename(filePath)}`,
    );
  }
  let header;
  try {
    header = JSON.parse(
      descriptor.subarray(4, 4 + headerBytes).toString("utf8"),
    );
  } catch {
    throw new Error(
      `Evidence object has unreadable encrypted metadata: ${basename(filePath)}`,
    );
  }
  if (
    header?.format !== "ogfi-evidence-aes-256-gcm-v1" ||
    typeof header.keyId !== "string" ||
    header.keyId.trim().length < 1
  ) {
    throw new Error(
      `Evidence object has unsupported encrypted metadata: ${basename(filePath)}`,
    );
  }
  return { keyId: header.keyId.trim(), format: header.format };
}

export async function inventoryEvidenceRoot(evidenceRoot) {
  const root = resolve(evidenceRoot);
  const rootInfo = lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(
      "Evidence recovery root must be a real directory, not a symbolic link.",
    );
  }
  const files = [];
  walk(root, root, files);
  files.sort((left, right) => left.path.localeCompare(right.path));

  const keyIds = [...new Set(files.map((file) => file.keyId))].sort();
  return {
    files,
    objectCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
    keyIds,
    keyIdInventorySha256: sha256Text(canonicalJson(keyIds)),
    inventorySha256: sha256Text(canonicalJson(files)),
  };
}

function walk(root, directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    const info = lstatSync(target);
    if (info.isSymbolicLink()) {
      throw new Error(
        `Evidence recovery refuses symbolic links: ${safeRelative(root, target)}`,
      );
    }
    if (entry.isDirectory()) {
      walk(root, target, files);
      continue;
    }
    if (!entry.isFile() || !info.isFile()) {
      throw new Error(
        `Evidence recovery refuses non-regular entries: ${safeRelative(root, target)}`,
      );
    }
    if (info.nlink !== 1) {
      throw new Error(
        `Evidence recovery refuses hard-linked objects: ${safeRelative(root, target)}`,
      );
    }
    const objectPath = safeRelative(root, target);
    if (!objectPath.endsWith(".evd")) {
      throw new Error(
        `Evidence recovery found an unexpected non-.evd file: ${objectPath}`,
      );
    }
    const header = parseEvidenceHeader(target);
    files.push({
      path: objectPath,
      sizeBytes: info.size,
      sha256: hashFileSync(target),
      keyId: header.keyId,
    });
  }
}

function safeRelative(root, target) {
  const value = relative(root, target).split(sep).join("/");
  if (!value || value === ".." || value.startsWith("../")) {
    throw new Error("Evidence recovery path escaped the configured root.");
  }
  return value;
}

function hashFileSync(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export async function componentRecord(setDirectory, file) {
  const filePath = join(setDirectory, file);
  const info = lstatSync(filePath);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size < 1
  ) {
    throw new Error(
      `Recovery component is not a safe non-empty regular file: ${file}`,
    );
  }
  return { file, sizeBytes: info.size, sha256: await sha256File(filePath) };
}

export function validateStagedReceipt(receipt) {
  if (
    receipt?.schema !== EVIDENCE_RECOVERY_SCHEMA ||
    receipt?.state !== "STAGED"
  ) {
    throw new Error("Recovery set does not contain a valid STAGED receipt.");
  }
  requireNonEmpty(receipt.recoverySetId, "recoverySetId");
  requireNonEmpty(receipt.createdAtUtc, "createdAtUtc");
  requireNonEmpty(receipt.committedAtUtc, "committedAtUtc");
  requireNonEmpty(receipt.source?.hostId, "source.hostId");
  requireNonEmpty(receipt.source?.failureDomain, "source.failureDomain");
  requireNonEmpty(
    receipt.databaseSnapshot?.capturedAtUtc,
    "databaseSnapshot.capturedAtUtc",
  );
  if (!WAL_LSN_PATTERN.test(receipt.databaseSnapshot?.walLsn ?? "")) {
    throw new Error("Recovery receipt has an invalid PostgreSQL WAL LSN.");
  }
  if (!SHA256_PATTERN.test(receipt.databaseSnapshot?.snapshotIdSha256 ?? "")) {
    throw new Error("Recovery receipt has an invalid exported-snapshot hash.");
  }
  if (
    receipt.keyringIncluded !== false ||
    receipt.keyringEscrowRequired !== true
  ) {
    throw new Error(
      "Recovery receipt must exclude the broker keyring and require separate escrow.",
    );
  }
  if (
    receipt.destination?.identity !== "UNSELECTED" ||
    receipt.destination?.independentFailureDomain !== false ||
    receipt.destination?.readBackVerified !== false
  ) {
    throw new Error(
      "A STAGED receipt cannot claim an independent or verified destination.",
    );
  }
  if (
    !Array.isArray(receipt.components) ||
    receipt.components.length !== RECOVERY_COMPONENT_FILES.length
  ) {
    throw new Error("Recovery receipt has an invalid component inventory.");
  }
  const names = receipt.components.map((component) => component.file).sort();
  if (
    canonicalJson(names) !== canonicalJson([...RECOVERY_COMPONENT_FILES].sort())
  ) {
    throw new Error(
      "Recovery receipt component names do not match the required encrypted payload.",
    );
  }
  for (const component of receipt.components) validateComponent(component);
  if (
    !Number.isSafeInteger(receipt.evidence?.objectCount) ||
    receipt.evidence.objectCount < 0
  ) {
    throw new Error("Recovery receipt has an invalid evidence object count.");
  }
  if (
    !Number.isSafeInteger(receipt.evidence?.totalBytes) ||
    receipt.evidence.totalBytes < 0
  ) {
    throw new Error("Recovery receipt has an invalid evidence byte count.");
  }
  if (
    !SHA256_PATTERN.test(receipt.evidence?.inventorySha256 ?? "") ||
    !SHA256_PATTERN.test(receipt.evidence?.keyIdInventorySha256 ?? "")
  ) {
    throw new Error("Recovery receipt has an invalid evidence inventory hash.");
  }
  if (
    receipt.encryption?.format !== "age" ||
    !SHA256_PATTERN.test(receipt.encryption?.recipientSha256 ?? "")
  ) {
    throw new Error("Recovery receipt has invalid encryption metadata.");
  }
  return receipt;
}

export async function verifyStagedRecoverySet(setDirectory) {
  const root = resolve(setDirectory);
  const receiptPath = join(root, STAGED_RECEIPT_FILE);
  if (!existsSync(receiptPath))
    throw new Error("Staged recovery receipt is missing.");
  const receipt = validateStagedReceipt(
    JSON.parse(readFileSync(receiptPath, "utf8")),
  );
  const allowed = new Set([
    ...RECOVERY_COMPONENT_FILES,
    STAGED_RECEIPT_FILE,
    COMMIT_RECEIPT_FILE,
  ]);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !allowed.has(entry.name)) {
      throw new Error(
        `Recovery set contains an unexpected entry: ${entry.name}`,
      );
    }
  }
  for (const expected of receipt.components) {
    const actual = await componentRecord(root, expected.file);
    if (
      actual.sizeBytes !== expected.sizeBytes ||
      actual.sha256 !== expected.sha256
    ) {
      throw new Error(`Recovery component read-back failed: ${expected.file}`);
    }
  }
  return { root, receipt, stagedReceiptSha256: await sha256File(receiptPath) };
}

export function validateDestinationAttestation(attestation, source) {
  if (attestation?.schema !== EVIDENCE_RECOVERY_SCHEMA) {
    throw new Error("Destination attestation schema is invalid.");
  }
  for (const field of [
    "destinationId",
    "destinationFailureDomain",
    "sourceFailureDomain",
    "readBackMethod",
    "verifiedAtUtc",
    "verifiedBy",
    "evidenceReference",
  ])
    requireNonEmpty(attestation[field], field);
  if (attestation.sourceHostId !== source.hostId) {
    throw new Error(
      "Destination attestation does not identify the source host in the staged receipt.",
    );
  }
  if (attestation.sourceFailureDomain !== source.failureDomain) {
    throw new Error(
      "Destination attestation does not identify the source failure domain in the staged receipt.",
    );
  }
  if (
    attestation.independentFailureDomain !== true ||
    attestation.destinationId === source.hostId ||
    attestation.destinationFailureDomain === attestation.sourceFailureDomain
  ) {
    throw new Error(
      "Destination attestation does not establish a separate failure domain.",
    );
  }
  return attestation;
}

export function buildTransferCommitReceipt({
  staged,
  stagedReceiptSha256,
  attestation,
  committedAtUtc,
}) {
  return {
    schema: EVIDENCE_RECOVERY_SCHEMA,
    recoverySetId: staged.recoverySetId,
    state: "TRANSFERRED_UNVERIFIED",
    createdAtUtc: staged.createdAtUtc,
    committedAtUtc,
    source: staged.source,
    databaseSnapshot: staged.databaseSnapshot,
    components: staged.components,
    evidence: staged.evidence,
    encryption: staged.encryption,
    stagedReceiptSha256,
    destination: {
      identity: attestation.destinationId,
      failureDomain: attestation.destinationFailureDomain,
      independentFailureDomain: true,
      readBackVerified: true,
      readBackVerifiedAtUtc: attestation.verifiedAtUtc,
      readBackMethod: attestation.readBackMethod,
      verifiedBy: attestation.verifiedBy,
      evidenceReference: attestation.evidenceReference,
    },
    keyringIncluded: false,
    keyringEscrowRequired: true,
    restore: {
      proven: false,
      status: "REQUIRED_BEFORE_RECOVERABLE",
    },
  };
}

export function writeJsonExclusive(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function validateComponent(component) {
  requireNonEmpty(component?.file, "component.file");
  if (!Number.isSafeInteger(component.sizeBytes) || component.sizeBytes < 1) {
    throw new Error(
      `Recovery component has an invalid size: ${component.file}`,
    );
  }
  if (!SHA256_PATTERN.test(component.sha256 ?? "")) {
    throw new Error(
      `Recovery component has an invalid checksum: ${component.file}`,
    );
  }
}

function requireNonEmpty(value, field) {
  if (typeof value !== "string" || value.trim().length < 1) {
    throw new Error(`Recovery metadata is missing ${field}.`);
  }
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortObject(child)]),
    );
  }
  return value;
}
