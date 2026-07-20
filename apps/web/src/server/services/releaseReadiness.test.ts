import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  defaultReleaseReadinessGates,
  releaseReadinessCategories,
  summarizeDeploymentEvidence,
  summarizeEnablementEvidence,
  summarizeReleaseReadiness,
  summarizeUatEvidence,
  uatWorkflowAreaOptions
} from "./releaseReadiness";

describe("release readiness gates", () => {
  test("includes required privileged security gates before production use", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "releaseReadiness.ts"), "utf8");
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/readiness/page.tsx"),
      "utf8"
    );
    const exportRouteSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/readiness/export/route.ts"),
      "utf8"
    );
    const exportAuthorizationSource = readFileSync(
      path.resolve(__dirname, "exportAuthorization.ts"),
      "utf8"
    );
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(releaseReadinessCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "security",
          label: "Security controls"
        })
      ])
    );

    expect(defaultReleaseReadinessGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateKey: "security.privileged_mfa_enrollment",
          category: "security",
          ownerRole: "IT / Security",
          description: expect.stringContaining("MFA preflight")
        }),
        expect.objectContaining({
          gateKey: "security.break_glass_control",
          category: "security"
        }),
        expect.objectContaining({
          gateKey: "security.session_revalidation",
          category: "security"
        }),
        expect.objectContaining({
          gateKey: "security.controlled_access_requests",
          category: "security",
          ownerRole: "IT / Security / Product Owner"
        })
      ])
    );
    expect(serviceSource).toContain("getReleaseSecurityEvidenceSummary");
    expect(serviceSource).toContain("assertSecurityGateReadyEvidence");
    expect(serviceSource).toContain("assertDeploymentGateReadyEvidence");
    expect(serviceSource).toContain("RELEASE_READINESS_SECURITY_EVIDENCE_UNRESOLVED");
    expect(serviceSource).toContain("RELEASE_READINESS_DEPLOYMENT_EVIDENCE_UNRESOLVED");
    expect(serviceSource).toContain("pendingProviderInvalidationCount");
    expect(serviceSource).toContain("pendingControlledAccessRequestCount");
    expect(serviceSource).toContain("pendingHighRiskScopeRequestCount");
    expect(serviceSource).toContain("pendingSensitiveRoleRequestCount");
    expect(serviceSource).toContain("breakGlassPostReviewDueCount");
    expect(serviceSource).toContain("readyForStrictMfa");
    expect(serviceSource).toContain("activeAssignmentWindowFilter");
    expect(serviceSource).toContain("startsAt: { lte: now }");
    expect(serviceSource).toContain("OR: [{ endsAt: null }, { endsAt: { gt: now } }]");
    expect(serviceSource).toContain("listDeploymentEvidenceRecords");
    expect(serviceSource).toContain("summarizeDeploymentEvidence");
    expect(serviceSource).toContain("createDeploymentEvidenceRecord");
    expect(serviceSource).toContain("listEnablementEvidenceRecords");
    expect(serviceSource).toContain("summarizeEnablementEvidence");
    expect(serviceSource).toContain("createEnablementEvidenceRecord");
    expect(serviceSource).toContain("assertEnablementGateReadyEvidence");
    expect(serviceSource).toContain("listUatEvidenceRecords");
    expect(serviceSource).toContain("summarizeUatEvidence");
    expect(serviceSource).toContain("createUatEvidenceRecord");
    expect(serviceSource).toContain("assertUatGateReadyEvidence");
    expect(serviceSource).toContain("listReleaseBoardDecisions");
    expect(serviceSource).toContain("createReleaseBoardDecision");
    expect(serviceSource).toContain("assertGoNoGoGateDecision");
    expect(pageSource).toContain("securityEvidenceSummary");
    expect(pageSource).toContain("deploymentEvidenceSummary");
    expect(pageSource).toContain("enablementEvidenceSummary");
    expect(pageSource).toContain("uatEvidenceSummary");
    expect(pageSource).toContain("Record Deployment Evidence");
    expect(pageSource).toContain("Record Enablement Evidence");
    expect(pageSource).toContain("Record UAT Evidence");
    expect(pageSource).toContain("Record Release Board Decision");
    expect(pageSource).toContain("Export Readiness Register");
    expect(pageSource).toContain("X-OGFI-CSV-SHA256");
    expect(pageSource).toContain("Download SHA-256");
    expect(pageSource).toContain("format=sha256");
    expect(pageSource).toContain("pending external invalidation");
    expect(pageSource).toContain("open or post-review due");
    expect(pageSource).toContain("pending role or scope request");
    expect(pageSource).toContain("Controlled access requests need review");
    expect(pageSource).toContain("Final release proof targets");
    expect(pageSource).toContain("RESULT | PASS | External security");
    expect(pageSource).toContain("mfa-provider-enrollment-and-runtime-proof.*");
    expect(pageSource).toContain("idp-session-invalidation-proof.*");
    expect(pageSource).toContain("vault-or-artifact-storage-index.*");
    expect(pageSource).toContain("break-glass-review-and-revocation-proof.*");
    expect(serviceSource).toContain("buildReleaseReadinessExportRows");
    expect(serviceSource).toContain("Security proof target");
    expect(serviceSource).toContain(
      "external-security/mfa-provider-enrollment-and-runtime-proof.<approved-extension>"
    );
    expect(serviceSource).toContain(
      "external-security/idp-session-invalidation-proof.<approved-extension>"
    );
    expect(serviceSource).toContain(
      "external-security/vault-or-artifact-storage-index.<approved-extension>"
    );
    expect(serviceSource).toContain(
      "external-security/break-glass-review-and-revocation-proof.<approved-extension>"
    );
    expect(serviceSource).toContain("RESULT | PASS | External security proof captured.");
    expect(exportAuthorizationSource).toContain("canExportReleaseReadiness");
    expect(exportRouteSource).toContain("release-readiness-register.csv");
    expect(exportRouteSource).toContain("checksumHeader: true");
    expect(exportRouteSource).toContain("format === \"sha256\"");
    expect(exportRouteSource).toContain("csvExportBody");
    expect(exportRouteSource).toContain("csvSha256");
    expect(exportRouteSource).toContain("report.export_denied");
    expect(exportRouteSource).toContain("report.export_started");
    expect(exportRouteSource).toContain("report.export_completed");
    expect(exportRouteSource).toContain("logOperationalExportFailure");
    expect(feedbackSource).toContain("RELEASE_READINESS_SECURITY_EVIDENCE_UNRESOLVED");
    expect(feedbackSource).toContain("RELEASE_READINESS_DEPLOYMENT_EVIDENCE_UNRESOLVED");
    expect(feedbackSource).toContain("RELEASE_READINESS_ENABLEMENT_EVIDENCE_UNRESOLVED");
    expect(feedbackSource).toContain("RELEASE_READINESS_UAT_EVIDENCE_UNRESOLVED");
    expect(feedbackSource).toContain("RELEASE_BOARD_GO_DECISION_REQUIRED");
    expect(feedbackSource).toContain("RELEASE_BOARD_WAIVER_DECISION_REQUIRED");
  });

  test("deployment evidence register is additive and verifies required release artifacts", () => {
    const schemaSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260707183000_deployment_evidence_records/migration.sql"
      ),
      "utf8"
    );
    const serviceSource = readFileSync(path.resolve(__dirname, "releaseReadiness.ts"), "utf8");

    expect(schemaSource).toContain("model DeploymentEvidenceRecord");
    expect(migrationSource).toContain('CREATE TABLE "DeploymentEvidenceRecord"');
    expect(migrationSource).toContain("DeploymentEvidenceRecord_type_check");
    expect(migrationSource).toContain("'RESTORE_REHEARSAL'");
    expect(migrationSource).toContain("'MONITORING_HYPERCARE'");
    expect(serviceSource).toContain('"MIGRATION"');
    expect(serviceSource).toContain('"BACKUP"');
    expect(serviceSource).toContain('"RESTORE_REHEARSAL"');
    expect(serviceSource).toContain('"ROLLBACK_PLAN"');
    expect(serviceSource).toContain('"SMOKE_TEST"');
    expect(serviceSource).toContain('"MONITORING_HYPERCARE"');
    expect(serviceSource).toContain("DEPLOYMENT_EVIDENCE_SELF_VERIFICATION_BLOCKED");
  });

  test("release board decision register records DEC-0036 GO/NO-GO outcomes", () => {
    const schemaSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260707190000_release_board_decisions/migration.sql"
      ),
      "utf8"
    );
    const serviceSource = readFileSync(path.resolve(__dirname, "releaseReadiness.ts"), "utf8");

    expect(schemaSource).toContain("model ReleaseBoardDecision");
    expect(migrationSource).toContain('CREATE TABLE "ReleaseBoardDecision"');
    expect(migrationSource).toContain("'GO'");
    expect(migrationSource).toContain("'CONDITIONAL_GO'");
    expect(migrationSource).toContain("'HOLD'");
    expect(migrationSource).toContain("'ROLLBACK'");
    expect(migrationSource).toContain("'FORWARD_FIX'");
    expect(serviceSource).toContain("RELEASE_BOARD_READY_GATES_REQUIRED");
    expect(serviceSource).toContain("RELEASE_BOARD_DECISION_REQUIRED");
    expect(serviceSource).toContain("RELEASE_BOARD_WAIVER_DECISION_REQUIRED");
    expect(serviceSource).toContain('status !== "READY" && status !== "CONDITIONAL_GO" && status !== "WAIVED"');
  });

  test("enablement evidence register verifies training and release-note readiness", () => {
    const schemaSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260707193000_enablement_evidence_records/migration.sql"
      ),
      "utf8"
    );
    const serviceSource = readFileSync(path.resolve(__dirname, "releaseReadiness.ts"), "utf8");

    expect(schemaSource).toContain("model EnablementEvidenceRecord");
    expect(migrationSource).toContain('CREATE TABLE "EnablementEvidenceRecord"');
    expect(migrationSource).toContain("'TRAINING_SIGNOFF'");
    expect(migrationSource).toContain("'KNOWN_LIMIT_ACKNOWLEDGEMENT'");
    expect(migrationSource).toContain("'SUPPORT_ROUTE_CONFIRMATION'");
    expect(migrationSource).toContain("'KB_REVIEW'");
    expect(migrationSource).toContain("'RELEASE_NOTES_REVIEW'");
    expect(migrationSource).toContain("'TRAINING_IMPACT_ASSESSMENT'");
    expect(serviceSource).toContain("ENABLEMENT_EVIDENCE_SELF_VERIFICATION_BLOCKED");
    expect(serviceSource).toContain("knownLimitAcknowledged");
    expect(serviceSource).toContain("supportRouteConfirmed");
  });

  test("UAT evidence register verifies scenario, defect, policy, and signoff readiness", () => {
    const schemaSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260707200000_uat_evidence_records/migration.sql"
      ),
      "utf8"
    );
    const serviceSource = readFileSync(path.resolve(__dirname, "releaseReadiness.ts"), "utf8");

    expect(schemaSource).toContain("model UatEvidenceRecord");
    expect(migrationSource).toContain('CREATE TABLE "UatEvidenceRecord"');
    expect(migrationSource).toContain("'SCENARIO_EXECUTION'");
    expect(migrationSource).toContain("'DEFECT_DISPOSITION'");
    expect(migrationSource).toContain("'POLICY_VERSION_TRACE'");
    expect(migrationSource).toContain("'ACCEPTANCE_MATRIX'");
    expect(migrationSource).toContain("'DEFAULT_REVISION_REGISTER'");
    expect(migrationSource).toContain("'RETEST_PASS'");
    expect(serviceSource).toContain("UAT_EVIDENCE_SELF_VERIFICATION_BLOCKED");
    expect(serviceSource).toContain("unresolvedResultCount");
  });

  test("pilot readiness tooling checks DEC-0036 evidence registers", () => {
    const pilotCheckSource = readFileSync(
      path.resolve(__dirname, "../../../../../scripts/pilot-readiness-check.mjs"),
      "utf8"
    );
    const preflightSource = readFileSync(
      path.resolve(__dirname, "../../../../../scripts/pilot-readiness-preflight.mjs"),
      "utf8"
    );
    const milestoneSource = readFileSync(
      path.resolve(__dirname, "../../../../../scripts/release-milestone-status.mjs"),
      "utf8"
    );

    expect(preflightSource).toContain("PILOT_MIN_UAT_EVIDENCE_RECORDS");
    expect(preflightSource).toContain("PILOT_MIN_RELEASE_BOARD_DECISIONS");
    expect(pilotCheckSource).toContain("DEC-0036 release readiness registers");
    expect(pilotCheckSource).toContain("UatEvidenceRecord");
    expect(pilotCheckSource).toContain("DeploymentEvidenceRecord");
    expect(pilotCheckSource).toContain("EnablementEvidenceRecord");
    expect(pilotCheckSource).toContain("ReleaseBoardDecision");
    expect(pilotCheckSource).toContain("PILOT_MIN_VERIFIED_UAT_EVIDENCE_RECORDS");
    expect(pilotCheckSource).toContain(
      "PILOT_MIN_VERIFIED_DEPLOYMENT_EVIDENCE_RECORDS"
    );
    expect(pilotCheckSource).toContain(
      "PILOT_MIN_VERIFIED_ENABLEMENT_EVIDENCE_RECORDS"
    );
    expect(preflightSource).toContain("PILOT_REQUIRE_RELEASE_GATES_READY");
    expect(pilotCheckSource).toContain("PILOT_REQUIRE_RELEASE_GATES_READY");
    expect(pilotCheckSource).toContain("DEC-0036 strict release gate status");
    expect(pilotCheckSource).toContain("Required release readiness gates not accepted");
    expect(pilotCheckSource).toContain(
      "GO / NO-GO ready gate missing GO board decision"
    );
    expect(pilotCheckSource).toContain(
      "GO / NO-GO conditional gate missing Conditional GO board decision"
    );
    expect(pilotCheckSource).toContain(
      "GO / NO-GO waived gate missing Hold board decision"
    );
    expect(pilotCheckSource).toContain(
      "Conditional or waived release gates missing decision note"
    );
    expect(milestoneSource).toContain("UAT evidence register table");
    expect(milestoneSource).toContain("Release Board decision register table");
  });

  test("release evidence guides require ERP readiness register recording", () => {
    const pendingChecklistSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../scripts/release-pending-evidence-checklist.mjs"
      ),
      "utf8"
    );
    const externalGuideSource = readFileSync(
      path.resolve(__dirname, "../../../../../scripts/release-external-evidence-guide.mjs"),
      "utf8"
    );
    const signedTemplateSource = readFileSync(
      path.resolve(__dirname, "../../../../../scripts/release-signed-evidence-templates.mjs"),
      "utf8"
    );
    const goNoGoSource = readFileSync(
      path.resolve(__dirname, "../../../../../scripts/release-go-no-go.mjs"),
      "utf8"
    );
    const readinessKbSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../docs/knowledge-base/administration/managing-release-readiness-gates.md"
      ),
      "utf8"
    );
    const trainingAssessmentSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../docs/core/08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md"
      ),
      "utf8"
    );
    const adminTrainingSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../docs/training/phase-i-administrator-setup-guide.md"
      ),
      "utf8"
    );
    const adminKbIndexSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../docs/knowledge-base/administration/README.md"
      ),
      "utf8"
    );
    const trainingIndexSource = readFileSync(
      path.resolve(__dirname, "../../../../../docs/training/README.md"),
      "utf8"
    );

    expect(pendingChecklistSource).toContain("ERP Admin > Release Readiness > UAT evidence");
    expect(pendingChecklistSource).toContain(
      "ERP Admin > Release Readiness > Deployment controls"
    );
    expect(pendingChecklistSource).toContain("ERP Admin > Release Readiness > Enablement");
    expect(pendingChecklistSource).toContain("ERP Admin > Release Readiness > GO / NO-GO");
    expect(externalGuideSource).toContain("ERP REGISTER | UAT evidence");
    expect(externalGuideSource).toContain("ERP REGISTER | Release Board decision");
    expect(signedTemplateSource).toContain("ERP readiness register record IDs reviewed");
    expect(goNoGoSource).toContain("final board decision must be recorded");
    expect(readinessKbSource).toContain("External Security Proof References");
    expect(readinessKbSource).toContain(
      "external-security/mfa-provider-enrollment-and-runtime-proof.*"
    );
    expect(readinessKbSource).toContain(
      "RESULT | PASS | External security proof captured."
    );
    expect(readinessKbSource).toContain("X-OGFI-CSV-SHA256");
    expect(readinessKbSource).toContain("release-readiness-register-*.csv.sha256");
    expect(trainingAssessmentSource).toContain(
      "external-security proof references"
    );
    expect(adminTrainingSource).toContain("Admin > Release Readiness");
    expect(adminTrainingSource).toContain(
      "external-security/mfa-provider-enrollment-and-runtime-proof.*"
    );
    expect(adminTrainingSource).toContain(
      "which release-readiness evidence belongs in the ERP register"
    );
    expect(adminKbIndexSource).toContain("external-security proof references");
    expect(adminKbIndexSource).toContain("Managing Privileged MFA Evidence");
    expect(adminKbIndexSource).toContain("Session Invalidation And Reauthentication");
    expect(trainingIndexSource).toContain("external-security proof references");
  });

  test("admin readiness page renders every readiness category as a tab", () => {
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/readiness/page.tsx"),
      "utf8"
    );

    expect(pageSource).toContain("releaseReadinessCategories.map");
    expect(pageSource).toContain("lg:grid-cols-5");
    expect(pageSource).toContain("owner signoff");
    expect(pageSource).toContain("default revision");
  });

  test("UAT gates require evidence and decision notes for acceptance/default revision tracking", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "releaseReadiness.ts"), "utf8");
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(defaultReleaseReadinessGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateKey: "uat.acceptance_matrix_signed",
          category: "uat",
          policyFlag: "uatRequired"
        }),
        expect.objectContaining({
          gateKey: "uat.default_revision_register",
          category: "uat",
          policyFlag: "uatRequired"
        }),
        expect.objectContaining({
          gateKey: "uat.phase3_finance_controlled_foundation",
          category: "uat",
          ownerRole: "Finance Owner / QA Lead",
          policyFlag: "uatRequired"
        }),
        expect.objectContaining({
          gateKey: "uat.phase3_workforce_controlled_foundation",
          category: "uat",
          ownerRole: "HR / Workforce Owner / QA Lead",
          policyFlag: "uatRequired"
        }),
        expect.objectContaining({
          gateKey: "uat.phase3_deferred_blockers_reviewed",
          category: "uat",
          ownerRole: "Product Owner / Finance Owner / QA Lead",
          policyFlag: "uatRequired"
        })
      ])
    );
    expect(serviceSource).toContain("requiresDecisionNoteForStatus");
    expect(serviceSource).toContain("RELEASE_READINESS_UAT_SIGNOFF_REQUIRED");
    expect(feedbackSource).toContain("RELEASE_READINESS_UAT_SIGNOFF_REQUIRED");
    expect(serviceSource).toContain("phase3FinanceReady");
    expect(serviceSource).toContain("phase3WorkforceReady");
    expect(serviceSource).toContain("phase3DeferredBlockerReviewReady");
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/readiness/page.tsx"),
      "utf8"
    );
    expect(pageSource).toContain("uatWorkflowAreaOptions");
    expect(serviceSource).toContain("Phase 3 finance controlled foundation");
    expect(serviceSource).toContain("Phase 3 workforce controlled foundation");
    expect(serviceSource).toContain("Phase 3 deferred blocker review");
  });

  test("required security gates keep release blocked until ready, waived, or conditional", () => {
    const gates = defaultReleaseReadinessGates.map((gate) => ({
      id: null,
      gateKey: gate.gateKey,
      category: gate.category,
      title: gate.title,
      description: gate.description,
      ownerRole: gate.ownerRole,
      status:
        gate.gateKey === "security.privileged_mfa_enrollment"
          ? ("PENDING" as const)
          : ("READY" as const),
      requiredByPolicy: true,
      evidenceReference: null,
      decisionNote: null,
      blockerSummary: null,
      targetDate: null,
      signedOffAt: null,
      sourceDecisionId: "DEC-0036"
    })) as Parameters<typeof summarizeReleaseReadiness>[0];

    expect(summarizeReleaseReadiness(gates)).toMatchObject({
      blocking: 1,
      canProceed: false
    });
  });

  test("policy-disabled release gates do not block readiness summaries", () => {
    const gates = defaultReleaseReadinessGates.map((gate) => ({
      id: null,
      gateKey: gate.gateKey,
      category: gate.category,
      title: gate.title,
      description: gate.description,
      ownerRole: gate.ownerRole,
      status:
        gate.gateKey === "uat.scenario_execution"
          ? ("PENDING" as const)
          : ("READY" as const),
      requiredByPolicy: gate.gateKey !== "uat.scenario_execution",
      evidenceReference: null,
      decisionNote: null,
      blockerSummary: null,
      targetDate: null,
      signedOffAt: null,
      sourceDecisionId: "DEC-0036"
    })) as Parameters<typeof summarizeReleaseReadiness>[0];

    expect(summarizeReleaseReadiness(gates)).toMatchObject({
      total: defaultReleaseReadinessGates.length,
      required: defaultReleaseReadinessGates.length - 1,
      blocking: 0,
      canProceed: true
    });
  });

  test("security readiness allows companies with no sensitive privileged users", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "releaseReadiness.ts"), "utf8");

    expect(serviceSource).toContain("readyForStrictMfa:");
    expect(serviceSource).not.toContain("privilegedUsers.length > 0 &&");
  });

  test("evidence summaries only treat verified records as gate-ready proof", () => {
    const deploymentRecords = [
      { evidenceType: "MIGRATION", verificationStatus: "VERIFIED" },
      { evidenceType: "BACKUP", verificationStatus: "VERIFIED" },
      { evidenceType: "RESTORE_REHEARSAL", verificationStatus: "VERIFIED" },
      { evidenceType: "ROLLBACK_PLAN", verificationStatus: "VERIFIED" },
      { evidenceType: "SMOKE_TEST", verificationStatus: "RECORDED" },
      { evidenceType: "MONITORING_HYPERCARE", verificationStatus: "REJECTED" }
    ] as Parameters<typeof summarizeDeploymentEvidence>[0];

    expect(summarizeDeploymentEvidence(deploymentRecords)).toMatchObject({
      migrationGateReady: false,
      monitoringGateReady: false,
      missingMigrationGateTypes: ["SMOKE_TEST"],
      missingMonitoringGateTypes: ["MONITORING_HYPERCARE"]
    });

    const enablementRecords = [
      {
        evidenceType: "TRAINING_SIGNOFF",
        verificationStatus: "VERIFIED",
        knownLimitAcknowledged: true,
        supportRouteConfirmed: true
      },
      { evidenceType: "KB_REVIEW", verificationStatus: "VERIFIED" },
      { evidenceType: "RELEASE_NOTES_REVIEW", verificationStatus: "RECORDED" },
      { evidenceType: "TRAINING_IMPACT_ASSESSMENT", verificationStatus: "REJECTED" }
    ] as Parameters<typeof summarizeEnablementEvidence>[0];

    expect(summarizeEnablementEvidence(enablementRecords)).toMatchObject({
      trainingGateReady: true,
      kbGateReady: false,
      missingTrainingGateTypes: [],
      missingKbGateTypes: [
        "RELEASE_NOTES_REVIEW",
        "TRAINING_IMPACT_ASSESSMENT"
      ]
    });

    const uatRecords = [
      { evidenceType: "SCENARIO_EXECUTION", verificationStatus: "VERIFIED", result: "PASS" },
      { evidenceType: "DEFECT_DISPOSITION", verificationStatus: "VERIFIED", result: "FAIL" },
      { evidenceType: "POLICY_VERSION_TRACE", verificationStatus: "VERIFIED", result: "PASS" },
      { evidenceType: "ACCEPTANCE_MATRIX", verificationStatus: "RECORDED", result: "PASS" },
      {
        evidenceType: "DEFAULT_REVISION_REGISTER",
        verificationStatus: "VERIFIED",
        result: "RETEST_PASS"
      }
    ] as Parameters<typeof summarizeUatEvidence>[0];

    expect(summarizeUatEvidence(uatRecords)).toMatchObject({
      ready: false,
      unresolvedResultCount: 1,
      missingTypes: ["ACCEPTANCE_MATRIX"],
      phase3FinanceReady: false,
      phase3WorkforceReady: false,
      phase3DeferredBlockerReviewReady: false
    });

    const phase3UatRecords = [
      {
        evidenceType: "SCENARIO_EXECUTION",
        verificationStatus: "VERIFIED",
        result: "PASS",
        workflowArea: "Phase 3 finance controlled foundation"
      },
      {
        evidenceType: "ACCEPTANCE_MATRIX",
        verificationStatus: "VERIFIED",
        result: "PASS",
        workflowArea: "Phase 3 finance controlled foundation"
      },
      {
        evidenceType: "SCENARIO_EXECUTION",
        verificationStatus: "VERIFIED",
        result: "RETEST_PASS",
        workflowArea: "Phase 3 workforce controlled foundation"
      },
      {
        evidenceType: "ACCEPTANCE_MATRIX",
        verificationStatus: "VERIFIED",
        result: "PASS",
        workflowArea: "Phase 3 workforce controlled foundation"
      },
      {
        evidenceType: "DEFECT_DISPOSITION",
        verificationStatus: "VERIFIED",
        result: "WAIVED",
        workflowArea: "Phase 3 deferred blocker review"
      },
      {
        evidenceType: "DEFAULT_REVISION_REGISTER",
        verificationStatus: "VERIFIED",
        result: "PASS",
        workflowArea: "Phase 3 deferred blocker review"
      }
    ] as Parameters<typeof summarizeUatEvidence>[0];

    expect(summarizeUatEvidence(phase3UatRecords)).toMatchObject({
      phase3FinanceReady: true,
      phase3WorkforceReady: true,
      phase3DeferredBlockerReviewReady: true
    });
  });

  test("Phase 3 UAT readiness requires exact workflow-area selections", () => {
    expect(uatWorkflowAreaOptions).toEqual(
      expect.arrayContaining([
        "Phase 3 finance controlled foundation",
        "Phase 3 workforce controlled foundation",
        "Phase 3 deferred blocker review"
      ])
    );

    const vaguePhase3Records = [
      {
        evidenceType: "SCENARIO_EXECUTION",
        verificationStatus: "VERIFIED",
        result: "PASS",
        workflowArea: "Budget, expense, AP payment, bank, and period close",
        notes: "Phase 3 finance controlled foundation covered."
      },
      {
        evidenceType: "ACCEPTANCE_MATRIX",
        verificationStatus: "VERIFIED",
        result: "PASS",
        workflowArea: "AP payment bank period close"
      },
      {
        evidenceType: "SCENARIO_EXECUTION",
        verificationStatus: "VERIFIED",
        result: "PASS",
        workflowArea: "Employee assignment, leave, overtime, attendance, and compliance"
      },
      {
        evidenceType: "ACCEPTANCE_MATRIX",
        verificationStatus: "VERIFIED",
        result: "PASS",
        workflowArea: "Workforce schedule and attendance"
      },
      {
        evidenceType: "DEFECT_DISPOSITION",
        verificationStatus: "VERIFIED",
        result: "WAIVED",
        workflowArea: "Skipped blocker register"
      },
      {
        evidenceType: "DEFAULT_REVISION_REGISTER",
        verificationStatus: "VERIFIED",
        result: "PASS",
        workflowArea: "Production blocker review"
      }
    ] as Parameters<typeof summarizeUatEvidence>[0];

    expect(summarizeUatEvidence(vaguePhase3Records)).toMatchObject({
      phase3FinanceReady: false,
      phase3WorkforceReady: false,
      phase3DeferredBlockerReviewReady: false
    });
  });
});
