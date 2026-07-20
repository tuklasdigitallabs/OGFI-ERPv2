CREATE TYPE "PaymentRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AWAITING_APPROVAL', 'APPROVED', 'RETURNED_FOR_REVISION', 'REJECTED', 'CANCELLED', 'ON_HOLD', 'VOIDED');

CREATE TABLE "PaymentRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "totalRequestedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedByUserId" UUID NOT NULL,
    "submittedByUserId" UUID,
    "approvedByUserId" UUID,
    "rejectedByUserId" UUID,
    "cancelledByUserId" UUID,
    "approvalInstanceId" UUID,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "holdReason" TEXT,
    "requestReason" TEXT NOT NULL,
    "evidenceReference" TEXT,
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentRequest_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "PaymentRequest_total_positive_check" CHECK ("totalRequestedAmount" > 0),
    CONSTRAINT "PaymentRequest_reason_required_check" CHECK (length(trim("requestReason")) > 0),
    CONSTRAINT "PaymentRequest_approved_actor_check" CHECK ("status" <> 'APPROVED' OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
    CONSTRAINT "PaymentRequest_rejected_reason_check" CHECK ("status" <> 'REJECTED' OR ("rejectedByUserId" IS NOT NULL AND "rejectedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL)),
    CONSTRAINT "PaymentRequest_cancelled_reason_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledByUserId" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL))
);

CREATE TABLE "PaymentRequestLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "paymentRequestId" UUID NOT NULL,
    "apInvoiceId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "requestedAmount" DECIMAL(18,6) NOT NULL,
    "invoiceTotalSnapshot" DECIMAL(18,6) NOT NULL,
    "invoiceOutstandingSnapshot" DECIMAL(18,6) NOT NULL,
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequestLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentRequestLine_line_number_check" CHECK ("lineNumber" >= 1),
    CONSTRAINT "PaymentRequestLine_requested_positive_check" CHECK ("requestedAmount" > 0),
    CONSTRAINT "PaymentRequestLine_outstanding_nonnegative_check" CHECK ("invoiceOutstandingSnapshot" >= 0),
    CONSTRAINT "PaymentRequestLine_requested_within_outstanding_check" CHECK ("requestedAmount" <= "invoiceOutstandingSnapshot")
);

CREATE UNIQUE INDEX "PaymentRequest_tenantId_companyId_publicReference_key" ON "PaymentRequest"("tenantId", "companyId", "publicReference");
CREATE UNIQUE INDEX "PaymentRequest_tenantId_companyId_idempotencyKey_key" ON "PaymentRequest"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentRequest_approvalInstanceId_key" ON "PaymentRequest"("approvalInstanceId");
CREATE INDEX "PaymentRequest_tenantId_companyId_status_idx" ON "PaymentRequest"("tenantId", "companyId", "status");
CREATE INDEX "PaymentRequest_tenantId_companyId_locationId_status_idx" ON "PaymentRequest"("tenantId", "companyId", "locationId", "status");
CREATE INDEX "PaymentRequest_tenantId_companyId_supplierId_status_idx" ON "PaymentRequest"("tenantId", "companyId", "supplierId", "status");
CREATE INDEX "PaymentRequest_requestedByUserId_status_idx" ON "PaymentRequest"("requestedByUserId", "status");

CREATE UNIQUE INDEX "PaymentRequestLine_paymentRequestId_apInvoiceId_key" ON "PaymentRequestLine"("paymentRequestId", "apInvoiceId");
CREATE UNIQUE INDEX "PaymentRequestLine_paymentRequestId_lineNumber_key" ON "PaymentRequestLine"("paymentRequestId", "lineNumber");
CREATE INDEX "PaymentRequestLine_tenantId_companyId_locationId_idx" ON "PaymentRequestLine"("tenantId", "companyId", "locationId");
CREATE INDEX "PaymentRequestLine_tenantId_companyId_apInvoiceId_idx" ON "PaymentRequestLine"("tenantId", "companyId", "apInvoiceId");
CREATE INDEX "PaymentRequestLine_tenantId_companyId_paymentRequestId_idx" ON "PaymentRequestLine"("tenantId", "companyId", "paymentRequestId");

ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentRequestLine" ADD CONSTRAINT "PaymentRequestLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequestLine" ADD CONSTRAINT "PaymentRequestLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequestLine" ADD CONSTRAINT "PaymentRequestLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequestLine" ADD CONSTRAINT "PaymentRequestLine_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequestLine" ADD CONSTRAINT "PaymentRequestLine_apInvoiceId_fkey" FOREIGN KEY ("apInvoiceId") REFERENCES "ApInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRequestLine" ADD CONSTRAINT "PaymentRequestLine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
