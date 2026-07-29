import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const generator = fileURLToPath(new URL("./generate-release-artifact-manifest.mjs", import.meta.url));
const environment = (output) => ({ ...process.env, RELEASE_COMMIT_SHA: "a".repeat(40), RELEASE_ARTIFACT_SHA256: "b".repeat(64), RELEASE_COMPOSE_SHA256: "c".repeat(64), RELEASE_IDENTITY_MANIFEST_SHA256: "d".repeat(64), RELEASE_SERVICE_IMAGES_JSON: JSON.stringify({ caddy: `ogfi/caddy@sha256:${"e".repeat(64)}`, web: `ogfi/web@sha256:${"f".repeat(64)}` }), RELEASE_ARTIFACT_MANIFEST_OUTPUT: output });

test("detached manifest binds source identity, compose, and keyed final images", () => {
  const output = join(mkdtempSync(join(tmpdir(), "ogfi-artifact-manifest-")), "manifest.json");
  const result = spawnSync(process.execPath, [generator], { env: environment(output), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(output, "utf8"));
  assert.deepEqual(manifest.candidate, { commitSha: "a".repeat(40), artifactSha256: "b".repeat(64), composeSha256: "c".repeat(64), identityManifestSha256: "d".repeat(64) });
  assert.equal(manifest.serviceImages.web, `ogfi/web@sha256:${"f".repeat(64)}`);
});

test("detached manifest rejects mutable service image references", () => {
  const output = join(mkdtempSync(join(tmpdir(), "ogfi-artifact-manifest-")), "manifest.json");
  const result = spawnSync(process.execPath, [generator], { env: { ...environment(output), RELEASE_SERVICE_IMAGES_JSON: JSON.stringify({ web: "ogfi/web:latest" }) }, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RELEASE_ARTIFACT_MANIFEST_SERVICE_IMAGES_INVALID/);
});
