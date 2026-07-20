import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const allowedEnvTemplates = new Set([
  ".env.example",
  ".env.staging.example",
  ".env.production.example",
]);

const highRiskSecretPattern =
  /(BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]+)/;
const envAssignmentPattern =
  /(DATABASE_URL|DIRECT_DATABASE_URL|S3_SECRET_ACCESS_KEY|AUTH_SECRET|APP_ENCRYPTION_KEY|ERROR_MONITORING_DSN)=([^\s]+)/;
const placeholderEnvValuePattern =
  /^<[a-z0-9][a-z0-9-]*>(?:["'`,;)}\]]*)$/i;
const envKeyReferencePattern =
  /\.(?:startsWith|slice)\(["'`](?:DATABASE_URL|DIRECT_DATABASE_URL|S3_SECRET_ACCESS_KEY|AUTH_SECRET|APP_ENCRYPTION_KEY|ERROR_MONITORING_DSN)=["'`](?:\)|\.length)/;

const trackedFiles = execFileSync("git", ["ls-files"], {
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);

for (const file of trackedFiles) {
  if (allowedEnvTemplates.has(file)) {
    continue;
  }

  if (file === ".env" || file.startsWith(".env.")) {
    fail(`tracked environment file is not allowed: ${file}`);
  }

  if (/\.(pem|key|p12|pfx)$/i.test(file)) {
    fail(`tracked private key/certificate artifact is not allowed: ${file}`);
  }
}

const findings = [];

for (const file of trackedFiles) {
  if (file === "pnpm-lock.yaml") {
    continue;
  }

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  if (content.includes("\0")) {
    continue;
  }

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (highRiskSecretPattern.test(line)) {
      findings.push(`${file}:${index + 1}: high-risk secret pattern`);
    }

    const envAssignment = line.match(envAssignmentPattern);
    if (
      !allowedEnvTemplates.has(file) &&
      envAssignment &&
      !placeholderEnvValuePattern.test(envAssignment[2]) &&
      !envKeyReferencePattern.test(line)
    ) {
      findings.push(
        `${file}:${index + 1}: environment-style secret assignment`,
      );
    }
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  fail("secret pattern found in tracked files");
}

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const outputDir = join(evidenceRoot, "secret-review");
const outputFile = join(outputDir, `secret-review-${timestamp}.txt`);

mkdirSync(outputDir, { recursive: true });
writeFileSync(
  outputFile,
  [
    "OGFI ERP release secret review",
    `Generated UTC: ${timestamp}`,
    `Tracked files scanned: ${trackedFiles.length}`,
    "Allowed env templates: .env.example, .env.staging.example, .env.production.example",
    "RESULT | PASS | No tracked env files, key artifacts, or high-risk secret patterns found."
  ].join("\n") + "\n"
);

console.log(
  "Secret review passed: no tracked env files, key artifacts, or high-risk secret patterns found.",
);
console.log(`Secret review evidence written: ${outputFile}`);

function fail(message) {
  console.error(`Secret review failed: ${message}`);
  process.exit(1);
}
