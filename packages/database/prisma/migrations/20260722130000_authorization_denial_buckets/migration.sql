BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TYPE "AuthorizationDenialSubjectType" AS ENUM (
  'ACTOR', 'ANONYMOUS', 'UNRESOLVED_IDENTITY', 'SYSTEM'
);
CREATE TYPE "AuthorizationDenialAction" AS ENUM (
  'READ', 'CREATE', 'UPDATE', 'DELETE', 'SUBMIT', 'APPROVE', 'POST',
  'EXPORT', 'ADMINISTER', 'AUTHENTICATE'
);
CREATE TYPE "AuthorizationDenialReason" AS ENUM (
  'AUTHENTICATION_REQUIRED', 'PERMISSION_MISSING', 'SCOPE_DENIED',
  'SEGREGATION_OF_DUTIES', 'STATUS_DENIED', 'MFA_REQUIRED',
  'POLICY_DENIED', 'RESOURCE_HIDDEN'
);
CREATE TYPE "AuthorizationDenialResource" AS ENUM (
  'AUTHENTICATION', 'ADMINISTRATION', 'APPROVAL', 'PROCUREMENT',
  'RECEIVING', 'INVENTORY', 'PROJECTS', 'FINANCE', 'WORKFORCE',
  'REPORTING', 'EVIDENCE', 'SETTINGS'
);

CREATE UNIQUE INDEX "AuditEvent_id_tenantId_key"
  ON "AuditEvent" ("id", "tenantId");

CREATE TABLE "AuthorizationDenialBucket" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  "companyId" uuid,
  "locationId" uuid,
  "actorUserId" uuid,
  "subjectType" "AuthorizationDenialSubjectType" NOT NULL,
  "action" "AuthorizationDenialAction" NOT NULL,
  "reason" "AuthorizationDenialReason" NOT NULL,
  "resource" "AuthorizationDenialResource" NOT NULL,
  "bucketKey" char(64) NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "windowEndsAt" TIMESTAMP(3) NOT NULL,
  "denialCount" bigint NOT NULL DEFAULT 1,
  "firstDeniedAt" TIMESTAMP(3) NOT NULL,
  "lastDeniedAt" TIMESTAMP(3) NOT NULL,
  "firstAuditEventId" uuid NOT NULL,
  "finalAuditEventId" uuid,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthorizationDenialBucket_bucket_key_check"
    CHECK ("bucketKey" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "AuthorizationDenialBucket_count_check"
    CHECK ("denialCount" >= 1),
  CONSTRAINT "AuthorizationDenialBucket_window_check"
    CHECK (
      "windowEndsAt" >= "windowStartedAt" + interval '5 minutes'
      AND "windowEndsAt" <= "windowStartedAt" + interval '60 minutes'
      AND mod(extract(epoch FROM ("windowEndsAt" - "windowStartedAt"))::bigint, 60) = 0
    ),
  CONSTRAINT "AuthorizationDenialBucket_time_order_check"
    CHECK (
      "firstDeniedAt" >= "windowStartedAt"
      AND "lastDeniedAt" >= "firstDeniedAt"
      AND "lastDeniedAt" < "windowEndsAt"
    ),
  CONSTRAINT "AuthorizationDenialBucket_subject_check"
    CHECK (
      ("subjectType" = 'ACTOR' AND "actorUserId" IS NOT NULL)
      OR ("subjectType" <> 'ACTOR' AND "actorUserId" IS NULL)
    ),
  CONSTRAINT "AuthorizationDenialBucket_location_company_check"
    CHECK ("locationId" IS NULL OR "companyId" IS NOT NULL),
  CONSTRAINT "AuthorizationDenialBucket_finalization_check"
    CHECK (
      ("finalizedAt" IS NULL AND "finalAuditEventId" IS NULL)
      OR (
        "finalizedAt" IS NOT NULL
        AND "finalizedAt" >= "windowEndsAt"
        AND (
          ("denialCount" = 1 AND "finalAuditEventId" IS NULL)
          OR ("denialCount" > 1 AND "finalAuditEventId" IS NOT NULL)
        )
      )
    ),
  CONSTRAINT "AuthorizationDenialBucket_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "AuthorizationDenialBucket_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT,
  CONSTRAINT "AuthorizationDenialBucket_location_scope_fkey"
    FOREIGN KEY ("locationId", "tenantId", "companyId") REFERENCES "Location"("id", "tenantId", "companyId") ON DELETE RESTRICT,
  CONSTRAINT "AuthorizationDenialBucket_actor_scope_fkey"
    FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT,
  CONSTRAINT "AuthorizationDenialBucket_first_event_fkey"
    FOREIGN KEY ("firstAuditEventId", "tenantId") REFERENCES "AuditEvent"("id", "tenantId") ON DELETE RESTRICT,
  CONSTRAINT "AuthorizationDenialBucket_final_event_fkey"
    FOREIGN KEY ("finalAuditEventId", "tenantId") REFERENCES "AuditEvent"("id", "tenantId") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "AuthorizationDenialBucket_window_key"
  ON "AuthorizationDenialBucket" ("tenantId", "bucketKey", "windowStartedAt");
CREATE UNIQUE INDEX "AuthorizationDenialBucket_firstAuditEventId_key"
  ON "AuthorizationDenialBucket" ("firstAuditEventId");
CREATE UNIQUE INDEX "AuthorizationDenialBucket_finalAuditEventId_key"
  ON "AuthorizationDenialBucket" ("finalAuditEventId");
CREATE UNIQUE INDEX "AuthorizationDenialBucket_first_event_scope_key"
  ON "AuthorizationDenialBucket" ("firstAuditEventId", "tenantId");
CREATE UNIQUE INDEX "AuthorizationDenialBucket_final_event_scope_key"
  ON "AuthorizationDenialBucket" ("finalAuditEventId", "tenantId");
CREATE INDEX "AuthorizationDenialBucket_finalization_idx"
  ON "AuthorizationDenialBucket" ("finalizedAt", "windowEndsAt");
CREATE INDEX "AuthorizationDenialBucket_scope_idx"
  ON "AuthorizationDenialBucket" ("tenantId", "companyId", "locationId", "lastDeniedAt");
CREATE INDEX "AuthorizationDenialBucket_actor_idx"
  ON "AuthorizationDenialBucket" ("actorUserId", "lastDeniedAt");

CREATE FUNCTION public.enforce_authorization_denial_bucket_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(
    NEW."id", NEW."tenantId", NEW."companyId", NEW."locationId",
    NEW."actorUserId", NEW."subjectType", NEW."action", NEW."reason",
    NEW."resource", NEW."bucketKey", NEW."windowStartedAt", NEW."windowEndsAt",
    NEW."firstDeniedAt", NEW."firstAuditEventId", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."tenantId", OLD."companyId", OLD."locationId",
    OLD."actorUserId", OLD."subjectType", OLD."action", OLD."reason",
    OLD."resource", OLD."bucketKey", OLD."windowStartedAt", OLD."windowEndsAt",
    OLD."firstDeniedAt", OLD."firstAuditEventId", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'AuthorizationDenialBucket identity, scope, window, and first evidence are immutable';
  END IF;

  IF OLD."finalizedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Finalized AuthorizationDenialBucket rows are immutable';
  END IF;

  IF NEW."finalizedAt" IS NULL
     AND NEW."finalAuditEventId" IS NULL
     AND NEW."denialCount" = OLD."denialCount" + 1
     AND NEW."lastDeniedAt" >= OLD."lastDeniedAt"
     AND NEW."updatedAt" = NEW."lastDeniedAt"
     AND NEW."updatedAt" >= OLD."updatedAt" THEN
    RETURN NEW;
  END IF;

  IF NEW."finalizedAt" IS NOT NULL
     AND NEW."finalizedAt" >= OLD."windowEndsAt"
     AND NEW."denialCount" = OLD."denialCount"
     AND NEW."lastDeniedAt" = OLD."lastDeniedAt"
     AND NEW."updatedAt" = NEW."finalizedAt"
     AND (
       (OLD."denialCount" = 1 AND NEW."finalAuditEventId" IS NULL)
       OR (OLD."denialCount" > 1 AND NEW."finalAuditEventId" IS NOT NULL)
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'AuthorizationDenialBucket update is not an exact increment or one-way finalization';
END;
$$;

CREATE FUNCTION public.validate_authorization_denial_bucket_events()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  linked_event record;
BEGIN
  SELECT e."tenantId", e."companyId", e."actorUserId", e."eventType",
         e."entityType", e."entityId", e."occurredAt", e.metadata
    INTO linked_event
    FROM public."AuditEvent" e
   WHERE e."id" = NEW."firstAuditEventId"
     AND e."tenantId" = NEW."tenantId";
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'AuthorizationDenialBucket first audit event is missing from the bucket tenant';
  END IF;
  IF linked_event."companyId" IS DISTINCT FROM NEW."companyId"
     OR linked_event."actorUserId" IS DISTINCT FROM NEW."actorUserId"
     OR linked_event."eventType" <> 'authorization.denial.first'
     OR linked_event."entityType" <> 'AuthorizationDenialBucket'
     OR linked_event."entityId" <> NEW."id"
     OR linked_event."occurredAt" <> NEW."firstDeniedAt"
     OR linked_event.metadata ->> 'sourceDecisionId' IS DISTINCT FROM 'DEC-0050'
     OR linked_event.metadata ->> 'count' IS DISTINCT FROM '1'
     OR linked_event.metadata ->> 'subjectType' IS DISTINCT FROM NEW."subjectType"::text
     OR linked_event.metadata ->> 'action' IS DISTINCT FROM NEW."action"::text
     OR linked_event.metadata ->> 'reason' IS DISTINCT FROM NEW."reason"::text
     OR linked_event.metadata ->> 'resource' IS DISTINCT FROM NEW."resource"::text
     OR linked_event.metadata ->> 'locationId' IS DISTINCT FROM NEW."locationId"::text
     OR (linked_event.metadata ->> 'windowStartedAt')::timestamptz AT TIME ZONE 'UTC'
          IS DISTINCT FROM NEW."windowStartedAt"
     OR (linked_event.metadata ->> 'windowEndsAt')::timestamptz AT TIME ZONE 'UTC'
          IS DISTINCT FROM NEW."windowEndsAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AuthorizationDenialBucket first audit event does not match its bucket';
  END IF;

  IF NEW."finalAuditEventId" IS NOT NULL THEN
    SELECT e."tenantId", e."companyId", e."actorUserId", e."eventType",
           e."entityType", e."entityId", e."occurredAt", e.metadata
      INTO linked_event
      FROM public."AuditEvent" e
     WHERE e."id" = NEW."finalAuditEventId"
       AND e."tenantId" = NEW."tenantId";
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'AuthorizationDenialBucket final audit event is missing from the bucket tenant';
    END IF;
    IF linked_event."companyId" IS DISTINCT FROM NEW."companyId"
       OR linked_event."actorUserId" IS DISTINCT FROM NEW."actorUserId"
       OR linked_event."eventType" <> 'authorization.denial.summary'
       OR linked_event."entityType" <> 'AuthorizationDenialBucket'
       OR linked_event."entityId" <> NEW."id"
       OR linked_event."occurredAt" <> NEW."finalizedAt"
       OR linked_event.metadata ->> 'sourceDecisionId' IS DISTINCT FROM 'DEC-0050'
       OR linked_event.metadata ->> 'count' IS DISTINCT FROM NEW."denialCount"::text
       OR linked_event.metadata ->> 'subjectType' IS DISTINCT FROM NEW."subjectType"::text
       OR linked_event.metadata ->> 'action' IS DISTINCT FROM NEW."action"::text
       OR linked_event.metadata ->> 'reason' IS DISTINCT FROM NEW."reason"::text
       OR linked_event.metadata ->> 'resource' IS DISTINCT FROM NEW."resource"::text
       OR linked_event.metadata ->> 'locationId' IS DISTINCT FROM NEW."locationId"::text
       OR linked_event.metadata ->> 'lastDeniedAt' IS NULL
       OR (linked_event.metadata ->> 'lastDeniedAt')::timestamptz AT TIME ZONE 'UTC'
            IS DISTINCT FROM NEW."lastDeniedAt"
       OR (linked_event.metadata ->> 'windowStartedAt')::timestamptz AT TIME ZONE 'UTC'
            IS DISTINCT FROM NEW."windowStartedAt"
       OR (linked_event.metadata ->> 'windowEndsAt')::timestamptz AT TIME ZONE 'UTC'
            IS DISTINCT FROM NEW."windowEndsAt" THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'AuthorizationDenialBucket final audit event does not match its bucket';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuthorizationDenialBucket_10_update_integrity_trg"
BEFORE UPDATE ON public."AuthorizationDenialBucket"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_authorization_denial_bucket_update();

ALTER TABLE public."AuthorizationDenialBucket"
  ENABLE ALWAYS TRIGGER "AuthorizationDenialBucket_10_update_integrity_trg";

CREATE TRIGGER "AuthorizationDenialBucket_20_event_integrity_trg"
BEFORE INSERT OR UPDATE ON public."AuthorizationDenialBucket"
FOR EACH ROW
EXECUTE FUNCTION public.validate_authorization_denial_bucket_events();

ALTER TABLE public."AuthorizationDenialBucket"
  ENABLE ALWAYS TRIGGER "AuthorizationDenialBucket_20_event_integrity_trg";

CREATE FUNCTION public.reject_authorization_denial_bucket_removal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('AuthorizationDenialBucket is durable operational evidence; %s is prohibited', TG_OP);
END;
$$;

CREATE TRIGGER "AuthorizationDenialBucket_no_remove_trg"
BEFORE DELETE OR TRUNCATE ON public."AuthorizationDenialBucket"
FOR EACH STATEMENT
EXECUTE FUNCTION public.reject_authorization_denial_bucket_removal();

ALTER TABLE public."AuthorizationDenialBucket"
  ENABLE ALWAYS TRIGGER "AuthorizationDenialBucket_no_remove_trg";

COMMIT;
