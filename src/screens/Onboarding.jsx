import React, { useState, useRef, useEffect } from "react";
import { api } from "../api.ts";
import { policies } from "../../shared/policies.ts";
export function Onboarding({ user, setUser, verifyEmail, logout, notify }) {
  const [draft, setDraft] = useState(() => ({
    display_name: user.display_name,
    city: user.city,
    bio: user.bio,
    interests: user.interests,
    looking_for: user.looking_for,
    profile_visible: user.profile_visible,
    step: "profile",
    ...user.onboarding_draft,
  }));
  const [interestText, setInterestText] = useState(draft.interests.join(", "));
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false);
  const dirty = useRef(false),
    queue = useRef(Promise.resolve()),
    current = useRef(draft);
  function change(patch) {
    dirty.current = true;
    current.current = { ...current.current, ...patch };
    setDraft(current.current);
  }
  function persist(value) {
    const request = queue.current
      .catch(() => {})
      .then(() => api("/me/onboarding", { method: "PATCH", body: value }));
    queue.current = request;
    return request;
  }
  useEffect(() => {
    if (!dirty.current) return;
    setStatus("Unsaved changes");
    const timer = setTimeout(() => {
      const value = draft;
      setStatus("Saving…");
      persist(value)
        .then(() => {
          if (current.current === value) {
            dirty.current = false;
            setStatus("Progress saved");
            setError("");
          }
        })
        .catch((e) => {
          setError(e.message);
          setStatus("Not saved — use Save progress to retry");
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    const warn = (e) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  async function save(finish = false) {
    setBusy(true);
    setError("");
    try {
      await persist(current.current);
      dirty.current = false;
      setStatus("Progress saved");
      if (finish) {
        const r = await api("/me/onboarding/complete", {
          method: "POST",
          body: {
            ...current.current,
            terms: consent,
            consent_version: policies.community.version,
          },
        });
        setUser(r.user);
        notify("Your profile is ready. Start exploring.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const steps = ["profile", "preferences", "review"];
  return (
    <section className="settings-card stack onboarding-card">
      <span className="eyebrow">WELCOME TO FLINGTOPIA</span>
      <h1>Make room for connection.</h1>
      <p>
        Your progress is saved to your account. You can return after signing in
        on another device.
      </p>
      <nav aria-label="Onboarding steps" className="feed-tabs">
        {steps.map((step, i) => (
          <button
            key={step}
            className={draft.step === step ? "active" : ""}
            onClick={() => change({ step })}
          >
            {i + 1}. {step}
          </button>
        ))}
      </nav>
      {!user.email_verified && (
        <div className="notice">
          <p>
            Confirm your email before finishing. Email confirmation does not
            verify your age or identity.
          </p>
          <button className="button outline" onClick={verifyEmail}>
            Verify / resend email
          </button>
          <button
            className="text-button"
            onClick={async () => {
              try {
                setUser((await api("/me")).user);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            I’ve verified — refresh status
          </button>
        </div>
      )}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(draft.step === "review");
        }}
      >
        {draft.step === "profile" && (
          <>
            <label>
              Display name
              <input
                value={draft.display_name}
                onChange={(e) => change({ display_name: e.target.value })}
                minLength={2}
                maxLength={40}
                required
              />
            </label>
            <label>
              City
              <input
                value={draft.city}
                onChange={(e) => change({ city: e.target.value })}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <label>
              About you
              <textarea
                value={draft.bio}
                onChange={(e) => change({ bio: e.target.value })}
                maxLength={300}
              />
            </label>
          </>
        )}
        {draft.step === "preferences" && (
          <>
            <label>
              Interests (up to 10, comma separated)
              <input
                value={interestText}
                onChange={(e) => {
                  setInterestText(e.target.value);
                  change({
                    interests: e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  });
                }}
              />
            </label>
            <label>
              I’d like to discover
              <select
                value={draft.looking_for}
                onChange={(e) => change({ looking_for: e.target.value })}
              >
                {[
                  ["everyone", "Everyone"],
                  ["woman", "Women"],
                  ["man", "Men"],
                  ["nonbinary", "Non-binary people"],
                  ["custom", "Self-described gender"],
                ].map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.profile_visible}
                onChange={(e) => change({ profile_visible: e.target.checked })}
              />
              Show my completed profile in discovery
            </label>
          </>
        )}
        {draft.step === "review" && (
          <>
            <h2>
              {draft.display_name} · {draft.city}
            </h2>
            <p>{draft.bio || "No bio added"}</p>
            <p>{draft.interests.join(" · ")}</p>
            <p>
              Email: {user.email_verified ? "confirmed" : "pending"} · Adult
              eligibility: self-declared · Identity verification: unavailable
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              {policies.community.text}
            </label>
            <small>Consent version: {policies.community.version}</small>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p role="status" className="muted">
          {status}
        </p>
        <button
          className="button primary"
          disabled={busy || (draft.step === "review" && !user.email_verified)}
        >
          {busy
            ? "Saving…"
            : draft.step === "review"
              ? "Complete profile"
              : "Save progress"}
        </button>
        {draft.step !== "review" && (
          <button
            type="button"
            className="button outline"
            onClick={() =>
              change({ step: steps[steps.indexOf(draft.step) + 1] })
            }
          >
            Continue
          </button>
        )}
      </form>
      <button
        className="text-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await persist(current.current);
            dirty.current = false;
            await logout();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save and sign out
      </button>
    </section>
  );
}
