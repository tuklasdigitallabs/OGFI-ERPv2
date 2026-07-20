import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requirePostgresTool } from "./postgres-client-tools.mjs";
import {
  databaseUrlFingerprint,
  evidenceRunId,
} from "./release-evidence-metadata.mjs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required for the pilot readiness check.");
  process.exit(2);
}

const psql = requirePostgresTool("psql", "the pilot readiness check");

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const outputDir =
  process.env.PILOT_READINESS_OUTPUT_DIR ?? "release-evidence/pilot-readiness";
const outputFile =
  process.env.PILOT_READINESS_OUTPUT_FILE ??
  join(outputDir, `pilot-readiness-${timestamp}.txt`);
const runId = evidenceRunId(process.env, timestamp);

const thresholds = {
  companies: numberEnv("PILOT_MIN_COMPANIES", 1),
  brands: numberEnv("PILOT_MIN_BRANDS", 1),
  branchLocations: numberEnv("PILOT_MIN_BRANCH_LOCATIONS", 1),
  warehouseLocations: numberEnv("PILOT_MIN_WAREHOUSE_LOCATIONS", 1),
  inventoryLocations: numberEnv("PILOT_MIN_INVENTORY_LOCATIONS", 2),
  users: numberEnv("PILOT_MIN_USERS", 8),
  roleAssignments: numberEnv("PILOT_MIN_ROLE_ASSIGNMENTS", 8),
  scopeAssignments: numberEnv("PILOT_MIN_SCOPE_ASSIGNMENTS", 8),
  approvalRules: numberEnv("PILOT_MIN_APPROVAL_RULES", 5),
  approvalSteps: numberEnv("PILOT_MIN_APPROVAL_STEPS", 5),
  suppliers: numberEnv("PILOT_MIN_SUPPLIERS", 1),
  items: numberEnv("PILOT_MIN_ITEMS", 1),
  uoms: numberEnv("PILOT_MIN_UOMS", 1),
  supplierItemLinks: numberEnv("PILOT_MIN_SUPPLIER_ITEM_LINKS", 1),
  stockRecords: numberEnv("PILOT_MIN_STOCK_RECORDS", 1),
  projectTemplates: numberEnv("PILOT_MIN_PROJECT_TEMPLATES", 1),
  projects: numberEnv("PILOT_MIN_PROJECTS", 2),
  restrictedProjects: numberEnv("PILOT_MIN_RESTRICTED_PROJECTS", 1),
  projectMembers: numberEnv("PILOT_MIN_PROJECT_MEMBERS", 2),
  projectTasks: numberEnv("PILOT_MIN_PROJECT_TASKS", 1),
  projectBlockers: numberEnv("PILOT_MIN_PROJECT_BLOCKERS", 1),
  projectMilestones: numberEnv("PILOT_MIN_PROJECT_MILESTONES", 1),
  projectRisks: numberEnv("PILOT_MIN_PROJECT_RISKS", 1),
  projectRecordLinks: numberEnv("PILOT_MIN_PROJECT_RECORD_LINKS", 1),
  uatEvidenceRecords: numberEnv("PILOT_MIN_UAT_EVIDENCE_RECORDS", 0),
  verifiedUatEvidenceRecords: numberEnv(
    "PILOT_MIN_VERIFIED_UAT_EVIDENCE_RECORDS",
    0,
  ),
  deploymentEvidenceRecords: numberEnv(
    "PILOT_MIN_DEPLOYMENT_EVIDENCE_RECORDS",
    0,
  ),
  verifiedDeploymentEvidenceRecords: numberEnv(
    "PILOT_MIN_VERIFIED_DEPLOYMENT_EVIDENCE_RECORDS",
    0,
  ),
  enablementEvidenceRecords: numberEnv(
    "PILOT_MIN_ENABLEMENT_EVIDENCE_RECORDS",
    0,
  ),
  verifiedEnablementEvidenceRecords: numberEnv(
    "PILOT_MIN_VERIFIED_ENABLEMENT_EVIDENCE_RECORDS",
    0,
  ),
  releaseBoardDecisions: numberEnv("PILOT_MIN_RELEASE_BOARD_DECISIONS", 0),
  requireReleaseGatesReady: booleanEnv("PILOT_REQUIRE_RELEASE_GATES_READY", false),
};

const requiredReleaseReadinessGateKeys = [
  "uat.scenario_execution",
  "uat.defect_disposition",
  "uat.policy_version_trace",
  "uat.acceptance_matrix_signed",
  "uat.default_revision_register",
  "deployment.migration_backup_restore",
  "deployment.monitoring_hypercare",
  "enablement.training_signoff",
  "enablement.kb_release_notes",
  "security.privileged_mfa_enrollment",
  "security.break_glass_control",
  "security.session_revalidation",
  "security.controlled_access_requests",
  "go_no_go.release_board_decision",
];

const releaseGateKeySql = requiredReleaseReadinessGateKeys
  .map((key) => `('${key}')`)
  .join(",");

const sensitivePermissionSql = [
  "core.administer",
  "purchasing.purchase_order.issue",
  "purchasing.purchase_order.cancel",
  "purchasing.purchase_order.close_remaining",
  "purchasing.purchase_order.amend",
  "inventory.transfer.dispatch",
  "inventory.transfer.receive",
  "inventory.transfer.discrepancy.settle",
  "projects.project.manage",
  "projects.project.manage_members",
  "projects.template.configure",
  "restaurant.recipe.publish",
  "restaurant.recipe.archive",
  "restaurant.menu_price.decide",
  "restaurant.incident.resolve",
  "restaurant.maintenance.complete",
]
  .map((code) => `'${code}'`)
  .join(",");

const permissionCodes = [
  "purchasing.purchase_request.create",
  "purchasing.purchase_request.submit",
  "purchasing.purchase_request.approve",
  "purchasing.quote.manage",
  "purchasing.quote.approve",
  "purchasing.purchase_order.view",
  "purchasing.purchase_order.create",
  "purchasing.purchase_order.submit",
  "purchasing.purchase_order.approve",
  "purchasing.purchase_order.issue",
  "purchasing.purchase_order.cancel",
  "purchasing.purchase_order.close_remaining",
  "purchasing.purchase_order.amend",
  "inventory.receiving.view",
  "inventory.receiving.create",
  "inventory.receiving.post",
  "inventory.receiving.reverse",
  "inventory.balance.view",
  "inventory.ledger.view",
  "inventory.transfer.view",
  "inventory.transfer.create",
  "inventory.transfer.submit",
  "inventory.transfer.cancel",
  "inventory.transfer.dispatch",
  "inventory.transfer.receive",
  "inventory.transfer.receipt.reverse",
  "inventory.transfer.discrepancy.settle",
  "inventory.stock_count.view",
  "inventory.stock_count.create",
  "inventory.stock_count.enter",
  "inventory.stock_count.submit",
  "inventory.stock_count.review",
  "inventory.stock_count.cancel",
  "inventory.wastage.view",
  "inventory.wastage.create",
  "inventory.wastage.submit",
  "inventory.wastage.approve",
  "inventory.wastage.post",
  "inventory.wastage.reverse",
  "inventory.wastage.review",
  "inventory.wastage.cancel",
  "inventory.stock_adjustment.view",
  "inventory.stock_adjustment.create",
  "inventory.stock_adjustment.submit",
  "inventory.stock_adjustment.approve",
  "inventory.stock_adjustment.post",
  "inventory.stock_adjustment.reverse",
  "inventory.stock_adjustment.cancel",
  "projects.project.view",
  "projects.project.create",
  "projects.project.manage",
  "projects.project.manage_members",
  "projects.risk.create",
  "projects.risk.update",
  "projects.risk.resolve",
  "projects.risk.archive",
  "projects.template.view",
  "projects.template.configure",
];

const checks = [
  section("Scope and organization"),
  min(
    "Active companies",
    thresholds.companies,
    `select count(*) from "Company" where "status" = 'ACTIVE';`,
  ),
  min(
    "Active brands",
    thresholds.brands,
    `select count(*) from "Brand" where "status" = 'ACTIVE';`,
  ),
  min(
    "Active branch locations",
    thresholds.branchLocations,
    `select count(*) from "Location" where "status" = 'ACTIVE' and "locationType" = 'BRANCH';`,
  ),
  min(
    "Active warehouse locations",
    thresholds.warehouseLocations,
    `select count(*) from "Location" where "status" = 'ACTIVE' and "locationType" = 'WAREHOUSE';`,
  ),
  min(
    "Active inventory locations",
    thresholds.inventoryLocations,
    `select count(*) from "InventoryLocation" where "status" = 'ACTIVE';`,
  ),
  section("Users, roles, permissions, and scope"),
  min(
    "Active users",
    thresholds.users,
    `select count(*) from "User" where "status" = 'ACTIVE';`,
  ),
  min(
    "Active user role assignments",
    thresholds.roleAssignments,
    `select count(*) from "UserRoleAssignment" where "status" = 'ACTIVE' and ("endsAt" is null or "endsAt" > now());`,
  ),
  min(
    "Active user scope assignments",
    thresholds.scopeAssignments,
    `select count(*) from "UserScopeAssignment" where "status" = 'ACTIVE' and ("endsAt" is null or "endsAt" > now());`,
  ),
  equal(
    "Phase I and Phase 1.5 permission codes",
    permissionCodes.length,
    `select count(*) from "Permission" where "code" in (${permissionCodes
      .map((code) => `'${code}'`)
      .join(",")});`,
  ),
  section("Approval routing"),
  min(
    "Active approval rules",
    thresholds.approvalRules,
    `select count(*) from "ApprovalRule" where "isActive" = true;`,
  ),
  min(
    "Approval rule steps",
    thresholds.approvalSteps,
    `select count(*) from "ApprovalRuleStep";`,
  ),
  section("Purchasing and inventory master data"),
  min(
    "Active suppliers",
    thresholds.suppliers,
    `select count(*) from "Supplier" where "status" = 'ACTIVE';`,
  ),
  min(
    "Active item categories",
    1,
    `select count(*) from "ItemCategory" where "status" = 'ACTIVE';`,
  ),
  min(
    "Active UOMs",
    thresholds.uoms,
    `select count(*) from "Uom" where "status" = 'ACTIVE';`,
  ),
  min(
    "Active items",
    thresholds.items,
    `select count(*) from "Item" where "status" = 'ACTIVE' and "trackInventory" = true;`,
  ),
  min(
    "Active supplier-item links",
    thresholds.supplierItemLinks,
    `select count(*) from "SupplierItemLink" where "status" = 'ACTIVE';`,
  ),
  section("Opening stock and ledger readiness"),
  min(
    "Inventory balances or movements",
    thresholds.stockRecords,
    `select (select count(*) from "InventoryBalance" where "qtyOnHand" <> 0) + (select count(*) from "InventoryMovement");`,
  ),
  equal(
    "Inventory balance rows with missing active inventory location",
    0,
    `select count(*) from "InventoryBalance" b left join "InventoryLocation" l on l."id" = b."inventoryLocationId" where l."id" is null or l."status" <> 'ACTIVE';`,
  ),
  equal(
    "Inventory balance rows with missing active item",
    0,
    `select count(*) from "InventoryBalance" b left join "Item" i on i."id" = b."itemId" where i."id" is null or i."status" <> 'ACTIVE';`,
  ),
  section("Project tracker readiness"),
  min(
    "Published project templates",
    thresholds.projectTemplates,
    `select count(*) from "ProjectTemplate" where "status" = 'PUBLISHED';`,
  ),
  min(
    "Active projects",
    thresholds.projects,
    `select count(*) from "Project" where "archivedAt" is null and "status" = 'ACTIVE';`,
  ),
  min(
    "Restricted projects for visibility denial UAT",
    thresholds.restrictedProjects,
    `select count(*) from "Project" where "archivedAt" is null and "isRestricted" = true;`,
  ),
  min(
    "Active project members",
    thresholds.projectMembers,
    `select count(*) from "ProjectMember" where "status" = 'ACTIVE' and "removedAt" is null;`,
  ),
  min(
    "Open project tasks",
    thresholds.projectTasks,
    `select count(*) from "ProjectTask" where "archivedAt" is null and "status" not in ('COMPLETED','CANCELLED');`,
  ),
  min(
    "Open project blockers",
    thresholds.projectBlockers,
    `select count(*) from "ProjectBlocker" where "status" = 'OPEN';`,
  ),
  min(
    "Project milestones",
    thresholds.projectMilestones,
    `select count(*) from "ProjectMilestone" where "archivedAt" is null;`,
  ),
  min(
    "Open project risks",
    thresholds.projectRisks,
    `select count(*) from "ProjectRisk" where "archivedAt" is null and "status" = 'OPEN';`,
  ),
  min(
    "Active project source-record links",
    thresholds.projectRecordLinks,
    `select count(*) from "ProjectRecordLink" where "archivedAt" is null;`,
  ),
  section("DEC-0036 release readiness registers"),
  equal(
    "UAT evidence register table",
    1,
    `select case when to_regclass('"UatEvidenceRecord"') is null then 0 else 1 end;`,
  ),
  equal(
    "Deployment evidence register table",
    1,
    `select case when to_regclass('"DeploymentEvidenceRecord"') is null then 0 else 1 end;`,
  ),
  equal(
    "Enablement evidence register table",
    1,
    `select case when to_regclass('"EnablementEvidenceRecord"') is null then 0 else 1 end;`,
  ),
  equal(
    "Release Board decision register table",
    1,
    `select case when to_regclass('"ReleaseBoardDecision"') is null then 0 else 1 end;`,
  ),
  min(
    "UAT evidence records",
    thresholds.uatEvidenceRecords,
    `select count(*) from "UatEvidenceRecord";`,
  ),
  min(
    "Verified UAT evidence records",
    thresholds.verifiedUatEvidenceRecords,
    `select count(*) from "UatEvidenceRecord" where "verificationStatus" = 'VERIFIED';`,
  ),
  min(
    "Deployment evidence records",
    thresholds.deploymentEvidenceRecords,
    `select count(*) from "DeploymentEvidenceRecord";`,
  ),
  min(
    "Verified deployment evidence records",
    thresholds.verifiedDeploymentEvidenceRecords,
    `select count(*) from "DeploymentEvidenceRecord" where "verificationStatus" = 'VERIFIED';`,
  ),
  min(
    "Enablement evidence records",
    thresholds.enablementEvidenceRecords,
    `select count(*) from "EnablementEvidenceRecord";`,
  ),
  min(
    "Verified enablement evidence records",
    thresholds.verifiedEnablementEvidenceRecords,
    `select count(*) from "EnablementEvidenceRecord" where "verificationStatus" = 'VERIFIED';`,
  ),
  min(
    "Release Board decisions",
    thresholds.releaseBoardDecisions,
    `select count(*) from "ReleaseBoardDecision";`,
  ),
  ...(thresholds.requireReleaseGatesReady
    ? [
        section("DEC-0036 strict release gate status"),
        equal(
          "Required release readiness gates missing",
          0,
          `select count(*) from (values ${releaseGateKeySql}) as expected("gateKey") left join "ReleaseReadinessGate" g on g."gateKey" = expected."gateKey" and g."requiredByPolicy" = true where g."id" is null;`,
        ),
        equal(
          "Required release readiness gates not accepted",
          0,
          `select count(*) from "ReleaseReadinessGate" where "requiredByPolicy" = true and "gateKey" in (${requiredReleaseReadinessGateKeys.map((key) => `'${key}'`).join(",")}) and "status" not in ('READY','CONDITIONAL_GO','WAIVED');`,
        ),
        equal(
          "Accepted release readiness gates missing evidence",
          0,
          `select count(*) from "ReleaseReadinessGate" where "requiredByPolicy" = true and "gateKey" in (${requiredReleaseReadinessGateKeys.map((key) => `'${key}'`).join(",")}) and "status" in ('READY','CONDITIONAL_GO','WAIVED') and coalesce(nullif(trim("evidenceReference"), ''), '') = '';`,
        ),
        equal(
          "Conditional or waived release gates missing decision note",
          0,
          `select count(*) from "ReleaseReadinessGate" where "requiredByPolicy" = true and "gateKey" in (${requiredReleaseReadinessGateKeys.map((key) => `'${key}'`).join(",")}) and "status" in ('CONDITIONAL_GO','WAIVED') and coalesce(nullif(trim("decisionNote"), ''), '') = '';`,
        ),
        equal(
          "Hold release gates missing blocker summary",
          0,
          `select count(*) from "ReleaseReadinessGate" where "requiredByPolicy" = true and "gateKey" in (${requiredReleaseReadinessGateKeys.map((key) => `'${key}'`).join(",")}) and "status" = 'HOLD' and coalesce(nullif(trim("blockerSummary"), ''), '') = '';`,
        ),
        equal(
          "Pending controlled access requests",
          0,
          `select (select count(*) from "HighRiskScopeRequest" where "status" = 'PENDING') + (select count(*) from "SensitiveRoleRequest" where "status" = 'PENDING');`,
        ),
        equal(
          "Privileged users missing verified MFA evidence",
          0,
          `with privileged_users as (select distinct u."id" as "userId", case when usa."scopeType" = 'COMPANY' then usa."scopeId" else l."companyId" end as "companyId" from "User" u join "UserRoleAssignment" ura on ura."userId" = u."id" and ura."status" = 'ACTIVE' and ura."startsAt" <= now() and (ura."endsAt" is null or ura."endsAt" > now()) join "RolePermission" rp on rp."roleId" = ura."roleId" join "Permission" p on p."id" = rp."permissionId" join "UserScopeAssignment" usa on usa."userId" = u."id" and usa."status" = 'ACTIVE' and usa."startsAt" <= now() and (usa."endsAt" is null or usa."endsAt" > now()) left join "Location" l on usa."scopeType" = 'LOCATION' and l."id" = usa."scopeId" and l."status" = 'ACTIVE' where u."status" = 'ACTIVE' and (usa."scopeType" = 'COMPANY' or (usa."scopeType" = 'LOCATION' and l."id" is not null)) and (p."code" in (${sensitivePermissionSql}) or p."code" like '%.approve' or p."code" like '%.post' or p."code" like '%.reverse' or p."code" like '%.review' or p."code" like '%.correct')) select count(*) from privileged_users pu where pu."companyId" is not null and not exists (select 1 from (select distinct on ("targetUserId", "companyId") "targetUserId", "companyId", "status" from "PrivilegedMfaEnrollment" order by "targetUserId", "companyId", "createdAt" desc) latest where latest."targetUserId" = pu."userId" and latest."companyId" = pu."companyId" and latest."status" = 'VERIFIED');`,
        ),
        equal(
          "Pending provider session invalidations",
          0,
          `select count(*) from "AuthSessionInvalidation" where "status" = 'PENDING_PROVIDER';`,
        ),
        equal(
          "Break-glass access open or post-review due",
          0,
          `select count(*) from "BreakGlassAccessGrant" where "status" in ('PENDING_REVIEW','ACTIVE','REVOKED','EXPIRED','REJECTED');`,
        ),
        equal(
          "GO / NO-GO ready gate missing GO board decision",
          0,
          `select count(*) from "ReleaseReadinessGate" g where g."requiredByPolicy" = true and g."gateKey" = 'go_no_go.release_board_decision' and g."status" = 'READY' and coalesce((select d."decision" from "ReleaseBoardDecision" d where d."companyId" = g."companyId" order by d."decidedAt" desc, d."createdAt" desc limit 1), '') <> 'GO';`,
        ),
        equal(
          "GO / NO-GO conditional gate missing Conditional GO board decision",
          0,
          `select count(*) from "ReleaseReadinessGate" g where g."requiredByPolicy" = true and g."gateKey" = 'go_no_go.release_board_decision' and g."status" = 'CONDITIONAL_GO' and coalesce((select d."decision" from "ReleaseBoardDecision" d where d."companyId" = g."companyId" order by d."decidedAt" desc, d."createdAt" desc limit 1), '') <> 'CONDITIONAL_GO';`,
        ),
        equal(
          "GO / NO-GO waived gate missing Hold board decision",
          0,
          `select count(*) from "ReleaseReadinessGate" g where g."requiredByPolicy" = true and g."gateKey" = 'go_no_go.release_board_decision' and g."status" = 'WAIVED' and coalesce((select d."decision" from "ReleaseBoardDecision" d where d."companyId" = g."companyId" order by d."decidedAt" desc, d."createdAt" desc limit 1), '') <> 'HOLD';`,
        ),
      ]
    : []),
];

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(
  outputFile,
  [
    "OGFI ERP Phase I / Phase 1.5 pilot readiness check",
    `Generated UTC: ${timestamp}`,
    `Evidence run ID: ${runId}`,
    `Database URL fingerprint: ${databaseUrlFingerprint(databaseUrl)}`,
    `Threshold snapshot: ${thresholdSnapshot(thresholds)}`,
    `Evidence file: ${outputFile}`,
    "",
  ].join("\n"),
);

let failures = 0;

for (const check of checks) {
  if (check.type === "section") {
    write(`\n${check.label}`);
    continue;
  }

  const count = queryCount(check.sql);
  if (check.type === "min" && count >= check.minimum) {
    write(
      `PASS | ${check.label} | count=${count} | required>=${check.minimum}`,
    );
    continue;
  }

  if (check.type === "equal" && count === check.expected) {
    write(
      `PASS | ${check.label} | count=${count} | expected=${check.expected}`,
    );
    continue;
  }

  failures += 1;
  const expectation =
    check.type === "min"
      ? `required>=${check.minimum}`
      : `expected=${check.expected}`;
  write(`FAIL | ${check.label} | count=${count} | ${expectation}`);
}

if (failures === 0) {
  write(
    "\nRESULT | PASS | Pilot setup is ready for UAT execution evidence capture.",
  );
  process.exit(0);
}

write(
  `\nRESULT | FAIL | ${failures} readiness gate(s) failed. Fix setup data before running transaction UAT.`,
);
process.exit(1);

function numberEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(`${name} must be a non-negative integer.`);
    process.exit(2);
  }

  return parsed;
}

function booleanEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  if (raw.toLowerCase() === "true") {
    return true;
  }
  if (raw.toLowerCase() === "false") {
    return false;
  }

  console.error(`${name} must be true or false.`);
  process.exit(2);
}

function section(label) {
  return { type: "section", label };
}

function min(label, minimum, sql) {
  return { type: "min", label, minimum, sql };
}

function equal(label, expected, sql) {
  return { type: "equal", label, expected, sql };
}

function queryCount(sql) {
  let output;
  try {
    output = execFileSync(
      psql,
      [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    console.error(`Pilot readiness query failed: ${detail}`);
    process.exit(2);
  }

  const count = Number.parseInt(output, 10);
  if (!Number.isFinite(count)) {
    console.error(
      `Pilot readiness query returned a non-numeric count: ${output}`,
    );
    process.exit(2);
  }

  return count;
}

function write(line) {
  console.log(line);
  appendFileSync(outputFile, `${line}\n`);
}

function thresholdSnapshot(values) {
  return Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join(",");
}
