import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const outputFile =
  process.env.RELEASE_INTERIM_REVIEW_OUTPUT_FILE ??
  join(evidenceRoot, "interim-review", `interim-review-${timestamp}.txt`);
const skipSelfTest = process.env.RELEASE_INTERIM_SKIP_SELF_TEST === "1";

const commands = [
  ...(skipSelfTest
    ? []
    : [["Local release helper self-test", "scripts/release-tools-self-test.mjs"]]),
  ["UAT evidence status", "scripts/release-uat-status.mjs"],
  ["Deployment and rollback status", "scripts/release-deployment-status.mjs"],
  ["Enablement and hypercare status", "scripts/release-enablement-status.mjs"],
  ["Backup, restore, and rollback status", "scripts/release-backup-restore-status.mjs"],
  ["Signed evidence templates", "scripts/release-signed-evidence-templates.mjs"],
  ["Pending evidence checklist", "scripts/release-pending-evidence-checklist.mjs"],
];

const lines = [
  "OGFI ERP Phase I / Phase 1.5 interim release review",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "Review mode: INTERIM",
  "EVIDENCE_TIER | LOCAL",
  "",
  "This report lets local generated artifacts support interim review only. It does not execute pilot UAT, restore a database, approve rollback readiness, approve training, create signed evidence, or replace final GO / NO-GO review.",
  "Final signed UAT, deployment/rollback, and training evidence remain final-only gates and are intentionally deferred in this interim lane.",
  "",
  "INTERIM COMMANDS",
];

let failed = false;

if (skipSelfTest) {
  lines.push(
    "INFO | Local release helper self-test skipped because RELEASE_INTERIM_SKIP_SELF_TEST=1.",
  );
}

for (const [label, scriptPath] of commands) {
  lines.push(`COMMAND | ${label} | node ${scriptPath}`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RELEASE_EVIDENCE_ROOT: evidenceRoot,
      RELEASE_EVIDENCE_RUN_ID: runId,
    },
    encoding: "utf8",
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  lines.push(`EXIT | ${result.status ?? "unknown"}`);

  const resultLine = latestLine(output, (line) => line.startsWith("RESULT |"));
  if (resultLine) {
    lines.push(resultLine);
  }

  for (const blockerLine of firstMatchingLines(output, isOwnerOrBlockerLine, 6)) {
    lines.push(`LOCAL_STATUS | ${blockerLine}`);
  }

  if (result.status !== 0) {
    failed = true;
    lines.push(`ERROR | ${scriptPath} exited with ${result.status}`);
  }

  lines.push("");
}

lines.push(
  "FINAL_ONLY | DEFERRED | Signed UAT evidence, signed deployment/rollback evidence, signed training assessment, final manifest freshness, final-review status, and GO / NO-GO remain required before release approval.",
  "NEXT | Use this interim artifact for technical review and client walkthrough preparation. Collect real external evidence later, regenerate the manifest, then run pnpm release:final-review-status and pnpm release:go-no-go.",
  "",
  failed
    ? "RESULT | BLOCKED | One or more local interim review commands failed to run."
    : "RESULT | CONDITIONAL GO | Local interim evidence refreshed; final external evidence and signed owner approval remain pending.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Interim review evidence written: ${outputFile}`);

if (failed) {
  process.exitCode = 1;
}

function latestLine(output, predicate) {
  return output
    .split(/\r?\n/)
    .filter((line) => predicate(line.trim()))
    .at(-1);
}

function firstMatchingLines(output, predicate, limit) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(predicate)
    .slice(0, limit);
}

function isOwnerOrBlockerLine(line) {
  return (
    line.startsWith("OWNER |") ||
    line.startsWith("BLOCKED |") ||
    line.startsWith("BLOCKER |") ||
    line.startsWith("WARN |") ||
    line.startsWith("FAIL |")
  );
}
