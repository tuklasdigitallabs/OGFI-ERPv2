-- Controlled operational reason codes for dropdown-backed workflow classification.
-- Additive only: existing operational records keep their string reasonCode values.

CREATE TABLE "OperationalReasonCode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "workflow" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "appliesTo" TEXT,
  "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalReasonCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationalReasonCode_workflow_check"
    CHECK ("workflow" IN (
      'WASTAGE',
      'STOCK_ADJUSTMENT',
      'RECEIVING_DISCREPANCY',
      'TRANSFER_DISCREPANCY',
      'STOCK_COUNT_VARIANCE',
      'PURCHASE_ORDER_CANCELLATION',
      'PURCHASE_ORDER_CLOSURE',
      'REVERSAL',
      'MASTER_DATA_CHANGE'
    )),
  CONSTRAINT "OperationalReasonCode_code_format_check"
    CHECK ("code" = upper("code") AND "code" ~ '^[A-Z0-9_]+$'),
  CONSTRAINT "OperationalReasonCode_sort_order_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "OperationalReasonCode_companyId_workflow_code_key"
  ON "OperationalReasonCode"("companyId", "workflow", "code");

CREATE INDEX "OperationalReasonCode_tenantId_companyId_workflow_status_sortOrder_idx"
  ON "OperationalReasonCode"("tenantId", "companyId", "workflow", "status", "sortOrder");

CREATE INDEX "OperationalReasonCode_tenantId_companyId_workflow_appliesTo_status_idx"
  ON "OperationalReasonCode"("tenantId", "companyId", "workflow", "appliesTo", "status");

ALTER TABLE "OperationalReasonCode"
  ADD CONSTRAINT "OperationalReasonCode_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OperationalReasonCode_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "OperationalReasonCode" (
  "tenantId",
  "companyId",
  "workflow",
  "code",
  "label",
  "appliesTo",
  "requiresEvidence",
  "sortOrder",
  "notes"
)
SELECT
  c."tenantId",
  c."id",
  v."workflow",
  v."code",
  v."label",
  v."appliesTo",
  v."requiresEvidence",
  v."sortOrder",
  'Seeded baseline reason code'
FROM "Company" c
CROSS JOIN (
  VALUES
    ('WASTAGE', 'EXPIRED', 'Expired item', 'SPOILAGE_EXPIRY', true, 10),
    ('WASTAGE', 'DAMAGED', 'Damaged stock', 'DAMAGE', true, 20),
    ('WASTAGE', 'QUALITY_REJECT', 'Quality rejection', 'RECEIVING_QUALITY', true, 30),
    ('WASTAGE', 'PREPARATION_LOSS', 'Preparation loss', 'PREPARATION_LOSS', false, 40),
    ('WASTAGE', 'AUTHORIZED_CONSUMPTION', 'Authorized consumption', 'AUTHORIZED_CONSUMPTION', false, 50),
    ('WASTAGE', 'CUSTOMER_SERVICE', 'Customer service recovery', 'CUSTOMER_SERVICE', false, 60),
    ('WASTAGE', 'OPERATIONAL_LOSS', 'Operational loss', 'OPERATIONAL', false, 70),
    ('WASTAGE', 'OTHER_APPROVED_LOSS', 'Other approved loss', 'OTHER', true, 90),
    ('STOCK_ADJUSTMENT', 'OPENING_BALANCE', 'Opening balance baseline', 'OPENING_BALANCE', true, 10),
    ('STOCK_ADJUSTMENT', 'SYSTEM_CORRECTION', 'System correction', 'INCREASE', true, 20),
    ('STOCK_ADJUSTMENT', 'SYSTEM_CORRECTION_DECREASE', 'System correction decrease', 'DECREASE', true, 30),
    ('STOCK_ADJUSTMENT', 'COUNT_CORRECTION', 'Physical count correction', 'INCREASE', true, 40),
    ('STOCK_ADJUSTMENT', 'COUNT_CORRECTION_DECREASE', 'Physical count correction decrease', 'DECREASE', true, 50),
    ('STOCK_ADJUSTMENT', 'UOM_CONVERSION_FIX', 'UOM conversion correction', null, true, 60),
    ('STOCK_ADJUSTMENT', 'LOT_EXPIRY_CORRECTION', 'Lot or expiry correction', null, true, 70)
) AS v("workflow", "code", "label", "appliesTo", "requiresEvidence", "sortOrder")
ON CONFLICT ("companyId", "workflow", "code") DO NOTHING;

INSERT INTO "OperationalReasonCode" (
  "tenantId",
  "companyId",
  "workflow",
  "code",
  "label",
  "appliesTo",
  "requiresEvidence",
  "sortOrder",
  "notes"
)
SELECT DISTINCT
  wr."tenantId",
  wr."companyId",
  'WASTAGE',
  upper(regexp_replace(trim(wr."reasonCode"), '[^A-Za-z0-9]+', '_', 'g')),
  trim(wr."reasonCode"),
  null,
  false,
  900,
  'Backfilled from existing wastage records'
FROM "WastageReport" wr
WHERE wr."reasonCode" IS NOT NULL
  AND trim(wr."reasonCode") <> ''
  AND upper(regexp_replace(trim(wr."reasonCode"), '[^A-Za-z0-9]+', '_', 'g')) ~ '^[A-Z0-9_]+$'
ON CONFLICT ("companyId", "workflow", "code") DO NOTHING;

INSERT INTO "OperationalReasonCode" (
  "tenantId",
  "companyId",
  "workflow",
  "code",
  "label",
  "appliesTo",
  "requiresEvidence",
  "sortOrder",
  "notes"
)
SELECT DISTINCT
  sa."tenantId",
  sa."companyId",
  'STOCK_ADJUSTMENT',
  upper(regexp_replace(trim(sa."reasonCode"), '[^A-Za-z0-9]+', '_', 'g')),
  trim(sa."reasonCode"),
  null,
  false,
  900,
  'Backfilled from existing stock adjustment records'
FROM "StockAdjustment" sa
WHERE sa."reasonCode" IS NOT NULL
  AND trim(sa."reasonCode") <> ''
  AND upper(regexp_replace(trim(sa."reasonCode"), '[^A-Za-z0-9]+', '_', 'g')) ~ '^[A-Z0-9_]+$'
ON CONFLICT ("companyId", "workflow", "code") DO NOTHING;
