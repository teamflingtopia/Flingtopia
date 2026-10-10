import { AccountRequests } from "../components/AccountRequests.jsx";
import React, { useState, useEffect } from "react";

import { UserRound, LogOut, Eye, Lock } from "lucide-react";
import { api } from "../api.ts";

export function SettingsView({ user, notify, onLogout, operations }) {
  const [reports, setReports] = useState([]),
    [reportError, setReportError] = useState("");
  const loadReports = () =>
    api("/me/reports")
      .then((r) => {
        setReports(r.reports);
        setReportError("");
      })
      .catch((e) => setReportError(e.message));
  useEffect(() => {
    loadReports();
  }, []);
  const [blocked, setBlocked] = useState([]),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/blocks")
      .then((r) => setBlocked(r.people))
      .catch((e) => notify(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="narrow-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR SPACE. YOUR RULES.</span>
          <h1>Comfort comes first.</h1>
          <p>Manage your account and the people who can reach you.</p>
        </div>
      </div>
      <div className="settings-card">
        <h2>Account access</h2>
        <p>
          Reset your password by email. A successful reset signs out all
          devices.
        </p>
        <a className="button outline" href="#forgot-password">
          Reset password
        </a>
      </div>
      <div className="settings-card">
        <div className="settings-title">
          <Lock size={21} />
          <h2>Privacy & safety</h2>
        </div>
        <p>
          Messages open only after a mutual match. Blocking someone immediately
          removes their access to your profile and conversations.
        </p>
        <a className="button outline" href="#profile">
          <Eye size={17} />
          Manage profile visibility
        </a>
        <hr />
        <h3>Blocked profiles</h3>
        {blocked.length ? (
          blocked.map((p) => (
            <div className="blocked-row" key={p.id}>
              <strong>{p.display_name}</strong>
              <button
                className="button outline small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/blocks/${p.id}`, { method: "DELETE" });
                    await load();
                    notify(
                      "Profile unblocked. Previous matches are not restored.",
                    );
                  } catch (e) {
                    notify(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Unblock
              </button>
            </div>
          ))
        ) : (
          <p className="muted">You haven’t blocked anyone.</p>
        )}
      </div>
      <div className="settings-card">
        <div className="settings-title">
          <UserRound size={21} />
          <h2>Your account</h2>
        </div>
        <div className="account-line">
          <span>Email</span>
          <strong>{user.email}</strong>
        </div>
        <div className="account-line">
          <span>Account type</span>
          <strong>{user.role}</strong>
        </div>
        <p className="muted small">
          Account deletion is not yet available. You can request a review or
          hide your profile while retention rules are finalized.
        </p>
        <button className="button outline" onClick={onLogout}>
          <LogOut size={17} />
          Sign out
        </button>
      </div>
      <section className="settings-card">
        <h2>Your reports</h2>
        {reportError && (
          <p className="error" role="alert">
            {reportError}
          </p>
        )}
        <button className="text-button" onClick={loadReports}>
          Refresh report status
        </button>
        {reports.map((r) => (
          <div className="report-row" key={r.id}>
            <span>{r.category.replaceAll("_", " ")}</span>
            <strong>{r.status}</strong>
            <time>{new Date(r.created_at).toLocaleDateString()}</time>
          </div>
        ))}
      </section>
      <AccountRequests user={user} enabled={operations?.account_requests} />
    </section>
  );
}
