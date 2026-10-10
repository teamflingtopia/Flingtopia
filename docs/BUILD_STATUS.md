# Build status

## October 10, 2026 temporary public browsing

At the user's request, authentication is disabled by default. `APP_AUTH_ENABLED=true` explicitly restores it; unset/false uses public browsing. All visitors, including browsers with old sessions, see Explore without login/signup/onboarding. Google/Apple callback links redirect to Explore. Login, registration, recovery, refresh and verification writes return AUTH_DISABLED; logout remains available. Authenticated API/media/staff operations are unavailable while disabled, rather than exposing private accounts to anonymous visitors. Public people/creator/event previews and search remain available.

Build and TypeScript compilation passed; behavioral tests were not run. This is a local change pending push/deployment. The previous migrations 005 and 006 are still prerequisites for deploying the current branch. Existing Google provider configuration can remain saved for later re-enabling. No hosted setting was changed in this turn.

## October 8, 2026 requirements revisit

Re-read all three supplied specifications and compared them to the code and saved prototype navigation evidence. See the current requirements inventory at the top of ROADMAP.md.

Added global search, guest creator/event search, improved Back/guarded routes, discovery gender/interest/approved-photo filters and Following tab, extended profile details, inbox/unread filtering, and server-side conversation search. API contracts updated. `pnpm build` passed (TypeScript and Vite). This does not establish behavioral, security, browser or migration acceptance; no tests were run for this change.

The previous social sign-in fix is committed as ebf4d81. These local changes require migrations 005 and 006 on the staging database currently recorded at 004, followed by application deployment. No hosted database or deployment was changed in this pass.

Staging exists on Render with Supabase and Resend; Google sign-in is configured and the user has confirmed email delivery. The older status entries below describe earlier checkpoints and must not be read as current infrastructure status. The application is not yet a complete implementation of the full PRD or a production-readiness sign-off.

## October 5, 2026 staging preparation

Render Free + Supabase + Resend deployment configuration is prepared in render.yaml and FREE_STAGING.md. Private photo storage and HTTPS email adapters are implemented. Password-protected hosted staging retains secure-cookie settings and disables demo access. Type checking and frontend build passed after these changes. Live provider integration and deployment remain pending; earlier 29-test validation results predate these adapters.

The existing Supabase project was restored and contains older bookings/experiences/profiles tables. Its data was not migrated or changed. A separate free staging project is required. Source is staged locally for the first Git commit; the owner must provide the commit identity. No push or public app deployment has occurred.

Development milestone completed on October 4, 2026.

Requirements update, October 4, 2026: the user approved the narrower Release 1 scope in RELEASE_1.md.

M1 implementation update: modular frontend/API domains, incremental strict TypeScript, shared validators, OpenAPI and versioned migrations are now implemented. Type checking and frontend build pass. Full TypeScript conversion and runtime/integration/migration/staging validation remain pending. The historical checks below predate this refactor and must not be read as new test results. See FOUNDATION_M1.md.

M2 implementation update: recovery and queued mail, resumable onboarding and consent versions, creator opt-in, stable entity routes, message history and retry handling are implemented. Build/type checking pass; OpenAPI documents 41 operations. No M2 tests or runtime/provider/migration verification were run. See AUTH_NAVIGATION_M2.md. Preview consent versions now block production startup until approved policies replace them.

## Historical verification — before M1/M2

M3 update: safety/event engineering is implemented. The owner approved event management by admins and moderators and enabled account exports/deletion-request intake on 4 October 2026; actual deletion remains disabled. Migration 003 and 63-operation API contract are prepared. Build/type checks passed during M3 implementation; tests, migration execution, MFA/SMTP and browser validation were not run. See SAFETY_OPERATIONS_M3.md. The historical results below do not cover M3.

- 19 integration tests passed against isolated PGlite PostgreSQL databases.
- Persistent database closed and reopened with its data intact.
- Production frontend bundle built successfully with Vite.
- Production dependency audit: zero known vulnerabilities reported after updating Sharp and Nodemailer. This is a package advisory check, not a security audit.
- Browser: demo login, discovery, liking into a mutual match, sending a message, message persistence after reload, and free event RSVP visible under My plans.
- Responsive views inspected at desktop and 390-pixel phone width; phone document width matched viewport width.
- Browser console showed no warnings or errors in the inspected preview session.
- The user-facing preview remains running at http://127.0.0.1:5173 while the local development processes remain alive.

## Not yet verified or implemented

Hosted PostgreSQL adapter, Docker build, deployment pipeline execution, SMTP delivery against a real provider, and production traffic performance have not been validated in a staging environment. Source control has been initialized locally; no remote repository, commit, public hosting, or vendor account has been created.

Payment processing, withdrawable coins, KYC, live streaming, subscriptions, paid creator services, business campaigns, and communities are not part of this first working slice. See ROADMAP.md and DECISIONS.md for remaining requirements and decisions.
