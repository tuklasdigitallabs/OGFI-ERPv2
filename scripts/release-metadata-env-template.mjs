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
  process.env.RELEASE_METADATA_ENV_TEMPLATE_OUTPUT_FILE ??
  join(evidenceRoot, "release-metadata", `release-env-template-${timestamp}.txt`);

const metadata = getReleaseSummaryMetadata();
const checks = validateReleaseSummaryMetadata(metadata);
const failed = failedMetadataChecks(checks);
const packageVersion = readPackageVersion();
const suggestedVersion = packageVersion
  ? `v${packageVersion}-rc.<release-candidate-number>`
  : "<approved-version>";

const templateValues = {
  RELEASE_EVIDENCE_RUN_ID:
    metadata.evidenceRunId || `phase1-phase15-${timestamp.toLowerCase()}`,
  RELEASE_VERSION: metadata.releaseVersion || suggestedVersion,
  GITHUB_RUN_ID: metadata.githubRunId || "<approved-release-workflow-run-id>",
  GITHUB_SHA: metadata.githubSha || "<approved-release-candidate-sha>",
  DEPLOY_TO_STAGING: metadata.deployToStaging || "false",
  RELEASE_ENVIRONMENT: metadata.environment || "staging-rehearsal",
  RELEASE_MIGRATION_MODE: metadata.migrationMode || "prisma-deploy",
};

const lines = [
  "OGFI ERP Phase I / Phase 1.5 release metadata environment template",
  `Generated UTC: ${timestamp}`,
  `Evidence root: ${evidenceRoot}`,
  "",
  "This template is advisory. It does not approve release, expose secrets, generate release-summary.txt, or replace release owner confirmation.",
  "Fill one approved set of values, keep RELEASE_EVIDENCE_RUN_ID constant for the final evidence session, then run the release metadata preflight.",
  "",
  "Current Preflight State",
  ...checks.map(([label, passed]) => `${passed ? "PASS" : "MISSING"} | ${label}`),
  "",
  "Template Values",
  ...Object.entries(templateValues).map(([key, value]) => `${key}=${value}`),
  "",
  "PowerShell",
  ...Object.entries(templateValues).map(
    ([key, value]) => `$env:${key}='${value}'`,
  ),
  "pnpm release:summary-preflight",
  "",
  "cmd.exe",
  ...Object.entries(templateValues).map(([key, value]) => `set ${key}=${value}`),
  "pnpm release:summary-preflight",
  "",
  "POSIX shell",
  ...Object.entries(templateValues).map(([key, value]) => `export ${key}='${value}'`),
  "pnpm release:summary-preflight",
  "",
  "Next Commands",
  "pnpm release:summary-preflight",
  "pnpm release:summary",
  "pnpm release:external-evidence",
  "pnpm release:status-suite",
  "",
  failed.length === 0
    ? "RESULT | READY | Release metadata environment template generated from configured metadata."
    : `RESULT | ACTION REQUIRED | ${failed.length} release metadata value(s) still need owner input before release-summary.txt can be generated.`,
];

if (failed.length > 0) {
  lines.push(`Missing or invalid values: ${failed.join(", ")}`);
}

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Release metadata environment template written: ${outputFile}`);

function readPackageVersion() {
  try {
    return JSON.parse(readFileSync("package.json", "utf8")).version ?? "";
  } catch {
    return "";
  }
}
