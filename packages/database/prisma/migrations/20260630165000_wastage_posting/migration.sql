ALTER TABLE "WastageReport"
  ADD COLUMN "postedByUserId" UUID,
  ADD COLUMN "postedAt" TIMESTAMP(3);

ALTER TABLE "WastageLine"
  ADD COLUMN "postedMovementId" UUID;

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
    'REVIEWED',
    'RETURNED',
    'REJECTED',
    'CANCELLED'
  ));

CREATE INDEX "WastageReport_tenantId_companyId_status_postedAt_idx"
  ON "WastageReport"("tenantId", "companyId", "status", "postedAt");

CREATE INDEX "WastageReport_postedByUserId_idx"
  ON "WastageReport"("postedByUserId");

CREATE UNIQUE INDEX "WastageLine_postedMovementId_key"
  ON "WastageLine"("postedMovementId");

ALTER TABLE "WastageReport"
  ADD CONSTRAINT "WastageReport_postedByUserId_fkey"
  FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WastageLine"
  ADD CONSTRAINT "WastageLine_postedMovementId_fkey"
  FOREIGN KEY ("postedMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
