BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Permission"
    WHERE "id" = '00000000-0000-4000-8000-000000000994'
      AND "code" <> 'purchasing.supplier_confidential.view'
  ) THEN
    RAISE EXCEPTION 'Reserved supplier-confidential permission id is already in use';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Permission"
    WHERE "code" = 'purchasing.supplier_confidential.view'
      AND (
        "id" <> '00000000-0000-4000-8000-000000000994'
        OR "tenantId" IS NOT NULL
        OR "module" <> 'purchasing'
        OR "action" <> 'supplier_confidential.view'
      )
  ) THEN
    RAISE EXCEPTION 'Existing supplier-confidential permission metadata does not match the reviewed registry row';
  END IF;
END $$;

INSERT INTO "Permission" ("id", "code", "module", "action", "description")
VALUES (
  '00000000-0000-4000-8000-000000000994',
  'purchasing.supplier_confidential.view',
  'purchasing',
  'supplier_confidential.view',
  'View and maintain supplier payment terms and reference prices within an authorized company scope.'
)
ON CONFLICT ("code") DO NOTHING;

COMMIT;
