ALTER TABLE "WastageReport"
  ADD COLUMN "reversedByUserId" UUID,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT;

ALTER TABLE "WastageReport"
  DROP CONSTRAINT IF EXISTS "WastageReport_status_check";

ALTER TABLE "WastageReport"
  ADD CONSTRAINT "WastageReport_status_check"
  CHECK ("status" IN (
    'DRAFT',
    'SUBMITTED',
    'PENDING_APPROVAL',
    'APPROVED',
    'POSTING',
    'POSTED',
    'REVERSING',
    'REVERSED',
    'REVIEWED',
    'RETURNED',
    'REJECTED',
    'CANCELLED'
  ));

ALTER TABLE "WastageReport"
  ADD CONSTRAINT "WastageReport_reversed_fields_check"
  CHECK (
    "status" <> 'REVERSED'
    OR (
      "reversedAt" IS NOT NULL
      AND "reversedByUserId" IS NOT NULL
      AND "reversalReason" IS NOT NULL
      AND length(trim("reversalReason")) >= 5
    )
  );

CREATE INDEX "WastageReport_tenantId_companyId_status_reversedAt_idx"
  ON "WastageReport"("tenantId", "companyId", "status", "reversedAt");

CREATE INDEX "WastageReport_reversedByUserId_idx"
  ON "WastageReport"("reversedByUserId");

CREATE UNIQUE INDEX "InventoryMovement_reversalOfMovementId_REVERSAL_key"
  ON "InventoryMovement"("reversalOfMovementId")
  WHERE "movementType" = 'REVERSAL'
    AND "reversalOfMovementId" IS NOT NULL;

ALTER TABLE "WastageReport"
  ADD CONSTRAINT "WastageReport_reversedByUserId_fkey"
  FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
