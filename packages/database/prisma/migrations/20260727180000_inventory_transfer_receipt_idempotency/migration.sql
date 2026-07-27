-- Additive, nullable receipt replay identity. Legacy transfer receipts remain
-- valid with NULL values; new receive callers must supply the key at the API
-- boundary before this writer is enabled.
ALTER TABLE "InventoryTransferReceipt"
  ADD COLUMN "idempotencyKey" VARCHAR(200),
  ADD COLUMN "idempotencyRequestHash" CHAR(64);

CREATE UNIQUE INDEX "InventoryTransferReceipt_tenantId_companyId_idempotencyKey_key"
  ON "InventoryTransferReceipt"("tenantId", "companyId", "idempotencyKey");
