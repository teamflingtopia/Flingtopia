import { z } from "zod";
import { sharedLimit } from "../security.mjs";
import { cleanUser } from "../domain.mjs";

const searchInput = z.object({
  q: z.string().trim().min(2).max(100),
  type: z
    .enum(["all", "people", "creators", "events", "experiences"])
    .default("all"),
  cursor: z.string().uuid().optional(),
});
const pattern = (value) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

export function registerSearch(app, { db, config, authenticated, verified }) {
  const limit = sharedLimit(db, config.secret, "search-ip", 30, 60);
  const handler = (publicOnly) => async (req, res) => {
    const b = searchInput.parse(req.query);
    const viewer = publicOnly ? null : req.user;
    const term = pattern(b.q);
    let people = [],
      events = [];
    if (["all", "people", "creators"].includes(b.type)) {
      people = (
        await db.query(
          `SELECT u.* FROM users u
        WHERE u.status='active' AND u.staff_role IS NULL AND u.profile_visible=true
        AND u.email_verified=true AND (u.onboarding_completed_at IS NOT NULL OR u.is_demo=true)
        AND (u.is_demo=false OR $1=true) AND u.dob<=CURRENT_DATE-INTERVAL '18 years'
        AND (u.display_name ILIKE $2 OR u.username ILIKE $2 OR u.city ILIKE $2 OR array_to_string(u.interests,', ') ILIKE $2)
        AND ($3=false OR u.role IN ('creator','influencer'))
        AND ($4::uuid IS NULL OR (u.id<>$4 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE
          (b.user_id=$4 AND b.target_id=u.id) OR (b.target_id=$4 AND b.user_id=u.id))))
        AND ($5='everyone' OR u.gender=$5)
        AND ($4::uuid IS NULL OR u.looking_for='everyone' OR u.looking_for=$6)
        AND ($7::uuid IS NULL OR u.id>$7) ORDER BY u.id LIMIT 21`,
          [
            !!config.demo,
            term,
            b.type === "creators",
            viewer?.id || null,
            viewer?.looking_for || "everyone",
            viewer?.gender || "",
            b.cursor || null,
          ],
        )
      ).rows;
    }
    if (["all", "events", "experiences"].includes(b.type)) {
      events = (
        await db.query(
          `SELECT id,title,description,category,city,starts_at,image_url,price_inr FROM events
        WHERE status='published' AND starts_at>now() AND (is_demo=false OR $1=true)
        AND (title ILIKE $2 OR city ILIKE $2 OR category ILIKE $2 OR description ILIKE $2)
        AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 21`,
          [!!config.demo, term, b.cursor || null],
        )
      ).rows;
    }
    res.json({
      people: people
        .slice(0, 20)
        .map((u) =>
          publicOnly
            ? {
                id: u.id,
                display_name: u.display_name,
                city: u.city,
                interests: u.interests,
                role: u.role,
              }
            : cleanUser(u),
        ),
      events: events.slice(0, 20),
      next_people_cursor: people.length > 20 ? people[19].id : null,
      next_events_cursor: events.length > 20 ? events[19].id : null,
    });
  };
  app.get("/api/v1/search", authenticated, verified, limit, handler(false));
  app.get("/api/v1/public/search", limit, handler(true));
}
