-- Run as the migration owner AFTER app migrations, in a dedicated staging database.
-- Inspect existing tables first. This script never touches auth or storage schemas.
-- The runtime role cannot log in until an operator creates a login/password for it.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='flingtopia_runtime') THEN
    CREATE ROLE flingtopia_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO flingtopia_runtime;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','refresh_sessions','email_tokens','likes','passes','matches','messages',
    'follows','blocks','reports','events','rsvps','audit_log','user_consents',
    'password_reset_tokens','recovery_mail','request_limits','staff_mfa',
    'staff_stepups','profile_photos','account_requests','notifications','notification_mail',
    'schema_versions','app_migrations','social_identities','social_auth_flows'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Permission checks for individual members remain in the backend, which owns sessions.
    EXECUTE format('DROP POLICY IF EXISTS flingtopia_server_access ON public.%I', t);
    EXECUTE format('CREATE POLICY flingtopia_server_access ON public.%I TO flingtopia_runtime USING (true) WITH CHECK (true)', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO flingtopia_runtime', t);
    IF t='audit_log' THEN
      EXECUTE format('GRANT INSERT ON TABLE public.%I TO flingtopia_runtime', t);
    ELSIF t NOT IN ('schema_versions','app_migrations') THEN
      EXECUTE format('GRANT INSERT, UPDATE, DELETE ON TABLE public.%I TO flingtopia_runtime', t);
    END IF;
  END LOOP;
END $$;
-- Prevent the migration owner from automatically exposing FUTURE app tables.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
COMMIT;
