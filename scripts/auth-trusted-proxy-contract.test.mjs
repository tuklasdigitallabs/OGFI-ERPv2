import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Caddy overwrites untrusted client-address headers with one direct peer", () => {
  const caddy = read("infra/caddy/Caddyfile.example");
  for (const directive of [
    "header_up -Forwarded",
    "header_up -X-Real-IP",
    "header_up -X-Forwarded-For",
    "header_up X-Forwarded-For {remote_host}",
  ]) {
    assert.match(caddy, new RegExp(directive.replace(/[{}-]/g, "\\$&")));
  }
  assert.ok(
    caddy.indexOf("header_up -X-Forwarded-For") <
      caddy.indexOf("header_up X-Forwarded-For {remote_host}"),
  );
});

test("hosted web ingress is private and production-like envs require Caddy trust", () => {
  const localCompose = read("docker-compose.yml");
  const hostedCompose = read("infra/hostinger/evidence/compose.production.yaml");
  const productionEnv = read(".env.production.example");
  const stagingEnv = read(".env.staging.example");
  assert.match(localCompose, /127\.0\.0\.1:\$\{WEB_PORT:-3000\}:3000/);
  assert.match(hostedCompose, /web:[\s\S]*?ports: !reset \[\]/);
  assert.match(productionEnv, /^AUTH_TRUSTED_PROXY_MODE=caddy_single_hop$/m);
  assert.match(stagingEnv, /^AUTH_TRUSTED_PROXY_MODE=caddy_single_hop$/m);
});
