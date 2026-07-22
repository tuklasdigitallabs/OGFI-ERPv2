BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- The application backfill is idempotent, but database uniqueness is the
-- authoritative final guard against two workers recording competing
-- provenance for the same active approval instance.
CREATE UNIQUE INDEX "AuditEvent_approval_routing_backfill_key"
  ON "AuditEvent" ("tenantId", "entityType", "entityId", "eventType")
  WHERE "entityType" = 'ApprovalInstance'
    AND "eventType" = 'approval.step_routing_backfilled';

COMMIT;
