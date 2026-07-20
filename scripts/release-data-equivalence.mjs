import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  postgresClientConnectionUrl,
  resolvePostgresTool,
} from "./postgres-client-tools.mjs";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const runId = evidenceRunId(process.env, timestamp);
const outputDir =
  process.env.RELEASE_DATA_EQUIVALENCE_OUTPUT_DIR ??
  "release-evidence/data-equivalence";
const outputFile =
  process.env.RELEASE_DATA_EQUIVALENCE_OUTPUT_FILE ??
  join(outputDir, `data-equivalence-${timestamp}.txt`);
const schemaFile =
  process.env.RELEASE_DATA_EQUIVALENCE_PRISMA_SCHEMA ??
  "packages/database/prisma/schema.prisma";
const sourceDatabaseUrl = process.env.SOURCE_DATABASE_URL;
const targetDatabaseUrl = process.env.TARGET_DATABASE_URL;
const candidateSha =
  process.env.RELEASE_CANDIDATE_SHA ?? process.env.GITHUB_SHA;
const predecessorSha = process.env.RELEASE_PREDECESSOR_SHA;
const sourceFingerprint = databaseUrlFingerprint(sourceDatabaseUrl);
const targetFingerprint = databaseUrlFingerprint(targetDatabaseUrl);
const tableResults = [];

let modelCount = 0;

try {
  if (!sourceDatabaseUrl || !targetDatabaseUrl) {
    fail(
      "SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required and must identify separate databases.",
    );
  }
  if (!candidateSha || !/^[a-f0-9]{40}$/i.test(candidateSha)) {
    fail("A full 40-character candidate SHA is required.");
  }
  if (!predecessorSha || !/^[a-f0-9]{40}$/i.test(predecessorSha)) {
    fail("A full 40-character predecessor SHA is required.");
  }

  if (sourceFingerprint === targetFingerprint) {
    fail("Source and target database fingerprints must be different.");
  }

  const tables = readPrismaModelTables(schemaFile);
  modelCount = tables.length;

  const psql = resolvePostgresTool("psql");
  if (!psql) {
    fail(
      "psql is required. Install PostgreSQL client tools, add psql to PATH, or configure PSQL_BIN/POSTGRES_PSQL_BIN.",
    );
  }

  let sourceRows = 0;
  let targetRows = 0;
  let mismatchCount = 0;

  for (const table of tables) {
    const source = queryTableDigest(psql, sourceDatabaseUrl, table, "source");
    const target = queryTableDigest(psql, targetDatabaseUrl, table, "target");
    const matches =
      source.count === target.count && source.digest === target.digest;

    sourceRows += source.count;
    targetRows += target.count;
    mismatchCount += matches ? 0 : 1;
    tableResults.push({ table, source, target, matches });
  }

  if (sourceRows === 0 || targetRows === 0) {
    fail(
      "At least one application table must be non-empty in both databases; empty databases cannot prove restore equivalence.",
    );
  }

  if (mismatchCount > 0) {
    fail(`${mismatchCount} application table(s) failed equivalence.`);
  }

  writeArtifact(
    "PASS",
    "All application table counts and content digests match.",
  );
  console.log(`Release data equivalence PASS. Evidence: ${outputFile}`);
} catch (error) {
  const message = safeErrorMessage(error);

  try {
    writeArtifact("FAIL", message);
    console.error(`Release data equivalence FAIL. Evidence: ${outputFile}`);
  } catch {
    console.error(
      "Release data equivalence FAIL and the evidence artifact could not be written.",
    );
  }

  console.error(message);
  process.exitCode = 1;
}

function fail(message) {
  throw new Error(message);
}

function queryTableDigest(psql, databaseUrl, table, side) {
  const qualifiedTable = `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
  const sql = [
    "WITH row_digests AS (",
    `  SELECT md5(row_to_json(record)::text) AS row_digest FROM ${qualifiedTable} AS record`,
    ")",
    "SELECT count(*)::text,",
    "       md5(coalesce(string_agg(row_digest, '' ORDER BY row_digest), ''))",
    "FROM row_digests;",
  ].join("\n");

  let output;
  try {
    output = execFileSync(
      psql,
      [
        postgresClientConnectionUrl(databaseUrl),
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-F",
        "\t",
        "-c",
        sql,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 1024 * 1024,
      },
    ).trim();
  } catch {
    fail(
      `${capitalize(side)} database query failed for ${table.label}; the table may be missing or unreadable.`,
    );
  }

  const [countText, digest, ...extra] = output.split("\t");
  const count = Number.parseInt(countText, 10);
  if (
    extra.length > 0 ||
    !/^\d+$/.test(countText) ||
    !Number.isSafeInteger(count) ||
    !/^[a-f0-9]{32}$/.test(digest ?? "")
  ) {
    fail(
      `${capitalize(side)} database returned an invalid digest result for ${table.label}.`,
    );
  }

  return { count, digest };
}

function readPrismaModelTables(filePath) {
  let schema;
  try {
    schema = readFileSync(filePath, "utf8");
  } catch {
    fail(`Unable to read the Prisma schema: ${filePath}`);
  }

  const tables = [];
  const modelPattern = /^model\s+([A-Za-z][A-Za-z0-9_]*)\s+\{([\s\S]*?)^\}/gm;

  for (const match of schema.matchAll(modelPattern)) {
    const mappedTable = parsePrismaStringAttribute(match[2], "map");
    const mappedSchema = parsePrismaStringAttribute(match[2], "schema");
    const name = mappedTable ?? match[1];
    const databaseSchema = mappedSchema ?? "public";

    tables.push({
      model: match[1],
      name,
      schema: databaseSchema,
      label: databaseSchema === "public" ? name : `${databaseSchema}.${name}`,
    });
  }

  if (tables.length === 0) {
    fail(`No Prisma models found in schema: ${filePath}`);
  }

  const seen = new Set();
  for (const table of tables) {
    const key = `${table.schema}\u0000${table.name}`;
    if (seen.has(key)) {
      fail(`Duplicate Prisma table mapping found for ${table.label}.`);
    }
    seen.add(key);
  }

  return tables.sort((left, right) => left.label.localeCompare(right.label));
}

function parsePrismaStringAttribute(modelBody, attribute) {
  const pattern = new RegExp(
    `@@${attribute}\\(\\s*("(?:[^"\\\\]|\\\\.)*")\\s*\\)`,
  );
  const match = pattern.exec(modelBody);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    fail(`Invalid @@${attribute} string in Prisma schema.`);
  }
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function writeArtifact(status, summary) {
  const lines = [
    "OGFI ERP release restore data equivalence",
    `Generated UTC: ${timestamp}`,
    `Evidence run ID: ${runId}`,
    `Candidate SHA: ${candidateSha ?? "not-recorded"}`,
    `Predecessor SHA: ${predecessorSha ?? "not-recorded"}`,
    `Source database fingerprint: ${sourceFingerprint}`,
    `Target database fingerprint: ${targetFingerprint}`,
    `Prisma schema file: ${schemaFile}`,
    `Schema model count: ${modelCount}`,
    "Digest method: ordered MD5 aggregation of per-row JSON digests",
    "",
    "Table | Source rows | Source digest | Target rows | Target digest | Result",
  ];

  for (const result of tableResults) {
    lines.push(
      `${result.table.label} | ${result.source.count} | ${result.source.digest} | ${result.target.count} | ${result.target.digest} | ${result.matches ? "MATCH" : "MISMATCH"}`,
    );
  }

  lines.push("", `RESULT | ${status} | ${summary}`);
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${lines.join("\n")}\n`, { mode: 0o600 });
}

function safeErrorMessage(error) {
  if (!(error instanceof Error)) {
    return "Data equivalence verification failed.";
  }

  return error.message.replace(
    /postgres(?:ql)?:\/\/\S+/gi,
    "[REDACTED_DATABASE_URL]",
  );
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
