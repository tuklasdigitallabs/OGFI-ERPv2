import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const uatEvidenceFile =
  process.env.RELEASE_UAT_EVIDENCE_FILE ??
  "docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md";
const outputFile =
  process.env.RELEASE_UAT_STATUS_OUTPUT_FILE ??
  join(evidenceRoot, "uat-status", `uat-status-${timestamp}.txt`);

const content = readFileSync(uatEvidenceFile, "utf8");
const scenarioRows = extractScenarioRows(content);
const focusedRows = extractFocusedEvidenceRows(content);
const summaryRows = extractSummaryRows(content);
const unresolvedTokens = countUnresolvedTokens(content);
const unresolvedTokenSections = summarizeUnresolvedTokensBySection(content);

const incompleteScenarioRows = scenarioRows.filter((row) => row.isIncomplete);
const incompleteFocusedRows = focusedRows.filter((row) => row.isIncomplete);
const incompleteSummaryRows = summaryRows.filter((row) => row.isIncomplete);
const invalidScenarioFields = scenarioRows.flatMap((row) => row.invalidFields);
const invalidFocusedFields = focusedRows.flatMap((row) => row.invalidFields);
const invalidSummaryFields = summaryRows.flatMap((row) => row.invalidFields);
const invalidFieldCount =
  invalidScenarioFields.length +
  invalidFocusedFields.length +
  invalidSummaryFields.length;
const incompleteScenarioAreas = summarizeByField(incompleteScenarioRows, "area");
const result =
  incompleteScenarioRows.length === 0 &&
  incompleteFocusedRows.length === 0 &&
  incompleteSummaryRows.length === 0 &&
  invalidFieldCount === 0 &&
  unresolvedTokens.pending === 0 &&
  unresolvedTokens.tbd === 0
    ? "RESULT | PASS | UAT evidence pack has no unresolved execution placeholders."
    : "RESULT | WARN | UAT evidence pack is incomplete; execute scenarios, attach evidence, and capture owner signoff before GO review.";

const lines = [
  "OGFI ERP Phase I / Phase 1.5 UAT evidence status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `UAT evidence file: ${uatEvidenceFile}`,
  "",
  "This report is advisory. It does not execute UAT and does not approve release.",
  "",
  "Summary",
  `Execution summary rows: ${summaryRows.length}`,
  `Execution summary incomplete rows: ${incompleteSummaryRows.length}`,
  `Scenario rows: ${scenarioRows.length}`,
  `Scenario incomplete rows: ${incompleteScenarioRows.length}`,
  `Focused evidence rows: ${focusedRows.length}`,
  `Focused evidence incomplete rows: ${incompleteFocusedRows.length}`,
  `Invalid evidence fields: ${invalidFieldCount}`,
  `Pending tokens: ${unresolvedTokens.pending}`,
  `TBD tokens: ${unresolvedTokens.tbd}`,
  "",
  "Incomplete Scenario Areas",
  "OWNER | severity=Critical | owner=QA Lead / Operations Lead | evidence=assigned tester, environment, device/browser, execution timestamp, result, evidence reference, defect/waiver status, and owner signoff for each listed area",
  ...formatAreaSummary(incompleteScenarioAreas),
  "",
  "Unresolved Token Sections",
  "OWNER | severity=Critical | owner=QA Lead / Operations Lead | evidence=clear Pending/TBD placeholders in each listed UAT evidence section",
  ...formatSectionTokenSummary(unresolvedTokenSections),
  "",
  "Invalid UAT Evidence Fields",
  "OWNER | severity=Critical | owner=QA Lead / Operations Lead | evidence=replace weak or malformed UAT values with named tester, environment, execution timestamp, accepted result, evidence reference, defect/waiver disposition, and owner signoff",
  ...formatInvalidFields([
    ...invalidScenarioFields,
    ...invalidFocusedFields,
    ...invalidSummaryFields,
  ]),
  "",
  "Incomplete Scenario Rows",
  ...formatRows(incompleteScenarioRows),
  "",
  "Incomplete Focused Evidence Rows",
  ...formatRows(incompleteFocusedRows),
  "",
  "Incomplete Execution Summary Rows",
  ...formatRows(incompleteSummaryRows),
  "",
  result,
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`UAT status evidence written: ${outputFile}`);

function extractScenarioRows(markdown) {
  const rows = [];
  let inRegister = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## 3. Scenario Execution Register")) {
      inRegister = true;
      continue;
    }
    if (inRegister && line.startsWith("## 4.")) {
      break;
    }
    if (
      !inRegister ||
      !/^\|\s*(P1-SETUP|P1-UAT-\d+|P15-UAT-\d+)\s*\|/.test(line)
    ) {
      continue;
    }

      const cells = parseTableRow(line);
      const id = cells[0] ?? "UNKNOWN";
      const area = cells[1] ?? "UNKNOWN";
      const label = cells[2] ?? cells[1] ?? id;
      const invalidFields = validateScenarioCells(id, cells);
      rows.push({
        id,
        area,
        label,
        isIncomplete: hasPlaceholder(line),
        invalidFields,
      });
  }

  return rows;
}

function extractFocusedEvidenceRows(markdown) {
  const rows = [];
  let inFocusedSection = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## 8. Focused Evidence Capture Sheets")) {
      inFocusedSection = true;
      continue;
    }
    if (inFocusedSection && line.startsWith("## 9.")) {
      break;
    }
    if (!inFocusedSection || !line.startsWith("|") || line.includes("---")) {
      continue;
    }

    const cells = parseTableRow(line);
    const firstCell = cells[0] ?? "";
    if (!firstCell || /^Evidence item$/i.test(firstCell)) {
      continue;
    }

    const invalidFields = validateFocusedEvidenceCells(firstCell, cells);
    rows.push({
      id: firstCell,
      label: cells[1] ?? firstCell,
      isIncomplete: hasPlaceholder(line),
      invalidFields,
    });
  }

  return rows;
}

function extractSummaryRows(markdown) {
  const rows = [];
  let inSummary = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## 2. Execution Summary")) {
      inSummary = true;
      continue;
    }
    if (inSummary && line.startsWith("## 3.")) {
      break;
    }
    if (!inSummary || !line.startsWith("|") || line.includes("---")) {
      continue;
    }

    const cells = parseTableRow(line);
    const firstCell = cells[0] ?? "";
    if (!firstCell || /^Area$/i.test(firstCell)) {
      continue;
    }

    const invalidFields = validateSummaryCells(firstCell, cells);
    rows.push({
      id: firstCell,
      label: cells[2] ?? firstCell,
      isIncomplete: hasPlaceholder(line),
      invalidFields,
    });
  }

  return rows;
}

function parseTableRow(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function hasPlaceholder(line) {
  return /\b(Pending|TBD)\b/i.test(line);
}

function validateScenarioCells(id, cells) {
  return [
    requireUsefulCell(id, "Tester / role", cells[3]),
    requireUsefulCell(id, "Environment", cells[4]),
    requireUsefulCell(id, "Device / browser", cells[5]),
    requireDateLikeCell(id, "Execution date/time", cells[6]),
    requireAllowedResult(id, "Result", cells[7]),
    requireUsefulCell(id, "Evidence reference", cells[8]),
    requireUsefulCell(id, "Defect / waiver", cells[9]),
    requireWaiverDisposition(id, "Defect / waiver", cells[7], cells[9]),
    requireUsefulCell(id, "Owner signoff", cells[10]),
  ].filter(Boolean);
}

function validateFocusedEvidenceCells(id, cells) {
  return [
    requireAllowedResult(id, "Result", cells[2]),
    requireUsefulCell(id, "Evidence reference", cells[3]),
  ].filter(Boolean);
}

function validateSummaryCells(id, cells) {
  return [
    requireUsefulCell(id, "Status", cells[1]),
    requireUsefulCell(id, "Evidence required before GO", cells[2]),
    requireUsefulCell(id, "Owner", cells[3]),
    requireUsefulCell(id, "Signoff", cells[4]),
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

function requireAllowedResult(id, field, value) {
  if (!isUsefulValue(value)) {
    return { id, field, reason: "missing_or_placeholder" };
  }

  if (/^(Pass|Passed|Waived|Deferred)$/i.test(value.trim())) {
    return null;
  }

  return { id, field, reason: "unsupported_or_unaccepted_result" };
}

function requireWaiverDisposition(id, field, result, disposition) {
  if (!/^(Waived|Deferred)$/i.test(result?.trim() ?? "")) {
    return null;
  }

  if (
    isUsefulValue(disposition) &&
    /\b(approved|approval|waiver|waived|defer|deferred|exception|signoff|sign-off)\b/i.test(
      disposition,
    )
  ) {
    return null;
  }

  return { id, field, reason: "approved_waiver_or_deferral_required" };
}

function isUsefulValue(value) {
  return Boolean(value && !/^(Pending|TBD|\[ \]|-|N\/A|NA)?$/i.test(value.trim()));
}

function countUnresolvedTokens(markdown) {
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

function countTokenInLine(line, token) {
  const matches = line.match(new RegExp(`\\b${token}\\b`, "g"));
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

function summarizeByField(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const key = row[field] || "UNKNOWN";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function formatAreaSummary(areaCounts) {
  if (areaCounts.length === 0) {
    return ["PASS | none"];
  }

  return areaCounts.map(
    ([area, count]) => `WARN | ${area} | incomplete_scenarios=${count}`,
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

function formatInvalidFields(fields) {
  if (fields.length === 0) {
    return ["PASS | none"];
  }

  return fields.map(
    (field) => `WARN | ${field.id} | field=${field.field} | reason=${field.reason}`,
  );
}
