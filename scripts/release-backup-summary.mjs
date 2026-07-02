import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";

const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputFile =
  process.env.RELEASE_BACKUP_SUMMARY_OUTPUT_FILE ??
  join(evidenceRoot, "backups", "backup-summary.txt");

const runId = evidenceRunId(process.env);
const backupFile = requiredEnv("BACKUP_FILE");
const backupExists = existsSync(backupFile);
const backupSizeBytes = backupExists ? statSync(backupFile).size : "not-found";
const checksumFile = process.env.BACKUP_CHECKSUM_FILE ?? `${backupFile}.sha256`;
const checksumStatus = existsSync(checksumFile) ? "present" : "missing";
const environment = process.env.RELEASE_ENVIRONMENT ?? "staging-rehearsal";
const githubRunId = process.env.GITHUB_RUN_ID ?? "not-recorded";
const githubSha = process.env.GITHUB_SHA ?? "not-recorded";
const verifiedAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const failedChecks = [
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

if (!backupExists) {
  console.error(`Backup file not found: ${backupFile}`);
  process.exit(2);
}

if (failedChecks.length > 0) {
  console.error(`Backup summary metadata is invalid: ${failedChecks.join(", ")}`);
  process.exit(2);
}

const lines = [
  "OGFI ERP Phase I / Phase 1.5 backup summary",
  `evidence_run_id=${runId}`,
  `backup_file=${backupFile}`,
  `backup_size_bytes=${backupSizeBytes}`,
  `backup_checksum_file=${checksumFile}`,
  `backup_checksum_status=${checksumStatus}`,
  `database_fingerprint=${databaseUrlFingerprint(process.env.DATABASE_URL)}`,
  `environment=${environment}`,
  `github_run_id=${githubRunId}`,
  `github_sha=${githubSha}`,
  `verified_at_utc=${verifiedAtUtc}`,
  "RESULT | PASS | Backup summary captured.",
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(`Backup summary written: ${outputFile}`);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required for the backup summary.`);
    process.exit(2);
  }

  return value;
}
