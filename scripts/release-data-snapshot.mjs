import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  postgresClientConnectionUrl,
  requirePostgresTool,
} from "./postgres-client-tools.mjs";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required for the release data snapshot.");
  process.exit(2);
}

const psql = requirePostgresTool("psql", "the release data snapshot");
const psqlDatabaseUrl = postgresClientConnectionUrl(databaseUrl);

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const label = process.env.RELEASE_DATA_SNAPSHOT_LABEL ?? "snapshot";
const outputDir =
  process.env.RELEASE_DATA_SNAPSHOT_OUTPUT_DIR ??
  "release-evidence/data-snapshots";
const outputFile =
  process.env.RELEASE_DATA_SNAPSHOT_OUTPUT_FILE ??
  join(outputDir, `data-${label}-${timestamp}.txt`);
const allowMissingTables =
  process.env.RELEASE_DATA_SNAPSHOT_ALLOW_MISSING_TABLES === "yes";
const runId = evidenceRunId(process.env, timestamp);
const prismaSchemaFile =
  process.env.RELEASE_DATA_SNAPSHOT_PRISMA_SCHEMA ??
  "packages/database/prisma/schema.prisma";

const primaryTableGroups = [
  [
    "Organization",
    ["Tenant", "Company", "Brand", "Location", "Department", "CostCenter"],
  ],
  [
    "Access control",
    [
      "User",
      "Role",
      "Permission",
      "RolePermission",
      "UserRoleAssignment",
      "UserScopeAssignment",
    ],
  ],
  [
    "Approvals and audit",
    [
      "ApprovalRule",
      "ApprovalRuleStep",
      "ApprovalInstance",
      "AuditEvent",
      "Notification",
    ],
  ],
  [
    "Purchasing and receiving",
    [
      "Supplier",
      "SupplierContact",
      "ItemCategory",
      "Uom",
      "Item",
      "ItemUomConversion",
      "SupplierItemLink",
      "PurchaseRequest",
      "PurchaseRequestLine",
      "QuotationRequest",
      "SupplierQuotation",
      "SupplierQuotationLine",
      "QuotationRecommendation",
      "PurchaseOrder",
      "PurchaseOrderLine",
      "PurchaseOrderAmendment",
      "PurchaseOrderBalanceClosure",
      "GoodsReceipt",
      "GoodsReceiptLine",
    ],
  ],
  [
    "Inventory control",
    [
      "InventoryLocation",
      "InventoryMovement",
      "InventoryBalance",
      "InventoryTransfer",
      "InventoryTransferLine",
      "InventoryTransferReceipt",
      "InventoryTransferReceiptLine",
      "StockCountSession",
      "StockCountLine",
      "WastagePolicy",
      "WastageReport",
      "WastageLine",
      "StockAdjustment",
      "StockAdjustmentLine",
    ],
  ],
  [
    "Project tracker",
    [
      "ProjectTemplate",
      "Project",
      "ProjectMember",
      "ProjectActivityEvent",
      "ProjectTask",
      "ProjectTaskAssignee",
      "ProjectTaskChecklistItem",
      "ProjectComment",
      "ProjectBlocker",
      "ProjectRisk",
      "ProjectMilestone",
      "ProjectRecordLink",
      "ProjectAttachment",
    ],
  ],
];
const primaryTables = new Set(
  primaryTableGroups.flatMap(([, tables]) => tables),
);
const schemaTables = readPrismaModelTables(prismaSchemaFile);
const additionalTables = schemaTables.filter(
  (table) => !primaryTables.has(table),
);
const tableGroups = [
  ...primaryTableGroups,
  ["Additional schema models", additionalTables],
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(
  outputFile,
  [
    "OGFI ERP Phase I / Phase 1.5 release data snapshot",
    `Generated UTC: ${timestamp}`,
    `Evidence run ID: ${runId}`,
    `Candidate SHA: ${process.env.RELEASE_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "not-recorded"}`,
    `Predecessor SHA: ${process.env.RELEASE_PREDECESSOR_SHA ?? "not-recorded"}`,
    `Database URL fingerprint: ${databaseUrlFingerprint(databaseUrl)}`,
    `Label: ${label}`,
    `Allow missing tables: ${allowMissingTables ? "yes" : "no"}`,
    `Prisma schema file: ${prismaSchemaFile}`,
    `Schema model count: ${schemaTables.length}`,
    `Snapshot table count: ${tableGroups.reduce((total, [, tables]) => total + tables.length, 0)}`,
    `Evidence file: ${outputFile}`,
    "",
  ].join("\n"),
);

for (const [group, tables] of tableGroups) {
  write(`\n${group}`);
  for (const table of tables) {
    const count = queryCount(`select count(*) from "${table}";`);
    write(`${table} | ${count ?? "MISSING"}`);
    if (count !== null) {
      write(`DIGEST ${table} | ${queryDigest(table)}`);
    }
  }
}

write(
  "\nRESULT | PASS | Data snapshot captured. Compare before/after snapshots during migration or release rehearsal.",
);

function queryCount(sql) {
  let output;
  try {
    output = execFileSync(
      psql,
      [psqlDatabaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    if (allowMissingTables && /relation ".*" does not exist/i.test(detail)) {
      return null;
    }

    console.error(`Release data snapshot query failed: ${detail}`);
    process.exit(2);
  }

  const count = Number.parseInt(output, 10);
  if (!Number.isFinite(count)) {
    console.error(
      `Release data snapshot query returned a non-numeric count: ${output}`,
    );
    process.exit(2);
  }

  return count;
}

function queryDigest(table) {
  const sql = [
    "WITH row_digests AS (",
    `  SELECT md5(row_to_json(record)::text) AS value FROM "${table}" AS record`,
    ")",
    "SELECT md5(coalesce(string_agg(value, '' ORDER BY value), '')) FROM row_digests;",
  ].join("\n");
  const output = execFileSync(
    psql,
    [psqlDatabaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  if (!/^[a-f0-9]{32}$/.test(output)) {
    console.error(
      `Release data snapshot returned an invalid digest for ${table}.`,
    );
    process.exit(2);
  }
  return output;
}

function write(line) {
  console.log(line);
  appendFileSync(outputFile, `${line}\n`);
}

function readPrismaModelTables(schemaFile) {
  const schema = readFileSync(schemaFile, "utf8");
  const tables = [];
  const modelPattern = /^model\s+([A-Za-z][A-Za-z0-9_]*)\s+\{([\s\S]*?)^\}/gm;

  for (const match of schema.matchAll(modelPattern)) {
    const mappedTable = /@@map\("([^"]+)"\)/.exec(match[2])?.[1];
    tables.push(mappedTable ?? match[1]);
  }

  if (tables.length === 0) {
    console.error(`No Prisma models found in schema: ${schemaFile}`);
    process.exit(2);
  }

  const duplicates = tables.filter(
    (table, index) => tables.indexOf(table) !== index,
  );
  if (duplicates.length > 0) {
    console.error(
      `Duplicate Prisma table mappings found: ${[...new Set(duplicates)].join(", ")}`,
    );
    process.exit(2);
  }

  return tables.sort((left, right) => left.localeCompare(right));
}
