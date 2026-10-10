import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
let vite;
const user = {
  id: "member",
  display_name: "Test Member",
  city: "Mumbai",
  bio: "",
  interests: [],
  looking_for: "everyone",
  profile_visible: true,
  onboarding_draft: {},
  email: "member@example.test",
  email_verified: true,
  role: "user",
  has_password: false,
};
const noop = () => {};
before(async () => {
  globalThis.location = { hash: "#discover", pathname: "/", search: "" };
  vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
});
after(async () => {
  await vite?.close();
  delete globalThis.location;
});
async function render(file, name, props = {}) {
  const module = await vite.ssrLoadModule(`/src/screens/${file}.jsx`);
  return renderToString(
    React.createElement(module[name], {
      user,
      notify: noop,
      reload: noop,
      setUser: noop,
      ...props,
    }),
  ).replaceAll("<!-- -->", "");
}
test("email login and signup render without social-link state", async () => {
  location.hash = "#signin";
  assert.match(
    await render("Auth", "Auth", { socialProviders: ["google"] }),
    /Continue with Google/,
  );
  location.hash = "#signup";
  assert.match(await render("Auth", "Auth"), /Create account/);
});
test("account linking shows a loading state rather than an ordinary signup form", async () => {
  const html = await render("SocialLink", "SocialLink", { onAuth: noop });
  assert.match(html, /Connect your existing account/);
  assert.doesNotMatch(html, /name="email"|name="username"/);
});
test("Experiences can render both Explore and My plans", async () => {
  for (const hash of ["#experiences", "#experiences?filter=mine"]) {
    location.hash = hash;
    assert.match(await render("Experiences", "Experiences"), /My plans/);
  }
});
test("disabled-auth public routes never render a login or signup form", async () => {
  for (const route of [
    "discover",
    "browse",
    "creators",
    "experiences",
    "live",
    "messages",
    "profile",
    "search",
  ]) {
    location.hash = "#" + route;
    const html = await render("Guest", "Guest", {
      user: null,
      route,
      authDisabled: true,
    });
    assert.match(html, /Main navigation/);
    assert.doesNotMatch(html, /href="#signin"|href="#signup"|name="password"/);
  }
});
test("social onboarding collects profile information without email or password entry", async () => {
  const html = await render("Onboarding", "Onboarding", {
    user: { ...user, needs_demographics: true },
  });
  assert.match(html, /You’re signed in/);
  assert.doesNotMatch(html, /type="password"|name="email"|name="username"/);
});
test("member profile, settings and inbox render", async () => {
  location.hash = "#profile";
  assert.ok((await render("Profile", "Profile")).length > 100);
  location.hash = "#settings";
  assert.match(
    await render("SettingsView", "SettingsView", {
      operations: { account_requests: true },
    }),
    /Set an account password/,
  );
  location.hash = "#messages";
  assert.match(
    await render("Messages", "Messages", { selected: null, setSelected: noop }),
    /Messages/,
  );
});
