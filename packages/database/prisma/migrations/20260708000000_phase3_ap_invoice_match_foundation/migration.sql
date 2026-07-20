CREATE TYPE "ApInvoiceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'MATCH_PENDING', 'MATCHED', 'MATCHED_WITHIN_TOLERANCE', 'ON_HOLD', 'DISPUTED', 'APPROVED_EXCEPTION', 'PAYMENT_READY', 'REJECTED', 'CANCELLED', 'REVERSED');
CREATE TYPE "ApMatchStatus" AS ENUM ('NOT_EVALUATED', 'EXACT_MATCH', 'WITHIN_TOLERANCE', 'VARIANCE_HOLD', 'DISPUTED', 'APPROVED_EXCEPTION');
CREATE TYPE "ApExceptionStatus" AS ENUM ('OPEN', 'DISPUTED', 'APPROVED', 'REJECTED', 'RESOLVED', 'CANCELLED');
CREATE TYPE "ApDuplicateRisk" AS ENUM ('CLEAN', 'POTENTIAL', 'BLOCKED', 'ALLOWED_BY_EXCEPTION');
CREATE TYPE "ApDuplicateSignalType" AS ENUM ('SAME_SUPPLIER_AND_INVOICE_NUMBER', 'SAME_SUPPLIER_NUMBER_DATE_TOTAL', 'SAME_DOCUMENT_HASH');

CREATE TABLE "ApInvoice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "goodsReceiptId" UUID,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "supplierInvoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paymentTermsDays" INTEGER,
    "subtotalAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "freightAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "ApInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "matchStatus" "ApMatchStatus" NOT NULL DEFAULT 'NOT_EVALUATED',
    "duplicateRisk" "ApDuplicateRisk" NOT NULL DEFAULT 'CLEAN',
    "captureIdempotencyKey" TEXT,
    "duplicateFingerprint" TEXT,
    "holdReason" TEXT,
    "nonPoReason" TEXT,
    "evidenceReference" TEXT,
    "createdByUserId" UUID NOT NULL,
    "submittedByUserId" UUID,
    "reviewedByUserId" UUID,
    "cancelledByUserId" UUID,
    "reversedByUserId" UUID,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApInvoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApInvoice_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "ApInvoice_amounts_nonnegative_check" CHECK ("subtotalAmount" >= 0 AND "taxAmount" >= 0 AND "discountAmount" >= 0 AND "freightAmount" >= 0 AND "totalAmount" >= 0),
    CONSTRAINT "ApInvoice_invoice_number_required_check" CHECK (length(trim("supplierInvoiceNumber")) > 0),
    CONSTRAINT "ApInvoice_non_po_reason_check" CHECK ("purchaseOrderId" IS NOT NULL OR "nonPoReason" IS NOT NULL)
);

CREATE TABLE "ApInvoiceLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "apInvoiceId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "purchaseOrderLineId" UUID,
    "goodsReceiptLineId" UUID,
    "itemId" UUID,
    "uomId" UUID,
    "description" TEXT NOT NULL,
    "invoicedQty" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "taxAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lineTotalAmount" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApInvoiceLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApInvoiceLine_line_number_check" CHECK ("lineNumber" >= 1),
    CONSTRAINT "ApInvoiceLine_qty_positive_check" CHECK ("invoicedQty" > 0),
    CONSTRAINT "ApInvoiceLine_unit_price_nonnegative_check" CHECK ("unitPrice" >= 0),
    CONSTRAINT "ApInvoiceLine_amounts_nonnegative_check" CHECK ("taxAmount" >= 0 AND "discountAmount" >= 0 AND "lineTotalAmount" >= 0)
);

CREATE TABLE "ApInvoiceMatchResult" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "apInvoiceId" UUID NOT NULL,
    "apInvoiceLineId" UUID,
    "purchaseOrderLineId" UUID,
    "goodsReceiptLineId" UUID,
    "matchSource" TEXT NOT NULL DEFAULT 'PO_AND_RECEIPT',
    "poQtyAtMatch" DECIMAL(18,6),
    "receivedQtyToMatch" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "invoicedQty" DECIMAL(18,6) NOT NULL,
    "poUnitPrice" DECIMAL(18,6),
    "invoicedUnitPrice" DECIMAL(18,6) NOT NULL,
    "poLineTotal" DECIMAL(18,6),
    "invoicedLineTotal" DECIMAL(18,6) NOT NULL,
    "qtyVariance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "amountVariance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "taxVarianceAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "toleranceConfig" JSONB,
    "status" "ApMatchStatus" NOT NULL DEFAULT 'NOT_EVALUATED',
    "exceptionCode" TEXT,
    "exceptionNotes" TEXT,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApInvoiceMatchResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApInvoiceMatchResult_qty_nonnegative_check" CHECK ("receivedQtyToMatch" >= 0 AND "invoicedQty" > 0),
    CONSTRAINT "ApInvoiceMatchResult_amounts_nonnegative_check" CHECK ("invoicedUnitPrice" >= 0 AND "invoicedLineTotal" >= 0),
    CONSTRAINT "ApInvoiceMatchResult_source_check" CHECK ("matchSource" <> 'PO_AND_RECEIPT' OR ("purchaseOrderLineId" IS NOT NULL AND "goodsReceiptLineId" IS NOT NULL))
);

CREATE TABLE "ApInvoiceException" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "apInvoiceId" UUID NOT NULL,
    "matchResultId" UUID,
    "exceptionCode" TEXT NOT NULL,
    "exceptionType" TEXT NOT NULL,
    "status" "ApExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'NORMAL',
    "ownerUserId" UUID,
    "dueAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "evidenceReference" TEXT,
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApInvoiceException_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApInvoiceException_reason_required_check" CHECK (length(trim("reason")) > 0)
);

CREATE TABLE "ApInvoiceDuplicateSignal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "apInvoiceId" UUID NOT NULL,
    "candidateInvoiceId" UUID,
    "signalType" "ApDuplicateSignalType" NOT NULL,
    "risk" "ApDuplicateRisk" NOT NULL,
    "duplicateKey" TEXT,
    "matchedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "matchedDate" TIMESTAMP(3),
    "duplicateSnapshot" JSONB,
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApInvoiceDuplicateSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApInvoice_companyId_publicReference_key" ON "ApInvoice"("companyId", "publicReference");
CREATE UNIQUE INDEX "ApInvoice_tenantId_companyId_supplierId_supplierInvoiceNumber_key" ON "ApInvoice"("tenantId", "companyId", "supplierId", "supplierInvoiceNumber");
CREATE UNIQUE INDEX "ApInvoice_tenantId_companyId_captureIdempotencyKey_key" ON "ApInvoice"("tenantId", "companyId", "captureIdempotencyKey");
CREATE INDEX "ApInvoice_tenantId_companyId_status_matchStatus_idx" ON "ApInvoice"("tenantId", "companyId", "status", "matchStatus");
CREATE INDEX "ApInvoice_tenantId_companyId_supplierId_invoiceDate_idx" ON "ApInvoice"("tenantId", "companyId", "supplierId", "invoiceDate");
CREATE INDEX "ApInvoice_tenantId_companyId_duplicateRisk_matchStatus_idx" ON "ApInvoice"("tenantId", "companyId", "duplicateRisk", "matchStatus");
CREATE INDEX "ApInvoice_purchaseOrderId_idx" ON "ApInvoice"("purchaseOrderId");
CREATE INDEX "ApInvoice_goodsReceiptId_idx" ON "ApInvoice"("goodsReceiptId");

CREATE UNIQUE INDEX "ApInvoiceLine_apInvoiceId_lineNumber_key" ON "ApInvoiceLine"("apInvoiceId", "lineNumber");
CREATE INDEX "ApInvoiceLine_tenantId_companyId_apInvoiceId_idx" ON "ApInvoiceLine"("tenantId", "companyId", "apInvoiceId");
CREATE INDEX "ApInvoiceLine_tenantId_companyId_purchaseOrderLineId_idx" ON "ApInvoiceLine"("tenantId", "companyId", "purchaseOrderLineId");
CREATE INDEX "ApInvoiceLine_tenantId_companyId_goodsReceiptLineId_idx" ON "ApInvoiceLine"("tenantId", "companyId", "goodsReceiptLineId");

CREATE INDEX "ApInvoiceMatchResult_tenantId_companyId_status_idx" ON "ApInvoiceMatchResult"("tenantId", "companyId", "status");
CREATE INDEX "ApInvoiceMatchResult_tenantId_companyId_apInvoiceId_idx" ON "ApInvoiceMatchResult"("tenantId", "companyId", "apInvoiceId");
CREATE INDEX "ApInvoiceMatchResult_tenantId_companyId_purchaseOrderLineId_idx" ON "ApInvoiceMatchResult"("tenantId", "companyId", "purchaseOrderLineId");
CREATE INDEX "ApInvoiceMatchResult_tenantId_companyId_goodsReceiptLineId_idx" ON "ApInvoiceMatchResult"("tenantId", "companyId", "goodsReceiptLineId");

CREATE INDEX "ApInvoiceException_tenantId_companyId_status_severity_idx" ON "ApInvoiceException"("tenantId", "companyId", "status", "severity");
CREATE INDEX "ApInvoiceException_tenantId_companyId_apInvoiceId_idx" ON "ApInvoiceException"("tenantId", "companyId", "apInvoiceId");
CREATE INDEX "ApInvoiceException_ownerUserId_status_idx" ON "ApInvoiceException"("ownerUserId", "status");

CREATE UNIQUE INDEX "ApInvoiceDuplicateSignal_apInvoiceId_signalType_key" ON "ApInvoiceDuplicateSignal"("apInvoiceId", "signalType");
CREATE INDEX "ApInvoiceDuplicateSignal_tenantId_companyId_risk_createdAt_idx" ON "ApInvoiceDuplicateSignal"("tenantId", "companyId", "risk", "createdAt");
CREATE INDEX "ApInvoiceDuplicateSignal_tenantId_companyId_signalType_risk_idx" ON "ApInvoiceDuplicateSignal"("tenantId", "companyId", "signalType", "risk");

ALTER TABLE "ApInvoice" ADD CONSTRAINT "ApInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoice" ADD CONSTRAINT "ApInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoice" ADD CONSTRAINT "ApInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoice" ADD CONSTRAINT "ApInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApInvoice" ADD CONSTRAINT "ApInvoice_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApInvoiceLine" ADD CONSTRAINT "ApInvoiceLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceLine" ADD CONSTRAINT "ApInvoiceLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceLine" ADD CONSTRAINT "ApInvoiceLine_apInvoiceId_fkey" FOREIGN KEY ("apInvoiceId") REFERENCES "ApInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceLine" ADD CONSTRAINT "ApInvoiceLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceLine" ADD CONSTRAINT "ApInvoiceLine_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApInvoiceMatchResult" ADD CONSTRAINT "ApInvoiceMatchResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceMatchResult" ADD CONSTRAINT "ApInvoiceMatchResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceMatchResult" ADD CONSTRAINT "ApInvoiceMatchResult_apInvoiceId_fkey" FOREIGN KEY ("apInvoiceId") REFERENCES "ApInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceMatchResult" ADD CONSTRAINT "ApInvoiceMatchResult_apInvoiceLineId_fkey" FOREIGN KEY ("apInvoiceLineId") REFERENCES "ApInvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceMatchResult" ADD CONSTRAINT "ApInvoiceMatchResult_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceMatchResult" ADD CONSTRAINT "ApInvoiceMatchResult_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApInvoiceException" ADD CONSTRAINT "ApInvoiceException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceException" ADD CONSTRAINT "ApInvoiceException_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceException" ADD CONSTRAINT "ApInvoiceException_apInvoiceId_fkey" FOREIGN KEY ("apInvoiceId") REFERENCES "ApInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApInvoiceDuplicateSignal" ADD CONSTRAINT "ApInvoiceDuplicateSignal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceDuplicateSignal" ADD CONSTRAINT "ApInvoiceDuplicateSignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceDuplicateSignal" ADD CONSTRAINT "ApInvoiceDuplicateSignal_apInvoiceId_fkey" FOREIGN KEY ("apInvoiceId") REFERENCES "ApInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApInvoiceDuplicateSignal" ADD CONSTRAINT "ApInvoiceDuplicateSignal_candidateInvoiceId_fkey" FOREIGN KEY ("candidateInvoiceId") REFERENCES "ApInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  ('00000000-0000-4000-8000-000000000140', 'finance.ap_invoice.create', 'finance', 'ap_invoice.create'),
  ('00000000-0000-4000-8000-000000000141', 'finance.ap_invoice.submit', 'finance', 'ap_invoice.submit'),
  ('00000000-0000-4000-8000-000000000142', 'finance.ap_invoice.match', 'finance', 'ap_invoice.match'),
  ('00000000-0000-4000-8000-000000000143', 'finance.ap_invoice.review_exception', 'finance', 'ap_invoice.review_exception'),
  ('00000000-0000-4000-8000-000000000144', 'finance.ap_invoice.cancel', 'finance', 'ap_invoice.cancel')
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
      'finance.ap_invoice.create',
      'finance.ap_invoice.submit',
      'finance.ap_invoice.match',
      'finance.ap_invoice.review_exception',
      'finance.ap_invoice.cancel'
    )
  )
  OR (
    r."code" = 'CONFIGURED_APPROVER'
    AND p."code" IN (
      'finance.ap_invoice.match',
      'finance.ap_invoice.review_exception'
    )
  )
  OR (
    r."code" = 'CONFIGURED_REQUESTER'
    AND p."code" IN (
      'finance.ap_invoice.create',
      'finance.ap_invoice.submit'
    )
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
