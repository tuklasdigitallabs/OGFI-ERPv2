\set ON_ERROR_STOP on

-- DEC-0263. Run only as the database/cluster administrator after the ordinary
-- controlled-migrator reconciliation. This isolated handoff is necessary
-- because the generic owner deliberately has no membership in the dedicated
-- opening-stock owner role; attempting this inside reconciliation would either
-- fail or weaken the role graph.
SELECT set_config('ogfi.contract.database_name', :'database_name', false);
SELECT set_config('ogfi.contract.owner_role', :'owner_role', false);
SELECT set_config('ogfi.contract.migrator_role', :'migrator_role', false);
SELECT set_config('ogfi.contract.runtime_role', :'runtime_role', false);

DO $handoff$
DECLARE
  database_name text := current_setting('ogfi.contract.database_name');
  owner_role text := current_setting('ogfi.contract.owner_role');
  migrator_role text := current_setting('ogfi.contract.migrator_role');
  runtime_role text := current_setting('ogfi.contract.runtime_role');
  opening_owner_role text := regexp_replace(current_setting('ogfi.contract.owner_role'), '_owner$', '_opening_stock_owner');
  opening_executor_role text := regexp_replace(current_setting('ogfi.contract.owner_role'), '_owner$', '_opening_stock_executor');
  routine_name text;
  table_name text;
  column_name text;
BEGIN
  IF current_database() <> database_name OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = session_user AND rolsuper) THEN
    RAISE EXCEPTION 'Opening-stock owner handoff requires the target database cluster administrator';
  END IF;
  IF session_user IN (owner_role, migrator_role, runtime_role, opening_owner_role, opening_executor_role) OR current_user <> session_user THEN
    RAISE EXCEPTION 'Opening-stock owner handoff must use a direct administrator session without a controlled role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = opening_owner_role AND NOT rolcanlogin)
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = opening_executor_role AND rolcanlogin AND NOT rolinherit) THEN
    RAISE EXCEPTION 'Opening-stock roles have not passed bootstrap';
  END IF;
  IF to_regprocedure('public.execute_opening_inventory_command(uuid)') IS NULL
     OR to_regprocedure('public.append_opening_inventory_cohort_seal_event()') IS NULL THEN
    RAISE EXCEPTION 'Opening-stock routines are absent; refusing partial handoff';
  END IF;

  EXECUTE format('ALTER FUNCTION public.execute_opening_inventory_command(uuid) OWNER TO %I', opening_owner_role);
  EXECUTE format('ALTER FUNCTION public.append_opening_inventory_cohort_seal_event() OWNER TO %I', opening_owner_role);
  EXECUTE format('REVOKE ALL ON FUNCTION public.execute_opening_inventory_command(uuid) FROM PUBLIC');
  EXECUTE format('REVOKE ALL ON FUNCTION public.append_opening_inventory_cohort_seal_event() FROM PUBLIC');
  EXECUTE format('REVOKE ALL ON FUNCTION public.execute_opening_inventory_command(uuid) FROM %I', runtime_role);
  EXECUTE format('REVOKE ALL ON FUNCTION public.append_opening_inventory_cohort_seal_event() FROM %I', runtime_role);
  EXECUTE format('REVOKE ALL ON FUNCTION public.append_opening_inventory_cohort_seal_event() FROM %I', opening_executor_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.execute_opening_inventory_command(uuid) TO %I', opening_executor_role);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', opening_owner_role);

  FOREACH routine_name IN ARRAY ARRAY[
    'public.is_opening_inventory_executor_session()',
    'public.is_opening_inventory_executor_context()',
    'public.opening_inventory_utc_json_timestamp(timestamp without time zone)',
    'public.assert_opening_inventory_cohort_manifest(uuid)',
    'public.assert_opening_inventory_cutover_facts(uuid)',
    'public.assert_opening_inventory_command_requester_segregation(uuid,uuid,"OpeningInventoryExecutionCommandType")'
  ] LOOP
    IF to_regprocedure(routine_name) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', routine_name);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', routine_name, runtime_role);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', routine_name, opening_executor_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', routine_name, opening_owner_role);
    END IF;
  END LOOP;
  -- These pure helpers are required by runtime-owned insert guards and command
  -- request validation. They expose no write authority and remain unavailable
  -- to PUBLIC and the executor login.
  FOREACH routine_name IN ARRAY ARRAY[
    'public.is_opening_inventory_executor_session()',
    'public.is_opening_inventory_executor_context()',
    'public.opening_inventory_utc_json_timestamp(timestamp without time zone)',
    'public.assert_opening_inventory_command_requester_segregation(uuid,uuid,"OpeningInventoryExecutionCommandType")'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', routine_name, runtime_role);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['OpeningInventoryCohort','OpeningInventoryCutover','OpeningInventoryCutoverLine','StockCountAttempt','StockCountAttemptLine','StockCountSession','InventoryPilotConfigurationRevision','InventoryPilotEndpointMembership','InventoryPilotItemMembership','CompanyPolicySetting','AuthSession','User','Role','UserRoleAssignment','RolePermission','Permission','UserScopeAssignment','InventoryLocation','ControlledEvidenceAttachment','Attachment','AttachmentScanAttempt','ApprovalInstance','ApprovalInstanceStep','OpeningInventoryApprovalAttestation','OpeningInventoryExecutionCommand','OpeningInventoryReconciliation','OpeningInventoryCohortEvent','InventoryMovement','InventoryBalance','AuditEvent'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, opening_owner_role);
    FOR column_name IN SELECT attribute.attname FROM pg_attribute attribute WHERE attribute.attrelid = format('public.%I', table_name)::regclass AND attribute.attnum > 0 AND NOT attribute.attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %I', column_name, table_name, opening_owner_role);
    END LOOP;
  END LOOP;
  EXECUTE format('GRANT SELECT ON TABLE public."OpeningInventoryCohort", public."OpeningInventoryCutover", public."OpeningInventoryCutoverLine", public."StockCountAttempt", public."StockCountAttemptLine", public."StockCountSession", public."InventoryPilotConfigurationRevision", public."InventoryPilotEndpointMembership", public."InventoryPilotItemMembership", public."CompanyPolicySetting", public."AuthSession", public."User", public."Role", public."UserRoleAssignment", public."RolePermission", public."Permission", public."UserScopeAssignment", public."InventoryLocation", public."ControlledEvidenceAttachment", public."Attachment", public."AttachmentScanAttempt", public."ApprovalInstance", public."ApprovalInstanceStep", public."OpeningInventoryApprovalAttestation", public."OpeningInventoryExecutionCommand", public."InventoryMovement", public."InventoryBalance" TO %I', opening_owner_role);
  EXECUTE format('GRANT SELECT ON TABLE public."OpeningInventoryCohortEvent" TO %I', opening_owner_role);
  EXECUTE format('GRANT UPDATE (status, version, "frozenAt", "frozenByUserId", "activatedAt", "activatedByUserId", "reversedAt", "reversedByUserId", "reversalReason", "updatedAt") ON TABLE public."OpeningInventoryCohort" TO %I', opening_owner_role);
  EXECUTE format('GRANT UPDATE (status, version, "stagedAt", "reconciledAt", "reversalRequestedAt", "reversedAt", "reversalReason", "updatedAt") ON TABLE public."OpeningInventoryCutover" TO %I', opening_owner_role);
  EXECUTE format('GRANT UPDATE ("postedMovementId") ON TABLE public."OpeningInventoryCutoverLine" TO %I', opening_owner_role);
  EXECUTE format('GRANT UPDATE (status, "claimedAt", "claimedByExecutor", "completedAt", "failureCode", "failureDetail") ON TABLE public."OpeningInventoryExecutionCommand" TO %I', opening_owner_role);
  -- PostgreSQL requires UPDATE authority to acquire the same InventoryLocation
  -- FOR UPDATE row lock used by ordinary inventory posting. Limit that
  -- authority to the operational timestamp column; the pinned executor body
  -- never mutates the location row.
  EXECUTE format('GRANT UPDATE ("updatedAt") ON TABLE public."InventoryLocation" TO %I', opening_owner_role);
  EXECUTE format('GRANT INSERT ("cutoverId", "tenantId", "companyId", "inventoryLocationId", "reconciliationType", "lineCount", "quantityDigest", "valuationDigest", "reconciliationJson", "reconciliationDigest", "reconciledByUserId", "reconciledAt") ON TABLE public."OpeningInventoryReconciliation" TO %I', opening_owner_role);
  EXECUTE format('GRANT INSERT ("cohortId", "tenantId", "companyId", "sequenceNumber", "eventType", "priorEventId", "canonicalJson", "eventDigest", "actorUserId", "occurredAt") ON TABLE public."OpeningInventoryCohortEvent" TO %I', opening_owner_role);
  EXECUTE format('GRANT INSERT ("tenantId", "companyId", "inventoryLocationId", "itemId", "movementType", "occurredAt", "enteredQuantity", "enteredUomId", "quantityDeltaBaseUom", "baseUomId", "lotNumber", "expiryDate", "unitCost", "totalCost", "sourceDocumentType", "sourceDocumentId", "sourceDocumentLineId", "sourceEventKey", "reasonCode", notes, "postedByUserId") ON TABLE public."InventoryMovement" TO %I', opening_owner_role);
  EXECUTE format('GRANT INSERT (id, "tenantId", "companyId", "actorUserId", "eventType", "entityType", "entityId", "occurredAt", metadata) ON TABLE public."AuditEvent" TO %I', opening_owner_role);
END
$handoff$;

SELECT 'RESULT | PASS | Opening-stock SECURITY DEFINER ownership handed off by administrator.';
