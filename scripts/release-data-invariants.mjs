import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requirePostgresTool } from "./postgres-client-tools.mjs";
import { loadLocalEnvValue } from "./local-env.mjs";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";

const databaseUrl = loadLocalEnvValue("DATABASE_URL");
if (!databaseUrl) {
  console.error("DATABASE_URL is required for release invariant verification.");
  process.exit(2);
}

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const label = process.env.RELEASE_DATA_INVARIANT_LABEL ?? "verification";
const outputDir =
  process.env.RELEASE_DATA_INVARIANT_OUTPUT_DIR ??
  "release-evidence/data-invariants";
const outputFile =
  process.env.RELEASE_DATA_INVARIANT_OUTPUT_FILE ??
  join(outputDir, `data-invariants-${label}-${timestamp}.txt`);
const runId = evidenceRunId(process.env, timestamp);
const candidateSha =
  process.env.RELEASE_CANDIDATE_SHA ?? process.env.GITHUB_SHA;

if (!candidateSha || !/^[a-f0-9]{40}$/i.test(candidateSha)) {
  console.error(
    "A full 40-character RELEASE_CANDIDATE_SHA or GITHUB_SHA is required.",
  );
  process.exit(2);
}

const psql = requirePostgresTool("psql", "release data invariant verification");
const checks = [
  populationCheck(
    "ProjectRequirement population",
    'SELECT count(*) FROM "ProjectRequirement"',
    1,
  ),
  populationCheck(
    "ProjectAttachment population",
    'SELECT count(*) FROM "ProjectAttachment"',
    1,
  ),
  populationCheck(
    "ProjectRecordLink population",
    'SELECT count(*) FROM "ProjectRecordLink"',
    1,
  ),
  zeroCheck(
    "Project requirement scope alignment",
    'SELECT count(*) FROM "ProjectRequirement" pr LEFT JOIN "Project" p ON p."id" = pr."projectId" AND p."tenantId" = pr."tenantId" AND p."companyId" = pr."companyId" WHERE p."id" IS NULL',
  ),
  zeroCheck(
    "Project requirement task scope alignment",
    'SELECT count(*) FROM "ProjectRequirement" pr LEFT JOIN "ProjectTask" pt ON pt."id" = pr."taskId" AND pt."tenantId" = pr."tenantId" AND pt."companyId" = pr."companyId" AND pt."projectId" = pr."projectId" WHERE pr."taskId" IS NOT NULL AND pt."id" IS NULL',
  ),
  zeroCheck(
    "Project evidence requirement scope alignment",
    'SELECT count(*) FROM "ProjectAttachment" pa LEFT JOIN "ProjectRequirement" pr ON pr."id" = pa."requirementId" AND pr."tenantId" = pa."tenantId" AND pr."companyId" = pa."companyId" AND pr."projectId" = pa."projectId" WHERE pa."requirementId" IS NOT NULL AND pr."id" IS NULL',
  ),
  zeroCheck(
    "Project record-link requirement scope alignment",
    'SELECT count(*) FROM "ProjectRecordLink" pl LEFT JOIN "ProjectRequirement" pr ON pr."id" = pl."requirementId" AND pr."tenantId" = pl."tenantId" AND pr."companyId" = pl."companyId" AND pr."projectId" = pl."projectId" WHERE pl."requirementId" IS NOT NULL AND pr."id" IS NULL',
  ),
  zeroCheck(
    "Audit company tenant alignment",
    'SELECT count(*) FROM "AuditEvent" ae JOIN "Company" c ON c."id" = ae."companyId" WHERE ae."companyId" IS NOT NULL AND c."tenantId" <> ae."tenantId"',
  ),
  zeroCheck(
    "Approval action attribution",
    'SELECT count(*) FROM "ApprovalInstanceStep" WHERE "status" IN (\'APPROVED\', \'REJECTED\', \'RETURNED\') AND ("actedAt" IS NULL OR "actedByUserId" IS NULL)',
  ),
  zeroCheck(
    "Inventory movement scope alignment",
    'SELECT count(*) FROM "InventoryMovement" im JOIN "InventoryLocation" il ON il."id" = im."inventoryLocationId" JOIN "Item" i ON i."id" = im."itemId" WHERE il."tenantId" <> im."tenantId" OR il."companyId" <> im."companyId" OR i."tenantId" <> im."tenantId" OR i."companyId" <> im."companyId"',
  ),
  zeroCheck(
    "Inventory ledger balance reconciliation",
    'WITH movement AS (SELECT "tenantId", "companyId", "inventoryLocationId", "itemId", sum("quantityDeltaBaseUom") qty FROM "InventoryMovement" GROUP BY 1,2,3,4), balance AS (SELECT "tenantId", "companyId", "inventoryLocationId", "itemId", sum("qtyOnHand") qty FROM "InventoryBalance" GROUP BY 1,2,3,4) SELECT count(*) FROM movement m FULL JOIN balance b USING ("tenantId", "companyId", "inventoryLocationId", "itemId") WHERE coalesce(m.qty, 0) <> coalesce(b.qty, 0)',
  ),
  zeroCheck(
    "Goods receipt accepted quantity integrity",
    'SELECT count(*) FROM "GoodsReceiptLine" WHERE "acceptedQty" < 0 OR "rejectedQty" < 0 OR "damagedQty" < 0 OR "shortQty" < 0 OR "acceptedQty" + "rejectedQty" + "damagedQty" > "deliveredQty"',
  ),
  zeroCheck(
    "Transfer receipt quantity integrity",
    'SELECT count(*) FROM "InventoryTransferReceiptLine" WHERE "acceptedQty" < 0 OR "rejectedQty" < 0 OR "damagedQty" < 0 OR "acceptedQty" + "rejectedQty" + "damagedQty" > "dispatchedQtySnapshot"',
  ),
  zeroCheck(
    "Posted finance journal balance",
    'SELECT count(*) FROM (SELECT fj."id" FROM "FinanceJournal" fj JOIN "FinanceJournalLine" jl ON jl."financeJournalId" = fj."id" WHERE fj."status" = \'POSTED\' GROUP BY fj."id", fj."totalDebitAmountPhp", fj."totalCreditAmountPhp" HAVING sum(CASE WHEN jl."amountSide" = \'DEBIT\' THEN jl."amountPhp" ELSE 0 END) <> sum(CASE WHEN jl."amountSide" = \'CREDIT\' THEN jl."amountPhp" ELSE 0 END) OR fj."totalDebitAmountPhp" <> fj."totalCreditAmountPhp") invalid',
  ),
];

let failures = 0;
for (const check of checks) {
  check.actual = queryCount(check.sql);
  check.pass =
    check.kind === "MINIMUM"
      ? check.actual >= check.expected
      : check.actual === 0;
  failures += check.pass ? 0 : 1;
}

const lines = [
  "OGFI ERP release data invariant verification",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Candidate SHA: ${candidateSha}`,
  `Database URL fingerprint: ${databaseUrlFingerprint(databaseUrl)}`,
  `Label: ${label}`,
  "",
  "Invariant | Expectation | Actual | Result",
  ...checks.map(
    (check) =>
      `${check.name} | ${check.kind === "MINIMUM" ? `>= ${check.expected}` : "0 violations"} | ${check.actual} | ${check.pass ? "PASS" : "FAIL"}`,
  ),
  "",
  failures === 0
    ? `RESULT | PASS | ${checks.length} release data invariants passed.`
    : `RESULT | FAIL | ${failures} of ${checks.length} release data invariants failed.`,
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`, { mode: 0o600 });
console.log(lines.join("\n"));
if (failures > 0) process.exit(1);

function zeroCheck(name, sql) {
  return { name, sql, kind: "ZERO", expected: 0, actual: null, pass: false };
}

function populationCheck(name, sql, expected) {
  return { name, sql, kind: "MINIMUM", expected, actual: null, pass: false };
}

function queryCount(sql) {
  let output;
  try {
    output = execFileSync(
      psql,
      [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error(
      "Invariant query failed; database details were suppressed.",
    );
  }
  if (!/^\d+$/.test(output))
    throw new Error("Invariant query returned a non-numeric result.");
  return Number.parseInt(output, 10);
}
