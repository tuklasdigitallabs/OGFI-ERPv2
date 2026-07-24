ALTER TABLE "GoodsReceipt"
  ADD COLUMN "idempotencyKey" VARCHAR(200),
  ADD COLUMN "idempotencyRequestHash" CHAR(64);

CREATE UNIQUE INDEX "GoodsReceipt_tenantId_companyId_idempotencyKey_key"
  ON "GoodsReceipt"("tenantId", "companyId", "idempotencyKey");
