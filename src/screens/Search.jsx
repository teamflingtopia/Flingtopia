import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import {
  openDetail,
  replaceFilters,
  restoreListView,
  routeQuery,
  fmtDate,
} from "../routing.ts";
import { Empty } from "../components/ui.tsx";

export function Search({ publicOnly = false, user }) {
  const initial = routeQuery();
  const [q, setQ] = useState(initial.get("q") || "");
  const [type, setType] = useState(
    ["people", "creators", "events"].includes(initial.get("type"))
      ? initial.get("type")
      : "all",
  );
  const [result, setResult] = useState({ people: [], events: [] });
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [more, setMore] = useState("");
  const storageKey = `ft-recent-search:${user?.id || "guest"}`;
  const [recent, setRecent] = useState(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
      return Array.isArray(value)
        ? value.filter((v) => typeof v === "string").slice(0, 8)
        : [];
    } catch {
      return [];
    }
  });
  const generation = useRef(0);
  const endpoint = publicOnly ? "/public/search" : "/search";
  function remember(term) {
    const value = term.trim();
    if (value.length < 2) return;
    setRecent((old) => {
      const next = [value, ...old.filter((s) => s !== value)].slice(0, 8);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* Search works without storage. */
      }
      return next;
    });
  }
  useEffect(() => {
    replaceFilters({ q, type });
    const request = ++generation.current;
    setResult({ people: [], events: [] });
    setError("");
    setMore("");
    if (q.trim().length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api(`${endpoint}?${new URLSearchParams({ q: q.trim(), type })}`)
        .then((data) => {
          if (request === generation.current) setResult(data);
        })
        .catch((e) => {
          if (request === generation.current) setError(e.message);
        })
        .finally(() => {
          if (request === generation.current) {
            setLoading(false);
            restoreListView();
          }
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [q, type, endpoint, version]);
  async function loadMore(kind) {
    if (more) return;
    const request = generation.current;
    setMore(kind);
    try {
      const next = await api(
        `${endpoint}?${new URLSearchParams({ q: q.trim(), type: kind === "people" ? (type === "creators" ? "creators" : "people") : "events", cursor: result[`next_${kind}_cursor`] })}`,
      );
      if (request === generation.current)
        setResult((old) => ({
          ...old,
          [kind]: [...old[kind], ...next[kind]],
          [`next_${kind}_cursor`]: next[`next_${kind}_cursor`],
        }));
    } catch (e) {
      if (request === generation.current) setError(e.message);
    } finally {
      if (request === generation.current) setMore("");
    }
  }
  function open(kind, item) {
    remember(q);
    openDetail(`${kind}/${item.id}`);
  }
  return (
    <section className="stack global-search">
      <div className="page-heading">
        <div>
          <span className="eyebrow">EXPLORE FLINGTOPIA</span>
          <h1>Search</h1>
          <p>Find people, creators, and experiences.</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          remember(q);
          setVersion((v) => v + 1);
        }}
        className="search-row"
      >
        <label className="search-box">
          <input
            aria-label="Search Flingtopia"
            type="search"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, username, interest, city, or experience"
          />
        </label>
        <button className="button primary" disabled={q.trim().length < 2}>
          Search
        </button>
      </form>
      <div className="feed-tabs">
        <div>
          {[
            ["all", "All"],
            ["people", "People"],
            ["creators", "Creators"],
            ["events", "Experiences"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={type === key}
              className={type === key ? "active" : ""}
              onClick={() => setType(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {q.trim().length < 2 && (
        <>
          <p>Enter at least two characters to see suggestions.</p>
          {recent.length > 0 && (
            <section aria-label="Recent searches">
              <h2>Recent searches</h2>
              <div className="guest-actions">
                {recent.map((term) => (
                  <button
                    className="button outline"
                    key={term}
                    onClick={() => setQ(term)}
                  >
                    {term}
                  </button>
                ))}
                <button
                  className="text-button"
                  onClick={() => {
                    setRecent([]);
                    try {
                      sessionStorage.removeItem(storageKey);
                    } catch {}
                  }}
                >
                  Clear recent searches
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {loading && <p role="status">Searching…</p>}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setVersion((v) => v + 1)}
          >
            Try again
          </button>
        </p>
      )}
      {!loading &&
        !error &&
        q.trim().length >= 2 &&
        !result.people.length &&
        !result.events.length && (
          <Empty title="No results yet">
            Try another name, interest, or city.
          </Empty>
        )}
      {!!result.people.length && (
        <section aria-label="People results">
          <h2>{type === "creators" ? "Creators" : "People"}</h2>
          <div className="guest-grid">
            {result.people.map((p) => (
              <article className="guest-card" key={p.id}>
                <h3>{p.display_name}</h3>
                <p>
                  {p.role} · {p.city}
                </p>
                <p>{p.interests.join(" · ")}</p>
                <button
                  id={`search-person-${p.id}`}
                  className="button outline"
                  onClick={() => open("people", p)}
                >
                  View profile
                </button>
              </article>
            ))}
          </div>
          {result.next_people_cursor && (
            <button
              className="button outline"
              disabled={!!more}
              onClick={() => loadMore("people")}
            >
              {more === "people" ? "Loading…" : "More people"}
            </button>
          )}
        </section>
      )}
      {!!result.events.length && (
        <section aria-label="Experience results">
          <h2>Experiences</h2>
          <div className="guest-grid">
            {result.events.map((e) => (
              <article className="guest-card" key={e.id}>
                <h3>{e.title}</h3>
                <p>
                  {e.city} · {fmtDate(e.starts_at)}
                </p>
                <p>{e.category}</p>
                <button
                  id={`search-event-${e.id}`}
                  className="button outline"
                  onClick={() => open("events", e)}
                >
                  View experience
                </button>
              </article>
            ))}
          </div>
          {result.next_events_cursor && (
            <button
              className="button outline"
              disabled={!!more}
              onClick={() => loadMore("events")}
            >
              {more === "events" ? "Loading…" : "More experiences"}
            </button>
          )}
        </section>
      )}
    </section>
  );
}
