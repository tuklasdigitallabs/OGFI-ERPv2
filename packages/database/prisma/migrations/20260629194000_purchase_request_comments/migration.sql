-- Scoped operational comments for Purchase Requests.
CREATE TABLE "PurchaseRequestComment" (
    "id" UUID NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseRequestComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseRequestComment_tenantId_companyId_purchaseRequestId_createdAt_idx" ON "PurchaseRequestComment"("tenantId", "companyId", "purchaseRequestId", "createdAt");

ALTER TABLE "PurchaseRequestComment" ADD CONSTRAINT "PurchaseRequestComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequestComment" ADD CONSTRAINT "PurchaseRequestComment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequestComment" ADD CONSTRAINT "PurchaseRequestComment_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequestComment" ADD CONSTRAINT "PurchaseRequestComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
