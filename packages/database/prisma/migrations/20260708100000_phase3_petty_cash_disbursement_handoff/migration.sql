ALTER TABLE "NonSupplierDisbursementRequest"
  ADD COLUMN "pettyCashRequestId" UUID;

CREATE INDEX "NonSupplierDisbursementRequest_tenantId_companyId_pettyCashRequestId_idx"
  ON "NonSupplierDisbursementRequest"("tenantId", "companyId", "pettyCashRequestId");

ALTER TABLE "NonSupplierDisbursementRequest"
  ADD CONSTRAINT "NonSupplierDisbursementRequest_pettyCashRequestId_fkey"
  FOREIGN KEY ("pettyCashRequestId") REFERENCES "PettyCashRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
