BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Permission"
    WHERE "id" = '00000000-0000-4000-8000-000000000998'
      AND "code" <> 'core.tenant_role_administer'
  ) THEN
    RAISE EXCEPTION 'Reserved tenant-role administration permission id is already in use';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Permission"
    WHERE "code" = 'core.tenant_role_administer'
      AND (
        "id" <> '00000000-0000-4000-8000-000000000998'
        OR "tenantId" IS NOT NULL
        OR "module" <> 'core'
        OR "action" <> 'tenant_role_administer'
      )
  ) THEN
    RAISE EXCEPTION 'Existing tenant-role administration permission metadata does not match the reviewed registry row';
  END IF;
END $$;

INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES (
  '00000000-0000-4000-8000-000000000998',
  'core.tenant_role_administer',
  'core',
  'tenant_role_administer'
)
ON CONFLICT ("code") DO NOTHING;

CREATE TEMP TABLE "_TenantRoleAdminGrantRoles" (
  "roleId" UUID PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO "_TenantRoleAdminGrantRoles" ("roleId")
SELECT r."id"
FROM "Role" r
WHERE r."code" IN ('CONFIGURED_ADMIN', 'CONFIGURED_SUPER_USER')
  AND NOT EXISTS (
    SELECT 1
    FROM "RolePermission" rp
    JOIN "Permission" p ON p."id" = rp."permissionId"
    WHERE rp."roleId" = r."id"
      AND p."code" = 'core.tenant_role_administer'
  );

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT target."roleId", p."id"
FROM "_TenantRoleAdminGrantRoles" target
JOIN "Permission" p ON p."code" = 'core.tenant_role_administer'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

CREATE TEMP TABLE "_TenantRoleAdminAffectedUsers" (
  "userId" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO "_TenantRoleAdminAffectedUsers" ("userId", "tenantId")
SELECT DISTINCT ura."userId", u."tenantId"
FROM "UserRoleAssignment" ura
JOIN "_TenantRoleAdminGrantRoles" target ON target."roleId" = ura."roleId"
JOIN "User" u ON u."id" = ura."userId"
WHERE ura."status" = 'ACTIVE'
  AND ura."startsAt" <= CURRENT_TIMESTAMP
  AND (ura."endsAt" IS NULL OR ura."endsAt" > CURRENT_TIMESTAMP)
  AND u."status" = 'ACTIVE';

UPDATE "User" u
SET "privilegeEpoch" = u."privilegeEpoch" + 1
FROM "_TenantRoleAdminAffectedUsers" affected
WHERE u."id" = affected."userId";

UPDATE "AuthSession" session
SET
  "status" = 'REVOKED',
  "revokedAt" = CURRENT_TIMESTAMP,
  "revocationReason" = 'Tenant-role administration permission deployed; sign in again.'
FROM "_TenantRoleAdminAffectedUsers" affected
WHERE session."userId" = affected."userId"
  AND session."status" IN ('ACTIVE', 'PENDING_MFA', 'MFA_ENROLLMENT_REQUIRED');

INSERT INTO "AuthSessionInvalidation" (
  "tenantId",
  "companyId",
  "targetUserId",
  "requestedByUserId",
  "status",
  "reason",
  "sourceEventType",
  "sourceRecordId",
  "demoEpochEnforced",
  "providerName",
  "providerReference",
  "completedAt"
)
SELECT
  affected."tenantId",
  NULL,
  affected."userId",
  NULL,
  'APPLICATION_COMPLETED',
  'Tenant-role administration permission deployed; sign in again.',
  'migration.tenant_role_administer.granted',
  '00000000-0000-4000-8000-000000000998',
  TRUE,
  'OGFI_LOCAL',
  'database-session-revocation',
  CURRENT_TIMESTAMP
FROM "_TenantRoleAdminAffectedUsers" affected;

COMMIT;
