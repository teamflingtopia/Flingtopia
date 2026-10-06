ALTER TABLE users ADD COLUMN onboarding_completed_at timestamptz;
ALTER TABLE users ADD COLUMN onboarding_draft jsonb NOT NULL DEFAULT '{}';
-- Existing accounts keep their profile data; completion is confirmed on next sign-in.
CREATE TABLE user_consents (
 user_id uuid NOT NULL REFERENCES users(id), kind text NOT NULL,
 version text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,kind,version)
);
CREATE TABLE password_reset_tokens (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens(user_id,created_at);
CREATE TABLE recovery_mail (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), token_id uuid NOT NULL REFERENCES password_reset_tokens(id),
 payload text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, lease_id uuid, sent_at timestamptz, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
