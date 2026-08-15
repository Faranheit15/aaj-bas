/**
 * The reader's page frame: banner, main, footer, and one live region.
 *
 * The shell owns the landmarks so that every state — loading, ready, empty,
 * failed — is announced with the same structure. The previous shell nested the
 * `header` inside `main`, which produces no banner landmark at all, because a
 * `header` descended from `main` is a generic element rather than `banner`.
 *
 * The shell renders no navigation. There is no navigation in the reader: an
 * edition ends, and a `nav` here would advertise a region that does not exist
 * (product constitution 1, AGENTS.md section 3.1).
 */
import { useEffect, useRef } from "react";
import type { JSX, ReactNode } from "react";
import { BrandMark } from "@aaj-bas/ui";
import { ThemeChoice } from "./ThemeChoice";

/**
 * The id every view's `h1` must carry.
 *
 * Exported rather than written twice: `main` is labelled by this id, so a view
 * that spelled it differently would leave the main landmark unnamed, and
 * nothing but a screen reader would notice.
 */
export const EDITION_HEADING_ID = "edition-heading";

/**
 * The id the main landmark carries, and the fragment the skip link targets.
 *
 * Exported for the reason `EDITION_HEADING_ID` is: the `href` and the `id` are
 * written in two places, and a skip link pointing at a fragment no element
 * carries is a control that silently does nothing.
 */
export const EDITION_MAIN_ID = "edition";

type ReaderShellProps = {
  /**
   * Stable per route, and only per route. Focus moves when this changes, so a
   * value that also changed on load-state transitions would pull focus out from
   * under a reader mid-read.
   */
  readonly routeKey: string;
  /** Short signal for assistive technology; never the edition itself. */
  readonly statusMessage: string;
  readonly children: ReactNode;
};

export function ReaderShell({
  routeKey,
  statusMessage,
  children,
}: ReaderShellProps): JSX.Element {
  const mainRef = useRef<HTMLElement>(null);
  const focusedRouteKey = useRef(routeKey);

  useEffect(() => {
    // Never on first mount. The browser has already placed focus and scrolled;
    // moving either on initial load fights it and steals focus from a reader
    // who is already somewhere else on the page.
    if (focusedRouteKey.current === routeKey) {
      return;
    }
    focusedRouteKey.current = routeKey;
    mainRef.current?.focus();
    window.scrollTo(0, 0);
  }, [routeKey]);

  return (
    <div className="reader-shell">
      <header className="reader-banner">
        {/*
          The first child of the banner, and therefore the first tab stop on
          the page. Anything placed above it would offer a keyboard reader
          something other than the edition as their first choice.

          It is not a way out of the edition. It moves focus to `main` — the
          landmark the edition is already inside — so it shortens the path to
          today's stories rather than leading away from them, which is why it
          does not contradict the footer's no-links rule (section 3.1).

          Not wrapped in `nav`. One same-document link is not a navigation
          region, and a `nav` here would advertise a set of destinations that
          does not exist. Inside the banner rather than above it, so every
          element on the page sits within a landmark and the placement needs no
          exception.
        */}
        <a className="skip-link edition-action" href={`#${EDITION_MAIN_ID}`}>
          Skip to the edition
        </a>

        <p className="brand-line">
          <BrandMark />
        </p>

        {/*
          The theme control belongs at the top, not at the end of the edition
          beside the interest picker. A reader needs a readable page on arrival
          rather than after ten stories, a reader who never reaches the end
          would never find it, and `InterestBoosts` lives inside `EditionView`,
          which renders only on `ready` — so a control placed there would be
          missing from the three load states where an unreadable page is most
          likely to be what sent the reader looking for it.

          Section 3.1 constrains content that continues the edition. A
          preference control is chrome: it changes colours and adds nothing to
          read. It sits after the skip link so the skip link stays the first
          tab stop.
        */}
        <ThemeChoice />
      </header>

      {/* tabIndex -1 makes the landmark a focus target on route change without
          putting it in the tab order. */}
      <main
        id={EDITION_MAIN_ID}
        className="reader-main"
        tabIndex={-1}
        aria-labelledby={EDITION_HEADING_ID}
        ref={mainRef}
      >
        {children}
      </main>

      {/* No links here. A footer link is a continuation surface, and the
          edition is meant to end (AGENTS.md section 3.1). */}
      <footer className="reader-footer">
        <p>Aaj, Bas. publishes one edition a day.</p>
      </footer>

      {/* Rendered on every render, including the first, so the region exists in
          the accessibility tree before any message lands in it; a live region
          inserted together with its text is not reliably announced. It carries
          short signals only — the edition itself is never live content. */}
      <p className="visually-hidden" role="status">
        {statusMessage}
      </p>
    </div>
  );
}
