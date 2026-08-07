import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDisposablePostgresIdentity } from "./disposable-postgres-lifecycle.mjs";
import { assertImmutableImageIdentity } from "./production-auth-e2e-private-db-exchange.mjs";

const read = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("production-authenticated CI edge remains a pinned Nginx-owned shared namespace", () => {
  const compose = read("infra/ci/production-authenticated-e2e/compose.yaml");
  const caddy = read("infra/ci/production-authenticated-e2e/Caddyfile");
  const nginx = read(
    "infra/ci/production-authenticated-e2e/nginx.conf.template",
  );
  const playwright = read(
    "apps/web/production-authenticated.playwright.config.ts",
  );
  const approvalWorklist = read(
    "tests/e2e/inventory-approval-worklist.production-authenticated.spec.ts",
  );
  const ordinaryPlaywright = read("apps/web/playwright.config.ts");
  const fixture = read("scripts/production-auth-e2e-fixture.ts");
  const runner = read("scripts/production-auth-e2e-runner.mjs");
  const privateDatabaseCompose = read(
    "infra/ci/production-authenticated-e2e/compose.database-lifecycle.yaml",
  );
  const privateDatabaseLifecycle = read(
    "scripts/production-auth-e2e-private-db-lifecycle.mjs",
  );
  const privateDatabaseHandoff = read(
    "scripts/production-auth-e2e-private-db-handoff.mjs",
  );
  const teardown = read("scripts/production-auth-e2e-teardown.mjs");
  const probeRoute = read(
    "apps/web/src/app/api/internal/production-auth-e2e-proxy-probe/route.ts",
  );
  const artifactSecretScan = read(
    "scripts/production-auth-e2e-artifact-secret-scan.mjs",
  );
  const packageJson = JSON.parse(read("package.json"));

  assert.match(
    compose,
    /image: \$\{OGFI_PRODUCTION_AUTH_E2E_CADDY_IMAGE:\?Set the immutable reviewed Caddy image ID\}/,
  );
  assert.match(
    compose,
    /image: docker\.io\/library\/nginx:1\.27-alpine@sha256:[a-f0-9]{64}/,
  );
  assert.doesNotMatch(compose, /network_mode: host/);
  assert.equal(
    compose.match(/network_mode: service:nginx/g)?.length,
    2,
  );
  assert.match(
    compose,
    /ports:\n\s+- "127\.0\.0\.1:3443:3443"/,
  );
  assert.match(
    compose,
    /image: \$\{OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE:\?Set the immutable exact-candidate image ID\}/,
  );
  assert.match(compose, /pull_policy: never/);
  assert.match(
    compose,
    /DATABASE_URL: \$\{OGFI_PRODUCTION_AUTH_E2E_APP_DATABASE_URL:\?Set the runtime-role private-network URL\}/,
  );
  assert.match(
    compose,
    /name: \$\{OGFI_PRODUCTION_AUTH_E2E_DATABASE_NETWORK:\?Set the run-local private database network\}/,
  );
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

  assert.match(nginx, /listen 3443 ssl/);
  assert.match(nginx, /proxy_set_header Forwarded ""/);
  assert.match(nginx, /proxy_set_header X-Real-IP \$remote_addr/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto https/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Host \$http_host/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3101/);
  assert.match(compose, /ogfi_production_auth_e2e_tls_key/);
  assert.match(compose, /mode: 0400/);
  assert.doesNotMatch(compose, /127\.0\.0\.1:310[12]/);
  assert.doesNotMatch(compose, /310[12]:310[12]/);
  assert.doesNotMatch(caddy, /tls internal/);
  assert.match(
    playwright,
    /outputDir: `test-results\/production-auth-\$\{evidenceLane\}-artifacts`/,
  );
  assert.match(
    playwright,
    /outputFolder: `test-results\/production-auth-\$\{evidenceLane\}-html`/,
  );
  assert.match(playwright, /ignoreHTTPSErrors: false/);
  assert.doesNotMatch(
    approvalWorklist,
    /packages\/database\/src\/client/,
  );
  assert.match(
    approvalWorklist,
    /async function enterPassword\(/,
  );
  assert.match(
    approvalWorklist,
    /browser\.newContext\(\{[\s\S]*baseURL: "https:\/\/127\.0\.0\.1:3443"[\s\S]*ignoreHTTPSErrors: false/,
  );
  assert.match(
    playwright,
    /gracefulShutdown: \{ signal: "SIGTERM", timeout: 180_000 \}/,
  );
  assert.match(playwright, /"production-authenticated\.spec\.ts"/);
  assert.match(
    playwright,
    /"inventory-pilot-setup\.production-authenticated\.spec\.ts"/,
  );
  assert.match(
    playwright,
    /"inventory-approval-worklist\.production-authenticated\.spec\.ts"/,
  );
  assert.match(
    ordinaryPlaywright,
    /testIgnore:\s*\[[\s\S]*"production-authenticated\.spec\.ts"[\s\S]*"inventory-pilot-setup\.production-authenticated\.spec\.ts"[\s\S]*"inventory-approval-worklist\.production-authenticated\.spec\.ts"[\s\S]*\]/,
  );
  assert.match(
    fixture,
    /requestInventoryPilotBootstrap\(\{\s*action: "CONFIGURATION_V2_SEALED",\s*\}\)/,
  );
  assert.match(fixture, /inventoryPilotConfiguration/);
  assert.match(fixture, /function assertFixtureRuntimeAdmission\(\)/);
  assert.match(
    fixture,
    /required\("AUTHORIZATION_TEST_RUN_ID"\)[\s\S]*required\("OGFI_DISPOSABLE_DATABASE_RUN_ID"\)/,
  );
  assert.match(
    fixture,
    /async function provision\(\) \{\s*assertFixtureRuntimeAdmission\(\);\s*await assertDisposableMarker\(\);/,
  );
  assert.match(
    privateDatabaseHandoff,
    /"--dir",\s*"apps\/web",\s*"exec",\s*"tsx",\s*"\.\.\/\.\.\/scripts\/production-auth-e2e-fixture\.ts"/,
  );
  assert.doesNotMatch(
    runner,
    /production-auth-e2e-fixture\.ts/,
  );
  assert.match(
    runner,
    /loadPrivateDatabaseExchange\(process\.env\)/,
  );
  assert.doesNotMatch(runner, /\["network", "create"/);
  assert.doesNotMatch(runner, /\["network", "connect"/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_PRIVATE_DB_HANDOFF_TAMPERED/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_PRIVATE_DB_RUNTIME_MARKER_DRIFT/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_BROWSER_ARTIFACT_SECRET_LEAK/);
  assert.match(
    runner,
    /DISPOSABLE_DATABASE_REMOVED_PENDING_INFRASTRUCTURE_TEARDOWN/,
  );
  assert.match(runner, /assertLiveSharedNamespace/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_PUBLICATION_DRIFT/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_PRIVATE_NETWORK_MEMBERSHIP_DRIFT/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_APP_IDENTITY_DRIFT/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_NGINX_IDENTITY_DRIFT/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_CADDY_IDENTITY_DRIFT/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_DIRECT_PORT_\$\{port\}_EXPOSED/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_UNTRUSTED_CA_ACCEPTED/);
  assert.match(runner, /\/proc\/net\/tcp/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_APP_MOUNT_DRIFT/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_APP_SECRET_ENVIRONMENT_DRIFT/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_SERVICE_EXITED/);
  assert.match(runner, /lifecycle: lifecycleContainer/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_PRIVATE_DB_LIFECYCLE_DRIFT/);
  assert.match(runner, /lifecycleDrift\.push\("tmpfs"\)/);
  assert.match(runner, /lifecycleDrift\.join\(","\)/);
  assert.match(runner, /PRODUCTION_AUTH_E2E_PRIVATE_DB_PROCESS_IDENTITY_DRIFT/);
  assert.match(runner, /databaseProcessUid !== "70"/);
  assert.match(runner, /container\.HostConfig\?\.ReadonlyRootfs !== true/);
  assert.match(runner, /lifecycle\?\.HostConfig\?\.ReadonlyRootfs !== true/);
  assert.match(runner, /normalizeSecurityOptions/);
  assert.match(runner, /Array\.isArray\(capabilities\)/);
  assert.match(runner, /Array\.isArray\(options\)/);
  assert.match(runner, /typeof tmpfs === "object"/);
  assert.match(runner, /expectedDatabaseMounts/);
  assert.match(runner, /expectedLifecycleMounts/);
  assert.match(runner, /normalizeTmpfs/);
  assert.match(runner, /"\/var\/lib\/postgresql\/data": "size=1g,mode=0700"/);
  assert.match(runner, /"\/var\/run\/postgresql": "size=1m,mode=3775"/);
  assert.match(
    runner,
    /normalizeTmpfs\(\{[\s\S]*"\/tmp": "size=64m,mode=1777",[\s\S]*"\/app\/packages\/database\/node_modules\/\.vite": "size=64m,mode=1777",[\s\S]*"\/app\/apps\/web\/node_modules\/\.vite": "size=64m,mode=1777"[\s\S]*\}\)/,
  );
  assert.match(runner, /lifecycle\?\.Config\?\.User !== expectedLifecycleUser/);
  assert.match(runner, /environment\.DATABASE_URL/);
  assert.match(
    runner,
    /decodeURIComponent\(new URL\(environment\.DATABASE_URL\)\.password\)/,
  );
  assert.match(runner, /PRODUCTION_AUTH_E2E_DEFAULT_CA_OVERRIDE_FORBIDDEN/);
  assert.match(runner, /"X-Real-IP": "203\.0\.113\.10"/);
  assert.match(runner, /probe\.body\?\.xRealIpRemoved !== true/);
  assert.match(runner, /probe\.body\?\.forwardedFor !== "127\.0\.0\.1"/);
  assert.match(runner, /probe\.body\?\.forwardedProto !== "https"/);
  assert.match(runner, /probe\.body\?\.forwardedHost !== "127\.0\.0\.1:3443"/);
  assert.match(
    runner,
    /\[\s*\["nginx", nginxId\],\s*\["caddy", caddyId\],\s*\]/,
  );
  assert.match(runner, /SECRET_ENVIRONMENT_DRIFT/);
  assert.doesNotMatch(
    runner,
    /run\("pnpm", \["--dir", "apps\/web", "build"\]/,
  );
  assert.match(
    privateDatabaseCompose,
    /image: \$\{OGFI_PRODUCTION_AUTH_E2E_DATABASE_IMAGE:\?Set a digest-pinned PostgreSQL image\}/,
  );
  assert.doesNotMatch(privateDatabaseCompose, /ports:/);
  assert.match(
    privateDatabaseCompose,
    /\/var\/lib\/postgresql\/data:size=1g,mode=0700/,
  );
  assert.match(privateDatabaseCompose, /internal: true/);
  assert.match(privateDatabaseCompose, /network_mode: service:postgres/);
  assert.match(
    privateDatabaseCompose,
    /postgres:[\s\S]*cap_drop:\n\s+- ALL[\s\S]*cap_add:\n\s+- CHOWN\n\s+- DAC_OVERRIDE\n\s+- FOWNER\n\s+- SETGID\n\s+- SETUID/,
  );
  assert.doesNotMatch(privateDatabaseCompose, /docker\.sock|privileged: true|network_mode: host/);
  assert.match(
    privateDatabaseCompose,
    /user: \$\{OGFI_PRODUCTION_AUTH_E2E_HOST_UID:\?[^\n]+HOST_GID/,
  );
  assert.match(privateDatabaseHandoff, /"browserFixture"/);
  assert.match(privateDatabaseHandoff, /removePrivateDatabaseSecretFile/);
  assert.match(privateDatabaseLifecycle, /verifyPrivateDatabaseTeardownReceipt/);
  assert.match(
    teardown,
    /OGFI_PRODUCTION_AUTH_E2E_FIXTURE_PREPROVISIONED !== "true"/,
  );
  assert.match(probeRoute, /const ordinaryProduction =/);
  assert.match(probeRoute, /const boundedUat =/);
  assert.match(probeRoute, /return shared && \(ordinaryProduction \|\| boundedUat\)/);
  assert.match(probeRoute, /return new NextResponse\(null, \{ status: 404 \}\)/);
  assert.match(probeRoute, /xRealIpRemoved: !requestHeaders\.has\("x-real-ip"\)/);
  assert.match(probeRoute, /forwardedFor: requestHeaders\.get\("x-forwarded-for"\)/);
  assert.match(probeRoute, /forwardedProto: requestHeaders\.get\("x-forwarded-proto"\)/);
  assert.match(probeRoute, /forwardedHost: requestHeaders\.get\("x-forwarded-host"\)/);
  assert.match(artifactSecretScan, /runtimePassword/);
  assert.match(artifactSecretScan, /databaseUrl/);
  assert.match(artifactSecretScan, /PRODUCTION_AUTH_E2E_RETAINED_ARTIFACT_SECRET_LEAK/);
  assert.equal(
    packageJson.scripts["test:e2e:production-authenticated"],
    "node scripts/production-auth-e2e-ci-only.mjs",
  );
  const workflow = read(".github/workflows/ci.yml");
  assert.match(workflow, /production-authenticated-browser:/);
  assert.match(workflow, /lane:\n\s+- production\n\s+- bounded-uat/);
  assert.match(
    workflow,
    /production-authenticated-browser:[\s\S]*NODE_ENV: production[\s\S]*name: Install host test tooling\n\s+run: pnpm install --frozen-lockfile --prod=false[\s\S]*pnpm --dir apps\/web exec playwright install --with-deps chromium/,
  );
  assert.match(workflow, /production\) database_run_lane=release ;;/);
  assert.match(workflow, /bounded-uat\) database_run_lane=bounded ;;/);
  assert.match(
    workflow,
    /run_id="ci-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}-\$\{database_run_lane\}"/,
  );
  assert.doesNotMatch(
    workflow,
    /run_id="\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}-\$\{lane\}"/,
  );
  for (const runId of ["ci-31135220330-1-release", "ci-31135220330-1-bounded"]) {
    assert.doesNotThrow(() =>
      createDisposablePostgresIdentity(runId, "a".repeat(64)),
    );
  }
  assert.match(workflow, /Build immutable candidate and proxy images/);
  assert.match(workflow, /--target release-runner/);
  assert.match(workflow, /OGFI_PRODUCTION_AUTH_E2E_WEB_IMAGE/);
  assert.doesNotMatch(workflow, /job\.services\.postgres\.id/);
  assert.match(
    workflow,
    /postgres:17-alpine@sha256:[a-f0-9]{64}/,
  );
  assert.match(workflow, /Start isolated disposable database lifecycle/);
  assert.match(
    privateDatabaseCompose,
    /CI: "true"[\s\S]*NODE_ENV: production[\s\S]*APP_ENV: \$\{APP_ENV:\?Set the lane application environment\}[\s\S]*AUTH_MODE: local[\s\S]*AUTH_HARDENED_UAT_RUNTIME_ENABLED: \$\{AUTH_HARDENED_UAT_RUNTIME_ENABLED:-false\}[\s\S]*BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED: \$\{BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED:-false\}[\s\S]*APPROVAL_ROUTING_V1_ENABLED: "false"/,
  );
  assert.doesNotMatch(workflow, /NODE_EXTRA_CA_CERTS/);
  assert.match(workflow, /OGFI_PRODUCTION_AUTH_E2E_LIFECYCLE_CONTAINER_ID=\$lifecycle_id/);
  assert.match(workflow, /Scan completed browser artifacts before cleanup and upload/);
  assert.match(workflow, /capture-private-database/);
  assert.match(workflow, /Lifecycle-only host database authority was not unlinked/);
  assert.match(
    workflow,
    /rm -f -- \\\n\s+"\$OGFI_PRODUCTION_AUTH_E2E_DATABASE_ADMIN_PASSWORD_FILE" \\\n\s+"\$OGFI_PRODUCTION_AUTH_E2E_DATABASE_ADMIN_URL_FILE"/,
  );
  assert.match(workflow, /OGFI_PRODUCTION_AUTH_E2E_POST_BROWSER_SCAN_PASSED/);
  assert.match(workflow, /OGFI_PRODUCTION_AUTH_E2E_ARTIFACT_UPLOAD_ALLOWED == 'true'/);
  assert.doesNotMatch(workflow, /seq 1 600/);
  assert.match(workflow, /artifactUpload:"BLOCKED"/);
  assert.match(workflow, /pnpm test:e2e:production-authenticated:execute/);
  assert.doesNotMatch(
    workflow,
    /name: Production-authenticated browser lane\n\s+run: pnpm test:e2e:production-authenticated\n/,
  );
  assert.match(workflow, /databaseContainer:"VERIFIED_REMOVED"/);
  assert.match(workflow, /privateNetwork:"VERIFIED_REMOVED"/);
});

test("database lifecycle accepts the digest-pinned image reference used by CI", () => {
  const image = `docker.io/library/postgres:17-alpine@sha256:${"a".repeat(64)}`;
  assert.equal(assertImmutableImageIdentity(image, "IMAGE_INVALID"), image);
});
