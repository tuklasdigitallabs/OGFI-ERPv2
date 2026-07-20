CREATE TYPE "CashAdvanceRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AWAITING_APPROVAL', 'RETURNED_FOR_REVISION', 'APPROVED', 'RELEASE_PENDING', 'RELEASED_OFFLINE', 'PARTIALLY_LIQUIDATED', 'FULLY_LIQUIDATED', 'CLOSED', 'CANCELLED', 'REJECTED', 'ON_HOLD', 'VOIDED');
CREATE TYPE "CashAdvanceSourceType" AS ENUM ('STANDALONE', 'EXPENSE_REQUEST', 'PAYMENT_REQUEST', 'SUPPLIER_DIRECT', 'MANUAL');
CREATE TYPE "CashAdvanceMovementType" AS ENUM ('ISSUE', 'REVERSAL', 'LIQUIDATION_SETTLEMENT', 'ADJUSTMENT', 'VOID');
CREATE TYPE "CashAdvanceLiquidationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED_FOR_REVISION', 'APPROVED', 'REJECTED', 'CANCELLED', 'CLOSURE_READY', 'CLOSED', 'REVERSED');

CREATE TABLE "CashAdvanceRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "requestedAmountPhp" DECIMAL(18,6) NOT NULL,
    "issuedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "liquidatedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "CashAdvanceRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "CashAdvanceSourceType" NOT NULL DEFAULT 'STANDALONE',
    "budgetStatus" "ExpenseBudgetStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "requestDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "supplierId" UUID,
    "brandId" UUID,
    "locationId" UUID NOT NULL,
    "departmentId" UUID,
    "costCenterId" UUID,
    "projectId" UUID,
    "beneficiaryUserId" UUID,
    "expenseRequestId" UUID,
    "paymentRequestId" UUID,
    "budgetCommitmentId" UUID,
    "intendedBankAccountId" UUID,
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
    "budgetSnapshot" JSONB,
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashAdvanceRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CashAdvanceRequest_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "CashAdvanceRequest_amount_check" CHECK ("requestedAmountPhp" > 0 AND "issuedAmountPhp" >= 0 AND "liquidatedAmountPhp" >= 0 AND "liquidatedAmountPhp" <= "requestedAmountPhp" AND "issuedAmountPhp" <= "requestedAmountPhp"),
    CONSTRAINT "CashAdvanceRequest_version_check" CHECK ("version" >= 1),
    CONSTRAINT "CashAdvanceRequest_submitted_at_check" CHECK ("status" NOT IN ('SUBMITTED', 'AWAITING_APPROVAL') OR "submittedAt" IS NOT NULL),
    CONSTRAINT "CashAdvanceRequest_approved_actor_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "requestedByUserId"),
    CONSTRAINT "CashAdvanceRequest_approved_at_check" CHECK ("status" NOT IN ('APPROVED', 'RELEASE_PENDING', 'RELEASED_OFFLINE', 'PARTIALLY_LIQUIDATED', 'FULLY_LIQUIDATED', 'CLOSED') OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
    CONSTRAINT "CashAdvanceRequest_return_reason_check" CHECK ("status" <> 'RETURNED_FOR_REVISION' OR ("returnedByUserId" IS NOT NULL AND "returnedAt" IS NOT NULL AND "returnReason" IS NOT NULL)),
    CONSTRAINT "CashAdvanceRequest_reject_reason_check" CHECK ("status" <> 'REJECTED' OR ("rejectedByUserId" IS NOT NULL AND "rejectedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL)),
    CONSTRAINT "CashAdvanceRequest_cancel_reason_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledByUserId" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL)),
    CONSTRAINT "CashAdvanceRequest_closed_at_check" CHECK ("status" <> 'CLOSED' OR ("closedByUserId" IS NOT NULL AND "closedAt" IS NOT NULL))
);

CREATE TABLE "CashAdvanceMovement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "cashAdvanceRequestId" UUID NOT NULL,
    "liquidationId" UUID,
    "actorUserId" UUID NOT NULL,
    "movementType" "CashAdvanceMovementType" NOT NULL,
    "amountPhp" DECIMAL(18,6) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "sourceEventKey" TEXT NOT NULL,
    "referenceNo" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashAdvanceMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CashAdvanceMovement_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "CashAdvanceMovement_amount_check" CHECK ("amountPhp" > 0)
);

CREATE TABLE "CashAdvanceLiquidation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "cashAdvanceRequestId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "claimedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "approvedAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "amountReturnedPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "overageAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "shortfallAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "CashAdvanceLiquidationStatus" NOT NULL DEFAULT 'DRAFT',
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
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashAdvanceLiquidation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CashAdvanceLiquidation_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "CashAdvanceLiquidation_amount_check" CHECK ("claimedAmountPhp" >= 0 AND "approvedAmountPhp" >= 0 AND "amountReturnedPhp" >= 0 AND "overageAmountPhp" >= 0 AND "shortfallAmountPhp" >= 0),
    CONSTRAINT "CashAdvanceLiquidation_submitted_at_check" CHECK ("status" NOT IN ('SUBMITTED', 'UNDER_REVIEW') OR "submittedAt" IS NOT NULL),
    CONSTRAINT "CashAdvanceLiquidation_approved_actor_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "submittedByUserId"),
    CONSTRAINT "CashAdvanceLiquidation_approved_at_check" CHECK ("status" NOT IN ('APPROVED', 'CLOSURE_READY', 'CLOSED') OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
    CONSTRAINT "CashAdvanceLiquidation_return_reason_check" CHECK ("status" <> 'RETURNED_FOR_REVISION' OR ("reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL)),
    CONSTRAINT "CashAdvanceLiquidation_cancel_reason_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledByUserId" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL)),
    CONSTRAINT "CashAdvanceLiquidation_closed_at_check" CHECK ("status" <> 'CLOSED' OR ("closedByUserId" IS NOT NULL AND "closedAt" IS NOT NULL))
);

CREATE TABLE "CashAdvanceLiquidationLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "liquidationId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "spendDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "amountPhp" DECIMAL(18,6) NOT NULL,
    "taxAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "receiptReference" TEXT,
    "evidenceReference" TEXT,
    "supplierId" UUID,
    "budgetCommitmentId" UUID,
    "expenseRequestId" UUID,
    "paymentRequestId" UUID,
    "idempotencyKey" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashAdvanceLiquidationLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CashAdvanceLiquidationLine_line_number_check" CHECK ("lineNumber" >= 1),
    CONSTRAINT "CashAdvanceLiquidationLine_amount_check" CHECK ("amountPhp" > 0 AND "taxAmountPhp" >= 0)
);

CREATE UNIQUE INDEX "CashAdvanceRequest_companyId_publicReference_key" ON "CashAdvanceRequest"("companyId", "publicReference");
CREATE UNIQUE INDEX "CashAdvanceRequest_tenantId_companyId_idempotencyKey_key" ON "CashAdvanceRequest"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "CashAdvanceRequest_tenantId_companyId_status_createdAt_idx" ON "CashAdvanceRequest"("tenantId", "companyId", "status", "createdAt");
CREATE INDEX "CashAdvanceRequest_tenantId_companyId_locationId_status_idx" ON "CashAdvanceRequest"("tenantId", "companyId", "locationId", "status");
CREATE INDEX "CashAdvanceRequest_tenantId_companyId_supplierId_status_idx" ON "CashAdvanceRequest"("tenantId", "companyId", "supplierId", "status");
CREATE INDEX "CashAdvanceRequest_tenantId_companyId_departmentId_status_idx" ON "CashAdvanceRequest"("tenantId", "companyId", "departmentId", "status");
CREATE INDEX "CashAdvanceRequest_tenantId_companyId_costCenterId_status_idx" ON "CashAdvanceRequest"("tenantId", "companyId", "costCenterId", "status");
CREATE INDEX "CashAdvanceRequest_tenantId_companyId_projectId_status_idx" ON "CashAdvanceRequest"("tenantId", "companyId", "projectId", "status");
CREATE INDEX "CashAdvanceRequest_tenantId_companyId_expenseRequestId_idx" ON "CashAdvanceRequest"("tenantId", "companyId", "expenseRequestId");
CREATE INDEX "CashAdvanceRequest_tenantId_companyId_paymentRequestId_idx" ON "CashAdvanceRequest"("tenantId", "companyId", "paymentRequestId");
CREATE INDEX "CashAdvanceRequest_requestedByUserId_status_idx" ON "CashAdvanceRequest"("requestedByUserId", "status");

CREATE UNIQUE INDEX "CashAdvanceMovement_tenantId_companyId_sourceEventKey_key" ON "CashAdvanceMovement"("tenantId", "companyId", "sourceEventKey");
CREATE UNIQUE INDEX "CashAdvanceMovement_tenantId_companyId_idempotencyKey_key" ON "CashAdvanceMovement"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "CashAdvanceMovement_tenantId_companyId_locationId_movementType_idx" ON "CashAdvanceMovement"("tenantId", "companyId", "locationId", "movementType");
CREATE INDEX "CashAdvanceMovement_request_created_idx" ON "CashAdvanceMovement"("tenantId", "companyId", "cashAdvanceRequestId", "createdAt");
CREATE INDEX "CashAdvanceMovement_liquidation_idx" ON "CashAdvanceMovement"("tenantId", "companyId", "liquidationId");

CREATE UNIQUE INDEX "CashAdvanceLiquidation_companyId_publicReference_key" ON "CashAdvanceLiquidation"("companyId", "publicReference");
CREATE UNIQUE INDEX "CashAdvanceLiquidation_tenantId_companyId_idempotencyKey_key" ON "CashAdvanceLiquidation"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "CashAdvanceLiquidation_status_created_idx" ON "CashAdvanceLiquidation"("tenantId", "companyId", "status", "createdAt");
CREATE INDEX "CashAdvanceLiquidation_location_status_idx" ON "CashAdvanceLiquidation"("tenantId", "companyId", "locationId", "status");
CREATE INDEX "CashAdvanceLiquidation_request_status_idx" ON "CashAdvanceLiquidation"("tenantId", "companyId", "cashAdvanceRequestId", "status");

CREATE UNIQUE INDEX "CashAdvanceLiquidationLine_liquidationId_lineNumber_key" ON "CashAdvanceLiquidationLine"("liquidationId", "lineNumber");
CREATE UNIQUE INDEX "CashAdvanceLiquidationLine_tenantId_companyId_idempotencyKey_key" ON "CashAdvanceLiquidationLine"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "CashAdvanceLiquidationLine_location_idx" ON "CashAdvanceLiquidationLine"("tenantId", "companyId", "locationId");
CREATE INDEX "CashAdvanceLiquidationLine_liquidation_idx" ON "CashAdvanceLiquidationLine"("tenantId", "companyId", "liquidationId");
CREATE INDEX "CashAdvanceLiquidationLine_budgetCommitment_idx" ON "CashAdvanceLiquidationLine"("tenantId", "companyId", "budgetCommitmentId");
CREATE INDEX "CashAdvanceLiquidationLine_expenseRequest_idx" ON "CashAdvanceLiquidationLine"("tenantId", "companyId", "expenseRequestId");
CREATE INDEX "CashAdvanceLiquidationLine_paymentRequest_idx" ON "CashAdvanceLiquidationLine"("tenantId", "companyId", "paymentRequestId");

ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_expenseRequestId_fkey" FOREIGN KEY ("expenseRequestId") REFERENCES "ExpenseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_budgetCommitmentId_fkey" FOREIGN KEY ("budgetCommitmentId") REFERENCES "BudgetCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_intendedBankAccountId_fkey" FOREIGN KEY ("intendedBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_returnedByUserId_fkey" FOREIGN KEY ("returnedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceRequest" ADD CONSTRAINT "CashAdvanceRequest_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashAdvanceMovement" ADD CONSTRAINT "CashAdvanceMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceMovement" ADD CONSTRAINT "CashAdvanceMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceMovement" ADD CONSTRAINT "CashAdvanceMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceMovement" ADD CONSTRAINT "CashAdvanceMovement_cashAdvanceRequestId_fkey" FOREIGN KEY ("cashAdvanceRequestId") REFERENCES "CashAdvanceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceMovement" ADD CONSTRAINT "CashAdvanceMovement_liquidationId_fkey" FOREIGN KEY ("liquidationId") REFERENCES "CashAdvanceLiquidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceMovement" ADD CONSTRAINT "CashAdvanceMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashAdvanceLiquidation" ADD CONSTRAINT "CashAdvanceLiquidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidation" ADD CONSTRAINT "CashAdvanceLiquidation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidation" ADD CONSTRAINT "CashAdvanceLiquidation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidation" ADD CONSTRAINT "CashAdvanceLiquidation_cashAdvanceRequestId_fkey" FOREIGN KEY ("cashAdvanceRequestId") REFERENCES "CashAdvanceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidation" ADD CONSTRAINT "CashAdvanceLiquidation_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidation" ADD CONSTRAINT "CashAdvanceLiquidation_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidation" ADD CONSTRAINT "CashAdvanceLiquidation_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidation" ADD CONSTRAINT "CashAdvanceLiquidation_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidation" ADD CONSTRAINT "CashAdvanceLiquidation_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashAdvanceLiquidationLine" ADD CONSTRAINT "CashAdvanceLiquidationLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidationLine" ADD CONSTRAINT "CashAdvanceLiquidationLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidationLine" ADD CONSTRAINT "CashAdvanceLiquidationLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidationLine" ADD CONSTRAINT "CashAdvanceLiquidationLine_liquidationId_fkey" FOREIGN KEY ("liquidationId") REFERENCES "CashAdvanceLiquidation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidationLine" ADD CONSTRAINT "CashAdvanceLiquidationLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidationLine" ADD CONSTRAINT "CashAdvanceLiquidationLine_budgetCommitmentId_fkey" FOREIGN KEY ("budgetCommitmentId") REFERENCES "BudgetCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidationLine" ADD CONSTRAINT "CashAdvanceLiquidationLine_expenseRequestId_fkey" FOREIGN KEY ("expenseRequestId") REFERENCES "ExpenseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidationLine" ADD CONSTRAINT "CashAdvanceLiquidationLine_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashAdvanceLiquidationLine" ADD CONSTRAINT "CashAdvanceLiquidationLine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  ('00000000-0000-4000-8000-000000000158', 'finance.cash_advance.view', 'finance', 'cash_advance.view'),
  ('00000000-0000-4000-8000-000000000159', 'finance.cash_advance.create', 'finance', 'cash_advance.create'),
  ('00000000-0000-4000-8000-000000000160', 'finance.cash_advance.submit', 'finance', 'cash_advance.submit'),
  ('00000000-0000-4000-8000-000000000161', 'finance.cash_advance.approve', 'finance', 'cash_advance.approve'),
  ('00000000-0000-4000-8000-000000000162', 'finance.cash_advance.liquidate', 'finance', 'cash_advance.liquidate'),
  ('00000000-0000-4000-8000-000000000163', 'finance.cash_advance.review_liquidation', 'finance', 'cash_advance.review_liquidation')
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
      'finance.cash_advance.view',
      'finance.cash_advance.create',
      'finance.cash_advance.submit',
      'finance.cash_advance.approve',
      'finance.cash_advance.liquidate',
      'finance.cash_advance.review_liquidation'
    )
  )
  OR (
    r."code" = 'CONFIGURED_APPROVER'
    AND p."code" IN (
      'finance.cash_advance.view',
      'finance.cash_advance.approve',
      'finance.cash_advance.review_liquidation'
    )
  )
  OR (
    r."code" = 'CONFIGURED_REQUESTER'
    AND p."code" IN (
      'finance.cash_advance.view',
      'finance.cash_advance.create',
      'finance.cash_advance.submit',
      'finance.cash_advance.liquidate'
    )
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
