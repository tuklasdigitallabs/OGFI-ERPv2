import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadLocalEnvValue } from "./local-env.mjs";
import { resolvePostgresTool } from "./postgres-client-tools.mjs";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";
import { writeChecksumLine } from "./release-manifest-integrity.mjs";

const fixtureSections = loadFixtureSections();
const databaseUrl = fixtureSections ? "" : loadLocalEnvValue("DATABASE_URL");

if (!databaseUrl && !fixtureSections) {
  console.error("DATABASE_URL is required for the release readiness register export.");
  process.exit(2);
}

const psql = resolvePostgresTool("psql");
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const outputDir =
  process.env.RELEASE_READINESS_REGISTER_OUTPUT_DIR ??
  "release-evidence/release-readiness-register";
const outputFile =
  process.env.RELEASE_READINESS_REGISTER_OUTPUT_FILE ??
  join(outputDir, `release-readiness-register-${timestamp}.csv`);
const runId = evidenceRunId(process.env, timestamp);
const companyId = process.env.RELEASE_COMPANY_ID?.trim() ?? "";
const companyPredicate = companyId
  ? ` and "companyId" = ${sqlLiteral(companyId)}::uuid`
  : "";
let usePrismaFallback = !psql;

const sectionHeaders = {
  "Readiness gates": [
    "Section",
    "Tenant ID",
    "Company ID",
    "Gate Key",
    "Category",
    "Title",
    "Required By Policy",
    "Status",
    "Evidence Reference",
    "Decision Note",
    "Blocker Summary",
    "Owner Role",
    "Signed Off At UTC",
    "Signed Off By User ID",
    "Source Decision ID",
    "Updated At UTC",
  ],
  "UAT evidence": [
    "Section",
    "Tenant ID",
    "Company ID",
    "Evidence Type",
    "Title",
    "Workflow Area",
    "Tester",
    "Environment",
    "Result",
    "Verification Status",
    "Evidence Reference",
    "Policy Version",
    "Defect Reference",
    "Executed At UTC",
    "Recorded By User ID",
    "Verified By User ID",
    "Rejected By User ID",
    "Source Decision ID",
    "Updated At UTC",
  ],
  "Deployment evidence": [
    "Section",
    "Tenant ID",
    "Company ID",
    "Evidence Type",
    "Title",
    "Environment",
    "Performed By",
    "Verification Status",
    "Evidence Reference",
    "Performed At UTC",
    "Recorded By User ID",
    "Verified By User ID",
    "Rejected By User ID",
    "Source Decision ID",
    "Updated At UTC",
  ],
  "Enablement evidence": [
    "Section",
    "Tenant ID",
    "Company ID",
    "Evidence Type",
    "Title",
    "Audience / Role",
    "Owner",
    "Verification Status",
    "Evidence Reference",
    "Known Limit Acknowledged",
    "Support Route Confirmed",
    "Completed At UTC",
    "Recorded By User ID",
    "Verified By User ID",
    "Rejected By User ID",
    "Source Decision ID",
    "Updated At UTC",
  ],
  "Release Board decisions": [
    "Section",
    "Tenant ID",
    "Company ID",
    "Decision",
    "Evidence Reference",
    "Decision Note",
    "Participants",
    "Decided At UTC",
    "Chair User ID",
    "Source Decision ID",
    "Created At UTC",
  ],
};

const expectedPhase3ReadinessGateTraceRows = [
  [
    "Expected readiness gate",
    "uat.phase3_finance_controlled_foundation",
    "uat",
    "Phase 3 finance foundation UAT accepted",
    "true",
    "NOT_RECORDED_UNTIL_UAT_EVIDENCE_IS_VERIFIED",
    "DEC-0036",
    "Trace row only. Actual ReleaseReadinessGate status must be recorded in the ERP before production release-ready representation.",
  ],
  [
    "Expected readiness gate",
    "uat.phase3_workforce_controlled_foundation",
    "uat",
    "Phase 3 workforce foundation UAT accepted",
    "true",
    "NOT_RECORDED_UNTIL_UAT_EVIDENCE_IS_VERIFIED",
    "DEC-0036",
    "Trace row only. Actual ReleaseReadinessGate status must be recorded in the ERP before production release-ready representation.",
  ],
  [
    "Expected readiness gate",
    "uat.phase3_deferred_blockers_reviewed",
    "uat",
    "Phase 3 deferred blockers reviewed",
    "true",
    "NOT_RECORDED_UNTIL_UAT_EVIDENCE_IS_VERIFIED",
    "DEC-0036",
    "Trace row only. Actual ReleaseReadinessGate status must be recorded in the ERP before production release-ready representation.",
  ],
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(
  outputFile,
  [
    csvRow(["Export File", outputFile]),
    csvRow(["Generated At UTC", new Date().toISOString()]),
    csvRow(["Evidence run ID", runId]),
    csvRow([
      "Database URL fingerprint",
      fixtureSections ? "fixture-mode" : databaseUrlFingerprint(databaseUrl),
    ]),
    csvRow(["Source Decision", "DEC-0036"]),
    csvRow(["Company Filter", companyId || "ALL_COMPANIES"]),
    "",
  ].join("\n"),
);

if (usePrismaFallback) {
  console.warn(
    "psql was not found; using Prisma fallback for the release readiness register export.",
  );
}

await appendExportSection(
  "Readiness gates",
  `
    select
      'Gate register' as "Section",
      "tenantId"::text as "Tenant ID",
      "companyId"::text as "Company ID",
      "gateKey" as "Gate Key",
      "category" as "Category",
      "title" as "Title",
      "requiredByPolicy"::text as "Required By Policy",
      "status" as "Status",
      coalesce("evidenceReference", '') as "Evidence Reference",
      coalesce("decisionNote", '') as "Decision Note",
      coalesce("blockerSummary", '') as "Blocker Summary",
      "ownerRole" as "Owner Role",
      coalesce("signedOffAt"::text, '') as "Signed Off At UTC",
      coalesce("signedOffByUserId"::text, '') as "Signed Off By User ID",
      "sourceDecisionId" as "Source Decision ID",
      "updatedAt"::text as "Updated At UTC"
    from "ReleaseReadinessGate"
    where "sourceDecisionId" = 'DEC-0036'${companyPredicate}
    order by "companyId", "category", "gateKey"
  `,
  prismaReadinessGateRows,
);
appendExpectedPhase3ReadinessGateTraceRows();

await appendExportSection(
  "UAT evidence",
  `
    select
      'UAT evidence' as "Section",
      "tenantId"::text as "Tenant ID",
      "companyId"::text as "Company ID",
      "evidenceType" as "Evidence Type",
      "title" as "Title",
      "workflowArea" as "Workflow Area",
      "testerName" as "Tester",
      "environment" as "Environment",
      "result" as "Result",
      "verificationStatus" as "Verification Status",
      "evidenceReference" as "Evidence Reference",
      coalesce("policyVersion", '') as "Policy Version",
      coalesce("defectReference", '') as "Defect Reference",
      "executedAt"::text as "Executed At UTC",
      "createdByUserId"::text as "Recorded By User ID",
      coalesce("verifiedByUserId"::text, '') as "Verified By User ID",
      coalesce("rejectedByUserId"::text, '') as "Rejected By User ID",
      "sourceDecisionId" as "Source Decision ID",
      "updatedAt"::text as "Updated At UTC"
    from "UatEvidenceRecord"
    where "sourceDecisionId" = 'DEC-0036'${companyPredicate}
    order by "companyId", "executedAt" desc, "createdAt" desc
  `,
  prismaUatEvidenceRows,
);

await appendExportSection(
  "Deployment evidence",
  `
    select
      'Deployment evidence' as "Section",
      "tenantId"::text as "Tenant ID",
      "companyId"::text as "Company ID",
      "evidenceType" as "Evidence Type",
      "title" as "Title",
      "environment" as "Environment",
      "performedBy" as "Performed By",
      "verificationStatus" as "Verification Status",
      "evidenceReference" as "Evidence Reference",
      "performedAt"::text as "Performed At UTC",
      "createdByUserId"::text as "Recorded By User ID",
      coalesce("verifiedByUserId"::text, '') as "Verified By User ID",
      coalesce("rejectedByUserId"::text, '') as "Rejected By User ID",
      "sourceDecisionId" as "Source Decision ID",
      "updatedAt"::text as "Updated At UTC"
    from "DeploymentEvidenceRecord"
    where "sourceDecisionId" = 'DEC-0036'${companyPredicate}
    order by "companyId", "performedAt" desc, "createdAt" desc
  `,
  prismaDeploymentEvidenceRows,
);

await appendExportSection(
  "Enablement evidence",
  `
    select
      'Enablement evidence' as "Section",
      "tenantId"::text as "Tenant ID",
      "companyId"::text as "Company ID",
      "evidenceType" as "Evidence Type",
      "title" as "Title",
      "audienceRole" as "Audience / Role",
      "ownerName" as "Owner",
      "verificationStatus" as "Verification Status",
      "evidenceReference" as "Evidence Reference",
      "knownLimitAcknowledged"::text as "Known Limit Acknowledged",
      "supportRouteConfirmed"::text as "Support Route Confirmed",
      "completedAt"::text as "Completed At UTC",
      "createdByUserId"::text as "Recorded By User ID",
      coalesce("verifiedByUserId"::text, '') as "Verified By User ID",
      coalesce("rejectedByUserId"::text, '') as "Rejected By User ID",
      "sourceDecisionId" as "Source Decision ID",
      "updatedAt"::text as "Updated At UTC"
    from "EnablementEvidenceRecord"
    where "sourceDecisionId" = 'DEC-0036'${companyPredicate}
    order by "companyId", "completedAt" desc, "createdAt" desc
  `,
  prismaEnablementEvidenceRows,
);

await appendExportSection(
  "Release Board decisions",
  `
    select
      'Release Board decision' as "Section",
      "tenantId"::text as "Tenant ID",
      "companyId"::text as "Company ID",
      "decision" as "Decision",
      "evidenceReference" as "Evidence Reference",
      "decisionNote" as "Decision Note",
      "participants"::text as "Participants",
      "decidedAt"::text as "Decided At UTC",
      "chairUserId"::text as "Chair User ID",
      "sourceDecisionId" as "Source Decision ID",
      "createdAt"::text as "Created At UTC"
    from "ReleaseBoardDecision"
    where "sourceDecisionId" = 'DEC-0036'${companyPredicate}
    order by "companyId", "decidedAt" desc, "createdAt" desc
  `,
  prismaReleaseBoardDecisionRows,
);

appendFileSync(
  outputFile,
  [
    "",
    csvRow(["RESULT", "PASS", "Release readiness register export captured."]),
    "",
  ].join("\n"),
);

console.log(`Release readiness register export written: ${outputFile}`);
writeFileSync(`${outputFile}.sha256`, writeChecksumLine(outputFile));
console.log(`Release readiness register checksum written: ${outputFile}.sha256`);

async function appendExportSection(label, sql, rowBuilder) {
  if (fixtureSections) {
    await appendFixtureSection(label);
    return;
  }

  if (usePrismaFallback) {
    await appendPrismaSection(label, rowBuilder);
    return;
  }

  try {
    appendCopySection(label, sql);
  } catch (error) {
    usePrismaFallback = true;
    console.warn(
      `psql export failed for ${label}; using Prisma fallback for remaining release readiness register sections. ${errorMessage(error)}`,
    );
    await appendPrismaSection(label, rowBuilder);
  }
}

function appendCopySection(label, sql) {
  appendFileSync(outputFile, `${csvRow(["Register Section", label])}\n`);
  const output = execFileSync(
    psql,
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", `copy (${sql}) to stdout with csv header`],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  appendFileSync(outputFile, output.endsWith("\n") ? output : `${output}\n`);
  appendFileSync(outputFile, "\n");
}

async function appendPrismaSection(label, rowBuilder) {
  appendFileSync(outputFile, `${csvRow(["Register Section", label])}\n`);
  const rows = await rowBuilder();
  appendFileSync(outputFile, rows.map(csvRow).join("\n"));
  appendFileSync(outputFile, "\n\n");
}

async function appendFixtureSection(label) {
  const rows = fixtureSections?.[label];
  if (!Array.isArray(rows)) {
    throw new Error(`Missing fixture section: ${label}`);
  }
  assertSectionHeader(label, rows[0]);

  appendFileSync(outputFile, `${csvRow(["Register Section", label])}\n`);
  appendFileSync(outputFile, rows.map(csvRow).join("\n"));
  appendFileSync(outputFile, "\n\n");
}

function appendExpectedPhase3ReadinessGateTraceRows() {
  appendFileSync(
    outputFile,
    [
      csvRow(["Register Section", "Expected Phase 3 readiness gate trace"]),
      csvRow([
        "Section",
        "Gate Key",
        "Category",
        "Title",
        "Required By Policy",
        "Expected Status",
        "Source Decision ID",
        "Note",
      ]),
      ...expectedPhase3ReadinessGateTraceRows.map(csvRow),
      "",
    ].join("\n"),
  );
}

async function withPrisma(callback) {
  const { PrismaClient } = await import(
    "../packages/database/node_modules/@prisma/client/default.js"
  );
  const prisma = new PrismaClient({
    log: process.env.APP_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  try {
    return await callback(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

function baseWhere() {
  return {
    sourceDecisionId: "DEC-0036",
    ...(companyId ? { companyId } : {}),
  };
}

async function prismaReadinessGateRows() {
  return withPrisma(async (prisma) => {
    const records = await prisma.releaseReadinessGate.findMany({
      where: baseWhere(),
      orderBy: [{ companyId: "asc" }, { category: "asc" }, { gateKey: "asc" }],
    });
    return [
      sectionHeaders["Readiness gates"],
      ...records.map((record) => [
        "Gate register",
        record.tenantId,
        record.companyId,
        record.gateKey,
        record.category,
        record.title,
        String(record.requiredByPolicy),
        record.status,
        record.evidenceReference ?? "",
        record.decisionNote ?? "",
        record.blockerSummary ?? "",
        record.ownerRole,
        dateText(record.signedOffAt),
        record.signedOffByUserId ?? "",
        record.sourceDecisionId,
        dateText(record.updatedAt),
      ]),
    ];
  });
}

async function prismaUatEvidenceRows() {
  return withPrisma(async (prisma) => {
    const records = await prisma.uatEvidenceRecord.findMany({
      where: baseWhere(),
      orderBy: [{ companyId: "asc" }, { executedAt: "desc" }, { createdAt: "desc" }],
    });
    return [
      sectionHeaders["UAT evidence"],
      ...records.map((record) => [
        "UAT evidence",
        record.tenantId,
        record.companyId,
        record.evidenceType,
        record.title,
        record.workflowArea,
        record.testerName,
        record.environment,
        record.result,
        record.verificationStatus,
        record.evidenceReference,
        record.policyVersion ?? "",
        record.defectReference ?? "",
        dateText(record.executedAt),
        record.createdByUserId,
        record.verifiedByUserId ?? "",
        record.rejectedByUserId ?? "",
        record.sourceDecisionId,
        dateText(record.updatedAt),
      ]),
    ];
  });
}

async function prismaDeploymentEvidenceRows() {
  return withPrisma(async (prisma) => {
    const records = await prisma.deploymentEvidenceRecord.findMany({
      where: baseWhere(),
      orderBy: [{ companyId: "asc" }, { performedAt: "desc" }, { createdAt: "desc" }],
    });
    return [
      sectionHeaders["Deployment evidence"],
      ...records.map((record) => [
        "Deployment evidence",
        record.tenantId,
        record.companyId,
        record.evidenceType,
        record.title,
        record.environment,
        record.performedBy,
        record.verificationStatus,
        record.evidenceReference,
        dateText(record.performedAt),
        record.createdByUserId,
        record.verifiedByUserId ?? "",
        record.rejectedByUserId ?? "",
        record.sourceDecisionId,
        dateText(record.updatedAt),
      ]),
    ];
  });
}

async function prismaEnablementEvidenceRows() {
  return withPrisma(async (prisma) => {
    const records = await prisma.enablementEvidenceRecord.findMany({
      where: baseWhere(),
      orderBy: [{ companyId: "asc" }, { completedAt: "desc" }, { createdAt: "desc" }],
    });
    return [
      sectionHeaders["Enablement evidence"],
      ...records.map((record) => [
        "Enablement evidence",
        record.tenantId,
        record.companyId,
        record.evidenceType,
        record.title,
        record.audienceRole,
        record.ownerName,
        record.verificationStatus,
        record.evidenceReference,
        String(record.knownLimitAcknowledged),
        String(record.supportRouteConfirmed),
        dateText(record.completedAt),
        record.createdByUserId,
        record.verifiedByUserId ?? "",
        record.rejectedByUserId ?? "",
        record.sourceDecisionId,
        dateText(record.updatedAt),
      ]),
    ];
  });
}

async function prismaReleaseBoardDecisionRows() {
  return withPrisma(async (prisma) => {
    const records = await prisma.releaseBoardDecision.findMany({
      where: baseWhere(),
      orderBy: [{ companyId: "asc" }, { decidedAt: "desc" }, { createdAt: "desc" }],
    });
    return [
      sectionHeaders["Release Board decisions"],
      ...records.map((record) => [
        "Release Board decision",
        record.tenantId,
        record.companyId,
        record.decision,
        record.evidenceReference,
        record.decisionNote,
        JSON.stringify(record.participants),
        dateText(record.decidedAt),
        record.chairUserId,
        record.sourceDecisionId,
        dateText(record.createdAt),
      ]),
    ];
  });
}

function dateText(value) {
  return value ? value.toISOString() : "";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertSectionHeader(label, actualHeader) {
  const expectedHeader = sectionHeaders[label];
  if (!expectedHeader) {
    throw new Error(`Unknown release readiness register section: ${label}`);
  }
  if (
    !Array.isArray(actualHeader) ||
    actualHeader.length !== expectedHeader.length ||
    actualHeader.some((value, index) => value !== expectedHeader[index])
  ) {
    throw new Error(`Fixture header mismatch for section: ${label}`);
  }
}

function loadFixtureSections() {
  const fixtureFile = process.env.RELEASE_READINESS_REGISTER_FIXTURE_FILE;
  if (!fixtureFile) {
    return null;
  }

  return JSON.parse(readFileSync(fixtureFile, "utf8"));
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function csvRow(values) {
  return values.map(csvCell).join(",");
}

function csvCell(value) {
  const rawText = String(value ?? "");
  const text = /^[\t\r\n ]*[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}
