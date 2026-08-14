/**
 * A published edition, rendered.
 *
 * Reads no clock and fetches nothing. "Is this edition current?" is a question
 * about today's date, which belongs to the edition layer; this component is
 * handed the answer as `freshness` so that every freshness case can be
 * rendered in a test without moving a clock.
 *
 * The two pieces of state it holds are which stories the reader has expanded
 * and whether they have ended the edition. Both live here rather than in the
 * cards because both are edition-wide: the counter above the list and the
 * ending block below it are where they become visible.
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
import { EditionEnding } from "./EditionEnding";
import { useEditionEnded } from "./edition-ended";
import { editionProgress, progressText } from "./edition-progress";
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

    Nothing on the card itself changes when a story is marked. That is
    deliberate: PRD section 6.1 lists no viewed marker on a card, and a per-card
    "Viewed" badge would imply "unviewed" on every other card, which turns a
    finite edition into a checklist to clear — the accumulating obligation
    section 3.5 rules out. What the set feeds instead is the one summary line
    below, which counts the edition rather than scoring the cards.
  */
  const { viewed, markViewed } = useViewedStories(edition.date);

  // Ending is a fact about this edition alone, keyed by its date, so it says
  // nothing about yesterday's and accumulates into nothing.
  const ended = useEditionEnded(edition.date);

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

  /*
    One binding, read by the cards' ordinals and by the counter alike. The
    denominator is a promise about what is on the page, and two independently
    derived denominators are two chances to make different promises: "3 of 10
    viewed" over a list whose last card says "8 of 8" tells the reader two
    stories exist somewhere they cannot reach.
  */
  const total = stories.length;

  // Counted against the stories actually rendered, not against the size of the
  // stored set: from AB-204 the device can hold ids for pool stories this
  // render does not include, and `.size` would print a number larger than the
  // list.
  const progress = editionProgress(stories, viewed.storyIds);

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
        Rendered from zero, before the reader has expanded anything. A counter
        that appeared on the first expand would be a thing the reader made
        happen — a micro-reward, and a number whose first appearance reads as a
        score. Present from the start it reads as what it is: the size of the
        edition, stated once, which is also the reassurance that this list ends.

        A sentence, never a bar. There is no percentage, no `role="progressbar"`
        and no `aria-valuenow` anywhere: a bar is a thing to fill, and a filling
        bar is a reward waiting to be collected (section 3.2). It is also not in
        a live region — the count changing under a reader who just opened a
        story is not news, and announcing it would turn expanding a card into a
        scored event.
      */}
      <p className="edition-progress">{progressText(progress)}</p>

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
              total={total}
              editionDate={edition.date}
              onExpand={markViewed}
            />
          </li>
        ))}
      </ol>

      {/*
        The end of the edition, after the list and inside `main`. It is the last
        thing in the document flow before the shell's footer, and it stays that
        way: anything that continues the edition — more stories, related
        reading, a next-edition link — is ruled out by AGENTS.md section 3.1.
        `EditionEnding` names the full list of what may never follow it.
      */}
      <EditionEnding
        freshness={freshness}
        progress={progress}
        hasEnded={ended.hasEnded}
        onEnd={ended.endEdition}
      />
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
