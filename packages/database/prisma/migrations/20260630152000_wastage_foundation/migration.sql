CREATE TABLE "WastageReport" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "publicReference" TEXT NOT NULL,
  "reportedByUserId" UUID NOT NULL,
  "reviewedByUserId" UUID,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "wastageType" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "evidenceReference" TEXT,
  "notes" TEXT,
  "totalEstimatedCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WastageReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WastageReport_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'REVIEWED', 'RETURNED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT "WastageReport_total_estimated_cost_check" CHECK ("totalEstimatedCost" >= 0)
);

CREATE TABLE "WastageLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "wastageReportId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "uomId" UUID NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  "quantityBaseUom" DECIMAL(18,6) NOT NULL,
  "estimatedUnitCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "estimatedTotalCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "reasonCode" TEXT NOT NULL,
  "evidenceReference" TEXT,
  "photoRequired" BOOLEAN NOT NULL DEFAULT false,
  "lotNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WastageLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WastageLine_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "WastageLine_base_quantity_check" CHECK ("quantityBaseUom" > 0),
  CONSTRAINT "WastageLine_estimated_cost_check" CHECK ("estimatedUnitCost" >= 0 AND "estimatedTotalCost" >= 0)
);

CREATE UNIQUE INDEX "WastageReport_companyId_publicReference_key"
  ON "WastageReport"("companyId", "publicReference");

CREATE INDEX "WastageReport_tenantId_companyId_status_createdAt_idx"
  ON "WastageReport"("tenantId", "companyId", "status", "createdAt");

CREATE INDEX "WastageReport_tenantId_companyId_inventoryLocationId_status_idx"
  ON "WastageReport"("tenantId", "companyId", "inventoryLocationId", "status");

CREATE INDEX "WastageReport_reportedByUserId_idx"
  ON "WastageReport"("reportedByUserId");

CREATE UNIQUE INDEX "WastageLine_wastageReportId_lineNumber_key"
  ON "WastageLine"("wastageReportId", "lineNumber");

CREATE INDEX "WastageLine_tenantId_companyId_wastageReportId_itemId_idx"
  ON "WastageLine"("tenantId", "companyId", "wastageReportId", "itemId");

CREATE INDEX "WastageLine_inventoryLocationId_itemId_idx"
  ON "WastageLine"("inventoryLocationId", "itemId");

ALTER TABLE "WastageReport"
  ADD CONSTRAINT "WastageReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastageReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastageReport_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastageReport_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastageReport_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WastageLine"
  ADD CONSTRAINT "WastageLine_wastageReportId_fkey" FOREIGN KEY ("wastageReportId") REFERENCES "WastageReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastageLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastageLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastageLine_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastageLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastageLine_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
