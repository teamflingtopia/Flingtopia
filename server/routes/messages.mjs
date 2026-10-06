import { messageSchema } from "../../shared/validation.ts";

import { z } from "zod";

import { randomUUID } from "node:crypto";

import { fail, uuid, cleanUser } from "../domain.mjs";
export function registerMessages(app, context) {
  const { db, authenticated, verified, one, audit, lockPair, matchAccess } =
    context;
  app.get(
    "/api/v1/conversations",
    authenticated,
    verified,
    async (req, res) => {
      const rows = (
        await db.query(
          `SELECT m.id AS match_id,m.created_at AS matched_at,u.*, (SELECT body FROM messages WHERE match_id=m.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_message, (SELECT count(*)::int FROM messages WHERE match_id=m.id AND sender_id<>$1 AND read_at IS NULL) AS unread FROM matches m JOIN users u ON u.id=CASE WHEN m.user_a=$1 THEN m.user_b ELSE m.user_a END WHERE (m.user_a=$1 OR m.user_b=$1) AND m.active=true AND u.status='active' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=$1 AND b.target_id=u.id) OR (b.target_id=$1 AND b.user_id=u.id)) ORDER BY m.created_at DESC`,
          [req.user.id],
        )
      ).rows;
      res.json({
        conversations: rows.map((u) => ({
          id: u.match_id,
          person: cleanUser(u),
          last_message: u.last_message,
          unread: u.unread,
        })),
      });
    },
  );
  app.get(
    "/api/v1/conversations/:id",
    authenticated,
    verified,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      const m = await matchAccess(db, req.user.id, id);
      const u = await one("SELECT * FROM users WHERE id=$1", [
        m.user_a === req.user.id ? m.user_b : m.user_a,
      ]);
      res.json({ conversation: { id, person: cleanUser(u) } });
    },
  );
  app.get(
    "/api/v1/conversations/:id/messages",
    authenticated,
    verified,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      await matchAccess(db, req.user.id, id);
      const before = req.query.before
        ? z.iso.datetime().parse(req.query.before)
        : null;
      const beforeId = req.query.before_id
        ? uuid.parse(req.query.before_id)
        : null;
      const rows = (
        await db.query(
          `SELECT id,sender_id,body,client_id,created_at,read_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM messages WHERE match_id=$1 AND ($2::timestamptz IS NULL OR created_at<$2 OR (created_at=$2 AND $3::uuid IS NOT NULL AND id<$3)) ORDER BY created_at DESC,id DESC LIMIT 101`,
          [id, before, beforeId],
        )
      ).rows;
      res.json({
        messages: rows.slice(0, 100).reverse(),
        has_more: rows.length > 100,
      });
    },
  );
  app.post(
    "/api/v1/conversations/:id/read",
    authenticated,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      await db.transaction(async (tx) => {
        await matchAccess(tx, req.user.id, id, true);
        await tx.query(
          "UPDATE messages SET read_at=now() WHERE match_id=$1 AND sender_id<>$2 AND read_at IS NULL",
          [id, req.user.id],
        );
      });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/v1/conversations/:id/messages",
    authenticated,
    verified,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      const b = messageSchema.parse(req.body);
      const msg = await db.transaction(async (tx) => {
        const pair = await one(
          "SELECT user_a,user_b FROM matches WHERE id=$1",
          [id],
          tx,
        );
        if (!pair || ![pair.user_a, pair.user_b].includes(req.user.id))
          throw fail(404, "Conversation unavailable.");
        await lockPair(tx, pair.user_a, pair.user_b);
        await matchAccess(tx, req.user.id, id, true);
        const existing = await one(
          `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM messages WHERE sender_id=$1 AND client_id=$2`,
          [req.user.id, b.client_id],
          tx,
        );
        if (existing) {
          if (existing.match_id !== id || existing.body !== b.body)
            throw fail(
              409,
              "This request was already used for a different message.",
            );
          return existing;
        }
        return one(
          `INSERT INTO messages(id,match_id,sender_id,body,client_id) VALUES($1,$2,$3,$4,$5) RETURNING *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time`,
          [randomUUID(), id, req.user.id, b.body, b.client_id],
          tx,
        );
      });
      res.status(201).json({ message: msg });
    },
  );
  app.post(
    "/api/v1/conversations/:id/unmatch",
    authenticated,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      await db.transaction(async (tx) => {
        const m = await matchAccess(tx, req.user.id, id, true);
        await tx.query("UPDATE matches SET active=false WHERE id=$1", [id]);
        await tx.query(
          "DELETE FROM likes WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)",
          [m.user_a, m.user_b],
        );
        await audit(tx, req.user.id, "unmatched", id);
      });
      res.json({ ok: true });
    },
  );
}
