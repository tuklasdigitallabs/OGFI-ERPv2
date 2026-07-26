-- DEC-0225: immutable, company-owned approval-rule versions.
-- Existing active rules must already be role-routed. Legacy inactive USER rules
-- remain readable history but cannot be activated by the bounded composer.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ApprovalRule" rule
    JOIN "ApprovalRuleStep" step ON step."approvalRuleId" = rule."id"
    WHERE rule."isActive" = TRUE
      AND (
        UPPER(BTRIM(step."approverType")) <> 'ROLE'
        OR step."roleId" IS NULL
        OR step."userId" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'APPROVAL_RULE_ACTIVE_NON_ROLE_TARGET_PREFLIGHT_FAILED';
  END IF;
END $$;

ALTER TABLE "ApprovalRule"
  ADD COLUMN "routeKey" TEXT,
  ADD COLUMN "lineageId" UUID,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supersedesRuleId" UUID,
  ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "idempotencyKey" VARCHAR(128),
  ADD COLUMN "idempotencyRequestHash" CHAR(64),
  ADD COLUMN "definitionSealed" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ApprovalRule"
SET
  "lineageId" = "id",
  "routeKey" = CASE
    WHEN "transactionType" = 'PURCHASE_REQUEST'
      AND (
        LOWER(COALESCE("scopeFilters" ->> 'emergency', 'false')) = 'true'
        OR LOWER(COALESCE("scopeFilters" ->> 'route', '')) = 'emergency_purchase'
        OR LOWER(COALESCE("scopeFilters" ->> 'appliesTo', '')) = 'emergency_purchase'
      )
    THEN 'PR_EMERGENCY'
    ELSE 'DEFAULT'
  END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ApprovalRule"
    WHERE "isActive" = TRUE
      AND "companyId" IS NOT NULL
    GROUP BY "tenantId", "companyId", "transactionType", "routeKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'APPROVAL_RULE_DUPLICATE_ACTIVE_ROUTE_PREFLIGHT_FAILED';
  END IF;
END $$;

ALTER TABLE "ApprovalRule"
  ALTER COLUMN "routeKey" SET DEFAULT 'DEFAULT',
  ALTER COLUMN "routeKey" SET NOT NULL,
  ALTER COLUMN "lineageId" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "lineageId" SET NOT NULL,
  ALTER COLUMN "definitionSealed" SET DEFAULT FALSE,
  ADD CONSTRAINT "ApprovalRule_routeKey_check"
    CHECK ("routeKey" IN ('DEFAULT', 'PR_EMERGENCY')),
  ADD CONSTRAINT "ApprovalRule_emergency_route_transaction_check"
    CHECK ("routeKey" <> 'PR_EMERGENCY' OR "transactionType" = 'PURCHASE_REQUEST'),
  ADD CONSTRAINT "ApprovalRule_version_positive_check"
    CHECK ("version" > 0),
  ADD CONSTRAINT "ApprovalRule_lifecycleVersion_positive_check"
    CHECK ("lifecycleVersion" > 0),
  ADD CONSTRAINT "ApprovalRule_idempotency_pair_check"
    CHECK (
      ("idempotencyKey" IS NULL AND "idempotencyRequestHash" IS NULL)
      OR ("idempotencyKey" IS NOT NULL AND "idempotencyRequestHash" IS NOT NULL)
    );

ALTER TABLE "ApprovalRule"
  DROP CONSTRAINT IF EXISTS "ApprovalRule_companyId_fkey";

CREATE UNIQUE INDEX "ApprovalRule_id_tenantId_companyId_key"
  ON "ApprovalRule"("id", "tenantId", "companyId");

ALTER TABLE "ApprovalRule"
  ADD CONSTRAINT "ApprovalRule_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId")
    REFERENCES "Company"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ApprovalRule_supersedesRuleId_fkey"
    FOREIGN KEY ("supersedesRuleId", "tenantId", "companyId")
    REFERENCES "ApprovalRule"("id", "tenantId", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ApprovalRule_supersedesRuleId_tenantId_companyId_key"
  ON "ApprovalRule"("supersedesRuleId", "tenantId", "companyId");

CREATE UNIQUE INDEX "ApprovalRule_lineage_version_key"
  ON "ApprovalRule"("tenantId", "lineageId", "version");

CREATE UNIQUE INDEX "ApprovalRule_scope_idempotency_key"
  ON "ApprovalRule"("tenantId", "companyId", "idempotencyKey");

CREATE INDEX "ApprovalRule_active_route_idx"
  ON "ApprovalRule"("tenantId", "companyId", "transactionType", "routeKey", "isActive");

CREATE UNIQUE INDEX "ApprovalRule_one_active_company_route_key"
  ON "ApprovalRule"("tenantId", "companyId", "transactionType", "routeKey")
  WHERE "isActive" = TRUE AND "companyId" IS NOT NULL;

CREATE TABLE "ApprovalRuleLifecycleIntent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "approvalRuleId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalRuleLifecycleIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalRuleLifecycleIntent_action_check"
    CHECK ("action" IN ('CREATE', 'REVISE', 'ACTIVATE', 'DEACTIVATE')),
  CONSTRAINT "ApprovalRuleLifecycleIntent_requestHash_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ApprovalRuleLifecycleIntent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRuleLifecycleIntent_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRuleLifecycleIntent_approvalRuleId_fkey"
    FOREIGN KEY ("approvalRuleId", "tenantId", "companyId") REFERENCES "ApprovalRule"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApprovalRuleLifecycleIntent_scope_idempotency_key"
  ON "ApprovalRuleLifecycleIntent"("tenantId", "companyId", "idempotencyKey");

CREATE INDEX "ApprovalRuleLifecycleIntent_rule_history_idx"
  ON "ApprovalRuleLifecycleIntent"("tenantId", "companyId", "approvalRuleId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_approval_rule_lifecycle_intent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'ApprovalRuleLifecycleIntent is append-only';
END;
$$;

CREATE TRIGGER "ApprovalRuleLifecycleIntent_prevent_update"
BEFORE UPDATE ON "ApprovalRuleLifecycleIntent"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_rule_lifecycle_intent_mutation();

CREATE TRIGGER "ApprovalRuleLifecycleIntent_prevent_delete"
BEFORE DELETE ON "ApprovalRuleLifecycleIntent"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_rule_lifecycle_intent_mutation();

CREATE TRIGGER "ApprovalRuleLifecycleIntent_prevent_truncate"
BEFORE TRUNCATE ON "ApprovalRuleLifecycleIntent"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_approval_rule_lifecycle_intent_mutation();

CREATE OR REPLACE FUNCTION protect_approval_rule_version_definition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  predecessor public."ApprovalRule"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."transactionType" IS DISTINCT FROM OLD."transactionType"
    OR NEW."routeKey" IS DISTINCT FROM OLD."routeKey"
    OR NEW."scopeFilters" IS DISTINCT FROM OLD."scopeFilters"
    OR NEW."priority" IS DISTINCT FROM OLD."priority"
    OR NEW."lineageId" IS DISTINCT FROM OLD."lineageId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."supersedesRuleId" IS DISTINCT FROM OLD."supersedesRuleId"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."idempotencyRequestHash" IS DISTINCT FROM OLD."idempotencyRequestHash"
    OR (
      NEW."definitionSealed" IS DISTINCT FROM OLD."definitionSealed"
      AND NOT (OLD."definitionSealed" = FALSE AND NEW."definitionSealed" = TRUE)
    )
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'ApprovalRule version definitions are immutable';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."definitionSealed" THEN
    RAISE EXCEPTION 'APPROVAL_RULE_NEW_VERSION_MUST_START_UNSEALED';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."supersedesRuleId" IS NULL AND (
    NEW."version" <> 1 OR NEW."lineageId" IS DISTINCT FROM NEW."id"
  ) THEN
    RAISE EXCEPTION 'APPROVAL_RULE_ROOT_LINEAGE_INVALID';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."supersedesRuleId" IS NOT NULL THEN
    SELECT * INTO predecessor
    FROM public."ApprovalRule"
    WHERE "id" = NEW."supersedesRuleId"
      AND "tenantId" = NEW."tenantId"
      AND "companyId" IS NOT DISTINCT FROM NEW."companyId";

    IF NOT FOUND
      OR predecessor."lineageId" IS DISTINCT FROM NEW."lineageId"
      OR NEW."version" <> predecessor."version" + 1
      OR predecessor."transactionType" IS DISTINCT FROM NEW."transactionType"
      OR predecessor."routeKey" IS DISTINCT FROM NEW."routeKey"
    THEN
      RAISE EXCEPTION 'APPROVAL_RULE_SUCCESSOR_LINEAGE_INVALID';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ApprovalRule_protect_version_definition"
BEFORE INSERT OR UPDATE ON "ApprovalRule"
FOR EACH ROW EXECUTE FUNCTION protect_approval_rule_version_definition();

CREATE OR REPLACE FUNCTION prevent_approval_rule_removal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'ApprovalRule versions are append-only';
END;
$$;

CREATE TRIGGER "ApprovalRule_prevent_delete"
BEFORE DELETE ON "ApprovalRule"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_rule_removal();

CREATE TRIGGER "ApprovalRule_prevent_truncate"
BEFORE TRUNCATE ON "ApprovalRule"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_approval_rule_removal();

CREATE OR REPLACE FUNCTION require_sealed_approval_rule_at_commit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."ApprovalRule"
    WHERE "id" = NEW."id" AND "definitionSealed" = FALSE
  ) THEN
    RAISE EXCEPTION 'APPROVAL_RULE_VERSION_NOT_SEALED';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ApprovalRule_require_sealed_at_commit"
AFTER INSERT OR UPDATE OF "definitionSealed" ON "ApprovalRule"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_sealed_approval_rule_at_commit();

CREATE OR REPLACE FUNCTION protect_approval_rule_step_definition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  rule_is_sealed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT "definitionSealed" INTO rule_is_sealed
    FROM public."ApprovalRule"
    WHERE "id" = NEW."approvalRuleId";
    IF rule_is_sealed IS DISTINCT FROM FALSE THEN
      RAISE EXCEPTION 'APPROVAL_RULE_VERSION_ALREADY_SEALED';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ApprovalRuleStep definitions are immutable';
END;
$$;

CREATE TRIGGER "ApprovalRuleStep_prevent_update"
BEFORE INSERT OR UPDATE ON "ApprovalRuleStep"
FOR EACH ROW EXECUTE FUNCTION protect_approval_rule_step_definition();

CREATE TRIGGER "ApprovalRuleStep_prevent_delete"
BEFORE DELETE ON "ApprovalRuleStep"
FOR EACH ROW EXECUTE FUNCTION protect_approval_rule_step_definition();

CREATE TRIGGER "ApprovalRuleStep_prevent_truncate"
BEFORE TRUNCATE ON "ApprovalRuleStep"
FOR EACH STATEMENT EXECUTE FUNCTION protect_approval_rule_step_definition();

REVOKE ALL ON FUNCTION prevent_approval_rule_lifecycle_intent_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_approval_rule_version_definition() FROM PUBLIC;
REVOKE ALL ON FUNCTION prevent_approval_rule_removal() FROM PUBLIC;
REVOKE ALL ON FUNCTION require_sealed_approval_rule_at_commit() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_approval_rule_step_definition() FROM PUBLIC;

COMMIT;
