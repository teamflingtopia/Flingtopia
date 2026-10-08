import {
  openDetail,
  routeQuery,
  replaceFilters,
  restoreListView,
} from "../routing.ts";
import React, { useState, useEffect, useCallback, useRef } from "react";

import {
  MessageCircle,
  Search,
  SlidersHorizontal,
  MapPin,
  Heart,
  X,
  ArrowRight,
  Check,
  ShieldCheck,
  Flag,
  MoreHorizontal,
  Plus,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { api } from "../api.ts";

import { Avatar, Empty, Modal } from "../components/ui.tsx";

export function Discover({
  user,
  notify,
  reload,
  creatorMode,

  onChat,
}) {
  const initial = routeQuery();
  const viewKey = `ft-pages:${user.id}:${location.hash}`;
  const [query, setQuery] = useState(initial.get("q") || "");
  const [people, setPeople] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [city, setCity] = useState(initial.get("city") || ""),
    [tab, setTab] = useState(
      ["creators", "following"].includes(initial.get("tab"))
        ? initial.get("tab")
        : "everyone",
    ),
    [filters, setFilters] = useState(false),
    [gender, setGender] = useState(initial.get("gender") || "everyone"),
    [interest, setInterest] = useState(initial.get("interest") || ""),
    [hasPhotos, setHasPhotos] = useState(initial.get("has_photos") === "true"),
    [min, setMin] = useState(Number(initial.get("min")) || 18),
    [max, setMax] = useState(Number(initial.get("max")) || 65),
    [busy, setBusy] = useState(""),
    [cursor, setCursor] = useState(null),
    [version, setVersion] = useState(0),
    [match, setMatch] = useState(null);
  const generation = useRef(0);
  const closeMatch = useCallback(() => setMatch(null), []);
  useEffect(() => {
    replaceFilters({
      q: query,
      city,
      tab,
      min,
      max,
      gender,
      interest,
      has_photos: String(hasPhotos),
    });
  }, [query, city, tab, min, max, gender, interest, hasPhotos]);
  useEffect(() => {
    let active = true;
    generation.current++;
    setLoading(true);
    setCursor(null);
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        let data = await api(
          `/people?${new URLSearchParams({ q: query, city, gender, interest, has_photos: String(hasPhotos), following: String(tab === "following"), min_age: min, max_age: max, role: creatorMode ? "creator" : tab === "creators" ? "creator" : "all" })}`,
        );
        let pages = 1;
        const desired = Math.min(
          25,
          Number(sessionStorage.getItem(viewKey)) || 1,
        );
        while (active && pages < desired && data.next_cursor) {
          const next = await api(
            `/people?${new URLSearchParams({ q: query, city, gender, interest, has_photos: String(hasPhotos), following: String(tab === "following"), min_age: min, max_age: max, role: creatorMode || tab === "creators" ? "creator" : "all", cursor: data.next_cursor })}`,
          );
          data = {
            people: [...data.people, ...next.people],
            next_cursor: next.next_cursor,
          };
          pages++;
        }
        if (active) {
          setPeople(data.people);
          setCursor(data.next_cursor);
        }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      generation.current++;
      clearTimeout(timer);
    };
  }, [
    query,
    city,
    min,
    max,
    tab,
    creatorMode,
    version,
    gender,
    interest,
    hasPhotos,
  ]);
  useEffect(() => {
    if (!loading) restoreListView();
  }, [loading]);
  async function action(person, type) {
    if (busy) return;
    setBusy(person.id);
    try {
      const r = await api(`/people/${person.id}/${type}`, { method: "POST" });
      if (type === "follow") {
        setPeople((v) =>
          v.map((p) =>
            p.id === person.id ? { ...p, is_following: r.following } : p,
          ),
        );

        notify(
          r.following ? `Following ${person.display_name}.` : "Unfollowed.",
        );
      } else {
        setPeople((v) => v.filter((p) => p.id !== person.id));

        if (r.matched) setMatch({ ...r, person });
        else if (type === "like")
          notify(`Like sent to ${person.display_name}.`);
        else if (type === "block")
          notify("Profile blocked. They can no longer contact you.");
        reload();
      }
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy("");
    }
  }
  async function more() {
    if (loading || busy || !cursor) return;
    const request = generation.current;
    setBusy("more");
    try {
      const r = await api(
        `/people?${new URLSearchParams({ q: query, city, gender, interest, has_photos: String(hasPhotos), following: String(tab === "following"), min_age: min, max_age: max, role: creatorMode || tab === "creators" ? "creator" : "all", cursor })}`,
      );
      if (request !== generation.current) return;
      setPeople((p) => [...p, ...r.people]);
      setCursor(r.next_cursor);
      sessionStorage.setItem(
        viewKey,
        String(Math.ceil((people.length + r.people.length) / 20)),
      );
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="search-row">
        <label className="search-box">
          <Search size={19} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, interests, a little inspiration…"
            aria-label="Search people"
          />
          {query && (
            <button
              className="icon-button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </label>
        <button
          className={`button filter-button ${filters ? "selected" : ""}`}
          onClick={() => setFilters(!filters)}
        >
          <SlidersHorizontal size={17} />
          Filters
          {(city || gender !== "everyone" || interest || hasPhotos) && (
            <span className="filter-dot" />
          )}
        </button>
      </div>
      {filters && (
        <div className="filter-panel">
          <label>
            City
            <input
              value={city}
              maxLength={100}
              placeholder="Any city"
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
          <label>
            Minimum age
            <input
              type="number"
              min="18"
              max={max}
              value={min}
              onChange={(e) =>
                setMin(
                  Math.max(18, Math.min(max, Number(e.target.value) || 18)),
                )
              }
            />
          </label>
          <label>
            Maximum age
            <input
              type="number"
              min={min}
              max="120"
              value={max}
              onChange={(e) =>
                setMax(
                  Math.max(min, Math.min(120, Number(e.target.value) || 65)),
                )
              }
            />
          </label>
          <label>
            Gender
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="everyone">Any within my preferences</option>
              <option value="woman">Women</option>
              <option value="man">Men</option>
              <option value="nonbinary">Non-binary people</option>
              <option value="custom">Self-described</option>
            </select>
          </label>
          <label>
            Interest
            <input
              value={interest}
              maxLength={30}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="e.g. Music"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={hasPhotos}
              onChange={(e) => setHasPhotos(e.target.checked)}
            />
            Has approved photos
          </label>
          <button
            className="text-button"
            onClick={() => {
              setCity("");
              setMin(18);
              setMax(65);
              setGender("everyone");
              setInterest("");
              setHasPhotos(false);
            }}
          >
            Reset
          </button>
        </div>
      )}
      <div className="feed-tabs">
        <div>
          {[
            ["everyone", creatorMode ? "Creators" : "For you"],
            ...(!creatorMode ? [["creators", "Creators"]] : []),
            ["following", "Following"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
              {key === "everyone" && <span className="tiny-spark">✦</span>}
            </button>
          ))}
        </div>
        <span>
          {loading
            ? "Finding your people…"
            : `${people.length} profiles to explore`}
        </span>
      </div>
      {error ? (
        <Empty
          icon={TriangleAlert}
          title="We couldn’t load profiles"
          action={
            <button
              className="button outline"
              onClick={() => setVersion((v) => v + 1)}
            >
              Try again
            </button>
          }
        >
          {error}
        </Empty>
      ) : loading ? (
        <div className="people-grid">
          {[1, 2, 3, 4].map((i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      ) : people.length ? (
        <div className="people-grid">
          {people.map((person, index) => (
            <article
              className="person-card"
              key={person.id}
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <button
                className="person-portrait"
                id={`person-${person.id}`}
                onClick={() => openDetail(`people/${person.id}`)}
                aria-label={`View ${person.display_name}'s profile`}
              >
                {person.avatar_url ? (
                  <img
                    src={person.avatar_url}
                    alt={person.display_name}
                    loading={index > 3 ? "lazy" : "eager"}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="portrait-initial">
                    {person.display_name[0]}
                  </span>
                )}
                <span className="portrait-shade" />
                {person.role !== "user" && (
                  <span className="creator-tag">
                    <Sparkles size={11} />
                    {person.role === "influencer" ? "Influencer" : "Creator"}
                  </span>
                )}
                {person.is_demo && <span className="sample-tag">Sample</span>}
                <div className="portrait-caption">
                  <h2>
                    {person.display_name}
                    <span>, {person.age}</span>
                    {person.identity_verified && <ShieldCheck size={17} />}
                  </h2>
                  <span>
                    <MapPin size={13} />
                    {person.city}
                  </span>
                </div>
              </button>
              <div className="mobile-person-info">
                <h2>
                  {person.display_name}, {person.age}
                  {person.identity_verified && <ShieldCheck size={14} />}
                </h2>
                <p>
                  {person.city}
                  {person.is_demo ? " · Sample profile" : ""}
                </p>
                <div className="interest-tags">
                  {person.interests.slice(0, 2).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </div>
              <button
                className="mobile-profile-button"
                id={`person-mobile-${person.id}`}
                onClick={() => openDetail(`people/${person.id}`)}
              >
                View Profile
              </button>
              <div className="person-info">
                <p>
                  {person.bio ||
                    "A new face in the community. Say hello with a like."}
                </p>
                <div className="interest-tags">
                  {person.interests.slice(0, 3).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <div className="card-actions">
                  <button
                    className="pass-button"
                    aria-label={`Pass ${person.display_name}`}
                    disabled={busy === person.id}
                    onClick={() => action(person, "pass")}
                  >
                    <X size={21} />
                  </button>
                  <button
                    className="like-button"
                    disabled={busy === person.id}
                    onClick={() => action(person, "like")}
                  >
                    <Heart size={17} />
                    Like profile
                  </button>
                  <button
                    className="more-button"
                    aria-label={`More about ${person.display_name}`}
                    id={`person-more-${person.id}`}
                    onClick={() => openDetail(`people/${person.id}`)}
                  >
                    <MoreHorizontal size={21} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="A little space for something new"
          action={
            <button
              className="button outline"
              onClick={async () => {
                try {
                  await api("/people/reset-passes", { method: "POST" });
                  setQuery("");
                  setCity("");
                  setMin(18);
                  setMax(65);
                  setGender("everyone");
                  setInterest("");
                  setHasPhotos(false);
                  setVersion((v) => v + 1);
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              Reset filters & passed profiles
            </button>
          }
        >
          No profiles match right now. Try another city or broaden your filters.
          People you’ve already liked are hidden from discovery.
        </Empty>
      )}
      {cursor && (
        <button
          className="button outline load-more"
          disabled={busy === "more"}
          onClick={more}
        >
          Discover more <ArrowRight size={16} />
        </button>
      )}
      <p className="feed-footer">
        <Heart size={13} /> Connections start with curiosity. Take your time.
      </p>
      {match && (
        <Modal title="A little spark. A mutual match." onClose={closeMatch}>
          <div className="match-celebration">
            <div className="match-avatars">
              <Avatar person={user} />
              <Heart fill="currentColor" />
              <Avatar person={match.person} />
            </div>
            <h2>
              You and {match.name}
              <br />
              liked each other.
            </h2>
            <p>The next part starts with a hello.</p>
            <button
              className="button primary full"
              onClick={() => {
                onChat(match.match_id);
                setMatch(null);
              }}
            >
              Say hello <MessageCircle size={18} />
            </button>
            <button className="text-button" onClick={closeMatch}>
              Keep exploring
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
