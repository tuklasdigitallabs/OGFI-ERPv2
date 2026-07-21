BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.reject_protected_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format(
      '%s is append-only; %s is prohibited',
      TG_TABLE_NAME,
      TG_OP
    );
END;
$$;

CREATE TRIGGER "AuditEvent_append_only_guard_trg"
BEFORE UPDATE OR DELETE OR TRUNCATE ON public."AuditEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION public.reject_protected_history_mutation();

ALTER TABLE public."AuditEvent"
  ENABLE ALWAYS TRIGGER "AuditEvent_append_only_guard_trg";

CREATE TRIGGER "ProjectActivityEvent_append_only_guard_trg"
BEFORE UPDATE OR DELETE OR TRUNCATE ON public."ProjectActivityEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION public.reject_protected_history_mutation();

ALTER TABLE public."ProjectActivityEvent"
  ENABLE ALWAYS TRIGGER "ProjectActivityEvent_append_only_guard_trg";

CREATE TRIGGER "InventoryMovement_append_only_guard_trg"
BEFORE UPDATE OR DELETE OR TRUNCATE ON public."InventoryMovement"
FOR EACH STATEMENT
EXECUTE FUNCTION public.reject_protected_history_mutation();

ALTER TABLE public."InventoryMovement"
  ENABLE ALWAYS TRIGGER "InventoryMovement_append_only_guard_trg";

COMMIT;
