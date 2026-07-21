import { spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const [suite, scriptName] = process.argv.slice(2);
if (!suite || !scriptName || !["authorization", "e2e"].includes(suite)) {
  throw new Error("RELEASE_TEST_ATTESTATION_USAGE");
}

const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("PNPM_EXECUTABLE_UNAVAILABLE");

const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, [pnpmCli, "run", scriptName], {
  cwd: repositoryRoot,
  env: process.env,
  stdio: "inherit",
});
const exitCode = result.status ?? 1;
const outputDirectory = path.join(
  repositoryRoot,
  "release-evidence/authorization",
);
mkdirSync(outputDirectory, { recursive: true });
const attestation = {
  schemaVersion: 1,
  suite,
  command: `pnpm run ${scriptName}`,
  result: exitCode === 0 ? "PASSED" : "FAILED",
  exitCode,
  startedAt,
  completedAt: new Date().toISOString(),
  gitHead,
  githubSha: process.env.GITHUB_SHA ?? null,
  exactGithubShaMatch: process.env.GITHUB_SHA
    ? process.env.GITHUB_SHA === gitHead
    : null,
  databaseIdentity: process.env.AUTHORIZATION_TEST_DATABASE ?? null,
  databaseRunId: process.env.AUTHORIZATION_TEST_RUN_ID ?? null,
  disposableDatabaseSentinel:
    process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes",
  githubRunId: process.env.GITHUB_RUN_ID ?? null,
  githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
};
writeFileSync(
  path.join(outputDirectory, `${suite}-test-attestation.json`),
  `${JSON.stringify(attestation, null, 2)}\n`,
);
process.exit(exitCode);
