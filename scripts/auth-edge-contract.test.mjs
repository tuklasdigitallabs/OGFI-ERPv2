import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EXPECTED_CADDY_VERSION,
  EXPECTED_RATELIMIT_COMMIT,
  isImmutableImageReference,
  validateReleaseImageInputs,
} from "./auth-edge-image-preflight.mjs";

const read = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing ${end} after ${start}`);
  return source.slice(startIndex, endIndex);
}

test("custom Caddy build pins core, upstream images, and rate-limit source", () => {
  const dockerfile = read("infra/caddy/Dockerfile");
  assert.match(
    dockerfile,
    /^# syntax=docker\/dockerfile:1\.7@sha256:[a-f0-9]{64}$/m,
  );
  assert.match(dockerfile, /^ARG CADDY_BUILDER_IMAGE$/m);
  assert.match(dockerfile, /^ARG CADDY_RUNTIME_IMAGE$/m);
  assert.match(dockerfile, /^FROM \$\{CADDY_BUILDER_IMAGE\} AS builder$/m);
  assert.match(dockerfile, /^FROM \$\{CADDY_RUNTIME_IMAGE\}$/m);
  assert.match(dockerfile, new RegExp(`ARG CADDY_VERSION=${EXPECTED_CADDY_VERSION}`));
  assert.match(
    dockerfile,
    new RegExp(`ARG CADDY_RATELIMIT_COMMIT=${EXPECTED_RATELIMIT_COMMIT}`),
  );
  assert.match(
    dockerfile,
    /github\.com\/mholt\/caddy-ratelimit@\$\{CADDY_RATELIMIT_COMMIT\}/,
  );
  assert.match(dockerfile, /io\.ogfi\.caddy-ratelimit\.commit/);
  assert.match(dockerfile, /setcap -r \/usr\/bin\/caddy/);
  assert.doesNotMatch(dockerfile, /caddy:(?:latest|2-alpine)/);
});

test("auth routes apply static global limits before bounded source limits", () => {
  const caddy = read("infra/caddy/Caddyfile.example");
  const routeContracts = [
    ["@signIn", "@activate", "/sign-in", "sign_in_global", "sign_in_source"],
    ["@activate", "@mfaChallenge", "/activate", "activate_global", "activate_source"],
    ["@mfaChallenge", "handle {", "/mfa-challenge", "mfa_challenge_global", "mfa_challenge_source"],
  ];

  for (const [start, end, path, globalZone, sourceZone] of routeContracts) {
    const route = between(caddy, start, end);
    assert.match(route, /method POST/);
    assert.match(route, new RegExp(`path ${path.replace("/", "\\/")}`));
    assert.match(route, /max_size 64KiB/);
    assert.ok(route.indexOf(`zone ${globalZone}`) < route.indexOf(`zone ${sourceZone}`));
    assert.ok(route.indexOf(`zone ${sourceZone}`) < route.indexOf("reverse_proxy web:3000"));
    assert.match(route, new RegExp(`zone ${globalZone} \{[\\s\\S]*?key global`));
    assert.match(route, new RegExp(`zone ${sourceZone} \{[\\s\\S]*?key \{remote_host\}`));
    assert.match(route, /ipv4_prefix 32/);
    assert.match(route, /ipv6_prefix 64/);
    assert.match(route, /fail_duration 1s/);
    assert.match(route, /unhealthy_request_count/);
  }

  assert.match(caddy, /protocols h1 h2/);
  assert.doesNotMatch(caddy, /protocols[^\n]*h3/);
  assert.doesNotMatch(caddy, /log_key/);
  assert.match(caddy, /admin 127\.0\.0\.1:2019/);
  assert.match(caddy, /http:\/\/:2020[\s\S]*handle \/metrics[\s\S]*reverse_proxy 127\.0\.0\.1:2019[\s\S]*header_up Host 127\.0\.0\.1:2019/);
  assert.match(caddy, /http:\/\/:2021[\s\S]*handle \/api\/internal\/authentication-metrics[\s\S]*import app_proxy/);
  assert.match(caddy, /^\s*metrics\s*$/m);
  assert.match(caddy, /request>remote_ip delete/);
  assert.match(caddy, /request>client_ip delete/);
  assert.match(caddy, /request>headers delete/);
  assert.match(caddy, /read_header \{\$CADDY_READ_HEADER_TIMEOUT:10s\}/);
  assert.match(caddy, /max_header_size 64KiB/);
});

test("Compose builds locally from pinned inputs and deploys a hardened digest-only edge", () => {
  const localCompose = read("docker-compose.yml");
  const hostedCompose = read("infra/hostinger/evidence/compose.production.yaml");
  const localCaddy = between(localCompose, "  caddy:\n", "\nnetworks:");
  const hostedCaddy = between(hostedCompose, "  caddy:\n", "\n  postgres:");

  assert.match(localCaddy, /dockerfile: infra\/caddy\/Dockerfile/);
  assert.match(localCaddy, /CADDY_BUILDER_IMAGE: \$\{CADDY_BUILDER_IMAGE:\?/);
  assert.match(localCaddy, /CADDY_RUNTIME_IMAGE: \$\{CADDY_RUNTIME_IMAGE:\?/);
  assert.match(localCaddy, /\$\{CADDY_HTTP_PORT:-8080\}:8080/);
  assert.match(localCaddy, /\$\{CADDY_HTTPS_PORT:-8443\}:8443/);
  assert.match(localCaddy, /127\.0\.0\.1:2021:2021/);
  assert.doesNotMatch(localCaddy, /\/udp/);

  assert.match(hostedCaddy, /image: \$\{CADDY_IMAGE:\?/);
  assert.match(hostedCaddy, /build: !reset null/);
  assert.match(hostedCaddy, /read_only: true/);
  assert.match(hostedCaddy, /user: \$\{CADDY_RUNTIME_UID_GID:\?/);
  assert.match(hostedCaddy, /no-new-privileges:true/);
  assert.match(hostedCaddy, /cap_drop: !override\s+- ALL/);
  assert.match(hostedCaddy, /mem_limit: \$\{CADDY_MEMORY_LIMIT:\?/);
  assert.match(hostedCaddy, /cpus: \$\{CADDY_CPU_LIMIT:\?/);
  assert.match(hostedCaddy, /pids_limit: \$\{CADDY_PIDS_LIMIT:\?/);
  assert.match(hostedCaddy, /http\.handlers\.rate_limit/);
  assert.match(hostedCaddy, /127\.0\.0\.1:2019\/metrics/);
  assert.doesNotMatch(hostedCaddy, /caddy:2-alpine/);
});

test("staging declares candidates while production requires calibration and rollback", () => {
  const local = read(".env.example");
  const staging = read(".env.staging.example");
  const production = read(".env.production.example");
  for (const buildEnvironment of [local, staging]) {
    assert.match(
      buildEnvironment,
      /^CADDY_BUILDER_IMAGE=docker\.io\/library\/caddy:2\.11\.4-builder-alpine@sha256:[a-f0-9]{64}$/m,
    );
    assert.match(
      buildEnvironment,
      /^CADDY_RUNTIME_IMAGE=docker\.io\/library\/caddy:2\.11\.4-alpine@sha256:[a-f0-9]{64}$/m,
    );
  }
  assert.match(staging, /^CADDY_SIGN_IN_SOURCE_EVENTS=30$/m);
  assert.match(staging, /^CADDY_ACTIVATE_SOURCE_EVENTS=12$/m);
  assert.match(staging, /^CADDY_MFA_SOURCE_EVENTS=60$/m);
  assert.match(production, /^CADDY_SIGN_IN_SOURCE_EVENTS=$/m);
  assert.match(production, /^CADDY_ACTIVATE_SOURCE_EVENTS=$/m);
  assert.match(production, /^CADDY_MFA_SOURCE_EVENTS=$/m);
  assert.match(production, /^CADDY_ROLLBACK_IMAGE=/m);
  assert.match(staging, /^AUTH_ARGON2_MAX_CONCURRENCY=2$/m);
  assert.match(production, /^AUTH_ARGON2_MAX_CONCURRENCY=$/m);
  assert.doesNotMatch(production, /^CADDY_IMAGE=caddy:/m);
});

test("release image references reject tags, placeholders, and same-image rollback", () => {
  const current = `registry.example.test/ogfi/caddy@sha256:${"a".repeat(64)}`;
  const rollback = `registry.example.test/ogfi/caddy@sha256:${"b".repeat(64)}`;
  assert.equal(isImmutableImageReference(current), true);
  assert.equal(isImmutableImageReference("caddy:2.10.0"), false);
  assert.equal(isImmutableImageReference("replace-with-image-at-sha256"), false);
  assert.doesNotThrow(() => validateReleaseImageInputs(current, rollback));
  assert.throws(() => validateReleaseImageInputs(current, current), /different reviewed artifacts/);
  assert.throws(
    () =>
      validateReleaseImageInputs(
        current,
        `mirror.example.test/ogfi/caddy@sha256:${"a".repeat(64)}`,
      ),
    /different reviewed artifacts/,
  );
});

test("offline image preflight checks selected and rollback artifacts", () => {
  const preflight = read("scripts/auth-edge-image-preflight.mjs");
  assert.match(preflight, /for \(const image of \[currentImage, rollbackImage\]\)/);
  assert.match(preflight, /"--network",\s+"none"/);
  assert.match(preflight, /"--read-only"/);
  assert.match(preflight, /"--cap-drop",\s+"ALL"/);
  assert.match(preflight, /http\.handlers\.rate_limit/);
  assert.match(preflight, /validate/);
  assert.match(preflight, /networkUsed: false/);
});
