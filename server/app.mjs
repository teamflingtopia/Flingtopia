import { sharedLimit, registerStaffSecurity } from "./security.mjs";
import { registerPhotos } from "./photos.mjs";
import { registerEventOperations } from "./event-operations.mjs";
import { registerAccountRequests } from "./account-requests.mjs";
import { registerRecovery } from "./recovery.mjs";
import { policies } from "../shared/policies.ts";
import express from "express";
import helmet from "helmet";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import multer from "multer";
import sharp from "sharp";
import { createMailTransport } from "./mail.mjs";
import { timingSafeEqual } from "node:crypto";

import { hash, fail, cleanUser, privateUser, age } from "./domain.mjs";
export { hash, age } from "./domain.mjs";
import { registerAuth } from "./routes/auth.mjs";
import { registerSocialAuth, socialProviders } from "./social-auth.mjs";
import { registerProfiles } from "./routes/profiles.mjs";
import { registerDiscovery } from "./routes/discovery.mjs";
import { registerMessages } from "./routes/messages.mjs";
import { registerEvents } from "./routes/events.mjs";
import { registerModeration } from "./routes/moderation.mjs";
export function createApp(db, config) {
  const app = express();
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");
  if (config.staging) {
    if (config.stagingPublicAccess && config.emailDisabled)
      throw new Error("Public staging requires email to be enabled.");
    app.use((req, res, next) => {
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.set("Cache-Control", "private, no-store");
      next();
    });
  }
  if (config.staging && !config.stagingPublicAccess) {
    if (
      !config.stagingAccessPassword ||
      config.stagingAccessPassword.length < 24
    )
      throw new Error(
        "Staging requires a private access password of at least 24 characters",
      );
    const expected = createHash("sha256")
      .update(`staging:${config.stagingAccessPassword}`)
      .digest();
    app.use((req, res, next) => {
      if (req.path === "/api/v1/health" && req.method === "GET") return next();
      const header = req.get("authorization") || "";
      const supplied = header.startsWith("Basic ")
        ? Buffer.from(header.slice(6), "base64").toString()
        : "";
      if (
        timingSafeEqual(
          expected,
          createHash("sha256").update(supplied).digest(),
        )
      )
        return next();
      res.set(
        "WWW-Authenticate",
        'Basic realm="Flingtopia staging", charset="UTF-8"',
      );
      res
        .status(401)
        .send("Private staging. Enter the staging access credentials.");
    });
  }
  const verificationMail = createMailTransport(config);
  const key = new TextEncoder().encode(config.secret);
  const cookieOpts = `HttpOnly; SameSite=Lax; Path=/; ${config.production ? "Secure; " : ""}`;
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: config.production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (_, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set("X-Request-ID", req.requestId);
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !(req.method === "POST" && req.path === "/api/v1/auth/social/apple/callback") &&
      req.get("origin") !== config.origin
    )
      return next(fail(403, "Request origin is not allowed.", "FORBIDDEN"));
    next();
  });
  app.use("/api", sharedLimit(db, config.secret, "api-ip", 180, 60));
  const authLimit = sharedLimit(db, config.secret, "auth-ip", 10, 900);
  const accountLimit = sharedLimit(
    db,
    config.secret,
    "login-account",
    10,
    900,
    (req) =>
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase().slice(0, 254)
        : "invalid",
  );
  const getCookies = (req) =>
    Object.fromEntries(
      (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim().split("="))
        .filter((x) => x.length === 2),
    );
  const one = async (s, p = [], executor = db) =>
    (await executor.query(s, p)).rows[0];
  const audit = async (tx, actor, action, target = null, metadata = {}) =>
    tx.query(
      "INSERT INTO audit_log(id,actor_id,action,target_id,metadata) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), actor, action, target, JSON.stringify(metadata)],
    );
  const setCookies = (res, access, refresh) =>
    res.setHeader("Set-Cookie", [
      `ft_access=${access}; ${cookieOpts}Max-Age=900`,
      `ft_refresh=${refresh}; ${cookieOpts}Max-Age=2592000`,
    ]);
  const sign = (id, family) =>
    new SignJWT({ sid: family })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(id)
      .setIssuer("flingtopia")
      .setAudience("flingtopia-web")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(key);
  async function issueSession(user, res, family = randomUUID(), tx = db) {
    const token = randomBytes(32).toString("hex");
    await tx.query(
      "INSERT INTO refresh_sessions(id,user_id,token_hash,family_id,expires_at) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        user.id,
        hash(token),
        family,
        new Date(Date.now() + 30 * 86400000),
      ],
    );
    setCookies(res, await sign(user.id, family), token);
  }
  const authenticated = async (req, res, next) => {
    try {
      const token = getCookies(req).ft_access;
      if (!token) throw 0;
      const { payload } = await jwtVerify(token, key, {
        issuer: "flingtopia",
        audience: "flingtopia-web",
        algorithms: ["HS256"],
      });
      const u = await one(
        "SELECT * FROM users WHERE id=$1 AND status='active' AND EXISTS(SELECT 1 FROM refresh_sessions WHERE user_id=users.id AND family_id=$2 AND revoked_at IS NULL AND expires_at>now())",
        [payload.sub, payload.sid],
      );
      if (!u) throw 0;
      req.user = u;
      req.sessionFamily = payload.sid;
      next();
    } catch {
      next(fail(401, "Please sign in to continue.", "UNAUTHENTICATED"));
    }
  };
  const verified = (req, res, next) =>
    req.user.email_verified
      ? req.user.onboarding_completed_at || req.user.is_demo
        ? next()
        : next(
            fail(
              403,
              "Complete your profile before connecting.",
              "ONBOARDING_REQUIRED",
            ),
          )
      : next(
          fail(
            403,
            "Verify your email before connecting with people.",
            "EMAIL_UNVERIFIED",
          ),
        );
  const staffVerified = async (req) =>
    !!(await one(
      "SELECT 1 FROM staff_stepups s JOIN staff_mfa m ON m.user_id=s.user_id WHERE s.user_id=$1 AND s.family_id=$2 AND s.verified_at>now()-interval '15 minutes' AND m.enabled_at IS NOT NULL",
      [req.user.id, req.sessionFamily],
    ));
  const staff = async (req, res, next) => {
    if (!req.user.staff_role)
      return next(fail(403, "Staff role required.", "FORBIDDEN"));
    if (!(await staffVerified(req)))
      return next(
        fail(
          403,
          "Verify your authenticator before using staff tools.",
          "MFA_REQUIRED",
        ),
      );
    next();
  };
  async function contactAllowed(tx, a, b) {
    return !(await one(
      "SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)",
      [a, b],
      tx,
    ));
  }
  async function lockPair(tx, a, b) {
    for (const id of [a, b].sort())
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [id]);
  }
  async function matchAccess(tx, user, id, lock = false) {
    if (
      !(await one(
        "SELECT id FROM users WHERE id=$1 AND status='active'",
        [user],
        tx,
      ))
    )
      throw fail(403, "Account access is unavailable.", "FORBIDDEN");
    const m = await one(
      `SELECT * FROM matches WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
      tx,
    );
    if (!m || !m.active || ![m.user_a, m.user_b].includes(user))
      throw fail(404, "This conversation is unavailable.", "NOT_FOUND");
    const other = m.user_a === user ? m.user_b : m.user_a;
    if (
      !(await contactAllowed(tx, user, other)) ||
      !(await one(
        "SELECT id FROM users WHERE id=$1 AND status='active'",
        [other],
        tx,
      ))
    )
      throw fail(403, "This conversation is no longer available.", "FORBIDDEN");
    return m;
  }
  async function sendVerification(user) {
    if (config.emailDisabled)
      return {
        email_sent: false,
        message:
          "Account saved. Email verification is unavailable in this staging environment. Your account remains unverified.",
      };
    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO email_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",
      [randomUUID(), user.id, hash(token), new Date(Date.now() + 600000)],
    );
    const link = `${config.origin}/?verify=${token}`;
    if (!verificationMail)
      return config.demo
        ? { development_verification_url: link }
        : {
            email_sent: false,
            message:
              "Your account is saved, but email delivery is not configured. Please contact support.",
          };
    try {
      await verificationMail.sendMail({
        from: config.mailFrom,
        to: user.email,
        subject: "Verify your Flingtopia email",
        text: `Verify your email within 10 minutes: ${link}`,
      });
      return { email_sent: true };
    } catch {
      return {
        email_sent: false,
        message:
          "Your account is saved, but email delivery failed. Please try resending.",
      };
    }
  }

  app.get("/api/v1/health", async (req, res) => {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  });
  app.get("/api/v1/config", (req, res) =>
    res.json({
      demo: config.demo,
      staging: !!config.staging,
      email_disabled: !!config.emailDisabled,
      social_providers: socialProviders(config),
      policies,
      operations: {
        event_publisher_roles: config.eventPublisherRoles || [],
        account_requests: !!config.accountRequests,
      },
      features: { payments: false, live: false, photo_review: true },
    }),
  );
  registerRecovery(app, { db, config, authLimit, one, audit, cookieOpts });
  const operations = {
    db,
    config,
    authenticated,
    verified,
    staff,
    staffVerified,
    one,
    audit,
    contactAllowed,
  };
  registerStaffSecurity(app, operations);
  registerPhotos(app, operations);
  registerEventOperations(app, operations);
  registerAccountRequests(app, operations);
  registerSocialAuth(app, { db, config, one, audit, issueSession, authLimit, getCookies, sendVerification });
  registerAuth(app, {
    accountLimit,
    db,
    config,
    authLimit,
    authenticated,
    one,
    audit,
    issueSession,
    sendVerification,
    getCookies,
    cookieOpts,
  });
  registerProfiles(app, {
    db,
    config,
    authenticated,
    verified,
    one,
    audit,
    contactAllowed,
  });
  registerDiscovery(app, {
    db,
    config,
    authenticated,
    verified,
    one,
    audit,
    contactAllowed,
    lockPair,
  });
  registerMessages(app, {
    db,
    authenticated,
    verified,
    one,
    audit,
    lockPair,
    matchAccess,
  });
  registerEvents(app, { db, config, authenticated, verified, one });
  registerModeration(app, { db, authenticated, staff, one, audit });
  app.use("/api", (req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } }),
  );
  app.use(express.static(config.distDir));
  app.get("/{*path}", (req, res, next) =>
    res.sendFile(resolve(config.distDir, "index.html"), (err) =>
      err
        ? next(
            fail(
              404,
              "Run pnpm dev for the development UI, or pnpm build before starting.",
            ),
          )
        : undefined,
    ),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = err.status || 500;
    let message =
      status === 500 ? "Something went wrong. Please try again." : err.message;
    let code = err.code || "INTERNAL_ERROR";
    if (err instanceof z.ZodError) {
      status = 400;
      message = err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" ");
      code = "VALIDATION_ERROR";
    }
    if (err.code === "23505") {
      status = 409;
      message = "That email or username is already in use.";
      code = "ALREADY_EXISTS";
    }
    if (err.code === "23503") {
      status = 404;
      message = "The requested record was not found.";
      code = "NOT_FOUND";
    }
    if (err instanceof multer.MulterError) {
      status = 400;
      message = "Choose one image under 5 MB.";
      code = "INVALID_UPLOAD";
    }
    if (status >= 500)
      console.error(
        JSON.stringify({
          request_id: req.requestId,
          code: err.code || "INTERNAL_ERROR",
          name: err.name,
        }),
      );
    res
      .status(status)
      .json({ error: { code, message, request_id: req.requestId } });
  });
  return app;
}
