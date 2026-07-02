import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const trainingFile =
  process.env.RELEASE_TRAINING_EVIDENCE_FILE ??
  "docs/core/08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md";
const hypercareFile =
  process.env.RELEASE_HYPERCARE_EVIDENCE_FILE ??
  "docs/core/07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md";
const outputFile =
  process.env.RELEASE_ENABLEMENT_STATUS_OUTPUT_FILE ??
  join(evidenceRoot, "enablement-status", `enablement-status-${timestamp}.txt`);

const trainingContent = readFileSync(trainingFile, "utf8");
const hypercareContent = readFileSync(hypercareFile, "utf8");

const training = {
  readinessChecklist: extractChecklist(trainingContent, "## Readiness Checklist", "## Training Execution Evidence"),
  executionRows: extractTableRows(
    trainingContent,
    "## Training Execution Evidence",
    "## Known-Limit Acknowledgement Checklist",
    () => "Enablement Owner / Operations Owner",
    "training",
  ),
  unresolved: countUnresolved(trainingContent, true),
  unresolvedSections: summarizeUnresolvedTokensBySection(trainingContent, true),
};
const hypercare = {
  roleRows: extractTableRows(
    hypercareContent,
    "## 1. Required Pilot Roles",
    "## 2. Defect Intake Rules",
    (cells) => cells[0] ?? "UNKNOWN",
    "role",
  ),
  dailyRows: extractTableRows(
    hypercareContent,
    "## 5. Daily Hypercare Checklist",
    "## 6. User Confusion, Rush, Or Temporary Disruption SOP",
    (cells) => cells[3] ?? "UNKNOWN",
    "daily",
  ),
  unresolved: countUnresolved(hypercareContent, false),
  unresolvedSections: summarizeUnresolvedTokensBySection(hypercareContent, false),
};

const incompleteTrainingChecklist = training.readinessChecklist.filter(
  (item) => item.isIncomplete,
);
const incompleteTrainingRows = training.executionRows.filter(
  (row) => row.isIncomplete,
);
const incompleteRoleRows = hypercare.roleRows.filter((row) => row.isIncomplete);
const incompleteDailyRows = hypercare.dailyRows.filter((row) => row.isIncomplete);
const invalidRows = [
  ...training.executionRows,
  ...hypercare.roleRows,
  ...hypercare.dailyRows,
].flatMap((row) => row.invalidFields);
const incompleteOwnerSummary = summarizeByOwner([
  ...incompleteTrainingChecklist.map((item) => ({
    ...item,
    owner: "Enablement Owner / QA Lead",
  })),
  ...incompleteTrainingRows,
  ...incompleteRoleRows,
  ...incompleteDailyRows,
]);

const result =
  incompleteTrainingChecklist.length === 0 &&
  incompleteTrainingRows.length === 0 &&
  incompleteRoleRows.length === 0 &&
  incompleteDailyRows.length === 0 &&
  invalidRows.length === 0 &&
  training.unresolved.pending === 0 &&
  training.unresolved.tbd === 0 &&
  training.unresolved.unchecked === 0 &&
  hypercare.unresolved.pending === 0 &&
  hypercare.unresolved.tbd === 0
    ? "RESULT | PASS | Enablement, training, and hypercare evidence has no unresolved placeholders."
    : "RESULT | WARN | Enablement, training, and hypercare evidence is incomplete; capture attendance, owners, support routes, daily review evidence, and signoff before GO review.";

const lines = [
  "OGFI ERP Phase I / Phase 1.5 enablement and hypercare status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Training evidence file: ${trainingFile}`,
  `Hypercare evidence file: ${hypercareFile}`,
  "",
  "This report is advisory. It does not conduct training, run hypercare, or approve release.",
  "",
  "Summary",
  `Training readiness checklist items: ${training.readinessChecklist.length}`,
  `Training readiness incomplete items: ${incompleteTrainingChecklist.length}`,
  `Training execution rows: ${training.executionRows.length}`,
  `Training execution incomplete rows: ${incompleteTrainingRows.length}`,
  `Invalid enablement fields: ${invalidRows.length}`,
  `Training Pending tokens: ${training.unresolved.pending}`,
  `Training TBD tokens: ${training.unresolved.tbd}`,
  `Training unchecked boxes: ${training.unresolved.unchecked}`,
  `Hypercare role rows: ${hypercare.roleRows.length}`,
  `Hypercare role incomplete rows: ${incompleteRoleRows.length}`,
  `Hypercare daily checklist rows: ${hypercare.dailyRows.length}`,
  `Hypercare daily incomplete rows: ${incompleteDailyRows.length}`,
  `Hypercare Pending tokens: ${hypercare.unresolved.pending}`,
  `Hypercare TBD tokens: ${hypercare.unresolved.tbd}`,
  "",
  "Incomplete Enablement Owner Summary",
  "OWNER | severity=High | owner=Enablement Owner / Operations Owner | evidence=assign each incomplete training, role, support-route, daily review, and signoff row to its named owner",
  ...formatOwnerSummary(incompleteOwnerSummary),
  "",
  "Training Unresolved Token Sections",
  "OWNER | severity=High | owner=Enablement Owner / Operations Owner | evidence=clear Pending/TBD/checklist placeholders in each listed training section",
  ...formatSectionTokenSummary(training.unresolvedSections, true),
  "",
  "Hypercare Unresolved Token Sections",
  "OWNER | severity=High | owner=Operations Owner / QA Lead | evidence=clear Pending/TBD placeholders in each listed hypercare section",
  ...formatSectionTokenSummary(hypercare.unresolvedSections, false),
  "",
  "Invalid Enablement Evidence Fields",
  "OWNER | severity=High | owner=Enablement Owner / Operations Owner | evidence=replace weak or malformed enablement values with training dates, attendees, evidence references, support owners, accepted daily results, and signoff",
  ...formatInvalidFields(invalidRows),
  "",
  "Incomplete Training Readiness Checklist",
  "OWNER | severity=High | owner=Enablement Owner / QA Lead | evidence=UAT execution, training schedule, defect disposition, deployment evidence, support contacts, and GO decision",
  ...formatRows(incompleteTrainingChecklist),
  "",
  "Incomplete Training Execution Rows",
  "OWNER | severity=High | owner=Enablement Owner / Operations Owner | evidence=session date, trainer, attendees, material coverage, known-limit acknowledgement, follow-up owner, and signoff",
  ...formatRows(incompleteTrainingRows),
  "",
  "Incomplete Hypercare Role Rows",
  "OWNER | severity=High | owner=Release Manager / Product Owner | evidence=named owners, backups, contact routes, decision scope, and confirmation",
  ...formatRows(incompleteRoleRows),
  "",
  "Incomplete Daily Hypercare Rows",
  "OWNER | severity=High | owner=Operations Owner / QA Lead | evidence=daily operational review evidence, issue disposition, and support follow-up",
  ...formatRows(incompleteDailyRows),
  "",
  result,
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Enablement status evidence written: ${outputFile}`);

function extractChecklist(markdown, startHeading, endHeading) {
  return extractSection(markdown, startHeading, endHeading)
    .split(/\r?\n/)
    .filter((line) => /^- \[[ x]\]/.test(line))
    .map((line) => ({
      id: line.replace(/^- \[[ x]\]\s*/, "").trim(),
      label: line.replace(/^- \[[ x]\]\s*/, "").trim(),
      isIncomplete: line.startsWith("- [ ]"),
    }));
}

function extractTableRows(markdown, startHeading, endHeading, ownerResolver, kind) {
  return extractSection(markdown, startHeading, endHeading)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .map(parseTableRow)
    .filter((cells) => {
      const firstCell = cells[0] ?? "";
      return firstCell && !/^(Audience|Role|Area)$/i.test(firstCell);
    })
    .map((cells) => ({
      id: cells[0] ?? "UNKNOWN",
      label: cells[3] ?? cells[2] ?? cells[1] ?? cells[0] ?? "UNKNOWN",
      owner: ownerResolver(cells),
      isIncomplete: cells.some((cell) => /\b(Pending|TBD)\b/i.test(cell)),
      invalidFields: validateRow(kind, cells[0] ?? "UNKNOWN", cells),
    }));
}

function validateRow(kind, id, cells) {
  if (kind === "training") {
    const signoffByIndex = cells.length >= 10 ? 8 : 7;
    const signoffDateIndex = cells.length >= 10 ? 9 : null;
    return [
      requireDateLikeCell(id, "Session date/time", cells[1]),
      requireUsefulCell(id, "Trainer", cells[2]),
      requireUsefulCell(id, "Attendees / roles", cells[3]),
      requireUsefulCell(id, "Material covered", cells[4]),
      requireUsefulCell(id, "Known limits acknowledged", cells[5]),
      requireUsefulCell(id, "Open questions / follow-up owner", cells[6]),
      ...(cells.length >= 10
        ? [requireUsefulCell(id, "Evidence reference", cells[7])]
        : []),
      requireUsefulCell(id, "Signoff by", cells[signoffByIndex]),
      ...(signoffDateIndex === null
        ? []
        : [requireDateLikeCell(id, "Signoff date", cells[signoffDateIndex])]),
    ].filter(Boolean);
  }

  if (kind === "role") {
    return [
      requireUsefulCell(id, "Named owner", cells[1]),
      requireUsefulCell(id, "Backup", cells[2]),
      requireUsefulCell(id, "Decision scope", cells[3]),
      requireUsefulCell(id, "Contact route", cells[4]),
      requireConfirmedCell(id, "Confirmed", cells[5]),
    ].filter(Boolean);
  }

  return [
    requireUsefulCell(id, "Evidence reference", cells[2]),
    requireUsefulCell(id, "Owner", cells[3]),
    requireAcceptedResult(id, "Result", cells[4]),
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

  if (/^(Pass|Passed|Complete|Completed|Reviewed|Resolved|No issues|GO|Conditional GO)$/i.test(value.trim())) {
    return null;
  }

  return { id, field, reason: "unsupported_or_unaccepted_result" };
}

function requireConfirmedCell(id, field, value) {
  if (!isUsefulValue(value)) {
    return { id, field, reason: "missing_or_placeholder" };
  }

  if (/^(Yes|Confirmed|Complete|Completed|Approved)$/i.test(value.trim())) {
    return null;
  }

  return { id, field, reason: "confirmation_required" };
}

function isUsefulValue(value) {
  return Boolean(value && !/^(Pending|TBD|\[ \]|-|N\/A|NA)?$/i.test(value.trim()));
}

function extractSection(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  if (start === -1) {
    return "";
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

function countUnresolved(markdown, includeUnchecked) {
  return {
    pending: countOccurrences(markdown, "Pending"),
    tbd: countOccurrences(markdown, "TBD"),
    unchecked: includeUnchecked ? countOccurrences(markdown, "[ ]") : 0,
  };
}

function summarizeUnresolvedTokensBySection(markdown, includeUnchecked) {
  const counts = new Map();
  let currentSection = "Document preface";

  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{1,6}\s+/.test(line)) {
      currentSection = line.replace(/^#{1,6}\s+/, "").trim();
    }

    const pending = countTokenInLine(line, "Pending");
    const tbd = countTokenInLine(line, "TBD");
    const unchecked = includeUnchecked ? countTokenInLine(line, "\\[ \\]") : 0;
    if (pending === 0 && tbd === 0 && unchecked === 0) {
      continue;
    }

    const existing = counts.get(currentSection) ?? {
      pending: 0,
      tbd: 0,
      unchecked: 0,
    };
    existing.pending += pending;
    existing.tbd += tbd;
    existing.unchecked += unchecked;
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
    ([owner, count]) => `WARN | ${owner} | incomplete_items=${count}`,
  );
}

function formatSectionTokenSummary(sectionCounts, includeUnchecked) {
  if (sectionCounts.length === 0) {
    return ["PASS | none"];
  }

  return sectionCounts.map(([section, counts]) => {
    const unchecked = includeUnchecked ? ` | unchecked=${counts.unchecked}` : "";
    return `WARN | ${section} | Pending=${counts.pending} | TBD=${counts.tbd}${unchecked}`;
  });
}
