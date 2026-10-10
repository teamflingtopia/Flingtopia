import React, { useEffect, useState } from "react";
import { api } from "../api.ts";
export function AccountRequests({ enabled, user }) {
  const [requests, setRequests] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    try {
      setRequests((await api("/me/account-requests")).requests);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (enabled) load();
  }, [enabled]);
  if (!enabled)
    return (
      <section className="settings-card">
        <h2>Your data</h2>
        <p>
          Export and deletion-request intake are awaiting product policy
          approval. No automatic deletion schedule is active.
        </p>
      </section>
    );
  const pending = requests.find(
    (r) => r.kind === "deletion" && r.status === "awaiting_policy",
  );
  return (
    <section className="settings-card stack">
      <h2>Your data</h2>
      <p>
        Download your account information as JSON, or record a deletion request.
        Deletion requests currently await an approved retention policy; they do
        not erase or deactivate your account.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {user?.has_password === false ? (
        <div className="notice">
          <p>
            You use social sign-in. Set an account password by email before
            exporting data or requesting deletion.
          </p>
          <a className="button outline" href="#forgot-password">
            Set an account password
          </a>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              password = new FormData(form).get("password"),
              action = e.nativeEvent.submitter?.value || "export";
            setBusy(true);
            setError("");
            try {
              if (action === "export") {
                const r = await api("/me/export", {
                  method: "POST",
                  body: { password },
                });
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(r, null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "flingtopia-account.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setMessage("Your account JSON download is ready.");
              } else {
                const r = await api("/me/deletion-request", {
                  method: "POST",
                  body: { password },
                });
                setMessage(r.message);
              }
              form.reset();
              await load();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Confirm current password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <button className="button outline" value="export" disabled={busy}>
            Download my account JSON
          </button>
          <button
            className="button outline danger"
            value="deletion"
            disabled={busy || !!pending}
          >
            Request deletion review
          </button>
        </form>
      )}
      {pending && (
        <div className="notice">
          <p>
            Deletion request recorded: awaiting policy approval. No data has
            been deleted.
          </p>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/me/deletion-request", { method: "DELETE" });
                await load();
                setMessage("Deletion request withdrawn.");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Withdraw request
          </button>
          <a href="#profile">Manage profile visibility</a>
        </div>
      )}
    </section>
  );
}
