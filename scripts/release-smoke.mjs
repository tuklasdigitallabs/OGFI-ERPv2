import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const outputDir = process.env.SMOKE_OUTPUT_DIR ?? "release-evidence/smoke";
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const outputFile =
  process.env.SMOKE_OUTPUT_FILE ?? join(outputDir, `smoke-${timestamp}.txt`);

const checks = [
  ["api-health", "/api/health", "200"],
  ["api-readiness", "/api/readiness", "200"],
  ["health", "/health", "200"],
  ["readiness", "/readiness", "200"],
  ["sign-in-page", "/sign-in", "2xx"],
  ["protected-items-route", "/items", "3xx"],
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(
  outputFile,
  [
    "OGFI ERP smoke evidence",
    `base_url=${baseUrl}`,
    `started_at_utc=${timestamp}`,
    "",
  ].join("\n"),
);

for (const [label, path, expectedStatus] of checks) {
  await request(label, path, expectedStatus);
}

console.log(`Smoke evidence written: ${outputFile}`);

async function request(label, path, expectedStatus) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const response = await fetch(url, { redirect: "manual" });
  const actualStatus = String(response.status).padStart(3, "0");
  const line = `${timestamp} ${label} ${path} expected=${expectedStatus} actual=${actualStatus}`;

  console.log(line);
  appendFileSync(outputFile, `${line}\n`);

  if (matchesExpected(actualStatus, expectedStatus)) {
    return;
  }

  console.error(
    `Smoke check failed for ${label}: expected ${expectedStatus}, got ${actualStatus}`,
  );
  process.exit(1);
}

function matchesExpected(actualStatus, expectedStatus) {
  if (expectedStatus === actualStatus) {
    return true;
  }

  if (expectedStatus === "2xx") {
    return actualStatus.startsWith("2");
  }

  if (expectedStatus === "3xx") {
    return actualStatus.startsWith("3");
  }

  return false;
}
