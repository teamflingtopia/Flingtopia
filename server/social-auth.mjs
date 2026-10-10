import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from "jose";
import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { email } from "../shared/validation.ts";
import { hash, fail, privateUser } from "./domain.mjs";
import { sharedLimit } from "./security.mjs";

const providers = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    keys: createRemoteJWKSet(
      new URL("https://www.googleapis.com/oauth2/v3/certs"),
    ),
  },
  apple: {
    authorize: "https://appleid.apple.com/auth/authorize",
    token: "https://appleid.apple.com/auth/token",
    issuer: "https://appleid.apple.com",
    keys: createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys")),
  },
};
const random = () => randomBytes(32).toString("base64url");
export function socialProviders(config) {
  return Object.keys(providers).filter((p) => {
    const c = config.social?.[p];
    return (
      c?.clientId &&
      (p === "google"
        ? c.clientSecret
        : c.teamId &&
          c.keyId &&
          c.privateKey &&
          config.origin.startsWith("https://"))
    );
  });
}
export function registerSocialAuth(
  app,
  {
    db,
    config,
    one,
    audit,
    issueSession,
    authLimit,
    getCookies,
    sendVerification,
  },
) {
  const cookieName = config.production ? "__Host-ft_social" : "ft_social";
  const cookie = (value, seconds = 600) =>
    `${cookieName}=${value}; Path=/; HttpOnly; Max-Age=${seconds}; SameSite=${config.production ? "None; Secure" : "Lax"}`;
  const browser = (req) => getCookies(req)[cookieName] || "";
  const callback = (p) => `${config.origin}/api/v1/auth/social/${p}/callback`;
  const enabled = (p) => socialProviders(config).includes(p);
  async function pending(req, tx = db) {
    const f = await one(
      "SELECT * FROM social_auth_flows WHERE browser_hash=$1 AND identity IS NOT NULL AND expires_at>now() FOR UPDATE",
      [hash(browser(req))],
      tx,
    );
    if (!f || !enabled(f.provider))
      throw fail(400, "Social sign-in expired. Please start again.");
    return f;
  }
  app.get(
    "/api/v1/auth/social/:provider/start",
    authLimit,
    async (req, res) => {
      const p = req.params.provider;
      if (!enabled(p))
        throw fail(404, "This sign-in provider is not configured.");
      const state = random(),
        binding = random(),
        nonce = random(),
        verifier = random();
      await db.query(
        "DELETE FROM social_auth_flows WHERE expires_at<now() OR browser_hash=$1",
        [hash(browser(req))],
      );
      await db.query(
        "INSERT INTO social_auth_flows(state_hash,browser_hash,provider,nonce,verifier,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          hash(state),
          hash(binding),
          p,
          nonce,
          verifier,
          new Date(Date.now() + 600000),
        ],
      );
      const url = new URL(providers[p].authorize);
      url.search = new URLSearchParams({
        client_id: config.social[p].clientId,
        redirect_uri: callback(p),
        response_type: "code",
        scope: p === "google" ? "openid email profile" : "name email",
        state,
        nonce,
        ...(p === "google"
          ? {
              code_challenge: createHash("sha256")
                .update(verifier)
                .digest("base64url"),
              code_challenge_method: "S256",
              prompt: "select_account",
            }
          : { response_mode: "form_post" }),
      }).toString();
      res.append("Set-Cookie", cookie(binding));
      res.redirect(303, url.href);
    },
  );
  async function finish(req, res) {
    res.set("Referrer-Policy", "no-referrer");
    try {
      const p = req.params.provider;
      if (!enabled(p)) throw new Error("Provider unavailable");
      const input = z
        .object({
          state: z.string().min(20).max(256),
          code: z.string().min(1).max(4096),
        })
        .parse(req.method === "POST" ? req.body : req.query);
      // Consume before exchanging the code; concurrent callbacks cannot replay it.
      const f = await one(
        "UPDATE social_auth_flows SET consumed_at=now() WHERE state_hash=$1 AND browser_hash=$2 AND provider=$3 AND consumed_at IS NULL AND expires_at>now() RETURNING *",
        [hash(input.state), hash(browser(req)), p],
      );
      if (!f) throw new Error("Invalid flow");
      const c = config.social[p];
      let secret = c.clientSecret;
      if (p === "apple")
        secret = await new SignJWT({})
          .setProtectedHeader({ alg: "ES256", kid: c.keyId })
          .setIssuer(c.teamId)
          .setSubject(c.clientId)
          .setAudience("https://appleid.apple.com")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(await importPKCS8(c.privateKey.replace(/\\n/g, "\n"), "ES256"));
      const response = await fetch(providers[p].token, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: input.code,
          client_id: c.clientId,
          client_secret: secret,
          redirect_uri: callback(p),
          ...(p === "google" ? { code_verifier: f.verifier } : {}),
        }),
      });
      if (!response.ok) throw new Error("Exchange failed");
      const tokens = await response.json();
      const { payload } = await jwtVerify(tokens.id_token, providers[p].keys, {
        issuer: providers[p].issuer,
        audience: c.clientId,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "exp", "iat", "nonce"],
        maxTokenAge: "10m",
      });
      if (
        payload.nonce !== f.nonce ||
        typeof payload.sub !== "string" ||
        payload.sub.length > 255 ||
        (payload.azp && payload.azp !== c.clientId)
      )
        throw new Error("Invalid identity");
      const existing = await db.transaction(async (tx) => {
        const u = await one(
          "SELECT u.* FROM users u JOIN social_identities s ON s.user_id=u.id WHERE s.provider=$1 AND s.subject=$2 FOR UPDATE OF u",
          [p, payload.sub],
          tx,
        );
        if (!u) return false;
        if (u.status !== "active") throw new Error("Account unavailable");
        await issueSession(u, res, undefined, tx);
        await audit(tx, u.id, "social_login", u.id, { provider: p });
        await tx.query("DELETE FROM social_auth_flows WHERE state_hash=$1", [
          f.state_hash,
        ]);
        return true;
      });
      if (existing) {
        res.append("Set-Cookie", cookie("", 0));
        return res.redirect(303, `${config.origin}/#discover`);
      }
      if (payload.email_verified !== true && payload.email_verified !== "true")
        throw new Error("Verified email required");
      const address = email.parse(payload.email);
      const identity = {
        subject: payload.sub,
        email: address,
        verified:
          p === "apple" ||
          address.endsWith("@gmail.com") ||
          (typeof payload.hd === "string" && payload.hd.length > 0),
      };
      // New provider identities receive a real session immediately. Existing-email
      // accounts still require proof of the original account before linking.
      const created = await db.transaction(async (tx) => {
        if (await one("SELECT id FROM users WHERE email=$1", [address], tx))
          return null;
        const name =
          typeof payload.name === "string"
            ? payload.name.trim().slice(0, 40)
            : "";
        const u = await one(
          "INSERT INTO users(id,email,username,password_hash,display_name,dob,gender,city,email_verified,profile_visible) VALUES($1,$2,$3,NULL,$4,NULL,NULL,'',$5,false) ON CONFLICT(email) DO NOTHING RETURNING *",
          [
            randomUUID(),
            address,
            `ft_${randomBytes(12).toString("hex")}`,
            name.length >= 2 ? name : "New member",
            identity.verified,
          ],
          tx,
        );
        if (!u) return null;
        await tx.query(
          "INSERT INTO social_identities(provider,subject,user_id) VALUES($1,$2,$3)",
          [p, payload.sub, u.id],
        );
        await audit(tx, u.id, "social_account_created", u.id, { provider: p });
        await tx.query("DELETE FROM social_auth_flows WHERE state_hash=$1", [
          f.state_hash,
        ]);
        await issueSession(u, res, undefined, tx);
        return u;
      });
      if (created) {
        res.append("Set-Cookie", cookie("", 0));
        return res.redirect(303, `${config.origin}/#discover`);
      }
      await db.query(
        "UPDATE social_auth_flows SET identity=$1,verifier=$2 WHERE state_hash=$3",
        [JSON.stringify(identity), "", f.state_hash],
      );
      return res.redirect(303, `${config.origin}/#social-complete`);
    } catch {
      // Provider responses and credentials must never reach logs or the browser.
      res.append("Set-Cookie", cookie("", 0));
      return res.redirect(303, `${config.origin}/#social-error`);
    }
  }
  app.get(
    "/api/v1/auth/social/google/callback",
    authLimit,
    (req, res, next) => {
      req.params.provider = "google";
      return finish(req, res).catch(next);
    },
  );
  app.post(
    "/api/v1/auth/social/apple/callback",
    express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 10 }),
    authLimit,
    (req, res, next) => {
      req.params.provider = "apple";
      return finish(req, res).catch(next);
    },
  );
  app.get("/api/v1/auth/social/pending", authLimit, async (req, res) => {
    const f = await pending(req);
    const existing = await one("SELECT id FROM users WHERE email=$1", [
      f.identity.email,
    ]);
    res.json({
      provider: f.provider,
      email: f.identity.email,
      existing_account: !!existing,
    });
  });
  const linkLimit = sharedLimit(
    db,
    config.secret,
    "social-link-account",
    10,
    900,
    (req) => req.socialEmail,
  );
  app.post(
    "/api/v1/auth/social/complete",
    authLimit,
    async (req, res, next) => {
      req.socialEmail = (await pending(req)).identity.email;
      next();
    },
    linkLimit,
    async (req, res) => {
      const user = await db.transaction(async (tx) => {
        const f = await pending(req, tx);
        let u = await one(
          "SELECT * FROM users WHERE email=$1 FOR UPDATE",
          [f.identity.email],
          tx,
        );
        if (u) {
          const password = z
            .string()
            .max(256)
            .parse(req.body.existing_password);
          if (
            u.status !== "active" ||
            !u.password_hash ||
            !(await bcrypt.compare(password, u.password_hash))
          )
            throw fail(
              401,
              "The account password is incorrect. Use password recovery if needed.",
            );
          // Linking requires both provider authentication and the existing account password.
          await tx.query(
            "INSERT INTO social_identities(provider,subject,user_id) VALUES($1,$2,$3)",
            [f.provider, f.identity.subject, u.id],
          );
          await audit(tx, u.id, "social_identity_linked", u.id, {
            provider: f.provider,
          });
        } else {
          throw fail(
            400,
            "Please restart Google or Apple sign-in to create your account.",
          );
        }
        await tx.query("DELETE FROM social_auth_flows WHERE state_hash=$1", [
          f.state_hash,
        ]);
        await issueSession(u, res, undefined, tx);
        return u;
      });
      res.append("Set-Cookie", cookie("", 0));
      res.json({
        user: privateUser(user),
        ...(!user.email_verified ? await sendVerification(user) : {}),
      });
    },
  );
}
