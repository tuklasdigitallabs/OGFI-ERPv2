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
  process.env.RELEASE_METADATA_WORKSHEET_OUTPUT_FILE ??
  join(evidenceRoot, "release-metadata", `release-metadata-worksheet-${timestamp}.txt`);

const metadata = getReleaseSummaryMetadata();
const checks = validateReleaseSummaryMetadata(metadata);
const failed = failedMetadataChecks(checks);
const packageVersion = readPackageVersion();

const lines = [
  "OGFI ERP Phase I / Phase 1.5 release metadata worksheet",
  `Generated UTC: ${timestamp}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This worksheet is advisory. It does not approve release, generate release-summary.txt, or replace release owner confirmation. The final preflight still requires explicit valid metadata.",
  "",
  "Current Metadata",
  `RELEASE_EVIDENCE_RUN_ID=${metadata.evidenceRunId || "<missing>"}`,
  `RELEASE_VERSION=${metadata.releaseVersion || "<missing>"}`,
  `GITHUB_RUN_ID=${metadata.githubRunId || "<missing>"}`,
  `GITHUB_SHA=${metadata.githubSha || "<missing>"}`,
  `DEPLOY_TO_STAGING=${metadata.deployToStaging}`,
  `RELEASE_ENVIRONMENT=${metadata.environment}`,
  `RELEASE_MIGRATION_MODE=${metadata.migrationMode}`,
  "",
  "Suggested Inputs",
  `PACKAGE_VERSION=${packageVersion || "<unavailable>"}`,
  packageVersion
    ? `SUGGESTED_RELEASE_VERSION=v${packageVersion}-rc.<release-candidate-number>`
    : "SUGGESTED_RELEASE_VERSION=<set approved semantic release candidate>",
  "RELEASE_EVIDENCE_RUN_ID=<set one shared release evidence session id>",
  "GITHUB_RUN_ID=<copy from the approved release workflow run>",
  "GITHUB_SHA=<copy full commit SHA from the approved release candidate>",
  "DEPLOY_TO_STAGING=false",
  "RELEASE_ENVIRONMENT=staging-rehearsal",
  "RELEASE_MIGRATION_MODE=prisma-deploy",
  "",
  "Validation Rules",
  "RELEASE_EVIDENCE_RUN_ID is required so final evidence can be tied to one collection session; it must start with a letter or number and may contain letters, numbers, dots, underscores, or hyphens.",
  "RELEASE_VERSION must start with a letter or number and may contain letters, numbers, dots, underscores, or hyphens.",
  "GITHUB_RUN_ID may contain letters, numbers, dots, underscores, or hyphens.",
  "GITHUB_SHA must be a 7 to 40 character hexadecimal commit SHA.",
  "DEPLOY_TO_STAGING must be true or false.",
  "RELEASE_ENVIRONMENT and RELEASE_MIGRATION_MODE must start with a letter or number and may contain letters, numbers, dots, underscores, or hyphens.",
  "",
  "Command Template",
  "PowerShell: $env:RELEASE_EVIDENCE_RUN_ID='<evidence-run-id>'; $env:RELEASE_VERSION='<approved-version>'; $env:GITHUB_RUN_ID='<approved-run-id>'; $env:GITHUB_SHA='<approved-sha>'; pnpm release:summary-preflight",
  "cmd.exe: set RELEASE_EVIDENCE_RUN_ID=<evidence-run-id> && set RELEASE_VERSION=<approved-version> && set GITHUB_RUN_ID=<approved-run-id> && set GITHUB_SHA=<approved-sha> && pnpm release:summary-preflight",
  "POSIX shell: RELEASE_EVIDENCE_RUN_ID=<evidence-run-id> RELEASE_VERSION=<approved-version> GITHUB_RUN_ID=<approved-run-id> GITHUB_SHA=<approved-sha> pnpm release:summary-preflight",
  ".env.release.local: copy the approved non-secret metadata values into .env.release.local, then run LOCAL_ENV_FILES=.env.release.local pnpm release:summary-preflight. Release summary commands read .env.release.local automatically; explicit shell environment variables still override file values.",
  "Never store secrets, DATABASE_URL, database passwords, API tokens, or raw credentials in .env.release.local.",
  "",
  "Preflight Checks",
  ...checks.map(([label, passed]) => `${passed ? "PASS" : "MISSING"} | ${label}`),
  "",
  failed.length === 0
    ? "RESULT | READY | Release metadata is configured for preflight."
    : `RESULT | ACTION REQUIRED | ${failed.length} release metadata value(s) need owner input before release-summary.txt can be generated.`,
];

if (failed.length > 0) {
  lines.push(`Missing or invalid values: ${failed.join(", ")}`);
}

lines.push(
  "",
  "Next Commands",
  "pnpm release:summary-preflight",
  "pnpm release:summary",
  "DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness",
  "pnpm release:evidence:manifest",
  "pnpm release:final-review-status",
);

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Release metadata worksheet written: ${outputFile}`);

function readPackageVersion() {
  try {
    return JSON.parse(readFileSync("package.json", "utf8")).version ?? "";
  } catch {
    return "";
  }
}
