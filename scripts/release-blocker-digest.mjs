import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputFile =
  process.env.RELEASE_BLOCKER_DIGEST_OUTPUT_FILE ??
  join(evidenceRoot, "blocker-digest", `blocker-digest-${timestamp}.txt`);

const sources = [
  source("Milestone status", "milestones", /^milestone-status-.*\.txt$/, "Release Manager"),
  source(
    "Pending evidence checklist",
    "pending-evidence-checklist",
    /^pending-evidence-checklist-.*\.txt$/,
    "Release Manager",
    false,
  ),
  source(
    "Release metadata session lock",
    "release-metadata",
    /^release-session-lock-.*\.txt$/,
    "Release Manager",
    true,
  ),
  source(
    "Data snapshot status",
    "data-snapshot-status",
    /^data-snapshot-status-.*\.txt$/,
    "DBA / Platform Engineering",
  ),
  source(
    "Data snapshot evidence checklist",
    "data-snapshot-checklist",
    /^data-snapshot-checklist-.*\.txt$/,
    "DBA / Platform Engineering",
  ),
  source(
    "Backup, restore, and rollback status",
    "backup-restore-status",
    /^backup-restore-status-.*\.txt$/,
    "DevOps Owner / Release Manager",
  ),
  source(
    "Deployment evidence checklist",
    "deployment-checklist",
    /^deployment-evidence-checklist-.*\.txt$/,
    "Release Manager / DevOps Owner",
  ),
  source("Deployment status", "deployment-status", /^deployment-status-.*\.txt$/, "DevOps Owner"),
  source(
    "UAT execution checklist",
    "uat-checklist",
    /^uat-execution-checklist-.*\.txt$/,
    "QA Lead / Operations Lead",
  ),
  source("UAT status", "uat-status", /^uat-status-.*\.txt$/, "QA Lead / Operations Lead"),
  source("Pilot and UAT status", "pilot-uat-status", /^pilot-uat-status-.*\.txt$/, "QA Lead / Operations Lead"),
  source(
    "Enablement evidence checklist",
    "enablement-checklist",
    /^enablement-checklist-.*\.txt$/,
    "Enablement Owner / Operations Owner",
  ),
  source("Enablement status", "enablement-status", /^enablement-status-.*\.txt$/, "Enablement Owner"),
  source(
    "Signed evidence checklist",
    "signed-evidence-checklist",
    /^signed-evidence-checklist-.*\.txt$/,
    "Release Manager / Product Owner",
  ),
  source(
    "Signed evidence status",
    "signed-evidence-status",
    /^signed-evidence-status-.*\.txt$/,
    "Release Manager / Product Owner",
  ),
  source(
    "Final-review status",
    "final-review-status",
    /^final-review-status-.*\.txt$/,
    "Release Manager / Product Owner",
    true,
    true,
  ),
  source(
    "GO / NO-GO report",
    "go-no-go",
    /^go-no-go-.*\.txt$/,
    "Release Manager / Product Owner",
    true,
    true,
  ),
];

const entries = [];
const summaries = [];
const summaryOwnerCounts = [];
const sourceLines = [];
const metadataWarnings = [];

for (const statusSource of sources) {
  const latest = latestMatchingFile(join(evidenceRoot, statusSource.directory), statusSource.pattern);
  if (!latest) {
    entries.push({
      owner: statusSource.defaultOwner,
      severity: "High",
      source: statusSource.label,
      text: `MISSING | latest ${statusSource.directory}/${statusSource.pattern.source} artifact`,
    });
    sourceLines.push(`SOURCE | ${statusSource.label} | missing`);
    continue;
  }

  const relativePath = `${statusSource.directory}/${latest}`;
  const content = readFileSync(join(evidenceRoot, statusSource.directory, latest), "utf8");
  const metadata = sourceMetadata(content);
  sourceLines.push(
    `SOURCE | ${statusSource.label} | ${relativePath} | ${formatSourceMetadata(metadata).join(" | ")}`,
  );
  metadataWarnings.push(...sourceMetadataWarnings(statusSource, metadata));
  let pendingBlockedEntry = null;

  for (const line of content.split(/\r?\n/)) {
    const normalizedLine = line.trim();
    if (!normalizedLine) {
      continue;
    }

    if (
      (normalizedLine.startsWith("BLOCKED |") ||
        normalizedLine.startsWith("FAIL |")) &&
      (normalizedLine.includes("blocker_count=") ||
        normalizedLine.includes("blocking_gate_count="))
    ) {
      if (statusSource.includeSummaryCounts) {
        summaryOwnerCounts.push(summaryOwnerCountFromLine(statusSource, normalizedLine));
      }
      continue;
    }

    if (normalizedLine.startsWith("BLOCKER |")) {
      if (statusSource.includeHandoff) {
        entries.push(entryFromLine(statusSource, normalizedLine));
      }
      pendingBlockedEntry = null;
      continue;
    }

    if (
      normalizedLine.startsWith("BLOCKED |") ||
      normalizedLine.startsWith("FAIL |")
    ) {
      pendingBlockedEntry = statusSource.includeHandoff
        ? entryFromLine(statusSource, normalizedLine)
        : null;
      continue;
    }

    if (normalizedLine.startsWith("OWNER |")) {
      if (statusSource.label === "Milestone status") {
        continue;
      }

      const ownerEntry = entryFromLine(statusSource, normalizedLine);
      if (pendingBlockedEntry) {
        entries.push({
          ...pendingBlockedEntry,
          owner: ownerEntry.owner,
          severity: ownerEntry.severity,
          text: `${pendingBlockedEntry.text} | ${ownerEntry.text}`,
        });
        pendingBlockedEntry = null;
      } else if (statusSource.includeHandoff && normalizedLine.includes("evidence=")) {
        entries.push(ownerEntry);
      }
      continue;
    }

    if (
      normalizedLine.startsWith("RESULT | BLOCKED") ||
      normalizedLine.startsWith("RESULT | FAIL") ||
      normalizedLine.startsWith("RESULT | WARN") ||
      normalizedLine.startsWith("RESULT | NO-GO") ||
      normalizedLine.startsWith("RESULT | ACTION REQUIRED")
    ) {
      summaries.push({
        severity: inferSeverity(normalizedLine),
        source: statusSource.label,
        text: normalizedLine,
      });
      if (
        statusSource.includeHandoff &&
        (normalizedLine.startsWith("RESULT | BLOCKED") ||
          normalizedLine.startsWith("RESULT | FAIL") ||
          normalizedLine.startsWith("RESULT | ACTION REQUIRED") ||
          normalizedLine.startsWith("RESULT | NO-GO"))
      ) {
        entries.push({
          owner: statusSource.defaultOwner,
          severity: inferSeverity(normalizedLine),
          source: statusSource.label,
          text: normalizedLine,
        });
      }
    }

  }

  if (pendingBlockedEntry) {
    entries.push(pendingBlockedEntry);
  }
}

const uniqueEntries = dedupeEntries(entries);
const groupedEntries = groupByOwner(uniqueEntries);
const priorityEntries = prioritizedEntries(uniqueEntries).slice(0, 12);
const lines = [
  "OGFI ERP Phase I / Phase 1.5 release blocker digest",
  `Generated UTC: ${timestamp}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This digest is advisory. It groups latest release status blockers by owner, but it does not create source evidence, clear placeholders, execute UAT, approve release, or replace GO / NO-GO review.",
  "",
  "Sources",
  ...sourceLines,
  "",
  "Evidence Session Metadata Warnings",
  ...(metadataWarnings.length > 0
    ? metadataWarnings
    : ["WARNING | none"]),
  "",
  "Status Summaries",
  ...summaries.map(
    (summary) =>
      `SUMMARY | severity=${summary.severity} | source=${summary.source} | ${summary.text}`,
  ),
  "",
  "Summary Owner Counts",
  ...summaryOwnerCounts.map(
    (summary) =>
      `COUNT | source=${summary.source} | owner=${summary.owner} | count=${summary.count}`,
  ),
  ...(summaryOwnerCounts.length === 0 ? ["COUNT | none"] : []),
  "",
  "Priority Next Actions",
  ...(priorityEntries.length > 0
    ? priorityEntries.map(
        (entry, index) =>
          `${index + 1}. severity=${entry.severity} | owner=${entry.owner} | source=${entry.source} | ${summarizeAction(entry.text)}`,
      )
    : ["No priority blocker actions found."]),
  "",
  "Owner Handoff",
];

for (const [owner, ownerEntries] of groupedEntries) {
  lines.push(`OWNER | ${owner}`);
  for (const entry of ownerEntries) {
    lines.push(`- severity=${entry.severity} | source=${entry.source} | ${entry.text}`);
  }
  lines.push("");
}

if (uniqueEntries.length === 0) {
  lines.push("No advisory blockers found in the latest status artifacts.", "");
}

lines.push(
  uniqueEntries.length > 0
    ? `RESULT | BLOCKED | ${uniqueEntries.length} advisory owner blocker(s) require review.`
    : "RESULT | PASS | No advisory blocker lines found in latest status artifacts.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Release blocker digest written: ${outputFile}`);

function source(
  label,
  directory,
  pattern,
  defaultOwner,
  includeHandoff = true,
  includeSummaryCounts = false,
) {
  return {
    label,
    directory,
    pattern,
    defaultOwner,
    includeHandoff,
    includeSummaryCounts,
  };
}

function sourceMetadata(content) {
  const generatedAt =
    /^Generated UTC: (.+)$/m.exec(content)?.[1]?.trim() ??
    /^generated_at_utc=(.+)$/m.exec(content)?.[1]?.trim();
  const evidenceRunId =
    /^Evidence run ID: (.+)$/m.exec(content)?.[1]?.trim() ??
    /^evidence_run_id=(.+)$/m.exec(content)?.[1]?.trim();

  return {
    generatedAt,
    evidenceRunId,
  };
}

function formatSourceMetadata(metadata) {
  return [
    `generated=${metadata.generatedAt ?? "not-recorded"}`,
    `evidence_run_id=${metadata.evidenceRunId ?? "not-recorded"}`,
  ];
}

function sourceMetadataWarnings(statusSource, metadata) {
  const warnings = [];
  if (!metadata.generatedAt) {
    warnings.push(
      `WARNING | source=${statusSource.label} | owner=${statusSource.defaultOwner} | missing generated timestamp | next=rerun the source status command so the artifact records Generated UTC`,
    );
  }

  if (!metadata.evidenceRunId) {
    warnings.push(
      `WARNING | source=${statusSource.label} | owner=${statusSource.defaultOwner} | missing evidence_run_id | next=set RELEASE_EVIDENCE_RUN_ID, run pnpm release:metadata-session-lock, then rerun the source status command`,
    );
  } else if (metadata.evidenceRunId.includes("<set-approved-evidence-run-id>")) {
    warnings.push(
      `WARNING | source=${statusSource.label} | owner=${statusSource.defaultOwner} | placeholder evidence_run_id=${metadata.evidenceRunId} | next=set RELEASE_EVIDENCE_RUN_ID, run pnpm release:metadata-session-lock, then rerun the source status command`,
    );
  }

  return warnings;
}

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

function entryFromLine(statusSource, line) {
  return {
    owner: extractField(line, "owner") ?? statusSource.defaultOwner,
    severity: extractField(line, "severity") ?? inferSeverity(line),
    source: statusSource.label,
    text: line,
  };
}

function summaryOwnerCountFromLine(statusSource, line) {
  const [status, owner = statusSource.defaultOwner] = line
    .split("|")
    .map((part) => part.trim());
  return {
    source: statusSource.label,
    status,
    owner,
    count:
      extractField(line, "blocker_count") ??
      extractField(line, "blocking_gate_count") ??
      "unknown",
  };
}

function extractField(line, field) {
  const match = line.match(new RegExp(`(?:^|\\|)\\s*${field}=([^|]+)`));
  return match?.[1]?.trim() ?? null;
}

function inferSeverity(line) {
  if (
    line.includes("Critical") ||
    line.includes("NO-GO") ||
    line.includes("BLOCKED") ||
    line.includes("FAIL")
  ) {
    return "Critical";
  }

  if (line.includes("WARN") || line.includes("PENDING")) {
    return "High";
  }

  return "Medium";
}

function groupByOwner(blockers) {
  const groups = new Map();
  for (const blocker of blockers) {
    if (!groups.has(blocker.owner)) {
      groups.set(blocker.owner, []);
    }
    groups.get(blocker.owner).push(blocker);
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function dedupeEntries(blockers) {
  const seen = new Set();
  const unique = [];
  for (const blocker of blockers) {
    const key = `${blocker.owner}\0${blocker.severity}\0${blocker.source}\0${blocker.text}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(blocker);
  }

  return unique;
}

function prioritizedEntries(blockers) {
  return [...blockers].sort((left, right) => {
    const severityDelta = severityRank(left.severity) - severityRank(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const sourceDelta = sourceRank(left.source) - sourceRank(right.source);
    if (sourceDelta !== 0) {
      return sourceDelta;
    }

    return `${left.owner}${left.text}`.localeCompare(`${right.owner}${right.text}`);
  });
}

function severityRank(severity) {
  if (severity === "Critical") {
    return 0;
  }
  if (severity === "High") {
    return 1;
  }
  return 2;
}

function sourceRank(sourceName) {
  const order = [
    "GO / NO-GO report",
    "Final-review status",
    "Milestone status",
    "Pending evidence checklist",
    "Release metadata session lock",
    "Backup, restore, and rollback status",
    "Data snapshot status",
    "Pilot and UAT status",
    "Signed evidence status",
    "Deployment status",
    "UAT status",
    "Enablement status",
  ];
  const index = order.indexOf(sourceName);
  return index === -1 ? order.length : index;
}

function summarizeAction(text) {
  return text
    .replace(/\s*\|\s*OWNER\s*\|.*$/, "")
    .replace(/^BLOCKED\s*\|\s*/, "")
    .replace(/^FAIL\s*\|\s*/, "")
    .replace(/^BLOCKER\s*\|\s*/, "")
    .replace(/^OWNER\s*\|\s*/, "")
    .trim();
}
