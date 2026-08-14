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

/**
 * The id every view's `h1` must carry.
 *
 * Exported rather than written twice: `main` is labelled by this id, so a view
 * that spelled it differently would leave the main landmark unnamed, and
 * nothing but a screen reader would notice.
 */
export const EDITION_HEADING_ID = "edition-heading";

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
        <p className="brand-line">
          <BrandMark />
        </p>
      </header>

      {/* tabIndex -1 makes the landmark a focus target on route change without
          putting it in the tab order. */}
      <main
        id="edition"
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
