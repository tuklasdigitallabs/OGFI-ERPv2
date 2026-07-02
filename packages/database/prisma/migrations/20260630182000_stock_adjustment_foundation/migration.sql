CREATE TABLE "StockAdjustment" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "publicReference" TEXT NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "cancelledByUserId" UUID,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "adjustmentType" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "reasonDescription" TEXT NOT NULL,
  "evidenceReference" TEXT,
  "sourceDocumentType" TEXT,
  "sourceDocumentId" UUID,
  "sourceStockCountSessionId" UUID,
  "totalEstimatedValueImpact" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockAdjustment_status_check"
    CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'CANCELLED')),
  CONSTRAINT "StockAdjustment_adjustmentType_check"
    CHECK ("adjustmentType" IN ('INCREASE', 'DECREASE')),
  CONSTRAINT "StockAdjustment_totalEstimatedValueImpact_check"
    CHECK ("totalEstimatedValueImpact" >= 0),
  CONSTRAINT "StockAdjustment_submitted_fields_check"
    CHECK ("status" <> 'SUBMITTED' OR "submittedAt" IS NOT NULL),
  CONSTRAINT "StockAdjustment_cancelled_fields_check"
    CHECK (
      "status" <> 'CANCELLED'
      OR (
        "cancelledAt" IS NOT NULL
        AND "cancelledByUserId" IS NOT NULL
        AND "cancellationReason" IS NOT NULL
        AND length(trim("cancellationReason")) >= 5
      )
    )
);

CREATE TABLE "StockAdjustmentLine" (
  "id" UUID NOT NULL,
  "stockAdjustmentId" UUID NOT NULL,
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
  "quantityDeltaBaseUom" DECIMAL(18,6) NOT NULL,
  "unitCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "estimatedValueImpact" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "reasonCode" TEXT NOT NULL,
  "notes" TEXT,
  "evidenceReference" TEXT,
  "postedMovementId" UUID,
  "sourceStockCountLineId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockAdjustmentLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockAdjustmentLine_quantityDeltaBaseUom_check"
    CHECK ("quantityDeltaBaseUom" <> 0),
  CONSTRAINT "StockAdjustmentLine_estimatedValueImpact_check"
    CHECK ("estimatedValueImpact" >= 0)
);

CREATE UNIQUE INDEX "StockAdjustment_companyId_publicReference_key"
  ON "StockAdjustment"("companyId", "publicReference");

CREATE INDEX "StockAdjustment_tenantId_companyId_status_createdAt_idx"
  ON "StockAdjustment"("tenantId", "companyId", "status", "createdAt");

CREATE INDEX "StockAdjustment_tenantId_companyId_inventoryLocationId_status_idx"
  ON "StockAdjustment"("tenantId", "companyId", "inventoryLocationId", "status");

CREATE INDEX "StockAdjustment_requestedByUserId_idx"
  ON "StockAdjustment"("requestedByUserId");

CREATE INDEX "StockAdjustment_cancelledByUserId_idx"
  ON "StockAdjustment"("cancelledByUserId");

CREATE UNIQUE INDEX "StockAdjustmentLine_stockAdjustmentId_lineNumber_key"
  ON "StockAdjustmentLine"("stockAdjustmentId", "lineNumber");

CREATE UNIQUE INDEX "StockAdjustmentLine_postedMovementId_key"
  ON "StockAdjustmentLine"("postedMovementId");

CREATE INDEX "StockAdjustmentLine_tenantId_companyId_stockAdjustmentId_itemId_idx"
  ON "StockAdjustmentLine"("tenantId", "companyId", "stockAdjustmentId", "itemId");

CREATE INDEX "StockAdjustmentLine_inventoryLocationId_itemId_lotKey_idx"
  ON "StockAdjustmentLine"("inventoryLocationId", "itemId", "lotKey");

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustment_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustment_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustment_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustment_sourceStockCountSessionId_fkey" FOREIGN KEY ("sourceStockCountSessionId") REFERENCES "StockCountSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockAdjustmentLine"
  ADD CONSTRAINT "StockAdjustmentLine_stockAdjustmentId_fkey" FOREIGN KEY ("stockAdjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustmentLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustmentLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustmentLine_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustmentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustmentLine_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustmentLine_postedMovementId_fkey" FOREIGN KEY ("postedMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAdjustmentLine_sourceStockCountLineId_fkey" FOREIGN KEY ("sourceStockCountLineId") REFERENCES "StockCountLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
