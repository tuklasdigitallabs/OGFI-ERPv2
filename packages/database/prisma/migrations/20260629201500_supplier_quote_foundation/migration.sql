-- Supplier quote capture foundation for approved Purchase Requests.
CREATE TABLE "QuotationRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requiredDate" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierQuotation" (
    "id" UUID NOT NULL,
    "quotationRequestId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "quoteReference" TEXT NOT NULL,
    "quoteDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,6) NOT NULL,
    "validityDate" TIMESTAMP(3),
    "terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierQuotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierQuotationLine" (
    "id" UUID NOT NULL,
    "supplierQuotationId" UUID NOT NULL,
    "sourcePrLineId" UUID,
    "itemId" UUID,
    "quantity" DECIMAL(18,6) NOT NULL,
    "uomId" UUID NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "lineTotal" DECIMAL(18,6) NOT NULL,
    "availabilityStatus" TEXT NOT NULL,
    "leadTimeDays" INTEGER,
    "notes" TEXT,

    CONSTRAINT "SupplierQuotationLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuotationRequest_companyId_publicReference_key" ON "QuotationRequest"("companyId", "publicReference");
CREATE UNIQUE INDEX "QuotationRequest_purchaseRequestId_key" ON "QuotationRequest"("purchaseRequestId");
CREATE INDEX "QuotationRequest_tenantId_companyId_status_idx" ON "QuotationRequest"("tenantId", "companyId", "status");
CREATE INDEX "SupplierQuotation_tenantId_companyId_supplierId_idx" ON "SupplierQuotation"("tenantId", "companyId", "supplierId");
CREATE INDEX "SupplierQuotation_quotationRequestId_idx" ON "SupplierQuotation"("quotationRequestId");
CREATE INDEX "SupplierQuotationLine_supplierQuotationId_idx" ON "SupplierQuotationLine"("supplierQuotationId");
CREATE INDEX "SupplierQuotationLine_sourcePrLineId_idx" ON "SupplierQuotationLine"("sourcePrLineId");

ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_quotationRequestId_fkey" FOREIGN KEY ("quotationRequestId") REFERENCES "QuotationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_supplierQuotationId_fkey" FOREIGN KEY ("supplierQuotationId") REFERENCES "SupplierQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_sourcePrLineId_fkey" FOREIGN KEY ("sourcePrLineId") REFERENCES "PurchaseRequestLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
