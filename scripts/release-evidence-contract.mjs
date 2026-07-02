export const finalManifestRequiredContent = [
  "RESULT | PASS | Release evidence manifest captured.",
  "build-check/build-check-",
  "secret-review/secret-review-",
  "release-summary-preflight-",
  "release-summary.txt",
  "self-tests/release-tools-self-test-",
  "data-snapshots/data-snapshot-preflight-",
  "data-snapshots/data-pre-migration-rehearsal-",
  "data-snapshots/data-post-migration-rehearsal-",
  "data-snapshots/data-snapshot-delta-",
  "data-snapshot-status/data-snapshot-status-",
  "backups/backup-restore-preflight-",
  "backups/ogfi-erp-",
  "backups/backup-summary.txt",
  "backups/restore-check-summary.txt",
  "backup-restore-status/backup-restore-status-",
  "deployment-status/deployment-status-",
  "pilot-readiness/pilot-readiness-preflight-",
  "uat-status/uat-status-",
  "pilot-uat-status/pilot-uat-status-",
  "enablement-status/enablement-status-",
  "smoke/smoke-",
  "staging-rollback/rollback-summary.txt",
  "staging-rollback/smoke/smoke-",
  "signed-documents/uat-evidence-pack.md",
  "signed-documents/deployment-rollback-evidence.md",
  "signed-documents/training-impact-assessment.md",
  "signed-evidence-status/signed-evidence-status-",
];

export const finalManifestRequiredPatterns = [
  /backups\/ogfi-erp-.*\.dump\.sha256/,
  /pilot-readiness\/pilot-readiness-(?!preflight).*\.txt/,
];

export const finalManifestFreshnessIgnoredDirectories = [
  "blocker-digest",
  "data-snapshot-checklist",
  "deployment-checklist",
  "enablement-checklist",
  "external-evidence-guide",
  "final-review-status",
  "go-no-go",
  "manifests",
  "milestones",
  "pending-evidence-checklist",
  "release-metadata",
  "rehearsal-command-plan",
  "signed-evidence-checklist",
  "status-suite",
  "interim-review",
  "uat-checklist",
];

export const finalManifestFreshnessIgnorePatterns =
  finalManifestFreshnessIgnoredDirectories.map(
    (directory) => new RegExp(`^${escapeRegExp(directory)}/`),
  );

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
