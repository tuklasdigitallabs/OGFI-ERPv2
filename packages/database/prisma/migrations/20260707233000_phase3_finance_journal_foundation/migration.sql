CREATE TYPE "FinanceJournalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'POSTING_IN_PROGRESS', 'POSTED', 'FAILED', 'REVERSED', 'SUPERSEDED', 'CANCELLED');
CREATE TYPE "FinanceJournalType" AS ENUM ('MANUAL', 'REVERSAL', 'AUTOMATED');
CREATE TYPE "FinancePostingAttemptStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "FinancePostingAttemptAction" AS ENUM ('POST', 'REVERSE');

CREATE TABLE "FinanceJournal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "journalType" "FinanceJournalType" NOT NULL DEFAULT 'MANUAL',
    "status" "FinanceJournalStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "accountingPeriodId" UUID NOT NULL,
    "journalDate" TIMESTAMP(3) NOT NULL,
    "postingDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "businessJustification" TEXT NOT NULL,
    "evidenceReference" TEXT,
    "sourceDocumentType" TEXT NOT NULL DEFAULT 'MANUAL_JOURNAL',
    "sourceDocumentId" UUID,
    "sourceEventKey" TEXT NOT NULL,
    "postingConsequenceType" TEXT NOT NULL DEFAULT 'MANUAL_JOURNAL',
    "postingRuleId" UUID,
    "postingRuleVersion" INTEGER,
    "brandId" UUID,
    "locationId" UUID,
    "departmentId" UUID,
    "costCenterId" UUID,
    "projectId" UUID,
    "createdByUserId" UUID NOT NULL,
    "submittedByUserId" UUID,
    "approvedByUserId" UUID,
    "postedByUserId" UUID,
    "reversedByUserId" UUID,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "reversalOfJournalId" UUID,
    "totalDebitAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalCreditAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceJournal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceJournal_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "FinanceJournal_total_amounts_nonnegative_check" CHECK ("totalDebitAmountPhp" >= 0 AND "totalCreditAmountPhp" >= 0),
    CONSTRAINT "FinanceJournal_posted_balance_check" CHECK ("status" NOT IN ('POSTED', 'REVERSED', 'SUPERSEDED') OR "totalDebitAmountPhp" = "totalCreditAmountPhp"),
    CONSTRAINT "FinanceJournal_posted_dates_check" CHECK (("status" <> 'POSTED' AND "status" <> 'REVERSED' AND "status" <> 'SUPERSEDED') OR "postedAt" IS NOT NULL),
    CONSTRAINT "FinanceJournal_reversal_reason_check" CHECK ("journalType" <> 'REVERSAL' OR "reversalOfJournalId" IS NOT NULL),
    CONSTRAINT "FinanceJournal_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "FinanceJournalLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "financeJournalId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountId" UUID NOT NULL,
    "amountSide" "FinancePostingRuleSide" NOT NULL,
    "amountPhp" DECIMAL(18,6) NOT NULL,
    "lineDescription" TEXT NOT NULL,
    "brandId" UUID,
    "locationId" UUID,
    "departmentId" UUID,
    "costCenterId" UUID,
    "projectId" UUID,
    "supplierId" UUID,
    "sourceLineType" TEXT,
    "sourceLineId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceJournalLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceJournalLine_line_number_check" CHECK ("lineNumber" >= 1),
    CONSTRAINT "FinanceJournalLine_amount_positive_check" CHECK ("amountPhp" > 0)
);

CREATE TABLE "FinanceJournalPostingAttempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "financeJournalId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "action" "FinancePostingAttemptAction" NOT NULL,
    "status" "FinancePostingAttemptStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" UUID NOT NULL,
    "resultJournalId" UUID,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "requestPayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceJournalPostingAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceJournal_companyId_publicReference_key" ON "FinanceJournal"("companyId", "publicReference");
CREATE UNIQUE INDEX "FinanceJournal_companyId_sourceDocumentType_sourceEventKey_key" ON "FinanceJournal"("companyId", "sourceDocumentType", "sourceEventKey");
CREATE INDEX "FinanceJournal_tenantId_companyId_status_createdAt_idx" ON "FinanceJournal"("tenantId", "companyId", "status", "createdAt");
CREATE INDEX "FinanceJournal_tenantId_companyId_accountingPeriodId_status_idx" ON "FinanceJournal"("tenantId", "companyId", "accountingPeriodId", "status");
CREATE INDEX "FinanceJournal_tenantId_companyId_sourceDocumentType_sourceDocumentId_idx" ON "FinanceJournal"("tenantId", "companyId", "sourceDocumentType", "sourceDocumentId");
CREATE INDEX "FinanceJournal_tenantId_companyId_journalDate_idx" ON "FinanceJournal"("tenantId", "companyId", "journalDate");
CREATE INDEX "FinanceJournal_reversalOfJournalId_idx" ON "FinanceJournal"("reversalOfJournalId");
CREATE INDEX "FinanceJournal_createdByUserId_idx" ON "FinanceJournal"("createdByUserId");

CREATE UNIQUE INDEX "FinanceJournalLine_financeJournalId_lineNumber_key" ON "FinanceJournalLine"("financeJournalId", "lineNumber");
CREATE INDEX "FinanceJournalLine_tenantId_companyId_financeJournalId_idx" ON "FinanceJournalLine"("tenantId", "companyId", "financeJournalId");
CREATE INDEX "FinanceJournalLine_tenantId_companyId_accountId_idx" ON "FinanceJournalLine"("tenantId", "companyId", "accountId");
CREATE INDEX "FinanceJournalLine_tenantId_companyId_brandId_locationId_departmentId_costCenterId_projectId_idx" ON "FinanceJournalLine"("tenantId", "companyId", "brandId", "locationId", "departmentId", "costCenterId", "projectId");

CREATE UNIQUE INDEX "FinanceJournalPostingAttempt_companyId_idempotencyKey_key" ON "FinanceJournalPostingAttempt"("companyId", "idempotencyKey");
CREATE INDEX "FinanceJournalPostingAttempt_tenantId_companyId_financeJournalId_status_idx" ON "FinanceJournalPostingAttempt"("tenantId", "companyId", "financeJournalId", "status");
CREATE INDEX "FinanceJournalPostingAttempt_tenantId_companyId_status_createdAt_idx" ON "FinanceJournalPostingAttempt"("tenantId", "companyId", "status", "createdAt");

ALTER TABLE "FinanceJournal" ADD CONSTRAINT "FinanceJournal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournal" ADD CONSTRAINT "FinanceJournal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournal" ADD CONSTRAINT "FinanceJournal_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournal" ADD CONSTRAINT "FinanceJournal_postingRuleId_fkey" FOREIGN KEY ("postingRuleId") REFERENCES "FinancePostingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceJournal" ADD CONSTRAINT "FinanceJournal_reversalOfJournalId_fkey" FOREIGN KEY ("reversalOfJournalId") REFERENCES "FinanceJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceJournalLine" ADD CONSTRAINT "FinanceJournalLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournalLine" ADD CONSTRAINT "FinanceJournalLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournalLine" ADD CONSTRAINT "FinanceJournalLine_financeJournalId_fkey" FOREIGN KEY ("financeJournalId") REFERENCES "FinanceJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournalLine" ADD CONSTRAINT "FinanceJournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceJournalPostingAttempt" ADD CONSTRAINT "FinanceJournalPostingAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournalPostingAttempt" ADD CONSTRAINT "FinanceJournalPostingAttempt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournalPostingAttempt" ADD CONSTRAINT "FinanceJournalPostingAttempt_financeJournalId_fkey" FOREIGN KEY ("financeJournalId") REFERENCES "FinanceJournal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  ('00000000-0000-4000-8000-000000000135', 'finance.journal.create', 'finance', 'journal.create'),
  ('00000000-0000-4000-8000-000000000136', 'finance.journal.submit', 'finance', 'journal.submit'),
  ('00000000-0000-4000-8000-000000000137', 'finance.journal.approve', 'finance', 'journal.approve'),
  ('00000000-0000-4000-8000-000000000138', 'finance.journal.post', 'finance', 'journal.post'),
  ('00000000-0000-4000-8000-000000000139', 'finance.journal.reverse', 'finance', 'journal.reverse')
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
      'finance.journal.create',
      'finance.journal.submit',
      'finance.journal.approve',
      'finance.journal.post',
      'finance.journal.reverse'
    )
  )
  OR (
    r."code" = 'CONFIGURED_APPROVER'
    AND p."code" = 'finance.journal.approve'
  )
  OR (
    r."code" = 'CONFIGURED_REQUESTER'
    AND p."code" IN ('finance.journal.create', 'finance.journal.submit')
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
