import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { finalManifestRequiredPatterns } from "./release-evidence-contract.mjs";
import { evaluateManifestFreshness } from "./release-evidence-freshness.mjs";
import { evaluateEvidenceRunConsistency } from "./release-evidence-run-consistency.mjs";
import { evaluateRestoreTargetSafety } from "./restore-target-safety.mjs";

const workspaceRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "ogfi-release-tools-"));
const evidenceRoot = join(tempRoot, "release-evidence");
const selfTestUatFile = join(tempRoot, "uat-evidence-pack.md");
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const outputFile =
  process.env.RELEASE_TOOLS_SELF_TEST_OUTPUT_FILE ??
  join(
    process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence",
    "self-tests",
    `release-tools-self-test-${timestamp}.txt`,
  );

const strictSecurityReadinessMarkers = [
  "Pending controlled access requests",
  "Privileged users missing verified MFA evidence",
  "Pending provider session invalidations",
  "Break-glass access open or post-review due",
];
const evidenceLines = [
  "OGFI ERP release helper self-test evidence",
  `generated_at_utc=${timestamp}`,
  `temporary_evidence_root=${evidenceRoot}`,
  "",
];

try {
  testEvidenceInitializer();
  testReleaseReadinessRegisterExport();
  testPostgresToolEnvValidation();
  testEvidenceCollectionGuide();
  testExternalEvidenceGuide();
  testRehearsalCommandPlan();
  testReleaseSummary();
  testReleaseSummaryLoadsLocalEnvFile();
  testReleaseEvidenceRunIdLoadsLocalEnvFile();
  testBackupSummary();
  testRestoreTargetSafety();
  testRestoreRejectsChecksumMismatch();
  testRestoreSummary();
  testRollbackSummary();
  testBackupRestoreStatus();
  testRecoveryChecklist();
  testDeploymentStatus();
  testDeploymentChecklist();
  testLatestDataSnapshotCompare();
  testMigrationReviewInventory();
  testDataEquivalenceFailsClosed();
  testDataSnapshotStatus();
  testDataSnapshotChecklist();
  testUatStatus();
  testUatExecutionChecklist();
  testPilotReadinessPreflight();
  testPilotUatStatus();
  testEnablementStatus();
  testEnablementChecklist();
  testMilestoneReport();
  testMilestoneReportRequiresAllArtifactMarkers();
  testPendingEvidenceChecklist();
  testReleaseMetadataWorksheet();
  testReleaseMetadataEnvTemplate();
  testReleaseMetadataSessionLock();
  testEvidenceRunConsistencyContract();
  testSignedEvidenceChecklist();
  testBlockerDigest();
  testInterimReview();
  testStatusSuite();
  testFinalReviewStatus();
  testSignedEvidenceTemplates();
  testSignedEvidenceStatus();
  testGoNoGoReport();
  testReleaseReadinessRegisterChecksumMismatch();
  testEvidenceManifest();
  testEvidenceManifestFreshness();
  await testSmokeReport();
  evidenceLines.push("RESULT | PASS | Release helper self-test passed.");
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${evidenceLines.join("\n")}\n`);
  console.log("Release tool self-test passed.");
  console.log(`Release helper self-test evidence written: ${outputFile}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function testEvidenceInitializer() {
  evidenceLines.push("CHECK | Evidence initializer");
  runNodeScript("scripts/release-evidence-init.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  for (const directory of [
    "build-check",
    "secret-review",
    "data-snapshots",
    "migration-review",
    "predecessor-baseline",
    "migration-execution",
    "schema-drift",
    "data-invariants",
    "data-equivalence",
    "data-snapshot-checklist",
    "data-snapshot-status",
    "backups",
    "backup-restore-status",
    "recovery-checklist",
    "blocker-digest",
    "deployment-checklist",
    "deployment-status",
    "release-readiness-register",
    "external-evidence-guide",
    "external-security",
    "pilot-readiness",
    "uat-checklist",
    "uat-status",
    "pilot-uat-status",
    "enablement-checklist",
    "smoke",
    "staging-rollback",
    "staging-rollback/smoke",
    "final-review-status",
    "signed-evidence-checklist",
    "signed-evidence-status",
    "go-no-go",
    "manifests",
    "pending-evidence-checklist",
    "release-metadata",
    "rehearsal-command-plan",
    "status-suite",
    "interim-review",
    "signed-document-templates",
    "signed-documents",
  ]) {
    assert(existsSync(join(evidenceRoot, directory)), `missing ${directory}`);
  }

  const readme = readFileSync(join(evidenceRoot, "COLLECTION_README.txt"), {
    encoding: "utf8",
  });
  assert(
    readme.includes(
      "Place generated workflow artifacts, signed evidence documents, and external-security proof references",
    ),
    "collection README should describe external-security proof references as final evidence inputs",
  );
  assert(
    readme.includes("signed-documents/uat-evidence-pack.md"),
    "collection README should use portable slash-style signed document paths",
  );
  assert(
    readme.includes("build-check/build-check-*.txt"),
    "collection README should include build-check evidence path",
  );
  assert(
    readme.includes("secret-review/secret-review-*.txt"),
    "collection README should include secret-review evidence path",
  );
  const secretReviewSource = readFileSync("scripts/release-secret-review.mjs", {
    encoding: "utf8",
  });
  assert(
    secretReviewSource.includes("placeholderEnvValuePattern") &&
      secretReviewSource.includes("!placeholderEnvValuePattern.test") &&
      secretReviewSource.includes("envKeyReferencePattern"),
    "secret review should allow explicit angle-bracket template values without allowing real secrets",
  );
  assert(
    readme.includes("release-summary-preflight-*.txt"),
    "collection README should include release summary preflight evidence path",
  );
  assert(
    readme.includes("data-snapshots/data-snapshot-preflight-*.txt"),
    "collection README should include data snapshot preflight evidence path",
  );
  assert(
    readme.includes("data-snapshot-checklist/data-snapshot-checklist-*.txt"),
    "collection README should include data snapshot checklist path",
  );
  assert(
    readme.includes("data-snapshot-status/data-snapshot-status-*.txt"),
    "collection README should include data snapshot status evidence path",
  );
  assert(
    readme.includes("backup-restore-status/backup-restore-status-*.txt"),
    "collection README should include backup/restore status evidence path",
  );
  assert(
    readme.includes("recovery-checklist/recovery-evidence-checklist-*.txt"),
    "collection README should include recovery checklist path",
  );
  assert(
    readme.includes("blocker-digest/blocker-digest-*.txt"),
    "collection README should include blocker digest path",
  );
  assert(
    readme.includes("deployment-checklist/deployment-evidence-checklist-*.txt"),
    "collection README should include deployment checklist path",
  );
  assert(
    readme.includes("deployment-status/deployment-status-*.txt"),
    "collection README should include deployment status path",
  );
  assert(
    readme.includes("release-readiness-register/release-readiness-register-*.csv"),
    "collection README should include release readiness register export path",
  );
  assert(
    readme.includes("release-readiness-register/release-readiness-register-*.csv.sha256"),
    "collection README should include release readiness register checksum sidecar path",
  );
  const readinessRegisterSource = readFileSync(
    "scripts/release-readiness-register-export.mjs",
    {
      encoding: "utf8",
    },
  );
  assert(
    readinessRegisterSource.includes("resolvePostgresTool") &&
      readinessRegisterSource.includes("using Prisma fallback") &&
      readinessRegisterSource.includes("new PrismaClient"),
    "release readiness register export should fall back to Prisma when psql is unavailable",
  );
  assert(
    readme.includes("external-evidence-guide/external-evidence-guide-*.txt"),
    "collection README should include external evidence guide path",
  );
  assert(
    readme.includes("external-security/mfa-provider-enrollment-and-runtime-proof.*") &&
      readme.includes("external-security/idp-session-invalidation-proof.*") &&
      readme.includes("external-security/vault-or-artifact-storage-index.*") &&
      readme.includes("external-security/break-glass-review-and-revocation-proof.*"),
    "collection README should include external security proof paths",
  );
  assert(
    readme.includes("rehearsal-command-plan/rehearsal-command-plan-*.txt"),
    "collection README should include rehearsal command plan path",
  );
  assert(
    readme.includes("pilot-uat-status/pilot-uat-status-*.txt"),
    "collection README should include pilot/UAT status evidence path",
  );
  assert(
    readme.includes("uat-checklist/uat-execution-checklist-*.txt"),
    "collection README should include UAT execution checklist path",
  );
  assert(
    readme.includes("enablement-checklist/enablement-checklist-*.txt"),
    "collection README should include enablement checklist path",
  );
  assert(
    readme.includes("uat-status/uat-status-*.txt"),
    "collection README should include UAT status evidence path",
  );
  assert(
    readme.includes("signed-evidence-status/signed-evidence-status-*.txt"),
    "collection README should include signed evidence status path",
  );
  assert(
    readme.includes("signed-evidence-checklist/signed-evidence-checklist-*.txt"),
    "collection README should include signed evidence checklist path",
  );
  assert(
    readme.includes("signed-document-templates/*-template.md"),
    "collection README should include signed evidence template path",
  );
  assert(
    readme.includes(
      "pending-evidence-checklist/pending-evidence-checklist-*.txt",
    ),
    "collection README should include pending evidence checklist path",
  );
  assert(
    readme.includes("release-metadata/release-metadata-worksheet-*.txt"),
    "collection README should include release metadata worksheet path",
  );
  assert(
    readme.includes("release-metadata/release-env-template-*.txt"),
    "collection README should include release metadata environment template path",
  );
  assert(
    readme.includes("release-metadata/release-session-lock-*.txt"),
    "collection README should include release metadata session lock path",
  );
  assert(
    readme.includes(
      "DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness",
    ),
    "collection README should include strict pilot readiness command",
  );
  assert(
    readme.includes("requireReleaseGatesReady=true") &&
      readme.includes("DEC-0036 strict release gate status"),
    "collection README should name strict pilot readiness markers",
  );
  const pilotReadinessCheck = readFileSync(
    "scripts/pilot-readiness-check.mjs",
    "utf8",
  );
  assert(
    pilotReadinessCheck.includes('"security.controlled_access_requests"'),
    "pilot readiness strict gate check should include controlled access requests gate",
  );
  assert(
    pilotReadinessCheck.includes("Pending controlled access requests") &&
      pilotReadinessCheck.includes('"HighRiskScopeRequest"') &&
      pilotReadinessCheck.includes('"SensitiveRoleRequest"'),
    "pilot readiness strict gate check should block pending controlled access requests",
  );
  assert(
    pilotReadinessCheck.includes("Privileged users missing verified MFA evidence") &&
      pilotReadinessCheck.includes('"PrivilegedMfaEnrollment"') &&
      pilotReadinessCheck.includes("core.administer"),
    "pilot readiness strict gate check should block privileged MFA evidence gaps",
  );
  assert(
    pilotReadinessCheck.includes("Pending provider session invalidations") &&
      pilotReadinessCheck.includes('"AuthSessionInvalidation"') &&
      pilotReadinessCheck.includes("PENDING_PROVIDER"),
    "pilot readiness strict gate check should block pending provider session invalidations",
  );
  assert(
    pilotReadinessCheck.includes("Break-glass access open or post-review due") &&
      pilotReadinessCheck.includes('"BreakGlassAccessGrant"') &&
      pilotReadinessCheck.includes("PENDING_REVIEW") &&
      pilotReadinessCheck.includes("REVOKED"),
    "pilot readiness strict gate check should block open or post-review break-glass access",
  );
  for (const expected of [
    "GO / NO-GO ready gate missing GO board decision",
    "GO / NO-GO conditional gate missing Conditional GO board decision",
    "GO / NO-GO waived gate missing Hold board decision",
  ]) {
    assert(
      pilotReadinessCheck.includes(expected),
      `pilot readiness strict gate check should include board-decision guard: ${expected}`,
    );
  }
  assert(
    readme.includes("pnpm release:pending-evidence"),
    "collection README should include pending evidence checklist command",
  );
  assert(
    readme.includes("pnpm release:data-snapshot-checklist"),
    "collection README should include data snapshot checklist command",
  );
  assert(
    readme.includes("pnpm release:uat-checklist"),
    "collection README should include UAT execution checklist command",
  );
  assert(
    readme.includes("pnpm release:enablement-checklist"),
    "collection README should include enablement checklist command",
  );
  assert(
    readme.includes("pnpm release:metadata-worksheet"),
    "collection README should include release metadata worksheet command",
  );
  assert(
    readme.includes("pnpm release:metadata-env-template"),
    "collection README should include release metadata environment template command",
  );
  assert(
    readme.includes("pnpm release:metadata-session-lock"),
    "collection README should include release metadata session lock command",
  );
  assert(
    readme.includes("status-suite/status-suite-*.txt"),
    "collection README should include status suite path",
  );
  assert(
    readme.includes("interim-review/interim-review-*.txt"),
    "collection README should include interim review path",
  );
  assert(
    readme.includes("pnpm release:status-suite"),
    "collection README should include status suite command",
  );
  assert(
    readme.includes("pnpm release:status-suite:strict"),
    "collection README should include strict status suite command",
  );
  assert(
    readme.includes("pnpm release:interim-review"),
    "collection README should include interim review command",
  );
  assert(
    readme.includes("pnpm release:blocker-digest"),
    "collection README should include blocker digest command",
  );
  assert(
    readme.includes("pnpm release:recovery-checklist"),
    "collection README should include recovery checklist command",
  );
  assert(
    readme.includes("pnpm release:deployment-checklist"),
    "collection README should include deployment checklist command",
  );
  assert(
    readme.includes("pnpm release:readiness-register"),
    "collection README should include release readiness register export command",
  );
  assert(
    readme.includes("pnpm release:external-evidence"),
    "collection README should include external evidence guide command",
  );
  assert(
    readme.includes("pnpm release:rehearsal-plan"),
    "collection README should include rehearsal command plan command",
  );
  assert(
    readme.includes("pnpm release:signed-evidence-templates"),
    "collection README should include signed evidence template command",
  );
  assert(
    readme.includes("pnpm release:signed-evidence-checklist"),
    "collection README should include signed evidence checklist command",
  );
  evidenceLines.push("PASS | Evidence initializer created required folders.");
}

function testReleaseReadinessRegisterExport() {
  evidenceLines.push("CHECK | Release readiness register export command");
  const fixtureFile = join(tempRoot, "release-readiness-register-fixture.json");
  const outputDirectory = join(tempRoot, "readiness-register-output");
  const outputFile = join(outputDirectory, "release-readiness-register-self-test.csv");
  writeFileSync(
    fixtureFile,
    JSON.stringify(
      {
        "Readiness gates": [
          [
            "Section",
            "Tenant ID",
            "Company ID",
            "Gate Key",
            "Category",
            "Title",
            "Required By Policy",
            "Status",
            "Evidence Reference",
            "Decision Note",
            "Blocker Summary",
            "Owner Role",
            "Signed Off At UTC",
            "Signed Off By User ID",
            "Source Decision ID",
            "Updated At UTC",
          ],
          [
            "Gate register",
            "tenant-1",
            "company-1",
            "release.summary",
            "go_no_go",
            "Release summary",
            "true",
            "READY",
            "self-test",
            "",
            "",
            "Release Manager",
            "",
            "",
            "DEC-0036",
            "2026-07-07T00:00:00.000Z",
          ],
        ],
        "UAT evidence": [
          [
            "Section",
            "Tenant ID",
            "Company ID",
            "Evidence Type",
            "Title",
            "Workflow Area",
            "Tester",
            "Environment",
            "Result",
            "Verification Status",
            "Evidence Reference",
            "Policy Version",
            "Defect Reference",
            "Executed At UTC",
            "Recorded By User ID",
            "Verified By User ID",
            "Rejected By User ID",
            "Source Decision ID",
            "Updated At UTC",
          ],
          [
            "UAT evidence",
            "tenant-1",
            "company-1",
            "SCENARIO_EXECUTION",
            "PR approval UAT",
            "Purchasing",
            "QA Lead",
            "self-test",
            "PASS",
            "VERIFIED",
            "self-test",
            "",
            "",
            "2026-07-07T00:00:00.000Z",
            "user-1",
            "user-2",
            "",
            "DEC-0036",
            "2026-07-07T00:00:00.000Z",
          ],
        ],
        "Deployment evidence": [
          [
            "Section",
            "Tenant ID",
            "Company ID",
            "Evidence Type",
            "Title",
            "Environment",
            "Performed By",
            "Verification Status",
            "Evidence Reference",
            "Performed At UTC",
            "Recorded By User ID",
            "Verified By User ID",
            "Rejected By User ID",
            "Source Decision ID",
            "Updated At UTC",
          ],
          [
            "Deployment evidence",
            "tenant-1",
            "company-1",
            "BACKUP",
            "Backup rehearsal",
            "self-test",
            "DevOps",
            "VERIFIED",
            "self-test",
            "2026-07-07T00:00:00.000Z",
            "user-1",
            "user-2",
            "",
            "DEC-0036",
            "2026-07-07T00:00:00.000Z",
          ],
        ],
        "Enablement evidence": [
          [
            "Section",
            "Tenant ID",
            "Company ID",
            "Evidence Type",
            "Title",
            "Audience / Role",
            "Owner",
            "Verification Status",
            "Evidence Reference",
            "Known Limit Acknowledged",
            "Support Route Confirmed",
            "Completed At UTC",
            "Recorded By User ID",
            "Verified By User ID",
            "Rejected By User ID",
            "Source Decision ID",
            "Updated At UTC",
          ],
          [
            "Enablement evidence",
            "tenant-1",
            "company-1",
            "TRAINING_SIGNOFF",
            "Training signoff",
            "Store Manager",
            "Enablement",
            "VERIFIED",
            "self-test",
            "true",
            "true",
            "2026-07-07T00:00:00.000Z",
            "user-1",
            "user-2",
            "",
            "DEC-0036",
            "2026-07-07T00:00:00.000Z",
          ],
        ],
        "Release Board decisions": [
          [
            "Section",
            "Tenant ID",
            "Company ID",
            "Decision",
            "Evidence Reference",
            "Decision Note",
            "Participants",
            "Decided At UTC",
            "Chair User ID",
            "Source Decision ID",
            "Created At UTC",
          ],
          [
            "Release Board decision",
            "tenant-1",
            "company-1",
            "GO",
            "self-test",
            "Self-test board decision",
            "[\"Release Manager\"]",
            "2026-07-07T00:00:00.000Z",
            "user-1",
            "DEC-0036",
            "2026-07-07T00:00:00.000Z",
          ],
        ],
      },
      null,
      2,
    ),
  );

  const output = runNodeScript("scripts/release-readiness-register-export.mjs", {
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_READINESS_REGISTER_FIXTURE_FILE: fixtureFile,
    RELEASE_READINESS_REGISTER_OUTPUT_FILE: outputFile,
  });

  assert(
    output.includes(`Release readiness register export written: ${outputFile}`),
    "readiness register export should report generated CSV path",
  );
  assert(
    output.includes(`Release readiness register checksum written: ${outputFile}.sha256`),
    "readiness register export should report generated checksum path",
  );
  assert(existsSync(outputFile), "readiness register fixture CSV should be written");
  assert(existsSync(`${outputFile}.sha256`), "readiness register checksum should be written");

  const csv = readFileSync(outputFile, "utf8");
  const checksum = createHash("sha256").update(csv).digest("hex");
  const checksumSidecar = readFileSync(`${outputFile}.sha256`, "utf8");
  assert(
      csv.includes("Evidence run ID,self-test-run") &&
      csv.includes("Database URL fingerprint,fixture-mode") &&
      csv.includes("Gate register,tenant-1,company-1,release.summary,go_no_go") &&
      csv.includes("Expected Phase 3 readiness gate trace") &&
      csv.includes("uat.phase3_finance_controlled_foundation") &&
      csv.includes("RESULT,PASS,Release readiness register export captured."),
    "readiness register fixture CSV should contain metadata, rows, and pass marker",
  );
  assert(
    checksumSidecar.startsWith(`${checksum} `) &&
      checksumSidecar.includes("release-readiness-register-self-test.csv"),
    "readiness register checksum sidecar should match generated CSV",
  );
  evidenceLines.push("PASS | Release readiness register export writes CSV and checksum artifacts.");
}

function testPostgresToolEnvValidation() {
  evidenceLines.push("CHECK | PostgreSQL client env override validation");
  const stubFile = join(
    tempRoot,
    process.platform === "win32" ? "not-psql.cmd" : "not-psql",
  );
  writeFileSync(
    stubFile,
    process.platform === "win32" ? "@echo off\r\nexit /b 0\r\n" : "#!/bin/sh\nexit 0\n",
  );
  if (process.platform !== "win32") {
    chmodSync(stubFile, 0o755);
  }

  const output = runNodeScript("scripts/release-data-snapshot-preflight.mjs", {
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_self_test",
    PSQL_BIN: stubFile,
    RELEASE_DATA_SNAPSHOT_OUTPUT_DIR: join(tempRoot, "invalid-psql-preflight"),
  });

  assert(
    output.includes("WARN | psql available or PSQL_BIN configured") &&
      output.includes(
        "RESULT | WARN | Data snapshot prerequisites are incomplete; no database checks were attempted.",
      ),
    "PostgreSQL client resolver should reject env overrides that are not named psql",
  );
  evidenceLines.push("PASS | PostgreSQL client env override rejects non-psql executables.");
}

function testRestoreRejectsChecksumMismatch() {
  evidenceLines.push("CHECK | Restore backup checksum verification");
  if (process.platform === "win32") {
    evidenceLines.push(
      "PASS | Restore checksum mismatch execution is exercised on POSIX CI; Windows cannot create a safe executable stub in this self-test.",
    );
    return;
  }
  const toolDir = join(tempRoot, "restore-checksum-tools");
  mkdirSync(toolDir, { recursive: true });
  const psql = join(toolDir, process.platform === "win32" ? "psql.cmd" : "psql");
  const pgRestore = join(
    toolDir,
    process.platform === "win32" ? "pg_restore.cmd" : "pg_restore",
  );
  const stub = process.platform === "win32" ? "@echo off\r\nexit /b 0\r\n" : "#!/bin/sh\nexit 0\n";
  writeFileSync(psql, stub);
  writeFileSync(pgRestore, stub);
  if (process.platform !== "win32") {
    chmodSync(psql, 0o755);
    chmodSync(pgRestore, 0o755);
  }
  const backup = join(tempRoot, "checksum-mismatch.dump");
  writeFileSync(backup, "backup-content");
  writeFileSync(`${backup}.sha256`, `${"0".repeat(64)}  checksum-mismatch.dump\n`);

  const result = spawnSync(process.execPath, ["scripts/db-restore-check.mjs"], {
    cwd: workspaceRoot,
    env: childProcessEnv({
      DATABASE_URL: "postgresql://user:secret@localhost:5432/source_test",
      RESTORE_DATABASE_URL: "postgresql://user:secret@localhost:5432/restore_test",
      BACKUP_FILE: backup,
      PSQL_BIN: psql,
      PG_RESTORE_BIN: pgRestore,
    }),
    encoding: "utf8",
  });
  assert(
    result.status !== 0 &&
      `${result.stdout}${result.stderr}`.includes(
        "Backup checksum verification failed; restore was not attempted.",
      ),
    `restore check should reject a backup whose SHA-256 sidecar does not match: ${result.stdout}${result.stderr}`,
  );
  evidenceLines.push("PASS | Restore check recomputes SHA-256 before invoking restore.");
}

function testEvidenceCollectionGuide() {
  evidenceLines.push("CHECK | Evidence collection guide");
  const guide = readFileSync(
    "docs/core/07-quality/PHASE1_PHASE1_5_RELEASE_EVIDENCE_COLLECTION_GUIDE.md",
    "utf8",
  );

  for (const expected of [
    "build-check/",
    "secret-review/",
    "release-summary-preflight-*.txt",
    "data-snapshots/",
    "data-snapshot-checklist/",
    "data-snapshot-status/",
    "backups/",
    "backup-restore-status/",
    "recovery-checklist/",
    "blocker-digest/",
    "deployment-checklist/",
    "deployment-status/",
    "external-evidence-guide/",
    "rehearsal-command-plan/",
    "pilot-readiness/",
    "uat-checklist/",
    "uat-status/",
    "pilot-uat-status/",
    "enablement-checklist/",
    "staging-rollback/",
    "final-review-status/",
    "signed-evidence-checklist/",
    "signed-evidence-status/",
    "pending-evidence-checklist/",
    "release-metadata/",
    "status-suite/",
    "interim-review/",
    "signed-documents/",
  ]) {
    assert(
      guide.includes(expected),
      `release evidence collection guide should mention ${expected}`,
    );
  }

  for (const expected of [
    "PILOT_REQUIRE_RELEASE_GATES_READY=true",
    "requireReleaseGatesReady=true",
    "DEC-0036 strict release gate status",
    "GO / NO-GO gate status does not match the latest Release Board decision",
    "setup-only pilot readiness artifacts",
    "external-security/",
    "RESULT | PASS | External security proof captured.",
    "external-security proof references share one non-placeholder",
    ...strictSecurityReadinessMarkers,
  ]) {
    assert(
      guide.includes(expected),
      `release evidence collection guide should mention strict pilot readiness marker: ${expected}`,
    );
  }

  const finalReviewStatusSource = readFileSync(
    "scripts/release-final-review-status.mjs",
    "utf8",
  );
  const goNoGoSource = readFileSync("scripts/release-go-no-go.mjs", "utf8");
  const evidenceRunConsistencySource = readFileSync(
    "scripts/release-evidence-run-consistency.mjs",
    "utf8",
  );
  for (const expected of strictSecurityReadinessMarkers) {
    assert(
      finalReviewStatusSource.includes(expected),
      `final review status should require strict security readiness marker: ${expected}`,
    );
    assert(
      goNoGoSource.includes(expected),
      `GO / NO-GO status should require strict security readiness marker: ${expected}`,
    );
  }
  for (const source of [
    ["final review status", finalReviewStatusSource],
    ["GO / NO-GO status", goNoGoSource],
    ["evidence run consistency", evidenceRunConsistencySource],
  ]) {
    assert(
      source[1].includes("RESULT | PASS | External security proof captured."),
      `${source[0]} should require external security proof PASS marker`,
    );
  }

  evidenceLines.push(
    "PASS | Evidence collection guide lists required evidence folders.",
  );
}

function testExternalEvidenceGuide() {
  evidenceLines.push("CHECK | External evidence collection guide");
  const output = runNodeScript("scripts/release-external-evidence-guide.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_VERSION: "self-test",
    GITHUB_RUN_ID: "self-test-gh-run",
    GITHUB_SHA: "1234567890abcdef",
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_self_test",
    RESTORE_DATABASE_URL:
      "postgres://restore-test:secret@localhost:5432/ogfi_restore_test",
    SMOKE_BASE_URL: "http://127.0.0.1:3000",
  });

  assert(
    output.includes("Evidence run ID: self-test-run"),
    "external evidence guide should include evidence run ID",
  );
  assert(
    output.includes("ENV | DATABASE_URL | configured | fingerprint="),
    "external evidence guide should fingerprint configured database URL",
  );
  assert(
    !output.includes("self-test:secret"),
    "external evidence guide must not print database credentials",
  );
  assert(
    output.includes("COMMAND | pnpm release:data-snapshot-status"),
    "external evidence guide should include data snapshot status command",
  );
  assert(
    output.includes("COMMAND | pnpm release:backup-restore-status"),
    "external evidence guide should include backup/restore status command",
  );
  assert(
    output.includes("COMMAND | pnpm release:rehearsal-plan"),
    "external evidence guide should include rehearsal command plan command",
  );
  assert(
    output.includes("COMMAND | DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register"),
    "external evidence guide should include release readiness register export command",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/release-readiness-register/release-readiness-register-*.csv"),
    "external evidence guide should include release readiness register export artifact",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/release-readiness-register/release-readiness-register-*.csv.sha256") &&
      output.includes("keep the generated .csv.sha256 sidecar with the CSV"),
    "external evidence guide should include release readiness register checksum sidecar",
  );
  assert(
    output.includes("ERP REGISTER EXPORT | Release readiness register"),
    "external evidence guide should include release readiness register export boundary",
  );
  assert(
    output.includes("GROUP | External identity, security, and evidence storage proof") &&
      output.includes("OWNER | Security Owner / IT Owner"),
    "external evidence guide should include security identity evidence group",
  );
  assert(
    output.includes("MFA provider enrollment and runtime challenge proof") &&
      output.includes("identity-provider session termination proof") &&
      output.includes("vault or approved evidence-repository references"),
    "external evidence guide should name external security proof requirements",
  );
  assert(
    output.includes("ARTIFACT | external-security/mfa-provider-enrollment-and-runtime-proof.*") &&
      output.includes("ARTIFACT | external-security/idp-session-invalidation-proof.*") &&
      output.includes("ARTIFACT | external-security/vault-or-artifact-storage-index.*"),
    "external evidence guide should include external security artifact targets",
  );
  assert(
    output.includes("EXTERNAL | Identity provider") &&
      output.includes("EXTERNAL | Evidence storage") &&
      output.includes("EXTERNAL | Break-glass security"),
    "external evidence guide should include security non-fabrication boundaries",
  );
  writeExternalSecurityProofFiles(evidenceRoot, "self-test-run");
  assert(
    output.includes("COMMAND | pnpm release:go-no-go"),
    "external evidence guide should include GO / NO-GO command",
  );
  assert(
    output.includes("COMMAND | pnpm release:status-suite:strict"),
    "external evidence guide should include strict status suite command",
  );
  assert(
    output.includes("This guide does not create source evidence"),
    "external evidence guide should state non-fabrication boundary",
  );
  assert(
    readdirSync(join(evidenceRoot, "external-evidence-guide")).some((file) =>
      /^external-evidence-guide-.*\.txt$/.test(file),
    ),
    "external evidence guide artifact missing",
  );
  evidenceLines.push(
    "PASS | External evidence guide records collection commands without fabricating evidence.",
  );
}

function testRehearsalCommandPlan() {
  evidenceLines.push("CHECK | Rehearsal command plan");
  const output = runNodeScript("scripts/release-rehearsal-command-plan.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_VERSION: "self-test",
    GITHUB_RUN_ID: "self-test-gh-run",
    GITHUB_SHA: "1234567890abcdef",
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_self_test",
    RESTORE_DATABASE_URL:
      "postgres://restore-test:secret@localhost:5432/ogfi_restore_test",
    BACKUP_FILE: "release-evidence/backups/ogfi-erp-self-test.dump",
    SMOKE_BASE_URL: "http://127.0.0.1:3000",
  });

  assert(
    output.includes(
      "OGFI ERP Phase I / Phase 1.5 external evidence rehearsal command plan",
    ),
    "rehearsal command plan header missing",
  );
  assert(
    output.includes("Evidence run ID: self-test-run"),
    "rehearsal command plan should include evidence run ID",
  );
  assert(
    output.includes("ENV | DATABASE_URL | configured | fingerprint="),
    "rehearsal command plan should fingerprint configured database URL",
  );
  assert(
    !output.includes("self-test:secret"),
    "rehearsal command plan must not print database credentials",
  );
  assert(
    output.includes(
      "RELEASE_DATA_SNAPSHOT_LABEL=pre-migration-rehearsal pnpm release:data-snapshot",
    ),
    "rehearsal command plan should include pre-migration snapshot command",
  );
  assert(
    output.includes("COMMAND | pnpm release:data-snapshot-checklist"),
    "rehearsal command plan should include data snapshot checklist command",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/data-snapshot-checklist/data-snapshot-checklist-*.txt"),
    "rehearsal command plan should include data snapshot checklist artifact",
  );
  assert(
    output.includes("COMMAND | pnpm release:metadata-session-lock"),
    "rehearsal command plan should include metadata session lock command",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/release-metadata/release-session-lock-*.txt"),
    "rehearsal command plan should include metadata session lock artifact",
  );
  assert(
    output.includes(
      "RELEASE_DATA_SNAPSHOT_LABEL=post-migration-rehearsal pnpm release:data-snapshot",
    ),
    "rehearsal command plan should include post-migration snapshot command",
  );
  assert(
    output.includes("COMMAND | pnpm release:data-snapshot:compare-latest"),
    "rehearsal command plan should include data snapshot compare command",
  );
  assert(
    output.includes("COMMAND | pnpm release:backup-restore-status"),
    "rehearsal command plan should include backup/restore status command",
  );
  assert(
    output.includes("COMMAND | pnpm release:recovery-checklist"),
    "rehearsal command plan should include recovery checklist command",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/recovery-checklist/recovery-evidence-checklist-*.txt"),
    "rehearsal command plan should include recovery checklist artifact",
  );
  assert(
    output.includes("COMMAND | pnpm release:deployment-checklist"),
    "rehearsal command plan should include deployment checklist command",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/deployment-checklist/deployment-evidence-checklist-*.txt"),
    "rehearsal command plan should include deployment checklist artifact",
  );
  assert(
    output.includes("COMMAND | pnpm release:uat-checklist"),
    "rehearsal command plan should include UAT execution checklist command",
  );
  assert(
    output.includes("COMMAND | DATABASE_URL=<pilot-or-staging-url> pnpm release:pilot-readiness"),
    "rehearsal command plan should include setup pilot readiness command",
  );
  assert(
    output.includes(
      "COMMAND | DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness",
    ),
    "rehearsal command plan should include strict pilot readiness command",
  );
  assert(
    output.includes("COMMAND | DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register"),
    "rehearsal command plan should include release readiness register export command",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/release-readiness-register/release-readiness-register-*.csv"),
    "rehearsal command plan should include release readiness register export artifact",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/release-readiness-register/release-readiness-register-*.csv.sha256"),
    "rehearsal command plan should include release readiness register checksum artifact",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/uat-checklist/uat-execution-checklist-*.txt"),
    "rehearsal command plan should include UAT execution checklist artifact",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/pilot-readiness/pilot-readiness-*.txt"),
    "rehearsal command plan should include pilot readiness artifact",
  );
  assert(
    output.includes("COMMAND | pnpm release:enablement-checklist"),
    "rehearsal command plan should include enablement checklist command",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/enablement-checklist/enablement-checklist-*.txt"),
    "rehearsal command plan should include enablement checklist artifact",
  );
  assert(
    output.includes("COMMAND | pnpm release:signed-evidence-checklist"),
    "rehearsal command plan should include signed evidence checklist command",
  );
  assert(
    output.includes("ARTIFACT | release-evidence/signed-evidence-checklist/signed-evidence-checklist-*.txt"),
    "rehearsal command plan should include signed evidence checklist artifact",
  );
  assert(
    output.includes(
      "signed documents, and external-security proof references are complete",
    ),
    "rehearsal command plan should require external-security proof references before final manifest",
  );
  assert(
    output.includes("COMMAND | pnpm release:deployment-status"),
    "rehearsal command plan should include deployment status command",
  );
  assert(
    output.includes("COMMAND | pnpm release:blocker-digest"),
    "rehearsal command plan should include blocker digest command",
  );
  assert(
    output.includes("COMMAND | pnpm release:status-suite:strict"),
    "rehearsal command plan should include strict status suite command",
  );
  assertCommandOrder(output, [
    "COMMAND | pnpm release:evidence:manifest",
    "COMMAND | pnpm release:final-review-status",
    "COMMAND | pnpm release:go-no-go",
    "COMMAND | pnpm release:status-suite:strict",
  ]);
  assert(
    output.includes("This command plan is advisory"),
    "rehearsal command plan should state non-fabrication boundary",
  );
  assert(
    output.includes("isolated non-production database"),
    "rehearsal command plan should require isolated restore target",
  );
  assert(
    readdirSync(join(evidenceRoot, "rehearsal-command-plan")).some((file) =>
      /^rehearsal-command-plan-.*\.txt$/.test(file),
    ),
    "rehearsal command plan artifact missing",
  );
  evidenceLines.push(
    "PASS | Rehearsal command plan sequences external evidence collection without fabricating proof.",
  );
}

function testReleaseSummary() {
  evidenceLines.push("CHECK | Release summary preflight");
  const preflightOutput = runNodeScript("scripts/release-summary-preflight.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_VERSION: "self-test",
    GITHUB_RUN_ID: "self-test-run",
    GITHUB_SHA: "1234567890abcdef",
    DEPLOY_TO_STAGING: "false",
    RELEASE_ENVIRONMENT: "self-test",
  });
  assert(
    preflightOutput.includes(
      "RESULT | PASS | Release summary metadata prerequisites are configured.",
    ),
    "release summary preflight should pass with approved metadata",
  );
  assert(
    preflightOutput.includes("Evidence run ID: self-test-run"),
    "release summary preflight should include evidence run id",
  );
  assert(
    readdirSync(evidenceRoot).some((file) =>
      /^release-summary-preflight-.*\.txt$/.test(file),
    ),
    "release summary preflight artifact missing",
  );

  evidenceLines.push("CHECK | Release summary");
  const output = runNodeScript("scripts/release-summary.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_VERSION: "self-test",
    GITHUB_RUN_ID: "self-test-run",
    GITHUB_SHA: "1234567890abcdef",
    DEPLOY_TO_STAGING: "false",
    RELEASE_ENVIRONMENT: "self-test",
  });

  assert(
    output.includes("Release candidate summary written:"),
    "release summary command should report output path",
  );

  const summary = readFileSync(join(evidenceRoot, "release-summary.txt"), {
    encoding: "utf8",
  });
  assert(
    summary.includes("evidence_run_id=self-test-run"),
    "release summary should include evidence run id",
  );
  assert(
    summary.includes("release_version=self-test"),
    "release summary should include release version",
  );
  assert(
    summary.includes("github_run_id=self-test-run"),
    "release summary should include run ID",
  );
  assert(
    summary.includes("RESULT | PASS | Release candidate summary captured."),
    "release summary should include pass marker",
  );
  evidenceLines.push(
    "PASS | Release summary captures release metadata required by GO / NO-GO.",
  );

  const invalidResult = spawnSync(
    process.execPath,
    ["scripts/release-summary.mjs"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_EVIDENCE_ROOT: evidenceRoot,
        RELEASE_VERSION: "self-test",
        GITHUB_RUN_ID: "self-test-run",
        GITHUB_SHA: "not-a-sha",
      },
      encoding: "utf8",
    },
  );
  assert(
    invalidResult.status !== 0 &&
      `${invalidResult.stdout}${invalidResult.stderr}`.includes(
        "GITHUB_SHA value valid",
      ),
    "release summary should reject invalid metadata",
  );
}

function testReleaseSummaryLoadsLocalEnvFile() {
  evidenceLines.push("CHECK | Release summary local env metadata");
  const metadataFile = join(tempRoot, "release-metadata.env");
  const outputFile = join(evidenceRoot, "release-summary-local-env.txt");
  writeFileSync(
    metadataFile,
    [
      "RELEASE_EVIDENCE_RUN_ID=local-env-run",
      "RELEASE_VERSION=v0.1.0-rc.local",
      "GITHUB_RUN_ID=local-env-gh-run",
      "GITHUB_SHA=abcdef1234567890",
      "DEPLOY_TO_STAGING=false",
      "RELEASE_ENVIRONMENT=local-env-test",
      "RELEASE_MIGRATION_MODE=prisma-deploy",
      "",
    ].join("\n"),
  );

  const preflightOutput = runNodeScript(
    "scripts/release-summary-preflight.mjs",
    {
      LOCAL_ENV_FILES: metadataFile,
      RELEASE_EVIDENCE_ROOT: evidenceRoot,
      GITHUB_RUN_ID: undefined,
      GITHUB_SHA: undefined,
    },
  );
  assert(
    preflightOutput.includes(
      "RESULT | PASS | Release summary metadata prerequisites are configured.",
    ),
    "release summary preflight should load metadata from LOCAL_ENV_FILES",
  );
  assert(
    preflightOutput.includes("Evidence run ID: local-env-run"),
    "release summary preflight should include local env evidence run id",
  );

  const output = runNodeScript("scripts/release-summary.mjs", {
    LOCAL_ENV_FILES: metadataFile,
    RELEASE_SUMMARY_OUTPUT_FILE: outputFile,
    GITHUB_RUN_ID: undefined,
    GITHUB_SHA: undefined,
  });
  assert(
    output.includes("Release candidate summary written:"),
    "release summary should run with metadata from LOCAL_ENV_FILES",
  );

  const summary = readFileSync(outputFile, { encoding: "utf8" });
  assert(
    summary.includes("evidence_run_id=local-env-run"),
    "release summary local env output should include evidence run id",
  );
  assert(
    summary.includes("release_version=v0.1.0-rc.local"),
    "release summary local env output should include release version",
  );
  assert(
    summary.includes("github_run_id=local-env-gh-run"),
    "release summary local env output should include GitHub run id",
  );
  evidenceLines.push(
    "PASS | Release summary metadata can be loaded from a local env file.",
  );
}

function testReleaseEvidenceRunIdLoadsLocalEnvFile() {
  evidenceLines.push("CHECK | Release evidence run ID local env metadata");
  const metadataFile = join(tempRoot, "release-evidence-run.env");
  const outputFile = join(evidenceRoot, "data-snapshot-checklist-local-env.txt");
  writeFileSync(
    metadataFile,
    [
      "RELEASE_EVIDENCE_RUN_ID=local-env-evidence-run",
      "RELEASE_VERSION=v0.1.0-rc.local",
      "GITHUB_RUN_ID=local-env-gh-run",
      "GITHUB_SHA=abcdef1234567890",
      "",
    ].join("\n"),
  );

  const output = runNodeScript("scripts/release-data-snapshot-checklist.mjs", {
    LOCAL_ENV_FILES: metadataFile,
    RELEASE_DATA_SNAPSHOT_CHECKLIST_OUTPUT_FILE: outputFile,
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });
  assert(
    output.includes("Evidence run ID: local-env-evidence-run"),
    "release evidence run helper should load evidence run ID from LOCAL_ENV_FILES",
  );

  const checklist = readFileSync(outputFile, { encoding: "utf8" });
  assert(
    checklist.includes("Evidence run ID: local-env-evidence-run"),
    "release checklist output should include local env evidence run ID",
  );
  evidenceLines.push(
    "PASS | Release evidence checklist run IDs can be loaded from a local env file.",
  );
}

function testBackupSummary() {
  evidenceLines.push("CHECK | Backup summary");
  const backupFile = join(evidenceRoot, "backups", "ogfi-erp-self-test.dump");
  const backupContent = "self-test backup content\n";
  const checksum = createHash("sha256").update(backupContent).digest("hex");
  writeFileSync(backupFile, backupContent);
  writeFileSync(`${backupFile}.sha256`, `${checksum}  ogfi-erp-self-test.dump\n`);

  const output = runNodeScript("scripts/release-backup-summary.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    BACKUP_FILE: backupFile,
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_self_test",
    GITHUB_RUN_ID: "self-test-run",
    GITHUB_SHA: "abcdef1234567890",
    RELEASE_ENVIRONMENT: "self-test",
  });

  assert(
    output.includes("Backup summary written:"),
    "backup summary command should report output path",
  );

  const summary = readFileSync(
    join(evidenceRoot, "backups", "backup-summary.txt"),
    {
      encoding: "utf8",
    },
  );
  assert(
    summary.includes("evidence_run_id=self-test-run"),
    "backup summary should include evidence run ID",
  );
  assert(
    summary.includes("database_fingerprint="),
    "backup summary should include redacted database fingerprint",
  );
  assert(
    summary.includes(`backup_file=${backupFile}`),
    "backup summary should include backup file",
  );
  assert(
    summary.includes("backup_checksum_status=present"),
    "backup summary should include checksum status",
  );
  assert(
    summary.includes("RESULT | PASS | Backup summary captured."),
    "backup summary should include pass marker",
  );

  const metadataFile = join(tempRoot, "backup-summary-metadata.env");
  const localEnvOutputFile = join(
    evidenceRoot,
    "backups",
    "backup-summary-local-env.txt",
  );
  writeFileSync(
    metadataFile,
    [
      "RELEASE_EVIDENCE_RUN_ID=backup-local-env-run",
      "RELEASE_ENVIRONMENT=backup-local-env",
      "GITHUB_RUN_ID=backup-local-env-gh-run",
      "GITHUB_SHA=abcdef1234567890",
      "",
    ].join("\n"),
  );
  runNodeScript("scripts/release-backup-summary.mjs", {
    LOCAL_ENV_FILES: metadataFile,
    RELEASE_BACKUP_SUMMARY_OUTPUT_FILE: localEnvOutputFile,
    BACKUP_FILE: backupFile,
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_self_test",
    GITHUB_RUN_ID: undefined,
    GITHUB_SHA: undefined,
  });
  const localEnvSummary = readFileSync(localEnvOutputFile, {
    encoding: "utf8",
  });
  assert(
    localEnvSummary.includes("evidence_run_id=backup-local-env-run") &&
      localEnvSummary.includes("environment=backup-local-env") &&
      localEnvSummary.includes("github_run_id=backup-local-env-gh-run") &&
      localEnvSummary.includes("github_sha=abcdef1234567890"),
    "backup summary should load release metadata from LOCAL_ENV_FILES",
  );
  evidenceLines.push(
    "PASS | Backup summary captures backup artifact metadata required by GO / NO-GO.",
  );

  const invalidResult = spawnSync(
    process.execPath,
    ["scripts/release-backup-summary.mjs"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_EVIDENCE_ROOT: evidenceRoot,
        RELEASE_EVIDENCE_RUN_ID: "self-test-run",
        BACKUP_FILE: backupFile,
        GITHUB_RUN_ID: "self-test-run",
        GITHUB_SHA: "not-a-sha",
        RELEASE_ENVIRONMENT: "self-test",
      },
      encoding: "utf8",
    },
  );
  assert(
    invalidResult.status !== 0 &&
      `${invalidResult.stdout}${invalidResult.stderr}`.includes(
        "GITHUB_SHA value valid",
      ),
    "backup summary should reject invalid metadata",
  );
}

function testRestoreSummary() {
  evidenceLines.push("CHECK | Restore summary");
  const backupFile = join(evidenceRoot, "backups", "ogfi-erp-self-test.dump");
  const output = runNodeScript("scripts/release-restore-summary.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    BACKUP_FILE: backupFile,
    RESTORE_DATABASE: "self_test_restore",
    RESTORE_DATABASE_URL:
      "postgres://self-test:secret@localhost:5432/ogfi_self_test_restore",
    GITHUB_RUN_ID: "self-test-run",
    GITHUB_SHA: "abcdef1234567890",
    RELEASE_ENVIRONMENT: "self-test",
  });

  assert(
    output.includes("Restore-check summary written:"),
    "restore summary command should report output path",
  );

  const summary = readFileSync(
    join(evidenceRoot, "backups", "restore-check-summary.txt"),
    {
      encoding: "utf8",
    },
  );
  assert(
    summary.includes(`backup_file=${backupFile}`),
    "restore summary should include backup file",
  );
  assert(
    summary.includes("evidence_run_id=self-test-run"),
    "restore summary should include evidence run ID",
  );
  assert(
    summary.includes("restore_database_fingerprint="),
    "restore summary should include redacted restore database fingerprint",
  );
  assert(
    summary.includes("restore_database=self_test_restore"),
    "restore summary should include restore database",
  );
  assert(
    summary.includes("restore_database_source=RESTORE_DATABASE"),
    "restore summary should record explicit restore database source",
  );
  assert(
    summary.includes("restore_target_safety=passed"),
    "restore summary should include restore target safety result",
  );
  assert(
    summary.includes("RESULT | PASS | Restore-check summary captured."),
    "restore summary should include pass marker",
  );
  evidenceLines.push(
    "PASS | Restore summary captures backup and isolated restore metadata required by GO / NO-GO.",
  );

  const derivedOutputFile = join(
    evidenceRoot,
    "backups",
    "restore-check-summary-derived.txt",
  );
  runNodeScript("scripts/release-restore-summary.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_RESTORE_SUMMARY_OUTPUT_FILE: derivedOutputFile,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    BACKUP_FILE: backupFile,
    RESTORE_DATABASE_URL:
      "postgres://self-test:secret@localhost:5432/ogfi_restore_derived",
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_source",
    GITHUB_RUN_ID: "self-test-run",
    GITHUB_SHA: "abcdef1234567890",
    RELEASE_ENVIRONMENT: "self-test",
  });
  const derivedSummary = readFileSync(derivedOutputFile, "utf8");
  assert(
    derivedSummary.includes("restore_database=ogfi_restore_derived"),
    "restore summary should derive restore database from RESTORE_DATABASE_URL",
  );
  assert(
    derivedSummary.includes("restore_database_source=RESTORE_DATABASE_URL"),
    "restore summary should record derived restore database source",
  );

  const invalidResult = spawnSync(
    process.execPath,
    ["scripts/release-restore-summary.mjs"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_EVIDENCE_ROOT: evidenceRoot,
        RELEASE_EVIDENCE_RUN_ID: "self-test-run",
        BACKUP_FILE: backupFile,
        RESTORE_DATABASE: "self_test_restore",
        GITHUB_RUN_ID: "self-test-run",
        GITHUB_SHA: "not-a-sha",
        RELEASE_ENVIRONMENT: "self-test",
      },
      encoding: "utf8",
    },
  );
  assert(
    invalidResult.status !== 0 &&
      `${invalidResult.stdout}${invalidResult.stderr}`.includes(
        "GITHUB_SHA value valid",
      ),
    "restore summary should reject invalid metadata",
  );
}

function testRestoreTargetSafety() {
  evidenceLines.push("CHECK | Restore target safety");
  const safe = evaluateRestoreTargetSafety({
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_source",
    RESTORE_DATABASE_URL:
      "postgres://restore-test:secret@localhost:5432/ogfi_restore_test",
  });
  assert(safe.pass, "restore target safety should allow explicit restore targets");

  const sameTarget = evaluateRestoreTargetSafety({
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_source",
    RESTORE_DATABASE_URL:
      "postgres://self-test:secret@localhost:5432/ogfi_source",
  });
  assert(
    !sameTarget.pass,
    "restore target safety should reject source/restore target equivalence",
  );

  const productionLike = evaluateRestoreTargetSafety({
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_source",
    RESTORE_DATABASE_URL:
      "postgres://restore-test:secret@db.example.com:5432/ogfi_prod",
  });
  assert(
    !productionLike.pass,
    "restore target safety should reject production-like restore targets",
  );

  const unmarked = evaluateRestoreTargetSafety({
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_source",
    RESTORE_DATABASE_URL:
      "postgres://restore-test:secret@db.example.com:5432/ogfi_copy",
  });
  assert(
    !unmarked.pass,
    "restore target safety should require an explicit isolated restore marker",
  );

  evidenceLines.push(
    "PASS | Restore target safety rejects risky destructive restore targets.",
  );
}

function testRollbackSummary() {
  evidenceLines.push("CHECK | Rollback summary");
  const output = runNodeScript("scripts/release-rollback-summary.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    ROLLBACK_RELEASE_VERSION: "self-test-rollback",
    GITHUB_RUN_ID: "self-test-run",
    GITHUB_SHA: "abcdef1234567890",
    RELEASE_ENVIRONMENT: "self-test",
  });

  assert(
    output.includes("Staging rollback summary written:"),
    "rollback summary command should report output path",
  );

  const summary = readFileSync(
    join(evidenceRoot, "staging-rollback", "rollback-summary.txt"),
    {
      encoding: "utf8",
    },
  );
  assert(
    summary.includes("evidence_run_id=self-test-run"),
    "rollback summary should include evidence run ID",
  );
  assert(
    summary.includes("rollback_release_version=self-test-rollback"),
    "rollback summary should include rollback release version",
  );
  assert(
    summary.includes("github_run_id=self-test-run"),
    "rollback summary should include run ID",
  );
  assert(
    summary.includes("RESULT | PASS | Staging rollback summary captured."),
    "rollback summary should include pass marker",
  );
  evidenceLines.push(
    "PASS | Rollback summary captures rollback metadata required by GO / NO-GO.",
  );

  const invalidResult = spawnSync(
    process.execPath,
    ["scripts/release-rollback-summary.mjs"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_EVIDENCE_ROOT: evidenceRoot,
        RELEASE_EVIDENCE_RUN_ID: "self-test-run",
        ROLLBACK_RELEASE_VERSION: "self-test-rollback",
        GITHUB_RUN_ID: "self-test-run",
        GITHUB_SHA: "not-a-sha",
      },
      encoding: "utf8",
    },
  );
  assert(
    invalidResult.status !== 0 &&
      `${invalidResult.stdout}${invalidResult.stderr}`.includes(
        "GITHUB_SHA value valid",
      ),
    "rollback summary should reject invalid metadata",
  );
}

function testBackupRestoreStatus() {
  evidenceLines.push("CHECK | Backup/restore status");
  runNodeScript("scripts/release-backup-restore-preflight.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_self_test",
    RESTORE_DATABASE_URL:
      "postgres://self-test:secret@localhost:5432/ogfi_self_test_restore",
  });

  const output = runNodeScript("scripts/release-backup-restore-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes(
      "OGFI ERP Phase I / Phase 1.5 backup, restore, and rollback readiness status",
    ),
    "backup/restore status header missing",
  );
  assert(
    output.includes("RESULT | BLOCKED"),
    "backup/restore status should remain blocked when post-rollback smoke is missing",
  );
  assert(
    output.includes("Required Evidence Sequence"),
    "backup/restore status should include ordered recovery evidence sequence",
  );
  assert(
    output.includes("SMOKE_OUTPUT_DIR=release-evidence/staging-rollback/smoke pnpm release:smoke"),
    "backup/restore status should include post-rollback smoke command guidance",
  );
  assert(
    output.includes("PASS | Backup/restore evidence consistency"),
    "backup/restore status should verify backup, restore, and rollback evidence consistency",
  );
  assert(
    output.includes("PASS | Backup checksum integrity"),
    "backup/restore status should verify the backup dump against its checksum artifact",
  );
  assert(
    output.includes("metadata_evidence_run_id=self-test-run"),
    "backup/restore status should surface evidence run metadata",
  );
  assert(
    readdirSync(join(evidenceRoot, "backup-restore-status")).some((file) =>
      /^backup-restore-status-.*\.txt$/.test(file),
    ),
    "backup/restore status artifact missing",
  );
  evidenceLines.push(
    "PASS | Backup/restore status reports missing recovery evidence without approving release.",
  );
}

function testRecoveryChecklist() {
  evidenceLines.push("CHECK | Recovery evidence checklist");
  const output = runNodeScript("scripts/release-recovery-evidence-checklist.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 recovery evidence checklist"),
    "recovery evidence checklist header missing",
  );
  assert(
    output.includes("This checklist is advisory."),
    "recovery evidence checklist should state advisory boundary",
  );
  assert(
    output.includes("COMMAND | pnpm release:backup-restore-preflight"),
    "recovery evidence checklist should include backup/restore preflight command",
  );
  assert(
    output.includes("COMMAND | BACKUP_DIR=release-evidence/backups pnpm db:backup"),
    "recovery evidence checklist should include backup command",
  );
  assert(
    output.includes("COMMAND | SMOKE_OUTPUT_DIR=release-evidence/staging-rollback/smoke pnpm release:smoke"),
    "recovery evidence checklist should include post-rollback smoke command",
  );
  assert(
    output.includes("Latest Backup/Restore Status"),
    "recovery evidence checklist should include latest status snapshot",
  );
  assert(
    output.includes("RESULT | ACTION REQUIRED |"),
    "recovery evidence checklist should require action until recovery evidence passes",
  );
  assert(
    readdirSync(join(evidenceRoot, "recovery-checklist")).some((file) =>
      /^recovery-evidence-checklist-.*\.txt$/.test(file),
    ),
    "recovery evidence checklist artifact missing",
  );
  evidenceLines.push(
    "PASS | Recovery checklist gives owners backup/restore/rollback evidence steps without running recovery actions.",
  );
}

function testDeploymentStatus() {
  evidenceLines.push("CHECK | Deployment status");
  const deploymentFile = join(tempRoot, "deployment-evidence.md");
  writeFileSync(
    deploymentFile,
    [
      "# Self-Test Deployment Checklist",
      "",
      "## Required Evidence",
      "",
      "| Area | Evidence required | Owner | Environment | Execution date/time | Actual actor | Result | Evidence reference |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Release candidate | Version and migration state | Release Manager | Pending | Pending | Pending | Pending | Pending |",
      "| Secret review | Secret scan proof | DevOps Owner | staging | 2026-07-01 09:00 Asia/Manila | Nico Valdez | Failed | release-evidence/secret-review/secret-review.txt |",
      "",
      "## Focused Release Evidence Sheets",
      "",
      "### Migration And Schema Rehearsal",
      "",
      "| Evidence item | Required capture | Owner | Environment | Execution date/time | Actual actor | Result | Evidence reference |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Migration source | Migration folder list | Tech Lead | Pending | Pending | Pending | Pending | Pending |",
      "",
      "### Backup, Restore, And Rollback Drill",
      "",
      "| Evidence item | Required capture | Owner | Environment | Execution date/time | Actual actor | Result | Evidence reference |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Pre-release backup | Backup artifact | DevOps Owner | Pending | Pending | Pending | Pending | Pending |",
      "",
      "### Release Smoke Evidence",
      "",
      "| Evidence item | Required capture | Owner | Environment | Execution date/time | Actual actor | Result | Evidence reference |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Authentication and scope switch | Sign-in proof | QA Lead | Pending | Pending | Pending | Pending | Pending |",
      "",
      "## Rollback Decision Rules",
      "",
      "## Hypercare And Support Readiness",
      "",
      "| Area | Required evidence | Owner | Result | Evidence reference |",
      "| --- | --- | --- | --- | --- |",
      "| Pilot support window | Dates and hours | Product Owner | Pending | Pending |",
      "",
      "## Signoff",
      "",
      "| Role | Name | Decision | Date | Notes |",
      "| --- | --- | --- | --- | --- |",
      "| Release Manager | TBD | Pending | TBD | TBD |",
      "| Product Owner | Nico Valdez | Reviewed | 2026-07-01 | No blockers noted |",
      "",
    ].join("\n"),
  );

  const output = runNodeScript("scripts/release-deployment-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_DEPLOYMENT_EVIDENCE_FILE: deploymentFile,
  });

  assert(
    output.includes("Evidence run ID: self-test-run"),
    "deployment status should include evidence run ID",
  );
  assert(
    output.includes(
      "RESULT | WARN | Deployment, rollback, backup/restore, smoke, and signoff evidence is incomplete",
    ),
    "deployment status should warn when deployment evidence placeholders remain",
  );
  assert(
    output.includes("Incomplete Owner Summary"),
    "deployment status should include owner summary section",
  );
  assert(
    output.includes("Unresolved Token Sections"),
    "deployment status should include unresolved token section summary",
  );
  assert(
    output.includes("Invalid Deployment Evidence Fields"),
    "deployment status should include field-level validation output",
  );
  assert(
    output.includes("field=Result | reason=unsupported_or_unaccepted_result"),
    "deployment status should reject failed, blocked, or not-run evidence rows before GO review",
  );
  assert(
    output.includes("field=Decision | reason=explicit_release_decision_required"),
    "deployment status should reject vague signoff decisions",
  );
  assert(
    output.includes("WARN | Required Evidence"),
    "deployment status should summarize unresolved tokens by evidence section",
  );
  assert(
    output.includes("WARN | Release Manager | incomplete_rows=2"),
    "deployment status should summarize incomplete release-manager-owned rows including signoff",
  );
  assert(
    output.includes("WARN | DevOps Owner | incomplete_rows=1"),
    "deployment status should summarize incomplete DevOps-owned rows",
  );
  assert(
    readdirSync(join(evidenceRoot, "deployment-status")).some((file) =>
      /^deployment-status-.*\.txt$/.test(file),
    ),
    "deployment status artifact missing",
  );
  evidenceLines.push(
    "PASS | Deployment status reports incomplete deployment, rollback, smoke, and signoff placeholders.",
  );
}

function testDeploymentChecklist() {
  evidenceLines.push("CHECK | Deployment evidence checklist");
  const output = runNodeScript("scripts/release-deployment-evidence-checklist.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 deployment evidence checklist"),
    "deployment checklist header missing",
  );
  assert(
    output.includes("Evidence run ID: self-test-run"),
    "deployment checklist should include evidence run ID",
  );
  assert(
    output.includes("FIELD | release candidate"),
    "deployment checklist should require release candidate fields",
  );
  assert(
    output.includes("FIELD | environment separation"),
    "deployment checklist should require environment separation fields",
  );
  assert(
    output.includes("FIELD | staging release proof"),
    "deployment checklist should require staging release proof fields",
  );
  assert(
    output.includes("FIELD | rollback proof"),
    "deployment checklist should require rollback proof fields",
  );
  assert(
    output.includes("FIELD | smoke proof"),
    "deployment checklist should require smoke proof fields",
  );
  assert(
    output.includes("FIELD | monitoring/support"),
    "deployment checklist should require monitoring and support fields",
  );
  assert(
    output.includes("FIELD | final integrity"),
    "deployment checklist should require final manifest integrity fields",
  );
  assert(
    output.includes("This checklist is advisory"),
    "deployment checklist should state advisory boundary",
  );
  assert(
    output.includes("Latest Deployment Status"),
    "deployment checklist should include latest deployment status snapshot",
  );
  assert(
    output.includes("Latest Backup/Restore Status"),
    "deployment checklist should include latest backup/restore status snapshot",
  );
  assert(
    output.includes("RESULT | ACTION REQUIRED | Collect real deployment"),
    "deployment checklist should end with one action-required owner handoff",
  );
  assert(
    readdirSync(join(evidenceRoot, "deployment-checklist")).some((file) =>
      /^deployment-evidence-checklist-.*\.txt$/.test(file),
    ),
    "deployment checklist artifact missing",
  );
  evidenceLines.push(
    "PASS | Deployment checklist defines owner evidence requirements without fabricating proof.",
  );
}

function testLatestDataSnapshotCompare() {
  evidenceLines.push("CHECK | Latest data snapshot compare");
  const snapshotDir = join(evidenceRoot, "data-snapshots");
  writeFileSync(
    join(snapshotDir, "data-pre-migration-rehearsal-self-test.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 release data snapshot",
      "Generated UTC: 20260701T010000Z",
      "Evidence run ID: self-test-run",
      "Database URL fingerprint: selftestdb",
      "Label: pre-migration-rehearsal",
      "Tenant | 1",
      "DIGEST Tenant | d41d8cd98f00b204e9800998ecf8427e",
      "Company | 1",
      "DIGEST Company | d41d8cd98f00b204e9800998ecf8427e",
      "PurchaseRequest | 2",
      "DIGEST PurchaseRequest | d41d8cd98f00b204e9800998ecf8427e",
      "RESULT | PASS | Data snapshot captured.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(snapshotDir, "data-post-migration-rehearsal-self-test.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 release data snapshot",
      "Generated UTC: 20260701T020000Z",
      "Evidence run ID: self-test-run",
      "Database URL fingerprint: selftestdb",
      "Label: post-migration-rehearsal",
      "Tenant | 1",
      "DIGEST Tenant | d41d8cd98f00b204e9800998ecf8427e",
      "Company | 1",
      "DIGEST Company | d41d8cd98f00b204e9800998ecf8427e",
      "PurchaseRequest | 2",
      "DIGEST PurchaseRequest | d41d8cd98f00b204e9800998ecf8427e",
      "RESULT | PASS | Data snapshot captured.",
      "",
    ].join("\n"),
  );

  runNodeScript("scripts/release-data-snapshot-compare-latest.mjs", {
    RELEASE_DATA_SNAPSHOT_COMPARE_SOURCE_DIR: snapshotDir,
    RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_DIR: snapshotDir,
  });

  const deltaFile = readdirSync(snapshotDir).find((file) =>
    /^data-snapshot-delta-.*\.txt$/.test(file),
  );
  assert(deltaFile, "latest data snapshot delta artifact missing");

  const delta = readFileSync(join(snapshotDir, deltaFile), {
    encoding: "utf8",
  });
  assert(
    delta.includes("RESULT | PASS | Snapshot delta captured."),
    "latest data snapshot delta should include pass marker",
  );
  assert(
    delta.includes("Before evidence run ID: self-test-run"),
    "latest data snapshot delta should include before evidence run id",
  );
  assert(
    delta.includes("Before database fingerprint: selftestdb"),
    "latest data snapshot delta should include database fingerprint",
  );
  evidenceLines.push(
    "PASS | Latest data snapshot compare selects pre/post snapshots and writes delta evidence.",
  );

  const invalidSnapshot = join(snapshotDir, "data-invalid-self-test.txt");
  writeFileSync(
    invalidSnapshot,
    [
      "OGFI ERP Phase I / Phase 1.5 release data snapshot",
      "Tenant | 1",
      "RESULT | PASS | Data snapshot captured.",
      "",
    ].join("\n"),
  );

  const invalidResult = spawnSync(
    process.execPath,
    ["scripts/release-data-snapshot-compare.mjs"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_DATA_SNAPSHOT_BEFORE: invalidSnapshot,
        RELEASE_DATA_SNAPSHOT_AFTER: join(
          snapshotDir,
          "data-post-migration-rehearsal-self-test.txt",
        ),
        RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_DIR: snapshotDir,
      },
      encoding: "utf8",
    },
  );
  assert(
    invalidResult.status !== 0 &&
      `${invalidResult.stdout}${invalidResult.stderr}`.includes(
        "snapshot label present",
    ),
    "data snapshot compare should reject malformed snapshot evidence",
  );

  const mismatchedRunSnapshot = join(
    snapshotDir,
    "data-post-migration-rehearsal-mismatched-run-self-test.txt",
  );
  writeFileSync(
    mismatchedRunSnapshot,
    [
      "OGFI ERP Phase I / Phase 1.5 release data snapshot",
      "Generated UTC: 20260701T030000Z",
      "Evidence run ID: other-self-test-run",
      "Database URL fingerprint: selftestdb",
      "Label: post-migration-rehearsal",
      "Tenant | 1",
      "Company | 1",
      "PurchaseRequest | 3",
      "RESULT | PASS | Data snapshot captured.",
      "",
    ].join("\n"),
  );

  const mismatchedRunResult = spawnSync(
    process.execPath,
    ["scripts/release-data-snapshot-compare.mjs"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_DATA_SNAPSHOT_BEFORE: join(
          snapshotDir,
          "data-pre-migration-rehearsal-self-test.txt",
        ),
        RELEASE_DATA_SNAPSHOT_AFTER: mismatchedRunSnapshot,
        RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_DIR: snapshotDir,
      },
      encoding: "utf8",
    },
  );
  assert(
    mismatchedRunResult.status !== 0 &&
      `${mismatchedRunResult.stdout}${mismatchedRunResult.stderr}`.includes(
        "same evidence run ID",
      ),
    "data snapshot compare should reject mismatched evidence run IDs",
  );
  rmSync(mismatchedRunSnapshot);

  const changedContentSnapshot = join(
    snapshotDir,
    "data-post-migration-rehearsal-content-change-self-test.txt",
  );
  writeFileSync(
    changedContentSnapshot,
    [
      "OGFI ERP Phase I / Phase 1.5 release data snapshot",
      "Generated UTC: 20260701T035000Z",
      "Evidence run ID: self-test-run",
      "Database URL fingerprint: selftestdb",
      "Label: post-migration-rehearsal",
      "Tenant | 1",
      "DIGEST Tenant | d41d8cd98f00b204e9800998ecf8427e",
      "Company | 1",
      "DIGEST Company | d41d8cd98f00b204e9800998ecf8427e",
      "PurchaseRequest | 2",
      "DIGEST PurchaseRequest | 0cc175b9c0f1b6a831c399e269772661",
      "RESULT | PASS | Data snapshot captured.",
      "",
    ].join("\n"),
  );
  const changedContentResult = spawnSync(
    process.execPath,
    ["scripts/release-data-snapshot-compare.mjs"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_DATA_SNAPSHOT_BEFORE: join(
          snapshotDir,
          "data-pre-migration-rehearsal-self-test.txt",
        ),
        RELEASE_DATA_SNAPSHOT_AFTER: changedContentSnapshot,
        RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_FILE: join(
          tempRoot,
          "changed-content-delta.txt",
        ),
      },
      encoding: "utf8",
    },
  );
  assert(
    changedContentResult.status !== 0 &&
      `${changedContentResult.stdout}${changedContentResult.stderr}`.includes(
        "MISMATCH",
      ),
    "data snapshot compare should reject changed table content digests",
  );
  rmSync(changedContentSnapshot);

  const negativeDeltaSnapshot = join(
    snapshotDir,
    "data-post-migration-rehearsal-negative-delta-self-test.txt",
  );
  writeFileSync(
    negativeDeltaSnapshot,
    [
      "OGFI ERP Phase I / Phase 1.5 release data snapshot",
      "Generated UTC: 20260701T040000Z",
      "Evidence run ID: self-test-run",
      "Database URL fingerprint: selftestdb",
      "Label: post-migration-rehearsal",
      "Tenant | 1",
      "Company | 1",
      "PurchaseRequest | 1",
      "RESULT | PASS | Data snapshot captured.",
      "",
    ].join("\n"),
  );
  const negativeDeltaResult = spawnSync(
    process.execPath,
    ["scripts/release-data-snapshot-compare.mjs"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_DATA_SNAPSHOT_BEFORE: join(
          snapshotDir,
          "data-pre-migration-rehearsal-self-test.txt",
        ),
        RELEASE_DATA_SNAPSHOT_AFTER: negativeDeltaSnapshot,
        RELEASE_DATA_SNAPSHOT_COMPARE_OUTPUT_FILE: join(
          tempRoot,
          "negative-count-delta.txt",
        ),
      },
      encoding: "utf8",
    },
  );
  assert(
    negativeDeltaResult.status !== 0 &&
      `${negativeDeltaResult.stdout}${negativeDeltaResult.stderr}`.includes(
        "disallowed changed table delta",
      ),
    "data snapshot compare should reject negative row-count deltas",
  );
  rmSync(negativeDeltaSnapshot);
}

function testMigrationReviewInventory() {
  evidenceLines.push("CHECK | Migration review inventory");
  const fixtureRoot = join(tempRoot, "migration-review-fixture");
  const migrationsDir = join(fixtureRoot, "migrations");
  const additiveDir = join(migrationsDir, "0001_additive");
  const destructiveDir = join(migrationsDir, "0002_destructive");
  const registerFile = join(fixtureRoot, "register.md");
  const outputFile = join(fixtureRoot, "inventory.json");
  const destructiveSql = 'ALTER TABLE "Example" DROP CONSTRAINT "Example_code_key";\n';
  mkdirSync(additiveDir, { recursive: true });
  mkdirSync(destructiveDir, { recursive: true });
  writeFileSync(join(migrationsDir, "migration_lock.toml"), 'provider = "postgresql"\n');
  writeFileSync(join(additiveDir, "migration.sql"), 'CREATE TABLE "Example" ("id" UUID PRIMARY KEY);\n');
  writeFileSync(join(destructiveDir, "migration.sql"), destructiveSql);
  const hash = createHash("sha256").update(destructiveSql).digest("hex");
  writeFileSync(
    registerFile,
    [
      "<!-- MIGRATION_SAFETY_REGISTER_JSON_START -->",
      "```json",
      JSON.stringify([
        {
          migration: "0002_destructive",
          sha256: hash,
          risk: "Constraint removal can weaken integrity.",
          expectedDataEffect: "No row mutation.",
          recovery: "Restore the constraint through a reviewed forward fix.",
          failurePoint: "Constraint removal can weaken integrity.",
          transactionBehavior: "No explicit transaction; inspect partial state.",
          reversibility: "Use a forward fix or restore backup.",
          decisionTrigger: "Stop on any failed release gate.",
          owner: "Database Engineering / Release Manager.",
          verification: "Verify migration journal, schema, data, and invariants.",
          expectedRecoveryTime: "Measure during rehearsal against approved RTO/RPO.",
          reviewerStatus: "PENDING",
        },
      ]),
      "```",
      "<!-- MIGRATION_SAFETY_REGISTER_JSON_END -->",
      "",
    ].join("\n"),
  );

  runNodeScript("scripts/release-migration-review.mjs", {
    RELEASE_MIGRATION_REVIEW_MIGRATIONS_DIR: migrationsDir,
    RELEASE_MIGRATION_REVIEW_REGISTER: registerFile,
    RELEASE_MIGRATION_REVIEW_OUTPUT_FILE: outputFile,
    RELEASE_MIGRATION_REVIEW_TIMESTAMP: "2026-07-21T00:00:00Z",
    RELEASE_MIGRATION_REVIEW_REQUIRE_APPROVED: "no",
  });
  const inventory = JSON.parse(readFileSync(outputFile, "utf8"));
  assert(inventory.summary.migrationCount === 2, "migration inventory should include every migration");
  assert(inventory.summary.destructiveMigrationCount === 1, "migration inventory should classify dropped constraints as destructive");

  const approvalResult = spawnSync(
    process.execPath,
    ["scripts/release-migration-review.mjs"],
    {
      cwd: workspaceRoot,
      env: childProcessEnv({
        RELEASE_MIGRATION_REVIEW_MIGRATIONS_DIR: migrationsDir,
        RELEASE_MIGRATION_REVIEW_REGISTER: registerFile,
        RELEASE_MIGRATION_REVIEW_OUTPUT_FILE: outputFile,
        RELEASE_MIGRATION_REVIEW_TIMESTAMP: "2026-07-21T00:00:00Z",
        RELEASE_MIGRATION_REVIEW_REQUIRE_APPROVED: "yes",
        RELEASE_CANDIDATE_SHA: "1234567890abcdef1234567890abcdef12345678",
        RELEASE_EVIDENCE_RUN_ID: "self-test-run",
      }),
      encoding: "utf8",
    },
  );
  assert(
    approvalResult.status !== 0 &&
      `${approvalResult.stdout}${approvalResult.stderr}`.includes(
        "requires APPROVED safety dispositions",
      ),
    "migration review release mode should reject pending dispositions",
  );
  evidenceLines.push("PASS | Migration inventory is hash-bound and fails closed on pending destructive review.");
}

function testDataEquivalenceFailsClosed() {
  evidenceLines.push("CHECK | Restore data equivalence");
  const outputFile = join(tempRoot, "data-equivalence-fail.txt");
  const result = spawnSync(process.execPath, ["scripts/release-data-equivalence.mjs"], {
    cwd: workspaceRoot,
    env: childProcessEnv({
      SOURCE_DATABASE_URL: undefined,
      TARGET_DATABASE_URL: undefined,
      RELEASE_DATA_EQUIVALENCE_OUTPUT_FILE: outputFile,
    }),
    encoding: "utf8",
  });
  assert(result.status !== 0, "data equivalence should fail without separate database URLs");
  const artifact = readFileSync(outputFile, "utf8");
  assert(artifact.includes("RESULT | FAIL |"), "data equivalence should write fail evidence");
  assert(!artifact.includes("postgresql://"), "data equivalence evidence must not expose database URLs");
  const sameDatabaseOutput = join(tempRoot, "data-equivalence-same-db.txt");
  const sameDatabaseResult = spawnSync(
    process.execPath,
    ["scripts/release-data-equivalence.mjs"],
    {
      cwd: workspaceRoot,
      env: childProcessEnv({
        SOURCE_DATABASE_URL: "postgresql://user:secret@localhost:5432/same_test",
        TARGET_DATABASE_URL: "postgresql://user:secret@localhost:5432/same_test",
        RELEASE_CANDIDATE_SHA: "1234567890abcdef1234567890abcdef12345678",
        RELEASE_PREDECESSOR_SHA: "abcdef1234567890abcdef1234567890abcdef12",
        RELEASE_DATA_EQUIVALENCE_OUTPUT_FILE: sameDatabaseOutput,
      }),
      encoding: "utf8",
    },
  );
  assert(
    sameDatabaseResult.status !== 0 &&
      `${sameDatabaseResult.stdout}${sameDatabaseResult.stderr}`.includes(
        "fingerprints must be different",
      ),
    "data equivalence should reject the same source and target database",
  );
  assert(
    !readFileSync(sameDatabaseOutput, "utf8").includes("secret"),
    "same-database failure evidence must redact credentials",
  );
  evidenceLines.push("PASS | Restore equivalence fails closed and writes sanitized evidence.");
}

function testDataSnapshotStatus() {
  evidenceLines.push("CHECK | Data snapshot status");
  runNodeScript("scripts/release-data-snapshot-preflight.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_DATA_SNAPSHOT_OUTPUT_DIR: join(evidenceRoot, "data-snapshots"),
  });
  writeFileSync(
    join(evidenceRoot, "data-snapshots", "data-snapshot-preflight-self-test-pass.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 data snapshot preflight",
      "Evidence run ID: self-test-run",
      "Database URL fingerprint: selftestdb",
      "PASS | DATABASE_URL configured",
      "PASS | psql available or PSQL_BIN configured",
      "PASS | snapshot label valid",
      "RESULT | PASS | Data snapshot prerequisites are configured.",
      "",
    ].join("\n"),
  );

  const output = runNodeScript("scripts/release-data-snapshot-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 data snapshot readiness status"),
    "data snapshot status header missing",
  );
  assert(
    output.includes("RESULT | PASS | Data snapshot rehearsal evidence is present"),
    "data snapshot status should pass when pre/post/delta self-test evidence is present",
  );
  assert(
    output.includes("Required Evidence Sequence"),
    "data snapshot status should include ordered migration-safety evidence sequence",
  );
  assert(
    output.includes("pnpm release:data-snapshot:compare-latest"),
    "data snapshot status should include latest snapshot compare guidance",
  );
  assert(
    output.includes("PASS | Pre/post snapshot consistency"),
    "data snapshot status should verify pre/post run id and database fingerprint consistency",
  );
  assert(
    output.includes("PASS | Data snapshot delta consistency"),
    "data snapshot status should verify the delta artifact matches the selected pre/post snapshots",
  );
  assert(
    output.includes("metadata_evidence_run_id=self-test-run"),
    "data snapshot status should surface artifact evidence run metadata",
  );
  assert(
    output.includes("PASS | Data snapshot preflight | data-snapshot-preflight-self-test-pass.txt"),
    "data snapshot status should require PASS preflight evidence for migration readiness",
  );
  assert(
    readdirSync(join(evidenceRoot, "data-snapshot-status")).some((file) =>
      /^data-snapshot-status-.*\.txt$/.test(file),
    ),
    "data snapshot status artifact missing",
  );
  evidenceLines.push(
    "PASS | Data snapshot status reports pre/post/delta migration evidence readiness.",
  );
}

function testDataSnapshotChecklist() {
  evidenceLines.push("CHECK | Data snapshot checklist");
  const output = runNodeScript("scripts/release-data-snapshot-checklist.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 data snapshot evidence checklist"),
    "data snapshot checklist header missing",
  );
  assert(
    output.includes("This checklist is advisory. It does not query a database"),
    "data snapshot checklist should state non-fabrication boundary",
  );
  assert(
    output.includes("FIELD | session lock"),
    "data snapshot checklist should require session lock fields",
  );
  assert(
    output.includes("FIELD | migration execution proof"),
    "data snapshot checklist should require external migration proof fields",
  );
  assert(
    output.includes("FIELD | delta review"),
    "data snapshot checklist should require delta review fields",
  );
  assert(
    output.includes("Critical release review requires RESULT | PASS"),
    "data snapshot checklist should require PASS preflight for critical release review",
  );
  assert(
    output.includes("Unexpected negative, missing, or unmatched deltas cannot be bypassed"),
    "data snapshot checklist should prohibit destructive delta override use",
  );
  assert(
    output.includes("final manifest checksum lines"),
    "data snapshot checklist should require manifest checksum integrity",
  );
  assert(
    output.includes("Latest Data Snapshot Preflight"),
    "data snapshot checklist should include latest preflight snapshot",
  );
  assert(
    output.includes("Latest Data Snapshot Status"),
    "data snapshot checklist should include latest data snapshot status",
  );
  assert(
    output.includes("SNAPSHOT | RESULT | PASS | Data snapshot rehearsal evidence is present"),
    "data snapshot checklist should include latest status as snapshot context",
  );
  assert(
    output.includes("RESULT | ACTION REQUIRED | Collect real migration rehearsal snapshots"),
    "data snapshot checklist should remain action-required until real migration evidence is collected",
  );
  assert(
    readdirSync(join(evidenceRoot, "data-snapshot-checklist")).some((file) =>
      /^data-snapshot-checklist-.*\.txt$/.test(file),
    ),
    "data snapshot checklist artifact missing",
  );
  evidenceLines.push(
    "PASS | Data snapshot checklist gives DBA/platform owners migration evidence, delta waiver, and manifest-integrity steps.",
  );
}

function testUatStatus() {
  evidenceLines.push("CHECK | UAT status");
  writeFileSync(
    selfTestUatFile,
    [
      "# Self-Test UAT Evidence Pack",
      "",
      "## 2. Execution Summary",
      "",
      "| Area | Status | Evidence required before GO | Owner | Signoff |",
      "| --- | --- | --- | --- | --- |",
      "| Purchasing | Pending | PR proof | QA Lead | Pending |",
      "",
      "## 3. Scenario Execution Register",
      "",
      "| ID | Area | Scenario | Tester / role | Environment | Device / browser | Execution date/time | Result | Evidence reference | Defect / waiver | Owner signoff |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| P1-UAT-001 | Purchasing | PR to approval to PO | Pending | Pending | Pending | Pending | Fail | Pending | Pending | Pending |",
      "| P1-UAT-002 | Purchasing | PO receiving variance | Branch Manager | staging | Chrome desktop | 2026-07-01 11:00 Asia/Manila | Deferred | release-evidence/screenshots/variance.png | No defect | QA Lead 2026-07-01 |",
      "",
      "## 8. Focused Evidence Capture Sheets",
      "",
      "| Evidence item | Required capture | Result | Evidence reference | Notes |",
      "| --- | --- | --- | --- | --- |",
      "| Scoped dashboard cards | Screenshot | Pending | Pending | Pending |",
      "",
      "## 9. Signoff",
      "",
    ].join("\n"),
  );

  const output = runNodeScript("scripts/release-uat-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_UAT_EVIDENCE_FILE: selfTestUatFile,
  });

  assert(
    output.includes("RESULT | WARN | UAT evidence pack is incomplete"),
    "UAT status should warn when execution placeholders remain",
  );
  assert(
    output.includes("Incomplete Scenario Areas"),
    "UAT status should include area rollup section",
  );
  assert(
    output.includes("WARN | Purchasing | incomplete_scenarios=1"),
    "UAT status should summarize incomplete scenarios by area",
  );
  assert(
    output.includes("Unresolved Token Sections"),
    "UAT status should include unresolved token section summary",
  );
  assert(
    output.includes("WARN | 3. Scenario Execution Register"),
    "UAT status should summarize unresolved tokens by markdown section",
  );
  assert(
    output.includes("Invalid UAT Evidence Fields"),
    "UAT status should include field-level validation output",
  );
  assert(
    output.includes("field=Tester / role | reason=missing_or_placeholder"),
    "UAT status should flag missing required scenario fields",
  );
  assert(
    output.includes("field=Result | reason=unsupported_or_unaccepted_result"),
    "UAT status should reject failed, blocked, or not-run scenario results before GO review",
  );
  assert(
    output.includes("field=Defect / waiver | reason=approved_waiver_or_deferral_required"),
    "UAT status should require approved disposition details for waived or deferred scenarios",
  );
  assert(
    output.includes("OWNER | severity=Critical | owner=QA Lead / Operations Lead"),
    "UAT status should include owner guidance for scenario area completion",
  );
  assert(
    output.includes("Phase 3 finance controlled foundation") &&
      output.includes("Phase 3 workforce controlled foundation") &&
      output.includes("Phase 3 deferred blocker review"),
    "UAT status should include Phase 3 workflow labels for umbrella release-status traceability",
  );

  writeFileSync(
    selfTestUatFile,
    [
      "# Self-Test UAT Evidence Pack",
      "",
      "## 2. Execution Summary",
      "",
      "| Area | Status | Evidence required before GO | Owner | Signoff |",
      "| --- | --- | --- | --- | --- |",
      "| Purchasing | Complete | PR proof | QA Lead | Nico Valdez 2026-07-01 |",
      "",
      "## 3. Scenario Execution Register",
      "",
      "| ID | Area | Scenario | Tester / role | Environment | Device / browser | Execution date/time | Result | Evidence reference | Defect / waiver | Owner signoff |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| P1-UAT-001 | Purchasing | PR to approval to PO | Branch Manager | staging | Chrome desktop | 2026-07-01 10:00 Asia/Manila | Pass | release-evidence/screenshots/pr-po.png | No defect | QA Lead 2026-07-01 |",
      "| P1-UAT-002 | Purchasing | PO receiving variance | Branch Manager | staging | Chrome desktop | 2026-07-01 11:00 Asia/Manila | Deferred | release-evidence/screenshots/variance.png | Approved deferral DEF-001 signed by Product Owner | QA Lead 2026-07-01 |",
      "",
      "## 8. Focused Evidence Capture Sheets",
      "",
      "| Evidence item | Required capture | Result | Evidence reference | Notes |",
      "| --- | --- | --- | --- | --- |",
      "| Scoped dashboard cards | Screenshot | Pass | release-evidence/screenshots/dashboard.png | Verified scoped data. |",
      "",
      "## 9. Signoff",
      "",
    ].join("\n"),
  );

  const completeOutput = runNodeScript("scripts/release-uat-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_UAT_EVIDENCE_FILE: selfTestUatFile,
  });

  assert(
    completeOutput.includes("RESULT | PASS | UAT evidence pack has no unresolved execution placeholders."),
    "UAT status should pass for a minimal complete evidence pack",
  );
  assert(
    completeOutput.includes("Evidence run ID: self-test-run"),
    "UAT status should include evidence run ID",
  );
  assert(
    readdirSync(join(evidenceRoot, "uat-status")).some((file) =>
      /^uat-status-.*\.txt$/.test(file),
    ),
    "UAT status artifact missing",
  );
  evidenceLines.push(
    "PASS | UAT status reports incomplete scenario, focused evidence, and signoff placeholders.",
  );
}

function testPilotUatStatus() {
  evidenceLines.push("CHECK | Pilot/UAT status");
  const output = runNodeScript("scripts/release-pilot-uat-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_UAT_EVIDENCE_FILE: selfTestUatFile,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 pilot and UAT readiness status"),
    "pilot/UAT status header missing",
  );
  assert(
    output.includes("RESULT | BLOCKED"),
    "pilot/UAT status should remain blocked when DB readiness and UAT evidence are incomplete",
  );
  assert(
    output.includes("SKIP | Pilot readiness / UAT recency"),
    "pilot/UAT status should skip recency check until both readiness and UAT status pass",
  );
  assert(
    output.includes("SKIP | Pilot readiness / UAT evidence run"),
    "pilot/UAT status should skip evidence run check until both readiness and UAT status pass",
  );

  const staleEvidenceRoot = join(tempRoot, "stale-pilot-uat-evidence");
  mkdirSync(join(staleEvidenceRoot, "pilot-readiness"), { recursive: true });
  mkdirSync(join(staleEvidenceRoot, "uat-status"), { recursive: true });
  writeFileSync(
    join(staleEvidenceRoot, "pilot-readiness", "pilot-readiness-20260701T020000Z.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 pilot readiness check",
      "Generated UTC: 20260701T020000Z",
      "Evidence run ID: stale-self-test-run",
      "Database URL fingerprint: stale-selftestdb",
      "Threshold snapshot: requireReleaseGatesReady=true",
      "DEC-0036 strict release gate status",
      ...strictSecurityReadinessMarkers.map((marker) => `PASS | ${marker}`),
      "",
      "RESULT | PASS | Pilot setup is ready for UAT execution evidence capture.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(staleEvidenceRoot, "uat-status", "uat-status-20260701T010000Z.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 UAT evidence status",
      "Generated UTC: 20260701T010000Z",
      "Evidence run ID: stale-self-test-run",
      "",
      "RESULT | PASS | UAT evidence pack has no unresolved execution placeholders.",
      "",
    ].join("\n"),
  );
  const staleOutput = runNodeScript("scripts/release-pilot-uat-status.mjs", {
    RELEASE_EVIDENCE_ROOT: staleEvidenceRoot,
    RELEASE_UAT_EVIDENCE_FILE: selfTestUatFile,
  });
  assert(
    staleOutput.includes("BLOCKED | Pilot readiness / UAT recency"),
    "pilot/UAT status should block when UAT status is older than pilot readiness",
  );

  const mismatchedRunEvidenceRoot = join(
    tempRoot,
    "mismatched-run-pilot-uat-evidence",
  );
  mkdirSync(join(mismatchedRunEvidenceRoot, "pilot-readiness"), {
    recursive: true,
  });
  mkdirSync(join(mismatchedRunEvidenceRoot, "uat-status"), {
    recursive: true,
  });
  writeFileSync(
    join(
      mismatchedRunEvidenceRoot,
      "pilot-readiness",
      "pilot-readiness-20260701T010000Z.txt",
    ),
    [
      "OGFI ERP Phase I / Phase 1.5 pilot readiness check",
      "Generated UTC: 20260701T010000Z",
      "Evidence run ID: pilot-run",
      "Database URL fingerprint: selftestdb",
      "Threshold snapshot: requireReleaseGatesReady=true",
      "DEC-0036 strict release gate status",
      ...strictSecurityReadinessMarkers.map((marker) => `PASS | ${marker}`),
      "",
      "RESULT | PASS | Pilot setup is ready for UAT execution evidence capture.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(
      mismatchedRunEvidenceRoot,
      "uat-status",
      "uat-status-20260701T020000Z.txt",
    ),
    [
      "OGFI ERP Phase I / Phase 1.5 UAT evidence status",
      "Generated UTC: 20260701T020000Z",
      "Evidence run ID: uat-run",
      "",
      "RESULT | PASS | UAT evidence pack has no unresolved execution placeholders.",
      "",
    ].join("\n"),
  );
  const mismatchedRunOutput = runNodeScript(
    "scripts/release-pilot-uat-status.mjs",
    {
      RELEASE_EVIDENCE_ROOT: mismatchedRunEvidenceRoot,
      RELEASE_UAT_EVIDENCE_FILE: selfTestUatFile,
    },
  );
  assert(
    mismatchedRunOutput.includes("BLOCKED | Pilot readiness / UAT evidence run"),
    "pilot/UAT status should block when pilot readiness and UAT status run IDs differ",
  );
  assert(
    readdirSync(join(evidenceRoot, "pilot-uat-status")).some((file) =>
      /^pilot-uat-status-.*\.txt$/.test(file),
    ),
    "pilot/UAT status artifact missing",
  );
  evidenceLines.push(
    "PASS | Pilot/UAT status reports missing pilot readiness and UAT completion evidence.",
  );
}

function testUatExecutionChecklist() {
  evidenceLines.push("CHECK | UAT execution checklist");
  const output = runNodeScript("scripts/release-uat-execution-checklist.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_UAT_EVIDENCE_FILE: selfTestUatFile,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 UAT execution checklist"),
    "UAT execution checklist header missing",
  );
  assert(
    output.includes("This checklist is advisory. It does not execute UAT"),
    "UAT execution checklist should state non-fabrication boundary",
  );
  assert(
    output.includes("FIELD | scope/session"),
    "UAT execution checklist should require scope/session fields",
  );
  assert(
    output.includes("legal name, user ID, and ERP role"),
    "UAT execution checklist should require named tester identity",
  );
  assert(
    output.includes("immutable artifact path plus screenshot/export checksum, audit ID, or source record ID"),
    "UAT execution checklist should require immutable evidence references",
  );
  assert(
    output.includes("FIELD | source-boundary checks"),
    "UAT execution checklist should require source-boundary proof",
  );
  assert(
    output.includes("FIELD | witness/reconciliation"),
    "UAT execution checklist should require witness/reconciliation checks",
  );
  assert(
    output.includes("COMMAND | DATABASE_URL=<pilot-or-staging-url> pnpm release:pilot-readiness"),
    "UAT execution checklist should include DB-backed pilot readiness command",
  );
  assert(
    output.includes(
      "COMMAND | DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness",
    ),
    "UAT execution checklist should include strict release-gate pilot readiness command",
  );
  assert(
    strictSecurityReadinessMarkers.every((marker) => output.includes(marker)),
    "UAT execution checklist should require strict pilot live security rows",
  );
  assert(
    output.includes("Latest UAT Status"),
    "UAT execution checklist should include latest UAT status snapshot",
  );
  assert(
    output.includes("Latest Pilot/UAT Status"),
    "UAT execution checklist should include latest Pilot/UAT status snapshot",
  );
  assert(
    output.includes("RESULT | ACTION REQUIRED | Execute real UAT"),
    "UAT execution checklist should remain action-required until real UAT is collected",
  );
  assert(
    readdirSync(join(evidenceRoot, "uat-checklist")).some((file) =>
      /^uat-execution-checklist-.*\.txt$/.test(file),
    ),
    "UAT execution checklist artifact missing",
  );
  evidenceLines.push(
    "PASS | UAT execution checklist gives owners scenario, evidence, waiver, signoff, and anti-fabrication steps.",
  );
}

function testPilotReadinessPreflight() {
  evidenceLines.push("CHECK | Pilot readiness preflight");
  const output = runNodeScript("scripts/pilot-readiness-preflight.mjs", {
    PILOT_READINESS_OUTPUT_DIR: join(evidenceRoot, "pilot-readiness"),
    DATABASE_URL: "postgres://self-test:secret@localhost:5432/ogfi_self_test",
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
  });
  writeFileSync(
    join(evidenceRoot, "pilot-readiness", "pilot-readiness-preflight-self-test-pass.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 pilot readiness preflight",
      "Evidence run ID: self-test-run",
      "Database URL fingerprint: selftestdb",
      "Threshold snapshot: PILOT_REQUIRE_RELEASE_GATES_READY=true",
      "PASS | DATABASE_URL configured",
      "PASS | psql available or PSQL_BIN configured",
      "PASS | pilot threshold overrides valid",
      "PASS | pilot boolean overrides valid",
      "RESULT | PASS | Pilot readiness prerequisites are configured.",
      "",
    ].join("\n"),
  );

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 pilot readiness preflight"),
    "pilot readiness preflight header missing",
  );
  assert(
    output.includes("Evidence run ID: self-test-run"),
    "pilot readiness preflight should include evidence run id",
  );
  assert(
    output.includes("Database URL fingerprint:"),
    "pilot readiness preflight should include redacted database fingerprint",
  );
  assert(
    !output.includes("self-test:secret"),
    "pilot readiness preflight must not print database credentials",
  );
  assert(
    output.includes("Threshold snapshot:"),
    "pilot readiness preflight should include threshold snapshot metadata",
  );
  evidenceLines.push(
    "PASS | Pilot readiness preflight captures run metadata without exposing credentials.",
  );
}

function testEnablementStatus() {
  evidenceLines.push("CHECK | Enablement status");
  const trainingFile = join(tempRoot, "training-impact-assessment.md");
  const hypercareFile = join(tempRoot, "hypercare-runbook.md");
  writeFileSync(
    trainingFile,
    [
      "# Self-Test Training Impact Assessment",
      "",
      "## Readiness Checklist",
      "",
      "- [x] Branch manager quick-start created.",
      "- [ ] Pilot training session scheduled and attendance recorded.",
      "",
      "## Training Execution Evidence",
      "",
      "| Audience | Session date/time | Trainer | Attendees / roles | Material covered | Known limits acknowledged | Open questions / follow-up owner | Evidence reference | Signoff by | Signoff date |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Branch managers | Pending | Pending | Pending | Quick-start | Pending | Pending | Pending | Pending | Pending |",
      "| Warehouse users | someday | Maria Santos | Storekeepers | Warehouse guide | Yes | Ops owner | release-evidence/training/warehouse.png | QA Lead | soon |",
      "",
      "## Known-Limit Acknowledgement Checklist",
      "",
    ].join("\n"),
  );
  writeFileSync(
    hypercareFile,
    [
      "# Self-Test Hypercare Runbook",
      "",
      "## 1. Required Pilot Roles",
      "",
      "| Role | Named owner | Backup | Decision scope | Contact route | Confirmed |",
      "| --- | --- | --- | --- | --- | --- |",
      "| Product Owner | Pending | Pending | GO / NO-GO | Pending | Pending |",
      "| Release Manager | Nico Valdez | Mara Santos | Rollback decision | Teams channel | Maybe |",
      "",
      "## 2. Defect Intake Rules",
      "",
      "## 5. Daily Hypercare Checklist",
      "",
      "| Area | Daily check | Evidence reference | Owner | Result |",
      "| --- | --- | --- | --- | --- |",
      "| Approvals | Open approvals review | Pending | QA Lead | Pending |",
      "| Inventory | Stock movement review | release-evidence/hypercare/inventory.png | QA Lead | Failed |",
      "",
      "## 6. User Confusion, Rush, Or Temporary Disruption SOP",
      "",
    ].join("\n"),
  );

  const output = runNodeScript("scripts/release-enablement-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_TRAINING_EVIDENCE_FILE: trainingFile,
    RELEASE_HYPERCARE_EVIDENCE_FILE: hypercareFile,
  });

  assert(
    output.includes(
      "RESULT | WARN | Enablement, training, and hypercare evidence is incomplete",
    ),
    "enablement status should warn when training and hypercare placeholders remain",
  );
  assert(
    output.includes("Evidence run ID: self-test-run"),
    "enablement status should include evidence run ID",
  );
  assert(
    output.includes("Incomplete Enablement Owner Summary"),
    "enablement status should include owner summary section",
  );
  assert(
    output.includes("Invalid Enablement Evidence Fields"),
    "enablement status should include field-level validation output",
  );
  assert(
    output.includes("field=Session date/time | reason=date_required"),
    "enablement status should reject weak training dates",
  );
  assert(
    output.includes("field=Confirmed | reason=confirmation_required"),
    "enablement status should reject vague role confirmations",
  );
  assert(
    output.includes("field=Result | reason=unsupported_or_unaccepted_result"),
    "enablement status should reject failed daily hypercare results before GO review",
  );
  assert(
    output.includes("WARN | Enablement Owner / Operations Owner | incomplete_items=1"),
    "enablement status should summarize incomplete training execution ownership",
  );
  assert(
    output.includes("WARN | Product Owner | incomplete_items=1"),
    "enablement status should summarize incomplete pilot role ownership",
  );
  assert(
    output.includes("WARN | QA Lead | incomplete_items=1"),
    "enablement status should summarize incomplete daily hypercare ownership",
  );
  assert(
    output.includes("Training Unresolved Token Sections"),
    "enablement status should include training unresolved token section summary",
  );
  assert(
    output.includes("Hypercare Unresolved Token Sections"),
    "enablement status should include hypercare unresolved token section summary",
  );
  assert(
    output.includes("WARN | Training Execution Evidence"),
    "enablement status should summarize training placeholders by section",
  );
  assert(
    readdirSync(join(evidenceRoot, "enablement-status")).some((file) =>
      /^enablement-status-.*\.txt$/.test(file),
    ),
    "enablement status artifact missing",
  );
  evidenceLines.push(
    "PASS | Enablement status reports incomplete training, owner, and daily hypercare placeholders.",
  );
}

function testEnablementChecklist() {
  evidenceLines.push("CHECK | Enablement evidence checklist");
  const output = runNodeScript("scripts/release-enablement-checklist.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 enablement evidence checklist"),
    "enablement checklist header missing",
  );
  assert(
    output.includes("Evidence run ID: self-test-run"),
    "enablement checklist should include evidence run ID",
  );
  assert(
    output.includes("FIELD | training scope"),
    "enablement checklist should require training scope fields",
  );
  assert(
    output.includes("FIELD | known limits"),
    "enablement checklist should require known-limit acknowledgement fields",
  );
  assert(
    output.includes("FIELD | hypercare roles"),
    "enablement checklist should require hypercare role fields",
  );
  assert(
    output.includes("FIELD | daily hypercare"),
    "enablement checklist should require daily hypercare evidence fields",
  );
  assert(
    output.includes("FIELD | defect / waiver"),
    "enablement checklist should require defect and waiver readiness fields",
  );
  assert(
    output.includes("FIELD | final integrity"),
    "enablement checklist should require final manifest integrity fields",
  );
  assert(
    output.includes("This checklist is advisory"),
    "enablement checklist should state advisory boundary",
  );
  assert(
    output.includes("Latest Enablement Status"),
    "enablement checklist should include latest enablement status snapshot",
  );
  assert(
    output.includes("SNAPSHOT | RESULT | WARN | Enablement, training, and hypercare evidence is incomplete"),
    "enablement checklist should include latest enablement status result as a snapshot",
  );
  assert(
    output.includes("Latest Signed Evidence Status"),
    "enablement checklist should include latest signed evidence status section",
  );
  assert(
    output.includes("RESULT | ACTION REQUIRED | Collect real training attendance"),
    "enablement checklist should end with one action-required owner handoff",
  );
  assert(
    readdirSync(join(evidenceRoot, "enablement-checklist")).some((file) =>
      /^enablement-checklist-.*\.txt$/.test(file),
    ),
    "enablement checklist artifact missing",
  );
  evidenceLines.push(
    "PASS | Enablement checklist defines owner evidence requirements without fabricating proof.",
  );
}

function testMilestoneReport() {
  evidenceLines.push("CHECK | Milestone report");
  const output = runNodeScript("scripts/release-milestone-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 milestone status"),
    "milestone report header missing",
  );
  assert(
    output.includes("Data snapshot and migration safety evidence"),
    "milestone report should include data-snapshot evidence status",
  );
  assert(
    output.includes("data-snapshot-checklist"),
    "milestone report should include data snapshot checklist gate",
  );
  assert(
    output.includes("PENDING OWNER SUMMARY"),
    "milestone report should include a pending owner summary",
  );
  assert(
    output.includes("document signed UAT evidence pack"),
    "milestone report should include signed UAT evidence document gate",
  );
  assert(
    output.includes("document signed deployment and rollback evidence"),
    "milestone report should include signed deployment evidence document gate",
  );
  assert(
    output.includes("document signed training impact assessment"),
    "milestone report should include signed training evidence document gate",
  );
  assert(
    output.includes("rehearsal-command-plan"),
    "milestone report should include rehearsal command plan gate",
  );
  assert(
    output.includes("interim-review"),
    "milestone report should include interim review gate",
  );
  assert(
    output.includes("release-status-suite-strict"),
    "milestone report should include strict status suite gate",
  );
  assert(
    output.includes("release-session-lock"),
    "milestone report should include release metadata session lock gate",
  );
  assert(
    output.includes("recovery-evidence-checklist"),
    "milestone report should include recovery checklist gate",
  );
  assert(
    output.includes("deployment-evidence-checklist"),
    "milestone report should include deployment checklist gate",
  );
  assert(
    output.includes("uat-execution-checklist"),
    "milestone report should include UAT execution checklist gate",
  );
  assert(
    output.includes("enablement-checklist"),
    "milestone report should include enablement checklist gate",
  );
  assert(
    output.includes("signed-evidence-checklist"),
    "milestone report should include signed evidence checklist gate",
  );
  assert(
    output.includes("artifact external-security/^mfa-provider-enrollment-and-runtime-proof\\..+$") &&
      output.includes("artifact external-security/^idp-session-invalidation-proof\\..+$") &&
      output.includes("artifact external-security/^vault-or-artifact-storage-index\\..+$") &&
      output.includes("artifact external-security/^break-glass-review-and-revocation-proof\\..+$"),
    "milestone report should include all external-security proof artifact gates",
  );
  assert(
    output.includes(
      "release metadata, signed evidence documents, external-security proof references, fresh manifest, and final GO / NO-GO review",
    ) &&
      output.includes(
        "NEXT | Complete pending environment artifacts, signed documents, external-security proof references, UAT evidence, training evidence, and rollback proof before GO review.",
      ),
    "milestone report should include external-security proof references in owner guidance and next action",
  );
  assert(
    readdirSync(join(evidenceRoot, "milestones")).some((file) =>
      /^milestone-status-.*\.txt$/.test(file),
    ),
    "milestone report artifact missing",
  );
  evidenceLines.push(
    "PASS | Milestone report shows pending external evidence gates.",
  );
}

function testMilestoneReportRequiresAllArtifactMarkers() {
  evidenceLines.push("CHECK | Milestone report multi-marker artifact gates");
  const markerRoot = join(tempRoot, "milestone-marker-evidence");
  const statusDirectory = join(markerRoot, "data-snapshot-status");
  const dataSnapshotDirectory = join(markerRoot, "data-snapshots");
  const backupsDirectory = join(markerRoot, "backups");
  const pilotReadinessDirectory = join(markerRoot, "pilot-readiness");
  const deploymentStatusDirectory = join(markerRoot, "deployment-status");
  const uatStatusDirectory = join(markerRoot, "uat-status");
  const enablementStatusDirectory = join(markerRoot, "enablement-status");
  const signedEvidenceStatusDirectory = join(markerRoot, "signed-evidence-status");
  const externalSecurityDirectory = join(markerRoot, "external-security");
  const registerDirectory = join(markerRoot, "release-readiness-register");
  const smokeDirectory = join(markerRoot, "smoke");
  const rollbackDirectory = join(markerRoot, "staging-rollback");
  const rollbackSmokeDirectory = join(rollbackDirectory, "smoke");
  mkdirSync(statusDirectory, { recursive: true });
  mkdirSync(dataSnapshotDirectory, { recursive: true });
  mkdirSync(backupsDirectory, { recursive: true });
  mkdirSync(pilotReadinessDirectory, { recursive: true });
  mkdirSync(deploymentStatusDirectory, { recursive: true });
  mkdirSync(uatStatusDirectory, { recursive: true });
  mkdirSync(enablementStatusDirectory, { recursive: true });
  mkdirSync(signedEvidenceStatusDirectory, { recursive: true });
  mkdirSync(externalSecurityDirectory, { recursive: true });
  mkdirSync(registerDirectory, { recursive: true });
  mkdirSync(smokeDirectory, { recursive: true });
  mkdirSync(rollbackDirectory, { recursive: true });
  mkdirSync(rollbackSmokeDirectory, { recursive: true });
  writeFileSync(
    join(statusDirectory, "data-snapshot-status-partial.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 data snapshot readiness status",
      "RESULT | PASS | Data snapshot rehearsal evidence is present",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dataSnapshotDirectory, "data-snapshot-preflight-warn.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 data snapshot preflight",
      "RESULT | WARN | Data snapshot prerequisites need owner review.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dataSnapshotDirectory, "data-pre-migration-rehearsal-partial.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 data snapshot",
      "RESULT | PASS | Data snapshot captured",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dataSnapshotDirectory, "data-post-migration-rehearsal-partial.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 data snapshot",
      "RESULT | PASS | Data snapshot captured",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dataSnapshotDirectory, "data-snapshot-delta-partial.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 data snapshot delta",
      "RESULT | PASS | Snapshot delta captured",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(backupsDirectory, "backup-restore-preflight-warn.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 backup and restore preflight",
      "RESULT | WARN | Backup and restore prerequisites need owner review.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(backupsDirectory, "backup-summary.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 backup summary",
      "backup_checksum_status=present",
      "RESULT | PASS | Backup summary captured.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(backupsDirectory, "restore-check-summary.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 restore-check summary",
      "RESULT | PASS | Restore-check summary captured.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(rollbackDirectory, "rollback-summary.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 staging rollback summary",
      "RESULT | PASS | Staging rollback summary captured.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(smokeDirectory, "smoke-partial.txt"),
    [
      "OGFI ERP smoke evidence",
      "api-health /api/health expected=200 actual=200",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(rollbackSmokeDirectory, "smoke-partial.txt"),
    [
      "OGFI ERP smoke evidence",
      "api-health /api/health expected=200 actual=200",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(pilotReadinessDirectory, "pilot-readiness-preflight-warn.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 pilot readiness preflight",
      "RESULT | WARN | Pilot readiness prerequisites need owner review.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(pilotReadinessDirectory, "pilot-readiness-partial.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 pilot readiness",
      "RESULT | PASS | Pilot setup is ready for UAT execution evidence capture.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(deploymentStatusDirectory, "deployment-status-partial.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 deployment readiness status",
      "RESULT | PASS |",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(uatStatusDirectory, "uat-status-partial.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 UAT evidence status",
      "RESULT | PASS |",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(enablementStatusDirectory, "enablement-status-partial.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 enablement and hypercare status",
      "RESULT | PASS |",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(signedEvidenceStatusDirectory, "signed-evidence-status-partial.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 signed evidence status",
      "RESULT | PASS |",
      "",
    ].join("\n"),
  );
  for (const fileName of [
    "mfa-provider-enrollment-and-runtime-proof.partial",
    "idp-session-invalidation-proof.partial",
    "vault-or-artifact-storage-index.partial",
    "break-glass-review-and-revocation-proof.partial",
  ]) {
    writeFileSync(
      join(externalSecurityDirectory, fileName),
      [
        "External security proof",
        "Evidence run ID: self-test",
        "",
      ].join("\n"),
    );
  }
  writeFileSync(
    join(markerRoot, "release-summary.txt"),
    [
      "OGFI ERP Phase I / Phase 1.5 release candidate summary",
      "RESULT | PASS | Release candidate summary captured.",
      "",
    ].join("\n"),
  );
  const registerExportFile = join(
    registerDirectory,
    "release-readiness-register-self-test.csv",
  );
  writeFileSync(
    registerExportFile,
    [
      "Evidence run ID,self-test",
      "Source Decision,DEC-0036",
      "RESULT,PASS,Release readiness register export captured.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    `${registerExportFile}.sha256`,
    "0000000000000000000000000000000000000000000000000000000000000000  release-readiness-register-self-test.csv\n",
  );

  const output = runNodeScript("scripts/release-milestone-status.mjs", {
    RELEASE_EVIDENCE_ROOT: markerRoot,
  });

  assert(
    output.includes(
      "PENDING | artifact data-snapshot-status/^data-snapshot-status-.*\\.txt$ | matching artifact found but required marker missing in data-snapshot-status-partial.txt",
    ),
    "milestone report must require every marker for multi-marker artifact gates",
  );
  assert(
    output.includes(
      "PENDING | artifact data-snapshots/^data-snapshot-preflight-.*\\.txt$ | matching artifact found but required marker missing in data-snapshot-preflight-warn.txt",
    ),
    "milestone report must require PASS data snapshot preflight evidence",
  );
  assert(
    output.includes(
      "PENDING | artifact data-snapshots/^data-pre-migration-rehearsal-.*\\.txt$ | matching artifact found but required marker missing in data-pre-migration-rehearsal-partial.txt",
    ),
    "milestone report must require pre-migration snapshot metadata markers",
  );
  assert(
    output.includes(
      "PENDING | artifact data-snapshots/^data-post-migration-rehearsal-.*\\.txt$ | matching artifact found but required marker missing in data-post-migration-rehearsal-partial.txt",
    ),
    "milestone report must require post-migration snapshot metadata markers",
  );
  assert(
    output.includes(
      "PENDING | artifact data-snapshots/^data-snapshot-delta-.*\\.txt$ | matching artifact found but required marker missing in data-snapshot-delta-partial.txt",
    ),
    "milestone report must require snapshot delta metadata markers",
  );
  assert(
    output.includes(
      "PENDING | artifact backups/^backup-restore-preflight-.*\\.txt$ | matching artifact found but required marker missing in backup-restore-preflight-warn.txt",
    ),
    "milestone report must require PASS backup/restore preflight evidence",
  );
  assert(
    output.includes(
      "PENDING | artifact pilot-readiness/^pilot-readiness-preflight-.*\\.txt$ | matching artifact found but required marker missing in pilot-readiness-preflight-warn.txt",
    ),
    "milestone report must require PASS pilot readiness preflight evidence",
  );
  assert(
    output.includes(
      "PENDING | artifact pilot-readiness/^pilot-readiness-(?!preflight).*\\.txt$ | matching artifact found but required marker missing in pilot-readiness-partial.txt",
    ),
    "milestone report must require pilot readiness report metadata markers",
  );
  assert(
    output.includes(
      "PENDING | artifact smoke/^smoke-.*\\.txt$ | matching artifact found but required marker missing in smoke-partial.txt",
    ),
    "milestone report must require all local smoke evidence markers",
  );
  assert(
    output.includes(
      "PENDING | artifact staging-rollback/smoke/^smoke-.*\\.txt$ | matching artifact found but required marker missing in smoke-partial.txt",
    ),
    "milestone report must require post-rollback smoke evidence markers",
  );
  assert(
    output.includes(
      "PENDING | artifact deployment-status/^deployment-status-.*\\.txt$ | matching artifact found but required marker missing in deployment-status-partial.txt",
    ),
    "milestone report must require explicit deployment status evidence markers",
  );
  assert(
    output.includes(
      "PENDING | artifact uat-status/^uat-status-.*\\.txt$ | matching artifact found but required marker missing in uat-status-partial.txt",
    ),
    "milestone report must require explicit UAT status evidence markers",
  );
  assert(
    output.includes(
      "PENDING | artifact enablement-status/^enablement-status-.*\\.txt$ | matching artifact found but required marker missing in enablement-status-partial.txt",
    ),
    "milestone report must require explicit enablement status evidence markers",
  );
  assert(
    output.includes(
      "PENDING | artifact signed-evidence-status/^signed-evidence-status-.*\\.txt$ | matching artifact found but required marker missing in signed-evidence-status-partial.txt",
    ),
    "milestone report must require explicit signed evidence status marker",
  );
  assert(
    output.includes(
      "PENDING | artifact external-security/^mfa-provider-enrollment-and-runtime-proof\\..+$ | matching artifact found but required marker missing in mfa-provider-enrollment-and-runtime-proof.partial",
    ),
    "milestone report must require external MFA proof PASS marker",
  );
  assert(
    output.includes(
      "PENDING | artifact external-security/^idp-session-invalidation-proof\\..+$ | matching artifact found but required marker missing in idp-session-invalidation-proof.partial",
    ),
    "milestone report must require external IdP session proof PASS marker",
  );
  assert(
    output.includes(
      "PENDING | artifact external-security/^vault-or-artifact-storage-index\\..+$ | matching artifact found but required marker missing in vault-or-artifact-storage-index.partial",
    ),
    "milestone report must require external evidence storage proof PASS marker",
  );
  assert(
    output.includes(
      "PENDING | artifact external-security/^break-glass-review-and-revocation-proof\\..+$ | matching artifact found but required marker missing in break-glass-review-and-revocation-proof.partial",
    ),
    "milestone report must require external break-glass proof PASS marker",
  );
  assert(
    output.includes(
      "PENDING | artifact backups/^backup-summary\\.txt$ | matching artifact found but required marker missing in backup-summary.txt",
    ),
    "milestone report must require backup summary metadata markers",
  );
  assert(
    output.includes(
      "PENDING | artifact backups/^restore-check-summary\\.txt$ | matching artifact found but required marker missing in restore-check-summary.txt",
    ),
    "milestone report must require restore-check summary metadata markers",
  );
  assert(
    output.includes(
      "PENDING | artifact staging-rollback/^rollback-summary\\.txt$ | matching artifact found but required marker missing in rollback-summary.txt",
    ),
    "milestone report must require rollback summary metadata markers",
  );
  assert(
    output.includes(
      "PENDING | artifact ./^release-summary\\.txt$ | matching artifact found but required marker missing in release-summary.txt",
    ),
    "milestone report must require release summary metadata markers",
  );
  assert(
    output.includes(
      "PENDING | artifact checksum release-readiness-register/^release-readiness-register-.*\\.csv$ | latest matching artifact release-readiness-register-self-test.csv failed checksum verification",
    ),
    "milestone report must flag readiness-register checksum mismatches",
  );
  evidenceLines.push(
    "PASS | Milestone report rejects partial multi-marker and WARN-only preflight artifacts.",
  );
}

function testPendingEvidenceChecklist() {
  evidenceLines.push("CHECK | Pending evidence checklist");
  const output = runNodeScript("scripts/release-pending-evidence-checklist.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes(
      "OGFI ERP Phase I / Phase 1.5 pending evidence checklist",
    ),
    "pending evidence checklist header missing",
  );
  assert(
    output.includes("GATE | Data snapshot and migration safety evidence"),
    "pending evidence checklist should include data snapshot gate",
  );
  assert(
    output.includes("GATE | External identity and evidence storage proof") &&
      output.includes("OWNER | severity=Critical | owner=Security Owner / IT Owner"),
    "pending evidence checklist should include external security evidence gate",
  );
  assert(
    output.includes("external-security/mfa-provider-enrollment-and-runtime-proof.*") &&
      output.includes("external-security/idp-session-invalidation-proof.*") &&
      output.includes("external-security/vault-or-artifact-storage-index.*"),
    "pending evidence checklist should include external security evidence artifacts",
  );
  assert(
    output.includes("Copy approved external-security proof references") &&
      output.includes("source evidence, signed documents, and external-security proof references are present") &&
      output.includes("signed documents and external-security proof references are present"),
    "pending evidence checklist should include external-security proof references in final collection steps",
  );
  assert(
    output.includes("OWNER | severity=Critical"),
    "pending evidence checklist should include owner/severity lines",
  );
  assert(
    output.includes("STEPS"),
    "pending evidence checklist should include ordered execution steps",
  );
  assert(
    output.includes("EVIDENCE SESSION"),
    "pending evidence checklist should include evidence session guidance",
  );
  assert(
    output.includes("Set and reuse one RELEASE_EVIDENCE_RUN_ID"),
    "pending evidence checklist should tell owners to reuse one evidence run ID",
  );
  assert(
    output.includes("Run pnpm release:external-evidence before assigning external owners"),
    "pending evidence checklist should require the external evidence guide before owner assignment",
  );
  assert(
    output.includes("pnpm release:external-evidence"),
    "pending evidence checklist should include external evidence guide command",
  );
  assert(
    output.includes("pnpm release:rehearsal-plan"),
    "pending evidence checklist should include rehearsal command plan command",
  );
  assert(
    output.includes("DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register"),
    "pending evidence checklist should include release readiness register export command",
  );
  assert(
    strictSecurityReadinessMarkers.every((marker) => output.includes(marker)) &&
      output.includes("live security rows at zero"),
    "pending evidence checklist should require strict pilot live security rows",
  );
  assert(
    output.includes("pnpm release:recovery-checklist"),
    "pending evidence checklist should include recovery checklist command",
  );
  assert(
    output.includes("pnpm release:deployment-checklist"),
    "pending evidence checklist should include deployment checklist command",
  );
  assert(
    output.includes("pnpm release:deployment-status"),
    "pending evidence checklist should include deployment status command",
  );
  assert(
    output.includes("pnpm release:data-snapshot-checklist"),
    "pending evidence checklist should include data snapshot checklist command",
  );
  assert(
    output.includes("pnpm release:uat-checklist"),
    "pending evidence checklist should include UAT execution checklist command",
  );
  assert(
    output.includes("pnpm release:enablement-checklist"),
    "pending evidence checklist should include enablement checklist command",
  );
  assert(
    output.includes("pnpm release:metadata-env-template"),
    "pending evidence checklist should include metadata environment template command",
  );
  assert(
    output.includes("pnpm release:metadata-session-lock"),
    "pending evidence checklist should include metadata session lock command",
  );
  assert(
    output.includes("pnpm release:signed-evidence-templates"),
    "pending evidence checklist should include signed evidence template command",
  );
  assert(
    output.includes("pnpm release:signed-evidence-checklist"),
    "pending evidence checklist should include signed evidence checklist command",
  );
  assert(
    output.includes("external-evidence-guide/external-evidence-guide-*.txt"),
    "pending evidence checklist should include external evidence guide artifact",
  );
  assert(
    output.includes("rehearsal-command-plan/rehearsal-command-plan-*.txt"),
    "pending evidence checklist should include rehearsal command plan artifact",
  );
  assert(
    output.includes("release-readiness-register/release-readiness-register-*.csv"),
    "pending evidence checklist should include release readiness register export artifact",
  );
  assert(
    output.includes("release-readiness-register/release-readiness-register-*.csv.sha256"),
    "pending evidence checklist should include release readiness register checksum artifact",
  );
  assert(
    output.includes("recovery-checklist/recovery-evidence-checklist-*.txt"),
    "pending evidence checklist should include recovery checklist artifact",
  );
  assert(
    output.includes("deployment-checklist/deployment-evidence-checklist-*.txt"),
    "pending evidence checklist should include deployment checklist artifact",
  );
  assert(
    output.includes("deployment-status/deployment-status-*.txt"),
    "pending evidence checklist should include deployment status artifact",
  );
  assert(
    output.includes("data-snapshot-checklist/data-snapshot-checklist-*.txt"),
    "pending evidence checklist should include data snapshot checklist artifact",
  );
  assert(
    output.includes("data-snapshots/data-snapshot-preflight-*.txt"),
    "pending evidence checklist should include data snapshot preflight artifact",
  );
  assert(
    output.includes("data-snapshot-status/data-snapshot-status-*.txt"),
    "pending evidence checklist should include data snapshot status artifact",
  );
  assert(
    output.includes("backups/backup-restore-preflight-*.txt"),
    "pending evidence checklist should include backup/restore preflight artifact",
  );
  assert(
    output.includes("backup-restore-status/backup-restore-status-*.txt"),
    "pending evidence checklist should include backup/restore status artifact",
  );
  assert(
    output.includes("pilot-readiness/pilot-readiness-preflight-*.txt"),
    "pending evidence checklist should include pilot readiness preflight artifact",
  );
  assert(
    output.includes("pilot-uat-status/pilot-uat-status-*.txt"),
    "pending evidence checklist should include pilot/UAT status artifact",
  );
  assert(
    output.includes("uat-checklist/uat-execution-checklist-*.txt"),
    "pending evidence checklist should include UAT execution checklist artifact",
  );
  assert(
    output.includes("enablement-checklist/enablement-checklist-*.txt"),
    "pending evidence checklist should include enablement checklist artifact",
  );
  assert(
    output.includes("release-metadata/release-env-template-*.txt"),
    "pending evidence checklist should include metadata environment template artifact",
  );
  assert(
    output.includes("release-metadata/release-session-lock-*.txt"),
    "pending evidence checklist should include metadata session lock artifact",
  );
  assert(
    output.includes("signed-document-templates/*-template.md"),
    "pending evidence checklist should include signed evidence template artifact",
  );
  assert(
    output.includes("signed-evidence-checklist/signed-evidence-checklist-*.txt"),
    "pending evidence checklist should include signed evidence checklist artifact",
  );
  assert(
    output.includes("signed-evidence-status/signed-evidence-status-*.txt"),
    "pending evidence checklist should include signed evidence status artifact",
  );
  assert(
    output.includes("release-metadata/release-metadata-worksheet-*.txt"),
    "pending evidence checklist should include release metadata worksheet artifact",
  );
  assert(
    output.includes("pnpm release:backup-summary"),
    "pending evidence checklist should include backup summary generation",
  );
  assert(
    output.includes(`SMOKE_OUTPUT_DIR=${evidenceRoot}/staging-rollback/smoke pnpm release:smoke`),
    "pending evidence checklist should include post-rollback smoke command",
  );
  assert(
    output.includes(`${evidenceRoot}/signed-documents/training-impact-assessment.md`),
    "pending evidence checklist should use the configured evidence root for signed training evidence",
  );
  assert(
    output.includes("Run pnpm release:evidence:manifest after all final evidence files") &&
      output.includes("passing focused status reports are present") &&
      output.includes("retain the matching .sha256 sidecar"),
    "pending evidence checklist should include final manifest and checksum sequencing",
  );
  assert(
    output.includes("Run pnpm release:status-suite:strict as the CI-style readiness gate"),
    "pending evidence checklist should include strict final readiness gate",
  );
  assertCommandOrder(output, [
    "- pnpm release:evidence:manifest",
    "- pnpm release:final-review-status",
    "- pnpm release:go-no-go",
    "- pnpm release:status-suite:strict",
  ]);
  assert(
    output.includes("passing focused status reports are present"),
    "pending evidence checklist should require focused status reports before final manifest",
  );
  assert(
    output.includes("LATEST STATUS"),
    "pending evidence checklist should include latest focused status lines",
  );
  assert(
    output.includes("Data snapshot status: data-snapshot-status/"),
    "pending evidence checklist should surface latest focused status artifacts",
  );
  assert(
    readdirSync(join(evidenceRoot, "pending-evidence-checklist")).some((file) =>
      /^pending-evidence-checklist-.*\.txt$/.test(file),
    ),
    "pending evidence checklist artifact missing",
  );
  evidenceLines.push(
    "PASS | Pending evidence checklist consolidates owner-ready external evidence steps.",
  );
}

function testReleaseMetadataWorksheet() {
  evidenceLines.push("CHECK | Release metadata worksheet");
  const output = runNodeScript("scripts/release-metadata-worksheet.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 release metadata worksheet"),
    "release metadata worksheet header missing",
  );
  assert(
    output.includes("SUGGESTED_RELEASE_VERSION="),
    "release metadata worksheet should include suggested release version line",
  );
  assert(
    output.includes("RELEASE_EVIDENCE_RUN_ID=<set one shared release evidence session id>"),
    "release metadata worksheet should include evidence run id guidance",
  );
  assert(
    output.includes("Validation Rules"),
    "release metadata worksheet should include validation rules",
  );
  assert(
    output.includes("GITHUB_SHA must be a 7 to 40 character hexadecimal commit SHA."),
    "release metadata worksheet should describe GitHub SHA validation",
  );
  assert(
    output.includes("Command Template"),
    "release metadata worksheet should include command templates",
  );
  assert(
    output.includes(
      "DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness",
    ),
    "release metadata worksheet should include strict pilot readiness command",
  );
  assert(
    output.includes(".env.release.local") &&
      output.includes("LOCAL_ENV_FILES=.env.release.local") &&
      output.includes("Never store secrets"),
    "release metadata worksheet should include local env file handoff with no-secret boundary",
  );
  assert(
    output.includes("RESULT | ACTION REQUIRED |"),
    "release metadata worksheet should require owner action when metadata is missing",
  );
  assert(
    readdirSync(join(evidenceRoot, "release-metadata")).some((file) =>
      /^release-metadata-worksheet-.*\.txt$/.test(file),
    ),
    "release metadata worksheet artifact missing",
  );
  evidenceLines.push(
    "PASS | Release metadata worksheet captures owner-provided metadata gaps without generating release summary.",
  );
}

function testReleaseMetadataEnvTemplate() {
  evidenceLines.push("CHECK | Release metadata environment template");
  const output = runNodeScript("scripts/release-metadata-env-template.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes(
      "OGFI ERP Phase I / Phase 1.5 release metadata environment template",
    ),
    "release metadata environment template header missing",
  );
  assert(
    output.includes("This template is advisory."),
    "release metadata environment template should state advisory boundary",
  );
  assert(
    output.includes("PowerShell"),
    "release metadata environment template should include PowerShell block",
  );
  assert(
    output.includes("cmd.exe"),
    "release metadata environment template should include cmd.exe block",
  );
  assert(
    output.includes("POSIX shell"),
    "release metadata environment template should include POSIX shell block",
  );
  assert(
    output.includes("RELEASE_EVIDENCE_RUN_ID"),
    "release metadata environment template should include evidence run ID variable",
  );
  assert(
    output.includes(".env.release.local") &&
      output.includes("LOCAL_ENV_FILES=.env.release.local") &&
      output.includes("Do not store secrets"),
    "release metadata environment template should include local env file handoff with no-secret boundary",
  );
  assert(
    output.includes("pnpm release:summary-preflight"),
    "release metadata environment template should include summary preflight command",
  );
  assert(
    output.includes("RESULT | ACTION REQUIRED |"),
    "release metadata environment template should require owner action when metadata is missing",
  );
  assert(
    readdirSync(join(evidenceRoot, "release-metadata")).some((file) =>
      /^release-env-template-.*\.txt$/.test(file),
    ),
    "release metadata environment template artifact missing",
  );

  const configuredOutput = runNodeScript("scripts/release-metadata-env-template.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_VERSION: "v0.1.0-rc.1",
    GITHUB_RUN_ID: "self-test-gh-run",
    GITHUB_SHA: "1234567890abcdef",
  });
  assert(
    configuredOutput.includes(
      "RESULT | READY | Release metadata environment template generated from configured metadata.",
    ),
    "release metadata environment template should be ready when required metadata is configured",
  );
  evidenceLines.push(
    "PASS | Release metadata environment template creates a reusable non-secret evidence-session handoff.",
  );
}

function testReleaseMetadataSessionLock() {
  evidenceLines.push("CHECK | Release metadata session lock");
  const output = runNodeScript("scripts/release-metadata-session-lock.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 release metadata session lock"),
    "release metadata session lock header missing",
  );
  assert(
    output.includes("This artifact is an owner handoff"),
    "release metadata session lock should state handoff boundary",
  );
  assert(
    output.includes("RESULT | ACTION REQUIRED |"),
    "release metadata session lock should require owner action when metadata is missing",
  );
  assert(
    output.includes("Use the same RELEASE_EVIDENCE_RUN_ID"),
    "release metadata session lock should require one evidence run ID",
  );
  assert(
    output.includes("Final Evidence Session Commands"),
    "release metadata session lock should include final evidence session commands",
  );
  assert(
    output.includes(".env.release.local Handoff") &&
      output.includes("LOCAL_ENV_FILES=.env.release.local") &&
      output.includes("Do not store secrets"),
    "release metadata session lock should include local env file handoff with no-secret boundary",
  );
  assert(
    output.includes(
      "DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness",
    ),
    "release metadata session lock should include strict pilot readiness command",
  );
  assert(
    output.includes("DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register"),
    "release metadata session lock should include release readiness register export command",
  );
  assert(
    output.includes("requireReleaseGatesReady=true") &&
      output.includes("DEC-0036 strict release gate status"),
    "release metadata session lock should name strict pilot readiness markers",
  );

  const configuredOutput = runNodeScript("scripts/release-metadata-session-lock.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_VERSION: "self-test",
    GITHUB_RUN_ID: "self-test-run",
    GITHUB_SHA: "1234567890abcdef",
    DEPLOY_TO_STAGING: "false",
    RELEASE_ENVIRONMENT: "self-test",
    RELEASE_MIGRATION_MODE: "prisma-deploy",
  });

  assert(
    configuredOutput.includes("RESULT | READY | Release evidence session metadata is locked"),
    "release metadata session lock should be ready when approved metadata is configured",
  );
  assert(
    configuredOutput.includes("RELEASE_EVIDENCE_RUN_ID=self-test-run"),
    "release metadata session lock should preserve configured evidence run ID",
  );
  assert(
    readdirSync(join(evidenceRoot, "release-metadata")).some((file) =>
      /^release-session-lock-.*\.txt$/.test(file),
    ),
    "release metadata session lock artifact missing",
  );
  evidenceLines.push(
    "PASS | Release metadata session lock preserves one approved evidence session without approving release.",
  );
}

function testEvidenceRunConsistencyContract() {
  evidenceLines.push("CHECK | Evidence run consistency contract");
  const consistencyRoot = join(tempRoot, "evidence-run-consistency-empty");
  mkdirSync(consistencyRoot, { recursive: true });

  const result = evaluateEvidenceRunConsistency(consistencyRoot);
  assert(!result.pass, "evidence run consistency should fail when required evidence is absent");
  for (const label of [
    "Release summary preflight",
    "Data snapshot preflight",
    "Backup/restore preflight",
    "Release readiness register export",
    "External MFA provider proof",
    "External IdP session invalidation proof",
    "External evidence storage index",
    "External break-glass review proof",
    "Pilot readiness preflight",
  ]) {
    assert(
      result.detail.includes(label),
      `evidence run consistency should require ${label}`,
    );
  }

  evidenceLines.push(
    "PASS | Evidence run consistency requires final preflight artifacts in the shared evidence session.",
  );

  const completeRoot = join(tempRoot, "evidence-run-consistency-complete");
  writeEvidenceRunConsistencyArtifacts(completeRoot, "self-test-run");
  const completeResult = evaluateEvidenceRunConsistency(completeRoot, {
    expectedEvidenceRunId: "self-test-run",
  });
  assert(
    completeResult.pass,
    `evidence run consistency should pass when all required artifacts share the approved run ID: ${completeResult.detail}`,
  );

  const metadataFile = join(tempRoot, "evidence-run-consistency.env");
  writeFileSync(
    metadataFile,
    ["RELEASE_EVIDENCE_RUN_ID=self-test-run", ""].join("\n"),
  );
  const localEnvResult = withTemporaryEnv(
    { LOCAL_ENV_FILES: metadataFile },
    () => evaluateEvidenceRunConsistency(completeRoot),
  );
  assert(
    localEnvResult.pass,
    "evidence run consistency should load expected run ID from LOCAL_ENV_FILES",
  );

  const checksumMismatchRoot = join(tempRoot, "evidence-run-consistency-checksum-mismatch");
  writeEvidenceRunConsistencyArtifacts(checksumMismatchRoot, "self-test-run");
  writeFileSync(
    join(
      checksumMismatchRoot,
      "release-readiness-register",
      "release-readiness-register-self-test.csv.sha256",
    ),
    "0000000000000000000000000000000000000000000000000000000000000000  release-readiness-register-self-test.csv\n",
  );
  const checksumMismatchResult = evaluateEvidenceRunConsistency(checksumMismatchRoot, {
    expectedEvidenceRunId: "self-test-run",
  });
  assert(
    !checksumMismatchResult.pass &&
      checksumMismatchResult.detail.includes("Release readiness register export") &&
      checksumMismatchResult.detail.includes("checksum sidecar"),
    "evidence run consistency should reject readiness-register exports with mismatched checksum sidecars",
  );

  const placeholderRoot = join(tempRoot, "evidence-run-consistency-placeholder");
  writeEvidenceRunConsistencyArtifacts(placeholderRoot, "self-test-run");
  writeFileSync(
    join(placeholderRoot, "uat-status", "uat-status-self-test.txt"),
    "Evidence run ID: <set-approved-evidence-run-id>\n",
  );
  const placeholderResult = evaluateEvidenceRunConsistency(placeholderRoot, {
    expectedEvidenceRunId: "self-test-run",
  });
  assert(
    !placeholderResult.pass &&
      placeholderResult.detail.includes("placeholder evidence run ID"),
    "evidence run consistency should fail when any artifact uses a placeholder run ID",
  );

  const setupOnlyPilotRoot = join(tempRoot, "evidence-run-consistency-setup-only-pilot");
  writeEvidenceRunConsistencyArtifacts(setupOnlyPilotRoot, "self-test-run");
  writeFileSync(
    join(setupOnlyPilotRoot, "pilot-readiness", "pilot-readiness-self-test.txt"),
    "Evidence run ID: self-test-run\n",
  );
  const setupOnlyPilotResult = evaluateEvidenceRunConsistency(setupOnlyPilotRoot, {
    expectedEvidenceRunId: "self-test-run",
  });
  assert(
    !setupOnlyPilotResult.pass &&
      setupOnlyPilotResult.detail.includes("missing required evidence marker") &&
      setupOnlyPilotResult.detail.includes("requireReleaseGatesReady=true"),
    "evidence run consistency should reject setup-only pilot readiness artifacts during final review",
  );

  const mismatchResult = evaluateEvidenceRunConsistency(completeRoot, {
    expectedEvidenceRunId: "other-approved-run",
  });
  assert(
    !mismatchResult.pass &&
      mismatchResult.detail.includes("does not match collected evidence"),
    "evidence run consistency should fail when artifacts do not match configured RELEASE_EVIDENCE_RUN_ID",
  );

  evidenceLines.push(
    "PASS | Evidence run consistency rejects placeholder or mismatched evidence session IDs.",
  );
}

function writeEvidenceRunConsistencyArtifacts(root, evidenceRunId) {
  for (const directory of [
    ".",
    "data-snapshots",
    "migration-review",
    "predecessor-baseline",
    "migration-execution",
    "schema-drift",
    "data-invariants",
    "data-equivalence",
    "backups",
    "staging-rollback",
    "deployment-status",
    "release-readiness-register",
    "external-security",
    "pilot-readiness",
    "uat-status",
    "enablement-status",
    "signed-evidence-status",
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
  }

  writeFileSync(
    join(root, "release-summary-preflight-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "release-summary.txt"),
    `evidence_run_id=${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "data-snapshots", "data-snapshot-preflight-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "data-snapshots", "data-pre-migration-rehearsal-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "data-snapshots", "data-post-migration-rehearsal-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "data-snapshots", "data-snapshot-delta-self-test.txt"),
    `Before evidence run ID: ${evidenceRunId}\nAfter evidence run ID: ${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "migration-review", "migration-review-self-test.json"),
    JSON.stringify(
      { releaseEvidenceRunId: evidenceRunId, requireApproved: true },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, "predecessor-baseline", "predecessor-baseline-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\nRESULT | PASS | Populated predecessor baseline captured.\n`,
  );
  writeFileSync(
    join(root, "migration-execution", "first-deploy.txt"),
    `Evidence run ID: ${evidenceRunId}\nRESULT | PASS | Reviewed candidate migrations applied.\n`,
  );
  writeFileSync(
    join(root, "migration-execution", "second-deploy.txt"),
    `Evidence run ID: ${evidenceRunId}\nRESULT | PASS | Idempotent migration deployment verified.\n`,
  );
  writeFileSync(
    join(root, "schema-drift", "zero-drift.txt"),
    `Evidence run ID: ${evidenceRunId}\nRESULT | PASS | Zero schema drift verified.\n`,
  );
  for (const label of [
    "pre-migration-rehearsal",
    "post-migration-rehearsal",
    "restored-predecessor",
  ]) {
    writeFileSync(
      join(root, "data-invariants", `data-invariants-${label}-self-test.txt`),
      `Evidence run ID: ${evidenceRunId}\nRESULT | PASS | Invariants passed.\n`,
    );
  }
  writeFileSync(
    join(root, "data-equivalence", "data-equivalence-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\nRESULT | PASS | Equivalence passed.\n`,
  );
  writeFileSync(
    join(root, "backups", "backup-summary.txt"),
    `evidence_run_id=${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "backups", "restore-check-summary.txt"),
    `evidence_run_id=${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "backups", "backup-restore-preflight-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "staging-rollback", "rollback-summary.txt"),
    `evidence_run_id=${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "deployment-status", "deployment-status-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\n`,
  );
  const registerExportFile = join(
    root,
    "release-readiness-register",
    "release-readiness-register-self-test.csv",
  );
  const registerExportContent = `Evidence run ID,${evidenceRunId}\nSource Decision,DEC-0036\nRESULT,PASS,Release readiness register export captured.\n`;
  const registerExportChecksum = createHash("sha256")
    .update(registerExportContent)
    .digest("hex");
  writeFileSync(registerExportFile, registerExportContent);
  writeFileSync(
    `${registerExportFile}.sha256`,
    `${registerExportChecksum}  release-readiness-register-self-test.csv\n`,
  );
  writeExternalSecurityProofFiles(root, evidenceRunId);
  writeFileSync(
    join(root, "pilot-readiness", "pilot-readiness-preflight-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\nPILOT_REQUIRE_RELEASE_GATES_READY=true\n`,
  );
  writeFileSync(
    join(root, "pilot-readiness", "pilot-readiness-self-test.txt"),
    [
      `Evidence run ID: ${evidenceRunId}`,
      "requireReleaseGatesReady=true",
      "DEC-0036 strict release gate status",
      ...strictSecurityReadinessMarkers.map((marker) => `PASS | ${marker}`),
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "uat-status", "uat-status-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "enablement-status", "enablement-status-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\n`,
  );
  writeFileSync(
    join(root, "signed-evidence-status", "signed-evidence-status-self-test.txt"),
    `Evidence run ID: ${evidenceRunId}\n`,
  );
}

function writeExternalSecurityProofFiles(root, evidenceRunId, extension = "self-test") {
  mkdirSync(join(root, "external-security"), { recursive: true });
  for (const fileName of [
    `mfa-provider-enrollment-and-runtime-proof.${extension}`,
    `idp-session-invalidation-proof.${extension}`,
    `vault-or-artifact-storage-index.${extension}`,
    `break-glass-review-and-revocation-proof.${extension}`,
  ]) {
    writeFileSync(
      join(root, "external-security", fileName),
      `Evidence run ID: ${evidenceRunId}\nRESULT | PASS | External security proof captured.\n`,
    );
  }
}

function testBlockerDigest() {
  evidenceLines.push("CHECK | Release blocker digest");
  runNodeScript("scripts/release-final-review-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });
  runNodeScript("scripts/release-go-no-go.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });
  runNodeScript("scripts/release-metadata-session-lock.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });
  const placeholderChecklistDirectory = join(
    evidenceRoot,
    "pending-evidence-checklist",
  );
  mkdirSync(placeholderChecklistDirectory, { recursive: true });
  writeFileSync(
    join(
      placeholderChecklistDirectory,
      "pending-evidence-checklist-zz-placeholder.txt",
    ),
    [
      "OGFI ERP Phase I / Phase 1.5 pending evidence checklist",
      "Generated UTC: 99999999T999999Z",
      "Evidence run ID: <set-approved-evidence-run-id>",
      "RESULT | ACTION REQUIRED | Placeholder fixture for metadata warning coverage.",
      "",
    ].join("\n"),
  );
  const output = runNodeScript("scripts/release-blocker-digest.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 release blocker digest"),
    "release blocker digest header missing",
  );
  assert(
    output.includes("Owner Handoff"),
    "release blocker digest should include owner handoff section",
  );
  assert(
    output.includes("generated="),
    "release blocker digest should include source generated timestamps",
  );
  assert(
    output.includes("evidence_run_id="),
    "release blocker digest should include source evidence run metadata",
  );
  assert(
    output.includes("Evidence Session Metadata Warnings"),
    "release blocker digest should include source metadata warning section",
  );
  assert(
    output.includes("placeholder evidence_run_id=<set-approved-evidence-run-id>"),
    "release blocker digest should call out placeholder evidence run ids",
  );
  assert(
    output.includes("next=set RELEASE_EVIDENCE_RUN_ID"),
    "release blocker digest should include metadata warning recovery action",
  );
  assert(
    output.includes("SOURCE | Release metadata session lock"),
    "release blocker digest should include metadata session lock source",
  );
  assert(
    output.includes("SOURCE | UAT execution checklist"),
    "release blocker digest should include UAT execution checklist source",
  );
  assert(
    output.includes("SOURCE | Data snapshot evidence checklist"),
    "release blocker digest should include data snapshot checklist source",
  );
  assert(
    output.includes("SOURCE | Deployment evidence checklist"),
    "release blocker digest should include deployment checklist source",
  );
  assert(
    output.includes("SOURCE | Enablement evidence checklist"),
    "release blocker digest should include enablement checklist source",
  );
  assert(
    output.includes("SOURCE | Signed evidence checklist"),
    "release blocker digest should include signed evidence checklist source",
  );
  assert(
    output.includes("Summary Owner Counts"),
    "release blocker digest should include summary owner counts",
  );
  assert(
    output.includes("Priority Next Actions"),
    "release blocker digest should include prioritized next actions",
  );
  assertCommandOrder(output, [
    "Summary Owner Counts",
    "Priority Next Actions",
    "Owner Handoff",
  ]);
  assert(
    output.includes("1. severity=Critical"),
    "release blocker digest should put critical actions first",
  );
  assert(
    output.includes("COUNT | source=Final-review status"),
    "release blocker digest should include final-review owner counts",
  );
  assert(
    output.includes("COUNT | source=GO / NO-GO report"),
    "release blocker digest should include GO / NO-GO owner counts",
  );
  assert(
    output.includes("source=Final-review status | BLOCKED | Evidence run consistency"),
    "release blocker digest should include final-review per-item owner handoff rows",
  );
  assert(
    output.includes("source=GO / NO-GO report | FAIL | Evidence run consistency"),
    "release blocker digest should include GO / NO-GO per-item owner handoff rows",
  );
  assert(
    output.includes("source=GO / NO-GO report | RESULT | NO-GO"),
    "release blocker digest should include GO / NO-GO result as owner handoff row",
  );
  assert(
    output.includes("source=Final-review status | RESULT | BLOCKED"),
    "release blocker digest should include final-review result as owner handoff row",
  );
  assert(
    output.includes("source=Release metadata session lock | RESULT | ACTION REQUIRED"),
    "release blocker digest should include metadata session lock action-required owner handoff row",
  );
  assert(
    output.includes("source=UAT execution checklist | RESULT | ACTION REQUIRED"),
    "release blocker digest should include UAT execution checklist action-required owner handoff row",
  );
  assert(
    output.includes("source=Data snapshot evidence checklist | RESULT | ACTION REQUIRED"),
    "release blocker digest should include data snapshot checklist action-required owner handoff row",
  );
  assert(
    output.includes("source=Deployment evidence checklist | RESULT | ACTION REQUIRED"),
    "release blocker digest should include deployment checklist action-required owner handoff row",
  );
  assert(
    output.includes("source=Enablement evidence checklist | RESULT | ACTION REQUIRED"),
    "release blocker digest should include enablement checklist action-required owner handoff row",
  );
  assert(
    output.includes("source=Signed evidence checklist | RESULT | ACTION REQUIRED"),
    "release blocker digest should include signed evidence checklist action-required owner handoff row",
  );
  assert(
    output.includes("RESULT | BLOCKED |"),
    "release blocker digest should remain blocked when advisory blockers exist",
  );
  assert(
    readdirSync(join(evidenceRoot, "blocker-digest")).some((file) =>
      /^blocker-digest-.*\.txt$/.test(file),
    ),
    "release blocker digest artifact missing",
  );
  evidenceLines.push(
    "PASS | Release blocker digest groups current status blockers by owner.",
  );
}

function testStatusSuite() {
  evidenceLines.push("CHECK | Release status suite");
  const statusSuiteSource = readFileSync(
    join(workspaceRoot, "scripts", "release-status-suite.mjs"),
    "utf8",
  );
  const output = runNodeScript("scripts/release-status-suite.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 release status suite"),
    "release status suite header missing",
  );
  assert(
    output.includes("Strict mode: disabled"),
    "release status suite should default to advisory mode",
  );
  assert(
    output.includes("Review mode: final"),
    "release status suite should default to final review mode",
  );
  assert(
    output.includes("COMMAND | Pending evidence checklist"),
    "release status suite should run pending evidence checklist",
  );
  assert(
    output.includes("COMMAND | Release metadata worksheet"),
    "release status suite should run release metadata worksheet",
  );
  assert(
    output.includes("COMMAND | Release metadata environment template"),
    "release status suite should run release metadata environment template",
  );
  assert(
    output.includes("COMMAND | Release metadata session lock"),
    "release status suite should run release metadata session lock",
  );
  assert(
    output.includes("COMMAND | Data snapshot evidence checklist"),
    "release status suite should run data snapshot checklist",
  );
  assert(
    output.includes("COMMAND | Recovery evidence checklist"),
    "release status suite should run recovery evidence checklist",
  );
  assert(
    output.includes("COMMAND | Deployment evidence checklist"),
    "release status suite should run deployment checklist",
  );
  assert(
    output.includes("COMMAND | UAT execution checklist"),
    "release status suite should run UAT execution checklist",
  );
  assert(
    output.includes("COMMAND | Enablement evidence checklist"),
    "release status suite should run enablement checklist",
  );
  assert(
    output.includes("COMMAND | Signed evidence templates"),
    "release status suite should run signed evidence templates",
  );
  assert(
    output.includes("COMMAND | Signed evidence checklist"),
    "release status suite should run signed evidence checklist",
  );
  assert(
    output.includes("COMMAND | Milestone status"),
    "release status suite should run milestone status",
  );
  assert(
    output.includes("COMMAND | GO / NO-GO evidence summary"),
    "release status suite should refresh GO / NO-GO evidence summary before blocker digest",
  );
  assert(
    output.includes("COMMAND | External evidence collection guide"),
    "release status suite should run external evidence collection guide",
  );
  assert(
    output.includes("COMMAND | External evidence rehearsal command plan"),
    "release status suite should run external evidence rehearsal command plan",
  );
  assert(
    output.includes("COMMAND | Blocker digest"),
    "release status suite should run blocker digest after refreshing status reports",
  );
  assert(
    output.includes(
      "source evidence, signed documents, and external-security proof references are complete",
    ),
    "release status suite should tell owners to refresh manifest after external-security proof references are complete",
  );
  assertCommandOrder(output, [
    "COMMAND | Data snapshot evidence checklist",
    "COMMAND | Data snapshot status",
  ]);
  assertCommandOrder(output, [
    "COMMAND | Recovery evidence checklist",
    "COMMAND | Deployment evidence checklist",
    "COMMAND | Deployment and rollback status",
  ]);
  assertCommandOrder(output, [
    "COMMAND | UAT execution checklist",
    "COMMAND | UAT evidence status",
    "COMMAND | Pilot and UAT readiness status",
  ]);
  assertCommandOrder(output, [
    "COMMAND | Enablement evidence checklist",
    "COMMAND | Enablement and hypercare status",
  ]);
  assertCommandOrder(output, [
    "COMMAND | Signed evidence templates",
    "COMMAND | Signed evidence checklist",
    "COMMAND | Signed evidence status",
  ]);
  assertCommandOrder(output, [
    "COMMAND | Final-review readiness status",
    "COMMAND | GO / NO-GO evidence summary",
    "COMMAND | External evidence collection guide",
    "COMMAND | External evidence rehearsal command plan",
    "COMMAND | Pending evidence checklist",
    "COMMAND | Milestone status",
    "COMMAND | Blocker digest",
  ]);
  assert(
    output.includes("MANIFEST | NOT REFRESHED |"),
    "release status suite should remind reviewers to refresh the final manifest separately",
  );
  assert(
    output.includes("RESULT | PASS | Release status suite refreshed advisory reports."),
    "release status suite should pass when advisory reports run",
  );
  const interimOutput = runNodeScript("scripts/release-status-suite.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_REVIEW_MODE: "interim",
    RELEASE_INTERIM_SKIP_SELF_TEST: "1",
    RELEASE_UAT_EVIDENCE_FILE: selfTestUatFile,
  });
  assert(
    interimOutput.includes("Review mode: interim"),
    "release status suite should support interim review mode",
  );
  assert(
    interimOutput.includes("COMMAND | Interim release review"),
    "release status suite interim mode should run interim review",
  );
  assert(
    !interimOutput.includes("COMMAND | GO / NO-GO evidence summary"),
    "release status suite interim mode should skip GO / NO-GO",
  );
  assert(
    !interimOutput.includes("COMMAND | Final-review readiness status"),
    "release status suite interim mode should skip final-review status",
  );
  assert(
    interimOutput.includes("Final-only signed evidence status, final-review, and GO / NO-GO checks are skipped in interim mode"),
    "release status suite interim mode should explain skipped final-only gates",
  );
  const strictResult = spawnSync(process.execPath, ["scripts/release-status-suite.mjs"], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      RELEASE_EVIDENCE_ROOT: evidenceRoot,
      RELEASE_STATUS_SUITE_STRICT: "1",
    },
    encoding: "utf8",
  });
  const strictOutput = `${strictResult.stdout}${strictResult.stderr}`;
  assert(
    strictResult.status !== 0,
    "release status suite strict mode should fail while final evidence is blocked",
  );
  assert(
    strictOutput.includes("Strict mode: enabled"),
    "release status suite strict mode should report that strict mode is enabled",
  );
  assert(
    strictOutput.includes("STRICT | FAIL | Final-review readiness status is not release-ready."),
    "release status suite strict mode should fail final-review readiness",
  );
  assert(
    strictOutput.includes("STRICT | FAIL | GO / NO-GO evidence summary is not release-ready."),
    "release status suite strict mode should fail GO / NO-GO readiness",
  );
  assert(
    strictOutput.includes("RESULT | FAIL | Strict release readiness checks are not passing."),
    "release status suite strict mode should report readiness failure",
  );
  assert(
    statusSuiteSource.includes("RESULT | READY FOR GO / NO-GO"),
    "release status suite strict mode should accept final-review ready-for-GO output",
  );
  assert(
    statusSuiteSource.includes("RESULT | GO REVIEW READY"),
    "release status suite strict mode should accept GO review-ready output",
  );
  assert(
    statusSuiteSource.includes("RESULT | CONDITIONAL GO REVIEW"),
    "release status suite strict mode should accept conditional GO review output",
  );
  assert(
    readdirSync(join(evidenceRoot, "status-suite")).some((file) =>
      /^status-suite-.*\.txt$/.test(file),
    ),
    "release status suite artifact missing",
  );
  evidenceLines.push(
    "PASS | Release status suite refreshes advisory status artifacts without approving release.",
  );
}

function testInterimReview() {
  evidenceLines.push("CHECK | Interim release review");
  const output = runNodeScript("scripts/release-interim-review.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_INTERIM_SKIP_SELF_TEST: "1",
    RELEASE_UAT_EVIDENCE_FILE: selfTestUatFile,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 interim release review"),
    "interim review header missing",
  );
  assert(
    output.includes("Review mode: INTERIM"),
    "interim review should identify review mode",
  );
  assert(
    output.includes("EVIDENCE_TIER | LOCAL"),
    "interim review should label evidence as local tier",
  );
  assert(
    output.includes("FINAL_ONLY | DEFERRED"),
    "interim review should defer final-only signed evidence gates",
  );
  assert(
    output.includes("RESULT | CONDITIONAL GO | Local interim evidence refreshed"),
    "interim review should produce conditional GO only for local interim evidence",
  );
  assert(
    output.includes("COMMAND | UAT evidence status"),
    "interim review should run UAT evidence status",
  );
  assert(
    output.includes("COMMAND | Deployment and rollback status"),
    "interim review should run deployment status",
  );
  assert(
    output.includes("COMMAND | Enablement and hypercare status"),
    "interim review should run enablement status",
  );
  assert(
    readdirSync(join(evidenceRoot, "interim-review")).some((file) =>
      /^interim-review-.*\.txt$/.test(file),
    ),
    "interim review artifact missing",
  );
  assert(
    !existsSync(join(evidenceRoot, "signed-documents", "uat-evidence-pack.md")),
    "interim review must not create final signed UAT evidence",
  );
  evidenceLines.push(
    "PASS | Interim review labels local artifacts without approving final release gates.",
  );
}

function testFinalReviewStatus() {
  evidenceLines.push("CHECK | Final-review readiness status");
  const finalReviewSource = readFileSync(
    join(workspaceRoot, "scripts", "release-final-review-status.mjs"),
    "utf8",
  );
  const output = runNodeScript("scripts/release-final-review-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 final review readiness status"),
    "final-review status header missing",
  );
  assert(
    output.includes("RESULT | BLOCKED"),
    "final-review status should remain blocked when final evidence is missing",
  );
  assert(
    output.includes("Final Review Owner Summary"),
    "final-review status should include owner summary section",
  );
  assert(
    output.includes("Signed Evidence Gates"),
    "final-review status should include signed evidence gates",
  );
  assert(
    output.includes("Evidence Session Gates"),
    "final-review status should include evidence session gates",
  );
  assert(
    output.includes("BLOCKED | Evidence run consistency"),
    "final-review status should block when final evidence run IDs are incomplete or inconsistent",
  );
  assert(
    output.includes("BLOCKED | Signed UAT evidence pack"),
    "final-review status should block when signed UAT evidence is missing",
  );
  assert(
    output.includes("Data snapshot readiness status"),
    "final-review status should include data snapshot status evidence gate",
  );
  assert(
    output.includes("Data snapshot preflight PASS"),
    "final-review status should include data snapshot preflight PASS gate",
  );
  assert(
    output.includes("Backup restore readiness status"),
    "final-review status should include backup/restore status evidence gate",
  );
  assert(
    output.includes("Backup/restore preflight PASS"),
    "final-review status should include backup/restore preflight PASS gate",
  );
  assert(
    output.includes("Deployment and rollback status"),
    "final-review status should include deployment status evidence gate",
  );
  assert(
    output.includes("Release readiness register export"),
    "final-review status should include release readiness register export gate",
  );
  assert(
    output.includes("Release readiness register checksum"),
    "final-review status should include release readiness register checksum gate",
  );
  assert(
    finalReviewSource.includes("evaluateChecksumSidecar") &&
      finalReviewSource.includes("requireChecksumSidecar"),
    "final-review status should verify release readiness register checksum sidecars",
  );
  assert(
    output.includes("External MFA provider proof") &&
      output.includes("External IdP session invalidation proof") &&
      output.includes("External evidence storage index") &&
      output.includes("External break-glass review proof"),
    "final-review status should include external security proof gates",
  );
  assert(
    finalReviewSource.includes(
      "external-security/mfa-provider-enrollment-and-runtime-proof.<approved-extension>",
    ) &&
      finalReviewSource.includes(
        "external-security/idp-session-invalidation-proof.<approved-extension>",
      ) &&
      finalReviewSource.includes(
        "external-security/vault-or-artifact-storage-index.<approved-extension>",
      ) &&
      finalReviewSource.includes(
        "external-security/break-glass-review-and-revocation-proof.<approved-extension>",
      ) &&
      finalReviewSource.includes("RESULT | PASS | External security proof captured."),
    "final-review status should give external-security proof owners exact copy targets and PASS marker",
  );
  assert(
    output.includes("Pilot readiness preflight PASS"),
    "final-review status should include pilot readiness preflight PASS gate",
  );
  assert(
    output.includes("Pilot UAT readiness status"),
    "final-review status should include pilot/UAT status evidence gate",
  );
  assert(
    output.includes("UAT status report"),
    "final-review status should include UAT status evidence gate",
  );
  assert(
    output.includes("Signed evidence status"),
    "final-review status should include signed evidence status gate",
  );
  assert(
    finalReviewSource.includes(
      "RESULT | PASS | Signed and external security evidence documents are present and have no unresolved placeholders.",
    ) &&
      finalReviewSource.includes(
        "all final evidence artifacts, signed documents, and external-security proof references generated in the same RELEASE_EVIDENCE_RUN_ID session",
      ) &&
      finalReviewSource.includes(
        "signed documents satisfy signoff contract and external-security proof references are present",
      ),
    "final-review status should require external-security proof references in evidence-run and signed-evidence owner guidance",
  );
  assert(
    output.includes("BLOCKED | Release Manager | blocker_count="),
    "final-review status should summarize release-manager blockers",
  );
  assert(
    output.includes("BLOCKED | QA Lead / Operations Lead | blocker_count="),
    "final-review status should summarize pilot and UAT evidence blockers",
  );
  assert(
    readdirSync(join(evidenceRoot, "final-review-status")).some((file) =>
      /^final-review-status-.*\.txt$/.test(file),
    ),
    "final-review status artifact missing",
  );
  evidenceLines.push(
    "PASS | Final-review status reports missing final evidence without approving release.",
  );
}

function testSignedEvidenceTemplates() {
  evidenceLines.push("CHECK | Signed evidence templates");
  const output = runNodeScript("scripts/release-signed-evidence-templates.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
  });

  assert(
    output.includes("RESULT | PASS | Signed evidence templates generated."),
    "signed evidence template command should pass",
  );
  assert(
    output.includes("not signed evidence"),
    "signed evidence template command should state templates are not final evidence",
  );
  assert(
    output.includes("Local generated artifacts can support interim review only"),
    "signed evidence template command should state local artifacts are interim only",
  );

  const templateDir = join(evidenceRoot, "signed-document-templates");
  for (const [file, title] of [
    ["uat-evidence-pack-template.md", "Signed UAT Evidence Pack Template"],
    [
      "deployment-rollback-evidence-template.md",
      "Signed Deployment And Rollback Evidence Template",
    ],
    [
      "training-impact-assessment-template.md",
      "Signed Training Impact Assessment Template",
    ],
    [
      "external-mfa-provider-proof-template.md",
      "External MFA Provider Proof Template",
    ],
    [
      "external-idp-session-invalidation-proof-template.md",
      "External IdP Session Invalidation Proof Template",
    ],
    [
      "external-evidence-storage-index-template.md",
      "External Evidence Storage Index Template",
    ],
    [
      "external-break-glass-review-proof-template.md",
      "External Break-Glass Review Proof Template",
    ],
  ]) {
    const content = readFileSync(join(templateDir, file), "utf8");
    assert(content.includes(title), `${file} should include template title`);
    assert(
      content.includes("Evidence run ID: self-test-run"),
      `${file} should include evidence run ID`,
    );
    assert(content.includes("Signed by:"), `${file} should include signed-by field`);
    assert(content.includes("Decision:"), `${file} should include decision field`);
    assert(content.includes("Owner:"), `${file} should include owner field`);
    assert(
      content.includes("## Interim Local Artifact References"),
      `${file} should include interim local artifact references`,
    );
    assert(
      content.includes("## Final External Evidence Required"),
      `${file} should include final external evidence requirements`,
    );
    assert(
      content.includes("They do not replace final owner-approved evidence."),
      `${file} should preserve the local-artifact evidence boundary`,
    );
    if (file.startsWith("external-")) {
      assert(
        content.includes("RESULT | PASS | External security proof captured."),
        `${file} should include required external security PASS marker`,
      );
      assert(
        content.includes("external-security/"),
        `${file} should include external-security copy target`,
      );
    }
  }

  assert(
    !existsSync(join(evidenceRoot, "signed-documents", "uat-evidence-pack.md")),
    "signed evidence template command must not create final signed UAT evidence",
  );
  evidenceLines.push(
    "PASS | Signed evidence templates create owner-safe signoff shells outside signed-documents.",
  );
}

function testSignedEvidenceChecklist() {
  evidenceLines.push("CHECK | Signed evidence checklist");
  const output = runNodeScript("scripts/release-signed-evidence-checklist.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 signed evidence checklist"),
    "signed evidence checklist header missing",
  );
  assert(
    output.includes("Evidence run ID: self-test-run"),
    "signed evidence checklist should include evidence run ID",
  );
  assert(
    output.includes("FIELD | evidence run"),
    "signed evidence checklist should require evidence run fields",
  );
  assert(
    output.includes("FIELD | signer"),
    "signed evidence checklist should require signer fields",
  );
  assert(
    output.includes("FIELD | decision"),
    "signed evidence checklist should require explicit decision fields",
  );
  assert(
    output.includes("FIELD | placeholders"),
    "signed evidence checklist should require placeholder clearing",
  );
  assert(
    output.includes("DOCUMENT | Signed UAT evidence pack"),
    "signed evidence checklist should include signed UAT document matrix row",
  );
  assert(
    output.includes("DOCUMENT | External MFA provider proof") &&
      output.includes("DOCUMENT | External IdP session invalidation proof") &&
      output.includes("DOCUMENT | External evidence storage index") &&
      output.includes("DOCUMENT | External break-glass review proof"),
    "signed evidence checklist should include external security proof matrix rows",
  );
  assert(
    output.includes("RESULT | PASS | External security proof captured."),
    "signed evidence checklist should require external security PASS marker",
  );
  assert(
    output.includes("signed documents, external-security proof references, manifest") &&
      output.includes("Verify signed documents and external-security proof references") &&
      output.includes("Signed and external security evidence documents are present"),
    "signed evidence checklist should treat external-security proof references as part of signed-evidence status",
  );
  assert(
    output.includes("ENV_OVERRIDE | RELEASE_DEPLOYMENT_EVIDENCE_FILE"),
    "signed evidence checklist should include deployment evidence override",
  );
  assert(
    output.includes("This checklist is advisory"),
    "signed evidence checklist should state advisory boundary",
  );
  assert(
    output.includes("Latest Signed Evidence Status"),
    "signed evidence checklist should include latest signed evidence status snapshot",
  );
  assert(
    output.includes("Latest Final Review Status"),
    "signed evidence checklist should include latest final review status snapshot",
  );
  assert(
    output.includes("RESULT | ACTION REQUIRED | Collect owner-approved signed UAT, deployment/rollback, training, and external security evidence"),
    "signed evidence checklist should end with one action-required owner handoff including external security evidence",
  );
  assert(
    readdirSync(join(evidenceRoot, "signed-evidence-checklist")).some((file) =>
      /^signed-evidence-checklist-.*\.txt$/.test(file),
    ),
    "signed evidence checklist artifact missing",
  );
  assert(
    !existsSync(join(evidenceRoot, "signed-documents", "uat-evidence-pack.md")),
    "signed evidence checklist must not create final signed UAT evidence",
  );
  evidenceLines.push(
    "PASS | Signed evidence checklist defines final signoff requirements without fabricating proof.",
  );
}

function testSignedEvidenceStatus() {
  evidenceLines.push("CHECK | Signed evidence status");
  const missingProofEvidenceRoot = join(tempRoot, "signed-status-missing-proof-evidence");
  const output = runNodeScript("scripts/release-signed-evidence-status.mjs", {
    RELEASE_EVIDENCE_ROOT: missingProofEvidenceRoot,
  });

  assert(
    output.includes("OGFI ERP Phase I / Phase 1.5 signed evidence status"),
    "signed evidence status header missing",
  );
  assert(
    output.includes("RESULT | BLOCKED"),
    "signed evidence status should remain blocked when signed documents are missing",
  );
  assert(
    output.includes("Required Signed Document Collection"),
    "signed evidence status should include signed document collection instructions",
  );
  assert(
    output.includes("Required External Security Evidence") &&
      output.includes("DOCUMENT | External MFA provider proof") &&
      output.includes("DOCUMENT | External IdP session invalidation proof") &&
      output.includes("DOCUMENT | External evidence storage index") &&
      output.includes("DOCUMENT | External break-glass review proof"),
    "signed evidence status should include external security proof collection instructions",
  );
  assert(
    output.includes("required_marker=RESULT | PASS | External security proof captured."),
    "signed evidence status should show external security PASS marker requirement",
  );
  assert(
    output.includes("reviewed_directory=") &&
      output.includes("filename_pattern=/^mfa-provider-enrollment-and-runtime-proof\\..+$/"),
    "signed evidence status should scan external security proofs by directory and filename pattern",
  );
  assert(
    output.includes("default_path=signed-documents/uat-evidence-pack.md"),
    "signed evidence status should include default UAT signed document path",
  );
  assert(
    output.includes("env_override=RELEASE_DEPLOYMENT_EVIDENCE_FILE"),
    "signed evidence status should include deployment evidence override variable",
  );
  assert(
    output.includes("BLOCKED | External MFA provider proof") &&
      output.includes("missing matching file in"),
    "signed evidence status should block when external security proof files are missing by pattern",
  );
  const incompleteSignedFile = join(tempRoot, "incomplete-signed-evidence.md");
  writeFileSync(
    incompleteSignedFile,
    [
      "# Incomplete Signed Evidence",
      "",
      "Signed by: QA Lead",
      "Role: QA",
      "Decision: Reviewed",
      "Owner: Product Owner",
      "",
    ].join("\n"),
  );
  const incompleteOutput = runNodeScript("scripts/release-signed-evidence-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_UAT_EVIDENCE_FILE: incompleteSignedFile,
    RELEASE_DEPLOYMENT_EVIDENCE_FILE: incompleteSignedFile,
    RELEASE_TRAINING_EVIDENCE_FILE: incompleteSignedFile,
  });
  assert(
    incompleteOutput.includes("missing signoff fields: Evidence run ID, Date"),
    "signed evidence status should reject signed files without evidence run ID and required signoff date",
  );
  assert(
    incompleteOutput.includes("invalid signoff fields: Decision must be an explicit release decision"),
    "signed evidence status should reject vague signed evidence decisions",
  );
  assert(
    incompleteOutput.includes("Evidence run ID"),
    "signed evidence status should reject signed files without evidence run ID",
  );

  const completeSignedFile = join(tempRoot, "complete-signed-evidence.md");
  writeFileSync(
    completeSignedFile,
    [
      "# Complete Signed Evidence",
      "",
      "Evidence run ID: self-test-run",
      "Signed by: Nico Valdez",
      "Role: Product Owner",
      "Date: 2026-07-01",
      "Decision: Approved for release evidence review",
      "Owner: Release Manager",
      "",
    ].join("\n"),
  );
  writeExternalSecurityProofFiles(evidenceRoot, "self-test-run", "approved.md");
  const completeOutput = runNodeScript("scripts/release-signed-evidence-status.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
    RELEASE_UAT_EVIDENCE_FILE: completeSignedFile,
    RELEASE_DEPLOYMENT_EVIDENCE_FILE: completeSignedFile,
    RELEASE_TRAINING_EVIDENCE_FILE: completeSignedFile,
  });
  assert(
    completeOutput.includes("Evidence run ID: self-test-run"),
    "signed evidence status should include evidence run ID",
  );
  assert(
    completeOutput.includes("RESULT | PASS | Signed and external security evidence documents are present and have no unresolved placeholders."),
    "signed evidence status should pass when all required signoff fields and external security proof files are present",
  );
  assert(
    readdirSync(join(evidenceRoot, "signed-evidence-status")).some((file) =>
      /^signed-evidence-status-.*\.txt$/.test(file),
    ),
    "signed evidence status artifact missing",
  );
  evidenceLines.push(
    "PASS | Signed evidence status reports missing signed documents without approving release.",
  );
}

function testGoNoGoReport() {
  evidenceLines.push("CHECK | GO / NO-GO report");
  const goNoGoSource = readFileSync(
    join(workspaceRoot, "scripts", "release-go-no-go.mjs"),
    "utf8",
  );
  const checksumFile = join(evidenceRoot, "backups", "ogfi-erp-self-test.dump.sha256");
  const hiddenChecksumFile = `${checksumFile}.self-test-hidden`;
  if (existsSync(checksumFile)) {
    renameSync(checksumFile, hiddenChecksumFile);
  }

  let output;
  try {
    output = runNodeScript("scripts/release-go-no-go.mjs", {
      RELEASE_EVIDENCE_ROOT: evidenceRoot,
    });
  } finally {
    if (existsSync(hiddenChecksumFile)) {
      renameSync(hiddenChecksumFile, checksumFile);
    }
  }

  assert(
    output.includes("RESULT | NO-GO"),
    "GO / NO-GO report should remain NO-GO when signed documents and release artifacts are missing",
  );
  assert(
    output.includes("GO / NO-GO Owner Summary"),
    "GO / NO-GO report should include owner summary section",
  );
  assert(
    output.includes("Signed Evidence Gates"),
    "GO / NO-GO report should include signed evidence gates",
  );
  assert(
    output.includes("Evidence Session Gates"),
    "GO / NO-GO report should include evidence session gates",
  );
  assert(
    output.includes("FAIL | Evidence run consistency"),
    "GO / NO-GO report should fail when final evidence run IDs are incomplete or inconsistent",
  );
  assert(
    output.includes("FAIL | Signed UAT evidence pack"),
    "GO / NO-GO report should fail when signed UAT evidence is missing",
  );
  assert(
    output.includes("Data snapshot readiness status"),
    "GO / NO-GO report should include data snapshot status evidence gate",
  );
  assert(
    output.includes("PASS | Data snapshot preflight | data-snapshot-preflight-self-test-pass.txt"),
    "GO / NO-GO report should require PASS data snapshot preflight evidence",
  );
  assert(
    output.includes("Backup restore readiness status"),
    "GO / NO-GO report should include backup/restore status evidence gate",
  );
  assert(
    output.includes("Deployment and rollback status"),
    "GO / NO-GO report should include deployment status evidence gate",
  );
  assert(
    output.includes("Release readiness register export"),
    "GO / NO-GO report should include release readiness register export gate",
  );
  assert(
    output.includes("Release readiness register checksum"),
    "GO / NO-GO report should include release readiness register checksum gate",
  );
  assert(
    goNoGoSource.includes("evaluateChecksumSidecar") &&
      goNoGoSource.includes("requireChecksumSidecar"),
    "GO / NO-GO report should verify release readiness register checksum sidecars",
  );
  assert(
    output.includes("External MFA provider proof") &&
      output.includes("External IdP session invalidation proof") &&
      output.includes("External evidence storage index") &&
      output.includes("External break-glass review proof"),
    "GO / NO-GO report should include external security proof gates",
  );
  assert(
    goNoGoSource.includes(
      "external-security/mfa-provider-enrollment-and-runtime-proof.<approved-extension>",
    ) &&
      goNoGoSource.includes(
        "external-security/idp-session-invalidation-proof.<approved-extension>",
      ) &&
      goNoGoSource.includes(
        "external-security/vault-or-artifact-storage-index.<approved-extension>",
      ) &&
      goNoGoSource.includes(
        "external-security/break-glass-review-and-revocation-proof.<approved-extension>",
      ) &&
      goNoGoSource.includes("RESULT | PASS | External security proof captured."),
    "GO / NO-GO report should give external-security proof owners exact copy targets and PASS marker",
  );
  assert(
    output.includes("FAIL | Backup checksum artifact"),
    "GO / NO-GO report should block when the required backup checksum artifact is missing",
  );
  assert(
    !output.includes("WARN | Backup checksum artifact"),
    "GO / NO-GO report must not treat the backup checksum artifact as optional",
  );
  assert(
    output.includes("Pilot UAT readiness status"),
    "GO / NO-GO report should include pilot/UAT status evidence gate",
  );
  assert(
    output.includes("PASS | Pilot readiness preflight | pilot-readiness-preflight-self-test-pass.txt"),
    "GO / NO-GO report should require PASS pilot readiness preflight evidence",
  );
  assert(
    output.includes("UAT status report"),
    "GO / NO-GO report should include UAT status evidence gate",
  );
  assert(
    output.includes("Signed evidence status"),
    "GO / NO-GO report should include signed evidence status gate",
  );
  assert(
    goNoGoSource.includes(
      "RESULT | PASS | Signed and external security evidence documents are present and have no unresolved placeholders.",
    ) &&
      goNoGoSource.includes(
        "all final evidence artifacts, signed documents, and external-security proof references generated in the same RELEASE_EVIDENCE_RUN_ID session",
      ) &&
      goNoGoSource.includes(
        "signed documents satisfy signoff contract and external-security proof references are present",
      ),
    "GO / NO-GO report should require external-security proof references in evidence-run and signed-evidence owner guidance",
  );
  assert(
    output.includes("FAIL | Release Manager | blocking_gate_count="),
    "GO / NO-GO report should summarize release-manager blocking gates",
  );
  assert(
    output.includes("FAIL | QA Lead / Operations Lead | blocking_gate_count="),
    "GO / NO-GO report should summarize UAT/pilot blocking gates",
  );
  assert(
    readdirSync(join(evidenceRoot, "go-no-go")).some((file) =>
      /^go-no-go-.*\.txt$/.test(file),
    ),
    "GO / NO-GO report artifact missing",
  );
  evidenceLines.push(
    "PASS | GO / NO-GO report remains NO-GO when required evidence is missing.",
  );
}

function testReleaseReadinessRegisterChecksumMismatch() {
  evidenceLines.push("CHECK | Release readiness register checksum mismatch");
  const checksumEvidenceRoot = join(tempRoot, "readiness-register-checksum-mismatch");
  writeEvidenceRunConsistencyArtifacts(checksumEvidenceRoot, "self-test-run");
  const registerExportFile = join(
    checksumEvidenceRoot,
    "release-readiness-register",
    "release-readiness-register-self-test.csv",
  );
  const registerChecksumFile = `${registerExportFile}.sha256`;
  const originalChecksum = readFileSync(registerChecksumFile, "utf8");

  writeFileSync(
    registerChecksumFile,
    `0000000000000000000000000000000000000000000000000000000000000000  release-readiness-register-self-test.csv\n`,
  );

  try {
    const finalReviewOutput = runNodeScript("scripts/release-final-review-status.mjs", {
      RELEASE_EVIDENCE_ROOT: checksumEvidenceRoot,
    });
    assert(
      finalReviewOutput.includes("BLOCKED | Release readiness register export") &&
        finalReviewOutput.includes("failed checksum verification") &&
        finalReviewOutput.includes("Release readiness register export checksum mismatch"),
      "final-review status should block a readiness-register export with a mismatched checksum sidecar",
    );

    const goNoGoOutput = runNodeScript("scripts/release-go-no-go.mjs", {
      RELEASE_EVIDENCE_ROOT: checksumEvidenceRoot,
    });
    assert(
      goNoGoOutput.includes("FAIL | Release readiness register export") &&
        goNoGoOutput.includes("checksum verification failed") &&
        goNoGoOutput.includes("Release readiness register export checksum mismatch"),
      "GO / NO-GO report should fail a readiness-register export with a mismatched checksum sidecar",
    );
  } finally {
    writeFileSync(registerChecksumFile, originalChecksum);
  }

  evidenceLines.push(
    "PASS | Final-review and GO / NO-GO reject readiness-register exports with mismatched checksum sidecars.",
  );
}

function testEvidenceManifest() {
  evidenceLines.push("CHECK | Evidence manifest");
  const output = runNodeScript("scripts/release-evidence-manifest.mjs", {
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_RUN_ID: "self-test-run",
  });

  assert(
    output.includes("Release evidence manifest written:"),
    "manifest command should report output path",
  );
  assert(
    output.includes("Release evidence manifest checksum written:"),
    "manifest command should report checksum sidecar path",
  );

  const manifestFile = readdirSync(join(evidenceRoot, "manifests")).find(
    (file) => /^release-evidence-manifest-.*\.txt$/.test(file),
  );
  assert(manifestFile, "release evidence manifest artifact missing");

  const manifestPath = join(evidenceRoot, "manifests", manifestFile);
  const manifest = readFileSync(manifestPath, {
    encoding: "utf8",
  });
  const manifestChecksumFile = `${manifestPath}.sha256`;
  assert(existsSync(manifestChecksumFile), "release evidence manifest checksum missing");
  const manifestChecksum = createHash("sha256").update(manifest).digest("hex");
  const manifestChecksumSidecar = readFileSync(manifestChecksumFile, "utf8");
  assert(
    manifestChecksumSidecar.startsWith(`${manifestChecksum} `) &&
      manifestChecksumSidecar.includes(manifestFile),
    "manifest checksum sidecar should match the generated manifest",
  );
  assert(
    manifest.includes("evidence_run_id=self-test-run"),
    "manifest should include evidence run id",
  );

  const metadataFile = join(tempRoot, "manifest-metadata.env");
  const localEnvManifestOutput = join(
    evidenceRoot,
    "manifests",
    "release-evidence-manifest-local-env.txt",
  );
  writeFileSync(
    metadataFile,
    ["RELEASE_EVIDENCE_RUN_ID=manifest-local-env-run", ""].join("\n"),
  );
  runNodeScript("scripts/release-evidence-manifest.mjs", {
    LOCAL_ENV_FILES: metadataFile,
    RELEASE_EVIDENCE_RUN_ID: "",
    RELEASE_EVIDENCE_ROOT: evidenceRoot,
    RELEASE_EVIDENCE_MANIFEST_OUTPUT_FILE: localEnvManifestOutput,
  });
  const localEnvManifest = readFileSync(localEnvManifestOutput, {
    encoding: "utf8",
  });
  assert(
    localEnvManifest.includes("evidence_run_id=manifest-local-env-run"),
    "manifest should load evidence run ID from LOCAL_ENV_FILES",
  );
  assert(
    manifest.includes("COLLECTION_README.txt"),
    "manifest should include initialized collection README",
  );
  assert(
    manifest.includes("RESULT | PASS | Release evidence manifest captured."),
    "manifest should include pass result marker",
  );
  assert(
    manifest.includes("Freshness Notes"),
    "manifest should include freshness notes",
  );
  assert(
    manifest.includes("Evidence Class Legend"),
    "manifest should include evidence class legend",
  );
  assert(
    manifest.includes(" local interim-review/interim-review-"),
    "manifest should classify interim review artifacts as local evidence",
  );
  assert(
    manifest.includes(" advisory status-suite/status-suite-"),
    "manifest should classify generated status suite artifacts as advisory evidence",
  );
  assert(
    manifest.includes(" advisory data-snapshot-checklist/data-snapshot-checklist-"),
    "manifest should classify data snapshot checklist artifacts as advisory evidence",
  );
  assert(
    manifest.includes(" advisory deployment-checklist/deployment-evidence-checklist-"),
    "manifest should classify deployment checklist artifacts as advisory evidence",
  );
  assert(
    manifest.includes(" advisory uat-checklist/uat-execution-checklist-"),
    "manifest should classify UAT execution checklist artifacts as advisory evidence",
  );
  assert(
    manifest.includes(" advisory enablement-checklist/enablement-checklist-"),
    "manifest should classify enablement checklist artifacts as advisory evidence",
  );
  assert(
    manifest.includes(" advisory signed-evidence-checklist/signed-evidence-checklist-"),
    "manifest should classify signed evidence checklist artifacts as advisory evidence",
  );
  assert(
    manifest.includes("deployment-status/deployment-status-"),
    "manifest should include deployment status artifacts as source evidence",
  );
  assert(
    manifest.includes("external-security/mfa-provider-enrollment-and-runtime-proof.") &&
      manifest.includes("external-security/idp-session-invalidation-proof.") &&
      manifest.includes("external-security/vault-or-artifact-storage-index.") &&
      manifest.includes("external-security/break-glass-review-and-revocation-proof."),
    "manifest should include external security proof artifacts",
  );
  assert(
    manifest.includes(" source deployment-status/deployment-status-"),
    "manifest should classify deployment status artifacts as source evidence",
  );
  assert(
    manifest.includes(" source external-security/mfa-provider-enrollment-and-runtime-proof.") &&
      manifest.includes(" source external-security/idp-session-invalidation-proof.") &&
      manifest.includes(" source external-security/vault-or-artifact-storage-index.") &&
      manifest.includes(" source external-security/break-glass-review-and-revocation-proof."),
    "manifest should classify external security proof artifacts as source evidence",
  );
  assert(
    manifest.includes("freshness_ignored_directory=final-review-status/"),
    "manifest should list generated final-review status as freshness-ignored",
  );
  assert(
    manifest.includes("freshness_ignored_directory=external-evidence-guide/"),
    "manifest should list external evidence guide as freshness-ignored",
  );
  assert(
    manifest.includes("freshness_ignored_directory=rehearsal-command-plan/"),
    "manifest should list rehearsal command plan as freshness-ignored",
  );
  assert(
    manifest.includes("freshness_ignored_directory=interim-review/"),
    "manifest should list interim review as freshness-ignored",
  );
  assert(
    manifest.includes("freshness_ignored_directory=data-snapshot-checklist/"),
    "manifest should list data snapshot checklist as freshness-ignored",
  );
  assert(
    manifest.includes("freshness_ignored_directory=deployment-checklist/"),
    "manifest should list deployment checklist as freshness-ignored",
  );
  assert(
    manifest.includes("freshness_ignored_directory=uat-checklist/"),
    "manifest should list UAT execution checklist as freshness-ignored",
  );
  assert(
    manifest.includes("freshness_ignored_directory=enablement-checklist/"),
    "manifest should list enablement checklist as freshness-ignored",
  );
  assert(
    manifest.includes("freshness_ignored_directory=signed-evidence-checklist/"),
    "manifest should list signed evidence checklist as freshness-ignored",
  );
  assert(
    manifest.includes("uat-status/uat-status-"),
    "manifest should include UAT status artifacts as source evidence",
  );
  assert(
    finalManifestRequiredPatterns.some(
      (pattern) => pattern.source === "backups\\/ogfi-erp-.*\\.dump\\.sha256",
    ),
    "manifest contract should require backup checksum evidence",
  );
  for (const expectedPattern of [
    "external-security\\/mfa-provider-enrollment-and-runtime-proof\\..+",
    "external-security\\/idp-session-invalidation-proof\\..+",
    "external-security\\/vault-or-artifact-storage-index\\..+",
    "external-security\\/break-glass-review-and-revocation-proof\\..+",
  ]) {
    assert(
      finalManifestRequiredPatterns.some((pattern) => pattern.source === expectedPattern),
      `manifest contract should require external security evidence: ${expectedPattern}`,
    );
  }
  assert(
    manifest.includes("signed-evidence-status/signed-evidence-status-"),
    "manifest should include signed evidence status artifacts as source evidence",
  );
  assert(
    !manifest.includes("freshness_ignored_directory=uat-status/"),
    "manifest must not treat UAT status as freshness-ignored",
  );
  assert(
    !manifest.includes("freshness_ignored_directory=deployment-status/"),
    "manifest must not treat deployment status as freshness-ignored",
  );
  assert(
    readFileSync("scripts/release-final-review-status.mjs", "utf8").includes(
      "evaluateManifestChecksum",
    ) &&
      readFileSync("scripts/release-go-no-go.mjs", "utf8").includes(
        "evaluateManifestChecksum",
      ),
    "final review and GO / NO-GO should verify manifest checksum sidecars",
  );
  evidenceLines.push(
    "PASS | Evidence manifest records file checksums and a verified manifest checksum sidecar.",
  );
}

function testEvidenceManifestFreshness() {
  evidenceLines.push("CHECK | Evidence manifest freshness");
  const manifestFile = readdirSync(join(evidenceRoot, "manifests"))
    .filter((file) => /^release-evidence-manifest-.*\.txt$/.test(file))
    .sort()
    .at(-1);
  assert(manifestFile, "release evidence manifest artifact missing");

  const manifestPath = join(evidenceRoot, "manifests", manifestFile);
  const freshResult = evaluateManifestFreshness(evidenceRoot, manifestPath);
  assert(freshResult.pass, `manifest should initially be fresh: ${freshResult.detail}`);

  const generatedStatusFile = join(
    evidenceRoot,
    "final-review-status",
    "freshness-generated-status-self-test.txt",
  );
  writeFileSync(generatedStatusFile, "generated status after manifest\n");
  const generatedFuture = new Date(Date.now() + 30_000);
  utimesSync(generatedStatusFile, generatedFuture, generatedFuture);

  const generatedReportResult = evaluateManifestFreshness(evidenceRoot, manifestPath);
  assert(
    generatedReportResult.pass,
    `manifest freshness should ignore generated status reports: ${generatedReportResult.detail}`,
  );

  const changedEvidenceFile = join(
    evidenceRoot,
    "signed-documents",
    "freshness-self-test.txt",
  );
  writeFileSync(changedEvidenceFile, "changed after manifest\n");
  const future = new Date(Date.now() + 60_000);
  utimesSync(changedEvidenceFile, future, future);

  const staleResult = evaluateManifestFreshness(evidenceRoot, manifestPath);
  assert(
    !staleResult.pass &&
      staleResult.detail.includes("signed-documents/freshness-self-test.txt"),
    `manifest freshness should detect changed evidence: ${staleResult.detail}`,
  );
  evidenceLines.push(
    "PASS | Evidence manifest freshness ignores generated status reports and detects changed evidence.",
  );
}

async function testSmokeReport() {
  evidenceLines.push("CHECK | Smoke report");
  const server = createServer((request, response) => {
    if (
      request.url === "/api/health" ||
      request.url === "/api/readiness" ||
      request.url === "/health" ||
      request.url === "/readiness" ||
      request.url === "/sign-in"
    ) {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
      return;
    }

    if (request.url === "/items") {
      response.writeHead(307, { location: "/sign-in" });
      response.end();
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    const smokeOutputDir = join(evidenceRoot, "smoke-self-test");
    const output = await runNodeScriptAsync("scripts/release-smoke.mjs", {
      SMOKE_BASE_URL: `http://127.0.0.1:${address.port}`,
      SMOKE_OUTPUT_DIR: smokeOutputDir,
    });

    assert(
      output.includes("protected-items-route /items expected=3xx actual=307"),
      "smoke output should verify protected-route redirect",
    );
    assert(
      readdirSync(smokeOutputDir).some((file) => /^smoke-.*\.txt$/.test(file)),
      "smoke evidence artifact missing",
    );
    evidenceLines.push(
      "PASS | Smoke report checks health, readiness, sign-in, and protected-route redirect.",
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function runNodeScript(scriptPath, env) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: workspaceRoot,
    env: childProcessEnv(env),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `${scriptPath} failed with exit code ${result.status}`,
        result.stdout,
        result.stderr,
      ].join("\n"),
    );
  }

  return `${result.stdout}${result.stderr}`;
}

function withTemporaryEnv(env, callback) {
  const previous = new Map(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );

  try {
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value;
    }
    return callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function assertCommandOrder(output, expectedLines) {
  let previousIndex = -1;
  for (const expectedLine of expectedLines) {
    const index = output.indexOf(expectedLine);
    assert(index !== -1, `missing expected command line: ${expectedLine}`);
    assert(
      index > previousIndex,
      `expected command line out of order: ${expectedLine}`,
    );
    previousIndex = index;
  }
}

function runNodeScriptAsync(scriptPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: workspaceRoot,
      env: childProcessEnv(env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }

      reject(
        new Error(`${scriptPath} failed with exit code ${code}\n${output}`),
      );
    });
  });
}

function childProcessEnv(overrides) {
  const env = { ...process.env };
  for (const [name, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) {
      delete env[name];
    } else {
      env[name] = value;
    }
  }
  return env;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
