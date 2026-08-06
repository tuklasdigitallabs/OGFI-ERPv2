#!/usr/bin/env node

import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPORT = "apps/web/test-results/e2e-junit.xml";
const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const MAX_ANNOTATIONS = 5;
const ORDINARY_E2E_SPECS = new Set([
  "admin-responsive.spec.ts",
  "approval-disabled.spec.ts",
  "branch-operations-responsive.spec.ts",
  "expansion-workspace.spec.ts",
  "first-milestone.spec.ts",
  "food-safety-responsive.spec.ts",
  "incidents-responsive.spec.ts",
  "inventory-control-exports.spec.ts",
  "inventory-control-responsive.spec.ts",
  "item-task-sheet.spec.ts",
  "maintenance-responsive.spec.ts",
  "procurement-visible-surfaces.spec.ts",
  "receiving-responsive.spec.ts",
  "supplier-responsive.spec.ts",
  "transfer-receive-reverse.spec.ts",
]);

function workflowEscape(value) {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function safeProject(value) {
  return value === "chromium" || value === "mobile" ? value : "unknown-project";
}

function safeSpec(value) {
  return ORDINARY_E2E_SPECS.has(value) ? value : "unknown-spec";
}

function attribute(source, name) {
  const match = source.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u"));
  return match?.[1] ?? "";
}

export function collectFailureIdentities(xml) {
  if (!xml.includes("<testsuites") || !xml.includes("</testsuites>")) {
    throw new Error("UNSUPPORTED_XML_SHAPE");
  }

  const failures = [];
  const seen = new Set();
  const suitePattern = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/gu;
  for (const suite of xml.matchAll(suitePattern)) {
    const rawProject = attribute(suite[1], "hostname");
    const project = safeProject(rawProject);
    const testcasePattern = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/gu;
    for (const testcase of suite[2].matchAll(testcasePattern)) {
      const body = testcase[2];
      const failureKind = body.includes("<failure")
        ? "failure"
        : body.includes("<error")
          ? "error"
          : null;
      if (!failureKind) continue;
      const rawClassname = attribute(testcase[1], "classname");
      const rawTest = attribute(testcase[1], "name");
      const failure = {
        project,
        spec: safeSpec(rawClassname),
        failureKind,
      };
      const identity = JSON.stringify([rawProject, rawClassname, rawTest, failureKind]);
      if (!seen.has(identity)) {
        seen.add(identity);
        failures.push(failure);
      }
    }
  }
  return failures;
}

function annotation(message, title = "Ordinary E2E failure") {
  process.stdout.write(`::error title=${workflowEscape(title)}::${workflowEscape(message)}\n`);
}

export async function reportJunitFailures(reportPath = DEFAULT_REPORT) {
  try {
    const absolutePath = resolve(reportPath);
    const reportStat = await lstat(absolutePath);
    if (!reportStat.isFile() || reportStat.isSymbolicLink()) {
      annotation("E2E_JUNIT_DIAGNOSTIC_UNAVAILABLE:UNSAFE_FILE");
      return;
    }
    const reportHandle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let failures;
    try {
      const openedStat = await reportHandle.stat();
      if (!openedStat.isFile() || openedStat.size <= 0 || openedStat.size > MAX_REPORT_BYTES) {
        annotation("E2E_JUNIT_DIAGNOSTIC_UNAVAILABLE:INVALID_SIZE");
        return;
      }
      failures = collectFailureIdentities(await reportHandle.readFile("utf8"));
    } finally {
      await reportHandle.close();
    }
    if (failures.length === 0) {
      annotation("E2E_JUNIT_DIAGNOSTIC_UNAVAILABLE:NO_FAILURE_CASE");
      return;
    }
    for (const [index, failure] of failures.slice(0, MAX_ANNOTATIONS).entries()) {
      annotation(
        `${failure.failureKind}; project=${failure.project}; spec=${failure.spec}; case=${index + 1}`,
      );
    }
    if (failures.length > MAX_ANNOTATIONS) {
      annotation(
        `E2E_JUNIT_ADDITIONAL_FAILURES_SUPPRESSED:${failures.length - MAX_ANNOTATIONS}`,
        "Ordinary E2E diagnostic summary",
      );
    }
  } catch {
    annotation("E2E_JUNIT_DIAGNOSTIC_UNAVAILABLE:READ_OR_PARSE_FAILED");
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await reportJunitFailures(process.argv[2]);
}
