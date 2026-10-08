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
const socialLink = (hosts: string[]) =>
  z
    .string()
    .trim()
    .max(500)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.port &&
          hosts.includes(url.hostname.toLowerCase())
        );
      } catch {
        return false;
      }
    }, "Use an HTTPS profile link for this social platform.");
export const profileDetailsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9_]{3,30}$/,
      "Use 3–30 lowercase letters, numbers, or underscores.",
    ),
  custom_gender: z.string().trim().max(60),
  connection_goals: z
    .array(z.enum(["casual", "friendship", "networking", "dating"]))
    .max(4),
  languages: z.array(z.string().trim().min(1).max(40)).max(10),
  social_links: z.object({
    instagram: socialLink(["instagram.com", "www.instagram.com"]),
    x: socialLink(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]),
    tiktok: socialLink(["tiktok.com", "www.tiktok.com"]),
  }),
});
export const verificationSchema = z.object({ token: z.string().length(64) });
export const recoverySchema = z.object({ email });
export const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password,
});
export const onboardingSchema = profileSchema.partial().extend({
  dob: z.union([z.string().date(), z.literal("")]).optional(),
  gender: z.enum(["", "woman", "man", "nonbinary", "custom"]).optional(),
  display_name: z.string().max(40).optional(),
  city: z.string().max(100).optional(),
  step: z.enum(["profile", "preferences", "review"]).optional(),
});
export const completionSchema = profileSchema.extend({
  dob: z.string().date().optional(),
  gender: z.enum(["woman", "man", "nonbinary", "custom"]).optional(),
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
  gender: z
    .enum(["everyone", "woman", "man", "nonbinary", "custom"])
    .default("everyone"),
  interest: z.string().trim().max(30).default(""),
  has_photos: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  following: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
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
