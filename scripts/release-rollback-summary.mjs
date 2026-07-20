import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  evidenceMetadataValue,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";

const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputFile =
  process.env.RELEASE_ROLLBACK_SUMMARY_OUTPUT_FILE ??
  join(evidenceRoot, "staging-rollback", "rollback-summary.txt");

const runId = evidenceRunId(process.env);
const rollbackReleaseVersion = requiredEnv("ROLLBACK_RELEASE_VERSION");
const githubRunId = requiredMetadata("GITHUB_RUN_ID");
const githubSha = requiredMetadata("GITHUB_SHA");
const environment = evidenceMetadataValue(
  "RELEASE_ENVIRONMENT",
  process.env,
  "staging-rollback",
);
const verifiedAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const failedChecks = [
  [
    "ROLLBACK_RELEASE_VERSION value valid",
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(rollbackReleaseVersion),
  ],
  ["GITHUB_RUN_ID value valid", /^[0-9A-Za-z._-]+$/.test(githubRunId)],
  ["GITHUB_SHA value valid", /^[0-9a-fA-F]{7,40}$/.test(githubSha)],
  [
    "RELEASE_ENVIRONMENT value valid",
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(environment),
  ],
]
  .filter(([, passed]) => !passed)
  .map(([label]) => label);

if (failedChecks.length > 0) {
  console.error(`Rollback summary metadata is invalid: ${failedChecks.join(", ")}`);
  process.exit(2);
}

const lines = [
  "OGFI ERP Phase I / Phase 1.5 rollback summary",
  `evidence_run_id=${runId}`,
  `rollback_release_version=${rollbackReleaseVersion}`,
  `github_run_id=${githubRunId}`,
  `github_sha=${githubSha}`,
  `environment=${environment}`,
  `verified_at_utc=${verifiedAtUtc}`,
  "RESULT | PASS | Staging rollback summary captured.",
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(`Staging rollback summary written: ${outputFile}`);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required for the rollback summary.`);
    process.exit(2);
  }

  return value;
}

function requiredMetadata(name) {
  const value = evidenceMetadataValue(name, process.env);
  if (!value) {
    console.error(`${name} is required for the rollback summary.`);
    process.exit(2);
  }

  return value;
}
