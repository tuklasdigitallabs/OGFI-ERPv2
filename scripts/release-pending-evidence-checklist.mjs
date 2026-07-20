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
      "Record migration, backup, restore rehearsal, rollback plan, smoke-test, and monitoring/hypercare evidence in ERP Admin > Release Readiness > Deployment controls, then have a separate reviewer verify each record.",
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
      "A real backup dump, matching checksum, restore verification, rollback summary, post-rollback smoke proof, verified ERP deployment evidence records, and passing backup/restore status report are collected from the approved release environment.",
  },
  {
    gate: "External identity and evidence storage proof",
    severity: "Critical",
    owner: "Security Owner / IT Owner",
    commands: [
      "pnpm release:external-evidence",
      "DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness",
    ],
    steps: [
      "Collect MFA provider enrollment and runtime challenge proof for privileged users.",
      "Collect IdP session termination proof for pending ERP AuthSessionInvalidation records.",
      "Collect vault or approved evidence-repository references for release artifacts, signed documents, backup checksums, and screenshots.",
      "Collect break-glass post-use review and revocation proof when emergency access was used.",
      "Rerun strict DB-backed pilot readiness after provider-side security evidence is recorded and reviewed.",
    ],
    artifacts: [
      "external-evidence-guide/external-evidence-guide-*.txt",
      "external-security/mfa-provider-enrollment-and-runtime-proof.*",
      "external-security/idp-session-invalidation-proof.*",
      "external-security/vault-or-artifact-storage-index.*",
      "external-security/break-glass-review-and-revocation-proof.*",
      "pilot-readiness/pilot-readiness-*.txt",
    ],
    statusSources: [
      statusSource("Pilot readiness report", "pilot-readiness", /^pilot-readiness-(?!preflight).*\.txt$/),
    ],
    acceptance:
      "External provider/runtime proof exists for MFA, IdP session invalidation, evidence storage, and break-glass review, and strict pilot readiness passes with the live security rows at zero.",
  },
  {
    gate: "Pilot readiness and UAT execution",
    severity: "Critical",
    owner: "QA Lead / Operations Lead",
    commands: [
      "pnpm release:pilot-readiness-preflight",
      "PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness-preflight",
      "DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness",
      "DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register",
      "pnpm release:uat-checklist",
      "pnpm release:uat-status",
      "pnpm release:pilot-uat-status",
      "pnpm release:phase3-uat-checklist",
      "pnpm release:phase3-uat-status",
      "pnpm release:phase3-status",
    ],
    steps: [
      "Confirm the pilot scope and approved readiness thresholds in the UAT evidence pack.",
      "Run pnpm release:pilot-readiness-preflight in the shell that will execute the DB-backed check.",
      "For final review, rerun preflight with PILOT_REQUIRE_RELEASE_GATES_READY=true so the artifact records strict gate mode.",
      "Run DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness and attach the generated artifact.",
      "Verify the strict pilot-readiness artifact includes zero-count live security rows for Pending controlled access requests, Privileged users missing verified MFA evidence, Pending provider session invalidations, and Break-glass access open or post-review due.",
      "After Admin > Release Readiness gates, UAT evidence, deployment evidence, enablement evidence, and Release Board decisions are current, run DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register.",
      "Run pnpm release:uat-checklist to produce the owner-facing UAT execution checklist and latest status snapshot.",
      "Execute each UAT scenario with named tester, date, environment, source record IDs, evidence reference, result, defect or waiver disposition, and owner signoff.",
      "Record UAT scenario execution, defect disposition, policy trace, acceptance matrix, and default-revision evidence in ERP Admin > Release Readiness > UAT evidence, then have a separate reviewer verify each record.",
      "Run pnpm release:uat-status after evidence updates.",
      "Run pnpm release:pilot-uat-status and attach the latest status artifact.",
      "For Phase 3 controlled-foundation review, run pnpm release:phase3-uat-checklist so finance, workforce, and deferred-blocker owners have the scenario-by-scenario execution handoff.",
      "Run pnpm release:phase3-uat-status after exporting the Release Readiness register so exact finance, workforce, and deferred-blocker workflow-area coverage is visible.",
      "Run pnpm release:phase3-status after the Phase 3 UAT status artifact is generated so the umbrella Phase 3 status report shows foundation wiring and missing Phase 3 evidence groups.",
    ],
    artifacts: [
      "pilot-readiness/pilot-readiness-preflight-*.txt",
      "pilot-readiness/pilot-readiness-*.txt",
      "release-readiness-register/release-readiness-register-*.csv",
      "release-readiness-register/release-readiness-register-*.csv.sha256",
      "uat-checklist/uat-execution-checklist-*.txt",
      "uat-status/uat-status-*.txt",
      "pilot-uat-status/pilot-uat-status-*.txt",
      "phase3-uat-checklist/phase3-uat-checklist-*.txt",
      "phase3-uat-status/phase3-uat-status-*.txt",
      "phase3-status/phase3-status-*.txt",
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
      statusSource(
        "Phase 3 UAT execution checklist",
        "phase3-uat-checklist",
        /^phase3-uat-checklist-.*\.txt$/,
      ),
      statusSource("Phase 3 UAT status", "phase3-uat-status", /^phase3-uat-status-.*\.txt$/),
      statusSource("Phase 3 status", "phase3-status", /^phase3-status-.*\.txt$/),
    ],
    acceptance:
      "DB-backed pilot readiness passes in strict mode with live security rows at zero, UAT rows contain tester/date/evidence/result/disposition/signoff, verified ERP UAT evidence records have no unresolved failed/blocked outcomes, the Pilot/UAT status report passes, Phase 3 status artifacts explicitly show finance/workforce/deferred-blocker evidence coverage, and the signed UAT copy has no unresolved placeholders.",
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
      "Record training signoff, known-limit acknowledgement, support-route confirmation, KB review, release-note review, and training-impact evidence in ERP Admin > Release Readiness > Enablement, then have a separate reviewer verify each record.",
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
      "Training attendance, known-limit acknowledgement, follow-up owners, hypercare contacts, daily review cadence, verified ERP enablement evidence records, passing enablement status, and signed training evidence are complete.",
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
      "DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register",
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
      "Run DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register after Admin > Release Readiness gates, evidence records, and Release Board decisions are current.",
      `Copy signed UAT, deployment/rollback, and training evidence documents into ${evidenceRoot}/signed-documents/ or set the approved RELEASE_*_EVIDENCE_FILE paths. Copy approved external-security proof references into ${evidenceRoot}/external-security/.`,
      "Rerun pnpm release:data-snapshot-status, pnpm release:backup-restore-status, pnpm release:uat-status, pnpm release:pilot-uat-status, pnpm release:phase3-uat-checklist, pnpm release:phase3-uat-status, pnpm release:phase3-status, pnpm release:enablement-status, and pnpm release:signed-evidence-status until each focused status report is current and any WARN/BLOCKED result has owner disposition.",
      "Run pnpm release:status-suite for an advisory refresh after source evidence, signed documents, and external-security proof references are present.",
      "Run pnpm release:evidence:manifest after all final evidence files and passing focused status reports are present, and retain the matching .sha256 sidecar.",
      "Run pnpm release:final-review-status to confirm final-review prerequisites.",
      "Run pnpm release:go-no-go and obtain named owner review; do not treat the generated report as approval by itself.",
      "Record the final board decision in ERP Admin > Release Readiness > GO / NO-GO, then update the GO / NO-GO readiness gate to match the latest board decision.",
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
      "release-readiness-register/release-readiness-register-*.csv",
      "release-readiness-register/release-readiness-register-*.csv.sha256",
      "signed-document-templates/*-template.md",
      "signed-evidence-checklist/signed-evidence-checklist-*.txt",
      "manifests/release-evidence-manifest-*.txt",
      "manifests/release-evidence-manifest-*.txt.sha256",
      "data-snapshot-status/data-snapshot-status-*.txt",
      "backup-restore-status/backup-restore-status-*.txt",
      "uat-status/uat-status-*.txt",
      "pilot-uat-status/pilot-uat-status-*.txt",
      "phase3-uat-checklist/phase3-uat-checklist-*.txt",
      "phase3-uat-status/phase3-uat-status-*.txt",
      "phase3-status/phase3-status-*.txt",
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
      "Release metadata is approved, the final manifest is fresh with a matching checksum sidecar, signed documents and external-security proof references are present, final review is ready, the ERP Release Board decision register is recorded, and the GO / NO-GO report is reviewed by named owners.",
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
