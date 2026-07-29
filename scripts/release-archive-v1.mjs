import { closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createReleaseArchiveV1, verifyReleaseArchiveV1 } from "./release-archive-v1-lib.mjs";

const [command] = process.argv.slice(2);
const commitSha = process.env.RELEASE_COMMIT_SHA;
const repositoryRoot = process.env.RELEASE_ARCHIVE_REPOSITORY;
const trustRoot = process.env.RELEASE_ARCHIVE_TRUST_ROOT;
const stagingRoot = process.env.RELEASE_ARCHIVE_STAGING_ROOT;
const safeStagingRoot = () => {
  if (!isAbsolute(stagingRoot ?? "")) throw new Error("RELEASE_ARCHIVE_STAGING_ROOT_INVALID");
  const root = resolve(stagingRoot);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) throw new Error("RELEASE_ARCHIVE_STAGING_ROOT_INVALID");
  return realpathSync(root);
};
const safeArchiveInput = (input) => {
  const root = safeStagingRoot();
  const requested = resolve(input);
  const requestedStat = lstatSync(requested);
  if (!requestedStat.isFile() || requestedStat.isSymbolicLink() || requestedStat.nlink !== 1 || requestedStat.size > (512 * 1024 * 1024)) throw new Error("RELEASE_ARCHIVE_INPUT_INVALID");
  const resolved = realpathSync(requested);
  const rootRelativePath = relative(root, resolved);
  if (rootRelativePath === "" || rootRelativePath.startsWith("..") || isAbsolute(rootRelativePath)) throw new Error("RELEASE_ARCHIVE_INPUT_INVALID");
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > (512 * 1024 * 1024)) throw new Error("RELEASE_ARCHIVE_INPUT_INVALID");
  const fd = openSync(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const pinned = fstatSync(fd); if (!pinned.isFile() || pinned.ino !== stat.ino || pinned.dev !== stat.dev || pinned.nlink !== 1) throw new Error("RELEASE_ARCHIVE_INPUT_INVALID"); return readFileSync(fd); } finally { closeSync(fd); }
};

if (command === "create") {
  const root = safeStagingRoot();
  const outputDirectory = mkdtempSync(join(root, ".release-archive-v1-"));
  const output = join(outputDirectory, "release-archive-v1.tar");
  const result = createReleaseArchiveV1({ commitSha, repositoryRoot, trustRoot });
  writeFileSync(output, result.archive, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ schemaVersion: 1, archiveFormat: "release-archive/v1", ...result, archive: undefined, output }));
} else if (command === "verify") {
  const input = resolve(process.env.RELEASE_ARCHIVE_INPUT ?? "release-archive-v1.tar");
  const result = verifyReleaseArchiveV1({ commitSha, archive: safeArchiveInput(input), artifactSha256: process.env.RELEASE_ARTIFACT_SHA256, repositoryRoot, trustRoot });
  console.log(JSON.stringify({ schemaVersion: 1, archiveFormat: "release-archive/v1", ...result, input }));
} else {
  throw new Error("RELEASE_ARCHIVE_COMMAND_INVALID");
}
