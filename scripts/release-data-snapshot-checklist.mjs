import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, "<set-approved-evidence-run-id>");
const outputFile =
  process.env.RELEASE_DATA_SNAPSHOT_CHECKLIST_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "data-snapshot-checklist",
    `data-snapshot-checklist-${timestamp}.txt`,
  );

const checklist = [
  {
    owner: "Release Manager / DBA",
    action: "Lock one evidence session before migration-safety work starts.",
    command: "pnpm release:metadata-session-lock",
    artifact: "release-metadata/release-session-lock-*.txt",
    acceptance: "One RELEASE_EVIDENCE_RUN_ID and RELEASE_EVIDENCE_ROOT are used for preflight, snapshots, delta, status, manifest, and final review.",
  },
  {
    owner: "DBA / Platform Engineering",
    action: "Run snapshot preflight against the selected rehearsal database and remediate WARN results before critical evidence capture.",
    command: "pnpm release:data-snapshot-preflight",
    artifact: "data-snapshots/data-snapshot-preflight-*.txt",
    acceptance: "Critical release review requires RESULT | PASS; WARN is setup evidence only and must not be treated as migration-safety proof.",
  },
  {
    owner: "DBA / Platform Engineering",
    action: "Capture the pre-migration row-count snapshot before applying the reviewed migration or release candidate changes.",
    command: "RELEASE_DATA_SNAPSHOT_LABEL=pre-migration-rehearsal pnpm release:data-snapshot",
    artifact: "data-snapshots/data-pre-migration-rehearsal-*.txt",
    acceptance: "Artifact records RESULT | PASS, label pre-migration-rehearsal, evidence run ID, database fingerprint, and all critical table groups.",
  },
  {
    owner: "DBA / Platform Engineering / Release Manager",
    action: "Attach external migration execution proof between the pre and post snapshots.",
    command: "Collect CI/CD job ID, migration command, commit/version, operator, environment, UTC start/end, and log reference.",
    artifact: "external migration log, deployment job, or database migration journal reference",
    acceptance: "Proof shows the migration completed between the selected pre/post snapshots and does not expose secrets or raw credentials.",
  },
  {
    owner: "DBA / Platform Engineering",
    action: "Capture the post-migration row-count snapshot from the same selected rehearsal database.",
    command: "RELEASE_DATA_SNAPSHOT_LABEL=post-migration-rehearsal pnpm release:data-snapshot",
    artifact: "data-snapshots/data-post-migration-rehearsal-*.txt",
    acceptance: "Artifact records RESULT | PASS, label post-migration-rehearsal, the same evidence run ID, and the same database fingerprint as the pre snapshot.",
  },
  {
    owner: "DBA / Platform Engineering",
    action: "Generate and review the pre/post snapshot delta.",
    command: "pnpm release:data-snapshot:compare-latest",
    artifact: "data-snapshots/data-snapshot-delta-*.txt",
    acceptance: "Delta records matching before/after run IDs and database fingerprints; every changed table is reviewed against migration notes.",
  },
  {
    owner: "DBA / Product Owner / Release Manager",
    action: "Approve or block destructive or unmatched deltas.",
    command: "Use RELEASE_DATA_SNAPSHOT_ALLOW_DESTRUCTIVE_DELTAS=yes only with a documented waiver.",
    artifact: "waiver or mitigation ticket referenced in release evidence",
    acceptance: "No UNMATCHED or MISSING_AFTER delta proceeds without approved mitigation, owner, date, and release decision.",
  },
  {
    owner: "DBA / Platform Engineering",
    action: "Refresh the focused data snapshot readiness status after all snapshot evidence changes.",
    command: "pnpm release:data-snapshot-status",
    artifact: "data-snapshot-status/data-snapshot-status-*.txt",
    acceptance: "Must contain RESULT | PASS | Data snapshot rehearsal evidence is present for migration safety review.",
  },
  {
    owner: "Release Manager / DBA",
    action: "Refresh the final evidence manifest after source evidence, signed documents, and external-security proof references are complete.",
    command: "pnpm release:evidence:manifest",
    artifact: "manifests/release-evidence-manifest-*.txt",
    acceptance: "Manifest includes checksums for preflight, pre/post snapshots, delta, status, and final signed evidence; no source files are regenerated after manifest without rerunning it.",
  },
];

const latestStatus = latestMatchingFile(
  join(evidenceRoot, "data-snapshot-status"),
  /^data-snapshot-status-.*\.txt$/,
);
const latestPreflight = latestMatchingFile(
  join(evidenceRoot, "data-snapshots"),
  /^data-snapshot-preflight-.*\.txt$/,
);

const lines = [
  "OGFI ERP Phase I / Phase 1.5 data snapshot evidence checklist",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This checklist is advisory. It does not query a database, apply migrations, compare snapshots, approve destructive deltas, generate a final manifest, or approve release.",
  "Use the same RELEASE_EVIDENCE_RUN_ID across preflight, pre/post snapshots, delta, status reports, final manifest, final review, and GO / NO-GO.",
  "",
  "Required Migration Snapshot Evidence Fields",
  "FIELD | session lock | release version, environment, migration mode, evidence_run_id, and evidence root",
  "FIELD | preflight | RESULT | PASS, database fingerprint, snapshot label validity, missing-table override, and destructive-delta override",
  "FIELD | pre snapshot | label pre-migration-rehearsal, run ID, database fingerprint, timestamp, and table counts",
  "FIELD | migration execution proof | CI/CD job or DB migration journal ID, operator, commit/version, environment, UTC start/end, and log reference",
  "FIELD | post snapshot | label post-migration-rehearsal, same run ID, same database fingerprint, timestamp, and table counts",
  "FIELD | delta review | before/after artifact paths, table deltas, changed-table rationale, destructive-delta waiver where applicable",
  "FIELD | integrity | final manifest checksum lines and owner confirmation that source evidence was not edited after manifest generation",
  "",
  "Migration Snapshot Evidence Steps",
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
  "Latest Data Snapshot Preflight",
  ...latestStatusLines("data-snapshots", latestPreflight),
  "",
  "Latest Data Snapshot Status",
  ...latestStatusLines("data-snapshot-status", latestStatus),
  "",
  "RESULT | ACTION REQUIRED | Collect real migration rehearsal snapshots, delta review, external migration proof, and manifest integrity evidence before final release review.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Data snapshot evidence checklist written: ${outputFile}`);

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

function latestStatusLines(directory, latestFile) {
  if (!latestFile) {
    return [`STATUS | missing latest ${directory} artifact`];
  }

  const relativePath = `${directory}/${latestFile}`;
  const content = readFileSync(join(evidenceRoot, relativePath), "utf8");
  const statusLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("RESULT |") ||
        line.startsWith("BLOCKED |") ||
        line.startsWith("PASS |") ||
        line.startsWith("WARN |") ||
        line.startsWith("SKIP |") ||
        line.startsWith("OWNER |"),
    )
    .slice(0, 14);

  return [
    `STATUS | ${relativePath}`,
    ...(statusLines.length > 0
      ? statusLines.map((line) => `SNAPSHOT | ${line}`)
      : ["STATUS | no result lines found"]),
  ];
}
