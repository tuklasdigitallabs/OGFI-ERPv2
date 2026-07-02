ALTER TABLE "WastageReport"
  DROP CONSTRAINT IF EXISTS "WastageReport_status_check";

ALTER TABLE "WastageReport"
  ADD CONSTRAINT "WastageReport_status_check"
  CHECK ("status" IN (
    'DRAFT',
    'SUBMITTED',
    'PENDING_APPROVAL',
    'APPROVED',
    'REVIEWED',
    'RETURNED',
    'REJECTED',
    'CANCELLED'
  ));
