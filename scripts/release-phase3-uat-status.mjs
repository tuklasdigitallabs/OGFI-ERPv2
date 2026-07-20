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
const readinessRegisterFile =
  process.env.RELEASE_READINESS_REGISTER_FILE ??
  latestMatchingFile(
    join(evidenceRoot, "release-readiness-register"),
    /^release-readiness-register-.*\.csv$/,
  );
const outputFile =
  process.env.RELEASE_PHASE3_UAT_STATUS_OUTPUT_FILE ??
  join(evidenceRoot, "phase3-uat-status", `phase3-uat-status-${timestamp}.txt`);

const workflowAreas = {
  finance: "Phase 3 finance controlled foundation",
  workforce: "Phase 3 workforce controlled foundation",
  blockers: "Phase 3 deferred blocker review",
};
const requiredCoverage = [
  {
    label: "Phase 3 finance controlled foundation",
    workflowArea: workflowAreas.finance,
    evidenceTypes: ["SCENARIO_EXECUTION", "ACCEPTANCE_MATRIX"],
    owner: "Finance Owner / QA Lead",
  },
  {
    label: "Phase 3 workforce controlled foundation",
    workflowArea: workflowAreas.workforce,
    evidenceTypes: ["SCENARIO_EXECUTION", "ACCEPTANCE_MATRIX"],
    owner: "HR / Workforce Owner / QA Lead",
  },
  {
    label: "Phase 3 deferred blocker review",
    workflowArea: workflowAreas.blockers,
    evidenceTypes: ["DEFECT_DISPOSITION", "DEFAULT_REVISION_REGISTER"],
    owner: "Product Owner / Finance Owner / QA Lead",
  },
];

const scenarioContent = existsSync(scenarioFile)
  ? readFileSync(scenarioFile, "utf8")
  : "";
const scenarioRows = extractScenarioRows(scenarioContent);
const requiredCoverageItems = extractRequiredCoverageItems(scenarioContent);
const exactWorkflowAreaMentions = Object.values(workflowAreas).filter((area) =>
  scenarioContent.includes(area),
);
const readinessRows =
  readinessRegisterFile && existsSync(readinessRegisterFile)
    ? extractUatEvidenceRows(readFileSync(readinessRegisterFile, "utf8"))
    : [];
const coverageResults = requiredCoverage.map((coverage) =>
  evaluateWorkflowCoverage(coverage, readinessRows),
);
const blockers = coverageResults.filter((result) => !result.pass).length;
const scenarioCountByGroup = summarizeScenarioRows(scenarioRows);
const missingWorkflowAreaDocs = Object.values(workflowAreas).filter(
  (area) => !exactWorkflowAreaMentions.includes(area),
);

const lines = [
  "OGFI ERP Phase 3 UAT evidence status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Scenario file: ${scenarioFile}`,
  `Release Readiness register: ${readinessRegisterFile ?? "missing"}`,
  "",
  "This report is advisory. It does not execute UAT, verify evidence in the ERP, approve waivers, close deferred blockers, approve production accounting use, settle AP, release payments, mutate bank balances, compute payroll, or mark readiness gates ready.",
  "",
  "Scenario Pack Summary",
  `Scenario rows: ${scenarioRows.length}`,
  `Finance scenarios: ${scenarioCountByGroup.finance}`,
  `Workforce scenarios: ${scenarioCountByGroup.workforce}`,
  `Deferred blocker review scenarios: ${scenarioCountByGroup.blockers}`,
  `Required evidence mentions: ${requiredCoverageItems.length}`,
  `Exact workflow-area labels documented: ${exactWorkflowAreaMentions.length}/3`,
  ...(missingWorkflowAreaDocs.length > 0
    ? missingWorkflowAreaDocs.map((area) => `FAIL | Missing workflow-area label in scenario pack | ${area}`)
    : ["PASS | Scenario pack documents exact Phase 3 workflow-area labels."]),
  "",
  "Release Readiness UAT Evidence Coverage",
  "OWNER | severity=Critical | evidence=verified PASS/RETEST_PASS/WAIVED Release Readiness UAT evidence with exact workflow-area labels",
  ...coverageResults.flatMap((result) => formatCoverageResult(result)),
  "",
  "Scenario Register",
  ...scenarioRows.map((row) => `SCENARIO | ${row.id} | ${row.group} | ${row.workflow}`),
  "",
  "Next Actions",
  "- Record Phase 3 UAT evidence in Admin > Release Readiness > UAT evidence.",
  "- Use the exact workflow-area dropdown value for finance, workforce, or deferred blocker review.",
  "- Verify the UAT evidence records before marking Phase 3 readiness gates READY.",
  "- Rerun DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register after evidence is verified.",
  "- Rerun pnpm release:phase3-uat-status and pnpm release:phase3-status.",
  "",
  blockers === 0 && missingWorkflowAreaDocs.length === 0
    ? "RESULT | PASS | Phase 3 UAT evidence coverage is present in the Release Readiness register."
    : `RESULT | WARN | Phase 3 UAT evidence is incomplete; ${blockers} coverage group(s) and ${missingWorkflowAreaDocs.length} scenario-pack label issue(s) need review.`,
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Phase 3 UAT status evidence written: ${outputFile}`);

function latestMatchingFile(directory, pattern) {
  if (!existsSync(directory)) {
    return null;
  }

  const latest = readdirSync(directory)
    .filter((file) => pattern.test(file))
    .sort()
    .at(-1);

  return latest ? join(directory, latest) : null;
}

function extractScenarioRows(markdown) {
  const groups = [
    {
      name: "finance",
      start: "## Finance Controlled Foundation Scenarios",
      end: "## Workforce Controlled Foundation Scenarios",
    },
    {
      name: "workforce",
      start: "## Workforce Controlled Foundation Scenarios",
      end: "## Deferred Blocker Review Scenarios",
    },
    {
      name: "deferred blocker review",
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
          workflow: cells[1] ?? "UNKNOWN",
          requiredEvidence: cells.at(-1) ?? "",
        };
      }),
  );
}

function extractRequiredCoverageItems(markdown) {
  return (markdown.match(/`(SCENARIO_EXECUTION|ACCEPTANCE_MATRIX|DEFECT_DISPOSITION|DEFAULT_REVISION_REGISTER)`/g) ?? []).map(
    (value) => value.replaceAll("`", ""),
  );
}

function summarizeScenarioRows(rows) {
  return {
    finance: rows.filter((row) => row.group === "finance").length,
    workforce: rows.filter((row) => row.group === "workforce").length,
    blockers: rows.filter((row) => row.group === "deferred blocker review").length,
  };
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

function extractUatEvidenceRows(csv) {
  return csv
    .split(/\r?\n/)
    .map(parseCsvLine)
    .filter((cells) => cells[0] === "UAT evidence")
    .map((cells) => ({
      evidenceType: cells[3] ?? "",
      title: cells[4] ?? "",
      workflowArea: cells[5] ?? "",
      tester: cells[6] ?? "",
      environment: cells[7] ?? "",
      result: cells[8] ?? "",
      verificationStatus: cells[9] ?? "",
      evidenceReference: cells[10] ?? "",
    }));
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += character;
  }

  cells.push(current);
  return cells;
}

function evaluateWorkflowCoverage(coverage, rows) {
  const passingResults = new Set(["PASS", "RETEST_PASS", "WAIVED"]);
  const matchingRows = rows.filter(
    (row) =>
      row.workflowArea === coverage.workflowArea &&
      row.verificationStatus === "VERIFIED" &&
      passingResults.has(row.result),
  );
  const matchedTypes = new Set(matchingRows.map((row) => row.evidenceType));
  const missingTypes = coverage.evidenceTypes.filter((type) => !matchedTypes.has(type));

  return {
    ...coverage,
    pass: missingTypes.length === 0,
    matchingRows,
    missingTypes,
  };
}

function formatCoverageResult(result) {
  if (result.pass) {
    return [
      `PASS | ${result.label} | verified_rows=${result.matchingRows.length}`,
      ...result.matchingRows.map(
        (row) =>
          `  EVIDENCE | ${row.evidenceType} | result=${row.result} | tester=${row.tester || "not recorded"} | reference=${row.evidenceReference || "not recorded"}`,
      ),
    ];
  }

  return [
    `MISSING | ${result.label} | missing=${result.missingTypes.join(", ")}`,
    `  OWNER | owner=${result.owner} | workflowArea=${result.workflowArea}`,
  ];
}
