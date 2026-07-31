\set ON_ERROR_STOP on

SELECT set_config('ogfi.contract.verification_mode', :'verification_mode', false);
SELECT set_config('ogfi.contract.database', :'database_name', false);
SELECT set_config('ogfi.contract.owner_role', :'owner_role', false);
SELECT set_config('ogfi.contract.migrator_role', :'migrator_role', false);
SELECT set_config('ogfi.contract.runtime_role', :'runtime_role', false);

DO $verify$
DECLARE
  verification_mode text := current_setting('ogfi.contract.verification_mode');
  database_name text := current_setting('ogfi.contract.database');
  owner_role text := current_setting('ogfi.contract.owner_role');
  migrator_role text := current_setting('ogfi.contract.migrator_role');
  runtime_role text := current_setting('ogfi.contract.runtime_role');
  opening_stock_owner_role text := regexp_replace(owner_role, '_owner$', '_opening_stock_owner');
  opening_stock_executor_role text := regexp_replace(owner_role, '_owner$', '_opening_stock_executor');
  protected_table text;
  destructive_privilege text;
  obj record;
  owner_oid oid;
  migrator_oid oid;
  runtime_oid oid;
  opening_stock_owner_oid oid;
  opening_stock_executor_oid oid;
  public_schema_oid oid;
  approval_shadow_schema_oid oid;
  allowed_columns text[];
BEGIN
  IF current_database() <> database_name THEN RAISE EXCEPTION 'Unexpected database identity'; END IF;
  IF verification_mode = 'runtime' THEN
    IF session_user <> runtime_role OR current_user <> runtime_role THEN RAISE EXCEPTION 'Runtime session identity mismatch'; END IF;
  ELSIF verification_mode = 'owner' THEN
    IF session_user <> migrator_role OR current_user <> owner_role THEN RAISE EXCEPTION 'Controlled migrator/owner session identity mismatch'; END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported verification mode';
  END IF;

  PERFORM 1 FROM pg_roles WHERE rolname = owner_role AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owner role attributes are unsafe'; END IF;
  PERFORM 1 FROM pg_roles WHERE rolname = migrator_role AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls;
  IF NOT FOUND THEN RAISE EXCEPTION 'Migrator role attributes are unsafe'; END IF;
  PERFORM 1 FROM pg_roles WHERE rolname = runtime_role AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls;
  IF NOT FOUND THEN RAISE EXCEPTION 'Runtime role attributes are unsafe'; END IF;
  PERFORM 1 FROM pg_roles WHERE rolname = opening_stock_owner_role AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opening-stock owner role attributes are unsafe'; END IF;
  PERFORM 1 FROM pg_roles WHERE rolname = opening_stock_executor_role AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opening-stock executor role attributes are unsafe'; END IF;

  SELECT oid INTO STRICT owner_oid FROM pg_roles WHERE rolname = owner_role;
  SELECT oid INTO STRICT migrator_oid FROM pg_roles WHERE rolname = migrator_role;
  SELECT oid INTO STRICT runtime_oid FROM pg_roles WHERE rolname = runtime_role;
  SELECT oid INTO STRICT opening_stock_owner_oid FROM pg_roles WHERE rolname = opening_stock_owner_role;
  SELECT oid INTO STRICT opening_stock_executor_oid FROM pg_roles WHERE rolname = opening_stock_executor_role;
  SELECT oid INTO STRICT public_schema_oid FROM pg_namespace WHERE nspname = 'public';
  IF (SELECT count(*) FROM pg_auth_members
      WHERE roleid IN (owner_oid, migrator_oid, runtime_oid, opening_stock_owner_oid, opening_stock_executor_oid)
         OR member IN (owner_oid, migrator_oid, runtime_oid, opening_stock_owner_oid, opening_stock_executor_oid)) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM pg_auth_members
     WHERE member = migrator_oid AND roleid = owner_oid
         AND NOT admin_option AND NOT inherit_option AND set_option
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_auth_members
       WHERE member = migrator_oid AND roleid = opening_stock_owner_oid
         AND NOT admin_option AND NOT inherit_option AND set_option
     ) THEN
    -- Legacy diagnostic compatibility: Owner or runtime role membership closure is not empty.
    -- Legacy diagnostic compatibility: Migrator membership must be exactly owner.
    -- Every incoming and outgoing controlled-role edge is now part of one
    -- exact graph assertion.
    RAISE EXCEPTION 'Controlled role membership graph must contain only the two SET-only owner paths to migrator';
  END IF;
  IF NOT pg_has_role(migrator_role, owner_role, 'MEMBER')
     OR NOT pg_has_role(migrator_role, owner_role, 'SET')
     OR pg_has_role(migrator_role, owner_role, 'USAGE')
     OR pg_has_role(owner_role, migrator_role, 'MEMBER')
     OR pg_has_role(owner_role, runtime_role, 'MEMBER')
     OR pg_has_role(runtime_role, owner_role, 'MEMBER')
     OR pg_has_role(runtime_role, migrator_role, 'MEMBER')
     OR pg_has_role(migrator_role, runtime_role, 'MEMBER')
     OR NOT pg_has_role(migrator_role, opening_stock_owner_role, 'MEMBER')
     OR NOT pg_has_role(migrator_role, opening_stock_owner_role, 'SET')
     OR pg_has_role(migrator_role, opening_stock_owner_role, 'USAGE')
     OR pg_has_role(opening_stock_owner_role, migrator_role, 'MEMBER')
     OR pg_has_role(opening_stock_executor_role, opening_stock_owner_role, 'MEMBER')
     OR pg_has_role(opening_stock_executor_role, owner_role, 'MEMBER')
     OR pg_has_role(opening_stock_executor_role, runtime_role, 'MEMBER')
     OR pg_has_role(runtime_role, opening_stock_executor_role, 'MEMBER')
     OR pg_has_role(runtime_role, opening_stock_owner_role, 'MEMBER')
     OR pg_has_role(opening_stock_owner_role, opening_stock_executor_role, 'MEMBER') THEN
    RAISE EXCEPTION 'Controlled effective-role closure differs from the reviewed SET-only owner path';
  END IF;

  PERFORM 1 FROM pg_database WHERE datname = database_name AND datdba = owner_oid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Database ownership is unsafe'; END IF;
  PERFORM 1 FROM pg_namespace WHERE nspname = 'public' AND nspowner = owner_oid;
  IF NOT FOUND THEN RAISE EXCEPTION 'public schema ownership is unsafe'; END IF;
  SELECT oid INTO approval_shadow_schema_oid
  FROM pg_namespace
  WHERE nspname = 'approval_shadow' AND nspowner = owner_oid;
  IF approval_shadow_schema_oid IS NULL THEN
    RAISE EXCEPTION 'Mandatory approval_shadow schema is absent or not owner-owned';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_namespace n
    WHERE n.nspname NOT IN ('public', 'approval_shadow', 'pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND NOT (
        database_name ~ '^ogfi_(test|ci|rehearsal|disposable|demo_disposable)_'
        AND n.nspname = 'ogfi_disposable_control'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected application schema exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_type WHERE typnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_operator WHERE oprnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_opclass WHERE opcnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_opfamily WHERE opfnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_collation WHERE collnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_conversion WHERE connamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_statistic_ext WHERE stxnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_ts_config WHERE cfgnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_ts_dict WHERE dictnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_ts_parser WHERE prsnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_ts_template WHERE tmplnamespace = approval_shadow_schema_oid
    UNION ALL
    SELECT 1 FROM pg_extension WHERE extnamespace = approval_shadow_schema_oid
  ) THEN
    RAISE EXCEPTION 'approval_shadow contains a non-routine object';
  END IF;

  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = approval_shadow_schema_oid) <> 18
     OR EXISTS (
       SELECT expected_name
       FROM unnest(ARRAY[
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
       ]::text[]) AS expected(expected_name)
       WHERE NOT EXISTS (
         SELECT 1
         FROM pg_proc p
         WHERE p.pronamespace = approval_shadow_schema_oid
           AND p.proname = expected.expected_name
       )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_proc p
       WHERE p.pronamespace = approval_shadow_schema_oid
         AND p.proname <> ALL (ARRAY[
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
     ) THEN
    RAISE EXCEPTION 'approval_shadow routine set is not the exact reviewed 18-family contract';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.pronamespace = approval_shadow_schema_oid
      AND (
        p.prokind <> 'f'
        OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'sql')
        OR p.pronargs <> 3
        OR p.proargtypes[0] <> 'uuid'::regtype
        OR p.proargtypes[1] <> 'uuid'::regtype
        OR p.proargtypes[2] <> 'uuid'::regtype
        OR p.pronargdefaults <> 0
        OR p.proargnames IS DISTINCT FROM ARRAY[
          'p_tenant_id',
          'p_company_id',
          'p_approval_instance_id'
        ]::text[]
        OR p.proallargtypes IS NOT NULL
        OR p.proargmodes IS NOT NULL
        OR p.proretset
        OR p.prorettype <> 'text'::regtype
        OR p.proowner <> owner_oid
        OR p.prosecdef
        OR p.provolatile <> 's'
        OR p.proparallel <> 'u'
        OR p.proleakproof
        OR p.proisstrict
        OR p.prosqlbody IS NOT NULL
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'approval_shadow observer routine catalog contract is unsafe or incomplete';
  END IF;

  -- pgcrypto is installed by the baseline migration. Attest each live prosrc
  -- independently and identify only the routine name when drift is detected.
  FOR obj IN
    SELECT expected.routine_name, expected.body_sha256, p.prosrc
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
    IF obj.prosrc IS NULL
       OR encode(pg_catalog.sha256(convert_to(obj.prosrc, 'UTF8')), 'hex') <> obj.body_sha256 THEN
      RAISE EXCEPTION 'approval_shadow routine % body attestation failed', obj.routine_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
    WHERE n.oid = approval_shadow_schema_oid
      AND acl.grantee <> owner_oid
  )
     OR EXISTS (
       SELECT 1
       FROM pg_proc p
       CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       WHERE p.pronamespace = approval_shadow_schema_oid
         AND acl.grantee <> owner_oid
     )
     OR has_schema_privilege(runtime_role, 'approval_shadow', 'USAGE')
     OR has_schema_privilege(runtime_role, 'approval_shadow', 'CREATE')
     OR EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.pronamespace = approval_shadow_schema_oid
         AND has_function_privilege(runtime_role, p.oid, 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'approval_shadow exposes an effective non-owner privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    WHERE d.defaclrole = owner_oid
      AND d.defaclnamespace = 0
      AND d.defaclobjtype = 'f'
  )
     OR EXISTS (
       SELECT 1
       FROM pg_default_acl d
       CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
       WHERE d.defaclrole = owner_oid
         AND d.defaclobjtype = 'f'
         AND d.defaclnamespace IN (0, approval_shadow_schema_oid)
         AND acl.grantee <> owner_oid
     ) THEN
    RAISE EXCEPTION 'approval_shadow function defaults expose a non-owner privilege';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
      )
      AND c.relkind NOT IN ('r', 'p', 'v', 'm', 'S', 'f', 'i', 'I')
  ) THEN
    RAISE EXCEPTION 'Unsupported non-extension object exists in public schema';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'i', 'I')
      AND c.relowner <> owner_oid
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
      )
  ) THEN
    RAISE EXCEPTION 'A supported public object is not owned by the reviewed owner';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proowner <> owner_oid
      AND p.oid NOT IN ('public.execute_opening_inventory_command(uuid)'::regprocedure, 'public.append_opening_inventory_cohort_seal_event()'::regprocedure)
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  ) THEN
    RAISE EXCEPTION 'A non-extension public routine is not owned by the reviewed owner';
  END IF;

  -- These routines enforce controls that must remain effective even for
  -- replication-role sessions. Attest the reviewed implementation body as
  -- well as its owner, language, security mode, and fixed search path so a
  -- same-named replacement cannot satisfy this contract.
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.enforce_authorization_denial_bucket_update()'::regprocedure,
        'e6eb9e27334f4e451eccd5367ffab6ec', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_authorization_denial_bucket_events()'::regprocedure,
        '08c472850d75a36d7313f9ed6786b93f', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.reject_authorization_denial_bucket_removal()'::regprocedure,
        'cb7c5e9532debc0c8bd28552fe79e936', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_approval_step_routing_context()'::regprocedure,
        '636702f89398cf438daa7c13f276c664', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.reject_immutable_approval_routing_child_mutation()'::regprocedure,
        'ea12e58f5dcf9c5025dccf29340ad3fb', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_approval_routing_backfill_run_transition()'::regprocedure,
        '145e152a5e96383bf372239f08155670', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_approval_routing_backfill_batch_commit()'::regprocedure,
        '39bc2b5b61729ac364b5561484876d32', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_approval_routing_backfill_blocker_insert()'::regprocedure,
        'ba1b22a2c7fbab72d802955bdea33744', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.reject_approval_routing_backfill_evidence_mutation()'::regprocedure,
        'fa38c0296149be8cdc1f5f14d0eb7614', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.acquire_approval_routing_producer_barrier_shared(uuid,uuid,text)'::regprocedure,
        '545894fd67665c8b6fee2a2729d389e2', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.acquire_approval_routing_producer_barrier_exclusive(uuid,uuid)'::regprocedure,
        '7b52a3ede8f97dd7ecca08eb8ded185c', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.acquire_approval_routing_graph_barrier_shared()'::regprocedure,
        '86624a49f8ca97a553c7ffe12777bab8', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_approval_routing_provenance_lineage()'::regprocedure,
        '9a643535a72f125c5af4435ce705516a', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.reject_approval_routing_producer_evidence_mutation()'::regprocedure,
        '32f3c8868d696963a51b7e35f06e5d53', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.reject_dormant_approval_routing_evidence_insert()'::regprocedure,
        '4eabc880838e5beb85b44b2854d80d1c', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.reject_dormant_approval_routing_validator_execution()'::regprocedure,
        '022f0d22da70afc7987d076bf268d815', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.enforce_authentication_throttle_window_transition()'::regprocedure,
        'e07a390bc1869b04a2fc6bbb067dc2aa', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.reject_authentication_throttle_window_truncate()'::regprocedure,
        'eef7d174af42a6c70b80228e8738f392', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.enforce_authentication_throttle_control_transition()'::regprocedure,
        'e24f19d2cbda20982336b421bbf69d8a', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.reject_authentication_throttle_control_remove()'::regprocedure,
        'f2c71fece9108f7a98e0ccaf45df2017', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.lock_authentication_throttle_control()'::regprocedure,
        '514b6a660f2fbd81b417bfd261dd7ac1', 'sql', true,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.operator_transition_authentication_throttle_control(bigint,"AuthenticationThrottleControlStatus",integer,text,text)'::regprocedure,
        '62201f7bcbba7a8e20beff3d988b8f40', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_petty_cash_approval_step_intent_lineage()'::regprocedure,
        'd1a2b0f257704b4799882d78192844fa', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.reject_petty_cash_approval_step_intent_mutation()'::regprocedure,
        'c886b8b336d3daf45967144020532a5b', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.controlled_evidence_canonical_json(jsonb)'::regprocedure,
        '785127719b3458bca6dbf1f6f3a443b3', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.inventory_pilot_canonical_json(jsonb)'::regprocedure,
        'f7b95ffbba4f5410e1d24acd0c50ce0a', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.inventory_pilot_revision_canonical_json(uuid)'::regprocedure,
        '7248e42819c1a191866e7cb7076aa8da', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_inventory_pilot_revision_insert()'::regprocedure,
        '73d6b2530a5b911b444b5674e107ee22', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_inventory_pilot_revision_digest()'::regprocedure,
        'd827ae0ee6a34a492d5ee536ceace0a1', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_inventory_pilot_activation_event()'::regprocedure,
        '59ecb014ee3181498456e81281aca3fa', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_inventory_pilot_activation_transition()'::regprocedure,
        '17a2f1174c75b696650d12a3ec8614b5', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_inventory_pilot_activation_event_acceptance()'::regprocedure,
        'fb93397873a9adfda22948d2cae6cd29', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_inventory_pilot_cross_family_state()'::regprocedure,
        '8fbce2031a450c09e84b35323ae52358', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_inventory_transfer_approval_intent()'::regprocedure,
        '8e7b56058d4f7eae86a8a58f220aad4d', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_stock_count_review_intent()'::regprocedure,
        '4ca75dcfd4e3f4c8022306a3a2be4201', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.reject_inventory_pilot_history_mutation()'::regprocedure,
        'df7b14482c6a8a8a64b764414d0b271c', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.guard_stock_count_attempt_history()'::regprocedure,
        'ea44887da055d7139aae8d13b6035144', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.reject_controlled_evidence_history_mutation()'::regprocedure,
        'fa38c0296149be8cdc1f5f14d0eb7614', 'plpgsql', false,
        ARRAY['search_path=pg_catalog']::text[]),
      ('public.validate_controlled_evidence_policy_version()'::regprocedure,
        'e74258e40e442cb2aa58f2557b2ba7de', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_controlled_evidence_activation_event_lineage()'::regprocedure,
        '4bb4034c39dc8b06b6dedc3cda777bac', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_controlled_evidence_policy_activation_transition()'::regprocedure,
        'd7dc69703ef2194f81bb1ac32e07cf30', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_controlled_evidence_qualification_lineage()'::regprocedure,
        '9eb41146e7251996fa14d02462285670', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_controlled_evidence_selection_lineage()'::regprocedure,
        'efbc56592297a6b492861bc9c8f64c46', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_controlled_evidence_selection_count()'::regprocedure,
        '9e060bf5f40a0de0636e9877efc41870', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.validate_controlled_evidence_selection_parent_count()'::regprocedure,
        '7847f9d4872c1f3302d16fe624697e69', 'plpgsql', false,
        ARRAY['search_path=pg_catalog, public']::text[])
    ) AS expected(function_oid, source_md5, language_name, security_definer, settings)
    JOIN pg_proc p ON p.oid = expected.function_oid
    JOIN pg_language l ON l.oid = p.prolang
    WHERE md5(p.prosrc) <> expected.source_md5
      OR l.lanname <> expected.language_name
      OR p.proowner <> owner_oid
      OR p.prosecdef <> expected.security_definer
      OR p.proconfig IS DISTINCT FROM expected.settings
  ) THEN
    RAISE EXCEPTION 'Reviewed control function semantics drifted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typrelid = 0 AND t.typtype IN ('e', 'd')
      AND t.typowner <> owner_oid
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
      )
  ) THEN
    RAISE EXCEPTION 'A supported public type is not owned by the reviewed owner';
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
    PERFORM 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = protected_table AND c.relowner = owner_oid;
    IF NOT FOUND THEN RAISE EXCEPTION '% ownership is unsafe', protected_table; END IF;
    IF NOT has_table_privilege(runtime_role, format('public.%I', protected_table), 'SELECT')
       OR NOT has_table_privilege(runtime_role, format('public.%I', protected_table), 'INSERT') THEN
      RAISE EXCEPTION '% required runtime append privileges are missing', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace,
        LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      WHERE n.nspname = 'public' AND c.relname = protected_table AND acl.grantee = 0
    ) THEN
      RAISE EXCEPTION 'PUBLIC retains privileges on %', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_attribute a,
        LATERAL aclexplode(a.attacl) acl
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND acl.grantee IN (0, runtime_oid)
    ) THEN
      RAISE EXCEPTION 'PUBLIC or runtime retains a column ACL on %', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND (
          has_column_privilege(runtime_role, a.attrelid, a.attnum, 'UPDATE')
          OR has_column_privilege(runtime_role, a.attrelid, a.attnum, 'REFERENCES')
        )
    ) THEN
      RAISE EXCEPTION 'Runtime has a destructive effective column privilege on %', protected_table;
    END IF;
    FOREACH destructive_privilege IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
    LOOP
      IF has_table_privilege(runtime_role, format('public.%I', protected_table), destructive_privilege) THEN
        RAISE EXCEPTION '% runtime privilege exists on %', destructive_privilege, protected_table;
      END IF;
    END LOOP;
    PERFORM 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = protected_table AND NOT t.tgisinternal
        AND t.tgname = protected_table || '_append_only_guard_trg' AND t.tgenabled = 'A'
        AND (t.tgtype & 1) = 0 AND (t.tgtype & 2) = 2 AND (t.tgtype & 8) = 8
        AND (t.tgtype & 16) = 16 AND (t.tgtype & 32) = 32;
    IF NOT FOUND THEN RAISE EXCEPTION '% append-only trigger contract is incomplete', protected_table; END IF;
  END LOOP;

  FOREACH protected_table IN ARRAY ARRAY[
    'ApprovalRoutingBackfillRun',
    'ApprovalRoutingBackfillBatch',
    'ApprovalRoutingBackfillBlockerObservation',
    'ApprovalRoutingProducerBarrierGeneration',
    'ApprovalRoutingProducerProvenance'
  ]
  LOOP
    PERFORM 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = protected_table AND c.relowner = owner_oid;
    IF NOT FOUND THEN RAISE EXCEPTION '% ownership is unsafe', protected_table; END IF;
    FOREACH destructive_privilege IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'
    ]
    LOOP
      IF has_table_privilege(runtime_role, format('public.%I', protected_table), destructive_privilege) THEN
        RAISE EXCEPTION '% web-runtime privilege exists on non-operational %', destructive_privilege, protected_table;
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace,
        LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      WHERE n.nspname = 'public' AND c.relname = protected_table AND acl.grantee = 0
    ) THEN
      RAISE EXCEPTION 'PUBLIC retains privileges on %', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_attribute a,
        LATERAL aclexplode(a.attacl) acl
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND acl.grantee IN (0, runtime_oid)
    ) THEN
      RAISE EXCEPTION 'PUBLIC or runtime retains a column ACL on %', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND (
          has_column_privilege(runtime_role, a.attrelid, a.attnum, 'SELECT')
          OR has_column_privilege(runtime_role, a.attrelid, a.attnum, 'INSERT')
          OR has_column_privilege(runtime_role, a.attrelid, a.attnum, 'UPDATE')
          OR has_column_privilege(runtime_role, a.attrelid, a.attnum, 'REFERENCES')
        )
    ) THEN
      RAISE EXCEPTION 'Web runtime has an effective column privilege on non-operational %', protected_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public."ApprovalRoutingBackfillRun"'::regclass
      AND t.tgname = 'ApprovalRoutingBackfillRun_transition_guard_trg'
      AND t.tgfoid = 'public.validate_approval_routing_backfill_run_transition()'::regprocedure
      AND t.tgenabled = 'A' AND t.tgtype = 23
      AND NOT t.tgisinternal AND NOT t.tgdeferrable AND NOT t.tginitdeferred
  ) THEN
    RAISE EXCEPTION 'ApprovalRoutingBackfillRun ENABLE ALWAYS transition guard is incomplete';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('ApprovalRoutingBackfillBatch', 'ApprovalRoutingBackfillBatch_commit_guard_trg',
       5::smallint, true, true, 'public.validate_approval_routing_backfill_batch_commit()'::regprocedure),
      ('ApprovalRoutingBackfillBatch', 'ApprovalRoutingBackfillBatch_append_only_guard_trg',
       27::smallint, false, false, 'public.reject_approval_routing_backfill_evidence_mutation()'::regprocedure),
      ('ApprovalRoutingBackfillBatch', 'ApprovalRoutingBackfillBatch_truncate_guard_trg',
       34::smallint, false, false, 'public.reject_approval_routing_backfill_evidence_mutation()'::regprocedure),
      ('ApprovalRoutingBackfillBlockerObservation', 'ApprovalRoutingBackfillBlocker_insert_guard_trg',
       7::smallint, false, false, 'public.validate_approval_routing_backfill_blocker_insert()'::regprocedure),
      ('ApprovalRoutingBackfillBlockerObservation', 'ApprovalRoutingBackfillBlocker_append_only_guard_trg',
       27::smallint, false, false, 'public.reject_approval_routing_backfill_evidence_mutation()'::regprocedure),
      ('ApprovalRoutingBackfillBlockerObservation', 'ApprovalRoutingBackfillBlocker_truncate_guard_trg',
       34::smallint, false, false, 'public.reject_approval_routing_backfill_evidence_mutation()'::regprocedure)
    ) AS expected(table_name, trigger_name, trigger_type, is_deferrable, is_deferred, function_oid)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND t.tgname = expected.trigger_name
        AND t.tgfoid = expected.function_oid
        AND t.tgenabled = 'A'
        AND t.tgtype = expected.trigger_type
        AND t.tgdeferrable = expected.is_deferrable
        AND t.tginitdeferred = expected.is_deferred
        AND NOT t.tgisinternal
    )
  ) THEN
    RAISE EXCEPTION 'Approval routing backfill ENABLE ALWAYS evidence trigger contract is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('ApprovalInstance', '00_approval_producer_barrier_lock_trg', 31::smallint),
      ('ApprovalInstanceStep', '00_approval_producer_barrier_lock_trg', 31::smallint),
      ('ApprovalInstanceStepScopeGroup', '00_approval_producer_barrier_lock_trg', 31::smallint),
      ('ApprovalInstanceStepScopeTarget', '00_approval_producer_barrier_lock_trg', 31::smallint),
      ('ApprovalInstanceStepProhibitedActor', '00_approval_producer_barrier_lock_trg', 31::smallint),
      ('ApprovalRoutingProducerProvenance', '00_approval_producer_barrier_lock_trg', 31::smallint)
    ) AS expected(table_name, trigger_name, trigger_type)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND t.tgname = expected.trigger_name
        AND t.tgfoid = 'public.acquire_approval_routing_graph_barrier_shared()'::regprocedure
        AND t.tgenabled = 'A'
        AND t.tgtype = expected.trigger_type
        AND NOT t.tgisinternal
        AND NOT t.tgdeferrable
        AND NOT t.tginitdeferred
    )
  ) THEN
    RAISE EXCEPTION 'Approval producer barrier ENABLE ALWAYS graph-lock trigger contract is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('ApprovalRoutingProducerBarrierGeneration', 'ApprovalGeneration_append_only_guard_trg', 26::smallint),
      ('ApprovalRoutingProducerBarrierGeneration', 'ApprovalGeneration_truncate_guard_trg', 34::smallint),
      ('ApprovalRoutingProducerProvenance', 'ApprovalProvenance_append_only_guard_trg', 26::smallint),
      ('ApprovalRoutingProducerProvenance', 'ApprovalProvenance_truncate_guard_trg', 34::smallint)
    ) AS expected(table_name, trigger_name, trigger_type)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND t.tgname = expected.trigger_name
        AND t.tgfoid = 'public.reject_approval_routing_producer_evidence_mutation()'::regprocedure
        AND t.tgenabled = 'A'
        AND t.tgtype = expected.trigger_type
        AND NOT t.tgisinternal
        AND NOT t.tgdeferrable
        AND NOT t.tginitdeferred
    )
  ) THEN
    RAISE EXCEPTION 'Approval producer barrier append-only trigger contract is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('ApprovalRoutingProducerBarrierGeneration', 'ApprovalGeneration_dormant_insert_guard_trg'),
      ('ApprovalRoutingProducerProvenance', 'ApprovalProvenance_dormant_insert_guard_trg')
    ) AS expected(table_name, trigger_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND t.tgname = expected.trigger_name
        AND t.tgfoid = 'public.reject_dormant_approval_routing_evidence_insert()'::regprocedure
        AND t.tgenabled = 'A'
        AND t.tgtype = 6
        AND NOT t.tgisinternal
        AND NOT t.tgdeferrable
        AND NOT t.tginitdeferred
    )
  ) THEN
    RAISE EXCEPTION 'Approval producer barrier ENABLE ALWAYS dormant insert trigger contract is incomplete';
  END IF;

  IF verification_mode = 'owner' AND (
    EXISTS (SELECT 1 FROM public."ApprovalRoutingProducerBarrierGeneration")
    OR EXISTS (SELECT 1 FROM public."ApprovalRoutingProducerProvenance")
  ) THEN
    RAISE EXCEPTION 'Dormant approval producer barrier evidence relations are not empty';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public."ApprovalRoutingProducerProvenance"'::regclass
      AND t.tgname = 'ApprovalProvenance_lineage_guard_trg'
      AND t.tgfoid = 'public.validate_approval_routing_provenance_lineage()'::regprocedure
      AND t.tgenabled = 'A' AND t.tgtype = 7
      AND NOT t.tgisinternal AND NOT t.tgdeferrable AND NOT t.tginitdeferred
  ) THEN
    RAISE EXCEPTION 'Approval producer provenance lineage trigger contract is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('ApprovalInstance', 'ApprovalInstance_dormant_validator_trg'),
      ('ApprovalInstanceStep', 'ApprovalStep_dormant_validator_trg'),
      ('ApprovalInstanceStepScopeGroup', 'ApprovalScopeGroup_dormant_validator_trg'),
      ('ApprovalInstanceStepScopeTarget', 'ApprovalScopeTarget_dormant_validator_trg'),
      ('ApprovalInstanceStepProhibitedActor', 'ApprovalProhibitedActor_dormant_validator_trg'),
      ('ApprovalRoutingProducerProvenance', 'ApprovalProvenance_dormant_validator_trg')
    ) AS expected(table_name, trigger_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND t.tgname = expected.trigger_name
        AND t.tgfoid = 'public.reject_dormant_approval_routing_validator_execution()'::regprocedure
        AND t.tgenabled = 'A' AND t.tgtype = 29
        AND NOT t.tgisinternal AND t.tgdeferrable AND t.tginitdeferred
        AND pg_get_expr(t.tgqual, t.tgrelid) = 'false'
    )
  ) THEN
    RAISE EXCEPTION 'Approval producer barrier dormant deferred validator contract is incomplete';
  END IF;

  PERFORM 1
  FROM pg_proc p
  JOIN pg_language l ON l.oid = p.prolang
  WHERE p.oid = 'public.acquire_approval_routing_producer_barrier_shared(uuid,uuid,text)'::regprocedure
    AND p.proowner = owner_oid
    AND l.lanname = 'plpgsql'
    AND NOT p.prosecdef
    AND p.provolatile = 'v'
    AND p.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
    AND position('APPROVAL_ROUTING_PRODUCER_BARRIER_SCOPE_INVALID' IN p.prosrc) > 0
    AND position('APPROVAL_ROUTING_PRODUCER_FAMILY_UNSUPPORTED' IN p.prosrc) > 0
    AND position('pg_try_advisory_xact_lock_shared' IN p.prosrc) > 0
    AND position('APPROVAL_ROUTING_PRODUCER_BARRIER_RETRY' IN p.prosrc) > 0
    AND position('40001' IN p.prosrc) > 0
    AND has_function_privilege(runtime_role, p.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    )
    AND EXISTS (
      SELECT 1 FROM aclexplode(p.proacl) acl
      WHERE acl.grantee = runtime_oid
        AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
    )
    AND NOT EXISTS (
      SELECT 1 FROM aclexplode(p.proacl) acl
      WHERE acl.grantee NOT IN (owner_oid, runtime_oid)
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval producer barrier shared-lock function contract is unsafe or incomplete';
  END IF;

  PERFORM 1
  FROM pg_proc p
  JOIN pg_language l ON l.oid = p.prolang
  WHERE p.oid = 'public.acquire_approval_routing_producer_barrier_exclusive(uuid,uuid)'::regprocedure
    AND p.proowner = owner_oid
    AND l.lanname = 'plpgsql'
    AND NOT p.prosecdef
    AND p.provolatile = 'v'
    AND p.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
    AND position('APPROVAL_ROUTING_PRODUCER_BARRIER_SCOPE_INVALID' IN p.prosrc) > 0
    AND position('pg_try_advisory_xact_lock(' IN p.prosrc) > 0
    AND position('APPROVAL_ROUTING_PRODUCER_BARRIER_RETRY' IN p.prosrc) > 0
    AND position('40001' IN p.prosrc) > 0
    AND NOT has_function_privilege(runtime_role, p.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval producer barrier exclusive-lock function contract is unsafe or callable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.acquire_approval_routing_graph_barrier_shared()'::regprocedure),
      ('public.validate_approval_routing_provenance_lineage()'::regprocedure),
      ('public.reject_approval_routing_producer_evidence_mutation()'::regprocedure),
      ('public.reject_dormant_approval_routing_evidence_insert()'::regprocedure),
      ('public.reject_dormant_approval_routing_validator_execution()'::regprocedure),
      ('public.acquire_approval_routing_producer_barrier_exclusive(uuid,uuid)'::regprocedure)
    ) AS internal(function_oid)
    JOIN pg_proc p ON p.oid = internal.function_oid
    WHERE has_function_privilege(runtime_role, internal.function_oid, 'EXECUTE')
       OR EXISTS (
         SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       )
  ) THEN
    RAISE EXCEPTION 'Approval producer barrier internal routine is callable by runtime or PUBLIC';
  END IF;

  FOREACH protected_table IN ARRAY ARRAY[
    'ControlledEvidencePolicyVersion',
    'ControlledEvidencePolicyActivationEvent'
  ]
  LOOP
    PERFORM 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = protected_table AND c.relowner = owner_oid;
    IF NOT FOUND THEN RAISE EXCEPTION '% ownership is unsafe', protected_table; END IF;
    IF NOT has_table_privilege(runtime_role, format('public.%I', protected_table), 'SELECT') THEN
      RAISE EXCEPTION '% required runtime read privilege is missing', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace,
        LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      WHERE n.nspname = 'public' AND c.relname = protected_table AND acl.grantee = 0
    ) THEN
      RAISE EXCEPTION 'PUBLIC retains privileges on %', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_attribute a,
        LATERAL aclexplode(a.attacl) acl
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND acl.grantee IN (0, runtime_oid)
    ) THEN
      RAISE EXCEPTION 'PUBLIC or runtime retains a column ACL on %', protected_table;
    END IF;
    FOREACH destructive_privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
    LOOP
      IF has_table_privilege(runtime_role, format('public.%I', protected_table), destructive_privilege) THEN
        RAISE EXCEPTION '% runtime privilege exists on %', destructive_privilege, protected_table;
      END IF;
    END LOOP;
  END LOOP;

  PERFORM 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ControlledEvidencePolicyActivation'
      AND c.relowner = owner_oid;
  IF NOT FOUND THEN RAISE EXCEPTION 'ControlledEvidencePolicyActivation ownership is unsafe'; END IF;
  IF NOT has_function_privilege(runtime_role, 'public.controlled_evidence_canonical_json(jsonb)', 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc p,
         LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       WHERE p.oid = 'public.controlled_evidence_canonical_json(jsonb)'::regprocedure
         AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Controlled-evidence canonicalizer runtime execution boundary is unsafe';
  END IF;
  PERFORM 1 FROM pg_proc
   WHERE oid = 'public.controlled_evidence_canonical_json(jsonb)'::regprocedure
     AND provolatile = 'i' AND proisstrict AND NOT prosecdef
     AND proconfig = ARRAY['search_path=pg_catalog']::text[];
  IF NOT FOUND THEN RAISE EXCEPTION 'Controlled-evidence canonicalizer properties drifted'; END IF;
  IF NOT has_function_privilege(runtime_role, 'public.inventory_pilot_canonical_json(jsonb)', 'EXECUTE')
     OR has_function_privilege(runtime_role, 'public.inventory_pilot_revision_canonical_json(uuid)', 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc p,
         LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       WHERE p.oid IN (
         'public.inventory_pilot_canonical_json(jsonb)'::regprocedure,
         'public.inventory_pilot_revision_canonical_json(uuid)'::regprocedure
       )
         AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Inventory-pilot canonicalizer runtime execution boundary is unsafe';
  END IF;
  PERFORM 1 FROM pg_proc
   WHERE oid = 'public.inventory_pilot_canonical_json(jsonb)'::regprocedure
     AND provolatile = 'i' AND proisstrict AND NOT prosecdef
     AND proconfig = ARRAY['search_path=pg_catalog']::text[];
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory-pilot JSON canonicalizer properties drifted'; END IF;
  PERFORM 1 FROM pg_proc
   WHERE oid = 'public.inventory_pilot_revision_canonical_json(uuid)'::regprocedure
     AND provolatile = 's' AND proisstrict AND NOT prosecdef
     AND proconfig = ARRAY['search_path=pg_catalog']::text[];
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory-pilot revision canonicalizer properties drifted'; END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.validate_inventory_pilot_revision_insert()'::regprocedure),
      ('public.validate_inventory_pilot_revision_digest()'::regprocedure),
      ('public.validate_inventory_pilot_activation_event()'::regprocedure),
      ('public.validate_inventory_pilot_activation_transition()'::regprocedure),
      ('public.validate_inventory_pilot_activation_event_acceptance()'::regprocedure),
      ('public.validate_inventory_pilot_cross_family_state()'::regprocedure),
      ('public.validate_inventory_transfer_approval_intent()'::regprocedure),
      ('public.validate_stock_count_review_intent()'::regprocedure),
      ('public.reject_inventory_pilot_history_mutation()'::regprocedure),
      ('public.guard_stock_count_attempt_history()'::regprocedure)
    ) AS guarded(function_oid)
    JOIN pg_proc p ON p.oid = guarded.function_oid
    WHERE p.provolatile <> 'v'
       OR p.proisstrict
       OR p.prosecdef
       OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
       OR has_function_privilege(runtime_role, guarded.function_oid, 'EXECUTE')
       OR EXISTS (
         SELECT 1
         FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       )
  ) THEN
    RAISE EXCEPTION 'Inventory-pilot validator/history routine boundary is unsafe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('InventoryPilotConfigurationRevision', 'InventoryPilotConfigurationRevision_monotonic_trg', 7::smallint,
        'public.validate_inventory_pilot_revision_insert()'::regprocedure, false, false, false),
      ('InventoryPilotConfigurationRevision', 'InventoryPilotConfigurationRevision_digest_trg', 5::smallint,
        'public.validate_inventory_pilot_revision_digest()'::regprocedure, true, true, true),
      ('InventoryPilotEndpointMembership', 'InventoryPilotEndpointMembership_digest_trg', 5::smallint,
        'public.validate_inventory_pilot_revision_digest()'::regprocedure, true, true, true),
      ('InventoryPilotItemMembership', 'InventoryPilotItemMembership_digest_trg', 5::smallint,
        'public.validate_inventory_pilot_revision_digest()'::regprocedure, true, true, true),
      ('InventoryPilotFamilyActivationEvent', 'InventoryPilotFamilyActivationEvent_lineage_trg', 7::smallint,
        'public.validate_inventory_pilot_activation_event()'::regprocedure, false, false, false),
      ('InventoryPilotFamilyActivation', 'InventoryPilotFamilyActivation_transition_trg', 23::smallint,
        'public.validate_inventory_pilot_activation_transition()'::regprocedure, false, false, false),
      ('InventoryPilotFamilyActivationEvent', 'InventoryPilotFamilyActivationEvent_acceptance_trg', 5::smallint,
        'public.validate_inventory_pilot_activation_event_acceptance()'::regprocedure, true, true, true),
      ('InventoryPilotFamilyActivation', 'InventoryPilotFamilyActivation_cross_family_trg', 21::smallint,
        'public.validate_inventory_pilot_cross_family_state()'::regprocedure, true, true, true),
      ('InventoryTransferApprovalSubmissionIntent', 'InventoryTransferApprovalSubmissionIntent_lineage_trg', 7::smallint,
        'public.validate_inventory_transfer_approval_intent()'::regprocedure, false, false, false),
      ('StockCountReviewSubmissionIntent', 'StockCountReviewSubmissionIntent_lineage_trg', 7::smallint,
        'public.validate_stock_count_review_intent()'::regprocedure, false, false, false),
      ('StockCountAttempt', 'StockCountAttempt_history_guard', 27::smallint,
        'public.guard_stock_count_attempt_history()'::regprocedure, false, false, false)
    ) AS expected(
      table_name, trigger_name, trigger_type, function_oid,
      is_constraint, is_deferrable, initially_deferred
    )
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND t.tgname = expected.trigger_name
        AND NOT t.tgisinternal
        AND t.tgenabled = 'A'
        AND t.tgtype = expected.trigger_type
        AND t.tgfoid = expected.function_oid
        AND (t.tgconstraint <> 0) = expected.is_constraint
        AND t.tgdeferrable = expected.is_deferrable
        AND t.tginitdeferred = expected.initially_deferred
    )
  ) THEN
    RAISE EXCEPTION 'Inventory-pilot lineage or stock-count history trigger semantics drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('InventoryPilotConfigurationRevision'),
      ('InventoryPilotEndpointMembership'),
      ('InventoryPilotItemMembership'),
      ('InventoryPilotFamilyActivationEvent'),
      ('InventoryTransferApprovalSubmissionIntent'),
      ('StockCountReviewSubmissionIntent')
    ) AS expected(table_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND t.tgname = expected.table_name || '_append_only_guard_trg'
        AND NOT t.tgisinternal
        AND t.tgenabled = 'A'
        AND t.tgtype = 58
        AND t.tgfoid = 'public.reject_inventory_pilot_history_mutation()'::regprocedure
        AND t.tgconstraint = 0
        AND NOT t.tgdeferrable
        AND NOT t.tginitdeferred
    )
  ) THEN
    RAISE EXCEPTION 'Inventory-pilot append-only trigger semantics drifted';
  END IF;

  PERFORM 1
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'InventoryPilotFamilyActivation'
    AND t.tgname = 'InventoryPilotFamilyActivation_remove_guard_trg'
    AND NOT t.tgisinternal
    AND t.tgenabled = 'A'
    AND t.tgtype = 42
    AND t.tgfoid = 'public.reject_inventory_pilot_history_mutation()'::regprocedure
    AND t.tgconstraint = 0
    AND NOT t.tgdeferrable
    AND NOT t.tginitdeferred;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory-pilot activation removal trigger semantics drifted';
  END IF;

  FOREACH protected_table IN ARRAY ARRAY[
    'InventoryPilotConfigurationRevision',
    'InventoryPilotEndpointMembership',
    'InventoryPilotItemMembership',
    'InventoryPilotFamilyActivationEvent',
    'InventoryPilotFamilyActivation'
  ]
  LOOP
    PERFORM 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = protected_table AND c.relowner = owner_oid;
    IF NOT FOUND THEN RAISE EXCEPTION '% ownership is unsafe', protected_table; END IF;
    IF NOT has_table_privilege(runtime_role, format('public.%I', protected_table), 'SELECT') THEN
      RAISE EXCEPTION '% required runtime read privilege is missing', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
        LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      WHERE n.nspname = 'public' AND c.relname = protected_table AND acl.grantee = 0
    ) THEN
      RAISE EXCEPTION 'PUBLIC retains privileges on %', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_attribute a, LATERAL aclexplode(a.attacl) acl
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped AND acl.grantee IN (0, runtime_oid)
    ) THEN
      RAISE EXCEPTION 'PUBLIC or runtime retains a column ACL on %', protected_table;
    END IF;
    FOREACH destructive_privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
    LOOP
      IF has_table_privilege(runtime_role, format('public.%I', protected_table), destructive_privilege) THEN
        RAISE EXCEPTION '% runtime privilege exists on %', destructive_privilege, protected_table;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH protected_table IN ARRAY ARRAY[
    'InventoryTransferApprovalSubmissionIntent',
    'StockCountReviewSubmissionIntent'
  ]
  LOOP
    PERFORM 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = protected_table AND c.relowner = owner_oid;
    IF NOT FOUND THEN RAISE EXCEPTION '% ownership is unsafe', protected_table; END IF;
    IF NOT has_table_privilege(runtime_role, format('public.%I', protected_table), 'SELECT')
       OR NOT has_table_privilege(runtime_role, format('public.%I', protected_table), 'INSERT') THEN
      RAISE EXCEPTION '% required runtime append privileges are missing', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
        LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      WHERE n.nspname = 'public' AND c.relname = protected_table AND acl.grantee = 0
    ) THEN
      RAISE EXCEPTION 'PUBLIC retains privileges on %', protected_table;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_attribute a, LATERAL aclexplode(a.attacl) acl
      WHERE a.attrelid = format('public.%I', protected_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped AND acl.grantee IN (0, runtime_oid)
    ) THEN
      RAISE EXCEPTION 'PUBLIC or runtime retains a column ACL on %', protected_table;
    END IF;
    FOREACH destructive_privilege IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
    LOOP
      IF has_table_privilege(runtime_role, format('public.%I', protected_table), destructive_privilege) THEN
        RAISE EXCEPTION '% runtime privilege exists on %', destructive_privilege, protected_table;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT has_table_privilege(runtime_role, 'public."ControlledEvidencePolicyActivation"', 'SELECT') THEN
    RAISE EXCEPTION 'ControlledEvidencePolicyActivation runtime read privilege is missing';
  END IF;
  FOREACH destructive_privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
  LOOP
    IF has_table_privilege(runtime_role, 'public."ControlledEvidencePolicyActivation"', destructive_privilege) THEN
      RAISE EXCEPTION '% table-wide runtime privilege exists on ControlledEvidencePolicyActivation', destructive_privilege;
    END IF;
  END LOOP;
  IF NOT has_column_privilege(runtime_role, 'public."ControlledEvidencePolicyActivation"', 'updatedAt', 'UPDATE') THEN
    RAISE EXCEPTION 'ControlledEvidencePolicyActivation row-lock column privilege is missing';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'public."ControlledEvidencePolicyActivation"'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname <> 'updatedAt'
      AND has_column_privilege(runtime_role, a.attrelid, a.attnum, 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'Runtime can update a ControlledEvidencePolicyActivation authority column';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace,
      LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    WHERE n.nspname = 'public'
      AND c.relname = 'ControlledEvidencePolicyActivation'
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PUBLIC retains privileges on ControlledEvidencePolicyActivation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a,
      LATERAL aclexplode(a.attacl) acl
    WHERE a.attrelid = 'public."ControlledEvidencePolicyActivation"'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PUBLIC retains a column ACL on ControlledEvidencePolicyActivation';
  END IF;

  PERFORM 1 FROM pg_trigger
    WHERE tgrelid = 'public."ControlledEvidencePolicyVersion"'::regclass
      AND tgname = 'ControlledEvidencePolicyVersion_append_only_guard_trg'
      AND tgfoid = 'public.reject_controlled_evidence_history_mutation()'::regprocedure
      AND tgenabled = 'A' AND NOT tgisinternal
      AND (tgtype & 1) = 0 AND (tgtype & 2) = 2 AND (tgtype & 8) = 8
      AND (tgtype & 16) = 16 AND (tgtype & 32) = 32;
  IF NOT FOUND THEN RAISE EXCEPTION 'ControlledEvidencePolicyVersion append-only trigger is incomplete'; END IF;
  PERFORM 1 FROM pg_trigger
    WHERE tgrelid = 'public."ControlledEvidencePolicyActivationEvent"'::regclass
      AND tgname = 'ControlledEvidencePolicyActivationEvent_append_only_guard_trg'
      AND tgfoid = 'public.reject_controlled_evidence_history_mutation()'::regprocedure
      AND tgenabled = 'A' AND NOT tgisinternal
      AND (tgtype & 1) = 0 AND (tgtype & 2) = 2 AND (tgtype & 8) = 8
      AND (tgtype & 16) = 16 AND (tgtype & 32) = 32;
  IF NOT FOUND THEN RAISE EXCEPTION 'ControlledEvidencePolicyActivationEvent append-only trigger is incomplete'; END IF;
  PERFORM 1 FROM pg_trigger
    WHERE tgrelid = 'public."ControlledEvidencePolicyActivation"'::regclass
      AND tgname = 'ControlledEvidencePolicyActivation_transition_guard_trg'
      AND tgfoid = 'public.validate_controlled_evidence_policy_activation_transition()'::regprocedure
      AND tgenabled = 'A' AND NOT tgisinternal
      AND (tgtype & 1) = 1 AND (tgtype & 2) = 2
      AND (tgtype & 4) = 4 AND (tgtype & 16) = 16
      AND (tgtype & 8) = 0 AND (tgtype & 32) = 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'ControlledEvidencePolicyActivation transition trigger is incomplete'; END IF;
  PERFORM 1 FROM pg_trigger
    WHERE tgrelid = 'public."ControlledEvidencePolicyActivation"'::regclass
      AND tgname = 'ControlledEvidencePolicyActivation_remove_guard_trg'
      AND tgfoid = 'public.reject_controlled_evidence_history_mutation()'::regprocedure
      AND tgenabled = 'A' AND NOT tgisinternal
      AND (tgtype & 1) = 0 AND (tgtype & 2) = 2
      AND (tgtype & 8) = 8 AND (tgtype & 32) = 32
      AND (tgtype & 4) = 0 AND (tgtype & 16) = 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'ControlledEvidencePolicyActivation remove trigger is incomplete'; END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('ControlledEvidencePolicyVersion', 'ControlledEvidencePolicyVersion_validation_trg', 7::smallint, false, false,
       'public.validate_controlled_evidence_policy_version()'::regprocedure),
      ('ControlledEvidencePolicyActivationEvent', 'ControlledEvidencePolicyActivationEvent_lineage_trg',
       7::smallint, false, false, 'public.validate_controlled_evidence_activation_event_lineage()'::regprocedure),
      ('ControlledEvidencePolicyActivation', 'ControlledEvidencePolicyActivation_transition_guard_trg',
       23::smallint, false, false, 'public.validate_controlled_evidence_policy_activation_transition()'::regprocedure),
      ('ControlledEvidencePolicyActivation', 'ControlledEvidencePolicyActivation_remove_guard_trg',
       42::smallint, false, false, 'public.reject_controlled_evidence_history_mutation()'::regprocedure),
      ('ControlledEvidenceActionQualification', 'ControlledEvidenceActionQualification_lineage_trg',
       7::smallint, false, false, 'public.validate_controlled_evidence_qualification_lineage()'::regprocedure),
      ('ControlledEvidenceActionQualification', 'ControlledEvidenceActionQualification_selection_count_trg',
       5::smallint, true, true, 'public.validate_controlled_evidence_selection_count()'::regprocedure),
      ('ControlledEvidenceActionSelection', 'ControlledEvidenceActionSelection_lineage_trg',
       7::smallint, false, false, 'public.validate_controlled_evidence_selection_lineage()'::regprocedure),
      ('ControlledEvidenceActionSelection', 'ControlledEvidenceActionSelection_parent_count_trg',
       5::smallint, true, true, 'public.validate_controlled_evidence_selection_parent_count()'::regprocedure),
      ('ControlledEvidenceActionQualification', 'ControlledEvidenceActionQualification_append_only_guard_trg',
       58::smallint, false, false, 'public.reject_controlled_evidence_history_mutation()'::regprocedure),
      ('ControlledEvidenceActionSelection', 'ControlledEvidenceActionSelection_append_only_guard_trg',
       58::smallint, false, false, 'public.reject_controlled_evidence_history_mutation()'::regprocedure),
      ('AttachmentScanAttempt', 'AttachmentScanAttempt_append_only_guard_trg',
       58::smallint, false, false, 'public.reject_controlled_evidence_history_mutation()'::regprocedure)
    ) AS expected(table_name, trigger_name, trigger_type, is_deferrable, is_deferred, function_oid)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND t.tgname = expected.trigger_name
        AND t.tgfoid = expected.function_oid
        AND t.tgenabled = 'A'
        AND t.tgtype = expected.trigger_type
        AND t.tgdeferrable = expected.is_deferrable
        AND t.tginitdeferred = expected.is_deferred
        AND NOT t.tgisinternal
    )
  ) THEN
    RAISE EXCEPTION 'Controlled-evidence lineage or cardinality trigger contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
     WHERE t.tgrelid = 'public."PettyCashApprovalStepIntent"'::regclass
       AND NOT t.tgisinternal
       AND (
         (
           t.tgname = 'PettyCashApprovalStepIntent_lineage_trg'
           AND t.tgenabled = 'A'
           AND t.tgtype = 7
           AND t.tgfoid = 'public.validate_petty_cash_approval_step_intent_lineage()'::regprocedure
         )
         OR (
           t.tgname = 'PettyCashApprovalStepIntent_append_only_guard_trg'
           AND t.tgenabled = 'A'
           AND t.tgtype = 58
           AND t.tgfoid = 'public.reject_petty_cash_approval_step_intent_mutation()'::regprocedure
         )
       )
     GROUP BY t.tgrelid
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'PettyCashApprovalStepIntent trigger contract is incomplete';
  END IF;

  IF to_regclass('public."AuthorizationDenialBucket"') IS NULL THEN
    RAISE EXCEPTION 'AuthorizationDenialBucket is missing';
  END IF;
  IF NOT has_table_privilege(runtime_role, 'public."AuthorizationDenialBucket"', 'SELECT')
     OR NOT has_table_privilege(runtime_role, 'public."AuthorizationDenialBucket"', 'INSERT') THEN
    RAISE EXCEPTION 'AuthorizationDenialBucket required runtime privileges are missing';
  END IF;
  FOREACH destructive_privilege IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
  LOOP
    IF has_table_privilege(runtime_role, 'public."AuthorizationDenialBucket"', destructive_privilege) THEN
      RAISE EXCEPTION '% table-wide runtime privilege exists on AuthorizationDenialBucket', destructive_privilege;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'public."AuthorizationDenialBucket"'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege(runtime_role, a.attrelid, a.attnum, 'UPDATE')
      AND a.attname <> ALL (ARRAY['denialCount', 'lastDeniedAt', 'updatedAt', 'finalizedAt', 'finalAuditEventId'])
  ) THEN
    RAISE EXCEPTION 'Runtime can update an unauthorized AuthorizationDenialBucket column';
  END IF;
  IF EXISTS (
    SELECT required_column
    FROM unnest(ARRAY['denialCount', 'lastDeniedAt', 'updatedAt', 'finalizedAt', 'finalAuditEventId']) AS required(required_column)
    WHERE NOT has_column_privilege(
      runtime_role,
      'public."AuthorizationDenialBucket"'::regclass,
      required_column,
      'UPDATE'
    )
  ) THEN
    RAISE EXCEPTION 'AuthorizationDenialBucket required runtime update columns are incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public."AuthorizationDenialBucket"'::regclass
      AND NOT t.tgisinternal
      AND (
        (t.tgname = 'AuthorizationDenialBucket_10_update_integrity_trg' AND t.tgenabled = 'A' AND t.tgtype = 19
          AND t.tgfoid = 'public.enforce_authorization_denial_bucket_update()'::regprocedure)
        OR (t.tgname = 'AuthorizationDenialBucket_20_event_integrity_trg' AND t.tgenabled = 'A' AND t.tgtype = 23
          AND t.tgfoid = 'public.validate_authorization_denial_bucket_events()'::regprocedure)
        OR (t.tgname = 'AuthorizationDenialBucket_no_remove_trg' AND t.tgenabled = 'A' AND t.tgtype = 42
          AND t.tgfoid = 'public.reject_authorization_denial_bucket_removal()'::regprocedure)
      )
    GROUP BY t.tgrelid
    HAVING count(*) = 3
  ) THEN
    RAISE EXCEPTION 'AuthorizationDenialBucket trigger contract is incomplete';
  END IF;

  IF to_regclass('public."AuthenticationThrottleWindow"') IS NULL THEN
    RAISE EXCEPTION 'AuthenticationThrottleWindow is missing';
  END IF;
  IF NOT has_table_privilege(runtime_role, 'public."AuthenticationThrottleWindow"', 'SELECT')
     OR NOT has_table_privilege(runtime_role, 'public."AuthenticationThrottleWindow"', 'INSERT')
     OR NOT has_table_privilege(runtime_role, 'public."AuthenticationThrottleWindow"', 'DELETE') THEN
    RAISE EXCEPTION 'AuthenticationThrottleWindow required runtime DML is incomplete';
  END IF;
  FOREACH destructive_privilege IN ARRAY ARRAY['UPDATE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
  LOOP
    IF has_table_privilege(runtime_role, 'public."AuthenticationThrottleWindow"', destructive_privilege) THEN
      RAISE EXCEPTION '% table-wide runtime privilege exists on AuthenticationThrottleWindow', destructive_privilege;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'public."AuthenticationThrottleWindow"'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege(runtime_role, a.attrelid, a.attnum, 'UPDATE')
      AND a.attname <> ALL (ARRAY[
        'requestCount', 'failureReservationCount', 'successCount', 'deniedCount',
        'lastRequestAt', 'thresholdReachedAt', 'updatedAt'
      ])
  ) THEN
    RAISE EXCEPTION 'Runtime can update an unauthorized AuthenticationThrottleWindow column';
  END IF;
  IF EXISTS (
    SELECT required_column
    FROM unnest(ARRAY[
      'requestCount', 'failureReservationCount', 'successCount', 'deniedCount',
      'lastRequestAt', 'thresholdReachedAt', 'updatedAt'
    ]) AS required(required_column)
    WHERE NOT has_column_privilege(
      runtime_role,
      'public."AuthenticationThrottleWindow"'::regclass,
      required_column,
      'UPDATE'
    )
  ) THEN
    RAISE EXCEPTION 'AuthenticationThrottleWindow required runtime update columns are incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public."AuthenticationThrottleWindow"'::regclass
      AND NOT t.tgisinternal
      AND (
        (t.tgname = 'AuthenticationThrottleWindow_transition_trg' AND t.tgenabled = 'A' AND t.tgtype = 31
          AND t.tgfoid = 'public.enforce_authentication_throttle_window_transition()'::regprocedure)
        OR (t.tgname = 'AuthenticationThrottleWindow_truncate_trg' AND t.tgenabled = 'A' AND t.tgtype = 34
          AND t.tgfoid = 'public.reject_authentication_throttle_window_truncate()'::regprocedure)
      )
    GROUP BY t.tgrelid
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'AuthenticationThrottleWindow ENABLE ALWAYS trigger contract is incomplete';
  END IF;

  IF to_regclass('public."AuthenticationThrottleControl"') IS NULL THEN
    RAISE EXCEPTION 'AuthenticationThrottleControl is missing';
  END IF;
  IF NOT has_table_privilege(runtime_role, 'public."AuthenticationThrottleControl"', 'SELECT') THEN
    RAISE EXCEPTION 'AuthenticationThrottleControl runtime read privilege is missing';
  END IF;
  FOREACH destructive_privilege IN ARRAY ARRAY[
    'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
  ]
  LOOP
    IF has_table_privilege(runtime_role, 'public."AuthenticationThrottleControl"', destructive_privilege) THEN
      RAISE EXCEPTION '% unauthorized runtime privilege exists on AuthenticationThrottleControl', destructive_privilege;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public."AuthenticationThrottleControl"'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND (
        has_column_privilege(runtime_role, a.attrelid, a.attnum, 'INSERT')
        OR has_column_privilege(runtime_role, a.attrelid, a.attnum, 'UPDATE')
        OR has_column_privilege(runtime_role, a.attrelid, a.attnum, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'Runtime has unauthorized AuthenticationThrottleControl column privileges';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public."AuthenticationThrottleControl"'::regclass
      AND NOT t.tgisinternal
      AND (
        (t.tgname = 'AuthenticationThrottleControl_transition_trg' AND t.tgenabled = 'A' AND t.tgtype = 19
          AND t.tgfoid = 'public.enforce_authentication_throttle_control_transition()'::regprocedure)
        OR (t.tgname = 'AuthenticationThrottleControl_no_remove_trg' AND t.tgenabled = 'A' AND t.tgtype = 42
          AND t.tgfoid = 'public.reject_authentication_throttle_control_remove()'::regprocedure)
      )
    GROUP BY t.tgrelid
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'AuthenticationThrottleControl ENABLE ALWAYS trigger contract is incomplete';
  END IF;
  IF to_regprocedure('public.operator_transition_authentication_throttle_control(bigint,"AuthenticationThrottleControlStatus",integer,text,text)') IS NULL THEN
    RAISE EXCEPTION 'AuthenticationThrottleControl operator CAS function is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.operator_transition_authentication_throttle_control(bigint,"AuthenticationThrottleControlStatus",integer,text,text)'::regprocedure
      AND (
        p.proowner <> owner_oid
        OR p.prosecdef
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'AuthenticationThrottleControl operator CAS function semantics drifted';
  END IF;
  IF has_function_privilege(
       runtime_role,
       'public.operator_transition_authentication_throttle_control(bigint,"AuthenticationThrottleControlStatus",integer,text,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Runtime can execute AuthenticationThrottleControl operator CAS function';
  END IF;
  IF NOT has_function_privilege(
       migrator_role,
       'public.operator_transition_authentication_throttle_control(bigint,"AuthenticationThrottleControlStatus",integer,text,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Migrator cannot execute AuthenticationThrottleControl operator CAS function';
  END IF;
  PERFORM 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.proname = 'lock_authentication_throttle_control'
    AND pg_get_function_identity_arguments(p.oid) = ''
    AND p.pronargs = 0 AND p.proretset
    AND p.prorettype = 'public."AuthenticationThrottleControl"'::regtype
    AND l.lanname = 'sql' AND p.provolatile = 'v' AND p.prosecdef
    AND p.proowner = owner_oid
    AND p.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
    AND position('FROM public."AuthenticationThrottleControl"' IN pg_get_functiondef(p.oid)) > 0
    AND position('FOR SHARE' IN pg_get_functiondef(p.oid)) > 0
    AND has_function_privilege(runtime_role, p.oid, 'EXECUTE')
    AND EXISTS (
      SELECT 1 FROM aclexplode(p.proacl) acl
      WHERE acl.grantee = runtime_oid
        AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
    )
    AND NOT EXISTS (
      SELECT 1 FROM aclexplode(p.proacl) acl
      WHERE acl.grantee NOT IN (owner_oid, runtime_oid)
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AuthenticationThrottleControl shared-lock function contract is unsafe or incomplete';
  END IF;

  IF to_regclass('public."AuthLoginAttempt"') IS NULL THEN
    RAISE EXCEPTION 'AuthLoginAttempt is missing';
  END IF;
  IF NOT has_table_privilege(runtime_role, 'public."AuthLoginAttempt"', 'SELECT')
     OR NOT has_table_privilege(runtime_role, 'public."AuthLoginAttempt"', 'DELETE') THEN
    RAISE EXCEPTION 'AuthLoginAttempt cleanup privileges are missing';
  END IF;
  FOREACH destructive_privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
  LOOP
    IF has_table_privilege(runtime_role, 'public."AuthLoginAttempt"', destructive_privilege) THEN
      RAISE EXCEPTION '% unauthorized runtime privilege exists on AuthLoginAttempt', destructive_privilege;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public."AuthLoginAttempt"'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND (
        has_column_privilege(runtime_role, a.attrelid, a.attnum, 'INSERT')
        OR has_column_privilege(runtime_role, a.attrelid, a.attnum, 'UPDATE')
        OR has_column_privilege(runtime_role, a.attrelid, a.attnum, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'Runtime has unauthorized AuthLoginAttempt column privileges';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('ApprovalInstanceStep', 'ApprovalInstanceStep_routing_context_trg', 23::smallint,
        'public.validate_approval_step_routing_context()'::regprocedure),
      ('ApprovalInstanceStepScopeGroup', 'ApprovalStepScopeGroup_immutable_trg', 31::smallint,
        'public.reject_immutable_approval_routing_child_mutation()'::regprocedure),
      ('ApprovalInstanceStepScopeTarget', 'ApprovalStepScopeTarget_context_trg', 23::smallint,
        'public.validate_approval_step_routing_context()'::regprocedure),
      ('ApprovalInstanceStepScopeTarget', 'ApprovalStepScopeTarget_immutable_trg', 31::smallint,
        'public.reject_immutable_approval_routing_child_mutation()'::regprocedure),
      ('ApprovalInstanceStepProhibitedActor', 'ApprovalStepProhibitedActor_context_trg', 23::smallint,
        'public.validate_approval_step_routing_context()'::regprocedure),
      ('ApprovalInstanceStepProhibitedActor', 'ApprovalStepProhibitedActor_immutable_trg', 31::smallint,
        'public.reject_immutable_approval_routing_child_mutation()'::regprocedure)
    ) AS expected(table_name, trigger_name, trigger_type, function_oid)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND t.tgname = expected.trigger_name
        AND NOT t.tgisinternal
        AND t.tgenabled = 'A'
        AND t.tgtype = expected.trigger_type
        AND t.tgfoid = expected.function_oid
    )
  ) THEN
    RAISE EXCEPTION 'Approval routing child trigger semantics drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.validate_approval_step_routing_context()'::regprocedure),
      ('public.reject_immutable_approval_routing_child_mutation()'::regprocedure)
    ) AS expected(function_oid)
    JOIN pg_proc p ON p.oid = expected.function_oid
    WHERE p.proowner <> owner_oid
      OR p.prosecdef
      OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
  ) THEN
    RAISE EXCEPTION 'Approval routing child trigger function semantics drifted';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
      AND has_function_privilege(runtime_role, p.oid, 'EXECUTE')
      AND NOT (
        n.nspname = 'public'
        AND p.proname = 'lock_authentication_throttle_control'
        AND pg_get_function_identity_arguments(p.oid) = ''
      )
      AND NOT (
        n.nspname = 'public'
        AND p.proname = 'controlled_evidence_canonical_json'
        AND pg_get_function_identity_arguments(p.oid) = 'payload jsonb'
      )
      AND NOT (
        n.nspname = 'public'
        AND p.proname = 'inventory_pilot_canonical_json'
        AND pg_get_function_identity_arguments(p.oid) = 'payload jsonb'
      )
      AND NOT (
        n.nspname = 'public'
        AND p.proname = 'inventory_pilot_revision_canonical_json'
        AND pg_get_function_identity_arguments(p.oid) = 'revision_id uuid'
      )
      AND NOT (
        p.oid = to_regprocedure(
          'public.acquire_approval_routing_producer_barrier_shared(uuid,uuid,text)'
        )
      )
      AND p.oid <> ALL (ARRAY[
        'public.is_opening_inventory_executor_session()'::regprocedure,
        'public.is_opening_inventory_executor_context()'::regprocedure,
        'public.opening_inventory_utc_json_timestamp(timestamp without time zone)'::regprocedure,
        'public.assert_opening_inventory_command_requester_segregation(uuid,uuid,"OpeningInventoryExecutionCommandType")'::regprocedure
      ])
  ) THEN
    RAISE EXCEPTION 'Runtime or PUBLIC can execute a non-extension public routine';
  END IF;
  IF database_name ~ '^ogfi_(test|ci|rehearsal|disposable|demo_disposable)_'
     AND to_regnamespace('ogfi_disposable_control') IS NOT NULL THEN
    PERFORM 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'ogfi_disposable_control'
      AND p.proname = 'verify_database_identity'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND p.pronargs = 0 AND p.proretset
      AND p.proallargtypes::oid[] = ARRAY['text'::regtype, 'text'::regtype, 'text'::regtype]::oid[]
      AND p.proargmodes = ARRAY['t', 't', 't']::"char"[]
      AND p.proargnames = ARRAY['database_name', 'run_id', 'nonce_sha256']::text[]
      AND l.lanname = 'sql' AND p.prosecdef AND p.provolatile = 's'
      AND p.proowner = owner_oid
      AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]
      AND position('ogfi_disposable_control.database_identity' IN pg_get_functiondef(p.oid)) > 0
      AND has_schema_privilege(runtime_role, 'ogfi_disposable_control', 'USAGE')
      AND NOT has_schema_privilege(runtime_role, 'ogfi_disposable_control', 'CREATE')
      AND NOT has_table_privilege(
        runtime_role,
        'ogfi_disposable_control.database_identity',
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_attribute marker_column
        WHERE marker_column.attrelid = 'ogfi_disposable_control.database_identity'::regclass
          AND marker_column.attnum > 0 AND NOT marker_column.attisdropped
          AND (
            has_column_privilege(runtime_role, marker_column.attrelid, marker_column.attnum, 'SELECT')
            OR has_column_privilege(runtime_role, marker_column.attrelid, marker_column.attnum, 'INSERT')
            OR has_column_privilege(runtime_role, marker_column.attrelid, marker_column.attnum, 'UPDATE')
            OR has_column_privilege(runtime_role, marker_column.attrelid, marker_column.attnum, 'REFERENCES')
          )
      )
      AND EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) acl
        WHERE acl.grantee = runtime_oid AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
      )
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) acl
        WHERE acl.grantee NOT IN (owner_oid, runtime_oid)
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Disposable identity attestation function contract is unsafe or incomplete';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND has_function_privilege(runtime_role, p.oid, 'EXECUTE')
      AND NOT (
        database_name ~ '^ogfi_(test|ci|rehearsal|disposable|demo_disposable)_'
        AND n.nspname = 'ogfi_disposable_control'
        AND p.proname = 'verify_database_identity'
        AND pg_get_function_identity_arguments(p.oid) = ''
      )
      AND NOT (
        n.nspname = 'public'
        AND p.proname = 'lock_authentication_throttle_control'
        AND pg_get_function_identity_arguments(p.oid) = ''
      )
  ) THEN
    RAISE EXCEPTION 'Runtime or PUBLIC can execute a SECURITY DEFINER routine';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
    WHERE d.defaclrole = owner_oid
      AND (
        acl.grantee = 0
        OR (acl.grantee = runtime_oid AND d.defaclnamespace <> public_schema_oid)
        OR acl.grantee NOT IN (owner_oid, runtime_oid)
        OR acl.is_grantable
        OR (d.defaclobjtype = 'r' AND acl.grantee = runtime_oid AND acl.privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
        OR (d.defaclobjtype = 'S' AND acl.grantee = runtime_oid AND acl.privilege_type NOT IN ('SELECT', 'USAGE'))
        OR (d.defaclobjtype = 'f' AND acl.grantee = runtime_oid)
        OR d.defaclobjtype NOT IN ('r', 'S', 'f')
      )
  ) THEN
    RAISE EXCEPTION 'Owner default privileges contain an unsafe grantee, schema, option, or privilege';
  END IF;
  IF EXISTS (
    SELECT required_privilege
    FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS required(required_privilege)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
      WHERE d.defaclrole = owner_oid AND d.defaclnamespace = public_schema_oid
        AND d.defaclobjtype = 'r' AND acl.grantee = runtime_oid
        AND acl.privilege_type = required_privilege AND NOT acl.is_grantable
    )
  ) THEN
    RAISE EXCEPTION 'Runtime table default privileges are incomplete';
  END IF;
  IF EXISTS (
    SELECT required_privilege
    FROM unnest(ARRAY['SELECT', 'USAGE']) AS required(required_privilege)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
      WHERE d.defaclrole = owner_oid AND d.defaclnamespace = public_schema_oid
        AND d.defaclobjtype = 'S' AND acl.grantee = runtime_oid
        AND acl.privilege_type = required_privilege AND NOT acl.is_grantable
    )
  ) THEN
    RAISE EXCEPTION 'Runtime sequence default privileges are incomplete';
  END IF;

  IF has_schema_privilege(runtime_role, 'public', 'CREATE')
     OR NOT has_schema_privilege(runtime_role, 'public', 'USAGE')
     OR has_database_privilege(runtime_role, database_name, 'CREATE')
     OR has_database_privilege(runtime_role, database_name, 'TEMP') THEN
    RAISE EXCEPTION 'Runtime database or schema privileges are unsafe';
  END IF;
  IF has_schema_privilege(opening_stock_executor_role, 'public', 'CREATE')
     OR NOT has_schema_privilege(opening_stock_executor_role, 'public', 'USAGE')
     OR has_database_privilege(opening_stock_executor_role, database_name, 'CREATE')
     OR has_database_privilege(opening_stock_executor_role, database_name, 'TEMP')
     OR NOT has_database_privilege(opening_stock_executor_role, database_name, 'CONNECT') THEN
    RAISE EXCEPTION 'Opening-stock executor database or schema privileges are unsafe';
  END IF;
  IF has_table_privilege(opening_stock_executor_role, 'public."InventoryMovement"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'Opening-stock executor has direct inventory-movement authority';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
    WHERE d.defaclrole = owner_oid AND acl.grantee = opening_stock_executor_oid
  ) THEN
    RAISE EXCEPTION 'Opening-stock executor receives unsafe owner default privileges';
  END IF;

  FOREACH protected_table IN ARRAY ARRAY['OpeningInventoryCohort','OpeningInventoryCutover','OpeningInventoryCutoverLine','StockCountAttempt','StockCountAttemptLine','StockCountSession','InventoryPilotConfigurationRevision','InventoryPilotEndpointMembership','InventoryPilotItemMembership','CompanyPolicySetting','AuthSession','User','Role','UserRoleAssignment','RolePermission','Permission','UserScopeAssignment','InventoryLocation','ControlledEvidenceAttachment','Attachment','AttachmentScanAttempt','ApprovalInstance','ApprovalInstanceStep','OpeningInventoryApprovalAttestation','OpeningInventoryExecutionCommand','OpeningInventoryCohortEvent','InventoryMovement','InventoryBalance'] LOOP
    IF NOT has_table_privilege(opening_stock_owner_role, format('public.%I', protected_table), 'SELECT') THEN
      RAISE EXCEPTION 'Opening-stock owner is missing reviewed SELECT on %', protected_table;
    END IF;
    IF has_table_privilege(opening_stock_owner_role, format('public.%I', protected_table), 'DELETE,TRUNCATE,TRIGGER,REFERENCES') THEN
      RAISE EXCEPTION 'Opening-stock owner has destructive privilege on %', protected_table;
    END IF;
  END LOOP;
  FOREACH protected_table IN ARRAY ARRAY['OpeningInventoryCohort','OpeningInventoryCutover','OpeningInventoryCutoverLine','OpeningInventoryExecutionCommand','InventoryLocation'] LOOP
    allowed_columns := CASE protected_table
      WHEN 'OpeningInventoryCohort' THEN ARRAY['status','version','frozenAt','frozenByUserId','activatedAt','activatedByUserId','reversedAt','reversedByUserId','reversalReason','updatedAt']
      WHEN 'OpeningInventoryCutover' THEN ARRAY['status','version','stagedAt','reconciledAt','reversalRequestedAt','reversedAt','reversalReason','updatedAt']
      WHEN 'OpeningInventoryCutoverLine' THEN ARRAY['postedMovementId']
      WHEN 'OpeningInventoryExecutionCommand' THEN ARRAY['status','claimedAt','claimedByExecutor','completedAt','failureCode','failureDetail']
      ELSE ARRAY['updatedAt']
    END;
    IF EXISTS (SELECT 1 FROM pg_attribute attribute WHERE attribute.attrelid = format('public.%I', protected_table)::regclass AND attribute.attnum > 0 AND NOT attribute.attisdropped AND has_column_privilege(opening_stock_owner_role, attribute.attrelid, attribute.attnum, 'UPDATE') IS DISTINCT FROM (attribute.attname = ANY (allowed_columns))) THEN
      RAISE EXCEPTION 'Opening-stock owner UPDATE column contract drifted on %', protected_table;
    END IF;
  END LOOP;
  FOREACH protected_table IN ARRAY ARRAY['OpeningInventoryReconciliation','OpeningInventoryCohortEvent','InventoryMovement','AuditEvent'] LOOP
    allowed_columns := CASE protected_table
      WHEN 'OpeningInventoryReconciliation' THEN ARRAY['cutoverId','tenantId','companyId','inventoryLocationId','reconciliationType','lineCount','quantityDigest','valuationDigest','reconciliationJson','reconciliationDigest','reconciledByUserId','reconciledAt']
      WHEN 'OpeningInventoryCohortEvent' THEN ARRAY['cohortId','tenantId','companyId','sequenceNumber','eventType','priorEventId','canonicalJson','eventDigest','actorUserId','occurredAt']
      WHEN 'InventoryMovement' THEN ARRAY['tenantId','companyId','inventoryLocationId','itemId','movementType','occurredAt','enteredQuantity','enteredUomId','quantityDeltaBaseUom','baseUomId','lotNumber','expiryDate','unitCost','totalCost','sourceDocumentType','sourceDocumentId','sourceDocumentLineId','sourceEventKey','reasonCode','notes','postedByUserId']
      ELSE ARRAY['id','tenantId','companyId','actorUserId','eventType','entityType','entityId','occurredAt','metadata']
    END;
    IF EXISTS (SELECT 1 FROM pg_attribute attribute WHERE attribute.attrelid = format('public.%I', protected_table)::regclass AND attribute.attnum > 0 AND NOT attribute.attisdropped AND has_column_privilege(opening_stock_owner_role, attribute.attrelid, attribute.attnum, 'INSERT') IS DISTINCT FROM (attribute.attname = ANY (allowed_columns))) THEN
      RAISE EXCEPTION 'Opening-stock owner INSERT column contract drifted on %', protected_table;
    END IF;
  END LOOP;

  IF to_regclass('public."OpeningInventoryExecutionCommand"') IS NOT NULL THEN
    IF NOT has_table_privilege(runtime_role, 'public."InventoryBalance"', 'SELECT')
       OR has_table_privilege(runtime_role, 'public."InventoryBalance"', 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
       OR has_table_privilege(opening_stock_owner_role, 'public."InventoryBalance"', 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
       OR has_table_privilege(opening_stock_executor_role, 'public."InventoryBalance"', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') THEN
      RAISE EXCEPTION 'InventoryBalance derived-cache table privilege boundary is unsafe';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_attribute attribute
       WHERE attribute.attrelid = 'public."InventoryBalance"'::regclass
         AND attribute.attnum > 0 AND NOT attribute.attisdropped
         AND (has_column_privilege(runtime_role, attribute.attrelid, attribute.attnum, 'INSERT,UPDATE')
           OR has_column_privilege(opening_stock_owner_role, attribute.attrelid, attribute.attnum, 'INSERT,UPDATE')
           OR has_column_privilege(opening_stock_executor_role, attribute.attrelid, attribute.attnum, 'SELECT,INSERT,UPDATE'))
    ) THEN
      RAISE EXCEPTION 'InventoryBalance derived-cache column privilege boundary is unsafe';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = 'public."OpeningInventoryApprovalAttestation"'::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND has_column_privilege(runtime_role, a.attrelid, a.attnum, 'INSERT')
         AND a.attname <> ALL (ARRAY['id','cutoverId','tenantId','companyId','inventoryLocationId','approvalInstanceId','approvalInstanceStepId','stepOrder','decisionActorUserId','requiredPermissionId','requiredPermissionCode','authSessionId','privilegeEpochAtIssue','mfaVerifiedAt','mfaMode','mfaValidUntil','decision','actedAt','canonicalJson','attestationDigest','createdAt'])
    ) OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['id','cutoverId','tenantId','companyId','inventoryLocationId','approvalInstanceId','approvalInstanceStepId','stepOrder','decisionActorUserId','requiredPermissionId','requiredPermissionCode','authSessionId','privilegeEpochAtIssue','mfaVerifiedAt','mfaMode','mfaValidUntil','decision','actedAt','canonicalJson','attestationDigest','createdAt']) column_name
       WHERE NOT has_column_privilege(runtime_role, 'public."OpeningInventoryApprovalAttestation"', column_name, 'INSERT')
    ) THEN RAISE EXCEPTION 'OpeningInventoryApprovalAttestation runtime append grant is incomplete or overbroad'; END IF;
    IF to_regprocedure('public.execute_opening_inventory_command(uuid)') IS NULL THEN
      RAISE EXCEPTION 'Opening-stock execution command exists without its exact executor routine';
    END IF;
    FOREACH protected_table IN ARRAY ARRAY[
      'OpeningInventoryReconciliation',
      'OpeningInventoryCohortEvent'
    ]
    LOOP
      PERFORM 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = protected_table AND c.relowner = owner_oid;
      IF NOT FOUND THEN RAISE EXCEPTION '% opening-stock ownership is unsafe', protected_table; END IF;
      IF NOT has_table_privilege(runtime_role, format('public.%I', protected_table), 'SELECT') THEN
        RAISE EXCEPTION '% required runtime read privilege is missing', protected_table;
      END IF;
      FOREACH destructive_privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
      LOOP
        IF has_table_privilege(runtime_role, format('public.%I', protected_table), destructive_privilege) THEN
          RAISE EXCEPTION '% runtime privilege exists on opening-stock table %', destructive_privilege, protected_table;
        END IF;
        IF has_table_privilege(opening_stock_executor_role, format('public.%I', protected_table), destructive_privilege)
           OR has_table_privilege(opening_stock_executor_role, format('public.%I', protected_table), 'SELECT') THEN
          RAISE EXCEPTION 'Opening-stock executor has direct table authority on %', protected_table;
        END IF;
      END LOOP;
      PERFORM 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = protected_table
        AND NOT t.tgisinternal AND t.tgenabled = 'A';
      IF NOT FOUND THEN RAISE EXCEPTION '% has no ENABLE ALWAYS opening-stock integrity trigger', protected_table; END IF;
    END LOOP;

    FOREACH protected_table IN ARRAY ARRAY[
      'OpeningInventoryCohort',
      'OpeningInventoryCutover',
      'OpeningInventoryCutoverLine'
    ]
    LOOP
      PERFORM 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = protected_table AND c.relowner = owner_oid;
      IF NOT FOUND THEN RAISE EXCEPTION '% opening-stock ownership is unsafe', protected_table; END IF;
      IF NOT has_table_privilege(runtime_role, format('public.%I', protected_table), 'SELECT') THEN
        RAISE EXCEPTION '% required runtime read privilege is missing', protected_table;
      END IF;
      FOREACH destructive_privilege IN ARRAY ARRAY['DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
      LOOP
        IF has_table_privilege(runtime_role, format('public.%I', protected_table), destructive_privilege) THEN
          RAISE EXCEPTION '% runtime privilege exists on opening-stock table %', destructive_privilege, protected_table;
        END IF;
      END LOOP;
      IF has_table_privilege(opening_stock_executor_role, format('public.%I', protected_table), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') THEN
        RAISE EXCEPTION 'Opening-stock executor has direct table authority on %', protected_table;
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1
      FROM pg_attribute a
      WHERE a.attrelid = 'public."OpeningInventoryCohort"'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND (
          (has_column_privilege(runtime_role, a.attrelid, a.attnum, 'INSERT') AND a.attname <> ALL (ARRAY['id','tenantId','companyId','configurationRevisionId','configurationRevisionNumber','configurationDigest','publicReference','predecessorCohortId','generation','effectiveAt','status','canonicalJson','cohortDigest','version','createdByUserId','createdAt','updatedAt']))
          OR (has_column_privilege(runtime_role, a.attrelid, a.attnum, 'UPDATE') AND a.attname <> ALL (ARRAY['status','version','sealedByUserId','sealedAt','cancelledByUserId','cancelledAt','cancellationReason','updatedAt']))
        )
    ) THEN RAISE EXCEPTION 'OpeningInventoryCohort runtime column grant exceeds the reviewed draft/approval contract'; END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(ARRAY['id','tenantId','companyId','configurationRevisionId','configurationRevisionNumber','configurationDigest','publicReference','predecessorCohortId','generation','effectiveAt','status','canonicalJson','cohortDigest','version','createdByUserId','createdAt','updatedAt']) column_name
      WHERE NOT has_column_privilege(runtime_role, 'public."OpeningInventoryCohort"', column_name, 'INSERT')
    ) OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['status','version','sealedByUserId','sealedAt','cancelledByUserId','cancelledAt','cancellationReason','updatedAt']) column_name
      WHERE NOT has_column_privilege(runtime_role, 'public."OpeningInventoryCohort"', column_name, 'UPDATE')
    ) THEN RAISE EXCEPTION 'OpeningInventoryCohort runtime draft/approval column grant is incomplete'; END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_attribute a
      WHERE a.attrelid = 'public."OpeningInventoryCutover"'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND (
          (has_column_privilege(runtime_role, a.attrelid, a.attnum, 'INSERT') AND a.attname <> ALL (ARRAY['id','cohortId','tenantId','companyId','inventoryLocationId','locationId','stockCountSessionId','stockCountAttemptId','status','version','idempotencyKey','evidenceManifestJson','evidenceDigest','valuationCanonicalJson','valuationDigest','cutoverCanonicalJson','cutoverDigest','requestedByUserId','requestedAt','createdAt','updatedAt']))
          OR (has_column_privilege(runtime_role, a.attrelid, a.attnum, 'UPDATE') AND a.attname <> ALL (ARRAY['status','version','reviewedByUserId','reviewedAt','approvalInstanceId','approvedAt','cancelledAt','cancellationReason','updatedAt']))
        )
    ) THEN RAISE EXCEPTION 'OpeningInventoryCutover runtime column grant exceeds the reviewed draft/approval contract'; END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(ARRAY['id','cohortId','tenantId','companyId','inventoryLocationId','locationId','stockCountSessionId','stockCountAttemptId','status','version','idempotencyKey','evidenceManifestJson','evidenceDigest','valuationCanonicalJson','valuationDigest','cutoverCanonicalJson','cutoverDigest','requestedByUserId','requestedAt','createdAt','updatedAt']) column_name
      WHERE NOT has_column_privilege(runtime_role, 'public."OpeningInventoryCutover"', column_name, 'INSERT')
    ) OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['status','version','reviewedByUserId','reviewedAt','approvalInstanceId','approvedAt','cancelledAt','cancellationReason','updatedAt']) column_name
      WHERE NOT has_column_privilege(runtime_role, 'public."OpeningInventoryCutover"', column_name, 'UPDATE')
    ) THEN RAISE EXCEPTION 'OpeningInventoryCutover runtime draft/approval column grant is incomplete'; END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_attribute a
      WHERE a.attrelid = 'public."OpeningInventoryCutoverLine"'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND (has_column_privilege(runtime_role, a.attrelid, a.attnum, 'INSERT') AND a.attname <> ALL (ARRAY['id','cutoverId','tenantId','companyId','inventoryLocationId','itemId','uomId','stockCountAttemptId','stockCountAttemptLineId','lineNumber','lotKey','lotNumber','expiryDate','sourceSystemQuantityBaseUom','sourceCountedQuantityBaseUom','sourceVarianceQuantityBaseUom','openingQuantityBaseUom','unitCost','openingValue','lineCanonicalJson','lineDigest','createdAt']))
    ) THEN RAISE EXCEPTION 'OpeningInventoryCutoverLine runtime column grant exceeds the reviewed draft capture contract'; END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(ARRAY['id','cutoverId','tenantId','companyId','inventoryLocationId','itemId','uomId','stockCountAttemptId','stockCountAttemptLineId','lineNumber','lotKey','lotNumber','expiryDate','sourceSystemQuantityBaseUom','sourceCountedQuantityBaseUom','sourceVarianceQuantityBaseUom','openingQuantityBaseUom','unitCost','openingValue','lineCanonicalJson','lineDigest','createdAt']) column_name
      WHERE NOT has_column_privilege(runtime_role, 'public."OpeningInventoryCutoverLine"', column_name, 'INSERT')
    ) THEN RAISE EXCEPTION 'OpeningInventoryCutoverLine runtime draft capture column grant is incomplete'; END IF;

    PERFORM 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'OpeningInventoryExecutionCommand' AND c.relowner = owner_oid;
    IF NOT FOUND THEN RAISE EXCEPTION 'OpeningInventoryExecutionCommand ownership is unsafe'; END IF;
    IF NOT has_table_privilege(runtime_role, 'public."OpeningInventoryExecutionCommand"', 'SELECT')
       OR NOT has_table_privilege(runtime_role, 'public."OpeningInventoryExecutionCommand"', 'INSERT') THEN
      RAISE EXCEPTION 'OpeningInventoryExecutionCommand runtime append privilege is missing';
    END IF;
    FOREACH destructive_privilege IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']
    LOOP
      IF has_table_privilege(runtime_role, 'public."OpeningInventoryExecutionCommand"', destructive_privilege) THEN
        RAISE EXCEPTION '% runtime privilege exists on OpeningInventoryExecutionCommand', destructive_privilege;
      END IF;
      IF has_table_privilege(opening_stock_executor_role, 'public."OpeningInventoryExecutionCommand"', destructive_privilege)
         OR has_table_privilege(opening_stock_executor_role, 'public."OpeningInventoryExecutionCommand"', 'SELECT,INSERT') THEN
        RAISE EXCEPTION 'Opening-stock executor has direct command-table authority';
      END IF;
    END LOOP;
    PERFORM 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'OpeningInventoryExecutionCommand'
      AND NOT t.tgisinternal AND t.tgenabled = 'A';
    IF NOT FOUND THEN RAISE EXCEPTION 'OpeningInventoryExecutionCommand has no ENABLE ALWAYS integrity trigger'; END IF;
    PERFORM 1 FROM pg_proc routine
      WHERE routine.oid = 'public.guard_opening_inventory_execution_command_scope()'::regprocedure
        AND routine.proowner = owner_oid AND NOT routine.prosecdef
        AND routine.pronargs = 0 AND routine.prorettype = 'trigger'::regtype
        AND routine.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
        AND encode(pg_catalog.sha256(convert_to(routine.prosrc, 'UTF8')), 'hex') = '16552c4b33a97941a91d23a3a9948cd102894937662c062c56cfae20f24d8f7c';
    IF NOT FOUND THEN RAISE EXCEPTION 'Opening-stock command scope trigger routine contract is unsafe'; END IF;

    IF EXISTS (
      SELECT expected.table_name
      FROM (VALUES
        ('OpeningInventoryCohort', 'OpeningInventoryCohort_transition_trg', 'public.guard_opening_inventory_cohort()'::regprocedure),
        ('OpeningInventoryCohort', 'OpeningInventoryCohort_seal_event_trg', 'public.append_opening_inventory_cohort_seal_event()'::regprocedure),
        ('OpeningInventoryCutover', 'OpeningInventoryCutover_transition_trg', 'public.guard_opening_inventory_cutover()'::regprocedure),
        ('OpeningInventoryCutoverLine', 'OpeningInventoryCutoverLine_append_only_trg', 'public.guard_opening_inventory_cutover_line()'::regprocedure),
        ('OpeningInventoryReconciliation', 'OpeningInventoryReconciliation_append_only_trg', 'public.guard_opening_inventory_reconciliation()'::regprocedure),
        ('OpeningInventoryApprovalAttestation', 'OpeningInventoryApprovalAttestation_append_only_trg', 'public.guard_opening_inventory_approval_attestation()'::regprocedure),
        ('OpeningInventoryCohortEvent', 'OpeningInventoryCohortEvent_append_only_trg', 'public.guard_opening_inventory_cohort_event()'::regprocedure),
        ('OpeningInventoryExecutionCommand', 'OpeningInventoryExecutionCommand_scope_trg', 'public.guard_opening_inventory_execution_command_scope()'::regprocedure),
        ('OpeningInventoryExecutionCommand', 'OpeningInventoryExecutionCommand_transition_trg', 'public.guard_opening_inventory_execution_command()'::regprocedure),
        ('InventoryMovement', '00_OpeningInventoryMovement_fence_trg', 'public.guard_opening_inventory_movement_fence()'::regprocedure),
        ('InventoryMovement', '90_InventoryMovement_balance_cache_trg', 'public.apply_inventory_movement_to_balance()'::regprocedure),
        ('InventoryBalance', 'InventoryBalance_derived_cache_guard_trg', 'public.guard_inventory_balance_derived_cache()'::regprocedure)
      ) AS expected(table_name, trigger_name, function_oid)
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = expected.table_name
          AND t.tgname = expected.trigger_name AND NOT t.tgisinternal
          AND t.tgenabled = 'A' AND t.tgfoid = expected.function_oid
      )
    ) THEN
      RAISE EXCEPTION 'Opening-stock integrity trigger contract drifted';
    END IF;
    IF (SELECT count(*) FROM pg_trigger trigger_record
          WHERE trigger_record.tgrelid = 'public."InventoryBalance"'::regclass
            AND NOT trigger_record.tgisinternal) <> 1
       OR NOT EXISTS (
         SELECT 1 FROM pg_trigger trigger_record
          WHERE trigger_record.tgrelid = 'public."InventoryBalance"'::regclass
            AND trigger_record.tgname = 'InventoryBalance_derived_cache_guard_trg'
            AND trigger_record.tgenabled = 'A' AND trigger_record.tgtype = 31
       )
       OR NOT EXISTS (
         SELECT 1 FROM pg_trigger trigger_record
          WHERE trigger_record.tgrelid = 'public."InventoryMovement"'::regclass
            AND trigger_record.tgname = '90_InventoryMovement_balance_cache_trg'
            AND trigger_record.tgenabled = 'A' AND trigger_record.tgtype = 5
    ) THEN
      RAISE EXCEPTION 'Inventory ledger-to-balance sole-trigger graph drifted';
    END IF;
    PERFORM 1 FROM pg_proc routine
      WHERE routine.oid = 'public.guard_opening_inventory_movement_fence()'::regprocedure
        AND routine.proowner = owner_oid AND NOT routine.prosecdef
        AND routine.pronargs = 0 AND routine.prorettype = 'trigger'::regtype
        AND routine.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
        AND encode(pg_catalog.sha256(convert_to(routine.prosrc, 'UTF8')), 'hex') = '7e62eb6b5923cdb8f0182024e8fc1629b7c8f2e771424fd2f00cb0563e54594e';
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory movement location/fence trigger routine contract is unsafe'; END IF;
    PERFORM 1 FROM pg_proc routine
      WHERE routine.oid = 'public.apply_inventory_movement_to_balance()'::regprocedure
        AND routine.proowner = owner_oid AND routine.prosecdef
        AND routine.pronargs = 0 AND routine.prorettype = 'trigger'::regtype
        AND routine.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
        AND encode(pg_catalog.sha256(convert_to(routine.prosrc, 'UTF8')), 'hex') = '00bb66895c1f3fe48c5772fa893ad3c993d47cc3684182d9e30c345ce9ed4659';
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory movement balance-cache writer routine contract is unsafe'; END IF;
    PERFORM 1 FROM pg_proc routine
      WHERE routine.oid = 'public.guard_inventory_balance_derived_cache()'::regprocedure
        AND routine.proowner = owner_oid AND NOT routine.prosecdef
        AND routine.pronargs = 0 AND routine.prorettype = 'trigger'::regtype
        AND routine.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
        AND encode(pg_catalog.sha256(convert_to(routine.prosrc, 'UTF8')), 'hex') = '9aa7cc47d8ae982dd2c8156ae0e9f226878c386b87394e720aae31514e662fdc';
    IF NOT FOUND THEN RAISE EXCEPTION 'InventoryBalance derived-cache guard routine contract is unsafe'; END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(ARRAY[
        'public.guard_opening_inventory_movement_fence()'::regprocedure,
        'public.apply_inventory_movement_to_balance()'::regprocedure,
        'public.guard_inventory_balance_derived_cache()'::regprocedure
      ]) protected_routine(function_oid)
      JOIN pg_proc routine ON routine.oid = protected_routine.function_oid
      WHERE has_function_privilege(runtime_role, routine.oid, 'EXECUTE')
         OR has_function_privilege(opening_stock_owner_role, routine.oid, 'EXECUTE')
         OR has_function_privilege(opening_stock_executor_role, routine.oid, 'EXECUTE')
         OR EXISTS (
           SELECT 1 FROM aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) acl
            WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
         )
    ) THEN
      RAISE EXCEPTION 'Inventory derived-cache trigger routine is directly callable';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'public.is_opening_inventory_executor_session()'::regprocedure,
        'public.is_opening_inventory_executor_context()'::regprocedure,
        'public.opening_inventory_utc_json_timestamp(timestamp without time zone)'::regprocedure,
        'public.assert_opening_inventory_command_requester_segregation(uuid,uuid,"OpeningInventoryExecutionCommandType")'::regprocedure
      ]) helper(function_oid)
      JOIN pg_proc p ON p.oid = helper.function_oid
      WHERE NOT has_function_privilege(runtime_role, p.oid, 'EXECUTE')
         OR has_function_privilege(opening_stock_executor_role, p.oid, 'EXECUTE')
         OR EXISTS (
           SELECT 1
           FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
           WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
         )
    ) THEN
      RAISE EXCEPTION 'Opening-stock runtime helper ACL contract is incomplete or overbroad';
    END IF;

    PERFORM 1 FROM pg_proc p
      WHERE p.oid = 'public.execute_opening_inventory_command(uuid)'::regprocedure
        AND p.proowner = opening_stock_owner_oid
        AND p.prosecdef
        AND p.pronargs = 1
        AND p.proargtypes = '2950'::oidvector
        AND p.pronargdefaults = 0
        AND p.prorettype = 'text'::regtype
        AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]
        AND encode(pg_catalog.sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'b52bd90e8d50f9697cecc9137cf4f829086a8ba4df78818d93098129bc07cfdd';
    IF NOT FOUND THEN RAISE EXCEPTION 'Opening-stock executor routine catalog contract is unsafe'; END IF;
    IF NOT has_function_privilege(opening_stock_executor_role, 'public.execute_opening_inventory_command(uuid)', 'EXECUTE')
       OR has_function_privilege(runtime_role, 'public.execute_opening_inventory_command(uuid)', 'EXECUTE')
       OR EXISTS (
         SELECT 1 FROM pg_proc p,
           LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE p.oid = 'public.execute_opening_inventory_command(uuid)'::regprocedure
           AND acl.privilege_type = 'EXECUTE'
           AND (acl.grantee = 0 OR acl.grantee NOT IN (opening_stock_owner_oid, opening_stock_executor_oid))
       ) THEN
      RAISE EXCEPTION 'Opening-stock executor routine ACL boundary is unsafe';
    END IF;
    PERFORM 1 FROM pg_proc p
      WHERE p.oid = 'public.append_opening_inventory_cohort_seal_event()'::regprocedure
        AND p.proowner = opening_stock_owner_oid
        AND p.prosecdef
        AND p.pronargs = 0
        AND p.prorettype = 'trigger'::regtype
        AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]
        AND encode(pg_catalog.sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '728a169e4c17fcffcaddca8e8c45117ea983ff8c693d7ccea4a139777f86a0bc';
    IF NOT FOUND THEN RAISE EXCEPTION 'Opening-stock sealed-event trigger routine contract is unsafe'; END IF;
    IF has_function_privilege(runtime_role, 'public.append_opening_inventory_cohort_seal_event()', 'EXECUTE')
       OR has_function_privilege(opening_stock_executor_role, 'public.append_opening_inventory_cohort_seal_event()', 'EXECUTE')
       OR EXISTS (
         SELECT 1 FROM pg_proc p,
           LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE p.oid = 'public.append_opening_inventory_cohort_seal_event()'::regprocedure
           AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       ) THEN
      RAISE EXCEPTION 'Opening-stock sealed-event trigger is callable outside its table trigger';
    END IF;
  END IF;
  IF has_table_privilege(runtime_role, 'public._prisma_migrations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'Runtime can access Prisma migration history';
  END IF;
  PERFORM 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reject_protected_history_mutation'
      AND p.proowner = owner_oid AND NOT p.prosecdef;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guard function ownership or execution mode is unsafe'; END IF;
  IF has_function_privilege(runtime_role, 'public.reject_protected_history_mutation()', 'EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       WHERE n.nspname = 'public' AND p.proname = 'reject_protected_history_mutation'
         AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Guard function is callable by runtime or PUBLIC';
  END IF;
END
$verify$;

SELECT 'RESULT | PASS | PostgreSQL effective role contract verified.';
