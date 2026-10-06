CREATE TABLE IF NOT EXISTS schema_versions (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, username text NOT NULL UNIQUE,
 password_hash text NOT NULL, display_name text NOT NULL, dob date NOT NULL,
 gender text NOT NULL CHECK(gender IN ('woman','man','nonbinary','custom')),
 looking_for text NOT NULL DEFAULT 'everyone' CHECK(looking_for IN ('everyone','woman','man','nonbinary','custom')),
 city text NOT NULL, bio text NOT NULL DEFAULT '', interests text[] NOT NULL DEFAULT '{}',
 role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','creator','influencer')),
 staff_role text CHECK(staff_role IN ('moderator','admin')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
 email_verified boolean NOT NULL DEFAULT false, identity_verified boolean NOT NULL DEFAULT false,
 avatar_url text, pending_avatar text, profile_visible boolean NOT NULL DEFAULT true,
 is_demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refresh_sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE, family_id uuid NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS refresh_user_idx ON refresh_sessions(user_id);
CREATE TABLE IF NOT EXISTS email_tokens (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE TABLE IF NOT EXISTS likes (user_id uuid NOT NULL REFERENCES users(id), target_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,target_id), CHECK(user_id <> target_id));
CREATE TABLE IF NOT EXISTS passes (user_id uuid NOT NULL REFERENCES users(id), target_id uuid NOT NULL REFERENCES users(id), PRIMARY KEY(user_id,target_id));
CREATE TABLE IF NOT EXISTS matches (id uuid PRIMARY KEY, user_a uuid NOT NULL REFERENCES users(id), user_b uuid NOT NULL REFERENCES users(id), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_a,user_b), CHECK(user_a < user_b));
CREATE TABLE IF NOT EXISTS messages (id uuid PRIMARY KEY, match_id uuid NOT NULL REFERENCES matches(id), sender_id uuid NOT NULL REFERENCES users(id), body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), client_id uuid NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(sender_id,client_id));
CREATE INDEX IF NOT EXISTS messages_match_idx ON messages(match_id,created_at,id);
CREATE TABLE IF NOT EXISTS follows (user_id uuid NOT NULL REFERENCES users(id), target_id uuid NOT NULL REFERENCES users(id), PRIMARY KEY(user_id,target_id), CHECK(user_id <> target_id));
CREATE TABLE IF NOT EXISTS blocks (user_id uuid NOT NULL REFERENCES users(id), target_id uuid NOT NULL REFERENCES users(id), PRIMARY KEY(user_id,target_id), CHECK(user_id <> target_id));
CREATE TABLE IF NOT EXISTS reports (id uuid PRIMARY KEY, reporter_id uuid NOT NULL REFERENCES users(id), target_id uuid NOT NULL REFERENCES users(id), category text NOT NULL, details text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), resolution text, resolved_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS events (id uuid PRIMARY KEY, title text NOT NULL, description text NOT NULL, category text NOT NULL, city text NOT NULL, venue text NOT NULL, starts_at timestamptz NOT NULL, image_url text, capacity integer NOT NULL CHECK(capacity > 0), price_inr integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','cancelled','completed')), is_demo boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS rsvps (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), event_id uuid NOT NULL REFERENCES events(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,event_id));
CREATE TABLE IF NOT EXISTS audit_log (id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id), action text NOT NULL, target_id uuid, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS users_discovery_idx ON users(status,profile_visible,city);
CREATE INDEX IF NOT EXISTS blocks_reverse_idx ON blocks(target_id,user_id);
INSERT INTO schema_versions(version) VALUES(1) ON CONFLICT DO NOTHING;
