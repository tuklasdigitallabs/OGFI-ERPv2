import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@ogfi/database";

const LOCAL_UAT_DATABASE_NAME = /^ogfi_rehearsal_local_[a-z0-9_]{4,30}$/;
const LOCAL_UAT_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const CONSTRUCTION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

type Environment = Record<string, string | undefined>;

export type LocalUatDatabaseIdentityProbe = Pick<typeof prisma, "$queryRaw">;

type LocalUatDatabaseIdentity = {
  currentDatabase: string;
  databaseName: string;
  runId: string;
  nonceSha256: string;
  constructionTokenSha256: string | null;
};

type ExpectedLocalUatDatabaseIdentity = {
  databaseName: string;
  runId: string;
  nonceSha256: string;
  markerRunId: string;
  constructionTokenSha256: string | null;
};

export const localUatDatabaseAdmissionErrors = {
  expectedDatabaseMissing:
    "LOCAL_UAT_DATABASE_ADMISSION_EXPECTED_DATABASE_MISSING",
  expectedDatabaseInvalid:
    "LOCAL_UAT_DATABASE_ADMISSION_EXPECTED_DATABASE_INVALID",
  expectedRunIdMissing: "LOCAL_UAT_DATABASE_ADMISSION_EXPECTED_RUN_ID_MISSING",
  expectedRunIdInvalid: "LOCAL_UAT_DATABASE_ADMISSION_EXPECTED_RUN_ID_INVALID",
  expectedNonceSha256Missing:
    "LOCAL_UAT_DATABASE_ADMISSION_EXPECTED_NONCE_SHA256_MISSING",
  expectedNonceSha256Invalid:
    "LOCAL_UAT_DATABASE_ADMISSION_EXPECTED_NONCE_SHA256_INVALID",
  markerUnreadable: "LOCAL_UAT_DATABASE_ADMISSION_MARKER_UNREADABLE",
  markerMissingOrAmbiguous:
    "LOCAL_UAT_DATABASE_ADMISSION_MARKER_MISSING_OR_AMBIGUOUS",
  markerInvalid: "LOCAL_UAT_DATABASE_ADMISSION_MARKER_INVALID",
  markerMismatch: "LOCAL_UAT_DATABASE_ADMISSION_MARKER_MISMATCH",
  constructionTokenInvalid:
    "LOCAL_UAT_DATABASE_ADMISSION_CONSTRUCTION_TOKEN_INVALID",
} as const;

export function isLocalUatDatabaseAdmissionRequired(
  env: Environment = process.env,
) {
  return env.OGFI_LOCAL_UAT_BASELINE_REQUIRED === "true";
}

function expectedIdentity(env: Environment): ExpectedLocalUatDatabaseIdentity {
  const databaseName = env.OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME;
  const runId = env.OGFI_DISPOSABLE_DATABASE_RUN_ID;
  const nonceSha256 = env.OGFI_DISPOSABLE_DATABASE_NONCE_SHA256;
  const constructionToken = env.OGFI_LOCAL_UAT_CONSTRUCTION_TOKEN;
  const constructionTokenSha256 =
    env.OGFI_LOCAL_UAT_CONSTRUCTION_TOKEN_SHA256;

  if (!databaseName) {
    throw new Error(localUatDatabaseAdmissionErrors.expectedDatabaseMissing);
  }
  if (!LOCAL_UAT_DATABASE_NAME.test(databaseName)) {
    throw new Error(localUatDatabaseAdmissionErrors.expectedDatabaseInvalid);
  }
  if (!runId) {
    throw new Error(localUatDatabaseAdmissionErrors.expectedRunIdMissing);
  }
  if (!LOCAL_UAT_RUN_ID.test(runId)) {
    throw new Error(localUatDatabaseAdmissionErrors.expectedRunIdInvalid);
  }
  if (!nonceSha256) {
    throw new Error(localUatDatabaseAdmissionErrors.expectedNonceSha256Missing);
  }
  if (!SHA256_HEX.test(nonceSha256)) {
    throw new Error(localUatDatabaseAdmissionErrors.expectedNonceSha256Invalid);
  }

  const constructionRequested = Boolean(
    constructionToken || constructionTokenSha256,
  );
  if (constructionRequested) {
    if (
      !constructionToken ||
      !constructionTokenSha256 ||
      !CONSTRUCTION_TOKEN.test(constructionToken) ||
      !SHA256_HEX.test(constructionTokenSha256) ||
      !safeSha256Equals(
        createHash("sha256").update(constructionToken).digest("hex"),
        constructionTokenSha256,
      )
    ) {
      throw new Error(
        localUatDatabaseAdmissionErrors.constructionTokenInvalid,
      );
    }
  }

  return {
    databaseName,
    runId,
    nonceSha256,
    markerRunId: constructionRequested ? `${runId}.pending` : runId,
    constructionTokenSha256: constructionRequested
      ? constructionTokenSha256 ?? null
      : null,
  };
}

function safeSha256Equals(actual: string, expected: string) {
  if (!SHA256_HEX.test(actual) || !SHA256_HEX.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function hasSafeMarkerShape(marker: LocalUatDatabaseIdentity) {
  return (
    LOCAL_UAT_DATABASE_NAME.test(marker.currentDatabase) &&
    LOCAL_UAT_DATABASE_NAME.test(marker.databaseName) &&
    LOCAL_UAT_RUN_ID.test(marker.runId) &&
    SHA256_HEX.test(marker.nonceSha256) &&
    (marker.constructionTokenSha256 === null ||
      SHA256_HEX.test(marker.constructionTokenSha256))
  );
}

/**
 * Binds a constructed Local-UAT runtime to its isolated database. Formal UAT
 * admission remains a separate human QA/security gate.
 * This is intentionally a startup-only check; normal development and hosted
 * runtimes do not query the Local-UAT control function.
 */
export async function assertLocalUatDatabaseAdmission(
  env: Environment = process.env,
  database: LocalUatDatabaseIdentityProbe = prisma,
) {
  if (!isLocalUatDatabaseAdmissionRequired(env)) return false;

  const expected = expectedIdentity(env);
  let rows: LocalUatDatabaseIdentity[];
  try {
    rows = expected.constructionTokenSha256
      ? await database.$queryRaw<LocalUatDatabaseIdentity[]>`
          SELECT
            current_database()::text AS "currentDatabase",
            marker.database_name AS "databaseName",
            marker.run_id AS "runId",
            marker.nonce_sha256 AS "nonceSha256",
            marker.construction_token_sha256 AS "constructionTokenSha256"
          FROM ogfi_disposable_control.verify_database_construction_identity() AS marker
        `
      : await database.$queryRaw<LocalUatDatabaseIdentity[]>`
          SELECT
            current_database()::text AS "currentDatabase",
            marker.database_name AS "databaseName",
            marker.run_id AS "runId",
            marker.nonce_sha256 AS "nonceSha256",
            NULL::text AS "constructionTokenSha256"
          FROM ogfi_disposable_control.verify_database_identity() AS marker
        `;
  } catch {
    throw new Error(localUatDatabaseAdmissionErrors.markerUnreadable);
  }

  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]) {
    throw new Error(localUatDatabaseAdmissionErrors.markerMissingOrAmbiguous);
  }

  const marker = rows[0];
  if (!hasSafeMarkerShape(marker)) {
    throw new Error(localUatDatabaseAdmissionErrors.markerInvalid);
  }
  if (
    marker.currentDatabase !== expected.databaseName ||
    marker.databaseName !== expected.databaseName ||
    marker.runId !== expected.markerRunId ||
    !safeSha256Equals(marker.nonceSha256, expected.nonceSha256) ||
    (expected.constructionTokenSha256 === null
      ? marker.constructionTokenSha256 !== null
      : marker.constructionTokenSha256 === null ||
        !safeSha256Equals(
          marker.constructionTokenSha256,
          expected.constructionTokenSha256,
        ))
  ) {
    throw new Error(localUatDatabaseAdmissionErrors.markerMismatch);
  }

  return true;
}
