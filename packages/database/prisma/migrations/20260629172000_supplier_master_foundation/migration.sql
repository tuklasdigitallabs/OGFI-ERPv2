-- Phase I supplier master-data foundation.
-- Adds supplier source-of-truth records and operational contacts only.

CREATE TABLE "Supplier" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "supplierCode" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "tradingName" TEXT,
  "taxIdentifier" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "paymentTerms" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Supplier_companyId_supplierCode_key" UNIQUE ("companyId", "supplierCode")
);

CREATE TABLE "SupplierContact" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplierId" UUID NOT NULL REFERENCES "Supplier"("id"),
  "name" TEXT NOT NULL,
  "role" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Supplier_tenantId_companyId_status_idx"
  ON "Supplier"("tenantId", "companyId", "status");

CREATE INDEX "SupplierContact_supplierId_isPrimary_idx"
  ON "SupplierContact"("supplierId", "isPrimary");
