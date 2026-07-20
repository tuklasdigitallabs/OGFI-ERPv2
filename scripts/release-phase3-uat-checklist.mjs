import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const scenarioFile =
  process.env.RELEASE_PHASE3_UAT_SCENARIO_FILE ??
  "docs/phases/phase-03-finance-and-workforce/quality/PHASE3_UAT_SCENARIOS.md";
const outputFile =
  process.env.RELEASE_PHASE3_UAT_CHECKLIST_OUTPUT_FILE ??
  join(evidenceRoot, "phase3-uat-checklist", `phase3-uat-checklist-${timestamp}.txt`);

const scenarioContent = existsSync(scenarioFile)
  ? readFileSync(scenarioFile, "utf8")
  : "";
const scenarioRows = extractScenarioRows(scenarioContent);
const latestPhase3Status = latestMatchingFile(
  join(evidenceRoot, "phase3-uat-status"),
  /^phase3-uat-status-.*\.txt$/,
);

const lines = [
  "OGFI ERP Phase 3 UAT execution checklist",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  `Scenario file: ${scenarioFile}`,
  "",
  "This checklist is advisory. It does not execute UAT, create ERP evidence records, verify evidence, approve waivers, resolve deferred blockers, approve production finance/workforce go-live, settle AP, release payments, mutate bank balances, compute payroll, or post journals.",
  "",
  "Required Release Readiness Evidence Records",
  "RECORD | Finance foundation | UAT evidence | SCENARIO_EXECUTION | workflow area=Phase 3 finance controlled foundation | result=PASS/RETEST_PASS/WAIVED | verification=VERIFIED",
  "RECORD | Finance foundation | UAT evidence | ACCEPTANCE_MATRIX | workflow area=Phase 3 finance controlled foundation | result=PASS/RETEST_PASS/WAIVED | verification=VERIFIED",
  "RECORD | Workforce foundation | UAT evidence | SCENARIO_EXECUTION | workflow area=Phase 3 workforce controlled foundation | result=PASS/RETEST_PASS/WAIVED | verification=VERIFIED",
  "RECORD | Workforce foundation | UAT evidence | ACCEPTANCE_MATRIX | workflow area=Phase 3 workforce controlled foundation | result=PASS/RETEST_PASS/WAIVED | verification=VERIFIED",
  "RECORD | Deferred blocker review | UAT evidence | DEFECT_DISPOSITION | workflow area=Phase 3 deferred blocker review | result=PASS/RETEST_PASS/WAIVED | verification=VERIFIED",
  "RECORD | Deferred blocker review | UAT evidence | DEFAULT_REVISION_REGISTER | workflow area=Phase 3 deferred blocker review | result=PASS/RETEST_PASS/WAIVED | verification=VERIFIED",
  "",
  "Required Evidence Fields",
  "FIELD | tester and role | named tester, ERP user, approval role, and scope used",
  "FIELD | environment | tenant/company/brand/location, pilot or staging database, browser/device, date and timezone",
  "FIELD | source records | document numbers or IDs for requests, invoices, releases, cash records, employees, schedules, imports, exports, and audit rows",
  "FIELD | controls | no-self-approval, wrong-scope denial, invalid transition, audit, export, and source-boundary proof where applicable",
  "FIELD | evidence reference | immutable screenshot/export/checksum/audit reference; metadata-link only until P3-BLOCK-002 is closed",
  "FIELD | disposition | defect, waiver, deferred blocker, or no-defect outcome with owner and date",
  "FIELD | owner signoff | finance, workforce, QA, security, or release owner decision as applicable",
  "",
  "Scenario Execution Register",
  ...scenarioRows.flatMap(formatScenario),
  "Latest Phase 3 UAT Status",
  ...latestStatusLines("phase3-uat-status", latestPhase3Status),
  "",
  "Execution Order",
  "STEP | 01 | Run DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register after current Release Readiness evidence is exported.",
  "STEP | 02 | Execute the Finance Controlled Foundation scenarios with real scoped source records.",
  "STEP | 03 | Execute the Workforce Controlled Foundation scenarios with restricted and authorized users.",
  "STEP | 04 | Review each deferred blocker with owners and record accepted disposition evidence without representing blockers as solved unless formally completed or waived.",
  "STEP | 05 | Have a separate reviewer verify the UAT evidence records in Admin > Release Readiness.",
  "STEP | 06 | Rerun pnpm release:phase3-uat-status and pnpm release:phase3-status.",
  "",
  scenarioRows.length > 0
    ? "RESULT | ACTION REQUIRED | Execute Phase 3 UAT scenarios and collect verified Release Readiness evidence."
    : "RESULT | BLOCKED | Phase 3 UAT scenario rows could not be read from the scenario pack.",
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Phase 3 UAT execution checklist written: ${outputFile}`);

function extractScenarioRows(markdown) {
  const groups = [
    {
      name: "finance",
      workflowArea: "Phase 3 finance controlled foundation",
      start: "## Finance Controlled Foundation Scenarios",
      end: "## Workforce Controlled Foundation Scenarios",
    },
    {
      name: "workforce",
      workflowArea: "Phase 3 workforce controlled foundation",
      start: "## Workforce Controlled Foundation Scenarios",
      end: "## Deferred Blocker Review Scenarios",
    },
    {
      name: "deferred blocker review",
      workflowArea: "Phase 3 deferred blocker review",
      start: "## Deferred Blocker Review Scenarios",
      end: "## Required Sign-Off Roles",
    },
  ];

  return groups.flatMap((group) =>
    extractSection(markdown, group.start, group.end)
      .split(/\r?\n/)
      .filter((line) => /^\|\s*P3-UAT-/.test(line))
      .map((line) => {
        const cells = parseMarkdownRow(line);
        return {
          id: cells[0] ?? "UNKNOWN",
          group: group.name,
          workflowArea: group.workflowArea,
          workflow: cells[1] ?? "UNKNOWN",
          steps: cells[2] ?? "UNKNOWN",
          mustProve: cells[3] ?? "UNKNOWN",
          readinessEvidence: cells[4] ?? cells[3] ?? "UNKNOWN",
        };
      }),
  );
}

function formatScenario(row) {
  return [
    `SCENARIO | ${row.id} | ${row.group} | ${row.workflow}`,
    `WORKFLOW_AREA | ${row.workflowArea}`,
    `EXECUTE | ${row.steps}`,
    `MUST_PROVE | ${row.mustProve}`,
    `RECORD_EVIDENCE | ${row.readinessEvidence}`,
    "",
  ];
}

function extractSection(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  if (start === -1) {
    return "";
  }
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  return markdown.slice(start, end === -1 ? undefined : end);
}

function parseMarkdownRow(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
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

function latestStatusLines(directory, latestStatus) {
  if (!latestStatus) {
    return [`STATUS | missing latest ${directory} artifact`];
  }

  const relativePath = `${directory}/${latestStatus}`;
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
        line.startsWith("FAIL |") ||
        line.startsWith("OWNER |"),
    )
    .slice(0, 18);

  return [
    `STATUS | ${relativePath}`,
    ...(statusLines.length > 0
      ? statusLines.map((line) => `SNAPSHOT | ${line}`)
      : ["STATUS | no result lines found"]),
  ];
}
