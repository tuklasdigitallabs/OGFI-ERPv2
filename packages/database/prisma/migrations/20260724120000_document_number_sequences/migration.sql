CREATE TABLE "DocumentNumberSequence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "documentType" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentNumberSequence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentNumberSequence_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "DocumentNumberSequence_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "DocumentNumberSequence_nextValue_check" CHECK ("nextValue" > 0)
);

CREATE UNIQUE INDEX "DocumentNumberSequence_company_document_year_key"
  ON "DocumentNumberSequence"("companyId", "documentType", "year");
CREATE INDEX "DocumentNumberSequence_tenant_company_type_idx"
  ON "DocumentNumberSequence"("tenantId", "companyId", "documentType");

INSERT INTO "DocumentNumberSequence" ("tenantId", "companyId", "documentType", "year", "nextValue")
SELECT
  gr."tenantId",
  gr."companyId",
  'GOODS_RECEIPT',
  substring(gr."publicReference" FROM '^RR-([0-9]{4})-')::integer,
  MAX(substring(gr."publicReference" FROM '^RR-[0-9]{4}-([0-9]+)$')::integer) + 1
FROM "GoodsReceipt" gr
WHERE gr."publicReference" ~ '^RR-[0-9]{4}-[0-9]+$'
GROUP BY gr."tenantId", gr."companyId", substring(gr."publicReference" FROM '^RR-([0-9]{4})-')
ON CONFLICT ("companyId", "documentType", "year")
DO UPDATE SET "nextValue" = GREATEST("DocumentNumberSequence"."nextValue", EXCLUDED."nextValue"),
              "updatedAt" = CURRENT_TIMESTAMP;
