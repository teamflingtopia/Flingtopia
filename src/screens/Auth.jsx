import { policies } from "../../shared/policies.ts";
import React, { useState, useEffect } from "react";

import {
  Heart,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { api } from "../api.ts";

import { Brand } from "../components/ui.tsx";

export function Auth({
  demo,
  onAuth,
  notify,
  emailDisabled,
  socialProviders = [],
}) {
  const [mode, setMode] = useState(
      location.hash === "#signup" ? "register" : "login",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      location.hash === "#social-error"
        ? "Social sign-in could not be completed. Please restart sign-in rather than reusing an old Google link."
        : "",
    );
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await api(`/auth/${mode}`, {
        method: "POST",
        body:
          mode === "register"
            ? {
                ...f,
                terms: f.terms === "on",
                consent_version: policies.community.version,
              }
            : f,
      });
      onAuth(r.user);
      if (r.development_verification_url)
        sessionStorage.setItem("ft-dev-verify", r.development_verification_url);
      if (mode === "register")
        notify(
          r.email_sent === false
            ? r.message
            : "Your account is ready. Verify your email to start connecting.",
        );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function demoLogin(as) {
    setBusy(true);
    setError("");
    try {
      onAuth((await api("/auth/demo", { method: "POST", body: { as } })).user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-art">
        <Brand />
        <div className="auth-title">
          <span className="eyebrow">A LITTLE SPARK. A REAL CONNECTION.</span>
          <h1>
            Real People.
            <br />
            Real
            <br />
            <em>Connections.</em>
          </h1>
          <p>
            Discover, connect and experience life
            <br />
            in a whole new way.
          </p>
        </div>
        <div className="auth-collage">
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=85"
            alt="Portrait illustrating the community"
          />
          <img
            src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=85"
            alt="Portrait illustrating the community"
          />
          <span className="floating-note">
            <Heart size={18} fill="currentColor" /> Good things start with
            hello.
          </span>
        </div>
        <div className="auth-foot">
          <ShieldCheck size={18} /> For adults 18+ · Privacy and safety come
          first
        </div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-form-wrap">
          <span className="pill peach">LET'S FIND YOUR PEOPLE</span>
          <a className="text-button" href="#discover">
            Explore as a guest →
          </a>
          <h2>
            {mode === "login" ? "Welcome back." : "Make yourself at home."}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Your next connection could be one hello away."
              : "A few details, and you’re on your way."}
          </p>
          {socialProviders.length > 0 && (
            <div className="stack" style={{ marginTop: "1rem" }}>
              <p className="muted">Sign in with your existing social account</p>
              {socialProviders.map((provider) => (
                <a
                  key={provider}
                  className="button outline full"
                  href={`/api/v1/auth/social/${provider}/start`}
                >
                  Continue with {provider === "google" ? "Google" : "Apple"}
                </a>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="stack">
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                placeholder={
                  mode === "register"
                    ? "At least 12 characters"
                    : "Your password"
                }
                minLength={mode === "register" ? 12 : undefined}
                maxLength={72}
                required
              />
            </label>
            {mode === "register" && (
              <>
                <div className="form-row">
                  <label>
                    Name
                    <input
                      name="display_name"
                      placeholder="Your first name"
                      minLength={2}
                      maxLength={40}
                      required
                    />
                  </label>
                  <label>
                    Username
                    <input
                      name="username"
                      placeholder="your_handle"
                      pattern="[a-z0-9_]{3,30}"
                      title="3–30 lowercase letters, numbers, or underscores"
                      required
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Date of birth
                    <input name="dob" type="date" required />
                  </label>
                  <label>
                    Gender
                    <select name="gender">
                      <option value="woman">Woman</option>
                      <option value="man">Man</option>
                      <option value="nonbinary">Non-binary</option>
                      <option value="custom">Self-described</option>
                    </select>
                  </label>
                </div>
                <label>
                  City
                  <input
                    name="city"
                    placeholder="Mumbai"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="terms" required />
                  <span>{policies.community.text}</span>
                </label>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  {mode === "login" ? "Sign in" : "Create account"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          {mode === "login" && !emailDisabled && (
            <a className="text-button" href="#forgot-password">
              Forgot password?
            </a>
          )}
          {true && (
            <p className="switch-auth">
              {mode === "login"
                ? "New around here?"
                : "Already part of the community?"}{" "}
              <button
                className="text-button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
          )}
          {demo && (
            <div className="demo-entry">
              <span>EXPLORE THE LOCAL PREVIEW</span>
              <button
                className="button outline full"
                disabled={busy}
                onClick={() => demoLogin("member")}
              >
                Explore demo <ArrowUpRight size={17} />
              </button>
              <button
                className="text-button small"
                disabled={busy}
                onClick={() => demoLogin("moderator")}
              >
                Open moderator demo
              </button>
              <p>
                Fictional accounts and sample experiences.
                <br />
                No payments or real bookings.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
