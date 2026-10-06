# Delivery roadmap

Updated 4 October 2026 following user approval of the recommendations. [RELEASE_1.md](RELEASE_1.md) defines the approved scope, permissions, unresolved launch decisions and AC-01–15 acceptance criteria. The broader prototype remains a future-product reference; all 28 screens are not required for Release 1.

## Working development slice

- React responsive interface: auth, discovery, creator directory, experiences, conversations, profile, settings and moderation.
- Express API and persistent PostgreSQL data with isolated integration tests.
- Email/password signup, server age gate, verification links, secure session lifecycle.
- Discovery, 20 daily likes, mutual matches, creator following, blocks and reports.
- Persistent text conversations, read receipts, authorization and retry protection.
- Free event RSVPs with capacity checks inside database transactions.
- Quarantined profile photo uploads and manual moderation.

## M1 — code and contract foundation (implemented; validation pending)

Implementation update: the incremental foundation is delivered; see [FOUNDATION_M1.md](FOUNDATION_M1.md). Type checking and the frontend build pass. Full screen/handler TypeScript conversion and behavioral/migration validation are still outstanding; M1 is not a production-readiness sign-off.

1. Inventory actual API requests, responses, errors and authorization; publish a versioned OpenAPI contract for Release 1.
2. Introduce TypeScript and shared types; split frontend screens and backend domains into modules without changing business behavior incidentally.
3. Introduce numbered migrations with a baseline for existing local data, a separate migration role for hosted PostgreSQL and a documented recovery procedure.
4. Define stable profile/event/thread URLs, route guards, history behavior and an acceptance checklist tied to AC-01–15.

Exit: a reviewable contract and migration plan; code conversion preserves existing journeys and stored data. Verification is scheduled as part of the implementation milestone, not claimed by this roadmap.

## M2 — complete authentication and core navigation

Implementation update: recovery, resumable onboarding, versioned preview consents, creator opt-in, entity URLs, filter restoration and message history/retry UI are delivered. See [AUTH_NAVIGATION_M2.md](AUTH_NAVIGATION_M2.md). Build/type checking pass; runtime acceptance, migration and provider verification remain pending. Public policy copy is still unresolved.

1. Add password recovery, versioned consents, resumable onboarding and accurate verification states.
2. Retain email/password as the implemented baseline; choose phone/social login requirements before adding providers.
3. Complete profile hub, creator opt-in UI and stable detail/conversation routing, including refresh and Back.
4. Complete discovery/filter behavior and inbox/history/error handling. Text chat stays mutual-match-only for every personal role; follows remain free.

Exit: signup → verified contact → profile → discovery → match → message is complete, including interruption and failure states. Addresses AC-01–07.

## M3 — account safety and usable free events

Implementation update: staff MFA/provisioning tooling, shared database limits, gallery review, audit protection, RSVP history, event operations and notification jobs are implemented. On 4 October 2026, the user approved event management by admins and moderators, plus account exports and deletion-request intake; these permissions are enabled. Retention/irreversible deletion remains disabled pending policy approval. See [SAFETY_OPERATIONS_M3.md](SAFETY_OPERATIONS_M3.md). Build/type checking pass; AC-08–13 runtime acceptance remains unverified.

1. Finish profile/photo visibility rules, galleries and moderation states using approved privacy decisions.
2. Implement export/deletion and retention workflows after the retention policy is agreed.
3. Add staff MFA/provisioning, account-based login throttling, shared rate limits and audit hardening.
4. Add controlled event publishing/cancellation, attendee notification, My plans states and reliable email jobs. Reservations remain free RSVPs.
5. Complete reporting/blocking/unmatching flows and keyboard/mobile accessibility.

Exit: operational workflows and included user journeys satisfy AC-08–13; seed data is no longer required to operate real events.

## M4 — staging and production validation

1. Configure approved hosting, managed PostgreSQL, private media storage, email and durable background jobs.
2. Exercise migrations and provider failure handling in staging; verify backups by restoring them and demonstrate rollback.
3. Establish observability, alerts, support/moderation runbooks and agreed performance targets.
4. Complete release verification, replace demo fixtures and remove demo access from the release environment.

Exit: AC-14–15 and the release gates below have evidence. Public deployment is a separate action.

## Monetization milestone

Deferred beyond Release 1. The user approved deferral, not any specific financial rate or refund window.

Finalize decisions in DECISIONS.md. Implement a balanced financial journal and immutable entries, gateway orders, signed webhook verification, event inbox deduplication, transactional outbox, provider reconciliation, refund and chargeback handling. Keep purchased and creator-earned funds distinguishable. Add booking state machines, dispute freezes, release jobs and payouts with race-condition tests. Integrate provider sandbox first.

## Product expansion

Complete the missing v3.0 sections before implementing the influencer marketplace, business campaigns, communities, referrals and creator services. Add creator posts/subscriptions/PPV, then live streaming with vendor quotas and abuse controls. Create organizer and business account tooling with explicit permissions and reviewed settlement models.

## Production release gates

- Approved Release 1 scope plus resolved launch policies, including user-visible terms, privacy, account retention and moderation appeals. Financial policies are required before a later commercial release.
- Release-required email, media and safety services configured and verified in staging. SMS/KYC integrations are required only if the agreed authentication/assurance policy calls for them; payment providers are outside Release 1.
- Independent security review, accessibility review and measured load tests appropriate to expected traffic.
- Backup restore demonstration, point-in-time recovery, durable queues, upload cleanup, observability, alerts and incident runbooks.
- Regional hosting, CDN and subprocessors checked against the approved data policy.
- Support and moderation staffed for the actual published response promises.
- Replace demo seed data with genuine consented test accounts; disallow all demo login routes and sample profiles.
- Qualified review of applicable data, age and content obligations; commercial obligations are evaluated before monetization is introduced.

The current build is intended for local evaluation. Production environment checks prevent some unsafe configurations but do not replace these release gates.
