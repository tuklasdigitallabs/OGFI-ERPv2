import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const outputFile =
  process.env.RELEASE_BACKUP_RESTORE_STATUS_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "backup-restore-status",
    `backup-restore-status-${timestamp}.txt`,
  );

const artifactChecks = [
  {
    label: "Backup/restore preflight",
    directory: "backups",
    pattern: /^backup-restore-preflight-.*\.txt$/,
    requiredAll: [
      "RESULT | PASS | Backup and restore prerequisites are configured.",
    ],
    severity: "High",
    owner: "DevOps Owner / DBA",
    evidence: "passing DATABASE_URL, RESTORE_DATABASE_URL, BACKUP_FILE, PostgreSQL client, and restore-target safety preflight result",
  },
  {
    label: "Backup dump artifact",
    directory: "backups",
    pattern: /^ogfi-erp-.*\.dump$/,
    severity: "Critical",
    owner: "DevOps Owner",
    evidence: "real database backup dump from the release rehearsal",
  },
  {
    label: "Backup checksum artifact",
    directory: "backups",
    pattern: /^ogfi-erp-.*\.dump\.sha256$/,
    severity: "Critical",
    owner: "DevOps Owner",
    evidence: "SHA-256 checksum artifact generated with the release rehearsal backup dump",
  },
  {
    label: "Backup summary",
    directory: "backups",
    pattern: /^backup-summary\.txt$/,
    requiredAll: [
      "backup_file=",
      "backup_size_bytes=",
      "evidence_run_id=",
      "backup_checksum_status=present",
      "verified_at_utc=",
      "RESULT | PASS | Backup summary captured.",
    ],
    severity: "Critical",
    owner: "DevOps Owner",
    evidence: "backup-summary.txt with backup path, size, timestamp, and PASS marker",
  },
  {
    label: "Restore-check summary",
    directory: "backups",
    pattern: /^restore-check-summary\.txt$/,
    requiredAll: [
      "backup_file=",
      "restore_database=",
      "restore_target_safety=passed",
      "evidence_run_id=",
      "verified_at_utc=",
      "RESULT | PASS | Restore-check summary captured.",
    ],
    severity: "Critical",
    owner: "DevOps Owner / DBA",
    evidence: "restore-check-summary.txt from isolated non-production restore verification",
  },
  {
    label: "Staging rollback summary",
    directory: "staging-rollback",
    pattern: /^rollback-summary\.txt$/,
    requiredAll: [
      "rollback_release_version=",
      "evidence_run_id=",
      "verified_at_utc=",
      "RESULT | PASS | Staging rollback summary captured.",
    ],
    severity: "Critical",
    owner: "Release Manager / DevOps Owner",
    evidence: "rollback-summary.txt for the approved rollback target",
  },
  {
    label: "Post-rollback smoke report",
    directory: "staging-rollback/smoke",
    pattern: /^smoke-.*\.txt$/,
    requiredAll: [
      "api-health /api/health expected=200 actual=200",
      "api-readiness /api/readiness expected=200 actual=200",
      "health /health expected=200 actual=200",
      "readiness /readiness expected=200 actual=200",
      "protected-items-route /items expected=3xx actual=307",
    ],
    severity: "Critical",
    owner: "DevOps Owner / QA Lead",
    evidence: "post-rollback smoke report proving health, readiness, and protected route behavior",
  },
];

const lines = [
  "OGFI ERP Phase I / Phase 1.5 backup, restore, and rollback readiness status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This report is advisory. It does not create a backup, restore a database, run rollback, run smoke tests, or approve release.",
  "",
  "Required Evidence Sequence",
  "1. Run pnpm release:backup-restore-preflight with reviewed DATABASE_URL and RESTORE_DATABASE_URL.",
  "2. Capture a real database dump with pnpm db:backup or the approved environment backup workflow.",
  "3. Generate backup-summary.txt with pnpm release:backup-summary after the backup artifact exists.",
  "4. Restore the backup into an isolated non-production database with pnpm db:restore-check.",
  "5. Generate restore-check-summary.txt with pnpm release:restore-summary after restore verification.",
  "6. Run the approved staging rollback rehearsal and generate staging-rollback/rollback-summary.txt.",
  "7. Run post-rollback smoke with SMOKE_OUTPUT_DIR=release-evidence/staging-rollback/smoke pnpm release:smoke.",
  "8. Rerun pnpm release:backup-restore-status and attach the latest backup-restore-status artifact.",
  "",
];

let blockers = 0;
const artifactResults = new Map();

for (const check of artifactChecks) {
  const result = evaluateArtifact(check);
  artifactResults.set(check.label, result);
  if (result.pass) {
    lines.push(`PASS | ${check.label} | ${result.detail}`);
    for (const metadataLine of formatMetadataLines(result.metadata)) {
      lines.push(`  ${metadataLine}`);
    }
  } else {
    blockers += 1;
    lines.push(`BLOCKED | ${check.label} | ${result.detail}`);
    lines.push(
      `  OWNER | severity=${check.severity} | owner=${check.owner} | evidence=${check.evidence}`,
    );
  }
}

lines.push("", "Recovery Evidence Consistency");
const consistencyResult = evaluateRecoveryConsistency(
  artifactResults.get("Backup summary"),
  artifactResults.get("Restore-check summary"),
  artifactResults.get("Staging rollback summary"),
);
if (consistencyResult.status === "SKIP") {
  lines.push(`SKIP | Backup/restore evidence consistency | ${consistencyResult.detail}`);
} else if (consistencyResult.pass) {
  lines.push(`PASS | Backup/restore evidence consistency | ${consistencyResult.detail}`);
} else {
  blockers += 1;
  lines.push(`BLOCKED | Backup/restore evidence consistency | ${consistencyResult.detail}`);
  lines.push(
    "  OWNER | severity=Critical | owner=DevOps Owner / Release Manager | evidence=regenerate backup, restore, and rollback summaries in the same evidence run with the same backup artifact",
  );
}

const checksumResult = await evaluateBackupChecksum(
  artifactResults.get("Backup dump artifact"),
  artifactResults.get("Backup checksum artifact"),
);
if (checksumResult.status === "SKIP") {
  lines.push(`SKIP | Backup checksum integrity | ${checksumResult.detail}`);
} else if (checksumResult.pass) {
  lines.push(`PASS | Backup checksum integrity | ${checksumResult.detail}`);
} else {
  blockers += 1;
  lines.push(`BLOCKED | Backup checksum integrity | ${checksumResult.detail}`);
  lines.push(
    "  OWNER | severity=Critical | owner=DevOps Owner | evidence=regenerate the backup dump and checksum artifact from the approved release rehearsal",
  );
}

lines.push("");
if (blockers > 0) {
  lines.push(
    `RESULT | BLOCKED | ${blockers} backup, restore, or rollback evidence blocker(s) remain before release recovery can be accepted.`,
  );
  lines.push(
    "Next action: capture a real backup dump, matching checksum, backup summary, isolated restore summary, rollback summary, and post-rollback smoke report.",
  );
} else {
  lines.push(
    "RESULT | PASS | Backup, restore, and rollback evidence is present for release recovery review.",
  );
}

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Backup/restore readiness status written: ${outputFile}`);

function evaluateArtifact(check) {
  const directory = join(evidenceRoot, check.directory);
  if (!existsSync(directory)) {
    return { pass: false, detail: `missing directory: ${directory}` };
  }

  const matchingFiles = readdirSync(directory)
    .filter((file) => check.pattern.test(file))
    .sort();

  if (matchingFiles.length === 0) {
    return { pass: false, detail: `no matching artifact in ${directory}` };
  }

  const latestFile = matchingFiles.at(-1);
  const latestFilePath = join(directory, latestFile);
  if (artifactPasses(latestFilePath, check)) {
    return {
      pass: true,
      detail: latestFile,
      filePath: latestFilePath,
      metadata: extractArtifactMetadata(latestFilePath),
    };
  }

  return {
    pass: false,
    detail: `latest matching artifact ${latestFile} is missing: ${missingMarkers(
      latestFilePath,
      check,
    ).join(", ")}`,
    filePath: latestFilePath,
    metadata: extractArtifactMetadata(latestFilePath),
  };
}

function artifactPasses(filePath, check) {
  if (!check.requiredAll?.length && !check.requiredAny?.length) {
    return true;
  }

  const content = readFileSync(filePath, "utf8");
  const allPass =
    !check.requiredAll?.length ||
    check.requiredAll.every((required) => content.includes(required));
  const anyPass =
    !check.requiredAny?.length ||
    check.requiredAny.some((required) => content.includes(required));

  return allPass && anyPass;
}

function evaluateRecoveryConsistency(backupSummary, restoreSummary, rollbackSummary) {
  if (!backupSummary?.pass || !restoreSummary?.pass || !rollbackSummary?.pass) {
    return {
      status: "SKIP",
      detail:
        "requires passing backup summary, restore-check summary, and rollback summary artifacts",
    };
  }

  const runIds = [
    backupSummary.metadata.evidenceRunId,
    restoreSummary.metadata.evidenceRunId,
    rollbackSummary.metadata.evidenceRunId,
  ];
  if (runIds.some((runId) => !runId)) {
    return {
      pass: false,
      detail: "evidence run IDs are not recorded in one or more recovery artifacts",
    };
  }

  if (new Set(runIds).size !== 1) {
    return {
      pass: false,
      detail: `backup_evidence_run_id=${runIds[0]} | restore_evidence_run_id=${runIds[1]} | rollback_evidence_run_id=${runIds[2]}`,
    };
  }

  const backupFile = backupSummary.metadata.backupFile;
  const restoreBackupFile = restoreSummary.metadata.backupFile;
  if (!backupFile || !restoreBackupFile) {
    return {
      pass: false,
      detail: "backup file references are not recorded in one or more recovery artifacts",
    };
  }

  if (backupFile !== restoreBackupFile) {
    return {
      pass: false,
      detail: `backup_file=${backupFile} | restore_backup_file=${restoreBackupFile}`,
    };
  }

  return {
    pass: true,
    detail: `evidence_run_id=${runIds[0]} | backup_file=${backupFile}`,
  };
}

async function evaluateBackupChecksum(backupDump, checksumArtifact) {
  if (!backupDump?.pass || !checksumArtifact?.pass) {
    return {
      status: "SKIP",
      detail: "requires passing backup dump and backup checksum artifacts",
    };
  }

  const checksumContent = readFileSync(checksumArtifact.filePath, "utf8").trim();
  const match = /^([a-fA-F0-9]{64})(?:\s+\*?(.+))?$/.exec(checksumContent);
  if (!match) {
    return {
      pass: false,
      detail: `checksum artifact ${basename(checksumArtifact.filePath)} is not a valid SHA-256 checksum file`,
    };
  }

  const [, expectedChecksum, referencedFile] = match;
  if (referencedFile && basename(referencedFile.trim()) !== basename(backupDump.filePath)) {
    return {
      pass: false,
      detail: `checksum references ${referencedFile.trim()} but backup artifact is ${basename(backupDump.filePath)}`,
    };
  }

  const actualChecksum = await sha256File(backupDump.filePath);
  if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    return {
      pass: false,
      detail: `checksum mismatch for ${basename(backupDump.filePath)}`,
    };
  }

  return {
    pass: true,
    detail: `${basename(backupDump.filePath)} matches ${basename(checksumArtifact.filePath)}`,
  };
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function extractArtifactMetadata(filePath) {
  const content = readFileSync(filePath, "utf8");
  return {
    evidenceRunId:
      /^Evidence run ID: (.+)$/m.exec(content)?.[1]?.trim() ??
      /^evidence_run_id=(.+)$/m.exec(content)?.[1]?.trim() ??
      null,
    databaseFingerprint:
      /^Database URL fingerprint: (.+)$/m.exec(content)?.[1]?.trim() ??
      /^database_fingerprint=(.+)$/m.exec(content)?.[1]?.trim() ??
      null,
    restoreDatabaseFingerprint:
      /^Restore database URL fingerprint: (.+)$/m.exec(content)?.[1]?.trim() ??
      /^restore_database_fingerprint=(.+)$/m.exec(content)?.[1]?.trim() ??
      null,
    backupFile: /^backup_file=(.+)$/m.exec(content)?.[1]?.trim() ?? null,
    generatedAt:
      /^Generated UTC: (.+)$/m.exec(content)?.[1]?.trim() ??
      /^verified_at_utc=(.+)$/m.exec(content)?.[1]?.trim() ??
      null,
  };
}

function formatMetadataLines(metadata) {
  const lines = [];
  if (metadata?.evidenceRunId) {
    lines.push(`metadata_evidence_run_id=${metadata.evidenceRunId}`);
  }
  if (metadata?.databaseFingerprint) {
    lines.push(`metadata_database_fingerprint=${metadata.databaseFingerprint}`);
  }
  if (metadata?.restoreDatabaseFingerprint) {
    lines.push(`metadata_restore_database_fingerprint=${metadata.restoreDatabaseFingerprint}`);
  }
  if (metadata?.backupFile) {
    lines.push(`metadata_backup_file=${metadata.backupFile}`);
  }
  if (metadata?.generatedAt) {
    lines.push(`metadata_generated_utc=${metadata.generatedAt}`);
  }

  return lines;
}

function missingMarkers(filePath, check) {
  const content = readFileSync(filePath, "utf8");
  const missing = [];
  for (const marker of check.requiredAll ?? []) {
    if (!content.includes(marker)) {
      missing.push(marker);
    }
  }
  if (
    check.requiredAny?.length &&
    !check.requiredAny.some((marker) => content.includes(marker))
  ) {
    missing.push(`one of: ${check.requiredAny.join(" OR ")}`);
  }

  return missing;
}
