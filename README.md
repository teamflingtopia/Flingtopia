# Flingtopia

Working first development release of the Flingtopia web application. React frontend, Express API, and PostgreSQL persistence. This is a local development build, not a production launch of the full PRD.

## Run locally

Release 1 scope is approved: discovery, creator profiles, mutual-match text messaging and free events. See [approved requirements and acceptance criteria](docs/RELEASE_1.md) and the [delivery roadmap](docs/ROADMAP.md). Approval defines the target; production implementation remains incomplete.

Requires Node.js 24+ and pnpm 11.19+. In this directory:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5173 and choose **Explore demo**. The API runs on port 4100. Use the exact 127.0.0.1 origin because mutation requests are protected by an origin allowlist.

No Docker or external database is required for local development. PGlite runs PostgreSQL in-process and persists data under `data/postgres`. Restarting preserves accounts, matches, messages, and RSVPs. Local session signing keys are generated once under `data/`; this directory is ignored by Git. Never commit or distribute it.

To use an external PostgreSQL server, copy `.env.example` to `.env` and set `DATABASE_URL`. The API uses `pg` with a connection pool in that mode. Production requires a clean database without sample accounts, HTTPS, SMTP, a strong JWT secret, and `DEMO_MODE=false`.

## Try the implemented flows

M3 adds staff authenticator verification, a six-photo review gallery, shared rate limits, RSVP history and event notices. Admins and moderators can manage events after MFA verification. Account exports and deletion-request intake are enabled; actual account deletion remains disabled pending retention-policy approval. See [M3 status and operator workflow](docs/SAFETY_OPERATIONS_M3.md). Staff demo access now requires authenticator setup; no actual staff accounts were provisioned by this milestone.

M2 adds recovery, saved onboarding, creator opt-in, detail URLs and message history. See [M2 delivery notes and remaining validation](docs/AUTH_NAVIGATION_M2.md). New and existing real accounts complete onboarding after confirming email; demo accounts retain preview access. Without SMTP, recovery emails are written privately under `data/mail-preview`. Production startup is blocked while preview-only consent versions remain configured.

1. Explore the demo as Aarav. Sample people and events are clearly labelled.
2. Like Ananya or Karthik. Their seeded likes create a mutual match; open the conversation and send a message.
3. Visit Experiences. Open a sample event, join the free guest list, and find it under My plans. Cancel the RSVP to release the spot.
4. Edit your profile, interests, city, discovery preference, and visibility. Changes persist.
5. Open another profile to follow a creator, block, or report. Blocking immediately prevents contact in both directions. Unblocking does not restore the match.
6. Create a fictional account to exercise server-side age checking and email verification. Without SMTP, demo mode provides an explicitly local verification action. This is not identity verification.
7. Upload a JPEG, PNG, or WebP on My profile. It remains pending until moderation approval.
8. Sign out and use **Open moderator demo** to review photos and reports. Suspending an account revokes its sessions. Demo shortcuts are disabled outside demo mode.

Demo passwords are randomly generated and not published. The demo shortcut only works when `DEMO_MODE=true`. Sample people are fictional, illustrated with stock photographs loaded from Unsplash. Demo data must not be used for public discovery or real bookings.

## Checks

```sh
pnpm test
pnpm build
```

The integration suite runs against an isolated in-memory PostgreSQL engine and uses real HTTP requests. It covers registration, age enforcement, privilege injection, email verification, authenticated discovery, CSRF origin checks, concurrent matching, message authorization/idempotency, capacity races, moderation permissions, blocking, account suspension, token rotation/reuse, and immediate logout invalidation.

The PostgreSQL pool adapter and Docker configuration still need validation on a hosted staging environment. No claims of a security audit, production load test, or vendor certification are made.

To serve the compiled UI from the Node server locally:

```powershell
pnpm build
$env:APP_ORIGIN='http://127.0.0.1:4100'
pnpm start
```

## Project structure

- `src/`: React screens, API client, responsive styles; fonts bundled locally.
- `src/screens/`: individual application screens; `src/components/ui.tsx`: typed shared UI.
- `shared/`: runtime request validators and API wire types.
- `server/app.mjs`: application composition, authorization and sessions.
- `server/routes/`: domain routes for auth, profiles, discovery/safety, messages, events and moderation.
- `server/database.ts`: typed embedded PostgreSQL / external PostgreSQL adapters; `server/db.mjs` preserves the old import path.
- `server/migrations/`: immutable numbered SQL files; `server/migrations.ts`: transactional migration runner.
- `server/seed.mjs`: local-only sample dataset.
- `tests/`: integration tests with isolated data.
- `docs/DECISIONS.md`: provisional decisions and differences from conflicting source documents.
- `docs/ROADMAP.md`: remaining product and production work.
- `docs/API.md`: implemented API inventory.
- `docs/openapi.json`: generated OpenAPI contract for implemented endpoints.
- `docs/FOUNDATION_M1.md`: foundation delivery, TypeScript coverage and remaining validation.
- `docs/MIGRATIONS.md`: migration, separate deployment credential and recovery instructions.
- `docs/ROUTES.md`: entity/navigation contract for the next milestone.

### Foundation commands

```sh
pnpm typecheck
pnpm api:generate
pnpm db:migrate
```

Stop the local API before running `db:migrate` against its PGlite directory. Development startup normally applies pending migrations itself. Production requires a deployment migration job with `MIGRATION_DATABASE_URL`; API startup only checks history using its runtime `DATABASE_URL`. Review `docs/MIGRATIONS.md` before upgrading existing data. `pnpm build` now includes strict checking of the migrated TypeScript modules; legacy screen/route JavaScript remains incrementally typed.

## Current boundaries

This release has no payments, withdrawable coins, paid sessions, KYC provider, push notifications, password recovery, account deletion/export, live streaming, content feeds, campaigns, business accounts, or communities. Chat updates through polling rather than WebSockets. Profile photos are manually reviewed and stored on local disk; malware/CSAM vendor integrations are not active. Rate limits are per-process and need a shared store before multiple app replicas are used. Staff MFA, immutable database audit permissions, retention jobs, and staff provisioning require further work.

Read `docs/ROADMAP.md` before deploying outside a private development environment. The production guards and container files are a foundation; they do not mean the full product is ready for public use.
