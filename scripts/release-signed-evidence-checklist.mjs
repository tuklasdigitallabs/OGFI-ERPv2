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
const outputFile =
  process.env.RELEASE_SIGNED_EVIDENCE_CHECKLIST_OUTPUT_FILE ??
  join(
    evidenceRoot,
    "signed-evidence-checklist",
    `signed-evidence-checklist-${timestamp}.txt`,
  );

const documents = [
  {
    label: "Signed UAT evidence pack",
    owner: "QA Lead / Product Owner",
    targetPath: "signed-documents/uat-evidence-pack.md",
    envOverride: "RELEASE_UAT_EVIDENCE_FILE",
    sourceStatus: "uat-status/uat-status-*.txt and pilot-uat-status/pilot-uat-status-*.txt",
    requiredProof:
      "completed UAT scenarios, tester identity, source records, defects/waivers, screenshots or exports, owner signoff, and matching evidence run ID",
  },
  {
    label: "Signed deployment and rollback evidence",
    owner: "DevOps Owner / Release Manager",
    targetPath: "signed-documents/deployment-rollback-evidence.md",
    envOverride: "RELEASE_DEPLOYMENT_EVIDENCE_FILE",
    sourceStatus: "deployment-status/deployment-status-*.txt and backup-restore-status/backup-restore-status-*.txt",
    requiredProof:
      "deployment rows, backup/restore proof, rollback proof, smoke proof, monitoring/support readiness, owner signoff, and matching evidence run ID",
  },
  {
    label: "Signed training impact assessment",
    owner: "Enablement Owner / Operations Owner",
    targetPath: "signed-documents/training-impact-assessment.md",
    envOverride: "RELEASE_TRAINING_EVIDENCE_FILE",
    sourceStatus: "enablement-status/enablement-status-*.txt",
    requiredProof:
      "training attendance, known-limit acknowledgement, hypercare owners, daily review evidence, follow-up owner, signoff, and matching evidence run ID",
  },
];

const checklist = [
  {
    owner: "Release Manager",
    action: "Lock the final evidence session before asking owners to sign.",
    command: "pnpm release:metadata-session-lock",
    artifact: "release-metadata/release-session-lock-*.txt",
    acceptance: "One approved RELEASE_EVIDENCE_RUN_ID is reused for source status artifacts, signed documents, manifest, final review, and GO / NO-GO.",
  },
  {
    owner: "Release Manager / Evidence Owners",
    action: "Generate owner-safe signed evidence templates outside signed-documents.",
    command: "pnpm release:signed-evidence-templates",
    artifact: "signed-document-templates/*-template.md",
    acceptance: "Templates remain outside signed-documents until completed and owner-approved.",
  },
  {
    owner: "QA Lead / Product Owner",
    action: "Collect the signed UAT evidence pack from completed UAT source evidence.",
    command: "Copy approved file to signed-documents/uat-evidence-pack.md or set RELEASE_UAT_EVIDENCE_FILE.",
    artifact: "signed-documents/uat-evidence-pack.md or approved override",
    acceptance: "Document has no Pending/TBD placeholders and includes Evidence run ID, Signed by, Role, Date, Decision, and Owner.",
  },
  {
    owner: "DevOps Owner / Release Manager",
    action: "Collect the signed deployment and rollback evidence document from completed deployment/recovery source evidence.",
    command: "Copy approved file to signed-documents/deployment-rollback-evidence.md or set RELEASE_DEPLOYMENT_EVIDENCE_FILE.",
    artifact: "signed-documents/deployment-rollback-evidence.md or approved override",
    acceptance: "Document has no Pending/TBD placeholders and includes Evidence run ID, Signed by, Role, Date, Decision, and Owner.",
  },
  {
    owner: "Enablement Owner / Operations Owner",
    action: "Collect the signed training impact assessment from completed training and hypercare source evidence.",
    command: "Copy approved file to signed-documents/training-impact-assessment.md or set RELEASE_TRAINING_EVIDENCE_FILE.",
    artifact: "signed-documents/training-impact-assessment.md or approved override",
    acceptance: "Document has no [ ], Pending, or TBD placeholders and includes Evidence run ID, Signed by, Role, Date, Decision, and Owner.",
  },
  {
    owner: "Release Manager / Product Owner",
    action: "Verify signed documents before regenerating the final manifest.",
    command: "pnpm release:signed-evidence-status",
    artifact: "signed-evidence-status/signed-evidence-status-*.txt",
    acceptance: "Must contain RESULT | PASS | Signed evidence documents are present and have no unresolved placeholders.",
  },
  {
    owner: "Release Manager",
    action: "Refresh the final manifest only after signed evidence and focused source statuses pass.",
    command: "pnpm release:evidence:manifest",
    artifact: "manifests/release-evidence-manifest-*.txt",
    acceptance: "Manifest includes signed-documents entries, signed-evidence-status, focused source status artifacts, checksums, and no stale source evidence.",
  },
  {
    owner: "Release Manager / Product Owner",
    action: "Run final-review and GO / NO-GO after manifest refresh.",
    command: "pnpm release:final-review-status && pnpm release:go-no-go",
    artifact: "final-review-status/final-review-status-*.txt and go-no-go/go-no-go-*.txt",
    acceptance: "Final review is ready and GO / NO-GO report is owner-reviewed; generated reports are not approval by themselves.",
  },
];

const latestSignedStatus = latestMatchingFile(
  join(evidenceRoot, "signed-evidence-status"),
  /^signed-evidence-status-.*\.txt$/,
);
const latestFinalReview = latestMatchingFile(
  join(evidenceRoot, "final-review-status"),
  /^final-review-status-.*\.txt$/,
);

const lines = [
  "OGFI ERP Phase I / Phase 1.5 signed evidence checklist",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This checklist is advisory. It does not create, copy, sign, edit, approve, or replace evidence documents, and it does not approve release.",
  "Use the same RELEASE_EVIDENCE_RUN_ID across focused status artifacts, signed documents, final manifest, final review, and GO / NO-GO.",
  "",
  "Required Signed Evidence Fields",
  "FIELD | evidence run | Evidence run ID matching the approved session when RELEASE_EVIDENCE_RUN_ID is set",
  "FIELD | signer | Signed by, Role, Owner, and release authority for the document scope",
  "FIELD | date | Date in YYYY-MM-DD or MM/DD/YYYY format",
  "FIELD | decision | explicit decision such as Approved, GO, Conditional GO, Hold, No-GO, Rollback, Deferred, or Waived",
  "FIELD | evidence references | source status artifact paths, source evidence records, screenshots/exports/log references, and waiver/defect IDs where applicable",
  "FIELD | placeholders | no Pending, TBD, unchecked checklist item, or template placeholder text remains in final signed copies",
  "FIELD | final integrity | final manifest checksum lines and owner confirmation no source evidence changed after manifest generation",
  "",
  "Signed Document Collection Matrix",
];

for (const document of documents) {
  lines.push(
    `DOCUMENT | ${document.label}`,
    `OWNER | ${document.owner}`,
    `TARGET | ${document.targetPath}`,
    `ENV_OVERRIDE | ${document.envOverride}`,
    `SOURCE_STATUS | ${document.sourceStatus}`,
    `REQUIRED_PROOF | ${document.requiredProof}`,
    "",
  );
}

lines.push("Signed Evidence Steps");
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
  "Latest Signed Evidence Status",
  ...latestStatusLines("signed-evidence-status", latestSignedStatus),
  "",
  "Latest Final Review Status",
  ...latestStatusLines("final-review-status", latestFinalReview),
  "",
  "RESULT | ACTION REQUIRED | Collect owner-approved signed UAT, deployment/rollback, and training evidence documents before final release review.",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Signed evidence checklist written: ${outputFile}`);

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
        line.startsWith("FAIL |") ||
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
