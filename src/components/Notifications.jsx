import React, { useState, useEffect } from "react";
import { api } from "../api.ts";
export function Notifications() {
  const [items, setItems] = useState([]),
    [error, setError] = useState("");
  async function load() {
    try {
      setItems((await api("/notifications")).notifications);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section aria-label="Event updates">
      {error && (
        <p className="error" role="alert">
          {error}
          <button onClick={load}>Retry updates</button>
        </p>
      )}
      {items.map((n) => (
        <article className="notice" key={n.id}>
          <p>{n.message}</p>
          <a href={`#events/${n.event_id}`}>View experience</a>
          {!n.read_at && (
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await api(`/notifications/${n.id}/read`, { method: "POST" });
                  await load();
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Mark read
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
