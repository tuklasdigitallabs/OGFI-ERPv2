-- Controlled quotation recommendation foundation.
-- This records supplier selection rationale without creating a Purchase Order.

CREATE TABLE "QuotationRecommendation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationRequestId" UUID NOT NULL,
    "selectedSupplierQuotationId" UUID NOT NULL,
    "preparedByUserId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL,
    "selectedEvaluatedTotal" DECIMAL(18,6) NOT NULL,
    "lowestEvaluatedTotal" DECIMAL(18,6) NOT NULL,
    "quoteCount" INTEGER NOT NULL,
    "isLowestEvaluatedCost" BOOLEAN NOT NULL,
    "selectionReason" TEXT NOT NULL,
    "nonLowestJustification" TEXT,
    "singleSourceJustification" TEXT,
    "evaluationSnapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationRecommendation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuotationRecommendation_quoteCount_check" CHECK ("quoteCount" >= 1),
    CONSTRAINT "QuotationRecommendation_selectedEvaluatedTotal_check" CHECK ("selectedEvaluatedTotal" >= 0),
    CONSTRAINT "QuotationRecommendation_lowestEvaluatedTotal_check" CHECK ("lowestEvaluatedTotal" >= 0),
    CONSTRAINT "QuotationRecommendation_selectionReason_check" CHECK (length(btrim("selectionReason")) > 0),
    CONSTRAINT "QuotationRecommendation_singleSourceJustification_check" CHECK ("quoteCount" <> 1 OR length(btrim(coalesce("singleSourceJustification", ''))) > 0),
    CONSTRAINT "QuotationRecommendation_nonLowestJustification_check" CHECK ("isLowestEvaluatedCost" OR length(btrim(coalesce("nonLowestJustification", ''))) > 0)
);

CREATE UNIQUE INDEX "QuotationRequest_id_tenantId_companyId_key" ON "QuotationRequest"("id", "tenantId", "companyId");
CREATE UNIQUE INDEX "SupplierQuotation_id_quotationRequestId_key" ON "SupplierQuotation"("id", "quotationRequestId");

CREATE UNIQUE INDEX "QuotationRecommendation_quotationRequestId_version_key" ON "QuotationRecommendation"("quotationRequestId", "version");
CREATE INDEX "QuotationRecommendation_tenantId_companyId_status_idx" ON "QuotationRecommendation"("tenantId", "companyId", "status");
CREATE INDEX "QuotationRecommendation_quotationRequestId_status_idx" ON "QuotationRecommendation"("quotationRequestId", "status");
CREATE INDEX "QuotationRecommendation_selectedSupplierQuotationId_idx" ON "QuotationRecommendation"("selectedSupplierQuotationId");

CREATE UNIQUE INDEX "QuotationRecommendation_one_active_per_request_key"
    ON "QuotationRecommendation"("quotationRequestId")
    WHERE "status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED');

ALTER TABLE "QuotationRecommendation" ADD CONSTRAINT "QuotationRecommendation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationRecommendation" ADD CONSTRAINT "QuotationRecommendation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationRecommendation" ADD CONSTRAINT "QuotationRecommendation_quotationRequest_scope_fkey" FOREIGN KEY ("quotationRequestId", "tenantId", "companyId") REFERENCES "QuotationRequest"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationRecommendation" ADD CONSTRAINT "QuotationRecommendation_selectedQuote_request_fkey" FOREIGN KEY ("selectedSupplierQuotationId", "quotationRequestId") REFERENCES "SupplierQuotation"("id", "quotationRequestId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationRecommendation" ADD CONSTRAINT "QuotationRecommendation_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
