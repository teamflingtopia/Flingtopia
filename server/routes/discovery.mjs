import { reportSchema } from "../../shared/validation.ts";
import { discoverySchema } from "../../shared/validation.ts";

import { randomUUID } from "node:crypto";

import { fail, uuid, cleanUser, age } from "../domain.mjs";
export function registerDiscovery(app, context) {
  const {
    db,
    config,
    authenticated,
    verified,
    one,
    audit,
    contactAllowed,
    lockPair,
  } = context;
  app.get("/api/v1/people", authenticated, verified, async (req, res) => {
    const b = discoverySchema.parse(req.query);
    if (b.min_age > b.max_age)
      throw fail(400, "Minimum age must not exceed maximum age.");
    const rows = (
      await db.query(
        `SELECT u.*,EXISTS(SELECT 1 FROM follows f WHERE f.user_id=$1 AND f.target_id=u.id) AS is_following FROM users u WHERE u.id<>$1 AND u.staff_role IS NULL AND u.status='active' AND u.profile_visible=true AND u.email_verified=true AND (u.onboarding_completed_at IS NOT NULL OR u.is_demo=true) AND (u.is_demo=false OR $2=true) AND (u.display_name ILIKE $3 OR u.username ILIKE $3 OR u.bio ILIKE $3 OR array_to_string(u.interests,', ') ILIKE $3) AND ($4='' OR lower(u.city)=lower($4)) AND ($5='all' OR u.role=$5 OR ($5='creator' AND u.role='influencer')) AND EXTRACT(YEAR FROM age(u.dob)) BETWEEN $6 AND $7 AND ($8='everyone' OR u.gender=$8) AND (u.looking_for='everyone' OR u.looking_for=$9) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=$1 AND b.target_id=u.id) OR (b.target_id=$1 AND b.user_id=u.id)) AND NOT EXISTS(SELECT 1 FROM passes p WHERE p.user_id=$1 AND p.target_id=u.id) AND NOT EXISTS(SELECT 1 FROM likes l WHERE l.user_id=$1 AND l.target_id=u.id) AND ($10::uuid IS NULL OR u.id>$10) ORDER BY u.id LIMIT 21`,
        [
          req.user.id,
          config.demo,
          `%${b.q}%`,
          b.city,
          b.role,
          b.min_age,
          b.max_age,
          req.user.looking_for,
          req.user.gender,
          b.cursor || null,
        ],
      )
    ).rows;
    res.json({
      people: rows
        .slice(0, 20)
        .map((u) => ({ ...cleanUser(u), is_following: u.is_following })),
      next_cursor: rows.length > 20 ? rows[19].id : null,
    });
  });
  app.get("/api/v1/people/:id", authenticated, verified, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const u = await one(
      "SELECT u.*,EXISTS(SELECT 1 FROM follows WHERE user_id=$1 AND target_id=u.id) AS is_following,EXISTS(SELECT 1 FROM likes WHERE user_id=$1 AND target_id=u.id) AS liked,(SELECT id FROM matches WHERE active=true AND ((user_a=$1 AND user_b=u.id) OR (user_b=$1 AND user_a=u.id))) AS match_id FROM users u WHERE u.id=$2 AND u.status='active' AND u.staff_role IS NULL AND u.profile_visible=true AND u.email_verified=true AND (u.onboarding_completed_at IS NOT NULL OR u.is_demo=true) AND (u.is_demo=false OR $3=true)",
      [req.user.id, id, config.demo],
    );
    if (!u || !(await contactAllowed(db, req.user.id, id)))
      throw fail(404, "This profile is unavailable.", "NOT_FOUND");
    const photos = (
      await db.query(
        "SELECT id,url FROM profile_photos WHERE user_id=$1 AND status='approved' ORDER BY created_at",
        [id],
      )
    ).rows;
    res.json({
      person: {
        ...cleanUser(u),
        photos,
        is_following: u.is_following,
        liked: u.liked,
        match_id: u.match_id,
      },
    });
  });
  app.post(
    "/api/v1/people/:id/like",
    authenticated,
    verified,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      if (id === req.user.id) throw fail(400, "Choose another person.");
      const result = await db.transaction(async (tx) => {
        await lockPair(tx, req.user.id, id);
        const target = await one(
          "SELECT * FROM users WHERE id=$1 AND status='active' AND profile_visible=true AND email_verified=true AND (onboarding_completed_at IS NOT NULL OR is_demo=true) AND staff_role IS NULL",
          [id],
          tx,
        );
        if (!target || !(await contactAllowed(tx, req.user.id, id)))
          throw fail(404, "Profile unavailable.", "NOT_FOUND");
        const existing = await one(
          "SELECT 1 FROM likes WHERE user_id=$1 AND target_id=$2",
          [req.user.id, id],
          tx,
        );
        const count = await one(
          "SELECT count(*)::int AS count FROM likes WHERE user_id=$1 AND created_at>=date_trunc('day',now())",
          [req.user.id],
          tx,
        );
        if (!existing && count.count >= 20)
          throw fail(
            429,
            "You have used your 20 likes today. Come back tomorrow.",
            "DAILY_LIMIT",
          );
        await tx.query(
          "INSERT INTO likes(user_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [req.user.id, id],
        );
        if (
          await one(
            "SELECT 1 FROM likes WHERE user_id=$1 AND target_id=$2",
            [id, req.user.id],
            tx,
          )
        ) {
          const [a, b] = [req.user.id, id].sort();
          const match = await one(
            "INSERT INTO matches(id,user_a,user_b) VALUES($1,$2,$3) ON CONFLICT(user_a,user_b) DO UPDATE SET active=true RETURNING id",
            [randomUUID(), a, b],
            tx,
          );
          return {
            matched: true,
            match_id: match.id,
            name: target.display_name,
          };
        }
        return { matched: false };
      });
      res.json(result);
    },
  );
  app.post("/api/v1/people/:id/pass", authenticated, async (req, res) => {
    const id = uuid.parse(req.params.id);
    if (
      !(await one(
        "SELECT id FROM users WHERE id=$1 AND status='active' AND profile_visible=true AND email_verified=true AND (onboarding_completed_at IS NOT NULL OR is_demo=true)",
        [id],
      )) ||
      !(await contactAllowed(db, req.user.id, id))
    )
      throw fail(404, "Profile unavailable.");
    await db.query(
      "INSERT INTO passes(user_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.user.id, id],
    );
    res.json({ ok: true });
  });
  app.post("/api/v1/people/reset-passes", authenticated, async (req, res) => {
    await db.query("DELETE FROM passes WHERE user_id=$1", [req.user.id]);
    res.json({ ok: true });
  });
  app.post(
    "/api/v1/people/:id/follow",
    authenticated,
    verified,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      const following = await db.transaction(async (tx) => {
        await lockPair(tx, req.user.id, id);
        const target = await one(
          "SELECT * FROM users WHERE id=$1 AND role IN ('creator','influencer') AND profile_visible=true AND status='active' AND email_verified=true AND (onboarding_completed_at IS NOT NULL OR is_demo=true) AND staff_role IS NULL",
          [id],
          tx,
        );
        if (
          !target ||
          id === req.user.id ||
          (target.is_demo && !config.demo) ||
          !(await contactAllowed(tx, req.user.id, id))
        )
          throw fail(404, "Creator unavailable.");
        const old = await tx.query(
          "DELETE FROM follows WHERE user_id=$1 AND target_id=$2 RETURNING user_id",
          [req.user.id, id],
        );
        if (!old.rows.length)
          await tx.query(
            "INSERT INTO follows(user_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [req.user.id, id],
          );
        return !old.rows.length;
      });
      res.json({ following });
    },
  );
  app.post("/api/v1/people/:id/block", authenticated, async (req, res) => {
    const id = uuid.parse(req.params.id);
    if (
      id === req.user.id ||
      !(await one("SELECT id FROM users WHERE id=$1", [id]))
    )
      throw fail(400, "Invalid profile.");
    await db.transaction(async (tx) => {
      await lockPair(tx, req.user.id, id);
      await tx.query(
        "INSERT INTO blocks(user_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [req.user.id, id],
      );
      await tx.query(
        "UPDATE matches SET active=false WHERE (user_a=$1 AND user_b=$2) OR (user_a=$2 AND user_b=$1)",
        [req.user.id, id],
      );
      await tx.query(
        "DELETE FROM likes WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)",
        [req.user.id, id],
      );
      await tx.query(
        "DELETE FROM follows WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)",
        [req.user.id, id],
      );
      await audit(tx, req.user.id, "user_blocked", id);
    });
    res.json({ ok: true });
  });
  app.get("/api/v1/blocks", authenticated, async (req, res) => {
    res.json({
      people: (
        await db.query(
          "SELECT u.id,u.display_name FROM users u JOIN blocks b ON b.target_id=u.id WHERE b.user_id=$1",
          [req.user.id],
        )
      ).rows,
    });
  });
  app.delete("/api/v1/blocks/:id", authenticated, async (req, res) => {
    await db.query("DELETE FROM blocks WHERE user_id=$1 AND target_id=$2", [
      req.user.id,
      uuid.parse(req.params.id),
    ]);
    res.json({ ok: true });
  });
  app.get("/api/v1/me/reports", authenticated, async (req, res) =>
    res.json({
      reports: (
        await db.query(
          "SELECT id,category,status,created_at FROM reports WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 100",
          [req.user.id],
        )
      ).rows,
    }),
  );
  app.post("/api/v1/reports", authenticated, async (req, res) => {
    const b = reportSchema.parse(req.body);
    if (
      b.target_id === req.user.id ||
      !(await one("SELECT id FROM users WHERE id=$1", [b.target_id]))
    )
      throw fail(400, "Invalid profile.");
    const r = await one(
      "INSERT INTO reports(id,reporter_id,target_id,category,details) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [randomUUID(), req.user.id, b.target_id, b.category, b.details],
    );
    res.status(201).json(r);
  });
}
