import React, { useEffect, useState } from "react";
import { api } from "../api.ts";
import { Modal } from "./ui.tsx";
export function EventAdmin({ enabled, notify }) {
  const [events, setEvents] = useState([]),
    [mail, setMail] = useState([]),
    [edit, setEdit] = useState(null),
    [cancel, setCancel] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [e, m] = await Promise.all([
        api("/admin/events"),
        api("/admin/event-delivery"),
      ]);
      setEvents(e.events);
      setMail(m.jobs);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (enabled) load();
  }, [enabled]);
  if (!enabled)
    return (
      <section className="settings-card">
        <h2>Event publishing</h2>
        <p>
          Publishing permissions are not enabled for this staff role. Only
          approved publishers can create or cancel events.
        </p>
      </section>
    );
  async function action(event, type, reason) {
    setBusy(true);
    try {
      await api(`/admin/events/${event.id}/${type}`, {
        method: "POST",
        body: { revision: event.revision, ...(reason ? { reason } : {}) },
      });
      setCancel(null);
      await load();
      notify(
        type === "publish"
          ? "Free event published."
          : "Event cancelled. Attendee notices were queued.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card stack">
      <h2>Free event operations</h2>
      <p>
        Draft events are private. Published details are frozen; cancel with an
        attendee-facing reason when plans change.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button outline" onClick={load}>
        Refresh events and delivery
      </button>
      <form
        className="stack"
        key={edit?.id || "new"}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = Object.fromEntries(new FormData(form));
          setBusy(true);
          try {
            await api(`/admin/events${edit ? `/${edit.id}` : ""}`, {
              method: edit ? "PATCH" : "POST",
              body: {
                ...f,
                starts_at: `${f.starts_at}:00Z`,
                capacity: Number(f.capacity),
                ...(edit ? { revision: edit.revision } : {}),
              },
            });
            setEdit(null);
            form.reset();
            await load();
            notify("Event draft saved.");
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>{edit ? "Edit draft" : "Create a draft"}</h3>
        {[
          ["title", "Title", 120],
          ["category", "Category", 50],
          ["city", "City", 100],
          ["venue", "Venue", 200],
        ].map(([name, label, max]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              defaultValue={edit?.[name] || ""}
              required
              maxLength={max}
            />
          </label>
        ))}
        <label>
          Description
          <textarea
            name="description"
            defaultValue={edit?.description || ""}
            required
            minLength={20}
            maxLength={3000}
          />
        </label>
        <label>
          Start date/time (UTC)
          <input
            name="starts_at"
            type="datetime-local"
            defaultValue={
              edit ? new Date(edit.starts_at).toISOString().slice(0, 16) : ""
            }
            required
          />
        </label>
        <label>
          Display time zone (IANA)
          <input
            name="timezone"
            defaultValue={edit?.timezone || "Asia/Kolkata"}
            required
            placeholder="Asia/Kolkata"
          />
        </label>
        <label>
          Capacity
          <input
            name="capacity"
            type="number"
            min={1}
            max={10000}
            defaultValue={edit?.capacity || 20}
            required
          />
        </label>
        <p>Price: free RSVP only.</p>
        <button className="button primary" disabled={busy}>
          Save draft
        </button>
        {edit && (
          <button
            type="button"
            className="text-button"
            onClick={() => setEdit(null)}
          >
            Stop editing
          </button>
        )}
      </form>
      <div>
        {events.map((e) => (
          <article className="report-row" key={e.id}>
            <span className="pill">{e.status}</span>
            <div>
              <strong>{e.title}</strong>
              <p>
                {new Date(e.starts_at).toLocaleString("en-IN", {
                  timeZone: e.timezone,
                })}{" "}
                · {e.timezone}
              </p>
              <p>
                {e.attendees}/{e.capacity} active RSVPs · {e.venue}
              </p>
              {e.cancellation_reason && <p>{e.cancellation_reason}</p>}
            </div>
            {e.status === "draft" ? (
              <>
                <button
                  disabled={busy}
                  className="button outline"
                  onClick={() => setEdit(e)}
                >
                  Edit
                </button>
                <button
                  disabled={busy}
                  className="button primary"
                  onClick={() => action(e, "publish")}
                >
                  Publish
                </button>
              </>
            ) : (
              e.status === "published" &&
              new Date(e.starts_at) > new Date() && (
                <button
                  className="button outline danger"
                  disabled={busy}
                  onClick={() => setCancel(e)}
                >
                  Cancel event
                </button>
              )
            )}
          </article>
        ))}
      </div>
      <h3>Cancellation email delivery</h3>
      {mail.length ? (
        mail.map((j) => (
          <div className="report-row" key={j.id}>
            <div>
              <strong>{j.title}</strong>
              <p>
                {j.sent_at
                  ? "Delivered to mail transport"
                  : j.failed_at
                    ? "Failed — needs attention"
                    : "Queued / retrying"}{" "}
                · {j.attempts} attempts
              </p>
            </div>
            {j.failed_at && (
              <button
                className="button outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/admin/event-delivery/${j.id}/retry`, {
                      method: "POST",
                    });
                    await load();
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Retry delivery
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="muted">No cancellation mail jobs yet.</p>
      )}
      {cancel && (
        <Modal
          title={`Cancel ${cancel.title}?`}
          onClose={() => setCancel(null)}
        >
          <p>
            This stops new RSVPs and queues a notice for every active attendee.
          </p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              action(
                cancel,
                "cancel",
                new FormData(e.currentTarget).get("reason"),
              );
            }}
          >
            <label>
              Reason shared with attendees
              <textarea
                name="reason"
                minLength={10}
                maxLength={1000}
                required
              />
            </label>
            <button className="button primary" disabled={busy}>
              Cancel and notify attendees
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
