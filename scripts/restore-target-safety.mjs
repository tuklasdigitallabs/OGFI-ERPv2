import { databaseUrlFingerprint } from "./release-evidence-metadata.mjs";

const isolatedTargetPattern =
  /(?:^|[^a-z0-9])(restore|rehearsal|sandbox|staging|stage|test|testing|dev|development|local|isolated)(?:[^a-z0-9]|$)/i;
const productionTargetPattern =
  /(?:^|[^a-z0-9])(prod|production|live)(?:[^a-z0-9]|$)/i;

export function evaluateRestoreTargetSafety(env = process.env) {
  const restoreDatabaseUrl = env.RESTORE_DATABASE_URL;
  const sourceDatabaseUrl = env.DATABASE_URL;
  const allowProductionRestore = env.ALLOW_RESTORE_TO_PRODUCTION === "yes";

  const checks = [];
  let restoreFingerprint = databaseUrlFingerprint(restoreDatabaseUrl);
  let sourceFingerprint = databaseUrlFingerprint(sourceDatabaseUrl);
  let restoreDescriptor = "";

  if (!restoreDatabaseUrl) {
    checks.push(fail("RESTORE_DATABASE_URL configured", "missing restore target"));
    return result(checks, restoreFingerprint, sourceFingerprint);
  }

  let parsedRestore;
  try {
    parsedRestore = new URL(restoreDatabaseUrl);
  } catch {
    checks.push(fail("RESTORE_DATABASE_URL parseable", "restore target URL cannot be parsed"));
    return result(checks, restoreFingerprint, sourceFingerprint);
  }

  checks.push(pass("RESTORE_DATABASE_URL parseable", "restore target URL parsed"));
  restoreDescriptor = [
    parsedRestore.hostname,
    parsedRestore.pathname,
    parsedRestore.search,
  ].join(" ");

  if (allowProductionRestore) {
    checks.push(
      warn(
        "Production-like restore target blocked",
        "ALLOW_RESTORE_TO_PRODUCTION=yes bypasses the production-name guard; use only for an approved emergency restore drill",
      ),
    );
  } else if (productionTargetPattern.test(restoreDescriptor)) {
    checks.push(
      fail(
        "Production-like restore target blocked",
        "restore target hostname, database name, or query looks production-like",
      ),
    );
  } else {
    checks.push(
      pass(
        "Production-like restore target blocked",
        "restore target does not look production-like",
      ),
    );
  }

  if (sourceDatabaseUrl) {
    if (sourceFingerprint === restoreFingerprint) {
      checks.push(
        fail(
          "Restore target differs from source database",
          "RESTORE_DATABASE_URL has the same non-secret fingerprint as DATABASE_URL",
        ),
      );
    } else {
      checks.push(
        pass(
          "Restore target differs from source database",
          "restore target fingerprint differs from source database fingerprint",
        ),
      );
    }
  } else {
    checks.push(
      warn(
        "Restore target differs from source database",
        "DATABASE_URL is missing, so the source and restore targets cannot be compared",
      ),
    );
  }

  if (isolatedTargetPattern.test(restoreDescriptor)) {
    checks.push(
      pass(
        "Restore target is explicitly isolated",
        "restore target name includes an isolated, restore, rehearsal, staging, test, dev, local, or sandbox marker",
      ),
    );
  } else if (allowProductionRestore) {
    checks.push(
      warn(
        "Restore target is explicitly isolated",
        "production restore override is set; attach the approved emergency procedure and reviewer signoff",
      ),
    );
  } else {
    checks.push(
      fail(
        "Restore target is explicitly isolated",
        "restore target name must include an isolated, restore, rehearsal, staging, test, dev, local, or sandbox marker",
      ),
    );
  }

  return result(checks, restoreFingerprint, sourceFingerprint);
}

export function formatRestoreTargetSafetyLines(assessment) {
  return [
    "Restore Target Safety",
    `Restore database URL fingerprint: ${assessment.restoreFingerprint}`,
    `Source database URL fingerprint: ${assessment.sourceFingerprint}`,
    ...assessment.checks.map(
      (check) => `${check.status} | ${check.label} | ${check.detail}`,
    ),
    assessment.pass
      ? "PASS | Restore target safety | restore target passed destructive-restore guardrails"
      : "BLOCKED | Restore target safety | restore target did not pass destructive-restore guardrails",
  ];
}

function result(checks, restoreFingerprint, sourceFingerprint) {
  return {
    pass: checks.every((check) => check.status !== "FAIL"),
    checks,
    restoreFingerprint,
    sourceFingerprint,
  };
}

function pass(label, detail) {
  return { status: "PASS", label, detail };
}

function warn(label, detail) {
  return { status: "WARN", label, detail };
}

function fail(label, detail) {
  return { status: "FAIL", label, detail };
}
