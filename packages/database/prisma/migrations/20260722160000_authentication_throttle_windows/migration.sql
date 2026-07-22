-- Provider-neutral bounded authentication throttle windows.
-- No predecessor rows are updated or backfilled.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TYPE "AuthenticationThrottleAttemptType" AS ENUM ('PASSWORD', 'MFA');
CREATE TYPE "AuthenticationThrottleDimensionType" AS ENUM (
  'GLOBAL', 'IDENTIFIER_SHARD', 'SOURCE_SHARD', 'TENANT', 'ACCOUNT'
);

CREATE TABLE "AuthenticationThrottleWindow" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attemptType" "AuthenticationThrottleAttemptType" NOT NULL,
  "dimensionType" "AuthenticationThrottleDimensionType" NOT NULL,
  "bucketKey" CHAR(64) NOT NULL,
  "keyVersion" INTEGER NOT NULL,
  "shardNumber" INTEGER,
  "tenantId" UUID,
  "accountUserId" UUID,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "windowEndsAt" TIMESTAMP(3) NOT NULL,
  "limitCount" BIGINT NOT NULL,
  "requestCount" BIGINT NOT NULL DEFAULT 1,
  "failureReservationCount" BIGINT NOT NULL DEFAULT 1,
  "successCount" BIGINT NOT NULL DEFAULT 0,
  "deniedCount" BIGINT NOT NULL DEFAULT 0,
  "firstRequestAt" TIMESTAMP(3) NOT NULL,
  "lastRequestAt" TIMESTAMP(3) NOT NULL,
  "thresholdReachedAt" TIMESTAMP(3),
  "retainUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthenticationThrottleWindow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthenticationThrottleWindow_dimension_shape_check" CHECK (
    ("dimensionType" = 'GLOBAL' AND "shardNumber" IS NULL AND "tenantId" IS NULL AND "accountUserId" IS NULL)
    OR ("dimensionType" IN ('IDENTIFIER_SHARD', 'SOURCE_SHARD') AND "shardNumber" BETWEEN 0 AND 1023 AND "tenantId" IS NULL AND "accountUserId" IS NULL)
    OR ("dimensionType" = 'TENANT' AND "shardNumber" IS NULL AND "tenantId" IS NOT NULL AND "accountUserId" IS NULL)
    OR ("dimensionType" = 'ACCOUNT' AND "shardNumber" IS NULL AND "tenantId" IS NOT NULL AND "accountUserId" IS NOT NULL)
  ),
  CONSTRAINT "AuthenticationThrottleWindow_bucket_key_check" CHECK (
    "bucketKey" ~ '^[0-9a-f]{64}$' AND "keyVersion" BETWEEN 1 AND 1000000
  ),
  CONSTRAINT "AuthenticationThrottleWindow_window_check" CHECK (
    "windowStartedAt" = date_trunc('minute', "windowStartedAt")
    AND "windowEndsAt" = date_trunc('minute', "windowEndsAt")
    AND "windowEndsAt" >= "windowStartedAt" + interval '1 minute'
    AND "windowEndsAt" <= "windowStartedAt" + interval '60 minutes'
    AND "retainUntil" >= "windowEndsAt" + interval '1 day'
    AND "retainUntil" <= "windowEndsAt" + interval '365 days'
  ),
  CONSTRAINT "AuthenticationThrottleWindow_counter_check" CHECK (
    "limitCount" BETWEEN 1 AND 1000000
    AND "requestCount" >= 1
    AND "failureReservationCount" >= 0
    AND "successCount" >= 0
    AND "deniedCount" >= 0
    AND "requestCount" = "failureReservationCount" + "successCount"
    AND "deniedCount" <= "failureReservationCount"
  ),
  CONSTRAINT "AuthenticationThrottleWindow_time_check" CHECK (
    "firstRequestAt" >= "windowStartedAt"
    AND "firstRequestAt" < "windowEndsAt"
    AND "lastRequestAt" >= "firstRequestAt"
    AND "lastRequestAt" < "windowEndsAt"
    AND (("deniedCount" = 0 AND "thresholdReachedAt" IS NULL)
      OR ("deniedCount" > 0 AND "thresholdReachedAt" IS NOT NULL
        AND "thresholdReachedAt" >= "firstRequestAt"
        AND "thresholdReachedAt" <= "lastRequestAt"))
  ),
  CONSTRAINT "AuthenticationThrottleWindow_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "AuthenticationThrottleWindow_account_fkey"
    FOREIGN KEY ("accountUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "AuthenticationThrottleWindow_dimension_window_key"
  ON "AuthenticationThrottleWindow" ("attemptType", "dimensionType", "bucketKey", "keyVersion", "windowStartedAt");
CREATE INDEX "AuthenticationThrottleWindow_retention_idx"
  ON "AuthenticationThrottleWindow" ("retainUntil", "windowEndsAt");
CREATE INDEX "AuthenticationThrottleWindow_key_rotation_idx"
  ON "AuthenticationThrottleWindow" ("keyVersion", "windowEndsAt");
CREATE INDEX "AuthenticationThrottleWindow_tenant_window_idx"
  ON "AuthenticationThrottleWindow" ("tenantId", "attemptType", "windowStartedAt");
CREATE INDEX "AuthenticationThrottleWindow_account_window_idx"
  ON "AuthenticationThrottleWindow" ("accountUserId", "attemptType", "windowStartedAt");

CREATE FUNCTION public.enforce_authentication_throttle_window_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $throttle$
DECLARE
  is_reservation BOOLEAN;
  is_success_release BOOLEAN;
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
    AND (
      (NEW."deniedCount" = OLD."deniedCount" AND NEW."thresholdReachedAt" IS NOT DISTINCT FROM OLD."thresholdReachedAt")
      OR (NEW."deniedCount" = OLD."deniedCount" + 1
        AND NEW."thresholdReachedAt" IS NOT DISTINCT FROM COALESCE(OLD."thresholdReachedAt", NEW."lastRequestAt"))
    );

  is_success_release :=
    OLD."failureReservationCount" > OLD."deniedCount"
    AND NEW."requestCount" = OLD."requestCount"
    AND NEW."failureReservationCount" = OLD."failureReservationCount" - 1
    AND NEW."successCount" = OLD."successCount" + 1
    AND NEW."deniedCount" = OLD."deniedCount"
    AND NEW."lastRequestAt" IS NOT DISTINCT FROM OLD."lastRequestAt"
    AND NEW."thresholdReachedAt" IS NOT DISTINCT FROM OLD."thresholdReachedAt"
    AND NEW."updatedAt" >= OLD."updatedAt";

  IF NOT is_reservation AND NOT is_success_release THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_TRANSITION_INVALID' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$throttle$;

CREATE TRIGGER "AuthenticationThrottleWindow_transition_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "AuthenticationThrottleWindow"
FOR EACH ROW EXECUTE FUNCTION public.enforce_authentication_throttle_window_transition();

ALTER TABLE "AuthenticationThrottleWindow"
  ENABLE ALWAYS TRIGGER "AuthenticationThrottleWindow_transition_trg";

CREATE FUNCTION public.reject_authentication_throttle_window_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $truncate$
BEGIN
  RAISE EXCEPTION 'AUTH_THROTTLE_TRUNCATE_FORBIDDEN' USING ERRCODE = '55000';
END
$truncate$;

CREATE TRIGGER "AuthenticationThrottleWindow_truncate_trg"
BEFORE TRUNCATE ON "AuthenticationThrottleWindow"
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_authentication_throttle_window_truncate();

ALTER TABLE "AuthenticationThrottleWindow"
  ENABLE ALWAYS TRIGGER "AuthenticationThrottleWindow_truncate_trg";

COMMIT;
