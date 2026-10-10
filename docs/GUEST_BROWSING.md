# Guest browsing

Signed-out visitors land on guest discovery. People and experience list/detail routes are available without authentication. Sign-in and signup use #signin and #signup; recovery and social callbacks retain their dedicated flows. Auth screens include an Explore as a guest link.

The four public GET endpoints are `/api/v1/public/people`, `/api/v1/public/people/:id`, `/api/v1/public/events`, and `/api/v1/public/events/:id`. Existing global API rate limits apply. Lists are paginated in batches of 20.

Member previews contain only id, display name, city, interests, and role. They require an active, visible, email-verified, adult, completed profile (or a permitted demo profile). Staff and hidden profiles are excluded. Photos, biographies, contact details, exact birth dates, relationship state, and verification documents are not returned. Public visibility means anonymous viewers can see these limited fields; member-to-member block rules cannot identify an anonymous visitor.

Public experiences include upcoming published events only. Responses exclude venue details, attendees, organizer identifiers, and booking records. Draft, cancelled, and past events are unavailable to guests.

Guest Message, Like, Follow, Join experience, and Create controls prompt for sign-in or signup. They never submit writes. Existing write routes retain authentication, verification, and role checks. Creating an account does not grant event publishing permissions.

No database migration or new environment variable is needed. Deploy the commit after pushing it. Tests and browser verification have not been run for this change. Before release validation, cover anonymous list/detail reads, hidden/suspended/draft exclusions, paging, denied anonymous writes, sign-in/signup/social/recovery navigation, and existing signed-in behavior.


## Reference design alignment — 10 October 2026

Inspected the supplied Claude artifact's rendered home, People and Experiences screens and published HTML/CSS. Its visual system is Inter, #08080A canvas, #121215 cards, #26262E borders and a #FF2D6F / #C026D3 / #7B3FE4 gradient. The prior guest layout used white panels and a wide desktop header; it did not match this reference.

The public shell now uses a compact responsive column, butterfly branding, search shortcut, horizontal home rails, compact People rows and experience cards. Bottom navigation follows the reference: People, Experiences, Live, Messages, Profile. Home is #discover; the People list is #browse. Existing profile and event detail URLs remain valid, including return navigation. Search and pagination still use the existing public API.

The current APP_AUTH_ENABLED=false mode remains in place. The main call to action explores People rather than opening signup. Messages and Profile have explicit unavailable screens; Live has a coming-soon screen because streaming is not implemented. None of these screens reads private account data. Public people photos remain withheld by the API; use branded placeholders instead. Published event images are used when available with a branded failure fallback. No invented followers, availability, stream counts, or sample members are added to staging. Local demo data is separate from staging data.

Build and TypeScript compilation passed. The local home was visually inspected with local demo data. Automated and end-to-end tests were not run. This aligns the public browsing surface; it does not claim full parity for the reference's creator studio, paid calls, wallet, subscriptions, or streaming functionality.
