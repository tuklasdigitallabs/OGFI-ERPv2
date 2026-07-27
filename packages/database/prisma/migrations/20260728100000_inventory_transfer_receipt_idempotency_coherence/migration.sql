BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Preserve legacy NULL/NULL rows while rejecting partial or malformed replay identity.
ALTER TABLE "InventoryTransferReceipt"
  ADD CONSTRAINT "InventoryTransferReceipt_idempotency_pair_check"
  CHECK (
    ("idempotencyKey" IS NULL AND "idempotencyRequestHash" IS NULL)
    OR (
      "idempotencyKey" IS NOT NULL
      AND "idempotencyRequestHash" IS NOT NULL
      AND btrim("idempotencyRequestHash"::text) ~ '^[0-9a-f]{64}$'
    )
  ) NOT VALID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "InventoryTransferReceipt"
    WHERE ("idempotencyKey" IS NULL) <> ("idempotencyRequestHash" IS NULL)
       OR (
         "idempotencyRequestHash" IS NOT NULL
         AND btrim("idempotencyRequestHash"::text) !~ '^[0-9a-f]{64}$'
       )
  ) THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_RECEIPT_IDEMPOTENCY_PAIR_PREFLIGHT_FAILED';
  END IF;
END $$;

ALTER TABLE "InventoryTransferReceipt"
  VALIDATE CONSTRAINT "InventoryTransferReceipt_idempotency_pair_check";

COMMIT;
