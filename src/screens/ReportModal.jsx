import React, { useState } from "react";

import { api } from "../api.ts";

import { Modal } from "../components/ui.tsx";

export function ReportModal({ person, onClose, notify }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={`Report ${person.display_name}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const data = Object.fromEntries(new FormData(e.currentTarget));
            await api("/reports", {
              method: "POST",
              body: {
                category: data.category,
                details: data.details,
                target_id: person.id,
              },
            });
            if (data.block === "on") {
              try {
                await api(`/people/${person.id}/block`, { method: "POST" });
              } catch (e) {
                notify(`Report saved, but blocking failed: ${e.message}`);
                onClose();
                return;
              }
            }
            notify(
              "Report submitted to the moderation queue. Thank you for speaking up.",
            );
            onClose();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          Your report is private. Share enough detail to help our moderation
          team review it.
        </p>
        <label>
          Reason
          <select name="category">
            {[
              ["harassment", "Harassment"],
              ["fake_profile", "Fake profile"],
              ["underage", "Underage person"],
              ["explicit_content", "Explicit content"],
              ["spam", "Spam"],
              ["other", "Something else"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          What happened?
          <textarea
            name="details"
            minLength={10}
            maxLength={2000}
            required
            rows={4}
            placeholder="Describe your concern…"
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="block" />
          Also block this profile
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          Submit report
        </button>
      </form>
    </Modal>
  );
}
