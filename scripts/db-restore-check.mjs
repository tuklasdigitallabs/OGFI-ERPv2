import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { requirePostgresTool } from "./postgres-client-tools.mjs";
import {
  evaluateRestoreTargetSafety,
  formatRestoreTargetSafetyLines,
} from "./restore-target-safety.mjs";

const restoreDatabaseUrl = process.env.RESTORE_DATABASE_URL;
const backupFile = process.env.BACKUP_FILE;

if (!restoreDatabaseUrl) {
  console.error(
    "RESTORE_DATABASE_URL is required and must point to an isolated non-production database.",
  );
  process.exit(1);
}

const pgRestore = requirePostgresTool("pg_restore", "db:restore-check");
const psql = requirePostgresTool("psql", "db:restore-check");

if (!backupFile) {
  console.error("BACKUP_FILE is required.");
  process.exit(1);
}

if (!existsSync(backupFile)) {
  console.error(`Backup file not found: ${backupFile}`);
  process.exit(1);
}

const restoreTargetSafety = evaluateRestoreTargetSafety(process.env);
if (!restoreTargetSafety.pass) {
  console.error(formatRestoreTargetSafetyLines(restoreTargetSafety).join("\n"));
  process.exit(1);
}

execFileSync(
  pgRestore,
  [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    `--dbname=${restoreDatabaseUrl}`,
    backupFile,
  ],
  { stdio: "inherit" },
);

execFileSync(
  psql,
  [
    restoreDatabaseUrl,
    "--set=ON_ERROR_STOP=1",
    "--command=select current_database() as restored_database, now() as verified_at;",
  ],
  { stdio: "inherit" },
);

console.log(`Restore check completed from: ${backupFile}`);
