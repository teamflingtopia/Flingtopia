import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../server/db.mjs";
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const [email, role, operator, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(" ");
if (
  !email ||
  !["admin", "moderator", "none", "reset-mfa"].includes(role) ||
  !operator ||
  reason.length < 10
)
  throw new Error(
    'Usage: node scripts/staff.mjs EMAIL admin|moderator|none|reset-mfa OPERATOR "reason of at least 10 characters". Stop the local API first when using PGlite.',
  );
if (process.env.NODE_ENV === "production" && !process.env.STAFF_DATABASE_URL)
  throw new Error(
    "Production provisioning requires an operator-only STAFF_DATABASE_URL.",
  );
const db = await openDatabase({
  url: process.env.STAFF_DATABASE_URL || process.env.DATABASE_URL,
  directory: resolve(process.env.DATA_DIR || "data", "postgres"),
  ssl: process.env.DATABASE_SSL === "true",
  migrate: false,
});
try {
  await db.transaction(async (tx) => {
    const user = (
      await tx.query("SELECT * FROM users WHERE email=$1 FOR UPDATE", [
        email.toLowerCase(),
      ])
    ).rows[0];
    if (!user || user.status !== "active" || !user.email_verified)
      throw new Error(
        "Provision only an existing active account with confirmed email.",
      );
    if (role !== "reset-mfa")
      await tx.query("UPDATE users SET staff_role=$1 WHERE id=$2", [
        role === "none" ? null : role,
        user.id,
      ]);
    if (role === "reset-mfa" || role === "none")
      await tx.query("DELETE FROM staff_mfa WHERE user_id=$1", [user.id]);
    await tx.query("DELETE FROM staff_stepups WHERE user_id=$1", [user.id]);
    await tx.query(
      "UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1",
      [user.id],
    );
    await tx.query(
      "INSERT INTO audit_log(id,action,target_id,metadata) VALUES($1,'operator_staff_change',$2,$3)",
      [randomUUID(), user.id, JSON.stringify({ role, operator, reason })],
    );
  });
  console.log(
    "Staff change recorded; existing sessions revoked. Sign in again and complete authenticator setup.",
  );
} finally {
  await db.close();
}
