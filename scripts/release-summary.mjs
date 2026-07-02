import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  failedMetadataChecks,
  getReleaseSummaryMetadata,
  validateReleaseSummaryMetadata,
} from "./release-summary-metadata.mjs";

const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputFile =
  process.env.RELEASE_SUMMARY_OUTPUT_FILE ??
  join(evidenceRoot, "release-summary.txt");

const metadata = getReleaseSummaryMetadata();
const failedChecks = failedMetadataChecks(
  validateReleaseSummaryMetadata(metadata),
);
if (failedChecks.length > 0) {
  console.error(
    `Release candidate summary metadata is invalid: ${failedChecks.join(", ")}`,
  );
  process.exit(2);
}

const verifiedAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const lines = [
  "OGFI ERP Phase I / Phase 1.5 release candidate summary",
  `evidence_run_id=${metadata.evidenceRunId}`,
  `release_version=${metadata.releaseVersion}`,
  `github_run_id=${metadata.githubRunId}`,
  `github_sha=${metadata.githubSha}`,
  `deploy_to_staging=${metadata.deployToStaging}`,
  `environment=${metadata.environment}`,
  `migration_mode=${metadata.migrationMode}`,
  `verified_at_utc=${verifiedAtUtc}`,
  "RESULT | PASS | Release candidate summary captured.",
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(`Release candidate summary written: ${outputFile}`);
