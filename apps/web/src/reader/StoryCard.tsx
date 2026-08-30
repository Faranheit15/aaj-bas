/**
 * One story in the edition, collapsed by default and expanded on request.
 *
 * The disclosure is a `<button aria-expanded>` inside the headline, not
 * `<details>/<summary>`. Four reasons, and any one of them is enough:
 *
 * 1. `<summary>`'s content model would pull the whole collapsed card — ordinal,
 *    topic, headline, deck, source count, update marker — inside the summary,
 *    making the control's accessible name the entire card text. A screen-reader
 *    user moving by control would hear the card read out as a button label.
 * 2. Heading exposure inside `summary` is unreliable across screen readers, and
 *    the headline has to stay a real `h2` for the edition's outline to work.
 * 3. `details` is DOM-owned state. Recording "viewed" would mean mirroring DOM
 *    state back into React, which section 14 rules out.
 * 4. Chrome's find-in-page auto-expands a closed `details`. That would mark a
 *    story viewed without the reader ever having opened it, and viewed state is
 *    a record of a deliberate act.
 *
 * Viewed means expanded. There is no timer, no scroll observer, and no clock
 * read anywhere in this file: dwell time is behavioural measurement, which the
 * constitution's rule 4 and section 3.3 both refuse. The one `Date.parse` below
 * compares two contract timestamps with each other and reads no clock.
 *
 * Expansion state is local to the card. Nothing here closes another card, and
 * nothing here leads to the next one.
 */

import type { CorrectionNote, SourceReference, Story } from "@aaj-bas/schemas";
import type { JSX } from "react";
import { useId, useState } from "react";
import { formatEditionInstant } from "../edition/editorial-day";
import { reportIssueHref } from "./report-issue";
import {
  CONFIDENCE_LABELS,
  REPORTING_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  sourceCountLabel,
  TOPIC_LABELS,
  updateMarkerFor,
} from "./story-labels";

type StoryCardProps = {
  readonly story: Story;
  /** Already resolved, in `story.sourceIds` order. */
  readonly sources: readonly SourceReference[];
  /** Correction notes naming this story, and no others. */
  readonly corrections: readonly CorrectionNote[];
  /** 1-based. */
  readonly position: number;
  /**
   * How many cards are actually rendered, passed in rather than assumed.
   *
   * PRD section 5.1 promises ten stories, and `edition.stories.length` is the
   * core eight plus the interest pools. Hardcoding either would print an
   * ordinal that contradicts what is on the screen — today eight cards render,
   * because the two interest stories are AB-204's selection and do not exist
   * yet. "3 of 10" above a list that ends at eight is the product telling the
   * reader there is more, which is exactly the hidden backlog section 3.1 and
   * constitution rule 1 forbid.
   */
  readonly total: number;
  readonly editionDate: string;
  readonly onExpand: (storyId: string) => void;
};

export function StoryCard({
  story,
  sources,
  corrections,
  position,
  total,
  editionDate,
  onExpand,
}: StoryCardProps): JSX.Element {
  const [isExpanded, setExpanded] = useState(false);
  const panelId = useId();
  const reportNoteId = useId();

  const marker = updateMarkerFor(story, corrections);

  function toggle(): void {
    const willExpand = !isExpanded;
    setExpanded(willExpand);
    // Only on the way open. Viewed is monotonic: collapsing a card says
    // nothing about whether it was read, and reporting it would turn a record
    // of what the reader opened into a record of how they browsed.
    if (willExpand) {
      onExpand(story.id);
    }
  }

  return (
    // No `article` wrapper: the surrounding `ol`/`li` already announces "list
    // item, 3 of 8", and a second grouping role would say it twice.
    <div className={isExpanded ? "story-card is-expanded" : "story-card"}>
      <p className="story-kicker">
        <span className="story-ordinal">
          {position} of {total}
        </span>
        <span className="story-topic">{TOPIC_LABELS[story.topic]}</span>
      </p>

      <h2 className="story-headline">
        {/*
          `aria-controls` is set only while the panel exists. The panel is
          unmounted when collapsed, so a permanent IDREF would point at nothing
          — a dangling reference is worse than no reference, because assistive
          technology offering to jump to a missing element is a dead end.
          `aria-expanded` on a native button is what actually announces the
          state, and it is present in both states.
        */}
        <button
          type="button"
          className="story-toggle"
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? panelId : undefined}
          onClick={toggle}
        >
          {story.headline}
        </button>
      </h2>

      <p className="story-deck">{story.deck}</p>

      <p className="story-provenance">
        <span>{sourceCountLabel(story.sourceCount)}</span>
        {marker === null ? null : (
          <span className="story-marker">{marker}</span>
        )}
      </p>

      {isExpanded ? (
        <div className="story-panel" id={panelId}>
          {/*
            Labels first, ahead of the prose. PRD section 6.2 lists them at
            item 6, and this deviates deliberately: section 22 requires that
            opinion is not presented as reported fact, and a label that arrives
            after two paragraphs of factual-sounding text has already failed to
            do its job for the reader who stopped at the first paragraph.
          */}
          <p className="story-labels">
            <span className="story-label">
              Reporting type: {REPORTING_TYPE_LABELS[story.reportingType]}
            </span>
            <span className="story-label">
              {CONFIDENCE_LABELS[story.confidence]}
            </span>
          </p>

          <h3>What changed</h3>
          {story.whatChanged.map((paragraph) => (
            <p className="story-what-changed" key={paragraph}>
              {paragraph}
            </p>
          ))}

          <h3>Why it matters</h3>
          <p className="story-why-it-matters">{story.whyItMatters}</p>

          {story.background === undefined ? null : (
            <BackgroundDisclosure background={story.background} />
          )}

          {/*
            Rendered only when the story carries it. There is no placeholder
            and no "nothing is uncertain here" line: section 20 forbids
            inventing content to fill a layout, and a standing empty section
            would teach the reader to skip the one that matters.
          */}
          {story.uncertainty === undefined ? null : (
            <>
              <h3>What is uncertain</h3>
              <p className="story-uncertainty">{story.uncertainty}</p>
            </>
          )}

          <h3>Sources</h3>
          <ul className="story-sources">
            {sources.map((source) => (
              <li className="story-source" key={source.id}>
                {/*
                  Publisher before title, so the link's accessible name carries
                  the attribution. A screen-reader user listing the links on an
                  expanded edition otherwise hears twenty headlines and no idea
                  who published any of them.

                  No `target="_blank"`: opening a new window that the reader did
                  not ask for needs a programmatically determinable warning on
                  every link (WCAG techniques H83/G200), and twenty "opens in a
                  new window" labels is the visual and aural clutter section 28
                  exists to prevent. Middle-click and the context menu still
                  work for readers who want a tab.

                  `rel="noopener"` and nothing else. Not `noreferrer`: stripping
                  the referrer hides from a publisher that we sent them a
                  reader, and these links exist to credit them. Not `nofollow`
                  or `ugc`: these are reviewed citations the story rests on, not
                  untrusted submissions.
                */}
                <a
                  className="story-source-link"
                  href={source.url}
                  rel="noopener"
                >
                  <span className="story-source-publisher">
                    {source.publisher}
                  </span>
                  <span className="story-source-title">{source.title}</span>
                </a>
                <p className="story-source-meta">
                  <span className="story-source-type">
                    {SOURCE_TYPE_LABELS[source.sourceType]}
                  </span>
                  {/* `datetime` carries the raw contract value; the text
                      carries the editorial-timezone rendering of it. */}
                  <time dateTime={source.publishedAt}>
                    {formatEditionInstant(source.publishedAt)}
                  </time>
                </p>
                {source.authors === undefined ||
                source.authors.length === 0 ? null : (
                  <p className="story-source-authors">
                    By {source.authors.join(", ")}
                  </p>
                )}
                {source.attribution === undefined ? null : (
                  <p className="story-source-attribution">
                    {source.attribution}
                  </p>
                )}
                {source.termsUrl === undefined &&
                source.licenseUrl === undefined ? null : (
                  <p className="story-source-policy">
                    {source.termsUrl === undefined ? null : (
                      <a href={source.termsUrl} rel="noopener">
                        Reuse terms
                      </a>
                    )}
                    {source.licenseUrl === undefined ? null : (
                      <a href={source.licenseUrl} rel="noopener">
                        Licence
                      </a>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <p className="story-metadata">
            <span>
              First published{" "}
              <time dateTime={story.firstPublishedAt}>
                {formatEditionInstant(story.firstPublishedAt)}
              </time>
            </span>
            {/* Compared as instants, not as strings: two timestamps written in
                different offsets can be the same moment and still sort in the
                wrong order as text. */}
            {Date.parse(story.updatedAt) >
            Date.parse(story.firstPublishedAt) ? (
              <span>
                Updated{" "}
                <time dateTime={story.updatedAt}>
                  {formatEditionInstant(story.updatedAt)}
                </time>
              </span>
            ) : null}
            <span className="story-provenance-note">
              {provenanceSentence(story)}
            </span>
          </p>

          {/*
            Corrections are additive and visible, per section 46. Only the
            summary is shown in this slice; `detail` is not rendered anywhere
            yet, so nothing here claims to be the full correction record.
          */}
          {corrections.map((note) => (
            <p className="story-correction" key={note.id}>
              Correction,{" "}
              <time dateTime={note.correctedAt}>
                {formatEditionInstant(note.correctedAt)}
              </time>
              . {note.summary}
            </p>
          ))}

          {/*
            Last, and a real link. The destination is a prefilled issue on the
            repository, decided by the maintainer; the same `rel` reasoning as
            the source links applies.

            The destination is named in the link text, not left to the URL.
            "Report an issue with this story" reads like a form belonging to
            this product; it is in fact a third-party site, and a reader
            deciding whether to click is entitled to know that before they do.
            A screen-reader user listing the page's links hears the name and
            nothing else, which is the case that decides the wording.

            The line under it states the two things a reader would otherwise
            discover only after arriving: an issue is public, and it is filed
            under their own account. Said once, plainly, and not as a warning
            — a reader telling us we got something wrong is what section 46's
            correction record depends on, and the wording should not talk them
            out of it. `aria-describedby` rather than loose adjacent text, so
            it reaches whoever lands on the link directly rather than only the
            reader who happens to read downward.
          */}
          <a
            className="story-report"
            href={reportIssueHref(editionDate, story)}
            rel="noopener"
            aria-describedby={reportNoteId}
          >
            Report an issue on GitHub
          </a>
          <p className="story-report-note" id={reportNoteId}>
            Issues are public, and posted under your own GitHub account.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Background, collapsed by default, using the same disclosure pattern as the
 * card itself.
 *
 * Its own component so that its state lives and dies with the panel: when the
 * card collapses, this unmounts and the background is closed again on the next
 * expand. That is intentional. Remembering which sub-sections a reader opened
 * would be per-card reading history kept for no reader-facing purpose, and the
 * cost of re-opening it is one keystroke.
 */
function BackgroundDisclosure({
  background,
}: {
  readonly background: string;
}): JSX.Element {
  const [isOpen, setOpen] = useState(false);
  const panelId = useId();

  return (
    <>
      <h3>
        <button
          type="button"
          className="story-background-toggle"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          onClick={() => setOpen(!isOpen)}
        >
          Background
        </button>
      </h3>
      {isOpen ? (
        <p className="story-background" id={panelId}>
          {background}
        </p>
      ) : null}
    </>
  );
}

/**
 * Who wrote the summary and whether a human checked it.
 *
 * All four combinations say something, including the two that are unflattering.
 * Section 20 requires generated content to degrade honestly, and an unreviewed
 * summary that says nothing about its review status is the case where the
 * sentence matters most.
 */
function provenanceSentence(story: Story): string {
  if (story.generatedBy !== undefined) {
    return story.reviewed
      ? `Summary generated by ${story.generatedBy} and reviewed before publication.`
      : `Summary generated by ${story.generatedBy}. Not reviewed.`;
  }

  return story.reviewed
    ? "Written and reviewed by an editor."
    : "Written by an editor. Not reviewed.";
}
