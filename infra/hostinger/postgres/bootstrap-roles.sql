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
  owner_oid oid;
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

  FOR obj IN
    SELECT granted_role.rolname AS granted_role, member_role.rolname AS member_role
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname IN (owner_role, migrator_role, runtime_role)
  LOOP
    EXECUTE format('REVOKE %I FROM %I', obj.granted_role, obj.member_role);
  END LOOP;
  EXECUTE format('GRANT %I TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE', owner_role, migrator_role);
  EXECUTE format('ALTER ROLE %I IN DATABASE %I SET role TO %L', migrator_role, database_name, owner_role);
  EXECUTE format('ALTER ROLE %I IN DATABASE %I RESET role', runtime_role, database_name);
  EXECUTE format('ALTER ROLE %I IN DATABASE %I SET search_path TO pg_catalog, public', migrator_role, database_name);
  EXECUTE format('ALTER ROLE %I IN DATABASE %I SET search_path TO pg_catalog, public', runtime_role, database_name);

  IF contract_scope = 'disposable' AND to_regnamespace('ogfi_disposable_control') IS NOT NULL THEN
    EXECUTE format('GRANT USAGE ON SCHEMA ogfi_disposable_control TO %I, %I', owner_role, migrator_role);
    IF to_regclass('ogfi_disposable_control.database_identity') IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON TABLE ogfi_disposable_control.database_identity TO %I, %I', owner_role, migrator_role);
      EXECUTE format('REVOKE ALL ON TABLE ogfi_disposable_control.database_identity FROM %I', runtime_role);
    END IF;
    EXECUTE format('REVOKE ALL ON SCHEMA ogfi_disposable_control FROM %I', runtime_role);
  END IF;

  SELECT oid INTO STRICT owner_oid FROM pg_roles WHERE rolname = owner_role;
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
END
$bootstrap$;

SELECT 'RESULT | PASS | Environment-qualified PostgreSQL roles and legacy/restore ownership reconciled.';
