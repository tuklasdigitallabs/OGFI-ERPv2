CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED', 'REJECTED', 'ACTIVE', 'PARTIALLY_RELEASED', 'CLOSED', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "BudgetLineStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'CLOSED', 'ARCHIVED');
CREATE TYPE "BudgetRevisionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "BudgetRevisionType" AS ENUM ('ORIGINAL', 'AMENDMENT', 'REBASE', 'REALLOCATION');
CREATE TYPE "BudgetCommitmentStatus" AS ENUM ('PENDING', 'APPROVED', 'CONSUMED', 'REVERSED', 'CANCELLED', 'VOIDED');
CREATE TYPE "BudgetSourceEventType" AS ENUM ('PURCHASE_REQUEST', 'PURCHASE_ORDER', 'PURCHASE_ORDER_LINE', 'GOODS_RECEIPT', 'INVENTORY_TRANSFER', 'AP_INVOICE', 'PAYMENT_REQUEST', 'MANUAL');

CREATE TABLE "Budget" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "fiscalYearId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "budgetType" TEXT NOT NULL DEFAULT 'OPERATING',
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "brandId" UUID,
    "locationId" UUID,
    "departmentId" UUID,
    "costCenterId" UUID,
    "projectId" UUID,
    "ownerUserId" UUID,
    "createdByUserId" UUID NOT NULL,
    "submittedByUserId" UUID,
    "approvedByUserId" UUID,
    "cancelledByUserId" UUID,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "approvalInstanceId" UUID,
    "totalOriginalAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalRevisedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "policyConfiguration" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Budget_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "Budget_amounts_nonnegative_check" CHECK ("totalOriginalAmount" >= 0 AND "totalRevisedAmount" >= 0),
    CONSTRAINT "Budget_version_check" CHECK ("version" >= 1),
    CONSTRAINT "Budget_approved_actor_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "createdByUserId"),
    CONSTRAINT "Budget_approved_at_check" CHECK ("status" NOT IN ('APPROVED', 'ACTIVE', 'PARTIALLY_RELEASED', 'CLOSED') OR "approvedAt" IS NOT NULL),
    CONSTRAINT "Budget_cancelled_reason_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL))
);

CREATE TABLE "BudgetLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budgetId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "accountingPeriodId" UUID,
    "accountId" UUID,
    "lineNumber" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brandId" UUID,
    "locationId" UUID,
    "departmentId" UUID,
    "costCenterId" UUID,
    "projectId" UUID,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "originalAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "revisedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reservedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "warningThresholdPct" DECIMAL(5,2) NOT NULL DEFAULT 80,
    "hardBlockPct" DECIMAL(5,2),
    "status" "BudgetLineStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BudgetLine_line_number_check" CHECK ("lineNumber" >= 1),
    CONSTRAINT "BudgetLine_period_check" CHECK ("periodStart" <= "periodEnd"),
    CONSTRAINT "BudgetLine_amounts_nonnegative_check" CHECK ("originalAmountPhp" >= 0 AND "revisedAmountPhp" >= 0 AND "reservedAmountPhp" >= 0),
    CONSTRAINT "BudgetLine_threshold_check" CHECK ("warningThresholdPct" >= 0 AND "warningThresholdPct" <= 100 AND ("hardBlockPct" IS NULL OR ("hardBlockPct" >= 0 AND "hardBlockPct" <= 100)))
);

CREATE TABLE "BudgetRevision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budgetId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "revisionType" "BudgetRevisionType" NOT NULL DEFAULT 'AMENDMENT',
    "status" "BudgetRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "reviewedByUserId" UUID,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "originalSnapshot" JSONB NOT NULL,
    "proposedSnapshot" JSONB NOT NULL,
    "approvedSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BudgetRevision_number_check" CHECK ("revisionNumber" >= 1),
    CONSTRAINT "BudgetRevision_effective_dates_check" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo"),
    CONSTRAINT "BudgetRevision_review_actor_check" CHECK ("reviewedByUserId" IS NULL OR "reviewedByUserId" <> "requestedByUserId"),
    CONSTRAINT "BudgetRevision_reviewed_at_check" CHECK ("status" NOT IN ('APPROVED', 'REJECTED') OR "reviewedAt" IS NOT NULL)
);

CREATE TABLE "BudgetCommitment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budgetId" UUID NOT NULL,
    "budgetLineId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourceType" "BudgetSourceEventType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLineId" TEXT,
    "sourceEventKey" TEXT NOT NULL,
    "sourceEventAt" TIMESTAMP(3) NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "sourceSnapshot" JSONB,
    "status" "BudgetCommitmentStatus" NOT NULL DEFAULT 'PENDING',
    "committedAmountPhp" DECIMAL(18,6) NOT NULL,
    "consumedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "releasedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "requestedByUserId" UUID,
    "approvedByUserId" UUID,
    "consumedByUserId" UUID,
    "reversedByUserId" UUID,
    "requestedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "reversalOfCommitmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetCommitment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BudgetCommitment_amount_check" CHECK ("committedAmountPhp" > 0 AND "consumedAmountPhp" >= 0 AND "releasedAmountPhp" >= 0 AND "committedAmountPhp" >= "consumedAmountPhp" AND "committedAmountPhp" >= "releasedAmountPhp"),
    CONSTRAINT "BudgetCommitment_approved_actor_check" CHECK ("approvedByUserId" IS NULL OR "requestedByUserId" IS NULL OR "approvedByUserId" <> "requestedByUserId"),
    CONSTRAINT "BudgetCommitment_consumed_at_check" CHECK ("status" <> 'CONSUMED' OR "consumedAt" IS NOT NULL),
    CONSTRAINT "BudgetCommitment_reversal_reason_check" CHECK ("status" <> 'REVERSED' OR ("reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL))
);

CREATE UNIQUE INDEX "Budget_companyId_publicReference_key" ON "Budget"("companyId", "publicReference");
CREATE INDEX "Budget_tenantId_companyId_status_fiscalYearId_idx" ON "Budget"("tenantId", "companyId", "status", "fiscalYearId");
CREATE INDEX "Budget_tenantId_companyId_brandId_locationId_departmentId_costCenterId_projectId_idx" ON "Budget"("tenantId", "companyId", "brandId", "locationId", "departmentId", "costCenterId", "projectId");
CREATE INDEX "Budget_ownerUserId_idx" ON "Budget"("ownerUserId");

CREATE UNIQUE INDEX "BudgetLine_budgetId_lineNumber_key" ON "BudgetLine"("budgetId", "lineNumber");
CREATE UNIQUE INDEX "BudgetLine_budgetId_code_key" ON "BudgetLine"("budgetId", "code");
CREATE INDEX "BudgetLine_tenantId_companyId_status_idx" ON "BudgetLine"("tenantId", "companyId", "status");
CREATE INDEX "BudgetLine_tenantId_companyId_accountId_idx" ON "BudgetLine"("tenantId", "companyId", "accountId");
CREATE INDEX "BudgetLine_tenantId_companyId_brandId_locationId_departmentId_costCenterId_projectId_idx" ON "BudgetLine"("tenantId", "companyId", "brandId", "locationId", "departmentId", "costCenterId", "projectId");
CREATE INDEX "BudgetLine_periodStart_periodEnd_idx" ON "BudgetLine"("periodStart", "periodEnd");

CREATE UNIQUE INDEX "BudgetRevision_budgetId_revisionNumber_key" ON "BudgetRevision"("budgetId", "revisionNumber");
CREATE INDEX "BudgetRevision_tenantId_companyId_status_idx" ON "BudgetRevision"("tenantId", "companyId", "status");
CREATE INDEX "BudgetRevision_requestedByUserId_idx" ON "BudgetRevision"("requestedByUserId");
CREATE INDEX "BudgetRevision_reviewedByUserId_idx" ON "BudgetRevision"("reviewedByUserId");

CREATE UNIQUE INDEX "BudgetCommitment_companyId_sourceType_sourceId_sourceEventKey_key" ON "BudgetCommitment"("companyId", "sourceType", "sourceId", "sourceEventKey");
CREATE UNIQUE INDEX "BudgetCommitment_companyId_budgetLineId_sourceType_sourceId_sourceLineId_key" ON "BudgetCommitment"("companyId", "budgetLineId", "sourceType", "sourceId", "sourceLineId");
CREATE INDEX "BudgetCommitment_tenantId_companyId_status_sourceType_idx" ON "BudgetCommitment"("tenantId", "companyId", "status", "sourceType");
CREATE INDEX "BudgetCommitment_tenantId_companyId_budgetLineId_status_idx" ON "BudgetCommitment"("tenantId", "companyId", "budgetLineId", "status");
CREATE INDEX "BudgetCommitment_reversalOfCommitmentId_idx" ON "BudgetCommitment"("reversalOfCommitmentId");

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_consumedByUserId_fkey" FOREIGN KEY ("consumedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_reversalOfCommitmentId_fkey" FOREIGN KEY ("reversalOfCommitmentId") REFERENCES "BudgetCommitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  ('00000000-0000-4000-8000-000000000149', 'finance.budget.view', 'finance', 'budget.view'),
  ('00000000-0000-4000-8000-000000000150', 'finance.budget.manage', 'finance', 'budget.manage'),
  ('00000000-0000-4000-8000-000000000151', 'finance.budget.approve', 'finance', 'budget.approve'),
  ('00000000-0000-4000-8000-000000000152', 'finance.budget.commitment.review', 'finance', 'budget.commitment.review')
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON (
    r."code" = 'CONFIGURED_ADMIN'
    AND p."code" IN (
      'finance.budget.view',
      'finance.budget.manage',
      'finance.budget.approve',
      'finance.budget.commitment.review'
    )
  )
  OR (
    r."code" = 'CONFIGURED_APPROVER'
    AND p."code" IN (
      'finance.budget.view',
      'finance.budget.approve',
      'finance.budget.commitment.review'
    )
  )
  OR (
    r."code" = 'CONFIGURED_REQUESTER'
    AND p."code" = 'finance.budget.view'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
