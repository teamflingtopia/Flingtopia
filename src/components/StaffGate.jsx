import React, { useState, useEffect } from "react";
import { api } from "../api.ts";
import { Spinner } from "./ui.tsx";
export function StaffGate({ children }) {
  const [state, setState] = useState(null),
    [setup, setSetup] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    api("/staff/mfa")
      .then(setState)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const expire = () =>
      setState((s) => (s ? { ...s, verified: false } : null));
    window.addEventListener("ft-mfa-required", expire);
    const timer = setInterval(load, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("ft-mfa-required", expire);
    };
  }, []);
  if (state?.verified) return children;
  return (
    <section className="settings-card stack narrow-page">
      <h1>Secure staff access</h1>
      <p>
        Staff tools require an authenticator code. Verification lasts 15 minutes
        in this session.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!state ? (
        <>
          <Spinner />
          <button onClick={load}>Retry</button>
        </>
      ) : (
        <>
          {!state.enrolled && !setup && (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const password =
                  new FormData(e.currentTarget).get("password") || "";
                setBusy(true);
                setError("");
                try {
                  setSetup(
                    await api("/staff/mfa/enroll", {
                      method: "POST",
                      body: { password },
                    }),
                  );
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {state.local_demo ? (
                <p className="notice">
                  Local fictional staff demo: setup skips password confirmation.
                  Authenticator verification is still required.
                </p>
              ) : (
                <label>
                  Confirm password
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
              )}
              <button className="button primary" disabled={busy}>
                Set up authenticator
              </button>
            </form>
          )}
          {setup && (
            <div className="notice">
              <p>
                Add this account manually to your authenticator app. Use a
                time-based code (SHA1, 6 digits, 30 seconds).
              </p>
              <p>
                {setup.issuer} · {setup.account}
              </p>
              <label>
                Setup key
                <input
                  readOnly
                  value={setup.secret}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <p>Keep this key private. Setup expires in 10 minutes.</p>
            </div>
          )}
          {(state.enrolled || setup) && (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const code = new FormData(e.currentTarget).get("code");
                setBusy(true);
                setError("");
                try {
                  await api("/staff/mfa/verify", {
                    method: "POST",
                    body: { code },
                  });
                  setSetup(null);
                  await load();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Authenticator code
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                />
              </label>
              <button className="button primary" disabled={busy}>
                Verify and continue
              </button>
            </form>
          )}
          <p className="muted">
            Lost your authenticator? An authorized operator must verify your
            identity and reset enrollment; a password reset does not bypass MFA.
          </p>
        </>
      )}
    </section>
  );
}
