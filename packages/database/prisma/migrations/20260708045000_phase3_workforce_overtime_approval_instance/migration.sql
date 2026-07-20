ALTER TABLE "EmployeeOvertimeRecord"
  ADD COLUMN "approvalInstanceId" UUID;

CREATE UNIQUE INDEX "EmployeeOvertimeRecord_approvalInstanceId_key"
  ON "EmployeeOvertimeRecord"("approvalInstanceId");

ALTER TABLE "EmployeeOvertimeRecord"
  ADD CONSTRAINT "EmployeeOvertimeRecord_approvalInstanceId_fkey"
  FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ApprovalRule" (
  "id",
  "tenantId",
  "companyId",
  "transactionType",
  "priority",
  "isActive",
  "scopeFilters"
)
SELECT
  gen_random_uuid(),
  c."tenantId",
  c."id",
  'EmployeeOvertimeRecord',
  100,
  true,
  '{"source":"phase3_workforce_overtime_approval_instance","appliesTo":"non_payroll_overtime_approval"}'::jsonb
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1
  FROM "ApprovalRule" ar
  WHERE ar."tenantId" = c."tenantId"
    AND ar."companyId" = c."id"
    AND ar."transactionType" = 'EmployeeOvertimeRecord'
    AND ar."isActive" = true
);

INSERT INTO "ApprovalRuleStep" (
  "id",
  "approvalRuleId",
  "stepOrder",
  "approverType",
  "roleId",
  "required"
)
SELECT
  gen_random_uuid(),
  ar."id",
  1,
  'ROLE',
  r."id",
  true
FROM "ApprovalRule" ar
JOIN "Role" r
  ON r."tenantId" = ar."tenantId"
 AND r."code" = 'CONFIGURED_APPROVER'
WHERE ar."transactionType" = 'EmployeeOvertimeRecord'
  AND ar."isActive" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "ApprovalRuleStep" ars
    WHERE ars."approvalRuleId" = ar."id"
      AND ars."stepOrder" = 1
  );
