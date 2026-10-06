# Google and Apple sign-in

## Release status

Implemented locally; provider credentials, database migration, and deployment are required before the buttons appear. No live provider sign-in or automated tests have been run for this change. Keep Render automatic deploy disabled until migration 004 is applied.

## Account behavior

- Google uses authorization code flow with PKCE, state, and nonce. Apple uses authorization code flow, state, nonce, and a signed client secret generated on the server.
- Identity tokens are checked against provider signing keys, issuer, audience, expiry, nonce, and authorized-party claims. Provider access and refresh tokens are discarded.
- OAuth transactions last ten minutes, are single-use, and are bound to an HttpOnly browser cookie. Apple requires HTTPS and a Secure SameSite=None callback cookie. The exact Apple POST callback is exempt from the application's same-origin POST check; its state and browser binding provide CSRF protection instead.
- Returning identities use normal application sessions. Suspended/deleted accounts cannot log in; staff MFA requirements remain in place.
- New members enter their name, username, date of birth, gender, city, consent, and a backup password. The password supports existing export/deletion and recovery workflows; subsequent social sign-ins require no application password.
- An existing email address is never sufficient to link accounts: the existing account password is required. Identity links cannot be silently replaced. Account linking/unlinking management is not included in this release.
- Apple verified email and Google Gmail/Workspace email can satisfy email verification. Google third-party email addresses without a hosted-domain claim still require the application's email verification.
- Only email is taken from provider claims for new profiles. Age, identity verification, staff roles, and consent are never inferred from a provider.
- Private Relay addresses from Apple are treated as distinct email addresses. An existing account with a different email is not automatically merged.

## Google setup

1. In Google Cloud, configure the OAuth consent screen for Flingtopia and add test users while the application is in testing.
2. Create an OAuth client of type **Web application**.
3. Add this exact authorized redirect URI:
   `https://flingtopia-staging.onrender.com/api/v1/auth/social/google/callback`
4. Save `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Render Environment Variables. Never use a VITE_ prefix or commit credentials.
5. For a future custom domain, update APP_ORIGIN and register its matching callback before deploying that change.

## Apple setup

1. Configure Sign in with Apple on a primary App ID in your Apple Developer account, then configure a web Services ID associated with that App ID.
2. Register `flingtopia-staging.onrender.com` as a web domain and this exact return URL:
   `https://flingtopia-staging.onrender.com/api/v1/auth/social/apple/callback`
3. Create the Sign in with Apple signing key. The account owner creates/downloads the credential.
4. Save `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` (PKCS#8 PEM) in Render. A value containing literal backslash-n separators is supported.
5. Configure Apple's Private Email Relay allowed sending domain/address for `mail.flingtopia.com` / `notifications@mail.flingtopia.com` before relying on delivery to Hide My Email addresses.

## Database and rollout

1. Back up the staging database using the existing backup procedure.
2. Run `pnpm db:migrate` with the migration-owner connection in `MIGRATION_DATABASE_URL` and the existing verified TLS CA configuration. Do not run migrations with the restricted web login.
3. Migration 004 adds `social_identities` and `social_auth_flows`, their indexes, and restricted server-role permissions when that role exists. It revokes browser-role access. The migration runner records the normalized SQL checksum in `app_migrations`; do not paste only the migration body into SQL Editor without recording the ledger through the approved deployment workflow.
4. If bootstrapping a new Supabase database, apply all migrations and then `scripts/supabase-access.sql`.
5. Push the code, save provider credentials, and deploy. A configured Google provider can ship independently while Apple remains unconfigured.
6. Confirm `/api/v1/config` lists only the configured providers; no credentials are returned.
7. Once testing is authorized, exercise new signup, returning login, existing-account linking with correct/incorrect passwords, cancellation, expired/replayed state, missing browser cookie, suspended account, consent/underage rejection, Apple Private Relay email delivery, and existing password sign-in/recovery. Use separate browsers for session isolation.

Expired flow records are removed on subsequent social sign-in starts. Roll back application code and unset provider credentials if needed; keep the additive schema and migration history intact and use a rollback build compatible with the newer migration ledger.

## Reference documentation

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Apple Sign in with Apple REST API](https://developer.apple.com/documentation/signinwithapplerestapi)
