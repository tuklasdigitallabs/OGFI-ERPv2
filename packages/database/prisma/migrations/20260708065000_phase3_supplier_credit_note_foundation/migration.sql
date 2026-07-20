CREATE TYPE "SupplierCreditNoteStatus" AS ENUM (
  'DRAFT',
  'PENDING_APPLICATION',
  'APPLIED',
  'CANCELLED',
  'VOIDED'
);

CREATE TABLE "SupplierCreditNote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "originalApInvoiceId" UUID NOT NULL,
  "publicReference" TEXT NOT NULL,
  "supplierCreditNoteNumber" TEXT NOT NULL,
  "creditDate" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3),
  "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
  "creditAmount" DECIMAL(18,6) NOT NULL,
  "status" "SupplierCreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
  "reasonCode" TEXT NOT NULL,
  "reasonDescription" TEXT NOT NULL,
  "evidenceReference" TEXT,
  "applicationNotes" TEXT,
  "idempotencyKey" TEXT,
  "createdByUserId" UUID NOT NULL,
  "cancelledByUserId" UUID,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupplierCreditNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierCreditNote_tenantId_companyId_publicReference_key"
  ON "SupplierCreditNote"("tenantId", "companyId", "publicReference");
CREATE UNIQUE INDEX "SupplierCreditNote_tenantId_companyId_supplierId_supplierCreditNoteNumber_key"
  ON "SupplierCreditNote"("tenantId", "companyId", "supplierId", "supplierCreditNoteNumber");
CREATE UNIQUE INDEX "SupplierCreditNote_tenantId_companyId_idempotencyKey_key"
  ON "SupplierCreditNote"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "SupplierCreditNote_tenantId_companyId_status_idx"
  ON "SupplierCreditNote"("tenantId", "companyId", "status");
CREATE INDEX "SupplierCreditNote_tenantId_companyId_supplierId_status_idx"
  ON "SupplierCreditNote"("tenantId", "companyId", "supplierId", "status");
CREATE INDEX "SupplierCreditNote_tenantId_companyId_originalApInvoiceId_idx"
  ON "SupplierCreditNote"("tenantId", "companyId", "originalApInvoiceId");

ALTER TABLE "SupplierCreditNote"
  ADD CONSTRAINT "SupplierCreditNote_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote"
  ADD CONSTRAINT "SupplierCreditNote_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote"
  ADD CONSTRAINT "SupplierCreditNote_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote"
  ADD CONSTRAINT "SupplierCreditNote_originalApInvoiceId_fkey"
  FOREIGN KEY ("originalApInvoiceId") REFERENCES "ApInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote"
  ADD CONSTRAINT "SupplierCreditNote_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditNote"
  ADD CONSTRAINT "SupplierCreditNote_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  (gen_random_uuid(), 'finance.supplier_credit.create', 'finance', 'supplier_credit.create'),
  (gen_random_uuid(), 'finance.supplier_credit.cancel', 'finance', 'supplier_credit.cancel')
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON (
    r."code" = 'CONFIGURED_ADMIN'
    AND p."code" IN (
      'finance.supplier_credit.create',
      'finance.supplier_credit.cancel'
    )
  )
  OR (
    r."code" = 'CONFIGURED_REQUESTER'
    AND p."code" IN ('finance.supplier_credit.create')
  )
  OR (
    r."code" = 'CONFIGURED_APPROVER'
    AND p."code" IN ('finance.supplier_credit.cancel')
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
