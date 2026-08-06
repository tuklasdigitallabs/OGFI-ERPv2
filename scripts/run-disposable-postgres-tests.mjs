import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertMarkerRow,
  assertSafePsqlDockerContainer,
  assertSafeAdminUrl,
  assertSafeDisposableTarget,
  buildPsqlEnvironment,
  buildInventoryPilotBootstrapTestEnvironment,
  buildOpeningStockExecutorTestEnvironment,
  buildRuntimeEnvironment,
  buildSeedRepeatabilityEnvironment,
  createDisposablePostgresIdentity,
  quoteIdentifier,
  quoteLiteral,
  scrubDatabaseCredentialEnvironment,
  shouldRunAdversarialRoleContract,
  shouldRunSeedRepeatability,
  shouldStartInventoryPilotBootstrapBroker,
  targetDatabaseUrl,
} from "./disposable-postgres-lifecycle.mjs";
import { assertPredeployRoleGraph } from "./db-migrate-controlled.mjs";
import {
  buildMigrationManifest,
  inspectMigrationLedger,
} from "./db-migration-ledger-preflight.mjs";

const adversarialCases = [
  ["security_definer", "Runtime or PUBLIC can execute a non-extension public routine", "reconcile"],
  ["column_acl", "PUBLIC or runtime retains a column ACL on AuditEvent", "reconcile"],
  ["owner_membership", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["migrator_membership", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["runtime_membership", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["owner_outgoing_membership", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["migrator_outgoing_membership", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["runtime_outgoing_membership", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["migrator_admin_option", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["migrator_inherit_option", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["migrator_set_option", "Controlled role membership graph must contain only", "startup-refusal"],
  ["nested_runtime_owner_path", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["executor_membership", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["executor_outgoing_membership", "Controlled role membership graph must contain only", "bootstrap-refuses"],
  ["executor_direct_command_table", "Opening-stock executor has direct command-table authority", "reconcile"],
  ["executor_routine_acl", "Runtime or PUBLIC can execute a non-extension public routine", "reconcile"],
  ["executor_seal_trigger_acl", "Opening-stock sealed-event trigger is callable outside its table trigger", "reconcile"],
  ["wrong_ownership", "A supported public object is not owned by the reviewed owner", "bootstrap"],
  ["default_privilege", "Owner default privileges contain an unsafe", "reconcile"],
  ["unexpected_schema", "Unexpected application schema exists", "admin-cleanup"],
];

const approvalShadowObservers = [
  ["PurchaseRequest", "observe_purchase_request_v1"],
  ["QuotationRecommendation", "observe_quotation_recommendation_v1"],
  ["PurchaseOrder", "observe_purchase_order_v1"],
  ["PurchaseOrderBalanceClosure", "observe_purchase_order_balance_closure_v1"],
  ["PurchaseOrderAmendment", "observe_purchase_order_amendment_v1"],
  ["WastageReport", "observe_wastage_report_v1"],
  ["StockAdjustment", "observe_stock_adjustment_v1"],
  ["FinanceCloseRun", "observe_finance_close_run_v1"],
  ["BudgetRevision", "observe_budget_revision_v1"],
  ["ExpenseRequest", "observe_expense_request_v1"],
  ["CashAdvanceRequest", "observe_cash_advance_request_v1"],
  ["PettyCashRequest", "observe_petty_cash_request_v1"],
  ["PaymentRequest", "observe_payment_request_v1"],
  ["PaymentRelease", "observe_payment_release_v1"],
  ["EmployeeLeaveRequest", "observe_employee_leave_request_v1"],
  ["EmployeeOvertimeRecord", "observe_employee_overtime_record_v1"],
  ["WorkforceSchedule", "observe_workforce_schedule_v1"],
  ["AttendanceImportBatch", "observe_attendance_import_batch_v1"],
];

const approvalShadowBranchCaseNames = [
  "purchase-request-brand-present",
  "budget-location-present",
  "cash-beneficiary-present",
  "cash-expense-present",
  "cash-payment-present",
  "cash-bank-present",
  "cash-budget-commitment-present",
  "petty-location-present",
  "leave-location-present",
  "overtime-location-present",
  "budget-line-scope",
  "budget-line-location-present",
  "expense-line-scope",
  "expense-source-link-scope",
  "expense-source-link-line-parent",
  "payment-line-scope-location",
  "payment-line-wrong-location",
  "payment-line-invoice",
  "release-allocation-scope",
  "release-allocation-request-parent",
  "release-allocation-invoice",
  "release-allocation-invoice-scope",
  "schedule-line-scope",
  "schedule-line-wrong-location",
  "schedule-line-employee",
  "attendance-line-scope",
  "attendance-line-wrong-location",
  "attendance-line-employee",
  "closure-parent",
  "amendment-parent",
  "release-parent",
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
const openingStockExecutorPassword = suiteName === "opening-inventory-cutover"
  ? randomBytes(32).toString("base64url")
  : undefined;
const openingStockExecutorUrl = openingStockExecutorPassword
  ? targetDatabaseUrl(adminUrl, identity.databaseName, {
      username: identity.ownerRole.replace(/_owner$/, "_opening_stock_executor"),
      password: openingStockExecutorPassword,
    })
  : undefined;
assertSafeDisposableTarget({
  adminUrl,
  databaseName: identity.databaseName,
  runtimeUrl,
  runtimeRole: identity.runtimeRole,
});
if (openingStockExecutorUrl) {
  assertSafeDisposableTarget({
    adminUrl,
    databaseName: identity.databaseName,
    runtimeUrl: openingStockExecutorUrl,
    runtimeRole: identity.ownerRole.replace(/_owner$/, "_opening_stock_executor"),
  });
}

let databaseCreated = false;
let markerCreated = false;
let exitCode = 1;
let shadowFixtureExitCode = null;
let inventoryPilotBootstrap = null;
try {
  runPsql(adminUrl, `CREATE DATABASE ${quoteIdentifier(identity.databaseName)}`);
  databaseCreated = true;
  verifyCleanAbsentMigrationLedger(setupUrl, identity, decodeURIComponent(parsedAdmin.username));
  installMarker(setupUrl, identity);
  markerCreated = true;
  installSetupRoles(
    setupUrl,
    identity,
    migratorPassword,
    runtimePassword,
    openingStockExecutorPassword,
  );
  assertPredeployRoleGraph(
    "disposable-transport",
    disposableRoleContract(migratorUrl, runtimeUrl, identity),
    executeControlledPsql,
  );

  runPnpm(
    ["db:migrate:deploy"],
    controlledSetupEnvironment(migratorUrl, identity),
  );
  verifyLiveMigrationLedger(migratorUrl, runtimeUrl, identity);
  runPnpm(
    ["db:seed"],
    controlledSetupEnvironment(migratorUrl, identity),
  );
  if (suiteName === "approval-routing-shadow") {
    shadowFixtureExitCode = runChildCommand(
      command,
      controlledSetupEnvironment(migratorUrl, identity),
    );
    console.log(`APPROVAL_SHADOW_FIXTURE_EXIT=${shadowFixtureExitCode}`);
  }
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
  handoffOpeningStockOwner(setupUrl, identity);
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

  if (suiteName === "inventory-approval") {
    installInventoryPilotRollbackHarness(setupUrl, identity);
    verifyInventoryPilotRollbackHarness(setupUrl, runtimeUrl, identity);
  }
  if (shouldVerifyInventoryPilotRuntimeControlPlane(suiteName)) {
    verifyInventoryPilotRuntimeControlPlaneDenied(runtimeUrl);
  }
  if (shouldStartInventoryPilotBootstrapBroker(suiteName)) {
    inventoryPilotBootstrap = startInventoryPilotBootstrapBroker(
      migratorUrl,
      identity,
    );
  }

  exitCode = suiteName === "approval-routing-shadow"
    ? shadowFixtureExitCode ?? 1
    : runChildCommand(
        command,
        buildRuntimeEnvironment(
          { ...process.env, ...disposableThrottleEnv },
          runtimeUrl,
          identity,
          adminUrl,
        ),
        buildInventoryPilotBootstrapTestEnvironment(
          suiteName,
          inventoryPilotBootstrap?.runtimeEnvironment,
        ),
        buildOpeningStockExecutorTestEnvironment(suiteName, openingStockExecutorUrl),
      );
  if (exitCode === 0 && suiteName === "inventory-approval") {
    verifyInventoryPilotStockCountGuardBypassDenied(setupUrl, runtimeUrl);
  }
  if (
    exitCode === 0
    && (suiteName === "approval-routing-backfill" || suiteName === "approval-routing-shadow")
  ) {
    verifyApprovalShadowObservers(migratorUrl, runtimeUrl, setupUrl);
  }
  if (exitCode === 0 && suiteName === "approval-routing-backfill") {
    verifyApprovalRoutingReplicationRoleGuards(setupUrl);
    verifyApprovalIntegrityOwnerGuards(setupUrl);
  }
} finally {
  stopInventoryPilotBootstrapBroker(inventoryPilotBootstrap);
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

function installInventoryPilotRollbackHarness(databaseUrl, marker) {
  runPsql(databaseUrl, `
    CREATE TABLE ogfi_disposable_control.inventory_pilot_audit_failure (
      entity_id uuid NOT NULL,
      event_type text NOT NULL,
      PRIMARY KEY (entity_id, event_type)
    );
    REVOKE ALL ON ogfi_disposable_control.inventory_pilot_audit_failure FROM PUBLIC;
    GRANT SELECT, INSERT, DELETE
      ON ogfi_disposable_control.inventory_pilot_audit_failure
      TO ${quoteIdentifier(marker.runtimeRole)};

    CREATE FUNCTION ogfi_disposable_control.inject_inventory_pilot_audit_failure()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog
    AS $rollback$
    BEGIN
      IF EXISTS (
        SELECT 1
         FROM ogfi_disposable_control.inventory_pilot_audit_failure failure
         WHERE (failure.entity_id = NEW."entityId"
             OR failure.entity_id = '00000000-0000-0000-0000-000000000000'::uuid)
           AND failure.event_type = NEW."eventType"
      ) THEN
        RAISE EXCEPTION 'INVENTORY_PILOT_ROLLBACK_INJECTED';
      END IF;
      RETURN NEW;
    END;
    $rollback$;
    ALTER TABLE ogfi_disposable_control.inventory_pilot_audit_failure
      OWNER TO ${quoteIdentifier(marker.ownerRole)};
    ALTER FUNCTION ogfi_disposable_control.inject_inventory_pilot_audit_failure()
      OWNER TO ${quoteIdentifier(marker.ownerRole)};
    REVOKE ALL ON FUNCTION ogfi_disposable_control.inject_inventory_pilot_audit_failure() FROM PUBLIC;
    REVOKE ALL ON FUNCTION ogfi_disposable_control.inject_inventory_pilot_audit_failure()
      FROM ${quoteIdentifier(marker.runtimeRole)};
    CREATE TRIGGER inventory_pilot_disposable_rollback_trigger
      BEFORE INSERT ON public."AuditEvent"
      FOR EACH ROW EXECUTE FUNCTION ogfi_disposable_control.inject_inventory_pilot_audit_failure();
    ALTER TABLE public."AuditEvent"
      ENABLE ALWAYS TRIGGER inventory_pilot_disposable_rollback_trigger;
  `);
}

function verifyInventoryPilotRollbackHarness(setupDatabaseUrl, runtimeDatabaseUrl, marker) {
  verifyMarker(setupDatabaseUrl, marker);
  runPsql(setupDatabaseUrl, `DO $verify_inventory_pilot_rollback$
  DECLARE
    owner_oid oid := ${quoteLiteral(marker.ownerRole)}::regrole::oid;
    runtime_oid oid := ${quoteLiteral(marker.runtimeRole)}::regrole::oid;
  BEGIN
    IF current_database() <> ${quoteLiteral(marker.databaseName)}
       OR current_database() !~ '^ogfi_(test|ci|rehearsal|disposable|demo_disposable)_' THEN
      RAISE EXCEPTION 'INVENTORY_PILOT_ROLLBACK_HARNESS_DATABASE_UNSAFE';
    END IF;
    IF has_schema_privilege(runtime_oid, 'ogfi_disposable_control', 'CREATE') THEN
      RAISE EXCEPTION 'Inventory-pilot rollback runtime can create control objects';
    END IF;
    PERFORM 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'ogfi_disposable_control'
       AND c.relname = 'inventory_pilot_audit_failure'
       AND c.relkind = 'r'
       AND c.relowner = owner_oid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory-pilot rollback control table ownership drifted';
    END IF;
    IF NOT has_table_privilege(runtime_oid,
         'ogfi_disposable_control.inventory_pilot_audit_failure', 'SELECT,INSERT,DELETE')
       OR has_table_privilege(runtime_oid,
         'ogfi_disposable_control.inventory_pilot_audit_failure',
         'UPDATE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
       OR EXISTS (
         SELECT 1
           FROM pg_attribute a,
             LATERAL aclexplode(a.attacl) acl
          WHERE a.attrelid = 'ogfi_disposable_control.inventory_pilot_audit_failure'::regclass
            AND a.attnum > 0 AND NOT a.attisdropped
            AND acl.grantee IN (0, runtime_oid)
       ) THEN
      RAISE EXCEPTION 'Inventory-pilot rollback control table ACL drifted';
    END IF;
    PERFORM 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'ogfi_disposable_control'
       AND p.proname = 'inject_inventory_pilot_audit_failure'
       AND pg_get_function_identity_arguments(p.oid) = ''
       AND p.prorettype = 'trigger'::regtype
       AND p.proowner = owner_oid
       AND l.lanname = 'plpgsql'
       AND p.provolatile = 'v'
       AND NOT p.proisstrict
       AND NOT p.prosecdef
       AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]
       AND md5(p.prosrc) = '43bfae1bb0243a982f35896d8d487971'
       AND NOT has_function_privilege(runtime_oid, p.oid, 'EXECUTE')
       AND NOT EXISTS (
         SELECT 1
           FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory-pilot rollback injector routine contract drifted';
    END IF;
    PERFORM 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'AuditEvent'
       AND t.tgname = 'inventory_pilot_disposable_rollback_trigger'
       AND NOT t.tgisinternal
       AND t.tgenabled = 'A'
       AND t.tgtype = 7
       AND t.tgfoid =
         'ogfi_disposable_control.inject_inventory_pilot_audit_failure()'::regprocedure
       AND t.tgconstraint = 0
       AND NOT t.tgdeferrable
       AND NOT t.tginitdeferred;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory-pilot rollback trigger contract drifted';
    END IF;
  END
  $verify_inventory_pilot_rollback$;`);

  expectPsqlFailure(
    runtimeDatabaseUrl,
    'UPDATE ogfi_disposable_control.inventory_pilot_audit_failure SET event_type = event_type WHERE false',
    '42501',
  );
  expectPsqlFailure(
    runtimeDatabaseUrl,
    'TRUNCATE TABLE ogfi_disposable_control.inventory_pilot_audit_failure',
    '42501',
  );
  expectPsqlFailure(
    runtimeDatabaseUrl,
    'SELECT ogfi_disposable_control.inject_inventory_pilot_audit_failure()',
    '42501',
  );
}

function verifyInventoryPilotRuntimeControlPlaneDenied(runtimeDatabaseUrl) {
  for (const table of [
    'InventoryPilotConfigurationRevision',
    'InventoryPilotEndpointMembership',
    'InventoryPilotItemMembership',
    'InventoryPilotParticipantMembership',
    'InventoryPilotRouteReadinessMembership',
    'InventoryPilotConfigurationSealOperation',
    'InventoryPilotConfigurationDraft',
    'InventoryPilotDraftEndpointMembership',
    'InventoryPilotDraftItemMembership',
    'InventoryPilotDraftParticipant',
    'InventoryPilotDraftRouteReadiness',
    'InventoryPilotFamilyActivationEvent',
    'InventoryPilotFamilyActivation',
  ]) {
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `UPDATE public."${table}" SET "id" = "id" WHERE false`,
      '42501',
    );
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `DELETE FROM public."${table}" WHERE false`,
      '42501',
    );
  }
  for (const table of [
    'InventoryTransferApprovalSubmissionIntent',
    'StockCountReviewSubmissionIntent',
  ]) {
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `UPDATE public."${table}" SET "id" = "id" WHERE false`,
      '42501',
    );
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `DELETE FROM public."${table}" WHERE false`,
      '42501',
    );
  }
  expectPsqlFailure(
    runtimeDatabaseUrl,
    "SELECT public.inventory_pilot_revision_canonical_json(gen_random_uuid())",
    '23514',
  );
  expectPsqlFailure(
    runtimeDatabaseUrl,
    "SELECT public.inventory_pilot_approval_rule_canonical_json(gen_random_uuid())",
    '23514',
  );
  for (const validator of [
    'validate_inventory_pilot_revision_digest',
    'validate_inventory_pilot_route_snapshot',
    'validate_inventory_pilot_draft_header_write',
    'validate_inventory_pilot_draft_child_write',
    'validate_inventory_pilot_seal_operation',
    'validate_inventory_pilot_draft_terminal',
  ]) {
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `SELECT public.${validator}()`,
      '42501',
    );
  }
}

function shouldVerifyInventoryPilotRuntimeControlPlane(suiteName) {
  return suiteName === 'inventory-approval'
    || suiteName === 'authorization-procurement-inventory';
}

function verifyInventoryPilotStockCountGuardBypassDenied(
  setupDatabaseUrl,
  runtimeDatabaseUrl,
) {
  expectPsqlFailure(
    runtimeDatabaseUrl,
    'ALTER TABLE public."StockCountAttempt" DISABLE TRIGGER "StockCountAttempt_history_guard"',
    '42501',
  );
  expectPsqlFailureOneOf(
    setupDatabaseUrl,
    `BEGIN;
     SET LOCAL session_replication_role = replica;
     UPDATE public."StockCountAttempt"
        SET "evidenceReference" = coalesce("evidenceReference", '') || ':replication-bypass'
      WHERE id = (
        SELECT id
          FROM public."StockCountAttempt"
         WHERE status IN ('SUBMITTED', 'REVIEWED', 'RECOUNT_REQUESTED', 'CANCELLED', 'VOIDED_FOR_RECOUNT')
         ORDER BY id
         LIMIT 1
      );
     ROLLBACK;`,
    ['42501', '55000'],
  );
}
process.exitCode = exitCode;

function runChildCommand(childCommand, env, ...additionalEnvironments) {
  const childInvocation =
    childCommand[0] === "pnpm"
      ? pnpmInvocation(childCommand.slice(1))
      : { executable: childCommand[0], args: childCommand.slice(1) };
  const child = spawnSync(childInvocation.executable, childInvocation.args, {
    cwd: workspaceRoot,
    env: Object.assign({}, env, ...additionalEnvironments),
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  return child.status ?? 1;
}

function startInventoryPilotBootstrapBroker(migrationDatabaseUrl, marker) {
  const socketPath = `/tmp/ogfi-inventory-bootstrap-${marker.nonce.slice(0, 24)}.sock`;
  const token = randomBytes(32).toString("base64url");
  rmSync(socketPath, { force: true });
  const ownerSwitchUrl = new URL(migrationDatabaseUrl);
  ownerSwitchUrl.searchParams.set("options", `-c role=${marker.ownerRole}`);
  const invocation = pnpmInvocation([
    "--dir", "apps/web", "exec", "tsx",
    "tests/helpers/inventoryPilotApprovalPgBootstrapBroker.ts",
  ]);
  const child = spawn(invocation.executable, invocation.args, {
    cwd: workspaceRoot,
    env: {
      ...controlledSetupEnvironment(ownerSwitchUrl.toString(), marker),
      OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET: socketPath,
      OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN: token,
    },
    stdio: "inherit",
  });
  const deadline = Date.now() + 20_000;
  while (!existsSync(socketPath)) {
    if (child.exitCode !== null) {
      throw new Error("INVENTORY_PILOT_BOOTSTRAP_BROKER_EXITED");
    }
    if (Date.now() >= deadline) {
      child.kill("SIGTERM");
      throw new Error("INVENTORY_PILOT_BOOTSTRAP_BROKER_TIMEOUT");
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  return {
    child,
    socketPath,
    runtimeEnvironment: {
      OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET: socketPath,
      OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN: token,
    },
  };
}

function stopInventoryPilotBootstrapBroker(broker) {
  if (!broker) return;
  broker.child.kill("SIGTERM");
  rmSync(broker.socketPath, { force: true });
}

function verifyApprovalShadowObservers(
  migratorDatabaseUrl,
  runtimeDatabaseUrl,
  disposableAdminDatabaseUrl,
) {
  const canonicalCreatedAt = "2026-07-22T04:00:00.000Z";
  const fixtureSelect = (documentType) => `
    SELECT ai."tenantId", ai."companyId", ai."id", ai."documentId"
      FROM public."ApprovalInstance" ai
      JOIN public."Company" company
        ON company."id" = ai."companyId"
       AND company."tenantId" = ai."tenantId"
     WHERE company."legalName" = 'Approval Breadth Company'
       AND ai."documentType" = ${quoteLiteral(documentType)}
       AND ai."createdAt" = ${quoteLiteral(canonicalCreatedAt)}::timestamptz`;
  const observerCall = (routineName, args) => {
    if (!/^observe_[a-z_]+_v1$/.test(routineName)) {
      throw new Error(`APPROVAL_SHADOW_ROUTINE_NAME_INVALID:${routineName}`);
    }
    return `approval_shadow.${routineName}(${args})`;
  };

  const probes = approvalShadowObservers.map(
    ([documentType, routineName], index) => {
      const [wrongFamily] =
        approvalShadowObservers[(index + 1) % approvalShadowObservers.length];
      const call = (args) => observerCall(routineName, args);
      return `
        DO $approval_shadow_probe$
        DECLARE
          fixture record;
          wrong_family_fixture record;
          actual text;
          fixture_count integer;
        BEGIN
          SELECT count(*) INTO fixture_count
            FROM (${fixtureSelect(documentType)}) canonical_fixture;
          IF fixture_count <> 1 THEN
            RAISE EXCEPTION 'APPROVAL_SHADOW_FIXTURE_CARDINALITY:%:%',
              ${quoteLiteral(documentType)}, fixture_count;
          END IF;

          SELECT * INTO STRICT fixture FROM (${fixtureSelect(documentType)}) canonical_fixture;
          SELECT * INTO STRICT wrong_family_fixture FROM (${fixtureSelect(wrongFamily)}) canonical_fixture;

          SELECT ${call(
            'fixture."tenantId", fixture."companyId", fixture."id"',
          )} INTO actual;
          IF actual IS DISTINCT FROM 'SHADOW_MATCH' THEN
            RAISE EXCEPTION 'APPROVAL_SHADOW_EXPECTED_MATCH:%:%',
              ${quoteLiteral(documentType)}, actual;
          END IF;

          SELECT ${call("NULL::uuid, NULL::uuid, NULL::uuid")} INTO actual;
          IF actual IS DISTINCT FROM 'SHADOW_NO_MATCH' THEN
            RAISE EXCEPTION 'APPROVAL_SHADOW_NULL_INPUT_MATCHED:%', ${quoteLiteral(documentType)};
          END IF;

          SELECT ${call(
            'fixture."tenantId", fixture."companyId", gen_random_uuid()',
          )} INTO actual;
          IF actual IS DISTINCT FROM 'SHADOW_NO_MATCH' THEN
            RAISE EXCEPTION 'APPROVAL_SHADOW_RANDOM_INSTANCE_MATCHED:%', ${quoteLiteral(documentType)};
          END IF;

          SELECT ${call(
            'gen_random_uuid(), fixture."companyId", fixture."id"',
          )} INTO actual;
          IF actual IS DISTINCT FROM 'SHADOW_NO_MATCH' THEN
            RAISE EXCEPTION 'APPROVAL_SHADOW_WRONG_TENANT_MATCHED:%', ${quoteLiteral(documentType)};
          END IF;

          SELECT ${call(
            'fixture."tenantId", gen_random_uuid(), fixture."id"',
          )} INTO actual;
          IF actual IS DISTINCT FROM 'SHADOW_NO_MATCH' THEN
            RAISE EXCEPTION 'APPROVAL_SHADOW_WRONG_COMPANY_MATCHED:%', ${quoteLiteral(documentType)};
          END IF;

          SELECT ${call(
            'fixture."tenantId", fixture."companyId", wrong_family_fixture."id"',
          )} INTO actual;
          IF actual IS DISTINCT FROM 'SHADOW_NO_MATCH' THEN
            RAISE EXCEPTION 'APPROVAL_SHADOW_WRONG_FAMILY_MATCHED:%:%',
              ${quoteLiteral(documentType)}, ${quoteLiteral(wrongFamily)};
          END IF;
        END
        $approval_shadow_probe$;`;
    },
  );

  // READ ONLY makes the closed set of positive and negative calls executable
  // evidence that none of the observer routines can write application data.
  for (const probe of probes) {
    runPsql(
      migratorDatabaseUrl,
      `BEGIN TRANSACTION READ ONLY;${probe}COMMIT;`,
    );
  }

  for (const [, routineName] of approvalShadowObservers) {
    expectPsqlFailure(
      runtimeDatabaseUrl,
      `SELECT ${observerCall(
        routineName,
        "NULL::uuid, NULL::uuid, NULL::uuid",
      )}`,
      "42501",
    );
  }

  // Exercise one predicate-specific corruption without weakening constraints or
  // retaining fixture changes. The post-rollback call proves restoration.
  const financeFixture = fixtureSelect("FinanceCloseRun");
  runPsql(
    migratorDatabaseUrl,
    `BEGIN;
     UPDATE public."FinanceCloseRun"
        SET "configSnapshot" = "configSnapshot" #- '{pendingSensitiveApproval,requestedAt}'
      WHERE "id" = (SELECT "documentId" FROM (${financeFixture}) fixture);
     DO $approval_shadow_lineage$
     DECLARE fixture record; actual text;
     BEGIN
       SELECT * INTO STRICT fixture FROM (${financeFixture}) canonical_fixture;
       SELECT approval_shadow.observe_finance_close_run_v1(
         fixture."tenantId", fixture."companyId", fixture."id"
       ) INTO actual;
       IF actual IS DISTINCT FROM 'SHADOW_NO_MATCH' THEN
         RAISE EXCEPTION 'APPROVAL_SHADOW_FINANCE_LINEAGE_CORRUPTION_MATCHED:%', actual;
       END IF;
     END
     $approval_shadow_lineage$;
     ROLLBACK;
     SELECT 1 / CASE WHEN approval_shadow.observe_finance_close_run_v1(
       fixture."tenantId", fixture."companyId", fixture."id"
     ) = 'SHADOW_MATCH' THEN 1 ELSE 0 END
       FROM (${financeFixture}) fixture`,
  );

  verifyApprovalShadowObserverBranchMatrix(
    disposableAdminDatabaseUrl,
    fixtureSelect,
    observerCall,
  );

  const controlledIterations = 25;
  const planEvidence = [];
  for (const [documentType, routineName] of approvalShadowObservers) {
    const fixtureOutput = runPsql(
      migratorDatabaseUrl,
      `SELECT "tenantId", "companyId", "id" FROM (${fixtureSelect(documentType)}) fixture`,
    ).trim();
    const [tenantId, companyId, approvalInstanceId, extra] =
      fixtureOutput.split("|");
    if (
      extra !== undefined ||
      !validUuid(tenantId) ||
      !validUuid(companyId) ||
      !validUuid(approvalInstanceId)
    ) {
      throw new Error(`APPROVAL_SHADOW_PLAN_FIXTURE_INVALID:${documentType}`);
    }
    const validInvocation = observerCall(
      routineName,
      `${quoteLiteral(tenantId)}::uuid, ${quoteLiteral(companyId)}::uuid, ${quoteLiteral(approvalInstanceId)}::uuid`,
    );
    const explainOutput = runPsql(
      migratorDatabaseUrl,
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING ON, SUMMARY ON)
       SELECT ${validInvocation}`,
    ).trim();
    let explain;
    try {
      explain = JSON.parse(explainOutput);
    } catch {
      throw new Error(`APPROVAL_SHADOW_EXPLAIN_JSON_INVALID:${documentType}`);
    }
    const executionTimeMs = explain?.[0]?.["Execution Time"];
    if (!Number.isFinite(executionTimeMs) || executionTimeMs < 0) {
      throw new Error(`APPROVAL_SHADOW_EXPLAIN_TIMING_INVALID:${documentType}`);
    }

    const correlatedInvocation = observerCall(
      routineName,
      `${quoteLiteral(tenantId)}::uuid, ${quoteLiteral(companyId)}::uuid,
       CASE WHEN series.ordinal > 0 THEN ${quoteLiteral(approvalInstanceId)}::uuid ELSE NULL::uuid END`,
    );
    const matchCount = runPsql(
      migratorDatabaseUrl,
      `SELECT count(*)
         FROM generate_series(1, ${controlledIterations}) AS series(ordinal)
        WHERE ${correlatedInvocation} = 'SHADOW_MATCH'`,
    ).trim();
    if (matchCount !== String(controlledIterations)) {
      throw new Error(
        `APPROVAL_SHADOW_CONTROLLED_LOAD_MISMATCH:${documentType}:${matchCount}`,
      );
    }
    planEvidence.push(executionTimeMs);
  }

  const slowestExplainMs = Math.max(...planEvidence).toFixed(3);

  console.log(
    "APPROVAL_SHADOW_OBSERVER_PASS | 18 positive | null/random/scope/family negative | runtime denied | read-only | rollback lineage | 31 optional/child/post-child rollback corruptions",
  );
  console.log(
    `APPROVAL_SHADOW_PLAN_LOAD_EVIDENCE | 18 single-call EXPLAIN ANALYZE/BUFFERS | separate ${controlledIterations}-call correlated checks | slowest single-call fixture ${slowestExplainMs} ms | disposable non-production volume`,
  );
}

function verifyApprovalShadowObserverBranchMatrix(databaseUrl, fixtureSelect, observerCall) {
  const sourceId = `(SELECT "documentId" FROM shadow_case_context)`;
  const tenantId = `(SELECT "tenantId" FROM shadow_case_context)`;
  const companyId = `(SELECT "companyId" FROM shadow_case_context)`;
  const auxCompanyId = `(SELECT aux_company_id FROM shadow_case_context)`;
  const auxLocationId = `(SELECT aux_location_id FROM shadow_case_context)`;
  const auxTenantId = `(SELECT aux_tenant_id FROM shadow_case_context)`;
  const requesterId = `(SELECT "id" FROM public."User" WHERE "tenantId"=${tenantId} AND "displayName"='Breadth Requester' ORDER BY "createdAt" DESC LIMIT 1)`;
  const supplierId = `(SELECT "id" FROM public."Supplier" WHERE "tenantId"=${tenantId} AND "companyId"=${companyId} AND "legalName"='Breadth Supplier' ORDER BY "createdAt" DESC LIMIT 1)`;
  const fixtureDocumentId = (documentType) => `(SELECT "documentId" FROM public."ApprovalInstance" WHERE "tenantId"=${tenantId} AND "companyId"=${companyId} AND "documentType"=${quoteLiteral(documentType)} ORDER BY "createdAt" DESC, "id" DESC LIMIT 1)`;

  const corruptOne = (table, updateSql) => `
    ALTER TABLE public.${quoteShadowIdentifier(table)} DISABLE TRIGGER ALL;
    WITH changed AS (${updateSql} RETURNING 1)
    SELECT 1 / CASE WHEN count(*) = 1 THEN 1 ELSE 0 END FROM changed;
    ALTER TABLE public.${quoteShadowIdentifier(table)} ENABLE TRIGGER ALL;`;
  const mutateCompany = (table, where) => corruptOne(
    table,
    `UPDATE public.${quoteShadowIdentifier(table)} SET "companyId"=${auxCompanyId} WHERE ${where} AND "companyId" IS DISTINCT FROM ${auxCompanyId}`,
  );
  const mutateLocation = (table, where) => corruptOne(
    table,
    `UPDATE public.${quoteShadowIdentifier(table)} row_data
        SET "locationId" = (
          SELECT location."id" FROM public."Location" location
           WHERE location."tenantId" = row_data."tenantId"
             AND location."companyId" = row_data."companyId"
             AND location."id" <> row_data."locationId"
           ORDER BY location."createdAt", location."id" LIMIT 1
        )
      WHERE ${where}
        AND EXISTS (
          SELECT 1 FROM public."Location" location
           WHERE location."tenantId" = row_data."tenantId"
             AND location."companyId" = row_data."companyId"
             AND location."id" <> row_data."locationId"
        )`,
  );

  const expenseLineSetup = `
    INSERT INTO public."ExpenseRequestLine" (
      "id", "expenseRequestId", "tenantId", "companyId", "lineNumber", "lineDate",
      "description", "categoryCode", "requestedAmountPhp", "lineTotalPhp", "createdByUserId", "updatedAt"
    ) VALUES (
      gen_random_uuid(), ${sourceId}, ${tenantId}, ${companyId}, 9001, now(),
      'Shadow branch fixture', 'TEST', 1, 1, ${requesterId}, now()
    );`;
  const apInvoiceSetup = `
    INSERT INTO public."ApInvoice" (
      "id", "tenantId", "companyId", "publicReference", "supplierId",
      "supplierInvoiceNumber", "invoiceDate", "totalAmount", "nonPoReason",
      "createdByUserId", "updatedAt"
    ) VALUES (
      gen_random_uuid(), ${tenantId}, ${companyId}, 'SHADOW-INV-' || gen_random_uuid()::text,
      ${supplierId}, 'SHADOW-' || gen_random_uuid()::text, now(), 1,
      'Disposable shadow observer fixture', ${requesterId}, now()
    );`;
  const paymentLineSetup = `${apInvoiceSetup}
    INSERT INTO public."PaymentRequestLine" (
      "id", "tenantId", "companyId", "locationId", "paymentRequestId", "apInvoiceId",
      "lineNumber", "requestedAmount", "invoiceTotalSnapshot", "invoiceOutstandingSnapshot", "createdByUserId", "updatedAt"
    ) SELECT gen_random_uuid(), ${tenantId}, ${companyId}, source."locationId", source."id", invoice."id",
             9001, 1, 1, 1, source."requestedByUserId", now()
      FROM public."PaymentRequest" source
      CROSS JOIN LATERAL (
        SELECT "id" FROM public."ApInvoice"
         WHERE "tenantId"=${tenantId} AND "companyId"=${companyId}
         ORDER BY "createdAt" DESC, "id" DESC LIMIT 1
      ) invoice
     WHERE source."id"=${sourceId};`;
  const releaseChildSetup = `${apInvoiceSetup}
    INSERT INTO public."PaymentRequestLine" (
      "id", "tenantId", "companyId", "locationId", "paymentRequestId", "apInvoiceId",
      "lineNumber", "requestedAmount", "invoiceTotalSnapshot", "invoiceOutstandingSnapshot", "createdByUserId", "updatedAt"
    ) SELECT gen_random_uuid(), ${tenantId}, ${companyId}, request."locationId", request."id", invoice."id",
             9001, 1, 1, 1, request."requestedByUserId", now()
      FROM public."PaymentRelease" release
      JOIN public."PaymentRequest" request ON request."id"=release."paymentRequestId"
      CROSS JOIN LATERAL (
        SELECT "id" FROM public."ApInvoice"
         WHERE "tenantId"=${tenantId} AND "companyId"=${companyId}
         ORDER BY "createdAt" DESC, "id" DESC LIMIT 1
      ) invoice
     WHERE release."id"=${sourceId};
    INSERT INTO public."PaymentReleaseAllocation" (
      "id", "tenantId", "companyId", "paymentReleaseId", "paymentRequestLineId", "apInvoiceId",
      "allocatedAmount", "requestLineSnapshotAmount", "invoiceOutstandingSnapshot", "createdByUserId", "updatedAt"
    ) SELECT gen_random_uuid(), ${tenantId}, ${companyId}, release."id", line."id", line."apInvoiceId",
             1, 1, 1, release."createdByUserId", now()
      FROM public."PaymentRelease" release
      JOIN public."PaymentRequestLine" line ON line."paymentRequestId"=release."paymentRequestId"
     WHERE release."id"=${sourceId};`;

  const cases = [
    {
      name: "purchase-request-brand-present",
      documentType: "PurchaseRequest", routineName: "observe_purchase_request_v1",
      tables: ["PurchaseRequest", "Brand"],
      setup: `INSERT INTO public."Brand" ("id","tenantId","companyId","name","code","updatedAt") VALUES (gen_random_uuid(),${tenantId},${companyId},'Shadow Brand','SHADOW-'||gen_random_uuid()::text,now()); UPDATE public."PurchaseRequest" SET "brandId"=(SELECT "id" FROM public."Brand" WHERE "name"='Shadow Brand' AND "tenantId"=${tenantId} ORDER BY "createdAt" DESC LIMIT 1) WHERE "id"=${sourceId};`,
      mutation: mutateCompany("Brand", `"id"=(SELECT "brandId" FROM public."PurchaseRequest" WHERE "id"=${sourceId})`),
    },
    {
      name: "budget-location-present", documentType: "BudgetRevision", routineName: "observe_budget_revision_v1",
      tables: ["Budget", "Location"], setup: "",
      mutation: mutateCompany("Location", `"id"=(SELECT budget."locationId" FROM public."BudgetRevision" source JOIN public."Budget" budget ON budget."id"=source."budgetId" WHERE source."id"=${sourceId})`),
    },
    {
      name: "cash-beneficiary-present", documentType: "CashAdvanceRequest", routineName: "observe_cash_advance_request_v1",
      tables: ["CashAdvanceRequest", "User"], setup: "",
      mutation: corruptOne("User", `UPDATE public."User" SET "tenantId"=${auxTenantId} WHERE "id"=(SELECT "beneficiaryUserId" FROM public."CashAdvanceRequest" WHERE "id"=${sourceId}) AND "tenantId" IS DISTINCT FROM ${auxTenantId}`),
    },
    ...[
      ["cash-expense-present", "expenseRequestId", "ExpenseRequest"],
      ["cash-payment-present", "paymentRequestId", "PaymentRequest"],
      ["cash-bank-present", "intendedBankAccountId", "BankAccount"],
    ].map(([name, field, target]) => ({
      name, documentType: "CashAdvanceRequest", routineName: "observe_cash_advance_request_v1",
      tables: ["CashAdvanceRequest", target],
      setup: `UPDATE public."CashAdvanceRequest" SET ${quoteShadowIdentifier(field)}=${target === "BankAccount" ? `(SELECT "id" FROM public."BankAccount" WHERE "tenantId"=${tenantId} AND "companyId"=${companyId} ORDER BY "createdAt" LIMIT 1)` : fixtureDocumentId(target)} WHERE "id"=${sourceId};`,
      mutation: mutateCompany(target, `"id"=(SELECT ${quoteShadowIdentifier(field)} FROM public."CashAdvanceRequest" WHERE "id"=${sourceId})`),
    })),
    {
      name: "cash-budget-commitment-present", documentType: "CashAdvanceRequest", routineName: "observe_cash_advance_request_v1",
      tables: ["CashAdvanceRequest", "BudgetCommitment"],
      setup: `INSERT INTO public."BudgetCommitment" ("id","budgetId","budgetLineId","tenantId","companyId","sourceType","sourceId","sourceEventKey","sourceEventAt","sourceReference","committedAmountPhp","updatedAt") SELECT gen_random_uuid(), line."budgetId", line."id", ${tenantId}, ${companyId}, 'EXPENSE_REQUEST', 'shadow', 'shadow-'||gen_random_uuid()::text, now(), 'SHADOW', 1, now() FROM public."BudgetLine" line WHERE line."tenantId"=${tenantId} AND line."companyId"=${companyId} ORDER BY line."createdAt" LIMIT 1; UPDATE public."CashAdvanceRequest" SET "budgetCommitmentId"=(SELECT "id" FROM public."BudgetCommitment" WHERE "sourceId"='shadow' AND "tenantId"=${tenantId} ORDER BY "createdAt" DESC LIMIT 1) WHERE "id"=${sourceId};`,
      mutation: mutateCompany("BudgetCommitment", `"id"=(SELECT "budgetCommitmentId" FROM public."CashAdvanceRequest" WHERE "id"=${sourceId})`),
    },
    {
      name: "petty-location-present", documentType: "PettyCashRequest", routineName: "observe_petty_cash_request_v1",
      tables: ["PettyCashRequest"], setup: `UPDATE public."PettyCashRequest" source SET "locationId"=fund."locationId" FROM public."PettyCashFund" fund WHERE source."id"=${sourceId} AND fund."id"=source."pettyCashFundId";`,
      mutation: mutateLocation("PettyCashRequest", `row_data."id"=${sourceId}`),
    },
    ...[
      ["leave-location-present", "EmployeeLeaveRequest", "observe_employee_leave_request_v1"],
      ["overtime-location-present", "EmployeeOvertimeRecord", "observe_employee_overtime_record_v1"],
    ].map(([name, documentType, routineName]) => ({
      name, documentType, routineName, tables: [documentType, "Location"], setup: "",
      mutation: mutateCompany("Location", `"id"=(SELECT "locationId" FROM public.${quoteShadowIdentifier(documentType)} WHERE "id"=${sourceId})`),
    })),
    {
      name: "budget-line-scope", documentType: "BudgetRevision", routineName: "observe_budget_revision_v1",
      tables: ["BudgetLine"], setup: "",
      mutation: mutateCompany("BudgetLine", `"budgetId"=(SELECT "budgetId" FROM public."BudgetRevision" WHERE "id"=${sourceId})`),
    },
    {
      name: "budget-line-location-present", documentType: "BudgetRevision", routineName: "observe_budget_revision_v1",
      tables: ["BudgetLine", "Location"], setup: "",
      mutation: mutateCompany("Location", `"id"=(SELECT "locationId" FROM public."BudgetLine" WHERE "budgetId"=(SELECT "budgetId" FROM public."BudgetRevision" WHERE "id"=${sourceId}) AND "locationId" IS NOT NULL ORDER BY "lineNumber" LIMIT 1)`),
    },
    {
      name: "expense-line-scope", documentType: "ExpenseRequest", routineName: "observe_expense_request_v1",
      tables: ["ExpenseRequestLine"], setup: expenseLineSetup,
      mutation: mutateCompany("ExpenseRequestLine", `"expenseRequestId"=${sourceId}`),
    },
    {
      name: "expense-source-link-scope", documentType: "ExpenseRequest", routineName: "observe_expense_request_v1",
      tables: ["ExpenseRequestLine", "ExpenseRequestSourceLink"], setup: `${expenseLineSetup} INSERT INTO public."ExpenseRequestSourceLink" ("id","tenantId","companyId","expenseRequestId","expenseRequestLineId","sourceDocumentType","sourceDocumentId","sourceEventKey","createdByUserId","updatedAt") SELECT gen_random_uuid(),${tenantId},${companyId},${sourceId},line."id",'MANUAL','shadow','shadow-'||gen_random_uuid()::text,${requesterId},now() FROM public."ExpenseRequestLine" line WHERE line."expenseRequestId"=${sourceId};`,
      mutation: mutateCompany("ExpenseRequestSourceLink", `"expenseRequestId"=${sourceId}`),
    },
    {
      name: "expense-source-link-line-parent", documentType: "ExpenseRequest", routineName: "observe_expense_request_v1",
      tables: ["ExpenseRequest", "ExpenseRequestLine", "ExpenseRequestSourceLink"],
      setup: `${expenseLineSetup} INSERT INTO public."ExpenseRequestSourceLink" ("id","tenantId","companyId","expenseRequestId","expenseRequestLineId","sourceDocumentType","sourceDocumentId","sourceEventKey","createdByUserId","updatedAt") SELECT gen_random_uuid(),${tenantId},${companyId},${sourceId},line."id",'MANUAL','shadow','shadow-'||gen_random_uuid()::text,${requesterId},now() FROM public."ExpenseRequestLine" line WHERE line."expenseRequestId"=${sourceId}; INSERT INTO public."ExpenseRequest" ("id","tenantId","companyId","publicReference","requestDate","title","requestReason","categoryCode","locationId","requestedByUserId","updatedAt") SELECT gen_random_uuid(),${tenantId},${companyId},'SHADOW-EXP-'||gen_random_uuid()::text,source."requestDate",'Shadow','Shadow','TEST',source."locationId",source."requestedByUserId",now() FROM public."ExpenseRequest" source WHERE source."id"=${sourceId};`,
      mutation: corruptOne("ExpenseRequestLine", `UPDATE public."ExpenseRequestLine" SET "expenseRequestId"=(SELECT "id" FROM public."ExpenseRequest" WHERE "id"<>${sourceId} AND "publicReference" LIKE 'SHADOW-EXP-%' ORDER BY "createdAt" DESC LIMIT 1) WHERE "expenseRequestId"=${sourceId}`),
    },
    {
      name: "payment-line-scope-location", documentType: "PaymentRequest", routineName: "observe_payment_request_v1",
      tables: ["ApInvoice", "PaymentRequestLine"], setup: paymentLineSetup,
      mutation: mutateCompany("PaymentRequestLine", `"paymentRequestId"=${sourceId}`),
    },
    {
      name: "payment-line-wrong-location", documentType: "PaymentRequest", routineName: "observe_payment_request_v1",
      tables: ["ApInvoice", "PaymentRequestLine"], setup: paymentLineSetup,
      mutation: mutateLocation("PaymentRequestLine", `row_data."paymentRequestId"=${sourceId}`),
    },
    {
      name: "payment-line-invoice", documentType: "PaymentRequest", routineName: "observe_payment_request_v1",
      tables: ["ApInvoice", "PaymentRequestLine"], setup: paymentLineSetup,
      mutation: mutateCompany("ApInvoice", `"id"=(SELECT "apInvoiceId" FROM public."PaymentRequestLine" WHERE "paymentRequestId"=${sourceId})`),
    },
    {
      name: "release-allocation-scope", documentType: "PaymentRelease", routineName: "observe_payment_release_v1",
      tables: ["ApInvoice", "PaymentRequestLine", "PaymentReleaseAllocation"], setup: releaseChildSetup,
      mutation: mutateCompany("PaymentReleaseAllocation", `"paymentReleaseId"=${sourceId}`),
    },
    {
      name: "release-allocation-request-parent", documentType: "PaymentRelease", routineName: "observe_payment_release_v1",
      tables: ["ApInvoice", "PaymentRequest", "PaymentRequestLine", "PaymentReleaseAllocation"], setup: `${releaseChildSetup} INSERT INTO public."PaymentRequest" ("id","tenantId","companyId","locationId","supplierId","publicReference","totalRequestedAmount","requestedByUserId","requestReason","updatedAt") SELECT gen_random_uuid(),${tenantId},${companyId},source."locationId",source."supplierId",'SHADOW-PAY-'||gen_random_uuid()::text,1,source."requestedByUserId",'Shadow',now() FROM public."PaymentRequest" source JOIN public."PaymentRelease" release ON release."paymentRequestId"=source."id" WHERE release."id"=${sourceId};`,
      mutation: corruptOne("PaymentRequestLine", `UPDATE public."PaymentRequestLine" SET "paymentRequestId"=(SELECT "id" FROM public."PaymentRequest" WHERE "publicReference" LIKE 'SHADOW-PAY-%' ORDER BY "createdAt" DESC LIMIT 1) WHERE "id"=(SELECT "paymentRequestLineId" FROM public."PaymentReleaseAllocation" WHERE "paymentReleaseId"=${sourceId})`),
    },
    {
      name: "release-allocation-invoice", documentType: "PaymentRelease", routineName: "observe_payment_release_v1",
      tables: ["ApInvoice", "PaymentRequestLine", "PaymentReleaseAllocation"], setup: `${releaseChildSetup} ${apInvoiceSetup}`,
      mutation: corruptOne("PaymentReleaseAllocation", `UPDATE public."PaymentReleaseAllocation" allocation SET "apInvoiceId"=(SELECT invoice."id" FROM public."ApInvoice" invoice WHERE invoice."tenantId"=${tenantId} AND invoice."companyId"=${companyId} AND invoice."id"<>allocation."apInvoiceId" ORDER BY invoice."createdAt" DESC LIMIT 1) WHERE allocation."paymentReleaseId"=${sourceId}`),
    },
    {
      name: "release-allocation-invoice-scope", documentType: "PaymentRelease", routineName: "observe_payment_release_v1",
      tables: ["ApInvoice", "PaymentRequestLine", "PaymentReleaseAllocation"], setup: releaseChildSetup,
      mutation: mutateCompany("ApInvoice", `"id"=(SELECT "apInvoiceId" FROM public."PaymentReleaseAllocation" WHERE "paymentReleaseId"=${sourceId})`),
    },
    ...[
      ["schedule-line", "WorkforceSchedule", "observe_workforce_schedule_v1", "WorkforceScheduleLine", `INSERT INTO public."WorkforceScheduleLine" ("id","tenantId","companyId","workforceScheduleId","locationId","employeeId","lineNumber","stationCode","roleLabel","plannedStartAt","plannedEndAt","plannedMinutes","createdByUserId","updatedAt") SELECT gen_random_uuid(),${tenantId},${companyId},source."id",source."locationId",employee."id",9001,'SHADOW','Shadow',now(),now()+interval '1 hour',60,source."createdByUserId",now() FROM public."WorkforceSchedule" source CROSS JOIN LATERAL (SELECT "id" FROM public."Employee" WHERE "tenantId"=${tenantId} AND "companyId"=${companyId} ORDER BY "createdAt" LIMIT 1) employee WHERE source."id"=${sourceId};`],
      ["attendance-line", "AttendanceImportBatch", "observe_attendance_import_batch_v1", "AttendanceImportLine", `INSERT INTO public."AttendanceImportLine" ("id","tenantId","companyId","attendanceImportBatchId","locationId","employeeId","sourceRowNumber","updatedAt") SELECT gen_random_uuid(),${tenantId},${companyId},source."id",source."locationId",employee."id",9001,now() FROM public."AttendanceImportBatch" source CROSS JOIN LATERAL (SELECT "id" FROM public."Employee" WHERE "tenantId"=${tenantId} AND "companyId"=${companyId} ORDER BY "createdAt" LIMIT 1) employee WHERE source."id"=${sourceId};`],
    ].flatMap(([prefix, documentType, routineName, lineTable, setup]) => {
      const parentField = lineTable === "WorkforceScheduleLine" ? "workforceScheduleId" : "attendanceImportBatchId";
      return [
        { name: `${prefix}-scope`, documentType, routineName, tables: [lineTable], setup, mutation: mutateCompany(lineTable, `${quoteShadowIdentifier(parentField)}=${sourceId}`) },
        { name: `${prefix}-wrong-location`, documentType, routineName, tables: [lineTable], setup, mutation: mutateLocation(lineTable, `row_data.${quoteShadowIdentifier(parentField)}=${sourceId}`) },
        { name: `${prefix}-employee`, documentType, routineName, tables: [lineTable, "Employee"], setup, mutation: mutateCompany("Employee", `"id"=(SELECT "employeeId" FROM public.${quoteShadowIdentifier(lineTable)} WHERE ${quoteShadowIdentifier(parentField)}=${sourceId})`) },
      ];
    }),
    ...[
      ["closure-parent", "PurchaseOrderBalanceClosure", "observe_purchase_order_balance_closure_v1", "PurchaseOrderBalanceClosure"],
      ["amendment-parent", "PurchaseOrderAmendment", "observe_purchase_order_amendment_v1", "PurchaseOrderAmendment"],
    ].map(([name, documentType, routineName, sourceTable]) => ({
      name, documentType, routineName, tables: [sourceTable, "PurchaseOrder"], setup: "",
      mutation: mutateCompany("PurchaseOrder", `"id"=(SELECT "purchaseOrderId" FROM public.${quoteShadowIdentifier(sourceTable)} WHERE "id"=${sourceId})`),
    })),
    {
      name: "release-parent", documentType: "PaymentRelease", routineName: "observe_payment_release_v1",
      tables: ["PaymentRelease", "PaymentRequest"], setup: "",
      mutation: mutateCompany("PaymentRequest", `"id"=(SELECT "paymentRequestId" FROM public."PaymentRelease" WHERE "id"=${sourceId})`),
    },
  ];

  if (
    JSON.stringify(cases.map(({ name }) => name)) !==
    JSON.stringify(approvalShadowBranchCaseNames)
  ) {
    throw new Error(`APPROVAL_SHADOW_BRANCH_INVENTORY_INVALID:${cases.map(({ name }) => name).join(",")}`);
  }
  for (const testCase of cases) {
    console.log(`APPROVAL_SHADOW_BRANCH_CASE_START | ${testCase.name}`);
    const before = shadowTableFingerprints(databaseUrl, testCase.tables);
    const invocation = observerCall(
      testCase.routineName,
      'fixture."tenantId", fixture."companyId", fixture."id"',
    );
    runPsql(databaseUrl, `BEGIN;
      CREATE TEMP TABLE shadow_case_context ON COMMIT DROP AS
      SELECT fixture.*, gen_random_uuid() AS aux_company_id,
             gen_random_uuid() AS aux_location_id, gen_random_uuid() AS aux_tenant_id
        FROM (${fixtureSelect(testCase.documentType)}) fixture;
      INSERT INTO public."Tenant" ("id","name","loginCode","updatedAt")
      SELECT aux_tenant_id, 'Shadow Aux Tenant', 'shadow-'||aux_tenant_id::text, now() FROM shadow_case_context;
      INSERT INTO public."Company" ("id","tenantId","code","legalName","currencyCode","updatedAt")
      SELECT aux_company_id,"tenantId",'SHADOW-'||substr(aux_company_id::text,1,8),'Shadow Aux Company','PHP',now() FROM shadow_case_context;
      INSERT INTO public."Location" ("id","tenantId","companyId","locationType","code","name","updatedAt")
      SELECT aux_location_id,"tenantId",aux_company_id,'BRANCH','SHADOW-'||substr(aux_location_id::text,1,8),'Shadow Aux Location',now() FROM shadow_case_context;
      ${testCase.setup}
      DO $shadow_valid$ DECLARE fixture record; actual text; BEGIN
        SELECT * INTO STRICT fixture FROM shadow_case_context;
        SELECT ${invocation} INTO actual;
        IF actual IS DISTINCT FROM 'SHADOW_MATCH' THEN RAISE EXCEPTION 'APPROVAL_SHADOW_BRANCH_VALID_FAILED:${testCase.name}:%', actual; END IF;
      END $shadow_valid$;
      ${testCase.mutation}
      DO $shadow_corrupt$ DECLARE fixture record; actual text; BEGIN
        SELECT * INTO STRICT fixture FROM shadow_case_context;
        SELECT ${invocation} INTO actual;
        IF actual IS DISTINCT FROM 'SHADOW_NO_MATCH' THEN RAISE EXCEPTION 'APPROVAL_SHADOW_BRANCH_CORRUPTION_MATCHED:${testCase.name}:%', actual; END IF;
      END $shadow_corrupt$;
      ROLLBACK;`);
    const after = shadowTableFingerprints(databaseUrl, testCase.tables);
    if (after !== before) throw new Error(`APPROVAL_SHADOW_BRANCH_DURABLE_DELTA:${testCase.name}`);
    const restored = runPsql(databaseUrl, `SELECT ${observerCall(testCase.routineName, 'fixture."tenantId", fixture."companyId", fixture."id"')} FROM (${fixtureSelect(testCase.documentType)}) fixture`).trim();
    if (restored !== "SHADOW_MATCH") throw new Error(`APPROVAL_SHADOW_BRANCH_ROLLBACK_FAILED:${testCase.name}:${restored}`);
  }
  console.log(`APPROVAL_SHADOW_BRANCH_MATRIX_PASS | ${cases.length} effective single-row corruptions | rollback restored | no durable controlled-row delta`);
}

function shadowTableFingerprints(databaseUrl, tables) {
  const allowed = new Set([
    "PurchaseRequest", "Brand", "Budget", "BudgetLine", "Location", "CashAdvanceRequest", "User",
    "ExpenseRequest", "PaymentRequest", "BudgetCommitment", "BankAccount", "PettyCashRequest",
    "EmployeeLeaveRequest", "EmployeeOvertimeRecord", "ExpenseRequestLine", "ExpenseRequestSourceLink",
    "ApInvoice", "PaymentRequestLine", "PaymentReleaseAllocation", "WorkforceScheduleLine",
    "AttendanceImportLine", "Employee", "PurchaseOrderBalanceClosure", "PurchaseOrderAmendment",
    "PurchaseOrder", "PaymentRelease",
  ]);
  return [...new Set(tables)].sort().map((table) => {
    if (!allowed.has(table)) throw new Error(`APPROVAL_SHADOW_FINGERPRINT_TABLE_INVALID:${table}`);
    return runPsql(databaseUrl, `SELECT count(*)::text || ':' || coalesce(md5(string_agg(to_jsonb(row_data)::text, ',' ORDER BY row_data."id"::text)), '') FROM public.${quoteShadowIdentifier(table)} row_data`).trim();
  }).join("|");
}

function quoteShadowIdentifier(value) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error("APPROVAL_SHADOW_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value ?? "",
  );
}

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

function installSetupRoles(
  targetUrl,
  marker,
  migratorPassword,
  runtimePassword,
  openingStockExecutorPassword = undefined,
) {
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
      ${openingStockExecutorPassword
        ? `ALTER ROLE ${quoteIdentifier(marker.ownerRole.replace(/_owner$/, "_opening_stock_executor"))} PASSWORD ${quoteLiteral(openingStockExecutorPassword)};`
        : ""}
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

function handoffOpeningStockOwner(administratorDatabaseUrl, marker) {
  runPsqlFile(
    administratorDatabaseUrl,
    path.join(roleSqlDir, "handoff-opening-stock-owner.sql"),
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
        repairPath,
      );

      if (repairPath === "bootstrap") {
        installSetupRoles(
          adminTargetUrl,
          marker,
          migratorPassword,
          runtimePassword,
        );
        reconcileRoleContract(migratorDatabaseUrl, marker);
        handoffOpeningStockOwner(adminTargetUrl, marker);
      } else if (repairPath === "bootstrap-refuses" || repairPath === "startup-refusal") {
        expectRoleBootstrapFailure(adminTargetUrl, marker, driftCase);
        applyAdversarialFixture(adminTargetUrl, marker, "cleanup", driftCase);
        installSetupRoles(
          adminTargetUrl,
          marker,
          migratorPassword,
          runtimePassword,
        );
        reconcileRoleContract(migratorDatabaseUrl, marker);
        handoffOpeningStockOwner(adminTargetUrl, marker);
      } else if (repairPath === "reconcile") {
        reconcileRoleContract(migratorDatabaseUrl, marker);
        handoffOpeningStockOwner(adminTargetUrl, marker);
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

function expectRoleBootstrapFailure(databaseUrl, marker, driftCase) {
  const result = executePsqlFile(
    databaseUrl,
    path.join(roleSqlDir, "bootstrap-roles.sql"),
    {
      contract_scope: "disposable",
      app_environment: "test",
      database_name: marker.databaseName,
      owner_role: marker.ownerRole,
      migrator_role: marker.migratorRole,
      runtime_role: marker.runtimeRole,
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (
    result.error ||
    result.status === 0 ||
    !output.includes("Refusing bootstrap: controlled role membership graph contains an unexpected edge or option")
  ) {
    if (result.error) throw result.error;
    throw new Error(`ADVERSARIAL_ROLE_BOOTSTRAP_REFUSAL_MISSING:${driftCase}`);
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
  failureMode,
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
  // A SET FALSE membership drift prevents the migrator's database-level
  // startup `SET ROLE owner` from completing, so PostgreSQL refuses the
  // verifier connection before the verifier body can emit its normal graph
  // diagnostic. That connection refusal is itself the fail-closed contract.
  const expectedConnectionRefusal =
    failureMode === "startup-refusal" &&
    /permission denied to set role|must be a member of role/i.test(output);
  if (
    result.status === 0 ||
    (!output.includes(expectedDiagnostic) && !expectedConnectionRefusal)
  ) {
    throw new Error(
      `ADVERSARIAL_ROLE_CONTRACT_EXPECTED_FAILURE_MISSING:${driftCase}:${expectedDiagnostic}`,
    );
  }
}

function dropRoles(adminDatabaseUrl, marker) {
  runPsql(
    adminDatabaseUrl,
    `DROP ROLE IF EXISTS ${quoteIdentifier(marker.ownerRole.replace(/_owner$/, "_opening_stock_executor"))}, ${quoteIdentifier(marker.ownerRole.replace(/_owner$/, "_opening_stock_owner"))}, ${quoteIdentifier(marker.runtimeRole)}, ${quoteIdentifier(marker.migratorRole)}, ${quoteIdentifier(marker.ownerRole)}, ${quoteIdentifier(marker.adversarialRole)}`,
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

function disposableRoleContract(migrationDatabaseUrl, runtimeDatabaseUrl, marker) {
  return {
    expectedDatabaseName: marker.databaseName,
    roles: {
      owner: marker.ownerRole,
      migrator: marker.migratorRole,
      runtime: marker.runtimeRole,
    },
    migration: { url: migrationDatabaseUrl },
    runtime: { url: runtimeDatabaseUrl },
  };
}

function verifyLiveMigrationLedger(migrationDatabaseUrl, runtimeDatabaseUrl, marker) {
  const manifest = buildMigrationManifest();
  const assessment = inspectMigrationLedger(
    "disposable-transport",
    disposableRoleContract(migrationDatabaseUrl, runtimeDatabaseUrl, marker),
    manifest,
    { requireExactCurrent: true, execute: executeControlledPsqlScript },
  );
  if (assessment.result !== "PASS" || assessment.classification !== "EXACT_CURRENT") {
    throw new Error("DISPOSABLE_MIGRATION_LEDGER_ATTESTATION_FAILED");
  }
  console.log(
    `MIGRATION_LEDGER_LIVE_PASS | ${assessment.appliedMigrationCount} exact migrations | ${assessment.migrationLedgerSha256}`,
  );
  const lastMigration = manifest.at(-1);
  runPsql(
    migrationDatabaseUrl,
    `UPDATE public._prisma_migrations SET checksum = repeat('0', 64) WHERE migration_name = ${quoteLiteral(lastMigration.name)}`,
  );
  try {
    let rejected = false;
    try {
      inspectMigrationLedger(
        "disposable-transport",
        disposableRoleContract(migrationDatabaseUrl, runtimeDatabaseUrl, marker),
        manifest,
        { requireExactCurrent: true, execute: executeControlledPsqlScript },
      );
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("CHECKSUM_MISMATCH");
    }
    if (!rejected) throw new Error("DISPOSABLE_MIGRATION_LEDGER_DRIFT_WAS_NOT_REJECTED");
  } finally {
    runPsql(
      migrationDatabaseUrl,
      `UPDATE public._prisma_migrations SET checksum = ${quoteLiteral(lastMigration.checksum)} WHERE migration_name = ${quoteLiteral(lastMigration.name)}`,
    );
  }
  inspectMigrationLedger(
    "disposable-transport",
    disposableRoleContract(migrationDatabaseUrl, runtimeDatabaseUrl, marker),
    manifest,
    { requireExactCurrent: true, execute: executeControlledPsqlScript },
  );
  console.log("MIGRATION_LEDGER_DRIFT_REJECTION_PASS | checksum mismatch rejected | exact ledger restored");
}

function verifyCleanAbsentMigrationLedger(databaseUrl, marker, administratorRole) {
  const assessment = inspectMigrationLedger(
    "disposable-transport",
    {
      expectedDatabaseName: marker.databaseName,
      roles: { owner: administratorRole, migrator: administratorRole },
      migration: { url: databaseUrl },
    },
    buildMigrationManifest(),
    { execute: executeControlledPsqlScript },
  );
  if (assessment.result !== "PASS" || assessment.classification !== "CLEAN_PREFIX") {
    throw new Error("DISPOSABLE_CLEAN_DATABASE_LEDGER_PREFLIGHT_FAILED");
  }
  console.log("MIGRATION_LEDGER_CLEAN_DATABASE_PASS | absent ledger | zero application objects");
}

function executeControlledPsql(_psql, connection, extraArgs) {
  return executePsql(
    connection.url,
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", ...extraArgs],
  );
}

function executeControlledPsqlScript(_psql, connection, args, sql) {
  return executePsql(connection.url, args, sql);
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
  return expectPsqlFailureOneOf(databaseUrl, sql, [expectedSqlState]);
}

function expectPsqlFailureOneOf(databaseUrl, sql, expectedSqlStates) {
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
  const matchedExpectedState = expectedSqlStates.some((sqlState) =>
    result.stderr?.includes(sqlState),
  );
  if (result.status === 0 || !matchedExpectedState) {
    const diagnostic = (result.stderr ?? result.stdout ?? "")
      .trim()
      .split("\n")
      .slice(0, 4)
      .join(" | ");
    throw new Error(
      `Expected PostgreSQL ${expectedSqlStates.join(" or ")} for restricted runtime operation: ${sql}`
        + (diagnostic ? ` | received: ${diagnostic}` : ""),
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
  if (
    !loopbackPsqlHost(env.PGHOST) ||
    !/^([1-9][0-9]{0,4})$/.test(env.PGPORT ?? "") ||
    Number(env.PGPORT) > 65535
  ) {
    throw new Error("DISPOSABLE_DATABASE_PSQL_DOCKER_TARGET_UNSAFE");
  }
  const forwardedEnvironment = [
    "PGHOST",
    "PGDATABASE",
    "PGSSLMODE",
    "PGUSER",
    "PGPASSWORD",
  ].flatMap((name) => (env[name] === undefined ? [] : ["-e", name]));
  // The host-side admin/runtime URL may use a non-default forwarded port,
  // while the psql transport runs inside the PostgreSQL container itself.
  // Keep the host target loopback-only, but pin the in-container service port.
  forwardedEnvironment.push("-e", "PGPORT=5432");
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
