BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Permission" WHERE code = 'inventory.receiving.cancel'
    AND ("tenantId" IS NOT NULL OR module <> 'inventory' OR action <> 'receiving.cancel')) THEN
    RAISE EXCEPTION 'Receiving cancellation permission metadata conflicts with the global registry';
  END IF;
END $$;

-- Permission registration only: no role receives cancellation authority automatically.
INSERT INTO "Permission" ("id", "code", "module", "action", "description")
VALUES (gen_random_uuid(), 'inventory.receiving.cancel', 'inventory', 'receiving.cancel',
        'Cancel an unposted draft receiving report with an audited reason.')
ON CONFLICT ("code") DO NOTHING;

-- Existing valid products are unchanged; no immutable line or canonical bytes are rewritten.
ALTER TABLE "OpeningInventoryCutoverLine" DROP CONSTRAINT "OpeningInventoryCutoverLine_identity_check";
ALTER TABLE "OpeningInventoryCutoverLine" ADD CONSTRAINT "OpeningInventoryCutoverLine_identity_check" CHECK (
  "lineNumber" > 0 AND length(BTRIM("lotKey")) > 0 AND "lineDigest" ~ '^[a-f0-9]{64}$' AND NULLIF(BTRIM("lineCanonicalJson"), '') IS NOT NULL
  AND "sourceCountedQuantityBaseUom" >= 0 AND "openingQuantityBaseUom" >= 0 AND "unitCost" >= 0 AND "openingValue" >= 0
  AND "openingQuantityBaseUom" = "sourceCountedQuantityBaseUom"
  AND "sourceVarianceQuantityBaseUom" = "sourceCountedQuantityBaseUom" - "sourceSystemQuantityBaseUom"
  AND "openingValue" = round("openingQuantityBaseUom" * "unitCost", 6)
);
-- Rollback: revoke explicit cancellation grants and disable the action; preserve audit records.
-- Restore the prior product CHECK only if no rounded products differ from their exact product.
-- Once fractional rows exist, retain this constraint during app rollback; never rewrite history.
COMMIT;
