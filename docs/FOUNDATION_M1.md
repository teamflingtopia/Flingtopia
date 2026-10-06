# M1 — code and contract foundation

Implemented on 4 October 2026. This is an incremental TypeScript foundation, not a full TypeScript conversion or production certification.

## Delivered

- Strict TypeScript configuration and `pnpm typecheck`, also run by `pnpm build` and therefore by the existing build CI step.
- Typed React entry point and reusable Avatar/Brand/Spinner/Empty/Modal components; centralized existing hash routing.
- Frontend feature modules under `src/screens/`: App, Auth, Discover, ReportModal, Experiences, Messages, Profile, SettingsView and Moderation. Business behavior and top-level navigation are preserved.
- API domain modules under `server/routes/`: auth, profiles/media, discovery/safety, messages, events and moderation. Shared session/security middleware and application composition remain in `server/app.mjs`.
- Shared runtime Zod input validators in `shared/validation.ts`, consumed by actual backend handlers and the OpenAPI generator. Shared wire types and typed API client cover the existing baseline.
- `docs/openapi.json` describes 34 implemented operations, actual envelopes, cookie auth, Origin requirements, request constraints and errors. `pnpm api:generate` regenerates it from the generator and shared validators.
- Typed PostgreSQL/PGlite adapters and migration runner. Migration 001 preserves the original schema; a separate checksum ledger supports legacy adoption and detects modified applied SQL. Production startup checks history without applying DDL.
- Docker runtime includes shared validation code; production migration job uses a separate connection credential. See MIGRATIONS.md for deployment and recovery.
- ROUTES.md defines M2 entity URLs, authorization/history behavior and the navigation acceptance checklist.

## TypeScript boundary

Strict checking applies to `.ts`/`.tsx` code: shared contracts/validators, API client, routing, entry point, common UI, database adapters, migration runner/CLI and OpenAPI generator. No `@ts-nocheck` suppressions were introduced. Existing screen components and API handlers remain `.jsx`/`.mjs`, with `allowJs: true` and `checkJs: false` for interoperability. Those JavaScript domains have not been fully type-checked; convert them feature-by-feature against the shared contract as M2 work proceeds. A full conversion is still outstanding.

`src/api.js` and `server/db.mjs` are compatibility re-exports for prior import paths. Node 24 executes erasable server TypeScript directly; no tsx loader is required. The frontend is still bundled by Vite.

## Validation evidence and limits

- `pnpm typecheck`: passed.
- `pnpm build`: passed after the module extraction and TypeScript changes.
- OpenAPI generator: produced 34 operations.
- No integration, migration, browser or hosted staging tests were run in this milestone. Existing test files remain available; prior passing results in BUILD_STATUS do not certify this refactor.
- No hosted database, role grants, restore, Docker build, provider integration or public deployment was performed. Local live data was not deliberately reset or replaced; development startup may adopt the additive migration history on restart.

Before calling M1 behavior/data preservation verified, run the existing integration suite, exercise fresh/legacy/drifted/failed/concurrent migrations and confirm existing records survive reopen. Then validate hosted PostgreSQL and migration/runtime grants in staging. These are pending verification tasks, not completed acceptance gates.

## Known contract limitations retained

PATCH /me currently requires the full six-field profile payload. Discovery uses UUID cursor paging, while messages use an exclusive timestamp and can skip equal-timestamp rows at page boundaries. Message UI shows only the latest 100. Follow is a toggle, not an idempotent set. Pass reset has no premium gate. Public detail-by-ID APIs, recovery, onboarding completion, consent versions and role-specific creator messaging are not added by this refactor. The approved R1 mutual-match and free-event rules remain in force.

## Next

M2: implement recovery and resumable onboarding, then stable profile/event/thread routes and core navigation. Use RELEASE_1 AC-01–07 and ROUTES.md. Settle dependent login/assurance/privacy policies before introducing those specific behaviors.
