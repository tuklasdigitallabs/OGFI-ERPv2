import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const webPackage = JSON.parse(readFileSync(new URL("../apps/web/package.json", import.meta.url), "utf8"));
const job = readFileSync(new URL("../apps/web/src/server/jobs/authorizationDenialFinalize.ts", import.meta.url), "utf8");
const healthJob = readFileSync(new URL("../apps/web/src/server/jobs/authorizationDenialHealth.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../infra/systemd/database/ogfi-authorization-denial-finalize.service", import.meta.url), "utf8");
const timer = readFileSync(new URL("../infra/systemd/database/ogfi-authorization-denial-finalize.timer", import.meta.url), "utf8");
const healthService = readFileSync(new URL("../infra/systemd/database/ogfi-authorization-denial-health.service", import.meta.url), "utf8");
const healthTimer = readFileSync(new URL("../infra/systemd/database/ogfi-authorization-denial-health.timer", import.meta.url), "utf8");
const healthAlert = readFileSync(new URL("../infra/systemd/database/ogfi-authorization-denial-health-alert@.service", import.meta.url), "utf8");

test("runs the shared denial finalizer through a bounded private systemd timer", () => {
  assert.equal(rootPackage.scripts["authorization-denials:finalize"], "pnpm --filter @ogfi/web authorization-denials:finalize");
  assert.equal(webPackage.scripts["authorization-denials:finalize"], "tsx src/server/jobs/authorizationDenialFinalize.ts");
  assert.equal(rootPackage.scripts["authorization-denials:health"], "pnpm --filter @ogfi/web authorization-denials:health");
  assert.equal(webPackage.scripts["authorization-denials:health"], "tsx src/server/jobs/authorizationDenialHealth.ts");
  assert.match(job, /finalizeExpiredAuthorizationDenialBuckets/);
  assert.match(job, /AUTHORIZATION_DENIAL_FINALIZER_BATCH_SIZE/);
  assert.match(job, /AUTHORIZATION_DENIAL_FINALIZER_MAX_SECONDS/);
  assert.match(job, /main\(\)\.catch\(\(\) =>/);
  assert.match(job, /AUTHORIZATION_DENIAL_FINALIZER_FAILED/);
  assert.match(job, /process\.exitCode = 1/);
  assert.doesNotMatch(job, /catch\(\(error\)|console\.error\([^\n]*error/);
  assert.match(service, /Type=oneshot/);
  assert.match(service, /User=ogfi-runtime/);
  assert.match(service, /NoNewPrivileges=true/);
  assert.match(service, /flock --nonblock/);
  assert.match(service, /OnFailure=ogfi-authorization-denial-health-alert@%n\.service/);
  assert.match(timer, /OnUnitActiveSec=60s/);
  assert.match(timer, /Persistent=true/);
  assert.doesNotMatch(service, /https?:|ListenStream|ListenDatagram/);
});

test("fails health checks with bounded structured local monitoring signals", () => {
  assert.match(healthJob, /AUTHORIZATION_DENIAL_HEALTH_GRACE_MINUTES/);
  assert.match(healthJob, /LIMIT 1/);
  assert.match(healthJob, /"finalizedAt" IS NULL/);
  assert.match(healthJob, /AUTHORIZATION_DENIAL_BUCKET_OVERDUE/);
  assert.match(healthJob, /AUTHORIZATION_DENIAL_HEALTH_QUERY_FAILED/);
  assert.match(healthJob, /AUTHORIZATION_DENIAL_HEALTH_CONFIG_INVALID/);
  assert.match(healthJob, /process\.exitCode = 1/);
  assert.match(healthJob, /process\.exit\(1\)/);
  assert.match(healthService, /Type=oneshot/);
  assert.match(healthService, /User=ogfi-runtime/);
  assert.match(healthService, /TimeoutStartSec=30s/);
  assert.match(healthService, /OnFailure=ogfi-authorization-denial-health-alert@%n\.service/);
  assert.match(healthTimer, /OnUnitActiveSec=2min/);
  assert.match(healthTimer, /Persistent=true/);
  assert.match(healthAlert, /status=CRITICAL/);
  assert.match(healthAlert, /hosted_alert_delivery=PENDING/);
  for (const unit of [healthService, healthTimer, healthAlert]) {
    assert.doesNotMatch(unit, /https?:|ListenStream|ListenDatagram|aws/i);
  }
});
