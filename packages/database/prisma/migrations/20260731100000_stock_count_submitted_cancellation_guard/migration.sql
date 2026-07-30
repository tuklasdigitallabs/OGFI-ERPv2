-- A submitted count may be cancelled only through the controlled workflow that
-- atomically terminates its pending approval graph and mirrors the terminal
-- state to the current immutable attempt. Count evidence remains immutable.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE OR REPLACE FUNCTION "guard_stock_count_attempt_history"()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stock count attempt history is immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = 'SUBMITTED'
     AND NEW."status" IN ('REVIEWED', 'RECOUNT_REQUESTED')
     AND NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."stockCountSessionId" IS NOT DISTINCT FROM OLD."stockCountSessionId"
     AND NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId"
     AND NEW."companyId" IS NOT DISTINCT FROM OLD."companyId"
     AND NEW."inventoryLocationId" IS NOT DISTINCT FROM OLD."inventoryLocationId"
     AND NEW."attemptNumber" IS NOT DISTINCT FROM OLD."attemptNumber"
     AND NEW."blindCount" IS NOT DISTINCT FROM OLD."blindCount"
     AND NEW."freezeMovements" IS NOT DISTINCT FROM OLD."freezeMovements"
     AND NEW."cutoffAt" IS NOT DISTINCT FROM OLD."cutoffAt"
     AND NEW."startedAt" IS NOT DISTINCT FROM OLD."startedAt"
     AND NEW."submittedAt" IS NOT DISTINCT FROM OLD."submittedAt"
     AND NEW."cancelledAt" IS NOT DISTINCT FROM OLD."cancelledAt"
     AND NEW."cancellationReason" IS NOT DISTINCT FROM OLD."cancellationReason"
     AND NEW."reason" IS NOT DISTINCT FROM OLD."reason"
     AND NEW."evidenceReference" IS NOT DISTINCT FROM OLD."evidenceReference"
     AND NEW."createdByUserId" IS NOT DISTINCT FROM OLD."createdByUserId"
     AND NEW."assignedToUserId" IS NOT DISTINCT FROM OLD."assignedToUserId"
     AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
     AND NEW."version" = OLD."version" + 1
     THEN RETURN NEW;
  END IF;

  IF OLD."status" = 'SUBMITTED'
     AND NEW."status" = 'CANCELLED'
     AND OLD."cancelledAt" IS NULL
     AND OLD."cancellationReason" IS NULL
     AND NEW."cancelledAt" IS NOT NULL
     AND NULLIF(BTRIM(NEW."cancellationReason"), '') IS NOT NULL
     AND NEW."updatedAt" >= OLD."updatedAt"
     AND NEW."version" = OLD."version" + 1
     AND NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."stockCountSessionId" IS NOT DISTINCT FROM OLD."stockCountSessionId"
     AND NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId"
     AND NEW."companyId" IS NOT DISTINCT FROM OLD."companyId"
     AND NEW."inventoryLocationId" IS NOT DISTINCT FROM OLD."inventoryLocationId"
     AND NEW."attemptNumber" IS NOT DISTINCT FROM OLD."attemptNumber"
     AND NEW."blindCount" IS NOT DISTINCT FROM OLD."blindCount"
     AND NEW."freezeMovements" IS NOT DISTINCT FROM OLD."freezeMovements"
     AND NEW."cutoffAt" IS NOT DISTINCT FROM OLD."cutoffAt"
     AND NEW."startedAt" IS NOT DISTINCT FROM OLD."startedAt"
     AND NEW."submittedAt" IS NOT DISTINCT FROM OLD."submittedAt"
     AND NEW."reviewedAt" IS NOT DISTINCT FROM OLD."reviewedAt"
     AND NEW."reviewNotes" IS NOT DISTINCT FROM OLD."reviewNotes"
     AND NEW."reason" IS NOT DISTINCT FROM OLD."reason"
     AND NEW."evidenceReference" IS NOT DISTINCT FROM OLD."evidenceReference"
     AND NEW."createdByUserId" IS NOT DISTINCT FROM OLD."createdByUserId"
     AND NEW."assignedToUserId" IS NOT DISTINCT FROM OLD."assignedToUserId"
     AND NEW."reviewedByUserId" IS NOT DISTINCT FROM OLD."reviewedByUserId"
     AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
     THEN RETURN NEW;
  END IF;

  IF OLD."status" IN ('SUBMITTED', 'RECOUNT_REQUESTED', 'REVIEWED', 'CANCELLED', 'VOIDED_FOR_RECOUNT')
     AND (NEW.* IS DISTINCT FROM OLD.*) THEN
    RAISE EXCEPTION 'Terminal stock count attempt evidence is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
