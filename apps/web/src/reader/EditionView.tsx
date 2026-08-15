/**
 * A published edition, rendered.
 *
 * Reads no clock and fetches nothing. "Is this edition current?" is a question
 * about today's date, which belongs to the edition layer; this component is
 * handed the answer as `freshness` so that every freshness case can be
 * rendered in a test without moving a clock.
 *
 * The state it holds is edition-wide, which is why it lives here rather than in
 * the cards: which stories the reader has expanded, whether they have ended the
 * edition, and which interest boosts they have chosen. The first two become
 * visible in the counter above the list and the ending block below it; the
 * third decides which two of the ten stories the list is built from.
 */

import type { Edition } from "@aaj-bas/schemas";
import type { JSX } from "react";
import { editionStories } from "../edition/edition-stories";
import type { EditionFreshness } from "../edition/edition-freshness";
import { editionNotice } from "../edition/edition-notice";
import type { EditionSource } from "../edition/edition-repository";
import {
  formatEditionDate,
  formatEditionInstant,
} from "../edition/editorial-day";
import { storySources } from "../edition/story-sources";
import { EditionEnding } from "./EditionEnding";
import { useEditionEnded } from "./edition-ended";
import {
  editionProgress,
  isEditionOver,
  progressText,
} from "./edition-progress";
import { InterestBoosts } from "./InterestBoosts";
import { useInterests, useInterestSnapshot } from "./interests";
import { EDITION_HEADING_ID } from "./ReaderShell";
import { StoryCard } from "./StoryCard";
import { useViewedStories } from "./viewed-stories";

/**
 * PRD section 7.1: invite "after the reader expands two stories or reaches the
 * end". Two, not one: a single expand is not yet evidence the reader is using
 * the product, and asking on arrival is what section 7.1 explicitly forbids.
 */
const INVITATION_AFTER_VIEWED = 2;

type EditionViewProps = {
  readonly edition: Edition;
  readonly freshness: EditionFreshness;
  /**
   * Where the bytes on screen came from.
   *
   * Required rather than defaulted to `"network"`, and the two new props are
   * spelled at every call site for that reason: a default would mean a caller
   * that forgot them shows a saved copy with no notice at all, which is the
   * one failure section 26 names — cached content presented as if it were
   * known to be current — arriving silently and passing every test.
   */
  readonly source: EditionSource;
  /** When that copy was downloaded, or null when the response did not say. */
  readonly copyDate: string | null;
};

export function EditionView({
  edition,
  freshness,
  source,
  copyDate,
}: EditionViewProps): JSX.Element {
  // Composed in one pure function so that the six combinations of freshness and
  // source can be read as a table rather than reconstructed from this JSX.
  const notice = editionNotice(freshness, source, copyDate);

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
    The reader's stored answer, in two forms, and they are deliberately not the
    same value.

    `interests.read` is live: the picker below must show what the reader just
    chose. `composition` is a SNAPSHOT taken when this edition was opened, and
    it is what the story list is built from. Saving a choice therefore changes
    the picker and nothing else on the page.

    That separation is the whole defence against the worst version of this
    feature. If a save recomposed the edition in view, the list would change
    under a reader who has already read part of it, the counter's denominator
    would move, and the ending message could flip from "That's today's edition."
    back to unfinished — which is "two more stories unlocked" delivered as a
    mechanic, whatever the copy called it (section 3.2). The picker's own words
    promise the choice applies to the next edition opened, and this is what
    makes that sentence true rather than merely written.
  */
  const interests = useInterests();
  const composition = useInterestSnapshot(edition.date);

  /*
    `editionStories`, not `edition.stories`. The file holds the eight shared
    core stories plus the interest pools, so mapping `edition.stories` would
    hand every reader the whole pool — a longer edition than the product
    promises, assembled by accident.

    Ten for everyone. Interests decide WHICH two pooled stories arrive, never
    HOW MANY: a reader who has chosen nothing gets the same ten, picked by the
    same function with an empty set. Eight-until-you-choose would make the
    invitation below a prompt whose payoff is more content, which is an
    engagement reward (section 3.2) and would make its copy impossible to write
    honestly. ADR-0008 records the argument.

    Resolved once, and its length is what the cards count against. Neither a
    hardcoded ten nor `edition.stories.length` would do: the first prints an
    ordinal that contradicts the list the reader can see, and the second counts
    the entire pool, so an edition shipping a larger pool would start numbering
    the eighth card "8 of 14".
  */
  const stories = editionStories(edition, composition);

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

      {notice === null ? null : (
        <p className="edition-notice">
          {notice.text}
          {notice.copyDate === null ? null : (
            <>
              {" "}
              {/* A second, separate instant from the publication line below,
                  and the two must never be conflated: one is when the
                  PUBLISHER issued this edition, the other is when THIS DEVICE
                  received the copy being read. Each carries its own machine
                  value. */}
              Downloaded{" "}
              <time dateTime={notice.copyDate}>
                {formatEditionInstant(notice.copyDate)}
              </time>
              .
            </>
          )}
        </p>
      )}

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
        The interest picker sits BETWEEN the list and the ending, and the
        position is argued rather than convenient.

        Not inside the ending block: that block's contract is "the edition is
        over", so anything placed there is post-completion content, and a
        solicitation beside "See you tomorrow." is a return hook. Not after it
        either — that is section 3.1 in the plainest possible terms, and the
        ending must stay the last thing in `main`. Not above the list, which
        would put a form between the reader and the news.

        Here, it is out of sight while the reader is reading. The trigger fires
        around the second card; the block renders below the tenth. Nothing above
        the reader's position changes and nothing reflows into view — the reader
        meets the question when they arrive at it, at their own pace, or never.

        `freshness !== "archived"` for the same reason `endingCopy` says nothing
        about tomorrow on a past edition: a reader who deliberately opened an
        old date came for that date, and a prompt about future editions there is
        a nudge to come back rather than an answer to what they asked for.
      */}
      <InterestBoosts
        read={interests.read}
        canInvite={
          freshness !== "archived" &&
          (progress.viewedCount >= INVITATION_AFTER_VIEWED ||
            isEditionOver(progress, ended.hasEnded))
        }
        onChoose={interests.chooseInterests}
      />

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
