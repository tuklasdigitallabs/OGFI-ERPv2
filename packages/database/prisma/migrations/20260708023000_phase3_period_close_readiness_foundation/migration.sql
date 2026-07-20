CREATE TYPE "FinanceCloseRunType" AS ENUM ('READINESS', 'MONTH_END', 'LOCK_CANDIDATE');
CREATE TYPE "FinanceCloseRunStatus" AS ENUM ('OPEN', 'VALIDATING', 'BLOCKED', 'READY_FOR_REVIEW', 'READY_TO_CLOSE', 'CLOSED', 'CANCELLED');
CREATE TYPE "FinanceCloseChecklistType" AS ENUM ('BRANCH_DEPOSITS', 'BANK_RECONCILIATION', 'AP_EXCEPTIONS', 'PAYMENT_RELEASES', 'PETTY_CASH', 'CASH_ADVANCES', 'INVENTORY_CUTOFF', 'MANUAL_JOURNALS', 'TRIAL_BALANCE', 'WORKFORCE_REVIEW', 'MANAGEMENT_SIGNOFF');
CREATE TYPE "FinanceCloseChecklistStatus" AS ENUM ('PENDING', 'PASS', 'FAIL', 'NOT_APPLICABLE', 'WAIVED');
CREATE TYPE "FinanceCloseExceptionSeverity" AS ENUM ('BLOCKER', 'SIGNIFICANT', 'INFO');
CREATE TYPE "FinanceCloseExceptionState" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'WAIVED', 'CANCELLED');
CREATE TYPE "FinanceCloseAttemptAction" AS ENUM ('START_VALIDATION', 'COMPLETE_CHECK', 'WAIVE_CHECK', 'ASSIGN_EXCEPTION', 'RESOLVE_EXCEPTION', 'SUBMIT_FOR_REVIEW', 'MARK_READY', 'CANCEL_RUN');
CREATE TYPE "FinanceCloseAttemptResult" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED');

CREATE TABLE "FinanceCloseRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "accountingPeriodId" UUID NOT NULL,
  "publicReference" TEXT NOT NULL,
  "runType" "FinanceCloseRunType" NOT NULL DEFAULT 'READINESS',
  "status" "FinanceCloseRunStatus" NOT NULL DEFAULT 'OPEN',
  "sourceWindowStartAt" TIMESTAMP(3),
  "sourceWindowEndAt" TIMESTAMP(3),
  "initiatedByUserId" UUID NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "reason" TEXT,
  "evidenceReference" TEXT,
  "configSnapshot" JSONB,
  "notes" TEXT,
  "idempotencyKey" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceCloseRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceCloseChecklistItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "accountingPeriodId" UUID NOT NULL,
  "financeCloseRunId" UUID NOT NULL,
  "checklistType" "FinanceCloseChecklistType" NOT NULL,
  "label" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "status" "FinanceCloseChecklistStatus" NOT NULL DEFAULT 'PENDING',
  "ownerUserId" UUID,
  "completedByUserId" UUID,
  "reviewedByUserId" UUID,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "resultSummary" TEXT,
  "exceptionReason" TEXT,
  "evidenceReference" TEXT,
  "sourceSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceCloseChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceCloseException" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "accountingPeriodId" UUID NOT NULL,
  "financeCloseRunId" UUID,
  "exceptionType" TEXT NOT NULL,
  "severity" "FinanceCloseExceptionSeverity" NOT NULL DEFAULT 'SIGNIFICANT',
  "state" "FinanceCloseExceptionState" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "sourceSnapshot" JSONB,
  "raisedByUserId" UUID NOT NULL,
  "assignedToUserId" UUID,
  "resolvedByUserId" UUID,
  "dueAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "waivedAt" TIMESTAMP(3),
  "resolutionReason" TEXT,
  "evidenceReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceCloseException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceCloseAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "accountingPeriodId" UUID NOT NULL,
  "financeCloseRunId" UUID NOT NULL,
  "action" "FinanceCloseAttemptAction" NOT NULL,
  "result" "FinanceCloseAttemptResult" NOT NULL DEFAULT 'IN_PROGRESS',
  "idempotencyKey" TEXT NOT NULL,
  "attemptedByUserId" UUID NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failureCode" TEXT,
  "failureContext" JSONB,
  "notes" TEXT,
  CONSTRAINT "FinanceCloseAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceCloseRun_companyId_publicReference_key" ON "FinanceCloseRun"("companyId", "publicReference");
CREATE UNIQUE INDEX "FinanceCloseRun_tenantId_companyId_accountingPeriodId_runType_key" ON "FinanceCloseRun"("tenantId", "companyId", "accountingPeriodId", "runType");
CREATE UNIQUE INDEX "FinanceCloseRun_tenantId_companyId_idempotencyKey_key" ON "FinanceCloseRun"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "FinanceCloseRun_tenantId_companyId_status_createdAt_idx" ON "FinanceCloseRun"("tenantId", "companyId", "status", "createdAt");
CREATE INDEX "FinanceCloseRun_tenantId_companyId_accountingPeriodId_status_idx" ON "FinanceCloseRun"("tenantId", "companyId", "accountingPeriodId", "status");

CREATE UNIQUE INDEX "FinanceCloseChecklistItem_financeCloseRunId_checklistType_key" ON "FinanceCloseChecklistItem"("financeCloseRunId", "checklistType");
CREATE INDEX "FinanceCloseChecklistItem_tenantId_companyId_accountingPeriodId_status_idx" ON "FinanceCloseChecklistItem"("tenantId", "companyId", "accountingPeriodId", "status");
CREATE INDEX "FinanceCloseChecklistItem_tenantId_companyId_ownerUserId_status_idx" ON "FinanceCloseChecklistItem"("tenantId", "companyId", "ownerUserId", "status");

CREATE INDEX "FinanceCloseException_tenantId_companyId_accountingPeriodId_state_severity_idx" ON "FinanceCloseException"("tenantId", "companyId", "accountingPeriodId", "state", "severity");
CREATE INDEX "FinanceCloseException_tenantId_companyId_state_dueAt_idx" ON "FinanceCloseException"("tenantId", "companyId", "state", "dueAt");
CREATE INDEX "FinanceCloseException_tenantId_companyId_sourceEntityType_sourceEntityId_idx" ON "FinanceCloseException"("tenantId", "companyId", "sourceEntityType", "sourceEntityId");

CREATE UNIQUE INDEX "FinanceCloseAttempt_tenantId_companyId_idempotencyKey_key" ON "FinanceCloseAttempt"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "FinanceCloseAttempt_tenantId_companyId_accountingPeriodId_action_idx" ON "FinanceCloseAttempt"("tenantId", "companyId", "accountingPeriodId", "action");
CREATE INDEX "FinanceCloseAttempt_tenantId_companyId_financeCloseRunId_result_idx" ON "FinanceCloseAttempt"("tenantId", "companyId", "financeCloseRunId", "result");

ALTER TABLE "FinanceCloseRun" ADD CONSTRAINT "FinanceCloseRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseRun" ADD CONSTRAINT "FinanceCloseRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseRun" ADD CONSTRAINT "FinanceCloseRun_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseRun" ADD CONSTRAINT "FinanceCloseRun_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceCloseChecklistItem" ADD CONSTRAINT "FinanceCloseChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseChecklistItem" ADD CONSTRAINT "FinanceCloseChecklistItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseChecklistItem" ADD CONSTRAINT "FinanceCloseChecklistItem_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseChecklistItem" ADD CONSTRAINT "FinanceCloseChecklistItem_financeCloseRunId_fkey" FOREIGN KEY ("financeCloseRunId") REFERENCES "FinanceCloseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseChecklistItem" ADD CONSTRAINT "FinanceCloseChecklistItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseChecklistItem" ADD CONSTRAINT "FinanceCloseChecklistItem_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseChecklistItem" ADD CONSTRAINT "FinanceCloseChecklistItem_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinanceCloseException" ADD CONSTRAINT "FinanceCloseException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseException" ADD CONSTRAINT "FinanceCloseException_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseException" ADD CONSTRAINT "FinanceCloseException_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseException" ADD CONSTRAINT "FinanceCloseException_financeCloseRunId_fkey" FOREIGN KEY ("financeCloseRunId") REFERENCES "FinanceCloseRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseException" ADD CONSTRAINT "FinanceCloseException_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseException" ADD CONSTRAINT "FinanceCloseException_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseException" ADD CONSTRAINT "FinanceCloseException_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinanceCloseAttempt" ADD CONSTRAINT "FinanceCloseAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseAttempt" ADD CONSTRAINT "FinanceCloseAttempt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseAttempt" ADD CONSTRAINT "FinanceCloseAttempt_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseAttempt" ADD CONSTRAINT "FinanceCloseAttempt_financeCloseRunId_fkey" FOREIGN KEY ("financeCloseRunId") REFERENCES "FinanceCloseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseAttempt" ADD CONSTRAINT "FinanceCloseAttempt_attemptedByUserId_fkey" FOREIGN KEY ("attemptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
