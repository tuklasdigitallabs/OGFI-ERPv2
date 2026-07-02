ALTER TABLE "InventoryTransfer"
  DROP CONSTRAINT IF EXISTS "InventoryTransfer_status_check";

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_status_check"
  CHECK ("status" IN ('DRAFT', 'REQUESTED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'DISPUTED', 'RECEIVED', 'CLOSED', 'CANCELLED'));

CREATE TABLE "InventoryTransferReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryTransferId" UUID NOT NULL,
  "receivedByUserId" UUID NOT NULL,
  "reversedByUserId" UUID,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "discrepancyFlag" BOOLEAN NOT NULL DEFAULT false,
  "discrepancySummary" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryTransferReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransferReceipt_status_check"
    CHECK ("status" IN ('DRAFT', 'POSTING', 'POSTED', 'REVERSING', 'REVERSED')),
  CONSTRAINT "InventoryTransferReceipt_posted_fields_check"
    CHECK (
      ("status" NOT IN ('POSTED', 'REVERSING', 'REVERSED') AND "postedAt" IS NULL)
      OR ("status" IN ('POSTED', 'REVERSING', 'REVERSED') AND "postedAt" IS NOT NULL)
    ),
  CONSTRAINT "InventoryTransferReceipt_reversal_fields_check"
    CHECK (
      ("status" <> 'REVERSED' AND "reversedAt" IS NULL AND "reversedByUserId" IS NULL AND "reversalReason" IS NULL)
      OR ("status" = 'REVERSED' AND "reversedAt" IS NOT NULL AND "reversedByUserId" IS NOT NULL AND "reversalReason" IS NOT NULL)
    )
);

CREATE TABLE "InventoryTransferReceiptLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "transferReceiptId" UUID NOT NULL,
  "inventoryTransferId" UUID NOT NULL,
  "inventoryTransferLineId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "uomId" UUID NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "dispatchedQtySnapshot" DECIMAL(18,6) NOT NULL,
  "acceptedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "rejectedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "damagedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "discrepancyQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "outstandingQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "discrepancyType" TEXT,
  "discrepancyReason" TEXT,
  "evidenceReference" TEXT,
  "postedMovementId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryTransferReceiptLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransferReceiptLine_quantity_check"
    CHECK (
      "dispatchedQtySnapshot" >= 0
      AND "acceptedQty" >= 0
      AND "rejectedQty" >= 0
      AND "damagedQty" >= 0
      AND "discrepancyQty" >= 0
      AND "outstandingQty" >= 0
      AND ("acceptedQty" + "rejectedQty" + "damagedQty" + "discrepancyQty" + "outstandingQty") <= "dispatchedQtySnapshot"
    ),
  CONSTRAINT "InventoryTransferReceiptLine_discrepancy_reason_check"
    CHECK (
      ("rejectedQty" = 0 AND "damagedQty" = 0 AND "discrepancyQty" = 0)
      OR ("discrepancyReason" IS NOT NULL AND length(trim("discrepancyReason")) >= 5)
    )
);

CREATE INDEX "InventoryTransferReceipt_tenantId_companyId_status_idx"
  ON "InventoryTransferReceipt"("tenantId", "companyId", "status");
CREATE INDEX "InventoryTransferReceipt_inventoryTransferId_status_idx"
  ON "InventoryTransferReceipt"("inventoryTransferId", "status");
CREATE INDEX "InventoryTransferReceipt_receivedByUserId_idx"
  ON "InventoryTransferReceipt"("receivedByUserId");
CREATE INDEX "InventoryTransferReceipt_reversedByUserId_idx"
  ON "InventoryTransferReceipt"("reversedByUserId");

CREATE UNIQUE INDEX "InventoryTransferReceiptLine_transferReceiptId_lineNumber_key"
  ON "InventoryTransferReceiptLine"("transferReceiptId", "lineNumber");
CREATE UNIQUE INDEX "InventoryTransferReceiptLine_postedMovementId_key"
  ON "InventoryTransferReceiptLine"("postedMovementId");
CREATE INDEX "InventoryTransferReceiptLine_tenantId_companyId_idx"
  ON "InventoryTransferReceiptLine"("tenantId", "companyId");
CREATE INDEX "InventoryTransferReceiptLine_inventoryTransferId_idx"
  ON "InventoryTransferReceiptLine"("inventoryTransferId");
CREATE INDEX "InventoryTransferReceiptLine_inventoryTransferLineId_idx"
  ON "InventoryTransferReceiptLine"("inventoryTransferLineId");

ALTER TABLE "InventoryTransferReceipt"
  ADD CONSTRAINT "InventoryTransferReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceipt_inventoryTransferId_fkey" FOREIGN KEY ("inventoryTransferId") REFERENCES "InventoryTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceipt_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceipt_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferReceiptLine"
  ADD CONSTRAINT "InventoryTransferReceiptLine_transferReceiptId_fkey" FOREIGN KEY ("transferReceiptId") REFERENCES "InventoryTransferReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceiptLine_inventoryTransferId_fkey" FOREIGN KEY ("inventoryTransferId") REFERENCES "InventoryTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceiptLine_inventoryTransferLineId_fkey" FOREIGN KEY ("inventoryTransferLineId") REFERENCES "InventoryTransferLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceiptLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceiptLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceiptLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceiptLine_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferReceiptLine_postedMovementId_fkey" FOREIGN KEY ("postedMovementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
