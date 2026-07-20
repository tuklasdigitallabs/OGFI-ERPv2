CREATE TYPE "SupplierAccreditationStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'SUSPENDED',
  'BLOCKED'
);

ALTER TABLE "Supplier"
  ADD COLUMN "accreditationStatus" "SupplierAccreditationStatus" NOT NULL DEFAULT 'PENDING_REVIEW';

UPDATE "Supplier"
SET "accreditationStatus" = CASE
  WHEN "status" = 'ACTIVE' THEN 'APPROVED'::"SupplierAccreditationStatus"
  ELSE 'SUSPENDED'::"SupplierAccreditationStatus"
END;

CREATE INDEX "Supplier_tenantId_companyId_accreditationStatus_idx"
  ON "Supplier"("tenantId", "companyId", "accreditationStatus");
