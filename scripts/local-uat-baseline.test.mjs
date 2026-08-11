import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_UAT_ALLOWED_TABLES,
  LOCAL_UAT_NEVER_COPIED_TABLES,
  assertLocalUatCreateOptions,
  buildAllowlistLoadSql,
  buildCanonicalExportSql,
  canonicalDigest,
  cleanupFailedCandidate,
  parseLocalUatArguments,
  sanitizedRuntimeEnvironment,
} from "./local-uat-baseline.mjs";

test("requires explicit local source, isolated target, project, and confirmation", () => {
  const parsed = parseLocalUatArguments(["create", "--source-container", "ogfi-clean-postgres-1", "--source-project", "ogfi-clean", "--source-db", "ogfi_erp", "--target-db", "ogfi_rehearsal_local_aug10", "--project", "ogfi-uat-aug10", "--web-image-id", `sha256:${"a".repeat(64)}`, "--edge-image-id", `sha256:${"b".repeat(64)}`, "--confirm", "CREATE_ISOLATED_LOCAL_UAT_BASELINE"]);
  assert.equal(assertLocalUatCreateOptions(parsed).targetDatabase, "ogfi_rehearsal_local_aug10");
  assert.deepEqual(parseLocalUatArguments(["--", "create", "--source-db", "ogfi_erp"]), {
    command: "create",
    "source-db": "ogfi_erp",
  });
  for (const unsafe of ["ogfi_erp", "production", "ogfi_rehearsal_local_x;drop"])
    assert.throws(() => assertLocalUatCreateOptions({ ...parsed, "target-db": unsafe }), /LOCAL_UAT_TARGET_DATABASE_INVALID/);
  assert.throws(() => assertLocalUatCreateOptions({ ...parsed, confirm: "yes" }), /LOCAL_UAT_CONFIRMATION_REQUIRED/);
  assert.throws(() => assertLocalUatCreateOptions({ ...parsed, "source-project": "production" }), /LOCAL_UAT_SOURCE_PROJECT_INVALID/);
  assert.throws(() => assertLocalUatCreateOptions({ ...parsed, "web-image-id": "ogfi-clean-web:latest" }), /LOCAL_UAT_WEB_IMAGE_ID_INVALID/);
  assert.throws(() => assertLocalUatCreateOptions({ ...parsed, "edge-image-id": "nginx:latest" }), /LOCAL_UAT_EDGE_IMAGE_ID_INVALID/);
});

test("exports one canonical allowlist and excludes execution, auth-token, ledger, and sequence state", () => {
  const sql = buildCanonicalExportSql();
  for (const table of ["Tenant", "PasswordCredential", "MfaAuthenticator", "OperationalReasonCode", "ApprovalRule"]) assert.match(sql, new RegExp(`'${table}'`));
  for (const table of LOCAL_UAT_NEVER_COPIED_TABLES) {
    assert.ok(!LOCAL_UAT_ALLOWED_TABLES.includes(table), table);
    assert.doesNotMatch(sql, new RegExp(`'${table}'`));
  }
  assert.doesNotMatch(sql, /MfaRecoveryCode|DocumentNumberSequence|InventoryMovement|'Budget'|'BudgetLine'|'FinanceAccountClass'|'ChartOfAccount'|'FiscalYear'|'AccountingPeriod'/);
  assert.doesNotMatch(sql, /ApprovalRuleLifecycleIntent/);
});

test("approval rules restore through unsealed insert, step insert, then seal without trigger bypass", () => {
  const payload = JSON.stringify({ schemaVersion: 1, tables: Object.fromEntries(LOCAL_UAT_ALLOWED_TABLES.map((table) => [table, []])) });
  const sql = buildAllowlistLoadSql(payload);
  const unsealed = sql.indexOf('UPDATE uat_new_approval_rules SET "definitionSealed" = FALSE');
  const ruleInsert = sql.indexOf('INSERT INTO public."ApprovalRule" SELECT');
  const stepInsert = sql.indexOf('INSERT INTO public."ApprovalRuleStep"');
  const seal = sql.indexOf('UPDATE public."ApprovalRule" rule SET "definitionSealed" = TRUE');
  assert.ok(unsealed < ruleInsert && ruleInsert < stepInsert && stepInsert < seal);
  assert.doesNotMatch(sql, /DISABLE TRIGGER|session_replication_role|TRUNCATE/);
  assert.match(sql, /LOCAL_UAT_MIGRATION_APPROVAL_RULE_DRIFT/);
  assert.equal((sql.match(/INSERT INTO uat_baseline_payload VALUES/g) ?? []).length, 1);
});

test("canonical digest is key-order independent", () => {
  assert.equal(canonicalDigest({ b: 2, a: { d: 4, c: 3 } }), canonicalDigest({ a: { c: 3, d: 4 }, b: 2 }));
});

test("runtime environment removes every database authority input", () => {
  const result = sanitizedRuntimeEnvironment("AUTH_SECRET=ok\nDATABASE_URL=source\nDIRECT_DATABASE_URL=migrator\nDISPOSABLE_DATABASE_ADMIN_URL=admin\nPGPASSWORD=secret\n");
  assert.equal(result, "AUTH_SECRET=ok\n");
});

test("failed-candidate cleanup does not depend on a mutable or missing Compose env", () => {
  const calls = [];
  const removals = [];
  const listCalls = new Map();
  const run = (_command, args) => {
    calls.push(args);
    const key = `${args[0]}:${args[1] ?? ""}`;
    const count = listCalls.get(key) ?? 0;
    listCalls.set(key, count + 1);
    if (args[0] === "ps") return { status: 0, stdout: count === 0 ? "web-id\noneoff-id\n" : "" };
    if (args[0] === "volume" && args[1] === "ls") return { status: 0, stdout: count === 0 ? "volume-id\n" : "" };
    if (args[0] === "network" && args[1] === "ls") return { status: 0, stdout: count === 0 ? "network-id\n" : "" };
    return { status: 0, stdout: "" };
  };
  cleanupFailedCandidate(
    { project: "ogfi-uat-aug10", secretFiles: ["compose.env", "operator.env"] },
    { run, remove: (file) => removals.push(file) },
  );
  assert.ok(calls.every((args) => !args.includes("compose") && !args.includes("--env-file")));
  assert.deepEqual(removals, ["compose.env", "operator.env"]);
  assert.ok(calls.some((args) => args[0] === "rm" && args.includes("oneoff-id")));
});

test("failed-candidate cleanup aggregates resource failures after every fallback and secret attempt", () => {
  const removals = [];
  let psLists = 0;
  let volumeLists = 0;
  const run = (_command, args) => {
    if (args[0] === "ps") return { status: psLists++ === 0 ? 1 : 0, stdout: "" };
    if (args[0] === "volume" && args[1] === "ls") return { status: 0, stdout: volumeLists++ === 0 ? "volume-id\n" : "" };
    if (args[0] === "network" && args[1] === "ls") return { status: 0, stdout: "" };
    if (args[0] === "volume" && args[1] === "rm") return { status: 1, stdout: "" };
    return { status: 0, stdout: "" };
  };
  assert.throws(
    () => cleanupFailedCandidate(
      { project: "ogfi-uat-aug10", secretFiles: ["compose.env", "operator.env"] },
      { run, remove: (file) => removals.push(file) },
    ),
    /RESOURCE_LIST_FAILED:CONTAINER.*VOLUME_REMOVE_FAILED:volume-id/,
  );
  assert.deepEqual(removals, ["compose.env", "operator.env"]);
});

test("failed-candidate cleanup continues deleting secrets after an individual removal failure", () => {
  const removals = [];
  const run = () => ({ status: 0, stdout: "" });
  assert.throws(
    () => cleanupFailedCandidate(
      { project: "ogfi-uat-aug10", secretFiles: ["compose.env", "operator.env", "runtime.env"] },
      { run, remove: (file) => { removals.push(file); if (file === "operator.env") throw new Error("locked"); } },
    ),
    /SECRET_DELETE_FAILED:operator\.env/,
  );
  assert.deepEqual(removals, ["compose.env", "operator.env", "runtime.env"]);
});

test("standalone compose stays source-isolated behind a pinned credential-free loopback edge", async () => {
  const { readFile } = await import("node:fs/promises");
  const compose = await readFile(new URL("../infra/docker/compose.local-uat.yaml", import.meta.url), "utf8");
  assert.match(compose, /uat_private:\n    internal: true/);
  assert.match(compose, /uat_edge:\n    driver: bridge/);
  assert.match(compose, /OGFI_LOCAL_UAT_BASELINE_REQUIRED: "true"/);
  assert.match(compose, /OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME/);
  assert.match(compose, /OGFI_DISPOSABLE_DATABASE_RUN_ID/);
  assert.match(compose, /OGFI_DISPOSABLE_DATABASE_NONCE_SHA256/);
  assert.doesNotMatch(compose, /external: true|ogfi-clean|postgres:5432\/ogfi_erp/);
  assert.match(compose, /DIRECT_DATABASE_URL: ""/);
  assert.match(compose, /image: \$\{OGFI_LOCAL_UAT_WEB_IMAGE_ID/);
  assert.match(compose, /image: \$\{OGFI_LOCAL_UAT_EDGE_IMAGE_ID/);
  assert.match(compose, /pull_policy: never/);
  assert.doesNotMatch(compose, /\n\s+build:/);
  assert.doesNotMatch(compose, /\.\.\/\.\.\/\.env/);
  const postgresBlock = compose.slice(compose.indexOf("  postgres:"), compose.indexOf("  web:"));
  const webBlock = compose.slice(compose.indexOf("  web:"), compose.indexOf("  worker:"));
  const workerBlock = compose.slice(compose.indexOf("  worker:"), compose.indexOf("  edge:"));
  const edgeBlock = compose.slice(compose.indexOf("  edge:"), compose.indexOf("\nnetworks:"));
  assert.match(postgresBlock, /networks:\n      - uat_private/);
  assert.doesNotMatch(postgresBlock, /uat_edge|\n    ports:/);
  assert.match(webBlock, /networks:\n      - uat_private/);
  assert.doesNotMatch(webBlock, /uat_edge/);
  assert.doesNotMatch(webBlock, /\n    ports:/);
  assert.match(workerBlock, /OPENING_INVENTORY_EXECUTOR_ENABLED: "true"/);
  assert.match(workerBlock, /OGFI_LOCAL_UAT_EXECUTOR_ENV_FILE/);
  assert.doesNotMatch(workerBlock, /OGFI_LOCAL_UAT_OPERATOR_ENV_FILE|MIGRATOR_DATABASE_URL/);
  assert.match(workerBlock, /healthcheck:[\s\S]*kill -0 1/);
  assert.match(workerBlock, /networks:\n      - uat_private/);
  assert.doesNotMatch(workerBlock, /uat_edge|\n    ports:/);
  assert.match(edgeBlock, /127\.0\.0\.1:\$\{OGFI_LOCAL_UAT_WEB_PORT:-3002\}:8080/);
  assert.match(edgeBlock, /user: "101:101"/);
  assert.match(edgeBlock, /read_only: true/);
  assert.match(edgeBlock, /cap_drop:\n      - ALL/);
  assert.match(edgeBlock, /networks:\n      - uat_private\n      - uat_edge/);
  assert.doesNotMatch(edgeBlock, /env_file:|DATABASE_URL|AUTH_SECRET|volumes:/);
  const edgeConfig = await readFile(new URL("../infra/docker/local-uat-nginx.conf", import.meta.url), "utf8");
  assert.match(edgeConfig, /proxy_pass http:\/\/web:3000;/);
  assert.match(edgeConfig, /access_log off;/);
  assert.doesNotMatch(edgeConfig, /\bresolver\b|proxy_pass\s+http:\/\/\$|\bCONNECT\b/i);
  const edgeDockerfile = await readFile(new URL("../infra/docker/Dockerfile.local-uat-edge", import.meta.url), "utf8");
  assert.match(edgeDockerfile, /nginx:1\.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10/);
  assert.match(edgeDockerfile, /COPY local-uat-nginx\.conf \/etc\/nginx\/nginx\.conf/);
  assert.match(edgeDockerfile, /USER 101:101/);
  assert.match(edgeDockerfile, /ENTRYPOINT \["nginx", "-c", "\/etc\/nginx\/nginx\.conf"/);
  const webDockerfile = await readFile(new URL("../infra/docker/Dockerfile.web.example", import.meta.url), "utf8");
  assert.match(webDockerfile, /COPY apps\/worker\/package\.json apps\/worker\/package\.json/);
  assert.match(webDockerfile, /pnpm --filter @ogfi\/worker build/);
  const builder = await readFile(new URL("./local-uat-baseline.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(builder, /\bpg_dump\b|full source backup|allowlist-export\.json/i);
  assert.match(builder, /PGOPTIONS=-c default_transaction_read_only=on/);
  assert.match(builder, /container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1"/);
  assert.match(builder, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(builder, /LOCAL_UAT_CROSS_TENANT_ROLE_ASSIGNMENT/);
  assert.match(builder, /LOCAL_UAT_SCOPE_OWNERSHIP_INVALID/);
  assert.match(builder, /docker\(\["context", "show"\]\) !== "desktop-linux"/);
  assert.match(builder, /sourceDigestAfter/);
  assert.match(builder, /runtimeFlags/);
  assert.match(builder, /constructionComplete: true, uatAdmitted: false/);
  assert.match(builder, /org\.opencontainers\.image\.revision/);
  assert.match(builder, /LOCAL_UAT_REVIEWED_WORKTREE_NOT_CLEAN/);
  assert.match(builder, /OGFI_LOCAL_UAT_CONSTRUCTION_TOKEN/);
  assert.match(builder, /compose\(composeEnv, \["up", "-d", "postgres"\]\);\s*waitForHealthy\(targetContainer\);/);
  assert.match(builder, /\/app\/packages\/database\/node_modules\/\.bin\/prisma/);
  assert.match(builder, /\/app\/apps\/web\/node_modules\/\.bin\/tsx/);
  assert.doesNotMatch(builder, /\/app\/node_modules\/(?:prisma|tsx)\//);
  assert.match(builder, /assertSourceDatabaseUnreachable\(webContainer, source\)/);
  assert.match(builder, /assertSourceDatabaseUnreachable\(workerContainer, source\)/);
  assert.match(builder, /waitForLoopbackHealth\(options\.webPort\)/);
  assert.match(builder, /assertEdgeRuntime\(targetEdge, options\)/);
  assert.match(builder, /sourceConnectivityDeniedFromWeb: true/);
  assert.match(builder, /sourceConnectivityDeniedFromWorker: true/);
  assert.match(builder, /label=com\.docker\.compose\.project=/);
  assert.match(builder, /LOCAL_UAT_FAILED_CONSTRUCTION_CLEANUP_INCOMPLETE/);
  const manifestBlock = builder.slice(builder.indexOf("const manifest ="), builder.indexOf("writeSecure(manifestFile"));
  assert.doesNotMatch(manifestBlock, /constructionToken/);
  assert.doesNotMatch(builder, /compose\(composeEnv, \["build", "web"\]\)/);
});
