import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUEST_ID_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const TERMINAL_PHASES = new Set(["VERIFIED", "ROLLED_BACK", "MAINTENANCE_REQUIRED"]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function assertOpaqueRequestId(requestId) {
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId) || requestId === "recovery") {
    throw new Error("OGFI_RELEASE_REQUEST_ID_INVALID");
  }
  return requestId;
}

export function validateReleaseRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("OGFI_RELEASE_REQUEST_INVALID");
  }
  const allowed = new Set(["schemaVersion", "requestId", "action", "candidate", "approvalDigest", "rollback"]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error("OGFI_RELEASE_REQUEST_FIELD_INVALID");
  }
  if (request.schemaVersion !== 1) throw new Error("OGFI_RELEASE_REQUEST_SCHEMA_INVALID");
  assertOpaqueRequestId(request.requestId);
  if (request.action !== "release" && request.action !== "rollback") throw new Error("OGFI_RELEASE_REQUEST_ACTION_INVALID");
  if (!SHA256_PATTERN.test(request.approvalDigest ?? "")) throw new Error("OGFI_RELEASE_APPROVAL_DIGEST_INVALID");
  const candidate = request.candidate;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("OGFI_RELEASE_CANDIDATE_INVALID");
  if (!COMMIT_PATTERN.test(candidate.commitSha ?? "") || !SHA256_PATTERN.test(candidate.artifactSha256 ?? "") || !SHA256_PATTERN.test(candidate.composeSha256 ?? "")) {
    throw new Error("OGFI_RELEASE_CANDIDATE_DIGEST_INVALID");
  }
  if (!Array.isArray(candidate.imageDigests) || candidate.imageDigests.length === 0 || candidate.imageDigests.some((digest) => typeof digest !== "string" || !/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(digest))) {
    throw new Error("OGFI_RELEASE_IMAGE_DIGEST_INVALID");
  }
  if (request.action === "rollback") {
    if (!request.rollback || typeof request.rollback !== "object" || !COMMIT_PATTERN.test(request.rollback.predecessorCommitSha ?? "") || !["compatible", "maintenance-required"].includes(request.rollback.compatibility)) {
      throw new Error("OGFI_RELEASE_ROLLBACK_INVALID");
    }
  } else if (request.rollback !== undefined) {
    throw new Error("OGFI_RELEASE_ROLLBACK_UNEXPECTED");
  }
  return request;
}

function readRegularJson(path, label) {
  const link = lstatSync(path);
  if (!link.isFile() || link.isSymbolicLink() || link.nlink !== 1) throw new Error(`${label}_UNSAFE`);
  const content = readFileSync(path, "utf8");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`${label}_JSON_INVALID`);
  }
}

function assertUnderRoot(path, root) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  if (dirname(absolutePath) !== absoluteRoot) throw new Error("OGFI_RELEASE_REQUEST_PATH_INVALID");
  return absolutePath;
}

function syncDirectory(directory) {
  const directoryDescriptor = openSync(directory, "r");
  try {
    fsyncSync(directoryDescriptor);
  } finally {
    closeSync(directoryDescriptor);
  }
}

function durableWrite(path, content, { syncParentDirectory = syncDirectory } = {}) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  const file = openSync(temporaryPath, "wx", 0o600);
  try {
    writeFileSync(file, content, "utf8");
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
  renameSync(temporaryPath, path);
  syncParentDirectory(directory);
}

export function appendJournal(stateRoot, event, options) {
  const record = { ...event, recordedAtUtc: new Date().toISOString() };
  const eventPath = join(stateRoot, "events.ndjson");
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const descriptor = openSync(eventPath, "a", 0o600);
  try {
    writeFileSync(descriptor, `${canonicalJson(record)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  durableWrite(join(stateRoot, "current.json"), `${canonicalJson(record)}\n`, options);
  return record;
}

export function readCurrentJournal(stateRoot) {
  return readRegularJson(join(stateRoot, "current.json"), "OGFI_RELEASE_JOURNAL");
}

export function admitRequest({ incomingRoot, approvedRoot, admittedRoot, stateRoot, requestId, journalOptions }) {
  assertOpaqueRequestId(requestId);
  const incomingPath = assertUnderRoot(join(incomingRoot, `${requestId}.json`), incomingRoot);
  const request = validateReleaseRequest(readRegularJson(incomingPath, "OGFI_RELEASE_REQUEST"));
  if (request.requestId !== requestId) throw new Error("OGFI_RELEASE_REQUEST_ID_MISMATCH");
  const approvalPath = assertUnderRoot(join(approvedRoot, `${requestId}.approval.json`), approvedRoot);
  const approval = readRegularJson(approvalPath, "OGFI_RELEASE_APPROVAL");
  if (sha256(canonicalJson(approval)) !== request.approvalDigest || approval.requestId !== requestId || approval.approved !== true) {
    throw new Error("OGFI_RELEASE_APPROVAL_INVALID");
  }
  const admittedPath = join(admittedRoot, `${requestId}.json`);
  mkdirSync(admittedRoot, { recursive: true, mode: 0o700 });
  let created = false;
  try {
    const descriptor = openSync(admittedPath, "wx", 0o600);
    created = true;
    try {
      const admission = {
        request,
        requestDigest: sha256(canonicalJson(request)),
        approvalDigest: request.approvalDigest,
      };
      writeFileSync(descriptor, `${canonicalJson(admission)}\n`, "utf8");
      fsyncSync(descriptor);
      appendJournal(stateRoot, { phase: "ADMITTED", requestId, requestDigest: admission.requestDigest, candidate: request.candidate, action: request.action }, journalOptions);
      return admission;
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("OGFI_RELEASE_REQUEST_REPLAYED");
    if (created) {
      try {
        unlinkSync(admittedPath);
      } catch {
        // A retained admission file remains fail-closed as a replay; recovery must reconcile it on the host.
      }
    }
    throw error;
  }
}

export function recoverIncompleteRelease({ stateRoot, enterMaintenance = () => {}, journalOptions }) {
  let current;
  try {
    current = readCurrentJournal(stateRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return { recovered: false, state: null };
    throw error;
  }
  if (TERMINAL_PHASES.has(current.phase)) return { recovered: false, state: current };
  enterMaintenance(current);
  const state = appendJournal(stateRoot, {
    phase: "MAINTENANCE_REQUIRED",
    requestId: current.requestId,
    recoveryOf: current.phase,
    reason: "INCOMPLETE_RELEASE_JOURNAL",
  }, journalOptions);
  return { recovered: true, state };
}

function cli() {
  const [mode, value] = process.argv.slice(2);
  const incomingRoot = process.env.OGFI_RELEASE_INCOMING_ROOT ?? "/var/spool/ogfi-release/incoming";
  const approvedRoot = process.env.OGFI_RELEASE_APPROVED_ROOT ?? "/var/spool/ogfi-release/approved";
  const admittedRoot = process.env.OGFI_RELEASE_ADMITTED_ROOT ?? "/var/spool/ogfi-release/admitted";
  const stateRoot = process.env.OGFI_RELEASE_STATE_ROOT ?? "/var/lib/ogfi/release-state";
  if (mode === "--recover" && value === undefined) {
    const outcome = recoverIncompleteRelease({ stateRoot });
    console.log(JSON.stringify({ result: outcome.recovered ? "MAINTENANCE_REQUIRED" : "NO_RECOVERY_NEEDED" }));
    return;
  }
  if (mode === "--request-id" && value) {
    const admitted = admitRequest({ incomingRoot, approvedRoot, admittedRoot, stateRoot, requestId: value });
    appendJournal(stateRoot, { phase: "MAINTENANCE_REQUIRED", requestId: value, reason: "DEC_0248_HELPERS_NOT_INSTALLED" });
    console.error(`Release ${admitted.request.requestId} admitted but cannot execute: DEC-0248 helpers are not installed.`);
    process.exitCode = 78;
    return;
  }
  console.error("Usage: ogfi-release-controller.mjs --recover | --request-id <opaque-id>");
  process.exitCode = 64;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
