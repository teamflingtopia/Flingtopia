import {
  createHmac,
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail } from "./domain.mjs";

export function sharedLimit(
  db,
  secret,
  bucket,
  limit,
  seconds,
  identify = (req) => req.ip || "unknown",
) {
  return async (req, res, next) => {
    try {
      const key = createHmac("sha256", secret)
        .update(String(identify(req)))
        .digest("hex");
      const { rows } = await db.query(
        `INSERT INTO request_limits(bucket,key_hash,hits,expires_at) VALUES($1,$2,1,now()+$3::int*interval '1 second') ON CONFLICT(bucket,key_hash) DO UPDATE SET hits=CASE WHEN request_limits.expires_at<=now() THEN 1 ELSE request_limits.hits+1 END,expires_at=CASE WHEN request_limits.expires_at<=now() THEN now()+$3::int*interval '1 second' ELSE request_limits.expires_at END RETURNING hits,expires_at`,
        [bucket, key, seconds],
      );
      if (rows[0].hits > limit) {
        res.set(
          "Retry-After",
          String(
            Math.max(
              1,
              Math.ceil((new Date(rows[0].expires_at) - Date.now()) / 1000),
            ),
          ),
        );
        throw fail(
          429,
          "Too many attempts. Please wait before trying again.",
          "RATE_LIMITED",
        );
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
const key = (secret) =>
  createHash("sha256").update(`staff-mfa:${secret}`).digest();
function seal(value, secret) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(value), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString("base64"))
    .join(".");
}
function unseal(value, secret) {
  const [iv, tag, body] = value.split(".").map((v) => Buffer.from(v, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
// RFC 4226 dynamic truncation; RFC 6238, 30-second step, six digits.
export function otp(secret, counter) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(b).digest(),
    offset = mac[19] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
export function registerStaffSecurity(
  app,
  { db, config, authenticated, one, audit },
) {
  const staffRole = (req, res, next) =>
    req.user.staff_role
      ? next()
      : next(fail(403, "Staff access required.", "FORBIDDEN"));
  const limit = sharedLimit(
    db,
    config.secret,
    "staff-mfa",
    6,
    300,
    (req) => req.user.id,
  );
  app.get("/api/v1/staff/mfa", authenticated, staffRole, async (req, res) => {
    const m = await one("SELECT enabled_at FROM staff_mfa WHERE user_id=$1", [
      req.user.id,
    ]);
    const step = await one(
      "SELECT 1 FROM staff_stepups WHERE user_id=$1 AND family_id=$2 AND verified_at>now()-interval '15 minutes'",
      [req.user.id, req.sessionFamily],
    );
    res.json({
      enrolled: !!m?.enabled_at,
      verified: !!step,
      local_demo: !!(config.demo && !config.production && req.user.is_demo),
    });
  });
  app.post(
    "/api/v1/staff/mfa/enroll",
    authenticated,
    staffRole,
    limit,
    async (req, res) => {
      const { password } = z
        .object({ password: z.string().max(256).default("") })
        .parse(req.body);
      const demo = config.demo && !config.production && req.user.is_demo;
      if (!demo && (!req.user.password_hash || !(await bcrypt.compare(password, req.user.password_hash))))
        throw fail(403, "Password is incorrect.", "REAUTH_REQUIRED");
      const secret = randomBytes(20);
      await db.transaction(async (tx) => {
        const current = await one(
          "SELECT * FROM users WHERE id=$1 FOR UPDATE",
          [req.user.id],
          tx,
        );
        if (
          current.status !== "active" ||
          !current.staff_role ||
          current.password_hash !== req.user.password_hash
        )
          throw fail(403, "Sign in again before enrolling.", "REAUTH_REQUIRED");
        const existing = await one(
          "SELECT * FROM staff_mfa WHERE user_id=$1 FOR UPDATE",
          [req.user.id],
          tx,
        );
        if (existing?.enabled_at)
          throw fail(
            409,
            "An authenticator is already enrolled. Contact your operator for recovery.",
          );
        await tx.query(
          "INSERT INTO staff_mfa(user_id,secret_cipher,pending_expires_at) VALUES($1,$2,now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET secret_cipher=excluded.secret_cipher,pending_expires_at=excluded.pending_expires_at,last_counter=-1",
          [req.user.id, seal(secret, config.mfaSecret || config.secret)],
        );
        await audit(
          tx,
          req.user.id,
          "staff_mfa_enrollment_started",
          req.user.id,
        );
      });
      res.json({
        secret: base32(secret),
        issuer: "Flingtopia",
        account: req.user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      });
    },
  );
  app.post(
    "/api/v1/staff/mfa/verify",
    authenticated,
    staffRole,
    limit,
    async (req, res) => {
      const { code } = z
        .object({ code: z.string().regex(/^\d{6}$/) })
        .parse(req.body);
      await db.transaction(async (tx) => {
        const m = await one(
          "SELECT * FROM staff_mfa WHERE user_id=$1 FOR UPDATE",
          [req.user.id],
          tx,
        );
        if (
          !m ||
          (!m.enabled_at && new Date(m.pending_expires_at) <= new Date())
        )
          throw fail(
            403,
            "Authenticator setup expired. Start again.",
            "MFA_REQUIRED",
          );
        const secret = unseal(
            m.secret_cipher,
            config.mfaSecret || config.secret,
          ),
          counter = Math.floor(Date.now() / 30000);
        const matched = [counter - 1, counter, counter + 1].find(
          (c) =>
            c > Number(m.last_counter) &&
            timingSafeEqual(Buffer.from(otp(secret, c)), Buffer.from(code)),
        );
        if (matched === undefined)
          throw fail(
            403,
            "Invalid or already used code. Try the next code.",
            "MFA_REQUIRED",
          );
        await tx.query(
          "UPDATE staff_mfa SET enabled_at=COALESCE(enabled_at,now()),pending_expires_at=NULL,last_counter=$2 WHERE user_id=$1",
          [req.user.id, matched],
        );
        await tx.query(
          "INSERT INTO staff_stepups(user_id,family_id) VALUES($1,$2) ON CONFLICT(user_id,family_id) DO UPDATE SET verified_at=now()",
          [req.user.id, req.sessionFamily],
        );
        await audit(tx, req.user.id, "staff_mfa_verified", req.user.id);
      });
      res.json({ ok: true });
    },
  );
}
