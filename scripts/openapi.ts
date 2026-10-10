import {
  eventInput,
  eventRevision,
  cancelEventInput,
  accountRequestInput,
} from "../shared/operations.ts";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  recoverySchema,
  resetSchema,
  onboardingSchema,
  completionSchema,
  creatorSchema,
  registerSchema,
  loginSchema,
  verificationSchema,
  profileSchema,
  profileDetailsSchema,
  reportSchema,
  messageSchema,
  photoReviewSchema,
  reportReviewSchema,
} from "../shared/validation.ts";
type Schema = Record<string, unknown>;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const str: Schema = { type: "string" },
  bool: Schema = { type: "boolean" },
  integer: Schema = { type: "integer" },
  id: Schema = { type: "string", format: "uuid" },
  date: Schema = { type: "string", format: "date-time" };
const nullable = (schema: Schema) => ({ anyOf: [schema, { type: "null" }] });
const array = (items: Schema) => ({ type: "array", items });
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({ type: "object", properties, required });
const json = (schema: Schema) => ({ "application/json": { schema } });
const publicProperties = {
  id,
  display_name: str,
  username: str,
  age: nullable(integer),
  gender: nullable({ enum: ["woman", "man", "nonbinary", "custom"] }),
  looking_for: { enum: ["everyone", "woman", "man", "nonbinary", "custom"] },
  city: str,
  bio: str,
  interests: array(str),
  custom_gender: str,
  connection_goals: array({
    enum: ["casual", "friendship", "networking", "dating"],
  }),
  languages: array(str),
  social_links: object({ instagram: str, x: str, tiktok: str }, []),
  role: { enum: ["user", "creator", "influencer"] },
  avatar_url: nullable(str),
  identity_verified: bool,
  is_demo: bool,
};
const schemas: Record<string, Schema> = {
  Error: object({
    error: object({ code: str, message: str, request_id: str }, [
      "code",
      "message",
    ]),
  }),
  Ok: object({ ok: { const: true } }),
  PublicPerson: object(publicProperties),
  PrivateUser: object({
    ...publicProperties,
    email: { type: "string", format: "email" },
    email_verified: bool,
    staff_role: nullable({ enum: ["moderator", "admin"] }),
    profile_visible: bool,
    pending_avatar: bool,
    onboarding_completed: bool,
    onboarding_draft: ref("OnboardingInput"),
    adult_eligibility: { enum: ["self_declared", "unknown"] },
    needs_demographics: bool,
    has_password: bool,
  }),
  VerificationDelivery: object(
    {
      ok: { const: true },
      development_verification_url: { type: "string", format: "uri" },
      email_sent: bool,
      message: str,
    },
    [],
  ),
  UserResponse: object({ user: ref("PrivateUser") }),
  RegisterResponse: object(
    {
      user: ref("PrivateUser"),
      development_verification_url: str,
      email_sent: bool,
      message: str,
    },
    ["user"],
  ),
  People: object({
    people: array(object({ ...publicProperties, is_following: bool })),
    next_cursor: nullable(id),
  }),
  Message: object({
    id,
    sender_id: id,
    body: str,
    created_at: date,
    read_at: nullable(date),
  }),
  StoredMessage: object({
    id,
    match_id: id,
    sender_id: id,
    body: str,
    client_id: id,
    created_at: date,
    read_at: nullable(date),
  }),
  Conversations: object({
    conversations: array(
      object({
        id,
        person: ref("PublicPerson"),
        last_message: nullable(str),
        unread: integer,
      }),
    ),
  }),
  Messages: object({
    messages: array({
      allOf: [ref("Message"), object({ cursor_time: date, client_id: id })],
    }),
    has_more: bool,
  }),
  Event: object({
    id,
    title: str,
    description: str,
    category: str,
    city: str,
    venue: str,
    starts_at: date,
    image_url: nullable(str),
    capacity: integer,
    price_inr: integer,
    status: { enum: ["published", "cancelled", "completed"] },
    is_demo: bool,
    attendees: integer,
    attending: bool,
  }),
  Rsvp: object({
    id,
    user_id: id,
    event_id: id,
    created_at: date,
    cancelled_at: nullable(date),
  }),
  Report: object({
    id,
    reporter_id: id,
    target_id: id,
    category: str,
    details: str,
    status: { enum: ["open", "resolved"] },
    resolution: nullable(str),
    resolved_by: nullable(id),
    created_at: date,
    target_name: str,
    reporter_name: str,
  }),
};
for (const [name, schema] of Object.entries({
  RecoveryInput: recoverySchema,
  ResetInput: resetSchema,
  OnboardingInput: onboardingSchema,
  CompletionInput: completionSchema,
  CreatorInput: creatorSchema,
  EventInput: eventInput,
  EventEditInput: eventInput.merge(eventRevision),
  EventRevision: eventRevision,
  CancelEventInput: cancelEventInput,
  AccountRequestInput: accountRequestInput,
  RegisterInput: registerSchema,
  LoginInput: loginSchema,
  VerificationInput: verificationSchema,
  ProfileInput: profileSchema,
  ProfileDetailsInput: profileDetailsSchema,
  ReportInput: reportSchema,
  MessageInput: messageSchema,
  PhotoReviewInput: photoReviewSchema,
  ReportReviewInput: reportReviewSchema,
})) {
  const converted = z.toJSONSchema(schema, { io: "input" });
  delete converted.$schema;
  schemas[name] = converted;
}
const paths: Record<string, Record<string, unknown>> = {};
interface Operation {
  path: string;
  method: string;
  name: string;
  tag: string;
  response: Schema;
  input?: string;
  status?: number;
  public?: boolean;
  verified?: boolean;
  staff?: boolean;
  description?: string;
  errors?: number[];
  parameters?: unknown[];
}
function add(o: Operation) {
  const params: unknown[] = [...(o.parameters || [])];
  for (const name of o.path.matchAll(/\{(\w+)\}/g))
    params.push({
      name: name[1],
      in: "path",
      required: true,
      schema:
        name[1] === "file"
          ? { type: "string", pattern: "^[a-f0-9-]{36}\\.jpg$" }
          : id,
    });
  if (o.method !== "get")
    params.push({
      name: "Origin",
      in: "header",
      required: true,
      description:
        "Must exactly equal configured APP_ORIGIN, including scheme and port.",
      schema: { type: "string", format: "uri" },
    });
  const responses: Record<string, unknown> = {
    [o.status || 200]: { description: "Success", content: json(o.response) },
  };
  const errors = new Set([
    500,
    ...(o.path.startsWith("/api") ? [429] : []),
    ...(o.public ? [] : [401]),
    ...(o.method !== "get" ? [400, 403] : []),
    ...(o.errors || []),
  ]);
  for (const code of errors)
    responses[code] = {
      description:
        (
          {
            400: "Validation or upload error",
            401: "Unauthenticated or expired session",
            403: "Origin, role, verification or contact permission denied",
            404: "Unavailable resource",
            409: "Conflict",
            429: "Rate or daily limit",
            500: "Internal failure",
          } as Record<number, string>
        )[code] || "Error",
      content: json(ref("Error")),
    };
  (paths[o.path] ||= {})[o.method] = {
    operationId: o.name,
    tags: [o.tag],
    summary: o.name.replace(/([A-Z])/g, " $1").trim(),
    description: [
      o.description,
      o.verified
        ? "Verified email and completed onboarding required; local demo fixtures bypass onboarding."
        : "",
      o.staff
        ? "Explicit moderator/admin role and authenticator step-up within 15 minutes required."
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    security: o.public ? [] : [{ accessCookie: [] }],
    parameters: params,
    responses,
    ...(o.input
      ? { requestBody: { required: true, content: json(ref(o.input)) } }
      : {}),
  };
}
const api = "/api/v1";
add({
  path: api + "/health",
  method: "get",
  name: "health",
  tag: "System",
  public: true,
  response: object({ status: { const: "ok" } }),
});
add({
  path: api + "/config",
  method: "get",
  name: "configuration",
  tag: "System",
  public: true,
  response: object({
    auth_enabled: bool,
    demo: bool,
    operations: object({
      event_publisher_roles: array({ enum: ["admin", "moderator"] }),
      account_requests: bool,
    }),
    policies: object({
      community: object({ version: str, title: str, text: str }),
      creator: object({ version: str, title: str, text: str }),
    }),
    features: object({
      payments: { const: false },
      live: { const: false },
      photo_review: { const: true },
    }),
  }),
});
add({
  path: api + "/auth/register",
  method: "post",
  name: "registerAccount",
  tag: "Auth",
  public: true,
  input: "RegisterInput",
  response: ref("RegisterResponse"),
  status: 201,
  errors: [409],
  description:
    "Age must be 18–120; password at most 72 UTF-8 bytes. Sets access and refresh cookies. Unknown properties do not grant roles.",
});
add({
  path: api + "/auth/login",
  method: "post",
  name: "login",
  tag: "Auth",
  public: true,
  input: "LoginInput",
  response: ref("UserResponse"),
  errors: [401],
  description:
    "Sets HttpOnly access (15 minutes) and refresh (30 days) cookies.",
});
schemas.DemoInput = object(
  { as: { enum: ["member", "moderator"], default: "member" } },
  [],
);
add({
  path: api + "/auth/demo",
  method: "post",
  name: "demoLogin",
  tag: "Auth",
  public: true,
  input: "DemoInput",
  response: ref("UserResponse"),
  errors: [404],
  description:
    "Development only. Returns 404 when DEMO_MODE=false. Sets session cookies.",
});
add({
  path: api + "/auth/refresh",
  method: "post",
  name: "refreshSession",
  tag: "Auth",
  public: true,
  response: ref("Ok"),
  errors: [401],
  description:
    "Requires ft_refresh cookie. Rotates tokens; reuse revokes the family.",
});
paths[api + "/auth/refresh"].post = {
  ...(paths[api + "/auth/refresh"].post as object),
  security: [{ refreshCookie: [] }],
};
add({
  path: api + "/auth/logout",
  method: "post",
  name: "logout",
  tag: "Auth",
  public: true,
  response: ref("Ok"),
  description:
    "Optional refresh cookie identifies family to revoke. Always clears session cookies.",
});
add({
  path: api + "/auth/verify",
  method: "post",
  name: "verifyEmail",
  tag: "Auth",
  public: true,
  input: "VerificationInput",
  response: ref("Ok"),
});
add({
  path: api + "/auth/resend-verification",
  method: "post",
  name: "resendVerification",
  tag: "Auth",
  response: ref("VerificationDelivery"),
  description:
    "Already verified returns ok. Development URL only in demo without SMTP; email failure is reported in response.",
});
add({
  path: api + "/me",
  method: "get",
  name: "getOwnProfile",
  tag: "Profiles",
  response: ref("UserResponse"),
});
add({
  path: api + "/me",
  method: "patch",
  name: "updateOwnProfile",
  tag: "Profiles",
  input: "ProfileInput",
  response: ref("UserResponse"),
  description:
    "All six profile fields are required despite PATCH. Interests are deduplicated.",
});
add({
  path: api + "/me/creator",
  method: "post",
  name: "enableCreator",
  input: "CreatorInput",
  tag: "Profiles",
  verified: true,
  response: ref("UserResponse"),
  description:
    "Additive opt-in; preserves account identity and existing influencer role.",
});
add({
  path: api + "/me/photo",
  method: "post",
  name: "uploadProfilePhoto",
  tag: "Profiles",
  verified: true,
  response: object({ message: str }),
  status: 201,
  description:
    "JPEG/PNG/WebP, maximum 5 MB and 25 million input pixels; normalized to JPEG. Remains private pending review.",
});
(paths[api + "/me/photo"].post as Record<string, unknown>).requestBody = {
  required: true,
  content: {
    "multipart/form-data": {
      schema: object({ photo: { type: "string", format: "binary" } }),
    },
  },
};
add({
  path: "/media/{file}",
  method: "get",
  name: "getProfileMedia",
  tag: "Profiles",
  response: { type: "string", format: "binary" },
  errors: [404],
  description:
    "Owner or staff with recent MFA may see pending/rejected images. Others require an approved photo, visible active confirmed/completed owner, eligible viewer and no block. Removed media is inaccessible. No-store cache policy.",
});
(
  (paths["/media/{file}"].get as Record<string, unknown>).responses as Record<
    string,
    unknown
  >
)["200"] = {
  description: "Authorized profile image",
  content: { "image/jpeg": { schema: { type: "string", format: "binary" } } },
};
const query = (name: string, schema: Schema, description?: string) => ({
  name,
  in: "query",
  required: false,
  schema,
  description,
});
add({
  path: api + "/people",
  method: "get",
  name: "discoverPeople",
  verified: true,
  tag: "Discovery",
  response: ref("People"),
  errors: [400],
  parameters: [
    query("q", { type: "string", maxLength: 100, default: "" }),
    query("city", { type: "string", maxLength: 100, default: "" }),
    query("role", { enum: ["all", "creator", "influencer"], default: "all" }),
    query("min_age", {
      type: "integer",
      minimum: 18,
      maximum: 120,
      default: 18,
    }),
    query("max_age", {
      type: "integer",
      minimum: 18,
      maximum: 120,
      default: 65,
    }),
    query("cursor", id),
  ],
  description:
    "20 per page, UUID cursor. Enforces mutual gender preference, visibility, verified candidate email, blocks, passes/likes and demo policy. Creator includes influencers. No distance/online filters.",
});
add({
  path: api + "/people/{id}/like",
  method: "post",
  name: "likePerson",
  tag: "Discovery",
  verified: true,
  response: {
    oneOf: [
      object({ matched: { const: false } }),
      object({ matched: { const: true }, match_id: id, name: str }),
    ],
  },
  errors: [404],
  description:
    "20 new likes per database day. A mutual like creates/reactivates one match; DAILY_LIMIT may return 429.",
});
add({
  path: api + "/people/{id}/pass",
  method: "post",
  name: "passPerson",
  tag: "Discovery",
  response: ref("Ok"),
  errors: [404],
});
add({
  path: api + "/people/reset-passes",
  method: "post",
  name: "resetPasses",
  tag: "Discovery",
  response: ref("Ok"),
  description:
    "Current endpoint clears all own passes without a premium entitlement. Product limitation to resolve.",
});
add({
  path: api + "/people/{id}/follow",
  method: "post",
  name: "toggleCreatorFollow",
  tag: "Discovery",
  verified: true,
  response: object({ following: bool }),
  errors: [404],
  description:
    "Free toggle, not an idempotent set operation. Does not grant chat access.",
});
add({
  path: api + "/people/{id}/block",
  method: "post",
  name: "blockPerson",
  tag: "Safety",
  response: ref("Ok"),
  description: "Blocks contact and deactivates pair matches.",
});
add({
  path: api + "/blocks",
  method: "get",
  name: "listBlockedPeople",
  tag: "Safety",
  response: object({ people: array(object({ id, display_name: str })) }),
});
add({
  path: api + "/blocks/{id}",
  method: "delete",
  name: "unblockPerson",
  tag: "Safety",
  response: ref("Ok"),
  description: "Does not restore prior matches.",
});
add({
  path: api + "/reports",
  method: "post",
  name: "reportPerson",
  tag: "Safety",
  input: "ReportInput",
  response: object({ id }),
  status: 201,
});
add({
  path: api + "/conversations",
  method: "get",
  name: "listConversations",
  verified: true,
  tag: "Messages",
  response: ref("Conversations"),
});
add({
  path: api + "/conversations/{id}/messages",
  method: "get",
  name: "listMessages",
  verified: true,
  tag: "Messages",
  response: ref("Messages"),
  errors: [400, 403, 404],
  parameters: [
    query(
      "before",
      { type: "string", format: "date-time" },
      "Use cursor_time plus before_id for a precise timestamp/UUID boundary; newest 100 returned oldest-first.",
    ),
  ],
  description:
    "Only active match participants without blocks. Not a cursor parameter.",
});
add({
  path: api + "/conversations/{id}/messages",
  method: "post",
  name: "sendMessage",
  tag: "Messages",
  input: "MessageInput",
  verified: true,
  response: object({ message: ref("StoredMessage") }),
  status: 201,
  errors: [404, 409],
  description:
    "client_id UUID is required. Same sender/client ID replays same body/conversation; mismatched replay is 409. Text-only mutual-match access.",
});
for (const [suffix, name] of [
  ["read", "markRead"],
  ["unmatch", "unmatch"],
])
  add({
    path: api + `/conversations/{id}/${suffix}`,
    method: "post",
    name,
    tag: "Messages",
    response: ref("Ok"),
    errors: [404],
    description: "Requires active authorized conversation.",
  });
add({
  path: api + "/events",
  method: "get",
  name: "listUpcomingEvents",
  verified: true,
  tag: "Events",
  response: object({ events: array(ref("Event")) }),
  description:
    "Published future events; demo events only in demo mode. No query filters.",
});
add({
  path: api + "/events/{id}/rsvp",
  method: "post",
  name: "reserveFreeEvent",
  tag: "Events",
  verified: true,
  response: object({ ticket: ref("Rsvp") }),
  status: 201,
  errors: [404, 409],
  description:
    "Free RSVP only. Repeats return same reservation. SOLD_OUT / NOT_AVAILABLE are 409; capacity is locked transactionally. Legacy response key ticket does not mean a paid ticket.",
});
add({
  path: api + "/events/{id}/rsvp",
  method: "delete",
  name: "cancelRsvp",
  tag: "Events",
  response: ref("Ok"),
});
add({
  path: api + "/admin/queue",
  method: "get",
  name: "moderationQueue",
  tag: "Moderation",
  staff: true,
  response: object({
    reports: array(ref("Report")),
    photos: array(
      object({ id, user_id: id, display_name: str, pending_avatar: str }),
    ),
  }),
  errors: [403],
  description:
    "Latest 100 reports, including resolved reports, plus active pending photos.",
});
add({
  path: api + "/admin/photos/{id}",
  method: "post",
  name: "reviewPhoto",
  tag: "Moderation",
  staff: true,
  input: "PhotoReviewInput",
  response: ref("Ok"),
  errors: [404],
  description: "ID is the user ID, not a separate photo ID.",
});
add({
  path: api + "/admin/reports/{id}",
  method: "post",
  name: "resolveReport",
  tag: "Moderation",
  staff: true,
  input: "ReportReviewInput",
  response: ref("Ok"),
  errors: [409],
  description:
    "Optional suspension revokes sessions. Suspending staff via this endpoint is forbidden.",
});
add({
  path: api + "/auth/forgot-password",
  method: "post",
  name: "requestPasswordRecovery",
  tag: "Auth",
  public: true,
  input: "RecoveryInput",
  response: object({ ok: { const: true }, message: str }),
  description:
    "Same response for unknown, suspended and eligible accounts. Queues recovery mail for eligible active accounts, at most once per account per five minutes. No token or delivery result in public response. Link expires in 30 minutes.",
});
add({
  path: api + "/auth/reset-password",
  method: "post",
  name: "resetPassword",
  tag: "Auth",
  public: true,
  input: "ResetInput",
  response: ref("Ok"),
  description:
    "Single-use hashed token. Transactionally replaces password, consumes all reset tokens and revokes all refresh families (including access-cookie authorization). Does not verify email or sign in. INVALID_RESET for expired/invalid/used tokens.",
});
add({
  path: api + "/me/onboarding",
  method: "patch",
  name: "saveOnboardingDraft",
  tag: "Profiles",
  input: "OnboardingInput",
  response: ref("UserResponse"),
  description:
    "Merges validated partial draft into account. Empty draft name/city allowed; completion validates required values. Draft does not publish profile.",
});
add({
  path: api + "/me/onboarding/complete",
  method: "post",
  name: "completeOnboarding",
  tag: "Profiles",
  input: "CompletionInput",
  response: ref("UserResponse"),
  description:
    "Requires confirmed email; stores profile, consent version, completion timestamp and audit in one transaction. Clears draft.",
});
add({
  path: api + "/people/{id}",
  method: "get",
  name: "getPerson",
  verified: true,
  tag: "Discovery",
  response: object({
    person: object({
      ...publicProperties,
      photos: array(object({ id, url: str })),
      is_following: bool,
      liked: bool,
      match_id: nullable(id),
    }),
  }),
  errors: [400, 404],
  description:
    "Active visible, confirmed-contact, completed profiles only (demo exception). Excludes staff, hidden demo data and blocked pairs. Returns generic unavailable when access is denied.",
});
add({
  path: api + "/events/{id}",
  method: "get",
  name: "getEvent",
  verified: true,
  tag: "Events",
  response: object({ event: ref("Event") }),
  errors: [400, 404],
  description:
    "Signed-in event detail including RSVP state, completed/cancelled status. Demo data only when enabled.",
});
add({
  path: api + "/conversations/{id}",
  method: "get",
  name: "getConversation",
  verified: true,
  tag: "Messages",
  response: object({
    conversation: object({ id, person: ref("PublicPerson") }),
  }),
  errors: [400, 403, 404],
  description:
    "Active mutual match, membership, active accounts and block checks apply on every read.",
});
const historyOperation = paths[api + "/conversations/{id}/messages"].get as {
  parameters: unknown[];
  description: string;
};
historyOperation.parameters.push({
  name: "before_id",
  in: "query",
  schema: id,
  description:
    "Use with the earliest returned cursor_time as before. UUID tie-breaker prevents skipping equal timestamps.",
});
historyOperation.description =
  "Latest 100 in ascending order; has_more indicates older history. For exact pagination send earliest message cursor_time (microsecond UTC ISO) as before and its id as before_id. Client retains earlier pages during polling.";

const photo = object(
  {
    id,
    user_id: id,
    url: str,
    status: { enum: ["pending", "approved", "rejected", "removed"] },
    reason: nullable(str),
    created_at: date,
    reviewed_at: nullable(date),
  },
  ["id", "url", "status", "reason", "created_at", "reviewed_at"],
);
const request = object({
  id,
  kind: { enum: ["export", "deletion"] },
  status: { enum: ["requested", "awaiting_policy", "withdrawn", "exported"] },
  created_at: date,
  updated_at: date,
});
const notification = object({
  id,
  event_id: id,
  kind: str,
  message: str,
  created_at: date,
  read_at: nullable(date),
});
schemas.MfaEnrollInput = object({ password: str }, []);
schemas.MfaCode = object({ code: { type: "string", pattern: "^[0-9]{6}$" } });
schemas.PhotoDecision = object({
  approve: bool,
  reason: { type: "string", minLength: 10, maxLength: 500 },
});
add({
  path: api + "/staff/mfa",
  method: "get",
  name: "staffMfaStatus",
  tag: "Staff security",
  response: object({ enrolled: bool, verified: bool, local_demo: bool }),
  errors: [403],
  description:
    "Requires staff role; does not require an existing step-up. local_demo means password confirmation can be omitted only for fictional local demo enrollment.",
});
add({
  path: api + "/staff/mfa/enroll",
  method: "post",
  name: "enrollStaffMfa",
  tag: "Staff security",
  input: "MfaEnrollInput",
  response: object({
    secret: str,
    issuer: str,
    account: str,
    algorithm: { const: "SHA1" },
    digits: { const: 6 },
    period: { const: 30 },
  }),
  errors: [403, 409],
  description:
    "Staff role and current password required except fictional local demo. Creates a private, ten-minute pending authenticator setup. Cannot replace an enabled factor. Never log or share the returned secret.",
});
add({
  path: api + "/staff/mfa/verify",
  method: "post",
  name: "verifyStaffMfa",
  tag: "Staff security",
  input: "MfaCode",
  response: ref("Ok"),
  errors: [403],
  description:
    "Confirms pending setup or existing factor. Six-digit TOTP, 30-second period, +/- one step, rejects previously accepted counter. Binds 15-minute step-up to current session family.",
});
add({
  path: api + "/me/photos",
  method: "get",
  name: "listOwnPhotos",
  tag: "Profiles",
  response: object({ photos: array(photo) }),
});
add({
  path: api + "/me/photos",
  method: "post",
  name: "uploadGalleryPhoto",
  tag: "Profiles",
  verified: true,
  response: object({ id, message: str }),
  status: 201,
  errors: [409],
  description:
    "Up to six pending/approved photos. Same normalized private JPEG pipeline as /me/photo.",
});
(paths[api + "/me/photos"].post as Record<string, unknown>).requestBody = (
  paths[api + "/me/photo"].post as Record<string, unknown>
).requestBody;
add({
  path: api + "/me/photos/{id}/primary",
  method: "post",
  name: "setPrimaryPhoto",
  tag: "Profiles",
  verified: true,
  response: ref("Ok"),
  errors: [404],
  description:
    "Only the authenticated owner's approved photo may become primary.",
});
add({
  path: api + "/me/photos/{id}",
  method: "delete",
  name: "removeOwnPhoto",
  tag: "Profiles",
  response: ref("Ok"),
  errors: [404],
  description:
    "Revokes media access and clears primary/pending pointers transactionally; removes local bytes after commit. Failed file cleanup is logged.",
});
add({
  path: api + "/admin/photo-reviews/{id}",
  method: "post",
  name: "reviewGalleryPhoto",
  tag: "Moderation",
  staff: true,
  input: "PhotoDecision",
  response: ref("Ok"),
  errors: [404, 409],
  description:
    "ID is the immutable photo UUID. Owner must be active and photo still pending. Reason is recorded and visible to owner.",
});
add({
  path: api + "/me/account-requests",
  method: "get",
  name: "listAccountRequests",
  tag: "Account data",
  response: object({ requests: array(request) }),
  errors: [409],
  description:
    "Enabled only when account-request intake is approved/configured. Latest 50 requests.",
});
add({
  path: api + "/me/export",
  method: "post",
  name: "exportAccountJson",
  tag: "Account data",
  input: "AccountRequestInput",
  response: object({
    generated_at: date,
    profile: object({}, []),
    consents: array(object({}, [])),
    photos: array(object({}, [])),
    sent_messages: array(object({}, [])),
    rsvps: array(object({}, [])),
    likes: array(object({}, [])),
    follows: array(object({}, [])),
    blocks: array(object({}, [])),
    submitted_reports: array(object({}, [])),
    notes: array(str),
  }),
  errors: [403, 409],
  description:
    "Current password required. Same-origin no-store JSON attachment of own records. Excludes passwords, tokens, MFA secrets, other members' messages and staff-only decisions. Photo metadata only, not image bytes. Workflow gated by approved intake decision.",
});
add({
  path: api + "/me/deletion-request",
  method: "post",
  name: "requestDeletionReview",
  tag: "Account data",
  input: "AccountRequestInput",
  response: object({ request, message: str }),
  status: 201,
  errors: [403, 409],
  description:
    "Current password; duplicate pending requests return existing request. Records awaiting_policy only. Does NOT deactivate, erase or start a retention timer. Intake gate required.",
});
add({
  path: api + "/me/deletion-request",
  method: "delete",
  name: "withdrawDeletionRequest",
  tag: "Account data",
  response: ref("Ok"),
  errors: [409],
  description: "Withdraws own pending request; does not change account data.",
});
add({
  path: api + "/me/reports",
  method: "get",
  name: "listOwnReports",
  tag: "Safety",
  response: object({
    reports: array(
      object({
        id,
        category: str,
        status: { enum: ["open", "resolved"] },
        created_at: date,
      }),
    ),
  }),
  description:
    "Latest 100 own report statuses. Does not reveal staff decisions or other reporters.",
});
const publisherNote =
  "Requires configured publishing role as well as staff MFA. Disabled when event_publisher_roles is empty.";
add({
  path: api + "/admin/events",
  method: "get",
  name: "listManagedEvents",
  tag: "Event operations",
  staff: true,
  response: object({ events: array(ref("Event")) }),
  errors: [403],
  description: publisherNote + " Latest 200 events including drafts.",
});
add({
  path: api + "/admin/events",
  method: "post",
  name: "createEventDraft",
  tag: "Event operations",
  staff: true,
  input: "EventInput",
  response: object({ event: ref("Event") }),
  status: 201,
  description: publisherNote + " Saves a private future free-event draft.",
});
add({
  path: api + "/admin/events/{id}",
  method: "patch",
  name: "editEventDraft",
  tag: "Event operations",
  staff: true,
  input: "EventEditInput",
  response: object({ event: ref("Event") }),
  errors: [409],
  description:
    publisherNote + " Draft-only edits; optimistic revision required.",
});
add({
  path: api + "/admin/events/{id}/publish",
  method: "post",
  name: "publishFreeEvent",
  tag: "Event operations",
  staff: true,
  input: "EventRevision",
  response: ref("Ok"),
  errors: [409],
  description:
    publisherNote +
    " Only valid future free drafts; locks revision and records audit.",
});
add({
  path: api + "/admin/events/{id}/cancel",
  method: "post",
  name: "cancelPublishedEvent",
  tag: "Event operations",
  staff: true,
  input: "CancelEventInput",
  response: ref("Ok"),
  errors: [404, 409],
  description:
    publisherNote +
    " Locks event with RSVP/cancellation operations. Sets cancellation reason and inserts deduplicated attendee notices plus durable mail jobs transactionally. Repeated cancellation returns success without new notifications.",
});
add({
  path: api + "/admin/event-delivery",
  method: "get",
  name: "eventMailDelivery",
  tag: "Event operations",
  staff: true,
  response: object({
    jobs: array(
      object({
        id,
        attempts: integer,
        sent_at: nullable(date),
        failed_at: nullable(date),
        event_id: id,
        title: str,
      }),
    ),
  }),
  description:
    publisherNote +
    " Latest 100 delivery jobs; sent means transport accepted, not recipient read.",
});
add({
  path: api + "/admin/event-delivery/{id}/retry",
  method: "post",
  name: "retryEventNotification",
  tag: "Event operations",
  staff: true,
  response: ref("Ok"),
  errors: [409],
  description:
    publisherNote + " Explicit audited retry only for exhausted, unsent jobs.",
});
add({
  path: api + "/notifications",
  method: "get",
  name: "listNotifications",
  tag: "Notifications",
  response: object({ notifications: array(notification) }),
  description: "Latest 100 notices belonging to current account.",
});
add({
  path: api + "/notifications/{id}/read",
  method: "post",
  name: "markNotificationRead",
  tag: "Notifications",
  response: ref("Ok"),
  description: "Idempotent, owner-scoped read receipt.",
});
const legacyReview = paths[api + "/admin/photos/{id}"].post as Record<
  string,
  unknown
>;
legacyReview.deprecated = true;
legacyReview.description =
  "Legacy user-ID review is disabled (409 REVIEW_CHANGED). Refresh queue and use /admin/photo-reviews/{photoId}.";
delete legacyReview.requestBody;
const legacyResponses = legacyReview.responses as Record<string, unknown>;
delete legacyResponses["200"];
legacyResponses["409"] = {
  description: "Review endpoint changed",
  content: json(ref("Error")),
};
const eventSchema = schemas.Event as {
  properties: Record<string, Schema>;
  required: string[];
};
Object.assign(eventSchema.properties, {
  status: { enum: ["draft", "published", "cancelled", "completed"] },
  timezone: str,
  created_by: nullable(id),
  cancelled_at: nullable(date),
  cancellation_reason: nullable(str),
  revision: integer,
  rsvp_cancelled_at: nullable(date),
});
// Draft writes return the event row; computed attendee fields appear only on reads.
eventSchema.required = eventSchema.required.filter(
  (key) => !["attendees", "attending"].includes(key),
);
(paths[api + "/events"].get as Record<string, unknown>).description =
  "Upcoming published events plus current user's historical/cancelled RSVP plans. No drafts. Counts exclude cancelled RSVPs; includes timezone and RSVP cancellation timestamp.";
(
  paths[api + "/events/{id}/rsvp"].delete as Record<string, unknown>
).description =
  "Locks event and marks own RSVP cancelled once; retains history and releases capacity. Rejoining eligible events reactivates the same reservation.";
add({
  path: api + "/me/details",
  method: "patch",
  name: "updateProfileDetails",
  tag: "Profile",
  input: "ProfileDetailsInput",
  response: ref("UserResponse"),
  errors: [400, 403, 409],
  description:
    "Update own username, custom gender description, connection goals, languages, and platform-specific HTTPS social links. Links do not imply ownership verification.",
});
const searchPerson = object({
  id,
  display_name: str,
  city: str,
  interests: array(str),
  role: publicProperties.role,
});
const searchEvent = object({
  id,
  title: str,
  description: str,
  category: str,
  city: str,
  starts_at: date,
  image_url: nullable(str),
  price_inr: integer,
});
for (const isPublic of [false, true])
  add({
    path: api + (isPublic ? "/public/search" : "/search"),
    method: "get",
    name: isPublic ? "publicSearch" : "memberSearch",
    tag: "Search",
    public: isPublic,
    verified: !isPublic,
    response: object({
      people: array(isPublic ? searchPerson : ref("PublicPerson")),
      events: array(searchEvent),
      next_people_cursor: nullable(id),
      next_events_cursor: nullable(id),
    }),
    parameters: [
      {
        ...query("q", { type: "string", minLength: 2, maxLength: 100 }),
        required: true,
      },
      query("type", {
        enum: ["all", "people", "creators", "events", "experiences"],
        default: "all",
      }),
      query("cursor", id),
    ],
    description:
      "20 results per section. Use type=people/creators with next_people_cursor or type=events with next_events_cursor. Public profiles omit private details and media. Member search enforces mutual gender preferences and blocking. Search limited to 30 requests per minute per IP.",
  });
const discoveryOperation = paths[api + "/people"].get as {
  parameters: unknown[];
};
discoveryOperation.parameters.push(
  query("gender", {
    enum: ["everyone", "woman", "man", "nonbinary", "custom"],
  }),
  query("interest", { type: "string", maxLength: 30 }),
  query("has_photos", { enum: ["true", "false"] }),
  query("following", { enum: ["true", "false"] }),
);
historyOperation.parameters.push(
  query("q", { type: "string", maxLength: 100 }),
);
historyOperation.description +=
  " Optional q searches message text across the authorized conversation with the same cursor pagination.";
const document = {
  openapi: "3.1.0",
  info: {
    title: "Flingtopia implemented Release 1 baseline",
    version: "0.1.0",
    description:
      "Documents actual implemented behavior, not all planned Release 1 features. Cookies are HttpOnly, SameSite=Lax, Secure in production. Unsafe methods require exact Origin. Shared database /api limiter 180/min per IP; auth entry limiter 10/15min per IP; login 10/15min per normalized email; staff MFA 6/5min per account; photo uploads 6/15min per account. Some 404 and rate-limit errors omit request_id. Request schemas are generated from shared runtime Zod validation; unknown object properties are stripped. Recovery and onboarding are implemented; no payment, live or KYC endpoints are claimed.",
  },
  servers: [{ url: "/", description: "Same-origin deployment" }],
  paths,
  components: {
    securitySchemes: {
      accessCookie: { type: "apiKey", in: "cookie", name: "ft_access" },
      refreshCookie: { type: "apiKey", in: "cookie", name: "ft_refresh" },
    },
    schemas,
  },
};
await writeFile(
  new URL("../docs/openapi.json", import.meta.url),
  JSON.stringify(document, null, 2) + "\n",
);
console.log(
  `Wrote OpenAPI: ${Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0)} operations.`,
);
