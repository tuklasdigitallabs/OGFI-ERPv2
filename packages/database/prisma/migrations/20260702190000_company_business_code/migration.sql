ALTER TABLE "Company" ADD COLUMN "code" TEXT;

WITH ranked_companies AS (
  SELECT
    id,
    upper(
      regexp_replace(
        regexp_replace(coalesce("tradingName", "legalName", 'COMPANY'), '[^A-Za-z0-9]+', '-', 'g'),
        '(^-|-$)',
        '',
        'g'
      )
    ) AS base_code,
    row_number() OVER (
      PARTITION BY "tenantId",
      upper(
        regexp_replace(
          regexp_replace(coalesce("tradingName", "legalName", 'COMPANY'), '[^A-Za-z0-9]+', '-', 'g'),
          '(^-|-$)',
          '',
          'g'
        )
      )
      ORDER BY "createdAt", id
    ) AS duplicate_rank
  FROM "Company"
)
UPDATE "Company" c
SET "code" = CASE
  WHEN rc.base_code = '' THEN 'COMPANY-' || rc.duplicate_rank::text
  WHEN rc.duplicate_rank = 1 THEN rc.base_code
  ELSE rc.base_code || '-' || rc.duplicate_rank::text
END
FROM ranked_companies rc
WHERE c.id = rc.id;

ALTER TABLE "Company" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "Company_tenantId_code_key" ON "Company"("tenantId", "code");
