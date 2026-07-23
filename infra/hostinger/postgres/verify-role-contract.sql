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
  protected_table text;
  destructive_privilege text;
  owner_oid oid;
  migrator_oid oid;
  runtime_oid oid;
  public_schema_oid oid;
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

  IF pg_has_role(runtime_role, owner_role, 'MEMBER') OR pg_has_role(runtime_role, migrator_role, 'MEMBER') THEN
    RAISE EXCEPTION 'Runtime has a transitive administrative role path';
  END IF;
  SELECT oid INTO STRICT owner_oid FROM pg_roles WHERE rolname = owner_role;
  SELECT oid INTO STRICT migrator_oid FROM pg_roles WHERE rolname = migrator_role;
  SELECT oid INTO STRICT runtime_oid FROM pg_roles WHERE rolname = runtime_role;
  SELECT oid INTO STRICT public_schema_oid FROM pg_namespace WHERE nspname = 'public';
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN (owner_oid, runtime_oid)) THEN
    RAISE EXCEPTION 'Owner or runtime role membership closure is not empty';
  END IF;
  IF (SELECT count(*) FROM pg_auth_members WHERE member = migrator_oid) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM pg_auth_members
       WHERE member = migrator_oid AND roleid = owner_oid
         AND NOT admin_option AND NOT inherit_option AND set_option
     ) THEN
    RAISE EXCEPTION 'Migrator membership must be exactly owner with ADMIN false, INHERIT false, SET true';
  END IF;

  PERFORM 1 FROM pg_database WHERE datname = database_name AND datdba = owner_oid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Database ownership is unsafe'; END IF;
  PERFORM 1 FROM pg_namespace WHERE nspname = 'public' AND nspowner = owner_oid;
  IF NOT FOUND THEN RAISE EXCEPTION 'public schema ownership is unsafe'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_namespace n
    WHERE n.nspname NOT IN ('public', 'pg_catalog', 'information_schema')
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
     OR has_function_privilege('PUBLIC', 'public.controlled_evidence_canonical_json(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Controlled-evidence canonicalizer runtime execution boundary is unsafe';
  END IF;
  PERFORM 1 FROM pg_proc
   WHERE oid = 'public.controlled_evidence_canonical_json(jsonb)'::regprocedure
     AND provolatile = 'i' AND proisstrict AND NOT prosecdef
     AND proconfig = ARRAY['search_path=pg_catalog']::text[];
  IF NOT FOUND THEN RAISE EXCEPTION 'Controlled-evidence canonicalizer properties drifted'; END IF;
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
