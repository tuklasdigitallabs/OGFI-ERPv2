\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 test fixture only. Never run against staging or production.
SELECT set_config('ogfi.adversarial.action', :'fixture_action', false);
SELECT set_config('ogfi.adversarial.case', :'drift_case', false);
SELECT set_config('ogfi.adversarial.database', :'database_name', false);
SELECT set_config('ogfi.adversarial.owner', :'owner_role', false);
SELECT set_config('ogfi.adversarial.migrator', :'migrator_role', false);
SELECT set_config('ogfi.adversarial.runtime', :'runtime_role', false);
SELECT set_config('ogfi.adversarial.role', :'adversarial_role', false);

DO $fixture$
DECLARE
  fixture_action text := current_setting('ogfi.adversarial.action');
  drift_case text := current_setting('ogfi.adversarial.case');
  database_name text := current_setting('ogfi.adversarial.database');
  owner_role text := current_setting('ogfi.adversarial.owner');
  migrator_role text := current_setting('ogfi.adversarial.migrator');
  runtime_role text := current_setting('ogfi.adversarial.runtime');
  adversarial_role text := current_setting('ogfi.adversarial.role');
  member_role text;
  database_identity text[];
  controlled_identity text[];
  adversarial_identity text[];
BEGIN
  IF current_database() <> database_name
     OR database_name !~ '^ogfi_(test|ci|rehearsal|disposable|demo_disposable)_' THEN
    RAISE EXCEPTION 'Adversarial role fixture requires a positively identified disposable database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = session_user AND rolsuper) THEN
    RAISE EXCEPTION 'Adversarial role fixture requires the disposable cluster administrator';
  END IF;
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'Adversarial role fixture requires PostgreSQL 17';
  END IF;
  database_identity := regexp_match(database_name, '^ogfi_test_([a-z0-9_]{1,24})_([a-f0-9]{16})$');
  controlled_identity := regexp_match(owner_role, '^ogfi_test_([a-z0-9_]{1,10})_([a-f0-9]{32})_owner$');
  adversarial_identity := regexp_match(adversarial_role, '^ogfi_adv_([a-z0-9_]{1,8})_([a-f0-9]{32})$');
  IF database_identity IS NULL OR controlled_identity IS NULL OR adversarial_identity IS NULL
     OR length(adversarial_role) > 63
     OR migrator_role <> regexp_replace(owner_role, '_owner$', '_migrator')
     OR runtime_role <> regexp_replace(owner_role, '_owner$', '_runtime')
     OR controlled_identity[1] <> left(database_identity[1], 10)
     OR adversarial_identity[1] <> left(database_identity[1], 8)
     OR left(controlled_identity[2], 16) <> database_identity[2]
     OR adversarial_identity[2] <> controlled_identity[2] THEN
    RAISE EXCEPTION 'Controlled and adversarial roles are not bound to the same disposable run';
  END IF;
  IF fixture_action NOT IN ('install', 'cleanup') THEN
    RAISE EXCEPTION 'fixture_action must be install or cleanup';
  END IF;
  IF drift_case NOT IN (
    'security_definer', 'column_acl', 'owner_membership', 'migrator_membership',
    'runtime_membership', 'wrong_ownership', 'default_privilege', 'unexpected_schema'
  ) THEN
    RAISE EXCEPTION 'Unsupported adversarial drift case';
  END IF;

  IF fixture_action = 'install'
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = adversarial_role) THEN
    EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', adversarial_role);
  END IF;
  IF fixture_action = 'install' THEN
    PERFORM 1 FROM pg_roles
    WHERE rolname = adversarial_role AND NOT rolcanlogin AND NOT rolsuper
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit
      AND NOT rolreplication AND NOT rolbypassrls;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Existing adversarial role attributes are unsafe';
    END IF;
  END IF;

  IF fixture_action = 'install' THEN
    CASE drift_case
      WHEN 'security_definer' THEN
        EXECUTE 'CREATE OR REPLACE FUNCTION public.ogfi_contract_adversarial_definer() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS ''SELECT 1''';
        EXECUTE format('ALTER FUNCTION public.ogfi_contract_adversarial_definer() OWNER TO %I', owner_role);
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.ogfi_contract_adversarial_definer() TO PUBLIC';
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.ogfi_contract_adversarial_definer() TO %I', runtime_role);
      WHEN 'column_acl' THEN
        EXECUTE format('GRANT UPDATE ("occurredAt") ON TABLE public."AuditEvent" TO %I', runtime_role);
      WHEN 'owner_membership' THEN
        EXECUTE format('GRANT %I TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE', adversarial_role, owner_role);
      WHEN 'migrator_membership' THEN
        EXECUTE format('GRANT %I TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE', adversarial_role, migrator_role);
      WHEN 'runtime_membership' THEN
        EXECUTE format('GRANT %I TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE', adversarial_role, runtime_role);
      WHEN 'wrong_ownership' THEN
        EXECUTE format('ALTER TABLE public."AuditEvent" OWNER TO %I', adversarial_role);
      WHEN 'default_privilege' THEN
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT TRIGGER ON TABLES TO %I', owner_role, runtime_role);
      WHEN 'unexpected_schema' THEN
        EXECUTE format('CREATE SCHEMA ogfi_contract_adversarial AUTHORIZATION %I', owner_role);
    END CASE;
  ELSE
    IF to_regprocedure('public.ogfi_contract_adversarial_definer()') IS NOT NULL THEN
      DROP FUNCTION public.ogfi_contract_adversarial_definer();
    END IF;
    IF to_regclass('public."AuditEvent"') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ("occurredAt") ON TABLE public."AuditEvent" FROM %I', runtime_role);
      EXECUTE format('ALTER TABLE public."AuditEvent" OWNER TO %I', owner_role);
    END IF;
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRIGGER ON TABLES FROM %I', owner_role, runtime_role);
    DROP SCHEMA IF EXISTS ogfi_contract_adversarial CASCADE;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = adversarial_role) THEN
      FOR member_role IN
        SELECT member.rolname
        FROM pg_auth_members membership
        JOIN pg_roles granted ON granted.oid = membership.roleid
        JOIN pg_roles member ON member.oid = membership.member
        WHERE granted.rolname = adversarial_role
          AND member.rolname IN (owner_role, migrator_role, runtime_role)
      LOOP
        EXECUTE format('REVOKE %I FROM %I', adversarial_role, member_role);
      END LOOP;
      EXECUTE format('DROP ROLE %I', adversarial_role);
    END IF;
  END IF;
END
$fixture$;

SELECT 'RESULT | PASS | Disposable adversarial role drift fixture applied.';
