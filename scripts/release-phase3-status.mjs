import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const outputFile =
  process.env.RELEASE_PHASE3_STATUS_OUTPUT_FILE ??
  join(evidenceRoot, "phase3-status", `phase3-status-${timestamp}.txt`);

const files = {
  backlog:
    "docs/phases/phase-03-finance-and-workforce/implementation/PHASE3_BUILD_BACKLOG_AND_ACCEPTANCE_CRITERIA.md",
  blockerRegister: "docs/core/07-quality/PHASE3_DEFERRED_GO_LIVE_BLOCKERS_FOR_UAT.md",
  uatScenarios:
    "docs/phases/phase-03-finance-and-workforce/quality/PHASE3_UAT_SCENARIOS.md",
  acceptanceMatrix:
    "docs/phases/phase-03-finance-and-workforce/quality/PHASE3_CONTROLLED_FOUNDATION_ACCEPTANCE_MATRIX.md",
  releaseReadinessService: "apps/web/src/server/services/releaseReadiness.ts",
  releaseReadinessPage: "apps/web/src/app/(app)/admin/readiness/page.tsx",
  financeTests: "apps/web/src/server/services/finance.test.ts",
  workforceTests: "apps/web/src/server/services/workforce.test.ts",
  cashAdvanceTests: "apps/web/src/server/services/cashAdvances.test.ts",
  periodCloseTests: "apps/web/src/server/services/financePeriodClose.test.ts",
  releaseReadinessTests: "apps/web/src/server/services/releaseReadiness.test.ts",
  financeKb: "docs/knowledge-base/finance/README.md",
  phase3ReleaseNote:
    "docs/release-notes/phase-3-controlled-foundation-readiness-summary.md",
  phase3Training:
    "docs/training/phase-3-finance-workforce-controlled-foundation-quick-start.md",
};

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const scripts = packageJson.scripts ?? {};
const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [
    key,
    existsSync(file) ? readFileSync(file, "utf8") : "",
  ]),
);

const phase3WorkflowLabels = [
  "Phase 3 finance controlled foundation",
  "Phase 3 workforce controlled foundation",
  "Phase 3 deferred blocker review",
];
const deferredBlockerIds = extractDeferredBlockerIds(source.blockerRegister);
const pendingMilestones = extractPendingMilestones(source.backlog);
const implementedMilestones = extractImplementedMilestones(source.backlog);
const evidenceArtifacts = [
  artifactStatus(
    "Release readiness register export",
    "release-readiness-register",
    /^release-readiness-register-.*\.csv$/,
    [
      "uat.phase3_finance_controlled_foundation",
      "uat.phase3_workforce_controlled_foundation",
      "uat.phase3_deferred_blockers_reviewed",
    ],
  ),
  artifactStatus("UAT status report", "uat-status", /^uat-status-.*\.txt$/, [
    "Phase 3 finance controlled foundation",
    "Phase 3 workforce controlled foundation",
    "Phase 3 deferred blocker review",
  ]),
  artifactStatus(
    "Phase 3 UAT execution checklist",
    "phase3-uat-checklist",
    /^phase3-uat-checklist-.*\.txt$/,
    [
      "OGFI ERP Phase 3 UAT execution checklist",
      "Phase 3 finance controlled foundation",
      "Phase 3 workforce controlled foundation",
      "Phase 3 deferred blocker review",
    ],
  ),
  artifactStatus(
    "Phase 3 UAT status report",
    "phase3-uat-status",
    /^phase3-uat-status-.*\.txt$/,
    [
      "OGFI ERP Phase 3 UAT evidence status",
      "Phase 3 finance controlled foundation",
      "Phase 3 workforce controlled foundation",
      "Phase 3 deferred blocker review",
    ],
  ),
  artifactStatus("Pilot UAT status report", "pilot-uat-status", /^pilot-uat-status-.*\.txt$/, [
    "Phase 3",
  ]),
  artifactStatus("Enablement status report", "enablement-status", /^enablement-status-.*\.txt$/, [
    "Phase 3",
  ]),
  artifactStatus("GO / NO-GO report", "go-no-go", /^go-no-go-.*\.txt$/, [
    "Phase 3",
  ]),
];

const checks = [
  fileCheck("Phase 3 build backlog", files.backlog),
  fileCheck("Phase 3 deferred blocker register", files.blockerRegister),
  fileCheck("Phase 3 UAT scenarios", files.uatScenarios),
  fileCheck("Phase 3 acceptance matrix", files.acceptanceMatrix),
  fileCheck("Phase 3 finance KB index", files.financeKb),
  fileCheck("Phase 3 release note", files.phase3ReleaseNote),
  fileCheck("Phase 3 training quick-start", files.phase3Training),
  scriptCheck("Phase 3 status script", "release:phase3-status"),
  scriptCheck("Phase 3 UAT checklist script", "release:phase3-uat-checklist"),
  scriptCheck("Phase 3 UAT status script", "release:phase3-uat-status"),
  contentCheck(
    "Release Readiness has Phase 3 finance gate",
    source.releaseReadinessService,
    "uat.phase3_finance_controlled_foundation",
  ),
  contentCheck(
    "Release Readiness has Phase 3 workforce gate",
    source.releaseReadinessService,
    "uat.phase3_workforce_controlled_foundation",
  ),
  contentCheck(
    "Release Readiness has deferred blocker review gate",
    source.releaseReadinessService,
    "uat.phase3_deferred_blockers_reviewed",
  ),
  contentCheck(
    "UAT workflow dropdown uses shared workflow-area options",
    source.releaseReadinessPage,
    "uatWorkflowAreaOptions",
  ),
  ...phase3WorkflowLabels.map((label) =>
    contentCheck(`Shared UAT workflow-area options include ${label}`, source.releaseReadinessService, label),
  ),
  ...phase3WorkflowLabels.map((label) =>
    contentCheck(`UAT scenarios document ${label}`, source.uatScenarios, label),
  ),
  contentCheck(
    "Release Readiness tests cover Phase 3 finance readiness",
    source.releaseReadinessTests,
    "phase3FinanceReady",
  ),
  contentCheck(
    "Release Readiness tests cover Phase 3 workforce readiness",
    source.releaseReadinessTests,
    "phase3WorkforceReady",
  ),
  contentCheck(
    "Finance tests exist for Phase 3 finance services",
    source.financeTests,
    "describe",
  ),
  contentCheck(
    "Workforce tests exist for Phase 3 workforce services",
    source.workforceTests,
    "describe",
  ),
  contentCheck(
    "Cash advance tests exist for non-settlement boundary",
    source.cashAdvanceTests,
    "P3-BLOCK-001",
  ),
  contentCheck(
    "Period close tests exist for close readiness controls",
    source.periodCloseTests,
    "period close readiness foundation",
  ),
  countCheck(
    "Deferred blocker register has P3 blocker coverage",
    deferredBlockerIds.length >= 7,
    `${deferredBlockerIds.length} blocker row(s) found`,
  ),
];

const failedChecks = checks.filter((check) => !check.pass);
const missingArtifacts = evidenceArtifacts.filter((artifact) => !artifact.pass);
const result =
  failedChecks.length === 0 && missingArtifacts.length === 0 && pendingMilestones.length === 0
    ? "RESULT | PASS | Phase 3 controlled-foundation and evidence artifacts are complete for review. Production readiness still requires owner GO / NO-GO."
    : failedChecks.length === 0
      ? "RESULT | WARN | Phase 3 controlled-foundation wiring is present, but evidence, UAT, deferred blocker review, or production blockers remain incomplete."
      : "RESULT | BLOCKED | Phase 3 controlled-foundation wiring is incomplete; fix failed checks before UAT readiness review.";

const lines = [
  "OGFI ERP Phase 3 controlled foundation status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  "",
  "This report is advisory. It does not execute UAT, resolve deferred blockers, approve production accounting use, settle AP, release payments, mutate bank balances, compute payroll, or mark any Release Readiness gate ready.",
  "",
  "Summary",
  `Foundation checks: ${checks.length}`,
  `Failed foundation checks: ${failedChecks.length}`,
  `Implemented backlog milestones: ${implementedMilestones.length}`,
  `Pending backlog milestones: ${pendingMilestones.length}`,
  `Deferred production blockers: ${deferredBlockerIds.length}`,
  `Missing evidence artifact groups: ${missingArtifacts.length}`,
  "",
  "Foundation Wiring Checks",
  ...checks.map((check) => `${check.pass ? "PASS" : "FAIL"} | ${check.name} | ${check.detail}`),
  "",
  "Deferred Production Blockers",
  "OWNER | severity=Critical | owner=Finance / Operations / Workforce / IT / QA | evidence=UAT disposition or formal waiver before production release-ready representation",
  ...(deferredBlockerIds.length > 0
    ? deferredBlockerIds.map((id) => `BLOCKER | ${id}`)
    : ["FAIL | No P3-BLOCK rows found in deferred blocker register."]),
  "",
  "Pending Backlog Milestones",
  "OWNER | severity=High | owner=Product Owner / Finance Owner / Workforce Owner / QA Lead | evidence=implemented control, tested path, UAT evidence, or formal deferred blocker link",
  ...(pendingMilestones.length > 0
    ? pendingMilestones.map((milestone) => `PENDING | ${milestone}`)
    : ["PASS | No Pending rows found in Phase 3 backlog."]),
  "",
  "Evidence Artifact Status",
  "OWNER | severity=High | owner=Release Manager / QA Lead / Enablement Owner | evidence=generated artifact from the matching release command and owner review",
  ...evidenceArtifacts.map((artifact) =>
    `${artifact.pass ? "PASS" : "MISSING"} | ${artifact.name} | ${artifact.detail}`,
  ),
  "",
  "Next Required Commands",
  "- pnpm release:phase3-status",
  "- pnpm release:uat-checklist",
  "- pnpm release:uat-status",
  "- pnpm release:pilot-uat-status",
  "- pnpm release:phase3-uat-checklist",
  "- pnpm release:phase3-uat-status",
  "- pnpm release:enablement-status",
  "- DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register",
  "- pnpm release:pending-evidence",
  "- pnpm release:go-no-go",
  "",
  result,
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Phase 3 status evidence written: ${outputFile}`);

function fileCheck(name, file) {
  return {
    name,
    pass: existsSync(file),
    detail: existsSync(file) ? file : `${file} missing`,
  };
}

function scriptCheck(name, scriptName) {
  return {
    name,
    pass: Boolean(scripts[scriptName]),
    detail: scripts[scriptName] ?? `${scriptName} missing from package.json`,
  };
}

function contentCheck(name, haystack, needle) {
  return {
    name,
    pass: haystack.includes(needle),
    detail: needle,
  };
}

function countCheck(name, pass, detail) {
  return { name, pass, detail };
}

function extractDeferredBlockerIds(markdown) {
  return Array.from(new Set(markdown.match(/P3-BLOCK-\d{3}/g) ?? [])).sort();
}

function extractPendingMilestones(markdown) {
  return extractMilestonesByStatus(markdown, "Pending");
}

function extractImplementedMilestones(markdown) {
  return extractMilestonesByStatus(markdown, "Implemented");
}

function extractMilestonesByStatus(markdown, status) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && line.includes(`| ${status} `))
    .map((line) => line.split("|")[1]?.trim())
    .filter(Boolean);
}

function artifactStatus(name, directory, pattern, requiredMarkers = []) {
  const directoryPath = join(evidenceRoot, directory);
  if (!existsSync(directoryPath)) {
    return {
      name,
      pass: false,
      detail: `${directoryPath} missing`,
    };
  }

  const matches = readdirSync(directoryPath)
    .filter((file) => pattern.test(file))
    .sort();
  if (matches.length === 0) {
    return {
      name,
      pass: false,
      detail: `${directoryPath}/${pattern} not found`,
    };
  }

  const latestFile = join(directoryPath, matches.at(-1));
  const latestContent = readFileSync(latestFile, "utf8");
  const missingMarkers = requiredMarkers.filter(
    (marker) => !latestContent.includes(marker),
  );
  if (missingMarkers.length > 0) {
    return {
      name,
      pass: false,
      detail: `${latestFile} missing marker(s): ${missingMarkers.join(", ")}`,
    };
  }

  return {
    name,
    pass: true,
    detail: latestFile,
  };
}
