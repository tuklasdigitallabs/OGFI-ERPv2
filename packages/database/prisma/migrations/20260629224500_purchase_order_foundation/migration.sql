CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "brandId" UUID,
    "publicReference" TEXT NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "quotationRequestId" UUID NOT NULL,
    "quotationRecommendationId" UUID NOT NULL,
    "selectedSupplierQuotationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "deliveryLocationId" UUID NOT NULL,
    "departmentId" UUID,
    "costCenterId" UUID,
    "currencyCode" TEXT NOT NULL,
    "subtotalAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,6) NOT NULL,
    "expectedDeliveryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceSnapshot" JSONB NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseOrder_status_check" CHECK ("status" = 'DRAFT'),
    CONSTRAINT "PurchaseOrder_subtotalAmount_check" CHECK ("subtotalAmount" >= 0),
    CONSTRAINT "PurchaseOrder_taxAmount_check" CHECK ("taxAmount" >= 0),
    CONSTRAINT "PurchaseOrder_discountAmount_check" CHECK ("discountAmount" >= 0),
    CONSTRAINT "PurchaseOrder_totalAmount_check" CHECK ("totalAmount" >= 0)
);

CREATE TABLE "PurchaseOrderLine" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourcePrLineId" UUID,
    "sourceSupplierQuoteLineId" UUID,
    "itemId" UUID,
    "uomId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "orderedQty" DECIMAL(18,6) NOT NULL,
    "receivedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "cancelledQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "taxAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,6) NOT NULL,
    "availabilityStatus" TEXT,
    "leadTimeDays" INTEGER,
    "notes" TEXT,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseOrderLine_orderedQty_check" CHECK ("orderedQty" > 0),
    CONSTRAINT "PurchaseOrderLine_receivedQty_check" CHECK ("receivedQty" >= 0),
    CONSTRAINT "PurchaseOrderLine_cancelledQty_check" CHECK ("cancelledQty" >= 0),
    CONSTRAINT "PurchaseOrderLine_unitPrice_check" CHECK ("unitPrice" >= 0),
    CONSTRAINT "PurchaseOrderLine_taxAmount_check" CHECK ("taxAmount" >= 0),
    CONSTRAINT "PurchaseOrderLine_discountAmount_check" CHECK ("discountAmount" >= 0),
    CONSTRAINT "PurchaseOrderLine_lineTotal_check" CHECK ("lineTotal" >= 0),
    CONSTRAINT "PurchaseOrderLine_qty_progress_check" CHECK ("receivedQty" + "cancelledQty" <= "orderedQty")
);

CREATE UNIQUE INDEX "PurchaseOrder_companyId_publicReference_key" ON "PurchaseOrder"("companyId", "publicReference");
CREATE UNIQUE INDEX "PurchaseOrder_quotationRecommendationId_key" ON "PurchaseOrder"("quotationRecommendationId");
CREATE INDEX "PurchaseOrder_tenantId_companyId_status_idx" ON "PurchaseOrder"("tenantId", "companyId", "status");
CREATE INDEX "PurchaseOrder_tenantId_deliveryLocationId_status_idx" ON "PurchaseOrder"("tenantId", "deliveryLocationId", "status");
CREATE INDEX "PurchaseOrder_purchaseRequestId_idx" ON "PurchaseOrder"("purchaseRequestId");
CREATE INDEX "PurchaseOrder_quotationRequestId_idx" ON "PurchaseOrder"("quotationRequestId");
CREATE INDEX "PurchaseOrder_selectedSupplierQuotationId_idx" ON "PurchaseOrder"("selectedSupplierQuotationId");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_lineNumber_key" ON "PurchaseOrderLine"("purchaseOrderId", "lineNumber");
CREATE INDEX "PurchaseOrderLine_tenantId_companyId_idx" ON "PurchaseOrderLine"("tenantId", "companyId");
CREATE INDEX "PurchaseOrderLine_sourcePrLineId_idx" ON "PurchaseOrderLine"("sourcePrLineId");
CREATE INDEX "PurchaseOrderLine_sourceSupplierQuoteLineId_idx" ON "PurchaseOrderLine"("sourceSupplierQuoteLineId");
CREATE INDEX "PurchaseOrderLine_itemId_idx" ON "PurchaseOrderLine"("itemId");

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_quotationRequest_scope_fkey" FOREIGN KEY ("quotationRequestId", "tenantId", "companyId") REFERENCES "QuotationRequest"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_quotationRecommendationId_fkey" FOREIGN KEY ("quotationRecommendationId") REFERENCES "QuotationRecommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_selectedQuote_request_fkey" FOREIGN KEY ("selectedSupplierQuotationId", "quotationRequestId") REFERENCES "SupplierQuotation"("id", "quotationRequestId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_deliveryLocationId_fkey" FOREIGN KEY ("deliveryLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_sourcePrLineId_fkey" FOREIGN KEY ("sourcePrLineId") REFERENCES "PurchaseRequestLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_sourceSupplierQuoteLineId_fkey" FOREIGN KEY ("sourceSupplierQuoteLineId") REFERENCES "SupplierQuotationLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
