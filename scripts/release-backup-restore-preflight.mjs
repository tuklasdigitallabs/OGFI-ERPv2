import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";
import { isPostgresToolAvailable } from "./postgres-client-tools.mjs";
import {
  evaluateRestoreTargetSafety,
  formatRestoreTargetSafetyLines,
} from "./restore-target-safety.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const outputDir = join(evidenceRoot, "backups");
const outputFile = join(outputDir, `backup-restore-preflight-${timestamp}.txt`);

const checks = [
  ["DATABASE_URL configured", Boolean(process.env.DATABASE_URL)],
  ["RESTORE_DATABASE_URL configured", Boolean(process.env.RESTORE_DATABASE_URL)],
  ["BACKUP_FILE configured", Boolean(process.env.BACKUP_FILE)],
  ["pg_dump available or PG_DUMP_BIN configured", isPostgresToolAvailable("pg_dump")],
  ["pg_restore available or PG_RESTORE_BIN configured", isPostgresToolAvailable("pg_restore")],
  ["psql available or PSQL_BIN configured", isPostgresToolAvailable("psql")]
];
const restoreTargetSafety = evaluateRestoreTargetSafety(process.env);

const missing = checks
  .filter(([, passed]) => !passed)
  .map(([label]) => label);
if (!restoreTargetSafety.pass) {
  missing.push("Restore target safety");
}
const result =
  missing.length === 0
    ? "RESULT | PASS | Backup and restore prerequisites are configured."
    : "RESULT | WARN | Backup and restore prerequisites are incomplete; no backup or restore was attempted.";

const lines = [
  "OGFI ERP Phase I / Phase 1.5 backup and restore preflight",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Database URL fingerprint: ${databaseUrlFingerprint(process.env.DATABASE_URL)}`,
  `Restore database URL fingerprint: ${databaseUrlFingerprint(process.env.RESTORE_DATABASE_URL)}`,
  "No database URLs, credentials, or raw command outputs are recorded by this preflight.",
  "",
  ...checks.map(([label, passed]) => `${passed ? "PASS" : "WARN"} | ${label}`),
  "",
  ...formatRestoreTargetSafetyLines(restoreTargetSafety),
  "",
  result
];

if (missing.length > 0) {
  lines.push(`Missing prerequisites: ${missing.join(", ")}`);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Backup/restore preflight evidence written: ${outputFile}`);
