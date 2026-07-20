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
      "Verified ERP UAT evidence-register records for scenario execution, defect disposition, policy trace, acceptance matrix, and default revision register.",
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
      "Verified ERP deployment evidence-register records for migration, backup, restore rehearsal, rollback plan, smoke test, and monitoring/hypercare.",
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
      "Verified ERP enablement evidence-register records for training signoff, known-limit acknowledgement, support-route confirmation, KB review, release-note review, and training-impact assessment.",
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
  {
    file: "external-mfa-provider-proof-template.md",
    title: "External MFA Provider Proof Template",
    owner: "Security Owner / IT Owner",
    decision: "Approved external MFA provider proof for GO / NO-GO review",
    copyTargets: ["external-security/mfa-provider-enrollment-and-runtime-proof.<approved-extension>"],
    requiredEvidence: [
      "Evidence run ID matching the approved release evidence session.",
      "Provider-side MFA enrollment export or attestation for privileged users.",
      "Runtime challenge proof showing privileged sign-in or sensitive action challenge behavior.",
      "Explicit final marker: RESULT | PASS | External security proof captured.",
    ],
    interimLocalArtifacts: [
      "admin/mfa ERP evidence register screenshots or export references",
      "pilot-readiness/pilot-readiness-*.txt",
      "release-readiness-register/release-readiness-register-*.csv",
    ],
    finalExternalEvidence: [
      "Provider-side evidence from the selected IdP/MFA system, redacted for secrets.",
      "Named Security or IT owner review and approval.",
      "Mapping between ERP privileged users and provider-side MFA subjects where applicable.",
    ],
  },
  {
    file: "external-idp-session-invalidation-proof-template.md",
    title: "External IdP Session Invalidation Proof Template",
    owner: "Security Owner / IT Owner",
    decision: "Approved external IdP session invalidation proof for GO / NO-GO review",
    copyTargets: ["external-security/idp-session-invalidation-proof.<approved-extension>"],
    requiredEvidence: [
      "Evidence run ID matching the approved release evidence session.",
      "List or reference of ERP AuthSessionInvalidation records cleared in the provider.",
      "Provider-side session termination evidence or audit reference.",
      "Explicit final marker: RESULT | PASS | External security proof captured.",
    ],
    interimLocalArtifacts: [
      "admin/session-invalidation ERP register references",
      "pilot-readiness/pilot-readiness-*.txt",
      "release-readiness-register/release-readiness-register-*.csv",
    ],
    finalExternalEvidence: [
      "Provider-side invalidation or revocation proof, redacted for secrets.",
      "Separate reviewer confirmation that requester did not complete their own invalidation proof.",
      "Named Security or IT owner approval.",
    ],
  },
  {
    file: "external-evidence-storage-index-template.md",
    title: "External Evidence Storage Index Template",
    owner: "Security Owner / Release Manager",
    decision: "Approved evidence repository index for GO / NO-GO review",
    copyTargets: ["external-security/vault-or-artifact-storage-index.<approved-extension>"],
    requiredEvidence: [
      "Evidence run ID matching the approved release evidence session.",
      "Vault, repository, or controlled artifact-storage references for final evidence.",
      "Access-control owner and retention note for release evidence artifacts.",
      "Explicit final marker: RESULT | PASS | External security proof captured.",
    ],
    interimLocalArtifacts: [
      "manifests/release-evidence-manifest-*.txt",
      "release-metadata/release-session-lock-*.txt",
      "pending-evidence-checklist/pending-evidence-checklist-*.txt",
    ],
    finalExternalEvidence: [
      "Approved evidence repository index with artifact paths, owners, and checksums where applicable.",
      "Confirmation that screenshots, backup checksums, signed documents, and exports are retained in approved storage.",
      "Named Security or Release owner approval.",
    ],
  },
  {
    file: "external-break-glass-review-proof-template.md",
    title: "External Break-Glass Review Proof Template",
    owner: "Security Owner / IT Owner",
    decision: "Approved break-glass revocation and post-use review proof for GO / NO-GO review",
    copyTargets: ["external-security/break-glass-review-and-revocation-proof.<approved-extension>"],
    requiredEvidence: [
      "Evidence run ID matching the approved release evidence session.",
      "Break-glass grant IDs or incident references reviewed.",
      "External revocation or access-removal evidence where emergency access was used.",
      "Explicit final marker: RESULT | PASS | External security proof captured.",
    ],
    interimLocalArtifacts: [
      "admin/break-glass ERP register references",
      "pilot-readiness/pilot-readiness-*.txt",
      "release-readiness-register/release-readiness-register-*.csv",
    ],
    finalExternalEvidence: [
      "Emergency access post-use review with reviewer, date, result, and follow-up owner.",
      "Provider-side revocation proof or confirmation no emergency access was used.",
      "Named Security or IT owner approval.",
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
    "- ERP readiness register record IDs reviewed: <UAT / deployment / enablement / board decision IDs>",
    "- Exceptions, waivers, or deferrals: <none or approved reference>",
    "- Follow-up owner and date: <owner / YYYY-MM-DD>",
    "",
    "## Copy Target After Approval",
    "",
    ...(template.copyTargets ?? [
      "signed-documents/uat-evidence-pack.md",
      "signed-documents/deployment-rollback-evidence.md",
      "signed-documents/training-impact-assessment.md",
    ]).map((target) => `- ${target}`),
  ].join("\n");
}
