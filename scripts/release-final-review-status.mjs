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
import { evaluateManifestFreshness } from "./release-evidence-freshness.mjs";
import {
  evaluateChecksumSidecar,
  evaluateManifestChecksum,
} from "./release-manifest-integrity.mjs";
import {
  failedMetadataChecks,
  getReleaseSummaryMetadata,
  validateReleaseSummaryMetadata,
} from "./release-summary-metadata.mjs";
import { evidenceRunId } from "./release-evidence-metadata.mjs";
import { evaluateEvidenceRunConsistency } from "./release-evidence-run-consistency.mjs";
import { evaluateSignedEvidenceDocument } from "./release-signed-evidence-contract.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const outputFile =
  process.env.RELEASE_FINAL_REVIEW_STATUS_OUTPUT_FILE ??
  join(evidenceRoot, "final-review-status", `final-review-status-${timestamp}.txt`);

const documentChecks = [
  {
    label: "UAT evidence pack placeholders cleared",
    file:
      process.env.RELEASE_UAT_EVIDENCE_FILE ??
      "docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md",
    forbidden: ["Pending", "TBD"],
  },
  {
    label: "Deployment and rollback checklist placeholders cleared",
    file:
      process.env.RELEASE_DEPLOYMENT_EVIDENCE_FILE ??
      "docs/core/07-quality/PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md",
    forbidden: ["Pending", "TBD"],
  },
  {
    label: "Training impact assessment placeholders cleared",
    file:
      process.env.RELEASE_TRAINING_EVIDENCE_FILE ??
      "docs/core/08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md",
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
  requiredArtifact("Release summary preflight PASS", ".", /^release-summary-preflight-.*\.txt$/, [
    "RESULT | PASS | Release summary metadata prerequisites are configured.",
  ]),
  requiredArtifact("Release candidate summary", ".", /^release-summary\.txt$/, [
    "evidence_run_id=",
    "RESULT | PASS | Release candidate summary captured.",
  ]),
  requiredArtifact("Evidence manifest", "manifests", /^release-evidence-manifest-.*\.txt$/, [
    "RESULT | PASS | Release evidence manifest captured.",
  ], finalManifestRequiredPatterns, true),
  requiredArtifact("Data snapshot preflight PASS", "data-snapshots", /^data-snapshot-preflight-.*\.txt$/, [
    "RESULT | PASS | Data snapshot prerequisites are configured.",
  ]),
  requiredArtifact("Pre-migration data snapshot", "data-snapshots", /^data-pre-migration-rehearsal-.*\.txt$/, [
    "Evidence run ID:",
    "Database URL fingerprint:",
    "RESULT | PASS | Data snapshot captured",
  ]),
  requiredArtifact("Post-migration data snapshot", "data-snapshots", /^data-post-migration-rehearsal-.*\.txt$/, [
    "Evidence run ID:",
    "Database URL fingerprint:",
    "RESULT | PASS | Data snapshot captured",
  ]),
  requiredArtifact("Data snapshot delta", "data-snapshots", /^data-snapshot-delta-.*\.txt$/, [
    "Before evidence run ID:",
    "After evidence run ID:",
    "Before database fingerprint:",
    "After database fingerprint:",
    "RESULT | PASS | Snapshot delta captured",
  ]),
  requiredArtifact("Data snapshot readiness status", "data-snapshot-status", /^data-snapshot-status-.*\.txt$/, [
    "PASS | Pre/post snapshot consistency",
    "PASS | Data snapshot delta consistency",
    "RESULT | PASS | Data snapshot rehearsal evidence is present",
  ]),
  requiredArtifact("Backup dump", "backups", /^ogfi-erp-.*\.dump$/),
  requiredArtifact("Backup checksum artifact", "backups", /^ogfi-erp-.*\.dump\.sha256$/),
  requiredArtifact("Backup/restore preflight PASS", "backups", /^backup-restore-preflight-.*\.txt$/, [
    "RESULT | PASS | Backup and restore prerequisites are configured.",
  ]),
  requiredArtifact("Backup summary", "backups", /^backup-summary\.txt$/, [
    "evidence_run_id=",
    "backup_checksum_status=present",
    "RESULT | PASS | Backup summary captured.",
  ]),
  requiredArtifact("Restore-check summary", "backups", /^restore-check-summary\.txt$/, [
    "evidence_run_id=",
    "restore_target_safety=passed",
    "RESULT | PASS | Restore-check summary captured.",
  ]),
  requiredArtifact("Backup restore readiness status", "backup-restore-status", /^backup-restore-status-.*\.txt$/, [
    "PASS | Backup/restore evidence consistency",
    "RESULT | PASS | Backup, restore, and rollback evidence is present",
  ]),
  requiredArtifact("Deployment and rollback status", "deployment-status", /^deployment-status-.*\.txt$/, [
    "Evidence run ID:",
    "RESULT | PASS | Deployment, rollback, backup/restore, smoke, and signoff evidence has no unresolved placeholders.",
  ]),
  requiredArtifact("Release readiness register export", "release-readiness-register", /^release-readiness-register-.*\.csv$/, [
    "Evidence run ID,",
    "Source Decision,DEC-0036",
    "RESULT,PASS,Release readiness register export captured.",
  ], [], false, true),
  requiredArtifact("Release readiness register checksum", "release-readiness-register", /^release-readiness-register-.*\.csv\.sha256$/),
  requiredArtifact("External MFA provider proof", "external-security", /^mfa-provider-enrollment-and-runtime-proof\..+$/, [
    "Evidence run ID:",
    "RESULT | PASS | External security proof captured.",
  ]),
  requiredArtifact("External IdP session invalidation proof", "external-security", /^idp-session-invalidation-proof\..+$/, [
    "Evidence run ID:",
    "RESULT | PASS | External security proof captured.",
  ]),
  requiredArtifact("External evidence storage index", "external-security", /^vault-or-artifact-storage-index\..+$/, [
    "Evidence run ID:",
    "RESULT | PASS | External security proof captured.",
  ]),
  requiredArtifact("External break-glass review proof", "external-security", /^break-glass-review-and-revocation-proof\..+$/, [
    "Evidence run ID:",
    "RESULT | PASS | External security proof captured.",
  ]),
  requiredArtifact("Pilot readiness preflight PASS", "pilot-readiness", /^pilot-readiness-preflight-.*\.txt$/, [
    "RESULT | PASS | Pilot readiness prerequisites are configured.",
    "PILOT_REQUIRE_RELEASE_GATES_READY=true",
  ]),
  requiredArtifact("Pilot readiness report", "pilot-readiness", /^pilot-readiness-(?!preflight).*\.txt$/, [
    "Evidence run ID:",
    "Database URL fingerprint:",
    "requireReleaseGatesReady=true",
    "DEC-0036 strict release gate status",
    "Pending controlled access requests",
    "Privileged users missing verified MFA evidence",
    "Pending provider session invalidations",
    "Break-glass access open or post-review due",
    "RESULT | PASS | Pilot setup is ready for UAT execution evidence capture.",
  ]),
  requiredArtifact("UAT status report", "uat-status", /^uat-status-.*\.txt$/, [
    "Evidence run ID:",
    "RESULT | PASS | UAT evidence pack has no unresolved execution placeholders.",
  ]),
  requiredArtifact("Pilot UAT readiness status", "pilot-uat-status", /^pilot-uat-status-.*\.txt$/, [
    "PASS | Pilot readiness / UAT recency",
    "PASS | Pilot readiness / UAT evidence run",
    "RESULT | PASS | Pilot setup and UAT evidence are ready for release review.",
  ]),
  requiredArtifact("Enablement hypercare status", "enablement-status", /^enablement-status-.*\.txt$/, [
    "Evidence run ID:",
    "RESULT | PASS | Enablement, training, and hypercare evidence has no unresolved placeholders.",
  ]),
  requiredArtifact("Signed evidence status", "signed-evidence-status", /^signed-evidence-status-.*\.txt$/, [
    "RESULT | PASS | Signed and external security evidence documents are present and have no unresolved placeholders.",
  ]),
  requiredArtifact("Staging rollback summary", "staging-rollback", /^rollback-summary\.txt$/, [
    "evidence_run_id=",
    "RESULT | PASS | Staging rollback summary captured.",
  ]),
  requiredArtifact("Post-rollback smoke report", "staging-rollback/smoke", /^smoke-.*\.txt$/, [
    "api-health /api/health expected=200 actual=200",
    "api-readiness /api/readiness expected=200 actual=200",
    "protected-items-route /items expected=3xx actual=307",
  ]),
];

const blockerGuidance = new Map([
  [
    "Release summary metadata incomplete",
    {
      severity: "High",
      owner: "Release Manager",
      evidence:
        "RELEASE_VERSION, GITHUB_RUN_ID, GITHUB_SHA, environment, and migration mode",
    },
  ],
  [
    "UAT evidence pack placeholders cleared",
    {
      severity: "Critical",
      owner: "QA Lead / Operations Lead",
      evidence: "completed UAT rows with tester, date, result, evidence, and owner signoff",
    },
  ],
  [
    "Deployment and rollback checklist placeholders cleared",
    {
      severity: "Critical",
      owner: "DevOps Owner / Release Manager",
      evidence: "deployment, backup/restore, rollback, smoke, monitoring, and signoff rows",
    },
  ],
  [
    "Training impact assessment placeholders cleared",
    {
      severity: "High",
      owner: "Enablement Owner / Operations Owner",
      evidence: "training attendance, known-limit acknowledgement, follow-up owners, and signoff",
    },
  ],
  [
    "Release summary preflight PASS",
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
      evidence: "release-summary.txt generated with approved release metadata",
    },
  ],
  [
    "Evidence manifest",
    {
      severity: "Critical",
      owner: "Release Manager",
      evidence: "fresh manifest generated after all final evidence files are collected",
    },
  ],
  [
    "Evidence run consistency",
    {
      severity: "Critical",
      owner: "Release Manager / Product Owner",
      evidence:
        "all final evidence artifacts, signed documents, and external-security proof references generated in the same RELEASE_EVIDENCE_RUN_ID session",
    },
  ],
  [
    "Release readiness register export",
    {
      severity: "Critical",
      owner: "Release Manager",
      evidence:
        "DB-backed release readiness register CSV exported after Admin > Release Readiness gates, evidence records, and Release Board decisions are current",
    },
  ],
  [
    "External MFA provider proof",
    {
      severity: "Critical",
      owner: "Security Owner / IT Owner",
      evidence:
        "provider-side MFA enrollment and runtime challenge proof for privileged users copied to external-security/mfa-provider-enrollment-and-runtime-proof.<approved-extension> with matching Evidence run ID and RESULT | PASS | External security proof captured.",
    },
  ],
  [
    "External IdP session invalidation proof",
    {
      severity: "Critical",
      owner: "Security Owner / IT Owner",
      evidence:
        "identity-provider session termination proof for ERP invalidation records copied to external-security/idp-session-invalidation-proof.<approved-extension> with matching Evidence run ID and RESULT | PASS | External security proof captured.",
    },
  ],
  [
    "External evidence storage index",
    {
      severity: "Critical",
      owner: "Security Owner / IT Owner",
      evidence:
        "vault or approved evidence-repository index copied to external-security/vault-or-artifact-storage-index.<approved-extension> with matching Evidence run ID and RESULT | PASS | External security proof captured.",
    },
  ],
  [
    "External break-glass review proof",
    {
      severity: "Critical",
      owner: "Security Owner / IT Owner",
      evidence:
        "break-glass revocation and post-use review proof copied to external-security/break-glass-review-and-revocation-proof.<approved-extension> with matching Evidence run ID and RESULT | PASS | External security proof captured.",
    },
  ],
  [
    "Pre-migration data snapshot",
    {
      severity: "Critical",
      owner: "DBA / Platform Engineering",
      evidence: "pre-migration rehearsal data snapshot artifact",
    },
  ],
  [
    "Post-migration data snapshot",
    {
      severity: "Critical",
      owner: "DBA / Platform Engineering",
      evidence: "post-migration rehearsal data snapshot artifact",
    },
  ],
  [
    "Data snapshot delta",
    {
      severity: "Critical",
      owner: "DBA / Platform Engineering",
      evidence: "reviewed data snapshot delta artifact",
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
    "Data snapshot preflight PASS",
    {
      severity: "High",
      owner: "DBA / Platform Engineering",
      evidence: "passing data-snapshot-preflight artifact for the selected rehearsal database",
    },
  ],
  [
    "Backup dump",
    {
      severity: "Critical",
      owner: "DevOps Owner",
      evidence: "database backup dump artifact from the release rehearsal",
    },
  ],
  [
    "Backup/restore preflight PASS",
    {
      severity: "High",
      owner: "DevOps Owner / DBA",
      evidence: "passing backup/restore preflight artifact for the selected source and restore databases",
    },
  ],
  [
    "Backup summary",
    {
      severity: "Critical",
      owner: "DevOps Owner",
      evidence: "backup-summary.txt with size, checksum, timestamp, and PASS marker",
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
      evidence: "passing deployment-status artifact for the same evidence run as final review",
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
    "Pilot readiness preflight PASS",
    {
      severity: "High",
      owner: "QA Lead / Operations Lead",
      evidence: "passing pilot readiness preflight artifact for the selected pilot or staging database",
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
      evidence:
        "passing signed-evidence-status report proving all signed documents satisfy signoff contract and external-security proof references are present",
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

const metadata = getReleaseSummaryMetadata();
const metadataFailures = failedMetadataChecks(
  validateReleaseSummaryMetadata(metadata),
);
const ownerSummary = new Map();

const lines = [
  "OGFI ERP Phase I / Phase 1.5 final review readiness status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This status report does not approve release. It identifies final-review blockers without generating signed evidence or release-summary.txt.",
  "",
  "Release Metadata",
  metadataFailures.length === 0
    ? "PASS | Release summary metadata configured."
    : `BLOCKED | Release summary metadata incomplete | ${metadataFailures.join(", ")}`,
  `INFO | evidence_run_id=${metadata.evidenceRunId || "not-configured"}`,
  `INFO | release_version_configured=${metadata.releaseVersion ? "yes" : "no"}`,
  `INFO | github_run_id_configured=${metadata.githubRunId ? "yes" : "no"}`,
  `INFO | github_sha_configured=${metadata.githubSha ? "yes" : "no"}`,
  `INFO | deploy_to_staging=${metadata.deployToStaging}`,
  `INFO | environment=${metadata.environment}`,
  `INFO | migration_mode=${metadata.migrationMode}`,
];

let blockers = metadataFailures.length > 0 ? 1 : 0;
if (metadataFailures.length > 0) {
  addOwnerSummary("Release summary metadata incomplete");
  lines.push(formatGuidance("Release summary metadata incomplete"));
}

lines.push("", "Document Gates");

for (const check of documentChecks) {
  const result = evaluateDocument(check);
  if (result.pass) {
    lines.push(`PASS | ${check.label} | ${result.detail}`);
  } else {
    blockers += 1;
    addOwnerSummary(check.label);
    lines.push(`BLOCKED | ${check.label} | ${result.detail}`);
    lines.push(formatGuidance(check.label));
  }
}

lines.push("", "Signed Evidence Gates");

for (const check of signedEvidenceChecks) {
  const result = evaluateSignedEvidenceDocument(check);
  if (result.pass) {
    lines.push(`PASS | ${check.label} | ${result.detail}`);
  } else {
    blockers += 1;
    addOwnerSummary(check.label);
    lines.push(`BLOCKED | ${check.label} | ${result.detail}`);
    lines.push(formatGuidance(check.label));
  }
}

lines.push("", "Artifact Gates");
for (const check of artifactChecks) {
  const result = evaluateArtifact(check);
  if (result.pass) {
    lines.push(`PASS | ${check.label} | ${result.detail}`);
  } else {
    blockers += 1;
    addOwnerSummary(check.label);
    lines.push(`BLOCKED | ${check.label} | ${result.detail}`);
    lines.push(formatGuidance(check.label));
  }
}

lines.push("", "Evidence Session Gates");
const runConsistency = evaluateEvidenceRunConsistency(evidenceRoot);
if (runConsistency.pass) {
  lines.push(`PASS | Evidence run consistency | ${runConsistency.detail}`);
} else {
  blockers += 1;
  addOwnerSummary("Evidence run consistency");
  lines.push(`BLOCKED | Evidence run consistency | ${runConsistency.detail}`);
  lines.push(formatGuidance("Evidence run consistency"));
}

lines.push("", "Final Review Owner Summary");
if (ownerSummary.size === 0) {
  lines.push("PASS | none");
} else {
  lines.push(
    "OWNER | severity=Critical | owner=Release Manager / Product Owner | evidence=assign each final-review blocker to its named evidence owner before GO / NO-GO",
  );
  for (const [owner, count] of [...ownerSummary.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    lines.push(`BLOCKED | ${owner} | blocker_count=${count}`);
  }
}

lines.push("");
if (blockers > 0) {
  lines.push(
    `RESULT | BLOCKED | ${blockers} final-review blocker(s) remain before GO / NO-GO can be ready.`,
  );
  lines.push(
    "Next action: complete real environment evidence, signed documents, external-security proof references, release metadata, manifest refresh, then rerun release:go-no-go.",
  );
} else {
  lines.push(
    "RESULT | READY FOR GO / NO-GO | Final-review prerequisites are present. Run release:go-no-go and obtain named owner signoff.",
  );
}

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Final review readiness status written: ${outputFile}`);

function requiredArtifact(
  label,
  directory,
  pattern,
  requiredContent = [],
  requiredPatterns = [],
  requireFreshManifest = false,
  requireChecksumSidecar = false,
) {
  return {
    label,
    directory,
    pattern,
    requiredContent:
      label === "Evidence manifest"
        ? [...requiredContent, ...finalManifestRequiredContent]
        : requiredContent,
    requiredPatterns,
    requireFreshManifest,
    requireChecksumSidecar,
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

function evaluateDocument(check) {
  if (!existsSync(check.file)) {
    return { pass: false, detail: `missing file: ${check.file}` };
  }

  const content = readFileSync(check.file, "utf8");
  const counts = check.forbidden
    .map((token) => [token, countOccurrences(content, token)])
    .filter(([, count]) => count > 0);

  if (counts.length === 0) {
    return { pass: true, detail: check.file };
  }

  return {
    pass: false,
    detail: counts.map(([token, count]) => `${token}=${count}`).join(", "),
  };
}

function evaluateArtifact(check) {
  const directory = join(evidenceRoot, check.directory);
  if (!existsSync(directory)) {
    return { pass: false, detail: `missing directory: ${directory}` };
  }

  const files = readdirSync(directory).filter((file) => check.pattern.test(file)).sort();
  if (files.length === 0) {
    return { pass: false, detail: `no matching artifact in ${directory}` };
  }

  const latestFile = files.at(-1);
  const latestFilePath = join(directory, latestFile);
  const latestContent = readFileSync(latestFilePath, "utf8");
  const latestPasses =
    check.requiredContent.every((required) => latestContent.includes(required)) &&
    check.requiredPatterns.every((pattern) => pattern.test(latestContent));

  if (!latestPasses) {
    return {
      pass: false,
      detail: `latest matching artifact ${latestFile} is missing: ${missingArtifactMarkers(
        latestFilePath,
        check.requiredContent,
        check.requiredPatterns,
      ).join(", ")}`,
    };
  }

  if (check.requireFreshManifest) {
    const checksum = evaluateManifestChecksum(latestFilePath);
    if (!checksum.pass) {
      return {
        pass: false,
        detail: `latest matching manifest ${latestFile} failed checksum verification: ${checksum.detail}`,
      };
    }

    const freshness = evaluateManifestFreshness(evidenceRoot, latestFilePath);
    if (!freshness.pass) {
      return {
        pass: false,
        detail: `latest matching manifest ${latestFile} is stale: ${freshness.detail}`,
      };
    }
  }

  if (check.requireChecksumSidecar) {
    const checksum = evaluateChecksumSidecar(latestFilePath, check.label);
    if (!checksum.pass) {
      return {
        pass: false,
        detail: `latest matching artifact ${latestFile} failed checksum verification: ${checksum.detail}`,
      };
    }
  }

  return { pass: true, detail: latestFile };
}

function missingArtifactMarkers(filePath, requiredContent, requiredPatterns) {
  const content = readFileSync(filePath, "utf8");
  const missing = requiredContent.filter((required) => !content.includes(required));
  for (const pattern of requiredPatterns) {
    if (!pattern.test(content)) {
      missing.push(`pattern: ${pattern.source}`);
    }
  }

  return missing;
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
