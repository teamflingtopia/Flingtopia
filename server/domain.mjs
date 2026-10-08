import { z } from "zod";
import { createHash } from "node:crypto";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const fail = (status, message, code = "VALIDATION_ERROR") =>
  Object.assign(new Error(message), { status, code });
export const cleanUser = (u) => ({
  id: u.id,
  display_name: u.display_name,
  username: u.username,
  age: age(u.dob),
  gender: u.gender,
  looking_for: u.looking_for,
  city: u.city,
  bio: u.bio,
  interests: u.interests,
  role: u.role,
  avatar_url: u.avatar_url,
  identity_verified: u.identity_verified,
  is_demo: u.is_demo,
});
export const privateUser = (u) => ({
  ...cleanUser(u),
  email: u.email,
  email_verified: u.email_verified,
  staff_role: u.staff_role,
  profile_visible: u.profile_visible,
  pending_avatar: !!u.pending_avatar,
  onboarding_completed: !!u.onboarding_completed_at,
  onboarding_draft: u.onboarding_draft || {},
  needs_demographics: !u.dob || !u.gender,
  has_password: !!u.password_hash,
  adult_eligibility: u.dob ? "self_declared" : "unknown",
});
export function age(dob) {
  if (!dob) return null;
  const b = new Date(dob),
    n = new Date();
  return (
    n.getUTCFullYear() -
    b.getUTCFullYear() -
    (n.getUTCMonth() < b.getUTCMonth() ||
    (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())
      ? 1
      : 0)
  );
}
export { uuid, email, password, profileSchema } from "../shared/validation.ts";
