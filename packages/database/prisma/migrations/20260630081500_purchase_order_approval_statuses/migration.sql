ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_status_check";

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_status_check"
  CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'CANCELLED'));
