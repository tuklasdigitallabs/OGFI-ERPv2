ALTER TABLE "PurchaseOrder"
ADD COLUMN "cancellationSubtype" TEXT,
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledByUserId" UUID;

ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_cancellationSubtype_check"
CHECK (
  "cancellationSubtype" IS NULL
  OR "cancellationSubtype" IN (
    'approval_rejected',
    'pre_receiving_cancellation',
    'remaining_balance_closure',
    'unknown_unclassified'
  )
);

ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_cancelledByUserId_fkey"
FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PurchaseOrder_tenantId_companyId_cancellationSubtype_idx" ON "PurchaseOrder"("tenantId", "companyId", "cancellationSubtype");
CREATE INDEX "PurchaseOrder_cancelledByUserId_idx" ON "PurchaseOrder"("cancelledByUserId");
CREATE INDEX "PurchaseOrder_cancelledAt_idx" ON "PurchaseOrder"("cancelledAt");
