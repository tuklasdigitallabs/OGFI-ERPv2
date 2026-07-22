import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const EXPECTED_CADDY_VERSION = "v2.11.4";
export const EXPECTED_RATELIMIT_COMMIT =
  "5625512f24f6f59d6f64fb3aafe5eecff0b286db";

export function isImmutableImageReference(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/:~-]*@sha256:[a-f0-9]{64}$/.test(value ?? "");
}

function runDocker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`Docker could not run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Docker command failed (${args[0]}): ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout.trim();
}

function inspectImage(image) {
  const raw = runDocker([
    "image",
    "inspect",
    image,
    "--format",
    '{{json .}}',
  ]);
  const inspected = JSON.parse(raw);
  const configuredLabels = inspected.Config?.Labels ?? {};
  const expectedDigest = image.slice(image.indexOf("@sha256:"));
  assert.ok(
    (inspected.RepoDigests ?? []).some((reference) => reference.endsWith(expectedDigest)),
    `${image} is not locally resolved to its requested digest`,
  );
  assert.equal(
    configuredLabels["io.ogfi.caddy.version"],
    EXPECTED_CADDY_VERSION,
    `${image} has the wrong Caddy version label`,
  );
  assert.equal(
    configuredLabels["io.ogfi.caddy-ratelimit.commit"],
    EXPECTED_RATELIMIT_COMMIT,
    `${image} has the wrong rate-limit commit label`,
  );
}

function verifyModule(image) {
  const modules = runDocker([
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    image,
    "caddy",
    "list-modules",
  ]);
  assert.ok(
    modules.split(/\r?\n/).includes("http.handlers.rate_limit"),
    `${image} does not contain http.handlers.rate_limit`,
  );
}

function verifyConfig(image, caddyfilePath) {
  runDocker([
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--tmpfs",
    "/tmp:size=16m",
    "--tmpfs",
    "/data:size=16m",
    "--tmpfs",
    "/config:size=16m",
    "--mount",
    `type=bind,src=${caddyfilePath},dst=/etc/caddy/Caddyfile,readonly`,
    image,
    "caddy",
    "validate",
    "--config",
    "/etc/caddy/Caddyfile",
    "--adapter",
    "caddyfile",
  ]);
}

export function validateReleaseImageInputs(currentImage, rollbackImage) {
  assert.ok(
    isImmutableImageReference(currentImage),
    "CADDY_IMAGE must be an immutable name@sha256 reference",
  );
  assert.ok(
    isImmutableImageReference(rollbackImage),
    "CADDY_ROLLBACK_IMAGE must be an immutable name@sha256 reference",
  );
  assert.notEqual(
    currentImage.slice(currentImage.indexOf("@sha256:")),
    rollbackImage.slice(rollbackImage.indexOf("@sha256:")),
    "CADDY_IMAGE and CADDY_ROLLBACK_IMAGE must identify different reviewed artifacts",
  );
}

export function runAuthEdgeImagePreflight(env = process.env) {
  const currentImage = env.CADDY_IMAGE ?? "";
  const rollbackImage = env.CADDY_ROLLBACK_IMAGE ?? "";
  validateReleaseImageInputs(currentImage, rollbackImage);

  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const caddyfilePath = path.join(repositoryRoot, "infra", "caddy", "Caddyfile.example");
  for (const image of [currentImage, rollbackImage]) {
    inspectImage(image);
    verifyModule(image);
    verifyConfig(image, caddyfilePath);
  }

  return {
    status: "PASS",
    currentImage,
    rollbackImage,
    caddyVersion: EXPECTED_CADDY_VERSION,
    rateLimitCommit: EXPECTED_RATELIMIT_COMMIT,
    networkUsed: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(runAuthEdgeImagePreflight(), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "FAIL",
        message: error instanceof Error ? error.message : "Unknown edge preflight failure",
      }),
    );
    process.exitCode = 1;
  }
}
