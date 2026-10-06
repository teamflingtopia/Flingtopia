import { randomUUID } from "node:crypto";
import {
  eventInput,
  eventRevision,
  cancelEventInput,
} from "../shared/operations.ts";
import { fail, uuid } from "./domain.mjs";
export function registerEventOperations(
  app,
  { db, config, authenticated, staff, one, audit },
) {
  const publisher = (req, res, next) =>
    (config.eventPublisherRoles || []).includes(req.user.staff_role)
      ? next()
      : next(
          fail(
            403,
            "Event publishing permission is not enabled for this role.",
            "PUBLISHER_REQUIRED",
          ),
        );
  app.get(
    "/api/v1/admin/event-delivery",
    authenticated,
    staff,
    publisher,
    async (req, res) =>
      res.json({
        jobs: (
          await db.query(
            "SELECT m.id,m.attempts,m.sent_at,m.failed_at,n.event_id,e.title FROM notification_mail m JOIN notifications n ON n.id=m.notification_id JOIN events e ON e.id=n.event_id ORDER BY n.created_at DESC LIMIT 100",
          )
        ).rows,
      }),
  );
  app.post(
    "/api/v1/admin/event-delivery/:id/retry",
    authenticated,
    staff,
    publisher,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      await db.transaction(async (tx) => {
        const result = await tx.query(
          "UPDATE notification_mail SET failed_at=NULL,attempts=0,next_attempt_at=now(),lease_until=NULL,lease_id=NULL WHERE id=$1 AND failed_at IS NOT NULL AND sent_at IS NULL RETURNING id",
          [id],
        );
        if (!result.rows.length)
          throw fail(409, "This job is not awaiting a retry.");
        await audit(tx, req.user.id, "event_mail_retry", id);
      });
      res.json({ ok: true });
    },
  );
  app.get(
    "/api/v1/admin/events",
    authenticated,
    staff,
    publisher,
    async (req, res) =>
      res.json({
        events: (
          await db.query(
            "SELECT e.*,(SELECT count(*)::int FROM rsvps r WHERE r.event_id=e.id AND r.cancelled_at IS NULL) AS attendees FROM events e ORDER BY e.starts_at DESC LIMIT 200",
          )
        ).rows,
      }),
  );
  app.post(
    "/api/v1/admin/events",
    authenticated,
    staff,
    publisher,
    async (req, res) => {
      const b = eventInput.parse(req.body);
      if (new Date(b.starts_at) <= new Date())
        throw fail(400, "Choose a future start time.");
      const event = await db.transaction(async (tx) => {
        const e = await one(
          "INSERT INTO events(id,title,description,category,city,venue,starts_at,timezone,capacity,status,created_by,price_inr) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,0) RETURNING *",
          [
            randomUUID(),
            b.title,
            b.description,
            b.category,
            b.city,
            b.venue,
            b.starts_at,
            b.timezone,
            b.capacity,
            req.user.id,
          ],
          tx,
        );
        await audit(tx, req.user.id, "event_drafted", e.id);
        return e;
      });
      res.status(201).json({ event });
    },
  );
  app.patch(
    "/api/v1/admin/events/:id",
    authenticated,
    staff,
    publisher,
    async (req, res) => {
      const b = eventInput.merge(eventRevision).parse(req.body);
      const id = uuid.parse(req.params.id);
      const event = await db.transaction(async (tx) => {
        const e = await one(
          "SELECT * FROM events WHERE id=$1 FOR UPDATE",
          [id],
          tx,
        );
        if (!e || e.status !== "draft" || e.revision !== b.revision)
          throw fail(
            409,
            "Draft changed or was published. Refresh before editing.",
          );
        const updated = await one(
          "UPDATE events SET title=$1,description=$2,category=$3,city=$4,venue=$5,starts_at=$6,timezone=$7,capacity=$8,revision=revision+1 WHERE id=$9 RETURNING *",
          [
            b.title,
            b.description,
            b.category,
            b.city,
            b.venue,
            b.starts_at,
            b.timezone,
            b.capacity,
            id,
          ],
          tx,
        );
        await audit(tx, req.user.id, "event_draft_updated", id);
        return updated;
      });
      res.json({ event });
    },
  );
  app.post(
    "/api/v1/admin/events/:id/publish",
    authenticated,
    staff,
    publisher,
    async (req, res) => {
      const { revision } = eventRevision.parse(req.body),
        id = uuid.parse(req.params.id);
      await db.transaction(async (tx) => {
        const e = await one(
          "SELECT * FROM events WHERE id=$1 FOR UPDATE",
          [id],
          tx,
        );
        if (!e || e.status !== "draft" || e.revision !== revision)
          throw fail(409, "Draft changed. Refresh before publishing.");
        eventInput.parse({
          ...e,
          starts_at: new Date(e.starts_at).toISOString(),
        });
        if (e.price_inr !== 0 || new Date(e.starts_at) <= new Date())
          throw fail(400, "Only future free events can be published.");
        await tx.query(
          "UPDATE events SET status='published',revision=revision+1 WHERE id=$1",
          [id],
        );
        await audit(tx, req.user.id, "event_published", id);
      });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/v1/admin/events/:id/cancel",
    authenticated,
    staff,
    publisher,
    async (req, res) => {
      const b = cancelEventInput.parse(req.body),
        id = uuid.parse(req.params.id);
      await db.transaction(async (tx) => {
        const e = await one(
          "SELECT * FROM events WHERE id=$1 FOR UPDATE",
          [id],
          tx,
        );
        if (!e) throw fail(404, "Event unavailable.");
        if (e.status === "cancelled") return;
        if (
          e.revision !== b.revision ||
          e.status !== "published" ||
          new Date(e.starts_at) <= new Date()
        )
          throw fail(
            409,
            "Only an unchanged upcoming published event can be cancelled.",
          );
        await tx.query(
          "UPDATE events SET status='cancelled',cancelled_at=now(),cancellation_reason=$2,revision=revision+1 WHERE id=$1",
          [id, b.reason],
        );
        const attendees = (
          await tx.query(
            "SELECT user_id FROM rsvps WHERE event_id=$1 AND cancelled_at IS NULL",
            [id],
          )
        ).rows;
        for (const a of attendees) {
          const notification = await one(
            "INSERT INTO notifications(id,user_id,event_id,kind,message) VALUES($1,$2,$3,'event_cancelled',$4) ON CONFLICT(user_id,event_id,kind) DO NOTHING RETURNING id",
            [
              randomUUID(),
              a.user_id,
              id,
              `${e.title} was cancelled. ${b.reason}`,
            ],
            tx,
          );
          if (notification)
            await tx.query(
              "INSERT INTO notification_mail(id,notification_id) VALUES($1,$2)",
              [randomUUID(), notification.id],
            );
        }
        await audit(tx, req.user.id, "event_cancelled", id, {
          reason: b.reason,
          notifications: attendees.length,
        });
      });
      res.json({ ok: true });
    },
  );
  app.get("/api/v1/notifications", authenticated, async (req, res) =>
    res.json({
      notifications: (
        await db.query(
          "SELECT id,event_id,kind,message,created_at,read_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
          [req.user.id],
        )
      ).rows,
    }),
  );
  app.post(
    "/api/v1/notifications/:id/read",
    authenticated,
    async (req, res) => {
      await db.query(
        "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2",
        [uuid.parse(req.params.id), req.user.id],
      );
      res.json({ ok: true });
    },
  );
}
