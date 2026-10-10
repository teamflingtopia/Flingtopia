import React, { useState, useEffect, useRef } from "react";
import { api } from "../api.ts";
import { Brand } from "../components/ui.tsx";
import {
  fmtDate,
  backToList,
  openDetail,
  routeQuery,
  replaceFilters,
  restoreListView,
} from "../routing.ts";
import { Search } from "./Search.jsx";
import "./Guest.css";

export function Guest({ route, entityId, user, logout, authDisabled = false }) {
  const isEvent = route === "experiences" || route === "events";
  const creators = route === "creators";
  const browsing = [
    "discover",
    "creators",
    "experiences",
    "people",
    "events",
  ].includes(route);
  const detail = route === "people" || route === "events";
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(routeQuery().get("q") || ""),
    [next, setNext] = useState(null),
    [more, setMore] = useState(false),
    [prompt, setPrompt] = useState("");
  const base = isEvent ? "events" : "people";
  const generation = useRef(0);
  useEffect(() => {
    if (browsing && !detail) replaceFilters({ q: query });
  }, [browsing, detail, query]);
  useEffect(() => {
    if (browsing && !loading) restoreListView();
  }, [browsing, loading]);
  useEffect(() => {
    if (!browsing) return;
    generation.current++;
    let active = true;
    setLoading(true);
    setError("");
    setItems([]);
    setNext(null);
    setPrompt("");
    setMore(false);
    const timer = setTimeout(() => {
      const path = detail
        ? `/public/${base}/${encodeURIComponent(entityId || "")}`
        : `/public/${base}?q=${encodeURIComponent(query)}&role=${creators ? "creator" : "all"}`;
      api(path)
        .then((data) => {
          if (!active) return;
          setItems(detail ? [data[isEvent ? "event" : "person"]] : data[base]);
          setNext(isEvent ? data.next_offset : data.next_cursor);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      generation.current++;
      clearTimeout(timer);
    };
  }, [base, detail, entityId, query, creators, browsing]);
  async function loadMore() {
    if (more || next == null) return;
    setMore(true);
    setError("");
    const requestGeneration = generation.current;
    try {
      const data = await api(
        `/public/${base}?q=${encodeURIComponent(query)}&role=${creators ? "creator" : "all"}&${isEvent ? "offset" : "cursor"}=${encodeURIComponent(next)}`,
      );
      if (requestGeneration !== generation.current) return;
      setItems((old) => [...old, ...data[base]]);
      setNext(isEvent ? data.next_offset : data.next_cursor);
    } catch (e) {
      if (requestGeneration === generation.current) setError(e.message);
    } finally {
      if (requestGeneration === generation.current) setMore(false);
    }
  }
  function requireAccount(action) {
    setPrompt(
      authDisabled
        ? `This feature is temporarily unavailable. Keep exploring people, creators, and experiences.`
        : user
          ? `Complete your profile to ${action}.`
          : `Sign in or create an account to ${action}.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <div className="guest-page">
      <a
        className="skip-link"
        href="#guest-main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("guest-main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="guest-header">
        <Brand />
        <nav aria-label="Explore navigation">
          <a
            href="#discover"
            aria-current={route === "discover" ? "page" : undefined}
          >
            People
          </a>
          <a href="#creators" aria-current={creators ? "page" : undefined}>
            Creators
          </a>
          <a href="#experiences" aria-current={isEvent ? "page" : undefined}>
            Experiences
          </a>
          <a
            href="#search"
            aria-current={route === "search" ? "page" : undefined}
          >
            Search
          </a>
          <button
            className="text-button"
            onClick={() => requireAccount("send messages")}
          >
            Messages
          </button>
          <button
            className="text-button"
            onClick={() => requireAccount("create content")}
          >
            Create
          </button>
        </nav>
        <div className="guest-actions">
          {authDisabled ? null : user ? (
            <>
              <span>Signed in as {user.display_name}</span>
              <a className="button primary" href="#onboarding">
                Complete profile
              </a>
              <button className="text-button" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <a className="button outline" href="#signin">
                Sign in
              </a>
              <a className="button primary" href="#signup">
                Sign up
              </a>
            </>
          )}
        </div>
      </header>
      <main id="guest-main" tabIndex={-1} className="guest-main">
        {prompt && (
          <section className="guest-prompt" aria-label="Account required">
            <p role="status">{prompt}</p>
            <div className="guest-actions">
              {authDisabled ? null : user ? (
                <a className="button primary" href="#onboarding">
                  Complete profile
                </a>
              ) : (
                <>
                  <a className="button primary" href="#signin">
                    Sign in
                  </a>
                  <a className="button outline" href="#signup">
                    Create account
                  </a>
                </>
              )}
              <button className="text-button" onClick={() => setPrompt("")}>
                Keep exploring
              </button>
            </div>
          </section>
        )}
        {route === "search" ? (
          <Search publicOnly user={user} />
        ) : !browsing ? (
          <section className="guest-empty">
            <h1>
              {route === "unavailable"
                ? "Page unavailable"
                : "Sign in to continue"}
            </h1>
            <p>
              {user
                ? "Complete your profile to access this area."
                : "This area requires an account."}
            </p>
            <a
              className="button primary"
              href={user ? "#onboarding" : "#signin"}
            >
              {user ? "Complete profile" : "Sign in"}
            </a>
            <a className="text-button" href="#discover">
              Explore people
            </a>
          </section>
        ) : (
          <>
            <span className="eyebrow">EXPLORE FLINGTOPIA</span>
            <h1>
              {isEvent
                ? "Find your next shared experience."
                : creators
                  ? "Discover creators who share what you love."
                  : "Good connections start with curiosity."}
            </h1>
            <p className="muted">
              {authDisabled
                ? "Explore people, creators, and experiences. No account needed."
                : user
                  ? "You’re signed in. Explore now, then complete your age, profile, and consent details before connecting."
                  : "Browse as a guest. Join to connect, message, and take part."}
            </p>

            {detail ? (
              <button
                className="text-button"
                onClick={() => backToList(isEvent ? "experiences" : "discover")}
              >
                ← Back to results
              </button>
            ) : (
              <label className="guest-search">
                Search {isEvent ? "experiences" : "people"}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={100}
                  placeholder={
                    isEvent
                      ? "Title, category, or city"
                      : "Name, interest, or city"
                  }
                />
              </label>
            )}
            {loading && <p role="status">Loading…</p>}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {!loading && !error && !items.length && (
              <section className="guest-empty">
                <h2>
                  {isEvent
                    ? "More experiences are on the way."
                    : "The community is growing."}
                </h2>
                <p>
                  {authDisabled
                    ? "Check back soon for more people and experiences."
                    : user
                      ? "Complete your profile while the community grows."
                      : "Check back soon, or create an account to get started."}
                </p>
                {!authDisabled && (
                  <a
                    href={user ? "#onboarding" : "#signup"}
                    className="button primary"
                  >
                    {user ? "Complete profile" : "Join Flingtopia"}
                  </a>
                )}
              </section>
            )}
            <div className="guest-grid">
              {items.map((item) => (
                <article className="guest-card" key={item.id}>
                  {isEvent ? (
                    <>
                      <span className="pill peach">{item.category}</span>
                      <h2>{item.title}</h2>
                      <p>
                        {item.city} · {fmtDate(item.starts_at)}
                      </p>
                      <p>
                        {detail
                          ? item.description
                          : item.description.slice(0, 180)}
                      </p>
                      <p>
                        {item.price_inr === 0
                          ? "Free experience"
                          : `₹${item.price_inr}`}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="guest-avatar" aria-hidden="true">
                        {item.display_name.slice(0, 1)}
                      </div>
                      <h2>{item.display_name}</h2>
                      <p>{item.city}</p>
                      <div className="guest-interests">
                        {item.interests?.map((interest) => (
                          <span className="pill" key={interest}>
                            {interest}
                          </span>
                        ))}
                      </div>
                      <p className="muted">Limited public profile preview</p>
                    </>
                  )}
                  <div className="guest-actions">
                    {!detail && (
                      <button
                        id={`guest-${item.id}`}
                        className="button outline"
                        onClick={() => openDetail(`${base}/${item.id}`)}
                      >
                        View {isEvent ? "experience" : "profile"}
                      </button>
                    )}
                    {isEvent ? (
                      <button
                        className="button primary"
                        onClick={() => requireAccount("book an experience")}
                      >
                        Join experience
                      </button>
                    ) : (
                      <>
                        <button
                          className="button primary"
                          onClick={() => requireAccount("message this member")}
                        >
                          Message
                        </button>
                        <button
                          className="button outline"
                          onClick={() => requireAccount("like this profile")}
                        >
                          Like
                        </button>
                        <button
                          className="text-button"
                          onClick={() => requireAccount("follow this member")}
                        >
                          Follow
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {!detail && next != null && (
              <button
                className="button outline"
                disabled={more || loading}
                onClick={loadMore}
              >
                {more ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
