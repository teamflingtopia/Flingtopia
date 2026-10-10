import React, { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { api } from "../api.ts";
import { fmtDate, openDetail } from "../routing.ts";

export function PublicArtwork({ kind = "person", src }) {
  const [failed, setFailed] = useState(null);
  if (src && failed !== src)
    return (
      <img
        className={`public-art ${kind}`}
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(src)}
      />
    );
  return (
    <div className={`public-art ${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 22">
        <path
          d="M12 11C9 3 4 1 2 4c-2 3 2 8 10 7zM12 11c3-8 8-10 10-7 2 3-2 8-10 7z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
export function PublicHome({ authDisabled }) {
  const [people, setPeople] = useState([]),
    [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([api("/public/people"), api("/public/events")])
      .then(([p, e]) => {
        if (active) {
          setPeople(p.people);
          setEvents(e.events);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const heading = (title, href) => (
    <div className="public-section-heading">
      <h2>{title}</h2>
      <a href={href}>View All →</a>
    </div>
  );
  const eventCards = () =>
    events.length ? (
      <div className="public-rail">
        {events.slice(0, 8).map((e) => (
          <button
            className="public-event-card"
            key={e.id}
            onClick={() => openDetail(`events/${e.id}`)}
          >
            <PublicArtwork kind="event" src={e.image_url} />
            <div className="public-card-meta">
              <h3>{e.title}</h3>
              <p>{e.city}</p>
              <p>{fmtDate(e.starts_at)}</p>
              <strong>{e.price_inr === 0 ? "Free" : `₹${e.price_inr}`}</strong>
            </div>
          </button>
        ))}
      </div>
    ) : (
      <div className="public-empty">
        Published experiences will appear here. Check back soon.
      </div>
    );
  return (
    <div className="public-home">
      <section className="public-hero">
        <div className="public-collage">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i}>
              <PublicArtwork />
            </div>
          ))}
        </div>
        <h1>
          Real People.
          <br />
          Real <em>Connections.</em>
        </h1>
        <p>Discover, connect and experience life in a whole new way.</p>
        <a
          className="button primary"
          href={authDisabled ? "#browse" : "#signup"}
        >
          {authDisabled ? "EXPLORE FLINGTOPIA" : "JOIN FLINGTOPIA"}
        </a>
      </section>
      {loading && <p role="status">Loading community…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {heading("New People", "#browse")}
      {!loading &&
        !error &&
        (people.length ? (
          <div className="public-rail">
            {people.slice(0, 8).map((p) => (
              <button
                key={p.id}
                className="public-person-card"
                onClick={() => openDetail(`people/${p.id}`)}
              >
                <PublicArtwork />
                <div className="public-card-meta">
                  <h3>{p.display_name}</h3>
                  <p>{p.city}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="public-empty">
            New people will appear here as our community grows.
          </div>
        ))}
      {heading("Trending Experiences", "#experiences")}
      {!loading && !error && eventCards()}
      {heading("Upcoming Events", "#experiences")}
      {!loading && !error && eventCards()}
      {heading("Live Now", "#live")}
      <a className="public-live-teaser" href="#live">
        <Radio size={28} />
        <div>
          <h3>Connect in the moment</h3>
          <p>Live streaming is coming soon.</p>
        </div>
        <span>→</span>
      </a>
    </div>
  );
}
