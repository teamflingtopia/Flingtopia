import { policies } from "../shared/policies.ts";
import { enrollStaff, removeTestDirectory } from "./helpers.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { seed, demoIds } from "../server/seed.mjs";
let db, server, base, dir, a, b, outsider, moderator;
const origin = "http://127.0.0.1:5173";
function client() {
  let cookies = {};
  return {
    get cookies() {
      return { ...cookies };
    },
    set cookies(v) {
      cookies = { ...v };
    },
    async request(path, method = "GET", body, requestOrigin = origin) {
      const r = await fetch(`${base}/api/v1${path}`, {
        method,
        headers: {
          Origin: requestOrigin,
          Cookie: Object.entries(cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join("; "),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      for (const cookie of r.headers.getSetCookie()) {
        const [name, value] = cookie.split(";")[0].split("=");
        cookies[name] = value;
      }
      return { status: r.status, body: await r.json(), headers: r.headers };
    },
  };
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "flingtopia-test-"));
  db = await openDatabase();
  await seed(db);
  const password = await bcrypt.hash("Test-password-1234", 12);
  await db.query("UPDATE users SET password_hash=$1", [password]);
  const app = createApp(db, {
    authEnabled: true,
    secret: "test-only-secret-that-is-at-least-thirty-two-characters",
    origin,
    demo: true,
    production: false,
    mediaDir: dir,
    distDir: dir,
    dummyHash: password,
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  [a, b, outsider, moderator] = [client(), client(), client(), client()];
  for (const [c, email] of [
    [a, "aarav"],
    [b, "ananya"],
    [outsider, "neha"],
    [moderator, "moderator"],
  ])
    assert.equal(
      (
        await c.request("/auth/login", "POST", {
          email: `${email}@demo.flingtopia.local`,
          password: "Test-password-1234",
        })
      ).status,
      200,
    );
  await enrollStaff(moderator);
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  await db?.close();
  if (dir) await removeTestDirectory(dir);
});
test("health checks database availability", async () =>
  assert.equal((await a.request("/health")).body.status, "ok"));
test("protected data cannot be read anonymously", async () =>
  assert.equal((await client().request("/people")).status, 401));
test("cross-origin mutations are rejected", async () =>
  assert.equal(
    (await a.request("/me/creator", "POST", {}, "https://evil.example")).status,
    403,
  ));
test("registration enforces age on the server", async () => {
  const r = await client().request("/auth/register", "POST", {
    email: "minor@example.test",
    password: "Test-password-1234",
    display_name: "Minor",
    username: "minor",
    dob: "2020-01-01",
    gender: "man",
    city: "Mumbai",
    terms: true,
    consent_version: policies.community.version,
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /18/);
});
test("account creation ignores claimed privileges and requires email verification", async () => {
  const c = client();
  const r = await c.request("/auth/register", "POST", {
    email: "new@example.test",
    password: "Test-password-1234",
    display_name: "New member",
    username: "new_member",
    dob: "1995-01-01",
    gender: "woman",
    city: "Delhi",
    terms: true,
    consent_version: policies.community.version,
    role: "influencer",
    staff_role: "admin",
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, "user");
  assert.equal(r.body.user.staff_role, null);
  assert.equal(
    (await c.request(`/people/${demoIds[4]}/like`, "POST")).status,
    403,
  );
  assert.match(r.headers.getSetCookie()[0], /HttpOnly/);
  const token = new URL(r.body.development_verification_url).searchParams.get(
    "verify",
  );
  assert.equal(
    (await c.request("/auth/verify", "POST", { token })).status,
    200,
  );
  assert.equal(
    (await c.request("/auth/verify", "POST", { token })).status,
    400,
  );
  assert.equal((await c.request("/me")).body.user.email_verified, true);
});
test("discovery returns public fields and respects gender preferences", async () => {
  await db.query("UPDATE users SET looking_for='woman' WHERE id=$1", [
    demoIds[0],
  ]);
  const r = await a.request("/people");
  assert.equal(r.status, 200);
  assert.ok(r.body.people.length);
  for (const p of r.body.people) {
    assert.equal(p.gender, "woman");
    assert.equal(p.email, undefined);
    assert.equal(p.password_hash, undefined);
    assert.equal(p.dob, undefined);
  }
  await db.query("UPDATE users SET looking_for='everyone' WHERE id=$1", [
    demoIds[0],
  ]);
});
test("concurrent repeated likes produce exactly one mutual match", async () => {
  const results = await Promise.all([
    a.request(`/people/${demoIds[1]}/like`, "POST"),
    a.request(`/people/${demoIds[1]}/like`, "POST"),
  ]);
  assert.ok(results.every((r) => r.status === 200 && r.body.matched));
  assert.equal(results[0].body.match_id, results[1].body.match_id);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM matches WHERE user_a=$1 AND user_b=$2",
        [demoIds[0], demoIds[1]],
      )
    ).rows[0].n,
    1,
  );
});
test("nonparticipants cannot read or send messages", async () => {
  const match = (await a.request("/conversations")).body.conversations.find(
    (c) => c.person.id === demoIds[1],
  );
  assert.ok(match);
  assert.equal(
    (await outsider.request(`/conversations/${match.id}/messages`)).status,
    404,
  );
  assert.equal(
    (
      await outsider.request(`/conversations/${match.id}/messages`, "POST", {
        body: "not allowed",
        client_id: randomUUID(),
      })
    ).status,
    404,
  );
});
test("messages persist and retries do not duplicate them", async () => {
  const match = (await a.request("/conversations")).body.conversations.find(
    (c) => c.person.id === demoIds[1],
  );
  const payload = { body: "A real persisted message", client_id: randomUUID() };
  const r = await a.request(
    `/conversations/${match.id}/messages`,
    "POST",
    payload,
  );
  assert.equal(r.status, 201);
  const retry = await a.request(
    `/conversations/${match.id}/messages`,
    "POST",
    payload,
  );
  assert.equal(r.body.message.id, retry.body.message.id);
  assert.equal(
    (
      await a.request(`/conversations/${match.id}/messages`, "POST", {
        ...payload,
        body: "changed content",
      })
    ).status,
    409,
  );
  const received = await b.request(`/conversations/${match.id}/messages`);
  assert.equal(
    received.body.messages.filter((m) => m.body === payload.body).length,
    1,
  );
  await b.request(`/conversations/${match.id}/read`, "POST");
  const read = await a.request(`/conversations/${match.id}/messages`);
  assert.ok(read.body.messages.find((m) => m.id === r.body.message.id).read_at);
});
test("RSVP is idempotent and concurrent requests cannot oversell", async () => {
  const event = (await a.request("/events")).body.events[0];
  await db.query("UPDATE events SET capacity=1 WHERE id=$1", [event.id]);
  const results = await Promise.all([
    a.request(`/events/${event.id}/rsvp`, "POST"),
    b.request(`/events/${event.id}/rsvp`, "POST"),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const winner = results[0].status === 201 ? a : b;
  const retry = await winner.request(`/events/${event.id}/rsvp`, "POST");
  assert.equal(retry.status, 201);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM rsvps WHERE event_id=$1 AND cancelled_at IS NULL",
        [event.id],
      )
    ).rows[0].n,
    1,
  );
  await winner.request(`/events/${event.id}/rsvp`, "DELETE");
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM rsvps WHERE event_id=$1 AND cancelled_at IS NULL",
        [event.id],
      )
    ).rows[0].n,
    0,
  );
});
test("paid events cannot bypass payment through the free RSVP endpoint", async () => {
  const event = (await a.request("/events")).body.events[1];
  await db.query("UPDATE events SET price_inr=999 WHERE id=$1", [event.id]);
  assert.equal(
    (await a.request(`/events/${event.id}/rsvp`, "POST")).status,
    409,
  );
});
test("member cannot access moderation queue or resolve reports", async () => {
  assert.equal((await a.request("/admin/queue")).status, 403);
  assert.equal(
    (
      await a.request(`/admin/reports/${randomUUID()}`, "POST", {
        resolution: "Dismissed test report",
      })
    ).status,
    403,
  );
});
test("uploaded photos stay private until staff approval and honor profile visibility", async () => {
  const image = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#78578d" },
  })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("photo", new Blob([image], { type: "image/jpeg" }), "test.jpg");
  const cookie = Object.entries(b.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const uploaded = await fetch(`${base}/api/v1/me/photo`, {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie },
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const uploadedPhoto = await uploaded.json();
  const owner = (
    await db.query("SELECT pending_avatar FROM users WHERE id=$1", [demoIds[1]])
  ).rows[0];
  const memberCookie = Object.entries(a.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  assert.equal((await fetch(`${base}${owner.pending_avatar}`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}${owner.pending_avatar}`, {
        headers: { Cookie: memberCookie },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}${owner.pending_avatar}`, {
        headers: { Cookie: cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await moderator.request(
        `/admin/photo-reviews/${uploadedPhoto.id}`,
        "POST",
        {
          approve: true,
          reason: "Suitable profile photo in isolated test.",
        },
      )
    ).status,
    200,
  );
  const visible = await fetch(`${base}${owner.pending_avatar}`, {
    headers: { Cookie: memberCookie },
  });
  assert.equal(visible.status, 200);
  assert.match(visible.headers.get("content-type"), /image\/jpeg/);
  await db.query("UPDATE users SET profile_visible=false WHERE id=$1", [
    demoIds[1],
  ]);
  assert.equal(
    (
      await fetch(`${base}${owner.pending_avatar}`, {
        headers: { Cookie: memberCookie },
      })
    ).status,
    404,
  );
  await db.query("UPDATE users SET profile_visible=true WHERE id=$1", [
    demoIds[1],
  ]);
});
test("creator directory includes influencers and searches interests", async () => {
  const r = await a.request("/people?role=creator&q=Yoga");
  assert.equal(r.status, 200);
  assert.ok(
    r.body.people.some((p) => p.id === demoIds[4] && p.role === "influencer"),
  );
});
test("blocking removes discovery and immediately stops messaging", async () => {
  const match = (await a.request("/conversations")).body.conversations.find(
    (c) => c.person.id === demoIds[1],
  );
  assert.equal(
    (await a.request(`/people/${demoIds[1]}/block`, "POST")).status,
    200,
  );
  assert.equal(
    (
      await b.request(`/conversations/${match.id}/messages`, "POST", {
        body: "blocked",
        client_id: randomUUID(),
      })
    ).status,
    404,
  );
  assert.ok(
    !(await b.request("/conversations")).body.conversations.some(
      (c) => c.id === match.id,
    ),
  );
  assert.ok(
    !(await a.request("/people")).body.people.some((p) => p.id === demoIds[1]),
  );
  assert.equal(
    (await b.request(`/people/${demoIds[0]}/like`, "POST")).status,
    404,
  );
  await a.request(`/blocks/${demoIds[1]}`, "DELETE");
  assert.ok(
    !(await a.request("/conversations")).body.conversations.some(
      (c) => c.id === match.id,
    ),
  );
});
test("moderation resolution suspends account and records an audit entry", async () => {
  const r = await a.request("/reports", "POST", {
    target_id: demoIds[4],
    category: "spam",
    details: "This is a test report with sufficient detail.",
  });
  assert.equal(r.status, 201);
  const resolution = await moderator.request(
    `/admin/reports/${r.body.id}`,
    "POST",
    { resolution: "Confirmed spam in the integration test.", suspend: true },
  );
  assert.equal(resolution.status, 200);
  assert.equal((await outsider.request("/me")).status, 401);
  const audit = await db.query(
    "SELECT * FROM audit_log WHERE target_id=$1 AND action='report_resolved_and_suspended'",
    [demoIds[4]],
  );
  assert.equal(audit.rows.length, 1);
});
test("refresh tokens rotate; reuse revokes the whole session family", async () => {
  const c = client();
  c.cookies = b.cookies;
  const original = c.cookies;
  assert.equal((await c.request("/auth/refresh", "POST")).status, 200);
  const rotated = c.cookies;
  assert.notEqual(original.ft_refresh, rotated.ft_refresh);
  const attacker = client();
  attacker.cookies = original;
  assert.equal((await attacker.request("/auth/refresh", "POST")).status, 401);
  assert.equal((await c.request("/me")).status, 401);
});
test("logout immediately revokes access, including a previously copied access token", async () => {
  const copied = client();
  copied.cookies = a.cookies;
  assert.equal((await a.request("/auth/logout", "POST")).status, 200);
  assert.equal((await copied.request("/me")).status, 401);
});
