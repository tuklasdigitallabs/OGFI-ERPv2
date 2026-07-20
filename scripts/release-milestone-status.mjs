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
import { evaluateChecksumSidecar } from "./release-manifest-integrity.mjs";
import { evaluateSignedEvidenceDocument } from "./release-signed-evidence-contract.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const outputFile =
  process.env.RELEASE_MILESTONE_OUTPUT_FILE ??
  join(evidenceRoot, "milestones", `milestone-status-${timestamp}.txt`);

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const scripts = packageJson.scripts ?? {};

const milestones = [
  {
    name: "Baseline release-check tooling",
    checks: [
      scriptExists("lint"),
      scriptExists("typecheck"),
      scriptExists("test"),
      scriptExists("test:e2e"),
      scriptExists("release:build-check"),
      fileExists("scripts/release-build-check.mjs"),
      scriptExists("release:tools:test"),
      fileExists("scripts/release-tools-self-test.mjs"),
      fileExists(".github/workflows/ci.yml"),
      artifactExists(
        "build-check",
        /^build-check-.*\.txt$/,
        "RESULT | PASS | Web production build completed in .next-build-check.",
      ),
      artifactExists(
        "self-tests",
        /^release-tools-self-test-.*\.txt$/,
        "RESULT | PASS | Release helper self-test passed.",
      ),
    ],
  },
  {
    name: "Secret and no-queue release guard",
    checks: [
      scriptExists("release:secret-review"),
      fileExists("scripts/release-secret-review.mjs"),
      artifactExists(
        "secret-review",
        /^secret-review-.*\.txt$/,
        "RESULT | PASS | No tracked env files, key artifacts, or high-risk secret patterns found.",
      ),
      fileContains(
        "docs/core/05-technical/DEPLOYMENT_AND_ENVIRONMENT.md",
        "Redis and worker services are future-approved capabilities only",
      ),
      fileContains(
        "docs/core/07-quality/PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md",
        "No queueing functionality is included",
      ),
    ],
  },
  {
    name: "Health/readiness tooling and local smoke evidence",
    checks: [
      scriptExists("release:smoke"),
      fileExists("scripts/release-smoke.mjs"),
      fileExists("apps/web/src/app/health/route.ts"),
      fileExists("apps/web/src/app/readiness/route.ts"),
      artifactExists("smoke", /^smoke-.*\.txt$/, [
        "api-health /api/health expected=200 actual=200",
        "api-readiness /api/readiness expected=200 actual=200",
        "health /health expected=200 actual=200",
        "readiness /readiness expected=200 actual=200",
        "protected-items-route /items expected=3xx actual=307",
      ]),
    ],
  },
  {
    name: "Data snapshot and migration safety evidence",
    checks: [
      scriptExists("release:data-snapshot-preflight"),
      scriptExists("release:data-snapshot"),
      scriptExists("release:data-snapshot:compare"),
      scriptExists("release:data-snapshot:compare-latest"),
      scriptExists("release:data-snapshot-checklist"),
      scriptExists("release:data-snapshot-status"),
      fileExists("scripts/release-data-snapshot-preflight.mjs"),
      fileExists("scripts/release-data-snapshot.mjs"),
      fileExists("scripts/release-data-snapshot-compare.mjs"),
      fileExists("scripts/release-data-snapshot-compare-latest.mjs"),
      fileExists("scripts/release-data-snapshot-checklist.mjs"),
      fileExists("scripts/release-data-snapshot-status.mjs"),
      artifactExists(
        "data-snapshot-checklist",
        /^data-snapshot-checklist-.*\.txt$/,
      ),
      artifactExists(
        "data-snapshots",
        /^data-snapshot-preflight-.*\.txt$/,
        "RESULT | PASS | Data snapshot prerequisites are configured.",
      ),
      artifactHasAllContent(
        "data-snapshot-status",
        /^data-snapshot-status-.*\.txt$/,
        [
          "PASS | Pre/post snapshot consistency",
          "PASS | Data snapshot delta consistency",
          "RESULT | PASS | Data snapshot rehearsal evidence is present",
        ],
      ),
      artifactExists(
        "data-snapshots",
        /^data-pre-migration-rehearsal-.*\.txt$/,
        [
          "Evidence run ID:",
          "Database URL fingerprint:",
          "RESULT | PASS | Data snapshot captured",
        ],
      ),
      artifactExists(
        "data-snapshots",
        /^data-post-migration-rehearsal-.*\.txt$/,
        [
          "Evidence run ID:",
          "Database URL fingerprint:",
          "RESULT | PASS | Data snapshot captured",
        ],
      ),
      artifactExists(
        "data-snapshots",
        /^data-snapshot-delta-.*\.txt$/,
        [
          "Before evidence run ID:",
          "After evidence run ID:",
          "Before database fingerprint:",
          "After database fingerprint:",
          "RESULT | PASS | Snapshot delta captured",
        ],
      ),
    ],
  },
  {
    name: "Backup, restore, and rollback evidence",
    checks: [
      scriptExists("db:backup"),
      scriptExists("db:restore-check"),
      scriptExists("release:backup-restore-preflight"),
      scriptExists("release:backup-summary"),
      scriptExists("release:restore-summary"),
      scriptExists("release:backup-restore-status"),
      scriptExists("release:recovery-checklist"),
      scriptExists("release:deployment-checklist"),
      scriptExists("release:rollback-summary"),
      scriptExists("release:staging:rollback"),
      scriptExists("release:deployment-status"),
      fileExists("scripts/db-backup.mjs"),
      fileExists("scripts/db-restore-check.mjs"),
      fileExists("scripts/release-backup-restore-preflight.mjs"),
      fileExists("scripts/release-backup-summary.mjs"),
      fileExists("scripts/release-restore-summary.mjs"),
      fileExists("scripts/release-backup-restore-status.mjs"),
      fileExists("scripts/release-recovery-evidence-checklist.mjs"),
      fileExists("scripts/release-deployment-evidence-checklist.mjs"),
      fileExists("scripts/release-rollback-summary.mjs"),
      fileExists("scripts/release-deployment-status.mjs"),
      fileExists(".github/workflows/staging-rollback.yml"),
      artifactHasAllContent(
        "deployment-status",
        /^deployment-status-.*\.txt$/,
        [
          "Evidence run ID:",
          "RESULT | PASS | Deployment, rollback, backup/restore, smoke, and signoff evidence has no unresolved placeholders.",
        ],
      ),
      artifactExists(
        "backups",
        /^backup-restore-preflight-.*\.txt$/,
        "RESULT | PASS | Backup and restore prerequisites are configured.",
      ),
      artifactHasAllContent(
        "backup-restore-status",
        /^backup-restore-status-.*\.txt$/,
        [
          "PASS | Backup/restore evidence consistency",
          "RESULT | PASS | Backup, restore, and rollback evidence is present",
        ],
      ),
      artifactExists(
        "recovery-checklist",
        /^recovery-evidence-checklist-.*\.txt$/,
        "OGFI ERP Phase I / Phase 1.5 recovery evidence checklist",
      ),
      artifactExists(
        "deployment-checklist",
        /^deployment-evidence-checklist-.*\.txt$/,
        "OGFI ERP Phase I / Phase 1.5 deployment evidence checklist",
      ),
      artifactExists("backups", /^ogfi-erp-.*\.dump$/),
      artifactExists("backups", /^ogfi-erp-.*\.dump\.sha256$/),
      artifactExists(
        "backups",
        /^backup-summary\.txt$/,
        [
          "evidence_run_id=",
          "backup_file=",
          "backup_size_bytes=",
          "backup_checksum_status=present",
          "verified_at_utc=",
          "RESULT | PASS | Backup summary captured.",
        ],
      ),
      artifactExists(
        "backups",
        /^restore-check-summary\.txt$/,
        [
          "evidence_run_id=",
          "backup_file=",
          "restore_database=",
          "restore_target_safety=passed",
          "verified_at_utc=",
          "RESULT | PASS | Restore-check summary captured.",
        ],
      ),
      artifactExists(
        "staging-rollback",
        /^rollback-summary\.txt$/,
        [
          "evidence_run_id=",
          "rollback_release_version=",
          "verified_at_utc=",
          "RESULT | PASS | Staging rollback summary captured.",
        ],
      ),
      artifactExists("staging-rollback/smoke", /^smoke-.*\.txt$/, [
        "api-health /api/health expected=200 actual=200",
        "api-readiness /api/readiness expected=200 actual=200",
        "protected-items-route /items expected=3xx actual=307",
      ]),
    ],
  },
  {
    name: "Pilot readiness and UAT execution",
    checks: [
      scriptExists("release:pilot-readiness"),
      scriptExists("release:pilot-readiness-preflight"),
      scriptExists("release:uat-checklist"),
      scriptExists("release:uat-status"),
      scriptExists("release:pilot-uat-status"),
      fileExists("scripts/pilot-readiness-check.mjs"),
      fileExists("scripts/pilot-readiness-preflight.mjs"),
      fileExists("scripts/release-uat-execution-checklist.mjs"),
      fileExists("scripts/release-uat-status.mjs"),
      fileExists("scripts/release-pilot-uat-status.mjs"),
      artifactExists(
        "uat-checklist",
        /^uat-execution-checklist-.*\.txt$/,
      ),
      artifactExists(
        "pilot-readiness",
        /^pilot-readiness-preflight-.*\.txt$/,
        [
          "RESULT | PASS | Pilot readiness prerequisites are configured.",
          "PILOT_REQUIRE_RELEASE_GATES_READY=true",
        ],
      ),
      artifactHasAllContent(
        "uat-status",
        /^uat-status-.*\.txt$/,
        [
          "Evidence run ID:",
          "RESULT | PASS | UAT evidence pack has no unresolved execution placeholders.",
        ],
      ),
      artifactHasAllContent(
        "pilot-uat-status",
        /^pilot-uat-status-.*\.txt$/,
        [
          "PASS | Pilot readiness / UAT recency",
          "PASS | Pilot readiness / UAT evidence run",
          "RESULT | PASS | Pilot setup and UAT evidence are ready for release review.",
        ],
      ),
      fileExists("docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md"),
      fileExists(
        "docs/core/07-quality/PHASE1_PHASE1_5_UAT_EXECUTION_SCRIPTS.md",
      ),
      artifactExists(
        "pilot-readiness",
        /^pilot-readiness-(?!preflight).*\.txt$/,
        [
          "Evidence run ID:",
          "Database URL fingerprint:",
          "requireReleaseGatesReady=true",
          "DEC-0036 release readiness registers",
          "DEC-0036 strict release gate status",
          "UAT evidence register table",
          "Deployment evidence register table",
          "Enablement evidence register table",
          "Release Board decision register table",
          "RESULT | PASS | Pilot setup is ready for UAT execution evidence capture.",
        ],
      ),
      documentHasNoPending(
        "docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md",
      ),
    ],
  },
  {
    name: "Training, hypercare, and owner signoff",
    checks: [
      scriptExists("release:enablement-checklist"),
      scriptExists("release:enablement-status"),
      fileExists("scripts/release-enablement-checklist.mjs"),
      fileExists("scripts/release-enablement-status.mjs"),
      artifactExists(
        "enablement-checklist",
        /^enablement-checklist-.*\.txt$/,
      ),
      artifactHasAllContent(
        "enablement-status",
        /^enablement-status-.*\.txt$/,
        [
          "Evidence run ID:",
          "RESULT | PASS | Enablement, training, and hypercare evidence has no unresolved placeholders.",
        ],
      ),
      fileExists(
        "docs/core/08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md",
      ),
      fileExists(
        "docs/core/07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md",
      ),
      documentHasNoPending(
        "docs/core/08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md",
      ),
      documentHasNoPending(
        "docs/core/07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md",
      ),
    ],
  },
  {
    name: "GO / NO-GO collection and final review",
    checks: [
      scriptExists("release:evidence:init"),
      scriptExists("release:evidence:manifest"),
      scriptExists("release:summary-preflight"),
      scriptExists("release:summary"),
      scriptExists("release:pending-evidence"),
      scriptExists("release:blocker-digest"),
      scriptExists("release:external-evidence"),
      scriptExists("release:rehearsal-plan"),
      scriptExists("release:metadata-env-template"),
      scriptExists("release:metadata-worksheet"),
      scriptExists("release:metadata-session-lock"),
      scriptExists("release:status-suite"),
      scriptExists("release:status-suite:strict"),
      scriptExists("release:interim-review"),
      scriptExists("release:final-review-status"),
      scriptExists("release:signed-evidence-templates"),
      scriptExists("release:signed-evidence-checklist"),
      scriptExists("release:signed-evidence-status"),
      scriptExists("release:readiness-register"),
      scriptExists("release:go-no-go"),
      fileExists("scripts/release-evidence-init.mjs"),
      fileExists("scripts/release-evidence-manifest.mjs"),
      fileExists("scripts/release-summary-preflight.mjs"),
      fileExists("scripts/release-summary.mjs"),
      fileExists("scripts/release-pending-evidence-checklist.mjs"),
      fileExists("scripts/release-blocker-digest.mjs"),
      fileExists("scripts/release-external-evidence-guide.mjs"),
      fileExists("scripts/release-rehearsal-command-plan.mjs"),
      fileExists("scripts/release-metadata-env-template.mjs"),
      fileExists("scripts/release-metadata-worksheet.mjs"),
      fileExists("scripts/release-metadata-session-lock.mjs"),
      fileExists("scripts/release-status-suite.mjs"),
      fileExists("scripts/release-status-suite-strict.mjs"),
      fileExists("scripts/release-interim-review.mjs"),
      fileExists("scripts/release-final-review-status.mjs"),
      fileExists("scripts/release-signed-evidence-templates.mjs"),
      fileExists("scripts/release-signed-evidence-checklist.mjs"),
      fileExists("scripts/release-signed-evidence-status.mjs"),
      fileExists("scripts/release-readiness-register-export.mjs"),
      fileExists("scripts/release-go-no-go.mjs"),
      fileExists(
        "docs/core/07-quality/PHASE1_PHASE1_5_RELEASE_EVIDENCE_COLLECTION_GUIDE.md",
      ),
      documentHasNoPending(
        "docs/core/07-quality/PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md",
      ),
      artifactExists(
        ".",
        /^release-summary-preflight-.*\.txt$/,
        "RESULT | PASS | Release summary metadata prerequisites are configured.",
      ),
      artifactExists(
        ".",
        /^release-summary\.txt$/,
        [
          "evidence_run_id=",
          "release_version=",
          "github_run_id=",
          "github_sha=",
          "verified_at_utc=",
          "RESULT | PASS | Release candidate summary captured.",
        ],
      ),
      artifactExists(
        "manifests",
        /^release-evidence-manifest-.*\.txt$/,
        "RESULT | PASS | Release evidence manifest captured.",
      ),
      artifactExists(
        "manifests",
        /^release-evidence-manifest-.*\.txt\.sha256$/,
      ),
      artifactChecksumMatches(
        "manifests",
        /^release-evidence-manifest-.*\.txt$/,
      ),
      artifactExists(
        "release-readiness-register",
        /^release-readiness-register-.*\.csv\.sha256$/,
      ),
      artifactChecksumMatches(
        "release-readiness-register",
        /^release-readiness-register-.*\.csv$/,
      ),
      artifactExists(
        "pending-evidence-checklist",
        /^pending-evidence-checklist-.*\.txt$/,
        "OGFI ERP Phase I / Phase 1.5 pending evidence checklist",
      ),
      artifactExists(
        "blocker-digest",
        /^blocker-digest-.*\.txt$/,
        "OGFI ERP Phase I / Phase 1.5 release blocker digest",
      ),
      artifactExists(
        "external-evidence-guide",
        /^external-evidence-guide-.*\.txt$/,
        "RESULT | PASS | External evidence collection guide generated.",
      ),
      artifactExists(
        "rehearsal-command-plan",
        /^rehearsal-command-plan-.*\.txt$/,
        "RESULT | PASS | Rehearsal command plan generated.",
      ),
      artifactExists(
        "release-metadata",
        /^release-metadata-worksheet-.*\.txt$/,
        "OGFI ERP Phase I / Phase 1.5 release metadata worksheet",
      ),
      artifactExists(
        "release-metadata",
        /^release-env-template-.*\.txt$/,
        "OGFI ERP Phase I / Phase 1.5 release metadata environment template",
      ),
      artifactExists(
        "release-metadata",
        /^release-session-lock-.*\.txt$/,
        "OGFI ERP Phase I / Phase 1.5 release metadata session lock",
      ),
      artifactExists(
        "status-suite",
        /^status-suite-.*\.txt$/,
        "RESULT | PASS | Release status suite refreshed advisory reports.",
      ),
      artifactExists(
        "interim-review",
        /^interim-review-.*\.txt$/,
        "RESULT | CONDITIONAL GO | Local interim evidence refreshed; final external evidence and signed owner approval remain pending.",
      ),
      artifactExists(
        "signed-document-templates",
        /^uat-evidence-pack-template\.md$/,
        "Signed UAT Evidence Pack Template",
      ),
      artifactExists(
        "signed-document-templates",
        /^deployment-rollback-evidence-template\.md$/,
        "Signed Deployment And Rollback Evidence Template",
      ),
      artifactExists(
        "signed-document-templates",
        /^training-impact-assessment-template\.md$/,
        "Signed Training Impact Assessment Template",
      ),
      artifactExists(
        "signed-evidence-checklist",
        /^signed-evidence-checklist-.*\.txt$/,
        "OGFI ERP Phase I / Phase 1.5 signed evidence checklist",
      ),
      artifactExists(
        "external-security",
        /^mfa-provider-enrollment-and-runtime-proof\..+$/,
        [
          "Evidence run ID:",
          "RESULT | PASS | External security proof captured.",
        ],
      ),
      artifactExists(
        "external-security",
        /^idp-session-invalidation-proof\..+$/,
        [
          "Evidence run ID:",
          "RESULT | PASS | External security proof captured.",
        ],
      ),
      artifactExists(
        "external-security",
        /^vault-or-artifact-storage-index\..+$/,
        [
          "Evidence run ID:",
          "RESULT | PASS | External security proof captured.",
        ],
      ),
      artifactExists(
        "external-security",
        /^break-glass-review-and-revocation-proof\..+$/,
        [
          "Evidence run ID:",
          "RESULT | PASS | External security proof captured.",
        ],
      ),
      evidenceDocumentHasNoPending(
        "signed UAT evidence pack",
        "RELEASE_UAT_EVIDENCE_FILE",
        "signed-documents/uat-evidence-pack.md",
        ["Pending", "TBD"],
      ),
      evidenceDocumentHasNoPending(
        "signed deployment and rollback evidence",
        "RELEASE_DEPLOYMENT_EVIDENCE_FILE",
        "signed-documents/deployment-rollback-evidence.md",
        ["Pending", "TBD"],
      ),
      evidenceDocumentHasNoPending(
        "signed training impact assessment",
        "RELEASE_TRAINING_EVIDENCE_FILE",
        "signed-documents/training-impact-assessment.md",
        ["[ ]", "Pending", "TBD"],
      ),
      artifactHasRequiredMarkers(
        "manifests",
        /^release-evidence-manifest-.*\.txt$/,
        finalManifestRequiredContent,
        finalManifestRequiredPatterns,
        true,
      ),
      artifactExists(
        "manifests",
        /^release-evidence-manifest-.*\.txt\.sha256$/,
      ),
      artifactHasAllContent(
        "final-review-status",
        /^final-review-status-.*\.txt$/,
        [
          "RESULT | READY FOR GO / NO-GO |",
        ],
      ),
      artifactHasAllContent(
        "signed-evidence-status",
        /^signed-evidence-status-.*\.txt$/,
        [
          "RESULT | PASS | Signed and external security evidence documents are present and have no unresolved placeholders.",
        ],
      ),
      artifactHasAllContent(
        "go-no-go",
        /^go-no-go-.*\.txt$/,
        "RESULT | GO REVIEW READY |",
      ),
    ],
  },
];

const pendingGuidance = new Map([
  [
    "Data snapshot and migration safety evidence",
    {
      severity: "Critical",
      owner: "DBA / Platform Engineering",
      evidence:
        "pre/post migration rehearsal snapshots and reviewed snapshot delta",
    },
  ],
  [
    "Backup, restore, and rollback evidence",
    {
      severity: "Critical",
      owner: "DevOps Owner / Release Manager",
      evidence:
        "backup dump, matching checksum, backup summary, isolated restore summary, rollback summary, and post-rollback smoke",
    },
  ],
  [
    "Pilot readiness and UAT execution",
    {
      severity: "Critical",
      owner: "QA Lead / Operations Lead",
      evidence:
        "DB-backed pilot readiness report and completed UAT rows with evidence and signoff",
    },
  ],
  [
    "Training, hypercare, and owner signoff",
    {
      severity: "High",
      owner: "Enablement Owner / Operations Owner",
      evidence:
        "training attendance, known-limit acknowledgement, hypercare owners, and daily review evidence",
    },
  ],
  [
    "GO / NO-GO collection and final review",
    {
      severity: "Critical",
      owner: "Release Manager / Product Owner",
      evidence:
        "release metadata, signed evidence documents, external-security proof references, fresh manifest, and final GO / NO-GO review",
    },
  ],
]);

mkdirSync(dirname(outputFile), { recursive: true });

const lines = [
  "OGFI ERP Phase I / Phase 1.5 milestone status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This report is advisory. It summarizes local tooling, documentation, and collected evidence status. It does not replace UAT, deployment rehearsal, rollback proof, or owner signoff.",
  "",
];

let complete = 0;
let pending = 0;
const milestoneResults = milestones.map((milestone) => {
  const failedChecks = milestone.checks.filter((check) => !check.pass);
  const status = failedChecks.length === 0 ? "COMPLETE" : "PENDING";

  if (status === "COMPLETE") {
    complete += 1;
  } else {
    pending += 1;
  }

  return { milestone, failedChecks, status };
});

if (pending > 0) {
  lines.push("PENDING OWNER SUMMARY");
  for (const { milestone, status } of milestoneResults) {
    if (status !== "PENDING") {
      continue;
    }

    const guidance = pendingGuidance.get(milestone.name);
    if (!guidance) {
      continue;
    }

    lines.push(
      `  OWNER | ${guidance.owner} | severity=${guidance.severity} | milestone=${milestone.name} | evidence=${guidance.evidence}`,
    );
  }
  lines.push("");
}

for (const { milestone, status } of milestoneResults) {
  lines.push(`${status} | ${milestone.name}`);
  if (status === "PENDING") {
    const guidance = pendingGuidance.get(milestone.name);
    if (guidance) {
      lines.push(
        `  BLOCKER | severity=${guidance.severity} | owner=${guidance.owner} | evidence=${guidance.evidence}`,
      );
    }
  }

  for (const check of milestone.checks) {
    const detail = check.detail ? ` | ${check.detail}` : "";
    lines.push(
      `  ${check.pass ? "PASS" : "PENDING"} | ${check.label}${detail}`,
    );
  }

  lines.push("");
}

lines.push(
  `SUMMARY | complete=${complete} pending=${pending} total=${milestones.length}`,
);

if (pending > 0) {
  lines.push(
    "NEXT | Complete pending environment artifacts, signed documents, external-security proof references, UAT evidence, training evidence, and rollback proof before GO review.",
  );
} else {
  lines.push(
    "NEXT | Run pnpm release:go-no-go and obtain named owner signoff.",
  );
}

writeFileSync(outputFile, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));

function scriptExists(name) {
  return {
    label: `package script ${name}`,
    pass: typeof scripts[name] === "string" && scripts[name].length > 0,
    detail:
      typeof scripts[name] === "string" && scripts[name].length > 0
        ? scripts[name]
        : "missing",
  };
}

function fileExists(path) {
  return {
    label: `file ${path}`,
    pass: existsSync(path),
    detail: existsSync(path) ? "present" : "missing",
  };
}

function fileContains(path, expected) {
  const exists = existsSync(path);
  return {
    label: `file ${path} contains required release boundary text`,
    pass: exists && readFileSync(path, "utf8").includes(expected),
    detail: exists ? "required text found" : "missing file",
  };
}

function artifactExists(directory, pattern, requiredContent) {
  const fullDirectory = join(evidenceRoot, directory);
  if (!existsSync(fullDirectory)) {
    return {
      label: `artifact ${directory}/${pattern.source}`,
      pass: false,
      detail: "missing directory",
    };
  }

  const matchingFiles = readdirSync(fullDirectory)
    .filter((file) => pattern.test(file))
    .sort();
  const requiredMarkers = Array.isArray(requiredContent)
    ? requiredContent
    : [requiredContent].filter(Boolean);
  const passingFile = matchingFiles
    .toReversed()
    .find(
    (file) =>
      requiredMarkers.length === 0 ||
      requiredMarkers.every((marker) =>
        readFileSync(join(fullDirectory, file), "utf8").includes(marker),
      ),
    );

  return {
    label: `artifact ${directory}/${pattern.source}`,
    pass: Boolean(passingFile),
    detail:
      passingFile ??
      (matchingFiles.length > 0
        ? `matching artifact found but required marker missing in ${matchingFiles.at(-1)}`
        : "no matching artifact"),
  };
}

function artifactHasAllContent(directory, pattern, requiredContent) {
  const fullDirectory = join(evidenceRoot, directory);
  const requiredMarkers = Array.isArray(requiredContent)
    ? requiredContent
    : [requiredContent].filter(Boolean);

  if (!existsSync(fullDirectory)) {
    return {
      label: `artifact ${directory}/${pattern.source}`,
      pass: false,
      detail: "missing directory",
    };
  }

  const matchingFiles = readdirSync(fullDirectory)
    .filter((file) => pattern.test(file))
    .sort();
  const passingFile = matchingFiles
    .toReversed()
    .find((file) => {
      const content = readFileSync(join(fullDirectory, file), "utf8");
      return requiredMarkers.every((marker) => content.includes(marker));
    });

  return {
    label: `artifact ${directory}/${pattern.source}`,
    pass: Boolean(passingFile),
    detail:
      passingFile ??
      (matchingFiles.length > 0
        ? `matching artifact found but required marker missing in ${matchingFiles.at(-1)}`
        : "no matching artifact"),
  };
}

function artifactHasRequiredMarkers(
  directory,
  pattern,
  requiredContent,
  requiredPatterns = [],
  requireFreshManifest = false,
) {
  const fullDirectory = join(evidenceRoot, directory);
  const matchingFiles =
    existsSync(fullDirectory) &&
    readdirSync(fullDirectory).filter((file) => pattern.test(file));

  if (!matchingFiles || matchingFiles.length === 0) {
    return {
      label: `artifact ${directory}/${pattern.source} includes final evidence manifest markers`,
      pass: false,
      detail: existsSync(fullDirectory) ? "no matching artifact" : "missing directory",
    };
  }

  const sortedFiles = matchingFiles.sort();
  const passingFiles = sortedFiles.toReversed().filter((file) => {
    const content = readFileSync(join(fullDirectory, file), "utf8");
    return (
      requiredContent.every((required) => content.includes(required)) &&
      requiredPatterns.every((required) => required.test(content))
    );
  });
  const passingFile =
    requireFreshManifest
      ? passingFiles.find(
          (file) =>
            evaluateManifestFreshness(evidenceRoot, join(fullDirectory, file))
              .pass,
        )
      : passingFiles[0];

  const staleDetail =
    requireFreshManifest && passingFiles[0]
      ? evaluateManifestFreshness(evidenceRoot, join(fullDirectory, passingFiles[0]))
          .detail
      : null;

  return {
    label: `artifact ${directory}/${pattern.source} includes final evidence manifest markers`,
    pass: Boolean(passingFile),
    detail:
      passingFile ??
      (staleDetail
        ? `latest matching manifest is stale: ${staleDetail}`
        : `latest manifest missing required marker(s): ${missingManifestMarkers(
            join(fullDirectory, sortedFiles.at(-1)),
            requiredContent,
            requiredPatterns,
          ).join(", ")}`),
  };
}

function artifactChecksumMatches(directory, artifactPattern) {
  const fullDirectory = join(evidenceRoot, directory);
  if (!existsSync(fullDirectory)) {
    return {
      label: `artifact checksum ${directory}/${artifactPattern.source}`,
      pass: false,
      detail: "missing directory",
    };
  }

  const matchingFiles = readdirSync(fullDirectory)
    .filter((file) => artifactPattern.test(file))
    .sort();
  const latestFile = matchingFiles.at(-1);

  if (!latestFile) {
    return {
      label: `artifact checksum ${directory}/${artifactPattern.source}`,
      pass: false,
      detail: "no matching artifact",
    };
  }

  const checksum = evaluateChecksumSidecar(join(fullDirectory, latestFile), latestFile);
  return {
    label: `artifact checksum ${directory}/${artifactPattern.source}`,
    pass: checksum.pass,
    detail: checksum.pass
      ? checksum.detail
      : `latest matching artifact ${latestFile} failed checksum verification: ${checksum.detail}`,
  };
}

function missingManifestMarkers(filePath, requiredContent, requiredPatterns) {
  const content = readFileSync(filePath, "utf8");
  const missing = requiredContent.filter((required) => !content.includes(required));
  for (const pattern of requiredPatterns) {
    if (!pattern.test(content)) {
      missing.push(`pattern: ${pattern.source}`);
    }
  }

  return missing;
}

function documentHasNoPending(path) {
  if (!existsSync(path)) {
    return {
      label: `document ${path} has no unresolved placeholders`,
      pass: false,
      detail: "missing file",
    };
  }

  const content = readFileSync(path, "utf8");
  const pendingCount = countOccurrences(content, "Pending");
  const tbdCount = countOccurrences(content, "TBD");
  const uncheckedCount = countOccurrences(content, "[ ]");
  return {
    label: `document ${path} has no unresolved placeholders`,
    pass:
      pendingCount === 0 && tbdCount === 0 && uncheckedCount === 0,
    detail: `Pending=${pendingCount}, TBD=${tbdCount}, unchecked=${uncheckedCount}`,
  };
}

function evidenceDocumentHasNoPending(label, envVar, defaultRelativePath, forbidden) {
  const path = process.env[envVar] ?? join(evidenceRoot, defaultRelativePath);
  const result = evaluateSignedEvidenceDocument({ file: path, forbidden });
  return {
    label: `document ${label}`,
    pass: result.pass,
    detail: result.detail,
  };
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
