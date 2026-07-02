import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputFile =
  process.env.RELEASE_STATUS_SUITE_OUTPUT_FILE ??
  join(evidenceRoot, "status-suite", `status-suite-${timestamp}.txt`);
const strictMode = process.env.RELEASE_STATUS_SUITE_STRICT === "1";
const reviewMode =
  process.env.RELEASE_REVIEW_MODE === "interim" ? "interim" : "final";

const finalScripts = [
  ["Release metadata worksheet", "scripts/release-metadata-worksheet.mjs"],
  ["Release metadata environment template", "scripts/release-metadata-env-template.mjs"],
  ["Release metadata session lock", "scripts/release-metadata-session-lock.mjs"],
  ["Data snapshot evidence checklist", "scripts/release-data-snapshot-checklist.mjs"],
  ["Data snapshot status", "scripts/release-data-snapshot-status.mjs"],
  ["Backup, restore, and rollback status", "scripts/release-backup-restore-status.mjs"],
  ["Recovery evidence checklist", "scripts/release-recovery-evidence-checklist.mjs"],
  ["Deployment evidence checklist", "scripts/release-deployment-evidence-checklist.mjs"],
  ["Deployment and rollback status", "scripts/release-deployment-status.mjs"],
  ["UAT execution checklist", "scripts/release-uat-execution-checklist.mjs"],
  ["UAT evidence status", "scripts/release-uat-status.mjs"],
  ["Pilot and UAT readiness status", "scripts/release-pilot-uat-status.mjs"],
  ["Enablement evidence checklist", "scripts/release-enablement-checklist.mjs"],
  ["Enablement and hypercare status", "scripts/release-enablement-status.mjs"],
  ["Signed evidence templates", "scripts/release-signed-evidence-templates.mjs"],
  ["Signed evidence checklist", "scripts/release-signed-evidence-checklist.mjs"],
  ["Signed evidence status", "scripts/release-signed-evidence-status.mjs"],
  ["Final-review readiness status", "scripts/release-final-review-status.mjs"],
  ["GO / NO-GO evidence summary", "scripts/release-go-no-go.mjs"],
  ["External evidence collection guide", "scripts/release-external-evidence-guide.mjs"],
  ["External evidence rehearsal command plan", "scripts/release-rehearsal-command-plan.mjs"],
  ["Pending evidence checklist", "scripts/release-pending-evidence-checklist.mjs"],
  ["Milestone status", "scripts/release-milestone-status.mjs"],
  ["Blocker digest", "scripts/release-blocker-digest.mjs"],
];

const interimScripts = [
  ["Release metadata worksheet", "scripts/release-metadata-worksheet.mjs"],
  ["Release metadata environment template", "scripts/release-metadata-env-template.mjs"],
  ["Release metadata session lock", "scripts/release-metadata-session-lock.mjs"],
  ["Data snapshot evidence checklist", "scripts/release-data-snapshot-checklist.mjs"],
  ["Data snapshot status", "scripts/release-data-snapshot-status.mjs"],
  ["Backup, restore, and rollback status", "scripts/release-backup-restore-status.mjs"],
  ["Recovery evidence checklist", "scripts/release-recovery-evidence-checklist.mjs"],
  ["Deployment evidence checklist", "scripts/release-deployment-evidence-checklist.mjs"],
  ["Deployment and rollback status", "scripts/release-deployment-status.mjs"],
  ["UAT execution checklist", "scripts/release-uat-execution-checklist.mjs"],
  ["UAT evidence status", "scripts/release-uat-status.mjs"],
  ["Pilot and UAT readiness status", "scripts/release-pilot-uat-status.mjs"],
  ["Enablement evidence checklist", "scripts/release-enablement-checklist.mjs"],
  ["Enablement and hypercare status", "scripts/release-enablement-status.mjs"],
  ["Signed evidence templates", "scripts/release-signed-evidence-templates.mjs"],
  ["Signed evidence checklist", "scripts/release-signed-evidence-checklist.mjs"],
  ["External evidence collection guide", "scripts/release-external-evidence-guide.mjs"],
  ["External evidence rehearsal command plan", "scripts/release-rehearsal-command-plan.mjs"],
  ["Pending evidence checklist", "scripts/release-pending-evidence-checklist.mjs"],
  ["Interim release review", "scripts/release-interim-review.mjs"],
  ["Milestone status", "scripts/release-milestone-status.mjs"],
  ["Blocker digest", "scripts/release-blocker-digest.mjs"],
];

const scripts = reviewMode === "interim" ? interimScripts : finalScripts;

const lines = [
  "OGFI ERP Phase I / Phase 1.5 release status suite",
  `Generated UTC: ${timestamp}`,
  `Evidence root: ${evidenceRoot}`,
  `Review mode: ${reviewMode}`,
  `Strict mode: ${strictMode ? "enabled" : "disabled"}`,
  "",
  "This suite refreshes advisory status reports only. It does not create source evidence, execute UAT, approve release, or replace GO / NO-GO review.",
  reviewMode === "interim"
    ? "Final-only signed evidence status, final-review, and GO / NO-GO checks are skipped in interim mode; run the default suite for final release readiness."
    : "The final evidence manifest is intentionally not regenerated here; refresh it only after source evidence and signed documents are complete, then rerun final-review and GO / NO-GO checks.",
  "",
];
let failed = false;
let strictFailed = false;

for (const [label, scriptPath] of scripts) {
  lines.push(`COMMAND | ${label} | node ${scriptPath}`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: { ...process.env, RELEASE_EVIDENCE_ROOT: evidenceRoot },
    encoding: "utf8",
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  lines.push(`EXIT | ${result.status ?? "unknown"}`);

  const resultLine = output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("RESULT |"))
    .at(-1);
  if (resultLine) {
    lines.push(resultLine);
    if (strictMode && isStrictFailure(label, resultLine)) {
      strictFailed = true;
      lines.push(`STRICT | FAIL | ${label} is not release-ready.`);
    }
  }

  if (result.status !== 0) {
    failed = true;
    lines.push(`ERROR | ${scriptPath} exited with ${result.status}`);
  }

  lines.push("");
}

lines.push(
  "MANIFEST | NOT REFRESHED | Run pnpm release:evidence:manifest after final evidence collection, then rerun pnpm release:final-review-status and pnpm release:go-no-go.",
  "",
  failed
    ? "RESULT | FAIL | One or more release status commands failed to run."
    : strictFailed
      ? "RESULT | FAIL | Strict release readiness checks are not passing."
      : "RESULT | PASS | Release status suite refreshed advisory reports.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Release status suite written: ${outputFile}`);

if (failed || strictFailed) {
  process.exitCode = 1;
}

function isStrictFailure(label, resultLine) {
  if (
    label === "Final-review readiness status" &&
    !resultLine.startsWith("RESULT | PASS")
  ) {
    return true;
  }

  if (
    label === "GO / NO-GO evidence summary" &&
    !resultLine.startsWith("RESULT | GO")
  ) {
    return true;
  }

  return false;
}
