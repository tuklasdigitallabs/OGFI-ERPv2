\set ON_ERROR_STOP on

SELECT set_config('ogfi.contract.database', :'database_name', false);
SELECT set_config('ogfi.contract.owner_role', :'owner_role', false);
SELECT set_config('ogfi.contract.migrator_role', :'migrator_role', false);
SELECT set_config('ogfi.contract.runtime_role', :'runtime_role', false);

DO $reconcile$
DECLARE
  database_name text := current_setting('ogfi.contract.database');
  owner_role text := current_setting('ogfi.contract.owner_role');
  migrator_role text := current_setting('ogfi.contract.migrator_role');
  runtime_role text := current_setting('ogfi.contract.runtime_role');
  obj record;
  grantee_obj record;
  protected_table text;
  column_name text;
  owner_oid oid;
  migrator_oid oid;
  runtime_oid oid;
  approval_shadow_schema_oid oid;
BEGIN
  IF current_database() <> database_name THEN
    RAISE EXCEPTION 'Refusing ownership reconciliation for unexpected database';
  END IF;
  SELECT oid INTO STRICT owner_oid FROM pg_roles WHERE rolname = owner_role AND NOT rolcanlogin;
  SELECT oid INTO STRICT migrator_oid FROM pg_roles WHERE rolname = migrator_role;
  SELECT oid INTO STRICT runtime_oid FROM pg_roles WHERE rolname = runtime_role;
  IF session_user <> migrator_role OR current_user <> owner_role THEN
    RAISE EXCEPTION 'Ownership reconciliation requires the controlled migrator with owner role active';
  END IF;
  IF (SELECT count(*) FROM pg_auth_members
      WHERE roleid IN (owner_oid, migrator_oid, runtime_oid)
         OR member IN (owner_oid, migrator_oid, runtime_oid)) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM pg_auth_members
       WHERE roleid = owner_oid AND member = migrator_oid
         AND NOT admin_option AND NOT inherit_option AND set_option
     ) THEN
    RAISE EXCEPTION 'Refusing reconciliation: controlled role membership graph is not exact';
  END IF;

  EXECUTE format('ALTER DATABASE %I OWNER TO %I', database_name, owner_role);
  EXECUTE format('ALTER SCHEMA public OWNER TO %I', owner_role);

  FOR obj IN
    SELECT c.oid, c.relkind, n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND c.relowner <> owner_oid
    ORDER BY c.oid
  LOOP
    EXECUTE CASE obj.relkind
      WHEN 'S' THEN format('ALTER SEQUENCE %I.%I OWNER TO %I', obj.nspname, obj.relname, owner_role)
      WHEN 'v' THEN format('ALTER VIEW %I.%I OWNER TO %I', obj.nspname, obj.relname, owner_role)
      WHEN 'm' THEN format('ALTER MATERIALIZED VIEW %I.%I OWNER TO %I', obj.nspname, obj.relname, owner_role)
      WHEN 'f' THEN format('ALTER FOREIGN TABLE %I.%I OWNER TO %I', obj.nspname, obj.relname, owner_role)
      ELSE format('ALTER TABLE %I.%I OWNER TO %I', obj.nspname, obj.relname, owner_role)
    END;
  END LOOP;

  FOR obj IN
    SELECT p.oid, p.prokind, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proowner <> owner_oid
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    ORDER BY p.oid
  LOOP
    EXECUTE CASE obj.prokind
      WHEN 'p' THEN format('ALTER PROCEDURE %I.%I(%s) OWNER TO %I', obj.nspname, obj.proname, obj.args, owner_role)
      WHEN 'a' THEN format('ALTER AGGREGATE %I.%I(%s) OWNER TO %I', obj.nspname, obj.proname, obj.args, owner_role)
      ELSE format('ALTER FUNCTION %I.%I(%s) OWNER TO %I', obj.nspname, obj.proname, obj.args, owner_role)
    END;
  END LOOP;

  FOR obj IN
    SELECT t.oid, t.typtype, n.nspname, t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typowner <> owner_oid AND t.typrelid = 0
      AND t.typtype IN ('e', 'd')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
    ORDER BY t.oid
  LOOP
    EXECUTE CASE obj.typtype
      WHEN 'd' THEN format('ALTER DOMAIN %I.%I OWNER TO %I', obj.nspname, obj.typname, owner_role)
      ELSE format('ALTER TYPE %I.%I OWNER TO %I', obj.nspname, obj.typname, owner_role)
    END;
  END LOOP;

  -- The controlled migration runs before reconciliation. Keep this conditional
  -- so predecessor databases can still be reconciled during rollout, while the
  -- post-migration verifier below the deployment path requires the schema and
  -- its exact closed routine set. No runtime or auxiliary role receives access.
  SELECT oid INTO approval_shadow_schema_oid
  FROM pg_namespace
  WHERE nspname = 'approval_shadow';
  IF approval_shadow_schema_oid IS NOT NULL THEN
    -- pgcrypto is installed by the baseline migration. Fixed SHA-256 prosrc
    -- digests detect body drift before any ownership or ACL mutation.
    IF (SELECT count(*) FROM pg_proc WHERE pronamespace = approval_shadow_schema_oid) <> 18 THEN
      RAISE EXCEPTION 'Refusing reconciliation: approval_shadow routine count differs from the reviewed contract';
    END IF;
    FOR obj IN
      SELECT expected.routine_name, expected.body_sha256, p.*
      FROM (VALUES
        ('observe_purchase_request_v1', 'd80583a4d50cff3b32c9edbbb361398b91dcb449b227843bb1b301610bbcd40a'),
        ('observe_quotation_recommendation_v1', '09a686729504b52ec9e9452a04292be67240de2d88bd07b9fca8ba54ae245967'),
        ('observe_purchase_order_v1', '73f8f57afca59e7a4e2d702714ee4a08168fce0d90222cb517992603d4ba51ed'),
        ('observe_purchase_order_balance_closure_v1', '80ad1ba0a12e374cd15faebe8daad40e47370c9caf23fc0af0a1a4598e6f7a29'),
        ('observe_purchase_order_amendment_v1', '5a4878935656a5c34656f0bff91796fc8cfe04380a38e9ab6ef7d82f1cc625d6'),
        ('observe_wastage_report_v1', '25664273c2128874f7c5deef115bcc55131141ebfacf5ec9a3bb2ba63e2e36d7'),
        ('observe_stock_adjustment_v1', '57c0eaf9ec6562170416101876c88e173b67f377c731515479b53a554b013c0a'),
        ('observe_finance_close_run_v1', '1b7aff53e067e252e9ec82b0f3068d0b4abb3acf197da28437c33b795bc783d5'),
        ('observe_budget_revision_v1', 'c4b75ca7c41c8dfb9e3dae7bcbf32f51037955f246e0b7508da5f5102c440819'),
        ('observe_expense_request_v1', '7d7cd704a871b9a812e37965b5195aa3b92a8e50fdd9bc2ac3562c8761f04c2b'),
        ('observe_cash_advance_request_v1', 'd7064ee9ccab52a7e4f8e1cf606c4e4d5e736b5d975949c23545cbed57b3570f'),
        ('observe_petty_cash_request_v1', 'f7b2a196715e035740421c87ca9a85df096d86c0f4628aa522b97194b0b8a769'),
        ('observe_payment_request_v1', '69badce51b13735d771402a24ed77f735c5c137dcf19ba9cd7c0a6d69a7f392f'),
        ('observe_payment_release_v1', 'dc0221e6ff7dd5375924e420c24de744f7685aef311bf171fb80d8b207f004e6'),
        ('observe_employee_leave_request_v1', '3688bf14ab17d8379530dd47d4205937b790c59e3760ffbef93229549e0d758b'),
        ('observe_employee_overtime_record_v1', '7e0e6476f762be2ffba899c7b2e767e6041285580c4ed28d32e2b0355b1785a6'),
        ('observe_workforce_schedule_v1', 'be41b7ed31dcc08d4451a9e1c93c7a74408fc4b4e1ede68b32ba6de219590039'),
        ('observe_attendance_import_batch_v1', '4a9217f645bc8479c5680a8bde77b955ab6da918593d0bc7a55a6b48b74c2500')
      ) AS expected(routine_name, body_sha256)
      LEFT JOIN pg_proc p
        ON p.pronamespace = approval_shadow_schema_oid
       AND p.proname = expected.routine_name
    LOOP
      IF obj.oid IS NULL
         OR obj.prokind <> 'f'
         OR obj.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'sql')
         OR obj.pronargs <> 3
         OR obj.proargtypes <> '2950 2950 2950'::oidvector
         OR obj.pronargdefaults <> 0
         OR obj.proargnames IS DISTINCT FROM ARRAY['p_tenant_id', 'p_company_id', 'p_approval_instance_id']::text[]
         OR obj.proallargtypes IS NOT NULL
         OR obj.proargmodes IS NOT NULL
         OR obj.proretset
         OR obj.prorettype <> 'text'::regtype
         OR obj.prosecdef
         OR obj.provolatile <> 's'
         OR obj.proparallel <> 'u'
         OR obj.proleakproof
         OR obj.proisstrict
         OR obj.prosqlbody IS NOT NULL
         OR obj.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
         OR encode(pg_catalog.sha256(convert_to(obj.prosrc, 'UTF8')), 'hex') <> obj.body_sha256 THEN
        RAISE EXCEPTION 'Refusing reconciliation: approval_shadow routine % metadata/body attestation failed', obj.routine_name;
      END IF;
    END LOOP;
    EXECUTE format('ALTER SCHEMA approval_shadow OWNER TO %I', owner_role);

    FOR obj IN
      SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      WHERE p.pronamespace = approval_shadow_schema_oid
        AND p.prokind = 'f'
        AND p.proname = ANY (ARRAY[
          'observe_purchase_request_v1',
          'observe_quotation_recommendation_v1',
          'observe_purchase_order_v1',
          'observe_purchase_order_balance_closure_v1',
          'observe_purchase_order_amendment_v1',
          'observe_wastage_report_v1',
          'observe_stock_adjustment_v1',
          'observe_finance_close_run_v1',
          'observe_budget_revision_v1',
          'observe_expense_request_v1',
          'observe_cash_advance_request_v1',
          'observe_petty_cash_request_v1',
          'observe_payment_request_v1',
          'observe_payment_release_v1',
          'observe_employee_leave_request_v1',
          'observe_employee_overtime_record_v1',
          'observe_workforce_schedule_v1',
          'observe_attendance_import_batch_v1'
        ]::text[])
        AND p.pronargs = 3
        AND p.proargtypes[0] = 'uuid'::regtype
        AND p.proargtypes[1] = 'uuid'::regtype
        AND p.proargtypes[2] = 'uuid'::regtype
      ORDER BY p.oid
    LOOP
      EXECUTE format(
        'ALTER FUNCTION approval_shadow.%I(%s) OWNER TO %I',
        obj.proname,
        obj.args,
        owner_role
      );
    END LOOP;

    REVOKE ALL ON SCHEMA approval_shadow FROM PUBLIC;
    EXECUTE format('REVOKE ALL ON SCHEMA approval_shadow FROM %I', runtime_role);
    FOR obj IN
      SELECT DISTINCT grantee.rolname AS grantee_role
      FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(n.nspacl) acl
      JOIN pg_roles grantee ON grantee.oid = acl.grantee
      WHERE n.oid = approval_shadow_schema_oid
        AND acl.grantee NOT IN (0, owner_oid)
    LOOP
      EXECUTE format('REVOKE ALL ON SCHEMA approval_shadow FROM %I', obj.grantee_role);
    END LOOP;

    FOR obj IN
      SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      WHERE p.pronamespace = approval_shadow_schema_oid
      ORDER BY p.oid
    LOOP
      EXECUTE format(
        'REVOKE ALL ON ROUTINE approval_shadow.%I(%s) FROM PUBLIC',
        obj.proname,
        obj.args
      );
      EXECUTE format(
        'REVOKE ALL ON ROUTINE approval_shadow.%I(%s) FROM %I',
        obj.proname,
        obj.args,
        runtime_role
      );
      FOR grantee_obj IN
        SELECT DISTINCT grantee.rolname AS grantee_role
        FROM pg_proc routine
        CROSS JOIN LATERAL aclexplode(routine.proacl) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE routine.oid = obj.oid
          AND acl.grantee NOT IN (0, owner_oid)
      LOOP
        EXECUTE format(
          'REVOKE ALL ON ROUTINE approval_shadow.%I(%s) FROM %I',
          obj.proname,
          obj.args,
          grantee_obj.grantee_role
        );
      END LOOP;
    END LOOP;

    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON FUNCTIONS FROM PUBLIC',
      owner_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON FUNCTIONS FROM %I',
      owner_role,
      runtime_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA approval_shadow REVOKE ALL ON FUNCTIONS FROM PUBLIC',
      owner_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA approval_shadow REVOKE ALL ON FUNCTIONS FROM %I',
      owner_role,
      runtime_role
    );
    FOR obj IN
      SELECT DISTINCT d.defaclnamespace, grantee.rolname AS grantee_role
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
      JOIN pg_roles grantee ON grantee.oid = acl.grantee
      WHERE d.defaclrole = owner_oid
        AND d.defaclobjtype = 'f'
        AND d.defaclnamespace IN (0, approval_shadow_schema_oid)
        AND acl.grantee NOT IN (0, owner_oid)
    LOOP
      IF obj.defaclnamespace = 0 THEN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON FUNCTIONS FROM %I',
          owner_role,
          obj.grantee_role
        );
      ELSE
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA approval_shadow REVOKE ALL ON FUNCTIONS FROM %I',
          owner_role,
          obj.grantee_role
        );
      END IF;
    END LOOP;
  END IF;

  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', database_name);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I, %I', database_name, migrator_role, runtime_role);
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', runtime_role);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', runtime_role);

  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', runtime_role);
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', runtime_role);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', runtime_role);
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', runtime_role);

  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC', owner_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', owner_role, runtime_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', owner_role, runtime_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC', owner_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', owner_role, runtime_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', owner_role, runtime_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC', owner_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', owner_role, runtime_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON FUNCTIONS FROM PUBLIC', owner_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON FUNCTIONS FROM %I', owner_role, runtime_role);

  FOR obj IN
    SELECT p.oid, p.prokind, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON ROUTINE %I.%I(%s) FROM PUBLIC', obj.nspname, obj.proname, obj.args);
    EXECUTE format('REVOKE ALL ON ROUTINE %I.%I(%s) FROM %I', obj.nspname, obj.proname, obj.args, runtime_role);
  END LOOP;

  -- Runtime append-only qualification inserts evaluate CHECK constraints that
  -- call this immutable canonicalizer. Restore only this exact routine after
  -- the blanket routine revocation above.
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.controlled_evidence_canonical_json(JSONB) TO %I',
    runtime_role
  );
  -- Runtime typed-intent checks call only the pure JSON canonicalizer. The
  -- revision projection belongs to the migrator-owned configuration plane and
  -- deliberately remains unavailable to the shared application runtime.
  IF to_regprocedure('public.inventory_pilot_canonical_json(jsonb)') IS NOT NULL THEN
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.inventory_pilot_canonical_json(JSONB) TO %I',
      runtime_role
    );
  END IF;

  FOREACH protected_table IN ARRAY ARRAY[
    'AuditEvent',
    'ProjectActivityEvent',
    'InventoryMovement',
    'PettyCashApprovalStepIntent',
    'AttachmentScanAttempt',
    'ControlledEvidenceActionQualification',
    'ControlledEvidenceActionSelection'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', protected_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', protected_table, runtime_role);
    FOR column_name IN
      SELECT a.attname
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC', column_name, protected_table);
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %I', column_name, protected_table, runtime_role);
    END LOOP;
    EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO %I', protected_table, runtime_role);
  END LOOP;

  -- DEC-0261: pilot configuration, membership, and activation authority is a
  -- migrator-owned control plane. Runtime may classify against it but cannot
  -- manufacture or alter cohort authority.
  FOREACH protected_table IN ARRAY ARRAY[
    'InventoryPilotConfigurationRevision',
    'InventoryPilotEndpointMembership',
    'InventoryPilotItemMembership',
    'InventoryPilotFamilyActivationEvent',
    'InventoryPilotFamilyActivation'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', protected_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', protected_table, runtime_role);
    FOR column_name IN
      SELECT a.attname
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC', column_name, protected_table);
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %I', column_name, protected_table, runtime_role);
    END LOOP;
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO %I', protected_table, runtime_role);
  END LOOP;

  -- Submission intents are immutable application evidence: runtime can append
  -- and read them, never rewrite, delete, truncate, trigger, or reference them.
  FOREACH protected_table IN ARRAY ARRAY[
    'InventoryTransferApprovalSubmissionIntent',
    'StockCountReviewSubmissionIntent'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', protected_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', protected_table, runtime_role);
    FOR column_name IN
      SELECT a.attname
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC', column_name, protected_table);
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %I', column_name, protected_table, runtime_role);
    END LOOP;
    EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO %I', protected_table, runtime_role);
  END LOOP;
  -- DEC-0245 Option D keeps the orchestration executor non-operational until a
  -- separately governed maintenance-role boundary exists. Remove the blanket
  -- runtime defaults above, including any stale column grants, from the three
  -- orchestration tables and the dormant producer-barrier evidence relations.
  FOREACH protected_table IN ARRAY ARRAY[
    'ApprovalRoutingBackfillRun',
    'ApprovalRoutingBackfillBatch',
    'ApprovalRoutingBackfillBlockerObservation',
    'ApprovalRoutingProducerBarrierGeneration',
    'ApprovalRoutingProducerProvenance'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', protected_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', protected_table, runtime_role);
    FOR column_name IN
      SELECT a.attname
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC', column_name, protected_table);
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %I', column_name, protected_table, runtime_role);
    END LOOP;
  END LOOP;
  IF to_regprocedure('public.acquire_approval_routing_producer_barrier_shared(uuid,uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.acquire_approval_routing_producer_barrier_shared(UUID, UUID, TEXT) FROM PUBLIC;
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.acquire_approval_routing_producer_barrier_shared(UUID, UUID, TEXT) TO %I',
      runtime_role
    );
  END IF;
  IF to_regprocedure('public.acquire_approval_routing_producer_barrier_exclusive(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.acquire_approval_routing_producer_barrier_exclusive(UUID, UUID) FROM PUBLIC;
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.acquire_approval_routing_producer_barrier_exclusive(UUID, UUID) FROM %I',
      runtime_role
    );
  END IF;
  FOREACH protected_table IN ARRAY ARRAY[
    'ControlledEvidencePolicyVersion',
    'ControlledEvidencePolicyActivationEvent'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', protected_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', protected_table, runtime_role);
    FOR column_name IN
      SELECT a.attname
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC', column_name, protected_table);
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %I', column_name, protected_table, runtime_role);
    END LOOP;
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO %I', protected_table, runtime_role);
  END LOOP;
  REVOKE ALL ON TABLE public."ControlledEvidencePolicyActivation" FROM PUBLIC;
  EXECUTE format('REVOKE ALL ON TABLE public."ControlledEvidencePolicyActivation" FROM %I', runtime_role);
  FOR column_name IN
    SELECT a.attname
    FROM pg_attribute a
    WHERE a.attrelid = 'public."ControlledEvidencePolicyActivation"'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    EXECUTE format('REVOKE ALL (%I) ON TABLE public."ControlledEvidencePolicyActivation" FROM PUBLIC', column_name);
    EXECUTE format('REVOKE ALL (%I) ON TABLE public."ControlledEvidencePolicyActivation" FROM %I', column_name, runtime_role);
  END LOOP;
  EXECUTE format('GRANT SELECT ON TABLE public."ControlledEvidencePolicyActivation" TO %I', runtime_role);
  EXECUTE format('GRANT UPDATE ("updatedAt") ON TABLE public."ControlledEvidencePolicyActivation" TO %I', runtime_role);
  IF to_regclass('public."AuthorizationDenialBucket"') IS NOT NULL THEN
    REVOKE ALL ON TABLE public."AuthorizationDenialBucket" FROM PUBLIC;
    EXECUTE format('REVOKE UPDATE, DELETE ON TABLE public."AuthorizationDenialBucket" FROM %I', runtime_role);
    FOR column_name IN
      SELECT a.attname
      FROM pg_attribute a
      WHERE a.attrelid = 'public."AuthorizationDenialBucket"'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public."AuthorizationDenialBucket" FROM PUBLIC', column_name);
      EXECUTE format('REVOKE ALL (%I) ON TABLE public."AuthorizationDenialBucket" FROM %I', column_name, runtime_role);
    END LOOP;
    EXECUTE format(
      'GRANT UPDATE ("denialCount", "lastDeniedAt", "updatedAt", "finalizedAt", "finalAuditEventId") ON TABLE public."AuthorizationDenialBucket" TO %I',
      runtime_role
    );
  END IF;
  IF to_regclass('public."AuthenticationThrottleWindow"') IS NOT NULL THEN
    REVOKE ALL ON TABLE public."AuthenticationThrottleWindow" FROM PUBLIC;
    EXECUTE format('REVOKE ALL ON TABLE public."AuthenticationThrottleWindow" FROM %I', runtime_role);
    FOR column_name IN
      SELECT a.attname
      FROM pg_attribute a
      WHERE a.attrelid = 'public."AuthenticationThrottleWindow"'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public."AuthenticationThrottleWindow" FROM PUBLIC', column_name);
      EXECUTE format('REVOKE ALL (%I) ON TABLE public."AuthenticationThrottleWindow" FROM %I', column_name, runtime_role);
    END LOOP;
    EXECUTE format(
      'GRANT SELECT, INSERT, DELETE ON TABLE public."AuthenticationThrottleWindow" TO %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT UPDATE ("requestCount", "failureReservationCount", "successCount", "deniedCount", "lastRequestAt", "thresholdReachedAt", "updatedAt") ON TABLE public."AuthenticationThrottleWindow" TO %I',
      runtime_role
    );
  END IF;
  IF to_regclass('public."AuthenticationThrottleControl"') IS NOT NULL THEN
    REVOKE ALL ON TABLE public."AuthenticationThrottleControl" FROM PUBLIC;
    EXECUTE format('REVOKE ALL ON TABLE public."AuthenticationThrottleControl" FROM %I', runtime_role);
    EXECUTE format('GRANT SELECT ON TABLE public."AuthenticationThrottleControl" TO %I', runtime_role);
  END IF;
  IF to_regprocedure('public.lock_authentication_throttle_control()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.lock_authentication_throttle_control() FROM PUBLIC;
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.lock_authentication_throttle_control() TO %I',
      runtime_role
    );
  END IF;
  IF to_regprocedure('public.operator_transition_authentication_throttle_control(bigint,"AuthenticationThrottleControlStatus",integer,text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.operator_transition_authentication_throttle_control(
      BIGINT, "AuthenticationThrottleControlStatus", INTEGER, TEXT, TEXT
    ) FROM PUBLIC;
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.operator_transition_authentication_throttle_control(BIGINT, "AuthenticationThrottleControlStatus", INTEGER, TEXT, TEXT) FROM %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.operator_transition_authentication_throttle_control(BIGINT, "AuthenticationThrottleControlStatus", INTEGER, TEXT, TEXT) TO %I',
      migrator_role
    );
  END IF;
  IF to_regclass('public."AuthLoginAttempt"') IS NOT NULL THEN
    REVOKE ALL ON TABLE public."AuthLoginAttempt" FROM PUBLIC;
    EXECUTE format('REVOKE ALL ON TABLE public."AuthLoginAttempt" FROM %I', runtime_role);
    FOR column_name IN
      SELECT a.attname
      FROM pg_attribute a
      WHERE a.attrelid = 'public."AuthLoginAttempt"'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public."AuthLoginAttempt" FROM PUBLIC', column_name);
      EXECUTE format('REVOKE ALL (%I) ON TABLE public."AuthLoginAttempt" FROM %I', column_name, runtime_role);
    END LOOP;
    EXECUTE format('GRANT SELECT, DELETE ON TABLE public."AuthLoginAttempt" TO %I', runtime_role);
  END IF;
  EXECUTE format('REVOKE ALL ON TABLE public._prisma_migrations FROM PUBLIC');
  EXECUTE format('REVOKE ALL ON TABLE public._prisma_migrations FROM %I', runtime_role);

  IF to_regprocedure('public.reject_protected_history_mutation()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.reject_protected_history_mutation() FROM PUBLIC;
    EXECUTE format('REVOKE ALL ON FUNCTION public.reject_protected_history_mutation() FROM %I', runtime_role);
  END IF;
  IF to_regprocedure('public.reject_dormant_approval_routing_evidence_insert()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.reject_dormant_approval_routing_evidence_insert() FROM PUBLIC;
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.reject_dormant_approval_routing_evidence_insert() FROM %I',
      runtime_role
    );
  END IF;
END
$reconcile$;

SELECT 'RESULT | PASS | PostgreSQL ownership and least-privilege grants reconciled.';
