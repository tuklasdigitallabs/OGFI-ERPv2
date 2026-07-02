ALTER TABLE "PurchaseOrder"
  DROP CONSTRAINT IF EXISTS "PurchaseOrder_status_check";

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_status_check"
  CHECK ("status" IN (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'ISSUED',
    'PARTIALLY_RECEIVED',
    'FULLY_RECEIVED',
    'CANCELLED',
    'CLOSED'
  ));

CREATE TABLE "PurchaseOrderBalanceClosure" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "purchaseOrderId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "approvedByUserId" UUID,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "reason" TEXT NOT NULL,
  "supplierNoticeReference" TEXT,
  "supplierNoticeUnavailableReason" TEXT,
  "notes" TEXT,
  "lineSnapshot" JSONB NOT NULL,
  "totalClosedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "totalClosedValue" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrderBalanceClosure_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrderBalanceClosure_status_check"
    CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'RETURNED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT "PurchaseOrderBalanceClosure_quantity_check"
    CHECK ("totalClosedQuantity" > 0),
  CONSTRAINT "PurchaseOrderBalanceClosure_value_check"
    CHECK ("totalClosedValue" >= 0),
  CONSTRAINT "PurchaseOrderBalanceClosure_notice_check"
    CHECK (
      "supplierNoticeReference" IS NOT NULL
      OR "supplierNoticeUnavailableReason" IS NOT NULL
    )
);

CREATE INDEX "PurchaseOrderBalanceClosure_tenantId_companyId_status_requestedAt_idx"
  ON "PurchaseOrderBalanceClosure"("tenantId", "companyId", "status", "requestedAt");

CREATE INDEX "PurchaseOrderBalanceClosure_purchaseOrderId_status_idx"
  ON "PurchaseOrderBalanceClosure"("purchaseOrderId", "status");

CREATE INDEX "PurchaseOrderBalanceClosure_requestedByUserId_idx"
  ON "PurchaseOrderBalanceClosure"("requestedByUserId");

CREATE INDEX "PurchaseOrderBalanceClosure_approvedByUserId_idx"
  ON "PurchaseOrderBalanceClosure"("approvedByUserId");

CREATE UNIQUE INDEX "PurchaseOrderBalanceClosure_purchaseOrderId_pending_key"
  ON "PurchaseOrderBalanceClosure"("purchaseOrderId")
  WHERE "status" = 'PENDING_APPROVAL';

ALTER TABLE "PurchaseOrderBalanceClosure"
  ADD CONSTRAINT "PurchaseOrderBalanceClosure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PurchaseOrderBalanceClosure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PurchaseOrderBalanceClosure_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PurchaseOrderBalanceClosure_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PurchaseOrderBalanceClosure_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
