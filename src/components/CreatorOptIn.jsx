import React, { useState } from "react";
import { api } from "../api.ts";
import { policies } from "../../shared/policies.ts";
export function CreatorOptIn({ user, setUser, notify }) {
  const [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (user.role !== "user")
    return (
      <section className="settings-card stack">
        <h2>Your creator profile</h2>
        <p>
          Creator mode is enabled. Your account and mutual matches stay the
          same. Publishing and earnings are deferred.
        </p>
      </section>
    );
  return (
    <section className="settings-card stack">
      <h2>Become a creator</h2>
      <p>Join the creator directory with your existing profile.</p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        {policies.creator.text}
      </label>
      <small>Consent version: {policies.creator.version}</small>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button outline"
        disabled={!accepted || busy || !user.email_verified}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await api("/me/creator", {
              method: "POST",
              body: { terms: true, consent_version: policies.creator.version },
            });
            setUser(r.user);
            notify("Creator mode enabled for your existing account.");
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Enabling…"
          : user.email_verified
            ? "Enable creator profile"
            : "Verify email to enable creator mode"}
      </button>
    </section>
  );
}
