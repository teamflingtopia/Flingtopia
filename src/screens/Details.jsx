import React, { useState, useEffect } from "react";
import { api } from "../api.ts";
import { Avatar, Empty, Spinner } from "../components/ui.tsx";
import { backToList, navigate } from "../routing.ts";
import { ReportModal } from "./ReportModal.jsx";
export function Details({ kind, id, notify, reload, onChat }) {
  const [item, setItem] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [report, setReport] = useState(false);
  const person = kind === "people";
  useEffect(() => {
    let active = true;
    setLoading(true);
    setItem(null);
    setError("");
    api(`/${kind}/${id}`)
      .then((r) => {
        if (active) setItem(person ? r.person : r.event);
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
  }, [kind, id, version]);
  useEffect(() => {
    if (item)
      document.title = `${person ? item.display_name : item.title} · Flingtopia`;
  }, [item, person]);
  async function act(action) {
    setBusy(true);
    try {
      if (person) {
        const r = await api(`/people/${id}/${action}`, { method: "POST" });
        if (action === "block") {
          notify("Profile blocked.");
          backToList("discover");
        } else if (action === "follow")
          setItem((p) => ({ ...p, is_following: r.following }));
        else if (r.matched) {
          notify("It’s a mutual match. Say hello!");
          onChat(r.match_id);
        } else {
          setItem((p) => ({ ...p, liked: true }));
          notify("Like sent.");
        }
      } else {
        await api(`/events/${id}/rsvp`, {
          method: item.attending ? "DELETE" : "POST",
        });
        notify(
          item.attending ? "RSVP cancelled." : "You’re on the guest list.",
        );
        setVersion((v) => v + 1);
      }
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const unavailable =
    !person &&
    item &&
    (item.status !== "published" ||
      new Date(item.starts_at) <= new Date() ||
      item.price_inr > 0);
  return (
    <section className="settings-card stack detail-page">
      <button
        className="text-button"
        onClick={() => backToList(person ? "discover" : "experiences")}
      >
        ← Back to {person ? "people" : "experiences"}
      </button>
      {loading ? (
        <Spinner />
      ) : !item ? (
        <Empty
          title={person ? "Profile unavailable" : "Experience unavailable"}
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
      ) : (
        <>
          <h1>{person ? `${item.display_name}, ${item.age}` : item.title}</h1>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {person ? (
            <>
              <Avatar person={item} />
              <div className="photo-queue">
                {item.photos?.map((p) => (
                  <img
                    key={p.id}
                    src={p.url}
                    alt={`${item.display_name} gallery photo`}
                  />
                ))}
              </div>
              <p className="pill">
                {item.role} · {item.city}
              </p>
              <p>{item.bio}</p>
              <div className="interest-tags">
                {item.interests.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              {item.is_demo && (
                <p className="notice">Fictional sample profile.</p>
              )}
              {item.match_id ? (
                <button
                  className="button primary"
                  onClick={() => onChat(item.match_id)}
                >
                  Open conversation
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={busy || item.liked}
                  onClick={() => act("like")}
                >
                  {item.liked
                    ? "Like sent — waiting for a mutual match"
                    : "Like profile"}
                </button>
              )}
              {item.role !== "user" && (
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => act("follow")}
                >
                  {item.is_following ? "Unfollow" : "Follow creator · Free"}
                </button>
              )}
              <p className="muted">
                Messaging requires a mutual match. Following does not unlock
                messages.
              </p>
              <div className="profile-safety">
                <button className="text-button" onClick={() => setReport(true)}>
                  Report profile
                </button>
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => act("block")}
                >
                  Block profile
                </button>
              </div>
            </>
          ) : (
            <>
              {item.image_url && (
                <img
                  className="event-detail-image"
                  src={item.image_url}
                  alt=""
                />
              )}
              <p>{item.description}</p>
              <p>
                {new Date(item.starts_at).toLocaleString("en-IN", {
                  dateStyle: "full",
                  timeStyle: "short",
                  timeZone: item.timezone || "Asia/Kolkata",
                })}{" "}
                {item.timezone || "Asia/Kolkata"}
              </p>
              <p>
                {item.venue}, {item.city}
              </p>
              <p>
                {Math.max(0, item.capacity - item.attendees)} spots remaining
              </p>
              {item.cancellation_reason && (
                <p className="notice">
                  Cancellation reason: {item.cancellation_reason}
                </p>
              )}
              {item.rsvp_cancelled_at && (
                <p className="notice">You cancelled your RSVP.</p>
              )}
              {unavailable && (
                <p className="notice">
                  {item.status === "cancelled"
                    ? "This event was cancelled."
                    : item.price_inr > 0
                      ? "Paid reservations are unavailable."
                      : "This event is no longer accepting RSVPs."}
                </p>
              )}
              {item.is_demo && (
                <p className="notice">
                  Sample experience. No real event is booked.
                </p>
              )}
              <button
                className="button primary"
                disabled={
                  busy ||
                  (!item.attending &&
                    (unavailable || item.attendees >= item.capacity))
                }
                onClick={() => act("rsvp")}
              >
                {busy
                  ? "Saving…"
                  : item.attending
                    ? "Cancel my RSVP"
                    : item.attendees >= item.capacity
                      ? "Guest list is full"
                      : "Join guest list · Free"}
              </button>
            </>
          )}
        </>
      )}
      {report && item && (
        <ReportModal
          person={item}
          notify={notify}
          onClose={() => setReport(false)}
        />
      )}
    </section>
  );
}
