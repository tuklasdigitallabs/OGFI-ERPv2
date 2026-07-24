ALTER TABLE "SupplierQuotation"
  ADD COLUMN "subtotalAmount" DECIMAL(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" DECIMAL(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount" DECIMAL(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "freightAmount" DECIMAL(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "otherChargesAmount" DECIMAL(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "supplierAccreditationSnapshot" TEXT;

UPDATE "SupplierQuotation"
SET "subtotalAmount" = "totalAmount"
WHERE "subtotalAmount" = 0 AND "totalAmount" <> 0;
