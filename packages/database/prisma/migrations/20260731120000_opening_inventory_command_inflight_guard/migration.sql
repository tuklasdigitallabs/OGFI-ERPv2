BEGIN;

-- Existing commands must already conform before this migration makes their
-- unresolved semantic action unique. Do not rewrite historical commands:
-- malformed lineage is a deployment blocker rather than a backfill target.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."OpeningInventoryExecutionCommand" command
    LEFT JOIN public."OpeningInventoryCutover" cutover
      ON cutover.id = command."cutoverId"
    WHERE (
      command."commandType" IN ('FREEZE_COHORT', 'ACTIVATE_COHORT')
      AND (command."cutoverId" IS NOT NULL OR command."expectedCutoverVersion" IS NOT NULL)
    ) OR (
      command."commandType" IN ('STAGE_LOCATION', 'REVERSE_LOCATION')
      AND (command."cutoverId" IS NULL OR command."expectedCutoverVersion" IS NULL
        OR cutover.id IS NULL
        OR cutover."cohortId" IS DISTINCT FROM command."cohortId"
        OR cutover."tenantId" IS DISTINCT FROM command."tenantId"
        OR cutover."companyId" IS DISTINCT FROM command."companyId")
    )
  ) THEN
    RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_TARGET_SHAPE_OR_LINEAGE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT command."cohortId", command."commandType"
      FROM public."OpeningInventoryExecutionCommand" command
      WHERE command."cutoverId" IS NULL
        AND command.status IN (
          'PENDING'::"OpeningInventoryExecutionCommandStatus",
          'CLAIMED'::"OpeningInventoryExecutionCommandStatus",
          'FAILED_RETRYABLE'::"OpeningInventoryExecutionCommandStatus"
        )
      GROUP BY command."cohortId", command."commandType"
      HAVING count(*) > 1

      UNION ALL

      SELECT command."cutoverId", command."commandType"
      FROM public."OpeningInventoryExecutionCommand" command
      WHERE command."cutoverId" IS NOT NULL
        AND command.status IN (
          'PENDING'::"OpeningInventoryExecutionCommandStatus",
          'CLAIMED'::"OpeningInventoryExecutionCommandStatus",
          'FAILED_RETRYABLE'::"OpeningInventoryExecutionCommandStatus"
        )
      GROUP BY command."cutoverId", command."commandType"
      HAVING count(*) > 1
    ) AS duplicate_unresolved_action
  ) THEN
    RAISE EXCEPTION 'OPENING_INVENTORY_DUPLICATE_UNRESOLVED_COMMAND_ACTION'
      USING ERRCODE = '55000';
  END IF;
END; $$;

CREATE UNIQUE INDEX "OpeningInventoryExecutionCommand_unresolved_cohort_action_key"
  ON public."OpeningInventoryExecutionCommand" ("cohortId", "commandType")
  WHERE "cutoverId" IS NULL
    AND status IN (
      'PENDING'::"OpeningInventoryExecutionCommandStatus",
      'CLAIMED'::"OpeningInventoryExecutionCommandStatus",
      'FAILED_RETRYABLE'::"OpeningInventoryExecutionCommandStatus"
    );

CREATE UNIQUE INDEX "OpeningInventoryExecutionCommand_unresolved_cutover_action_key"
  ON public."OpeningInventoryExecutionCommand" ("cutoverId", "commandType")
  WHERE "cutoverId" IS NOT NULL
    AND status IN (
      'PENDING'::"OpeningInventoryExecutionCommandStatus",
      'CLAIMED'::"OpeningInventoryExecutionCommandStatus",
      'FAILED_RETRYABLE'::"OpeningInventoryExecutionCommandStatus"
    );

CREATE OR REPLACE FUNCTION public.guard_opening_inventory_execution_command_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE cutover_row public."OpeningInventoryCutover"%ROWTYPE; command_json jsonb;
BEGIN
  IF NEW."commandType" IN ('FREEZE_COHORT', 'ACTIVATE_COHORT') THEN
    IF NEW."cutoverId" IS NOT NULL OR NEW."expectedCutoverVersion" IS NOT NULL THEN
      RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_COHORT_TARGET_INVALID' USING ERRCODE = '55000';
    END IF;
  ELSIF NEW."commandType" IN ('STAGE_LOCATION', 'REVERSE_LOCATION') THEN
    IF NEW."cutoverId" IS NULL OR NEW."expectedCutoverVersion" IS NULL THEN
      RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_LOCATION_TARGET_INVALID' USING ERRCODE = '55000';
    END IF;

    SELECT * INTO cutover_row
    FROM public."OpeningInventoryCutover" cutover
    WHERE cutover.id = NEW."cutoverId";
    IF NOT FOUND
       OR cutover_row."cohortId" IS DISTINCT FROM NEW."cohortId"
       OR cutover_row."tenantId" IS DISTINCT FROM NEW."tenantId"
       OR cutover_row."companyId" IS DISTINCT FROM NEW."companyId" THEN
      RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_CUTOVER_LINEAGE_INVALID' USING ERRCODE = '55000';
    END IF;
  ELSE
    RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_TYPE_INVALID' USING ERRCODE = '55000';
  END IF;

  command_json := NEW."canonicalJson"::jsonb;
  IF jsonb_typeof(command_json) <> 'object'
     OR command_json - ARRAY['cohortId','commandType','companyId','cutoverId','expectedCohortVersion','expectedCutoverVersion','idempotencyKey','reason','requestedAuthSessionId','requestedByUserId','requestedMfaMode','requestedMfaValidUntil','requestedMfaVerifiedAt','requestedPrivilegeEpoch','requiredPermissionCode','tenantId'] <> '{}'::jsonb
     OR command_json ->> 'cohortId' IS DISTINCT FROM NEW."cohortId"::text
     OR command_json ->> 'commandType' IS DISTINCT FROM NEW."commandType"::text
     OR command_json ->> 'tenantId' IS DISTINCT FROM NEW."tenantId"::text
     OR command_json ->> 'companyId' IS DISTINCT FROM NEW."companyId"::text
     OR command_json ->> 'idempotencyKey' IS DISTINCT FROM NEW."idempotencyKey"
     OR (command_json ->> 'expectedCohortVersion')::integer IS DISTINCT FROM NEW."expectedCohortVersion"
     OR (NEW."expectedCutoverVersion" IS NOT NULL AND (command_json ->> 'expectedCutoverVersion')::integer IS DISTINCT FROM NEW."expectedCutoverVersion")
     OR (NEW."expectedCutoverVersion" IS NULL AND command_json -> 'expectedCutoverVersion' IS DISTINCT FROM 'null'::jsonb)
     OR command_json ->> 'requestedByUserId' IS DISTINCT FROM NEW."requestedByUserId"::text
     OR command_json ->> 'requestedAuthSessionId' IS DISTINCT FROM NEW."requestedAuthSessionId"::text
     OR (command_json ->> 'requestedPrivilegeEpoch')::integer IS DISTINCT FROM NEW."requestedPrivilegeEpoch"
     OR (command_json ->> 'requestedMfaVerifiedAt')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM NEW."requestedMfaVerifiedAt"
     OR command_json ->> 'requestedMfaMode' IS DISTINCT FROM NEW."requestedMfaMode"
     OR (command_json ->> 'requestedMfaValidUntil')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM NEW."requestedMfaValidUntil"
     OR command_json ->> 'requiredPermissionCode' IS DISTINCT FROM NEW."requiredPermissionCode"
     OR command_json ->> 'reason' IS DISTINCT FROM NEW."requestReason"
     OR (NEW."cutoverId" IS NOT NULL AND command_json ->> 'cutoverId' IS DISTINCT FROM NEW."cutoverId"::text)
     OR (NEW."cutoverId" IS NULL AND command_json -> 'cutoverId' IS DISTINCT FROM 'null'::jsonb)
     OR (NEW."commandType" IN ('FREEZE_COHORT', 'STAGE_LOCATION') AND NEW."requiredPermissionCode" <> 'inventory.opening_inventory.request_execute')
     OR (NEW."commandType" = 'ACTIVATE_COHORT' AND NEW."requiredPermissionCode" <> 'inventory.opening_inventory.request_activate')
     OR (NEW."commandType" = 'REVERSE_LOCATION' AND NEW."requiredPermissionCode" <> 'inventory.opening_inventory.request_reverse') THEN
    RAISE EXCEPTION 'Opening inventory command canonical payload is inconsistent' USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."UserRoleAssignment" role_assignment
      JOIN public."Role" role_record ON role_record.id = role_assignment."roleId"
      JOIN public."RolePermission" role_permission ON role_permission."roleId" = role_assignment."roleId"
      JOIN public."Permission" permission ON permission.id = role_permission."permissionId"
     WHERE role_assignment."userId" = NEW."requestedByUserId" AND role_assignment.status = 'ACTIVE'
       AND role_assignment."startsAt" <= CURRENT_TIMESTAMP AND (role_assignment."endsAt" IS NULL OR role_assignment."endsAt" > CURRENT_TIMESTAMP)
       AND role_record.status = 'ACTIVE' AND (role_record."tenantId" IS NULL OR role_record."tenantId" = NEW."tenantId")
       AND (permission."tenantId" IS NULL OR permission."tenantId" = NEW."tenantId")
       AND permission.code = NEW."requiredPermissionCode"
  ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_REQUESTER_PERMISSION_DENIED' USING ERRCODE = '42501'; END IF;
  IF EXISTS (
    SELECT 1 FROM public."OpeningInventoryCutover" cutover
      JOIN public."InventoryLocation" inventory_location ON inventory_location.id = cutover."inventoryLocationId"
     WHERE cutover."cohortId" = NEW."cohortId" AND cutover."tenantId" = NEW."tenantId" AND cutover."companyId" = NEW."companyId"
       AND (NEW."commandType" IN ('FREEZE_COHORT', 'ACTIVATE_COHORT') OR cutover.id = NEW."cutoverId")
       AND NOT EXISTS (
         SELECT 1 FROM public."UserScopeAssignment" scope_assignment
          WHERE scope_assignment."userId" = NEW."requestedByUserId" AND scope_assignment.status = 'ACTIVE'
            AND scope_assignment."startsAt" <= CURRENT_TIMESTAMP AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > CURRENT_TIMESTAMP)
            AND scope_assignment."accessLevel" IN ('APPROVE', 'MANAGE')
            AND ((scope_assignment."scopeType" = 'LOCATION' AND scope_assignment."scopeId" = inventory_location."locationId")
              OR (scope_assignment."scopeType" = 'COMPANY' AND scope_assignment."scopeId" = NEW."companyId"))
       )
  ) THEN RAISE EXCEPTION 'OPENING_INVENTORY_COMMAND_REQUESTER_SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_opening_inventory_command_requester_segregation(NEW."cohortId", NEW."requestedByUserId", NEW."commandType");
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_opening_inventory_execution_command_scope() FROM PUBLIC;

COMMIT;
