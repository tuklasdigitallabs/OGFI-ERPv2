import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const runId = evidenceRunId(process.env, timestamp);
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const deploymentFile =
  process.env.RELEASE_DEPLOYMENT_EVIDENCE_FILE ??
  "docs/core/07-quality/PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md";
const outputFile =
  process.env.RELEASE_DEPLOYMENT_STATUS_OUTPUT_FILE ??
  join(evidenceRoot, "deployment-status", `deployment-status-${timestamp}.txt`);

const content = readFileSync(deploymentFile, "utf8");
const requiredEvidenceRows = extractTableRows(
  content,
  "## Required Evidence",
  "## Focused Release Evidence Sheets",
  2,
  "evidence",
);
const focusedEvidenceRows = [
  ...extractTableRows(
    content,
    "### Migration And Schema Rehearsal",
    "### Backup, Restore, And Rollback Drill",
    2,
    "evidence",
  ),
  ...extractTableRows(
    content,
    "### Backup, Restore, And Rollback Drill",
    "### Release Smoke Evidence",
    2,
    "evidence",
  ),
  ...extractTableRows(
    content,
    "### Release Smoke Evidence",
    "## Rollback Decision Rules",
    2,
    "evidence",
  ),
];
const supportRows = extractTableRows(
  content,
  "## Hypercare And Support Readiness",
  "## Signoff",
  2,
  "support",
);
const signoffRows = extractTableRows(content, "## Signoff", "", 0, "signoff");
const unresolved = countUnresolved(content);
const unresolvedSections = summarizeUnresolvedTokensBySection(content);

const incompleteRequiredRows = requiredEvidenceRows.filter((row) => row.isIncomplete);
const incompleteFocusedRows = focusedEvidenceRows.filter((row) => row.isIncomplete);
const incompleteSupportRows = supportRows.filter((row) => row.isIncomplete);
const incompleteSignoffRows = signoffRows.filter((row) => row.isIncomplete);
const invalidRows = [
  ...requiredEvidenceRows,
  ...focusedEvidenceRows,
  ...supportRows,
  ...signoffRows,
].flatMap((row) => row.invalidFields);
const incompleteOwnerSummary = summarizeByOwner([
  ...incompleteRequiredRows,
  ...incompleteFocusedRows,
  ...incompleteSupportRows,
  ...incompleteSignoffRows,
]);

const result =
  incompleteRequiredRows.length === 0 &&
  incompleteFocusedRows.length === 0 &&
  incompleteSupportRows.length === 0 &&
  incompleteSignoffRows.length === 0 &&
  invalidRows.length === 0 &&
  unresolved.pending === 0 &&
  unresolved.tbd === 0
    ? "RESULT | PASS | Deployment, rollback, backup/restore, smoke, and signoff evidence has no unresolved placeholders."
    : "RESULT | WARN | Deployment, rollback, backup/restore, smoke, and signoff evidence is incomplete; capture environment artifacts, owner decisions, and evidence references before GO review.";

const lines = [
  "OGFI ERP Phase I / Phase 1.5 deployment and rollback evidence status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Deployment evidence file: ${deploymentFile}`,
  "",
  "This report is advisory. It does not deploy, run rollback, create backups, or approve release.",
  "",
  "Summary",
  `Required evidence rows: ${requiredEvidenceRows.length}`,
  `Required evidence incomplete rows: ${incompleteRequiredRows.length}`,
  `Focused evidence rows: ${focusedEvidenceRows.length}`,
  `Focused evidence incomplete rows: ${incompleteFocusedRows.length}`,
  `Hypercare support rows: ${supportRows.length}`,
  `Hypercare support incomplete rows: ${incompleteSupportRows.length}`,
  `Signoff rows: ${signoffRows.length}`,
  `Signoff incomplete rows: ${incompleteSignoffRows.length}`,
  `Invalid evidence fields: ${invalidRows.length}`,
  `Pending tokens: ${unresolved.pending}`,
  `TBD tokens: ${unresolved.tbd}`,
  "",
  "Incomplete Owner Summary",
  "OWNER | severity=Critical | owner=Release Manager / DevOps Owner | evidence=assign each incomplete deployment, migration, rollback, smoke, hypercare, and signoff row to its named owner",
  ...formatOwnerSummary(incompleteOwnerSummary),
  "",
  "Unresolved Token Sections",
  "OWNER | severity=Critical | owner=Release Manager / DevOps Owner | evidence=clear Pending/TBD placeholders in each listed deployment and rollback evidence section",
  ...formatSectionTokenSummary(unresolvedSections),
  "",
  "Invalid Deployment Evidence Fields",
  "OWNER | severity=Critical | owner=Release Manager / DevOps Owner | evidence=replace weak or malformed deployment values with environment, execution timestamp, actor, accepted result, evidence reference, and explicit signoff decision",
  ...formatInvalidFields(invalidRows),
  "",
  "Incomplete Required Evidence Rows",
  "OWNER | severity=Critical | owner=Release Manager / DevOps Owner | evidence=deployment, rollback, backup/restore, smoke, monitoring, and owner signoff rows",
  ...formatRows(incompleteRequiredRows),
  "",
  "Incomplete Focused Evidence Rows",
  "OWNER | severity=Critical | owner=DBA / DevOps Owner / QA Lead | evidence=migration rehearsal, backup/restore, rollback, and smoke artifacts",
  ...formatRows(incompleteFocusedRows),
  "",
  "Incomplete Hypercare Support Rows",
  "OWNER | severity=High | owner=Release Manager / Operations Owner | evidence=pilot support route, triage cadence, escalation path, and rollback decision owner",
  ...formatRows(incompleteSupportRows),
  "",
  "Incomplete Signoff Rows",
  "OWNER | severity=Critical | owner=Product Owner / Release Manager | evidence=named deployment, rollback, security, QA, and product signoffs",
  ...formatRows(incompleteSignoffRows),
  "",
  result,
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Deployment status evidence written: ${outputFile}`);

function extractTableRows(markdown, startHeading, endHeading, ownerIndex, kind) {
  return extractSection(markdown, startHeading, endHeading)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .map(parseTableRow)
    .filter((cells) => {
      const firstCell = cells[0] ?? "";
      return (
        firstCell &&
        !/^(Area|Evidence item|Role|Date\/time)$/i.test(firstCell)
      );
    })
    .map((cells) => ({
      id: cells[0] ?? "UNKNOWN",
      label: cells[1] ?? cells[2] ?? cells[0] ?? "UNKNOWN",
      owner: cells[ownerIndex] ?? "UNKNOWN",
      isIncomplete: cells.some((cell) => /\b(Pending|TBD)\b/i.test(cell)),
      invalidFields: validateRow(kind, cells[0] ?? "UNKNOWN", cells),
    }));
}

function validateRow(kind, id, cells) {
  if (kind === "signoff") {
    return [
      requireUsefulCell(id, "Name", cells[1]),
      requireExplicitDecision(id, "Decision", cells[2]),
      requireDateLikeCell(id, "Date", cells[3]),
    ].filter(Boolean);
  }

  if (kind === "support") {
    return [
      requireUsefulCell(id, "Owner", cells[2]),
      requireAcceptedResult(id, "Result", cells[3]),
      requireUsefulCell(id, "Evidence reference", cells[4]),
    ].filter(Boolean);
  }

  return [
    requireUsefulCell(id, "Environment", cells[3]),
    requireDateLikeCell(id, "Execution date/time", cells[4]),
    requireUsefulCell(id, "Actual actor", cells[5]),
    requireAcceptedResult(id, "Result", cells[6]),
    requireUsefulCell(id, "Evidence reference", cells[7]),
  ].filter(Boolean);
}

function requireUsefulCell(id, field, value) {
  if (isUsefulValue(value)) {
    return null;
  }

  return { id, field, reason: "missing_or_placeholder" };
}

function requireDateLikeCell(id, field, value) {
  if (!isUsefulValue(value)) {
    return { id, field, reason: "missing_or_placeholder" };
  }

  if (/\b\d{4}-\d{2}-\d{2}\b/.test(value) || /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(value)) {
    return null;
  }

  return { id, field, reason: "date_required" };
}

function requireAcceptedResult(id, field, value) {
  if (!isUsefulValue(value)) {
    return { id, field, reason: "missing_or_placeholder" };
  }

  if (/^(Pass|Passed|Complete|Completed|Approved|GO|Conditional GO|Waived|Deferred)$/i.test(value.trim())) {
    return null;
  }

  return { id, field, reason: "unsupported_or_unaccepted_result" };
}

function requireExplicitDecision(id, field, value) {
  if (!isUsefulValue(value)) {
    return { id, field, reason: "missing_or_placeholder" };
  }

  if (/\b(approved|approve|go|conditional go|hold|no-go|no go|rollback|defer|deferred)\b/i.test(value)) {
    return null;
  }

  return { id, field, reason: "explicit_release_decision_required" };
}

function isUsefulValue(value) {
  return Boolean(value && !/^(Pending|TBD|\[ \]|-|N\/A|NA)?$/i.test(value.trim()));
}

function extractSection(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  if (start === -1) {
    return "";
  }

  if (!endHeading) {
    return markdown.slice(start);
  }

  const end = markdown.indexOf(endHeading, start + startHeading.length);
  return end === -1 ? markdown.slice(start) : markdown.slice(start, end);
}

function parseTableRow(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function countUnresolved(markdown) {
  return {
    pending: countOccurrences(markdown, "Pending"),
    tbd: countOccurrences(markdown, "TBD"),
  };
}

function summarizeUnresolvedTokensBySection(markdown) {
  const counts = new Map();
  let currentSection = "Document preface";

  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{1,6}\s+/.test(line)) {
      currentSection = line.replace(/^#{1,6}\s+/, "").trim();
    }

    const pending = countTokenInLine(line, "Pending");
    const tbd = countTokenInLine(line, "TBD");
    if (pending === 0 && tbd === 0) {
      continue;
    }

    const existing = counts.get(currentSection) ?? { pending: 0, tbd: 0 };
    existing.pending += pending;
    existing.tbd += tbd;
    counts.set(currentSection, existing);
  }

  return [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function countTokenInLine(line, tokenPattern) {
  const matches = line.match(new RegExp(tokenPattern, "g"));
  return matches?.length ?? 0;
}

function countOccurrences(content, token) {
  let count = 0;
  let index = content.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = content.indexOf(token, index + token.length);
  }

  return count;
}

function formatRows(rows) {
  if (rows.length === 0) {
    return ["PASS | none"];
  }

  return rows.map((row) => `WARN | ${row.id} | ${row.label}`);
}

function formatInvalidFields(fields) {
  if (fields.length === 0) {
    return ["PASS | none"];
  }

  return fields.map(
    (field) =>
      `WARN | ${field.id} | field=${field.field} | reason=${field.reason}`,
  );
}

function summarizeByOwner(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = row.owner || "UNKNOWN";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function formatOwnerSummary(ownerCounts) {
  if (ownerCounts.length === 0) {
    return ["PASS | none"];
  }

  return ownerCounts.map(
    ([owner, count]) => `WARN | ${owner} | incomplete_rows=${count}`,
  );
}

function formatSectionTokenSummary(sectionCounts) {
  if (sectionCounts.length === 0) {
    return ["PASS | none"];
  }

  return sectionCounts.map(
    ([section, counts]) =>
      `WARN | ${section} | Pending=${counts.pending} | TBD=${counts.tbd}`,
  );
}
