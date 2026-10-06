import { randomUUID } from "node:crypto";

import { fail, uuid } from "../domain.mjs";
export function registerEvents(app, context) {
  const { db, config, authenticated, verified, one } = context;
  app.get("/api/v1/events", authenticated, verified, async (req, res) => {
    const rows = (
      await db.query(
        `SELECT e.*,(SELECT count(*)::int FROM rsvps WHERE event_id=e.id AND cancelled_at IS NULL) AS attendees,EXISTS(SELECT 1 FROM rsvps WHERE event_id=e.id AND user_id=$1 AND cancelled_at IS NULL) AS attending, (SELECT cancelled_at FROM rsvps WHERE event_id=e.id AND user_id=$1) AS rsvp_cancelled_at FROM events e WHERE e.status<>'draft' AND ((e.status='published' AND e.starts_at>now()) OR EXISTS(SELECT 1 FROM rsvps r WHERE r.event_id=e.id AND r.user_id=$1)) AND (e.is_demo=false OR $2=true) ORDER BY e.starts_at`,
        [req.user.id, config.demo],
      )
    ).rows;
    res.json({ events: rows });
  });
  app.get("/api/v1/events/:id", authenticated, verified, async (req, res) => {
    const event = await one(
      "SELECT e.*,(SELECT count(*)::int FROM rsvps WHERE event_id=e.id AND cancelled_at IS NULL) AS attendees,EXISTS(SELECT 1 FROM rsvps WHERE event_id=e.id AND user_id=$1 AND cancelled_at IS NULL) AS attending, (SELECT cancelled_at FROM rsvps WHERE event_id=e.id AND user_id=$1) AS rsvp_cancelled_at FROM events e WHERE e.id=$2 AND e.status<>'draft' AND (e.is_demo=false OR $3=true)",
      [req.user.id, uuid.parse(req.params.id), config.demo],
    );
    if (!event) throw fail(404, "This event is unavailable.", "NOT_FOUND");
    res.json({ event });
  });
  app.post(
    "/api/v1/events/:id/rsvp",
    authenticated,
    verified,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      const ticket = await db.transaction(async (tx) => {
        const actor = await one(
          "SELECT status,email_verified,onboarding_completed_at,is_demo FROM users WHERE id=$1 FOR NO KEY UPDATE",
          [req.user.id],
          tx,
        );
        if (
          actor.status !== "active" ||
          !actor.email_verified ||
          (!actor.onboarding_completed_at && !actor.is_demo)
        )
          throw fail(403, "Account is not eligible to RSVP.", "FORBIDDEN");
        const event = await one(
          "SELECT * FROM events WHERE id=$1 FOR UPDATE",
          [id],
          tx,
        );
        if (
          !event ||
          (event.is_demo && !config.demo) ||
          event.status !== "published" ||
          new Date(event.starts_at) <= new Date()
        )
          throw fail(404, "This event is unavailable.");
        if (event.price_inr !== 0)
          throw fail(
            409,
            "Paid ticket checkout is not available in this preview.",
            "NOT_AVAILABLE",
          );
        const old = await one(
          "SELECT * FROM rsvps WHERE event_id=$1 AND user_id=$2",
          [id, req.user.id],
          tx,
        );
        if (old && !old.cancelled_at) return old;
        const n = await one(
          "SELECT count(*)::int AS count FROM rsvps WHERE event_id=$1 AND cancelled_at IS NULL",
          [id],
          tx,
        );
        if (n.count >= event.capacity)
          throw fail(409, "This event has filled up.", "SOLD_OUT");
        return one(
          "INSERT INTO rsvps(id,user_id,event_id) VALUES($1,$2,$3) ON CONFLICT(user_id,event_id) DO UPDATE SET cancelled_at=NULL,created_at=now() RETURNING *",
          [randomUUID(), req.user.id, id],
          tx,
        );
      });
      res.status(201).json({ ticket });
    },
  );
  app.delete("/api/v1/events/:id/rsvp", authenticated, async (req, res) => {
    await db.transaction(async (tx) => {
      const id = uuid.parse(req.params.id);
      await tx.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [id]);
      await tx.query(
        "UPDATE rsvps SET cancelled_at=COALESCE(cancelled_at,now()) WHERE event_id=$1 AND user_id=$2",
        [id, req.user.id],
      );
    });
    res.json({ ok: true });
  });
}
