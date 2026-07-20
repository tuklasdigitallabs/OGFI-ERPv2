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
const trainingFile =
  process.env.RELEASE_TRAINING_EVIDENCE_FILE ??
  "docs/core/08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md";
const phase3TrainingFile =
  process.env.RELEASE_PHASE3_TRAINING_FILE ??
  "docs/training/phase-3-finance-workforce-controlled-foundation-quick-start.md";
const hypercareFile =
  process.env.RELEASE_HYPERCARE_EVIDENCE_FILE ??
  "docs/core/07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md";
const outputFile =
  process.env.RELEASE_ENABLEMENT_CHECKLIST_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "enablement-checklist",
    `enablement-checklist-${timestamp}.txt`,
  );

const checklist = [
  {
    owner: "Enablement Owner / Operations Owner",
    action: "Confirm the training audience, selected locations, role coverage, material versions, trainer, and session schedule.",
    command: "Review the training impact assessment and role quick-start materials before pilot sessions.",
    artifact: "signed-documents/training-impact-assessment.md after owner-approved copy is collected",
    acceptance: "Every pilot role has a planned session, assigned trainer, material version, date/time, and attendance evidence path.",
  },
  {
    owner: "Enablement Owner / Trainer",
    action: "Record real attendance and material coverage for every role group.",
    command: "Manual execution; record session date/time, trainer, attendees/roles, material covered, evidence reference, signoff by, and signoff date.",
    artifact: "training attendance sheet, meeting record, screenshot, or signed training assessment reference",
    acceptance: "No training row relies on Pending/TBD placeholders or generic attendee names.",
  },
  {
    owner: "Enablement Owner / Product Owner",
    action: "Capture known-limit acknowledgement before GO review.",
    command: "Record each known limitation, operational workaround, acknowledgement owner, decision, date, and follow-up action.",
    artifact: "signed-documents/training-impact-assessment.md or approved external evidence reference",
    acceptance: "Users acknowledge source-record boundaries, deferred workflows, no queueing promise, attachment limits, and safe workarounds.",
  },
  {
    owner: "Enablement Owner / Finance Owner / Workforce Owner",
    action: "Run Phase 3 finance and workforce controlled-foundation training before Phase 3 UAT signoff.",
    command: "Review phase-3-finance-workforce-controlled-foundation-quick-start.md with finance, branch cash, workforce, approver, administrator, and UAT tester audiences.",
    artifact: "signed-documents/training-impact-assessment.md plus Phase 3 attendance or approved external evidence reference",
    acceptance: "Participants can identify Phase 3 finance foundation, workforce foundation, and deferred blocker review evidence paths, and understand no AP settlement, bank mutation, payroll computation, or production go-live is implied.",
  },
  {
    owner: "Release Manager / Operations Owner",
    action: "Name hypercare owners, backups, support routes, escalation path, support hours, and decision scope.",
    command: "Update pilot hypercare runbook role rows with explicit owner details.",
    artifact: "docs/core/07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md or signed external copy",
    acceptance: "Each required pilot role has owner, backup, contact route, confirmed status, evidence reference, and updated-at value.",
  },
  {
    owner: "Operations Owner / QA Lead",
    action: "Record daily hypercare review evidence for operational and security control areas.",
    command: "Manual daily review; record date, area, evidence reference, owner, result, issue/defect link, and next action.",
    artifact: "hypercare daily review log, defect register, or approved project tracker reference",
    acceptance: "Daily rows show accepted results or tracked defects; vague Reviewed/Pending values do not clear readiness.",
  },
  {
    owner: "QA Lead / Product Owner",
    action: "Disposition defects, waivers, deferred items, and user confusion before owner signoff.",
    command: "Record severity, business impact, owner, mitigation, due date, retest evidence, and release decision.",
    artifact: "defect register, UAT evidence pack, or hypercare runbook evidence reference",
    acceptance: "No blocker or critical defect remains unresolved; major/minor waivers have owner, expiry, and safe workaround.",
  },
  {
    owner: "Enablement Owner / Release Manager",
    action: "Refresh enablement status after training or hypercare evidence changes.",
    command: "pnpm release:enablement-status",
    artifact: "enablement-status/enablement-status-*.txt",
    acceptance: "Must contain RESULT | PASS | Enablement, training, and hypercare evidence has no unresolved placeholders.",
  },
  {
    owner: "Release Manager / Product Owner",
    action: "Generate signoff templates and copy only owner-approved training evidence into signed-documents.",
    command: "pnpm release:signed-evidence-templates && pnpm release:signed-evidence-status",
    artifact: "signed-document-templates/training-impact-assessment-template.md and signed-documents/training-impact-assessment.md",
    acceptance: "Templates are not treated as signoff; signed evidence status passes with the same evidence run ID.",
  },
  {
    owner: "Release Manager",
    action: "Refresh the final evidence manifest after source evidence, signed documents, and external-security proof references are complete.",
    command: "pnpm release:evidence:manifest",
    artifact: "manifests/release-evidence-manifest-*.txt",
    acceptance: "Manifest includes checksums for enablement status, signed training evidence, and final owner signoff documents.",
  },
];

const latestEnablementStatus = latestMatchingFile(
  join(evidenceRoot, "enablement-status"),
  /^enablement-status-.*\.txt$/,
);
const latestSignedEvidenceStatus = latestMatchingFile(
  join(evidenceRoot, "signed-evidence-status"),
  /^signed-evidence-status-.*\.txt$/,
);

const lines = [
  "OGFI ERP Phase I / Phase 1.5 enablement evidence checklist",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  `Training evidence file: ${trainingFile}`,
  `Phase 3 training quick-start: ${phase3TrainingFile}`,
  `Hypercare evidence file: ${hypercareFile}`,
  "",
  "This checklist is advisory. It does not conduct training, collect attendance, sign owner approvals, close hypercare, approve waivers, or approve release.",
  "Use the same RELEASE_EVIDENCE_RUN_ID across training evidence, hypercare status, signed evidence, final manifest, final review, and GO / NO-GO.",
  "",
  "Required Enablement Evidence Fields",
  "FIELD | training scope | audience, role, company, branch/location, material version, trainer, session date/time, and evidence_run_id",
  "FIELD | attendance | legal participant names or roster ID, ERP roles, location, completion status, and attendance evidence reference",
  "FIELD | material coverage | quick-start or KB article versions used, scenarios practiced, and known limits reviewed",
  "FIELD | known limits | limitation, operational workaround, acknowledgement owner, decision, date, and follow-up action",
  "FIELD | hypercare roles | named owner, backup, contact route, support hours, decision scope, confirmation, evidence reference, and updated-at date",
  "FIELD | daily hypercare | date, area, evidence reference, owner, accepted result, defect/support link, and next action",
  "FIELD | defect / waiver | severity, business impact, workaround, owner, disposition, due date, retest evidence, and release decision",
  "FIELD | signoff | owner name, role, date, decision, evidence reference, and matching evidence_run_id",
  "FIELD | final integrity | final manifest checksum lines and owner confirmation that source evidence was not edited after manifest generation",
  "",
  "Phase 3 Enablement Coverage",
  "COVERAGE | Phase 3 finance controlled foundation | train finance users, branch cash custodians, approvers, administrators, auditors, and UAT testers on controlled foundation boundaries and evidence capture",
  "COVERAGE | Phase 3 workforce controlled foundation | train workforce managers, approvers, administrators, auditors, and UAT testers on scoped employee, assignment, schedule, leave, overtime, attendance, and export controls",
  "COVERAGE | Phase 3 deferred blocker review | train owners to record blocker disposition without representing production blockers as solved unless completed or formally waived",
  "",
  "Enablement Evidence Steps",
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
  "Latest Enablement Status",
  ...latestStatusLines("enablement-status", latestEnablementStatus),
  "",
  "Latest Signed Evidence Status",
  ...latestStatusLines("signed-evidence-status", latestSignedEvidenceStatus),
  "",
  "RESULT | ACTION REQUIRED | Collect real training attendance, known-limit acknowledgement, hypercare owner, daily review, signed evidence, and manifest integrity proof before final release review.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Enablement evidence checklist written: ${outputFile}`);

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
  const matchingLines = content
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
    );
  const resultLine = matchingLines
    .filter((line) => line.startsWith("RESULT |"))
    .at(-1);
  const statusLines = matchingLines.slice(0, 13);

  if (resultLine && !statusLines.includes(resultLine)) {
    statusLines.push(resultLine);
  }

  return [
    `STATUS | ${relativePath}`,
    ...(statusLines.length > 0
      ? statusLines.map((line) => `SNAPSHOT | ${line}`)
      : ["STATUS | no result lines found"]),
  ];
}
