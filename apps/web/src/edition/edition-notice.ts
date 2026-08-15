/**
 * The one sentence that tells a reader what they are looking at.
 *
 * Two independent facts meet here and nowhere else.
 *
 * `EditionFreshness` answers "what day is this edition, relative to today". It
 * is a pure function of two dates and stays computable with no network at all,
 * because it reads the device's calendar rather than a server's.
 *
 * `EditionSource` answers "where did these bytes come from". That is a fact
 * about the response, not about the reader: whether they have signal, whether
 * an airline portal is answering their requests, and whether they think of
 * themselves as offline are all unknown here and stay unsaid.
 *
 * Composed rather than collapsed. A single "offline" state would have to choose
 * one of the two questions to answer and would get the other wrong — most
 * visibly for a reader holding a saved copy OF TODAY'S edition, whom a
 * collapsed model tells they are looking at something out of date when they are
 * not.
 *
 * The return value is structured rather than formatted, so the component can
 * render the instant inside a `<time>` exactly as it already renders
 * `publishedAt`. A pre-formatted string would put a date in front of a screen
 * reader with no machine-readable value beside it.
 *
 * WORDS THAT MAY NOT APPEAR HERE, each for its own reason:
 *
 * - "You are offline" / "You appear to be offline" — a claim about the reader's
 *   device that this module cannot support. It is correct on `EditionUnavailable`,
 *   where nothing was cached and the failure IS the reader's connection, and it
 *   stays there; it is wrong here, where an edition is on the screen.
 * - "Check your connection" — makes the reader responsible for our fetch.
 * - "Reconnect to see the latest" — nagging, and an instruction to go and do
 *   something before reading today's news (section 3.2).
 * - "Offline mode", a badge, an icon — section 25 forbids information carried by
 *   colour or icon alone, and a mode is a state to exit rather than a fact.
 * - "Some content may be missing" — false. A cached edition is the whole file;
 *   it validated before it was stored and it validated again before this render.
 * - "Showing cached content" — jargon for a cache the reader never asked for.
 * - "Last updated" — the edition already carries `updatedAt`, which is when the
 *   PUBLISHER changed it. Two "updated" times on one page mean neither is read.
 * - "Update available", or any toast — an interruption offering a task.
 *
 * There is deliberately no refresh control anywhere near this notice. PRD
 * section 8 excludes pull-to-refresh and user-triggered fetching from v1, and
 * "Try again" belongs to `EditionUnavailable`, where there is nothing on screen
 * to lose by retrying.
 */
import type { EditionFreshness } from "./edition-freshness";
import type { EditionSource } from "./edition-repository";

export type EditionNotice = {
  readonly text: string;
  /** The instant to render as "Downloaded …", or null when it is not known. */
  readonly copyDate: string | null;
};

export function editionNotice(
  freshness: EditionFreshness,
  source: EditionSource,
  copyDate: string | null,
): EditionNotice | null {
  const text = noticeText(freshness, source);
  if (text === null) {
    return null;
  }

  // Carried only for a saved copy. "Downloaded" beside an edition fetched a
  // moment ago tells the reader nothing they could act on and invites them to
  // read it as the publication time, which is the line directly below.
  return { text, copyDate: source === "cache" ? copyDate : null };
}

/**
 * The copy table, one row per freshness, network first then cache.
 *
 * Written as pairs rather than as two separate tables, because the pairs are
 * where the mistakes are: the two `stale` strings look interchangeable and are
 * not, and the two `current` cells differ by a whole notice.
 */
function noticeText(
  freshness: EditionFreshness,
  source: EditionSource,
): string | null {
  switch (freshness) {
    case "current":
      // Nothing to say about today's edition fetched now; a notice there would
      // be a line every reader reads every day for no information. A saved copy
      // of today's edition is still named as today's, because it is — the date
      // is what makes an edition today's, and calling it out of date for having
      // been cached would be a false statement about the content.
      return source === "cache"
        ? "This is today's edition, saved on this device."
        : null;

    case "stale":
      /*
        THE TWO STRINGS ARE NOT INTERCHANGEABLE, and copying the first into the
        second is the mistake this comment exists to prevent.

        Online, `stale` means the pointer we just fetched still names an older
        day. That is direct evidence about published content and licenses
        "Today's edition is not published yet."

        From a cache we fetched no pointer at all. We know only that the newest
        copy this device holds is old; today's edition may well have been
        published an hour ago. Reusing the online sentence would make a claim
        about published content on no evidence, which sections 22 and 37 both
        forbid.
      */
      return source === "cache"
        ? "This is the most recent edition saved on this device. It is not today's edition."
        : "Today's edition is not published yet. This is the most recent edition.";

    case "archived":
      // The reader asked for this date, so the saved-copy clause is the only
      // thing the cache adds; being past is what they already know.
      return source === "cache"
        ? "This is a past edition, saved on this device."
        : "This is a past edition.";

    default: {
      const unreachable: never = freshness;

      return unreachable;
    }
  }
}
