import { loadLocalEnvValue } from "./local-env.mjs";

export function getReleaseSummaryMetadata(env = process.env) {
  return {
    evidenceRunId: envValue(env, "RELEASE_EVIDENCE_RUN_ID"),
    releaseVersion: envValue(env, "RELEASE_VERSION"),
    githubRunId: envValue(env, "GITHUB_RUN_ID"),
    githubSha: envValue(env, "GITHUB_SHA"),
    deployToStaging: envValue(env, "DEPLOY_TO_STAGING") || "false",
    environment: envValue(env, "RELEASE_ENVIRONMENT") || "staging-rehearsal",
    migrationMode: envValue(env, "RELEASE_MIGRATION_MODE") || "prisma-deploy",
  };
}

export function validateReleaseSummaryMetadata(metadata) {
  return [
    ["RELEASE_VERSION configured", metadata.releaseVersion.length > 0],
    [
      "RELEASE_VERSION value valid",
      !metadata.releaseVersion ||
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(metadata.releaseVersion),
    ],
    ["GITHUB_RUN_ID configured", metadata.githubRunId.length > 0],
    [
      "GITHUB_RUN_ID value valid",
      !metadata.githubRunId || /^[0-9A-Za-z._-]+$/.test(metadata.githubRunId),
    ],
    ["GITHUB_SHA configured", metadata.githubSha.length > 0],
    [
      "GITHUB_SHA value valid",
      !metadata.githubSha || /^[0-9a-fA-F]{7,40}$/.test(metadata.githubSha),
    ],
    ["RELEASE_EVIDENCE_RUN_ID configured", metadata.evidenceRunId.length > 0],
    [
      "RELEASE_EVIDENCE_RUN_ID value valid",
      !metadata.evidenceRunId ||
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(metadata.evidenceRunId),
    ],
    [
      "DEPLOY_TO_STAGING value valid",
      ["true", "false"].includes(metadata.deployToStaging),
    ],
    [
      "RELEASE_ENVIRONMENT value valid",
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(metadata.environment),
    ],
    [
      "RELEASE_MIGRATION_MODE value valid",
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(metadata.migrationMode),
    ],
  ];
}

export function failedMetadataChecks(checks) {
  return checks.filter(([, passed]) => !passed).map(([label]) => label);
}

function envValue(env, name) {
  if (env !== process.env) {
    return env[name] ?? "";
  }
  return loadLocalEnvValue(name, env);
}
