import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, "<set-approved-evidence-run-id>");
const outputFile =
  process.env.RELEASE_RECOVERY_CHECKLIST_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "recovery-checklist",
    `recovery-evidence-checklist-${timestamp}.txt`,
  );

const checklist = [
  {
    owner: "DevOps Owner / DBA",
    action: "Run backup and restore preflight with reviewed source and isolated restore URLs.",
    command: "pnpm release:backup-restore-preflight",
    artifact: "backups/backup-restore-preflight-*.txt",
    acceptance: "Must contain RESULT | PASS | Backup and restore prerequisites are configured.",
  },
  {
    owner: "DevOps Owner",
    action: "Create a real database dump and checksum from the approved release rehearsal source database.",
    command: "BACKUP_DIR=release-evidence/backups pnpm db:backup",
    artifact: "backups/ogfi-erp-*.dump and backups/ogfi-erp-*.dump.sha256",
    acceptance: "Checksum file must hash-match the dump and reference the same dump filename when a filename is present.",
  },
  {
    owner: "DevOps Owner",
    action: "Summarize backup metadata after the dump exists.",
    command: "BACKUP_FILE=<release-evidence/backups/ogfi-erp-*.dump> pnpm release:backup-summary",
    artifact: "backups/backup-summary.txt",
    acceptance: "Must contain evidence_run_id, backup_file, backup_size_bytes, backup_checksum_status=present, and RESULT | PASS.",
  },
  {
    owner: "DevOps Owner / DBA",
    action: "Restore only into an isolated non-production target.",
    command: "BACKUP_FILE=<release-evidence/backups/ogfi-erp-*.dump> pnpm db:restore-check",
    artifact: "external restore execution evidence plus backups/restore-check-summary.txt",
    acceptance: "Restore target safety must pass; never use a production restore target.",
  },
  {
    owner: "DevOps Owner / DBA",
    action: "Summarize restore proof after restore verification.",
    command: "BACKUP_FILE=<release-evidence/backups/ogfi-erp-*.dump> pnpm release:restore-summary",
    artifact: "backups/restore-check-summary.txt",
    acceptance: "Must contain restore_target_safety=passed, evidence_run_id, backup_file, restore_database, and RESULT | PASS.",
  },
  {
    owner: "Release Manager / DevOps Owner",
    action: "Keep rollback evidence blocked until DEC-0248 same-fence rollback/recovery is implemented.",
    command: "UNAVAILABLE — legacy release:rollback-summary exits 78.",
    artifact: "Future root-owned release-service rollback/recovery journal evidence",
    acceptance: "Only executed same-fence rollback/recovery can satisfy this item; manual metadata receives no credit.",
  },
  {
    owner: "DevOps Owner / QA Lead",
    action: "Keep authoritative post-rollback smoke blocked until DEC-0248 proves the active target.",
    command: "UNAVAILABLE — ordinary release:smoke output receives no rollback execution credit.",
    artifact: "Future DEC-0248 authoritative post-rollback smoke evidence",
    acceptance: "Must bind the active proxy target and exact recovered release under the same fence.",
  },
  {
    owner: "Release Manager",
    action: "Refresh recovery status after all recovery artifacts are collected.",
    command: "pnpm release:backup-restore-status",
    artifact: "backup-restore-status/backup-restore-status-*.txt",
    acceptance: "Must remain BLOCKED while DEC-0248 hosted release authority is unavailable.",
  },
];

const latestStatus = latestMatchingFile(
  join(evidenceRoot, "backup-restore-status"),
  /^backup-restore-status-.*\.txt$/,
);

const lines = [
  "OGFI ERP Phase I / Phase 1.5 recovery evidence checklist",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This checklist is advisory. It does not create a backup, restore a database, run rollback, run smoke tests, or approve release.",
  "Use the same RELEASE_EVIDENCE_RUN_ID across backup summary, restore summary, rollback summary, status reports, final manifest, and GO / NO-GO.",
  "",
  "Recovery Evidence Steps",
];

for (const [index, item] of checklist.entries()) {
  lines.push(
    `STEP | ${String(index + 1).padStart(2, "0")} | owner=${item.owner}`,
    `ACTION | ${item.action}`,
    `COMMAND | ${item.command}`,
    `ARTIFACT | ${item.artifact}`,
    `ACCEPTANCE | ${item.acceptance}`,
    "",
  );
}

lines.push(
  "Latest Backup/Restore Status",
  ...latestStatusLines(latestStatus),
  "",
  latestStatus
    ? "RESULT | BLOCKED | DEC-0248 same-fence rollback/recovery remains unavailable; use the latest backup/restore status for diagnostics only."
    : "RESULT | BLOCKED | DEC-0248 same-fence rollback/recovery remains unavailable; backup/restore diagnostics have not been generated.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Recovery evidence checklist written: ${outputFile}`);

function latestMatchingFile(directory, pattern) {
  if (!existsSync(directory)) {
    return null;
  }

  return (
    readdirSync(directory)
      .filter((file) => pattern.test(file))
      .sort()
      .at(-1) ?? null
  );
}

function latestStatusLines(latestStatus) {
  if (!latestStatus) {
    return ["STATUS | missing latest backup-restore-status artifact"];
  }

  const relativePath = `backup-restore-status/${latestStatus}`;
  const content = readFileSync(join(evidenceRoot, relativePath), "utf8");
  const statusLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("RESULT |") ||
        line.startsWith("BLOCKED |") ||
        line.startsWith("PASS |") ||
        line.startsWith("SKIP |"),
    )
    .slice(0, 12);

  return [
    `STATUS | ${relativePath}`,
    ...(statusLines.length > 0 ? statusLines : ["STATUS | no result lines found"]),
  ];
}
