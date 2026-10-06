import { EventAdmin } from "../components/EventAdmin.jsx";
import React, { useState, useEffect, useCallback } from "react";

import { Check, Flag, Camera, Shield, RefreshCw } from "lucide-react";
import { api } from "../api.ts";

import { Spinner, Empty, Modal } from "../components/ui.tsx";
import { fmtDate } from "../routing.ts";

export function Moderation({ user, notify, reload, operations }) {
  const [queue, setQueue] = useState(null),
    [review, setReview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [photoReasons, setPhotoReasons] = useState({});
  const close = useCallback(() => setReview(null), []);
  async function load() {
    try {
      setQueue(await api("/admin/queue"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (user.staff_role) load();
  }, [user.id]);
  if (!user.staff_role)
    return (
      <Empty icon={Shield} title="Moderator access required">
        This area is available to authorized staff only.
      </Empty>
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LOOKING AFTER THE COMMUNITY</span>
          <h1>Every report deserves a review.</h1>
          <p>
            Review member concerns and profile photos. Decisions are saved in
            the audit log.
          </p>
        </div>
        <button className="button outline" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!queue ? (
        <Spinner />
      ) : (
        <>
          <div className="stat-row">
            <div>
              <Flag />
              <strong>
                {queue.reports.filter((r) => r.status === "open").length}
              </strong>
              <span>Open reports</span>
            </div>
            <div>
              <Camera />
              <strong>{queue.photos.length}</strong>
              <span>Photos to review</span>
            </div>
            <div>
              <Check />
              <strong>
                {queue.reports.filter((r) => r.status === "resolved").length}
              </strong>
              <span>Reports resolved</span>
            </div>
          </div>
          <div className="settings-card">
            <h2>Photo review</h2>
            {queue.photos.length ? (
              <div className="photo-queue">
                {queue.photos.map((p) => (
                  <article key={p.id}>
                    <img
                      src={p.pending_avatar}
                      alt={`Submitted photo for ${p.display_name}`}
                    />
                    <strong>{p.display_name}</strong>
                    <label>
                      Review reason
                      <textarea
                        value={photoReasons[p.id] || ""}
                        onChange={(e) =>
                          setPhotoReasons((v) => ({
                            ...v,
                            [p.id]: e.target.value,
                          }))
                        }
                        minLength={10}
                        maxLength={500}
                      />
                    </label>
                    <div>
                      {[true, false].map((approve) => (
                        <button
                          key={String(approve)}
                          className={`button ${approve ? "primary" : "outline"}`}
                          disabled={
                            busy ||
                            (photoReasons[p.id] || "").trim().length < 10
                          }
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await api(`/admin/photo-reviews/${p.id}`, {
                                method: "POST",
                                body: { approve, reason: photoReasons[p.id] },
                              });
                              await load();
                              notify(
                                approve ? "Photo approved." : "Photo rejected.",
                              );
                            } catch (e) {
                              notify(e.message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {approve ? "Approve" : "Reject"}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No profile photos waiting for review.</p>
            )}
          </div>
          <div className="settings-card">
            <h2>Member reports</h2>
            {queue.reports.length ? (
              queue.reports.map((r) => (
                <div className="report-row" key={r.id}>
                  <span
                    className={`pill ${r.status === "open" ? "peach" : ""}`}
                  >
                    {r.status}
                  </span>
                  <div>
                    <strong>
                      {r.target_name} · {r.category.replaceAll("_", " ")}
                    </strong>
                    <p>{r.details}</p>
                    <small>
                      Reported by {r.reporter_name} · {fmtDate(r.created_at)}
                    </small>
                    {r.resolution && (
                      <p className="muted">Decision: {r.resolution}</p>
                    )}
                  </div>
                  {r.status === "open" && (
                    <button
                      className="button outline"
                      onClick={() => setReview(r)}
                    >
                      Review
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="muted">No reports have been submitted.</p>
            )}
          </div>
        </>
      )}
      <EventAdmin
        enabled={operations?.event_publisher_roles?.includes(user.staff_role)}
        notify={notify}
      />
      {review && (
        <Modal
          title={`Review report about ${review.target_name}`}
          onClose={close}
        >
          <p>{review.details}</p>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              setBusy(true);
              try {
                await api(`/admin/reports/${review.id}`, {
                  method: "POST",
                  body: {
                    resolution: f.resolution,
                    suspend: f.suspend === "on",
                  },
                });
                setReview(null);
                await load();
                reload();
                notify("Decision saved to the audit log.");
              } catch (e) {
                notify(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Decision and reasoning
              <textarea
                name="resolution"
                required
                minLength={10}
                maxLength={1000}
                rows={4}
              />
            </label>
            <label className="checkbox">
              <input type="checkbox" name="suspend" />
              <span>Suspend the reported account and revoke its sessions</span>
            </label>
            <button className="button primary" disabled={busy}>
              Resolve report
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
