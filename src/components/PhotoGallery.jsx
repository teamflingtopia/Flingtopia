import React, { useState, useEffect } from "react";
import { api } from "../api.ts";
export function PhotoGallery({ user, setUser, notify }) {
  const [photos, setPhotos] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setPhotos((await api("/me/photos")).photos);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function action(photo, primary) {
    setBusy(true);
    try {
      await api(`/me/photos/${photo.id}${primary ? "/primary" : ""}`, {
        method: primary ? "POST" : "DELETE",
      });
      await load();
      setUser((await api("/me")).user);
      notify(primary ? "Primary photo updated." : "Photo removed.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card stack">
      <h2>Your photo gallery</h2>
      <p>
        Up to six approved or pending photos. Pending and rejected photos are
        visible only to you and staff with verified access. Photo approval does
        not verify identity.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </p>
      )}
      {loading && <p role="status">Loading photos…</p>}
      <label className="button outline">
        {busy ? "Working…" : "Add photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || !user.email_verified}
          onChange={async (e) => {
            const input = e.currentTarget,
              file = input.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const body = new FormData();
              body.append("photo", file);
              await api("/me/photos", { method: "POST", body });
              await load();
              setUser((await api("/me")).user);
              notify("Photo is awaiting review.");
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
              input.value = "";
            }
          }}
        />
      </label>
      <div className="photo-queue">
        {photos.map((p) => (
          <article key={p.id}>
            <img src={p.url} alt={`Your ${p.status} photo`} />
            <span className="pill">
              {p.status}
              {user.avatar_url === p.url ? " · primary" : ""}
            </span>
            {p.reason && <p>{p.reason}</p>}
            <div>
              {p.status === "approved" && user.avatar_url !== p.url && (
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => action(p, true)}
                >
                  Make primary
                </button>
              )}
              <button
                className="text-button danger"
                disabled={busy}
                onClick={() => action(p, false)}
              >
                Remove photo
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
