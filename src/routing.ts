export const routeNames = {
  signin: "Sign in",
  signup: "Create account",
  discover: "People",
  creators: "Creators",
  experiences: "Experiences",
  messages: "Messages",
  profile: "My profile",
  settings: "Settings",
  moderation: "Moderation",
  people: "Profile",
  events: "Experience",
  "forgot-password": "Recover account",
  "reset-password": "Reset password",
  unavailable: "Page unavailable",
};
export const getRoute = () => {
  const [base, entity, ...extra] = (
    location.hash.slice(1).split("?")[0] || "discover"
  ).split("/");
  if (
    !Object.hasOwn(routeNames, base!) ||
    extra.length ||
    (entity && !["people", "events", "messages"].includes(base!))
  )
    return "unavailable";
  if (["people", "events"].includes(base!) && !entity) return "unavailable";
  return base as keyof typeof routeNames;
};
export const getEntityId = () =>
  location.hash.slice(1).split("?")[0]?.split("/")[1] || null;
export const routeQuery = () =>
  new URLSearchParams(location.hash.split("?")[1] || "");
export function replaceFilters(values: Record<string, string | number>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (String(value)) query.set(key, String(value));
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${location.search}#${getRoute()}?${query}`,
  );
}
export const navigate = (route: string) => {
  location.hash = route;
};
export function openDetail(route: string) {
  const from = location.hash.slice(1);
  const focus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.id
      : "";
  sessionStorage.setItem(
    `ft-view:${from}`,
    JSON.stringify({ y: window.scrollY, focus }),
  );
  history.pushState(
    { ftDetail: true },
    "",
    `#${route}?from=${encodeURIComponent(from)}`,
  );
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
export function backToList(fallback: string) {
  const from = routeQuery().get("from");
  const safe =
    from && /^(discover|creators|experiences|messages)(\?[^#]*)?$/.test(from)
      ? from
      : fallback;
  if (history.state?.ftDetail) history.back();
  else navigate(safe);
}
export function restoreListView() {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`ft-view:${location.hash.slice(1)}`) || "null",
    );
    if (value)
      requestAnimationFrame(() => {
        window.scrollTo(0, value.y);
        document.getElementById(value.focus)?.focus({ preventScroll: true });
      });
  } catch {
    /* Storage restrictions must not block navigation. */
  }
}
export const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
