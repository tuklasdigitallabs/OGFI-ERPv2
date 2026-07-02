import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
const outputFile = join(evidenceRoot, `release-summary-preflight-${timestamp}.txt`);

const metadata = getReleaseSummaryMetadata();
const checks = validateReleaseSummaryMetadata(metadata);
const missing = failedMetadataChecks(checks);
const result =
  missing.length === 0
    ? "RESULT | PASS | Release summary metadata prerequisites are configured."
    : "RESULT | WARN | Release summary metadata prerequisites are incomplete; release-summary.txt was not generated.";

const lines = [
  "OGFI ERP Phase I / Phase 1.5 release summary preflight",
  `Generated UTC: ${timestamp}`,
  "No secrets, database URLs, or raw credential outputs are recorded by this preflight.",
  `Evidence run ID: ${metadata.evidenceRunId || "not-configured"}`,
  `Release version configured: ${metadata.releaseVersion ? "yes" : "no"}`,
  `GitHub run ID configured: ${metadata.githubRunId ? "yes" : "no"}`,
  `GitHub SHA configured: ${metadata.githubSha ? "yes" : "no"}`,
  `Deploy to staging: ${metadata.deployToStaging}`,
  `Environment: ${metadata.environment}`,
  `Migration mode: ${metadata.migrationMode}`,
  "",
  ...checks.map(([label, passed]) => `${passed ? "PASS" : "WARN"} | ${label}`),
  "",
  result,
];

if (missing.length > 0) {
  lines.push(`Missing prerequisites: ${missing.join(", ")}`);
}

mkdirSync(evidenceRoot, { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Release summary preflight evidence written: ${outputFile}`);
