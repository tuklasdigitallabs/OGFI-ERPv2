-- Atomic, authenticated authentication-throttle success reservations and
-- operator-controlled key lifecycle. Existing throttle windows are preserved.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TYPE "AuthenticationThrottleControlStatus" AS ENUM ('ACTIVE', 'PAUSED');

CREATE TABLE "AuthenticationThrottleControl" (
  "id" INTEGER NOT NULL,
  "status" "AuthenticationThrottleControlStatus" NOT NULL DEFAULT 'PAUSED',
  "generation" BIGINT NOT NULL DEFAULT 0,
  "activeKeyVersion" INTEGER NOT NULL,
  "activeKeyFingerprint" CHAR(64) NOT NULL,
  "activeFrom" TIMESTAMP(3) NOT NULL,
  "previousGeneration" BIGINT,
  "previousKeyVersion" INTEGER,
  "previousKeyFingerprint" CHAR(64),
  "previousRetireAt" TIMESTAMP(3),
  "policyDigest" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthenticationThrottleControl_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthenticationThrottleControl_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "AuthenticationThrottleControl_generation_check" CHECK ("generation" >= 0),
  CONSTRAINT "AuthenticationThrottleControl_active_key_check" CHECK (
    "activeKeyVersion" BETWEEN 1 AND 1000000
    AND "activeKeyFingerprint" ~ '^[0-9a-f]{64}$'
    AND "policyDigest" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "AuthenticationThrottleControl_previous_key_check" CHECK (
    ("previousGeneration" IS NULL AND "previousKeyVersion" IS NULL
      AND "previousKeyFingerprint" IS NULL AND "previousRetireAt" IS NULL)
    OR
    ("previousGeneration" IS NOT NULL AND "previousGeneration" >= 1
      AND "previousGeneration" < "generation"
      AND "previousKeyVersion" BETWEEN 1 AND 1000000
      AND "previousKeyVersion" <> "activeKeyVersion"
      AND "previousKeyFingerprint" ~ '^[0-9a-f]{64}$'
      AND "previousKeyFingerprint" <> "activeKeyFingerprint"
      AND "previousRetireAt" IS NOT NULL)
  ),
  CONSTRAINT "AuthenticationThrottleControl_active_state_check" CHECK (
    "status" = 'PAUSED' OR "generation" >= 1
  )
);

-- No application secret is placed in a migration. Production and staging stay
-- paused until the controlled migrator bootstrap binds the environment key and
-- policy fingerprints. Runtime has no mutation or operator-function privilege.
INSERT INTO "AuthenticationThrottleControl" (
  "id", "status", "generation", "activeKeyVersion", "activeKeyFingerprint",
  "activeFrom", "policyDigest", "createdAt", "updatedAt"
) VALUES (
  1, 'PAUSED', 0, 1, repeat('0', 64),
  date_trunc('milliseconds', clock_timestamp()), repeat('0', 64),
  date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', clock_timestamp())
);

CREATE FUNCTION public.reject_authentication_throttle_control_remove()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $control_remove$
BEGIN
  RAISE EXCEPTION 'AUTH_THROTTLE_CONTROL_REMOVE_FORBIDDEN' USING ERRCODE = '55000';
END
$control_remove$;

CREATE TRIGGER "AuthenticationThrottleControl_no_remove_trg"
BEFORE DELETE OR TRUNCATE ON "AuthenticationThrottleControl"
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_authentication_throttle_control_remove();
ALTER TABLE "AuthenticationThrottleControl"
  ENABLE ALWAYS TRIGGER "AuthenticationThrottleControl_no_remove_trg";

CREATE FUNCTION public.enforce_authentication_throttle_control_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $control_transition$
BEGIN
  IF NEW."id" <> 1 OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_CONTROL_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW."generation" <> OLD."generation" + 1
     OR NEW."updatedAt" <= OLD."updatedAt" THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_CONTROL_CAS_REQUIRED' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END
$control_transition$;

CREATE TRIGGER "AuthenticationThrottleControl_transition_trg"
BEFORE UPDATE ON "AuthenticationThrottleControl"
FOR EACH ROW EXECUTE FUNCTION public.enforce_authentication_throttle_control_transition();
ALTER TABLE "AuthenticationThrottleControl"
  ENABLE ALWAYS TRIGGER "AuthenticationThrottleControl_transition_trg";

-- PostgreSQL requires UPDATE privilege for SELECT ... FOR SHARE. Runtime must
-- never receive that privilege, so this narrowly scoped, owner-controlled read
-- function acquires the shared row lock without exposing any mutation surface.
CREATE FUNCTION public.lock_authentication_throttle_control()
RETURNS SETOF public."AuthenticationThrottleControl"
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $control_lock$
  SELECT *
    FROM public."AuthenticationThrottleControl"
   WHERE "id" = 1
   FOR SHARE
$control_lock$;

REVOKE ALL ON FUNCTION public.lock_authentication_throttle_control() FROM PUBLIC;

CREATE FUNCTION public.operator_transition_authentication_throttle_control(
  expected_generation BIGINT,
  requested_status "AuthenticationThrottleControlStatus",
  requested_key_version INTEGER,
  requested_key_fingerprint TEXT,
  requested_policy_digest TEXT
)
RETURNS TABLE (
  generation BIGINT,
  status "AuthenticationThrottleControlStatus",
  active_key_version INTEGER,
  active_key_fingerprint TEXT,
  policy_digest TEXT,
  previous_retire_at TIMESTAMP(3)
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $operator_transition$
DECLARE
  control public."AuthenticationThrottleControl"%ROWTYPE;
  database_now TIMESTAMP(3);
  retire_at TIMESTAMP(3);
BEGIN
  IF requested_status IS NULL
     OR requested_key_version NOT BETWEEN 1 AND 1000000
     OR requested_key_fingerprint !~ '^[0-9a-f]{64}$'
     OR requested_policy_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_CONTROL_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT control
    FROM public."AuthenticationThrottleControl"
   WHERE "id" = 1
   FOR UPDATE;
  database_now := GREATEST(
    date_trunc('milliseconds', clock_timestamp()),
    control."updatedAt" + interval '1 millisecond'
  );

  -- An exact rerun is intentionally idempotent and never advances generation.
  IF control."status" = requested_status
     AND control."activeKeyVersion" = requested_key_version
     AND control."activeKeyFingerprint" = requested_key_fingerprint
     AND control."policyDigest" = requested_policy_digest THEN
    RETURN QUERY SELECT control."generation", control."status",
      control."activeKeyVersion", control."activeKeyFingerprint"::text,
      control."policyDigest"::text, control."previousRetireAt";
    RETURN;
  END IF;

  IF control."generation" <> expected_generation THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_CONTROL_GENERATION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  IF requested_status = 'PAUSED' THEN
    IF requested_key_version <> control."activeKeyVersion"
       OR requested_key_fingerprint <> control."activeKeyFingerprint"
       OR requested_policy_digest <> control."policyDigest" THEN
      RAISE EXCEPTION 'AUTH_THROTTLE_PAUSE_CANNOT_ROTATE' USING ERRCODE = '22023';
    END IF;
    UPDATE public."AuthenticationThrottleControl"
       SET "status" = 'PAUSED', "generation" = control."generation" + 1,
           "updatedAt" = database_now
     WHERE "id" = 1;
  ELSIF control."generation" = 0 THEN
    UPDATE public."AuthenticationThrottleControl"
       SET "status" = 'ACTIVE', "generation" = 1,
           "activeKeyVersion" = requested_key_version,
           "activeKeyFingerprint" = requested_key_fingerprint,
           "activeFrom" = database_now, "policyDigest" = requested_policy_digest,
           "updatedAt" = database_now
     WHERE "id" = 1;
  ELSIF requested_key_version = control."activeKeyVersion" THEN
    IF requested_key_fingerprint <> control."activeKeyFingerprint"
       OR requested_policy_digest <> control."policyDigest" THEN
      RAISE EXCEPTION 'AUTH_THROTTLE_KEY_OR_POLICY_DRIFT' USING ERRCODE = '22023';
    END IF;
    UPDATE public."AuthenticationThrottleControl"
       SET "status" = 'ACTIVE', "generation" = control."generation" + 1,
           "updatedAt" = database_now
     WHERE "id" = 1;
  ELSE
    IF requested_key_fingerprint = control."activeKeyFingerprint"
       OR requested_key_version = control."previousKeyVersion"
       OR requested_key_fingerprint = control."previousKeyFingerprint" THEN
      RAISE EXCEPTION 'AUTH_THROTTLE_KEY_IDENTITY_REUSE_FORBIDDEN' USING ERRCODE = '22023';
    END IF;
    IF control."previousRetireAt" IS NOT NULL
       AND control."previousRetireAt" > database_now THEN
      RAISE EXCEPTION 'AUTH_THROTTLE_PREVIOUS_GENERATION_UNEXPIRED' USING ERRCODE = '55000';
    END IF;
    SELECT COALESCE(max("windowEndsAt"), database_now) INTO retire_at
      FROM public."AuthenticationThrottleWindow"
     WHERE "keyVersion" = control."activeKeyVersion"
       AND "windowEndsAt" > database_now;
    UPDATE public."AuthenticationThrottleControl"
       SET "status" = 'ACTIVE', "generation" = control."generation" + 1,
           "previousGeneration" = control."generation",
           "previousKeyVersion" = control."activeKeyVersion",
           "previousKeyFingerprint" = control."activeKeyFingerprint",
           "previousRetireAt" = retire_at,
           "activeKeyVersion" = requested_key_version,
           "activeKeyFingerprint" = requested_key_fingerprint,
           "activeFrom" = database_now, "policyDigest" = requested_policy_digest,
           "updatedAt" = database_now
     WHERE "id" = 1;
  END IF;

  SELECT * INTO STRICT control
    FROM public."AuthenticationThrottleControl" WHERE "id" = 1;
  RETURN QUERY SELECT control."generation", control."status",
    control."activeKeyVersion", control."activeKeyFingerprint"::text,
    control."policyDigest"::text, control."previousRetireAt";
END
$operator_transition$;

REVOKE ALL ON FUNCTION public.operator_transition_authentication_throttle_control(
  BIGINT, "AuthenticationThrottleControlStatus", INTEGER, TEXT, TEXT
) FROM PUBLIC;

-- Success releases now require a fresh immutable success audit event carrying
-- the reservation UUID in the same database transaction. The service also
-- authenticates the full canonical reservation before setting the local marker.
CREATE OR REPLACE FUNCTION public.enforce_authentication_throttle_window_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $throttle$
DECLARE
  is_reservation BOOLEAN;
  is_success_release BOOLEAN;
  reservation_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."retainUntil" > CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'AUTH_THROTTLE_RETENTION_ACTIVE' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."requestCount" <> 1 OR NEW."failureReservationCount" <> 1
       OR NEW."successCount" <> 0 OR NEW."deniedCount" NOT IN (0, 1)
       OR NEW."firstRequestAt" IS DISTINCT FROM NEW."lastRequestAt"
       OR (NEW."deniedCount" = 0 AND NEW."thresholdReachedAt" IS NOT NULL)
       OR (NEW."deniedCount" = 1 AND NEW."thresholdReachedAt" IS DISTINCT FROM NEW."lastRequestAt") THEN
      RAISE EXCEPTION 'AUTH_THROTTLE_INSERT_NOT_RESERVATION' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW."id", NEW."attemptType", NEW."dimensionType", NEW."bucketKey",
         NEW."keyVersion", NEW."shardNumber", NEW."tenantId", NEW."accountUserId",
         NEW."windowStartedAt", NEW."windowEndsAt", NEW."limitCount",
         NEW."firstRequestAt", NEW."retainUntil", NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."id", OLD."attemptType", OLD."dimensionType", OLD."bucketKey",
         OLD."keyVersion", OLD."shardNumber", OLD."tenantId", OLD."accountUserId",
         OLD."windowStartedAt", OLD."windowEndsAt", OLD."limitCount",
         OLD."firstRequestAt", OLD."retainUntil", OLD."createdAt") THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  is_reservation :=
    NEW."requestCount" = OLD."requestCount" + 1
    AND NEW."failureReservationCount" = OLD."failureReservationCount" + 1
    AND NEW."successCount" = OLD."successCount"
    AND NEW."deniedCount" IN (OLD."deniedCount", OLD."deniedCount" + 1)
    AND NEW."lastRequestAt" >= OLD."lastRequestAt"
    AND NEW."updatedAt" = NEW."lastRequestAt"
    AND ((NEW."deniedCount" = OLD."deniedCount"
          AND NEW."thresholdReachedAt" IS NOT DISTINCT FROM OLD."thresholdReachedAt")
      OR (NEW."deniedCount" = OLD."deniedCount" + 1
          AND NEW."thresholdReachedAt" IS NOT DISTINCT FROM COALESCE(OLD."thresholdReachedAt", NEW."lastRequestAt")));

  is_success_release :=
    OLD."failureReservationCount" > OLD."deniedCount"
    AND NEW."requestCount" = OLD."requestCount"
    AND NEW."failureReservationCount" = OLD."failureReservationCount" - 1
    AND NEW."successCount" = OLD."successCount" + 1
    AND NEW."deniedCount" = OLD."deniedCount"
    AND NEW."lastRequestAt" IS NOT DISTINCT FROM OLD."lastRequestAt"
    AND NEW."thresholdReachedAt" IS NOT DISTINCT FROM OLD."thresholdReachedAt"
    AND NEW."updatedAt" >= OLD."updatedAt";

  IF is_success_release THEN
    BEGIN
      reservation_id := current_setting(
        'ogfi.authentication_throttle_success_reservation_id', true
      )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'AUTH_THROTTLE_SUCCESS_AUDIT_REQUIRED' USING ERRCODE = '55000';
    END;
    IF reservation_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public."AuditEvent" audit
       WHERE audit."id" = reservation_id
         AND audit."eventType" IN (
           'auth.password.succeeded',
           'auth.mfa.challenge_succeeded',
           'auth.mfa.recovery_used'
         )
         AND audit.xmin::text = pg_current_xact_id()::text
    ) THEN
      RAISE EXCEPTION 'AUTH_THROTTLE_SUCCESS_AUDIT_REQUIRED' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NOT is_reservation AND NOT is_success_release THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_TRANSITION_INVALID' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$throttle$;

COMMIT;
