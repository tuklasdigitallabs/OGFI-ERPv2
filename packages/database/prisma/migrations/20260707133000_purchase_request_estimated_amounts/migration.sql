ALTER TABLE "PurchaseRequestLine"
  ADD COLUMN "estimatedUnitCost" DECIMAL(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "estimatedLineTotal" DECIMAL(18, 6) NOT NULL DEFAULT 0;

