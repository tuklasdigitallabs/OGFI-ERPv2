import { renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const commitSha = process.env.RELEASE_COMMIT_SHA;
const artifactSha256 = process.env.RELEASE_ARTIFACT_SHA256;
const composeSha256 = process.env.RELEASE_COMPOSE_SHA256;
const identityManifestSha256 = process.env.RELEASE_IDENTITY_MANIFEST_SHA256;
const output = resolve(process.env.RELEASE_ARTIFACT_MANIFEST_OUTPUT ?? "release-artifact-manifest.json");

const sha = (value) => /^[a-f0-9]{64}$/.test(value ?? "");
const image = (value) => /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(value ?? "");
if (!/^[a-f0-9]{40}$/.test(commitSha ?? "") || !sha(artifactSha256) || !sha(composeSha256) || !sha(identityManifestSha256)) throw new Error("RELEASE_ARTIFACT_MANIFEST_INPUT_INVALID");

let serviceImages;
try { serviceImages = JSON.parse(process.env.RELEASE_SERVICE_IMAGES_JSON ?? ""); } catch { throw new Error("RELEASE_ARTIFACT_MANIFEST_SERVICE_IMAGES_INVALID"); }
if (!serviceImages || typeof serviceImages !== "object" || Array.isArray(serviceImages) || Object.keys(serviceImages).length === 0 || Object.keys(serviceImages).some((name) => !/^[a-z][a-z0-9_-]{0,63}$/.test(name)) || Object.values(serviceImages).some((digest) => typeof digest !== "string" || !image(digest))) throw new Error("RELEASE_ARTIFACT_MANIFEST_SERVICE_IMAGES_INVALID");

const manifest = { schemaVersion: 1, candidate: { commitSha, artifactSha256, composeSha256, identityManifestSha256 }, serviceImages };
const temporary = `${output}.tmp-${process.pid}`;
writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o644, flag: "wx" });
renameSync(temporary, output);
console.log(`Release artifact manifest generated: ${output}`);
