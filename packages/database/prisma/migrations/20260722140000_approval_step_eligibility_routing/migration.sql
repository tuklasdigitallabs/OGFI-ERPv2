-- DEC-0050 additive approval-routing foundation.
-- Rollback: deploy the previous application first, then leave these additive
-- columns/tables in place. Do not drop routing history during rollback.
-- Cutover gate: normalized reads/actions must remain disabled until every
-- PENDING/WAITING step has routingSchemaVersion=1, a required permission,
-- at least one non-empty scope group, and reviewed prohibited actors.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TYPE "ApprovalScopeGroupMatchMode" AS ENUM ('ALL');
CREATE TYPE "ApprovalScopeTargetMatchMode" AS ENUM ('ANY', 'ALL');

ALTER TABLE "ApprovalInstanceStep"
  ADD COLUMN "requiredPermissionId" UUID,
  ADD COLUMN "routingSchemaVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scopeGroupMatchMode" "ApprovalScopeGroupMatchMode",
  ADD COLUMN "activatedAt" TIMESTAMPTZ,
  ADD COLUMN "dueAt" TIMESTAMPTZ;

ALTER TABLE "ApprovalInstanceStep"
  ADD CONSTRAINT "ApprovalInstanceStep_requiredPermissionId_fkey"
  FOREIGN KEY ("requiredPermissionId") REFERENCES "Permission"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApprovalInstanceStep"
  ADD CONSTRAINT "ApprovalInstanceStep_routing_version_check"
  CHECK (
    ("routingSchemaVersion" = 0 AND "scopeGroupMatchMode" IS NULL)
    OR
    ("routingSchemaVersion" = 1
      AND "requiredPermissionId" IS NOT NULL
      AND "scopeGroupMatchMode" = 'ALL'::"ApprovalScopeGroupMatchMode"
      AND (status <> 'PENDING'::"ApprovalStepStatus" OR "activatedAt" IS NOT NULL))
  );

ALTER TABLE "ApprovalInstanceStep"
  ADD CONSTRAINT "ApprovalInstanceStep_routing_assignment_check"
  CHECK (
    "routingSchemaVersion" = 0
    OR num_nonnulls("assignedUserId", "assignedRoleId") = 1
  );

CREATE TABLE "ApprovalInstanceStepScopeGroup" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "approvalInstanceStepId" UUID NOT NULL,
  "groupOrder" INTEGER NOT NULL,
  "targetMatchMode" "ApprovalScopeTargetMatchMode" NOT NULL DEFAULT 'ANY',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalInstanceStepScopeGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalStepScopeGroup_group_order_check" CHECK ("groupOrder" > 0),
  CONSTRAINT "ApprovalStepScopeGroup_step_order_key"
    UNIQUE ("approvalInstanceStepId", "groupOrder"),
  CONSTRAINT "ApprovalInstanceStepScopeGroup_step_fkey"
    FOREIGN KEY ("approvalInstanceStepId") REFERENCES "ApprovalInstanceStep"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ApprovalInstanceStepScopeTarget" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scopeGroupId" UUID NOT NULL,
  "scopeType" "ScopeType" NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalInstanceStepScopeTarget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalStepScopeTarget_shape_check" CHECK (
    ("scopeType" = 'COMPANY'::"ScopeType" AND "brandId" IS NULL AND "locationId" IS NULL)
    OR ("scopeType" = 'BRAND'::"ScopeType" AND "brandId" IS NOT NULL AND "locationId" IS NULL)
    OR ("scopeType" = 'LOCATION'::"ScopeType" AND "locationId" IS NOT NULL)
  ),
  CONSTRAINT "ApprovalStepScopeTarget_identity_key"
    UNIQUE NULLS NOT DISTINCT ("scopeGroupId", "scopeType", "companyId", "brandId", "locationId"),
  CONSTRAINT "ApprovalInstanceStepScopeTarget_group_fkey"
    FOREIGN KEY ("scopeGroupId") REFERENCES "ApprovalInstanceStepScopeGroup"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalInstanceStepScopeTarget_company_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalInstanceStepScopeTarget_brand_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalInstanceStepScopeTarget_location_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ApprovalInstanceStepProhibitedActor" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "approvalInstanceStepId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "reasonCode" VARCHAR(40) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalInstanceStepProhibitedActor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalStepProhibitedActor_reason_check"
    CHECK ("reasonCode" ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  CONSTRAINT "ApprovalStepProhibitedActor_step_user_key"
    UNIQUE ("approvalInstanceStepId", "userId"),
  CONSTRAINT "ApprovalInstanceStepProhibitedActor_step_fkey"
    FOREIGN KEY ("approvalInstanceStepId") REFERENCES "ApprovalInstanceStep"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalInstanceStepProhibitedActor_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ApprovalInstanceStep_pending_user_idx"
  ON "ApprovalInstanceStep" (status, "assignedUserId", "approvalInstanceId");
CREATE INDEX "ApprovalInstanceStep_pending_role_idx"
  ON "ApprovalInstanceStep" (status, "assignedRoleId", "approvalInstanceId");
CREATE INDEX "ApprovalInstanceStep_pending_permission_idx"
  ON "ApprovalInstanceStep" (status, "requiredPermissionId", "approvalInstanceId");
CREATE INDEX "ApprovalInstanceStep_routing_version_idx"
  ON "ApprovalInstanceStep" ("routingSchemaVersion", status, "approvalInstanceId");
CREATE INDEX "ApprovalInstanceStep_routing_page_idx"
  ON "ApprovalInstanceStep" ("routingSchemaVersion", status, "activatedAt" DESC, id DESC);
CREATE INDEX "ApprovalInstanceStep_routing_due_page_idx"
  ON "ApprovalInstanceStep" ("routingSchemaVersion", status, "dueAt", "activatedAt" DESC, id DESC);
CREATE INDEX "ApprovalStepScopeGroup_match_idx"
  ON "ApprovalInstanceStepScopeGroup" ("approvalInstanceStepId", "targetMatchMode");
CREATE INDEX "ApprovalStepScopeTarget_group_type_idx"
  ON "ApprovalInstanceStepScopeTarget" ("scopeGroupId", "scopeType");
CREATE INDEX "ApprovalStepScopeTarget_scope_idx"
  ON "ApprovalInstanceStepScopeTarget" ("companyId", "brandId", "locationId");
CREATE INDEX "ApprovalStepProhibitedActor_user_step_idx"
  ON "ApprovalInstanceStepProhibitedActor" ("userId", "approvalInstanceStepId");
CREATE UNIQUE INDEX "AuditEvent_approval_step_activation_key"
  ON "AuditEvent" ("tenantId", "entityType", "entityId", "eventType")
  WHERE "entityType" = 'ApprovalInstanceStep'
    AND "eventType" = 'approval.step_activated';

CREATE OR REPLACE FUNCTION public.validate_approval_step_routing_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $routing$
DECLARE
  instance_tenant UUID;
  instance_company UUID;
  target_tenant UUID;
  target_company UUID;
  target_brand UUID;
  assigned_tenant UUID;
  assigned_role_tenant UUID;
BEGIN
  IF TG_TABLE_NAME = 'ApprovalInstanceStepScopeTarget' THEN
    SELECT ai."tenantId", ai."companyId"
      INTO STRICT instance_tenant, instance_company
      FROM "ApprovalInstanceStepScopeGroup" scope_group
      JOIN "ApprovalInstanceStep" step ON step.id = scope_group."approvalInstanceStepId"
      JOIN "ApprovalInstance" ai ON ai.id = step."approvalInstanceId"
     WHERE scope_group.id = NEW."scopeGroupId";

    IF NEW."companyId" <> instance_company THEN
      RAISE EXCEPTION 'APPROVAL_ROUTING_COMPANY_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF NEW."brandId" IS NOT NULL THEN
      SELECT "tenantId", "companyId" INTO STRICT target_tenant, target_company
        FROM "Brand" WHERE id = NEW."brandId";
      IF target_tenant <> instance_tenant OR target_company <> instance_company THEN
        RAISE EXCEPTION 'APPROVAL_ROUTING_BRAND_SCOPE_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW."locationId" IS NOT NULL THEN
      SELECT "tenantId", "companyId", "brandId"
        INTO STRICT target_tenant, target_company, target_brand
        FROM "Location" WHERE id = NEW."locationId";
      IF target_tenant <> instance_tenant OR target_company <> instance_company THEN
        RAISE EXCEPTION 'APPROVAL_ROUTING_LOCATION_SCOPE_MISMATCH' USING ERRCODE = '23514';
      END IF;
      IF NEW."brandId" IS NOT NULL AND target_brand IS DISTINCT FROM NEW."brandId" THEN
        RAISE EXCEPTION 'APPROVAL_ROUTING_LOCATION_BRAND_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'ApprovalInstanceStepProhibitedActor' THEN
    SELECT ai."tenantId" INTO STRICT instance_tenant
      FROM "ApprovalInstanceStep" step
      JOIN "ApprovalInstance" ai ON ai.id = step."approvalInstanceId"
     WHERE step.id = NEW."approvalInstanceStepId";
    SELECT "tenantId" INTO STRICT target_tenant FROM "User" WHERE id = NEW."userId";
    IF target_tenant <> instance_tenant THEN
      RAISE EXCEPTION 'APPROVAL_ROUTING_PROHIBITED_ACTOR_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT ai."tenantId" INTO STRICT instance_tenant
      FROM "ApprovalInstance" ai WHERE ai.id = NEW."approvalInstanceId";
    IF NEW."requiredPermissionId" IS NOT NULL THEN
      SELECT "tenantId" INTO target_tenant
        FROM "Permission" WHERE id = NEW."requiredPermissionId";
      IF NOT FOUND OR (target_tenant IS NOT NULL AND target_tenant <> instance_tenant) THEN
        RAISE EXCEPTION 'APPROVAL_ROUTING_PERMISSION_TENANT_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW."assignedUserId" IS NOT NULL THEN
      SELECT "tenantId" INTO STRICT assigned_tenant FROM "User" WHERE id = NEW."assignedUserId";
      IF assigned_tenant <> instance_tenant THEN
        RAISE EXCEPTION 'APPROVAL_ROUTING_ASSIGNED_USER_TENANT_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW."assignedRoleId" IS NOT NULL THEN
      SELECT "tenantId" INTO assigned_role_tenant FROM "Role" WHERE id = NEW."assignedRoleId";
      IF NOT FOUND OR (assigned_role_tenant IS NOT NULL AND assigned_role_tenant <> instance_tenant) THEN
        RAISE EXCEPTION 'APPROVAL_ROUTING_ASSIGNED_ROLE_TENANT_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."routingSchemaVersion" = 1 AND (
      NEW."approvalInstanceId" IS DISTINCT FROM OLD."approvalInstanceId"
      OR NEW."assignedUserId" IS DISTINCT FROM OLD."assignedUserId"
      OR NEW."assignedRoleId" IS DISTINCT FROM OLD."assignedRoleId"
      OR NEW."delegatedFromUserId" IS DISTINCT FROM OLD."delegatedFromUserId"
      OR NEW."requiredPermissionId" IS DISTINCT FROM OLD."requiredPermissionId"
      OR NEW."routingSchemaVersion" IS DISTINCT FROM OLD."routingSchemaVersion"
      OR NEW."scopeGroupMatchMode" IS DISTINCT FROM OLD."scopeGroupMatchMode"
      OR NEW."dueAt" IS DISTINCT FROM OLD."dueAt"
      OR (
        NEW."activatedAt" IS DISTINCT FROM OLD."activatedAt"
        AND NOT (
          OLD.status = 'WAITING'::"ApprovalStepStatus"
          AND NEW.status = 'PENDING'::"ApprovalStepStatus"
          AND OLD."activatedAt" IS NULL
          AND NEW."activatedAt" IS NOT NULL
        )
      )
    ) THEN
      RAISE EXCEPTION 'APPROVAL_ROUTING_CONTEXT_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    IF NEW."routingSchemaVersion" = 1 AND
       (TG_OP = 'INSERT' OR OLD."routingSchemaVersion" = 0) THEN
      IF NOT EXISTS (
        SELECT 1 FROM "ApprovalInstanceStepScopeGroup" scope_group
         WHERE scope_group."approvalInstanceStepId" = NEW.id
      ) OR EXISTS (
        SELECT 1 FROM "ApprovalInstanceStepScopeGroup" scope_group
         WHERE scope_group."approvalInstanceStepId" = NEW.id
           AND NOT EXISTS (
             SELECT 1 FROM "ApprovalInstanceStepScopeTarget" target
              WHERE target."scopeGroupId" = scope_group.id
           )
      ) THEN
        RAISE EXCEPTION 'APPROVAL_ROUTING_SCOPE_GROUPS_INCOMPLETE' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$routing$;

CREATE TRIGGER "ApprovalStepScopeTarget_context_trg"
BEFORE INSERT OR UPDATE ON "ApprovalInstanceStepScopeTarget"
FOR EACH ROW EXECUTE FUNCTION public.validate_approval_step_routing_context();

CREATE OR REPLACE FUNCTION public.reject_immutable_approval_routing_child_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $immutable$
DECLARE
  step_id UUID;
  routing_version INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'ApprovalInstanceStepScopeGroup' THEN
    step_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."approvalInstanceStepId" ELSE NEW."approvalInstanceStepId" END;
  ELSIF TG_TABLE_NAME = 'ApprovalInstanceStepScopeTarget' THEN
    SELECT "approvalInstanceStepId" INTO STRICT step_id
      FROM "ApprovalInstanceStepScopeGroup"
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."scopeGroupId" ELSE NEW."scopeGroupId" END;
  ELSE
    step_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."approvalInstanceStepId" ELSE NEW."approvalInstanceStepId" END;
  END IF;
  SELECT "routingSchemaVersion" INTO STRICT routing_version
    FROM "ApprovalInstanceStep" WHERE id = step_id;
  IF routing_version = 1 THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_CONTEXT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$immutable$;

CREATE TRIGGER "ApprovalStepScopeGroup_immutable_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStepScopeGroup"
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_approval_routing_child_mutation();

CREATE TRIGGER "ApprovalStepScopeTarget_immutable_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStepScopeTarget"
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_approval_routing_child_mutation();

CREATE TRIGGER "ApprovalStepProhibitedActor_immutable_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStepProhibitedActor"
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_approval_routing_child_mutation();

CREATE TRIGGER "ApprovalInstanceStep_routing_context_trg"
BEFORE INSERT OR UPDATE OF "approvalInstanceId", "assignedUserId", "assignedRoleId", "delegatedFromUserId", status,
  "requiredPermissionId", "routingSchemaVersion", "scopeGroupMatchMode", "activatedAt", "dueAt"
ON "ApprovalInstanceStep"
FOR EACH ROW EXECUTE FUNCTION public.validate_approval_step_routing_context();

CREATE TRIGGER "ApprovalStepProhibitedActor_context_trg"
BEFORE INSERT OR UPDATE ON "ApprovalInstanceStepProhibitedActor"
FOR EACH ROW EXECUTE FUNCTION public.validate_approval_step_routing_context();

-- Deterministic backfill strategy (not executed here): map each ApprovalInstance
-- documentType to its stable required permission, scope requirements, and
-- prohibited source actors in a reviewed idempotent application backfill. Set
-- routingSchemaVersion=1 only after all related rows exist in the same transaction.

COMMIT;
