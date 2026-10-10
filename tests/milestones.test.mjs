import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { seed } from "../server/seed.mjs";
import { otp } from "../server/security.mjs";
import { startRecoveryMail } from "../server/recovery.mjs";
import { startNotificationWorker } from "../server/notification-worker.mjs";
import { httpClient, enrollStaff, removeTestDirectory } from "./helpers.mjs";
let db, server, dir, config, base, member, staff, other, factor;
const password = "Test-password-1234";
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
async function login(name) {
  const c = httpClient(base);
  ok(
    await c.request("/auth/login", "POST", {
      email: `${name}@demo.flingtopia.local`,
      password,
    }),
  );
  return c;
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "flingtopia-validation-"));
  db = await openDatabase();
  await seed(db);
  const hash = await bcrypt.hash(password, 12);
  await db.query("UPDATE users SET password_hash=$1", [hash]);
  config = {
    authEnabled: true,
    secret: "isolated-validation-secret-with-at-least-32-characters",
    origin: "http://127.0.0.1:5173",
    demo: true,
    production: false,
    mediaDir: dir,
    distDir: dir,
    mailPreviewDir: dir,
    dummyHash: hash,
    eventPublisherRoles: ["admin", "moderator"],
    accountRequests: true,
  };
  server = createApp(db, config).listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  member = await login("aarav");
  other = await login("ananya");
  staff = await login("moderator");
  factor = await enrollStaff(staff);
});
beforeEach(async () => {
  await db.exec("DELETE FROM request_limits");
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  await db?.close();
  if (dir) await removeTestDirectory(dir);
});
test("six-digit SHA1 TOTP matches RFC 6238 reference timestamps", () => {
  for (const [seconds, expected] of [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])
    assert.equal(
      otp(Buffer.from("12345678901234567890"), Math.floor(seconds / 30)),
      expected,
    );
});
test("MFA rejects code replay, scopes approval to session and expires after 15 minutes", async () => {
  ok(await staff.request("/admin/queue"));
  ok(
    await staff.request("/staff/mfa/verify", "POST", { code: factor.code }),
    403,
  );
  const separate = await login("moderator");
  ok(await separate.request("/admin/queue"), 403);
  await db.exec(
    "UPDATE staff_stepups SET verified_at=now()-interval '16 minutes'",
  );
  ok(await staff.request("/admin/queue"), 403);
  await db.exec("UPDATE staff_stepups SET verified_at=now()");
});
test("moderator event lifecycle rejects stale revisions and cancels with exactly one notification per attendee", async () => {
  const input = {
    title: "Validation gathering",
    description:
      "An isolated event for exercising the complete event lifecycle.",
    category: "Social",
    city: "Mumbai",
    venue: "Test venue",
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    timezone: "Asia/Kolkata",
    capacity: 2,
  };
  ok(await member.request("/admin/events", "POST", input), 403);
  const { event } = ok(
    await staff.request("/admin/events", "POST", input),
    201,
  );
  const path = `/admin/events/${event.id}`;
  ok(await member.request(`/events/${event.id}`), 404);
  ok(await staff.request(path, "PATCH", { ...input, revision: 1 }));
  ok(await staff.request(path + "/publish", "POST", { revision: 1 }), 409);
  ok(await staff.request(path + "/publish", "POST", { revision: 2 }));
  const r = await member.request(`/events/${event.id}/rsvp`, "POST", {});
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  const body = { revision: 3, reason: "Venue unavailable for this gathering." };
  const cancelled = await Promise.all([
    staff.request(path + "/cancel", "POST", body),
    staff.request(path + "/cancel", "POST", body),
  ]);
  cancelled.forEach((r) => ok(r));
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM notifications WHERE event_id=$1",
        [event.id],
      )
    ).rows[0].n,
    1,
  );
  const denied = await other.request(`/events/${event.id}/rsvp`, "POST", {});
  assert.ok(denied.status >= 400);
  const notices = ok(await member.request("/notifications")).notifications;
  const notice = notices.find((n) => n.event_id === event.id);
  assert.ok(notice);
  ok(await other.request(`/notifications/${notice.id}/read`, "POST", {}));
  assert.equal(
    (
      await db.query("SELECT read_at FROM notifications WHERE id=$1", [
        notice.id,
      ])
    ).rows[0].read_at,
    null,
  );
  ok(await member.request(`/notifications/${notice.id}/read`, "POST", {}));
  const stop = startNotificationWorker(db, config);
  await stop();
  const job = (
    await db.query("SELECT * FROM notification_mail WHERE notification_id=$1", [
      notice.id,
    ])
  ).rows[0];
  assert.ok(job.sent_at);
  assert.match(
    await readFile(join(dir, `event-${job.id}.txt`), "utf8"),
    /Venue unavailable/,
  );
  ok(
    await staff.request(`/admin/event-delivery/${job.id}/retry`, "POST", {}),
    409,
  );
});
test("account export requires password, omits secrets, and deletion intake preserves the account", async () => {
  ok(
    await member.request("/me/export", "POST", { password: "incorrect" }),
    403,
  );
  const exported = await member.request("/me/export", "POST", { password });
  ok(exported);
  assert.match(exported.headers.get("content-disposition"), /attachment/);
  assert.match(exported.headers.get("cache-control"), /no-store/);
  assert.equal(exported.body.profile.email, "aarav@demo.flingtopia.local");
  for (const key of [
    "password_hash",
    "staff_mfa",
    "refresh_sessions",
    "email_tokens",
  ])
    assert.ok(!JSON.stringify(exported.body).includes(`"${key}"`));
  const first = ok(
    await member.request("/me/deletion-request", "POST", { password }),
    201,
  );
  const second = ok(
    await member.request("/me/deletion-request", "POST", { password }),
    201,
  );
  assert.equal(first.request.id, second.request.id);
  assert.equal(first.request.status, "awaiting_policy");
  assert.equal(
    (
      await db.query("SELECT status FROM users WHERE id=$1", [
        exported.body.profile.id,
      ])
    ).rows[0].status,
    "active",
  );
  ok(await member.request("/me/deletion-request", "DELETE"));
  assert.ok(
    ok(await member.request("/me/account-requests")).requests.some(
      (r) => r.id === first.request.id && r.status === "withdrawn",
    ),
  );
  assert.ok(
    !ok(await other.request("/me/account-requests")).requests.some(
      (r) => r.id === first.request.id,
    ),
  );
});
test("audit records cannot be changed, deleted or truncated", async () => {
  for (const sql of [
    "UPDATE audit_log SET action='changed'",
    "DELETE FROM audit_log",
    "TRUNCATE audit_log",
  ])
    await assert.rejects(db.exec(sql), /append.only|immutable/i);
});
test("recovery is non-enumerating, delivers once, erases payload and revokes every existing session", async () => {
  const second = await login("aarav");
  const anon = httpClient(base);
  const known = ok(
    await anon.request("/auth/forgot-password", "POST", {
      email: "aarav@demo.flingtopia.local",
    }),
  );
  const absent = ok(
    await anon.request("/auth/forgot-password", "POST", {
      email: "absent@example.test",
    }),
  );
  assert.deepEqual(known, absent);
  ok(
    await anon.request("/auth/forgot-password", "POST", {
      email: "aarav@demo.flingtopia.local",
    }),
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM recovery_mail")).rows[0].n,
    1,
  );
  const stop = startRecoveryMail(db, config);
  await stop();
  const job = (await db.query("SELECT * FROM recovery_mail")).rows[0];
  assert.ok(job.sent_at);
  assert.equal(job.payload, null);
  const preview = await readFile(join(dir, `${job.id}.txt`), "utf8");
  const token = preview.match(/token=([a-f0-9]{64})/)[1];
  ok(
    await anon.request("/auth/reset-password", "POST", {
      token,
      password: "Replacement-password-1234",
    }),
  );
  ok(await member.request("/me"), 401);
  ok(await second.request("/me"), 401);
  ok(
    await anon.request("/auth/reset-password", "POST", {
      token,
      password: "Replacement-password-1234",
    }),
    400,
  );
  ok(
    await anon.request("/auth/login", "POST", {
      email: "aarav@demo.flingtopia.local",
      password,
    }),
    401,
  );
  ok(
    await anon.request("/auth/login", "POST", {
      email: "aarav@demo.flingtopia.local",
      password: "Replacement-password-1234",
    }),
  );
});
test("expired password reset cannot change credentials", async () => {
  const user = (
    await db.query(
      "SELECT id FROM users WHERE email='ananya@demo.flingtopia.local'",
    )
  ).rows[0];
  const token = "a".repeat(64);
  await db.query(
    "INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()-interval '1 minute')",
    [randomUUID(), user.id, createHash("sha256").update(token).digest("hex")],
  );
  ok(
    await httpClient(base).request("/auth/reset-password", "POST", {
      token,
      password: "Replacement-password-1234",
    }),
    400,
  );
  await login("ananya");
});
