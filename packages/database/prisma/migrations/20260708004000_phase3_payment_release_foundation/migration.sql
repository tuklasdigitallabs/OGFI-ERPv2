CREATE TYPE "PaymentReleaseStatus" AS ENUM ('DRAFT', 'READY_FOR_RELEASE', 'RELEASED', 'RECONCILIATION_PENDING', 'PARTIALLY_RECONCILED', 'FULLY_RECONCILED', 'ON_HOLD', 'EXCEPTION', 'CANCELLED', 'REVERSED');
CREATE TYPE "PaymentReleaseMethod" AS ENUM ('BANK_TRANSFER', 'CHECK', 'CASH', 'MANUAL_REFERENCE');
CREATE TYPE "PaymentReleaseExecutionStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "PaymentRelease" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "paymentRequestId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "method" "PaymentReleaseMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" "PaymentReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "totalRequestedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "releaseAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "releasedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "sourceEventKey" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "reason" TEXT NOT NULL,
    "holdReason" TEXT,
    "exceptionReason" TEXT,
    "cancellationReason" TEXT,
    "reversalReason" TEXT,
    "evidenceReference" TEXT,
    "releaseReference" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "heldAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "releasedByUserId" UUID,
    "heldByUserId" UUID,
    "cancelledByUserId" UUID,
    "reversedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRelease_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentRelease_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "PaymentRelease_amounts_check" CHECK ("totalRequestedAmount" > 0 AND "releaseAmount" > 0 AND "releasedAmount" >= 0 AND "releasedAmount" <= "releaseAmount"),
    CONSTRAINT "PaymentRelease_reason_required_check" CHECK (length(trim("reason")) > 0),
    CONSTRAINT "PaymentRelease_released_actor_check" CHECK ("status" NOT IN ('RELEASED', 'RECONCILIATION_PENDING', 'PARTIALLY_RECONCILED', 'FULLY_RECONCILED') OR ("releasedByUserId" IS NOT NULL AND "releasedAt" IS NOT NULL AND "releaseReference" IS NOT NULL AND "evidenceReference" IS NOT NULL)),
    CONSTRAINT "PaymentRelease_cancelled_reason_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledByUserId" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL)),
    CONSTRAINT "PaymentRelease_reversed_reason_check" CHECK ("status" <> 'REVERSED' OR ("reversedByUserId" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL)),
    CONSTRAINT "PaymentRelease_hold_reason_check" CHECK ("status" <> 'ON_HOLD' OR ("heldByUserId" IS NOT NULL AND "heldAt" IS NOT NULL AND "holdReason" IS NOT NULL)),
    CONSTRAINT "PaymentRelease_exception_reason_check" CHECK ("status" <> 'EXCEPTION' OR "exceptionReason" IS NOT NULL)
);

CREATE TABLE "PaymentReleaseAllocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "paymentReleaseId" UUID NOT NULL,
    "paymentRequestLineId" UUID NOT NULL,
    "apInvoiceId" UUID NOT NULL,
    "allocatedAmount" DECIMAL(18,6) NOT NULL,
    "requestLineSnapshotAmount" DECIMAL(18,6) NOT NULL,
    "invoiceOutstandingSnapshot" DECIMAL(18,6) NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReleaseAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentReleaseAllocation_amount_check" CHECK ("allocatedAmount" > 0 AND "requestLineSnapshotAmount" > 0 AND "invoiceOutstandingSnapshot" >= 0),
    CONSTRAINT "PaymentReleaseAllocation_within_snapshots_check" CHECK ("allocatedAmount" <= "requestLineSnapshotAmount" AND "allocatedAmount" <= "invoiceOutstandingSnapshot")
);

CREATE TABLE "PaymentReleaseExecution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "paymentReleaseId" UUID NOT NULL,
    "status" "PaymentReleaseExecutionStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL,
    "requestPayloadHash" TEXT,
    "releaseReference" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "executionSnapshot" JSONB,
    "actorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReleaseExecution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentReleaseExecution_succeeded_reference_check" CHECK ("status" <> 'SUCCEEDED' OR "releaseReference" IS NOT NULL),
    CONSTRAINT "PaymentReleaseExecution_failed_reason_check" CHECK ("status" <> 'FAILED' OR "failureReason" IS NOT NULL)
);

CREATE UNIQUE INDEX "PaymentRelease_companyId_publicReference_key" ON "PaymentRelease"("companyId", "publicReference");
CREATE UNIQUE INDEX "PaymentRelease_tenantId_companyId_paymentRequestId_key" ON "PaymentRelease"("tenantId", "companyId", "paymentRequestId");
CREATE UNIQUE INDEX "PaymentRelease_tenantId_companyId_sourceEventKey_key" ON "PaymentRelease"("tenantId", "companyId", "sourceEventKey");
CREATE UNIQUE INDEX "PaymentRelease_tenantId_companyId_idempotencyKey_key" ON "PaymentRelease"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "PaymentRelease_tenantId_companyId_status_idx" ON "PaymentRelease"("tenantId", "companyId", "status");
CREATE INDEX "PaymentRelease_tenantId_companyId_locationId_status_idx" ON "PaymentRelease"("tenantId", "companyId", "locationId", "status");
CREATE INDEX "PaymentRelease_tenantId_companyId_supplierId_status_idx" ON "PaymentRelease"("tenantId", "companyId", "supplierId", "status");
CREATE INDEX "PaymentRelease_tenantId_companyId_bankAccountId_status_idx" ON "PaymentRelease"("tenantId", "companyId", "bankAccountId", "status");

CREATE UNIQUE INDEX "PaymentReleaseAllocation_tenantId_companyId_paymentReleaseId_paymentRequestLineId_key" ON "PaymentReleaseAllocation"("tenantId", "companyId", "paymentReleaseId", "paymentRequestLineId");
CREATE UNIQUE INDEX "PaymentReleaseAllocation_tenantId_companyId_paymentRequestLineId_key" ON "PaymentReleaseAllocation"("tenantId", "companyId", "paymentRequestLineId");
CREATE INDEX "PaymentReleaseAllocation_tenantId_companyId_paymentReleaseId_idx" ON "PaymentReleaseAllocation"("tenantId", "companyId", "paymentReleaseId");
CREATE INDEX "PaymentReleaseAllocation_tenantId_companyId_apInvoiceId_idx" ON "PaymentReleaseAllocation"("tenantId", "companyId", "apInvoiceId");

CREATE UNIQUE INDEX "PaymentReleaseExecution_tenantId_companyId_idempotencyKey_key" ON "PaymentReleaseExecution"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "PaymentReleaseExecution_tenantId_companyId_paymentReleaseId_status_idx" ON "PaymentReleaseExecution"("tenantId", "companyId", "paymentReleaseId", "status");

ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_heldByUserId_fkey" FOREIGN KEY ("heldByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRelease" ADD CONSTRAINT "PaymentRelease_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentReleaseAllocation" ADD CONSTRAINT "PaymentReleaseAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReleaseAllocation" ADD CONSTRAINT "PaymentReleaseAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReleaseAllocation" ADD CONSTRAINT "PaymentReleaseAllocation_paymentReleaseId_fkey" FOREIGN KEY ("paymentReleaseId") REFERENCES "PaymentRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReleaseAllocation" ADD CONSTRAINT "PaymentReleaseAllocation_paymentRequestLineId_fkey" FOREIGN KEY ("paymentRequestLineId") REFERENCES "PaymentRequestLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReleaseAllocation" ADD CONSTRAINT "PaymentReleaseAllocation_apInvoiceId_fkey" FOREIGN KEY ("apInvoiceId") REFERENCES "ApInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReleaseAllocation" ADD CONSTRAINT "PaymentReleaseAllocation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentReleaseExecution" ADD CONSTRAINT "PaymentReleaseExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReleaseExecution" ADD CONSTRAINT "PaymentReleaseExecution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReleaseExecution" ADD CONSTRAINT "PaymentReleaseExecution_paymentReleaseId_fkey" FOREIGN KEY ("paymentReleaseId") REFERENCES "PaymentRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReleaseExecution" ADD CONSTRAINT "PaymentReleaseExecution_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
