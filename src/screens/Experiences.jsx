import { Notifications } from "../components/Notifications.jsx";
import {
  openDetail,
  routeQuery,
  replaceFilters,
  restoreListView,
} from "../routing.ts";
import React, { useState, useEffect } from "react";

import { Users, CalendarDays, MapPin, ArrowUpRight, Check } from "lucide-react";
import { api } from "../api.ts";

import { Empty } from "../components/ui.tsx";
import { fmtDate } from "../routing.ts";

export function Experiences({ user, notify, reload }) {
  const [events, setEvents] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api("/events")
      .then((r) => {
        if (active) {
          setEvents(r.events);
          setError("");
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
  }, [version]);
  const [filter, setFilter] = useState(
    routeQuery().get("filter") === "mine" ? "mine" : "all",
  );
  useEffect(() => {
    replaceFilters({ filter });
    if (!loading) restoreListView();
  }, [filter, loading]);
  const show = (e) =>
    filter === "mine"
      ? e.attending || !!e.rsvp_cancelled_at
      : e.status === "published" && new Date(e.starts_at) > new Date();
  const state = (e) =>
    e.status === "cancelled"
      ? "Event cancelled"
      : e.rsvp_cancelled_at
        ? "Your RSVP cancelled"
        : new Date(e.starts_at) <= new Date()
          ? "Past experience"
          : e.attending
            ? "You’re on the list"
            : "Upcoming";
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LESS SCROLLING. MORE LIVING.</span>
          <h1>Go make a memory.</h1>
          <p>
            Good people, shared interests, and plans worth leaving the house
            for.
          </p>
        </div>
        <CalendarDays className="heading-doodle" size={40} />
      </div>
      <Notifications />
      <div className="feed-tabs">
        <div>
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            Explore experiences
          </button>
          <button
            className={filter === "mine" ? "active" : ""}
            onClick={() => setFilter("mine")}
          >
            My plans
          </button>
        </div>
        <span>Times shown in each event’s time zone</span>
      </div>
      {loading && <p role="status">Loading experiences…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setVersion((v) => v + 1)}
          >
            Try again
          </button>
        </p>
      )}
      <div className="event-grid">
        {events.filter(show).map((e) => (
          <article className="event-card" key={e.id}>
            <button
              id={`event-${e.id}`}
              className="event-image"
              onClick={() => openDetail(`events/${e.id}`)}
            >
              {e.image_url ? (
                <img src={e.image_url} alt={e.title} />
              ) : (
                <span className="event-placeholder">
                  <CalendarDays size={48} />
                </span>
              )}
              <span className="event-date">
                {new Date(e.starts_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  timeZone: e.timezone,
                })}
              </span>
              {e.is_demo && (
                <span className="sample-tag">Sample experience</span>
              )}
            </button>
            <div className="event-body">
              <span className="eyebrow">
                {e.category} · {e.city}
              </span>
              <h2>{e.title}</h2>
              <span className="pill">{state(e)}</span>
              <p>
                {new Date(e.starts_at).toLocaleString("en-IN", {
                  timeZone: e.timezone,
                })}{" "}
                · {e.timezone}
              </p>
              <p>{e.description}</p>
              <div className="event-location">
                <MapPin size={15} />
                {e.venue}
              </div>
              <div className="event-bottom">
                <span>
                  {e.status === "cancelled" ||
                  e.rsvp_cancelled_at ||
                  new Date(e.starts_at) <= new Date() ? (
                    state(e)
                  ) : e.attending ? (
                    <>
                      <Check size={16} />
                      You’re on the list
                    </>
                  ) : (
                    <>
                      <Users size={16} />
                      {e.capacity - e.attendees} spots left
                    </>
                  )}
                </span>
                <button
                  id={`event-details-${e.id}`}
                  className="button outline"
                  onClick={() => openDetail(`events/${e.id}`)}
                >
                  View details <ArrowUpRight size={15} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!loading && !error && !events.filter(show).length && (
        <Empty
          icon={CalendarDays}
          title={
            filter === "mine"
              ? "Your next plan is waiting"
              : "No upcoming experiences"
          }
        >
          {filter === "mine"
            ? "Find something you love and join the guest list."
            : "New experiences will appear here when they’re published."}
        </Empty>
      )}
    </section>
  );
}
