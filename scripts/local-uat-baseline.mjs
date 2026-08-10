import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const composeFile = path.join(repositoryRoot, "infra/docker/compose.local-uat.yaml");
const roleSqlDir = path.join(repositoryRoot, "infra/hostinger/postgres");
const confirmation = "CREATE_ISOLATED_LOCAL_UAT_BASELINE";

export const LOCAL_UAT_ALLOWED_TABLES = Object.freeze([
  "Tenant", "Company", "Brand", "Location", "Department", "CostCenter",
  "User", "Role", "Permission", "RolePermission", "UserRoleAssignment",
  "UserScopeAssignment", "AuthIdentity", "PasswordCredential", "MfaAuthenticator",
  "Supplier", "SupplierContact", "ItemCategory", "Uom", "Item",
  "ItemUomConversion", "SupplierItemLink", "SupplierPriceHistory",
  "InventoryLocation", "OperationalReasonCode", "WastagePolicy",
  "CompanyPolicySetting", "WorkflowTransitionPolicy",
  "ApprovalRule", "ApprovalRuleStep",
]);

export const LOCAL_UAT_NEVER_COPIED_TABLES = Object.freeze([
  "AuthSession", "AuthActivationToken", "AuthRecoveryRequest", "AuthBootstrapState",
  "AuthLoginAttempt", "AuthenticationThrottleWindow", "AuthSessionInvalidation",
  "MfaRecoveryCode", "ApprovalInstance", "InventoryMovement", "InventoryBalance",
  "PurchaseRequest", "QuotationRequest", "SupplierQuotation", "PurchaseOrder",
  "GoodsReceipt", "InventoryTransfer", "StockCountSession", "StockCountAttempt",
  "WastageReport", "StockAdjustment", "OpeningInventoryCohort",
  "OpeningInventoryCutover", "InventoryPilotConfigurationRevision", "AuditEvent",
  "Notification", "Attachment", "DocumentNumberSequence",
  "ApprovalRuleLifecycleIntent",
  "Budget", "BudgetLine",
  "FinanceAccountClass", "ChartOfAccount", "FiscalYear", "AccountingPeriod",
]);

const tableLoadOrder = LOCAL_UAT_ALLOWED_TABLES.filter(
  (table) => !["ApprovalRule", "ApprovalRuleStep"].includes(table),
);
const safeTargetPattern = /^ogfi_rehearsal_local_[a-z0-9_]{4,30}$/;
const safeProjectPattern = /^ogfi-uat-[a-z0-9-]{4,30}$/;
const safeSourceProjectPattern = /^ogfi-clean(?:-[a-z0-9-]+)?$/;
const safeContainerPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,127}$/;
const exactImageIdPattern = /^sha256:[a-f0-9]{64}$/;

export function parseLocalUatArguments(argv) {
  const [command = "", ...tokens] = argv;
  const values = { command };
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error("LOCAL_UAT_ARGUMENTS_INVALID");
    }
    values[flag.slice(2)] = value;
  }
  return values;
}

export function assertLocalUatCreateOptions(options) {
  if (options.command !== "create") throw new Error("LOCAL_UAT_COMMAND_INVALID");
  if (options.confirm !== confirmation) throw new Error("LOCAL_UAT_CONFIRMATION_REQUIRED");
  if (options["source-db"] !== "ogfi_erp") throw new Error("LOCAL_UAT_SOURCE_DATABASE_INVALID");
  if (!safeTargetPattern.test(options["target-db"] ?? "")) throw new Error("LOCAL_UAT_TARGET_DATABASE_INVALID");
  if (!safeProjectPattern.test(options.project ?? "")) throw new Error("LOCAL_UAT_PROJECT_INVALID");
  if (!safeContainerPattern.test(options["source-container"] ?? "")) throw new Error("LOCAL_UAT_SOURCE_CONTAINER_INVALID");
  if (!safeSourceProjectPattern.test(options["source-project"] ?? "")) throw new Error("LOCAL_UAT_SOURCE_PROJECT_INVALID");
  if (!exactImageIdPattern.test(options["web-image-id"] ?? "")) throw new Error("LOCAL_UAT_WEB_IMAGE_ID_INVALID");
  if (!/^\d{4,5}$/.test(options["web-port"] ?? "3002")) throw new Error("LOCAL_UAT_WEB_PORT_INVALID");
  return {
    sourceContainer: options["source-container"],
    sourceDatabase: options["source-db"],
    sourceProject: options["source-project"],
    targetDatabase: options["target-db"],
    project: options.project,
    webPort: options["web-port"] ?? "3002",
    webImageId: options["web-image-id"],
  };
}

export function buildCanonicalExportSql(tables = LOCAL_UAT_ALLOWED_TABLES) {
  const entries = tables.map((table) =>
    `${sqlLiteral(table)}, COALESCE((SELECT jsonb_agg(to_jsonb(row_data) ORDER BY to_jsonb(row_data)::text) FROM public.${sqlIdentifier(table)} row_data), '[]'::jsonb)`,
  );
  return `SELECT jsonb_build_object('schemaVersion', 1, 'tables', jsonb_build_object(${entries.join(",")}))::text;`;
}

export function buildAllowlistLoadSql(payloadText) {
  const delimiter = `$uat_${createHash("sha256").update(payloadText).digest("hex").slice(0, 16)}$`;
  if (payloadText.includes(delimiter)) throw new Error("LOCAL_UAT_EXPORT_DELIMITER_COLLISION");
  const payload = `(SELECT payload FROM uat_baseline_payload)`;
  const statements = tableLoadOrder.map((table) =>
    `INSERT INTO public.${sqlIdentifier(table)} SELECT * FROM jsonb_populate_recordset(NULL::public.${sqlIdentifier(table)}, (${payload} -> 'tables' -> ${sqlLiteral(table)}));`,
  );
  return `BEGIN;
CREATE TEMP TABLE uat_baseline_payload (payload jsonb NOT NULL);
INSERT INTO uat_baseline_payload VALUES (${delimiter}${payloadText}${delimiter}::jsonb);
DELETE FROM public."RolePermission";
DELETE FROM public."Permission";
DELETE FROM public."WorkflowTransitionPolicy";
DELETE FROM public."OperationalReasonCode";
${statements.join("\n")}
CREATE TEMP TABLE uat_incoming_approval_rules (LIKE public."ApprovalRule" INCLUDING DEFAULTS);
INSERT INTO uat_incoming_approval_rules SELECT * FROM jsonb_populate_recordset(NULL::public."ApprovalRule", (${payload} -> 'tables' -> 'ApprovalRule'));
DO $approval_rule_collision$
BEGIN
  IF EXISTS (SELECT 1 FROM uat_incoming_approval_rules source JOIN public."ApprovalRule" target USING (id) WHERE to_jsonb(source) IS DISTINCT FROM to_jsonb(target)) THEN
    RAISE EXCEPTION 'LOCAL_UAT_MIGRATION_APPROVAL_RULE_DRIFT';
  END IF;
END $approval_rule_collision$;
CREATE TEMP TABLE uat_new_approval_rules AS SELECT source.* FROM uat_incoming_approval_rules source LEFT JOIN public."ApprovalRule" target USING (id) WHERE target.id IS NULL;
UPDATE uat_new_approval_rules SET "definitionSealed" = FALSE;
INSERT INTO public."ApprovalRule" SELECT * FROM uat_new_approval_rules ORDER BY "version", "id";
CREATE TEMP TABLE uat_incoming_approval_steps (LIKE public."ApprovalRuleStep" INCLUDING DEFAULTS);
INSERT INTO uat_incoming_approval_steps SELECT * FROM jsonb_populate_recordset(NULL::public."ApprovalRuleStep", (${payload} -> 'tables' -> 'ApprovalRuleStep'));
DO $approval_step_collision$
BEGIN
  IF EXISTS (SELECT 1 FROM uat_incoming_approval_steps source JOIN public."ApprovalRuleStep" target USING (id) WHERE to_jsonb(source) IS DISTINCT FROM to_jsonb(target)) THEN
    RAISE EXCEPTION 'LOCAL_UAT_MIGRATION_APPROVAL_STEP_DRIFT';
  END IF;
  IF EXISTS (SELECT 1 FROM uat_incoming_approval_steps source LEFT JOIN public."ApprovalRuleStep" target USING (id) LEFT JOIN uat_new_approval_rules new_rule ON new_rule.id = source."approvalRuleId" WHERE target.id IS NULL AND new_rule.id IS NULL) THEN
    RAISE EXCEPTION 'LOCAL_UAT_MIGRATION_APPROVAL_STEP_SET_DRIFT';
  END IF;
END $approval_step_collision$;
INSERT INTO public."ApprovalRuleStep" SELECT source.* FROM uat_incoming_approval_steps source JOIN uat_new_approval_rules rule ON rule.id = source."approvalRuleId" ORDER BY source."stepOrder", source.id;
UPDATE public."ApprovalRule" rule SET "definitionSealed" = TRUE FROM uat_new_approval_rules source WHERE source.id = rule.id;
COMMIT;`;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalDigest(payload) {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    const safe = String(result.stderr ?? result.error?.message ?? "").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[DATABASE_URL_REDACTED]").slice(-4000);
    throw new Error(`LOCAL_UAT_COMMAND_FAILED:${path.basename(command)}:${safe}`);
  }
  return String(result.stdout ?? "").trim();
}

function docker(args, options) {
  return execute(process.env.OGFI_DOCKER_COMMAND ?? "docker", args, options);
}

function inspectContainer(name) {
  const parsed = JSON.parse(docker(["inspect", name]));
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]?.State?.Running) {
    throw new Error("LOCAL_UAT_CONTAINER_NOT_RUNNING");
  }
  return parsed[0];
}

function assertLocalSource(containerName, databaseName, project) {
  const inspected = inspectContainer(containerName);
  if (!String(inspected.Config?.Image ?? "").startsWith("postgres:17")) throw new Error("LOCAL_UAT_SOURCE_IMAGE_INVALID");
  const environment = Object.fromEntries((inspected.Config?.Env ?? []).map((entry) => entry.split(/=(.*)/s).slice(0, 2)));
  if (environment.POSTGRES_DB !== databaseName) throw new Error("LOCAL_UAT_SOURCE_IDENTITY_MISMATCH");
  if (inspected.Config?.Labels?.["com.docker.compose.project"] !== project || inspected.Config?.Labels?.["com.docker.compose.service"] !== "postgres") {
    throw new Error("LOCAL_UAT_SOURCE_COMPOSE_IDENTITY_MISMATCH");
  }
  const bindings = inspected.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  if (!bindings.length || bindings.some((binding) => !["127.0.0.1", "::1"].includes(binding.HostIp))) {
    throw new Error("LOCAL_UAT_SOURCE_NOT_LOOPBACK_ONLY");
  }
  return { inspected, user: environment.POSTGRES_USER ?? "postgres" };
}

function psql(container, user, database, sql, password) {
  const args = ["exec", "-i"];
  if (password) args.push("-e", `PGPASSWORD=${password}`);
  args.push(container, "psql", "-X", "-v", "ON_ERROR_STOP=1");
  if (password) args.push("-h", "127.0.0.1");
  args.push("-U", user, "-d", database, "-A", "-t");
  return docker(args, { input: sql });
}

function psqlReadOnly(container, user, database, sql) {
  return docker([
    "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
    container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", user,
    "-d", database, "-A", "-t",
  ], { input: sql });
}

function psqlFile(container, user, database, file, variables, password) {
  const args = ["exec", "-i"];
  if (password) args.push("-e", `PGPASSWORD=${password}`);
  args.push(container, "psql", "-X", "-v", "ON_ERROR_STOP=1");
  if (password) args.push("-h", "127.0.0.1");
  args.push("-U", user, "-d", database);
  for (const [key, value] of Object.entries(variables)) args.push("--variable", `${key}=${value}`);
  return docker(args, { input: readFileSync(file, "utf8") });
}

function compose(envFile, args, options) {
  return docker(["compose", "-f", composeFile, "--env-file", envFile, ...args], options);
}

function securePath(target, directory = false) {
  chmodSync(target, directory ? 0o700 : 0o600);
  if (/^\/mnt\/[a-z]\//i.test(target)) {
    const drive = target[5].toUpperCase();
    const windowsPath = `${drive}:\\${target.slice(7).replaceAll("/", "\\")}`;
    const cmd = "/mnt/c/Windows/System32/cmd.exe";
    const identity = execute(cmd, ["/D", "/S", "/C", "echo", "%USERDOMAIN%\\%USERNAME%"]).trim();
    const grant = directory ? `${identity}:(OI)(CI)F` : `${identity}:F`;
    execute("/mnt/c/Windows/System32/icacls.exe", [windowsPath, "/inheritance:r", "/grant:r", grant]);
  } else if (process.platform === "win32") {
    const identity = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    execute("icacls.exe", [target, "/inheritance:r", "/grant:r", directory ? `${identity}:(OI)(CI)F` : `${identity}:F`]);
  } else if ((statSync(target).mode & 0o077) !== 0) {
    throw new Error("LOCAL_UAT_ARTIFACT_PERMISSIONS_UNSAFE");
  }
}

function writeSecure(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  securePath(path.dirname(file), true);
  writeFileSync(file, contents, { mode: 0o600, flag: "wx" });
  try { securePath(file); } catch (error) { rmSync(file, { force: true }); throw error; }
}

function replaceSecure(file, contents) {
  writeFileSync(file, contents, { mode: 0o600, flag: "w" });
  try { securePath(file); } catch (error) { rmSync(file, { force: true }); throw error; }
}

function targetUrl(database, role, password) {
  return `postgresql://${encodeURIComponent(role)}:${encodeURIComponent(password)}@postgres:5432/${database}?schema=public`;
}

function throttleEnvironment(nonce) {
  return {
    AUTH_THROTTLE_HMAC_KEY: createHash("sha512").update(`ogfi-local-uat:${nonce}`).digest("hex"),
    AUTH_THROTTLE_KEY_VERSION: String((Number.parseInt(nonce.slice(0, 8), 16) % 900000) + 100000),
  };
}

function environmentText(values) {
  return `${Object.entries(values).map(([key, value]) => `${key}=${String(value)}`).join("\n")}\n`;
}

export function sanitizedRuntimeEnvironment(sourceText) {
  const prohibited = /(?:^|_)(?:DATABASE|POSTGRES|MIGRATOR|OWNER|RESTORE)(?:_|$)|^(?:PG|PRISMA_)/;
  return sourceText
    .split(/\r?\n/)
    .filter((line) => {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.trim());
      return !match || !prohibited.test(match[1]);
    })
    .join("\n")
    .replace(/\n*$/, "\n");
}

function sourcePreflightSql() {
  return `DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM "UserScopeAssignment" WHERE "scopeType" = 'PROJECT') THEN RAISE EXCEPTION 'LOCAL_UAT_PROJECT_SCOPE_NOT_PRESERVED'; END IF;
  IF EXISTS (
    SELECT 1 FROM "UserScopeAssignment" scope
    WHERE (scope."scopeType" = 'COMPANY' AND NOT EXISTS (SELECT 1 FROM "Company" record WHERE record.id = scope."scopeId"))
       OR (scope."scopeType" = 'BRAND' AND NOT EXISTS (SELECT 1 FROM "Brand" record WHERE record.id = scope."scopeId"))
       OR (scope."scopeType" = 'LOCATION' AND NOT EXISTS (SELECT 1 FROM "Location" record WHERE record.id = scope."scopeId"))
       OR (scope."scopeType" = 'DEPARTMENT' AND NOT EXISTS (SELECT 1 FROM "Department" record WHERE record.id = scope."scopeId"))
  ) THEN RAISE EXCEPTION 'LOCAL_UAT_SCOPE_DEPENDENCY_INVALID'; END IF;
  IF EXISTS (
    SELECT 1 FROM "UserRoleAssignment" assignment
    JOIN "User" actor ON actor.id = assignment."userId"
    JOIN "Role" role ON role.id = assignment."roleId"
    WHERE role."tenantId" IS NOT NULL AND role."tenantId" <> actor."tenantId"
  ) THEN RAISE EXCEPTION 'LOCAL_UAT_CROSS_TENANT_ROLE_ASSIGNMENT'; END IF;
  IF EXISTS (
    SELECT 1 FROM "UserScopeAssignment" scope JOIN "User" actor ON actor.id = scope."userId"
    WHERE (scope."scopeType" = 'COMPANY' AND NOT EXISTS (SELECT 1 FROM "Company" company WHERE company.id = scope."scopeId" AND company."tenantId" = actor."tenantId"))
       OR (scope."scopeType" = 'BRAND' AND NOT EXISTS (SELECT 1 FROM "Brand" brand JOIN "Company" company ON company.id = brand."companyId" AND company."tenantId" = brand."tenantId" WHERE brand.id = scope."scopeId" AND brand."tenantId" = actor."tenantId"))
       OR (scope."scopeType" = 'LOCATION' AND NOT EXISTS (SELECT 1 FROM "Location" location JOIN "Company" company ON company.id = location."companyId" AND company."tenantId" = location."tenantId" LEFT JOIN "Brand" brand ON brand.id = location."brandId" WHERE location.id = scope."scopeId" AND location."tenantId" = actor."tenantId" AND (brand.id IS NULL OR (brand."tenantId" = location."tenantId" AND brand."companyId" = location."companyId"))))
       OR (scope."scopeType" = 'DEPARTMENT' AND NOT EXISTS (SELECT 1 FROM "Department" department JOIN "Company" company ON company.id = department."companyId" AND company."tenantId" = department."tenantId" WHERE department.id = scope."scopeId" AND department."tenantId" = actor."tenantId"))
  ) THEN RAISE EXCEPTION 'LOCAL_UAT_SCOPE_OWNERSHIP_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM "ApprovalRule" WHERE NOT "definitionSealed") THEN RAISE EXCEPTION 'LOCAL_UAT_UNSEALED_APPROVAL_RULE'; END IF;
END $preflight$;`;
}

function sourceSnapshotSql(includePreflight = true) {
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
${includePreflight ? sourcePreflightSql() : ""}
${buildCanonicalExportSql()}
COMMIT;`;
}

function markerInstallSql(identity) {
  return `CREATE SCHEMA ogfi_disposable_control;
REVOKE ALL ON SCHEMA ogfi_disposable_control FROM PUBLIC;
CREATE TABLE ogfi_disposable_control.database_identity (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), database_name text NOT NULL, run_id text NOT NULL, nonce_sha256 char(64) NOT NULL CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$'), construction_token_sha256 char(64) CHECK (construction_token_sha256 IS NULL OR construction_token_sha256 ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON ogfi_disposable_control.database_identity FROM PUBLIC;
INSERT INTO ogfi_disposable_control.database_identity(singleton,database_name,run_id,nonce_sha256,construction_token_sha256) VALUES (true,${sqlLiteral(identity.database)},${sqlLiteral(identity.pendingRunId)},${sqlLiteral(identity.nonceSha256)},${sqlLiteral(identity.constructionTokenSha256)});`;
}

function markerFunctionSql(identity) {
  return `CREATE OR REPLACE FUNCTION ogfi_disposable_control.verify_database_identity()
RETURNS TABLE (database_name text, run_id text, nonce_sha256 text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog ROWS 1
AS $marker$ SELECT identity.database_name, identity.run_id, identity.nonce_sha256::text FROM ogfi_disposable_control.database_identity identity WHERE identity.singleton = true $marker$;
ALTER FUNCTION ogfi_disposable_control.verify_database_identity() OWNER TO ${sqlIdentifier(identity.ownerRole)};
REVOKE ALL ON FUNCTION ogfi_disposable_control.verify_database_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ogfi_disposable_control.verify_database_identity() TO ${sqlIdentifier(identity.runtimeRole)};
GRANT USAGE ON SCHEMA ogfi_disposable_control TO ${sqlIdentifier(identity.ownerRole)}, ${sqlIdentifier(identity.runtimeRole)};
GRANT SELECT ON ogfi_disposable_control.database_identity TO ${sqlIdentifier(identity.ownerRole)};
REVOKE ALL ON ogfi_disposable_control.database_identity FROM ${sqlIdentifier(identity.runtimeRole)};`;
}

function constructionFunctionSql(identity) {
  return `CREATE OR REPLACE FUNCTION ogfi_disposable_control.verify_database_construction_identity()
RETURNS TABLE (database_name text, run_id text, nonce_sha256 text, construction_token_sha256 text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog ROWS 1
AS $marker$ SELECT identity.database_name, identity.run_id, identity.nonce_sha256::text, identity.construction_token_sha256::text FROM ogfi_disposable_control.database_identity identity WHERE identity.singleton = true $marker$;
ALTER FUNCTION ogfi_disposable_control.verify_database_construction_identity() OWNER TO ${sqlIdentifier(identity.ownerRole)};
REVOKE ALL ON FUNCTION ogfi_disposable_control.verify_database_construction_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ogfi_disposable_control.verify_database_construction_identity() TO ${sqlIdentifier(identity.runtimeRole)};`;
}

function constructionFunctionDropSql() {
  return "DROP FUNCTION IF EXISTS ogfi_disposable_control.verify_database_construction_identity();";
}

function markerFinalizeSql(identity) {
  return `UPDATE ogfi_disposable_control.database_identity SET run_id = ${sqlLiteral(identity.runId)}, construction_token_sha256 = NULL WHERE singleton = true AND database_name = ${sqlLiteral(identity.database)} AND run_id = ${sqlLiteral(identity.pendingRunId)} AND nonce_sha256 = ${sqlLiteral(identity.nonceSha256)} AND construction_token_sha256 = ${sqlLiteral(identity.constructionTokenSha256)};
SELECT CASE WHEN count(*) = 1 THEN 'CONSTRUCTED' ELSE 'DENIED' END FROM ogfi_disposable_control.database_identity WHERE singleton = true AND database_name = ${sqlLiteral(identity.database)} AND run_id = ${sqlLiteral(identity.runId)} AND nonce_sha256 = ${sqlLiteral(identity.nonceSha256)} AND construction_token_sha256 IS NULL;`;
}

function verifyTarget(container, database, migratorRole, migratorPassword, payload, expectedDigest) {
  for (const table of LOCAL_UAT_ALLOWED_TABLES) {
    const actual = Number(psql(container, migratorRole, database, `SELECT count(*) FROM public.${sqlIdentifier(table)};`, migratorPassword));
    if (actual !== payload.tables[table].length) throw new Error(`LOCAL_UAT_ALLOWLIST_COUNT_MISMATCH:${table}`);
  }
  const tables = psql(container, migratorRole, database, "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename;", migratorPassword).split(/\r?\n/).filter(Boolean);
  for (const table of tables) {
    if (LOCAL_UAT_ALLOWED_TABLES.includes(table) || table === "_prisma_migrations" || table === "AuthenticationThrottleControl") continue;
    const count = Number(psql(container, migratorRole, database, `SELECT count(*) FROM public.${sqlIdentifier(table)};`, migratorPassword));
    if (count !== 0) throw new Error(`LOCAL_UAT_DENIED_TABLE_NONZERO:${table}`);
  }
  const throttle = psql(container, migratorRole, database, 'SELECT status::text || \':\' || generation::text FROM "AuthenticationThrottleControl" WHERE id=1;', migratorPassword);
  if (throttle !== "ACTIVE:1") throw new Error("LOCAL_UAT_THROTTLE_NOT_FRESHLY_ACTIVATED");
  const targetPayloadText = psql(container, migratorRole, database, buildCanonicalExportSql(), migratorPassword);
  const targetDigest = createHash("sha256").update(targetPayloadText).digest("hex");
  if (targetDigest !== expectedDigest) throw new Error("LOCAL_UAT_CANONICAL_DIGEST_MISMATCH");
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function sha256Tree(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(directory);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(path.relative(directory, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function networkIds(inspected) {
  return Object.values(inspected.NetworkSettings?.Networks ?? {}).map((network) => network.NetworkID).filter(Boolean).sort();
}

function inspectExactLocalImage(imageId) {
  const parsed = JSON.parse(docker(["image", "inspect", imageId]));
  if (!Array.isArray(parsed) || parsed.length !== 1 || parsed[0]?.Id !== imageId) {
    throw new Error("LOCAL_UAT_WEB_IMAGE_NOT_EXACT_LOCAL_IMAGE");
  }
  const inspected = parsed[0];
  const revision = inspected.Config?.Labels?.["org.opencontainers.image.revision"];
  const artifactSha256 = inspected.Config?.Labels?.["io.ogfi.release-artifact.sha256"];
  if (!/^[a-f0-9]{40}$/.test(revision ?? "") || !/^[a-f0-9]{64}$/.test(artifactSha256 ?? "")) {
    throw new Error("LOCAL_UAT_WEB_IMAGE_RELEASE_PROVENANCE_MISSING");
  }
  const hostCommitSha = execute("git", ["rev-parse", "HEAD"]);
  const hostSchemaSha256 = sha256File(path.join(repositoryRoot, "packages/database/prisma/schema.prisma"));
  const hostMigrationsSha256 = sha256Tree(path.join(repositoryRoot, "packages/database/prisma/migrations"));
  const imageProbe = `const{createHash}=require('node:crypto'),{readFileSync,readdirSync}=require('node:fs'),path=require('node:path');const hashFile=p=>createHash('sha256').update(readFileSync(p)).digest('hex');const hashTree=root=>{const files=[];const visit=d=>{for(const e of readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?visit(p):e.isFile()&&files.push(p)}};visit(root);const h=createHash('sha256');for(const p of files.sort()){h.update(path.relative(root,p).replaceAll('\\\\','/'));h.update('\\0');h.update(readFileSync(p));h.update('\\0')}return h.digest('hex')};const release=JSON.parse(readFileSync('/app/apps/web/release-identity.json','utf8'));process.stdout.write(JSON.stringify({release,schemaSha256:hashFile('/app/packages/database/prisma/schema.prisma'),migrationsSha256:hashTree('/app/packages/database/prisma/migrations')}));`;
  const embedded = JSON.parse(docker(["run", "--rm", "--network", "none", imageId, "node", "-e", imageProbe]));
  if (embedded.release?.schemaVersion !== 2 || embedded.release?.commitSha !== revision || embedded.release?.artifactSha256 !== artifactSha256) {
    throw new Error("LOCAL_UAT_WEB_IMAGE_RELEASE_IDENTITY_MISMATCH");
  }
  if (revision !== hostCommitSha || embedded.schemaSha256 !== hostSchemaSha256 || embedded.migrationsSha256 !== hostMigrationsSha256) {
    throw new Error("LOCAL_UAT_WEB_IMAGE_WORKSPACE_PROVENANCE_MISMATCH");
  }
  return { inspected, revision, artifactSha256, hostSchemaSha256, hostMigrationsSha256 };
}

function assertHostnameIsolation(webContainer, sourceHostname) {
  docker([
    "exec", webContainer, "node", "-e",
    "require('node:dns').lookup('postgres',error=>process.exit(error?1:0))",
  ]);
  const sourceResolution = spawnSync(process.env.OGFI_DOCKER_COMMAND ?? "docker", [
    "exec", webContainer, "node", "-e",
    "require('node:dns').lookup(process.argv[1],error=>process.exit(error?0:1))",
    sourceHostname,
  ], { encoding: "utf8" });
  if (sourceResolution.status !== 0) {
    throw new Error("LOCAL_UAT_SOURCE_HOSTNAME_RESOLUTION_CHECK_FAILED");
  }
}

function waitForHealthy(container, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = spawnSync(process.env.OGFI_DOCKER_COMMAND ?? "docker", [
      "inspect", "--format", "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}", container,
    ], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim() === "running|healthy") return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error("LOCAL_UAT_WEB_NOT_HEALTHY");
}

export function cleanupFailedCandidate(
  { project, secretFiles },
  operations = {},
) {
  const run = operations.run ?? spawnSync;
  const remove = operations.remove ?? rmSync;
  const command = process.env.OGFI_DOCKER_COMMAND ?? "docker";
  const failures = [];
  const invoke = (args) => run(command, args, { cwd: repositoryRoot, encoding: "utf8" });
  const label = `label=com.docker.compose.project=${project}`;
  const list = (kind, args) => {
    const result = invoke(args);
    if (result.status !== 0) {
      failures.push(`RESOURCE_LIST_FAILED:${kind}`);
      return [];
    }
    return String(result.stdout ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  };
  const containers = list("CONTAINER", ["ps", "-aq", "--filter", label]);
  const volumes = list("VOLUME", ["volume", "ls", "-q", "--filter", label]);
  const networks = list("NETWORK", ["network", "ls", "-q", "--filter", label]);

  for (const container of containers) if (invoke(["rm", "-f", container]).status !== 0) failures.push(`CONTAINER_REMOVE_FAILED:${container}`);
  for (const volume of volumes) if (invoke(["volume", "rm", "-f", volume]).status !== 0) failures.push(`VOLUME_REMOVE_FAILED:${volume}`);
  for (const network of networks) if (invoke(["network", "rm", network]).status !== 0) failures.push(`NETWORK_REMOVE_FAILED:${network}`);

  if (list("CONTAINER_VERIFY", ["ps", "-aq", "--filter", label]).length > 0) failures.push("CONTAINER_RESOURCES_REMAIN");
  if (list("VOLUME_VERIFY", ["volume", "ls", "-q", "--filter", label]).length > 0) failures.push("VOLUME_RESOURCES_REMAIN");
  if (list("NETWORK_VERIFY", ["network", "ls", "-q", "--filter", label]).length > 0) failures.push("NETWORK_RESOURCES_REMAIN");

  for (const file of secretFiles) {
    try { remove(file, { force: true }); }
    catch { failures.push(`SECRET_DELETE_FAILED:${path.basename(file)}`); }
  }
  if (failures.length > 0) {
    throw new Error(`LOCAL_UAT_FAILED_CONSTRUCTION_CLEANUP_INCOMPLETE:${failures.join(",")}`);
  }
}

async function createBaseline(raw) {
  const options = assertLocalUatCreateOptions(raw);
  if (docker(["context", "show"]) !== "desktop-linux") throw new Error("LOCAL_UAT_DOCKER_CONTEXT_INVALID");
  if (execute("git", ["status", "--porcelain", "--untracked-files=all"])) throw new Error("LOCAL_UAT_REVIEWED_WORKTREE_NOT_CLEAN");
  const source = assertLocalSource(options.sourceContainer, options.sourceDatabase, options.sourceProject);
  const exactWebImage = inspectExactLocalImage(options.webImageId);
  const volume = `${options.project}_uat_postgres_data`;
  const volumeCheck = spawnSync(process.env.OGFI_DOCKER_COMMAND ?? "docker", ["volume", "inspect", volume], { encoding: "utf8" });
  if (volumeCheck.status === 0) throw new Error("LOCAL_UAT_TARGET_VOLUME_ALREADY_EXISTS");

  const payloadText = psqlReadOnly(options.sourceContainer, source.user, options.sourceDatabase, sourceSnapshotSql());
  const payload = JSON.parse(payloadText);
  const digest = createHash("sha256").update(payloadText).digest("hex");
  const nonce = randomBytes(32).toString("hex");
  const constructionToken = randomBytes(32).toString("base64url");
  const prefix = `ogfi_${nonce.slice(0, 32)}`;
  const identity = {
    database: options.targetDatabase,
    runId: `${options.targetDatabase}-${Date.now()}`.slice(0, 120),
    nonceSha256: createHash("sha256").update(nonce).digest("hex"),
    ownerRole: `${prefix}_owner`, migratorRole: `${prefix}_migrator`, runtimeRole: `${prefix}_runtime`,
    constructionTokenSha256: createHash("sha256").update(constructionToken).digest("hex"),
  };
  identity.pendingRunId = `${identity.runId}.pending`;
  const passwords = { admin: randomBytes(32).toString("base64url"), migrator: randomBytes(32).toString("base64url"), runtime: randomBytes(32).toString("base64url"), opening: randomBytes(32).toString("base64url") };
  const throttle = throttleEnvironment(nonce);
  const artifactDir = path.join(repositoryRoot, "backups/local-uat", options.targetDatabase);
  const composeEnv = path.join(artifactDir, "compose.env");
  const operatorEnv = path.join(artifactDir, "operator.env");
  const runtimeEnv = path.join(artifactDir, "runtime.env");
  const manifestFile = path.join(artifactDir, "manifest.json");
  const sourceEnvironmentFile = path.join(repositoryRoot, ".env");
  const composeEnvironment = (includeConstructionToken) => ({
    OGFI_LOCAL_UAT_PROJECT: options.project, OGFI_LOCAL_UAT_DATABASE: options.targetDatabase,
    OGFI_LOCAL_UAT_POSTGRES_ADMIN_PASSWORD: passwords.admin,
    OGFI_LOCAL_UAT_RUNTIME_DATABASE_URL: targetUrl(options.targetDatabase, identity.runtimeRole, passwords.runtime),
    OGFI_LOCAL_UAT_RUNTIME_ENV_FILE: runtimeEnv.replaceAll("\\", "/"),
    OGFI_LOCAL_UAT_WEB_IMAGE_ID: options.webImageId,
    OGFI_LOCAL_UAT_WEB_PORT: options.webPort,
    OGFI_DISPOSABLE_DATABASE_RUN_ID: identity.runId,
    OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: identity.nonceSha256, ...throttle,
    ...(includeConstructionToken ? {
      OGFI_LOCAL_UAT_CONSTRUCTION_TOKEN: constructionToken,
      OGFI_LOCAL_UAT_CONSTRUCTION_TOKEN_SHA256: identity.constructionTokenSha256,
    } : {}),
  });
  try {
    writeSecure(runtimeEnv, sanitizedRuntimeEnvironment(readFileSync(sourceEnvironmentFile, "utf8")));
    const initialComposeEnvironment = environmentText(composeEnvironment(true));
    writeSecure(composeEnv, initialComposeEnvironment);
    writeSecure(operatorEnv, environmentText({
      OGFI_LOCAL_UAT_MIGRATOR_DATABASE_URL: targetUrl(options.targetDatabase, identity.migratorRole, passwords.migrator),
      OGFI_LOCAL_UAT_OPENING_STOCK_EXECUTOR_DATABASE_URL: targetUrl(options.targetDatabase, `${prefix}_opening_stock_executor`, passwords.opening),
    }));
  } catch (error) {
    for (const file of [composeEnv, operatorEnv, runtimeEnv, manifestFile]) rmSync(file, { force: true });
    throw error;
  }

  try {
  const targetContainer = `${options.project}-postgres-1`;
  compose(composeEnv, ["up", "-d", "postgres"]);
  const targetPostgres = inspectContainer(targetContainer);
  if (targetPostgres.Id === source.inspected.Id || networkIds(targetPostgres).some((id) => networkIds(source.inspected).includes(id))) {
    throw new Error("LOCAL_UAT_SOURCE_TARGET_ISOLATION_FAILED");
  }
  psql(targetContainer, "postgres", options.targetDatabase, markerInstallSql(identity), passwords.admin);
  psqlFile(targetContainer, "postgres", options.targetDatabase, path.join(roleSqlDir, "bootstrap-roles.sql"), {
    contract_scope: "disposable", app_environment: "test", database_name: options.targetDatabase,
    owner_role: identity.ownerRole, migrator_role: identity.migratorRole, runtime_role: identity.runtimeRole,
  }, passwords.admin);
  psql(targetContainer, "postgres", options.targetDatabase, `ALTER ROLE ${sqlIdentifier(identity.migratorRole)} PASSWORD ${sqlLiteral(passwords.migrator)}; ALTER ROLE ${sqlIdentifier(identity.runtimeRole)} PASSWORD ${sqlLiteral(passwords.runtime)}; ALTER ROLE ${sqlIdentifier(prefix + "_opening_stock_executor")} PASSWORD ${sqlLiteral(passwords.opening)};`, passwords.admin);
  const migratorUrl = targetUrl(options.targetDatabase, identity.migratorRole, passwords.migrator);
  compose(composeEnv, ["run", "--rm", "--no-deps", "-e", `DATABASE_URL=${migratorUrl}`, "-e", `DIRECT_DATABASE_URL=${migratorUrl}`, "web", "node", "/app/node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "/app/packages/database/prisma/schema.prisma"]);
  psql(targetContainer, identity.migratorRole, options.targetDatabase, buildAllowlistLoadSql(payloadText), passwords.migrator);
  compose(composeEnv, ["run", "--rm", "--no-deps", "-e", `DATABASE_URL=${migratorUrl}`, "-e", `DIRECT_DATABASE_URL=${migratorUrl}`, "-e", "AUTH_THROTTLE_CONTROL_EXPECTED_GENERATION=0", "-e", "AUTH_THROTTLE_CONTROL_REQUESTED_STATUS=ACTIVE", "web", "node", "/app/node_modules/tsx/dist/cli.mjs", "/app/apps/web/src/server/jobs/authenticationThrottleControlBootstrap.ts"]);
  psqlFile(targetContainer, identity.migratorRole, options.targetDatabase, path.join(roleSqlDir, "reconcile-ownership-and-grants.sql"), roleVariables(identity), passwords.migrator);
  psqlFile(targetContainer, "postgres", options.targetDatabase, path.join(roleSqlDir, "handoff-opening-stock-owner.sql"), roleVariables(identity), passwords.admin);
  verifyTarget(targetContainer, options.targetDatabase, identity.migratorRole, passwords.migrator, payload, digest);
  psql(targetContainer, "postgres", options.targetDatabase, markerFunctionSql(identity), passwords.admin);
  psqlFile(targetContainer, identity.migratorRole, options.targetDatabase, path.join(roleSqlDir, "verify-role-contract.sql"), { ...roleVariables(identity), verification_mode: "owner" }, passwords.migrator);
  psqlFile(targetContainer, identity.runtimeRole, options.targetDatabase, path.join(roleSqlDir, "verify-role-contract.sql"), { ...roleVariables(identity), verification_mode: "runtime" }, passwords.runtime);
  psql(targetContainer, "postgres", options.targetDatabase, constructionFunctionSql(identity), passwords.admin);
  const runtimeFlags = psql(targetContainer, "postgres", options.targetDatabase, `SELECT CASE WHEN rolsuper THEN '1' ELSE '0' END || '|' || CASE WHEN rolcreatedb THEN '1' ELSE '0' END || '|' || CASE WHEN rolcreaterole THEN '1' ELSE '0' END || '|' || CASE WHEN rolbypassrls THEN '1' ELSE '0' END FROM pg_roles WHERE rolname=${sqlLiteral(identity.runtimeRole)};`, passwords.admin);
  if (runtimeFlags !== "0|0|0|0") throw new Error("LOCAL_UAT_RUNTIME_ROLE_FLAGS_UNSAFE");
  const sourceDigestAfter = createHash("sha256").update(psqlReadOnly(options.sourceContainer, source.user, options.sourceDatabase, sourceSnapshotSql(false))).digest("hex");
  if (sourceDigestAfter !== digest) throw new Error("LOCAL_UAT_SOURCE_CHANGED_DURING_CONSTRUCTION");
    const webContainer = `${options.project}-web-1`;
    compose(composeEnv, ["up", "-d", "web"]);
    waitForHealthy(webContainer);
    let targetWeb = inspectContainer(webContainer);
    if (targetWeb.Image !== exactWebImage.inspected.Id) throw new Error("LOCAL_UAT_WEB_IMAGE_ID_MISMATCH");
    if (networkIds(targetWeb).some((id) => networkIds(source.inspected).includes(id))) throw new Error("LOCAL_UAT_WEB_SOURCE_NETWORK_OVERLAP");
    assertHostnameIsolation(webContainer, options.sourceContainer);

    psql(targetContainer, "postgres", options.targetDatabase, constructionFunctionDropSql(), passwords.admin);
    const construction = psql(targetContainer, "postgres", options.targetDatabase, markerFinalizeSql(identity), passwords.admin);
    if (!construction.split(/\r?\n/).includes("CONSTRUCTED")) throw new Error("LOCAL_UAT_MARKER_FINALIZATION_FAILED");
    psqlFile(targetContainer, identity.runtimeRole, options.targetDatabase, path.join(roleSqlDir, "verify-role-contract.sql"), { ...roleVariables(identity), verification_mode: "runtime" }, passwords.runtime);
    replaceSecure(composeEnv, environmentText(composeEnvironment(false)));
    compose(composeEnv, ["up", "-d", "--force-recreate", "web"]);
    waitForHealthy(webContainer);
    targetWeb = inspectContainer(webContainer);
    if (targetWeb.Image !== exactWebImage.inspected.Id) throw new Error("LOCAL_UAT_WEB_IMAGE_ID_MISMATCH");
    if (networkIds(targetWeb).some((id) => networkIds(source.inspected).includes(id))) throw new Error("LOCAL_UAT_WEB_SOURCE_NETWORK_OVERLAP");
    assertHostnameIsolation(webContainer, options.sourceContainer);

    const manifest = { schemaVersion: 1, constructionComplete: true, uatAdmitted: false, localOnly: true, dockerContext: "desktop-linux", isolatedComposeProject: options.project, sourceDatabase: options.sourceDatabase, targetDatabase: options.targetDatabase, allowlistDigestSha256: digest, sourceDigestReverifiedSha256: sourceDigestAfter, allowedTableCounts: Object.fromEntries(LOCAL_UAT_ALLOWED_TABLES.map((table) => [table, payload.tables[table].length])), deniedTablesVerifiedZero: true, runtimeRoleRestricted: true, credentialsIncluded: false, limitations: ["BUDGET_DEPENDENT_PR_UAT_REQUIRES_CLEAN_TARGET_CONFIGURATION", "FINANCE_BUDGET_CONFIGURATION_NOT_COPIED", "CONTROLLED_EVIDENCE_CONFIGURATION_NOT_COPIED"], source: { containerId: source.inspected.Id, imageId: source.inspected.Image, networkIds: networkIds(source.inspected) }, target: { postgresContainerId: targetPostgres.Id, postgresImageId: targetPostgres.Image, postgresNetworkIds: networkIds(targetPostgres), webContainerId: targetWeb.Id, webImageId: targetWeb.Image, requiredWebImageId: exactWebImage.inspected.Id, webNetworkIds: networkIds(targetWeb) }, imageProvenance: { commitSha: exactWebImage.revision, releaseArtifactSha256: exactWebImage.artifactSha256, schemaSha256: exactWebImage.hostSchemaSha256, migrationsSha256: exactWebImage.hostMigrationsSha256 }, artifacts: { builderSha256: sha256File(path.join(repositoryRoot, "scripts/local-uat-baseline.mjs")), composeSha256: sha256File(composeFile), schemaSha256: sha256File(path.join(repositoryRoot, "packages/database/prisma/schema.prisma")), migrationsSha256: sha256Tree(path.join(repositoryRoot, "packages/database/prisma/migrations")) }, createdAt: new Date().toISOString() };
    writeSecure(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`LOCAL_UAT_BASELINE_CONSTRUCTED ${options.targetDatabase}`);
    console.log(`Evidence: ${path.relative(repositoryRoot, manifestFile)}`);
  } catch (error) {
    cleanupFailedCandidate({
      project: options.project,
      secretFiles: [composeEnv, operatorEnv, runtimeEnv, manifestFile],
    });
    throw error;
  }
}

function roleVariables(identity) {
  return { contract_scope: "disposable", app_environment: "test", database_name: identity.database, owner_role: identity.ownerRole, migrator_role: identity.migratorRole, runtime_role: identity.runtimeRole };
}

function sqlIdentifier(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const options = parseLocalUatArguments(process.argv.slice(2));
  await createBaseline(options);
}
