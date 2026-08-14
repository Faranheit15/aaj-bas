/**
 * The current route, read from the browser rather than mirrored into state.
 *
 * `useSyncExternalStore` keeps `window.location.pathname` as the single
 * snapshot, so the route is derived during render. Section 14 rules out the
 * usual alternative — a `useState` seeded from the URL and re-synchronised by
 * an effect — which produces one render showing the previous page and a second
 * copy of the truth that can disagree with the address bar.
 *
 * `popstate` covers the back and forward buttons; it is not fired by
 * `pushState`, so `navigate` notifies subscribers itself.
 */
import { useSyncExternalStore } from "react";
import { LATEST_HREF, parseRoute, type Route } from "./route";

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("popstate", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
  };
}

/** A string, so identity is never a reason to re-render. */
function currentPathname(): string {
  return window.location.pathname;
}

/**
 * There is no window when this renders on a server or in a build-time render,
 * and the latest edition is the honest default: it is what `/` serves.
 */
function serverPathname(): string {
  return LATEST_HREF;
}

export function useRoute(): Route {
  return parseRoute(
    useSyncExternalStore(subscribe, currentPathname, serverPathname),
  );
}

/**
 * Moves to an in-product address.
 *
 * Scrolling happens after the notification so that the new view, not the old
 * one, is what the reader lands at the top of. Section 25's reduced-motion rule
 * needs no exception here: this is an instant jump, not an animation.
 */
export function navigate(href: string): void {
  // Following a link to the address already open must not add a history entry.
  // It would leave the reader pressing back once with nothing appearing to
  // happen, which reads as a broken product rather than as a duplicate entry.
  if (href !== window.location.pathname) {
    window.history.pushState(null, "", href);
  }

  for (const listener of listeners) {
    listener();
  }

  window.scrollTo(0, 0);
}
