import { unlink } from "node:fs/promises";

const fixtureFile = process.env.OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE;
if (!fixtureFile) {
  throw new Error("PRODUCTION_AUTH_E2E_FIXTURE_FILE_REQUIRED");
}

await unlink(fixtureFile).catch((error) => {
  if (error?.code !== "ENOENT") throw error;
});
