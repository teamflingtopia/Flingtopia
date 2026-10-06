import { verificationSchema } from "../../shared/validation.ts";
import { loginSchema } from "../../shared/validation.ts";
import { registerSchema } from "../../shared/validation.ts";

import { z } from "zod";
import bcrypt from "bcryptjs";

import { randomUUID } from "node:crypto";

import { hash, fail, email, password, privateUser, age } from "../domain.mjs";
export function registerAuth(app, context) {
  const {
    db,
    config,
    authLimit,
    accountLimit,
    authenticated,
    one,
    audit,
    issueSession,
    sendVerification,
    getCookies,
    cookieOpts,
  } = context;
  app.post("/api/v1/auth/register", authLimit, async (req, res) => {
    const input = registerSchema.parse(req.body);
    if (age(input.dob) < 18 || age(input.dob) > 120)
      throw fail(400, "Flingtopia is for adults aged 18 and over.");
    if (Buffer.byteLength(input.password, "utf8") > 72)
      throw fail(400, "Password must fit within 72 UTF-8 bytes.");
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await db.transaction(async (tx) => {
      const user = await one(
        "INSERT INTO users(id,email,username,password_hash,display_name,dob,gender,city) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          randomUUID(),
          input.email,
          input.username,
          passwordHash,
          input.display_name,
          input.dob,
          input.gender,
          input.city,
        ],
        tx,
      );
      await tx.query(
        "INSERT INTO user_consents(user_id,kind,version) VALUES($1,$2,$3)",
        [user.id, "community", input.consent_version],
      );
      await audit(tx, user.id, "account_registered", user.id, {
        terms_version: input.consent_version,
      });
      return user;
    });
    await issueSession(user, res);
    res
      .status(201)
      .json({ user: privateUser(user), ...(await sendVerification(user)) });
  });
  app.post("/api/v1/auth/login", authLimit, accountLimit, async (req, res) => {
    const b = loginSchema.parse(req.body);
    const user = await one("SELECT * FROM users WHERE email=$1", [b.email]);
    const valid = await bcrypt.compare(
      b.password,
      user?.password_hash || config.dummyHash,
    );
    if (!user || !valid || user.status !== "active")
      throw fail(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    await db.transaction(async (tx) => {
      const locked = await one(
        "SELECT * FROM users WHERE id=$1 FOR UPDATE",
        [user.id],
        tx,
      );
      if (
        locked.status !== "active" ||
        locked.password_hash !== user.password_hash
      )
        throw fail(
          401,
          "Email or password is incorrect.",
          "INVALID_CREDENTIALS",
        );
      await issueSession(locked, res, undefined, tx);
      await audit(tx, user.id, "login", user.id);
    });
    res.json({ user: privateUser(user) });
  });
  app.post("/api/v1/auth/demo", authLimit, async (req, res) => {
    if (!config.demo) throw fail(404, "Not found.", "NOT_FOUND");
    const as = z
      .enum(["member", "moderator"])
      .default("member")
      .parse(req.body.as);
    const u = await one("SELECT * FROM users WHERE email=$1", [
      as === "moderator"
        ? "moderator@demo.flingtopia.local"
        : "aarav@demo.flingtopia.local",
    ]);
    if (!u || u.status !== "active")
      throw fail(404, "Demo account unavailable.");
    await issueSession(u, res);
    res.json({ user: privateUser(u) });
  });
  app.post("/api/v1/auth/refresh", async (req, res) => {
    const token = getCookies(req).ft_refresh;
    if (!token) throw fail(401, "Session expired.", "UNAUTHENTICATED");
    const result = await db.transaction(async (tx) => {
      const candidate = await one(
        "SELECT user_id FROM refresh_sessions WHERE token_hash=$1",
        [hash(token)],
        tx,
      );
      if (!candidate) return false;
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        candidate.user_id,
      ]);
      const s = await one(
        "SELECT * FROM refresh_sessions WHERE token_hash=$1 FOR UPDATE",
        [hash(token)],
        tx,
      );
      if (!s) return false;
      if (s.revoked_at) {
        await tx.query(
          "UPDATE refresh_sessions SET revoked_at=now() WHERE family_id=$1",
          [s.family_id],
        );
        return false;
      }
      if (new Date(s.expires_at) < new Date()) return false;
      const user = await one(
        "SELECT * FROM users WHERE id=$1 AND status='active'",
        [s.user_id],
        tx,
      );
      if (!user) return false;
      await tx.query(
        "UPDATE refresh_sessions SET revoked_at=now() WHERE id=$1",
        [s.id],
      );
      await issueSession(user, res, s.family_id, tx);
      return true;
    });
    if (!result)
      throw fail(
        401,
        "Session expired. Please sign in again.",
        "UNAUTHENTICATED",
      );
    res.json({ ok: true });
  });
  app.post("/api/v1/auth/logout", async (req, res) => {
    const token = getCookies(req).ft_refresh;
    if (token)
      await db.query(
        "UPDATE refresh_sessions SET revoked_at=now() WHERE family_id=(SELECT family_id FROM refresh_sessions WHERE token_hash=$1)",
        [hash(token)],
      );
    res.setHeader("Set-Cookie", [
      `ft_access=; ${cookieOpts}Max-Age=0`,
      `ft_refresh=; ${cookieOpts}Max-Age=0`,
    ]);
    res.json({ ok: true });
  });
  app.post("/api/v1/auth/verify", authLimit, async (req, res) => {
    const { token } = verificationSchema.parse(req.body);
    await db.transaction(async (tx) => {
      const t = await one(
        "SELECT * FROM email_tokens WHERE token_hash=$1 FOR UPDATE",
        [hash(token)],
        tx,
      );
      if (!t || t.consumed_at || new Date(t.expires_at) < new Date())
        throw fail(400, "This link has expired or has already been used.");
      await tx.query(
        "UPDATE email_tokens SET consumed_at=now() WHERE user_id=$1",
        [t.user_id],
      );
      await tx.query("UPDATE users SET email_verified=true WHERE id=$1", [
        t.user_id,
      ]);
      await audit(tx, t.user_id, "email_verified", t.user_id);
    });
    res.json({ ok: true });
  });
  app.post(
    "/api/v1/auth/resend-verification",
    authLimit,
    authenticated,
    async (req, res) => {
      if (req.user.email_verified) return res.json({ ok: true });
      res.json(await sendVerification(req.user));
    },
  );
}
