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
const uatEvidenceFile =
  process.env.RELEASE_UAT_EVIDENCE_FILE ??
  "docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md";
const outputFile =
  process.env.RELEASE_UAT_CHECKLIST_OUTPUT_FILE ??
  join(evidenceRoot, "uat-checklist", `uat-execution-checklist-${timestamp}.txt`);

const checklist = [
  {
    owner: "QA Lead / Operations Lead",
    action: "Confirm pilot scope, selected company/brand/location, role set, and approved readiness thresholds.",
    command: "Review PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md and threshold overrides before execution.",
    artifact: "signed-documents/uat-evidence-pack.md after owner-approved copy is collected",
    acceptance: "Pilot scope and threshold decisions are recorded before scenario execution starts.",
  },
  {
    owner: "QA Lead / Release Manager",
    action: "Run pilot readiness preflight from the same shell that will run the DB-backed check.",
    command: "pnpm release:pilot-readiness-preflight",
    artifact: "pilot-readiness/pilot-readiness-preflight-*.txt",
    acceptance: "Preflight is PASS, or WARN is explicitly accepted before attempting DB-backed readiness.",
  },
  {
    owner: "QA Lead / Operations Lead",
    action: "Run DB-backed readiness against the selected pilot or staging database.",
    command: "DATABASE_URL=<pilot-or-staging-url> pnpm release:pilot-readiness",
    artifact: "pilot-readiness/pilot-readiness-*.txt",
    acceptance: "Must contain RESULT | PASS | Pilot setup is ready for UAT execution evidence capture.",
  },
  {
    owner: "QA Lead / Release Manager",
    action: "Rerun DB-backed readiness in strict release-gate mode before final review.",
    command: "DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness",
    artifact: "pilot-readiness/pilot-readiness-*.txt",
    acceptance:
      "Must contain requireReleaseGatesReady=true, DEC-0036 strict release gate status, and zero-count live security rows for Pending controlled access requests, Privileged users missing verified MFA evidence, Pending provider session invalidations, and Break-glass access open or post-review due.",
  },
  {
    owner: "QA Lead / Named Tester",
    action: "Execute every UAT scenario with real source records and screenshots/exports where required.",
    command: "Manual execution; record tester, role, environment, device/browser, timestamp, result, evidence reference, defect/waiver disposition, and owner signoff.",
    artifact: "signed-documents/uat-evidence-pack.md and referenced screenshots/exports/record IDs",
    acceptance: "Every row has a named tester, source record evidence, accepted result, and owner signoff.",
  },
  {
    owner: "QA Lead / Product Owner",
    action: "Review failures, blocked cases, waived cases, and deferred cases before release review.",
    command: "Record approved waiver or deferral ID in the defect/waiver field.",
    artifact: "signed-documents/uat-evidence-pack.md",
    acceptance: "No Fail, Blocked, or Not run rows remain; Waived or Deferred rows have approved disposition details.",
  },
  {
    owner: "QA Lead",
    action: "Refresh UAT status after evidence updates.",
    command: "pnpm release:uat-status",
    artifact: "uat-status/uat-status-*.txt",
    acceptance: "Must contain RESULT | PASS | UAT evidence pack has no unresolved execution placeholders.",
  },
  {
    owner: "QA Lead / Operations Lead",
    action: "Refresh combined pilot and UAT readiness after pilot setup or UAT evidence changes.",
    command: "pnpm release:pilot-uat-status",
    artifact: "pilot-uat-status/pilot-uat-status-*.txt",
    acceptance: "Must prove DB-backed pilot readiness, UAT status, recency, and evidence-run consistency.",
  },
  {
    owner: "Release Manager",
    action: "Generate signed evidence templates and copy only owner-approved UAT evidence into signed-documents.",
    command: "pnpm release:signed-evidence-templates",
    artifact: "signed-document-templates/uat-evidence-pack-template.md and signed-documents/uat-evidence-pack.md",
    acceptance: "Templates are not treated as signoff; signed-documents contains the approved copy.",
  },
];

const latestUatStatus = latestMatchingFile(
  join(evidenceRoot, "uat-status"),
  /^uat-status-.*\.txt$/,
);
const latestPilotUatStatus = latestMatchingFile(
  join(evidenceRoot, "pilot-uat-status"),
  /^pilot-uat-status-.*\.txt$/,
);

const lines = [
  "OGFI ERP Phase I / Phase 1.5 UAT execution checklist",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  `UAT evidence file: ${uatEvidenceFile}`,
  "",
  "This checklist is advisory. It does not execute UAT, create screenshots, approve waivers, collect owner signoff, or approve release.",
  "Use the same RELEASE_EVIDENCE_RUN_ID across pilot readiness, UAT status, pilot/UAT status, signed evidence, final manifest, and GO / NO-GO.",
  "",
  "Required UAT Evidence Fields",
  "FIELD | scope/session | company, brand, branch, warehouse, pilot DB fingerprint, evidence_run_id, environment, and date window",
  "FIELD | tester / role | legal name, user ID, and ERP role used for the scenario",
  "FIELD | environment | release environment, tenant/company/branch/warehouse scope, and evidence_run_id",
  "FIELD | device / browser | exact desktop/tablet/mobile client context and browser when applicable",
  "FIELD | execution date/time | local business time or UTC with timezone stated",
  "FIELD | result | Pass, Passed, Waived, or Deferred only when disposition is approved",
  "FIELD | evidence reference | immutable artifact path plus screenshot/export checksum, audit ID, or source record ID",
  "FIELD | defect / waiver | No defect, or approved defect/waiver/deferral ID with approver, date, and mitigation",
  "FIELD | owner signoff | owner name, role, date, decision, and evidence reference",
  "FIELD | security/scope checks | unauthorized actor, scoped denial evidence, and audit ID without exposing secrets",
  "FIELD | source-boundary checks | pre/post source record state references proving tracker or dashboard views did not mutate ERP source records",
  "FIELD | witness/reconciliation | reviewer initials and confirmation that evidence artifact exists, is accessible, and belongs to the same run/environment",
  "",
  "UAT Execution Steps",
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
  "Latest UAT Status",
  ...latestStatusLines("uat-status", latestUatStatus),
  "",
  "Latest Pilot/UAT Status",
  ...latestStatusLines("pilot-uat-status", latestPilotUatStatus),
  "",
  "RESULT | ACTION REQUIRED | Execute real UAT and collect owner-approved evidence before final release review.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`UAT execution checklist written: ${outputFile}`);

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
        line.startsWith("SKIP |"),
    )
    .slice(0, 14);

  return [
    `STATUS | ${relativePath}`,
    ...(statusLines.length > 0
      ? statusLines.map((line) => `SNAPSHOT | ${line}`)
      : ["STATUS | no result lines found"]),
  ];
}
