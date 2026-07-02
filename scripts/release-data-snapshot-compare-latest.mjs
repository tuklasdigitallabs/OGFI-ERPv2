import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const snapshotDir =
  process.env.RELEASE_DATA_SNAPSHOT_COMPARE_SOURCE_DIR ??
  process.env.RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_DIR ??
  "release-evidence/data-snapshots";
const beforePattern =
  process.env.RELEASE_DATA_SNAPSHOT_BEFORE_PATTERN ??
  "^data-pre-migration-rehearsal-.*\\.txt$";
const afterPattern =
  process.env.RELEASE_DATA_SNAPSHOT_AFTER_PATTERN ??
  "^data-post-migration-rehearsal-.*\\.txt$";

const beforeFile = latestMatchingFile(snapshotDir, new RegExp(beforePattern));
const afterFile = latestMatchingFile(snapshotDir, new RegExp(afterPattern));

const result = spawnSync(
  process.execPath,
  ["scripts/release-data-snapshot-compare.mjs"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RELEASE_DATA_SNAPSHOT_BEFORE: beforeFile,
      RELEASE_DATA_SNAPSHOT_AFTER: afterFile,
      RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_DIR:
        process.env.RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_DIR ?? snapshotDir,
    },
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

function latestMatchingFile(directory, pattern) {
  if (!existsSync(directory)) {
    console.error(`Data snapshot directory not found: ${directory}`);
    process.exit(2);
  }

  const files = readdirSync(directory)
    .filter((file) => pattern.test(file))
    .map((file) => {
      const path = join(directory, file);
      return { path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (files.length === 0) {
    console.error(
      `No data snapshot found in ${directory} for pattern ${pattern}`,
    );
    process.exit(2);
  }

  return files[0].path;
}
