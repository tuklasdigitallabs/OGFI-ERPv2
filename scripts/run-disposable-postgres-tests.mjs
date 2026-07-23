import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertMarkerRow,
  assertSafePsqlDockerContainer,
  assertSafeAdminUrl,
  assertSafeDisposableTarget,
  buildPsqlEnvironment,
  buildRuntimeEnvironment,
  buildSeedRepeatabilityEnvironment,
  createDisposablePostgresIdentity,
  quoteIdentifier,
  quoteLiteral,
  scrubDatabaseCredentialEnvironment,
  shouldRunAdversarialRoleContract,
  shouldRunSeedRepeatability,
  targetDatabaseUrl,
} from "./disposable-postgres-lifecycle.mjs";

const adversarialCases = [
  ["security_definer", "Runtime or PUBLIC can execute a non-extension public routine", "reconcile"],
  ["column_acl", "PUBLIC or runtime retains a column ACL on AuditEvent", "reconcile"],
  ["owner_membership", "Owner or runtime role membership closure is not empty", "bootstrap"],
  ["migrator_membership", "Migrator membership must be exactly owner", "bootstrap"],
  ["runtime_membership", "Owner or runtime role membership closure is not empty", "bootstrap"],
  ["wrong_ownership", "A supported public object is not owned by the reviewed owner", "bootstrap"],
  ["default_privilege", "Owner default privileges contain an unsafe", "reconcile"],
  ["unexpected_schema", "Unexpected application schema exists", "admin-cleanup"],
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");
const roleSqlDir = path.join(workspaceRoot, "infra", "hostinger", "postgres");
const separator = process.argv.indexOf("--");
const suiteName = process.argv[2];
const command = separator >= 0 ? process.argv.slice(separator + 1) : [];
if (!suiteName || command.length === 0) {
  fail("Usage: run-disposable-postgres-tests.mjs <suite> -- <command> [args...]");
}

const adminUrl = process.env.DISPOSABLE_DATABASE_ADMIN_URL;
const parsedAdmin = assertSafeAdminUrl(adminUrl);
const runId =
  process.env.AUTHORIZATION_TEST_RUN_ID ??
  process.env.GITHUB_RUN_ID?.concat("-", process.env.GITHUB_RUN_ATTEMPT ?? "1") ??
  `${suiteName}-${process.pid}`;
const identity = createDisposablePostgresIdentity(runId);
const disposableThrottleEnv = disposableAuthenticationThrottleEnvironment(identity);
const setupUrl = targetDatabaseUrl(adminUrl, identity.databaseName);
const migratorPassword = randomBytes(32).toString("base64url");
const migratorUrl = targetDatabaseUrl(adminUrl, identity.databaseName, {
  username: identity.migratorRole,
  password: migratorPassword,
});
const runtimePassword = randomBytes(32).toString("base64url");
const runtimeUrl = targetDatabaseUrl(adminUrl, identity.databaseName, {
  username: identity.runtimeRole,
  password: runtimePassword,
});
assertSafeDisposableTarget({
  adminUrl,
  databaseName: identity.databaseName,
  runtimeUrl,
  runtimeRole: identity.runtimeRole,
});

let databaseCreated = false;
let markerCreated = false;
let exitCode = 1;
try {
  runPsql(adminUrl, `CREATE DATABASE ${quoteIdentifier(identity.databaseName)}`);
  databaseCreated = true;
  installMarker(setupUrl, identity);
  markerCreated = true;
  installSetupRoles(setupUrl, identity, migratorPassword, runtimePassword);

  runPnpm(
    ["db:migrate:deploy"],
    controlledSetupEnvironment(migratorUrl, identity),
  );
  runPnpm(
    ["db:seed"],
    controlledSetupEnvironment(migratorUrl, identity),
  );
  if (suiteName === "controlled-evidence-qualification") {
    installControlledEvidenceQualificationFixture(migratorUrl);
    verifyControlledEvidenceOwnerBoundary(migratorUrl);
  }
  runPnpm(
    ["auth-throttle:control-bootstrap"],
    {
      ...controlledSetupEnvironment(migratorUrl, identity),
      ...disposableThrottleEnv,
      AUTH_THROTTLE_CONTROL_EXPECTED_GENERATION: "0",
      AUTH_THROTTLE_CONTROL_REQUESTED_STATUS: "ACTIVE",
    },
  );
  runPnpm(
    ["auth-throttle:control-race-probe"],
    {
      ...controlledSetupEnvironment(migratorUrl, identity),
      ...disposableThrottleEnv,
      AUTH_THROTTLE_CONTROL_EXPECTED_GENERATION: "1",
    },
  );
  reconcileRoleContract(migratorUrl, identity);
  verifyRoleContract(migratorUrl, identity, "owner");
  verifyRoleContract(runtimeUrl, identity, "runtime");
  verifyControlledEvidenceRuntimeBoundary(runtimeUrl, suiteName);
  verifyAuthenticationThrottleRuntimeBoundary(runtimeUrl);
  runPnpm(
    ["auth-throttle:runtime-probe"],
    buildRuntimeEnvironment(
      { ...process.env, ...disposableThrottleEnv },
      runtimeUrl,
      identity,
      adminUrl,
    ),
  );
  runGuardContract(migratorUrl, identity);
  verifyRuntimeDestructiveOperationsDenied(runtimeUrl);
  verifyRuntimeMarkerBoundary(runtimeUrl, identity);
  verifyMarker(setupUrl, identity);
  if (shouldRunAdversarialRoleContract(suiteName)) {
    runAdversarialRoleContract(
      setupUrl,
      migratorUrl,
      runtimeUrl,
      identity,
      migratorPassword,
      runtimePassword,
    );
  }
  if (shouldRunSeedRepeatability(suiteName)) {
    runSeedRepeatability(runtimeUrl, identity);
  }

  const childInvocation =
    command[0] === "pnpm"
      ? pnpmInvocation(command.slice(1))
      : { executable: command[0], args: command.slice(1) };
  const child = spawnSync(childInvocation.executable, childInvocation.args, {
    cwd: workspaceRoot,
    env: buildRuntimeEnvironment(
      { ...process.env, ...disposableThrottleEnv },
      runtimeUrl,
      identity,
      adminUrl,
    ),
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  exitCode = child.status ?? 1;
  if (exitCode === 0 && suiteName === "approval-routing-backfill") {
    verifyApprovalRoutingReplicationRoleGuards(setupUrl);
    verifyApprovalIntegrityOwnerGuards(setupUrl);
  }
} finally {
  if (databaseCreated) {
    if (!markerCreated) {
      console.error(`Refusing unverified teardown of ${identity.databaseName}.`);
    } else {
      verifyMarker(setupUrl, identity);
      runPsql(
        adminUrl,
        `DROP DATABASE ${quoteIdentifier(identity.databaseName)} WITH (FORCE)`,
      );
      dropRoles(adminUrl, identity);
    }
  }
}
process.exitCode = exitCode;

function verifyApprovalRoutingReplicationRoleGuards(databaseUrl) {
  runPsql(
    databaseUrl,
    `
      DO $probe$
      DECLARE
        target_step_id uuid;
        original_assignee uuid;
        rejected boolean := false;
      BEGIN
        SELECT id, "assignedUserId"
          INTO target_step_id, original_assignee
          FROM public."ApprovalInstanceStep"
         WHERE "routingSchemaVersion" = 1
           AND "assignedUserId" IS NOT NULL
         ORDER BY id
         LIMIT 1;
        IF target_step_id IS NULL THEN
          RAISE EXCEPTION 'Approval replication-role probe fixture is missing';
        END IF;

        BEGIN
          SET LOCAL session_replication_role = replica;
          UPDATE public."ApprovalInstanceStep"
             SET "assignedUserId" = NULL
           WHERE id = target_step_id;
        EXCEPTION
          WHEN SQLSTATE '55000' THEN
            IF SQLERRM <> 'APPROVAL_ROUTING_CONTEXT_IMMUTABLE' THEN
              RAISE;
            END IF;
            rejected := true;
        END;

        IF NOT rejected THEN
          RAISE EXCEPTION 'Approval ALWAYS trigger was bypassed by replication role';
        END IF;
        IF (SELECT "assignedUserId" FROM public."ApprovalInstanceStep" WHERE id = target_step_id)
           IS DISTINCT FROM original_assignee THEN
          RAISE EXCEPTION 'Approval replication-role probe changed routing context';
        END IF;
      END
      $probe$;
    `,
  );
}

function verifyApprovalIntegrityOwnerGuards(databaseUrl) {
  expectPsqlFailure(
    databaseUrl,
    `
      BEGIN;
      DROP INDEX public."ApprovalInstance_one_pending_document_key";
      INSERT INTO public."ApprovalInstance" (
        id, "tenantId", "companyId", "documentType", "documentId",
        "approvalRuleId", status, "currentStepOrder", "createdAt"
      )
      SELECT gen_random_uuid(), "tenantId", "companyId", "documentType",
             "documentId", "approvalRuleId", status, "currentStepOrder", now()
        FROM public."ApprovalInstance"
       WHERE status = 'PENDING'
       ORDER BY id
       LIMIT 1;
      DO $preflight$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM public."ApprovalInstance"
           WHERE status = 'PENDING'
           GROUP BY "tenantId", "companyId", "documentType", "documentId"
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23505',
            MESSAGE = 'APPROVAL_INSTANCE_PENDING_DUPLICATE';
        END IF;
      END;
      $preflight$;
      COMMIT;
    `,
    "23505",
  );
  runPsql(
    databaseUrl,
    `
      DO $probe$
      BEGIN
        IF to_regclass('public."ApprovalInstance_one_pending_document_key"') IS NULL THEN
          RAISE EXCEPTION 'Approval pending tuple index was not restored after preflight rollback';
        END IF;
        IF EXISTS (
          SELECT 1
            FROM public."ApprovalInstance"
           WHERE status = 'PENDING'
           GROUP BY "tenantId", "companyId", "documentType", "documentId"
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION 'Approval duplicate preflight rollback left duplicate tuples';
        END IF;
      END
      $probe$;
    `,
  );
  expectPsqlFailure(
    databaseUrl,
    `
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE public."PettyCashApprovalStepIntent";
      COMMIT;
    `,
    "55000",
  );
}

function installMarker(databaseUrl, marker) {
  runPsql(
    databaseUrl,
    `
      CREATE SCHEMA ogfi_disposable_control;
      REVOKE ALL ON SCHEMA ogfi_disposable_control FROM PUBLIC;
      CREATE TABLE ogfi_disposable_control.database_identity (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
        database_name text NOT NULL,
        run_id text NOT NULL,
        nonce_sha256 char(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT database_identity_nonce_sha256 CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$')
      );
      REVOKE ALL ON ogfi_disposable_control.database_identity FROM PUBLIC;
      INSERT INTO ogfi_disposable_control.database_identity
        (singleton, database_name, run_id, nonce_sha256)
      VALUES (
        true,
        ${quoteLiteral(marker.databaseName)},
        ${quoteLiteral(marker.runId)},
        ${quoteLiteral(marker.nonceSha256)}
      );
    `,
  );
}

function installSetupRoles(targetUrl, marker, migratorPassword, runtimePassword) {
  runPsqlFile(targetUrl, path.join(roleSqlDir, "bootstrap-roles.sql"), {
    contract_scope: "disposable",
    app_environment: "test",
    database_name: marker.databaseName,
    owner_role: marker.ownerRole,
    migrator_role: marker.migratorRole,
    runtime_role: marker.runtimeRole,
  });
  runPsql(
    targetUrl,
    `
      ALTER ROLE ${quoteIdentifier(marker.migratorRole)} PASSWORD ${quoteLiteral(migratorPassword)};
      ALTER ROLE ${quoteIdentifier(marker.runtimeRole)} PASSWORD ${quoteLiteral(runtimePassword)};
      CREATE OR REPLACE FUNCTION ogfi_disposable_control.verify_database_identity()
      RETURNS TABLE (database_name text, run_id text, nonce_sha256 text)
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = pg_catalog
      ROWS 1
      AS $marker$
        SELECT identity.database_name, identity.run_id, identity.nonce_sha256::text
        FROM ogfi_disposable_control.database_identity AS identity
        WHERE identity.singleton = true
      $marker$;
      GRANT CREATE ON SCHEMA ogfi_disposable_control
        TO ${quoteIdentifier(marker.ownerRole)};
      ALTER FUNCTION ogfi_disposable_control.verify_database_identity()
        OWNER TO ${quoteIdentifier(marker.ownerRole)};
      REVOKE CREATE ON SCHEMA ogfi_disposable_control
        FROM ${quoteIdentifier(marker.ownerRole)};
      REVOKE ALL ON FUNCTION ogfi_disposable_control.verify_database_identity() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION ogfi_disposable_control.verify_database_identity()
        TO ${quoteIdentifier(marker.runtimeRole)};
      GRANT USAGE ON SCHEMA ogfi_disposable_control
        TO ${quoteIdentifier(marker.ownerRole)}, ${quoteIdentifier(marker.runtimeRole)};
      GRANT SELECT ON ogfi_disposable_control.database_identity
        TO ${quoteIdentifier(marker.ownerRole)};
      REVOKE ALL
        ON ogfi_disposable_control.database_identity
        FROM ${quoteIdentifier(marker.runtimeRole)};
    `,
  );
}

function reconcileRoleContract(migratorDatabaseUrl, marker) {
  runPsqlFile(
    migratorDatabaseUrl,
    path.join(roleSqlDir, "reconcile-ownership-and-grants.sql"),
    roleVariables(marker),
  );
}

function installControlledEvidenceQualificationFixture(migratorDatabaseUrl) {
  runPsql(
    migratorDatabaseUrl,
    `
      WITH fixture_scope AS (
        SELECT company."tenantId", company."id" AS "companyId", app_user."id" AS "actorUserId"
          FROM public."Company" company
          JOIN public."User" app_user ON app_user."tenantId" = company."tenantId"
         ORDER BY company."id", app_user."id"
         LIMIT 1
      )
      INSERT INTO public."ControlledEvidencePolicyVersion" (
        "id", "tenantId", "companyId", "actionCode", "version",
        "schemaVersion", "policy", "canonicalJson", "configHash",
        "provenance", "sourceDecisionId", "createdByUserId", "createdAt"
      )
      SELECT
        'd0770000-0000-4000-8000-000000000001'::uuid,
        "tenantId", "companyId", 'TEST.CONTROLLED_EVIDENCE.QUALIFY', 1, 1,
        '{"purposeRequirements":[{"maximumCount":2,"minimumCount":1,"purpose":"APPROVAL_SUPPORT"}],"schemaVersion":1,"sourceType":"ControlledEvidenceSyntheticSource"}'::jsonb,
        '{"purposeRequirements":[{"maximumCount":2,"minimumCount":1,"purpose":"APPROVAL_SUPPORT"}],"schemaVersion":1,"sourceType":"ControlledEvidenceSyntheticSource"}',
        '1b15749b1b236585d92f2e95bb4ede6245c3edcc3798ba880bfc3cb1e6e05004',
        jsonb_build_object('fixture', true, 'suite', 'controlled-evidence-qualification'),
        'DEC-0077', "actorUserId", TIMESTAMP '2026-07-24 00:00:00'
      FROM fixture_scope;

      WITH fixture_scope AS (
        SELECT policy."tenantId", policy."companyId", app_user."id" AS "actorUserId"
          FROM public."ControlledEvidencePolicyVersion" policy
          JOIN public."User" app_user ON app_user."tenantId" = policy."tenantId"
         WHERE policy."id" = 'd0770000-0000-4000-8000-000000000001'::uuid
         ORDER BY app_user."id"
         LIMIT 1
      ), event_payload AS (
        SELECT fixture_scope.*,
          jsonb_build_object(
            'schemaVersion', 1, 'tenantId', "tenantId"::text, 'companyId', "companyId"::text,
            'actionCode', 'TEST.CONTROLLED_EVIDENCE.QUALIFY', 'pointerVersion', 1,
            'policyVersionId', 'd0770000-0000-4000-8000-000000000001', 'policyVersion', 1,
            'priorActivationEventId', NULL, 'activatedByUserId', "actorUserId"::text,
            'activatedAt', '2026-07-24T00:00:00.000Z',
            'activationReason', 'DEC-0077 disposable synthetic contract fixture',
            'provenance', jsonb_build_object('fixture', true, 'suite', 'controlled-evidence-qualification')
          ) AS payload
        FROM fixture_scope
      )
      INSERT INTO public."ControlledEvidencePolicyActivationEvent" (
        "id", "tenantId", "companyId", "actionCode", "policyVersionId", "policyVersion",
        "priorActivationEventId", "pointerVersion", "activatedByUserId", "activatedAt",
        "activationReason", "provenance", "canonicalJson", "activationHash", "createdAt"
      )
      SELECT 'd0770000-0000-4000-8000-000000000003'::uuid, "tenantId", "companyId",
        'TEST.CONTROLLED_EVIDENCE.QUALIFY', 'd0770000-0000-4000-8000-000000000001'::uuid, 1,
        NULL, 1, "actorUserId", TIMESTAMP '2026-07-24 00:00:00',
        'DEC-0077 disposable synthetic contract fixture', payload->'provenance',
        public."controlled_evidence_canonical_json"(payload),
        encode(digest(public."controlled_evidence_canonical_json"(payload), 'sha256'), 'hex'),
        TIMESTAMP '2026-07-24 00:00:00'
      FROM event_payload;

      WITH fixture_scope AS (
        SELECT "tenantId", "companyId" FROM public."ControlledEvidencePolicyActivationEvent"
         WHERE "id" = 'd0770000-0000-4000-8000-000000000003'::uuid
      )
      INSERT INTO public."ControlledEvidencePolicyActivation" (
        "id", "tenantId", "companyId", "actionCode",
        "activeActivationEventId", "pointerVersion", "createdAt", "updatedAt"
      )
      SELECT
        'd0770000-0000-4000-8000-000000000002'::uuid,
        "tenantId", "companyId", 'TEST.CONTROLLED_EVIDENCE.QUALIFY',
        'd0770000-0000-4000-8000-000000000003'::uuid, 1,
        TIMESTAMP '2026-07-24 00:00:00', TIMESTAMP '2026-07-24 00:00:00'
      FROM fixture_scope;
    `,
  );
}

function verifyRoleContract(databaseUrl, marker, verificationMode) {
  runPsqlFile(databaseUrl, path.join(roleSqlDir, "verify-role-contract.sql"), {
    verification_mode: verificationMode,
    ...roleVariables(marker),
  });
}

function roleVariables(marker) {
  return {
    database_name: marker.databaseName,
    owner_role: marker.ownerRole,
    migrator_role: marker.migratorRole,
    runtime_role: marker.runtimeRole,
  };
}

function runGuardContract(migratorDatabaseUrl, marker) {
  runPnpm(
    [
      "--filter",
      "@ogfi/database",
      "exec",
      "vitest",
      "run",
      "src/appendOnlyHistory.integration.test.ts",
    ],
    {
      ...controlledSetupEnvironment(migratorDatabaseUrl, marker),
      APPEND_ONLY_GUARD_CONTRACT: "yes",
      OGFI_APPEND_ONLY_EXPECTED_SESSION_USER: marker.migratorRole,
      OGFI_APPEND_ONLY_EXPECTED_CURRENT_USER: marker.ownerRole,
    },
  );
}

function verifyRuntimeDestructiveOperationsDenied(runtimeDatabaseUrl) {
  for (const table of [
    "AuditEvent",
    "ProjectActivityEvent",
    "InventoryMovement",
    "PettyCashApprovalStepIntent",
    "AttachmentScanAttempt",
    "ControlledEvidenceActionQualification",
    "ControlledEvidenceActionSelection",
  ]) {
    // These mixed-case identifiers come only from this closed allowlist. The
    // generic lifecycle identifier helper deliberately accepts lowercase role
    // and database identifiers only.
    const tableIdentifier = `"${table}"`;
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `UPDATE public.${tableIdentifier} SET id = id WHERE false`,
      "42501",
    );
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `DELETE FROM public.${tableIdentifier} WHERE false`,
      "42501",
    );
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `TRUNCATE TABLE public.${tableIdentifier} CASCADE`,
      "42501",
    );
  }
}

function verifyAuthenticationThrottleRuntimeBoundary(runtimeDatabaseUrl) {
  const rowCount = runPsql(
    runtimeDatabaseUrl,
    "SELECT count(*) FROM public.lock_authentication_throttle_control() WHERE id = 1",
  ).trim();
  if (rowCount !== "1") {
    throw new Error("AUTH_THROTTLE_RUNTIME_SHARED_LOCK_PROBE_FAILED");
  }
  expectPsqlFailure(
    runtimeDatabaseUrl,
    'UPDATE public."AuthenticationThrottleControl" SET "generation" = "generation" + 1 WHERE id = 1',
    "42501",
  );
  expectPsqlFailure(
    runtimeDatabaseUrl,
    'INSERT INTO public."ControlledEvidencePolicyActivationEvent" ("id") VALUES (gen_random_uuid())',
    "42501",
  );
  expectPsqlFailure(
    runtimeDatabaseUrl,
    `SELECT * FROM public.operator_transition_authentication_throttle_control(
      0::bigint, 'ACTIVE'::public."AuthenticationThrottleControlStatus",
      1::integer, repeat('0', 64), repeat('0', 64)
    )`,
    "42501",
  );
}

function verifyControlledEvidenceRuntimeBoundary(runtimeDatabaseUrl, activeSuiteName) {
  runPsql(
    runtimeDatabaseUrl,
    `BEGIN;
     SELECT "id"
       FROM public."ControlledEvidencePolicyActivation"
      ORDER BY "id"
      LIMIT 1
      FOR SHARE;
     ROLLBACK`,
  );
  expectPsqlFailure(
    runtimeDatabaseUrl,
    'UPDATE public."ControlledEvidencePolicyActivation" SET "pointerVersion" = "pointerVersion" WHERE false',
    "42501",
  );
  expectPsqlFailure(
    runtimeDatabaseUrl,
    'INSERT INTO public."ControlledEvidencePolicyVersion" ("id") VALUES (gen_random_uuid())',
    "42501",
  );
  if (activeSuiteName === "controlled-evidence-qualification") {
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `UPDATE public."ControlledEvidencePolicyActivation"
          SET "updatedAt" = "updatedAt"
        WHERE "id" = 'd0770000-0000-4000-8000-000000000002'::uuid`,
      "40001",
    );
  }
}

function verifyControlledEvidenceOwnerBoundary(migratorDatabaseUrl) {
  runPsql(
    migratorDatabaseUrl,
    `SELECT 1 / CASE WHEN
       event."activatedAt" = event."createdAt"
       AND event."activatedAt" <> TIMESTAMP '2026-07-24 00:00:00'
       AND event."canonicalJson" = public."controlled_evidence_canonical_json"(event."canonicalJson"::jsonb)
       AND event."activationHash" = encode(digest(event."canonicalJson", 'sha256'), 'hex')
       AND pointer."createdAt" = pointer."updatedAt"
     THEN 1 ELSE 0 END
       FROM public."ControlledEvidencePolicyActivationEvent" event
       JOIN public."ControlledEvidencePolicyActivation" pointer
         ON pointer."activeActivationEventId" = event."id"
      WHERE event."id" = 'd0770000-0000-4000-8000-000000000003'::uuid`,
  );
  expectPsqlFailure(
    migratorDatabaseUrl,
    `DELETE FROM public."ControlledEvidencePolicyActivation"
      WHERE "id" = 'd0770000-0000-4000-8000-000000000002'::uuid`,
    "55000",
  );
  expectPsqlFailure(
    migratorDatabaseUrl,
    `UPDATE public."ControlledEvidencePolicyActivation"
        SET "pointerVersion" = "pointerVersion" + 1
      WHERE "id" = 'd0770000-0000-4000-8000-000000000002'::uuid`,
    "23503",
  );
}

function verifyRuntimeMarkerBoundary(runtimeDatabaseUrl, expected) {
  expectPsqlFailure(
    runtimeDatabaseUrl,
    "SELECT * FROM ogfi_disposable_control.database_identity",
    "42501",
  );
  const output = runPsql(
    runtimeDatabaseUrl,
    `SELECT database_name || '|' || run_id || '|' || nonce_sha256
       FROM ogfi_disposable_control.verify_database_identity()`,
  ).trim();
  const [databaseName, runId, nonceSha256, extra] = output.split("|");
  if (extra !== undefined) throw new Error("DISPOSABLE_DATABASE_MARKER_MALFORMED");
  assertMarkerRow({ databaseName, runId, nonceSha256 }, expected);
}

function runSeedRepeatability(runtimeDatabaseUrl, marker) {
  runPnpm(
    [
      "--filter",
      "@ogfi/database",
      "exec",
      "vitest",
      "run",
      "src/seed-repeatability.integration.test.ts",
    ],
    buildSeedRepeatabilityEnvironment(
      process.env,
      runtimeDatabaseUrl,
      marker,
      adminUrl,
    ),
  );
}

function runAdversarialRoleContract(
  adminTargetUrl,
  migratorDatabaseUrl,
  runtimeDatabaseUrl,
  marker,
  migratorPassword,
  runtimePassword,
) {
  for (const [driftCase, expectedDiagnostic, repairPath] of adversarialCases) {
    let cleanupCompleted = false;
    try {
      applyAdversarialFixture(adminTargetUrl, marker, "install", driftCase);
      expectRoleVerifierFailure(
        migratorDatabaseUrl,
        marker,
        expectedDiagnostic,
        driftCase,
      );

      if (repairPath === "bootstrap") {
        installSetupRoles(
          adminTargetUrl,
          marker,
          migratorPassword,
          runtimePassword,
        );
        reconcileRoleContract(migratorDatabaseUrl, marker);
      } else if (repairPath === "reconcile") {
        reconcileRoleContract(migratorDatabaseUrl, marker);
      } else {
        applyAdversarialFixture(adminTargetUrl, marker, "cleanup", driftCase);
      }

      verifyRoleContract(migratorDatabaseUrl, marker, "owner");
      verifyRoleContract(runtimeDatabaseUrl, marker, "runtime");
      applyAdversarialFixture(adminTargetUrl, marker, "cleanup", driftCase);
      applyAdversarialFixture(adminTargetUrl, marker, "cleanup", driftCase);
      cleanupCompleted = true;
      verifyRoleContract(migratorDatabaseUrl, marker, "owner");
      verifyRoleContract(runtimeDatabaseUrl, marker, "runtime");
      console.log(`ADVERSARIAL_ROLE_CONTRACT_PASS | ${driftCase} | ${repairPath}`);
    } finally {
      if (!cleanupCompleted) {
        try {
          applyAdversarialFixture(adminTargetUrl, marker, "cleanup", driftCase);
          applyAdversarialFixture(adminTargetUrl, marker, "cleanup", driftCase);
        } catch (error) {
          console.error(
            `Adversarial cleanup failed for ${driftCase}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }
  }
}

function applyAdversarialFixture(databaseUrl, marker, fixtureAction, driftCase) {
  runPsqlFile(
    databaseUrl,
    path.join(roleSqlDir, "adversarial-role-drift.sql"),
    {
      fixture_action: fixtureAction,
      drift_case: driftCase,
      adversarial_role: marker.adversarialRole,
      ...roleVariables(marker),
    },
  );
}

function expectRoleVerifierFailure(
  databaseUrl,
  marker,
  expectedDiagnostic,
  driftCase,
) {
  const result = executePsqlFile(
    databaseUrl,
    path.join(roleSqlDir, "verify-role-contract.sql"),
    {
      verification_mode: "owner",
      ...roleVariables(marker),
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error) throw result.error;
  if (result.status === 0 || !output.includes(expectedDiagnostic)) {
    throw new Error(
      `ADVERSARIAL_ROLE_CONTRACT_EXPECTED_FAILURE_MISSING:${driftCase}:${expectedDiagnostic}`,
    );
  }
}

function dropRoles(adminDatabaseUrl, marker) {
  runPsql(
    adminDatabaseUrl,
    `DROP ROLE IF EXISTS ${quoteIdentifier(marker.runtimeRole)}, ${quoteIdentifier(marker.migratorRole)}, ${quoteIdentifier(marker.ownerRole)}, ${quoteIdentifier(marker.adversarialRole)}`,
  );
}

function verifyMarker(databaseUrl, expected) {
  const output = runPsql(
    databaseUrl,
    `SELECT database_name || '|' || run_id || '|' || nonce_sha256
       FROM ogfi_disposable_control.database_identity
      WHERE singleton = true`,
  ).trim();
  const [databaseName, runId, nonceSha256, extra] = output.split("|");
  if (extra !== undefined) throw new Error("DISPOSABLE_DATABASE_MARKER_MALFORMED");
  assertMarkerRow({ databaseName, runId, nonceSha256 }, expected);
}

function controlledSetupEnvironment(databaseUrl, marker) {
  return {
    ...scrubDatabaseCredentialEnvironment(process.env),
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: databaseUrl,
    DEMO_RESET_DATA: "false",
    OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME: marker.databaseName,
    OGFI_DISPOSABLE_DATABASE_RUN_ID: marker.runId,
    OGFI_DISPOSABLE_DATABASE_NONCE_SHA256: marker.nonceSha256,
  };
}

function disposableAuthenticationThrottleEnvironment(marker) {
  const keyMaterial = createHash("sha512")
    .update(`ogfi-disposable-auth-throttle:${marker.nonce}`, "utf8")
    .digest("hex");
  const keyVersion =
    (Number.parseInt(marker.nonce.slice(0, 8), 16) % 900_000) + 100_000;
  return {
    AUTH_THROTTLE_HMAC_KEY: keyMaterial,
    AUTH_THROTTLE_KEY_VERSION: String(keyVersion),
    AUTH_THROTTLE_WINDOW_MINUTES: "15",
    AUTH_THROTTLE_RETENTION_DAYS: "30",
    AUTH_THROTTLE_IDENTIFIER_SHARDS: "16",
    AUTH_THROTTLE_SOURCE_SHARDS: "16",
    AUTH_THROTTLE_PASSWORD_GLOBAL_LIMIT: "1000000",
    AUTH_THROTTLE_PASSWORD_IDENTIFIER_SHARD_LIMIT: "1000000",
    AUTH_THROTTLE_PASSWORD_SOURCE_SHARD_LIMIT: "1000000",
    AUTH_THROTTLE_PASSWORD_TENANT_LIMIT: "1000000",
    AUTH_THROTTLE_PASSWORD_ACCOUNT_LIMIT: "100",
    AUTH_THROTTLE_MFA_GLOBAL_LIMIT: "1000000",
    AUTH_THROTTLE_MFA_IDENTIFIER_SHARD_LIMIT: "1000000",
    AUTH_THROTTLE_MFA_SOURCE_SHARD_LIMIT: "1000000",
    AUTH_THROTTLE_MFA_TENANT_LIMIT: "1000000",
    AUTH_THROTTLE_MFA_ACCOUNT_LIMIT: "100",
  };
}

function pnpmInvocation(args) {
  if (process.platform !== "win32") {
    return { executable: "pnpm", args };
  }
  const cliPath =
    process.env.npm_execpath ??
    path.join(path.dirname(process.execPath), "node_modules", "corepack", "dist", "pnpm.js");
  if (!existsSync(cliPath) || !/^pnpm\.(?:c?js)$/i.test(path.basename(cliPath))) {
    throw new Error("DISPOSABLE_DATABASE_PNPM_CLI_INVALID");
  }
  return { executable: process.execPath, args: [cliPath, ...args] };
}

function runPnpm(args, env) {
  const invocation = pnpmInvocation(args);
  runCommand(invocation.executable, invocation.args, env);
}

function runPsql(databaseUrl, sql) {
  const result = executePsql(
    databaseUrl,
    ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `psql exited with ${result.status}`);
  }
  return result.stdout ?? "";
}

function runPsqlFile(databaseUrl, file, variables) {
  const result = executePsqlFile(databaseUrl, file, variables);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `psql exited with ${result.status}`);
  }
  return result.stdout ?? "";
}

function executePsqlFile(databaseUrl, file, variables) {
  const args = ["-X", "-v", "ON_ERROR_STOP=1"];
  for (const [key, value] of Object.entries(variables)) {
    args.push("-v", `${key}=${value}`);
  }
  if (process.env.PSQL_DOCKER_CONTAINER) {
    args.push("-f", "-");
    return executePsql(databaseUrl, args, readFileSync(file, "utf8"));
  }
  args.push("-f", file);
  return executePsql(databaseUrl, args);
}

function expectPsqlFailure(databaseUrl, sql, expectedSqlState) {
  const result = executePsql(
    databaseUrl,
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=verbose",
      "-c",
      sql,
    ],
  );
  if (result.error) throw result.error;
  if (result.status === 0 || !result.stderr?.includes(expectedSqlState)) {
    throw new Error(
      `Expected PostgreSQL ${expectedSqlState} for restricted runtime operation: ${sql}`,
    );
  }
}

function executePsql(databaseUrl, args, input) {
  const env = buildPsqlEnvironment(process.env, databaseUrl);
  const container = process.env.PSQL_DOCKER_CONTAINER;
  if (!container) {
    return spawnSync(process.env.PSQL_BIN ?? "psql", args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      env,
      input,
    });
  }
  if (process.env.PSQL_BIN) {
    throw new Error("DISPOSABLE_DATABASE_PSQL_TRANSPORT_CONFLICT");
  }
  assertSafePsqlDockerContainer(container);
  if (!loopbackPsqlHost(env.PGHOST) || env.PGPORT !== "5432") {
    throw new Error("DISPOSABLE_DATABASE_PSQL_DOCKER_TARGET_UNSAFE");
  }
  const forwardedEnvironment = [
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGSSLMODE",
    "PGUSER",
    "PGPASSWORD",
  ].flatMap((name) => (env[name] === undefined ? [] : ["-e", name]));
  return spawnSync(
    "docker",
    ["exec", "-i", ...forwardedEnvironment, container, "psql", ...args],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      env,
      input,
    },
  );
}

function loopbackPsqlHost(host) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
}

function runCommand(executable, args, env) {
  const result = spawnSync(executable, args, {
    cwd: workspaceRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${executable} ${args.join(" ")} exited with ${result.status}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
