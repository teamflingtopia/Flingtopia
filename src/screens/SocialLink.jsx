import React, { useEffect, useState } from "react";
import { Brand, Spinner } from "../components/ui.tsx";
import { api } from "../api.ts";

// This screen is only for linking an existing account, never new-user signup.
export function SocialLink({ onAuth }) {
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api("/auth/social/pending")
      .then((data) => {
        if (!data.existing_account)
          throw new Error(
            "Please restart social sign-in. This attempt is no longer available.",
          );
        if (active) setIdentity(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="account-flow stack">
      <Brand />
      <h1>Connect your existing account</h1>
      {loading ? (
        <Spinner />
      ) : (
        identity && (
          <>
            <p>
              You signed in with{" "}
              {identity.provider === "google" ? "Google" : "Apple"}. An existing
              Flingtopia account uses <strong>{identity.email}</strong>.
            </p>
            <p>
              Confirm that account’s password once to connect it. Future social
              sign-ins will take you straight into Flingtopia.
            </p>
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const password = new FormData(e.currentTarget).get("password");
                setBusy(true);
                setError("");
                try {
                  const result = await api("/auth/social/complete", {
                    method: "POST",
                    body: { existing_password: password },
                  });
                  onAuth(result.user);
                  location.hash = "discover";
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Existing Flingtopia password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={256}
                  required
                />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? "Connecting…" : "Connect and continue"}
              </button>
            </form>
            <a href="#forgot-password">Forgot your password?</a>
          </>
        )
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!loading && !identity && (
        <a className="button primary" href="#signin">
          Restart sign-in
        </a>
      )}
      <a className="text-button" href="#discover">
        Explore Flingtopia
      </a>
    </main>
  );
}
