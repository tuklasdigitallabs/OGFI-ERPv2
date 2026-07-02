import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { finalManifestFreshnessIgnoredDirectories } from "./release-evidence-contract.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputFile =
  process.env.RELEASE_EVIDENCE_MANIFEST_OUTPUT_FILE ??
  join(evidenceRoot, "manifests", `release-evidence-manifest-${timestamp}.txt`);
const evidenceRunId = process.env.RELEASE_EVIDENCE_RUN_ID ?? timestamp;

const files = listFiles(evidenceRoot)
  .filter((file) => !isManifestFile(file))
  .sort((a, b) => toRelativePath(a).localeCompare(toRelativePath(b)));

const lines = [
  "OGFI ERP Phase I / Phase 1.5 release evidence manifest",
  `generated_at_utc=${timestamp}`,
  `evidence_run_id=${evidenceRunId}`,
  `evidence_root=${evidenceRoot}`,
  `file_count=${files.length}`,
  "",
  "Freshness Notes",
  "Generated advisory status folders listed below are recorded in this manifest but ignored when evaluating whether the manifest is stale.",
  "Changing source evidence outside these folders after manifest generation requires a fresh manifest.",
  ...finalManifestFreshnessIgnoredDirectories.map(
    (directory) => `freshness_ignored_directory=${directory}/`,
  ),
  "",
  "Evidence Class Legend",
  "evidence_class=final means owner-approved signed evidence or final release metadata.",
  "evidence_class=source means collected source proof from workflows, databases, environments, or status checks used by final gates.",
  "evidence_class=local means local generated evidence for interim technical review only.",
  "evidence_class=advisory means generated summary or handoff reports that do not approve release.",
  "",
  "sha256 bytes modified_at_utc evidence_class relative_path",
];

for (const file of files) {
  const stats = statSync(file);
  const relativePath = toRelativePath(file);
  lines.push(
    [
      sha256(file),
      stats.size,
      stats.mtime.toISOString(),
      evidenceClass(relativePath),
      relativePath,
    ].join(" "),
  );
}

lines.push("", "RESULT | PASS | Release evidence manifest captured.");

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);
console.log(`Release evidence manifest written: ${outputFile}`);
console.log(`Release evidence manifest file count: ${files.length}`);

function listFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const filesInDirectory = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      filesInDirectory.push(...listFiles(entryPath));
      continue;
    }

    if (entry.isFile()) {
      filesInDirectory.push(entryPath);
    }
  }

  return filesInDirectory;
}

function isManifestFile(file) {
  const relativePath = toRelativePath(file);
  return /^manifests\/release-evidence-manifest-.*\.txt$/.test(relativePath);
}

function toRelativePath(file) {
  return relative(evidenceRoot, file).split(sep).join("/");
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function evidenceClass(relativePath) {
  if (
    relativePath === "release-summary.txt" ||
    relativePath.startsWith("signed-documents/")
  ) {
    return "final";
  }

  if (relativePath.startsWith("interim-review/")) {
    return "local";
  }

  if (
    finalManifestFreshnessIgnoredDirectories.some((directory) =>
      relativePath.startsWith(`${directory}/`),
    )
  ) {
    return "advisory";
  }

  return "source";
}
