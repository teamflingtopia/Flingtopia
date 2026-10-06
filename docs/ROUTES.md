# Release 1 navigation and entity contract

## Current routing (M2)

`src/routing.ts` centralizes hash routing. M2 implements the entity routes below, plus `#forgot-password` and `#reset-password?token=...`. Unknown or structurally invalid routes show an unavailable page. Authentication preserves the current destination; incomplete real accounts pass through saved onboarding before accessing it. Backend authorization remains authoritative.

## Implemented routes

Hash routing preserves existing entry links without host rewrites. Browser journey validation remains pending.

| Target | Entity | Access / history behavior |
| --- | --- | --- |
| `#discover` and query filters | None | Signed-in list; restore filters and scroll on Back |
| `#creators` | None | Signed-in creator directory; free follows |
| `#people/:personId` | User UUID | Fetch authorized full profile; Back returns originating directory; refresh reloads by ID |
| `#experiences` | None | Free event list; My plans filter persists |
| `#events/:eventId` | Event UUID | Fetch authorized event, retain cancellation/unavailable state and RSVP status |
| `#messages` | None | Inbox; do not silently replace its mobile destination with a thread |
| `#messages/:conversationId` | Match UUID for current model | Participant + active match + block/status checks; Back returns inbox |
| `#profile`, `#settings` | Authenticated user | Own account only; profile drafts survive navigation in tab storage and offer explicit save/discard |
| `#moderation` | Staff workspace | Server-enforced moderator/admin access; unauthorized deep links show access-denied UI |

The current `match_id` is also the conversation ID. Photo review `:id` is a user ID. Report review `:id` is a report ID. RSVP `:id` is an event ID. Keep these meanings in API types and links; do not use display names or list positions as identifiers.

M2 adds authorized GET `/people/:id`, `/events/:id` and `/conversations/:id`; see openapi.json. Detail views fetch current authorization rather than relying on a stale list object. Unknown/deleted/blocked entities show an unavailable screen. App-created detail entries retain browser Back behavior; direct links use a validated local list fallback. Query filters are in the hash; scroll/card focus are stored only in the current browser tab. Discovery restoration refetches up to 25 previously requested pages and reflects current visibility.

## Acceptance checklist (AC-07, AC-13)

- Open the same profile from search and creator directory; both resolve the same UUID.
- Refresh a profile, event or conversation link and restore the correct authorized entity.
- Back/Forward restores list filters, scroll and keyboard focus without duplicating history.
- Malformed IDs, missing entities, revoked permissions and expired sessions have explicit states.
- Drawer/dialog focus is contained and restored; hidden navigation does not remain interactive.
- Page title and main heading announce the destination; loading/error/retry states are accessible.
- Existing top-level links continue to work; no Live/Wallet/paid controls are introduced in R1.

The checklist remains a future verification plan; it was not executed in M1 or M2. See AUTH_NAVIGATION_M2.md for implementation boundaries and remaining evidence.
