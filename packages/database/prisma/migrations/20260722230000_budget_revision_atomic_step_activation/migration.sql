BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Budget revisions intentionally remain in a non-actionable pre-review state.
-- The commitment-fit review activates the first normalized step and assigns its
-- effective-date deadline in one guarded WAITING -> PENDING update. Preserve all
-- other immutable routing context and reject later due-date rewrites.
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
  is_activation_transition BOOLEAN := false;
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
    IF TG_OP = 'UPDATE' THEN
      is_activation_transition :=
        OLD.status = 'WAITING'::"ApprovalStepStatus"
        AND NEW.status = 'PENDING'::"ApprovalStepStatus"
        AND OLD."activatedAt" IS NULL
        AND NEW."activatedAt" IS NOT NULL;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."routingSchemaVersion" = 1 AND (
      NEW."approvalInstanceId" IS DISTINCT FROM OLD."approvalInstanceId"
      OR NEW."assignedUserId" IS DISTINCT FROM OLD."assignedUserId"
      OR NEW."assignedRoleId" IS DISTINCT FROM OLD."assignedRoleId"
      OR NEW."delegatedFromUserId" IS DISTINCT FROM OLD."delegatedFromUserId"
      OR NEW."requiredPermissionId" IS DISTINCT FROM OLD."requiredPermissionId"
      OR NEW."routingSchemaVersion" IS DISTINCT FROM OLD."routingSchemaVersion"
      OR NEW."scopeGroupMatchMode" IS DISTINCT FROM OLD."scopeGroupMatchMode"
      OR (
        NEW."dueAt" IS DISTINCT FROM OLD."dueAt"
        AND NOT (is_activation_transition AND OLD."dueAt" IS NULL)
      )
      OR (
        NEW."activatedAt" IS DISTINCT FROM OLD."activatedAt"
        AND NOT is_activation_transition
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

COMMIT;
