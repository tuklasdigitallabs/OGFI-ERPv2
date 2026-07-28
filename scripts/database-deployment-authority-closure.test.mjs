import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const deploy = source("scripts/release-staging-deploy.sh");
const rollback = source("scripts/release-staging-rollback.sh");
const rollbackSummary = source("scripts/release-rollback-summary.mjs");
const migrationUnit = source("infra/systemd/database/ogfi-db-migrate@.service");
const verifierUnit = source("infra/systemd/database/ogfi-db-role-verify.service");
const verifierTimer = source("infra/systemd/database/ogfi-db-role-verify.timer");
const releaseUnit = source("infra/systemd/release/ogfi-release@.service");
const releaseReadme = source("infra/systemd/release/README.md");
const caddy = source("infra/caddy/Caddyfile.example");
const tmpfiles = source("infra/systemd/tmpfiles.d/ogfi-deploy.conf");
const releaseWorkflow = source(".github/workflows/staging-release.yml");
const rollbackWorkflow = source(".github/workflows/staging-rollback.yml");
const controlledMigration = source("scripts/db-migrate-controlled.mjs");
const decision = source("docs/core/00-governance/decisions/DEC-0248-SINGLE-HOST-CONTROLLED-DEPLOYMENT-FENCE.md");

test("legacy deploy, rollback, and standalone migration paths fail closed", () => {
  for (const script of [deploy, rollback]) {
    assert.match(script, /exit 78/);
    assert.doesNotMatch(script, /\b(?:ssh|scp|docker|systemctl|pnpm)\b/);
  }
  assert.match(rollbackSummary, /process\.exitCode = 78/);
  assert.doesNotMatch(rollbackSummary, /RESULT \| PASS|writeFileSync/);
  assert.match(migrationUnit, /^RefuseManualStart=yes$/m);
  assert.match(migrationUnit, /^RefuseManualStop=yes$/m);
  assert.match(migrationUnit, /^ExecStart=\/usr\/bin\/false$/m);
  assert.doesNotMatch(migrationUnit, /LoadCredential|MIGRATION_DATABASE_URL|RUNTIME_DATABASE_URL|OGFI_APPLICATION_ENV_FILE/);
  for (const unit of [verifierUnit, verifierTimer]) {
    assert.match(unit, /^RefuseManualStart=yes$/m);
    assert.match(unit, /^RefuseManualStop=yes$/m);
    assert.doesNotMatch(unit, /LoadCredential|database-(?:migrator|runtime)-url|\/opt\/ogfi\/current/);
  }
  assert.match(verifierUnit, /^ExecStart=\/usr\/bin\/false$/m);
  for (const workflow of [releaseWorkflow, rollbackWorkflow]) {
    assert.match(workflow, /exit 78/);
    assert.doesNotMatch(workflow, /ssh-keyscan|\bscp\b|STAGING_SSH_PRIVATE_KEY/);
  }

  assert.match(controlledMigration, /direct execution is disabled/);
  assert.match(controlledMigration, /process\.exitCode = 78/);
  const directMigration = spawnSync(process.execPath, ["scripts/db-migrate-controlled.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(directMigration.status, 78);
  assert.match(directMigration.stderr, /DEC-0248 requires invocation inside the root-owned release service/);
});

test("future request, lock, journal, state, and evidence paths preserve the root boundary", () => {
  assert.match(tmpfiles, /^d \/run\/ogfi-deploy 0750 root root -$/m);
  assert.match(tmpfiles, /^f \/run\/ogfi-deploy\/release-session\.lock 0640 root root -$/m);
  assert.match(tmpfiles, /^d \/var\/spool\/ogfi-release\/incoming 0730 root ogfi-deploy 1d$/m);
  assert.match(tmpfiles, /^d \/var\/spool\/ogfi-release\/approved 0700 root root -$/m);
  assert.match(tmpfiles, /^d \/var\/spool\/ogfi-release\/admitted 0700 root root -$/m);
  assert.match(tmpfiles, /^d \/var\/lib\/ogfi\/release-state 0700 root root -$/m);
  assert.doesNotMatch(tmpfiles, /^f .* ogfi-deploy /m);
});

test("amended decision requires one service, immutable artifacts, split credentials, and durable recovery", () => {
  assert.match(decision, /one root-owned\s+`ogfi-release@<opaque-id>\.service`/);
  assert.match(decision, /host performs no dependency installation or release build/);
  assert.match(decision, /migration subprocess sees only the migrator credential/);
  assert.match(decision, /fsync-safe phase journal/);
  assert.match(decision, /recovery must acquire the same fence/);
  assert.match(decision, /production NO-GO/);
});

test("the future release authority is a root-only fixed-fence service, not a candidate path", () => {
  assert.match(releaseUnit, /^User=root$/m);
  assert.match(releaseUnit, /^KillMode=control-group$/m);
  assert.match(releaseUnit, /\/usr\/bin\/flock --nonblock/);
  assert.match(releaseUnit, /\/run\/ogfi-deploy\/release-session\.lock/);
  assert.match(releaseUnit, /\/usr\/libexec\/ogfi-release\/current\/ogfi-release-controller\.mjs/);
  assert.doesNotMatch(releaseUnit, /\/opt\/ogfi\/current|EnvironmentFile=|LoadCredential=/);
  assert.match(releaseReadme, /must never be\s+run from a candidate release tree/);
  assert.match(releaseReadme, /always ends in maintenance-required state/);
});

test("served release identity removes upstream fence values before Caddy stamps its controller value", () => {
  assert.match(caddy, /@release_identity path \/\.well-known\/ogfi-release/);
  assert.match(caddy, /header -X-OGFI-Proxy-Fence/);
  assert.match(caddy, /header X-OGFI-Proxy-Fence "\{\$OGFI_RELEASE_SERVE_FENCE_ID:\}"/);
  assert.match(caddy, /header Cache-Control "no-store, max-age=0"/);
});
