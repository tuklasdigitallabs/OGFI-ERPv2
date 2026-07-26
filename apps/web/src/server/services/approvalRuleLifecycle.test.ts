import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const serviceSource = readFileSync(
  path.resolve(__dirname, "approvalRuleLifecycle.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20260726180000_approval_rule_versioning/migration.sql",
  ),
  "utf8",
);
const composerSource = readFileSync(
  path.resolve(__dirname, "../../components/ApprovalRuleVersionComposer.tsx"),
  "utf8",
);
const detailSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/admin/approval-rules/[id]/page.tsx"),
  "utf8",
);
const createPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/admin/approval-rules/new/page.tsx"),
  "utf8",
);
const revisePageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/admin/approval-rules/[id]/revise/page.tsx"),
  "utf8",
);
const seedSource = readFileSync(
  path.resolve(__dirname, "../../../../../packages/database/src/seed.ts"),
  "utf8",
);

describe("DEC-0225 approval-rule lifecycle", () => {
  test("migration fails closed before versioning active named-user or ambiguous routes", () => {
    expect(migrationSource).toMatch(/^--[\s\S]*?BEGIN;/);
    expect(migrationSource).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migrationSource.trimEnd()).toMatch(/COMMIT;$/);
    expect(migrationSource).toContain(
      "APPROVAL_RULE_ACTIVE_NON_ROLE_TARGET_PREFLIGHT_FAILED",
    );
    expect(migrationSource).toContain(
      "APPROVAL_RULE_DUPLICATE_ACTIVE_ROUTE_PREFLIGHT_FAILED",
    );
    expect(migrationSource.indexOf("ACTIVE_NON_ROLE_TARGET_PREFLIGHT_FAILED"))
      .toBeLessThan(migrationSource.indexOf('ADD COLUMN "routeKey"'));
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "ApprovalRule_one_active_company_route_key"',
    );
    expect(migrationSource).toContain(
      'CREATE TABLE "ApprovalRuleLifecycleIntent"',
    );
    expect(migrationSource).toContain(
      'CREATE TRIGGER "ApprovalRuleLifecycleIntent_prevent_update"',
    );
    expect(migrationSource).toContain(
      'CREATE TRIGGER "ApprovalRuleLifecycleIntent_prevent_delete"',
    );
    expect(migrationSource).toContain(
      'CREATE TRIGGER "ApprovalRuleLifecycleIntent_prevent_truncate"',
    );
    expect(migrationSource).toContain(
      'CREATE TRIGGER "ApprovalRule_protect_version_definition"',
    );
    expect(migrationSource).toContain(
      'CREATE TRIGGER "ApprovalRule_prevent_delete"',
    );
    expect(migrationSource).toContain(
      'CREATE CONSTRAINT TRIGGER "ApprovalRule_require_sealed_at_commit"',
    );
    expect(migrationSource).toContain(
      'CREATE TRIGGER "ApprovalRuleStep_prevent_update"',
    );
    expect(migrationSource).toContain("APPROVAL_RULE_VERSION_ALREADY_SEALED");
    expect(migrationSource).toContain(
      'FOREIGN KEY ("approvalRuleId", "tenantId", "companyId")',
    );
    const emergencySeed = seedSource.slice(
      seedSource.indexOf('where: { id: ids.emergencyPurchaseRequestApprovalRuleId }'),
      seedSource.indexOf('where: { id: ids.emergencyPurchaseRequestApprovalRuleStepId }'),
    );
    expect(emergencySeed).toContain('routeKey: "PR_EMERGENCY"');
    const approvalSeedSection = seedSource.slice(
      seedSource.indexOf("await prisma.$transaction(async (approvalSeedTx)"),
      seedSource.indexOf("await prisma.wastagePolicy.upsert"),
    );
    expect(approvalSeedSection).not.toMatch(/update: \{\s+[^}]/);
    expect(approvalSeedSection.match(/update: \{\}/g)?.length).toBe(38);
    expect(approvalSeedSection.match(/lineageId: ids\./g)?.length).toBe(19);
    expect(approvalSeedSection).toContain("definitionSealed: true");
  });

  test("all mutations serialize by company and revalidate live authority plus MFA", () => {
    expect(serviceSource).toContain('FROM "Company"');
    expect(serviceSource).toContain("FOR UPDATE");
    expect(serviceSource).toContain("revalidateMutationAuthority");
    expect(serviceSource).toContain("permissions.coreAdminister");
    expect(serviceSource).toContain("permissions.tenantRoleAdminister");
    expect(serviceSource).toContain('accessLevel: "MANAGE"');
    expect(serviceSource).toContain("assertPrivilegedMfaForAction");
    expect(serviceSource).toContain("forceEnforcement: true");
    expect(serviceSource).toContain('if ("deniedError" in outcome)');
    expect(serviceSource).toContain("Prisma.TransactionIsolationLevel.Serializable");
  });

  test("create and revise write complete inactive immutable versions", () => {
    expect(serviceSource).toContain("createCoreAdminApprovalRuleVersion");
    expect(serviceSource).toContain("reviseCoreAdminApprovalRuleVersion");
    expect(serviceSource).toContain("supersedesRuleId: source.id");
    expect(serviceSource).toContain("lineageId: source.lineageId");
    expect(serviceSource).toContain("version: source.version + 1");
    expect(serviceSource.match(/definitionSealed: true/g)?.length).toBe(2);
    expect(serviceSource.match(/isActive: false/g)?.length).toBeGreaterThanOrEqual(3);
    expect(serviceSource).toContain('approverType: "ROLE"');
    expect(serviceSource).not.toContain("approvalRuleStep.delete");
    expect(serviceSource).not.toContain("approvalRuleStep.update");
  });

  test("activation uses expected active slot, CAS, eligibility, audit, and durable idempotency", () => {
    expect(serviceSource).toContain("validateRoleSteps");
    expect(serviceSource).toContain("requiredPermissionCode");
    expect(serviceSource).toContain("APPROVAL_RULE_ROLE_HAS_NO_SCOPED_APPROVER");
    expect(serviceSource).toContain("APPROVAL_RULE_ACTIVE_VERSION_CONFLICT");
    expect(serviceSource).toContain("lifecycleVersion: { increment: 1 }");
    expect(serviceSource).toContain("approvalRuleLifecycleIntent.findUnique");
    expect(serviceSource).toContain("approvalRuleLifecycleIntent.create");
    expect(serviceSource).toContain("core_admin.approval_rule.${activate ? \"activated\" : \"deactivated\"}");
  });

  test("visible surfaces expose the complete bounded workflow and explain withheld controls", () => {
    expect(createPageSource).toContain("Create Approval Rule");
    expect(revisePageSource).toContain("Create an immutable successor");
    expect(composerSource).toContain("Add Step");
    expect(composerSource).toContain("Create Inactive Revision");
    expect(composerSource).toContain("Named users, arbitrary filters, parallel steps");
    expect(detailSource).toContain("Activate Version");
    expect(detailSource).toContain("Deactivate Version");
    expect(detailSource).toContain("Tenant-wide rules are inspectable");
    expect(detailSource).toContain("never be silently converted");
    expect(detailSource).toContain("Existing approval instances retain this exact version");
  });

  test("composer catalogs are bounded and disclose overflow instead of truncating silently", () => {
    expect(serviceSource).toContain("take: 201");
    expect(serviceSource).toContain("roles.slice(0, 200)");
    expect(serviceSource).toContain("roleCatalogHasMore: roles.length > 200");
    expect(createPageSource).toContain("eligible role catalog exceeds 200 records");
    expect(revisePageSource).toContain("eligible role catalog exceeds 200 records");
  });
});
