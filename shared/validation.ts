import { z } from "zod";
import { policies } from "./policies.ts";
export const uuid = z.string().uuid();
export const email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(72);
export const profileSchema = z.object({
  display_name: z.string().trim().min(2).max(40),
  city: z.string().trim().min(2).max(100),
  bio: z.string().trim().max(300),
  interests: z.array(z.string().trim().min(1).max(30)).max(10),
  looking_for: z.enum(["everyone", "woman", "man", "nonbinary", "custom"]),
  profile_visible: z.boolean(),
});
export const registerSchema = z.object({
  email,
  password,
  display_name: z.string().trim().min(2).max(40),
  username: z.string().regex(/^[a-z0-9_]{3,30}$/),
  dob: z.string().date(),
  gender: z.enum(["woman", "man", "nonbinary", "custom"]),
  city: z.string().trim().min(2).max(100),
  terms: z.literal(true),
  consent_version: z.literal(policies.community.version),
});
export const loginSchema = z.object({ email, password: z.string().max(256) });
export const verificationSchema = z.object({ token: z.string().length(64) });
export const recoverySchema = z.object({ email });
export const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password,
});
export const onboardingSchema = profileSchema.partial().extend({
  display_name: z.string().max(40).optional(),
  city: z.string().max(100).optional(),
  step: z.enum(["profile", "preferences", "review"]).optional(),
});
export const completionSchema = profileSchema.extend({
  terms: z.literal(true),
  consent_version: z.literal(policies.community.version),
});
export const creatorSchema = z.object({
  terms: z.literal(true),
  consent_version: z.literal(policies.creator.version),
});
export const discoverySchema = z.object({
  q: z.string().max(100).default(""),
  city: z.string().max(100).default(""),
  role: z.enum(["all", "creator", "influencer"]).default("all"),
  min_age: z.coerce.number().int().min(18).max(120).default(18),
  max_age: z.coerce.number().int().min(18).max(120).default(65),
  cursor: uuid.optional(),
});
export const reportSchema = z.object({
  target_id: uuid,
  category: z.enum([
    "harassment",
    "fake_profile",
    "underage",
    "explicit_content",
    "spam",
    "other",
  ]),
  details: z.string().trim().min(10).max(2000),
});
export const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  client_id: uuid,
});
export const photoReviewSchema = z.object({ approve: z.boolean() });
export const reportReviewSchema = z.object({
  resolution: z.string().trim().min(10).max(1000),
  suspend: z.boolean().default(false),
});
export type RegisterRequest = z.input<typeof registerSchema>;
export type ProfileRequest = z.input<typeof profileSchema>;
export type MessageRequest = z.input<typeof messageSchema>;
