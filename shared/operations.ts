import { z } from "zod";
export const eventInput = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(20).max(3000),
  category: z.string().trim().min(2).max(50),
  city: z.string().trim().min(2).max(100),
  venue: z.string().trim().min(3).max(200),
  starts_at: z.iso.datetime({ offset: true }),
  timezone: z
    .string()
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Use a valid IANA time zone."),
  capacity: z.number().int().min(1).max(10000),
});
export const eventRevision = z.object({
  revision: z.number().int().positive(),
});
export const cancelEventInput = eventRevision.extend({
  reason: z.string().trim().min(10).max(1000),
});
export const accountRequestInput = z.object({
  password: z.string().min(1).max(256),
});
