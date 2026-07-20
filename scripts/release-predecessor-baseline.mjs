import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  postgresClientConnectionUrl,
  requirePostgresTool,
} from "./postgres-client-tools.mjs";
import { loadLocalEnvValue } from "./local-env.mjs";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";

const databaseUrl = loadLocalEnvValue("DATABASE_URL");
const predecessorSha = process.env.RELEASE_PREDECESSOR_SHA;
const predecessorRef = process.env.RELEASE_PREDECESSOR_REF;
const candidateSha =
  process.env.RELEASE_CANDIDATE_SHA ?? process.env.GITHUB_SHA;
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const runId = evidenceRunId(process.env, timestamp);
const outputFile =
  process.env.RELEASE_PREDECESSOR_BASELINE_OUTPUT_FILE ??
  join(
    process.env.RELEASE_PREDECESSOR_BASELINE_OUTPUT_DIR ??
      "release-evidence/predecessor-baseline",
    `predecessor-baseline-${timestamp}.txt`,
  );

if (!databaseUrl || !isIsolatedUrl(databaseUrl)) {
  fail(
    "DATABASE_URL must identify an isolated release/rehearsal/test database.",
  );
}
for (const [name, value] of [
  ["RELEASE_PREDECESSOR_SHA", predecessorSha],
  ["RELEASE_CANDIDATE_SHA or GITHUB_SHA", candidateSha],
]) {
  if (!value || !/^[a-f0-9]{40}$/i.test(value))
    fail(`${name} must be a full 40-character Git SHA.`);
}
if (!predecessorRef?.trim()) fail("RELEASE_PREDECESSOR_REF is required.");
if (predecessorSha === candidateSha)
  fail("Predecessor and candidate SHAs must differ.");

const psql = requirePostgresTool("psql", "the predecessor baseline fixture");
const psqlDatabaseUrl = postgresClientConnectionUrl(databaseUrl);
const fixtureSql = `
BEGIN;

INSERT INTO "CostCenter" (
  "id", "tenantId", "companyId", "departmentId", "code", "name", "status"
)
SELECT
  '10000000-0000-4000-8000-000000009007'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  (SELECT "id" FROM "Department" WHERE "tenantId" = '00000000-0000-4000-8000-000000000001'::uuid AND "companyId" = '00000000-0000-4000-8000-000000000002'::uuid ORDER BY "id" LIMIT 1),
  'MIGRATION-REHEARSAL', 'Migration Rehearsal Cost Center', 'ACTIVE'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Project" (
  "id", "tenantId", "companyId", "code", "name", "status", "projectType",
  "brandId", "locationId", "departmentId", "costCenterId", "sponsorUserId",
  "managerUserId", "isRestricted", "description", "createdByUserId", "updatedByUserId", "updatedAt"
)
SELECT
  '10000000-0000-4000-8000-000000009001'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  'MIGRATION-REHEARSAL', 'Migration safety rehearsal fixture', 'ACTIVE',
  'ERP_IMPLEMENTATION', '00000000-0000-4000-8000-000000000003'::uuid,
  '00000000-0000-4000-8000-000000000004'::uuid,
  (SELECT "id" FROM "Department" WHERE "tenantId" = '00000000-0000-4000-8000-000000000001'::uuid AND "companyId" = '00000000-0000-4000-8000-000000000002'::uuid ORDER BY "id" LIMIT 1),
  (SELECT "id" FROM "CostCenter" WHERE "tenantId" = '00000000-0000-4000-8000-000000000001'::uuid AND "companyId" = '00000000-0000-4000-8000-000000000002'::uuid ORDER BY "id" LIMIT 1),
  '00000000-0000-4000-8000-000000000012'::uuid,
  '00000000-0000-4000-8000-000000000014'::uuid,
  true, 'Synthetic scoped fixture for disposable upgrade verification.',
  '00000000-0000-4000-8000-000000000014'::uuid,
  '00000000-0000-4000-8000-000000000014'::uuid, now()
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ProjectTask" (
  "id", "tenantId", "companyId", "projectId", "taskKey", "title", "status",
  "priority", "ownerUserId", "createdByUserId", "updatedByUserId", "updatedAt"
) VALUES (
  '10000000-0000-4000-8000-000000009002'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  '10000000-0000-4000-8000-000000009001'::uuid,
  'MIGRATION-SAFETY-001', 'Verify scoped project requirement migration',
  'IN_PROGRESS', 'HIGH',
  '00000000-0000-4000-8000-000000000014'::uuid,
  '00000000-0000-4000-8000-000000000014'::uuid,
  '00000000-0000-4000-8000-000000000014'::uuid, now()
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ProjectRequirement" (
  "id", "tenantId", "companyId", "projectId", "taskId", "kind", "code",
  "label", "evidenceType", "evidenceNote", "ownerUserId", "reviewerUserId",
  "status", "submittedAt", "submittedByUserId", "createdByUserId", "updatedByUserId", "updatedAt"
) VALUES (
  '10000000-0000-4000-8000-000000009003'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  '10000000-0000-4000-8000-000000009001'::uuid,
  '10000000-0000-4000-8000-000000009002'::uuid,
  'EVIDENCE', 'MIGRATION-SAFETY-EVIDENCE', 'Scoped migration evidence',
  'DATABASE_REHEARSAL', 'Synthetic fixture; contains no production data.',
  '00000000-0000-4000-8000-000000000014'::uuid,
  '00000000-0000-4000-8000-000000000012'::uuid,
  'SUBMITTED', '2026-07-21T00:00:00Z'::timestamptz,
  '00000000-0000-4000-8000-000000000014'::uuid,
  '00000000-0000-4000-8000-000000000014'::uuid,
  '00000000-0000-4000-8000-000000000014'::uuid, now()
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Attachment" (
  "id", "tenantId", "storageProvider", "objectKey", "originalFilename",
  "mimeType", "sizeBytes", "checksum", "uploadedByUserId"
) VALUES (
  '10000000-0000-4000-8000-000000009004'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  'REHEARSAL_FIXTURE', 'migration-safety/scoped-requirement-evidence.txt',
  'scoped-requirement-evidence.txt', 'text/plain', 64,
  'migration-rehearsal-fixture',
  '00000000-0000-4000-8000-000000000014'::uuid
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ProjectAttachment" (
  "id", "tenantId", "companyId", "projectId", "taskId", "requirementId",
  "attachmentId", "purpose", "caption", "createdByUserId", "updatedAt"
) VALUES (
  '10000000-0000-4000-8000-000000009005'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  '10000000-0000-4000-8000-000000009001'::uuid,
  '10000000-0000-4000-8000-000000009002'::uuid,
  '10000000-0000-4000-8000-000000009003'::uuid,
  '10000000-0000-4000-8000-000000009004'::uuid,
  'EVIDENCE', 'Scoped requirement migration rehearsal evidence',
  '00000000-0000-4000-8000-000000000014'::uuid, now()
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ProjectRecordLink" (
  "id", "tenantId", "companyId", "projectId", "taskId", "requirementId",
  "sourceRecordType", "sourceRecordId", "relationType", "linkLabel",
  "createdByUserId", "updatedByUserId", "updatedAt"
) VALUES (
  '10000000-0000-4000-8000-000000009006'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  '10000000-0000-4000-8000-000000009001'::uuid,
  '10000000-0000-4000-8000-000000009002'::uuid,
  '10000000-0000-4000-8000-000000009003'::uuid,
  'INVENTORY_BALANCE',
  '10000000-0000-4000-8000-000000009003'::uuid,
  'EVIDENCE_FOR', 'Migration safety requirement',
  '00000000-0000-4000-8000-000000000014'::uuid,
  '00000000-0000-4000-8000-000000000014'::uuid, now()
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ApprovalInstance" (
  "id", "tenantId", "companyId", "documentType", "documentId",
  "approvalRuleId", "status", "currentStepOrder"
)
SELECT
  '10000000-0000-4000-8000-000000009008'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  'PROJECT_REQUIREMENT',
  '10000000-0000-4000-8000-000000009003'::uuid,
  "id", 'PENDING', 1
FROM "ApprovalRule"
WHERE "tenantId" = '00000000-0000-4000-8000-000000000001'::uuid
  AND "companyId" = '00000000-0000-4000-8000-000000000002'::uuid
ORDER BY "id"
LIMIT 1
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AuditEvent" (
  "id", "tenantId", "companyId", "actorUserId", "eventType",
  "entityType", "entityId", "requestId", "afterData", "metadata"
) VALUES (
  '10000000-0000-4000-8000-000000009009'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  '00000000-0000-4000-8000-000000000014'::uuid,
  'MIGRATION_REHEARSAL_FIXTURE_CREATED', 'ProjectRequirement',
  '10000000-0000-4000-8000-000000009003'::uuid,
  'spf002-predecessor-baseline',
  '{"status":"SUBMITTED"}'::jsonb,
  '{"fixture":"synthetic","productionData":false}'::jsonb
) ON CONFLICT ("id") DO NOTHING;

COMMIT;
`;

try {
  execFileSync(
    psql,
    [psqlDatabaseUrl, "-v", "ON_ERROR_STOP=1", "-c", fixtureSql],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const population = queryPopulation(psql);
  const missing = population.filter((row) => row.count < 1);
  if (missing.length > 0)
    fail(
      `Required baseline tables are empty: ${missing.map((row) => row.table).join(", ")}`,
    );

  const lines = [
    "OGFI ERP populated predecessor baseline",
    `Generated UTC: ${timestamp}`,
    `Evidence run ID: ${runId}`,
    `Candidate SHA: ${candidateSha}`,
    `Predecessor verification reference: ${predecessorRef}`,
    `Predecessor SHA: ${predecessorSha}`,
    `Database URL fingerprint: ${databaseUrlFingerprint(databaseUrl)}`,
    "Creation source: predecessor release migrations and seed plus synthetic migration-safety fixture",
    "Sanitization status: synthetic demo data only; no production data",
    "",
    "Table | Rows",
    ...population.map((row) => `${row.table} | ${row.count}`),
    "",
    "RESULT | PASS | Populated predecessor baseline captured.",
  ];
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${lines.join("\n")}\n`, { mode: 0o600 });
  console.log(`Populated predecessor baseline PASS. Evidence: ${outputFile}`);
} catch (error) {
  console.error(`Populated predecessor baseline FAIL: ${error.message}`);
  process.exit(1);
}

function queryPopulation(tool) {
  const tables = [
    "Tenant",
    "Company",
    "Project",
    "ProjectTask",
    "ProjectRequirement",
    "ProjectAttachment",
    "ProjectRecordLink",
    "InventoryMovement",
    "ApprovalInstance",
    "AuditEvent",
  ];
  return tables.map((table) => {
    const output = execFileSync(
      tool,
      [
        psqlDatabaseUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-c",
        `SELECT count(*) FROM "${table}"`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    return { table, count: Number.parseInt(output, 10) };
  });
}

function isIsolatedUrl(value) {
  const lower = value.toLowerCase();
  return (
    !/(prod|production|live)/.test(lower) &&
    /(release|rehearsal|sandbox|test|testing|dev|development|local|isolated)/.test(
      lower,
    )
  );
}

function fail(message) {
  throw new Error(message);
}
