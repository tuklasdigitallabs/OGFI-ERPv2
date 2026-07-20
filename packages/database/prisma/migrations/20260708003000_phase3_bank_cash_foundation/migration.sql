CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'TREASURY', 'OTHER');
CREATE TYPE "BankAccountStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "BranchCashDepositStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'NEED_CLARIFICATION', 'FINANCE_APPROVED', 'QUEUED_FOR_RECONCILIATION', 'MATCHED', 'EXCEPTION', 'CANCELLED', 'RECONCILED');
CREATE TYPE "BankStatementStatus" AS ENUM ('DRAFT', 'FILE_UPLOADED', 'VALIDATION_PASSED', 'VALIDATION_FAILED', 'READY_FOR_RECONCILIATION', 'LOCKED', 'CANCELLED');
CREATE TYPE "BankStatementLineStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'PARTIALLY_MATCHED', 'EXCEPTION', 'ON_HOLD', 'VOIDED');
CREATE TYPE "BankReconciliationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'MATCHED', 'EXCEPTION', 'CLOSED', 'REOPENED', 'VOIDED');
CREATE TYPE "BankReconciliationMatchStatus" AS ENUM ('PROPOSED', 'MATCHED', 'DISPUTED', 'REVERSED', 'VOIDED');
CREATE TYPE "BankReconciliationSourceType" AS ENUM ('BRANCH_CASH_DEPOSIT', 'PAYMENT_REQUEST', 'FINANCE_JOURNAL', 'UNKNOWN');

CREATE TABLE "BankAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID,
    "ledgerAccountId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankBranchCode" TEXT,
    "maskedAccountNumber" TEXT NOT NULL,
    "accountType" "BankAccountType" NOT NULL,
    "status" "BankAccountStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "evidenceReference" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankAccount_php_only_check" CHECK ("currencyCode" = 'PHP')
);

CREATE TABLE "BranchCashDeposit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "depositDate" TIMESTAMP(3) NOT NULL,
    "amountPhp" DECIMAL(18,6) NOT NULL,
    "status" "BranchCashDepositStatus" NOT NULL DEFAULT 'DRAFT',
    "depositSlipNumber" TEXT,
    "sourceEventKey" TEXT NOT NULL,
    "evidenceReference" TEXT,
    "notes" TEXT,
    "declaredByUserId" UUID NOT NULL,
    "verifiedByUserId" UUID,
    "verifiedAt" TIMESTAMP(3),
    "clarificationReason" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchCashDeposit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BranchCashDeposit_amount_positive_check" CHECK ("amountPhp" > 0),
    CONSTRAINT "BranchCashDeposit_evidence_for_submitted_check" CHECK ("status" NOT IN ('SUBMITTED', 'FINANCE_APPROVED', 'QUEUED_FOR_RECONCILIATION', 'MATCHED', 'RECONCILED') OR "evidenceReference" IS NOT NULL),
    CONSTRAINT "BranchCashDeposit_cancelled_reason_check" CHECK ("status" <> 'CANCELLED' OR "cancellationReason" IS NOT NULL)
);

CREATE TABLE "BankStatement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "statementFrom" TIMESTAMP(3) NOT NULL,
    "statementTo" TIMESTAMP(3) NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "sourceEventKey" TEXT NOT NULL,
    "status" "BankStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "openingBalance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "validationErrors" JSONB,
    "importedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankStatement_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "BankStatement_date_range_check" CHECK ("statementTo" >= "statementFrom")
);

CREATE TABLE "BankStatementLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankStatementId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "bankReference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debitAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,6) NOT NULL,
    "status" "BankStatementLineStatus" NOT NULL DEFAULT 'UNMATCHED',
    "sourceEventKey" TEXT NOT NULL,
    "notes" TEXT,
    "matchedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankStatementLine_amounts_nonnegative_check" CHECK ("debitAmount" >= 0 AND "creditAmount" >= 0 AND "matchedAmount" >= 0),
    CONSTRAINT "BankStatementLine_net_amount_check" CHECK ("netAmount" = "creditAmount" - "debitAmount"),
    CONSTRAINT "BankStatementLine_activity_check" CHECK ("debitAmount" > 0 OR "creditAmount" > 0)
);

CREATE TABLE "BankReconciliation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "accountingPeriodId" UUID NOT NULL,
    "bankStatementId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "status" "BankReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "preparedByUserId" UUID NOT NULL,
    "reviewedByUserId" UUID,
    "approvedByUserId" UUID,
    "preparedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reason" TEXT,
    "varianceAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankReconciliation_approved_actor_check" CHECK ("status" <> 'CLOSED' OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "closedAt" IS NOT NULL)),
    CONSTRAINT "BankReconciliation_reopen_reason_check" CHECK ("status" <> 'REOPENED' OR "reason" IS NOT NULL)
);

CREATE TABLE "BankReconciliationMatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reconciliationId" UUID NOT NULL,
    "statementLineId" UUID NOT NULL,
    "branchCashDepositId" UUID,
    "sourceType" "BankReconciliationSourceType" NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "sourceDocumentSnapshot" JSONB,
    "matchedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "BankReconciliationMatchStatus" NOT NULL DEFAULT 'PROPOSED',
    "idempotencyKey" TEXT NOT NULL,
    "matchedByUserId" UUID,
    "matchedAt" TIMESTAMP(3),
    "reason" TEXT,
    "evidenceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliationMatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankReconciliationMatch_amount_positive_check" CHECK ("matchedAmount" > 0),
    CONSTRAINT "BankReconciliationMatch_actor_check" CHECK ("status" <> 'MATCHED' OR ("matchedByUserId" IS NOT NULL AND "matchedAt" IS NOT NULL)),
    CONSTRAINT "BankReconciliationMatch_branch_deposit_link_check" CHECK ("sourceType" <> 'BRANCH_CASH_DEPOSIT' OR "branchCashDepositId" IS NOT NULL)
);

CREATE UNIQUE INDEX "BankAccount_companyId_publicReference_key" ON "BankAccount"("companyId", "publicReference");
CREATE INDEX "BankAccount_tenantId_companyId_status_idx" ON "BankAccount"("tenantId", "companyId", "status");
CREATE INDEX "BankAccount_tenantId_companyId_locationId_status_idx" ON "BankAccount"("tenantId", "companyId", "locationId", "status");
CREATE INDEX "BankAccount_ledgerAccountId_idx" ON "BankAccount"("ledgerAccountId");

CREATE UNIQUE INDEX "BranchCashDeposit_companyId_publicReference_key" ON "BranchCashDeposit"("companyId", "publicReference");
CREATE UNIQUE INDEX "BranchCashDeposit_tenantId_companyId_sourceEventKey_key" ON "BranchCashDeposit"("tenantId", "companyId", "sourceEventKey");
CREATE INDEX "BranchCashDeposit_tenantId_companyId_locationId_status_depositDate_idx" ON "BranchCashDeposit"("tenantId", "companyId", "locationId", "status", "depositDate");
CREATE INDEX "BranchCashDeposit_tenantId_companyId_bankAccountId_status_idx" ON "BranchCashDeposit"("tenantId", "companyId", "bankAccountId", "status");

CREATE UNIQUE INDEX "BankStatement_companyId_publicReference_key" ON "BankStatement"("companyId", "publicReference");
CREATE UNIQUE INDEX "BankStatement_tenantId_companyId_sourceEventKey_key" ON "BankStatement"("tenantId", "companyId", "sourceEventKey");
CREATE INDEX "BankStatement_tenantId_companyId_bankAccountId_status_statementDate_idx" ON "BankStatement"("tenantId", "companyId", "bankAccountId", "status", "statementDate");
CREATE INDEX "BankStatement_sourceReference_idx" ON "BankStatement"("sourceReference");

CREATE UNIQUE INDEX "BankStatementLine_tenantId_companyId_sourceEventKey_key" ON "BankStatementLine"("tenantId", "companyId", "sourceEventKey");
CREATE INDEX "BankStatementLine_tenantId_companyId_bankStatementId_transactionDate_idx" ON "BankStatementLine"("tenantId", "companyId", "bankStatementId", "transactionDate");
CREATE INDEX "BankStatementLine_tenantId_companyId_bankAccountId_status_idx" ON "BankStatementLine"("tenantId", "companyId", "bankAccountId", "status");

CREATE UNIQUE INDEX "BankReconciliation_companyId_publicReference_key" ON "BankReconciliation"("companyId", "publicReference");
CREATE INDEX "BankReconciliation_tenantId_companyId_bankAccountId_status_idx" ON "BankReconciliation"("tenantId", "companyId", "bankAccountId", "status");
CREATE INDEX "BankReconciliation_tenantId_companyId_accountingPeriodId_status_idx" ON "BankReconciliation"("tenantId", "companyId", "accountingPeriodId", "status");

CREATE UNIQUE INDEX "BankReconciliationMatch_tenantId_companyId_idempotencyKey_key" ON "BankReconciliationMatch"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "BankReconciliationMatch_reconciliationId_statementLineId_sourceType_sourceDocumentId_key" ON "BankReconciliationMatch"("reconciliationId", "statementLineId", "sourceType", "sourceDocumentId");
CREATE INDEX "BankReconciliationMatch_tenantId_companyId_reconciliationId_status_idx" ON "BankReconciliationMatch"("tenantId", "companyId", "reconciliationId", "status");
CREATE INDEX "BankReconciliationMatch_tenantId_companyId_sourceType_sourceDocumentId_idx" ON "BankReconciliationMatch"("tenantId", "companyId", "sourceType", "sourceDocumentId");
CREATE INDEX "BankReconciliationMatch_tenantId_companyId_branchCashDepositId_idx" ON "BankReconciliationMatch"("tenantId", "companyId", "branchCashDepositId");

ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchCashDeposit" ADD CONSTRAINT "BranchCashDeposit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchCashDeposit" ADD CONSTRAINT "BranchCashDeposit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchCashDeposit" ADD CONSTRAINT "BranchCashDeposit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchCashDeposit" ADD CONSTRAINT "BranchCashDeposit_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchCashDeposit" ADD CONSTRAINT "BranchCashDeposit_declaredByUserId_fkey" FOREIGN KEY ("declaredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchCashDeposit" ADD CONSTRAINT "BranchCashDeposit_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bankStatementId_fkey" FOREIGN KEY ("bankStatementId") REFERENCES "BankStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankStatementId_fkey" FOREIGN KEY ("bankStatementId") REFERENCES "BankStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "BankStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_branchCashDepositId_fkey" FOREIGN KEY ("branchCashDepositId") REFERENCES "BranchCashDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_matchedByUserId_fkey" FOREIGN KEY ("matchedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
