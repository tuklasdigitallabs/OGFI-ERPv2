import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";
import {
  evaluateRestoreTargetSafety,
  formatRestoreTargetSafetyLines,
} from "./restore-target-safety.mjs";

const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputFile =
  process.env.RELEASE_RESTORE_SUMMARY_OUTPUT_FILE ??
  join(evidenceRoot, "backups", "restore-check-summary.txt");

const runId = evidenceRunId(process.env);
const backupFile = requiredEnv("BACKUP_FILE");
const restoreDatabase = restoreDatabaseName(process.env);
const restoreDatabaseSource = process.env.RESTORE_DATABASE
  ? "RESTORE_DATABASE"
  : "RESTORE_DATABASE_URL";
const environment = process.env.RELEASE_ENVIRONMENT ?? "staging-rehearsal";
const githubRunId = process.env.GITHUB_RUN_ID ?? "not-recorded";
const githubSha = process.env.GITHUB_SHA ?? "not-recorded";
const verifiedAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const failedChecks = [
  [
    "RESTORE_DATABASE value valid",
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(restoreDatabase),
  ],
  [
    "RELEASE_ENVIRONMENT value valid",
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(environment),
  ],
  [
    "GITHUB_RUN_ID value valid",
    githubRunId === "not-recorded" || /^[0-9A-Za-z._-]+$/.test(githubRunId),
  ],
  [
    "GITHUB_SHA value valid",
    githubSha === "not-recorded" || /^[0-9a-fA-F]{7,40}$/.test(githubSha),
  ],
]
  .filter(([, passed]) => !passed)
  .map(([label]) => label);
const restoreTargetSafety = evaluateRestoreTargetSafety(process.env);

if (failedChecks.length > 0) {
  console.error(`Restore-check summary metadata is invalid: ${failedChecks.join(", ")}`);
  process.exit(2);
}

if (!restoreTargetSafety.pass) {
  console.error(formatRestoreTargetSafetyLines(restoreTargetSafety).join("\n"));
  process.exit(2);
}

const lines = [
  "OGFI ERP Phase I / Phase 1.5 restore-check summary",
  `evidence_run_id=${runId}`,
  `backup_file=${backupFile}`,
  `restore_database=${restoreDatabase}`,
  `restore_database_source=${restoreDatabaseSource}`,
  `restore_database_fingerprint=${databaseUrlFingerprint(process.env.RESTORE_DATABASE_URL)}`,
  "restore_target_safety=passed",
  `environment=${environment}`,
  `github_run_id=${githubRunId}`,
  `github_sha=${githubSha}`,
  `verified_at_utc=${verifiedAtUtc}`,
  "RESULT | PASS | Restore-check summary captured.",
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(`Restore-check summary written: ${outputFile}`);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required for the restore-check summary.`);
    process.exit(2);
  }

  return value;
}

function restoreDatabaseName(env) {
  if (env.RESTORE_DATABASE) {
    return env.RESTORE_DATABASE;
  }

  const restoreDatabaseUrl = env.RESTORE_DATABASE_URL;
  if (!restoreDatabaseUrl) {
    console.error(
      "RESTORE_DATABASE_URL is required for the restore-check summary.",
    );
    process.exit(2);
  }

  try {
    const parsed = new URL(restoreDatabaseUrl);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (databaseName) {
      return databaseName;
    }
  } catch {
    console.error("RESTORE_DATABASE_URL is not parseable.");
    process.exit(2);
  }

  console.error(
    "RESTORE_DATABASE or a database name in RESTORE_DATABASE_URL is required for the restore-check summary.",
  );
  process.exit(2);
}
