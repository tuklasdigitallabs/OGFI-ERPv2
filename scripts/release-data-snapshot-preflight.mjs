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
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputDir =
  process.env.RELEASE_DATA_SNAPSHOT_OUTPUT_DIR ??
  join(evidenceRoot, "data-snapshots");
const outputFile = join(
  outputDir,
  `data-snapshot-preflight-${timestamp}.txt`,
);

const label = process.env.RELEASE_DATA_SNAPSHOT_LABEL ?? "snapshot";
const runId = evidenceRunId(process.env, timestamp);
const allowMissingTables =
  process.env.RELEASE_DATA_SNAPSHOT_ALLOW_MISSING_TABLES === "yes";
const allowDestructiveDeltas =
  process.env.RELEASE_DATA_SNAPSHOT_ALLOW_DESTRUCTIVE_DELTAS === "yes";
const validLabel = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(label);

const checks = [
  ["DATABASE_URL configured", Boolean(process.env.DATABASE_URL)],
  ["psql available or PSQL_BIN configured", isPostgresToolAvailable("psql")],
  ["snapshot label valid", validLabel],
  [
    "missing-table override explicit",
    !process.env.RELEASE_DATA_SNAPSHOT_ALLOW_MISSING_TABLES ||
      process.env.RELEASE_DATA_SNAPSHOT_ALLOW_MISSING_TABLES === "yes",
  ],
  [
    "destructive-delta override explicit",
    !process.env.RELEASE_DATA_SNAPSHOT_ALLOW_DESTRUCTIVE_DELTAS ||
      process.env.RELEASE_DATA_SNAPSHOT_ALLOW_DESTRUCTIVE_DELTAS === "yes",
  ],
];

const missing = checks.filter(([, passed]) => !passed).map(([label]) => label);
const result =
  missing.length === 0
    ? "RESULT | PASS | Data snapshot prerequisites are configured."
    : "RESULT | WARN | Data snapshot prerequisites are incomplete; no database checks were attempted.";

const lines = [
  "OGFI ERP Phase I / Phase 1.5 data snapshot preflight",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Database URL fingerprint: ${databaseUrlFingerprint(process.env.DATABASE_URL)}`,
  "No database URLs, credentials, or raw command outputs are recorded by this preflight.",
  `Snapshot label: ${validLabel ? label : "INVALID"}`,
  `Allow missing tables: ${allowMissingTables ? "yes" : "no"}`,
  `Allow destructive deltas: ${allowDestructiveDeltas ? "yes" : "no"}`,
  "",
  ...checks.map(([label, passed]) => `${passed ? "PASS" : "WARN"} | ${label}`),
  "",
  result,
];

if (missing.length > 0) {
  lines.push(`Missing prerequisites: ${missing.join(", ")}`);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Data snapshot preflight evidence written: ${outputFile}`);
