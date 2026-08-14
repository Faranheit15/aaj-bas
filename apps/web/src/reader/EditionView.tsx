/**
 * A published edition, rendered.
 *
 * Reads no clock and fetches nothing. "Is this edition current?" is a question
 * about today's date, which belongs to the edition layer; this component is
 * handed the answer as `freshness` so that every freshness case can be
 * rendered in a test without moving a clock.
 *
 * The one piece of state it holds is which stories the reader has expanded.
 * That lives here rather than in the cards because it is edition-wide: AB-203's
 * ending block, which goes below this list, is the place it becomes visible.
 */

import type { Edition } from "@aaj-bas/schemas";
import type { JSX } from "react";
import { coreStories } from "../edition/core-stories";
import type { EditionFreshness } from "../edition/edition-freshness";
import {
  formatEditionDate,
  formatEditionInstant,
} from "../edition/editorial-day";
import { storySources } from "../edition/story-sources";
import { EDITION_HEADING_ID } from "./ReaderShell";
import { StoryCard } from "./StoryCard";
import { useViewedStories } from "./viewed-stories";

type EditionViewProps = {
  readonly edition: Edition;
  readonly freshness: EditionFreshness;
};

export function EditionView({
  edition,
  freshness,
}: EditionViewProps): JSX.Element {
  const notice = noticeFor(freshness);

  /*
    The viewed store sits above the list, and only `markViewed` goes down.
    A card handed the whole store would be a UI component holding assumptions
    about where reading state is kept, which section 15 puts behind a narrow
    boundary; a card that can only say "this one was expanded" cannot grow one.

    Nothing on screen changes when a story is marked. That is deliberate, not
    an unfinished wire-up: PRD section 6.1 lists no viewed marker on a card, and
    a per-card "Viewed" badge would imply "unviewed" on every other card, which
    turns a finite edition into a checklist to clear — the accumulating
    obligation section 3.5 rules out. AB-203's "6 of 10 viewed" summary, shown
    once at the end where the reader is already leaving, is where this surfaces.
    Until then the store is written and deliberately not read.
  */
  const viewed = useViewedStories(edition.date);

  /*
    `coreStories`, not `edition.stories`. The file holds the eight shared core
    stories plus the interest pools, so mapping `edition.stories` would hand
    every reader all ten — silently making the pool selection AB-204 owns, and
    doing it by ignoring the reader's interests rather than by applying them.
    Eight is the whole edition until AB-204 lands.

    Resolved once, and its length is what the cards count against. Neither a
    hardcoded ten nor `edition.stories.length` would do: the first prints an
    ordinal that contradicts the list the reader can see, and the second is ten
    today only because the pools happen to hold two, so an edition shipping a
    larger pool would start numbering the eighth card "8 of 14".
  */
  const stories = coreStories(edition);

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

      <ol className="edition-stories">
        {stories.map((story, index) => (
          <li className="edition-story" key={story.id}>
            <StoryCard
              story={story}
              // Resolved here rather than inside the card: the flat edition-wide
              // `sources` array is a fact about the file format, and the card's
              // job is to render a story's provenance, not to look it up.
              sources={storySources(story, edition)}
              corrections={edition.correctionNotes.filter(
                (note) => note.storyId === story.id,
              )}
              position={index + 1}
              total={stories.length}
              editionDate={edition.date}
              onExpand={viewed.markViewed}
            />
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
