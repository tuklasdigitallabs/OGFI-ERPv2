CREATE TYPE "PettyCashFundStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "PettyCashRequestType" AS ENUM ('REPLENISHMENT', 'DISBURSEMENT');
CREATE TYPE "PettyCashRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AWAITING_APPROVAL', 'RETURNED_FOR_REVISION', 'APPROVED', 'FULFILLED_OFFLINE', 'CLOSED', 'REJECTED', 'CANCELLED', 'VOIDED');
CREATE TYPE "PettyCashLiquidationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED_FOR_REVISION', 'APPROVED', 'CLOSED', 'REJECTED', 'CANCELLED', 'REVERSED');
CREATE TYPE "PettyCashLedgerEntryType" AS ENUM ('OPENING', 'REPLENISHMENT', 'ISSUE', 'RETURN', 'LIQUIDATION_SETTLEMENT', 'SHORTAGE_ADJUSTMENT', 'OVERAGE_ADJUSTMENT', 'REVERSAL', 'VOID');

CREATE TABLE "PettyCashFund" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "openingBalancePhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "currentBalancePhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "targetBalancePhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lowBalanceAlertPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "PettyCashFundStatus" NOT NULL DEFAULT 'DRAFT',
    "brandId" UUID,
    "locationId" UUID NOT NULL,
    "custodianUserId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "evidenceReference" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashFund_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PettyCashFund_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "PettyCashFund_amount_check" CHECK ("openingBalancePhp" >= 0 AND "currentBalancePhp" >= 0 AND "targetBalancePhp" >= 0 AND "lowBalanceAlertPhp" >= 0),
    CONSTRAINT "PettyCashFund_version_check" CHECK ("version" >= 1),
    CONSTRAINT "PettyCashFund_active_at_check" CHECK ("status" <> 'ACTIVE' OR "activatedAt" IS NOT NULL)
);

CREATE TABLE "PettyCashRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "pettyCashFundId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "requestType" "PettyCashRequestType" NOT NULL,
    "status" "PettyCashRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "requestedAmountPhp" DECIMAL(18,6) NOT NULL,
    "approvedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "purpose" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "dueBy" TIMESTAMP(3),
    "requestedByUserId" UUID NOT NULL,
    "submittedByUserId" UUID,
    "approvedByUserId" UUID,
    "returnedByUserId" UUID,
    "rejectedByUserId" UUID,
    "cancelledByUserId" UUID,
    "closedByUserId" UUID,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "returnReason" TEXT,
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "closureNotes" TEXT,
    "evidenceReference" TEXT,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "sourceEventKey" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PettyCashRequest_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "PettyCashRequest_amount_check" CHECK ("requestedAmountPhp" > 0 AND "approvedAmountPhp" >= 0 AND "approvedAmountPhp" <= "requestedAmountPhp"),
    CONSTRAINT "PettyCashRequest_submitted_at_check" CHECK ("status" NOT IN ('SUBMITTED', 'AWAITING_APPROVAL') OR "submittedAt" IS NOT NULL),
    CONSTRAINT "PettyCashRequest_approved_actor_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "requestedByUserId"),
    CONSTRAINT "PettyCashRequest_approved_at_check" CHECK ("status" NOT IN ('APPROVED', 'FULFILLED_OFFLINE', 'CLOSED') OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
    CONSTRAINT "PettyCashRequest_return_reason_check" CHECK ("status" <> 'RETURNED_FOR_REVISION' OR ("returnedByUserId" IS NOT NULL AND "returnedAt" IS NOT NULL AND "returnReason" IS NOT NULL)),
    CONSTRAINT "PettyCashRequest_reject_reason_check" CHECK ("status" <> 'REJECTED' OR ("rejectedByUserId" IS NOT NULL AND "rejectedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL)),
    CONSTRAINT "PettyCashRequest_cancel_reason_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledByUserId" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL)),
    CONSTRAINT "PettyCashRequest_closed_at_check" CHECK ("status" <> 'CLOSED' OR ("closedByUserId" IS NOT NULL AND "closedAt" IS NOT NULL))
);

CREATE TABLE "PettyCashLedgerEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "pettyCashFundId" UUID NOT NULL,
    "pettyCashRequestId" UUID,
    "liquidationId" UUID,
    "entryType" "PettyCashLedgerEntryType" NOT NULL,
    "direction" INTEGER NOT NULL,
    "amountPhp" DECIMAL(18,6) NOT NULL,
    "balanceBeforePhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "balanceAfterPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "postedAt" TIMESTAMP(3) NOT NULL,
    "postedByUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceEventKey" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "voidedByUserId" UUID,
    "voidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PettyCashLedgerEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PettyCashLedgerEntry_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "PettyCashLedgerEntry_amount_check" CHECK ("amountPhp" > 0 AND "balanceBeforePhp" >= 0 AND "balanceAfterPhp" >= 0),
    CONSTRAINT "PettyCashLedgerEntry_direction_check" CHECK ("direction" IN (-1, 1)),
    CONSTRAINT "PettyCashLedgerEntry_type_direction_check" CHECK (
      ("direction" = 1 AND "entryType" IN ('OPENING', 'REPLENISHMENT', 'RETURN', 'OVERAGE_ADJUSTMENT', 'REVERSAL'))
      OR ("direction" = -1 AND "entryType" IN ('ISSUE', 'LIQUIDATION_SETTLEMENT', 'SHORTAGE_ADJUSTMENT', 'VOID'))
    )
);

CREATE TABLE "PettyCashLiquidation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "pettyCashFundId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "claimedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "approvedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "shortageAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "overageAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "PettyCashLiquidationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedByUserId" UUID NOT NULL,
    "reviewedByUserId" UUID,
    "approvedByUserId" UUID,
    "cancelledByUserId" UUID,
    "closedByUserId" UUID,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "cancellationReason" TEXT,
    "closureNotes" TEXT,
    "evidenceReference" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashLiquidation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PettyCashLiquidation_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "PettyCashLiquidation_amount_check" CHECK ("claimedAmountPhp" >= 0 AND "approvedAmountPhp" >= 0 AND "shortageAmountPhp" >= 0 AND "overageAmountPhp" >= 0),
    CONSTRAINT "PettyCashLiquidation_period_check" CHECK ("cycleEnd" >= "cycleStart"),
    CONSTRAINT "PettyCashLiquidation_submitted_at_check" CHECK ("status" NOT IN ('SUBMITTED', 'UNDER_REVIEW') OR "submittedAt" IS NOT NULL),
    CONSTRAINT "PettyCashLiquidation_approved_actor_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "submittedByUserId"),
    CONSTRAINT "PettyCashLiquidation_approved_at_check" CHECK ("status" NOT IN ('APPROVED', 'CLOSED') OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
    CONSTRAINT "PettyCashLiquidation_return_reason_check" CHECK ("status" <> 'RETURNED_FOR_REVISION' OR ("reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL)),
    CONSTRAINT "PettyCashLiquidation_cancel_reason_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledByUserId" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL)),
    CONSTRAINT "PettyCashLiquidation_closed_at_check" CHECK ("status" <> 'CLOSED' OR ("closedByUserId" IS NOT NULL AND "closedAt" IS NOT NULL))
);

CREATE TABLE "PettyCashLiquidationLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "pettyCashFundId" UUID NOT NULL,
    "liquidationId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "spendDate" TIMESTAMP(3) NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountPhp" DECIMAL(18,6) NOT NULL,
    "taxAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "receiptReference" TEXT,
    "evidenceReference" TEXT,
    "supplierId" UUID,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "idempotencyKey" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashLiquidationLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PettyCashLiquidationLine_line_number_check" CHECK ("lineNumber" >= 1),
    CONSTRAINT "PettyCashLiquidationLine_amount_check" CHECK ("amountPhp" > 0 AND "taxAmountPhp" >= 0)
);

CREATE UNIQUE INDEX "PettyCashFund_companyId_publicReference_key" ON "PettyCashFund"("companyId", "publicReference");
CREATE UNIQUE INDEX "PettyCashFund_companyId_code_key" ON "PettyCashFund"("companyId", "code");
CREATE UNIQUE INDEX "PettyCashFund_tenantId_companyId_idempotencyKey_key" ON "PettyCashFund"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "PettyCashFund_scope_status_idx" ON "PettyCashFund"("tenantId", "companyId", "status", "locationId");
CREATE INDEX "PettyCashFund_custodian_status_idx" ON "PettyCashFund"("tenantId", "companyId", "custodianUserId", "status");

CREATE UNIQUE INDEX "PettyCashRequest_companyId_publicReference_key" ON "PettyCashRequest"("companyId", "publicReference");
CREATE UNIQUE INDEX "PettyCashRequest_tenantId_companyId_idempotencyKey_key" ON "PettyCashRequest"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "PettyCashRequest_tenantId_companyId_sourceEventKey_key" ON "PettyCashRequest"("tenantId", "companyId", "sourceEventKey");
CREATE INDEX "PettyCashRequest_fund_status_idx" ON "PettyCashRequest"("tenantId", "companyId", "pettyCashFundId", "status");
CREATE INDEX "PettyCashRequest_type_status_idx" ON "PettyCashRequest"("tenantId", "companyId", "requestType", "status");
CREATE INDEX "PettyCashRequest_requestedBy_status_idx" ON "PettyCashRequest"("requestedByUserId", "status");

CREATE UNIQUE INDEX "PettyCashLedgerEntry_source_event_key" ON "PettyCashLedgerEntry"("tenantId", "companyId", "sourceEventKey");
CREATE UNIQUE INDEX "PettyCashLedgerEntry_idempotency_key" ON "PettyCashLedgerEntry"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "PettyCashLedgerEntry_fund_posted_idx" ON "PettyCashLedgerEntry"("tenantId", "companyId", "pettyCashFundId", "postedAt");
CREATE INDEX "PettyCashLedgerEntry_request_type_idx" ON "PettyCashLedgerEntry"("tenantId", "companyId", "pettyCashRequestId", "entryType");
CREATE INDEX "PettyCashLedgerEntry_liquidation_idx" ON "PettyCashLedgerEntry"("tenantId", "companyId", "liquidationId");

CREATE UNIQUE INDEX "PettyCashLiquidation_companyId_publicReference_key" ON "PettyCashLiquidation"("companyId", "publicReference");
CREATE UNIQUE INDEX "PettyCashLiquidation_tenantId_companyId_idempotencyKey_key" ON "PettyCashLiquidation"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "PettyCashLiquidation_fund_status_idx" ON "PettyCashLiquidation"("tenantId", "companyId", "pettyCashFundId", "status");
CREATE INDEX "PettyCashLiquidation_status_created_idx" ON "PettyCashLiquidation"("tenantId", "companyId", "status", "createdAt");

CREATE UNIQUE INDEX "PettyCashLiquidationLine_liquidationId_lineNumber_key" ON "PettyCashLiquidationLine"("liquidationId", "lineNumber");
CREATE UNIQUE INDEX "PettyCashLiquidationLine_tenantId_companyId_idempotencyKey_key" ON "PettyCashLiquidationLine"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "PettyCashLiquidationLine_fund_idx" ON "PettyCashLiquidationLine"("tenantId", "companyId", "pettyCashFundId");
CREATE INDEX "PettyCashLiquidationLine_liquidation_idx" ON "PettyCashLiquidationLine"("tenantId", "companyId", "liquidationId");
CREATE INDEX "PettyCashLiquidationLine_supplier_idx" ON "PettyCashLiquidationLine"("tenantId", "companyId", "supplierId");

ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_custodianUserId_fkey" FOREIGN KEY ("custodianUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_pettyCashFundId_fkey" FOREIGN KEY ("pettyCashFundId") REFERENCES "PettyCashFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_returnedByUserId_fkey" FOREIGN KEY ("returnedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashRequest" ADD CONSTRAINT "PettyCashRequest_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PettyCashLedgerEntry" ADD CONSTRAINT "PettyCashLedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLedgerEntry" ADD CONSTRAINT "PettyCashLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLedgerEntry" ADD CONSTRAINT "PettyCashLedgerEntry_pettyCashFundId_fkey" FOREIGN KEY ("pettyCashFundId") REFERENCES "PettyCashFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLedgerEntry" ADD CONSTRAINT "PettyCashLedgerEntry_pettyCashRequestId_fkey" FOREIGN KEY ("pettyCashRequestId") REFERENCES "PettyCashRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashLedgerEntry" ADD CONSTRAINT "PettyCashLedgerEntry_liquidationId_fkey" FOREIGN KEY ("liquidationId") REFERENCES "PettyCashLiquidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashLedgerEntry" ADD CONSTRAINT "PettyCashLedgerEntry_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLedgerEntry" ADD CONSTRAINT "PettyCashLedgerEntry_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PettyCashLiquidation" ADD CONSTRAINT "PettyCashLiquidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidation" ADD CONSTRAINT "PettyCashLiquidation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidation" ADD CONSTRAINT "PettyCashLiquidation_pettyCashFundId_fkey" FOREIGN KEY ("pettyCashFundId") REFERENCES "PettyCashFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidation" ADD CONSTRAINT "PettyCashLiquidation_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidation" ADD CONSTRAINT "PettyCashLiquidation_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidation" ADD CONSTRAINT "PettyCashLiquidation_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidation" ADD CONSTRAINT "PettyCashLiquidation_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidation" ADD CONSTRAINT "PettyCashLiquidation_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PettyCashLiquidationLine" ADD CONSTRAINT "PettyCashLiquidationLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidationLine" ADD CONSTRAINT "PettyCashLiquidationLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidationLine" ADD CONSTRAINT "PettyCashLiquidationLine_pettyCashFundId_fkey" FOREIGN KEY ("pettyCashFundId") REFERENCES "PettyCashFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidationLine" ADD CONSTRAINT "PettyCashLiquidationLine_liquidationId_fkey" FOREIGN KEY ("liquidationId") REFERENCES "PettyCashLiquidation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidationLine" ADD CONSTRAINT "PettyCashLiquidationLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PettyCashLiquidationLine" ADD CONSTRAINT "PettyCashLiquidationLine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  ('00000000-0000-4000-8000-000000000164', 'finance.petty_cash.view', 'finance', 'petty_cash.view'),
  ('00000000-0000-4000-8000-000000000165', 'finance.petty_cash.create', 'finance', 'petty_cash.create'),
  ('00000000-0000-4000-8000-000000000166', 'finance.petty_cash.submit', 'finance', 'petty_cash.submit'),
  ('00000000-0000-4000-8000-000000000167', 'finance.petty_cash.approve', 'finance', 'petty_cash.approve'),
  ('00000000-0000-4000-8000-000000000168', 'finance.petty_cash.replenish', 'finance', 'petty_cash.replenish'),
  ('00000000-0000-4000-8000-000000000169', 'finance.petty_cash.liquidate', 'finance', 'petty_cash.liquidate'),
  ('00000000-0000-4000-8000-000000000170', 'finance.petty_cash.review_liquidation', 'finance', 'petty_cash.review_liquidation')
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
      'finance.petty_cash.view',
      'finance.petty_cash.create',
      'finance.petty_cash.submit',
      'finance.petty_cash.approve',
      'finance.petty_cash.replenish',
      'finance.petty_cash.liquidate',
      'finance.petty_cash.review_liquidation'
    )
  )
  OR (
    r."code" = 'CONFIGURED_APPROVER'
    AND p."code" IN (
      'finance.petty_cash.view',
      'finance.petty_cash.approve',
      'finance.petty_cash.review_liquidation'
    )
  )
  OR (
    r."code" = 'CONFIGURED_REQUESTER'
    AND p."code" IN (
      'finance.petty_cash.view',
      'finance.petty_cash.create',
      'finance.petty_cash.submit',
      'finance.petty_cash.liquidate'
    )
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
