import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createReleaseArchiveV1, verifyReleaseArchiveV1 } from "./release-archive-v1-lib.mjs";

const [command] = process.argv.slice(2);
const commitSha = process.env.RELEASE_COMMIT_SHA;

if (command === "create") {
  const output = resolve(process.env.RELEASE_ARCHIVE_OUTPUT ?? "release-archive-v1.tar");
  const result = createReleaseArchiveV1({ commitSha });
  const temporary = `${output}.tmp-${process.pid}`;
  writeFileSync(temporary, result.archive, { mode: 0o600, flag: "wx" });
  renameSync(temporary, output);
  console.log(JSON.stringify({ schemaVersion: 1, archiveFormat: "release-archive/v1", ...result, archive: undefined, output }));
} else if (command === "verify") {
  const input = resolve(process.env.RELEASE_ARCHIVE_INPUT ?? "release-archive-v1.tar");
  const result = verifyReleaseArchiveV1({ commitSha, archive: readFileSync(input), artifactSha256: process.env.RELEASE_ARTIFACT_SHA256 });
  console.log(JSON.stringify({ schemaVersion: 1, archiveFormat: "release-archive/v1", ...result, input }));
} else {
  throw new Error("RELEASE_ARCHIVE_COMMAND_INVALID");
}
