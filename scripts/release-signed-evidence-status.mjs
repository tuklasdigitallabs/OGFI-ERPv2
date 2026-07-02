import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";
import { evaluateSignedEvidenceDocument } from "./release-signed-evidence-contract.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const outputFile =
  process.env.RELEASE_SIGNED_EVIDENCE_STATUS_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "signed-evidence-status",
    `signed-evidence-status-${timestamp}.txt`,
  );

const signedDocuments = [
  {
    label: "Signed UAT evidence pack",
    file:
      process.env.RELEASE_UAT_EVIDENCE_FILE ??
      join(evidenceRoot, "signed-documents", "uat-evidence-pack.md"),
    envOverride: "RELEASE_UAT_EVIDENCE_FILE",
    targetPath: "signed-documents/uat-evidence-pack.md",
    forbidden: ["Pending", "TBD"],
    severity: "Critical",
    owner: "QA Lead / Product Owner",
    evidence:
      "owner-approved UAT evidence pack with scenarios, defects, waivers, and signoff complete",
  },
  {
    label: "Signed deployment and rollback evidence",
    file:
      process.env.RELEASE_DEPLOYMENT_EVIDENCE_FILE ??
      join(evidenceRoot, "signed-documents", "deployment-rollback-evidence.md"),
    envOverride: "RELEASE_DEPLOYMENT_EVIDENCE_FILE",
    targetPath: "signed-documents/deployment-rollback-evidence.md",
    forbidden: ["Pending", "TBD"],
    severity: "Critical",
    owner: "DevOps Owner / Release Manager",
    evidence:
      "owner-approved deployment, backup/restore, rollback, smoke, and monitoring evidence",
  },
  {
    label: "Signed training impact assessment",
    file:
      process.env.RELEASE_TRAINING_EVIDENCE_FILE ??
      join(evidenceRoot, "signed-documents", "training-impact-assessment.md"),
    envOverride: "RELEASE_TRAINING_EVIDENCE_FILE",
    targetPath: "signed-documents/training-impact-assessment.md",
    forbidden: ["[ ]", "Pending", "TBD"],
    severity: "High",
    owner: "Enablement Owner / Operations Owner",
    evidence:
      "owner-approved training attendance, known-limit acknowledgement, and follow-up owner evidence",
  },
];

const lines = [
  "OGFI ERP Phase I / Phase 1.5 signed evidence status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This report is advisory. It does not create, sign, edit, or approve evidence documents.",
  "",
  "Required Signed Document Collection",
  ...signedDocuments.flatMap((document) => [
    `DOCUMENT | ${document.label}`,
    `  default_path=${document.targetPath}`,
    `  env_override=${document.envOverride}`,
    `  reviewed_file=${document.file}`,
  ]),
  "",
];

let blockers = 0;

for (const document of signedDocuments) {
  const result = evaluateDocument(document);
  if (result.pass) {
    lines.push(`PASS | ${document.label} | ${result.detail}`);
  } else {
    blockers += 1;
    lines.push(`BLOCKED | ${document.label} | ${result.detail}`);
    lines.push(
      `  OWNER | severity=${document.severity} | owner=${document.owner} | evidence=${document.evidence}`,
    );
  }
}

lines.push("");
if (blockers > 0) {
  lines.push(
    `RESULT | BLOCKED | ${blockers} signed evidence document blocker(s) remain before GO / NO-GO review.`,
  );
  lines.push(
    "Next action: copy completed owner-approved evidence documents into signed-documents/ or set RELEASE_*_EVIDENCE_FILE to approved external copies, then rerun this status.",
  );
} else {
  lines.push(
    "RESULT | PASS | Signed evidence documents are present and have no unresolved placeholders.",
  );
}

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Signed evidence status written: ${outputFile}`);

function evaluateDocument(document) {
  return evaluateSignedEvidenceDocument({
    ...document,
    expectedEvidenceRunId: runId,
  });
}
