import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, truncateSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const tool = fileURLToPath(new URL("./release-archive-v1.mjs", import.meta.url));
const run = (cwd, args, environment = {}) => spawnSync(process.execPath, [tool, ...args], { cwd, env: { ...process.env, RELEASE_ARCHIVE_REPOSITORY: cwd, RELEASE_ARCHIVE_TRUST_ROOT: cwd, RELEASE_ARCHIVE_STAGING_ROOT: cwd, ...environment }, encoding: "utf8" });
const git = (cwd, args) => { const result = spawnSync("git", args, { cwd, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "ogfi-release-archive-"));
  git(cwd, ["init", "-q"]); git(cwd, ["config", "user.email", "test@example.test"]); git(cwd, ["config", "user.name", "Test"]);
  writeFileSync(join(cwd, "README.md"), "readme\n");
  writeFileSync(join(cwd, "run.sh"), "#!/bin/sh\necho ok\n"); chmodSync(join(cwd, "run.sh"), 0o755);
  writeFileSync(join(cwd, "link-target"), "linked\n");
  spawnSync("ln", ["-s", "link-target", join(cwd, "linked-file")], { encoding: "utf8" });
  git(cwd, ["add", "."]); git(cwd, ["commit", "-qm", "fixture"]);
  return { cwd, sha: git(cwd, ["rev-parse", "HEAD"]) };
}

test("release-archive/v1 is deterministic and includes regular, executable, and symlink tree entries", () => {
  const { cwd, sha } = fixture();
  const one = run(cwd, ["create"], { RELEASE_COMMIT_SHA: sha });
  const two = run(cwd, ["create"], { RELEASE_COMMIT_SHA: sha });
  assert.equal(one.status, 0, one.stderr); assert.equal(two.status, 0, two.stderr);
  const oneJson = JSON.parse(one.stdout); const twoJson = JSON.parse(two.stdout);
  const first = oneJson.output; const second = twoJson.output;
  assert.equal(oneJson.artifactSha256, twoJson.artifactSha256); assert.deepEqual(readFileSync(first), readFileSync(second));
  const bytes = readFileSync(first);
  assert.deepEqual(bytes.subarray(257, 265), Buffer.from("ustar\0" + "00", "ascii"));
  assert.equal(bytes.subarray(108, 116).toString("binary"), "0000000\0");
  assert.equal(bytes.subarray(136, 148).toString("binary"), "00000000000\0");
  assert.match(bytes.toString("binary"), /ogfi-release-v1\/linked-file/);
  const verify = run(cwd, ["verify"], { RELEASE_COMMIT_SHA: sha, RELEASE_ARCHIVE_INPUT: first, RELEASE_ARTIFACT_SHA256: oneJson.artifactSha256 });
  assert.equal(verify.status, 0, verify.stderr);
});

test("release-archive/v1 rejects refs, corrupted archives, and worktree-only files", () => {
  const { cwd, sha } = fixture();
  const created = run(cwd, ["create"], { RELEASE_COMMIT_SHA: sha }); assert.equal(created.status, 0, created.stderr);
  const archive = JSON.parse(created.stdout).output;
  const artifactSha256 = JSON.parse(created.stdout).artifactSha256;
  assert.notEqual(run(cwd, ["create"], { RELEASE_COMMIT_SHA: "HEAD", RELEASE_ARCHIVE_OUTPUT: join(cwd, "bad.tar") }).status, 0);
  writeFileSync(join(cwd, "untracked.txt"), "must not enter\n");
  const recreated = run(cwd, ["create"], { RELEASE_COMMIT_SHA: sha }); assert.equal(recreated.status, 0, recreated.stderr);
  assert.deepEqual(readFileSync(archive), readFileSync(JSON.parse(recreated.stdout).output));
  const corrupted = Buffer.from(readFileSync(archive)); corrupted[0] ^= 1; writeFileSync(join(cwd, "corrupted.tar"), corrupted);
  const verify = run(cwd, ["verify"], { RELEASE_COMMIT_SHA: sha, RELEASE_ARCHIVE_INPUT: join(cwd, "corrupted.tar"), RELEASE_ARTIFACT_SHA256: artifactSha256 });
  assert.notEqual(verify.status, 0); assert.match(verify.stderr, /RELEASE_ARCHIVE_DIGEST_MISMATCH|RELEASE_ARCHIVE_CONTRACT_MISMATCH/);
  const forgedDigest = createHash("sha256").update(corrupted).digest("hex");
  const structurallyInvalid = run(cwd, ["verify"], { RELEASE_COMMIT_SHA: sha, RELEASE_ARCHIVE_INPUT: join(cwd, "corrupted.tar"), RELEASE_ARTIFACT_SHA256: forgedDigest });
  assert.notEqual(structurallyInvalid.status, 0); assert.match(structurallyInvalid.stderr, /RELEASE_ARCHIVE_CONTRACT_MISMATCH/);
});

test("release-archive/v1 rejects symlinked or oversized inputs and unsafe staging roots before Git verification", () => {
  const { cwd, sha } = fixture();
  const created = run(cwd, ["create"], { RELEASE_COMMIT_SHA: sha }); assert.equal(created.status, 0, created.stderr);
  const createdArchive = JSON.parse(created.stdout).output;
  const archive = createdArchive;
  spawnSync("ln", ["-s", createdArchive, join(cwd, "archive-link.tar")], { encoding: "utf8" });
  const symlink = run(cwd, ["verify"], { RELEASE_COMMIT_SHA: sha, RELEASE_ARCHIVE_INPUT: join(cwd, "archive-link.tar"), RELEASE_ARTIFACT_SHA256: "a".repeat(64) });
  assert.notEqual(symlink.status, 0); assert.match(symlink.stderr, /RELEASE_ARCHIVE_INPUT_INVALID/);
  truncateSync(archive, (512 * 1024 * 1024) + 1);
  const oversized = run(cwd, ["verify"], { RELEASE_COMMIT_SHA: sha, RELEASE_ARCHIVE_INPUT: archive, RELEASE_ARTIFACT_SHA256: "a".repeat(64) });
  assert.notEqual(oversized.status, 0); assert.match(oversized.stderr, /RELEASE_ARCHIVE_INPUT_INVALID/);
  const unsafeRoot = join(cwd, "unsafe-staging"); mkdirSync(unsafeRoot); chmodSync(unsafeRoot, 0o777);
  const unsafe = run(cwd, ["create"], { RELEASE_COMMIT_SHA: sha, RELEASE_ARCHIVE_STAGING_ROOT: unsafeRoot });
  assert.notEqual(unsafe.status, 0); assert.match(unsafe.stderr, /RELEASE_ARCHIVE_STAGING_ROOT_INVALID/);
});
