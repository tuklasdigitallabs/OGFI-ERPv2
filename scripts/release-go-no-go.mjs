import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  finalManifestRequiredContent,
  finalManifestRequiredPatterns,
} from "./release-evidence-contract.mjs";
import { evidenceRunId } from "./release-evidence-metadata.mjs";
import { evaluateManifestFreshness } from "./release-evidence-freshness.mjs";
import { evaluateEvidenceRunConsistency } from "./release-evidence-run-consistency.mjs";
import { evaluateSignedEvidenceDocument } from "./release-signed-evidence-contract.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const uatEvidenceFile =
  process.env.RELEASE_UAT_EVIDENCE_FILE ??
  "docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md";
const deploymentEvidenceFile =
  process.env.RELEASE_DEPLOYMENT_EVIDENCE_FILE ??
  "docs/core/07-quality/PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md";
const trainingEvidenceFile =
  process.env.RELEASE_TRAINING_EVIDENCE_FILE ??
  "docs/core/08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md";
const outputFile =
  process.env.RELEASE_GO_NO_GO_OUTPUT_FILE ??
  join(evidenceRoot, "go-no-go", `go-no-go-${timestamp}.txt`);

const documentChecks = [
  {
    label: "UAT evidence pack has no pending placeholders",
    file: uatEvidenceFile,
    forbidden: ["Pending", "TBD"],
  },
  {
    label:
      "Deployment and rollback evidence checklist has no pending placeholders",
    file: deploymentEvidenceFile,
    forbidden: ["Pending", "TBD"],
  },
  {
    label:
      "Training impact assessment has no pending checklist items/placeholders",
    file: trainingEvidenceFile,
    forbidden: ["[ ]", "Pending", "TBD"],
  },
];

const signedEvidenceChecks = [
  {
    label: "Signed UAT evidence pack",
    file:
      process.env.RELEASE_UAT_EVIDENCE_FILE ??
      join(evidenceRoot, "signed-documents", "uat-evidence-pack.md"),
    forbidden: ["Pending", "TBD"],
  },
  {
    label: "Signed deployment and rollback evidence",
    file:
      process.env.RELEASE_DEPLOYMENT_EVIDENCE_FILE ??
      join(evidenceRoot, "signed-documents", "deployment-rollback-evidence.md"),
    forbidden: ["Pending", "TBD"],
  },
  {
    label: "Signed training impact assessment",
    file:
      process.env.RELEASE_TRAINING_EVIDENCE_FILE ??
      join(evidenceRoot, "signed-documents", "training-impact-assessment.md"),
    forbidden: ["[ ]", "Pending", "TBD"],
  },
];

const artifactChecks = [
  {
    label: "Web production build check",
    pattern: /^build-check-.*\.txt$/,
    directory: join(evidenceRoot, "build-check"),
    requiredContent: [
      "RESULT | PASS | Web production build completed in .next-build-check.",
    ],
  },
  {
    label: "Secret and no-queue review",
    pattern: /^secret-review-.*\.txt$/,
    directory: join(evidenceRoot, "secret-review"),
    requiredContent: [
      "RESULT | PASS | No tracked env files, key artifacts, or high-risk secret patterns found.",
    ],
  },
  {
    label: "Release summary metadata preflight",
    pattern: /^release-summary-preflight-.*\.txt$/,
    directory: evidenceRoot,
    requiredContent: [
      "RESULT | PASS | Release summary metadata prerequisites are configured.",
    ],
  },
  {
    label: "Release candidate summary",
    pattern: /^release-summary\.txt$/,
    directory: evidenceRoot,
    requiredContent: [
      "evidence_run_id=",
      "release_version=",
      "github_run_id=",
      "github_sha=",
      "verified_at_utc=",
      "RESULT | PASS | Release candidate summary captured.",
    ],
  },
  {
    label: "Release helper self-test",
    pattern: /^release-tools-self-test-.*\.txt$/,
    directory: join(evidenceRoot, "self-tests"),
    requiredContent: [
      "RESULT | PASS | Release helper self-test passed.",
      "PASS | GO / NO-GO report remains NO-GO when required evidence is missing.",
    ],
  },
  {
    label: "Release evidence manifest",
    pattern: /^release-evidence-manifest-.*\.txt$/,
    directory: join(evidenceRoot, "manifests"),
    requiredContent: finalManifestRequiredContent,
    requiredPatterns: finalManifestRequiredPatterns,
    requireFreshManifest: true,
  },
  {
    label: "Data snapshot preflight",
    pattern: /^data-snapshot-preflight-.*\.txt$/,
    directory: join(evidenceRoot, "data-snapshots"),
    requiredAnyContent: [
      "RESULT | PASS | Data snapshot prerequisites are configured.",
    ],
  },
  {
    label: "Staging rehearsal pre-migration data snapshot",
    pattern: /^data-pre-migration-rehearsal-.*\.txt$/,
    directory: join(evidenceRoot, "data-snapshots"),
    requiredContent: [
      "Evidence run ID:",
      "Database URL fingerprint:",
      "RESULT | PASS | Data snapshot captured",
    ],
  },
  {
    label: "Staging rehearsal post-migration data snapshot",
    pattern: /^data-post-migration-rehearsal-.*\.txt$/,
    directory: join(evidenceRoot, "data-snapshots"),
    requiredContent: [
      "Evidence run ID:",
      "Database URL fingerprint:",
      "RESULT | PASS | Data snapshot captured",
    ],
  },
  {
    label: "Staging rehearsal data-snapshot delta report",
    pattern: /^data-snapshot-delta-.*\.txt$/,
    directory: join(evidenceRoot, "data-snapshots"),
    requiredContent: [
      "Before evidence run ID:",
      "After evidence run ID:",
      "Before database fingerprint:",
      "After database fingerprint:",
      "RESULT | PASS | Snapshot delta captured",
    ],
  },
  {
    label: "Data snapshot readiness status",
    pattern: /^data-snapshot-status-.*\.txt$/,
    directory: join(evidenceRoot, "data-snapshot-status"),
    requiredContent: [
      "PASS | Pre/post snapshot consistency",
      "PASS | Data snapshot delta consistency",
      "RESULT | PASS | Data snapshot rehearsal evidence is present",
    ],
  },
  {
    label: "Backup/restore preflight",
    pattern: /^backup-restore-preflight-.*\.txt$/,
    directory: join(evidenceRoot, "backups"),
    requiredContent: [
      "RESULT | PASS | Backup and restore prerequisites are configured.",
    ],
  },
  {
    label: "Backup artifact",
    pattern: /^ogfi-erp-.*\.dump$/,
    directory: join(evidenceRoot, "backups"),
  },
  {
    label: "Backup summary",
    pattern: /^backup-summary\.txt$/,
    directory: join(evidenceRoot, "backups"),
    requiredContent: [
      "evidence_run_id=",
      "backup_file=",
      "backup_size_bytes=",
      "backup_checksum_status=present",
      "verified_at_utc=",
      "RESULT | PASS | Backup summary captured.",
    ],
  },
  {
    label: "Backup checksum artifact",
    pattern: /^ogfi-erp-.*\.dump\.sha256$/,
    directory: join(evidenceRoot, "backups"),
  },
  {
    label: "Restore-check summary",
    pattern: /^restore-check-summary\.txt$/,
    directory: join(evidenceRoot, "backups"),
    requiredContent: [
      "evidence_run_id=",
      "backup_file=",
      "restore_database=",
      "restore_target_safety=passed",
      "verified_at_utc=",
      "RESULT | PASS | Restore-check summary captured.",
    ],
  },
  {
    label: "Backup restore readiness status",
    pattern: /^backup-restore-status-.*\.txt$/,
    directory: join(evidenceRoot, "backup-restore-status"),
    requiredContent: [
      "PASS | Backup/restore evidence consistency",
      "RESULT | PASS | Backup, restore, and rollback evidence is present",
    ],
  },
  {
    label: "Deployment and rollback status",
    pattern: /^deployment-status-.*\.txt$/,
    directory: join(evidenceRoot, "deployment-status"),
    requiredContent: [
      "Evidence run ID:",
      "RESULT | PASS | Deployment, rollback, backup/restore, smoke, and signoff evidence has no unresolved placeholders.",
    ],
  },
  {
    label: "Pilot readiness preflight",
    pattern: /^pilot-readiness-preflight-.*\.txt$/,
    directory: join(evidenceRoot, "pilot-readiness"),
    requiredAnyContent: [
      "RESULT | PASS | Pilot readiness prerequisites are configured.",
    ],
  },
  {
    label: "Pilot readiness report",
    pattern: /^pilot-readiness-(?!preflight).*\.txt$/,
    directory: join(evidenceRoot, "pilot-readiness"),
    requiredContent: [
      "Evidence run ID:",
      "Database URL fingerprint:",
      "RESULT | PASS | Pilot setup is ready for UAT execution evidence capture.",
    ],
  },
  {
    label: "UAT status report",
    pattern: /^uat-status-.*\.txt$/,
    directory: join(evidenceRoot, "uat-status"),
    requiredContent: [
      "Evidence run ID:",
      "RESULT | PASS | UAT evidence pack has no unresolved execution placeholders.",
    ],
  },
  {
    label: "Pilot UAT readiness status",
    pattern: /^pilot-uat-status-.*\.txt$/,
    directory: join(evidenceRoot, "pilot-uat-status"),
    requiredContent: [
      "PASS | Pilot readiness / UAT recency",
      "PASS | Pilot readiness / UAT evidence run",
      "RESULT | PASS | Pilot setup and UAT evidence are ready for release review.",
    ],
  },
  {
    label: "Enablement hypercare status",
    pattern: /^enablement-status-.*\.txt$/,
    directory: join(evidenceRoot, "enablement-status"),
    requiredContent: [
      "Evidence run ID:",
      "RESULT | PASS | Enablement, training, and hypercare evidence has no unresolved placeholders.",
    ],
  },
  {
    label: "Signed evidence status",
    pattern: /^signed-evidence-status-.*\.txt$/,
    directory: join(evidenceRoot, "signed-evidence-status"),
    requiredContent: [
      "RESULT | PASS | Signed evidence documents are present and have no unresolved placeholders.",
    ],
  },
  {
    label: "Release smoke report",
    pattern: /^smoke-.*\.txt$/,
    directory: join(evidenceRoot, "smoke"),
    requiredContent: [
      "api-health /api/health expected=200 actual=200",
      "api-readiness /api/readiness expected=200 actual=200",
      "health /health expected=200 actual=200",
      "readiness /readiness expected=200 actual=200",
      "protected-items-route /items expected=3xx actual=307",
    ],
  },
  {
    label: "Staging rollback summary",
    pattern: /^rollback-summary\.txt$/,
    directory: join(evidenceRoot, "staging-rollback"),
    requiredContent: [
      "evidence_run_id=",
      "rollback_release_version=",
      "verified_at_utc=",
      "RESULT | PASS | Staging rollback summary captured.",
    ],
  },
  {
    label: "Post-rollback smoke report",
    pattern: /^smoke-.*\.txt$/,
    directory: join(evidenceRoot, "staging-rollback", "smoke"),
    requiredContent: [
      "api-health /api/health expected=200 actual=200",
      "api-readiness /api/readiness expected=200 actual=200",
      "health /health expected=200 actual=200",
      "readiness /readiness expected=200 actual=200",
      "protected-items-route /items expected=3xx actual=307",
    ],
  },
];

const blockerGuidance = new Map([
  [
    "UAT evidence pack has no pending placeholders",
    {
      severity: "Critical",
      owner: "QA Lead / Operations Lead",
      evidence: "completed UAT evidence pack with tester, result, evidence reference, disposition, and signoff",
    },
  ],
  [
    "Deployment and rollback evidence checklist has no pending placeholders",
    {
      severity: "Critical",
      owner: "DevOps Owner / Release Manager",
      evidence: "completed deployment, backup/restore, rollback, smoke, monitoring, and signoff checklist",
    },
  ],
  [
    "Training impact assessment has no pending checklist items/placeholders",
    {
      severity: "High",
      owner: "Enablement Owner / Operations Owner",
      evidence: "completed training attendance, known-limit acknowledgement, follow-up owner, and signoff rows",
    },
  ],
  [
    "Release summary metadata preflight",
    {
      severity: "High",
      owner: "Release Manager",
      evidence: "passing release-summary-preflight artifact with configured release metadata",
    },
  ],
  [
    "Release candidate summary",
    {
      severity: "High",
      owner: "Release Manager",
      evidence: "release-summary.txt generated from approved release metadata",
    },
  ],
  [
    "Release evidence manifest",
    {
      severity: "Critical",
      owner: "Release Manager",
      evidence: "fresh final manifest after all evidence and signed documents are collected",
    },
  ],
  [
    "Evidence run consistency",
    {
      severity: "Critical",
      owner: "Release Manager / Product Owner",
      evidence: "all final evidence artifacts generated in the same RELEASE_EVIDENCE_RUN_ID session",
    },
  ],
  [
    "Staging rehearsal pre-migration data snapshot",
    {
      severity: "Critical",
      owner: "DBA / Platform Engineering",
      evidence: "pre-migration rehearsal snapshot artifact",
    },
  ],
  [
    "Staging rehearsal post-migration data snapshot",
    {
      severity: "Critical",
      owner: "DBA / Platform Engineering",
      evidence: "post-migration rehearsal snapshot artifact",
    },
  ],
  [
    "Staging rehearsal data-snapshot delta report",
    {
      severity: "Critical",
      owner: "DBA / Platform Engineering",
      evidence: "reviewed snapshot delta artifact",
    },
  ],
  [
    "Data snapshot readiness status",
    {
      severity: "Critical",
      owner: "DBA / Platform Engineering",
      evidence: "passing data-snapshot-status report proving pre/post snapshot consistency",
    },
  ],
  [
    "Backup artifact",
    {
      severity: "Critical",
      owner: "DevOps Owner",
      evidence: "database backup dump from release rehearsal",
    },
  ],
  [
    "Backup summary",
    {
      severity: "Critical",
      owner: "DevOps Owner",
      evidence: "backup-summary.txt with checksum and PASS marker",
    },
  ],
  [
    "Restore-check summary",
    {
      severity: "Critical",
      owner: "DevOps Owner / DBA",
      evidence: "restore-check-summary.txt from isolated restore verification",
    },
  ],
  [
    "Backup restore readiness status",
    {
      severity: "Critical",
      owner: "DevOps Owner / Release Manager",
      evidence: "passing backup-restore-status report proving backup, restore, rollback, and post-rollback smoke readiness",
    },
  ],
  [
    "Deployment and rollback status",
    {
      severity: "Critical",
      owner: "DevOps Owner / Release Manager",
      evidence: "passing deployment-status artifact for the same evidence run as GO / NO-GO review",
    },
  ],
  [
    "Pilot readiness report",
    {
      severity: "Critical",
      owner: "QA Lead / Operations Lead",
      evidence: "DB-backed pilot-readiness report against selected pilot or staging database",
    },
  ],
  [
    "UAT status report",
    {
      severity: "Critical",
      owner: "QA Lead / Operations Lead",
      evidence: "passing uat-status report proving UAT rows and focused evidence have no unresolved placeholders",
    },
  ],
  [
    "Pilot UAT readiness status",
    {
      severity: "Critical",
      owner: "QA Lead / Operations Lead",
      evidence: "passing pilot-uat-status report proving DB readiness, UAT completion, recency, and evidence-run consistency",
    },
  ],
  [
    "Enablement hypercare status",
    {
      severity: "High",
      owner: "Enablement Owner / Operations Owner",
      evidence: "passing enablement-status report proving training and hypercare evidence has no unresolved placeholders",
    },
  ],
  [
    "Signed evidence status",
    {
      severity: "Critical",
      owner: "Release Manager / Product Owner",
      evidence: "passing signed-evidence-status report proving all signed documents satisfy signoff contract",
    },
  ],
  [
    "Staging rollback summary",
    {
      severity: "Critical",
      owner: "Release Manager / DevOps Owner",
      evidence: "rollback-summary.txt for approved rollback rehearsal",
    },
  ],
  [
    "Post-rollback smoke report",
    {
      severity: "Critical",
      owner: "DevOps Owner / QA Lead",
      evidence: "post-rollback smoke artifact proving health/readiness and protected-route behavior",
    },
  ],
  [
    "Signed UAT evidence pack",
    {
      severity: "Critical",
      owner: "QA Lead / Product Owner",
      evidence: "owner-approved UAT evidence pack copied into signed-documents/ or configured with RELEASE_UAT_EVIDENCE_FILE",
    },
  ],
  [
    "Signed deployment and rollback evidence",
    {
      severity: "Critical",
      owner: "DevOps Owner / Release Manager",
      evidence: "owner-approved deployment, backup/restore, rollback, smoke, and monitoring evidence copied into signed-documents/ or configured with RELEASE_DEPLOYMENT_EVIDENCE_FILE",
    },
  ],
  [
    "Signed training impact assessment",
    {
      severity: "High",
      owner: "Enablement Owner / Operations Owner",
      evidence: "owner-approved training impact assessment copied into signed-documents/ or configured with RELEASE_TRAINING_EVIDENCE_FILE",
    },
  ],
]);

mkdirSync(dirname(outputFile), { recursive: true });

const lines = [
  "OGFI ERP Phase I / Phase 1.5 GO / NO-GO evidence summary",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  `UAT evidence file: ${uatEvidenceFile}`,
  `Deployment evidence file: ${deploymentEvidenceFile}`,
  `Training evidence file: ${trainingEvidenceFile}`,
  "",
  "This report is advisory. It does not approve release. Named owners must still sign the UAT, deployment, training, and GO/NO-GO records.",
  "Download or copy workflow artifacts into the evidence root before running this command.",
  "",
  "Document Gates",
];

let blockingFailures = 0;
let warnings = 0;
const ownerSummary = new Map();

for (const check of documentChecks) {
  const result = evaluateDocument(check);
  if (result.status === "PASS") {
    lines.push(`PASS | ${check.label} | ${result.detail}`);
  } else {
    blockingFailures += 1;
    addOwnerSummary(check.label);
    lines.push(`FAIL | ${check.label} | ${result.detail}`);
    lines.push(formatGuidance(check.label));
  }
}

lines.push("", "Signed Evidence Gates");

for (const check of signedEvidenceChecks) {
  const result = evaluateSignedEvidenceDocument(check);
  if (result.status === "PASS") {
    lines.push(`PASS | ${check.label} | ${result.detail}`);
  } else {
    blockingFailures += 1;
    addOwnerSummary(check.label);
    lines.push(`FAIL | ${check.label} | ${result.detail}`);
    lines.push(formatGuidance(check.label));
  }
}

lines.push("", "Artifact Gates");

for (const check of artifactChecks) {
  const result = evaluateArtifact(check);
  if (result.status === "PASS") {
    lines.push(`PASS | ${check.label} | ${result.detail}`);
    continue;
  }

  if (check.optional) {
    warnings += 1;
    lines.push(`WARN | ${check.label} | ${result.detail}`);
    continue;
  }

  blockingFailures += 1;
  addOwnerSummary(check.label);
  lines.push(`FAIL | ${check.label} | ${result.detail}`);
  lines.push(formatGuidance(check.label));
}

lines.push("", "Evidence Session Gates");
const runConsistency = evaluateEvidenceRunConsistency(evidenceRoot);
if (runConsistency.pass) {
  lines.push(`PASS | Evidence run consistency | ${runConsistency.detail}`);
} else {
  blockingFailures += 1;
  addOwnerSummary("Evidence run consistency");
  lines.push(`FAIL | Evidence run consistency | ${runConsistency.detail}`);
  lines.push(formatGuidance("Evidence run consistency"));
}

lines.push("", "GO / NO-GO Owner Summary");
if (ownerSummary.size === 0) {
  lines.push("PASS | none");
} else {
  lines.push(
    "OWNER | severity=Critical | owner=Release Manager / Product Owner | evidence=assign each failed GO / NO-GO gate to its named evidence owner before signoff",
  );
  for (const [owner, count] of [...ownerSummary.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    lines.push(`FAIL | ${owner} | blocking_gate_count=${count}`);
  }
}

lines.push("");
if (blockingFailures > 0) {
  lines.push(
    `RESULT | NO-GO | ${blockingFailures} blocking gate(s) are missing or still pending. Warnings: ${warnings}.`,
  );
  lines.push(
    "Next action: complete the missing evidence, rerun this report, then obtain named owner signoff.",
  );
} else if (warnings > 0) {
  lines.push(
    `RESULT | CONDITIONAL GO REVIEW | No blocking gates failed, but ${warnings} warning(s) need owner review before signoff.`,
  );
} else {
  lines.push(
    "RESULT | GO REVIEW READY | All scanned gates passed. Named owner signoff is still required.",
  );
}

writeFileSync(outputFile, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));

function evaluateDocument(check) {
  if (!existsSync(check.file)) {
    return { status: "FAIL", detail: `missing file: ${check.file}` };
  }

  const content = readFileSync(check.file, "utf8");
  const counts = check.forbidden
    .map((token) => [token, countOccurrences(content, token)])
    .filter(([, count]) => count > 0);

  if (counts.length === 0) {
    return { status: "PASS", detail: check.file };
  }

  const summary = counts
    .map(([token, count]) => `${token}=${count}`)
    .join(", ");
  return {
    status: "FAIL",
    detail: `${check.file}; unresolved markers: ${summary}`,
  };
}

function formatGuidance(label) {
  const guidance = blockerGuidance.get(label);
  if (!guidance) {
    return "  OWNER | severity=Review | owner=Release Manager | evidence=review missing gate and attach required artifact";
  }

  return `  OWNER | severity=${guidance.severity} | owner=${guidance.owner} | evidence=${guidance.evidence}`;
}

function addOwnerSummary(label) {
  const guidance = blockerGuidance.get(label) ?? {
    owner: "Release Manager",
  };
  ownerSummary.set(guidance.owner, (ownerSummary.get(guidance.owner) ?? 0) + 1);
}

function evaluateArtifact(check) {
  if (!existsSync(check.directory)) {
    return { status: "FAIL", detail: `missing directory: ${check.directory}` };
  }

  const files = readdirSync(check.directory).filter((file) =>
    check.pattern.test(file),
  );
  if (files.length === 0) {
    return {
      status: "FAIL",
      detail: `no matching artifact in ${check.directory}`,
    };
  }

  if (
    check.requiredContent?.length ||
    check.requiredAnyContent?.length ||
    check.requiredPatterns?.length
  ) {
    const sortedFiles = files.sort();
    const latestFile = sortedFiles.at(-1);
    const content = latestFile
      ? readFileSync(join(check.directory, latestFile), "utf8")
      : "";
    const missingMarkers = (check.requiredContent ?? []).filter(
      (required) => !content.includes(required),
    );
    const anyMarkerMissing =
      check.requiredAnyContent?.length &&
      !check.requiredAnyContent.some((required) => content.includes(required));
    if (anyMarkerMissing) {
      missingMarkers.push(
        `one of: ${check.requiredAnyContent.join(" OR ")}`,
      );
    }
    for (const pattern of check.requiredPatterns ?? []) {
      if (!pattern.test(content)) {
        missingMarkers.push(`pattern: ${pattern.source}`);
      }
    }

    if (missingMarkers.length > 0) {
      return {
        status: "FAIL",
        detail: `matching artifact found but required marker(s) missing in ${latestFile}: ${missingMarkers.join(", ")}`,
      };
    }

    if (check.requireFreshManifest) {
      const freshness = evaluateManifestFreshness(
        evidenceRoot,
        join(check.directory, latestFile),
      );
      if (!freshness.pass) {
        return {
          status: "FAIL",
          detail: `matching artifact found but stale in ${latestFile}: ${freshness.detail}`,
        };
      }
    }

    return {
      status: "PASS",
      detail: latestFile,
    };
  }

  return { status: "PASS", detail: files.slice(-3).join(", ") };
}

function countOccurrences(content, token) {
  let count = 0;
  let index = content.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = content.indexOf(token, index + token.length);
  }

  return count;
}
