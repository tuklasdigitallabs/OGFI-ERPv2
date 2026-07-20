import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import {
  postgresClientConnectionUrl,
  requirePostgresTool,
} from "./postgres-client-tools.mjs";
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

const checksumFile = `${backupFile}.sha256`;
if (!existsSync(checksumFile)) {
  console.error(`Backup checksum file not found: ${checksumFile}`);
  process.exit(1);
}
const expectedChecksum = readFileSync(checksumFile, "utf8")
  .trim()
  .split(/\s+/)[0];
if (!/^[a-f0-9]{64}$/i.test(expectedChecksum ?? "")) {
  console.error(`Backup checksum file is invalid: ${checksumFile}`);
  process.exit(1);
}
const actualChecksum = await sha256File(backupFile);
if (actualChecksum !== expectedChecksum.toLowerCase()) {
  console.error(
    "Backup checksum verification failed; restore was not attempted.",
  );
  process.exit(1);
}

const restoreTargetSafety = evaluateRestoreTargetSafety(process.env);
if (!restoreTargetSafety.pass) {
  console.error(formatRestoreTargetSafetyLines(restoreTargetSafety).join("\n"));
  process.exit(1);
}
const restoreClientUrl = postgresClientConnectionUrl(restoreDatabaseUrl);

execFileSync(
  pgRestore,
  [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    `--dbname=${restoreClientUrl}`,
    backupFile,
  ],
  { stdio: "inherit" },
);

execFileSync(
  psql,
  [
    restoreClientUrl,
    "--set=ON_ERROR_STOP=1",
    "--command=select current_database() as restored_database, now() as verified_at;",
  ],
  { stdio: "inherit" },
);

console.log(`Restore check completed from: ${backupFile}`);

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
