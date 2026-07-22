import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rootPackage = JSON.parse(read("package.json"));
const webPackage = JSON.parse(read("apps/web/package.json"));
const maintenance = read("apps/web/src/server/jobs/authenticationThrottleMaintenance.ts");
const cleanup = read("apps/web/src/server/jobs/authenticationThrottleCleanup.ts");
const health = read("apps/web/src/server/jobs/authenticationThrottleHealth.ts");
const healthPolicy = read("apps/web/src/server/jobs/authenticationThrottleHealthPolicy.ts");
const runtimeMetrics = read("apps/web/src/server/services/authenticationRuntimeMetrics.ts");
const caddy = read("infra/caddy/Caddyfile.example");
const compose = read("docker-compose.yml");
const rotation = read("apps/web/src/server/jobs/authenticationThrottleKeyRotationReadiness.ts");
const bootstrap = read("apps/web/src/server/jobs/authenticationThrottleControlBootstrap.ts");
const runtimeProbe = read("apps/web/src/server/jobs/authenticationThrottleRuntimeProbe.ts");
const raceProbe = read("apps/web/src/server/jobs/authenticationThrottleControlRaceProbe.ts");
const disposableRunner = read("scripts/run-disposable-postgres-tests.mjs");
const cleanupService = read("infra/systemd/database/ogfi-auth-throttle-cleanup.service");
const cleanupTimer = read("infra/systemd/database/ogfi-auth-throttle-cleanup.timer");
const healthService = read("infra/systemd/database/ogfi-auth-throttle-health.service");
const healthTimer = read("infra/systemd/database/ogfi-auth-throttle-health.timer");
const alert = read("infra/systemd/database/ogfi-auth-throttle-alert@.service");

test("provides bounded retention cleanup without logging authentication identifiers", () => {
  assert.equal(rootPackage.scripts["auth-throttle:cleanup"], "pnpm --filter @ogfi/web auth-throttle:cleanup");
  assert.equal(webPackage.scripts["auth-throttle:cleanup"], "tsx src/server/jobs/authenticationThrottleCleanup.ts");
  assert.match(maintenance, /"retainUntil" <=/);
  assert.match(maintenance, /"attemptedAt" </);
  assert.match(maintenance, /FOR UPDATE SKIP LOCKED/);
  assert.match(maintenance, /LIMIT \$\{input\.batchSize\}/);
  assert.match(cleanup, /AUTH_THROTTLE_CLEANUP_MAX_BATCHES/);
  assert.match(cleanup, /AUTH_THROTTLE_CLEANUP_MAX_SECONDS/);
  assert.match(maintenance, /throttleWindowsDeleted/);
  assert.match(maintenance, /legacyAttemptsDeleted/);
  assert.doesNotMatch(cleanup, /bucketKey|identifierHash|sourceAddressHash|tenantId|accountUserId/);
});

test("reports cleanup lag and incompatible keys through local systemd failure signaling", () => {
  assert.equal(rootPackage.scripts["auth-throttle:health"], "pnpm --filter @ogfi/web auth-throttle:health");
  assert.match(healthPolicy, /AUTH_THROTTLE_WINDOW_CLEANUP_OVERDUE/);
  assert.match(healthPolicy, /AUTH_LOGIN_ATTEMPT_CLEANUP_OVERDUE/);
  assert.match(healthPolicy, /AUTH_THROTTLE_KEY_VERSION_INCOMPATIBLE/);
  assert.match(health, /LIMIT 1/);
  assert.match(health, /previousOverlapIsValid/);
  assert.match(health, /maximumShardPressurePermille/);
  assert.match(health, /AUTH_RUNTIME_METRICS_URL/);
  assert.match(runtimeMetrics, /caddy_rate_limit_declined_requests_total/);
  assert.match(runtimeMetrics, /drainMetrics/);
  assert.match(caddy, /^\s*admin 127\.0\.0\.1:2019$/m);
  assert.match(caddy, /remote_ip delete/);
  assert.match(caddy, /request>headers delete/);
  assert.match(caddy, /http:\/\/:2020[\s\S]*handle \/metrics[\s\S]*reverse_proxy 127\.0\.0\.1:2019[\s\S]*header_up Host 127\.0\.0\.1:2019/);
  assert.match(caddy, /http:\/\/:2021[\s\S]*handle \/api\/internal\/authentication-metrics[\s\S]*import app_proxy/);
  assert.match(compose, /127\.0\.0\.1:2021:2021/);
  assert.doesNotMatch(health, /bucketKey|identifierHash|sourceAddressHash|reservationId|proof|tenantId|accountUserId/);
  for (const unit of [cleanupService, cleanupTimer, healthService, healthTimer]) {
    assert.match(unit, /OnFailure=ogfi-auth-throttle-alert@%n\.service/);
  }
  assert.match(alert, /status=CRITICAL/);
  assert.match(alert, /hosted_alert_delivery=PENDING/);
  for (const unit of [cleanupService, cleanupTimer, healthService, healthTimer, alert]) {
    assert.doesNotMatch(unit, /https?:|ListenStream|ListenDatagram|aws/i);
  }
});

test("exposes the core key-rotation readiness check as an explicit operator command", () => {
  assert.equal(rootPackage.scripts["auth-throttle:key-rotation-readiness"], "pnpm --filter @ogfi/web auth-throttle:key-rotation-readiness");
  assert.match(rotation, /assertAuthenticationThrottleKeyRotationReady/);
  assert.match(rotation, /AUTH_THROTTLE_ROTATE_FROM_KEY_VERSION/);
  assert.match(rotation, /status: "READY"/);
  assert.match(rotation, /status: "BLOCKED"/);
});

test("bootstraps control state only through the controlled migrator path", () => {
  assert.equal(rootPackage.scripts["auth-throttle:control-bootstrap"], "pnpm --filter @ogfi/web auth-throttle:control-bootstrap");
  assert.equal(webPackage.scripts["auth-throttle:control-bootstrap"], "tsx src/server/jobs/authenticationThrottleControlBootstrap.ts");
  assert.match(bootstrap, /AUTH_THROTTLE_CONTROL_EXPECTED_GENERATION/);
  assert.match(bootstrap, /AUTH_THROTTLE_CONTROL_REQUESTED_STATUS/);
  assert.match(bootstrap, /value !== "ACTIVE" && value !== "PAUSED"/);
  assert.match(bootstrap, /transitionAuthenticationThrottleControl/);
  assert.doesNotMatch(bootstrap, /hmacKey|previousHmacKey|AUTH_THROTTLE_HMAC_KEY/);
  assert.match(disposableRunner, /controlledSetupEnvironment\(migratorUrl, identity\)/);
  assert.match(disposableRunner, /disposableAuthenticationThrottleEnvironment/);
  assert.match(disposableRunner, /AUTH_THROTTLE_CONTROL_EXPECTED_GENERATION: "0"/);
  assert.match(disposableRunner, /AUTH_THROTTLE_CONTROL_REQUESTED_STATUS: "ACTIVE"/);
  assert.equal(rootPackage.scripts["auth-throttle:runtime-probe"], "pnpm --filter @ogfi/web auth-throttle:runtime-probe");
  assert.match(runtimeProbe, /AUTH_THROTTLE_RUNTIME_PROBE_ROLLBACK/);
  assert.match(runtimeProbe, /rolledBack: true/);
  assert.doesNotMatch(runtimeProbe, /identifierSignal.*process\.env|sourceSignal.*process\.env/);
  assert.match(disposableRunner, /verifyAuthenticationThrottleRuntimeBoundary/);
  assert.match(disposableRunner, /auth-throttle:runtime-probe/);
  assert.equal(rootPackage.scripts["auth-throttle:control-race-probe"], "pnpm --filter @ogfi/web auth-throttle:control-race-probe");
  assert.match(raceProbe, /Promise\.allSettled/);
  assert.match(raceProbe, /AUTH_THROTTLE_CONTROL_RACE_NOT_SERIALIZED/);
  assert.match(raceProbe, /AUTH_THROTTLE_CONTROL_IDEMPOTENCE_FAILED/);
  assert.match(raceProbe, /AUTH_THROTTLE_UNEXPIRED_PREVIOUS_NOT_REJECTED/);
  assert.match(raceProbe, /AUTH_THROTTLE_PREVIOUS_VERSION_REUSE_NOT_REJECTED/);
  assert.match(raceProbe, /AUTH_THROTTLE_PREVIOUS_FINGERPRINT_REUSE_NOT_REJECTED/);
  assert.match(raceProbe, /AUTH_THROTTLE_PAUSE_RESERVATION_RACE_FAILED/);
  assert.match(raceProbe, /pauseReservationIterations = 25/);
  assert.match(raceProbe, /AUTH_THROTTLE_PAUSE_TRANSIENT_EXHAUSTED/);
  assert.match(raceProbe, /AUTH_THROTTLE_PAUSE_GENERATION_CONFLICT/);
  assert.doesNotMatch(raceProbe, /console\.(?:log|error)\([^)]*(?:hmacKey|previousHmacKey)/);
  assert.match(disposableRunner, /auth-throttle:control-race-probe/);
});
