import React, { useState } from "react";
import { api } from "../api.ts";
import { Brand } from "../components/ui.tsx";
import { navigate, routeQuery } from "../routing.ts";
export function Recovery({ reset, onReset, emailDisabled }) {
  const [token] = useState(() => routeQuery().get("token") || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (reset && f.password !== f.confirm) {
      setError("Passwords must match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/auth/${reset ? "reset-password" : "forgot-password"}`, {
        method: "POST",
        body: reset ? { token, password: f.password } : { email: f.email },
      });
      setDone(true);
      if (reset) {
        onReset();
        history.replaceState(null, "", `${location.pathname}#reset-password`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="boot">
      <Brand />
      <section className="settings-card stack recovery-card">
        <h1>{reset ? "Choose a new password" : "Recover your account"}</h1>
        {emailDisabled ? (
          <p role="status">
            Password recovery is unavailable while email is disabled in staging.
          </p>
        ) : done ? (
          <p role="status">
            {reset
              ? "Password updated. All existing sessions have been signed out. Sign in with your new password."
              : "If an eligible account exists, a reset email will arrive shortly. Check your spam folder too. The link expires in 30 minutes."}
          </p>
        ) : (
          <form className="stack" onSubmit={submit}>
            {reset ? (
              <>
                <label>
                  New password
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={72}
                    required
                  />
                </label>
                <label>
                  Confirm password
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={72}
                    required
                  />
                </label>
                <p className="muted">
                  Resetting signs you out on all devices. Email verification
                  stays unchanged.
                </p>
              </>
            ) : (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {reset && !/^[a-f0-9]{64}$/.test(token) && (
              <p role="alert">This reset link is missing or invalid.</p>
            )}
            <button
              className="button primary"
              disabled={busy || (reset && !/^[a-f0-9]{64}$/.test(token))}
            >
              {busy
                ? "Please wait…"
                : reset
                  ? "Reset password"
                  : "Send reset link"}
            </button>
            {reset && <a href="#forgot-password">Request a new reset link</a>}
          </form>
        )}
        <button className="text-button" onClick={() => navigate("discover")}>
          Back to sign in
        </button>
      </section>
    </div>
  );
}
