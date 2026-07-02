import {
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
const snapshotDir =
  process.env.RELEASE_DATA_SNAPSHOT_STATUS_SOURCE_DIR ??
  join(evidenceRoot, "data-snapshots");
const outputFile =
  process.env.RELEASE_DATA_SNAPSHOT_STATUS_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "data-snapshot-status",
    `data-snapshot-status-${timestamp}.txt`,
  );

const artifactChecks = [
  {
    label: "Data snapshot preflight",
    pattern: /^data-snapshot-preflight-.*\.txt$/,
    requiredAny: [
      "RESULT | PASS | Data snapshot prerequisites are configured.",
    ],
    severity: "High",
    owner: "DBA / Platform Engineering",
    evidence: "DATABASE_URL and PostgreSQL client preflight result",
  },
  {
    label: "Pre-migration rehearsal snapshot",
    pattern: /^data-pre-migration-rehearsal-.*\.txt$/,
    requiredAll: [
      "OGFI ERP Phase I / Phase 1.5 release data snapshot",
      "Label: pre-migration-rehearsal",
      "RESULT | PASS | Data snapshot captured.",
    ],
    severity: "Critical",
    owner: "DBA / Platform Engineering",
    evidence: "pre-migration rehearsal row-count snapshot from the selected release database",
  },
  {
    label: "Post-migration rehearsal snapshot",
    pattern: /^data-post-migration-rehearsal-.*\.txt$/,
    requiredAll: [
      "OGFI ERP Phase I / Phase 1.5 release data snapshot",
      "Label: post-migration-rehearsal",
      "RESULT | PASS | Data snapshot captured.",
    ],
    severity: "Critical",
    owner: "DBA / Platform Engineering",
    evidence: "post-migration rehearsal row-count snapshot from the selected release database",
  },
  {
    label: "Data snapshot delta",
    pattern: /^data-snapshot-delta-.*\.txt$/,
    requiredAll: ["RESULT | PASS | Snapshot delta captured."],
    severity: "Critical",
    owner: "DBA / Platform Engineering",
    evidence: "reviewed delta comparing the pre/post rehearsal snapshots",
  },
];

const lines = [
  "OGFI ERP Phase I / Phase 1.5 data snapshot readiness status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  `Snapshot evidence directory: ${snapshotDir}`,
  "",
  "This report is advisory. It does not query a database and does not replace pre/post migration rehearsal snapshots.",
  "",
  "Required Evidence Sequence",
  "1. Run pnpm release:data-snapshot-preflight against the selected rehearsal database.",
  "2. Capture pre-migration row counts with pnpm release:data-snapshot using label pre-migration-rehearsal.",
  "3. Apply the release migration in the approved rehearsal environment.",
  "4. Capture post-migration row counts with pnpm release:data-snapshot using label post-migration-rehearsal.",
  "5. Run pnpm release:data-snapshot:compare-latest and review the generated delta.",
  "6. Rerun pnpm release:data-snapshot-status and attach the latest data-snapshot-status artifact.",
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

lines.push("", "Snapshot Consistency");
const consistencyResult = evaluateSnapshotConsistency(
  artifactResults.get("Pre-migration rehearsal snapshot"),
  artifactResults.get("Post-migration rehearsal snapshot"),
);
if (consistencyResult.status === "SKIP") {
  lines.push(`SKIP | Pre/post snapshot consistency | ${consistencyResult.detail}`);
} else if (consistencyResult.pass) {
  lines.push(`PASS | Pre/post snapshot consistency | ${consistencyResult.detail}`);
} else {
  blockers += 1;
  lines.push(`BLOCKED | Pre/post snapshot consistency | ${consistencyResult.detail}`);
  lines.push(
    "  OWNER | severity=Critical | owner=DBA / Platform Engineering | evidence=recapture pre/post migration snapshots in the same evidence run against the same selected rehearsal database",
  );
}

const deltaConsistencyResult = evaluateDeltaConsistency(
  artifactResults.get("Pre-migration rehearsal snapshot"),
  artifactResults.get("Post-migration rehearsal snapshot"),
  artifactResults.get("Data snapshot delta"),
);
if (deltaConsistencyResult.status === "SKIP") {
  lines.push(`SKIP | Data snapshot delta consistency | ${deltaConsistencyResult.detail}`);
} else if (deltaConsistencyResult.pass) {
  lines.push(`PASS | Data snapshot delta consistency | ${deltaConsistencyResult.detail}`);
} else {
  blockers += 1;
  lines.push(`BLOCKED | Data snapshot delta consistency | ${deltaConsistencyResult.detail}`);
  lines.push(
    "  OWNER | severity=Critical | owner=DBA / Platform Engineering | evidence=regenerate the data snapshot delta from the selected pre/post migration snapshots",
  );
}

lines.push("");
if (blockers > 0) {
  lines.push(
    `RESULT | BLOCKED | ${blockers} data snapshot evidence blocker(s) remain before migration safety can be accepted.`,
  );
  lines.push(
    "Next action: run preflight, capture explicit pre/post rehearsal snapshots, compare them, and review unexpected deltas.",
  );
} else {
  lines.push(
    "RESULT | PASS | Data snapshot rehearsal evidence is present for migration safety review.",
  );
}

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Data snapshot readiness status written: ${outputFile}`);

function evaluateArtifact(check) {
  if (!existsSync(snapshotDir)) {
    return { pass: false, detail: `missing directory: ${snapshotDir}` };
  }

  const matchingFiles = readdirSync(snapshotDir)
    .filter((file) => check.pattern.test(file))
    .sort();

  if (matchingFiles.length === 0) {
    return { pass: false, detail: `no matching artifact in ${snapshotDir}` };
  }

  const passingFile = matchingFiles.toReversed().find((file) => {
    const content = readFileSync(join(snapshotDir, file), "utf8");
    const allPass =
      !check.requiredAll?.length ||
      check.requiredAll.every((required) => content.includes(required));
    const anyPass =
      !check.requiredAny?.length ||
      check.requiredAny.some((required) => content.includes(required));

    return allPass && anyPass;
  });

  if (passingFile) {
    return {
      pass: true,
      detail: passingFile,
      filePath: join(snapshotDir, passingFile),
      metadata: extractArtifactMetadata(join(snapshotDir, passingFile)),
    };
  }

  const latestFile = matchingFiles.at(-1);
  return {
    pass: false,
    detail: `latest matching artifact ${latestFile} is missing: ${missingMarkers(
      latestFile,
      check,
    ).join(", ")}`,
    filePath: join(snapshotDir, latestFile),
    metadata: extractArtifactMetadata(join(snapshotDir, latestFile)),
  };
}

function evaluateSnapshotConsistency(preSnapshot, postSnapshot) {
  if (!preSnapshot?.pass || !postSnapshot?.pass) {
    return {
      status: "SKIP",
      detail: "requires passing pre-migration and post-migration snapshot artifacts",
    };
  }

  const preFingerprint = preSnapshot.metadata.databaseFingerprint;
  const postFingerprint = postSnapshot.metadata.databaseFingerprint;
  const preRunId = preSnapshot.metadata.evidenceRunId;
  const postRunId = postSnapshot.metadata.evidenceRunId;
  if (!preRunId || !postRunId) {
    return {
      pass: false,
      detail: "evidence run IDs are not recorded in one or more snapshot artifacts",
    };
  }

  if (preRunId !== postRunId) {
    return {
      pass: false,
      detail: `pre_evidence_run_id=${preRunId} | post_evidence_run_id=${postRunId}`,
    };
  }

  if (!preFingerprint || !postFingerprint) {
    return {
      pass: false,
      detail: "database fingerprints are not recorded in one or more snapshot artifacts",
    };
  }

  if (preFingerprint === postFingerprint) {
    return {
      pass: true,
      detail: `evidence_run_id=${preRunId} | database_fingerprint=${preFingerprint}`,
    };
  }

  return {
    pass: false,
    detail: `pre_database_fingerprint=${preFingerprint} | post_database_fingerprint=${postFingerprint}`,
  };
}

function evaluateDeltaConsistency(preSnapshot, postSnapshot, deltaSnapshot) {
  if (!preSnapshot?.pass || !postSnapshot?.pass || !deltaSnapshot?.pass) {
    return {
      status: "SKIP",
      detail: "requires passing pre-migration, post-migration, and delta artifacts",
    };
  }

  const delta = deltaSnapshot.metadata;
  const missing = [];
  if (!delta.beforeEvidenceRunId) {
    missing.push("Before evidence run ID");
  }
  if (!delta.afterEvidenceRunId) {
    missing.push("After evidence run ID");
  }
  if (!delta.beforeDatabaseFingerprint) {
    missing.push("Before database fingerprint");
  }
  if (!delta.afterDatabaseFingerprint) {
    missing.push("After database fingerprint");
  }
  if (!delta.beforeFile) {
    missing.push("Before");
  }
  if (!delta.afterFile) {
    missing.push("After");
  }
  if (missing.length > 0) {
    return {
      pass: false,
      detail: `delta artifact is missing metadata: ${missing.join(", ")}`,
    };
  }

  if (
    delta.beforeEvidenceRunId !== preSnapshot.metadata.evidenceRunId ||
    delta.afterEvidenceRunId !== postSnapshot.metadata.evidenceRunId
  ) {
    return {
      pass: false,
      detail: `delta_before_run_id=${delta.beforeEvidenceRunId} | pre_run_id=${preSnapshot.metadata.evidenceRunId} | delta_after_run_id=${delta.afterEvidenceRunId} | post_run_id=${postSnapshot.metadata.evidenceRunId}`,
    };
  }

  if (
    delta.beforeDatabaseFingerprint !== preSnapshot.metadata.databaseFingerprint ||
    delta.afterDatabaseFingerprint !== postSnapshot.metadata.databaseFingerprint
  ) {
    return {
      pass: false,
      detail: `delta_before_database_fingerprint=${delta.beforeDatabaseFingerprint} | pre_database_fingerprint=${preSnapshot.metadata.databaseFingerprint} | delta_after_database_fingerprint=${delta.afterDatabaseFingerprint} | post_database_fingerprint=${postSnapshot.metadata.databaseFingerprint}`,
    };
  }

  if (
    basename(delta.beforeFile) !== basename(preSnapshot.filePath) ||
    basename(delta.afterFile) !== basename(postSnapshot.filePath)
  ) {
    return {
      pass: false,
      detail: `delta_before=${delta.beforeFile} | selected_pre=${basename(preSnapshot.filePath)} | delta_after=${delta.afterFile} | selected_post=${basename(postSnapshot.filePath)}`,
    };
  }

  return {
    pass: true,
    detail: `evidence_run_id=${preSnapshot.metadata.evidenceRunId} | database_fingerprint=${preSnapshot.metadata.databaseFingerprint} | delta=${basename(deltaSnapshot.filePath)}`,
  };
}

function extractArtifactMetadata(filePath) {
  const content = readFileSync(filePath, "utf8");
  return {
    evidenceRunId:
      /^Evidence run ID: (.+)$/m.exec(content)?.[1]?.trim() ??
      /^evidence_run_id=(.+)$/m.exec(content)?.[1]?.trim() ??
      null,
    databaseFingerprint:
      /^Database URL fingerprint: (.+)$/m.exec(content)?.[1]?.trim() ?? null,
    beforeEvidenceRunId:
      /^Before evidence run ID: (.+)$/m.exec(content)?.[1]?.trim() ?? null,
    afterEvidenceRunId:
      /^After evidence run ID: (.+)$/m.exec(content)?.[1]?.trim() ?? null,
    beforeDatabaseFingerprint:
      /^Before database fingerprint: (.+)$/m.exec(content)?.[1]?.trim() ?? null,
    afterDatabaseFingerprint:
      /^After database fingerprint: (.+)$/m.exec(content)?.[1]?.trim() ?? null,
    beforeFile: /^Before: (.+)$/m.exec(content)?.[1]?.trim() ?? null,
    afterFile: /^After: (.+)$/m.exec(content)?.[1]?.trim() ?? null,
    generatedAt:
      /^Generated UTC: (.+)$/m.exec(content)?.[1]?.trim() ??
      /^generated_at_utc=(.+)$/m.exec(content)?.[1]?.trim() ??
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
  if (metadata?.beforeEvidenceRunId) {
    lines.push(`metadata_before_evidence_run_id=${metadata.beforeEvidenceRunId}`);
  }
  if (metadata?.afterEvidenceRunId) {
    lines.push(`metadata_after_evidence_run_id=${metadata.afterEvidenceRunId}`);
  }
  if (metadata?.beforeDatabaseFingerprint) {
    lines.push(`metadata_before_database_fingerprint=${metadata.beforeDatabaseFingerprint}`);
  }
  if (metadata?.afterDatabaseFingerprint) {
    lines.push(`metadata_after_database_fingerprint=${metadata.afterDatabaseFingerprint}`);
  }
  if (metadata?.generatedAt) {
    lines.push(`metadata_generated_utc=${metadata.generatedAt}`);
  }

  return lines;
}

function missingMarkers(file, check) {
  const content = readFileSync(join(snapshotDir, file), "utf8");
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
