import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const requiredSources = [
  source("Release summary preflight", ".", /^release-summary-preflight-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("Release candidate summary", ".", /^release-summary\.txt$/, [
    /^evidence_run_id=(.+)$/m,
  ]),
  source("Data snapshot preflight", "data-snapshots", /^data-snapshot-preflight-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("Pre-migration data snapshot", "data-snapshots", /^data-pre-migration-rehearsal-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("Post-migration data snapshot", "data-snapshots", /^data-post-migration-rehearsal-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("Data snapshot delta before", "data-snapshots", /^data-snapshot-delta-.*\.txt$/, [
    /^Before evidence run ID: (.+)$/m,
  ]),
  source("Data snapshot delta after", "data-snapshots", /^data-snapshot-delta-.*\.txt$/, [
    /^After evidence run ID: (.+)$/m,
  ]),
  source("Backup summary", "backups", /^backup-summary\.txt$/, [
    /^evidence_run_id=(.+)$/m,
  ]),
  source("Restore-check summary", "backups", /^restore-check-summary\.txt$/, [
    /^evidence_run_id=(.+)$/m,
  ]),
  source("Backup/restore preflight", "backups", /^backup-restore-preflight-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("Rollback summary", "staging-rollback", /^rollback-summary\.txt$/, [
    /^evidence_run_id=(.+)$/m,
  ]),
  source("Deployment status", "deployment-status", /^deployment-status-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("Pilot readiness preflight", "pilot-readiness", /^pilot-readiness-preflight-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("Pilot readiness report", "pilot-readiness", /^pilot-readiness-(?!preflight).*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("UAT status", "uat-status", /^uat-status-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("Enablement status", "enablement-status", /^enablement-status-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
  source("Signed evidence status", "signed-evidence-status", /^signed-evidence-status-.*\.txt$/, [
    /^Evidence run ID: (.+)$/m,
  ]),
];

export function evaluateEvidenceRunConsistency(evidenceRoot, options = {}) {
  const expectedEvidenceRunId = (
    options.expectedEvidenceRunId ??
    process.env.RELEASE_EVIDENCE_RUN_ID ??
    ""
  ).trim();
  const entries = requiredSources.map((item) => readEvidenceRunId(evidenceRoot, item));
  const missing = entries.filter((entry) => !entry.evidenceRunId);
  const invalid = entries.filter((entry) => isPlaceholderEvidenceRunId(entry.evidenceRunId));
  const values = entries
    .filter((entry) => entry.evidenceRunId)
    .map((entry) => entry.evidenceRunId);
  const uniqueValues = [...new Set(values)];

  if (missing.length > 0) {
    return {
      pass: false,
      detail: `missing evidence run ID: ${missing
        .map((entry) => `${entry.label} (${entry.detail})`)
        .join("; ")}`,
    };
  }

  if (isPlaceholderEvidenceRunId(expectedEvidenceRunId)) {
    return {
      pass: false,
      detail: `configured RELEASE_EVIDENCE_RUN_ID is a placeholder: ${expectedEvidenceRunId}`,
    };
  }

  if (invalid.length > 0) {
    return {
      pass: false,
      detail: `placeholder evidence run ID: ${invalid
        .map((entry) => `${entry.label} (${entry.detail})=${entry.evidenceRunId}`)
        .join("; ")}`,
    };
  }

  if (uniqueValues.length > 1) {
    return {
      pass: false,
      detail: entries
        .map((entry) => `${entry.label}=${entry.evidenceRunId}`)
        .join(" | "),
    };
  }

  if (expectedEvidenceRunId && uniqueValues[0] !== expectedEvidenceRunId) {
    return {
      pass: false,
      detail: `configured RELEASE_EVIDENCE_RUN_ID=${expectedEvidenceRunId} does not match collected evidence: ${entries
        .map((entry) => `${entry.label}=${entry.evidenceRunId}`)
        .join(" | ")}`,
    };
  }

  return {
    pass: true,
    detail: `evidence_run_id=${uniqueValues[0]}`,
  };
}

function source(label, directory, pattern, runIdPatterns) {
  return { label, directory, pattern, runIdPatterns };
}

function isPlaceholderEvidenceRunId(value) {
  if (!value) {
    return false;
  }

  return (
    value.includes("<") ||
    value.includes(">") ||
    value.toLowerCase().includes("set-approved-evidence-run-id") ||
    value.toLowerCase().includes("approved-evidence-run-id")
  );
}

function readEvidenceRunId(evidenceRoot, item) {
  const directory = join(evidenceRoot, item.directory);
  if (!existsSync(directory)) {
    return {
      label: item.label,
      evidenceRunId: null,
      detail: `missing directory ${item.directory}`,
    };
  }

  const file = readdirSync(directory)
    .filter((candidate) => item.pattern.test(candidate))
    .sort()
    .at(-1);
  if (!file) {
    return {
      label: item.label,
      evidenceRunId: null,
      detail: `missing artifact ${item.directory}/${item.pattern.source}`,
    };
  }

  const content = readFileSync(join(directory, file), "utf8");
  for (const pattern of item.runIdPatterns) {
    const value = pattern.exec(content)?.[1]?.trim();
    if (value) {
      return {
        label: item.label,
        evidenceRunId: value,
        detail: `${item.directory}/${file}`,
      };
    }
  }

  return {
    label: item.label,
    evidenceRunId: null,
    detail: `${item.directory}/${file}`,
  };
}
