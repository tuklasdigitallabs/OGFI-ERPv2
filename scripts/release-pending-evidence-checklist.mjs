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
  process.env.RELEASE_PENDING_EVIDENCE_CHECKLIST_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "pending-evidence-checklist",
    `pending-evidence-checklist-${timestamp}.txt`,
  );

const groups = [
  {
    gate: "Data snapshot and migration safety evidence",
    severity: "Critical",
    owner: "DBA / Platform Engineering",
    commands: [
      "pnpm release:rehearsal-plan",
      "pnpm release:data-snapshot-checklist",
      "pnpm release:data-snapshot-preflight",
      "pnpm release:data-snapshot",
      "pnpm release:data-snapshot:compare-latest",
      "pnpm release:data-snapshot-status",
    ],
    steps: [
      "Run pnpm release:rehearsal-plan if the DBA or platform owner needs the full command sequence for this evidence session.",
      "Run pnpm release:data-snapshot-checklist to produce the owner-facing DBA migration snapshot checklist and latest status snapshot.",
      "Run pnpm release:data-snapshot-preflight against the selected rehearsal database.",
      "Capture the pre-migration snapshot with label pre-migration-rehearsal.",
      "Apply the reviewed migration or release candidate changes in the rehearsal environment.",
      "Capture the post-migration snapshot with label post-migration-rehearsal.",
      "Run pnpm release:data-snapshot:compare-latest and review the generated delta.",
      "Rerun pnpm release:data-snapshot-status and attach the latest status artifact.",
    ],
    artifacts: [
      "data-snapshots/data-snapshot-preflight-*.txt",
      "data-snapshots/data-pre-migration-rehearsal-*.txt",
      "data-snapshots/data-post-migration-rehearsal-*.txt",
      "data-snapshots/data-snapshot-delta-*.txt",
      "data-snapshot-checklist/data-snapshot-checklist-*.txt",
      "data-snapshot-status/data-snapshot-status-*.txt",
    ],
    statusSources: [
      statusSource(
        "Data snapshot evidence checklist",
        "data-snapshot-checklist",
        /^data-snapshot-checklist-.*\.txt$/,
      ),
      statusSource("Data snapshot status", "data-snapshot-status", /^data-snapshot-status-.*\.txt$/),
    ],
    acceptance:
      "Pre/post rehearsal snapshots exist, the delta is reviewed, and the data snapshot status report passes.",
  },
  {
    gate: "Backup, restore, and rollback evidence",
    severity: "Critical",
    owner: "DevOps Owner / Release Manager",
    commands: [
      "pnpm release:rehearsal-plan",
      "pnpm release:backup-restore-preflight",
      "pnpm db:backup",
      "pnpm release:backup-summary",
      "pnpm db:restore-check",
      "pnpm release:restore-summary",
      "pnpm release:rollback-summary",
      `SMOKE_OUTPUT_DIR=${evidenceRoot}/staging-rollback/smoke pnpm release:smoke`,
      "pnpm release:recovery-checklist",
      "pnpm release:deployment-checklist",
      "pnpm release:deployment-status",
      "pnpm release:backup-restore-status",
    ],
    steps: [
      "Run pnpm release:rehearsal-plan before restore or rollback work so the owner follows the approved evidence sequence.",
      "Run pnpm release:backup-restore-preflight with reviewed DATABASE_URL and RESTORE_DATABASE_URL.",
      "Run pnpm db:backup against the approved release rehearsal database.",
      "Generate and retain the backup checksum file, then generate backups/backup-summary.txt with pnpm release:backup-summary after the backup artifact exists.",
      "Run pnpm db:restore-check against an isolated non-production restore target.",
      "Generate backups/restore-check-summary.txt with pnpm release:restore-summary after restore verification.",
      "Run the approved rollback rehearsal and capture staging-rollback/rollback-summary.txt.",
      `Run post-rollback smoke with SMOKE_OUTPUT_DIR=${evidenceRoot}/staging-rollback/smoke pnpm release:smoke.`,
      "Run pnpm release:recovery-checklist to produce the owner-facing recovery evidence checklist and latest status snapshot.",
      "Run pnpm release:deployment-checklist to produce the owner-facing deployment, smoke, monitoring, signoff, and manifest-integrity checklist.",
      "Rerun pnpm release:deployment-status and attach the latest status artifact.",
      "Rerun pnpm release:backup-restore-status and attach the latest status artifact.",
    ],
    artifacts: [
      "backups/backup-restore-preflight-*.txt",
      "backups/ogfi-erp-*.dump",
      "backups/ogfi-erp-*.dump.sha256",
      "backups/backup-summary.txt",
      "backups/restore-check-summary.txt",
      "staging-rollback/rollback-summary.txt",
      "staging-rollback/smoke/smoke-*.txt",
      "backup-restore-status/backup-restore-status-*.txt",
      "recovery-checklist/recovery-evidence-checklist-*.txt",
      "deployment-checklist/deployment-evidence-checklist-*.txt",
      "deployment-status/deployment-status-*.txt",
    ],
    statusSources: [
      statusSource("Backup/restore status", "backup-restore-status", /^backup-restore-status-.*\.txt$/),
      statusSource(
        "Deployment evidence checklist",
        "deployment-checklist",
        /^deployment-evidence-checklist-.*\.txt$/,
      ),
      statusSource("Deployment status", "deployment-status", /^deployment-status-.*\.txt$/),
    ],
    acceptance:
      "A real backup dump, matching checksum, restore verification, rollback summary, post-rollback smoke proof, and passing backup/restore status report are collected from the approved release environment.",
  },
  {
    gate: "Pilot readiness and UAT execution",
    severity: "Critical",
    owner: "QA Lead / Operations Lead",
    commands: [
      "pnpm release:pilot-readiness-preflight",
      "pnpm release:pilot-readiness",
      "pnpm release:uat-checklist",
      "pnpm release:uat-status",
      "pnpm release:pilot-uat-status",
    ],
    steps: [
      "Confirm the pilot scope and approved readiness thresholds in the UAT evidence pack.",
      "Run pnpm release:pilot-readiness-preflight in the shell that will execute the DB-backed check.",
      "Run DATABASE_URL=<pilot-or-staging-url> pnpm release:pilot-readiness and attach the generated artifact.",
      "Run pnpm release:uat-checklist to produce the owner-facing UAT execution checklist and latest status snapshot.",
      "Execute each UAT scenario with named tester, date, environment, source record IDs, evidence reference, result, defect or waiver disposition, and owner signoff.",
      "Run pnpm release:uat-status after evidence updates.",
      "Run pnpm release:pilot-uat-status and attach the latest status artifact.",
    ],
    artifacts: [
      "pilot-readiness/pilot-readiness-preflight-*.txt",
      "pilot-readiness/pilot-readiness-*.txt",
      "uat-checklist/uat-execution-checklist-*.txt",
      "uat-status/uat-status-*.txt",
      "pilot-uat-status/pilot-uat-status-*.txt",
      "signed-documents/uat-evidence-pack.md",
    ],
    statusSources: [
      statusSource(
        "UAT execution checklist",
        "uat-checklist",
        /^uat-execution-checklist-.*\.txt$/,
      ),
      statusSource("UAT status", "uat-status", /^uat-status-.*\.txt$/),
      statusSource("Pilot/UAT status", "pilot-uat-status", /^pilot-uat-status-.*\.txt$/),
    ],
    acceptance:
      "DB-backed pilot readiness passes, UAT rows contain tester/date/evidence/result/disposition/signoff, the Pilot/UAT status report passes, and the signed UAT copy has no unresolved placeholders.",
  },
  {
    gate: "Training, hypercare, and owner signoff",
    severity: "High",
    owner: "Enablement Owner / Operations Owner",
    commands: [
      "pnpm release:enablement-checklist",
      "pnpm release:enablement-status",
      "pnpm release:signed-evidence-templates",
      "pnpm release:signed-evidence-status",
    ],
    steps: [
      "Run pnpm release:enablement-checklist to produce the owner-facing training, known-limit, hypercare, defect/waiver, signoff, and manifest-integrity checklist.",
      "Complete training attendance, trainer, material coverage, and known-limit acknowledgement rows.",
      "Complete hypercare owner, support route, daily review cadence, escalation, and defect triage evidence rows.",
      "Capture owner signoff or follow-up owner for each incomplete training and hypercare item.",
      "Run pnpm release:signed-evidence-templates to generate owner-safe signoff templates outside signed-documents/.",
      `Copy the approved training impact assessment to ${evidenceRoot}/signed-documents/training-impact-assessment.md or configure RELEASE_TRAINING_EVIDENCE_FILE.`,
      "Run pnpm release:enablement-status and pnpm release:signed-evidence-status after evidence updates.",
    ],
    artifacts: [
      "enablement-checklist/enablement-checklist-*.txt",
      "enablement-status/enablement-status-*.txt",
      "signed-document-templates/*-template.md",
      "signed-evidence-checklist/signed-evidence-checklist-*.txt",
      "signed-evidence-status/signed-evidence-status-*.txt",
      "signed-documents/training-impact-assessment.md",
      "docs/core/07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md",
    ],
    statusSources: [
      statusSource(
        "Enablement evidence checklist",
        "enablement-checklist",
        /^enablement-checklist-.*\.txt$/,
      ),
      statusSource("Enablement status", "enablement-status", /^enablement-status-.*\.txt$/),
      statusSource("Signed evidence status", "signed-evidence-status", /^signed-evidence-status-.*\.txt$/),
    ],
    acceptance:
      "Training attendance, known-limit acknowledgement, follow-up owners, hypercare contacts, daily review cadence, passing enablement status, and signed training evidence are complete.",
  },
  {
    gate: "GO / NO-GO collection and final review",
    severity: "Critical",
    owner: "Release Manager / Product Owner",
    commands: [
      "pnpm release:external-evidence",
      "pnpm release:rehearsal-plan",
      "pnpm release:interim-review",
      "pnpm release:metadata-env-template",
      "pnpm release:metadata-session-lock",
      "pnpm release:signed-evidence-templates",
      "pnpm release:signed-evidence-checklist",
      "pnpm release:summary-preflight",
      "pnpm release:summary",
      "pnpm release:status-suite",
      "pnpm release:evidence:manifest",
      "pnpm release:final-review-status",
      "pnpm release:go-no-go",
      "pnpm release:status-suite:strict",
      "pnpm release:milestones",
      "pnpm release:blocker-digest",
    ],
    steps: [
      "Run pnpm release:external-evidence to generate the owner handoff packet before assigning external evidence work.",
      "Run pnpm release:rehearsal-plan to generate the command-by-command external rehearsal path.",
      "Run pnpm release:interim-review when local generated artifacts are needed for technical review before signed external evidence exists; do not treat its conditional result as final approval.",
      "Run pnpm release:metadata-env-template and fill one approved environment value set for the evidence session.",
      "Run pnpm release:metadata-session-lock with approved metadata before final collection so all owners reuse one RELEASE_EVIDENCE_RUN_ID.",
      "Run pnpm release:signed-evidence-templates before signoff collection so each approver has the required fields and evidence references.",
      "Run pnpm release:signed-evidence-checklist to produce the owner-facing signed document collection, override, evidence-run, decision, and manifest-integrity checklist.",
      "Fill release metadata values and run pnpm release:summary-preflight until metadata prerequisites pass.",
      "Run pnpm release:summary to generate release-summary.txt.",
      `Copy signed UAT, deployment/rollback, and training evidence documents into ${evidenceRoot}/signed-documents/ or set the approved RELEASE_*_EVIDENCE_FILE paths.`,
      "Rerun pnpm release:data-snapshot-status, pnpm release:backup-restore-status, pnpm release:uat-status, pnpm release:pilot-uat-status, pnpm release:enablement-status, and pnpm release:signed-evidence-status until each focused status report passes.",
      "Run pnpm release:status-suite for an advisory refresh after source evidence and signed documents are present.",
      "Run pnpm release:evidence:manifest after all final evidence files and passing focused status reports are present.",
      "Run pnpm release:final-review-status to confirm final-review prerequisites.",
      "Run pnpm release:go-no-go and obtain named owner review; do not treat the generated report as approval by itself.",
      "Run pnpm release:status-suite:strict as the CI-style readiness gate; it must exit successfully before signoff.",
      "Run pnpm release:milestones and pnpm release:blocker-digest for final owner handoff visibility.",
    ],
    artifacts: [
      "release-summary-preflight-*.txt",
      "release-summary.txt",
      "external-evidence-guide/external-evidence-guide-*.txt",
      "rehearsal-command-plan/rehearsal-command-plan-*.txt",
      "interim-review/interim-review-*.txt",
      "release-metadata/release-metadata-worksheet-*.txt",
      "release-metadata/release-env-template-*.txt",
      "release-metadata/release-session-lock-*.txt",
      "signed-document-templates/*-template.md",
      "signed-evidence-checklist/signed-evidence-checklist-*.txt",
      "manifests/release-evidence-manifest-*.txt",
      "data-snapshot-status/data-snapshot-status-*.txt",
      "backup-restore-status/backup-restore-status-*.txt",
      "uat-status/uat-status-*.txt",
      "pilot-uat-status/pilot-uat-status-*.txt",
      "enablement-status/enablement-status-*.txt",
      "signed-evidence-status/signed-evidence-status-*.txt",
      "final-review-status/final-review-status-*.txt",
      "go-no-go/go-no-go-*.txt",
    ],
    statusSources: [
      statusSource("External evidence guide", "external-evidence-guide", /^external-evidence-guide-.*\.txt$/),
      statusSource("Release metadata worksheet", "release-metadata", /^release-metadata-worksheet-.*\.txt$/),
      statusSource("Release metadata environment template", "release-metadata", /^release-env-template-.*\.txt$/),
      statusSource("Release metadata session lock", "release-metadata", /^release-session-lock-.*\.txt$/),
      statusSource(
        "Signed evidence checklist",
        "signed-evidence-checklist",
        /^signed-evidence-checklist-.*\.txt$/,
      ),
      statusSource("Final-review status", "final-review-status", /^final-review-status-.*\.txt$/),
      statusSource("GO / NO-GO report", "go-no-go", /^go-no-go-.*\.txt$/),
    ],
    acceptance:
      "Release metadata is approved, the final manifest is fresh, signed documents are present, final review is ready, and the GO / NO-GO report is reviewed by named owners.",
  },
];

const lines = [
  "OGFI ERP Phase I / Phase 1.5 pending evidence checklist",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This checklist does not create evidence, execute UAT, approve release, or replace the focused status reports. It consolidates the remaining evidence work into owner-ready handoff steps.",
  "Run pnpm release:external-evidence before assigning external owners so every owner sees the same evidence run ID, environment context, artifact destinations, and non-fabrication boundary.",
  "Run pnpm release:rehearsal-plan when owners need the ordered command sequence for migration, backup, restore, rollback, smoke, UAT, and final gates.",
  "",
];

for (const group of groups) {
  lines.push(
    `GATE | ${group.gate}`,
    `OWNER | severity=${group.severity} | owner=${group.owner}`,
    "EVIDENCE SESSION",
    "- Set and reuse one RELEASE_EVIDENCE_RUN_ID for this gate when collecting final release evidence.",
    "- Regenerate the focused status artifact after evidence changes, then regenerate the final manifest only after all focused status reports pass.",
    "COMMANDS",
    ...group.commands.map((command) => `- ${command}`),
    "STEPS",
    ...group.steps.map((step, index) => `${index + 1}. ${step}`),
    "ARTIFACTS",
    ...group.artifacts.map((artifact) => `- ${artifact}`),
    `ACCEPTANCE | ${group.acceptance}`,
    "LATEST STATUS",
    ...latestStatusLines(group.statusSources),
    "",
  );
}

lines.push(
  "NEXT | Run the focused status commands after collecting evidence, then rerun pnpm release:milestones and pnpm release:final-review-status.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Pending evidence checklist written: ${outputFile}`);

function statusSource(label, directory, pattern) {
  return { label, directory, pattern };
}

function latestStatusLines(statusSources = []) {
  if (statusSources.length === 0) {
    return ["- no focused status source configured"];
  }

  return statusSources.flatMap((source) => {
    const latest = latestMatchingFile(join(evidenceRoot, source.directory), source.pattern);
    if (!latest) {
      return [`- ${source.label}: missing latest ${source.directory}/${source.pattern.source} artifact`];
    }

    const content = readFileSync(join(evidenceRoot, source.directory, latest), "utf8");
    const statusLines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(isChecklistStatusLine)
      .slice(0, 8);

    if (statusLines.length === 0) {
      return [`- ${source.label}: ${source.directory}/${latest} has no blocker or result lines`];
    }

    return [
      `- ${source.label}: ${source.directory}/${latest}`,
      ...statusLines.map((line) => `  ${line}`),
    ];
  });
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

function isChecklistStatusLine(line) {
  return (
    line.startsWith("RESULT |") ||
    line.startsWith("BLOCKED |") ||
    line.startsWith("BLOCKER |") ||
    line.startsWith("OWNER |") ||
    line.startsWith("WARN |") ||
    line.startsWith("FAIL |") ||
    line.startsWith("PENDING |")
  );
}
