import { renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const commitSha = process.env.RELEASE_COMMIT_SHA;
const artifactSha256 = process.env.RELEASE_ARTIFACT_SHA256;
const webImageDigest = process.env.RELEASE_WEB_IMAGE_DIGEST;
const output = resolve(process.env.RELEASE_IDENTITY_OUTPUT ?? "apps/web/release-identity.json");

if (!/^[a-f0-9]{40}$/.test(commitSha ?? "") || !/^[a-f0-9]{64}$/.test(artifactSha256 ?? "") || !/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(webImageDigest ?? "")) {
  throw new Error("RELEASE_IDENTITY_INPUT_INVALID");
}

const content = `${JSON.stringify({ schemaVersion: 1, commitSha, artifactSha256, webImageDigest }, null, 2)}\n`;
const temporary = `${output}.tmp-${process.pid}`;
writeFileSync(temporary, content, { encoding: "utf8", mode: 0o644, flag: "wx" });
renameSync(temporary, output);
console.log(`Release identity generated: ${output}`);
