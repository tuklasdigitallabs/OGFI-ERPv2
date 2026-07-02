-- Phase I item, category, UOM, and conversion master-data foundation.
-- These records are not yet wired into purchasing, receiving, or inventory posting.

CREATE TABLE "ItemCategory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "parentId" UUID REFERENCES "ItemCategory"("id"),
  "categoryCode" TEXT NOT NULL,
  "categoryName" TEXT NOT NULL,
  "inventoryClass" TEXT NOT NULL,
  "requiresExpiryTracking" BOOLEAN NOT NULL DEFAULT false,
  "requiresLotTracking" BOOLEAN NOT NULL DEFAULT false,
  "defaultWastageRequiresPhoto" BOOLEAN NOT NULL DEFAULT false,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemCategory_companyId_categoryCode_key" UNIQUE ("companyId", "categoryCode")
);

CREATE TABLE "Uom" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "uomCode" TEXT NOT NULL,
  "uomName" TEXT NOT NULL,
  "uomType" TEXT NOT NULL,
  "decimalPrecision" INTEGER NOT NULL DEFAULT 0,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Uom_companyId_uomCode_key" UNIQUE ("companyId", "uomCode")
);

CREATE TABLE "Item" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "itemCode" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "itemCategoryId" UUID NOT NULL REFERENCES "ItemCategory"("id"),
  "itemType" TEXT NOT NULL,
  "baseUomId" UUID NOT NULL REFERENCES "Uom"("id"),
  "purchaseUomId" UUID REFERENCES "Uom"("id"),
  "issueUomId" UUID REFERENCES "Uom"("id"),
  "trackInventory" BOOLEAN NOT NULL DEFAULT true,
  "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
  "trackLot" BOOLEAN NOT NULL DEFAULT false,
  "requiresReceivingInspection" BOOLEAN NOT NULL DEFAULT false,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Item_companyId_itemCode_key" UNIQUE ("companyId", "itemCode")
);

CREATE TABLE "ItemUomConversion" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" UUID NOT NULL REFERENCES "Item"("id"),
  "fromUomId" UUID NOT NULL REFERENCES "Uom"("id"),
  "toUomId" UUID NOT NULL REFERENCES "Uom"("id"),
  "conversionFactor" DECIMAL(18, 6) NOT NULL,
  "roundingRule" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemUomConversion_itemId_fromUomId_toUomId_key" UNIQUE ("itemId", "fromUomId", "toUomId")
);

CREATE INDEX "ItemCategory_tenantId_companyId_status_idx"
  ON "ItemCategory"("tenantId", "companyId", "status");

CREATE INDEX "Uom_tenantId_companyId_status_idx"
  ON "Uom"("tenantId", "companyId", "status");

CREATE INDEX "Item_tenantId_companyId_status_idx"
  ON "Item"("tenantId", "companyId", "status");

CREATE INDEX "ItemUomConversion_itemId_idx"
  ON "ItemUomConversion"("itemId");
