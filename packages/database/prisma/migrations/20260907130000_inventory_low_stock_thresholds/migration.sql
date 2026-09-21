-- Additive configuration only: no balance or movement changes, and no defaults seeded.
CREATE UNIQUE INDEX "Item_low_stock_uom_scope_key" ON "Item" ("id", "tenantId", "companyId", "baseUomId");
CREATE UNIQUE INDEX "InventoryLocation_low_stock_scope_key" ON "InventoryLocation" ("id", "tenantId", "companyId");

CREATE TABLE "InventoryLowStockThreshold" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "baseUomId" UUID NOT NULL,
  "thresholdQuantity" DECIMAL(18,6) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryLowStockThreshold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLowStockThreshold_quantity_check" CHECK ("thresholdQuantity" >= 0 AND "thresholdQuantity" <> 'NaN'::numeric),
  CONSTRAINT "InventoryLowStockThreshold_version_check" CHECK ("version" >= 1),
  CONSTRAINT "InventoryLowStockThreshold_location_fkey" FOREIGN KEY ("inventoryLocationId", "tenantId", "companyId") REFERENCES "InventoryLocation" ("id", "tenantId", "companyId") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "InventoryLowStockThreshold_item_fkey" FOREIGN KEY ("itemId", "tenantId", "companyId", "baseUomId") REFERENCES "Item" ("id", "tenantId", "companyId", "baseUomId") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "InventoryLowStockThreshold_pair_key" ON "InventoryLowStockThreshold" ("tenantId", "companyId", "inventoryLocationId", "itemId");
CREATE INDEX "InventoryLowStockThreshold_tenantId_companyId_inventoryLocat_idx" ON "InventoryLowStockThreshold" ("tenantId", "companyId", "inventoryLocationId", "active");

-- Rollback: export configuration and audit history first. Revert application reads
-- before dropping this additive table/indexes; never roll back inventory history.
