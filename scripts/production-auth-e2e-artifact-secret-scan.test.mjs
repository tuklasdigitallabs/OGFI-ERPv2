import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertArtifactRootsSanitized,
  capturePrivateDatabaseArtifactSecrets,
} from "./production-auth-e2e-artifact-secret-scan.mjs";

test("artifact scan captures fixture, runtime URL, and decoded runtime password", () => {
  const root = mkdtempSync(join(tmpdir(), "ogfi-artifact-scan-"));
  const needles = join(root, "needles");
  const fixture = join(root, "fixture.json");
  const runtime = join(root, "runtime.env");
  const artifacts = join(root, "artifacts");
  mkdirSync(artifacts);
  writeFileSync(needles, "application-secret\n", { mode: 0o600 });
  writeFileSync(
    fixture,
    JSON.stringify({
      branch: { password: "branch-secret" },
      privileged: { password: "admin-secret", totpSecret: "totp-secret" },
    }),
  );
  writeFileSync(
    runtime,
    `${[
      "DATABASE_URL",
      "postgresql://runtime:encoded%2Dsecret@database:5432/fixture",
    ].join("=")}\n`,
  );
  capturePrivateDatabaseArtifactSecrets(needles, fixture, runtime);
  assert.match(readFileSync(needles, "utf8"), /encoded-secret/);
  writeFileSync(join(artifacts, "safe.json"), '{"status":"passed"}\n');
  assert.doesNotThrow(() => assertArtifactRootsSanitized(needles, [artifacts]));
  writeFileSync(join(artifacts, "leak.txt"), "encoded-secret\n");
  assert.throws(
    () => assertArtifactRootsSanitized(needles, [artifacts]),
    /PRODUCTION_AUTH_E2E_RETAINED_ARTIFACT_SECRET_LEAK:leak\.txt/,
  );
});
