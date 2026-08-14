/**
 * A published edition, rendered.
 *
 * Pure by construction: it reads no clock, fetches nothing, and holds no state.
 * "Is this edition current?" is a question about today's date, which belongs to
 * the edition layer; this component is handed the answer as `freshness` so that
 * every freshness case can be rendered in a test without moving a clock.
 */
import type { JSX } from "react";
import type { Edition } from "@aaj-bas/schemas";
import { coreStories } from "../edition/core-stories";
import type { EditionFreshness } from "../edition/edition-freshness";
import {
  formatEditionDate,
  formatEditionInstant,
} from "../edition/editorial-day";
import { EDITION_HEADING_ID } from "./ReaderShell";

type EditionViewProps = {
  readonly edition: Edition;
  readonly freshness: EditionFreshness;
};

export function EditionView({
  edition,
  freshness,
}: EditionViewProps): JSX.Element {
  const notice = noticeFor(freshness);

  // Compared as instants, not as strings: two timestamps in different offsets
  // can be the same moment while sorting in the wrong order as text.
  const wasUpdated =
    Date.parse(edition.updatedAt) > Date.parse(edition.publishedAt);

  return (
    <>
      {/* `datetime` carries the raw contract value; the text carries the
          reader-facing rendering of it. */}
      <h1 id={EDITION_HEADING_ID}>
        Edition of{" "}
        <time dateTime={edition.date}>{formatEditionDate(edition.date)}</time>
      </h1>

      {notice === null ? null : <p className="edition-notice">{notice}</p>}

      <p className="edition-freshness">
        Published{" "}
        <time dateTime={edition.publishedAt}>
          {formatEditionInstant(edition.publishedAt)}
        </time>
        .
        {wasUpdated ? (
          <>
            {" "}
            Updated{" "}
            <time dateTime={edition.updatedAt}>
              {formatEditionInstant(edition.updatedAt)}
            </time>
            .
          </>
        ) : null}
      </p>

      {/*
        `coreStories`, not `edition.stories`. The file holds the eight shared
        core stories plus the interest pools, so mapping `edition.stories` would
        hand every reader all ten — silently making the pool selection AB-204
        owns, and doing it by ignoring the reader's interests rather than by
        applying them. Eight is the whole edition until AB-204 lands.
      */}
      <ol className="edition-stories">
        {coreStories(edition).map((story) => (
          // AB-202 replaces this `h2` with `StoryCard`, which adds the deck,
          // what changed, why it matters, the labels, and the source list. The
          // `li` and its heading level are the seam; nothing else here is.
          <li className="edition-story" key={story.id}>
            <h2>{story.headline}</h2>
          </li>
        ))}
      </ol>

      {/*
        AB-203's ending block goes here, after the list and inside `main`: the
        completion message and the end-edition control. Nothing else may go
        here. Anything that continues the edition — more stories, related
        reading, a next-edition link — is ruled out by AGENTS.md section 3.1.
      */}
    </>
  );
}

/** The one sentence that tells a reader this is not today's edition. */
function noticeFor(freshness: EditionFreshness): string | null {
  switch (freshness) {
    case "current":
      return null;
    case "stale":
      return "Today's edition is not published yet. This is the most recent edition.";
    case "archived":
      return "This is a past edition.";
  }
}
