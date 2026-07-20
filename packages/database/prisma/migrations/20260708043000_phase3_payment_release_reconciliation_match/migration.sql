ALTER TYPE "BankReconciliationSourceType" ADD VALUE IF NOT EXISTS 'PAYMENT_RELEASE';

ALTER TABLE "BankReconciliationMatch"
  ADD COLUMN "paymentReleaseId" UUID;

CREATE INDEX "BankReconciliationMatch_tenantId_companyId_paymentReleaseId_idx"
  ON "BankReconciliationMatch"("tenantId", "companyId", "paymentReleaseId");

ALTER TABLE "BankReconciliationMatch"
  ADD CONSTRAINT "BankReconciliationMatch_paymentReleaseId_fkey"
  FOREIGN KEY ("paymentReleaseId") REFERENCES "PaymentRelease"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" (
  "id",
  "tenantId",
  "module",
  "action",
  "code",
  "description"
)
SELECT
  gen_random_uuid(),
  t."id",
  'finance',
  'reconciliation.match',
  'finance.reconciliation.match',
  'Match bank/cash reconciliation source records to statement lines without bank API, AP settlement, or journal posting'
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1
  FROM "Permission" p
  WHERE p."tenantId" = t."id"
    AND p."code" = 'finance.reconciliation.match'
);

INSERT INTO "RolePermission" (
  "roleId",
  "permissionId"
)
SELECT
  r."id",
  p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."tenantId" = r."tenantId"
 AND p."code" = 'finance.reconciliation.match'
WHERE r."code" = 'CONFIGURED_ADMIN'
  AND NOT EXISTS (
    SELECT 1
    FROM "RolePermission" rp
    WHERE rp."roleId" = r."id"
      AND rp."permissionId" = p."id"
  );
