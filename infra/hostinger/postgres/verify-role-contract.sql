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

  FOREACH protected_table IN ARRAY ARRAY['AuditEvent', 'ProjectActivityEvent', 'InventoryMovement']
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

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
      AND has_function_privilege(runtime_role, p.oid, 'EXECUTE')
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
