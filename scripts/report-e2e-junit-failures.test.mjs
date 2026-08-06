import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectFailureIdentities, reportJunitFailures } from "./report-e2e-junit-failures.mjs";

const xml = (testcases) => `<testsuites><testsuite hostname="chromium">${testcases}</testsuite></testsuites>`;
const failed = (name, body = "do-not-print-secret") =>
  `<testcase classname="supplier-responsive.spec.ts" name="${name}"><failure>${body}</failure></testcase>`;

async function captureOutput(callback) {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    output += String(chunk);
    return true;
  };
  try {
    await callback();
  } finally {
    process.stdout.write = originalWrite;
  }
  return output;
}

test("extracts only failed testcase identity and never its body", () => {
  const failures = collectFailureIdentities(
    xml(`${failed("selects a supplier")}<testcase name="passes" classname="ok.spec.ts"/>`),
  );
  assert.deepEqual(failures, [
    {
      project: "chromium",
      spec: "supplier-responsive.spec.ts",
      failureKind: "failure",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(failures), /do-not-print-secret/u);
});

test("never returns dynamic testcase identity in annotation fields", () => {
  const sentinel = `apiKey=short-value client_secret=small password=tiny ${"a".repeat(32)} user@example.test\n::error`;
  const [failure] = collectFailureIdentities(
    xml(`<testcase classname="${sentinel}" name="${sentinel}"><failure>${sentinel}</failure></testcase>`),
  );
  assert.equal(JSON.stringify(failure).includes(sentinel), false);
  assert.equal(failure.spec, "unknown-spec");
});

test("never writes credential-shaped JUnit attributes or bodies to public annotations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ogfi-junit-report-"));
  const report = join(directory, "e2e-junit.xml");
  const sentinels = [
    "apiKey=smallsecret",
    "api_key=shortvalue",
    "client_secret=shortvalue",
    "password=tiny",
    "Bearer shortvalue",
    "cookie=shortvalue",
    "user@example.test",
    "https://example.test/?token=shortvalue",
    "%0A::error::injected",
    "&quot;entity-payload&quot;",
    "apiKey-shortvalue.spec.ts",
    "client-secret-smallvalue.spec.ts",
    "failure-body-sentinel",
  ];
  const payload = sentinels.join(" ");
  try {
    await writeFile(
      report,
      `<testsuites><testsuite hostname="${payload}"><testcase classname="${payload}" name="${payload}"><failure>${payload}</failure></testcase></testsuite></testsuites>`,
    );
    const output = await captureOutput(() => reportJunitFailures(report));
    for (const sentinel of sentinels) assert.equal(output.includes(sentinel), false);
    assert.match(output, /project=unknown-project; spec=unknown-spec; case=1/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("caps annotations and reports the suppressed count", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ogfi-junit-report-"));
  const report = join(directory, "e2e-junit.xml");
  try {
    await writeFile(report, xml(Array.from({ length: 7 }, (_, index) => failed(`case ${index}`)).join("")));
    const output = await captureOutput(() => reportJunitFailures(report));
    assert.equal((output.match(/Ordinary E2E failure/gu) ?? []).length, 5);
    assert.match(output, /E2E_JUNIT_ADDITIONAL_FAILURES_SUPPRESSED:2/u);
    assert.doesNotMatch(output, /do-not-print-secret/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deduplicates the same failed testcase across retries", () => {
  const repeated = failed("same case");
  assert.equal(collectFailureIdentities(xml(`${repeated}${repeated}`)).length, 1);
});

test("fails diagnostics closed for missing and malformed reports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ogfi-junit-report-"));
  const malformed = join(directory, "malformed.xml");
  try {
    await writeFile(malformed, "<not-junit />");
    const missingOutput = await captureOutput(() => reportJunitFailures(join(directory, "missing.xml")));
    const malformedOutput = await captureOutput(() => reportJunitFailures(malformed));
    assert.match(missingOutput, /READ_OR_PARSE_FAILED/u);
    assert.match(malformedOutput, /READ_OR_PARSE_FAILED/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a symlinked report", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "ogfi-junit-report-"));
  const target = join(directory, "target.xml");
  const link = join(directory, "link.xml");
  try {
    await writeFile(target, xml(failed("case")));
    try {
      await symlink(target, link);
    } catch (error) {
      if (error?.code === "EPERM") {
        context.skip("The current Windows account cannot create symbolic links.");
        return;
      }
      throw error;
    }
    const output = await captureOutput(() => reportJunitFailures(link));
    assert.match(output, /UNSAFE_FILE/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fails diagnostics closed for an oversized report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ogfi-junit-report-"));
  const report = join(directory, "oversized.xml");
  try {
    await writeFile(report, "x");
    await truncate(report, 2 * 1024 * 1024 + 1);
    assert.equal((await lstat(report)).size, 2 * 1024 * 1024 + 1);
    const output = await captureOutput(() => reportJunitFailures(report));
    assert.match(output, /INVALID_SIZE/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps the original E2E step authoritative and the artifact upload unconditional", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /- id: ordinary_e2e\n\s+run: pnpm test:e2e/u);
  assert.doesNotMatch(workflow, /id: ordinary_e2e[\s\S]{0,120}continue-on-error/u);
  assert.match(
    workflow,
    /if: \$\{\{ failure\(\) && steps\.ordinary_e2e\.outcome == 'failure' \}\}/u,
  );
  assert.match(workflow, /name: Upload CI verification evidence\n\s+if: always\(\)/u);
});
