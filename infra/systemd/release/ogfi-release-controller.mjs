import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
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
const IMAGE_PATTERN = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;
const TERMINAL_PHASES = new Set(["VERIFIED", "ROLLED_BACK", "MAINTENANCE_REQUIRED"]);
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const JOURNAL_SCHEMA_VERSION = 1;
const JOURNAL_TRANSITIONS = new Map([
  [null, new Set(["ADMITTED"])],
  ["ADMITTED", new Set(["ARTIFACT_VERIFIED", "MAINTENANCE_REQUIRED"])],
  ["ARTIFACT_VERIFIED", new Set(["SNAPSHOT_VERIFIED", "MAINTENANCE_REQUIRED"])],
  ["SNAPSHOT_VERIFIED", new Set(["MIGRATION_STARTED", "MAINTENANCE_REQUIRED"])],
  ["MIGRATION_STARTED", new Set(["MIGRATION_VERIFIED", "MAINTENANCE_REQUIRED"])],
  ["MIGRATION_VERIFIED", new Set(["CUTOVER_STARTED", "MAINTENANCE_REQUIRED"])],
  ["CUTOVER_STARTED", new Set(["SERVED_IDENTITY_VERIFIED", "MAINTENANCE_REQUIRED"])],
  ["SERVED_IDENTITY_VERIFIED", new Set(["SMOKE_VERIFIED", "MAINTENANCE_REQUIRED"])],
  ["SMOKE_VERIFIED", new Set(["VERIFIED", "MAINTENANCE_REQUIRED"])],
]);

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
  if (request.schemaVersion !== 2) throw new Error("OGFI_RELEASE_REQUEST_SCHEMA_INVALID");
  assertOpaqueRequestId(request.requestId);
  if (request.action !== "release" && request.action !== "rollback") throw new Error("OGFI_RELEASE_REQUEST_ACTION_INVALID");
  if (!SHA256_PATTERN.test(request.approvalDigest ?? "")) throw new Error("OGFI_RELEASE_APPROVAL_DIGEST_INVALID");
  const candidate = request.candidate;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("OGFI_RELEASE_CANDIDATE_INVALID");
  const candidateAllowed = new Set(["commitSha", "artifactSha256", "composeSha256", "identityManifestSha256", "artifactManifestSha256", "serviceImages"]);
  if (Object.keys(candidate).some((key) => !candidateAllowed.has(key))) throw new Error("OGFI_RELEASE_CANDIDATE_FIELD_INVALID");
  if (!COMMIT_PATTERN.test(candidate.commitSha ?? "") || !SHA256_PATTERN.test(candidate.artifactSha256 ?? "") || !SHA256_PATTERN.test(candidate.composeSha256 ?? "") || !SHA256_PATTERN.test(candidate.identityManifestSha256 ?? "") || !SHA256_PATTERN.test(candidate.artifactManifestSha256 ?? "")) {
    throw new Error("OGFI_RELEASE_CANDIDATE_DIGEST_INVALID");
  }
  if (!candidate.serviceImages || typeof candidate.serviceImages !== "object" || Array.isArray(candidate.serviceImages) || Object.keys(candidate.serviceImages).length === 0 || Object.keys(candidate.serviceImages).some((service) => !/^[a-z][a-z0-9_-]{0,63}$/.test(service)) || Object.values(candidate.serviceImages).some((digest) => typeof digest !== "string" || !IMAGE_PATTERN.test(digest))) {
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

export function validateArtifactManifest(manifest, candidate) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("OGFI_RELEASE_ARTIFACT_MANIFEST_INVALID");
  const allowed = new Set(["schemaVersion", "candidate", "serviceImages"]);
  if (Object.keys(manifest).some((key) => !allowed.has(key)) || manifest.schemaVersion !== 1) throw new Error("OGFI_RELEASE_ARTIFACT_MANIFEST_SCHEMA_INVALID");
  const expected = {
    commitSha: candidate.commitSha,
    artifactSha256: candidate.artifactSha256,
    composeSha256: candidate.composeSha256,
    identityManifestSha256: candidate.identityManifestSha256,
  };
  if (canonicalJson(manifest.candidate) !== canonicalJson(expected) || canonicalJson(manifest.serviceImages) !== canonicalJson(candidate.serviceImages)) {
    throw new Error("OGFI_RELEASE_ARTIFACT_MANIFEST_BINDING_INVALID");
  }
  return manifest;
}

export function requestApprovalBinding(request) {
  return {
    schemaVersion: request.schemaVersion,
    requestId: request.requestId,
    action: request.action,
    candidate: request.candidate,
    ...(request.rollback ? { rollback: request.rollback } : {}),
  };
}

function readRegularJson(path, label, { maxBytes = MAX_REQUEST_BYTES } = {}) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes || (stat.mode & 0o022) !== 0) {
      throw new Error(`${label}_UNSAFE`);
    }
    const content = readFileSync(descriptor, "utf8");
    try {
      return JSON.parse(content);
    } catch {
      throw new Error(`${label}_JSON_INVALID`);
    }
  } catch (error) {
    if (error?.code === "ELOOP") throw new Error(`${label}_UNSAFE`);
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
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
  const history = readJournalHistory(stateRoot);
  const previous = history.at(-1) ?? null;
  const allowed = JOURNAL_TRANSITIONS.get(previous?.phase ?? null);
  if (!allowed?.has(event.phase) || (previous && previous.requestId !== event.requestId)) {
    throw new Error("OGFI_RELEASE_JOURNAL_TRANSITION_INVALID");
  }
  const record = {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    sequence: (previous?.sequence ?? 0) + 1,
    previousEventSha256: previous?.eventSha256 ?? null,
    ...event,
    recordedAtUtc: new Date().toISOString(),
  };
  record.eventSha256 = sha256(canonicalJson(journalRecordPayload(record)));
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

function journalRecordPayload(record) {
  const { eventSha256, ...payload } = record;
  return payload;
}

export function readJournalHistory(stateRoot) {
  const eventPath = join(stateRoot, "events.ndjson");
  let content;
  try {
    content = readFileSync(eventPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      try {
        readCurrentJournal(stateRoot);
      } catch (currentError) {
        if (currentError?.code === "ENOENT") return [];
        throw currentError;
      }
      throw new Error("OGFI_RELEASE_JOURNAL_CURRENT_MISMATCH");
    }
    throw error;
  }
  if (!content || !content.endsWith("\n")) throw new Error("OGFI_RELEASE_JOURNAL_HISTORY_INVALID");
  const records = content.slice(0, -1).split("\n").map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error("OGFI_RELEASE_JOURNAL_HISTORY_INVALID");
    }
  });
  let previous = null;
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record) || record.schemaVersion !== JOURNAL_SCHEMA_VERSION || !Number.isSafeInteger(record.sequence) || record.sequence !== (previous?.sequence ?? 0) + 1 || record.previousEventSha256 !== (previous?.eventSha256 ?? null) || typeof record.eventSha256 !== "string" || !SHA256_PATTERN.test(record.eventSha256) || record.eventSha256 !== sha256(canonicalJson(journalRecordPayload(record))) || typeof record.requestId !== "string" || !REQUEST_ID_PATTERN.test(record.requestId) || !JOURNAL_TRANSITIONS.get(previous?.phase ?? null)?.has(record.phase) || (previous && previous.requestId !== record.requestId)) {
      throw new Error("OGFI_RELEASE_JOURNAL_HISTORY_INVALID");
    }
    previous = record;
  }
  if (records.length > 0) {
    const current = readCurrentJournal(stateRoot);
    if (canonicalJson(current) !== canonicalJson(records.at(-1))) throw new Error("OGFI_RELEASE_JOURNAL_CURRENT_MISMATCH");
  }
  return records;
}

function readArtifactManifest({ artifactManifestRoot, candidate }) {
  if (!artifactManifestRoot) throw new Error("OGFI_RELEASE_ARTIFACT_MANIFEST_ROOT_REQUIRED");
  const manifestPath = assertUnderRoot(join(artifactManifestRoot, `${candidate.artifactManifestSha256}.json`), artifactManifestRoot);
  const manifest = readRegularJson(manifestPath, "OGFI_RELEASE_ARTIFACT_MANIFEST", { maxBytes: MAX_MANIFEST_BYTES });
  if (sha256(canonicalJson(manifest)) !== candidate.artifactManifestSha256) throw new Error("OGFI_RELEASE_ARTIFACT_MANIFEST_DIGEST_INVALID");
  return validateArtifactManifest(manifest, candidate);
}

export function admitRequest({ incomingRoot, approvedRoot, admittedRoot, stateRoot, artifactManifestRoot, requestId, journalOptions }) {
  assertOpaqueRequestId(requestId);
  const incomingPath = assertUnderRoot(join(incomingRoot, `${requestId}.json`), incomingRoot);
  const request = validateReleaseRequest(readRegularJson(incomingPath, "OGFI_RELEASE_REQUEST"));
  if (request.requestId !== requestId) throw new Error("OGFI_RELEASE_REQUEST_ID_MISMATCH");
  const approvalPath = assertUnderRoot(join(approvedRoot, `${requestId}.approval.json`), approvedRoot);
  const approval = readRegularJson(approvalPath, "OGFI_RELEASE_APPROVAL");
  const binding = requestApprovalBinding(request);
  const now = Date.now();
  if (
    sha256(canonicalJson(approval)) !== request.approvalDigest ||
    approval.schemaVersion !== 1 || approval.requestId !== requestId || approval.approved !== true ||
    approval.action !== request.action || approval.canonicalRequestSha256 !== sha256(canonicalJson(binding)) ||
    canonicalJson(approval.candidate) !== canonicalJson(request.candidate) ||
    !Number.isFinite(Date.parse(approval.expiresAtUtc ?? "")) || Date.parse(approval.expiresAtUtc) <= now ||
    approval.revoked === true
  ) {
    throw new Error("OGFI_RELEASE_APPROVAL_INVALID");
  }
  const artifactManifest = readArtifactManifest({ artifactManifestRoot, candidate: request.candidate });
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
        artifactManifest,
      };
      writeFileSync(descriptor, `${canonicalJson(admission)}\n`, "utf8");
      fsyncSync(descriptor);
      appendJournal(stateRoot, { phase: "ADMITTED", requestId, requestDigest: admission.requestDigest, candidate: request.candidate, artifactManifestSha256: request.candidate.artifactManifestSha256, action: request.action }, journalOptions);
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
    const history = readJournalHistory(stateRoot);
    current = history.at(-1) ?? null;
  } catch (error) {
    if (error?.code === "ENOENT") return { recovered: false, state: null };
    enterMaintenance({ phase: "JOURNAL_AMBIGUOUS", reason: error.message });
    const state = { phase: "MAINTENANCE_REQUIRED", reason: "JOURNAL_AMBIGUOUS", recordedAtUtc: new Date().toISOString() };
    durableWrite(join(stateRoot, "ambiguous-maintenance.json"), `${canonicalJson(state)}\n`, journalOptions);
    return { recovered: true, state };
  }
  if (!current) return { recovered: false, state: null };
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
  const artifactManifestRoot = process.env.OGFI_RELEASE_ARTIFACT_MANIFEST_ROOT ?? "/opt/ogfi/artifacts/manifests";
  const stateRoot = process.env.OGFI_RELEASE_STATE_ROOT ?? "/var/lib/ogfi/release-state";
  if (mode === "--recover" && value === undefined) {
    const outcome = recoverIncompleteRelease({ stateRoot });
    console.log(JSON.stringify({ result: outcome.recovered ? "MAINTENANCE_REQUIRED" : "NO_RECOVERY_NEEDED" }));
    return;
  }
  if (mode === "--request-id" && value) {
    const admitted = admitRequest({ incomingRoot, approvedRoot, admittedRoot, stateRoot, artifactManifestRoot, requestId: value });
    appendJournal(stateRoot, { phase: "MAINTENANCE_REQUIRED", requestId: value, reason: "DEC_0248_HELPERS_NOT_INSTALLED" });
    console.error(`Release ${admitted.request.requestId} admitted but cannot execute: DEC-0248 helpers are not installed.`);
    process.exitCode = 78;
    return;
  }
  console.error("Usage: ogfi-release-controller.mjs --recover | --request-id <opaque-id>");
  process.exitCode = 64;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
