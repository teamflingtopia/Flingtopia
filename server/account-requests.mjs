import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { accountRequestInput } from "../shared/operations.ts";
import { fail } from "./domain.mjs";
import { sharedLimit } from "./security.mjs";
export function registerAccountRequests(
  app,
  { db, config, authenticated, one, audit },
) {
  const enabled = (req, res, next) =>
    config.accountRequests
      ? next()
      : next(
          fail(
            409,
            "Account-request workflow is awaiting policy approval.",
            "POLICY_PENDING",
          ),
        );
  const limit = sharedLimit(
    db,
    config.secret,
    "account-requests",
    5,
    900,
    (req) => req.user.id,
  );
  async function reauth(req) {
    if (!req.user.password_hash)
      throw fail(
        403,
        "Use Forgot password to set an account password before this sensitive action.",
        "PASSWORD_REQUIRED",
      );
    const { password } = accountRequestInput.parse(req.body);
    if (!(await bcrypt.compare(password, req.user.password_hash)))
      throw fail(403, "Confirm your current password.", "REAUTH_REQUIRED");
  }
  async function lockAuthenticatedAccount(tx, req) {
    const current = await one(
      "SELECT password_hash,status FROM users WHERE id=$1 FOR UPDATE",
      [req.user.id],
      tx,
    );
    if (
      !current ||
      current.status !== "active" ||
      current.password_hash !== req.user.password_hash
    )
      throw fail(
        403,
        "Sign in again and confirm your current password.",
        "REAUTH_REQUIRED",
      );
  }
  app.get(
    "/api/v1/me/account-requests",
    authenticated,
    enabled,
    async (req, res) =>
      res.json({
        requests: (
          await db.query(
            "SELECT id,kind,status,created_at,updated_at FROM account_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
            [req.user.id],
          )
        ).rows,
      }),
  );
  app.post(
    "/api/v1/me/export",
    authenticated,
    enabled,
    limit,
    async (req, res) => {
      await reauth(req);
      const data = await db.transaction(async (tx) => {
        await lockAuthenticatedAccount(tx, req);
        const user = await one(
          "SELECT id,email,username,display_name,dob,gender,custom_gender,connection_goals,languages,social_links,looking_for,city,bio,interests,role,profile_visible,email_verified,created_at FROM users WHERE id=$1 FOR UPDATE",
          [req.user.id],
          tx,
        );
        const read = async (sql) => (await tx.query(sql, [req.user.id])).rows;
        const result = {
          generated_at: new Date().toISOString(),
          profile: user,
          consents: await read(
            "SELECT kind,version,accepted_at FROM user_consents WHERE user_id=$1",
          ),
          photos: await read(
            "SELECT id,url,status,reason,created_at FROM profile_photos WHERE user_id=$1 AND status<>'removed'",
          ),
          sent_messages: await read(
            "SELECT id,match_id,body,created_at FROM messages WHERE sender_id=$1 ORDER BY created_at,id",
          ),
          rsvps: await read(
            "SELECT event_id,created_at,cancelled_at FROM rsvps WHERE user_id=$1",
          ),
          likes: await read(
            "SELECT target_id,created_at FROM likes WHERE user_id=$1",
          ),
          social_sign_ins: await read(
            "SELECT provider,created_at FROM social_identities WHERE user_id=$1",
          ),
          follows: await read("SELECT target_id FROM follows WHERE user_id=$1"),
          blocks: await read("SELECT target_id FROM blocks WHERE user_id=$1"),
          submitted_reports: await read(
            "SELECT id,target_id,category,details,status,created_at FROM reports WHERE reporter_id=$1",
          ),
          notes: [
            "This JSON export contains your profile, consent, photo metadata, sent messages and account activity. It excludes authentication secrets, other members' messages and staff-only review information. Photo files are managed separately in My profile.",
          ],
        };
        await tx.query(
          "INSERT INTO account_requests(id,user_id,kind,status) VALUES($1,$2,'export','exported')",
          [randomUUID(), req.user.id],
        );
        await audit(tx, req.user.id, "account_exported", req.user.id);
        return result;
      });
      res.set(
        "Content-Disposition",
        'attachment; filename="flingtopia-account.json"',
      );
      res.json(data);
    },
  );
  app.post(
    "/api/v1/me/deletion-request",
    authenticated,
    enabled,
    limit,
    async (req, res) => {
      await reauth(req);
      const request = await db.transaction(async (tx) => {
        await lockAuthenticatedAccount(tx, req);
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ]);
        const old = await one(
          "SELECT * FROM account_requests WHERE user_id=$1 AND kind='deletion' AND status='awaiting_policy'",
          [req.user.id],
          tx,
        );
        if (old) return old;
        const r = await one(
          "INSERT INTO account_requests(id,user_id,kind,status) VALUES($1,$2,'deletion','awaiting_policy') RETURNING *",
          [randomUUID(), req.user.id],
          tx,
        );
        await audit(tx, req.user.id, "deletion_requested", r.id);
        return r;
      });
      res.status(201).json({
        request,
        message:
          "Request recorded. Deletion processing and retention rules await approval; your account and data have not been deleted. You can hide your profile now or withdraw this request.",
      });
    },
  );
  app.delete(
    "/api/v1/me/deletion-request",
    authenticated,
    enabled,
    async (req, res) => {
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ]);
        await tx.query(
          "UPDATE account_requests SET status='withdrawn',updated_at=now() WHERE user_id=$1 AND kind='deletion' AND status='awaiting_policy'",
          [req.user.id],
        );
        await audit(tx, req.user.id, "deletion_request_withdrawn", req.user.id);
      });
      res.json({ ok: true });
    },
  );
}
