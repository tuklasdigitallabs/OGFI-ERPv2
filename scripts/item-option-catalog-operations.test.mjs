import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rootPackage = JSON.parse(read("package.json"));
const webPackage = JSON.parse(read("apps/web/package.json"));
const caddy = read("infra/caddy/Caddyfile.example");
const localCompose = read("docker-compose.yml");
const hostedCompose = read("infra/hostinger/evidence/compose.production.yaml");
const localEnvironment = read(".env.example");
const stagingEnvironment = read(".env.staging.example");
const productionEnvironment = read(".env.production.example");
const healthService = read("infra/systemd/database/ogfi-item-option-catalog-health.service");
const healthTimer = read("infra/systemd/database/ogfi-item-option-catalog-health.timer");
const alertService = read("infra/systemd/database/ogfi-item-option-catalog-alert@.service");

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing ${end} after ${start}`);
  return source.slice(startIndex, endIndex);
}

test("Item option catalog uses exact GET matching and global-before-source edge admission", () => {
  const route = between(caddy, "\t@itemOptionCatalog {", "\n\t@signIn {");
  assert.match(route, /method GET/);
  assert.match(route, /path \/api\/items\/option-catalog/);
  assert.ok(route.indexOf("zone item_option_global") < route.indexOf("zone item_option_source"));
  assert.ok(route.indexOf("zone item_option_source") < route.indexOf("import app_proxy"));
  assert.match(route, /zone item_option_global \{[\s\S]*?key global/);
  assert.match(route, /zone item_option_source \{[\s\S]*?key \{remote_host\}/);
  assert.match(route, /ipv4_prefix 32/);
  assert.match(route, /ipv6_prefix 64/);
  assert.match(caddy, /http:\/\/:2021[\s\S]*handle \/api\/internal\/item-option-catalog-metrics[\s\S]*import app_proxy/);
  const publicSite = caddy.slice(caddy.indexOf("{$OGFI_SITE_ADDRESS::8080}"));
  assert.ok(
    publicSite.indexOf("handle /api/internal/*") < publicSite.lastIndexOf("handle {"),
    "public internal-route denial must run before the public catch-all",
  );
  assert.match(publicSite, /handle \/api\/internal\/\* \{\s*respond 404\s*\}/);
});

test("Compose supplies candidate local limits and requires hosted production calibration", () => {
  assert.match(localCompose, /CADDY_ITEM_OPTION_RATE_WINDOW: \$\{CADDY_ITEM_OPTION_RATE_WINDOW:-1m\}/);
  assert.match(localCompose, /CADDY_ITEM_OPTION_GLOBAL_EVENTS: \$\{CADDY_ITEM_OPTION_GLOBAL_EVENTS:-2400\}/);
  assert.match(localCompose, /CADDY_ITEM_OPTION_SOURCE_EVENTS: \$\{CADDY_ITEM_OPTION_SOURCE_EVENTS:-600\}/);
  for (const variable of [
    "CADDY_ITEM_OPTION_RATE_WINDOW",
    "CADDY_ITEM_OPTION_GLOBAL_EVENTS",
    "CADDY_ITEM_OPTION_SOURCE_EVENTS",
  ]) {
    assert.match(hostedCompose, new RegExp(`${variable}: \\$\\{${variable}:\\?`));
  }
  assert.match(localCompose, /127\.0\.0\.1:2021:2021/);
});

test("environment templates separate candidates from required production policy", () => {
  for (const candidate of [localEnvironment, stagingEnvironment]) {
    assert.match(candidate, /^ITEM_OPTION_CATALOG_MAX_IN_FLIGHT=12$/m);
    assert.match(candidate, /^ITEM_OPTION_CATALOG_BUSY_RETRY_SECONDS=2$/m);
    assert.match(candidate, /^CADDY_ITEM_OPTION_RATE_WINDOW=1m$/m);
    assert.match(candidate, /^CADDY_ITEM_OPTION_GLOBAL_EVENTS=2400$/m);
    assert.match(candidate, /^CADDY_ITEM_OPTION_SOURCE_EVENTS=600$/m);
    assert.match(candidate, /^ITEM_OPTION_CATALOG_RUNTIME_METRICS_URL=http:\/\/127\.0\.0\.1:2021\/api\/internal\/item-option-catalog-metrics$/m);
  }
  for (const variable of [
    "ITEM_OPTION_CATALOG_MAX_IN_FLIGHT",
    "ITEM_OPTION_CATALOG_BUSY_RETRY_SECONDS",
    "ITEM_OPTION_CATALOG_HEALTH_GLOBAL_REJECTED_THRESHOLD",
    "ITEM_OPTION_CATALOG_HEALTH_SOURCE_REJECTED_THRESHOLD",
    "ITEM_OPTION_CATALOG_HEALTH_BUSY_THRESHOLD",
    "ITEM_OPTION_CATALOG_HEALTH_UNAVAILABLE_THRESHOLD",
    "ITEM_OPTION_CATALOG_HEALTH_DURATION_MS",
    "CADDY_ITEM_OPTION_RATE_WINDOW",
    "CADDY_ITEM_OPTION_GLOBAL_EVENTS",
    "CADDY_ITEM_OPTION_SOURCE_EVENTS",
  ]) {
    assert.match(productionEnvironment, new RegExp(`^${variable}=$`, "m"));
  }
});

test("health job is exposed through hardened periodic host units", () => {
  assert.equal(rootPackage.scripts["item-option-catalog:health"], "pnpm --filter @ogfi/web item-option-catalog:health");
  assert.equal(webPackage.scripts["item-option-catalog:health"], "tsx src/server/jobs/itemOptionCatalogHealth.ts");
  assert.match(healthService, /EnvironmentFile=\/srv\/ogfi\/config\/production\.env/);
  assert.match(healthService, /ExecStart=\/usr\/bin\/pnpm item-option-catalog:health/);
  assert.match(healthTimer, /OnUnitActiveSec=5min/);
  for (const unit of [healthService, healthTimer]) {
    assert.match(unit, /OnFailure=ogfi-item-option-catalog-alert@%n\.service/);
  }
  for (const unit of [healthService, healthTimer, alertService]) {
    assert.doesNotMatch(unit, /ListenStream|ListenDatagram|aws|curl|wget/i);
  }
  assert.match(alertService, /status=CRITICAL/);
  assert.match(alertService, /hosted_alert_delivery=PENDING/);
});
