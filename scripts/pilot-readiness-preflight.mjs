import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPostgresToolAvailable } from "./postgres-client-tools.mjs";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const outputDir =
  process.env.PILOT_READINESS_OUTPUT_DIR ?? "release-evidence/pilot-readiness";
const outputFile = join(outputDir, `pilot-readiness-preflight-${timestamp}.txt`);
const runId = evidenceRunId(process.env, timestamp);

const thresholdNames = [
  "PILOT_MIN_COMPANIES",
  "PILOT_MIN_BRANDS",
  "PILOT_MIN_BRANCH_LOCATIONS",
  "PILOT_MIN_WAREHOUSE_LOCATIONS",
  "PILOT_MIN_INVENTORY_LOCATIONS",
  "PILOT_MIN_USERS",
  "PILOT_MIN_ROLE_ASSIGNMENTS",
  "PILOT_MIN_SCOPE_ASSIGNMENTS",
  "PILOT_MIN_APPROVAL_RULES",
  "PILOT_MIN_APPROVAL_STEPS",
  "PILOT_MIN_SUPPLIERS",
  "PILOT_MIN_ITEMS",
  "PILOT_MIN_UOMS",
  "PILOT_MIN_SUPPLIER_ITEM_LINKS",
  "PILOT_MIN_STOCK_RECORDS",
  "PILOT_MIN_PROJECT_TEMPLATES",
  "PILOT_MIN_PROJECTS",
  "PILOT_MIN_RESTRICTED_PROJECTS",
  "PILOT_MIN_PROJECT_MEMBERS",
  "PILOT_MIN_PROJECT_TASKS",
  "PILOT_MIN_PROJECT_BLOCKERS",
  "PILOT_MIN_PROJECT_MILESTONES",
  "PILOT_MIN_PROJECT_RISKS",
  "PILOT_MIN_PROJECT_RECORD_LINKS"
];

const invalidThresholds = thresholdNames.filter((name) => {
  const raw = process.env[name];
  if (!raw) {
    return false;
  }
  const parsed = Number.parseInt(raw, 10);
  return !Number.isFinite(parsed) || parsed < 0;
});

const checks = [
  ["DATABASE_URL configured", Boolean(process.env.DATABASE_URL)],
  ["psql available or PSQL_BIN configured", isPostgresToolAvailable("psql")],
  ["pilot threshold overrides valid", invalidThresholds.length === 0]
];

const missing = checks.filter(([, passed]) => !passed).map(([label]) => label);
const result =
  missing.length === 0
    ? "RESULT | PASS | Pilot readiness prerequisites are configured."
    : "RESULT | WARN | Pilot readiness prerequisites are incomplete; no database checks were attempted.";

const lines = [
  "OGFI ERP Phase I / Phase 1.5 pilot readiness preflight",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Database URL fingerprint: ${databaseUrlFingerprint(process.env.DATABASE_URL)}`,
  `Threshold snapshot: ${thresholdSnapshot()}`,
  "No database URLs, credentials, or raw command outputs are recorded by this preflight.",
  "",
  ...checks.map(([label, passed]) => `${passed ? "PASS" : "WARN"} | ${label}`),
  "",
  result
];

if (invalidThresholds.length > 0) {
  lines.push(`Invalid threshold override(s): ${invalidThresholds.join(", ")}`);
}
if (missing.length > 0) {
  lines.push(`Missing prerequisites: ${missing.join(", ")}`);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Pilot readiness preflight evidence written: ${outputFile}`);

function thresholdSnapshot() {
  return thresholdNames
    .map((name) => `${name}=${process.env[name] ?? "default"}`)
    .join(",");
}
