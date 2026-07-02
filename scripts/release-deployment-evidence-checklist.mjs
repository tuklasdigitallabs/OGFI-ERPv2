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
const deploymentFile =
  process.env.RELEASE_DEPLOYMENT_EVIDENCE_FILE ??
  "docs/core/07-quality/PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md";
const outputFile =
  process.env.RELEASE_DEPLOYMENT_CHECKLIST_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "deployment-checklist",
    `deployment-evidence-checklist-${timestamp}.txt`,
  );

const checklist = [
  {
    owner: "Release Manager",
    action: "Confirm release candidate metadata before any final evidence collection.",
    command: "pnpm release:metadata-session-lock && pnpm release:summary-preflight",
    artifact: "release-metadata/release-session-lock-*.txt and release-summary-preflight-*.txt",
    acceptance: "Release version, run ID, commit SHA, environment, migration mode, evidence run ID, and evidence root are approved.",
  },
  {
    owner: "Release Manager / DevOps Owner",
    action: "Capture release candidate summary from the approved build or staging rehearsal.",
    command: "pnpm release:summary",
    artifact: "release-summary.txt",
    acceptance: "Summary includes evidence_run_id, release version, commit/run metadata, environment, migration mode, and RESULT | PASS.",
  },
  {
    owner: "DevOps Owner / Security Owner",
    action: "Record environment separation and runtime exposure review.",
    command: "Manual review of staging/production domains, env files, databases, storage, secrets, public ports, and container privileges.",
    artifact: "deployment checklist signed row, infrastructure review note, or approved change record",
    acceptance: "Staging and production are separated; secrets are not exposed; non-public services remain private.",
  },
  {
    owner: "Release Manager / DevOps Owner",
    action: "Attach staging release rehearsal workflow proof.",
    command: "Run the approved staging release rehearsal workflow or attach the equivalent CI/CD job.",
    artifact: "workflow run ID, commit SHA, deploy log, migration log, data snapshot references, backup/restore references, and result",
    acceptance: "Workflow evidence belongs to the same release candidate and does not expose raw secrets or database URLs.",
  },
  {
    owner: "Release Manager / DevOps Owner",
    action: "Attach staging rollback rehearsal proof.",
    command: "pnpm release:rollback-summary after approved rollback rehearsal metadata is available.",
    artifact: "staging-rollback/rollback-summary.txt",
    acceptance: "Rollback summary contains evidence_run_id, rollback release version, run ID, commit SHA, verified timestamp, and RESULT | PASS.",
  },
  {
    owner: "DevOps Owner / QA Lead",
    action: "Run release smoke against the selected staging or pilot URL.",
    command: "SMOKE_BASE_URL=<base-url> pnpm release:smoke",
    artifact: "smoke/smoke-*.txt",
    acceptance: "Smoke proves health, readiness, protected route redirect behavior, and any configured app route checks.",
  },
  {
    owner: "QA Lead / Workflow Owners",
    action: "Attach operational smoke proof for source-record workflows.",
    command: "Manual smoke execution; record source IDs, actors, scope, result, evidence reference, and audit IDs.",
    artifact: "deployment checklist focused smoke rows or approved UAT evidence references",
    acceptance: "Purchasing, receiving, inventory, transfer, wastage/adjustment, dashboard/report/export, permission denial, and project tracker smoke are covered where in release scope.",
  },
  {
    owner: "Release Manager / Operations Owner",
    action: "Confirm monitoring, support contacts, triage cadence, escalation path, and rollback decision owner.",
    command: "Update hypercare/support readiness rows and run pnpm release:deployment-status.",
    artifact: "deployment-status/deployment-status-*.txt and hypercare/support evidence reference",
    acceptance: "Support route, support hours, owner/backups, defect intake, daily triage, communication plan, and rollback authority are named.",
  },
  {
    owner: "Product Owner / Release Manager",
    action: "Collect explicit deployment signoff decisions from required owners.",
    command: "Copy the owner-approved deployment evidence document into signed-documents or set RELEASE_DEPLOYMENT_EVIDENCE_FILE.",
    artifact: "signed-documents/deployment-rollback-evidence.md",
    acceptance: "Each signoff includes owner name, role, date, explicit decision, notes, evidence reference, and matching evidence run ID.",
  },
  {
    owner: "Release Manager",
    action: "Refresh deployment status and final manifest only after source evidence and signed documents are complete.",
    command: "pnpm release:deployment-status && pnpm release:evidence:manifest",
    artifact: "deployment-status/deployment-status-*.txt and manifests/release-evidence-manifest-*.txt",
    acceptance: "Deployment status passes, and the manifest includes checksums for deployment status, signed deployment evidence, smoke, rollback, and source artifacts.",
  },
];

const latestDeploymentStatus = latestMatchingFile(
  join(evidenceRoot, "deployment-status"),
  /^deployment-status-.*\.txt$/,
);
const latestBackupRestoreStatus = latestMatchingFile(
  join(evidenceRoot, "backup-restore-status"),
  /^backup-restore-status-.*\.txt$/,
);

const lines = [
  "OGFI ERP Phase I / Phase 1.5 deployment evidence checklist",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  `Deployment evidence file: ${deploymentFile}`,
  "",
  "This checklist is advisory. It does not deploy, apply migrations, create backups, restore databases, run rollback, run smoke tests, sign evidence, or approve release.",
  "Use the same RELEASE_EVIDENCE_RUN_ID across deployment status, backup/restore status, smoke, signed evidence, final manifest, final review, and GO / NO-GO.",
  "",
  "Required Deployment Evidence Fields",
  "FIELD | release candidate | release version, run ID, commit SHA, migration mode, deployment environment, evidence_run_id, and generated summary",
  "FIELD | environment separation | domains, databases, storage, env files, secrets, private services, exposed ports, and container hardening review",
  "FIELD | staging release proof | workflow/job ID, actor, environment, UTC start/end, migration output, data snapshot references, and result",
  "FIELD | rollback proof | rollback release version, workflow/job ID, actor, environment, UTC start/end, smoke evidence, and rollback decision owner",
  "FIELD | smoke proof | base URL, health/readiness output, protected-route behavior, source workflow IDs, audit IDs, and result",
  "FIELD | monitoring/support | support window, contacts, backups, defect route, triage cadence, escalation path, communication plan, and rollback authority",
  "FIELD | signoff | owner name, role, date, explicit release decision, notes, evidence reference, and matching evidence_run_id",
  "FIELD | final integrity | focused status PASS markers, signed evidence copy, final manifest checksum lines, and owner confirmation no source evidence changed after manifest",
  "",
  "Deployment Evidence Steps",
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
  "Latest Deployment Status",
  ...latestStatusLines("deployment-status", latestDeploymentStatus),
  "",
  "Latest Backup/Restore Status",
  ...latestStatusLines("backup-restore-status", latestBackupRestoreStatus),
  "",
  "RESULT | ACTION REQUIRED | Collect real deployment, staging rehearsal, rollback, smoke, monitoring, signoff, and manifest integrity proof before final release review.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Deployment evidence checklist written: ${outputFile}`);

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
