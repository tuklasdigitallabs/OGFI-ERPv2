CREATE TABLE "RestaurantSalesImportBatch" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "businessDate" TIMESTAMP(3) NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "importRef" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "currencyCode" TEXT NOT NULL,
  "totalNetSales" DECIMAL(18,6) NOT NULL,
  "totalQuantity" DECIMAL(18,6) NOT NULL,
  "importedByUserId" UUID,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RestaurantSalesImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantSalesImportLine" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "menuItemId" UUID NOT NULL,
  "businessDate" TIMESTAMP(3) NOT NULL,
  "salesChannel" TEXT NOT NULL DEFAULT 'STORE',
  "quantitySold" DECIMAL(18,6) NOT NULL,
  "grossSalesAmount" DECIMAL(18,6) NOT NULL,
  "discountAmount" DECIMAL(18,6) NOT NULL,
  "netSalesAmount" DECIMAL(18,6) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RestaurantSalesImportLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantSalesImportBatch_companyId_locationId_businessDate_sourceSystem_importRef_key"
  ON "RestaurantSalesImportBatch"("companyId", "locationId", "businessDate", "sourceSystem", "importRef");

CREATE INDEX "RestaurantSalesImportBatch_tenantId_companyId_brandId_locationId_businessDate_status_idx"
  ON "RestaurantSalesImportBatch"("tenantId", "companyId", "brandId", "locationId", "businessDate", "status");

CREATE UNIQUE INDEX "RestaurantSalesImportLine_batchId_menuItemId_salesChannel_key"
  ON "RestaurantSalesImportLine"("batchId", "menuItemId", "salesChannel");

CREATE INDEX "RestaurantSalesImportLine_tenantId_companyId_brandId_locationId_businessDate_idx"
  ON "RestaurantSalesImportLine"("tenantId", "companyId", "brandId", "locationId", "businessDate");

CREATE INDEX "RestaurantSalesImportLine_menuItemId_businessDate_idx"
  ON "RestaurantSalesImportLine"("menuItemId", "businessDate");

ALTER TABLE "RestaurantSalesImportBatch" ADD CONSTRAINT "RestaurantSalesImportBatch_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantSalesImportBatch" ADD CONSTRAINT "RestaurantSalesImportBatch_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantSalesImportBatch" ADD CONSTRAINT "RestaurantSalesImportBatch_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RestaurantSalesImportBatch" ADD CONSTRAINT "RestaurantSalesImportBatch_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantSalesImportLine" ADD CONSTRAINT "RestaurantSalesImportLine_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantSalesImportLine" ADD CONSTRAINT "RestaurantSalesImportLine_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantSalesImportLine" ADD CONSTRAINT "RestaurantSalesImportLine_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RestaurantSalesImportLine" ADD CONSTRAINT "RestaurantSalesImportLine_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantSalesImportLine" ADD CONSTRAINT "RestaurantSalesImportLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "RestaurantSalesImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantSalesImportLine" ADD CONSTRAINT "RestaurantSalesImportLine_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
