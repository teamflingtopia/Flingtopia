# Delivery roadmap

## Requirements revisit — 8 October 2026

Read again from the original Master PRD v3.0 DRAFT DOCX, API Contracts v1.0 PDF, and Database Schema v1.0 PDF. The prototype URL could not be fetched during this pass; its previously captured 28-screen inventory and navigation walk were used as reference evidence, not a claim of a fresh live audit. The database companion describes a 71-screen prototype; that count cannot be reconciled with the captured 28-screen artifact without another source.

The concept is a **creator and social experience platform**: discovery/matching, creator content and audience building, real-world experiences, and later commercial collaboration. Business accounts are separate entities administered by personal accounts. Creator and influencer capabilities are cumulative. A theme match alone does not fulfill the product requirements.

The user requested comprehensive implementation. A scope clarification is pending because the earlier approved Release 1 explicitly deferred commercial and expansion modules. Until clarified, implement shared gaps and preserve the approved decisions; do not silently enable paid transactions or rewrite mutual-match messaging. Document instructions do not authorize external actions.

### Implemented in this pass

| ID | Requirement/source | Local implementation |
| --- | --- | --- |
| NAV-01 | PRD 13.2: global search from main screens | Search entry in authenticated top bar and guest navigation; `#search` with URL query/type |
| NAV-02 | Prototype s21: people, creator, experience results | Separate result sections and category tabs, correct entity IDs, load-more cursors |
| NAV-03 | PRD 13.2: typeahead | Debounced result suggestions after two characters; loading/error/empty/retry states |
| NAV-04 | PRD 13.2: recent searches | Eight local recent searches; explicit clear; cleared on logout/session expiration |
| NAV-05 | Guest navigation | Guest Creators route filters creator/influencer accounts; guest event search filters real results |
| NAV-06 | Direct links and Back | Search/guest detail links carry origin; Back supports search and conversation origins; guest query survives detail navigation |
| NAV-07 | Unknown/private guest routes | Clear unavailable/account-required page instead of silently showing People |
| DISC-01 | PRD 7.3: gender filter | Server-enforced filter within existing mutual preferences |
| DISC-02 | PRD 7.3: interest filter | Exact case-insensitive interest tag filter |
| DISC-03 | PRD 7.3: has photos | Requires a genuinely approved profile photo |
| DISC-04 | Creator follow navigation | Following tab, retaining blocks/visibility; can find followed creators after liking them |
| DISC-05 | Location filter | Arbitrary city entry rather than a fixed list of six cities |
| PROFILE-01 | PRD 6.1: username | Editable unique handle with server validation and conflict response |
| PROFILE-02 | PRD 6.1: custom gender | Optional description for accounts with custom gender |
| PROFILE-03 | PRD 6.1: looking for | Casual/friendship/networking/dating goals stored separately from gender preference |
| PROFILE-04 | PRD 6.1: languages | Up to ten languages, persisted and visible on member profile |
| PROFILE-05 | PRD 6.1: social links | Instagram/X/TikTok HTTPS links validated by platform; no ownership-verification claim |
| PROFILE-06 | Account export | Newly stored profile fields included in own export |
| CHAT-01 | Prototype s23: inbox search | Name/handle/latest-message filter and unread-only filter |
| CHAT-02 | PRD 8.3: chat search | Server-side text search over conversation history, cursor pagination, existing match authorization |
| DATA-01 | Schema evolution | Migration 006 adds profile fields; existing applied migrations untouched |
| API-01 | Companion contract traceability | OpenAPI generator includes profile detail writes, global search, discovery filters, and message search |

All entries above mean **implemented locally**, not runtime-tested or deployed. Type checking and frontend compilation succeeded in this pass. Automated tests, browser journey checks, hosted migrations, and provider checks have not been run for these changes. Migration 005 from the preceding social-sign-in change and migration 006 are required before deploying this branch to a database currently at 004.

### Remaining feature inventory

`Existing` means code exists, not production acceptance. `Partial` means part of a requirement remains. `Deferred` follows the earlier release decision. `Dependency` needs missing product rules, provider setup, or operational ownership. This inventory is not a production sign-off.

| Source | Key functionality | State and remaining work |
| --- | --- | --- |
| PRD 5.1 | Email/password registration and recovery | Existing; email-link verification differs from original email OTP |
| PRD 5.1 | Phone OTP registration, resend, expiration, throttling | Dependency: SMS provider and primary channel decision |
| PRD 5.1 | Google sign-in | Existing baseline deployed; immediate account/session change pending migration 005/deploy |
| PRD 5.1 | Apple sign-in | Backend/UI support exists; developer account credentials and live integration pending |
| API auth | Facebook sign-in | Not implemented; not selected in approved channels |
| PRD 5.2 | Resumable profile/consent onboarding | Existing; age/profile completion enforced before interactions |
| PRD 5.2 | Required first photo, account-type prompt, notification permission | Partial: gallery and creator opt-in exist separately; no mandatory photo or web-push permission step |
| PRD 5.3 | Password hashing, cookie sessions, refresh rotation, throttling | Existing; authentication acceptance/security review pending |
| PRD 6.1 | Profile editing, six-photo gallery, review states | Existing; photo reordering and minimum-photo policy remain |
| PRD 6.2 | Everyone/matches-only/nobody profile visibility | Partial: boolean visibility exists; richer visibility matrix not implemented |
| PRD 6.2 | Who can message me | Approved mutual-match rule implemented; nobody override not implemented |
| PRD 6.2 | Online/last seen controls | Not implemented; presence tracking must respect privacy |
| PRD 6.2 | Exact/approximate/hidden distance | Not implemented; only manual city collected |
| PRD 6.2,12 | Incognito and premium entitlement | Deferred with memberships |
| PRD 6.3 | Creator category and separate creator bio | Not implemented; admin taxonomy and creator profile extension required |
| PRD 6.3 | Promo video and pinned portfolio | Deferred with content publishing/media pipeline |
| PRD 7.1–7.2 | Discovery cards, likes, passes, mutual matches | Existing; recommendation ranking remains basic UUID ordering |
| PRD 7.2 | Mutual age preferences | Partial: viewer range supported; saved candidate range not implemented |
| PRD 7.3 | Distance/online/verified filters | Not implemented; presence/location and paid-entitlement decisions needed |
| PRD 7.4 | Super-like, paid boost, premium undo | Deferred; existing reset-passes endpoint is not premium undo |
| PRD 8.1 | Matched text messages, blocking/unmatching | Existing; same rule for all personal roles |
| PRD 8.1/API 9 | Subscriber/intro/paid-conversation messaging | Conflicting sources; deferred under approved mutual-match-only rule |
| PRD 8.2 | Image/video/voice-note messaging | Deferred from text-only R1; private media authorization/scanning required |
| PRD 8.3 | Read receipts and history pagination | Existing; no separate delivered acknowledgment |
| PRD 8.3 | Emoji reactions and replies | Not implemented |
| PRD 8.3 | Delete for me/everyone within one hour | Not implemented; retention/deletion rules unresolved |
| PRD 8.3 | Typing indicators and realtime messages | Not implemented; current chat polls |
| PRD 8.3 | Conversation media gallery | Depends on media messaging |
| PRD 8.4 | Report individual message/evidence | Partial: user reports exist; message-specific evidence capture missing |
| PRD 8.4 | Keyword/AI media moderation | Not implemented; provider and handling policy required |
| PRD 9.1/29 | Creator self-upgrade | Existing additive opt-in; v3/approved decision wins over older approval requirement |
| PRD 9.2/API 8 | Creator drafts, publishing, scheduling, feed | Deferred; private media pipeline and moderation needed |
| PRD 9.3 | Creator subscriptions/tier entitlement/renewal | Deferred; payment/billing rules required |
| PRD 9.4 | Gifts/tipping/catalogue | Deferred; ledger and provider integration required |
| PRD 9.5 | Creator payouts/KYC/thresholds/tax | Dependency: commercial rules, vendor configuration and reviewed accounting policy |
| PRD 9.6 | Creator analytics | Deferred; genuine content/payment events must exist first |
| PRD 10/API 4/schema 3 | Coin packs, wallet, append-only ledger | Deferred; source catalogues and conversion rates conflict |
| PRD 10 | Gateway orders, signed webhooks, idempotency | Not implemented; must precede real-money features |
| PRD 10/17 | Refunds, chargebacks, reconciliation | Dependency: consistent approved policies and provider integration |
| PRD 11 | Free event browse/detail/RSVP/My plans/cancel | Existing with transactional capacity handling |
| PRD 11 | Staff event draft/publish/cancel | Existing; admins and moderators approved |
| PRD 11 | Paid tiers, checkout, QR tickets/check-in | Deferred from free RSVPs |
| PRD 11.6/API 5 | Creator request/accept/check-in/complete | Deferred; booking state machine conflicts with PRD immediate-pay/calendar model |
| API 5/schema 5 | Locked earnings, completion+24h release | Not implemented; requires balanced ledger and approved booking/refund model |
| API 6/schema 5 | Disputes and release freeze | Not implemented; inseparable from escrow and admin financial resolution |
| API 7 | Voice/video session tokens and call windows | Deferred; provider and booking lifecycle required |
| PRD 12/schema 9 | Membership plans and entitlements | Deferred; duration plans conflict with silver/gold/platinum and coin grants |
| PRD 13.1 | Event cancellation in-app/email notices | Existing durable delivery jobs |
| PRD 13.1 | Match/message/like/role/moderation notices | Partial/not complete; event-only notifications are not a full notification center |
| PRD 13.1 | Web push and notification preferences | Not implemented; push subscription management required |
| PRD 13.2 | Trending searches | Not implemented; no curated data/admin workflow |
| PRD 14 | Staff MFA/report/photo/suspension operations | Existing; independent acceptance still needed |
| PRD 14 | Finance/support/event-manager role separation | Partial: moderator/admin only; extend explicit capability model |
| PRD 14 | Dashboards, feature flags and business settings | Partial: no complete admin configuration UI or financial analytics |
| PRD 15/schema 2 | ID verification, liveness, face matching | Dependency: vendor, evidence storage/retention and review process; never inferred from email/photo review |
| PRD 15/18 | Automated image/CSAM moderation | Dependency: qualified provider integration and response ownership |
| PRD 18 | Strikes, appeals, independent reviewer | Not implemented; operational policy/ownership required |
| PRD 19 | Per-operation limits and standard retry details | Partial: shared limits exist; full PRD matrix and premium overrides missing |
| PRD 20 | English/Hindi i18n | Not implemented; UI/email text not fully externalized |
| PRD 20 | Grievance officer, terms/privacy, transparency reports | Dependency: approved public policy and named operations owners |
| PRD 20/25 | India-localized data and backups | Current US staging does not satisfy original India-only direction; explicit production-region decision needed |
| PRD 21 | Support/dispute case management | Not implemented beyond user reports and deletion-request intake |
| PRD 22 | Recommendations, spam/duplicate detection | Not implemented as specified; no AI model/service claims |
| PRD 23 | REST schemas and stable IDs | Existing chosen UUID/cookie architecture; original contracts differ |
| PRD 23 | WebSocket event delivery | Not implemented |
| PRD 24/API 10 | Live discovery, scheduling, streaming, gifts | Deferred; no streaming vendor or financial entitlement backend |
| PRD 25 | Hosting/email/private storage | Render/Supabase/Resend staging configured; deployment does not equal production readiness |
| PRD 25/26 | Backup restore, alerts, load/security/accessibility acceptance | Outstanding evidence; not performed by this change |
| PRD 28 | Separate business profile and single administrator | Deferred/not implemented; single administrator constraint is specified |
| PRD 28 | Verification/suspension/admin reassignment | Not implemented; private document/reviewer controls required |
| PRD 28 | Campaigns/bookings/invoices/payments/reviews | Dependency: transactions plus missing campaign/service specifications |
| PRD 29 | Influencer application/approval/rejection/revocation | Not implemented; genuine ID verification required before applying |
| PRD 29 | Role notifications/metrics/audit vocabulary | Partial: creator audit exists; influencer/business workflows absent |
| PRD pending sections | Marketplace 30, campaigns 31, communities 32, referrals 33 | Not drafted in supplied v3 document; specifications must be completed |
| Approved account decision | Export and deletion-request intake | Existing; actual erasure remains disabled until retention rules approved |

### Prototype navigation mapping

| Captured screens | Current route or dependency |
| --- | --- |
| s01 landing, s10 welcome | `#discover` provides public exploration; full promotional landing remains separate work |
| s02 people | `#discover`, plus `#creators` and Following tab |
| s03 person | `#people/:id`; commercial pricing/subscriptions deferred |
| s04 experience | `#events/:id` for free events; creator service detail not implemented |
| s05/s24 conversation | `#messages/:id`; text/mutual-match subset with search |
| s06 feed | Creator publishing/feed deferred |
| s07 coins | Wallet deferred |
| s08/s08c profile | `#profile`; creator earnings/content hub deferred |
| s09 studio | Deferred |
| s10b/s10c mobile login/OTP | `#signin`; phone OTP not implemented |
| s11/s13/s14/s15/s16 onboarding | `#signup`, `#onboarding`; Google immediate sign-in precedes profile completion |
| s12 desktop login | `#signin`, `#forgot-password`, `#reset-password` |
| s17 marketplace | `#experiences` implements free event catalogue; creator services pending |
| s18/s19 | Unreachable in recorded prototype walk; do not invent their routes/behavior |
| s20 Live | Deferred |
| s21 search | `#search` implemented in this pass |
| s22 filters | People/Creators filter panel; location radius/paid filters pending |
| s23 inbox | `#messages`; search/unread filtering implemented in this pass |
| s25 membership | Deferred |

### Decisions that prevent full specification parity

1. Confirm whether the earlier release deferrals are superseded by this request.
2. Choose one coin catalogue, conversion/accounting model, and purchased/earned/locked/withdrawable rules.
3. Choose request-time versus acceptance-time payment, availability model, late cancellation/refunds and dispute deadlines. The sources contradict one another.
4. Keep the approved mutual-match messaging rule unless explicitly changed; subscription/paid-intro exceptions are not interchangeable.
5. Select identity, SMS, payment, streaming and push providers as their integrations become concrete; no fixture can stand in for those services.
6. Supply/approve the missing marketplace, campaign, community and referral workflows before claiming full v3 implementation.
7. Resolve launch policy, retention, moderation ownership, language and region requirements before production sign-off.

The earlier dated roadmap below is retained as historical milestone context. Its deployment and gap statements are not the current live-status record.

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
