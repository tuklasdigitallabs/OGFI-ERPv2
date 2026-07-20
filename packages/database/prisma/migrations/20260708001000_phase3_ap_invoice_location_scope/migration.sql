ALTER TABLE "ApInvoice" ADD COLUMN "locationId" UUID;

CREATE INDEX "ApInvoice_tenantId_companyId_locationId_status_idx" ON "ApInvoice"("tenantId", "companyId", "locationId", "status");
