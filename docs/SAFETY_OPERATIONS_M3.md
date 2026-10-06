# M3 — safety and free-event operations

Implementation update: 4 October 2026. Engineering and the two approved operational permissions are implemented. Runtime acceptance is not verified. This is not a production sign-off.

## Approved product choices — 4 October 2026

The user resolved the two operational choices from ROADMAP.md and RELEASE_1.md:

1. Admins and moderators may create, publish and cancel free events. Both retain report/photo review access; personal accounts RSVP only. Staff MFA remains required.
2. Enable private account exports and deletion-request intake. Irreversible erasure and retention schedules remain disabled until separately approved.

`server/index.mjs` supplies `eventPublisherRoles: ["admin", "moderator"]` and `accountRequests: true`. Publishing and account-request routes/UI are enabled subject to their authorization and reauthentication checks. Enabling request intake does not enable deletion; there is no destructive account-erasure endpoint or scheduled purge. No staff roles were assigned and no events were published by this configuration change.

## Delivered engineering

### Staff security and audit (AC-12)

- Explicit staff role plus recent authenticator verification required for all moderation/event operations. A staff session without MFA can enroll or verify, but cannot read review queues or perform staff actions.
- TOTP: random per-account secret, encrypted at rest; six digits, 30-second period, one adjacent time step allowed, replay counter recorded atomically. Enrollment expires after ten minutes. A successful code grants a 15-minute authorization tied to the current refresh-session family. Password resets do not remove the enrolled factor.
- Real staff enrollment requires current-password confirmation. Fictional local demo enrollment alone skips that confirmation; it still requires an authenticator code to access staff tools. Production prohibits demo mode.
- `MFA_ENCRYPTION_KEY` is independent from JWT_SECRET in production. Do not rotate it without a controlled re-encryption or staff re-enrollment plan. Development falls back to its existing local secret.
- Operator-only CLI provisions/revokes roles or resets MFA, records operator/reason and revokes existing sessions. No new staff account or role grant was executed during this milestone.
- Database-backed rate limits shared by app instances: API 180/minute per IP; authentication entry 10/15 minutes per IP; login 10/15 minutes per normalized email; MFA 6/5 minutes per account; photo uploads 6/15 minutes per account; account requests 5/15 minutes per account. Keys are HMACs, not raw email/IP strings. Counters use atomic upserts and expire on database time. These limits count attempts, including successful ones; production thresholds require traffic validation.
- Database triggers reject audit UPDATE, DELETE and TRUNCATE. Grant runtime audit SELECT/INSERT only. This is append-only enforcement for the runtime, not a claim of tamper-proof storage against a database owner who can remove triggers. External audit archival and security review remain staging work.

Implementation references: [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) and [RFC 4226](https://www.rfc-editor.org/rfc/rfc4226). The algorithm implementation and enrollment lifecycle still need independent review and vector/integration verification; none was run this turn.

### Photos and visibility (AC-08)

- Up to six pending/approved gallery photos. JPEG/PNG/WebP decoded and normalized to bounded JPEG; originals are not served. Uploads remain local disk storage pending M4 private object storage/scanning.
- Each upload has its own UUID and pending/approved/rejected/removed state. Reviews apply to the exact photo, with a required reason visible to its owner. An old queue cannot accidentally approve a later replacement.
- Existing local avatar/pending files are represented in the new gallery table by migration 003. External illustrative fixture images remain fixture URLs; no external photos are downloaded.
- Owner sees their pending/rejected photos. Staff must have recent MFA to view private review media. Other signed-in eligible members see only approved photos under the existing visible/active/contact-confirmed/completed-owner and block rules. No guest photo/profile access was introduced.
- Approving a first photo makes it primary only if no avatar exists. Owners can select another approved primary or remove a photo. Removal immediately revokes media access and clears pointers; local file unlink follows commit. Failed cleanup is logged and needs operator attention. Rejected photos are retained privately until owner removal or a future approved retention workflow.
- The legacy `/admin/photos/:userId` mutation returns 409 REVIEW_CHANGED. Use `/admin/photo-reviews/:photoId`; queue `id` now identifies a photo, with `user_id` separately supplied. `/me/photo` remains an upload alias for older clients. This internal contract transition is recorded in OpenAPI.

### Free events and plans (AC-09–10)

- Gated publisher UI/API supports private drafts, draft edits, validation, publishing and cancellation. Revision checks prevent stale edits/actions. Free-only; members cannot inject a price or publisher role.
- Published details are frozen. Changes require cancellation with a reason and a replacement draft rather than silent attendee-facing edits. Event start is stored as an absolute instant, with an IANA display zone. Staff input is explicitly UTC to avoid ambiguous conversions.
- Drafts are excluded from all member event endpoints. My plans retains active, personally cancelled, organizer-cancelled and past reservations. Existing pre-M3 cancellations were deleted by the old implementation and cannot be reconstructed.
- RSVP, RSVP cancellation and organizer cancellation lock the event row. Active counts exclude cancelled RSVPs; repeated cancellation releases a place once. Rejoining reactivates the existing reservation when still eligible and capacity permits.
- Organizer cancellation writes event state, unique per-attendee in-app notices and durable email jobs in one transaction. Repeating cancellation cannot produce a second notice. In-app notices stay available even when email delivery fails.
- Leased email jobs retry up to five times; exhausted jobs are visible to enabled publishers and can be explicitly retried with an audit entry. SMTP acceptance is not proof of inbox delivery or reading. Delivery is at least once, so a crash after sending but before recording can cause duplicate email. Local demo without SMTP writes private `data/mail-preview/event-<job-id>.txt` previews.
- Worker currently processes one job per five-second tick per API instance. Production throughput, backlogs, alerts and a separately supervised worker depend on M4 targets; no notification SLA is claimed.

### Account data and reporting (AC-11, policy dependent)

- Gated account JSON export requires current password and records an audit entry. It contains own profile, consents, photo metadata, sent messages, reservations, likes/follows/blocks and submitted reports. It excludes passwords/tokens/MFA material, received messages and staff-only decisions. Image bytes are not bundled. It is an engineering export format, not a claim of a complete jurisdiction-specific portability response. Very large exports need a bounded asynchronous job pipeline before launch.
- Gated deletion intake requires current password, deduplicates an outstanding request and exposes its status and withdrawal. Status is explicitly `awaiting_policy`; the account is neither erased nor deactivated and there is no invented processing deadline. Existing profile hiding remains available.
- Members can view their report statuses and choose to block with a report. Blocking closes the match and removes both directions of previous likes/follows; unblocking does not restore them. Follow toggles now serialize with pair locks used by blocking/matching.
- Staff may suspend a reported non-staff account and revoke sessions; staff account recovery/provisioning uses the separate operator workflow. Appeals, reinstatement authority, retention and support ownership remain product/operations decisions.

### Accessibility (AC-13)

- Added skip-to-content and visible focus styles. Closed mobile navigation is inert; open mobile navigation traps keyboard focus, supports Escape, and makes background content inert.
- Disabled form controls are excluded from dialog tab traversal; dialogs restore the prior body scroll state. Loading/error/retry and notification read controls are exposed in new screens.
- These are implementation changes, not an accessibility certification. Keyboard, screen reader and mobile walkthroughs remain required.

## Operator workflow

Apply migration 003 via the established migration job; development startup also applies it. Back up first. Never open a second PGlite process against the same data directory. Migration includes table changes, gallery backfill, RSVP history fields and audit protection triggers. Rollback requires a compatible application/database pair or reviewed forward migration; do not edit applied checksums.

Provision an existing, active, email-confirmed account using a trusted terminal. Stop the API first if using the local PGlite directory. Example commands from the project folder (examples only, not executed):

```sh
node scripts/staff.mjs person@example.com moderator operator-name "Approved moderator onboarding"
node scripts/staff.mjs person@example.com admin operator-name "Approved event administrator"
node scripts/staff.mjs person@example.com reset-mfa operator-name "Identity checked through approved recovery process"
node scripts/staff.mjs person@example.com none operator-name "Staff access removal approved"
```

Production CLI requires operator-only STAFF_DATABASE_URL. Never inject that credential into the web runtime. Provisioning does not complete member onboarding or approve consent on someone's behalf. Users sign in again and enroll an authenticator. The identity-check process for MFA recovery must be defined by operations; the command is not proof that identity was checked.

Runtime grants: new operational tables need the applicable SELECT/INSERT/UPDATE/DELETE rights. Keep audit SELECT/INSERT only and migration history SELECT only; schema ownership/DDL stays with the migration role. Review STAFF_DATABASE_URL privileges separately. Proxy deployments must explicitly establish a trusted-client-IP configuration; the current server does not trust arbitrary forwarded headers, and proxy-address aggregation can throttle legitimate traffic.

## Evidence and remaining gates

- Frontend production build and configured TypeScript checks pass. OpenAPI generation documents 63 operations.
- No tests were added or run. Migrations, TOTP vectors, actual email delivery, cross-instance counters, concurrency, retention behavior and browser journeys have not been exercised for M3. Historical pre-M1/M2 tests are not evidence for these changes. Existing fixtures need onboarding/consents/MFA updates when test work is authorized.
- JSX screens and many server modules remain JavaScript. Compilation does not establish SQL correctness or backend behavior.
- The two operational choices are approved and enabled. Separately finalize actual retention/erasure rules, public policy copy, staff recovery/support/appeals, permitted content and deployment services. Production remains blocked by preview-only consent versions.
- Finish M1–M3 acceptance verification, then M4 staging: managed PostgreSQL, private media, worker supervision, SMTP, observability, backups/restore, migration rehearsal, accessibility/security/load review. No public deployment was performed.
