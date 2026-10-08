import React, { useState } from "react";
import { api } from "../api.ts";
export function ProfileDetails({ user, setUser, notify }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await api("/me/details", {
        method: "PATCH",
        body: {
          username: f.get("username"),
          custom_gender: f.get("custom_gender") || "",
          connection_goals: f.getAll("connection_goals"),
          languages: String(f.get("languages"))
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          social_links: {
            instagram: f.get("instagram"),
            x: f.get("x"),
            tiktok: f.get("tiktok"),
          },
        },
      });
      setUser(r.user);
      notify("Profile details saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="settings-card stack" onSubmit={save}>
      <h2>Interests, identity, and links</h2>
      <label>
        Username
        <input
          name="username"
          defaultValue={user.username}
          pattern="[a-zA-Z0-9_]{3,30}"
          minLength={3}
          maxLength={30}
          required
        />
        <span className="field-hint">
          Your unique handle. Letters, numbers, and underscores.
        </span>
      </label>
      {user.gender === "custom" && (
        <label>
          Describe your gender
          <input
            name="custom_gender"
            maxLength={60}
            defaultValue={user.custom_gender}
          />
        </label>
      )}
      <fieldset>
        <legend>What would you like to find?</legend>
        {[
          ["casual", "Casual connections"],
          ["friendship", "Friendship"],
          ["networking", "Networking"],
          ["dating", "Dating"],
        ].map(([value, label]) => (
          <label className="checkbox" key={value}>
            <input
              type="checkbox"
              name="connection_goals"
              value={value}
              defaultChecked={user.connection_goals?.includes(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        Languages
        <input
          name="languages"
          defaultValue={user.languages?.join(", ")}
          maxLength={410}
          placeholder="English, Hindi"
        />
        <span className="field-hint">
          Up to 10 languages, separated by commas.
        </span>
      </label>
      <p className="muted">
        These optional links appear on your member profile. Adding a link does
        not verify account ownership.
      </p>
      {[
        ["instagram", "Instagram"],
        ["x", "X / Twitter"],
        ["tiktok", "TikTok"],
      ].map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            name={key}
            type="url"
            maxLength={500}
            placeholder="https://"
            defaultValue={user.social_links?.[key] || ""}
          />
        </label>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}
