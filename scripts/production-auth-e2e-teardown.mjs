import { unlink } from "node:fs/promises";

const fixtureFile = process.env.OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE;
if (!fixtureFile) {
  throw new Error("PRODUCTION_AUTH_E2E_FIXTURE_FILE_REQUIRED");
}

// A private-database lifecycle owns and integrity-checks its pre-provisioned
// browser fixture until the authenticated stop/receipt sequence completes.
// Only legacy runner-owned fixtures are removed by Playwright itself.
if (process.env.OGFI_PRODUCTION_AUTH_E2E_FIXTURE_PREPROVISIONED !== "true") {
  await unlink(fixtureFile).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}
