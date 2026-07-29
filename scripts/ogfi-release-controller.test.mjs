import assert from "node:assert/strict";
import { linkSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  admitRequest,
  appendJournal,
  canonicalJson,
  requestApprovalBinding,
  recoverIncompleteRelease,
  sha256,
  validateReleaseRequest,
} from "../infra/systemd/release/ogfi-release-controller.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ogfi-release-controller-"));
  const incomingRoot = join(root, "incoming");
  const approvedRoot = join(root, "approved");
  const admittedRoot = join(root, "admitted");
  const stateRoot = join(root, "state");
  const artifactManifestRoot = join(root, "manifests");
  mkdirSync(incomingRoot);
  mkdirSync(approvedRoot);
  mkdirSync(artifactManifestRoot);
  return { incomingRoot, approvedRoot, admittedRoot, stateRoot, artifactManifestRoot, journalOptions: { syncParentDirectory: () => {} } };
}

function requestFor(requestId) {
  const candidate = {
    commitSha: "a".repeat(40),
    artifactSha256: "b".repeat(64),
    composeSha256: "c".repeat(64),
    identityManifestSha256: "d".repeat(64),
    serviceImages: {
      caddy: `ogfi/caddy@sha256:${"e".repeat(64)}`,
      web: `ogfi/web@sha256:${"f".repeat(64)}`,
    },
  };
  const manifest = {
    schemaVersion: 1,
    candidate: {
      commitSha: candidate.commitSha,
      artifactSha256: candidate.artifactSha256,
      composeSha256: candidate.composeSha256,
      identityManifestSha256: candidate.identityManifestSha256,
    },
    serviceImages: candidate.serviceImages,
  };
  candidate.artifactManifestSha256 = sha256(canonicalJson(manifest));
  const request = {
    schemaVersion: 2,
    requestId,
    action: "release",
    candidate,
  };
  const approval = {
    schemaVersion: 1,
    requestId,
    action: request.action,
    candidate: request.candidate,
    canonicalRequestSha256: sha256(canonicalJson(requestApprovalBinding(request))),
    approved: true,
    approver: "root-review",
    expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
  };
  return { approval, manifest, request: { ...request, approvalDigest: sha256(canonicalJson(approval)) } };
}

function writeRequest(paths, requestId) {
  const { request, approval, manifest } = requestFor(requestId);
  writeFileSync(join(paths.incomingRoot, `${requestId}.json`), `${JSON.stringify(request)}\n`, { mode: 0o600 });
  writeFileSync(join(paths.approvedRoot, `${requestId}.approval.json`), `${JSON.stringify(approval)}\n`, { mode: 0o600 });
  writeFileSync(join(paths.artifactManifestRoot, `${request.candidate.artifactManifestSha256}.json`), `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
}

test("admission binds an approved opaque request once and journals it durably", () => {
  const paths = fixture();
  const requestId = "release-20260728-0001";
  writeRequest(paths, requestId);
  const admitted = admitRequest({ ...paths, requestId });
  assert.equal(admitted.request.requestId, requestId);
  assert.match(readFileSync(join(paths.admittedRoot, `${requestId}.json`), "utf8"), /requestDigest/);
  assert.match(readFileSync(join(paths.stateRoot, "events.ndjson"), "utf8"), /"phase":"ADMITTED"/);
  assert.throws(() => admitRequest({ ...paths, requestId }), /OGFI_RELEASE_REQUEST_REPLAYED/);
});

test("admission rejects unsafe request files and altered approval material", () => {
  const paths = fixture();
  const requestId = "release-20260728-0002";
  writeRequest(paths, requestId);
  writeFileSync(join(paths.approvedRoot, `${requestId}.approval.json`), JSON.stringify({ requestId, approved: false }));
  assert.throws(() => admitRequest({ ...paths, requestId }), /OGFI_RELEASE_APPROVAL_INVALID/);
  const second = "release-20260728-0003";
  linkSync(join(paths.incomingRoot, `${requestId}.json`), join(paths.incomingRoot, `${second}.json`));
  assert.throws(() => admitRequest({ ...paths, requestId: second }), /OGFI_RELEASE_REQUEST_UNSAFE/);
});

test("approval cannot authorize a substituted candidate or expired request", () => {
  const paths = fixture();
  const requestId = "release-20260728-0008";
  const { request, approval } = requestFor(requestId);
  request.candidate = { ...request.candidate, artifactSha256: "e".repeat(64) };
  writeFileSync(join(paths.incomingRoot, `${requestId}.json`), JSON.stringify(request));
  writeFileSync(join(paths.approvedRoot, `${requestId}.approval.json`), JSON.stringify(approval));
  assert.throws(() => admitRequest({ ...paths, requestId }), /OGFI_RELEASE_APPROVAL_INVALID/);

  const expiredId = "release-20260728-0009";
  const expired = requestFor(expiredId);
  expired.approval.expiresAtUtc = new Date(Date.now() - 60_000).toISOString();
  expired.request.approvalDigest = sha256(canonicalJson(expired.approval));
  writeFileSync(join(paths.incomingRoot, `${expiredId}.json`), JSON.stringify(expired.request));
  writeFileSync(join(paths.approvedRoot, `${expiredId}.approval.json`), JSON.stringify(expired.approval));
  assert.throws(() => admitRequest({ ...paths, requestId: expiredId }), /OGFI_RELEASE_APPROVAL_INVALID/);
});

test("admission rejects a substituted or incomplete artifact manifest", () => {
  const paths = fixture();
  const requestId = "release-20260728-0012";
  writeRequest(paths, requestId);
  const { request } = requestFor(requestId);
  writeFileSync(join(paths.artifactManifestRoot, `${request.candidate.artifactManifestSha256}.json`), JSON.stringify({ schemaVersion: 1, candidate: {}, serviceImages: {} }));
  assert.throws(() => admitRequest({ ...paths, requestId }), /OGFI_RELEASE_ARTIFACT_MANIFEST_(DIGEST|BINDING)_INVALID/);
});

test("recovery turns every incomplete journal into durable maintenance", () => {
  const paths = fixture();
  appendJournal(paths.stateRoot, { phase: "ADMITTED", requestId: "release-20260728-0004" }, paths.journalOptions);
  appendJournal(paths.stateRoot, { phase: "ARTIFACT_VERIFIED", requestId: "release-20260728-0004" }, paths.journalOptions);
  appendJournal(paths.stateRoot, { phase: "SNAPSHOT_VERIFIED", requestId: "release-20260728-0004" }, paths.journalOptions);
  appendJournal(paths.stateRoot, { phase: "MIGRATION_STARTED", requestId: "release-20260728-0004" }, paths.journalOptions);
  let maintenance = 0;
  const result = recoverIncompleteRelease({ ...paths, enterMaintenance: () => { maintenance += 1; } });
  assert.equal(result.recovered, true);
  assert.equal(result.state.phase, "MAINTENANCE_REQUIRED");
  assert.equal(maintenance, 1);
});

test("journal rejects skipped phases and mixed requests", () => {
  const paths = fixture();
  appendJournal(paths.stateRoot, { phase: "ADMITTED", requestId: "release-20260728-0010" }, paths.journalOptions);
  assert.throws(
    () => appendJournal(paths.stateRoot, { phase: "MIGRATION_STARTED", requestId: "release-20260728-0010" }, paths.journalOptions),
    /OGFI_RELEASE_JOURNAL_TRANSITION_INVALID/,
  );
  assert.throws(
    () => appendJournal(paths.stateRoot, { phase: "ARTIFACT_VERIFIED", requestId: "release-20260728-0011" }, paths.journalOptions),
    /OGFI_RELEASE_JOURNAL_TRANSITION_INVALID/,
  );
});

test("ambiguous journal state enters durable maintenance instead of throwing", () => {
  const paths = fixture();
  mkdirSync(paths.stateRoot);
  writeFileSync(join(paths.stateRoot, "current.json"), "not-json");
  let maintenance = 0;
  const result = recoverIncompleteRelease({ ...paths, enterMaintenance: () => { maintenance += 1; } });
  assert.equal(result.recovered, true);
  assert.equal(result.state.reason, "JOURNAL_AMBIGUOUS");
  assert.equal(maintenance, 1);
  assert.match(readFileSync(join(paths.stateRoot, "ambiguous-maintenance.json"), "utf8"), /JOURNAL_AMBIGUOUS/);
});

test("parseable but contradictory journal history enters durable maintenance", () => {
  const paths = fixture();
  appendJournal(paths.stateRoot, { phase: "ADMITTED", requestId: "release-20260728-0013" }, paths.journalOptions);
  const eventPath = join(paths.stateRoot, "events.ndjson");
  writeFileSync(eventPath, `${readFileSync(eventPath, "utf8").trim()}\n${JSON.stringify({ schemaVersion: 1, sequence: 2, previousEventSha256: "0".repeat(64), eventSha256: "0".repeat(64), phase: "ARTIFACT_VERIFIED", requestId: "release-20260728-0013" })}\n`);
  let maintenance = 0;
  const result = recoverIncompleteRelease({ ...paths, enterMaintenance: () => { maintenance += 1; } });
  assert.equal(result.recovered, true);
  assert.equal(result.state.reason, "JOURNAL_AMBIGUOUS");
  assert.equal(maintenance, 1);
});

test("request schema rejects short commits, mutable images, and unexpected rollback", () => {
  const { request } = requestFor("release-20260728-0005");
  request.candidate.commitSha = "short";
  assert.throws(() => validateReleaseRequest(request), /OGFI_RELEASE_CANDIDATE_DIGEST_INVALID/);
  const next = requestFor("release-20260728-0006").request;
  next.candidate.serviceImages = { web: "ogfi/web:latest" };
  assert.throws(() => validateReleaseRequest(next), /OGFI_RELEASE_IMAGE_DIGEST_INVALID/);
  const third = requestFor("release-20260728-0007").request;
  third.rollback = {};
  assert.throws(() => validateReleaseRequest(third), /OGFI_RELEASE_ROLLBACK_UNEXPECTED/);
  const fourth = requestFor("release-20260728-0014").request;
  fourth.candidate.unreviewedImage = "ogfi/web:latest";
  assert.throws(() => validateReleaseRequest(fourth), /OGFI_RELEASE_CANDIDATE_FIELD_INVALID/);
});
