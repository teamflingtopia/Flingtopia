import { PhotoGallery } from "../components/PhotoGallery.jsx";
import { ProfileDetails } from "../components/ProfileDetails.jsx";
import { CreatorOptIn } from "../components/CreatorOptIn.jsx";
import React, { useState, useEffect, useRef } from "react";

import { MapPin, Check, ShieldCheck, Camera, Music } from "lucide-react";
import { api } from "../api.ts";

import { Avatar } from "../components/ui.tsx";

export function Profile({ user, setUser, notify }) {
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const draftKey = `ft-profile-draft:${user.id}`;
  const [draft, setDraft] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) || "null");
    } catch {
      return null;
    }
  });
  const initial = draft || { ...user, interests: user.interests.join(", ") };
  const [dirty, setDirty] = useState(!!draft);
  const formRef = useRef();
  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function remember() {
    const f = Object.fromEntries(new FormData(formRef.current));
    const value = { ...f, profile_visible: f.profile_visible === "on" };
    sessionStorage.setItem(draftKey, JSON.stringify(value));
    setDirty(true);
  }
  async function save(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const r = await api("/me", {
        method: "PATCH",
        body: {
          ...f,
          interests: f.interests
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          profile_visible: f.profile_visible === "on",
        },
      });
      setUser(r.user);
      sessionStorage.removeItem(draftKey);
      setDirty(false);
      notify("Profile saved. Looking good.");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE MORE YOU</span>
          <h1>Make yourself known.</h1>
          <p>The best connections start with being yourself.</p>
        </div>
      </div>
      <div className="profile-layout">
        <aside className="profile-preview">
          <Avatar person={user} />
          <h2>
            {user.display_name}, {user.age}
          </h2>
          <p>
            <MapPin size={15} />
            {user.city}
          </p>
          <span className="pill">{user.role}</span>
          <div className="profile-trust">
            <ShieldCheck size={20} />
            <div>
              <strong>
                {user.email_verified
                  ? "Email confirmed"
                  : "Email verification pending"}
              </strong>
              <span>
                {user.identity_verified
                  ? "Identity verified"
                  : "Identity verification is not yet connected."}
              </span>
            </div>
          </div>
        </aside>
        <form
          ref={formRef}
          className="settings-card stack"
          onSubmit={save}
          onChange={remember}
        >
          {dirty && (
            <p className="notice">
              Unsaved profile changes are kept in this browser tab until you
              save or discard them.{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  sessionStorage.removeItem(draftKey);
                  setDraft(null);
                  setDirty(false);
                  const form = formRef.current;
                  for (const key of [
                    "display_name",
                    "city",
                    "bio",
                    "looking_for",
                  ])
                    form.elements.namedItem(key).value = user[key];
                  form.elements.namedItem("interests").value =
                    user.interests.join(", ");
                  form.elements.namedItem("profile_visible").checked =
                    user.profile_visible;
                }}
              >
                Discard changes
              </button>
            </p>
          )}
          <h2>The details that make you, you.</h2>
          <div className="form-row">
            <label>
              Display name
              <input
                name="display_name"
                defaultValue={initial.display_name}
                minLength={2}
                maxLength={40}
                required
              />
            </label>
            <label>
              City
              <input
                name="city"
                defaultValue={initial.city}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
          </div>
          <label>
            About you
            <textarea
              rows={4}
              name="bio"
              defaultValue={initial.bio}
              maxLength={300}
              placeholder="What lights you up?"
            />
            <span className="field-hint">
              Keep it real. Up to 300 characters.
            </span>
          </label>
          <label>
            Your interests
            <input
              name="interests"
              defaultValue={initial.interests}
              placeholder="Coffee, Music, Travel"
            />
            <span className="field-hint">
              Up to 10 interests, separated by commas.
            </span>
          </label>
          <label>
            I’d like to discover
            <select name="looking_for" defaultValue={initial.looking_for}>
              <option value="everyone">Everyone</option>
              <option value="woman">Women</option>
              <option value="man">Men</option>
              <option value="nonbinary">Non-binary people</option>
              <option value="custom">
                People with a self-described gender
              </option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              name="profile_visible"
              defaultChecked={initial.profile_visible}
            />
            <span>
              Show my profile in discovery. Visitors can see my name, city and
              interests; photos remain available only to eligible signed-in
              members.
            </span>
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
            <Check size={16} />
          </button>
        </form>
      </div>
      <PhotoGallery user={user} setUser={setUser} notify={notify} />
      <ProfileDetails user={user} setUser={setUser} notify={notify} />
      <CreatorOptIn user={user} setUser={setUser} notify={notify} />
    </section>
  );
}
