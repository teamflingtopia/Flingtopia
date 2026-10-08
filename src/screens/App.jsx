import { StaffGate } from "../components/StaffGate.jsx";
import { Recovery } from "./Recovery.jsx";
import { Onboarding } from "./Onboarding.jsx";
import { Details } from "./Details.jsx";
import { getEntityId, openDetail } from "../routing.ts";
import React, { useState, useEffect, useRef, useCallback } from "react";

import {
  Compass,
  Users,
  CalendarDays,
  MessageCircle,
  UserRound,
  Settings,
  LogOut,
  MapPin,
  X,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Check,
  ShieldCheck,
  Sun,
  Sparkles,
  Menu,
  Shield,
  Mail,
  TriangleAlert,
} from "lucide-react";
import { api } from "../api.ts";

import { Avatar, Brand, Spinner, Empty } from "../components/ui.tsx";
import { routeNames, getRoute, navigate, fmtDate } from "../routing.ts";
import { Auth } from "./Auth.jsx";
import { Guest } from "./Guest.jsx";
import { Search as GlobalSearch } from "./Search.jsx";
import { Discover } from "./Discover.jsx";
import { Experiences } from "./Experiences.jsx";
import { Messages } from "./Messages.jsx";
import { Profile } from "./Profile.jsx";
import { SettingsView } from "./SettingsView.jsx";
import { Moderation } from "./Moderation.jsx";
export function App() {
  const [config, setConfig] = useState(),
    [user, setUser] = useState(null),
    [initializing, setInitializing] = useState(true),
    [bootError, setBootError] = useState(""),
    [route, setRoute] = useState(getRoute),
    [toast, setToast] = useState(""),
    [menu, setMenu] = useState(false),
    [refresh, setRefresh] = useState(0),
    [conversations, setConversations] = useState([]),
    [events, setEvents] = useState([]),
    [destination, setDestination] = useState(location.hash);
  const entityId = getEntityId();
  const selectedChat = entityId;
  const setSelectedChat = (id) =>
    id ? openDetail(`messages/${id}`) : navigate("messages");
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 760px)").matches,
  );
  const navRef = useRef(),
    menuRef = useRef(),
    restoreMenuFocus = useRef(false);
  const closeMenu = () => {
    restoreMenuFocus.current = true;
    setMenu(false);
  };
  useEffect(() => {
    const media = matchMedia("(max-width: 760px)");
    const change = () => {
      setMobile(media.matches);
      if (!media.matches) setMenu(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!menu && restoreMenuFocus.current) {
      restoreMenuFocus.current = false;
      // The workspace must no longer be inert before focus can return here.
      menuRef.current?.focus();
    }
    if (!menu || !mobile) return;
    navRef.current?.querySelector("a,button")?.focus();
    const keys = (e) => {
      if (e.key === "Escape") {
        closeMenu();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...navRef.current.querySelectorAll("a[href],button:not([disabled])"),
        ];
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keys);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keys);
      document.body.style.overflow = overflow;
    };
  }, [menu, mobile]);
  const toastTimer = useRef();
  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  }, []);
  const reload = () => setRefresh((v) => v + 1);
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setConversations([]);
      setEvents([]);
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith("ft-recent-search:")) sessionStorage.removeItem(key);
    };
    window.addEventListener("ft-session-expired", expired);
    return () => window.removeEventListener("ft-session-expired", expired);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    document.title = `${routeNames[route]} · Flingtopia`;
    document.querySelector("main")?.focus({ preventScroll: true });
  }, [destination, user?.id]);
  useEffect(() => {
    const listener = () => {
      setRoute(getRoute());
      setDestination(location.hash);
      setMenu(false);
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    async function boot() {
      try {
        setConfig(await api("/config"));
        const verify = new URLSearchParams(location.search).get("verify");
        if (verify) {
          try {
            await api("/auth/verify", {
              method: "POST",
              body: { token: verify },
            });
            notify("Email verified. You’re ready to connect.");
          } catch (e) {
            notify(e.message);
          }
          history.replaceState(null, "", location.pathname + location.hash);
        }
        try {
          setUser((await api("/me")).user);
        } catch (e) {
          if (e.status !== 401) throw e;
        }
      } catch (e) {
        setBootError(e.message);
      } finally {
        setInitializing(false);
      }
    }
    boot();
  }, [notify]);
  useEffect(() => {
    if (!user || (!user.onboarding_completed && !user.is_demo)) return;
    let active = true;
    const load = async () => {
      try {
        const [c, e] = await Promise.all([
          api("/conversations"),
          api("/events"),
        ]);
        if (active) {
          setConversations(c.conversations);
          setEvents(e.events);
        }
      } catch (e) {
        if (active && e.status === 401) setUser(null);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user?.id, user?.onboarding_completed, refresh]);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setConversations([]);
      setEvents([]);
      sessionStorage.removeItem("ft-dev-verify");
      for (const key of Object.keys(sessionStorage))
        if (
          key.startsWith("ft-pending-message:") ||
          key.startsWith("ft-profile-draft:") ||
          key.startsWith("ft-pages:") ||
          key.startsWith("ft-view:") ||
          key.startsWith("ft-recent-search:")
        )
          sessionStorage.removeItem(key);
    } catch (e) {
      notify(e.message);
    }
  }
  async function verifyEmail() {
    if (config?.email_disabled) {
      notify("Email verification is unavailable in this staging environment.");
      return;
    }
    try {
      const link = sessionStorage.getItem("ft-dev-verify");
      if (link) {
        await api("/auth/verify", {
          method: "POST",
          body: { token: new URL(link).searchParams.get("verify") },
        });
        sessionStorage.removeItem("ft-dev-verify");
        setUser((await api("/me")).user);
        notify("Email verified for your local preview account.");
      } else {
        const r = await api("/auth/resend-verification", { method: "POST" });
        if (r.development_verification_url) {
          sessionStorage.setItem(
            "ft-dev-verify",
            r.development_verification_url,
          );
          notify(
            "Local verification link created. Click Verify email once more.",
          );
        } else
          notify(
            r.email_sent === false
              ? r.message
              : "Verification email sent. Check your inbox.",
          );
      }
    } catch (e) {
      notify(e.message);
    }
  }
  function openChat(id) {
    openDetail(`messages/${id}`);
    reload();
  }
  if (initializing)
    return (
      <div className="boot">
        <Brand />
        <Spinner />
      </div>
    );
  if (bootError)
    return (
      <div className="boot">
        <Brand />
        <Empty
          icon={TriangleAlert}
          title="Couldn’t connect to Flingtopia"
          action={
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              Try again
            </button>
          }
        >
          {bootError}
        </Empty>
      </div>
    );
  const common = { user, notify, reload, operations: config?.operations };
  return (
    <>
      {config?.email_disabled && (
        <div className="staging-notice" role="status">
          Staging preview — email is disabled. Verification, password recovery,
          and cancellation emails are unavailable. New accounts can save a
          profile, but cannot complete onboarding until email verification is
          available.
        </div>
      )}
      {["forgot-password", "reset-password"].includes(route) ? (
        <Recovery
          emailDisabled={config?.email_disabled}
          key={destination}
          reset={route === "reset-password"}
          onReset={() => {
            setUser(null);
            setConversations([]);
            setEvents([]);
          }}
        />
      ) : !user &&
        !["signin", "signup", "social-complete", "social-error"].includes(
          location.hash.slice(1).split("?")[0],
        ) ? (
        <Guest key={destination} route={route} entityId={entityId} />
      ) : !user ? (
        <Auth
          key={destination}
          socialProviders={config?.social_providers || []}
          emailDisabled={config?.email_disabled}
          demo={config?.demo}
          onAuth={(u) => {
            setUser(u);
            if (
              !location.hash ||
              ["unavailable", "signin", "signup"].includes(route)
            )
              navigate(u.staff_role ? "moderation" : "discover");
          }}
          notify={notify}
        />
      ) : !user.onboarding_completed && !user.is_demo ? (
        route !== "onboarding" ? (
          <Guest
            key={destination}
            route={route}
            entityId={entityId}
            user={user}
            logout={logout}
          />
        ) : (
          <>
            <Onboarding
              emailDisabled={config?.email_disabled}
              key={user.id}
              user={user}
              setUser={setUser}
              verifyEmail={verifyEmail}
              logout={logout}
              notify={notify}
            />
          </>
        )
      ) : (
        <div className="app-shell">
          <a
            className="skip-link"
            href="#main-content"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("main-content")?.focus();
            }}
          >
            Skip to content
          </a>
          <aside
            ref={navRef}
            id="main-navigation"
            inert={mobile && !menu}
            className={`sidebar ${menu ? "open" : ""}`}
          >
            {mobile && menu && (
              <button className="text-button" onClick={closeMenu}>
                Close navigation
              </button>
            )}
            <Brand />
            <div className="workspace-label">MAKE ROOM FOR MORE</div>
            <nav aria-label="Main navigation">
              {[
                [Compass, "discover"],
                [Users, "creators"],
                [CalendarDays, "experiences"],
                [MessageCircle, "messages"],
              ].map(([Icon, key]) => (
                <a
                  href={`#${key}`}
                  key={key}
                  className={route === key ? "active" : ""}
                >
                  <Icon size={20} />
                  {routeNames[key]}
                  {key === "messages" &&
                    conversations.some((c) => c.unread > 0) && (
                      <span className="nav-count">
                        {conversations.reduce((a, c) => a + c.unread, 0)}
                      </span>
                    )}
                </a>
              ))}
              <span className="nav-divider" />
              <a
                href="#profile"
                className={route === "profile" ? "active" : ""}
              >
                <UserRound size={20} />
                My profile
              </a>
              <a
                href="#settings"
                className={route === "settings" ? "active" : ""}
              >
                <Settings size={20} />
                Settings
              </a>
              {user.staff_role && (
                <a
                  href="#moderation"
                  className={route === "moderation" ? "active" : ""}
                >
                  <Shield size={20} />
                  Moderation
                </a>
              )}
            </nav>
            <div className="sidebar-card">
              <span className="spark-icon">
                <Sparkles size={20} />
              </span>
              <h3>
                A good hello
                <br />
                goes a long way.
              </h3>
              <p>
                Be curious. Be kind.
                <br />
                Be yourself.
              </p>
              <button
                className="text-button"
                onClick={() => navigate("profile")}
              >
                Make your profile yours <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="sidebar-bottom">
              <Avatar person={user} />
              <div>
                <strong>{user.display_name}</strong>
                <span>@{user.username}</span>
              </div>
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={logout}
              >
                <LogOut size={18} />
              </button>
            </div>
          </aside>
          {menu && <div className="mobile-scrim" onClick={closeMenu} />}
          <div className="workspace" inert={mobile && menu}>
            <header className="topbar">
              <Brand />
              <button
                ref={menuRef}
                aria-expanded={menu}
                aria-controls="main-navigation"
                className="icon-button mobile-menu"
                onClick={() => setMenu(!menu)}
                aria-label="Toggle navigation"
              >
                <Menu />
              </button>
              <span className="breadcrumb">
                Your world <ChevronRight size={13} />
                <strong>{routeNames[route]}</strong>
              </span>
              <div className="topbar-right">
                <a className="button outline" href="#search">
                  Search
                </a>
                <span className="location">
                  <MapPin size={15} />
                  {user.city}
                </span>
                <span className="header-divider" />
                <a href="#profile" aria-label="Open your profile">
                  <Avatar person={user} />
                </a>
              </div>
            </header>
            {config?.demo && (
              <div className="preview-banner">
                <span className="preview-dot" />
                <strong>Development preview</strong>
                <span>
                  Sample profiles and experiences · Changes are saved locally
                </span>
              </div>
            )}
            {!user.email_verified && (
              <div className="verification-banner">
                <Mail size={18} />
                <span>
                  Verify your email to like, message, and join experiences.
                </span>
                <button
                  className="text-button"
                  disabled={config?.email_disabled}
                  onClick={verifyEmail}
                >
                  {config?.demo
                    ? "Verify email locally"
                    : "Resend verification"}
                </button>
              </div>
            )}
            <main
              id="main-content"
              tabIndex={-1}
              className={`main-content ${route === "messages" ? "message-main" : ""}`}
            >
              {(route === "discover" || route === "creators") && (
                <div className="discovery-layout">
                  <section className="discovery-main">
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">
                          {route === "creators"
                            ? "CREATIVITY BRINGS US TOGETHER"
                            : "A WORLD OF POSSIBILITIES"}
                        </span>
                        <h1>{route === "creators" ? "Creators" : "People"}</h1>
                        <p>
                          {route === "creators"
                            ? "Discover creators who share what you love."
                            : "Find and connect with amazing people who share your vibe."}
                        </p>
                      </div>
                      <span className="heading-doodle">
                        <Sparkles size={40} strokeWidth={1.3} />
                      </span>
                    </div>
                    <Discover
                      key={`${user.id}:${destination}`}
                      {...common}
                      creatorMode={route === "creators"}
                      onChat={openChat}
                    />
                  </section>
                  <aside className="right-rail">
                    <div className="hello-card">
                      <div className="hello-header">
                        <span className="sun-circle">
                          <Sun size={22} />
                        </span>
                        <span>YOUR NEXT CHAPTER</span>
                      </div>
                      <h2>
                        More than
                        <br />a <em>hello.</em>
                      </h2>
                      <p>
                        Turn a shared interest into
                        <br />a shared experience.
                      </p>
                      <button
                        className="button dark"
                        onClick={() => navigate("experiences")}
                      >
                        Explore experiences <ArrowUpRight size={17} />
                      </button>
                      <span className="hello-orbit" />
                    </div>
                    <section className="rail-section">
                      <div className="section-title">
                        <h3>Your connections</h3>
                        <a href="#messages">
                          View all <ArrowRight size={14} />
                        </a>
                      </div>
                      {conversations.length ? (
                        <div className="connection-row">
                          {conversations.slice(0, 4).map((c) => (
                            <button key={c.id} onClick={() => openChat(c.id)}>
                              <div>
                                <Avatar person={c.person} />
                                {c.unread > 0 && <i />}
                              </div>
                              <span>{c.person.display_name}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="muted small">
                          Like someone. When they like you back, you’ll find
                          them here.
                        </p>
                      )}
                    </section>
                    <section className="rail-section">
                      <div className="section-title">
                        <h3>Go make a memory</h3>
                        <ArrowUpRight size={17} />
                      </div>
                      {events.slice(0, 2).map((e) => (
                        <button
                          className="mini-event"
                          key={e.id}
                          onClick={() => openDetail(`events/${e.id}`)}
                        >
                          <img src={e.image_url} alt="" />
                          <div>
                            <span>
                              {fmtDate(e.starts_at)} · {e.city}
                            </span>
                            <strong>{e.title}</strong>
                            <small>
                              {e.attending
                                ? "You’re on the list"
                                : `${e.capacity - e.attendees} spots available`}
                            </small>
                          </div>
                        </button>
                      ))}
                    </section>
                    <div className="safety-note">
                      <ShieldCheck size={22} />
                      <div>
                        <strong>Your comfort comes first.</strong>
                        <p>
                          You’re in control of your profile and who you connect
                          with.
                        </p>
                        <a href="#settings">
                          Privacy & safety <ArrowUpRight size={13} />
                        </a>
                      </div>
                    </div>
                    <p className="rail-footer">
                      Flingtopia · Make space for connection.
                    </p>
                  </aside>
                </div>
              )}
              {route === "experiences" && (
                <Experiences key={destination} {...common} />
              )}{" "}
              {route === "messages" && (
                <Messages
                  key={entityId || "inbox"}
                  {...common}
                  conversations={conversations}
                  selected={selectedChat}
                  setSelected={setSelectedChat}
                />
              )}{" "}
              {route === "search" && (
                <GlobalSearch key={destination} user={user} />
              )}
              {route === "profile" && <Profile {...common} setUser={setUser} />}{" "}
              {route === "settings" && (
                <SettingsView {...common} onLogout={logout} />
              )}{" "}
              {route === "moderation" &&
                (user.staff_role ? (
                  <StaffGate>
                    <Moderation {...common} />
                  </StaffGate>
                ) : (
                  <Empty title="Access denied">
                    This workspace requires a staff role.
                  </Empty>
                ))}
              {["people", "events"].includes(route) && (
                <Details
                  key={`${route}/${entityId}`}
                  {...common}
                  kind={route}
                  id={entityId}
                  onChat={openChat}
                />
              )}
              {route === "unavailable" && (
                <Empty
                  title="Page unavailable"
                  action={<a href="#discover">Back to people</a>}
                >
                  Check the link or return to discovery.
                </Empty>
              )}
            </main>
            <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
              {[
                ["discover", Users, "People"],
                ["experiences", CalendarDays, "Experiences"],
                ["creators", Sparkles, "Creators"],
                ["messages", MessageCircle, "Messages"],
                ["profile", UserRound, "Profile"],
              ].map(([key, Icon, label]) => (
                <a
                  key={key}
                  href={`#${key}`}
                  className={route === key ? "active" : ""}
                  aria-current={route === key ? "page" : undefined}
                >
                  <Icon size={21} />
                  <span>{label}</span>
                </a>
              ))}
            </nav>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
