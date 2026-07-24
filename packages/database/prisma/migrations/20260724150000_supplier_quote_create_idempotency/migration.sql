ALTER TABLE "SupplierQuotation"
  ADD COLUMN "idempotencyKey" VARCHAR(200),
  ADD COLUMN "idempotencyRequestHash" CHAR(64);

CREATE UNIQUE INDEX "SupplierQuotation_tenantId_companyId_idempotencyKey_key"
  ON "SupplierQuotation"("tenantId", "companyId", "idempotencyKey");
