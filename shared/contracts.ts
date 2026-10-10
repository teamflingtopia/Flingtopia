/** Wire types for the existing /api/v1 API. Database rows stay server-side. */
export type PersonalRole = "user" | "creator" | "influencer";
export type Gender = "woman" | "man" | "nonbinary" | "custom";
export interface PublicPerson {
  id: string;
  display_name: string;
  username: string;
  age: number | null;
  gender: Gender | null;
  looking_for: Gender | "everyone";
  city: string;
  bio: string;
  interests: string[];
  custom_gender: string;
  connection_goals: string[];
  languages: string[];
  social_links: Partial<Record<"instagram" | "x" | "tiktok", string>>;
  role: PersonalRole;
  avatar_url: string | null;
  identity_verified: boolean;
  is_demo: boolean;
}
export interface PrivateUser extends PublicPerson {
  email: string;
  email_verified: boolean;
  staff_role: "moderator" | "admin" | null;
  profile_visible: boolean;
  pending_avatar: boolean;
  onboarding_completed: boolean;
  onboarding_draft: Partial<import("./validation.ts").ProfileRequest> & {
    step?: "profile" | "preferences" | "review";
  };
  needs_demographics: boolean;
  has_password: boolean;
  adult_eligibility: "self_declared" | "unknown";
}
export type {
  ProfileRequest as ProfileInput,
  RegisterRequest as RegisterInput,
} from "./validation.ts";
export interface VerificationDelivery {
  development_verification_url?: string;
  email_sent?: boolean;
  message?: string;
}
export interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  cursor_time?: string;
}
export interface Conversation {
  id: string;
  person: PublicPerson;
  last_message: string | null;
  unread: number;
}
export interface SearchResults {
  people: PublicPerson[];
  events: Pick<
    FreeEvent,
    | "id"
    | "title"
    | "description"
    | "category"
    | "city"
    | "starts_at"
    | "image_url"
    | "price_inr"
  >[];
  next_people_cursor: string | null;
  next_events_cursor: string | null;
}
export interface FreeEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  city: string;
  venue: string;
  starts_at: string;
  image_url: string | null;
  capacity: number;
  price_inr: number;
  status: "published" | "cancelled" | "completed";
  timezone: string;
  rsvp_cancelled_at: string | null;
  cancellation_reason: string | null;
  is_demo: boolean;
  attendees: number;
  attending: boolean;
}
export interface ApiErrorBody {
  error: { code: string; message: string; request_id?: string };
}
export interface ReadResponses {
  "/health": { status: "ok" };
  "/config": {
    auth_enabled: boolean;
    demo: boolean;
    operations: {
      event_publisher_roles: ("admin" | "moderator")[];
      account_requests: boolean;
    };
    features: { payments: false; live: false; photo_review: true };
  };
  "/me": { user: PrivateUser };
  "/events": { events: FreeEvent[] };
  "/conversations": { conversations: Conversation[] };
  "/blocks": { people: Pick<PublicPerson, "id" | "display_name">[] };
}
