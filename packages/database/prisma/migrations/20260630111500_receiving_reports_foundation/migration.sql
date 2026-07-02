ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_status_check";

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_status_check"
  CHECK ("status" IN (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'ISSUED',
    'PARTIALLY_RECEIVED',
    'FULLY_RECEIVED',
    'CANCELLED'
  ));

CREATE TABLE "GoodsReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "publicReference" TEXT NOT NULL,
  "purchaseOrderId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "receivingLocationId" UUID NOT NULL,
  "receivedByUserId" UUID NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "supplierDeliveryReceiptNumber" TEXT,
  "discrepancyFlag" BOOLEAN NOT NULL DEFAULT false,
  "discrepancySummary" TEXT,
  "notes" TEXT,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoodsReceiptLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "goodsReceiptId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "purchaseOrderLineId" UUID NOT NULL,
  "inventoryDestinationLocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "uomId" UUID NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "orderedQty" DECIMAL(18,6) NOT NULL,
  "deliveredQty" DECIMAL(18,6) NOT NULL,
  "acceptedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "rejectedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "damagedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "shortQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(18,6),
  "conditionStatus" TEXT NOT NULL DEFAULT 'ACCEPTED',
  "discrepancyType" TEXT,
  "discrepancyReason" TEXT,
  "lotNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "postedMovementId" UUID,
  "notes" TEXT,

  CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoodsReceipt_companyId_publicReference_key" ON "GoodsReceipt"("companyId", "publicReference");
CREATE INDEX "GoodsReceipt_tenantId_companyId_status_idx" ON "GoodsReceipt"("tenantId", "companyId", "status");
CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON "GoodsReceipt"("purchaseOrderId");
CREATE INDEX "GoodsReceipt_receivingLocationId_status_idx" ON "GoodsReceipt"("receivingLocationId", "status");

CREATE UNIQUE INDEX "GoodsReceiptLine_goodsReceiptId_lineNumber_key" ON "GoodsReceiptLine"("goodsReceiptId", "lineNumber");
CREATE INDEX "GoodsReceiptLine_tenantId_companyId_idx" ON "GoodsReceiptLine"("tenantId", "companyId");
CREATE INDEX "GoodsReceiptLine_purchaseOrderLineId_idx" ON "GoodsReceiptLine"("purchaseOrderLineId");
CREATE INDEX "GoodsReceiptLine_inventoryDestinationLocationId_idx" ON "GoodsReceiptLine"("inventoryDestinationLocationId");

ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceipt_receivingLocationId_fkey" FOREIGN KEY ("receivingLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceipt_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptLine"
  ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceiptLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceiptLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceiptLine_inventoryDestinationLocationId_fkey" FOREIGN KEY ("inventoryDestinationLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceiptLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceiptLine_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
