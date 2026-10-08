import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
export function ConversationSearch({ id, user }) {
  const [q, setQ] = useState(""),
    [items, setItems] = useState([]),
    [hasMore, setHasMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    setItems([]);
    setHasMore(false);
    setError("");
    if (q.trim().length < 2) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      api(
        `/conversations/${id}/messages?${new URLSearchParams({ q: q.trim() })}`,
      )
        .then((r) => {
          if (request === generation.current) {
            setItems(r.messages);
            setHasMore(r.has_more);
          }
        })
        .catch((e) => {
          if (request === generation.current) setError(e.message);
        })
        .finally(() => {
          if (request === generation.current) setBusy(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [q, id, version]);
  async function earlier() {
    if (busy || !items.length) return;
    const request = generation.current,
      first = items[0];
    setBusy(true);
    setError("");
    try {
      const r = await api(
        `/conversations/${id}/messages?${new URLSearchParams({ q: q.trim(), before: first.cursor_time || first.created_at, before_id: first.id })}`,
      );
      if (request === generation.current) {
        setItems((old) => [...r.messages, ...old]);
        setHasMore(r.has_more);
      }
    } catch (e) {
      if (request === generation.current) setError(e.message);
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  return (
    <section
      className="conversation-search padded"
      aria-label="Search this conversation"
    >
      <label>
        Search this conversation
        <input
          type="search"
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
          placeholder="At least two characters"
        />
      </label>
      {busy && <p role="status">Searching…</p>}
      {error && (
        <p role="alert" className="error">
          {error}{" "}
          <button onClick={() => setVersion((v) => v + 1)}>Retry search</button>
        </p>
      )}
      {!busy && !error && q.trim().length >= 2 && !items.length && (
        <p>No matching messages.</p>
      )}
      {hasMore && (
        <button className="text-button" disabled={busy} onClick={earlier}>
          Earlier results
        </button>
      )}
      <ol className="message-search-results">
        {items.map((m) => (
          <li key={m.id}>
            <strong>{m.sender_id === user.id ? "You" : "Member"}</strong>
            <time dateTime={m.created_at}>
              {" "}
              · {new Date(m.created_at).toLocaleString()}
            </time>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
