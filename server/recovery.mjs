import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createMailTransport } from "./mail.mjs";
import bcrypt from "bcryptjs";
import { recoverySchema, resetSchema } from "../shared/validation.ts";
import { hash, fail } from "./domain.mjs";

const encryptionKey = (secret) =>
  createHash("sha256").update(`recovery-mail:${secret}`).digest();
function seal(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((v) => v.toString("base64"))
    .join(".");
}
function unseal(value, secret) {
  const [iv, tag, data] = value.split(".").map((v) => Buffer.from(v, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(data), cipher.final()]).toString(),
  );
}
export function registerRecovery(
  app,
  { db, config, authLimit, one, audit, cookieOpts },
) {
  app.post("/api/v1/auth/forgot-password", authLimit, async (req, res) => {
    const { email } = recoverySchema.parse(req.body);
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 30 * 60000);
    await db.transaction(async (tx) => {
      const user = await one(
        "SELECT * FROM users WHERE email=$1 AND status='active' FOR UPDATE",
        [email],
        tx,
      );
      if (!user) return;
      // Limit mail per account without changing the public response.
      if (
        await one(
          "SELECT 1 FROM password_reset_tokens WHERE user_id=$1 AND created_at>now()-interval '5 minutes'",
          [user.id],
          tx,
        )
      )
        return;
      const id = randomUUID();
      await tx.query(
        "INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",
        [id, user.id, hash(token), expires],
      );
      await tx.query(
        "INSERT INTO recovery_mail(id,user_id,token_id,payload,expires_at) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          user.id,
          id,
          seal(
            {
              email: user.email,
              link: `${config.origin}/#reset-password?token=${token}`,
            },
            config.secret,
          ),
          expires,
        ],
      );
    });
    res.json({
      ok: true,
      message:
        "If an eligible account exists, a password reset email will arrive shortly. The link expires in 30 minutes.",
    });
  });
  app.post("/api/v1/auth/reset-password", authLimit, async (req, res) => {
    const input = resetSchema.parse(req.body);
    if (Buffer.byteLength(input.password, "utf8") > 72)
      throw fail(400, "Password must fit within 72 UTF-8 bytes.");
    const passwordHash = await bcrypt.hash(input.password, 12);
    await db.transaction(async (tx) => {
      const candidate = await one(
        "SELECT user_id FROM password_reset_tokens WHERE token_hash=$1",
        [hash(input.token)],
        tx,
      );
      if (!candidate)
        throw fail(
          400,
          "This reset link is invalid, expired or already used.",
          "INVALID_RESET",
        );
      const user = await one(
        "SELECT * FROM users WHERE id=$1 FOR UPDATE",
        [candidate.user_id],
        tx,
      );
      const record = await one(
        "SELECT * FROM password_reset_tokens WHERE token_hash=$1 FOR UPDATE",
        [hash(input.token)],
        tx,
      );
      if (
        user.status !== "active" ||
        record.consumed_at ||
        new Date(record.expires_at) <= new Date()
      )
        throw fail(
          400,
          "This reset link is invalid, expired or already used.",
          "INVALID_RESET",
        );
      await tx.query(
        "UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2",
        [passwordHash, user.id],
      );
      await tx.query(
        "UPDATE password_reset_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL",
        [user.id],
      );
      await tx.query("UPDATE recovery_mail SET payload=NULL WHERE user_id=$1", [
        user.id,
      ]);
      await tx.query(
        "UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1",
        [user.id],
      );
      await audit(tx, user.id, "password_reset", user.id);
    });
    res.setHeader("Set-Cookie", [
      `ft_access=; ${cookieOpts}Max-Age=0`,
      `ft_refresh=; ${cookieOpts}Max-Age=0`,
    ]);
    res.json({ ok: true });
  });
}

/** Leased, restart-safe delivery. SMTP may deliver twice after a crash; reset remains single-use. */
export function startRecoveryMail(db, config) {
  let running = null;
  const transport = createMailTransport(config);
  async function deliver() {
    await db.query(
      "UPDATE recovery_mail SET payload=NULL WHERE payload IS NOT NULL AND (expires_at<=now() OR attempts>=5)",
    );
    if (!transport && !(config.demo && !config.production)) return;
    const lease = randomUUID();
    const job = await db.transaction(async (tx) => {
      const result = await tx.query(
        "SELECT * FROM recovery_mail WHERE payload IS NOT NULL AND sent_at IS NULL AND next_attempt_at<=now() AND expires_at>now() AND attempts<5 AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      );
      const row = result.rows[0];
      if (!row) return null;
      await tx.query(
        "UPDATE recovery_mail SET lease_id=$1,lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=$2",
        [lease, row.id],
      );
      return row;
    });
    if (!job) return;
    try {
      const { email, link } = unseal(job.payload, config.secret);
      const text = `Reset your Flingtopia password within 30 minutes: ${link}\nAll existing sessions will be signed out. If you did not request this, ignore this email.`;
      if (transport)
        await transport.sendMail({
          deliveryKey: `recovery-${job.id}`,
          from: config.mailFrom,
          to: email,
          subject: "Reset your Flingtopia password",
          text,
        });
      else {
        await mkdir(config.mailPreviewDir, { recursive: true });
        await writeFile(
          resolve(config.mailPreviewDir, `${job.id}.txt`),
          `LOCAL PREVIEW ONLY\nTo: ${email}\n${text}`,
          { mode: 0o600 },
        );
      }
      await db.query(
        "UPDATE recovery_mail SET sent_at=now(),payload=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2",
        [job.id, lease],
      );
    } catch {
      await db.query(
        "UPDATE recovery_mail SET lease_until=NULL,next_attempt_at=now()+interval '1 minute' WHERE id=$1 AND lease_id=$2",
        [job.id, lease],
      );
      console.error(
        JSON.stringify({ event: "recovery_mail_failed", job_id: job.id }),
      );
    }
  }
  const tick = () => {
    if (!running)
      running = deliver()
        .catch(() => console.error('{"event":"recovery_worker_failed"}'))
        .finally(() => {
          running = null;
        });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await running;
    transport?.close();
  };
}
