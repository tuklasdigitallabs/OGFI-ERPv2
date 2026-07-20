CREATE TYPE "FinancePayeeType" AS ENUM (
  'SUPPLIER',
  'EMPLOYEE',
  'USER_CUSTODIAN',
  'EXTERNAL'
);

CREATE TYPE "FinancePayeeStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'BLOCKED'
);

CREATE TYPE "DisbursementRequestStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'RETURNED_FOR_REVISION',
  'REJECTED',
  'CANCELLED',
  'ON_HOLD'
);

CREATE TYPE "DisbursementSourceType" AS ENUM (
  'CASH_ADVANCE',
  'PETTY_CASH',
  'EMPLOYEE_REIMBURSEMENT',
  'MANUAL_CONTROL'
);

CREATE TABLE "FinancePayee" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "payeeType" "FinancePayeeType" NOT NULL,
  "status" "FinancePayeeStatus" NOT NULL DEFAULT 'ACTIVE',
  "displayName" TEXT NOT NULL,
  "legalName" TEXT,
  "supplierId" UUID,
  "userId" UUID,
  "paymentReferenceLabel" TEXT,
  "evidenceReference" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancePayee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NonSupplierDisbursementRequest" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "payeeId" UUID NOT NULL,
  "cashAdvanceRequestId" UUID,
  "publicReference" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
  "amountPhp" DECIMAL(18,6) NOT NULL,
  "status" "DisbursementRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceType" "DisbursementSourceType" NOT NULL DEFAULT 'MANUAL_CONTROL',
  "sourceEventKey" TEXT NOT NULL,
  "requestReason" TEXT NOT NULL,
  "evidenceReference" TEXT,
  "holdReason" TEXT,
  "rejectionReason" TEXT,
  "cancellationReason" TEXT,
  "idempotencyKey" TEXT,
  "requestedByUserId" UUID NOT NULL,
  "submittedByUserId" UUID,
  "approvedByUserId" UUID,
  "rejectedByUserId" UUID,
  "cancelledByUserId" UUID,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NonSupplierDisbursementRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancePayee_tenantId_companyId_payeeType_supplierId_key"
  ON "FinancePayee"("tenantId", "companyId", "payeeType", "supplierId");

CREATE UNIQUE INDEX "FinancePayee_tenantId_companyId_payeeType_userId_key"
  ON "FinancePayee"("tenantId", "companyId", "payeeType", "userId");

CREATE INDEX "FinancePayee_tenantId_companyId_payeeType_status_idx"
  ON "FinancePayee"("tenantId", "companyId", "payeeType", "status");

CREATE INDEX "FinancePayee_tenantId_companyId_displayName_idx"
  ON "FinancePayee"("tenantId", "companyId", "displayName");

CREATE UNIQUE INDEX "NonSupplierDisbursementRequest_tenantId_companyId_publicReference_key"
  ON "NonSupplierDisbursementRequest"("tenantId", "companyId", "publicReference");

CREATE UNIQUE INDEX "NonSupplierDisbursementRequest_tenantId_companyId_sourceEventKey_key"
  ON "NonSupplierDisbursementRequest"("tenantId", "companyId", "sourceEventKey");

CREATE UNIQUE INDEX "NonSupplierDisbursementRequest_tenantId_companyId_idempotencyKey_key"
  ON "NonSupplierDisbursementRequest"("tenantId", "companyId", "idempotencyKey");

CREATE INDEX "NonSupplierDisbursementRequest_tenantId_companyId_locationId_status_idx"
  ON "NonSupplierDisbursementRequest"("tenantId", "companyId", "locationId", "status");

CREATE INDEX "NonSupplierDisbursementRequest_tenantId_companyId_payeeId_status_idx"
  ON "NonSupplierDisbursementRequest"("tenantId", "companyId", "payeeId", "status");

CREATE INDEX "NonSupplierDisbursementRequest_tenantId_companyId_cashAdvanceRequestId_idx"
  ON "NonSupplierDisbursementRequest"("tenantId", "companyId", "cashAdvanceRequestId");

ALTER TABLE "FinancePayee"
  ADD CONSTRAINT "FinancePayee_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancePayee"
  ADD CONSTRAINT "FinancePayee_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancePayee"
  ADD CONSTRAINT "FinancePayee_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancePayee"
  ADD CONSTRAINT "FinancePayee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancePayee"
  ADD CONSTRAINT "FinancePayee_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_payeeId_fkey"
  FOREIGN KEY ("payeeId") REFERENCES "FinancePayee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_cashAdvanceRequestId_fkey"
  FOREIGN KEY ("cashAdvanceRequestId") REFERENCES "CashAdvanceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_rejectedByUserId_fkey"
  FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
