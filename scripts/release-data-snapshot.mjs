import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requirePostgresTool } from "./postgres-client-tools.mjs";
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

const tableGroups = [
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

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(
  outputFile,
  [
    "OGFI ERP Phase I / Phase 1.5 release data snapshot",
    `Generated UTC: ${timestamp}`,
    `Evidence run ID: ${runId}`,
    `Database URL fingerprint: ${databaseUrlFingerprint(databaseUrl)}`,
    `Label: ${label}`,
    `Allow missing tables: ${allowMissingTables ? "yes" : "no"}`,
    `Evidence file: ${outputFile}`,
    "",
  ].join("\n"),
);

for (const [group, tables] of tableGroups) {
  write(`\n${group}`);
  for (const table of tables) {
    const count = queryCount(`select count(*) from "${table}";`);
    write(`${table} | ${count ?? "MISSING"}`);
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
      [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
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

function write(line) {
  console.log(line);
  appendFileSync(outputFile, `${line}\n`);
}
