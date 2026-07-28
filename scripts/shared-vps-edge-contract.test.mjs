import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const nginx = read("infra/nginx/ogfi-shared-vps.conf.example");
const nginxReadme = read("infra/nginx/README.md");
const caddy = read("infra/caddy/Caddyfile.example");
const compose = read("infra/hostinger/evidence/compose.production.yaml");
const probe = read("scripts/release-served-identity-probe.mjs");

test("shared edge is an exact-host, loopback-only Nginx addition", () => {
  assert.match(nginx, /listen 443 ssl http2;/);
  assert.match(nginx, /server_name OGFI_EXACT_HOSTNAME;/);
  assert.doesNotMatch(nginx, /^\s*(?:listen .*default_server|server_name _|server_name .*\*\.)/m);
  assert.match(nginx, /server 127\.0\.0\.1:OGFI_CADDY_HTTP_PORT;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(nginx, /proxy_set_header Forwarded "";/);
  assert.match(nginxReadme, /existing sites and their server blocks untouched/);
});

test("Caddy retains the single trusted edge hop and loopback publication", () => {
  assert.match(caddy, /trusted_proxies static \{\$OGFI_EDGE_TRUSTED_PROXY_CIDR\}/);
  assert.match(caddy, /trusted_proxies_strict/);
  assert.match(compose, /OGFI_EDGE_TRUSTED_PROXY_CIDR/);
  assert.match(compose, /127\.0\.0\.1:\$\{CADDY_HTTP_PORT/);
});

test("public identity verification covers a complete controlled address set", () => {
  assert.match(probe, /RELEASE_PUBLIC_BASE_URLS/);
  assert.match(probe, /new Set\(addresses\)/);
  assert.match(probe, /redirect: "error"/);
  assert.match(probe, /AbortSignal\.timeout\(15000\)/);
  assert.match(probe, /x-ogfi-proxy-fence/);
  assert.match(probe, /addresses: results/);
});
