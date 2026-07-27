\set ON_ERROR_STOP on

SELECT set_config('ogfi.contract.scope', :'contract_scope', false);
SELECT set_config('ogfi.contract.environment', :'app_environment', false);
SELECT set_config('ogfi.contract.database', :'database_name', false);
SELECT set_config('ogfi.contract.owner_role', :'owner_role', false);
SELECT set_config('ogfi.contract.migrator_role', :'migrator_role', false);
SELECT set_config('ogfi.contract.runtime_role', :'runtime_role', false);

DO $bootstrap$
DECLARE
  contract_scope text := current_setting('ogfi.contract.scope');
  environment_name text := current_setting('ogfi.contract.environment');
  database_name text := current_setting('ogfi.contract.database');
  owner_role text := current_setting('ogfi.contract.owner_role');
  migrator_role text := current_setting('ogfi.contract.migrator_role');
  runtime_role text := current_setting('ogfi.contract.runtime_role');
  expected_prefix text;
  obj record;
  grantee_obj record;
  owner_oid oid;
  approval_shadow_schema_oid oid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = session_user AND rolsuper) THEN
    RAISE EXCEPTION 'Role bootstrap and legacy/restore ownership adoption require a cluster administrator';
  END IF;
  IF current_database() <> database_name THEN
    RAISE EXCEPTION 'Refusing role bootstrap for unexpected database';
  END IF;
  IF contract_scope = 'hosted' THEN
    IF environment_name = 'production' AND database_name !~ '(^|[_-])(prod|production)([_-]|$)' THEN
      RAISE EXCEPTION 'Production database identity marker is missing';
    ELSIF environment_name = 'staging' AND database_name !~ '(^|[_-])(stage|staging)([_-]|$)' THEN
      RAISE EXCEPTION 'Staging database identity marker is missing';
    ELSIF environment_name NOT IN ('production', 'staging') THEN
      RAISE EXCEPTION 'Unsupported hosted database environment';
    END IF;
    expected_prefix := CASE environment_name WHEN 'production' THEN 'ogfi_prod' ELSE 'ogfi_stg' END;
  ELSIF contract_scope = 'disposable' THEN
    IF environment_name <> 'test'
       OR database_name !~ '^ogfi_(test|ci|rehearsal|disposable|demo_disposable)_[a-z0-9_-]{4,50}$' THEN
      RAISE EXCEPTION 'Disposable database identity is unsafe';
    END IF;
    expected_prefix := regexp_replace(owner_role, '_owner$', '');
    IF expected_prefix !~ '^ogfi_test_[a-z0-9_]{4,45}$' THEN
      RAISE EXCEPTION 'Disposable role prefix is unsafe';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported database role contract scope';
  END IF;

  IF owner_role <> expected_prefix || '_owner'
      OR migrator_role <> expected_prefix || '_migrator'
      OR runtime_role <> expected_prefix || '_runtime'
      OR cardinality(ARRAY(SELECT DISTINCT unnest(ARRAY[owner_role, migrator_role, runtime_role]))) <> 3 THEN
    RAISE EXCEPTION 'Environment-qualified database role contract is invalid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = owner_role) THEN
    EXECUTE format('CREATE ROLE %I NOLOGIN', owner_role);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migrator_role) THEN
    EXECUTE format('CREATE ROLE %I LOGIN', migrator_role);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    EXECUTE format('CREATE ROLE %I LOGIN', runtime_role);
  END IF;

  EXECUTE format('ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL', owner_role);
  EXECUTE format('ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', migrator_role);
  EXECUTE format('ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', runtime_role);

  SELECT oid INTO STRICT owner_oid FROM pg_roles WHERE rolname = owner_role;
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE (granted_role.rolname IN (owner_role, migrator_role, runtime_role)
        OR member_role.rolname IN (owner_role, migrator_role, runtime_role))
      AND NOT (
        granted_role.rolname = owner_role
        AND member_role.rolname = migrator_role
        AND NOT membership.admin_option
        AND NOT membership.inherit_option
        AND membership.set_option
      )
  ) OR (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE granted_role.rolname IN (owner_role, migrator_role, runtime_role)
       OR member_role.rolname IN (owner_role, migrator_role, runtime_role)
  ) > 1 THEN
    RAISE EXCEPTION 'Refusing bootstrap: controlled role membership graph contains an unexpected edge or option. Owner or runtime role membership closure is not empty. Migrator membership must be exactly owner.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE granted_role.rolname = owner_role
      AND member_role.rolname = migrator_role
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  ) THEN
    EXECUTE format('GRANT %I TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE', owner_role, migrator_role);
  END IF;
  EXECUTE format('ALTER ROLE %I IN DATABASE %I SET role TO %L', migrator_role, database_name, owner_role);
  EXECUTE format('ALTER ROLE %I IN DATABASE %I RESET role', runtime_role, database_name);
  -- Prisma migrations create unqualified objects. The controlled migrator must
  -- resolve the owner-controlled application schema before pg_catalog; placing
  -- pg_catalog first makes CREATE TABLE attempt the protected system schema.
  EXECUTE format('ALTER ROLE %I IN DATABASE %I SET search_path TO public, pg_catalog', migrator_role, database_name);
  EXECUTE format('ALTER ROLE %I IN DATABASE %I SET search_path TO pg_catalog, public', runtime_role, database_name);

  IF contract_scope = 'disposable' AND to_regnamespace('ogfi_disposable_control') IS NOT NULL THEN
    EXECUTE format('GRANT USAGE ON SCHEMA ogfi_disposable_control TO %I, %I', owner_role, migrator_role);
    IF to_regclass('ogfi_disposable_control.database_identity') IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON TABLE ogfi_disposable_control.database_identity TO %I, %I', owner_role, migrator_role);
      EXECUTE format('REVOKE ALL ON TABLE ogfi_disposable_control.database_identity FROM %I', runtime_role);
    END IF;
    EXECUTE format('REVOKE ALL ON SCHEMA ogfi_disposable_control FROM %I', runtime_role);
  END IF;

  EXECUTE format('ALTER DATABASE %I OWNER TO %I', database_name, owner_role);
  EXECUTE format('ALTER SCHEMA public OWNER TO %I', owner_role);

  FOR obj IN
    SELECT c.oid, c.relkind, n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') AND c.relowner <> owner_oid
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
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
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
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typowner <> owner_oid AND t.typrelid = 0 AND t.typtype IN ('e', 'd')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
    ORDER BY t.oid
  LOOP
    EXECUTE CASE obj.typtype
      WHEN 'd' THEN format('ALTER DOMAIN %I.%I OWNER TO %I', obj.nspname, obj.typname, owner_role)
      ELSE format('ALTER TYPE %I.%I OWNER TO %I', obj.nspname, obj.typname, owner_role)
    END;
  END LOOP;

  -- DEC-0247's shadow observers are private owner-only diagnostics. The
  -- bootstrap ceremony can run before their migration, so absence is valid;
  -- after a restore has created the schema, adopt only the exact observer
  -- signatures and remove every explicit non-owner access path. Reconciliation
  -- and verification after migration enforce the complete closed set.
  SELECT oid INTO approval_shadow_schema_oid
  FROM pg_namespace
  WHERE nspname = 'approval_shadow';
  IF approval_shadow_schema_oid IS NOT NULL THEN
    -- pgcrypto is installed by the baseline migration. These fixed SHA-256
    -- prosrc digests detect migration-source drift without exposing the body.
    IF (SELECT count(*) FROM pg_proc WHERE pronamespace = approval_shadow_schema_oid) <> 18 THEN
      RAISE EXCEPTION 'Refusing bootstrap: approval_shadow routine count differs from the reviewed contract';
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
        RAISE EXCEPTION 'Refusing bootstrap: approval_shadow routine % metadata/body attestation failed', obj.routine_name;
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
END
$bootstrap$;

SELECT 'RESULT | PASS | Environment-qualified PostgreSQL roles and legacy/restore ownership reconciled.';
