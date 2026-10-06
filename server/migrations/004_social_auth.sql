CREATE TABLE social_identities (
 provider text NOT NULL CHECK (provider IN ('google','apple')),
 subject text NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,subject), UNIQUE(user_id,provider)
);
CREATE TABLE social_auth_flows (
 state_hash text PRIMARY KEY,
 browser_hash text NOT NULL UNIQUE,
 provider text NOT NULL CHECK (provider IN ('google','apple')),
 nonce text NOT NULL,
 verifier text NOT NULL,
 identity jsonb,
 consumed_at timestamptz,
 expires_at timestamptz NOT NULL
);
CREATE INDEX social_auth_expiry_idx ON social_auth_flows(expires_at);
REVOKE ALL ON social_identities, social_auth_flows FROM PUBLIC;
-- Hosted runtime is a restricted server role; browsers never access these tables.
DO $$
DECLARE t text;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='flingtopia_runtime') THEN
  FOREACH t IN ARRAY ARRAY['social_identities','social_auth_flows'] LOOP
   EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO flingtopia_runtime',t);
   EXECUTE format('CREATE POLICY flingtopia_server_access ON %I TO flingtopia_runtime USING (true) WITH CHECK (true)',t);
  END LOOP;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON social_identities, social_auth_flows FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON social_identities, social_auth_flows FROM authenticated;
 END IF;
END $$;
