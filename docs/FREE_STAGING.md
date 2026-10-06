# Free Render + Supabase staging

Prepared October 5, 2026. Not deployed or provider-validated yet.

## Resources

- GitHub destination: https://github.com/teamflingtopia/Flingtopia. Initial commit 4105fab was pushed by the owner; its Application checks workflow passed.
- Existing Supabase project gixwbtmztyuwwrcfzvgs, Oregon was resumed. Read-only schema inventory found bookings, experiences and profiles from an earlier build. Do not apply this app's migrations there.
- The owner created a separate free flingtopia-staging project: mavgjctanxwthfsytohg, West US (Oregon). Project URL: https://mavgjctanxwthfsytohg.supabase.co. Database credentials remain with the owner. Migrations 001–003 were applied through the authenticated SQL editor after confirming an empty public schema and disabled Data API. The bootstrap transaction recorded SHA256 checksums from the unchanged migration files, revoked anon/authenticated table grants, and enabled RLS. Runtime role and credentials remain pending.
- Render: one Free Docker web service, Oregon, name flingtopia-staging. The web server serves React and the API on the same origin.
- Resend: HTTPS email API, verified sender domain. No SMTP on the standard blocked ports.
- Storage: private bucket flingtopia-photos-staging was created in the NEW staging project; JPEG only, 5 MB per file. Do not configure the app against the old project's key. No browser read/write policies for this bucket; the backend mediates access.

## Deployment sequence

1. Review the source manifest, exclude local data, environment files and screenshots, and commit with the owner's chosen Git identity. Push to the supplied repository.
2. Inspect the existing Supabase public schema. If it contains unrelated/conflicting tables, use a separate free staging project instead of overwriting data.
3. Obtain the session-pooler connection string from Supabase Connect. Use TLS with certificate validation. Install the supplied CA through NODE_EXTRA_CA_CERTS if necessary; never disable validation.
4. Initial migrations are applied (see Resources). For subsequent releases apply migrations from a trusted machine using MIGRATION_DATABASE_URL, NODE_ENV=production, DATABASE_SSL=true and `node server/migrate.ts`. Do not rerun the fresh-schema bootstrap. Do not run migrations from the public web server or expose an HTTP migration endpoint. Free Render has no pre-deploy job/shell to use for this purpose.
5. Review and apply scripts/supabase-access.sql as the migration owner. Create a dedicated database login belonging only to flingtopia_runtime using the provider's credential workflow. Keep the migration-owner credential out of Render. Review default grants and Data API exposure before introducing application records.
6. Create the private photo bucket. Keep its service-role credential only in Render environment variables. The startup bucket check rejects a public bucket. Preserve app-level access checks even though the server's storage credential bypasses storage RLS.
7. Configure the variables in render.yaml. APP_ORIGIN must exactly match the HTTPS Render URL or custom domain. Independently generate JWT_SECRET and MFA_ENCRYPTION_KEY (32+ characters), and STAGING_ACCESS_PASSWORD (24+ characters). Staging Basic Auth username is `staging`. Share this password only with invited testers.
8. The owner deferred DNS and email setup. Set STAGING_DISABLE_EMAIL=true for this staging deployment (included in render.yaml). Verification delivery and password recovery are unavailable; no tokens are created for new verification/recovery requests. Cancellation still creates in-app notifications but does not enqueue new email jobs. Existing queued jobs remain paused. Accounts stay unverified and cannot complete onboarding or use verified-only actions; there is no verification bypass. A notice appears on every screen. To restore email, configure RESEND_API_KEY and MAIL_FROM, set STAGING_DISABLE_EMAIL=false, and redeploy. Users can then request verification again. Public production refuses this flag.
9. Check the Render proxy chain and set TRUST_PROXY_HOPS=1 only for the documented single trusted proxy path. Otherwise IP limits see the proxy as one client. Verify spoofed forwarding headers cannot bypass limits before testing with multiple people.
10. Create the Free service using Docker and health path /api/v1/health. Keep automatic deployment off initially. Verify the selected plan is $0 before submitting.
11. Check live health, Basic Auth protection, signup/verification, MFA, photo permissions, email retries, event RSVP/cancellation, and persistence across redeployment. Run database and object restore exercises separately.

## Staging security and runtime behavior

NODE_ENV stays production, so secure cookies and production HTTP settings remain active. APP_ENV=staging allows preview consent text only when a strong staging access password is configured. Demo logins and seed accounts remain forbidden. Every path except the GET health probe requires HTTP Basic Auth; the application still requires its own account login. Responses are marked noindex/no-store.

Background queues remain durable in PostgreSQL; workers run in the web process. When Render sleeps, workers stop. A later incoming request wakes the process and queued work resumes. Reset links can expire while it sleeps. This is a functional testing environment, not a reliable always-on notification service.

Photo paths stay /media/<uuid>.jpg. The server reads private objects only after checking ownership, staff MFA, moderation state, profile visibility and blocking. Existing local photos are NOT automatically migrated. Failed storage deletion is logged as photo_cleanup_failed; operator cleanup and orphan reconciliation remain necessary before production.

Resend delivery uses stable queue-job idempotency keys. Provider errors never log API response bodies or credentials. Verification email failure leaves the account recoverable through resend verification.

## Cost and release limitations

Use Free compute, no paid worker, no persistent Render disk, no paid Supabase add-ons. Monitor provider quotas and avoid enabling overage billing. Database and photo backup policies remain separate. The current Supabase Free database does not provide the production backup guarantees we need.

Before production: approve policies, remove APP_ENV=staging, provision reliable compute/queue processing and backups, validate migrations and security on hosted PostgreSQL, and complete remaining release gates in ROADMAP.md.

## Evidence

The new adapters and staging configuration pass the TypeScript/frontend build. They have not yet been exercised against live Supabase Storage or Resend. The earlier 29 passing tests predate these adapter changes; they are not proof of provider integration. No additional tests were run for this preparation step.
