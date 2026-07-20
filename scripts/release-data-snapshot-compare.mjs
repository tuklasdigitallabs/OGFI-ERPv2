import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const beforeFile = process.env.RELEASE_DATA_SNAPSHOT_BEFORE;
const afterFile = process.env.RELEASE_DATA_SNAPSHOT_AFTER;

if (!beforeFile || !afterFile) {
  console.error(
    "RELEASE_DATA_SNAPSHOT_BEFORE and RELEASE_DATA_SNAPSHOT_AFTER are required.",
  );
  process.exit(2);
}

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const outputDir =
  process.env.RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_DIR ??
  "release-evidence/data-snapshots";
const outputFile =
  process.env.RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_FILE ??
  join(outputDir, `data-snapshot-delta-${timestamp}.txt`);
const allowDestructiveDeltas =
  process.env.RELEASE_DATA_SNAPSHOT_ALLOW_DESTRUCTIVE_DELTAS === "yes";
const requireUnchanged =
  process.env.RELEASE_DATA_SNAPSHOT_REQUIRE_UNCHANGED === "yes";

const beforeSnapshot = parseSnapshot(beforeFile);
const afterSnapshot = parseSnapshot(afterFile);
const before = beforeSnapshot.counts;
const after = afterSnapshot.counts;
const tables = [...new Set([...before.keys(), ...after.keys()])].sort();

mkdirSync(dirname(outputFile), { recursive: true });

const contractFailures = [];
if (allowDestructiveDeltas) {
  contractFailures.push("destructive-delta environment overrides are not permitted");
}
if (resolve(beforeFile) === resolve(afterFile)) {
  contractFailures.push("before and after snapshots must be different files");
}
if (beforeSnapshot.label === afterSnapshot.label) {
  contractFailures.push("before and after snapshots must use different labels");
}
if (beforeSnapshot.label === "snapshot" || afterSnapshot.label === "snapshot") {
  contractFailures.push("snapshot labels must be explicit, not the default snapshot label");
}
if (
  beforeSnapshot.evidenceRunId === "not-recorded" ||
  afterSnapshot.evidenceRunId === "not-recorded"
) {
  contractFailures.push("before and after snapshots must record evidence run IDs");
}
if (
  beforeSnapshot.evidenceRunId !== "not-recorded" &&
  afterSnapshot.evidenceRunId !== "not-recorded" &&
  beforeSnapshot.evidenceRunId !== afterSnapshot.evidenceRunId
) {
  contractFailures.push("before and after snapshots must use the same evidence run ID");
}
if (
  beforeSnapshot.databaseFingerprint === "not-recorded" ||
  afterSnapshot.databaseFingerprint === "not-recorded"
) {
  contractFailures.push("before and after snapshots must record database fingerprints");
}
if (
  beforeSnapshot.databaseFingerprint !== "not-recorded" &&
  afterSnapshot.databaseFingerprint !== "not-recorded" &&
  beforeSnapshot.databaseFingerprint !== afterSnapshot.databaseFingerprint
) {
  contractFailures.push("before and after snapshots must use the same database fingerprint");
}
for (const field of ["candidateSha", "predecessorSha"]) {
  const beforeValue = beforeSnapshot[field];
  const afterValue = afterSnapshot[field];
  if (beforeValue !== "not-recorded" || afterValue !== "not-recorded") {
    if (!/^[a-f0-9]{40}$/i.test(beforeValue) || !/^[a-f0-9]{40}$/i.test(afterValue)) {
      contractFailures.push(`${field} must be a full 40-character SHA in both snapshots`);
    } else if (beforeValue !== afterValue) {
      contractFailures.push(`before and after snapshots must use the same ${field}`);
    }
  }
}

if (contractFailures.length > 0) {
  console.error(`Snapshot comparison input is invalid: ${contractFailures.join(", ")}`);
  process.exit(2);
}

const lines = [
  "OGFI ERP Phase I / Phase 1.5 data snapshot delta",
  `Generated UTC: ${timestamp}`,
  `Before evidence run ID: ${beforeSnapshot.evidenceRunId}`,
  `After evidence run ID: ${afterSnapshot.evidenceRunId}`,
  `Candidate SHA: ${beforeSnapshot.candidateSha}`,
  `Predecessor SHA: ${beforeSnapshot.predecessorSha}`,
  `Before database fingerprint: ${beforeSnapshot.databaseFingerprint}`,
  `After database fingerprint: ${afterSnapshot.databaseFingerprint}`,
  `Before: ${beforeFile}`,
  `Before label: ${beforeSnapshot.label}`,
  `After: ${afterFile}`,
  `After label: ${afterSnapshot.label}`,
  `Allow destructive deltas: ${allowDestructiveDeltas ? "yes" : "no"}`,
  `Require unchanged snapshots: ${requireUnchanged ? "yes" : "no"}`,
  "",
  "Table | Before | After | Delta",
];

let changedTables = 0;
let blockingDeltas = 0;

for (const table of tables) {
  const beforeValue = before.get(table);
  const afterValue = after.get(table);
  const delta = computeDelta(beforeValue, afterValue);

  if (delta !== 0 && delta !== "0") {
    changedTables += 1;
  }

  if (
    delta === "MISSING_AFTER" ||
    delta === "UNMATCHED" ||
    (typeof delta === "number" && (delta < 0 || (requireUnchanged && delta !== 0)))
  ) {
    blockingDeltas += 1;
  }

  lines.push(
    `${table} | ${formatValue(beforeValue)} | ${formatValue(afterValue)} | ${delta}`,
  );
}

const digestTables = [
  ...new Set([...beforeSnapshot.digests.keys(), ...afterSnapshot.digests.keys()]),
].sort();
if (
  (beforeSnapshot.digests.size > 0 || afterSnapshot.digests.size > 0) &&
  beforeSnapshot.digests.size !== afterSnapshot.digests.size
) {
  blockingDeltas += 1;
}
lines.push("", "Table content digest | Before | After | Result");
for (const table of digestTables) {
  const beforeDigest = beforeSnapshot.digests.get(table);
  const afterDigest = afterSnapshot.digests.get(table);
  const matches = Boolean(beforeDigest) && beforeDigest === afterDigest;
  if (!matches) blockingDeltas += 1;
  lines.push(
    `${table} | ${beforeDigest ?? "MISSING"} | ${afterDigest ?? "MISSING"} | ${matches ? "MATCH" : "MISMATCH"}`,
  );
}

lines.push("");
if (blockingDeltas > 0) {
  lines.push(
    `RESULT | FAIL | Snapshot delta found ${blockingDeltas} destructive, unmatched, or disallowed changed table delta(s).`,
  );
} else {
  lines.push(
    `RESULT | PASS | Snapshot delta captured. Changed table count: ${changedTables}. Review unexpected data movement before release approval.`,
  );
}

writeFileSync(outputFile, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));

if (blockingDeltas > 0) {
  process.exit(1);
}

function parseSnapshot(filePath) {
  const map = new Map();
  const digests = new Map();
  const content = readFileSync(filePath, "utf8");
  const label = /^Label: (.+)$/m.exec(content)?.[1]?.trim();
  const evidenceRunId =
    /^Evidence run ID: (.+)$/m.exec(content)?.[1]?.trim() ?? "not-recorded";
  const databaseFingerprint =
    /^Database URL fingerprint: (.+)$/m.exec(content)?.[1]?.trim() ??
    "not-recorded";
  const candidateSha =
    /^Candidate SHA: (.+)$/m.exec(content)?.[1]?.trim() ?? "not-recorded";
  const predecessorSha =
    /^Predecessor SHA: (.+)$/m.exec(content)?.[1]?.trim() ?? "not-recorded";
  const failedChecks = [
    [
      "snapshot header present",
      content.includes("OGFI ERP Phase I / Phase 1.5 release data snapshot"),
    ],
    ["snapshot label present", Boolean(label)],
    ["snapshot pass marker present", content.includes("RESULT | PASS | Data snapshot captured.")],
  ]
    .filter(([, passed]) => !passed)
    .map(([label]) => label);

  if (failedChecks.length > 0) {
    console.error(
      `Snapshot file is not valid release snapshot evidence: ${filePath}; ${failedChecks.join(", ")}`,
    );
    process.exit(2);
  }

  for (const line of content.split(/\r?\n/)) {
    const digestMatch = /^DIGEST ([A-Za-z][A-Za-z0-9]*) \| ([a-f0-9]{32})$/.exec(line);
    if (digestMatch) {
      digests.set(digestMatch[1], digestMatch[2]);
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9]*) \| ([0-9]+|MISSING)$/.exec(line);
    if (!match) {
      continue;
    }

    map.set(match[1], match[2] === "MISSING" ? null : Number(match[2]));
  }

  if (map.size === 0) {
    console.error(`No table counts found in snapshot: ${filePath}`);
    process.exit(2);
  }

  return {
    counts: map,
    digests,
    label,
    evidenceRunId,
    databaseFingerprint,
    candidateSha,
    predecessorSha,
  };
}

function computeDelta(beforeValue, afterValue) {
  if (typeof beforeValue === "number" && typeof afterValue === "number") {
    return afterValue - beforeValue;
  }

  if (beforeValue === undefined || afterValue === undefined) {
    return "UNMATCHED";
  }

  if (beforeValue === null && afterValue === null) {
    return "0";
  }

  if (beforeValue === null) {
    return "CREATED";
  }

  return "MISSING_AFTER";
}

function formatValue(value) {
  if (value === undefined) {
    return "UNMATCHED";
  }

  if (value === null) {
    return "MISSING";
  }

  return String(value);
}
