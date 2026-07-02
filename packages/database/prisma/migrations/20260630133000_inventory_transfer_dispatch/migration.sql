ALTER TABLE "InventoryMovement"
  ADD COLUMN "relatedInventoryLocationId" UUID;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_relatedInventoryLocationId_fkey"
  FOREIGN KEY ("relatedInventoryLocationId") REFERENCES "InventoryLocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InventoryMovement_relatedInventoryLocationId_idx"
  ON "InventoryMovement"("relatedInventoryLocationId");

ALTER TABLE "InventoryTransfer"
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "dispatchedByUserId" UUID;

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_dispatchedByUserId_fkey"
  FOREIGN KEY ("dispatchedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryTransfer"
  DROP CONSTRAINT "InventoryTransfer_status_check";

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_status_check"
  CHECK ("status" IN ('DRAFT', 'REQUESTED', 'DISPATCHED', 'CANCELLED'));
