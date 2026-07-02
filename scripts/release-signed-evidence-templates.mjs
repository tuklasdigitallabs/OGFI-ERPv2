import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, "<set-approved-evidence-run-id>");
const outputDir =
  process.env.RELEASE_SIGNED_EVIDENCE_TEMPLATE_DIR ??
  join(evidenceRoot, "signed-document-templates");

const templates = [
  {
    file: "uat-evidence-pack-template.md",
    title: "Signed UAT Evidence Pack Template",
    owner: "QA Lead / Product Owner",
    decision:
      "Approved for GO / NO-GO review, Conditional GO, Deferred, Hold, or No-GO",
    requiredEvidence: [
      "Completed UAT scenario register with tester, role, environment, device, execution timestamp, result, evidence reference, defect or waiver disposition, and owner signoff.",
      "Pilot readiness and UAT status artifacts generated from the same evidence run.",
      "Open defect, waiver, and deferral decisions with named owner and approval date.",
    ],
    interimLocalArtifacts: [
      "self-tests/release-tools-self-test-*.txt",
      "status-suite/status-suite-*.txt",
      "uat-status/uat-status-*.txt",
      "pilot-uat-status/pilot-uat-status-*.txt",
      "blocker-digest/blocker-digest-*.txt",
    ],
    finalExternalEvidence: [
      "Executed UAT scenarios from the selected pilot or staging environment.",
      "Screenshots, exports, or record IDs proving each tested workflow.",
      "QA/Product owner signoff with approved defects, waivers, or deferrals.",
    ],
  },
  {
    file: "deployment-rollback-evidence-template.md",
    title: "Signed Deployment And Rollback Evidence Template",
    owner: "DevOps Owner / Release Manager",
    decision:
      "Approved for GO / NO-GO review, Conditional GO, Rollback, Hold, or No-GO",
    requiredEvidence: [
      "Completed deployment and rollback checklist rows with environment, execution timestamp, actual actor, accepted result, and evidence reference.",
      "Backup dump, checksum, backup summary, isolated restore summary, rollback summary, and post-rollback smoke artifacts.",
      "Deployment status and backup/restore status artifacts generated from the same evidence run.",
    ],
    interimLocalArtifacts: [
      "backup-restore-status/backup-restore-status-*.txt",
      "deployment-status/deployment-status-*.txt",
      "rehearsal-command-plan/rehearsal-command-plan-*.txt",
      "status-suite/status-suite-*.txt",
      "blocker-digest/blocker-digest-*.txt",
    ],
    finalExternalEvidence: [
      "Real backup dump and matching checksum from the selected release database.",
      "Isolated restore proof and post-rollback smoke evidence from the selected environment.",
      "DevOps/Release owner signoff on deployment, rollback, and monitoring readiness.",
    ],
  },
  {
    file: "training-impact-assessment-template.md",
    title: "Signed Training Impact Assessment Template",
    owner: "Enablement Owner / Operations Owner",
    decision:
      "Approved for GO / NO-GO review, Conditional GO, Deferred, Hold, or No-GO",
    requiredEvidence: [
      "Training attendance, trainer, material coverage, known-limit acknowledgement, follow-up owner, evidence reference, and signoff date.",
      "Hypercare roles, support routes, daily review evidence, escalation path, and defect triage owner.",
      "Enablement status artifact generated from the same evidence run.",
    ],
    interimLocalArtifacts: [
      "enablement-status/enablement-status-*.txt",
      "pending-evidence-checklist/pending-evidence-checklist-*.txt",
      "status-suite/status-suite-*.txt",
      "blocker-digest/blocker-digest-*.txt",
    ],
    finalExternalEvidence: [
      "Completed training attendance or acknowledgement evidence from actual pilot users.",
      "Approved hypercare owner roster, support route, and escalation path.",
      "Enablement/Operations owner signoff on known limits and follow-up ownership.",
    ],
  },
];

mkdirSync(outputDir, { recursive: true });

const lines = [
  "OGFI ERP Phase I / Phase 1.5 signed evidence template generator",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Template directory: ${outputDir}`,
  "",
    "These templates are advisory starting points. They are not signed evidence, do not approve release, and must not be copied into signed-documents/ until completed and owner-approved.",
    "Local generated artifacts can support interim review only. They do not replace pilot UAT, backup/restore, rollback, training, or signed owner evidence.",
    "",
];

for (const template of templates) {
  const file = join(outputDir, template.file);
  writeFileSync(file, `${renderTemplate(template)}\n`);
  lines.push(`TEMPLATE | ${template.title} | ${file}`);
}

lines.push(
  "",
  "Next action: complete the source evidence documents, copy approved signed versions into signed-documents/, then run pnpm release:signed-evidence-status.",
  "RESULT | PASS | Signed evidence templates generated.",
);

console.log(lines.join("\n"));

function renderTemplate(template) {
  return [
    `# ${template.title}`,
    "",
    "This template is not release approval until all placeholders are replaced with approved values and the document is copied to the required signed evidence path.",
    "",
    "## Signoff",
    "",
    `Evidence run ID: ${runId}`,
    "Signed by: <named approver>",
    `Role: ${template.owner}`,
    "Date: <YYYY-MM-DD>",
    `Decision: ${template.decision}`,
    "Owner: <release evidence owner>",
    "",
    "## Required Evidence References",
    "",
    ...template.requiredEvidence.map((item) => `- ${item}`),
    "",
    "## Interim Local Artifact References",
    "",
    "These generated artifacts may support interim review while external evidence is still pending. They do not replace final owner-approved evidence.",
    "",
    ...template.interimLocalArtifacts.map((item) => `- ${item}`),
    "",
    "## Final External Evidence Required",
    "",
    ...template.finalExternalEvidence.map((item) => `- ${item}`),
    "",
    "## Approval Notes",
    "",
    "- Scope reviewed: <company / branch / environment>",
    "- Evidence package reviewed: <artifact folder or evidence reference>",
    "- Exceptions, waivers, or deferrals: <none or approved reference>",
    "- Follow-up owner and date: <owner / YYYY-MM-DD>",
    "",
    "## Copy Target After Approval",
    "",
    "- UAT: signed-documents/uat-evidence-pack.md",
    "- Deployment/rollback: signed-documents/deployment-rollback-evidence.md",
    "- Training: signed-documents/training-impact-assessment.md",
  ].join("\n");
}
