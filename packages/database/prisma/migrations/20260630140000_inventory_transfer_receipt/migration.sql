ALTER TABLE "InventoryTransfer"
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "receivedByUserId" UUID;

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_receivedByUserId_fkey"
  FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryTransfer"
  DROP CONSTRAINT "InventoryTransfer_status_check";

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_status_check"
  CHECK ("status" IN ('DRAFT', 'REQUESTED', 'DISPATCHED', 'RECEIVED', 'CANCELLED'));
