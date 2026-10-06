# Release 1 — approved product scope

Status: scope approved by the user on 4 October 2026. Implementation and production validation remain incomplete.

This document records the user's approval to proceed with the five recommendations presented after the navigation audit. It governs Release 1 scope when older prototype or specification material conflicts. It does not approve previously proposed financial rates, refund windows, service providers or future commercial behavior. See DECISIONS.md for the implemented baseline and unresolved policies.

## Approved decisions

| ID | Decision | Implementation consequence |
| --- | --- | --- |
| R1-01 | Launch discovery, creator profiles, mutual-match text messaging and free events. | Complete these journeys and their safety/account controls before adding commercial modules. |
| R1-02 | Creator is an opt-in personal role; additional capabilities have their own eligibility checks. | Preserve the authenticated identity when enabling creator mode. No automatic influencer, staff, payout or paid-service privileges. |
| R1-03 | Contact verification, adult eligibility and identity verification are distinct. | Never label an email-confirmed account identity-verified. A DOB declaration is not verified age or identity. |
| R1-04 | Messaging requires a mutual match, including creator accounts. | Following is free and does not grant messaging access. Blocking, unmatching or suspension removes applicable messaging access. |
| R1-05 | Defer payment-dependent features until booking, refund and coin rules are approved together. | No wallet balance, checkout, paid booking, subscription or payout claims in Release 1. |

## Included user journeys

1. Register → confirm primary contact → complete profile → discover people.
2. Sign in / sign out → recover access when necessary.
3. Search/filter → open the correct person's profile → like/pass → mutual match.
4. Open inbox → choose match → send text → reload/reconnect without losing accepted messages.
5. Discover creator → view profile → follow/unfollow for free; mutual matching remains available.
6. Browse free event → inspect venue/date/capacity → RSVP → view My plans → cancel.
7. Edit profile/photos/preferences/visibility → see pending photo review status accurately.
8. Block/report → staff review → appropriate resolution and audit record.
9. Access privacy/account controls → request export or deletion with defined processing rules.

Staff need controlled account provisioning, MFA, report/photo review, suspension and event publishing/cancellation. Real events cannot rely on SQL seed edits as their operating workflow. The permission model and organizer/staff responsibilities must be specified before implementing event management.

## Deferred product scope

Coins and payments; paid following/messaging; creator subscriptions; paid content; memberships; paid creator sessions; event ticket purchases/QR ticketing; payouts; voice/video calls; Live; creator publishing studio; business campaigns; communities; influencer application workflows. Existing influencer fixtures or enum values do not establish a public influencer onboarding capability.

Retain the broader PRD/audit as the future backlog. Do not introduce active controls that merely simulate these deferred transactions. No Live slot is required for this release while streaming is unavailable.

## Role and access requirements

Operational approval, 4 October 2026: admins and moderators may create, publish and cancel free events after staff MFA verification. Account exports and deletion-request intake are enabled. Actual erasure and retention schedules remain disabled pending approved rules. This approval does not authorize public deployment or establish event-support response targets.

| Actor/state | Allowed | Not granted |
| --- | --- | --- |
| Visitor | Authentication, recovery and approved public information | Private profiles, conversations, staff tools; guest discovery needs a visibility decision first |
| Unverified member | Own onboarding, verification and session/account controls | Match messaging or interactions requiring verified contact |
| Active verified member | Discovery under visibility/preferences, likes/matches, free creator follows, eligible free RSVPs | Creator/staff/influencer privileges by request-body injection |
| Creator | Member capabilities and creator profile/directory participation | Bypass of mutual-match rule; publishing/earnings features deferred from R1 |
| Moderator | Explicitly granted moderation functions | Financial operations or unrestricted administrative role assignment |
| Suspended account | Only explicitly permitted recovery/support/account processes | Discovery, new messages, follows or RSVPs |
| Blocked pair | Own account access | Contact/profile access to the other person; unblocking does not automatically restore a match |

The API must evaluate authorization on every protected request. Frontend visibility alone is insufficient. Detailed visitor visibility, adult assurance and role-revocation treatment remain launch decisions below.

## Verification contract

- Preserve email/password plus email-link verification as the existing implementation baseline. Selecting phone OTP or social login as a launch requirement remains open; this approval did not choose a provider or login channel.
- Track contact verification independently from identity verification and adult eligibility.
- Enforce the adult requirement on the server. Decide whether DOB declaration alone is sufficient for the intended launch or whether an additional assurance process is required.
- Manual photo approval means a photo passed the configured review; it must not imply face matching or government-ID verification.
- Creator opt-in must preserve account identity and record the transition. Creator terms/consent requirements need approved text/versioning.
- Keep genuine identity verification unavailable until the process and evidence handling are implemented; do not display fixture badges as verified users.

## Messaging contract

- Both participants must have an active mutual match, valid account access and no blocking restriction.
- Apply the same rule to members and creators. A follow does not unlock a conversation.
- Text-only for R1. Paid access, subscriber exceptions, intro payments, attachments and calls are deferred.
- Persist accepted messages and reconcile retries using a stable client message identifier.
- Distinguish sending, failed and accepted states. Do not advertise realtime delivery or end-to-end encryption that is not implemented.
- Unmatch/block/suspension must prevent subsequent sends server-side, including concurrent requests.
- Provide accessible access to message history; the current latest-100-only UI is incomplete.
- Exact retention/deletion and receipt/privacy policies must be resolved before public launch.

## Free event contract

- All Release 1 event reservations are free RSVPs. Reject paid event reservations rather than displaying a false checkout success.
- Capacity and duplicate reservation checks run transactionally.
- Cancelling an RSVP releases its place once; repeated cancellation must not corrupt attendance.
- Display event date, time zone, venue, available places and cancellation status consistently.
- Organizer cancellation must make the event non-bookable and communicate the change to affected attendees through the chosen delivery channel.
- My plans must distinguish active and cancelled events. A free RSVP is not a paid ticket or creator service booking.

## Navigation baseline

Existing top-level routes remain the starting point: People, Creators, Experiences, Messages, Profile, Settings, and staff-only Moderation. The 28-screen audit is a gap inventory, not a requirement to expose deferred Live/Wallet/Studio screens in R1.

Next routing work: stable person/event/conversation IDs in URLs; direct links and refresh restoration; reliable Back to results/inbox; preserved filters; guarded staff routes; descriptive page titles and focus handling. Canonical URL paths will be defined in the routing/API milestone. A public landing page is useful, but public profile/photo access must await the visitor-visibility policy.

## Acceptance backlog

All items below are requirements to verify, not assertions that the current code passes.

| ID | Acceptance scenario | Current gap / work |
| --- | --- | --- |
| AC-01 | Underage registration is rejected server-side; verified-contact badges never imply ID verification. | Adult assurance policy pending; baseline DOB/email checks exist. |
| AC-02 | Recovery tokens expire, are single-use, do not disclose account existence and follow approved session-revocation behavior. | Password recovery missing. |
| AC-03 | Onboarding resumes after interruption and saves required fields and consent versions. | Single-form baseline; resumable completion and consent records missing. |
| AC-04 | Creator opt-in preserves user ID, retains member access and cannot grant staff/influencer permissions. | API baseline exists; user journey and consent/audit coverage need completion. |
| AC-05 | Following alone cannot send a message; two likes yield one match even under concurrent requests. | Existing baseline; role-specific regression coverage needed. |
| AC-06 | Block/unmatch/suspension prevents further messaging; retries cannot duplicate accepted messages. | Existing transaction controls; finish lifecycle/error UX. |
| AC-07 | Selected profile/event/thread survives direct link and refresh; Back restores the appropriate list. | Detail selection currently uses component state. |
| AC-08 | Profile visibility and photo authorization apply equally to API, media and UI; pending photos stay private. | Expand privacy specification, galleries/storage and review lifecycle. |
| AC-09 | At capacity, only eligible available reservations succeed; cancellation restores one place. | Baseline capacity checks exist; real event administration missing. |
| AC-10 | Staff cancellation prevents RSVPs and notifies attendees; expired/cancelled plans remain understandable. | Cancellation/notification lifecycle incomplete. |
| AC-11 | Export/delete requests follow approved identity, retention and deletion rules. | Workflow and policy missing. |
| AC-12 | Staff actions require proper role/MFA and produce an audit record; ordinary members cannot access the tools. | Basic role checks exist; MFA/provisioning and audit hardening pending. |
| AC-13 | Keyboard/mobile users can complete each included journey, with clear loading/empty/error/retry states. | Dedicated accessibility and journey verification pending. |
| AC-14 | Staging uses migrations, durable media/jobs and monitored email; backup restore and rollback are demonstrated. | Local scaffolding only; hosted staging verification pending. |
| AC-15 | Release runs without demo routes/accounts; provider failures and malicious inputs cannot bypass permissions. | Production guards exist; release validation pending. |

## Decisions still needed before public launch

Approval of scope does not answer these details. Continue independent engineering; seek decisions when a dependent implementation becomes ready.

| Decision | Why it matters | Owner |
| --- | --- | --- |
| Launch geography/languages and primary login channel | Provider choice, localization and onboarding | Product owner |
| Adult assurance, identity gates and permitted content | Verification UX, safeguards and provider suitability | Product owner with appropriate specialist review |
| Visitor/profile/photo visibility and message retention | Public endpoints, storage and deletion behavior | Product owner |
| Consent/terms/privacy text and versions | Registration, creator opt-in and account requests | Product owner with appropriate specialist review |
| Event publisher eligibility and cancellation responsibilities | Staff tools, communications and support | Product/operations |
| Staff roles, moderation/appeal response targets and support ownership | Operational permissions and queues | Operations |
| Hosting region, email/media providers, backup placement and retention | Staging configuration and recovery | Product/engineering |
| Performance targets and release sign-off criteria | Meaningful load tests and go/no-go | Product/engineering |

Commercial decisions remain separate: coin catalogue/conversion, balance categories, paid messaging rights, service quote/acceptance lifecycle, refund percentages/windows, fees, taxes, disputes and payouts. No values for these are approved by this scope decision.

## Next implementation milestone

Implementation update, 4 October 2026: M1's incremental foundation and M2's authentication/navigation code are delivered. See FOUNDATION_M1.md and AUTH_NAVIGATION_M2.md. Recovery, saved onboarding/consents, creator opt-in, entity URLs and earlier-message/retry UI now address the implementation gaps recorded above; their acceptance scenarios still need runtime verification. M3 is the next implementation milestone. Public consent text and the other launch decisions remain unresolved.

M3 focuses on operational safety and free events, while runtime validation of M1/M2 remains open. See ROADMAP.md for the release sequence and policy dependencies.

This approval authorizes the requirements baseline. It is not evidence of production readiness or permission to create paid vendor accounts, publish the service, expose development moderator access or move real money.
