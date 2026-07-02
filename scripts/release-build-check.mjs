import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const filesToRestore = ["apps/web/next-env.d.ts", "apps/web/tsconfig.json"];
const snapshots = new Map(
  filesToRestore.map((filePath) => [filePath, readFileSync(filePath, "utf8")])
);
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputDir = join(evidenceRoot, "build-check");
const outputFile = join(outputDir, `build-check-${timestamp}.txt`);

const result = spawnSync(
  process.platform === "win32" ? "cmd.exe" : "pnpm",
  process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm --filter @ogfi/web build"]
    : ["--filter", "@ogfi/web", "build"],
  {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-build-check"
  }
  }
);

for (const [filePath, content] of snapshots) {
  if (readFileSync(filePath, "utf8") !== content) {
    writeFileSync(filePath, content);
  }
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(
  outputFile,
  [
    "OGFI ERP release build check",
    `Generated UTC: ${timestamp}`,
    "Command: pnpm --filter @ogfi/web build",
    "NEXT_DIST_DIR: .next-build-check",
    `Status code: ${result.status ?? "unknown"}`,
    result.status === 0
      ? "RESULT | PASS | Web production build completed in .next-build-check."
      : "RESULT | FAIL | Web production build failed.",
    "Note: Next-generated type reference files were restored after the build."
  ].join("\n") + "\n"
);
console.log(`Release build-check evidence written: ${outputFile}`);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
