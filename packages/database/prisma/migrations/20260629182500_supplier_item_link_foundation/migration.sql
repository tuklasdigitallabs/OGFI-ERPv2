-- Supplier-item capability and reference price history foundation.
CREATE TABLE "SupplierItemLink" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "purchaseUomId" UUID NOT NULL,
    "supplierSku" TEXT,
    "supplierItemName" TEXT,
    "leadTimeDays" INTEGER,
    "minOrderQty" DECIMAL(18,6),
    "preferredRank" INTEGER,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierItemLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPriceHistory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "supplierItemLinkId" UUID,
    "uomId" UUID NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceDocumentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierItemLink_supplierId_itemId_purchaseUomId_key" ON "SupplierItemLink"("supplierId", "itemId", "purchaseUomId");
CREATE INDEX "SupplierItemLink_tenantId_companyId_status_idx" ON "SupplierItemLink"("tenantId", "companyId", "status");
CREATE INDEX "SupplierItemLink_itemId_status_idx" ON "SupplierItemLink"("itemId", "status");
CREATE INDEX "SupplierPriceHistory_tenantId_companyId_supplierId_itemId_effectiveFrom_idx" ON "SupplierPriceHistory"("tenantId", "companyId", "supplierId", "itemId", "effectiveFrom");
CREATE INDEX "SupplierPriceHistory_supplierItemLinkId_effectiveFrom_idx" ON "SupplierPriceHistory"("supplierItemLinkId", "effectiveFrom");

ALTER TABLE "SupplierItemLink" ADD CONSTRAINT "SupplierItemLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierItemLink" ADD CONSTRAINT "SupplierItemLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierItemLink" ADD CONSTRAINT "SupplierItemLink_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierItemLink" ADD CONSTRAINT "SupplierItemLink_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierItemLink" ADD CONSTRAINT "SupplierItemLink_purchaseUomId_fkey" FOREIGN KEY ("purchaseUomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_supplierItemLinkId_fkey" FOREIGN KEY ("supplierItemLinkId") REFERENCES "SupplierItemLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
