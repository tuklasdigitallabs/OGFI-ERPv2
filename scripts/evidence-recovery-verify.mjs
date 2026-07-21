import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  COMMIT_RECEIPT_FILE,
  buildTransferCommitReceipt,
  validateDestinationAttestation,
  verifyStagedRecoverySet,
  writeJsonExclusive,
} from "./evidence-recovery-contract.mjs";

const setDirectory = requiredAbsolutePath("EVIDENCE_RECOVERY_SET_DIR");
const attestationFile = requiredAbsolutePath(
  "EVIDENCE_RECOVERY_DESTINATION_ATTESTATION_FILE",
);
const commitReceiptPath = join(setDirectory, COMMIT_RECEIPT_FILE);
if (existsSync(commitReceiptPath)) {
  throw new Error(
    "Destination commit receipt already exists. Recovery sets are append-closed and cannot be recommitted.",
  );
}

const verified = await verifyStagedRecoverySet(setDirectory);
const attestation = validateDestinationAttestation(
  JSON.parse(readFileSync(attestationFile, "utf8")),
  verified.receipt.source,
);
const commitReceipt = buildTransferCommitReceipt({
  staged: verified.receipt,
  stagedReceiptSha256: verified.stagedReceiptSha256,
  attestation,
  committedAtUtc: new Date().toISOString(),
});

// This is the last file written to the destination recovery-set directory.
// Its state remains TRANSFERRED_UNVERIFIED until a separate isolated paired
// restore proves database/object/key coverage within approved RPO/RTO.
writeJsonExclusive(commitReceiptPath, commitReceipt);
fsyncFile(commitReceiptPath);
fsyncDirectory(setDirectory);

console.log(`Recovery destination read-back verified: ${setDirectory}`);
console.log("Recovery state: TRANSFERRED_UNVERIFIED");
console.log(
  "Activation remains blocked: an isolated paired restore and separately escrowed broker keyring are still required.",
);

function requiredAbsolutePath(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path.`);
  return resolve(value);
}

function fsyncFile(filePath) {
  if (process.platform === "win32") return;
  const descriptor = openSync(filePath, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function fsyncDirectory(directory) {
  if (process.platform === "win32") return;
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
