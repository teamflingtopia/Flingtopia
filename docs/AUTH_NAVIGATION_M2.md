# M2 — authentication and core navigation

Implementation delivered 4 October 2026. This is a development milestone, not production or acceptance-test sign-off.

## Implemented

### Recovery (AC-02)

- Forgot-password and reset-password screens, with matching API endpoints and shared request validation.
- Generic request response for eligible, unknown and suspended accounts. No recovery token or account-specific delivery result is returned to the browser.
- Random 256-bit tokens; SHA-256 token hashes in the token table; 30-minute expiry; one-time consumption under a user-row lock. Successful reset consumes all outstanding reset tokens and revokes all session families. Existing access cookies fail subsequent authorization. Email verification is unchanged and sign-in is required again.
- Login and refresh serialize against password resets so an old credential/refresh operation cannot issue a session after reset wins the lock.
- IP entry throttling plus one recovery mail per account per five minutes. Shared/distributed rate limiting and broader account login throttling remain M3.
- Durable recovery-email queue with encrypted payloads, leases, bounded SMTP connection/socket timeouts and up to five attempts. Payloads are erased on successful delivery, expiry, exhaustion or password reset. Delivery is at least once; a worker crash after SMTP acceptance can cause duplicate email, but not duplicate password resets. The worker runs with the API and polls every five seconds; a separate monitored worker deployment remains M4.

### Onboarding and consent (AC-01, AC-03)

- Profile → preferences → review steps. Partial draft fields and current step are saved to the account after a short debounce, with explicit save/retry status. Incomplete name/city may be saved in drafts; completion validates all required profile fields.
- Returning accounts resume from server drafts. Unsaved edits trigger a browser close/reload warning. Sign-out explicitly saves first. Demo fixtures bypass onboarding; existing real accounts must confirm their profile on their next sign-in.
- Confirmed email is required for completion. Completion saves the profile, consent version, audit entry and timestamp in one transaction. Uncompleted real profiles are excluded from discovery/detail access; discovery, event reads and conversation reads require verified contact and completed onboarding.
- Shared development policy copy/version is used by registration, completion and creator opt-in. Consent rows record purpose, version and acceptance time. No historical consent or completion timestamp is invented for existing accounts.
- Email confirmation, self-declared adult eligibility and unavailable identity verification have distinct labels. DOB remains a declaration; no identity/age provider has been added.

### Profile and creator mode (AC-04)

- Existing profile hub now includes creator opt-in, explicit preview consent and versioned server records. Opt-in preserves the user ID and existing member capabilities; cannot assign staff/influencer roles.
- Profile editor retains unsaved changes in the current browser tab, scoped to the user, with save/discard UI and close/reload warning. Saved profiles and onboarding drafts remain server-side; ordinary unsaved editor drafts are not cross-device.
- Settings links to password recovery. Session expiration returns the user to authentication while retaining the local destination.

### Navigation and messaging (AC-05–07)

- `#people/:id`, `#events/:id`, `#messages/:id` load authorized entities by UUID after direct link/refresh. Invalid/unavailable/revoked entities show explicit error/retry states. Staff deep links show access denied for members; backend role guards remain authoritative.
- Person detail supports like/match, free follow, report and block. Event detail exposes RSVP and unavailable/cancelled/expired states; no paid booking UI.
- List query filters use the URL. Detail Back uses browser history for app-created entries and a validated list fallback for direct links. Discovery restores its requested page count (up to 25 pages), scroll and card focus where still available. Deleted/liked/hidden results can legitimately change the returned list.
- Inbox never automatically selects the first conversation. Mobile inbox/thread destinations are separate. Thread loading and inbox failures are explicit.
- Earlier-message pagination uses a microsecond timestamp plus UUID tie-breaker; fetched older pages remain visible during polling. Accepted messages are merged by server ID.
- Sending/failed/accepted states are shown. Unconfirmed sends keep the same client UUID/body in tab session storage across refresh and retry. Polling reconciles accepted client IDs; explicit sign-out clears local drafts and pending-message storage. Server idempotency prevents retry duplicates. Messages are periodically polled, not advertised as realtime or end-to-end encrypted.
- Existing server mutual-match, block and unmatch enforcement remains in use for every role. A follow never grants messaging access.

## Database and local use

Migration `002_account_journeys.sql` adds onboarding columns, user_consents, password_reset_tokens and recovery_mail. It does not delete existing users or conversations. Existing real accounts have no synthetic completion/consent records; demo fixtures retain their preview access.

Development startup applies pending migrations. Stop the API before invoking `pnpm db:migrate` against the same PGlite directory; do not open a second PGlite process. Production requires the separate migration job and grants for new tables. See MIGRATIONS.md.

To use the updated local app, restart the existing development process if it is not watching source changes, then refresh the browser. This milestone did not confirm which local processes are currently running.

In local demo mode without SMTP, the recovery worker writes mail previews to `data/mail-preview/<job-id>.txt` (or the configured DATA_DIR). Each file contains the fictional recipient and reset link. This directory is outside the served frontend and must remain private. Request a reset from the UI, then open the generated local text file. Preview files are local development artifacts and are not automatically purged; remove them when no longer needed. Never expose the data directory through a tunnel or static server.

With SMTP configured, recovery is sent to the account email address; delivery failures retry through the queue without exposing account existence to the requestor. Rotating JWT_SECRET also rotates recovery-mail encryption material, so undelivered old jobs become unreadable and expire; coordinate rotations and request new links as needed.

## Evidence and remaining work

- `pnpm build` passed, including strict TypeScript checks for the configured core/shared modules and Vite compilation of the frontend.
- OpenAPI generation completed with 41 operations.
- No tests were added or run. No browser walkthrough, migration execution, SMTP delivery, timing/privacy analysis, hosted PostgreSQL run or concurrency validation was performed for M2. The earlier integration-test results predate these changes. Existing test fixtures need explicit consent versions and onboarding completion when that verification work is authorized.
- Most screens and route handlers remain JavaScript; passing the configured TypeScript check does not type-check all application logic.
- Public terms/privacy/creator text and adult-assurance requirements are still unresolved. Production startup intentionally rejects the preview policy versions in shared/policies.ts. Supply reviewed text and new versions before launch; changing version strings alone is not policy approval.
- Dedicated accessibility, history/Back, race, network failure and security validation remain required. AC-01–07 are implementation targets, not certified outcomes.

## Next milestone

M3: account safety and usable free-event operations. Retention/export/deletion rules, staff provisioning/MFA, moderation operations, event publisher permissions and attendee notifications depend on the remaining product/operations decisions in RELEASE_1.md. M4 provides staging and production validation; M1/M2 runtime acceptance remains pending.
