# Guest browsing

Signed-out visitors land on guest discovery. People and experience list/detail routes are available without authentication. Sign-in and signup use #signin and #signup; recovery and social callbacks retain their dedicated flows. Auth screens include an Explore as a guest link.

The four public GET endpoints are `/api/v1/public/people`, `/api/v1/public/people/:id`, `/api/v1/public/events`, and `/api/v1/public/events/:id`. Existing global API rate limits apply. Lists are paginated in batches of 20.

Member previews contain only id, display name, city, interests, and role. They require an active, visible, email-verified, adult, completed profile (or a permitted demo profile). Staff and hidden profiles are excluded. Photos, biographies, contact details, exact birth dates, relationship state, and verification documents are not returned. Public visibility means anonymous viewers can see these limited fields; member-to-member block rules cannot identify an anonymous visitor.

Public experiences include upcoming published events only. Responses exclude venue details, attendees, organizer identifiers, and booking records. Draft, cancelled, and past events are unavailable to guests.

Guest Message, Like, Follow, Join experience, and Create controls prompt for sign-in or signup. They never submit writes. Existing write routes retain authentication, verification, and role checks. Creating an account does not grant event publishing permissions.

No database migration or new environment variable is needed. Deploy the commit after pushing it. Tests and browser verification have not been run for this change. Before release validation, cover anonymous list/detail reads, hidden/suspended/draft exclusions, paging, denied anonymous writes, sign-in/signup/social/recovery navigation, and existing signed-in behavior.
