CREATE TYPE "AccountingPeriodStatus" AS ENUM ('FUTURE', 'OPEN', 'SOFT_CLOSED', 'LOCKED', 'REOPENED');
CREATE TYPE "FinanceFiscalYearStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "FinanceNormalBalance" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "FinanceAccountStatementSection" AS ENUM ('BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'EQUITY');
CREATE TYPE "FinancePostingRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "FinancePostingRuleSide" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "FinanceDimensionType" AS ENUM ('BRAND', 'LOCATION', 'DEPARTMENT', 'COST_CENTER', 'PROJECT');

CREATE TABLE "FiscalYear" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FinanceFiscalYearStatus" NOT NULL DEFAULT 'DRAFT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FiscalYear_date_range_check" CHECK ("endDate" >= "startDate")
);

CREATE TABLE "AccountingPeriod" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalYearId" UUID NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'FUTURE',
    "softClosedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenedUntil" TIMESTAMP(3),
    "closeEvidenceReference" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingPeriod_date_range_check" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "AccountingPeriod_period_number_check" CHECK ("periodNumber" >= 1 AND "periodNumber" <= 13)
);

CREATE TABLE "FinanceAccountClass" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalBalance" "FinanceNormalBalance" NOT NULL,
    "statementSection" "FinanceAccountStatementSection" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccountClass_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChartOfAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "accountClassId" UUID NOT NULL,
    "parentAccountId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "normalBalance" "FinanceNormalBalance" NOT NULL,
    "isHeader" BOOLEAN NOT NULL DEFAULT false,
    "postingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChartOfAccount_active_range_check" CHECK ("activeTo" IS NULL OR "activeFrom" IS NULL OR "activeTo" >= "activeFrom")
);

CREATE TABLE "FinancePostingRule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceType" TEXT NOT NULL,
    "sourceEvent" TEXT NOT NULL,
    "postingConsequenceType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "ruleMetadata" JSONB,
    "isConfigOnly" BOOLEAN NOT NULL DEFAULT true,
    "isExecutionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
    "status" "FinancePostingRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancePostingRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinancePostingRule_version_check" CHECK ("version" >= 1),
    CONSTRAINT "FinancePostingRule_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom"),
    CONSTRAINT "FinancePostingRule_execution_guard_check" CHECK ("isExecutionEnabled" = false OR ("isConfigOnly" = false AND "status" = 'ACTIVE'))
);

CREATE TABLE "FinancePostingRuleAccountMap" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "postingRuleId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "side" "FinancePostingRuleSide" NOT NULL,
    "lineRole" TEXT NOT NULL,
    "amountSource" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancePostingRuleAccountMap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancePostingRuleDimensionRequirement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "postingRuleId" UUID NOT NULL,
    "dimensionType" "FinanceDimensionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "allowDerivedValue" BOOLEAN NOT NULL DEFAULT true,
    "sourceField" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancePostingRuleDimensionRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalYear_companyId_code_key" ON "FiscalYear"("companyId", "code");
CREATE INDEX "FiscalYear_tenantId_companyId_status_idx" ON "FiscalYear"("tenantId", "companyId", "status");
CREATE INDEX "FiscalYear_tenantId_companyId_isDefault_idx" ON "FiscalYear"("tenantId", "companyId", "isDefault");
CREATE INDEX "FiscalYear_tenantId_companyId_startDate_endDate_idx" ON "FiscalYear"("tenantId", "companyId", "startDate", "endDate");

CREATE UNIQUE INDEX "AccountingPeriod_fiscalYearId_periodNumber_key" ON "AccountingPeriod"("fiscalYearId", "periodNumber");
CREATE UNIQUE INDEX "AccountingPeriod_companyId_code_key" ON "AccountingPeriod"("companyId", "code");
CREATE INDEX "AccountingPeriod_tenantId_companyId_status_startDate_idx" ON "AccountingPeriod"("tenantId", "companyId", "status", "startDate");
CREATE INDEX "AccountingPeriod_tenantId_companyId_startDate_endDate_idx" ON "AccountingPeriod"("tenantId", "companyId", "startDate", "endDate");

CREATE UNIQUE INDEX "FinanceAccountClass_companyId_code_key" ON "FinanceAccountClass"("companyId", "code");
CREATE INDEX "FinanceAccountClass_tenantId_companyId_status_idx" ON "FinanceAccountClass"("tenantId", "companyId", "status");
CREATE INDEX "FinanceAccountClass_tenantId_companyId_statementSection_sortOrder_idx" ON "FinanceAccountClass"("tenantId", "companyId", "statementSection", "sortOrder");

CREATE UNIQUE INDEX "ChartOfAccount_companyId_code_key" ON "ChartOfAccount"("companyId", "code");
CREATE INDEX "ChartOfAccount_tenantId_companyId_status_postingAllowed_idx" ON "ChartOfAccount"("tenantId", "companyId", "status", "postingAllowed");
CREATE INDEX "ChartOfAccount_tenantId_companyId_accountClassId_idx" ON "ChartOfAccount"("tenantId", "companyId", "accountClassId");
CREATE INDEX "ChartOfAccount_parentAccountId_idx" ON "ChartOfAccount"("parentAccountId");

CREATE UNIQUE INDEX "FinancePostingRule_companyId_code_version_key" ON "FinancePostingRule"("companyId", "code", "version");
CREATE INDEX "FinancePostingRule_tenantId_companyId_sourceType_sourceEvent_status_idx" ON "FinancePostingRule"("tenantId", "companyId", "sourceType", "sourceEvent", "status");
CREATE INDEX "FinancePostingRule_tenantId_companyId_isExecutionEnabled_status_idx" ON "FinancePostingRule"("tenantId", "companyId", "isExecutionEnabled", "status");
CREATE INDEX "FinancePostingRule_tenantId_companyId_status_effectiveFrom_idx" ON "FinancePostingRule"("tenantId", "companyId", "status", "effectiveFrom");

CREATE UNIQUE INDEX "FinancePostingRuleAccountMap_postingRuleId_lineRole_side_accountId_key" ON "FinancePostingRuleAccountMap"("postingRuleId", "lineRole", "side", "accountId");
CREATE INDEX "FinancePostingRuleAccountMap_tenantId_companyId_postingRuleId_status_idx" ON "FinancePostingRuleAccountMap"("tenantId", "companyId", "postingRuleId", "status");
CREATE INDEX "FinancePostingRuleAccountMap_tenantId_companyId_accountId_status_idx" ON "FinancePostingRuleAccountMap"("tenantId", "companyId", "accountId", "status");

CREATE UNIQUE INDEX "FinancePostingRuleDimensionRequirement_postingRuleId_dimensionType_key" ON "FinancePostingRuleDimensionRequirement"("postingRuleId", "dimensionType");
CREATE INDEX "FinancePostingRuleDimensionRequirement_tenantId_companyId_postingRuleId_status_idx" ON "FinancePostingRuleDimensionRequirement"("tenantId", "companyId", "postingRuleId", "status");
CREATE INDEX "FinancePostingRuleDimensionRequirement_tenantId_companyId_dimensionType_required_idx" ON "FinancePostingRuleDimensionRequirement"("tenantId", "companyId", "dimensionType", "required");

ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceAccountClass" ADD CONSTRAINT "FinanceAccountClass_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAccountClass" ADD CONSTRAINT "FinanceAccountClass_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_accountClassId_fkey" FOREIGN KEY ("accountClassId") REFERENCES "FinanceAccountClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancePostingRule" ADD CONSTRAINT "FinancePostingRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePostingRule" ADD CONSTRAINT "FinancePostingRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancePostingRuleAccountMap" ADD CONSTRAINT "FinancePostingRuleAccountMap_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePostingRuleAccountMap" ADD CONSTRAINT "FinancePostingRuleAccountMap_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePostingRuleAccountMap" ADD CONSTRAINT "FinancePostingRuleAccountMap_postingRuleId_fkey" FOREIGN KEY ("postingRuleId") REFERENCES "FinancePostingRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePostingRuleAccountMap" ADD CONSTRAINT "FinancePostingRuleAccountMap_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancePostingRuleDimensionRequirement" ADD CONSTRAINT "FinancePostingRuleDimensionRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePostingRuleDimensionRequirement" ADD CONSTRAINT "FinancePostingRuleDimensionRequirement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePostingRuleDimensionRequirement" ADD CONSTRAINT "FinancePostingRuleDimensionRequirement_postingRuleId_fkey" FOREIGN KEY ("postingRuleId") REFERENCES "FinancePostingRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
