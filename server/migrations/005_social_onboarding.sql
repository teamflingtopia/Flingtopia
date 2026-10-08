-- Provider-authenticated accounts can exist before age/profile completion.
-- No fabricated birth date, gender, or application password is stored.
ALTER TABLE users ALTER COLUMN dob DROP NOT NULL;
ALTER TABLE users ALTER COLUMN gender DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT completed_profile_demographics
 CHECK (onboarding_completed_at IS NULL OR (dob IS NOT NULL AND gender IS NOT NULL));
