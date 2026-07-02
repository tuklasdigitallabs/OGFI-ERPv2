CREATE TABLE "StockCountSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "publicReference" TEXT NOT NULL,
  "countType" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL DEFAULT 'ALL_ITEMS',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "blindCount" BOOLEAN NOT NULL DEFAULT true,
  "freezeMovements" BOOLEAN NOT NULL DEFAULT false,
  "scheduledDate" TIMESTAMP(3),
  "cutoffAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "reviewNotes" TEXT,
  "createdByUserId" UUID NOT NULL,
  "assignedToUserId" UUID,
  "reviewedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockCountSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockCountSession_status_check" CHECK ("status" IN ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'RECOUNT_REQUESTED', 'REVIEWED', 'CANCELLED')),
  CONSTRAINT "StockCountSession_countType_check" CHECK ("countType" IN ('FULL', 'CYCLE', 'SPOT', 'HIGH_VALUE', 'OPENING'))
);

CREATE TABLE "StockCountLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stockCountSessionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "uomId" UUID NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "lotKey" TEXT NOT NULL DEFAULT 'NOLOT|NOEXP',
  "lotNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "systemQuantityBaseUom" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "countedQuantityBaseUom" DECIMAL(18,6),
  "varianceQuantityBaseUom" DECIMAL(18,6),
  "notes" TEXT,
  "countedByUserId" UUID,
  "countedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockCountLine_counted_quantity_check" CHECK ("countedQuantityBaseUom" IS NULL OR "countedQuantityBaseUom" >= 0)
);

CREATE UNIQUE INDEX "StockCountSession_companyId_publicReference_key"
  ON "StockCountSession"("companyId", "publicReference");

CREATE INDEX "StockCountSession_tenantId_companyId_status_scheduledDate_idx"
  ON "StockCountSession"("tenantId", "companyId", "status", "scheduledDate");

CREATE INDEX "StockCountSession_tenantId_companyId_inventoryLocationId_status_idx"
  ON "StockCountSession"("tenantId", "companyId", "inventoryLocationId", "status");

CREATE UNIQUE INDEX "StockCountLine_stockCountSessionId_itemId_lotKey_key"
  ON "StockCountLine"("stockCountSessionId", "itemId", "lotKey");

CREATE UNIQUE INDEX "StockCountLine_stockCountSessionId_lineNumber_key"
  ON "StockCountLine"("stockCountSessionId", "lineNumber");

CREATE INDEX "StockCountLine_tenantId_companyId_stockCountSessionId_itemId_idx"
  ON "StockCountLine"("tenantId", "companyId", "stockCountSessionId", "itemId");

CREATE INDEX "StockCountLine_inventoryLocationId_itemId_lotKey_idx"
  ON "StockCountLine"("inventoryLocationId", "itemId", "lotKey");

ALTER TABLE "StockCountSession"
  ADD CONSTRAINT "StockCountSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountSession_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountSession_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountSession_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockCountLine"
  ADD CONSTRAINT "StockCountLine_stockCountSessionId_fkey" FOREIGN KEY ("stockCountSessionId") REFERENCES "StockCountSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountLine_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountLine_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockCountLine_countedByUserId_fkey" FOREIGN KEY ("countedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
