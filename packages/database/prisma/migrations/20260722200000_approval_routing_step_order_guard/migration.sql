BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE INDEX "ApprovalInstance_tenantId_companyId_status_idx"
ON "ApprovalInstance" ("tenantId", "companyId", status);

CREATE OR REPLACE FUNCTION public.reject_immutable_approval_step_order_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $guard$
BEGIN
  IF OLD."routingSchemaVersion" = 1
     AND NEW."stepOrder" IS DISTINCT FROM OLD."stepOrder" THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_CONTEXT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS "ApprovalInstanceStep_step_order_immutable_trg"
ON "ApprovalInstanceStep";

CREATE TRIGGER "ApprovalInstanceStep_step_order_immutable_trg"
BEFORE UPDATE OF "stepOrder" ON "ApprovalInstanceStep"
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_approval_step_order_mutation();

ALTER TABLE "ApprovalInstanceStep"
ENABLE ALWAYS TRIGGER "ApprovalInstanceStep_step_order_immutable_trg";

COMMIT;
