-- Align the already-applied DEC-0050 approval-routing SQL representation with
-- Prisma's PostgreSQL DateTime and index definitions without changing meaning.
-- UTC conversion is explicit so timestamptz values do not depend on the
-- migration session timezone.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- PostgreSQL records an UPDATE OF dependency from this trigger to both routing
-- timestamps. The surrounding transaction and table lock keep the guard gap
-- unobservable; the exact trigger is restored and forced ALWAYS before commit.
DROP TRIGGER "ApprovalInstanceStep_routing_context_trg"
  ON "ApprovalInstanceStep";

DROP INDEX "ApprovalInstanceStep_routing_page_idx";
DROP INDEX "ApprovalInstanceStep_routing_due_page_idx";

ALTER TABLE "ApprovalInstanceStep"
  ALTER COLUMN "activatedAt" TYPE TIMESTAMP(3)
    USING ("activatedAt" AT TIME ZONE 'UTC'),
  ALTER COLUMN "dueAt" TYPE TIMESTAMP(3)
    USING ("dueAt" AT TIME ZONE 'UTC');

ALTER TABLE "ApprovalInstanceStepScopeGroup"
  ALTER COLUMN "createdAt" TYPE TIMESTAMP(3)
    USING ("createdAt" AT TIME ZONE 'UTC');

ALTER TABLE "ApprovalInstanceStepScopeTarget"
  ALTER COLUMN "createdAt" TYPE TIMESTAMP(3)
    USING ("createdAt" AT TIME ZONE 'UTC');

ALTER TABLE "ApprovalInstanceStepProhibitedActor"
  ALTER COLUMN "createdAt" TYPE TIMESTAMP(3)
    USING ("createdAt" AT TIME ZONE 'UTC');

CREATE INDEX "ApprovalInstanceStep_routing_page_idx"
  ON "ApprovalInstanceStep" ("routingSchemaVersion", status, "activatedAt", id);
CREATE INDEX "ApprovalInstanceStep_routing_due_page_idx"
  ON "ApprovalInstanceStep" ("routingSchemaVersion", status, "dueAt", "activatedAt", id);

CREATE TRIGGER "ApprovalInstanceStep_routing_context_trg"
BEFORE INSERT OR UPDATE OF "approvalInstanceId", "assignedUserId", "assignedRoleId", "delegatedFromUserId", status,
  "requiredPermissionId", "routingSchemaVersion", "scopeGroupMatchMode", "activatedAt", "dueAt"
ON "ApprovalInstanceStep"
FOR EACH ROW EXECUTE FUNCTION public.validate_approval_step_routing_context();

ALTER TABLE "ApprovalInstanceStep"
  ENABLE ALWAYS TRIGGER "ApprovalInstanceStep_routing_context_trg";

COMMIT;
