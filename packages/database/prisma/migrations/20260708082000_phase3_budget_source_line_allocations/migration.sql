-- Additive Phase 3 budget source-allocation foundation.
-- Nullable budget-line fields let PR, PO, and AP lines carry stable allocation dimensions.
-- This migration does not backfill existing records, change statuses, enforce hard blocks, or create commitments.

ALTER TABLE "PurchaseRequestLine" ADD COLUMN "budgetLineId" UUID;
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "budgetLineId" UUID;
ALTER TABLE "ApInvoiceLine" ADD COLUMN "budgetLineId" UUID;

CREATE INDEX "PurchaseRequestLine_budgetLineId_idx"
    ON "PurchaseRequestLine"("budgetLineId");

CREATE INDEX "PurchaseOrderLine_tenantId_companyId_budgetLineId_idx"
    ON "PurchaseOrderLine"("tenantId", "companyId", "budgetLineId");

CREATE INDEX "ApInvoiceLine_tenantId_companyId_budgetLineId_idx"
    ON "ApInvoiceLine"("tenantId", "companyId", "budgetLineId");

ALTER TABLE "PurchaseRequestLine"
    ADD CONSTRAINT "PurchaseRequestLine_budgetLineId_fkey"
    FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderLine"
    ADD CONSTRAINT "PurchaseOrderLine_budgetLineId_fkey"
    FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApInvoiceLine"
    ADD CONSTRAINT "ApInvoiceLine_budgetLineId_fkey"
    FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
