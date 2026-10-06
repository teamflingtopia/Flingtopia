import React, { useState, useEffect, useRef } from "react";
import { Send, Check, CheckCheck, MessageCircle } from "lucide-react";
import { api } from "../api.ts";
import { Avatar, Spinner, Empty, Modal } from "../components/ui.tsx";
import { backToList, openDetail, restoreListView } from "../routing.ts";
import { ReportModal } from "./ReportModal.jsx";
const messageTime = (m) =>
  (m.cursor_time || m.created_at).replace(
    /\.(\d+)Z$/,
    (_, digits) => `.${digits.padEnd(6, "0")}Z`,
  );
const merge = (previous, incoming) =>
  [...new Map([...previous, ...incoming].map((m) => [m.id, m])).values()].sort(
    (a, b) =>
      messageTime(a).localeCompare(messageTime(b)) || a.id.localeCompare(b.id),
  );
export function Messages({ user, notify, reload, selected, setSelected }) {
  const pendingKey = `ft-pending-message:${user.id}:${selected}`;
  const readPending = () => {
    try {
      return JSON.parse(sessionStorage.getItem(pendingKey) || "null");
    } catch {
      return null;
    }
  };
  const [conversations, setConversations] = useState([]),
    [current, setCurrent] = useState(null),
    [messages, setMessages] = useState([]),
    [text, setText] = useState(""),
    [pending, setPending] = useState(readPending),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [inboxError, setInboxError] = useState(""),
    [hasMore, setHasMore] = useState(false),
    [olderBusy, setOlderBusy] = useState(false),
    [report, setReport] = useState(false),
    [confirm, setConfirm] = useState(false),
    [version, setVersion] = useState(0),
    [revoked, setRevoked] = useState(false);
  const mounted = useRef(true),
    end = useRef(),
    scroller = useRef(),
    olderLoaded = useRef(false),
    cursor = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await api("/conversations");
        if (active) {
          setConversations(r.conversations);
          setInboxError("");
        }
      } catch (e) {
        if (active) setInboxError(e.message);
      } finally {
        inFlight = false;
        if (active && !selected) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selected, version]);
  useEffect(() => {
    if (!selected) return;
    let active = true,
      inFlight = false;
    setLoading(true);
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const c = await api(`/conversations/${selected}`);
        const r = await api(`/conversations/${selected}/messages`);
        if (!active) return;
        const saved = readPending();
        if (saved && r.messages.some((m) => m.client_id === saved.client_id)) {
          sessionStorage.removeItem(pendingKey);
          setPending(null);
          setText("");
        }
        setCurrent(c.conversation);
        setMessages((m) => merge(m, r.messages));
        setError("");
        setRevoked(false);
        if (!olderLoaded.current) {
          setHasMore(r.has_more);
          cursor.current = r.messages[0];
        }
        await api(`/conversations/${selected}/read`, { method: "POST" });
      } catch (e) {
        if (active) {
          setError(e.message);
          if ([401, 403, 404].includes(e.status)) {
            setRevoked(true);
            setCurrent(null);
            setMessages([]);
          }
        }
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selected, version]);
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200)
      end.current?.scrollIntoView({ block: "end" });
  }, [messages.at(-1)?.id]);
  useEffect(() => {
    if (!selected && !loading) restoreListView();
  }, [selected, loading]);
  async function older() {
    if (!cursor.current || olderBusy) return;
    setOlderBusy(true);
    const el = scroller.current;
    const height = el?.scrollHeight || 0;
    const top = el?.scrollTop || 0;
    try {
      const first = cursor.current;
      const r = await api(
        `/conversations/${selected}/messages?${new URLSearchParams({ before: first.cursor_time || first.created_at, before_id: first.id })}`,
      );
      if (!mounted.current) return;
      olderLoaded.current = true;
      cursor.current = r.messages[0] || first;
      setMessages((m) => merge(m, r.messages));
      setHasMore(r.has_more);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = top + el.scrollHeight - height;
      });
    } catch (e) {
      if (mounted.current) notify(e.message);
    } finally {
      if (mounted.current) setOlderBusy(false);
    }
  }
  async function send(e) {
    e?.preventDefault();
    if (busy || revoked || (!pending && !text.trim())) return;
    const attempt = pending || {
      client_id: crypto.randomUUID(),
      body: text.trim(),
    };
    setPending(attempt);
    sessionStorage.setItem(pendingKey, JSON.stringify(attempt));
    setBusy(true);
    setError("");
    try {
      const r = await api(`/conversations/${selected}/messages`, {
        method: "POST",
        body: attempt,
      });
      if (!mounted.current) return;
      setMessages((m) => merge(m, [r.message]));
      setText("");
      setPending(null);
      sessionStorage.removeItem(pendingKey);
      reload();
      requestAnimationFrame(() =>
        end.current?.scrollIntoView({ block: "end" }),
      );
    } catch (e) {
      if (mounted.current) {
        setError(e.message);
        if ([401, 403, 404].includes(e.status)) setRevoked(true);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE A CONNECTION</span>
          <h1>{selected ? "Your conversation" : "Messages"}</h1>
          <p>
            Text conversations with your mutual matches. Messages refresh
            periodically.
          </p>
        </div>
      </div>
      <div className={`inbox ${selected ? "thread-open" : "inbox-only"}`}>
        <aside className="conversation-list">
          <div className="inbox-label">
            Messages <span>{conversations.length}</span>
          </div>
          {inboxError && (
            <p role="alert" className="error">
              {inboxError}
              <button onClick={() => setVersion((v) => v + 1)}>
                Retry inbox
              </button>
            </p>
          )}
          {!selected && loading && <Spinner />}
          {conversations.map((c) => (
            <button
              key={c.id}
              id={`thread-${c.id}`}
              className={`conversation ${selected === c.id ? "active" : ""}`}
              disabled={busy}
              onClick={() => setSelected(c.id)}
            >
              <Avatar person={c.person} />
              <span>
                <strong>{c.person.display_name}</strong>
                <small>{c.last_message || "You matched. Say hello!"}</small>
              </span>
              {c.unread > 0 && <i>{c.unread}</i>}
            </button>
          ))}
          {!loading && !inboxError && !conversations.length && (
            <p className="muted padded">Mutual matches appear here.</p>
          )}
        </aside>
        <div className="chat-panel">
          {selected && (
            <button
              className="text-button padded"
              onClick={() => backToList("messages")}
            >
              ← Back to inbox
            </button>
          )}
          {selected && loading ? (
            <Spinner />
          ) : current ? (
            <>
              <header className="chat-header">
                <Avatar person={current.person} />
                <button
                  className="text-button"
                  onClick={() => openDetail(`people/${current.person.id}`)}
                >
                  {current.person.display_name}
                </button>
                <button className="text-button" onClick={() => setReport(true)}>
                  Report
                </button>
                <button
                  className="text-button danger"
                  onClick={() => setConfirm(true)}
                >
                  Unmatch
                </button>
              </header>
              {error && (
                <p className="error padded" role="alert">
                  {error}
                  <button
                    className="text-button"
                    onClick={() => setVersion((v) => v + 1)}
                  >
                    Refresh conversation
                  </button>
                </p>
              )}
              <div className="chat-messages" ref={scroller}>
                {hasMore && (
                  <button
                    className="button outline"
                    disabled={olderBusy}
                    onClick={older}
                  >
                    {olderBusy ? "Loading…" : "Load earlier messages"}
                  </button>
                )}
                {!messages.length && (
                  <p className="muted">You matched. Say hello!</p>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`message ${m.sender_id === user.id ? "own" : ""}`}
                  >
                    <p>{m.body}</p>
                    <span>
                      {new Date(m.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {m.sender_id === user.id &&
                        (m.read_at ? (
                          <CheckCheck size={12} aria-label="Read" />
                        ) : (
                          <Check size={12} aria-label="Accepted" />
                        ))}
                    </span>
                  </div>
                ))}
                {pending && (
                  <div className="message own">
                    <p>{pending.body}</p>
                    <span role="status">
                      {busy ? "Sending…" : "Not confirmed — retry safely"}
                    </span>
                    {!busy && !revoked && (
                      <button className="text-button" onClick={() => send()}>
                        Retry same message
                      </button>
                    )}
                  </div>
                )}
                <div ref={end} />
              </div>
              <form className="message-form" onSubmit={send}>
                <input
                  aria-label="Message"
                  placeholder="Say hello…"
                  value={text}
                  maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy || !!pending || revoked}
                />
                <button
                  className="send-button"
                  aria-label={pending ? "Retry message" : "Send message"}
                  disabled={busy || revoked || (!pending && !text.trim())}
                >
                  <Send size={19} />
                </button>
              </form>
            </>
          ) : (
            <Empty
              icon={MessageCircle}
              title={
                selected ? "Conversation unavailable" : "Choose a conversation"
              }
              action={
                selected ? (
                  <button
                    className="button outline"
                    onClick={() => setVersion((v) => v + 1)}
                  >
                    Try again
                  </button>
                ) : (
                  <a className="button primary" href="#discover">
                    Discover people
                  </a>
                )
              }
            >
              {selected
                ? error
                : "Your inbox stays here until you choose a mutual match."}
            </Empty>
          )}
        </div>
      </div>
      {report && current && (
        <ReportModal
          person={current.person}
          notify={notify}
          onClose={() => setReport(false)}
        />
      )}
      {confirm && current && (
        <Modal title="End this connection?" onClose={() => setConfirm(false)}>
          <p>
            Unmatching closes this conversation for both of you. Existing
            messages remain in the current system.
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/conversations/${selected}/unmatch`, {
                  method: "POST",
                });
                setConfirm(false);
                setSelected(null);
                reload();
                notify("You have unmatched.");
              } catch (e) {
                notify(e.message);
              } finally {
                if (mounted.current) setBusy(false);
              }
            }}
          >
            Unmatch {current.person.display_name}
          </button>
        </Modal>
      )}
    </section>
  );
}
