BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE "Attachment"
  ADD COLUMN "legalHoldAuthority" TEXT,
  ADD COLUMN "legalHoldCaseReference" TEXT;

ALTER TABLE "Attachment"
  DROP CONSTRAINT "Attachment_legal_hold_coherence_chk",
  ADD CONSTRAINT "Attachment_legal_hold_coherence_chk"
  CHECK (
    (
      "legalHold" = false
      AND "legalHoldSetAt" IS NULL
      AND "legalHoldSetByUserId" IS NULL
      AND "legalHoldAuthority" IS NULL
      AND "legalHoldCaseReference" IS NULL
      AND "legalHoldReason" IS NULL
    )
    OR
    (
      "legalHold" = true
      AND "legalHoldSetAt" IS NOT NULL
      AND "legalHoldSetByUserId" IS NOT NULL
      AND nullif(btrim("legalHoldAuthority"), '') IS NOT NULL
      AND nullif(btrim("legalHoldCaseReference"), '') IS NOT NULL
      AND nullif(btrim("legalHoldReason"), '') IS NOT NULL
    )
  );

CREATE INDEX "Attachment_scope_legal_hold_idx"
  ON "Attachment"("tenantId", "companyId", "legalHold", "legalHoldSetAt");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Permission"
    WHERE (
      "id" = '00000000-0000-4000-8000-000000000995'
      AND "code" <> 'evidence.legal_hold.set'
    ) OR (
      "id" = '00000000-0000-4000-8000-000000000996'
      AND "code" <> 'evidence.retention.view'
    )
  ) THEN
    RAISE EXCEPTION 'Reserved evidence governance permission id is already in use';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Permission"
    WHERE "code" IN ('evidence.legal_hold.set', 'evidence.retention.view')
      AND (
        "tenantId" IS NOT NULL
        OR "module" <> 'evidence'
        OR (
          "code" = 'evidence.legal_hold.set'
          AND "id" <> '00000000-0000-4000-8000-000000000995'
        )
        OR (
          "code" = 'evidence.retention.view'
          AND "id" <> '00000000-0000-4000-8000-000000000996'
        )
        OR ("code" = 'evidence.legal_hold.set' AND "action" <> 'legal_hold.set')
        OR ("code" = 'evidence.retention.view' AND "action" <> 'retention.view')
      )
  ) THEN
    RAISE EXCEPTION 'Existing evidence governance permission metadata does not match the reviewed registry row';
  END IF;
END $$;

INSERT INTO "Permission" ("id", "code", "module", "action", "description")
VALUES
  (
    '00000000-0000-4000-8000-000000000995',
    'evidence.legal_hold.set',
    'evidence',
    'legal_hold.set',
    'Place a preservation-only legal hold on company-scoped controlled evidence.'
  ),
  (
    '00000000-0000-4000-8000-000000000996',
    'evidence.retention.view',
    'evidence',
    'retention.view',
    'View the confidential company evidence retention and legal-hold metadata register.'
  )
ON CONFLICT ("code") DO NOTHING;

CREATE TEMP TABLE "_EvidenceGovernanceGrantRoles" (
  "roleId" UUID PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO "_EvidenceGovernanceGrantRoles" ("roleId")
SELECT r."id"
FROM "Role" r
WHERE r."code" IN ('CONFIGURED_ADMIN', 'CONFIGURED_SUPER_USER');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT target."roleId", permission."id"
FROM "_EvidenceGovernanceGrantRoles" target
CROSS JOIN "Permission" permission
WHERE permission."code" IN ('evidence.legal_hold.set', 'evidence.retention.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

CREATE TEMP TABLE "_EvidenceGovernanceAffectedUsers" (
  "userId" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO "_EvidenceGovernanceAffectedUsers" ("userId", "tenantId")
SELECT DISTINCT assignment."userId", app_user."tenantId"
FROM "UserRoleAssignment" assignment
JOIN "_EvidenceGovernanceGrantRoles" target
  ON target."roleId" = assignment."roleId"
JOIN "User" app_user ON app_user."id" = assignment."userId"
WHERE assignment."status" = 'ACTIVE'
  AND assignment."startsAt" <= CURRENT_TIMESTAMP
  AND (assignment."endsAt" IS NULL OR assignment."endsAt" > CURRENT_TIMESTAMP)
  AND app_user."status" = 'ACTIVE';

UPDATE "User" app_user
SET "privilegeEpoch" = app_user."privilegeEpoch" + 1
FROM "_EvidenceGovernanceAffectedUsers" affected
WHERE app_user."id" = affected."userId";

UPDATE "AuthSession" session
SET
  "status" = 'REVOKED',
  "revokedAt" = CURRENT_TIMESTAMP,
  "revocationReason" = 'Evidence-governance permissions deployed; sign in again.'
FROM "_EvidenceGovernanceAffectedUsers" affected
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
  'Evidence-governance permissions deployed; sign in again.',
  'migration.evidence_governance.granted',
  '00000000-0000-4000-8000-000000000995',
  TRUE,
  'OGFI_LOCAL',
  'database-session-revocation',
  CURRENT_TIMESTAMP
FROM "_EvidenceGovernanceAffectedUsers" affected;

COMMIT;
