CREATE TABLE "InventoryTransfer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "publicReference" TEXT NOT NULL,
  "sourceLocationId" UUID NOT NULL,
  "destinationLocationId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "transferType" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "requiredByDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransfer_distinct_locations_check" CHECK ("sourceLocationId" <> "destinationLocationId"),
  CONSTRAINT "InventoryTransfer_status_check" CHECK ("status" IN ('DRAFT', 'REQUESTED', 'CANCELLED'))
);

CREATE TABLE "InventoryTransferLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "inventoryTransferId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "sourceInventoryLocationId" UUID NOT NULL,
  "destinationInventoryLocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "uomId" UUID NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "requestedQty" DECIMAL(18,6) NOT NULL,
  "approvedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "preparedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "dispatchedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "receivedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "rejectedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "damagedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "discrepancyQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "lotNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "notes" TEXT,

  CONSTRAINT "InventoryTransferLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransferLine_positive_requested_qty_check" CHECK ("requestedQty" > 0)
);

CREATE UNIQUE INDEX "InventoryTransfer_companyId_publicReference_key"
  ON "InventoryTransfer"("companyId", "publicReference");
CREATE INDEX "InventoryTransfer_tenantId_companyId_status_idx"
  ON "InventoryTransfer"("tenantId", "companyId", "status");
CREATE INDEX "InventoryTransfer_tenantId_companyId_sourceLocationId_status_idx"
  ON "InventoryTransfer"("tenantId", "companyId", "sourceLocationId", "status");
CREATE INDEX "InventoryTransfer_tenantId_companyId_destinationLocationId_status_idx"
  ON "InventoryTransfer"("tenantId", "companyId", "destinationLocationId", "status");
CREATE INDEX "InventoryTransfer_requiredByDate_idx"
  ON "InventoryTransfer"("requiredByDate");

CREATE UNIQUE INDEX "InventoryTransferLine_inventoryTransferId_lineNumber_key"
  ON "InventoryTransferLine"("inventoryTransferId", "lineNumber");
CREATE INDEX "InventoryTransferLine_tenantId_companyId_idx"
  ON "InventoryTransferLine"("tenantId", "companyId");
CREATE INDEX "InventoryTransferLine_sourceInventoryLocationId_idx"
  ON "InventoryTransferLine"("sourceInventoryLocationId");
CREATE INDEX "InventoryTransferLine_destinationInventoryLocationId_idx"
  ON "InventoryTransferLine"("destinationInventoryLocationId");
CREATE INDEX "InventoryTransferLine_itemId_idx"
  ON "InventoryTransferLine"("itemId");

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransfer_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransfer_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransfer_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferLine"
  ADD CONSTRAINT "InventoryTransferLine_inventoryTransferId_fkey" FOREIGN KEY ("inventoryTransferId") REFERENCES "InventoryTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferLine_sourceInventoryLocationId_fkey" FOREIGN KEY ("sourceInventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferLine_destinationInventoryLocationId_fkey" FOREIGN KEY ("destinationInventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransferLine_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
