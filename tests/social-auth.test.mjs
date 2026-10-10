import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { httpClient, removeTestDirectory } from "./helpers.mjs";
import { policies } from "../shared/policies.ts";

let db,
  server,
  base,
  directory,
  key,
  config,
  token,
  exchangeCalls = 0;
const origin = "http://127.0.0.1:5173";
const realFetch = globalThis.fetch;
const password = "Test-password-1234";
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "flingtopia-validation-"));
  db = await openDatabase();
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "isolated-test",
    alg: "RS256",
    use: "sig",
  };
  mock.method(globalThis, "fetch", async (url, options) => {
    const address = String(url);
    if (address === "https://www.googleapis.com/oauth2/v3/certs")
      return Response.json({ keys: [jwk] });
    if (address === "https://oauth2.googleapis.com/token") {
      exchangeCalls++;
      assert.equal(
        options.body.get("redirect_uri"),
        `${origin}/api/v1/auth/social/google/callback`,
      );
      assert.ok(options.body.get("code_verifier"));
      return Response.json({ id_token: token });
    }
    // Tests never contact a provider or any other external network.
    assert.ok(address.startsWith(base + "/"), address);
    return realFetch(url, options);
  });
  config = {
    authEnabled: true,
    origin,
    secret: "test-only-social-secret-with-at-least-32-characters",
    production: false,
    demo: false,
    mediaDir: directory,
    distDir: directory,
    mailPreviewDir: directory,
    dummyHash: await bcrypt.hash(password, 12),
    social: {
      google: { clientId: "isolated-client", clientSecret: "isolated-secret" },
    },
  };
  server = createApp(db, config).listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  config.authEnabled = true;
  await db.exec("DELETE FROM request_limits");
});
after(async () => {
  mock.restoreAll();
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  await db?.close();
  if (directory) await removeTestDirectory(directory);
});
async function request(client, path) {
  const response = await fetch(`${base}/api/v1${path}`, {
    redirect: "manual",
    headers: {
      Cookie: Object.entries(client.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
      Origin: origin,
    },
  });
  const cookies = client.cookies;
  for (const value of response.headers.getSetCookie()) {
    const [name, val] = value.split(";")[0].split("=");
    cookies[name] = val;
  }
  client.cookies = cookies;
  return response;
}
async function start(client, claims = {}) {
  const response = await request(client, "/auth/social/google/start");
  assert.equal(response.status, 303);
  const url = new URL(response.headers.get("location"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  token = await new SignJWT({
    email: "new-member@gmail.com",
    email_verified: true,
    name: "Social Member",
    nonce: url.searchParams.get("nonce"),
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "isolated-test" })
    .setIssuer("https://accounts.google.com")
    .setAudience("isolated-client")
    .setSubject(claims.sub || randomUUID())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
  return `/auth/social/google/callback?${new URLSearchParams({ state: url.searchParams.get("state"), code: "isolated-code" })}`;
}
test("new Google member receives a session immediately without signup or password", async () => {
  const client = httpClient(base);
  const callback = await start(client);
  const response = await request(client, callback);
  assert.equal(response.headers.get("location"), origin + "/#discover");
  const me = await client.request("/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "new-member@gmail.com");
  assert.equal(me.body.user.has_password, false);
  assert.equal(me.body.user.email_verified, true);
  assert.equal(me.body.user.onboarding_completed, false);
  assert.equal(
    (await client.request("/conversations")).body.error.code,
    "ONBOARDING_REQUIRED",
  );
  assert.equal((await client.request("/public/people")).body.people.length, 0);
  const draft = {
    display_name: "Social Member",
    city: "Mumbai",
    bio: "Hello",
    interests: ["Music"],
    looking_for: "everyone",
    profile_visible: true,
    dob: "1995-01-01",
    gender: "woman",
  };
  assert.equal(
    (await client.request("/me/onboarding", "PATCH", draft)).status,
    200,
  );
  assert.equal(
    (await client.request("/me")).body.user.onboarding_draft.city,
    "Mumbai",
  );
  const complete = await client.request("/me/onboarding/complete", "POST", {
    ...draft,
    terms: true,
    consent_version: policies.community.version,
  });
  assert.equal(complete.status, 200, JSON.stringify(complete.body));
  assert.equal(complete.body.user.onboarding_completed, true);
  assert.equal((await client.request("/conversations")).status, 200);
  const count = exchangeCalls;
  const replay = await request(client, callback);
  assert.equal(replay.headers.get("location"), origin + "/#social-error");
  assert.equal(exchangeCalls, count);
  assert.equal((await client.request("/auth/logout", "POST")).status, 200);
  assert.equal((await client.request("/me")).status, 401);
});
test("returning provider identity enters the same account without a details form", async () => {
  const row = (
    await db.query("SELECT subject,user_id FROM social_identities LIMIT 1")
  ).rows[0];
  const client = httpClient(base);
  const callback = await start(client, { sub: row.subject });
  const response = await request(client, callback);
  assert.equal(response.headers.get("location"), origin + "/#discover");
  assert.equal((await client.request("/me")).body.user.id, row.user_id);
});
test("wrong browser cannot consume a social callback", async () => {
  const client = httpClient(base),
    outsider = httpClient(base);
  const callback = await start(client, { email: "browser-binding@gmail.com" });
  const count = exchangeCalls;
  assert.equal(
    (await request(outsider, callback)).headers.get("location"),
    origin + "/#social-error",
  );
  assert.equal(exchangeCalls, count);
  assert.equal(
    (await request(client, callback)).headers.get("location"),
    origin + "/#discover",
  );
});
test("invalid nonce and unverified provider emails cannot create sessions", async () => {
  for (const claims of [{ nonce: "wrong" }, { email_verified: false }]) {
    await db.exec("DELETE FROM request_limits");
    const client = httpClient(base);
    const callback = await start(client, {
      email: "rejected@gmail.com",
      ...claims,
    });
    assert.equal(
      (await request(client, callback)).headers.get("location"),
      origin + "/#social-error",
    );
    assert.equal((await client.request("/me")).status, 401);
  }
});
test("existing-email account linking requires ownership and does not create a duplicate", async () => {
  const id = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,username,password_hash,display_name,dob,gender,city,email_verified) VALUES($1,'existing@gmail.com','existing_user',$2,'Existing','1995-01-01','woman','Mumbai',true)",
    [id, config.dummyHash],
  );
  const client = httpClient(base);
  const callback = await start(client, { email: "existing@gmail.com" });
  assert.equal(
    (await request(client, callback)).headers.get("location"),
    origin + "/#social-complete",
  );
  assert.equal((await client.request("/me")).status, 401);
  assert.equal(
    (await client.request("/auth/social/pending")).body.existing_account,
    true,
  );
  assert.equal(
    (
      await client.request("/auth/social/complete", "POST", {
        existing_password: "wrong",
      })
    ).status,
    401,
  );
  const linked = await client.request("/auth/social/complete", "POST", {
    existing_password: password,
  });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.equal(linked.body.user.id, id);
  assert.equal((await client.request("/me")).body.user.id, id);
});
test("social onboarding rejects underage details without making a public profile", async () => {
  const client = httpClient(base);
  await request(client, await start(client, { email: "unfinished@gmail.com" }));
  const response = await client.request("/me/onboarding/complete", "POST", {
    display_name: "Unfinished",
    city: "Mumbai",
    bio: "",
    interests: [],
    looking_for: "everyone",
    profile_visible: true,
    dob: "2020-01-01",
    gender: "woman",
    terms: true,
    consent_version: policies.community.version,
  });
  assert.equal(response.status, 400);
  assert.equal(
    (await client.request("/me")).body.user.onboarding_completed,
    false,
  );
});
test("disabled auth exposes only public browsing even to a previously signed-in browser", async () => {
  const client = httpClient(base);
  await request(client, await start(client, { email: "disabled@gmail.com" }));
  assert.equal((await client.request("/me")).status, 200);
  config.authEnabled = false;
  assert.equal((await client.request("/config")).body.auth_enabled, false);
  assert.equal((await client.request("/me")).status, 503);
  assert.equal((await client.request("/auth/login", "POST", {})).status, 503);
  assert.equal((await client.request("/public/people")).status, 200);
  assert.equal(
    (await request(client, "/auth/social/google/start")).headers.get(
      "location",
    ),
    origin + "/#discover",
  );
});
