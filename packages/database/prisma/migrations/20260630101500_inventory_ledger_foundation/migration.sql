CREATE TYPE "InventoryMovementType" AS ENUM (
  'RECEIPT_IN',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'WASTAGE_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'COUNT_VARIANCE_IN',
  'COUNT_VARIANCE_OUT',
  'REVERSAL'
);

CREATE TABLE "InventoryLocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "storageType" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryMovement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "movementType" "InventoryMovementType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "enteredQuantity" DECIMAL(18,6) NOT NULL,
  "enteredUomId" UUID NOT NULL,
  "quantityDeltaBaseUom" DECIMAL(18,6) NOT NULL,
  "baseUomId" UUID NOT NULL,
  "lotNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "unitCost" DECIMAL(18,6),
  "totalCost" DECIMAL(18,6),
  "sourceDocumentType" TEXT NOT NULL,
  "sourceDocumentId" UUID NOT NULL,
  "sourceDocumentLineId" UUID,
  "sourceEventKey" TEXT NOT NULL,
  "reasonCode" TEXT,
  "notes" TEXT,
  "reversalOfMovementId" UUID,
  "postedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryBalance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "lotKey" TEXT NOT NULL DEFAULT 'UNTRACKED',
  "lotNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "baseUomId" UUID NOT NULL,
  "qtyOnHand" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryLocation_companyId_code_key" ON "InventoryLocation"("companyId", "code");
CREATE INDEX "InventoryLocation_tenantId_companyId_locationId_status_idx" ON "InventoryLocation"("tenantId", "companyId", "locationId", "status");

CREATE UNIQUE INDEX "InventoryMovement_tenantId_companyId_sourceDocumentType_sourceDocumentId_sourceEventKey_key"
  ON "InventoryMovement"("tenantId", "companyId", "sourceDocumentType", "sourceDocumentId", "sourceEventKey");
CREATE INDEX "InventoryMovement_tenantId_companyId_inventoryLocationId_itemId_occurredAt_idx"
  ON "InventoryMovement"("tenantId", "companyId", "inventoryLocationId", "itemId", "occurredAt");
CREATE INDEX "InventoryMovement_sourceDocumentType_sourceDocumentId_idx"
  ON "InventoryMovement"("sourceDocumentType", "sourceDocumentId");
CREATE INDEX "InventoryMovement_reversalOfMovementId_idx"
  ON "InventoryMovement"("reversalOfMovementId");

CREATE UNIQUE INDEX "InventoryBalance_inventoryLocationId_itemId_lotKey_key"
  ON "InventoryBalance"("inventoryLocationId", "itemId", "lotKey");
CREATE INDEX "InventoryBalance_tenantId_companyId_inventoryLocationId_idx"
  ON "InventoryBalance"("tenantId", "companyId", "inventoryLocationId");
CREATE INDEX "InventoryBalance_tenantId_companyId_itemId_idx"
  ON "InventoryBalance"("tenantId", "companyId", "itemId");

ALTER TABLE "InventoryLocation"
  ADD CONSTRAINT "InventoryLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryMovement_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryMovement_enteredUomId_fkey" FOREIGN KEY ("enteredUomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryMovement_baseUomId_fkey" FOREIGN KEY ("baseUomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryMovement_reversalOfMovementId_fkey" FOREIGN KEY ("reversalOfMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT "InventoryBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryBalance_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryBalance_baseUomId_fkey" FOREIGN KEY ("baseUomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
