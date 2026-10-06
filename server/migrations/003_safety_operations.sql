CREATE TABLE request_limits (
 bucket text NOT NULL, key_hash text NOT NULL, hits integer NOT NULL,
 expires_at timestamptz NOT NULL, PRIMARY KEY(bucket,key_hash)
);
CREATE INDEX request_limits_expiry ON request_limits(expires_at);
CREATE TABLE staff_mfa (
 user_id uuid PRIMARY KEY REFERENCES users(id), secret_cipher text NOT NULL,
 enabled_at timestamptz, pending_expires_at timestamptz, last_counter bigint NOT NULL DEFAULT -1
);
CREATE TABLE staff_stepups (
 user_id uuid NOT NULL REFERENCES users(id), family_id uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,family_id)
);
CREATE TABLE profile_photos (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), url text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('pending','approved','rejected','removed')),
 reason text, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 reviewed_by uuid REFERENCES users(id)
);
-- Legacy files retain their exact visibility; external fixture URLs stay on users.
INSERT INTO profile_photos(id,user_id,url,status)
 SELECT substring(avatar_url from 8 for 36)::uuid,id,avatar_url,'approved' FROM users
 WHERE avatar_url ~ '^/media/[a-f0-9-]{36}\.jpg$' ON CONFLICT(url) DO NOTHING;
INSERT INTO profile_photos(id,user_id,url,status)
 SELECT substring(pending_avatar from 8 for 36)::uuid,id,pending_avatar,'pending' FROM users
 WHERE pending_avatar ~ '^/media/[a-f0-9-]{36}\.jpg$' ON CONFLICT(url) DO NOTHING;
CREATE INDEX profile_photos_owner ON profile_photos(user_id,status);
CREATE TABLE account_requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), kind text NOT NULL CHECK(kind IN ('export','deletion')),
 status text NOT NULL CHECK(status IN ('requested','awaiting_policy','withdrawn','exported')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX account_deletion_pending ON account_requests(user_id) WHERE kind='deletion' AND status='awaiting_policy';
ALTER TABLE events DROP CONSTRAINT events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check CHECK(status IN ('draft','published','cancelled','completed'));
ALTER TABLE events ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE events ADD COLUMN created_by uuid REFERENCES users(id);
ALTER TABLE events ADD COLUMN cancelled_at timestamptz;
ALTER TABLE events ADD COLUMN cancellation_reason text;
ALTER TABLE events ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE rsvps ADD COLUMN cancelled_at timestamptz;
CREATE TABLE notifications (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), event_id uuid REFERENCES events(id),
 kind text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 UNIQUE(user_id,event_id,kind)
);
CREATE TABLE notification_mail (
 id uuid PRIMARY KEY, notification_id uuid NOT NULL UNIQUE REFERENCES notifications(id),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid, lease_until timestamptz, sent_at timestamptz, failed_at timestamptz
);
CREATE FUNCTION protect_audit_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit records are append-only'; END;
$$;
CREATE TRIGGER audit_no_update_delete BEFORE UPDATE OR DELETE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_log();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_log();
