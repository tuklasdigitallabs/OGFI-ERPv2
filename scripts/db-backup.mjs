import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { requirePostgresTool } from "./postgres-client-tools.mjs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pgDump = requirePostgresTool("pg_dump", "db:backup");

const backupDir = process.env.BACKUP_DIR ?? "backups";
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const backupFile =
  process.env.BACKUP_FILE ?? join(backupDir, `ogfi-erp-${timestamp}.dump`);

mkdirSync(dirname(backupFile), { recursive: true });

execFileSync(
  pgDump,
  [
    databaseUrl,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    `--file=${backupFile}`,
  ],
  { stdio: "inherit" },
);

const checksum = await sha256File(backupFile);
writeFileSync(`${backupFile}.sha256`, `${checksum}  ${basename(backupFile)}\n`);

console.log(`Backup written: ${backupFile}`);
console.log(`Backup checksum written: ${backupFile}.sha256`);

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
