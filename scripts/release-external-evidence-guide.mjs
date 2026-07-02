import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { databaseUrlFingerprint, evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const outputFile =
  process.env.RELEASE_EXTERNAL_EVIDENCE_GUIDE_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "external-evidence-guide",
    `external-evidence-guide-${timestamp}.txt`,
  );

const environmentLines = [
  envStatus("RELEASE_EVIDENCE_RUN_ID", process.env.RELEASE_EVIDENCE_RUN_ID),
  envStatus("RELEASE_VERSION", process.env.RELEASE_VERSION),
  envStatus("GITHUB_RUN_ID", process.env.GITHUB_RUN_ID),
  envStatus("GITHUB_SHA", process.env.GITHUB_SHA),
  envStatus("DATABASE_URL", process.env.DATABASE_URL, {
    detail: `fingerprint=${databaseUrlFingerprint(process.env.DATABASE_URL)}`,
  }),
  envStatus("RESTORE_DATABASE_URL", process.env.RESTORE_DATABASE_URL, {
    detail: `fingerprint=${databaseUrlFingerprint(process.env.RESTORE_DATABASE_URL)}`,
  }),
  envStatus("RESTORE_DATABASE", process.env.RESTORE_DATABASE),
  envStatus("SMOKE_BASE_URL", process.env.SMOKE_BASE_URL),
  envStatus("RELEASE_UAT_EVIDENCE_FILE", process.env.RELEASE_UAT_EVIDENCE_FILE),
  envStatus(
    "RELEASE_DEPLOYMENT_EVIDENCE_FILE",
    process.env.RELEASE_DEPLOYMENT_EVIDENCE_FILE,
  ),
  envStatus(
    "RELEASE_TRAINING_EVIDENCE_FILE",
    process.env.RELEASE_TRAINING_EVIDENCE_FILE,
  ),
];

const collectionGroups = [
  group(
    "Local framework and advisory evidence",
    "Release Manager",
    [
      "pnpm release:evidence:init",
      "pnpm release:metadata-worksheet",
      "pnpm release:metadata-env-template",
      "pnpm release:rehearsal-plan",
      "pnpm release:summary-preflight",
      "pnpm release:build-check",
      "pnpm release:secret-review",
      "pnpm release:tools:test",
      "pnpm release:status-suite",
      "pnpm release:status-suite:strict",
      "pnpm release:pending-evidence",
      "pnpm release:blocker-digest",
    ],
    [
      "release-evidence/COLLECTION_README.txt",
      "release-evidence/release-metadata/release-metadata-worksheet-*.txt",
      "release-evidence/release-metadata/release-env-template-*.txt",
      "release-evidence/rehearsal-command-plan/rehearsal-command-plan-*.txt",
      "release-evidence/status-suite/status-suite-*.txt",
      "release-evidence/pending-evidence-checklist/pending-evidence-checklist-*.txt",
    ],
    "These commands prepare the packet and summarize gaps. They do not prove UAT, restore, deployment, or approval.",
  ),
  group(
    "Migration and data snapshot rehearsal",
    "DBA / Platform Engineering",
    [
      "pnpm release:data-snapshot-preflight",
      "pnpm release:data-snapshot",
      "pnpm release:data-snapshot:compare-latest",
      "pnpm release:data-snapshot-status",
    ],
    [
      "release-evidence/data-snapshots/data-pre-migration-rehearsal-*.txt",
      "release-evidence/data-snapshots/data-post-migration-rehearsal-*.txt",
      "release-evidence/data-snapshots/data-snapshot-delta-*.txt",
      "release-evidence/data-snapshot-status/data-snapshot-status-*.txt",
    ],
    "Run this against the selected rehearsal database before and after the reviewed migration step.",
  ),
  group(
    "Backup, restore, rollback, and smoke",
    "DevOps Owner / Release Manager",
    [
      "pnpm release:backup-restore-preflight",
      "pnpm db:backup",
      "pnpm release:backup-summary",
      "pnpm db:restore-check",
      "pnpm release:restore-summary",
      "pnpm release:rollback-summary",
      "SMOKE_OUTPUT_DIR=release-evidence/staging-rollback/smoke pnpm release:smoke",
      "pnpm release:backup-restore-status",
      "pnpm release:deployment-status",
    ],
    [
      "release-evidence/backups/ogfi-erp-*.dump",
      "release-evidence/backups/ogfi-erp-*.dump.sha256",
      "release-evidence/backups/backup-summary.txt",
      "release-evidence/backups/restore-check-summary.txt",
      "release-evidence/staging-rollback/rollback-summary.txt",
      "release-evidence/staging-rollback/smoke/smoke-*.txt",
      "release-evidence/deployment-status/deployment-status-*.txt",
    ],
    "Use an isolated restore database. Do not restore into production unless an explicit emergency procedure authorizes it.",
  ),
  group(
    "Pilot readiness, UAT, training, and signatures",
    "QA Lead / Operations Lead / Enablement Owner",
    [
      "pnpm release:pilot-readiness-preflight",
      "pnpm release:pilot-readiness",
      "pnpm release:uat-status",
      "pnpm release:pilot-uat-status",
      "pnpm release:enablement-status",
      "pnpm release:signed-evidence-templates",
      "pnpm release:signed-evidence-status",
    ],
    [
      "release-evidence/pilot-readiness/pilot-readiness-*.txt",
      "release-evidence/uat-status/uat-status-*.txt",
      "release-evidence/pilot-uat-status/pilot-uat-status-*.txt",
      "release-evidence/enablement-status/enablement-status-*.txt",
      "release-evidence/signed-document-templates/*-template.md",
      "release-evidence/signed-documents/uat-evidence-pack.md",
      "release-evidence/signed-documents/deployment-rollback-evidence.md",
      "release-evidence/signed-documents/training-impact-assessment.md",
    ],
    "Named users must execute UAT and sign evidence. Status scripts only validate the completed documents.",
  ),
  group(
    "Final review",
    "Release Manager / Product Owner",
    [
      "pnpm release:summary",
      "pnpm release:evidence:manifest",
      "pnpm release:final-review-status",
      "pnpm release:go-no-go",
      "pnpm release:milestones",
    ],
    [
      "release-evidence/release-summary.txt",
      "release-evidence/manifests/release-evidence-manifest-*.txt",
      "release-evidence/final-review-status/final-review-status-*.txt",
      "release-evidence/go-no-go/go-no-go-*.txt",
      "release-evidence/milestones/milestone-status-*.txt",
    ],
    "Generate the manifest only after the final evidence bundle is complete, then rerun final review and GO / NO-GO.",
  ),
];

const lines = [
  "OGFI ERP Phase I / Phase 1.5 external evidence collection guide",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This guide does not create source evidence, execute UAT, deploy, restore databases, sign documents, or approve release.",
  "It records the current collection context and the ordered commands needed to package real external evidence.",
  "",
  "Environment Context",
  ...environmentLines,
  "",
  "Collection Groups",
  ...collectionGroups.flatMap(formatGroup),
  "Non-Fabrication Boundary",
  "EXTERNAL | Migration rehearsal | requires real pre/post database snapshots and reviewed delta.",
  "EXTERNAL | Backup restore | requires real dump, checksum, isolated restore, rollback summary, and post-rollback smoke.",
  "EXTERNAL | UAT | requires named testers, dates, source records, results, defects or waivers, and signoff.",
  "EXTERNAL | Training and hypercare | requires attendance, acknowledgement, daily checks, and owners.",
  "EXTERNAL | Signoff | requires approved signed documents with matching Evidence run ID.",
  "",
  "Final Check",
  "Run pnpm release:status-suite to refresh advisory status after external evidence is copied in.",
  "Run pnpm release:status-suite:strict as the final CI-style readiness gate; it must exit successfully before release signoff.",
  "Run pnpm release:rehearsal-plan when external owners need a command-by-command execution sequence for migration, backup, restore, rollback, smoke, UAT, and final gates.",
  "Run pnpm release:evidence:manifest only after the evidence bundle is complete.",
  "Run pnpm release:go-no-go last. A GO result must come from the gate scripts, not from this guide.",
  "",
  "RESULT | PASS | External evidence collection guide generated.",
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`External evidence collection guide written: ${outputFile}`);

function group(title, owner, commands, artifacts, boundary) {
  return { title, owner, commands, artifacts, boundary };
}

function formatGroup(item) {
  return [
    `GROUP | ${item.title}`,
    `OWNER | ${item.owner}`,
    `BOUNDARY | ${item.boundary}`,
    ...item.commands.map((command) => `COMMAND | ${command}`),
    ...item.artifacts.map((artifact) => `ARTIFACT | ${artifact}`),
    "",
  ];
}

function envStatus(name, value, options = {}) {
  const state = value ? "configured" : "missing";
  const detail = options.detail ? ` | ${options.detail}` : "";
  return `ENV | ${name} | ${state}${detail}`;
}
