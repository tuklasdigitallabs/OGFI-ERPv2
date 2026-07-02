import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { finalManifestFreshnessIgnorePatterns } from "./release-evidence-contract.mjs";

export function evaluateManifestFreshness(evidenceRoot, manifestFile) {
  const manifestStats = statSync(manifestFile);
  const evidenceFiles = listFiles(evidenceRoot)
    .map((file) => ({
      file,
      relativePath: toRelativePath(evidenceRoot, file),
      modifiedAtMs: statSync(file).mtimeMs,
    }))
    .filter(
      ({ relativePath }) =>
        !finalManifestFreshnessIgnorePatterns.some((pattern) =>
          pattern.test(relativePath),
        ),
    )
    .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);

  const newestEvidence = evidenceFiles[0];
  if (!newestEvidence) {
    return {
      pass: true,
      detail: "no non-generated evidence files found",
    };
  }

  if (manifestStats.mtimeMs >= newestEvidence.modifiedAtMs) {
    return {
      pass: true,
      detail: `manifest is fresh for latest evidence ${newestEvidence.relativePath}`,
    };
  }

  return {
    pass: false,
    detail: `manifest is older than latest evidence ${newestEvidence.relativePath}`,
  };
}

function listFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function toRelativePath(root, file) {
  return relative(root, file).split(sep).join("/");
}
