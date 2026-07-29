import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const generator = fileURLToPath(new URL("./generate-release-identity.mjs", import.meta.url));

test("release identity is a v2 pre-image provenance payload", () => {
  const output = join(mkdtempSync(join(tmpdir(), "ogfi-release-identity-")), "identity.json");
  const result = spawnSync(process.execPath, [generator], {
    env: { ...process.env, RELEASE_COMMIT_SHA: "a".repeat(40), RELEASE_ARTIFACT_SHA256: "b".repeat(64), RELEASE_IDENTITY_OUTPUT: output },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), { schemaVersion: 2, commitSha: "a".repeat(40), artifactSha256: "b".repeat(64) });
});

test("release identity rejects an OCI image digest as an input contract", () => {
  const output = join(mkdtempSync(join(tmpdir(), "ogfi-release-identity-")), "identity.json");
  const result = spawnSync(process.execPath, [generator], {
    env: { ...process.env, RELEASE_COMMIT_SHA: "a".repeat(40), RELEASE_ARTIFACT_SHA256: "b".repeat(64), RELEASE_WEB_IMAGE_DIGEST: `ogfi/web@sha256:${"c".repeat(64)}`, RELEASE_IDENTITY_OUTPUT: output },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /webImageDigest/);
});
