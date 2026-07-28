import assert from "node:assert/strict";
import { linkSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  admitRequest,
  appendJournal,
  canonicalJson,
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
  mkdirSync(incomingRoot);
  mkdirSync(approvedRoot);
  return { incomingRoot, approvedRoot, admittedRoot, stateRoot, journalOptions: { syncParentDirectory: () => {} } };
}

function requestFor(requestId) {
  const approval = { requestId, approved: true, approver: "root-review" };
  return {
    approval,
    request: {
      schemaVersion: 1,
      requestId,
      action: "release",
      candidate: {
        commitSha: "a".repeat(40),
        artifactSha256: "b".repeat(64),
        composeSha256: "c".repeat(64),
        imageDigests: [`ogfi/web@sha256:${"d".repeat(64)}`],
      },
      approvalDigest: sha256(canonicalJson(approval)),
    },
  };
}

function writeRequest(paths, requestId) {
  const { request, approval } = requestFor(requestId);
  writeFileSync(join(paths.incomingRoot, `${requestId}.json`), `${JSON.stringify(request)}\n`, { mode: 0o600 });
  writeFileSync(join(paths.approvedRoot, `${requestId}.approval.json`), `${JSON.stringify(approval)}\n`, { mode: 0o600 });
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

test("recovery turns every incomplete journal into durable maintenance", () => {
  const paths = fixture();
  appendJournal(paths.stateRoot, { phase: "MIGRATION_STARTED", requestId: "release-20260728-0004" }, paths.journalOptions);
  let maintenance = 0;
  const result = recoverIncompleteRelease({ ...paths, enterMaintenance: () => { maintenance += 1; } });
  assert.equal(result.recovered, true);
  assert.equal(result.state.phase, "MAINTENANCE_REQUIRED");
  assert.equal(maintenance, 1);
});

test("request schema rejects short commits, mutable images, and unexpected rollback", () => {
  const { request } = requestFor("release-20260728-0005");
  request.candidate.commitSha = "short";
  assert.throws(() => validateReleaseRequest(request), /OGFI_RELEASE_CANDIDATE_DIGEST_INVALID/);
  const next = requestFor("release-20260728-0006").request;
  next.candidate.imageDigests = ["ogfi/web:latest"];
  assert.throws(() => validateReleaseRequest(next), /OGFI_RELEASE_IMAGE_DIGEST_INVALID/);
  const third = requestFor("release-20260728-0007").request;
  third.rollback = {};
  assert.throws(() => validateReleaseRequest(third), /OGFI_RELEASE_ROLLBACK_UNEXPECTED/);
});
