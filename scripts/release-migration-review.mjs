import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

const migrationsDir =
  process.env.RELEASE_MIGRATION_REVIEW_MIGRATIONS_DIR ??
  "packages/database/prisma/migrations";
const registerFile =
  process.env.RELEASE_MIGRATION_REVIEW_REGISTER ??
  "docs/core/05-technical/MIGRATION_SAFETY_REGISTER.md";
const outputDir =
  process.env.RELEASE_MIGRATION_REVIEW_OUTPUT_DIR ??
  "release-evidence/migration-review";
const generatedAt = process.env.RELEASE_MIGRATION_REVIEW_TIMESTAMP
  ? parseTimestamp(process.env.RELEASE_MIGRATION_REVIEW_TIMESTAMP)
  : new Date();
const timestamp = generatedAt
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const outputFile =
  process.env.RELEASE_MIGRATION_REVIEW_OUTPUT_FILE ??
  join(outputDir, `migration-review-${timestamp}.json`);
const candidateSha =
  process.env.RELEASE_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? null;
const evidenceRunId = process.env.RELEASE_EVIDENCE_RUN_ID ?? null;
const requireApprovedValue =
  process.env.RELEASE_MIGRATION_REVIEW_REQUIRE_APPROVED ?? "no";
const requireApproved = requireApprovedValue === "yes";

try {
  if (!new Set(["yes", "no"]).has(requireApprovedValue)) {
    fail("RELEASE_MIGRATION_REVIEW_REQUIRE_APPROVED must be yes or no.");
  }
  if (
    requireApproved &&
    (!candidateSha || !/^[a-f0-9]{40}$/i.test(candidateSha))
  ) {
    fail("Release mode requires a full 40-character candidate SHA.");
  }
  if (
    requireApproved &&
    (!evidenceRunId ||
      evidenceRunId === "not-recorded" ||
      evidenceRunId.length < 8)
  ) {
    fail("Release mode requires a non-placeholder evidence run ID.");
  }
  const lock = readRequiredFile(join(migrationsDir, "migration_lock.toml"));
  validateMigrationLock(lock);
  const dispositions = readDispositions(registerFile);
  const migrationNames = listMigrationNames(migrationsDir);
  validateMigrationNames(migrationNames);

  const migrations = migrationNames.map((name, order) => {
    const file = join(migrationsDir, name, "migration.sql");
    const sql = readRequiredFile(file);
    if (sql.trim().length === 0) {
      fail(`Migration SQL is empty: ${file}`);
    }
    return inspectMigration(name, file, sql, order + 1, dispositions.get(name));
  });

  const knownNames = new Set(migrationNames);
  const staleRows = [...dispositions.keys()].filter(
    (name) => !knownNames.has(name),
  );
  if (staleRows.length > 0) {
    fail(
      `Safety register contains unknown migrations: ${staleRows.join(", ")}`,
    );
  }

  const missing = migrations
    .filter(
      (migration) =>
        migration.requiresExplicitDisposition && !migration.disposition,
    )
    .map(
      (migration) =>
        `${migration.name} [${migration.reviewReasons.join(", ")}]`,
    );
  if (missing.length > 0) {
    fail(
      `Explicit safety-register disposition required: ${missing.join(", ")}`,
    );
  }
  if (requireApproved) {
    const unapproved = migrations
      .filter(
        (migration) =>
          migration.requiresExplicitDisposition &&
          !new Set(["APPROVED_FOR_REHEARSAL", "APPROVED"]).has(
            migration.disposition?.reviewerStatus,
          ),
      )
      .map(
        (migration) =>
          `${migration.name} [${migration.disposition?.reviewerStatus ?? "MISSING"}]`,
      );
    if (unapproved.length > 0) {
      fail(
        `Release mode requires APPROVED safety dispositions: ${unapproved.join(", ")}`,
      );
    }
  }

  const artifact = {
    schemaVersion: 1,
    generatedAtUtc: generatedAt.toISOString(),
    candidateSha,
    releaseEvidenceRunId: evidenceRunId,
    requireApproved,
    source: {
      migrationsDirectory: normalizePath(migrationsDir),
      migrationLock: normalizePath(join(migrationsDir, "migration_lock.toml")),
      safetyRegister: normalizePath(registerFile),
      databaseProvider: "postgresql",
    },
    summary: summarize(migrations),
    migrations,
  };

  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(
    [
      "Migration review inventory: PASS",
      `Migrations: ${migrations.length}`,
      `Explicit dispositions: ${artifact.summary.explicitDispositionCount}`,
      `Pending reviewer status: ${artifact.summary.pendingReviewCount}`,
      `Approved for rehearsal: ${artifact.summary.rehearsalApprovedCount}`,
      `Candidate SHA: ${candidateSha ?? "not configured"}`,
      `Evidence run ID: ${evidenceRunId ?? "not configured"}`,
      `Artifact: ${outputFile}`,
    ].join("\n"),
  );
} catch (error) {
  console.error(`Migration review inventory: FAIL\n${error.message}`);
  process.exit(2);
}

function inspectMigration(name, file, sql, order, disposition) {
  const executableSql = stripComments(sql);
  const sha256 = createHash("sha256").update(sql).digest("hex");
  if (disposition && disposition.sha256 !== sha256) {
    fail(
      `Safety-register hash mismatch for ${name}: expected ${disposition.sha256}, found ${sha256}`,
    );
  }
  const createdTables = new Set(
    matchAll(
      executableSql,
      /\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"/gi,
    ),
  );
  const uniqueTargets = [
    ...matchAll(
      executableSql,
      /\bCREATE\s+UNIQUE\s+INDEX\s+"[^"]+"\s+ON\s+"([^"]+)"/gi,
    ),
    ...matchAll(
      executableSql,
      /\bALTER\s+TABLE\s+"([^"]+)"[\s\S]*?\bADD\s+(?:CONSTRAINT\s+"[^"]+"\s+)?UNIQUE\s*\(/gi,
    ),
  ];
  const classifications = {
    create: countMatches(
      executableSql,
      /\bCREATE\s+(?:TABLE|TYPE|INDEX|UNIQUE\s+INDEX|VIEW|SCHEMA)\b/gi,
    ),
    alter: countMatches(executableSql, /\bALTER\s+(?:TABLE|TYPE)\b/gi),
    drop: countMatches(
      executableSql,
      /\bDROP\s+(?:TABLE|COLUMN|TYPE|INDEX|CONSTRAINT)\b/gi,
    ),
    insert: countMatches(executableSql, /\bINSERT\s+INTO\b/gi),
    update: countMatches(executableSql, /(?:^|;)\s*UPDATE\s+"/gim),
    delete: countMatches(executableSql, /\bDELETE\s+FROM\b/gi),
    truncate: countMatches(executableSql, /\bTRUNCATE(?:\s+TABLE)?\b/gi),
    setNotNull: countMatches(executableSql, /\bSET\s+NOT\s+NULL\b/gi),
    unique: countMatches(
      executableSql,
      /\bCREATE\s+UNIQUE\s+INDEX\b|\bADD\s+(?:CONSTRAINT\s+"[^"]+"\s+)?UNIQUE\s*\(/gi,
    ),
    enumChanges: countMatches(
      executableSql,
      /\bCREATE\s+TYPE\s+"[^"]+"\s+AS\s+ENUM\b|\bALTER\s+TYPE\s+"[^"]+"\s+(?:ADD|RENAME)\b/gi,
    ),
    foreignKeys: countMatches(executableSql, /\bFOREIGN\s+KEY\b/gi),
    indexes: countMatches(
      executableSql,
      /\b(?:CREATE|DROP)\s+(?:UNIQUE\s+)?INDEX\b/gi,
    ),
    begin: countMatches(executableSql, /(?:^|;)\s*BEGIN\s*;/gim),
    commit: countMatches(executableSql, /(?:^|;)\s*COMMIT\s*;/gim),
  };
  const destructiveReasons = [];
  if (/\bDROP\s+TABLE\b/i.test(executableSql))
    destructiveReasons.push("DROP_TABLE");
  if (/\bDROP\s+COLUMN\b/i.test(executableSql))
    destructiveReasons.push("DROP_COLUMN");
  if (/\bDROP\s+TYPE\b/i.test(executableSql))
    destructiveReasons.push("DROP_TYPE");
  if (/\bDROP\s+CONSTRAINT\b/i.test(executableSql))
    destructiveReasons.push("DROP_CONSTRAINT");
  if (/\bDROP\s+INDEX\b/i.test(executableSql))
    destructiveReasons.push("DROP_INDEX");
  if (/\bTRUNCATE(?:\s+TABLE)?\b/i.test(executableSql))
    destructiveReasons.push("TRUNCATE");
  if (/\bDELETE\s+FROM\b/i.test(executableSql))
    destructiveReasons.push("DELETE");

  const reviewReasons = [];
  if (classifications.insert > 0) reviewReasons.push("INSERT");
  if (classifications.update > 0) reviewReasons.push("UPDATE");
  for (const reason of destructiveReasons) reviewReasons.push(reason);
  if (classifications.setNotNull > 0) reviewReasons.push("SET_NOT_NULL");
  if (/\bALTER\s+TYPE\s+"[^"]+"\s+(?:ADD|RENAME)\b/i.test(executableSql))
    reviewReasons.push("ALTER_ENUM");
  if (uniqueTargets.some((table) => !createdTables.has(table)))
    reviewReasons.push("UNIQUE_ON_EXISTING_TABLE");

  return {
    order,
    name,
    file: normalizePath(relative(".", file)),
    sha256,
    byteLength: Buffer.byteLength(sql),
    affectedQuotedTables: affectedTables(executableSql),
    classifications,
    explicitTransaction: {
      beginCount: classifications.begin,
      commitCount: classifications.commit,
      balanced: classifications.begin === classifications.commit,
    },
    riskClassification:
      reviewReasons.length > 0 ? "EXPLICIT_REVIEW" : "ADDITIVE_DEFAULT",
    requiresExplicitDisposition: reviewReasons.length > 0,
    reviewReasons: [...new Set(reviewReasons)],
    destructiveReasons,
    disposition: disposition ?? null,
  };
}

function affectedTables(sql) {
  const patterns = [
    /\b(?:CREATE|ALTER|DROP)\s+TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+"([^"]+)"/gi,
    /\bINSERT\s+INTO\s+"([^"]+)"/gi,
    /(?:^|;)\s*UPDATE\s+"([^"]+)"/gim,
    /\bDELETE\s+FROM\s+"([^"]+)"/gi,
    /\bTRUNCATE(?:\s+TABLE)?\s+"([^"]+)"/gi,
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+"[^"]+"\s+ON\s+"([^"]+)"/gi,
    /\bREFERENCES\s+"([^"]+)"/gi,
  ];
  return [
    ...new Set(patterns.flatMap((pattern) => matchAll(sql, pattern))),
  ].sort();
}

function readDispositions(file) {
  const markdown = readRequiredFile(file);
  const match =
    /<!-- MIGRATION_SAFETY_REGISTER_JSON_START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- MIGRATION_SAFETY_REGISTER_JSON_END -->/.exec(
      markdown,
    );
  if (!match)
    fail(`Machine-readable safety-register section is missing: ${file}`);
  let rows;
  try {
    rows = JSON.parse(match[1]);
  } catch (error) {
    fail(`Safety-register JSON is invalid: ${error.message}`);
  }
  if (!Array.isArray(rows)) fail("Safety-register JSON must be an array.");
  const result = new Map();
  const allowedStatuses = new Set([
    "PENDING",
    "APPROVED_FOR_REHEARSAL",
    "APPROVED",
    "REJECTED",
  ]);
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row))
      fail(`Safety-register row ${index + 1} must be an object.`);
    for (const field of [
      "migration",
      "sha256",
      "risk",
      "expectedDataEffect",
      "recovery",
      "failurePoint",
      "transactionBehavior",
      "reversibility",
      "decisionTrigger",
      "owner",
      "verification",
      "expectedRecoveryTime",
      "reviewerStatus",
    ]) {
      if (typeof row[field] !== "string" || row[field].trim() === "")
        fail(`Safety-register row ${index + 1} requires non-empty ${field}.`);
    }
    if (!allowedStatuses.has(row.reviewerStatus))
      fail(`Safety-register row ${index + 1} has invalid reviewerStatus.`);
    if (!/^[a-f0-9]{64}$/.test(row.sha256))
      fail(`Safety-register row ${index + 1} has invalid sha256.`);
    if (result.has(row.migration))
      fail(`Duplicate safety-register row: ${row.migration}`);
    if (
      new Set(["APPROVED_FOR_REHEARSAL", "APPROVED"]).has(row.reviewerStatus)
    ) {
      for (const field of ["reviewerIdentity", "reviewedAtUtc"]) {
        if (typeof row[field] !== "string" || row[field].trim() === "") {
          fail(`Approved safety-register row ${index + 1} requires ${field}.`);
        }
      }
      if (Number.isNaN(Date.parse(row.reviewedAtUtc))) {
        fail(
          `Approved safety-register row ${index + 1} has invalid reviewedAtUtc.`,
        );
      }
    }
    result.set(row.migration, {
      sha256: row.sha256,
      risk: row.risk,
      expectedDataEffect: row.expectedDataEffect,
      recovery: row.recovery,
      reviewerStatus: row.reviewerStatus,
      reviewerIdentity: row.reviewerIdentity ?? null,
      reviewedAtUtc: row.reviewedAtUtc ?? null,
    });
  }
  return result;
}

function listMigrationNames(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    fail(`Cannot read migrations directory ${directory}: ${error.message}`);
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        return statSync(join(directory, name, "migration.sql")).isFile();
      } catch {
        return false;
      }
    })
    .sort((left, right) => left.localeCompare(right, "en"));
}

function validateMigrationNames(names) {
  if (names.length === 0) fail("No migration.sql files found.");
  const seenNames = new Set();
  const seenPrefixes = new Set();
  let previousPrefix = -1n;
  for (const name of names) {
    const match = /^(\d{4}|\d{14})_[a-z0-9_]+$/.exec(name);
    if (!match) fail(`Invalid migration directory name: ${name}`);
    if (seenNames.has(name))
      fail(`Duplicate migration directory name: ${name}`);
    const prefix = BigInt(match[1]);
    if (seenPrefixes.has(match[1]))
      fail(`Duplicate migration ordering prefix: ${match[1]}`);
    if (prefix <= previousPrefix)
      fail(`Non-monotonic migration order at: ${name}`);
    seenNames.add(name);
    seenPrefixes.add(match[1]);
    previousPrefix = prefix;
  }
}

function validateMigrationLock(contents) {
  const active = contents
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  if (active.length !== 1 || active[0] !== 'provider = "postgresql"') {
    fail(
      'migration_lock.toml must contain exactly provider = "postgresql" (comments are allowed).',
    );
  }
}

function summarize(migrations) {
  const totals = {};
  for (const key of Object.keys(migrations[0].classifications)) {
    totals[key] = migrations.reduce(
      (sum, migration) => sum + migration.classifications[key],
      0,
    );
  }
  return {
    migrationCount: migrations.length,
    explicitDispositionCount: migrations.filter(
      (migration) => migration.disposition,
    ).length,
    additiveDefaultCount: migrations.filter(
      (migration) => !migration.requiresExplicitDisposition,
    ).length,
    destructiveMigrationCount: migrations.filter(
      (migration) => migration.destructiveReasons.length > 0,
    ).length,
    pendingReviewCount: migrations.filter(
      (migration) => migration.disposition?.reviewerStatus === "PENDING",
    ).length,
    rehearsalApprovedCount: migrations.filter(
      (migration) =>
        migration.disposition?.reviewerStatus === "APPROVED_FOR_REHEARSAL",
    ).length,
    approvedReviewCount: migrations.filter(
      (migration) => migration.disposition?.reviewerStatus === "APPROVED",
    ).length,
    rejectedReviewCount: migrations.filter(
      (migration) => migration.disposition?.reviewerStatus === "REJECTED",
    ).length,
    operationTotals: totals,
  };
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ");
}

function matchAll(value, pattern) {
  return [...value.matchAll(pattern)].map((match) => match[1]);
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function readRequiredFile(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    fail(`Cannot read required file ${file}: ${error.message}`);
  }
}

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function parseTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()))
    fail(`Invalid RELEASE_MIGRATION_REVIEW_TIMESTAMP: ${value}`);
  return parsed;
}

function fail(message) {
  throw new Error(message);
}
