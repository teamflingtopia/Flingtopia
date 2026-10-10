import React, { useState, useEffect, useRef } from "react";
import { api } from "../api.ts";
import {
  Users,
  Star,
  Radio,
  MessageCircle,
  UserRound,
  Search as SearchIcon,
} from "lucide-react";
import { PublicHome, PublicArtwork } from "./PublicHome.jsx";
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
    "browse",
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
        <a
          className="guest-search-icon"
          href="#search"
          aria-label="Search Flingtopia"
        >
          <SearchIcon size={18} />
        </a>
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
        {route === "discover" ? (
          <PublicHome authDisabled={authDisabled} />
        ) : route === "search" ? (
          <Search publicOnly user={user} />
        ) : !browsing ? (
          <section className="guest-empty guest-feature-page">
            {route === "live" ? (
              <Radio size={36} />
            ) : route === "messages" ? (
              <MessageCircle size={36} />
            ) : (
              <UserRound size={36} />
            )}
            <h1>
              {route === "live"
                ? "Live Discovery"
                : route === "messages"
                  ? "Messages"
                  : route === "profile"
                    ? "Your profile"
                    : "Page unavailable"}
            </h1>
            <p>
              {route === "live"
                ? "Watch, chat and connect with creators. Live streaming is coming soon."
                : authDisabled
                  ? "Account features are temporarily unavailable. Keep exploring people and experiences."
                  : "Sign in to connect with the community."}
            </p>
            {!authDisabled && (
              <a
                className="button primary"
                href={user ? "#onboarding" : "#signin"}
              >
                {user ? "Complete profile" : "Sign in"}
              </a>
            )}
            <a className="button outline" href="#discover">
              Keep exploring
            </a>
          </section>
        ) : (
          <>
            <a className="guest-back" href="#discover">
              ← Home
            </a>
            <h1>
              {isEvent
                ? "Experiences Marketplace"
                : creators
                  ? "Discover Creators"
                  : "People"}
            </h1>
            <p className="muted">
              {authDisabled
                ? isEvent
                  ? "Discover unique experiences and create memories together."
                  : "Find and connect with amazing people who share your vibe."
                : user
                  ? "You’re signed in. Explore now, then complete your age, profile, and consent details before connecting."
                  : "Browse as a guest. Join to connect, message, and take part."}
            </p>

            {detail ? (
              <button
                className="text-button"
                onClick={() => backToList(isEvent ? "experiences" : "browse")}
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
            {!detail && !isEvent && (
              <div className="guest-chips">
                <a className={!creators ? "active" : ""} href="#browse">
                  All people
                </a>
                <a className={creators ? "active" : ""} href="#creators">
                  Creators
                </a>
              </div>
            )}
            {!detail && isEvent && (
              <section className="guest-feature-banner">
                <Star />
                <h2>Make it unforgettable.</h2>
                <p>Explore shared experiences and create memories that last.</p>
              </section>
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
            <div
              className={
                "guest-grid " +
                (detail
                  ? "guest-detail"
                  : isEvent
                    ? "guest-events"
                    : "guest-people")
              }
            >
              {items.map((item) => (
                <article className="guest-card" key={item.id}>
                  {isEvent ? (
                    <>
                      <PublicArtwork kind="event" src={item.image_url} />
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
                      <PublicArtwork />
                      <h2>{item.display_name}</h2>
                      <p>{item.city}</p>
                      <div className="guest-interests">
                        {item.interests?.map((interest) => (
                          <span className="pill" key={interest}>
                            {interest}
                          </span>
                        ))}
                      </div>
                      {detail && (
                        <p className="muted">Limited public profile preview</p>
                      )}
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
                    {detail &&
                      (isEvent ? (
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
                            onClick={() =>
                              requireAccount("message this member")
                            }
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
                      ))}
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
      <nav className="guest-bottom-nav" aria-label="Main navigation">
        {[
          ["browse", Users, "People"],
          ["experiences", Star, "Experiences"],
          ["live", Radio, "Live"],
          ["messages", MessageCircle, "Messages"],
          ["profile", UserRound, "Profile"],
        ].map(([href, Icon, label]) => (
          <a
            key={href}
            href={"#" + href}
            aria-current={
              route === href ||
              (href === "browse" &&
                ["discover", "creators", "people"].includes(route)) ||
              (href === "experiences" && isEvent)
                ? "page"
                : undefined
            }
          >
            <Icon size={21} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
