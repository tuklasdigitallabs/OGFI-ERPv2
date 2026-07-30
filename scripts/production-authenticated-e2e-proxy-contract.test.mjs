import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("production-authenticated CI edge remains a pinned loopback Nginx to Caddy chain", () => {
  const compose = read("infra/ci/production-authenticated-e2e/compose.yaml");
  const caddy = read("infra/ci/production-authenticated-e2e/Caddyfile");
  const nginx = read("infra/ci/production-authenticated-e2e/nginx.conf.template");
  const playwright = read("apps/web/production-authenticated.playwright.config.ts");

  assert.match(compose, /CADDY_BUILDER_IMAGE: docker\.io\/library\/caddy:2\.11\.4-builder-alpine@sha256:[a-f0-9]{64}/);
  assert.match(compose, /CADDY_RUNTIME_IMAGE: docker\.io\/library\/caddy:2\.11\.4-alpine@sha256:[a-f0-9]{64}/);
  assert.match(compose, /image: docker\.io\/library\/nginx:1\.27-alpine@sha256:[a-f0-9]{64}/);
  assert.match(compose, /network_mode: host/g);
  assert.match(compose, /read_only: true/g);
  assert.match(compose, /no-new-privileges:true/g);
  assert.match(compose, /cap_drop:\n\s+- ALL/g);
  assert.match(compose, /cap_add:\n\s+- CHOWN/);

  assert.match(caddy, /http:\/\/127\.0\.0\.1:3101/);
  assert.match(caddy, /trusted_proxies static 127\.0\.0\.1\/32/);
  assert.match(caddy, /header_up -Forwarded/);
  assert.match(caddy, /header_up -X-Real-IP/);
  assert.match(caddy, /header_up -X-Forwarded-For/);
  assert.match(caddy, /header_up X-Forwarded-For \{remote_host\}/);
  assert.match(caddy, /header_up X-Forwarded-Proto https/);
  assert.match(caddy, /header_up X-Forwarded-Host \{http\.request\.host\}/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3102/);

  assert.match(nginx, /listen 127\.0\.0\.1:3443 ssl/);
  assert.match(nginx, /proxy_set_header Forwarded ""/);
  assert.match(nginx, /proxy_set_header X-Real-IP \$remote_addr/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto https/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Host \$http_host/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3101/);
  assert.match(compose, /ogfi_production_auth_e2e_tls_key/);
  assert.match(compose, /mode: 0400/);
  assert.doesNotMatch(compose, /ports:/);
  assert.doesNotMatch(caddy, /tls internal/);
  assert.match(playwright, /outputDir: "test-results\/production-auth-artifacts"/);
  assert.match(playwright, /outputFolder: "test-results\/production-auth-html"/);
});
