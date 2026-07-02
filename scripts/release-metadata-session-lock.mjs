import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  failedMetadataChecks,
  getReleaseSummaryMetadata,
  validateReleaseSummaryMetadata,
} from "./release-summary-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputFile =
  process.env.RELEASE_METADATA_SESSION_LOCK_OUTPUT_FILE ??
  join(evidenceRoot, "release-metadata", `release-session-lock-${timestamp}.txt`);

const metadata = getReleaseSummaryMetadata();
const checks = validateReleaseSummaryMetadata(metadata);
const failed = failedMetadataChecks(checks);
const packageVersion = readPackageVersion();
const result =
  failed.length === 0
    ? "RESULT | READY | Release evidence session metadata is locked for final evidence collection."
    : `RESULT | ACTION REQUIRED | ${failed.length} release metadata value(s) must be approved before the evidence session can be locked.`;

const approvedValues = {
  RELEASE_EVIDENCE_RUN_ID: metadata.evidenceRunId || "<approved-evidence-run-id>",
  RELEASE_VERSION: metadata.releaseVersion || "<approved-release-version>",
  GITHUB_RUN_ID: metadata.githubRunId || "<approved-release-workflow-run-id>",
  GITHUB_SHA: metadata.githubSha || "<approved-release-candidate-sha>",
  DEPLOY_TO_STAGING: metadata.deployToStaging,
  RELEASE_ENVIRONMENT: metadata.environment,
  RELEASE_MIGRATION_MODE: metadata.migrationMode,
};

const lines = [
  "OGFI ERP Phase I / Phase 1.5 release metadata session lock",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${approvedValues.RELEASE_EVIDENCE_RUN_ID}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This artifact is an owner handoff for one final evidence collection session. It does not approve release, create release-summary.txt, execute deployment, or replace GO / NO-GO review.",
  "Use the same RELEASE_EVIDENCE_RUN_ID for release summary, data snapshots, backup/restore, rollback, pilot readiness, UAT status, enablement status, signed evidence status, final manifest, final-review, and GO / NO-GO.",
  "",
  "Current Preflight State",
  ...checks.map(([label, passed]) => `${passed ? "PASS" : "MISSING"} | ${label}`),
  "",
  "Approved Session Values",
  `PACKAGE_VERSION=${packageVersion || "<unavailable>"}`,
  ...Object.entries(approvedValues).map(([key, value]) => `${key}=${value}`),
  "",
  "Final Evidence Session Commands",
  "PowerShell",
  ...Object.entries(approvedValues).map(
    ([key, value]) => `$env:${key}='${value}'`,
  ),
  "pnpm release:summary-preflight",
  "pnpm release:summary",
  "pnpm release:external-evidence",
  "pnpm release:rehearsal-plan",
  "pnpm release:status-suite",
  "",
  "cmd.exe",
  ...Object.entries(approvedValues).map(([key, value]) => `set ${key}=${value}`),
  "pnpm release:summary-preflight",
  "pnpm release:summary",
  "pnpm release:external-evidence",
  "pnpm release:rehearsal-plan",
  "pnpm release:status-suite",
  "",
  "POSIX shell",
  ...Object.entries(approvedValues).map(([key, value]) => `export ${key}='${value}'`),
  "pnpm release:summary-preflight",
  "pnpm release:summary",
  "pnpm release:external-evidence",
  "pnpm release:rehearsal-plan",
  "pnpm release:status-suite",
  "",
  "Final Gate Reminder",
  "Run pnpm release:evidence:manifest only after final source evidence and signed documents are collected.",
  "Then run pnpm release:final-review-status and pnpm release:go-no-go with the same RELEASE_EVIDENCE_RUN_ID.",
  "",
  result,
];

if (failed.length > 0) {
  lines.push(`Missing or invalid values: ${failed.join(", ")}`);
}

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Release metadata session lock written: ${outputFile}`);

function readPackageVersion() {
  try {
    return JSON.parse(readFileSync("package.json", "utf8")).version ?? "";
  } catch {
    return "";
  }
}
