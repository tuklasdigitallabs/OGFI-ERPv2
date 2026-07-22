BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_status_check_v2"
  CHECK ("status" IN (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'ISSUED',
    'AMENDMENT_PENDING',
    'PARTIALLY_RECEIVED',
    'FULLY_RECEIVED',
    'CANCELLED',
    'CLOSED'
  )) NOT VALID;

ALTER TABLE "PurchaseOrder"
  VALIDATE CONSTRAINT "PurchaseOrder_status_check_v2";

ALTER TABLE "PurchaseOrder"
  DROP CONSTRAINT "PurchaseOrder_status_check";

ALTER TABLE "PurchaseOrder"
  RENAME CONSTRAINT "PurchaseOrder_status_check_v2"
  TO "PurchaseOrder_status_check";

COMMIT;
